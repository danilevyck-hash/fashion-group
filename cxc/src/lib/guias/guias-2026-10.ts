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
// 🔴 `false` = la pantalla y las reglas como estaban el 30-sep-2026.
// ─────────────────────────────────────────────────────────────────────────────

/** 🔴 Nueva guía en una sola tabla y «Despachado por» al despachar. */
export const GUIA_NUEVA_2026_10 = true;

/** 🔴 Etiquetas: orden ↑↓, fecha de impresión y sin facturas ya despachadas. */
export const ETIQUETAS_2026_10 = true;
