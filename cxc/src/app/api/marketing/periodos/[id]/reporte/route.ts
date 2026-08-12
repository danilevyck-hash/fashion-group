import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { esTablaAusente } from "@/lib/marketing/periodos-io";
import { esMarcaCodigo } from "@/lib/marketing/bloques";
import {
  XLSX_MIME,
  armarReportePeriodo,
  cargarDatosPeriodos,
  esReportePeriodo,
  excelDeReporte,
  type ReportePeriodo,
} from "@/lib/marketing/periodos-reporte";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function nombreArchivo(proveedor: string, periodo: string): string {
  const limpio = (s: string) =>
    (s || "reporte").replace(/[^a-zA-Z0-9-_ ]+/g, " ").trim().replace(/\s+/g, "-");
  return `marketing-${limpio(proveedor)}-${limpio(periodo)}.xlsx`;
}

// GET /api/marketing/periodos/[id]/reporte?marca=CK
//
// El Excel del reporte GUARDADO. 🔴 Se lee de `mk_periodos.reporte` tal como
// quedó al cerrar y NO se recalcula nunca: es el papel que el proveedor ya
// tiene en la mano, y tiene que salir idéntico hoy, mañana y el año que viene.
//
// 🩸 EXCEPCIÓN (12-ago-2026, el bug del toast rojo): un período puede estar
// CERRADO con `reporte` NULL — el caso real es "mid 2026", que la migración
// #475 insertó cerrado sin pasar por el cierre. Antes esto respondía 409
// ("no tiene reporte guardado") y el chip del inicio fallaba SIEMPRE. Ahora se
// calcula EN VIVO sobre los documentos sellados a ese período — el mismo
// camino que el ZIP ya tenía — y el Excel lo declara en su subtítulo. Los
// totales salen de `agregarPorBloques().cerrados`: la MISMA cifra del chip.
//
// `?marca=` acota el período conjunto legacy ('pvh' junta TH+CK+KL): el chip
// de Calvin · mid 2026 baja SOLO lo de Calvin ($17.842,14). Solo aplica al
// camino en vivo — un reporte congelado se sirve tal cual, siempre.
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;
  if (!uuidRegex.test(params.id)) {
    return NextResponse.json({ error: "Período inválido" }, { status: 400 });
  }
  const marcaRaw = (
    new URL(req.url).searchParams.get("marca") ?? ""
  ).trim().toUpperCase();
  const marca = esMarcaCodigo(marcaRaw) ? marcaRaw : undefined;

  try {
    const { data, error } = await supabaseServer
      .from("mk_periodos")
      .select("id, proveedor_key, nombre, estado, reporte")
      .eq("id", params.id)
      .maybeSingle();

    if (error) {
      if (esTablaAusente(error)) {
        return NextResponse.json(
          {
            error:
              "Todavía no se activaron los períodos. Falta correr la actualización en la base de datos.",
          },
          { status: 409 },
        );
      }
      throw new Error(error.message);
    }
    if (!data) {
      return NextResponse.json({ error: "Ese período no existe." }, { status: 404 });
    }

    const fila = data as {
      id: string;
      proveedor_key: string;
      nombre: string;
      estado: string;
      reporte: unknown;
    };

    let reporte: ReportePeriodo;
    if (esReportePeriodo(fila.reporte)) {
      // El congelado manda, tal cual quedó. `?marca=` no lo toca: recortarlo
      // sería recalcular un papel que ya se mandó.
      reporte = fila.reporte;
    } else if (fila.estado === "abierto") {
      return NextResponse.json(
        {
          error:
            "Este período todavía está abierto: el reporte se genera al cerrarlo.",
        },
        { status: 409 },
      );
    } else {
      // Cerrado SIN reporte congelado → calcular en vivo (ver el encabezado).
      const datos = await cargarDatosPeriodos();
      const armado = armarReportePeriodo(
        datos,
        {
          id: String(fila.id),
          proveedor_key: String(fila.proveedor_key),
          nombre: String(fila.nombre),
        },
        { soloSelladosAEste: true, marca },
      );
      reporte = armado.reporte;
      if (
        reporte.totales.total === 0 &&
        reporte.facturas.length === 0 &&
        reporte.entregas.length === 0
      ) {
        // Igual que el ZIP (MARCA_SIN_GASTO): un Excel vacío no se manda.
        return NextResponse.json(
          {
            error: `${reporte.proveedorNombre} no tiene gastos en "${fila.nombre}", así que no hay reporte que bajar.`,
          },
          { status: 404 },
        );
      }
    }

    const buffer = excelDeReporte(reporte);
    const filename = nombreArchivo(reporte.proveedorNombre, fila.nombre);
    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": XLSX_MIME,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno";
    console.error("GET /api/marketing/periodos/[id]/reporte:", msg);
    return NextResponse.json(
      { error: "No se pudo generar el Excel. Intenta de nuevo." },
      { status: 500 },
    );
  }
}
