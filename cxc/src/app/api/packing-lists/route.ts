import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { logActivity } from "@/lib/log-activity";
import { requireRole } from "@/lib/requireRole";
import type { PLIndexRow } from "@/lib/parse-packing-list";

export const dynamic = "force-dynamic";

const READ_ROLES = ["admin", "secretaria", "bodega", "vendedor"];
const WRITE_ROLES = ["admin", "secretaria"];

export async function GET(req: NextRequest) {
  const auth = requireRole(req, READ_ROLES);
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await supabaseServer
    .from("packing_lists")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }

  return NextResponse.json(data);
}

/**
 * `pl_items.estilo` y `pl_items.producto` son NOT NULL sin default, y a
 * diferencia de sus columnas vecinas (`total_pcs`, `is_os`) la RPC NO las
 * envuelve en COALESCE. Un item al que le falte cualquiera de las dos hace
 * 23502 y —como la RPC es una sola transacción— **tumba el packing list
 * entero**, con un 500 que no dice cuál fila estaba mal.
 *
 * LAS DOS COLUMNAS NO SE TRATAN IGUAL, y la diferencia sale del parser:
 *
 * - `producto` es la DESCRIPCIÓN, y el parser produce `""` a propósito cuando
 *   ninguna palabra clave calza (`parse-packing-list.ts`: `currentProducto =
 *   producto ? normalizeProductName(producto) : ""`). O sea, vacío es un
 *   resultado NORMAL y esperado → se normaliza a `""`, igual que sus vecinas.
 *   Rechazar el PL por esto sería inventar un error que el parser ya decidió
 *   que no lo es.
 *
 * - `estilo` es el SKU, o sea la IDENTIDAD de la fila: sin él el item no se
 *   puede agrupar, ni validar contra los bultos, ni buscar después. El parser
 *   NUNCA lo produce vacío (solo abre un item cuando matcheó un código de
 *   estilo). Un item sin estilo significa que el payload llegó corrupto →
 *   **es un error legítimo y se reporta**, nombrando la fila.
 *
 * Y se rechaza el PL COMPLETO, no se saltea la fila: saltearla guardaría un
 * packing list con menos items y totales que ya no cuadran con el PDF — el
 * mismo silencio que causó el bug de cheques, pero en los números. En modo
 * lote cada PL se evalúa por separado, así que uno malo no tumba a los otros.
 */
function itemSinEstilo(plItems: PLIndexRow[]): number | null {
  const i = plItems.findIndex((it) => typeof it?.estilo !== "string" || it.estilo.trim() === "");
  return i === -1 ? null : i + 1;
}

// Save a single PL atómicamente via RPC save_packing_list.
// La RPC envuelve los 4 pasos (DELETE items, DELETE header, INSERT header,
// INSERT items) en una transacción plpgsql — si cualquier paso falla todo
// se revierte. Ver supabase/migrations/packing-lists-rpc.sql.
async function saveSinglePL(
  numeroPL: string,
  empresa: string,
  fechaEntrega: string,
  totalBultos: number,
  totalPiezas: number,
  plItems: PLIndexRow[],
  parserMetadata?: Record<string, unknown>,
): Promise<{ id: string } | { error: string }> {
  const pl_header = {
    numero_pl: numeroPL,
    empresa: empresa || null,
    fecha_entrega: fechaEntrega || null,
    total_bultos: totalBultos || 0,
    total_piezas: totalPiezas || 0,
    total_estilos: plItems.length,
  };
  const pl_items_payload = plItems.map((item) => ({
    estilo: item.estilo,
    // Normalizado acá para que el arreglo funcione CON o SIN la migración
    // `20260727190000` (que le agrega el COALESCE a la RPC). `?? ""` no pisa
    // un producto real: solo convierte "no vino" en el vacío que la columna sí
    // acepta.
    producto: typeof item.producto === "string" ? item.producto : "",
    total_pcs: item.totalPcs,
    bultos: item.distribution,
    bulto_muestra: item.bultoMuestra,
    is_os: item.isOS || false,
  }));

  const { data, error } = await supabaseServer.rpc("save_packing_list", {
    pl_header,
    pl_items_payload,
    pl_parser_metadata: parserMetadata ?? {},
  });

  if (error) {
    return { error: error.message };
  }
  return { id: data as string };
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, WRITE_ROLES);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();

  // Batch mode: { packingLists: [...] }
  if (Array.isArray(body.packingLists)) {
    const results: { numeroPL: string; id?: string; error?: string; saved?: { total_bultos: number; total_piezas: number; total_estilos: number } }[] = [];

    for (const pl of body.packingLists) {
      const plItems = pl.items || pl.indexRows || [];
      if (!pl.numeroPL || !plItems.length) {
        results.push({ numeroPL: pl.numeroPL || "?", error: "Datos incompletos" });
        continue;
      }
      // Un item sin estilo tumbaba TODO el lote con un 500 mudo. Ahora solo
      // este PL queda sin guardar, con el número de fila para poder mirarla.
      const filaMala = itemSinEstilo(plItems);
      if (filaMala !== null) {
        results.push({ numeroPL: pl.numeroPL, error: `La fila ${filaMala} no tiene estilo (SKU). Revisa el PDF y vuelve a subirlo.` });
        continue;
      }
      const result = await saveSinglePL(
        pl.numeroPL, pl.empresa, pl.fechaEntrega,
        pl.totalBultos, pl.totalPiezas, plItems,
        pl.parserMetadata,
      );
      if ("error" in result) {
        results.push({ numeroPL: pl.numeroPL, error: result.error });
      } else {
        // Re-fetch totales del DB para comparar contra el preview (bug #6 audit)
        const { data: saved } = await supabaseServer
          .from("packing_lists")
          .select("total_bultos, total_piezas, total_estilos")
          .eq("id", result.id)
          .single();
        results.push({
          numeroPL: pl.numeroPL,
          id: result.id,
          saved: saved || { total_bultos: 0, total_piezas: 0, total_estilos: 0 },
        });
      }
    }

    const saved = results.filter(r => r.id).length;
    const failed = results.filter(r => r.error).length;

    await logActivity(
      auth.role,
      "packing_list_batch_create",
      "packing_lists",
      { count: saved, failed, pls: results.map(r => r.numeroPL) },
      auth.userName,
    );

    return NextResponse.json({ results, totalSaved: saved, totalFailed: failed });
  }

  // Single mode (backward compat)
  const { numeroPL, empresa, fechaEntrega, totalBultos, totalPiezas, items, indexRows } = body as {
    numeroPL: string; empresa: string; fechaEntrega: string;
    totalBultos: number; totalPiezas: number;
    items?: PLIndexRow[]; indexRows?: PLIndexRow[];
  };
  const plItems = items || indexRows || [];

  if (!numeroPL) {
    return NextResponse.json({ error: "Número de PL requerido" }, { status: 400 });
  }
  if (!plItems || !Array.isArray(plItems) || plItems.length === 0) {
    return NextResponse.json({ error: "El packing list debe tener al menos un item" }, { status: 400 });
  }
  const filaMala = itemSinEstilo(plItems);
  if (filaMala !== null) {
    return NextResponse.json(
      { error: `La fila ${filaMala} no tiene estilo (SKU). Revisa el PDF y vuelve a subirlo.` },
      { status: 400 },
    );
  }

  const result = await saveSinglePL(numeroPL, empresa, fechaEntrega, totalBultos, totalPiezas, plItems);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  await logActivity(
    auth.role,
    "packing_list_create",
    "packing_lists",
    { plId: result.id, numeroPL },
    auth.userName,
  );

  return NextResponse.json({ id: result.id });
}
