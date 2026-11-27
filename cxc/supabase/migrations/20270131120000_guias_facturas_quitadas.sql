-- Despachos › Pedidos › «Facturados» — quitar a mano una factura que ya se fue
-- sin guía (27-nov-2026, Daniel aprobó). `FACTURADOS_QUITAR_2026_11`.
--
-- 🔑 SOLO AGREGA: una tabla nueva; nada se borra ni se cambia. NO toca
-- `switch_facturas`: solo anota qué factura se sacó de la lista, quién y cuándo.
-- «Devolver» = soft delete firmado (deleted + devuelta_por/_en), nunca DELETE.
-- La identidad es la de Facturados: empresa + secuencial + día de la factura
-- (el secuencial se repite entre eras). Una sola ACTIVA por factura.
-- La escribe solo el servidor (service_role); RLS sin políticas = cerrado.

create table if not exists public.guias_facturas_quitadas (
  id bigserial primary key,
  empresa_key text not null,
  secuencial text not null,
  fecha_factura date not null,
  quitada_por text not null,
  quitada_en timestamptz not null default now(),
  devuelta_por text,
  devuelta_en timestamptz,
  deleted boolean not null default false,
  constraint guias_facturas_quitadas_devuelta_firmada
    check (deleted = false or (devuelta_por is not null and devuelta_en is not null))
);

create unique index if not exists guias_facturas_quitadas_una_activa
  on public.guias_facturas_quitadas (empresa_key, secuencial, fecha_factura)
  where deleted = false;

alter table public.guias_facturas_quitadas enable row level security;

comment on table public.guias_facturas_quitadas is
  'Facturas que alguien (admin o secretaria) quitó a mano de Despachos › Pedidos › Facturados. deleted=true = devuelta a la lista. Ver src/lib/ui/facturados-quitar-2026-11.ts.';
