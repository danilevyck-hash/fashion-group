// Refetch endpoint para el tab Clientes de /ventas (vista 12m rolling).
// Path separado de /api/ventas/clientes (legacy, top-N por empresa-mes).
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { fetchClientes } from "@/lib/ventas/queries";

export const dynamic = "force-dynamic";
// Mismo load anual de Ventas (cruza el empalme switch_facturas/ventas_raw).
// maxDuration explícito para sobrevivir cold-starts tras un deploy (evita 500).
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // 🔴 Solo admin, como la pantalla (11-sep-2026): `/ventas` manda a casa a todo
  // lo que no sea admin, pero esta ruta dejaba entrar a contabilidad — con su
  // sesión y la dirección se llevaba los datos del grupo sin abrir la pantalla.
  const auth = requireRole(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const empresa = req.nextUrl.searchParams.get("empresa");
  const yearParam = req.nextUrl.searchParams.get("year");
  const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: "year inválido" }, { status: 400 });
  }

  try {
    const clientes = await fetchClientes({ year, empresaKey: empresa });
    return NextResponse.json(clientes);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
