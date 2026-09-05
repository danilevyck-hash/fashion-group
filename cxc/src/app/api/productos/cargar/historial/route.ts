import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, HAS_SERVICE_ROLE } from "@/lib/supabase-server";
import { requireAuth, getSession } from "@/lib/require-auth";
import {
  ARCHIVO_MAX_BYTES,
  BUCKET_PLANTILLAS,
  contentTypeDe,
  nombreSaneado,
} from "@/lib/depurador/historial-archivos";

export const dynamic = "force-dynamic";

const ALLOWED = ["admin", "secretaria"];

// carga_history tiene RLS `to service_role`: sin la key, el rol anon falla en
// silencio. Fallamos ruidosamente.
const MISCONFIG = NextResponse.json(
  { error: "Falta SUPABASE_SERVICE_ROLE_KEY en este entorno: el historial no se puede leer ni registrar." },
  { status: 503 }
);

interface CargaPayload {
  empresa: string;
  marca: string;
  cantidad_estilos: number;
  total_unidades: number;
  total_costo: number;
}

interface CargaRowDb {
  id: string;
  usuario: string;
  empresa: string;
  marca: string;
  cantidad_estilos: number;
  total_unidades: number;
  total_costo: number;
  created_at: string;
  archivo_path?: string | null;
  archivo_nombre?: string | null;
}

/** Lista el historial de cargas, más reciente primero. Todos (admin y
 *  secretaria) ven todo — Daniel: «todos». `select("*")` a propósito: funciona
 *  igual antes y después de la DDL que agrega las columnas del archivo. */
export async function GET(req: NextRequest) {
  const authError = requireAuth(req, ALLOWED);
  if (authError) return authError;
  if (!HAS_SERVICE_ROLE) return MISCONFIG;

  const { data, error } = await supabaseServer
    .from("carga_history")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    return NextResponse.json({ error: "No se pudo cargar el historial." }, { status: 500 });
  }
  const rows = ((data ?? []) as CargaRowDb[]).map((r) => ({
    id: r.id,
    usuario: r.usuario,
    empresa: r.empresa,
    marca: r.marca,
    cantidad_estilos: r.cantidad_estilos,
    total_unidades: r.total_unidades,
    total_costo: r.total_costo,
    created_at: r.created_at,
    tiene_archivo: Boolean(r.archivo_path),
    archivo_nombre: r.archivo_nombre ?? null,
  }));
  return NextResponse.json({ rows });
}

/** Registra una carga (se llama al descargar la plantilla).
 *
 *  Desde el 4-sep-2026 acepta multipart/form-data con el campo `archivo`: el
 *  MISMO Excel que se descargó, que queda 90 días en el bucket privado
 *  `depurador-plantillas` para poder volver a bajarlo del Historial. El
 *  archivo es SECUNDARIO: si su subida falla (o la DDL de las columnas no
 *  corrió), la fila con los totales se registra igual — nunca al revés.
 *  El JSON de siempre sigue aceptado. */
export async function POST(req: NextRequest) {
  const authError = requireAuth(req, ALLOWED);
  if (authError) return authError;
  if (!HAS_SERVICE_ROLE) return MISCONFIG;

  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  let body: Partial<CargaPayload>;
  let archivo: File | null = null;
  const contentType = req.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("multipart/form-data")) {
      const fd = await req.formData();
      body = {
        empresa: String(fd.get("empresa") ?? ""),
        marca: String(fd.get("marca") ?? ""),
        cantidad_estilos: Number(fd.get("cantidad_estilos")),
        total_unidades: Number(fd.get("total_unidades")),
        total_costo: Number(fd.get("total_costo")),
      };
      const f = fd.get("archivo");
      if (f instanceof File && f.size > 0 && f.size <= ARCHIVO_MAX_BYTES) archivo = f;
    } else {
      body = await req.json();
    }
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }

  // Validación en el borde: no confiar en el cliente.
  const empresa = String(body.empresa ?? "").trim();
  const marca = String(body.marca ?? "").trim();
  const cantidad_estilos = Number(body.cantidad_estilos);
  const total_unidades = Number(body.total_unidades);
  const total_costo = Number(body.total_costo);

  if (
    !Number.isFinite(cantidad_estilos) || cantidad_estilos < 0 ||
    !Number.isFinite(total_unidades) || total_unidades < 0 ||
    !Number.isFinite(total_costo) || total_costo < 0
  ) {
    return NextResponse.json({ error: "Totales inválidos." }, { status: 400 });
  }

  const { data: creada, error } = await supabaseServer
    .from("carga_history")
    .insert({
      usuario: session.userName || session.role || "—",
      empresa,
      marca,
      cantidad_estilos: Math.round(cantidad_estilos),
      total_unidades: Math.round(total_unidades),
      total_costo,
    })
    .select("id")
    .single();

  if (error || !creada) {
    return NextResponse.json({ error: "No se pudo registrar la carga." }, { status: 500 });
  }

  // El archivo, best-effort: la ruta va bajo el id de la fila (única por
  // construcción, no se pisa nunca). Si algo falla se registra en el log del
  // server y la fila queda sin botón — igual que una corrida vieja.
  if (archivo) {
    const nombre = nombreSaneado(archivo.name);
    const path = `${creada.id}/${nombre}`;
    const buffer = Buffer.from(await archivo.arrayBuffer());
    const { error: upErr } = await supabaseServer.storage
      .from(BUCKET_PLANTILLAS)
      .upload(path, buffer, { contentType: contentTypeDe(nombre), upsert: true });
    if (upErr) {
      console.error("[historial-depurador] no se pudo guardar el archivo:", upErr.message);
    } else {
      const { error: updErr } = await supabaseServer
        .from("carga_history")
        .update({ archivo_path: path, archivo_nombre: archivo.name.slice(0, 200) })
        .eq("id", creada.id);
      if (updErr) {
        // DDL pendiente (columnas sin crear) u otro error: la fila queda sin
        // botón. El objeto recién subido se borra para no dejar huérfanos que
        // la limpieza de 90 días (que camina por archivo_path) nunca vería.
        console.error("[historial-depurador] no se pudo anotar el archivo en la fila:", updErr.message);
        await supabaseServer.storage.from(BUCKET_PLANTILLAS).remove([path]);
      }
    }
  }

  return NextResponse.json({ ok: true, id: creada.id });
}
