// ─────────────────────────────────────────────────────────────────────────────
// Revisión 110 (14-nov-2026) — grupo «ventas»: Ventas, Vista general,
// Comisiones, Multifashion y Boston. Aprobado por Daniel módulo por módulo
// (~/Desktop/revision-por-modulo). Solo FORMA: ningún número, cálculo de plata
// ni dato guardado cambia. Cada punto con su interruptor; `false` = la
// pantalla de antes.
// ─────────────────────────────────────────────────────────────────────────────

/** Ventas › Clientes (mockup ventas-clientes-rec-c): UNA sola lista, sin el
 *  control Ventas | Utilidad; la tarjeta suma «Utilidad · Margen» (solo con un
 *  año completo); «Todas las empresas ▾ · Ordenar ▾ · ↻ hora» en una línea; sin
 *  la línea «110 clientes»; el Excel de utilidad en el «···»; la utilidad por
 *  empresa en la hoja del cliente. Incluye las n.º 2, 3 y 9. */
export const VENTAS_CLIENTES_UNA_LISTA = true;

/** n.º 4 · La línea gris del cliente dice «hace 2 días», no «Última compra: …» cortado. */
export const VENTAS_ULTIMA_COMPRA_CORTA = true;

/** n.º 6 · Ventas › Productos: el mes escrito completo («Noviembre 2026»), como Resumen. */
export const VENTAS_MES_COMPLETO = true;

/** n.º 7 · La hoja del rango de fechas con el vidrio grueso (no transparente). */
export const VENTAS_RANGO_VIDRIO_GRUESO = true;

/** n.º 8 · «—» en vez de «n/a» en el «vs año anterior» del celular. */
export const VENTAS_SIN_NA = true;

/** n.º 10 · El encabezado «Cliente» alineado a la izquierda (computadora). */
export const VENTAS_CLIENTE_A_LA_IZQUIERDA = true;

/** n.º 11 · La nota al pie del Resumen (computadora) en UNA línea; el resto en el ⓘ. */
export const VENTAS_PIE_UNA_LINEA = true;

/** n.º 12 · Nombres de los Excel de Ventas: «Ventas-Resumen-AAAA-MM-DD.xlsx». */
export const VENTAS_EXCEL_NOMBRE_DEL_SISTEMA = true;

/** n.º 103 · La tabla del Resumen abre deslizada hasta el mes en curso. */
export const VENTAS_TABLA_AL_MES_EN_CURSO = true;

/** n.º 104 · Un cliente sin código no es enlace: dice «Sin código en Switch». */
export const VENTAS_SIN_CODIGO_NO_ES_ENLACE = true;

/** n.º 22 · Vista general › Cuentas por pagar: «con más de 90 días», nunca «vencido». */
export const VG_CXP_SIN_VENCIDO = true;

/** n.º 23 · Vista general › Disponibilidad: aviso ámbar si el saldo es viejo. */
export const VG_DISPONIBILIDAD_AVISA_FECHA = true;

/** n.º 24 · Gastos por empresa pausado = UNA línea. */
export const VG_GASTOS_PAUSADO_UNA_LINEA = true;

/** n.º 25 · Rentabilidad pausada = lista compacta «Empresa · Ventas» + pie gris. */
export const VG_RENTABILIDAD_COMPACTA = true;

/** n.º 26 · Inventario por empresa: una línea gris al pie y el resto en el ⓘ. */
export const VG_INVENTARIO_PIE_UNA_LINEA = true;

/** n.º 27 · Alertas: proveedores capitalizados y montos en un solo tono gris. */
export const VG_ALERTAS_SIN_ROJO = true;

/** n.º 28 · Alertas: la empresa baja a una segunda línea, nada cortado. */
export const VG_ALERTAS_EMPRESA_ABAJO = true;

/** n.º 29 · El selector de mes pegado al título, sin franjas vacías. */
export const VG_PERIODO_SIN_AIRE = true;

/** n.º 30 · Comisiones (celular): «Comisiones ▾» (Comisiones · Configuración) y «···» con Descargar. */
export const COMISIONES_BARRA_COMUN = true;

/** n.º 31 · Comisiones (celular): el mes escrito completo y la misma flecha ⌄. */
export const COMISIONES_MES_COMPLETO = true;

/** n.º 32 · El buscador de Comisiones dice lo que de verdad busca. */
export const COMISIONES_BUSCADOR_CORTO = true;

/** n.º 33 · El desglose del total también en el celular. */
export const COMISIONES_DESGLOSE_EN_CELULAR = true;

/** n.º 34 · «Comisión $X · Descuento $Y» en vez de una resta sin rótulo. */
export const COMISIONES_RESTA_CON_ROTULO = true;

/** n.º 35 · Las tasas sin flechitas, con el número entero («0.50»). */
export const COMISIONES_TASA_ENTERA = true;

/** n.º 36 · «Exclusiones» en una línea y filtros con nombre completo. */
export const COMISIONES_EXCLUSIONES_FILTROS = true;

/** n.º 44 / 44b · Multifashion › Clientes: sin el número grande, resumen + ↻ en una línea, chips en una fila. */
export const MF_CLIENTES_SIN_REPETIR = true;

/** n.º 47 · Boston › Inicio: la antigüedad en tres columnas. */
export const BOSTON_TRAMOS_EN_COLUMNAS = true;

/** n.º 48 · Boston › Inicio: sin «de Confecciones Boston» en la tarjeta de préstamos. */
export const BOSTON_SIN_DE_BOSTON = true;

/** n.º 105 · Boston › la tarjeta «Cuentas por cobrar» abre la cartera de Boston. */
export const BOSTON_CXC_ABRE_BOSTON = true;
