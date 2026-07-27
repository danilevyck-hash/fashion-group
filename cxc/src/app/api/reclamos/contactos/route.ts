import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";
import {
  CAMPOS_OBLIGATORIOS,
  respuestaErrorEscritura,
  validarObligatorios,
} from "@/lib/campos-obligatorios";

const RECLAMOS_ROLES = ["admin", "secretaria"];
// whatsapp se capturaba sin uso (nunca se lee ni muestra); se retira del capture.
// La columna reclamo_contactos.whatsapp se conserva en DB por si acaso.
//
// `nombre` SE RETIRÓ de esta lista el 27-jul-2026: la columna NO EXISTE en la
// tabla (medido contra el OpenAPI de PostgREST — las columnas reales son id,
// empresa, nombre_contacto, whatsapp, correo, activo, created_at). Mientras
// estuvo acá, un cliente que mandara `nombre` conseguía un PGRST204 ("Could not
// find the 'nombre' column") y la pantalla decía "Error al crear contacto" sin
// más. El nombre del contacto vive en `nombre_contacto`.
const ALLOWED_FIELDS = ["empresa", "nombre_contacto", "correo", "activo"];

function pick(body: Record<string, unknown>, fields: string[]) {
  const result: Record<string, unknown> = {};
  for (const f of fields) { if (f in body) result[f] = body[f]; }
  return result;
}

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;
  const { data, error } = await supabaseServer
    .from("reclamo_contactos")
    .select("*")
    .eq("activo", true)
    .order("empresa");

  if (error) return NextResponse.json({ error: "Error al cargar contactos" }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, RECLAMOS_ROLES);
  if (auth instanceof NextResponse) return auth;
  const body = await req.json();

  // Se exigían solo `empresa`, pero `nombre_contacto` también es NOT NULL sin
  // default: un contacto sin nombre daba 23502 tapado por "Error al crear
  // contacto", sin decir cuál de los dos campos faltaba.
  const falta = validarObligatorios(body, CAMPOS_OBLIGATORIOS.reclamo_contactos);
  if (falta) return falta;

  const fields = pick(body, ALLOWED_FIELDS);
  const { data, error } = await supabaseServer
    .from("reclamo_contactos")
    .insert(fields)
    .select()
    .single();

  if (error) return respuestaErrorEscritura(error, { tabla: "reclamo_contactos", accion: "Reclamos › contactos de proveedor" });
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest) {
  const auth = requireRole(req, RECLAMOS_ROLES);
  if (auth instanceof NextResponse) return auth;
  const body = await req.json();
  const { id } = body;
  if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 });

  // En el UPDATE los obligatorios solo se validan si vienen: un PATCH parcial
  // que no los toca es legítimo, pero mandarlos vacíos dejaría la fila rota.
  const presentes = CAMPOS_OBLIGATORIOS.reclamo_contactos.filter((c) => c.columna in body);
  if (presentes.length) {
    const falta = validarObligatorios(body, presentes);
    if (falta) return falta;
  }

  const fields = pick(body, ALLOWED_FIELDS);

  const { data, error } = await supabaseServer
    .from("reclamo_contactos")
    .update(fields)
    .eq("id", id)
    .select()
    .single();

  if (error) return respuestaErrorEscritura(error, { tabla: "reclamo_contactos", accion: "Reclamos › contactos de proveedor" });
  return NextResponse.json(data);
}
