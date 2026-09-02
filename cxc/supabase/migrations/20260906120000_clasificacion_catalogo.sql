-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: la CLASIFICACIÓN del catálogo deja de inventarse
--
-- Tres cosas, todas chicas y todas seguras de correr en caliente:
--   1. switch_articulo_info gana rubro / subrubro / marca (+ ficha_at): los tres
--      campos de Switch que clasifican un artículo, y que hasta hoy se tiraban.
--   2. products.gender pierde su DEFAULT 'male'.
--   3. products.category pierde su DEFAULT, si tiene alguno.
--
-- ═══ 🩸 POR QUÉ EL PUNTO 2 EXISTE ════════════════════════════════════════════
-- El sync del catálogo Reebok nunca escribía `gender` en el INSERT, así que el
-- DEFAULT de la columna decidía el género de cada producto nuevo. Medido contra
-- producción el 2-sep-2026: **173 de 173 altas desde el 24-jun quedaron 'male'**
-- (107 de ellas el 1-sep, en una sola corrida). No era un valor raro que algún
-- centinela pudiera cazar: era 'male', un valor perfectamente válido, mintiendo
-- en el 100% de los casos.
--
-- 🩸 LA REGLA GENERAL, que este repo ya tenía escrita del otro lado
-- (`sync-articulo-marca.ts`: *«LA MARCA NO SE ADIVINA»*):
--     **UN CAJÓN POR DEFECTO NUNCA PUEDE SER EL PRIMERO DE LA LISTA.**
-- Un default con valor de negocio en una columna de clasificación no es un
-- default: es una respuesta inventada que nadie puede distinguir de una real.
--
-- ═══ 🔴 ESTA MIGRACIÓN NO PUEDE ROMPER LA APP ANTES DE CORRER ════════════════
-- Y no la rompe, en las dos direcciones (patrón `cols-opcionales`):
--   · La app YA escribe `gender` y `category` EXPLÍCITAMENTE en cada INSERT del
--     catálogo, con el sentinel `sin_clasificar` / `otros`. Un valor explícito
--     gana sobre cualquier DEFAULT, así que el deploy corrige el bug **aunque
--     este SQL no corra nunca**. Quitar el DEFAULT es cerrar la puerta, no el
--     arreglo.
--   · Las columnas nuevas de switch_articulo_info se leen con la escalera de
--     lectura de siempre: si todavía no existen, el sync las omite y la
--     clasificación se queda como está, sin tumbar nada.
-- El sentinel es un STRING y no NULL a propósito: `joybees_products.gender` es
-- NOT NULL, así que un NULL tumbaría el INSERT de esa marca hoy mismo.
--
-- Evitar igual las ventanas de sync: 05:30-07:35 y 23:50-00:20 UTC.
-- Aplicar manual en Supabase Dashboard -> SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. La ficha de Switch, guardada ──────────────────────────────────────────
-- Los tres nombres vienen de /apiarticulos/info (el ÚNICO endpoint que los da:
-- /apiarticulos/lista trae el marcaId pero ni el nombre de la marca ni el
-- rubro). Se guardan CRUDOS, tal como los manda Switch: traducirlos al escribir
-- congelaría el mapa dentro del dato y haría imposible reclasificar sin volver
-- a preguntarle a Switch.
ALTER TABLE switch_articulo_info ADD COLUMN IF NOT EXISTS rubro    text;
ALTER TABLE switch_articulo_info ADD COLUMN IF NOT EXISTS subrubro text;
ALTER TABLE switch_articulo_info ADD COLUMN IF NOT EXISTS marca    text;

-- Cuándo se le pidió la ficha a Switch a ESTE artículo. No es `synced_at`:
-- `synced_at` lo pisa el barrido de páginas en cada corrida (es de la LISTA),
-- mientras que la ficha se pide de a una y solo cuando hace falta. Sin esta
-- columna no hay forma de saber a quién le falta ficha sin volver a pedirlas
-- todas.
ALTER TABLE switch_articulo_info ADD COLUMN IF NOT EXISTS ficha_at timestamptz;

-- Los que todavía no tienen ficha, que es a quienes hay que pedírsela. Parcial:
-- en régimen esta lista queda casi vacía y el índice pesa nada.
CREATE INDEX IF NOT EXISTS switch_articulo_info_sin_ficha_idx
  ON switch_articulo_info (empresa_key)
  WHERE ficha_at IS NULL;

-- ── 2 y 3. Los DEFAULT con valor de negocio se van ───────────────────────────
-- DROP DEFAULT es idempotente: una columna sin default lo tolera sin error.
-- NO se toca la nulabilidad ni se reescribe una sola fila: los datos viejos los
-- corrige el backfill, que es un paso aparte y aprobado aparte.
ALTER TABLE products ALTER COLUMN gender   DROP DEFAULT;
ALTER TABLE products ALTER COLUMN category DROP DEFAULT;

-- ── Verificación (correr después; las dos filas deben decir column_default NULL)
--   SELECT column_name, column_default, is_nullable
--   FROM information_schema.columns
--   WHERE table_name = 'products' AND column_name IN ('gender','category');
--
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'switch_articulo_info'
--     AND column_name IN ('rubro','subrubro','marca','ficha_at');
