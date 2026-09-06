# Gastos — el mapa

> Módulo `gastos-contabilidad` · `/gastos-contabilidad` · dos pestañas: **Gastos** y **Saldos de banco**.
> Medido contra producción el **5-sep-2026** (solo lectura). Cada número de aquí se remidió; lo que no cuadra con `CLAUDE.md` va con 🩸.
> Los px del navegador **no se midieron** en esta pasada (no se abrió la pantalla): lo que digo de la pantalla sale de leer el código que la dibuja, y lo digo así donde importa.

---

## 1 · Qué es, quién entra, cuánto se usa

**Qué es.** Lo que salió de caja y del banco de cada empresa, mes por mes, con el detalle por cuenta contable. Segunda pestaña: el saldo de banco que teclea contabilidad.

**Quién entra.** Dos roles y nada más.

| Rol | ¿Ve el módulo? | Medido en `role_permissions` |
|---|---|---|
| admin | sí (`modules.ts:189`) | la key **no** está en su lista guardada; entra porque admin pasa siempre |
| contabilidad | sí | `["asistencia","prestamos","proveedores","gastos-contabilidad","comisiones"]` |
| secretaria · bodega · vendedor · gerente_acs · gerente_boston | **no** | — |

Personas reales: **3** (daniel, alberto, Contabilidad).

🩸 `CLAUDE.md` dice que contabilidad tiene **`ventas`**. En producción **no lo tiene**: su lista son esos 5 y `ventas` no está. También desaparecieron `gastos-empresa` y `saldos-banco` — o sea que la migración `20260813140000` **sí corrió**, y la doc dice que quedó a medias.

**Cuánto se usa — de verdad.**

| Señal | Medido |
|---|---|
| Logins de contabilidad | 15 (abr) · 15 (may) · 19 (jun) · 18 (jul) · 29 (ago) · 6 (sep) — **102 en total**, último 2-sep |
| Escrituras del módulo en `activity_logs` | **0**. Ninguna. Ni gastos ni saldos llaman a `logActivity` — así que el cero **no prueba** que no se use; prueba que no se puede medir por ahí |
| Filas de `bancos_saldos` | **52**, y las **52 se tecleraron el 10-ago-2026 entre las 13:53 y las 17:57** (4 h 4 min). **Ni una sola desde entonces: 26 días** |
| Filas de `egresos_varios` | **709**, las trae el cron solo |
| Exports | **el módulo no tiene ninguno.** Cero Excel, cero PDF |

🩸 **La pestaña Saldos de banco se usó UNA vez, no se usa cada mes.** Siete meses de historia (ene–jul, 7 empresas) entraron en una sola tarde. La pantalla de historial y corrección se construyó **tres días después** (13-ago) y desde entonces **nadie ha vuelto a cargar ni a corregir nada**.

---

## 2 · Los datos, medidos

### `egresos_varios` — 709 renglones, todo 2026

| Empresa | Renglones | Meses | Último mes | Gasto (grupo 6) 2026 | Todo lo que salió |
|---|---:|---:|---|---:|---:|
| Vistana International | 378 | 7 | **julio** | $118,753.76 | $243,342.48 |
| Fashion Wear | 135 | 5 | **mayo** | $101,710.56 | $151,962.66 |
| Fashion Shoes | 123 | 7 | **julio** | $223,246.35 | $362,193.60 |
| Active Shoes | 47 | 7 | **julio** | $14,677.15 | $16,048.75 |
| Active Wear | 26 | 7 | **julio** | $3,850.38 | $54,387.22 |
| Joystep | **0** | — | — | — | — |
| Multifashion | **0** | — | — | — | — |
| Confecciones Boston | **0** | — | — | — | — (no se baja sola, a propósito) |

Columnas: `proveedor` está **vacía en las 709 filas (100%)** — Switch no la manda y la pantalla no la muestra. `referencia` y `sucursal`: 0% vacías. Nombre de cuenta: **100% resuelto** (54 cuentas en uso, las 54 con nombre en `cuentas_contables`).

### El avance de la contadora — dónde está parada de verdad

El cron corre **todos los días** y trae siempre lo mismo. Cuántos días lleva cada empresa sin que le entre un renglón nuevo:

| Empresa | Renglones estancados en | Días sin moverse |
|---|---:|---:|
| Vistana | 378 | **22** (desde el 13-ago) |
| Fashion Wear | 135 | **9** (saltó de 40 a 135 el 26-ago) |
| Fashion Shoes | 123 | 16 |
| Active Wear | 26 | 18 |
| Active Shoes | 47 | 17 |
| Joystep · Multifashion | 0 | 24 |

🔎 **Fashion Wear sí se movió, pero hacia atrás.** El 26-ago le entraron 95 renglones y su último mes **sigue siendo mayo**: lo que cargó fue el detalle de enero y febrero, no agosto.

### Meses flacos — empresa por empresa, contra su propia mediana

| Empresa | Mes | Gasto | % de la mediana de esa empresa | ¿La pantalla lo marca hoy? |
|---|---|---:|---:|---|
| Fashion Wear | abril | **$27.18** | **1%** | **NO** |
| Fashion Wear | mayo | $257.43 | 7% | **sí** |
| Active Wear | abril | **$5.35** | **1%** | **NO** |
| Active Wear | mayo | **$0.00** | **0%** | **NO** |
| Active Shoes | marzo | $480.35 | 19% | **NO** |
| Fashion Shoes | abril | $6,972.35 | 25% | **NO** |

🩸 **De 6 meses flacos, la pantalla marca 1.** La regla (`src/lib/egresos/al-dia.ts:alDiaDe`) mira **solo el último mes cargado**; los agujeros del medio son invisibles. Fashion Wear no está floja desde mayo: está floja **desde marzo** — enero $39,851 y febrero $57,733, luego $3,841 · $27 · $257.

🩸 **El número que hoy sale en pantalla para Fashion Wear no es el de la doc.** `CLAUDE.md` y el post-mortem dicen *«lo habitual acá es $2.482,05»*. Recalculado ahora con los 135 renglones que hay: la mediana de sus meses previos es **$21,846.31**, no $2,482.05. La frase en pantalla hoy dice *«ese mes va en $257.43 y lo habitual aquí es $21,846.31»*.

🩸 **Active Wear ya NO está marcada** y la doc dice que sí. Con los datos de hoy su julio da **239% de su mediana** → sale como «Cargado hasta julio 2026», limpio.

### `bancos_saldos` — 52 filas, ni una nueva en 26 días

| Empresa | Último saldo | Fecha del dato | Días de viejo | Cargas |
|---|---:|---|---:|---:|
| Fashion Wear | $317,460.51 | 31 jul | **37** | 7 |
| Vistana International | $132,870.42 | 31 jul | **37** | 7 |
| Multifashion | $8,661.49 | 31 jul | **37** | 7 |
| Confecciones Boston | $7,875.65 | 31 jul | **37** | 7 |
| Fashion Shoes | $74,336.02 | 10 ago | 27 | 8 |
| Active Wear | $60,678.97 | 10 ago | 27 | 8 |
| Active Shoes | $27,647.97 | 10 ago | 27 | 8 |
| **Joystep** | — | — | — | **0 · nunca tuvo saldo** |

Suma de esos 7 = **$629,531.03**, que es exactamente lo que la tarjeta «Disponibilidad» de Vista General viene mostrando. **Ese número no se mueve desde el 10-ago.**

---

## 3 · 🩸 Lo que miente o está roto

### 🩸 1 · El módulo abre en un mes que dice «no salió plata» — y es mentira

`sync-egresos-varios.ts:123-125` le pide a Switch **el año entero** (`2026-01-01 → 2026-12-31`) y guarda ese rango como cobertura. Medido: las **158 filas** de `egresos_importaciones` tienen esa misma pareja de fechas.

`reglas.ts:151` (`mesTocado`) da por «traído» cualquier mes que **toque** el rango. Como el rango es el año, **agosto, septiembre, octubre, noviembre y diciembre de 2026 cuentan como traídos** → estado `sin_movimientos` → la pantalla escribe:

> **«Este mes no salió plata de caja ni del banco.»**

Y la pantalla abre en **el mes en curso** (`GastosContabilidadClient` usa `mesActual()`), que hoy es septiembre. O sea: **hoy, al entrar a Gastos, las 7 empresas que se bajan solas dicen que no salió plata**. En agosto —un mes entero, cerrado, con gasto real— dicen lo mismo.

Es exactamente lo que el post-mortem juró impedir (*«"no salió plata" y "no sabemos" no pueden verse iguales»*), roto al revés: ahora **todo lo que no se sabe se lee como un hecho**. Y en la misma tarjeta conviven dos frases que se contradicen: *«Cargado hasta julio 2026»* arriba y *«Este mes no salió plata»* abajo.

Medido sobre los 7 meses cargados de Vistana: su gasto mediano es **$13,338.34** al mes y su salida media de caja **$34,763.21**. Decir de esa empresa que en agosto «no salió plata» es una afirmación falsa del orden de **$35 mil**, en la pantalla que abre por defecto.

### 🩸 2 · La pantalla abre siempre vacía, y llegar al dato cuesta flechas

Abre en **septiembre**. El último mes con datos es **julio** (mayo para Fashion Wear). No hay lista de meses, no hay «ir al último mes con datos»: solo dos flechas de un mes cada una (`SelectorMes.tsx`).

- Ver julio: **2 flechas**.
- Ver el último mes real de Fashion Wear (mayo): **4 flechas**.
- Ver enero, para comparar: **8 flechas**.

Y la flecha «adelante» está apagada en septiembre, así que el primer gesto útil siempre es retroceder desde una pantalla sin números.

### 🩸 3 · La contadora carga el saldo del mes pasado porque el formulario se lo pone

`SaldosBancarios.tsx:129-130`:
- el monto arranca **con el saldo que ya está guardado**,
- la fecha arranca **en HOY**.

Apretar Guardar sin tocar nada crea una carga nueva con el saldo viejo y la fecha de hoy. Eso **ya pasó, y está en la base**: el 10-ago-2026 a las **17:57:04 · 17:57:12 · 17:57:14** —tres guardados en 10 segundos— entraron Active Wear $60,678.97, Active Shoes $27,647.97 y Fashion Shoes $74,336.02, **todos idénticos al centavo a su saldo del 31-jul**, todos fechados 10-ago.

El aviso ámbar «3 saldos quedaron igualitos al anterior» existe para señalar eso. **Lleva 26 días encendido y nadie lo corrigió.** El aviso está bien; lo que falta es que el formulario no lo provoque.

### 🩸 4 · Hoy la pestaña de saldos es toda ámbar, y el ámbar deja de significar algo

Con los datos de hoy, el chip **«dato viejo»** (>7 días, `SaldosBancarios.tsx:135`) se enciende en **las 7 empresas con saldo**, y 3 llevan además el chip «igual al 31 jul», más el banner ámbar de arriba. Once marcas ámbar en una pantalla de 8 filas. Cuando todo está marcado, nada está marcado.

### 🩸 5 · Joystep dice tres cosas distintas a la vez

Joystep tiene 0 renglones y el cron le pregunta a Switch todos los días y le contestan cero. Su tarjeta muestra, al mismo tiempo:
- píldora **«Sin movimientos»**,
- línea **«Todavía no hay gastos registrados»** ← se lee como *pendiente*,
- frase **«Este mes no salió plata de caja ni del banco.»** ← se lee como *hecho*.

Las dos últimas dicen cosas opuestas sobre el mismo mes. El dato para desempatarlas existe (`egresos_importaciones` lo registra), pero la línea de «Cargado hasta…» no lo usa: se calcula solo con los meses que tienen renglones.

### 🩸 6 · 52 de las 54 cuentas se ven con espacios dobles

`cuentas_contables.nombre_switch` viene de Switch con doble espacio en **348 de 987** filas. De las **54 cuentas que Gastos usa de verdad, 28 (52%)** los tienen. En pantalla se lee «SERVICIOS  PROFESIONALES», «COMBUSTIBLE  Y  LUBRICANTES», «REPARACION  Y  MANT.  DE  OFICINA». No se normaliza en ningún lado.

### ✅ Lo que verifiqué y SÍ está bien

- 🔴 **Las 8 empresas se ven y sus gastos nunca se suman.** Leí `ResumenEgresos.tsx` y `DetalleEgresos.tsx` completos: no hay `<tfoot>` con total, no hay fila de grupo, no hay export. El único «Total que salió» es **de una empresa**. La regla está viva.
- 🔴 **Nunca `$0.00` para una empresa sin renglones.** `muestraMontoEgresos` solo deja pintar número con `con_movimientos`; el resto muestra la etiqueta de estado.
- 🔴 **`bancos_saldos` se escribe con upsert `(empresa_key, fecha_dato)` y cero `DELETE`.** Verificado en `api/saldos-banco/route.ts`.
- **Lo que Switch manda y no se puede leer se dice en pantalla** (`AvisoRechazosSwitch`). Y funcionó: el **2-sep-2026** el sync falló en 3 empresas con *«Código de cuenta inválido: "6.02.01.00.00 - SERVICIO…"»* y el 3-sep ya venía bien.
- **Los montos negativos se muestran negativos**, nunca en valor absoluto (`usd()` en `tipos.tsx`).
- **Cero voseo en texto de pantalla.** Lo que ve la gente está en neutro. ⚠️ En los **comentarios de código** del módulo hay **15 apariciones en 10 archivos** (14 «acá» + 1 «mirá»). El candado borra los comentarios antes de barrer, así que no ponen el build rojo — pero la regla de Daniel dice **«y en comentarios de código»**. Es deuda menor, anotada.

### ⚠️ Pendiente de Daniel, no un defecto

**Vista General SÍ suma los gastos entre empresas** para armar Rentabilidad. Es otro módulo, la suma es deliberada, y si la regla de «no juntar» también vale ahí hay que decidirlo y rehacer esas tarjetas. **Queda documentado, no resuelto.**

---

## 4 · Cuánto cuesta hacer las cosas

Las tareas son las que los datos demuestran que ocurren, no las que el código permite.

### Tarea A — «¿En qué se me fue la plata este mes en esta empresa?» (la que más pesa)

| | Hoy |
|---|---|
| Toques desde el inicio | **1** Gastos · **2** flechas para bajar de septiembre a julio · **1** tocar la empresa = **4** — y los 2 primeros son para salir de una pantalla vacía |
| Pantallas | 2 (lista → detalle) |
| Campos a mano | 0 |
| Lo que hay que recordar de memoria | **el mes hasta donde llegó la contadora** (julio, o mayo si es Fashion Wear); la pantalla no te lleva ahí |
| Repetición | **cada vez que entras** repites las 2 flechas; y si quieres las 5 empresas con datos: 5 × (tocar + Volver) = **10 toques más** |
| Lo que no puedes hacer | comparar contra el mes anterior. No hay delta, ni «vs mes pasado», ni tendencia. Para saber si gastaste más tienes que **anotar el número, retroceder un mes, mirar y volver**: 3 toques y memoria |

**Más corto posible: 4 → 1.** Abrir en **el último mes con datos** en vez del mes en curso (ese dato ya se calcula: es `alDia.mes`). Con eso, Gastos abre mostrando julio con las 5 empresas y sus números. Y una segunda columna «mes anterior» en la misma fila mata los 3 toques de la comparación: **el dato ya viene en la misma consulta** (la serie mensual completa ya viaja para calcular «Cargado hasta»).

### Tarea B — «¿Por dónde va la contadora?»

| | Hoy |
|---|---|
| Toques | **1** (está en la lista) — bien resuelto |
| Lo que NO contesta | «faltan 2 meses». Dice *«Cargado hasta julio 2026»* y hoy es septiembre; el atraso hay que calcularlo de cabeza |
| Lo que se pierde | los 5 meses flacos del medio (ver 🩸 arriba) |

**Más corto: ya es 1 toque.** Lo que falta no son toques, es que la frase diga el atraso: *«Cargado hasta julio — faltan agosto y septiembre»*.

### Tarea C — «Cargar los saldos del banco del mes» (8 empresas)

| | Hoy |
|---|---|
| Toques | **1** Gastos · **1** pestaña Saldos · por empresa: tocar monto, borrar lo que hay, teclear, abrir el calendario, elegir el día, Guardar ≈ **6** · × 8 empresas = **48** · **total ≈ 50** |
| Campos a mano | **16** (8 montos + 8 fechas) |
| De esos, ¿cuántos sabe el sistema? | **8: las fechas.** Todas las cargas buenas son el último día del mes, y ese día lo sabe el calendario. Los montos no los sabe nadie: salen del banco |
| Lo que hay que recordar | que la fecha **no** es hoy sino el fin de mes, y que el monto que aparece en la casilla **es el del mes pasado** |
| Repetición | el monto viejo hay que borrarlo 8 veces; la fecha hay que cambiarla 8 veces |
| Lo medido | 52 cargas en **4 h 4 min**, ~23 s por carga, **una sola vez en toda la historia** |

**Más corto: 50 → 10.** Fecha por defecto **el último día del mes cerrado** (no hoy) y casilla de monto **en blanco** (no con el saldo viejo). Quedan 8 montos tecleados + 1 Guardar + 1 pestaña. Y de paso desaparece la causa de los 3 saldos repetidos.

### Tarea D — «¿Cuánta plata tengo?»

| | Hoy |
|---|---|
| Toques | 2 (Gastos → pestaña Saldos), o 0 si mira Vista General |
| El problema | el número tiene **27 a 37 días**. Vista General lo muestra sin decir de cuándo es |

**Más corto: ya son 2.** Lo que falta es que el número diga su edad donde se mira.

---

## 5 · Que se sienta más fácil — qué quitaría y qué dejaría

**Quitar**

| Qué | Por qué |
|---|---|
| La píldora de estado (**«Al día» / «Sin movimientos» / «No traído»**) | dice lo mismo que el monto y la frase de abajo; en una fila con número, «Al día» no ayuda a decidir nada |
| La frase **«Este mes no salió plata de caja ni del banco»** cuando el mes es posterior al último cargado | hoy es falsa en agosto y septiembre para 7 empresas (🩸 1) |
| La línea **«Todavía no hay gastos registrados»** en Joystep y Multifashion | contradice a la frase de al lado; con 0 renglones todo el año, es más honesto «Switch dice que no hubo gastos» |
| El chip **«dato viejo»** en Saldos cuando lo llevan todas | 7 de 7 filas marcadas = no marca nada. Que lo lleve solo la que se sale del patrón |
| El texto **«Banco General»** suelto arriba de la lista de saldos | rótulo sin dato; no cambia ninguna decisión |
| El párrafo **«Plata que salió de caja o del banco y no es un gasto: pasa de una cuenta a otra…»** | 3 líneas para explicar un encabezado que ya dice «Salió, pero no es gasto» |
| La línea **«Total que salió»** repetida al pie del detalle | ese mismo número está arriba, en la tarjeta de totales de la misma pantalla |

**Dejar**

| Qué | Por qué |
|---|---|
| **«Salió de caja y banco»** y **«De eso, gastos»** como dos números | de $243,342.48 de Vistana solo $118,753.76 son gasto: un solo número sería llamarle gasto a un préstamo devuelto |
| La línea **«Cargado hasta …»** | es lo único que contesta «¿por dónde va la contadora?» sin preguntárselo a nadie |
| La sospecha **«puede estar a medio cargar»** con los dos números | es una sospecha declarada como tal, con la evidencia a la vista |
| El **historial de cargas** y el botón **«Corregir»** en Saldos | es lo que hace visible el saldo copiado |
| Los **negativos en negativo** | su firma es que el error da exactamente el doble |

---

## 6 · El iPhone (390 px)

**No se midió en el navegador en esta pasada.** Lo que se puede afirmar leyendo el código:

- **Pestaña Gastos**: por debajo de `lg` (1024) se dibujan **tarjetas**, no tabla (`ResumenEgresos.tsx`). La tabla de 5 columnas solo aparece desde 1024. Ese corte ya está resuelto.
- Cada tarjeta lleva hasta **7 bloques de texto** apilados: nombre + píldora, línea «Cargado hasta…», dos montos en dos columnas, conteo de pagos, explicación y «Ver en qué salió». La línea de sospecha de Fashion Wear es una frase larga: *«Cargado hasta mayo 2026 · ese mes va en $257.43 y lo habitual aquí es $21,846.31: puede estar a medio cargar»* — **112 caracteres** en `text-sm`, que a 390 px caen en 4 o 5 renglones. Con 8 empresas apiladas, esa tarjeta es la más alta de la lista.
- **Nombres largos**: se usa `EMPRESA_KEY_TO_NAME` (largo). «Vistana International» ocupa 21 caracteres donde el nombre corto del diccionario del 5-sep usa **7** («Vistana»). En Saldos ese nombre va con `truncate` al lado de hasta 2 chips, así que **es el candidato número uno a cortarse**.
- **Saldos**: la fila es `[input monto flex-1] [input date 9.5rem = 152 px] [botón Guardar]`. A 390 px con padding quedan ~358 px útiles: la fecha se lleva 152 px y el botón ~90 px → **al monto le quedan ~110 px** para un número de hasta `$317,460.51`. Es el punto más apretado del módulo.
- Botón principal: en Gastos no hay ninguno (todo es navegar); en Saldos hay **8 botones «Guardar»**, uno por fila. El sistema pone 1 acción principal por vista.

---

## 7 · Lo que sobra · lo que falta

**Sobra**

| Qué | La medición |
|---|---|
| La columna `proveedor` de `egresos_varios` | **709 de 709 filas vacías (100%)**. No se muestra en ninguna parte |
| El estado `sin_datos` tal como se calcula hoy | con el rango del año entero **no se alcanza nunca** para las 7 empresas del cron: siempre cae en `sin_movimientos` |
| La distinción entre 3 textos en las empresas con 0 filas | Joystep y Multifashion dicen tres cosas para el mismo hecho |

**Falta**

| Qué | La medición que lo prueba |
|---|---|
| Abrir en el último mes con datos | hoy abres en septiembre y **las 7 empresas salen sin un número** |
| Decir el atraso en meses | «Cargado hasta julio» + hoy es septiembre = **2 meses**, y ese resto lo tiene que hacer Daniel |
| Marcar los meses flacos del medio, no solo el último | **5 de 6 meses flacos son invisibles** (abril de Fashion Wear en 1% de su mediana) |
| Comparar con el mes anterior | **cero** deltas en todo el módulo; la serie mensual ya viaja en la misma respuesta |
| Que Saldos avise cuándo toca | **26 días sin una carga**, y ninguna alerta lo cubre. Los datos que alimentan «Disponibilidad» envejecen en silencio |
| Joystep en `bancos_saldos` | **0 filas en toda la historia**; las otras 7 tienen 7 u 8 |
| Rastro de quién hizo qué | **0 filas** de este módulo en `activity_logs`. Caja, Préstamos, Reclamos, Guías y Marketing sí registran |
| Nombre corto de empresa (§ 0, 5-sep) | el módulo usa el largo en las dos pestañas |

---

## 8 · Preguntas para Daniel

**1. Hoy Gastos abre en septiembre y dice, para 7 empresas, «Este mes no salió plata de caja ni del banco» — cuando la verdad es que la contadora no ha cargado agosto ni septiembre. ¿Cómo lo arreglamos?**
- a) Que el módulo **abra en el último mes con datos** (julio) y que los meses posteriores digan **«Todavía no se ha cargado»** en vez de «no salió plata».
- b) Solo cambiar el texto, y seguir abriendo en el mes en curso.
- c) Dejarlo como está.
- **Recomiendo (a).** Con (b) sigues entrando a una pantalla sin números y gastando 2 flechas cada vez. Con (a) se arregla la mentira **y** desaparecen los 2 toques. Es el cambio más barato del módulo y el que más pesa.

**2. Hoy la línea dice «Cargado hasta julio 2026» y tú tienes que sacar la cuenta de que faltan dos meses. ¿La ponemos a decir el atraso?**
- a) **«Cargado hasta julio — faltan agosto y septiembre»**.
- b) Dejar solo el mes, como está.
- c) Además, un aviso por Telegram cuando una empresa pase de 2 meses de atraso.
- **Recomiendo (a) sola por ahora.** (c) suena bien pero el atraso es de la contadora y tú ya sabes que está en eso: un Telegram mensual repitiendo lo mismo se vuelve ruido, y la regla de la casa es que solo se avisa lo que no se arregla solo.

**3. Fashion Wear no está floja desde mayo: está floja desde MARZO (enero $39,851 · febrero $57,733 · marzo $3,841 · abril $27 · mayo $257). Hoy la pantalla marca solo mayo. ¿Marcamos todos los meses flacos?**
- a) Marcar **cualquier** mes por debajo del 25% de la mediana de su empresa, no solo el último. Serían 6 meses marcados hoy en 4 empresas.
- b) Marcar solo el último, como hoy.
- c) Marcar todos, pero con una sola línea por empresa: «marzo, abril y mayo pueden estar a medio cargar».
- **Recomiendo (c).** (a) llena la tarjeta de ámbar y repite la misma idea 3 veces; (c) dice lo mismo en un renglón y no le quita sitio a los números.

**4. Los 3 saldos repetidos del 10-ago pasaron porque el formulario te pone el monto del mes pasado y la fecha de hoy. ¿Lo cambiamos?**
- a) La casilla del monto arranca **en blanco** y la fecha en **el último día del mes cerrado**. Bajaría de ~50 toques a ~10 y no volvería a pasar.
- b) Solo cambiar la fecha por defecto.
- c) Dejarlo y confiar en el aviso ámbar (que lleva 26 días encendido).
- **Recomiendo (a).** El aviso hace visible el error después; esto lo evita antes. Y la fecha es el único de los 16 campos que el sistema ya sabe.

**5. Los saldos de banco llevan 26 días sin actualizarse y de ahí sale la «Disponibilidad» de $629,531.03 de Vista General, que se muestra sin decir de cuándo es. ¿Qué hacemos?**
- a) Que la tarjeta de Vista General diga **«al 31 jul»** al lado del número (ya se sabe la fecha, solo hay que mostrarla).
- b) Además, un recordatorio en Recordatorios el día 1 de cada mes: «Carga los saldos del banco».
- c) Nada: tú sabes que está viejo.
- **Recomiendo (a) + (b).** (a) es una palabra y quita la posibilidad de leer un número de julio como si fuera de hoy. (b) usa un módulo que ya existe en vez de inventar una alerta — y es un dato que **nadie más va a cargar** si no se lo pide alguien.

**6. Joystep nunca ha tenido un saldo de banco cargado (0 de 8 empresas), y sus gastos vienen en cero todo el año. ¿Joystep tiene banco y gastos propios?**
- a) Sí, y falta cargarlos → se queda en las dos listas.
- b) No, Joystep no mueve caja propia → se saca de la lista de saldos y su fila de gastos dice «Joystep no lleva caja aparte».
- c) No sé, hay que preguntarle a contabilidad.
- **Recomiendo preguntarlo antes de tocar nada.** No lo puedo medir desde aquí: cero filas puede ser «no tiene» o «nadie lo cargó», y son cosas opuestas. Es la única de las seis preguntas cuya respuesta no está en el código.
