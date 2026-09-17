-- ═════════════════════════════════════════════════════════════════════════════
-- EL SALDO DE VACACIONES A MANO SE RETIRA — las columnas NO se dropean
-- (17-sep-2026)
-- ═════════════════════════════════════════════════════════════════════════════
-- Daniel, textual: *«las vacaciones no funciona por día, hay que cambiar eso,
-- funciona que por cada 11 meses trabajado, 1 mes de vacaciones»* · *«1. Un mes
-- son 30 días corridos. 2. La fecha de ingreso que tiene la ficha»* · *«Quita lo
-- del saldo vacaciones»*.
--
-- 🩸 Hasta hoy el número de días salía de un SALDO INICIAL que contabilidad
-- escribía a mano en la ficha, con su fecha de corte. La idea era razonable y
-- **no la usó nadie**: medido el 17-sep-2026, de las 49 fichas NINGUNA tenía un número: 47 vacías
-- y 2 con un 0. O sea que la pantalla decía «Falta el saldo» para todo el
-- mundo y el dato que Daniel quería ver —cuántos días le tocan a alguien por su
-- antigüedad— no se veía nunca.
--
-- Desde hoy el número se CALCULA: 30 días corridos por cada 11 meses desde
-- `fecha_ingreso`, menos las vacaciones registradas. Regla en
-- `src/lib/asistencia/vacaciones-corresponden.ts`.
--
-- 🔴 SE RETIRAN, NO SE DROPEAN — patrón `mayor_lineas`. Las dos columnas se
-- quedan en la tabla, sin lectores ni escritores, con este COMMENT. Hay candado
-- (`vacaciones-le-corresponden.test.ts`) que pone el build ROJO si una
-- migración las borra o si el código vuelve a leerlas.
--
-- ⚠️ Esta migración NO cambia ningún dato: las columnas están vacías. Es una
-- ETIQUETA, para que quien las encuentre dentro de un año sepa por qué están y
-- no las "arregle".
--
-- ⚠️ Tampoco se toca el CHECK `asistencia_personas_saldo_vac_medio` ni el que
-- obliga a que el saldo y su corte vayan juntos: con las columnas en NULL no
-- frenan nada, y dropearlos sería empezar a borrar por el otro lado.
-- ═════════════════════════════════════════════════════════════════════════════

COMMENT ON COLUMN asistencia_personas.saldo_vacaciones_dias IS
  'RETIRADA el 17-sep-2026 (Daniel: «Quita lo del saldo vacaciones»). Sin '
  'lectores ni escritores: los días de vacaciones se CALCULAN desde '
  'fecha_ingreso (30 días por cada 11 meses) en '
  'src/lib/asistencia/vacaciones-corresponden.ts. NO se dropea (patrón '
  'mayor_lineas) y hay candado que pone el build rojo si una migración la borra.';

COMMENT ON COLUMN asistencia_personas.saldo_vacaciones_corte IS
  'RETIRADA el 17-sep-2026, junto con saldo_vacaciones_dias. Era el día al que '
  'ese saldo era cierto. Sin lectores ni escritores; NO se dropea.';
