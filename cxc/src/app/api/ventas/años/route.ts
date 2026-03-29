import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET() {
  // Try ventas_raw first (new system)
  const { data, error } = await supabaseServer
    .from("ventas_raw")
    .select("anio");

  if (error) {
    console.error("[ventas/años]", error.code, error.message);
    // Fallback to current year
    return NextResponse.json([new Date().getFullYear()]);
  }

  const years = [...new Set((data || []).map((r: { anio: number }) => r.anio))];
  const currentYear = new Date().getFullYear();
  if (!years.includes(currentYear)) years.push(currentYear);
  return NextResponse.json(years.sort((a, b) => b - a));
}
