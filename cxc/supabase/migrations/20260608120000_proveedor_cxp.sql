-- ─────────────────────────────────────────────────────────────────────────────
-- Módulo Proveedores / Cuentas por Pagar (CxP) — Fase 1 (datos)
--
-- Una fila por (empresa_key, proveedor_switch_id). La llena el cron
-- /api/cron/sync-proveedores, que itera /apiproveedor/lista y luego
-- /apiproveedor/info?proveedorId=X (endpoint NO documentado que SÍ trae el estado
-- de cuenta de CxP: saldoTotal, aging bucketizado, y el ledger de facturas+pagos).
--
-- DDL — correr a mano en el SQL Editor de Supabase.
-- (Sin signos de dolar en comentarios — gotcha del parser del SQL Editor.)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists switch_proveedor_estadocuenta (
  id                  uuid primary key default gen_random_uuid(),
  empresa_key         text    not null,
  proveedor_switch_id integer not null,

  -- Directorio / fiscal (de /apiproveedor/info -> proveedor{})
  codigo              text,
  nombre              text    not null,
  identificacion      text,           -- RUC
  dv                  text,
  direccion           text,
  contacto            text,
  telefono            text,
  celular             text,
  email               text,
  tipo_proveedor      text,

  -- Financiero (de /apiproveedor/info -> estadodecuenta{})
  saldo_total         numeric not null default 0,   -- positivo = por pagar; negativo = saldo a favor
  aging               jsonb   not null default '[]', -- [{title,saldo}] 8 buckets que da Switch (0-30 .. Mas de 365)
  comprado_ytd        numeric not null default 0,    -- suma de cargos (credito) del anio en curso
  pagado_ytd          numeric not null default 0,    -- suma de pagos (debito) del anio en curso
  num_facturas        integer not null default 0,
  num_pagos           integer not null default 0,

  -- Ultimo pago (fila de pago mas reciente del ledger)
  ultimo_pago_monto   numeric,        -- null si nunca hubo pago
  ultimo_pago_fecha   date,
  ultimo_pago_dias    integer,        -- dias desde el ultimo pago (como CXC "hace N d")

  -- Ledger crudo (facturas + pagos) por si la ficha quiere el detalle
  elements            jsonb   not null default '[]',

  synced_at           timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  unique (empresa_key, proveedor_switch_id)
);

create index if not exists idx_prov_cxp_empresa on switch_proveedor_estadocuenta (empresa_key);
create index if not exists idx_prov_cxp_saldo   on switch_proveedor_estadocuenta (saldo_total);
create index if not exists idx_prov_cxp_nombre  on switch_proveedor_estadocuenta (lower(nombre));

-- Nota: el cron loguea a switch_sync_log con sync_type='proveedores'. Si esa tabla
-- tiene un CHECK que restringe sync_type y NO incluye 'proveedores', la fila de log
-- se omite silenciosamente (createLog es tolerante) — el sync y el heartbeat siguen
-- funcionando. Para persistir el log, ampliar ese CHECK con 'proveedores'.
