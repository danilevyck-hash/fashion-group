import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { limpiezaAnualAnulados } from "@/lib/marketing/mutations";

export const dynamic = "force-dynamic";

// Array vacío → solo admin pasa (admin siempre pasa por defecto).
const ADMIN_ONLY: string[] = [];

// Ventana fija usada para preview y ejecución. Panamá DGI revisa hasta 5 años atrás.
const ANIOS = 5;

interface ConteoPorTabla {
  proyectos: number;
  facturas: number;
}

async function contarElegibles(cutoffIso: string): Promise<ConteoPorTabla> {
  const tablas = ["mk_proyectos", "mk_facturas"] as const;
  const keys = ["proyectos", "facturas"] as const;
  const result: ConteoPorTabla = { proyectos: 0, facturas: 0 };
  for (let i = 0; i < tablas.length; i++) {
    const { count, error } = await supabaseServer
      .from(tablas[i])
      .select("id", { count: "exact", head: true })
      .not("anulado_en", "is", null)
      .lt("anulado_en", cutoffIso);
    if (error) throw new Error(`contar ${tablas[i]}: ${error.message}`);
    result[keys[i]] = count ?? 0;
  }
  return result;
}

function cutoffIso(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - ANIOS);
  return d.toISOString();
}

// Preview: cuántos registros se eliminarían, sin ejecutar.
export async function GET(req: NextRequest) {
  const auth = requireRole(req, ADMIN_ONLY);
  if (auth instanceof NextResponse) return auth;

  try {
    const conteo = await contarElegibles(cutoffIso());
    const total = conteo.proyectos + conteo.facturas;
    return NextResponse.json({ conteo, total, anios: ANIOS });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error interno";
    console.error("GET /api/marketing/papelera/limpieza:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// Ejecuta limpieza definitiva. Requiere body { confirm: true }.
export async function POST(req: NextRequest) {
  const auth = requireRole(req, ADMIN_ONLY);
  if (auth instanceof NextResponse) return auth;

  let body: { confirm?: unknown };
  try {
    body = (await req.json()) as { confirm?: unknown };
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (body.confirm !== true) {
    return NextResponse.json({ error: "Debes confirmar la limpieza" }, { status: 400 });
  }

  try {
    const eliminado = await limpiezaAnualAnulados(ANIOS);
    const total = eliminado.proyectos + eliminado.facturas;
    return NextResponse.json({ eliminado, total, anios: ANIOS });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error interno";
    console.error("POST /api/marketing/papelera/limpieza:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
