-- ─────────────────────────────────────────────────────────────────────────────
-- 20260725140000_catalogo_publico_switch.sql
--
-- PROBLEMA
-- Los pedidos que entran por el LINK PÚBLICO no llegaban a Switch. El endpoint
-- de confirmación convertía el pedido (PED-### / JBP-### / TOM-###) y ahí moría:
-- la RPC lo deja en 'borrador' con cliente_switch_id y vendedor_switch_id en
-- NULL, y nunca se llamaba a enviarPedidoSwitch. Evidencia en producción
-- (25-jul-2026): TOM-001 en 'borrador' y tommy_switch_envios con CERO filas.
--
-- El envío ya está arreglado en código. Lo que falta decidir es de QUIÉN es un
-- pedido del link: en el flujo del vendedor el cliente se elige a mano y el
-- vendedor sale de fg_user_switch_vendedor por sesión, pero en el link no hay
-- sesión ni forma de saber a qué cliente de Switch corresponde el nombre que la
-- persona escribió a mano.
--
-- QUÉ HACE
-- Crea `fg_catalogo_publico_switch`: el cliente y el vendedor de Switch que se
-- usan para los pedidos del link, POR EMPRESA. Es un OVERRIDE opcional: el
-- código funciona sin esta tabla usando la regla por defecto
-- (src/lib/catalogo/publico-switch-actor.ts):
--
--   CLIENTE  = el de mostrador/contado de la empresa, por su código de Switch
--              'TCKCTA'  → active_shoes 1 "Contado" · joystep 1 "Contado"
--                          fashion_shoes 1 "VENTAS LOCA"
--   VENDEDOR = el vendedor "DEFAULT" de la empresa (la casa: un pedido del link
--              no es venta de una persona y no debe pagar comisión a nadie),
--              buscado en el maestro `vendedores` y luego en
--              fg_user_switch_vendedor
--                        → active_shoes 3 · joystep 1 · fashion_shoes 1
--
-- Todos esos ids son REALES (vienen del sync de Switch), ninguno inventado. La
-- tabla existe para que Daniel pueda cambiarlos sin tocar código — por ejemplo
-- si quiere que los pedidos del link de una marca entren a nombre de otro
-- vendedor. El nombre que escribió la persona NUNCA se pierde: queda en
-- <marca>_orders.client_name y en el link público.
--
-- Se crea VACÍA a propósito: sin filas manda la regla por defecto.
--
-- VERIFICACIÓN (tras aplicar)
--   select * from fg_catalogo_publico_switch;          -- 0 filas = regla por defecto
--
--   -- lo que resolvería la regla por defecto hoy:
--   select empresa_key, cliente_switch_id, nombre
--     from switch_clientes
--    where codigo = 'TCKCTA'
--      and empresa_key in ('active_shoes','joystep','fashion_shoes');
--   select empresa_key, switch_id, nombre
--     from vendedores
--    where nombre = 'DEFAULT'
--      and empresa_key in ('active_shoes','joystep','fashion_shoes');
--
--   -- y que los pedidos del link YA salgan al ERP:
--   select o.order_number, o.status, o.cliente_switch_id, o.vendedor_switch_id,
--          e.estado, e.numero_interno
--     from tommy_orders o
--     left join tommy_switch_envios e on e.order_id = o.id
--    where o.origen_original = 'link'
--    order by o.created_at desc;
--
-- Para OVERRIDE (ejemplo, NO se ejecuta aquí):
--   insert into fg_catalogo_publico_switch
--     (empresa_key, cliente_switch_id, cliente_nombre, vendedor_id, vendedor_nombre)
--   values ('fashion_shoes', 1, 'VENTAS LOCA', 1, 'DEFAULT')
--   on conflict (empresa_key) do update
--     set cliente_switch_id = excluded.cliente_switch_id,
--         vendedor_id       = excluded.vendedor_id,
--         updated_at        = now();
--
-- Migración ADITIVA (solo objetos nuevos). Aplicar manual en Supabase
-- Dashboard → SQL Editor (proyecto principal).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fg_catalogo_publico_switch (
  empresa_key       text PRIMARY KEY,
  cliente_switch_id int  NOT NULL,
  cliente_nombre    text,
  vendedor_id       int  NOT NULL,
  vendedor_nombre   text,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE fg_catalogo_publico_switch IS
  'Cliente y vendedor de Switch con los que entran los pedidos del LINK PÚBLICO de catálogos, por empresa. Override opcional: sin fila manda la regla por defecto (cliente TCKCTA + vendedor DEFAULT) de src/lib/catalogo/publico-switch-actor.ts.';

-- Solo service_role (patrón de todas las tablas de catálogos; los endpoints
-- corren server-side con la service key).
ALTER TABLE fg_catalogo_publico_switch ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_all ON fg_catalogo_publico_switch;
CREATE POLICY service_role_all ON fg_catalogo_publico_switch
  FOR ALL TO service_role USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
