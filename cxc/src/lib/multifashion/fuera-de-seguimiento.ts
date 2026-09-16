// ─────────────────────────────────────────────────────────────────────────────
// QUIÉN NO ES UN CLIENTE DE TIENDA — la lista de a quién NO se le hace
// postventa, en UN solo lugar y con su motivo escrito.
//
// Daniel, 16-sep-2026: ***«Maher es revendedor»***. Le compra a la tienda para
// volver a vender, así que no es alguien a quien Jennifer llama para que vuelva.
//
// 🔴 SE VA DE LA LISTA, NO DE LAS TARJETAS. El encargo dice expresamente que las
// cuatro tarjetas de arriba no se tocan, y son otra pregunta: la tarjeta cuenta
// el UNIVERSO de fidelización y la lista es A QUIÉN LLAMAR. Van a quedar
// diciendo uno más que la lista, igual que ya pasa con «Nuevos», y está bien.
//
// 🔴 POR CÓDIGO, NUNCA POR NOMBRE — y acá la decisión tiene un costo medido, así
// que queda escrita. La RPC del ranking lo excluye con `cliente NOT ILIKE
// '%maher%'`, que es cómodo porque atrapa cualquier código nuevo… y es
// exactamente la trampa que la casa prohíbe: el día que entre una clienta
// llamada «MAHERLIN», desaparece de la lista de llamar **sin que nadie se
// entere**. Un código de más se ve; una clienta que falta, no.
//   · Lo que esto NO cubre: si Switch le abre un código NUEVO a Maher, vuelve a
//     aparecer hasta que alguien lo agregue acá. Es un renglón de más en una
//     lista de 967, y se nota.
//
// ── LO MEDIDO CONTRA PRODUCCIÓN (16-sep-2026) ───────────────────────────────
// «VENTAS MAHER» tiene TRES códigos, no uno:
//   · 47 — ficha «VENTAS MAHER», 84 facturas, de jun-2024 al **15-sep-2026**,
//     $10.818,52. Sin teléfono ni celular cargado.
//   · 48 y 49 — SIN ficha en el directorio, una factura cada uno, las dos del
//     5-jun-2024. En la factura el nombre viene con un espacio al final
//     («VENTAS MAHER »), que es por lo que la RPC tiene que hacerle TRIM.
//
// ⚠️ Con su última compra del 15-sep no caía en «No vuelven» de todos modos, y
// sin teléfono nunca habría tenido botón. Sale igual, porque no es a quien se
// llama — no porque estorbara.
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

export const FUERA_DE_SEGUIMIENTO: readonly FueraDeSeguimiento[] = [
  {
    codigo: 47,
    nombre: "VENTAS MAHER",
    porque: "Revendedor: le compra a la tienda para volver a vender (Daniel, 16-sep-2026).",
  },
  {
    codigo: 48,
    nombre: "VENTAS MAHER",
    porque: "El mismo revendedor, con otro código de Switch y sin ficha en el directorio.",
  },
  {
    codigo: 49,
    nombre: "VENTAS MAHER",
    porque: "El mismo revendedor, con otro código de Switch y sin ficha en el directorio.",
  },
];

const CODIGOS = new Set(FUERA_DE_SEGUIMIENTO.map((f) => f.codigo));

/** ¿A este código NO se le hace postventa? */
export function estaFueraDeSeguimiento(codigo: number | null | undefined): boolean {
  return typeof codigo === "number" && CODIGOS.has(codigo);
}
