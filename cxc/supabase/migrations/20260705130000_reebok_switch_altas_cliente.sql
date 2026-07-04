-- Altas de clientes en el ERP Switch desde el pedido Reebok (POST /apicliente/crear,
-- empresa active_shoes). Espejo del patron de reebok_switch_envios: se registra el
-- intento ANTES del POST (at-most-once) con el payload exacto, y el indice parcial
-- impide una segunda alta no-fallida para el mismo codigo.
-- Estados: pendiente (registrado, aun sin POST) -> enviado (POST hecho, aun sin verificar)
--          -> verificado (el codigo aparece en GET /apicliente/lista) | error (rechazo claro
--          de Switch ANTES de crear nada; unico estado que permite reintentar).
-- Un timeout/respuesta ambigua queda en "enviado" con error_detalle AMBIGUO -> bloquea
-- reintentos y requiere revision humana contra el panel de Switch.
-- Correr en la MISMA base que reebok_orders / reebok_switch_envios.
-- Solo la tocan API routes del server (service role): RLS activo sin policies publicas.

CREATE TABLE IF NOT EXISTS reebok_switch_altas_cliente (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  telefono TEXT,
  codigo TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'enviado', 'verificado', 'error')),
  payload JSONB NOT NULL,
  cliente_switch_id BIGINT,
  error_detalle TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotencia: maximo UN alta no-fallida por codigo.
CREATE UNIQUE INDEX IF NOT EXISTS reebok_switch_altas_cliente_codigo_activo
  ON reebok_switch_altas_cliente (codigo)
  WHERE estado <> 'error';

CREATE INDEX IF NOT EXISTS reebok_switch_altas_cliente_estado_idx
  ON reebok_switch_altas_cliente (estado);

ALTER TABLE reebok_switch_altas_cliente ENABLE ROW LEVEL SECURITY;

-- El pedido recuerda su cliente Switch. Defensivo: la migracion
-- 20260705120000_orders_cliente_vendedor_switch.sql ya agrega esta columna
-- (como int, junto a vendedor_switch_id); si ya corrio, esto es no-op.
ALTER TABLE reebok_orders
  ADD COLUMN IF NOT EXISTS cliente_switch_id BIGINT;
