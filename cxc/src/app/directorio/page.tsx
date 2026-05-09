// ─────────────────────────────────────────────────────────────────────────────
// /directorio  (Sprint 1 Fase 4E — placeholder)
//
// El módulo Directorio se renombró a Clientes (/clientes) en Fase 4D.
// Esta ruta queda en pie para que enlaces viejos no den 404 — redirige
// al nuevo módulo.
//
// IMPORTANTE: NO se borra hasta Sprint 2 porque la tabla directorio_clientes
// y el endpoint /api/directorio siguen siendo la fuente del autocomplete
// de Cheques. Sprint 2 migra Cheques a clientes_master y entonces se
// pueden retirar /directorio + /api/directorio + tabla directorio_clientes.
// ─────────────────────────────────────────────────────────────────────────────

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function DirectorioRedirect() {
  redirect("/clientes");
}
