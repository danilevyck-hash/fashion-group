-- ─────────────────────────────────────────────────────────────────────────────
-- MARKETING — EL REDISEÑO, PIEZA 2 DE 2: EL PERÍODO SE CIERRA CON SU NOMBRE Y
-- SU NOTA DE CRÉDITO, Y CADA ZIP QUE SE BAJA QUEDA ANOTADO (22-sep-2026).
-- ADITIVA. NO BORRA NI CAMBIA UN SOLO VALOR QUE EXISTA.
--
-- Lo que Daniel definió:
--   · Dos estados y nada más: Abierto → Cerrado. *«no quiero pipeline, cuando
--     lo cierro es porque lo cobré»*. Cerrar = llegó la nota de crédito.
--   · Al cerrar LE PONE EL NOMBRE ÉL (`nombre_al_cerrar`) y el siguiente se
--     abre solo.
--   · Nota de crédito: campo opcional, TEXTO, **sin ningún cálculo**. Daniel:
--     *«si te respondo que sí al 50 % harás toda una cosa innecesariamente»*.
--     Por eso es `text` y no `numeric`: para que nadie pueda restarla.
--   · El ZIP se baja cuando se quiera desde el período abierto y SE GUARDA
--     cada ZIP que se bajó. Cerrar no genera nada.
--
-- 🩸 MEDIDO EL 22-SEP-2026: `mk_periodos` tiene 6 filas —«mid 2026» (pvh,
-- cerrado por la migración de agosto) y 5 «Período 2026» abiertos (TH, CK, KL,
-- RBK, J)— y `reporte` está en NULL en las 6. Ningún ZIP quedó guardado nunca.
--
-- 🔴 EL REGISTRO DE ZIPs ES UNA COLUMNA, NO UNA TABLA. Una tabla nueva tiene
-- que entrar al respaldo (`backup-nada-sin-copia`) y el respaldo AVISA por
-- Telegram cada día que una tabla de su lista no existe: mientras Daniel no
-- aplique esto, sonaría a diario. Una lista `jsonb` en `mk_periodos` viaja con
-- el período, se respalda con él y no existe hasta que exista. Es append-only:
-- `lib/marketing/periodo-estado.ts` › `anotarZip` solo agrega al final. El
-- archivo va al bucket privado `marketing`, bajo `periodos/<id>/`.
--
-- 🔴 EL CÓDIGO FALLA ABIERTO SIN ESTO (`lib/marketing/columnas-opcionales.ts`
-- › `completarPeriodo`): sin las columnas, el cierre y el ZIP se portan como
-- hoy. `estado`, `nombre`, `reporte` y el índice «uno abierto por marca» no se
-- tocan.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE mk_periodos
  ADD COLUMN IF NOT EXISTS nombre_al_cerrar text,
  ADD COLUMN IF NOT EXISTS nota_credito     text,
  ADD COLUMN IF NOT EXISTS zips_bajados     jsonb NOT NULL DEFAULT '[]'::jsonb;

-- La lista tiene que ser una LISTA. Un objeto suelto rompería `anotarZip`.
-- Sin DROP: si ya está, se deja como está.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mk_periodos_zips_bajados_lista_chk'
  ) THEN
    ALTER TABLE mk_periodos
      ADD CONSTRAINT mk_periodos_zips_bajados_lista_chk
      CHECK (jsonb_typeof(zips_bajados) = 'array');
  END IF;
END $$;

COMMENT ON COLUMN mk_periodos.nombre_al_cerrar IS
  'Marketing (22-sep-2026): el nombre que Daniel le pone al cerrar; es lo que la marca reconoce. NULL mientras está abierto. `nombre` sigue siendo el de apertura (por defecto «Desde el …»).';
COMMENT ON COLUMN mk_periodos.nota_credito IS
  'Marketing (22-sep-2026): la nota de crédito con la que se cobró. TEXTO libre y opcional; NO es un número y no entra en ningún cálculo, a propósito.';
COMMENT ON COLUMN mk_periodos.zips_bajados IS
  'Marketing (22-sep-2026): cada ZIP que se bajó de este período, en orden: [{bajado_en, bajado_por, gastos, monto, archivo_path}]. Append-only; el archivo vive en el bucket privado marketing bajo periodos/<id>/.';
COMMENT ON COLUMN mk_periodos.reporte IS
  'Se guardaba al cerrar y quedó NULL en las 6 filas (medido 22-sep-2026). Desde el rediseño el papel se anota en zips_bajados cada vez que se baja; esta columna se conserva y no se escribe.';

-- Verificación: las 6 filas siguen ahí, con su estado.
DO $$
DECLARE v_n int; v_abiertos int;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE estado = 'abierto') INTO v_n, v_abiertos FROM mk_periodos;
  RAISE NOTICE 'mk_periodos: % filas (% abiertas), nombre_al_cerrar / nota_credito / zips_bajados listas', v_n, v_abiertos;
END $$;
