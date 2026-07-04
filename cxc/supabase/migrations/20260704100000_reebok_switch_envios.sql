-- Envíos de pedidos Reebok al ERP Switch (POST /apipedido/terminar, empresa active_shoes).
-- Registro de intento ANTES del POST (at-most-once): el payload exacto queda guardado y
-- el índice parcial impide un segundo envío no-fallido para el mismo pedido.
-- Estados: pendiente (registrado, aún sin POST) -> enviado (POST hecho, aún sin verificar)
--          -> verificado (confirmado vía GET /apipedido/info) | error (fallo definitivo ANTES
--          de que Switch creara nada; es el único estado que permite reintentar).
-- Un timeout/respuesta ambigua se queda en "enviado" con error_detalle -> bloquea reintentos
-- y requiere revisión humana contra el panel de Switch.
-- Solo la tocan API routes del server (service role): RLS activo sin policies públicas.

CREATE TABLE IF NOT EXISTS reebok_switch_envios (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES reebok_orders(id) ON DELETE RESTRICT,
  estado TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'enviado', 'verificado', 'error')),
  payload JSONB NOT NULL,
  pedido_switch_id BIGINT,
  numero_interno TEXT,
  error_detalle TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotencia: máximo UN envío no-fallido por pedido.
CREATE UNIQUE INDEX IF NOT EXISTS reebok_switch_envios_order_activo
  ON reebok_switch_envios (order_id)
  WHERE estado <> 'error';

CREATE INDEX IF NOT EXISTS reebok_switch_envios_estado_idx
  ON reebok_switch_envios (estado);

ALTER TABLE reebok_switch_envios ENABLE ROW LEVEL SECURITY;
