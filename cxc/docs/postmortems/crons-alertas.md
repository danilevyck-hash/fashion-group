# Post-mortems — Crons, alertas e infraestructura

> Movido de `cxc/CLAUDE.md` el 31-ago-2026 para bajar lo que se inyecta en cada sesión.
> **Nada se resumió ni se borró: el contenido es verbatim**, con sus «Daniel, textual»,
> sus mediciones, sus «Candados», sus «Verificado por mutación» y sus 🩸.
> La REGLA vigente (sin la historia) vive en «Invariantes por módulo» de `cxc/CLAUDE.md`.

---

> ## 🩸 EL SILENCIO NO CUENTA COMO QUE ESTÁ BIEN — dos alertas para cuando Switch no da error y simplemente no manda nada (2-sep-2026)
>
> ### Lo que pasó
>
> El módulo **Gastos estuvo dos días sin recibir datos** (1 y 2-sep-2026) y nos enteramos por el **segundo fallo del cron**, o sea por la regla 2 y de pura casualidad. Switch reescribió su motor de reportes por segunda vez en dos semanas —la primera rompió la cartera de Boston el 19-ago— y empezó a mandar `"6.03.98.00.00 - GASTO DE TARJETA DE CREDITO"` donde antes mandaba el código pelado. Falló el **100%** de los renglones, así que el sync se cortó entero y la corrida quedó en `error`; con dos `error` seguidos del mismo par, la regla 2 avisó. Lo arreglaron `76d30e18` y `b00415e2`.
>
> **Si hubiera fallado el 3% en vez del 100%, no habría sonado nada.** La corrida se anotaba `success` con los renglones que sí entraron y los otros desaparecían. Y si Switch hubiera devuelto un reporte **vacío** en vez de uno con formato nuevo, la corrida se anotaba `success` con **cero** renglones — indistinguible de un día tranquilo.
>
> Y la pantalla no ayudaba: Gastos siguió diciendo *«Cargado hasta julio 2026»* los dos días. **No mentía** —ése ES el último mes cargado— pero tampoco avisaba.
>
> ### Las dos alertas, y por qué son dos
>
> Daniel aprobó dos, para el punto 4 del criterio: **el silencio no cuenta como que está bien**.
>
> | | Qué mira | Qué ve que la otra no | Velocidad |
> |---|---|---|---|
> | **A** — «un sync trajo cero donde siempre trae cientos» | `switch_sync_log` | «corrió, dijo que todo bien, no trajo nada» | Horas (la pasada siguiente) |
> | **B** — «un módulo dejó de recibir datos» | la TABLA de negocio | que el cron **no se haya invocado**, que lo hayan sacado de `vercel.json` sin querer, que su propia fila de log no se haya escrito | ~2 días |
>
> B es el de fondo: **si no hay corrida, no hay nada que A pueda evaluar**. A es el rápido.
>
> **Ninguna estrena una cuarta regla de SISTEMA.** A es la **regla 2** («algo se rompió y no se arregló solo») mirando el RESULTADO en vez del `status`; B es la **regla 1** («un dato que mirás está viejo», `datos-frescos.ts`) extendida a datos que esa regla no cubre. La lista sigue siendo de tres.
>
> ### 🔴 LA PARTE DIFÍCIL: hay ceros perfectamente legítimos, y son la mayoría
>
> Medidos sobre los **9.113 registros de `switch_sync_log`** que hay en producción (29-may → 2-sep-2026, 96 días):
>
> - `joystep` y `american_classic` figuran `success` con **0 renglones de `egresos_varios` todos los días** desde el 13-ago: no tienen egresos varios. Su éxito vacío es correcto.
> - 🩸 **`utilidad` y `recibos` cargan el MES EN CURSO** (`mesesCronDiario`: el mes actual, más el anterior sólo los días 1-5). El **1-jul-2026** seis pares de `recibos` y cuatro de `utilidad` trajeron 0 **a la vez** — no se rompió nada: era el primero de mes y julio no tenía todavía un solo documento. Y `joystep|utilidad` trajo **0 ocho días seguidos** (6 al 13-ago) porque joystep no vendió nada esa quincena.
> - `active_wear|facturas` trae 0 en **81 de 248** corridas y `joystep|facturas` en **98 de 244**: son empresas chicas y hay días sin facturar.
> - `ventas_tipos` es un centinela: su normal **ES** cero, siempre (41 de 41).
> - Un sync que corre 4 veces al día trae 0 en las pasadas donde no cambió nada.
>
> **El patrón detrás de todos, y es el hallazgo del trabajo:** el volumen de esos syncs es un número del **NEGOCIO** («cuántas novedades hubo»), no una señal de salud. Un sync de **escritura selectiva**, o de **período que empieza vacío**, tiene que poder traer cero sin que nadie se asuste.
>
> ### 🔴 EL FILTRO QUE HACE TODO EL TRABAJO: sólo syncs de UNIVERSO COMPLETO
>
> A y B sólo opinan sobre corridas que reescriben un **universo completo** —todo el catálogo, todos los saldos vivos, el mes de gastos ya cerrado—: ahí el cero no es «no pasó nada», es «no vino nada», que es otra cosa.
>
> La lista está **declarada** (`SYNCS_DE_UNIVERSO_COMPLETO`), una por una y con su motivo, en vez de inferida: `estadocuenta` · `costo` · `articulo_info` · `articulo_marca` · `cuentas_contables` · `egresos_varios` · `proveedores` · los cuatro `catalogo_*`. Quedan **afuera** `facturas`, `recibos`, `utilidad`, `articulos`, `factura_lineas`, `ingresos_mercancia` y `ventas_tipos`.
>
> **Medición del filtro:** con él puesto, el backtest de 96 días da **0 disparos**. Sin él, **14** — y los 14 son falsas alarmas.
>
> ### Los tres candados estadísticos, por si la lista se equivoca
>
> Se aplican **por PAR (empresa, sync_type)**, nunca por `sync_type` suelto:
>
> 1. **≥ 10 corridas exitosas previas.** No es un número redondo al azar: es exactamente lo que la poda de `switch_sync_log` garantiza conservar de cada par por viejo que sea (`podar_switch_sync_log`, migración `20260726210200`), así que la ventana nunca se queda sin piso por una limpieza.
> 2. **Mediana ≥ 10.** Mediana y no promedio — la convención de la casa, la misma de «puede estar a medio cargar» en Gastos: un día raro no la mueve. Hoy este piso deja afuera `proveedores` de tres empresas (medianas 3, 5 y 5) y a nadie más.
> 3. **Ni un cero en esa historia.** Es el más duro y el que caza lo que la lista no vio: `active_shoes|egresos_varios` tuvo **4 ceros legítimos** entre el 13 y el 16-ago (todavía no le habían cargado gastos), así que ese par NO se vigila por A — y lo agarra B igual.
>
> **Un par sin esa historia —o que nunca tuvo datos— no se vigila.** Ante la duda, callar: una alerta que grita por un cero legítimo se gana que Daniel la ignore, y entonces la que importa tampoco se lee.
>
> ### 🔑 DÓNDE SE MIRA ES LA REGLA 2, GRATIS
>
> A **no corre dentro del sync**: corre en la **reconciliación** (10/14/18 UTC) y mira la **última corrida exitosa** de cada par. Eso aplica el filtro de «se arregla solo» sin escribir una sola condición: un catálogo que corre 4 veces al día y trajo 0 a las 14:30 pero 127 a las 17:00 llega a la pasada de las 18:00 con su última corrida en 127 — no hay nada que avisar. Para un sync diario, en cambio, no hay segunda oportunidad en el día y el aviso sale esa misma tarde.
>
> ### 🔴 B: SE MIRA CUÁNDO SE ESCRIBIÓ, NUNCA LA FECHA DEL DATO
>
> El rezago es fuerte y es **normal**: el reporte de egresos viene con **más de un mes de atraso** porque así lo carga la contadora — el egreso más nuevo de Vistana hoy es del **31-jul**. Usar la fecha del dato como señal haría sonar esta alerta para siempre.
>
> Y se mira la tabla del **DATO**, no la del **MECANISMO**. Medido el 2-sep-2026, con el módulo muerto hacía dos días:
>
> | | máximo | antigüedad |
> |---|---|---|
> | `egresos_importaciones.created_at` (la fila del run) | 2026-09-02 10:36 | **4,9 h** |
> | `egresos_varios.created_at` (los renglones) | 2026-08-31 10:36 | **52,9 h** |
>
> Una decía que todo estaba bien. La otra decía la verdad.
>
> ### Qué tablas vigila B, y por qué SÓLO ésas
>
> Tres requisitos, y los tres tienen que darse:
>
> 1. **La escritura es COMPLETA en cada corrida.** 🩸 Medido: `switch_recibos` de `active_wear` lleva **144 h** sin una escritura y `switch_factura_lineas` de `joystep` **132 h**, y las dos empresas están **perfectamente sanas** — sus syncs escriben sólo lo que cambió y no cambió nada. Vigilar la recencia de escritura de una tabla con escritura selectiva es garantizar el falso positivo eterno.
> 2. **Nadie más la vigila.** La cartera (`switch_estadocuenta`) y las ventas ya son la regla 1; repetirlas sería el mensaje doble que esto evita.
> 3. **No tiene segunda oportunidad.** Ni `sync-egresos-varios` ni `sync-articulo-info` están en `COLATERAL_CRONS`: la reconciliación **no los re-ejecuta**.
>
> Quedan dos: **`egresos_varios.created_at`** → módulo **Gastos**, y **`switch_articulo_info.synced_at`** → **Ventas › Referencia**.
>
> `switch_ingresos_mercancia` cumple 1 y 3 pero nació el 24-ago y sólo tiene 9 corridas de historia: entra cuando tenga. Ante la duda, callar.
>
> ### El umbral de B: 40 h, y de dónde sale
>
> Los dos crons son diarios y la reconciliación mira a las 10:00, 14:00 y 18:00 UTC:
>
> - **Sano**, en la pasada de las 10:00 —justo ANTES de la corrida del día— el dato ya tiene **23,5 h**. Cualquier umbral por debajo de ~24 h suena todos los días sin que pase nada.
> - **Un día perdido**: a las 18:00 el dato lleva **31 h**. Eso **NO se avisa**: estos syncs reescriben todo, así que la corrida de mañana lo repara sola, y la regla 2 dice explícitamente que eso no es un incidente.
> - **Dos días perdidos**: a las 10:00 del segundo día lleva **47 h**. Ahí sí.
>
> Sirve cualquier valor entre 32 y 47; **40 h** queda en el medio y aguanta el jitter del scheduler por los dos lados. Es la misma regla de «dos seguidas» de la política de sync, escrita del lado del dato.
>
> ### 🔴 UN MENSAJE POR MÓDULO — así no llegan dos por el mismo hecho
>
> Los hallazgos de A y los de B se **juntan antes** de mirar el anti-loop y se agrupan por **MÓDULO**, que es a la vez la unidad del mensaje y la clave del dedup (`silencio_de_datos:<módulo>` en `cron_email_errors`, el mismo truco de `switch-sync:<slot>`). Eso resuelve dos cosas de un saque:
>
> - un sync roto en cinco empresas manda **UN** mensaje con las cinco, no cinco;
> - A y B disparando por el mismo hecho —que es exactamente lo de Gastos— **no pueden** mandar dos mensajes, porque comparten la clave.
>
> **Anti-loop: 7 días por módulo**, el mismo número y el mismo patrón que el guard de montos imposibles y el aviso de renglones ilegibles, y por el mismo motivo: un módulo que dejó de recibir datos sigue igual mañana, y repetirlo en cada pasada lo convierte en la alerta que suena para siempre y que nadie lee. El mensaje lo **dice**: «este aviso se repite una vez por semana, no todos los días».
>
> El registro en `cron_email_errors` va **ANTES** del envío: es la llave del dedup, y dejarla después haría que un fallo de Telegram provocara un segundo intento inmediato en la pasada siguiente. Mismo orden que la regla 1.
>
> ### 🔴 NO ESTRENA UN CRON
>
> Las dos cuelgan de `switch-reconciliacion` (10/14/18 UTC). Tres motivos:
>
> 1. **Es el vigía que ya existe.** La regla 1 vive en esa misma pasada, dos funciones más arriba. Las tres alertas de datos preguntan lo mismo con distinta lente y tienen que mirar el mundo en el **mismo instante**; separarlas en dos crons sería garantizar que algún día se contradigan.
> 2. **Va DESPUÉS de la recuperación**, que es lo que hace válida la condición 2 del canal.
> 3. **Cero entradas nuevas en `vercel.json`.** Hay 79 de los 100 cron jobs del plan Pro, y «una entrada = una ocurrencia al día» hace que cualquier alerta con cron propio cueste 3 slots. Ésta no cuesta ninguno.
>
> ### 🩸 LA LECTURA DEL LOG VA PAGINADA
>
> Medido: estos mismos `sync_type` dan **1.003 filas en 14 días**, ya por encima del `db-max-rows` = 1000 que PostgREST aplica **en silencio**. Una lectura plana habría devuelto 1.000 filas y habría dejado pares enteros sin evaluar sin que nadie se enterara — el mismo modo de fallo que esta alerta viene a cerrar. Va por `leerTodoPaginado` con `started_at` + `id` de desempate.
>
> ### Backtest sobre 96 días de producción
>
> Simulando las **290 pasadas** de la reconciliación (10/14/18 UTC, 29-may → 2-sep-2026) contra los 9.113 registros reales, con el anti-loop puesto:
>
> | Escenario | Mensajes | Falsas alarmas |
> |---|---|---|
> | **Producción tal cual pasó** | **1** | **0** |
> | Contrafáctico: el parser devuelve 0 renglones sin reventar | **1** | **0** |
> | Sin el filtro de universo completo (control) | 14 | 14 |
>
> El único mensaje de los 96 días es **el incidente**: `2026-09-02 10:00 UTC`, «Gastos dejó de recibir datos — 47 h sin escribir», nombrando las cinco empresas. Llegó **35 min antes** que la alerta de la regla 2 (que salió con el segundo `error`, a las 10:35).
>
> En el **contrafáctico** —el caso que Daniel pidió cubrir, donde Switch no da error— el mensaje sale el **1-sep a las 14:00 UTC**, 3 h 25 después de la corrida muerta y **20 horas antes**; y en ese mundo la regla 2 **no habría sonado nunca**, porque no habría habido un solo `error`.
>
> ### Candados
>
> `silencio-de-datos.test.ts` — 34 casos. Los ceros legítimos entran como **fixtures con su fecha de producción** (el 1-jul de `recibos`, los 8 días de `joystep|utilidad`, los 4 ceros de `active_shoes|egresos_varios`), no como series inventadas. Más los estructurales: el anti-loop se consulta **antes** de mandar y la llave se escribe **antes** del envío, la lectura va paginada con orden estable, `vercel.json` no gana una entrada, y el mensaje no lleva nombres de tabla, `sync_type`, códigos HTTP ni la `empresa_key` interna.
>
> ### Verificado por mutación (2-sep-2026)
>
> **18 mutaciones, 18 cazadas.** Que A no dispare nunca · que A opine sobre `utilidad` (el cero legítimo del mes en curso) · que baje el piso de la mediana a 1 · que opine sin historia · que exija tanta historia que nunca opine · que pierda el candado de «ni un cero en la historia» · que mire la anteúltima corrida e ignore que el par ya se recuperó · que B no dispare nunca · que dispare con **un** día perdido · que dispare con el dato sano de las 10:00 · que alerte por una empresa que nunca tuvo datos · que mire la **fecha del dato** en vez de cuándo se escribió · que vigile una tabla de escritura selectiva · que agrupe por empresa y mande dos mensajes por el mismo hecho · que ponga el anti-loop en cero · que el io pierda la consulta del anti-loop · que no escriba la llave del dedup · que la lectura del log deje de paginar.
>
> **Dos CONTROLES quedaron verdes**, como debían: subir la ventana de lectura de 20 a 25 corridas, y un retoque de redacción del mensaje.
>
> ⚠️ Dos mutaciones **sobrevivieron en la primera pasada** y el candado se arregló: el test escribía los conteos como `A_MIN_HISTORIA - 1`, así que se movían junto con la constante y no protegían nada (ahora van literales, más un `expect` que clava el 10 y el 10); y la comprobación del dedup buscaba el texto `await logCronError(` en cualquier lado, así que envolverlo en un `if (false)` la pasaba (ahora exige que la llamada **abra la sentencia**).
>
> ### Lo que estas dos alertas **NO** hacen
>
> - **No miran empresas que nunca tuvieron datos.** `joystep`, `american_classic` y `confecciones_boston` no tienen un renglón de `egresos_varios` y no lo van a tener.
> - **No reemplazan a la regla 2.** Un sync que devuelve `error` dos veces seguidas sigue avisando por `alertSwitchCronErrors`, como siempre.
> - **No tocan el canal 📊 NEGOCIO.** Salen por `enviarSistema`, con su prefijo y su regla de tres.

---

> ## 🔒 EL RESUMEN DIARIO DE VENTAS DE ACS SE MUDÓ AL CHAT PRIVADO — sin el prefijo de sistema (2-sep-2026)
>
> Daniel, textual: ***"Solo me gustaría que las ventas de acs me lleguen solo a mí o por el chat de alertas, ya que ahí no está el celular de la empresa que tiene telegram para ver lo de las fotos, guías, etc."***
>
> Y sobre todo lo demás, textual: ***"De negocio que me llegue todo. Eso está bien."***
>
> ### El hallazgo: 📊 NEGOCIO no era el chat de Daniel, era un GRUPO DE TRES
>
> El comentario de `src/lib/alertas/canal.ts` decía, desde el 27-jul-2026, que el bot nuevo llevaba el NEGOCIO al **"chat privado 1367251585"**. **Era al revés.** El privado es el de siempre (`TELEGRAM_CHAT_ID`), que lleva las alertas de 🔧 SISTEMA; el de NEGOCIO es un grupo con **Daniel más el celular de la empresa**, desde donde bodega y marketing miran las fotos, las guías y los cheques.
>
> Verificado contra Vercel (Production, 2-sep-2026): existen **sólo cuatro** variables de Telegram — `TELEGRAM_BOT_TOKEN` · `TELEGRAM_CHAT_ID` · `TELEGRAM_BOT_TOKEN_NEGOCIO` · `TELEGRAM_CHAT_ID_NEGOCIO`. **No hay ninguna `*_SISTEMA`**, así que SISTEMA cae al canal de siempre por la última rama de `destinoDeCanal`. Los valores no se pueden leer desde el código (Vercel las marca *Sensitive*): para verlos sin escribirle a nadie está `GET /api/diag/canales-telegram`, que responde 401 sin `CRON_SECRET` ni sesión de admin.
>
> 🩸 **El comentario viejo es la clase de mentira que hace que el próximo cambio salga al chat equivocado.** Quedó corregido en `canal.ts` y en `cxc/CLAUDE.md`, con el reparto real escrito al lado.
>
> ### El motivo es PRIVACIDAD, no severidad
>
> La tentación era mandarlo por `enviarSistema` y listo. No: ese envío antepone `🔧 SISTEMA · `, que existe para que la notificación del iPhone se lea **sin abrirla**. La venta del día no es una avería — rotularla así es mentir justo donde ese prefijo existe para no mentir.
>
> Por eso nació un tercer envío, `enviarNegocioPrivado`:
>
> | | destino | prefijo | anti-ruido |
> |---|---|---|---|
> | `enviarNegocio` | grupo de negocio | no | **nunca** |
> | `enviarNegocioPrivado` | **privado (el de sistema)** | **no** | **nunca** |
> | `enviarSistema` | privado | `🔧 SISTEMA · ` | la de sus llamadores |
>
> ### 🔴 Por qué una función propia y no `enviarSistema`
>
> Hoy `enviarSistema` tampoco filtra nada por dentro: toda la anti-ruido vive en sus llamadores, uno por uno. **Pero eso es casualidad, no diseño.** El día que alguien meta agrupación, demora o un "esto ya lo avisamos" DENTRO de `enviarSistema` —que es su canal y tiene todo el derecho— el resumen de ventas se iría con la agrupación y **dejaría de llegar sin que nadie lo note**.
>
> La protección tiene que viajar **con el mensaje**, no quedarse en el canal del que se fue. `enviarNegocioPrivado` comparte el cuerpo de `enviarNegocio` —una sola sentencia, cero condiciones, cero `process.env`— y el candado *«NEGOCIO no tiene perilla de silenciar»* (`alertas-canal.test.ts`) se amplió para vigilar **las dos**. `enviarSistema` queda fuera de ese cedazo a propósito.
>
> ### 🔑 SON DOS LUGARES, NO UNO
>
> El resumen sale del cron de la 01:00 (`api/cron/acs-resumen-diario`) **y** de la recuperación de `api/cron/switch-reconciliacion` (incidente 11-jul-2026: la invocación de la 01:00 se perdió tras una promoción de deploy, cero rastro). Cambiar sólo el primero deja el resumen **recuperado** —el que sale justo cuando algo falló— cayendo en el grupo.
>
> El candado nuevo no compara contra un nombre fijo: **extrae qué función de envío usa cada lado y exige que sean la misma**. Así no pueden separarse aunque mañana el destino cambie otra vez. Las otras dos recuperaciones del mismo archivo (`grupo-resumen-mensual`, `catalogos-fotos-resumen`) siguen en `enviarNegocio`, y hay caso que lo exige.
>
> ### ⚠️ Lo que se pierde: el fail-safe de reintento
>
> `sendTelegramAlert` reintenta en el canal de siempre cuando falla un destino **aparte** (`telegram.ts:143`). El destino de sistema **es** el de siempre, así que no hay a quién reintentarle (`telegram.ts:150`). El resumen mudado pierde ese rescate.
>
> **No importa, y esto es lo que lo cubre:** el fail-safe protege contra una *configuración a medias* (token mal copiado, bot bloqueado, 403 porque nadie le habló al bot). El canal de siempre no tiene configuración nueva que equivocar — es el que ya funciona hace 88 días. Y si el envío falla igual, el cron no registra heartbeat y la **reconciliación lo reenvía en sus 3 pasadas del día** (10:00 / 14:00 / 18:00 UTC), que es exactamente el mecanismo que se escribió para el incidente del 11-jul. Es más red que la que tenía.
>
> ### Cabo suelto arreglado de paso: 6 importaciones muertas
>
> `acs-resumen-diario/route.ts` · `catalogos-fotos-resumen/route.ts` · `grupo-resumen-mensual/route.ts` · `guias/[id]/route.ts` · `integrity-check-run.ts` · `sync-articulos.ts` importaban `sendTelegramAlert` **sin usarlo**. No rompían la regla de «nadie lo llama directo», pero hacían que cualquier barrido los marcara como falsos positivos — y es justo por eso que la regla sólo tenía candados **por archivo** (`asistencia-vigia-hueco.test.ts`, `telegram-pedido-origen.test.ts`, `monto-guard-candado.test.ts`): tres puntos vigilados de un sistema con más de cien rutas.
>
> Borradas esas seis líneas, `src/lib/alertas/canal.ts` es el **único** archivo de `src/` que lo importa y lo llama — así que ahora hay **barrido GLOBAL** (recorre todo `src/`, saltea `__tests__`, y descarta comentarios antes de mirar).
>
> ### Candados
>
> - `src/__tests__/lib/acs-resumen-canal-privado.test.ts` — los dos lugares al mismo destino · sin prefijo · el resto de NEGOCIO intacto · ruteo en vivo · barrido global de `sendTelegramAlert`.
> - `src/__tests__/lib/alertas-canal.test.ts` › «NEGOCIO no tiene perilla de silenciar» — ampliado a las **dos** funciones de negocio, con el nombre atado por el `(` para que `enviarNegocio` no tape a `enviarNegocioPrivado`.
>
> ### Verificado por mutación (2-sep-2026)
>
> | Mutación | Resultado |
> |---|---|
> | Devolver el route a `enviarNegocio` | 🔴 3 casos (mismo-destino, import, «ninguno quedó en enviarNegocio») |
> | Dejar la recuperación en `enviarNegocio` | 🔴 2 casos (mismo-destino, «ninguno quedó en enviarNegocio») |
> | Ponerle `🔧 SISTEMA ·` al mensaje del resumen | 🔴 1 caso («nada de prefijo») |
> | Meter un `if` dentro de `enviarNegocioPrivado` | 🔴 1 caso («el cuerpo no tiene condición alguna») |
> | Volver a importar `sendTelegramAlert` sin usarlo | 🔴 1 caso (barrido global) |
> | **CONTROL:** reordenar los colaterales de la reconciliación sin cambiar envíos | 🟢 verde |

---

> ## 🔴 CHEQUES PASÓ A LLAMARSE «RECORDATORIOS» — y adentro conviven los cheques y los recordatorios sueltos (24-ago-2026)
>
> Daniel, textual: ***"en el módulo de cheques, quisiera cambiarlo a recordatorios, ya que quisiera poner ahí en el calendario «recordar cobrar» y pongo la fecha así telegram me recuerda"***.
>
> Y a las tres preguntas del diseño: el cliente ***"sí, pero no debería de ser obligatorio"*** · la repetición ***"puede ser, no siempre"*** · quién lo ve ***"admin y secre"***.
>
> **Un recordatorio es FECHA + TEXTO.** El **cliente** (selector cerrado a `clientes_master`, D-XXX) y la **repetición** (una sola vez / cada semana / cada mes) son **OPCIONALES**, por decisión suya explícita.
>
> ### 🔴 LA `key` DEL MÓDULO NO CAMBIÓ: SIGUE SIENDO `cheques`
>
> Está en `role_permissions` y en `fg_users.modulos_override`, así que renombrarla rompe permisos y overrides **sin comprar nada**. Lo único que se movió es el LABEL visible — la misma decisión que "Asistencia" → "Asistencia y Planilla". Verificado contra el **candado de labels parecidos**, que no se aflojó: "Recordatorios" no comparte ninguna palabra que distinga con ninguna otra ficha del catálogo. En la búsqueda global el módulo se llama "Recordatorios" pero **conserva sus palabras viejas** (`cheque`, `deposito`, `posfechado`, `banco`): quien teclea "cheque" tiene que seguir llegando.
>
> ⚠️ **Los CHEQUES adentro se siguen llamando cheques.** "Nuevo Cheque", "N° Cheque", depositar / rebotar / re-depositar, el calendario, el Excel y los KPI **no se tocaron**. Lo que cambió de nombre es el MÓDULO, no el documento.
>
> ### 🔴 LOS 19 CHEQUES VIVOS NO SE MOVIERON — medido antes y después
>
> `19 filas · $279.396,12 · 13 depositado + 6 pendiente`, **idénticas fila por fila y campo por campo** (volcado completo de la tabla comparado con `diff`: 0 diferencias). La migración es **ADITIVA y no nombra `cheques` en ninguna sentencia** — hay candado.
>
> ### Qué se ve en pantalla
>
> - **CALENDARIO** — es lo que Daniel pidió: el recordatorio aparece en su día, **arriba** de los cheques, en una píldora **azul con 🔔**. En la casilla de escritorio y en la lista por día del celular. Un día lleno lo sigue mostrando: el modal de "+N más" lista **también** los recordatorios de ese día.
> - **LISTA** — pestaña propia **"Recordatorios (N)"**, siempre visible (aunque sean 0: es la puerta para crear el primero). 🔴 **NO se mezclan dentro de "Pendientes"**: ese contador cuenta CHEQUES POR DEPOSITAR, o sea plata por cobrar, y mezclarlos lo haría mentir. Cada fila dice el texto, cuándo toca, el cliente con su chip `D-XXX` si lo hay, y "Cada mes"/"Cada semana" si se repite.
> - **Aviso azul arriba** cuando hay alguno para HOY, sin abrir nada — con el texto del recordatorio si es uno solo.
> - **El orden de la lista es por la PRÓXIMA vez que toca**, no por la fecha guardada: un mensual puesto en enero tiene que aparecer donde toca ahora, no hundido al principio. Los de una sola vez que ya pasaron van al final, en gris, y **no se borran solos** (borrarlos es decisión de la persona).
> - **El botón "Exportar" no se ofrece en esa pestaña**: el Excel es de cheques y ahí no hay ninguno que exportar.
>
> ### 🔴 EL AVISO VA POR EL CRON QUE YA EXISTE — `cheques-alert`, 14:15 UTC (9:15 a.m. Panamá)
>
> **NO se creó un cron nuevo**, y no es economía de archivos: ese cron ya tiene resuelto lo difícil —la ventana del **día hábil anterior**, el **anti-duplicado por heartbeat** (`yaAvisoHoy`) y el fail-open— y todo eso vale igual para un recordatorio. Un cron nuevo habría estrenado una segunda ventana, un segundo candado anti-duplicado y una segunda entrada en `vercel.json` que mantener sincronizada. **Sigue habiendo 77 entradas de cron.**
>
> **UN SOLO MENSAJE por corrida**, canal 📊 NEGOCIO (`enviarNegocio`), con los **cheques PRIMERO** —es la plata, y es lo que se lee en la notificación del iPhone sin abrirla— y el bloque de recordatorios debajo:
>
> ```
> ⚠️ 4 cheques por vencer — $24,205.45
> • XTREME SHOES (Vistana International) $5,000.00 — HOY
> …
> WhatsApp seguimiento: +50766745522, +50766494096
>
> 🔔 4 recordatorios
> • Recordar cobrar — HOY · City Mall Paso Canoa
> • Revisar los cheques de la semana — HOY · cada semana
> • Pagar el alquiler — HOY · cada mes
> • Llamar al contador — MAÑANA
> ```
>
> - **El texto de los cheques NO se tocó**: sin recordatorios el mensaje es byte por byte el de siempre, y hay candado. Sin cheques pero CON recordatorio, el aviso **sale igual** — antes la corrida se cortaba en "sin cheques por vencer" y nunca habría sonado.
> - 🔴 **SE REUSA LA VENTANA DE LOS CHEQUES, y no es un capricho.** Si el recordatorio se avisara SOLO el día exacto, uno puesto para un **sábado no sonaría nunca**: sábado y domingo no hay corrida y el lunes ya pasó — el mismo hueco que la ventana de cheques vino a tapar. Corriendo un día hábil D la ventana es [D, próximo día hábil], y cada línea dice para cuándo es con la MISMA etiqueta (`HOY` · `MAÑANA` · `el lunes 31 ago`). Dos formas de decir la misma fecha en el mismo mensaje se leerían como un error.
> - ⚠️ **Un fallo de recordatorios NO se lleva puesto el aviso de los cheques.** Si su lectura falla (o falta el DDL) queda anotado en el `detail` y el mensaje de cheques sale igual. **Al revés NO**: si la consulta de CHEQUES falla, la corrida sigue quedando `ok:false` como siempre.
> - La recuperación in-process de `switch-reconciliacion` pasó a reportar el `detail` que arma `runChequesAlert` — rearmarlo con `r.count` haría que una corrida que solo mandó recordatorios se reportara como "sin cheques por vencer".
> - Dry-run sin spamear el chat: `npx tsx scripts/_dryrun-cheques-aviso.ts`.
>
> ### 🔴 EL BORDE QUE SE SALTEA EN SILENCIO: el mensual del 31
>
> Un recordatorio mensual puesto el **31** no existe en abril, junio, septiembre, noviembre ni febrero. Sin la regla de fin de mes **no sonaría 5 meses del año y nadie se enteraría**. Cuando el día elegido no cabe, cae en el **ÚLTIMO día de ese mes** (28 de febrero, 29 en bisiesto). ⚠️ Y el defecto simétrico también tiene candado: un recordatorio del **15** nunca puede correrse al último día del mes. `semanal` = el mismo día de la semana; **ninguno suena antes de su propia fecha**.
>
> ### ⚠️ DDL ADITIVA PENDIENTE — la corre Daniel A MANO, y la app funciona ANTES
>
> **`supabase/migrations/20260824120000_recordatorios.sql`.** Patrón `cols-opcionales`, el de `20260813150000_asistencia_correcciones.sql`: sin la tabla, la pantalla muestra **los cheques exactamente igual que hoy**, el botón de crear va apagado y un aviso en **ÁMBAR** (no rojo: rojo se lee como "algo se rompió", y no se rompió nada) dice **qué archivo falta**. Verificado contra producción con la DDL SIN correr: `GET /api/recordatorios` → **200** con la lista vacía y el aviso; `POST` → **503** con el mismo texto; `POST` incompleto → **400 «Falta: la fecha y qué hay que recordar»**. Nada se escribió.
> - 🔴 **La degradación solo ocurre cuando el error NOMBRA la tabla.** Tragarse cualquier error convertiría un permiso, un timeout o un RLS en "no hay recordatorios" — la peor forma de fallar: la pantalla se ve normal y vacía, y el aviso deja de sonar sin que nadie lo note. Hay candado con el error REAL de producción (`PGRST205`) y con los cuatro que NO deben confundirse.
> - Soft delete (`deleted`), como el resto del módulo. RLS encendida sin políticas. La lectura **pagina con `leerTodoPaginado`**: `db-max-rows` = 1000 corta en silencio y acá un truncado se vería como «ese recordatorio no existe», o sea un aviso que deja de sonar sin un solo error.
>
> ### Medición
>
> **Los 3 anchos + el iPad ACOSTADO, en el navegador contra el build de producción, con los cheques REALES y CONTRA `origin/main`** (`BASE=… node scripts/_medir-recordatorios-anchos.mjs`, solo lectura): **390 · 834 · 1024 · 1440 → 0 px de arrastre, 0 textos bajo 12 px**, y **0 recortes y 0 táctiles bajo 44 px NUEVOS** en la lista de recordatorios (1 recorte y 2 táctiles en los cuatro anchos, **idénticos a main**).
> - 🔴 **El calendario a 390 px MEJORÓ: main arrastra 14 px y esta rama 0.** La fila del mes y la leyenda pasaron a `flex-wrap` — main ya desbordaba y sumarle el conteo de recordatorios lo llevaba a 32. A 834 el arrastre queda en 15 px, **el mismo de main**.
> - Los recortes del calendario (12 · 12 · 11) y sus 13 táctiles de 40 px son las píldoras de cheque y los `truncate` del nombre: **medidos IDÉNTICOS en main**. En la ventana, los 4 táctiles de más a 1024/1440 son los campos densos de `pointer:fine` (el patrón de la casa, igual que `ChequeFormModal`) — **a 390 px, donde está el dedo, son 2, exactamente los de main**.
> - 🩸 **La píldora del calendario medía 22 px y el dedo no le acierta**: pasó a `min-h-[44px]`, y la casilla crece hacia abajo. Salió en la medición, no a ojo.
> - 🩸 **TRES gotchas de medición, y los tres daban verde (o rojo) sin haber mirado nada.** (a) La ventana **NO va en un portal a `<body>`** —`ModalOverlay` se dibuja donde está en el árbol—, así que buscarla como hija directa de `<body>` devolvía siempre vacío y "no abrió" era del medidor. (b) **No alcanza con FIRMAR la cookie**: la página valida el `sessionToken` contra `user_sessions` y una sesión inventada redirige al login; el script toma prestada, **solo leyendo**, una sesión de admin que ya está viva. (c) Escapar el payload a mano (`replace(/"/g, …)`) dejaba dos barras por comilla, el string de JavaScript quedaba roto y **la página no hidrataba**: se mide con `JSON.stringify`.
> - 🩸 **Los recordatorios se INYECTAN en el HTML del servidor, no en `/api/recordatorios`**: la pantalla los recibe en el primer render y el `fetch` del cliente solo corre en los mounts siguientes, así que interceptar la API habría medido una pantalla vacía. Los **cheques del mismo payload no se tocan**, y el navegador **aborta todo pedido que no sea GET**.
>
> ### Candados
>
> `src/__tests__/lib/recordatorios-cuando-tocan.test.ts` (56 — el motor de fechas con los 5 meses del borde, el texto del aviso, qué es obligatorio y qué no, la migración aditiva y que la `key` no cambie), **`recordatorios-permiso-y-aviso.test.ts` (28, CONDUCTA: llama a los handlers REALES con cookies FIRMADAS —403 rol por rol, derivado de `SYSTEM_ROLE_KEYS` para que un rol nuevo entre solo— y corre `runChequesAlert` de verdad leyendo el mensaje que salió)** y **`components/recordatorios-pantalla.test.tsx` (25, MONTA la pantalla real y toca los botones)**.
> - 🔑 **`data-vista` FIJO en los dos layouts del calendario** (`calendario-grid` / `calendario-lista`). En jsdom no hay Tailwind, así que los dos se montan a la vez y un "¿hay alguna píldora?" deja que uno se caiga sin que nada se ponga rojo — **pasó: la mutación sobrevivió**. Es la misma lección del censo de anchos: buscar por la clase del breakpoint compara CERO en cuanto el corte se mueve.
> - **Verificado por mutación, 29 de 29 cazadas** (`bash scripts/_mutar-candados-recordatorios.sh`): el mensual del 31 se saltea los meses cortos · cae en cualquier día cercano · suena antes de su fecha · los recordatorios se ponen antes de los cheques · sin cheques se corta la corrida · se cae el anti-duplicado · un fallo de recordatorios tumba el aviso de cheques · se manda un mensaje vacío · el cliente se vuelve obligatorio · el texto vacío se guarda (en el código y en el CHECK de la base) · una repetición inventada pasa · "sin vincular" se guarda como `""` · la ruta se abre a cualquier rol · la `key` se renombra · el label vuelve a "Cheques" · borrar deja de ser soft delete · la firma sale del cuerpo · cualquier error se lee como migración faltante · el GET revienta en 500 · el recordatorio no se dibuja en la grilla **ni** en la lista del calendario · se mezclan en el contador de Pendientes · el aviso va en rojo · el botón queda encendido sin la migración · el h1 vuelve a "Cheques" · la ventana guarda con el texto vacío · eliminar borra al primer toque · la migración toca `cheques`.
> - 🩸 **La restauración del script va por COPIA, no con `git checkout`**: hay archivos NUEVOS en la rama y git aborta el comando entero sin restaurar nada, así que las mutaciones se apilarían y ninguna se probaría por separado. Y `probar()` **exige encontrar el resumen de vitest**: si la corrida muere, "0 fallos" se leería como "sobrevivió".



---

## Notas de «Base de datos»

> **REGLA — filtrar por año va por RANGO, nunca con `EXTRACT(YEAR ...)` (26-jul-2026).** `WHERE EXTRACT(YEAR FROM (fecha AT TIME ZONE 'America/Panama'))::int = p_anio` es una función SOBRE la columna: no es sargable, ningún índice de `fecha` se puede usar y Postgres cae en seq scan de `switch_facturas` entera (52.269 filas, ~58 MB de heap por el `raw_data` jsonb) en CADA llamada. Es la causa medida de los picos de /ventas: en frío 2.882-3.493 ms contra 368-451 ms en caliente (8×), y el año anterior casi nunca está en caché. La forma correcta es el intervalo semiabierto en UTC — Panamá es **UTC-5 fijo**, sin horario de verano (verificado fila por fila contra la tzdb en las 52.269 facturas: 0 discrepancias):
> ```sql
> WHERE fecha >= (make_date(p_anio,     1, 1)::timestamp AT TIME ZONE 'America/Panama')
>   AND fecha <  (make_date(p_anio + 1, 1, 1)::timestamp AT TIME ZONE 'America/Panama')
> ```
> Los límites van en una CTE leída con subconsulta escalar (InitPlan) para que el planner los vea como constantes. Ya aplicado en `ventas_dashboard_summary` (20260725170100), `ventas_topclientes_summary` y `ventas_clientes_detalle_summary` (20260726190000). **Ojo con las funciones que alimentan a varios consumidores:** `ventas_clientes_detalle_summary` no puede llevar techo porque su CTE `last12m_filtered` no tiene cota superior — solo cota inferior `LEAST(1-ene de p_anio-1, p_twelve_months_ago)`. Índice de cobertura: `idx_sf_fecha_cliente_cover (fecha) INCLUDE (empresa_key, cliente_nombre, tipo_comprobante, subtotal_descuento)` — `idx_sf_fecha_cover` NO sirve para estas dos porque le falta `cliente_nombre`. Candado: `src/__tests__/lib/ventas-reportes-sargable.test.ts`.

> **Proveedores / CxP — los tres campos derivados se calculan AL LEER, y en hora Panamá (27-jul-2026).** Fuente única: `src/lib/proveedores-derivados.ts` (módulo puro), usado por el sync (`switch-api/sync-proveedores.ts`) **y** por la lectura (`lib/proveedores.ts`). Candado: `src/__tests__/lib/proveedores-derivados.test.ts`.
>
> 🩸 **El bug:** `parseFecha()` del sync exigía **DD-MM-YYYY** y `/apiproveedor/info` manda **YYYY-MM-DD**. Medido sobre los 821 renglones guardados: **821 en YYYY-MM-DD, 0 en DD-MM-YYYY** → devolvía `null` 821 de 821 veces y, como todo el cálculo vivía dentro de un `if (f && …)`, **"Comprado YTD", "Pagado YTD" y "Último pago" salían en cero/vacío en 66 de 66 filas, en las 7 empresas**. El formato DD-MM-YYYY sí es el del estado de cuenta de **CXC** (`parseFechaDMY` en `switch-api/parse.ts`): se copió el parser al módulo equivocado y el comentario documentaba un formato que el endpoint nunca usó. Ahora se aceptan los dos, más fechas con hora.
>
> **Tres correcciones más que iban en el mismo cálculo, todas medidas:**
> - **El año se corta en hora PANAMÁ, no en UTC.** Era `new Date().getUTCFullYear()`: entre las 19:00 y las 23:59 del 31-dic de Panamá el corte ya saltaba al año siguiente y el YTD se vaciaba 5 h antes de tiempo. Una fecha con hora se lleva al día-calendario de Panamá (UTC−5 fijo) **antes** de mirarle el año.
> - **Las notas de crédito NO son pagos.** Se clasificaba por `debito > 0` a secas; de los 90 renglones con débito, **57 son "Pago a proveedores" y 33 son "Nota de Crédito"**. Con eso, 6 de las 17 filas con débito habrían mostrado como "Último pago" la fecha de una NC —plata que nunca salió— y 5 proveedores sin un solo pago habrían mostrado uno. Ahora `esPagoAProveedor()` filtra por `abrev='PP'`.
> - **`credito`/`debito` son el SALDO abierto del documento, no su monto.** Medido: `credito === saldo` en 731/731 renglones de cargo y `debito === |saldo|` en 90/90. Sumarlos bajo "Comprado YTD" daba el saldo por cobrar de las facturas del año — salía **idéntico a la columna "Por pagar" en 17 de 32 filas**, y para LATIN FITNESS (active_wear) decía $81.430,83 comprado cuando las facturas del año suman $206.430,83. El monto del documento es `total` (el acumulado es `saldoConsecutivo`, no `total`).
>
> **Se recalcula al LEER, desde el mismo `elements` que la fila ya guarda**, no solo al sincronizar: `sync-proveedores` corre 1×/día (09:30 UTC), así que leer la columna guardada habría dejado el módulo vacío hasta la corrida siguiente, y "hace N días" se congelaba en el instante del sync. Es la misma función en los dos lados, así que no hay dos verdades posibles.
>
> ⚠️ **LÍMITE DEL DATO, no del cálculo — que nadie lea estas dos columnas como el total del año.** `/apiproveedor/info` devuelve solo el ledger **ABIERTO** (verificado: 0 de 821 renglones con saldo cero). Una factura del año ya pagada por completo desaparece de ahí, así que **"Comprado YTD" y "Pagado YTD" cubren solo lo del año que todavía figura en la cuenta y se quedan cortos**. `Último pago` no tiene ese problema. Para un YTD de verdad hace falta otra fuente (un reporte de compras de Switch); no existe hoy en la base. Verificación read-only: `npx tsx scripts/_verif-prov-ytd.ts`.

> **Switch manda cifras IMPOSIBLES, y ahora hay UN guard que las frena en las 8 tablas de plata (30-jul-2026, aprobado por Daniel).** El 27-jul la certificación encontró en `switch_costo_diario` la fila `confecciones_boston · 2026-07-14 · costo_total = $1.000.000.049,22` contra una venta de $493,00, y el propio reporte de Switch salía corrupto por ella (Utilidad −$999.861.591,01, margen −228.547,91%). **No fue un tecleo de nadie: vino de la fuente** — se pidió `/apireporte/totalventas?tipo=03` en vivo y Switch devuelve ese número. Daniel lo dijo textual: *no es "protegerse de gente inepta"*, por eso lo aprobó. El mismo día `/apiingresomercancia/lista` de `active_shoes` devolvió un documento con `subTotal 4.460.999.999.999,55`. El #340 tapó UNA tabla; este PR tapa el resto.
>
> **Fuente ÚNICA, no seis copias:** `src/lib/switch-api/monto-guard.ts` (PURO — registro, umbral, simetría, anti-envenenamiento, anti-loop) + `monto-guard-io.ts` (calibración contra la base y el aviso). El guard de costo diario **se mudó ahí**: `costo-guard.ts` ya no tiene su copia, solo `esCostoSospechoso` (que es otra cosa, ver abajo).
>
> **El umbral es RELATIVO: `max(piso de la familia, 20 × el récord histórico de ESA empresa)`.** El 20× es lo que lo hace envejecer bien — si la empresa crece, el umbral la sigue sin que nadie toque una constante.
>
> **Los pisos, medidos uno por uno el 30-jul contra producción** (`scripts/_diag-calibrar-guard-montos.mjs`, solo lectura):
>
> | Tabla | Récord REAL medido | Piso | Aire |
> |---|---|---|---|
> | `switch_facturas` (subtotal/total/saldo/impuesto/descuento) | $97.866,48 — la factura más grande jamás emitida | $1M | 10× |
> | `switch_estadocuenta` (total/saldo/débito/crédito/…) | $151.630,66 | **$2M** | 13,2× |
> | `switch_factura_utilidad` (subtotal/costo/utilidad) | $73.752,00 | $1M | 13,6× |
> | `switch_recibos.total` | $266.923,96 (fashion_wear, 28-feb-2023) | **$2M** | 7,5× |
> | `switch_proveedor_estadocuenta.saldo_total` | **$2.074.195,21 — LEGÍTIMO** | **$20M** | 9,6× |
> | `products/joybees_products/tommy_products.price` | $64,00 | **$10.000** | 156× |
> | `switch_costo_diario` (venta/costo/utilidad) | $141.707,12 | $1M | 7× |
> | `switch_articulo_diario` (venta/costo) | $88.592,00 | $1M | 11× |
>
> 🩸 **Por qué el piso NO es un número único global.** `switch_proveedor_estadocuenta` tiene **TRES filas por encima de $1.000.000** —$2.074.195,21 (fashion_wear), $1.233.330,25 (fashion_shoes), $1.035.616,02 (vistana)— y **son legítimas**: proveedores intercompañía, y no es un documento sino el saldo ACUMULADO de una cuenta corriente de importación. Copiar el $1M del guard de costo habría **rechazado datos buenos el primer día**. ⚠️ **Un valor GRANDE no es un valor IMPOSIBLE:** el riesgo real de este guard no es que se cuele una fila mala, es que BLOQUEE un mes fuerte — con estas tablas se calculan el margen y las comisiones. Por eso cada piso deja ≥7× de aire sobre el récord de SU tabla, y el test lo verifica familia por familia.
>
> **SIMETRÍA — se mira la fila ENTERA, no una columna.** 🩸 Los dos guards que ya existían eran asimétricos: validaban el **costo** y dejaban pasar la **venta** de la misma fila sin mirarla, y con la venta corrupta el margen queda igual de reventado. Ahora cada familia declara TODAS sus columnas de plata y el umbral se aplica a todas (arreglado en `syncCostoDiario` y en `sync-articulos`).
>
> **Anti-envenenamiento:** las filas ≥ **10 × el piso** no cuentan como historia — si la fila de mil millones contara, ella sola levantaría el umbral por encima de sí misma y desarmaría el guard para siempre. El filtro va en el servidor (pedir el máximo sin él devolvería justo la fila absurda). Las 3 filas reales de proveedores SÍ cuentan (están muy por debajo de su techo de $200M).
>
> **Se RECHAZA la fila, no se pone en cero:** los syncs son UPSERT, así que no escribir CONSERVA el último valor bueno; escribir un 0 lo destruiría. **Una fila mala NO tumba el sync** — `particionarFilas()` separa buenas de malas y las buenas se escriben igual. Dos lugares donde rechazar habría sido DESTRUCTIVO y hubo que protegerlos aparte:
> - **CXC:** el reconcile pone `saldo = 0` a todo lo que tenga `synced_at < runStamp`. Como la fila rechazada no se reescribe, el reconcile la habría leído como "documento cerrado" y le habría puesto 0 — justo el valor bueno que el guard existe para conservar. Ahora se excluyen sus `ccte_id` del reconcile.
> - **Recibos:** `total` entra en la identidad del diff, así que el recibo con cifra corrupta no se parea con su fila guardada y esa fila caía en `borrarIds`. Rechazar el dato malo habría **borrado el bueno**. Ahora se protege la fila guardada del recibo rechazado (misma fecha + mismo cliente).
> - **Catálogo:** producto existente con precio imposible → **no se toca la columna `price`** (stock, nombre y visibilidad se actualizan igual). Producto NUEVO con precio imposible → **no se crea**: no hay precio anterior que conservar y este precio se PUBLICA al cliente final.
>
> **El aviso NO es una cuarta regla de sistema.** Es la MISMA alerta que existía desde el 27-jul para el costo diario, generalizada: antes había una regla para una tabla, ahora una regla para las ocho. **El conteo de reglas baja, no sube.** Sigue en 🔧 SISTEMA y cumple la regla de tres (es real, no se arregla solo porque el dato está mal EN Switch, y hay que corregirlo allá). **Dos frenos para que no sea la alerta-que-suena-para-siempre:** UN mensaje por corrida (no uno por fila — 40 documentos corruptos = 1 aviso con los 5 primeros) y anti-loop de **7 días por fila** contra `switch_sync_log.skip_details` (`campo = 'monto_imposible_<familia>'`). Si Telegram falla, el sync sigue `success`.
>
> **Fail-open en todo el camino de lectura:** si no se puede calibrar (base caída, error de PostgREST, lo que sea) se usa el piso — nunca se vuelve MÁS agresivo por no poder leer. Supabase se importa **perezoso** para que el guard no arrastre la base a quien solo usa la matemática. Costo: **2 consultas (~180 ms cada una) por corrida de sync**, no por fila.
>
> **`esCostoSospechoso` sigue vivo y hace OTRA cosa:** mira el costo UNITARIO de un artículo (costo mal cargado en Switch, no una cifra imposible), guarda la fila con costo $0 en vez de rechazarla, y avisa por 📊 **NEGOCIO**. Los dos guards corren juntos en `sync-articulos`.
>
> **Candados:** `src/__tests__/lib/monto-guard.test.ts` (los picos históricos REALES de cada tabla pasan todos ← el test que más importa; lo imposible se rechaza en las 8 familias; simetría columna por columna; anti-envenenamiento; una fila mala no tumba las demás; el mismo dato malo 7 días seguidos avisa 1 vez) y **`monto-guard-candado.test.ts`**, que pone el build en ROJO si alguien escribe la validación a mano en otro archivo, si un sync protegido deja de importar el guard, o si el aviso se saltea el anti-loop. Barridos read-only: `node scripts/_diag-montos-absurdos.mjs` (todas las tablas de plata) y `node scripts/_diag-calibrar-guard-montos.mjs` (la calibración).
>
> ⚠️ **Filas absurdas ya guardadas: NINGUNA.** El barrido del 30-jul sobre las 10 tablas de plata dio 0 hallazgos salvo las 3 de `switch_proveedor_estadocuenta`, que **son legítimas y NO se tocan**. La de Boston ya se había borrado el 27-jul.

---

## 🔴 LO QUE EL GUARD DEJA AFUERA SE DICE EN PANTALLA — el total real + qué no entró (25-ago-2026)

> Daniel, textual: ***"no debería de ser así, el sistema debe de mostrar la info tal cual"***. Cuando el guard de montos rechaza una fila de Switch, el dato **desaparecía en silencio**: la cartera de Boston decía `$198.296,55` y nadie podía saber que un documento se había quedado afuera.
>
> De las tres salidas que se le ofrecieron eligió la **B, y general** — *el total real + decir qué se dejó afuera*, en **todas las empresas** y **EN PANTALLA** (no por Telegram):
>
> ```
> $198.296,55 · 386
> ⚠️ 1 documento fuera de la cuenta: el 155-000000129 llega con $266,541,352.00. Está mal en Switch.
> ```
>
> ### 🔴 LO QUE **NO** CAMBIA — y es la mitad de esto
>
> **El guard sigue rechazando igual.** La cifra imposible NO entra a la base; los totales, el margen y las comisiones siguen protegidos. **Se descartó explícitamente mostrar el dato crudo**: la cartera de Boston pasaría a **$266.739.648,55** y dejaría de servir para cobrar. **Boston sigue SIN aviso de Telegram** (`SIN_AVISO_DE_MONTOS`, decisión del 5-ago: sonaba todas las semanas sin que nadie actuara) — lo que gana es la línea en pantalla; las demás empresas conservan su Telegram. El anti-loop de 7 días, el umbral relativo, la simetría por fila y el anti-envenenamiento: **intactos**. Y la cartera de Boston **sigue sin mezclarse con la del grupo**: son dos consultas acotadas por empresa, no un aviso global.
>
> ### 🩸 PRIMERO EL REGISTRO: `records_skipped: 1` con `skip_details: NULL`
>
> Medido en producción antes de construir nada: **6 de 6 corridas** de `confecciones_boston / estadocuenta` con `records_skipped > 0` y el **detalle en blanco**, contra 5 de 5 CON detalle en los demás syncs. O sea que se sabía que ALGO se había rechazado, pero **no cuál ni de cuánto** — y sin eso la pantalla no tiene qué decir.
>
> **La causa era UNA línea, en el ÚNICO camino por el que pasa Boston** (`sync-estadocuenta-web.ts`): `finishSwitchSyncLog` se llamaba con `skipped` pero **sin `skipDetails`**. Se auditaron los 8 syncs protegidos uno por uno: era el único. `sync-recibos`, `sync-proveedores`, `sync-utilidad`, `sync-articulos`, `sync-articulo-info`, `sync-egresos-varios`, `sync-catalogo` y `sync-empresa` ya lo pasaban.
>
> ⚠️ **El arreglo NO se puede confirmar contra producción sin escribir**: el detalle aparecerá recién en la **próxima corrida buena de Boston** (la última fue el 25-ago 02:11 UTC, `records_skipped: 1`). Lo que sí está probado es la cadena entera con el sync REAL corriendo contra un doble (`rechazo-queda-registrado.test.ts`): el documento `155-000000129` de `EL MACHETAZO` con sus **$266.541.352,00** queda en `skip_details`, y de ahí sale la línea exacta.
>
> ### La redacción vive en UN solo lugar
>
> **`src/lib/rechazos-de-switch.ts`** lee `switch_sync_log` y arma el texto; las pantallas solo reciben un string. Son varias superficies y la que quedara vieja diría otra cosa — el modo de fallo con el que este repo ya se quemó (13 copias del guard de montos). Hay barrido que pone el build ROJO si alguien escribe *"fuera de la cuenta"* o *"Está mal en Switch"* a mano, **borrando los comentarios primero**.
> - **Ventana de 7 días, la MISMA del anti-loop de Telegram**: un solo concepto de "reciente", y si el dato se corrige en Switch la línea **se apaga sola** dentro de la semana.
> - **Costo medido: 1 consulta, 384 ms**, sobre una tabla de 7.680 filas y con `records_skipped > 0` en el filtro (el resultado real fueron 3 filas). Va **dentro del `Promise.all`** que cada ruta ya tenía, así que no suma latencia en serie. **Sin DDL y sin índice nuevo.**
> - **FALLA AL SILENCIO**: si la lectura se cae se devuelve vacío y no se dibuja nada. Un error de lectura no puede inventar un aviso ni romper la pantalla que muestra el total.
> - **Si no hay nada rechazado, no se dibuja NADA.** Un cartel permanente se deja de leer a la semana.
> - **En ÁMBAR, no en rojo**: no se rompió nada, el problema está EN SWITCH.
>
> ### Dónde quedó la línea, familia por familia
>
> | Familia del guard | Pantalla | ¿Puesta? |
> |---|---|---|
> | `cxc` (`switch_estadocuenta`) | CXC › pestaña de Boston · CXC › grupo (escritorio **y** celular) | ✅ |
> | `factura` · `utilidad` · `costo_diario` · `articulo_diario` | Ventas — **una sola línea arriba de las 4 pestañas** | ✅ |
> | `proveedor` (`switch_proveedor_estadocuenta`) | Proveedores | ✅ |
> | `recibo` (`switch_recibos`) | Comisiones | ✅ |
> | `producto` (`products` / `joybees_` / `tommy_` / `calvin_`) | Catálogos | ⛔ **NO se construyó** — ver abajo |
>
> 🔴 **Ventas lleva UNA línea para sus cuatro familias, no una por pestaña**: el mismo documento corrupto envenena la venta, el margen y la comisión, así que decirlo cuatro veces sería repetir el mismo hecho en la misma pantalla.
>
> ⛔ **CATÁLOGOS QUEDÓ AFUERA, a propósito.** Es la única superficie desproporcionada y hay dos razones, cada una alcanza: **(a)** el catálogo NO pasa por nuestras rutas — `CatalogoVendedorPage` le pide los productos **directamente al Supabase de cada marca** (`theme.api/products`), así que meter la línea pide un endpoint nuevo y un pedido más por apertura contra una base en compute Micro, ×4 marcas; **(b)** el catálogo **público** lo ve el CLIENTE FINAL, y decirle *"está mal en Switch"* es exponerle un problema interno. Costo estimado: una ruta nueva + una lectura por carga en 4 marcas × 3 superficies (vendedor, público, admin), más su medición en 4 anchos. **Decisión de Daniel.** Mientras tanto, el precio imposible sigue frenado igual y el rechazo sigue quedando en `skip_details`.
>
> ⚠️ **`articulo_info` (Referencia) y `egreso_vario` (Gastos) tampoco llevan línea**: no están en las 8 familias del pedido y su costo es el mismo patrón (ruta + cliente + medición). Anotados, no construidos.
>
> ### Medición
>
> **Los 4 anchos, en el navegador contra el build de PRODUCCIÓN, con datos de producción, CON la línea a la vista y SIN ella, y CONTRA `origin/main`** (`BASE=… ETAPA=despues node scripts/_medir-rechazos-visibles.mjs`, solo lectura — el navegador **aborta todo pedido que no sea GET**):
>
> **390 · 834 · 1024 · 1440 → 0 px de arrastre de página · 0 px de desborde de la línea · 0 textos <12 px NUEVOS · tocables <44 px IDÉNTICOS con y sin la línea.** La línea **crece hacia abajo**: 358×63 px en el iPhone (3 renglones), 554-578×42 en el iPad, 744-768×21 en el iPad acostado y 976-1160×21 en escritorio.
>
> 🔴 **NINGÚN NÚMERO SE MOVIÓ, comparado POSICIÓN POR POSICIÓN contra `origin/main`** (mismo build de producción, mismos datos, corridas back-to-back): **30 casos · 7.550 montos · 0 distintos**. Boston sigue en **$198.296,55 · 386 clientes** y el grupo en **$3.515.744,63 · 98 clientes** (verificado también en el payload crudo de `/api/cxc/aging`: 209 filas, **0 de `confecciones_boston`**).
> - 🩸 **La primera comparación dio 150 montos "movidos" y era DERIVA DE PRODUCCIÓN, no el cambio**: entre las dos mediciones pasaron ~45 minutos y la MV del aging se re-materializó. La firma que lo delató: **los tramos cambiaban pero el TOTAL era idéntico al centavo** (`1.379.773,88 + 908.365,90 + 1.227.604,85` = `1.410.793,95 + 946.759,94 + 1.158.190,74` = $3.515.744,63). Medidas back-to-back, 0 diferencias. **Las dos ramas hay que medirlas seguidas o la comparación acusa al cambio de lo que hizo un cron.**
> - 🩸 **Y tres gotchas más del MEDIDOR, los tres daban verde o rojo sin haber mirado nada:** el CXC dibuja los **DOS layouts** (celular y escritorio) y esconde uno con CSS, así que un `querySelector` a secas devuelve la caja de **0×0** — hay que quedarse con la VISIBLE; `route.fetch()` de Playwright resuelve `localhost` a **::1** y `next start` escucha en IPv4 (→ ECONNREFUSED con la página cargando bien); y **Comisiones dispara 5 RPC** contra la base en Micro y a veces no contesta en 120 s — si no carga se ANOTA (`no cargó`) en vez de darse por medida.
> - ⚠️ **Cómo se consiguió «con la línea», dicho de frente:** hoy producción no tiene ni un rechazo registrado (el detalle se empieza a guardar con este mismo cambio). En CXC y Proveedores se **INTERCEPTA** la respuesta y se le agrega `avisoMontos`; en Ventas y Comisiones, que la reciben del SERVIDOR, el nodo se **INSERTA** en el DOM en la posición exacta donde lo pone React. El componente medido es el mismo y las clases son las mismas.
>
> ### Candados
>
> `src/__tests__/lib/rechazos-de-switch.test.ts` (44 — el texto carácter por carácter, las palabras de las 10 familias, la lectura del log y que las dos carteras pidan su aviso por separado), **`src/__tests__/lib/rechazo-queda-registrado.test.ts` (7, corre `syncCarteraWeb` DE VERDAD** con el documento real y lee qué se escribió en el log) y **`src/__tests__/components/rechazos-visibles-en-pantalla.test.tsx` (13, RENDERIZA la pestaña de Boston** y lee el DOM: que la línea vaya ARRIBA del total, que nadie la esconda con una clase, y que **sin rechazos no se dibuje nada**).
> - **Verificado por mutación, 25 de 25 cazadas y 0 no-op** (`bash scripts/_mutar-candados-rechazos-visibles.sh`): el guard deja de rechazar · la fila rechazada se escribe igual · el sync de Boston vuelve a NO guardar el detalle · el detalle pierde el documento · pierde el monto · la línea nunca se dibuja · la pestaña deja de montarla · se esconde con una clase · el servidor deja de mandarla · se dibuja SIN rechazos · la pieza dibuja su caja vacía · la línea pierde el número · pierde el monto · deja de decir que está mal en Switch · el documento se pierde al leerlo · se muestra el monto más chico · **Boston recupera el Telegram** · se le apaga a las demás · el aviso del grupo deja de acotar por empresa · el de Boston tampoco · el módulo ignora la lista de empresas · una base caída tumba la pantalla · una fila sin monto se dibuja igual · el mismo documento se cuenta dos veces · la línea pasa a rojo.
> - 🩸 **La primera corrida fue 16 de 24 con 1 no-op, y se dice porque las 8 brechas eran REALES**: no había un solo test que corriera el sync (la mutación que reponía el bug original SOBREVIVÍA), el fixture del "monto más grande" tenía el mayor PRIMERO (así que "el primero" y "el mayor" no se distinguían), el fail-open solo cubría el error de PostgREST y no el `throw`, y las rutas no tenían candado de acotación por empresa. **Un verificador que da 16/24 y se publica igual es peor que no correrlo.**
> - 🩸 **UNA MUTACIÓN ROMPÍA EL ARCHIVO Y EL INFORME DECÍA «SOBREVIVIÓ».** En `perl -0pi -e 's|A|B|'` el delimitador es `|`, así que `\|\|` dentro del patrón se DES-escapa a `||` y se convierte en una **alternación con rama vacía**: matchea la cadena vacía en el byte 0 y el reemplazo se come el archivo entero. Con el módulo roto, vitest no llega a colectar y escribe `Tests  no tests` — **cero fallos**, y `probar()` lo leía como sobreviviente, acusando al candado de un agujero que no existe. Se arregló por los dos lados: delimitador `#` cuando el patrón lleva pipes, y `probar()` denuncia la corrida que no colectó nada.
> - 🩸 **La restauración va por COPIA, no con `git checkout`** (hay archivos NUEVOS y git aborta el comando entero), **`mutar()` exige que el archivo CAMBIE** (md5 antes/después) y **`probar()` exige encontrar el resumen de vitest** antes de creerle a un cero.
>
> **Diagnóstico read-only contra producción:** el barrido que midió el hueco vive en el propio informe del PR; la calibración del guard sigue siendo `node scripts/_diag-calibrar-guard-montos.mjs`.

> **Depurador — el DIVISOR tiene rango, y el rango es 0 ó 0.10-1.00 (27-jul-2026).** El precio es `TECHO(Costo CIF ÷ divisor) + extra`: el divisor NO es un porcentaje, es la **fracción del precio que representa el costo** — para 30% de margen se escribe **0.70**. 🩸 `marca_formulas` tenía **`TH Tommy Jeans` con `divisor = 70`** desde el 29-jun (un punto decimal olvidado): un costo CIF de $42 daba **$4** en vez de $63, o sea precios **100× más baratos**. Las 4 rutas que escriben fórmulas solo pedían `divisor >= 0`, así que el 70 entraba igual que el 0.70. Daniel: *"divisor deberia de ser 0.7, y si puedes obligar a que ese error no vuelva a pasar, no existe q sea mas de 1.0"*. Fila corregida a 0.70 con su aprobación; era la **única** fuera de rango en las 4 tablas.
> - **Fuente única: `src/lib/depurador/divisor.ts` → `validarDivisor()`** (módulo PURO), usada por `formulas`, `rubro-formulas`, `tienda-formulas` y `tienda-rubro-formulas`. El CHECK de la base (`20260727190000_divisor_rango.sql`, las 4 tablas) repite el mismo rango como último freno para lo que no pase por las rutas; **el código funciona con o sin él.**
> - **El 0 SIGUE SIENDO VÁLIDO y no es un descuido:** es el default de la columna y el centinela que `calcPrecio()` usa (`if (!f.divisor) return null`) para dejar el precio vacío y que se ponga a mano, o para mandarlo a `precio_fijo`. Hay filas reales apoyadas en eso (3 marcas + 10 excepciones). Rechazarlo habría roto guardarlas. Nunca se divide entre 0 — el centinela corta antes.
> - **Los dos bordes, y por qué ahí:** techo **1.00 inclusive** (arriba de 1 el precio queda POR DEBAJO del costo = definición de error de tipeo; 1.00 exacto es vender al costo, raro pero no destructivo). Piso **0.10**, porque el error simétrico es igual de caro: `0.07` en vez de `0.7` daría el precio **10× más caro**. El margen más agresivo que el negocio usó nunca es **0.63** (CK Legwear), así que el piso deja 6× de aire y no bloquea ninguna decisión concebible — mismo criterio holgado que el guard de costo diario: **un valor GRANDE no es un valor IMPOSIBLE.**
> - **El guard hace la conversión él mismo** en vez de recibir un `Number(body.divisor)` ya hecho: con la coerción del llamador, `null`, `""` y `[]` llegaban convertidos en **0** y se habrían leído como "sin fórmula", **borrando una fórmula buena en silencio**.
> - ⚠️ **Daño medido:** 3 plantillas de `TH Tommy Jeans` se descargaron con el divisor malo (3-jul, 21-jul y 22-jul; Angela / Fashion Wear; 10 estilos, 828 unidades, **$16.177,92** de costo). `carga_history` NO guarda los precios, solo los totales, y el Excel se sube a Switch a mano — **hay que revisar en Switch los precios de esos estilos**, el arreglo del divisor no los corrige hacia atrás.
> - Candado: `src/__tests__/lib/divisor-rango.test.ts` (46 casos, verificado por mutación: desarmar el techo rompe 11). Incluye barrido estático — una ruta que escriba un divisor sin llamar al guard pone el build **ROJO**.
> - **Barrido del mismo patrón "porcentaje vs fracción" (27-jul):** `comision_vendedor_tasa.tasa_venta` ya está blindada (`config/route.ts:90`, cap `0..0.20`, decimal). `itbms_pct` es un enum cerrado `0|7` (porcentaje entero, siempre `/100` al usarse) y `descuento_global_pct` es solo lectura desde Switch. **El divisor era el único campo de configuración sin tope.**


---

## - **Borradas en la limpieza del 26-jul-2026** (migración `20260726210100`): `switch_ventas

  - **Borradas en la limpieza del 26-jul-2026** (migración `20260726210100`): `switch_ventas_netas_vw` (nunca se usó — incluye ITBMS, lo descartó `20260529000300:22`), `switch_ultimo_pago_cliente` v1 (el CXC lee la `_v2`) y `cxc_aging` (la sucedió `switch_estadocuenta_aging_mv`). Tablas borradas en la misma tanda: `webauthn_credentials`, `chat_history`, `backup_clientes_master_20260509`, `fg_audit_log` (+ su ruta `/api/audit`, sin llamadores y con la tabla vacía) y `ventas_clientes` (+ su ruta `/api/ventas/clientes`; la UI usa `/api/ventas/clientes-12m`).
  - **Filas muertas y autovacuum (26-jul-2026, migración `20260726210200`):** `switch_recibos` (18,3%), `multifashion_tickets` (17,7%) y `switch_facturas` (2,4%) tienen `autovacuum_vacuum_scale_factor = 0.05`. La causa del churn es el sync: recibos hacía DELETE+INSERT de 3 meses 4×/día (no hay llave natural para upsert), tickets hace UPDATE ciego de la ventana, y facturas hace upsert no selectivo con `updated_at = now()`. El ajuste de autovacuum es paliativo; la cura para recibos ya está aplicada (ver abajo), la de tickets fue apagar el sync entero (ver abajo), y `20260726210300` (corrida A, sin bloqueo) es lo que devuelve el espacio ya inflado.
  - **`multifashion_tickets` — TABLA CONGELADA el 26-jul-2026. Ya no se escribe; los datos QUEDAN.** Era una copia derivada: las mismas facturas de `american_classic` que ya viven en `switch_facturas` (fecha, subtotal, descuento, impuesto, total, saldo) más un `switch_factura_id` que apunta a la factura. **Nadie la leía** — se auditó el código TS, los 57 RPCs y las 15 vistas que PostgREST expone, las migraciones, los scripts, `vercel.json`, el backup y el módulo Multifashion entero: cero lectores. El módulo saca TODOS sus números de `switch_facturas` vía `_multifashion_sf_vw`, y `switch_facturas` de american_classic arranca el **2024-05-07**, un año antes que los tickets (2025-05-02) y con 28.225 filas contra 15.819. La propia migración que la creó (`20260530000000`) decía "retirar en fase 3". Su cron reescribía **183 filas/día con un request HTTP por fila** para 0-6 cambios reales (el 97% de los tiquetes nace con saldo 0 y no se mueve nunca; solo 455 de 15.819 tienen saldo ≠ 0).
    - **Qué se apagó:** la entrada `/api/cron/multifashion-sync` de `vercel.json` (54 → 53 crons), el route entero, `src/lib/switch-api/sync.ts` (única librería que la escribía), `scripts/multifashion-backfill.ts`, el colateral de `switch-reconciliacion` (si quedaba, la reconciliación lo vería sin heartbeat 3×/día y volvería a escribir la tabla por la puerta de atrás) y sus filas en `EXPECTED_CRONS` (health-crons), `COLATERAL_RECOVER_AFTER_HOUR_UTC`, `SWITCH_CRON_ENTRADAS` y `CRONS_CUBIERTOS_POR_SYNC_LOG`. `multifashion_sync_log` (98 filas) queda congelada también: solo la escribía ese cron.
    - **Los datos NO se borraron**: 15.819 filas desde 2025-05-02. **Candidata a borrar si en unos meses nadie las extraña** — apagar la escritura se deshace en un minuto, borrar 15.819 filas no.
    - **El backup la SIGUE copiando** a propósito (`SWITCH_DATASETS` en el cron backup): mientras las filas existan es la única copia que las protege, y una tabla congelada comprime igual todos los días. Se saca del backup en el MISMO cambio que borre la tabla, nunca antes.
    - **Cómo volver a encenderla:** revertir el PR "retirar multifashion_tickets" (`git revert`) — trae de vuelta el route, `sync.ts`, la entrada de `vercel.json` y las 4 listas de vigilancia de una sola vez. Borrar también el candado `src/__tests__/lib/multifashion-tickets-congelada.test.ts`, que es lo que hace fallar el build si alguien vuelve a escribirla sin querer.
  - **`switch_recibos` — escritura selectiva (26-jul-2026).** El sync ya NO reescribe la ventana entera. Antes: DELETE de los 3 meses + INSERT de todo, en cada una de las 4 corridas diarias = **3.416 filas borradas + 3.416 insertadas por corrida** (13.664 filas muertas/día) para reflejar **~10 recibos nuevos** (medido: 41,4 recibos/día de alta real sobre 18 días). Ahora `leerMesGuardado()` trae el mes tal como está, `diffRecibos()` (`src/lib/switch-api/recibos-diff.ts`) lo compara contra lo que devolvió Switch y solo se escriben las diferencias. Medido contra producción el 26-jul: **3.416/3.416 filas pareadas, 0 escrituras, equivalencia exacta fila por fila** (`scripts/_diag-recibos-churn.ts`, solo lectura).
    - **La garantía de las BAJAS se conserva por construcción.** `existentes` = exactamente lo que borraba el DELETE viejo (mismo predicado), `deseadas` = exactamente lo que insertaba el INSERT viejo → `(tabla \ borrar) ∪ insertar` = `(tabla \ existentes) ∪ deseadas`. Un recibo que Switch anuló no se parea con nada y se borra igual que antes. Demostración completa en el encabezado de `recibos-diff.ts`.
    - **Por qué no puede conservar un dato viejo:** el único riesgo de un diff es el falso positivo. Las normalizaciones son sin pérdida contra la precisión de las columnas (`total` a 4 decimales = `numeric(14,4)`; `fecha_creacion` al milisegundo). Si alguna quedara corta el error sería falso NEGATIVO → se reescribe la fila (churn), nunca un dato desactualizado. En el peor caso el diff degrada al DELETE+INSERT de antes.
    - ⚠️ **`db-max-rows` = 1000 y corta EN SILENCIO.** `.range(0, 49999)` devuelve 1.000 filas sin error. `american_classic` jun-2026 tiene 1.259 recibos: sin paginar, las 259 invisibles se habrían leído como ausentes y **re-insertado en cada corrida** (recibos duplicados → comisión-cobro inflada). `leerMesGuardado()` pagina con `order("id")` —hace falta orden estable— y **verifica el total contra un `count: "exact"`**, cortando con error si no cuadra. Candados: `src/__tests__/lib/recibos-lectura-mes.test.ts` y `recibos-diff.test.ts`. **Cualquier otro lugar que compare contra una lectura de PostgREST tiene el mismo riesgo.**
    - `records_inserted` del `switch_sync_log` sigue siendo el TAMAÑO DE LA VENTANA, no lo escrito: es lo que muestran `/api/sync-status` y "Actualizar ahora". `synced_at` de las filas sin cambio queda con el sello de la corrida que las escribió — nadie la lee (solo la escribe el sync y la copia el backup).
    - ✅ **`loadImpuestoMap()` PAGINADO (26-jul-2026).** Tenía el mismo defecto: `.range(0, 99999)` sobre `switch_facturas` traía 1.000 filas en silencio. Solo truncaba en `american_classic` (3.904 facturas en la ventana contra 47-208 de las 5 B2B, muy por debajo del tope), pero el día que una B2B pase de 1.000 facturas en 4 meses, una retención de ITBMS real no se reconocería y se guardaría como **cobro real** → plata que nunca entró contada como cobrada en el "último pago" del CXC y en la comisión sobre cobro. Ahora pagina con `order("id")` y verifica contra `count: "exact"`, igual que `leerMesGuardado`. Además **falla cerrada**: antes un error del select devolvía un mapa VACÍO (todos los recibos → `es_retencion=false`); ahora lanza y la empresa queda `ok:false` en `switch_sync_log` con el mes intacto. Candado: `src/__tests__/lib/recibos-impuesto-map-paginado.test.ts` (incluye un chequeo estático que falla si alguien vuelve a meter un `.range()` con tope ≥ 1000 en el archivo).
    - ✅ **El MOSTRADOR no retiene ITBMS — guard aplicado (26-jul-2026, aprobado por Daniel).** Paginar el mapa destapaba **20 falsos positivos** de la heurística en `american_classic`. La heurística ("el recibo coincide con `impuesto/2` de ALGUNA factura del cliente dentro de ±35 días") asume un puñado de facturas candidatas; contra el pseudo-cliente de mostrador —**25.800 de las ~26.500** facturas de la empresa, 3.455 solo en la ventana— deja de ser evidencia y pasa a ser el problema del cumpleaños: un recibo de **$2.00 cuadra con 6 facturas distintas** y uno de $0.01 con 4. Y de fondo es una figura fiscal: agente de retención es un negocio registrado, no quien paga en efectivo en el mostrador. Los 6 `es_retencion=true` históricos de esa empresa son todos del mostrador, o sea la misma colisión.
      - **La identidad es `cliente_codigo = 'TCKCTA'`, NO el nombre.** El nombre cambia por empresa —verificado en la tabla: `"CONTADO"` en american_classic, `"VENTAS"` en vistana/fashion_wear, `"VENTAS LOCA"` en fashion_shoes, `"Contado"` en active_shoes/active_wear— mientras el código es **siempre `TCKCTA`**. Comparar por nombre habría sido un colador. `TCKCTA` además **ya es el criterio del sistema** para lo mismo: las RPC de comisión lo excluyen de la base de cobro sobre la MISMA tabla (`AND COALESCE(r.cliente_codigo,'') <> 'TCKCTA'` en `comision_b2b_v4/v5`, `comision_cobro_v3`, `comision_detalle`) y el checkout público lo resuelve con `CODIGO_CLIENTE_CONTADO` (`lib/catalogo/publico-switch-actor.ts`), constante que se REUSA en vez de duplicarla.
      - **Impacto medido del guard (26-jul-2026, ventana may-jul):** en `american_classic` cancela exactamente los 20 falsos positivos → **cambio neto CERO**. En 3 empresas B2B apaga **4 recibos** que hoy están marcados como retención: vistana 1, fashion_wear 2, fashion_shoes 1. **Los 4 son de total $0.00 y del pseudo-cliente mostrador**, o sea el caso degenerado de la heurística (un recibo de $0 "coincide" con `impuesto/2` de cualquier factura con ITBMS 0). No mueven un centavo: el **"último pago" no cambia para ningún cliente de ninguna empresa** (medido), y en comisiones son irrelevantes por partida doble — las RPC ya excluyen `TCKCTA` de la base de cobro Y suman por `total`, que es 0. Evidencia: `scripts/_probe-guard-impacto.ts`.
  - ✅ **`db-max-rows` = 1000 — barrido del repo COMPLETADO (26-jul-2026).** Helper único: **`src/lib/supabase-paginado.ts` → `leerTodoPaginado()`** (pagina, exige `count: "exact"` y **revienta** si lo leído no cuadra). Se blindaron: `leerMesGuardado` y `loadImpuestoMap` (sync-recibos), `buildSwitchIdMap` (sync-utilidad), frescura de CXC (`api/upload` + `api/notification-badges`), `api/catalogo/switch-clientes`, `lib/ventas/queries.ts`, catálogo público (`api/catalogo/[marca]/public`) y `api/catalogo/reebok/stats` + `/inventory`.
    - 🩸 **LECCIÓN CARA — contar la TABLA no es contar la CONSULTA.** El primer barrido dio 4 truncados "confirmados" a partir del tamaño de la tabla. Al medirlos consulta por consulta, **3 de los 4 eran falsa alarma**: la consulta real filtra y nunca se acerca a 1.000. `clientes_empresa_12m_vw` tiene 1.563 filas **pero se lee con `.eq("empresa", …)`** → máx. 791 (confecciones_boston), y el modo "Todas" usa otra vista de 115 filas. `switch_clientes` tiene 1.710 **pero se lee con `.eq("empresa_key", …)`** → 136-137 por marca. `products`/`inventory` del catálogo tienen 224 filas cada una, no miles. **Antes de declarar un truncado hay que correr LA CONSULTA con sus filtros y comparar contra su propio COUNT** — el tamaño de la tabla solo dice que el bug es posible, no que esté ocurriendo.
    - **El único que truncaba de verdad era `switch_estadocuenta`** (1.000 de 1.511) — y aun así **no cambia ningún número en pantalla**: las 6 empresas ya salían con su frescura correcta y el badge `cxcStale` da 0 antes y después. Es suerte, no diseño: las 6 sincronizan con minutos de diferencia y las 1.000 filas más recientes alcanzaban a incluir al menos una de cada una. Con otro reparto de filas por empresa, una se quedaba sin frescura. Por eso se arregla igual.
    - **REGLA — el orden de negocio NO se cambia al paginar.** Paginar exige un orden TOTAL (con filas empatadas PostgREST puede repetir o saltear entre páginas), pero cambiar la columna de orden cambiaría el orden en que el usuario ve los datos. Se conserva el orden original y se le agrega una columna única como **desempate**: `created_at desc, id` · `nombre, cliente_switch_id` · `ultima_compra desc, cliente_nombre, cliente_id` · `size, id`. Donde el orden sólo servía para tomar un máximo (frescura de CXC) se pagina por `id` y el máximo se calcula explícito — más robusto que confiar en "la primera fila gana".
    - **Dos disfraces del bug, ambos vedados por el candado:** (1) `.limit(N)` con N > 1000 es "alguien creyó estar cubierto" y no cubre nada; (2) paginar **sin `.order()`** no arregla nada. Candado: `src/__tests__/lib/supabase-paginado.test.ts` (comportamiento + barrido estático sobre los 9 archivos saneados).
    - **Medidos y SANOS hoy** (registrados para no volver a auditarlos a ciegas): `switch_estadocuenta_aging_mv` 218, `clientes_agregado_12m_vw` 115, `guia_items` 427, `prestamos_movimientos` 393, `guia_transporte` 160, `switch_proveedor_estadocuenta` 66, `directorio_clientes` 33, `reclamos` 31, `cheques` 5, `packing_lists` 0.
    - ✅ **`api/multifashion/fidelizacion/route.ts` SANEADA (12-ago-2026).** Paginaba a mano y **sin `.order()`** — el peor disfraz del bug, porque esta ruta AGREGA: con filas empatadas PostgREST puede saltear entre páginas y un salteo se ve como un número más chico, sin error y sin señal. Y no era latente: **`switch_facturas` de ACS ya está en 1.273 filas**, o sea que la 2ª página se pedía de verdad (`switch_clientes` va en 950, una sola página). Ahora usa `leerTodoPaginado` con `.order("id")` (uuid PK, único y estable) en las dos lecturas. **NO se pisó ningún orden de negocio: esta ruta no tiene uno** — el único consumidor (`ClientesMultifashionSubtab`) convierte `clientes[]` en un Map por `nombre_norm` y el orden de la lista lo pone el ranking de retail. Lo único que el orden decide es el desempate de `nombreFactura` en los huérfanos (gana el primer `cliente_nombre` no nulo): hoy eso ya era arbitrario y ahora es determinista — medido, **3 clientes de ACS tienen más de un nombre en sus facturas** (`LEIDYS RAQUEL ARAUZ`/`LEIDYS ARAUZ`, `Monica Rios`/`Monica Ríos`, `rafael rodriguez`/`RAFAEL RODRIGUEZ`). **Medido contra producción antes y después: cards IDÉNTICAS** (`frecuentes 66 · nuevos_mes 43 · dormidos 486 · cinco_pendiente 774`), **953 filas de `clientes` y 0 diferencias campo por campo.** El `catch` de degradación pre-DDL sigue funcionando: `leerTodoPaginado` prefija su etiqueta pero conserva el mensaje de PostgREST, así que `/descuento_global_pct/` sigue matcheando.
    - **El doble de Supabase del arnés de catálogos** (`src/__tests__/helpers/catalogo-mock-db.ts`) ahora devuelve `count` = largo de `data` por defecto, como haría PostgREST. Antes entregaba filas con `count: null` — la firma de una lectura NO verificable — y hacía fallar en el arnés a lectores que en producción reciben el count perfectamente.
  - **`switch_sync_log` se poda** desde el cron `cleanup-sessions` (02:30 UTC) vía la RPC `podar_switch_sync_log(90)`: retención de 90 días, pero SIEMPRE conserva las 10 filas más recientes de cada `(empresa_key, sync_type)` y nunca toca `status='running'`. Los tres lectores que no filtran por fecha (`alert-policy`, `/api/sync-status`, `/api/admin/sync-now`) piden "las últimas N de este par": una poda por fecha pura le borraría la última fila a un par retirado y el panel diría "nunca sincronizó". El paso es NO FATAL dentro del cron.

> **`switch_articulo_marca` — el diccionario que se quedó con el 22% del catálogo, y las DOS cosas que lo hicieron posible (7-ago-2026).** Es el `articulo_id → marca` que alimenta "Multifashion › Productos › por marca" (`switch_articulo_diario` no sabe de marcas: su `descripcion` es categoría+género). Lo escribe `sync-articulo-marca.ts` desde el cron `switch-articulos` (08:40 UTC).
>
> 🩸 **Medido en producción:** la tabla tenía **2.000 filas** (`articulo_id` 1…2004, 19 marcas de 33) contra un catálogo de **9.126 renglones**, y el módulo mostraba como "Sin marca" el **91,3% de los 4.071 códigos vendidos en 12 meses** y el **97,8% de los dólares**. En `switch_sync_log` no había **NI UNA** fila de `sync_type='articulo_marca'` — ni success, ni error, ni running.
>
> **Causa 1 — el catálogo de Switch REPITE artículos, y eso rompía el upsert.** `/apiarticulos/lista` devuelve **9.126 renglones con solo 8.447 `id` distintos**: 221 artículos vienen repetidos (679 renglones de más; uno aparece 12 veces), casi siempre en renglones CONSECUTIVOS de la misma página. Las copias son idénticas — 0 de 221 difieren en `codigo` y 0 de 221 en `marcaId`—, o sea que no hay dato que elegir, solo un renglón de más. Pero Postgres rechaza un `INSERT … ON CONFLICT` que traiga la misma llave dos veces en la MISMA sentencia, y el upsert manda de a 500: **el primer lote con un repetido adentro es el 5.º**, así que los 4 primeros entraban (500 × 4 = 2.000 filas exactas) y el 5.º tumbaba la corrida. Ahora se DEDUPLICA antes de escribir (`dedupeCatalogo`, puro), que además es lo correcto por definición — la llave de la tabla es `(empresa_key, articulo_id)`.
> - **Lo que NO era**, descartado midiendo y no razonando: **no fue el `maxDuration`** (el barrido completo mide **204 s** —184 páginas, p50 658 ms— y el sync de ventas de las 8 empresas **63-71 s** en 7 días seguidos, contra 800 s de techo: sobra más del doble, y por eso **no hace falta un cron aparte ni un barrido reanudable**, que además serían una segunda sesión contra american_classic); **no fue el endpoint cortando la paginación** (la página 41 devuelve datos, el barrido llega hasta la 184); **no fue una fila borrada del log** (la poda nunca toca `running` y conserva las 10 últimas de cada par).
>
> **Causa 2 — la corrida era INVISIBLE, y es la MISMA de `catalogo_tommy` repetida dos semanas después.** La migración del 6-ago creó la TABLA pero no tocó el CHECK de `switch_sync_log.sync_type`. El logger es degradable: el INSERT viola el CHECK, se traga el error y devuelve `logId = null` → `finishSwitchSyncLog` queda en no-op → **la corrida no deja fila, corra bien o corra mal**. Sin fila no hay racha, y sin racha la regla de los 2 fallos no tiene qué medir. Migración `20260807200000`; y el fix de raíz para que no haya una tercera vez es **`SYNC_LOG_TYPES`** (módulo PURO `sync-log-tipos.ts`, con `createSwitchSyncLog` tipado contra él) más el candado **`sync-log-tipos-check.test.ts`**, que lee el SQL de las migraciones y pone el build ROJO si el código estrena un tipo sin su DDL.
>
> **Causa 3 — el fallo no despertaba a nadie.** `switch-articulos` guardaba el error del diccionario en una variable, lo escribía con `console.error` y lo devolvía en un JSON que no lee nadie. Ahora pasa por la MISMA política anti-ruido que el resto (`alertSwitchCronErrors`, regla de los 2 fallos seguidos del par `(american_classic, articulo_marca)`, canal 🔧 SISTEMA) — **se reusa, no se duplica**, y en UNA sola llamada junto con los errores de ventas para no mandar dos mensajes por la misma corrida. El **heartbeat no cambia**: sigue mirando solo las ventas por artículo, porque un diccionario viejo no es un cron que no corrió (es el error de `all-0630`).
>
> **Guard del barrido corto:** el corte del barrido es una página VACÍA, así que un 200 con lista vacía a mitad del catálogo cortaría el sync contento, escribiría poco y se anotaría `success`. Ahora, si el barrido trae menos del **70%** de lo que la tabla ya sabe de esa empresa, **no se escribe nada** y la corrida queda `error`. El 70% es holgado a propósito: la tabla es aditiva (los descatalogados conservan su fila), así que con los años lo guardado puede superar al catálogo vivo — pero caer a menos de dos tercios no es un cambio de negocio plausible. El caso del 7-ago habría dado 2.000 contra 8.447 = **24%**.
>
> Candados: `src/__tests__/lib/articulo-marca-dedupe.test.ts` (incluye el barrido estático que impide volver a mandar el catálogo crudo al upsert) y `sync-log-tipos-check.test.ts`. Verificado por mutación: quitar el dedupe rompe 2, apagar el guard del barrido rompe 1, sacar `articulo_marca` del CHECK rompe 2, y dejar de alertar el fallo del diccionario rompe 1. Diagnóstico read-only: `FASE=a|c|d|e npx tsx scripts/_diag-articulo-marca-hueco.ts`.


---

## Notas de «Crons (vercel.json)»

> **`db-salud` — el único vigía que NO depende de la base (27-jul-2026).** Lee el endpoint Prometheus de Supabase (`https://<ref>.supabase.co/customer/v1/privileged/metrics`, Basic auth `service_role:<SUPABASE_SERVICE_ROLE_KEY>`; add-on GRATIS del plan Pro, no existe en Free — verificado contra producción: HTTP 200, 135 KB, 317 métricas), lo compara contra los umbrales de `src/lib/db-recursos.ts` y avisa a Telegram. **Por qué hacía falta:** el 26-jul la base devolvió 521 durante 1 h 16 min (22:41→23:57 UTC) y `cron_email_errors` no registró **ni una fila** de esa ventana — porque esa tabla vive DENTRO de la base caída. Toda la telemetría del sistema tenía el mismo defecto: escribe en el paciente. Acá el camino métricas HTTP → Telegram no toca Postgres, y el orden del route lo respeta (Telegram PRIMERO, base después). El dedup contra `cron_email_errors` (5 h por tipo) es **fail-ABIERTO**: si la consulta falla —típicamente porque la base está caída, o sea el caso que importa— se alerta igual.
> - **Umbrales** calibrados contra la línea base real con Micro en reposo (memoria libre 56,8 % · swap 13,5 % · disco /data 92 % · base 261 MB de 8 GB · load5 0,04 sobre 2 núcleos · 9 de 60 conexiones): avisa bajo 20 % de memoria libre, sobre 40 % de swap, bajo 25 % de disco, sobre 75 % de los 8 GB, sobre 1,5 de carga por núcleo, sobre 70 % de conexiones. Crítico en 10 / 70 / 12 / 90 / 3 / 90.
> - **Ojo con MemFree**: son 76 MB (8 %) en reposo. El número que vale es `MemAvailable` (539 MB, 57 %) — usar MemFree haría alertar todos los días. Igual con el disco: la partición correcta es `/data` (92 % libre), no `/` (28 %). Candados en `src/__tests__/lib/db-recursos.test.ts`.
> - **11 entradas, reparto NO uniforme**: más denso de tarde/noche (hueco máximo 180 min, mínimo 60 min entre 21:45 y 22:45), que es cuando corren los crons pesados y cuando ocurrió la caída. En la banda 00:00-05:00 hay que quedar a ≥30 min de los crons nocturnos — `cleanup-sessions.test.ts` lo hace fallar si no (fue lo que rechazó el primer reparto uniforme de 2 h).
> - **Para mirar sin spamear**: `GET /api/cron/db-salud?test=true` (sesión admin) devuelve muestra + evaluación **sin** tocar Telegram ni la base.
> - Runbook para Daniel: `docs/runbook-base-lenta.md`.
>
> 🩸 **El aviso de memoria se leía como falta de ESPACIO, y al 42% no debía sonar (30-jul-2026).** Daniel, textual: *"me preocupa que me manda alerta de espacio, eso que es si subi supabase"*. Acababa de pagar Supabase Pro y recibió `🟡 Memoria de emergencia en uso: 42%` seguido, **en la misma lista**, de `Disco libre 92%` y `Tamaño de la base 270 MB de 8 GB`. Dos defectos distintos:
> - **El umbral de swap era RUIDO PURO: 40 → 70 aviso, 70 → 85 crítico.** Medido ese día contra el endpoint de métricas: swap usado **40,3 %** —parado justo encima del umbral— con memoria disponible **53,3 %** y `node_vmstat_oom_kill` en **0** (la base nunca fue matada por memoria). O sea la base estaba **sana** y el mensaje llegó **3 veces** (28, 29 y 30-jul). ⚠️ **Por qué el número solo no sirve de mucho:** el swap usado es una **marca de marea alta y pegajosa** — el kernel no trae de vuelta las páginas hasta que alguien las pide, así que sube y casi nunca baja: **13,5 % el 27-jul → 40,3 % el 30-jul, sin ningún incidente en el medio**. Un umbral cerca de la deriva normal es una alerta que, una vez que suena, suena para siempre. La señal que importa es la memoria **DISPONIBLE** (umbral propio, 20 %) y `oom_kill`. El 70 deja el doble de aire sobre la deriva observada y **sigue atrapando el episodio real**: durante la caída del 26-jul el swap llegó a **86 % → crítico**. Si algún día la deriva normal cruza el 70, el arreglo **NO** es volver a subir el número: es dejar de alertar por swap usado y mirar la **actividad** de swap (`node_vmstat_pswpin/pswpout` entre dos muestras), que sí distingue "hay páginas viejas guardadas" de "está paginando ahora".
> - **El mensaje ya no mezcla memoria con almacenamiento.** El estado va en **bloques rotulados** — `MEMORIA (es lo que se aprieta)` / `ALMACENAMIENTO (va aparte, no tiene que ver con la memoria)` / `SERVIDOR` —, los hallazgos de memoria empiezan con la palabra **MEMORIA** en mayúsculas, y cuando el problema ES de memoria se agrega una línea que dice lo que hacía falta decir: *es MEMORIA (RAM), no espacio de almacenamiento; tener disco libre no lo arregla, y el plan de Supabase no cambia la RAM*. Esa aclaración **no** aparece cuando el hallazgo es de almacenamiento (volvería a mezclar los dos temas). La palabra "swap" sigue prohibida en los textos (regla vieja de no-jerga): se dice "memoria de respaldo".
> - Candados en `src/__tests__/lib/db-recursos.test.ts`: que la medición real del 30-jul (base sana) **no mande ningún mensaje**, que el 86 % siga siendo crítico, y que el disco nunca vuelva a quedar entre las cifras de memoria.
>
> **Un backup fallido ya no pisa el índice bueno (27-jul-2026).** El meta (`meta.json` / `meta-switch.json`) es lo que le dice a `restore.mjs` QUÉ tablas restaurar y cuántas filas esperar. Se subía siempre, con `upsert: true`, incluso cuando todos los datasets habían fallado. La corrida `?grupo=switch` de las 23:30 del 26-jul cayó dentro de la caída de Supabase y subió un meta con `datasets: []` y 60 KB del HTML del 521, **pisando el bueno de la 01:28**. Medido en R2: `data/2026-07-26/` tenía los 59 objetos correctos y el índice decía cero — `restore.mjs --list` mostraba "OK … switch 0". La peor forma de fallar: una copia buena que se ve inservible. Ahora, si la corrida no salvó NI UN dataset y hubo errores, el meta viejo se conserva (en Supabase **y** en R2) y sale un aviso a Telegram. Una corrida PARCIAL sí escribe: refleja lo que quedó. Agravante que lo hace urgente: 23:30 es la ÚLTIMA entrada del grupo switch del día UTC — no hay segunda oportunidad detrás. Candado: `src/__tests__/lib/backup-meta-no-pisar.test.ts`.
>
> **`?grupo=switch` salió del horario de oficina: 19:15 → 23:30 UTC (26-jul-2026).** Es el ÚNICO grupo de backup que barre las tablas grandes (`SWITCH_DATASETS`: `switch_articulo_diario` 197k filas + `switch_facturas` 52k; el grupo core NO las incluye), y a las 19:15 UTC = **14:15 Panamá** lo hacía en plena tarde. Movido a 23:30 UTC (18:30 Panamá), **dentro del mismo día UTC** — el guard no-op de la 2ª oportunidad compara contra el día UTC, así que cruzar la medianoche la habría convertido en la corrida primaria del día siguiente — y con margen antes de la ventana de deploy 23:50-00:20. `EXTRA_ENTRY_HOURS_UTC` se actualizó en el mismo commit; `cron-calendario.test.ts` ahora **deriva** esas horas de vercel.json en vez de repetirlas a mano.
>
> **Es higiene, NO el arreglo de los picos de /ventas — no confundirlos.** Se probó la hipótesis de que este scan enfriara la caché y disparara los picos: UNA observación lo sugirió (270 ms → 1.514 ms justo después de un scan) pero **3 ensayos controlados no la reprodujeron**, y en uno el pico apareció ANTES del scan. Los picos de /ventas eran el seq scan de las RPC no sargables (ver la regla de rangos en "Base de datos"); eso se arregló aparte. Mover el backup se sostiene solo por sentido común (barrer 250k filas en horario de oficina no aporta nada), no por evidencia causal.
>
> **Backup — estructura en R2 y completitud (jul-2026):** los 3 grupos escriben en el MISMO esquema: `data/YYYY-MM-DD/<tabla>.ndjson.gz` + `data/YYYY-MM-DD/meta.json` (core, 49 datasets), `data/YYYY-MM-DD/meta-switch.json` (switch, 8), y `_storage/<bucket>/<path>` con path ESTABLE (binarios inmutables — versionarlos por fecha multiplicaría 198 MB/día sin ganar nada). El `manifest.json` de la raíz NO es dedup entre días: las keys llevan la fecha, así que solo evita repetir trabajo dentro del mismo día (2ª/3ª entrada, pendientes por deadline).
> **Storage: una sola réplica, y vive en R2 (26-jul-2026).** La copia bucket→bucket DENTRO de Supabase (`backups/_storage/<bucket>/<path>`) se eliminó: eran **1.596 archivos / 103,2 MB** en el MISMO proyecto que decía proteger, el 18% del GB del plan (Storage estaba al 56%), y encima nunca había copiado `marketing` (55,1 MB) ni `joybees-photos` (15,9 MB). R2 sí tiene los 5 buckets completos (3.204 archivos, 198 MB), verificados uno a uno por tamaño + 20 por sha256 antes de borrar. Restore: `node scripts/restore.mjs --source r2 --storage <bucket>` (sin `--source` ya asume r2; con `--source supabase` corta con mensaje). Candado: `src/__tests__/lib/backup-storage-solo-r2.test.ts`. **No reintroducir la copia intra-Supabase.** Lo único que queda bajo ese prefijo es `_storage/meta-r2.json`, el resumen auditable de la réplica a R2.
>
> Una carpeta de fecha necesita **los DOS metas** para ser restaurable. `scripts/restore.mjs --list` valida eso y marca `OK / PARCIAL / DAÑADO / INSERVIBLE` (antes listaba las carpetas a secas: el 25-jul mostraba `2026-07-25` como disponible y el restore moría con 404 en meta.json). La corrida core evalúa AYER y alerta por Telegram (`backup_r2_incompleto`) si quedó a medias. Retención R2: `RETENCION_R2` = 21 diarios + 8 lunes + 24 días-1, **solo informe** (no borra nada en R2 todavía).

> **La pasada de las 8:45 a.m. se quitó porque era una falsa alarma DIARIA (10-ago-2026).** Daniel empezó a apagar la PC de la oficina a las 5/6 de la tarde. Apagada desde las 6 p.m., a las 8:45 a.m. (13:45 UTC) el agente lleva **~14 horas** sin reportar: el umbral de silencio de 6 h se cruza **siempre**, y el vigía avisaba todos los días de algo que es el horario normal, no una falla. La primera pasada que queda es **15:00 UTC = 10:00 a.m.**, con la oficina ya abierta: a esa hora, que nadie haya prendido la PC sí merece que suene. **NO se tocó `HORAS_PARA_VIGIA` (6 h)** — el umbral estaba bien; lo que estaba mal era la hora a la que se preguntaba.
> - **Hueco máximo con 3 pasadas: 16h45** (22:15 UTC → 15:00 UTC del día siguiente; los otros dos son 5h y 2h15). Sigue por debajo de `CRON_STALE_HOURS_DEFAULT` (26 h) con 9h15 de margen, así que `asistencia-vigia` **no** necesita entrada en `CRON_STALE_HOURS_POR_CRON`. Con 4 pasadas el hueco era 15h30 — el cambio no acerca el cron al umbral lo suficiente como para justificar un override.
> - **Correr menos veces NO pierde avisos**: `alertado_en` deja pasar uno por episodio de todas formas. Lo único que cambia es la demora entre que la PC se apaga y Daniel se entera, y de noche esa demora no era accionable.

> **`cheques-alert` — aviso el DÍA HÁBIL ANTERIOR, 14:15 UTC = 9:15 a.m. Panamá (27-jul-2026).** Pedido de Daniel, textual: *"QUIERO aviso de cuando se vence un cheque un dia antes, almenos q venca el lunes, avisame el viernes."* Corriendo un día hábil D, la ventana de `fecha_deposito` es **[D, N]** con N = el próximo día hábil después de D: jueves→viernes, **viernes→sábado+domingo+lunes**, sábado/domingo→**no se manda nada**. La regla vive en `src/lib/cheques-aviso-ventana.ts` (módulo PURO, sin base ni Telegram); el I/O en `cheques-alert.ts`.
> - **Por qué la ventana llega hasta el próximo día hábil y no solo "mañana":** si el viernes solo mirara mañana, un cheque que vence el **sábado** no se avisaría nunca — sábado y domingo no hay aviso y el lunes ya venció. Antes el cron miraba hoy+mañana a secas y ese hueco existía. **HOY sigue incluido** (comportamiento previo, y a Daniel le sirve el recordatorio del día): un cheque del lunes se anuncia el viernes *"el lunes 3 ago"* y otra vez el lunes *"HOY"* — días distintos, no un duplicado.
> - **Anti-duplicado (`yaAvisoHoy`):** el `cron_heartbeats` de `cheques-alert` es la llave. Si hay un success posterior al inicio del día **Panamá** (05:00 UTC), la corrida no manda nada — cubre el reintento de Vercel y la recuperación de la reconciliación. **Fail-OPEN**: si no se puede leer el heartbeat, el aviso sale igual (perder un cheque cuesta más que repetir un mensaje). El heartbeat se registra **también** el fin de semana y sin cheques, o el watchdog alertaría cada sábado.
> - **Por qué 14:15 y no 14:00 en punto:** 14:00 es `switch-reconciliacion`, que puede correr hasta 740 s. 14:15 queda limpio y a 30 min de `db-salud` 14:45. Y `COLATERAL_RECOVER_AFTER_HOUR_UTC["cheques-alert"]` subió **14 → 15** para que la pasada de las 14:00 no se adelante 15 min a su propio run (solo recupera la de las 18:00).
> - **Filtros:** `estado='pendiente'` **y `deleted=false`** — lo segundo faltaba: un cheque borrado (soft-delete) seguía avisando. **Sin cheques por vencer NO se manda mensaje** (un "no hay nada" diario es ruido).
> - ⚠️ **Feriados de Panamá: NO los tenemos y no se inventa un calendario.** Si el lunes es feriado el aviso igual salió el viernes, que es lo correcto. Lo que queda descubierto es el caso inverso: un cheque que vence el martes tras un lunes feriado se avisa el lunes (feriado) en vez del viernes. Limitación conocida y aceptada.
> - Para ver el texto sin spamear Telegram: `npx tsx scripts/_dryrun-cheques-aviso.ts`. Candado: `src/__tests__/lib/cheques-aviso-vencimiento.test.ts` (20 casos con fechas FIJAS).
>
> **Corrida temprana de ventas 11:50 UTC = 06:50 Panamá (26-jul-2026):** las 8 empresas, `tipo=facturas`, slot `facturas-1150`. Cierra el hueco entre el bloque `tipo=all` de la madrugada (00:30-01:30 Panamá) y las 10:00 a.m.: quien entraba a trabajar a las 8 a.m. veía datos de 7h30 atrás; ahora ve los de las 6:50 a.m. (1h10). **Por qué 11:50 y no 12:00:** en su momento a las 12:10 corría `reebok-catalogo` (active_shoes) — 12:00 dejaba 10 min, por debajo de los 15 de `SEPARACION_MINIMA_MIN`. La hora se conserva; desde el 13-ago-2026 los catálogos se mudaron a la ventana de uso de Panamá y su vecino más cercano pasó a ser `acs-fidelizacion` 11:30, a 20 min. `integrity-check` 12:00 no toca Switch.
>
> **Ventas B2B y ventas ACS a la misma hora, en UNA sola entrada (26-jul-2026):** a las 11:50/15/19/23 UTC el sync de facturas cubre las 8 empresas en una entrada, no dos. Dos entradas de `tipo=facturas` a la misma hora producirían el MISMO nombre de slot (`facturas-1500`, derivado de `<tipo>-<hhmm>`) → heartbeats pisados y `slotsHuerfanos` sin poder decir cuál ocurrencia se perdió. Las empresas se procesan serialmente dentro del route (sesión única) con american_classic primero; la corrida completa mide ~1 min (facturas son 4-8 s por empresa).
>
> **Por qué 15/19/23 y no 14/18/22 (las 09:00/13:00/17:00 Panamá que se pidieron):** 14:00 y 18:00 son EXACTAMENTE las pasadas de `switch-reconciliacion`, que puede abrir la sesión de cualquier empresa hasta 12 min (`RECOVERY_BUDGET_MS` = 740 s). Se corrió todo una hora → 10:00/14:00/18:00 Panamá.
>
> **Plan Vercel Pro:** las funciones tienen tope `maxDuration` 800s (Fluid Compute). Cada entrada de cron sigue siendo 1×/día por diseño del sistema de slots, no por límite del plan.
>
> **Heartbeats por-slot de switch-sync:** cada entrada de switch-sync lleva `&slot=<tipo>-<hhmm>` (hhmm = hora UTC de su schedule, ej. `estadocuenta-2110`) y registra un heartbeat granular `switch-sync:<slot>` además del base. Los slots se DERIVAN de `SWITCH_CRON_ENTRADAS` (src/lib/cron-telemetry.ts) — fuente única: al agregar/mover una entrada de switch-sync se actualiza vercel.json y esa constante, y un test compara ambas. health-crons NO alerta por filas de slot que aún no existen (se siembran solas en <24h).
>
> **Slots huérfanos (jul-2026):** si la ocurrencia de un slot no dejó su heartbeat propio pero sus pares quedaron al día (recuperación de la reconciliación u otra entrada que cubre los mismos pares), `switch-reconciliacion` escribe la marca `switch-sync:<slot>#recuperado` y health-crons deja de contarlo como caído (`slotsCubiertos[]`, 200). La marca NUNCA pisa el heartbeat propio del slot: si la entrada lleva >50h (2 ocurrencias) sin correr de verdad, vuelve a reportarse — ESE es el anti-enmascaramiento.
>
> **El criterio de "cubierto" es el TRABAJO, no quién lo hizo (26-jul-2026).** Antes se exigía además que la entrada NO se hubiera invocado ("un slot que corrió y falló no se cubre"). Esa condición no protegía nada —el fallo ya se reporta como `corrio-y-fallo` mientras el trabajo esté pendiente— y dejaba un hueco: compensado el trabajo por otra corrida, el slot no recibía marca NI volvía a reportarse, y su heartbeat congelado disparaba "sin success reciente" en el watchdog día tras día con los datos frescos. Medido ese día: `facturas-1500` (invocación perdida) quedó silenciado y `estadocuenta-1605`/`1610` (corrieron 25-jul 16:20/16:22, fallaron, y la ronda de las 21:1x reparó los pares) alertaron — mismo estado, distinto trato. Lo único que sigue vedado es certificar una ocurrencia que la propia entrada resolvió ENTERA dentro de su ventana (`entradaHizoTodo`): ahí no hubo recuperación de nadie y un día sano debe seguir siendo cero marcas. El campo `entradaCorrio` de `slotsCubiertos[]` distingue los dos casos para auditoría.
>
> **Slots INTRADÍA — el ancla es la OCURRENCIA, no el día (jul-2026):** la reconciliación recupera por PAR (empresa, sync_type) contra el día Panamá. Para un cron diario eso alcanza; para uno intradía cuyo trabajo es "refrescar otra vez lo mismo", NO: el par ya tiene el success de la mañana. `clasificarSlots()` (src/lib/cron-telemetry.ts) pregunta lo correcto —"¿hay un success POSTERIOR a MI ocurrencia?"— y devuelve `cubiertos` (marca `#recuperado`) y `desatendidos`. Los `desatendidos` se **re-ejecutan** en la misma pasada, sumados al mapa por empresa (sesión única, un solo token). `motivo`:
> - `sin-invocacion` — Vercel perdió la corrida. Solo se declara cuando venció la ventana de jitter (`SLOT_RUN_WINDOW_MIN`=**30 min** desde el 26-jul-2026; era 120 bajo Hobby, donde el disparo se atrasaba hasta 58 min. Con Pro el disparo va de +1s a +40s y el slot más largo dura ~4 min): no adelantarse a una entrada que puede llegar tarde. Bajar el número fue lo que destapó la ronda de las 16:0x — con 120 min sus ocurrencias de 16:05 y 16:10 vencían 18:05/18:10, o sea después de su única pasada posterior (18:00), y no se re-ejecutaban nunca.
> - `corrio-y-fallo` — la entrada llegó y dejó el trabajo a medias. NO espera la ventana (ya no hay a quién esperar) y se **reporta** vía `alertSwitchCronErrors` con la política anti-ruido 401 intacta (un `statement timeout` no es silenciable → alerta ya). Dedup: si el propio route de switch-sync ya dejó rastro en `cron_email_errors` posterior a la ocurrencia, no se duplica.
>
> Guarda de concurrencia: una fila `running` más joven que `RUNNING_STALE_MIN` (30 min) congela el slot — no se re-ejecuta encima de una corrida viva. En un día sano el barrido es un **no-op total** (cero llamadas a Switch).

> **El candado de sync EXPIRA y se suelta solo (27-jul-2026).** El mutex que protege la sesión única de Switch es el índice único parcial `switch_sync_log_running_lock` sobre `(empresa_key, sync_type) WHERE status='running'`. Una fila 'running' solo se cierra si el proceso que la abrió llega VIVO a `finishSwitchSyncLog` — y cuando Vercel mata la función al agotar su `maxDuration`, **el proceso deja de existir en ese instante: no hay `finally`, `catch` ni handler de salida que alcance a escribir**. La fila queda abierta y el candado, puesto. No es un bug de manejo de errores; es la consecuencia de un kill, y ningún arreglo dentro del proceso puede evitarlo.
>
> 🩸 **La causa concreta era aritmética, no una carrera:** `/api/admin/sync-now` ("Actualizar ahora") declaraba `maxDuration = 300` y el sync de `catalogo_tommy` mide **427-485 s** (p50 485 s sobre 30 días). 300 s de presupuesto para 8 min de trabajo = **muerte garantizada en cada clic**. Medido el 27-jul: las 3 filas colgadas de ese día eran `triggered_by='manual'`; las corridas del cron `tommy-catalogo` (800 s) del mismo día salieron todas `success`. Ese techo subió a **800, igual que los crons** — corre exactamente los mismos syncs, así que no hay razón para que tenga menos presupuesto. Censo de 30 días: **12 atascos en 9 pares / 7 crons** (`catalogo_tommy` 3, `costo` 4, `estadocuenta` 4, `catalogo_reebok` 1); los de `by=cron` son muertes reales de la invocación (p. ej. el `statement timeout` del 25-jul). Evidencia reproducible: `node scripts/_diag-lock-atascado.mjs` (solo lectura).
>
> **Tres cambios, y los tres hacen falta:**
> - **El corte se DERIVA del techo real**, no es un número suelto: `RUNNING_STALE_MIN = ceil((FUNCTION_MAX_DURATION_S + margen)/60)` = 30 min, o sea **más del doble** de la vida máxima posible de un run (800 s). Una corrida VIVA nunca entra. `markStaleRunningLogs` (sync-empresa) era una **segunda implementación** con su propio `30 * 60 * 1000` a mano y su propia copia del mensaje: ahora delega en `clearStaleRunning`. Dos copias del mismo candado es una que se corrige sola y otra que empieza a soltar candados de corridas vivas.
> - **`barrerRunningAtascados()` — barrido GLOBAL**, de cualquier par, en `switch-reconciliacion` (10/14/18 UTC) y `cleanup-sessions` (02:30), ambos pasos NO FATALES. Sin esto la limpieza dependía de que volviera a correr **el mismo par**: `catalogo_tommy` corre 2×/día, así que la fila de las 18:52 mantenía el candado puesto hasta las 12:40 del día siguiente — **17 h 48 min bloqueando "Actualizar ahora"** por un proceso que ya no existía. En `cleanup-sessions` va ANTES de la poda a propósito: `podar_switch_sync_log` nunca borra filas 'running', así que una atascada sobrevivía a la poda para siempre.
> - **"error" vuelve a significar error.** El cierre por atasco lleva la marca **`#atascado`** (misma convención que `#recuperado`/`#visto`; `status` sigue siendo `'error'` porque el CHECK de la tabla solo admite running/success/error y no hacía falta DDL). `computeStreakSilenciable` **saltea** esas filas con `continue` en vez de cortar. Mentía en las dos direcciones: sumaba al streak y podía escalar una alerta de Switch por un timeout NUESTRO, y —peor— como el texto del atasco **no es silenciable**, la fila **CORTABA** el streak: un 401 real con una corrida atascada en el medio se leía como "primer fallo" y se callaba, corrida tras corrida. `esRunAtascado()` reconoce las 3 redacciones que existen en producción para que las 17 filas históricas también cuenten bien.
>
> **Lo que NO se tocó y no debe tocarse:** la protección de sesión única. Switch admite **un solo token válido por USUARIO** (PDF del API, p. 6) y cada empresa entra con un único usuario de API, así que dos syncs simultáneos de la misma empresa se tumban el token entre sí (code 0006). Un run RECIENTE sigue bloqueando igual que siempre. Candado: `src/__tests__/lib/sync-lock-atascado.test.ts` (17 casos), verificado por mutación — aflojar el corte a 1 min, quitar el skip de `#atascado` o devolver `sync-now` a 300 s rompen 6 tests.
>
> **Gracia de siembra acotada (jul-2026):** "fila de slot ausente = todavía no sembrada" ya no es eterno. La reconciliación escribe una vez la marca `switch-sync:<slot>#visto` (insert-if-absent) para los slots sin heartbeat propio; pasadas `SLOT_SEED_GRACE_HOURS` (50h) la ausencia se reporta como caído en health-crons y en el watchdog Telegram. Sin esto, `switch-sync:all-0540` llevaba desde el 23-jul sin fila propia (corrió y falló el 24, invocación perdida el 25) y era invisible para AMBOS vigías. Las marcas `#recuperado`/`#visto` no se vigilan como crons (`esMarcaDeSlot`).
>
> **`#visto` es además el PISO de ocurrencias (26-jul-2026).** `ultimaOcurrenciaUtc` ancla en la ocurrencia programada más reciente y, para una hora que hoy aún no llegó, esa ocurrencia cae AYER. Para una entrada creada HOY —el calendario pasó de 47 a 52 entradas a las 06:14 UTC— eso es una ocurrencia en la que la entrada no existía: la pasada de las 10:02 evaluó `facturas-1300/1700/1900/2100` contra las 13:00-21:00 del día anterior y, como american_classic/facturas tenía corridas posteriores, les escribió `#recuperado` certificando corridas que jamás estuvieron programadas. La rama simétrica era peor: con esos pares atrasados los mismos slots habrían salido `sin-invocacion` → re-sync contra Switch y alerta 🚨. Ahora `slotConocidoDesdeMs()` = el más antiguo de {heartbeat propio, `#visto`} y **ninguna ocurrencia anterior a ese instante se clasifica** —ni cubierta ni desatendida—. La marca se agrega al mapa en la misma pasada en que se escribe, así que el piso ya rige la primera vez. Sin ningún rastro (NaN) no hay piso: fail-abierto, para no volver ciego al clasificador si la escritura falla.
>
> **Un cron RETIRADO deja de alertar — registro único de crons vigilados (27-jul-2026).** Retirar un cron nunca borraba su fila de `cron_heartbeats`, y el watchdog Telegram recorre **todas** las filas de la tabla (health-crons no: recorre listas). Resultado: la fila huérfana envejecía para siempre y disparaba `⏰ Watchdog crons — N sin success reciente` **todos los días**. Medido: el #316 retiró `multifashion-sync` el 26-jul (entrada de vercel.json, route, librería y colateral) y su fila quedó con `last_success_at = 2026-07-26T05:00:34` → alerta diaria eterna por un cron que ya no existe. El mecanismo `esSlotRetirado` (#290) cubría exactamente esto pero **solo para los slots** de switch-sync, porque los slots se derivan de una lista; un heartbeat de nombre plano se escapaba por el costado.
> - **Ahora `esCronRetirado()` lo generaliza** (src/lib/cron-telemetry.ts): un `cron_name` que no esté en el registro de crons conocidos no se vigila. El registro son `CRONS_FAIL_CLOSED` (fila ausente = caído) + `SEED_TOLERANT_CRONS` (fila ausente = aún no sembrada), y `esSlotRetirado` queda como su rama de slots. `esHeartbeatNoVigilable()` suma las marcas (`#recuperado`/`#visto`) y los heartbeats de acción MANUAL (`HEARTBEATS_NO_CRON` → `sync-now-refresh-vistas`, que escribe el botón "Actualizar ahora" de Ventas como cooldown: nadie lo programa, así que estar stale es su estado normal. Era un falso positivo LATENTE — la fila no existe en producción todavía, pero el día que alguien usara el botón, el watchdog habría alertado 26h después).
> - **La tensión con el fail-closed se resuelve FUERA del runtime.** La regla ingenua "si no está en vercel.json no alerto" sería **peor que el bug**: quien borrara una entrada por accidente apagaría la alerta en silencio. Por eso el criterio de runtime mira un **registro de código**, que borrar vercel.json no encoge — el cron sigue vigilado, su heartbeat envejece y los dos vigías alertan igual que hoy. Retirar un cron a propósito son **dos ediciones deliberadas** (vercel.json + registro), y `src/__tests__/lib/cron-registro.test.ts` exige la **biyección** entre ambos: tocar uno solo pone el build **ROJO**. El accidente se atrapa en CI, no en silencio en producción. El mismo test verifica estáticamente que `cron-telemetry.ts` no lea `vercel.json` ni el filesystem — si lo hiciera, todo el argumento se cae.
> - **Los dos vigías comparten el registro.** `EXPECTED_CRONS` vivía dentro de health-crons y ahora **es** `CRONS_FAIL_CLOSED`. Con la lista duplicada divergían: `db-salud` (desplegado el 27-jul) estaba vigilado por el watchdog Telegram —que recorre todas las filas— y era **invisible** para health-crons. Quedó en `SEED_TOLERANT_CRONS` hasta que lleve días sembrado. La decisión de a quién reportar es una función pura, `cronsStaleParaAlerta()`, testeada en las **dos direcciones** (un retirado no alerta / un vivo sí, uno por uno sobre todo el registro).
> - **Filas viejas:** migración `20260727120000_cron_heartbeats_borrar_retirados.sql` borra las 3 huérfanas (`multifashion-sync`, `switch-sync:facturas-2315` y su marca `#recuperado`) con una lista EXPLÍCITA — nada de `LIKE`: llevarse por delante el heartbeat de un cron VIVO se ve igual que "nunca corrió" y dispararía la alerta falsa en la dirección contraria. Es higiene: el arreglo de código ya calla la alerta con la fila puesta.
>
> **El vigía externo se murió en silencio — y el 503 era el culpable (30-jul-2026).** cron-job.org le mandó a Daniel *"your cronjob has been disabled automatically because of too many failed executions"*: **26 fallos consecutivos** de `/api/health-crons`, todos **503**. Durante días, si un sync se caía, **ningún observador externo avisaba**. El que vigilaba a los crons no tenía quien lo vigilara.
> - **La cadena completa, medida contra producción.** `confecciones_boston` ganó `estadoCuenta: true` (pestaña de Boston). Su estadocuenta hace **una llamada HTTP por cliente** y boston tiene **4.912 clientes** contra 136-139 de las demás: el ÚNICO run exitoso de su historia tardó **3.240 s (54 min)** y fue un `triggered_by='backfill'` local. El techo de la función es **800 s** → el run de las 06:30 **muere siempre**, y un proceso matado no ejecuta `finally`: no registra heartbeat NI alerta. Por eso `switch-sync:all-0630` no volvió a registrar heartbeat desde el **27-jul 06:30:39**, aunque las facturas de american_classic del MISMO run salieran bien (06:31:23). Todas las filas de `confecciones_boston/estadocuenta` desde el 28-jul son `error` con `#atascado` (las cierra el run siguiente). Reproducible: `DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-vigia-503.ts`.
> - **El 503 no estaba equivocado: estaba MAL DIRIGIDO.** Bastaba UN cron stale para que el endpoint devolviera 503 en TODAS las llamadas. Un semáforo que se queda en rojo para siempre no es un semáforo: es un semáforo que alguien apaga. Y el cron roto **ya lo venía reportando el watchdog Telegram** los días 27, 28 y 29 — la redundancia costó la vigilancia externa de los otros ~50 crons.
> - **Ahora el código HTTP responde "¿la vigilancia funciona?", NO "¿hay hallazgos?"** (`veredictoVigiaExterno`, función PURA en cron-telemetry.ts). Los hallazgos viajan **siempre** en el cuerpo (`stale[]`, `staleCount`) — no se esconden — pero solo levantan 503 cuando el vigía INTERNO no puede reportarlos él mismo: **(a)** `switch-reconciliacion` stale (es quien hospeda el watchdog Telegram: si él no corre, nadie adentro puede avisar nada), **(b)** **caída masiva** ≥ `UMBRAL_CAIDA_MASIVA` (5) crons stale a la vez = la firma de "Vercel dejó de invocar crons", **(c)** no se pudo leer `cron_heartbeats` (fail-closed: un vigía ciego grita). `ok` conserva su viejo significado (cero hallazgos); **`vigilanciaOk` es el semáforo**. Un 503 vuelve a ser raro y significativo, que es la única forma de que un servicio de monitoreo no lo termine apagando.
> - **Un problema de AUTH ya nunca devuelve 503.** Sin `HEALTHCHECK_TOKEN` configurado respondía 503 "fail-closed" — prudente en apariencia y un error de diseño: hacía que un olvido de configuración se viera **idéntico** a "los crons se cayeron", y para siempre (una env var ausente no se arregla sola) hasta que el monitor se apagara. Ahora es **401**, igual de fail-closed (nadie entra sin credencial) pero diciendo la verdad.
> - ⚠️ **La credencial NO es `CRON_SECRET`** — probarlo con `Authorization: Bearer $CRON_SECRET` da **401 a propósito**: un monitor de terceros no debe poder disparar crons. Es `?token=<HEALTHCHECK_TOKEN>` (o header `x-healthcheck-token`), comparado en tiempo constante. Verificado en producción: la env var **está** configurada (sin token da 401, no 503), o sea que cron-job.org venía autenticando bien y el 503 era genuino. El 401 ahora incluye el campo `comoAutenticar` como pista.
> - **VIGILANCIA MUTUA — el que vigila también es vigilado, y NO hizo falta otro cron** (que podría morirse igual de callado). Cada llamada autenticada registra el heartbeat **`vigia-externo`**; si cron-job.org deja de llamar, esa fila envejece y el **watchdog Telegram interno** la reporta a las 26h como cualquier cron caído (cron-job.org llama cada hora: 26h sin una sola llamada es inequívoco). Los dos se cubren: **crons de Vercel caídos → el vigía externo ve 503 → correo a Daniel; vigía externo caído → heartbeat stale → Telegram a Daniel.**
> - **`HEARTBEATS_EXTERNOS` es la tercera lista del registro**, y es lo CONTRARIO de `HEARTBEATS_NO_CRON`: no está en vercel.json (lo dispara un tercero desde afuera) pero **SÍ se vigila**. Por eso queda excluida de la biyección de `cron-registro.test.ts` — con un test propio que verifica que ninguno se cuele como cron programado y que `esCronRetirado`/`esHeartbeatNoVigilable` no lo descarten (era el error que lo habría dejado sin vigilancia). Candado: `src/__tests__/lib/vigia-externo.test.ts` (32 casos: auth correcta→200, sin token/token malo/env ausente→401 y nunca 503, un cron roto→200 con el hallazgo en el cuerpo, ≥5→503, watchdog interno caído→503, lectura fallida→503, y el heartbeat mutuo en las dos direcciones).
> - ✅ **El slot de las 06:30 dejó de morirse: `confecciones_boston` salió del estadocuenta POR CRON** (`EMPRESAS_ESTADOCUENTA_FUERA_DE_CRON` en `switch-api/empresas.ts`, consumida por `empresasConEstadoCuentaEnCron()` en el route de switch-sync **y** en los pares de la reconciliación — eran los dos lugares que lo intentaban, 4 corridas muertas por día). Ahora `all-0630` solo hace american_classic (facturas+costo, segundos) y registra su heartbeat.
>   - **Por qué una lista aparte y NO `estadoCuenta: false`:** la capability dice "traemos sus saldos" y eso sigue siendo cierto — la pestaña de Boston lee las 1.067 filas ya cargadas, y el sync **manual** sigue aceptando la empresa (`universe` en el route no se tocó). Apagar la bandera desharía lo que aprobó el #347. La lista dice algo más chico y más honesto: *por cron, todavía no*.
>   - 🔴 **PENDIENTE, tarea aparte con aprobación — sus saldos siguen congelados desde el 28-jul 04:36.** Su universo real son **459 clientes con saldo abierto** (+326 con factura desde el 1-may), no 4.912 → consultar solo esos entra cómodo (~300 s). ⚠️ **El reconcile pone `saldo = 0` a TODA la empresa** por `synced_at < runStamp`, así que restringir el bucle exige excluir del reconcile a los clientes no consultados (mismo mecanismo que `failedClienteIds`); hacerlo mal pone en cero saldos buenos. **Partirlo en 8 tandas es PEOR: cada tanda zerearía lo que cargó la anterior.** Es ruta del DINERO + define qué clientes se refrescan (lógica de negocio) → no se toca sin decisión explícita.
>   - ⚠️ **SUPERADO el 24-ago-2026: la regla 1 SÍ vigila la cartera de Boston.** Acá decía que mientras estuviera en esta lista `empresasDe("cartera")` la excluía, y el motivo escrito era "su cartera hoy no se sincroniza por cron". Eso fue verdad **cuatro días**: el 30-jul nació `/api/cron/boston-cartera`. **La lista siguió siendo correcta para lo suyo** —dice "el estadocuenta POR API no corre por cron para esta empresa", y eso no cambió—, pero la alerta la estaba leyendo como si dijera otra cosa. Precio: del 20 al 24 de agosto la cartera de Boston estuvo congelada y **la regla 1 no sonó ni una vez**. Hoy el universo se DERIVA de `empresasConEstadoCuenta()` (las 6 + Boston) y esta lista ya no lo gobierna. Ver el bloque *«LA CARTERA DE BOSTON SE CONGELÓ»*.
>
> **Regla de espaciado (sesión única de Switch: un token por USUARIO, y un usuario por empresa):** crons que tocan la MISMA empresa en Switch van **≥15 min** separados (`SEPARACION_MINIMA_MIN` en cron-telemetry.ts; era 50 y bajó el 26-jul-2026 con las duraciones medidas bajo Pro: facturas 4-8 s/empresa, costo 1-2 s, y el route cierra sesiones con `/cierresesion` en su `finally`). Crons de empresas disjuntas pueden ir a la misma hora (patrón 05:30/05:35/05:40, y ventas ACS 17:00 junto a tommy-catalogo 17:00). **`src/__tests__/lib/cron-calendario.test.ts` recorre los 453 pares de `SWITCH_CRON_ENTRADAS` que comparten empresa y falla si alguien mete un choque** — es la red que protege el calendario a futuro.
>
> Ojo con los crons LARGOS, donde el margen real es menor que la distancia inicio-contra-inicio que mide el test: `estadocuenta` ~152 s/empresa (máx), catálogos —medidos el 12-ago-2026, tras el paralelismo del #540— **26 s (joybees) / 49 s (reebok) / 70 s (calvin) / 156 s (tommy)**, y la reconciliación hasta 740 s. Esas parejas se dejaron a ≥50 min a propósito. La más ajustada que queda es `acs-fidelizacion` 16:30 → ventas ACS 17:00 (30 min, y la de 16:30 es no-op si la de 11:30 salió bien). ✅ **El par de 20 min de `tommy-catalogo` 17:40 → reconciliación 18:00 DEJÓ DE EXISTIR** el 13-ago-2026: hoy son 60 min.
>

---

> ## 🔴 LOS 4 CATÁLOGOS CORREN DENTRO DE LA VENTANA DE USO — 4 pases entre las 9:30 a.m. y las 5:10 p.m. de Panamá (13-ago-2026)
>
> Daniel, textual: ***"se usa catalogo mas de 10am a 6pm aproximadamente"***. Con ese dato, el pase de las 6-7 a.m. **no le servía a nadie**: quien abría el catálogo a las 10 lo veía con 4 horas encima. **No son 4 pases nuevos: son los que había, REUBICADOS, más uno.**
>
> | Catálogo | Empresa | Panamá (UTC−5 fijo) | UTC | Duración |
> |---|---|---|---|---|
> | tommy | fashion_shoes | 9:30a · 12:00p · 2:40p · 4:55p | 14:30 · 17:00 · 19:40 · 21:55 | 156 s |
> | calvin | vistana | 9:35a · 12:05p · 2:45p · 5:00p | 14:35 · 17:05 · 19:45 · 22:00 | 70 s |
> | reebok | active_shoes | 9:40a · 12:10p · 2:50p · 5:05p | 14:40 · 17:10 · 19:50 · 22:05 | 49 s |
> | joybees | joystep | 9:45a · 12:15p · 2:55p · 5:10p | 14:45 · 17:15 · 19:55 · 22:10 | 26 s |
>
> - **Los minutos NO son decorativos.** Las únicas bandas libres con ≥15 min (`SEPARACION_MINIMA_MIN`) contra TODO cron que toque la misma empresa son **14:15-14:45 · 16:15-17:45 · 19:30-20:55 · 21:35-22:45** (los bordes los ponen: reconciliación 14:00/18:00, ventas 15:00/19:00/23:00, recibos 15:15/19:15 y estadocuenta 16:0x/21:1x). Los cuatro pases caen adentro con margen.
> - 🔴 **La banda de la mañana arranca a las 14:30 y no a las 14:15**, que la regla de los 15 min permitiría: la reconciliación de las 14:00 puede correr **740 s** y terminar 14:12. A las 14:15 quedarían 3 minutos de aire REAL contra un cron que abre la sesión de cualquier empresa; a las 14:30 son 18.
> - **El orden dentro de cada banda es por DURACIÓN, el más largo primero** (tommy → calvin → reebok → joybees). Los 5 min entre uno y otro **no los pide el test** —son cuatro empresas disjuntas— sino la base en compute Micro: es el mismo patrón de 05:30/05:35/05:40. Y por eso joybees va último: es el único que queda a los 15 min justos de las ventas de las 15:00, y dura 26 s (termina 14:45:26).
> - ⚠️ **LOS CICLOS DE RECUPERACIÓN CAMBIARON, y hay una pérdida que se dice de frente.** `COLATERAL_RECOVER_AFTER_HOUR_UTC` de los 4 subió de 12-13 a **15**, así que **la única pasada de `switch-reconciliacion` que los recupera es la de las 18:00** (el primer slot del día, 14:3x, cae DESPUÉS de la pasada de las 14:00). Consecuencia: **los pases de las 19:4x y 21:5x/22:1x NO se recuperan el mismo día si fallan.** Con 4 pases pesa menos —si falla el de las 19:40, el de las 21:55 lo tapa; si falla ése, el de las 14:30 de mañana—, pero es real. Por qué 15 y no 14: a las 14:00 el último success posible es el de ayer 21:5x, o sea 16h05 contra un ciclo de 16h35 — 30 min de margen, y cualquier recorte futuro del ciclo re-sincronizaría los CUATRO catálogos todos los días (el incidente del 25-jul-2026 exacto).
> - 🔴 **El hueco NOCTURNO pasa de ~19h a 16h35** (5:10 p.m. → 9:30 a.m. del día siguiente) **y NO despierta ninguna alerta, medido**: el umbral de heartbeat es `CRON_STALE_HOURS_DEFAULT` = 26 h (9h25 de margen, contra 7h de antes) y ningún catálogo tiene override propio; y la regla de "dato viejo" de 24 h (`datos-frescos.ts`) vigila **solo cartera y ventas**, nunca catálogos. Los dos hechos tienen candado.
> - **Costo:** +8 corridas/día (2 por catálogo) = **~600 s de función** y 8 sesiones más de Switch, serial y cerradas con `/cierresesion`. Los syncs de catálogo son UPSERT de lo que cambió, no reescritura: decenas de filas en una tarde normal.
> - **Candados:** `cron-calendario.test.ts` (la separación, sobre todos los pares), `cron-registro.test.ts` (la biyección con vercel.json) y `catalogo-ciclo-recovery.test.ts`, que suma **el invariante de las dos cotas del ciclo derivado del horario** (no de números sueltos), que **ningún pase quede fuera de la ventana de uso**, que solo la pasada de las 18:00 sea elegible, y que el hueco nocturno no dispare ni el heartbeat ni la regla de las 24 h. Verificado por mutación: bajar la hora mínima a 14 rompe 2, devolver un pase a las 6:30 a.m. rompe 5.
>
> **Frescura del dato con el calendario del 26-jul-2026** (hueco más largo entre dos refrescos consecutivos):
>
> | Dato | Antes | Ahora | En horario laboral (10:00-18:00 Panamá) |
> |---|---|---|---|
> | Ventas B2B | 24h (solo el bloque `all` de madrugada) | **7h30** (23:00 → 06:30 de confecciones_boston, de noche; vistana 6h30) | **4h** |
> | Ventas ACS | 8h30 | **6h15** (00:15 → 06:30, de madrugada) | **2h** |
> | Pagos (recibos) | 12h20 | **8h35** (23:15 → 07:50) | 4h |
> | Saldos CXC (estadocuenta) | sin cambio | 10h40 (vistana 05:30 → 16:10) | 5h |
>
> Los saldos de CXC NO se tocaron a propósito (paso 2, pendiente): cuestan ~101-152 s por empresa contra 4-8 s de las ventas, y son los que el 25-jul reventaron la base con `canceling statement due to statement timeout`.


---

## Notas de «Alertas a Telegram — DOS canales (27-jul-2026)»

> **Los dos chats YA ESTÁN SEPARADOS (27-jul-2026), y la separación la da el BOT, no el chat.** Daniel creó `@fashiongr_sistema_bot` ("FashionGR Sistema") y lo usa en un chat **privado** con él. Ese bot nuevo lleva el **NEGOCIO**; las alertas de **SISTEMA** se quedan en el bot de siempre (`@fashiongr_alertas_bot`) sin tocar nada. **Sí: el bot que se llama "sistema" lleva negocio.** Lo decidió Daniel, el nombre se cambia desde Telegram cuando quiera, y **el ruteo no se invierte para que haga juego con el nombre.**
>
> **Por qué el diseño del #321 (una sola env var de chat) no alcanzaba — medido:** `TELEGRAM_CHAT_ID` ya vale **`1367251585`, el MISMO número del chat nuevo**. En un chat privado el `chat_id` es el id del **usuario**, idéntico para todos los bots, así que apuntar el otro canal a ese número habría sido un **no-op perfecto**. Y al revés tampoco: Telegram solo deja escribir al bot al que el usuario le habló primero, o sea que el bot A mandando al privado del bot B recibe **403**. Por eso el destino es el PAR `(token, chat)` — tipo `DestinoTelegram` en `src/lib/telegram.ts`.
>
> **El override es SIMÉTRICO — ninguno de los dos canales es el caso especial:**
>
> | Env vars (por canal, `_NEGOCIO` o `_SISTEMA`) | A dónde va ese canal |
> |---|---|
> | `TELEGRAM_BOT_TOKEN_<canal>` + `TELEGRAM_CHAT_ID_<canal>` | bot propio, chat propio ← **negocio está así hoy** |
> | solo `TELEGRAM_CHAT_ID_<canal>` | el bot de siempre en otro chat/grupo |
> | solo `TELEGRAM_BOT_TOKEN_<canal>` | se **ignora** con warning — un bot sin chat no tiene a dónde escribir |
> | ninguna | el canal de siempre ← **sistema está así hoy** |
>
> Concretamente, en Vercel hay **dos** variables nuevas: `TELEGRAM_BOT_TOKEN_NEGOCIO` (token de `@fashiongr_sistema_bot`) y `TELEGRAM_CHAT_ID_NEGOCIO` = `1367251585`. `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` no se tocan: son el canal de sistema **y** la red de rescate. Las `_SISTEMA` existen y funcionan, pero hoy van vacías.
>
> **FAIL-SAFE en dos capas.** Pesa más que antes: con el negocio en el bot nuevo, un olvido de configuración ya no silenciaría avisos técnicos sino justo lo que Daniel dijo que más le importa. (1) El resolvedor nunca arma un destino a medias — nada de mandar el chat de siempre con el bot nuevo, que sería 403 seguro. (2) Si el envío al canal aparte **falla** (token mal copiado, bot bloqueado, chat equivocado), `sendTelegramAlert` lo **reintenta una vez en el canal de siempre**; el prefijo `🔧 SISTEMA · ` viaja intacto para que se reconozca si cae ahí. El reintento solo ocurre cuando el destino elegido difiere del de siempre → sin duplicados ni bucles. Probado contra la API real de Telegram: con un token de override inválido el POST sale a `/bot<token-nuevo>/sendMessage`, Telegram responde **401**, y el mensaje **llega igual** al chat de siempre.
>
> **`enviarNegocio` sigue sin perilla:** el override es de **destino**, nunca de **si se manda**. Su cuerpo es una sola sentencia sin `if`, sin `return false/true` y sin `process.env`; el test lo verifica por aridad **y** leyendo el cuerpo de la función.
>
> Para ver a qué bot/chat va cada canal **sin mandar nada**: `npx tsx scripts/_probe-canales-telegram.ts` (con `--enviar` manda exactamente 1 mensaje a cada uno) — eso es local, contra `.env.local`.
>
> **Contra PRODUCCIÓN, sin spamear: `GET /api/diag/canales-telegram`** (Bearer `CRON_SECRET`, o abierto en el navegador con sesión de admin). Dice, por canal, si tiene destino propio o cae en el de siempre, el `bot_id` y el **username real** que devuelve `getMe`, y el veredicto `bots_distintos` — que es LO que hay que verificar: negocio y sistema no pueden salir por el mismo bot. Read-only: lo único que sale a la red es `getMe` (un GET), no hay `sendMessage` en ningún camino. **Por qué hacía falta y no alcanzaba con mandar un mensaje de prueba:** por el fail-safe, un mensaje que LLEGA no prueba nada — pudo haber llegado por el reintento en el canal de siempre. **El token nunca sale entero** (bot_id + últimos 4 + largo; `sinToken()` barre el secreto de los mensajes de error), y `dynamic = "force-dynamic"` para que lea `process.env` en cada request y no quede horneado del build — si no, una variable cargada en Vercel DESPUÉS del deploy se vería como ausente. Auth **fail-closed**: sin `CRON_SECRET` configurado responde 503, nunca abierto (la ruta vive bajo el prefijo público `/api/diag/` del middleware, igual que `/api/health-crons`: la puerta es el propio route). Candado: `src/__tests__/lib/diagnostico-canales-telegram.test.ts` (21 casos, incluido que el token no aparezca en el JSON y que ningún fetch vaya a `sendMessage`).

---

> ## 🔔 SOLO 3 ALERTAS DE SISTEMA — todo lo demás se calla (30-jul-2026, aprobado por Daniel)
>
> Daniel fijó la lista cerrada. **Si un aviso no entra en una de estas 3 categorías, no se manda.**
>
> | # | Alerta | Regla exacta | Dónde vive |
> |---|---|---|---|
> | 1 | **"Un dato que mirás está viejo"** | la **cartera** o las **ventas** llevan **+24 h** sin actualizarse | `src/lib/datos-frescos.ts` → `checkDatosViejos()` en switch-reconciliacion |
> | 2 | **"Algo se rompió y no se arregló solo"** | **2 fallos seguidos** del mismo par `(empresa, sync_type)` | `alert-policy.ts` (PR #345) — **se reusa, NO se duplica** |
> | 3 | **"La base está en problemas de verdad"** | **+80 % de memoria usada** (= <20 % disponible) | `db-recursos.ts` |
> | 4 | **"El reloj de asistencia tiene un hueco que ya no entra solo"** | lo último traído del reloj quedó **más viejo que los 15 días** que el agente recupera solo (`VENTANA_RECUPERACION_DIAS`); UN aviso por episodio (candado `hueco_alertado_en`) + "ya se arregló" al cerrarse | `asistencia/agente.ts` → chequeo 2 del vigía `asistencia-vigia` |
>
> **La 4ª la pidió Daniel explícitamente el 12-ago-2026** — textual: *"ok lo corro pero si pasa mas de 15 dias que me llegue notificacion a telegram alertas para saber q hay q arreglarlo"*. La lista sigue siendo CERRADA: se sumó esta porque él la aprobó, no porque la política se haya aflojado. El umbral se DERIVA de la constante del agente (`DIAS_RECUPERACION_AGENTE` espejo de `VENTANA_RECUPERACION_DIAS_DEFAULT`, candado en `asistencia-vigia-hueco.test.ts`); DDL aditiva `20260812130000_asistencia_hueco_alertado.sql` (la corre Daniel a mano; sin ella el vigía degrada limpio y no avisa).
>
> **Las 24 h son de Daniel** (mi propuesta eran 12). Es más estricto que las 26 h del indicador `SyncStatus` de la app, y a propósito: esas 26 h se dimensionaron cuando los syncs corrían 1×/día bajo Hobby; hoy las ventas van 8×/día y la cartera 6-7×/día. Entre 24 h y 26 h hay una ventana donde la alerta suena y la pantalla todavía dice "al día" — se prefiere el aviso antes que después.
>
> **QUÉ SE ELIMINÓ, y por qué cada uno:**
> - ⛔ **El watchdog de heartbeats de cron ya NO manda Telegram.** Era `"Una tarea automática lleva más de un día sin completarse. Detalle: switch-sync:all-0630"`. Medía el MECANISMO, no el resultado, y erraba en las dos direcciones: mandó ese mensaje el **27, 28 y 29 de julio** mientras las ventas de american_classic de ese mismísimo run entraban bien (06:31:23); y al revés, un sync que corre y no trae nada deja el heartbeat fresco y el dato viejo pasa inadvertido. `checkStaleCrons()` **sigue calculando** (entra en el JSON de la respuesta y en los logs, y health-crons lo sigue publicando en `stale[]`) — lo único que se quitó es el `enviarSistema`. **El fantasma de `all-0630` y cualquier heartbeat huérfano dejan de avisar por construcción**, sin necesidad de una lista de excepciones.
> - ⛔ **El swap dejó de alertar del todo.** Era el `🟡 Memoria de emergencia en uso: 42%` que llegó **3 veces** (28, 29 y 30-jul) con la base sana. Subir el umbral a 70/85 no alcanzaba: el swap usado es una **marca de marea pegajosa** (13,5 % → 40,3 % en 3 días sin incidentes), así que cualquier umbral sobre él acaba sonando para siempre. Se sigue MIDIENDO y se muestra como contexto en el bloque de estado, pero no genera hallazgos. **Costo de quitarlo: cero** — el episodio real del 26-jul tenía memoria al 4 % y carga 6×/núcleo, y se detecta igual (test `la caída del 26-jul se habría detectado antes de los 521`, ahora con hallazgos `["carga","memoria"]`).
> - ⛔ **`db-salud` bajó de 11 entradas de cron a 5** (64 → 58 crons en total). Las 11 se dimensionaron para cazar una caída corta (la del 26-jul duró 76 min), no para el umbral de recursos. Ya no hacen falta: **(a)** lo que queda vigilando la memoria es un umbral SOSTENIDO, que no se detecta mejor mirándolo 11 veces que 5; **(b)** la detección de "la base no responde" la cubre el **vigía externo, que llama cada HORA** desde afuera y devuelve 503 cuando no puede leer `cron_heartbeats` — más denso que cualquier cron nuestro y, a diferencia de db-salud, sin vivir dentro del sistema que vigila. Quedan 01:45 / 07:25 / 12:25 / 16:45 / 21:45 UTC (hueco máximo 5 h 40).
>
> **Lo que NO se tocó:** 📊 **NEGOCIO** sigue intacto y sin perillas (*"ES SUPER IMPORTANTE ESAS"*) — ventas del día, pedidos, guías, cheques por vencer, fotos faltantes, costo sospechoso. Estas 3 reglas son SOLO del canal 🔧 SISTEMA.
>
> **Candados:** `src/__tests__/lib/datos-viejos.test.ts` y `db-recursos.test.ts`.
> - ⚠️ **EL CANDADO DE BOSTON CAMBIÓ DE DIRECCIÓN el 24-ago-2026, y estaba FIJANDO EL BUG.** Exigía que **`confecciones_boston` NO pudiera entrar** en el universo de cartera. El motivo era bueno el día que se escribió (su sync moría siempre y avisar a diario de algo sin acción posible es la alerta-que-suena-para-siempre), pero **su sync se arregló cuatro días después** y el candado quedó exigiendo el silencio. Hoy exige lo contrario: que Boston SÍ se vigile, con el mismo umbral de 24 h que las demás. **La protección contra la alerta eterna no se aflojó, se INVIRTIÓ**: en vez de "esta empresa no se vigila", ahora es *toda empresa vigilada tiene que tener un cron que le refresque la cartera* — un invariante que no envejece cuando el cron se arregla.
>
> ⚠️ **Deuda que estas reglas NO cubren y sigue abierta:** `integrity-check-run.ts:67` repite el mismo crítico todos los días sin dedup (el check `last_upload_age_cxc` es GLOBAL y de 7 días, así que hoy no se solapa con la regla 1, que es por empresa y de 24 h). Y `refresh_clientes_views_failed` + `refresh_clientes_vw` escriben **dos filas para el mismo evento** (medido: 23-jul 07:24, los dos con `statement timeout`) — candidato a agrupar.

**La medición que justificó todo** (30 días a 26-jul-2026, `scripts/_diag-alertas-30d.mjs` / `_diag-synclog-30d.mjs` / `_diag-huecos.mjs`, solo lectura): `switch_sync_log` tuvo **1.987 corridas, 58 errores, y los 58 se recuperaron solos en ≤24h** (88% en ≤12h). **Cero fallos sostenidos.** O sea: todas las alertas de sync del mes fueron por algo que el sistema ya estaba arreglando.

> **NO SE AVISA AL PRIMER FALLO — se avisa a partir del segundo seguido (28-jul-2026).** Pedido de Daniel, textual: *"quiero q un error de crones me avise si no paso de 2 en adelante, no cada vez porq aveces se recupera y es en vano"*. Es la condición (2) de la regla de tres, que este archivo ya tenía escrita y `alert-policy.ts` aplicaba a medias.
>
> 🩸 **Lo que la tenía a medias:** la racha (`computeStreak…`) solo cubría los errores **silenciables** (401 de sesión única, red/timeout/5xx, la página HTML de Switch). Todo lo demás —un `statement timeout`, un UPSERT fallido, un `No pude crear switch_sync_log`— caía en la rama `inmediatos` y sonaba al primer fallo. Caso medido: **27-jul 23:11 UTC** llegó *"3 sync(s) fallaron — american_classic/facturas, vistana/facturas, fashion_wear/facturas: No pude crear switch_sync_log: vacío"* (la base bajo presión de memoria; `db-salud` ya lo había avisado a las 22:45, y **esa** era la alerta correcta) y **a las 00:11 las 8 empresas corrieron bien solas**. Peor: un error de otra clase **CORTABA** la racha, así que un par alternando 401 → timeout de base → 401 se leía como tres "primeros fallos" seguidos.
>
> **La unidad de "seguidas" es el PAR `(empresa_key, sync_type)`** — la misma con la que ya medía el streak de 401 y con la que recupera la reconciliación, no una agrupación nueva. `vistana/facturas` y `joystep/facturas` son sesiones de Switch distintas sobre datos distintos: que fallen una vez cada uno no es un problema repitiéndose. Lo que despierta a Daniel es el MISMO trabajo fallando otra vez **sin un `success` en el medio** (un success sigue siendo lo único que reinicia la racha).
>
> **Los cinco desenlaces de `evaluateSwitchEscalation`** (todos con su motivo escrito en `cron_email_errors`, para poder auditar después por qué sonó o no):
>
> | motivo | condición | ¿avisa? |
> |---|---|---|
> | `racha` | streak ≥ 2 | **sí**, y el texto dice *"van N corridas seguidas fallando desde \<fecha\>"* |
> | `primer-fallo` | streak = 1 (la corrida anterior fue bien) | no — la siguiente decide |
> | `no-medible` | streak = 0 **con** historia del par | no — la corrida que falló no llegó a registrarse (su propio INSERT falló). **Este es el caso de las 23:11** |
> | `sin-historia` | streak = 0 **sin ninguna** fila del par | **sí** (fail-open) |
> | `lectura-fallo` | la consulta al log falló | **sí** (fail-open) |
>
> **La distinción que hace todo el trabajo: "no hay fila de ESTA corrida" ≠ "no hay NINGUNA fila del par".** Lo primero es un tropiezo puntual de nuestra telemetría y la corrida siguiente vuelve a medir; lo segundo es telemetría rota de raíz, y callarla sería callarla **para siempre**. Sin separar los dos casos había que elegir entre el ruido de las 23:11 y el silencio permanente de `american_classic/articulos` (falló el 5, 8 y 10-jul sin una sola fila previa en el log — esos 3 avisos siguen saliendo).
>
> **Única excepción que avisa al primer fallo: `LICENCIA NO SE ENCUENTRA ACTIVA`** (`alertaInmediataSiempre`). El proveedor nos cortó el servicio y ninguna corrida siguiente lo arregla. **No es una excepción nueva:** `isSwitch401` e `isSwitchTransitorio` ya la excluían a mano de todo silenciamiento; ahora esa decisión vive UNA vez y con nombre. La lista se mantiene deliberadamente corta — cada entrada nueva es un aviso que vuelve a sonar al primer chispazo. Un "faltan env vars" tampoco se arregla solo, pero es una clase abierta imposible de reconocer por texto: se avisa igual, una corrida después, como racha.
>
> **El fallo que NUNCA vuelve a correr no queda en silencio, y no hizo falta un mecanismo nuevo:** los **11 routes** que llaman a `alertSwitchCronErrors` registran el heartbeat **solo si no hubo ningún error** (`if (errors.length === 0) recordCronHeartbeat(...)`), así que un fallo callado deja el heartbeat sin refrescar y a las 26h lo levantan `cronsStaleParaAlerta` (watchdog Telegram) y health-crons. Para las entradas intradía la red llega antes: `clasificarSlots` re-ejecuta el slot desatendido en la pasada siguiente de la reconciliación y, si vuelve a fallar, eso YA es el segundo fallo del par.
>
> **`isSwitchSilenciable` sigue existiendo pero YA NO decide si se avisa** — eso lo decide la racha, para todos los errores por igual. La usan `outage-resumen.ts` y la clasificación de slots.
>
> **Medición sobre 4 semanas (29-jun → 28-jul-2026, producción):** 22 alertas llegaron a Telegram, 12 eran de sync → **se ahorran 7, siguen saliendo 5** (3 de `sin-historia`, 1 racha real de 2-3 corridas del 19-jul, 1 LICENCIA). De las 7 calladas, **ninguna quedó rota**: los 12 pares involucrados tuvieron un `success` propio entre **1,0 y 10,1 horas** después. La única que roza "problema real" es `joystep/utilidad: faltan env vars` (27-jul 18:19) — se arregló sola en 1h18 porque alguien estaba trabajando ahí en ese momento; de no ser así, la corrida siguiente la habría avisado como racha.
>
> **El mismo defecto en otra alerta, arreglado en el mismo PR: `acs-fidelizacion`.** Tiene 2 entradas (11:30 y 16:30 UTC) con el guard no-op de `cronSuccessHoyUtc`, o sea que la segunda oportunidad ya existía — y su `catch` la ignoraba: avisaba a las 11:30 aunque a las 16:30 se arreglara. Toca Switch MULTI con sesión única, así que el 401 transitorio es su modo de fallo típico. Ahora usa `recoveryStillComingToday` (el mismo mecanismo del backup): calla si queda otra entrada por delante hoy, suena si era la última.
>
> **Revisados y NO tocados a propósito:** `grupo-resumen-mensual` y `catalogos-fotos-resumen` están en `NUNCA_SILENCIAR` porque son demasiado esporádicos para asumir auto-recuperación; `cleanup-sessions` no tiene quién lo re-ejecute; `backup` corrida estéril y `backup_r2_incompleto` ya tienen su "por qué no espera" escrito; `db-salud` mide una condición sostenida y ya deduplica por ventana; `campos-obligatorios` y el guard de costo diario ya deduplican; lo de `pedido-publico`/`switch-envio` deja un pedido sin salir y exige "Reintentar" a mano. Verificado contra producción que `catalogo_tommy` **sí** se registra en `switch_sync_log` (7 filas), o sea que Tommy no cae en `sin-historia` aunque el CHECK del repo no lo liste.
>
> **Deuda anotada, no arreglada:** el conflicto del candado (`"Ya hay una corrida de X en curso"`, `sync-log.ts`) cuenta como fallo normal de la racha. Con la regla nueva ya no suena al primer choque; si suena a la segunda es porque el candado lleva horas trabado, que es exactamente el bug del 27-jul y merece el aviso. Y `integrity-check-run.ts:67` tiene un defecto DISTINTO (repite el mismo crítico todos los días, sin dedup) — no se tocó.
>
> Candado: `src/__tests__/lib/alerta-cron-dos-fallos.test.ts` (17 casos en las dos direcciones, con el caso real del 27-jul completo). Verificado por mutación: devolver el fail-open de `streak===0` rompe 2 tests, quitar la excepción LICENCIA rompe 1, bajar el umbral a 1 rompe 5.

**Qué se calló, con su prueba:**
- **La página de excepción de Switch es una CAÍDA, no una emergencia.** `client.ts:295` arma `"Auth respondió 200 pero sin token: <!DOCTYPE html>…"` cuando Switch sirve su HTML de error en vez del token. `isSwitchTransitorio` no lo matcheaba (el código HTTP es 200) → alertaba de inmediato con 200 chars de HTML crudo. **Y el sistema ya sabía que era una caída**: `outage-resumen.ts` lo clasificaba como *"estuvo caído… sin impacto"*. Un archivo decía no-evento y el otro 🚨. Ahora el predicado vive UNA vez (`isSwitchTransitorio`) y `isSwitchCaida` delega. LICENCIA sigue excluida: envuelta en HTML tampoco se silencia.
- **Backup: un fallo con 2ª oportunidad hoy no despierta a nadie.** `cronSuccessHoyUtc` solo evita repetir TRABAJO; no retira un mensaje ya enviado. Un fallo a las 06:00 sonaba aunque 10:30 lo arreglara. Ahora `alertaDeBackupEsperaSegundaOportunidad` (reusa `recoveryStillComingToday` + `EXTRA_ENTRY_HOURS_UTC`) difiere el aviso; **la ÚLTIMA entrada del día SIEMPRE suena** (`backup-switch` 23:30 no tiene red detrás). Dos excepciones que suenan siempre: la **corrida estéril** (0 datasets — pone el índice del día en riesgo) y `backup_r2_incompleto` (mira AYER, día cerrado, sin oportunidades por delante). El fallo se sigue persistiendo con `telegram:false` → el rastro no se pierde.
- **`ℹ️ Switch estuvo caído… sin impacto` ya no se manda.** Se declara a sí mismo un no-evento: falla las tres condiciones. La fila queda en `cron_email_errors` (de ahí salió la evidencia de esta auditoría).
- **HTML/XML del proveedor nunca llega al celular.** `shortError` detecta `<!DOCTYPE`/`<html`/`<?xml`/`<Error>`, conserva el prefijo humano y reemplaza la sopa por *"el proveedor devolvió una página de error en vez de datos"*.

**Huecos cerrados (lo que estaba roto y NO avisaba):**
- **`sync-proveedores` fallaba en SILENCIO ABSOLUTO** — sin `alertSwitchCronErrors` y sin `logCronError`; lo único era la ausencia de heartbeat. Era el único sync de Switch así. Ahora pasa por la misma política anti-ruido (sí escribe `switch_sync_log` con `sync_type='proveedores'`, así que el streak funciona y un corte de red se calla igual que en el resto).
- **`db-salud` invisible para health-crons** — lo cerró el #320 (quedó en `SEED_TOLERANT_CRONS`).
- ⚠️ **PENDIENTE — el rastro se pierde cuando la base es lo que falla.** `logCronError` escribe en `cron_email_errors` ANTES de mandar el Telegram: el aviso sale igual (el insert está en try/catch), pero **la fila no queda**. Medido: **38 de 58 errores** de los últimos 30 días no dejaron rastro, incluido el `statement timeout` de `fashion_shoes/estadocuenta` del 25-jul 16:20 que dejó los saldos de CXC viejos ~5h. No se puede auditar desde la base si Daniel recibió o no ese mensaje. `db-salud` (27-jul) cubre la DETECCIÓN de la caída por un camino que no toca Postgres; **falta un rastro de alertas que sobreviva a la base caída**.

**Redacción** — `describirCronParaDaniel(tipo)` (cron-telemetry) traduce el `tipo` interno a una frase de negocio, y `consecuenciaDeSyncType(syncType)` (alert-policy) dice qué se ve viejo en la app. Un tipo no listado cae en un texto genérico honesto en vez de vomitar el identificador. Candado: `src/__tests__/lib/alertas-canal.test.ts` — 32 casos en las DOS direcciones (el ruido se calla **y** LICENCIA / statement timeout / errores de negocio siguen sonando), más el ruteo bot-por-bot, los 6 casos del fail-safe y el candado de que negocio no gane una perilla de silenciar.

**Para revisar redacción sin spamear el chat real:** `npx tsx scripts/_dryrun-alertas.ts` (no manda nada).


---

## 🔴 LOS EXCELS DE TODO EL SISTEMA: los encabezados ABREN el archivo (27-ago-2026)

> Daniel bajó `ventas-referencia-2026-08-27.xlsx` y fue textual: *"la tercera fila esta como escondido, no me deja filtrar desde los nombres importantes, y mucha informacion inecesaria… si asi se ve el modulo, asi mismo se debe de descargar y sin tantas palabras de info, se debe de suponer como funciona el excel"*. Y su regla permanente: ***"un erp profesional no tiene explicaciones, es intuitivo como apple"***.
>
> ```
> ANTES                                   AHORA
> fila 1  ▓ FASHION GROUP — Guías ▓        fila 1  Encabezados  ← con FILTRO y FIJOS
> fila 2  ▓ Todas las guías ▓              fila 2  los datos
> fila 3  ▓▓▓▓  ← 4 puntos de alto
> fila 4  Encabezados                      (sin filtro · sin panel fijo)
> ```
>
> **`buildReportSheet` (`src/lib/excel-export.ts`) lo arma así para los 24 exports del sistema**, y de una vez ganan lo que no tenían: **`!autofilter` desde A1** y **la fila de encabezados FIJA al bajar**. El título se fue porque **el nombre del archivo ya lo dice** (`ventas-referencia-2026-08-27.xlsx`, `historial_prestamos_fashion_wear_20260827.xlsx`, `CajaMenuda-Periodo7-…`, `productos-fashion_wear-12m-2026.xlsx`).
>
> ### ⚠️ `xlsx-js-style` SABE ESCRIBIR EL FILTRO, PERO NO EL PANEL FIJO
>
> Verificado escribiendo un libro con `ws["!freeze"]` y `ws["!panes"]` puestos y leyendo el XML que salió: `<sheetViews><sheetView workbookViewId="0"/>`, **sin un solo `<pane>`**. El filtro sí lo escribe (`<autoFilter ref>` + el `_xlnm._FilterDatabase` que Excel espera).
>
> 🔑 **El panel fijo se inyecta en el ZIP, con el MISMO truco que `depurador/fotos-xlsx.ts` usa para las fotos** (`src/lib/excel-panel-fijo.ts`): el libro lo sigue armando `xlsx-js-style` igual que siempre y después se le agrega al `xl/worksheets/sheetN.xml` la parte que le falta.
> - **La diferencia con `fotos-xlsx.ts` es que ESTE camino es SÍNCRONO**, y tiene que serlo: `downloadWorkbook()` se llama desde botones y `workbookBuffer()` desde rutas que devuelven el Buffer de una — volverlas asíncronas por un `<pane/>` habría tocado los 24 exports. **Se puede porque SheetJS escribe el .xlsx SIN comprimir** (todas las entradas con método 0 STORED, verificado recorriendo los local headers): sin compresión, reescribir el ZIP es copiar bytes y recalcular un CRC32, sin deflate ni JSZip.
> - 🔴 **SI ALGO NO CALZA, SALE EL ARCHIVO ORIGINAL.** Un Excel sin la fila fija es una molestia; uno corrupto no se abre. Entradas comprimidas, ZIP64 o un `<sheetView>` que no aparece ⇒ los bytes salen tal cual.
> - 🔑 **Qué hoja se congela lo decide un marcador de CONDUCTA, no un índice**: solo las que YA tienen filtro desde A1, o sea exactamente las de `buildReportSheet`. Las de layout propio (las fichas de Reclamos, el detalle de Comisiones, la plantilla «DASHBOARD DE BUSQUEDA» del banco B2B) **no llevan filtro ni panel, y está bien**: ahí la fila 1 no son encabezados.
> - **TODO export sale por `workbookBytes` / `workbookBuffer` / `workbookBlob`.** Escribir con `XLSX.write` a secas deja el archivo sin panel, y eso no se ve hasta que alguien baja por la hoja.
>
> ### 🔴 UN SOLO PÁRRAFO SE QUEDA, y es orden explícita de Daniel («dejalo»)
>
> El de la planilla bajada por un rango que **no** es quincena: *«NO es una quincena: sueldo base al 43,8 % y SIN los montos escritos a mano»*. **No explica cómo funciona el Excel: avisa que ese archivo no sirve para pagar.** Vive en `avisoRangoLibre()` (`asistencia/planilla-exportar.ts`) y viaja como la opción **`nota`** de `buildReportSheet`: una línea al PIE, **fuera del rango del filtro** para que filtrar no la esconda, en gris itálico y sin merge. Va en las hojas **Planilla** y **Horas**; la de «Cómo se calcula» ya lo dice entero en su fila «Período».
> - **El PDF NO se tocó**: `subtitulo()` sigue armando su encabezado con la empresa y el aviso, byte por byte igual.
> - ⚠️ **La EMPRESA salió del aviso** (la dice el nombre del archivo). Lo que queda es lo único que Daniel mandó conservar.
> - 🔑 **`nota` es la EXCEPCIÓN, no la puerta de atrás**: hay candado que exige que el ÚNICO export que la use sea la planilla.
>
> ### Los demás subtítulos se fueron, y ninguno era el único lugar del dato
>
> | Dónde vivía | Adónde se fue |
> |---|---|
> | Guías «Todas las guías» · Proveedores «Todo el grupo» | el filtro ya se ve en pantalla; el archivo lo baja quien lo filtró |
> | Cheques «Vencen hoy» | ya es el NOMBRE DE LA HOJA |
> | Préstamos «Historial — Fashion Wear» | el nombre del archivo (`historial_prestamos_fashion_wear_…`) |
> | Caja «Período N° 7 · Responsable · Fondo inicial» | el N° está en el archivo y el fondo, en el bloque de saldo que ya se dibujaba debajo |
> | Comisiones «Junio 2026 · la regla» | la regla es el banner del tab; el período, el archivo |
> | Ventas «Data actualizada al…» · Utilidad/Productos con sus totales | los totales están en la fila TOTAL; el período, en el archivo |
> | Catálogos «N productos sin foto · fecha» | el conteo es la cantidad de filas |
> | Reclamos «Reclamos a Proveedor — Fashion Wear» | el nombre del archivo |
> | Referencia (~900 caracteres de manual de uso) | **se fue entero** |
>
> 🔴 **LO ÚNICO QUE SE PERDIÓ DE VERDAD, y es decisión de Daniel si vuelve:** la leyenda de la hoja **Referencia** que decía que `Compré` y `Vendí` son **de la ÚLTIMA LLEGADA** y que `Stock` es **SIEMPRE la existencia total**. Los NÚMEROS no cambiaron y su candado los sigue vigilando, pero el encabezado «Compré» ya no lleva su aclaración al lado. Si la quiere de vuelta, entra como `nota` al pie en una línea.
>
> ### Lo que NO cambió
>
> **Ni un dato, ni una columna, ni una fila, ni un valor** — solo dónde empiezan. Sigue igual: la paleta por marca (`paletaDeMarca`), la zebra, la banda PRI de los totales, la moneda como NÚMERO real con `numFmt`, `MONEY_FMT_GUION`, las fechas dd/mm/yyyy, los anchos `!cols`, los hipervínculos de Reclamos, el Excel de Pedidos con sus dos números y sus columnas AL FINAL, y el layout propio de las fichas (`makeCellStyles`).
>
> ### Verificación — el archivo se abre, con TRES lectores
>
> `npx tsx scripts/_verif-excel-panel-fijo.ts` escribe **11 .xlsx REALES** con los builders de verdad (caja, préstamos, pedidos ×4 marcas, sin foto, proveedores, cheques, guías, planilla) y los relee con **`xlsx-js-style`** y con **el XML CRUDO del zip vía `jszip`**; `python3 scripts/_verif-excel-panel-fijo-openpyxl.py <carpeta>` los abre con **`openpyxl`** — otro programa, otro lenguaje, el mismo con el que se leyó el Excel real de la contadora. Medido: **15/15 OK en los dos**, `freeze_panes A2` y `auto_filter A1:…` en las 13 hojas de reporte, la de layout propio sin ninguno de los dos, y el aviso de la planilla en la fila 7 con el filtro terminando en la 3.
> - ⚠️ **NO se pudo abrir en Excel de escritorio, y se dice de frente.** Excel está instalado y responde a AppleScript, pero **no abre NINGÚN documento en esta sesión** —ni por AppleScript ni por LaunchServices— y las pantallas no se pueden ver (sin permiso de grabación). Lo que sí está probado: `unzip -t` (Info-ZIP, una CUARTA implementación de zip) da OK, el CRC32 se verifica con `checkCRC32`, y el `<pane>` es la forma verbatim del estándar OOXML **dentro** de un `<sheetView>` que se abre — que es de donde openpyxl deduce su `freeze_panes`, igual que Excel.
> - **El re-empaquetado es FIEL, probado por diferencia**: escribiendo el MISMO libro con y sin el patcher, **9 de 10 entradas salen byte por byte iguales y en el mismo orden**; la única que cambia es `xl/worksheets/sheet1.xml`.
>
> ### Candados
>
> **`src/__tests__/lib/excel-encabezados-fila-1.test.ts` (24).** Escribe el .xlsx y lo vuelve a abrir con los dos lectores — mirar el objeto EN MEMORIA no prueba nada acá, porque el `<pane>` lo pone justo el re-empaquetado. Prueba además que la librería sola NO escribe paneles (si algún día aprendiera, ese caso se cae y el patcher se puede retirar), que una hoja sin encabezados no se congela, que los CRC quedan bien (`checkCRC32`: ni jszip ni SheetJS lo verifican al leer, así que un CRC viejo pasa los dos lectores y revienta recién en Excel), y **la planilla REAL de un rango libre por CONDUCTA**.
> - 🩸 **El candado de la planilla NO puede ser un barrido de texto, y se midió por qué**: `nota: avisoRangoLibre(d)` aparece en DOS hojas (quitarla de una lo seguía cumpliendo), la frase «NO es una quincena» también vive en la fila «Período» de «Cómo se calcula» (vaciar el aviso tampoco lo rompía), y un `if (false)` que lo hiciera salir SIEMPRE es invisible para cualquier grep. Los pocos barridos que quedan **borran los comentarios primero** — este repo ya pagó CUATRO veces el candado que se cumple con su propia explicación, y estos archivos citan `title` y `subtitle` para contar que se fueron.
> - **Verificado por mutación, 18 de 18 cazadas y 0 sobrevivientes** (`bash scripts/_mutar-candados-excel-fila-1.sh`): vuelve la banda de título · vuelve la franja de 4 puntos · el filtro desaparece · el filtro arranca en la fila 2 · el filtro se traga los totales · la nota no se dibuja · la nota cae DENTRO del filtro · el panel no se escribe · se congela la fila 2 · **el `<pane>` queda FUERA de `<sheetView>`** · se congela cualquier hoja · el tamaño de la entrada no se actualiza · el CRC no se recalcula · `workbookBytes` deja de congelar · la planilla pierde su aviso · el aviso sale también en una quincena · el aviso deja de decir que no es una quincena · deja de decir que faltan los montos a mano.
> - 🩸 **La primera corrida dio 12/18 y las 6 sobrevivientes eran huecos REALES**, no falsos positivos: el `[^>]*` de un regex se tragaba la barra del auto-cierre (así que un `<pane>` colgando afuera pasaba), nadie verificaba el CRC ni el tamaño de las entradas, y las tres de la planilla se cumplían con texto que vive en otro lado del mismo archivo. **Un verificador que da 12/18 y se publica igual es peor que no correrlo.**
> - 🩸 **El script restaura por COPIA, no con `git checkout`** (hay archivos NUEVOS y git aborta el comando entero), **denuncia el patrón que no muta** en vez de cantarlo como «sobrevivió», **exige que vitest haya colectado tests** antes de creerle a un cero, **el reemplazo es LITERAL por argv y lo hace `python3`** (con `perl -0pi -e 's|…|…|'` un `||` del código real se des-escapa en una alternación con rama vacía y se come el archivo), y trae una **mutación de CONTROL que a propósito no matchea**: si no sale ⛔, el denunciador está roto y todos los ✅ valen lo mismo que un barrido con el comentario adentro.
