/**
 * Directorio de clientes de Switch de UNA empresa, para el selector de
 * «Clientes que no comisionan» (Comisiones › Configurar). SOLO admin.
 *
 * Mismo contrato que /api/catalogo/[marca]/clientes-switch (GET ?q=), porque
 * el selector es el MISMO componente: `ClienteSwitchPicker`, el único
 * selector de cliente de Switch permitido en el sistema (hay barrido que pone
 * el build rojo si aparece otro). Aquí la empresa va en la URL en vez de salir
 * de la marca: las comisiones son de las 6 del grupo, no de un catálogo.
 *
 * Solo lectura de la tabla LOCAL switch_clientes (la llena el sync). Sin alta.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { EMPRESAS_COMISIONAN } from "@/lib/comisiones/empresas";
import { CODIGO_CLIENTE_CONTADO } from "@/lib/catalogo/publico-switch-actor";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { empresa: string } }) {
  const auth = requireRole(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const empresa = params.empresa;
  if (!(EMPRESAS_COMISIONAN as readonly string[]).includes(empresa)) {
    return NextResponse.json({ error: "Empresa desconocida" }, { status: 404 });
  }

  // Sanitizar q: coma/paréntesis rompen la sintaxis de .or() de PostgREST.
  const q = (req.nextUrl.searchParams.get("q") || "").trim().replace(/[,()%]/g, " ").trim();
  let query = supabaseServer
    .from("switch_clientes")
    .select("cliente_switch_id, codigo, nombre")
    .eq("empresa_key", empresa)
    .order("nombre", { ascending: true })
    .limit(20);
  if (q.length > 0) query = query.or(`nombre.ilike.%${q}%,codigo.ilike.%${q}%`);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "Error interno" }, { status: 500 });

  // El selector compartido espera `contado`; el mostrador ya no comisiona, así
  // que elegirlo lo rechaza el POST. Se manda igual para respetar el contrato.
  const { data: contado } = await supabaseServer
    .from("switch_clientes")
    .select("cliente_switch_id, codigo, nombre")
    .eq("empresa_key", empresa)
    .eq("codigo", CODIGO_CLIENTE_CONTADO)
    .limit(1)
    .maybeSingle();

  return NextResponse.json({ clientes: data ?? [], contado: contado ?? null });
}
