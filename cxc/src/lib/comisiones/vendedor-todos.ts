// El COMODÍN de «Clientes que no comisionan» — módulo propio, SIN dependencias.
//
// Vive aparte (mismo motivo que `vendedor-default.ts`) para que `alias.ts` y
// las vistas lo puedan importar sin arrastrar `empresas.ts` → `empresa-mapping`
// detrás: ese arrastre rompió un test que mockea parcialmente ese módulo.

/**
 * 🔴 EL COMODÍN: «este cliente no comisiona para NADIE, en esta empresa».
 *
 * 🩸 POR QUÉ (6-sep-2026). «Multi Fashion Holding» (D-108) estaba excluido
 * DENTRO del SQL de la plata, por su NOMBRE:
 * `f.cliente NOT ILIKE '%multi fashion holding%'`. Medido contra producción:
 * **203 facturas y 21 recibos de 2026** en las 6 empresas atados a un texto que
 * Switch puede cambiar con una letra — y era la única exclusión que no se veía
 * en ninguna pantalla. Va contra la regla de la casa: **la identidad del
 * cliente es el CÓDIGO, nunca el nombre.** Daniel: «debe de ser por código,
 * ¿no?» → sí.
 *
 * La lista es por (empresa, cliente, VENDEDOR) y esto tiene que valer para
 * todos. Enumerar los vendedores que hoy le venden (medido: DEFAULT, Reynaldo,
 * Edwin, Daniel Levy y Colaborador) NO alcanza: el día que un vendedor nuevo le
 * facture, esa factura empieza a pagar comisión **en silencio**, que es
 * exactamente el agujero que se vino a tapar. Por eso hay comodín.
 *
 * `*` y no una palabra: cualquier texto («TODOS») podría chocar algún día con
 * el nombre real de una persona en Switch, y `*` no es un nombre válido de
 * vendedor en ninguna parte del sistema.
 */
export const VENDEDOR_TODOS = "*";

/** Cómo se dice el comodín en pantalla. Nunca se muestra el `*` pelado. */
export const ROTULO_VENDEDOR_TODOS = "Todos los vendedores";

/** ¿Esta fila vale para todos los vendedores de esa empresa? */
export const esVendedorTodos = (vendedor: string | null | undefined): boolean =>
  (vendedor ?? "").trim() === VENDEDOR_TODOS;
