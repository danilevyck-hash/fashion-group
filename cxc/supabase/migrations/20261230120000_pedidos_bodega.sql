-- ═════════════════════════════════════════════════════════════════════════════
-- Guías › «Pedidos» para bodega (5-oct-2026, `PEDIDOS_BODEGA_2026_10`)
-- ═════════════════════════════════════════════════════════════════════════════
-- Daniel: bodega ve los pedidos de Switch que faltan por facturar y marca cada
-- uno «Pendiente» o «Preparado». Sin enlace a Etiquetas ni a Guías.
--
-- 🔑 MEDIDO EL 5-oct-2026 contra Switch (`/apipedido/lista`, doc págs 47-48):
-- sin `estatus` la lista devuelve solo los «Activo»; un pedido que ya se
-- facturó pasa a «Inactivo» (Fashion Wear: pedido 2732 de $21.490,95 del
-- 8-sep → factura 11-000003220 de $21.490,95 el mismo día; 2678 → 11-000003170;
-- 2797 → 11-000003283). Así que `switch_pedidos` guarda SOLO los Activo: es un
-- espejo de «lo que falta por facturar», y lo que Switch factura se va solo.
--
-- Dos tablas, a propósito:
--   · `switch_pedidos` — la escribe SOLO el sync de madrugada (`sync-pedidos`).
--     Se puede volver a conseguir de Switch: no va al respaldo obligatorio.
--   · `pedidos_bodega_estado` — la escribe una PERSONA (un toque). No hay fila
--     = «Pendiente». Guarda quién y cuándo. El sync NUNCA la toca.
-- RLS: solo `service_role`.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS switch_pedidos (
  empresa_key        text        NOT NULL,
  pedido_switch_id   integer     NOT NULL,
  secuencial         text        NOT NULL,
  fecha              timestamptz NOT NULL,
  cliente_switch_id  integer     NOT NULL,
  cliente_codigo     text        NOT NULL,
  cliente_nombre     text        NOT NULL,
  vendedor_nombre    text,
  total              numeric(14,2) NOT NULL DEFAULT 0,
  synced_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_key, pedido_switch_id)
);

CREATE INDEX IF NOT EXISTS switch_pedidos_por_fecha ON switch_pedidos (fecha);

ALTER TABLE switch_pedidos ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS pedidos_bodega_estado (
  empresa_key        text        NOT NULL,
  pedido_switch_id   integer     NOT NULL,
  estado             text        NOT NULL,
  cambiado_por       text        NOT NULL,
  cambiado_en        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_key, pedido_switch_id),
  CONSTRAINT pedidos_bodega_estado_valido CHECK (estado IN ('pendiente', 'preparado')),
  CONSTRAINT pedidos_bodega_estado_firmado CHECK (BTRIM(cambiado_por) <> '')
);

ALTER TABLE pedidos_bodega_estado ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'switch_pedidos' AND policyname = 'service_role_all') THEN
    CREATE POLICY service_role_all ON switch_pedidos FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pedidos_bodega_estado' AND policyname = 'service_role_all') THEN
    CREATE POLICY service_role_all ON pedidos_bodega_estado FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON switch_pedidos TO service_role;
GRANT SELECT, INSERT, UPDATE ON pedidos_bodega_estado TO service_role;

COMMENT ON TABLE switch_pedidos IS
  'Pedidos ACTIVOS de Switch (= sin facturar) de las 6 del grupo, sin VENTAS/Contado '
  '(TCKCTA), sin ACTIVE SHOES (12188) y sin clientes fuera del directorio. La escribe '
  'solo el cron sync-pedidos; lo que Switch factura se borra en la siguiente corrida.';
COMMENT ON TABLE pedidos_bodega_estado IS
  'Lo que marca bodega en Guías › Pedidos: pendiente | preparado, con quién y cuándo. '
  'Sin fila = pendiente. El sync nunca la toca.';

-- El sync anota sus corridas en switch_sync_log con sync_type = 'pedidos'.
ALTER TABLE switch_sync_log DROP CONSTRAINT IF EXISTS switch_sync_log_sync_type_check;
ALTER TABLE switch_sync_log
  ADD CONSTRAINT switch_sync_log_sync_type_check
  CHECK (sync_type IN (
    'facturas', 'estadocuenta', 'costo', 'utilidad', 'recibos', 'proveedores',
    'articulos', 'articulo_marca', 'articulo_info', 'clientes', 'multifashion',
    'catalogo_reebok', 'catalogo_joybees', 'catalogo_tommy', 'catalogo_calvin',
    'egresos_varios', 'cuentas_contables', 'factura_lineas', 'ingresos_mercancia',
    'ventas_tipos', 'mayor', 'pedidos'
  ));

NOTIFY pgrst, 'reload schema';
