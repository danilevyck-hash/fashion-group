import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";

export const dynamic = "force-dynamic";

// 🩸 RETIRADA (22-sep-2026). Escribía `mk_proyecto_marcas`, la tabla de marcas
// POR PROYECTO del modelo viejo. En el rediseño la marca es del GASTO (una por
// gasto, `lib/marketing/gasto.ts`) y el proyecto se va: ningún lector ni
// escritor queda en `src/`. La tabla NO se dropea (patrón `mayor_lineas`);
// sus 5 filas quedan en el respaldo como `congelada`. Sin un solo botón que
// llamara a esta ruta, contesta 410 y lo dice.
const MSG_MARCAS_POR_PROYECTO_RETIRADAS =
  "Las marcas ya no se guardan por proyecto: cada gasto lleva la suya.";

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;
  void params;
  return NextResponse.json(
    { error: MSG_MARCAS_POR_PROYECTO_RETIRADAS },
    { status: 410 },
  );
}
