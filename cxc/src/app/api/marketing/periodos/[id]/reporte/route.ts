import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { esMarcaCodigo } from "@/lib/marketing/bloques";
import { XLSX_MIME } from "@/lib/excel-export";
import {
  ErrorZipMarca,
  buildExcelDeMarca,
  type CodigoErrorZipMarca,
} from "@/lib/marketing/zip-marca";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function nombreArchivo(proveedor: string, periodo: string): string {
  const limpio = (s: string) =>
    (s || "reporte").replace(/[^a-zA-Z0-9-_ ]+/g, " ").trim().replace(/\s+/g, "-");
  return `marketing-${limpio(proveedor)}-${limpio(periodo)}.xlsx`;
}

/** Qué código HTTP le corresponde a cada negativa del constructor. */
const HTTP_POR_CODIGO: Record<CodigoErrorZipMarca, number> = {
  MARCA_DESCONOCIDA: 400,
  SIN_TABLAS_DE_PERIODO: 409,
  PERIODO_NO_ENCONTRADO: 404,
  PERIODO_DE_OTRA_MARCA: 400,
  SIN_PERIODO_ABIERTO: 404,
  MARCA_SIN_GASTO: 404,
};

// GET /api/marketing/periodos/[id]/reporte?marca=CK
//
// El Excel de un período — EL MISMO `resumen_gastos.xlsx` que va dentro del
// ZIP de la marca (`lib/marketing/zip-marca.ts`), sin armar el ZIP: hoja
// Resumen + una hoja por cliente con sus gastos e hyperlinks a cada
// comprobante y foto, y los gastos sin cliente en la hoja "General". Daniel,
// textual (12-ago-2026): *"quiero el modo anterior, solo quitando las columnas
// de las marcas ya que hoy en dia se descarga por marca"*.
//
// 🔴 LA PLATA SE CONGELA, LOS PAPELES NO — la regla vive en zip-marca:
//   · Período cerrado CON reporte congelado → los montos salen del jsonb tal
//     cual quedaron al cerrar (fuenteMontos: "congelado"); los links y fotos
//     se leen en vivo.
//   · Período cerrado SIN reporte congelado (el caso real "mid 2026") → se
//     calcula en vivo sobre los documentos sellados a ese período y el
//     subtítulo del Excel LO DECLARA.
//
// `?marca=` acota el período conjunto legacy ('pvh' junta TH+CK+KL): el chip
// de Calvin · mid 2026 baja SOLO lo de Calvin. Sin `?marca=`, la marca se
// deriva de la clave del período (los cierres nuevos son por marca); si el
// período es el conjunto viejo y no se dijo la marca, se pide con 400 en vez
// de mezclar los reportes de tres encargados.
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
  const marcaPedida = esMarcaCodigo(marcaRaw) ? marcaRaw : undefined;

  try {
    const { data, error } = await supabaseServer
      .from("mk_periodos")
      .select("id, proveedor_key, nombre, estado")
      .eq("id", params.id)
      .maybeSingle();

    // Tolerancia a DDL retirada el 3-sep-2026 (contestaba 409 "falta correr
    // la actualización" ante 42P01/PGRST205): `mk_periodos` existe desde
    // 20260811160000. Hoy ese código es un error de verdad y cae al 500 de
    // abajo, con el mismo mensaje humano.
    if (error) throw new Error(error.message);
    if (!data) {
      return NextResponse.json({ error: "Ese período no existe." }, { status: 404 });
    }

    const fila = data as {
      id: string;
      proveedor_key: string;
      nombre: string;
      estado: string;
    };

    if (fila.estado === "abierto") {
      // El período abierto sigue contestando 409: su reporte nace al cerrarlo
      // (el ZIP de la tarjeta sí baja lo abierto, con este mismo Excel dentro).
      return NextResponse.json(
        {
          error:
            "Este período todavía está abierto: el reporte se genera al cerrarlo.",
        },
        { status: 409 },
      );
    }

    // La marca: la pedida, o la propia clave del período (cierres por marca).
    const claveComoMarca = fila.proveedor_key.trim().toUpperCase();
    const marca = marcaPedida ?? (esMarcaCodigo(claveComoMarca) ? claveComoMarca : undefined);
    if (!marca) {
      return NextResponse.json(
        {
          error:
            "Este período junta varias marcas. Baja el Excel desde la tarjeta de la marca que necesitas.",
        },
        { status: 400 },
      );
    }

    const result = await buildExcelDeMarca({ marcaCodigo: marca, periodoId: params.id });
    const filename = nombreArchivo(result.marcaNombre, result.periodoNombre);
    return new NextResponse(result.buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": XLSX_MIME,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
        "X-Fuente-Montos": result.fuenteMontos,
        "X-Total": String(result.total),
      },
    });
  } catch (err) {
    if (err instanceof ErrorZipMarca) {
      // Igual que el ZIP (MARCA_SIN_GASTO): un Excel vacío no se manda —
      // no hay reporte que bajar.
      return NextResponse.json(
        { error: err.message },
        { status: HTTP_POR_CODIGO[err.codigo] ?? 400 },
      );
    }
    const msg = err instanceof Error ? err.message : "Error interno";
    console.error("GET /api/marketing/periodos/[id]/reporte:", msg);
    return NextResponse.json(
      { error: "No se pudo generar el Excel. Intenta de nuevo." },
      { status: 500 },
    );
  }
}
