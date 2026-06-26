-- ─────────────────────────────────────────────────────────────────────────────
-- FIX P0: la pantalla de fórmulas mostraba "Todavía no hay fórmulas" aunque la
-- tabla tiene datos. Causa raíz (diagnosticada): la lectura se ejecuta con el rol
-- `anon` y la única policy era `to service_role`, así que RLS devolvía [] EN
-- SILENCIO (HTTP 200, sin error). Con la service role key sí devuelve las filas.
--
-- Esta migración agrega una policy de SOLO LECTURA para todos los roles, de modo
-- que la lista de fórmulas y el historial se lean aunque el runtime no tenga la
-- service key. Los datos no son sensibles (fórmulas de precio) y la página ya está
-- protegida por auth a nivel de API (requireAuth admin/secretaria).
--
-- La ESCRITURA sigue restringida a service_role (la API server-side la usa). Si un
-- entorno no tiene la service key, podrá LEER pero no guardar; lo ideal es además
-- definir SUPABASE_SERVICE_ROLE_KEY en ese entorno.
--
-- Aditiva e idempotente. No borra datos ni la policy de service_role existente.
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists public_read on marca_formulas;
create policy public_read on marca_formulas
  for select
  using (true);

drop policy if exists public_read on carga_history;
create policy public_read on carga_history
  for select
  using (true);
