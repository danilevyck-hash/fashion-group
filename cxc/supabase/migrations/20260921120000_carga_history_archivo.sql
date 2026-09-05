-- ─────────────────────────────────────────────────────────────────────────────
-- Historial del Depurador: el Excel descargado se guarda 90 días (4-sep-2026).
--
-- Daniel, textual: «el historial solo quiero los excel para switch» y «que el
-- archivo dure 90 días». Al descargar una plantilla de Switch, los MISMOS
-- bytes que bajaron quedan en el bucket privado `depurador-plantillas`; la
-- fila de carga_history apunta al archivo y el cron
-- `cleanup-depurador-archivos` lo borra a los 90 días DEJANDO LA FILA (los
-- totales son historial para siempre; la fila solo pierde el botón).
--
-- Migración ADITIVA. No borra ni altera datos existentes. Las ~140 corridas
-- viejas quedan con archivo_path NULL: salen en gris, sin botón.
-- ─────────────────────────────────────────────────────────────────────────────

alter table carga_history add column if not exists archivo_path   text;
alter table carga_history add column if not exists archivo_nombre text;

-- El cron de limpieza camina por "archivo con fecha vencida".
create index if not exists idx_carga_history_archivo_created
  on carga_history (created_at)
  where archivo_path is not null;

-- Bucket PRIVADO (public = false): las plantillas traen costos. Todo el acceso
-- es server-side vía service role (misma decisión que reclamo-facturas): sin
-- policies para anon/authenticated. NO entra a la réplica off-site de R2 a
-- propósito — son archivos generados, re-derivables, con vencimiento de 90 días.
insert into storage.buckets (id, name, public)
values ('depurador-plantillas', 'depurador-plantillas', false)
on conflict (id) do nothing;

notify pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────────
-- Fallback manual (si el INSERT del bucket no corre por permisos):
--   Dashboard → Storage → New bucket → Name: "depurador-plantillas" →
--   Public: OFF (privado) → Create. Sin policies: acceso 100% service role.
-- ─────────────────────────────────────────────────────────────────────────────
