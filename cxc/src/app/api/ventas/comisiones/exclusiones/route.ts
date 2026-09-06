/**
 * Clientes por los que UN vendedor no comisiona — configuración, SOLO admin.
 *
 * 🩸 Daniel, 3-sep-2026, textual: «crea configuración en comisiones para
 * desactivar cálculos de clientes». Grano «cliente vendedor»; aplica a venta y
 * cobro: «correcto, también venta».
 *
 *   GET    → { exclusiones: ExclusionActiva[], vendedores: { [empresa]: string[] } }
 *            (las activas de las 6 empresas + los vendedores que se pueden elegir)
 *   POST   → { empresa_key | empresa_keys[], cliente_codigo, vendedor,
 *              excluye_venta?, excluye_cobro? } → 201 { id, ids, creadas, ya_estaban }
 *            (las casillas ausentes valen true; las dos apagadas es 400.
 *             Con varias empresas se escribe UNA FILA POR EMPRESA y la que ya
 *             existía no tira a las demás — se devuelve en `ya_estaban`)
 *   PATCH  → ?id= { excluye_venta, excluye_cobro } → cambia las casillas de una fila activa
 *   DELETE → ?id= → soft delete (activa = false, firmado). NUNCA borra la fila.
 *
 * Fail-closed: cualquier cuerpo raro es 400 con texto para la pantalla; un
 * error de base es 5xx, nunca un «ok» a medias. Quien resta de verdad es la
 * RPC comision_b2b_v8 — esta ruta solo administra la lista.
 *
 * Los vendedores que se ofrecen por empresa son los que DE VERDAD aparecen en
 * facturas y recibos del año (más el maestro y las tasas): una exclusión con
 * un nombre que no existe en Switch no atraparía nada. Cada nombre pasa por el
 * ALIAS (comision_vendedor_alias, 3-sep-2026 noche: «una persona, una fila»),
 * así que las grafías REINALDO / REYNALDO / REINDALDO se ofrecen como UNA sola,
 * «REYNALDO ESPINOSA». Antes de eso aparecía también
 * maestro `vendedores` no conoce.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { EMPRESAS_COMISIONAN } from "@/lib/comisiones/empresas";
import { normalizarVendedor, validarCasillas, validarExclusionesNuevas } from "@/lib/comisiones/exclusiones";
import { aplicarAlias, type AliasVendedor } from "@/lib/comisiones/alias";
import { estaRetirado, AVISO_VENDEDOR_RETIRADO } from "@/lib/comisiones/retirados";
import {
  agregarExclusion,
  cambiarCasillasExclusion,
  desactivarExclusion,
  leerAliasOVacio,
  leerExclusionesActivas,
} from "@/lib/comisiones/exclusiones-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { hoyPanama } from "@/lib/fecha-panama";

export const dynamic = "force-dynamic";

const SOLO_ADMIN = ["admin"];

/** Nombres de vendedor vistos en UNA columna de UNA tabla este año, por empresa. */
async function vistosEn(
  tabla: "switch_facturas" | "switch_recibos",
  columna: "vendedor_nombre" | "vendedor_registro",
  desde: string,
): Promise<{ empresa_key: string; nombre: string | null }[]> {
  const filas = await leerTodoPaginado<Record<string, string | null>>(
    `${tabla}.${columna}`,
    (pedirCount, a, b) =>
      supabaseServer
        .from(tabla)
        .select(`empresa_key, ${columna}`, pedirCount ? { count: "exact" } : undefined)
        .in("empresa_key", EMPRESAS_COMISIONAN as readonly string[])
        .gte("fecha", desde)
        .order("id", { ascending: true })
        .range(a, b),
  );
  return filas.map((f) => ({ empresa_key: String(f.empresa_key), nombre: f[columna] ?? null }));
}

/** Los vendedores que se pueden elegir por empresa: maestro ∪ tasas ∪ vistos este año,
 *  cada nombre pasado por el alias (una persona, una opción). */
async function vendedoresPorEmpresa(alias: readonly AliasVendedor[]): Promise<Record<string, string[]>> {
  const desde = `${hoyPanama().slice(0, 4)}-01-01`;
  const [maestro, tasas, enFacturas, enRecibos] = await Promise.all([
    supabaseServer.from("vendedores").select("empresa_key, nombre").eq("activo", true),
    supabaseServer.from("comision_vendedor_tasa").select("vendedor_nombre").eq("activo", true),
    vistosEn("switch_facturas", "vendedor_nombre", desde),
    vistosEn("switch_recibos", "vendedor_registro", desde),
  ]);
  if (maestro.error) throw new Error(`vendedores: ${maestro.error.message}`);
  if (tasas.error) throw new Error(`comision_vendedor_tasa: ${tasas.error.message}`);

  const por = new Map<string, Set<string>>(EMPRESAS_COMISIONAN.map((e) => [e, new Set<string>()]));
  const meter = (empresa: string, nombre: string | null | undefined) => {
    const n = normalizarVendedor(aplicarAlias(nombre, alias));
    // Los retirados de Comisiones (Aguas) no se ofrecen: no existen en ninguna tabla.
    if (n && !estaRetirado(n)) por.get(empresa)?.add(n);
  };
  for (const v of (maestro.data ?? []) as { empresa_key: string; nombre: string }[]) meter(v.empresa_key, v.nombre);
  for (const e of EMPRESAS_COMISIONAN) {
    for (const t of (tasas.data ?? []) as { vendedor_nombre: string }[]) meter(e, t.vendedor_nombre);
  }
  for (const f of enFacturas) meter(f.empresa_key, f.nombre);
  for (const r of enRecibos) meter(r.empresa_key, r.nombre);

  return Object.fromEntries([...por].map(([e, set]) => [e, [...set].sort((a, b) => a.localeCompare(b))]));
}

export async function GET(req: NextRequest) {
  const auth = requireRole(req, SOLO_ADMIN);
  if (auth instanceof NextResponse) return auth;

  try {
    const alias = await leerAliasOVacio();
    const [exclusiones, vendedores] = await Promise.all([
      leerExclusionesActivas(EMPRESAS_COMISIONAN),
      vendedoresPorEmpresa(alias),
    ]);
    return NextResponse.json({ exclusiones, vendedores });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Tabla todavía sin crear (DDL pendiente): que la pantalla lo diga.
    if (/comision_exclusion/.test(msg) && /does not exist|PGRST205|schema cache/i.test(msg)) {
      return NextResponse.json({ error: "Falta correr la migración de comision_exclusion" }, { status: 503 });
    }
    return NextResponse.json({ error: "No se pudo cargar la lista. Intenta de nuevo en unos segundos." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, SOLO_ADMIN);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  // 🔴 UNA DECISIÓN, VARIAS EMPRESAS (6-sep-2026). El cuerpo puede traer
  // `empresa_keys: []` — y sigue aceptando el `empresa_key` de siempre. Son N
  // filas independientes: el grano de la tabla no cambia.
  const v = validarExclusionesNuevas(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  // El vendedor se guarda como PERSONA (alias), no como grafía: así una
  // exclusión cargada con «REINALDO» atrapa también lo que Switch registre
  // como «REYNALDO». La base lo vuelve a hacer con su trigger; esto es para
  // que el 409 de «ya está» salga con el nombre correcto.
  const alias = await leerAliasOVacio();
  const valores = v.valor.map((x) => ({
    ...x,
    vendedor: normalizarVendedor(aplicarAlias(x.vendedor, alias)),
  }));
  // Un retirado (Aguas) no existe en Comisiones: no se le carga una exclusión.
  if (valores.some((x) => estaRetirado(x.vendedor))) {
    return NextResponse.json({ error: AVISO_VENDEDOR_RETIRADO }, { status: 400 });
  }

  const quien = auth.userName ?? auth.userId ?? "admin";
  const ids: number[] = [];
  const yaEstaban: string[] = [];
  for (const valor of valores) {
    const r = await agregarExclusion(valor, quien);
    if (r.ok) { ids.push(r.id); continue; }
    // 🔴 QUE UNA EMPRESA YA LO TENGA NO TIRA LAS OTRAS. Es justo el caso que
    // este cambio viene a resolver: D-104 ya estaba en dos empresas por dos
    // altas separadas. Cualquier OTRO error sí corta — no se escribe «más o
    // menos».
    if (r.status === 409) { yaEstaban.push(valor.empresa_key); continue; }
    return NextResponse.json({ error: r.error }, { status: r.status });
  }
  if (ids.length === 0) {
    return NextResponse.json(
      { error: "Ese cliente ya está en la lista de ese vendedor en las empresas que elegiste" },
      { status: 409 },
    );
  }
  return NextResponse.json(
    { ok: true, id: ids[0], ids, creadas: ids.length, ya_estaban: yaEstaban },
    { status: 201 },
  );
}

export async function PATCH(req: NextRequest) {
  const auth = requireRole(req, SOLO_ADMIN);
  if (auth instanceof NextResponse) return auth;

  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Falta el id de la fila" }, { status: 400 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const v = validarCasillas(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const r = await cambiarCasillasExclusion(id, v.valor);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const auth = requireRole(req, SOLO_ADMIN);
  if (auth instanceof NextResponse) return auth;

  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Falta el id de la fila" }, { status: 400 });
  }
  const r = await desactivarExclusion(id, auth.userName ?? auth.userId ?? "admin");
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true });
}
