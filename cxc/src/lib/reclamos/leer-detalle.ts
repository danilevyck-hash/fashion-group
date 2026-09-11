// ─────────────────────────────────────────────────────────────────────────────
// EL DETALLE DE UN RECLAMO SE LEE EN UN SOLO LUGAR (11-sep-2026).
//
// 🩸 HABÍA DOS LECTURAS Y NO DECÍAN LO MISMO. `GET /api/reclamos/[id]` —la que
// corre al navegar desde la lista— trae `reclamo_settlements` y FIRMA las tres
// clases de archivo (la factura en PDF, las fotos y el comprobante de pago).
// El SSR de `/reclamos?view=detail&id=…` no hacía ninguna de las dos cosas, y
// el cliente NO vuelve a pedir el detalle en la primera corrida (el efecto se
// la salta a propósito). Resultado, abriendo por enlace directo o recargando
// con F5:
//   · las fotos salían ROTAS (el bucket pasó a privado el 11-sep-2026 —
//     Daniel: *«Link público ciérralo»*— y la URL guardada en la fila ya no
//     abre),
//   · «Factura del proveedor» desaparecía del menú Descargar,
//   · la tarjeta de Comprobante no se dibujaba,
//   · y «Recuperación» decía **0%** aunque hubiera notas de crédito.
// Entrando por la lista funcionaba todo, y por eso no se notaba.
//
// 🔴 UNA SOLA LECTURA, LAS DOS PUERTAS. El SSR y la ruta llaman a la MISMA
// función: dos maneras de leer el mismo reclamo es exactamente cómo nace una
// pantalla que dice menos que la otra.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseServer } from "@/lib/supabase-server";
import { firmarFacturaPathSafe } from "./factura-storage";
import { firmarFotoPathSafe, firmarFotos } from "./fotos-storage";

/** Todo lo que la pantalla del reclamo necesita, en una sola ida a la base. */
export const DETALLE_SELECT =
  "*, reclamo_items(*), reclamo_fotos(*), reclamo_seguimiento(*), reclamo_settlements(*)";

type Fila = Record<string, unknown>;

/**
 * El reclamo con sus renglones, fotos, seguimiento y liquidaciones, con los
 * archivos ya FIRMADOS. `null` si no existe o está borrado.
 *
 * ⚠️ Las URLs firmadas viven 1 hora: por eso se firman al LEER y nunca se
 * guardan en la fila.
 */
export async function leerDetalleReclamo(id: string): Promise<Fila | null> {
  const { data, error } = await supabaseServer
    .from("reclamos")
    .select(DETALLE_SELECT)
    .eq("id", id)
    .eq("deleted", false)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return await firmarLoDelDetalle(data as Fila);
}

/**
 * Firma los archivos y ordena el seguimiento. Vive aparte para que la ruta
 * pueda seguir usando su propio `select`/`single` sin duplicar el firmado.
 */
export async function firmarLoDelDetalle(data: Fila): Promise<Fila> {
  if (Array.isArray(data.reclamo_seguimiento)) {
    (data.reclamo_seguimiento as { created_at: string }[]).sort((a, b) =>
      String(b.created_at).localeCompare(String(a.created_at)),
    );
  }
  // El PDF de factura (TTL 1h) para «Ver factura». Nunca público.
  if (data.factura_pdf_path) {
    data.factura_pdf_url = await firmarFacturaPathSafe(String(data.factura_pdf_path));
  }
  // 🔴 Las fotos y el comprobante también: el bucket es privado desde el
  // 11-sep-2026 y la URL guardada en la fila ya no abre.
  if (Array.isArray(data.reclamo_fotos)) {
    data.reclamo_fotos = await firmarFotos(data.reclamo_fotos as { storage_path: string }[]);
  }
  if (data.comprobante_path) {
    data.comprobante_url = await firmarFotoPathSafe(String(data.comprobante_path));
  }
  return data;
}
