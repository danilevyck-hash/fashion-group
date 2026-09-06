// ─────────────────────────────────────────────────────────────────────────────
// EL NÚMERO DE FACTURA EN EL DETALLE DE COMISIONES — corto en PANTALLA.
//
// Daniel, 6-sep-2026: en el detalle, `11-000003022` no cabe y **parte cada fila
// en dos líneas**. Se muestran los últimos 4 dígitos (`3022`).
//
// ⚠️ **EN EL EXCEL SE QUEDA LARGO**, y es una decisión, no un olvido: Daniel lo
// rechazó expresamente (*«no»*). El Excel es el papel que concilia el contador
// contra Switch, y ahí el secuencial completo identifica el comprobante sin
// ambigüedad. Lo mismo vale para el reporte impreso, que es el mismo papel.
//
// 🔴 LA REGLA NO SE DUPLICA. Es exactamente la misma que ya rige en Guías
// (`lib/guias/numero-factura.ts`, 5-sep-2026): se guarda lo que Switch manda,
// se MUESTRA el número corto, y solo se recorta lo que tiene la FORMA de un
// secuencial de Switch (`11-000003022`) — un `2534`, un `Traslado` o un
// `FA-0012` salen tal cual. Este archivo existe para que Comisiones no importe
// de `lib/guias` y para que el porqué quede escrito acá, no para tener una
// segunda copia de la regla.
// ─────────────────────────────────────────────────────────────────────────────

export { facturaParaMostrar } from "@/lib/guias/numero-factura";
