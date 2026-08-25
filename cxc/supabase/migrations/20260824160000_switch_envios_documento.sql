-- ─────────────────────────────────────────────────────────────────────────────
-- QUÉ SE MANDÓ A SWITCH: UN PEDIDO O UNA COTIZACIÓN (24-ago-2026)
--
-- Desde hoy "Enviar a Switch" ofrece las DOS salidas (POST /apipedido/terminar
-- y POST /apicotizacion/terminar, mismo contrato). Esta columna guarda cuál de
-- las dos fue, para poder DECIRLO después en la pantalla del pedido y en la
-- confirmacion. Sin ella, un envio no se puede distinguir del otro y el numero
-- de Switch queda sin significado.
--
-- 🔴 EL CANDADO at-most-once NO SE TOCA. El indice parcial unico sigue siendo
-- (order_id) WHERE estado <> 'error': UN envio no-fallido por pedido, salga
-- como pedido o como cotizacion. Meter `documento` en la clave permitiria dos
-- escrituras al ERP por el mismo pedido, y eso es exactamente lo que ese indice
-- existe para impedir. Para vender de verdad algo que se cotizo se DUPLICA el
-- pedido (el boton ya existe y pregunta el cliente).
--
-- DEFAULT 'pedido' y NOT NULL: todas las filas viejas son pedidos — es lo unico
-- que el sistema sabia crear hasta hoy. Ningun backfill hace falta.
--
-- El codigo es TOLERANTE a que esta migracion todavia no se haya corrido: la
-- escritura reintenta sin la columna y la lectura tambien (ver switch-envio.ts
-- y enviar-switch-route.ts). Mientras tanto todo se comporta como antes.
-- ─────────────────────────────────────────────────────────────────────────────

-- Reebok (proyecto Reebok)
ALTER TABLE IF EXISTS reebok_switch_envios
  ADD COLUMN IF NOT EXISTS documento TEXT NOT NULL DEFAULT 'pedido';

-- Joybees (espejo exacto de Reebok)
ALTER TABLE IF EXISTS joybees_switch_envios
  ADD COLUMN IF NOT EXISTS documento TEXT NOT NULL DEFAULT 'pedido';

-- Tommy Hilfiger
ALTER TABLE IF EXISTS tommy_switch_envios
  ADD COLUMN IF NOT EXISTS documento TEXT NOT NULL DEFAULT 'pedido';

-- Calvin Klein (su tabla nace en 20260812150000)
ALTER TABLE IF EXISTS calvin_switch_envios
  ADD COLUMN IF NOT EXISTS documento TEXT NOT NULL DEFAULT 'pedido';

-- Los dos valores posibles y ninguno mas. El CHECK va aparte de la columna para
-- que ADD COLUMN IF NOT EXISTS siga siendo re-ejecutable; DO $$ para poder
-- saltear la tabla que todavia no exista en este proyecto.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'reebok_switch_envios',
    'joybees_switch_envios',
    'tommy_switch_envios',
    'calvin_switch_envios'
  ] LOOP
    IF to_regclass(t) IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM pg_constraint
         WHERE conrelid = to_regclass(t) AND conname = t || '_documento_check'
       )
    THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I CHECK (documento IN (%L, %L))',
        t, t || '_documento_check', 'pedido', 'cotizacion'
      );
    END IF;
  END LOOP;
END $$;
