-- ============================================================================
--  EL DETALLE DE LINEA DE LAS FACTURAS Y NOTAS DE CREDITO  (24-ago-2026)
-- ============================================================================
--  Daniel pidio poder filtrar sus productos mas vendidos POR CLIENTE. Hoy eso
--  es IMPOSIBLE y no por falta de pantalla:
--
--    switch_articulo_diario   articulo x dia x empresa   ->  NO tiene cliente
--    switch_facturas          cliente x documento        ->  NO tiene articulo
--
--  No existe en toda la base un lugar donde el articulo y el cliente esten
--  juntos, y esta escrito como decision desde jun-2026 ("la utilidad por linea
--  de factura queda en BACKLOG, Opcion 4", migracion 20260606100000). Esta
--  tabla ES esa opcion 4.
--
--  Fuente: /apifactura/info?facturaId=   y   /apinotacredito/info?notacreditoId=
--  El segundo NO esta documentado en docs/api-switch.pdf; se descubrio el
--  20-ago-2026 probando. Sin el, cualquier conteo de unidades seria BRUTO: en
--  Active Shoes las NC son el 13,4% de las unidades facturadas.
--
--  ---------------------------------------------------------------------------
--  SIGNOS: aca se guardan MAGNITUDES, el signo lo pone la LECTURA.
--  ---------------------------------------------------------------------------
--  Es la misma convencion que ya usan switch_facturas (las NC se guardan en
--  POSITIVO a proposito, con Math.abs en el sync) y switch_articulo_diario
--  (magnitudes + columna `tipo`). La firma del error cuando alguien suma sin
--  aplicar el signo es inconfundible: la diferencia da EXACTO el doble de las
--  notas de credito.
--
--  OJO CON EL DATO CRUDO, porque los dos campos no vienen igual:
--     factura  ->  cantidad "24.0000"   subTotalConDescuento "720.0000"
--     NC       ->  cantidad "-1.0000"   subTotalConDescuento "758.2700"
--  O sea que en una NC la cantidad viene NEGATIVA y el monto POSITIVO. Guardar
--  eso tal cual mezclaria dos convenciones en la misma tabla. Se guarda ABS de
--  las dos y `tipo_comprobante` dice que hacer.
--
--  ---------------------------------------------------------------------------
--  LA LLAVE NO PUEDE SER EL id DE LA LINEA, y esto se midio:
--  ---------------------------------------------------------------------------
--  La linea de una FACTURA trae `id`; la de una NOTA DE CREDITO **NO TRAE
--  NINGUN id**. Verificado contra produccion el 24-ago-2026 sobre la NC 1399 de
--  active_shoes. Por eso la llave usa `linea_orden`, la posicion 0-based de la
--  linea dentro del documento: existe siempre, en los dos tipos, y un documento
--  ya emitido en Switch no se reordena.
-- ============================================================================

CREATE TABLE IF NOT EXISTS switch_factura_lineas (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- De que documento sale esta linea
  empresa_key            text        NOT NULL,
  tipo_comprobante       text        NOT NULL,
  switch_factura_id      bigint      NOT NULL,
  linea_orden            smallint    NOT NULL,
  secuencial             text,
  fecha                  timestamptz NOT NULL,

  -- A quien se le vendio  <- LA COLUMNA QUE NO EXISTIA EN NINGUNA PARTE
  cliente_switch_id      bigint,
  cliente_nombre         text,
  vendedor_switch_id     bigint,
  vendedor_nombre        text,

  -- Que se vendio
  articulo_switch_id     bigint,
  codigo                 text,
  descripcion            text,
  rubro                  text,
  subrubro               text,
  marca                  text,

  -- Cuanto  (MAGNITUDES, ver la nota de signos de arriba)
  cantidad               numeric(14,4) NOT NULL,
  precio                 numeric(14,4),
  descuento_pct          numeric(14,4),
  subtotal_con_descuento numeric(14,4) NOT NULL,

  synced_at              timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT switch_factura_lineas_uniq
    UNIQUE (empresa_key, tipo_comprobante, switch_factura_id, linea_orden),

  -- Los dos tipos que este sync baja. Un tipo nuevo entra con su DDL, no de
  -- contrabando: los tiquetes y las transacciones NO tienen endpoint de
  -- detalle, asi que dejarlos entrar produciria filas vacias en silencio.
  CONSTRAINT switch_factura_lineas_tipo_check
    CHECK (tipo_comprobante IN ('Factura', 'Nota de Crédito')),

  -- Las magnitudes son magnitudes. Si alguna vez entra un negativo aca, es que
  -- alguien saco el ABS del sync y la mitad de los totales del sistema quedan
  -- mal sin un solo error a la vista.
  CONSTRAINT switch_factura_lineas_magnitudes_check
    CHECK (cantidad >= 0 AND subtotal_con_descuento >= 0)
);

-- La consulta que motiva la tabla: "que le vendo a ESTE cliente en ESTE rango".
CREATE INDEX IF NOT EXISTS idx_sfl_empresa_cliente_fecha
  ON switch_factura_lineas (empresa_key, cliente_switch_id, fecha);

-- La inversa: "quien compra ESTE producto".
CREATE INDEX IF NOT EXISTS idx_sfl_empresa_codigo_fecha
  ON switch_factura_lineas (empresa_key, codigo, fecha);

-- Para el sync incremental: saber que documentos ya tienen detalle.
CREATE INDEX IF NOT EXISTS idx_sfl_doc
  ON switch_factura_lineas (empresa_key, tipo_comprobante, switch_factura_id);

ALTER TABLE switch_factura_lineas ENABLE ROW LEVEL SECURITY;

-- Solo el backend. No hay ninguna pantalla que lea esta tabla con la anon key.
DROP POLICY IF EXISTS switch_factura_lineas_service_role ON switch_factura_lineas;
CREATE POLICY switch_factura_lineas_service_role ON switch_factura_lineas
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ---------------------------------------------------------------------------
-- COMO SABE EL SYNC QUE DOCUMENTOS LE FALTAN
-- ---------------------------------------------------------------------------
-- Una marca en el documento, no un set armado en memoria. Con ~12.300
-- documentos en las 6 empresas, preguntar "cuales ya tienen linea" cada vez
-- serian 13 viajes paginados contra una base en compute Micro, en cada corrida
-- de un cron que corre todos los dias. Con la marca es UNA consulta indexada.
--
-- Es el mismo patron que ya usa `detalle_synced_at` (acs-fidelizacion) en esta
-- misma tabla. Columna NUEVA y aparte: aquella marca OTRA cosa (el descuento
-- global de Multifashion) y reusarla mezclaria dos syncs sin relacion.
--
-- NULL = pendiente. Es lo que hace que el backfill sea reanudable: si la
-- corrida se corta a la mitad, la siguiente sigue donde quedo.

ALTER TABLE switch_facturas
  ADD COLUMN IF NOT EXISTS lineas_synced_at timestamptz;

-- Indice PARCIAL: solo las pendientes. Es la unica pregunta que se le hace a
-- esta columna, y en regimen normal casi todas las filas estan marcadas, asi
-- que el indice queda diminuto.
CREATE INDEX IF NOT EXISTS idx_sf_lineas_pendientes
  ON switch_facturas (empresa_key, fecha)
  WHERE lineas_synced_at IS NULL;

-- -- sync_type 'factura_lineas' ---------------------------------------------
-- Un CHECK no se extiende: se reescribe entero. Sin esto el logger es
-- degradable (se traga el error del INSERT y devuelve logId null), asi que la
-- corrida NO deja fila ni de exito ni de error. Ya paso DOS veces
-- (catalogo_tommy y articulo_marca), por eso va en la MISMA migracion.
-- La lista tiene que ser identica a SYNC_LOG_TYPES (src/lib/switch-api/
-- sync-log-tipos.ts); lo verifica sync-log-tipos-check.test.ts.

ALTER TABLE switch_sync_log DROP CONSTRAINT IF EXISTS switch_sync_log_sync_type_check;

ALTER TABLE switch_sync_log
  ADD CONSTRAINT switch_sync_log_sync_type_check
  CHECK (sync_type IN (
    'facturas',
    'estadocuenta',
    'costo',
    'utilidad',
    'recibos',
    'proveedores',
    'articulos',
    'articulo_marca',
    'articulo_info',
    'multifashion',
    'catalogo_reebok',
    'catalogo_joybees',
    'catalogo_tommy',
    'catalogo_calvin',
    'egresos_varios',
    'cuentas_contables',
    'factura_lineas',
    'mayor'
  ));
