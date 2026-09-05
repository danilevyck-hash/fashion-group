// ═══════════════════════════════════════════════════════════════════════════
//   🔴 QUÉ SE PIERDE SI SE PIERDE — la clasificación de TODA la base.
//
//   Módulo PURO (ni Supabase ni red): lo lee el candado que pone el build
//   ROJO cuando nace una tabla que nadie clasificó, o cuando alguien saca del
//   respaldo una tabla que no se puede volver a conseguir.
// ═══════════════════════════════════════════════════════════════════════════
//
// ── EL HUECO QUE ESTO CIERRA (medido el 5-sep-2026) ─────────────────────────
// El respaldo tenía 56 tablas de las 136 que existen. Afuera quedaban, entre
// otras, **las 6.081 marcaciones del reloj de asistencia**: las manda el reloj,
// son append-only y NO se pueden volver a pedir a ninguna parte. Si se perdían,
// se perdía la asistencia de todos. Y con ellas el módulo Asistencia entero,
// los saldos de banco que escribe contabilidad a mano, la configuración de
// comisiones, los tres catálogos nuevos (Tommy, Calvin, Joybees) y hasta el
// catálogo de Reebok, que la documentación daba por respaldado y no lo estaba.
//
// 🔑 El hueco no existió por descuido: existió porque **nada avisaba**. Una
// tabla nueva nacía en una migración y el respaldo no se enteraba nunca. Este
// archivo, más `backup-nada-sin-copia.test.ts`, es el arreglo de verdad: una
// tabla nueva que nadie clasifique pone el build rojo ANTES de llegar a
// producción.
//
// ── LAS CINCO CLASES, y qué obliga cada una ─────────────────────────────────
//
//   `personas`   la escriben personas — o un aparato nuestro, como el reloj —,
//                o guarda una ventana que su fuente ya no sirve. Sin copia, la
//                pérdida es REAL y definitiva. 🔴 OBLIGATORIA en el respaldo.
//   `congelada`  ya nadie la escribe y su origen no existe más (un CSV viejo,
//                un módulo retirado). 🔴 OBLIGATORIA en el respaldo.
//   `switch`     la reescribe un sync desde Switch: se puede volver a bajar.
//                Respaldarla es una decisión de costo, no de riesgo.
//   `bitacora`   registro de operación (quién corrió qué, qué falló, quién
//                entró). Se regenera sola y envejece a propósito. Fuera.
//   `retirada`   tabla muerta: sin lectores ni escritores. Fuera.
//   `vista`      vista o materializada. NUNCA se respalda: se recalcula.
//
// ⚠️ La clase mira LO QUE SE PIERDE, no quién escribe. `egresos_varios` la baja
// un sync de Switch y aun así es `personas`: el reporte se reemplaza mes a mes
// (`egresos_reemplazar_mes`), así que acá solo vive la ventana cargada y los
// meses viejos no vuelven. Lo mismo los catálogos públicos: el PRECIO lo manda
// Switch, pero la foto, el badge y el nombre a mano no tienen otra fuente.

/** Lo que se pierde si se pierde. Ver el encabezado. */
export type ClaseDeTabla = "personas" | "congelada" | "switch" | "bitacora" | "retirada" | "vista";

/** Las clases que OBLIGAN a estar en el respaldo. */
export const CLASES_QUE_OBLIGAN: readonly ClaseDeTabla[] = ["personas", "congelada"];

// ─── `personas` — sin copia, la pérdida es real ─────────────────────────────
export const TABLAS_PERSONAS = [
  // ── Asistencia y planilla. El módulo ENTERO estuvo fuera del respaldo.
  // 🔴 `asistencia_marcaciones` es la peor de todas: la manda el reloj, es
  // append-only y el reloj NO reenvía el pasado.
  "asistencia_marcaciones",
  "asistencia_correcciones",
  "asistencia_personas",
  "asistencia_horarios",
  "asistencia_horas_extra_aprobadas",
  "asistencia_justificaciones",
  "asistencia_vacaciones",
  "asistencia_feriados",
  // El singleton con TODA la parametrización del cálculo (id = 1).
  "asistencia_reglas",
  "asistencia_planilla_manual",
  "asistencia_prestamo_aprobado",
  "asistencia_reparto_empresa",
  "asistencia_aprobador_empresa",
  "asistencia_planilla_guardada",
  "asistencia_planilla_guardada_linea",
  "asistencia_dispositivos",

  // ── Gastos y banco
  // 🔴 Los saldos de banco los escribe contabilidad A MANO: no hay de dónde
  // volver a sacarlos.
  "bancos_saldos",
  // ⚠️ La baja un sync, pero se REEMPLAZA mes a mes: acá solo vive la ventana
  // cargada y los meses viejos ya no están en el reporte de Switch.
  "egresos_varios",
  // La bitácora de qué corrida trajo qué mes. Es lo único que distingue «este
  // mes no tuvo movimientos» de «no sabemos nada» — y eso no se re-deriva.
  "egresos_importaciones",
  "gastos_categorias",

  // ── Comisiones (la configuración que decide a quién se le paga)
  "comision_exclusion",
  "comision_vendedor_alias",
  "comision_vendedor_tasa",
  "comision_descuentos_fijos",
  "comision_descuento_excepciones",

  // ── Catálogos públicos: el precio lo manda Switch, pero la FOTO, el badge y
  // el nombre a mano no tienen otra fuente. `products` es el de Reebok — la
  // documentación lo daba por respaldado y no lo estaba.
  "products",
  "tommy_products",
  "calvin_products",
  "joybees_products",
  "fg_catalogo_publico_switch",

  // ── Pedidos y cotizaciones (los arman clientes y vendedores)
  "reebok_orders",
  "reebok_order_items",
  "reebok_pedidos_publicos",
  "tommy_orders",
  "tommy_order_items",
  "tommy_pedidos_publicos",
  "calvin_orders",
  "calvin_order_items",
  "calvin_pedidos_publicos",
  "joybees_orders",
  "joybees_order_items",
  "joybees_pedidos_publicos",
  // El at-most-once del envío a Switch: es el registro de qué se mandó y qué no.
  "reebok_switch_envios",
  "tommy_switch_envios",
  "calvin_switch_envios",
  "joybees_switch_envios",

  // ── Depurador
  "depurador_descripciones",
  "carga_history",
  "tienda_marca_formulas",
  "tienda_rubro_formulas",
  "marca_formulas",
  "marca_rubro_formulas",

  // ── CXC, clientes y cobranza
  "cxc_uploads",
  "cxc_client_overrides",
  "cxc_favorites",
  "cxc_contact_log",
  "cxc_emails_enviados",
  "clientes_master",
  "directorio_clientes",

  // ── Cheques / Recordatorios
  "cheques",
  "cheque_vendedores",
  "recordatorios",

  // ── Reclamos
  "reclamos",
  "reclamo_items",
  "reclamo_settlements",
  "reclamo_contactos",
  "reclamo_fotos",
  "reclamo_seguimiento",
  "reclamo_custom_motivos",

  // ── Guías
  "guia_transporte",
  "guia_items",
  "guias_destino_cliente",
  "transportistas",

  // ── Caja menuda
  "caja_periodos",
  "caja_gastos",
  "caja_categorias",
  "caja_responsables",

  // ── Préstamos
  "prestamos_empleados",
  "prestamos_movimientos",

  // ── Packing lists (la purga física a 90 d los borra de la base; el respaldo
  // los retiene)
  "packing_lists",
  "pl_items",

  // ── Marketing
  "mk_facturas",
  "mk_marcas",
  "mk_proyectos",
  "mk_proyecto_marcas",
  "mk_factura_marcas",
  "mk_entregas_muebles",
  "mk_entrega_items",
  "mk_inventario_productos",
  "mk_adjuntos",
  "mk_periodos",
  "mk_periodo_documentos",
  "mk_impulsadoras",
  "mk_impulsadora_marcas",
  "mk_mobiliario_notas_proveedor",

  // ── Multifashion (las metas se escriben a mano)
  "multifashion_metas",
  "multifashion_meta_participantes",

  // ── Ventas / vendedores
  "vendedores",
  "vendor_assignments",
  "ventas_metas",

  // ── Usuarios y configuración
  "fg_users",
  "role_permissions",
  "app_settings",
  "contactos_email",
  "fg_user_switch_vendedor",
  "fg_user_module_order",

  // ── Auditoría de acciones. No es una bitácora de máquina: es el único
  // registro de QUIÉN hizo qué, y no se regenera.
  "activity_logs",
] as const;

// ─── `congelada` — nadie la escribe y su origen ya no existe ────────────────
export const TABLAS_CONGELADAS = [
  // El CSV viejo de ventas y de CXC. No re-derivables de Switch.
  "ventas_raw",
  "cxc_rows",
  // Multifashion antes de que su fuente pasara a `switch_facturas` (congelada el
  // 26-jul-2026). Mientras las 15.819 filas existan, el respaldo es la única
  // copia que las protege. Cuando se decida borrar la tabla, sale de acá y del
  // respaldo en el MISMO cambio — nunca antes.
  "multifashion_tickets",
  // El mayor contable se retiró el 13-ago-2026. Las tablas NO se borran (hay
  // test que pone el build rojo si una migración las dropea) y su sync ya no
  // existe: sin copia, no vuelven.
  "mayor_lineas",
  "mayor_importaciones",
] as const;

// ─── `switch` — se puede volver a bajar ─────────────────────────────────────
// Respaldar una de estas es una decisión de COSTO. Cuál se respalda y cuál no
// está en `SWITCH_DATASETS` del route, con el motivo al lado.
export const TABLAS_SWITCH = [
  "switch_facturas",
  "switch_factura_lineas",
  "switch_factura_utilidad",
  "switch_recibos",
  "switch_estadocuenta",
  "switch_proveedor_estadocuenta",
  "switch_clientes",
  "switch_articulo_diario",
  "switch_articulo_info",
  "switch_articulo_marca",
  "switch_costo_diario",
  "switch_ingresos_mercancia",
  // El diccionario de cuentas contables: lo reescribe entero el cron de egresos.
  "cuentas_contables",
  // Tallas y existencia del catálogo Reebok: las escribe el sync, campo por
  // campo. Igual viaja en el respaldo, pegada a `products`: restaurar el
  // catálogo sin las tallas deja media pantalla.
  "inventory",
  // Caché del arqueo de caja de Multifashion (para no gastar la sesión única).
  "multifashion_caja_diaria",
] as const;

// ─── `bitacora` — se regenera sola, envejece a propósito ────────────────────
export const TABLAS_BITACORA = [
  // Cómo le fue a cada corrida de sync. Se PODA a propósito
  // (`podar_switch_sync_log`): respaldarla sería guardar lo que decidimos tirar.
  "switch_sync_log",
  "multifashion_sync_log",
  "cron_heartbeats",
  "cron_email_errors",
  "data_integrity_checks",
  // 🔴 `user_sessions` NO se respalda a propósito: son tokens de sesión vivos.
  // Sacarlos del proyecto es repartir credenciales, y una sesión perdida se
  // arregla volviendo a entrar.
  "user_sessions",
  "login_attempts",
] as const;

// ─── `retirada` — tabla muerta ──────────────────────────────────────────────
export const TABLAS_RETIRADAS = [
  // Los gastos por empresa/mes/categoría del módulo viejo. Vista General dejó
  // de leerla (0 filas) cuando `egresos_varios` pasó a ser la fuente única.
  "empresa_gastos_mensuales",
  // Carrito de Reebok del lado del servidor: hoy el carrito vive en el
  // navegador. 0 filas y ni un lector.
  "reebok_cart",
] as const;

// ─── `vista` — nunca se respalda ────────────────────────────────────────────
export const VISTAS = [
  "_multifashion_sf_vw",
  "calvin_pedidos_unificado_vw",
  "clientes_agregado_12m_vw",
  "clientes_empresa_12m_vw",
  "egresos_varios_mensual_v",
  "joybees_pedidos_unificado_vw",
  "mayor_gastos_mensual_v",
  "reebok_pedidos_unificado_vw",
  "switch_articulo_diario_tipos_sin_clasificar",
  "switch_costo_unificado_v2",
  "switch_costo_unificado_vw",
  "switch_estadocuenta_aging",
  "switch_estadocuenta_aging_boston",
  "switch_estadocuenta_aging_mv",
  "switch_estadocuenta_dias_anomalo",
  "switch_estadocuenta_tipos_sin_clasificar",
  "switch_facturas_cobertura_mensual",
  "switch_facturas_tipos_sin_clasificar",
  "switch_ultima_compra_cliente_v1",
  "switch_ultimo_pago_cliente_v2",
  "switch_ventas_unificado_vw",
  "tommy_pedidos_unificado_vw",
  "ventas_rollup_mensual_mv",
] as const;

/** Toda la base, clasificada. Foto de producción del 5-sep-2026: 136 tablas +
 *  23 vistas/materializadas = 159 relaciones. */
export const CLASIFICACION: Readonly<Record<string, ClaseDeTabla>> = Object.freeze({
  ...Object.fromEntries(TABLAS_PERSONAS.map((t) => [t, "personas" as const])),
  ...Object.fromEntries(TABLAS_CONGELADAS.map((t) => [t, "congelada" as const])),
  ...Object.fromEntries(TABLAS_SWITCH.map((t) => [t, "switch" as const])),
  ...Object.fromEntries(TABLAS_BITACORA.map((t) => [t, "bitacora" as const])),
  ...Object.fromEntries(TABLAS_RETIRADAS.map((t) => [t, "retirada" as const])),
  ...Object.fromEntries(VISTAS.map((t) => [t, "vista" as const])),
});

/** ¿Esta tabla TIENE que estar en el respaldo? */
export function obligaRespaldo(tabla: string): boolean {
  const clase = CLASIFICACION[tabla];
  return clase !== undefined && (CLASES_QUE_OBLIGAN as readonly string[]).includes(clase);
}

/** Las que obligan, en orden alfabético. */
export function tablasQueObliganRespaldo(): string[] {
  return Object.keys(CLASIFICACION).filter(obligaRespaldo).sort();
}

// ─── 🩸 LA PAGINACIÓN SILENCIOSA ────────────────────────────────────────────
//
// El respaldo pagina de a 1.000 con `.order()`, y PostgREST sin un orden
// determinista puede saltear filas entre página y página. El route ordena por
// `id` salvo excepción declarada en su `ORDER_BY`.
//
// 🔴 Una tabla cuya llave primaria NO es `id` y que no esté en `ORDER_BY` deja
// un respaldo INCOMPLETO que parece completo — nada lo dice. Por eso la llave
// real de producción vive acá, medida, y un candado exige que el `ORDER_BY` del
// route la cubra columna por columna.
//
// Foto de producción del 5-sep-2026 (`pg_constraint`, contype='p'). Solo las
// que NO son `id`: todas las demás tienen `id` y les alcanza el default.
export const PK_QUE_NO_ES_ID: Readonly<Record<string, readonly string[]>> = Object.freeze({
  app_settings: ["key"],
  asistencia_aprobador_empresa: ["usuario", "empresa"],
  asistencia_dispositivos: ["dispositivo"],
  asistencia_feriados: ["fecha"],
  asistencia_horarios: ["empleado_codigo"],
  asistencia_horas_extra_aprobadas: ["empleado_codigo", "fecha"],
  asistencia_personas: ["empleado_codigo"],
  asistencia_planilla_manual: ["quincena", "empleado_codigo"],
  asistencia_prestamo_aprobado: ["quincena", "empleado_codigo"],
  asistencia_reparto_empresa: ["empleado_codigo", "empresa"],
  comision_vendedor_alias: ["nombre_switch"],
  comision_vendedor_tasa: ["vendedor_nombre"],
  cron_heartbeats: ["cron_name"],
  cuentas_contables: ["empresa_key", "cuenta"],
  fg_catalogo_publico_switch: ["empresa_key"],
  fg_user_switch_vendedor: ["user_id", "empresa_key"],
  login_attempts: ["ip"],
  multifashion_caja_diaria: ["fecha"],
  switch_articulo_info: ["empresa_key", "codigo"],
  switch_articulo_marca: ["empresa_key", "articulo_id"],
  switch_ingresos_mercancia: ["empresa_key", "n_interno", "linea"],
  vendedores: ["empresa_key", "nombre"],
});

/**
 * Tablas que una migración crea pero que NUNCA llegaron a producción (se
 * renombraron, se reemplazaron o la migración quedó sin correr). No se
 * clasifican porque no existen; la lista es corta y cerrada a propósito.
 */
export const TABLAS_DE_MIGRACION_QUE_NO_EXISTEN: readonly string[] = [
  "comision_tasas",
  "fg_audit_log",
  "fg_user_modules",
  "mk_cobranzas",
  "mk_pagos",
];
