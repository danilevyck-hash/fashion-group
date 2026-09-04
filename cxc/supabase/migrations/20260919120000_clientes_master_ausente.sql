-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: clientes_master — marca de clientes AUSENTES en Switch
-- (espejo de switch_clientes.ausente_desde, DDL 20260723110000).
--
-- PROBLEMA (medido el 4-sep-2026): cuando Switch deja de mandar un cliente,
-- `switch_clientes` SÍ lo nota (activo=false + ausente_desde, lo escribe
-- sync-empresa.ts con guard de lista completa). Pero `clientes_master` —el
-- directorio que lee el ClientePicker de Guías, Cheques y compañía— se
-- refresca con un upsert puro que agrega y actualiza y NUNCA marca lo que
-- dejó de llegar. Un cliente entraba al directorio para siempre. Hoy son 2:
-- D-30 «City Moda Chorrera» y D-135 «Rey Store (Aguas)», activo=false en las
-- 6 empresas del grupo.
--
-- POR QUÉ UNA COLUMNA NUEVA Y NO `deleted`: `deleted` significa "no existe
-- para el sistema" — lo filtran el índice UNIQUE parcial de
-- nombre_normalized, las vistas de 12 meses, los backfills de guías y
-- cheques, y la ficha contesta 404. Un ausente de Switch tiene que SEGUIR
-- existiendo (su nombre en guías viejas, su ficha con rótulo); lo único que
-- pierde es OFRECERSE en los selectores. Reusar `deleted` cambiaría el
-- significado de una columna que ya leen otras superficies.
--
-- SEMÁNTICA: NULL = Switch lo sigue mandando (o todavía no sabemos).
--            timestamptz = ninguna de las 6 empresas del grupo lo manda;
--            el valor es el ausente_desde más reciente de switch_clientes
--            (cuándo lo dejó de mandar la última empresa).
--
-- QUIÉN LA ESCRIBE: SOLO sync-clientes-master.ts (marca y desmarca en cada
-- corrida — si Switch lo vuelve a mandar, vuelve solo). La protección contra
-- "un fallo de Switch vacía el directorio" está en el código: solo se marca
-- con el espejo leído COMPLETO y con datos de `activo`, que a su vez solo
-- cambia con una lista de Switch completa y no vacía.
--
-- El código ya deployado es TOLERANTE a la ausencia de esta columna (el
-- selector y el sync siguen funcionando igual que hoy) — correr esta DDL
-- cuando se pueda, sin coordinar con el deploy.
--
-- Aplicar con: npm run migrar supabase/migrations/20260919120000_clientes_master_ausente.sql
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE clientes_master
  ADD COLUMN IF NOT EXISTS ausente_desde timestamptz;

COMMENT ON COLUMN clientes_master.ausente_desde IS
  'Ninguna de las 6 empresas del grupo manda ya este cliente en /apicliente/lista de Switch (espejo del ausente_desde mas reciente de switch_clientes). NULL = vivo. La fila se conserva: guias y facturas viejas siguen mostrando su nombre; solo deja de ofrecerse en los selectores. La escribe solo sync-clientes-master.';
