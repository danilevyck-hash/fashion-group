-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: RPC wrapper para REFRESH MATERIALIZED VIEW CONCURRENTLY
--
-- supabase-js no expone ejecución SQL raw — para ejecutar REFRESH desde el
-- cron de Vercel necesitamos una función SQL llamable vía .rpc().
--
-- SECURITY DEFINER permite que el caller (service_role del cron) ejecute el
-- REFRESH sin necesidad de privilegios directos sobre la materialized view.
--
-- Prerequisito ya existente: UNIQUE INDEX (cliente_norm, empresa) en
-- clientes_empresa_12m_vw (creado en migration 20260510040000).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION refresh_clientes_empresa_12m_vw()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY clientes_empresa_12m_vw;
END;
$$;

GRANT EXECUTE ON FUNCTION refresh_clientes_empresa_12m_vw() TO service_role;
