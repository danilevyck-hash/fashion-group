import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET() {
  const errors: string[] = [];

  const { data: productos, error: e1 } = await supabaseServer
    .from("camisetas_productos").select("*").order("genero").order("color");
  if (e1) { console.error("camisetas_productos error:", e1.message); errors.push(`productos: ${e1.message}`); }

  const { data: clientes, error: e2 } = await supabaseServer
    .from("camisetas_clientes").select("*").order("nombre");
  if (e2) { console.error("camisetas_clientes error:", e2.message); errors.push(`clientes: ${e2.message}`); }

  const { data: pedidos, error: e3 } = await supabaseServer
    .from("camisetas_pedidos").select("*");
  if (e3) { console.error("camisetas_pedidos error:", e3.message); errors.push(`pedidos: ${e3.message}`); }

  return NextResponse.json({
    productos: productos || [],
    clientes: clientes || [],
    pedidos: pedidos || [],
    errors: errors.length > 0 ? errors : undefined,
  });
}
