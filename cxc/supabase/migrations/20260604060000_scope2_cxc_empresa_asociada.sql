-- ═════════════════════════════════════════════════════════════════════════════
-- SCOPE 2 — CXC por empresa asociada (vendedor).
-- ═════════════════════════════════════════════════════════════════════════════
-- fg_users.associated_company ya existe. Define qué vendedor queda restringido:
--   • Edwin  → 'vistana'  (solo ve el CXC de Vistana International)
--   • Rey    → NULL       (ve el CXC de todas las empresas)
-- El filtro se aplica server-side en /api/cxc/aging según esta columna.
-- Idempotente (re-ejecutable sin efectos secundarios).
-- ═════════════════════════════════════════════════════════════════════════════

UPDATE fg_users SET associated_company = 'vistana'
 WHERE lower(name) = 'edwin'
   AND (associated_company IS DISTINCT FROM 'vistana');

UPDATE fg_users SET associated_company = NULL
 WHERE lower(name) = 'rey'
   AND associated_company IS NOT NULL;
