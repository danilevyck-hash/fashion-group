# Proveedores — el porqué

> Post-mortem del módulo `/proveedores` (un proveedor, una fila — 6-sep-2026; la lectura caída y el rótulo del cartel — 11-sep-2026; **la lista dada vuelta — 20-sep-2026**). Nació el 14-sep-2026 al mover acá, verbatim, lo que CLAUDE.md decía.

---

## La lista dada vuelta (20-sep-2026)

Daniel aprobó dar vuelta la pantalla entera. Seis cosas, medidas contra producción el mismo día: **67 filas** en `switch_proveedor_estadocuenta`, **$4.829.819,40** de cartera, **31 proveedores distintos** con saldo.

### 1 · La lista son las empresas, no los proveedores

🩸 **Qué pasaba.** La lista eran los 31 proveedores del grupo, ordenados por lo que se les debe, y una columna decía de qué empresas venía cada uno. Eso contesta *«¿a quién le debo más?»*, que nadie pregunta así: **la contadora paga POR EMPRESA** —cada una tiene su banco, su chequera y su caja—, y para saber qué le debe Fashion Wear tenía que leer 31 filas buscando cuáles la nombraban.

Ahora son **siete filas**, con estas columnas: **Empresa · 0-90D · 91-120D · 121-365D · +1 año · Por pagar**, y el total al pie. Medido el 20-sep-2026:

| Empresa | Por pagar | Proveedores con saldo positivo |
|---|---|---|
| Fashion Wear | 1.978.200,62 | 11 |
| Fashion Shoes | 1.346.422,77 | 1 |
| Vistana International | 924.852,62 | 5 |
| Active Shoes | 344.052,42 | 3 |
| Multifashion | 141.931,04 | 7 |
| Active Wear | 73.170,74 | 4 |
| Joystep | 21.189,19 | 4 |
| **Total** | **4.829.819,40** | **31 distintos** |

⚠️ **Fashion Wear tiene además una fila con saldo a favor** (`TRANSPORTE Y SERVICIOS JEDIDAS`, −$5.290,04): la pantalla dice «12 proveedores con saldo» porque el crédito también es saldo. La tabla de arriba cuenta solo los positivos, que es como se dictó.

⚠️ **Boston no aparece y es correcto.** Tiene `cxp: false` en `EMPRESA_SYNC_CAPABILITIES`: su CxP no se trae, tiene 0 filas, está excluida a propósito. No se agrega.

🔴 **Las empresas salen de `empresasConCxp()`, NUNCA de las filas que llegaron.** Si salieran de las filas, la empresa cuyo sync se cayó se caería de la pantalla y nadie lo notaría: se vería una lista completa a la que le falta una fila. Así, sale en cero y su desplegado dice «Todavía no hay proveedores traídos de Switch para esta empresa». Candado: *«una empresa SIN datos sigue en la lista, en cero»*.

🔴 **Todo total es la SUMA de lo de abajo.** El de la empresa es la suma de sus proveedores —**incluidos los que están plegados en cero**, que pueden tener tramos vivos que se cancelan entre sí— y el del pie es la suma de las empresas. Derivarlos es lo único que impide que se separen. Los dos tienen su mutación.

### 2 · Tocar la empresa la despliega, y «también en …»

La empresa abierta vive en `?empresa=` (`useUrlState`, **replace**: es el mismo nivel, el Back no cicla por las siete). El enlace se puede compartir y sobrevive al refresco. La empresa que ya estaba abierta se cierra al tocarla otra vez.

Adentro, un renglón por proveedor con las MISMAS columnas, y los que están en cero se pliegan bajo «Ver N sin saldo» — se pliegan, no se esconden.

🔴 **«también en Fashion Shoes» reemplazó a la columna «Empresas».** Es el mismo dato, puesto donde sirve: en la fila del proveedor, dentro de la empresa que se está mirando, con cada nombre como **botón que abre ESA empresa**. Por eso frena el clic de la fila (`stopPropagation`), que va a la ficha del proveedor; hay mutación que lo comprueba y un CONTROL que exige que la fila sí abra la ficha.

Solo se nombran las empresas donde el proveedor **tiene saldo**: mandar a la contadora a una fila en cero es ruido, no un dato. Medido, el caso real: **American Fashion Wear** en Fashion Wear dice «también en Fashion Shoes»; **Confecciones Boston** en Joystep dice «también en Fashion Wear y Multifashion» (en Active Shoes y Vistana está en cero, y por eso no se nombran).

### 3 · Cuatro tramos, no tres

🩸 Switch manda **OCHO** tramos y la pantalla los condensaba en **TRES** (`lib/proveedores-aging.ts`, el vocabulario de aging del CXC): todo lo de más de 120 días caía junto en «121D+». Eso escondía algo grande.

```
Fashion Wear · Por pagar $1.978.200,62
  0-90D       -$208.985,74
  91-120D     -$166.039,56
  121-365D   $1.048.618,45
  +1 año     $1.304.607,47   ← el 66 % de la deuda, escondido dentro del
                                mismo «121D+» que la deuda de cuatro meses
```

Los cuatro son sumas de los ocho y nada más:

```
0-90D     = 0-30 + 31-60 + 61-90
91-120D   = 91-120
121-365D  = 121-180 + 181-270 + 271-365
+1 año    = Mas de 365
```

🔴 **Ningún número cambia: solo se reparten distinto.** Medido en las 67 filas: la suma de los ocho buckets es **igual a `saldo_total` fila por fila**, sin una sola diferencia. Por eso el total de los cuatro tramos ES el «Por pagar», y el candado `proveedores-cuadre` lo exige empresa por empresa con los ocho buckets reales de cada una.

⚠️ Un bucket que Switch no manda hoy cae en el **más viejo**, que es exactamente lo que hacía `agingKeyForBucket` («todo lo que no es 0-90 ni 91-120 es el de arriba»). No es estético: es la única forma de que el total no pierda un centavo si Switch agrega uno. Los ocho de hoy están enumerados y su reparto tiene una prueba por bucket.

🩸 **`lib/proveedores-aging.ts` y `buildList` se BORRARON**, al revés de lo que se hace con las tablas (`mayor_lineas`) y con `lib/proveedores/rotulo.ts`: lo que hacían —condensar en los tres del CXC— es exactamente lo que se corrigió, así que dejarlos ahí sería dejar a mano la función que hay que no volver a usar. `fetchAllProveedorRows` y `buildFicha` no se tocaron.

### 4 · Lo que está a favor se ve

🩸 **Fashion Wear tiene saldo a favor en CINCO de los ocho tramos** con American Fashion Wear (0-30, 31-60, 61-90, 91-120 y 181-270: −$420.201,51 medidos el 20-sep-2026; la empresa entera, −$426.927,46). Ese crédito se restaba dentro del «Por pagar» y desaparecía: quedaba un número neto sin decir de qué está hecho.

Ahora la fila desplegada dice:

```
Le debes $2.405.128,08 · Tienes a favor $426.927,46 · Por pagar $1.978.200,62
```

🔴 **`por_pagar` SIEMPRE se DERIVA de los otros dos** (`cerrarPartido`, en `lib/proveedores/tramos.ts`). Guardarlo aparte es cómo dos números de la misma fila terminan sin cuadrar.

🔑 **Sin nada a favor la frase no se dibuja**: una frase de tres partes con un cero adentro es ruido, y el «Por pagar» solo ya lo dice todo. Sale en la empresa y en el proveedor que lo tenga, y también al pie del grupo.

Es el mismo criterio del CXC con los clientes con saldo a favor, que la pantalla muestra en su bloque aparte y el papel ya no esconde (`lib/cxc/descargas.ts`, 20-sep-2026): **el neto se queda igual, pero se dice de qué está hecho**.

### 5 · Se fueron las ocho pestañas y el buscador

Daniel, textual: *«¿por qué buscar proveedor si ya está todo en la lista? solo es desplegar»*.

Con siete filas desplegables todo está a un toque: las pestañas de empresa **son** las filas, y el buscador filtraba algo que ya se ve entero. Arriba queda **UNA línea**:

```
Actualizado: 20 sept 2026, 4:32 a m        [Descargar Excel]  [Actualizar ahora]
```

🩸 **«Actualizado» es lo que la pantalla NO decía nunca.** Mostraba $4.829.819,40 de deuda sin una palabra sobre de cuándo es el número, y el CxP se sincroniza 1×/día (09:30 UTC). El prefijo es el MISMO del resto del sistema (`components/shared/SyncStatus.tsx`), la hora es la de **Panamá** —el servidor corre en UTC— y 🔑 **sin fecha no se afirma nada**: devuelve `null` y la línea no se dibuja, nunca «Actualizado: —».

⚠️ `?empresa=` **sigue vivo, pero significa otra cosa**: ya no filtra, es la empresa DESPLEGADA. La ruta dejó de leer `?empresa=` y `?q=`; un enlace viejo con esos parámetros contesta 200 con la cartera entera.

🩸 `lib/proveedores/rotulo.ts` queda **rotulado y sin lectores** (patrón de `documentos-chicos.ts` y `csv-export.ts`): existía para nombrar el cartel según el filtro, y ya no hay filtro que lo cambie. La regla que enseñó —un rótulo que miente sobre un monto es peor que no tener rótulo— sigue valiendo para cualquier cartel con filtro encima, así que no se borra. Hay barrido que exige que siga sin importadores.

### 6 · El rojo se va

🩸 Los tramos se pintaban con el vocabulario de color del CXC: ámbar «vencido reciente», rojo «vencido crítico». Medido el 20-sep-2026, eso dejaba **$3.035.153 en rojo** sin nada que lo sostenga.

🔑 **En CxP no existe ni plazo ni fecha de vencimiento en el dato.** Switch manda la EDAD del documento desde su emisión —`0-30`, `271-365`, `Mas de 365`— y nada sobre cuándo hay que pagarlo. Un documento de 400 días con 18 meses de crédito no está vencido; uno de 40 con pago contra entrega, sí. El color decía lo segundo sin tener con qué.

Es la misma regla que el papel que lee el cliente en el CXC tiene por escrito desde el 9-sep-2026 (`cxc-papel-vocabulario`): «vencido» está prohibido donde `dias` es edad. Acá el que hablaba era el color.

Queda (`lib/proveedores/tono.ts`):

- **un solo tono** para todo lo que se debe, sea de un mes o de tres años;
- el **tramo más viejo en negrita**, que es el peso que el rojo daba de más;
- el cero en gris claro y dibujado como «—», que ya era así;
- el **negativo en azul**, porque eso no es edad: es saldo a favor, el mismo azul con el que el CXC nombra el crédito de un cliente.

Se aplicó también a la ficha del proveedor (`/proveedores/[key]`), que pintaba los ocho buckets con el mismo criterio. **Controles que se quedan**: el aviso de lo que Switch rechazó sigue en ámbar (no se rompió nada, el problema está en Switch) y el de la lectura caída sigue en rojo (eso sí falló).

### El Excel

🔴 *«si así se ve el módulo, así mismo se debe de descargar»*: una fila por EMPRESA en negrita y debajo sus proveedores con sangría, los cuatro tramos, «Por pagar», «Le debes», «Tienes a favor», «Último pago» y «También en», y el total del grupo al pie.

🩸 **La fecha va como fecha.** «Último pago» decía «hace 13d»: un texto que no se puede ordenar, ni filtrar por rango, ni restar — y que además envejece mal, porque el archivo guardado el mes pasado sigue diciendo «hace 13d». Ahora va `fmtFechaExcel` (dd/mm/yyyy), que es lo que el archivo puede afirmar para siempre.

⚠️ **Sale lo que está en pantalla, COMPLETO**: los proveedores con saldo y los que están en cero. Un archivo no se recorta por lo que esté plegado. Tiene mutación.

Los encabezados de los tramos salen de la MISMA lista que la pantalla (`TRAMOS`): una segunda copia es cómo la hoja termina diciendo tramos que ya no existen.

### Lo que NO cambió

🔴 **Quién es quién.** La identidad de una fila la sigue diciendo `aplicarAmarre` (`lib/proveedores/identidad.ts`) y nadie más: la lista escrita a mano en `proveedor_amarre`, nunca el nombre y **NUNCA la cédula**. El grano sigue siendo `(empresa_key, proveedor_switch_id)`. En la pantalla nueva se usa para dos cosas: juntar las grafías del mismo proveedor DENTRO de una empresa, y saber en qué OTRAS empresas está.

El candado de identidad (`proveedores-identidad.test.ts`, 32 mutaciones) se apuntó al camino vivo: sus asertos de pantalla ahora corren contra `buildPorEmpresa` en vez de contra el `buildList` borrado. Lo que medía la búsqueda se retiró con el buscador.

`nombreParaMostrar` se mudó a `identidad.ts` —el amarre manda; si no, la grafía más larga con los espacios repetidos colapsados— porque ahora lo leen dos módulos, y un segundo criterio de nombre es cómo dos pantallas terminan llamando distinto al mismo proveedor.

### Candados y verificación

`proveedores-identidad` · `proveedores-cuadre` · `proveedores-cuatro-tramos` · `proveedores-sin-rojo` · `proveedores-arriba-una-linea` · `proveedores-una-fila-por-proveedor` · `proveedores-error-y-rotulo` · el bloque de `excel-exports-operacion`.

Verificación por mutación: `scripts/_mutar-candados-proveedores-por-empresa.sh` — **26 mutaciones, 26 cazadas**, con 2 controles que pasan. Cinco se escapaban en la primera pasada y cada una recibió su prueba: la empresa sin datos que desaparecía, el total que dejaba afuera a los plegados, el enlace «también en» que además abría la ficha, y el Excel que se recortaba por lo plegado.

Medición contra producción: `scripts/_medir-proveedores-por-empresa.ts` (solo lectura; corre el MISMO `buildPorEmpresa` de la ruta y comprueba los tres cuadres).

### Pendiente de Daniel

- La pantalla dice «N proveedores con saldo» contando también a los que están **a favor** (hoy, 31 distintos en el grupo). La tabla que él dictó cuenta solo los positivos. Es una diferencia de conteo, no de plata.
- `CLAUDE.md` quedó a **129.987 caracteres** de un tope de 130.000: trece de margen. La próxima regla que entre no cabe sin mover detalle de otro módulo a su postmortem.

---

## Lo que decía CLAUDE.md hasta el 14-sep-2026 (movido acá, verbatim)

> El 14-sep-2026 CLAUDE.md pasaba de 333 mil caracteres (el tope del harness es 150 mil) y las instrucciones se cortaban a la mitad. Se dejó ahí un resumen de las reglas vigentes y el texto completo —mediciones, citas de Daniel, candados y mutaciones— se movió acá sin cambiar una palabra.

### Proveedores — un proveedor, una fila (6-sep-2026)

- 🔴 **QUIÉN ES QUIÉN SALE DE UNA LISTA ESCRITA A MANO** (`proveedor_amarre`), no del nombre y no de la cédula. Daniel, textual: *«no te fijes por la cédula, solo por nombre para saber cuáles son iguales»*. Es el mismo camino que las grafías de Reynaldo en Comisiones. **Nada por parecido**: ni distancia de edición, ni trigramas, ni fonética.
- 🩸 **LA CÉDULA MIENTE EN LAS DOS DIRECCIONES.** De los seis grupos de filas que comparten identificación, **TRES son empresas distintas** — `FASHION WEAR, INC` ($76.165,72) **no es** Confecciones Boston (*«fashion wear no es boston»*), `CIF EXPRESS SA.` no es `Luis Alberto Torres De Gracias`, `ACTIVE SHOES S.A` no es `BDL SERVICES INC`. Y al revés: **American Fashion Wear, el proveedor más grande ($3.633.293,25), tiene DOS cédulas** que difieren en un guion, así que unir por cédula lo partiría en dos. En los tres casos **Switch tiene la cédula mal**; queda escrito en el código y en la migración para quien mantenga Switch.
- 🔴 **El grano es `(empresa_key, proveedor_switch_id)`** — la UNIQUE de la tabla, la llave del upsert del sync y la de su purga. El **código solo NO es identidad**: 10 códigos nombran proveedores distintos según la empresa. El par `(empresa, código)` sí distingue las 65 filas de hoy, pero `codigo` es nullable y lo teclea una persona en Switch.
- ⚠️ **`switch_proveedor_estadocuenta` no tiene soft delete** y el sync borra de verdad lo que Switch deja de listar. Por eso el amarre vive en **su propia tabla**: si un proveedor se cae del estado de cuenta y vuelve, el amarre sigue valiendo.
- **CUATRO grupos confirmados y nada más**: ACTIVE WEAR ($52.479,52) · GRUPO J NAVARRO ($0,00) · **CONFECCIONES BOSTON** (sus 4 grafías en 5 empresas, $4.165,96) · LATIN FITNESS GROUP ($288.358,84). Medido: la lista pasa de **47 filas a 43** (34 con saldo → 31) y el total **$5.199.705,82 no se mueve ni un centavo** — esto reagrupa, no cambia plata.
- **La pantalla muestra UN proveedor por fila y DE QUÉ EMPRESAS viene** (nombres cortos). Antes esa columna era un número pelado que además mentía. El buscador mira **todas las grafías**, no solo la que se enseña. *(⚠️ Superado el 20-sep-2026: ver arriba. La regla se mudó adentro de la empresa y el buscador se retiró.)*
- 🩸 **UNA LECTURA CAÍDA SE DICE, NO SE DISFRAZA DE «no hay nada» (11-sep-2026).** El `fetch` de la lista ignoraba todo lo que no fuera 200 —sin guardar el error y sin reintentar—, así que cualquier fallo dejaba la pantalla con **«Sin proveedores — No hay datos sincronizados aún»**: con $4.696.830,50 en la cartera, decirle a la contadora que no hay datos es la peor respuesta posible. Ahora dice **«No se pudo cargar. Intenta de nuevo en unos segundos»** con su botón de 44 px, y **lo que ya estaba en pantalla no se borra**.
- 🩸 **EL CARTEL GRANDE DICE DE QUÉ ES SU NÚMERO (11-sep-2026).** Con una búsqueda escrita el total ya era el de lo buscado y el rótulo seguía diciendo «Por pagar · **grupo**»: escribir «boston» dejaba en pantalla `Por pagar · grupo $4,165.96`. La regla vive en un módulo puro (`lib/proveedores/rotulo.ts`) y **la búsqueda manda sobre el chip de empresa**, que es el filtro más fino; lo buscado se muestra **tal como se tecleó**, solo sin bordes. Candado: `proveedores-error-y-rotulo.test.ts`. *(⚠️ Retirado el 20-sep-2026 con el buscador: el módulo queda rotulado y sin lectores.)*
- Candados: `proveedores-identidad.test.ts` · `proveedores-una-fila-por-proveedor.test.tsx`; **32 mutaciones, 32 cazadas** (`scripts/_mutar-candados-proveedores-identidad.sh`, con 2 controles); medición `scripts/_medir-proveedores-amarre.mjs`.
