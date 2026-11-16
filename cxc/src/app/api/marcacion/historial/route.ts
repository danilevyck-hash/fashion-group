// GET /api/marcacion/historial?quincena=YYYY-MM-1|2 — «Mis marcaciones»
// (16-nov-2026). SOLO LEE.
//
// 🔴 Cada persona ve SOLO lo suyo: el código sale de la SESIÓN
// (`fg_users.empleado_codigo`), nunca de la URL. Un `?codigo=` se ignora.
// 🔴 Las horas son las CORREGIDAS (`leerMarcasEfectivas`, el orden de la
// planilla). El botón de marcar no lee esto.

import { NextResponse, type NextRequest } from "next/server";
import { leerEmpleadoCodigo, requireMarcacion } from "@/lib/marcacion/acceso";
import { leerMarcasEfectivas } from "@/lib/asistencia/quien-marco-server";
import { hoyPanama } from "@/lib/fecha-panama";
import { AVISO_SIN_CODIGO, quincenaDeHoy } from "@/lib/marcacion/marcacion";
import {
  claveDeQuincena,
  filasDelHistorial,
  PRIMERA_QUINCENA,
  quincenaAnterior,
  quincenaPedida,
  quincenaSiguiente,
  rotuloDelHistorial,
} from "@/lib/marcacion/historial";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireMarcacion(req);
  if (auth instanceof NextResponse) return auth;
  const codigo = await leerEmpleadoCodigo(auth.userId);
  if (!codigo) return NextResponse.json({ error: AVISO_SIN_CODIGO }, { status: 404 });

  const hoy = hoyPanama();
  const q = quincenaPedida(req.nextUrl.searchParams.get("quincena"), hoy);
  try {
    const marcas = await leerMarcasEfectivas(q.desde, q.hasta, codigo);
    const anterior = quincenaAnterior(q);
    const siguiente = quincenaSiguiente(q);
    return NextResponse.json({
      quincena: claveDeQuincena(q),
      rotulo: rotuloDelHistorial(q, hoy),
      anterior: anterior.desde >= PRIMERA_QUINCENA ? claveDeQuincena(anterior) : null,
      siguiente: siguiente.desde <= quincenaDeHoy(hoy).desde ? claveDeQuincena(siguiente) : null,
      filas: filasDelHistorial(marcas.map((m) => ({ ocurrioEn: m.ocurrio_en })), hoy),
    });
  } catch (e) {
    console.error("[marcacion historial]", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: "No se pudieron leer tus marcaciones. Intenta de nuevo en unos segundos." },
      { status: 500 },
    );
  }
}
