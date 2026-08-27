-- ─────────────────────────────────────────────────────────────────────────────
-- EL AMARRE: cada préstamo apunta al CÓDIGO DEL RELOJ de su persona.
--
-- ── 🩸 POR QUÉ HACE FALTA UNA COLUMNA Y NO ALCANZA EL NOMBRE ─────────────────
--
-- `prestamos_empleados.nombre` es TEXTO LIBRE que alguien tecleó. La planilla,
-- en cambio, conoce a la gente por el código del reloj (`empleado_codigo`, el
-- mismo de `asistencia_personas` y `asistencia_planilla_manual`). Mientras la
-- única forma de cruzarlos sea el nombre, conectar el préstamo con la planilla
-- significa comparar dos textos escritos por dos personas distintas.
--
-- Medido contra producción el 27-ago-2026: de las **30 fichas de préstamo**,
-- **18 cruzan por igualdad exacta** de nombre (mayúsculas + espacios) y las
-- otras 12 no. Entre las que no cruzan hay tres con SALDO VIVO:
--
--   GABRIELA A. JARAMILLO P.  →  GABRIELA JARAMILLO (53)      $360
--   LUIS ADRIAN ARROYO        →  LUIS ARROYO (9)              $700
--   MARIA BETHANCOURTH        →  MARIA V. BETHANCOURTH G. (49) $700
--
-- ── 🔴 NADA SE ATA POR PARECIDO. NI ACÁ NI NUNCA ─────────────────────────────
--
-- Es la lección de `Outlet Duty Free N2` vs `N3` (ver § Guías en CLAUDE.md):
-- dos nombres parecidos pueden ser DOS personas, y un descuento aplicado a la
-- persona equivocada **no deja ningún rastro** — el neto sale distinto, el
-- recibo se imprime, y nadie se entera nunca.
--
-- En esta misma tabla está el caso que lo prueba: `LAURA CASIANI` (préstamos)
-- contra `Laura Lismari Casiano Vega` (código 38). CASIAN**I** y CASIAN**O** no
-- son la misma palabra. **Se queda SIN atar**, aunque su saldo sea $0 y atarla
-- no costaría nada hoy: la regla no se afloja por un caso barato.
--
-- Por eso hay exactamente DOS pasos y ninguno adivina:
--
--   PASO 1 — igualdad EXACTA de nombre (`upper(btrim(...))`) **y** de empresa,
--            y SOLO cuando hay un único candidato en la planilla. Si el mismo
--            nombre apareciera dos veces, no se ata ninguno.
--   PASO 2 — una LISTA ESCRITA A MANO, tres renglones, cada uno con el nombre
--            de préstamos, el código y el nombre que ese código tiene que
--            tener en la planilla. Si el nombre del código no es el esperado,
--            la fila NO se escribe: el guard es de CONDUCTA, no un comentario.
--
-- ── ⚠️ LA APP FUNCIONA SIN ESTE ARCHIVO ──────────────────────────────────────
--
-- Sin la columna, `leerPrestamosPorCodigo` devuelve cero préstamos y la casilla
-- Préstamo de la planilla sigue siendo lo que es hoy: un número que se teclea a
-- mano. Se avisa en pantalla con el nombre de este archivo. Cerrar la planilla
-- por falta de un SQL dejaría a 38 personas sin cuadro el día de pago.
--
-- Aditiva e idempotente: no borra ni cambia ninguna columna existente.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE prestamos_empleados
  ADD COLUMN IF NOT EXISTS empleado_codigo text;

COMMENT ON COLUMN prestamos_empleados.empleado_codigo IS
  'El código del reloj (asistencia_personas.empleado_codigo) de esta persona. Es lo que ata el préstamo con la planilla. NULL = todavía no se pudo atar con certeza: la casilla Préstamo de la planilla no se llena sola para esta ficha. Nunca se llena por parecido de nombre.';

CREATE INDEX IF NOT EXISTS prestamos_empleados_empleado_codigo_idx
  ON prestamos_empleados (empleado_codigo)
  WHERE empleado_codigo IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 1 — LAS QUE CRUZAN EXACTO, CON LA EMPRESA DE ACUERDO Y SIN AMBIGÜEDAD.
--
-- 🔑 `upper(btrim(...))` y NADA MÁS. No se quitan acentos, no se quitan puntos,
-- no se recortan iniciales, no se comparan distancias. `ALEJANDRA CAMAÑO` cruza
-- con `ALEJANDRA CAMAÑO` porque son la misma cadena; `LAURA CASIANI` no cruza
-- con `Laura Lismari Casiano Vega` porque no lo son.
--
-- 🔴 LA EMPRESA TAMBIÉN TIENE QUE COINCIDIR. Préstamos guarda el nombre
-- («Confecciones Boston») y la planilla la key («confecciones_boston»): la
-- traducción va escrita acá, corta y explícita, y una empresa que no esté en
-- esta lista simplemente no ata (no ata "de más").
--
-- 🔴 Y SOLO SI HAY UN ÚNICO CANDIDATO. Dos personas con el mismo nombre en la
-- planilla es exactamente el caso donde elegir una es inventar.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE prestamos_empleados e
   SET empleado_codigo = ap.empleado_codigo
  FROM (
    SELECT upper(btrim(p.nombre)) AS k,
           p.empresa               AS emp_key,
           min(p.empleado_codigo)  AS empleado_codigo,
           count(*)                AS cuantos
      FROM asistencia_personas p
     GROUP BY 1, 2
  ) ap
 WHERE e.empleado_codigo IS NULL
   AND ap.cuantos = 1
   AND upper(btrim(e.nombre)) = ap.k
   AND ap.emp_key = CASE e.empresa
                      WHEN 'Confecciones Boston'   THEN 'confecciones_boston'
                      WHEN 'Vistana International' THEN 'vistana'
                      WHEN 'Fashion Wear'          THEN 'fashion_wear'
                      ELSE NULL
                    END;

-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 2 — LOS TRES QUE SE ATAN A MANO, ESCRITOS UNO POR UNO.
--
-- 🔴 CADA RENGLÓN LLEVA EL NOMBRE QUE ESE CÓDIGO TIENE QUE TENER EN LA PLANILLA,
-- y el UPDATE lo EXIGE. Si mañana alguien renombra al código 53, esta migración
-- deja de escribir esa fila en vez de atar el préstamo de Gabriela a quien haya
-- quedado en ese código. Un comentario que dijera «53 es Gabriela» no frena
-- nada; esta condición sí.
--
-- La empresa se exige igual que en el PASO 1, por el mismo motivo.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE prestamos_empleados e
   SET empleado_codigo = l.codigo
  FROM (VALUES
    -- nombre en Préstamos       empresa                  código  nombre en la planilla
    ('GABRIELA A. JARAMILLO P.', 'Confecciones Boston',   '53',  'GABRIELA JARAMILLO'),
    ('LUIS ADRIAN ARROYO',       'Vistana International', '9',   'LUIS ARROYO'),
    ('MARIA BETHANCOURTH',       'Confecciones Boston',   '49',  'MARIA V. BETHANCOURTH G.')
  ) AS l(nombre, empresa, codigo, nombre_planilla)
 WHERE e.empleado_codigo IS NULL
   AND upper(btrim(e.nombre))  = l.nombre
   AND e.empresa               = l.empresa
   AND EXISTS (
     SELECT 1 FROM asistencia_personas p
      WHERE p.empleado_codigo = l.codigo
        AND upper(btrim(p.nombre)) = l.nombre_planilla
   );

-- ─────────────────────────────────────────────────────────────────────────────
-- ⚠️ LO QUE QUEDA SIN ATAR, A PROPÓSITO, Y NO ES UN OLVIDO
--
--   · LAURA CASIANI          — CASIANI ≠ CASIANO (código 38). Saldo $0.
--   · LUZ LOPEZ ×2           — fichas viejas e inactivas, saldo $0. La ficha
--                              viva es LUZ BOSQUEZ (18), que ya cruza sola:
--                              la contadora la renombró en Préstamos.
--   · STEFANY / STEPHANY MORALES, YANKATERY, YEISON LLORENTE — no tienen ficha
--                              en la planilla. Saldo $0.
--   · JOHANA VALLEJO ×2      — ya no trabaja acá. Se da de baja aparte.
--
-- Ninguna tiene saldo. Si alguna llegara a tenerlo, la planilla NO se lo va a
-- descontar sola y lo va a DECIR en pantalla con nombre y monto («préstamo sin
-- persona atada»): rechazar sí, esconder no.
-- ─────────────────────────────────────────────────────────────────────────────
