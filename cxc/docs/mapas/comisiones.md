# Comisiones — el mapa

> Módulo `comisiones` · `/comisiones` · tres pestañas: **Todas las empresas** · **Por empresa** · **Configuración** (solo admin).
> Medido contra producción el **5-sep-2026** (solo lectura), corriendo la RPC real `comision_b2b_v8` mes por mes. Lo que no cuadra con `CLAUDE.md` va con 🩸.
> Los px del navegador **no se midieron** en esta pasada. Lo que digo de la pantalla sale de leer el código que la dibuja.
> ⚠️ **Multifashion es otro módulo de comisiones y no se toca.** No hay ninguna propuesta de fusión aquí.

---

## 1 · Qué es, quién entra, cuánto se usa

**Qué es.** Cuánto le toca de comisión a cada vendedor en cada una de las 6 empresas del grupo, mes por mes, y por qué.

**Quién entra — medido ruta por ruta.**

| Qué | admin | contabilidad | secretaria | otros |
|---|:--:|:--:|:--:|:--:|
| Ver la matriz, «Por empresa» y el detalle | ✅ | ✅ | ✅ | 403 |
| Pestaña **Configuración** (Tasas · Clientes que no comisionan) | ✅ | ❌ | ❌ | ❌ |
| **Apagar o prender un descuento del mes** | ✅ | ❌ **403** | ✅ | ❌ |

Personas reales: **5** (daniel, alberto, Contabilidad, Angela, andrea).

🩸 **La que paga no puede tocar el descuento; la que no paga, sí.** `descuentos/route.ts:72` es `["admin","secretaria"]`. Contabilidad —la que arma el pago— ve el número neto y no puede apagar un descuento; secretaria, que no paga a nadie, sí puede. Está anotado en el código como decisión del 25-ago, pero el reparto quedó al revés de quien hace el trabajo.

**Cuánto se usa — de verdad.**

| Señal | Medido |
|---|---|
| Escrituras en `activity_logs` | **0**. El módulo no llama a `logActivity` — así que ni las aperturas ni los 3 Excel dejan rastro. **No se puede medir cuántas veces se descarga el Excel** |
| Tasas configuradas | **5 filas**, 4 activas. Últimos cambios: **26-ago** (3 filas) y **4-sep** (Reynaldo a 1%/1%, Aguas a inactivo) |
| Clientes que no comisionan | **12 activas** + 6 apagadas. Las 11 primeras el **3-sep**, la 12ª el **4-sep** |
| Descuentos fijos | **2 filas**, las dos de Reynaldo en Fashion Shoes, creadas el **8-jul** |
| Excepciones de descuento (apagar un mes) | **2 filas**, las dos de **julio 2026**, tocadas por última vez el **3-ago** |
| Logins de los roles que entran | contabilidad 102 · secretaria 425 · admin 536 (abr–sep) — **no separa qué módulo abrieron** |

🔎 **El módulo se usa, y se usa en ráfagas.** Todo lo que se configuró se configuró en cuatro días (8-jul, 3-ago, 26-ago, 3 y 4-sep). Es una pantalla de cierre de mes, no de uso diario.

🩸 `CLAUDE.md` dice **11 exclusiones activas**. Hoy son **12**: el 4-sep se agregó `vistana · D-81 · EDWIN` con **solo Cobro** marcado. Es el primer uso real de las casillas separadas y la doc no lo recoge.

---

## 2 · Los números, medidos con la RPC real

### Comisión bruta por persona y mes, 2026 (las 6 empresas)

| Mes | Reynaldo Espinosa | Edwin | Rodrigo | Oficina (DEFAULT) | Daniel Levy | Aguas ⛔ | Colaborador ⛔ |
|---|---:|---:|---:|---:|---:|---:|---:|
| ene | 5,036.07 | 1,132.36 | 0.00 | 16.70 | 139.22 | 6.89 | 1.72 |
| feb | 9,398.19 | 1,970.43 | 0.00 | 252.83 | 153.43 | 5.66 | — |
| mar | 10,946.59 | 1,095.27 | 0.00 | 532.77 | 1,459.60 | 11.62 | −7.00 |
| abr | 7,341.93 | 1,180.77 | 0.00 | 232.20 | 22.38 | 4.58 | — |
| may | 12,395.30 | 1,771.29 | 0.00 | 1,541.30 | 384.57 | 3.49 | — |
| jun | 9,960.33 | 316.62 | 0.00 | 1,563.44 | 35.66 | 4.30 | — |
| jul | 10,898.68 | 876.24 | 0.00 | 725.15 | 223.98 | 8.34 | — |
| ago | 6,664.72 | 652.42 | 234.49 | 327.77 | 470.23 | 3.55 | — |
| sep (5 días) | 60.00 | 41.77 | 0.00 | 8.74 | 0.00 | 1.40 | — |
| **2026** | **72,701.81** | **9,037.17** | **234.49** | **5,200.90** | **2,889.07** | **49.83** | **−5.28** |

⛔ = retirado: la RPC lo devuelve, la pantalla lo esconde.

### Lo que se paga de verdad — neto del descuento

| Mes | Bruto pagable | Descuento fijo | **A pagar** |
|---|---:|---:|---:|
| ene | 6,168.43 | −1,573.08 | 4,595.35 |
| feb | 11,368.62 | −1,573.08 | 9,795.54 |
| mar | 12,041.86 | −1,573.08 | 10,468.78 |
| abr | 8,522.70 | −1,573.08 | 6,949.62 |
| may | 14,166.59 | −1,573.08 | 12,593.51 |
| jun | 10,276.95 | −1,573.08 | 8,703.87 |
| jul | 11,774.92 | −1,573.08 | 10,201.84 |
| ago | 7,551.63 | −1,573.08 | 5,978.55 |
| **sep (5 días)** | **101.77** | **−1,573.08** | **−1,471.31** |
| **2026** | **81,973.47** | **−14,157.72** | **67,815.75** |

Los $49.83 de Aguas y los −$5.28 de Colaborador cuadran **al centavo** con lo que dice `CLAUDE.md`. Bien.

---

## 3 · 🩸 Lo que miente o está roto

### 🩸 1 · Hoy, al abrir Comisiones, el «Total a pagar» sale en **−$1,471.31**

La pantalla abre en **el mes en curso** (`ComisionesView.tsx`: `now.getMonth()+1`). Hoy es el **5 de septiembre**: llevamos 5 días de mes y la comisión bruta de todo el grupo es **$101.77**. El descuento fijo de $1,573.08 se resta igual, entero. Resultado en pantalla:

| Vendedor | Total |
|---|---:|
| Reynaldo Espinosa | **−$1,513.08** |
| Edwin | $41.77 |
| **Total a pagar** | **−$1,471.31** |

El código incluso tiene una clase para pintarlo en rojo (`ComisionesConsolidadoView.tsx:253`, `r.total < 0 ? "text-rose-600"`). O sea: la pantalla que se abre por defecto muestra que le debes plata a Reynaldo, todos los primeros días de cada mes.

### 🩸 2 · El descuento de $1,573.08 no tiene fecha: se aplica en TODOS los meses, para siempre

`comision_descuentos_fijos` tiene **8 columnas y ninguna de fecha**: `id · vendedor_nombre · empresa_key · concepto · monto · activo · created_at · updated_at`. Y `descuentos.ts:79` decide así:

```
const activo = excById.has(id) ? excById.get(id)! : true;
```

**Sin excepción para ese mes → se aplica.** Las dos únicas excepciones que existen son de **julio 2026** y las dos dicen `activo = true` (o sea, no apagan nada).

Consecuencia medida:

- «Descuento» **$1,400.00** + «Descuento de adelanto» **$173.08**, creados el **8-jul-2026**, se restan **en enero, febrero, marzo, abril, mayo y junio de 2026** — meses anteriores a que el descuento existiera.
- Se han restado en **9 meses** = **$14,157.72** de la comisión de Reynaldo tal como la muestra la pantalla.
- Se seguirán restando en octubre, noviembre, diciembre y todo 2027, **sin que nadie haga nada**.

Para que un mes no lo lleve hay que entrar al detalle de ese vendedor en esa empresa en ese mes y apagarlo **uno por uno, mes por mes**: 2 descuentos × 12 meses = **24 apagados al año**, y olvidarse cuesta $1,573.08.

No puedo saber si el «Descuento» de $1,400 era un adelanto de una sola vez o una cuota mensual — eso solo lo sabe Daniel, y es la primera pregunta.

### 🩸 3 · No hay ninguna pantalla para crear, editar o borrar un descuento

Barrí todas las rutas del módulo: la **única** escritura relacionada con descuentos es un `upsert` en `comision_descuento_excepciones` (`descuentos/route.ts:101`), que solo prende o apaga un descuento **en un mes**.

`comision_descuentos_fijos` **no tiene POST, ni PUT, ni DELETE en ninguna parte de la aplicación.** Las dos filas se escribieron directo en la base. Y no aparecen en la pestaña **Configuración**, que muestra «Tasas por vendedor» y «Clientes que no comisionan» y nada más.

O sea: **la palanca que más plata mueve del módulo ($14,157.72 en 2026, más que toda la comisión de Edwin) es la única que no se puede ver ni administrar desde el sistema.**

### 🩸 4 · El interruptor «Activo» de Tasas por vendedor no hace nada

En la pestaña Configuración cada vendedor tiene un interruptor «Activo». En el SQL que reparte la plata (`comision_b2b_v8`):

- línea 89 — `JOIN comision_vendedor_tasa t ON … AND t.activo = true` — pero eso solo arma la lista de vendedores **que no vendieron ni cobraron nada**;
- línea 91-92 — `UNION SELECT vendedor FROM ventas UNION SELECT vendedor FROM cobros` — cualquiera con una venta o un cobro entra igual;
- línea 113 — `LEFT JOIN comision_vendedor_tasa t ON t.vendedor_nombre = u.vendedor` — **sin filtrar por `activo`**, y su tasa se aplica.

**Prueba medida:** `REY STOUTE AGUAS` está en `activo = false` desde el 4-sep-2026 y la RPC lo **sigue** devolviendo con comisión en los 9 meses de 2026 ($49.83). Solo desaparece de la pantalla porque el navegador lo filtra por estar en la lista de retirados — el interruptor no tuvo nada que ver.

Apagar a alguien ahí no le quita la comisión. Es un control que promete algo que no cumple.

### 🩸 5 · Hay un cliente excluido por NOMBRE dentro del SQL de la plata

`comision_b2b_v8`, líneas 56 y 82:

```
AND f.cliente          NOT ILIKE '%multi fashion holding%'
AND r.cliente_nombre   NOT ILIKE '%multi fashion holding%'
```

Ese cliente es **D-108, «Multi Fashion Holding»**, y en 2026 tiene **203 facturas** (Fashion Wear 97 · Vistana 52 · Fashion Shoes 36 · Joystep 7 · Active Wear 6 · Active Shoes 5) y **21 recibos** en 5 empresas. Todos con el mismo código en las 6.

Contradice de frente la regla de la casa —**la identidad del cliente es el CÓDIGO, nunca el nombre**— y es la única exclusión de cliente que **no** se ve en «Clientes que no comisionan», donde ya viven las otras 12 y donde se guardan por código. Si Switch escribe algún día «MULTIFASHION HOLDING» o «Multi-Fashion Holding», esas 203 facturas empiezan a pagar comisión **en silencio**.

### 🩸 6 · Reynaldo cobra comisión NEGATIVA en Active Wear y nadie sabe por qué

Agosto 2026, Reynaldo en Active Wear: **−$641.55**, y sale de la RPC **antes** de cualquier descuento. Son notas de crédito que superan la venta del mes. La pantalla lo muestra en rojo y ya: no hay ni una palabra que diga «esto es una devolución».

### 🩸 7 · El mes lo decide el reloj del navegador, no Panamá

`ComisionesView.tsx` usa `new Date().getMonth()+1` para arrancar. La regla de la casa es **Panamá UTC−5 fijo** (`hoyPanama`), justamente porque el borde de mes se corre. En un componente `"use client"` que también renderiza en el servidor (UTC), el primer y el último día del mes pueden pintar un mes distinto del que el navegador elige después. Todo el resto del sistema usa `hoyPanama`.

### ✅ Lo que verifiqué y SÍ está bien

Corrí la RPC real y leí las tres superficies (matriz, «Por empresa», los 3 Excel):

- 🔴 **UNA PERSONA, UNA FILA, UNA TASA.** `comision_vendedor_tasa` tiene **5 filas para 5 personas**, cero grafías repetidas. Los 4 «Reinaldo» se colapsaron. Y el canónico es **REYNALDO con Y**.
- 🔴 **El alias funciona contra los datos reales.** En 2026 Switch manda `REINALDO ESPINOSA` (979 facturas), `REYNALDO ESPINOSA` (20), `AGUAS` (44), `REY STOUTE AGUAS` (1) y `DANIEL LEVY ` con espacio final (32 facturas + 40 recibos). Todos caen en una sola fila.
- 🔴 **Aguas y Colaborador están retirados de las 3 superficies.** `sinRetirados` está en `ComisionesConsolidadoView.tsx:163`, `ComisionesPorEmpresaView.tsx:118` y `comisionExcel.ts:281,349`. Ni fila ni total, y el servidor rechaza con mensaje una tasa o un cliente a su nombre.
- 🔴 **DEFAULT y Daniel Levy se calculan, se ven y NO se pagan.** En 2026 son **$8,089.97** que se muestran en gris y no entran al total. La fila se rotula **«Oficina (DEFAULT)»**.
- 🔴 **Los descuentos se restan UNA sola vez, en el servidor** (`netearComisiones`). Las dos pestañas piden un total que ya viene neto: no pueden separarse.
- 🔴 **Tres vendedores, tres papeles.** La v8 usa `vendedor_nombre` de la factura para la venta y `vendedor_registro` del recibo para el cobro; `vendedor_cartera` no aparece.
- **Nunca se dice «exclusión» en pantalla**: el rótulo es «Clientes que no comisionan».
- **Los 3 Excel salen por el helper de la casa** (`downloadWorkbook` → `workbookBlob`), no por un `XLSX.write` suelto.
- **El botón «Configurar» de Por empresa no volvió.** El chip es la única entrada.
- **Cero voseo en texto de pantalla.** ⚠️ En los **comentarios de código** hay **26 apariciones en 12 archivos** (22 «acá», 2 «tocás», 2 «recalibrá»). El candado borra los comentarios antes de barrer, así que no ponen el build rojo — pero la regla dice **«y en comentarios de código»**. Deuda menor, anotada.

---

## 4 · Cuánto cuesta hacer las cosas

### Tarea A — «¿Cuánto le pago a cada quien este mes y por qué?» (la que pesa)

Contémosla para agosto 2026, que es el último mes cerrado.

| | Hoy |
|---|---|
| Toques hasta ver el número | **1** abrir Comisiones (cae en septiembre) · **1** abrir el selector de período · **1** tocar «Ago» · = **3**. Y el primero te deja mirando un total de **−$1,471.31** |
| Pantallas | 1 para el total, **+1 modal por cada celda que quieras justificar** |
| Celdas con número en agosto | **6** (Reynaldo en 4 empresas, Edwin en 1, Rodrigo en 1) → **6 modales** = 12 toques (abrir + cerrar) |
| Total de toques para pagar agosto entero | **3 + 12 = 15** |
| Campos a mano | 0 |
| Lo que hay que recordar de memoria | que **el mes en curso no sirve** (siempre sale negativo); que la celda de Fashion Shoes lleva **$1,573.08 restados** que no están escritos en la matriz; que **−$641.55** en Active Wear son devoluciones |
| Lo que se repite | el cambio de mes, **cada vez que entras**; y el descuento, que hay que apagar 2 veces por mes si no toca |
| Lo que NO puedes hacer | ver los 12 meses de un vendedor juntos. Para saber cuánto lleva Reynaldo en el año hay que abrir **9 meses, uno por uno**, y sumarlos a mano |

**Más corto: 15 → 4.** Tres cosas, ninguna cambia un número:
1. Abrir en **el último mes cerrado** (agosto) en vez del mes en curso → −2 toques y se acaba el total negativo.
2. Poner el descuento **en la celda**, como «$2,993.23 − $1,573.08» o al menos una marca, en vez de solo en el modal → la mitad de los modales dejan de hacer falta.
3. Una columna **«2026»** al final de la matriz con el acumulado del año → mata los 9 meses de ida y vuelta.

### Tarea B — «Quitarle la comisión de un cliente a un vendedor»

| | Hoy |
|---|---|
| Toques | **1** Comisiones · **1** chip Configuración · **1** «+ Agregar» · **1** elegir empresa (si no es la que está) · **~3** el buscador de cliente (abrir, escribir, elegir) · **2** el desplegable de vendedor · **1** Guardar = **~10** |
| Campos a mano | **1** (lo que escribes en el buscador de cliente) |
| De esos, ¿cuántos sabe el sistema? | ninguno: es una decisión tuya |
| Lo que se repite | si el mismo cliente no comisiona en 5 empresas, son **5 altas de ~10 toques cada una = 50**. Medido: Reynaldo tiene a **D-104** excluido en Active Shoes **y** en Active Wear — dos altas para una sola decisión |
| Bien resuelto | las casillas Venta/Cobro vienen marcadas, y cambiarlas en una fila existente es **1 toque** que guarda solo |

**Más corto: 10 → 6 para una empresa, 50 → 12 para cinco.** Que el selector de empresa acepte varias («¿en qué empresas?») y una sola alta escriba las 5 filas. Es el mismo dato tecleado 5 veces.

### Tarea C — «Cambiarle la tasa a alguien»

| | Hoy |
|---|---|
| Toques | **3** llegar a Configuración · **1** la casilla · teclear · **1** «Guardar tasas» = **~6** |
| Filas visibles | **3** (Edwin, Reynaldo, Rodrigo). Daniel Levy y Aguas se filtran a propósito |
| Bien resuelto | un solo Guardar para toda la tabla, no uno por fila |
| El problema | el interruptor «Activo» de esa misma tabla **no hace nada** (🩸 4) |

**Ya es corto.** Lo que sobra es el interruptor.

### Tarea D — «¿Por qué este número?»

| | Hoy |
|---|---|
| Toques | **1** tocar la celda → modal con VENTAS, COBROS y el cierre, imprimible y exportable |
| Bien resuelto | es la mejor pantalla del módulo: replica el Excel a mano, se imprime y se baja |
| El problema | el descuento se apaga **solo desde aquí**, y **contabilidad ve el interruptor apagado** porque el POST le contesta 403 |

---

## 5 · Que se sienta más fácil — qué quitaría y qué dejaría

**Quitar**

| Qué | Por qué |
|---|---|
| El interruptor **«Activo»** de Tasas por vendedor | no cambia ni un centavo (🩸 4). Un control que miente es peor que no tenerlo |
| La columna **«Empresas»** de Tasas por vendedor | lista las empresas donde ese vendedor aparece; no se ordena, no se filtra y no cambia ninguna decisión de la pantalla |
| La línea **«N vendedores sin actividad este mes»** | en mayo, Rodrigo entra ahí con venta $0.00 y cobro $0.00: es un renglón para decir que no hay nada que decir |
| La **fila de escritorio + la tarjeta de celular** repiten los mismos 4 números | no es un defecto: es el mismo modelo pintado de dos formas. **No se toca** |

> ✅ Verificado y descartado como «sobra»: la matriz **no** se llena de ceros. En agosto la RPC devuelve **14 celdas y solo 2 en $0.00**; el resto del cuadro son «—» en gris. Y la píldora **«Sincronizado»** de aquí **no** es la que Daniel mandó quitar de Ventas › Resumen: aquella miraba 3 de 8 empresas con una lista escrita a mano; esta **deriva** su lista de `EMPRESAS_COMISIONAN` (las 6), vive dentro del ⓘ sin gastar alto y pone un punto ámbar si alguna está atrasada. Se queda.

**Dejar**

| Qué | Por qué |
|---|---|
| La marca **«no se paga»** en gris | son $8,089.97 en 2026 que se ven y no se suman; esconderlos haría que el bruto no cuadre |
| El ⓘ **«Criterios»** cerrado | explica la regla del 20% de utilidad sin gastar alto de pantalla |
| **«Oficina (DEFAULT)»** | «Sin asignar» sonaba a error del sistema |
| El **modal de detalle** entero | es lo que contesta «por qué», y se imprime |
| Las **casillas Venta / Cobro** por fila | ya se usaron de verdad el 4-sep (D-81, solo cobro) |

---

## 6 · El iPhone (390 px)

**No se midió en el navegador en esta pasada.** Leyendo el código:

- **La matriz de 8 columnas no se dibuja en el celular.** Por debajo de 1024 va `ComisionesTarjetasConsolidado`; la tabla es `hidden … lg:block`. El comentario del propio archivo dice que la tabla medía 984 px de contenido en 356 útiles = 628 px de arrastre, y por eso existen las tarjetas. **Ese es el caso difícil y ya está resuelto** — es de lo mejor hecho del módulo.
- Cada tarjeta de vendedor lleva el nombre + el total arriba y hasta **5 datos** debajo en dos columnas (Ventas, Com. venta, Cobros, Com. cobro, y Descuentos solo si hay).
- **Los montos van en `text-xs` (12 px)** y el nombre del vendedor en `text-[13px]`. La regla de la casa es **`text-sm` mínimo para datos**. Es el único lugar del módulo por debajo del piso.
- **Nombre de empresa largo.** Se usa `EMPRESA_KEY_TO_NAME`: la columna dice «Vistana International» (21 caracteres) donde el diccionario del 5-sep usa **«Vistana»** (7). En la matriz de escritorio es la columna más ancha de las 6; en la tarjeta del celular es la etiqueta más larga.
- El período, «Actualizar ahora» y Excel van en una fila con `flex-wrap`: si no entran, bajan de línea en vez de sacar la página para el costado. Correcto.
- **Configuración en el celular**: las dos tablas van dentro de `overflow-x-auto` (deslizan solas, no empujan la página). El alta de un cliente que no comisiona es una grilla de 4 columnas que a 390 px se apila. **No verificado en pantalla.**

---

## 7 · Lo que sobra · lo que falta

**Sobra**

| Qué | La medición |
|---|---|
| El interruptor «Activo» de las tasas | Aguas lleva 1 día en `activo = false` y **sigue comisionando** en los 9 meses |
| La exclusión por nombre dentro del SQL | **203 facturas y 21 recibos** de D-108 atados a un `ILIKE` sobre un texto que Switch puede cambiar |
| La línea «N vendedores sin actividad este mes» | en mayo Rodrigo va ahí con venta y cobro en **$0.00**; en 8 de los 9 meses de 2026 su comisión es cero |

**Falta**

| Qué | La medición que lo prueba |
|---|---|
| Que el descuento tenga **desde / hasta** | hoy se restó en **9 meses**, incluidos 6 anteriores a su creación = **$14,157.72** |
| Una pantalla para **ver y administrar los descuentos** | **0 rutas** de alta, edición o borrado en toda la app; las 2 filas se escribieron en la base |
| Abrir en el **último mes cerrado** | hoy abres en septiembre y el total a pagar sale **−$1,471.31** |
| El **acumulado del año** por persona | para saber que Reynaldo lleva $72,701.81 hay que abrir **9 meses** y sumar a mano |
| Decir que un número negativo es una **devolución** | −$641.55 en Active Wear, sin una palabra |
| Rastro de quién cambió una tasa o un descuento | **0 filas** en `activity_logs`. `comision_exclusion` sí firma (`creado_por = "daniel"`), `comision_vendedor_tasa` y `comision_descuentos_fijos` **no guardan quién** |
| Nombre corto de empresa (§ 0, 5-sep) | el módulo usa el largo en la matriz, las tarjetas, el detalle y los 3 Excel |
| Panamá UTC−5 en el mes por defecto | usa el reloj del navegador |

---

## 8 · Preguntas para Daniel

**1. A Reynaldo se le restan $1,573.08 de comisión TODOS los meses, sin fecha de inicio ni de fin — incluidos enero a junio, que son anteriores al día en que se creó el descuento (8-jul). En 2026 van $14,157.72. ¿Ese descuento qué es?**
- a) Fue **una sola vez** (un adelanto que ya se recuperó) → hay que ponerle mes y quitarlo de todos los demás.
- b) Es una **cuota mensual** hasta que se pague algo → hay que ponerle «desde» y «hasta», y que se apague solo al terminar.
- c) Está bien como está: se resta siempre.
- **No lo puedo medir: solo tú sabes qué era ese $1,400.** Pero sea (a) o (b), la conclusión es la misma: el descuento necesita fechas. Hoy la única forma de que un mes no lo lleve es entrar al detalle y apagarlo a mano, **24 veces al año**, y olvidarse cuesta $1,573.08.

**2. Hoy, al abrir Comisiones, el total a pagar sale en −$1,471.31, porque abre en septiembre (5 días de mes) y el descuento se resta entero. ¿Abrimos en el último mes cerrado?**
- a) Sí: abrir en **agosto** y que el mes en curso siga estando a un toque.
- b) Dejarlo abriendo en el mes en curso.
- c) Abrir en el mes en curso pero avisar «este mes va empezando».
- **Recomiendo (a).** Comisiones es una pantalla de cierre: nadie paga el día 5. Además quita 2 toques cada vez que entras y hace desaparecer el número negativo sin tocar ningún cálculo.

**3. Los descuentos no se pueden ver ni crear desde el sistema: las 2 filas se escribieron directo en la base y no aparecen en Configuración. ¿Los subimos a Configuración?**
- a) Sí: una tercera sección **«Descuentos»** al lado de «Tasas» y «Clientes que no comisionan», con vendedor, empresa, concepto, monto y desde/cuándo.
- b) Dejarlos donde están (solo dentro del modal de detalle).
- c) Sí, y que además contabilidad los pueda apagar (hoy le contesta 403 y a secretaria no).
- **Recomiendo (a) + (c).** Es la palanca que más plata mueve del módulo —más que toda la comisión de Edwin en el año— y es la única que no se ve. Y (c) porque la que arma el pago es contabilidad; hoy el permiso está al revés de quien hace el trabajo.

**4. El interruptor «Activo» de Tasas por vendedor no le quita la comisión a nadie: Aguas está apagado desde el 4-sep y sigue comisionando en los 9 meses. ¿Qué hacemos con él?**
- a) **Quitarlo** de la pantalla: para sacar a alguien ya existe la lista de retirados, que sí funciona.
- b) Arreglarlo para que apagado signifique tasa 0.
- c) Dejarlo.
- **Recomiendo (a).** (b) suena mejor pero abre dos caminos para lo mismo —el interruptor y la lista de retirados— y ya sabemos qué pasa cuando la misma decisión vive en dos lados. Un solo lugar para sacar a alguien.

**5. «Multi Fashion Holding» (D-108) está excluido de las comisiones por su NOMBRE, dentro del SQL: 203 facturas y 21 recibos de 2026. Si Switch le cambia una letra al nombre, esas facturas empiezan a pagar comisión sin que nadie se entere. ¿Lo movemos a la lista de «Clientes que no comisionan», que va por código?**
- a) Sí, por código D-108 y para todos los vendedores en las 6 empresas → queda a la vista y no depende del texto.
- b) Dejarlo en el SQL.
- **Recomiendo (a).** Es la regla de la casa (la identidad es el código) y de paso deja de ser la única exclusión invisible. ⚠️ La lista de hoy es por (empresa, cliente, **vendedor**), así que para que valga para todos hay que decidir si se acepta «todos los vendedores» — es la única parte que no está resuelta.

**6. En agosto, Reynaldo tiene −$641.55 en Active Wear: son devoluciones que superaron la venta del mes. La pantalla lo muestra en rojo y nada más. ¿Lo explicamos?**
- a) Que la celda negativa diga **«devoluciones»** al tocarla, sin sumar nada nuevo.
- b) Que un mes negativo se muestre en $0.00 y se arrastre al mes siguiente.
- c) Dejarlo.
- **Recomiendo (a).** (b) cambia lo que se paga y eso es una decisión de negocio distinta; (a) es una palabra que evita la llamada de «¿por qué me sale en rojo?».
