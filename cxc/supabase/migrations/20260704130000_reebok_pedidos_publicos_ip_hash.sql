-- Rate-limit anti-spam del POST publico de pedidos Reebok (pedido-publico).
-- Agrega ip_hash (sha256 truncado de la IP -- NUNCA la IP en claro) + indice
-- para contar pedidos por IP en ventana de 10 min (max 5).
--
-- PENDIENTE DE CORRER MANUALMENTE. El codigo es fail-open: mientras esta
-- migracion no corra, el conteo falla, el rate-limit queda inerte y los
-- pedidos pasan sin ip_hash. Correrla activa el limite sin deploy adicional.

alter table reebok_pedidos_publicos add column if not exists ip_hash text;

create index if not exists idx_reebok_pedidos_publicos_ip_hash_created
  on reebok_pedidos_publicos (ip_hash, created_at desc);
