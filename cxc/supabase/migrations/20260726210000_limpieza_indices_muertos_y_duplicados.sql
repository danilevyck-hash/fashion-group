-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: limpieza de índices — 0 lecturas + duplicados/redundantes
--
-- ── PROBLEMA ────────────────────────────────────────────────────────────────
-- La base está en 250 MB de 500. Dos familias de índices no aportan nada y
-- cuestan en CADA escritura (INSERT/UPDATE mantiene todos los índices de la
-- tabla, los use alguien o no):
--
--   A) 15 índices con idx_scan = 0 en pg_stat_user_indexes.
--   B) índices REDUNDANTES: su columna (o su prefijo) ya está cubierta por un
--      índice UNIQUE de la misma tabla. Postgres nunca elige el redundante
--      cuando existe el unique con las mismas columnas líderes.
--
-- La más cara con diferencia es idx_sad_empresa_fecha en switch_articulo_diario:
-- esa tabla tiene 39 MB de índices contra 29 MB de datos — más índice que dato.
--
-- ── QUÉ HACE ────────────────────────────────────────────────────────────────
-- Dos bloques DO idempotentes que borran solo índices NO-únicos, NO-primarios y
-- que NO respaldan una constraint ni una llave foránea. Cada guarda se evalúa
-- CONTRA EL CATÁLOGO REAL de producción, no contra esta lista: si algo cambió
-- desde que se escribió esta migración, el índice se CONSERVA y sale por NOTICE.
-- Nada se borra a ciegas.
--
-- ── QUÉ NO SE BORRA, Y POR QUÉ ──────────────────────────────────────────────
-- 5 de los 15 índices "con 0 lecturas" respaldan una LLAVE FORÁNEA. idx_scan = 0
-- es esperable en ellos: no los lee una query, los usa el motor cuando se borra
-- o actualiza la fila PADRE. Sin el índice, cada DELETE del padre hace seq scan
-- de la tabla hija. Se CONSERVAN los cinco:
--
--   idx_caja_gastos_periodo         caja_gastos.periodo_id     -> caja_periodos(id)     ON DELETE CASCADE
--   caja_gastos_responsable_id_idx  caja_gastos.responsable_id -> caja_responsables(id) ON DELETE SET NULL
--   caja_periodos_created_by_idx    caja_periodos.created_by   -> fg_users(id)          ON DELETE SET NULL
--   idx_mk_proyecto_marcas_marca    mk_proyecto_marcas.marca_id-> mk_marcas(id)
--   reebok_orders_reemplaza_a_idx   reebok_orders.reemplaza_a  -> reebok_orders(id)     (auto-referencia)
--
-- (fuentes: schema.sql:120, caja-responsables-fk.sql:24, caja-created-by.sql:6-9,
--  marketing.sql:47, 20260722120000_pedidos_reemplaza_a.sql:21)
--
-- Tampoco se toca ningún índice de switch_articulo_diario que no sea el
-- redundante: esa tabla guarda el ÚNICO histórico de artículos (el API de Switch
-- solo devuelve el día de hoy). Acá se le borra un índice, jamás una fila.
--
-- ── ESPACIO QUE LIBERA (tamaños medidos 26-jul-2026 en producción) ──────────
--   A) idx_ventas_raw_cliente_codigo        768 kB
--      idx_mft_vendedor                     240 kB
--      packing_lists_parser_metadata_idx     64 kB
--      7 índices más                     7 × 16 kB = 112 kB
--      (los 5 de FK, 80 kB, se conservan)
--                                        ─────────────
--      subtotal A                        ~1,2 MB
--
--   B) idx_sad_empresa_fecha            ~6-8 MB  (estimado: 197.128 filas x
--                                        ~40 B/entrada; es el único grande)
--      idx_cxc_rows_company                ~40 kB
--      idx_scd_empresa_fecha               ~40 kB
--      idx_cxc_overrides_name              ~16 kB
--      idx_bancos_saldos_empresa_fecha      ~8 kB  (tabla vacía hoy)
--                                        ─────────────
--      subtotal B                        ~7 MB
--
--   TOTAL ~8 MB de disco, y —lo que más importa— entre 1 y 5 entradas de índice
--   MENOS que mantener en cada escritura de ventas_raw, switch_articulo_diario,
--   multifashion_tickets, cxc_rows y switch_costo_diario.
--
-- ── CÓMO VERIFICAR ──────────────────────────────────────────────────────────
-- Antes y después, comparar:
--   SELECT pg_size_pretty(SUM(pg_relation_size(indexrelid))) AS indices
--   FROM pg_stat_user_indexes;
--
-- Y que no quedó ninguno de la lista:
--   SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
--   AND indexname IN ('idx_ventas_raw_cliente_codigo','idx_mft_vendedor',
--     'packing_lists_parser_metadata_idx','idx_vendedores_nombre',
--     'idx_cxc_uploads_company','idx_vendor_assignments_company',
--     'idx_caja_periodos_estado','caja_gastos_deleted_at_idx',
--     'idx_contact_log_name','reebok_order_items_is_preorder_idx',
--     'idx_cxc_overrides_name','idx_scd_empresa_fecha',
--     'idx_bancos_saldos_empresa_fecha','idx_sad_empresa_fecha',
--     'idx_cxc_rows_company');
--   -- esperado: 0 filas
--
-- Los índices de FK que SÍ deben seguir vivos:
--   SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
--   AND indexname IN ('idx_caja_gastos_periodo','caja_gastos_responsable_id_idx',
--     'caja_periodos_created_by_idx','idx_mk_proyecto_marcas_marca',
--     'reebok_orders_reemplaza_a_idx');
--   -- esperado: 5 filas
--
-- ── CÓMO APLICAR ────────────────────────────────────────────────────────────
-- Este archivo es TRANSACCIONAL: se pega COMPLETO en el SQL Editor, de una sola
-- vez. NO tiene CONCURRENTLY, NO tiene VACUUM. No hace falta separar nada.
--
-- DROP INDEX toma ACCESS EXCLUSIVE sobre la tabla por milisegundos. El
-- lock_timeout de 5 s de abajo hace que, si justo hay un sync escribiendo, la
-- migración ABORTE LIMPIA en vez de encolarse y trabar la app. Si eso pasa:
-- volver a correrla unos minutos después. Es idempotente, se puede repetir.
--
-- Correr fuera de 23:50-00:20 y 05:50-06:10 UTC y fuera de las ventanas de sync.
-- ─────────────────────────────────────────────────────────────────────────────

SET lock_timeout = '5s';


-- ── BLOQUE A: índices con 0 lecturas ────────────────────────────────────────
DO $$
DECLARE
  v_name     text;
  v_borrados text[] := '{}';
  v_intactos text[] := '{}';
  -- Los 5 índices de FK NO están en esta lista, a propósito (ver cabecera).
  v_lista    text[] := ARRAY[
    'idx_ventas_raw_cliente_codigo',        -- ventas_raw(cliente_codigo)   768 kB
    'idx_mft_vendedor',                     -- multifashion_tickets(vendedor_switch_id) 240 kB
    'packing_lists_parser_metadata_idx',    -- GIN packing_lists(parser_metadata) 64 kB
    'idx_vendedores_nombre',                -- vendedores(nombre)
    'idx_cxc_uploads_company',              -- cxc_uploads(company_key)
    'idx_vendor_assignments_company',       -- vendor_assignments(company_key)
    'idx_caja_periodos_estado',             -- caja_periodos(estado)
    'caja_gastos_deleted_at_idx',           -- caja_gastos(deleted_at) WHERE deleted
    'idx_contact_log_name',                 -- cxc_contact_log(...) — no está en el repo,
                                            --   creado a mano en prod; las guardas de
                                            --   abajo lo protegen si resultara único/FK
    'reebok_order_items_is_preorder_idx'    -- reebok_order_items(is_preorder) WHERE true
  ];
BEGIN
  FOREACH v_name IN ARRAY v_lista LOOP

    -- ¿existe?
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relname = v_name AND n.nspname = 'public' AND c.relkind = 'i'
    ) THEN
      v_intactos := v_intactos || (v_name || ' — no existe (nada que hacer)');
      CONTINUE;
    END IF;

    -- GUARDA 1: nunca un UNIQUE / PRIMARY / EXCLUSION.
    IF EXISTS (
      SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
      WHERE c.relname = v_name
        AND (i.indisunique OR i.indisprimary OR i.indisexclusion)
    ) THEN
      v_intactos := v_intactos || (v_name || ' — CONSERVADO: es UNIQUE/PK');
      CONTINUE;
    END IF;

    -- GUARDA 2: nunca uno que respalde una constraint.
    IF EXISTS (
      SELECT 1 FROM pg_constraint co JOIN pg_class c ON c.oid = co.conindid
      WHERE c.relname = v_name
    ) THEN
      v_intactos := v_intactos || (v_name || ' — CONSERVADO: respalda una constraint');
      CONTINUE;
    END IF;

    -- GUARDA 3: nunca uno cuya PRIMERA columna sea la primera columna de una
    -- llave foránea de esa misma tabla (es el índice que sostiene el borrado
    -- en cascada / SET NULL del padre).
    IF EXISTS (
      SELECT 1
      FROM pg_index i
      JOIN pg_class ic     ON ic.oid = i.indexrelid
      JOIN pg_constraint fk ON fk.conrelid = i.indrelid AND fk.contype = 'f'
      WHERE ic.relname = v_name
        AND i.indkey[0] = fk.conkey[1]
    ) THEN
      v_intactos := v_intactos || (v_name || ' — CONSERVADO: respalda una llave foránea');
      CONTINUE;
    END IF;

    EXECUTE format('DROP INDEX public.%I', v_name);
    v_borrados := v_borrados || v_name;
  END LOOP;

  RAISE NOTICE 'BLOQUE A — borrados (%): %',   coalesce(array_length(v_borrados, 1), 0), v_borrados;
  RAISE NOTICE 'BLOQUE A — conservados (%): %', coalesce(array_length(v_intactos, 1), 0), v_intactos;
END $$;


-- ── BLOQUE B: índices REDUNDANTES ───────────────────────────────────────────
-- Solo borra si PRUEBA, contra el catálogo, que las columnas del índice son
-- PREFIJO de otro índice ÚNICO y VÁLIDO de la MISMA tabla. Si el sustituto no
-- está, no borra nada: la tabla nunca queda sin índice por esa columna.
DO $$
DECLARE
  v_name       text;
  v_relid      oid;
  v_keys       int2[];
  v_sustituto  text;
  v_borrados   text[] := '{}';
  v_intactos   text[] := '{}';
  v_lista      text[] := ARRAY[
    -- índice redundante          sustituto que se queda (UNIQUE de la misma tabla)
    'idx_cxc_overrides_name',     -- cxc_client_overrides(nombre_normalized); la
                                  --   columna ya es `text unique not null` (schema.sql:48)
    'idx_scd_empresa_fecha',      -- switch_costo_diario(empresa_key,fecha); copia 1:1 de
                                  --   UNIQUE(empresa_key,fecha) (20260529000200:29)
    'idx_bancos_saldos_empresa_fecha', -- bancos_saldos(empresa_key,fecha_dato DESC);
                                  --   contenido en uq_bancos_saldos_empresa_fecha
                                  --   (20260718120000:98). El DESC no aporta: con
                                  --   empresa_key fijo el unique se escanea al revés.
    'idx_sad_empresa_fecha'       -- switch_articulo_diario(empresa_key,fecha); PREFIJO
                                  --   ESTRICTO de UNIQUE(empresa_key,fecha,articulo_id,
                                  --   tipo) (20260605020000:39). EL GRANDE (~6-8 MB).
  ];
BEGIN
  -- Caso aparte: dos índices NO-únicos idénticos entre sí sobre cxc_rows(company_key)
  -- — idx_cxc_rows_company (schema.sql:44) e idx_cxc_rows_company_key
  -- (backups/sprint1-20260509/migration_fase4_cxc.sql:78). Se borra el viejo SOLO
  -- si el nuevo existe de verdad; si no, cxc_rows se quedaría sin índice por
  -- company_key, que sí se usa.
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_cxc_rows_company')
     AND EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_cxc_rows_company_key')
  THEN
    DROP INDEX public.idx_cxc_rows_company;
    v_borrados := v_borrados || 'idx_cxc_rows_company (idéntico a idx_cxc_rows_company_key)';
  ELSE
    v_intactos := v_intactos || 'idx_cxc_rows_company — CONSERVADO: no está su gemelo idx_cxc_rows_company_key';
  END IF;

  FOREACH v_name IN ARRAY v_lista LOOP

    SELECT i.indrelid, i.indkey::int2[]
      INTO v_relid, v_keys
    FROM pg_index i
    JOIN pg_class c    ON c.oid = i.indexrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = v_name AND n.nspname = 'public'
      AND i.indisunique = false           -- por si acaso: nunca uno único
      AND i.indpred IS NULL               -- ni parcial (el prefijo no probaría nada)
      AND i.indexprs IS NULL;             -- ni de expresión

    IF v_relid IS NULL THEN
      v_intactos := v_intactos || (v_name || ' — no existe, o es único/parcial/de expresión (no se toca)');
      CONTINUE;
    END IF;

    -- ¿Hay otro índice ÚNICO y VÁLIDO en la misma tabla cuyas columnas líderes
    -- sean exactamente las de éste?
    SELECT c2.relname INTO v_sustituto
    FROM pg_index i2
    JOIN pg_class c2 ON c2.oid = i2.indexrelid
    WHERE i2.indrelid = v_relid
      AND c2.relname <> v_name
      AND i2.indisunique
      AND i2.indisvalid
      AND i2.indpred IS NULL
      AND i2.indexprs IS NULL
      AND (i2.indkey::int2[])[1:array_length(v_keys, 1)] = v_keys
    LIMIT 1;

    IF v_sustituto IS NULL THEN
      v_intactos := v_intactos || (v_name || ' — CONSERVADO: no encontré el índice único que lo cubra');
      CONTINUE;
    END IF;

    EXECUTE format('DROP INDEX public.%I', v_name);
    v_borrados := v_borrados || (v_name || ' (cubierto por ' || v_sustituto || ')');
  END LOOP;

  RAISE NOTICE 'BLOQUE B — borrados (%): %',   coalesce(array_length(v_borrados, 1), 0), v_borrados;
  RAISE NOTICE 'BLOQUE B — conservados (%): %', coalesce(array_length(v_intactos, 1), 0), v_intactos;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK — recrear TODO lo que borra esta migración.
-- (Correr cada CREATE INDEX CONCURRENTLY por separado, uno por corrida; sin
--  CONCURRENTLY se pueden pegar todos juntos pero bloquean escrituras.)
--
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ventas_raw_cliente_codigo
--     ON ventas_raw (cliente_codigo);
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mft_vendedor
--     ON multifashion_tickets (vendedor_switch_id);
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS packing_lists_parser_metadata_idx
--     ON packing_lists USING gin (parser_metadata);
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vendedores_nombre
--     ON vendedores (nombre);
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cxc_uploads_company
--     ON cxc_uploads (company_key);
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vendor_assignments_company
--     ON vendor_assignments (company_key);
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_caja_periodos_estado
--     ON caja_periodos (estado);
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS caja_gastos_deleted_at_idx
--     ON caja_gastos (deleted_at) WHERE deleted = true;
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS reebok_order_items_is_preorder_idx
--     ON reebok_order_items (is_preorder) WHERE is_preorder = true;
--   -- idx_contact_log_name: no está definido en el repo. Si hiciera falta
--   -- rehacerlo, sacar su definición del backup diario ANTES de borrarlo:
--   --   SELECT indexdef FROM pg_indexes WHERE indexname = 'idx_contact_log_name';
--
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cxc_overrides_name
--     ON cxc_client_overrides (nombre_normalized);
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_scd_empresa_fecha
--     ON switch_costo_diario (empresa_key, fecha);
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bancos_saldos_empresa_fecha
--     ON bancos_saldos (empresa_key, fecha_dato DESC);
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sad_empresa_fecha
--     ON switch_articulo_diario (empresa_key, fecha);
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cxc_rows_company
--     ON cxc_rows (company_key);
-- ─────────────────────────────────────────────────────────────────────────────
