-- ============================================================================
-- Marketing — LA FOTO DE UNA TIENDA SE PUEDE GUARDAR, Y SIGUE AL PERÍODO
-- (24-sep-2026)
--
-- 🩸 DOS DEFECTOS QUE DANIEL REPORTÓ HOY, MEDIDOS CONTRA PRODUCCIÓN:
--
--  1. NO SE PODÍA GUARDAR NINGUNA FOTO DE TIENDA, Y NUNCA SE PUDO. La puerta
--     del rediseño (`POST /api/marketing/tienda/<código>/fotos`) manda
--     `tipo = 'foto_proyecto'` con el proyecto VACÍO —el rediseño del 22-sep
--     quitó los proyectos— y la regla `mk_adjuntos_destino_chk` (11-ago-2026)
--     todavía exige proyecto para ese tipo: error 23514 y la pantalla roja.
--     Medido: **0 de 160** filas de `mk_adjuntos` tienen tienda sin proyecto, y
--     el intento de hoy dejó **4 archivos huérfanos** en `tienda/D-118/`
--     (24-sep 21:50–21:51 UTC), que ninguna pantalla ve.
--
--  2. LAS FOTOS NO SEGUÍAN AL PERÍODO. Daniel: *«cuando me meto al período
--     abierto, veo las fotos del período viejo»*. `mk_adjuntos` no tiene
--     período: la ficha muestra TODAS las fotos de la tienda mire lo que mire
--     la barra Abierto · mid 2026 · Todos. En Outlet Duty Free N3 (D-118) las
--     dos únicas fotos (16-jun y 30-jul) pertenecen a «mid 2026 · PVH», que se
--     cerró el 12-ago-2026, y salían bajo «Abierto».
--
-- ⚠️ ADITIVA. No borra una tabla, ni una fila, ni una columna. Ningún monto se
-- toca: acá no hay una sola columna de plata.
--
-- QUÉ HACE, EN TRES PASOS:
--   A. Agrega `mk_adjuntos.periodo_id` (nullable, referencia a `mk_periodos`).
--      Sin sello = «Abierto», la misma definición de `periodo-manda.ts`.
--   B. Reemplaza `mk_adjuntos_destino_chk` por una que ADEMÁS acepta una foto
--      colgada de la TIENDA sin proyecto. Todo lo que la regla exigía antes
--      se conserva letra por letra.
--   C. Sella las 52 fotos viejas que ya se le pasaron a la marca, POR LISTA DE
--      IDS (nunca un UPDATE abierto), con el período de los gastos de su
--      proyecto: las 52 caen en «mid 2026» (8e2ee894…), único período cerrado.
--      Las 8 fotos restantes tienen gastos abiertos y quedan sin sello: se
--      siguen viendo en «Abierto», que es donde van.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PASO 0 — no correr esto sobre una base que no tiene lo anterior
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.mk_adjuntos') IS NULL OR to_regclass('public.mk_periodos') IS NULL THEN
    RAISE EXCEPTION 'Faltan mk_adjuntos o mk_periodos: corre antes las migraciones de marketing.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'mk_adjuntos' AND column_name = 'tienda_codigo'
  ) THEN
    RAISE EXCEPTION
      'Falta mk_adjuntos.tienda_codigo: corre antes 20261216120000_marketing_gasto_tienda_se_reporta.sql.';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- PASO 1 — VISTA PREVIA (no escribe nada)
--
-- Medido contra producción el 24-sep-2026, tiene que decir:
--   fotos de proyecto            -> 60   (las 60 con tienda, 0 sin proyecto)
--   fotos con tienda sin proyecto-> 0    (ninguna se pudo guardar nunca)
--   períodos cerrados            -> 1    ("mid 2026", pvh, 12-ago-2026)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_fotos int; v_tienda_sin_proy int; v_cerrados int;
BEGIN
  SELECT count(*) INTO v_fotos FROM mk_adjuntos WHERE tipo = 'foto_proyecto';
  SELECT count(*) INTO v_tienda_sin_proy FROM mk_adjuntos
    WHERE tipo = 'foto_proyecto' AND proyecto_id IS NULL AND tienda_codigo IS NOT NULL;
  SELECT count(*) INTO v_cerrados FROM mk_periodos WHERE estado = 'cerrado';

  RAISE NOTICE 'VISTA PREVIA — fotos de proyecto: %', v_fotos;
  RAISE NOTICE 'VISTA PREVIA — fotos de tienda sin proyecto: %', v_tienda_sin_proy;
  RAISE NOTICE 'VISTA PREVIA — períodos cerrados: %', v_cerrados;

  IF v_fotos <> 60 THEN
    RAISE WARNING 'Las fotos de proyecto no dan 60 (dan %). No es un error: se midió el 24-sep-2026.', v_fotos;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- PASO A — el sello de la foto: UNA columna, no una fila de sellos
--
-- 🔑 Un GASTO se sella por MARCA (una fila en `mk_periodo_documentos` por
-- marca, con su `proveedor_key`). Una foto de tienda NO tiene marca —lo que se
-- ve en la foto es la tienda—, así que lleva UN período y nada más. `NULL` =
-- abierta, exactamente como un gasto sin sello a un cerrado.
--
-- ON DELETE SET NULL: si algún día se borra un período, la foto no se va con
-- él — vuelve a «Abierto», que es lo correcto y no pierde nada.
-- ----------------------------------------------------------------------------
ALTER TABLE mk_adjuntos
  ADD COLUMN IF NOT EXISTS periodo_id uuid REFERENCES mk_periodos(id) ON DELETE SET NULL;

COMMENT ON COLUMN mk_adjuntos.periodo_id IS
  'El período al que pertenece una foto de TIENDA. NULL = abierta (todavía no se le pasó a ninguna marca). Se escribe al subir la foto, con el período abierto del gasto más reciente de esa tienda.';

CREATE INDEX IF NOT EXISTS mk_adjuntos_tienda_periodo_idx
  ON mk_adjuntos (tienda_codigo, periodo_id)
  WHERE tipo = 'foto_proyecto';

-- ----------------------------------------------------------------------------
-- PASO B — la regla de destino acepta una foto de TIENDA sin proyecto
--
-- 🩸 Se busca por `foto_proyecto` a secas y NUNCA por el texto `IN (...)`:
-- Postgres normaliza `IN` a `= ANY (ARRAY[...])` al guardar la definición, así
-- que buscar por `IN` no encuentra nada y el paso se vuelve un no-op silencioso
-- (la lección de 20260811180000).
--
-- Lo que la regla exigía antes se conserva LETRA POR LETRA; lo único nuevo es
-- el renglón de la tienda.
-- ----------------------------------------------------------------------------
DO $$
DECLARE v_nombre text;
BEGIN
  FOR v_nombre IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'mk_adjuntos'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%foto_proyecto%'
      AND pg_get_constraintdef(oid) ILIKE '%proyecto_id%'
  LOOP
    EXECUTE format('ALTER TABLE mk_adjuntos DROP CONSTRAINT %I', v_nombre);
  END LOOP;

  ALTER TABLE mk_adjuntos
    ADD CONSTRAINT mk_adjuntos_destino_chk
    CHECK (
      (tipo = 'pdf_factura'      AND factura_id IS NOT NULL) OR
      (tipo = 'foto_factura'     AND factura_id IS NOT NULL) OR
      -- La foto de instalación cuelga del GASTO. Es lo que permite decir
      -- "este gasto no tiene foto" sin listas ni banderas por tipo de gasto.
      (tipo = 'foto_instalacion' AND factura_id IS NOT NULL) OR
      -- La de siempre: la foto de un PROYECTO.
      (tipo = 'foto_proyecto'    AND proyecto_id IS NOT NULL AND factura_id IS NULL) OR
      -- 🔴 NUEVA (24-sep-2026): la foto de una TIENDA, sin proyecto.
      (tipo = 'foto_proyecto'    AND tienda_codigo IS NOT NULL AND factura_id IS NULL) OR
      (tipo = 'otro')
    );
END $$;

-- ----------------------------------------------------------------------------
-- PASO C — sellar las fotos viejas, POR LISTA DE IDS
--
-- Las 52 fotos cuyo proyecto tiene al menos un gasto sellado a un período
-- CERRADO. Medido el 24-sep-2026: las 52 caen en el MISMO período, «mid 2026»
-- (8e2ee894-2b68-47f2-b342-b6c0bc9f5a0a, pvh, cerrado el 12-ago-2026), y
-- ninguna toca dos períodos. Se reparten en 14 tiendas; las dos de D-118 son
-- 013d9316… (16-jun) y 9ec37900… (30-jul).
--
-- Nunca un UPDATE abierto: la lista está escrita, y el paso aborta si toca un
-- número de filas distinto del medido.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_periodo constant uuid := '8e2ee894-2b68-47f2-b342-b6c0bc9f5a0a';
  v_tocadas int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM mk_periodos WHERE id = v_periodo AND estado = 'cerrado') THEN
    RAISE WARNING 'El período mid 2026 (%) no existe o no está cerrado: no se sella ninguna foto vieja.', v_periodo;
    RETURN;
  END IF;

  WITH viejas(id) AS (VALUES
    ('013d9316-fb4b-49fd-8bba-5116f1ef8eec'),
    ('0351e25f-02d1-47cd-a349-743825c29ad8'),
    ('07d7a01e-a324-4c85-a864-38767b2eeb97'),
    ('08d162d8-1a85-4f7d-86f1-891a121522d1'),
    ('0b97e060-1a48-4ca6-9f58-a099dbc0a167'),
    ('0b98391e-ee7b-4602-a71a-280022742692'),
    ('120cd497-b2b8-44a3-9745-46eea7651d8d'),
    ('159d69cc-62c2-4c09-97df-dd0a8091fc0a'),
    ('2569cffd-5b7d-46c2-8310-a0edc840a6f8'),
    ('27bf11e3-69ba-462c-be96-791f9cdfe024'),
    ('2d21687f-0763-4268-8c7d-6ae8b424abcb'),
    ('3173a300-f7eb-4db6-9482-fb0fa9d4d5e2'),
    ('3e3f0395-f25b-424c-9adf-edf9f2ff21dd'),
    ('405b9ff6-0c58-4c15-b30f-8cc4c521f091'),
    ('42a2dd8a-fe05-4481-a106-f7431e13a1ea'),
    ('43b0f729-2a77-4dfb-ae09-7b3e2952a619'),
    ('4b9dcfa7-80ee-476a-9027-13b6faf25e83'),
    ('4c7acc97-13e9-4a36-9fe6-96e5bdbc6e9a'),
    ('54b69f3e-bf91-4039-9658-514341f09a5a'),
    ('587e4a19-f0d5-4d31-bf75-f9a6f9717763'),
    ('58aab7e4-55ef-41e8-a248-67b10994d575'),
    ('67cd2a31-983c-4751-aa61-8521e822035f'),
    ('69ba3467-2578-4865-8b45-77edbef6de5c'),
    ('6c9b19cd-7922-4125-b78e-2e7f35bb02bb'),
    ('6e73a0d0-e906-46a6-bc3b-6a713b7d74db'),
    ('74ff56a1-315d-4b9a-8292-508f6d92b1ec'),
    ('76da966b-1c38-470c-b4f5-a766757985cc'),
    ('7be894d2-aa62-4c62-9ab4-26a88a15a137'),
    ('84aac583-8041-4abe-8461-a6a7ae7ccc57'),
    ('93f17167-a72b-4c20-a1cb-bfcbcba21d27'),
    ('9c6aebe4-ee86-4b4f-b76b-0404f6a01dfd'),
    ('9c8393b6-4afb-4724-a61b-6e9c7933adc9'),
    ('9d2de3a3-8845-44ab-9044-82bd792ea560'),
    ('9ec37900-f530-44b8-a8de-04427b475c43'),
    ('a6d62ac2-22ef-4248-9b31-e97da8464840'),
    ('ab835634-31b6-4558-ba79-678c8602baf5'),
    ('b4b69368-b132-4085-99dd-78887d88ee1b'),
    ('b7afef5c-8c25-48e6-a493-24a2f2581dbe'),
    ('b8b689ca-a8e7-4dbc-a8ae-36f0245e60c5'),
    ('cb11dd8f-72ca-487e-9f18-7577357f6731'),
    ('cd4decc0-6f2c-426b-84fe-d5fe0ed667cb'),
    ('cecee6d7-4dee-45d9-8f7d-ca0a005c5ec2'),
    ('cfef38b7-52a1-4334-847d-d63ee90ac4c8'),
    ('d1009d14-d5fe-4eb9-ad83-07980d421752'),
    ('d14b257c-b41f-4d2b-8e09-a00d36237349'),
    ('d1cc5e95-e449-484a-9820-b460d196cb21'),
    ('d8f21dc1-4e73-4fb6-ad01-fd2ce69270e0'),
    ('e86dc67d-1f37-43a3-85c2-4f14a4e95c04'),
    ('e9b85add-dfdb-4653-82b5-dfd867db0da3'),
    ('ece5aa6f-0325-4494-94f5-9eccc1289f93'),
    ('f306c27f-519b-40d3-a401-c21f97888552'),
    ('fe3ce24b-4127-4d8d-b411-5953d6af2e50')
  )
  UPDATE mk_adjuntos a
     SET periodo_id = v_periodo
    FROM viejas v
   WHERE a.id = v.id::uuid
     AND a.periodo_id IS DISTINCT FROM v_periodo;
  GET DIAGNOSTICS v_tocadas = ROW_COUNT;

  RAISE NOTICE 'Fotos viejas selladas a mid 2026: %', v_tocadas;
  IF v_tocadas > 52 THEN
    RAISE EXCEPTION 'Se iban a sellar % fotos y la lista tiene 52. Abortado.', v_tocadas;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- PASO D — comprobación final (no escribe nada)
-- ----------------------------------------------------------------------------
DO $$
DECLARE v_selladas int; v_sin_sello int;
BEGIN
  SELECT count(*) INTO v_selladas FROM mk_adjuntos
    WHERE tipo = 'foto_proyecto' AND periodo_id IS NOT NULL;
  SELECT count(*) INTO v_sin_sello FROM mk_adjuntos
    WHERE tipo = 'foto_proyecto' AND periodo_id IS NULL;
  RAISE NOTICE 'DESPUÉS — fotos con sello: % · sin sello (abiertas): %', v_selladas, v_sin_sello;
END $$;
