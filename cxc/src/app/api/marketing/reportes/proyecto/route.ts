import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// 🩸 GET /api/marketing/reportes/proyecto SE RETIRÓ el 22-sep-2026 (pieza C del
// rediseño de Marketing). Daniel: *«"Por proyecto" se va»* — el proyecto dejó
// de ser el contenedor del gasto (*«a) Basta la tienda»*); los reportes son por
// MARCA y por TIENDA. Contesta 410 con el porqué; ninguna tabla se dropea
// (patrón `mayor_lineas`). Candado: `marketing-portada-y-cierre`.
export async function GET() {
  return NextResponse.json(
    {
      error:
        "El reporte por proyecto se retiró: los gastos se reportan por marca y por tienda.",
    },
    { status: 410 },
  );
}
