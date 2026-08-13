-- ═══════════════════════════════════════════════════════════════════════════
-- LAS ANOTACIONES DEL CXC SE SEPARAN POR CARTERA (13-ago-2026)
--
-- LA REGLA, dicha por Daniel, textual:
--   "debe de ser cxc de fashion group y otro aparte de boston, no deben de ni
--    convivir juntos."
--
-- El #522 sacó a Boston de todas las superficies de PLATA desde la base. Lo
-- último que unía las dos carteras eran estas tres tablas de ANOTACIONES, que
-- se atan al cliente por `nombre_normalized` y a nada más:
--
--     cxc_favorites          la estrella ⭐, por usuario
--     cxc_client_overrides   los datos de contacto cargados a mano
--     cxc_contact_log        la bitácora de llamadas/correos de cobro
--
-- Sobre `CITY MALL PASO CANOA`, que existe en las dos carteras, Daniel dijo:
--   "es la misma persona, pero no lo quiero ver en fashion group porque no
--    tiene el mismo codigo"
-- y entre "compartido" y "separado" eligió SEPARADO: cada cartera con sus
-- propias notas y estrellas.
--
-- ───────────────────────────────────────────────────────────────────────────
-- POR QUÉ EL DEFAULT 'grupo' NO LE CAMBIA EL DUEÑO A NADIE — MEDIDO
--
-- Antes de escribir esta migración se midió contra producción (13-ago-2026,
-- `scripts/_diag-cxc-cartera.ts`, solo lectura):
--
--     cxc_favorites          0 filas          ← la tabla está VACÍA
--     cxc_client_overrides   10 filas         22-mar-2026
--     cxc_contact_log        141 filas        22-mar-2026 → 16-abr-2026
--
-- Las 151 filas son TODAS de Fashion Group, y no por parecido sino porque
-- **Boston nunca pudo escribir ahí**:
--
--   · La pestaña de Boston (`src/components/cxc/BostonTab.tsx`) nació el
--     28-jul-2026 (#347) — TRES MESES DESPUÉS de la fila más nueva (16-abr).
--   · En toda su historia de git nunca tocó favoritos ni la bitácora, y su
--     API `/api/cxc/boston` solo exporta GET: no hay verbo de escritura.
--   · Los ÚNICOS caminos que escriben estas tablas son el panel del grupo
--     (`/admin`) y Cheques (`/api/overrides`), los dos del grupo.
--
-- Por eso `DEFAULT 'grupo'` backfilea las 151 filas en la MISMA sentencia que
-- agrega la columna, y NINGUNA fila se pierde ni cambia de dueño. **No quedó
-- ninguna fila ambigua**: no hay nada que reportar aparte.
--
-- ⚠️ DATO PARA DANIEL, no un problema de esta migración: 26 de las 141 filas
-- de `cxc_contact_log` caen sobre nombres que HOY solo existen en la cartera
-- de Boston (CEMENTO CHAGRES, NIPMAR SA, SAYERET SECURITY, VENAO PADEL CLUB y
-- la propia CONFECCIONES BOSTON). Se escribieron desde el panel del grupo
-- cuando ese panel todavía mostraba esos clientes. **Se CONSERVAN en 'grupo'**
-- —es de donde vienen, y borrarlas o mudarlas sería adivinar—, y desde el #522
-- ya no se ven en el panel porque el panel solo muestra clientes del grupo.
--
-- ───────────────────────────────────────────────────────────────────────────
-- POR QUÉ LAS LLAVES ÚNICAS TIENEN QUE LLEVAR LA CARTERA ADENTRO
--
-- Agregar la columna sin tocar los UNIQUE dejaría el arreglo a medias, y de la
-- peor forma: la columna diría que están separadas y la base seguiría
-- impidiéndolo. Con `UNIQUE(user_id, nombre_normalized)`, marcar CITY MALL
-- PASO CANOA en Boston chocaría contra la fila del grupo; con
-- `UNIQUE(nombre_normalized)` en overrides, el upsert de una cartera PISARÍA
-- la ficha de contacto de la otra en silencio.
--
-- ───────────────────────────────────────────────────────────────────────────
-- ADITIVA, Y LA APP YA FUNCIONA SIN ELLA
--
-- La corre Daniel A MANO. El código desplegado usa el patrón `cols-opcionales`
-- (`src/lib/cxc/anotaciones.ts`): si la columna no existe, la cartera del
-- GRUPO lee y escribe como hoy —que es exacto, porque hoy todo es del grupo— y
-- la de Boston lee vacío y avisa al escribir en vez de guardar en la cartera
-- equivocada. Antes y después de correr esto, el panel del grupo y la pestaña
-- de Boston muestran los MISMOS totales y tramos: acá no se toca un centavo.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. La columna, con el backfill adentro ────────────────────────────────
-- NOT NULL + DEFAULT en la misma sentencia: Postgres llena las filas viejas
-- con 'grupo' sin una segunda pasada, así que no hay ventana en la que la
-- columna exista vacía y un lector filtrando por cartera vea la tabla en cero.
ALTER TABLE cxc_favorites
  ADD COLUMN IF NOT EXISTS cartera text NOT NULL DEFAULT 'grupo';
ALTER TABLE cxc_client_overrides
  ADD COLUMN IF NOT EXISTS cartera text NOT NULL DEFAULT 'grupo';
ALTER TABLE cxc_contact_log
  ADD COLUMN IF NOT EXISTS cartera text NOT NULL DEFAULT 'grupo';

-- ── 2. Solo existen DOS carteras ──────────────────────────────────────────
-- Sin el CHECK, un typo ('bostón', 'Boston', 'gruppo') crea una tercera
-- cartera invisible: las filas se guardan bien y no las lee NADIE, que es la
-- forma más silenciosa de perder una nota.
DO $chk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cxc_favorites_cartera_check') THEN
    ALTER TABLE cxc_favorites ADD CONSTRAINT cxc_favorites_cartera_check
      CHECK (cartera IN ('grupo', 'boston'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cxc_client_overrides_cartera_check') THEN
    ALTER TABLE cxc_client_overrides ADD CONSTRAINT cxc_client_overrides_cartera_check
      CHECK (cartera IN ('grupo', 'boston'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cxc_contact_log_cartera_check') THEN
    ALTER TABLE cxc_contact_log ADD CONSTRAINT cxc_contact_log_cartera_check
      CHECK (cartera IN ('grupo', 'boston'));
  END IF;
END
$chk$;

-- ── 3. Las llaves únicas, ahora CON la cartera adentro ────────────────────
-- Los UNIQUE viejos se descubren por su DEFINICIÓN (qué columnas cubren), no
-- por su nombre: `cxc_client_overrides.nombre_normalized` se declaró inline
-- (`text unique not null`) y `cxc_contact_log` ni siquiera está en el repo —
-- se creó a mano. Buscar por nombre adivinado dejaría el UNIQUE viejo puesto
-- y la separación no funcionaría, sin que nada avisara.
DO $uk$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT con.conname, con.conrelid::regclass::text AS tabla
    FROM pg_constraint con
    JOIN pg_class    rel ON rel.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    WHERE ns.nspname = 'public'
      AND con.contype = 'u'
      AND rel.relname IN ('cxc_favorites', 'cxc_client_overrides', 'cxc_contact_log')
      -- Solo los que NO incluyen `cartera`: si esta migración ya corrió, los
      -- nuevos se dejan en paz y el bloque es un no-op.
      AND NOT EXISTS (
        SELECT 1 FROM unnest(con.conkey) AS k(attnum)
        JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
        WHERE a.attname = 'cartera'
      )
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', c.tabla, c.conname);
    RAISE NOTICE 'UNIQUE viejo retirado: %.%', c.tabla, c.conname;
  END LOOP;
END
$uk$;

-- Índices únicos nuevos. `IF NOT EXISTS` para que reejecutar sea inofensivo.
CREATE UNIQUE INDEX IF NOT EXISTS cxc_favorites_cartera_user_nombre_uk
  ON cxc_favorites (cartera, user_id, nombre_normalized);

CREATE UNIQUE INDEX IF NOT EXISTS cxc_client_overrides_cartera_nombre_uk
  ON cxc_client_overrides (cartera, nombre_normalized);

-- ── 4. Índices de lectura ─────────────────────────────────────────────────
-- Toda lectura del código arranca por `cartera`, así que va PRIMERA en el
-- índice; los índices viejos por `nombre_normalized` solo no se usarían.
CREATE INDEX IF NOT EXISTS cxc_contact_log_cartera_nombre_idx
  ON cxc_contact_log (cartera, nombre_normalized, contacted_at DESC);

CREATE INDEX IF NOT EXISTS cxc_client_overrides_cartera_idx
  ON cxc_client_overrides (cartera);

-- ── 5. Dejar dicho qué es esto, en la base ────────────────────────────────
COMMENT ON COLUMN cxc_favorites.cartera IS
  'grupo = las 6 empresas de Fashion Group · boston = confecciones_boston. Las dos carteras NO comparten anotaciones (regla de Daniel, 12-ago-2026).';
COMMENT ON COLUMN cxc_client_overrides.cartera IS
  'grupo = las 6 empresas de Fashion Group · boston = confecciones_boston. Las dos carteras NO comparten anotaciones (regla de Daniel, 12-ago-2026).';
COMMENT ON COLUMN cxc_contact_log.cartera IS
  'grupo = las 6 empresas de Fashion Group · boston = confecciones_boston. Las dos carteras NO comparten anotaciones (regla de Daniel, 12-ago-2026).';

COMMIT;

-- ── VERIFICACIÓN (no escribe nada; correr después) ────────────────────────
-- Las 3 tablas tienen que quedar 100% en 'grupo', con los mismos totales de
-- antes: 0 favoritos, 10 overrides, 141 contactos.
--
--   SELECT 'cxc_favorites' AS tabla, cartera, count(*) FROM cxc_favorites GROUP BY 1,2
--   UNION ALL
--   SELECT 'cxc_client_overrides', cartera, count(*) FROM cxc_client_overrides GROUP BY 1,2
--   UNION ALL
--   SELECT 'cxc_contact_log', cartera, count(*) FROM cxc_contact_log GROUP BY 1,2
--   ORDER BY 1, 2;
