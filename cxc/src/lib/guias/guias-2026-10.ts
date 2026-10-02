// ─────────────────────────────────────────────────────────────────────────────
// GUÍAS · LO QUE DANIEL APROBÓ EL 1-oct-2026 SOBRE EL MOCKUP — los interruptores.
//
// 1. NUEVA GUÍA (`GUIA_NUEVA_2026_10`):
//    · «Información general» = Fecha (hoy de Panamá, editable) · Modo de entrega
//      · Transportista con el desplegable VACÍO («Seleccionar transportista…»,
//      nunca el último usado).
//    · «Despachado por» SALE de la creación y pasa al DESPACHO de bodega, donde
//      es OBLIGATORIO para completar — en la pantalla y en el SERVIDOR.
//    · UNA SOLA TABLA «Detalle de envío»: los envíos etiquetados marcados (bultos
//      con candado) y los renglones sin etiqueta; abajo, en gris, «Etiquetados,
//      sin marcar». El buscador de cliente y facturas vive DENTRO de «+ Agregar
//      sin etiquetas».
//    · UN RENGLÓN POR ENVÍO: dos envíos del mismo cliente + empresa + destino no
//      se juntan (la numeración se repetiría).
//    · Al tocar «Guardar guía» con algo faltante sale UNA línea con TODO lo que
//      falta; antes de intentar, no hay aviso.
//
// 2. ETIQUETAS (`ETIQUETAS_2026_10`):
//    · Cada factura marcada lleva su NÚMERO DE ORDEN (el orden de los bultos) y
//      se reordena con ↑ ↓.
//    · La FECHA impresa es la del día en que se IMPRIME (Panamá).
//    · No se ofrecen facturas que ya salieron en una guía (la MISMA regla del
//      chip «Ya salió en GT-xxx» de Nueva guía).
//
// 3. NUEVA GUÍA ESTILO APPLE (`GUIA_APPLE_2026_10`, 1-oct-2026, «Propuesta estilo Apple»
//    del mockup, PRENDIDA: Daniel aprobó las capturas reales el 1-oct-2026,
//    «aprobado»; reglas en docs/diseno.md):
//    · «Nueva guía» + GT-xxx; en UNA línea la fecha (hoy), «Transportista
//      externo / Entrega directa» y el transportista (nace VACÍO) solo si es
//      externo.
//    · «Etiquetados»: cada envío pendiente es una TARJETA que se toca para
//      marcarla; «Facturas» con el chip «Sin etiqueta» y «+ Agregar factura».
//    · «Observaciones» siempre visible y una barra fija abajo con
//      «N bultos · M envíos» y «Guardar guía» (apagado sin envíos).
//    · 🔴 SOLO CAMBIA LA PANTALLA: lo que se guarda es idéntico (candado
//      `guias-nueva-guia-apple.test.tsx`). Editar una guía no cambia.
//    · Depende de `GUIA_NUEVA_2026_10`: sin él, no aplica.
//
// 🔴 `false` = la pantalla y las reglas como estaban el 30-sep-2026.
// ─────────────────────────────────────────────────────────────────────────────

/** 🔴 Nueva guía en una sola tabla y «Despachado por» al despachar. */
export const GUIA_NUEVA_2026_10 = true;

/** 🔴 Etiquetas: orden ↑↓, fecha de impresión y sin facturas ya despachadas. */
export const ETIQUETAS_2026_10 = true;

/** 🔴 Nueva guía estilo Apple (tarjetas y barra fija). `false` = la de una tabla.
 *  Daniel aprobó las capturas reales el 1-oct-2026: "aprobado". */
export const GUIA_APPLE_2026_10 = true;

/** 🔴 DETALLE DE GUÍA ESTILO APPLE (2-oct-2026, propuesta; Daniel: «mira que hay
 *  mucho espacio vacío, ¿qué opinas?»). Solo `/guias/[id]` en modo lectura:
 *  · el MISMO marco que Nueva guía Apple, alineado a la izquierda;
 *  · la tarjeta de arriba compacta: datos en una línea y las acciones a la derecha;
 *  · cada envío en UNA fila en la computadora (cliente · línea gris · bultos
 *    angosto o «🔒 9 bultos» · N° del transportista de 160–200 px); en el
 *    celular se apila.
 *  🔴 Solo cambia la pantalla: mismas cajas, mismos setters, el PUT del
 *  despacho es idéntico (candado `guias-detalle-apple.test.tsx`).
 *  `false` = la pantalla de hoy. */
export const GUIA_DETALLE_APPLE_2026_10 = false;

/** 🔴 ETIQUETAS · TRASLADO SIN FACTURA (2-oct-2026). Daniel aprobó el
 *  2-oct-2026 («sigue»); migración `20261226120000` aplicada el mismo día. Daniel: «¿y si
 *  quiero mandar algo extra de la bodega que no está en el sistema?» (muebles,
 *  ganchos, paneles). En Etiquetas › Nuevo envío, al lado de las facturas, la
 *  opción «Traslado (sin factura)»: empresa a mano, «Contenido» (≤ 15, va en la
 *  línea de la nota), destino y bultos. El papel dice TRASLADO donde va la
 *  factura; en Nueva guía entra como un envío más, con «Traslado» en facturas,
 *  sus bultos 🔒 y el contenido en Observaciones.
 *  Necesita la migración `20261226120000` (factura opcional); sin ella el
 *  servidor contesta 503 y lo dice. `false` = Etiquetas como hoy. */
export const ETIQUETAS_TRASLADO_2026_10 = true;
