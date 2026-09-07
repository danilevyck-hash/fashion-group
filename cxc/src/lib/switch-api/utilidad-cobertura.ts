// ─────────────────────────────────────────────────────────────────────────────
// QUÉ DOCUMENTOS PUEDE TRAER EL REPORTE DE UTILIDAD — la lista, en UN lugar.
//
// ═══ 🩸 POR QUÉ EXISTE ESTE ARCHIVO ══════════════════════════════════════════
//
// El 6-sep-2026 sonó 🔧 SISTEMA dos veces por el sync de utilidad de
// `active_shoes` y `joystep`, y no pasaba nada malo. El guard del "cero
// silencioso" de `sync-utilidad.ts` compara los documentos que trajo el reporte
// contra los que hay en `switch_facturas` en el mismo rango, y contaba
// comprobantes que el reporte NO PUEDE traer. Los tres documentos que lo
// dispararon eran ventas de mostrador (`155-000000057` $30 · `155-000000064`
// $23 · `155-000000056` $96): el reporte devolvía cero con razón, y el guard
// leía ese cero como una avería.
//
// Era una falsa alarma POR CONSTRUCCIÓN: suena cualquier día en que la única
// venta de una empresa en la ventana sea de mostrador. Y una alerta que suena
// sin que pase nada es peor que ninguna: enseña a ignorarla justo antes del día
// en que sí falte una factura de verdad.
//
// ═══ LO MEDIDO (6-sep-2026, contra producción, las 6 del grupo) ══════════════
//
// `switch_factura_utilidad` existe desde el 3-ene-2026. En 2026, documento por
// documento contra `switch_facturas`:
//
//   tipo de comprobante   serie   en switch_facturas   en el reporte de utilidad
//   ───────────────────────────────────────────────────────────────────────────
//   Factura                11            1.197                  1.197  ✅ cuadra
//   Nota de Crédito        13              428                    428  ✅ cuadra
//   Nota de Débito         14              212                    212  ✅ cuadra
//   Transacción           155              513                      0  ← NUNCA
//
// Y visto del otro lado, sin cruzar tablas: las 1.837 filas que tiene hoy
// `switch_factura_utilidad` son de las series 11, 13 y 14. Ni una de 155, en
// ninguna de las 6 empresas, en toda la vida de la tabla.
//
// O sea: los tres comprobantes que el reporte cubre cuadran EXACTOS, y del que
// no cubre no ha traído ni uno en todo el año. No es un dato que a veces falta:
// es un universo distinto.
//
// ═══ 🔴 LA REGLA SE DICE POR LO QUE EL REPORTE **NO** TRAE ═══════════════════
//
// Es una lista de EXCLUSIONES y no una lista blanca, y la dirección importa:
// un tipo de comprobante que Switch estrene mañana **cuenta** para el guard.
//
// Las dos formas de equivocarse no cuestan lo mismo:
//   · contar de más → una falsa alarma → un mensaje que se investiga y se mide;
//   · contar de menos → el guard se calla → un documento que no llegó se
//     esconde, y esa tabla es la que decide QUÉ FACTURAS COMISIONAN.
//
// El guard nació justo para tapar el segundo agujero (el de joystep, jul-2026:
// la tabla vacía convivía con un panel que mostraba $0,00 de comisión como si
// fuera un dato real). Así que ante un tipo que todavía no sabemos leer, se
// cuenta y suena. Ante la duda, se dice.
//
// ⚠️ **`Tiquete` (serie 130) NO está en la lista, a propósito.** Es el
// comprobante de mostrador que `Transacción` reemplazó en mayo-2025, y todo
// hace pensar que el reporte tampoco lo traía — pero eso NO está medido: su
// último documento es del 30-jun-2025 y `switch_factura_utilidad` arranca el
// 3-ene-2026, así que las dos historias no se tocan y no hay con qué probarlo.
// Meterlo sería una suposición disfrazada de medición, y hoy no cambia un solo
// documento (cero Tiquetes en la era del reporte). Si Switch lo revive, el
// guard sonará, se mide ese día y ahí entra a la lista con su número al lado.
//
// ⚠️ Esto NO es la lista de tipos de venta (`ventas/tipos-comprobante.ts`, la
// que decide el SIGNO con que un comprobante suma) ni la de la cartera
// (`estadocuenta-web.ts`). Son tres preguntas distintas sobre el mismo
// vocabulario de Switch. Lo que sí se comparte es el vocabulario: hay candado
// que exige que todo lo que este archivo excluye sea un tipo que el sistema
// sepa leer — una exclusión con una falta de ortografía no excluiría nada y
// nadie se enteraría.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 🔴 Los comprobantes que el reporte de utilidad de Switch NO trae.
 *
 * Cerrada y medida: hoy es el mostrador. Todo lo demás —incluido un tipo que
 * Switch estrene y nadie haya clasificado— cuenta para el guard.
 */
export const TIPOS_FUERA_DEL_REPORTE_DE_UTILIDAD: readonly string[] = [
  "Transacción",
];

const FUERA = new Set<string>(TIPOS_FUERA_DEL_REPORTE_DE_UTILIDAD);

/**
 * ¿Este comprobante lo puede traer el reporte de utilidad?
 *
 * Un tipo desconocido —o vacío— contesta que SÍ: se cuenta y el guard sigue
 * pudiendo sonar. Ver el encabezado: contar de menos es lo que se paga caro.
 */
export function elReporteDeUtilidadLoTrae(tipo: string | null | undefined): boolean {
  return !FUERA.has((tipo ?? "").trim());
}

/**
 * La MISMA regla escrita para PostgREST, para que la consulta del guard no
 * vuelva a escribir la lista a mano. Se usa como
 * `.not("tipo_comprobante", "in", filtroTiposFueraDelReporteDeUtilidad())`.
 *
 * Cada valor va entre comillas dobles porque llevan acentos y espacios. Es
 * seguro contra el `NOT IN` de SQL —que con la columna en NULL descartaría la
 * fila y callaría el guard— porque `switch_facturas.tipo_comprobante` es NOT
 * NULL (medido: 0 nulos en las 14.593 filas de las 6 empresas).
 */
export function filtroTiposFueraDelReporteDeUtilidad(): string {
  return `(${TIPOS_FUERA_DEL_REPORTE_DE_UTILIDAD.map((t) => `"${t}"`).join(",")})`;
}
