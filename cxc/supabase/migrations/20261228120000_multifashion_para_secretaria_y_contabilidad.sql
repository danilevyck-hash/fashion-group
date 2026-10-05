-- ============================================================================
-- Multifashion para SECRETARIA (ver) y CONTABILIDAD (ver) — 5-oct-2026
-- ============================================================================
-- Daniel, 5-oct-2026: que la secretaria pueda VER Multifashion, y quitar
-- Multifashion del selector de Comisiones «para no enredar». Lo que se pagaba
-- ahí (total por persona, bonos, la barra «TOTAL A PAGAR · Multifashion») vive
-- ahora en Multifashion › Vendedoras, así que quien paga —contabilidad— tiene
-- que entrar al módulo.
--
-- Revierte a propósito `20261118120000_andrea_sin_multifashion.sql` (11-sep:
-- «quita Multifashion, porque ahora lo verá en Comisiones»): ya no lo verá ahí.
--
-- ⚠️ ESTO NO ABRE ESCRITURA. Lo que abre la lectura es el código
-- (`modules.ts` › roles de la ficha → `ROLES_MULTIFASHION`); lo que escribe
-- sigue cerrado: `POST /api/multifashion/contactos` con
-- `ROLES_MULTIFASHION_ESCRITURA` (admin · gerente_acs) y las metas, solo admin.
--
-- MEDIDO EN PRODUCCIÓN ANTES DE ESCRIBIR ESTO (5-oct-2026):
--   · `role_permissions.secretaria` y `.contabilidad` sin `multifashion`.
--   · Overrides vivos: `Angela` y `andrea` (las dos secretarias), sin
--     `multifashion`. Contabilidad no tiene override (usa el de su rol).
--
-- QUÉ NO HACE: no toca datos de negocio, ni los otros roles, ni le quita nada
-- a nadie. Aditiva e idempotente (`array_append` solo si falta).
-- ============================================================================

UPDATE role_permissions
   SET modulos = array_append(COALESCE(modulos, '{}'), 'multifashion'),
       updated_at = now()
 WHERE role IN ('secretaria', 'contabilidad')
   AND NOT ('multifashion' = ANY (COALESCE(modulos, '{}')));

UPDATE fg_users
   SET modulos_override = array_append(modulos_override, 'multifashion')
 WHERE role = 'secretaria'
   AND modulos_override IS NOT NULL
   AND cardinality(modulos_override) > 0
   AND NOT ('multifashion' = ANY (modulos_override));

NOTIFY pgrst, 'reload schema';

-- Verificación (no escribe):
--   SELECT role, modulos FROM role_permissions WHERE 'multifashion' = ANY (modulos);
--   SELECT name, role, modulos_override FROM fg_users WHERE modulos_override IS NOT NULL;
