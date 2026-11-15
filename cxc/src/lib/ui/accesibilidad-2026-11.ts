// ─────────────────────────────────────────────────────────────────────────────
// ACCESIBILIDAD (15-nov-2026) — los siete arreglos que Daniel aprobó tras la
// auditoría (`~/Desktop/revision-por-modulo/auditoria-accesibilidad.html`).
//
// `true` = la pantalla nueva: rótulos de datos en 14 px, encabezados de CxC
// que se ordenan con el teclado, palabra junto al punto de color, la barra de
// pestañas con rótulos de 12 px y fondo sólido, y sin explicaciones que solo
// salen al pasar el ratón. `false` = lo de antes, tal cual.
//
// ⚠️ Quedan FUERA del interruptor, a propósito (globales):
//   · los tonos más oscuros de ámbar, verde y rojo (`tailwind.config.ts` y las
//     variables `--fg-*` de globals.css), como se hizo con el gris;
//   · ampliar con dos dedos (`layout.tsx`, sin `maximumScale`);
//   · «reducir movimiento», el anillo de foco y los `<main>` del marco.
// Ningún monto ni cálculo cambia: solo letra, tono y cómo se llega con el teclado.
// ─────────────────────────────────────────────────────────────────────────────

export const ACCESIBILIDAD_2026_11 = true;
