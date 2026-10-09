// ─────────────────────────────────────────────────────────────────────────────
// USUARIOS, ESTILO APPLE (9-oct-2026, propuesta).
//
// La pregunta de la pantalla: «¿quién entra al sistema y con qué rol?».
// Medido el 9-oct-2026: 17 usuarios, los 17 activos; ninguna visita
// registrada en dos semanas (pantalla de uso ocasional, solo admin). Cambios:
//
//   1. La lista agrupada POR ROL, en el orden de `SYSTEM_ROLES` (Administrador,
//      Contabilidad, Secretaria, Bodega…), un renglón por persona como Ajustes
//      del iPhone. Hoy son 17 tarjetas de 175 px en el orden en que se crearon
//      (en el celular, 3.300 px de alto; agrupada, 1.900).
//   2. Sale «Activo» con su punto verde de las 17: lo dice solo el que NO lo
//      está («Inactivo»). La segunda línea queda: permisos personalizados ·
//      última sesión.
//   3. El nombre como se escribe («Daniel», no «daniel»): la capitalización es
//      de pantalla, el dato no se toca.
//   4. Tocar el renglón abre «Editar usuario» (el lápiz se va); «Desactivar»
//      se queda al final del renglón. Computadora: «＋ Nuevo usuario» en la
//      fila de las pestañas; hoy ocupa una fila sola.
//
// `false` = la pantalla de hoy, byte por byte. Se prende con el «sí» de Daniel.
// Candado: `src/__tests__/components/usuarios-apple-apagado.test.tsx`.
// ─────────────────────────────────────────────────────────────────────────────

/** `false` = como hoy. Se prende con el «sí» de Daniel. */
export const USUARIOS_APPLE_2026_10 = false;
