-- ═════════════════════════════════════════════════════════════════════════════
-- proveedor_amarre — UN PROVEEDOR, UNA FILA. La lista escrita a mano.
-- ═════════════════════════════════════════════════════════════════════════════
-- 🩸 El problema, MEDIDO contra producción el 6-sep-2026:
--   · `switch_proveedor_estadocuenta` tiene 65 filas y $5,199,705.82 por pagar.
--     La pantalla las agrupa por NOMBRE normalizado y dibuja **47 filas**.
--   · **Confecciones Boston llega en CUATRO grafías** repartidas en 5 empresas
--     (`CONFECCIONES BOSTON` · `CONFECCIONES BOSTON  S.A` con dos espacios ·
--     `CONFECCIONES BOSTON S A` · `CONFECCIONES BOSTON S.A`) → la pantalla lo
--     parte en TRES filas que suman $4,165.96 y ninguna dice que las otras
--     existen. Contestar «¿cuánto le debo?» cuesta 11 toques y 5 pantallas.
--
-- 🔴 LA CÉDULA NO DECIDE. Daniel, textual (6-sep-2026):
--     «no te fijes por la cédula, solo por nombre para saber cuáles son iguales»
--   De los seis grupos de filas que comparten identificación, **TRES son
--   empresas distintas** y quedan escritas abajo para que nadie las una nunca.
--   Y al revés: el proveedor más grande del grupo (American Fashion Wear,
--   $3,633,293.25) tiene DOS cédulas que difieren en un guion — unir por cédula
--   lo partiría en dos. Es el mismo camino que ya se usó con las grafías de
--   Reynaldo en Comisiones (`comision_vendedor_alias`): lista a mano, revisada
--   una por una. **Nada por parecido.**
--
-- 🔴 EL GRANO ES `(empresa_key, proveedor_switch_id)`:
--   · El código SOLO no es identidad — medido: **10 códigos nombran proveedores
--     distintos según la empresa** (`122` es American Fashion Wear en Fashion
--     Wear y Latin Fitness Group en Active Shoes).
--   · El par `(empresa_key, codigo)` sí distingue las 65 filas de hoy, pero
--     `codigo` es NULLABLE y lo teclea una persona en Switch.
--   · `(empresa_key, proveedor_switch_id)` es la UNIQUE de la tabla, la llave
--     del upsert del sync y la de su purga, y nunca es nula. 65 pares para 65
--     filas.
--
-- ⚠️ `switch_proveedor_estadocuenta` **no tiene soft delete**: el sync hace un
-- DELETE real de los proveedores que Switch ya no lista. Por eso el amarre vive
-- en su propia tabla y no cuelga de esas filas — si un proveedor se cae del
-- estado de cuenta y vuelve, su amarre sigue ahí.
--
-- Qué cambia, medido (`scripts/_medir-proveedores-amarre.mjs`):
--   · La lista pasa de **47 filas a 43** (34 con saldo → 31).
--   · El total **NO se mueve ni un centavo**: $5,199,705.82 antes y después.
--     Esto solo reagrupa; ninguna fila se crea, se borra ni cambia de monto.
--   · Confecciones Boston: de 3 filas a **UNA**, $4,165.96, 5 empresas.
--
-- ⚠️ MIGRACIÓN ADITIVA. Ni una fila de ninguna otra tabla cambia de valor. El
-- código NO depende de ella: sin esta tabla la lectura falla abierto y la
-- pantalla queda EXACTA a la de antes.
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── 1) La tabla ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS proveedor_amarre (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 🔴 LA LLAVE: la fila REAL del estado de cuenta que este amarre resuelve.
  empresa_key          text    NOT NULL,
  proveedor_switch_id  integer NOT NULL,

  -- Documentación, NO llave: para que la fila se pueda leer sin abrir Switch.
  -- Nada las usa para parear; si Switch cambia el código o la grafía, el
  -- amarre sigue valiendo porque cuelga del id.
  codigo               text,
  nombre_switch        text    NOT NULL,

  -- El proveedor al que pertenece. Normalizado igual que `normProvName`:
  -- MAYÚSCULAS, sin puntos ni comas, espacios colapsados.
  proveedor_canonico   text    NOT NULL,
  -- Cómo se escribe en pantalla. NULL = la grafía más larga, como siempre.
  -- Siempre una grafía REAL de Switch: acá no se inventan nombres.
  nombre_mostrado      text,

  -- Soft delete FIRMADO. Nunca DELETE: esta tabla es la memoria de una decisión.
  activo               boolean NOT NULL DEFAULT true,
  creado_por           text    NOT NULL DEFAULT 'migracion',
  creado_en            timestamptz NOT NULL DEFAULT now(),
  desactivado_por      text,
  desactivado_en       timestamptz,

  CONSTRAINT proveedor_amarre_canonico_normalizado CHECK (
    proveedor_canonico = UPPER(BTRIM(proveedor_canonico))
    AND proveedor_canonico NOT LIKE '%.%'
    AND proveedor_canonico NOT LIKE '%,%'
    AND proveedor_canonico NOT LIKE '%  %'
    AND proveedor_canonico <> ''
  ),
  CONSTRAINT proveedor_amarre_baja_firmada CHECK (
    activo OR (desactivado_por IS NOT NULL AND desactivado_en IS NOT NULL)
  )
);

-- Única ENTRE ACTIVAS: una fila real cae en un solo proveedor a la vez, y el
-- historial de lo que se decidió antes se conserva.
CREATE UNIQUE INDEX IF NOT EXISTS proveedor_amarre_fila_activa_idx
  ON proveedor_amarre (empresa_key, proveedor_switch_id)
  WHERE activo;

CREATE INDEX IF NOT EXISTS proveedor_amarre_canonico_idx
  ON proveedor_amarre (proveedor_canonico) WHERE activo;

ALTER TABLE proveedor_amarre ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'proveedor_amarre' AND policyname = 'service_role_all'
  ) THEN
    CREATE POLICY service_role_all ON proveedor_amarre
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE ON proveedor_amarre TO service_role;

COMMENT ON TABLE proveedor_amarre IS
  'Qué filas de switch_proveedor_estadocuenta son el MISMO proveedor. Lista escrita '
  'a mano y revisada una por una por Daniel (6-sep-2026): «no te fijes por la cédula, '
  'solo por nombre para saber cuáles son iguales». Grano (empresa_key, proveedor_switch_id) '
  'porque 10 códigos nombran proveedores distintos según la empresa. Nada por parecido, '
  'nada por cédula. Soft delete firmado, nunca DELETE.';

COMMENT ON COLUMN proveedor_amarre.proveedor_switch_id IS
  'La UNIQUE real de switch_proveedor_estadocuenta. El amarre cuelga de acá y no del '
  'código ni del nombre, que en Switch los teclea una persona.';

COMMENT ON COLUMN proveedor_amarre.nombre_mostrado IS
  'Cómo se escribe en pantalla. Siempre una grafía REAL de Switch; acá no se inventan '
  'nombres. NULL = la más larga de las que llegaron.';

-- ─── 2) La función de la base (espejo de `aplicarAmarre` en Node) ───────────
-- Con amarre devuelve el proveedor escrito a mano; sin amarre, el nombre
-- normalizado — exactamente lo que se agrupaba antes de que esto existiera.
CREATE OR REPLACE FUNCTION proveedor_canonico(
  p_empresa_key text,
  p_proveedor_switch_id integer,
  p_nombre text
)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT a.proveedor_canonico
       FROM proveedor_amarre a
      WHERE a.activo
        AND a.empresa_key = p_empresa_key
        AND a.proveedor_switch_id = p_proveedor_switch_id),
    BTRIM(REGEXP_REPLACE(TRANSLATE(UPPER(BTRIM(p_nombre)), '.,', ''), '\s+', ' ', 'g'))
  );
$$;

GRANT EXECUTE ON FUNCTION proveedor_canonico(text, integer, text) TO service_role;

COMMENT ON FUNCTION proveedor_canonico(text, integer, text) IS
  'Fila del estado de cuenta → proveedor. Espejo exacto de aplicarAmarre() en '
  'src/lib/proveedores/identidad.ts. Sin amarre, el nombre normalizado de siempre.';

-- ─── 3) Los CUATRO grupos que Daniel confirmó, uno por uno ──────────────────
-- 🔴 SOLO ESTOS CUATRO. Cualquier otro par de filas que se parezca —o que
-- comparta cédula— se queda separado hasta que Daniel lo diga.
--
-- 1. ACTIVE WEAR      — $52,479.52 · Active Shoes + Multifashion
-- 2. GRUPO J NAVARRO  — $0.00      · Active Shoes + Vistana
-- 3. CONFECCIONES BOSTON — $4,165.96 · sus 4 grafías en 5 empresas
-- 4. LATIN FITNESS GROUP — $288,358.84 · 4 empresas
--
-- Los ids son los de producción, medidos el 6-sep-2026. El INSERT es idempotente
-- por el índice parcial de arriba.
INSERT INTO proveedor_amarre
  (empresa_key, proveedor_switch_id, codigo, nombre_switch, proveedor_canonico, nombre_mostrado)
VALUES
  -- 1) ACTIVE WEAR — misma cédula 155727673-2-2022, y acá SÍ es la misma.
  --    Ya caían juntas por la normalización de puntos y comas; quedan escritas
  --    para que un cambio de grafía en Switch no las vuelva a separar.
  ('american_classic', 11, '120', 'ACTIVE WEAR SA',    'ACTIVE WEAR SA', 'ACTIVE WEAR, S.A.'),
  ('active_shoes',      9, '129', 'ACTIVE WEAR, S.A.', 'ACTIVE WEAR SA', 'ACTIVE WEAR, S.A.'),

  -- 2) GRUPO J NAVARRO — cédula 2023672-1-743774 en las dos. Las dos en $0.00.
  ('active_shoes',      8, '118',  'GRUPO J NAVARRO',       'GRUPO J NAVARRO', 'GRUPO J NAVARRO, S.A.'),
  ('vistana',          10, '1710', 'GRUPO J NAVARRO, S.A.', 'GRUPO J NAVARRO', 'GRUPO J NAVARRO, S.A.'),

  -- 3) CONFECCIONES BOSTON — 4 grafías, 5 empresas, $4,165.96.
  --    ⚠️ `FASHION WEAR, INC` (Multifashion, id 2, $76,165.72) comparte la
  --    cédula 655-544-133465 y NO entra: ver el bloque de abajo.
  ('joystep',           3, '123',  'CONFECCIONES BOSTON',      'CONFECCIONES BOSTON', 'CONFECCIONES BOSTON S.A'),
  ('vistana',           9, '179',  'CONFECCIONES BOSTON',      'CONFECCIONES BOSTON', 'CONFECCIONES BOSTON S.A'),
  ('fashion_wear',     13, '5',    'CONFECCIONES BOSTON  S.A', 'CONFECCIONES BOSTON', 'CONFECCIONES BOSTON S.A'),
  ('american_classic', 21, '1321', 'CONFECCIONES BOSTON S A',  'CONFECCIONES BOSTON', 'CONFECCIONES BOSTON S.A'),
  ('active_shoes',      4, '124',  'CONFECCIONES BOSTON S.A',  'CONFECCIONES BOSTON', 'CONFECCIONES BOSTON S.A'),

  -- 4) LATIN FITNESS GROUP — sin cédula en 3 de las 4 filas (la cuarta trae
  --    «0»); es justamente el grupo que la cédula NO podría haber encontrado.
  ('active_shoes',      2, '122',  'LATIN FITNESS GROUP',      'LATIN FITNESS GROUP', 'LATIN FITNESS GROUP INC.'),
  ('active_wear',       3, '113',  'LATIN FITNESS GROUP',      'LATIN FITNESS GROUP', 'LATIN FITNESS GROUP INC.'),
  ('vistana',           5, '115',  'LATIN FITNESS GROUP',      'LATIN FITNESS GROUP', 'LATIN FITNESS GROUP INC.'),
  ('american_classic', 10, '1110', 'LATIN FITNESS GROUP INC.', 'LATIN FITNESS GROUP', 'LATIN FITNESS GROUP INC.')
ON CONFLICT DO NOTHING;

-- ─── 4) LOS QUE **NO** SON EL MISMO, aunque Switch les puso la misma cédula ──
-- 🔴 Queda escrito acá, en la base, para que la próxima persona que vea la
-- cédula repetida no los junte. Daniel los revisó uno por uno el 6-sep-2026:
--
--   · 655-544-133465 → `CONFECCIONES BOSTON` y `FASHION WEAR, INC` ($76,165.72
--     en Multifashion). Daniel: «fashion wear no es boston».
--   · 40254-103-278837 → `CIF EXPRESS SA.` ($1,530.36) y
--     `Luis Alberto Torres De Gracias` ($2,214.90), las dos en Fashion Wear.
--     Daniel: «son diferentes».
--   · 155727670-2-2022 → `ACTIVE SHOES S.A` (Multifashion, −$2,032.57) y
--     `BDL SERVICES INC` (Active Shoes, $0.00). Daniel: «son diferentes».
--
-- En los tres casos **Switch tiene la cédula mal**. No se arregla desde este
-- sistema; queda anotado para quien mantenga Switch.
COMMENT ON COLUMN proveedor_amarre.proveedor_canonico IS
  'El proveedor al que pertenece esta fila. 🔴 NUNCA se deduce de la cédula: 655-544-133465 '
  'la comparten Confecciones Boston y FASHION WEAR, INC, que NO son la misma («fashion wear '
  'no es boston»); 40254-103-278837 la comparten CIF EXPRESS y Luis Alberto Torres; '
  '155727670-2-2022 la comparten ACTIVE SHOES y BDL SERVICES. Y American Fashion Wear tiene '
  'DOS cédulas por un guion de más. Switch las tiene mal; acá se decide por nombre, a mano.';
