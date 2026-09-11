// ─────────────────────────────────────────────────────────────────────────────
// RECLAMOS — `reclamado_en` SE ESCRIBE UNA VEZ Y NUNCA SE PISA (10-sep-2026).
//
// La llaman las CUATRO salidas del reclamo hacia el proveedor: el correo
// (`send-zip`, DESPUÉS de que Resend confirma), el Excel de uno (`[id]/excel`),
// y el Excel y el PDF por empresa (`export-zip`, `export-pdf`). Lo que pase
// primero marca; lo demás no toca la fecha (`.is("reclamado_en", null)`).
//
// Falla ABIERTA: si la columna todavía no existe, se anota en consola y el
// archivo o el correo salen igual — el reclamo no puede dejar de mandarse
// porque falte una marca.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseServer } from "@/lib/supabase-server";

export async function marcarReclamados(ids: readonly string[]): Promise<void> {
  const lista = ids.filter(Boolean);
  if (lista.length === 0) return;
  const { error } = await supabaseServer
    .from("reclamos")
    .update({ reclamado_en: new Date().toISOString() })
    .in("id", lista)
    .is("reclamado_en", null)
    .eq("deleted", false);
  if (error) console.warn("marcarReclamados:", error.message);
}
