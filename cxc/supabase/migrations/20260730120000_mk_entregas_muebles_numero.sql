-- ============================================================================
-- Numeración SECUENCIAL de los comprobantes de entrega de mobiliario.
--
-- Daniel, textual: *"ME-A1E6B971 no debe de ser tan generico"*. Tenía razón:
-- ese número salía de los primeros 8 hex del uuid, o sea un hash, no un número
-- de documento. El resto de los documentos del sistema son secuenciales (las
-- guías GT-042, las facturas de Switch 0000062726), así que el comprobante pasa
-- a ser ME-0001, ME-0002, …
--
-- POR QUÉ UNA COLUMNA Y NO UN CÁLCULO AL VUELO: el número tiene que ser ESTABLE
-- —la misma entrega abierta dos veces tiene que decir lo mismo—. Si se calculara
-- ordenando por fecha en cada request, cargar mañana una entrega vieja correría
-- la numeración de todas las posteriores y los papeles ya impresos quedarían
-- mintiendo. Guardado, el número no se mueve nunca.
--
-- POR QUÉ UNA SEQUENCE Y NO max(numero)+1 EN EL CÓDIGO: dos entregas creadas a
-- la vez leerían el mismo máximo y se pelearían el número. La sequence lo
-- resuelve en la base, y el índice único es el candado por si algo se cuela.
--
-- El backfill numera las 21 entregas que ya existen EN ORDEN DE FECHA DE
-- ENTREGA (created_at), no en el orden en que se generen los PDF: así ME-0001
-- es la primera entrega que se hizo de verdad.
--
-- Idempotente: se puede correr dos veces sin romper nada ni renumerar lo ya
-- numerado.
-- ============================================================================

BEGIN;

CREATE SEQUENCE IF NOT EXISTS mk_entregas_muebles_numero_seq;

ALTER TABLE mk_entregas_muebles
  ADD COLUMN IF NOT EXISTS numero integer;

-- Backfill por fecha de entrega. Arranca desde el máximo ya asignado (0 la
-- primera vez), así una segunda corrida no pisa los números existentes.
WITH base AS (
  SELECT COALESCE(MAX(numero), 0) AS desde FROM mk_entregas_muebles
),
ord AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS n
  FROM mk_entregas_muebles
  WHERE numero IS NULL
)
UPDATE mk_entregas_muebles e
SET numero = base.desde + ord.n
FROM ord, base
WHERE e.id = ord.id;

-- La sequence sigue desde el último asignado: sin huecos ni repetidos.
SELECT setval(
  'mk_entregas_muebles_numero_seq',
  (SELECT COALESCE(MAX(numero), 0) + 1 FROM mk_entregas_muebles),
  false
);

ALTER TABLE mk_entregas_muebles
  ALTER COLUMN numero SET DEFAULT nextval('mk_entregas_muebles_numero_seq');

ALTER SEQUENCE mk_entregas_muebles_numero_seq OWNED BY mk_entregas_muebles.numero;

ALTER TABLE mk_entregas_muebles
  ALTER COLUMN numero SET NOT NULL;

-- Candado: dos entregas nunca pueden compartir número.
CREATE UNIQUE INDEX IF NOT EXISTS mk_entregas_muebles_numero_key
  ON mk_entregas_muebles (numero);

COMMIT;
