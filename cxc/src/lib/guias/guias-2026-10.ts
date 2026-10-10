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
 *
 *  ⚠️ 5-oct-2026: lo de arriba (marco compacto y una fila por envío) YA está en
 *  producción: se prendió junto con `GUIAS_LISTA_APPLE_2026_10`.
 *
 *  🔴 9-oct-2026 — SEGUNDA PASADA, apagada (este interruptor ahora gobierna esto).
 *  La pantalla contesta «¿qué va en esta guía y ya salió?». Medido del 1-sep al
 *  9-oct-2026: 39 despachos, 37 de Bodega (desde el celular); 12 de 29 N° del
 *  transportista se anotaron después de despachar; observaciones en 14 de 37.
 *  · «Despachada» junto al título (antes solo «Pendiente» tenía distintivo).
 *  · Observaciones ANTES de los envíos.
 *  · Ya despachada: sin el título «Ya despachada» ni «Tipo de despacho» (lo dice
 *    la línea de datos); entra «Despachado por»; el N° del transportista se
 *    muestra en CADA envío, siempre, aunque se repita (corrección de Daniel al
 *    aprobar: *«El N.º del transportista es por envío, no por guía»*).
 *  · Pendiente: «N° del transportista» solo en la caja (se van la frase y el
 *    rótulo de columna); «Tipo de despacho» en una línea con «Cambiar»; los
 *    cuatro datos en una fila; «Despachar» negro que no se apaga y dice TODO lo
 *    que falta al tocarlo (como «Guardar guía»).
 *  · Celular: Editar · Imprimir · Compartir en una sola fila.
 *  🔴 Solo pantalla: el PUT del despacho es idéntico y el servidor sigue
 *  exigiendo lo mismo. Imprimir y Compartir no dejan registro: no se midieron y
 *  por eso no se escondió ninguno.
 *  🔴 PRENDIDO el 9-oct-2026 con el «sí» de Daniel al mockup, con esa corrección.
 *  «Despachar» siempre prendido es un CAMBIO DE DECISIÓN suyo (antes: «el botón
 *  se apaga y dice qué falta»); ver `DespachoForm.tsx` y `postmortems/guias.md`.
 *  `false` = la pantalla de antes, byte por byte (candado
 *  `guias-detalle-apple-apagado.test.tsx`). */
export const GUIA_DETALLE_APPLE_2026_10 = true;

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

/** 🔴 NUEVA GUÍA › «+ AGREGAR TRASLADO» (5-oct-2026, Daniel: «toda sugerencia
 *  tuya es aceptada»). Al lado de «+ Agregar factura», mismo estilo: Cliente
 *  (también a mano) · Contenido · Bultos · Destino («el de siempre») · «Empresa:
 *  Ninguna ▾». Sale como tarjeta con el chip «Traslado». Se guarda IGUAL que
 *  antes: `Traslado` en facturas y «Traslado <cliente>: <contenido>» en
 *  Observaciones. `false` = el enlace gris «Traslado» dentro de «+ Agregar factura». */
export const GUIA_AGREGAR_TRASLADO_2026_10 = true;
