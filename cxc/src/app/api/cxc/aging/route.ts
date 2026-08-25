import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { getSession } from "@/lib/require-auth";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { lineaDeRechazos } from "@/lib/rechazos-de-switch";
import { CXC_GRUPO_EMPRESA_KEYS } from "@/lib/empresa-mapping";

export const dynamic = "force-dynamic";

// Devuelve las filas de aging del CXC (switch_estadocuenta_aging).
//
// FILTRO SERVER-SIDE por empresa asociada: un vendedor con
// fg_users.associated_company definida solo recibe las filas de ESA empresa.
// Vendedor sin empresa asociada (null) y admin/secretaria reciben todas.
// La restricción se aplica acá (no solo en la UI) para que no se pueda
// saltar manipulando el cliente.
// ─────────────────────────────────────────────────────────────────────────────
// 🔴 EL TELÉFONO SE LEE EN VIVO; LA PLATA SIGUE SALIENDO DE LA MV (24-ago-2026)
//
// 🩸 El aviso mandaba a hacer algo que NO arreglaba el problema. Al tocar
// "WhatsApp" sin teléfono, el CXC decía *"Este cliente no tiene teléfono
// registrado. Edite el contacto primero"*. Se iba a la ficha (`/clientes/[codigo]`),
// se escribía el teléfono —que se guarda en `clientes_master`—, se volvía… y
// seguía diciendo lo mismo, porque esta ruta lee `switch_estadocuenta_aging_mv`,
// una vista MATERIALIZADA que se refresca horas después por cron. La persona
// quedaba pensando que la app está rota.
//
// **El arreglo es el camino menos sorpresivo: que el CXC lo VEA.** Los montos
// siguen viniendo de la MV (precalculada, rápida, y es lo que hace que ningún
// número de cartera se mueva); lo único que se relee en vivo son los TRES campos
// de contacto que la vista toma de `clientes_master` —`email`, `telefono`,
// `celular`— exactamente los mismos y del mismo lugar. No se toca ni un centavo,
// ni un tramo, ni un nombre: cambiar `nombre`/`nombre_normalized` movería la
// consolidación del panel, que agrupa por nombre.
//
// ⚠️ Se acota con `.in("codigo", …)` a los códigos que YA vienen en la cartera
// del grupo (~100-150), en lotes: `clientes_master` tiene miles de filas (97%
// de Boston) y `db-max-rows` = 1000 corta EN SILENCIO. Se pagina con
// `leerTodoPaginado`, que además verifica contra un COUNT exacto.
//
// 🔑 Boston no entra ni por acá: sólo se re-leen códigos que la MV del GRUPO ya
// trajo, y los clientes de Boston no están en `clientes_master` (usan ids
// numéricos de Switch, no D-XXX). Este archivo no toca `switch_estadocuenta`.
//
// 🔴 FALLA ABIERTO: si la lectura en vivo se cae, se conservan los datos de la
// MV y el CXC se dibuja igual. Un contacto viejo es mucho menos grave que una
// cartera que no carga.
// ─────────────────────────────────────────────────────────────────────────────

/** Los tres campos que la vista de aging toma de `clientes_master`. */
interface ContactoMaestro {
  codigo: string;
  email: string | null;
  telefono: string | null;
  celular: string | null;
}

/** Tope por lote del `.in()`. Muy por debajo de `db-max-rows` (1000). */
const LOTE_CODIGOS = 300;

async function contactoEnVivo(codigos: string[]): Promise<Map<string, ContactoMaestro>> {
  const mapa = new Map<string, ContactoMaestro>();
  for (let i = 0; i < codigos.length; i += LOTE_CODIGOS) {
    const lote = codigos.slice(i, i + LOTE_CODIGOS);
    const filas = await leerTodoPaginado<ContactoMaestro>(
      "clientes_master (contacto del CXC)",
      (pedirCount, desde, hasta) =>
        supabaseServer
          .from("clientes_master")
          .select("codigo, email, telefono, celular", pedirCount ? { count: "exact" } : {})
          .in("codigo", lote)
          .eq("deleted", false)
          .order("codigo", { ascending: true })
          .range(desde, hasta),
    );
    for (const f of filas) if (f.codigo) mapa.set(f.codigo, f);
  }
  return mapa;
}

/** Pisa correo/teléfono/celular con lo que HOY dice el maestro. Los montos NO se tocan. */
async function refrescarContacto(rows: unknown[]): Promise<boolean> {
  const codigos = [
    ...new Set(
      rows
        .map((r) => (r as { codigo?: string | null }).codigo)
        .filter((c): c is string => !!c),
    ),
  ];
  if (codigos.length === 0) return true;

  const mapa = await contactoEnVivo(codigos);
  for (const r of rows) {
    const fila = r as { codigo?: string | null; correo: string; telefono: string; celular: string };
    const m = fila.codigo ? mapa.get(fila.codigo) : undefined;
    // Sin fila en el maestro no se pisa nada: se conserva lo que trajo la MV.
    if (!m) continue;
    fila.correo = m.email ?? "";
    fila.telefono = m.telefono ?? "";
    fila.celular = m.celular ?? "";
  }
  return true;
}

export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (session.role !== "admin" && !["secretaria", "vendedor"].includes(session.role)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  // Empresa asociada del vendedor (fuente de verdad: DB, no la cookie).
  let companyKey: string | null = null;
  if (session.role === "vendedor" && session.userId) {
    const { data: u } = await supabaseServer
      .from("fg_users")
      .select("associated_company")
      .eq("id", session.userId)
      .maybeSingle();
    companyKey = u?.associated_company ?? null;
  }

  // Lee la MV precalculada (switch_estadocuenta_aging_mv). Degrada suave: si la MV
  // aún no existe (ventana de deploy antes de la migración), cae a la VIEW en vivo
  // → CXC nunca rompe. La MV trae materializado_en = cuándo se refrescó (frescura
  // real, no la hora del request).
  let rows: unknown[] = [];
  let refreshedAt: string | null = null;

  let mvQuery = supabaseServer.from("switch_estadocuenta_aging_mv").select("*");
  if (companyKey) mvQuery = mvQuery.eq("company_key", companyKey);
  const mvRes = await mvQuery;

  if (mvRes.error) {
    // Fallback a la view en vivo (mismo shape de filas).
    let vQuery = supabaseServer.from("switch_estadocuenta_aging").select("*");
    if (companyKey) vQuery = vQuery.eq("company_key", companyKey);
    const vRes = await vQuery;
    if (vRes.error) {
      return NextResponse.json({ error: vRes.error.message }, { status: 500 });
    }
    rows = vRes.data ?? [];
  } else {
    rows = mvRes.data ?? [];
    refreshedAt = (mvRes.data?.[0] as { materializado_en?: string } | undefined)?.materializado_en ?? null;
    // El contacto de la MV puede tener horas; el de la ficha se acaba de guardar.
    // (En la rama del fallback la VIEW ya joinea clientes_master en vivo.)
    try {
      await refrescarContacto(rows);
    } catch (e) {
      console.error("[api/cxc/aging] contacto en vivo falló, se usa el de la MV:", e);
    }
  }

  // Lo que el guard dejó AFUERA de esta cartera. El total sigue siendo el real;
  // lo que se agrega es decir qué documento no entró y por qué.
  //
  // 🔴 ACOTADO A LAS 6 DEL GRUPO. Sin `empresas`, un rechazo de Boston se
  // dibujaría sobre el total del grupo — exactamente la mezcla que la vista
  // `switch_estadocuenta_aging` existe para impedir. Boston lo dice en SU
  // pestaña, con su propia consulta.
  const avisoMontos = await lineaDeRechazos({
    familias: ["cxc"],
    empresas: CXC_GRUPO_EMPRESA_KEYS,
  });

  return NextResponse.json({ rows, companyKey, refreshedAt, avisoMontos });
}
