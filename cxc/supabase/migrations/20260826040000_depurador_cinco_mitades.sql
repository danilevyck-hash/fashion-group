-- ─────────────────────────────────────────────────────────────────────────────
-- Catálogo del Depurador: las 5 MITADES DERECHAS que le faltaban.
--
-- Decisión de Daniel (25-ago-2026): son prendas que Fashion Group YA vende y el
-- catálogo no reconocía, así que toda descripción que las usara abría la alarma
-- roja y bloqueaba la descarga del Excel:
--
--     Shirts · Shirts L/S · Shirts S/S · Polos L/S · Slippers
--
-- La señal de que era un HUECO y no un error: el catálogo ya conocía
-- "Men-Shirts Woven L/S" (296 art.) y "Men-Dress Shirts" (59 art.). Camisas ya
-- había — lo que faltaba era la forma pelada.
--
-- ── QUÉ SE DIO DE ALTA Y POR QUÉ ESAS MARCAS ─────────────────────────────────
-- El catálogo NO guarda mitades: guarda descripciones enteras POR MARCA (así lo
-- lee `descripcionesDeMarca`, que alimenta el selector de fórmulas por
-- marca+descripción y el Excel masivo). Así que se dio de alta la descripción
-- COMPLETA en cada marca donde hay artículos de verdad. Las 17 filas salen de
-- cruzar `switch_articulo_info` (descripción + existencia) con
-- `switch_factura_lineas` (la marca), contra producción:
--
--   Men-Shirts ......... CK Menswear 64 art. · CK Other 7 art.
--   Boys-Shirts ........ CK Kids 4 art.
--   Women-Shirts L/S ... TH Womenswear 41 art. (762 u.)
--   Boys-Shirts L/S .... TH Kids 16 art. (313 u.)
--   Girls-Shirts L/S ... TH Kids 4 art. (83 u.)
--   Women-Shirts S/S ... TH Womenswear 13 art. · TH Tommy Jeans 2 art.
--   Boys-Shirts S/S .... TH Kids 1 art.
--   Men-Polos L/S ...... CK Menswear 14 · TH Menswear 8 · CK Jeans 4
--   Boys-Polos L/S ..... TH Kids 2 art.
--   Men-Slippers ....... CK Footwear 12 art. · TH Footwear 1 art.
--   Women-Slippers ..... TH Footwear 6 art. (288 u.)
--   Boys-Slippers ...... TH Footwear 1 art. (82 u.)
--
-- ── EFECTO MEDIDO EN PANTALLA (no en SQL) ────────────────────────────────────
-- Cargando por /productos/cargar el Excel del universo real (858 pares
-- marca+descripción de producción, `scripts/_universo-depurador-excel.ts`):
--
--     ANTES:   53 descripciones por revisar · 87 pasaron solas
--     DESPUÉS: 36 descripciones por revisar · 87 pasaron solas
--
-- ⚠️ EFECTO LATERAL CONOCIDO, A PROPÓSITO: 4 filas de datos sucios de Reebok mal
-- clasificadas bajo CK Jeans (REEBOK IDENTITY VECTOR T-SHIRT y compañía, que
-- parten dejando "SHIRT" a la derecha) pasaron de «mitades nuevas» a «casi igual
-- a REEBOK IDENTITY VECTOR T-Shirts». La etiqueta queda ridícula, pero SIGUEN
-- ALERTANDO: no se cuela ninguna. Los datos sucios son otro problema.
--
-- ── ESTA MIGRACIÓN NO ES LA QUE ESCRIBIÓ PRODUCCIÓN ──────────────────────────
-- Las 17 filas se aprobaron el 25-ago-2026 por el camino de la pantalla
-- (POST /api/productos/cargar/descripciones/aprobar, sesión real de `daniel`,
-- origen='aprobada'), que es el único que pasa por `normalizarEspacios()`. Esta
-- migración deja el registro en el repo y siembra los mismos datos en cualquier
-- entorno que no los tenga. Es ADITIVA e idempotente: en producción no cambia
-- una sola fila (on conflict do nothing contra el índice único lower/lower).
-- ─────────────────────────────────────────────────────────────────────────────

insert into depurador_descripciones (marca, descripcion, origen) values
  ('CK Menswear',    'Men-Shirts',       'aprobada'),
  ('CK Other',       'Men-Shirts',       'aprobada'),
  ('CK Kids',        'Boys-Shirts',      'aprobada'),
  ('TH Womenswear',  'Women-Shirts L/S', 'aprobada'),
  ('TH Kids',        'Boys-Shirts L/S',  'aprobada'),
  ('TH Kids',        'Girls-Shirts L/S', 'aprobada'),
  ('TH Womenswear',  'Women-Shirts S/S', 'aprobada'),
  ('TH Tommy Jeans', 'Women-Shirts S/S', 'aprobada'),
  ('TH Kids',        'Boys-Shirts S/S',  'aprobada'),
  ('CK Menswear',    'Men-Polos L/S',    'aprobada'),
  ('TH Menswear',    'Men-Polos L/S',    'aprobada'),
  ('CK Jeans',       'Men-Polos L/S',    'aprobada'),
  ('TH Kids',        'Boys-Polos L/S',   'aprobada'),
  ('CK Footwear',    'Men-Slippers',     'aprobada'),
  ('TH Footwear',    'Men-Slippers',     'aprobada'),
  ('TH Footwear',    'Women-Slippers',   'aprobada'),
  ('TH Footwear',    'Boys-Slippers',    'aprobada')
on conflict do nothing;
