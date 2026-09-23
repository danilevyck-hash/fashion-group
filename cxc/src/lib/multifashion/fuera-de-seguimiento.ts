// ─────────────────────────────────────────────────────────────────────────────
// QUIÉN NO ES UN CLIENTE DE TIENDA — la lista de a quién NO se le hace
// postventa, en UN solo lugar y con su motivo escrito.
//
// 🔴 HOY LA LISTA ESTÁ VACÍA, Y ESO ES LA DECISIÓN (23-sep-2026).
// Daniel, textual: ***«métel[o] para no hacer excepciones por solo una
// persona»***. VENTAS MAHER vuelve a ser un cliente como cualquier otro en
// TODO el módulo: entra al ranking de Clientes (ya entraba desde el rediseño
// «Retail al frente») y ahora también a la lista de llamar por WhatsApp.
//
// ⚠️ CAMBIO DE DIRECCIÓN, no un olvido. El 16-sep-2026 Daniel había dicho
// *«Maher es revendedor»* y sus tres códigos (47, 48 y 49) estaban acá afuera.
// El 23-sep-2026 lo revierte: una excepción para una sola persona cuesta más
// de lo que ahorra. El mecanismo se conserva VACÍO —no se borra— por si algún
// día hace falta sacar a alguien; mientras la lista esté vacía,
// `estaFueraDeSeguimiento` contesta `false` para todo el mundo.
//
// ── LO MEDIDO CONTRA PRODUCCIÓN AL REVERTIR (23-sep-2026) ───────────────────
// La lista de Clientes de Multifashion, con los MISMOS datos, antes y después:
//   · «No vuelven»: 721 → **723**   (+2: los códigos 48 y 49)
//   · «Nuevos»:      52 →  **52**   (sin cambio)
//   · «Todos»:      983 → **986**   (+3: los tres códigos de Maher)
//   · Las CUATRO TARJETAS no se mueven (96 · 47 · 723 · 862): siempre lo
//     contaron — son el universo de fidelización, no a quién llamar.
// Son TRES filas de más, no una, porque «VENTAS MAHER» tiene tres códigos:
//   · 47 — 76 visitas, última compra 17-sep-2026, $10.035,90. No está dormido.
//   · 48 y 49 — una compra cada uno, las dos del 5-jun-2024, así que caen en
//     «No vuelven».
// ⚠️ Ninguno de los tres tiene teléfono en Switch: aparecen en la lista pero
// SIN botón de WhatsApp, como cualquier otro cliente sin número cargado.
//
// 🔴 SI ALGÚN DÍA VUELVE A HABER UNA EXCLUSIÓN: POR CÓDIGO, NUNCA POR NOMBRE.
// Un `cliente NOT ILIKE '%maher%'` es cómodo y es la trampa que la casa
// prohíbe: el día que entre una clienta llamada «MAHERLIN» desaparece de la
// lista **sin que nadie se entere**. Un código de más se ve; una clienta que
// falta, no.
// ─────────────────────────────────────────────────────────────────────────────

/** Un código que no entra a la lista de seguimiento, con su porqué. */
export interface FueraDeSeguimiento {
  /** `switch_clientes.cliente_switch_id` de `american_classic`. */
  codigo: number;
  /** Cómo se llama, solo para poder leer esta lista. NO se compara por acá. */
  nombre: string;
  /** Por qué no se le hace postventa. */
  porque: string;
}

/**
 * 🔴 VACÍA A PROPÓSITO desde el 23-sep-2026 (ver el encabezado). Agregar a
 * alguien acá lo saca de la lista de llamar y hay que escribirle el motivo.
 */
export const FUERA_DE_SEGUIMIENTO: readonly FueraDeSeguimiento[] = [];

const CODIGOS = new Set(FUERA_DE_SEGUIMIENTO.map((f) => f.codigo));

/** ¿A este código NO se le hace postventa? Con la lista vacía, nunca. */
export function estaFueraDeSeguimiento(codigo: number | null | undefined): boolean {
  return typeof codigo === "number" && CODIGOS.has(codigo);
}
