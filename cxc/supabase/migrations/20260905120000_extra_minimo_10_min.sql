-- ─────────────────────────────────────────────────────────────────────────────
-- EL MINIMO PARA CONTAR HORA EXTRA BAJA DE 15 A 10 MINUTOS
--
-- Daniel: quedarse hasta 10 minutos despues del horario no se paga; de 11 en
-- adelante si. Preguntado explicitamente «si se queda 25 minutos, ¿cuantos le
-- pagas?», contesto «25 minutos»: los 10 son una PUERTA, no un descuento. Una
-- vez pasada, se paga TODO desde el primer minuto.
--
-- ── 🩸 POR QUE HACE FALTA ESTA MIGRACION, Y NO ALCANZABA EL CODIGO ───────────
--
-- El default vive en `REGLAS_DEFAULT.extraMinimoMin` (src/lib/asistencia/
-- config.ts) y bajarlo ahi NO cambia nada en produccion: `reglasDesdeFila()`
-- usa el default SOLO si la columna viene `null`, y la fila 1 de
-- `asistencia_reglas` tiene `extra_minimo_min = 15` escrito desde el
-- 20260806160000.
--
-- 🔴 Sin este archivo el deploy quedaba a MEDIAS y en silencio: la otra mitad
-- del cambio —que la tardanza ya no se resta de la hora extra— vive solo en el
-- codigo y SI aplica sola. O sea que la planilla iba a pagar con una regla
-- nueva y un umbral viejo, que no es ninguna de las dos reglas.
--
-- ⚠️ Y por eso el UPDATE es condicional: si alguien ya lo movio a mano desde
-- Configuracion —a 10, o a cualquier otro numero que haya decidido— este
-- archivo no le pisa la decision. Solo corrige el 15 que dejo la migracion
-- vieja. Idempotente: correrlo dos veces no hace nada la segunda.
--
-- ⛔ NO toca ninguna otra regla: ni la tolerancia de tardanza (10 min, que es
-- otra cosa y se llama parecido), ni los recargos, ni los divisores.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE asistencia_reglas
   SET extra_minimo_min = 10,
       updated_at       = now()
 WHERE extra_minimo_min = 15;
