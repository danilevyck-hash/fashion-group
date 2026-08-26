-- ─────────────────────────────────────────────────────────────────────────────
-- ASISTENCIA — SOBRE QUE MONTO SE CALCULAN LOS SEGUROS (base propia por persona)
--
-- ⚠️ NI UN SOLO SIGNO DE DOLAR EN ESTE ARCHIVO, NI EN LOS COMENTARIOS. El SQL
-- Editor de Supabase tiene un parser de dollar-quoting ingenuo y un numero
-- IMPAR de "signos de dolar" sueltos antes de un bloque desalinea la migracion
-- entera (`ERROR 42601`). Los montos van escritos "17,06 USD". Por lo mismo no
-- hay ningun bloque DO/plpgsql aca: la restriccion se hace idempotente con un
-- DROP CONSTRAINT IF EXISTS, que no necesita comillas de dolar.
--
-- ── 🩸 EL AGUJERO QUE TAPA ───────────────────────────────────────────────────
--
-- Daniel le pregunto a la contadora de donde salian los 17,06 USD de seguro
-- social de RODRIGO MIRANDA, escritos A MANO en su Excel, sin formula. Ella
-- contesto, textual:
--
--   «Con respecto a Rodrigo, si su base para el calculo del seguro social y
--   seguro educativo es 175.00. Recuerda que te comente que el esta en una
--   planilla domestica y con un menor salario.»
--
-- O sea: a Rodrigo los seguros NO se le calculan sobre su bruto. Se le calculan
-- sobre una base FIJA de 175,00 USD, porque esta inscrito en la Caja por otra
-- planilla. La aritmetica cierra al centavo con los dos montos escritos a mano:
--
--     175,00 x 9,75 % = 17,0625 -> 17,06 USD   (seguro social)
--     175,00 x 1,25 % =  2,1875 ->  2,19 USD   (seguro educativo)
--
-- Medido en el archivo «VIST ANA Planilla Quincenal -30 de julio de 2026.xlsx»,
-- hoja matriz «30 DE JULIO », fila 12 (Rodrigo): L12 (total bruto) es FORMULA
-- (=D12+E12-F12-G12+H12+I12+J12+K12 -> 417,325), pero M12 y N12 son NUMEROS A
-- MANO: 17.06 y 2.19. Es el UNICO de la planilla regular de Vistana cuyos dos
-- seguros no son formula; los otros cinco usan =L*9,75% y =L*1,25%.
--
-- El modulo, en cambio, se los calculaba sobre el bruto: 39,38 USD de social
-- mas 5,05 USD de educativo. Le retenia 25,18 USD DE MAS POR QUINCENA a una
-- persona de verdad.
--
-- ── 🔴 NO SE PUEDE DEDUCIR DE NINGUN DATO QUE TENGAMOS ───────────────────────
--
-- En que planilla esta inscrito alguien en la Caja de Seguro Social es un hecho
-- EXTERNO al reloj, a la ficha y al sueldo. Por eso es un dato explicito que se
-- carga a mano, igual que `paga_seguros`, y no una regla derivada que un dia se
-- equivocaria sola.
--
-- ── 🔴 LA COLUMNA ES **POR QUINCENA**, Y EL NOMBRE LO DICE ───────────────────
--
-- Los 175,00 USD que dijo la contadora producen 17,06 USD en UNA quincena, y su
-- Excel es quincenal. Se guarda tal cual, en la misma unidad en que ella la
-- dijo, y NO mensual-dividida-por-dos como `salario_mensual`. Tres razones, en
-- orden:
--
--   1. REEMPLAZA AL BRUTO, Y EL BRUTO YA ES QUINCENAL. Los seguros salen del
--      total bruto, que es el monto de UNA quincena. La base ocupa ese lugar
--      exacto: guardarla en otra unidad obligaria a una division que hay que
--      mantener sincronizada con la del quincenal, y el dia que se separen el
--      numero queda mal sin que nadie lo vea.
--   2. ES EL NUMERO QUE ELLA DIJO. Guardar 350 para que salga 175 significa que
--      el «175.00» de su mensaje no aparece en ninguna pantalla, y quien coteje
--      contra su Excel en seis meses tiene que dividir para creerle.
--   3. EL ERROR DE TIPEO ES ASIMETRICO. Con un campo mensual, alguien que
--      escribe los 175 del mensaje haria retener 8,53 USD en vez de 17,06 USD:
--      LA MITAD del seguro, que no se ve en el neto de nadie y se descubre
--      cuando la Caja pide lo que no se retuvo. Al reves —campo quincenal,
--      alguien escribe 350— el monto sale al doble y se reclama el mismo dia.
--
-- Por eso el nombre lleva la unidad adentro: `seguros_base_quincena`. Es el
-- unico punto ambiguo de todo esto y el nombre lo contesta antes de que nadie
-- tenga que abrir un comentario. La pantalla, ademas, muestra los dos montos
-- calculados debajo del campo: quien escribe 175 ve 17,06 y 2,19 en el acto.
--
-- ── 🔴 NO ENCIENDE LOS SEGUROS DE NADIE ─────────────────────────────────────
--
-- `paga_seguros` se pregunta PRIMERO y manda. Quien tiene los seguros apagados
-- sigue con las dos columnas en 0,00 aunque tenga base cargada: la base no
-- contesta «se le cobran?» sino «sobre cuanto?», y son dos preguntas. El
-- candado esta en `calcularDinero` (src/lib/asistencia/planilla.ts) y hay un
-- test que lo exige.
--
-- ── ⚠️ EL PERIODO PARCIAL SIGUE EL CRITERIO DEL SUELDO, NO UNO NUEVO ────────
--
-- Quien entra o sale a mitad de quincena NO produce un numero: el motor se
-- abstiene y lo decide una persona, asi que la base ni llega a aplicarse —misma
-- respuesta que ya recibe el salario—. En un RANGO LIBRE (del 25-jul al 10-ago,
-- por ejemplo) la base se reparte con el MISMO factor que el sueldo quincenal;
-- si no, media quincena pagaria medio sueldo y el seguro entero. Una quincena
-- de verdad tiene factor exactamente 1.
--
-- ── 🔴 EL CHECK PROHIBE EL CERO, Y NO ES UNA FORMALIDAD ─────────────────────
--
-- Una base de 0 dejaria los dos seguros en 0,00 por un camino DISTINTO al de
-- `paga_seguros`: sin sello en la planilla, sin aviso y sin que la pantalla
-- diga nada. Dos formas de apagar lo mismo y una de ellas muda es como se
-- pierde un descuento sin que nadie se entere. Apagar los seguros se hace con
-- el interruptor de al lado, que si lo dice en pantalla.
--
-- ── 🔴 EL DEFAULT ES NULL, Y ESO ES LO QUE HACE QUE NO SE MUEVA UN CENTAVO ──
--
-- NULL = no tiene base propia = los seguros salen del TOTAL BRUTO, que es
-- exactamente lo que la planilla hacia para las 40 fichas. El dia que este DDL
-- corre, la planilla da EXACTAMENTE lo que daba ayer, hasta que alguien escriba
-- un monto a conciencia en Configuracion.
--
-- Y al reves: SIN correr este archivo la app funciona igual. `leerPersonas`
-- baja un peldano de su escalera y lee las fichas sin esta columna; la pantalla
-- de Configuracion deshabilita el campo y dice que archivo falta.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE asistencia_personas
  ADD COLUMN IF NOT EXISTS seguros_base_quincena numeric(12,2);

-- Idempotente sin plpgsql: se borra y se vuelve a poner. Correr este archivo
-- dos veces tiene que dar lo mismo que correrlo una.
ALTER TABLE asistencia_personas
  DROP CONSTRAINT IF EXISTS asistencia_personas_seguros_base_pos;

ALTER TABLE asistencia_personas
  ADD CONSTRAINT asistencia_personas_seguros_base_pos
  CHECK (seguros_base_quincena IS NULL
         OR (seguros_base_quincena > 0 AND seguros_base_quincena <= 100000));

COMMENT ON COLUMN asistencia_personas.seguros_base_quincena IS
  'Sobre QUE MONTO se le calculan el seguro social (9,75 %) y el educativo (1,25 %), POR QUINCENA, en vez del total bruto. NULL = sobre el bruto, que es como estaban las 40 fichas: el dia que esta columna nace no se mueve un centavo. RODRIGO MIRANDA (codigo 13, vistana) va en 175.00 porque esta inscrito en la Caja por una planilla domestica -la contadora, textual: «su base para el calculo del seguro social y seguro educativo es 175.00»-: 175 x 9,75 % = 17,06 y 175 x 1,25 % = 2,19, los dos montos que ella escribe A MANO en su Excel. Sobre su bruto le salian 39,38 y 5,05, o sea 25,18 de mas por quincena. ES EL MONTO DE UNA QUINCENA, la misma unidad que el bruto al que reemplaza -NO el mensual dividido por dos como salario_mensual-; el nombre de la columna lo dice para que nadie tenga que adivinarlo. NO ENCIENDE LOS SEGUROS DE NADIE: con paga_seguros en false las dos columnas siguen en 0,00 aunque haya base. El CHECK prohibe el 0 porque un 0 apagaria los seguros por un camino mudo, sin sello ni aviso; para eso esta el interruptor paga_seguros.';

-- ─────────────────────────────────────────────────────────────────────────────
-- ⛔ EL DATO DE RODRIGO NO SE SIEMBRA ACA.
--
-- Se carga POR LA PUERTA DE LA APP (PUT /api/asistencia/configuracion, el mismo
-- cuerpo que manda ConfiguracionTab), que es lo unico que pasa por el
-- validador, respeta el CHECK y deja el updated_at como lo deja la pantalla. Un
-- UPDATE crudo en una migracion escribe plata sin pasar por ninguna de esas
-- tres cosas, y despues nadie sabe si el numero vino de una persona o de un
-- archivo.
--
-- Queda escrito lo que se cargo, para que se pueda auditar contra el Excel:
--     codigo 13 (vistana, RODRIGO MIRANDA) -> seguros_base_quincena = 175.00
-- ─────────────────────────────────────────────────────────────────────────────
