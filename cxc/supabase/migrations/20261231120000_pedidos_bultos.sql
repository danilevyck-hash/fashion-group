-- ═════════════════════════════════════════════════════════════════════════════
-- Guías › Pedidos — TRES estados y el detalle con BULTOS
-- (6-oct-2026, `PEDIDOS_BULTOS_2026_10`)
-- ═════════════════════════════════════════════════════════════════════════════
-- Daniel, 6-oct-2026. Reemplaza su decisión del 5-oct-2026 («SOLO 2 estados»),
-- a propósito y con el porqué: «no se puede confiar solo en bodega».
--
--   Pendiente → Preparado (bodega o la secretaria) → Verificado (la secretaria)
--             → Etiquetas
--
-- 🔑 NOMBRES DE ERP, NO INVENTADOS (`docs/nombres-erp.md`): «Preparado» ya era
-- el nombre aprobado el 5-oct y NO se toca; «Verificado» es el término de ERP
-- para la segunda revisión.
--
-- 🔑 POR ESO ESTA MIGRACIÓN NO RENOMBRA NI UNA FILA: lo guardado es
-- `pendiente` | `preparado`, los dos siguen valiendo, y lo único que cambia el
-- CHECK es que AGREGA `verificado`. Cero riesgo sobre lo que bodega ya marcó.
--
-- Y el detalle del pedido, que hoy no existe: las líneas de Switch
-- (`/apipedido/info?pedidoId=`, doc §5.37, págs 50-51) y en qué BULTO quedó
-- cada una.
--
-- 🔑 MEDIDO (6-oct-2026): un envío real tuvo **416 bultos y 56 líneas**. Por eso
-- el bulto es un `integer` que se ESCRIBE (no una lista de 416 opciones) y la
-- asignación vive en su propia tabla con índice por pedido.
--
-- 🔑 SWITCH NO MANDA TALLA NI COLOR SEPARADOS: van dentro de `descripcion`. No
-- hay columna de talla ni de color, porque el dato no existe.
--
-- ⚠️ «Referencia» (la columna del PDF de pedido de Switch) NO VIENE EN EL API:
-- ni `/apipedido/info`, ni `/apiarticulos/lista`, ni `/apiarticulos/info` traen
-- ese campo. No se guarda: se DERIVA del código en pantalla con la regla ya
-- aprobada de Consulta de artículos (`modeloDe`). Decisión pendiente de Daniel.
--
-- TRES tablas, con la misma separación que ya tiene este módulo:
--   · `pedidos_lineas`      — la escribe SOLO el sistema al bajar el detalle de
--     Switch. Se puede volver a conseguir: no va al respaldo obligatorio.
--   · `pedidos_linea_bulto` — la escribe una PERSONA (bodega, con las casillas
--     y «Poner en bulto…»). Guarda quién y cuándo. El sync NUNCA la toca.
--   · `pedidos_bodega_estado` — ya existe; aquí solo se le ensancha el CHECK y
--     se le agrega de qué envío de Etiquetas salió.
-- RLS: solo `service_role`.
--
-- 🔴 SE APLICA CON EL «SÍ» DE DANIEL. Mientras no corra, el código falla
-- ABIERTO: «preparado» se lee como «terminado» y el detalle dice que no hay
-- líneas todavía.
-- ═════════════════════════════════════════════════════════════════════════════

-- ── 1 · Las líneas del pedido, como las manda Switch ────────────────────────
--
-- `codigo_barra_id` es el `codigoBarraId` de Switch: la identidad de la línea
-- dentro del pedido. Es lo que ata la línea con su bulto.
CREATE TABLE IF NOT EXISTS pedidos_lineas (
  empresa_key       text          NOT NULL,
  pedido_switch_id  integer       NOT NULL,
  codigo_barra_id   integer       NOT NULL,
  orden             smallint      NOT NULL,
  articulo_id       integer,
  codigo            text          NOT NULL,
  -- ⚠️ La «Referencia» del papel de Switch. MEDIDO el 6-oct-2026 contra el API
  -- real (`scripts/_diag-pedido-referencia.ts`): NO viene en ningun campo de
  -- /apipedido/info, ni en la cabecera, con ningun nombre. La columna existe
  -- para el dia que Switch la mande o Daniel diga de donde sale; hasta entonces
  -- queda NULL y la pantalla la muestra vacia. NO se deriva del codigo.
  referencia        text,
  -- La CATEGORIA que manda Switch («Men-T-Shirts S/S»), no un nombre comercial.
  descripcion       text          NOT NULL,
  -- 🔑 Talla y color SI vienen separados del API (medido). Switch manda «-»
  -- cuando la empresa no los usa, y eso se guarda tal cual: es su «sin dato».
  talla             text,
  color             text,
  cantidad          numeric(14,4) NOT NULL,
  precio            numeric(14,4) NOT NULL,
  -- 🔑 El total de la linea lo CALCULA Switch, con sus descuentos. Se guarda tal
  -- cual y NUNCA se recalcula: la regla de la casa para todo numero de Switch.
  total             numeric(14,4) NOT NULL DEFAULT 0,
  -- Porcentajes, no montos (doc §5.37). Se guardan crudos y no se recalculan.
  descuento         numeric(9,4)  NOT NULL DEFAULT 0,
  descuento_global  numeric(9,4)  NOT NULL DEFAULT 0,
  synced_at         timestamptz   NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_key, pedido_switch_id, codigo_barra_id),
  CONSTRAINT pedidos_lineas_orden_positivo CHECK (orden >= 1),
  CONSTRAINT pedidos_lineas_textos_no_vacios CHECK (
    empresa_key = BTRIM(empresa_key) AND empresa_key <> '' AND
    codigo      = BTRIM(codigo)      AND codigo      <> ''
  )
);

CREATE INDEX IF NOT EXISTS pedidos_lineas_por_pedido
  ON pedidos_lineas (empresa_key, pedido_switch_id, orden);

ALTER TABLE pedidos_lineas ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE pedidos_lineas IS
  'Las lineas de un pedido de Switch (/apipedido/info, doc 5.37). La escribe solo el '
  'sistema al abrir el detalle; se puede volver a conseguir de Switch. Talla y color '
  'viven dentro de descripcion: Switch no los manda aparte. No hay columna referencia '
  'porque ese campo no existe en el API.';

-- ── 2 · En qué bulto quedó cada línea ───────────────────────────────────────
--
-- 🔴 La PK lleva el BULTO adentro a propósito: así una línea puede quedar
-- partida entre dos bultos (con su `cantidad` en cada uno) sin otra migración.
-- Hoy la pantalla pone la línea COMPLETA en un bulto (Daniel, 6-oct-2026:
-- «solo si hace falta; si complica, dejalo para después»), pero la tabla ya lo
-- aguanta.
CREATE TABLE IF NOT EXISTS pedidos_linea_bulto (
  empresa_key       text          NOT NULL,
  pedido_switch_id  integer       NOT NULL,
  codigo_barra_id   integer       NOT NULL,
  bulto             integer       NOT NULL,
  cantidad          numeric(14,4) NOT NULL,
  puesto_por        text          NOT NULL,
  puesto_en         timestamptz   NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_key, pedido_switch_id, codigo_barra_id, bulto),
  CONSTRAINT pedidos_linea_bulto_rango CHECK (bulto >= 1 AND bulto <= 9999),
  -- ⚠️ `>= 0`, no `> 0`: si Switch manda una línea en cero, bodega tiene que
  -- poder ponerla igual en su bulto. Con `> 0` esa línea no se podía asignar
  -- NUNCA, y entonces el pedido no llegaba jamás a «todo asignado» y «Recibido»
  -- quedaba bloqueado para siempre. Lo que sí es un error es un negativo.
  CONSTRAINT pedidos_linea_bulto_cantidad_no_negativa CHECK (cantidad >= 0),
  CONSTRAINT pedidos_linea_bulto_firmado CHECK (BTRIM(puesto_por) <> '')
);

CREATE INDEX IF NOT EXISTS pedidos_linea_bulto_por_pedido
  ON pedidos_linea_bulto (empresa_key, pedido_switch_id, bulto);

ALTER TABLE pedidos_linea_bulto ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE pedidos_linea_bulto IS
  'Lo que marca bodega en el detalle del pedido: en que bulto quedo cada linea, con '
  'quien y cuando. El bulto va en la PK para que una linea pueda partirse entre dos '
  'bultos mas adelante sin migracion nueva. El sync nunca la toca.';

-- ── 2b · El pie del papel sale de SWITCH, no de una suma nuestra ────────────
--
-- 🔴 El papel de pedido de Switch cierra con **Subtotal · ITBMS · Total**
-- (medido en `PEDIDO CITY MALL PASOCANOAS REEBOK.pdf`, última página). Los tres
-- los manda `/apipedido/lista` en la MISMA fila que ya leemos (`subTotal`,
-- `impuesto`, `total`), así que se guardan tal cual y NO se recalculan — la
-- regla de la casa para todo número de Switch.
-- Sin la pasada del sync quedan en NULL y el papel dice solo lo que sabe.
ALTER TABLE switch_pedidos
  ADD COLUMN IF NOT EXISTS subtotal numeric(14,2),
  ADD COLUMN IF NOT EXISTS impuesto numeric(14,2);

COMMENT ON COLUMN switch_pedidos.impuesto IS
  'El ITBMS que manda Switch en /apipedido/lista. NULL = el sync todavia no paso; el '
  'papel no inventa un cero.';

-- ── 3 · Los TRES estados ────────────────────────────────────────────────────
--
-- Lo guardado hoy es 'pendiente' | 'preparado'. «Preparado» ES el mismo lugar
-- del flujo que «Terminado» (bodega termino de preparar), asi que se renombra
-- el dato: no se pierde ni un toque de bodega.
-- Solo se ENSANCHA el CHECK: los dos valores de hoy siguen siendo válidos y se
-- suma el tercero. Ninguna fila se toca.
ALTER TABLE pedidos_bodega_estado DROP CONSTRAINT IF EXISTS pedidos_bodega_estado_valido;
ALTER TABLE pedidos_bodega_estado
  ADD CONSTRAINT pedidos_bodega_estado_valido
  CHECK (estado IN ('pendiente', 'preparado', 'verificado'));

-- 🔴 UNA FIRMA POR PASO (Daniel, 6-oct-2026: «guarda y muestra quién y cuándo
-- marcó cada paso»). 🩸 Con la sola `cambiado_por` que ya existía, el toque de
-- «Recibido» PISABA el de «Terminado» y se perdía quién lo había terminado —
-- que es justo el dato del que depende la regla de las dos personas.
ALTER TABLE pedidos_bodega_estado
  ADD COLUMN IF NOT EXISTS preparado_por  text,
  ADD COLUMN IF NOT EXISTS preparado_en   timestamptz,
  ADD COLUMN IF NOT EXISTS verificado_por text,
  ADD COLUMN IF NOT EXISTS verificado_en  timestamptz;

-- Lo ya marcado «preparado» conserva su firma: quien lo tocó es quien lo
-- preparó. No se inventa nada donde no había dato.
UPDATE pedidos_bodega_estado
   SET preparado_por = cambiado_por,
       preparado_en  = cambiado_en
 WHERE estado = 'preparado'
   AND preparado_por IS NULL;

-- De qué envío de Etiquetas salió este pedido, para no crear dos (regla 6).
-- NULL = todavía no se creó ninguno, o no se pudo (falla ABIERTA: «Recibido»
-- nunca se cae porque Etiquetas no estaba lista).
ALTER TABLE pedidos_bodega_estado
  ADD COLUMN IF NOT EXISTS envio_id uuid;

COMMENT ON COLUMN pedidos_bodega_estado.estado IS
  'pendiente | preparado (lo marca bodega o la secretaria) | verificado (lo marca la '
  'secretaria, nunca bodega). Sin fila = pendiente. Nombres de ERP; preparado es el '
  'mismo valor de siempre. Daniel, 6-oct-2026, cambiando su decision del 5-oct.';
COMMENT ON COLUMN pedidos_bodega_estado.envio_id IS
  'El envio de guias_etiquetas que nacio al marcar Recibido. NULL = no se creo. Sirve '
  'para no crear dos por el mismo pedido.';
COMMENT ON COLUMN pedidos_bodega_estado.preparado_por IS
  'Quien marco Preparado (bodega o la secretaria). De aqui sale la regla de los dos '
  'pares de ojos: quien preparo un pedido no puede verificarlo, ni siquiera admin. Se '
  'muestra en pantalla y en el papel: «Preparado por Julio · 10:42 a. m.».';
COMMENT ON COLUMN pedidos_bodega_estado.verificado_por IS
  'Quien marco Verificado (solo la secretaria o admin). Se muestra junto al anterior.';
-- 🔑 `cambiado_por` se queda como estaba: el ULTIMO que tocó la fila. Las dos
-- firmas de arriba son las que se leen; ésta sirve de respaldo y no se borra.

-- ── 4 · Permisos ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pedidos_lineas' AND policyname = 'service_role_all') THEN
    CREATE POLICY service_role_all ON pedidos_lineas FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pedidos_linea_bulto' AND policyname = 'service_role_all') THEN
    CREATE POLICY service_role_all ON pedidos_linea_bulto FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON pedidos_lineas TO service_role;
-- DELETE sí: quitar una línea de su bulto es deshacer un toque, no borrar un dato
-- de negocio (el dato de negocio son las líneas, que vuelven a bajar de Switch).
GRANT SELECT, INSERT, UPDATE, DELETE ON pedidos_linea_bulto TO service_role;

NOTIFY pgrst, 'reload schema';
