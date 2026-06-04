-- ═════════════════════════════════════════════════════════════════════════════
-- SCOPE 1 — Eliminar rol "director". Alberto → admin (ve todo como el owner).
-- ═════════════════════════════════════════════════════════════════════════════
-- El código ya no referencia "director" en ningún check de rol (admin pasa todo).
-- Acá: mover al único usuario director (Alberto) a admin y borrar su fila de
-- permisos. Idempotente.
-- ═════════════════════════════════════════════════════════════════════════════

UPDATE fg_users
   SET role = 'admin', updated_at = now()
 WHERE LOWER(name) = 'alberto' AND role = 'director';

DELETE FROM role_permissions WHERE role = 'director';

NOTIFY pgrst, 'reload schema';
