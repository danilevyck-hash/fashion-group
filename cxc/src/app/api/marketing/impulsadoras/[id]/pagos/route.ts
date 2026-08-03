import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import {
  registrarPagoImpulsadora,
  historialPagosImpulsadora,
  anularPagoImpulsadora,
} from "@/lib/marketing/impulsadoras";
import { firmarPath } from "@/lib/marketing/storage";
import { logActivity } from "@/lib/log-activity";
import type { RegistrarPagoImpulsadoraInput } from "@/lib/marketing/types";

export const dynamic = "force-dynamic";

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/marketing/impulsadoras/[id]/pagos — registra un pago por PERÍODO
// TRABAJADO (desde/hasta: quincena, mes completo o un solo día).
// Crea 1 factura por marca (estado Pagado) con el comprobante adjunto.
// Comprobante OBLIGATORIO: sin él responde 400 y no guarda nada.
// Dos pagos en el mismo mes se permiten; lo que se rechaza es que el período
// se solape con otro pago ya registrado (ver registrarPagoImpulsadora).
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;
  if (!uuidRegex.test(params.id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }
  try {
    const body = (await req.json()) as Partial<RegistrarPagoImpulsadoraInput>;
    if (!body?.desde || !body?.hasta || body.monto === undefined) {
      return NextResponse.json(
        { error: "Faltan campos obligatorios" },
        { status: 400 },
      );
    }
    if (!body.comprobante?.path) {
      return NextResponse.json(
        { error: "El comprobante es obligatorio" },
        { status: 400 },
      );
    }
    const res = await registrarPagoImpulsadora(params.id, {
      desde: body.desde,
      hasta: body.hasta,
      monto: Number(body.monto),
      comprobante: body.comprobante,
    });
    logActivity(
      auth.role,
      "impulsadora_pago",
      "marketing",
      {
        id: params.id,
        desde: body.desde,
        hasta: body.hasta,
        monto: body.monto,
        facturas: res.facturasCreadas,
      },
      auth.userName,
    ).catch(() => {});
    return NextResponse.json(res);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

// GET /api/marketing/impulsadoras/[id]/pagos — historial COMPLETO de pagos.
//
// 🩸 Antes no existía y por eso el módulo era de solo escritura: los pagos se
// guardaban desde abril-2024 pero la pantalla solo enseñaba los últimos 3
// períodos como texto. Daniel: *"quiero ver y editar el historial"*.
//
// Incluye los ANULADOS, marcados: esconderlos sería esconder justo lo que
// alguien viene a auditar. El comprobante se devuelve ya FIRMADO (el path de
// Storage no sirve solo).
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;
  if (!uuidRegex.test(params.id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }
  try {
    const pagos = await historialPagosImpulsadora(params.id);
    // Firmar en paralelo. Si una firma falla, ese pago queda sin enlace pero el
    // historial se muestra igual — perder el comprobante de uno no puede
    // esconder los otros nueve.
    const conUrl = await Promise.all(
      pagos.map(async (p) => {
        if (!p.comprobantePath) return { ...p, comprobanteUrl: null };
        try {
          return { ...p, comprobanteUrl: await firmarPath(p.comprobantePath) };
        } catch {
          return { ...p, comprobanteUrl: null };
        }
      }),
    );
    return NextResponse.json({ pagos: conUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error";
    console.error("marketing/impulsadoras/[id]/pagos GET:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

// DELETE /api/marketing/impulsadoras/[id]/pagos?ref=IMP-2026-06-01 — ANULA un
// pago (no lo borra).
//
// ⚠️ Anular, no borrar: los pagos alimentan el reporte por marca, la card de
// marca y el Excel de gastos, y los tres filtran por `anulado_en` (verificado
// uno por uno). Anular lo saca de TODOS esos números y deja rastro de que el
// gasto existió y por qué se dio de baja.
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;
  if (!uuidRegex.test(params.id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }
  try {
    const ref = req.nextUrl.searchParams.get("ref") ?? "";
    const motivo = req.nextUrl.searchParams.get("motivo") ?? "";
    const res = await anularPagoImpulsadora(params.id, ref, motivo);
    logActivity(
      auth.role,
      "impulsadora_pago_anulado",
      "marketing",
      { id: params.id, ref, motivo, filas: res.filasAnuladas },
      auth.userName,
    ).catch(() => {});
    return NextResponse.json(res);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error";
    console.error("marketing/impulsadoras/[id]/pagos DELETE:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
