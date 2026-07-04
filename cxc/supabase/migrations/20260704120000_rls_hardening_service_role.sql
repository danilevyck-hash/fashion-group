-- 20260704120000_rls_hardening_service_role.sql
-- Cierra las policies RLS permisivas (FOR ALL USING(true), rol public/anon) que
-- exponian datos sensibles a la anon key PUBLICA (embebida en el bundle del browser).
--
-- Contexto (auditoria 4-jul-2026): NO existe un proyecto Supabase Reebok separado
-- -- reebokServer y el cliente anon del catalogo caen al proyecto principal. Con la
-- anon key publica cualquiera leia reebok_orders (client_email de TODOS los pedidos),
-- user_sessions (session_token) y escribia products/inventory via REST directo,
-- saltandose los guards de las rutas Next. Confirmado por curl (HTTP 200 anon).
--
-- Diseno:
--   * Tablas privadas   -> SOLO service_role (anon sin acceso).
--   * products, inventory -> lectura PUBLICA (SELECT) para el catalogo publico +
--     escritura SOLO service_role. Las rutas de escritura ya usan service_role
--     (products) o se migraron a service_role en el mismo deploy (inventory).
--
-- Notas:
--   * service_role tiene BYPASSRLS en Supabase, asi que las policies service_role
--     son explicitas/redundantes -- se dejan por claridad y a prueba de futuro.
--   * Idempotente: dropea TODAS las policies de cada tabla y recrea las correctas.
--   * Robusto: salta tablas inexistentes (to_regclass). NUNCA desactiva RLS.
--   * ORDEN DE DESPLIEGUE: correr DESPUES de que el deploy con las rutas de
--     inventory migradas a service_role este verde (si no, la edicion de inventario
--     del admin -- que hasta ese deploy escribe con anon -- queda bloqueada en la
--     ventana intermedia).

-- 1) Tablas privadas: acceso EXCLUSIVO service_role (anon sin acceso).
do $$
declare
  t text;
  p record;
  private_tables text[] := array[
    'reebok_orders', 'reebok_order_items',
    'user_sessions',
    'fg_users', 'fg_user_modules', 'fg_user_module_order', 'fg_audit_log',
    'reclamos', 'reclamo_items', 'reclamo_fotos', 'reclamo_seguimiento', 'reclamo_contactos',
    'directorio_clientes',
    'cheques',
    'caja_responsables', 'caja_categorias',
    'activity_logs',
    'ventas_raw', 'ventas_metas'
  ];
begin
  foreach t in array private_tables loop
    if to_regclass('public.' || t) is null then
      raise notice 'skip (no existe): %', t;
      continue;
    end if;
    execute format('alter table public.%I enable row level security', t);
    -- Borra CUALQUIER policy existente (permisiva o no) para no dejar huecos.
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

-- 2) products + inventory: lectura PUBLICA (catalogo sin login), escritura service_role.
do $$
declare
  t text;
  p record;
  public_read_tables text[] := array['products', 'inventory'];
begin
  foreach t in array public_read_tables loop
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
    -- Lectura publica (anon + authenticated + service_role): la necesita el catalogo.
    execute format('create policy public_read on public.%I for select using (true)', t);
    -- Escritura EXCLUSIVA service_role.
    execute format(
      'create policy service_role_write on public.%I for all to service_role using (true) with check (true)',
      t
    );
  end loop;
end $$;
