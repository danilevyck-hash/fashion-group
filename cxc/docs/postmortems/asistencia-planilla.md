# Post-mortems — Asistencia y planilla

> Movido de `cxc/CLAUDE.md` el 31-ago-2026 para bajar lo que se inyecta en cada sesión.
> **Nada se resumió ni se borró: el contenido es verbatim**, con sus «Daniel, textual»,
> sus mediciones, sus «Candados», sus «Verificado por mutación» y sus 🩸.
> La REGLA vigente (sin la historia) vive en «Invariantes por módulo» de `cxc/CLAUDE.md`.

---

## Asistencia — el almuerzo es FIJO y quién marca sin ir en planilla (13-ago-2026)

> Daniel va a usar la **planilla** de verdad (calcular pago, horas extra, tardanzas), así que estas dos cosas dejaron de ser cosméticas.
>
> ### 1. EL ALMUERZO ES SIEMPRE 30 MINUTOS — una sola fuente
>
> Daniel, textual: *"todos 30 minutos de almuerzo (puedes quitar la opcion de elegir tiempo de almuerzo, siempre es fijo 30 mins)"*.
>
> 🩸 **HABÍA DOS PERILLAS PARA EL MISMO DATO**, y es la forma conocida de que dos números se separen: la columna `asistencia_horarios.almuerzo_minutos` (por persona, con botones de 30 y 60 en Horarios) y la regla `almuerzo_default_min` de `asistencia_reglas` (una casilla más en «Reglas del cálculo»). **Medido en producción el 13-ago-2026: las 33 personas con horario tienen 30, sin UNA excepción en toda la historia de la tabla, y la regla también vale 30.** Era una perilla que nadie usó nunca y que solo podía quedar mal puesta.
> - **Fuente única: `ALMUERZO_FIJO_MIN` (`src/lib/asistencia/config.ts`).** `almuerzoDefaultMin` salió de `ReglasAsistencia`, de `validarReglas`, de `reglasDesdeFila` y de `reglasHaciaFila`: mandarlo en el cuerpo ahora se **ignora**, y una fila vieja de la base con otro valor **ya no se lee**.
> - 🔴 **LA COLUMNA POR PERSONA NO SE BORRA Y EL CÁLCULO LA SIGUE LEYENDO** (lo pidió Daniel). Borrar una columna es irreversible y no compra nada: lo que se retira es la POSIBILIDAD DE ELEGIR MAL. La pantalla de Horarios la muestra como dato (`30 minutos`) y **el PUT escribe `ALMUERZO_FIJO_MIN` mire lo que mire el cuerpo** — esconder los botones sin cerrar la ruta habría sido cosmético, y el almuerzo entra en la jornada con la que se valúa una ausencia, o sea en plata.
> - `asistencia_reglas.almuerzo_default_min` **queda en la base con su 30** (el upsert solo pisa lo que manda) y nadie la lee. En la pantalla, el almuerzo pasó de ser una CASILLA a ser una regla declarada en «Esto no se cambia desde acá», junto a las otras tres.
>
> ### 2. «SERVICIO PROFESIONAL» — marca en el reloj y NO va en planilla
>
> Daniel sobre **YULISSA JUAREZ** (código 26): *"yulissa es servicio profesional, no esta en planilla pero quiero medir asistencia"*.
>
> 🩸 **El módulo no sabía decir eso.** Una ficha sin salario era, para TODAS las pantallas, un dato PENDIENTE: salía en «les falta el salario», en la píldora «Falta configurar» y en la sección ámbar de la planilla — o sea que una decisión de negocio se veía **idéntica a un olvido, para siempre**. Y peor: el día que alguien le escribiera un salario "para que deje de molestar", el sistema le habría calculado quincena, seguros y neto sin que nadie lo pidiera.
> - **Las dos mitades:** FUERA de todo cálculo de pago · **DENTRO** del control de asistencia (marcaciones, tardanzas, ausencias, horas y reportes). La segunda es la que Daniel quiere conservar, y por eso **esto NO se resuelve dando de baja a la persona**: la baja la sacaría también del reporte.
> - 🔴 **EL CANDADO DEL PAGO ES `armarLinea` (`planilla.ts`), no la falta de sueldo:** el `if` pregunta por la BANDERA, así que una ficha marcada **con salario cargado tampoco produce un centavo**. `LineaPlanilla.fueraDePlanilla` es un tercer estado —ni pagada ni pendiente—: `totalizar` lo cuenta aparte de `sinConfigurar`, `faltantesDe` deja de pedirle salario y jornada (la **empresa sí** se sigue pidiendo: separa las tres planillas), y en pantalla/Excel/PDF va en **gris**, nunca en ámbar (el color es la mitad del mensaje).
> - **Por qué una bandera y no "no tiene salario":** un salario en blanco es AMBIGUO y hoy conviven los dos casos — YULISSA es servicio profesional, y GABRIELA JARAMILLO (53) y YEISHKA DIAZ MARKHAM (54) son altas de Boston a las que **todavía les falta el sueldo**.
> - ⚠️ **DDL ADITIVA PENDIENTE — `supabase/migrations/20260813120000_asistencia_servicio_profesional.sql`, la corre Daniel A MANO. La app funciona ANTES de que corra** (patrón `cols-opcionales`): `leerPersonas` es ahora una ESCALERA (todo → sin `servicio_profesional` → sin las columnas de baja → sin tabla) y cada peldaño se baja solo si el error NOMBRA la columna que ese peldaño quita. Sin la columna nadie queda fuera de planilla y la pantalla dice qué archivo falta; el PUT **no guarda a medias**: si se estaba marcando a alguien devuelve 503 con el aviso, y si no, reintenta sin la columna para que poner un nombre o un salario siga funcionando igual que ayer.
>
> ### La prueba de que NO se movió un centavo
>
> `DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_verif-planilla-no-se-movio.ts` (solo lectura) corre el motor **VIEJO** —sacado de `origin/main` al ejecutar, no una copia versionada que envejece— y el NUEVO sobre los MISMOS datos de producción. Medido el 13-ago-2026, 4 quincenas × 3 empresas: **148 líneas, 2.040 cifras de dinero, 0 diferencias** (netos idénticos: Boston $4.282,97 / $4.595,93 / $4.255,86 · Vistana $1.704,88 / $1.990,38 / $1.837,13 · Fashion Wear $1.745,14 / $1.544,76 / $1.345,97). La 2ª pasada marca al código 26 y demuestra lo que importa del cambio 2: **0 cambios en las otras personas y los totales de las 3 empresas idénticos**; lo único que se mueve en Yulissa es que pierde «falta el salario», gana `fueraDePlanilla` y **conserva sus horas exactamente iguales**.
>
> **Los 3 anchos, en el navegador contra el build de producción y CONTRA `origin/main`** (`BASE=… ETAPA=antes|despues node scripts/_medir-asistencia-almuerzo-planilla.mjs`, solo lectura): **390 · 834 · 1440 → 0 px de arrastre y 0 blancos táctiles bajo 44 px en las 4 pantallas** (ficha, Horarios, Reglas y Planilla), y los recortes y textos chicos **idénticos elemento por elemento a main** (el `h1.sr-only` y los `truncate` del nombre; los 10,5 px son las etiquetas de columna que el módulo ya tenía). Lo único que cambió en pantalla: **78 botones de almuerzo → 0** y «Almuerzo por defecto» fuera de las reglas.
> - 🩸 **Gotchas de medición, los dos costaron una vuelta:** esta app **no tiene `<main>`**, y quedarse con el primer `div[class*="transition-"]` agarra un overlay VACÍO del menú → 0 en todo y verde sin haber mirado nada (se elige el contenedor con más texto); y la pestaña vive en la URL (`?tab=configuracion`), no en un clic.
>
> Candados: `src/__tests__/lib/asistencia-almuerzo-fijo.test.ts` (13) y `asistencia-servicio-profesional.test.ts` (20). **Ejecutan la conducta, no buscan texto**: llaman a los PUT REALES con supabase mockeado y miran qué fila se escribe. **Verificado por mutación, 10 de 10 cazadas:** calcularle pago al servicio profesional (4 tests), volver a pedirle el salario (2), contarlo como pendiente (1), que el PUT acepte el almuerzo del cuerpo (2), que el almuerzo vuelva a entrar por reglas (2), dejar de leer la columna por persona (2), que la pantalla vuelva a pedir el salario (1), guardar a medias sin la columna (1), mezclarlo en el orden con los que cobran (1) y que la pantalla deje de declarar el almuerzo fijo (1).


---

## Asistencia — la planilla por RANGO de fechas y la marcación AL SEGUNDO (13-ago-2026)

> Daniel pidió dos cosas el mismo día, y las dos son de plata.
>
> ### 3. LA PLANILLA POR UN RANGO DE FECHAS CUALQUIERA
>
> Antes solo se podía pedir por quincena. Ahora el selector tiene dos modos —**Quincena** (lo que se mira el 95% de las veces, y sigue siendo lo que abre la pantalla) y **Rango de fechas**— y las horas, extras, tardanzas y ausencias se cuentan solo dentro de esas fechas.
>
> 🔴 **EL SUELDO ES MENSUAL, ASÍ QUE PRORRATEARLO NECESITA UNA REGLA. LA ELEGIDA: la fracción de QUINCENA que el rango cubre**, no la de mes ni la de días hábiles. Se eligió por una razón verificable: **es la única que deja la quincena en factor exactamente 1**. El negocio paga medio sueldo por quincena sin importar que tenga 15 o 16 días (`salario ÷ 2`, y el día 31 no paga base); prorratear por días del MES daría 15/31 = 0,4839 para la primera de julio — **un 3% menos en TODAS las planillas por haber agregado una pantalla**. Para un rango partido, cada quincena aporta su parte: del 25-jul al 10-ago = **7/16 + 10/15 = 1,104167**.
> - **`factorBase` viaja hasta `calcularDinero` y su valor por defecto es 1**, así que todo lo que ya existía sigue dando el mismo número sin tocar una llamada. `× 1` no cambia un número IEEE-754: con el factor por defecto es literalmente el `centavos(salarioMensual / 2)` de siempre.
> - 🩸 **Un factor `NaN`/0/negativo cae en 1, NUNCA en $0** — y el guard va en `calcularDinero`, no solo en `armarPlanilla`: `centavos(NaN)` devuelve 0, o sea una planilla de $0 que se paga en silencio. Ante la duda se paga la quincena completa, que es lo que se pagaba ayer.
> - ⚠️ **LOS MONTOS ESCRITOS A MANO NO SE REPARTEN.** Viven por quincena —`asistencia_planilla_manual.quincena` tiene un CHECK que solo acepta `2026-07-2`— así que en un rango libre **no se aplican y las celdas se muestran apagadas**, con el aviso en ámbar arriba de todo: repartir un ISR por días sería inventar plata. Para pagar, se elige la quincena.
> - **El aviso del rango libre va PRIMERO y no se esconde detrás de un ⓘ**: dice cuántos días son, qué porcentaje del sueldo quincenal se está pagando y que los montos a mano no entran. También viaja al **Excel y al PDF** (subtítulo + hoja «Cómo se calcula»): el papel se manda por correo y sobrevive a la conversación donde se explicó.
> - **El camino viejo NO se tocó:** `?quincena=2026-07-2` sigue funcionando igual, y si el rango COINCIDE con una quincena, `periodoDesdeRango` devuelve el período de ESA quincena (misma clave de montos manuales, factor 1). **Medido contra la ruta real en el build de producción: los dos caminos dan el MISMO cuadro, campo por campo, en 6 combinaciones** (2 quincenas × 3 empresas).
> - **Tope de 366 días** y validación de fechas (`2026-02-31` → 400): cada consulta pagina TODAS las marcaciones del rango, y un rango de diez años sería una forma de tumbar la base desde la barra de direcciones.
>
> ### 4. LA MARCACIÓN SE MIDE AL SEGUNDO
>
> Daniel, textual: *"y la marcancion tiene que ser al segundo, porque redondeas minutos"*.
>
> 🩸 **EL DATO SIEMPRE ESTUVO COMPLETO** (medido: 198 de las últimas 200 marcaciones traen segundos ≠ 00). Lo que redondeaba era el CÁLCULO: `minutosDelDia` devolvía minutos enteros y empujaba los segundos al minuto más cercano, con un comentario al lado que decía *"discutir por segundos es exactamente lo que la tolerancia evita"* — un argumento que **confunde medir con perdonar**. La tolerancia perdona 10 minutos a la entrada y sigue igual; lo que no se puede es medir mal a la salida, porque ahí no hay nada que perdonar y el error se paga a 1,25 o 1,50.
> - **`segundosDelDia` es la unidad del día entero.** Los umbrales de negocio siguen en MINUTOS y se escalan: tolerancia, mínimo de hora extra y almuerzo no cambiaron ni un número. `minutosDelDia` sigue existiendo **solo** para sugerir la hora de salida (elegir entre 16:30 y 17:00 con la mediana no cambia por 29 segundos, y no toca plata).
> - 🔴 **LAS MARCAS SE MUESTRAN CON SEGUNDOS** (`08:04:39`, en pantalla y en el papel). Son el dato del que sale todo: si el papel dijera 08:04, nadie podría reproducir a mano las horas que la planilla paga.
> - **Los minutos se muestran con 2 decimales cuando tienen fracción** (`fmtMin`, fuente única de pantalla y exports). Redondear cada celda al entero haría que la columna no sumara su propio total.
> - ⚠️ **EL REDONDEO DEL DINERO NO SE TOCÓ.** `centavos` y su corrección de coma flotante quedaron intactos — eso es de plata, no de tiempo.
>
> ### La prueba de que ninguna regla se movió, y el impacto REAL
>
> `DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_verif-planilla-segundos-impacto.ts` (solo lectura). 🔴 **Acá no se espera un cero —medir mejor cambia números, ese es el punto—: lo que se prueba es más fuerte.** Se le dan al motor NUEVO las marcas REDONDEADAS al minuto (lo que hacía el viejo) y se exige que dé **EXACTAMENTE lo mismo que `origin/main`, campo por campo**. Medido el 13-ago sobre 3 quincenas × 3 empresas: **🟢 idéntico**. Toda la diferencia viene de la precisión del reloj y de nada más.
> - 🩸 **Una tolerancia de "30 s por marca" NO servía, y medirlo lo demostró: en un UMBRAL, 29 segundos mueven MINUTOS.** Los 3 casos reales: quien marcó **8:10:15** pasa de 0 a **10,25 min** de tardanza (la gracia son 10 minutos y el atraso se cuenta DESDE las 8:00 — regla vieja, sin cambios; lo que cambió es de qué lado del umbral cae el segundo), y quien se quedó hasta **17:29:31** pierde los 30 minutos de extra porque no alcanza el mínimo de 30 (en producción `extra_minimo_min` = 30). Un tope por marca habría marcado eso como "regla rota" **y habría dejado pasar un error real de 1 minuto**.
> - **Impacto en dólares, 3 quincenas × 3 empresas: $22.918,02 → $22.914,74 (−$3,28).** Los tres más movidos: ANDREA PEREZ −$1,73 (−29,43 min de extra), CARLOS BALTODANO −$1,05, ANDRES GONZALEZ −$0,64. Las otras 34 personas se mueven ±$0,09 o menos.
> - ⚠️ **Si Daniel prefiere que 8:10:15 no sea tarde, NO hay que tocar código: se sube la tolerancia a 11 minutos en «Reglas del cálculo».** Ya es configurable.
>
> **Los 3 anchos, en el navegador contra el build de producción** (`BASE=… node scripts/_medir-asistencia-rango-segundos.mjs`, solo lectura): **390 · 834 · 1440 → 0 px de arrastre y 0 blancos táctiles bajo 44 px** en Planilla (modo quincena y modo rango) y en el Reporte con el detalle abierto. Los recortes (3 a 390, 1 en los otros) y los textos de 10,5 px son **los mismos que ya medía el módulo antes de este PR**.
> - 🩸 **Dos gotchas más de medición, y los dos daban verde sin haber mirado nada:** contar `tbody tr` a secas mezcla las filas de la tabla ANIDADA del detalle con las de las personas —el índice deja de significar "la persona i" y los clics terminan abriendo y cerrando a la misma—, y buscar horas con segundos en `document.body` encuentra la del banner del reloj aunque el detalle esté vacío (se cuentan solo dentro de la tabla anidada). El script **falla** si no encuentra el selector, el aviso del rango libre o una marca con segundos.
>
> Candados: `asistencia-planilla-rango.test.ts` (17) y `asistencia-segundos.test.ts` (15). **Verificado por mutación, 6 de 6 cazadas:** prorratear por días del mes rompe 6, volver a redondear la marca al minuto rompe 9, quitarle la tolerancia a la tardanza rompe 6, quitar el guard del factor (NaN → planilla de $0) rompe 1, aplicar los montos manuales en un rango libre rompe 1, y descartar los segundos en la frontera de las 18:00 rompe 1.


---

## ✅ Asistencia — LA REGLA DE PRORRATEO, CERRADA POR LA CONTADORA (13-ago-2026)

> Daniel había contestado que el prorrateo era *"8 horas por dias por los total de dia trabajado"*, que **no es** lo que hace el módulo. Se midió contra producción ANTES de tocar el cálculo, se paró y se preguntó — y la respuesta cerró el tema:
>
> **Daniel, textual:** *"pero me dijo mi contable que el calculo dio exacto, solo le falto elegir la fecha exacta y no redonear minutos"*.
>
> O sea: **lo que faltaba eran las dos cosas que ya se construyeron** (el rango de fechas libre y medir al segundo). **La matemática de la planilla NO se toca.**
>
> ### Por qué se paró, y por qué estuvo bien parar (`scripts/_medir-prorrateo-daniel.ts`)
>
> | quincena | días hábiles | hoy (`salario ÷ 2`) | 8 h × días hábiles |
> |---|---|---|---|
> | 1 al 15 de julio | 11 | $9.647,40 | $9.204,80 (**−4,6 %**) |
> | 16 al 31 de julio | 12 | $9.647,40 | $10.041,60 (**+4,1 %**) |
> | 1 al 15 de agosto | 10 | $9.647,40 | $8.368,00 (**−13,3 %**) |
>
> El mismo sueldo habría pagado **13 % menos en una quincena que en otra** según cuántos lunes-a-viernes le tocaron. Implementarlo "porque lo dijo el dueño" habría roto una planilla que la contadora ya daba por exacta.
>
> ### ⛔ Las tres dudas que quedaron abiertas están CONTESTADAS. Ninguna era un bug
>
> 1. **Las 13 personas de 48 h/semana están BIEN cargadas.** Daniel: *"no"*, explícito — no se pasan a 40. Su jornada **contratada** es de 48 horas, aunque marquen lunes a viernes.
> 2. **La media hora de los que salen 17:00 NO es hora extra.** Daniel, textual: *"los que salen a las 5 no es mediahora extra, sino que eso es un reemplzao de sus horas para completar 48 mensuales, me explico? aun q alfinal no se completa"* — se quedan media hora de lun-vie para **reponer el sábado que no trabajan**, no completan las 48, y **está bien así**: no genera extra ni deducción. (Por eso «nadie marca sábado» con divisor 208 NO era un error de carga.)
> 3. **Días trabajados = días con marcación, y la incapacidad justificada SÍ SE PAGA.**
>
> ### 🔴 La incapacidad justificada se paga, y ahora hay candado EN DÓLARES
>
> El módulo ya lo hacía —un día justificado no es `ausente`, así que no entra a `ausenciaMin`— pero **no había un solo test que lo probara en dinero**, y la diferencia entre "se paga" y "no se paga" era un `!justificado` que alguien podía borrar sin que se cayera nada.
> - **Verificado en producción con el caso real:** MARTHA ASUCENA CHAVARRIA Z. (código 43) tiene dos días sin marcas en la quincena 1-15 de agosto — el **4 con «Incapacidad»** y el **14 sin justificar**. El 4 sale `ausente=false` y **no se le descuenta**; el 14 sí. Se le descuenta **un** día, no dos.
> - Candado nuevo: sin justificación el día se descuenta, con incapacidad **el neto es idéntico al de haber trabajado**, y el día se sigue viendo aparte (`ausenciaJustificadaDias`) en vez de desaparecer.
>
> ### Lo demás que quedó confirmado y con candado
>
> - **Décimo tercer mes y vacaciones NO se provisionan** (*"se registran cuando se pagan"*). Se verificó el cálculo línea por línea: no había nada que sacar. El test fija las **20 columnas exactas** de `DineroLinea` y la fórmula del bruto.
> - **Seguro social 9,75 % y educativo 1,25 % son los correctos** y salen del BRUTO.
> - **La quincena no depende de sus días hábiles** (10, 11 o 12 → la misma base).
> - **Verificado por mutación:** volver a descontar la incapacidad rompe 3 tests; prorratear con `8 h × días hábiles` rompe 14.
>
> **La distinción del servicio profesional ya existía en la contabilidad:** a Daniel y a David se les paga por **SERVICIOS PROFESIONALES (6.02.01)**, otra cuenta que **SALARIOS POR PAGAR (2.01.05.01)**. Va en el ⓘ de la ficha, donde la contable reconoce los números de cuenta.



---

## 🔴 Asistencia — EL 90% DE LO QUE LA PLANILLA DESCONTABA POR AUSENCIA ERA FALSO (14-ago-2026)

> La contadora corre la primera quincena real en 2 días. Una auditoría medida contra producción encontró que de los **$1.127,78** que la planilla descontaba por ausencia en la quincena del 1 al 15 de agosto, **$1.013,87 (el 90%) eran falsos**. Reales: **$113,91**.
>
> 🔴 **NINGUNO DE LOS TRES ARREGLOS TOCA EL MOTOR DE CÁLCULO.** `planilla.ts` está cotejado al centavo contra el Excel de la contadora y su matemática NO se tocó: ni una fórmula, ni un redondeo, ni un recargo. Los tres son sobre **qué días entran** al cálculo y **de quién se abstiene el sistema**.
>
> ### 1. El día que no terminó no puede ser ausencia
>
> `armarReporte` sabía callarse el día en curso desde el 13-ago —lo usaba el Reporte— y **la Planilla no le pasaba `diaEnCurso`**: un `grep` sobre `route.ts`, `PlanillaTab.tsx`, `planilla.ts` y `planilla-exportar.ts` daba **cero**. Resultado medido: las **33 personas** salían ausentes el **14-ago (hoy)** = **$866,99**.
> - 🔴 **Y NO ALCANZABA CON EXCLUIR HOY.** `diaEnCurso` excluía UNO solo (`fecha === diaEnCurso`): abierta la quincena un día 3, quedaban ~9 días hábiles futuros contándose como falta **a ~$870 cada uno**. La comparación pasó a **`fecha >= diaEnCurso`** — *"de acá en adelante todavía no pasó nada"*. Un día futuro no es que "no terminó": es que ni siquiera empezó.
> - **El día es el de PANAMÁ (`hoyPanama()`, UTC−5 fijo).** Agrupar por UTC ya dio números falsos dos veces en este módulo: entre las 7 p.m. y la medianoche el día salta y "hoy" pasaría a ser mañana.
> - ⚠️ **Se pasa SIEMPRE, sin mirar si cae dentro del período.** Una quincena vieja no tiene ningún día que lo alcance y su cálculo no se mueve un centavo: eso es lo que hace que reimprimir julio siga dando lo de julio.
> - 🔑 **Lo que ya se trabajó se sigue midiendo**: quien llegó tarde HOY se lo cobra igual. Lo único que se suspende es el veredicto (`ausente` y `revisar`), no la medición.
> - **Aviso arriba del cuadro** (`avisoPeriodoAbierto`, azul): *«Esta quincena todavía no termina — falta 1 día hábil. Los días que no pasaron no se cuentan.»* Desaparece solo cuando el período cierra — un cartel permanente se deja de leer.
>
> ### 2. Quien entró o salió a mitad del período NO recibe un número inventado
>
> **YEISHKA DIAZ (54)**, ingreso 10-ago, salía ausente el 3, 4, 5, 6 y 7 —días en que no trabajaba acá— y su neto quedaba en **$133,34 sobre un quincenal de $300**. **GABRIELA JARAMILLO (53)**, ingreso 4-ago, ausente el 3.
> - 🔴 **EL ARREGLO OBVIO ES EL EQUIVOCADO, y hay un test que lo demuestra en dólares:** medirla solo desde su ingreso le borra las ausencias y le paga **$300 completos** por 4 días trabajados de 10 hábiles. Las dos cuentas automáticas están mal por lados opuestos.
> - **Lo que Daniel decidió: el sistema NO le calcula pago.** Sale en **«Decidilo vos»** con la leyenda *«entró el 10 de agosto de 2026»*, con el quincenal que le correspondería a la vista, y **fuera del total**. La contadora usa el **rango de fechas libre** (10 al 15), que ya existe. Textual: *«pero igual nos pagan por quincena, no? Solo hay que escoger cada vez de qué fecha a qué fecha se calcula y ya»*.
> - 🔑 **Es la MISMA regla que el módulo ya aplica** y que está escrita en `planilla.ts`: cuando el sistema no puede saber, se abstiene. *"Descontarle la quincena entera en automático sería inventarle una renuncia; pagarle completo, inventarle unas vacaciones."* **NO SE CONSTRUYÓ PRORRATEO.** La única cifra que se muestra es la quincena COMPLETA, rotulada como lo que le TOCARÍA — nunca una fracción calculada por el sistema.
> - **El candado del pago vive en `armarLinea`, en el MISMO `if` que el de servicio profesional**: no pregunta por el sueldo ni por los días, pregunta por el motivo. Con salario cargado, marcando todos los días, sigue sin producir un centavo.
> - ⚠️ **29 de 38 fichas no tienen `fecha_ingreso`** (medido): con ésas `motivoPeriodoParcial` devuelve `null` y se comportan EXACTAMENTE como hoy. Los bordes son ESTRICTOS: quien entró el primer día del período (o salió el último) trabajó el período completo.
>
> ### 3. Quien tiene justificación viva sale del cajón «falta configurar»
>
> **RODRIGO MIRANDA** (Trabajo fuera de la oficina, 1→13 ago) y **ELOYN MENDOZA** (Vacaciones, 16-jul→13-ago) salían los dos en ámbar diciendo *«falta configurarles algo… se arreglan en Configuración»* — **y en Configuración no hay nada que arreglarles**.
> - **La bolsa ámbar se partió en DOS grupos con nombre propio** (`grupoDeLinea`, fuente ÚNICA usada por la pantalla, el orden, los totales, el Excel y el PDF): **«Falta un dato»** (ámbar, con el botón a Configuración) y **«Decidilo vos»** (GRIS, con el motivo escrito —*«Vacaciones del 16 jul 2026 al 13 ago 2026»*— y el quincenal que les correspondería). El color es la mitad del mensaje: ámbar dice "arreglame".
> - ⚠️ **La justificación solo cuenta cuando la persona NO marcó NI UN DÍA.** Quien se tomó dos días y trabajó trece **cobra normal**: confundir los dos casos le quitaría la quincena entera a quien sí vino. Hay candado.
> - **El código 50** (sin ficha) aparecía **tres veces, una por empresa** — `armarPlanilla` los mete en todas a propósito para que nadie los borre en silencio. Ahora sale del cuadro (`separarSinFicha`) y se muestra **una sola vez arriba**: *«1 código marcó N veces y no tiene ficha (código 50). Hasta saber quién es, no se le puede calcular pago.»* **La intención de que no desaparezca se conserva; lo que cambia es dónde se muestra.**
> - **Los avisos viajan al Excel y al PDF**: el papel se manda por correo y sobrevive a la conversación donde se explicó.
>
> ### La medición contra producción
>
> `DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_verif-planilla-dias-que-no-pasaron.ts` (solo lectura) corre la lógica de la ruta **VIEJA** —sacada de `origin/main` AL EJECUTAR, no una copia versionada que envejece— y la nueva sobre los MISMOS datos:
>
> | | antes | después |
> |---|---:|---:|
> | Ausencias (3 empresas) | **$1.127,78** | **$113,91** |
> | Neto | $7.194,92 | $7.583,01 |
> | Yeishka (54) | neto $133,34 | **sin número** · «entró el 10 de agosto» · quincena completa $300,00 |
> | Gabriela (53) | neto $206,62 | **sin número** · «entró el 4 de agosto» · quincena completa $300,00 |
> | Rodrigo (13) | ámbar «no marcó ni un día» | **gris** · «Trabajo fuera de la oficina del 1 ago al 13 ago» · $400,00 |
> | Eloyn (29) | ámbar «no marcó ni un día» | **gris** · «Vacaciones del 16 jul al 13 ago» · $283,26 |
> | Código 50 | 3 filas (una por empresa) | 1 aviso arriba |
>
> 🔴 **Y LAS DOS QUINCENAS YA CERRADAS DE JULIO NO SE MOVIERON: 1.264 cifras comparadas, 0 diferencias** (Boston $4.264,23 y $4.550,78 · Vistana $2.092,04 y $2.379,29 · Fashion Wear $1.699,15 y $1.500,22, idénticos antes y después). El script **falla** si una sola cifra cambia, si Yeishka cobra, o si el código sin ficha sigue adentro del cuadro. Para reproducir la auditoría desde cero: `scripts/_diag-planilla-dias-que-no-pasaron.ts`.
>
> **Los 3 anchos (+ el iPad acostado), en el navegador contra el build de producción y con datos de producción** (`BASE=… node scripts/_medir-planilla-dias-que-no-pasaron.mjs`, solo lectura, en las 3 empresas): **390 · 834 · 1024 · 1440 → 0 px de arrastre, 0 blancos táctiles bajo 44 px y 0 textos NUEVOS bajo 12 px** en los 12 casos. Los únicos recortes son el `H1.sr-only` (77 px) y el `truncate` del nombre en la tarjeta de celular — los dos PRE-EXISTENTES, en código que este PR no toca; los textos de 10-11 px son las etiquetas de columna que el módulo ya tenía. El script **falla** si la planilla sale vacía, si falta alguno de los tres avisos, o si el del código sin ficha aparece más de una vez.
>
> **Candados:** `src/__tests__/lib/asistencia-dias-que-no-pasaron.test.ts` (38, incluido un bloque que llama al **handler REAL de la ruta** — el bug original era que la ruta no pasaba el parámetro, y eso ninguna prueba del motor puede verlo) y **`src/__tests__/components/asistencia-planilla-decidir-pantalla.test.tsx` (10), que RENDERIZA `PlanillaTab`** y lee los renglones: que `grupoDeLinea` devuelva "decidir" no prueba nada sobre lo que la contadora ve.
> - **Verificado por mutación, 16 de 16 cazadas:** volver a `===` en el motor (1) · que la ruta deje de pasar el día de hoy (1) · quitarle a `armarLinea` el candado de la abstención (7) · que `armarPlanilla` deje de pasar el motivo (7) · que la ruta deje de armar el mapa de vigencia (1) o el de justificaciones (1) · contar «decidir» como pendiente (2) · que `separarSinFicha` no separe (1) o que la ruta no lo llame (1) · `quincenalReferencia` siempre null (3) · aflojar el borde del ingreso (1) · aplicar la justificación a quien SÍ marcó (1) · que la pantalla vuelva a una sola bolsa ámbar (5) · que pierda el aviso del período (1) o el del código sin ficha (2) · que la ruta deje de mandar el aviso (1).
> - 🔑 **Ningún candado busca texto en un archivo**: todos ejecutan la conducta y miran los dólares o el DOM. En este repo ya fallaron varios candados por leer sus propios comentarios.


---

## 🔴 Asistencia — LA MARCACIÓN DEL RELOJ NUNCA SE BORRA NI SE EDITA (13-ago-2026)

> Daniel, textual: *"en asistencia- reporte, quiero poder editar el registro de marcacion en caso de caso especial, se puede? o enrreda mucho?"*. Y a las dos preguntas del diseño: **"1. todos pueden corregir. 2. si"** (la razón es obligatoria).
>
> ### 🔴 LA REGLA QUE NO SE NEGOCIA
>
> `asistencia_marcaciones` **es lo que dijo el reloj, y es la única prueba de a qué hora entró una persona — o sea que define un pago.** Un UPDATE ahí destruye esa prueba para siempre y no hay de dónde recuperarla (el reloj tiene memoria limitada y los eventos viejos se le caen). **Por eso la marcación queda INTACTA y la corrección va ENCIMA**, en `asistencia_correcciones`. La corrección manda para el cálculo; en pantalla se ven las dos:
>
> ```
> mié 5 ago   08:00:00   12:00:23   12:31:07   17:04:12   Revisar
>             Reloj 08:47:12 → 08:00 · "se le dañó el carro, avisó" · Daniel · 13 ago
> ```
>
> Es el MISMO patrón que Guías (el texto que escribió bodega se conserva; encima va `guia_items.cliente_codigo`) y que `mk_proyectos.tienda` + `tienda_codigo`. **No es un patrón nuevo.**
>
> ### El caso que Daniel no nombró y es el más común: la marcación que NO existe
>
> Quien **olvidó marcar** no tiene registro que corregir. **Medido en producción el 13-ago-2026** (`DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-marcaciones-incompletas.ts`, solo lectura) sobre las **3.894 marcaciones cargadas** (1-jul → 13-ago, 38 personas, 1.020 días-persona):
>
> | Marcas en el día | Días-persona | % |
> |---|---:|---:|
> | 1 (entrada sin salida) | 12 | 1,2% |
> | 2 (sin almuerzo) | 69 | 6,8% |
> | 3 (falta una) | 85 | 8,3% |
> | **4 (completo)** | **789** | **77,4%** |
> | 5-7 (de más) | 65 | 6,4% |
>
> 🔴 **231 de 1.020 días están mal marcados (22,6%)**, **97 con número IMPAR de marcas** (falta una) y **12 con una sola**. Más **24 días hábiles sin NINGUNA marca y sin justificación**. **No es un caso raro: es pan de todos los días**, y por eso se puede **AGREGAR** una marcación faltante con el mismo motivo obligatorio y la misma firma.
>
> ⚠️ **La marcación agregada NUNCA se escribe dentro de `asistencia_marcaciones`** — se mezclaría con lo que dijo el reloj y se perdería la separación que es todo el punto. Va en `asistencia_correcciones` con `marcacion_id = NULL`, y en pantalla dice *"Marcación **agregada** — el reloj no registró nada"*. En el motor se distingue porque `DiaReporte.marcasIds[i]` viene en `null`.
>
> ### Dónde entra al cálculo
>
> `aplicarCorrecciones` (módulo PURO, `src/lib/asistencia/correcciones.ts`) devuelve una **COPIA** de la lista de marcaciones con las horas corregidas, y **las DOS rutas la aplican ANTES de llamar al motor**: `/api/asistencia/reporte` y `/api/asistencia/planilla`. 🔴 **Si la corrección no llegara al pago, no serviría para nada**: la pantalla diría una cosa y la planilla pagaría otra.
> - **`DiaReporte.correcciones` y `resumen.diasCorregidos` son INFORMATIVOS y no entran en ninguna cuenta** — las horas ya vienen aplicadas. Hay un test que le pasa al motor un mapa lleno de correcciones absurdas y exige que ni un minuto se mueva.
> - 🔑 **Una corrección NO puede mover una marcación de DÍA.** Para la forma «pisar una hora», el día sale de la MARCACIÓN (`diaPanama(ocurrio_en)`), nunca del campo `fecha` de la corrección: mover horas de un día a otro es mover plata de una quincena a otra sin que nada lo avise. Y la ruta tampoco se cree la persona ni el día que manda el navegador: los lee de la marcación.
> - **Deshacer NO borra**: `anulada_en` + `anulada_por`. La fila queda y el cálculo vuelve a la hora del reloj. Un botón que no se puede deshacer sobre un dato de pago es una trampa; y deshacer sin dejar rastro es peor que no haber corregido.
>
> ### Quién puede, y la firma
>
> **TODOS los roles de Asistencia** (`asistenciaRoles()` = admin, secretaria, contabilidad). Decisión explícita de Daniel. **Por eso mismo la FIRMA no es opcional**: sale de la sesión (`auth.userName`), nunca del cuerpo del pedido — sin ella, "todos pueden" se vuelve "nadie sabe quién fue". El **motivo es obligatorio** en las tres capas: el botón se apaga y dice qué falta, la ruta rechaza con 400, y el CHECK de la base exige `btrim(motivo) <> ''` (⚠️ `NOT NULL` a secas deja pasar `""` y `"   "`, que es justo lo que teclea quien quiere saltarse el campo).
>
> ### Se ve SIN abrir nada
>
> Arriba de la tabla: *"**1** hora corregida a mano en **1** día. Los números de abajo ya cuentan con eso."* · chip azul **«N días corregidos»** en la fila de la persona · la línea con las dos horas dentro del detalle. Y también en el **Excel** (columna «Corregido a mano» en Detalle con la hora del reloj, la corregida, el motivo y quién; «Días corregidos a mano» en Resumen) y en el **PDF que se firma** (columna «Días correg.» + pie de página). No hay forma de leer un total sin enterarse de que hay una hora tocada a mano.
>
> ### 🔴 EL CANDADO PRINCIPAL, verificado por mutación
>
> `src/__tests__/lib/asistencia-correcciones.test.ts` (42 casos). **BARRIDO ESTÁTICO sobre todo `src/`, sin listas de archivos que se queden viejas**: ningún `.from("asistencia_marcaciones")` puede encadenar `.update(`, `.delete(` ni `.upsert(`. ⚠️ El barrido **borra los comentarios primero** — un candado que se cumple a sí mismo con su propia explicación da permiso para romper (este repo ya se quemó con eso, ver la nota de `revalidateOnFocus`). La ÚNICA forma de upsert admitida es la del INGEST con `ignoreDuplicates: true`, que **nunca pisa una fila**: es lo que hace idempotente el repaso nocturno del reloj. Otro barrido recorre TODAS las migraciones y prohíbe `DROP TABLE` / `TRUNCATE` / `DELETE FROM` sobre la tabla. Y hay **test de CONDUCTA**: llama a la ruta REAL con supabase mockeado y mira qué se escribió de verdad.
> - **Verificado por mutación, 13 de 13 cazadas:** escribir un UPDATE (1) o un DELETE (1) sobre las marcaciones · aflojar el motivo obligatorio (4) · que la planilla NO aplique las correcciones (1) · que el reporte no las aplique (1) · que el select pierda el `id` (1) · que una corrección pueda mover el día (1) · que `aplicarCorrecciones` mute el original (2) · que deshacer borre en vez de anular (1) · que la firma salga del cuerpo (1) · que la ruta se crea la persona/día del cuerpo (1) · la llave con CASCADE en vez de RESTRICT (1) · el motivo sin su CHECK (1).
>
> ### 🔴 SIN CORRECCIÓN NO SE MOVIÓ UN CENTAVO — medido contra producción
>
> `DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_verif-correcciones-no-mueven-nada.ts` (solo lectura) corre el motor **VIEJO** —sacado de `origin/main` AL EJECUTAR, no una copia versionada que envejece— y el NUEVO sobre los MISMOS datos. **4 quincenas × 3 empresas: 150 líneas, 3.992 cifras, 🟢 0 diferencias** (netos idénticos: Boston $4.282,31 / $4.596,04 / $4.465,79 · Vistana $2.177,55 / $2.488,80 / $1.677,11 · Fashion Wear $1.745,05 / $1.544,90 / $1.249,86).
> - **Candado de dinero, con una tardanza REAL de producción:** ALEJANDRA CAMAÑO, 1-jul, marcó 08:15 → corregida a 08:00 → tardanza **15,75 → 0,00 min**, neto **$251,94 → $252,64**. **Personas ajenas movidas: 0.** Deshacerla devuelve **620 cifras idénticas** y el neto exacto a $251,94.
>
> ### ⚠️ DDL ADITIVA PENDIENTE — la corre Daniel A MANO, y la app funciona ANTES
>
> `supabase/migrations/20260813150000_asistencia_correcciones.sql`. Patrón `cols-opcionales`: **sin la tabla, la pantalla NO ofrece corregir y lo dice** (*"Pídele a Daniel que corra el archivo…"*), y el cálculo es el de siempre. **Verificado contra producción con la DDL SIN correr** (`scripts/_verif-correcciones-sin-ddl.ts` + el navegador): el reporte carga sus 48 personas, **0 botones de corregir**, el aviso a la vista, y la detección de «falta la tabla» es ESTRECHA — 6/6 casos (permiso denegado, timeout, red caída y «otra tabla no existe» se PROPAGAN, no se leen como migración faltante).
> - 🩸 **Gotcha de verificación:** el primer probe usaba `select(…, { head: true })` y decía **«EXISTE»** sobre una tabla que no estaba creada — con `head` PostgREST puede contestar sin cuerpo y el error se pierde. Un script de verificación que miente es peor que no tenerlo.
>
> ### Los 3 anchos (+ el iPad acostado)
>
> `BASE=… node scripts/_medir-correcciones-anchos.mjs` (solo lectura), en **5 estados** — reporte cerrado, detalle abierto, ventana de corregir, de deshacer y de agregar: **390 · 834 · 1024 · 1440 → 0 px de arrastre, 0 blancos táctiles bajo 44 px y 0 textos bajo 12 px NUEVOS** en los 20 casos. El único recorte es el `H1.sr-only` y los textos de 10,5/10/11 px son las etiquetas de columna y el chip «Revisar» que el módulo ya tenía — **medidos IDÉNTICOS con y sin correcciones**, o sea que este cambio no agregó ni un texto chico (la primera versión sí: el chip y los «Agregar hora» salieron a 11 px y se subieron a 12). Modal con el patrón de la casa: `createPortal` + `inset-0` + `useBodyScrollLock`, **sin `autoFocus`**.
> - 🩸 **La tabla no existe todavía en producción, así que la medición INTERCEPTA la respuesta de `/api/asistencia/reporte`** y le inyecta UNA corrección con la forma exacta que va a tener. Los datos siguen siendo los de producción y el componente medido es el REAL; no se toca la base ni se aprieta ningún botón que guarde. Sin eso no habría nada que medir y el script pasaría en verde sin haber mirado nada — por eso **falla** si no encuentra el aviso, el chip, la línea con la hora del reloj o el botón de guardar apagado.


---

## 🔴 Asistencia — LA CASILLA «PRÉSTAMO» SE LLENA SOLA, CON APROBACIÓN (27-ago-2026)

> La contadora, textual: ***«El préstamo si debe ser por aprobarlo»***.
>
> La casilla `Préstamo` del cuadro quincenal la tecleaba una persona mirando el
> módulo de Préstamos **en otra pantalla**. Ahora la llena el propio módulo —y
> queda editable— pero **el descuento se APRUEBA, no se aplica solo**.
>
> ### 🩸 EL HUECO, MEDIDO CONTRA PRODUCCIÓN (quincena 1 al 15 de agosto)
>
> | | |
> |---|---:|
> | el módulo de Préstamos registró | **9 deducciones · $360,00** |
> | la casilla de la planilla decía | **7 montos · $265,00** |
>
> - **KEVIN LUBO ($50) · LUIS PARAJON ($45) · YULICAR CORONA ($50)** tenían la
>   deducción registrada en el módulo y **la casilla en CERO**.
> - **LUIS ARROYO** tenía **$50 en la casilla y NINGÚN pago en el módulo** — su
>   préstamo estuvo atrapado en `pendiente_aprobacion` hasta el #651, así que la
>   plata se le descontó del sueldo y el saldo del módulo **nunca bajó**.
>   ⚠️ **Eso NO se corrigió desde acá**: es plata en producción y lo decide
>   Daniel. Queda escrito.
> - GABRIELA, MARÍA y LUZ no tenían descuento **y era correcto**: sus préstamos
>   nacieron el 17, 18 y 20 de agosto, o sea DESPUÉS de esa quincena.
>
> ### 🔴 EL AMARRE: por CÓDIGO, y los que no cruzan van A MANO
>
> `prestamos_empleados` guarda un **nombre tecleado a mano** y la planilla
> conoce a la gente por el **código del reloj**. Medido: de las **30 fichas de
> préstamo, 18 cruzan por igualdad EXACTA** de nombre (mayúsculas + espacios) y
> 12 no.
>
> Columna nueva **`prestamos_empleados.empleado_codigo`**
> (`20260902120000_prestamos_amarre_codigo.sql`), con **DOS pasos y ninguno
> adivina**:
> - **PASO 1** — igualdad EXACTA de nombre **y** de empresa, y **solo con un
>   único candidato** en la planilla. La traducción de empresa es una lista
>   CERRADA con `ELSE NULL`: una empresa desconocida no ata «de más».
> - **PASO 2** — **tres renglones escritos a mano**, cada uno con el nombre que
>   ese código tiene que tener en la planilla, y el UPDATE **lo EXIGE**:
>   `GABRIELA A. JARAMILLO P.`→53 · `LUIS ADRIAN ARROYO`→9 ·
>   `MARIA BETHANCOURTH`→49. Si mañana renombran al 53, la migración deja de
>   escribir esa fila en vez de atar el préstamo de Gabriela a otra persona.
>
> 🔴 **NADA POR PARECIDO. NI CON UN CASO BARATO.** Es la lección de
> `Outlet Duty Free N2` vs `N3` (ver § Guías): dos nombres parecidos pueden ser
> DOS personas, y un descuento a la persona equivocada **no deja rastro**. En
> esta misma tabla está el caso que lo prueba: **`LAURA CASIANI` (Préstamos)
> contra `Laura Lismari Casiano Vega` (código 38)** — CASIAN**I** y CASIAN**O**
> no son la misma palabra. **Se queda SIN atar**, aunque su saldo sea $0 y atarla
> hoy no costaría nada.
>
> **Resultado: 21 de 30 atadas, y las 14 con saldo vivo están TODAS atadas.**
> Las 9 sin atar están en $0,00: `LAURA CASIANI` · `LUZ LOPEZ` ×2 (fichas viejas;
> la viva es **LUZ BOSQUEZ**, que la contadora ya renombró y **cruza sola**) ·
> `STEFANY`/`STEPHANY MORALES` · `YANKATERY` · `YEISON LLORENTE` ·
> `JOHANA VALLEJO` ×2.
>
> 🔴 **UN PRÉSTAMO CON SALDO QUE NO ES DE NADIE SE DICE, EN ROJO.** Callarlo es
> exactamente cómo se perdieron los $700 de LUIS ADRIAN ARROYO durante 22 días.
>
> ### 🔴 DE DÓNDE SALE EL NÚMERO — dos casos, no uno
>
> `src/lib/asistencia/prestamos-planilla.ts` (módulo PURO). **Acá NO se vuelve a
> calcular el saldo**: llega ya calculado por la MISMA cuenta del módulo
> (`prestado − pagado` sobre los movimientos aprobados y no borrados, la de
> `prestamos_aplicar_quincena`).
>
> 1. **Si el módulo YA registró el descuento de ESTA quincena**, la casilla dice
>    EXACTAMENTE eso — es un hecho consumado, no una estimación.
> 2. **Si no**, dice `min(cuota, saldo)`, la fórmula de la RPC.
>
> 🩸 **El orden importa y el caso es real.** Si la contadora aprieta «Aplicar
> quincena» ANTES de armar el cuadro, el saldo YA bajó: **KEVIN LUBO** tenía
> saldo $50 y cuota $50, y con la quincena aplicada `min(cuota, saldo)` daría
> **$0 el mismo mes en que se le descontaron los $50**.
>
> - ⚠️ **`Abono extra` NO cuenta como descuento de planilla.** Es plata que la
>   persona pagó de su bolsillo; descontársela otra vez del sueldo sería cobrarle
>   dos veces. Sí baja el saldo, y el saldo ya viene con eso adentro.
>   `Pago de responsabilidad` SÍ cuenta: medido, 59 movimientos y **35 con la
>   nota «Deducción quincenal»**.
> - ⚠️ **VENTANA EXACTA, sin la tolerancia de ±3 días de la RPC.** Los pagos caen
>   el 15 y el 30, o sea justo en el borde: con tolerancia, un pago del 15
>   entraría a la vez en la quincena 1-15 y en la 16-31. El mismo descuento
>   contado dos veces.
> - **La ficha ARCHIVADA no propone cuota nueva** (misma condición que la RPC).
>   Por eso **BRICEIDA MONTERO no aparece**, con $100 de saldo vivo: su ficha
>   está archivada en Préstamos.
> - **Se agrupa por CÓDIGO, no por ficha.** `RAMON MIRANDA` tiene DOS fichas
>   atadas al código 21 y la planilla tiene UNA casilla.
>
> ### 🔴 LA APROBACIÓN NO ESCONDE PLATA — la lección del #651
>
> Hace un día un préstamo de $700 nacía en `pendiente_aprobacion`, el saldo solo
> suma lo aprobado, y **la pantalla lo mostraba en CERO durante 22 días**. Ese
> freno se retiró (*«quita poder aprobar prestamos, todos deben de pasar»*), y
> ésta es **otra aprobación**: no decide si la deuda existe, decide si el número
> entra a la casilla. La forma es la de las horas extra (#649/#652):
>
> - **lo que está sin aprobar SE VE**, con nombre y monto, en ámbar, arriba del
>   cuadro — *«N personas tienen préstamo por descontar sin aprobar: NO se
>   descontó en este cuadro»*;
> - **el saldo del módulo no depende de esta tabla**: un préstamo sin aprobar
>   sigue apareciendo entero en Préstamos;
> - **el aviso viaja al Excel y al PDF** que firma la contadora: si la pantalla
>   avisa y el papel no, el papel decide un pago con menos información.
>
> ⚠️ **Y si la casilla YA tiene monto escrito a mano, NO se dice «no se
> descontó»**: la planilla SÍ lo descontó, y decir lo contrario sería mentirle a
> quien paga.
>
> ### 🔑 SE GUARDA LA DECISIÓN, NO UNA SEGUNDA CUENTA
>
> `asistencia_prestamo_aprobado` (quincena, código) guarda **aprobado + quién +
> cuándo + `monto_visto`**. El MONTO sigue viviendo donde siempre:
> **`asistencia_planilla_manual.prestamo`**, y sigue siendo editable. Aprobar lo
> escribe ahí; `planilla.ts` **no se tocó**.
> - **La llave es la QUINCENA** —y acá sí corresponde: un descuento de préstamo
>   pertenece a un cuadro, igual que el ISR. Las horas extra se aprueban por DÍA
>   porque la contadora mueve el corte del período (#652); esto no.
> - **`monto_visto` es el TESTIGO**: si el módulo cambia o alguien corrige la
>   casilla, la pantalla lo DICE con los dos números — no se corrige solo.
>   *Una plata que se mueve sola es peor que una que se explica.*
> - 🔴 **Retirar la aprobación NO borra un número que escribió una persona**: la
>   casilla se vacía **solo si todavía dice exactamente lo que puso la aprobación
>   anterior**. Si alguien la corrigió, se deja y **se dice**.
> - **Quién aprueba: `asistenciaRoles()`, NO `aprobacionesRoles()`.** Son dos
>   aprobaciones distintas: las horas extra las autoriza Julio con el usuario
>   `bodega`, que a propósito **no ve un solo sueldo**. Un descuento de préstamo
>   ES plata del sueldo. Por eso el bloque vive en la pestaña **Planilla** y no en
>   Aprobaciones, y el candado de `asistencia-bodega-solo-aprueba.test.ts`
>   —que congela los 4 campos de esa respuesta— sigue verde sin tocarlo.
>
> ### ⚠️ LAS DDL YA CORRIERON — y la app funcionaba ANTES
>
> Patrón `cols-opcionales`, verificado en las dos direcciones: sin la columna del
> amarre nadie queda atado y la casilla se escribe a mano como hasta ayer; sin la
> tabla no se puede aprobar y **la planilla da EXACTAMENTE lo de hoy hasta el
> centavo**. Las dos ausencias se DICEN en pantalla, con el nombre del archivo.
> - 🩸 **El escalón de lectura quita LO MÍNIMO.** Un fallback que releyera con las
>   columnas base se llevaría puesto `nombre_manual`… — acá el reintento solo
>   quita `empleado_codigo`, y **solo cuando el error NOMBRA esa columna**.
>
> ### Los números, antes y después
>
> | | antes | después |
> |---|---|---|
> | fichas de préstamo atadas | **0 de 30** | **21 de 30** · las 14 con saldo, todas |
> | préstamos con saldo sin persona | 14 | **0** |
> | casilla `prestamo` de la quincena 1-15 | $280,00 en 8 renglones | **$265,00 en 7** |
> | casilla `mercancia` | $10,00 | **$25,00** |
> | **total de descuentos manuales** | **$385,00** | **$385,00** |
> | JOHANA VALLEJO activa en Préstamos | 1 ficha | **0** (archivada, 78 movimientos intactos) |
> | movimientos de préstamo | 414 · $44.650,21 | **414 · $44.650,21** |
>
> **Saldo vivo hoy: $5.964,73 entre 13 fichas activas** (+ $100,00 de BRICEIDA,
> archivada, = $6.064,73 en 14). ⚠️ El $5.264,73 con el que arrancó este trabajo
> era correcto **para su momento**: creció exactamente $700 cuando el #651 liberó
> el préstamo de LUIS ADRIAN ARROYO ese mismo día.
>
> **Lo que la pantalla va a proponer para la quincena 16-31 de agosto: 13
> personas, $485,00** (`_verif-prestamo-planilla.ts`, solo lectura, corre los
> MISMOS módulos que la pantalla) — **con las 6 que se habían quedado afuera**:
> Kevin $50 · Gabriela $60 · Luis Parajón $45 · Yulicar $25 · María $25 · Luz $15.
>
> ### 🔴 NINGÚN NÚMERO DE PAGO SE MOVIÓ, y está EJECUTADO
>
> El argumento *«las dos columnas están en la misma suma, así que el neto no se
> mueve»* es correcto **y no alcanza**.
> `scripts/_verif-martha-mercancia-no-mueve-nada.ts` (solo lectura) llama a
> **`calcularDinero`, la misma función que paga**, con los montos de antes y los
> de después, sobre **LAS 12 PERSONAS** de la quincena, y compara los 20 campos
> de dinero: **288 campos · 2 cambios (las dos casillas de Martha) · 0 cambios no
> pedidos**, con `totalDeducciones`, `netoPagar` y `totalBruto` verificados por
> su nombre. Y la tabla entera, campo por campo: **72 campos comparados, 2
> distintos y los 2 son los pedidos**.
>
> ### ⚠️ QUEDA ABIERTO — decide Daniel
>
> - 🔴 **A LUIS ARROYO se le descontaron $50 en la quincena 1-15 que el módulo de
>   Préstamos no registra.** Su saldo está $50 alto. Corregirlo es escribir un
>   movimiento de plata en producción y no se hizo.
> - **Aprobar NO registra el pago en el módulo.** La casilla se llena; el saldo lo
>   sigue bajando «Aplicar quincena», como hasta hoy. Que la aprobación además
>   escriba el `Pago` es una decisión de negocio (y el dedup de ±3 días del módulo
>   ya evitaría el doble cobro), no un refactor.
> - **`LAURA CASIANI` vs `Laura Lismari Casiano Vega`**: si son la misma persona,
>   se ata a mano. El sistema **no lo va a adivinar nunca**.
> - Las 6 fichas de saldo $0 sin ficha en la planilla (`STEFANY`/`STEPHANY
>   MORALES`, `YANKATERY`, `YEISON LLORENTE`, `LUZ LOPEZ` ×2) quedan sin atar.
>
> ### Candados
>
> `src/__tests__/lib/asistencia-prestamo-planilla.test.ts` (22) y
> `prestamos-amarre-migracion.test.ts` (13). El segundo **lee el SQL SIN
> COMENTARIOS** —el archivo NOMBRA lo que prohíbe («nada de parecidos», «LAURA
> CASIANI»), así que un barrido sobre el archivo entero se engañaría solo, cuarta
> vez que este repo paga lo mismo— y prohíbe LIKE, similitud, `unaccent`,
> distancia de edición, `substring`, `translate` y regex sobre el nombre; exige
> la empresa, el único candidato, el `EXISTS` que valida el nombre del código, que
> no haya un cuarto amarre a mano, y que el `SET` escriba **exactamente una
> columna** (un `SET empleado_codigo = …, nombre = …` reescribiría el nombre que
> tecleó una persona).
> - **Verificado por mutación, 15 de 15 cazadas y 0 corridas muertas**
>   (`bash scripts/_mutar-candados-prestamo-planilla.sh`): el hecho consumado deja
>   de ganarle a la cuota · `min(cuota,saldo)` → cuota pelada · la ficha archivada
>   propone cuota · el código sale de parecerse al nombre · el aviso de «préstamo
>   sin persona» se calla · el aviso pierde el monto · «Abono extra» se vuelve
>   descuento · dos fichas del mismo código no suman · la migración usa LIKE ·
>   ignora la empresa · ata con dos candidatos · pierde el guard del nombre · pisa
>   un amarre ya hecho · se cuela `LAURA CASIANI` · el backfill reescribe el
>   nombre.
> - 🩸 **El script NO usa `perl -0pi -e 's|…|…|'`**: con ese delimitador, un `||`
>   del código real se des-escapa a una alternación con rama vacía, **se come el
>   archivo entero**, vitest no colecta nada y el «0 fallos» se lee como
>   «SOBREVIVIÓ». El reemplazo es LITERAL (`scripts/_mutar-aplicar.py`, textos por
>   argv), **denuncia el patrón que no muta**, `probar()` **exige que la corrida
>   haya colectado tests**, la restauración va **por COPIA** (hay archivos NUEVOS
>   y `git checkout` aborta el comando entero) y hay una **mutación de CONTROL que
>   a propósito no matchea**: si no sale ⛔, el denunciador está roto y todos los
>   ✅ valen lo mismo que un barrido con el comentario adentro.


---

## 🔴 Asistencia — «TRABAJO FUERA DE LA OFICINA»: el motivo que NO es una ausencia (13-ago-2026)

> El caso: **RODRIGO MIRANDA (código 13, vistana, $800/mes) no marca desde el 31 de julio porque está trabajando FUERA de la empresa.** Daniel, textual: *"rodrigo esta trabajando fuera de la empresa (justificado)"*. Los cinco motivos que había —`Vacaciones · Incapacidad · Permiso · Luto · Otro`— describen a alguien que **NO trabajó**. Rodrigo **sí trabajó**.
>
> | | Vacaciones | Trabajo fuera |
> |---|---|---|
> | ¿se le paga? | sí | sí |
> | **¿trabajó ese día?** | **NO** | **SÍ** |
> | ¿le consume días de vacaciones? | **SÍ** | no |
>
> Metidos como lo mismo, en tres meses nadie puede distinguir quién estuvo de vacaciones de quién estuvo trabajando afuera — y las vacaciones son un derecho que se acumula y se gasta.
>
> 🩸 **SE DICE «OFICINA» Y NO «EMPRESA», aunque la palabra de Daniel fuera "empresa".** En castellano *"está fuera de la empresa"* se lee, con la misma naturalidad, como *"ya no trabaja acá"* — la confusión más cara posible justo en la pantalla que decide un pago. "Fuera de la oficina" dice lo mismo sin esa segunda lectura.
>
> ### ⚠️ NO HIZO FALTA NINGUNA DDL — y está COMPROBADO contra producción, no deducido
>
> `asistencia_justificaciones.motivo` es un `text NOT NULL` **sin CHECK** (`20260805120000_asistencia_reglas.sql`). Pero "las migraciones dicen" no es "la base hace": `npx tsx scripts/_probe-motivo-check.ts` **inserta los 6 motivos de verdad y los borra**, verificando que no quede ninguna fila (PostgREST no expone `information_schema`, así que no hay forma de leer un CHECK). Medido: **6/6 aceptados, 2 filas antes y 2 después.** El centinela es un código imposible (`__PROBE_MOTIVO__`) con fechas de 1900.
>
> ### 🔴 EL PAGO ES EXACTAMENTE EL DE UNA JUSTIFICACIÓN DE HOY — medido contra producción
>
> `DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_verif-motivo-trabajo-fuera.ts` (**solo lectura**; la justificación de Rodrigo se calcula EN MEMORIA, no se escribe). Corre el motor **VIEJO** —sacado de `origin/main` AL EJECUTAR, no una copia versionada que envejece— y el nuevo sobre los MISMOS datos. Medido el 13-ago-2026, 3 quincenas × 3 empresas:
>
> - **El código no mueve nada: 114 líneas · 1.880 cifras de dinero · 0 diferencias 🟢**
> - **Nadie más se mueve al justificar a Rodrigo: 0 personas ajenas movidas 🟢**
> - 🔴 **«Vacaciones» y «Trabajo fuera de la oficina» pagan IDÉNTICO: 94 personas comparadas campo por campo, 0 diferencias 🟢.** Es la prueba directa de "no se descuenta", y no depende de leer un `if`.
> - **Casos reales de "descontado → no descontado"**, con los dos números: HECTOR LEONEL PEREZ **$245,22 → $267,00** (ausencia $24,48 → $0,00) · SAMIR POLO **$207,29 → $228,80** · GABRIELA JARAMILLO **$206,62 → $228,41** · YEISHKA DIAZ **$133,34 → $155,13**. En los cuatro, con «Vacaciones» el neto es EL MISMO.
> - ⚠️ **CERO HORAS EXTRA, y es lo correcto:** sin marcaciones no hay horas que medir. `extraDiurnoMin`, `extraNocturnoMin`, `domingoMin` y `feriadoMin` quedan en 0 — ni se le inventan 8 horas ni se le quitan las de los días que sí trabajó.
>
> 🩸 **HALLAZGO — RODRIGO NUNCA ESTUVO "DESCONTADO", Y LA JUSTIFICACIÓN NO LE CAMBIA EL NÚMERO.** Con **cero marcaciones en toda la quincena** no llega a existir en el reporte, así que la planilla lo lista con `dinero: null` y `faltaConfigurar = ["no marcó ni un día en esta quincena"]` — **antes y después de la justificación, exactamente igual**. Medido, y **ELOYN MENDOZA (29) con «Vacaciones» 16-jul→13-ago sale idéntico**: `dinero=NO · falta=[no marcó ni un día]`. O sea que el motivo nuevo **hereda** el comportamiento que ya había, no estrena uno. Es una decisión deliberada y escrita en `planilla.ts`: *"Descontarle la quincena entera en automático sería inventarle una renuncia; pagarle completo, inventarle unas vacaciones. Se lista y lo decide una persona."* **NO se tocó.** Si Daniel quiere que una quincena 100% justificada se pague sola, es una decisión suya y cambia a los cinco motivos de golpe, no solo a éste.
>
> ### El reporte lo DISTINGUE, que es el punto de haberlo agregado
>
> - El renglón del día dice **«Trabajando fuera de la oficina»**, sin la palabra *ausencia* — el genérico habría sido *"Ausencia justificada — Trabajo fuera de la oficina"*, que afirma lo contrario de lo que pasó. Fuente única: `textoDiaJustificado()` en `motivos.ts`, usada por la pantalla **y** por el Excel.
> - 🔴 **Chip en la fila de la persona: «N días trabajando fuera», SIN abrir nada.** Sin él, quien trabajó todo el mes afuera aparece con «0 días trabajados» y ninguna explicación: idéntico a alguien que no vino.
> - **`resumen.diasTrabajandoFuera` va APARTE de `ausenciasJustificadas`, y los dos conjuntos son DISJUNTOS.** Ningún número histórico se mueve: hasta hoy el motivo no existía, así que no había un solo día que sacar de ahí.
> - **Excel:** la columna «Ausencia» del Detalle pasó a **«Ausencia / justificación»** (a secas ya no alcanzaba), el Resumen gana **«Días trabajando fuera»** en columna propia, y la hoja «Cómo se calcula» explica que **NO es una ausencia**. ⚠️ Al insertar la columna, el índice de la celda que se pinta en ROJO se corrió de 8 a **9**: pintar la de al lado teñiría los minutos tarde, que no son una advertencia.
> - **PDF (el que se firma):** en el papel esa persona sale con «Días 0», así que el pie lo dice — *"N días son de trabajo fuera de la oficina: la persona trabajó (no marcó porque no estaba acá), no se descuenta y no genera extras"*.
>
> ### Los 3 anchos (+ el iPad acostado)
>
> `BASE=… node scripts/_medir-trabajo-fuera-anchos.mjs` (solo lectura), en 3 estados — reporte cerrado, detalle abierto y Justificaciones: **390 · 834 · 1024 · 1440 → 0 px de arrastre, 0 blancos táctiles bajo 44 px y 0 textos bajo 12 px NUEVOS** en los 12 casos. El único recorte es el `H1.sr-only` (77 px) y los textos de 10,5 px son las etiquetas de columna que el módulo ya tenía. El chip mide 20 px de alto y no ensancha la fila.
> - 🩸 **En producción todavía no hay ninguna justificación con este motivo**, así que la medición **INTERCEPTA** `/api/asistencia/reporte` y le inyecta días con la forma exacta que van a tener; los datos siguen siendo los de producción y el componente medido es el REAL. Sin eso el script pasaría en verde sin haber mirado nada — por eso **falla** si no encuentra el chip, el renglón o la opción en el desplegable, y **también si encuentra «Ausencia justificada — Trabajo fuera»**.
>
> ### Candados
>
> `src/__tests__/lib/asistencia-motivo-trabajo-fuera.test.ts` (23) y **`src/__tests__/components/asistencia-trabajo-fuera-pantalla.test.tsx` (6, RENDERIZA `ReporteTab` y `JustificacionesTab` de verdad)**. Ninguno busca texto en un archivo: corren el motor, corren la planilla, arman el Excel y el PDF y leen las celdas. **Verificado por mutación, 15 de 15 cazadas:** `esTrabajoFuera` siempre false (6) · el texto vuelve al genérico en el módulo (2) o en la pantalla (1) · el día cuenta como ausencia justificada (3) · `diasTrabajandoFuera` siempre 0 (3) · el día se marca como AUSENTE, o sea toca el pago (7) · el motivo sale de la lista (1 + 1) · la celda roja del Excel vuelve al índice 8 (1) · el Excel Detalle vuelve al genérico (2) · se quita la columna del Resumen (3) o su valor, que desalinea el TOTAL (1) · se cae el pie del PDF (1) o su total (1) · se cae el chip (2) o queda siempre en plural (1) · se borra la fila de «Cómo se calcula» (1).
>
> ### ❓ NO existe cuenta de días de vacaciones — y NO se construyó
>
> ⚠️ **SUPERADO el 25/26-ago-2026: las vacaciones tienen tabla, pestaña y SALDO propios** — ver *«LAS VACACIONES SE MUDAN DE MESA»*, la sección siguiente. Lo de abajo es de la tarde del 13-ago y se conserva como registro de qué había cuando nació el motivo de Rodrigo; **hoy no describe el sistema**: existen la tabla `asistencia_vacaciones`, las columnas `asistencia_personas.saldo_vacaciones_dias` / `saldo_vacaciones_corte` y `src/lib/asistencia/saldo-vacaciones.ts`, y la justificación con motivo «Vacaciones» **ya no existe** — la borró la migración de la mudanza.
>
> Barrido completo (`supabase/migrations/` y `src/`): **no hay columna, ni tabla, ni cálculo** que lleve el saldo de vacaciones de nadie. `asistencia_personas` tiene nombre, salario, jornada, empresa, activo, fechas de ingreso/salida y `servicio_profesional` — nada de vacaciones. Lo único que existe es la justificación con motivo «Vacaciones» como un rango suelto: **nadie cuenta cuántos días se ganaron ni cuántos se gastaron.** Es una decisión de Daniel y no se construyó.


---

## 🔴 Asistencia — LAS VACACIONES SE MUDAN DE MESA, y ahora SÍ llevan cuenta de días (25/26-ago-2026)

> Es lo que la sección anterior daba por no construido. Tres migraciones aditivas: `20260825160000_asistencia_vacaciones.sql` (la tabla), `20260826040000_asistencia_saldo_vacaciones_inicial.sql` (el arranque del saldo) y `20260826060000_asistencia_saldo_vacaciones_medios_dias.sql` (el medio día).
>
> ### 🔴 UNA VACACIÓN NO ES UNA JUSTIFICACIÓN, Y POR ESO SE MUDÓ
>
> Una justificación explica por qué alguien **faltó** un día que tenía que trabajar; unas vacaciones son un **derecho que se gana, se gasta y lleva su propia cuenta de días**. Metidas en la misma lista, en tres meses nadie distingue quién estuvo enfermo de quién estuvo de vacaciones — y solo una de las dos se acumula. Una vacación es **persona + desde + hasta + un interruptor**, y nada más (`asistencia_vacaciones`, soft delete y RLS sin políticas, como el resto del módulo).
>
> - **La mudanza movió UNA fila y estaba contada ANTES de correr:** de las 5 justificaciones vivas, una sola tenía motivo «Vacaciones» — ELOYN MENDOZA (código 29, 16-jul → 13-ago-2026). El PASO 1 es una vista previa que no escribe y la corrida se para si el conteo no da 1. El orden es **INSERT y recién después DELETE**, y el DELETE borra **solo lo que ya quedó copiado** (`EXISTS` fila por fila): al revés, un INSERT que fallara habría convertido esos días en ausencias.
> - 🔴 **Nació SIN MARCAR a propósito** (`ya_pagadas` en su default `false`): es exactamente como se comportaba siendo justificación. Un default en `true` le habría descontado una quincena entera sin que nadie tocara nada.
> - 🔴 **«Vacaciones» NO está en `MOTIVOS_JUSTIFICACION` NI en `MOTIVOS_RETIRADOS`, y no es un olvido.** Ponerla en la segunda la devolvería al desplegable por la puerta de atrás, y el mismo día podría existir **dos veces** —una como vacación y otra como «Ausencia justificada — Vacaciones»—, con dos etiquetas contradictorias en el renglón que decide un pago.
> - El cartel de **Cómo funciona** dejó de nombrar «vacaciones» y «permiso» entre las justificaciones: los motivos de ese texto salen de `MOTIVOS_JUSTIFICACION` y no de una lista escrita a mano. Es la misma lección que la tolerancia — un cartel que contradice a la pantalla es peor que no tener cartel.
>
> ### 🔴 EN UN DÍA DE VACACIONES NO SE CALCULA NADA DEL RELOJ
>
> Daniel, textual: *"si alguien pasó por el reloj estando de vacaciones, no genera horas, ni tardanza, ni ausencia"*. Las marcas de ese día **no se borran ni se esconden** —viajan en `marcasIgnoradas` y la pantalla las muestra—: descartar un dato es una cosa, descartarlo EN SILENCIO es otra. En `clasificarDia` la vacación se mira **PRIMERO**, antes que el feriado y que todo lo demás. Y el renglón nunca dice *ausencia*: dice «Vacaciones», o «Vacaciones (ya pagadas)».
>
> ### 🔴 EL INTERRUPTOR «YA SE LE PAGÓ» ES LO ÚNICO QUE MUEVE PLATA
>
> La regla es de la contadora, textual: *"Si la persona había cobrado sus vacaciones anteriormente en dinero y no se había ido esos tres días, yo se los descuento porque ya se los pagué; si la persona no ha cobrado sus vacaciones entonces se los pago."*
>
> - **SIN MARCAR (el default) no cuesta nada:** el quincenal (`salario ÷ 2`) ya cubre esos días y no se descuenta un centavo. Pagarlos no necesita ninguna cuenta.
> - **MARCADA:** esos días se descuentan y se valúan **igual que una ausencia de día completo** — `MIN_DIA_NO_TRABAJADO` (8 h) × rata, la MISMA constante, **no** el horario de la persona. Van en columna propia (`vacacionesYaPagadasMin`) adentro de `ausencias`: el total no se mueve y el renglón igual puede decir de dónde sale.
> - ⚠️ **Solo se descuentan los días que iba a trabajar: hábil (L-V) y no feriado.** Un domingo o un 3 de noviembre adentro del rango no tenía jornada que pagar, y descontarlo sería cobrarle dos veces el mismo día.
> - 🔴 **Y SE DICE EN PANTALLA, con nombre, rango y monto** (`textoVacacionesNoPagadas`): rechazar sí, esconder no — la misma regla que el préstamo sin aprobar y el reparto que no cuadra. Sin el monto no se coteja contra nada; sin el rango no se sabe de qué vacación habla; sin el nombre no se sabe a quién reclamarle.
>
> ### 🩸 EL SALDO NO ES «GANADOS DESDE QUE ENTRÓ MENOS LO TOMADO»
>
> Lo fue durante un PR (#626), y era **aritméticamente correcto e INÚTIL**: las vacaciones existen en el sistema desde el 25-ago-2026 (medido por la puerta de la app: UNA cargada), pero los días ganados se cuentan desde el ingreso y hay fichas de 2019. **ANGELA GARCIA figuraba con 245 días disponibles** — cierto, y peligroso: alguien se para en esa pantalla y reclama días que ya se tomó. Un número que no se puede usar para decidir es peor que no mostrar ninguno.
>
> 🔴 **El arranque son DOS datos que escribe contabilidad y que el sistema no puede deducir:** el saldo a hoy (*"a Angela le quedan 12 días"*, que sale de sus registros sin hacer cuentas) y **la fecha de corte**. Van **juntos o ninguno** y lo obliga un CHECK: de la fecha depende qué se resta después — lo anterior al corte **ya está adentro** de ese 12, y volver a restarlo sería cobrarle dos veces los mismos días. Pedirle a contabilidad *"¿cuántos días tomó desde 2019?"* sería pedirle que reconstruya siete años: no lo haría nadie, y la pantalla quedaría vacía para siempre.
>
> ```
> saldo = saldo inicial − tomadas DESPUÉS del corte − ya pagadas DESPUÉS del corte + lo ganado entre el corte y hoy
> ```
>
> - **Lo ganado se mide contra el INGRESO, no contra el corte.** El ciclo de la ley está anclado al aniversario de entrada, así que *«lo ganado hasta hoy menos lo ganado hasta el corte»* respeta ese calendario; contar los 11 meses desde el corte lo correría para siempre. Por eso hace falta `fecha_ingreso` **además** del saldo, y por eso **no hay dos fórmulas** según qué dato haya: dos fórmulas son dos verdades, y el día que se separan nadie sabe cuál vale.
> - **La ley: 30 días por cada 11 MESES trabajados** (once, no doce — no es un typo que alguien deba "arreglar"). El bloque en curso prorratea 30 ÷ 11 por mes cumplido y **se TRUNCA**: mostrar un día de más habilita a alguien a irse un día que todavía no ganó, y eso se paga en plata; un día de menos se corrige solo al mes siguiente.
> - 🔴 **Las «ya pagadas» TAMBIÉN bajan del saldo.** El derecho se consumió igual: se cobró en vez de disfrutarse. Se llevan en un contador aparte por una sola razón —quien mire el renglón tiene que distinguir los días que descansó de los que le pagaron—, pero los dos restan.
> - 🩸 **Los días del saldo se cuentan de CALENDARIO, con domingos y feriados adentro** (`diasDeVacacion`), y **NO** con el filtro de «hábil y no feriado» de la planilla. No es un descuido: ese filtro contesta *¿qué días había jornada que pagar?* —una regla de PLATA—, y acá la pregunta es *¿qué días de derecho gastó?*, medida en meses corridos como los 30 días de la ley. Descontar solo los hábiles contra un techo de días corridos regalaría ~8 días por cada mes tomado.
> - **Medios sí, cuartos no.** `numeric(4,1)` más un CHECK de múltiplos de 0,5: la contadora lleva la planilla a mano en Excel y un 12,5 es más probable que lo contrario, pero un 12,3 no es un dato, es un dedo pesado. ⚠️ El medio día entra **solo por el arranque**: lo ganado sigue truncando a día entero y los días tomados son de calendario, así que la única fuente de una coma en toda la cadena es el número que escribe contabilidad. El tipo se cambió con la columna **VACÍA**, que es cuando sale gratis: con 36 fichas cargadas habría sido una migración sobre datos vivos de una planilla.
> - 🔴 **Sin los dos datos NO HAY SALDO. Ni cero, ni un número grande.** `saldo` es `number | null` y ese `null` no se confunde con un `0`: a quien le falte la fecha de ingreso o el saldo inicial **aparece en la lista diciendo cuál de los dos le falta** — que además es la acción que hay que hacer.
>
> ### ⚠️ EL MECANISMO ESTÁ VIVO Y ESPERANDO A CONTABILIDAD
>
> Medido el 1-sep-2026: **2 vacaciones cargadas** (las dos de ELOYN MENDOZA) y **1 sola ficha de 40 con saldo**. No es que no funcione: el número de arranque lo tiene que escribir contabilidad ficha por ficha, y hasta que lo haga la pantalla dice «Falta el saldo» en vez de mostrar uno inventado. **Las tres migraciones son aditivas y la app funciona sin ninguna** (patrón `cols-opcionales`): sin la tabla, `leerVacaciones` devuelve cero filas y la pestaña lo dice en ámbar; sin las columnas, nadie tiene saldo y Configuración avisa qué archivo falta correr.
>
> ### Candados
>
> `asistencia-vacaciones.test.ts` · `asistencia-saldo-vacaciones.test.ts` · `asistencia-vacaciones-decidir.test.ts` · `asistencia-vacaciones-pantalla.test.tsx` · `asistencia-vacaciones-saldo.test.tsx`.

> ### ⚠️ SUPERADO EN PARTE — la PESTAÑA se apagó el 1-sep-2026 (el motor, NO)
>
> Daniel, textual: *«olvida lo de las vacaciones por ahora, quitalo del ERP para no enrredar»*. Y el motivo, con la pantalla delante: *«me enrreda lo de Ya se le pagó / Se le pagan estos días»*.
>
> **Es un defecto de REDACCIÓN, no de lógica.** El título del interruptor es el ESTADO y la línea de abajo es la CONSECUENCIA de cómo está la casilla ahora (`efectoDelInterruptor` sí cambia al marcarla), pero desmarcadas las dos frases se leen como una sola que se contradice: *«Ya se le pagó / Se le pagan estos días»*. Se le ofrecieron las dos salidas —arreglar el texto ahora u ocultar la pestaña mientras se trabaja el flujo de generar y cerrar la planilla— y eligió **ocultarla**. El texto quedó **sin tocar**: cambiar la redacción de una pantalla que nadie ve es un cambio que nadie revisa. El arreglo propuesto (*«¿Ya cobró estos días antes?»* con la consecuencia visible SOLO al marcar) está escrito pegado a `PESTANAS_OCULTAS`, que es donde lo va a leer quien la reactive.
>
> - **Se apagó la PANTALLA, no el trabajo.** `PESTANAS_OCULTAS = ["vacaciones"]` en `src/lib/asistencia/roles.ts`; `vePestana` la deja fuera para todos, admin incluido. `VacacionesTab.tsx`, la ruta `/api/asistencia/vacaciones`, la tabla y las migraciones quedan **enteros**, y la pestaña sigue declarada y montada en `AsistenciaClient`. **Volver a encenderla es borrar una línea.**
> - 🔴 **EL MOTOR SIGUE HONRANDO LAS VACACIONES CARGADAS, y ése era todo el riesgo.** Hay 2 filas vivas, las dos de ELOYN MENDOZA (29, fashion_wear): 16-jul→13-ago y 14-ago, ninguna «ya se le pagó». Entender «quitar» como *dejar de leer `asistencia_vacaciones`* le habría convertido esos días en AUSENCIA —ella no marca— y le habría comido una quincena entera **en silencio**. No se tocó una línea de `reporte.ts`, `planilla.ts`, `vacaciones.ts`, `saldo-vacaciones.ts` ni de `/api/asistencia/planilla`, y el barrido de `asistencia-vacaciones-decidir.test.ts` sigue exigiendo `leerVacaciones` en todo lo que arma la planilla contra producción.
> - **Un `?tab=vacaciones` de un marcador cae en la pestaña por defecto**, no en blanco: la pantalla resuelve la URL contra `visibles`, que ya no la contiene.
> - **Los tests de la pantalla apagada NO se borraron**: `describe.skip` con la nota de qué garantizaban y cómo reactivarlos (`asistencia-vacaciones-pantalla.test.tsx`, solo el bloque de `VacacionesTab` — los de Reporte y Planilla siguen corriendo, y son la prueba de que el motor no cambió; `asistencia-vacaciones-saldo.test.tsx`, entero). Borrarlos habría dejado sin definición escrita lo que esa pantalla tenía que cumplir.
> - **Candado nuevo, en la dirección contraria:** `asistencia-pestanas.test.ts` ahora exige que **nadie** la vea, que el componente y la ruta **sigan existiendo**, y —lo que importa— corre el motor sobre el rango REAL de ELOYN y verifica **en dólares** que no se le descuenta nada: con la vacación viva `ausencias = $0.00` y neto idéntico a la quincena trabajada entera; sin ella, 9 ausencias de día completo. Medido por mutación (`const vacaciones = []` en `reporte.ts`): esos dos casos se ponen rojos.


---

## 🔴 Asistencia — JULIO GARAY COBRA EN DOS EMPRESAS, y la rata sale del sueldo COMPLETO (27-ago-2026)

> La contadora, textual: *«El salario de Julio es 1000 y están divididos en dos empresas. 800 en Vistana, sobre los cuales se aplican seguro social y educativo. Los otros 200 están en Fashion Wear. Aquí es servicios profesionales y es aquí donde se le pagan las horas extras. **En ambas empresas su rata por hora es 5.77**»*.
>
> 🩸 **EL OBSTÁCULO, MEDIDO CONTRA PRODUCCIÓN:** `asistencia_personas` tiene `PRIMARY KEY (empleado_codigo)` y **una persona = una fila = UNA empresa** — `empresa`, `salario_mensual`, `servicio_profesional` y `paga_seguros` son todos POR PERSONA. Julio estaba entero en Vistana con $1.000, y sus horas extra pagaban el 11 % de seguros que en Fashion Wear no les corresponde.
>
> ### 🔴 NO SE TOCÓ LA LLAVE DE `asistencia_personas`
>
> Es LA tabla del módulo —40 fichas— y el motor entero (el directorio, las justificaciones, las vacaciones, las correcciones, las aprobaciones) asume **una ficha por código**. Partirla en dos filas rompería esa suposición en veinte lugares a la vez, y diecinueve no tienen nada que ver con el sueldo. **El reparto CUELGA de la ficha** (`asistencia_reparto_empresa`, una fila por empresa): la ficha sigue siendo UNA, y lo que se parte es el PAGO.
>
> ### 🔴 LA RATA SALE DEL SUELDO COMPLETO, Y ES TODO EL PUNTO
>
> `$1.000 × 12 ÷ 52 ÷ 40 = 5,769…` → **$5,77**, la misma en las dos. Por eso `asistencia_personas.salario_mensual` **SIGUE SIENDO EL TOTAL ($1.000)** y la tabla nueva dice lo que paga cada empresa. `calcularDinero` recibe DOS números: el mensual COMPLETO —de donde sale la rata— y `salarioDeLaParte`, que **solo** prorratea el quincenal. 🩸 Con la rata sacada de sus $200 su hora valdría **$1,15** y sus horas extra —que se pagan justamente ahí— se pagarían **CINCO VECES MENOS**. Hay mutación para eso.
>
> ### 🔴 CADA COLUMNA DEL RELOJ CAE EN UNA SOLA LÍNEA
>
> Es lo que hace que el reparto no invente ni pierda un centavo:
> - las **HORAS EXTRA** (1,25 · 1,50 · excedente) van a la parte marcada `paga_horas_extra`, y a ninguna otra;
> - **TODO EL RESTO DEL RELOJ** —domingos, feriados, tardanzas, ausencias, vacaciones ya pagadas—, los **montos escritos a mano** y la **base propia de seguros** van a la parte **PRINCIPAL** (la de `orden` más bajo), y a ninguna otra;
> - el **sueldo quincenal** se parte según el monto de cada parte.
>
> Sumando las partes se reconstruye la medición original **columna por columna**, y hay test que lo exige sobre las horas REALES de producción: una ausencia contada en las dos líneas se descontaría dos veces, y una hora extra en ninguna desaparecería en silencio. **El BRUTO TOTAL no se mueve** ($596,97 antes y después) — lo único que cambia es que la parte de Fashion Wear deja de pagar el 11 %.
>
> ⚠️ **LOS DOMINGOS Y FERIADOS SE QUEDAN EN LA PLANILLA, y es una decisión que hay que confirmar.** La contadora dijo *«horas extras»*, y en Panamá el recargo de domingo es otra cosa. Ante la duda se quedan del lado que SÍ paga seguros —retener de más se ve en el neto y se reclama el mismo día; no retener se descubre meses después cuando la Caja pide lo que no se retuvo—, la misma asimetría de `seguros.ts`. 🔴 **En la quincena del 16 al 31 de julio son $27,05 de recargo de domingo, o sea plata de verdad**: si la contadora dice que también van a Fashion Wear, es cambiar `COLUMNAS_EXTRA`/`COLUMNAS_RELOJ` en `planilla.ts` y nada más.
>
> ### 🔴 UN REPARTO QUE NO CUADRA SE RECHAZA ENTERO — y rechazar es volver a HOY
>
> `validarReparto` (`src/lib/asistencia/reparto.ts`, módulo PURO) exige **cinco** cosas, y cada una tapa una forma distinta de perder plata: **(1)** al menos DOS partes · **(2)** empresas válidas y sin repetir · **(3)** cada monto > 0 · **(4) 🔴 los montos SUMAN el salario de la ficha, al centavo** —es la que sostiene que la rata sea honesta— · **(5)** exactamente UNA parte paga las horas extra (ninguna las perdería en silencio; dos las pagarían dos veces).
> - **Ante cualquier duda se rechaza, y rechazar es la planilla de ayer**: UNA línea, con su sueldo entero y sus seguros.
> - 🔴 **Y SE DICE EN PANTALLA**, con el nombre y el motivo (*«Un sueldo repartido no se aplicó y se pagó en una sola planilla, como antes: JULIO GARAY (las partes suman $900.00 y el salario de la ficha es $1000.00)»*). Rechazar sí, esconder no.
> - **El motor NO se fía del llamador**: `partesUsables` (en `planilla.ts`, donde se decide la plata) vuelve a exigir lo estructural. Un test, un script o una ruta nueva que arme la ficha a mano no puede saltearlo.
>
> ### ⚠️ `paga_seguros = false` NO ES `servicio_profesional`
>
> La contadora llama *«servicios profesionales»* a lo de Fashion Wear, y lo único que eso significa acá es **sin los seguros**: esa parte **SÍ se paga** (es plata que Julio cobra). Marcar la ficha como `servicio_profesional` es otra cosa —deja a la persona SIN pago— y no se tocó. El interruptor de la FICHA sigue mandando: con `paga_seguros = false` en `asistencia_personas`, la parte **no puede encenderlos**.
>
> ### En pantalla
>
> - **Configuración › la ficha:** tarjeta **«Se reparte en»**, de SOLO LECTURA, con las dos empresas, su modo (*Planilla* / *Servicios profesionales*), el sello **Horas extra** y el **Total SUMADO** (no copiado del salario: es lo que deja ver de un vistazo que las partes cuadran). La regla la fija la contadora y un campo editable sería la forma de dejarlo mal puesto.
> - **Planilla:** chip **«sueldo repartido»** en la línea (escritorio y celular), con el detalle en el `title`. Sin él, un quincenal de $400 donde la ficha dice $1.000 se lee como un error de carga.
> - **Aprobaciones:** con dos líneas por código gana **la que paga las extras** — quien aprueba tiene que ver dónde caen. 🩸 Un `new Map(lineas.map(...))` a secas se queda con la última y en el orden natural eso coincide *por casualidad*; hay mutación con el orden INVERTIDO.
>
> ### ⚠️ DDL ADITIVA — **YA CORRIDA** (27-ago-2026), y la app funcionaba ANTES
>
> `supabase/migrations/20260901120000_asistencia_reparto_empresa.sql`. Patrón `cols-opcionales`: sin la tabla, `leerRepartos()` devuelve cero filas y `faltaTabla: true`, **nadie reparte nada, la planilla da lo de ayer hasta el centavo** y las dos pantallas dicen en ÁMBAR qué archivo falta. La degradación solo ocurre cuando el error **NOMBRA la tabla**.
> - **Siembra las dos filas de Julio en la MISMA migración**, a propósito: con la tabla vacía correr el archivo se leería como «no pasó nada».
> - **NO toca `asistencia_personas`** (el $1.000 se queda), ni `asistencia_planilla_manual`, ni una quincena vieja. Idempotente. **Para deshacerlo: borrar las 2 filas** y la planilla vuelve exactamente a lo de antes.
> - **Índice único parcial** `asistencia_reparto_una_extra`: una sola parte con `paga_horas_extra` por persona. Es la única de las cinco reglas que la base puede sostener sola, y sostenerla ahí vale porque decide dónde cae la plata de las extras.
> - **La lectura PAGINA** aunque hoy sean 2 filas: `db-max-rows` = 1000 corta EN SILENCIO, y acá un truncado no da error — da un reparto que **no suma**, así que el guard lo rechaza y la persona vuelve a una sola planilla. Se vería como «se deshizo solo».
>
> ### La medición contra producción
>
> `DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_verif-julio-dos-empresas.ts` (**solo lectura**; `EXIGIR=0` mide con las horas extra pagadas). Corre el motor **VIEJO** —sacado de `origin/main` AL EJECUTAR, con cierre transitivo de sus imports— y el NUEVO sobre los MISMOS datos, y lee el reparto **de la tabla de verdad**.
>
> | | PASADA 1 (sin reparto) | PASADA 2 (con reparto) | PASADA 3 |
> |---|---|---|---|
> | 4 quincenas × 3 empresas | **145 líneas · 3.516 cifras · 0 diferencias** | **5.940 cifras de OTRAS personas · 0 movidas** | **7 de 7 mutaciones del guard cazadas** |
>
> **JULIO, con las horas extra pagadas:**
>
> | quincena | ANTES (una línea) | Vistana | Fashion Wear | NETO |
> |---|---:|---:|---:|---:|
> | 1-15 jul | $559,43 | $356,00 | $228,58 | **$584,58** (+$25,15) |
> | 16-31 jul | $597,30 | $373,90 | $251,02 | **$624,92** (+$27,62) |
> | 1-15 ago | $521,31 | $346,00 | $196,97 | **$542,97** (+$21,66) |
> | 16-31 ago | $406,71 | $246,41 | $180,11 | **$426,52** (+$19,81) |
>
> 🔴 **El 1-15 de agosto reproduce el mockup aprobado AL CENTAVO**: Vistana `$400,00 · — · $44,00 · $356,00` y Fashion Wear `$100,00 · $96,97 · — · $196,97`, con **$5,77 de rata en las dos**. La suma del mockup ($552,97) no incluye los **$10,00 de mercancía** escritos a mano de esa quincena, que la planilla sí descuenta (y **una sola vez**, del lado del reloj) → neto real **$542,97**.
> - ⚠️ **El 16-31 de julio da $624,92 y el encargo decía $623,59.** La diferencia son **$1,33** y sale del **recargo de domingo ($27,05)**, que se quedó del lado que paga seguros (ver arriba). Ningún reparto de los que se probaron reproduce exactamente $623,59; el que reproduce el mockup aprobado es éste.
> - ⚠️ **En producción HOY las horas extra están en $0** para todo el mundo: `asistencia_horas_extra_aprobadas` existe y está **vacía**, así que se exige aprobación y no hay ni un día aprobado. Con ese estado real la diferencia es **+$11,00 por quincena** (el 11 % de los $100 de Fashion Wear). Los números de la tabla de arriba son con `EXIGIR=0`.
>
> ### Candados
>
> `src/__tests__/lib/asistencia-reparto.test.ts` (**55**, con las horas REALES de producción) y **`src/__tests__/api/asistencia-reparto-route.test.ts` (12), que LLAMA a la ruta real** — el bug que ese archivo caza es el de la JUNTURA (que la ruta lea la tabla y le pase el reparto al motor), que es el modo de fallo que este módulo ya pagó con `diaEnCurso`, y ningún test del motor lo puede ver. Ninguno de los dos busca texto en un archivo.
> - **Verificado por mutación, 28 de 28 cazadas y 0 sobrevivientes** (`bash scripts/_mutar-candados-reparto.sh`): la rata sale del monto de la parte · el quincenal ignora la parte · las horas no se reparten · las extras van al reloj · el resto del reloj se copia a las dos (ausencia doble) · los montos a mano se descuentan dos veces · la parte enciende los seguros que la ficha apagó · la base propia se aplica dos veces · la línea conserva la empresa de la ficha · el motor ignora el reparto · las dos líneas salen en TODOS los cuadros · el guard no exige la suma · deja pasar dos partes con extras · el quincenal de referencia muestra el sueldo completo · las cinco reglas del validador, una por una · el reloj lo lleva la última parte · el monto que llega como TEXTO se pierde · `partesDe` devuelve lo rechazado · lo rechazado se calla · la ruta no pasa el reparto · no dice lo rechazado · calla la migración faltante · Aprobaciones se queda con la última línea.
> - 🩸 **Tres cosas del verificador que este repo ya pagó y acá no se repiten:** restaura **por COPIA** (hay archivos NUEVOS y `git checkout` aborta el comando entero sin restaurar nada), el reemplazo es **LITERAL con python** (con `perl -0pi -e 's|A|B|'` un `||` del código real se des-escapa y **se come el archivo**, dejando un «SOBREVIVIÓ» falso), y **denuncia el patrón que no muta** en vez de darlo por cazado. Trae una **mutación de CONTROL** que a propósito no matchea: si no sale ⛔, el denunciador está roto y todos los ✅ valen lo mismo que un barrido con el comentario adentro.
> - 🩸 **Cuatro mutaciones sobrevivieron en la primera corrida y las cuatro eran candados flojos, no producto sano:** la base propia solo se probaba con la parte que además tenía los seguros APAGADOS (así que su `null` salía por el otro camino), el reparto de una sola empresa se probaba con una parte que **también** violaba la regla 5, `quincenalReferencia` no lo miraba nadie, y el orden de Aprobaciones coincidía **por casualidad** con el `new Map` de última-gana.
>
> ### ⚠️ Lo que queda PENDIENTE
>
> - 🔴 **CONFIRMARLE A LA CONTADORA dónde van los DOMINGOS y FERIADOS.** Hoy se quedan en Vistana (con seguros). Son $27,05 en la quincena del 16 al 31 de julio.
> - **El reparto NO se puede crear ni editar desde la pantalla**: se muestra y se siembra por SQL. La regla la fija la contadora y los montos tienen que sumar el salario de la ficha; un editor invita a dejarlo mal puesto —y un reparto que no suma se rechaza entero, o sea que la persona volvería a cobrar en una sola planilla sin que nadie lo busque. Si Daniel quiere editarlo, es una decisión suya y va aparte.
> - **El Excel y el PDF de la planilla NO se tocaron**: salen por empresa, así que cada uno trae su parte con la empresa correcta, pero **no dicen que el sueldo está repartido**. Anotado, no construido.
