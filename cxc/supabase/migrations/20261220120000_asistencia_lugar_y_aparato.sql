-- ============================================================================
-- ASISTENCIA — DÓNDE MARCÓ CADA QUIEN, Y DESDE QUÉ TELÉFONO (25-sep-2026)
--
-- Tres cosas, todas ADITIVAS. Nada se borra, nada se reescribe, ninguna columna
-- existente se toca. Sin esta migración el sistema sigue funcionando igual: la
-- pestaña «Marcaciones» dibuja el lugar como «—» y el sello del teléfono se
-- descarta en silencio (falla ABIERTA).
--
-- 🔴 EL PUNTO DE PARTIDA, EN PALABRAS DE DANIEL: *«Todos salen de la tienda,
-- para eso es la app»*. Las cinco personas que marcan por teléfono trabajan
-- FUERA de un local propio — Ana, Cindy y Yeisibeth son impulsadoras en tiendas
-- de clientes (hoy City Mall David), y Ángel y Rodrigo van adonde toque. O sea
-- que «en la tienda» NO es la pregunta: la pregunta es **en qué lugar estaba**.
--
-- 1) `asistencia_marcaciones.lugar_texto` — el nombre del lugar de ESA marca
--    («City Mall David», «Vía Interamericana, David»). Se le pregunta UNA vez
--    al servicio de mapas, para TODA marca del teléfono, y se guarda acá; nunca
--    se vuelve a preguntar.
--
-- 2) `asistencia_lugares_referencia` — puntos de referencia opcionales, uno por
--    empresa. NO son «la tienda de la persona»: son un punto contra el cual
--    medir, para poder agregar «· a 46,7 km» cuando una marca cae lejos. Sin
--    fila, la marca dice solo su lugar y no se dice ninguna distancia.
--
--    🔑 EL PUNTO NO SE INVENTÓ. Daniel mandó el enlace corto de Google Maps
--    `https://maps.app.goo.gl/11SZqrUJh2t5e6wX7`; ese enlace resuelve a una
--    BÚSQUEDA POR NOMBRE («American Classics Store, David Plaza Galería Central
--    Local 11 y 12, David»), **sin latitud ni longitud adentro**. Así que el
--    punto sembrado es la MEDIANA de las marcas reales de las cuatro personas
--    de Multifashion (medido el 25-sep-2026 contra producción: 32 marcas de
--    teléfono de los códigos 2, 3, 305 y 306 cae en 8.535117 / -82.838671 (eso es
--    Paso Canoas, NO la tienda). La tienda real la dio Daniel el 25-sep-2026 con la
--    coordenada de Google Maps 8°25'50.3"N 82°25'48.8"W = 8.430639 / -82.430222,
--    con la mitad de ellas a menos de 3,6 m de ese punto y precisión declarada
--    de 16 a 31 m). El radio de 200 m es holgado a propósito.
--
-- 3) `asistencia_marcaciones.aparato_id` — el sello que el teléfono se pone a sí
--    mismo la primera vez que abre `/marcacion`. No identifica a una persona ni
--    al hardware: es un número al azar guardado en ese navegador. Sirve para una
--    sola pregunta: ¿dos personas distintas marcaron hoy desde el mismo
--    teléfono? Las marcas viejas lo tienen en NULL y de ellas no se dice nada.
--
-- ⚠️ `asistencia_marcaciones` sigue siendo APPEND-ONLY. Las dos columnas nuevas
-- se escriben en el INSERT de la marca y nunca se actualizan: hay barrido que
-- pone el build ROJO ante un `update` sobre esa tabla.
-- ============================================================================

-- ── 1 · El lugar de cada marca, en palabras ─────────────────────────────────
ALTER TABLE public.asistencia_marcaciones
  ADD COLUMN IF NOT EXISTS lugar_texto text;

COMMENT ON COLUMN public.asistencia_marcaciones.lugar_texto IS
  'El nombre del lugar de esta marca (negocio, centro comercial o direccion), resuelto UNA vez con el servicio de mapas al guardarla. NULL = no se pudo preguntar (sin llave, sin red) o es una marca anterior al 25-sep-2026.';

-- ── 2 · Los puntos de referencia (opcionales) ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.asistencia_lugares_referencia (
  empresa_key text PRIMARY KEY,
  nombre      text NOT NULL,
  lat         double precision NOT NULL,
  lng         double precision NOT NULL,
  radio_m     integer NOT NULL DEFAULT 200,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT asistencia_lugares_referencia_lat_ok CHECK (lat BETWEEN -90 AND 90),
  CONSTRAINT asistencia_lugares_referencia_lng_ok CHECK (lng BETWEEN -180 AND 180),
  CONSTRAINT asistencia_lugares_referencia_radio_ok CHECK (radio_m > 0 AND radio_m <= 20000)
);

COMMENT ON TABLE public.asistencia_lugares_referencia IS
  'Punto de referencia por empresa para medir cuan lejos marco alguien. NO es la tienda de la persona: las cinco que marcan por telefono trabajan fuera. Sin fila, la marca dice su lugar y ninguna distancia. Ver src/lib/asistencia/lugar-de-marca.ts.';
COMMENT ON COLUMN public.asistencia_lugares_referencia.nombre IS
  'Como se llama el punto en la pantalla. Lo escribe una persona una sola vez.';
COMMENT ON COLUMN public.asistencia_lugares_referencia.radio_m IS
  'Metros desde el punto dentro de los cuales NO se dice ninguna distancia. Por omision 200.';

ALTER TABLE public.asistencia_lugares_referencia ENABLE ROW LEVEL SECURITY;

-- Solo el servidor. La pantalla nunca lee esta tabla directo: pasa por la ruta.
DROP POLICY IF EXISTS asistencia_lugares_referencia_service_role ON public.asistencia_lugares_referencia;
CREATE POLICY asistencia_lugares_referencia_service_role
  ON public.asistencia_lugares_referencia
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- La semilla: el punto de Multifashion. 1 fila. Si ya existe, no se pisa.
INSERT INTO public.asistencia_lugares_referencia (empresa_key, nombre, lat, lng, radio_m)
VALUES ('american_classic', 'American Classics Store · David', 8.430639, -82.430222, 200)
ON CONFLICT (empresa_key) DO NOTHING;

-- ── 3 · El sello del teléfono ───────────────────────────────────────────────
ALTER TABLE public.asistencia_marcaciones
  ADD COLUMN IF NOT EXISTS aparato_id text;

COMMENT ON COLUMN public.asistencia_marcaciones.aparato_id IS
  'Sello al azar que el navegador del telefono se pone a si mismo la primera vez que abre /marcacion. No es el hardware ni la persona. NULL en todas las marcas anteriores al 25-sep-2026 y en las de los relojes fisicos.';

-- Para la pregunta «¿dos personas marcaron hoy desde el mismo teléfono?».
CREATE INDEX IF NOT EXISTS asistencia_marcaciones_aparato_idx
  ON public.asistencia_marcaciones (aparato_id, ocurrio_en)
  WHERE aparato_id IS NOT NULL;
