// ─────────────────────────────────────────────────────────────────────────────
// QUIÉN PUEDE ESCRIBIR UNA GUÍA — UNA sola lista (11-sep-2026).
//
// 🩸 POR QUÉ NACE. `/guias/nueva` dejaba entrar al VENDEDOR: la página lo
// aceptaba (`allowedRoles` con «vendedor» adentro) y el POST lo rechazaba con
// «Sin permiso». O sea que se armaba la guía entera —cliente, renglones,
// facturas, bultos— y el único aviso llegaba al tocar «Guardar Guía»; el
// «＋ Agregar destino» del formulario también le contestaba 403. El vendedor
// tiene Guías en SOLO LECTURA (`src/lib/modules.ts`), y eso no cambió.
//
// La lista estaba escrita SEIS veces: en la página y en cinco `route.ts`. Con
// seis copias, el día que una cambiara la pantalla ofrecería lo que el servidor
// rechaza — que es exactamente lo que pasó. Acá la lista es una sola y todas la
// LEEN.
//
// ⚠️ NO ES LA LISTA DE QUIÉN VE EL MÓDULO: ver es `modules.ts` (admin,
// secretaria, bodega y vendedor). Esta es la de quien ESCRIBE.
// ─────────────────────────────────────────────────────────────────────────────

/** Los roles que pueden crear, editar y despachar una guía. */
export const GUIAS_WRITE_ROLES: string[] = ["admin", "secretaria", "bodega"];

/** ¿Este rol puede abrir «Nueva guía» y guardarla? */
export function puedeEscribirGuias(role: string | null | undefined): boolean {
  return GUIAS_WRITE_ROLES.includes(String(role ?? ""));
}
