/**
 * Los DESCUENTOS de comisión — el catálogo, no la excepción de un mes.
 *
 * 🩸 POR QUÉ EXISTE (6-sep-2026). Hasta hoy `comision_descuentos_fijos` no
 * tenía POST, ni PUT, ni DELETE en NINGUNA parte de la aplicación: las dos
 * filas vivas se escribieron directo en la base y solo asomaban dentro del
 * modal de detalle de un vendedor. O sea: **la palanca que más plata mueve del
 * módulo —$14.157,72 en 2026, más que toda la comisión de Edwin en el año— era
 * la única que no se podía ver ni administrar desde el sistema.** Daniel:
 * «sí, minimalista».
 *
 *   GET    → { descuentos: DescuentoFila[] }  (los ACTIVOS de las 6 empresas)
 *   POST   → { vendedor_nombre, empresa_key, concepto, monto, desde?, hasta? } → 201 { id }
 *   PATCH  → ?id= { monto?, desde?, hasta?, concepto? }
 *   DELETE → ?id= → soft delete (`activo = false`). 🔴 NUNCA borra la fila.
 *
 * SOLO ADMIN, igual que «Tasas por vendedor» y «Clientes que no comisionan».
 * La excepción por mes (prender/apagar un descuento en un mes suelto) sigue
 * viviendo en `/api/ventas/comisiones/descuentos`, que es otra cosa y otra
 * lista de roles.
 *
 * Quien RESTA de verdad sigue siendo `netearComisiones` en el servidor, una
 * sola vez: esta ruta solo administra el catálogo.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { EMPRESAS_COMISIONAN } from "@/lib/comisiones/empresas";
import { validarVigencia } from "@/lib/comisiones/vigencia";
import { normalizarVendedor } from "@/lib/comisiones/exclusiones";
import { aplicarAlias } from "@/lib/comisiones/alias";
import { estaRetirado, AVISO_VENDEDOR_RETIRADO } from "@/lib/comisiones/retirados";
import { sePagaComision } from "@/lib/comisiones/sin-pago";
import { leerAliasOVacio } from "@/lib/comisiones/exclusiones-server";

export const dynamic = "force-dynamic";

const SOLO_ADMIN = ["admin"];
const TABLA = "comision_descuentos_fijos";

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface DescuentoFila {
  id: string;
  vendedor_nombre: string;
  empresa_key: string;
  concepto: string;
  monto: number;
  /** Ausentes mientras la DDL 20261007120000 no corra: se leen como «sin límite». */
  desde: string | null;
  hasta: string | null;
}

/** Lo que la DDL de vigencia todavía no creó: se dice, no se guarda a medias. */
const faltaLaDdl = (msg: string): boolean =>
  /column .* does not exist|PGRST204|42703/i.test(msg) && /desde|hasta/i.test(msg);

const AVISO_SIN_DDL = "Falta correr la migración de las fechas del descuento (20261007120000)";

function normalizarFila(f: Record<string, unknown>): DescuentoFila {
  return {
    id: String(f.id),
    vendedor_nombre: String(f.vendedor_nombre ?? ""),
    empresa_key: String(f.empresa_key ?? ""),
    concepto: String(f.concepto ?? ""),
    monto: Number(f.monto ?? 0),
    desde: (f.desde as string | null) ?? null,
    hasta: (f.hasta as string | null) ?? null,
  };
}

export async function GET(req: NextRequest) {
  const auth = requireRole(req, SOLO_ADMIN);
  if (auth instanceof NextResponse) return auth;

  // `*` para que la lista siga saliendo mientras la DDL de `desde`/`hasta` no
  // corra (los dos campos quedan en null = sin límite, la conducta de siempre).
  const { data, error } = await supabaseServer
    .from(TABLA)
    .select("*")
    .in("empresa_key", EMPRESAS_COMISIONAN as readonly string[])
    .eq("activo", true)
    .order("vendedor_nombre", { ascending: true })
    .order("empresa_key", { ascending: true })
    .order("concepto", { ascending: true });
  if (error) {
    return NextResponse.json(
      { error: "No se pudo cargar la lista. Intenta de nuevo en unos segundos." },
      { status: 500 },
    );
  }
  return NextResponse.json({
    descuentos: ((data ?? []) as Record<string, unknown>[]).map(normalizarFila),
  });
}

interface Campos {
  vendedor_nombre: string;
  empresa_key: string;
  concepto: string;
  monto: number;
  desde: string | null;
  hasta: string | null;
}

type Validacion = { ok: true; valor: Campos } | { ok: false; error: string };

/** Fail-closed: cualquier duda es un error con texto para la pantalla. */
async function validar(body: unknown): Promise<Validacion> {
  const b = (body ?? {}) as Record<string, unknown>;

  const empresa = typeof b.empresa_key === "string" ? b.empresa_key.trim() : "";
  if (!(EMPRESAS_COMISIONAN as readonly string[]).includes(empresa)) {
    return { ok: false, error: "Elige una de las seis empresas que comisionan" };
  }

  const alias = await leerAliasOVacio();
  const vendedor = typeof b.vendedor_nombre === "string"
    ? normalizarVendedor(aplicarAlias(b.vendedor_nombre, alias))
    : "";
  if (!vendedor) return { ok: false, error: "Elige el vendedor" };
  if (vendedor.length > 120) return { ok: false, error: "El nombre del vendedor no es válido" };
  // Un retirado no existe en Comisiones; y a quien no se le paga no se le
  // descuenta nada (su fila ni siquiera entra al total).
  if (estaRetirado(vendedor, alias)) {
    return { ok: false, error: AVISO_VENDEDOR_RETIRADO };
  }
  if (!sePagaComision(vendedor)) {
    return { ok: false, error: "A ese vendedor no se le paga comisión: no hay nada que descontarle" };
  }

  const concepto = typeof b.concepto === "string" ? b.concepto.trim() : "";
  if (!concepto) return { ok: false, error: "Escribe de qué es el descuento" };
  if (concepto.length > 120) return { ok: false, error: "El concepto es demasiado largo" };

  const monto = Number(b.monto);
  if (!Number.isFinite(monto) || monto <= 0) {
    return { ok: false, error: "El monto tiene que ser mayor que cero" };
  }
  if (monto > 100000) return { ok: false, error: "Ese monto no parece correcto" };

  const v = validarVigencia(b.desde, b.hasta);
  if (!v.ok) return { ok: false, error: v.error };

  return {
    ok: true,
    valor: {
      vendedor_nombre: vendedor,
      empresa_key: empresa,
      concepto,
      monto: Math.round(monto * 100) / 100,
      desde: v.valor.desde,
      hasta: v.valor.hasta,
    },
  };
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
  const v = await validar(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  // ⚠️ El índice único de la tabla es (vendedor_nombre, empresa_key, concepto)
  // y NO es parcial por `activo`: una fila quitada bloquea volver a crear el
  // mismo concepto. Por eso el alta REVIVE la quitada en vez de chocar — el
  // historial no se pierde (la fila es la misma) y la pantalla no queda en un
  // callejón sin salida que solo se abre desde la base.
  const revivida = await supabaseServer
    .from(TABLA)
    .update({ ...v.valor, activo: true, updated_at: new Date().toISOString() })
    .eq("vendedor_nombre", v.valor.vendedor_nombre)
    .eq("empresa_key", v.valor.empresa_key)
    .eq("concepto", v.valor.concepto)
    .eq("activo", false)
    .select("id");
  if (!revivida.error && revivida.data && revivida.data.length > 0) {
    return NextResponse.json(
      { ok: true, id: String((revivida.data[0] as { id: string }).id) },
      { status: 201 },
    );
  }

  const { data, error } = await supabaseServer
    .from(TABLA)
    .insert({ ...v.valor, activo: true })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Ese vendedor ya tiene un descuento con ese nombre en esa empresa" },
        { status: 409 },
      );
    }
    if (faltaLaDdl(error.message ?? "")) {
      return NextResponse.json({ error: AVISO_SIN_DDL }, { status: 503 });
    }
    return NextResponse.json(
      { error: "No se pudo guardar. Intenta de nuevo en unos segundos." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, id: String((data as { id: string }).id) }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const auth = requireRole(req, SOLO_ADMIN);
  if (auth instanceof NextResponse) return auth;

  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  if (!uuidRegex.test(id)) {
    return NextResponse.json({ error: "Falta el id de la fila" }, { status: 400 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const v = await validar(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const { data, error } = await supabaseServer
    .from(TABLA)
    .update({ ...v.valor, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("activo", true)
    .select("id");
  if (error) {
    if (faltaLaDdl(error.message ?? "")) {
      return NextResponse.json({ error: AVISO_SIN_DDL }, { status: 503 });
    }
    return NextResponse.json(
      { error: "No se pudo guardar. Intenta de nuevo en unos segundos." },
      { status: 500 },
    );
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Ese descuento ya no está en la lista" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const auth = requireRole(req, SOLO_ADMIN);
  if (auth instanceof NextResponse) return auth;

  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  if (!uuidRegex.test(id)) {
    return NextResponse.json({ error: "Falta el id de la fila" }, { status: 400 });
  }
  // 🔴 Soft delete: `activo = false`. Es historial de decisiones sobre plata y
  // hay barrido que pone el build rojo si aparece un `.delete()` sobre esta tabla.
  const { data, error } = await supabaseServer
    .from(TABLA)
    .update({ activo: false, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("activo", true)
    .select("id");
  if (error) {
    return NextResponse.json(
      { error: "No se pudo quitar. Intenta de nuevo en unos segundos." },
      { status: 500 },
    );
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Ese descuento ya no está en la lista" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
