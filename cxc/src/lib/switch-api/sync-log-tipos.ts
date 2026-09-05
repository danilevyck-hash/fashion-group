// ─────────────────────────────────────────────────────────────────────────────
// Los `sync_type` que `switch_sync_log` admite. Módulo PURO — ni Supabase ni
// red — para que el candado que lo compara contra el SQL corra sin credenciales.
// ─────────────────────────────────────────────────────────────────────────────

// ─── LOS `sync_type` QUE LA BASE ADMITE — fuente única (7-ago-2026) ──────────
//
// 🩸 Por qué existe esta lista y por qué el tipo del parámetro NO es `string`:
// `switch_sync_log.sync_type` tiene un CHECK. Cuando el código estrena un tipo
// que el CHECK no lista, el INSERT lo rechaza y este logger es DEGRADABLE: se
// traga el error con un `console.error` y devuelve `logId = null`. A partir de
// ahí `finishSwitchSyncLog` es un no-op, así que la corrida NO deja fila — ni
// 'running', ni 'success', ni 'error'. **Corra bien o corra mal, es invisible.**
//
// Ya pasó DOS veces, con el mismo desenlace y meses de distancia:
//   · `catalogo_tommy` — cero filas en toda su historia hasta la migración
//     20260725230000 (verificado con una corrida exitosa que no dejó rastro).
//   · `articulo_marca` — el sync del diccionario de marcas se estrenó el
//     6-ago-2026 y su migración creó la TABLA pero no tocó el CHECK. El 7-ago
//     la corrida escribió 2.000 filas, murió a mitad de camino y no dejó NADA
//     en el log: sin fila no hay racha, y sin racha la política anti-ruido no
//     tiene con qué medir.
//
// La lista de acá tiene que ser IDÉNTICA a la del CHECK vigente en las
// migraciones, y el candado `src/__tests__/lib/sync-log-tipos-check.test.ts` lo
// verifica leyendo el SQL: agregar un tipo en el código sin su DDL pone el build
// ROJO en vez de descubrirse meses después con una tabla vacía.
export const SYNC_LOG_TYPES = [
  "facturas",
  "estadocuenta",
  "costo",
  "utilidad",
  "recibos",
  "proveedores",
  "articulos",
  "articulo_marca",
  "articulo_info",
  // El DIRECTORIO de clientes de una empresa (5-sep-2026). Hoy lo escribe un
  // solo cron: el semanal de Confecciones Boston, cuyo directorio llevaba 37
  // días congelado porque su estado de cuenta por API está vetado y el
  // directorio viajaba adentro de ESE sync. Su DDL va en la MISMA migración que
  // lo estrena (20260923120000) — que es justo lo que NO se hizo con
  // catalogo_tommy ni con articulo_marca, y por eso las dos corrieron
  // invisibles durante meses.
  "clientes",
  "multifashion",
  "catalogo_reebok",
  "catalogo_joybees",
  "catalogo_tommy",
  "catalogo_calvin",
  "egresos_varios",
  "cuentas_contables",
  // El detalle de línea de facturas y NC (24-ago-2026). Su DDL va en la MISMA
  // migración que la tabla — que es justo lo que NO se hizo con catalogo_tommy
  // ni con articulo_marca, y por eso las dos corrieron invisibles.
  "factura_lineas",
  // Las COMPRAS: el detalle línea por artículo del reporte web de ingreso de
  // mercancía (25-ago-2026). Su DDL va en la MISMA migración que lo estrena
  // (20260825090000) — que es justo lo que NO se hizo con catalogo_tommy ni con
  // articulo_marca, y por eso las dos corrieron invisibles durante meses.
  "ingresos_mercancia",
  // El CENTINELA de tipos de comprobante de venta (26-ago-2026): deja una fila
  // por empresa y corrida diciendo si apareció un `tipo_comprobante` que el
  // tablero no sabe contar. Sin esa fila, la regla de los 2 fallos seguidos de
  // `alert-policy.ts` no tendría qué medir y avisaría en la primera corrida,
  // para siempre. Su DDL va en la MISMA migración que lo estrena
  // (20260826140000).
  "ventas_tipos",
  // ⚠️ RETIRADO el 13-ago-2026: ningún sync escribe ya este tipo. Se QUEDA en la
  // lista porque el CHECK de `switch_sync_log` sí lo admite y hay filas
  // históricas con ese valor; sacarlo de acá sin una DDL que reescriba el CHECK
  // haría divergir el código de la base — que es exactamente lo que este candado
  // vigila. Barrer el CHECK es higiene opcional, no un pendiente.
  "mayor",
] as const;

export type SyncLogType = (typeof SYNC_LOG_TYPES)[number];
