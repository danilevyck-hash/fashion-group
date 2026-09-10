/* ─────────────────────────────────────────────────────────────────────────────
 * LA FOTO DE LA CÉDULA — subir, ver, descargar y quitar.
 *
 * Daniel: *«cédula que se pueda ver o descargar la foto»*.
 *
 * 🔴 EL BUCKET ES PRIVADO Y NUNCA SE PUBLICA. La foto sale de acá SIEMPRE por
 * URL FIRMADA que vence en una hora (`createSignedUrl`) — nunca por
 * `getPublicUrl`, que es una dirección eterna para cualquiera que la adivine.
 * Es un documento de identidad, no la foto de un mueble.
 *
 * 🔴 LA SUBEN LOS MISMOS QUE TOCAN LA FICHA: Daniel y la contadora
 * (`puedeCerrar`, la lista derivada de siempre). La secretaria la VE — el
 * comprobante que ella imprime la lleva — y no la cambia.
 *
 * 🔑 EN LA BASE SE GUARDA EL PATH, NUNCA LA URL. Guardar un enlace firmado
 * sería guardar algo que mañana no sirve.
 * ────────────────────────────────────────────────────────────────────────── */

import { NextResponse, type NextRequest } from "next/server";
import { requireAsistencia } from "@/lib/asistencia/guard";
import { asistenciaRoles, cerrarPlanillaRoles } from "@/lib/asistencia/roles";
import { supabaseServer } from "@/lib/supabase-server";
import { TABLA_PERSONAS } from "@/lib/asistencia/config-server";
import { COLUMNA_CEDULA_FOTO } from "@/lib/asistencia/datos-del-papel";
import {
  BUCKET_CEDULAS,
  MAX_BYTES_CEDULA,
  SEGUNDOS_URL_FIRMADA,
  rutaDeCedula,
  validarArchivoCedula,
} from "@/lib/asistencia/cedula-foto";

export const dynamic = "force-dynamic";

const codigoDe = (req: NextRequest) =>
  (req.nextUrl.searchParams.get("codigo") ?? "").trim();

/** El path guardado de esa persona, o `null`. */
async function pathGuardado(codigo: string): Promise<string | null> {
  const { data, error } = await supabaseServer
    .from(TABLA_PERSONAS)
    .select(COLUMNA_CEDULA_FOTO)
    .eq("empleado_codigo", codigo)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const p = (data as Record<string, unknown> | null)?.[COLUMNA_CEDULA_FOTO];
  const s = String(p ?? "").trim();
  return s === "" ? null : s;
}

/**
 * VER Y DESCARGAR. Devuelve la URL firmada; la pantalla la abre en otra
 * pestaña, que es a la vez el «ver» y el «descargar» (mismo patrón que Caja).
 *
 * 🔑 Sin foto NO es un error: es `{ url: null }`. Una ficha sin cédula cargada
 * es lo normal en 37 de 37 fichas el día que esto se estrena.
 */
export async function GET(req: NextRequest) {
  const auth = requireAsistencia(req, asistenciaRoles());
  if (auth instanceof NextResponse) return auth;

  const codigo = codigoDe(req);
  if (!codigo) return NextResponse.json({ error: "Falta el código." }, { status: 400 });

  try {
    const path = await pathGuardado(codigo);
    if (!path) {
      return NextResponse.json({
        url: null,
        path: null,
        puedeCambiar: cerrarPlanillaRoles().includes(String(auth.role ?? "")),
      });
    }
    const { data, error } = await supabaseServer.storage
      .from(BUCKET_CEDULAS)
      .createSignedUrl(path, SEGUNDOS_URL_FIRMADA);
    if (error) throw new Error(error.message);
    return NextResponse.json({
      url: data?.signedUrl ?? null,
      path,
      puedeCambiar: cerrarPlanillaRoles().includes(String(auth.role ?? "")),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[asistencia/cedula-foto GET]", msg);
    return NextResponse.json(
      { error: "No se pudo abrir la foto. Intenta de nuevo en unos segundos." },
      { status: 500 },
    );
  }
}

/**
 * SUBIR (o reemplazar). El archivo viaja en un `FormData`, campo `archivo`.
 *
 * 🩸 EL OBJETO VIEJO SE BORRA DESPUÉS DE QUE LA FILA APUNTA AL NUEVO, nunca
 * antes: al revés, un fallo entre medio deja la ficha apuntando a un archivo
 * que ya no existe — o sea, la cédula perdida sin que nadie lo note hasta que
 * alguien la busca.
 */
export async function POST(req: NextRequest) {
  const auth = requireAsistencia(req, asistenciaRoles());
  if (auth instanceof NextResponse) return auth;
  if (!cerrarPlanillaRoles().includes(String(auth.role ?? ""))) {
    return NextResponse.json(
      { error: "La foto de la cédula la cargan Daniel y contabilidad." },
      { status: 403 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "No se entendió el archivo que se envió." }, { status: 400 });
  }

  const codigo = String(form.get("codigo") ?? "").trim();
  if (!codigo) return NextResponse.json({ error: "Falta el código." }, { status: 400 });

  const archivo = form.get("archivo");
  if (!(archivo instanceof File)) {
    return NextResponse.json({ error: "No llegó ninguna foto." }, { status: 400 });
  }

  // 🔴 EL SERVIDOR VUELVE A VALIDAR. Lo que la pantalla dejó pasar no importa:
  // es la MISMA función pura, así que los dos dicen exactamente lo mismo.
  const malo = validarArchivoCedula({
    nombre: archivo.name,
    tipo: archivo.type,
    bytes: archivo.size,
  });
  if (malo) return NextResponse.json({ error: malo }, { status: 400 });
  if (archivo.size > MAX_BYTES_CEDULA) {
    return NextResponse.json({ error: "La foto pesa demasiado." }, { status: 400 });
  }

  try {
    const anterior = await pathGuardado(codigo);
    const path = rutaDeCedula(codigo, Date.now(), archivo.type, archivo.name);

    const subida = await supabaseServer.storage
      .from(BUCKET_CEDULAS)
      .upload(path, new Uint8Array(await archivo.arrayBuffer()), {
        contentType: archivo.type || "application/octet-stream",
        upsert: false,
      });
    if (subida.error) throw new Error(subida.error.message);

    const { error } = await supabaseServer
      .from(TABLA_PERSONAS)
      .update({ [COLUMNA_CEDULA_FOTO]: path, updated_at: new Date().toISOString() })
      .eq("empleado_codigo", codigo);
    if (error) {
      // La fila no quedó apuntando al archivo nuevo: se retira el objeto para
      // no dejar basura suelta en el bucket.
      await supabaseServer.storage.from(BUCKET_CEDULAS).remove([path]);
      throw new Error(error.message);
    }

    // Recién ahora se retira el anterior: la ficha ya apunta al nuevo.
    if (anterior && anterior !== path) {
      await supabaseServer.storage.from(BUCKET_CEDULAS).remove([anterior]);
    }

    const firmada = await supabaseServer.storage
      .from(BUCKET_CEDULAS)
      .createSignedUrl(path, SEGUNDOS_URL_FIRMADA);
    return NextResponse.json({ ok: true, path, url: firmada.data?.signedUrl ?? null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[asistencia/cedula-foto POST]", msg);
    return NextResponse.json(
      { error: "No se pudo guardar la foto. Intenta de nuevo en unos segundos." },
      { status: 500 },
    );
  }
}

/**
 * QUITARLA. Si se puede agregar, se tiene que poder quitar (regla de la casa).
 * Se vacía la columna y se retira el objeto: acá no hay historial que conservar
 * — es una foto, no un movimiento de plata.
 */
export async function DELETE(req: NextRequest) {
  const auth = requireAsistencia(req, asistenciaRoles());
  if (auth instanceof NextResponse) return auth;
  if (!cerrarPlanillaRoles().includes(String(auth.role ?? ""))) {
    return NextResponse.json(
      { error: "La foto de la cédula la cargan Daniel y contabilidad." },
      { status: 403 },
    );
  }

  const codigo = codigoDe(req);
  if (!codigo) return NextResponse.json({ error: "Falta el código." }, { status: 400 });

  try {
    const anterior = await pathGuardado(codigo);
    const { error } = await supabaseServer
      .from(TABLA_PERSONAS)
      .update({ [COLUMNA_CEDULA_FOTO]: null, updated_at: new Date().toISOString() })
      .eq("empleado_codigo", codigo);
    if (error) throw new Error(error.message);
    if (anterior) await supabaseServer.storage.from(BUCKET_CEDULAS).remove([anterior]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[asistencia/cedula-foto DELETE]", msg);
    return NextResponse.json(
      { error: "No se pudo quitar la foto. Intenta de nuevo." },
      { status: 500 },
    );
  }
}
