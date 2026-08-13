/**
 * Descuentos fijos de comisión por vendedor+empresa (se restan del total a
 * pagar del mes). Data-driven: catálogo comision_descuentos_fijos + override
 * por mes comision_descuento_excepciones.
 *
 * GET  ?empresa=&year=&mes=&vendedor=  → descuentos con su `activo` EFECTIVO
 *      del mes (excepción si existe; si no, activo por defecto).
 *      SIN `vendedor` → los de TODOS los vendedores de la empresa, agrupados
 *      por nombre. Lo usa la tabla consolidada, que necesita el neto de todos
 *      a la vez y no puede hacer una llamada por vendedor.
 * POST { descuento_id, year, mes, activo } → upsert de la excepción del mes.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import {
  leerDescuentosEfectivos,
  totalPorVendedor,
  mesISO,
} from "@/lib/comisiones/descuentos";

export const dynamic = "force-dynamic";

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "contabilidad", "secretaria"]);
  if (auth instanceof NextResponse) return auth;

  const sp = req.nextUrl.searchParams;
  const empresa = sp.get("empresa") ?? "";
  const year = parseInt(sp.get("year") ?? "", 10);
  const mes = parseInt(sp.get("mes") ?? "", 10);
  const vendedor = (sp.get("vendedor") ?? "").trim();

  if (!(B2B_EMPRESA_KEYS as readonly string[]).includes(empresa)) {
    return NextResponse.json({ error: "empresa B2B inválida" }, { status: 400 });
  }
  if (!Number.isInteger(year) || year < 2024 || year > 2100) {
    return NextResponse.json({ error: "year inválido" }, { status: 400 });
  }
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    return NextResponse.json({ error: "mes inválido (1..12)" }, { status: 400 });
  }
  // `vendedor` es OPCIONAL: sin él se devuelven los de toda la empresa. Antes
  // era obligatorio y por eso la tabla consolidada no podía mostrar el neto —
  // habría necesitado una llamada por cada vendedor de cada empresa.
  //
  // La lectura y la regla del `activo` efectivo viven en `lib/comisiones/
  // descuentos`, compartidas con el endpoint consolidado: dos copias serían dos
  // totales de comisión posibles para el mismo mes.
  let descuentos;
  try {
    descuentos = await leerDescuentosEfectivos([empresa], year, mes, vendedor);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // Con vendedor: forma de siempre (la usa el modal de detalle).
  if (vendedor) return NextResponse.json({ descuentos });

  // Sin vendedor: además, el total ACTIVO por vendedor ya sumado, que es lo
  // único que la tabla consolidada necesita para mostrar el neto.
  return NextResponse.json({ descuentos, porVendedor: totalPorVendedor(descuentos) });
}

export async function POST(req: NextRequest) {
  // La secretaria (y admin) pueden activar/desactivar por mes.
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;

  let body: { descuento_id?: string; year?: number; mes?: number; activo?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const descuentoId = (body.descuento_id ?? "").trim();
  const year = Number(body.year);
  const mes = Number(body.mes);
  const activo = body.activo;

  if (!uuidRegex.test(descuentoId)) {
    return NextResponse.json({ error: "descuento_id inválido" }, { status: 400 });
  }
  if (!Number.isInteger(year) || year < 2024 || year > 2100) {
    return NextResponse.json({ error: "year inválido" }, { status: 400 });
  }
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    return NextResponse.json({ error: "mes inválido (1..12)" }, { status: 400 });
  }
  if (typeof activo !== "boolean") {
    return NextResponse.json({ error: "activo debe ser boolean" }, { status: 400 });
  }

  const { error } = await supabaseServer
    .from("comision_descuento_excepciones")
    .upsert(
      { descuento_id: descuentoId, mes: mesISO(year, mes), activo },
      { onConflict: "descuento_id,mes" },
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
