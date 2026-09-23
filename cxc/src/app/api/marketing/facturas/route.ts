import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { anularFactura, createFactura } from "@/lib/marketing/mutations";
import { setMarcasDeFactura } from "@/lib/marketing/factura-marcas";
import { exigirUnaMarca } from "@/lib/marketing/gasto";
import { esErrorDeDuplicado } from "@/lib/marketing/puerta-gasto";
import { logActivity } from "@/lib/log-activity";
import type { CreateFacturaInput } from "@/lib/marketing/types";

export const dynamic = "force-dynamic";

interface CreateFacturaBody extends Partial<CreateFacturaInput> {
  permitirDuplicado?: boolean;
  /**
   * 🔴 LA PUERTA «＋ Gasto» (22-sep-2026, pieza A) manda la marca ACÁ, con la
   * factura, y el servidor la escribe en el mismo acto: sin marca no se crea
   * nada (400 antes del insert). La pantalla de antes no manda esta clave y
   * sigue poniendo la marca aparte con `PUT /facturas/[id]/marcas`.
   */
  marcaId?: string | null;
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;
  try {
    const body = (await req.json()) as CreateFacturaBody;
    // Con `marcaId` en el cuerpo, UNA marca es obligatoria y se valida ANTES
    // de escribir (`exigirUnaMarca`: con cero lanza «El gasto necesita una
    // marca.»).
    const traeMarca = body?.marcaId !== undefined;
    const marcaId = String(body?.marcaId ?? "").trim();
    if (traeMarca) {
      try {
        exigirUnaMarca([{ marcaId }]);
      } catch (err) {
        const message = err instanceof Error ? err.message : "El gasto necesita una marca.";
        return NextResponse.json({ error: message }, { status: 400 });
      }
    }
    // `proyectoId` es OPCIONAL: un gasto sin cliente (evento, catálogo,
    // material general) se guarda con proyecto NULL — decisión de Daniel en el
    // rediseño "Registrar gasto". La marca se asigna aparte, como siempre.
    if (
      !body?.numeroFactura ||
      !body.fechaFactura ||
      !body.proveedor ||
      !body.concepto ||
      body.subtotal === undefined
    ) {
      return NextResponse.json(
        { error: "Faltan campos obligatorios" },
        { status: 400 },
      );
    }
    const factura = await createFactura({
      proyectoId: body.proyectoId,
      numeroFactura: body.numeroFactura,
      fechaFactura: body.fechaFactura,
      proveedor: body.proveedor,
      concepto: body.concepto,
      subtotal: Number(body.subtotal),
      itbms: body.itbms !== undefined ? Number(body.itbms) : 0,
      tieneImportacion: Boolean(body.tieneImportacion),
      estadoPago: body.estadoPago === "pagado" ? "pagado" : "creado",
      // Las tres columnas del rediseño: si no vienen, no se escriben.
      seReporta: body.seReporta,
      tiendaCodigo: body.tiendaCodigo,
      nota: body.nota,
    });

    // La marca, en el mismo acto. Si no se pudo poner, la factura recién
    // creada se ANULA (rollback best-effort): una factura sin marca no le
    // llega a nadie.
    if (traeMarca) {
      try {
        await setMarcasDeFactura(factura.id, [{ marcaId, porcentaje: 100 }]);
      } catch (err) {
        await anularFactura(factura.id, "Rollback: fallo al asignar la marca").catch(() => {});
        const message = err instanceof Error ? err.message : "No se pudo asignar la marca";
        return NextResponse.json({ error: message }, { status: 400 });
      }
    }

    // Si el usuario decidió guardar a sabiendas un duplicado, dejamos rastro
    // en el log de actividad para auditoría.
    if (body.permitirDuplicado) {
      await logActivity(
        auth.role,
        "factura_duplicada_permitida",
        "marketing",
        {
          facturaId: factura.id,
          numeroFactura: factura.numero_factura,
          proveedor: factura.proveedor,
          proyectoId: factura.proyecto_id,
        },
        auth.userName,
      ).catch(() => {});
    }

    return NextResponse.json(factura);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "No se pudo crear la factura";
    // 🔴 El duplicado (proveedor normalizado + monto + fecha) contesta 400 y
    // NO escribió nada: la pantalla lo dice tal cual y no guarda.
    if (esErrorDeDuplicado(err)) {
      return NextResponse.json({ error: message, duplicado: true }, { status: 400 });
    }
    console.error("marketing/facturas POST:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
