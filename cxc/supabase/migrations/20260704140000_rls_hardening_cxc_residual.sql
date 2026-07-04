-- 20260704140000_rls_hardening_cxc_residual.sql
-- Cierra el RESIDUAL de la fuga anon (auditoria 4-jul): las tablas/vista que el
-- dashboard CXC leia/escribia client-side con la anon key PUBLICA. Confirmado por
-- curl: anon devolvia datos de contacto y de PAGOS de clientes via REST directo.
--
--   * cxc_client_overrides, cxc_contact_log -> tablas: RLS + solo service_role.
--   * switch_recibos -> tabla base de los recibos (pagos por cliente). La vista de
--       ultimo pago sale de aqui; se cierra TAMBIEN porque cerrar solo la vista
--       dejaria los recibos legibles por anon directo (fix incompleto). Todo su
--       acceso en la app es server-side/service_role (sync-recibos, ficha cliente).
--   * switch_ultimo_pago_cliente_v2 -> VISTA: REVOKE del SELECT anon (las vistas no
--       llevan RLS; el gate es el GRANT). service_role conserva acceso.
--
-- Codigo: las lecturas/escrituras migraron a rutas server /api/cxc/overrides,
-- /api/cxc/contact-log y /api/cxc/ultimo-pago (service_role) en el MISMO deploy.
-- ORDEN: correr este SQL DESPUES de que el deploy este verde (si no, el dashboard
-- CXC -- que hasta el deploy lee/escribe con anon -- queda ciego en la ventana).
--
-- Idempotente / robusto: dropea TODAS las policies y recrea; salta inexistentes.

do $$
declare
  t text;
  p record;
  private_tables text[] := array['cxc_client_overrides', 'cxc_contact_log', 'switch_recibos'];
begin
  foreach t in array private_tables loop
    if to_regclass('public.' || t) is null then
      raise notice 'skip (no existe): %', t;
      continue;
    end if;
    execute format('alter table public.%I enable row level security', t);
    for p in
      select policyname from pg_policies where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy if exists %I on public.%I', p.policyname, t);
    end loop;
    execute format(
      'create policy service_role_all on public.%I for all to service_role using (true) with check (true)',
      t
    );
  end loop;
end $$;

-- Vista de ultimo pago: quitar el SELECT de anon/authenticated.
do $$
begin
  if to_regclass('public.switch_ultimo_pago_cliente_v2') is not null then
    execute 'revoke select on public.switch_ultimo_pago_cliente_v2 from anon, authenticated';
  end if;
end $$;
