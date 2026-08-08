-- ============================================================================
-- Cheques — el cliente se ata por código (cliente_codigo D-XXX)
-- ============================================================================
-- `cheques.cliente` es texto libre. El formulario YA elige al cliente con el
-- selector cerrado compartido (`ClientePicker`) y YA conoce su código D-XXX —
-- pero lo TIRABA, porque la tabla no tenía dónde guardarlo. Por eso el selector
-- llevaba `mostrarVinculo={false}`: "no se promete un vínculo que no existe".
--
-- Con esta columna se puede, por fin, preguntar "¿qué cheques me dio este
-- cliente y cuánto me debe?" cruzando por código en vez de por nombre tecleado.
--
-- ADITIVA y NO DESTRUCTIVA:
--   · agrega una columna,
--   · llena SOLO lo inequívoco,
--   · el texto de `cliente` se conserva SIEMPRE como display (mismo patrón que
--     mk_proyectos.tienda + tienda_codigo y que guia_items.cliente + cliente_codigo).
--
-- ⚠️ La pantalla FUNCIONA ANTES de que esto corra: el POST/PUT reintentan sin la
--    columna si PostgREST responde que no existe, así que guardar un cheque
--    nunca falla por esto. Mientras tanto el vínculo no se muestra.
--
-- ── Vista previa MEDIDA contra producción (8-ago-2026) ──────────────────────
--   cheques vivos ......................... 19
--   se atan inequívocamente ............... 19   (D-80×12, D-159×3, D-126×2,
--                                                 D-46×1, D-68×1)
--   quedarían sin atar .................... 0
--
-- Reproducible sin escribir nada:
--   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
--     scripts/_diag-guias-cheques-codigo.ts
--
-- Corre esta migración UNA SOLA VEZ en el SQL Editor de Supabase.
-- ============================================================================

-- 1. Columna aditiva.
ALTER TABLE cheques
  ADD COLUMN IF NOT EXISTS cliente_codigo text;

COMMENT ON COLUMN cheques.cliente_codigo IS
  'Código D-XXX del cliente que entregó el cheque. NULL = sin vincular. '
  'El texto de `cliente` se conserva SIEMPRE como display.';

CREATE INDEX IF NOT EXISTS idx_cheques_cliente_codigo
  ON cheques (cliente_codigo)
  WHERE cliente_codigo IS NOT NULL;

-- 2. Backfill SOLO de lo inequívoco. Mismo normalizador que
--    clientes_master.nombre_normalized (UPPER + quitar [.,] + colapsar espacios).
--
--    🔴 `cm.codigo LIKE 'D-%'` no es decorativo: sin él un cheque escrito
--    "CITY MALL DAVID" —uno de los 10 nombres que existen en los DOS mundos—
--    podría atarse a un cliente de Confecciones Boston. Cliente = código D-XXX
--    Y una de las 6 empresas del grupo (src/lib/clientes/mundos.ts).
--
--    El índice UNIQUE parcial de clientes_master.nombre_normalized
--    (WHERE deleted = false) garantiza a lo sumo 1 match → sin fan-out.
--
--    Sólo toca filas con cliente_codigo IS NULL: correrla dos veces no pisa
--    nada vinculado a mano.
UPDATE cheques ch
SET cliente_codigo = cm.codigo
FROM clientes_master cm
WHERE cm.deleted = false
  AND cm.codigo LIKE 'D-%'
  AND ch.cliente_codigo IS NULL
  AND ch.deleted = false
  AND ch.cliente IS NOT NULL
  AND btrim(ch.cliente) <> ''
  AND cm.nombre_normalized =
      regexp_replace(
        regexp_replace(upper(btrim(ch.cliente)), '[.,]', '', 'g'),
        '\s+', ' ', 'g'
      );

-- 3. Verificación — se esperan 19 vinculados y 0 sin vincular.
SELECT
  COUNT(*) FILTER (WHERE cliente_codigo IS NOT NULL) AS vinculados,
  COUNT(*) FILTER (WHERE cliente_codigo IS NULL)     AS sin_vincular
FROM cheques
WHERE deleted = false;
