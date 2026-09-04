import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { logActivity } from "@/lib/log-activity";
import { getSession } from "@/lib/require-auth";
import { requireRole } from "@/lib/requireRole";
import { CAMPOS_OBLIGATORIOS, respuestaErrorEscritura, validarObligatorios } from "@/lib/campos-obligatorios";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(req, ["admin", "secretaria", "vendedor"]);
  if (auth instanceof NextResponse) return auth;
  if (!UUID_RE.test(params.id)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  const body = await req.json();
  // En un UPDATE, `nombre: undefined` es inofensivo (PostgREST no toca la
  // columna). Lo que sí rompe es mandarla vacía o en null: `nombre` es NOT NULL
  // y dejaría al cliente sin nombre, o daría 23502. Solo se valida si viene.
  if ("nombre" in body) {
    const falta = validarObligatorios(body, CAMPOS_OBLIGATORIOS.directorio_clientes);
    if (falta) return falta;
  }
  // 🩸 SOLO SE ESCRIBEN LOS CAMPOS QUE VINIERON (8-ago-2026).
  //
  // Antes se armaba el UPDATE con las 7 columnas SIEMPRE, así que un formulario
  // que no las mostrara todas las mandaba en `""` y las BORRABA. No era
  // hipotético: el tab "Clientes" del catálogo (`components/catalogo/
  // ClientesClient.tsx`) sólo edita nombre/empresa/correo/WhatsApp y mandaba
  // `telefono: "", celular: "", contacto: "", notas: ""` en cada guardada.
  // Medido: **22 de las 33 fichas** tienen alguno de esos cuatro datos, y son lo
  // único que esa tabla aporta — los cargó Daniel a mano, uno por uno.
  //
  // `nombre` sigue teniendo su validación aparte (es NOT NULL).
  const EDITABLES = [
    "nombre", "empresa", "telefono", "celular", "correo",
    "contacto", "notas", "whatsapp", "cliente_codigo",
  ] as const;
  const cambios: Record<string, unknown> = {};
  for (const k of EDITABLES) if (k in body) cambios[k] = body[k];
  if (Object.keys(cambios).length === 0) {
    return NextResponse.json({ error: "No mandaste ningún cambio" }, { status: 400 });
  }
  const nombre = cambios.nombre;

  // Sin reintento "sin `cliente_codigo`" (tolerancia a DDL retirada el
  // 3-sep-2026): la columna existe desde 20260808180000. Un error es un error.
  const { data, error } = await supabaseServer
    .from("directorio_clientes")
    .update(cambios)
    .eq("id", params.id)
    .select()
    .single();
  if (error) return respuestaErrorEscritura(error, { tabla: "directorio_clientes", accion: "Clientes › editar cliente" });

  const session = getSession(req);
  await logActivity(session?.role || "unknown", "directorio_update", "directorio", { clienteId: params.id, nombre }, session?.userName);

  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  if (!UUID_RE.test(params.id)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  const { data: existing } = await supabaseServer.from("directorio_clientes").select("id, nombre").eq("id", params.id).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });

  const { error } = await supabaseServer.from("directorio_clientes").update({ deleted: true }).eq("id", params.id);
  if (error) return NextResponse.json({ error: "Error interno" }, { status: 500 });

  const session = getSession(req);
  await logActivity(session?.role || "unknown", "directorio_delete", "directorio", { clienteId: params.id, nombre: existing.nombre }, session?.userName);

  return NextResponse.json({ ok: true });
}
