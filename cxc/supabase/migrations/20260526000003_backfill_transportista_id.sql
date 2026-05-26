-- Sprint 1 Guías: backfill de los registros existentes de guia_transporte.
-- Mapea el texto libre (case-insensitive, trim, ignorando espacios y puntos
-- donde aplica) a la FK transportistas.id. Todo lo que no matchee a un
-- transportista canónico permanece en modo_entrega='entrega_directa'
-- (default ya seteado en la migration anterior).
--
-- La columna transportista TEXT NO se elimina ni se modifica: queda como
-- respaldo hasta Sprint 3.

-- ------------------------------------------------------------------
-- 1) Boston: 'Boston', 'C.BOSTON', 'C. BOSTON', 'Boston ' (espacio al
--    final), 'Bston'. Normalizamos quitando puntos y espacios.
-- ------------------------------------------------------------------
UPDATE public.guia_transporte g
SET    modo_entrega = 'transportista',
       transportista_id = (SELECT id FROM public.transportistas WHERE nombre = 'Boston')
WHERE  g.modo_entrega = 'entrega_directa'
  AND  g.transportista_id IS NULL
  AND  UPPER(REPLACE(REPLACE(TRIM(g.transportista), '.', ''), ' ', '')) IN ('BOSTON','CBOSTON','BSTON');

-- ------------------------------------------------------------------
-- 2) Edwin: 'Edwin', 'TRANSPORTE EDWIN', 'EDWIN'
-- ------------------------------------------------------------------
UPDATE public.guia_transporte g
SET    modo_entrega = 'transportista',
       transportista_id = (SELECT id FROM public.transportistas WHERE nombre = 'Edwin')
WHERE  g.modo_entrega = 'entrega_directa'
  AND  g.transportista_id IS NULL
  AND  UPPER(TRIM(g.transportista)) IN ('EDWIN', 'TRANSPORTE EDWIN');

-- ------------------------------------------------------------------
-- 3) RedNblue
-- ------------------------------------------------------------------
UPDATE public.guia_transporte g
SET    modo_entrega = 'transportista',
       transportista_id = (SELECT id FROM public.transportistas WHERE nombre = 'RedNblue')
WHERE  g.modo_entrega = 'entrega_directa'
  AND  g.transportista_id IS NULL
  AND  UPPER(TRIM(g.transportista)) = 'REDNBLUE';

-- ------------------------------------------------------------------
-- 4) Transporte Sol
-- ------------------------------------------------------------------
UPDATE public.guia_transporte g
SET    modo_entrega = 'transportista',
       transportista_id = (SELECT id FROM public.transportistas WHERE nombre = 'Transporte Sol')
WHERE  g.modo_entrega = 'entrega_directa'
  AND  g.transportista_id IS NULL
  AND  UPPER(TRIM(g.transportista)) = 'TRANSPORTE SOL';

-- ------------------------------------------------------------------
-- 5) Mojica
-- ------------------------------------------------------------------
UPDATE public.guia_transporte g
SET    modo_entrega = 'transportista',
       transportista_id = (SELECT id FROM public.transportistas WHERE nombre = 'Mojica')
WHERE  g.modo_entrega = 'entrega_directa'
  AND  g.transportista_id IS NULL
  AND  UPPER(TRIM(g.transportista)) = 'MOJICA';

-- ------------------------------------------------------------------
-- 6) Sanjur
-- ------------------------------------------------------------------
UPDATE public.guia_transporte g
SET    modo_entrega = 'transportista',
       transportista_id = (SELECT id FROM public.transportistas WHERE nombre = 'Sanjur')
WHERE  g.modo_entrega = 'entrega_directa'
  AND  g.transportista_id IS NULL
  AND  UPPER(TRIM(g.transportista)) = 'SANJUR';

-- ------------------------------------------------------------------
-- 7) Resto: City Moda, Sporting Shoes, Luty Lui, Nuñez Global Solutions,
--    DHL Test, 'no ', NULL → ya quedan en entrega_directa por el DEFAULT
--    de la migration anterior. No requiere UPDATE explícito.
-- ------------------------------------------------------------------
