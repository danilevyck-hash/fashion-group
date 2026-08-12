-- ============================================================================
-- Marketing — EL PERÍODO ES POR MARCA, y la foto de instalación es del GASTO
--
-- 🔑 EL MODELO, en palabras de Daniel: *"ellos facturan a mi bajo compañia
-- diferentes. una por marca. cada marca tiene su encargado"*. El "proveedor"
-- (PVH) desaparece como unidad: cada marca tiene su período, su cierre y su
-- ZIP. Lo único que queda de agrupado es el BOTÓN "Cerrar las tres", que hace
-- tres cierres seguidos — no un cierre conjunto.
--
-- 🔴 LA COLUMNA SIGUE LLAMÁNDOSE `proveedor_key` A PROPÓSITO. Renombrarla es
-- una DDL que rompe las dos tablas para no ganar nada, y la fila que de verdad
-- no se puede tocar —el período CERRADO "mid 2026", con sus $62.381,57 ya
-- reportados a PVH— tiene que seguir guardando 'pvh' ahí: ese cierre fue de
-- verdad un cierre conjunto, y reescribirlo sería reescribir la historia.
-- Lo que cambia es qué se GUARDA en la columna de ahora en más: el CÓDIGO DE
-- MARCA ('TH','CK','KL','RBK','J'). Ver src/lib/marketing/bloques.ts.
--
-- ⚠️ ADITIVA. No borra ni una tabla, ni una fila, ni una columna. Los 121
-- sellos viejos QUEDAN y no son basura: son el camino de respaldo que hace que
-- la pantalla muestre los mismos números con o sin esta migración corrida
-- (`clavesDeSello` en bloques.ts pregunta primero por el código de marca y
-- después por la clave vieja).
--
-- ORDEN: PASO 1 es una VISTA PREVIA que no escribe. Si los conteos no dan, se
-- para ahí. El PASO 6 aborta la transacción entera si un monto se movió.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PASO 0 — no correr esto sobre una base que no tiene la migración anterior
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.mk_periodos') IS NULL
     OR to_regclass('public.mk_periodo_documentos') IS NULL THEN
    RAISE EXCEPTION
      'Falta correr 20260811160000_marketing_periodos_por_proveedor.sql primero.';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- PASO 1 — VISTA PREVIA (no escribe nada)
--
-- Medido contra producción el 11-ago-2026, tiene que decir:
--   periodo cerrado "mid 2026"  -> 59 facturas, 62381.57
--   sellos hoy                  -> 121   (todos con clave de PROVEEDOR)
--   facturas vivas con marca    -> 86    (0 repartidas entre dos marcas)
--   marcas con gasto abierto    -> TH y CK  (KL, RBK y J todavía en cero)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_cerr_n int; v_cerr_t numeric; v_sellos int; v_multi int;
BEGIN
  SELECT count(*), COALESCE(sum(f.total), 0) INTO v_cerr_n, v_cerr_t
  FROM mk_periodo_documentos d
  JOIN mk_periodos pe ON pe.id = d.periodo_id AND pe.estado = 'cerrado'
  JOIN mk_facturas f ON f.id = d.documento_id AND d.tipo = 'factura'
  WHERE f.anulado_en IS NULL;

  SELECT count(*) INTO v_sellos FROM mk_periodo_documentos;

  -- Una factura repartida entre DOS marcas se convierte en DOS sellos. Hoy no
  -- hay ninguna; si aparecieran, el reparto sigue siendo correcto (cada marca
  -- se lleva su porción) pero conviene saberlo antes.
  SELECT count(*) INTO v_multi FROM (
    SELECT fm.factura_id FROM mk_factura_marcas fm
    JOIN mk_facturas f ON f.id = fm.factura_id AND f.anulado_en IS NULL
    GROUP BY fm.factura_id HAVING count(*) > 1
  ) q;

  RAISE NOTICE 'VISTA PREVIA — periodo cerrado: % facturas, %', v_cerr_n, v_cerr_t;
  RAISE NOTICE 'VISTA PREVIA — sellos existentes: %', v_sellos;
  RAISE NOTICE 'VISTA PREVIA — facturas repartidas entre 2+ marcas: %', v_multi;

  IF v_cerr_n <> 59 OR round(v_cerr_t, 2) <> 62381.57 THEN
    RAISE WARNING 'El periodo cerrado NO da 59 / 62381.57. Revisar antes de seguir.';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- PASO 2 — un período ABIERTO por MARCA
--
-- Hereda el nombre del período abierto que hoy tiene su proveedor ("Período
-- 2026"), para que Daniel reconozca lo que ya venía viendo. El índice único
-- `mk_periodos_uno_abierto_por_proveedor` sigue garantizando uno solo por
-- clave, ahora por marca.
--
-- 🩸 Los tres períodos abiertos VIEJOS ('pvh','reebok','joybees') NO se cierran
-- ni se borran. Quedan abiertos y sin nadie que los mire: el código solo
-- pregunta por códigos de marca. Cerrarlos sería inventarles un cierre que
-- nunca ocurrió, y borrarlos es irreversible.
-- ----------------------------------------------------------------------------
INSERT INTO mk_periodos (proveedor_key, nombre, estado)
SELECT m.codigo,
       COALESCE(
         (SELECT pe.nombre FROM mk_periodos pe
          WHERE pe.proveedor_key = m.legacy AND pe.estado = 'abierto' LIMIT 1),
         'Período 2026')
     , 'abierto'
FROM (VALUES
        ('TH',  'pvh'),
        ('CK',  'pvh'),
        ('KL',  'pvh'),
        ('RBK', 'reebok'),
        ('J',   'joybees')
     ) AS m(codigo, legacy)
WHERE NOT EXISTS (
  SELECT 1 FROM mk_periodos p
  WHERE p.proveedor_key = m.codigo AND p.estado = 'abierto'
);

-- ----------------------------------------------------------------------------
-- PASO 3 — resellar las FACTURAS con el código de marca
--
-- La regla, y no tiene excepciones:
--   el sello viejo apuntaba a un período CERRADO -> se conserva ESE período
--   el sello viejo apuntaba a uno ABIERTO        -> va al abierto de su marca
--   no había sello                                -> va al abierto de su marca
--
-- Conservar el período cerrado es lo que impide que los 59 documentos ya
-- reportados vuelvan a aparecer como gasto nuevo de Tommy y de Calvin.
-- ----------------------------------------------------------------------------
INSERT INTO mk_periodo_documentos (periodo_id, proveedor_key, tipo, documento_id)
SELECT destino.id, m.codigo, 'factura', f.id
FROM mk_facturas f
JOIN mk_factura_marcas fm ON fm.factura_id = f.id
JOIN mk_marcas m ON m.id = fm.marca_id
LEFT JOIN mk_proyectos p ON p.id = f.proyecto_id
-- El período CERRADO al que ya estaba sellado, si lo estaba.
LEFT JOIN LATERAL (
  SELECT pe.id
  FROM mk_periodo_documentos d
  JOIN mk_periodos pe ON pe.id = d.periodo_id
  WHERE d.tipo = 'factura' AND d.documento_id = f.id AND pe.estado = 'cerrado'
  LIMIT 1
) cerrado ON TRUE
JOIN LATERAL (
  SELECT COALESCE(
    cerrado.id,
    (SELECT pe.id FROM mk_periodos pe
     WHERE pe.proveedor_key = upper(btrim(m.codigo)) AND pe.estado = 'abierto'
     LIMIT 1)
  ) AS id
) destino ON destino.id IS NOT NULL
WHERE upper(btrim(m.codigo)) IN ('TH', 'CK', 'KL', 'RBK', 'J')
  -- Multifashion no se le reporta a nadie: no lleva período.
  AND COALESCE(p.tienda_codigo, '') <> 'D-108'
  AND COALESCE(p.tienda, '') !~* 'multi[[:space:]._-]*fashion'
ON CONFLICT (tipo, documento_id, proveedor_key) DO NOTHING;

-- ----------------------------------------------------------------------------
-- PASO 4 — resellar las ENTREGAS de mobiliario
--
-- Una clave en `total_por_marca` con monto 0 significa "esta marca no llevó
-- nada": sellarla ataría la entrega a una marca a la que no le corresponde un
-- centavo, y le haría aparecer un documento vacío en su reporte.
-- ----------------------------------------------------------------------------
INSERT INTO mk_periodo_documentos (periodo_id, proveedor_key, tipo, documento_id)
SELECT DISTINCT destino.id, m.codigo, 'entrega', e.id
FROM mk_entregas_muebles e
JOIN mk_proyectos p ON p.id = e.proyecto_id
CROSS JOIN LATERAL jsonb_each_text(COALESCE(e.total_por_marca, '{}'::jsonb)) AS tpm(marca_id, monto)
JOIN mk_marcas m ON m.id = tpm.marca_id::uuid
LEFT JOIN LATERAL (
  SELECT pe.id
  FROM mk_periodo_documentos d
  JOIN mk_periodos pe ON pe.id = d.periodo_id
  WHERE d.tipo = 'entrega' AND d.documento_id = e.id AND pe.estado = 'cerrado'
  LIMIT 1
) cerrado ON TRUE
JOIN LATERAL (
  SELECT COALESCE(
    cerrado.id,
    (SELECT pe.id FROM mk_periodos pe
     WHERE pe.proveedor_key = upper(btrim(m.codigo)) AND pe.estado = 'abierto'
     LIMIT 1)
  ) AS id
) destino ON destino.id IS NOT NULL
WHERE p.anulado_en IS NULL
  AND upper(btrim(m.codigo)) IN ('TH', 'CK', 'KL', 'RBK', 'J')
  AND COALESCE(p.tienda_codigo, '') <> 'D-108'
  AND COALESCE(p.tienda, '') !~* 'multi[[:space:]._-]*fashion'
  AND tpm.monto::numeric > 0
ON CONFLICT (tipo, documento_id, proveedor_key) DO NOTHING;

-- ----------------------------------------------------------------------------
-- PASO 5 — la FOTO DE INSTALACIÓN es del GASTO, no del cliente
--
-- 🔑 Son DOS papeles distintos y confundirlos fue lo que hubo que arreglar.
-- Daniel, textual: *"pero impulsadora tambien necesita comprobante, pero no
-- foto. aunq el comprobante sea una foto."*
--   - COMPROBANTE del pago (`pdf_factura` / `foto_factura`): lo lleva TODO
--     gasto, impulsadoras incluidas. Ya existe y no se toca.
--   - FOTO DE INSTALACIÓN (`foto_instalacion`, NUEVA): el letrero puesto, el
--     mueble armado, las fotos de un evento. Llega DESPUÉS.
--
-- ⚠️ SUBIR fotos se permite en TODO gasto, sin excepción. Daniel, textual:
-- *"no limites subir fotos de impulsadora porque si hago un evento y quiero
-- subir fotos del evento me lo va a limitar"*. Por eso el CHECK de abajo solo
-- exige `factura_id` — NUNCA un cliente/proyecto. La regla "sin cliente no
-- espera foto" vive únicamente en el AVISO del cierre (silencia el contador,
-- no limita nada).
--
-- Hasta ahora la única foto era `foto_proyecto`, atada al PROYECTO (o sea al
-- cliente), así que no se podía decir "este gasto no tiene foto". Las 60 fotos
-- que ya existen NO se migran: se siguen leyendo, y un gasto cuyo cliente ya
-- tiene fotos no dispara el aviso.
--
-- El CHECK original es anónimo (`marketing.sql` lo declaró en línea), así que
-- se lo busca por su definición en vez de adivinarle el nombre.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_nombre text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'mk_adjuntos'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%foto_instalacion%'
  ) THEN
    RAISE NOTICE 'PASO 5 — foto_instalacion ya estaba permitida, no se toca.';
    RETURN;
  END IF;

  -- ⚠️ Son DOS los CHECK que nombran a `foto_proyecto`: el de la columna
  -- (`tipo IN (...)`) y el de destino (qué id tiene que venir con cada tipo).
  -- Se los busca por su DEFINICIÓN, no por nombre, porque `marketing.sql` los
  -- declaró en línea y Postgres los auto-nombró.
  --
  -- 🩸 Y se los busca por `foto_proyecto` a secas, NUNCA por el texto `tipo IN`:
  -- Postgres NORMALIZA `IN (...)` a `= ANY (ARRAY[...])` al guardar la
  -- definición, así que buscar por `IN` no encuentra nada, el CHECK viejo
  -- sobrevive y **la migración deja `foto_instalacion` prohibida** — el paso
  -- entero se vuelve un no-op silencioso.
  FOR v_nombre IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'mk_adjuntos'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%foto_proyecto%'
  LOOP
    EXECUTE format('ALTER TABLE mk_adjuntos DROP CONSTRAINT %I', v_nombre);
  END LOOP;

  ALTER TABLE mk_adjuntos
    ADD CONSTRAINT mk_adjuntos_tipo_chk
    CHECK (tipo IN ('pdf_factura','foto_proyecto','foto_factura','foto_instalacion','otro'));

  ALTER TABLE mk_adjuntos
    ADD CONSTRAINT mk_adjuntos_destino_chk
    CHECK (
      (tipo = 'pdf_factura'      AND factura_id IS NOT NULL) OR
      (tipo = 'foto_factura'     AND factura_id IS NOT NULL) OR
      -- La foto de instalación cuelga del GASTO. Es lo que permite decir
      -- "este gasto no tiene foto" sin listas ni banderas por tipo de gasto.
      (tipo = 'foto_instalacion' AND factura_id IS NOT NULL) OR
      (tipo = 'foto_proyecto'    AND proyecto_id IS NOT NULL AND factura_id IS NULL) OR
      (tipo = 'otro')
    );
END $$;

CREATE INDEX IF NOT EXISTS mk_adjuntos_factura_tipo_idx
  ON mk_adjuntos (factura_id, tipo);

-- ----------------------------------------------------------------------------
-- PASO 5b — un gasto puede vivir SIN cliente y SIN impulsadora
--
-- Daniel: *"si, como pagarle a una impulsadora todo el mes"* — y también
-- catálogos, eventos, material general. Hasta hoy el CHECK `origen_check`
-- exigía proyecto O impulsadora, porque los únicos gastos sueltos eran los
-- pagos de impulsadora. Con "Registrar gasto" el cliente es OPCIONAL, así que
-- una factura puede quedar con los dos en NULL: es un gasto general de su
-- marca, y sale en el reporte bajo "General".
--
-- Se QUITA el CHECK en vez de reescribirlo: ya no queda ninguna combinación
-- prohibida (todas las filas viejas lo cumplían de sobra). Mismo criterio para
-- `mk_entregas_muebles.proyecto_id`: el código ya insertaba NULL ("entregas
-- pendientes sin asignar") pero la migración original decía NOT NULL — se
-- alinea la base con lo que el código ya hace. DROP NOT NULL es idempotente.
-- ----------------------------------------------------------------------------
ALTER TABLE mk_facturas DROP CONSTRAINT IF EXISTS mk_facturas_origen_check;
ALTER TABLE mk_entregas_muebles ALTER COLUMN proyecto_id DROP NOT NULL;

-- ----------------------------------------------------------------------------
-- PASO 6 — control: NINGÚN monto se movió
--
-- Se compara contra las cifras medidas el 11-ago-2026. Si algo no da, se
-- ABORTA la transacción entera: es preferible no migrar a migrar torcido.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_cerr_n int; v_cerr_t numeric;
  v_th numeric; v_ck numeric;
BEGIN
  -- El período cerrado, ahora leído POR CÓDIGO DE MARCA.
  SELECT count(DISTINCT d.documento_id), COALESCE(sum(f.total * (fm.porcentaje / NULLIF(tot.suma,0))), 0)
    INTO v_cerr_n, v_cerr_t
  FROM mk_periodo_documentos d
  JOIN mk_periodos pe ON pe.id = d.periodo_id AND pe.estado = 'cerrado'
  JOIN mk_facturas f ON f.id = d.documento_id AND d.tipo = 'factura'
  JOIN mk_marcas m ON upper(btrim(m.codigo)) = d.proveedor_key
  JOIN mk_factura_marcas fm ON fm.factura_id = f.id AND fm.marca_id = m.id
  JOIN LATERAL (SELECT sum(x.porcentaje) AS suma FROM mk_factura_marcas x WHERE x.factura_id = f.id) tot ON TRUE
  WHERE f.anulado_en IS NULL;

  RAISE NOTICE 'CONTROL — periodo cerrado por marca: % facturas, % (esperado 59 / 62381.57)',
    v_cerr_n, round(v_cerr_t, 2);

  IF v_cerr_n <> 59 OR round(v_cerr_t, 2) <> 62381.57 THEN
    RAISE EXCEPTION
      'El periodo cerrado NO da 59 / 62381.57 (dio % / %). Se aborta: un monto se movio.',
      v_cerr_n, round(v_cerr_t, 2);
  END IF;

  -- Cada marca tiene exactamente un período abierto.
  IF EXISTS (
    SELECT 1 FROM (VALUES ('TH'),('CK'),('KL'),('RBK'),('J')) AS m(c)
    WHERE (SELECT count(*) FROM mk_periodos pe
           WHERE pe.proveedor_key = m.c AND pe.estado = 'abierto') <> 1
  ) THEN
    RAISE EXCEPTION 'Alguna marca no quedo con exactamente UN periodo abierto.';
  END IF;

  -- Que el PASO 5 no haya sido un no-op silencioso: si el CHECK viejo
  -- sobreviviera, subir una foto de instalacion fallaria en produccion y la
  -- pantalla se veria bien hasta que alguien lo intentara.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'mk_adjuntos'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%foto_instalacion%'
  ) THEN
    RAISE EXCEPTION 'mk_adjuntos todavia no acepta foto_instalacion. El PASO 5 no aplico.';
  END IF;
END $$;

COMMENT ON COLUMN mk_periodos.proveedor_key IS
  'Codigo de MARCA (TH/CK/KL/RBK/J) desde 11-ago-2026. Las filas historicas de PVH conservan ''pvh'': ese cierre fue conjunto de verdad.';
COMMENT ON COLUMN mk_periodo_documentos.proveedor_key IS
  'Codigo de MARCA. Los sellos viejos por proveedor quedan como respaldo (ver bloques.ts -> clavesDeSello).';
