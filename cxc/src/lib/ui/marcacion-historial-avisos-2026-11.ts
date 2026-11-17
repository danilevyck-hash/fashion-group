// 🔴 EL INTERRUPTOR de «Mis marcaciones» y «Recordatorios» en Marcación
// (16-nov-2026, aprobado por Daniel con el mockup HOY vs RECOMENDACIÓN).
//
// `false` = la pantalla de marcar queda como hoy: sin las dos filas debajo del
// botón. Se prende recién con las migraciones `20270119120000` (tablas) y
// `20270120130000` (la llamada cada 5 minutos) aplicadas y las llaves VAPID
// puestas en Vercel. Ver docs/postmortems/asistencia-planilla.md › «Mis
// marcaciones y recordatorios».
// 🔴 16-nov-2026: PRENDIDO. Daniel: «prende marcación».
export const MARCACION_HISTORIAL_Y_AVISOS_2026_11 = true;
