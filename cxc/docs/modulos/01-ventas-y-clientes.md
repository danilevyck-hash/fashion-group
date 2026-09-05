# Grupo «Ventas y clientes» — referencia por módulo

> Documento de REFERENCIA, no de sugerencias (esas viven en `docs/eficiencia/01-ventas-y-clientes.md`).
> Escrito el 4-sep-2026. **Verificado y re-medido contra producción el 5-sep-2026**, afirmación por
> afirmación: cada cifra importante lleva debajo la consulta que la produjo, para poder repetirla.
> Lo que estaba mal está listado al final, en **«Lo que estaba mal»**.
> Las reglas generales del sistema (roles, empresas, canales de Telegram, `db-max-rows`) están en
> `CLAUDE.md`; aquí va lo que le falta.

> 🔑 **Cómo se midió.** Todo lo de este documento sale de la Management API de Supabase contra el
> proyecto `rspocgqhtpveytgbtler`, con `count(*)` en SQL (nunca contando filas devueltas: `db-max-rows`
> = 1000 y corta en silencio). El molde:
> ```bash
> TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2)
> curl -s -X POST "https://api.supabase.com/v1/projects/rspocgqhtpveytgbtler/database/query" \
>   -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
>   -d '{"query":"select count(*) from clientes_master where deleted is not true"}'
> ```
> Lo del CÓDIGO se verifica con `grep` sobre `src/` buscando la llamada real (`.from("tabla")`,
> `fetch("/api/…")`), **nunca el nombre suelto en un comentario**: es exactamente así como esta
> documentación acumuló las mentiras que se corrigieron hoy.

Cubre cinco de los diez módulos del grupo **Ventas y clientes** (`src/lib/modules.ts`,
`group: "ventas-clientes"`):

| Módulo | `key` | `href` | `roles[]` del catálogo |
|---|---|---|---|
| Vista General | `vista-general` | `/vista-general` | `admin` |
| Ventas | `ventas` | `/ventas` | `admin` |
| Cuentas por Cobrar | `cxc` | `/cxc` | `admin`, `vendedor` |
| Clientes | `directorio` | `/clientes` | `admin`, `secretaria`, `vendedor` |
| Proveedores | `proveedores` | `/proveedores` | `admin`, `contabilidad` |

Los otros cinco del mismo grupo (Comisiones como ficha propia, Referencia, Multifashion,
Confecciones Boston, Catálogos) tienen su propio documento; aquí aparecen solo cuando conectan.

> ⚠️ **`roles[]` del catálogo ≠ quién entra de verdad.** Son tres capas distintas y no coinciden:
> 1. `roles[]` en `src/lib/modules.ts` decide **si se pinta la ficha** (y solo cuando
>    `role_permissions` no manda otra cosa: `getVisibleModules` le da PRIORIDAD a `fg_modules`).
> 2. `useAuth({ moduleKey, allowedRoles })` decide **si la pantalla se abre**. Y `hasModuleAccess`
>    (`src/lib/auth-check.ts`) devuelve `true` si el rol está en `allowedRoles` **o** si la key está
>    en `fg_modules` — o sea que `allowedRoles` puede ser MÁS ancho que `roles[]`.
> 3. `requireRole` / `getSession` en cada ruta de API decide **si los datos viajan**.
> El caso concreto está abajo, en CXC: `secretaria` **no** está en `roles[]` de `cxc` pero **sí** en
> el `allowedRoles` de `/cxc` y en el 403 de `/api/cxc/aging`.

El middleware (`src/middleware.ts`) **no mira módulos ni roles**: solo valida que la cookie
`cxc_session` esté firmada y que la fila de `user_sessions` no esté revocada. Todo el permiso por
módulo vive en la página y en la ruta.

⚠️ Dos números que afectan a todos los módulos de abajo, re-medidos el **5-sep-2026**:
`vercel.json` tiene **82 entradas de cron** (eran 80 el 4-sep; entraron `prestamos-caducan`
`"15 13 * * *"` y `sync-clientes-boston` `"10 7 * * 0"`, la única entrada SEMANAL que toca Switch).
Y **TODAS las migraciones del repo están aplicadas hasta `20260928120000` inclusive** — ninguna
queda «pendiente», incluidas las tres de hoy: `20260926120000` (contacto en `clientes_master`),
`20260927120000` (canal en `cxc_emails_enviados`) y `20260928120000` (tramos finos de Boston).

```sql
-- las 82 entradas: python3 -c "import json;print(len(json.load(open('vercel.json'))['crons']))"
select version, name from supabase_migrations.schema_migrations where version >= '20260920' order by version;
-- → …20260926120000 clientes_master_contacto · 20260927120000 cxc_envios_canal
--   · 20260928120000 aging_boston_tramos_finos   (5-sep-2026)
```

---

# Vista General (`/vista-general`, key `vista-general`)

## Qué es

El tablero del dueño: una sola pantalla, un solo mes, con lo que Daniel mira para saber cómo va el
grupo — cuánto se vendió, con qué margen, cuánta plata hay en el banco y en la bodega, cuánto se
debe y cuánto se le debe, y qué está pidiendo atención. **No calcula nada propio**: reúsa las mismas
fuentes que los módulos, para que ningún número de aquí pueda diferir del módulo que lo genera.

Su regla de fondo, dicha por Daniel el 13-ago-2026: **por empresa, no del grupo**. La tarjeta
«Gastos» con un total del grupo y la tarjeta «Rentabilidad» del grupo se borraron —y también se
borró el número del *payload*, para que la pantalla no pueda volver a pintarlo sin que se note.

## Quién entra

- **Solo `admin`.** Doble candado: `roles: ["admin"]` en el catálogo,
  `useAuth({ moduleKey: "vista-general", allowedRoles: ["admin"] })` en la página, y
  `requireRole(req, ["admin"])` en `GET /api/dashboard/vista-general`.
- Cualquier otro rol que escriba la URL ve el aviso rojo «No tienes acceso a este modulo» y a los
  2 s cae en `/home`; la API le contesta **403** aunque tenga sesión válida.
- Persona real: es el módulo de Daniel. No hay una segunda persona con rol `admin` medible sin
  consultar `fg_users` (ver «Los datos»).

## Las pantallas

Una sola pantalla, sin sub-rutas. Todo el estado que se puede compartir vive en la URL:
`?mes=YYYY-MM` (`useUrlState`, modo `replace` — el Atrás del navegador no cicla por meses).

### Barra de mes
Flechas `‹` / `›` y el nombre del mes en el medio («Septiembre 2026»). La flecha de adelante queda
apagada en el mes en curso. Un `?mes=` **inválido o futuro** se sanea a mes actual en el cliente, y
además el servidor lo *clampea*: formato malo → **400 «Mes inválido. Usa el formato YYYY-MM.»**;
mes futuro → se responde con el mes en curso.

### Seis tarjetas de KPI (cada una es un enlace)

| Rótulo en pantalla | Valor | Segunda línea | Lleva a |
|---|---|---|---|
| **Ventas** (píldora «mes en curso» si aplica) | `moneyK` del total de las **8 empresas** | `▲/▼ X% vs <mes> <año>`; en mes en curso el año pasado va recortado a los **mismos días**: «vs 1–3 sep 2025» | `/ventas` |
| **Margen bruto** | `utilidad ÷ ventas` del mes | `$X utilidad bruta` | `/ventas` |
| **Disponibilidad** | suma del ÚLTIMO saldo de banco por empresa | `al <fecha más vieja>` | `/saldos-banco` (redirige a `/gastos-contabilidad?tab=saldos-banco`) |
| **Inventario** (píldora «al costo») | `totalCosto` | `N piezas · al <fecha>` (ámbar si pasó de 26 h) | `/referencia` |
| **Por cobrar (CXC)** | total de `switch_estadocuenta_aging` | `$X con más de 90 días` (rojo si > 0) | `/cxc` |
| **Por pagar (CXP)** | total de `switch_proveedor_estadocuenta` | `$X vencido +90d` (ámbar si > 0) | `/proveedores` |

Al pasar el mouse, la segunda línea se reemplaza por «Ir a X →». Ninguna tarjeta es editable.

### Panel «Inventario por empresa»
Una fila por empresa con `N piezas · a precio $X` a la izquierda y el **costo** a la derecha; al pie
el «Total al costo» y, debajo en gris, «A precio de etiqueta — potencial, no plata que tengas».
Cierra con lo que **no** se midió: las empresas sin inventario con su motivo, y cuántas piezas de
cuántos artículos no tienen costo cargado en Switch. Enlace «Ver artículo por artículo →» a
`/referencia`. Si la lectura se cae: «No se pudo leer el inventario en este momento.» — **nunca $0**.

### Panel «Gastos por empresa»
Una fila por cada una de las 8. Con número: el gasto en dólares. Sin número: una **píldora con el
motivo exacto** y debajo la frase larga. Los cuatro motivos y sus textos exactos viven en
`src/lib/egresos/gasto-mostrable.ts`:

| Píldora | Cuándo | Frase |
|---|---|---|
| **Sin cargar** (`sin_movimientos`) | el mes se pidió y no trajo movimientos | «Los gastos de esta empresa llegan hasta \<mes\>.» |
| **Sin traer** (`sin_datos`) | ese mes nunca se le pidió a Switch | «Este mes todavía no se ha traído de Switch. Lo último que hay es de \<mes\>.» |
| **No se baja sola** (`no_automatico`) | Confecciones Boston: su usuario de Switch es el de Daniel | «Los gastos de esta empresa no se traen solos de Switch…» |
| **Nada es gasto** (`sin_gasto`) | salió plata pero el total del grupo 6 dio 0 | «Este mes salió plata, pero nada de eso quedó registrado como gasto.» |

Arriba a la derecha: «N de 8 con gastos cargados». Enlace «Ir a Gastos →» con el mes puesto.
🔴 **No hay total** — y la bajada del panel lo dice con todas las letras.

### Lista «Rentabilidad por empresa»
Tabla en escritorio (≥ `md`) y tarjetas en celular. Columnas: **Empresa · Ventas · Rentabilidad ·
Estado**. Tocar una fila la despliega y muestra
`Utilidad bruta $X − Gastos $Y = Rentabilidad $Z` más «Ver gastos de \<empresa\> →»
(`/gastos-contabilidad?mes=…&empresa=…`). Sin gasto utilizable no hay número: va el motivo.

Semáforo (`estadoSemaforo`, `src/lib/vista-general-calc.ts`): `null` → **Sin conectar** (gris);
`< 0` → **Pierde plata** (rojo); `ventas ≤ 0` → **Al límite**; `rentabilidad/ventas < 5%` →
**Al límite** (ámbar); resto → **Sana** (verde). Exactamente 5 % es verde.

### «Requiere tu atención» — tres tarjetas
- **Clientes con saldo +90 días** → top 6 de `switch_estadocuenta_aging` con vencido > 0, enlaza a `/cxc`.
- **Proveedores con saldo vencido +90d** → top 6 de `switch_proveedor_estadocuenta`, enlaza a `/proveedores`.
- **Reclamos sin pagar (+30 días)** → hasta 8 reclamos no pagados con `fecha_reclamo` ≥ 30 días,
  enlaza a `/reclamos?id=…`.
Cada tarjeta lleva un contador y, vacía, dice «Nada vencido a +90 días.» / «Sin reclamos antiguos pendientes.»

**La tarea más frecuente (4 pasos):** entrar → mirar Ventas y Margen del mes → bajar a Rentabilidad
por empresa y abrir la que esté en rojo → tocar «Ver gastos de X →».

## Los datos

Esta pantalla **no tiene tabla propia ni escribe nada**. Todo sale de un único `GET
/api/dashboard/vista-general?mes=YYYY-MM` (`dynamic = "force-dynamic"`, sin caché) que hace nueve
lecturas en paralelo:

| Lectura | Fuente exacta | Para qué | Si falla |
|---|---|---|---|
| `leerDashboardSummary(anio)` | RPC `ventas_dashboard_summary_v2` (cae a `_v1`) | ventas y utilidad por empresa × mes, las 8 | `ventas` y `margen` viajan `null` |
| `ventas_rollup_mensual_mv` | `anio = anioSel − 1` | el año pasado de un mes CERRADO | Δ en blanco |
| `leerPrevSamePeriod(anio)` (solo si el mes es el EN CURSO) | RPC `ventas_dashboard_prev_same_period_v4` → `_v3` → `_v2` | el año pasado recortado a los **mismos días** | la tarjeta no muestra Δ; **nunca** compara contra el mes entero |
| `switch_estadocuenta_aging` (la **vista viva**, no la MV) | columnas `company_key, nombre, codigo, total, d0_30 … mas_365` | CXC | KPI en 0 y lista vacía |
| `switch_proveedor_estadocuenta` | `empresa_key, nombre, saldo_total, aging` (jsonb) | CXP | igual |
| `reclamos` | `deleted = false`, `estado <> 'Pagado'`, orden por `fecha_reclamo` | la tercera tarjeta de atención | lista vacía |
| `leerEgresosMes(mes)` | `egresos_varios` + `egresos_importaciones` (vía `src/lib/egresos/leer.ts`) | gasto y rentabilidad | **falla abierto**: «Los gastos de Switch todavía no están conectados.» |
| `bancos_saldos` | `empresa_key, saldo, fecha_dato` ordenado `fecha_dato DESC` | Disponibilidad | «Sin saldos cargados» |
| `leerInventarioValorizado()` | RPC `inventario_valorizado_v1`; si la función no existe, cae a `switch_articulo_info` paginado | Inventario | **falla abierto**: «No se pudo medir» |

Detalle de cada tabla en `CLAUDE.md § Dónde vive cada dato`. Los conteos medidos están en la sección
«Los datos» de cada módulo de abajo.

Cosas que hay que saber de esta ruta y no están en ningún otro lado:

- **El CXC se lee de la vista VIVA, no de la MV**, a propósito: la MV se refresca 1×/día y divergía
  con `/cxc` intradía. Así el Δ contra `/cxc` es 0,00 siempre.
- **El CXP suma TODAS las filas, incluidos los saldos a favor (negativos)**, para cuadrar con el
  `grupo_saldo` del módulo Proveedores. Antes filtraba `saldo_total > 0` y no cuadraba.
- **Tramos idénticos para CXC y CXP**: Corriente = `d0_30 + d31_60 + d61_90` (títulos `0-30/31-60/61-90`
  en CXP) y Vencido = `≥ 91` (`d91_120 … mas_365`). «Vigilancia» (91-120) es un **subconjunto** del
  vencido que se muestra como detalle: no se suma aparte, así `corriente + vencido = total`.
- **El gasto es `totalGastoCent`, solo el grupo 6** del reporte de Egresos Varios — no `totalSalidaCent`,
  que incluye transferencias entre cuentas propias, planilla por pagar e intercompañía. Medido sobre
  los 378 renglones de vistana: de $243.342,48 que salieron, solo $118.753,76 son gasto.
- **`inventario` cubre solo las 6 de Fashion Group** (`EMPRESAS_CON_INVENTARIO = B2B_EMPRESA_KEYS`,
  derivado del propio `syncArticuloInfo`). Boston y Multifashion salen en el renglón «sin inventario»
  con su motivo, nunca en $0. El umbral de «viejo» es **26 h** (`HORAS_INVENTARIO_VIEJO`).
- **`gastos.total` y `rentabilidad` del grupo NO EXISTEN en la respuesta.** Se borraron del payload y
  `rentabilidadGrupo()` se borró del módulo puro — no se dejó comentada.

## De dónde vienen los datos

No tiene cron propio. Se alimenta, indirectamente, de:

| Cron (UTC) | Qué le trae |
|---|---|
| `switch-sync?tipo=facturas` — 11:50 · 15:00 · 19:00 · 23:00 (8 empresas) y 13:00 · 17:00 · 21:00 · 00:15 (solo `american_classic`) | Ventas y margen |
| `switch-sync?tipo=estadocuenta` — 16:00/16:05/16:10 y 21:10/21:15/21:20 (pares de empresas) | CXC |
| `sync-proveedores` — 09:30 | CXP |
| `sync-egresos-varios` — 10:35 | Gastos y rentabilidad |
| `sync-articulo-info` — 04:30 / 04:40 / 04:50 (3 pares) | Inventario valorizado |
| `switch-reconciliacion` — 10:00 · 14:00 · 18:00 | refresca `ventas_rollup_mensual_mv` y recupera lo que falló |
| `refresh-clientes-views` — 07:35 | refresca el rollup mensual |
| Carga a mano de contabilidad | `bancos_saldos` (la escribe una persona, no un cron) |

Qué pasa si una fuente falla: cada bloque tiene su propio modo de fallo, y **ninguno pinta $0**.
Ventas/margen viajan `null` («Sin datos de ventas»); el inventario dice «No se pudo medir»; el gasto
dice el motivo por empresa; el CXC/CXP quedan en 0 con la lista vacía (es el único bloque sin frase
de «no se pudo leer»).

## Las reglas que ya están fijadas

- 🔴 **No existe un total de gastos del grupo ni una rentabilidad del grupo.** Daniel, 13-ago-2026:
  *«La tarjeta de Gastos de Vista General también por empresa»* y *«no quiero Rentabilidad del grupo,
  lo quiero por empresa»*. Se borró del payload y del módulo puro, no se comentó.
- 🔴 **Las tres cifras de una fila son de la MISMA empresa.** `rentabilidadEmpresa()` recibe UNA
  empresa y no tiene forma de ver las otras — es lo que hace imposible restarle a la utilidad de una
  el gasto de otra. Candado: `src/__tests__/vista-general-calc.test.ts`.
- 🔴 **Gasto ausente ⇒ rentabilidad `null`, nunca 0.** Tratarlo como cero daría
  `rentabilidad = utilidad bruta` — un número precioso, indistinguible del de una empresa sana.
- 🔴 **Un inventario sin medir NO es $0.** `leerInventarioValorizado` o trae los números o revienta;
  quien la llama la envuelve en `.catch` y pinta el motivo.
- 🔴 **El mes en curso se compara contra los MISMOS DÍAS del año pasado**, con la definición única de
  `src/lib/ventas/clientes-corte-comparativo.ts` y la RPC `_v4`. Medido el 3-sep-2026: por mes entero
  el grupo decía −97,9 % cuando era −92,8 %, y Boston −93,5 % cuando iba +2,2 %. Candado:
  `src/__tests__/lib/mismos-dias-todas-las-comparaciones.test.ts`.
- ⚠️ **Vista General SÍ suma gastos entre empresas… no.** La regla de «los gastos nunca se suman»
  del módulo Gastos vale también aquí desde el 13-ago-2026: aquí NO hay suma. La línea de
  `CLAUDE.md § Gastos, mayor y banco` que dice «⚠️ Vista General SÍ suma gastos entre empresas»
  quedó vieja — el `gastos.total` se retiró ese mismo día. Ver «Lo que sobra o no cuadra».
- El **punto de equilibrio** se retiró entero (11-ago-2026): su fórmula pide separar gasto fijo de
  variable y esa marca (`gastos_categorias.es_fijo`) murió con la carga manual de gastos. No vuelve
  hasta que exista una clasificación de cuentas aprobada por Daniel.

## Con qué conecta

**Qué lee de otros módulos** (todo de lectura, cero escritura):

| Módulo dueño | Qué le lee |
|---|---|
| Ventas | RPC `ventas_dashboard_summary_v2`, `ventas_rollup_mensual_mv`, `ventas_dashboard_prev_same_period_v4` |
| Cuentas por Cobrar (`/cxc`) | vista `switch_estadocuenta_aging` |
| Proveedores | `switch_proveedor_estadocuenta` |
| Gastos | `leerEgresosMes` (`egresos_varios` + `egresos_importaciones`) y `bancos_saldos` |
| Referencia / catálogo | `switch_articulo_info` vía `inventario_valorizado_v1` |
| Reclamos | tabla `reclamos` |

**Quién lee lo suyo:** nadie. Es una hoja del grafo — no tiene tabla, no tiene endpoint que otro
consuma, y sus enlaces salientes (`/ventas`, `/cxc`, `/proveedores`, `/referencia`,
`/gastos-contabilidad`, `/saldos-banco`, `/reclamos`) son navegación.

**Qué se rompería si cambiara la forma de sus datos:**
- Renombrar o cambiar la firma de `ventas_dashboard_summary_v2` rompe A LA VEZ Vista General,
  Ventas › Resumen y el Telegram mensual del grupo (`src/lib/grupo-resumen-mensual.ts`): las tres
  entran por `leerDashboardSummary` (`src/lib/ventas/dashboard-summary.ts`).
- Cambiar los nombres de bucket de `switch_estadocuenta_aging` (`d0_30 … mas_365`) o su `company_key`
  rompe las constantes `CXC_CORRIENTE_KEYS` / `CXC_VENCIDO_KEYS` de esta ruta y, al mismo tiempo,
  `/api/cxc/aging`, `/api/cxc-summary`, `/api/clients` y `src/lib/cxc/estado-cuenta-data.ts`.
- Cambiar los `title` del `aging` jsonb de `switch_proveedor_estadocuenta` (`"0-30"`, `"91-120"`,
  `"Mas de 365"`…) rompe `CXP_*_TITLES` aquí y `agingKeyForBucket` en `src/lib/proveedores-aging.ts`.
- Quitar la RPC `inventario_valorizado_v1` NO rompe nada: `leerInventarioValorizado` cae al camino
  paginado con los mismos números. Quitar `switch_articulo_info` sí.

## Por qué está así

- 🔴 **«no quiero Rentabilidad del grupo, lo quiero por empresa»** (13-ago-2026) → la tarjeta
  «Rentabilidad» del grupo se borró, y con ella la función `rentabilidadGrupo()` y el campo
  `rentabilidad` del *payload*. En su lugar, la lista «Rentabilidad por empresa», donde cada empresa
  compara SU venta contra SU gasto (`src/app/vista-general/RentabilidadPorEmpresa.tsx`,
  `src/lib/vista-general-calc.ts`).
- 🔴 **«La tarjeta de Gastos de Vista General también por empresa»** (13-ago-2026) → misma cirugía en
  la tarjeta de gastos: se fue el total y quedó el panel «Gastos por empresa», con el motivo escrito
  cuando no hay número (`src/app/vista-general/GastosPorEmpresa.tsx`).
- **«cada compañía por separado, sin juntar los gastos entre todos»** (regla del módulo Gastos,
  aplicada aquí) → por eso la bajada del panel dice con todas las letras que **no hay un total**: sin
  esa frase, alguien suma las filas de cabeza y se arma el número que Daniel pidió no tener.
- 🔴 **«esto no entendí bien, ¿no debería de ser egresos varios y ya?»** (13-ago-2026) → el gasto dejó
  de salir del **mayor contable** y pasa a salir de **Egresos Varios**. El mayor tenía 135 renglones
  en todo 2026, casi todos de enero: **no producía número para NINGUNA empresa en NINGÚN mes**, y la
  Rentabilidad mostraba «—» en las ocho filas, todos los meses. Egresos Varios está vivo
  (`src/app/api/dashboard/vista-general/route.ts`, bloque «EL GASTO YA NO SALE DEL MAYOR»).
- **«por ahí mismo pero no está actualizado aún, estamos en eso»** → Daniel confirmó que los gastos
  de todas las empresas se registran en Egresos Varios, así que la fuente es la correcta y los meses
  van a llegar solos. Por eso la pantalla dice «Sin cargar» en vez de tratar el hueco como avería.
- **«no quiero mensaje de costos»** (3-ago-2026) → ningún aviso de costo sospechoso sale por Telegram;
  el guard sigue guardando el costo en 0 y el módulo lo dice en pantalla.
- El **inventario valorizado** se agregó porque el dato ya viajaba todas las madrugadas a
  `switch_articulo_info` y **nadie lo sumaba nunca**. Las tres reglas de esa tarjeta —el número grande
  es el COSTO, Boston y Multifashion no pueden salir en $0, y la fecha va SIEMPRE pegada al número—
  están escritas en el encabezado de `src/app/vista-general/InventarioPorEmpresa.tsx`.

- 🔴 **«y entonces borra Mayor contable en el sistema»** (13-ago-2026, horas después de cambiar la
  fuente) → se retiró el mayor **entero**: `src/lib/mayor/*`, `src/lib/switch-api/sync-mayor.ts` y
  `/api/cron/sync-mayor`. Verificado: los tres **ya no existen** en el repo. Las tablas
  `mayor_lineas` y `mayor_importaciones` sí quedan.
- **«hagámoslo carga manual, pero que se pueda editar, corregir, ver historial, o sea lo necesario
  para que la contable meta los saldos y vea si lo hizo bien»** (13-ago-2026) → nació el historial de
  `bancos_saldos`, que es la misma tabla y el mismo criterio (último `fecha_dato` por empresa) que
  lee la tarjeta **Disponibilidad**.
- 🔴 **«solo se queda CXC de Boston en su tab, sin que toque ni se mezcle con los otros. Déjalo en
  Vista General»** y **«Boston también quiero verlos en ventas-resumen»** (2-sep-2026) → **la PLATA
  de Boston sigue sumando en este tablero** ($472.856,97 = 7,54 % de la venta 2026 al 5-sep; eran
  $463.898,47 = 7,43 % al 2-sep, la cifra que citan `CLAUDE.md` y el post-mortem — se reprodujo
  exacta con el corte de esa fecha, así que la cita es buena y solo estaba vieja); lo que salió de
  las superficies del grupo son sus **clientes**. «Sus ventas suman, pero sus clientes no se ven.»
- **«no aparezca nunca»** (30-jul-2026, sobre encontrar por nombre el saldo de un cliente de Boston)
  → el buscador ⌘K filtra por inclusión a las 6 del grupo, **y los totales de Ventas y de Vista
  General no se tocan**.

**Decisiones suyas sin cita textual, pero atribuidas nominalmente en el código:**
- **Boston no entra al cron de egresos** — «pedido de Daniel: su usuario de Switch es el de él».
  De ahí sale el motivo `no_automatico` y la píldora **«No se baja sola»**.
- **Boston y Multifashion no sincronizan catálogo** — «decisión de Daniel: el cron cubre las 6 de
  Fashion Group». Por eso van en su renglón con motivo escrito y **nunca en $0**.
- **El número grande del inventario es el COSTO** — «el costo es la plata que Daniel PUSO; el precio
  es lo que valdría si vendiera todo». $2,80 M contra $4,06 M.
- **Letra más chica antes que cortar el nombre** (piso 12 px, ni dos líneas ni abreviar) — decisión
  del #301, reafirmada al rehacer la grilla de «Requiere tu atención».
- **Clasificar las ~60 cuentas del grupo 6 en fijo/variable es decisión de negocio de Daniel** — por
  eso no hay punto de equilibrio.
- **No borrar tablas** — «eso es irreversible y Daniel no lo pidió».
- **Las DDL las corre Daniel a mano** — por eso toda RPC lleva cadena de versiones con caída.

## Lo que se intentó y se retiró

- **La tarjeta «Gastos» del grupo** (un total) y **la tarjeta «Rentabilidad» del grupo** — retiradas
  el **13-ago-2026**. 🔴 **No se dejaron comentadas ni «por si acaso» en el `payload`**: mientras el
  número exista en la respuesta, la pantalla puede volver a pintarlo sin que nadie lo note. La
  función `rentabilidadGrupo()` se **borró entera** del módulo puro por el mismo motivo.
- **El PUNTO DE EQUILIBRIO** — retirado el **11-ago-2026**. Su fórmula es `gastos fijos ÷ margen`, y
  la marca de «fijo» venía de `gastos_categorias.es_fijo`, de la carga manual de gastos. Ni el mayor
  ni Egresos Varios la traen: solo el código de cuenta. Clasificar las ~60 cuentas del grupo 6 en
  fijo y variable es una decisión de negocio que Daniel no aprobó, y calcularlo con supuestos propios
  daría un «necesitas vender $X» con un X inventado. **Se prefiere no mostrarlo antes que inventarlo.**
  Con él se borraron `prorratearGrupo` y `puntoEquilibrio` de `src/lib/vista-general-calc.ts`.
- **La carga manual de gastos** (`empresa_gastos_mensuales`, `gastos_categorias`) — el módulo que las
  llenaba se retiró (#467) y las tablas quedaron en 0 filas. **No se borran** (irreversible, y Daniel
  no lo pidió): quedan como respaldo histórico, sin lectores, con un test que pone el build rojo ante
  un `DROP`.
- **El mayor contable como fuente del gasto** — se dejó de llamar `leerMayorMes` desde aquí el
  13-ago-2026. ⚠️ El comentario que quedó en la ruta dice que «el mayor sigue vivo y sigue siendo una
  de las dos pestañas del módulo Gastos» — **eso ya no es cierto** (ver «Lo que sobra»).
- **La fila del grupo en el semáforo** — nunca se agregó, y por la misma razón: no hay forma de
  escribir ese número que no sea la que Daniel pidió no tener.
- **El nombre «Semáforo por empresa»** — se abandonó el 13-ago-2026 por «Rentabilidad por empresa»:
  «semáforo» es jerga nuestra y quien busca la rentabilidad de una empresa no la encuentra debajo de
  esa palabra. ⚠️ El atributo `data-fila-semaforo` **se mantiene a propósito**: lo usan cuatro
  scripts de medición y renombrarlo los dejaría midiendo cero filas **en verde**.

- **La MV `switch_estadocuenta_aging_mv` dejó de leerse aquí** — refresca 1×/día y quedaba atrás de
  los re-syncs de la reconciliación, así que divergía con `/cxc` intradía. Se lee la **vista viva**
  para garantizar Δ = 0,00. La MV sigue existiendo; esta ruta ya no la toca.
- **El filtro `saldo_total > 0` del CXP — retirado.** Excluía 2 proveedores con saldo a favor y el
  total no cuadraba con el `grupo_saldo` del módulo Proveedores.
- **El YoY contra el MES ENTERO** en el mes en curso — reemplazado el 3-sep-2026 por
  `leerPrevSamePeriod`. **Un mes cerrado sigue comparándose entero contra entero** desde la MV: el
  camino viejo quedó vivo solo para eso.
- **La RPC `ventas_dashboard_summary` (v1) — degradada a fallback** el 3-sep-2026: su costo salía de
  `switch_articulo_diario`, que no trae notas de débito (Active Wear agosto 2026: **−$44.483,03**).
- **`get_app_setting("multifashion_meta_anual_2026")` — borrada** de la carga que alimenta este
  tablero: «una consulta por cada carga para un número que no se dibuja en ninguna pantalla», con la
  clave clavada en «2026». La fila y `app_settings` **no se tocaron**.
- **El guard del costo diario se mudó** de `costo-guard.ts` a `monto-guard.ts` al extenderlo a las 8
  tablas de plata, **sin dejar copia** («dos implementaciones de la misma regla es una que se corrige
  y otra que sigue mintiendo»). Lo que sí quedó vivo es `esCostoSospechoso`, la que evita repetir el
  incidente que reventó el margen de este tablero a **−567.838 %** (Boston, artículo 0806,
  18-jul-2026).
- 🩸 **El campo `instalado` es un ZOMBI declarado.** Existía para degradar limpio mientras la
  migración de `egresos_varios` no corriera; la tolerancia se **retiró** el 3-sep-2026, pero el campo
  **sigue viajando siempre en `true`** solo porque la pantalla y esta ruta lo leen.
- **El `truncate` del subtítulo de las tarjetas KPI — retirado.** En iPhone la tarjeta mide 175 px y
  «▼ 20.3% vs julio 2025 (parcial)» necesita 148: se perdía justo el **«(parcial)»**, que es el aviso
  de que la comparación está incompleta.
- **Las 3 columnas de «Requiere tu atención» a partir de `lg` — cambiadas.** Censo por ancho del
  recorte del nombre: 390 → 12 px · 834 → 0 · **1024 → 125 px** · 1280 → 50 · 1440 → 50. Con un paso
  intermedio de 2 columnas, 1024 baja a ~9 px; de `xl` para arriba quedan las 3 de siempre.
- **La tabla de Rentabilidad pasa a tarjetas por debajo de `md`** (no de `lg` como el resto de
  Ventas): pide 530 px mínimo contra 356 en un iPhone de 390, pero a 834 ya medía 0 de arrastre.

## Cuánto se usa

⚠️ **No hay telemetría de pantallas en todo el sistema** (barridas las 137 tablas de `public`; sin
Vercel Analytics en `package.json`). Lo único que capta rutas es Sentry con `tracesSampleRate: 0.1`,
y ese dato vive fuera de Supabase.

- **Quién puede entrar:** **2 personas**, los dos usuarios con rol `admin` — **daniel** (el dueño,
  `is_owner = true`) y **alberto**. `vista-general` **no está en ninguna fila de
  `role_permissions`**, y no hace falta: `getVisibleModules` devuelve todo para `admin` sin mirar la
  tabla.
- **Sesiones abiertas en los últimos 30 días** (re-medido el 5-sep-2026): daniel **110** (340 en 90
  días, última el 3-sep-2026) · alberto **1** (15 en 90 días, última el 1-sep-2026). Sesiones vivas
  (`revoked is not true`): daniel **40**, alberto **1**.
  ⚠️ El «74» que decía este documento el 4-sep **no se reproduce**: con una ventana de 30 días que
  avanzó un día el número tendría que BAJAR, no subir a 110. Se conserva la consulta para que la
  próxima medición sea comparable:
  ```sql
  select user_name,
    count(*) filter (where created_at >= now() - interval '30 days') d30,
    count(*) filter (where created_at >= now() - interval '90 days') d90,
    count(*) filter (where revoked is not true) vivas
  from user_sessions group by 1 order by 2 desc;
  ```
  🔴 **`user_sessions` es lo único que hay: no mide aperturas de pantalla, mide inicios de sesión.**
  Y `activity_logs` **no tiene columna de usuario** —solo `user_role`—, así que atribuir una fila de
  esa tabla a una PERSONA es una inferencia, nunca una medición.
- 🔴 **El módulo no escribe NADA.** `src/app/api/vista-general/` no existe y
  `/api/dashboard/vista-general` solo tiene `GET`. Cero filas en `activity_logs` con `entity_type` de
  vista general. **Cuántas veces se abre: no medible.**
- Lo que sí se puede afirmar: las siete fuentes que alimenta la pantalla están vivas. En los últimos
  30 días, `facturas` 1.370 corridas (0 errores) · `estadocuenta` 582 (7 errores, todos del reporte
  web de Boston) · `proveedores` 210 (0) · `articulo_info` 154 (0) · `egresos_varios` 161 (**10
  errores el 1 y el 2 de septiembre**, el cambio de formato de Switch, **ya resuelto**).

## Qué papeles y Excel produce

🔴 **Ninguno.** Vista General no tiene botón de export, ni PDF, ni Excel, ni correo, ni alerta de
Telegram propia. Es una pantalla para mirar; todo lo que se lleva se baja desde el módulo al que
enlaza (Ventas, CXC, Proveedores, Gastos, Referencia, Reclamos).

El pariente más cercano es el **Telegram mensual del grupo**
(`/api/cron/grupo-resumen-mensual`, día 1 a las 13:00 UTC = 08:00 Panamá): usa la **misma** RPC
`ventas_dashboard_summary` que la tarjeta «Ventas» de aquí, así que dice el mismo número. Va al chat
**privado** de Daniel por `enviarNegocioPrivado`, con el formato
`📊 Grupo · junio 2026 / Total: $1,021,483 · +8.3% vs jun-2025 / Vistana: $212,110 · +12.1% …`.

## Cómo probarlo a mano

**1. Que el mes se puede mover y no miente.** Toca la flecha `‹` varias veces: cada mes tiene que
recargar los números. La flecha `›` queda apagada en el mes en curso. Escribe a mano
`/vista-general?mes=2099-01`: tiene que caer en el mes actual, **no** mostrar una pantalla vacía.
Y `?mes=basura` tiene que dar el error «Mes inválido. Usa el formato YYYY-MM.».

**2. Que el CXC cuadra al centavo con `/cxc`.** La tarjeta «Por cobrar (CXC)» tiene que dar
**exactamente** el mismo total que el chip «Total» de la tira de `/cxc` con «Todas» puesto.
Al **5-sep-2026: $3.676.935,55 en 100 CLIENTES** (la vista trae 211 FILAS, una por empresa donde el
cliente debe; la pantalla las consolida por `nombre_normalized`). Esa igualdad es a propósito: las
dos leen la **vista viva**, no la materializada.

```sql
select count(*) filas, count(distinct codigo) clientes, round(sum(total),2) total
from switch_estadocuenta_aging;
-- → 211 | 100 | 3676935.55   (5-sep-2026)
```

**3. Que Proveedores cuadra.** «Por pagar (CXP)» tiene que dar lo mismo que «Por pagar · grupo» de
`/proveedores` (**$5.199.705,82** al 5-sep-2026; eran $5.104.077,19 el 4-sep — este total se mueve
todos los días con el sync de las 09:30). Si no cuadra, alguien filtró `saldo_total > 0`: el
total incluye los saldos a favor a propósito.

**4. Que una empresa sin gasto DICE por qué.** En «Gastos por empresa», las que no tienen número
tienen que mostrar una píldora con el motivo exacto (**Sin cargar · Sin traer · No se baja sola ·
Nada es gasto**) y debajo la frase con hasta qué mes llegan sus egresos. 🔴 **Ninguna puede mostrar
$0.00.** Lo mismo en «Rentabilidad por empresa»: sin gasto, la columna dice «—» y la píldora el motivo.

**5. Que el inventario es el costo, no el precio.** El número grande de la tarjeta «Inventario» lleva
la píldora **«al costo»** y tiene que coincidir con el «Total al costo» del panel de abajo. El valor a
precio de etiqueta va aparte, en gris, con la palabra «potencial» pegada. Boston y Multifashion tienen
que aparecer en el renglón de «sin inventario» con su motivo, **nunca en $0**.

**6. Que el mes en curso compara contra los mismos días.** En el mes en curso, la segunda línea de la
tarjeta «Ventas» tiene que decir `vs 1–<día> <mes> <año anterior>` — no el nombre del mes a secas.
Si dice solo el mes, la lectura de `ventas_dashboard_prev_same_period_v4` falló y la comparación no
es válida.

## Qué lo rompe

| Qué falla | Cómo se nota | Qué pasa |
|---|---|---|
| **`ventas_dashboard_summary_v2` no existe o cambia de firma** | «Sin datos de ventas» y «Margen bruto —» | `leerDashboardSummary` cae a `_v1`, que **excluye las notas de débito** — vuelve el costo negativo de Active Wear agosto. Y rompe a la vez Ventas › Resumen y el Telegram mensual |
| **`leerPrevSamePeriod` falla en el mes en curso** | la tarjeta «Ventas» deja de mostrar el Δ | 🔴 **Falla abierto y no compara contra el mes entero**, que es lo que decía −97,9 % cuando era −92,8 % |
| **`sync-egresos-varios` se rompe** (le pasó el 1-sep-2026, cuando Switch empezó a mandar `6.03.98.00.00 - GASTO DE TARJETA DE CREDITO` donde antes mandaba el código pelado) | el panel de Gastos y la Rentabilidad se llenan de píldoras «Sin traer»; **nunca de ceros** | Medido: **10 corridas fallidas** el 1 y 2 de septiembre, una por cada una de las 5 empresas. Resuelto: 0 errores el 3 y el 4. `codigoDeCuenta()` ahora lee el código **por el principio** |
| **`sync-articulo-info` no corre** (04:30 / 04:40 / 04:50 UTC, tres pares de empresas) | la tarjeta «Inventario» pone la frescura en **ámbar** al pasar de 26 h (`HORAS_INVENTARIO_VIEJO`) | El dato es de la madrugada anterior por diseño. La fecha va **siempre** al lado del número |
| **La RPC `inventario_valorizado_v1` no existe** | nada: la pantalla se ve igual | `leerInventarioValorizado` cae al camino **paginado** (17 consultas en vez de 1) con los mismos números, y lo dice en `fuente`. Solo cae por «función no existe»; un timeout o un permiso **se propaga** |
| **`switch_articulo_info` falla de verdad** | «No se pudo medir» | 🔴 **Nunca un $0**: un inventario en cero y uno sin medir se ven idénticos |
| **`bancos_saldos` no se carga** (la escribe contabilidad **a mano**, no un cron) | «Disponibilidad» dice «Sin saldos cargados» o queda con una fecha vieja | Medido: 52 filas, `created_by = "Contabilidad"` en las 52, y el último saldo de vistana / fashion_wear / Boston / ACS es de **julio 2026**. 🔴 **`joystep` no tiene ni una fila**, así que la Disponibilidad del grupo va sin el banco de una empresa |
| **La vista `switch_estadocuenta_aging` cambia de forma** | el CXC de la tarjeta queda en 0 y la lista de atención vacía | Rompe además `/api/cxc/aging`, `/api/clients`, `/api/cxc-summary`, `/api/search` y la ficha del cliente |
| **Cambian los `title` del aging de proveedores** | el CXP queda en 0 | Las constantes `CXP_*_TITLES` son literales (`"0-30"`, `"Mas de 365"`…) |
| **Un cron de facturas no corre** | la píldora de frescura de **Ventas** avisa… salvo que sea de una de las 5 empresas que no vigila (ver «Lo que sobra» de Ventas) | Vista General **no tiene indicador de frescura propio** para las ventas: solo la píldora «mes en curso» |

## Lo que sobra o no cuadra

- 🔴 **`CLAUDE.md` se contradice con el código en la regla de gastos.** El bloque
  «Gastos, mayor y banco» dice: *«⚠️ Vista General SÍ suma gastos entre empresas — es otro módulo, la
  suma es deliberada, y si la regla también vale ahí es una decisión pendiente de Daniel»*. Es falso
  desde el 13-ago-2026: `gastos.total` se retiró del payload y la pantalla dice explícitamente «no hay
  un total». La decisión ya se tomó.
- El campo `GastoEmpresa.ultimoMesCerrado` **cambió de significado y conservó el nombre** (hoy es «hasta
  dónde llegan los egresos de caja», no «el último mes que la contadora cerró en el mayor»). Está
  documentado en el propio tipo, pero un lector nuevo lo lee al revés.
- `disponibilidad.cuentas` viaja en la respuesta y **nadie lo dibuja**: la tarjeta solo muestra el total
  y la `fechaMasVieja`.
- `cxc.corriente`, `cxc.vigilancia`, `cxp.corriente` y `cxp.vigilancia` se calculan en el servidor y
  **tampoco se dibujan**: las tarjetas solo pintan `total` y `vencido`.
- `ventas.empresasCount` es siempre 8 por construcción (`byEmpresa` se arma sobre `ALL_EMPRESA_KEYS`),
  así que el comentario «cada KPI reporta SOLO las empresas que tienen ese módulo» no aplica a Ventas.
- La tarjeta **Disponibilidad** enlaza a `/saldos-banco`, que es una URL **retirada**: llega por el
  redirect 307 de `next.config.js` a `/gastos-contabilidad?tab=saldos-banco`. Funciona, pero es el
  único enlace del sistema que todavía apunta al módulo viejo.
- 🔴 **El encabezado de `src/app/api/dashboard/vista-general/route.ts:93-102` dice algo falso.**
  Afirma: *«EL MAYOR NO SE APAGA NI SE BORRA. `src/lib/mayor/*` sigue vivo y sigue siendo una de las
  dos pestañas del módulo Gastos»*. Daniel lo mandó borrar el mismo día (*«y entonces borra Mayor
  contable en el sistema»*), y `src/lib/mayor`, `sync-mayor.ts` y su cron **no existen**. Las tablas
  `mayor_lineas` y `mayor_importaciones` sí siguen (hay test que pone el build rojo ante un DROP).
- **El esqueleto de carga de `src/app/vista-general/page.tsx:455-471` dibuja dos cosas que ya no
  existen**: una card `{/* Equilibrio */}` (el punto de equilibrio se retiró el 11-ago-2026) y otra
  `{/* Semáforo */}` (ese nombre se abandonó el 13-ago-2026 al pasar a «Rentabilidad por empresa»).
- **`docs/switch-flujo.md` §13 dice que `switch_articulo_info` «se ve en: Ventas › Referencia»** y no
  menciona que **también alimenta la tarjeta Inventario de esta pantalla**
  (`route.ts:232` → `leerInventarioValorizado`). Si el cron de las 04:3x-04:5x falla, esa tarjeta se
  degrada y ningún documento lo dice.
- 🔴 **`joystep` no tiene ni una fila en `bancos_saldos`** (medido: 52 filas, 7 empresas). La tarjeta
  «Disponibilidad» suma el banco de siete de las ocho empresas y no lo advierte.
---

# Ventas (`/ventas`, key `ventas`)

## Qué es

La pantalla donde Daniel mira cuánto vendió el grupo, con qué margen, a quién, de qué y quién
comisiona. Cinco pestañas sobre la MISMA fuente de ventas (`switch_facturas`, ver
`CLAUDE.md § Ventas, Referencia y Comisiones`): **Resumen · Clientes · Productos · Utilidad ·
Comisiones**. Es la pantalla más pesada del sistema: su SSR cruza el empalme
`switch_facturas`/`ventas_raw` y por eso declara `maxDuration = 60`.

## Quién entra

- **La página `/ventas` es admin-only y el candado está en el SERVIDOR**, antes de cargar dato:
  `src/app/ventas/page.tsx` lee la cookie con `verifySession` y hace `redirect("/home")` a
  cualquier rol que no sea `admin`. No es un guard de cliente.
- **Sus rutas de API NO son admin-only, y la matriz es despareja** (medido leyendo cada `route.ts`):

| Ruta | Roles que pasan |
|---|---|
| `/api/ventas/resumen`, `/clientes-12m`, `/años`, `/resumen-anual`, `/mes-anio`, `/v2` | `admin`, `contabilidad` |
| `/api/ventas/v2/status` | `admin`, `secretaria` |
| `/api/ventas/productos`, `/productos/codigos`, `/productos/por-cliente`, `/utilidad-cliente`, `/comisiones/config`, `/comisiones/exclusiones*` | **solo `admin`** |
| `/api/ventas/comisiones`, `/comisiones/consolidado`, `/comisiones/detalle`, `GET /comisiones/descuentos` | `admin`, `contabilidad`, `secretaria` |
| `POST /api/ventas/comisiones/descuentos` | `admin`, `secretaria` |
| `/api/ventas/referencia` (GET) y **`/referencia/actualizar` (POST)** | `admin`, `vendedor`, `bodega` (`REFERENCIA_ROLES`, una sola lista para la página, la búsqueda y el botón) — y `margenVisible` viaja `false` para los dos últimos |

- La **pestaña Comisiones** existe también como módulo propio `/comisiones`
  (`roles: ["admin","contabilidad","secretaria"]`). Es la ÚNICA puerta de la secretaria a las
  comisiones: abrirle `/ventas` para dársela le entregaría además Resumen y Clientes en el HTML del
  SSR. Candado: `src/__tests__/lib/comisiones-en-ventas.test.tsx`.
- La pestaña **Configuración** de Comisiones se dibuja **solo para `admin` y solo dentro de
  `/comisiones`** (`conConfiguracion`), no dentro de `/ventas?tab=comisiones`. Daniel, 3-sep-2026:
  «es el módulo Comisiones aparte, no la pestaña de Ventas». Candado:
  `src/__tests__/components/comisiones-configuracion-pantalla.test.tsx`.
- `contabilidad` recibe **200** en las cuatro lecturas de comisiones y **403** en
  `POST /descuentos` y en `GET /config`: ve, no edita. Candado:
  `src/__tests__/lib/comisiones-contabilidad.test.tsx`.

## Las pantallas

El estado vive en la URL: `?tab=resumen|clientes|productos|utilidad|comisiones`. Un `?tab=` que no
esté en la lista cae en `resumen` (Radix no dibuja nada si el `value` no tiene trigger, y sin el
filtro un enlace viejo dejaba la pantalla en blanco). `?tab=referencia` **redirige a `/referencia`**
desde `next.config.js` (307). El **selector de año** vive arriba y se dibuja en todas las pestañas
**menos Comisiones** (que trae su propio período mes+año, `ComisionesPeriodo`). El botón **Excel** de
la barra se dibuja solo en Resumen y Clientes; Productos, Utilidad y Comisiones traen el suyo.

Encima de las pestañas va **una sola** línea ámbar de rechazos de Switch (`AvisoRechazosSwitch`) para
las cuatro familias `factura · utilidad · costo_diario · articulo_diario`; los **cobros** (`recibo`)
tienen su propio aviso **dentro** de Comisiones, porque la comisión sobre cobro lee `switch_recibos`.

### Pestaña **Resumen**
Subtítulo: «8 empresas · cierre \<mes\> (mes en curso \<mes\>)». En un año cerrado, «año cerrado».

- **Tres tarjetas** (solo desde 1440 px de ancho; abajo manda `ResumenViewMobile`): **VENTAS NETAS ·
  UTILIDAD · MARGEN PROMEDIO**, cada una con `Ene–<mes> <año> · ▲ X% vs <año anterior>`
  (el margen en **puntos**, no en %). «YTD» se retiró de los rótulos por ser jerga en inglés.
- **Tarjeta «mes en curso vs mismo mes del año anterior»** (solo año en curso).
- **Barra**: botón **«Actualizar ahora»** (admin/secretaria — dispara facturas de las 8 empresas EN
  SECUENCIA + `refresh-vistas`) · conmutador **Ventas / Utilidad / Margen %** · conmutador
  **Mensual / Trimestral / Anual**.
  🩸 **La píldora «Sincronizado» se retiró el 4-sep-2026.** Vigilaba **3 empresas de 8**
  (`SWITCH_FACTURAS_EMPRESA_KEYS`, una lista escrita a mano que se quedó atrás del cron), así que
  Vistana o Fashion Wear congeladas se veían en VERDE. Daniel: *«¿de qué sirve tenerlo si ya el
  sistema corre fluido y si no me avisa por Telegram para arreglarlo?»*. Quien vigila las ventas es
  `src/lib/datos-frescos.ts` — **las 8**, derivadas de `empresasConFacturas()`, con aviso por Telegram
  a las +24 h y la regla de dos fallos seguidos. Comisiones **sí** conserva la suya (lee
  `switch_recibos`, otra tabla). Candado: `textos-pendientes-284.test.ts`, que cambió de dirección.
- **La matriz**: filas = las 8 empresas + **Total Grupo**; columnas = 12 meses (o 4 trimestres, o los
  años en modo Anual) + **Total** + **Proyección** (solo año en curso). Cada celda lleva el valor y
  su Δ contra el año anterior. **Tocar una celda transforma la fila en su lugar** (`FilaDetalle`) y
  muestra Ventas/Utilidad/Margen del período con su comparativo; `Escape` cierra y el foco vuelve a
  la celda. **Tocar el nombre de una empresa** abre el panel **mes × año** de esa empresa
  (`ResumenMesAnio`, `/api/ventas/mes-anio`).
- La fila **Multifashion** lleva la nota de mayoreo: en Ventas dice «**incluye** $X de mayoreo»
  (en el módulo Multifashion la misma función dice «no incluye»).
- **Tarea más frecuente (3 pasos):** abrir `/ventas` → mirar las tres tarjetas → tocar la celda del
  mes que llame la atención.

### Pestaña **Clientes**
- **Buscador** «Buscar cliente o código…», **tira de píldoras de empresa** («Todas» + **las SEIS de
  Fashion Group**, derivadas de `B2B_EMPRESA_KEYS` — Boston y Multifashion no están), chip de
  **Vista** («Clientes 12m» / «Clientes \<año\>» / «Año \<año\>») y, en celular, un `SortSheet`.
- **Columnas**: `#` · Cliente · Empresa · **Compras \<año\>** · cambio vs el año anterior ·
  **Última compra**. El año del rótulo **sale del dato** (`data.anioComparativo`), nunca escrito a mano.
- **Fila ámbar «Mostrador»**: la venta de contado, fuera del ranking. Se reconoce por el **código
  `TCKCTA`** (`esMostrador`), nunca por el nombre — el mostrador se llama distinto en cada empresa.
  Es la **suma** de las filas de mostrador que llegaron, no la primera.
- **Fila «Otros clientes»**: los que no cruzan con `clientes_master` (`isOrphan`), anclada al final,
  con «Tocar para ver el detalle» (`OtrosClientesDialog`). No se dibuja con la píldora de Boston o
  Multifashion activa.
- **Hover / tap sobre un cliente** abre `ClienteHoverCard` (escritorio) o `ClienteSheet` (celular):
  25 meses de historial (`/api/clientes/[codigo]/historial-mensual`), promedio mensual, meses activos,
  días desde la última compra, y un chip de **CXC** (`/api/cxc/aging-por-cliente/[codigo]`).
- ⚠️ **Esta pestaña no tiene Excel propio.** El botón «Excel» de la barra sigue visible aquí y baja
  el archivo del **Resumen** (`ventas-<año>.xlsx`). Ver «Lo que sobra o no cuadra».

### Pestaña **Productos**
- **Tres selectores + buscador + Excel**: empresa (**7**: las 6 del grupo + Multifashion; **Boston
  no está**), **período** (`Año en curso` · `Últimos 6 meses` · `Últimos 12 meses` · `Año pasado`) y
  **«Cliente: todos»** (un FILTRO, no un selector de cliente — sus opciones son los clientes que ya
  vinieron en la respuesta de ese período, ordenados por lo que más compran).
- Bajo el buscador: `Venta $X · Margen X%` y, en gris, las piezas, el precio promedio y **las dos
  fechas del período** (los períodos relativos están anclados en HOY, no en el año del selector).
- **Tabla**: Descripción · Cant · Venta · Δ vs el mismo período del año pasado · Precio prom. ·
  **Margen %**. 🔴 **Con un cliente puesto la columna Margen desaparece**:
  `switch_factura_lineas` no trae costo.
- **Tocar una descripción** la despliega con dos pestañas: **Clientes** (quién la compra y su
  participación) y **Códigos** (los SKU que hay adentro). Y con un cliente elegido aparece
  **«Dejó de comprar»** (lo que compraba en la ventana anterior y ya no).
- Si la ventana comparativa vino vacía o falló, la pantalla lo **dice** — «Nuevo» solo se afirma
  cuando de verdad no hubo venta el año pasado.

### Pestaña **Utilidad**
Utilidad real por cliente del año elegido. Buscador «Buscar cliente o empresa…», chips de orden en
celular, botón Excel. Totales `Ventas · Utilidad · Margen` y el **alcance** («6 empresas B2B»,
derivado de lo que la RPC miró de verdad). Tabla: Cliente · Empresa · # Docs · **Ventas · Utilidad ·
Margen %**. Ventas o utilidad **negativas son un dato válido** (devoluciones > ventas) y se pintan en
rojo. Un margen que no se puede calcular es «—», y en el Excel es **celda vacía**, nunca 0,0 %.

### Pestaña **Comisiones**
Tres modos en una tira de pestañas: **Todas las empresas · Por empresa · Configuración** (el tercero
solo admin y solo en `/comisiones`). El modo se recuerda en `localStorage` (`fg_comisiones_mode`).
- **Fila de controles**: `ComisionesPeriodo` (un solo botón «Julio 2026» que abre año + grilla de 12
  meses; los meses futuros quedan apagados) · **«Actualizar ahora»** de RECIBOS (una empresa por
  disparo — sesión única de Switch) · **Excel** (la vista hija registra su función; el botón vive
  arriba).
- **ⓘ Criterios**: *«Venta: facturas con utilidad >20% menos notas de crédito, y se paga al vendedor
  de la factura. Cobro: recibos del mes, excluyendo retenciones de ITBMS, y se paga a quien registró
  el recibo en Switch (si lo registró la oficina, queda en «Oficina (DEFAULT)»). Ambas excluyen
  intercompañía y clientes internos.»* Adentro va también la frescura del sync.
- **Todas las empresas**: matriz **vendedor × 6 empresas + Total**. Una fila por PERSONA (el servidor
  ya junta las grafías con `comision_vendedor_alias`). Las filas que **no se pagan** (DEFAULT →
  «Oficina (DEFAULT)», y Daniel Levy) salen en gris con «no se paga» y **no entran al «Total a
  pagar»**. Los **retirados** (`REY STOUTE AGUAS`, `AGUAS`, `COLABORADOR`) no salen ni en la tabla ni
  en los totales. Al pie: *«Ya están descontados lo devuelto y los descuentos.»*
- **Por empresa**: Vendedor · Ventas · Com. venta · Cobros · Com. cobro · Com. total.
- Tocar una celda abre `ComisionesDetalleModal`: sección **VENTAS** (fecha, cliente, secuencial,
  tipo, subtotal, % utilidad), sección **COBROS** (fecha, cliente, monto) y **CIERRE**. Se imprime en
  **exactamente 2 páginas** (letter apaisado) y exporta a Excel.
- **Configuración** (solo admin), dos tarjetas:
  1. **«Tasas por vendedor»** — Vendedor · **Venta** · **Cobro** (las dos en %) · Empresas · Activo.
     Una fila por persona, capitalizada («Reynaldo Espinosa»). Rango permitido **0 % a 20 %**.
     Daniel Levy **no aparece**.
  2. **«Clientes que no comisionan»** — agrupada **por empresa** (encabezado + contador). Columnas:
     Cliente · Vendedor · **Venta** · **Cobro** · Desde · ×. «+ Agregar» abre una fila
     Empresa → Cliente (`ClienteSwitchPicker`) → Vendedor → las dos casillas **marcadas** → Guardar.
     Con las dos apagadas **no se guarda y se avisa**. Quitar = soft delete con confirmación.
     🔴 En pantalla **nunca se dice «exclusión»**.
- **Tarea más frecuente (5 pasos):** abrir `/comisiones` → elegir el mes → mirar la columna Total →
  tocar la celda de un vendedor para ver el detalle → Excel o imprimir.

## Los datos

Ventas **no tiene tablas propias de negocio**. Lee las de Switch y escribe únicamente la
configuración de comisiones. Los conteos por tabla están en `CLAUDE.md § Dónde vive cada dato`.

**Lo único que este módulo ESCRIBE** (tres tablas, todas desde Comisiones › Configuración):

| Tabla | Grano · llave | Quién escribe | Quién lee | Soft delete |
|---|---|---|---|---|
| `comision_vendedor_tasa` | 1 fila por `vendedor_nombre` (global, **no por empresa**) | `PUT /api/ventas/comisiones/config` (solo admin), upsert `onConflict:"vendedor_nombre"` | `comision_b2b_v8` (`COALESCE(tasa, 0.0050)`) y la pantalla de Configuración | no — hay `activo boolean` |
| `comision_exclusion` | 1 fila por (empresa, código de cliente, vendedor canónico), única **solo entre activas** | `POST` (alta), `PATCH ?id=` (casillas), `DELETE ?id=` (**soft delete firmado**) de `/api/ventas/comisiones/exclusiones`, solo admin | `comision_b2b_v8` y `comision_b2b_detalle` | 🔴 sí: `activa=false` + `desactivado_por` / `desactivado_en`. **Nunca `DELETE`** — hay barrido |
| `comision_descuento_excepciones` | 1 fila por (`descuento_id`, mes) | `POST /api/ventas/comisiones/descuentos` (admin/secretaria), upsert `onConflict:"descuento_id,mes"` | `leerDescuentosEfectivos` → `netearComisiones` | no |

`comision_vendedor_alias` (`nombre_switch → vendedor_canonico`) y `comision_descuentos_fijos`
**no tienen pantalla**: se cargan por migración / a mano en la base.

**Columnas que el módulo lee y nadie dibuja** (medido leyendo cada vista contra su `route.ts`):
- De `ProyeccionEmpresa`: `meta_anual_manual`, `meta_sugerida`, `meta_efectiva`, `meta_anual` y
  `gap_vs_meta` — la RPC `ventas_proyeccion_cierre_v7` los sigue calculando, pero
  `stripMetasProyeccion` los saca del payload porque **cero pantallas los leen**.
  Candado: `src/__tests__/lib/ventas-datos-fantasma.test.ts`.
- `switch_recibos.vendedor_cartera`: se sincroniza y **ya no alimenta ninguna comisión** desde el
  3-sep-2026. Queda como dato.
- `comision_b2b_*.descuento` viaja «informativo» y solo se pinta en el detalle.

## De dónde vienen los datos

| Cron (UTC) | Qué trae | Tabla |
|---|---|---|
| `switch-sync?tipo=facturas` — **11:50 · 15:00 · 19:00 · 23:00** (las 8 empresas) y **13:00 · 17:00 · 21:00 · 00:15** (solo `american_classic`) | cabecera de cada comprobante | `switch_facturas` |
| `sync-factura-lineas` — **03:30** | renglón por renglón | `switch_factura_lineas` (alimenta Productos › Clientes) |
| `sync-utilidad` — **07:00** | `pct_utilidad` y costo por factura | `switch_factura_utilidad` (base de Utilidad y del criterio de entrada de la comisión) |
| `switch-articulos` — **08:40** | venta por artículo y día, **las 8 empresas, 3 días atrás** | `switch_articulo_diario` (base de Productos; **llega hasta AYER**) |
| `sync-recibos` — **07:50 · 15:15 · 19:15 · 23:15** | los cobros | `switch_recibos` (base de la comisión de cobro) |
| `sync-articulo-info` — **04:30 / 04:40 / 04:50** | existencia, precio, costo | `switch_articulo_info` |
| `sync-clientes-master` — **07:00** | el directorio del grupo | `clientes_master` (le da nombre a los clientes del ranking) |
| `refresh-clientes-views` — **07:35** y `switch-reconciliacion` — **10:00 · 14:00 · 18:00** | refrescan `ventas_rollup_mensual_mv` y las dos vistas de clientes 12m | — |

Las tres pasadas de la tarde de `sync-recibos` van **15 min DESPUÉS** de las ventas porque comparten
seis empresas y **la sesión de Switch es por USUARIO**.

**Por qué endpoint entra cada cosa** (verificado contra `src/lib/switch-api/**`; ver
`docs/switch-flujo.md` para el mapa completo):

| Tabla | Endpoint o reporte exacto | Vía | Qué se descarta |
|---|---|---|---|
| `switch_facturas` | `GET /apifactura/lista` · `GET /apinotacredito/lista` · `GET /apinotadebito/lista` (los dos de notas **no están en el PDF oficial**) | **API JSON con token** | `urlswitchpay` (queda solo en `raw_data`). Las notas **no traen `tipoComprobante`**: se escribe a mano; las NC llegan **negativas** y se guardan en valor absoluto (el signo lo pone `signoVenta`) |
| `switch_factura_lineas` | `GET /apifactura/info?facturaId=` · `GET /apinotacredito/info?notacreditoId=` (el de NC **sin documentar**) | **API con token** | 🔴 **no trae COSTO** → por eso no hay margen por cliente |
| `switch_factura_utilidad` | `GET /reportesventa/comprobantes` (para el `_token`) → **`POST /reportesventa/facturas`** (DataTables, `tipoComprobante:"facturasnotas"`) | 🔴 **panel web con sesión**, login con `changesession:"SI"` — **expulsa a quien esté en el panel** | es la ÚNICA fuente de costo y utilidad por documento: el API solo da agregados |
| `switch_articulo_diario` | `GET /apireporte/ventasucursal?sucursalId&fecha&…` — **un día por llamada** | **API con token** | 🩸 **no trae notas de débito** — de ahí el costo −$44.483 de Active Wear agosto |
| `switch_recibos` | `GET /apireporte/recibos?desde&hasta&…` — **no está en el PDF** | **API con token** | **no trae id ni secuencial de recibo** → la unidad de reemplazo es el mes entero |
| `switch_articulo_info` | fase 1 `GET /apiarticulos/lista` (**no trae rubro/subrubro/marca**) + fase 2 `GET /apiarticulos/info?codigoBarra=`, de a uno | **API con token** | `listaPrecioId`, `unidadmedida`, `proveedor`, `marcaId`, `talla`, `color`, `cantidadPorCaja`; de la ficha, `imagen`, `fechacreacion`, `tipoArticulo`, `articuloImpuesto` |

Qué pasa si falla: cada pestaña degrada por separado (`fetchVentasBundle` usa `settle`, así que un
500 de `/api/multifashion/overview` ya no tumba el Resumen entero). Con dato viejo en la caché SWR se
muestra el dato viejo con banner ámbar; sin nada, el `ErrorState` con botón «Reintentar».

## Las reglas que ya están fijadas

Las de negocio están en `CLAUDE.md § Ventas, Referencia y Comisiones` y en
`docs/postmortems/ventas-referencia.md`. Lo que agrega este documento es **cuál test sostiene cada
una** (todos verdes al 4-sep-2026; 2.275 tests en los 100 archivos relevantes):

| Regla | Candado |
|---|---|
| El costo del Resumen incluye las **notas de débito**; `ventas_dashboard_prev_same_period_v4` **no puede** leer `switch_costo_diario` ni `ventas_raw.costo` | `src/__tests__/lib/costo-con-notas-de-debito.test.ts` (barrido sobre el SQL de `20260915120000`) |
| Toda comparación «vs año pasado» corta en los **mismos días** — definición única en `src/lib/ventas/clientes-corte-comparativo.ts`, seis consumidores | `src/__tests__/lib/mismos-dias-todas-las-comparaciones.test.ts` |
| La celda del mes en curso **no** puede leer el mes ENTERO del año anterior | `src/__tests__/components/resumen-mes-anio-mes-en-curso.test.tsx` |
| Un Δ% con base minúscula no puede dar «+363.024.750%» (`BASE_MIN_COMPARATIVO`) | `src/__tests__/lib/pct-variacion.test.ts` |
| Un tipo de comprobante nuevo **avisa** en vez de valer 0 | `src/__tests__/lib/ventas-centinela-tipos.test.ts` |
| Filtrar por año va por **rango semiabierto**, nunca `EXTRACT(YEAR …)` | `src/__tests__/lib/ventas-reportes-sargable.test.ts` (barrido de forma sobre los `.sql`) |
| Las notas de crédito **restan** en Productos (sumarlas da exactamente el doble de las devoluciones) | `src/__tests__/lib/ventas-productos-clientes.test.ts` y `…-por-cliente.test.ts` |
| El cruce producto↔cliente es por **CÓDIGO**, no por el texto de la línea (cruzar por texto dejaba 39 de 136 descripciones sin cliente: $184.164,23 = 7,66 %) | `src/__tests__/api/ventas-productos-clientes-route.test.ts` |
| **No hay margen por cliente y no puede haberlo**: `switch_factura_lineas` no trae costo | `src/__tests__/lib/ventas-productos-por-cliente.test.ts` |
| La lista de empresas que comisionan **se deriva**, no se escribe (`EMPRESAS_COMISIONAN`) | `src/__tests__/lib/comisiones-joystep-entra.test.ts` |
| La lista de empresas con utilidad **se pasa por parámetro** a la RPC (`empresasConUtilidad()`) | `src/__tests__/lib/ventas-utilidad-joystep.test.ts`, `src/__tests__/lib/empresa-capabilities.test.ts` |
| Los descuentos se restan **una sola vez, en el servidor** — las dos pestañas comparadas celda por celda | `src/__tests__/lib/comisiones-descuentos-una-sola-resta.test.ts`, `…-consolidado-neto.test.ts` |
| Las retenciones de ITBMS **no pagan comisión** pero **sí bajan la deuda en CXC** — la huella que distingue las dos lecturas de `switch_recibos` es la exclusión de `TCKCTA` | `src/__tests__/lib/comision-cobro-sin-retenciones.test.ts` (barrido sobre los `.sql`) |
| Venta = `switch_facturas.vendedor_nombre`; cobro = `switch_recibos.vendedor_registro`; `vendedor_cartera` no alimenta nada | `src/__tests__/lib/comision-cobro-quien-registro.test.ts` |
| Una persona, una fila, una tasa: `comision_b2b_v8` es la v7 **byte a byte** más el alias | `src/__tests__/lib/comision-alias-v8.test.ts` (corre el SQL en pglite) |
| Las exclusiones son **soft delete firmado**, únicas solo entre activas, y la pantalla nunca dice «exclusión» | `src/__tests__/lib/comision-exclusion-v7.test.ts` (pglite) |
| Los retirados desaparecen de la tabla **y de los totales** (la fila de COLABORADOR es negativa: retirarlo SUBE el total) | `src/__tests__/lib/comisiones-retirados-y-mayusculas.test.tsx` |
| El mostrador se reconoce por **código**, y la fila ámbar dice **$54.478,59** (el del grupo), no $25.835,65 (el de una empresa) | `src/__tests__/components/ventas-mostrador-por-codigo.test.tsx` |
| Ventas › Clientes ofrece **las SEIS** empresas, con la lista derivada | `src/__tests__/components/ventas-clientes-las-seis-empresas.test.tsx` |
| Nadie joinea `clientes_master` por `nombre_normalized`, ni en SQL ni en TypeScript | `src/__tests__/lib/clientes-master-solo-del-grupo.test.ts` |
| El aviso *«las devoluciones (notas de crédito) ya están restadas»* **no puede mudarse al ⓘ** — sin él, cuadrar contra Switch da el doble de las devoluciones | `src/__tests__/components/ventas-poda-textos.test.tsx` |
| Todo Excel del módulo arranca en la **fila 1** con el encabezado congelado | `src/__tests__/excel-exports-ventas.test.ts`, `src/__tests__/lib/excel-encabezados-fila-1.test.ts` |
| La proyección de cierre se congela contra 120 cortes reales | `src/__tests__/lib/ventas-proyeccion-v7.test.ts` + `fixtures/proyeccion-backtest.json` |

Dos tests de integración quedan **skippeados por diseño** (pegan contra producción, se activan con
`RUN_DB_TESTS`): `src/__tests__/integration/ventas-rpc.test.ts` y
`src/__tests__/integration/comisiones-detalle-rpc.test.ts`.

## Con qué conecta

**Qué lee de otros módulos:**

| Fuente | Para qué |
|---|---|
| `switch_facturas` (Switch) | toda la venta: Resumen, Clientes, Utilidad, la base de la comisión de venta |
| `switch_recibos` (Switch) | la base de la comisión de **cobro** |
| `switch_factura_utilidad` (Switch) | Utilidad por cliente y el `pct_utilidad > 20` que deja entrar a la comisión |
| `switch_articulo_diario` + `switch_factura_lineas` (Switch) | Productos y su detalle por cliente |
| `clientes_master` + `switch_clientes` (módulo Clientes) | el nombre y el código de cada cliente del ranking |
| `switch_estadocuenta_aging` (CXC) | el chip de CXC del `ClienteHoverCard` |
| `/api/clientes/[codigo]/historial-mensual` y `/ultimas-facturas` (módulo Clientes) | el hover card |
| `/api/multifashion/overview` (Multifashion) | solo el indicador de mayoreo de la fila Multifashion; su fallo **se traga en silencio** |
| `vendedores` (maestro) | el desplegable de vendedores de Configuración |

**Quién lee lo suyo:**
- **Vista General** entra por `leerDashboardSummary` y `leerPrevSamePeriod` — las MISMAS funciones.
- El **Telegram mensual del grupo** (`/api/cron/grupo-resumen-mensual`) usa la misma RPC
  `ventas_dashboard_summary`, «paridad al centavo por construcción».
- El **cuadre mensual de costo** (`src/lib/alertas/cuadre-costo.ts`) compara la fuente del Resumen
  contra `switch_costo_diario` y avisa por 🔧 SISTEMA.
- La **búsqueda global** (`/api/search`) busca en `switch_facturas` con su propio `empresa_key`.
- El módulo **`/comisiones`** monta el MISMO `ComisionesView`: es una puerta, no un cálculo nuevo.
- **Multifashion** comparte `clientes-corte-comparativo.ts` y `ultimo-dia-cargado.ts`.

**Qué se rompería:**
- Cambiar `ventas_dashboard_summary_v2` rompe Ventas › Resumen, Vista General y el Telegram mensual
  a la vez (los tres entran por `src/lib/ventas/dashboard-summary.ts`).
- Cambiar `clientes-corte-comparativo.ts` mueve SEIS comparaciones a la vez; el candado
  `mismos-dias-todas-las-comparaciones.test.ts` las nombra una por una.
- Renombrar `comision_b2b_v8` sin actualizar `CADENA_RPC_COMISION` (`src/lib/comisiones/rpc.ts`) hace
  caer en silencio a la v7 — la respuesta lo diría en su campo `version`, pero nadie lo mira.
- Tocar `esMostrador` / `CODIGO_MOSTRADOR` (`src/lib/clientes/mostrador.ts`) mueve a la vez la fila
  ámbar de Ventas › Clientes, la RPC de comisión y el checkout público de catálogos.
- Quitar `switch_factura_lineas` deja sin datos «Clientes» dentro de Productos y el filtro por
  cliente, pero **no** toca ningún total de venta.

## Por qué está así

Las decisiones que le dieron esta forma. Entre comillas va lo que dijo Daniel, textual; entre
paréntesis, el archivo donde vive la cita.

**Del módulo entero**
- 🔴 **«Comisiones debe de estar en Ventas. Y también debe de verse empresa por empresa y todas las
  empresas.»** (25-ago-2026) → Comisiones entró como 5ª pestaña montando el **MISMO** `ComisionesView`
  que ya servía `/comisiones`: ningún número, endpoint ni resta cambiaron
  (`src/app/ventas/VentasShell.tsx:46-47`).
- **«comisiones debería de estar en ventas y clientes no?»** (26-ago-2026) → la **ficha** se mudó del
  grupo «Operación» a «Ventas y clientes», pegada a Ventas (`src/lib/modules.ts`). Son dos cosas
  distintas: la ficha y la pestaña.
- **«Q contabilidad vea comisiones»** (25-ago-2026) → `contabilidad` entró al `roles[]` de
  `comisiones` **y** al `allowedRoles` de la pantalla. No abrió ningún permiso de datos: ya recibía
  200 de las cuatro rutas de lectura; lo que le faltaba era la puerta (`src/lib/modules.ts`).
- **«dejar solo la del menú y quitar la pestaña de Ventas»** (12-ago-2026) → **Referencia** dejó de
  ser la 5ª pestaña y quedó como módulo propio; `?tab=referencia` redirige.
- **«habilita referencia para los vendedores y bodega»** + **«quita margen, lo demás déjalo»**
  (12-ago-2026) → el gate del margen vive en `/api/ventas/referencia`, no en la vista
  (`margenVisible`).

**Resumen**
- **«en mayo 2026 Vistana salía 5%»** → el **Δ% vuelve a la celda** del heatmap: Daniel escanea la
  fila de una empresa para ver qué meses subieron y cuánto, y con solo ▲/▼ había que tocar celda por
  celda (`src/lib/ventas/celda.ts:88-92`).
- La **nota de mayoreo**, aprobada el 25-jul-2026: **Ventas (8 empresas) INCLUYE el mayoreo;
  Multifashion (la tienda) es retail puro.** Misma función, textos opuestos
  (`src/lib/ventas/mayoreo.ts:3-13`).
- **«no quiero mensaje de costos»** (3-ago-2026) → el aviso de costo sospechoso dejó de mandarse por
  cualquier canal; el guard sigue guardando el costo en 0.
- **«sí, lo quiero lo antes posible»** (4-sep-2026) → el resumen mensual del grupo pasó del día 3 al
  **día 1** a las 13:00 UTC (`src/lib/grupo-resumen-mensual.ts`).
- **«este mensaje también lo quiero en alertas de Telegram, no en negocio»** (4-sep-2026) → ese mismo
  resumen salió del grupo 📊 NEGOCIO y pasó al chat privado, **sin** el prefijo de sistema.

**Productos**
- 🔴 **«no veo por clientes, me gustaría saber por ejemplo, quién compra más una descripción, me
  explico?»** (24-ago-2026) → nació el detalle «Clientes» dentro de cada descripción
  (`src/lib/ventas/productos-clientes.ts:4-6`).
- **«¿qué me compra más éste?»** → el camino inverso: el **filtro por cliente** que reordena toda la
  tabla (`src/components/ventas/ProductosView.tsx:57`, `src/lib/ventas/productos-por-cliente.ts:5-6`).
- **«año en curso, últimos 6 meses, últimos 12 meses, año pasado»** → los cuatro períodos, dichos por
  él (`src/lib/ventas/productos.ts:127-128`). Y **«solo déjame las 4 primeras, las otras quítamelas
  que sobran, nunca te las pedí»** (24-ago-2026) → los 12 meses sueltos salieron del desplegable
  **pero no del servidor**: `?mes=6` sigue contestando igual.
- **«"YTD" era jerga: Daniel lo nombra "año en curso"»** (`productos.ts:243`).
- El drill-down **arranca en la pestaña Clientes** «porque es lo que Daniel pidió»
  (`ProductosView.tsx:939`).

**Clientes**
- 🔴 **«se debería de usar el código del cliente, ya que todos los D-24 por ejemplo son de City Mall
  across mis 6 empresas»** → la identidad es el **CÓDIGO**, y de ahí sale el mostrador por
  `esMostrador(c.id)` y la prohibición de unir por nombre.
- **«deberían estar solo las 6 de Fashion Group, que son las 5 de las fotos y joystep»** (2-sep-2026)
  → la tira de empresas se **deriva** de `B2B_EMPRESA_KEYS` (`ClientesView.tsx`).
- **«es un cliente al final del día. tiene que aparecer»** / **«al final es venta real»** → una
  empresa del grupo comprándole a otra **suma como cualquier cliente**; la marca es informativa
  (`ClientesView.tsx:714-715`).
- **«cxc sí se muestra con ITBMS, porque es lo que tengo que cobrar»** → Ventas va sin ITBMS y CXC
  con ITBMS; la explicación vive en el ⓘ de la ficha del cliente, y **no se borra nunca**.

**Utilidad**
- **No hay ninguna cita textual en esta pestaña.** Sus dos decisiones son de ingeniería: el alcance
  de empresas se **deriva** (el olvido de `joystep` «ya costó 15.262,00 de cobros invisibles») y el
  fallback a `utilidad_por_cliente` v1 mientras la migración `20260824180000` no corra
  (`src/app/api/ventas/utilidad-cliente/route.ts:9-21`).

**Comisiones**
- **«crea configuración en comisiones para desactivar cálculos de clientes»** (3-sep-2026) → nació
  «Clientes que no comisionan», con grano **(empresa, cliente, vendedor)** — *«cliente vendedor»*— y
  aplicando a las dos puntas: *«correcto, también venta»*.
- **«¿por qué en card y no como tab en toda la pantalla normal?»** (3-sep-2026) → la Configuración
  dejó de ser un modal «Configurar» y pasó a ser el tercer modo, a pantalla completa
  (`ComisionesConfiguracionView.tsx`).
- **«configuración en dos lados»** → el botón «Configurar» de «Por empresa» se quitó: el chip es la
  **única** entrada.
- **«es el módulo Comisiones aparte, no la pestaña de Ventas»** → la pestaña Configuración **no** se
  dibuja dentro de `/ventas?tab=comisiones`.
- **«poder quitar comisiones en ventas o comisiones sin que tengan que ser de los dos»** ·
  **«las 11 que ya cargamos quedan con las dos marcadas»** · **«arranca con las dos marcadas pero yo
  deselecciono»** (3-sep-2026, noche) → las casillas **Venta** y **Cobro** por separado, con `DEFAULT
  true` y un CHECK de «al menos una» (`ComisionesConfiguracionView.tsx:27-28` y `:290`).
- **«¿por qué hay 4 Reinaldo?»** · **«llámalo Reynaldo y no Reinaldo»** · **«pon a Reinaldo 1 y 1»**
  (3-sep-2026, noche) → el alias de vendedor, el canónico **REYNALDO con Y**, y la tasa 1 %/1 %.
- **«si capitaliza reynaldo»** (3-sep-2026) → `nombreVendedorEnPantalla` se usa en **todas** las
  superficies: las dos tablas, las tarjetas, el modal y el Excel (`src/lib/comisiones/alias.ts:19-21`,
  `comisionExcel.ts:266`, `ComisionesDetalleModal.tsx:325`).
- **«quítalo»** → **Daniel Levy no aparece** en «Tasas por vendedor» (sigue en `VENDEDORES_SIN_PAGO`
  y en la tabla de comisiones, en gris).
- **«si yo cobro no le pago a nadie porque no me autopago»** → `DEFAULT` y `DANIEL LEVY` se calculan
  y se muestran, pero **no entran al total a pagar** (`src/lib/comisiones/sin-pago.ts`).
- **«el que vende a veces no es el que cobra. Edwin puede vender 50k a City Mall y Daniel o DEFAULT
  cobrar esa plata»** (3-sep-2026) → la comisión de cobro se paga a **quien registró el recibo**, y
  el texto de «Criterios» se reescribió por eso.
- **«quita el vendedor aguas, no lo quiero ver»** (3-ago-2026) · **«esconder rey stoute»** · **«te
  dije que eliminaras Rey Stoute Aguas»** (3-sep-2026) → `VENDEDORES_RETIRADOS`, que compara por el
  nombre **canónico** y los saca de la tabla **y de los totales**.
- 🆕 **«quita el cuadro sin comisión»** (4-sep-2026) → el chip «N clientes sin comisión» salió de las
  tablas; el componente **no se borró** y la lista sigue llegando del servidor
  (`src/components/ventas/MarcaClientesSinComision.tsx:1-2`).
- **Daniel lo llama «clientes que no comisionan» y así se rotula**: en pantalla **nunca** se escribe
  «exclusión» (`src/lib/comisiones/exclusiones.ts:19-20`).
- **Los cobros de $0 no comisionan** — decisión de negocio del 23-jul-2026: «comportamiento correcto:
  no arreglarlo» (`src/app/api/ventas/comisiones/route.ts:28-31`).
- El reparto de columnas al imprimir el detalle salió del **feedback con Reinaldo / Fashion Shoes /
  mayo: 42 filas → 21+21** (`ComisionesDetalleModal.tsx:110-114`).

## Lo que se intentó y se retiró

**Del módulo**
- **`/ventas/reporte`** — pantalla propia de reporte. Retirada en un sprint de limpieza; queda solo el
  `redirect` a `/ventas` para no romper marcadores (`src/app/ventas/reporte/page.tsx:3-4`).
- **La 5ª pestaña «Referencia»** — vivió dentro de Ventas hasta el 12-ago-2026; hoy es su propio
  módulo y `?tab=referencia` redirige. Candado para que no vuelva:
  `src/__tests__/lib/ventas-tab-referencia-fuera.test.ts`.
- **La carga manual de CSV de ventas** (`ventas_upload`) — 82 corridas entre abril y el **25-may-2026**,
  todas de `andrea`. La reemplazó el sync de Switch. `ventas_raw` (48.378 filas) queda **congelada y
  sin un solo lector en la app**.

**Resumen**
- **Las metas** (`meta_anual_manual`, `meta_sugerida`, `meta_efectiva`, `meta_anual`, `gap_vs_meta`) y
  **`multifashionYTD`** — viajaban en cada carga y **ninguna pantalla las dibujaba**. Se sacaron del
  payload con `stripMetasProyeccion`; **el SQL no se tocó** porque «cambiar la RPC exige una migración
  que corre Daniel a mano, y ésa es la consulta que alimenta la columna Proyección que él sí mira
  todos los días» (`src/lib/ventas/queries.ts:445-448`). El tipo deja escrito el camino de vuelta:
  sacarlos de ahí y ponerlos en el tipo de arriba, **no volver a mandarlos «por las dudas»**
  (`types.ts:98-107`).
- **El tooltip flotante del heatmap** tapaba las celdas vecinas que uno quería comparar. **El panel
  lateral derecho** (#279) tapaba AGO/SEP y parte de JUL — justo lo que Daniel miraba al tocar. Ganó
  la **fila transformada en su lugar**; el daño colateral fue perder el Δ% de la celda, que después
  volvió (`FilaDetalle.tsx:3-13`).
- **La matemática de celda estaba duplicada** en `ResumenView` y `ResumenViewMobile` → una sola
  `celda.ts`.
- **La leyenda del Δ como línea fija** bajo la tabla → pasó a `title=` sobre cada flecha
  (`ResumenAnual.tsx:92-93`).
- **Los cinco componentes de celda del móvil** (`MobileCell`, `MobileTotalCell`, …) se fueron con el
  heatmap de celular; la matriz sigue viva **solo desde 1440 px**, porque medida pedía 1.276 px de
  mínimo y no entraba en ninguna pantalla, tampoco en escritorio.

**Clientes**
- **La búsqueda corría solo sobre los `masters`**: 7 clientes con compras en 12 meses eran imposibles
  de encontrar (CEPREDENAC, NIPMAR, KAREN DUTY FREE, FERIA INT DE DAVID, ISABEL MARTINEZ, ALMACEN
  JORDANIA, MAZAR CITY SHOES) — «justo los que le aparecieron a Daniel al buscar *mult*»
  (27-jul-2026, `ClientesView.tsx:345-357`).
- **El período estaba acoplado al sort**: ordenar por «Compras YTD» **borraba clientes en silencio**.
  Hoy el chip de Vista y el orden son dos cosas (`ClientesView.tsx:125-130`).
- **El rótulo «Δ vs 2025» estaba escrito a mano**: con 2025 elegido decía «Compras 2025 · Δ vs 2025»
  y comparaba contra 2024. Mismo defecto en `OtrosClientesDialog`. Hoy el año **sale del dato**.
- **Dos textos distintos para el mismo botón** («click para ver detalle» en escritorio / «Ver detalle
  de huérfanos sin master» en celular — jerga de base de datos) → una sola constante
  `OTROS_CLIENTES_PISTA`.

**Productos**
- **La consulta `switch_articulo_margen_mensual` se retiró** (25-ago-2026): solo llenaba el selector
  de meses sueltos — una consulta por carga de pantalla, contra una base en compute Micro, para una
  respuesta que ya no mira nadie. **Ningún número de la pantalla salía de ahí.** El campo `meses` se
  dejó **opcional** en vez de borrarlo, para que una respuesta vieja en caché no reviente al
  deserializarse (`productos.ts:73-87`).
- **El aviso de «código mal clasificado»** y su consulta a `depurador_descripciones` se retiraron
  (migración `20260827120000`) — una consulta menos por carga. El candado se **invirtió** en vez de
  borrarse: reponerlo pone el build rojo
  (`src/__tests__/api/ventas-productos-descripcion-reciente.test.ts`). `depurador_descripciones`
  **sigue viva** en el Depurador.
- **El Δ del «Año en curso» comparaba contra los DOCE meses enteros** del año anterior: *Women-T-Shirts
  S/S* de Fashion Wear decía **−38 %** en «Año en curso» contra **+29 % / +15 %** en «Últimos 6 / 12
  meses» — la misma pantalla, las mismas ventas.
- **El período se resolvía en UTC**: el 25-ago a las 00:30 UTC son las 19:30 del 24 en Panamá, y «Año
  en curso» terminaba en un día que todavía no había pasado.
- **Dos bloques apilados en el drill-down** (códigos arriba, clientes abajo): con descripciones de 602
  y 842 códigos, «quién lo compra» quedaba a 600 renglones de scroll, o sea no existía → pestañas.
- **`switch_top_descripciones` (la vieja) se CONSERVA como caída**: sin la migración «la pantalla es
  la de ayer… el producto sigue partido y no se rompe nada». Igual `switch_clientes_por_codigos` y
  `switch_productos_por_cliente`, que tienen camino largo de respaldo en Node con la MISMA función.

**Comisiones**
- **«Sin asignar» → «Oficina (DEFAULT)»** (3-sep-2026): el rótulo viejo valía cuando ahí solo caían
  ventas de clientes sin dueño; desde la v6 esa fila junta ~$2.869 de cobro.
- **El texto de Criterios decía «se asignan al vendedor dueño del cliente»** — ya no era cierto ni
  para la venta (v5, jul-2026) ni para el cobro (v6). Se reescribió entero.
- **`vendedor` era obligatorio en `GET /descuentos`** — por eso la tabla consolidada no podía mostrar
  el neto: habría necesitado una llamada por vendedor y por empresa.
- **Solo `tasa_venta` era editable en la pantalla**; la de cobro, que la RPC sí usa, solo se podía
  tocar en la base. Hoy están las dos.
- **El reparto parejo de columnas al imprimir** (`ceil(n/2)` + `ceil(n/2)`) dejaba las dos columnas
  muertas a media hoja → llenar-primero. También se probó `TOTAL_LINE_ROWS = 3`, que dejaba media
  pulgada vacía; hoy es 1.
- **El encabezado medía 481 px en cuatro bloques apilados** — el 57 % de un iPhone, entraban 4
  vendedores de 6. Se bajó a dos filas: el título grande se fue, **«Criterios» y la fecha de
  sincronizado NO se borraron** (viven en el ⓘ) y el botón Excel **subió** al shell desde las dos
  vistas hijas.
- **Dos cajas sueltas de mes y año** («Julio» 140 px + «2026» 110 px) → `ComisionesPeriodo`, un solo
  control.
- **Las tablas en celular**: «Todas las empresas» pedía 984 px en 356 útiles = **628 px de arrastre**,
  con la columna Total fuera de pantalla; «Por empresa» tenía **279 px RECORTADOS** por el
  `overflow-hidden` del `Card` — peor que el scroll: invisible y sin aviso. → tarjetas.
- **El pivote de descuentos vivía en la vista consolidada** y la pestaña «Por empresa» no lo tenía:
  Reinaldo en Fashion Shoes salía **$1.573,08 más alto** en una que en la otra, la misma persona y el
  mismo mes en la misma pantalla. La resta se mudó al servidor, **una sola vez**.
- **10 peticiones y 15 consultas por apertura** de «Todas las empresas» (un `Promise.all` sobre 5
  empresas con un `fetch` anidado adentro) → **una** llamada a `/consolidado`, 7 consultas.
- **`AGUAS` a secas se CONSERVA** en la lista de retirados, aunque el canónico sea `REY STOUTE AGUAS`,
  porque `aplicarAlias` falla abierto.

**Transversal**
- **El tipo «Tiquete» lo reemplazó «Transacción» en mayo de 2025** y los dos siguen vivos, «porque la
  historia anterior no se reescribe». De ahí nacieron `tipos-comprobante.ts` y `centinela-tipos.ts`.

## Cuánto se usa

Misma advertencia: **no hay telemetría de pantallas**. Medido el 4-sep-2026:

- **Quién puede entrar a `/ventas`:** **2 personas** (los dos `admin`: **daniel** y **alberto**).
  `ventas` está en la fila `admin` de `role_permissions`, y en ninguna otra.
- **Quién puede entrar a `/comisiones`:** los 2 admin + **andrea** y **Angela** (las dos secretarias
  tienen `comisiones` en su `modulos_override`) + el usuario **`Contabilidad`** (lo tiene por rol
  desde el 26-ago-2026). Son **5 personas**.
- **Sesiones abiertas en 30 días** (re-medido el 5-sep-2026, `user_sessions`): daniel **110** ·
  Bodega 79 · andrea **59** · Angela **48** · rey 32 · Contabilidad **31** · jennifer 26 · edwin 8 ·
  david 5 · alberto **1**. (El «74» de daniel y el «49» de Angela del 4-sep no se reproducen; los
  demás sí, al número.)
- **Lo que el módulo escribió, y es lo ÚNICO vivo de los cinco módulos de este documento:**

| Tabla | Filas | Última escritura | Quién |
|---|---|---|---|
| `comision_exclusion` | 18 (**12 activas**, 6 apagadas) | **4-sep-2026** | **`daniel`** las 18, todas en los últimos 3 días |
| `comision_vendedor_tasa` | 5 | **4-sep-2026 00:45** (Reynaldo a 1 %/1 %) y **01:28** (Rey Stoute a `activo=false`) | sin columna de autor |
| `comision_descuentos_fijos` | 2 | creadas el **8-jul-2026**; el `updated_at` del 4-sep es el trigger de canonicalización, no una edición | sin autor |
| `comision_descuento_excepciones` | 2 | **14-jul-2026** | sin autor |
| `activity_logs` `entity_type = "ventas"` | 94 (`ventas_upload` 82 + `metas_upsert` 3 + `metas_delete` 9) | **25-may-2026** | **`andrea`**, y son de la carga manual de CSV **ya retirada** |

  O sea: **la pestaña Comisiones es lo único del módulo que deja rastro**, y ese rastro es de Daniel,
  de los últimos dos días.
- **Que el dato llegue** (re-medido el 5-sep-2026 16:30 UTC): en 30 días, `facturas` **1.376 corridas
  (45,9/día, 8 empresas, 0 errores)** · `recibos` **963 (32,1/día, 1 error)** · `ventas_tipos` 491 ·
  `articulos` 248 · `costo` 242 · `utilidad` 180 · `articulo_info` **160** · `factura_lineas` **78**.
  Últimas corridas buenas: facturas 16:24 UTC de hoy, recibos 15:17, utilidad 07:02,
  `articulo_info` 04:53.
  ```sql
  select sync_type, count(*) n, count(*) filter (where status='error') err, max(finished_at) ult
  from switch_sync_log where started_at >= now() - interval '30 days' group by 1 order by 2 desc;
  ```

## Qué papeles y Excel produce

Ventas **no manda correos ni imprime nada para el cliente**. Todo lo que sale son archivos que baja
Daniel (o contabilidad/secretaria en Comisiones). Todos empiezan en la **fila 1** con el encabezado
congelado y filtro desde A1, y la moneda va como **número** con formato `$#,##0.00`, nunca texto
(`src/lib/excel-export.ts`).

| Archivo | Desde qué botón | Columnas / secciones | Quién lo recibe |
|---|---|---|---|
| **`ventas-<año>.xlsx`** (hoja «Ventas») | botón **Excel** de la barra, en Resumen **y en Clientes** | Empresa · los 12 meses (o 4 trimestres) · Total · Margen% · el YTD del año anterior · Δ% | Daniel |
| **`productos-<empresa>-<periodo>.xlsx`** (hoja «Productos») | **Excel** de la pestaña Productos | Descripción · # Códigos · Cantidad · Venta · Precio prom. · **Margen%** *(la columna Margen NO se escribe si hay un cliente filtrado)* | Daniel |
| **`utilidad-por-cliente-<año>.xlsx`** (hoja «Utilidad por cliente») | **Excel** de la pestaña Utilidad | Cliente · Empresa · # Docs · Ventas · Costo · Utilidad · Margen% · fila TOTAL. 🔴 Un margen que no se puede calcular va como **celda vacía**, nunca 0,0 % | Daniel |
| **`comisiones-consolidado-<MM>-<año>.xlsx`** (hoja «Consolidado») | **Excel** con «Todas las empresas» activo | Vendedor · una columna por empresa · Total | Daniel, contabilidad |
| **`comisiones-<empresa_key>-<MM>-<año>.xlsx`** (hoja «Comisiones») | **Excel** con «Por empresa» activo | Vendedor · Ventas · Com. Venta · Cobros · Com. Cobro · Com. Total | Daniel, contabilidad |
| **`Comision-<Vendedor>-<Empresa>-<año>-<MM>.xlsx`** (hoja «Comisión») | botón del modal de detalle | multi-sección: **VENTAS** (fecha, cliente, secuencial, tipo, subtotal, % utilidad) · **COBROS** (fecha, cliente, monto) · **CIERRE** con los descuentos | el vendedor, cuando se le paga |
| **Impresión del detalle de comisión** (sin archivo) | botón 🖨 del mismo modal | 2 páginas fijas, letter apaisado: pág. 1 VENTAS, pág. 2 COBROS + CIERRE | el vendedor |

## Cómo probarlo a mano

**1. Que el número de arriba es el de Switch.**
Entra a `/ventas`, elige el año, mira «VENTAS NETAS». Ese número es la suma de la fila **Total Grupo**
de la matriz. Si no cuadra con Switch, el libreto está en la skill `numero-no-cuadra`. Recuerda las
dos trampas: las **notas de crédito ya están restadas** (sumarlas da exactamente el doble de las
devoluciones) y el mes en curso se compara contra los **mismos días** del año pasado, no contra el
mes entero.

**2. Que «Actualizar ahora» de verdad trae datos.**
En Resumen, toca **«Actualizar ahora»**. Espera el mensaje de fin (las 8 empresas van en secuencia,
~1 min). Para confirmar que quedó guardado, mira la píldora «Sincronizado …»: la fecha y hora tienen
que ser de hace un momento. En la base, la prueba es una fila nueva en `switch_sync_log` con
`sync_type='facturas'`, `status='success'` y `finished_at` de ahora.

**3. Que un cambio de tasa de comisión llega al número.**
Entra a `/comisiones` (con usuario **admin**) → pestaña **Configuración** → «Tasas por vendedor» →
cambia la tasa de venta de alguien → **Guardar**. Vuelve a «Todas las empresas» con el mismo mes: la
columna de ese vendedor tiene que moverse en la proporción del cambio. En la base:
`select vendedor_nombre, tasa_venta, tasa_cobro, updated_at from comision_vendedor_tasa`.
⚠️ La tasa es **global**, no por empresa: se mueve en las seis a la vez.

**4. Que un cliente deja de comisionar.**
En Configuración → «Clientes que no comisionan» → **+ Agregar** → elige empresa, cliente y vendedor,
deja las dos casillas marcadas → Guardar. La comisión de ese vendedor en esa empresa tiene que bajar.
En la base: `select * from comision_exclusion where activa` — tiene que aparecer la fila con
`creado_por` = tu usuario. Al quitarla, la fila **no se borra**: queda con `activa=false` y
`desactivado_por`/`desactivado_en` llenos.

**5. Que Productos y Clientes miran el mismo universo.**
Ventas › Clientes con «Todas» y el año en curso: el total de la columna «Compras \<año\>» tiene que
ser del orden de la fila Total Grupo del Resumen, **menos** Boston y Multifashion (Clientes solo
ofrece las seis del grupo). Si de golpe se duplica, el sospechoso es un JOIN por nombre contra
`clientes_master` — está prohibido y hay candado.

## Qué lo rompe

Casi todo lo que alimenta Ventas entra por el **API JSON de Switch con token**; solo la **utilidad**
entra por el **panel web con sesión**, y eso cambia el modo de fallar.

| Qué falla | Cómo se nota | Qué pasa con el dato |
|---|---|---|
| **Un `tipo_comprobante` NUEVO de Switch** | 🔴 sin el centinela, **valdría 0 en silencio** | Hoy avisa por 🔧 SISTEMA: `switch_facturas_tipos_sin_clasificar` + `src/lib/ventas/centinela-tipos.ts` escriben una fila con `sync_type='ventas_tipos'`. Los cinco tipos vivos hoy son Factura 45.871 · Nota de Crédito 5.170 · Tiquete 1.413 · Transacción 1.313 · Nota de Débito 699 |
| **Switch capa la paginación de `/apifactura/lista`** (máx 50 por página, p. 12 del PDF) | la venta del día sale corta | El sync corta por acumulado contra `total` y deja `*_paginacion_incompleta` en `switch_sync_log.skip_details`; se dice en pantalla |
| **`sync-utilidad` (07:00 UTC) falla** | Ventas › Utilidad vacía, y **la comisión de venta se queda sin su criterio de entrada** (`pct_utilidad > 20`) | Entra por el **panel web** (`POST /reportesventa/facturas`) con login `changesession:"SI"`, que **expulsa a quien esté en el panel**. Solo lo recupera la reconciliación de las **10:00**, nunca las de la tarde. Y desde el 3-sep esa tabla también aporta el costo de las **Notas de Débito** al Resumen: si deja de llegar, vuelve el costo negativo |
| **Dos syncs de la misma empresa a la vez** | el segundo recibe `0006 TOKEN INVALIDO` | 🔴 **La sesión de Switch es por USUARIO, no por empresa** (`docs/switch/api-documentacion.pdf`, p. 6) y el sistema entra como `daniel` en 7 de las 8. Por eso los crons de una misma empresa van a **≥15 min** (`SEPARACION_MINIMA_MIN = 15`, `src/lib/cron-telemetry.ts`), los de recibos van 15 min **después** de los de ventas, y **cada corrida saca a Daniel del panel de esa empresa** |
| **`switch-articulos` (08:40 UTC) no corre** | Productos se queda con el dato de anteayer | La tabla **llega hasta AYER** por diseño (el cron corre 03:40 Panamá). Toda comparación se corta con `ultimoDiaArticuloDiario`, nunca con «hoy» — comparar contra hoy hacía que Multifashion septiembre dijera +4,2 % cuando iba +46,1 % |
| **`sync-factura-lineas` (03:30 UTC) se atrasa** | «Clientes» dentro de Productos y el filtro por cliente salen vacíos | Es una **cola**, no una ventana de fechas: procesa `switch_facturas WHERE lineas_synced_at IS NULL`, tope **300 documentos por empresa y corrida**. No toca ningún total de venta |
| **`sync-recibos` falla** | la comisión de **cobro** queda corta | Se reemplaza el **mes entero** (el endpoint `/apireporte/recibos` **no está documentado** y **no trae id ni secuencial de recibo**). Un mes en curso que traiga 0 el día 1 **es normal**: por eso `recibos` está fuera de la alerta A |
| **La migración de la RPC no corrió** | 🔴 **nada visible**: `rpcConFallbackDeVersion` cae a la versión anterior en silencio | La respuesta lo dice en su campo `version` (`v8`/`v7`/`v6`/`v5`), pero ninguna pantalla lo muestra. Medido: al 4-sep-2026 **las siete migraciones están aplicadas**, así que hoy corre la v8 |
| **Un monto imposible de Switch** | la línea ámbar arriba de las pestañas lo dice, con el documento | El guard rechaza la fila; nunca se escribe un 0. Cubre cuatro familias (`factura`, `utilidad`, `costo_diario`, `articulo_diario`) más `recibo` aparte, dentro de Comisiones |
| **`db-max-rows` = 1000** | 🔴 nada: corta en silencio | Ya costó: ACS junio-2026 tenía 1.259 recibos y se leían 1.000 → los 259 invisibles se re-insertaban 4 veces al día |
| **Se compara «hasta hoy» contra un mes entero** | un −93 % que en realidad es +2 % | Lo impide `clientes-corte-comparativo.ts`, con el candado que nombra los seis consumidores |

## Lo que sobra o no cuadra

**Código y rutas sin uso**
- 🔴 **`GET /api/ventas/años` no tiene un solo consumidor.** Las páginas (`/ventas`, `/comisiones`,
  `/multifashion`) llaman a `fetchAvailableYears()` en el servidor. Además la ruta **ignora los
  errores de Supabase** (lee `{data}` sin mirar `error`), así que una caída devuelve
  `[añoActual]` con **200**, y calcula el año con la zona del servidor (UTC en Vercel), no con la de
  Panamá. Su directorio se llama `años` con ñ → la URL real es `/api/ventas/a%C3%B1os`.
- **`GET /api/ventas/v2` y `GET /api/ventas/v2/status` no tienen consumidor en la app.** `v2` es la
  única ruta del módulo con `requireAuth` (su 403 dice «Sin permisos», plural, contra «Sin permiso»
  del resto) y **sin rango de `year`** (acepta 1900 o 99999). `v2/status` es la única con roles
  `admin` + **`secretaria`**.
- `src/lib/ventas/tipos-comprobante.ts` y `src/lib/ventas/centinela-tipos.ts` **no los importa ninguna
  ruta de `/api/ventas`**: los usan los syncs y `clientes-ytd`. No están muertos, pero no viven aquí.

**Contradicciones medidas**
- 🔴 **Ninguna migración del repo queda pendiente.** Re-medido el 5-sep-2026 contra
  `supabase_migrations.schema_migrations`: están aplicadas **todas hasta `20260928120000`**, o sea
  las siete que `CLAUDE.md` marca «pendiente» (`20260906`, `20260909`, `20260910`, `20260911`,
  `20260912`, `20260913`, `20260915`), las seis posteriores que no menciona (`20260914`, `20260916`,
  `20260918`, `20260919`, `20260920`, `20260921`) y las siete de estos dos días (`20260922` a
  `20260928`). El sufijo de todas es `120000`.
- ✅ **CERRADO el 4-sep-2026 — la píldora «Sincronizado» del Resumen vigilaba 3 empresas de 8, y se
  quitó.** `SWITCH_FACTURAS_EMPRESA_KEYS` era `["active_shoes","active_wear","american_classic"]`
  mientras el cron cubre **las 8**, así que Vistana, Fashion Wear, Fashion Shoes, Joystep o Boston
  congeladas se veían en VERDE. Daniel: *«¿de qué sirve tenerlo si ya el sistema corre fluido y si no
  me avisa por Telegram para arreglarlo?»* — y la vigilancia real ya existe: `datos-frescos.ts`
  DERIVA su lista de `empresasConFacturas()` (las 8) y avisa por Telegram a las +24 h. Se retiraron
  la píldora de las dos caras del Resumen y la constante; el candado cambió de dirección y lleva
  CONTROL de que el Resumen sí se pinta.
- 🔴 **`CLAUDE.md` dice que la fila de tasa de Rey Stoute Aguas es «decisión pendiente de Daniel».**
  Ya no: la migración `20260916120000_retirar_rey_stoute_aguas` corrió y la fila está con
  `activo = false` desde el 4-sep-2026.
- **`CLAUDE.md` dice que hay 17 exclusiones activas (11 al aplicar la migración).** Re-medido el
  5-sep-2026: **18 filas, 12 activas y 6 apagadas** (las 6 con `desactivado_por = 'migracion-alias-v8'`).
  La nº 18 (creada el 4-sep por `daniel`) es la **primera exclusión asimétrica del sistema**: Edwin,
  cliente `D-81` de Vistana, `excluye_venta = false` y `excluye_cobro = true`. La regla nueva ya está
  en uso, así que el «11 activas» de `CLAUDE.md` quedó viejo el día después de escribirse.
  ```sql
  select empresa_key, cliente_codigo, vendedor, activa, excluye_venta, excluye_cobro
  from comision_exclusion order by activa desc, empresa_key, cliente_codigo;
  ```
- **`CLAUDE.md` menciona una cuarta grafía `"REINDALDO "` con espacio final en
  `comision_vendedor_alias`.** No existe en la tabla (5 filas medidas): el `TRIM` de
  `comision_vendedor_canonico()` la resuelve sin fila propia.
- **`CLAUDE.md` dice que `grupo-resumen-mensual` corre «el día 3 de cada mes (`0 13 3 * *`)».**
  `vercel.json` dice **`0 13 1 * *`** (día 1) desde el 4-sep-2026, y el código lo explica
  (`src/lib/grupo-resumen-mensual.ts`). El mismo bloque de `CLAUDE.md` lo pone en 📊 NEGOCIO cuando
  hoy sale por `enviarNegocioPrivado`.
- **El comentario de `src/lib/ventas/productos.ts:14-15` dice que Boston no se backfilleó en
  `switch_articulo_diario`.** Medido el 5-sep-2026: **18.064 filas de `confecciones_boston`, desde el
  14-oct-2022 hasta el 4-sep-2026** (eran 18.016 el 4-sep — la tabla sigue creciendo, o sea que el
  cron SÍ escribe Boston todos los días).
  Boston no está en el selector de Productos por otra razón (`PRODUCTOS_EMPRESA_KEYS` no lo incluye),
  no por falta de datos.
- 🔴 **`docs/switch-flujo.md` está tres versiones atrás en Comisiones.** Su §3 dice
  «Comisiones (RPC `comision_b2b_v5`)»; la viva es **`comision_b2b_v8`**
  (`src/lib/comisiones/rpc.ts:29`). Su §9 nombra una RPC **`comision_cobro_v3` que no existe**: ese
  es el nombre de un archivo de migración (`20260604010000`), y hoy el cobro es una **columna** de la
  v8. Y su §1 dice «RPC `ventas_dashboard_summary`»: la viva es **`_v2`**
  (`src/lib/ventas/dashboard-summary.ts:23`), la `_v1` es solo el fallback.
- **Los comentarios del propio código también nombran RPC superadas:**
  `api/ventas/comisiones/consolidado/route.ts:14` y `:23` dicen «`comision_b2b_v6`, con red a la v5»;
  `api/ventas/comisiones/route.ts:12` igual; `api/ventas/comisiones/detalle/route.ts:3` cita la **v3**.
  Y `src/lib/ventas/queries.ts:247` loguea `[ventas/proyeccion_cierre_v1]` para un error de la **v7**.
- **`src/app/api/ventas/clientes-12m/route.ts:2` cita `/api/ventas/clientes` como si existiera.**
  Esa carpeta ya no está.
- **`docs/switch-flujo.md` no dice dónde se refresca `ventas_rollup_mensual_mv`** — la fuente de
  Resumen › Anual, Resumen › Mes×año y del año anterior de Vista General. Es
  `refresh-clientes-views`, **07:35 UTC**.
- **Todas las citas a `src/lib/switch-api/client.ts` de `docs/switch-flujo.md` están 5 líneas
  desfasadas** (p.ej. `/apifactura/lista` doc `:1086` → real `:1091`). Son 14 referencias.

**Datos sucios / columnas que nadie llena**
- `switch_facturas.sucursal_nombre` tiene **dos grafías del mismo valor**: `PRINCIPAL` (54.271) y
  `Principal` (195). Ninguna pantalla la usa hoy, pero cualquier agrupación futura las partiría.
- `switch_costo_diario` tiene **200 filas de fechas FUTURAS** (6 a 30-sep-2026, 8 empresas × 25 días)
  con venta y costo en 0 — el reporte de Switch devuelve el mes calendario entero (`max(fecha)` =
  **30-sep-2026**). Y **726 de sus 1.223 filas (59 %) tienen `costo_total = 0`**. Esa tabla no
  alimenta ninguna pantalla; su único lector es el cuadre mensual.
  ```sql
  select count(*) total, count(*) filter (where fecha > current_date) futuras,
         count(*) filter (where costo_total = 0) costo_cero, max(fecha) from switch_costo_diario;
  -- → 1223 | 200 | 726 | 2026-09-30   (5-sep-2026)
  ```
- `switch_recibos` **no tiene llave natural**: su único índice único es la PK `id`. Medido, 2.604
  grupos de `(empresa, fecha, cliente, monto, vendedor_registro)` tienen más de una fila. Es
  coherente con el sync de delete+insert, pero significa que no hay forma de deduplicar un recibo.
- `switch_articulo_info`: al **5-sep-2026** hay **1.408 fichas traídas de las 1.763 de `active_shoes`**
  (`CLAUDE.md` dice 400; eran 1.200 ayer — drenan ~200/día, como estaba previsto) y **4.924 artículos
  con existencia > 0** en total sobre 16.658 filas (`CLAUDE.md` dice 5.040 sobre 16.619).
  🔑 **Las 1.408 fichas son TODAS de `active_shoes`**: ninguna otra empresa tiene una sola.
  ```sql
  select count(*) total, count(*) filter (where existencia > 0) con_existencia,
         count(*) filter (where ficha_at is not null) fichas,
         count(*) filter (where empresa_key='active_shoes' and ficha_at is not null) fichas_as
  from switch_articulo_info;   -- → 16658 | 4924 | 1408 | 1408
  ```

**Dos caminos para lo mismo**
- **El botón «Excel» de la barra sigue visible en la pestaña Clientes y baja el archivo del
  Resumen** (`ventas-<año>.xlsx`, empresa × mes). Clientes no tiene export propio, así que quien lo
  toque parado en el ranking se lleva otra cosa.
- **`/api/ventas/comisiones/detalle` no netea descuentos** (su `comision_total` es BRUTO) mientras
  `/comisiones` y `/comisiones/consolidado` sí. El modal los resta por su lado leyendo
  `/descuentos`. Es la única de las tres hermanas que además **no usa la cadena de versiones**: llama
  `comision_b2b_detalle` directo.
- Los rangos de `year` no son uniformes: **2000–2100** en `resumen` y `clientes-12m`, **2024–2100** en
  `productos`, `utilidad-cliente` y `comisiones`, y **sin rango** en `v2`.
- `/api/ventas/clientes-12m` es la única ruta con parámetro de empresa **sin lista blanca**: una
  empresa inválida no da 400, la vista simplemente devuelve 0 filas.
---

# Cuentas por Cobrar (`/cxc`, key `cxc`)

## Qué es

La pantalla de cobro: quién le debe al grupo, cuánto, desde hace cuánto, y las cuatro cosas que se
hacen para cobrarlo (mandar el estado de cuenta por correo, mandarlo por WhatsApp, copiar el mensaje,
ver o bajar el PDF) — todas detrás de **un solo botón «Cobrar»** desde el 5-sep-2026.

**La URL es `/cxc` desde el 5-sep-2026** (era `/admin`, que se leía como «administración»). El rótulo
no cambió y la `key` sigue siendo `cxc` porque está en `role_permissions`. `/admin` **redirige**
(temporal, 307, arrastrando la query); ⚠️ **`/admin/usuarios` y `/admin/data-health` NO se movieron**:
la redirección es de `/admin` exacto.

Tiene **dos pestañas que nunca se ven juntas**: **«Grupo · 6 empresas»** y **«Confecciones Boston»**.
Son dos consultas a dos vistas disjuntas, así que no existe ninguna pantalla donde los saldos del
grupo y los de Boston puedan sumarse (ver `docs/postmortems/boston-cxc.md`).

## Quién entra

- **La ficha del menú** se le pinta a `admin` y `vendedor` (`roles: ["admin","vendedor"]`).
- **La pantalla `/cxc`** deja entrar a `admin`, `secretaria` y `vendedor`
  (`useAuth({ moduleKey: "cxc", allowedRoles: [...] })`), y **`/api/cxc/aging` también**: contesta 403
  a todo lo que no sea esos tres. O sea que **`secretaria` tiene el módulo completo aunque el
  catálogo no se lo pinte**.
  Medido el 4-sep-2026: `role_permissions.secretaria` **no** trae `cxc`, pero **Angela** sí lo tiene
  en su `fg_users.modulos_override` (11 keys, con `cxc`); **Andrea no** (tiene `multifashion` en su
  lugar). O sea que la ficha del CXC hoy la ve **una** de las dos secretarias, por override
  individual, no por rol.
- **Un vendedor con empresa asociada solo ve la suya, y el recorte está en el SERVIDOR.**
  `/api/cxc/aging` lee `fg_users.associated_company` del usuario de la sesión (no de la cookie) y
  filtra `.eq("company_key", …)`. Medido: el único con `associated_company` es **`edwin` → `vistana`**.
  La UI además guarda ese valor en `sessionStorage.fg_empresa_filter` y lo pone por encima de la URL.
- **La pestaña de Boston la ven `admin`, `secretaria` y `gerente_boston`** (`ROLES_BOSTON`,
  `src/lib/cxc/boston-roles.ts`) — **`vendedor` NO**. Y no se dibuja gris: no se dibuja. Un enlace con
  `?tab=boston` cae al grupo (`tabCxcPermitida`). `gerente_boston` (David) llega a esa pestaña por
  `/boston`, no por `/cxc`: su único módulo es `boston`.
- **Exportar** (CSV / los dos PDF) es solo `admin` y `secretaria` (`canExport` en `cxc/page.tsx`).
- **Cobrar lo puede hacer todo el que entra al módulo** (admin · secretaria · vendedor): no se agregó
  ninguna restricción nueva con el rediseño.
- 🩸 **La anomalía de roles se cerró borrando la función** (4-sep-2026). `/api/cxc/favorites` exigía
  `rolesBoston()` = `["admin","secretaria","gerente_boston"]`, o sea que un `vendedor` veía el CXC y
  recibía **403** al tocar la estrella. La ruta ya no existe: los favoritos se retiraron enteros
  (Daniel: *«quita favoritos»*; la tabla tuvo 0 filas en toda su historia). Con eso, `gerente_boston`
  se quedó **sin ninguna** ruta de anotación: las dos que sobreviven (`overrides` y `contact-log`)
  son de `["admin","secretaria","vendedor"]`.

## Las pantallas

Todo el estado vive en la URL: `?tab=grupo|boston` · `?search=` · `?risk=all|current|watch|overdue`
· `?empresa=`. Los tres últimos van con `replace` (el Atrás no cicla por filtros). El filtro de
empresa además se recuerda en `localStorage` (`fg_last_cxc_empresa`) y la restricción por usuario
gana sobre todo.

Hay **dos layouts completos** que no se cruzan: `PanelCxcMobile` (< 1024 px, tarjetas) y la tabla de
escritorio (≥ 1024 px). El corte es `lg` y no `md` porque lo que decide es el ancho ÚTIL: a 834 px
(iPad vertical) la barra lateral se lleva 224 px y a la grilla le quedaban 133 px para el nombre del
cliente.

### Pestaña «Grupo · 6 empresas»

🔄 **Rediseñada el 5-sep-2026.** Antes del primer cliente había **SEIS bloques**; quedan **DOS**. El
porqué de cada cambio, con sus mediciones, está en `docs/postmortems/boston-cxc.md`.

De arriba abajo:

1. **Una sola línea de filtros**, en orden de uso: **selector de empresa** («Todas mis empresas» + las
   6) · **buscador angosto** (~230 px; busca en nombre normalizado, correo, teléfono, celular y
   contacto) · empujada a la derecha, **la frescura** (`SyncStatus`, texto tenue) · **Exportar**
   (negro, admin/secretaria: CSV · PDF Resumen · PDF Detallado) · **Actualizar ahora** (borde; dispara
   el sync de la empresa del filtro, apagado con «Todas»).
2. **Aviso ámbar de rechazos de Switch** (`AvisoRechazosSwitch`, familia `cxc`, acotado a las 6), si
   hay algo que decir.
3. **La tira de totales, pegada a la tabla y en su MISMA grilla de 12 columnas** (4/2/2/2/2), así que
   cada total queda **parado sobre su columna**:
   - **celda 1** (sobre «Cliente»): el aviso **«N sin pagar hace +90 d»** con su monto en rojo,
     **tocable** (filtra la lista, toggle, en la URL con `replace`). Si no hay ninguno, dice
     «N clientes».
   - **celdas 2-4**: `0-90d` · `91-120d` · `121d+`, con su punto de color, el monto y el conteo
     debajo. 🔴 **El chip dice solo el rango**; el nombre completo («Vencido reciente 91-120d») vive
     en su `title` y sale de `tramoLabel()`, la misma fuente única que usan el celular, el papel y el
     correo.
   - **celda 5** (sobre «Total»): `Total · N` con el total pendiente.
   Las cuatro **filtran Y ordenan** en una sola acción; tocar la encendida la apaga
   (`src/lib/cxc-orden.ts`, que **no se tocó**).
4. **La tabla**: `Cliente · 0-90d · 91-120d · 121d+ · Total`. Cada fila lleva una **casilla de
   selección** a la izquierda (la del encabezado selecciona lo filtrado), la barra de color por
   riesgo, y a la derecha del total el botón negro **«Cobrar»** — visible, sin abrir nada.
   🩸 **Se fueron el menú «···» y el menú de clic derecho**: eran tres listas de acciones en tres
   archivos, ninguna visible hasta tocar algo, y el clic derecho no existe en el iPad.
   🩸 **Y se fue la línea «N de M clientes · ordenados por …»**: el conteo está en el chip de Total y
   el orden lo dice la flecha del encabezado de la columna.
5. **Barra de selección** (aparece al marcar clientes): `N clientes · $X` · `M comparten correo → K
   correos` · «Quitar selección» · **«Cobrar a los N»**.
6. **«Saldo a favor (N)»** — los clientes con total negativo van en su propio bloque al pie, fuera de
   la lista de cobro.

**Solo con el filtro «sin pagar» encendido**, cada fila muestra al lado del nombre, en gris chico,
«no paga hace 298 d» o «nunca ha pagado». En la lista normal no se muestra.

📏 **Cuánto es «N» hoy** (5-sep-2026): de los **94 clientes que deben plata**, **37 no pagan hace más
de 90 días** —30 con un pago viejo y **7 que nunca pagaron**— y entre los 37 suman **$647.944,31**.
El más viejo lleva **911 días** sin pagar. El umbral es `DIAS_SIN_PAGAR_UMBRAL = 90`
(`src/lib/cxc/sin-pagar.ts`), y `avisaSinPagar` trata «nunca pagó» (`null`) como que SÍ avisa.

```sql
with cli as (select codigo, sum(total) total from switch_estadocuenta_aging group by 1 having sum(total) > 0),
     p as (select cliente_codigo codigo, max(ultimo_pago_fecha) ult
           from switch_ultimo_pago_cliente_v2
           where empresa_key in ('vistana','fashion_wear','fashion_shoes','active_wear','active_shoes','joystep')
           group by 1)
select count(*) con_saldo,
       count(*) filter (where p.ult is null) nunca_pago,
       count(*) filter (where p.ult < current_date - 90) sin_pagar_90,
       round(sum(cli.total) filter (where p.ult is null or p.ult < current_date - 90),2) monto,
       max(current_date - p.ult) dias_max
from cli left join p using (codigo);
-- → 94 | 7 | 30 | 647944.31 | 911   (5-sep-2026)
```

**Al tocar la fila** se despliega `ContactPanel`:
- **El desglose por empresa se quedó EXACTAMENTE como estaba** (Daniel lo eligió así): `Por vencer ·
  Vencido reciente · Vencido crítico · Total · Último pago · Última compra`. «Último pago» es el
  **cobro real** más reciente en esa empresa (excluye retenciones y recibos en cero) y sus días se
  pintan con la escala del aging; «Última compra» es la **última Factura** y sus días van en **gris a
  propósito** — una compra vieja no es plata en riesgo.
- 🔄 **Debajo, «Últimos pagos» POR FECHA** (no por empresa): las 3 últimas fechas en que pagó, con el
  total de ese día y en qué empresas — `20 ago · $234,189.21 · Vistana · Fashion Wear · Active Shoes
  · Fashion Shoes`. Se pide al abrir el panel y no se vuelve a pedir. 🩸 El bloque por empresa y su
  botón «Últimos pagos ›» se retiraron: un cliente que le paga a las seis el mismo día llenaba **18
  líneas para decir lo que dicen 3**.
- **Acciones en una línea**: **[Cobrar]** (negro) · **[Ver los documentos]** · **Ver ficha completa ›**
  a `/clientes/<código>` · y a la derecha, en gris, la marca de envío («Le enviaste el estado de
  cuenta hace 3 días» / «Copiaste el mensaje hace 3 días», 7 días).

### La hoja «Cobrar» — una hoja, cuatro salidas

Se abre desde el botón de la fila, desde el panel, desde el celular y desde el pie del cajón de
documentos. Encabezado: `Estado de cuenta al <fecha> · N empresas · $total`, y debajo la marca de
envío si aplica. Cuatro filas:

1. **Correo** — muestra el destinatario y **manda con un clic**, sin ventana de compose, con
   **«Deshacer» de 5 segundos**: el envío real ocurre al vencer el plazo. Sin correo cargado la fila
   sale **apagada** y dice «Este cliente no tiene correo — cárgalo en su ficha» (medido: 21 de 100).
2. **WhatsApp** — al celular o al teléfono, con el mismo texto de siempre.
3. **Copiar el mensaje.**
4. **Ver o bajar el PDF** — comparte por la hoja del sistema en celular, baja en la computadora.

Más **«Escribirlo yo»**, que abre el `EnviarEmailModal` de siempre (destinatario, asunto y cuerpo
editables, con vista previa). En celular la hoja **sube desde abajo**.

🔴 **Lo que se manda son SIEMPRE las 6 empresas, sin importar el filtro de la pantalla.** Daniel,
textual: *«todo»*. La regla vive en el servidor.

### Mandar a varios

Casilla por fila + casilla en el encabezado. 🔴 **UN correo por DIRECCIÓN, no por cliente**: los que
comparten dirección reciben **un solo correo con UN PDF** que trae una hoja por cliente y el total al
final. Los que no tienen correo **no abortan el lote**: se manda a los que se puede y se dicen **por
nombre** los que quedaron fuera. La agrupación la hace el **servidor** (`/api/cxc/cobrar-lote`), no
el navegador: la barra solo la muestra.

📏 **Medido el 5-sep-2026 sobre los 100 clientes de la cartera** (el `coalesce` es el mismo orden que
usa la ruta: override → `clientes_master.email` → correo de la vista):
**21 no tienen correo · 79 sí · 31 de esos 79 comparten 9 direcciones → salen 57 correos, no 79.**
`oficina@citymoda.store` lo comparten **13 clientes** que deben **$402.376,67** entre todos;
`contabilidad@citymall.com.pa`, los dos City Mall ($480.784,76).

```sql
with cli as (
  select a.codigo, sum(a.total) total,
    lower(trim(coalesce(max(nullif(trim(cm.email),'')), max(nullif(trim(a.correo),''))))) mail
  from switch_estadocuenta_aging a
  left join clientes_master cm on cm.codigo = a.codigo and cm.deleted is not true
  group by a.codigo),
 g as (select mail, count(*) n from cli where mail is not null group by 1)
select (select count(*) from cli) clientes,
       (select count(*) from cli where mail is null) sin_correo,
       (select count(*) from g) correos_a_enviar,
       (select count(*) from g where n>1) direcciones_compartidas,
       (select sum(n) from g where n>1) clientes_compartiendo;
-- → 100 | 21 | 57 | 9 | 31   (5-sep-2026)
```
⚠️ Esta consulta agrupa **por `codigo`**. Corriéndola sobre las 211 FILAS da 180 con correo y los
mismos 57 destinos, un número que no significa nada — es el error de grano que este documento tenía.

### El cajón «Estado de cuenta» (`Ver los documentos`)

🔄 **Rediseñado el 5-sep-2026.** Arriba: el nombre, **el total grande**, `D-25 · al <fecha> · N
documentos en M empresas` y una tira de **pastillas por empresa con su subtotal** (tocarlas salta a
esa sección). La tabla lleva **encabezados de columna** —`Documento` (número arriba, tipo abajo) ·
`Fecha` · `Días` · `Original` · `Saldo`— y `Original` muestra **«—» cuando es igual al saldo**.
🩸 Antes eran dos líneas por documento sin un solo encabezado y dos números apilados sin decir cuál
era cuál.

🔴 **Lo chico se agrupa POR MONTO (< $50), nunca por tipo de documento**: se pliega en una línea
«N documentos de menos de $50 · $X — ver», que se despliega. Verificado el 5-sep-2026: **36 de los
110 documentos de City Mall Paso Canoa (D-25)** valen menos de $50 y suman **$227,20** — exacto.
Agrupar por tipo escondería notas de débito reales de **$5.000**.

```sql
select cliente_codigo, count(*) docs,
       count(*) filter (where abs(saldo) < 50) chicos,
       round(sum(abs(saldo)) filter (where abs(saldo) < 50),2) suma_chicos
from switch_estadocuenta
where empresa_key in ('vistana','fashion_wear','fashion_shoes','active_wear','active_shoes','joystep')
  and cliente_codigo = 'D-25' and saldo <> 0
group by 1;   -- → D-25 | 110 | 36 | 227.20
```

**El pie dice «Cobrar»** (era «Compartir»/«Descargar PDF») y abre la misma hoja: hasta hoy, desde el
papel no se podía mandar el papel.

### Pestaña «Confecciones Boston»

🔄 **Mismo formato desde el 5-sep-2026**: tira de totales alineada a sus columnas, la tabla en la
misma grilla de 12, y por fila **«Cobrar»** y **«Documentos»**. Como es **UNA** empresa no hay
desglose: tocar un cliente va **directo a sus documentos**, con los mismos encabezados y la misma
agrupación de lo chico por monto; sus **3 últimos pagos** viven dentro de ese cajón.

Los tres tramos que se ven son los mismos del grupo (`d0_90 / d91_120 / d121_plus`, sobre
`switch_estadocuenta_aging_boston`); el **detalle fino** del `title` ✅ **ya está**: la migración
`20260928120000` corrió el 5-sep-2026 y la vista pasó de 10 a **17 columnas**, con los siete tramos
finos (`d0_30 · d31_60 · d61_90 · d121_180 · d181_270 · d271_365 · mas_365`) **al lado** de los tres
gruesos, no en vez de ellos. Un chip marca al cliente que **también existe en el grupo** — es solo una
etiqueta: no se suma nada. La coletilla a la derecha dice «Confecciones Boston · se lleva aparte».

⚠️ **Su hoja «Cobrar» ofrece WhatsApp · Copiar · Ver los documentos, pero NO correo**, y es una
decisión pendiente de Daniel, no un olvido: de sus **390 clientes en la cartera** (279 con saldo
positivo), **272 tienen teléfono o celular pero solo 113 correo**, y el texto de cobro del sistema lo
firma **Fashion Group**, que no es Boston. El mensaje que sí sale lo firma **«Confecciones Boston -
Departamento de Cobros»**.

```sql
select count(*) clientes,
  count(*) filter (where nullif(trim(sc.telefono),'') is not null
                      or nullif(trim(sc.celular),'') is not null) tel_o_cel,
  count(nullif(trim(sc.email),'')) correo
from switch_estadocuenta_aging_boston b
left join switch_clientes sc
  on sc.empresa_key='confecciones_boston' and sc.cliente_switch_id = b.cliente_switch_id;
-- → 390 | 272 | 113   (5-sep-2026)
```
🩸 **Y ese contacto está congelado.** `switch_clientes` de Boston tiene sus 4.915 filas con
`synced_at = 2026-07-30 06:31:07` — **37 días sin refrescarse**. El cron que lo arregla
(`sync-clientes-boston`) nació hoy y corre **los domingos 07:10 UTC**, así que a la fecha de esta
medición **todavía no ha corrido ni una vez**. Ver `docs/modulos/03-multifashion-y-boston.md`.

🔴 **Y sigue APARTE**: su cajón tiene **su propia ruta** (`/api/cxc/boston/estado-cuenta`) y no reusa
el lector del grupo; sus teléfonos y correos salen de `switch_clientes` acotado a Boston, **nunca de
`clientes_master`**.

**Tarea más frecuente (3 pasos):** abrir `/cxc` → tocar el chip **«121d+»** (o el aviso «N sin pagar
hace +90 d») → **«Cobrar»** en la fila del primero → **Correo** (o WhatsApp).

## Los datos

CXC **lee** la cartera de Switch y **escribe** solo anotaciones. Medido el 4-sep-2026:

### Lo que lee

| Fuente | Filas | Grano · llave | Notas |
|---|---|---|---|
| `switch_estadocuenta_aging_mv` (materializada) | **211 filas = 100 clientes** | `id = md5(company_key + codigo)`, índice único sobre `id` | La lee `/api/cxc/aging`. Trae `materializado_en` = **2026-09-05 16:12:26 UTC** (la frescura que muestra la pantalla) |
| `switch_estadocuenta_aging` (vista viva) | **211 filas = 100 clientes** | mismo grano | El fallback de la ruta si la MV falla. **Medido el 5-sep-2026: `EXCEPT` entre las dos, en las DOS direcciones = 0 filas.** La usa Vista General a propósito |
| `switch_estadocuenta` | **2.759** | `UNIQUE (empresa_key, ccte_id)` | La base. La lee `estado-cuenta-data.ts` para el drawer, el PDF y el correo |
| `switch_estadocuenta_aging_boston` (vista) | **390 filas = 390 clientes** (Boston es UNA empresa) | 1 fila por cliente de Boston | Buckets `d0_90 / d91_120 / d121_plus` **+ los siete finos** (`d0_30 … mas_365`) desde `20260928120000`; Σ = **$195.509,25**, 279 con saldo positivo |
| `clientes_master` | 150 vivas | `UNIQUE (codigo)` | Solo tres columnas, **en vivo**: `email`, `telefono`, `celular` |
| `switch_ultimo_pago_cliente_v2` (vista) | — | (empresa, cliente) | «Último pago» |
| `switch_ultima_compra_cliente_v1` (vista) | — | (empresa, cliente) | «Última compra» |
| `switch_recibos` | 46.717 | **sin llave natural** (solo la PK `id`) | Los últimos 3 pagos, una consulta **por empresa** |
| `fg_users.associated_company` | 11 usuarios, 1 con empresa | — | El recorte del vendedor |

🔴 **211 NO ES «211 CLIENTES»: es 211 FILAS, una por (empresa, cliente).** Los clientes DISTINTOS
son **100**, y 100 es lo que se ve en la pantalla — `useAdminData` consolida por `nombre_normalized`
antes de pintar. Decir «me deben 211 clientes» es contar seis veces a City Mall.
De esos 100: **94 deben plata · 6 tienen saldo a favor** (−$1.316,35 entre los seis, en el bloque del
pie). El mismo dato lo dice el propio código: `HojaCobrar.tsx` y `/api/cxc/cobrar-lote` miden «los
100 clientes con saldo».

```sql
select count(*) filas, count(distinct codigo) clientes from switch_estadocuenta_aging;
-- → 211 | 100   (5-sep-2026)
with cli as (select codigo, sum(total) t from switch_estadocuenta_aging group by 1)
select count(*) filter (where t>0) deben, count(*) filter (where t<0) a_favor,
       round(sum(t),2) total from cli;   -- → 94 | 6 | 3676935.55
```

**Reparto de `switch_estadocuenta` por empresa, 5-sep-2026** (filas · con saldo ≠ 0 · Σ saldo):
`confecciones_boston` 990 · 919 · $318.112,97 — `fashion_wear` 632 · 299 · $1.287.963,45 —
`vistana` 504 · 269 · $864.961,10 — `fashion_shoes` 425 · 236 · $946.023,72 —
`active_shoes` 91 · 68 · $432.477,13 — `active_wear` 90 · 40 · $323.869,16 —
`joystep` 27 · 19 · $115.683,25. **`american_classic` = 0 filas** (retail sin cartera).

**La cartera del grupo, por empresa, 5-sep-2026** (filas · Σ total de `switch_estadocuenta_aging`):
`fashion_wear` 49 · $1.199.871,71 — `fashion_shoes` 42 · $851.029,60 — `vistana` 64 · $837.545,86 —
`active_shoes` 31 · $413.375,01 — `active_wear` 17 · $310.376,50 — `joystep` 8 · $64.736,87.
**Total 211 filas · 100 clientes · $3.676.935,55.**

```sql
select company_key, count(*) filas, round(sum(total),2) total,
       round(sum(d91_120+d121_180+d181_270+d271_365+mas_365),2) vencido90
from switch_estadocuenta_aging group by 1 order by 3 desc;
```

**Columnas de `switch_estadocuenta` que llegan a medias** (de 2.759): `numero_fiscal` 2.287 (472
vacías) · `abrev` 1.769 · `saldo_original` 1.769 · `total_original` 1.769. Las **990** que faltan en
`abrev`/`*_original` son **exactamente las de Boston** (990 filas de Boston = 2.759 − 1.769), que
entra por el reporte web y no por el API.
`tipo_comprobante` (8 valores): Factura **1.958** · Recibo 369 · Nota de Débito 190 · Nota de Crédito
165 · Transacción 44 · Saldo Anterior 27 · Tiquete 5 · Recibo Saldo Anterior 1.

🔴 **Columnas de la vista de aging que NADIE llena** (0 de 211, verificado el 5-sep-2026):
`upload_id` (es un `NULL::uuid` literal en la definición de la vista, herencia del upload de CSV),
**`contacto`**, **`distrito`** y **`corregimiento`**. Lo que sí llega: `correo` 180 · `celular` 186 ·
`telefono` 153 · `provincia` 126 · `cliente_id` 211.
✅ **`contacto` dejó de estar vacío en PANTALLA el 5-sep-2026**: la vista lo sigue devolviendo
`''::text` hardcodeado, pero `/api/cxc/aging` lo **relee en vivo** de `clientes_master.contacto` —la
columna nueva de la ficha del cliente, **migración `20260926120000` APLICADA el 5-sep-2026**— junto
con `email/telefono/celular`. Medido: **6 de los 150 clientes vivos tienen `contacto` cargado**
(D-38 «Alberto levy», D-76 «emad», D-166 «Mohamed», D-170 «Victor Rodriguez», D-202 «Narimy», y D-103
con un correo metido en el campo). **Los montos no se tocan**: siguen saliendo de la MV.

```sql
select count(*) n, count(upload_id) up, count(nullif(trim(contacto),'')) cont,
       count(nullif(trim(distrito),'')) dist, count(nullif(trim(corregimiento),'')) corr,
       count(nullif(trim(correo),'')) mail, count(nullif(trim(telefono),'')) tel,
       count(nullif(trim(celular),'')) cel
from switch_estadocuenta_aging;   -- → 211 | 0 | 0 | 0 | 0 | 180 | 153 | 186
```

### Lo que escribe

Las tres tablas de anotaciones tienen **una sola puerta**, `src/lib/cxc/anotaciones.ts`, y **la
cartera va en la llave** (`grupo` / `boston`): la misma estrella en dos carteras son dos filas.

| Tabla | Filas | Grano · llave | Quién escribe | Quién lee | Soft delete |
|---|---|---|---|---|---|
| `cxc_client_overrides` | **10** | `UNIQUE (cartera, nombre_normalized)` | 🔴 **ya nadie desde el CXC** — el formulario se mudó a `/clientes/[codigo]` el 24-ago-2026. Sí lo escribe `/api/overrides` desde **Cheques** | `useAdminData` (un override le gana al maestro) y `resolveDestinatario` del correo | no |
| `cxc_favorites` | **0** | `UNIQUE (cartera, user_id, nombre_normalized)` | 🔴 **nadie** — la ⭐ se retiró el 4-sep-2026 | 🔴 **nadie** | no — se borraba la fila |
| `cxc_contact_log` | **141** | solo PK | 🔴 **nadie** — las opciones «Ya contacté» se retiraron el 14-ago-2026 | 🔴 **nadie** | no |
| `cxc_emails_enviados` | **19** | solo PK | **TRES puertas desde el 5-sep-2026**: `POST /api/cxc/enviar-email` · `POST /api/cxc/cobrar-lote` (el envío a varios) · `POST /api/cxc/envios` (WhatsApp y «copiar»). Las tres *best effort*: si falla la fila, el correo sale igual | ✅ **`GET /api/cxc/envios`**, que `src/app/cxc/page.tsx:251` pide al abrir la pantalla | no |

Detalle medido de esas cuatro:
- `cxc_client_overrides`: las 10 son de cartera `grupo`. `celular` 10 · `telefono` 9 · `correo` 8 ·
  `contacto` 3 · **`resultado_contacto` 0 · `proximo_seguimiento` 0** (dos columnas que nadie llena).
- 🩸 **`cxc_favorites` está VACÍA y ya no tiene puerta.** La ⭐ existía en las dos carteras, en
  escritorio y en celular, con su ruta, su *optimistic update* y su rollback — y **nunca la usó
  nadie**. El 4-sep-2026 se retiró entera (Daniel: *«quita favoritos»*): se fueron la estrella, la
  regla de orden «favoritos arriba», la copia en `localStorage`, `leerFavoritos`/`alternarFavorito` y
  `/api/cxc/favorites`. **La tabla se queda** —patrón `mayor_lineas`— y `cxc-favoritos-retirados.test.ts`
  pone el build rojo si una migración la dropea o si la estrella vuelve.
- `cxc_contact_log`: 141 filas, **todas entre el 22-mar y el 16-abr-2026**, todas de rol `admin` y
  cartera `grupo`: whatsapp 117 · llamada 15 · email 9. La columna `note` está vacía en las 141.
- `cxc_emails_enviados`: 19 envíos, **todos con `resultado = "ok"`**. `Angela` 14 (los 14 el
  **14-jul-2026**) y `daniel` 5 (los 5 el **9-jul-2026**). Por empresa: `fashion_wear` 11 · las 5
  juntas 5 · `active_shoes` 2 · `vistana` 1.
  🔄 **La columna `canal` existe desde el 5-sep-2026** (migración `20260927120000`, aplicada) y el
  backfill dejó las 19 en `'correo'`. Los otros dos valores posibles —`whatsapp` y `copia`
  (`CANALES_ENVIO`, `src/lib/cxc/envios-registro.ts`)— **todavía tienen 0 filas**: se estrenaron hoy.
  Esa columna es lo que hace posible la marca gris de la fila, con **ventana de 7 días**
  (`VENTANA_MARCA_DIAS`) y dos frases distintas a propósito: «Le enviaste el estado de cuenta hace
  N días» para correo y WhatsApp, «Copiaste el mensaje hace N días» para el copiado —copiar no le
  llegó a nadie—.
  ```sql
  select coalesce(canal,'(null)') canal, resultado, enviado_por, count(*),
         min(created_at)::date, max(created_at)::date
  from cxc_emails_enviados group by 1,2,3 order by 4 desc;
  -- → correo|ok|Angela|14|2026-07-14|2026-07-14 · correo|ok|daniel|5|2026-07-09|2026-07-09
  ```
- `cxc_rows` (1.097, el CSV viejo): **sin lectores en la app**; solo la copia el backup y la mira
  `integrity-check`. Rango 11-feb-2021 → 29-may-2026, 6 `upload_id` distintos, 6 empresas.

## De dónde vienen los datos

| Cron (UTC) | Qué trae | Dónde cae |
|---|---|---|
| `switch-sync?tipo=estadocuenta` — **16:00 / 16:05 / 16:10** y **21:10 / 21:15 / 21:20** (tres pares de empresas × 2 rondas) | la cartera de las 6 del grupo | `switch_estadocuenta` |
| `switch-sync?tipo=all` — **05:30 / 05:35 / 05:40** (grupo) y **06:30** (`american_classic`, `confecciones_boston`) | incluye el estado de cuenta de la madrugada | `switch_estadocuenta` |
| `boston-cartera` — **08:10** | la cartera de Boston, que **no baja por el API** (su universo son 4.915 clientes y no cabe en la función): va por el reporte web `reportesmanager` con uuid | `switch_estadocuenta` (filas de Boston) → vista `_boston` |
| `sync-recibos` — **07:50 · 15:15 · 19:15 · 23:15** | los cobros | `switch_recibos` → «Último pago» y el bloque de últimos pagos |
| `sync-clientes-master` — **07:00** | el directorio | `clientes_master` → correo/teléfono/celular de la fila |
| `switch-reconciliacion` — **10:00 · 14:00 · 18:00** | reintenta lo que falló y refresca `switch_estadocuenta_aging_mv` | — |
| **«Actualizar ahora»** (admin/secretaria) | el estadocuenta de UNA empresa, al momento | mismo camino, con cooldown de 10 min |

Qué pasa si falla: la MV se queda con la foto vieja y **la pantalla lo dice** (la fecha de
`materializado_en`, en ámbar si pasa de 26 h). Si la MV no existe, la ruta cae a la vista viva y
`refreshedAt` viaja `null`. Si falla el refresco del contacto en vivo, se conserva el de la MV
(falla abierta). Si falla `/api/cxc/aging`, la pantalla muestra «Error al cargar datos. Intenta de
nuevo.» con botón Reintentar — o el dato viejo de la caché SWR si lo hay.

## Las reglas que ya están fijadas

| Regla | Candado |
|---|---|
| 🔴 Toda lectura de la tabla base `switch_estadocuenta` **acota por `empresa_key` en la misma cadena**, y todo objeto SQL que la lea está acotado o es solo-Boston. Barrido doble: sobre las migraciones y sobre `src/` | `src/__tests__/lib/cxc-boston-fuera-de-toda-superficie.test.ts` |
| 🔴 La MV **materializa la vista** (`SELECT v.* FROM …`), no copia su cuerpo — así se escapó el bug del 12-ago (vista 211 filas / MV 593, con 382 de Boston) | mismo archivo |
| 🔴 La palabra **«vencido» está prohibida** en todo lo que lee el cliente: `dias` es la EDAD del documento, no días de mora — no conocemos el plazo de crédito de cada factura | `src/__tests__/lib/cxc-papel-vocabulario.test.ts` |
| Las tres tablas de anotaciones se tocan **solo** desde `src/lib/cxc/anotaciones.ts`, y las 5 rutas **exigen la cartera** (no hay valor por defecto) | `src/__tests__/lib/cxc-anotaciones-cartera.test.ts` |
| Un recibo de **$0,00 no es un pago** (166 clientes lo mostraban, algunos con fechas de 2024) y «última compra» es la última **FACTURA** | `src/__tests__/lib/cxc-ultimo-pago-y-ultima-compra.test.ts` |
| Los últimos pagos se piden **`.limit(3)` POR EMPRESA en el servidor**, no trayendo todo y recortando; sin retenciones ni $0; un vendedor solo ve su empresa; Boston nunca entra | `src/__tests__/api/cxc-ultimos-pagos-route.test.ts` |
| 🔴 El **teléfono se lee en vivo de `clientes_master`; la plata sigue saliendo de la MV** | `src/__tests__/api/cxc-telefono-en-vivo.test.ts` |
| Tocar una píldora **filtra Y reordena** por ese tramo; el clic en el título de una columna es un override anclado al tramo, así que encabezado y píldora no pueden contradecirse | `src/__tests__/lib/cxc-orden.test.ts` |
| El mismo tramo se llama **igual** en escritorio, celular y papel (`tramoLabel`) | `src/__tests__/components/cxc-tramos-un-solo-nombre.test.tsx` |
| 🔄 **El menú «···» y el de clic derecho NO VUELVEN** (el candado cambió de dirección el 5-sep-2026: antes exigía que los dos menús tuvieran las mismas 4 opciones; hoy exige que no existan) | `src/__tests__/components/cxc-pestanas-y-menu.test.tsx` |
| Los últimos pagos viven en **un solo lugar** y se piden recién al tocar | `src/__tests__/components/cxc-ultimos-pagos-bloque.test.tsx`, `…-boton-fila.test.tsx` |
| «Última compra» se pinta en **las dos** pantallas (tabla y tarjeta) | `src/__tests__/components/cxc-ultima-compra-pantalla.test.tsx` |
| Un botón, y el error se **ve** en el drawer de estado de cuenta | `src/__tests__/components/cxc-estado-cuenta-un-boton.test.tsx` |
| La tolerancia a «la DDL todavía no corrió» se retiró: un `PGRST205`/`42P01`/`42703` **falla visible** (500), nunca vacío | `src/__tests__/lib/tolerancia-ddl-retirada-cxc-mf-ventas.test.ts` |
| El código muerto podado no vuelve (incluye que ya no se pidan `/api/vendors` ni `/api/upload`) | `src/__tests__/components/cxc-codigo-muerto-podado.test.tsx` |
| Ningún monto se escribe a mano en la pestaña de Boston | `src/__tests__/lib/cxc-montos-escritos-a-mano.test.ts` |
| La pestaña de Boston **dice de cuándo es su plata** | `src/__tests__/components/cxc-boston-fecha-del-dato.test.tsx` |

**Y los diez candados que nacieron con el rediseño del 5-sep-2026** (verificado el 5-sep-2026: los
diez archivos existen):

| Regla | Candado |
|---|---|
| «Cobrar» es **UNA hoja con cuatro salidas** y las seis puertas viejas no vuelven; el envío manda **siempre las 6 empresas** (`empresasDelEnvio()` = `[...CXC_GRUPO_EMPRESA_KEYS]`) sin importar el filtro | `src/__tests__/lib/cxc-cobrar-una-hoja.test.ts` |
| **Un correo por DIRECCIÓN**, no por cliente; el que no tiene correo no aborta el lote | `src/__tests__/lib/cxc-correos-por-direccion.test.ts` |
| La tira de totales va **en la misma grilla de 12 columnas que la tabla**, cada total sobre su columna | `src/__tests__/components/cxc-tira-totales.test.tsx` |
| El aviso **«N sin pagar hace +90 d»** filtra, es toggle y trata «nunca pagó» como que avisa | `src/__tests__/lib/cxc-sin-pagar.test.ts` |
| El rastro de envío cubre los **tres canales** y los **últimos pagos van POR FECHA**, no por empresa | `src/__tests__/lib/cxc-envios-y-pagos-por-fecha.test.ts` |
| El estado de cuenta lleva **encabezados de columna** y lo chico se agrupa **por MONTO (< $50)**, nunca por tipo de documento | `src/__tests__/lib/cxc-estado-cuenta-legible.test.ts` |
| El **`contacto` de la ficha del cliente** llega a la fila del CXC en vivo | `src/__tests__/lib/cxc-contacto-del-cliente.test.ts` |
| Boston usa el **mismo formato** que el grupo sin mezclar una sola cifra | `src/__tests__/lib/cxc-boston-mismo-formato.test.ts` |
| Quién puede abrir la pestaña de Boston | `src/__tests__/lib/cxc-boston-permiso.test.ts` |
| La ruta es `/cxc`, `/admin` redirige, y la pantalla de error **no publica el stack trace** | `src/__tests__/lib/cxc-ruta-y-error.test.ts` |

⚠️ El encabezado de `src/app/cxc/components/HojaCobrar.tsx:20` cita un candado
**`cxc-cobrar-manda-las-seis.test.ts` que no existe**. La regla SÍ está cerrada, pero en
`cxc-cobrar-una-hoja.test.ts` (comprueba literalmente `return [...CXC_GRUPO_EMPRESA_KEYS]`).

Y una que no es del CXC pero lo sostiene: **`db-max-rows` = 1000 corta en silencio**, así que la
relectura de contacto va en lotes de 300 códigos con `leerTodoPaginado`, que verifica contra un
`count` exacto (`src/__tests__/lib/supabase-paginado.test.ts`).

## Con qué conecta

**Qué lee de otros módulos:**
- **Clientes**: `clientes_master` para el contacto en vivo y para resolver el destinatario del correo;
  y la fila enlaza a `/clientes/<código>` («Ver ficha completa ›»).
- **Ventas / Switch**: `switch_recibos` (últimos pagos), `switch_facturas` vía
  `switch_ultima_compra_cliente_v1` (última compra), `switch_clientes` (correo del cliente).
- **Confecciones Boston**: la pestaña monta el **MISMO** `<BostonTab />` que `/boston`, contra el
  MISMO `/api/cxc/boston`. No hay una segunda definición de «la cartera de Boston».
- **Usuarios**: `fg_users.associated_company` (el recorte del vendedor) y `fg_users.email` /
  `nombre_completo` (la firma y el `cc` del correo).

**Quién lee lo suyo:**
- **Vista General** — la tarjeta «Por cobrar (CXC)» y la lista «Clientes con saldo +90 días» leen la
  **vista viva** `switch_estadocuenta_aging`, a propósito, para cuadrar al centavo con esta pantalla.
- **Ventas › Clientes** — el chip de CXC del `ClienteHoverCard` entra por
  `/api/cxc/aging-por-cliente/[codigo]`.
- **La ficha del cliente** (`/clientes/[codigo]`) lee `switch_estadocuenta_aging` para su columna
  «Por cobrar hoy» y para el chip «Vencido crítico/reciente».
- **La búsqueda global** (`/api/search`) busca clientes en `switch_estadocuenta_aging` por
  `company_key`.
- **Los badges** (`/api/notification-badges`) cuentan empresas cuyo `switch_estadocuenta` lleva más de
  7 días sin sincronizar (`cxcStale`).
- **`/api/cxc-summary` y `/api/clients`** siguen vivas leyendo la misma vista, **sin ningún consumidor**.
- **Cheques** escribe en `cxc_client_overrides` por `/api/overrides`.

**Qué se rompería:**
- Cambiar los nombres de bucket (`d0_30 … mas_365`) o la columna `company_key` de
  `switch_estadocuenta_aging` rompe a la vez: `/api/cxc/aging`, `/api/cxc/aging-por-cliente`,
  `/api/cxc-summary`, `/api/clients`, `/api/search`, `/api/dashboard/vista-general`,
  `/api/clientes/[codigo]` y `src/lib/cxc-aging.ts`.
- Cambiar el signo de `switch_estadocuenta.saldo` (o el mapa de `tipo_comprobante` a signo) mueve la
  vista de aging **y** `src/lib/cxc/estado-cuenta-data.ts` — el drawer, el PDF y el correo. Los dos
  usan el MISMO mapa a propósito, para cuadrar al centavo.
- Quitar la columna `cartera` de las tres tablas de anotaciones volvería a mezclar las estrellas y
  las notas de las dos carteras.
- Renombrar `nombre_normalized` rompe la consolidación del panel: el CXC agrupa por **nombre**, no
  por código (el código sí es la identidad en Clientes y en Ventas).

## Por qué está así

- 🔴 **«debe de ser cxc de fashion group y otro aparte de boston, no deben de ni convivir juntos»**
  (12-ago-2026) → las dos pestañas, las dos vistas disjuntas, y la columna `cartera` en las tres
  tablas de anotaciones (`src/lib/cxc/cartera.ts`).
- **«es la misma persona, pero no lo quiero ver en fashion group porque no tiene el mismo código»**
  (sobre `CITY MALL PASO CANOA`, que existe en las dos carteras) → entre «compartido» y «separado»
  eligió **SEPARADO**: cada cartera con sus propias notas y estrellas.
- **«si crea el usuario david, david debe de ver cxc boston… él es mi hermano y ve toda la operación
  de confecciones boston, no quiero que vea info de fashion group»** (27-ago-2026) → `gerente_boston`
  entró a `ROLES_BOSTON`, y `/cxc` lo rebota porque su único módulo es `boston`.
- 🔴 **«sobre darle seguimiento no es algo que quiero para ese módulo, llamo al cliente por fuera y
  ya»** (14-ago-2026) → **el seguimiento de cobro NO va a existir aquí**, y no se reemplaza por otra
  cosa. Por eso el menú «···» tiene cuatro opciones y no siete.
- **«los card de cxc por buckets al tocarlo debe de acomodar las cxc en orden de la deuda del bucket
  no?»** (27-jul-2026) → tocar una píldora **filtra Y ordena** en una sola acción; antes filtraba sin
  reordenar, así que el que más debía en ese tramo podía no estar arriba (`src/lib/cxc-orden.ts`).
- **«no parecen tocables»** → las píldoras encendidas ganaron fondo tenue además del borde de 2 px.
- 🔴 **«no debería de ser así, el sistema debe de mostrar la info tal cual»** (sobre el guard de
  montos, que hasta entonces descartaba en silencio) → nació la línea ámbar
  `AvisoRechazosSwitch`: **el total real + decir qué se dejó afuera**. Se descartó explícitamente
  mostrar el dato crudo: la cartera de Boston pasaría a $266.739.648,55 y dejaría de servir para
  cobrar (`src/lib/rechazos-de-switch.ts`).
- **«no me interesa saber qué factura pagó, solo ver sus últimos 3 pagos y fecha»** (3-sep-2026) →
  el bloque «Últimos pagos», tres por empresa, sin desglose por documento.
- **«lo quiero ahí mismo pero con un botón para expandir, no solo al expandir el card, tendría que
  hacer dos expandir para verlo»** (4-sep-2026) → ese bloque salió del panel expandido y pasó a un
  botón **«Últimos pagos ›» en la fila cerrada**: un clic, no dos.
- **«cxc sí se muestra con ITBMS, porque es lo que tengo que cobrar»** → el saldo del CXC va con
  impuesto; la venta de Ventas va sin él. La explicación vive en el ⓘ de la ficha del cliente.
- El **PDF del cliente dice «Total», no «TOTAL ADEUDADO»** (12-ago-2026): es el mismo número que el
  cliente ve rotulado «Total» en el correo y que Daniel ve rotulado «Total» en el drawer desde donde
  se manda. El papel era la única de las tres superficies que le decía otra cosa, y a los gritos.

- 🔴 **«si un cliente está en el grupo de 6 empresas y mismo cliente en conf boston, quiero q no se
  toque»** (27-jul-2026) → dos vistas de aging **disjuntas** y `/api/cxc/boston` como **ruta
  separada**, no un `?empresa=` de la del grupo. *«Si le debe $10.000 al grupo y $4.000 a Boston, en
  ningún lado puede salir $14.000.»*
- **«pero cxc sí se muestra con ITBMS, porque es lo que tengo que cobrar»** (27-jul-2026) → saldos,
  aging y estado de cuenta van **con** ITBMS mientras Ventas va **sin**: son dos preguntas distintas
  —cuánto me compró y cuánto me tiene que pagar— y cada una se responde con la cifra que le toca.
- **«así como está último pago x días, también quiero ver última compra (que sería la factura)»**
  (13-ago-2026) → nació la columna «Última compra», sobre una **vista agregada**
  (`switch_ultima_compra_cliente_v1`) y no sobre `switch_facturas` directo: eso habrían sido ~200
  consultas por apertura contra una base en compute Micro.
- **«Lo pidió Daniel: tres»** → `PAGOS_POR_EMPRESA = 3`. No es un número técnico.
- **El menú «···» en las tarjetas del celular** es pedido de Daniel del **4-jul-2026**: antes se
  excluía a propósito. Hoy la tarjeta móvil tiene las MISMAS acciones que la tabla de escritorio.
- **Sin título grande** (pedido de Daniel): encabezado compacto, pestañas en la misma línea que
  «Exportar», el `<h1>` queda `sr-only`.
- **El nombre del archivo CSV se conserva** aunque el título de la pantalla pasó a «Cuentas por
  Cobrar»: *«Daniel ya tiene esos CSV archivados con ese prefijo.»*
- 🩸 **Un bug que Daniel cazó y que se volvió regla:** `D-25` de Fashion Wear decía «Último pago
  **$0.00** hace 15 días» cuando su pago real era de **$187.651,51 del 22-jul**. Un recibo de $0 es
  una aplicación o un cruce, no un pago → hoy se filtra `total <> 0` y `es_retencion = false`.
- **«Los DDL los corre Daniel A MANO»** es una regla operativa que condiciona el diseño: cada lectura
  y cada escritura tenía que degradar limpio ANTES de que la migración corriera.

## Lo que se intentó y se retiró

- 🔴 **El seguimiento de cobro** — `handleQuickMarkContacted` y las opciones **«Ya contacté ·
  Llamada»** y **«Ya contacté · Visita»** del menú «···». Escribían en `cxc_contact_log` y **lo
  escrito no se pintaba en NINGUNA parte**: `contactLog` llegaba como prop a la tabla y a la tarjeta
  del celular y ninguna de las dos lo desestructuraba. Medido: 141 filas, todas entre el 22-mar y el
  16-abr-2026, cero en los últimos 90 días. Retirado el **14-ago-2026**. **La tabla y sus filas
  quedan** (son historia y no molestan); lo que se retiró es el camino que las escribía sin que nadie
  las leyera. Con ellas se fue también la petición `/api/cxc/contact-log` de cada apertura del panel.
- **El formulario de contacto dentro del panel expandido** (`ContactPanel`) y su `handleSaveEdit` —
  retirados el **24-ago-2026**. La edición se mudó a la ficha del cliente (`/clientes/[codigo]`) y el
  guardado del CXC quedó siendo **un camino de escritura sin ninguna puerta que lo abriera**. El prop
  `onSaveEdit` siguió viajando «por compatibilidad» hasta que se podó. ⚠️ La tabla
  `cxc_client_overrides` **no se toca** y se sigue leyendo: un override guardado antes le sigue
  ganando al maestro.
- **La opción «Ver en directorio»** del menú «···» y del clic derecho — retirada el 14-ago-2026 junto
  con su ícono y su `window.open`. El `?search=` de `/clientes` sigue funcionando para un enlace
  pegado a mano, pero ya no lo alimenta ninguna pantalla.
- 🩸 **Una vista de tarjetas en `ClientRow` que NUNCA se dibujó** — estaba detrás de `sm:hidden`
  (< 640 px) y su único padre vive detrás de `hidden md:block` (≥ 768 px): los dos tramos no se cruzan
  nunca. Retirada el 24-ago-2026 con sus píldoras de estado y su grilla de tramos. La vista de
  celular de verdad es `PanelCxcMobile`.
- 🩸 **Un SEGUNDO juego de filtros completo dentro de `ClientTable`** — un segundo buscador, un botón
  «Filtros», un `BottomSheet` de filtros y una tira de píldoras de tramo, todo detrás de
  `!hideSearchAndRiskFilters`… y el único que monta esa tabla le pasaba `hideSearchAndRiskFilters`
  **siempre**. Código que no se dibujaba en ninguna pantalla, en ningún ancho, para ningún rol.
  Retirado el 24-ago-2026. «El riesgo real no es el peso: es que alguien arregle el buscador
  EQUIVOCADO y jure que la pantalla no cambia.»
- **`/api/vendors` y `/api/upload`** — se pedían en **cada** apertura del CXC (2 de 6 peticiones). La
  primera llenaba el objeto global `VENDOR_MAP`, que ninguna pantalla lee; la segunda armaba
  `uploads`, que llegaba a `admin/page.tsx`, se desestructuraba y **no se usaba en una sola línea**.
  Retiradas el 24-ago-2026. Las rutas siguen vivas.
- **El bloque «Últimos pagos» dentro del panel expandido** — vivió **un día** (3 → 4-sep-2026). Con
  los dos abiertos se veían los mismos tres pagos dos veces.
- **El botón «Importar archivo de cartera»** del estado vacío — oculto: el upload manual de CSV está
  deprecado desde que el sync de Switch cubre la carga. La página `/upload` **ya no existe**, pero
  `POST /api/upload` sí.
- **La leyenda de aging** (`AgingLegend`) — eliminada en jul-2026 de CXC y de Proveedores; el
  vocabulario vive en `src/lib/cxc-aging.ts`.
- **Dos vocabularios para el mismo botón** — el escritorio decía solo el rango («0-90d») y el celular
  solo el nombre («Por vencer»), con la lista **copiada** en su propio `AGING_THEME`. Se unificó en
  `tramoLabel()`: nombre y rango juntos, en las tres superficies.
- **Dos botones en el drawer de estado de cuenta** («Compartir» y «PDF») que en la computadora hacían
  **lo mismo** — y si el archivo fallaba, el `catch` solo escribía en consola. Retirados el
  24-ago-2026 por **un** botón rotulado con lo que de verdad va a hacer.
- **`mailto:`** — reemplazado por el envío real desde el sistema con Resend y el estado de cuenta
  adjunto. Por eso el modal ya no exige que el cliente tenga correo: lo resuelve y deja escribirlo.
- **La tolerancia «la columna `cartera` todavía no existe»** — retirada el 3-sep-2026. Escribir sin
  la columna metería la anotación de Boston en el namespace compartido, o sea aparecería en el grupo:
  exactamente lo que Daniel prohibió. Se prefiere no guardar y decirlo.

- 🔴 **`CompanySummary.tsx` — BORRADO (24-ago-2026).** Una vista entera de deuda por empresa con
  **cero importadores**. Duplicaba lo que ya dan el filtro de empresa y las tarjetas, y «encender una
  superficie nueva de cartera es justo donde este repo se quemó con Boston». Se **borró**, no se
  encendió.
- 🔴 **Las lecturas anon del navegador a `cxc_client_overrides`, `cxc_contact_log` y el último pago —
  MOVIDAS a rutas de servidor con `service_role`.** Era una **fuga**: la clave anónima podía leer el
  contacto de TODOS los clientes por REST.
- **La lista de roles de Boston escrita dentro de `app/api/cxc/boston/route.ts` — movida a fuente
  única** (14-ago-2026). La UI no la miraba: los 3 vendedores activos veían la pestaña y **siempre**
  recibían el 403.
- **Las vistas `cxc_aging` y `switch_ultimo_pago_cliente` (v1) — BORRADAS** el 26-jul-2026 (migración
  `20260726210100`); las sucedieron `switch_estadocuenta_aging_mv` y la `_v2`.
- **«Enviar email» → «Enviar correo»** (14-ago-2026): la app se lee en español simple y el resto del
  módulo ya decía «correo». Los dos menús de la fila dicen hoy la MISMA palabra.
- **El `hidden` del ítem de correo cuando el cliente no tenía email — retirado.** Era herencia del
  viejo `mailto:` y dejaba el clic derecho **sin menú** en esas filas, mientras el «···» de la misma
  fila sí ofrecía la acción.
- **El chevron de la tarjeta móvil — eliminado**: toda la fila abre y cierra la tarjeta, así que la
  flecha era adorno y costaba 22 px del ancho del nombre.
- **El `select("*")` de `/api/cxc/ultimo-pago`** — arrastraba `cliente_switch_id` sin uso; hoy pide 4
  columnas.
- **La tolerancia «la vista de última compra no existe» (respondía `[]`) — retirada** el 3-sep-2026:
  leer un error como «nunca compró» es la mentira callada que este módulo ya pagó dos veces.
- ✅ **Mover `/admin` a `/cxc`** estaba en `docs/sprint2-backlog.md` sin ejecutar: **se hizo el
  5-sep-2026**. ⚠️ El redirect quedó **temporal (307), no permanente**, contra lo que decía el
  backlog: es el patrón de todos los redirects de `next.config.js` y la razón está escrita ahí — un
  308 se queda pegado en el caché del navegador de cada persona y no hay forma de sacarlo si un día
  hay que revertirlo.

## Cuánto se usa

⚠️ **No hay forma de contar aperturas de pantalla.** Barridas las 137 tablas de `public`: no existe
ninguna de páginas vistas, clics ni peticiones, y `package.json` no trae Vercel Analytics. Lo único
que capta rutas es **Sentry con `tracesSampleRate: 0.1`** (`sentry.client.config.ts`), y ese dato vive
fuera de Supabase. `activity_logs` solo se escribe en 53 puntos del código, todos de escritura.

Lo que **sí** se pudo medir (4-sep-2026):

**Quién puede entrar.** `role_permissions` da `cxc` a `admin` y `vendedor`; `admin` además pasa por
`getVisibleModules` sin mirar la tabla. En `fg_users`: 2 admin (**daniel**, **alberto**), 3 vendedores
(**rey**, **edwin**, **rodrigo**) y **Angela** por `modulos_override`. Son **6 personas**;
**andrea** (la otra secretaria) NO lo tiene.

**Quién entra de verdad.** Sesiones abiertas en los últimos 30 días (re-medido el 5-sep-2026):
daniel **110** · Angela **48** · rey **32** · edwin **8** · alberto **1**. 🔴 **`rodrigo` (vendedor,
dado de alta el 4-jul-2026) nunca ha entrado**: no aparece ni una vez en `user_sessions`.

**Lo que el módulo escribió, por tabla:**

| Tabla | Filas | Última escritura | Quién |
|---|---|---|---|
| `cxc_emails_enviados` | 19 | **14-jul-2026** (52 días atrás) | Angela 14 · daniel 5, todos con `resultado = "ok"` |
| `cxc_contact_log` | 141 | **16-abr-2026** | `created_by = "admin"` en las 141 (es el default de la columna, no distingue persona) |
| `cxc_client_overrides` | 10 | **22-mar-2026**, las 10 el mismo día | sin columna de autor |
| `cxc_favorites` | 🔴 **0** | nunca (y desde el 4-sep-2026 tampoco tiene quién) | — |
| `activity_logs` con `action = "cxc_upload"` | **38** = 27 con `entity_type='cxc'` + 11 con `entity_type='upload'` | **1-jun-2026** | ⚠️ **no se puede saber quién.** `activity_logs` **no tiene columna de usuario**, solo `user_role`: 32 de rol `secretaria` y 6 de `admin`. Son de la carga manual de CSV **ya retirada** |

O sea: **desde el 14 de julio de 2026 el módulo no había escrito ni una fila**, hasta el rediseño de
hoy —que estrena dos escritores nuevos en `cxc_emails_enviados` (el lote y los canales WhatsApp/copia)
y todavía tienen 0 filas—. Eso no dice que no se use: es una pantalla de lectura y de cobro por fuera
del sistema (Daniel, 14-ago-2026: *«llamo al cliente por fuera y ya»*).

Detalle de `cxc_client_overrides` (las 10, no vacías): `celular` 10 · `telefono` 9 · `correo` 8 ·
`contacto` 3 · **`resultado_contacto` 0 · `proximo_seguimiento` 0** — verificado exacto el 5-sep-2026.
⚠️ Contar con `count(columna)` da 10 en las seis: hay que usar `count(nullif(trim(col),''))`, porque
lo que guardó el formulario viejo no fue `NULL` sino cadena vacía.

**Que el dato le llegue sí es medible.** Re-medido el 5-sep-2026 16:30 UTC, en 30 días:
`estadocuenta` **582 corridas (19,4/día) con 7 errores (1,2 %)**, todos del reporte web de Boston
entre el 20 y el 25 de agosto (`cartera-fetch: respuesta no-JSON en la ronda 1 (status 200)`) más un
`<!DOCTYPE html>` de vistana el 12-ago. La MV se refrescó por última vez a las **16:12:26 UTC de
hoy**. `american_classic` lleva ~100 días sin corrida de estadocuenta **y eso es correcto**: tiene
0 filas en la tabla porque es retail sin cartera.

## Qué papeles y Excel produce

Es el módulo que más papel manda **afuera** del grupo: su PDF y su correo los lee el cliente.

| Salida | Desde | Nombre del archivo | Contenido | Quién lo recibe |
|---|---|---|---|---|
| **CSV** | «Exportar → CSV (Excel)» | `CXC[_<filtro>]_<YYYY-MM-DD>.csv` | Fila de metadatos («Cuentas por Cobrar · Fashion Group — fecha — empresa — tramo — N registros») y luego `Cliente · 0-30d · 31-60d · 61-90d · 91-120d · 121d+ · Total · Estado · Correo · Telefono · Celular · Contacto`. **Estado** = «Vencido crítico» / «Vencido reciente» / «Por vencer» | Daniel, Angela |
| **PDF Resumen** | «Exportar → PDF Resumen» | `CXC_Resumen_<YYYY-MM-DD>.pdf` | Logo Fashion Group, subtítulo con el filtro y «N clientes», cajas KPI y tabla `Cliente · Por vencer 0-90d · Vencido reciente 91-120d · Vencido crítico 121d+ · Total` | uso interno |
| **PDF Detallado** | «Exportar → PDF Detallado» | `CXC_Detallado_<YYYY-MM-DD>.pdf` | Tabla `Cliente / Empresa · 0-30 · 31-60 · 61-90 · 91-120 · 121-180 · 181-270 · 271-365 · +365 · Total` | uso interno |
| **PDF Estado de cuenta** | 🔄 fila **«Ver o bajar el PDF»** de la hoja «Cobrar» (era el botón «Compartir»/«Descargar PDF» del drawer, retirado el 5-sep-2026) | `Estado-cuenta-<CÓDIGO>-<YYYY-MM-DD>.pdf` | Encabezado con nombre, código y (si es una sola) la empresa; por empresa una tabla `Documento · Tipo · Fecha · Días · Monto · Saldo` con su **Subtotal**; al pie la barra oscura con **«Total»** | 🔴 **el cliente** |
| **Correo del estado de cuenta** | 🔄 fila **«Correo»** de la hoja «Cobrar» — **un clic, con «Deshacer» de 5 s**; o «Escribirlo yo», que abre el modal editable de siempre | — (no baja archivo) | asunto y cuerpo editables; adjunta **un PDF POR EMPRESA** con el nombre `Estado de cuenta — <Empresa> — <Cliente> — <Mes>.pdf` | 🔴 **el cliente**, con **copia (cc) al usuario que lo manda** y `reply_to` a su correo. Sale desde `cobros@fashiongr.com` por Resend |
| **Correo a VARIOS** (nuevo, 5-sep-2026) | «Cobrar a los N» de la barra de selección → `POST /api/cxc/cobrar-lote` | — | **un correo por DIRECCIÓN** con **UN PDF** que trae una hoja por cliente y el total al final | 🔴 **el cliente**. Medido: 100 clientes → **57 correos** |
| **Mensaje de WhatsApp / «Copiar mensaje»** | 🔄 filas **«WhatsApp»** y **«Copiar el mensaje»** de la hoja «Cobrar» (era el menú «···», retirado) | — (no baja archivo) | texto plano con el saldo por empresa y los tres tramos rotulados **«Hasta 90 días» · «De 91 a 120 días» · «Más de 120 días»** | 🔴 **el cliente** |

🔴 **En todo lo que ve el cliente está PROHIBIDA la palabra «vencido»** (candado
`src/__tests__/lib/cxc-papel-vocabulario.test.ts`): `dias` es la **edad** del documento desde su
emisión, no días de mora — no conocemos el plazo de crédito de cada factura. Por eso el WhatsApp
rotula por antigüedad. En el papel interno (PDF Resumen) sí se usa el vocabulario de tramos.
Y en el PDF del cliente la barra final dice **«Total»**, no «TOTAL ADEUDADO»: es el mismo número y
el mismo rótulo que el cliente ve en el correo y que Daniel ve en el drawer.

## Cómo probarlo a mano

**1. Que la cartera está fresca.** Abre `/cxc`. Arriba dice «Sincronizado \<fecha y hora\>». Si eso
tiene más de 26 h, se pone en ámbar con el detalle por empresa. La prueba en la base es
`select max(materializado_en) from switch_estadocuenta_aging_mv`.

**2. Que «Actualizar ahora» funciona.** Elige **una** empresa en el filtro (con «Todas» el botón
queda apagado y dice por qué) y toca «Actualizar ahora». Al terminar, la hora de «Sincronizado» tiene
que ser de hace un momento. En la base: una fila nueva en `switch_sync_log` con
`sync_type='estadocuenta'`, esa empresa y `status='success'`.

**3. Que el estado de cuenta cuadra.** Abre una fila → «Ver los documentos». La suma de los saldos de
los documentos tiene que dar exactamente el **Total** del pie, y ese Total tiene que ser el mismo
número de la columna «Total» de la fila. Si no cuadra, el sospechoso es el mapa de signo de
`src/lib/cxc/estado-cuenta-data.ts` (`Nota de Crédito`, `Recibo` y `Recibo Saldo Anterior` restan;
un tipo que no esté en ninguna de las dos listas vale **0**, no infla).

**4. Que el correo sale de verdad.** Abre la fila → **«Cobrar»** → **«Correo»**. Revisa el
destinatario, manda (tienes **5 segundos para deshacer**; el envío real ocurre al vencer el plazo).
Tiene que aparecer el aviso «Correo enviado» y **te tiene que llegar la copia a ti** (el sistema te
pone en `cc`). En la base: una fila nueva en `cxc_emails_enviados` con tu nombre en `enviado_por` y
`resultado = 'ok'`. Si dice «Correo enviado (no se pudo registrar en la bitácora)», el correo salió
igual y lo que falló fue la fila.

**5. Que el teléfono editado se ve al toque.** Entra a `/clientes/<código>` → «Editar contacto» →
cambia el teléfono → Guardar. Vuelve a `/cxc` y abre esa fila: el teléfono nuevo tiene que estar
ahí **sin esperar al cron**. Ese es el único dato de la pantalla que se lee en vivo; la plata sigue
saliendo de la foto de la MV.

**6. Que Boston no se mezcla.** Suma la columna «Total» de la pestaña del grupo y compárala con
`select round(sum(total),2) from switch_estadocuenta_aging` (al 5-sep-2026: **$3.676.935,55**, en
**211 filas = 100 clientes**). Ese número **no** incluye Boston, que tiene su propia pestaña y sus
**$195.509,25** en 390 clientes. 🔴 Si la pantalla del grupo dijera «211 clientes», está contando
filas: la misma City Mall aparece una vez por empresa donde debe.

## Qué lo rompe

| Qué falla | Cómo se nota | Qué pasa con el dato |
|---|---|---|
| **Switch cambia el motor de reportes web** (le pasó el 19-ago-2026) | la cartera de Boston se congela; el reporte devuelve **HTTP 200 con la página de excepción**, no un error | 6 corridas fallidas medidas entre el 20 y el 25-ago-2026 (`cartera-fetch: respuesta no-JSON en la ronda 1 (status 200)`). El sync ahora reconoce esa página; si el reporte viene corto (< 70 % de los clientes guardados, `PISO_CLIENTES_REPORTE`) **no se escribe ni se reconcilia** |
| **`boston-cartera` no corre** | 🔴 nada visible en la pestaña salvo la fecha del dato — **por eso se agregó** | La reconciliación **no** lo recupera: espera a mañana. Lo vigila la regla 1 de alertas (dato de más de 24 h) desde el 24-ago-2026 |
| **El sync de estadocuenta se invierte (reconcile antes que upsert)** | todos los saldos en 0 | El reconcile pone `saldo = 0` a todo lo que no se reescribió. Candado: `src/__tests__/lib/boston-cartera-web.test.ts` |
| **Alguien lee `switch_estadocuenta` sin acotar `empresa_key`** | los $313.002,79 de Boston se suman al grupo | Lo impide un barrido estático doble (SQL y TypeScript): `cxc-boston-fuera-de-toda-superficie.test.ts` |
| **La MV no se refresca** | la fecha de «Sincronizado» se queda quieta y se pone ámbar a las 26 h | Se refresca al final de cada `switch-sync`, en `refresh-clientes-views` (07:35 UTC) y en «Actualizar ahora». Si la MV no existe, la ruta cae a la vista viva y `refreshedAt` viaja `null` |
| **`db-max-rows` = 1000** | 🔴 **nada**: corta en silencio | La relectura de contacto va en lotes de 300 con `leerTodoPaginado`, que revienta si lo leído no cuadra con un `count` exacto |
| **Un monto imposible de Switch** | la línea ámbar arriba de la tabla lo dice con el número de documento | El guard rechaza la fila; el upsert conserva el último valor bueno. Nunca se escribe un 0 |
| **`RESEND_API_KEY` no configurada** | «RESEND_API_KEY no configurada» al mandar el correo | Nada se envía |
| **La migración de la columna `cartera` no corriera** | las estrellas y las notas volverían a compartirse entre las dos carteras | Hoy la tolerancia está **retirada**: un `42703`/`PGRST204` falla visible (503 con «todavía no están habilitadas»), no escribe en el namespace compartido |

## Lo que sobra o no cuadra

**Cosas que existen y nadie usa**
- ✅ **CERRADO el 4-sep-2026 — la ⭐ de favoritos se fue.** Era el caso más claro: `cxc_favorites` con
  **0 filas en toda su historia**, botón en las dos carteras, en escritorio y en celular, con su ruta,
  su *optimistic update*, su rollback, su copia en `localStorage` y su regla de orden («favoritos
  arriba»); y encima su ruta exigía `rolesBoston()`, así que un **vendedor** —que sí ve el CXC—
  recibía **403** al tocarla. Daniel: *«quita favoritos»*. La tabla se conservó, sin lectores.
- 🔴 **`cxc_contact_log`: 141 filas, ninguna después del 16-abr-2026, y hoy no la escribe ni la lee
  nadie.** Las opciones «Ya contacté · Llamada/Visita» se retiraron el 14-ago-2026 (Daniel: *«sobre
  darle seguimiento no es algo que quiero para ese módulo, llamo al cliente por fuera y ya»*), pero
  `GET`/`POST /api/cxc/contact-log` siguen vivas y accesibles por URL.
- **`cxc_client_overrides` no la escribe el CXC desde el 24-ago-2026** (la edición se mudó a la ficha
  del cliente): solo la **lee**. Quien la escribe hoy es **Cheques**, por `/api/overrides`.
  Sus columnas `resultado_contacto` y `proximo_seguimiento` están vacías en las 10 filas.
- ✅ **CERRADO el 5-sep-2026: `cxc_emails_enviados` YA la lee una pantalla.** Era una bitácora de
  solo escritura; hoy `GET /api/cxc/envios` la consulta al abrir `/cxc` (`page.tsx:251`) y de ahí
  sale la marca gris de la fila («Le enviaste el estado de cuenta hace 3 días»). Con la columna
  `canal` (migración `20260927120000`) también registra **WhatsApp y «copiar el mensaje»**, que hasta
  hoy no dejaban rastro — y son, según Daniel, como se cobra de verdad.
- **`cxc_rows`** (1.097 filas del CSV viejo): sin lectores en la app.
- **`src/lib/cxc-fecha.ts`** (parseo de fechas de los uploads) **no lo importa ningún archivo de
  producción**: su único consumidor es su propio test. Murió con el upload de CSV.

**Rutas vivas sin consumidor**, verificado con `grep` sobre `src/` el 5-sep-2026 (todas responden
200 a quien las escriba a mano): `GET /api/clients` (admin+secretaria) · `GET /api/cxc-summary`
(admin) · `GET`/`POST /api/cxc/contact-log` · `GET /api/vendors` · `POST /api/upload`. Las dos
primeras leen la MISMA vista de aging que la pantalla, así que **cualquier cambio de forma en
`switch_estadocuenta_aging` también las rompe**, sin que nadie se entere.
✅ **`GET /api/cxc-rows` ya no está en la lista: se BORRÓ el 5-sep-2026** (`src/app/api/cxc-rows/`
no existe). La tabla `cxc_rows` sigue con sus 1.097 filas y sin lectores.

**Columnas que nadie llena** (0 de 211 en la vista de aging, re-medido el 5-sep-2026): `upload_id`
(es un `NULL::uuid` literal, herencia del upload), `contacto`, `distrito` y `corregimiento`.
🔄 **`contacto` dejó de salir vacío en la pantalla**: desde hoy `/api/cxc/aging` lo relee de
`clientes_master.contacto` (6 clientes lo tienen), además del override (3 de 10). Lo que sigue vacío
es la COLUMNA de la vista, que devuelve `''::text` hardcodeado.

**Incoherencias de permisos**
- `secretaria` **no tiene `cxc` en `role_permissions`**, pero la pantalla y `/api/cxc/aging` sí la
  dejan pasar. Hoy solo **Angela** ve la ficha, y por `modulos_override`, no por rol.
- 🔴 **`["admin","secretaria","vendedor"]` está escrito a mano NUEVE veces**, una por ruta, cada una
  con su propia constante `CXC_ROLES` local (medido el 5-sep-2026): `overrides` · `contact-log` ·
  `enviar-email` · `cobrar-lote` · `envios` · `ultimos-pagos` · `ultima-compra` · `ultimo-pago` ·
  `estado-cuenta/[codigo]`. Hoy las nueve dicen lo mismo, pero **no hay nada que las obligue** — y es
  exactamente el modo de fallo que dejó el `POST` de Referencia en solo-admin durante tres semanas
  (tres copias a mano de la misma lista). `aging-por-cliente` usa otra lista a propósito
  (`["admin","contabilidad","secretaria","vendedor"]`, con contabilidad, para el hover de Ventas), y
  `/api/cxc/aging` no usa constante: compara los roles inline. La única lista con fuente única es la
  de Boston (`ROLES_BOSTON`, `src/lib/cxc/boston-roles.ts` = `["admin","secretaria","gerente_boston"]`).
  ```bash
  grep -rn "CXC_ROLES =" src/ | grep -v __tests__   # → 9 archivos, 9 copias idénticas
  ```
- ✅ **RESUELTO el 5-sep-2026.** `src/app/admin/error.tsx` le mostraba al usuario el `error.message`
  Y el stack trace completo — la única pantalla del sistema que lo hacía, contra la regla de errores
  humanos de `CLAUDE.md § UX Principles`, y de paso publicaba nombres de tablas y rutas internas a
  cualquiera que abriera el módulo. Hoy es `src/app/cxc/error.tsx` y dice qué pasó, qué significa
  («No se perdió nada: esta pantalla solo consulta saldos, no los modifica») y qué hacer, con
  «Intentar de nuevo» e «Ir al inicio». El detalle va a la consola y a Sentry.

**Comportamiento sorprendente**
- Un `POST /api/cxc/overrides` **parcial BORRA** lo que no manda: `str()` convierte lo ausente en
  `""`. La ruta hermana `/api/overrides` (la que usa Cheques) sí distingue `undefined`.
- ✅ **RESUELTO el 5-sep-2026**: el módulo se llamaba «Cuentas por Cobrar» y vivía en `/admin`, que se
  leía como «administración». Hoy vive en `/cxc` y `/admin` redirige (307, con la query intacta;
  `/admin/usuarios` no se movió). El texto original decía —
  y `/admin/usuarios` es OTRO módulo (Usuarios, del grupo Administración).
---

# Clientes (`/clientes`, key `directorio`)

## Qué es

El padrón de clientes del grupo: quién es cada uno, cómo se le llama, cuánto compró este año y con
qué saldo quedó. Es la **ficha** del cliente, no la cartera (eso es CXC) ni el ranking (eso es
Ventas › Clientes). Es también el único lugar donde se **edita a mano** el contacto de un cliente.

🔴 **Es el directorio del GRUPO y SOLO del grupo.** `clientes_master` no tiene `empresa_key` —una
fila por CÓDIGO— así que adentro un cliente de Boston sería indistinguible de uno del grupo. Por eso
el sync pide por **INCLUSIÓN** y la pantalla vuelve a filtrar con `soloClientesDelGrupo`.
⚠️ La `key` del módulo es `directorio` (historia: antes existía `/directorio`), pero la tabla
`directorio_clientes` es **otra cosa**. 🩸 **Y desde el 5-sep-2026 está RETIRADA**: ver abajo.

## Quién entra

- **`admin`, `secretaria`, `vendedor` y `bodega`** — las cuatro listas coinciden: `ALLOWED_ROLES` del
  server component, `allowedRoles` de `useAuth` y `requireAuth` de `/api/clientes` y
  `/api/clientes/[codigo]` (GET).
- El catálogo (`roles: ["admin","secretaria","vendedor"]`) **no nombra a `bodega`**, así que bodega
  entra por URL o por la búsqueda global, no por una ficha del menú.
  Medido en `role_permissions`: `directorio` lo tienen **admin, secretaria y vendedor**; `bodega`
  **no**. Personas: 2 admin + andrea + Angela + rey + edwin + rodrigo = **7**.
- **Editar el contacto** es solo `admin` y `secretaria` (`EDITABLE_ROLES` en la pantalla y
  `requireAuth(["admin","secretaria"])` en el `PATCH`). Bodega y vendedor ven el botón «Editar
  contacto»… no: no lo ven — `canEdit` lo esconde.
- **«Actualizar ahora»** de la ficha: `admin`, `secretaria`, `vendedor` (`ROLES_SYNC_FICHA_CLIENTE`).
  Bodega ve la ficha pero **no el botón**.
- El **historial mensual** y las **últimas facturas** (`/api/clientes/[codigo]/historial-mensual`,
  `/ultimas-facturas`) piden `admin`, **`contabilidad`**, `secretaria`, `vendedor` — al revés que la
  ficha: entra contabilidad, no entra bodega.
- 🔴 **Un código que no es del grupo contesta 404, no 403** (`esCodigoDelGrupo`): un 403 sería un
  oráculo de qué clientes tiene Boston. Está en el `GET` y en el `PATCH` de `/api/clientes/[codigo]`
  y en `historial-mensual`; **falta en `/ultimas-facturas`** (ver «Lo que sobra»).

## Las pantallas

### `/clientes` — la lista
Server component que trae la primera página ya renderizada (50 filas) y después el cliente pagina
por `/api/clientes`. Todo el estado va a la URL con `replace`: `?search=` (con *debounce* de 250 ms)
· `?provincia=` · `?page=`. Cambiar un filtro vuelve a la página 1.

- **Buscador** «Buscar por nombre, razón social o código…» — busca sin acentos, sin mayúsculas y sin
  espacios (`coincideBusqueda`), sobre nombre + razón social + código + el **alias de display**.
- **Desplegable de provincia** «Todas las provincias». 🔑 Las opciones salen **de los clientes que se
  ven**, no de la tabla entera: derivarlas de la tabla ofrecía provincias donde no vive ningún
  cliente visible (casi todas las filas eran de Boston).
- **«N clientes (filtrados)»** y el botón **«Actualizar ahora»** (refresca `clientes_master` desde el
  espejo de Switch; **solo toca la base, no entra a Switch**).
- **Tabla (≥ 1024 px)**: `Código · Nombre · Compras <año> · Teléfono · Email · Provincia`. Debajo de
  ese ancho, **tarjetas** donde toda la tarjeta navega a la ficha y el teléfono es un enlace de
  llamada de 44×44.
- **Compras del año** viaja **aparte** (`/api/clientes/ytd`, hasta 200 códigos por llamada) para que
  la tabla no espere por esa columna: mientras carga muestra «…», y un cliente que de verdad no
  compró muestra **$0.00 en gris**.
- Un cliente que **Switch dejó de mandar** lleva la etiqueta ámbar **«Ya no está en Switch»**.
  🔄 **Re-medido el 5-sep-2026: `clientes_master.ausente_desde` YA NO está vacía — tiene 2 filas**,
  las dos vivas: **`D-30` City Moda Chorrera** y **`D-135` Rey Store (Aguas)**, las dos marcadas el
  **13-ago-2026**. O sea que la etiqueta SÍ se ve, en esos dos clientes, y el mecanismo que este
  documento daba por roto («no llega a `clientes_master`») **funciona**. `switch_clientes.ausente_desde`
  tiene 12 filas: los mismos 2 clientes × las 6 empresas del grupo.
  ```sql
  select codigo, nombre, ausente_desde from clientes_master
  where deleted is not true and ausente_desde is not null order by codigo;
  -- → D-135 Rey Store (Aguas) 2026-08-13 · D-30 City Moda Chorrera 2026-08-13
  ```

### `/clientes/[codigo]` — la ficha
Server-rendered; hace **cinco lecturas en paralelo** y luego una sexta para las guías.
- **Encabezado**: código, nombre, razón social (si difiere) y, si aplica, la banda ámbar «Ya no está
  en Switch desde el \<fecha\> — se conserva por sus guías y facturas viejas».
- **Datos fiscales** (solo lectura, los pisa el sync): `RUC · DV · Razón social · Provincia`, y al pie
  «Última sincronización: \<fecha\>».
- **Contacto** (editable por admin/secretaria): `Teléfono · Celular · Email · Notas`. **Ningún campo
  es obligatorio**; el `PATCH` acepta solo esos cuatro y `""` se guarda como `null`. Si el celular es
  igual al teléfono, no se repite la línea. Al guardar dice «Datos actualizados» y **invalida la
  caché del selector de clientes** (`invalidarDirectorioClientes`) para que Guías/Cheques/Marketing
  no sigan mostrando el nombre viejo.
- **Historial \<año\>** — tabla `Empresa · Ventas <año> · Cobrado <año> · Por cobrar hoy · Última
  factura`, con las empresas sin actividad colapsadas tras «N empresas sin actividad» y una fila
  **Total grupo**. A la derecha, un chip **«Vencido crítico $X»** / **«Vencido reciente $X»** cuando
  hay saldo de más de 90 días, y el enlace **«Ver en Cuentas por Cobrar →»**
  (`/cxc?search=<nombre>`).
  🩸 Pegado al título hay un ⓘ **que no se borra nunca**: *«Ventas va sin ITBMS — el impuesto se cobra
  para el fisco, no es venta de la empresa. Cobrado y Por cobrar hoy van con ITBMS, porque es la
  plata que entra y la que falta cobrar.»* Sin esa explicación la tabla se lee como un error de la app.
- **Últimas guías** — hasta 3, con enlace a `/guias/<id>/imprimir`.
- **«Actualizar ahora»**: sincroniza en secuencia estadocuenta → recibos → facturas de **las empresas
  donde ese cliente tiene actividad**, y al final `clientes-master`; después hace `router.refresh()`.

**Tarea más frecuente (4 pasos):** `/clientes` → buscar por nombre → abrir la ficha → «Editar
contacto», poner el celular, Guardar.

## Los datos

| Tabla / vista | Filas (4-sep-2026) | Grano · llave | Quién escribe | Quién lee | Soft delete |
|---|---|---|---|---|---|
| `clientes_master` | **5.064** (150 vivas · **4.914 borradas**) | `UNIQUE (codigo)` + índice parcial `WHERE deleted=false AND codigo IS NOT NULL` | cron `sync-clientes-master` (todo menos contacto) y el `PATCH` de la ficha (solo `telefono`, `celular`, `email`, `notas`) | esta pantalla, CXC (contacto en vivo), Ventas › Clientes, la búsqueda global, `ClientePicker`, Guías, Cheques, Marketing | 🔴 sí, `deleted boolean NOT NULL DEFAULT false` |
| `switch_clientes` | **6.799** | `UNIQUE (empresa_key, cliente_switch_id)` | el sync de estadocuenta (paso 1b) y `acs-fidelizacion` | el puente id↔código de toda la app | no; el equivalente es `activo` (**6.787 activos / 12 inactivos**) |
| `directorio_clientes` | **33** | `UNIQUE (nombre)` | 🔴 **NADIE desde el 5-sep-2026** — `/api/directorio` se borró | 🔴 **NADIE** — la búsqueda global y las sugerencias del catálogo pasaron a `clientes_master` | sí, `deleted` NULLABLE (33 en `false`, 0 borradas, 0 nulos) |

**Llenado de `clientes_master`** (re-medido el 5-sep-2026 sobre las 5.064):
`codigo`/`nombre`/`nombre_normalized`/`deleted`/`created_at`/`updated_at` 5.064 · `razon_social`
5.040 · `last_synced_at` 5.063 · `identificacion` 2.092 · `dv` 1.760 · **`celular` 102 · `email` 100
· `telefono` 80 · `provincia` 51 · `contacto` 6 (columna NUEVA, `20260926120000`) · `notas` 2** ·
**`ausente_desde` 2** (D-30 y D-135).
Sobre las **150 vivas** — los cuatro campos de contacto viven todos ahí, ninguno en las borradas:
`last_synced_at` máximo **5-sep-2026 07:00:14**. Provincia: 99 vacías · Chiriquí 25 · Veraguas 7 ·
Bocas del Toro 4 · Colon 3 · Panamá Oeste 3 · Coclé 3 · Los Santos 2 · Herrera 2 · Panamá 1 ·
Darién 1. (En la base va **«Colon» sin tilde**; la pantalla lo muestra tal cual.)

```sql
select count(*) total, count(*) filter (where deleted is not true) vivas,
  count(nullif(trim(celular),'')) cel, count(nullif(trim(email),'')) mail,
  count(nullif(trim(telefono),'')) tel, count(nullif(trim(contacto),'')) contacto,
  count(nullif(trim(notas),'')) notas, count(ausente_desde) ausentes, max(last_synced_at)
from clientes_master;   -- → 5064 | 150 | 102 | 100 | 80 | 6 | 2 | 2 | 2026-09-05 07:00:14
```
⚠️ **Se cuenta con `count(nullif(trim(col),''))`, no con `count(col)`**: los formularios viejos
guardaban cadena vacía, así que `count(col)` devuelve el total de filas y hace parecer llenas
columnas que están vacías. Es el error que hacía ver `cxc_client_overrides` con 10 correos cuando
tiene 8.

Los cuatro campos de contacto son **lo único que escribe una persona**, y el sync **no los pisa**
(`sync-clientes-master.ts:274`). De 150 clientes vivos: 80 con teléfono (53 %), 102 con celular
(68 %), 100 con email (67 %) y **2 con notas** (1,3 %).

**Llenado de `directorio_clientes`** (33): `nombre` 33 · `correo` 25 · `cliente_codigo` 25 ·
`telefono` 22 · y **cinco columnas 100 % vacías**: `empresa`, `celular`, `contacto`, `notas`,
`whatsapp`.

**Llenado de `switch_clientes`** (**6.800** al 5-sep-2026): `ausente_desde` **12** (los 2 clientes
ausentes × las 6 del grupo), `activo = false` en las mismas 12.
Por empresa, con la fecha de su última escritura:
`confecciones_boston` 4.915 (**`synced_at` = 30-jul-2026 06:31:07 en las 4.915**) ·
`american_classic` **1.038** (hoy 11:30) · `active_wear` 147 (hoy 16:11) · `vistana` 142 (hoy 16:10) ·
`joystep` 140 (hoy 16:01) · `active_shoes` 140 (hoy 16:00) · `fashion_shoes` 139 (hoy 16:05) ·
`fashion_wear` 139 (hoy 16:05).

🩸 **Boston lleva 37 días congelado y a la fecha de esta medición sigue congelado.** Su cron nuevo
(`sync-clientes-boston`) es **SEMANAL, domingos 07:10 UTC**, y nació hoy: todavía no ha corrido. Eso
NO afecta al directorio del grupo —`clientes_master` no toca Boston—, pero sí a los teléfonos y
correos que muestra la pestaña de Boston del CXC.

```sql
select empresa_key, count(*) n, count(ausente_desde) ausentes, max(synced_at)
from switch_clientes group by 1 order by 2 desc;
```

**Lo que la ficha lee además:** `switch_facturas` (ventas del año y última factura, vía la RPC
`cliente_ficha_ventas`), `switch_estadocuenta_aging` (por `company_key`), `switch_recibos`
(`.in("empresa_key", B2B_EMPRESA_KEYS)`, `es_retencion = false`) y `guia_items` + `guia_transporte`.

## De dónde vienen los datos

| Cron (UTC) | Qué hace |
|---|---|
| `sync-clientes-master` — **07:00** | Reconstruye `clientes_master` desde `switch_clientes` de **nuestra propia base** — **no toca Switch**. Pide por **INCLUSIÓN** (`.in("empresa_key", EMPRESAS_DEL_GRUPO)`) y **nunca pisa** `telefono/celular/email/notas/provincia`. No tiene fila propia en `switch_sync_log`: solo deja `cron_heartbeats` (última corrida buena medida: **4-sep-2026 07:00:14**) |
| `switch-sync?tipo=estadocuenta` — 05:3x / 16:0x / 21:1x | escribe `switch_clientes` como paso 1b, con `GET /apicliente/lista` (**API con token**) |
| `acs-fidelizacion` — 11:30 · 16:30 | escribe los `switch_clientes` de `american_classic` |
| `refresh-clientes-views` — **07:35** | refresca `clientes_empresa_12m_vw` (que alimenta Ventas › Clientes, no esta pantalla) |

Campos que Switch manda y **se descartan** en `switch_clientes`: `clienteImpuesto` y
`clienteImpuestoCodigo` (los que deciden el ITBMS de un pedido) y `vendedor` fuera de `raw_data`.
`GET /apicliente/lista` **no está documentado** en el PDF oficial en cuanto a `vendedor`/`vendedorId`,
`email`, `telefono`, `celular`, `identificacion` y `dv` — y de esos campos dependemos.

Si `sync-clientes-master` no corre: el directorio se queda con la foto de ayer; el contacto escrito a
mano **no se pierde** (el sync no lo toca). Si `switch_clientes` no se actualiza, un cliente nuevo de
Switch no aparece y uno retirado tampoco se marca.

## Las reglas que ya están fijadas

| Regla | Candado |
|---|---|
| 🔴 **`clientes_master` es del grupo y solo del grupo**: el sync pide por INCLUSIÓN, nunca excluyendo | `src/__tests__/lib/clientes-master-solo-del-grupo.test.ts` |
| 🔴 **Nadie une `clientes_master` por `nombre_normalized`**, ni en SQL ni en TypeScript. Dos barridos, uno sobre las migraciones (con un caso «roto» de control) y otro sobre `src/` | mismo archivo |
| **Una sola puerta para leer el directorio** (`leerClientesDelGrupo`): nadie arma su propia consulta. El selector de Cheques leía sin paginar y sin `.order()` → **1.000 filas en silencio, 64 de 146 clientes inofrecibles** | `src/__tests__/lib/clientes-puerta-unica.test.ts` |
| **Los tres mundos** (grupo · Boston · Multifashion) se verifican en las **dos direcciones**: que Boston y MF no entren **y** que los 145 del grupo sigan estando (un test de solo exclusión pasa con el directorio vacío) | `src/__tests__/lib/mundos-clientes.test.ts` |
| 🔴 **El nombre canónico no lo decide el reloj.** Cuando dos empresas llaman distinto al mismo código, gana el nombre que MÁS empresas comparten; empate → orden fijo de `EMPRESAS_DEL_GRUPO`. Nunca `synced_at` | `src/__tests__/lib/nombre-canonico.test.ts` |
| Un cliente ausente de Switch **deja de OFRECERSE, no de existir**: su ficha abre, su nombre sigue saliendo en una guía vieja, y 🔴 **una corrida fallida o vacía no marca a nadie** (`MAX_FRACCION_AUSENTES = 0.1`) | `src/__tests__/lib/clientes-ausentes-de-switch.test.ts`, `…/components/clientes-ausentes-selector-y-ficha.test.tsx` |
| El **alias de display** y los campos de búsqueda viven en el mismo módulo: si el chip muestra un nombre, el buscador tiene que encontrarlo | `src/__tests__/lib/clientes-nombre-display.test.ts` |
| El filtro del navegador importa el **MISMO** `coincideBusqueda` del endpoint; nadie lo reescribe | `src/__tests__/lib/busqueda-clientes-local.test.ts` |
| La caché del directorio (60 s) guarda un array **compartido**: ordenarlo in-place es estado global entre peticiones — por eso el `.slice()` es obligatorio | `src/__tests__/lib/directorio-cache.test.ts` |
| La búsqueda y la página van a la URL con `replace` y sobreviven a entrar en una ficha y volver | `src/__tests__/components/clientes-busqueda-en-la-url.test.tsx` |
| 🩸 El formulario del directorio **solo escribe lo que le mandan**: antes borraba teléfono/celular/contacto/notas (22 de 33 fichas los tenían) y el campo WhatsApp era un control muerto | `src/__tests__/lib/directorio-codigo-cliente.test.ts` |
| **«Compras del año» corta en hora de Panamá** y el listado y la ficha no pueden decir dos números distintos (aritmética en enteros escalados) | `src/__tests__/lib/clientes-ytd.test.ts` |
| Las **sugerencias «¿quisiste decir…?» NUNCA atan solas**, ni con un único candidato, y una diferencia de NÚMERO se ve | `src/__tests__/lib/clientes-sugerencias.test.ts` |
| **Un solo selector de cliente** en todo el sistema | `src/__tests__/un-solo-selector-de-cliente.test.ts` (barrido) |

## Con qué conecta

**Qué lee de otros módulos:** `switch_clientes` y `switch_facturas` (Ventas/Switch),
`switch_estadocuenta_aging` (CXC), `switch_recibos` (cobros) y `guia_items` + `guia_transporte`
(Guías, para las «Últimas guías»).

**Quién lee lo suyo — `clientes_master` es de las tablas más conectadas del sistema:**

| Quién | Para qué |
|---|---|
| **Cuentas por Cobrar** | el correo/teléfono/celular **en vivo** de cada fila, y el destinatario del correo de cobro |
| **Ventas › Clientes** | el nombre y el código del ranking (por el puente `switch_clientes`, **nunca por nombre**) |
| **La búsqueda global** (`/api/search:99`) | busca clientes ahí. 🔄 **Ya NO mira `directorio_clientes`** (5-sep-2026): filtra `deleted = false` y `ausente_desde is null` |
| **`ClientePicker`** (`useBusquedaClientes`) | el selector único de cliente que usan **Guías, Cheques y Marketing** |
| **Guías** | `guia_items.cliente_codigo`, los destinos y las frecuencias |
| **Cheques** | `/api/cheques/frecuencias` y el código del cliente |
| **Marketing** | la galería por cliente, el ZIP por marca y el comprobante de entrega |
| **Multifashion** | `productos-ranking.ts` |
| **Catálogos** | `cliente-elegido.ts` (el cliente del pedido) |
| **Backup** | la copia diaria |

**Qué se rompería:**
- Volver a meter clientes de **otra empresa** en `clientes_master` multiplica el ranking de Ventas —
  ya pasó: 4.910 filas de Boston durante cinco semanas publicaron **$2,55 millones de venta que no
  existió** (`docs/postmortems/ventas-referencia.md`).
- Renombrar `codigo` rompe el puente `switch_clientes → clientes_master` y con él Ventas › Clientes,
  el CXC, Guías y Cheques.
- Cambiar `nombre_normalized` mueve la consolidación del CXC (que agrupa por nombre) y la búsqueda.
- Quitar `leerClientesDelGrupo` como puerta única devuelve el corte silencioso de 1.000 filas a los
  selectores.

## Por qué está así

- 🔴 **«se debería de usar el código del cliente, ya que todos los D-24 por ejemplo son de City Mall
  across mis 6 empresas»** → **la identidad del cliente es el CÓDIGO**, no el nombre. Medido: 138 de
  los 147 códigos del grupo aparecen en las 6 empresas con el MISMO nombre. De ahí salen el puente
  `switch_clientes (empresa_key, cliente_switch_id) → codigo → clientes_master.codigo` y la
  prohibición de unir por `nombre_normalized`.
- 🩸 **Boston fuera de `clientes_master`** (2-sep-2026) — estuvo adentro cinco semanas (4.910 filas
  del 28-jul) y el ranking de Ventas publicó **$2,55 millones de venta que no existió**, por unir
  clientes por NOMBRE. Se marcaron 4.914 filas como borradas; quedan **150**.
- **La ficha por dirección también se cierra**: `/api/clientes/[codigo]` contesta **404** —el mismo
  que un código inexistente— a un código que no es del grupo. **Un 403 sería un oráculo de qué
  clientes tiene Boston.**
- **«cxc sí se muestra con ITBMS, porque es lo que tengo que cobrar»** → la tabla «Historial \<año\>»
  mezcla dos bases a propósito: **Ventas sin ITBMS** (el impuesto se cobra para el fisco, no es venta
  de la empresa) y **Cobrado / Por cobrar hoy con ITBMS**. 🔴 El ⓘ que lo explica **no se borra
  nunca**: sin él, la tabla se lee como un error de la app.
- **«YTD» era jerga en inglés** en una ficha que abre todos los días gente que no es contadora →
  los encabezados dicen el año a secas («Historial 2026», «Ventas 2026», «Cobrado 2026»), y «CXC» se
  escribe **«Cuentas por Cobrar»**, como se llama la pantalla en el resto del sistema.
- **Un cliente que Switch dejó de mandar deja de OFRECERSE, no de existir** (4-sep-2026): la ficha lo
  dice con fecha y se conserva «por sus guías y facturas viejas»; los selectores no lo ofrecen.

- 🔴 **«los clientes de multifashion que vivan solo en el módulo de multifashion. en cxc de boston
  que esté como hoy en día, solo viven ahí. los de las otras empresas que sí son un grupo, que
  conviva en todos lados»** (30-jul-2026) → **los TRES MUNDOS**: Grupo (6 empresas) · Boston ·
  Multifashion (`src/lib/clientes/mundos.ts`). Las dos constantes de fuera del grupo se nombran
  aparte «para que pedirlas sea una decisión ESCRITA y no un `.eq()` suelto que alguien copió de otra
  consulta». **No hay una forma cómoda de pedir todos juntos, y esa ausencia es el diseño.**
- **«clientes de boston solo quiero verlos solo en su tab. igual que multifashion. esos no deben de
  convivir con el resto del sistema»** (30-jul-2026) → la misma regla, dicha del otro lado.
- 🔴 **«sus ventas suman, pero sus clientes no se ven»** (30-jul-2026) → **la plata de los tres mundos
  sigue contando** en Ventas y en Vista General; lo único que se va son las LISTAS de clientes.
  «**Si un total cambia, el cambio está mal.**»
- **«quiero que se llame american classics store en guía porque si no el personal no va a saber»** →
  nació `ALIAS_DISPLAY_CLIENTE` (`D-108`: «Multi Fashion Holding» → «American Classics Store»), y el
  alias se hizo además **buscable**. Se agregan **de a uno, con el pedido explícito de Daniel detrás**.
- **«es un cliente al final del día» · «al final es venta real» · «hay que estar pendiente también
  como cliente»** (27-jul-2026) → las empresas del grupo volvieron al ranking con la columna
  `es_del_grupo`, que **marca sin excluir**. Los totales no se movieron.
- **«Sin ITBMS»** (27-jul-2026) → la ficha y «Compras del año» pasaron a `subtotal_descuento`: «ese
  impuesto se cobra para el fisco y nunca fue ingreso de la empresa». City Mall Paso Canoa daba
  $479.870,40 en Ventas y $513.457,72 en la ficha; `D-108` bajó $13.784,30.
- **«decidir eso es de Daniel, no del sync»** (8-ago-2026, sobre `D-170`: «Nova Lux, S.A.» en cinco
  empresas y «El Machetazo-Calidonia» en `active_wear`) → cuando el nombre no coincide, el sistema
  **elige el canónico por mayoría, no adivina** y **no fusiona**. Los 7 clientes del directorio manual
  que no parean con ningún código quedan en `NULL`.
- **«Borrarlo del maestro es decisión de Daniel. Lo único que se le quita es la RECOMENDACIÓN»**
  (`D-201`) → `CODIGOS_QUE_NO_SE_SUGIEREN`.
- **«los cargó Daniel a mano, uno por uno»** (los 33 de `directorio_clientes`) → el `PUT` pasó a
  escribir **solo los campos que vinieron**.
- **«la ficha de cliente por dirección se va. El directorio por dentro se va.»** (2-sep-2026) → se
  marcaron **4.914 filas** con `deleted = true` (4.883 de Boston + 31 que Switch conoce en Boston y
  ACS). **Soft delete y no `DELETE`**: reversible con un `UPDATE`.
- **«APROBADO»** (4-sep-2026, sobre los clientes ausentes de Switch) → el que Switch dejó de mandar
  **deja de ofrecerse pero NO se borra**. 🔑 **No se reusó `deleted`**: «`deleted` significa "no
  existe" y un ausente tiene que seguir existiendo» → columna nueva `ausente_desde`.
- **El freno del sync de ausentes** (`MAX_FRACCION_AUSENTES = 0.1`) existe «para que una corrida a
  medias no marque a nadie, no a que Daniel borró un décimo de sus clientes en Switch el mismo día».
- 🩸 **«un centavo que Daniel lee como plata»** → la suma pasó a **enteros escalados** (numeric 14,4)
  porque City Mall daba $1.073.515,50 o $1.073.515,49 según el orden de las filas.
- **«Daniel —que ya se quejó de lentitud— cambiaría una molestia por otra»** → las compras del año
  viajan **aparte** del listado, para que la tabla no espere por esa columna.

## Lo que se intentó y se retiró

- **`/directorio`** — la pantalla vieja. La reemplazó `/clientes` (Sprint 1, Fase 4D), que lee
  `clientes_master` en vez de `directorio_clientes`. ⚠️ **La `key` del módulo siguió siendo
  `directorio`** porque está en `role_permissions` y renombrarla rompería permisos sin comprar nada.
  🔄 **La tabla `directorio_clientes` se retiró el 5-sep-2026** (hasta ese día quedaba como libreta
  de 33 contactos que alimentaba la búsqueda global). Hoy **el directorio es UNO solo y va por
  CÓDIGO**: `clientes_master`. Sus rutas `/api/directorio*` se borraron del repo.
- 🩸 **Una SEGUNDA copia de la lectura del directorio dentro de `/clientes/page.tsx`** — bajaba
  `clientes_master` entera (5.062 filas, 6 viajes paginados) más `switch_clientes` (6.634 filas, 7
  viajes): **11.700 filas y 13 idas a Supabase**, con `force-dynamic` y sin caché, **en cada apertura
  de la pantalla**. Y `/api/clientes` ya hacía exactamente lo mismo con una caché de 60 s que esa
  pantalla no usaba. Medido contra el build de producción: **el HTML tardaba 3.215 ms**. Se unificó en
  `leerClientesDelGrupo`; las ocho columnas se compararon una por una antes de tocar nada.
- 🩸 **Una segunda consulta para las provincias** — sin paginar y sin filtro de mundo: PostgREST
  cortaba en **1.000 de 5.062 filas en silencio**, y las que llegaban eran casi todas de Boston
  (4.883 de 5.062). El desplegable ofrecía provincias donde no vive **ningún** cliente visible: se
  elegía una y la lista quedaba vacía. Hoy las provincias se **derivan de los clientes que se ven**.
- 🩸 **La búsqueda y la página vivían en `useState`** — entrar a la ficha de un cliente y volver
  dejaba el buscador vacío y de nuevo en la página 1: revisar 10 clientes seguidos era escribir la
  búsqueda 10 veces. Se mudaron a la URL con `replace` (24-ago-2026) reusando `useUrlState`, el hook
  del sistema; no se inventó otro mecanismo.
- 🩸 **El formulario del directorio BORRABA lo que no mandaba** — teléfono, celular, contacto y notas
  (22 de las 33 fichas los tenían), y el campo **WhatsApp era un control muerto**. Se arregló para que
  `PUT /api/directorio/[id]` copiara solo las claves presentes en el body… y el **5-sep-2026 la ruta
  entera desapareció** con el retiro de la libreta. El arreglo vivió tres días.
- **El `?search=` como prefill de una sola vez** — se leía al montar y nada más. Hoy es el mismo
  parámetro que la pantalla escribe.
- **La coletilla «· sincronizados de Switch»** del bloque de datos fiscales — se fue: cuatro renglones
  más abajo está «Última sincronización: \<fecha\>», que dice lo mismo y además **cuándo**. La misma
  poda se hizo en Proveedores.
- **`src/lib/clientes/columna-codigo-opcional.ts`** — el helper que reintentaba guardar sin
  `cliente_codigo` mientras la migración `20260808180000` no corriera. **Sin usos desde el
  3-sep-2026**; se conserva como helper del repo.
- **La tolerancia a «la DDL todavía no corrió»** en las rutas de clientes — retirada: hoy un
  `PGRST205`/`42P01`/`42703` **falla visible** (500), nunca vacío ni `disponible:false`.

- 🩸 **Los 4.883 clientes de Boston dentro de `clientes_master`** — entraron el 28-jul-2026 a las
  07:01 UTC porque el sync tenía `.neq("empresa_key","american_classic")`: excluía ACS y **solo** ACS.
  Publicaron **$2,55 millones de venta que no existió** durante cinco semanas. Sacados con soft
  delete el 2-sep-2026; el sync pasó a pedir por **inclusión**.
- 🩸 **La ficha por dirección de Boston** — `/api/clientes/[codigo]` GET, PATCH e historial **servían
  y dejaban EDITAR** las 4.915 fichas: miraban solo `deleted = false` y ninguno pasaba por la puerta
  de mundo. Hoy los tres contestan **404**.
- **Las consultas propias de los dos selectores de «más usados»** (Guías y Cheques) — reemplazadas el
  8-ago-2026. El de Cheques leía sin paginar y sin `.order()`, con un comentario **falso** («son 149
  filas vivas»): **64 de los 146 clientes del grupo eran inofrecibles**, incluido «Jerusalem De
  Panamá», cliente de 11 de los 19 cheques. Ninguno filtraba por mundo.
- **El comentario «149 filas vivas» de `/api/clientes`** — corregido el 3-ago-2026: 149 es lo que
  queda DESPUÉS del filtro de mundos; la tabla tiene 5.062. Con el número equivocado, leer la tabla
  entera parecía barato. De ahí nació `directorio-cache` con su TTL de 60 s.
- **El desempate `ORDER BY synced_at DESC` para el nombre canónico** — reemplazado el 8-ago-2026: el
  nombre de un cliente lo decidía **el calendario de crons** (joystep, 05:42, siempre ganaba), así
  que **mover 15 min una entrada de `vercel.json` renombraba clientes en silencio**.
- **La búsqueda literal `nombre.ilike / codigo.ilike`** — reemplazada el 27-jul-2026: «multifashion»
  daba 0 y «multi fashion» daba 1; «d108» daba 0 porque el código es `D-108`; y no buscaba razón
  social, que 84 de 149 tienen distinta.
- **El reintento sin `cliente_codigo` y el flag `_falta_migracion_codigo`** (POST y PUT del
  directorio) — retirados el 3-sep-2026: la columna existe desde `20260808180000`.
- **El campo WhatsApp del formulario del catálogo era un CONTROL MUERTO** — `whatsapp` faltaba en el
  `INSERT` y en el `UPDATE`: se escribía, se mandaba y **no se guardaba nunca** (arreglado 8-ago-2026).
- **`clientes_master_por_nombre_unico_vw` — descartada ANTES de construirse.** Era un
  `GROUP BY nombre_normalized HAVING COUNT(*) = 1` que se abstenía ante un nombre ambiguo: buen
  parche mientras el nombre era la única llave, **deuda** con una llave de verdad. Hay candado de que
  no reaparezca.
- **El fallback por nombre en el ranking — NO se dejó.** Medido: de 8.181 facturas, 370 (4,52 %)
  traen un `cliente_switch_id` viejo, valen $3.817,74 (0,07 %) y **caen a «Otros clientes» con
  fallback y sin fallback**. Lo único que el fallback lograba era **rotular ventas del grupo con
  códigos de Boston**.
- **Un `CHECK` de forma sobre `clientes_master.codigo`** (`D-<n>` o `TCKCTA`) se evaluó y **no
  sirve**: el grupo tiene el código `12188`, pelado y numérico. Habría rechazado a un cliente
  legítimo. La garantía es la puerta de escritura y el barrido, no la forma del código.
- **`backup_clientes_master_20260509` — tabla BORRADA** (26-jul-2026).
- **`/admin/seed-clientes-master`** (endpoint + página) — temporal del Sprint 1, en el backlog para
  retirar. Y **`src/app/directorio/DirectorioClient.tsx` (896 líneas) sigue en el repo**, también
  marcado para borrar.
- 🩸 **Los parches del 30-jul-2026** (#387 Directorio, #388 buscador ⌘K) — se arregló **dos veces la
  pantalla que alguien notó y nadie miró el ranking de Ventas**. Por eso el arreglo definitivo fue en
  la ÚNICA puerta de escritura (el sync) y el candado es un **barrido**, no una lista de superficies.

## Cuánto se usa

Misma advertencia que en CXC: **no hay telemetría de pantallas**.

- **Quién puede entrar:** 7 personas (2 admin + 2 secretarias + 3 vendedores). `bodega` puede abrir la
  pantalla por URL pero no tiene la ficha en el menú.
- **`activity_logs` no registra NADA de este módulo**, verificado el 5-sep-2026: cero filas con
  `entity_type` o `action` de clientes o directorio. (Las 7 filas que aparecen al buscar «cliente» son
  de **Guías**, `action = 'guia_item_cliente'`.) El `PATCH` de la ficha **no llama a `logActivity`**,
  y las de `/api/directorio/[id]` (`directorio_update`, `directorio_delete`) se fueron con la ruta.
- **Lo que se escribió, medido:** `directorio_clientes` tiene **33 filas**, 31 dadas de alta el
  27-mar-2026, una en abril y **la última el 28-may-2026** (100 días). Ediciones: **no medibles** — la
  tabla no tiene `updated_at` ni `created_by`. **Y desde hoy tampoco tiene quién la escriba.**
- **Contacto escrito a mano en `clientes_master`** (5-sep-2026): **80 teléfonos · 102 celulares ·
  100 correos · 6 contactos · 2 notas** sobre 150 clientes vivos. 🔴 **Cuándo fue la última edición a
  mano NO es medible**: `updated_at` lo pisa el cron todos los días a las 07:00 (coincide al segundo
  con `last_synced_at`) y no hay `updated_by` ni historial.
- **Que el dato llegue sí se mide:** `sync-clientes-master` no deja fila en `switch_sync_log` (solo
  `cron_heartbeats`); su última escritura medida es **5-sep-2026 07:00:14**
  (`max(last_synced_at) from clientes_master`). El `estadocuenta` que llena `switch_clientes` corrió
  582 veces en 30 días con 7 errores.

## Qué papeles y Excel produce

🔴 **NINGUNO, y desde el 5-sep-2026 es literal.** `/clientes` y `/clientes/[codigo]` no tienen botón
de export, ni PDF, ni correo. Hasta hoy quedaba una rendija —`GET /api/directorio?format=csv`, el
`directorio_<YYYY-MM-DD>.csv` de las 33 filas de la libreta vieja, que no disparaba ningún botón y
solo se alcanzaba escribiendo la URL—; **esa ruta se borró con el resto de `/api/directorio`.**

Los datos de este módulo sí salen en papel, pero **impresos por otros**: el estado de cuenta que
manda el CXC usa su correo y su teléfono; el nombre del cliente sale en la guía de despacho, en el
comprobante de Marketing y en los PDF de pedido de Catálogos.

## Cómo probarlo a mano

**1. Que la lista es la del grupo.** Abre `/clientes` sin filtros. Arriba tiene que decir alrededor de
**150 clientes** (medido: **150 vivos al 5-sep-2026**, el mismo número que ayer). Si de golpe dice
miles, alguien volvió a meter Boston en `clientes_master`:
`select count(*) from clientes_master where deleted is not true` → 150.

**2. Que editar el contacto se guarda y se ve en todos lados.** Abre una ficha → «Editar contacto» →
cambia el celular → Guardar. Tiene que decir «Datos actualizados». Verifica en tres lugares:
(a) recarga la ficha y sigue ahí; (b) abre `/cxc`, busca ese cliente y despliega su fila — el
celular nuevo tiene que estar **sin esperar al cron**; (c) abre una guía nueva y busca ese cliente en
el selector — el nombre y el dato tienen que ser los nuevos (la caché se invalida al guardar).
En la base: `select telefono, celular, email, notas from clientes_master where codigo = 'D-xx'`.

**3. Que el cron no pisa lo que escribiste.** Después de guardar un teléfono, espera al día siguiente
(el cron corre 07:00 UTC) y vuelve a mirar: **tiene que seguir igual**. Si desapareció, alguien tocó
la lista de campos que el upsert excluye (`sync-clientes-master.ts:274`).

**4. Que las cifras de la ficha no se contradicen.** «Ventas \<año\>» va **sin ITBMS** y «Cobrado» y
«Por cobrar hoy» **con ITBMS** — no cuadran entre sí a propósito, y el ⓘ al lado del título lo dice.
«Por cobrar hoy» del Total grupo tiene que ser el mismo número que la columna «Total» de ese cliente
en `/cxc`.

**5. Que un código ajeno no abre.** Escribe a mano `/clientes/<un código de Boston>`: tiene que dar
**404**, el mismo que un código inexistente.

## Qué lo rompe

| Qué falla | Cómo se nota | Qué pasa con el dato |
|---|---|---|
| **`sync-clientes-master` no corre** | nada visible: la lista se queda con la foto de ayer | El contacto escrito a mano **no se pierde** (el sync no lo toca). No hay alerta propia: este cron no deja fila en `switch_sync_log`, solo `cron_heartbeats` |
| **El sync vuelve a pedir por EXCLUSIÓN** | la lista pasa de ~150 a miles y el ranking de Ventas se duplica | Pasó: 4.910 filas de Boston, cinco semanas, **$2,55 millones de venta que no existió**. Hoy lo impide el barrido de `clientes-master-solo-del-grupo.test.ts` |
| **Switch deja de mandar un cliente** | la ficha lo dice con fecha; los selectores dejan de ofrecerlo | 🔴 **Una corrida fallida o que traiga menos del 90 % no marca a nadie** (`MAX_FRACCION_AUSENTES = 0.1`) |
| **`db-max-rows` = 1000** | 🔴 nada: corta en silencio | `leerClientesDelGrupo` pagina y verifica contra un `count` exacto. Ya costó 64 clientes inofrecibles en el selector de Cheques |
| **La migración `20260919120000` (`ausente_desde`)** | ninguna: `directorio-cache.ts` reintenta sin la columna | Re-medido el 5-sep-2026: la migración corrió **y la columna ya tiene 2 filas** (D-30 y D-135, marcadas el 13-ago). La etiqueta «Ya no está en Switch» SÍ se ve, en esos dos clientes |
| **Un `PGRST205`/`42P01`** | 500 visible | La tolerancia se retiró: ya no devuelve vacío |

## Lo que sobra o no cuadra

- ✅ **CERRADO el 5-sep-2026: `GET /api/directorio?format=csv` ya no existe.** Era la única salida en
  papel del módulo, no la disparaba ningún botón, y se fue con el resto de `/api/directorio`.
  **Hoy el módulo Clientes no produce ni un archivo.**
- ✅ **CERRADO el 5-sep-2026: `directorio_clientes` se RETIRÓ ENTERA.** Era «la libreta vieja»: 33
  filas, la última alta el 28-may-2026, cinco columnas 100 % vacías (`empresa`, `celular`, `contacto`,
  `notas`, `whatsapp`) y un solo lector, la búsqueda global. Hoy **no tiene ni un lector ni un
  escritor**: `/api/directorio` (y `[id]`, y `sync`) **se borraron del repo**, la búsqueda global
  (`/api/search:99`) y las sugerencias del catálogo (`/api/catalogo/[marca]/clientes-search:36`) leen
  **`clientes_master`**, y el autocompletar de Recordatorios dejó de pedirla. **La tabla se queda**
  —patrón `mayor_lineas`— con sus 33 filas y su fila en el respaldo. Candado:
  `src/__tests__/lib/directorio-viejo-retirado.test.ts`, más `buscador-solo-grupo.test.ts`.
  Verificación: `grep -rn "directorio_clientes" src --include="*.ts" --include="*.tsx" | grep -v __tests__`
  → solo comentarios, `database.types.ts`, `backup/tablas.ts` y el `route.ts` del respaldo.
- 🔴 **`/api/clientes/[codigo]/ultimas-facturas` no tiene la puerta de mundo.** Sus dos hermanas
  (`[codigo]` y `historial-mensual`) llaman `esCodigoDelGrupo` y devuelven 404; esta no. Hoy funciona
  por accidente: `switch_factura*` no tiene filas de Boston, así que devuelve `{facturas: []}`.
- **Dos copias del criterio de signo de venta:** `src/lib/clientes-ytd.ts` (derivado de
  `ventas/tipos-comprobante.ts`, con el centinela de tipos nuevos) y un bloque **inline** en
  `historial-mensual/route.ts`. La segunda no pasa por el centinela.
- **Cuatro lecturas de la ficha no paginan** (`switch_facturas` ×2, `switch_estadocuenta_aging`,
  `switch_recibos`): un cliente con más de 1.000 facturas en el año truncaría en silencio.
  Hoy nadie llega, pero la ficha no usa `leerTodoPaginado`.
- ✅ **CERRADO el 5-sep-2026.** Todo lo que este documento anotaba de `/api/directorio` —el 403 sin
  sesión en vez de 401, el `search` crudo dentro del `.or(...ilike...)` sin escapar `%` ni `,`, la
  rama sin paginar que traía la tabla entera, las dos rutas sin `export const dynamic`, el
  `await req.json()` sin `try/catch` de `sync`, y la normalización propia de `sync`— **desapareció con
  las rutas**. Ya no hay nada que arreglar ahí.
- **`src/lib/clientes/columna-codigo-opcional.ts` no lo importa nadie** desde el 3-sep-2026 (lo dice su
  propio encabezado).
- **`clientes_master.notas` la usan 2 clientes de 150.** El campo existe en el formulario y en el
  `PATCH`.
- ❌ **Esto era FALSO y se corrigió el 5-sep-2026.** Este documento decía: *«`ausente_desde` está
  vacía al 100 % (0 de 5.064)… el mecanismo de marcado existe en `switch_clientes` y no llega a
  `clientes_master`»*. **Sí llega**: `sync-clientes-master.ts` tiene la pasada `marcarAusentes` y hay
  **2 filas marcadas** (D-30 y D-135, 13-ago-2026). Lo que pasa es que son pocas — 2 de 150 — y
  contarlas mal (o mirar solo las 4.914 borradas de Boston, que nunca se marcan) hace parecer que el
  mecanismo está muerto.
- **`bodega` está en `allowedRoles` de la pantalla pero no en `roles[]` del módulo ni en su fila de
  `role_permissions`.** Entra por URL o por la búsqueda global; no tiene ficha ni botón de sync.
---

# Proveedores (`/proveedores`, key `proveedores`)

## Qué es

El espejo del CXC del otro lado: a quién le debe el grupo, cuánto y desde hace cuánto. Es
**100 % de lectura**: sus dos rutas de API solo exportan `GET` y la tabla no tiene ni una columna de
autor. Lo que se ve es la foto que Switch calcula, no una cuenta nuestra — a diferencia del CXC, aquí
**el aging viene armado desde Switch** y se guarda tal cual.

## Quién entra

- **`admin` y `contabilidad`**, y las tres capas coinciden: `roles: ["admin","contabilidad"]` en el
  catálogo, `useAuth({ moduleKey: "proveedores", allowedRoles: ["admin","contabilidad"] })` en las dos
  pantallas, y `requireRole(req, ["admin","contabilidad"])` en `/api/proveedores` y
  `/api/proveedores/[key]`. **Ni secretaria ni vendedor ni bodega.**
- Medido en `role_permissions`: `proveedores` está **solo** en la fila de `contabilidad`. **No está en
  la de `admin`** — y no hace falta: `getVisibleModules` devuelve todo para `admin` sin mirar la tabla.
  Personas con acceso: **daniel, alberto y el usuario `Contabilidad`** = 3.
- **«Actualizar ahora»** admite además a `secretaria` (`ROLES_SYNC_PROVEEDORES =
  ["admin","secretaria","contabilidad"]`), pero secretaria no puede abrir la pantalla, así que en la
  práctica el botón lo tocan los mismos tres.

## Las pantallas

### `/proveedores` — la lista
Estado en la URL: `?empresa=` (validado contra las 7 con CxP; lo que no esté cae a «Todas») y `?q=`
(búsqueda con *debounce* de 200 ms). El filtro de empresa además se recuerda en `localStorage`
(`fg_last_proveedores_empresa`).

De arriba abajo:
1. **«Actualizar ahora»** — un clic sincroniza el CxP de **las 7 empresas EN SECUENCIA** (subtexto
   «tarda ~1 min»; sesión única de Switch, nunca dos a la vez).
2. **Aviso ámbar de rechazos** (`AvisoRechazosSwitch`, familia `proveedor`, **sin acotar empresas**).
3. **Tarjeta grande**: «Por pagar · grupo» o «Por pagar · \<Empresa\>». En morado el saldo; si es
   negativo, dice **«Saldo a favor $X»** en azul.
4. **Chips de empresa**: «Todas» + las 7 (las 6 del grupo + **Multifashion**; Boston **no tiene
   proveedores**).
5. **Buscador** «Buscar proveedor…».
6. **«N proveedores con saldo»** y el botón **«Exportar Excel»** (que muestra «Preparando…» mientras
   baja el chunk de la librería).
7. **Tabla (≥ 1024 px)**: `Proveedor · 0-90d · 91-120d · 121d+ · Por pagar · Último pago · Empresas`
   (la última columna solo con «Todas»). Debajo de ese ancho, **tarjetas**. Los proveedores con saldo
   **0** se colapsan tras «▸ Ver N sin saldo».
8. Tocar una fila abre la ficha.

### `/proveedores/[key]` — la ficha
La `key` es el **nombre normalizado** (mayúsculas, sin puntos ni comas, espacios colapsados): es la
identidad del proveedor **entre empresas**, porque Switch le da un id distinto en cada una.
- **«Por pagar · grupo»** y, debajo, **«Antigüedad del saldo»** con los **8 buckets tal como los
  manda Switch** (`0-30 · 31-60 · 61-90 · 91-120 · 121-180 · 181-270 · 271-365 · Mas de 365`),
  coloreados con el vocabulario de tres tramos del CXC (`agingKeyForBucket`).
- **«Datos»**: `RUC · DV · Contacto · Teléfono · Celular · Email · Dirección` — **solo se dibujan los
  campos con dato**, y si no hay ninguno la sección entera no aparece. Al pie, «Última
  sincronización: \<fecha\>».
- **Tabla por empresa**: `Empresa · Por pagar · Último pago` (monto · N d), con fila **Total grupo**.
- **«Reclamos vinculados»** — los reclamos que cruzan por el par **(empresa, código de proveedor)**
  con las filas de Switch de esta ficha, con enlace «Ver en Reclamos →». **No se unen por nombre**
  (4-sep-2026): `reclamos.proveedor` es texto libre y Switch escribe otra grafía. Un reclamo sin
  código no aparece en ninguna ficha, a propósito.
- **«Actualizar ahora»** de la ficha sincroniza **solo las empresas donde ese proveedor tiene cuenta**.
- Si la `key` no existe: **«Proveedor no encontrado — Puede que aún no esté sincronizado.»**

**Tarea más frecuente (3 pasos):** `/proveedores` → mirar «Por pagar · grupo» → tocar el primero de la
lista para ver desde cuándo se le debe.

## Los datos

**Una sola tabla, y el módulo NO la escribe.**

| Tabla | Filas | Grano · llave | Quién escribe | Quién lee | Soft delete |
|---|---|---|---|---|---|
| `switch_proveedor_estadocuenta` | **65** | `UNIQUE (empresa_key, proveedor_switch_id)` | 🔴 **solo el cron `sync-proveedores`** | esta pantalla y **Vista General** (la tarjeta «Por pagar (CXP)» y la lista de proveedores vencidos) | 🔴 **NO tiene.** Es un snapshot: el sync hace un **`DELETE` real** de los proveedores que ya no están en la lista de Switch |

⚠️ `CLAUDE.md § Dónde vive cada dato` ya lo corrigió, pero conviene repetirlo: **esta tabla no tiene
`deleted`**, y era la que se citaba como «la única tabla `switch_*` con soft delete».

**Llenado (de 65), re-medido el 5-sep-2026 y confirmado dato por dato:** `empresa_key`,
`proveedor_switch_id`, `codigo`, `nombre`, `saldo_total`, `aging`, `elements`, `num_facturas`,
`num_pagos`, `synced_at`, `updated_at` = 65 · `identificacion` 57 · `direccion` 50 · `telefono` 50 ·
`celular` 50 · `email` 50 · `tipo_proveedor` 50 · `dv` 45 · `contacto` 24 ·
**`ultimo_pago_monto` / `ultimo_pago_fecha` / `ultimo_pago_dias` = 12 cada una** ·
🔴 **`comprado_ytd` y `pagado_ytd` = 0 en las 65, confirmado**.
`tipo_proveedor` (3 valores): `Local` 49 · vacío 15 · `Internacional` 1.

```sql
select count(*) n, count(nullif(trim(identificacion),'')) ident, count(nullif(trim(contacto),'')) cont,
  count(ultimo_pago_monto) up, count(*) filter (where comprado_ytd <> 0) cy,
  count(*) filter (where pagado_ytd <> 0) py
from switch_proveedor_estadocuenta;   -- → 65 | 57 | 24 | 12 | 0 | 0
```

🔴 **`comprado_ytd` y `pagado_ytd` valen 0 en las 65 filas.** Son columnas `NOT NULL DEFAULT 0` que
**ya no se escriben ni se leen**: los dos indicadores se retiraron el 27-jul-2026 (ver «Lo que se
intentó y se retiró»). El «Último pago» sí se recalcula **al leer**, desde el jsonb `elements`, porque
el sync corre 1×/día y «hace N días» se congelaba.

**Reparto por empresa, 5-sep-2026** (proveedores · Σ `saldo_total`):
`fashion_wear` 17 · $2.334.502,27 — `fashion_shoes` 3 · $1.338.175,39 — `vistana` 12 · $1.008.781,89
— `active_shoes` 10 · $261.113,57 — `american_classic` 13 · $124.436,54 — `active_wear` 5 ·
$111.506,97 — `joystep` 5 · $21.189,19. **Total 65 proveedores · $5.199.705,82.**
**`confecciones_boston` = 0 proveedores** (`cxp: false`).
El REPARTO de proveedores por empresa (17 · 13 · 12 · 10 · 5 · 5 · 3) **no se movió** desde el 4-sep;
lo que se movió es la plata.

```sql
select empresa_key, count(*) n, round(sum(saldo_total),2) suma
from switch_proveedor_estadocuenta group by 1 order by 3 desc;
```

**Lo que la ficha lee además:** la tabla `reclamos` (`deleted = false`, ordenada por `fecha_reclamo`),
**entera**, y cruza en memoria por el par **(`empresa_key`, `proveedor_codigo`)** contra las filas de
`switch_proveedor_estadocuenta` de esta ficha (`src/lib/reclamos/proveedor-vinculo.ts`).
🩸 Hasta el 4-sep-2026 se unía por `normProvName(r.proveedor) === key`, y **26 de los 34 reclamos
vivos ya no cruzaban**: Switch dice «American Fashion Wear, SA» y los reclamos dicen «American
Fashion Wear». Las fichas de Fashion Wear (21 reclamos) y Fashion Shoes (5) mostraban CERO.

## De dónde vienen los datos

| Cron (UTC) | Endpoint de Switch | Vía |
|---|---|---|
| `sync-proveedores` — **09:30**, serial por empresa | `GET /apiproveedor/lista` paginado + **`GET /apiproveedor/info?proveedorId=`**, uno por proveedor | **API JSON con token** (`SWITCH_<EMPRESA>_API_*`) |
| **«Actualizar ahora»** (lista o ficha) | los mismos, en secuencia | igual, con cooldown de 10 min por (módulo, empresa) |

Lo recupera la reconciliación (`switch-reconciliacion`, 10:00 · 14:00 · 18:00 UTC).

**Qué se guarda y qué se descarta:** se guarda el **`aging` jsonb tal como Switch lo calcula** —al
revés que en clientes, donde el aging que Switch manda (`Saldos[]`, `saldoTotal`) **se descarta y se
recalcula**— más el `elements` jsonb completo (el ledger). Se descarta `costopromedio`.

🔴 **Lo que hay que saber de `/apiproveedor/info`, y no está en el PDF oficial de Switch** (es uno de
los 7 endpoints que se usan sin documentar):
- **Devuelve HTTP 200 con HTML** cuando falla, así que el sync valida la **forma** de la respuesta
  (que `saldos` y `elements` sean arrays), no el código de estado.
- Sus fechas vienen **`YYYY-MM-DD`**, al revés que el estado de cuenta de clientes (`DD-MM-YYYY`).
- 🩸 **El ledger es solo lo ABIERTO**: medido, 0 de 821 renglones tienen saldo cero. Una factura
  pagada al 100 % desaparece **y se lleva su pago con ella**. Por eso «Comprado YTD» y «Pagado YTD»
  quedaban cortos **por diseño**, y no hay forma de arreglarlo por API.

**Empresas:** las 6 del grupo + `american_classic` (`cxp: true`). Boston fuera.

## Las reglas que ya están fijadas

| Regla | Candado |
|---|---|
| 🔴 **Del ledger de CxP solo se deriva «Último pago».** «Comprado YTD» y «Pagado YTD» **no vuelven**, y hay candado explícito para que nadie los reponga | `src/__tests__/lib/proveedores-derivados.test.ts` |
| **Un pago es `abrev === "PP"`.** Las notas de crédito y de débito **no son pagos** — antes 6 de 17 filas mostraban la fecha de una nota de crédito como «último pago» | mismo archivo |
| El monto del documento sale de `total`, **no del saldo** | mismo archivo |
| Las fechas se interpretan en **UTC−5 fijo** (`fechaPanamaDelLedger`), aceptando `YYYY-MM-DD` y `DD-MM-YYYY`, con y sin zona; los tests usan fechas fijas | mismo archivo |
| La identidad cross-empresa es **`normProvName`** (UPPER, sin `.` ni `,`, espacios colapsados) — un mismo proveedor tiene un `proveedor_switch_id` distinto en cada empresa | `src/lib/proveedores.ts` |
| Los 8 buckets de Switch se traducen al vocabulario de 3 del CXC con **una sola función** | `src/lib/proveedores-aging.ts` (`agingKeyForBucket`) |
| El Excel arranca en la **fila 1**, con moneda numérica y fila de totales | `src/__tests__/excel-exports-operacion.test.ts` |
| El guard de montos imposibles usa un **piso de $20 M** para esta familia, porque hay saldos legítimos de $2,07 M | `src/lib/switch-api/monto-guard.ts` + `src/__tests__/lib/monto-guard.test.ts` |
| **Vista General suma TODAS las filas de CxP, incluidos los saldos a favor (negativos)**, para cuadrar con el `grupo_saldo` de este módulo | comentario en `src/app/api/dashboard/vista-general/route.ts` |

## Con qué conecta

**Qué lee de otros módulos:** la tabla `reclamos` (módulo Reclamos), para «Reclamos vinculados».
Y comparte con el CXC el vocabulario de tramos (`src/lib/cxc-aging.ts`).

**Quién lee lo suyo:**
- **Vista General** — `switch_proveedor_estadocuenta` alimenta la tarjeta «Por pagar (CXP)» y la
  tarjeta de atención «Proveedores con saldo vencido +90d». Es su **único** lector fuera del módulo.
- Nadie más: la tabla no aparece en la búsqueda global, ni en badges, ni en ninguna alerta de Telegram.

**Qué se rompería:**
- Cambiar los `title` del `aging` jsonb (`"0-30"`, `"91-120"`, `"Mas de 365"`…) rompe a la vez
  `agingKeyForBucket` (`src/lib/proveedores-aging.ts`) y las constantes `CXP_CORRIENTE_TITLES` /
  `CXP_VIGILANCIA_TITLES` / `CXP_VENCIDO_TITLES` de `/api/dashboard/vista-general`.
- Cambiar la forma de `elements` deja sin «Último pago» a la lista y a la ficha (se recalcula al leer).
- Renombrar `normProvName` o cambiar su normalización parte la identidad cross-empresa: el mismo
  proveedor saldría dos veces con dos `key` distintas. Los «Reclamos vinculados» sobreviven mientras
  la ficha exista, porque cruzan por (empresa, código) y no por el nombre.
- Cambiar el `codigo` que Switch le da a un proveedor **sí** deja los reclamos viejos huérfanos: la
  identidad es ese código. `EMPRESAS_MAP` (`src/lib/reclamos/empresas.ts`) tiene los seis pares y hay
  candado que exige que cada uno exista de verdad.

## Por qué está así

- 🔴 **«solo quiero info que se pueda sacar al centavo desde Switch; lo que no, se elimina»**
  (27-jul-2026) → se **borraron** «Comprado YTD» y «Pagado YTD», y se **descartó** su reemplazo.
  «Bajo la regla de Daniel eso es un borrado, no un rótulo nuevo.»
- **«decisión de Daniel: letra más chica, no dos líneas»** → los nombres largos de proveedor se
  cortaban hasta 46 px en la tarjeta; se bajó a `text-xs` (13 px) en vez de partirlos en dos
  renglones. Es la misma decisión del #301 que rige en Vista General.
- El módulo es **de solo lectura por decisión, no por olvido**: no hay nada que una persona pueda
  saber de un proveedor que Switch no traiga, y agregar notas propias habría creado un segundo dato
  que se desincroniza del snapshot que se reescribe todos los días.
- **El aging se guarda TAL CUAL lo manda Switch**, al revés que en clientes —donde el aging que
  Switch calcula (`Saldos[]`, `saldoTotal`) **se descarta y se recalcula**—. Es la única familia donde
  se confía en el cálculo del proveedor externo, y por eso los buckets de la ficha son **ocho**, los
  de Switch, y no los tres del CXC.
- **La identidad es el NOMBRE NORMALIZADO, no el id**, porque Switch le da a un mismo proveedor un
  `proveedor_switch_id` distinto en cada empresa: sin `normProvName` la lista mostraría al mismo
  proveedor tres veces y la ficha no podría sumar «Total grupo».
- **«Último pago» se recalcula AL LEER**, no se sirve de la columna guardada: el sync corre 1×/día y
  «hace N días» se congelaba (`src/lib/proveedores-derivados.ts`).
- **Un pago es `abrev === "PP"`.** Las notas de crédito y de débito **no son pagos**: antes 6 de 17
  filas mostraban la fecha de una nota de crédito como «último pago».
- **El total incluye los saldos a favor (negativos)** — se rotulan «Saldo a favor $X» en azul. Es la
  misma decisión que toma Vista General para que su tarjeta «Por pagar (CXP)» cuadre con este módulo.
- **Los proveedores con saldo 0 se colapsan**, no se esconden: siguen a un clic bajo «▸ Ver N sin
  saldo». Un proveedor que dejó de deberse sigue existiendo.

## Lo que se intentó y se retiró

- 🔴 **«Comprado YTD» y «Pagado YTD»** — retirados el **27-jul-2026**, y el encabezado de
  `src/lib/proveedores-derivados.ts` documenta por qué **no vuelven**:
  1. 🩸 **El `estadodecuenta.elements[]` de `/apiproveedor/info` es un estado de cuenta PODADO: solo
     trae lo ABIERTO.** Medido: **0 de 821 renglones** tienen saldo cero. Una factura pagada al 100 %
     desaparece **y se lleva su pago con ella**, así que los dos indicadores quedaban cortos **por
     diseño**.
  2. **No existe ningún endpoint de pagos a proveedores** en el API de Switch.
  3. `/apiingresomercancia` trae documentos **anulados indetectables** y montos basura.
  Las columnas `comprado_ytd` y `pagado_ytd` **quedaron en la tabla** (`NOT NULL DEFAULT 0`) y hoy
  valen 0 en las 65 filas. Hay **candado explícito** para que nadie las reponga
  (`src/__tests__/lib/proveedores-derivados.test.ts`).
- **La leyenda de aging** (`AgingLegend`) — eliminada en jul-2026 de Proveedores y de CXC; el
  vocabulario y los colores viven en `src/lib/cxc-aging.ts`.
- **La coletilla «· sincronizados de Switch»** del bloque «Datos» — se fue: el pie de la misma
  sección ya dice «Última sincronización: \<fecha\>», que además dice cuándo. Misma poda que en la
  ficha del cliente.
- **La subcadena «· ordenados por monto»** bajo el conteo de la lista — se fue: aquí el orden es fijo y
  se ve solo en la primera columna de montos. En CXC esa coletilla **sí se queda**, porque ahí el
  orden cambia con la píldora.
- **El corte de layout en `sm`** — la tabla pide 811 px y un iPad de 834 deja 562 útiles (la barra
  lateral se lleva 224): **249 px de arrastre, medidos en el navegador**. Las tarjetas ya existían;
  se les amplió el tramo hasta `lg`.
- **El motor de Excel cargado desde el arranque** — `xlsx-js-style` pesaba **310 kB gzip** del
  arranque de la ruta, más que todo el resto junto, solo para tener el botón. Hoy se carga en el clic
  y el botón dice «Preparando…» mientras baja el chunk (mismo patrón que Guías y Cheques).
- **El filtro `saldo_total > 0`** que Vista General aplicaba a esta tabla — se quitó: excluía 2
  proveedores con saldo a favor y el total no cuadraba con el `grupo_saldo` del módulo.

- 🔴 **El reemplazo de «Comprado YTD» desde `/apiingresomercancia/lista` — DESCARTADO tras medirlo**
  (27-jul-2026). Tres razones, cualquiera suficiente:
  1. **No se pueden excluir los anulados, ni siquiera detectarlos.** El filtro `estatus` está
     documentado pero **la API lo IGNORA**: medido en `american_classic`, `estatus=Activo`,
     `estatus=Inactivo` y sin filtro devuelven **las MISMAS 610 filas y la MISMA suma**
     ($1.099.278,65). Y no hay campo de estado en ninguna parte, ni en la lista ni en el detalle
     (se revisaron las 10 llaves de `/apiingresomercancia/info` en 12 documentos).
  2. **Trae basura no filtrable**: en `active_shoes` el ingreso `19-000000011` viene con
     `subTotal 4460999999999.55` y `total 1000000000`, contra un saldo de CxP de $233.870,60 en toda
     la empresa; 6 de 104 documentos así.
  3. **Es BRUTO**: no hay endpoint de devoluciones ni de notas de crédito de compra.
  La evidencia es reproducible con `scripts/_probe-ingresomercancia*.ts`.
- 🩸 **`parseFecha()` esperaba `DD-MM-YYYY` — CORREGIDO (27-jul-2026).** `/apiproveedor/info` manda
  **`YYYY-MM-DD`**. Medido sobre los 821 renglones guardados: **821 en `YYYY-MM-DD`, 0 en
  `DD-MM-YYYY`** → devolvía `null` 821 de 821 veces, y como todo el cálculo vivía dentro de un
  `if (f && …)`, **«Comprado YTD», «Pagado YTD» y «Último pago» salían en cero o vacío en 66 de 66
  filas, en las 7 empresas**. `DD-MM-YYYY` sí es el formato del estado de cuenta de **CXC**: se copió
  el parser al módulo equivocado y el comentario documentaba un formato que el endpoint nunca usó.
- 🩸 **Las notas de crédito contaban como pagos — CORREGIDO (27-jul-2026).** Se clasificaba por
  `debito > 0` a secas; de los 90 renglones con débito, **57 son «Pago a proveedores» y 33 son «Nota
  de Crédito»**. Con eso, **6 de las 17 filas con débito mostraban como «Último pago» la fecha de una
  NC** —plata que nunca salió— y 5 proveedores sin un solo pago mostraban uno.
- **El año se cortaba en UTC — corregido**: era `getUTCFullYear()`, así que entre las 19:00 y las
  23:59 del 31-dic de Panamá el corte saltaba al año siguiente y el YTD se vaciaba 5 h antes.
- **`credito` / `debito` se leían como monto del documento — corregido.** Son el **saldo abierto**:
  medido, `credito === saldo` en 731/731 renglones de cargo y `debito === |saldo|` en 90/90. El monto
  del documento es `total`.
- 🔴 **`sync-proveedores` fallaba en SILENCIO ABSOLUTO — corregido.** No tenía
  `alertSwitchCronErrors` ni `logCronError`; lo único que delataba una caída era la ausencia de
  heartbeat. **Era el único sync de Switch así.** Hoy escribe en `switch_sync_log` con
  `sync_type='proveedores'` (así el conteo de fallos seguidos funciona) y pasa por la misma política
  anti-ruido que los demás.
- **El generador de Excel manual — reemplazado** por `lib/excel-export.ts`, con las mismas columnas y
  totales.

## Cuánto se usa

- **Quién puede entrar:** 3 personas (daniel, alberto y `Contabilidad`) — verificado contra
  `role_permissions` y `fg_users` el 5-sep-2026: `proveedores` está **solo** en la fila de
  `contabilidad`, y `admin` pasa sin mirar la tabla. Sesiones de `Contabilidad` en los últimos 30
  días: **31**; en 90 días: **68**. Última: 2-sep-2026.
- 🔴 **El uso del módulo es 100 % no medible.** No escribe ninguna fila en ninguna tabla, no llama a
  `logActivity` (0 filas con `entity_type` de proveedores) y no hay telemetría de pantallas. Lo único
  que se puede afirmar es que Contabilidad entra al sistema seguido y que este es **uno de sus cinco
  módulos** (`asistencia`, `prestamos`, `proveedores`, `gastos-contabilidad`, `comisiones`).
- **Que el dato llegue sí se mide:** re-medido el 5-sep-2026, `sync-proveedores` corrió **210 veces
  en 30 días (7,0/día, las 7 empresas) con CERO errores** — el mismo número que ayer. Última corrida
  buena de las 7: **5-sep-2026 09:30–09:32 UTC** (`max(synced_at)` = 09:32:28).

## Qué papeles y Excel produce

| Salida | Desde | Nombre | Columnas | Quién lo recibe |
|---|---|---|---|---|
| **Excel** | botón «Exportar Excel» de la lista | `Proveedores[_<Empresa>]_<YYYY-MM-DD>.xlsx`, hoja «Proveedores» | `Proveedor · 0-90d · 91-120d · 121d+ · Por pagar · Último pago · Empresas`, con fila de totales («N proveedores» + las cuatro sumas). El nombre va en **negrita** si tiene saldo; 91-120d en ámbar, 121d+ en rojo, un saldo a favor en azul; «Último pago» va como texto «hace N d» | Daniel, Contabilidad |

**No hay PDF ni correo.** Nada de este módulo sale hacia el proveedor.
⚠️ El Excel exporta **`items`**, o sea lo que devolvió la consulta con los filtros puestos —
incluidos los proveedores sin saldo, aunque en pantalla estén colapsados.

## Cómo probarlo a mano

**1. Que el total cuadra con Vista General.** Abre `/proveedores` con «Todas» y anota «Por pagar ·
grupo». Abre `/vista-general` y mira la tarjeta «Por pagar (CXP)». **Tienen que ser el mismo número**
(al **5-sep-2026: $5.199.705,82**; el 4-sep eran $5.104.077,19 — este número se mueve todos los días
con el sync de las 09:30). Si no cuadran, el sospechoso es un filtro de `saldo_total > 0`:
el total incluye los saldos a favor a propósito.

**2. Que «Actualizar ahora» trae datos.** Toca el botón de la lista y espera ~1 min (van las 7 en
secuencia). Al terminar, entra a cualquier ficha: «Última sincronización» tiene que ser de hoy.
En la base: `select empresa_key, max(synced_at) from switch_proveedor_estadocuenta group by 1`.

**3. Que «Último pago» dice la verdad.** Abre una ficha con pago registrado. El monto y los días se
**recalculan al leer** desde el ledger, así que los días tienen que avanzar solos de un día para
otro aunque el sync no haya corrido. Y tienen que corresponder a un renglón de tipo **PP** —
si sale la fecha de una nota de crédito, se rompió `esPagoAProveedor`.

**4. Que un proveedor de dos empresas es uno solo.** Con «Todas», la columna «Empresas» de la lista
tiene que decir 2 o más para los que compran en varias, y la ficha tiene que mostrar una fila por
empresa más el «Total grupo». Si el mismo proveedor sale dos veces en la lista, se rompió
`normProvName`.

**5. Que los reclamos cruzan.** Abre la ficha de un proveedor que tenga reclamos abiertos: la sección
«Reclamos vinculados» tiene que listarlos. El cruce es por nombre normalizado, así que un nombre
escrito distinto en Reclamos no aparece — eso es dato sucio, no una falla del módulo.

## Qué lo rompe

| Qué falla | Cómo se nota | Qué pasa con el dato |
|---|---|---|
| **Switch cambia `/apiproveedor/info`** | 🔴 puede pasar **inadvertido**: el endpoint devuelve **HTTP 200 con HTML** cuando falla | El sync valida la FORMA (que `saldos` y `elements` sean arrays) y no el código de estado. Si cambia el jsonb `aging`, se rompen a la vez la ficha y la tarjeta de Vista General |
| **`sync-proveedores` no corre** | «Última sincronización» se queda quieta; el saldo no se mueve | Lo recupera la reconciliación (10/14/18 UTC). Medido: 0 errores en 30 días |
| **Un proveedor sale de la lista de Switch** | desaparece de la pantalla, sin aviso | 🔴 **`DELETE` real** — la tabla no tiene soft delete. No hay forma de recuperar su histórico salvo del backup |
| **La sesión de Switch la tiene otro** | el sync recibe `0006 TOKEN INVALIDO` y re-loguea | **La sesión es por USUARIO, no por empresa** (`docs/switch/api-documentacion.pdf`, p. 6): el sistema entra como `daniel`, así que cada corrida lo saca del panel de esa empresa. Por eso los crons de una misma empresa van a ≥15 min (`SEPARACION_MINIMA_MIN`) |
| **Un monto imposible** | la línea ámbar arriba del total lo dice | El guard rechaza la fila con piso de $20 M para esta familia |
| **El ledger de Switch cambia de forma** | «Último pago» se vacía en las 12 filas que lo tienen | Se recalcula al leer con `derivarProveedor`; no hay copia guardada que valga |

## Lo que sobra o no cuadra

- 🔴 **`comprado_ytd` y `pagado_ytd` son columnas `NOT NULL DEFAULT 0` que valen 0 en las 65 filas** y
  que **nadie escribe ni lee**. Quedaron de los dos indicadores retirados el 27-jul-2026.
- **`ultimo_pago_monto/fecha/dias` están llenas en 12 de 65 filas**, y aun así **no se usan**: la
  pantalla las recalcula al leer desde `elements`. Son tres columnas guardadas que nadie mira.
- **El aviso de rechazos de este módulo no acota empresas** (`lineaDeRechazos({familias:["proveedor"]})`
  sin `empresas`), a diferencia del CXC, que lo acota a las 6 del grupo. Hoy da igual porque Boston no
  tiene proveedores, pero es una asimetría deliberada en un lado y no en el otro.
- **Dos lecturas sin paginar**: `fetchAllProveedorRows()` trae `switch_proveedor_estadocuenta` entera
  (65 filas hoy) y la ficha trae **todos los reclamos** para filtrar en memoria. Ninguna usa
  `leerTodoPaginado`; con `db-max-rows` = 1000 el corte sería silencioso.
- **Los dos endpoints devuelven el `err.message` crudo de PostgREST** en su 500, a diferencia del CXC,
  que devuelve textos humanos.
- **`ROLES_SYNC_PROVEEDORES` incluye a `secretaria`**, que no puede abrir ninguna de las dos pantallas
  del módulo. El permiso existe sin puerta.
- **`proveedores` no está en la fila de `admin` de `role_permissions`** (funciona porque
  `getVisibleModules` le devuelve todo a admin sin mirar la tabla) — igual que `vista-general`, que no
  está en **ninguna** fila.

---

# Lo que estaba mal

**Verificación completa del 5-sep-2026.** Se recorrió el documento entero y se comprobó **una por
una** cada afirmación factual: números, nombres de tabla/vista/columna/función/ruta, «quién lee» y
«quién escribe» (con `grep` sobre `src/`, buscando la llamada real y no el nombre en un comentario),
qué empresas cubre cada tabla, y que cada candado citado exista de verdad.

**Resultado: ~215 afirmaciones verificadas · 12 estaban MAL · 9 quedaron viejas por el trabajo de
hoy · el resto se confirmó, muchas al centavo.**

Lo que se confirmó exacto vale tanto como lo que se corrigió, así que va primero un ejemplo: el
`$463.898,47 = 7,4 %` de Boston se **reprodujo al centavo** poniéndole el corte del 2-sep, la fecha
en que se midió. Igual los 36 documentos de menos de $50 de City Mall Paso Canoa ($227,20), los
13 clientes de `oficina@citymoda.store` ($402.376,67), los 272/113 de contacto de Boston, el llenado
entero de `switch_proveedor_estadocuenta`, el de `cxc_client_overrides` y los cinco tipos de
comprobante vivos.

## Lo que estaba mal

| Qué decía | Qué es en realidad | Cómo se midió |
|---|---|---|
| 🔴 **«Total 211 clientes»** en la cartera del grupo (y «los 79 con correo» sobre esa base, y «0 de 211» en las columnas vacías) | **211 son FILAS, una por (empresa, cliente). Los clientes son 100**, y 100 es lo que pinta la pantalla (`useAdminData` consolida por `nombre_normalized`). De los 100: **94 deben · 6 tienen saldo a favor**. Decir «me deben 211 clientes» cuenta seis veces a City Mall | `select count(*), count(distinct codigo) from switch_estadocuenta_aging` → `211 | 100` |
| 🔴 **«`clientes_master.ausente_desde` está vacía al 100 % (0 de 5.064)… el mecanismo no llega a `clientes_master`»** | **Tiene 2 filas y el mecanismo funciona**: `D-30` City Moda Chorrera y `D-135` Rey Store (Aguas), marcados el 13-ago-2026. La etiqueta «Ya no está en Switch» SÍ se ve | `select codigo, ausente_desde from clientes_master where ausente_desde is not null` |
| 🔴 **«`cxc_emails_enviados` no la lee ninguna pantalla — bitácora de solo escritura»** | **`GET /api/cxc/envios` la lee**, y `src/app/cxc/page.tsx:251` la pide al abrir la pantalla: de ahí sale la marca «Le enviaste el estado de cuenta hace 3 días». Y ahora tiene **tres** escritores, no uno | `grep -rn "cxc_emails_enviados" src` |
| **«`activity_logs` con `entity_type = "cxc"`: 38 filas … **andrea**»** | Son **38 con `action = 'cxc_upload'`** (27 con `entity_type='cxc'` + 11 con `'upload'`), pero **el nombre de la persona no se puede saber**: `activity_logs` **no tiene columna de usuario**, solo `user_role` (32 `secretaria`, 6 `admin`). Atribuirlo a andrea era inferencia, no medición | `select column_name from information_schema.columns where table_name='activity_logs'` |
| **«Logins de daniel en 30 días: 74»** (y 49 de Angela) | **110** (340 en 90 días) y **48**. El 74 no se reproduce: con una ventana que avanzó un día tendría que bajar, no subir. Los demás (rey 32, edwin 8, alberto 1, Contabilidad 31) sí cuadran | `count(*) filter (where created_at >= now() - interval '30 days')` sobre `user_sessions` |
| **«el detalle fino del `title` de Boston llega con la migración `20260928120000`»** (futuro) | **Ya llegó**: la migración corrió hoy y `switch_estadocuenta_aging_boston` pasó de 10 a **17 columnas**, con los siete tramos finos **al lado** de los tres gruesos | `pg_attribute` sobre esa vista |
| **«migración `20260926120000`, pendiente»** (el `contacto` de la ficha) | **Aplicada**, y ya tiene **6 clientes** con contacto cargado | `supabase_migrations.schema_migrations` |
| **«las siete migraciones marcadas pendiente ya corrieron, más otras seis»** | Se quedó corto: están aplicadas **todas hasta `20260928120000`**, o sea siete más | mismo lugar |
| **«`vercel.json` tiene 80 entradas de cron»** | **82** (entraron `prestamos-caducan` y `sync-clientes-boston`) | `python3 -c "import json;print(len(json.load(open('vercel.json'))['crons']))"` |
| **«`GET /api/cxc-rows` — ruta viva sin consumidor»** | **Se borró el 5-sep-2026.** `src/app/api/cxc-rows/` no existe | `ls src/app/api/cxc-rows` |
| **«El menú «···» tiene exactamente 4 opciones» como regla vigente** | El menú **ya no existe**: el rediseño lo reemplazó por el botón «Cobrar». El candado sigue vivo pero **cambió de dirección** — hoy exige que NO vuelva | encabezado de `src/__tests__/components/cxc-pestanas-y-menu.test.tsx` |
| **«`directorio_clientes`… su único lector vivo es la búsqueda global»** y las seis notas sobre `/api/directorio` | **Retirada entera hoy.** Cero lectores, cero escritores; `/api/directorio`, `[id]`, `sync` y `?format=csv` **borrados**. La búsqueda global y las sugerencias del catálogo leen `clientes_master` | `grep -rn "directorio_clientes" src` (solo comentarios y respaldo) |

## Números que solo estaban viejos (el dato se mueve todos los días)

| Dato | 4-sep-2026 | 5-sep-2026 |
|---|---|---|
| Cartera del grupo (`switch_estadocuenta_aging`) | $3.685.289,04 | **$3.676.935,55** (211 filas, 100 clientes) |
| Cartera de Boston | $190.399,07 · 390 | **$195.509,25** · 390 (279 con saldo) |
| Por pagar a proveedores | $5.104.077,19 | **$5.199.705,82** (65 proveedores, mismo reparto) |
| `switch_estadocuenta` | 2.754 (Boston 985) | **2.759** (Boston **990**) |
| `switch_facturas` | — | **54.466** (desde oct-2022) |
| `switch_clientes` | 6.799 | **6.800** (ACS 1.038) |
| Venta 2026 de Boston | $463.898,47 = 7,43 % | **$472.856,97 = 7,54 %** |
| Fichas de `switch_articulo_info` en `active_shoes` | 1.200 de 1.763 | **1.408** de 1.763 |
| `switch_articulo_diario` de Boston | 18.016 | **18.064** |
| `switch_costo_diario` con `costo_total = 0` | 732 de 1.223 | **726** de 1.223 |

## Lo que se midió nuevo y no estaba en ningún lado

- **El aviso «N sin pagar hace +90 d» hoy dice 37, por $647.944,31.** De los 94 clientes que deben,
  30 no pagan hace más de 90 días y **7 nunca pagaron**; el más viejo lleva **911 días**.
- **`clientes_master.contacto` tiene 6 clientes cargados** (la columna nació hoy): D-38 «Alberto
  levy», D-76 «emad», D-166 «Mohamed», D-170 «Victor Rodriguez», D-202 «Narimy» y D-103 con un correo
  metido en el campo de contacto.
- **La columna `canal` de `cxc_emails_enviados` quedó en `'correo'` en las 19 filas** por el backfill;
  `whatsapp` y `copia` tienen **0 filas**: se estrenaron hoy.
- **La 12ª exclusión de comisiones es la primera asimétrica del sistema** (Edwin / `D-81` / Vistana,
  solo cobro). `CLAUDE.md` dice «11 activas» y quedó viejo al día siguiente de escribirse.
- **`clientes_empresa_12m_vw` es una VISTA MATERIALIZADA, no una vista** (`relkind = 'm'`), pese al
  sufijo `_vw`. La convención de `CLAUDE.md` («`_mv` = materializada, `_vw` = vista») **no se cumple
  en ese objeto**, y refrescarla o no cambia lo que ve Ventas › Clientes. Filas: 1.685.
- **Contar contacto con `count(columna)` miente.** Los formularios viejos guardaban cadena vacía, no
  `NULL`: `count(correo)` sobre `cxc_client_overrides` da 10 y lo real son **8**. Hay que usar
  `count(nullif(trim(col),''))`. Es la trampa que hace ver llenas columnas vacías.

## Cosas del SISTEMA (no de la documentación) que quedaron abiertas

1. 🩸 **El directorio de clientes de Boston lleva 37 días congelado y sigue congelado.** Las 4.915
   filas de `switch_clientes` de `confecciones_boston` tienen `synced_at = 2026-07-30 06:31:07`. El
   cron que lo arregla (`sync-clientes-boston`) nació hoy y es **semanal, domingos 07:10 UTC**: a la
   fecha de esta medición **no ha corrido ni una vez**. Mientras tanto, los teléfonos y correos de la
   pestaña de Boston del CXC son de hace más de un mes.
2. ⚠️ **`/api/clientes/[codigo]/ultimas-facturas` sigue sin la puerta de mundo.** Sus dos hermanas
   (`[codigo]` y `historial-mensual`) llaman `esCodigoDelGrupo` y devuelven 404 a un código ajeno;
   esta no. Hoy no filtra nada porque `switch_facturas` no cruza para Boston, pero es la única de las
   tres sin el candado.
3. ⚠️ **`HojaCobrar.tsx:20` cita un candado que no existe** (`cxc-cobrar-manda-las-seis.test.ts`). La
   regla de «siempre las 6 empresas» SÍ está cerrada, pero en `cxc-cobrar-una-hoja.test.ts`.
4. 🔴 **`joystep` sigue sin una sola fila en `bancos_saldos`** (52 filas, 7 empresas). La tarjeta
   «Disponibilidad» de Vista General suma el banco de siete de las ocho y no lo advierte. Y los
   últimos saldos de vistana, fashion_wear, Boston y ACS son del **31-jul-2026**.
