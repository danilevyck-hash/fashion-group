import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";

// RUTA TEMPORAL DE DIAGNÓSTICO (sprint de performance, jul-2026).
// Mide, DENTRO de la función de Vercel, cuánto tarda cada llamada saliente a
// Supabase en serie y en paralelo. Sirve para responder una sola pregunta:
// ¿`Promise.all` compra algo en este runtime, o las llamadas se serializan?
// Borrar cuando el sprint cierre.
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const RPC_TRIVIAL = () =>
  supabaseServer.rpc("get_app_setting", { p_key: "multifashion_meta_anual_2026" });

async function timed<T>(label: string, run: () => PromiseLike<T>) {
  const t0 = Date.now();
  let err: string | null = null;
  try {
    const res = (await run()) as { error?: { message?: string } | null };
    if (res?.error) err = res.error.message ?? "error";
  } catch (e) {
    err = e instanceof Error ? e.message : String(e);
  }
  return { label, ms: Date.now() - t0, err };
}

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const n = Math.min(12, Math.max(1, Number(req.nextUrl.searchParams.get("n") ?? 6)));
  const out: Record<string, unknown> = { n, region: process.env.VERCEL_REGION ?? null };

  // 1) Una sola llamada, para tener la línea base de ida y vuelta.
  const t1 = Date.now();
  const solo = await timed("solo", RPC_TRIVIAL);
  out.unaSola = { wallMs: Date.now() - t1, ...solo };

  // 2) N llamadas IDÉNTICAS en SERIE.
  const t2 = Date.now();
  const serie: number[] = [];
  for (let i = 0; i < n; i++) serie.push((await timed(`s${i}`, RPC_TRIVIAL)).ms);
  out.serie = { wallMs: Date.now() - t2, cadaUna: serie };

  // 3) Las MISMAS N llamadas en PARALELO. Si el runtime paraleliza de verdad,
  //    wallMs ~= una sola. Si serializa, wallMs ~= la suma de la serie.
  const t3 = Date.now();
  const par = await Promise.all(
    Array.from({ length: n }, (_, i) => timed(`p${i}`, RPC_TRIVIAL)),
  );
  out.paralelo = { wallMs: Date.now() - t3, cadaUna: par.map(p => p.ms) };

  // 4) Las 6 llamadas REALES del Resumen de /ventas, en paralelo, cronometradas
  //    una por una — para ver cuál domina el tiempo de la página.
  const year = new Date().getFullYear();
  const t4 = Date.now();
  const reales = await Promise.all([
    timed("ventas_dashboard_summary", () => supabaseServer.rpc("ventas_dashboard_summary", { p_anio: year })),
    timed("prev_same_period_v2", () => supabaseServer.rpc("ventas_dashboard_prev_same_period_v2", { p_year: year })),
    timed("get_app_setting", RPC_TRIVIAL),
    timed("proyeccion_v7", () => supabaseServer.rpc("ventas_proyeccion_cierre_v7", { p_anio: year })),
    timed("proyeccion_v6", () => supabaseServer.rpc("ventas_proyeccion_cierre_v6", { p_anio: year })),
    timed("switch_facturas.synced_at", () =>
      supabaseServer.from("switch_facturas").select("synced_at").order("synced_at", { ascending: false }).limit(1)),
  ]);
  out.resumenReal = { wallMs: Date.now() - t4, llamadas: reales };

  return NextResponse.json(out);
}
