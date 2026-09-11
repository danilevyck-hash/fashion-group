import { supabaseServer } from "@/lib/supabase-server";
import { firmarFotos } from "./fotos-storage";

// 🔴 El bucket `reclamo-fotos` es PRIVADO desde el 11-sep-2026 («Link público
// ciérralo»). La galería que ve el PROVEEDOR sigue abriéndose con el token HMAC
// de siempre (el link del Excel no cambia y no se rompe): la página FIRMA las
// fotos al cargar, con vida corta, igual que Marketing re-firma en cada carga.

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
 * URLs FIRMADAS (vida corta) de las fotos de ESE reclamo. NUNCA montos, ítems, proveedores,
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

  const firmadas = await firmarFotos(rows);
  const fotos: GaleriaFoto[] = firmadas
    .filter((f) => !!f.url)
    .map((f, i) => ({ url: f.url, nombre: `Foto ${i + 1}` }));

  return { nombre, fotos };
}
