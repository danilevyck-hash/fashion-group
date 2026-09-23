-- ─────────────────────────────────────────────────────────────────────────────
-- MARKETING — EL REDISEÑO, PIEZA 1 DE 2: EL GASTO LLEVA SU TIENDA, SU NOTA Y
-- SU «¿SE REPORTA A LA MARCA?» (22-sep-2026). ADITIVA. NO BORRA NI CAMBIA
-- UN SOLO VALOR QUE EXISTA.
--
-- Lo que Daniel definió ese día, y que esta migración sostiene:
--   · «a) Basta la tienda»: el PROYECTO se va. Queda la tienda (código del
--     directorio, `clientes_master`) + una nota libre de qué fue.
--   · «hay gastos o muebles que son para tienda pero no quiero reportar como
--     gastos pero saber que existen»: interruptor `se_reporta`, en los TRES
--     tipos, PRENDIDO por defecto.
--   · «no elimines ni modifiques nada, deja que secretaria lo haga cuando
--     rediseñemos»: por eso `proyecto_id` SE QUEDA, los duplicados se quedan,
--     los 7 proyectos vacíos se quedan y el gasto en «Otros» se queda.
--
-- 🔴 COPIAR, NO MOVER. La tienda de cada gasto se COPIA del proyecto al que
-- hoy cuelga (`SET tienda_codigo = (SELECT tienda_codigo FROM mk_proyectos …)
-- WHERE tienda_codigo IS NULL`). `proyecto_id` no se toca: patrón
-- `mayor_lineas`, nada se dropea y nada se pone en NULL.
--
-- 🔴 DEFAULT true = NADA CAMBIA PARA LO QUE EXISTE. Las 108 facturas, las 24
-- entregas y los 17 pagos de impulsadora siguen sumando y saliendo en el ZIP
-- exactamente como hoy. Solo lo que alguien APAGUE deja de sumar.
--
-- 🔴 EL CÓDIGO FALLA ABIERTO SIN ESTO. `lib/marketing/columnas-opcionales.ts`:
-- una lectura que pida estas columnas y reciba «no existe» se relee sin ellas
-- y las completa con su valor de hoy (`se_reporta = true`, tienda y nota
-- vacías). No hay ninguna pantalla que dependa de que esto haya corrido.
--
-- MEDIDO CONTRA PRODUCCIÓN EL 22-SEP-2026 (solo lectura), lo que el PASO 0
-- tiene que decir:
--   mk_facturas          108 (94 vivas · 14 anuladas) · 87 con proyecto
--   mk_entregas_muebles   24 · 24 con proyecto
--   mk_adjuntos          168 · 60 con proyecto (las 60 son foto_proyecto)
--   mk_proyectos          25 · 6 SIN tienda_codigo (Changalo, Impulsadoras ×2,
--                         Multifashion Holdings, «D», «J»)
--   Quedarían SIN tienda_codigo después de copiar:
--     facturas con proyecto:  1 (la de «Multifashion Holdings» — el gasto de
--                             $4.264,80 que Daniela mueve a mano, D-108)
--     entregas con proyecto:  0
--     adjuntos con proyecto:  0
--   Más las 21 facturas vivas SIN proyecto (17 impulsadoras + 4 sueltas), que
--   son «General» por diseño y no reciben nada.
--
-- Se aplica con `npm run migrar supabase/migrations/<este archivo>`.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── PASO 0 — VISTA PREVIA (no escribe nada) ─────────────────────────────────
DO $$
DECLARE
  v_fact int; v_fact_proy int; v_ent int; v_ent_proy int; v_adj int; v_adj_proy int;
  v_proy_sin int; v_fact_quedan int; v_ent_quedan int; v_adj_quedan int;
BEGIN
  SELECT count(*), count(proyecto_id) INTO v_fact, v_fact_proy FROM mk_facturas;
  SELECT count(*), count(proyecto_id) INTO v_ent, v_ent_proy FROM mk_entregas_muebles;
  SELECT count(*), count(proyecto_id) INTO v_adj, v_adj_proy FROM mk_adjuntos;
  SELECT count(*) INTO v_proy_sin FROM mk_proyectos WHERE tienda_codigo IS NULL;
  SELECT count(*) INTO v_fact_quedan FROM mk_facturas f
    JOIN mk_proyectos p ON p.id = f.proyecto_id WHERE p.tienda_codigo IS NULL;
  SELECT count(*) INTO v_ent_quedan FROM mk_entregas_muebles e
    JOIN mk_proyectos p ON p.id = e.proyecto_id WHERE p.tienda_codigo IS NULL;
  SELECT count(*) INTO v_adj_quedan FROM mk_adjuntos a
    JOIN mk_proyectos p ON p.id = a.proyecto_id WHERE p.tienda_codigo IS NULL;
  RAISE NOTICE 'mk_facturas % (% con proyecto) · mk_entregas_muebles % (% con proyecto) · mk_adjuntos % (% con proyecto)',
    v_fact, v_fact_proy, v_ent, v_ent_proy, v_adj, v_adj_proy;
  RAISE NOTICE 'proyectos sin tienda_codigo: % → quedarían sin tienda: % facturas · % entregas · % adjuntos',
    v_proy_sin, v_fact_quedan, v_ent_quedan, v_adj_quedan;
END $$;

-- ── PASO 1 — LAS COLUMNAS (aditivas, con DEFAULT: lo que existe no cambia) ──
ALTER TABLE mk_facturas
  ADD COLUMN IF NOT EXISTS se_reporta    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS tienda_codigo text,
  ADD COLUMN IF NOT EXISTS nota          text;

ALTER TABLE mk_entregas_muebles
  ADD COLUMN IF NOT EXISTS se_reporta    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS tienda_codigo text,
  ADD COLUMN IF NOT EXISTS nota          text;

-- Las fotos se pegan a la TIENDA (ya no al proyecto). Ayudan, no obligan.
ALTER TABLE mk_adjuntos
  ADD COLUMN IF NOT EXISTS tienda_codigo text;

COMMENT ON COLUMN mk_facturas.se_reporta IS
  'Marketing (22-sep-2026): ¿va al ZIP y suma en lo de la marca? Prendido por defecto. Apagado: se guarda y se ve en la tienda, no se reporta. En un pago de impulsadora (impulsadora_id) vale igual.';
COMMENT ON COLUMN mk_facturas.tienda_codigo IS
  'Marketing (22-sep-2026): código del directorio (clientes_master.codigo, D-25). NULL = cajón «General». Es del GASTO: copiado del proyecto al nacer la columna, y desde entonces lo elige quien carga.';
COMMENT ON COLUMN mk_facturas.nota IS
  'Marketing (22-sep-2026): qué fue («Apertura», «Remodelación»). Libre. Reemplaza al proyecto como contexto.';
COMMENT ON COLUMN mk_facturas.proyecto_id IS
  'RETIRADA DEL MODELO (22-sep-2026): el proyecto se fue («a) Basta la tienda»). Se conserva con sus valores, sin lectores nuevos. La tienda vive en tienda_codigo.';
COMMENT ON COLUMN mk_entregas_muebles.se_reporta IS
  'Marketing (22-sep-2026): ¿va al ZIP y suma en lo de la marca? Prendido por defecto.';
COMMENT ON COLUMN mk_entregas_muebles.tienda_codigo IS
  'Marketing (22-sep-2026): código del directorio. NULL = «General». Copiado del proyecto al nacer la columna.';
COMMENT ON COLUMN mk_entregas_muebles.nota IS
  'Marketing (22-sep-2026): qué fue. Libre.';
COMMENT ON COLUMN mk_entregas_muebles.proyecto_id IS
  'RETIRADA DEL MODELO (22-sep-2026): se conserva con sus valores, sin lectores nuevos. La tienda vive en tienda_codigo.';
COMMENT ON COLUMN mk_adjuntos.tienda_codigo IS
  'Marketing (22-sep-2026): las fotos se pegan a la TIENDA, ya no al proyecto. Copiado del proyecto al nacer la columna.';

-- ── PASO 2 — COPIAR la tienda del proyecto (nunca mover, nunca pisar) ──────
-- Solo donde todavía no hay tienda y el proyecto SÍ la tiene. Correr esto dos
-- veces no hace nada la segunda vez.
UPDATE mk_facturas f
   SET tienda_codigo = p.tienda_codigo
  FROM mk_proyectos p
 WHERE p.id = f.proyecto_id
   AND f.tienda_codigo IS NULL
   AND p.tienda_codigo IS NOT NULL;

UPDATE mk_entregas_muebles e
   SET tienda_codigo = p.tienda_codigo
  FROM mk_proyectos p
 WHERE p.id = e.proyecto_id
   AND e.tienda_codigo IS NULL
   AND p.tienda_codigo IS NOT NULL;

UPDATE mk_adjuntos a
   SET tienda_codigo = p.tienda_codigo
  FROM mk_proyectos p
 WHERE p.id = a.proyecto_id
   AND a.tienda_codigo IS NULL
   AND p.tienda_codigo IS NOT NULL;

-- ── PASO 3 — ÍNDICES para leer por tienda (lo que hace la vista de tienda) ──
CREATE INDEX IF NOT EXISTS mk_facturas_tienda_idx
  ON mk_facturas (tienda_codigo) WHERE anulado_en IS NULL;
CREATE INDEX IF NOT EXISTS mk_entregas_muebles_tienda_idx
  ON mk_entregas_muebles (tienda_codigo);
CREATE INDEX IF NOT EXISTS mk_adjuntos_tienda_idx
  ON mk_adjuntos (tienda_codigo);

-- ── PASO 4 — LO QUE SE RETIRA DEL MODELO SE ROTULA, NUNCA SE DROPEA ────────
COMMENT ON TABLE mk_proyecto_marcas IS
  'RETIRADA (22-sep-2026): la marca POR PROYECTO del modelo viejo. Sin lectores ni escritores en la app; sus 5 filas se conservan (patrón mayor_lineas). La marca es del GASTO: mk_factura_marcas (una por factura) y mk_entregas_muebles.total_por_marca.';
COMMENT ON TABLE mk_proyectos IS
  'RETIRADA DEL MODELO (22-sep-2026): «a) Basta la tienda». Se conserva entera; el gasto lleva su tienda_codigo y su nota. Nada se borra: los proyectos vacíos y los duplicados los limpia la secretaria desde el módulo nuevo.';

-- ── PASO 5 — VERIFICACIÓN: no se perdió una fila ni una tienda ──────────────
DO $$
DECLARE
  v_fact int; v_ent int; v_adj int; v_mal int;
BEGIN
  SELECT count(*) INTO v_fact FROM mk_facturas;
  SELECT count(*) INTO v_ent FROM mk_entregas_muebles;
  SELECT count(*) INTO v_adj FROM mk_adjuntos;
  -- Ninguna fila con proyecto CON tienda puede haber quedado sin la suya.
  SELECT count(*) INTO v_mal FROM mk_facturas f
    JOIN mk_proyectos p ON p.id = f.proyecto_id
   WHERE p.tienda_codigo IS NOT NULL AND f.tienda_codigo IS NULL;
  IF v_mal > 0 THEN
    RAISE EXCEPTION 'Quedaron % facturas con proyecto con tienda y sin tienda_codigo: se aborta.', v_mal;
  END IF;
  RAISE NOTICE 'Listo: mk_facturas % · mk_entregas_muebles % · mk_adjuntos % (mismas filas que antes)', v_fact, v_ent, v_adj;
END $$;
