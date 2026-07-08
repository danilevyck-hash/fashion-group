/**
 * Descuentos fijos de comisión por vendedor+empresa (se restan del total a
 * pagar del mes). Data-driven: catálogo comision_descuentos_fijos + override
 * por mes comision_descuento_excepciones.
 *
 * GET  ?empresa=&year=&mes=&vendedor=  → descuentos con su `activo` EFECTIVO
 *      del mes (excepción si existe; si no, activo por defecto).
 * POST { descuento_id, year, mes, activo } → upsert de la excepción del mes.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";

export const dynamic = "force-dynamic";

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function mesISO(year: number, mes: number): string {
  return `${year}-${String(mes).padStart(2, "0")}-01`;
}

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
  if (!vendedor) {
    return NextResponse.json({ error: "vendedor requerido" }, { status: 400 });
  }

  const { data: fijos, error: e1 } = await supabaseServer
    .from("comision_descuentos_fijos")
    .select("id, concepto, monto")
    .eq("empresa_key", empresa)
    .eq("vendedor_nombre", vendedor)
    .eq("activo", true)
    .order("concepto", { ascending: true });
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });

  const ids = (fijos ?? []).map((f) => String(f.id));
  const excById = new Map<string, boolean>();
  if (ids.length > 0) {
    const { data: exc, error: e2 } = await supabaseServer
      .from("comision_descuento_excepciones")
      .select("descuento_id, activo")
      .in("descuento_id", ids)
      .eq("mes", mesISO(year, mes));
    if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
    for (const x of exc ?? []) excById.set(String(x.descuento_id), Boolean(x.activo));
  }

  const descuentos = (fijos ?? []).map((f) => {
    const id = String(f.id);
    // Efectivo: excepción del mes si existe; si no, activo por defecto.
    const activo = excById.has(id) ? excById.get(id)! : true;
    return { id, concepto: String(f.concepto), monto: Number(f.monto), activo };
  });

  return NextResponse.json({ descuentos });
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
