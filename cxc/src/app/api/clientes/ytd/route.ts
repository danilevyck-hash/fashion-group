// ─────────────────────────────────────────────────────────────────────────────
// POST /api/clientes/ytd  { "codigos": ["D-108","D-170",…] }
// GET  /api/clientes/ytd?codigos=D-108,D-170,…   (la puerta vieja, se queda)
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

// ─────────────────────────────────────────────────────────────────────────────
// 🩸 EL TOPE ERA 200 Y EL LISTADO YA NO PAGINA (11-sep-2026).
//
// El comentario de acá arriba decía «el listado pagina de a 50»: dejó de
// hacerlo el 5-sep-2026, cuando la lista de Clientes pasó a mostrar el
// directorio entero con scroll. Desde ese día manda TODOS los códigos juntos,
// y hoy son **148** — así que funciona de casualidad, a 52 clientes del 400.
// El día que el directorio pase de 200, la ruta contesta 400 y la columna
// «Compró <año>» se queda con «…» para siempre, sin un solo mensaje en
// pantalla: el `useSWR` de la lista tira el error y nadie lo dibuja.
//
// Lo que cambia:
//   · el tope sube a 1.000, que es el techo de la casa (`db-max-rows`) y deja
//     seis veces el directorio de hoy;
//   · nace un **POST** que recibe la lista en el cuerpo, porque 148 códigos en
//     la URL ya son ~1.900 caracteres y algunos intermediarios cortan ahí.
//     La pantalla pasó a usarlo; el GET se queda vivo y sin cambios para
//     cualquier enlace o prueba que lo tenga escrito.
//
// El cálculo no cambia ni un centavo: los dos verbos llaman al MISMO
// `comprasDelAnioPorCodigo`, que ya lee paginado.
// ─────────────────────────────────────────────────────────────────────────────
const MAX_CODIGOS = 1000;

/** La respuesta, igual para los dos verbos. */
async function responder(codigos: string[]): Promise<NextResponse> {
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

export async function GET(req: NextRequest) {
  const authError = requireAuth(req, ALLOWED_ROLES);
  if (authError) return authError;

  const crudo = (req.nextUrl.searchParams.get("codigos") ?? "").trim();
  return responder(crudo ? crudo.split(",").map(c => c.trim()).filter(Boolean) : []);
}

export async function POST(req: NextRequest) {
  const authError = requireAuth(req, ALLOWED_ROLES);
  if (authError) return authError;

  let codigos: string[] = [];
  try {
    const body = (await req.json()) as { codigos?: unknown };
    if (Array.isArray(body.codigos)) {
      codigos = body.codigos.map((c) => String(c ?? "").trim()).filter(Boolean);
    }
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }
  return responder(codigos);
}
