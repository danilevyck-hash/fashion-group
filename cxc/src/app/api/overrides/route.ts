import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import {
  CAMPOS_OBLIGATORIOS,
  respuestaErrorEscritura,
  textoObligatorio,
  validarObligatorios,
} from "@/lib/campos-obligatorios";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria"]); if (auth instanceof NextResponse) return auth;
  const { data, error } = await supabaseServer.from("cxc_client_overrides").select("*");
  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;
  const body = await req.json();

  // `cxc_client_overrides.nombre_normalized` es NOT NULL sin default Y es la
  // llave del `onConflict`: vacío no solo rompe el upsert, puede pisar la fila
  // equivocada. Su ruta hermana `/api/cxc/overrides` ya validaba esto — las dos
  // escriben la MISMA tabla y estaban desincronizadas.
  const falta = validarObligatorios(body, CAMPOS_OBLIGATORIOS.cxc_client_overrides);
  if (falta) return falta;

  const { correo, telefono, celular, contacto, resultado_contacto, proximo_seguimiento } = body;

  // Build update object — only include contact tracking fields if provided
  const upsertData: Record<string, unknown> = {
    nombre_normalized: textoObligatorio(body.nombre_normalized),
    correo,
    telefono,
    celular,
    contacto,
    updated_at: new Date().toISOString(),
  };
  if (resultado_contacto !== undefined) upsertData.resultado_contacto = resultado_contacto;
  if (proximo_seguimiento !== undefined) upsertData.proximo_seguimiento = proximo_seguimiento;

  const { data, error } = await supabaseServer
    .from("cxc_client_overrides")
    .upsert(upsertData, { onConflict: "nombre_normalized" })
    .select()
    .single();

  if (error) return respuestaErrorEscritura(error, { tabla: "cxc_client_overrides", accion: "CXC › datos de contacto del cliente" });
  return NextResponse.json(data);
}
