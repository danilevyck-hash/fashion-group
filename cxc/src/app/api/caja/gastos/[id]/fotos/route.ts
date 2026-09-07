import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { logActivity } from "@/lib/log-activity";
import { requireRole } from "@/lib/requireRole";
import { BUCKET_FOTOS_CAJA, rutaDeFoto, validarArchivoFoto } from "@/lib/caja/fotos";

const CAJA_ROLES = ["admin", "secretaria"];

export const dynamic = "force-dynamic";

/** Una hora: lo que dura mirar un recibo, no más. */
const SEGUNDOS_URL_FIRMADA = 3600;

const SIN_TABLA =
  "Todavía no se puede guardar la foto del recibo. Avísale a Daniel: falta aplicar el cambio de la base.";

interface FilaFoto {
  id: string;
  path: string;
  nombre: string;
  tipo: string;
  bytes: number;
  subida_en: string;
}

/** Las fotos de un gasto, cada una con su enlace firmado. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(req, CAJA_ROLES);
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await supabaseServer
    .from("caja_gasto_fotos")
    .select("id, path, nombre, tipo, bytes, subida_en")
    .eq("gasto_id", params.id)
    .eq("deleted", false)
    .order("subida_en", { ascending: true });

  // Falla ABIERTA: sin la DDL 20261013120000 la tabla no existe y el gasto se
  // ve sin fotos, igual que antes. No se rompe la pantalla por esto.
  if (error) return NextResponse.json({ fotos: [] });

  const fotos = await Promise.all(
    ((data || []) as FilaFoto[]).map(async (f) => {
      const { data: firmada } = await supabaseServer.storage
        .from(BUCKET_FOTOS_CAJA)
        .createSignedUrl(f.path, SEGUNDOS_URL_FIRMADA);
      return { ...f, url: firmada?.signedUrl || null };
    }),
  );
  return NextResponse.json({ fotos });
}

/**
 * Sube una o varias fotos de un recibo.
 *
 * 🔴 La lista SUMA: esto AGREGA, nunca reemplaza lo que ya está. Y sin botón de
 * guardar — la pantalla llama a esto apenas el archivo cae.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(req, CAJA_ROLES);
  if (auth instanceof NextResponse) return auth;
  if (!auth.userId) return NextResponse.json({ error: "Sesión inválida" }, { status: 401 });

  const { data: gasto } = await supabaseServer
    .from("caja_gastos")
    .select("id, deleted, caja_periodos(estado, deleted)")
    .eq("id", params.id)
    .maybeSingle();
  if (!gasto || gasto.deleted) return NextResponse.json({ error: "Este gasto ya no existe." }, { status: 404 });
  const periodo = Array.isArray(gasto.caja_periodos) ? gasto.caja_periodos[0] : gasto.caja_periodos;
  if (!periodo || periodo.deleted) return NextResponse.json({ error: "Este período ya no existe." }, { status: 400 });
  if (periodo.estado !== "abierto") {
    return NextResponse.json({ error: "No se pueden agregar fotos a un período cerrado." }, { status: 400 });
  }

  let form: FormData;
  try { form = await req.formData(); } catch {
    return NextResponse.json({ error: "No llegó ningún archivo. Vuelve a elegir la foto." }, { status: 400 });
  }
  const archivos = form.getAll("archivo").filter((v): v is File => v instanceof File);
  if (archivos.length === 0) {
    return NextResponse.json({ error: "No llegó ningún archivo. Vuelve a elegir la foto." }, { status: 400 });
  }

  const subidas: FilaFoto[] = [];
  for (const archivo of archivos) {
    const problema = validarArchivoFoto({ nombre: archivo.name, tipo: archivo.type, bytes: archivo.size });
    if (problema) return NextResponse.json({ error: problema }, { status: 400 });

    const fotoId = crypto.randomUUID();
    const path = rutaDeFoto(params.id, fotoId, archivo.type, archivo.name);
    const { error: errorSubida } = await supabaseServer.storage
      .from(BUCKET_FOTOS_CAJA)
      .upload(path, new Uint8Array(await archivo.arrayBuffer()), {
        contentType: archivo.type,
        upsert: false,
      });
    if (errorSubida) {
      console.error(errorSubida);
      return NextResponse.json({ error: `No se pudo guardar «${archivo.name}». Intenta de nuevo en unos segundos.` }, { status: 500 });
    }

    const { data: fila, error: errorFila } = await supabaseServer
      .from("caja_gasto_fotos")
      .insert({
        id: fotoId,
        gasto_id: params.id,
        path,
        nombre: archivo.name,
        tipo: archivo.type,
        bytes: archivo.size,
        subida_por: auth.userId,
      })
      .select("id, path, nombre, tipo, bytes, subida_en")
      .single();
    if (errorFila) {
      // El archivo quedó arriba sin fila: se saca para no dejar basura.
      await supabaseServer.storage.from(BUCKET_FOTOS_CAJA).remove([path]);
      console.error(errorFila);
      return NextResponse.json({ error: SIN_TABLA }, { status: 500 });
    }
    subidas.push(fila as FilaFoto);
  }

  await logActivity(auth.role, "caja_gasto_foto_agregar", "caja", {
    gastoId: params.id, cuantas: subidas.length,
  }, auth.userName);

  return NextResponse.json({ fotos: subidas });
}

/**
 * Quita UNA foto sin tocar las demás. Soft delete FIRMADO: el archivo se queda
 * en su lugar y la fila se apaga — nada se borra de verdad.
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(req, CAJA_ROLES);
  if (auth instanceof NextResponse) return auth;
  if (!auth.userId) return NextResponse.json({ error: "Sesión inválida" }, { status: 401 });

  const fotoId = req.nextUrl.searchParams.get("foto") || "";
  if (!fotoId) return NextResponse.json({ error: "Falta cuál foto quitar." }, { status: 400 });

  const { data: existing } = await supabaseServer
    .from("caja_gasto_fotos")
    .select("id, nombre, deleted")
    .eq("id", fotoId)
    .eq("gasto_id", params.id)
    .maybeSingle();
  if (!existing || existing.deleted) return NextResponse.json({ error: "Esta foto ya no está." }, { status: 404 });

  const { error } = await supabaseServer
    .from("caja_gasto_fotos")
    .update({ deleted: true, deleted_por: auth.userId, deleted_en: new Date().toISOString() })
    .eq("id", fotoId);
  if (error) return NextResponse.json({ error: "No se pudo quitar la foto. Intenta de nuevo." }, { status: 500 });

  await logActivity(auth.role, "caja_gasto_foto_quitar", "caja", {
    gastoId: params.id, fotoId, nombre: existing.nombre,
  }, auth.userName);

  return NextResponse.json({ ok: true });
}
