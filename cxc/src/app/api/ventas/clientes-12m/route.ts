// Refetch endpoint para el tab Clientes de /ventas (vista 12m rolling).
// Path separado de /api/ventas/clientes (legacy, top-N por empresa-mes).
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { fetchClientes } from "@/lib/ventas/queries";
import { rangoValido } from "@/lib/ventas/rango-ventas";

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

  // 🔴 «Últimos 12 / 6 meses» (11-sep-2026): el selector único de período de
  // Ventas. Cualquier otro valor = el año. Si la vista no trae la ventana, el
  // servidor sirve el año y lo DICE en la respuesta (`ventana: null`).
  const ventanaRaw = req.nextUrl.searchParams.get("ventana");
  const ventana: 6 | 12 | null = ventanaRaw === "12" ? 12 : ventanaRaw === "6" ? 6 : null;

  // 🔴 «Rango de fechas» (5-oct-2026): ?desde=&hasta= manda sobre el año.
  const desde = req.nextUrl.searchParams.get("desde");
  const hasta = req.nextUrl.searchParams.get("hasta");
  const rango = desde || hasta ? rangoValido(desde, hasta) : null;
  if ((desde || hasta) && !rango) {
    return NextResponse.json({ error: "Rango de fechas inválido" }, { status: 400 });
  }

  try {
    const clientes = await fetchClientes({ year, empresaKey: empresa, ventana, rango });
    return NextResponse.json(clientes);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
