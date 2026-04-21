import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";
import { createCobranza } from "@/lib/marketing/mutations";
import type { EstadoCobranza } from "@/lib/marketing/types";

export const dynamic = "force-dynamic";

const ESTADOS_VALIDOS: ReadonlyArray<EstadoCobranza> = [
  "borrador",
  "enviada",
  "pagada_parcial",
  "pagada",
  "disputada",
];

// ----------------------------------------------------------------------------
// GET /api/marketing/cobranzas
//   ?marca_id=...&proyecto_id=...&estado=...&desde=YYYY-MM-DD&hasta=YYYY-MM-DD
// Devuelve lista con totales de pagos y joins con proyecto + marca.
// ----------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria", "director"]);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const marcaId = url.searchParams.get("marca_id");
  const proyectoId = url.searchParams.get("proyecto_id");
  const estado = url.searchParams.get("estado");
  const desde = url.searchParams.get("desde");
  const hasta = url.searchParams.get("hasta");

  try {
    let q = supabaseServer
      .from("mk_cobranzas")
      .select(
        "*, proyecto:mk_proyectos(id,nombre,tienda,estado), marca:mk_marcas(id,nombre,codigo,empresa_codigo)"
      )
      .is("anulado_en", null)
      .order("created_at", { ascending: false });

    if (marcaId) q = q.eq("marca_id", marcaId);
    if (proyectoId) q = q.eq("proyecto_id", proyectoId);
    if (estado && ESTADOS_VALIDOS.includes(estado as EstadoCobranza)) {
      q = q.eq("estado", estado);
    }
    // Rango de fechas aplicado sobre fecha_envio (vigentes ya enviadas)
    // o created_at si aún son borradores. Preferimos created_at por simplicidad.
    if (desde) q = q.gte("created_at", `${desde}T00:00:00`);
    if (hasta) q = q.lte("created_at", `${hasta}T23:59:59`);

    const { data, error } = await q;
    if (error) throw error;

    const rows = data ?? [];
    const ids = rows.map((r) => String((r as Record<string, unknown>).id));

    // Agregado de pagos por cobranza
    const totales = new Map<string, number>();
    if (ids.length > 0) {
      const { data: pagos, error: pagosErr } = await supabaseServer
        .from("mk_pagos")
        .select("cobranza_id, monto")
        .in("cobranza_id", ids)
        .is("anulado_en", null);
      if (pagosErr) throw pagosErr;
      for (const row of pagos ?? []) {
        const r = row as Record<string, unknown>;
        const cid = String(r.cobranza_id);
        const m = Number(r.monto ?? 0);
        totales.set(cid, (totales.get(cid) ?? 0) + m);
      }
    }

    const out = rows.map((r) => {
      const obj = r as Record<string, unknown>;
      const id = String(obj.id);
      const monto = Number(obj.monto ?? 0);
      const totalPagado = Number((totales.get(id) ?? 0).toFixed(2));
      const saldo = Number((monto - totalPagado).toFixed(2));
      return {
        ...obj,
        total_pagado: totalPagado,
        saldo,
      };
    });

    return NextResponse.json(out);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ----------------------------------------------------------------------------
// POST /api/marketing/cobranzas
// Body: { proyectoId, marcaId, monto, emailDestino?, asunto?, cuerpo?, notas? }
// Genera número MK-YYYY-NNNN con retry anti-colisión.
// ----------------------------------------------------------------------------
interface CreateBody {
  proyectoId?: string;
  marcaId?: string;
  monto?: number;
  emailDestino?: string;
  asunto?: string;
  cuerpo?: string;
  notas?: string;
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria", "director"]);
  if (auth instanceof NextResponse) return auth;

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (!body.proyectoId || !body.marcaId) {
    return NextResponse.json(
      { error: "proyectoId y marcaId son requeridos" },
      { status: 400 }
    );
  }

  // createCobranza internamente genera número CB-YYYYMM-NNNN con lock por orden desc.
  // Añadimos retry por si dos requests colisionan al mismo tiempo (UNIQUE constraint).
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const cobranza = await createCobranza({
        proyectoId: body.proyectoId,
        marcaId: body.marcaId,
        monto: Number(body.monto ?? 0),
        emailDestino: body.emailDestino,
        asunto: body.asunto,
        cuerpo: body.cuerpo,
        notas: body.notas,
      });
      return NextResponse.json(cobranza);
    } catch (err: unknown) {
      lastError = err;
      const msg = err instanceof Error ? err.message : "";
      // Solo reintentar si parece colisión de número (duplicate key)
      if (!/duplicate|unique|23505/i.test(msg)) break;
    }
  }
  const message =
    lastError instanceof Error ? lastError.message : "Error creando cobranza";
  return NextResponse.json({ error: message }, { status: 500 });
}
