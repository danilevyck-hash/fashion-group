// ─────────────────────────────────────────────────────────────────────────────
// GET /api/clientes/ytd?codigos=D-108,D-170,…
//
// Compras del año de los clientes de UNA página del listado. Devuelve
// { anio, ytd: { "D-108": 210702.5, … } }. Los clientes sin compras NO vienen
// en el mapa.
//
// POR QUÉ ES UN ENDPOINT APARTE y no una columna más de /api/clientes:
// calcular esto cuesta leer las facturas del año de los ≤50 clientes visibles
// (~1.040 filas para la primera página, medido). Si viajara junto con la lista,
// el listado entero esperaría por la columna y Daniel —que ya se quejó de
// lentitud— cambiaría una molestia por otra. Así la tabla aparece a la misma
// velocidad de siempre y la columna se rellena sola un instante después.
//
// El cálculo NO vive acá: es `comprasDelAnioPorCodigo` de `lib/clientes-ytd`,
// el mismo módulo del que sale el número de la ficha del cliente.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { anioEnCursoPanama } from "@/lib/clientes-ytd";
import { comprasDelAnioPorCodigo } from "@/lib/clientes-ytd-consulta";

export const dynamic = "force-dynamic";

const ALLOWED_ROLES = ["admin", "secretaria", "vendedor", "bodega"];

/** Tope de códigos por llamada: el listado pagina de a 50 y el máximo que
 *  acepta la lista es 200. Más que eso es alguien usando el endpoint para otra
 *  cosa, y no queremos que una URL larga dispare una lectura enorme. */
const MAX_CODIGOS = 200;

export async function GET(req: NextRequest) {
  const authError = requireAuth(req, ALLOWED_ROLES);
  if (authError) return authError;

  const crudo = (req.nextUrl.searchParams.get("codigos") ?? "").trim();
  const codigos = crudo ? crudo.split(",").map(c => c.trim()).filter(Boolean) : [];

  if (codigos.length === 0) {
    return NextResponse.json({ anio: anioEnCursoPanama(), ytd: {} });
  }
  if (codigos.length > MAX_CODIGOS) {
    return NextResponse.json(
      { error: `Demasiados clientes de una vez (máximo ${MAX_CODIGOS}).` },
      { status: 400 },
    );
  }

  try {
    const mapa = await comprasDelAnioPorCodigo(codigos);
    return NextResponse.json({
      anio: anioEnCursoPanama(),
      ytd: Object.fromEntries(mapa),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[api/clientes/ytd] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
