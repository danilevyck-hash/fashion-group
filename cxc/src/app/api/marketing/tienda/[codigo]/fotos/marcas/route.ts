// ============================================================================
// 🔴 LAS MARCAS ABIERTAS DE UNA TIENDA — lo que la pantalla pregunta antes de
// abrir el selector de archivo (24-sep-2026).
//
// Daniel: *«las fotos deben ir a la tienda del período abierto; un período
// cerrado, nada debe entrar ni salir»*. Los períodos son POR MARCA, así que
// una tienda puede tener DOS abiertos a la vez (medido hoy: Outlet Duty Free
// N3 tiene Calvin y Tommy; D-170 también; D-87 tiene solo Joybees).
//
//   · una sola marca → la pantalla NO pregunta y la foto va ahí;
//   · dos o más      → se elige con un toque, y el POST lo vuelve a validar.
//
// 🔴 Esta ruta solo LEE. El sello lo decide el POST de las fotos, nunca esto.
// 🔴 Falla ABIERTA: sin la columna, sin las tablas o con un hipo de red
// contesta 200 con la lista vacía, y con lista vacía la foto se guarda sin
// sello — exactamente lo de hoy.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { ROLES_MARKETING } from "@/lib/marketing/roles";
import { esCodigoGeneral, VISTA_TIENDA } from "@/lib/marketing/vista-tienda";
import { TIENDA_GENERAL } from "@/lib/marketing/gasto";
import {
  MARKETING_FOTOS_CON_PERIODO,
  necesitaElegirMarca,
} from "@/lib/marketing/fotos-periodo";
import { marcasAbiertasDeLaTienda } from "@/lib/marketing/fotos-periodo-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: { codigo: string } },
) {
  const auth = requireRole(req, [...ROLES_MARKETING]);
  if (auth instanceof NextResponse) return auth;
  if (!VISTA_TIENDA) {
    return NextResponse.json({ error: "No disponible" }, { status: 404 });
  }
  const crudo = String(params.codigo ?? "").trim();
  if (crudo.length === 0 || crudo.length > 40) {
    return NextResponse.json({ error: "Código inválido" }, { status: 400 });
  }
  const codigo = esCodigoGeneral(crudo)
    ? TIENDA_GENERAL.toUpperCase()
    : crudo.toUpperCase();

  const marcas = MARKETING_FOTOS_CON_PERIODO
    ? await marcasAbiertasDeLaTienda(codigo)
    : [];
  const res = NextResponse.json({ marcas, hayQueElegir: necesitaElegirMarca(marcas) });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
