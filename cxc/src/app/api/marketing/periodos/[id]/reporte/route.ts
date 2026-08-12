import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { esTablaAusente } from "@/lib/marketing/periodos-io";
import {
  XLSX_MIME,
  esReportePeriodo,
  excelDeReporte,
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

// GET /api/marketing/periodos/[id]/reporte
//
// El Excel del reporte GUARDADO. 🔴 Se lee de `mk_periodos.reporte` tal como
// quedó al cerrar y NO se recalcula nunca: es el papel que el proveedor ya
// tiene en la mano, y tiene que salir idéntico hoy, mañana y el año que viene.
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;
  if (!uuidRegex.test(params.id)) {
    return NextResponse.json({ error: "Período inválido" }, { status: 400 });
  }

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
      nombre: string;
      estado: string;
      reporte: unknown;
    };
    if (!esReportePeriodo(fila.reporte)) {
      return NextResponse.json(
        {
          error:
            fila.estado === "abierto"
              ? "Este período todavía está abierto: el reporte se genera al cerrarlo."
              : "Este período no tiene reporte guardado.",
        },
        { status: 409 },
      );
    }

    const buffer = excelDeReporte(fila.reporte);
    const filename = nombreArchivo(fila.reporte.proveedorNombre, fila.nombre);
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
