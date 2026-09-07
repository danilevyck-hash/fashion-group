-- ─────────────────────────────────────────────────────────────────────────────
-- CAJA MENUDA — EL REDISEÑO (7-sep-2026). Migración ADITIVA.
--
-- Escala del módulo, medida contra producción: 3 períodos en 5 meses y medio,
-- 77 recibos vivos por $563.28 (~$94/mes, recibo promedio $7.32). La usa una
-- sola persona: Angela.
--
-- 🔴 NI UN CENTAVO CAMBIA DE VALOR. Los 77 gastos y los 3 períodos quedan
-- exactamente como están: esta migración AGREGA columnas y una tabla, pone
-- COMMENT en lo que se retira, y apaga (nunca borra) los responsables que no se
-- usaron nunca. Verificación: scripts/_medir-caja-rediseno.mjs, antes y después.
--
-- Lo que trae, punto por punto:
--   1. La responsable pasa a ser del PERÍODO y se reconoce por su
--      `empleado_codigo` de Asistencia (Angela = 7).
--   2. La foto del recibo: tabla propia + bucket privado.
--   3. Las columnas retiradas quedan documentadas y SIN dropear.
--   4. El catálogo de responsables de Caja queda solo con Angela.
-- ─────────────────────────────────────────────────────────────────────────────

-- ═══ 1. LA RESPONSABLE ES DEL PERÍODO, POR CÓDIGO ════════════════════════════
--
-- Daniel, textual: «no debería de haber responsable, ya la responsable es
-- Angela la dueña del período… no deberían de haber 2 nombres en un gasto, solo
-- uno» y «si en el futuro ella no está, solo hay que poner el usuario
-- responsable ahora del período, amarrándolo con código de colaborador».
--
-- 🩸 Los 77 gastos apuntan al mismo identificador y aun así el NOMBRE guardado
-- al lado tiene tres escrituras — «Angela Garcia» 59 · «Angela garcia» 17 ·
-- «Angela garciia» 1 — y el papel impreso las listaba como tres personas.
--
-- Sin FK a `asistencia_personas` a propósito: es un amarre por código (mismo
-- criterio que `comision_vendedor_alias` y `proveedor_amarre`), y una ficha de
-- Asistencia que se retire no puede llevarse por delante un período cerrado.

alter table caja_periodos
  add column if not exists responsable_empleado_codigo text;

comment on column caja_periodos.responsable_empleado_codigo is
  'empleado_codigo de asistencia_personas (Angela = 7). La responsable es del PERÍODO, no del gasto. El NOMBRE no se guarda: se lee de asistencia_personas por este código.';

alter table caja_responsables
  add column if not exists empleado_codigo text;

comment on column caja_responsables.empleado_codigo is
  'empleado_codigo de asistencia_personas. La identidad de un colaborador es su código, nunca su nombre.';

-- Angela, la única responsable de Caja. Acotado por su identificador exacto,
-- nunca por un LIKE sobre el nombre.
update caja_responsables
   set empleado_codigo = '7'
 where id = '6295099b-0e10-4966-9c9e-a55a016fdf82'
   and empleado_codigo is null;

-- Los 3 períodos existentes son todos de Angela: sus 77 gastos apuntan a su
-- identificador (75) o no apuntan a nadie (2, de antes de que el campo fuera
-- obligatorio). Se acota a los períodos que NO tienen ningún gasto de otra
-- persona — si alguna vez hubo dos, esta migración no adivina.
update caja_periodos p
   set responsable_empleado_codigo = '7'
 where p.responsable_empleado_codigo is null
   and not exists (
     select 1 from caja_gastos g
      where g.periodo_id = p.id
        and coalesce(g.deleted, false) = false
        and g.responsable_id is not null
        and g.responsable_id <> '6295099b-0e10-4966-9c9e-a55a016fdf82'
   );

-- 🔴 El catálogo de responsables de Caja queda SOLO con Angela.
-- Daniel: «Andrea 16, Julio 11, Rodrigo 13 — estos no deben de estar en el
-- módulo, solo Angela». Los seis se APAGAN (activo = false), NUNCA se borran:
-- un gasto viejo podría apuntarles. Guarda: solo se apaga al que tiene CERO
-- gastos, contando también los borrados.
update caja_responsables r
   set activo = false
 where r.activo = true
   and r.nombre in ('andrea', 'Jennifer', 'Julio', 'Otro', 'Rey', 'Rodrigo')
   and not exists (select 1 from caja_gastos g where g.responsable_id = r.id);

-- ═══ 2. LA FOTO DEL RECIBO ═══════════════════════════════════════════════════
--
-- Daniel: «que sea opcional y también que se pueda hacer drop». Tabla propia y
-- no una columna, porque la lista SUMA (regla 3 de la casa): un recibo puede
-- llevar varias hojas y se quita una sin perder las demás.

create table if not exists caja_gasto_fotos (
  id           uuid primary key default gen_random_uuid(),
  gasto_id     uuid not null references caja_gastos(id) on delete cascade,
  path         text not null,
  nombre       text not null,
  tipo         text not null,
  bytes        bigint not null,
  subida_por   uuid,
  subida_en    timestamptz not null default now(),
  -- Soft delete FIRMADO. Nada se borra: quitar una foto la apaga.
  deleted      boolean not null default false,
  deleted_por  uuid,
  deleted_en   timestamptz
);

comment on table caja_gasto_fotos is
  'La foto (o el PDF) del recibo de caja menuda. OPCIONAL — 34 de los 77 recibos vivos no tienen ni número de factura. Soft delete firmado, nunca DELETE.';

create index if not exists idx_caja_gasto_fotos_gasto
  on caja_gasto_fotos (gasto_id, subida_en desc)
  where deleted = false;

-- El mismo archivo no entra dos veces al mismo gasto (única solo entre las vivas).
create unique index if not exists idx_caja_gasto_fotos_unica
  on caja_gasto_fotos (gasto_id, path)
  where deleted = false;

alter table caja_gasto_fotos enable row level security;

drop policy if exists caja_gasto_fotos_service on caja_gasto_fotos;
create policy caja_gasto_fotos_service on caja_gasto_fotos
  for all to service_role using (true) with check (true);

-- Bucket PRIVADO: son comprobantes de gasto. Todo el acceso es server-side con
-- service role y URL firmada (misma decisión que `reclamo-facturas` y
-- `depurador-plantillas`): sin policies para anon/authenticated.
insert into storage.buckets (id, name, public)
values ('caja-recibos', 'caja-recibos', false)
on conflict (id) do nothing;

-- ═══ 3. LO QUE SE RETIRA Y NO SE BORRA ═══════════════════════════════════════
--
-- Patrón de la casa (`mayor_lineas`, `cxc_favorites`, las cinco de
-- `guia_transporte`): la columna se queda, sin lectores ni escritores, con su
-- COMMENT. El candado `caja-columnas-retiradas.test.ts` pone el build ROJO si
-- una migración las dropea o si el código vuelve a tocarlas.

comment on column caja_gastos.empresa is
  'RETIRADA 7-sep-2026. Vacía en 61 de 77 gastos vivos; no se mostraba ni se podía escribir desde ninguna pantalla. NO se dropea: los 16 valores escritos se conservan.';
comment on column caja_gastos.factura is
  'RETIRADA 7-sep-2026. Columna vieja: la de verdad es nro_factura. Vacía en 75 de 77. NO se dropea.';
comment on column caja_gastos.ruc is
  'RETIRADA 7-sep-2026. Vacía en 75 de 77. NO se dropea.';
comment on column caja_gastos.dv is
  'RETIRADA 7-sep-2026. Vacía en 77 de 77. NO se dropea.';
comment on column caja_gastos.responsable is
  'RETIRADA 7-sep-2026. El NOMBRE guardado como texto: tres escrituras para la misma persona. La responsable pasó a ser del PERÍODO (caja_periodos.responsable_empleado_codigo). NO se dropea.';
comment on column caja_gastos.responsable_id is
  'RETIRADA 7-sep-2026. Apuntaba a un catálogo propio de Caja en vez de al empleado_codigo de Asistencia. NO se dropea.';
comment on column caja_periodos.repuesto is
  'RETIRADA 7-sep-2026. «Aprobar reposición» tuvo 0 usos en toda su historia. NO se dropea.';
comment on column caja_periodos.repuesto_at is
  'RETIRADA 7-sep-2026. Ver caja_periodos.repuesto. NO se dropea.';

comment on column caja_periodos.saldo_cierre is
  'La foto del cierre: lo que quedaba en la caja el día que se cerró. Vacía en los 3 períodos de hoy (se agregó después de sus cierres) y NO se rellena a mano — Daniel: «no lo anotaré a mano, déjalo así desde aquí para adelante».';

notify pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────────
-- Si el INSERT del bucket no corre por permisos:
--   Dashboard → Storage → New bucket → Name: "caja-recibos" →
--   Public: OFF (privado) → Create. Sin policies: acceso 100% service role.
-- ─────────────────────────────────────────────────────────────────────────────
