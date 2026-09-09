-- ═════════════════════════════════════════════════════════════════════════════
-- transportistas — PODER AGREGAR UNO NUEVO, Y PODER QUITARLO (9-sep-2026)
-- ═════════════════════════════════════════════════════════════════════════════
-- Daniel, textual: *«Ponme opción en configuración de guía para poder agregar
-- un transportista nuevo.»*
--
-- 🩸 Por qué existe. Los SEIS transportistas de la lista se sembraron el
-- 26-may-2026 y desde entonces NADIE pudo agregar uno: no había pantalla, ni
-- botón, ni ruta de alta. Medido contra producción el 9-sep-2026 sobre las 227
-- guías vivas:
--
--     RedNblue 53 · Boston 30 · Edwin 29 · Mojica 17 · Transporte Sol 16 ·
--     Sanjur 14   (los seis, todos creados el mismo 26-may-2026)
--
-- Y por no poder agregarlos, se escribieron A MANO en el campo de texto de la
-- guía, saltándose la lista: «NUÑEZ GLOBAL SOLUTIONS» (24-abr) · «CITY MODA» y
-- «SPORTING SHOES» (13-may) · «LUTY LUI» (14-may) · y uno que dice literalmente
-- «no» (16-abr). Es el mismo cuento del destino «hola» que vivía en un solo
-- navegador.
--
-- 🔴 NINGUNO DE LOS CINCO ENTRA A LA LISTA. Cuatro son nombres de CLIENTE, no
-- de transportista, y el quinto dice «no». Esta migración **no siembra nada** y
-- **no toca ni una guía**: sus cinco guías viejas se quedan exactamente como
-- están, con el nombre que tienen escrito.
--
-- ⚠️ Las 63 guías con el transportista VACÍO son las de **Entrega directa**
-- (nuestro propio camión, que no lleva transportista). Están bien así.
--
-- 🔴 SOFT DELETE FIRMADO, NUNCA DELETE — el mismo patrón que
-- `guias_destino_lista` y `guias_destino_cliente`. La tabla ya tenía `activo`;
-- lo que faltaba era la FIRMA (quién y cuándo) y el candado de que no se pueda
-- ofrecer dos veces el mismo nombre. Un transportista quitado deja de
-- ofrecerse, pero **las guías viejas siguen diciendo su nombre**: la guía
-- apunta a la fila por id y la fila se queda para siempre.
--
-- 🔴 ADITIVA: solo agrega columnas y un índice. Ni un UPDATE, ni un DELETE, ni
-- una fila nueva. El código de hoy sigue funcionando sin ella (la alta contesta
-- «falta correr la migración» y el resto de Guías no se entera).
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── 1) La firma del alta ────────────────────────────────────────────────────
-- Con DEFAULT: las 6 filas del 26-may-2026 quedan como 'sistema' sin un UPDATE.
ALTER TABLE transportistas
  ADD COLUMN IF NOT EXISTS creado_por text NOT NULL DEFAULT 'sistema';

-- ─── 2) La firma de la BAJA ──────────────────────────────────────────────────
ALTER TABLE transportistas
  ADD COLUMN IF NOT EXISTS desactivado_por text,
  ADD COLUMN IF NOT EXISTS desactivado_en  timestamptz;

-- El nombre no puede quedar vacío ni con bordes: es lo único que se imprime.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transportistas_nombre_no_vacio'
  ) THEN
    ALTER TABLE transportistas
      ADD CONSTRAINT transportistas_nombre_no_vacio
      CHECK (nombre = BTRIM(nombre) AND nombre <> '');
  END IF;
END $$;

-- Una desactivación se FIRMA: sin quién ni cuándo, no hay soft delete.
-- Las 6 filas de hoy están activas, así que el CHECK las acepta tal cual.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transportistas_baja_firmada'
  ) THEN
    ALTER TABLE transportistas
      ADD CONSTRAINT transportistas_baja_firmada
      CHECK (activo OR (desactivado_por IS NOT NULL AND desactivado_en IS NOT NULL));
  END IF;
END $$;

-- ─── 3) Único entre ACTIVOS ──────────────────────────────────────────────────
-- El mismo transportista no puede ofrecerse dos veces a la vez, pero sí pudo
-- quitarse y volver: entonces se REVIVE la fila (activo = true), no se crea una
-- segunda. Los 6 nombres de hoy son distintos entre sí: el índice entra limpio.
-- ⚠️ Este índice compara el TEXTO EXACTO; que «RedNblue» y «REDNBLUE» no
-- convivan lo decide el servidor con la clave normalizada (la MISMA regla de
-- los destinos), antes de insertar. Acá no se puede: la clave exige quitar
-- acentos y separar los dígitos.
CREATE UNIQUE INDEX IF NOT EXISTS transportistas_activo_unico
  ON transportistas (nombre)
  WHERE activo;

-- ─── 4) Qué es cada cosa ─────────────────────────────────────────────────────
COMMENT ON TABLE transportistas IS
  'Los transportistas que ofrece el desplegable de la guía. Se administran en '
  'Guías › Configuración (agregar: admin, secretaria y bodega, también desde el '
  '＋ de la guía; quitar: admin y secretaria). Soft delete (activo=false) '
  'firmado, NUNCA DELETE: una guía vieja sigue diciendo el nombre del que se '
  'quitó.';
COMMENT ON COLUMN transportistas.activo IS
  'false = ya no se ofrece en el desplegable. La fila se queda: las guías que '
  'lo usaron siguen mostrando su nombre.';
COMMENT ON COLUMN transportistas.creado_por IS
  'Quién lo agregó. Las 6 filas del 26-may-2026 dicen «sistema» (semilla).';
COMMENT ON COLUMN transportistas.desactivado_por IS
  'Quién lo quitó. Junto con desactivado_en es la firma que exige el CHECK.';
