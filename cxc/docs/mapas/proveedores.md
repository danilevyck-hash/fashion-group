# Mapa — Proveedores (`/proveedores`)

> Medido contra producción el **6-sep-2026, 02:30-03:10 UTC** (SQL de solo lectura).
> Ningún número sale de la documentación. Lo que no coincide con `CLAUDE.md` va marcado 🩸.
> Diccionario aplicado: **Correo** (no Email) · nombre de empresa **corto** · **% sin decimal** ·
> plata negativa **−$100.00** · **con centavos**.

---

## Qué es, quién entra, cuánto se usa

**Qué es.** Lo que el grupo le debe a sus proveedores (cuentas por pagar). Una lista agrupada y
una ficha por proveedor. **Es de solo lectura**: no tiene un solo botón que escriba nada — ni
alta, ni edición, ni nota. Los datos los trae el cron `sync-proveedores` (09:30 UTC) desde Switch.

| | |
|---|---|
| Roles | **admin** (daniel, alberto) y **contabilidad** (usuario compartido «Contabilidad»). Nadie más. |
| Empresas que trae | **7**: las 6 del grupo + Multifashion. **Boston NO** (`cxp: false`) |
| Pantallas | 2 — la lista y la ficha |
| Verbos de escritura | **0** |

**Cuánto se usa DE VERDAD:**

| Señal | Medido |
|---|---|
| Acciones en `activity_logs` con `entity_type` de proveedores | **0 en toda la historia** |
| Sesiones del usuario Contabilidad | 68 (primera 9-jun, última 4-sep 21:57) |
| Lo que Contabilidad SÍ registra | **166 acciones en Préstamos**, la última el 1-sep |
| Vistas de pantalla | **no medido** — el sistema no registra lecturas |

⚠️ **El cero de `activity_logs` no prueba que nadie entre**: el módulo no escribe nada, así que
no tiene qué registrar. Lo único demostrable es que **contabilidad usa Préstamos 166 veces y
Proveedores 0**, porque Préstamos sí deja rastro. Para saber si se abre haría falta registrar la
vista, que hoy no existe en ningún módulo.

---

## Los datos, medidos

### La tabla — `switch_proveedor_estadocuenta`

| | |
|---|---:|
| Filas | **65** |
| Lo que muestra la lista (claves agrupadas por nombre) | **47** |
| De ésas, con saldo | **34** |
| Escondidas tras «Ver 13 sin saldo» | **13** |
| Renglones de detalle guardados | 933 |
| Última corrida | 5-sep 09:30-09:32 UTC — **14 corridas, 14 éxitos en 14 días**, 0 descartes |

🩸 **El encabezado de `src/lib/proveedores.ts:3` dice «42 filas hoy». Son 65.**

🩸 **`CLAUDE.md` decía que era «la única tabla `switch_*` con soft delete». Es FALSO y ya está
corregido en la doc, pero confirmado aquí:** la tabla **no tiene columna `deleted`** y el sync
hace un **DELETE real** de los proveedores que Switch ya no lista
(`src/lib/switch-api/sync-proveedores.ts:258-262`). Sí entra al respaldo (`backup/tablas.ts:241`).

### Por empresa

| Empresa | Filas | Por pagar |
|---|---:|---:|
| Fashion Wear | 17 | $2,334,502.27 |
| Fashion Shoes | 3 | $1,338,175.39 |
| Vistana | 12 | $1,008,781.89 |
| Active Shoes | 10 | $261,113.57 |
| Multifashion | 13 | $124,436.54 |
| Active Wear | 5 | $111,506.97 |
| Joystep | 5 | $21,189.19 |
| **Total del grupo** | **65** | **$5,199,705.82** |

### Columnas: cuánto está vacío

| Columna | Vacía | % |
|---|---:|---:|
| Contacto | 41 de 65 | **63%** |
| Correo | 15 | 23% |
| Teléfono | 15 | 23% |
| Dirección | 15 | 23% |
| Tipo de proveedor | 15 | 23% |
| DV | 20 | 31% |
| **RUC** | **8** | **12%** |
| Código | 0 | 0% |
| **Último pago** | **53 de 65** | **82%** |
| Ledger de detalle vacío | 22 | 34% |
| Saldo en $0.00 | 26 | 40% |
| Saldo a favor (negativo) | 5 | 8% |

### La antigüedad de lo que se debe

| Tramo real de Switch | Monto | % |
|---|---:|---:|
| 0-30 | $578,849.37 | 11% |
| 31-60 | **−$31,991.62** | −1% |
| 61-90 | $504,292.59 | 10% |
| 91-120 | $360,902.60 | 7% |
| 121-180 | $301,182.29 | 6% |
| 181-270 | $552,483.02 | 11% |
| 271-365 | **$1,582,237.80** | **30%** |
| Más de 365 | **$1,351,749.77** | **26%** |

**El 56% de lo que el grupo debe tiene más de 271 días.** La lista no lo muestra: condensa los
8 tramos en 3, y el tercero («121d+») se lleva **$3,787,652.88 = 73% del total** en una sola cifra
sin abrir. Los 8 tramos sí están en la ficha del proveedor.

### Concentración

- Los **2 proveedores más grandes** = **$4,636,333.78 = 89%** del total.
  American Fashion Wear $3,633,293.25 · American Designer Fashion $1,003,040.53.
- **9 de las 47 filas de la lista son empresas del propio grupo** (Boston, Fashion Wear Inc,
  Vistana, Active Wear, Active Shoes, Fashion Shoes Holdings, Joystep): **$160,427.79 = 3%**.
  El total «Por pagar · grupo» incluye plata que el grupo se debe a sí mismo.

---

## 🩸 Lo que miente o está roto

### 1. 🔴 LOS PROVEEDORES SE UNEN POR NOMBRE — el defecto que Daniel aplazó

**La identidad es `normProvName(nombre)`** = mayúsculas + quitar `.` y `,` + colapsar espacios
(`src/lib/proveedores.ts:44`). El propio archivo lo admite en su encabezado.

**Confecciones Boston, el caso que motivó esto — medido:**

| Empresa | Nombre en Switch | RUC | Saldo | Fila en la lista |
|---|---|---|---:|---|
| Joystep | `CONFECCIONES BOSTON` | 655-544-133465 | $3,718.16 | **Fila A** |
| Vistana | `CONFECCIONES BOSTON` | 655-544-133465 | $0.00 | Fila A |
| Multifashion | `CONFECCIONES BOSTON S A` | 655-544-133465 | $80.25 | **Fila B** |
| Fashion Wear | `CONFECCIONES BOSTON  S.A` (dos espacios) | 655-544-133465 | $367.55 | **Fila C** |
| Active Shoes | `CONFECCIONES BOSTON S.A` | 655-544-133465 | $0.00 | Fila C |
| Multifashion | **`FASHION WEAR, INC`** | 655-544-133465 | **$76,165.72** | **Fila D** |

- **5 empresas, 4 grafías, 1 RUC → la pantalla dibuja TRES filas** (A, B, C) en vez de una.
  Suman **$4,165.96** repartidos, y ninguna dice que las otras existen.
- Cada ficha dice «1 empresa» o «2 empresas». **Ninguna dice 5.**
- 🩸 **Y hay una CUARTA fila con el MISMO RUC y otro nombre: `FASHION WEAR, INC`, $76,165.72.**
  O es la misma empresa mal escrita en Switch, o el RUC está copiado. **No lo puedo decidir desde
  aquí — es una pregunta para ti.** Con el RUC solo, el total sería **$80,331.68**.

**Los otros casos reales, todos medidos:**

| RUC | Nombres distintos | Empresas | Plata |
|---|---|---|---:|
| `40254-103-278837` | `CIF EXPRESS SA.` y `Luis Alberto Torres De Gracias` | las dos en **Fashion Wear** | $1,530.36 + $2,214.90 |
| `155727670-2-2022` | `ACTIVE SHOES S.A` y `BDL SERVICES INC` | Multifashion / Active Shoes | −$2,032.57 + $0.00 |
| `2023672-1-743774` | `GRUPO J NAVARRO` y `GRUPO J NAVARRO, S.A.` | Active Shoes / Vistana | $0.00 y $0.00 |
| sin RUC | `LATIN FITNESS GROUP` (3 empresas) y `LATIN FITNESS GROUP INC.` | 4 empresas | $288,385.59 + −$26.75 |

**Resumen del daño:** **12 de las 47 filas** aparecen en más de una empresa; **5 grupos de filas
que Switch identifica con el mismo RUC quedan partidos en la pantalla**, y el más grande de
todos es Confecciones Boston.

### 2. 🔴 NO HAY UN CÓDIGO QUE SIRVA DE IDENTIDAD — está medido, no supuesto

La regla de la casa es «la identidad es el CÓDIGO, nunca el nombre». **Aquí el código no sirve**:

| Código | Es este proveedor en… | …y este otro en… |
|---|---|---|
| `112` | Fashion Shoes → American Fashion Wear | Multifashion → Fashion Wear Inc · Joystep → JCBBrands |
| `113` | Active Wear → Latin Fitness | Multifashion → Vistana · Fashion Shoes → American Sportswear |
| `122` | Fashion Wear → American Fashion Wear | Active Shoes → **Latin Fitness Group** |
| `123` | Active Shoes → Mack Import | Joystep → **Confecciones Boston** |

**10 códigos nombran proveedores distintos según la empresa.** El sistema ya lo sabe en otra
parte: los reclamos se unen por el **par (empresa, código)** justamente por esto
(`src/app/api/proveedores/[key]/route.ts:33`) y funciona — 34 reclamos, **34 con código**, 0
huérfanos. Pero ese par identifica al proveedor *dentro de una empresa*, no *entre* empresas.

**¿Y el RUC?** Tampoco alcanza solo:

| | |
|---|---:|
| Filas sin RUC | 8 (12%) |
| Filas con RUC basura (`0`, `55555`, `0000000001`, `0000-1-000`) | 10 (15%) |
| **Filas que el RUC no puede identificar** | **18 de 65 = 28%** |
| RUCs con dos nombres muy distintos | 3 casos |
| Mismo proveedor con dos RUCs | **American Fashion Wear**: `2238988-1-779356` y `2238988-1779356` (falta un guion) — **$3,633,293.25**, el proveedor más grande del grupo |

🔴 **Por eso «unir por RUC» no es la respuesta**: el nombre une bien al proveedor de $3,6 millones
y el RUC lo partiría en dos. El camino que ya usó este sistema para el mismo problema es
**una lista escrita a mano** — `comision_vendedor_alias`, cuando Switch mandaba «REINALDO ·
REYNALDO · REINDALDO» y era una sola persona. **Nada por parecido.**

### 3. 🩸 «Último pago» dice «—» en 27 de las 34 filas con saldo (79%)

La columna existe en la tabla, en la ficha y en el Excel. Está vacía en **82% de las filas**.
No es un bug de lectura: el propio módulo lo explica
(`src/lib/proveedores-derivados.ts:15-25`) — el estado de cuenta de Switch **solo trae lo que
todavía se debe**, así que un pago que ya cerró su factura **se cae del archivo y desaparece**.
El pago más viejo que sobrevive es del **15-abr-2024**.

**Lo que la columna dice y lo que significa no coinciden:** dice «Último pago hace 33d» y
significa «el pago más reciente que todavía está sin aplicar en el estado de cuenta abierto».
Un proveedor al que le pagaste todo ayer sale con «—». Es la familia del «Margen %» que mostraba
participación: rótulo heredado sobre otro dato.

### 4. La lista no se puede ordenar

Los encabezados **no son botones**: el orden es fijo, por saldo de mayor a menor
(`src/lib/proveedores.ts:118`). En Clientes y en el CXC se ordena tocando el encabezado. Con
89% del dinero en 2 filas, ordenar por «121d+» o por «Último pago» es justamente lo que haría
falta y no se puede.

### 5. El total del grupo mezcla Multifashion con las 6 empresas

`Por pagar · grupo $5,199,705.82` suma las 7. Multifashion aporta $124,436.54 (2%).
En el módulo **Gastos** la regla es la contraria: las 8 empresas se ven y **sus gastos nunca se
suman entre sí**. Aquí sí se suman, y nadie lo decidió por escrito.

### 6. Textos que no siguen el diccionario del 5-sep

| Dónde | Dice | Debería decir |
|---|---|---|
| Ficha, campo fiscal (`ProveedorDetail.tsx:161`) | **Email** | **Correo** |
| Lista, chip | «Confecciones Boston»… | no aplica (Boston no está aquí) |

**Lo que NO está roto, y se buscó con saña:**
- El saldo cuadra: **65 de 65 filas** con `suma de los 8 tramos = saldo_total`, peor diferencia **$0.00**.
- El Excel sale por `buildReportSheet`/`workbookFromSheets` (el helper de la casa), desde la fila 1.
- Cero voseo en texto de pantalla.
- Ningún `$0.00` en letra grande (el total del grupo nunca da cero hoy).
- La ficha no inventa datos: si un campo fiscal está vacío, no dibuja el bloque.
- El sync tiene guard: solo purga con lista completa y no vacía.

---

## Cuánto cuesta hacer las cosas

Toques = clics/taps desde `/home`. Contados contra el código.

### 1. 🔴 «¿Cuánto le debo a Confecciones Boston de verdad, juntando sus empresas?»

**La tarea de fondo del módulo. Hoy no se puede terminar bien.**

| Hoy | |
|---|---|
| Toques | **11** — Inicio → Proveedores (2) · escribir «boston» (1) · abrir Fila A (1) · volver (1) · abrir Fila B (1) · volver (1) · abrir Fila C (1) · volver (1) · sumar a mano (2 con calculadora) |
| Pantallas distintas | **5** (lista + 3 fichas + la calculadora) |
| Datos a copiar a mano | **3 montos** que el sistema ya tiene |
| Lo que hay que recordar de memoria | que Boston está escrito de 4 maneras; que hay que buscar «boston» y no «confecciones»; los 3 montos mientras navegas |
| Lo que da | **$4,165.96** |
| Lo que se te escapa | **$76,165.72** de `FASHION WEAR, INC`, misma cédula, que la búsqueda «boston» **no encuentra nunca** |
| Repeticiones | el filtro de empresa se vuelve a poner en cada visita si entraste por un enlace con `?empresa=` |

**La versión más corta: 3 toques.** Inicio → Proveedores → tocar «Boston» (una sola fila, que
dice «5 empresas»), y la ficha ya trae el desglose por empresa que hoy existe.
**De 11 toques y 5 pantallas → a 3 toques y 2 pantallas.** El salto no es de diseño: es de
tener una fila en vez de tres.

### 2. «¿A quién le debo más y desde cuándo?»

| | Hoy | Más corto |
|---|---:|---:|
| Toques hasta ver el ranking | **2** | 2 |
| Filas visibles | 34 (13 más tras un toque) | 34 |
| Filas que son el propio grupo | **9** (3% del dinero, 19% de las filas) | 0, si se separan |
| Ver la antigüedad real de los $3.8M de «121d+» | **1 toque por proveedor**, ficha por ficha | 1 toque total |
| Ordenar por antigüedad | **imposible** | tocar el encabezado |

Con 89% del dinero en 2 filas, la lista contesta «quién» en 2 toques y **no contesta «desde
cuándo»** sin abrir fichas de a una.

### 3. «¿Cuándo le pagué a este proveedor?»

| | Hoy |
|---|---:|
| Toques | 3 |
| Probabilidad de obtener respuesta | **21%** (7 de 34 filas con saldo tienen fecha) |
| Lo que la pantalla no dice | que el «—» no significa «nunca le pagaste» |

**No tiene arreglo con el dato que hay** (Switch no tiene endpoint de pagos a proveedores, ya
está verificado en el código). La versión más corta es **quitar la columna o rotularla con lo
que de verdad es**.

### 4. «¿Cómo contacto a este proveedor?»

| | Hoy |
|---|---:|
| Toques | 3 |
| Filas con nombre de contacto | **24 de 65 (37%)** |
| Filas con correo | 50 de 65 (77%) |
| Campos que se pueden corregir desde la pantalla | **0** — el módulo no escribe nada |

Si el correo está mal, hay que arreglarlo en Switch y esperar al cron del día siguiente.

### 5. «Bajar la lista para la contadora»

| | Hoy |
|---|---:|
| Toques | 3 |
| Columnas del Excel | 7 |
| Lo que el Excel arrastra | las mismas 3 filas de Boston, la misma columna de «Último pago» vacía en 79% |

---

## Que se sienta más fácil — lo que quitaría y lo que dejaría

**Quitaría:**

| Qué | Por qué |
|---|---|
| La columna **«Último pago»** de la lista y del Excel | Dice «—» en 79% de las filas con saldo, y cuando dice algo significa otra cosa |
| La columna **«Empresas»** | Es un número sin unidad pegado al borde derecho; hoy miente en 12 filas y en la ficha ya está el desglose real |
| El bloque **«Ver 13 sin saldo»** | 13 proveedores en $0.00 que nadie va a mirar; si hace falta, están en el buscador |
| 3 de los 8 chips de empresa | Joystep ($21,189.19), Active Wear y Multifashion son 5% del total entre los tres; ocupan una fila entera del celular |

**Dejaría:**

| Qué | Por qué |
|---|---|
| El total grande arriba | Es la única cifra que se mira sin pensar |
| Los 3 tramos de colores | Es lo que dice si algo se está pudriendo |
| El buscador | Con 34 filas es la vía más rápida a un proveedor concreto |

**Agregaría:**

| Qué | El número que lo justifica |
|---|---|
| Ordenar tocando el encabezado | 73% del dinero está en una columna que no se puede ordenar |
| Partir «121d+» en «121-365» y «+1 año» | $1,351,749.77 (26%) lleva más de un año y hoy no se distingue |
| Separar el propio grupo del resto | 9 filas y $160,427.79 que no son un proveedor de verdad |

---

## El iPhone (390 px)

| | Medido contra el código |
|---|---|
| Lista | Tarjetas bajo `lg` (1024) — correcto, es el mismo corte que arregló los 249 px de arrastre del iPad |
| **Chips de empresa** | **8** (Todas + 7), cada uno `min-h-[44px]` + `px-4` → **2 filas completas de la pantalla antes de ver un solo número** |
| Nombre del proveedor en la tarjeta | `text-xs` (13 px) + `truncate` — decisión tomada a propósito para los 3 nombres largos |
| Ficha | Tabla de 3 columnas, entra |
| Botón «Exportar Excel» | `min-w-[132px]`, comparte fila con el conteo |
| Táctiles | Todos ≥44 px |

⚠️ **No medido en el navegador.** Sale de leer las clases, no de abrir un iPhone.
Lo más caro a 390 px son los **8 chips**: hay que bajar dos filas para llegar al primer monto.

---

## Lo que sobra · lo que falta

**Sobra:**

| Qué | La medición que lo prueba |
|---|---|
| La columna «Último pago» | vacía en 53 de 65 filas (82%) |
| La columna «Empresas» | miente en 12 de 47 filas |
| «Ver 13 sin saldo» | 13 filas en $0.00 |
| 9 filas que son el propio grupo | $160,427.79 = 3% del total, 19% de las filas |
| 3 chips de empresa | 5% del dinero entre los tres |

**Falta:**

| Qué | La medición que lo prueba |
|---|---|
| **Una lista de equivalencias de nombre** | 5 grupos partidos; Boston en 3 filas de 5 empresas |
| Ordenar por columna | 73% del dinero en la columna que no se ordena |
| Ver la antigüedad real sin abrir fichas | 56% del dinero tiene +271 días y la lista no lo dice |
| Poder corregir un correo | 0 verbos de escritura; hay que ir a Switch |
| Un aviso si un proveedor grande se congela | El sync está sano (14/14) pero nadie vigila esta tabla en `silencio-de-datos.ts` |

---

## Preguntas para Daniel

**1. La cédula `655-544-133465` la tienen CINCO filas: cuatro dicen «Confecciones Boston» (con
distinta escritura) y una dice `FASHION WEAR, INC` con $76,165.72. ¿Son la misma empresa?**
a) Sí, es Boston mal escrito en Multifashion → una sola fila de $80,331.68 ·
b) No, son dos empresas y la cédula está mal copiada en una · c) No sé, hay que preguntarle a la
contadora.
→ **No recomiendo nada: esto no lo puedo saber desde aquí y adivinarlo sería inventar un dato.**
Es la primera pregunta que hay que contestar, porque de ella depende si el total de Boston son
$4,165.96 o $80,331.68.

**2. Hoy los proveedores se juntan por el NOMBRE. La cédula tampoco alcanza sola (28% de las
filas no la tienen o la tienen en basura, y el proveedor más grande —American Fashion Wear,
$3,633,293.25— tiene dos cédulas por un guion de más). ¿Cómo lo arreglamos?**
a) Una **lista escrita a mano** de «este nombre y este otro son el mismo proveedor», igual que la
que ya hicimos con Reynaldo en Comisiones · b) Unir por cédula · c) Dejarlo como está.
→ **Recomiendo (a).** Es el único camino que no rompe nada: (b) partiría en dos al proveedor de
$3,6 millones, y hoy son **5 grupos** los que hay que corregir — una tarde de trabajo, no un
proyecto. Y es la regla de la casa: nada se ata por parecido.

**3. La columna «Último pago» dice «—» en 27 de las 34 filas con saldo. No tiene arreglo: Switch
no manda los pagos ya cerrados. ¿Qué hago con ella?**
a) La quito de la lista y del Excel, y la dejo solo en la ficha · b) La dejo pero la llamo
«Último pago pendiente de aplicar» · c) La dejo como está.
→ **Recomiendo (a).** Una columna que está vacía 4 de cada 5 veces ocupa ancho en el celular y
no ayuda a decidir. En la ficha, con espacio para explicarla, sigue teniendo sentido.

**4. Nueve de las 47 filas son empresas del propio grupo (Boston, Vistana, Active Wear, Fashion
Shoes Holdings, Joystep, Active Shoes, Fashion Wear Inc): $160,427.79. ¿Van en la misma lista?**
a) Se quedan mezcladas · b) Se separan en un bloque «Entre nosotros» al final ·
c) Se sacan del total del grupo.
→ **Recomiendo (b).** Son plata de verdad y hay que verlas, pero no son un proveedor: mezclarlas
hace que «a quién le debo más» tenga 9 respuestas falsas. Separarlas no cambia ningún número.

**5. El 56% de lo que el grupo debe tiene más de 271 días ($2,933,987.57), y la lista lo mete
todo en una sola columna «121d+». ¿Abro esa columna?**
a) Parto «121d+» en «121-365» y «+1 año» · b) Dejo los 3 tramos y hago que se pueda ordenar por
ellos · c) Las dos.
→ **Recomiendo (c).** Con 89% del dinero en 2 proveedores, la lista ya contesta «quién»; lo que
no contesta es «desde cuándo», que es la pregunta que decide a quién pagarle primero.

**6. El total dice «Por pagar · grupo $5,199,705.82» y suma Multifashion con las 6. En Gastos
la regla es que las empresas nunca se suman entre sí. ¿Aquí sí se suman?**
a) Sí, se suman (queda escrito como decisión) · b) No: Multifashion aparte, como en su módulo ·
c) Se suman pero el rótulo dice «7 empresas».
→ **Recomiendo (a) escrito.** Multifashion es 2% y a un proveedor se le paga desde donde se le
compre; lo que falta no es cambiar el número, es que la decisión quede escrita para que nadie la
«arregle» después.
