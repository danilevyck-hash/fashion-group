-- ─────────────────────────────────────────────────────────────────────────────
-- MULTIFASHION — LA TIENDA VUELVE A SALIR A LAS 18:30 (1-oct-2026)
--
-- Deshace `20261221130000_multifashion_salida_19.sql`. Daniel, 1-oct-2026:
-- «multifashion es de 10am a 7pm, una hora de almuerzo» y, comparando contra
-- el Excel de la contable: «si cambio de 10-630, ¿multifashion cuadra?» → «sí,
-- cámbialo a 6:30». La jornada pagada es 10:00–18:30 (60 min de almuerzo) y la
-- media hora hasta las 19:00 es hora extra — los 30 min diarios que la
-- contable paga y que entran sin aprobación (regla de ACS, `planilla.ts`).
--
-- Simulado antes de escribir esto (1–15 sep): Jenifer −0.27 · Jailine +1.62 ·
-- Milagros +2.88 · Sheynee +0.59 · Angel +7.54 contra el Excel.
--
-- Solo las cinco de la tienda (301–305); las impulsadoras (2, 3, 306) siguen en
-- 09:00–18:00. Solo hacia adelante: una quincena cerrada no se recalcula.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE asistencia_horarios
   SET salida = '18:30:00', updated_at = now()
 WHERE empleado_codigo IN ('301','302','303','304','305')
   AND salida = '19:00:00';
