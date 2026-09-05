# Riesgos silenciosos

> **Medido el 5-sep-2026** contra producción (proyecto `rspocgqhtpveytgbtler`, PostgreSQL 17.6,
> **408 MB**), con la Management API en modo lectura y con el código de `origin/main`
> (`f34b1412`, el mismo que está desplegado). Ningún número de este archivo está estimado:
> cada uno trae abajo la consulta o el comando con el que se vuelve a sacar.

Este archivo no habla de pantallas lentas. Habla del modo de fallo caro de este sistema:
**un número que sale mal y parece bien.** Un total incompleto no lleva asterisco, una consulta
truncada no tira error, y un respaldo a medias pesa casi lo mismo que uno entero.

---

## 0 · ¿Hay hoy alguna pantalla mostrando un número incompleto?

**Un número de plata en pantalla, no.** Los tres tableros donde vive la plata —CXC, Ventas ›
Resumen y Vista General— se midieron uno por uno y hoy están **por debajo** del corte de 1.000
filas, con margen. El detalle y el margen exacto de cada uno está en el §1.

**Pero sí hay dos cosas rotas hoy, y una es de las que no se ven:**

| # | Qué | Estado |
|---|---|---|
| 🔴 A | El sync de fichas de Reebok **cruzó las 1.000 filas hace pocos días** y desde entonces le vuelve a pedir a Switch ~400 fichas que ya tiene, todos los días, mientras 355 artículos reales nunca terminan de clasificarse. | **Vivo** |
| 🔴 B | La ficha de cliente por API pide **toda la historia sin tope y sin orden**. Medido: 4 clientes ya pierden la fecha de su última factura en alguna empresa, y el mostrador (`TCKCTA`) pediría **7.640 filas** para un total de **$372.286,96**. | **Vivo, pero ninguna pantalla lo llama hoy** |

El §1 los desarrolla. Lo importante del B: la ficha que se ve en `/clientes/[codigo]` es SSR y
usa la RPC `cliente_ficha_ventas`, que agrega **en el servidor** — esa está bien. La versión rota
vive en `GET /api/clientes/[codigo]`, un endpoint que quedó **sin consumidor** (el componente solo
usa su `PATCH`). Es una bomba desactivada, no una bomba apagada: sigue respondiendo a quien la
llame por URL.

---

## 1 · El corte de 1.000 filas

`db-max-rows` = 1000. PostgREST corta **toda** respuesta ahí, sin error y sin ninguna marca en el
payload. Pedir `.range(0, 99999)` o `.limit(5000)` devuelve 1.000 filas y el código de arriba cree
que ésa es la tabla entera.

**Cómo se comprueba, en una línea:** ejecutar la misma consulta en la base y contar. Si el conteo
real pasa de 1.000 y la lectura no pagina, la pantalla está mintiendo.

### 1.1 · Las 23 tablas y vistas que hoy pasan de 1.000 filas

```sql
select relname, tipo, filas from (
  select c.relname,
         case c.relkind when 'r' then 'tabla' when 'm' then 'matview' when 'v' then 'vista' end as tipo,
         (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', c.relname), false, true, '')))[1]::text::bigint as filas
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r','m','v')
) t where filas > 1000 order by filas desc;
```

| Objeto | Tipo | Filas (5-sep-2026) |
|---|---|---|
| `switch_articulo_diario` | tabla | 204.010 |
| `switch_factura_lineas` | tabla | 163.722 |
| `switch_facturas` | tabla | 54.466 |
| `ventas_raw` | tabla | 48.378 |
| `switch_recibos` | tabla | 46.717 |
| `switch_ingresos_mercancia` | tabla | 35.572 |
| `_multifashion_sf_vw` | vista | 29.708 |
| `switch_articulo_info` | tabla | 16.658 |
| `multifashion_tickets` | tabla | 15.819 |
| `switch_sync_log` | tabla | 9.641 |
| `switch_articulo_marca` | tabla | 8.736 |
| `switch_clientes` | tabla | 6.800 |
| `asistencia_marcaciones` | tabla | 6.081 |
| `clientes_master` | tabla | 5.064 |
| `switch_ultima_compra_cliente_v1` | vista | 3.336 |
| `switch_ultimo_pago_cliente_v2` | vista | 3.335 |
| `activity_logs` | tabla | 2.878 |
| `switch_estadocuenta` | tabla | 2.759 |
| `switch_factura_utilidad` | tabla | 1.837 |
| `clientes_empresa_12m_vw` | matview | 1.685 |
| `switch_costo_diario` | tabla | 1.223 |
| `cxc_rows` | tabla | 1.097 |
| `user_sessions` | tabla | 1.040 |

Y **nueve más entre 400 y 1.000**, que son las que van a cruzar sin que nadie mire:
`cuentas_contables` 987 · `data_integrity_checks` 828 · `egresos_varios` 709 · `guia_items` 566 ·
`tommy_products` 552 · `tommy_order_items` 532 · `asistencia_horas_extra_aprobadas` 521 ·
`vendor_assignments` 483 · `prestamos_movimientos` 443.

### 1.2 · Las 214 lecturas de esas tablas, clasificadas

Se barrió cada `.from("<tabla>")` de `src/` (sin tests) sobre las tablas de arriba y se clasificó
la cadena que le sigue. El resultado: **la gran mayoría está protegida**. Cuatro casos no.

| Clase | Qué significa | Cuántos |
|---|---|---|
| ✅ `leerTodoPaginado` | pagina y **verifica contra un `count: "exact"`** | pocos, pero en los lugares correctos |
| ✅ Paginador a mano | pagina con orden estable, **sin** verificar el conteo (ver §2) | 8 archivos |
| ✅ `.limit()` / `.range()` deliberado | tope escrito y documentado | mayoría |
| ✅ `.single()` / `.maybeSingle()` / `count exact head` | una fila o solo el conteo | mayoría |
| 🔴 Sin nada | ni tope, ni paginación, ni conteo | **35 sitios**, de los cuales 4 importan |

De los 35 sin tope, **31 tienen un filtro que hoy los deja muy por debajo de 1.000** (por
`empresa_key`, por `cliente_codigo`, por ventana de fechas). Se midieron uno por uno; los márgenes
están en §1.5. Los 4 que sí importan van ahora.

### 1.3 · 🔴 A — El sync de fichas de Reebok se pasó del corte y quedó girando en falso

**Dónde está:** `src/lib/switch-api/sync-articulo-info.ts:266`

```ts
const { data, error } = await supabaseServer
  .from("switch_articulo_info")
  .select("codigo")
  .eq("empresa_key", empresaKey)
  .not("ficha_at", "is", null);      // ← sin .order(), sin .limit(), sin paginar
const yaConFicha = new Set(...);
```

**Qué puede salir mal — y ya salió.** Esa lectura es «qué fichas ya tengo, para no volver a
pedírselas a Switch». Hoy, para `active_shoes`:

| | Filas |
|---|---|
| Artículos con `ficha_at` (ya traídas) | **1.408** |
| Artículos sin ficha (lo que falta de verdad) | **355** |
| Total del catálogo | 1.763 |
| Lo que devuelve la consulta | **1.000** |

Se pasó del corte. `yaConFicha` queda con 1.000 de 1.408, así que **408 artículos que ya tienen
ficha aparecen como pendientes**. Consecuencias, las tres medidas:

1. El cron le pide a Switch hasta **400 fichas por corrida** (`FICHA_MAX_POR_CORRIDA = 400`), y una
   buena parte son fichas que ya tiene. Es cuota de Switch quemada todos los días.
2. Los **355 artículos que faltan de verdad no drenan**: los falsos pendientes les compiten el cupo.
   La documentación dice que «drenan solas en ~4 corridas» — con el corte puesto, no drenan nunca.
3. Como la consulta **no tiene `.order()`**, cuáles 1.000 vuelven cambia entre corridas. El set de
   falsos pendientes se mueve solo: el sync no converge.

Y eso alimenta la clasificación del catálogo Reebok, que según la propia doctrina del repo es
plata: *«de la categoría sale el bulto, y el bulto es plata»*.

**Cómo se comprueba:**

```sql
select count(*) filter (where ficha_at is not null) as con_ficha,
       count(*) filter (where ficha_at is null)     as sin_ficha,
       count(*)                                      as total
from switch_articulo_info where empresa_key = 'active_shoes';
-- 5-sep-2026 → 1408 · 355 · 1763
```

Si `con_ficha` > 1000, el sync está girando en falso. El 2-sep eran 400 y todo funcionaba; cruzó el
umbral en estos días y **nada avisó**.

**Y viene peor:** el mismo código corre para las otras cinco empresas. `vistana` tiene **8.273**
artículos y `fashion_wear` **5.111**. El día que se les encienda la ficha, la consulta devolverá
1.000 de 8.273 y el sync pedirá lo mismo para siempre.

### 1.4 · 🔴 B — La ficha de cliente por API pide toda la historia, sin tope y sin orden

**Dónde está:** `src/app/api/clientes/[codigo]/route.ts`, líneas 73 (ventas del año), 92 (última
factura), 100 (recibos), 116.

```ts
supabaseServer.from("switch_facturas")
  .select("empresa_key, cliente_switch_id, fecha, tipo_comprobante, subtotal_descuento")
  .in("cliente_switch_id", cids)
  .gte("fecha", anioDesde).lt("fecha", anioHasta)   // ← ni .order() ni tope
```

**Qué puede salir mal, por partes:**

**b1 · Ventas del año.** Para clientes normales está bien: el que más pide es `D-25` con **429**
filas del año. El que rompe es el **mostrador**:

| Código | Nombre en `clientes_master` | Filas que pide | Ventas 2026 de verdad |
|---|---|---|---|
| `TCKCTA` | VENTAS LOCAL | **7.640** | **$372.286,96** |

Devuelve 1.000 de 7.640, y como **no hay `.order()`** el subconjunto que llega es arbitrario: el
total sale distinto en cada carga y ronda el 13% del real. `TCKCTA` está en `clientes_master` con
`deleted = false` y `ausente_desde` en NULL, y **el listado de `/clientes` no lo esconde**
(`esMostrador` solo se aplica en Ventas › Clientes, `ClientesView.tsx:258`). O sea: aparece en el
directorio como un cliente más.

Lo que salva hoy: la pantalla de la ficha (`src/app/clientes/[codigo]/page.tsx`) es SSR y usa la
RPC `cliente_ficha_ventas`, que agrega en el servidor. **El GET de la API quedó sin consumidor** —
el único `fetch` a esa URL (`ClienteDetail.tsx:129`) es un `PATCH`.

**b2 · La fecha de la última factura — esto sí está mal hoy.** La misma ruta pide toda la historia
(`.in(cids)` + tipos, `order fecha desc`, sin tope) y después arma la última fecha **por empresa**.
Al cortarse en 1.000, las empresas cuya última factura es vieja se caen del pedazo que llega y la
ficha las muestra **en blanco**:

| Código | Empresa | Lo que mostraría la pantalla | Lo que hay de verdad |
|---|---|---|---|
| D-120 | Active Shoes | — | 25-ene-2023 |
| D-98 | Active Shoes | — | 5-jun-2023 |
| D-98 | Fashion Shoes | — | 3-ene-2024 |
| D-98 | Fashion Wear | — | 2-feb-2023 |
| TCKCTA | Active Wear | — | **21-jul-2026** |

**Cómo se comprueba** (la consulta reproduce exactamente lo que hace la ruta):

```sql
with cids as (select codigo, array_agg(distinct cliente_switch_id) ids
              from switch_clientes where cliente_switch_id is not null group by codigo),
pares as (select codigo, empresa_key, cliente_switch_id from switch_clientes),
mil as (select c.codigo, f.empresa_key, f.cliente_switch_id, f.fecha,
               row_number() over (partition by c.codigo order by f.fecha desc) rn
        from cids c join switch_facturas f on f.cliente_switch_id = any(c.ids)
        where f.tipo_comprobante in ('Factura','Tiquete','Transacción'))
select m.codigo, m.empresa_key,
       max(m.fecha) filter (where m.rn <= 1000) as pantalla,
       max(m.fecha)                              as verdad
from mil m join pares p using (codigo, empresa_key, cliente_switch_id)
group by 1,2
having max(m.fecha) filter (where m.rn <= 1000) is distinct from max(m.fecha);
```

**b3 · Lo mismo, otra ruta.** `src/app/api/clientes/[codigo]/historial-mensual/route.ts:113` pide
24 meses de facturas de un cliente en una empresa, sin tope. El máximo real hoy es
`TCKCTA · american_classic` con **25.123** filas (truncado); el peor cliente de verdad es
`D-25 · fashion_wear` con **491**. Margen 2×.

### 1.5 · 🟠 Lo que hoy está bien pero con poco colchón

Todo esto se midió; ninguno pasa de 1.000 hoy. La columna «margen» es cuántas veces puede crecer
antes de empezar a mentir.

| Dónde | Qué lee | Filas hoy | Margen | Nota |
|---|---|---|---|---|
| `api/cxc/aging/route.ts:165` · `cxc-summary:10` · `clients/route.ts:10` | `switch_estadocuenta_aging` (+ `_mv`), sin tope | **211** | 4,7× | Techo teórico: 150 clientes × 6 empresas = 900. Está más cerca de lo que parece. |
| `api/boston/inicio` · `api/cxc/boston` · `api/boston/clientes` | `switch_estadocuenta_aging_boston` | **390** | 2,6× | Estos sí paginan a mano. Boston tiene 4.912 clientes: si sube la morosidad, sube esto. |
| `lib/cxc/estado-cuenta-data.ts:77` | `switch_estadocuenta` de un cliente | máx **353** (D-25) | 2,8× | |
| `api/cxc/boston/estado-cuenta:54` | idem, Boston | bajo | alto | |
| `lib/switch-api/outage-resumen.ts:362` | `switch_sync_log`, 24 h, sin filtro de tipo | **244** | 4,1× | Es el resumen de la caída: si se trunca, dice que todo está bien. |
| `lib/cron-telemetry.ts:1930` | `switch_sync_log`, 30 h, 3 tipos | **143** | 7× | |
| `api/cron/switch-reconciliacion:196` | `switch_sync_log`, día de Panamá | **157** | 6,4× | |
| `lib/switch-api/monto-guard-io.ts:155` · `costo-sospechoso-aviso.ts:92` | `switch_sync_log`, 7 días, un par | máx **64** | 15× | |
| `api/cxc/ultimo-pago` · `ultima-compra` | `switch_ultimo_pago_cliente_v2` (3.335 filas) | **457** del grupo | — | Paginan a mano; correcto. |
| `api/cxc/enviar-email:160` (`sharedCount`) | `switch_clientes` por email | máx **77** | 13× | |
| `lib/cuentas/leer.ts:118` | `cuentas_contables` por tandas | tope **800** por diseño | — | La única del repo con el cálculo del techo escrito en el comentario. Bien hecho. |

Tres `.limit(1000)` merecen mención aparte, porque **1000 es exactamente el corte**: no hay forma
de distinguir «devolvió el tope que le pedí» de «PostgREST lo cortó».

- `api/guias/despachos-frecuentes/route.ts:56` — el transportista más cargado tiene 47 guías. Sin riesgo, pero el tope no comunica nada.
- `api/cxc/envios/route.ts:72` — ventana de 7 días de `cxc_emails_enviados`. Sin riesgo hoy.
- `api/boston/clientes/route.ts:129` (`TOPE_BUSQUEDA * 10` = 1000) — Boston tiene 4.915 clientes; una búsqueda amplia se corta. La ruta devuelve `truncado: true`, así que **avisa**. Es el patrón correcto.

---

## 2 · Paginadores escritos a mano que no verifican contra el conteo

`leerTodoPaginado` (`src/lib/supabase-paginado.ts`) hace **dos** cosas: pagina con orden estable
**y** compara el total leído contra un `count: "exact"`, y **tira error** si no cuadra. Esa segunda
defensa es la que convierte un truncado silencioso en una falla ruidosa.

Ocho lugares paginan a mano y **hacen solo la primera mitad**. Todos rompen el bucle con
`if (data.length < PAGE) break;` — una página corta por cualquier motivo transitorio se lee como
«ya terminé».

| Archivo | Verifica el conteo |
|---|---|
| `src/app/api/cron/backup/route.ts:438` (`fetchTableNdjson`) | ❌ |
| `src/app/api/cxc/ultimo-pago/route.ts:63` | ❌ |
| `src/app/api/cxc/ultima-compra/route.ts:48` | ❌ |
| `src/app/api/cxc/boston/route.ts:47` | ❌ |
| `src/app/api/boston/clientes/route.ts:75` | ❌ |
| `src/app/api/boston/inicio/route.ts:59` | ✅ (pide `count: "exact"`) |
| `src/lib/switch-api/sync-estadocuenta-web.ts:142` | ❌ |
| `src/lib/switch-api/sync-articulo-marca.ts:190` | ✅ (usa el helper) |

**El más caro de los ocho es el respaldo.** Su comentario dice: *«Una tabla cuya llave primaria NO
es `id` y que no esté en `ORDER_BY` deja un respaldo incompleto que parece completo»* — y hay
candado para eso. Pero la otra mitad, la del conteo, no está: `fetchTableNdjson` no pide un
`count: "exact"` ni una sola vez.

**Cómo se comprueba:** `grep -n 'count: "exact"' src/app/api/cron/backup/route.ts` → sin resultados.

---

## 3 · El respaldo pagina con `OFFSET` profundo, y el costo crece al cuadrado

**Dónde está:** `src/app/api/cron/backup/route.ts:430-449`, `PAGE = 1000` (línea 152).

`.range(from, from + PAGE - 1)` se traduce a `LIMIT 1000 OFFSET n`. Postgres **no salta** las
primeras `n` filas: las recorre y las descarta. Para la tabla más grande son **204 páginas**, y
la página 204 recorre 204.000 filas antes de devolver 1.000.

**Medido:**

```sql
explain (analyze) select * from switch_articulo_diario order by id asc limit 1000 offset 203000;
-- Index Scan ... (actual rows=204000) · Execution Time: 499.8 ms
```

Y lo que se ve del lado del servidor, acumulado en 24 días (`pg_stat_statements`):

| Consulta | Llamadas | Promedio | Tiempo total |
|---|---|---|---|
| `SELECT * FROM switch_articulo_diario ORDER BY id LIMIT $1 OFFSET $2` | **4.849** | 78 ms | **378 s** |

**Qué puede salir mal.** El respaldo corre dentro de una función con techo de tiempo (el propio
código habla de «740 s desde el arranque deja 60 s»). El costo de este patrón crece con el
**cuadrado** de las filas: `switch_articulo_diario` suma ~5.000 filas al mes, así que en un año
pasa de 204.010 a ~264.000 y el tiempo de paginado sube **1,7×**. El día que no alcance, el
respaldo se corta a la mitad — y como no verifica el conteo (§2), se anota como completo.

**Cómo se comprueba:** correr el `explain` de arriba y ver `actual rows` en el nodo de abajo. Si es
del orden del `OFFSET`, es paginación cuadrática.

**La forma correcta** (misma que ya usa el sync de recibos para otra cosa): paginar por **cursor**,
`where id > <último id de la página anterior> order by id limit 1000`. Cada página cuesta lo mismo
que la primera.

---

## 4 · Consultas que no pueden usar índice

### 4.1 · Filtros por año con `EXTRACT(YEAR …)`

`EXTRACT(YEAR FROM fecha) = p_anio` **no es sargable**: obliga a leer la tabla entera. El repo ya lo
sabe (`20260623130000_multifashion_margen_desde_mv.sql:8` lo dice textual), pero sigue vivo en
migraciones que hoy corren:

- `20260915120000_costo_con_notas_de_debito.sql:128` y `:171` — es la migración **más nueva** del costo del Resumen.
- `20260725170100_ventas_dashboard_summary_mes_sargable.sql:95` — el archivo se llama «sargable» y conserva un `EXTRACT` adentro.
- `20260606090000_prev_same_period_dia_costo_articulo.sql` — nueve veces.
- `20260610130100_utilidad_por_cliente.sql:51`, `20260606140000_home_dashboard_summary…:90,95`.

En la mayoría el `EXTRACT` cae sobre una vista o un `generate_series` chico, no sobre
`switch_facturas` directo — por eso hoy no duele. Pero es la clase de patrón que se copia al
siguiente `_v9`.

**Cómo se comprueba:** `grep -rn "EXTRACT( *YEAR" supabase/migrations/` y, para el que importe,
`explain (analyze)` de la RPC buscando `Seq Scan` sobre una tabla grande.

### 4.2 · Lo que se está leyendo a barrido completo

```sql
select relname, seq_scan, seq_tup_read, idx_scan,
       (seq_tup_read/nullif(seq_scan,0))::bigint as filas_por_barrido
from pg_stat_user_tables where schemaname='public' and n_live_tup > 1000
order by seq_tup_read desc;
```

| Tabla | Barridos completos | Filas leídas a barrido | Filas por barrido |
|---|---|---|---|
| `switch_factura_lineas` | 530 | **48,2 M** | 90.926 |
| `switch_facturas` | 1.003 | **44,5 M** | 44.377 |
| `switch_articulo_diario` | 383 | **37,1 M** | 96.761 |
| `switch_articulo_info` | 608 | 6,8 M | 11.203 |
| `switch_ingresos_mercancia` | 184 | 5,8 M | 31.685 |

130 millones de filas leídas a barrido en 24 días. No todo es evitable (un `SELECT *` de respaldo
es legítimamente un barrido), pero sí marca dónde mirar.

### 4.3 · Un barrido concreto y fácil de matar

**Dónde está:** `src/lib/ventas/queries.ts:125`

```ts
supabaseServer.from("switch_facturas").select("synced_at")
  .order("synced_at", { ascending: false }).limit(1)
```

`switch_facturas` **no tiene índice por `synced_at`**. Pedir la fila más reciente obliga a leer y
ordenar las 54.474:

```sql
explain (analyze) select synced_at from switch_facturas order by synced_at desc limit 1;
-- Seq Scan on switch_facturas (actual rows=54474) → top-N heapsort → 28,3 ms
```

En 24 días: **651 llamadas × 83 ms = 54 s** de base para leer una sola fecha. Un índice
`(synced_at desc)` lo baja a menos de un milisegundo.

### 4.4 · `ilike` con comodín adelante

`%texto%` nunca usa un índice B-tree. Se revisaron todos los del repo; el único sobre una tabla
grande es el buscador global:

**`src/app/api/search/route.ts:123`** — `switch_facturas.cliente_nombre ilike '%q%'` con
`order fecha desc limit 50`. Medido con un término frecuente: **31,7 ms** (el plan corta apenas
junta 50). El riesgo real es el término **raro o largo**: ahí no junta 50 nunca y recorre el índice
entero hacia atrás. Con 54 mil facturas todavía se banca; con 150 mil, no.

`src/app/api/cheques/[id]/historial/route.ts:22` hace `activity_logs.details ilike '%"chequeId":"…"%'`
— comodín adelante sobre una columna de texto, en una tabla que ya tiene 2.878 filas y solo crece
(es bitácora, no se poda). Hoy son 4 ms; es de las que hay que volver a medir en un año.

---

## 5 · Índices

### 5.1 · Falta uno

`switch_facturas` no tiene índice por `synced_at` — ver §4.3. Es el único hueco encontrado en las
tablas grandes: todas las demás tienen cubiertas `empresa_key`, `fecha`, `cliente_switch_id` y
`cliente_codigo` (se revisaron los 47 índices de las nueve tablas más grandes).

### 5.2 · Sobran unos cuantos — 10 MB de índices que nadie tocó nunca

```sql
select t.relname tabla, i.relname indice, pg_size_pretty(pg_relation_size(i.oid)) peso
from pg_stat_user_indexes s
join pg_class i on i.oid = s.indexrelid join pg_class t on t.oid = s.relid
where s.schemaname='public' and s.idx_scan = 0 and pg_relation_size(i.oid) > 16384
order by pg_relation_size(i.oid) desc;
```

| Tabla | Índice | Peso |
|---|---|---|
| `ventas_raw` | `idx_ventas_raw_n_sistema_empresa` | 5.424 kB |
| `ventas_raw` | `idx_ventas_raw_empresa_año_mes` | 944 kB |
| `ventas_raw` | `idx_ventas_raw_fecha_desc` | 800 kB |
| `ventas_raw` | `idx_ventas_raw_año_mes` | 760 kB |
| `ventas_raw` | `idx_ventas_raw_anio_empresa` | 752 kB |
| `ventas_raw` | `idx_ventas_raw_empresa_año` | 712 kB |
| `ventas_raw` | `idx_ventas_raw_cliente_id` | 672 kB |
| `multifashion_tickets` | `idx_mft_fecha` | 592 kB |
| `multifashion_tickets` | `multifashion_tickets_switch_factura_id_key` | 584 kB |
| `switch_estadocuenta` | `idx_sec_empresa_saldo_abierto` | 272 kB |

Los siete de `ventas_raw` (**10,1 MB**) son la foto de una tabla que ya no tiene lectores en la app
— está congelada y solo la copia el respaldo. Cada índice se mantiene en cada escritura y engorda
el respaldo. **No los quitaría todavía**: `ventas_raw` no es re-derivable de Switch y el ahorro es
chico frente al riesgo de tocar una tabla congelada. Es dato para el día que se decida qué hacer
con ella.

⚠️ Aviso de método: `idx_scan = 0` es «desde el último reinicio del contador de estadísticas», y
`pg_stat_database.stats_reset` está en NULL — o sea, desde siempre que se tenga registro. Es
confiable, pero un índice que solo se usa una vez al año podría estar ahí injustamente.

---

## 6 · Tamaño y crecimiento

Base entera: **408 MB**. Las 25 tablas más pesadas:

```sql
select c.relname, pg_size_pretty(pg_total_relation_size(c.oid)) total,
       pg_size_pretty(pg_relation_size(c.oid)) tabla, pg_size_pretty(pg_indexes_size(c.oid)) indices
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('r','m')
order by pg_total_relation_size(c.oid) desc limit 25;
```

| Tabla | Total | Datos | Índices |
|---|---|---|---|
| `switch_facturas` | 85 MB | 54 MB | 31 MB |
| `switch_factura_lineas` | 79 MB | 40 MB | 39 MB |
| `switch_articulo_diario` | 74 MB | 31 MB | **43 MB** |
| `ventas_raw` | 38 MB | 16 MB | 22 MB |
| `switch_clientes` | 16 MB | 14 MB | 1,8 MB |
| `multifashion_tickets` | 16 MB | 14 MB | 2,0 MB |
| `switch_ingresos_mercancia` | 14 MB | 8,9 MB | 5,1 MB |
| `switch_recibos` | 12 MB | 6,8 MB | 5,6 MB |
| `asistencia_marcaciones` | 9,8 MB | 7,7 MB | 2,0 MB |
| `guia_transporte` | **8,0 MB** | 64 kB | 96 kB |

Dos cosas que saltan:

- **`switch_articulo_diario` tiene más índice (43 MB) que datos (31 MB).** Seis índices, todos con
  uso registrado, pero el único de 16 MB (`empresa_key, fecha, articulo_id, tipo`) es la llave
  única y los demás se solapan con él en el prefijo. Vale una revisión aparte.
- **`guia_transporte` pesa 8 MB con 236 filas.** No es la tabla: son 7,4 MB de TOAST, las firmas en
  base64 (`firma_transportista`, `firma_base64`, `firma_entregador_base64`) — ~31 kB por guía. A
  ~240 guías al año son ~7,5 MB/año, todos dentro del respaldo diario. No es urgente; es un renglón
  que va a crecer lineal y para siempre.

### Crecimiento medido

```sql
select to_char(fecha,'YYYY-MM') mes, count(*) from switch_facturas where fecha >= '2025-09-01' group by 1 order by 1;
```

| Tabla | Filas nuevas por mes (promedio 2026) | En un año |
|---|---|---|
| `switch_articulo_diario` | ~5.000 | 204.010 → ~264.000 (+29%) |
| `switch_factura_lineas` | ~3.400 | 163.722 → ~204.000 (+25%) |
| `switch_facturas` | ~1.500 | 54.466 → ~72.000 (+33%) |
| `switch_recibos` | ~1.300 | 46.717 → ~62.000 (+33%) |

A este ritmo la base pasa de 408 MB a ~520 MB en un año. Nada alarmante en espacio; lo que sí
duele es el §3, donde el tiempo del respaldo crece al cuadrado de eso.

---

## 7 · Fallos silenciosos en el código

### 7.1 · 🔴 El caso más grande: la cadena de versiones de RPC baja de versión sin decírselo a nadie

**Dónde está:** `src/lib/ventas/rpc-version.ts` (`rpcConFallbackDeVersion`), usada por
`src/lib/ventas/prev-same-period.ts:74` y `src/lib/ventas/dashboard-summary.ts:47`.

```ts
const res = await nueva();
if (!res.error) return res;
if (isTransientDbError(res.error)) return res;
logger(`[rpc-version] …: usando la versión anterior`);   // ← console.warn y nada más
return anterior();
```

**Qué puede salir mal.** Las migraciones de este repo las corre Daniel a mano. Entre el deploy del
código y la corrida del SQL, la función nueva no existe: PostgREST responde `PGRST202` y el
fallback baja a la versión anterior **en silencio**. En el caso del Resumen, «la versión anterior»
es la que tenía el defecto que la nueva vino a arreglar:

- `ventas_dashboard_summary` → costo **sin** las notas de débito (el que dio a Active Wear agosto un costo de −$44.483,03).
- `ventas_dashboard_prev_same_period_v2` → el «vs año pasado» cortado en **UTC**, el que mostraba Fashion Wear +1,3% cuando iba +45,1%.

Y no hay ninguna marca en pantalla. El Resumen se ve igual, con otros números.

**Peor: ese fallback es invisible también del lado del servidor.** Un `PGRST202` lo resuelve
PostgREST desde su caché de esquema y **nunca llega a Postgres**, así que no deja rastro en
`pg_stat_statements`. La única señal es un `console.warn` en los logs de Vercel.

**Cómo se comprueba** — y esto sí funciona, es lo que se hizo hoy:

```bash
URL=$(grep '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | cut -d= -f2-)
KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d= -f2-)
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$URL/rest/v1/rpc/ventas_dashboard_summary_v2" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{"p_anio":2026}'
```

`200` = la versión nueva se está usando. `404` con `PGRST202` = el sistema lleva quién sabe cuánto
mostrando los números de la versión vieja.

**Estado hoy: verificado, está bien.** Las cuatro versiones nuevas responden `200`:
`ventas_dashboard_summary_v2` (0,19 s), `ventas_dashboard_prev_same_period_v4` (0,45 s),
`comision_b2b_v8` (0,19 s). Y se comparó v1 contra v2 del costo por (empresa, mes) de 2026: **cero
diferencias mayores a $1**. No hay número mal hoy por esta vía.

Lo que queda es el mecanismo: la cadena **no tiene vencimiento**. Si una migración nunca se
aplica, el fallback corre para siempre y nada lo dice. Lo mínimo sería que el fallback pinte una
marca en la pantalla, o que mande un 🔧 SISTEMA la primera vez.

### 7.2 · 117 lecturas que descartan el error

```bash
grep -rn "const { data\(: [A-Za-z: ]*\)\? } = await" src/ --include='*.ts' --include='*.tsx' | grep -v __tests__ | wc -l
# → 117
```

Son `const { data } = await supabaseServer…` sin recoger `error`. Si la consulta falla, `data` es
`null`, el `?? []` de la línea siguiente lo convierte en lista vacía, y la pantalla muestra **cero**
donde debería mostrar un error. Las que tocan plata o decisiones:

| Dónde | Qué se vuelve cero/vacío si falla |
|---|---|
| `src/app/api/cxc-summary/route.ts:36` | «actualizado hace…» del CXC — diría que nunca se sincronizó |
| `src/app/api/cxc/enviar-email/route.ts:118, 128, 159` | el correo del cliente → se manda a la dirección de respaldo, o a nadie |
| `src/app/api/cxc/cobrar-lote/route.ts:71, 80` | igual, pero en lote |
| `src/lib/marketing/entrega-comprobante.ts:229` | el nombre del cliente en el comprobante de entrega |
| `src/app/api/guias/[id]/route.ts:113, 125, 202` | bultos y renglones de la guía al editarla |
| `src/app/api/admin/users/route.ts:57` | `passwordInUse` devuelve `false` si no puede leer → deja repetir una contraseña |

### 7.3 · Los `catch` que se tragan el error

La mayoría de los `.catch(() => null)` del repo son sobre `res.json()` para leer un cuerpo de
error — eso está bien. Los que devuelven un valor de negocio vacío son ~35, y casi todos tienen el
«falla abierto» **escrito y justificado** en el comentario de arriba (por ejemplo
`monto-guard-io.ts:169`: *«perder un aviso es peor que repetirlo»*, o `mundos.ts:170`: *«esconder de
más es peor que mostrar de más»*). Es una decisión, no un descuido.

Los dos que valdría la pena mirar porque **no** lo dicen:

- `src/lib/cuentas/leer.ts:126` — devuelve un `Map` vacío si falla, y los gastos salen con el código de cuenta pelado en vez del nombre.
- `src/lib/comisiones/exclusiones-server.ts:54, 123` — devuelven `[]`. **No mueve plata** (la exclusión de verdad la aplica `comision_b2b_v8` adentro de la RPC; esto es solo la marca informativa de la tabla), pero la pantalla dejaría de marcar clientes excluidos que sí lo están.

---

## 8 · Fuera de la base

### 8.1 · Las RPC más caras

```sql
select round(total_exec_time)::bigint ms_total, calls, round(mean_exec_time)::bigint ms_prom,
       round(max_exec_time)::bigint ms_max,
       (regexp_match(regexp_replace(query,'\s+',' ','g'), '"public"\."([a-z_0-9]+)"'))[1] as rpc
from pg_stat_statements where query like '%pgrst_call%' order by total_exec_time desc limit 10;
```

| RPC | Llamadas | Promedio | Máximo | Total (24 días) |
|---|---|---|---|---|
| `ventas_proyeccion_cierre_v7` | 651 | **726 ms** | **2.556 ms** | 472 s |
| `multifashion_mensual_v7` | 1.075 | 288 ms | 1.582 ms | 309 s |
| `ventas_dashboard_prev_same_period_v2` | 653 | 299 ms | **2.828 ms** | 195 s |
| `multifashion_overview_serie_v1` | 2.189 | 88 ms | 351 ms | 193 s |
| `multifashion_proyeccion_cierre_v1` | 1.072 | 61 ms | 186 ms | 65 s |

`ventas_proyeccion_cierre_v7` es la más cara del sistema por lejos: casi tres cuartos de segundo de
promedio y picos de **2,5 s**. Es la proyección de cierre de `/ventas` — se dispara al abrir la
pestaña.

### 8.2 · El peso de las pantallas

Del manifiesto del último build (`.next/app-build-manifest.json`, 5-sep 11:28), sumando los chunks
de cada ruta. Son bytes **sin comprimir**; el presupuesto de las reglas del repo es 300 kB
comprimidos para una página de app, o sea ~900 kB aquí.

| Ruta | Peso | Chunks |
|---|---|---|
| `/marketing` | **1.258 kB** | 21 |
| `/marketing/[marca]` | 1.241 kB | 22 |
| `/marketing/[marca]/[periodo]` | 1.238 kB | 22 |
| `/marketing/mobiliario` | 1.107 kB | 18 |
| `/guias/[id]/imprimir` | 1.020 kB | 16 |
| `/multifashion` | 859 kB | 19 |
| `/productos/cargar` | 787 kB | 12 |
| `/asistencia` | 743 kB | 13 |
| `/ventas` | 724 kB | 19 |
| `/cxc` | 717 kB | 17 |

Las cinco de arriba pasan el presupuesto. Y los componentes más grandes explican por qué:
`PlanillaTab.tsx` **2.035 líneas**, `ConfiguracionTab.tsx` 1.810, `ProductosSubtab.tsx` 1.541,
`DepuradorClient.tsx` 1.420 — todos por encima del máximo de 800 líneas que fija
`.claude/rules/common/coding-style.md`.

### 8.3 · Lecturas en cascada

Se buscó el patrón «una consulta por fila» (`await supabase…` dentro de un `for` o un `.map`
sobre datos). **No hay ninguno grave.** Los que aparecen son bucles de paginación (§2), bucles de
reintento, o bucles sobre listas de 6-8 empresas. El único con forma de N+1 es
`src/app/api/admin/users/route.ts:57`, que compara una contraseña con bcrypt contra cada usuario —
pero es CPU en Node, no consultas, y son pocos usuarios.

---

## Lo que arreglaría primero

Ordenado por cuánta plata puede mostrar mal, no por dificultad.

### 1 · Paginar la lectura de fichas del sync de artículos — **está mal hoy**
`src/lib/switch-api/sync-articulo-info.ts:266`. Cambiar por `leerTodoPaginado` con
`.order("codigo")`. Es una función que ya existe y un cambio de cinco líneas. Sin esto, la
clasificación de Reebok no termina nunca y se queman ~400 llamadas a Switch por día. Y el mismo
código está esperando a `vistana` (8.273 artículos) para hacerlo ocho veces peor.
**Se verifica:** `select count(*) from switch_articulo_info where empresa_key='active_shoes' and ficha_at is not null;` → hoy 1.408. Después del arreglo, el número de pendientes reportado por el cron tiene que bajar corrida a corrida hasta 0.

### 2 · Cerrar o arreglar `GET /api/clientes/[codigo]` — **está mal hoy, sin consumidor**
Cuatro lecturas sin tope, una de ellas sin `.order()`. La pantalla ya usa la RPC
`cliente_ficha_ventas`, que hace lo correcto. Lo más barato y más seguro es **borrar el GET** (el
componente solo usa el PATCH). Si se prefiere conservarlo, tiene que llamar a la misma RPC.
Mientras esté, `TCKCTA` responde con ~13% de $372.286,96 y cuatro clientes pierden la fecha de su
última factura.

### 3 · Que el respaldo verifique el conteo, y que pagine por cursor
`src/app/api/cron/backup/route.ts:430`. Dos cambios independientes:
**(a)** pedir `count: "exact"` en la primera página de cada tabla y **fallar ruidosamente** si el
total no cuadra — es lo que ya hace `leerTodoPaginado`, y es lo único que separa «respaldo
incompleto» de «respaldo incompleto que parece completo».
**(b)** cambiar `OFFSET` por cursor (`where id > último`). Hoy son 378 s de base cada 24 días y el
costo sube al cuadrado del tamaño.
Es el punto 3 y no el 1 porque hoy el respaldo **sí está saliendo completo** — lo que falta es la
garantía de que se entere el día que deje de salir.

### 4 · Que el fallback de versión de RPC deje de ser invisible
`src/lib/ventas/rpc-version.ts`. Hoy está todo bien (verificado con `curl`, §7.1), pero el
mecanismo puede dejar el Resumen mostrando los números de una versión con defecto conocido y solo
lo dice un `console.warn`. Lo mínimo: un 🔧 SISTEMA la primera vez que un fallback se dispara, con
el nombre de la función. Es la regla 2 de las alertas aplicada a un caso que hoy no cubre.

### 5 · Un índice y un tope de conteo — cinco minutos cada uno
- `create index on switch_facturas (synced_at desc);` → mata 54 s de barridos completos (§4.3).
- Los tres `.limit(1000)` (§1.5): bajarlos a 999 o subirlos a 1001. Suena tonto y no lo es: hoy es imposible distinguir «devolvió el tope» de «PostgREST lo cortó».

### 6 · Vigilar, no arreglar
Estos hoy están bien y hay que volver a medirlos, no tocarlos:
- `switch_estadocuenta_aging` (211 filas, techo 900) — es el total del CXC. Es el que menos colchón tiene de todo lo que mueve plata.
- `switch_estadocuenta_aging_boston` (390 de 4.912 clientes).
- Las nueve tablas de 400-1.000 filas del §1.1.
- `guia_transporte`, que crece ~7,5 MB al año en firmas base64 y entra entero al respaldo diario.

**La regla de fondo, que es la que sirve más que cualquiera de estos seis puntos:** cada vez que
una consulta lee una tabla que puede pasar de 1.000 filas, la pregunta no es «¿pagina?» sino
«**¿qué pasa si devuelve exactamente 1.000?**». Si la respuesta es «se ve igual», hay que agregar
el conteo.
