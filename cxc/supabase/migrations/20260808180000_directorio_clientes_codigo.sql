-- ============================================================================
-- Clientes › Directorio — la ficha se ata al cliente real (cliente_codigo D-XXX)
-- ============================================================================
-- `directorio_clientes` son 33 fichas cargadas A MANO por Daniel y son lo único
-- que aporta esa tabla: teléfono, celular, WhatsApp, correo, contacto y notas.
-- No tenía NINGUNA columna de código: se ataba por el nombre tecleado, así que
-- "Mazar" o "city" no se podían cruzar con nada.
--
-- Esta migración es ADITIVA y NO DESTRUCTIVA:
--   · agrega una columna,
--   · llena la que se puede llenar sin adivinar,
--   · y NO borra, NO renombra y NO toca un solo dato de contacto.
--
-- ⚠️ La pantalla FUNCIONA ANTES de que esto corra (patrón `cols-opcionales`):
--    el GET usa `select("*")` y las escrituras reintentan sin la columna si
--    PostgREST responde que no existe. Sin la migración simplemente no se puede
--    vincular todavía, y la UI lo dice.
--
-- ── Vista previa MEDIDA contra producción (8-ago-2026) ──────────────────────
--   se atan automáticamente ........ 25 de 33
--   no parean con nadie ............  7  ← quedan NULL, decisión de Daniel
--   parean con alguien que NO es
--   del grupo ("Shopping Center" →
--   código 586, de Boston) .........  1  ← queda NULL a propósito
--
-- Reproducible sin escribir nada:
--   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
--     scripts/_diag-directorio-codigo.ts
--
-- Corre esta migración UNA SOLA VEZ en el SQL Editor de Supabase.
-- ============================================================================

-- 1. Columna aditiva.
ALTER TABLE directorio_clientes
  ADD COLUMN IF NOT EXISTS cliente_codigo text;

COMMENT ON COLUMN directorio_clientes.cliente_codigo IS
  'Código D-XXX del cliente del grupo al que pertenece esta ficha de contacto. '
  'NULL = todavía sin vincular. El nombre tecleado se conserva SIEMPRE como display.';

-- 2. Índice para cruzar la ficha con el cliente. Parcial: la mayoría de las
--    filas puede quedar NULL y no tiene sentido indexarlas.
CREATE INDEX IF NOT EXISTS idx_directorio_clientes_codigo
  ON directorio_clientes (cliente_codigo)
  WHERE cliente_codigo IS NOT NULL;

-- 3. Auto-match SOLO de lo inequívoco. Mismo normalizador que
--    clientes_master.nombre_normalized (UPPER + quitar [.,] + colapsar espacios)
--    y mismo patrón que 20260608120000_mk_proyectos_tienda_codigo.sql.
--
--    🔴 `cm.codigo LIKE 'D-%'` NO es decorativo: sin él, "Shopping Center" se
--    ataría al código 586 de Confecciones Boston. Cliente = código D-XXX Y una
--    de las 6 empresas del grupo (ver src/lib/clientes/mundos.ts), y Boston vive
--    SOLO en su pestaña.
--
--    El índice UNIQUE parcial de clientes_master.nombre_normalized
--    (WHERE deleted = false) garantiza a lo sumo 1 match → sin fan-out.
--
--    Sólo toca filas con cliente_codigo IS NULL: correrla dos veces no pisa
--    nada que alguien haya vinculado a mano.
UPDATE directorio_clientes d
SET cliente_codigo = cm.codigo
FROM clientes_master cm
WHERE cm.deleted = false
  AND cm.codigo LIKE 'D-%'
  AND d.cliente_codigo IS NULL
  AND d.deleted = false
  AND d.nombre IS NOT NULL
  AND btrim(d.nombre) <> ''
  AND cm.nombre_normalized =
      regexp_replace(
        regexp_replace(upper(btrim(d.nombre)), '[.,]', '', 'g'),
        '\s+', ' ', 'g'
      );

-- 4. Verificación — se esperan 25 vinculadas y 8 sin vincular.
SELECT
  COUNT(*) FILTER (WHERE cliente_codigo IS NOT NULL) AS vinculadas,
  COUNT(*) FILTER (WHERE cliente_codigo IS NULL)     AS sin_vincular
FROM directorio_clientes
WHERE deleted = false;
