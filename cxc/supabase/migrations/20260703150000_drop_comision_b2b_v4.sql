-- ═════════════════════════════════════════════════════════════════════════════
-- Limpieza: DROP comision_b2b_v4 (atribución de ventas por dueño de cartera)
-- ═════════════════════════════════════════════════════════════════════════════
-- comision_b2b_v5 (ventas por vendedor de la factura, query-time) quedó validada
-- en producción y el route /api/ventas/comisiones apunta a v5 desde el deploy de
-- la migración 20260703120000. v4 quedaba solo como rollback; se elimina.
--
-- Rollback si hiciera falta: re-correr 20260604080000_comision_b2b_v4.sql
-- (la definición completa de v4 vive ahí) y apuntar el route de vuelta.

DROP FUNCTION IF EXISTS comision_b2b_v4(text, int, int);

NOTIFY pgrst, 'reload schema';
