-- GUÍAS › ETIQUETAS — SIN TOPE DE BULTOS.
-- 🔴 Daniel, 2-oct-2026: «quita el límite ya». El CHECK de
-- 20261207120000_guias_etiquetas.sql limitaba `cajas` a 300 y frenó una
-- impresión real. Queda solo la regla lógica: un entero mayor que 0.
-- ⚠️ PENDIENTE DE APROBACIÓN DE DANIEL antes de aplicarla.

ALTER TABLE guias_etiquetas DROP CONSTRAINT IF EXISTS guias_etiquetas_cajas_rango;
ALTER TABLE guias_etiquetas ADD CONSTRAINT guias_etiquetas_cajas_rango CHECK (cajas >= 1);
