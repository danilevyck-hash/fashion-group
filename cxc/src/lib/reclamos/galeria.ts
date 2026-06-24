import { supabaseServer } from "@/lib/supabase-server";

// Bucket reclamo-fotos es PÚBLICO → URL pública directa, sin re-firmar (a
// diferencia de Marketing, cuyo bucket es privado y re-firma en cada carga).
const SUPA_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

export interface GaleriaFoto {
  url: string;
  nombre: string;
}

export interface GaleriaReclamo {
  nombre: string;
  fotos: GaleriaFoto[];
}

interface FotoRow {
  storage_path: string;
  url: string | null;
  created_at: string | null;
}

/**
 * Datos de la galería pública de UN reclamo.
 *
 * SEGURIDAD: expone ÚNICAMENTE el N° de reclamo + empresa (para el título) y las
 * URLs públicas de las fotos de ESE reclamo. NUNCA montos, ítems, proveedores,
 * ni fotos de otro reclamo.
 */
export async function getGaleriaReclamo(reclamoId: string): Promise<GaleriaReclamo> {
  const { data: rec } = await supabaseServer
    .from("reclamos")
    .select("nro_reclamo, empresa, reclamo_fotos(storage_path, url, created_at)")
    .eq("id", reclamoId)
    .eq("deleted", false)
    .maybeSingle();

  if (!rec) return { nombre: "Reclamo", fotos: [] };

  const nro = (rec.nro_reclamo as string | undefined)?.trim() || "Reclamo";
  const empresa = (rec.empresa as string | undefined)?.trim() || "";
  const nombre = empresa ? `${nro} · ${empresa}` : nro;

  const rows = ((rec.reclamo_fotos as FotoRow[] | null) ?? [])
    .slice()
    .sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));

  const fotos: GaleriaFoto[] = rows.map((f, i) => ({
    url: f.url || `${SUPA_URL}/storage/v1/object/public/reclamo-fotos/${f.storage_path}`,
    nombre: `Foto ${i + 1}`,
  }));

  return { nombre, fotos };
}
