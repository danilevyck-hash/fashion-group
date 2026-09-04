-- ─────────────────────────────────────────────────────────────────────────────
-- Comisiones — retirar a Rey Stoute Aguas (3-sep-2026).
--
-- Daniel, textual: «esconder rey stoute» y, corrigiendo la primera versión del
-- cambio: «te dije que eliminaras Rey Stoute Aguas.»
--
-- Qué hace: DESACTIVA su fila de tasa (`activo = false`). NUNCA DELETE — regla
-- de la casa: la fila es historial de que existió y de qué tasa tuvo.
--
-- Qué NO hace, a propósito:
--   · No toca `comision_vendedor_alias`: AGUAS → REY STOUTE AGUAS SE QUEDA. Es
--     lo que permite que la lista de retirados del código
--     (`src/lib/comisiones/retirados.ts`) lo reconozca por cualquier grafía.
--   · No toca Switch: sus 4 facturas de julio en Vistana (y sus recibos) siguen
--     ahí y la RPC `comision_b2b_v8` las sigue calculando. Es la lista de
--     retirados la que las saca de toda superficie de Comisiones —tablas,
--     tarjetas, detalle, Excel, Configuración— y de los totales ($49,83 en
--     2026, medido con `scripts/_medir-comisiones-aguas-retirado.mjs`).
--
-- Se aplica con:  npm run migrar supabase/migrations/20260916120000_retirar_rey_stoute_aguas.sql
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE comision_vendedor_tasa
SET activo = false,
    updated_at = now()
WHERE vendedor_nombre = 'REY STOUTE AGUAS';
