-- ─────────────────────────────────────────────────────────────────────────────
-- RECLAMOS — CADA RECLAMO GUARDA EL CÓDIGO DEL PROVEEDOR (4-sep-2026)
--
-- QUÉ ARREGLA
-- La ficha de /proveedores/[key] unía sus «Reclamos vinculados» comparando el
-- NOMBRE normalizado del proveedor, en JavaScript, sin ningún candado. Medido
-- contra produccion el 4-sep-2026: de los 34 reclamos vivos, 26 NO cruzaban —
-- Switch escribe «American Fashion Wear, SA» y los reclamos dicen «American
-- Fashion Wear». Las fichas de Fashion Wear (21 reclamos) y Fashion Shoes (5)
-- mostraban CERO, sin decir por que. Unir por nombre no falla con un error:
-- falla en silencio.
--
-- LA IDENTIDAD ES EL PAR (empresa, codigo). El codigo NO es unico entre
-- empresas — medido en switch_proveedor_estadocuenta:
--   122 en fashion_wear  = American Fashion Wear, SA
--   122 en active_shoes  = LATIN FITNESS GROUP
--   112 en fashion_shoes = American Fashion Wear, SA
--   112 en joystep       = JCBBRANDS
-- El par viaja siempre junto. Esta columna guarda solo el codigo; la empresa ya
-- vive en reclamos.empresa.
--
-- 🔴 NADA SE ATA POR PARECIDO. El relleno de los reclamos que ya existen va por
-- LISTA EXPLICITA de (empresa, proveedor) -> codigo, con igualdad exacta sobre
-- upper(btrim(...)) de los dos lados. Ni LIKE, ni ILIKE, ni similarity, ni
-- levenshtein, ni regexp: un proveedor parecido puede ser otro proveedor, y un
-- reclamo atado al equivocado no deja rastro.
--
-- Si una fila no cruza exacto, se queda SIN codigo. Un reclamo sin codigo no se
-- pega a nadie — es preferible a pegarlo a quien quizas no es.
--
-- MEDIDO ANTES DE CORRER (produccion, 4-sep-2026), reclamos vivos por par:
--   Fashion Wear         / American Fashion Wear     = 21
--   Vistana International/ American Designer Fashion =  7
--   Fashion Shoes        / American Fashion Wear     =  5
--   Active Shoes         / Latin Fitness Group       =  1
--   -------------------------------------------------------
--   34 de 34 vivos cruzan. Ademas cruzan 10 de las 13 filas borradas.
--   Las 3 que NO cruzan y se quedan sin codigo a proposito:
--     · 2 de prueba (proveedor «PRUEBA-BOT — borrar»), borradas;
--     · 1 de Active Wear con «Latin Fitness Group», borrada — Active Wear paso
--       a American Unique Brands SA (Karl Lagerfeld) y ese par ya no existe.
--
-- La columna es NULLABLE a proposito: un reclamo puede no tener codigo.
-- Aditiva: no borra, no renombra, no cambia tipos.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE reclamos
  ADD COLUMN IF NOT EXISTS proveedor_codigo text;

COMMENT ON COLUMN reclamos.proveedor_codigo IS
  'Codigo del proveedor en Switch PARA LA EMPRESA de este reclamo. La identidad es el par (empresa, proveedor_codigo): el codigo NO es unico entre empresas. NULL = no se pudo determinar; el reclamo no se vincula a ningun proveedor.';

-- Relleno de lo que ya existe. Lista explicita, igualdad exacta, y solo donde
-- todavia no hay codigo (volver a correrla no deshace una correccion a mano).
UPDATE reclamos r
SET proveedor_codigo = l.codigo
FROM (
  VALUES
    ('Vistana International', 'American Designer Fashion', '01'),
    ('Fashion Wear',          'American Fashion Wear',     '122'),
    ('Fashion Shoes',         'American Fashion Wear',     '112'),
    ('Active Shoes',          'Latin Fitness Group',       '122'),
    ('Active Wear',           'American Unique Brands SA', '126'),
    ('Joystep',               'JCBBRANDS',                 '112')
) AS l(empresa, proveedor, codigo)
WHERE upper(btrim(r.empresa)) = upper(btrim(l.empresa))
  AND upper(btrim(r.proveedor)) = upper(btrim(l.proveedor))
  AND r.proveedor_codigo IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICACION (correr a mano despues de aplicar):
--
--   SELECT empresa, proveedor, proveedor_codigo, count(*)
--     FROM reclamos WHERE deleted = false
--    GROUP BY 1,2,3 ORDER BY 1;
--   Esperado: 34 filas repartidas en 4 grupos, TODAS con codigo
--     (Fashion Wear 122 = 21 · Vistana 01 = 7 · Fashion Shoes 112 = 5 ·
--      Active Shoes 122 = 1), y ninguna con proveedor_codigo NULL.
--
--   SELECT count(*) FROM reclamos WHERE deleted = false AND proveedor_codigo IS NULL;
--   Esperado: 0
-- ─────────────────────────────────────────────────────────────────────────────
