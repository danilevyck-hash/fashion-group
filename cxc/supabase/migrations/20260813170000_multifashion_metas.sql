-- ─────────────────────────────────────────────────────────────────────────────
-- MULTIFASHION — METAS CONFIGURABLES (grupales y por vendedora).
--
-- Daniel, textual: *"si armalo, en multifashion, y que sea configurable para el
-- futuro hacer otras metas grupales y por vendedora (incluyendo a la gerente
-- jennifer que comisiona por tienda y ventas personales)"*.
--
-- La primera meta que se carga —y que YA está anunciada al personal, o sea que
-- el número NO se toca—:
--
--     Meta del viaje · 1-sep-2026 a 31-dic-2026 · 420,000.00 · las 5 vendedoras
--     Premio: un viaje para todas (2,000.00)
--
-- ⚠️ ESTA MIGRACIÓN ES ADITIVA Y LA CORRE DANIEL A MANO.
--    Aplicar en Supabase Dashboard -> SQL Editor.
--    **La app funciona ANTES de que corra** (patrón `cols-opcionales`): sin las
--    tablas, la pestaña Metas se dibuja y dice con todas las letras qué archivo
--    falta, y NINGÚN otro número de Multifashion cambia. No hay ventana ciega.
--
-- 🔴 POR QUÉ NO SE REUSA `ventas_metas`. Esa tabla existe y tiene 7 filas
--    cargadas a mano el 13-may-2026, pero su forma es `(empresa, anio, mes) ->
--    un numero`: no sabe de rangos de fecha libres, ni de tipo grupal contra
--    por-vendedora, ni de quiénes participan, ni de premio. Meter esta meta ahí
--    obligaría a inventar convenciones (¿4 filas mensuales para un rango de 4
--    meses?, ¿cómo se dice "estas 5 personas"?) sobre una tabla que además hoy
--    la LEE la proyección viva de /ventas. Y tiene una trampa medida: el repo
--    la declara con la columna `año` mientras las 11 RPC vivas la consultan
--    como `anio`. Se deja intacta.
--
-- 🔴 LO QUE NO HACE ESTA MIGRACIÓN, a propósito:
--    · NO toca `switch_facturas` ni `_multifashion_sf_vw` — el avance se LEE de
--      la misma vista de siempre, con la misma semántica de siempre.
--    · NO corrige los nombres de vendedora que en Switch están cargados de dos
--      formas (`Ana Trejos` / `ANA TREJOS`). Eso es decisión de Daniel y va
--      aparte; acá se agrupa AL LEER, sin escribir una sola fila.
--    · NO borra ni modifica ninguna tabla existente.
-- ─────────────────────────────────────────────────────────────────────────────

-- ═════════════════════════════════════════════════════════════════════════════
-- 1) La meta
-- ═════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS multifashion_metas (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Lo que Daniel escribe y el personal reconoce ("Meta del viaje").
  nombre       text NOT NULL,

  -- Rango LIBRE, inclusive en las dos puntas. No se ata a mes ni a año: la meta
  -- real cruza cuatro meses y la que venga puede cruzar el fin de año.
  desde        date NOT NULL,
  hasta        date NOT NULL,

  -- El monto a alcanzar, en la MISMA unidad que muestra el módulo: venta retail
  -- neta pre-impuesto (subtotal con descuento aplicado, notas de crédito
  -- restadas). NO es el total con ITBMS.
  objetivo     numeric(14,2) NOT NULL,

  -- 'grupal'    -> una sola cuenta: la suma de todas las participantes.
  -- 'vendedora' -> cada participante tiene su propio objetivo.
  -- Una persona puede estar en las DOS a la vez, que es exactamente el caso de
  -- Jennifer (comisiona por la tienda Y por sus ventas personales).
  tipo         text NOT NULL DEFAULT 'grupal',

  -- Texto libre: "un viaje para todas". Se muestra tal cual.
  premio       text,
  -- Opcional, para cuando el premio tiene monto (2,000.00). Solo se muestra.
  premio_monto numeric(14,2),

  activa       boolean NOT NULL DEFAULT true,
  creada_por   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  -- Soft delete, como el resto del sistema. Retirar una meta anunciada no puede
  -- borrar la evidencia de que existió.
  deleted      boolean NOT NULL DEFAULT false,

  CONSTRAINT multifashion_metas_rango_ck    CHECK (hasta >= desde),
  CONSTRAINT multifashion_metas_objetivo_ck CHECK (objetivo > 0),
  CONSTRAINT multifashion_metas_tipo_ck     CHECK (tipo IN ('grupal', 'vendedora')),
  -- Un nombre en blanco deja una tarjeta sin título en pantalla. NOT NULL a
  -- secas deja pasar la cadena vacía y los espacios, que es justo lo que teclea
  -- quien quiere saltarse el campo.
  CONSTRAINT multifashion_metas_nombre_ck   CHECK (btrim(nombre) <> ''),
  CONSTRAINT multifashion_metas_premio_ck   CHECK (premio_monto IS NULL OR premio_monto >= 0)
);

-- El listado de la pantalla pide las metas vivas ordenadas por fecha.
CREATE INDEX IF NOT EXISTS multifashion_metas_vivas_idx
  ON multifashion_metas (deleted, activa, desde DESC);

-- ═════════════════════════════════════════════════════════════════════════════
-- 2) Quiénes participan
-- ═════════════════════════════════════════════════════════════════════════════
-- 🔑 SE GUARDA LA CLAVE NORMALIZADA, NO EL TEXTO DE SWITCH.
--
-- Medido contra producción el 13-ago-2026 sobre 12 meses de american_classic
-- retail: **14 nombres distintos para 11 personas**. Tres están partidas en dos
-- porque en Switch se cargaron de dos formas:
--
--     Ana Trejos      / ANA TREJOS        44,998.17 en 854 documentos
--     Yeisibeth Munoz / YEISIBETH MUNOZ   20,925.62 en 433 documentos
--     Cindy De Gracia / CINDY DE GRACIA   14,728.77 en 316 documentos
--
-- Guardar el texto tal como viene haría que una meta por vendedora midiera LA
-- MITAD de lo que esa persona vendió. La clave es el nombre en mayúsculas, sin
-- acentos y con los espacios colapsados (`claveVendedora` en
-- src/lib/multifashion/metas-clave.ts) — la MISMA función que usa la pantalla
-- para ofrecer la lista y el servidor para sumar el avance, así que lo que se
-- elige y lo que se mide no se pueden separar.
--
-- ⚠️ `vendedora_nombre` es SOLO para mostrar (se guarda cómo se veía al
-- elegirla). La identidad es `vendedora_clave`.
CREATE TABLE IF NOT EXISTS multifashion_meta_participantes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  meta_id             uuid NOT NULL
                        REFERENCES multifashion_metas(id) ON DELETE CASCADE,

  vendedora_clave     text NOT NULL,
  vendedora_nombre    text NOT NULL,

  -- 🔴 SOLO para tipo='vendedora', y SE ESCRIBE A MANO, una por una.
  --
  -- Daniel, textual (13-ago-2026): *"las vendedoras no deberian de tener meta
  -- individual diferente cuando se abre una nueva meta, lo de verlo en la
  -- vendedora es solo si se programa meta por vendedora"* y *"Las metas
  -- personales las pongo yo a mano... es cuando no hay metas grupales, sino
  -- individuales"*.
  --
  -- O sea: **una meta GRUPAL no genera metas individuales**. Nunca se reparte
  -- el monto del grupo entre las participantes, ni en partes iguales ni a
  -- prorrata de lo que vendieron. En una meta grupal esta columna queda NULL y
  -- la pantalla no muestra ninguna meta por persona.
  objetivo_individual numeric(14,2),

  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT multifashion_meta_part_unica  UNIQUE (meta_id, vendedora_clave),
  CONSTRAINT multifashion_meta_part_clave_ck
    CHECK (btrim(vendedora_clave) <> ''),
  -- El marcador de Switch para "sin vendedor" no es una persona y no puede
  -- participar de una meta ni cobrar un premio.
  CONSTRAINT multifashion_meta_part_no_default_ck
    CHECK (upper(btrim(vendedora_clave)) <> 'DEFAULT'),
  CONSTRAINT multifashion_meta_part_objetivo_ck
    CHECK (objetivo_individual IS NULL OR objetivo_individual > 0)
);

CREATE INDEX IF NOT EXISTS multifashion_meta_participantes_meta_idx
  ON multifashion_meta_participantes (meta_id);

-- ═════════════════════════════════════════════════════════════════════════════
-- 3) RLS — igual que el resto de las tablas privadas del sistema
-- ═════════════════════════════════════════════════════════════════════════════
-- Sin políticas: solo `service_role` (que las salta) puede leer y escribir, o
-- sea únicamente el servidor. Mismo criterio que
-- 20260704120000_rls_hardening_service_role.sql.
ALTER TABLE multifashion_metas               ENABLE ROW LEVEL SECURITY;
ALTER TABLE multifashion_meta_participantes  ENABLE ROW LEVEL SECURITY;

-- ═════════════════════════════════════════════════════════════════════════════
-- 4) Agregado del avance en POSTGRES — para no traer 6.610 filas por pantalla
-- ═════════════════════════════════════════════════════════════════════════════
-- 🩸 EL COSTO ESTÁ MEDIDO, NO SUPUESTO. El período de la meta real (sep-dic)
-- tuvo el año pasado **6,610 documentos**: leerlos crudos son ~8 viajes
-- paginados de 1,000 filas (`db-max-rows` corta en 1,000 EN SILENCIO) y 1.5 s,
-- **en cada carga de pantalla**, contra una base en compute Micro que ya se
-- cayó varias veces esta semana. Es el mismo problema que ya resolvió
-- `multifashion_articulo_diario_agrupado_v1` bajando 49 viajes a 3.
--
-- Esta función devuelve el período YA sumado y partido por vendedora: una
-- llamada, unas pocas decenas de filas.
--
-- 🔴 DEVUELVE MAGNITUDES YA FIRMADAS PORQUE LA VISTA YA LAS FIRMA.
-- `_multifashion_sf_vw.subtotal` viene NEGATIVO para las notas de crédito (ver
-- 20260530000000). Acá solo se suma: no se vuelve a decidir el signo. Firmarlo
-- una segunda vez daría exactamente el DOBLE de las devoluciones de diferencia,
-- que es la firma conocida de ese error en este repo.
--
-- ⚠️ El nombre NO se normaliza acá. La agrupación por persona la hace
-- `claveVendedora` en TypeScript, que es la única definición de "quién es
-- quién": una segunda normalización escrita en SQL podría separarse de la de la
-- pantalla y entonces lo elegido y lo medido dejarían de coincidir. Esta
-- función agrupa por el texto CRUDO —una llave más FINA que la del código— y
-- lo que Postgres deja separado, TypeScript lo junta igual.
CREATE OR REPLACE FUNCTION multifashion_meta_ventas_v1(
  p_desde date,
  p_hasta date
)
RETURNS TABLE (
  vendedor    text,
  mes         text,
  ventas      numeric,
  documentos  bigint,
  ultima      date
)
LANGUAGE sql
STABLE
AS $fn$
  SELECT
    COALESCE(v.vendedor, '')       AS vendedor,
    to_char(v.fecha, 'YYYY-MM')    AS mes,
    SUM(v.subtotal)::numeric       AS ventas,
    COUNT(*)::bigint               AS documentos,
    MAX(v.fecha)::date             AS ultima
  FROM _multifashion_sf_vw v
  WHERE v.is_wholesale = false
    AND v.fecha >= p_desde
    AND v.fecha <= p_hasta
  GROUP BY 1, 2
$fn$;

GRANT EXECUTE ON FUNCTION multifashion_meta_ventas_v1(date, date) TO service_role;
