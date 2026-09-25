-- ─────────────────────────────────────────────────────────────────────────────
-- MULTIFASHION — LA TIENDA SALE A LAS 19:00, NO A LAS 18:30 (25-sep-2026)
--
-- Daniel, textual: «en Multifashion, todos menos Ana, Cindy y Yeisibeth salen a
-- las 7, ¿por qué está 6:30? y entran a las 10. 10–7 y una hora de almuerzo; y
-- las impulsadoras de 9–6, una hora de almuerzo».
--
-- Medido antes de escribir esto: las tres impulsadoras (2, 3, 306) YA están en
-- 09:00–18:00 · 60 min desde el 23-sep. Las cinco de la tienda (301 Jenifer,
-- 302 Milagros, 303 Jailine, 304 Sheynee, 305 Angel) están en 10:00–18:30.
-- Solo cambia la SALIDA de esas cinco. Entrada y almuerzo quedan igual.
--
-- Toca 5 filas de `asistencia_horarios`. Solo hacia adelante: una quincena ya
-- cerrada no se recalcula (la planilla guardada es el resultado congelado).
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE asistencia_horarios
   SET salida = '19:00:00', updated_at = now()
 WHERE empleado_codigo IN ('301','302','303','304','305')
   AND salida = '18:30:00';
