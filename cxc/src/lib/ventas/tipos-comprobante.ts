// ─────────────────────────────────────────────────────────────────────────────
// LOS TIPOS DE COMPROBANTE DE VENTA — la lista, en UN solo lugar.
//
// ═══ 🩸 POR QUÉ EXISTE ESTE ARCHIVO ══════════════════════════════════════════
//
// En **mayo de 2025 Switch estrenó el tipo «Transacción»** (reemplazó a
// «Tiquete»). Alguien lo agregó a tiempo y no se perdió una sola venta — **por
// suerte**. Si mañana Switch inventa otro tipo, esa venta cae al `ELSE 0` de las
// vistas y **desaparece del tablero sin una sola alerta**: no hay error, no
// suena nada, el total sale más bajo y nadie se entera.
//
// En la CARTERA ese guard sí existe desde hace meses
// (`switch_estadocuenta_tipos_sin_clasificar` + el check
// `aging_tipos_sin_clasificar`, que alerta cuando aparece un tipo desconocido
// con saldo). **En ventas no había equivalente.** Este módulo es la mitad pura
// del que se le agregó: la lista de tipos conocidos, dicha UNA vez.
//
// 🔑 **Se dice UNA vez y de acá se deriva todo**: la vista centinela de SQL
// (`switch_facturas_tipos_sin_clasificar`) se compara contra esta lista en un
// test, y `clientes-ytd.ts` la importa en vez de volver a escribirla. Una lista
// paralela es la que un día se aparta en silencio — que es exactamente el modo
// de fallo que este archivo existe para cerrar.
//
// ⚠️ **Esto NO es la lista de la CARTERA.** El estado de cuenta tiene 8 tipos
// (suma «Saldo Anterior», «Recibo» y «Recibo Saldo Anterior», que en ventas no
// existen) y vive en `switch-api/estadocuenta-web.ts`. Son dos preguntas
// distintas sobre el mismo vocabulario de Switch; fusionarlas haría que agregar
// un tipo de cobro cambiara el total de ventas.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Los comprobantes de venta que SUMAN.
 *
 * `Transacción` es el que Switch estrenó en mayo-2025 y `Tiquete` el que
 * reemplazó; los dos siguen vivos porque la historia anterior no se reescribe.
 */
export const TIPOS_VENTA_SUMAN = [
  "Factura",
  "Tiquete",
  "Transacción",
  "Nota de Débito",
] as const;

/** El único comprobante de venta que RESTA. Lo que resta, RESTA. */
export const TIPO_VENTA_RESTA = "Nota de Crédito" as const;

/** Todo lo que el sistema sabe leer hoy en `switch_facturas.tipo_comprobante`. */
export const TIPOS_VENTA_CONOCIDOS: readonly string[] = [
  ...TIPOS_VENTA_SUMAN,
  TIPO_VENTA_RESTA,
];

const SUMAN = new Set<string>(TIPOS_VENTA_SUMAN);

/** El signo con el que un comprobante entra a las ventas. 0 = tipo desconocido:
 *  las vistas lo mandan al `ELSE 0` y el centinela lo denuncia. */
export function signoVenta(tipo: string | null | undefined): -1 | 0 | 1 {
  if (!tipo) return 0;
  if (SUMAN.has(tipo)) return 1;
  return tipo === TIPO_VENTA_RESTA ? -1 : 0;
}

/** ¿Este tipo lo sabe leer alguna vista de ventas? */
export function esTipoVentaConocido(tipo: string | null | undefined): boolean {
  return signoVenta(tipo) !== 0;
}

// ─── Los códigos CORTOS de switch_articulo_diario ────────────────────────────
//
// La misma verdad, dicha en el idioma del endpoint `ventasucursal`: ahí el tipo
// no viene con nombre largo sino con un código de 2-3 letras, en la columna
// `tipo` (no `tipo_comprobante`).
//
// ⚠️ El riesgo acá es el CONTRARIO al de ventas y por eso también se vigila: esas
// vistas hacen `CASE WHEN tipo = 'NC' THEN -x ELSE x END`, o sea que un código
// nuevo **SUMA en silencio** en vez de caer a 0. Un tipo desconocido inflaría el
// costo y la utilidad sin que nada avise.

/** Código corto → el tipo largo que nombra. `CNF` es Transacción y `TQ` Tiquete. */
export const CODIGO_ARTICULO_A_TIPO: Readonly<Record<string, string>> = {
  FA: "Factura",
  TQ: "Tiquete",
  CNF: "Transacción",
  ND: "Nota de Débito",
  NC: TIPO_VENTA_RESTA,
};

/** Los códigos cortos que el sistema sabe leer. DERIVADOS del mapa de arriba. */
export const CODIGOS_ARTICULO_CONOCIDOS: readonly string[] = Object.keys(CODIGO_ARTICULO_A_TIPO);

export function esCodigoArticuloConocido(codigo: string | null | undefined): boolean {
  return !!codigo && codigo in CODIGO_ARTICULO_A_TIPO;
}
