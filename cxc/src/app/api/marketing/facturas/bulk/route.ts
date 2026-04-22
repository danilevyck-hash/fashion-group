import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import {
  createAdjunto,
  createFactura,
} from "@/lib/marketing/mutations";
import { setMarcasDeFactura } from "@/lib/marketing/factura-marcas";
import { logActivity } from "@/lib/log-activity";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface BulkItem {
  cardId?: unknown;
  numeroFactura?: unknown;
  fechaFactura?: unknown;
  proveedor?: unknown;
  concepto?: unknown;
  subtotal?: unknown;
  itbms?: unknown;
  marcaIds?: unknown;
  permitirDuplicado?: unknown;
  pdfPath?: unknown;
  pdfNombre?: unknown;
  pdfSize?: unknown;
}

interface BulkBody {
  proyectoId?: unknown;
  items?: unknown;
}

interface ItemNormalizado {
  cardId: string;
  numeroFactura: string;
  fechaFactura: string;
  proveedor: string;
  concepto: string;
  subtotal: number;
  itbms: number;
  marcaIds: string[];
  permitirDuplicado: boolean;
  pdfPath: string | null;
  pdfNombre: string | null;
  pdfSize: number | null;
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

function asNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizar(raw: BulkItem): ItemNormalizado | { error: string } {
  const cardId = asString(raw.cardId);
  if (!cardId) return { error: "cardId requerido" };
  const numeroFactura = asString(raw.numeroFactura);
  if (!numeroFactura) return { error: "Número de factura requerido" };
  const fechaFactura = asString(raw.fechaFactura);
  if (!fechaFactura) return { error: "Fecha de factura requerida" };
  const proveedor = asString(raw.proveedor);
  if (!proveedor) return { error: "Proveedor requerido" };
  const concepto = asString(raw.concepto);
  if (!concepto) return { error: "Concepto requerido" };
  const subtotal = asNumber(raw.subtotal);
  if (subtotal === null || subtotal <= 0) {
    return { error: "Subtotal debe ser mayor a 0" };
  }
  const itbms = asNumber(raw.itbms) ?? 0;
  if (itbms < 0) return { error: "ITBMS inválido" };
  if (!Array.isArray(raw.marcaIds) || raw.marcaIds.length === 0) {
    return { error: "Selecciona al menos una marca" };
  }
  const marcaIds: string[] = [];
  for (const m of raw.marcaIds) {
    const s = asString(m);
    if (!s) return { error: "marcaId inválido en la lista" };
    marcaIds.push(s);
  }
  return {
    cardId,
    numeroFactura,
    fechaFactura,
    proveedor,
    concepto,
    subtotal,
    itbms,
    marcaIds,
    permitirDuplicado: Boolean(raw.permitirDuplicado),
    pdfPath: asString(raw.pdfPath),
    pdfNombre: asString(raw.pdfNombre),
    pdfSize: asNumber(raw.pdfSize),
  };
}

// POST /api/marketing/facturas/bulk
//   body: { proyectoId, items: [{ cardId, ...campos, marcaIds, pdfPath?, pdfNombre?, pdfSize?, permitirDuplicado? }] }
//   resp: { exitosas: [{ cardId, facturaId }], errores: [{ cardId, razon }] }
//
// Procesa cada item independiente. Si createFactura/setMarcas/adjunto falla
// para uno, lo marca en errores y sigue con el resto. Si permitirDuplicado=true,
// loguea factura_duplicada_permitida en activity_logs.
export async function POST(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria", "director"]);
  if (auth instanceof NextResponse) return auth;

  let body: BulkBody;
  try {
    body = (await req.json()) as BulkBody;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const proyectoId = asString(body.proyectoId);
  if (!proyectoId) {
    return NextResponse.json({ error: "proyectoId requerido" }, { status: 400 });
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json(
      { error: "items requerido (no vacío)" },
      { status: 400 },
    );
  }

  // Validar que el proyecto exista, no esté anulado y permita facturas (no cobrado).
  const { data: proy, error: proyErr } = await supabaseServer
    .from("mk_proyectos")
    .select("id, estado, anulado_en")
    .eq("id", proyectoId)
    .maybeSingle();
  if (proyErr) {
    return NextResponse.json(
      { error: `proyecto: ${proyErr.message}` },
      { status: 500 },
    );
  }
  if (!proy) {
    return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
  }
  const proyRow = proy as { estado: string; anulado_en: string | null };
  if (proyRow.anulado_en) {
    return NextResponse.json(
      { error: "El proyecto está anulado" },
      { status: 400 },
    );
  }
  if (proyRow.estado === "cobrado") {
    return NextResponse.json(
      { error: "No se pueden agregar facturas a un proyecto cobrado" },
      { status: 400 },
    );
  }

  const exitosas: Array<{ cardId: string; facturaId: string }> = [];
  const errores: Array<{ cardId: string; razon: string }> = [];

  for (const raw of body.items as BulkItem[]) {
    const norm = normalizar(raw);
    if ("error" in norm) {
      const cardIdFallback =
        typeof raw?.cardId === "string" ? raw.cardId : "?";
      errores.push({ cardId: cardIdFallback, razon: norm.error });
      continue;
    }

    try {
      // 1. Crear factura
      const factura = await createFactura({
        proyectoId,
        numeroFactura: norm.numeroFactura,
        fechaFactura: norm.fechaFactura,
        proveedor: norm.proveedor,
        concepto: norm.concepto,
        subtotal: norm.subtotal,
        itbms: norm.itbms,
      });

      // 2. Asignar marcas (regla 50/50 fija; el helper ignora porcentajes recibidos)
      try {
        await setMarcasDeFactura(
          factura.id,
          norm.marcaIds.map((marcaId) => ({ marcaId, porcentaje: 50 })),
        );
      } catch (mErr) {
        // Rollback best-effort: anular la factura recién creada.
        await supabaseServer
          .from("mk_facturas")
          .update({
            anulado_en: new Date().toISOString(),
            anulado_motivo: "Rollback bulk: fallo al asignar marcas",
          })
          .eq("id", factura.id);
        const msg = mErr instanceof Error ? mErr.message : "Error en marcas";
        errores.push({ cardId: norm.cardId, razon: msg });
        continue;
      }

      // 3. Registrar adjunto PDF si llegó
      if (norm.pdfPath) {
        try {
          await createAdjunto({
            facturaId: factura.id,
            tipo: "pdf_factura",
            url: norm.pdfPath,
            nombreOriginal: norm.pdfNombre ?? undefined,
            sizeBytes: norm.pdfSize ?? undefined,
          });
        } catch (aErr) {
          // No abortamos la factura por un fallo de adjunto: la factura ya
          // existe con sus marcas. Reportamos como éxito parcial vía warning
          // en el log y la marcamos como exitosa de todos modos.
          console.warn(
            `bulk[adjunto] factura ${factura.id}:`,
            aErr instanceof Error ? aErr.message : aErr,
          );
        }
      }

      // 4. Log de duplicado consciente
      if (norm.permitirDuplicado) {
        await logActivity(
          auth.role,
          "factura_duplicada_permitida",
          "marketing",
          {
            facturaId: factura.id,
            numeroFactura: factura.numero_factura,
            proveedor: factura.proveedor,
            proyectoId,
            origen: "bulk",
          },
          auth.userName,
        ).catch(() => {});
      }

      exitosas.push({ cardId: norm.cardId, facturaId: factura.id });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al guardar";
      errores.push({ cardId: norm.cardId, razon: msg });
    }
  }

  return NextResponse.json({ exitosas, errores });
}
