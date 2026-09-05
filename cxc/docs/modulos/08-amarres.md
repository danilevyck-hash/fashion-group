# Los amarres — con qué llave se identifica a cada quién, módulo por módulo

> **Medido contra producción el 5-sep-2026** (Management API,
> `POST /v1/projects/rspocgqhtpveytgbtler/database/query`). Cada cifra trae abajo la consulta que la
> produjo. Nada de este archivo está copiado de otro documento: todo se volvió a preguntar.

## Por qué existe este archivo

El **5-sep-2026** Daniel preguntó si todo el sistema está amarrado por código, y la respuesta que se
le dio fue **falsa dos veces**:

| se le dijo | lo que es |
|---|---|
| «**Marketing no guarda el cliente**» | Lo guarda: `mk_proyectos.tienda_codigo`, **19 de 25 filas**, y las 19 cruzan con `clientes_master` |
| «Los pedidos de catálogo **guardan el nombre en texto**» | Guardan `cliente_switch_id`, que resuelve al código por `switch_clientes (empresa_key, cliente_switch_id)` — **51 de 56 pedidos vivos**, y los 51 resuelven |

Daniel, textual: *«mira como te equivocas sin tener contexto… quiero que te tomes dos horas
recopilando información para que estas cosas no vuelvan a suceder que me digas una info falsa, yo
confío en ti y debes estar al tanto hasta más que yo del sistema»*.

Los dos errores tienen la misma forma: **suponer que un módulo no tiene la llave, sin ir a mirar la
tabla del propio módulo.** Este archivo es la respuesta a esa pregunta, medida, en una sola tabla.

## Cómo leerlo

El sistema maneja **cuatro clases de «quién»**, y cada una tiene su propia llave:

| quién | la llave buena | dónde vive el padrón | ¿es única en todo el grupo? |
|---|---|---|---|
| **Cliente** | `codigo` (`D-24`, `D-142`…) | `clientes_master` (150 vivos) | ✅ **Sí.** Daniel: *«todos los D-24 por ejemplo son de City Mall across mis 6 empresas»* |
| **Proveedor** | `codigo` **+ empresa** | `switch_proveedor_estadocuenta` (65 filas) | 🔴 **NO.** El código es de la empresa, no del proveedor |
| **Empleado** | `empleado_codigo` (`8`, `23`, `43`…) | `asistencia_personas` (40 fichas) | ✅ **Sí**, es el número del reloj |
| **Vendedor** | 🔴 **no hay llave en uso**: se usa el NOMBRE canonizado | `comision_vendedor_alias` + `vendedores` (16 filas) | 🔴 **No.** Ver § Los eslabones sueltos |

Y **tres formas de guardar la llave**:

- **Código directo** (`cliente_codigo`, `empleado_codigo`, `tienda_codigo`, `proveedor_codigo`) — lo
  más fuerte: no hay que traducir nada.
- **Puente por id de Switch** (`cliente_switch_id`) — hay que pasar por
  `switch_clientes (empresa_key, cliente_switch_id) → codigo`. Es firme, pero **el par completo es
  obligatorio**: el id solo no dice nada, porque cada empresa numera aparte.
- **Nombre en texto** — lo frágil. A veces es lo único que hay.

---

## La tabla — una fila por módulo

| módulo | tabla | con qué llave identifica | cuántas la traen | qué pasa con las que no |
|---|---|---|---|---|
| **Cuentas por Cobrar** — el documento | `switch_estadocuenta` | `cliente_codigo` (+ `cliente_switch_id`) | **2.759 de 2.759** (100%) | — |
| **Cuentas por Cobrar** — la cartera | `switch_estadocuenta_aging` (vista) | `codigo`; une a `clientes_master` **por código** (`m.codigo = sec.cliente_codigo`) | **211 de 211**, 100 clientes, **0 sin maestro** | — |
| 🔴 **Cuentas por Cobrar** — notas y bitácora | `cxc_client_overrides` (10) · `cxc_contact_log` (141) | **`(cartera, nombre_normalized)` — un NOMBRE** | 10 y 141, **ninguna con código** | Ver § Los eslabones sueltos, #1 |
| **Cuentas por Cobrar** — correos mandados | `cxc_emails_enviados` | `cliente_codigo` | **19 de 19** | — |
| **Boston** — su cartera | `switch_estadocuenta_aging_boston` (vista) | `codigo` **de Boston**, que **no es el del grupo** | 390 de 390 | Sus códigos no existen en `clientes_master`. Ver § #2 |
| **Guías de Despacho** | `guia_items.cliente_codigo` | `cliente_codigo` | **451 de 566** (80%) | 115 renglones van a un destino que no está en el directorio. **Elegir cliente no es obligatorio, a propósito** |
| **Guías** — destinos definidos | `guias_destino_cliente.cliente_codigo` | `cliente_codigo` | **34 de 34** (100%) | — |
| **Recordatorios** — cheques | `cheques.cliente_codigo` | `cliente_codigo` | **19 de 19** (100%) | — |
| **Recordatorios** — el renglón libre | `recordatorios.cliente_codigo` | `cliente_codigo` | **1 de 1** | Tabla recién estrenada |
| **Catálogos** — Reebok | `reebok_orders.cliente_switch_id` | puente por id (`active_shoes`) | **13 de 15 vivos** | 2: `CITY MALL PASO CANOA` (viejo) y `Contado` (mostrador) |
| **Catálogos** — Tommy | `tommy_orders.cliente_switch_id` | puente por id (`fashion_shoes`) | **30 de 32 vivos** | 2 `Contado` (mostrador) |
| **Catálogos** — Calvin | `calvin_orders.cliente_switch_id` | puente por id (`vistana`) | **4 de 5 vivos** | 1 `HJsn` — una prueba |
| **Catálogos** — Joybees | `joybees_orders.cliente_switch_id` | puente por id (`joystep`) | **4 de 4 vivos** (100%) | — |
| **Marketing** — proyectos de tienda | `mk_proyectos.tienda_codigo` | `tienda_codigo` = el código del cliente | **19 de 25** | Las 6 sin código **no son tiendas**: `Viáticos Mensuales` ×2, `Muebles`, `Remodelacion`, `D`, `J` |
| **Marketing** — facturas del proveedor | `mk_facturas.proveedor` | 🔴 **nombre en texto**, 12 grafías | 102 filas, **0 con código** | Ver § #4 |
| **Reclamos** | `reclamos.proveedor_codigo` | 🔴 **`(empresa, proveedor_codigo)` — el PAR** | **34 de 34** (100%) | El código solo es ambiguo; el par resuelve las 4 combinaciones |
| **Proveedores (CxP)** | `switch_proveedor_estadocuenta` | tiene `(empresa_key, codigo)`… 🔴 **pero el módulo agrupa por NOMBRE** | 65 de 65 con código | Ver § Dónde se une por nombre, **el caso vivo** |
| **Llegadas de mercancía** | `switch_ingresos_mercancia.proveedor` | 🔴 **nombre en texto** | 35.572 filas, **0 con código** | Un proveedor con **5 grafías**. Ver § #5 |
| **Gastos** | `egresos_varios.proveedor` | 🔴 la columna existe y está **vacía** | 709 filas, **0 con dato** | Ver § #6 |
| **Caja Menuda** | `caja_gastos.proveedor` | 🔴 **nombre en texto libre**, 45 grafías | 77 filas | Es una compra de contado; no siempre hay proveedor de verdad |
| **Préstamos** | `prestamos_empleados.empleado_codigo` | `empleado_codigo` → `asistencia_personas` | **23 de 31 fichas** · 🔴 **las 14 que deben plata, las 14** | Las 8 sin código tienen saldo **$0**: gente que ya no está |
| **Asistencia y Planilla** | 13 tablas, todas con `empleado_codigo` | `empleado_codigo` | 100% (es la PK o parte de ella) | — |
| **Comisiones** | `switch_facturas.vendedor_nombre` · `switch_recibos.vendedor_registro` | 🔴 **el NOMBRE**, canonizado con `comision_vendedor_alias` | 2.350 facturas y 1.647 recibos de 2026, todos con nombre | Ver § Los eslabones sueltos, **#3 — el grande** |
| **Comisiones** — el cliente excluido | `comision_exclusion.cliente_codigo` | `cliente_codigo` | 12 activas | El lado del cliente **sí** va por código |
| **Ventas y Clientes** | `switch_facturas (empresa_key, cliente_switch_id)` | puente por id → `switch_clientes.codigo` → `clientes_master` | **2.282 de 2.350 facturas de 2026** (97,1%) | 68 traen un `cliente_switch_id` viejo y caen en «Otros clientes». **Sin fallback por nombre, a propósito** |
| **Multifashion** | `multifashion_tickets.cliente_switch_id` | puente por id (`american_classic`) | **15.819 de 15.819** (100%) | — |
| **Clientes (el directorio)** | `clientes_master.codigo` | `codigo` | 150 vivos (2 marcados ausentes) | — |
| ⚰️ **Clientes — la libreta vieja** | `directorio_clientes.cliente_codigo` | `cliente_codigo`, 25 de 33 | **RETIRADA el 5-sep-2026** | Sin lectores ni escritores; queda en el respaldo |

### Las consultas

```sql
-- Cobertura de la llave, tabla por tabla
select 'guia_items' t, count(*) total,
       count(*) filter (where cliente_codigo is not null and btrim(cliente_codigo) <> '') con_llave
  from guia_items where coalesce(deleted,false)=false
union all select 'guias_destino_cliente', count(*), count(*) filter (where cliente_codigo is not null) from guias_destino_cliente
union all select 'cheques',       count(*), count(*) filter (where cliente_codigo is not null) from cheques where coalesce(deleted,false)=false
union all select 'recordatorios', count(*), count(*) filter (where cliente_codigo is not null) from recordatorios
union all select 'reclamos',      count(*), count(*) filter (where proveedor_codigo is not null) from reclamos where coalesce(deleted,false)=false
union all select 'mk_proyectos',  count(*), count(*) filter (where tienda_codigo is not null) from mk_proyectos
union all select 'prestamos_empleados', count(*), count(*) filter (where empleado_codigo is not null and btrim(empleado_codigo)<>'') from prestamos_empleados where coalesce(deleted,false)=false;
-- guia_items 566/451 · guias_destino_cliente 34/34 · cheques 19/19 · recordatorios 1/1
-- reclamos 34/34 · mk_proyectos 25/19 · prestamos_empleados 31/23
```

```sql
-- ¿Los códigos guardados EXISTEN de verdad en el directorio? (0 huérfanos en las cinco)
select 'guia_items' t, count(*) con_codigo,
       count(*) filter (where c.codigo is null) huerfanos
  from guia_items g left join clientes_master c on c.codigo = g.cliente_codigo
 where coalesce(g.deleted,false)=false and g.cliente_codigo is not null and btrim(g.cliente_codigo) <> '';
-- guia_items 451 / 0 huérfanos · cheques 19 / 0 · recordatorios 1 / 0
-- guias_destino_cliente 34 / 0 · directorio_clientes 25 / 0
```

```sql
-- Los pedidos de catálogo: el puente por id, marca por marca
with p as (
  select 'reebok' marca, 'active_shoes'  ek, cliente_switch_id, coalesce(deleted,false) del from reebok_orders
  union all select 'tommy',  'fashion_shoes', cliente_switch_id, coalesce(deleted,false) from tommy_orders
  union all select 'calvin', 'vistana',       cliente_switch_id, coalesce(deleted,false) from calvin_orders
  union all select 'joybees','joystep',       cliente_switch_id, coalesce(deleted,false) from joybees_orders)
select p.marca, count(*) vivos,
       count(*) filter (where p.cliente_switch_id is not null) con_id,
       count(*) filter (where c.codigo is not null)            resuelven_a_codigo,
       count(*) filter (where p.cliente_switch_id is not null and c.codigo is null) id_huerfano
  from p left join switch_clientes c
    on c.empresa_key = p.ek and c.cliente_switch_id = p.cliente_switch_id
 where p.del = false group by 1 order by 1;
-- calvin 5/4/4/0 · joybees 4/4/4/0 · reebok 15/13/13/0 · tommy 32/30/30/0
-- TOTAL: 56 vivos · 51 con id · 51 resuelven · 0 huérfanos
```

```sql
-- Marketing: los 19 códigos cruzan; las 6 sin código no son tiendas
select p.nombre, p.tienda_codigo, c.nombre as en_master
  from mk_proyectos p left join clientes_master c on c.codigo = p.tienda_codigo
 order by p.tienda_codigo nulls first;
-- sin código: Viaticos Mensuales ×2 · Muebles · Remodelacion · D · J
-- con código: D-108 Multi Fashion Holding · D-117 Outlet Duty Free N2 · D-118 N3 · D-126 Plaza Los Angeles
--             D-14 Bouti · D-156 Wolf Mall · D-166 Zona Sur Dutty Free · D-170 Nova Lux · D-24 City Mall David
--             D-25 City Mall Paso Canoa ×2 · D-68 Grupo Hanna · D-71 Hanna Calzados · D-74 Boutique I-Fashion
--             D-80 Jerusalem · D-84 Kheriddine · D-87 La Frontera ×2 · D-88 La Nueva Reina Chorrera
```

---

## Detalle por clase de «quién»

### El cliente — la llave es el CÓDIGO, y funciona

`clientes_master.codigo` es el padrón del grupo: **150 clientes vivos**, uno por código, sin
`empresa_key` (por eso el sync pide por INCLUSIÓN de las 6 empresas). El camino desde una factura es
siempre el mismo, y **no tiene atajo por nombre**:

```
switch_facturas (empresa_key, cliente_switch_id)
      │  puente obligatorio, el PAR completo
      ▼
switch_clientes (empresa_key, cliente_switch_id) → codigo
      ▼
clientes_master.codigo → nombre, teléfono, correo, notas
```

`switch_clientes` está **100% con código en las 8 empresas** (6.799 filas: Boston 4.915 ·
american_classic 1.038 · las 6 del grupo entre 139 y 147 cada una).

⚠️ **`TCKCTA` es el único código que miente** — es el mostrador, no un cliente, y cada empresa lo
llama distinto (`CONTADO` / `VENTAS` / `VENTAS LOCAL`). Medido hoy: es también **la única fila de
Boston cuyo código existe en `clientes_master`**, y por eso un join ciego por código entre Boston y el
grupo devolvería exactamente esa fila y ninguna más.

```sql
select s.cliente_codigo, s.cliente_nombre, m.nombre as nombre_en_master
  from switch_estadocuenta s
  join clientes_master m on m.codigo = s.cliente_codigo and coalesce(m.deleted,false)=false
 where s.empresa_key = 'confecciones_boston';
-- TCKCTA | VENTAS | VENTAS LOCAL      (una sola fila, de 990)
```

### El proveedor — 🔴 el código NO es único; el par (empresa, código) sí

Esto es lo que más se malinterpreta del sistema. **Cada empresa numera a sus proveedores por su
cuenta**, así que el mismo número es otro proveedor en otra empresa:

| código | en Fashion Shoes | en Joystep | en American Classic |
|---|---|---|---|
| `112` | American Fashion Wear, SA | **JCBBRANDS** | **FASHION WEAR, INC** |

| código | en Fashion Wear | en Active Shoes |
|---|---|---|
| `122` | American Fashion Wear, SA | **LATIN FITNESS GROUP** |

```sql
select codigo, empresa_key, nombre from switch_proveedor_estadocuenta
 where codigo in ('112','122') order by codigo, empresa_key;
-- 112 | american_classic | FASHION WEAR, INC
-- 112 | fashion_shoes    | American Fashion Wear, SA
-- 112 | joystep          | JCBBRANDS
-- 122 | active_shoes     | LATIN FITNESS GROUP
-- 122 | fashion_wear     | American Fashion Wear, SA

select count(*) filas, count(distinct codigo) codigos,
       count(distinct empresa_key || '|' || codigo) pares
  from switch_proveedor_estadocuenta;
-- 65 filas | 46 códigos | 65 pares  → el par es único, el código no
```

✅ **Reclamos lo hace bien**: guarda `proveedor_codigo` **y** `empresa`, y las 4 combinaciones vivas
resuelven al proveedor correcto.

```sql
select r.empresa, r.proveedor_codigo, r.proveedor, count(*) n
  from reclamos r where coalesce(r.deleted,false)=false group by 1,2,3 order by 1;
-- Active Shoes         | 122 | Latin Fitness Group      |  1  → LATIN FITNESS GROUP        ✅
-- Fashion Shoes        | 112 | American Fashion Wear    |  5  → American Fashion Wear, SA  ✅
-- Fashion Wear         | 122 | American Fashion Wear    | 21  → American Fashion Wear, SA  ✅
-- Vistana International| 01  | American Designer Fashion|  7  → American Designer Fashion  ✅
```

🔴 **El módulo Proveedores NO lo hace bien** — ver la sección siguiente.

### El empleado — la llave es el número del reloj, y está limpia

`asistencia_personas.empleado_codigo` (40 fichas, 37 activas). Lo usan **13 tablas de Asistencia**
—marcaciones, correcciones, horarios, justificaciones, vacaciones, aprobaciones, planilla, reparto—
más `prestamos_empleados`. Medido: los **23 códigos de Préstamos cruzan los 23**, cero huérfanos, y
**las 14 personas que deben plata lo tienen todas**.

🔴 **Nada se ata por parecido, y hay candado.** `prestamos-amarre-migracion.test.ts` lee las dos
migraciones del amarre **sin sus comentarios** y prohíbe `LIKE`, `ILIKE`, `similarity`, `unaccent`,
`levenshtein`, `soundex`, `regexp_*` y `~*`. La única normalización permitida es `upper(btrim(...))`.
El caso que lo prueba: `LAURA CASIANI` **no** cruza con `Laura Lismari Casiano Vega`, y
`MARTHA AZUCENA` **no** cruza con `MARTHA ASUCENA`.

### El vendedor — 🔴 no tiene llave en uso, aunque el dato existe

Ver § Los eslabones sueltos, **#3**.

---

## Dónde se une por nombre y por qué es peligroso

El invariante del repo es que **nunca se une por nombre**. Costó $2,55 millones de venta que no
existió en Ventas (un `LEFT JOIN clientes_master … ON nombre_normalized` multiplicaba la factura y el
`SUM` la contaba dos veces). Barrido completo de `src/**` y de `supabase/migrations/**`, verificado a
mano contra producción.

### 🔴 Queda UNO vivo, y suma plata: el módulo Proveedores

**`src/lib/proveedores.ts`** — el comentario de la cabecera lo dice sin rodeos: *«La identidad
cross-empresa es el NOMBRE NORMALIZADO (cada empresa asigna su propio
proveedor_switch_id/codigo)»*.

```ts
// src/lib/proveedores.ts:39
export function normProvName(s: string | null | undefined): string {
  return (s ?? "").trim().toUpperCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim();
}
// :90   const k = normProvName(r.nombre);                     ← agrupa la LISTA
// :148  const rs = rows.filter(r => normProvName(r.nombre) === key);  ← arma la FICHA
```

`buildFicha()` suma `saldo_total` **de las 6 empresas** en `total_grupo.por_pagar` para todas las
filas cuyo nombre normalizado coincide. Es la misma forma exacta del error de los $2,55 millones —
solo que del lado de lo que se debe, no de lo que se vendió. **Y no tiene candado**, mientras
`clientes_master` tiene `clientes-master-solo-del-grupo.test.ts` y el vínculo de Reclamos tiene
`reclamos-proveedor-por-codigo.test.ts`.

**El daño medido hoy no es hipotético. Son dos, y opuestos:**

**a) Parte en TRES a un proveedor que es UNO.** Confecciones Boston aparece como proveedor en 5
empresas con **cuatro grafías distintas** y **el mismo RUC** (`655-544-133465`, DV 13). La
normalización quita puntos y comas pero **no las letras sueltas ni el orden**, así que produce tres
claves distintas y el módulo dibuja **tres fichas**:

| clave que produce `normProvName` | filas | por pagar |
|---|---|---|
| `CONFECCIONES BOSTON` | joystep + vistana | **$3.718,16** |
| `CONFECCIONES BOSTON SA` (de `…  S.A` y `…S.A`) | fashion_wear + active_shoes | **$367,55** |
| `CONFECCIONES BOSTON S A` | american_classic | **$80,25** |

**b) Junta en UNA a siete que no son la misma.** `GENERAL` es el proveedor comodín, código `1` en
las 7 empresas, RUC `0000000001`. El módulo lo funde en **una sola ficha** que suma −$284,62 de
siete empresas distintas.

```sql
select upper(btrim(regexp_replace(regexp_replace(nombre,'[.,]','','g'),'\s+',' ','g'))) clave,
       count(*) filas, count(distinct empresa_key) empresas,
       string_agg(distinct empresa_key || ':' || codigo, ' · ') pares,
       round(sum(saldo_total),2) suma_que_el_modulo_muestra
  from switch_proveedor_estadocuenta group by 1 having count(*) > 1
 order by 5 desc nulls last;
-- AMERICAN FASHION WEAR SA  | 2 filas | fashion_shoes:112 · fashion_wear:122 | 3.633.293,25
-- AMERICAN DESIGNER FASHION | 2       | active_shoes:125 · vistana:01        | 1.003.040,53
-- LATIN FITNESS GROUP       | 3       | active_shoes:122 · active_wear:113 · vistana:115 | 288.385,59
-- GENERAL                   | 7       | los 7 con código 1                   |      −284,62
-- CONFECCIONES BOSTON       | 2 ·  CONFECCIONES BOSTON SA | 2 ·  (+1 suelta) →  3 fichas
```

🩸 **Y el dato bueno está ahí mismo, sin usar** — la misma lección de los dos errores de hoy:
`switch_proveedor_estadocuenta` trae **`identificacion` (el RUC) y `dv`**, llenos en **57 de las 65
filas**. Agrupar por RUC da **38 fichas**; agrupar por nombre da **47**.

```sql
select count(*) filas,
       count(*) filter (where identificacion is not null and btrim(identificacion) <> '') con_ruc,
       count(distinct nullif(btrim(identificacion),'')) rucs_distintos
  from switch_proveedor_estadocuenta;
-- 65 | 57 | 38
```

⚠️ **Pero el RUC tampoco está limpio, y por eso esto es una decisión de Daniel, no un arreglo
automático.** Medido: el RUC `655-544-133465` está puesto en filas que dicen `CONFECCIONES BOSTON`
**y** en una que dice `FASHION WEAR, INC`; `4025410-3-278837` está en `CIF EXPRESS SA.` y en
`Luis Alberto Torres De Gracias`; `1557276-7-022022` en `ACTIVE SHOES S.A` y en `BDL SERVICES INC`.
O sea: **hoy el proveedor no tiene ninguna identidad confiable entre empresas**, y el módulo eligió
la menos confiable de las dos para sumar plata. Lo honesto es decirlo, no adivinar.

### Los que fueron peligrosos y ya se arreglaron

| dónde | qué era | cómo quedó |
|---|---|---|
| 🩸 **Ventas › Clientes** | `LEFT JOIN clientes_master mc ON mc.nombre_normalized = a.cliente_norm` en `clientes_empresa_12m_vw`, `clientes_agregado_12m_vw` y `clientes_anio()`. **$2,55 millones de venta que no existió** | Migración `20260907120000`: puente por `(empresa_key, cliente_switch_id)` → código, **sin fallback por nombre**. Candado `clientes-master-solo-del-grupo.test.ts`, que lee el SQL **final** de cada vista y función y además barre todo `src/` |
| 🩸 **Reclamos ↔ Proveedores** | cruzaba por nombre normalizado en JS: **26 de 34 reclamos no cruzaban** porque Switch escribe `American Fashion Wear, SA` y el reclamo decía `American Fashion Wear` | Migración `20260922120000` (`reclamos.proveedor_codigo`) + `src/lib/reclamos/proveedor-vinculo.ts` (`clavePar(empresa_key, codigo)`). Candado `reclamos-proveedor-por-codigo.test.ts` |
| 🩸 **CXC del grupo vs Boston** | las dos carteras se mezclaban por `nombre_normalized` | Migración `20260728120000`: dos vistas separadas, y la del grupo une a `clientes_master` **por código** |

### Los que se unen por nombre y está bien

No todo nombre es un error. Estos **agrupan filas de UNA misma fuente**, con igualdad exacta
normalizada y una lista escrita a mano — nunca por parecido, nunca entre dos tablas:

- **`comision_vendedor_canonico()`** (migración `20260913120000`) — 5 alias a mano. Es lo único que
  hay para el vendedor.
- **`claveVendedora`** (Multifashion) — agrupa las ventas de una misma vendedora dentro de
  `american_classic`. Su propio comentario explica por qué se niega a hacer pareo por parecido.
- **`comision_descuentos_fijos.vendedor_nombre`** — dentro de una sola tabla.
- Las migraciones de amarre a mano de **Guías** (`20260809120000`, `20260810120000`) y de
  **Préstamos** (`20260902120000`): backfill de una sola vez, igualdad exacta, candidato único y
  guard por nombre; escriben un **código** que de ahí en adelante es la llave.
- **La búsqueda global y las sugerencias** — `src/lib/clientes/sugerencias.ts` usa distancia de
  edición, y su propio encabezado dice: ***«ESTO NO ATA NADA. NUNCA.»*** Devuelve una lista para que
  una persona la toque.

### ⚠️ Un arma cargada sin gatillo

**`src/lib/aliases.ts`** (24 líneas) es un mapa `{"MINERA PANAMMA": "MINERA PANAMA", …}` **con clave
de NOMBRE de cliente** — el patrón exacto que el sistema prohíbe. Es de la época del CSV
(`ventas_raw`) y **no lo importa nadie**:

```bash
grep -rn "resolveAlias\|NAME_ALIASES\|lib/aliases" src/ | grep -v "^src/lib/aliases.ts"
# (vacío)
```

Muerto de las dos puntas. Vale la pena borrarlo: mientras exista, alguien lo puede volver a enchufar.

---

## Los eslabones sueltos

Lo que hoy **no está amarrado y debería**, con el número exacto y en orden de riesgo.

### 1. 🔴 Las notas y la bitácora del CXC cuelgan de un NOMBRE

`cxc_client_overrides` (**10 filas**) y `cxc_contact_log` (**141 filas, 53 clientes**) tienen como
llave `(cartera, nombre_normalized)`. **Ninguna tiene `cliente_codigo`** — y su hermana
`cxc_emails_enviados` sí lo tiene, en las 19 filas. Dos convenciones dentro del mismo módulo.

```sql
select 'cxc_client_overrides' t, count(*) filas, count(distinct nombre_normalized) nombres from cxc_client_overrides
union all select 'cxc_contact_log',     count(*), count(distinct nombre_normalized) from cxc_contact_log
union all select 'cxc_emails_enviados', count(*), count(distinct cliente_codigo)    from cxc_emails_enviados;
-- cxc_client_overrides 10 / 10 · cxc_contact_log 141 / 53 · cxc_emails_enviados 19 / 14 (por CÓDIGO)
```

Y la pantalla del CXC **agrupa las 6 empresas de un cliente por ese mismo nombre**, no por su código
(`src/app/cxc/hooks/useAdminData.ts:113` → `const key = r.nombre_normalized`), aunque la vista de la
que lee sí está armada por código.

**Qué pasaría:** el día que Switch corrija la grafía del nombre de un cliente —cambiar
`S.A` por `S.A.`, quitar una tilde—, **sus notas y todo su historial de cobranza quedan huérfanos y
la pantalla los muestra en blanco**, sin error y sin aviso. El cliente sigue ahí, con su deuda; lo
que se pierde es el trabajo de la persona que cobra.

⚠️ **Hoy no está roto, y hay que decirlo así:** medido, la agrupación por nombre da **exactamente el
mismo resultado** que la agrupación por código. No hay ni una colisión.

```sql
select count(*) filas, count(distinct codigo) codigos, count(distinct nombre_normalized) nombres,
       count(*) filter (where cliente_id is null) sin_maestro
  from switch_estadocuenta_aging;
-- 211 | 100 | 100 | 0     ← 100 códigos ↔ 100 nombres, biyección perfecta
```

Es una biyección **de hoy**, no una garantía: dos clientes pueden llamarse igual sin que eso sea un
error, y el código ya está en la misma vista (`switch_estadocuenta_aging.codigo`, 211 de 211).

### 2. 🔴 Boston y el grupo no comparten ni un código, y el puente es el nombre

`src/app/api/cxc/boston/route.ts:138-145` marca el chip **«también en el grupo»** comparando
`nombre_normalized` entre las dos carteras. Está documentado como *«SOLO una marca visual … NO se
suma nada»*, y eso es verdad — pero es un pareo entre dos tablas por nombre, y no hay alternativa
posible porque **Boston numera a sus clientes distinto**:

```sql
select b.nombre_normalized, b.codigo as codigo_boston, g.codigo as codigo_grupo
  from switch_estadocuenta_aging_boston b
  join (select distinct nombre_normalized, codigo from switch_estadocuenta_aging) g
    on g.nombre_normalized = b.nombre_normalized order by 1;
-- ALADDIN              |      9 | D-3
-- CITY MALL DAVID      |     83 | D-24
-- CITY MALL PASO CANOA |     84 | D-25
-- LA FRONTERA DUTY FREE| 132146 | D-87
-- WOLF MALL CENTER INT |    648 | D-156
```

**5 clientes hoy** (el comentario del código dice 10, medidos el 27-jul-2026 — **hoy son 5**). Si
Boston o el grupo cambia una grafía, el chip desaparece sin avisar. **No mueve plata**, y la regla
🔴 *«Boston nunca se mezcla con el CXC del grupo»* sigue intacta: los saldos viven cada uno en su
pestaña.

### 3. 🔴 El vendedor se identifica por NOMBRE, y su id está lleno y sin usar

Es el eslabón más grande, porque de él sale plata que se le paga a personas.

**Lo que se usa:** `switch_facturas.vendedor_nombre` (texto) y `switch_recibos.vendedor_registro`
(texto), canonizados con la tabla `comision_vendedor_alias` (5 filas escritas a mano) y la función
`comision_vendedor_canonico()`.

**Lo que existe y nadie usa:** `switch_facturas.vendedor_switch_id`, **lleno en las 2.350 facturas
del grupo de 2026 (100%)**, más la tabla `vendedores` (16 filas: `empresa_key`, `codigo`,
`switch_id`, `nombre`).

```sql
select count(*) facturas_2026,
       count(*) filter (where vendedor_switch_id is not null) con_id,
       count(distinct vendedor_switch_id)              ids,
       count(distinct upper(btrim(vendedor_nombre)))   nombres
  from switch_facturas
 where fecha >= '2026-01-01' and fecha < '2027-01-01'
   and empresa_key in ('vistana','fashion_wear','fashion_shoes','active_wear','active_shoes','joystep');
-- 2350 | 2350 | 8 ids | 9 nombres     ← el nombre parte a una persona que el id no parte
```

**El caso que lo prueba, medido:** en Active Wear, el vendedor `id = 4` aparece con **las dos
grafías** en las mismas 24 facturas:

```sql
select empresa_key, vendedor_switch_id, string_agg(distinct upper(btrim(vendedor_nombre)),' | ') nombres, count(*) n
  from switch_facturas where fecha >= '2026-01-01' and fecha < '2027-01-01'
   and empresa_key in ('vistana','fashion_wear','fashion_shoes','active_wear','active_shoes','joystep')
 group by 1,2 order by 1,2;
-- active_wear | 4 | REINALDO ESPINOSA | REYNALDO ESPINOSA | 24     ← un id, dos nombres
-- vistana     | 6 | REY STOUTE AGUAS  | 1
-- vistana     | 7 | AGUAS             | 44                          ← DOS registros distintos en Switch
```

**Pero el id NO es un reemplazo directo, y por eso esto es una decisión, no una tarea.** Tres razones
medidas:

1. **El id es de la empresa, no de la persona**: `switch_id = 2` es REINALDO en Active Shoes,
   Fashion Shoes y Fashion Wear, y **DANIEL LEVY** en Joystep y Vistana. Habría que usar el par
   `(empresa_key, vendedor_switch_id)`, igual que el proveedor.
2. **El alias hace algo que el id no puede**: en Vistana, `REY STOUTE AGUAS` (id 6) y `AGUAS` (id 7)
   son **dos registros distintos de Switch** que la tabla de alias declara una sola persona.
3. 🔴 **El lado del cobro no tiene id.** `switch_recibos` solo trae `vendedor_registro` y
   `vendedor_cartera`, los dos de texto: **1.647 recibos del grupo en 2026, ninguno con id**. La
   comisión de cobro **no tiene ningún camino por código**, ni siquiera potencial.

```sql
select count(*) recibos_2026,
       count(*) filter (where vendedor_registro is not null and btrim(vendedor_registro) <> '') con_nombre
  from switch_recibos where fecha >= '2026-01-01' and fecha < '2027-01-01'
   and empresa_key in ('vistana','fashion_wear','fashion_shoes','active_wear','active_shoes','joystep');
-- 1647 | 1647    ← y CERO columnas de id: no existen en la tabla
```

Hoy el sistema **funciona bien** porque son 5 personas y la lista de alias está al día. El riesgo es
el conocido: una grafía nueva que nadie agregue **no revienta nada, parte una persona en dos filas en
silencio** — que es exactamente lo que pasó con `REINDALDO ESPINOSA` y su tasa de cobro en 0%.

### 4. El proveedor de Marketing no tiene código

`mk_facturas.proveedor` — **102 filas, 12 grafías, 0 con código**. Y `mk_periodos.proveedor_key`
guarda una clave corta de marca (`RBK`, `TH`, `CK`, `J`, `KL`… **y `pvh` en minúsculas**), que no es
el código del proveedor de Switch ni cruza con `switch_proveedor_estadocuenta`.

### 5. Las llegadas de mercancía no tienen código de proveedor, y el mismo proveedor tiene 5 nombres

`switch_ingresos_mercancia` — **35.572 renglones**, solo `proveedor` en texto, **19 grafías**. Un
solo proveedor está escrito de **cinco formas**:

```sql
select proveedor, count(*) n, count(distinct empresa_key) empresas
  from switch_ingresos_mercancia group by 1 order by 2 desc;
-- American Fashion Wear, SA    16.376
-- AMERICAN FASHION WEAR, S.A.   1.179
-- AMERICAN FASHION WEAR, SA       962
-- AMERICAN FASHION WEAR           439
-- AMERICAN FASHION WEAR, S.A       47   → 19.003 renglones, un proveedor, 5 nombres
-- American Designer Fashion    10.246  +  AMERICAN DESIGNER FASHION  160  → 2 nombres
```

Hoy no hace daño porque **nadie cruza las llegadas con la cuenta por pagar**. El día que se quiera
ver «cuánto le compré y cuánto le debo a este proveedor» en una sola pantalla, este es el muro.

### 6. La columna `proveedor` de Gastos existe y está vacía

`egresos_varios.proveedor` — **709 filas, las 709 con la cadena vacía**. Ni nombre ni código: el
gasto se identifica por su **cuenta contable** (`cuentas_contables`, 987 filas), que es otra clase de
llave y funciona bien. La columna es un espacio reservado que nadie llenó.

```sql
select coalesce(proveedor,'(null)') proveedor, count(*) from egresos_varios group by 1;
-- ''  |  709
```

### 7. Fichas de Préstamos duplicadas por persona, sin código

`JOHANA VALLEJO` ×2 · `LUZ LOPEZ` ×2 · `STEFANY MORALES` y `STEPHANY MORALES` (dos grafías de la
misma persona) · `YANKATERY` · `YEISON LLORENTE` — **8 fichas, las 8 sin `empleado_codigo`, las 8 con
saldo $0**. No aparecen en ninguna pantalla y no deben plata, así que no urge; pero son la prueba de
lo que pasa cuando el nombre es la identidad: la misma persona termina con dos fichas y una letra de
diferencia.

### 8. 115 renglones de guía sin cliente — y está bien

`guia_items`: **451 de 566 con `cliente_codigo`**. Los 115 restantes van a un destino que no está en
el directorio, y **elegir cliente no es obligatorio a propósito** (§ `CLAUDE.md` › Guías). No es un
eslabón suelto: es una decisión.

---

## Lo que este archivo corrige de la documentación

| decía | es | dónde |
|---|---|---|
| «**Marketing no guarda el cliente**» | `mk_proyectos.tienda_codigo`, **19 de 25**, y las 19 cruzan con `clientes_master` | § La tabla |
| «Los pedidos de catálogo **guardan el nombre en texto**» | `cliente_switch_id` → código, **51 de 56 vivos**, 0 huérfanos | § La tabla |
| `CLAUDE.md`: «`switch_estadocuenta` 2.737 filas» | **2.759** hoy | consulta directa |
| `CLAUDE.md` › Dónde vive cada dato: «`switch_proveedor_estadocuenta` · 65» | ✅ **correcto**. Lo que falta ahí es la advertencia de que **el código NO es único entre empresas**: el par sí | § El proveedor |
| `CLAUDE.md` no nombra **`reclamos.proveedor_codigo`** en ninguna parte | Existe, está **lleno en las 34 filas** y es lo que ata Reclamos con Proveedores. Migración `20260922120000`, aplicada | § El proveedor |
| `CLAUDE.md`: «`directorio_clientes` — 33 · la libreta de contactos a mano» | **RETIRADA el 5-sep-2026**: sin lectores ni escritores, clasificada `congelada`, sigue en el respaldo | commit `4a4a9605` |
| `CLAUDE.md`: migraciones `20260918120000`, `20260919120000`, `20260921120000` y `20260924120000` marcadas **«pendiente de aplicar»** | **las cuatro están APLICADAS** (`supabase_migrations.schema_migrations`). La única sin aplicar hoy es `20260925130000_recordatorios_rediseno` | consulta directa |
| Comentario de `src/app/api/cxc/boston/route.ts`: «10 clientes están en los dos lados» (27-jul-2026) | **5 hoy** | § Eslabones sueltos #2 |
| `src/lib/proveedores.ts`: «Lee switch_proveedor_estadocuenta (**42 filas** hoy)» | **65 filas** | § Dónde se une por nombre |

> 🔑 La regla que sale de todo esto, para la próxima vez que alguien pregunte «¿esto está amarrado?»:
> **mirar las columnas de la tabla del propio módulo antes de contestar.** Los dos errores del
> 5-sep-2026 se habrían evitado con una consulta a `information_schema.columns`.
