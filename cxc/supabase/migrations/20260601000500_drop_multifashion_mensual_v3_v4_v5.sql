-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: limpieza — DROP de multifashion_mensual viejas (v3, v4, v5)
--
-- ⚠️ NO APLICAR TODAVÍA. Dejar pendiente hasta confirmar que v6 lleva varios días
-- estable en prod (sin errores en el tab Multifashion ni en logs). Esto solo
-- borra funciones huérfanas; no aporta nada urgente y es irreversible salvo
-- re-aplicar la migración que las creaba.
--
-- CONTEXTO:
-- El frontend (src/lib/ventas/queries.ts → fetchMultifashion) llama SOLO a
-- multifashion_mensual_v6 (migración 20260601000400). v3/v4/v5 quedaron huérfanas
-- al iterar el cálculo de margen/comparativo. Ninguna función o vista las llama
-- internamente (verificado: v6 no referencia versiones viejas; sin llamadas
-- cruzadas en migraciones).
--
-- ESTADO REAL EN DB (sondeado 2026-06-01 vía pg/rpc):
--   multifashion_mensual (base) → ya NO existe
--   multifashion_mensual_v2     → ya NO existe (la dropeó la migración de v3)
--   multifashion_mensual_v3     → ya NO existe
--   multifashion_mensual_v4     → ya NO existe
--   multifashion_mensual_v5     → EXISTE  ← único drop real pendiente
--   multifashion_mensual_v6     → EXISTE  ← ACTIVA, NO tocar
--
-- Los DROP de v3/v4 quedan por intención (idempotentes con IF EXISTS): documentan
-- que son obsoletas y cubren cualquier entorno donde aún existieran. El drop con
-- efecto real hoy es el de v5.
--
-- Firma de todas: (p_year int, p_mes int) → (int, int).
--
-- Aplicar manual en Supabase Dashboard → SQL Editor (cuando se confirme estable).
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS multifashion_mensual_v3(int, int);
DROP FUNCTION IF EXISTS multifashion_mensual_v4(int, int);
DROP FUNCTION IF EXISTS multifashion_mensual_v5(int, int);

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────────
-- Verificación post-aplicación (debe quedar SOLO v6):
--   SELECT proname, pg_get_function_identity_arguments(oid) AS args
--   FROM pg_proc
--   WHERE proname LIKE 'multifashion_mensual%'
--   ORDER BY proname;
--   -- esperado: una sola fila → multifashion_mensual_v6 | p_year integer, p_mes integer
-- ─────────────────────────────────────────────────────────────────────────────
