# Vista General — el mapa

> Medido contra producción el **5-sep-2026**. Ningún número sale de la documentación.
> Pantalla: `/vista-general`. Ruta: `/api/dashboard/vista-general`.

---

## 1. Qué es, quién entra, cuánto se usa

**Qué es.** La primera pantalla del dueño: un mes a la vez, con seis tarjetas arriba
(Ventas · Margen · Disponibilidad · Inventario · Por cobrar · Por pagar), dos paneles
al medio (Inventario por empresa · Gastos por empresa), la lista «Rentabilidad por
empresa» y tres cajas de «Requiere tu atención». Es **solo lectura**: no tiene ni un
botón que escriba nada.

**Quién entra — medido, no copiado.**

| Dónde | Qué dice |
|---|---|
| `src/lib/modules.ts:76` | `roles: ["admin"]` |
| `src/app/api/dashboard/vista-general/route.ts:169` | `requireRole(req, ["admin"])` |
| `role_permissions` (producción) | **`vista-general` no está en ninguna fila.** Ninguna de las 7 filas la nombra |
| `fg_users` (producción) | 2 admin: **daniel** (dueño) y **alberto** |

Coincide página ↔ API. La clave `vista-general` no vive en `role_permissions` porque
admin pasa siempre por `requireRole.ts:33`; el día que quieras dársela a otro rol, hoy
no hay dónde encenderla sin tocar código.

**Cuánto se usa.**

| Usuario | Sesiones totales | Últimos 30 días | Última |
|---|---|---|---|
| daniel | 336 | **95** | 6-sep-2026 |
| alberto | 15 | **1** | 4-sep-2026 |

⚠️ **Cuántas veces se abrió esta pantalla: NO MEDIDO, y no se puede.** La ruta
`/api/dashboard/vista-general` **no llama `logActivity` ni una vez** — 37 carpetas de
`src/app/api/` sí lo hacen, esta no. En `activity_logs` (2.821 filas) no existe ni una
entrada de este módulo. La única señal es que daniel entra a la app casi a diario.

---

## 2. Los datos, medidos

Lo que la pantalla muestra HOY (mes por defecto = **septiembre 2026**, día 5 de 30):

| Tarjeta | Valor medido | De dónde sale | Estado |
|---|---|---|---|
| **Ventas** | **$46.959,14** · «▼ 82.9% vs 1–5 sep 2025» | `ventas_dashboard_summary_v2(2026)`, 8 empresas | 🩸 ver #1 |
| **Margen bruto** | **31.1%** · $14.622,00 utilidad | mismo RPC | ok |
| **Disponibilidad** | **$629.531,03** · «al 31 jul» | `bancos_saldos`, último por empresa | 🩸 ver #4 |
| **Inventario** | **$2.956.530,83** al costo · 207.943 piezas · al 5 sep | `switch_articulo_info` | ok |
| **Por cobrar (CXC)** | **$3.676.935,55** · $2.138.144,69 con +90 días (**58,1%**) | `switch_estadocuenta_aging` | ok, pero ver #3 |
| **Por pagar (CXP)** | **$5.199.705,82** · $4.148.555,48 vencido (**79,8%**) | `switch_proveedor_estadocuenta` | ok, pero ver #3 |

**Los dos paneles del medio, en septiembre:**

| Panel | Filas | Con número | Sin número |
|---|---|---|---|
| Inventario por empresa | 6 | **6** ($1.420.117,95 Fashion Wear · $675.918,42 Fashion Shoes · $635.460,91 Vistana · $145.516,82 Active Shoes · $78.157,52 Joystep · $1.359,21 Active Wear) | Boston y Multifashion, con el motivo escrito |
| **Gastos por empresa** | 8 | **0** | **8** |

**«Rentabilidad por empresa» en septiembre: 8 filas, 8 píldoras «Sin gastos cargados», 0 rentabilidades.**

**Por qué.** `egresos_varios` medida hoy:

| Mes | Empresas con renglones | Renglones |
|---|---|---|
| ene-2026 | 5 | 144 |
| feb-2026 | 5 | 111 |
| mar-2026 | 5 | 117 |
| abr-2026 | 5 | 88 |
| may-2026 | 5 | 99 |
| jun-2026 | 4 | 78 |
| **jul-2026** | **4** | **72** |
| **ago-2026** | **0** | **0** |
| **sep-2026** | **0** | **0** |

**Joystep, Multifashion y Confecciones Boston tienen 0 renglones en toda la historia de la tabla.**
El último mes con algún gasto es **julio, y con 4 de 8 empresas** — un atraso de **2 meses**.

**Requiere tu atención** (los tres son listas recortadas):

| Caja | Cuántos hay de verdad | Cuántos se ven | El badge dice |
|---|---|---|---|
| Clientes con saldo +90 días | **152** | 6 | **6** |
| Proveedores con saldo vencido +90d | **27** | 6 | **6** |
| Reclamos sin pagar (+30 días) | **28** (29 sin pagar; el más viejo del 2-feb-2025, **581 días**) | 8 | **8** |

**Las dos reglas de Boston, verificadas en las dos direcciones:**
- ✅ **Su plata suma.** `ALL_EMPRESA_KEYS` (`empresa-mapping.ts:138`) trae `confecciones_boston`; en agosto aportó **$45.153,10** a las Ventas de Vista General.
- ✅ **Sus clientes no se ven.** La vista `switch_estadocuenta_aging` lleva
  `WHERE … s.empresa_key <> 'confecciones_boston'` en su propio cuerpo. Las 6 empresas
  del grupo son las únicas que aparecen en la tarjeta CXC.

---

## 3. Cuánto cuesta hacer las cosas

Las tareas reales de esta pantalla (es de mirar, no de hacer).

### Tarea 1 — «Entrar y entender cómo va el negocio»

| Hoy | |
|---|---|
| Toques | **2** (Inicio → Vista General) |
| Pantallas | 1 |
| Campos a escribir | 0 |
| **Números en pantalla** | **~62** |
| **Números que cambian una decisión** | **6** |
| Filas vacías que hay que leer para descartar | **16** (8 de Gastos + 8 de Rentabilidad) |

Los ~62: 12 en las tarjetas de arriba, 21 en Inventario por empresa (6 empresas × piezas
+ precio de etiqueta + costo, más el total), 8 ventas en Rentabilidad, 20 en las tres
cajas de atención, más fechas y conteos.

Los 6 que mueven algo: **la venta del mes y su Δ**, **$2,14 M por cobrar con +90 días**,
**$4,15 M por pagar vencido**, **el margen**, y **el reclamo de 581 días**.

Los otros ~56 no cambian ninguna decisión de hoy: el precio de etiqueta por empresa es
potencial (no plata), y las 16 filas vacías cuestan lectura y no dan nada.

**Versión más corta:** las mismas **2 pulsaciones**, pero de **62 números a ~14** —
las 6 tarjetas y las 3 listas con su conteo REAL. Inventario por empresa y Gastos por
empresa se doblan en un «Ver detalle» (1 toque más solo cuando lo quieras).

### Tarea 2 — «¿Quién me debe hace más de 90 días?»

| | Hoy | Podría ser |
|---|---|---|
| Toques | **3** (Inicio → Vista General → Ir a CXC) | 3 |
| Lo que ves antes de salir | **6 de 152 clientes**, y el badge dice «6» | 6 de 152, y el badge dice **152** |

El costo no está en los toques: está en que **el badge miente por un factor de 25**.
Ves «6» y crees que son seis.

### Tarea 3 — «¿Cuánto gastó Vistana este mes?»

| | Hoy | Podría ser |
|---|---|---|
| Toques | **2 + 2 flechas atrás + 1 (Ver gastos)** = 5 | 2 |
| Pantallas | 2 | 1 |
| Resultado | En el mes que abre (**septiembre**) hay **0 de 8**; en agosto, **0 de 8**; el primer número aparece **2 meses atrás** | La pantalla abre en **el último mes que SÍ tiene gastos** y lo dice |

**Este es el costo grande.** El mes por defecto es el actual, y el actual **nunca** tiene
gastos cargados: la contadora va 2 meses atrás. Dicho en números: en 2026 hubo **7 meses
con algún renglón de 8 posibles**, y **ninguno estuvo cargado el mes en que ocurrió**.
La mitad de abajo de la pantalla del dueño está vacía todas las veces que la abre.

### Tarea 4 — «¿Cómo cerró el mes pasado?»

| | Hoy |
|---|---|
| Toques | **3** (Inicio → Vista General → ← una vez) |
| Lo que obtienes | Ventas $788.475,49 · **+23,0%** vs agosto 2025 · margen 27,6% · CXC y CXP **de HOY, no de agosto** |

⚠️ Al retroceder de mes, **CXC, CXP, Disponibilidad, Inventario y Reclamos no se mueven**:
son fotos de hoy. Solo Ventas, Margen, Gastos y Rentabilidad respetan el mes. **La pantalla
no lo dice en ninguna parte.** Miras «agosto 2026» y cuatro tarjetas de seis son de septiembre.

### Lo que se repite

- El mes elegido **sí** vive en la URL (`?mes=`, `useUrlState`), así que se puede compartir. ✅
- **Nada más se recuerda**: no hay «último mes que miraste». Cada entrada arranca en el mes actual, que es el que no tiene gastos.

---

## 4. 🩸 Lo que miente o está roto

### #1 — 🩸 El primer número del día dice que el grupo cayó **82,9%**, y es el calendario, no el negocio

La tarjeta Ventas hoy: **$46.959,14** contra **$275.206,57** de los mismos días de 2025 →
**▼ 82.9%**.

Está bien calculado (los mismos días, día de Panamá, `ventas_dashboard_prev_same_period_v4`).
Lo que pasa es que **cinco días de venta mayorista no son comparables con otros cinco**.
Medido, día por día, en Fashion Wear + Vistana + Joystep:

| Fecha | Venta |
|---|---|
| 3-sep-**2025** | **$158.033,00** en un solo día |
| 1-sep-2025 | $70.630,65 |
| El mejor día de sep-**2026** hasta hoy (3-sep) | **$9.707,40** |

Una sola exportación del 3-sep-2025 explica más de la mitad de la diferencia. Con el mes
cerrado el número se acomoda solo: **agosto cerró +23,0%**.

`route.ts:245-253` · `page.tsx:200-213`

### #2 — 🩸 `CLAUDE.md` dice que Vista General suma los gastos entre empresas. **Ya no.**

`cxc/CLAUDE.md:253` dice: *«⚠️ Vista General SÍ suma gastos entre empresas — es otro
módulo, la suma es deliberada»*. **Es falso desde el 13-ago-2026.**

`gastos.total` **no existe en la respuesta** (`route.ts`, bloque «🔴 `gastos.total` YA NO
EXISTE») y la pantalla lo dice con todas las letras: *«Cada empresa con lo suyo: no hay un
total»* (`GastosPorEmpresa.tsx`). `rentabilidadGrupo` se borró de `vista-general-calc.ts`.

**Lo que sí se suma entre empresas** — y esto es lo que hay que decidir de verdad:

| Tarjeta | ¿Suma empresas? | Cuántas |
|---|---|---|
| Ventas | **Sí** | 8 |
| Margen | **Sí** | 8 |
| Disponibilidad (banco) | **Sí** | 7 de 8 |
| Por cobrar | **Sí** | 6 |
| Por pagar | **Sí** | 7 |
| Inventario | **Sí** | 6 |
| **Gastos** | **No** | — |
| **Rentabilidad** | **No** | — |

### #3 — 🩸 Tres badges que cuentan lo que se ve, no lo que hay

| Caja | Badge | Real | Factor |
|---|---|---|---|
| Clientes +90 días | 6 | **152** | ×25 |
| Proveedores vencidos | 6 | **27** | ×4,5 |
| Reclamos +30 días | 8 | **28** | ×3,5 |

`route.ts` corta con `.slice(0, 6)` / `.slice(0, 8)` y la pantalla pinta
`count={data.cxc.topClientes.length}` (`page.tsx:400`, `:417`, `:434`) — o sea, el largo
de la lista **recortada**. `reclamos.total` (29) sí viaja en la respuesta y **la pantalla
no lo dibuja nunca**.

### #4 — 🩸 «Disponibilidad $629.531,03 al 31 jul»: ni son todas, ni son de esa fecha

| Empresa | Saldo | Fecha del dato |
|---|---|---|
| Fashion Wear | $317.460,51 | 31-jul |
| Vistana | $132.870,42 | 31-jul |
| Fashion Shoes | $74.336,02 | **10-ago** |
| Active Wear | $60.678,97 | **10-ago** |
| Active Shoes | $27.647,97 | **10-ago** |
| Multifashion | $8.661,49 | 31-jul |
| Confecciones Boston | $7.875,65 | 31-jul |
| **Joystep** | **— (nunca cargó)** | — |

Tres cosas juntas: (a) el total mezcla dos fechas distintas; (b) la etiqueta muestra
**la más vieja** (`fechaMasVieja`, `route.ts`); (c) **falta una empresa entera y no se
dice**. La respuesta trae `cuentas: 7`, pero se llama «cuentas» y son EMPRESAS, y además
**la pantalla no lo pinta** (`page.tsx:250-256`).

### #5 — 🩸 Al retroceder de mes, cuatro tarjetas de seis siguen siendo de hoy

Ventas, Margen, Gastos y Rentabilidad respetan `?mes=`. **CXC, CXP, Disponibilidad,
Inventario y Reclamos no**: son fotos del momento y no se leen por mes.
En pantalla, arriba dice «Agosto 2026» y debajo hay $3,68 M por cobrar que son de hoy.
Ninguna de esas cuatro tarjetas lo advierte.

### #6 — 🩸 El comentario del código dice lo contrario de lo que hace

`route.ts:200-203`: *«CXC: vista base LIVE (igual que el módulo /admin), NO la MV diaria…
Leer la misma vista base garantiza Δ=0.00 con /admin siempre»*.

**`/api/cxc/aging` lee la MV**, no la vista: `src/app/api/cxc/aging/route.ts:165`
(`from("switch_estadocuenta_aging_mv")`, con caída a la vista en `:171`). O sea Vista
General lee la vista viva y Cuentas por Cobrar lee la materializada — exactamente lo que
el comentario dice que se evitó.

**Hoy los dos números coinciden al centavo** (vista $3.676.935,55 · MV $3.676.935,55), así
que el efecto es cero. Lo que está mal es el comentario, y es el tipo de dato viejo que
hace que el próximo cambio salga al revés.

### #7 — ⚠️ El mes por defecto se calcula con la hora del navegador, no con Panamá

`page.tsx:56-59`: `mesActual()` usa `new Date()` del navegador. El servidor usa
`hoyPanama()` (`route.ts:172`). Coinciden mientras Daniel esté en Panamá; abriendo la app
desde Europa el último día del mes, la pantalla pediría un mes que el servidor recorta.
No es de hoy, pero rompe la regla «Panamá UTC−5 fijo».

### #8 — ⚠️ El diccionario § 0, en dos puntos

| Regla (5-sep-2026) | Vista General | Cita |
|---|---|---|
| Plata negativa `−$100.00` (menos tipográfico) | escribe `-$1,235` con guion normal | `formato.ts:9` |
| Con centavos | redondea a dólar entero | `formato.ts:9`, `minimumFractionDigits: 0` |
| Porcentajes sin decimal | escribe `12.3%` | `formato.ts:24`, `.toFixed(1)` |
| Nombre de empresa **corto** | usa el largo: «Vistana International», «Confecciones Boston» | `route.ts` usa `EMPRESA_KEY_TO_NAME`; el mapa corto existe en `empresa-mapping.ts:35` |

Redondear a dólar en un tablero es defendible — pero **no está declarado como excepción
en ninguna parte**, y el mapa de nombres cortos ya existe y ya se aplicó en Clientes.

### ✅ Lo que está bien y conviene no tocar

- **Ningún cero grande.** Inventario sin lectura dice «No se pudo medir»; una empresa sin gastos muestra el motivo en palabras, nunca `$0.00`.
- **Cae abierto en todo**: si se caen los egresos, el inventario o el comparativo, la pantalla se dibuja entera y lo dice.
- **Las tres cifras de una empresa nunca se cruzan**: `rentabilidadEmpresa()` recibe UNA empresa y no puede ver las otras.
- **La partición de aging cuadra al centavo**: corriente $1.538.790,86 + vencido $2.138.144,69 = total $3.676.935,55. Ninguna fila con `dias` nulo o negativo (0 de 931).
- **Las notas de crédito restan** en la vista de aging (`saldo_signed`).

---

## 5. Coherencia con el resto del sistema

| Regla de la casa | Vista General | |
|---|---|---|
| Cero voseo en pantalla | **Limpio.** 0 hallazgos en texto | ✅ |
| Cero voseo en comentarios | **6 «acá»** en `route.ts` (el candado no los mira, pero son de otro dialecto) | ⚠️ |
| Excel por `workbookBytes`, desde la fila 1 | **No exporta nada.** La regla no aplica | — |
| Confirmación de borrado | No borra nada | — |
| Textos de vacío y de error | Siguen el patrón: *«No se pudo cargar la vista general. Intenta de nuevo en unos segundos.»* + Reintentar | ✅ |
| Botón principal | No tiene: es de solo lectura | — |
| Filtro en la URL con `replace` | `?mes=` con `useUrlState` | ✅ |
| Formato de plata | **3 diferencias** (ver #8) | 🩸 |
| Nombre de empresa corto | usa el largo | ⚠️ |
| «vs año pasado» = los mismos días | ✅ pasa por `prev-same-period.ts`, espejo de `clientes-corte-comparativo.ts` | ✅ |
| Un cero grande nunca | ✅ | ✅ |

---

## 6. El iPhone (390 px)

Es la pantalla **mejor resuelta del sistema** en celular — se nota que ya pasó por auditoría.

| Qué | Estado |
|---|---|
| Tarjetas KPI | `grid-cols-2` a 390 px, ~175 px cada una. El subtítulo **envuelve, no se corta** (`min-h-[2rem]`), a propósito para no perder «(parcial)» |
| Rentabilidad por empresa | **Cambia a tarjetas por debajo de `md`** — la tabla necesita 530 px y hay 356. Bien resuelto |
| Filas de «Requiere tu atención» | `min-h-[44px]`, texto a 13 px (piso de legibilidad, decisión tomada) |
| Enlaces «Ir a X →» | `min-h-[44px] min-w-[44px]` |
| Flechas de mes | 44 × 44 px |
| Gastos e Inventario por empresa | `truncate` en el nombre de la empresa; el número nunca se trunca (`shrink-0`) |

**Lo que sí molesta a 390 px:**
1. **La pantalla mide ~4 alturas de teléfono** y **16 de sus filas están vacías** (8 gastos + 8 rentabilidad). Hay que pasar por encima de todas para llegar a «Requiere tu atención», que es lo accionable.
2. Los nombres largos se cortan: «Vistana International» y «Confecciones Boston» no caben — el mapa corto lo arreglaría sin tocar nada más.

---

## 7. Lo que sobra · lo que falta

### Sobra

| Qué | La medición que lo prueba |
|---|---|
| **Las 16 filas vacías de Gastos y Rentabilidad en el mes en curso** | 0 de 8 empresas con número en septiembre, 0 de 8 en agosto. Nunca las hay el mes que abre |
| **El precio de etiqueta por empresa** ($4.303.289,50 repartido en 6 filas) | Es potencial, no plata. La propia pantalla lo aclara con un párrafo — si necesita un párrafo para no engañar, no debería estar arriba |
| **La bajada de 2 líneas del panel de Gastos** y la de Rentabilidad | Dos textos explicativos que existen solo para decir «no hay total». Si no hay total, no hay nada que aclarar |
| **La tarjeta Margen bruto como tarjeta propia** | Es utilidad ÷ ventas: las dos cifras ya están en la tarjeta de al lado |
| **La columna «Ventas» de Rentabilidad por empresa** | Repite lo que ya está en la tarjeta Ventas, empresa por empresa |

### Falta

| Qué | La medición que lo prueba |
|---|---|
| **Que el badge diga el número real** | 6 vs 152 · 6 vs 27 · 8 vs 28 |
| **Decir qué tarjetas son de HOY y cuáles del mes elegido** | 4 de 6 tarjetas no se mueven al cambiar de mes, y nada lo dice |
| **Que Gastos abra en el último mes que SÍ tiene datos** | Julio 2026, 2 meses atrás |
| **Que se sepa si esta pantalla se abre** | 0 registros en `activity_logs` |
| **Joystep en Disponibilidad, o que se diga que falta** | 7 de 8 empresas, sin aviso |
| **Una fecha por empresa en Disponibilidad** | Se mezclan 31-jul y 10-ago bajo una sola etiqueta |
| **Que los 8 renglones de gastos que nunca vendrán se retiren** | Joystep, Multifashion y Boston: **0 renglones en toda la historia** de `egresos_varios` |

---

## 8. Preguntas para Daniel

### 1. El primer número del día dice −82,9% y es porque el año pasado hubo una exportación grande el 3 de septiembre. ¿Qué quieres ver en los primeros días del mes?

- **a)** Dejarlo como está: los mismos días contra los mismos días, aunque el primer número del mes salte.
- **b)** Que con menos de 10 días del mes la tarjeta muestre **el mes pasado cerrado** (agosto: +23,0%) y la comparación del mes en curso quede abajo, en chico.
- **c)** Quitar la Δ del mes en curso y dejar solo el monto vendido.

**Recomiendo (b).** El mes cerrado es el único número comparable que tienes los primeros
días, y hoy hay que dar una pulsación atrás para verlo. El mes en curso no se pierde: baja
de tamaño. Es la misma idea del «no se opina cuando no se puede saber» que ya usa Asistencia.

### 2. Los gastos van 2 meses atrás y septiembre y agosto están en cero. La mitad de abajo de tu pantalla está vacía cada vez que entras.

- **a)** Dejarlo: las 8 filas con su motivo, como está.
- **b)** Que el panel de Gastos y el de Rentabilidad abran solos en **el último mes con datos** (julio) y lo digan arriba, sin que tengas que retroceder.
- **c)** Esconder los dos paneles cuando el mes elegido no tiene ni una empresa cargada, con un enlace «Ver julio, que es lo último cargado».

**Recomiendo (c) para el mes en curso y (b) para el resto.** Hoy lees 16 renglones vacíos
para enterarte de que no hay nada. Nada de esto toca cómo se guardan los gastos ni el
módulo Gastos: es solo qué mes abre.

### 3. Tres cajas dicen «6», «6» y «8». Los números reales son 152 clientes, 27 proveedores y 28 reclamos.

- **a)** Que el badge diga el total real y sigan viéndose 6 (u 8).
- **b)** Que diga el total real y además el monto: «152 clientes · $2,14 M».
- **c)** Dejarlo y sumar un «ver los 152 →».

**Recomiendo (b).** Es el cambio más barato de toda la pantalla y el que más cambia lo que
entiendes: hoy crees que son seis clientes atrasados y son ciento cincuenta y dos.

### 4. Al retroceder a agosto, cuatro de las seis tarjetas siguen mostrando datos de hoy (lo que te deben, lo que debes, el banco y el inventario).

- **a)** Dejarlo y marcar esas cuatro con «hoy» pegado al número.
- **b)** Que al elegir un mes cerrado esas cuatro se apaguen y digan «esto es de hoy, no de agosto».
- **c)** Guardar la foto de cada mes para poder mirar atrás de verdad (esto sí es trabajo nuevo y datos nuevos).

**Recomiendo (a).** Una palabra al lado del número resuelve el 100% del problema hoy
mismo. La (c) es un módulo nuevo y no lo has pedido.

### 5. Tres empresas —Joystep, Multifashion y Confecciones Boston— nunca han tenido un solo gasto cargado (0 renglones en toda la historia). Y Joystep tampoco tiene saldo de banco.

- **a)** Que sigan apareciendo en la lista con su motivo, como hoy.
- **b)** Sacarlas de Gastos y de Rentabilidad, y decir en una línea al pie: «Joystep, Multifashion y Boston no cargan gastos en el sistema».
- **c)** Dejarlas y que alguien empiece a cargarlas.

**Recomiendo (b) si no las vas a cargar, (c) si sí.** Es la única pregunta de las cinco
cuya respuesta yo no puedo saber: depende de si esas tres empresas van a registrar sus
gastos en Switch o no. Hoy le cuestan a la pantalla 3 filas vacías permanentes de 8.

### 6. La pantalla escribe los nombres largos («Vistana International», «Confecciones Boston»), redondea a dólar sin centavos y usa un guion normal en los negativos. El diccionario que definiste el 5-sep dice lo contrario.

- **a)** Alinearla entera con el diccionario: nombre corto, centavos, menos tipográfico, porcentajes sin decimal.
- **b)** Solo el nombre corto y el menos tipográfico; dejar el redondeo a dólar como excepción declarada del tablero.
- **c)** Dejarla como está hasta que le toque el turno.

**Recomiendo (b).** En un tablero de $3,7 millones, los centavos son ruido y ocupan ancho
en el iPhone; pero el nombre corto sí importa (hoy «Vistana International» se corta a
390 px) y el signo menos es la regla que ya cumple todo lo demás. Y quedaría escrito
por qué el redondeo es la excepción, que hoy no está en ninguna parte.
