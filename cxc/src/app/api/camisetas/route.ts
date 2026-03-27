import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET() {
  const [{ data: productos }, { data: clientes }, { data: pedidos }] = await Promise.all([
    supabaseServer.from("camisetas_productos").select("*").order("genero").order("color"),
    supabaseServer.from("camisetas_clientes").select("*").order("nombre"),
    supabaseServer.from("camisetas_pedidos").select("*"),
  ]);

  return NextResponse.json({
    productos: productos || [],
    clientes: clientes || [],
    pedidos: pedidos || [],
  });
}
