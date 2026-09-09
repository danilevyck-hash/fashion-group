-- ═════════════════════════════════════════════════════════════════════════════
-- switch_estadocuenta_saldo — EL CUADRE QUE SWITCH YA NOS MANDABA Y TIRÁBAMOS
-- (9-sep-2026)
-- ═════════════════════════════════════════════════════════════════════════════
-- 🩸 Por qué existe. `GET /apicliente/estadocuenta` devuelve TRES cosas: los
-- documentos (`estadocuenta.elements[]`), el aging de ocho tramos (`Saldos[]`)
-- y el total que Switch mismo calculó (`saldoTotal`). El sync guardaba los
-- documentos y **descartaba las otras dos a propósito** — está escrito así en
-- `docs/switch-referencia.md`: «🔑 Descartamos `Saldos[]` y `saldoTotal`».
--
-- El resultado es que el sistema suma los documentos por su cuenta y **no tiene
-- con qué comprobarse**. Si un documento no llegó, o llegó con el saldo viejo,
-- el total sale mal y nada lo dice: el estado de cuenta se le manda al cliente
-- con un número que Switch no reconoce.
--
-- Daniel pidió el papel «tal cual como sale en Switch. Mismos números». Esto es
-- lo que permite AFIRMARLO: se compara nuestro total contra el suyo y, cuando no
-- coinciden, **se dice en pantalla** antes de mandar nada.
--
-- 🔴 SE GUARDA EL CRUDO DE `Saldos[]` COMO JSONB, NO OCHO COLUMNAS. La forma de
-- ese arreglo no está documentada (el PDF del API solo dice «aging 0-30…») y
-- nunca la vimos en vivo: inventarle ocho nombres de columna sería fijar en la
-- base una suposición. El único campo que se promueve a columna es
-- `saldo_total`, que es el que se usa. El día que se vea la forma real, los
-- ocho tramos salen del jsonb sin migrar nada.
--
-- ⚠️ Los tramos que se MUESTRAN siguen siendo los TRES de la pantalla
-- (0-90 / 91-120 / 121+). Daniel, textual: *«solo los 3 de mi lista»*. Esta
-- tabla no cambia ni un rótulo.
--
-- 🔴 ADITIVA. No toca `switch_estadocuenta` ni una fila. Mientras esta DDL no
-- corra, el sistema se comporta EXACTAMENTE como hoy: el lector falla ABIERTO
-- (sin fila → no hay con qué comparar → no se afirma nada), que es la regla de
-- la casa cuando el dato no está.
--
-- Grano: (empresa_key, cliente_switch_id) — el mismo par con el que el sync
-- pregunta, uno por cliente por empresa. El código del cliente viaja al lado
-- porque es la identidad con la que se lee (D-25), pero NO es la llave: lo
-- teclea una persona en Switch y puede faltar.
--
-- RLS: solo service_role. La app entra por el cliente del servidor.
-- ═════════════════════════════════════════════════════════════════════════════

create table if not exists public.switch_estadocuenta_saldo (
  empresa_key        text        not null,
  cliente_switch_id  integer     not null,
  cliente_codigo     text,
  -- El total que calculó Switch. NULL = la corrida no lo trajo; no es cero.
  saldo_total        numeric,
  -- `Saldos[]` tal cual llega, sin interpretar.
  saldos             jsonb,
  synced_at          timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  primary key (empresa_key, cliente_switch_id)
);

comment on table public.switch_estadocuenta_saldo is
  'El `saldoTotal` y el `Saldos[]` que manda /apicliente/estadocuenta, uno por (empresa, cliente). Sirve de CUADRE contra la suma de los documentos de switch_estadocuenta; no se muestra como aging (los tramos que se ven son los tres de la pantalla).';
comment on column public.switch_estadocuenta_saldo.saldo_total is
  'Total del estado de cuenta según Switch. NULL = la corrida no lo trajo (no es cero).';
comment on column public.switch_estadocuenta_saldo.saldos is
  'El arreglo Saldos[] crudo (aging de 8 tramos de Switch). Se guarda sin interpretar: su forma no está documentada.';

create index if not exists switch_estadocuenta_saldo_codigo_idx
  on public.switch_estadocuenta_saldo (cliente_codigo, empresa_key);

alter table public.switch_estadocuenta_saldo enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'switch_estadocuenta_saldo'
      and policyname = 'service_role_all'
  ) then
    create policy service_role_all on public.switch_estadocuenta_saldo
      for all to service_role using (true) with check (true);
  end if;
end $$;
