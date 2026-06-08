import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// RETIRADO. El workflow enviado/cobrado se reemplazó por abierto ⇄ cerrado.
// Para cerrar un proyecto usa POST /api/marketing/proyectos/[id]/cerrar.
export async function POST(_req: NextRequest) {
  return NextResponse.json(
    { error: "Endpoint retirado. Usa /cerrar (modelo abierto ⇄ cerrado)." },
    { status: 410 },
  );
}
