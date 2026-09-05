# Multifashion y Confecciones Boston

> Referencia viva de los dos módulos «de una empresa que no es Fashion Group».
>
> 🔬 **MEDIDO CONTRA PRODUCCIÓN EL 5-sep-2026.** Cada cifra de este archivo se volvió a
> consultar ese día contra la base real (Management API de Supabase,
> `POST /v1/projects/rspocgqhtpveytgbtler/database/query`, **solo lectura**) y contra el
> código fuente en `src/`. Cada número trae la consulta que lo produjo. Al final está la
> sección **[«Lo que estaba mal»](#lo-que-estaba-mal-verificación-del-5-sep-2026)**: qué
> decía · qué es · cómo se midió. La escritura anterior es del 4-sep-2026.
>
> 🔴 **Titular de la verificación: el aislamiento de Boston NO tiene ninguna fuga** — se
> comprobó en las dos direcciones, en la base y en el código. Lo que sí sigue roto es
> **el directorio de clientes de Boston**: el cron que lo arregla está escrito y programado,
> pero **todavía no ha corrido ni una vez** y las 4.915 filas siguen congeladas desde el
> 30-jul. Ver el bloque de `switch_clientes` y «Lo que estaba mal» #1.
>
> No repite `cxc/CLAUDE.md`: apunta a él (§ Invariantes por módulo, § Dónde vive cada dato,
> § Roles) y escribe lo que le falta. Los post-mortems verbatim viven en
> [`docs/postmortems/multifashion.md`](../postmortems/multifashion.md) y
> [`docs/postmortems/boston-cxc.md`](../postmortems/boston-cxc.md).
>
> 🔑 **Los dos son hermanos estructurales y por eso están en el mismo archivo**: una empresa
> que no convive con el grupo, con su propio módulo, su propio gerente, un rol de un solo
> módulo y 403 en todo lo demás. `american_classic` y `confecciones_boston` son justamente
> **las DOS que no son Fashion Group**. El molde lo inventó Multifashion (Jennifer, jul-2026)
> y Boston lo copió entero (David, 27-ago-2026).

---
---

# Multifashion (`/multifashion`, key `multifashion`)

## Qué es

El tablero de **American Classics**, la tienda de mostrador de Chiriquí (empresa
`american_classic`). Contesta, en una sola pantalla y sin abrir Switch: cuánto se vendió hoy,
cómo va el mes contra el mes pasado y contra el año pasado, qué vendió cada vendedora, qué
productos y marcas se mueven, quiénes son los clientes que vuelven, cómo cuadró la caja del
día y cómo va la meta del equipo.

Es **retail puro** en casi todo lo que muestra: el mayoreo (intercompañía + La Frontera) se
declara aparte y no entra al titular ni a los comparativos. Es el único módulo del sistema
con **metas configurables** y con una **caja diaria** traída de Switch a demanda.

## Quién entra

| Rol | Ficha en el menú | La pantalla | Las 11 rutas de `/api/multifashion/**` |
|---|---|---|---|
| `admin` (daniel, alberto) | sí | sí | sí (`requireRole` deja pasar admin siempre) |
| `gerente_acs` (**jennifer**) | sí, y es su **ÚNICO** módulo | sí | sí, las 11 |
| `secretaria` (**andrea**) | **sí, por `modulos_override`** — ver abajo | **sí** | 9 de 11 (todas menos… ninguna: las 11 la nombran salvo que `metas` la deja solo LEER) |
| `secretaria` (Angela) | no (su override no lo trae) | no | igual las llamaría bien, pero no tiene puerta |
| `contabilidad` | no | **no** (`useAuth` la rebota a `/home`) | **solo 2**: `overview` y `venta-hoy` |
| `vendedor`, `bodega`, `gerente_boston` | no | no | **403 en las 11** |

**✅ Re-medido el 5-sep-2026** (`select role, modulos from role_permissions` +
`select name, role, active, modulos_override from fg_users`), sin cambios:
`gerente_acs.modulos = ["multifashion"]`, y **`andrea` (secretaria) tiene `multifashion` dentro
de sus 11 módulos de `modulos_override`** — o sea que hay **dos personas** con el módulo, no
una. **`Angela` (la otra secretaria) NO lo tiene**; su override trae `cxc` en su lugar, que
`role_permissions.secretaria` tampoco incluye. Los 11 usuarios activos son: `daniel` ·
`alberto` (admin) · `Bodega` · `Contabilidad` · `jennifer` (gerente_acs) · `david`
(gerente_boston) · `andrea` · `Angela` (secretaria) · `edwin` · `rey` · `rodrigo` (vendedor),
**los 11 con contraseña bcrypt**. `hasModuleAccess` (`src/lib/auth-check.ts`) deja pasar a cualquiera cuyo `fg_modules`
contenga la key, así que Andrea entra a la pantalla completa aunque el `roles[]` del módulo
en `modules.ts` diga solo `["admin","gerente_acs"]`. **Esto no está en la tabla de Roles de
`CLAUDE.md`.**

**Qué ve Jennifer de distinto que un admin: casi nada, a propósito.**
- La ventana de fechas se levantó el 13-ago-2026 (*«abrile Multifashion completo»*): ve todo
  el histórico, igual que admin. Candado `multifashion-acceso.test.ts` exige que las 10
  llamadas con períodos viejos devuelvan **200 y el payload byte a byte igual** al de admin.
- **No ve el botón «Actualizar ahora»**: `SyncNowButton` tiene su propio gate de UI con
  `ROLES_DEFAULT = admin + secretaria` (`src/components/shared/SyncNowButton.tsx:110-114`).
- **No puede crear ni editar metas**: `puedeEditarMetas` = solo `admin`
  (`src/lib/multifashion/metas-permiso.ts`). Ver ≠ editar, y va aparte a propósito — ella
  comisiona por la tienda **y** por sus ventas personales, así que editar metas sería
  editarse su propio objetivo.
- Todo lo demás (Caja, Productos, Clientes, Bonos, Vendedoras) es idéntico.

**Rutas que le contestan 403 a `gerente_acs`** — probado por CONDUCTA con cookie firmada en
`multifashion-acceso.test.ts`, y encima se verifica que a `admin` sí lo dejen entrar (sin eso
el 403 no probaría nada): Ventas, Proveedores, Gastos–saldos, Gastos–egresos, Marketing, Caja
Menuda, Packing Lists, Directorio, Asistencia. Sin cookie → **401**, no 403.

**Aterrizaje**: `getVisibleModules("gerente_acs")` devuelve un solo módulo, así que el
auto-redirect de `/home` («rol con UN solo módulo → llévalo ahí») la manda a `/multifashion`.
No tiene `MODULO_CASA_POR_ROL` — no le hace falta mientras tenga un módulo solo.

## Las pantallas

Todo vive bajo `/multifashion`. Un solo route; el sub-tab va en la URL (`?subtab=`), el mes
en `?mfMes=`, el rango de Clientes en `?mfCliRango=`. Los sub-tabs viejos `overview` y `mes`
se normalizan a `resumen` para no romper deep-links (`MultifashionView.tsx:63`).

### El encabezado (siempre visible) — `MultifashionShell.tsx`

- **«American Classics»** — el nombre comercial, de `app_settings.multifashion_tienda`. El
  módulo se llama Multifashion pero la tienda se conoce por su otro nombre.
- Píldora **«Sincronizado …»** (`<SyncStatus tabla="facturas" empresasEsperadas={["american_classic"]} />`).
- Botón **«Actualizar ahora»** — solo admin/secretaria. Un clic = sync de facturas de
  `american_classic` (mismo candado y cooldown que el endpoint). Al terminar revalida el
  overview y sube `syncTick` para que el Resumen re-pida el detalle del mes.
- **Selector de año** (arriba a la derecha, 44 px de alto). La lista sale de
  `fetchAvailableYears()`; con el año cambiado solo cambia la key de SWR.

### Tarjeta «Hoy» — `VentaHoyCard.tsx` (arriba de los sub-tabs)

Lo primero que se ve. Pedido de Daniel: *«quiero ver también venta del día en multifashion»*.

- **Qué se ve**: el monto del día (retail, NC restadas), el día en letras («viernes 4 de
  septiembre»), la comparación grande contra **el mismo día de la semana pasada (−7 días)** y
  la chica contra **ayer**, y SIEMPRE la hora del último sync.
- Con más de **3 h** de rezago (`REZAGO_MS`) la tarjeta se pone ámbar y dice *«sin actualizar
  desde las …»*. Sin poder confirmar la hora, lo dice — nunca inventa una.
- Con `documentos === 0` escribe **«Todavía no hay ventas hoy»**, no «$0». Un día que vendió
  y devolvió todo sí muestra $0 (es un cero de verdad).
- Antes de las **7 p.m. de Panamá** rotula el día como **en curso**, para que comparar «hoy
  hasta ahora» contra «el viernes pasado completo» no se lea como un desplome.
- No tiene controles: es solo lectura. `revalidateOnFocus` sigue **encendido** aquí a
  propósito (`docs/historico/superado.md`).

### Sub-tab 1 · **Resumen** — `MultifashionResumenView.tsx` (978 líneas)

Es la fusión de los antiguos «Overview» y «Detalle mensual». Usa el **selector de mes** con
flechas ‹ › que vive en `MultifashionView`.

Bloques, en orden:
1. **Titular del mes**: «Ventas del mes · <Mes> <año> · al día N» + el monto en 30 px
   (**retail puro**), y debajo la nota *«no incluye $X de mayoreo · <cliente>»* cuando hubo
   mayoreo. A la derecha, dos comparativos: **«vs mes anterior»** y **«vs <mes> <año−1>»**.
   Pie: `N tickets retail · ticket promedio $X · proyección cierre $Y` (mes en curso) o
   `margen tienda N%` (mes cerrado).
2. **«Panorama del año <año>»** — colapsable (**«Ver» / «Ocultar»**). Tres KPI:
   `VENTAS <Ene–Mes>` · `PROYECCIÓN CIERRE <año>` (o `CIERRE <año>` si no hay proyección) ·
   `MARGEN BRUTO · TIENDA`.
3. **Gráfico** con interruptor **Mes / Año**: «Ventas día por día» (barras del mes + línea del
   mismo mes del año anterior) o «Ventas acumuladas <año> vs <año−1>».
4. **Comparativo interanual mes a mes** — la tabla que costó el arreglo de los números
   pegados (30-jul-2026): Mes · monto año actual · monto año anterior · Δ. En celular va en
   **dos líneas**; el aire entre montos es exactamente `gap-x-4` = 16 px.
5. **Banda de 3 tarjetas**: «Mejor / peor día» · «Mejor día de semana» · «Hora pico».

*Tarea más frecuente — «¿cómo vamos este mes?»*: abrir `/multifashion` (Jennifer aterriza
sola) → **1 vistazo** a la tarjeta Hoy → el Resumen ya está abierto en el mes por defecto.
**Cero clics.** El mes por defecto es el **último con datos que no sea el mes calendario en
curso**, y cuando eso pasa la pantalla lo dice bajito: *«último mes cerrado · <mes> en curso»*.

### Sub-tab 2 · **Vendedoras** — `VendedorasSubtab.tsx`

- **Chips de período** (control propio, ignora el selector de mes): `<Mes> (en curso)` ·
  `<Mes> (cerrado)` · `YTD <año>` · `Últimos 3 meses` · `Últimos 6 meses` · `Últimos 12 meses`.
- **Banner del bono de gerente** (`BonosSection.tsx`), una línea: crecimiento de la **tienda
  completa (retail + mayoreo)** contra el mismo mes del año anterior. Regla escrita en el ⓘ:
  **≥5% y <10% → $50 · ≥10% → $100**.
- **Una sola tabla**: `#` · **Vendedora** · **Tickets** · **Ventas** · **Ticket prom.** ·
  **Δ <rótulo>** · **Comisión**. Ordenable por columna. Badges junto al nombre:
  `🏆 Bono $50` (mejor vendedora del mes) y `Gerente` / `✓ Bono $X`.
- 🔴 **El rótulo de la Δ dice contra qué compara de verdad**: en los dos chips de MES la RPC
  compara contra el **MES ANTERIOR**, así que dice **«Δ vs julio 2026»** y no «vs año pasado»
  (decisión de Daniel del 3-sep-2026: arreglar el rótulo, no la comparación). YTD y las
  ventanas de N meses sí comparan contra el año pasado y lo dicen. Fuente única:
  `src/lib/multifashion/vendedoras-rotulo.ts`.
- Debajo, **«Metas»** (`MetasEnVendedoras.tsx`): con una meta grupal viva, cuánto **aportó**
  cada participante al avance. **Sin podio, sin medallas, sin 1º/2º/3º** — el premio es
  colectivo y un ranking daría dos mensajes contradictorios.
- El corte de layout es **`lg` (1024)**, no `md`: el ancho ÚTIL manda (la barra lateral se
  lleva 224 px). `minWidth` de la tabla = **720** (era 760 y forzaba 18 px de arrastre a 1024).

### Sub-tab 3 · **Productos** — `ProductosSubtab.tsx` (1.541 líneas, la pantalla más grande)

Período propio: píldora **Mes** / **Últimos 12 meses** (default **12m**). Con «Mes» reaparece
el selector de mes compartido con el Resumen.

Orden de arriba abajo = el orden en que un dueño pregunta:
0. **Marcas** — tarjeta siempre visible con venta, % y **margen** de cada marca, y **es el
   filtro** de toda la pantalla. Las 5 marcas reales: Tommy Hilfiger · Calvin Klein ·
   Karl Lagerfeld · Reebok · Joybees (+ **Otros**). Ámbar en la marca cuyo margen está por
   debajo del general del período.
1. **Cómo vamos** — unidades, venta, utilidad y margen del período, cada uno con su cambio
   contra el mismo período del año pasado.
2. **Qué se vende más** y **qué deja más plata**, en dos listas separadas con barra
   proporcional (medida contra el **líder de su lista**, no contra el total).
3. **Qué se vende mucho y deja poco** (alerta ámbar de margen).
4. **Lo que más cambió** contra el año pasado, **en dólares**.
5. **«Ver todo»** — la tabla completa: buscador, filtro por categoría, orden por columna,
   paginado. Agrupadores: **Categoría · Artículo · Departamento**. Orden por defecto:
   **Unidades**.

Textos fijos: *«Ventas netas: las devoluciones (notas de crédito) ya están restadas.»* ·
*«Comparado con <desde> – <hasta> (los mismos días del año pasado, para que sea comparable)»*
· *«no se vendía el año pasado»* cuando la marca no existía.

### Sub-tab 4 · **Clientes** — `ClientesMultifashionSubtab.tsx` (900 líneas)

Filtro de período **propio** (`?mfCliRango`): **Mes · 3 meses · 6 meses · 12 meses**. El
mes/año del shell ancla el FIN del rango.

- **4 tarjetas de fidelización** (snapshot de HOY, independiente del rango): **Frecuentes**
  («2+ visitas en 90 días») · **Nuevos del mes** («registrados este mes») · **Dormidos**
  («60+ días sin comprar») · **5% pendiente** («sin segunda visita»).
- **Chips de segmento**: `Todos` · `Frecuentes` · `Dormidos` · `5% disponible`.
- **Sección «Mayoreo»** — clientes con `is_wholesale = true`. Subtítulo: `N clientes · $X · N tickets`.
- **Sección «Clientes identificados»** — ranking retail por monto. Subtítulo:
  `N% de las ventas retail · top N por monto · N con nombre`. El bucket
  **«Anónimos (mostrador)»** (CONTADO / CONSUMIDOR FINAL) va **aparte**.
- Columnas: `#` (posición en el ranking, **no** un id) · Cliente · Total · Tickets · T. prom ·
  Última · estado del 5% (`Usado ✓` / `Disponible`) · WhatsApp (44 px). Un clic expande el
  sparkline mensual del cliente (uno a la vez).
- El corte es **`lg`**: por debajo, tarjetas. 🩸 Con la grilla vieja a 390 px quedaban **288 px
  fuera de la pantalla sin forma de alcanzarlos** y la columna «Cliente» colapsaba a 0 px.

### Sub-tab 5 · **Caja** — `CajaSubtab.tsx`

Cuadre diario contra Switch. Selector de **día** propio (default hoy); no usa año ni mes del
shell.

- Se ve: **Gran total del día** · **Ventas** · **Notas de crédito** · **ITBMS neto**
  («impuesto ventas − NC») · **Formas de pago** (tabla con Total).
- *«Sin movimientos este día»* cuando no hubo.
- *«Switch no respondió — mostrando último dato»* cuando la llamada falla y hay caché.
- La gerente compara el gran total y el desglose por forma de pago contra lo contado
  físicamente al cierre. **Es la única pantalla del módulo que habla con Switch EN VIVO.**

### Sub-tab 6 · **Metas** — `MetasSubtab.tsx` + `MetaAvanceCard.tsx` + `MetaFormModal.tsx`

- Arriba, la **tarjeta de la meta viva**: cuánto llevamos (monto grande + barra), cuánto falta,
  y **«así como vamos, ¿llegamos?»** — la proyección, con la línea que explica de dónde sale
  (*la cuenta toma en cuenta que diciembre es el mes fuerte*). `Premio: <texto>`.
- Con menos del **5%** de la temporada transcurrida: *«todavía es muy pronto para saber si el
  ritmo alcanza»*. **No se inventa un número.**
- Debajo, los **aportes** de las participantes y, si corresponde, la línea *«El 4% que falta
  son ventas hechas con el código de alguien que no está en esta lista — casi siempre, gente
  que ya no trabaja aquí. Cuentan para la meta igual.»*
- **Metas terminadas**: al pie, una línea cada una, desplegable.
- Botón **«+ Nueva meta»** — **solo admin**. El formulario (`MetaFormModal`) pide: nombre,
  desde, hasta, **Tipo de meta** (grupal / por vendedora), monto, premio, monto del premio y
  **participantes elegidos de una LISTA** (nunca escritos). La lista trae a todo el que
  vendió, con su venta de 12 meses y su última venta al lado, y **dice cuándo alguien está
  escrita de varias formas en Switch**.
- Estados de instalación: si `leerMetas()` devuelve `null` la pestaña se dibuja igual y dice
  en **ámbar** *«Las metas todavía no están instaladas…»* — no en rojo.

## Los datos

Grano, llave, filas medidas el 4-sep-2026.

### `_multifashion_sf_vw` — VISTA, la fuente de todo lo que es «venta» en el módulo

Proyección de `switch_facturas WHERE empresa_key = 'american_classic'`. **29.708 filas** ✅
(re-medido el 5-sep-2026: `select count(*) from _multifashion_sf_vw` = 29.708, exactamente
las mismas que `switch_facturas` de ACS — la vista no filtra filas, solo proyecta columnas).
Definición vigente en `supabase/migrations/20260623140000_multifashion_idx_fecha_panama.sql`.

| Columna | Para qué sirve | Quién la lee |
|---|---|---|
| `empresa` (literal `'american_classic'`) | marca de agua | nadie la filtra (la vista ya está acotada) |
| `anio`, `mes`, `fecha` | día de **calendario de Panamá** (`mf_panama_date(fecha)`) | todo |
| `n_sistema` (= `switch_factura_id::text`) | llave estable de paginación | `leerRetailRango`, `metas-lectura` |
| `vendedor` (= `vendedor_nombre`) | agrupar por vendedora | `multifashion_vendedoras_v3`, `multifashion_meta_ventas_v1` |
| `cliente` (= `cliente_nombre`) | rankings de clientes | RPC de clientes |
| **`subtotal`** | **`subtotal_descuento` FIRMADO**: Factura/Tiquete/Transacción/ND positivo, **NC negativo**, cualquier otro tipo **0** | TODO el módulo |
| `total` | con ITBMS | prácticamente nadie: el módulo mide sin impuesto |
| `is_wholesale` | separa mostrador de mayoreo | todo |
| `tipo_comprobante` | trazabilidad | las RPC |
| `_row` (constante `1`) | 🔴 **nadie lo lee** — resto de una versión anterior | — |
| `fecha_ts` | timestamp UTC crudo, para hora del día | `multifashion_horas_pico_v1` |
| **`subtotal_comision`** | igual que `subtotal` pero **solo si `condicion_venta = 'Contado'`** (crédito NO comisiona; las NC restan siempre) | la columna **Comisión** de Vendedoras |

🩸 **`subtotal` ≠ `subtotal` de `switch_facturas`.** El de la tabla es **antes** del descuento.
Factura real: `354,10 − 221,01 = 133,09`. Usar el otro **infla la meta ~5%**.

### `switch_articulo_diario` (filtrado a `american_classic`) — **46.187 filas** ⚠️

Una fila por `(empresa_key, fecha, articulo_id, tipo)`. Guarda **magnitudes**; el signo lo pone
la lectura (`signoDeTipo`, `TIPO_QUE_RESTA = "NC"`). Columnas que el módulo usa:
`articulo_id, codigo, descripcion, tipo, cantidad_total, venta_total, costo_total`.
**Llega hasta AYER** — re-medido el 5-sep-2026: `max(fecha) = 2026-09-04`
(`select count(*), max(fecha) from switch_articulo_diario where empresa_key='american_classic'`
→ 46.187 · 2026-09-04). Eran 46.100 el 4-sep.

⚠️ **Y esta tabla SÍ tiene a Confecciones Boston: 18.064 filas, también hasta el 4-sep**, con
costo (`sum(costo_total)` de 2026 = **$470.421,08**, en magnitudes sin firmar). Importa porque
la pestaña Ventas de Boston dice en pantalla que «no se trae el costo desde Switch» — ver la
corrección #12 al final.

### `switch_articulo_marca` (`american_classic`) — **8.736 filas** ⚠️

`articulo_id → marca_id, marca_nombre`. ⚠️ **Todas son de ACS**: las 6 del grupo tienen CERO.
Lo que Switch llama «marca» es **marca + departamento** (`TH MENSWEAR`, `CK JEANS`):
⚠️ **34 valores distintos** (no 32), donde hay **5 marcas**. Re-medido el 5-sep-2026
(`select marca_nombre, count(*) from switch_articulo_marca where empresa_key='american_classic'
group by 1`): los tres más grandes son `TH MENSWEAR` 1.301 · `TH ACCESSORIES` 1.223 ·
`TH WOMENSWEAR` 824, y en la cola están las grafías malas que prueban por qué el mapa
compara la primera palabra y junta AL MOSTRAR: **`TH ACCESORIES`** (una sola S, 117 filas)
al lado de `TH ACCESSORIES`, **`TH OTHER`** (103) y **`TH OTHERS`** (6), **`CK WOMEN`** (3) y
`CK WOMENSWEAR` (74). Los prefijos vivos son `TH · CK · KL · RBK · JOYBEES`; `OTROS` (11) y
`FOOTWEAR` (7) caen solos en el cajón «Otros». El mapa prefijo → marca es explícito
(`src/lib/multifashion/marcas-grupo.ts`), por **primera palabra completa** y nunca `startsWith`.

### `switch_clientes` (`american_classic`) — **1.038 filas** ⚠️

Directorio de la tienda. La escribe el cron `acs-fidelizacion`. Se leen
`cliente_switch_id, nombre, telefono, celular, raw_data.fechaCreacion`.
`cliente_switch_id = 1` es el mostrador y se excluye de todo.
✅ **Se está escribiendo**: `max(synced_at) = 2026-09-05 11:30:29 UTC` (el cron
`acs-fidelizacion` de las 11:30 corrió hoy). Es el contraste exacto contra Boston, que en la
misma tabla lleva 37 días sin una escritura.

### `multifashion_metas` — **1 fila viva**

`id uuid · nombre · desde date · hasta date · objetivo numeric · tipo ('grupal'|'vendedora') ·
premio text · premio_monto numeric · activa bool · creada_por text · created_at · updated_at ·
deleted bool`.

✅ **Re-medido el 5-sep-2026, sin un solo cambio**
(`select nombre,desde,hasta,objetivo,tipo,premio,premio_monto,activa,creada_por,created_at,
updated_at,deleted from multifashion_metas`): **«Viaje playa» · 2026-09-01 → 2026-12-31 ·
$420.000,00 · grupal · premio «Un viaje para todas» · `premio_monto = NULL` · `activa = true` ·
`deleted = false` · creada por `daniel` el 14-ago-2026 06:22:20 UTC, con `updated_at` idéntico
al `created_at`** (nunca se editó). Soft delete `deleted` (una meta anunciada al personal no se borra, se retira).
🔴 **`premio_monto` está vacío en la única fila que existe** — el formulario lo ofrece y nadie
lo llenó.

### `multifashion_meta_participantes` — **4 filas**

`id · meta_id (ON DELETE CASCADE) · vendedora_clave · vendedora_nombre · objetivo_individual ·
created_at`. ✅ Re-medido el 5-sep-2026 (`select vendedora_clave, vendedora_nombre,
objetivo_individual from multifashion_meta_participantes`): **JAILINE · JENNIFER MIRANDA ·
MILAGROS TORRES · SHEYNEE BATISTA**, las cuatro con **`objetivo_individual = NULL`**
(correcto: en una meta grupal no se reparte nada).
Reemplazo completo al guardar (DELETE + INSERT acotado con `.eq("meta_id")`).

### `multifashion_caja_diaria` — **8 filas**

`fecha date (llave) · data jsonb (la respuesta cruda de Switch) · synced_at`. Upsert por
`fecha`. Día cerrado = caché permanente; día en curso = **TTL 10 min**.
🔴 **Última escritura: 14-ago-2026 06:20:58 UTC**, re-verificada el 5-sep-2026
(`select fecha, synced_at from multifashion_caja_diaria order by synced_at desc limit 3`
→ 2026-08-14 · 2026-08-05 · 2026-08-03). O sea que **la pestaña Caja lleva 22 días sin
abrirse** — es la única medición de uso por pantalla que este módulo permite.

### `multifashion_tickets` — **15.819 filas, CONGELADA**

Copia derivada de las facturas de ACS. **Cero lectores** (auditados TS, 57 RPC, 15 vistas,
migraciones, scripts, `vercel.json` y el backup). Su cron se retiró el 26-jul-2026. Los datos
**no se borraron**. Candado: `multifashion-tickets-congelada.test.ts` pone el build rojo si
alguien vuelve a escribirla.

### `app_settings` — 7 claves, todas de este módulo

| clave | valor | ¿la lee alguien? |
|---|---|---|
| `multifashion_tienda` | `"American Classics"` | sí — el encabezado |
| `multifashion_ubicacion` | `"Chiriquí"` | 🔴 **viaja en el payload (`Multifashion.ubicacion`) y ninguna pantalla lo pinta** |
| `multifashion_manager` | `"Jennifer Miranda"` | sí — `Multifashion.manager`, y el bono de gerente |
| `multifashion_managers` | `["Jennifer Miranda"]` | sí — el badge «Gerente» de la tabla |
| `multifashion_bono_top` | `50` | la RPC de bonos |
| `multifashion_meta_anual_2026` | `800000` | 🔴 **la lee `multifashion_mensual_v6/v7` y viaja como `Multifashion.metaAnual` — ninguna pantalla lo dibuja.** Y **no es la meta de Daniel** ($420.000 sep–dic): son dos números distintos y sin relación |
| `multifashion_growth_target_pct` | `5` | alimenta `expectedTodayPct`, que **tampoco se dibuja** |

### Las funciones del módulo — ⚠️ **son 21, no 18** (re-verificadas en `pg_proc` el 5-sep-2026)

Consulta: `select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where
n.nspname='public' and (p.proname like 'multifashion%' or p.proname like 'mf_%' or p.proname
like 'proyeccion_%')`.

`multifashion_mensual_v7` (con caída a `_v6`) · `multifashion_overview_serie_v1` ·
`multifashion_proyeccion_cierre_v1` · `multifashion_detalle_mensual_v2` ·
`multifashion_horas_pico_v1` · `multifashion_margen_tienda_mensual_v2` (con caída a
`multifashion_margen_tienda_mensual`) · `proyeccion_mensual_retail_v1` ·
`multifashion_vendedoras_v3` · `multifashion_vendedoras_range` · `multifashion_bonos_v3` ·
`multifashion_wholesale_clientes_v2` · `multifashion_retail_recurrentes_v2` ·
`multifashion_articulo_diario_agrupado_v1` · `multifashion_articulo_marca_v1` ·
`multifashion_meta_ventas_v1` · `multifashion_hoy_panama` · `mf_panama_date` ·
`multifashion_tienda_vc_hibrido` · **`proyeccion_mensual_mayorista_v1`** (la que faltaba).

⚠️ **Falta una en la lista de arriba: `proyeccion_mensual_mayorista_v1`** — está instalada en
producción y **no la llama nadie desde `src/`**. Lo único que la nombra es un comentario de
`src/lib/ventas/queries.ts:126` que la da por retirada (dice que las dos «se quitaron»)… pero su hermana `proyeccion_mensual_retail_v1` **sí sigue
viva y llamada** (`detalle-mensual/route.ts:103`), y la mayorista quedó huérfana en la base. Es la
misma familia que las «metas fantasma».

⚠️ **`multifashion_tienda_vc_hibrido` existe en producción y no la llama nadie desde `src/`**
(re-verificado el 5-sep-2026: `grep -rl` sobre `src/` sin tests → 0 archivos).
⚠️ **`multifashion_dia_a_dia_v4` NO existe** en `pg_proc` (el comentario de
`detalle-mensual/route.ts:11` dice que «sigue viva»; se dropeó). **`multifashion_bonos_v1`
tampoco** — y se la nombra en **TRES** lugares, no en uno: `bonos/route.ts:2`,
`src/components/ventas/types.ts:306` y `types.ts:341`. El código llama a `_v3`.

## De dónde vienen los datos

Todo lo de Multifashion sale de **Switch por el API JSON con token** (`client.ts`), con **una
sola excepción**: nada entra por el panel web. Ver `docs/switch-flujo.md` §1, §5, §6, §12, §15.

| Dato | Endpoint de Switch | Vía | Cron y hora UTC | Cae en | Qué se descarta |
|---|---|---|---|---|---|
| Facturas y tiquetes de ACS | `GET /apifactura/lista` + `GET /apinotacredito/lista` + `GET /apinotadebito/lista`, con `desde/hasta/porPagina/paginaActual` (ventana 7 días) | **API** | `switch-sync tipo=all` 06:30 (con Boston) + `tipo=facturas` **11:50 · 13:00 · 15:00 · 17:00 · 19:00 · 21:00 · 23:00 · 00:15** — las de las horas impares son **solo ACS** | `switch_facturas` → vista `_multifashion_sf_vw` | **`urlswitchpay`** (queda solo en `raw_data`). Las notas no traen `tipoComprobante`: el sync lo escribe a mano |
| Ventas por artículo y día | `GET /apireporte/ventasucursal?sucursalId&fecha&porPagina&paginaActual` (un día por llamada) | **API** | `switch-articulos` **08:40**, ventana de 3 días hacia atrás, las 8 empresas | `switch_articulo_diario` | 🩸 **este reporte NO trae notas de débito** (por eso el costo del Resumen del grupo va por otro lado) |
| Diccionario de marcas | `GET /apiarticulos/lista?marcaId=` | **API** | el mismo `switch-articulos` 08:40 | `switch_articulo_marca` | todo salvo `articulo_id, marca_id, marca_nombre` |
| Caja del día | `GET /apireporte/diarioventas?sucursalId=1&desde&hasta` — **`hasta` es EXCLUSIVO** (día D ⇒ `desde=D, hasta=D+1`; con `desde=hasta` responde ceros) | **API** | **ningún cron: a demanda**, desde la pestaña | `multifashion_caja_diaria` (caché) | `totalDescuentos` no es confiable (≈ `granTotal`) |
| Fidelización (directorio + uso del 5%) | `GET /apicliente/lista` + `GET /apifactura/info` por factura (tope 200 por corrida) | **API** | `acs-fidelizacion` **11:30** y **16:30** (la 2ª es «segunda oportunidad»: no-op si la 1ª salió bien) | `switch_clientes` + `switch_facturas.descuento_global_pct` | — |
| Costo del día (para el margen tienda) | `GET /apireporte/totalventas?tipo=03` | **API** | dentro de `switch-sync tipo=all` 06:30 | `switch_costo_diario` | **no se muestra en ninguna pantalla del módulo** |
| El resumen de las 8 p.m. | — (deriva de lo anterior) | — | `acs-resumen-diario` **01:00** | Telegram | — |

⚠️ **La sesión de Switch es por USUARIO, no por empresa** (PDF `docs/switch/api-documentacion.pdf`
p. 6). El sistema entra como `daniel`, así que **cada corrida sobre ACS expulsa a Daniel del
panel de Multifashion**, y si Daniel está adentro el cron recibe `0006` y re-loguea. Por eso
los crons de ACS van a ≥15 min entre sí: `acs-fidelizacion` 11:30 está a 20 min de
`facturas-1150`, y `sync-recibos` 15:15 va 15 min DESPUÉS de `facturas-1500`.
**La pestaña Caja también consume sesión**: cada día sin caché es un login de ACS que puede
chocar con un cron. Ese es todo el motivo por el que existe `multifashion_caja_diaria`.

**Si la fuente falla:**
- **Facturas** — el módulo entero se queda en el número del último sync, y la tarjeta «Hoy» lo
  dice en ámbar pasadas 3 h. La reconciliación (10/14/18 UTC) reintenta.
- **`switch_articulo_diario`** — Productos queda con el último día cargado; el comparativo se
  corta con `ultimoDiaArticuloDiario`, así que **no se infla**, se acorta.
- **Diccionario de marcas** — `marcaDisponible = false`, no se dibuja el filtro y la pantalla
  queda **exactamente como estaba** (fail-open explícito).
- **Comparativo de Productos** — `comparativo: null`, la pantalla se dibuja completa sin deltas
  y el error viaja en `comparativoError`.
- **Caja** — con caché sirve el caché con `stale: true`; sin caché, HTTP **502** y el texto
  *«No se pudo consultar Switch. Intenta de nuevo en unos segundos.»*
- **Metas** — `leerRitmoMeta` **falla abierto**: el Telegram sale sin la línea 🎯.

## Las reglas que ya están fijadas

| Regla | Dónde está escrita | Candado |
|---|---|---|
| ✅ **Multifashion ES `american_classic`.** La empresa es una constante del servidor y **no se lee de la URL** en ninguna de las 11 rutas. **Re-verificado el 5-sep-2026**: `find src/app/api/multifashion -name route.ts` da exactamente **11** rutas, y `grep -rn "searchParams.get(\"empresa\")"` sobre esas 11 (y sobre las 4 de `/api/boston`) devuelve **cero coincidencias**. | `productos/route.ts:const EMPRESA`, `caja/route.ts:const EMPRESA_KEY`, las RPC | `multifashion-acceso.test.ts` — «la empresa NUNCA viaja por query» |
| **Ninguna ruta del módulo queda abierta**: las 11 exigen sesión y rol. Un archivo nuevo en el árbol rompe el build. | inventario congelado | `multifashion-acceso.test.ts` — «el inventario de rutas es el esperado» |
| **La ventana acotada de `gerente_acs` se retiró ENTERA** (13-ago-2026). Ninguna ruta importa `ventana-gerente` (el módulo ya no existe). | — | `multifashion-acceso.test.ts` — «la ventana se retiró de VERDAD» |
| **La validación de parámetros NO era la ventana y se queda**: `year` 2000–2100 · `mes` 1..12 · `trimestre` 1..4 · `periodo` en su lista cerrada · `n ∈ {3,6,12}` · `limit` 1..500 · formato `YYYY-MM-DD` · «la fecha no puede ser futura». | cada route | `multifashion-acceso.test.ts` — «los parámetros absurdos SIGUEN rechazándose» |
| 🔴 **Las notas de crédito RESTAN.** La firma de haberlas sumado es que la diferencia da **exactamente el doble** de las devoluciones. Medido el 8-ago-2026: 48 facturas $2.718,44 + 2 NC $98,75 → crudo $2.817,19, correcto **$2.619,69**, diferencia $197,50 = 2×98,75. | `_multifashion_sf_vw` (SQL) y `signoDeTipo()` (TS) | `multifashion-venta-hoy.test.ts`, `multifashion-productos-lectura.test.ts` |
| 🔴 **El signo se pone UNA vez.** Las RPC de agregación devuelven **magnitudes** y nunca firman: `multifashion_articulo_diario_agrupado_v1` y `multifashion_meta_ventas_v1` suman en crudo y el signo lo pone el código. | los SQL | mutación «firmar las NC en el SQL rompe 7 tests» |
| 🔴 **La venta de HOY se calcula UNA vez y la usan los DOS consumidores** (la tarjeta y el Telegram de las 8 p.m.): `leerRetailRango` en `src/lib/multifashion/retail-dia.ts`. | — | `multifashion-venta-hoy.test.ts` corre los dos consumidores sobre las mismas filas y exige el mismo centavo; **más un barrido estático** que pone el build ROJO si `acs-resumen-diario.ts` vuelve a tener su propio `.from("_multifashion_sf_vw")` |
| **El monto NUNCA se muestra sin su frescura.** No hay rama que pinte el número sin la hora del último sync. | `VentaHoyCard.tsx` | `multifashion-venta-hoy.test.ts` (lee el componente) |
| **`$0` y «todavía no hay ventas» no son lo mismo**: la bandera es `documentos > 0`, **no el monto**. | `venta-hoy.ts:hayVentas` | mutación «mirar el monto en vez de los documentos rompe 1» |
| **El titular compara contra el MISMO DÍA DE LA SEMANA PASADA (−7 días)**, no contra ayer. | `diasComparativos()` | mutación «comparar contra ayer rompe 6» |
| **Panamá es UTC−5 fijo.** `hoyPanama` / `fechaPanamaDe` / `mf_panama_date`. Los tests usan fechas FIJAS (`vi.setSystemTime`), nunca `new Date()`. | `src/lib/fecha-panama.ts` | mutación «calcular hoy en UTC rompe 3» |
| **Un mes empezado se compara contra los MISMOS DÍAS del año pasado**, y «los mismos días» son los **CARGADOS** en `switch_articulo_diario` (llega hasta ayer), no «hasta hoy». Medido el 3-sep-2026: septiembre decía +4,2% y crecía **+46,1%**. | `ultimoDiaArticuloDiario` es parámetro **obligatorio** de `rangoComparativo` | `api/multifashion-productos-corte-cargado.test.ts`, `mismos-dias-todas-las-comparaciones.test.ts` |
| **Vendedoras es la EXCEPCIÓN a propósito**: en los chips de mes compara contra el **mes anterior** y el rótulo lo dice. | `vendedoras-rotulo.ts` | `multifashion-vendedoras-rotulo.test.ts` |
| **El mes en curso corta en el último día COMPLETO de Panamá**, y el card y la tabla usan la MISMA definición. La regla es de **CALENDARIO, no de datos**. | migración + módulo | `multifashion-corte-dia-completo.test.ts` |
| 🔴 **La proyección de una meta pesa por TEMPORADA, no por días.** `proyección = vendido ÷ (temporada transcurrida ÷ temporada total)`, con el peso de cada día sacado de lo que ESE MES vendió el año pasado. Diciembre es el **58,8%** de sep–dic. ✅ **Re-medido al centavo el 5-sep-2026** (`select extract(month from fecha), sum(subtotal) from _multifashion_sf_vw where not is_wholesale and fecha between '2025-09-01' and '2025-12-31' group by 1`): sep $36.430,41 (10,7%) · oct $46.429,63 (13,6%) · nov $57.580,78 (16,9%) · **dic $200.257,73 (58,8%)** sobre $340.698,55. | `metas-avance.ts` | `multifashion-metas.test.ts` (92 casos) |
| ✅ **Por debajo del 5% de temporada transcurrida NO se proyecta** y se dice. Sin año pasado se cae a los días **y la pantalla lo dice**. Verificado en el código el 5-sep-2026: `FRACCION_MINIMA_PARA_PROYECTAR = 0.05` (`metas-avance.ts:51`). | `FRACCION_MINIMA_PARA_PROYECTAR` | ídem |
| 🔴 **Una meta grupal mide TODA la venta de la tienda.** Los participantes solo definen a quién se le MUESTRA el aporte. Medido may–jul 2026: tienda $147.737,77, las 4 vendedoras $141.705,00 = **95,9%**; el 4,1% restante son ventas con códigos de gente que ya no trabaja ahí. **Y la pantalla lo dice.** | `avanceDeMeta` + `textoAporteNoAsignado` | `multifashion-metas.test.ts` + `components/multifashion-meta-aporte-tienda.test.tsx` (9 casos que RENDERIZAN las dos pantallas) |
| 🔴 **Una meta grupal NO genera metas individuales.** Cero reparto automático, y **no hay `?? meta.objetivo`** de respaldo. | `metas-avance.ts` | barrido estático + conducta |
| **Los nombres de vendedora se agrupan por igualdad EXACTA normalizada** (`claveVendedora`: mayúsculas, sin acentos, espacios colapsados). **Nada de parecido ni distancia de edición.** | `metas-clave.ts` | `multifashion-metas.test.ts` |
| **Solo se excluye `DEFAULT`** (el marcador del sistema). **No hay lista negra de personas.** | `esClaveDeSistema` | ídem |
| **El cálculo y el permiso están SEPARADOS**: `avanceDeMeta` calcula siempre el período entero y no mira ni un rol; quién lo recibe se decide en `metas-permiso.ts`. | — | test que falla si `puedeEditarMetas` se ensancha |
| **La perilla `METAS_ABIERTAS_AL_ROL_ACOTADO` se BORRÓ, no se dejó en `true`.** Una perilla que ya no puede estar en `false` es una mentira. | — | candado que lo verifica |
| **El mapa prefijo → marca es EXPLÍCITO y compara la PRIMERA PALABRA COMPLETA.** Nada de `startsWith` (`THX SPORT` empieza con `TH` y no es Tommy). Lo desconocido cae en **«Otros»**, nunca se descarta. | `marcas-grupo.ts` | `multifashion-marcas-grupo.test.ts` (30 casos) + `components/multifashion-filtro-marca.test.tsx` (11 que renderizan) |
| **El filtro de marca NO es un parámetro de la ruta**: las filas ya leídas viajan particionadas en `porMarca` y el navegador filtra sin red. | `productos/route.ts` | el inventario de rutas no se mueve |
| **`db-max-rows` = 1000 corta EN SILENCIO**: toda lectura que pueda pasarlo usa `leerTodoPaginado` con `.order()` estable y verificación contra `count: "exact"`. El camino paginado **no es decoración** — sin él se leerían 1.000 de 20.483 filas sin un solo error. | `retail-dia.ts`, `productos/route.ts`, `fidelizacion/route.ts`, `metas-lectura.ts` | `supabase-paginado.test.ts` |
| **`multifashion_tickets` está congelada.** | — | `multifashion-tickets-congelada.test.ts` |
| **La metodología va en el ⓘ, los AVISOS van afuera.** Esconder «las devoluciones ya están restadas» en un ⓘ es igual de malo que borrarlo. | — | `poda-textos-cxc-multifashion.test.ts` (15 casos) |
| ✅ **Comisión = 0,5% sobre `subtotal_comision`** = solo las ventas de **CONTADO** (crédito no comisiona; las NC restan siempre). **Re-verificado el 5-sep-2026 leyendo la vista viva en producción** (`select pg_get_viewdef('_multifashion_sf_vw'::regclass, true)`): `subtotal_comision` = `subtotal_descuento` cuando `tipo_comprobante IN ('Factura','Tiquete','Transacción','Nota de Débito') **AND condicion_venta = 'Contado'**`, `−subtotal_descuento` para `Nota de Crédito`, y **0** para todo lo demás. La columna `subtotal` es la misma sin la condición de contado. ⚠️ `CLAUDE.md` sigue diciendo «`SUM(subtotal firmado) × 0,5%`, sin filtro de utilidad» y **le falta el matiz del contado**. | migración `20260603000000_multifashion_comision_solo_contado.sql`, y `multifashion_vendedoras_range` usa la misma base | — |

## Con qué conecta

### Qué lee de otros módulos

| Fuente | Para qué |
|---|---|
| `switch_facturas` (tabla del grupo) | **todo**, vía `_multifashion_sf_vw`. Es la misma tabla que alimenta Ventas del grupo — el módulo es una **vista** sobre ella, no una copia |
| `switch_articulo_diario` | Productos (y lo comparte con Ventas › Productos y con Ventas › Referencia) |
| `switch_costo_diario` | el margen tienda, vía `multifashion_margen_tienda_mensual_v2` |
| `ventas_rollup_mensual_mv` | ídem (`_v2` lee del rollup en vez de agregar en vivo) |
| `switch_sync_log` | la frescura de la tarjeta «Hoy» y la guardia anti-ruido del Telegram |
| `app_settings` | nombre de la tienda, ubicación, gerente, bono, metas fantasma |
| `src/lib/variacion` (`variacionPct`) | **todos** los porcentajes. Regla única de la app: **base < $100 → no hay porcentaje**. Reescribir la división aquí reproduciría el `+363024750%` |
| `src/lib/ventas/clientes-corte-comparativo.ts` | `unAnioAntes` (29-feb → 28-feb) para el ritmo de la meta |
| `src/lib/ventas/ultimo-dia-cargado.ts` | el corte del comparativo de Productos |

### Quién lee lo suyo

| Quién | Qué le lee | Cuidado |
|---|---|---|
| **Ventas › Resumen** (`ResumenView.tsx`) | una fila **«Multifashion»** = `american_classic` **COMPLETA (tienda + mayoreo)** | 🔴 **No es el mismo número que el módulo**, que muestra retail puro. ✅ **Medido el 5-sep-2026**: 2026 completa **$394.154,96** (idéntico al `ventas_rollup_mensual_mv` de `american_classic`) contra **$365.789,06** de retail puro — la diferencia son **$28.365,90 de mayoreo**. La fila lo declara con un desglose al lado. Si alguien «cuadra» los dos, rompe uno |
| **Ventas › Clientes** | **nada**: `EMPRESA_PILLS` deriva de `B2B_EMPRESA_KEYS` y ACS no está | los clientes de la tienda viven solo en su módulo (regla de Daniel) |
| **Ventas › Productos** | comparte `switch_articulo_diario`, pero ACS **no** está en `PRODUCTOS_EMPRESA_KEYS` | — |
| **Vista General** | la venta de ACS suma en los totales del grupo | *«sus ventas suman, pero sus clientes no se ven»* |
| **Home / `home-stats`** | vía `switch_ventas_unificado_vw` | — |
| **Telegram 📊 / 🔒** | el **resumen diario de ACS** sale por `enviarNegocioPrivado` (chat privado de Daniel, **sin** el prefijo `🔧 SISTEMA`) desde **DOS lugares que no pueden separarse**: el cron de la 01:00 y la recuperación de `switch-reconciliacion` | candado `acs-resumen-canal-privado.test.ts` exige que los dos apunten al mismo destino |
| **`clientes_master` / Directorio** | **nada**: el sync pide por INCLUSIÓN (`EMPRESAS_DEL_GRUPO`, las 6) | `clientes_master` no tiene `empresa_key`; meter a ACS ahí sería el bug de Boston otra vez |
| **Búsqueda global** | **nada de ACS** | — |
| **Comisiones (el módulo del grupo)** | **nada** — Multifashion es OTRO módulo de comisiones, con otra base. Que las dos digan «0,5%» es **coincidencia** | ⚠️ **NO fusionar** |

### Qué se rompería si se cambiara la forma de sus datos

- **Cambiar el signo de `subtotal` en `_multifashion_sf_vw`** → se rompen a la vez la tarjeta
  «Hoy», el Telegram de las 8 p.m., el Resumen, Vendedoras, Clientes y **el avance de la
  meta**. Todo el módulo cuelga de esa columna.
- **Renombrar `n_sistema`** → `leerRetailRango` (`retail-dia.ts:78`) y `metas-lectura.ts`
  pierden su orden de paginación y `leerTodoPaginado` empieza a repetir o saltear filas **sin
  error**.
- **Quitar `subtotal_comision`** → la columna Comisión de Vendedoras se cae en los seis chips.
- **Tocar `switch_articulo_diario`** → además de Productos, se rompen Ventas › Productos y
  Ventas › Referencia («Vendí»).
- **Borrar `app_settings.multifashion_manager`** → desaparece el badge «Gerente» y el bono de
  gerente se queda sin persona.
- **Dropear `multifashion_articulo_diario_agrupado_v1`** → **no se rompe**: la ruta cae sola al
  camino paginado y lo dice en el campo `fuentes` de la respuesta.

## Por qué está así

| Decisión | Cita y fecha |
|---|---|
| El módulo salió de ser una pestaña de Ventas y vive solo, con su propio selector de año | rediseño de jul-2026 |
| **Jennifer ve Multifashion COMPLETO** | Daniel, 13-ago-2026: ***«abrile Multifashion completo»***. Motivo escrito: la ventana no le tapaba información sensible sino el HISTÓRICO, y se le paga un bono por +10% de crecimiento que sin el año anterior no podía verificar |
| **La empresa nunca viaja por la URL** | «aceptarla por query le abriría desde su único módulo las otras 7 empresas del grupo» |
| **La venta del día en pantalla** | Daniel, 8-ago-2026: ***«quiero ver también venta del día en multifashion»*** — el número existía y solo llegaba por Telegram a las 8 p.m. |
| **Productos se rediseñó de planilla a respuesta** | Daniel, 7-ago-2026: ***«no me encanta, piensa como un CEO quisiera ver de manera simple rapida y minimalista y arreglalo asi»***. Ningún número cambió: solo la forma |
| **El filtro de marca arriba, un toque y no cuatro** | Daniel, 8-ago-2026: ***«y si quiero ver mis articulos top sellers? o descripciones top seller?»*** |
| **Las metas son configurables, no una meta hardcodeada** | Daniel, 13-ago-2026: ***«si armalo, en multifashion, y que sea configurable para el futuro hacer otras metas grupales y por vendedora (incluyendo a la gerente jennifer que comisiona por tienda y ventas personales)»*** |
| **Una meta grupal mide la tienda entera** | Daniel, 14-ago-2026: ***«la meta es de 420 del subtotal para la tienda. Mostrar aporte porcentual de cada vendedora de las 4 q están todos los meses»*** |
| **Las metas personales se escriben a mano** | Daniel: ***«las vendedoras no deberian de tener meta individual diferente cuando se abre una nueva meta…»*** y ***«Las metas personales las pongo yo a mano»*** |
| **Sin podio**: el premio es de todas o de ninguna | decisión escrita en `MetasEnVendedoras.tsx` |
| **La meta también va en el Telegram de las 8 p.m.** | Daniel, 3-sep-2026: ***«el mensaje de telegram igual que hoy en día solo que diciéndome si están qué porcentaje arriba o abajo para la meta, pero tienes que calcular bien cómo hacerlo para hacerlo accurate»*** y ***«es calcular 23% arriba del mismo día año anterior sumando todos los días pasados?»*** → sí |
| **El resumen diario va al chat PRIVADO** | Daniel, 2-sep-2026: ***«Solo me gustaría que las ventas de acs me lleguen solo a mí o por el chat de alertas, ya que ahí no está el celular de la empresa»***. Es **privacidad, no severidad** |
| **Los clientes de la tienda viven solo en su módulo** | Daniel, 30-jul-2026: ***«los clientes de multifashion q vivan solo en el modulo de multifashion… los de las otras empresas q si son un grupo, que conviva en todos lados»*** |
| **El rótulo de la Δ de Vendedoras se arregló, no la comparación** | Daniel, 3-sep-2026: ***«el rótulo (que diga "vs mes anterior", que es lo que hace)»*** |
| **Los departamentos mal escritos se juntan AL MOSTRAR, no en Switch** | aprobado por Daniel; corregirlos en Switch es tarea suya, aparte |

## Lo que se intentó y se retiró

| Qué | Por qué se fue | Cuándo |
|---|---|---|
| **`multifashion_tickets` + su cron** | era una COPIA de las facturas de ACS que ya viven en `switch_facturas`; **cero lectores** en todo el repo. El cron reescribía 183 filas/día con un request HTTP por fila para 0-6 cambios reales. **Los datos NO se borraron** (15.819 filas) | 26-jul-2026 |
| **`src/lib/multifashion/ventana-gerente.ts` entero** (6 clamps, `ventanaGerente`, `esRolAcotado`) y su candado `multifashion-ventana-gerente.test.ts` (77 casos) | se levantó la ventana de Jennifer | 13-ago-2026 |
| **`METAS_ABIERTAS_AL_ROL_ACOTADO`** | se borró en vez de dejarse en `true` | 13-ago-2026 |
| **La tabla de ranking propia de `BonosSection`** | quedó una sola tabla de vendedoras, con los badges de bono inline | rediseño v3, jun-2026 |
| **Sub-tabs «Overview» + «Detalle mensual»** | se fusionaron en **Resumen**; los deep-links viejos se normalizan | — |
| **`fallbackData` de SWR como «evita el re-fetch»** | es **falso**: `fallbackData` no puebla la caché y SWR revalida igual. `/api/multifashion/overview` (716 ms medidos) se repetía en cada carga. Se reemplazó por `opcionesDelServidor()` + `useSembrarDelServidor()` | ago-2026 |
| **`get_app_setting("multifashion_meta_anual_2026")` dentro de `fetchVentasResumen`** | una consulta por cada carga de `/ventas` para un número que **ninguna pantalla dibuja**, con la clave clavada en «2026» | ago-2026 |
| **`ventas_metas`** como tabla de metas | existe con 7 filas del 13-may-2026, pero su forma es `(empresa, anio, mes) → número`: no sabe de rangos libres, tipos ni participantes. **Se dejó intacta** (la lee la proyección de `/ventas`) y se creó `multifashion_metas` aparte | 13-ago-2026 |
| **La tolerancia «la tabla de metas no existe»** en el route | la DDL ya corrió; un permiso denegado o un timeout se leían como «todavía no está instalado» | 3-sep-2026 |
| **La tolerancia PGRST205 de la caja** | `multifashion_caja_diaria` existe; seguir sin caché son logins de más que matan tokens de crons | 3-sep-2026 |

🔴 **«Metas fantasma» confirmadas y NO tocadas** — código muerto ajeno al módulo:
`meta_efectiva` / `gap_vs_meta` / `meta_total` en `ventas_proyeccion_cierre_v7` (cero renders) ·
`ventas_meta_sugerida_v2(int)` instalada con cero llamadores · `ResumenKpis.metaAnualMultifashion` ·
`Multifashion.metaAnual` ($800.000) y `expectedTodayPct`, que viajan y no se pintan.

## Cuánto se usa

Medido el 4-sep-2026. ⚠️ `activity_logs` **solo registra logins y algunas escrituras** — no
clics ni pantallas vistas. Para este módulo eso significa que **no hay forma de saber qué
sub-tab se mira**, salvo la caja (que deja rastro al escribir su caché).

- **Logins de `gerente_acs`**: total histórico **40**, ✅ re-medido el 5-sep-2026
  (`select user_role, count(*) filter (where action='login'), count(*), min(created_at),
  max(created_at), string_agg(distinct action, ', ') from activity_logs where user_role in
  ('gerente_acs','gerente_boston') group by 1`): **40 filas, las 40 `login`**, la primera el
  3-jul-2026 20:35 y la última el **3-sep-2026 19:50 UTC**. Jennifer **no entró el 4 ni el 5 de
  septiembre.** Es el rol más activo de los dos de este archivo.
- **Sesiones**: **42** registradas para `jennifer`; la última con `last_seen`
  **3-sep-2026 19:56 UTC** ✅ (sin cambios al 5-sep).
- **Horario de Panamá** (los 40 logins): **11 a.m.** es la hora pico (10), después **6 p.m.** (8),
  **5 p.m.** (5), **9 a.m.** y **3 p.m.** (4 cada una). Nada antes de las 9 ni después de las 7.
- **`multifashion_caja_diaria`**: 8 filas, la última del **14-ago-2026**. Al 5-sep son
  **22 días** sin abrir la pestaña Caja — es la medición de uso por pantalla más directa que
  este módulo produce.
- **`multifashion_metas`**: **1 fila**, creada por `daniel` el **14-ago-2026 06:22:20 UTC**;
  ninguna edición posterior (`updated_at` = `created_at`, verificado el 5-sep).
  **4 participantes**, sin cambios.
- **Escrituras que el módulo produce por día**: prácticamente **cero**. Salvo crear/editar una
  meta (admin) y el caché de caja, todo el módulo es **de solo lectura**. `activity_logs` de
  `gerente_acs` tiene **40 filas y las 40 son `login`**; sumando las 5 de `gerente_boston` son
  las **45** filas de los dos roles gerentes.
- **Andrea (secretaria)**: tiene el módulo por override; no es medible cuánto lo usa —
  `activity_logs` no distingue persona dentro del rol `secretaria`.

## Qué papeles y Excel produce

🔴 **NINGUNO.** Barrido de `src/components/multifashion/**` y `src/app/api/multifashion/**`:
cero `workbookBytes`/`workbookBuffer`/`workbookBlob`, cero `jsPDF`, cero botón de descarga,
cero envío de correo. **Es el único módulo grande del sistema sin un solo export.**

Lo único que «sale» de Multifashion hacia afuera es **un mensaje de Telegram**:

**📨 Resumen diario de ACS** — cron `acs-resumen-diario`, **01:00 UTC = 8 p.m. de Panamá**,
al **chat PRIVADO de Daniel** (`enviarNegocioPrivado`), `parse_mode: HTML` dentro de un `<pre>`
para que las columnas cuadren en el móvil. Formato aprobado por Daniel el 25-jul-2026:

```
🏪 ACS · viernes 24 jul
━━━━━━━━━━━━━━━━━━
Día    $1,761      ▲ +18%
Mes    $34,278     ▲ +38.9%
Año    $298,582    ▲ +13.4%
━━━━━━━━━━━━━━━━━━
Año pasado
Día    $1,494      viernes 25 jul 2025
Mes    $24,683     1 al 24 de julio 2025
Año    $263,407    1 ene al 24 jul 2025
━━━━━━━━━━━━━━━━━━
🎯 Meta  ▲ +13% arriba del ritmo
```

- **Día** compara contra **−364 días** (mismo día de la semana); **Mes** y **Año** contra el
  **mismo día de calendario** del año anterior (29-feb → 28-feb).
- Sin sync fresco del día se cae la fila «Día» entera y aparece
  `⏳ Ventas del día aún sincronizando (al 23-jul)`.
- Sin base comparable (< $100): esa fila dice `s/d año pasado` y no aparece abajo. Si ninguna
  métrica tiene comparable, el bloque «Año pasado» se omite entero.
- La línea **🎯 Meta** sale solo si hay una meta grupal activa que cubra el corte.
  **Re-medida el 5-sep-2026 con la fórmula real de `meta-ritmo.ts` y los números de hoy**
  (`select sum(subtotal) from _multifashion_sf_vw where not is_wholesale and fecha between …`):

  | Pieza | Valor de hoy | De dónde sale |
  |---|---:|---|
  | corte | **2026-09-04** | `max(fecha)` de `_multifashion_sf_vw` (hoy 5-sep todavía no hay venta cargada) |
  | vendido (1–4 sep 2026, retail) | **$7.502,90** | `fecha between '2026-09-01' and '2026-09-04'`, `is_wholesale = false` |
  | rango completo un año antes (sep–dic 2025) | **$340.698,55** | `between '2025-09-01' and '2025-12-31'` |
  | 1–4 sep 2025 | **$3.786,44** | `between '2025-09-01' and '2025-09-04'` |
  | factor = 420.000 ÷ 340.698,55 | **1,2328** | — |
  | ritmo = 3.786,44 × 1,2328 | **$4.667,78** | — |
  | % = 7.502,90 ÷ 4.667,78 − 1 | **+60,7%** | → **«🎯 Meta  ▲ +61% arriba del ritmo»** |

  ⚠️ El **+13%** que dice la escritura del 4-sep es del **3-sep** y sigue siendo correcto para
  ese día (vendido $4.599,07 · 1–3 sep 2025 $3.294,33 → ritmo $4.061,12 → +13,25%). Saltó a
  +61% porque **el 4-sep vendió $2.903,83 solo** y el 4-sep de 2025 había aportado $492,11.
  El número se mueve todos los días: **no lo copies de aquí, vuelve a medirlo.**
- El destinatario es **Daniel y nadie más**. Jennifer **no** lo recibe.

## Cómo probarlo a mano

Todo con una sesión de admin, sin tocar código.

**1 · La venta de hoy cuadra con Switch**
1. Abre `/multifashion`. Mira la tarjeta «Hoy»: monto, y la hora del último sync.
2. Entra al panel de Switch de MULTIFASHION → Reportes → Total de ventas del día.
   ⚠️ **Entrar al panel expulsa a quien esté** y viceversa; hazlo fuera de 11:50 / 13:00 /
   15:00 / 17:00 / 19:00 / 21:00 / 23:00 UTC.
3. El número de la app es el **retail** (mostrador), **sin ITBMS** y **con las NC restadas**.
   Si Switch muestra más, revisa si hay mayoreo o si estás mirando el total con impuesto.
4. Si la hora del sync es de hace más de 3 h, la tarjeta ya lo dice en ámbar: el número no
   está mal, está viejo.

**2 · El Telegram y la pantalla dicen lo mismo**
- A las 8 p.m. de Panamá llega el mensaje. La fila «Día» tiene que ser **el mismo número** que
  la tarjeta «Hoy» a esa hora. Si difieren, alguien escribió una segunda cuenta — hay un
  candado que lo prohíbe, así que sería un bug real.

**3 · La caja del día**
1. Multifashion → **Caja** → elige el día.
2. Compara **Gran total del día** contra lo contado físicamente y las **Formas de pago** una
   por una.
3. Para confirmar que quedó guardado: la fila del día aparece en `multifashion_caja_diaria`
   (una fila por fecha, con su `synced_at`). Si dice *«Switch no respondió — mostrando último
   dato»*, lo que estás viendo es de la fecha que indica arriba, no de ahora.

**4 · Crear una meta y verla avanzar** (solo admin)
1. Multifashion → **Metas** → **«+ Nueva meta»**.
2. Nombre, desde/hasta, **Tipo: grupal**, monto, premio. Marca participantes **de la lista**
   (no se escriben).
3. Guarda. La tarjeta aparece arriba con la barra en el % vendido del período.
4. Confirmación de que quedó guardada: la fila nueva en `multifashion_metas` (`deleted=false`,
   `activa=true`) y sus participantes en `multifashion_meta_participantes`.
5. Al día siguiente, el Telegram de las 8 p.m. tiene que traer la línea **🎯 Meta**. Si no
   viene, es que la meta no cubre el día del corte, o no hay venta del año pasado en el rango
   completo, o el ritmo quedó bajo $100 — en los tres casos la línea se omite a propósito.
6. Para retirarla: el botón de editar → retirar. **La fila NO se borra**, queda con
   `deleted = true`.

**5 · Que Jennifer ve lo mismo que un admin**
- Entra con `jennifer`. Tiene que aterrizar directo en `/multifashion` sin pasar por el Inicio.
- Cambia el año a 2024 y el chip a «Últimos 12 meses»: **tiene que responder** (si algo se
  recortara por rol, sería una regresión de agosto).
- No debe ver el botón «Actualizar ahora» ni el botón «+ Nueva meta».
- Escribe `/ventas` a mano: tiene que rebotar a `/home` con «No tienes acceso a este modulo».

## Qué lo rompe

| Qué falla | Cómo se nota | Qué pasa exactamente |
|---|---|---|
| **Switch cambia el formato de `/apireporte/ventasucursal`** | Productos se queda con los datos del último día bueno; el resto del módulo sigue andando | el sync se anota en `switch_sync_log` con `status='error'`; **dos fallos seguidos del mismo par (empresa, sync_type) disparan 🔧 SISTEMA** |
| **Switch devuelve HTTP 200 con la página de excepción** (ya pasó dos veces este año) | 🩸 **el `status` dice `success` y las filas son cero.** Es el modo de fallo más peligroso | lo caza la **alerta A** de `silencio-de-datos.ts` (*«un sync trajo CERO donde ese par siempre trae cientos»*), colgada de la reconciliación 10/14/18 UTC. Exige ≥10 corridas previas, mediana ≥10 y ni un cero en la historia |
| **`switch-articulos` no corre** | Productos deja de avanzar; el comparativo se acorta solo (no se infla) | `ultimoDiaArticuloDiario` lo tapa; nadie ve un número falso |
| **`acs-fidelizacion` no corre** | las 4 tarjetas de Clientes se congelan; los segmentos siguen calculándose contra la fecha de hoy, así que **«Dormidos» crece solo** | 2 entradas de cron (11:30 y 16:30, la 2ª es segunda oportunidad) |
| **La migración `20260813170000_multifashion_metas.sql` no hubiera corrido** | la pestaña Metas se dibuja y dice **en ámbar** qué archivo falta. Ningún otro número del módulo cambia | ✅ ya corrió (medido: la tabla existe con 1 fila) |
| **`multifashion_articulo_diario_agrupado_v1` desaparece** | nada visible: la ruta cae al camino paginado (**49 viajes, ~9 s** contra ~1 s) y lo declara en `fuentes.periodo = "paginado"` | `esFuncionAusente()` es estrecho a propósito: un timeout o un permiso denegado **se propagan** |
| **El diccionario de marcas queda vacío** | desaparece el filtro de marcas y la pantalla queda como estaba antes de agosto | `marcaDisponible = false` |
| **Alguien lee sin paginar** | 🩸 **el peor caso**: se leen 1.000 de 20.483 filas, la pantalla muestra el 4,9% de las ventas **sin un solo error** | `leerTodoPaginado` verifica contra `count: "exact"` |
| **Un `tipo` de comprobante nuevo de Switch** | sumaría en silencio con el signo equivocado | `tipos-comprobante.ts` avisa por 🔧 SISTEMA en vez de valer cero calladamente |
| **Daniel entra al panel de MULTIFASHION mientras corre un cron** | el cron recibe `0006` («te sacaron») y re-loguea; si vuelve a fallar, la reconciliación lo reintenta | sesión única **por usuario** |
| **Abrir la pestaña Caja de muchos días seguidos** | cada día sin caché es **un login de ACS**; puede tumbar el token de un cron de facturas | por eso existe el caché y por eso el día cerrado se guarda para siempre |
| **La RPC `multifashion_mensual_v7` falla** | cae a `_v6` **solo si el error es «no existe la función»**; ante un timeout NO reintenta con v6 (que hace MÁS trabajo y garantizaría otro timeout) | `isTransientDbError` |

## Lo que sobra o no cuadra

1. 🔴 **SIGUEN VIVOS (5-sep-2026): cuatro comentarios de rutas dicen «Multifashion es módulo
   admin-only por ahora (los demás roles se definen después)»** y las cuatro aceptan
   `["admin","secretaria","gerente_acs"]`. Líneas re-verificadas hoy:
   `detalle-mensual/route.ts:26` · `vendedoras/route.ts:33` · `retail-recurrentes/route.ts:19` ·
   `clientes-wholesale/route.ts:21`. El comentario es de antes de que existiera `gerente_acs`.
2. 🔴 **SIGUE VIVO: `vendedoras/route.ts:10` dice «Mismos roles que /api/ventas/*
   (admin/director/contabilidad)»** — y **el rol `director` no existe** en `SYSTEM_ROLES`, ni
   `contabilidad` entra a esa ruta (la ruta pide `["admin","secretaria","gerente_acs"]`).
3. 🔴 **SIGUE VIVO, y es peor de lo que decía: `multifashion_bonos_v1` se nombra en TRES
   lugares** — `bonos/route.ts:2`, `src/components/ventas/types.ts:306` y `types.ts:341` — y
   **no existe en `pg_proc`**. El código llama a `multifashion_bonos_v3`.
4. 🔴 **SIGUE VIVO: `detalle-mensual/route.ts:11` dice que `multifashion_dia_a_dia_v4` «sigue
   viva pero solo…»** — **no existe en `pg_proc`** (verificado hoy).
5. 🔴 **DOS funciones instaladas en producción sin un solo llamador desde `src/`** (verificado
   hoy con `grep -rl` sin tests): **`multifashion_tienda_vc_hibrido`** y —la que faltaba en esta
   lista— **`proyeccion_mensual_mayorista_v1`**, que un comentario de `ventas/queries.ts:126` da
   por retirada mientras su hermana `proyeccion_mensual_retail_v1` sí sigue viva y llamada.
   Misma familia que las «metas fantasma».
6. **Tres campos viajan en cada carga y ninguna pantalla los pinta**: `Multifashion.metaAnual`
   ($800.000, y encima cuesta una lectura de `app_settings` dentro de la RPC),
   `Multifashion.ubicacion` («Chiriquí») y `expectedTodayPct`. Ya está anotado en el
   post-mortem como «metas fantasma» y se dejó a propósito; sigue vigente.
7. **`_row` en `_multifashion_sf_vw`** es una constante `1` que nadie lee.
8. **La columna «Comisión» de Vendedoras no dice sobre qué base está calculada.** Es 0,5% de
   las ventas **de contado**, no de todas — la pantalla muestra «Ventas» al lado, y las dos
   cifras no son proporcionales entre sí. No hay ⓘ que lo explique.
9. **`CLAUDE.md` § Multifashion dice «`SUM(subtotal firmado) × 0,5%`, sin filtro de utilidad»**
   y le falta que **solo comisiona el CONTADO** (migración `20260603000000`).
10. **Dos nombres para la misma tienda**: el módulo se llama «Multifashion», la empresa es
    `american_classic` y el encabezado dice «American Classics». Es deliberado y está
    explicado, pero es la causa de la mitad de las confusiones al leer una consulta.
11. **`andrea` (secretaria) tiene el módulo por `modulos_override` y no aparece en la tabla de
    Roles de `CLAUDE.md`.** No es un bug —las rutas la aceptan— pero significa que
    «Multifashion es de Jennifer» es incompleto.
12. **`contabilidad` entra a `overview` y `venta-hoy` por API** y a ninguna otra, y **no puede
    llegar a la pantalla**: es un permiso que no se puede ejercer.
13. **La pestaña Caja lleva 22 días sin abrirse** (última fila de caché: 14-ago-2026
    06:20:58 UTC, re-verificado el 5-sep). Es un dato de uso, no un defecto.
14. **`multifashion_margen_tienda_mensual` (v1) sigue instalada** ✅ (confirmado en `pg_proc` el
    5-sep-2026) como fallback de la `_v2`, que ya corrió. Es red muerta, no dañina.

15. ⚠️ **`switch_articulo_marca` tiene 34 valores distintos, no 32**, y entre ellos están las
    grafías malas que el mapa junta al mostrar: `TH ACCESORIES` (una S) contra `TH ACCESSORIES`,
    `TH OTHER` contra `TH OTHERS`, `CK WOMEN` contra `CK WOMENSWEAR`. Corregirlas es tarea de
    Daniel en Switch; la pantalla no depende de eso.

---
---

# Confecciones Boston (`/boston`, key `boston`)

## Qué es

El módulo de **David** (hermano de Daniel), gerente de Confecciones Boston. Es la operación
completa de **una empresa que no es Fashion Group**: qué le deben, cuánto vendió, quiénes son
sus clientes, su planilla quincenal y los préstamos.

Existe porque Daniel quiso darle a David su empresa **sin darle nada del grupo**. Es el espejo
exacto de la regla vieja: la de siempre protege **la plata del grupo de las filas de Boston**;
ésta protege a **David de VER la plata del grupo**. Las dos valen al mismo tiempo y un cambio
que «arregle» una rompiendo la otra no es un arreglo.

## Quién entra

| Rol | Ficha | La pantalla `/boston` | `/api/boston/**` | La cartera `/api/cxc/boston` |
|---|---|---|---|---|
| `admin` (daniel, alberto) | sí | sí | sí | sí |
| `gerente_boston` (**david**) | sí, **y es su CASA** | sí | sí | sí |
| `secretaria` | no | no | **403** | **sí** (ve la pestaña Boston dentro del CXC del grupo) |
| `vendedor`, `bodega`, `contabilidad`, `gerente_acs` | no | no | **403** | **403** |

**Fuente única: `src/lib/boston/rol.ts`.** El rol, la empresa, la key del módulo, los roles que
entran, las pestañas y la línea de los sueldos viven ahí y las leen la navegación, las rutas y
la pantalla. No hay una segunda lista en ningún lado — es la lección literal de
`boston-roles.ts`, cuya lista duplicada dejó a los 3 vendedores tocando una pestaña que siempre
les contestaba 403.

⚠️ **Ojo con las DOS listas de roles, que no son la misma**:
- `ROLES_MODULO_BOSTON = ["admin", "gerente_boston"]` → el módulo `/boston` y sus 4 rutas.
- `ROLES_BOSTON = ["admin", "secretaria", "gerente_boston"]` (`src/lib/cxc/boston-roles.ts`) →
  **la cartera**. La secretaria la ve porque también la ve desde el CXC del grupo, en su
  pestaña «Confecciones Boston».

**Los módulos de David** ✅ re-medidos el 5-sep-2026 (`select role, modulos from
role_permissions order by role`): **`["boston", "catalogos", "asistencia"]`**, sin cambios.
En la misma consulta, **`gerente_acs` = `["multifashion"]`** — sigue siendo el único módulo de
Jennifer.
- `boston` — el módulo entero.
- `catalogos` — **solo VER** (Daniel, 27-ago-2026: *«catalogo para david si, solo eso»*).
  Entró a **UNA** lista, `CATALOGO_ROLES`, y solo dos cosas la leen: el hub `/catalogos/marcas`
  y el **GET** de `/api/catalogo/[marca]/products`. Todo lo demás del módulo le da **403**: la
  lista de comprobantes, el feed del panel, crear un pedido, exportarlo, mandarlo por correo,
  el checkout, editar un producto, el directorio de clientes de Switch, los vendedores de
  Switch, la búsqueda del directorio, el estado del sync y el permiso de precio. **El catálogo
  no muestra costo ni margen** — no por la lista de roles sino por la **forma de la consulta**:
  `MARCAS_CONFIG[*].products.cols` enumera las columnas y la única de plata es `price`.
- `asistencia` — **la PUERTA, no el módulo** (31-ago-2026). Le da **una sola pestaña**,
  **Aprobaciones**, para aprobar las horas extra de las 21 personas de SU empresa. Las otras
  11 rutas de `/api/asistencia/*` exigen `asistenciaRoles()`, donde **no está**, y le dan 403.

**Aterrizaje — `MODULO_CASA_POR_ROL`.** Con tres módulos el auto-redirect de «rol con UN solo
módulo» ya no lo alcanza, y sin reemplazo David aterrizaría en el **Inicio del GRUPO** — que es
exactamente la fuga que el módulo vino a tapar. Su **casa** es `boston`, resuelta contra los
módulos VISIBLES y sin que `/home` nombre el rol (`moduloCasaDeRol(role)`, no `role === "…"`).

**Las dos fugas, tapadas y re-medidas:**
1. **La búsqueda global** (8 módulos: CXC, Reclamos, Guías, Directorio, Cheques, Ventas,
   Préstamos, Caja) le contesta **403** — `/api/search` exige
   `["admin","secretaria","vendedor","bodega","contabilidad"]` — y **`/home` no le dibuja la
   barra** (solo admin y secretaria). Cerrada por los dos lados.
2. **El Inicio del grupo** lo esquiva por su casa.

⚠️ **El CXC del GRUPO también le contesta 403** (`/api/cxc/aging` exige
admin/secretaria/vendedor). Y desde el 4-sep-2026 David **no tiene NINGUNA ruta de anotación**:
`/api/cxc/favorites` —la única que alcanzaba, con su recorte `?cartera=boston` entra /
`?cartera=grupo` 403— se retiró con los favoritos, y las dos que quedan (`overrides` y
`contact-log`) son de `["admin","secretaria","vendedor"]`. El tabique por cartera
(`respuestaSiCarteraAjena`) **se conserva** para el día en que una ruta de anotación se abra a
`ROLES_BOSTON`, y se mide por conducta en `boston-acceso.test.ts`.

**La contraseña de David no está en el repo.** Se creó con un centinela; `isHash()` en
`/api/auth` saltea toda contraseña que no empiece con `$2a$`/`$2b$`, así que el login era
**imposible** hasta que Daniel se la puso desde Usuarios. ✅ Re-medido el 5-sep-2026
(`select name, role, active, (password like '$2%') from fg_users`): **su contraseña ES bcrypt**
y **ya entró** — 5 logins, el último el **2-sep-2026 21:05 UTC**, con una sesión cuyo
`last_seen` es del **4-sep 17:01 UTC**. No entró ni el 5.

## Las pantallas

`/boston` es un solo route con **seis pestañas** en la URL (`?tab=`). Una pestaña inventada
cae a `inicio` sin romper nada (`tabBostonValida`).
Los rótulos son cortos a propósito: las 6 tienen que entrar en un iPhone de 390 px, y con los
originales la tira desbordaba **164 px** («Préstamos» quedaba fuera de la pantalla).

### Pestaña 1 · **Inicio** — `tabs/InicioBoston.tsx`

Es la primera pantalla que ve David al entrar al sistema.

- Arriba de todo, **la fecha del dato**: `<SyncStatus tabla="estadocuenta" />` acotado a las
  empresas de `empresasCarteraAparte()` (= **solo Boston**). Dice *«Actualizado: 18 ago 2026,
  10:10 p m»* y, pasado el umbral de 26 h, *«⚠️ Confecciones Boston sin actualizar desde 18 ago»*.
- **Cuatro tarjetas, que son PUERTAS** (cada una lleva a su pestaña):
  | Tarjeta | Valor | Pie | Lleva a |
  |---|---|---|---|
  | **Por cobrar** | `$<total de la cartera>` | `N clientes` | Por cobrar |
  | **Vendido en \<mes\>** | `$<venta del mes>` | `$<venta del año> en <año>` | Ventas |
  | **En planilla** | `N` | «personas activas» | Planilla |
  | **Con préstamo** | `N` | «personas de Boston» | Préstamos |
- Debajo, **«Cómo está la cartera»**: `Al día (0-90)` verde · `91-120` ámbar ·
  `121 y más` rojo, con su monto.

⚠️ **La tarjeta «Con préstamo» cuenta SOLO Boston**, aunque la pestaña Préstamos muestre las
tres empresas. No es una contradicción: la pestaña es la excepción que Daniel pidió y el Inicio
contesta «cómo va Boston».

### Pestaña 2 · **Por cobrar** — `src/components/cxc/BostonTab.tsx` (el MISMO componente del CXC)

⚠️ **SE REDISEÑÓ EL 5-sep-2026** (commit `e1ae7258`, «cxc: una hoja para cobrar, totales sobre
su columna y el aviso de quien no paga»): el CXC del grupo se rehizo entero y **Boston recibió
el mismo formato, siempre aparte**. Lo que sigue es cómo quedó, leído del archivo de hoy
(460 líneas, 289 cambiadas).

⚠️ **Y el CXC se mudó de dirección**: `/admin` pasó a **`/cxc`**. `/admin` redirige con **307**
y **Next arrastra la query**, así que un marcador viejo `/admin?tab=boston` sigue llegando
entero — pero la dirección canónica de la otra puerta a esta pestaña es hoy **`/cxc?tab=boston`**.
(`next.config.js:89`; `/admin/usuarios` y `/admin/data-health` **no** se movieron.)

- **No es un componente nuevo.** Es exactamente el `<BostonTab />` del CXC, contra el **MISMO**
  `/api/cxc/boston`. Dos puertas, un solo componente.
- Arriba, en este orden: `<SyncStatus>` (la fecha del dato, acotado a `empresasCarteraAparte()`
  = solo Boston) → `<AvisoRechazosSwitch>` (lo que el guard de montos dejó afuera) → el buscador
  («Buscar cliente...»).
- 🆕 **La tira de totales se paró SOBRE SUS COLUMNAS.** En pantalla ancha los cuatro totales
  viven en la **misma grilla de 12 columnas** que la tabla (4/2/2/2/2), pegados arriba de ella:
  el conteo de clientes a la izquierda y después **0-90 · 91-120 · 121+ · Total · N**. Antes
  eran cuatro tarjetas flotando sin relación visual con nada. **Los cuatro siguen FILTRANDO**
  igual que antes, con el mismo toggle de `lib/cxc-orden`. En celular (`lg:hidden`) siguen
  siendo las píldoras de siempre, 2+2.
- 🆕 **Un botón «Cobrar» y otro «Documentos» por fila** (en la tabla, a la derecha del total;
  en las tarjetas, dos botones de 44 px al pie).
- 🆕 **Los tramos finos se ven al pasar el mouse** por encima de un monto (`title=`):
  `0-30: $X · 31-60: $Y · 61-90: $Z` y `121-180 · 181-270 · 271-365 · +365`. Es para lo que
  se hizo la migración de hoy. **Sin los tramos finos no inventa un desglose**: dice el nombre
  del tramo y ya (`detalleFino()` devuelve `tramoLabel(k)` cuando `finos` es `null`).
- ⚠️ **«Último pago» dejó de ser una columna**: vive debajo del nombre, en gris, y cuando no hay
  dice **«Sin pagos registrados»**. La tabla quedó en `Cliente · 0-90 · 91-120 · 121+ · Total`,
  todas ordenables.
- 🩸 **Y el botón «Últimos pagos ›» con su bloque por empresa se retiró**: Boston es UNA empresa,
  ese bloque mostraba tres pagos de la única empresa que hay. Ahora se va directo a los
  documentos.
- Lo que **no** cambió: la barrita de color por el tramo más viejo con deuda, el chip
  **«también en el grupo»** (marca visual, **no suma nada**) y el corte **`lg`** con
  `data-vista` fijo.

**La hoja «Cobrar»** (`BostonHojaCobrar.tsx`) — **es SUYA, con sus propios datos**: los teléfonos
salen de `switch_clientes` acotado a Boston (viajan dentro de `/api/cxc/boston`), nunca de
`clientes_master`, donde Boston no está a propósito. Tiene **TRES salidas**:
**WhatsApp** · **Copiar el mensaje** · **Ver los documentos**.

🔴 **NO tiene «Correo» ni «PDF», y es una decisión medida, no un olvido.** El comentario del
archivo lo dice y lo verifiqué contra producción el 5-sep-2026:

```sql
select count(*), count(*) filter (where coalesce(nullif(trim(sc.telefono),''), nullif(trim(sc.celular),'')) is not null),
       count(*) filter (where nullif(trim(sc.email),'') is not null)
  from switch_estadocuenta_aging_boston c
  left join switch_clientes sc on sc.empresa_key='confecciones_boston' and sc.cliente_switch_id = c.cliente_switch_id
```
→ **390 clientes · 272 con teléfono · 113 con correo.** Con menos de un tercio con correo, y con
el texto de cobro del sistema firmado por Fashion Group (Boston no está en esa lista de
empresas), mandar correo desde aquí exige que Daniel decida quién firma y con qué texto.

El mensaje que lee el cliente lo firma **«Confecciones Boston - Departamento de Cobros»** y
🔴 **la palabra «vencido» está prohibida**: `dias` es la EDAD del documento desde su emisión,
no días de mora, así que se rotula por ANTIGÜEDAD («Hasta 90 días», «De 91 a 120 días»,
«Más de 120 días»).

**El cajón «Documentos»** (`BostonDocumentosDrawer.tsx` → 🆕 `GET /api/cxc/boston/estado-cuenta`)
es el estado de cuenta **documento por documento** de un cliente. 🔴 **Es una ruta aparte con su
propia consulta a propósito**: no reusa `fetchEstadoCuentaData` —el helper del GRUPO— aunque
haga casi lo mismo, porque ese helper recibe una LISTA de empresas y bastaría pasarle
`["confecciones_boston"]` para mezclar los dos mundos por descuido. Usa el MISMO signo por tipo
que la vista de aging, así que el total del cajón cuadra al centavo con el de la lista.

🩸 Aquí vivía una 5ª tarjeta, *«Cobrado julio · $35.392,49 · 126»*, **con el monto escrito a
mano en el código**. No filtraba nada y en octubre se habría leído como si fuera de octubre.
Daniel aprobó quitarla. **No reponerla.** ⚠️ Pero el motivo que quedó escrito en el archivo
(`BostonTab.tsx:224-225`, «`recibos: false` … su cartera va por Brand It») **es falso** — ver
«Lo que sobra» #1.

### Pestaña 3 · **Ventas** — `tabs/VentasBoston.tsx`

- Línea fija: *«Venta neta, sin ITBMS. Las notas de crédito ya están restadas.»*
- Un acordeón **por año** (el más reciente abierto), con el total del año; adentro, los 12
  meses con barra proporcional (medida contra el **mes más alto de TODA la serie**, para poder
  comparar años de un vistazo) y el monto. Un mes sin ventas dice **«—»**, no se omite.
- Al pie, cuando corresponde: *«De Confecciones Boston no se trae el costo desde Switch, así
  que aquí no hay utilidad ni margen: solo lo vendido.»*

🔴 **Sin costo ni utilidad, y NO es un olvido.** El rollup **sí trae** `costo_total` y
`utilidad` para Boston, pero Boston es `utilidad: false` en `EMPRESA_SYNC_CAPABILITIES`: ese
reporte de Switch **nunca se sincronizó ni se certificó**, y los márgenes que salen oscilan
entre 12% y 53% de un mes al otro. La bandera se **deriva** de `empresasConUtilidad()`, así que
el día que Daniel encienda el sync la pantalla se entera sola.

### Pestaña 4 · **Clientes** — `tabs/ClientesBoston.tsx`

- Buscador («Buscar cliente por nombre o código...»). **Sin escribir**, muestra los clientes
  **con saldo abierto** y lo dice: *«N clientes con saldo abierto — busca por nombre para ver
  el resto»*. Con **3 o más** caracteres busca contra los **4.915** del maestro de Switch, tope
  **100**, y dice *«(hay más, afina la búsqueda)»* si se pasa.
- Columnas: **Cliente** (con «inactivo» si corresponde) · **Código** · **Teléfono** ·
  **121 y más** · **Saldo**. Por debajo de `lg`, tarjetas.

🔴 **Por qué no se reusa el Directorio**: `/clientes` está construido para **NO** tener a
Boston, en tres capas (`mundos.ts` → `soloClientesDelGrupo()`; `/api/clientes` filtrado; la
ficha `/clientes/[codigo]` armada con `B2B_EMPRESA_KEYS`). Meter a Boston por ahí sería aflojar
el filtro que separa las dos carteras. Y **`clientes_master` no sirve**: no tiene columna de
empresa. La fuente es `switch_clientes` acotada con `.eq("empresa_key", EMPRESA_BOSTON)`.

### Pestaña 5 · **Planilla** — `tabs/PlanillaBoston.tsx`

- **Abre VACÍA.** Un `<RangoFechas>` arriba y, en vez del cuadro, un recuadro punteado:
  *«Elige el período que vas a pagar»* / *«La quincena se calcula con las fechas que elijas
  arriba.»* Daniel: *«la quincena se paga según el rango de fecha seleccionado»*. Y **no
  recuerda el último rango** — al abrir la quincena siguiente mostraría la anterior, con plata.
- Al elegir, la línea `N personas · <desde> al <hasta>` y el cuadro.
- 🔴 **Las 18 columnas son las MISMAS de la planilla del grupo, en el MISMO orden**:
  `Salario quincenal · Extra 1.25 · Ausencias · Tardanzas · Extra 1.50 · Excedente ·
  Domingos · Feriados · Total bruto · Seguro social · Seguro educativo · ISR · Préstamo ·
  Terceros · Mercancía · Total deducc. · Otros servicios (+) · Neto a pagar`, con el mismo
  formato (cero → «—»), la primera columna pegada al hacer scroll y **pie de TOTAL**.
  El «(+)» de «Otros servicios» no es adorno: es la única señal de que esa columna SUMA.
- Una fila **sin dinero** (persona fuera de planilla, o «Tú decides») **no se rellena con
  ceros**: dice por qué.
- **Todo es de SOLO LECTURA.** Los cinco montos que en el grupo se escriben a mano (ISR,
  préstamo, terceros, mercancía, otros servicios) se guardan con `POST /api/asistencia/planilla`,
  que exige `asistenciaRoles()` — y David no está ahí. **Dibujar un campo que el servidor
  rechaza es peor que dibujar el número.** Decisión de Daniel.
- Avisos que sí se muestran: el de período abierto (azul) y el de gente sin ficha (ámbar).

### Pestaña 6 · **Préstamos** — `tabs/PrestamosBoston.tsx`

- 🔴 **TODOS los préstamos, de las tres empresas. Es la ÚNICA excepción del módulo**, y Daniel
  la pidió con esas palabras: *«Préstamos (TODOS, no solo los de Boston)»*.
- Tres tarjetas: **Por cobrar** (`$`) · **Con saldo** (N) · **Personas** (N).
- Línea fija: *«Son los préstamos de las tres empresas que tienen gente con préstamo, no solo
  los de Confecciones Boston.»*
- Una tarjeta por persona: nombre, **empresa** (el nombre tal como lo guardó Contabilidad),
  saldo (azul y con «a favor» si es negativo), barra de avance (verde ≥75% · ámbar ≥25% ·
  rojo) y la línea `Prestado $X · pagado $Y · descuenta $Z por quincena · último mov. <fecha>`.
- **Solo lectura por construcción**: `/api/boston/prestamos` tiene **UN solo verbo, GET**.

### Fuera de `/boston`, pero suyas

- **Catálogos** (`/catalogos/marcas` y las 4 marcas) — solo ver.
- **Asistencia › Aprobaciones** (`/asistencia?tab=aprobaciones`) — la única pestaña que
  `vePestana("gerente_boston", …)` le devuelve `true`, y solo aprueba a **Confecciones Boston**
  (`asistencia_aprobador_empresa`).

## Los datos

### `switch_estadocuenta` (filas de `confecciones_boston`) — **990 filas, 919 con saldo ≠ 0** ⚠️

Es **la misma tabla** que la cartera del grupo, con **dos escritores distintos** sobre la misma
llave `(empresa_key, ccte_id)`: el sync por API (las 6 del grupo) y el reporte web (Boston).
Cada escritor reconcilia **solo su empresa** y solo con universo completo.

Columnas: `id, empresa_key, ccte_id, cliente_switch_id, cliente_nombre, cliente_codigo,
secuencial, numero_fiscal, tipo_comprobante, abrev, total, saldo, debito, credito,
saldo_original, total_original, plazo_credito, dias, fecha_creacion, raw_data, synced_at,
updated_at`.

- 🔴 **El `ccte_id` de Boston se SINTETIZA** (el reporte web no lo trae):
  `serie × 10.000.000 + (año − 2000) × 100.000 + correlativo`. Se lee de corrido en decimal:
  `11-000000009` de 2026 → `112600009` = `11` · `26` · `00009`.
- 🔴 **El `saldo` por documento tampoco viene**: se deriva `debito − credito` y se **cuadra al
  centavo contra los `totales` que publica Switch** antes de escribir.
- **`abrev` y `numeroOrden` ya no llegan** en el formato nuevo del reporte (19-ago-2026); el
  adaptador `adaptarReporteConsola` traduce el resto al formato viejo.
- **Filas con `saldo = 0`**: **71** al 5-sep-2026 (eran 65 el 4-sep). **No son basura**: son
  documentos que se pagaron entre una corrida y la siguiente; el reconcile les puso el saldo en
  cero y `debito`/`credito` conservan el monto original. **Nadie las cuenta** (la vista las filtra).

✅ **La cartera se está refrescando todos los días.** Re-medido el 5-sep-2026
(`select empresa_key, count(*), count(*) filter (where coalesce(saldo,0)<>0), max(synced_at)
from switch_estadocuenta group by 1`): Boston **990 filas · 919 con saldo · última escritura
2026-09-05 08:10:08 UTC**. Las otras 6 empresas escriben a las 16:00–16:11 UTC, por el otro
camino. **Siete corridas `success` en los últimos 7 días**, cero fallos
(`select sync_type, count(*), count(*) filter (where status='success') from switch_sync_log
where empresa_key='confecciones_boston' and started_at >= now() - interval '7 days' group by 1`
→ facturas 35/35 · ventas_tipos 35/35 · recibos 28/28 · articulos 7/7 · **estadocuenta 7/7** ·
costo 7/7).

### `switch_estadocuenta_aging_boston` — **VISTA** (no tabla), **390 filas** · ⚠️ **ganó 7 columnas el 5-sep-2026**

🔴 Es una **vista aparte a propósito** (`20260728120000_aging_grupo_y_boston_aparte.sql:130`),
disjunta por construcción de la del grupo. Una fila por cliente de Boston.

`id uuid (md5 de empresa|codigo) · company_key · codigo · cliente_switch_id · nombre ·
nombre_normalized · d0_90 · d91_120 · d121_plus · total` **+ los 7 tramos finos nuevos**:
`d0_30 · d31_60 · d61_90 · d121_180 · d181_270 · d271_365 · mas_365`.

🔴 **Migración `20260928120000_aging_boston_tramos_finos.sql`, APLICADA el 5-sep-2026.** Boston
recibió los MISMOS cortes que el grupo, **sin que se moviera un centavo de lo que ya se veía**.
Las columnas nuevas van AL FINAL (un `CREATE OR REPLACE VIEW` exige conservar nombre, tipo y
orden de las que ya estaban), y el código deployado es tolerante a que no existan
(`finos: r.d0_30 == null ? null : {…}` en `/api/cxc/boston/route.ts:159`).

✅ **VERIFICADO FILA POR FILA que los tres tramos visibles no cambiaron** — no por confianza en
el SQL, sino midiendo los 390 clientes uno por uno:

```sql
select count(*) filter (where round(d0_90,2)    <> round(d0_30+d31_60+d61_90,2))                    as d0_90_no_cuadra,
       count(*) filter (where round(d121_plus,2)<> round(d121_180+d181_270+d271_365+mas_365,2))     as d121_no_cuadra,
       count(*) filter (where round(total,2)    <> round(d0_90+d91_120+d121_plus,2))                as total_no_cuadra
  from switch_estadocuenta_aging_boston
```
→ **0 · 0 · 0.** Ni una fila de las 390 se descuadra.

| Tramo | Monto (5-sep-2026) |
|---|---:|
| `d0_30` | $49.217,07 |
| `d31_60` | $5.754,48 |
| `d61_90` | $3.640,77 |
| **`d0_90` (visible)** | **$58.612,32** = la suma exacta de los tres |
| **`d91_120` (visible)** | **$11.956,68** |
| `d121_180` | $29.651,39 |
| `d181_270` | $13.800,99 |
| `d271_365` | $22.194,08 |
| `mas_365` | $59.293,79 |
| **`d121_plus` (visible)** | **$124.940,25** = la suma exacta de los cuatro |
| **`total`** | **$195.509,25** |

⚠️ **La columna de empresa se llama `company_key`, no `empresa_key`.**
⚠️ Y ojo con el reverso, que la escritura del 4-sep tenía al revés: **la vista del GRUPO no
tiene `d0_90` ni `d121_plus`** — solo los ocho finos (`d0_30 · d31_60 · d61_90 · d91_120 ·
d121_180 · d181_270 · d271_365 · mas_365 · total`), y los tres tramos gordos los arma la
pantalla. **La de Boston es hoy la única que trae las DOS familias.**

**Cómo firma** (esto no está en `CLAUDE.md`): `Nota de Crédito`, `Recibo` y `Recibo Saldo
Anterior` entran **negativos**; `Factura`, `Nota de Débito`, `Saldo Anterior`, `Transacción` y
`Tiquete` **positivos**; **cualquier otro tipo vale 0**. Solo entran documentos con
`saldo ≠ 0`, y una fila se descarta si `|total| < 0,01`. Los buckets solo cuentan `dias ≥ 0`
(hoy hay **0** documentos con `dias < 0`), pero el `total` los sumaría igual.

🔴 **EL AISLAMIENTO, MEDIDO EN LAS DOS DIRECCIONES EL 5-sep-2026.** Una sola consulta,
las tres vistas a la vez:

```sql
select 'aging_grupo' v, count(*), count(*) filter (where company_key='confecciones_boston'),
       count(distinct company_key), round(sum(total),2) from switch_estadocuenta_aging
union all select 'aging_boston', count(*), count(*) filter (where company_key<>'confecciones_boston'),
       count(distinct company_key), round(sum(total),2) from switch_estadocuenta_aging_boston
union all select 'aging_mv', count(*), count(*) filter (where company_key='confecciones_boston'),
       count(distinct company_key), round(sum(total),2) from switch_estadocuenta_aging_mv
```

| Vista | Filas | Filas del OTRO lado | Empresas | Total |
|---|---:|---:|---:|---:|
| `switch_estadocuenta_aging` (grupo) | 211 | 🔴 **0 de Boston** | **6** | $3.676.935,55 |
| `switch_estadocuenta_aging_boston` | 390 | 🔴 **0 del grupo** | **1** | $195.509,25 |
| `switch_estadocuenta_aging_mv` (MV) | 211 | 🔴 **0 de Boston** | **6** | $3.676.935,55 |

✅ **Las dos vistas son disjuntas y la MV es idéntica a la vista al centavo** (211 · 0 ·
$3.676.935,55 en las dos). Y se comprobó por su definición, no solo por el conteo
(`select definition from pg_matviews where matviewname='switch_estadocuenta_aging_mv'`): la MV
**termina en `FROM switch_estadocuenta_aging v`** y **no nombra `switch_estadocuenta` ni una
vez** — sigue materializando la VISTA, no una copia de su cuerpo. ⚠️ Detalle fino: enumera las
columnas una por una y agrega `now() AS materializado_en`, no es un `SELECT v.*` literal; lo que
importa —de dónde lee— sí es lo escrito.

⚠️ **La exclusión es un `<>`, no un `NOT IN`** — leyendo la definición viva
(`select pg_get_viewdef('switch_estadocuenta_aging'::regclass, true)`):
`WHERE COALESCE(s.saldo,0) <> 0 AND s.empresa_key <> 'confecciones_boston'::text`.
Este archivo y `cxc/CLAUDE.md` dicen «`NOT IN`». **Lo que importa se sostiene** —es una
exclusión, no una enumeración, así que una empresa nueva entra sola y no se cae en silencio—
pero el operador escrito no es el que corre.

⚠️ **`TCKCTA` (el mostrador) sigue en la cartera de Boston** con **$25,15** ✅ (re-medido). No
es un cliente.

### `switch_clientes` (`confecciones_boston`) — **4.915 filas, todas activas**

🔴🔴 **AL 5-sep-2026 SIGUE CONGELADA. El arreglo está escrito y programado, pero TODAVÍA NO HA
CORRIDO NI UNA VEZ.** Es la corrección más importante de esta verificación.

Medido hoy (`select empresa_key, count(*), min(synced_at), max(synced_at), count(distinct
synced_at) from switch_clientes group by 1`):

| Empresa | Filas | `synced_at` distintos | Última escritura |
|---|---:|---:|---|
| **`confecciones_boston`** | **4.915** | **1** | 🔴 **2026-07-30 06:31:07.524 UTC** (37 días) |
| `american_classic` | 1.038 | 3 | ✅ 2026-09-05 11:30:29 UTC (hoy) |
| las 6 del grupo | 139–147 c/u | 2–3 | ✅ 2026-09-05 16:00–16:11 UTC (hoy) |

Las 4.915 filas siguen con **el mismo `synced_at` al milisegundo**, así que un cliente que
Switch dio de alta en agosto **todavía no existe para esta pantalla**.

**Por qué todavía no corrió, y no es un fallo:** el cron es **semanal, domingos 07:10 UTC**
(`vercel.json` → `{"path": "/api/cron/sync-clientes-boston", "schedule": "10 7 * * 0"}`,
verificado hoy; el route existe y está commiteado en `9dcf9dd6`). **Hoy 5-sep-2026 es SÁBADO.**
La primera corrida de su vida es **mañana, domingo 6-sep 07:10 UTC**. Confirmado por la otra
punta: `select sync_type, count(*), max(started_at) from switch_sync_log where
empresa_key='confecciones_boston' group by 1` devuelve `recibos · ventas_tipos · facturas ·
articulos · estadocuenta · costo · mayor` — **no existe ni una corrida de tipo `clientes`**.

✅ **Y la alerta B SÍ está funcionando y ya sonó.** Medido:
`select tipo, count(*), max(created_at), max(error_message) from cron_email_errors where tipo
like 'silencio%' group by 1` →
**`silencio_de_datos:Confecciones Boston` · 1 aviso · 2026-09-05 10:00:28 UTC ·
`confecciones_boston/switch_clientes:quieta`**. O sea: el hueco que antes no cubría nadie hoy
lo cubre una alerta, y esa alerta está diciendo la verdad. Si la corrida del domingo falla,
vuelve a sonar a los 7 días.

🔑 **Cómo verificar el lunes que el arreglo funcionó** (dos consultas, sin tocar nada):
`select max(synced_at) from switch_clientes where empresa_key='confecciones_boston'` tiene que
decir **domingo 6-sep ~07:10 UTC**, y `select * from switch_sync_log where
empresa_key='confecciones_boston' and sync_type='clientes'` tiene que traer una fila
`status='success'`. Mientras esas dos digan otra cosa, **el directorio de Boston está viejo por
más que la documentación diga que se arregló**.

**Historia (por qué se congeló):** Las 4.915 filas tenían el MISMO `synced_at` al milisegundo y
ni una escritura desde el 30-jul, y nadie lo vio porque ninguna alerta lo cubría.

**La causa:** el único escritor del directorio vivía DENTRO del sync de estado de cuenta por API, y
ese camino para Boston está vetado (4.912 llamadas HTTP, 54 min contra un techo de 800 s). El
`switch_sync_log` lo dice al minuto: la última corrida de `estadocuenta` de Boston arrancó el
**30-jul 06:31:08** —`runStamp` 06:31:07.524, exactamente el `synced_at` de las 4.915 filas—,
alcanzó a escribir el directorio y murió en el recorrido por cliente. **El día que Boston salió de
ese cron es el día exacto en que su directorio se congeló.** Y nadie lo vio porque **ninguna alerta
lo cubría**.

**El arreglo, escrito el 5-sep-2026 y a estrenar el 6:** `/api/cron/sync-clientes-boston`, **SEMANAL, domingos 07:10 UTC**
(domingo 2:10 a.m. de Panamá — Daniel: *«semanal»*). Pide solo `/apicliente/lista` (~99 páginas, no
4.912 llamadas) y escribe con el MISMO código que las 6 del grupo
(`src/lib/switch-api/clientes-directorio.ts`: un solo escritor, no dos implementaciones que se
puedan separar en silencio).

🔴 **Escribe SOLO `switch_clientes` con `empresa_key = 'confecciones_boston'`. `clientes_master` no
se toca.** Daniel: *«los clientes de Boston no quiero que toquen los de Fashion Group… no quiero
volver a pasar por el mismo error»*.

**Dos guardas antes de marcar a alguien como ausente** —lo único del sync que puede hacer daño—: la
lista tiene que haber venido completa **y** no haber encogido por debajo del **70%** de lo conocido.
Una lista vacía no escribe ni marca: la corrida termina en `error`.

**Y ahora sí se vigila:** alerta **B** de `silencio-de-datos.ts` sobre esta tabla, **solo Boston**
(la misma tabla la escriben tres crons con tres ritmos), umbral **semanal de 165 h** — avisa a la
primera corrida perdida, porque la siguiente oportunidad es dentro de siete días.

✅ **8 clientes con saldo en la cartera NO existen aquí** — re-medido el 5-sep-2026
(`select a.codigo, a.nombre, a.total from switch_estadocuenta_aging_boston a left join
switch_clientes sc on sc.empresa_key='confecciones_boston' and sc.cliente_switch_id =
a.cliente_switch_id where sc.cliente_switch_id is null order by a.total desc`), **siguen siendo
los mismos 8**, así que **aparecen en «Por cobrar» y NO en «Clientes»**:
`165367 PRIVIVIENDA S,A. $323,68` · `115339 ITALDECO INTERNACIONAL S.A. $225,77` ·
`115323 MAKAYA REAL ESTATE, S.A. $96,30` · `145413 Maria Valles $89,88` ·
`145301 FENEDA $30,10` · `165329 Eduardo González $21,40` · `145407 SMILEART −$8,05` ·
`135364 Gabriela Arlene Jaramillo −$30,00`. Suman **$749,08** ⚠️ (la escritura del 4-sep decía
$748,68 — la suma correcta de esos mismos ocho números es 749,08). Nadie lo dice en pantalla.

⚠️ **Y el cruce da lo mismo por CÓDIGO que por `cliente_switch_id`: 382 de 390 en los dos
casos.** No hay una llave que rescate a los 8.

### `switch_recibos` (`confecciones_boston`) — **7.674 filas** ✅

Los cobros. Alimentan la columna «Último pago» (vía `switch_ultimo_pago_cliente_v2`) y el
cajón de documentos. **266 recibos desde el 1-ago-2026** ✅ (re-medido el 5-sep-2026).

❌ **CORREGIDO — la escritura del 4-sep decía que cruzar por `cliente_switch_id` rescataba
clientes, y es FALSO.** Lo que se midió hoy:

```sql
select (select count(distinct cliente_codigo) from switch_recibos where empresa_key='confecciones_boston'),
       (select count(*) from switch_estadocuenta_aging_boston a where exists (select 1 from switch_recibos r
          where r.empresa_key='confecciones_boston' and r.cliente_codigo = a.codigo)),
       (select count(*) from switch_estadocuenta_aging_boston a where exists (select 1 from switch_recibos r
          where r.empresa_key='confecciones_boston' and r.cliente_switch_id = a.cliente_switch_id))
```
→ **1.978 códigos distintos de recibos · 346 cruzan por CÓDIGO · 346 cruzan por ID.**
**El mismo número por las dos llaves.** El «382» que decía la escritura vieja es el cruce
contra **`switch_clientes`** (el directorio), no contra los recibos: dos mediciones distintas
que se mezclaron en una frase.

Lo que **sí** es cierto y sigue vigente: el código de la ruta cruza por `cliente_switch_id`
(`/api/cxc/boston/route.ts:81-84`, `.select("cliente_switch_id,ultimo_pago_fecha,
ultimo_pago_monto").eq("empresa_key","confecciones_boston")`), y esa es la llave del
`DISTINCT ON` de la vista, así que es la que hay que usar para paginar estable. Pero **no gana
cobertura sobre el código**.

`switch_ultimo_pago_cliente_v2` tiene hoy **1.940 filas** de Boston (eran 1.947 el 4-sep) y
**339 de los 390 clientes de la cartera** terminan mostrando un último pago (los demás, o no
tienen recibo, o el único que tienen es de $0,00 y la ruta lo descarta).

🩸 **Un recibo de $0,00 NO es un pago** (es una aplicación, un cruce o un anulado) y las
retenciones tampoco. Boston era la más afectada: **138 de los 166** clientes con un «último
pago» que no era un pago eran suyos, algunos con fechas de 2024.

### `switch_facturas` (`confecciones_boston`) — **9.165 filas** ✅

Alimentan `ventas_rollup_mensual_mv`. 🩸 **Boston tiene 1.216 notas de crédito guardadas en
POSITIVO** ⚠️ (eran 1.210 el 4-sep). Re-medido el 5-sep-2026
(`select tipo_comprobante, count(*), count(*) filter (where subtotal_descuento>0),
count(*) filter (where subtotal_descuento<0) from switch_facturas where
empresa_key='confecciones_boston' group by 1`): **Factura 7.742 · Nota de Crédito 1.216 ·
Transacción 138 · Nota de Débito 57 · Tiquete 12 — y las 9.165 filas están guardadas en
POSITIVO, sin una sola negativa.** El signo lo pone la lectura.

⚠️ **Las cifras de agosto que citaba la escritura del 4-sep ya no son las de la base.**
Re-medido hoy sobre agosto 2026 de Boston: sumar todo en crudo da **$94.822,50**, y lo neto
(NC restadas, sin ITBMS) da **$45.153,10** — no los $87.661,61 / $34.560,85 de la escritura
anterior. Agosto siguió recibiendo facturas después de esa medición: el `ventas_rollup_mensual_mv`
de `(confecciones_boston, 2026, agosto)` dice hoy exactamente **$45.153,10**, o sea que la app y
la consulta cruda cuadran al centavo. **La lección no cambia: sumar en crudo infla la venta de
agosto en $49.669,40.** Por eso la pestaña lee `ventas_netas` del rollup.

### `ventas_rollup_mensual_mv` (`confecciones_boston`) — **48 filas**

Una por `(empresa_key, anio, mes)`. ⚠️ **`mes` es una `date` (el día 1 del mes), no un
entero.** Re-medido el 5-sep-2026 (`select anio, count(*), round(sum(ventas_netas),2),
round(sum(costo_total),2) from ventas_rollup_mensual_mv where
empresa_key='confecciones_boston' group by 1 order by 1`):

| Año | Meses | Ventas netas | Costo (existe, pero NO se muestra) |
|---|---:|---:|---:|
| 2022 | 3 | $74.942,17 | $50.968,03 |
| 2023 | 12 | $694.693,70 | $468.161,47 |
| 2024 | 12 | $628.530,15 | $436.875,27 |
| 2025 | 12 | $687.474,79 | $410.339,27 |
| **2026** | 9 | ⚠️ **$472.856,97** | **$298.739,11** |

(el 4-sep decía $465.785,97 / $297.915,43 — creció con las facturas que siguieron entrando).

Mes a mes 2026: ene $33.783,31 · feb $62.027,45 · mar $90.168,82 · abr $36.714,11 ·
may $62.891,47 · jun $55.387,61 · jul $71.908,55 · **ago $45.153,10** · sep (al 4) $14.822,55.

### `asistencia_personas` (`empresa = confecciones_boston`) — **22 fichas, 21 activas** ✅ (re-medido el 5-sep-2026: `select empresa, count(*), count(*) filter (where activo) from asistencia_personas group by 1` → confecciones_boston 22/21 · vistana 10/9 · fashion_wear 8/7)

Solo se lee el **conteo** en el Inicio. La planilla completa sale del motor de Asistencia.

### `prestamos_empleados` + `prestamos_movimientos` — **32 fichas** ⚠️

Por empresa (la columna guarda el **NOMBRE**, no la key). Re-medido el 5-sep-2026
(`select empresa, count(*), count(*) filter (where coalesce(deleted,false)=false) from
prestamos_empleados group by 1`): **Confecciones Boston 22 fichas / 21 no borradas ·
Vistana International 5 / 5 · Fashion Wear 5 / 5**.

⚠️ **«Activas» ya no quiere decir nada**: la bandera `activo` de la ficha **se retiró** con el
rediseño de Préstamos (commit `c4aee92d`) — nunca significó «esta persona trabaja en la empresa» sino «tiene algo
abierto». El Inicio de Boston hoy **no la mira**: cuenta a quien DEBE, calculando el saldo con
`calcularSaldoPrestamo` (`/api/boston/inicio/route.ts:124-143`, con el comentario que lo
explica). El «15 activos de 32» de la escritura del 4-sep describe un mecanismo que ya no existe.

⚠️ En préstamos `deleted` es **NULLABLE**: un `.eq("deleted", false)` pierde filas.

### `asistencia_aprobador_empresa` — **6 filas**

`usuario · empresa · creado_en`. ✅ Re-medido el 5-sep-2026 (`select usuario, empresa,
creado_en from asistencia_aprobador_empresa order by 1,2`), **las 6 filas idénticas**, todas
creadas el 1-sep-2026 14:39:32 UTC: **`david → confecciones_boston`** ·
`Bodega → fashion_wear`, `vistana` · `Contabilidad → confecciones_boston`, `fashion_wear`,
`vistana`. **`admin` no tiene filas y pasa siempre.** Sin filas propias, un aprobador **no aprueba nada** (y lo ve, porque el cuadro le
sale vacío).

### `cxc_client_overrides` / `cxc_contact_log` (y `cxc_favorites`, ya sin lectores)

⚠️ **Comparten el namespace de `nombre_normalized` entre grupo y Boston** (no tienen columna de
empresa). Las notas y el contacto **no llevan la cartera en la consulta que la pantalla hace**, así
que los ~10 nombres que existen en las dos carteras los comparten. **No es plata y no se tocó**:
arreglarlo pide DDL y una decisión de Daniel.
⚠️ **`cxc_favorites` se quedó sin lectores el 4-sep-2026** (los favoritos ⭐ se retiraron del CXC
entero; la tabla tuvo 0 filas en toda su historia). La tabla queda, con candado que impide que una
migración la dropee.

## De dónde vienen los datos

| Dato | De dónde sale | Vía | Cron / hora UTC | Cae en |
|---|---|---|---|---|
| **La cartera** | 🔴 **panel web**: `GET /estadodecuenta` → `POST /reportesmanager/crearreporteconsola` (devuelve un **uuid**) → `GET /reportesmanager/buscarreporteconsola/<uuid>` cada 2 s hasta `TERMINADO`. Parámetros copiados del botón del panel: **`desde = hasta = hoy`, `claseReporte: '4'`, `tipoReporte: 'ESTADOCUENTACLIENTE'`** (sin `tipoReporte` contesta `{"error":"TIPO_REPORTE_REQUERIDO"}`) | **Panel con sesión** (`web-client.ts`, login con `changesession="SI"`) | **`boston-cartera` 08:10 UTC = 03:10 a.m. de Panamá** | `switch_estadocuenta` → vista `switch_estadocuenta_aging_boston` |
| **Ventas** | `GET /apifactura/lista` + `GET /apinotacredito/lista` + `GET /apinotadebito/lista`, ventana 7 días. 🩸 **Las NC llegan negativas y se guardan en valor absoluto**; el signo lo pone la lectura | **API con token** | `switch-sync tipo=all` **06:30** (con ACS) + `tipo=facturas` **11:50 · 15:00 · 19:00 · 23:00** (las 8 empresas) | `switch_facturas` → `ventas_rollup_mensual_mv` |
| **Cobros** | `GET /apireporte/recibos?desde&hasta&porPagina&paginaActual` (**no está en el PDF del API**, y no trae id ni secuencial de recibo: por eso la unidad de reemplazo es el **mes entero**), ventana de los últimos 3 meses | **API** | `sync-recibos` **07:50 · 15:15 · 19:15 · 23:15** | `switch_recibos` |
| **Clientes** | `GET /apicliente/lista` | **API** | `sync-clientes-boston` — **SEMANAL, domingos 07:10 UTC** (`"10 7 * * 0"` en `vercel.json`, verificado el 5-sep-2026). 🔴 **Todavía NO ha corrido ni una vez**: se programó un sábado y su primera oportunidad es el domingo 6-sep. Antes: ninguno, porque el directorio viajaba dentro del estado de cuenta por API, vetado por cron para Boston, y las 4.915 filas llevan **37 días** sin tocarse | `switch_clientes` (🔴 **nunca `clientes_master`** — verificado: `src/lib/switch-api/clientes-directorio.ts` no nombra esa tabla en una sola consulta) |
| **Planilla y préstamos** | 🔴 **nada de Switch**: el reloj de asistencia y lo que carga Contabilidad a mano | — | `asistencia-vigia` 15:00 · 20:00 · 22:15 | `asistencia_*`, `prestamos_*` |
| **Costo / utilidad** | 🔴 **no se trae** (`utilidad: false`) | — | — | — |
| **Gastos** | 🔴 **fuera del cron a pedido de Daniel** | panel | ninguno (el manual `?empresas=confecciones_boston` lo acepta) | `egresos_varios` |
| **Renglones de factura, llegadas, catálogo de artículos** | 🔴 **Boston no está**: 0 filas a propósito | — | — | — |

🔴 **Por qué la cartera va por el panel y no por el API.** El camino del API es
`/apicliente/estadocuenta?clienteId=` **una llamada HTTP por cliente**, y Boston tiene **4.912
clientes** (las demás empresas: 136-139). Su único run exitoso de la historia tardó **3.240 s
(54 min)** contra un techo de función de **800 s**; y un proceso matado **no ejecuta `finally`**:
no dejaba heartbeat ni alerta, mataba el slot `switch-sync all-0630` (arrastrando a ACS, que en
el mismo run sincronizaba bien) y quemaba ~13 min de función 4 veces al día para nada. El
reporte del panel trae **todos los documentos abiertos en una respuesta (~4 s)**.

⚠️ **`EMPRESAS_ESTADOCUENTA_FUERA_DE_CRON` sigue conteniendo a Boston y es correcto**: dice
«el estadocuenta **por API** no corre por cron para esta empresa», y eso no cambió. Sacarla de
ahí volvería a meterla en `all-0630`.

⚠️ **La hora no es decorativa.** El login web usa `changesession="SI"`, que **EXPULSA** a quien
esté en el panel de Boston — y **el usuario configurado en Boston es el de Daniel**. A las 3 de
la mañana no hay nadie. Y las separaciones: `sync-recibos` 07:50 toca Boston (**20 min** antes),
`switch-articulos` 08:40 toca las 8 (**30 min** después), fuera de las ventanas de deploy.
Por el mismo motivo, **los egresos de Boston no se bajan por cron**: Daniel, 13-ago-2026,
*«ve avanzando con todas menos boston, ese usuario es mío y no entraré»*.

**Qué pasa si la fuente falla:**
- **La cartera**: 🔴 **no la recupera la reconciliación** (no está en `COLATERAL_CRONS`). Si
  falla, espera a mañana, y la **regla 1** de alertas («un dato que se mira está viejo», 24 h)
  es la que avisa por 🔧 SISTEMA. La pestaña además lo dice en pantalla.
- **El reporte llega corto**: `PISO_CLIENTES_REPORTE = 0.7` contra los clientes con saldo que
  la tabla ya conoce. Si no llega, **no se escribe NI se reconcilia**. Sin esa guarda, el
  reconcile pondría en **cero** la deuda de cada cliente que faltara, en silencio y con la
  corrida anotada `success`.
- **Un documento sin fecha**: se **rechaza**, y como el cuadre se arma solo con lo construido,
  eso lo desarma y **la corrida entera se corta sin escribir**. *«Preferimos la cartera de ayer
  entera y un error a la vista, que la de hoy con un documento menos.»*

## Las reglas que ya están fijadas

| Regla | Candado |
|---|---|
| 🔴 **Boston NUNCA se mezcla con el CXC del grupo** — ni una fila, ni un total, ni un export, ni un badge. Se cierra en la vista `switch_estadocuenta_aging`, **UNA sola vez**, con una condición que **EXCLUYE** (nunca enumera: enumerar dejó a joystep caerse en silencio y costó $15.262). ⚠️ **El operador real es `<>`, no un `NOT IN`** — leído de producción el 5-sep-2026: `WHERE COALESCE(s.saldo,0) <> 0 AND s.empresa_key <> 'confecciones_boston'::text`. Lo de fondo se sostiene (excluye, no enumera); el operador escrito aquí y en `CLAUDE.md` no es el que corre. ✅ **Medido: 211 filas del grupo, 0 de Boston, 6 empresas** | `cxc-boston-fuera-de-toda-superficie.test.ts` — **dos BARRIDOS sin listas de objetos**: el SQL recorre `supabase/migrations/` entera y arma la definición FINAL de cada VIEW/MV/FUNCTION; el TS recorre `src/` y exige que toda lectura de `switch_estadocuenta` acote `empresa_key` **en la misma cadena** |
| 🔴 **El CXC del grupo SÍ convive con el resto del sistema.** Aislarlo de más también es un error | el mismo archivo, bloque «el CXC del grupo SÍ convive» |
| **`switch_estadocuenta_aging_mv` MATERIALIZA la vista** (`SELECT v.* FROM switch_estadocuenta_aging v`), no copia su cuerpo | test aparte: «la MV NO lee la tabla base» |
| 🔴 **Quien ve Boston no ve el grupo.** El rol, la empresa, la key, los roles y las pestañas viven **una sola vez** en `src/lib/boston/rol.ts` | `boston-acceso.test.ts` (57 casos) — CONDUCTA: los handlers REALES de 14 rutas ajenas contestan **403** con cookie firmada, **y esas mismas rutas dejan entrar a `admin`** |
| **La empresa NUNCA viaja por query.** Un `?empresa=vistana` de un marcador viejo devuelve **Boston**, no un 400 que deje la pantalla en blanco. Se **fuerza**, no se valida | `boston-acceso.test.ts` — «la RUTA le fuerza la empresa a Boston» |
| **Las rutas DERIVAN su lista de roles, no la escriben a mano** | barrido en `boston-acceso.test.ts` |
| **La excepción es UNA sola: Préstamos** | barrido «`confecciones_boston` se dice UNA vez» |
| 🔴 **Los sueldos se recortan en el SERVIDOR y se ENUMERA lo que viaja** (`CAMPOS_SIN_DINERO`), nunca lo que se va. Un `delete linea.dinero` dejaría pasar cualquier campo de plata que alguien agregue mañana — y la línea lleva **SIETE**: `salarioMensual`, `baseSeguros`, `quincenalReferencia`, `extraMedido.monto`, `extraNoAprobada.monto`, `dinero`, `manuales` | `boston-acceso.test.ts` — «la línea recortada NO lleva un solo campo de plata» |
| **Tampoco viaja el MONTO de las extras**: 5,5 h a 1,25 por $43,45 dice que la rata es $6,32, y de la rata sale el mensual. Las **horas** sí viajan enteras | ídem |
| ✅ **`VE_SUELDOS_DE_BOSTON = true` desde el 3-sep-2026.** Daniel dijo que sí, y fue **una línea**. 🔑 **El mecanismo NO se borró**: `planillaSinDinero` y `lineaSinDinero` siguen enteros, así que volver a `false` vuelve a ser una línea y la pantalla vuelve sola a 5 columnas | `boston-acceso.test.ts` — «David ve los sueldos» **y** «el MECANISMO no se borró» · `components/boston-planilla-con-dinero.test.tsx` (11 casos que montan la pantalla en las **dos** direcciones) |
| **`gerente_boston` NO cae en `soloApruebaRoles()`.** Sin esa exclusión explícita, agregarlo a `APROBACIONES_ROLES` le habría **vaciado** la planilla el mismo día que Daniel la abrió | `boston-acceso.test.ts` |
| 🔴 **Todo o nada al aprobar**: si UNA sola persona del pedido no le corresponde, se rechaza la operación ENTERA | `asistencia-aprobador-empresa.test.ts` |
| **El `ccte_id` lleva el AÑO adentro.** Un documento sin fecha, o con el año fuera de 2000-2099, se **rechaza** y la corrida se corta sin escribir | `boston-cartera-web.test.ts` sección D + F (CONDUCTA: llama al sync de verdad y mira qué filas se escribieron **y en qué orden**) |
| 🔴 **Orden obligatorio: upsert → reconcile**, nunca al revés. Invertirlo deja la cartera en CERO | mutación «el reconcile corre ANTES del upsert» |
| **El guard de colisión mira TRES campos** (secuencial + fecha + monto). Solo la repetición EXACTA se deja pasar; cualquier diferencia **corta la corrida** | ídem |
| **El cuadre contra los `totales` de Switch corta la corrida si no da al centavo** — pero **NO cubre un reporte corto** (un reporte corto cuadra consigo mismo). Son guardas de cosas distintas | `boston-cartera-consola.test.ts` (25 casos, con una muestra REAL de producción en `fixtures/boston-cartera-consola.json`) |
| **La pestaña dice DE CUÁNDO es su plata**, con el MISMO `<SyncStatus />` del grupo, derivado de `empresasCarteraAparte()` | `components/cxc-boston-fecha-del-dato.test.tsx` (8 casos) — incluido «ninguna empresa del grupo se pinta en la pestaña» |
| **Ninguna cuenta se reimplementó**: la cartera es la misma vista, la planilla el mismo motor que la contadora cuadró al centavo, las ventas el mismo rollup de `/api/ventas/resumen-anual`, y el saldo de un préstamo sale de `calcularSaldoPrestamo` — **la función que se extrajo de `PrestamosClient.tsx`** para que las dos pantallas la compartan | — |
| **La cartera y los últimos pagos NO comparten ni una función de consulta con las del grupo.** Un helper común `pagosDe(empresa, cliente)` sería un parámetro, y **un parámetro es una puerta** | `cxc-boston-ultimos-pagos-route.test.ts` (Boston no trae al grupo) + `cxc-ultimos-pagos-route.test.ts` (el grupo no trae a Boston) |
| ✅ **Boston no entra a `clientes_master`** (el sync pide por INCLUSIÓN). Estuvo adentro 5 semanas y el ranking de Ventas publicó **$2,55 millones de venta que no existió**. **Re-medido el 5-sep-2026** (`select count(*), count(*) filter (where deleted), count(*) filter (where deleted is not true) from clientes_master`): **5.064 filas · 4.914 borradas · 150 vivas**. Y la prueba fina: de las 150 vivas, **una sola** comparte código con un cliente de Boston, y es **`TCKCTA` / «VENTAS LOCAL»** — el mostrador, que existe en las 8 empresas y que `CLAUDE.md` ya marca como «el único código que miente». **Ni un cliente real de Boston está vivo ahí.** | `clientes-master-solo-del-grupo.test.ts` |
| 🔴 **SU PLATA SUMA; SUS CLIENTES NO SE VEN.** ✅ **Verificado en las DOS direcciones el 5-sep-2026.** (a) **La venta suma**: la RPC del Resumen (`ventas_dashboard_summary_v2`) hace `GROUP BY f.empresa_key` sobre `switch_facturas` **sin ningún filtro de empresa**, y `empresasConFacturas()` incluye a Boston (`facturas: true` en `EMPRESA_SYNC_CAPABILITIES`, `src/lib/switch-api/empresas.ts:138`). Medido: **$472.856,97 en 2026 = 7,5% de los $6.267.955,39 de las 8 empresas** — Boston es la **4ª** de las 8, por encima de Active Shoes y de la propia Multifashion. (b) **Los clientes no se ven**: `empresasConCxc()` la deja fuera (`cxc: false`), la vista del grupo la excluye con un `<>`, y `clientes_master` tiene sus 4.914 filas marcadas `deleted`. | candado en las dos direcciones |
| **La ficha por dirección también se cierra**: `/api/clientes/[codigo]` contesta **404** (no 403 — un 403 sería un oráculo de qué clientes tiene Boston) | — |
| **La contraseña de David no está en el repo.** `isHash()` saltea toda contraseña que no empiece con `$2a$`/`$2b$` | `api/boston-david-sin-contrasena.test.ts` (5 casos, llama al login REAL) |
| **Los rótulos de las pestañas son CORTOS**: las 6 tienen que entrar en el iPhone, y «Cuentas por Cobrar» pasó a **«Por cobrar»** — que es lo que ya dice la tarjeta del Inicio que lleva ahí | `boston-acceso.test.ts` — «los rótulos son CORTOS» |
| **Catálogos NO es una pestaña de `/boston`** (las 4 marcas son de Fashion Group) y **Guías tampoco** | ídem |
| **`BostonTab` es la quinta pantalla de `tablas-anchas-ipad.test.ts`**: corte `lg`, `data-vista` FIJO | `tablas-anchas-ipad.test.ts` |

**Verificado por mutación**: 23/23 en `boston-acceso` · 16/16 en `boston-ve-catalogo` ·
14/14 en `boston-cartera-consola` · 13/13 en la identidad del `ccte_id` · 21/21 en
`cxc-clientes`. Los scripts traen una **mutación de CONTROL que a propósito no matchea**: si no
sale ⛔, el denunciador está roto y todos los ✅ valen lo mismo que un barrido vacío.

## Con qué conecta

### Qué lee de otros módulos

| Fuente | Para qué | Acotado por |
|---|---|---|
| `switch_estadocuenta_aging_boston` (vista) | la cartera, el Inicio y los saldos de la pestaña Clientes | disjunta por construcción |
| `switch_clientes` | la pestaña Clientes | `.eq("empresa_key", EMPRESA_BOSTON)` |
| `ventas_rollup_mensual_mv` | la pestaña Ventas y el Inicio — **el mismo rollup** que `/api/ventas/resumen-anual`, `/api/ventas/mes-anio` y Vista General | `.eq("empresa_key", EMPRESA_BOSTON)` |
| `switch_recibos` + `switch_ultimo_pago_cliente_v2` | «Último pago» y los últimos 3 pagos | `.eq("empresa_key", "confecciones_boston")` |
| **`/api/asistencia/planilla`** (el módulo Asistencia entero) | la pestaña Planilla — **el mismo motor**, sin una segunda aritmética de sueldos | la empresa la **fuerza el servidor** |
| `prestamos_empleados` + `calcularSaldoPrestamo` | la pestaña Préstamos — **la misma función** que `PrestamosClient` | ⚠️ **ninguno, a pedido de Daniel** |
| `asistencia_personas` | el conteo del Inicio | `.eq("empresa", …)` |
| `/api/sync-status` | la frescura, por empresa (`.eq`) | `empresasCarteraAparte()` |
| `lineaDeRechazos({familias:["cxc"], empresas: empresasCarteraAparte()})` | el aviso de lo que el guard descartó | ídem |
| `switch_estadocuenta_aging` (la del **grupo**) | 🔴 **una sola lectura, y solo de `nombre_normalized`**, para el chip «también en el grupo». **No suma nada** | es la única vez que las dos carteras se miran |

### Quién lee lo suyo

| Quién | Qué | Cuidado |
|---|---|---|
| **CXC del grupo** (⚠️ **`/cxc?tab=boston`** desde el 5-sep-2026; `/admin?tab=boston` redirige 307 con la query) | **la MISMA pestaña**, el mismo `<BostonTab />`, el mismo `/api/cxc/boston` — para admin y secretaria | son dos puertas al mismo componente, no dos implementaciones |
| **Ventas › Resumen** | una fila «Boston» con su venta | 🔴 **su venta SUMA**: $463.898,47 = 7,4% de 2026 (la cifra del post-mortem; el rollup mide hoy $465.785,97) |
| **Vista General** | ídem | — |
| **Asistencia** | David aparece como **aprobador de `confecciones_boston`**; su planilla sale del motor común | `asistencia_aprobador_empresa` |
| **Alertas 🔧 SISTEMA** | la **regla 1** vigila la frescura de la cartera de Boston **por empresa** (nunca un `MAX` global) desde el 24-ago-2026 | el invariante que no envejece: *toda empresa vigilada tiene que tener un cron que le refresque la cartera* |
| **`clientes_master` / Directorio / Búsqueda global / Ventas › Clientes / Comisiones** | **NADA** | y es el punto |
| **`integrity-checks.ts`** (`last_upload_age_cxc`) y **`home_dashboard_summary`** (`lastUpload`) | 🩸 leían `MAX(synced_at)` de `switch_estadocuenta` **sin filtro**. Hoy `.in("empresa_key", CXC_GRUPO_EMPRESA_KEYS)` | eran fugas **latentes**: hoy Boston va 13 h más atrasada, así que el MAX global daba justo el del grupo |

### Qué se rompería si se cambiara la forma de sus datos

- **Tocar el `<> 'confecciones_boston'` de `switch_estadocuenta_aging`** → las **390** filas de
  Boston entran al CXC del grupo. ⚠️ **Re-medido el 5-sep-2026**: el total del grupo pasaría de
  **$3.676.935,55 a $3.872.444,80** (+$195.509,25) y las filas de 211 a 601. Y **5 clientes
  quedarían con las dos deudas SUMADAS en una sola fila** — hoy son
  **ALADDIN · LA FRONTERA DUTY FREE · CITY MALL DAVID · WOLF MALL CENTER INT. · CITY MALL PASO
  CANOA** (la escritura del 4-sep decía «VENTAS LOCAL» en vez de «CITY MALL DAVID»). El peor es
  LA FRONTERA DUTY FREE, que ya tiene deuda en **las 6** empresas del grupo. Literalmente lo que
  Daniel prohibió.
- **Que `switch_estadocuenta_aging_mv` vuelva a ser una copia del cuerpo de la vista** → el
  mismo bug del 12-ago-2026 (VIEW 211 filas / 0 de Boston · MV 593 / 382 de Boston), tapado
  solo por un `useMemo` de React.
- **Renombrar `company_key` o los buckets `d0_90/d91_120/d121_plus`** → se caen a la vez la
  pestaña, el Inicio y la pestaña Clientes.
- **Cambiar la fórmula del `ccte_id`** → duplicados y colisiones: el mismo `secuencial` nombra
  DOS documentos separados por años (**52 grupos así**, medidos).
- **Quitar `VE_SUELDOS_DE_BOSTON` en vez de ponerlo en `false`** → se pierde el mecanismo, y
  volver a esconder los sueldos deja de ser una línea.
- **Sumar `gerente_boston` a `asistenciaRoles()`** → le abre las 11 rutas de Asistencia (la
  planilla del GRUPO, con los sueldos de las 37 personas).
- **Sumar `gerente_boston` a los roles del módulo Préstamos** → le abre **9 verbos de
  escritura** en 6 rutas, tres de las cuales ni pasan por `requireRole`.

## Por qué está así

| Decisión | Cita y fecha |
|---|---|
| **Existe el módulo** | Daniel, 27-ago-2026: ***«si crea el usuario david, david debe de ver cxc boston… el es mi hermano y ve toda la operacion de confecciones boston, no quiero que vea info de fashion group»*** |
| **Boston no se mezcla con el grupo, y el grupo sí convive con todo** | Daniel, 12-ago-2026: ***«debe de ser cxc de fashion group y otro aparte de boston, no deben de ni convivir juntos. cxc de fashion group si debe de convivir con todo el sistema por guias, marketing, clientes, ventas, ect, ect, eso quiero que este muy claro»*** |
| **Un cliente que está en las dos carteras no se toca** | Daniel: ***«si un cliente esta en el grupo de 6 empresas y mismo cliente en conf boston, quiero q no se toque»*** |
| **Estrellas y notas SEPARADAS por cartera** | Daniel: ***«es la misma persona, pero no lo quiero ver en fashion group porque no tiene el mismo codigo»*** |
| **Los clientes de Boston viven solo en su tab** | Daniel, 30-jul-2026: ***«clientes de boston solo quiero verlos solo en su tab. igual que multifashion. esos no deben de convivir con el resto del sistema»*** |
| **Préstamos: TODOS** | Daniel: ***«Préstamos (TODOS, no solo los de Boston)»*** — dicho aparte y en mayúsculas justamente porque sabe que es la excepción |
| **Sin Guías** | Daniel lo excluyó explícitamente |
| **Catálogos sí, solo ver** | Daniel, 27-ago-2026: ***«catalogo para david si, solo eso»***. El #659 lo había dejado afuera con buen motivo y le pasó la decisión; **él decidió que sí, sabiendo eso** |
| **David ve los sueldos de su planilla** | Daniel, 31-ago/3-sep-2026: **sí**. Nació en `false` porque era el default seguro — mostrar de más un sueldo no se puede deshacer |
| **David NO edita los montos manuales** | decisión de Daniel; el POST exige `asistenciaRoles()` |
| **David aprueba solo las horas de SU empresa** | 31-ago-2026, tras medir que Julio (empleado de Vistana, cuenta compartida `Bodega`) había aprobado **57 días de Confecciones Boston** que no le tocaban |
| **Los egresos de Boston no se bajan por cron** | Daniel, 13-ago-2026: ***«ve avanzando con todas menos boston, ese usuario es mio y no entrare»***. ⚠️ Y aun así: ***«si quiero ver gastos de boston»*** — la pestaña sigue existiendo |
| **La 5ª tarjeta «Cobrado julio» se quitó** | tenía el monto escrito a mano en el código; aprobado por Daniel |
| **La info se muestra tal cual, incluso lo rechazado** | Daniel: ***«el sistema debe de mostrar la info tal cual»*** — de ahí el aviso de lo que el guard dejó afuera |
| **Un usuario dedicado por empresa en Switch resolvería la sesión única** | Daniel, 3-sep-2026: ***«no»***. **No volver a proponerlo** |

## Lo que se intentó y se retiró

| Qué | Por qué se fue | Cuándo |
|---|---|---|
| **El sync de estado de cuenta de Boston por API** (una llamada HTTP por cliente) | 4.912 clientes, **3.240 s (54 min)** contra un techo de 800 s. Cada corrida moría, no dejaba heartbeat ni alerta, mataba el slot `all-0630` y quemaba ~13 min de función 4 veces al día | 30-jul-2026, reemplazado por `boston-cartera` |
| **Partir ese sync en tandas** | imposible por construcción: el reconcile pone `saldo = 0` a TODA la empresa por `synced_at < runStamp`, así que **cada tanda borraba lo que cargó la anterior** | — |
| **`POST /estadodecuenta/obtener`** (el transporte viejo del reporte web) | Switch cambió el motor de reportes el **19-ago-2026 a las 12:37:21** y la ruta dejó de existir: empezó a devolver **HTTP 200 con la página de excepción** («Controller method not found»). **5 días congelada** | 24-ago-2026, reemplazado por el flujo de uuid |
| **El `ccte_id` derivado solo del `secuencial`** (`serie × 10⁷ + correlativo`) | Switch reinicia la numeración: el mismo secuencial nombra **dos documentos distintos** separados por años. **52 grupos así**. El upsert colapsaba uno en silencio | 25-ago-2026, se le metió el AÑO adentro |
| **2.178 filas zombi** (1.069 del sync viejo por API + 1.109 de la identidad vieja) | todas en saldo $0,00, verificado antes de tocarlas. Se barrieron con **LISTA EXPLÍCITA de cada `ccte_id`**, nunca un `LIKE` ni un rango | `20260826150000` |
| **La MV del aging como copia verbatim del cuerpo de la vista** | la migración del 28-jul le puso el filtro a la VISTA y **se olvidó de la MV** | 12-ago-2026: la MV pasó a `SELECT v.*` de la vista |
| **`CompanySummary.tsx`** (vista de deuda por empresa) | cero importadores. Se **BORRÓ**, no se encendió: encender una superficie nueva de cartera es justo donde este repo se quemó | 24-ago-2026 |
| **El segundo buscador de `ClientTable`**, `ClientRow`, `handleSaveEdit`/`onSaveEdit`, `/api/vendors` y `/api/upload` del CXC | código muerto; el riesgo no era el peso sino que **alguien arregle el buscador equivocado y jure que la pantalla no cambia** | 24-ago-2026 |
| **`EMPRESAS_ESTADOCUENTA_FUERA_DE_CRON` como filtro de la alerta de frescura** | era **no-op** (Boston es `cxc:false`, nunca había estado adentro) y llevaba tres semanas vencido | 24-ago-2026: `empresasDe("cartera")` pasó a `empresasConEstadoCuenta()` |
| **`VE_SUELDOS_DE_BOSTON = false`** | Daniel contestó que sí. **El mecanismo NO se retiró** | 3-sep-2026 |
| **La tolerancia «`asistencia_aprobador_empresa` no existe»** (`faltaTabla` fail-open) | la tabla existe desde `20260903120000`. El campo se conserva en el tipo porque las rutas lo leen para el aviso, pero **siempre es `false`** | 3-sep-2026 |

## Cuánto se usa

Medido el 4-sep-2026. ⚠️ `activity_logs` solo registra **logins** para este rol: el módulo es
casi todo de solo lectura, así que **no hay escrituras que contar**. Las 45 filas de
`activity_logs` de los dos roles gerentes son **todas `login`**.

- **Logins de `gerente_boston`**: total **5** ✅ re-medido el 5-sep-2026, **los 5 son `login`**,
  el primero el **30-ago-2026 02:09 UTC** y el último el **2-sep-2026 21:05 UTC**.
- **Sesiones**: **5** filas para `david`, la última con `last_seen` del **4-sep-2026 17:01 UTC**.
  ⚠️ La escritura del 4-sep decía «4 vivas» y «David estaba usando el sistema hoy» — al 5-sep
  son 5 filas y **no volvió a entrar**.
- **Horario de Panamá** (5 logins): 12 h · 16 h · 17 h · 21 h ×2. Muestra chica; no hay patrón.
- **Comparación honesta**: Jennifer lleva 40 logins y David 5. El módulo de David tiene **8
  días de vida útil** (su primer login fue el 30-ago) contra los dos meses de Multifashion.
- **Filas que el módulo escribe**: **cero, y desde el 4-sep-2026 cero de verdad.** Las cuatro
  rutas de `/api/boston/**` son GET y la planilla es de solo lectura para él. Lo único que David
  podía escribir eran las estrellas de favoritos de su cartera — y los favoritos se retiraron.
- Lo que sí se puede medir del **dato**, no del uso: la cartera se reescribe entera **una vez
  al día** (`boston-cartera` 08:10) — ✅ **7 corridas `success` de 7 en los últimos 7 días**, la
  última hoy **5-sep 08:10:09 → 08:10:24 UTC (15 segundos)**, con **919 filas insertadas, 6
  actualizadas y 1 descartada**. Sus facturas: **35 de 35**. Sus recibos: **28 de 28**. Sus
  artículos: 7 de 7. Su costo: 7 de 7. **Cero fallos en toda la semana.**

## Qué papeles y Excel produce

🔴 **NINGUNO, y es un hueco que conviene tener presente.**

- No hay Excel ni PDF en `/boston` ni en `/api/boston/**` (barrido: cero `workbook*`, cero
  `jsPDF`, cero botón de descarga).
- ⚠️ **Matiz del 5-sep-2026: ahora SÍ hay estado de cuenta documento por documento, pero solo
  EN PANTALLA.** El cajón «Documentos» de la pestaña (ruta nueva
  `GET /api/cxc/boston/estado-cuenta`) lo muestra completo. Lo que sigue faltando es **el PDF y
  el correo**: `/api/cxc/estado-cuenta/[codigo]` y `/api/cxc/enviar-email` están acotados a
  **`CXC_GRUPO_EMPRESA_KEYS`** (las 6) y a `CXC_ROLES` — donde `gerente_boston` no está.
  ✅ Verificado el 5-sep: las **dos rutas NUEVAS** del rediseño de hoy
  (`/api/cxc/cobrar-lote` y `/api/cxc/envios`) también dejan a Boston afuera, y lo dicen en su
  encabezado («Boston no entra por ningún lado», «ES SOLO EL CXC DEL GRUPO»). O sea que
  **imprimir o mandar por correo el estado de cuenta de un cliente de Boston se sigue haciendo
  desde el panel de Switch.** La hoja «Cobrar» ofrece WhatsApp y copiar el mensaje, que no es lo
  mismo.
- **La planilla no se exporta desde `/boston`.** El Excel y el PDF de planilla —los que firma
  la contadora— salen del módulo Asistencia, que exige `asistenciaRoles()`. David ve el cuadro
  en pantalla y no puede bajarlo.
- **Ninguna alerta de Telegram nombra a Boston por su negocio.** Lo único que puede sonar es
  🔧 SISTEMA por la **regla 1** («la cartera de Confecciones Boston está vieja»), que es una
  avería, no un papel.

## Cómo probarlo a mano

**1 · La cartera cuadra con Switch**
1. Entra como admin a `/boston?tab=cxc` (o a **`/cxc?tab=boston`**: es la misma pestaña; el
   viejo `/admin?tab=boston` sigue llegando por el redirect 307).
2. Arriba dice de cuándo es el dato. Si es de hace más de 26 h, sale el ámbar — el número no
   está mal, está viejo.
3. Anota **Total pendiente** y los tres tramos.
4. En el panel de Switch de CONFECCIONES BOSTON: Reportes → Estado de cuenta → Antigüedad, con
   `desde = hasta = hoy`. ⚠️ **Entrar expulsa a quien esté**, y en Boston el usuario es el de
   Daniel: avísale antes.
5. Los totales tienen que dar **al centavo**. Si no dan, el sync no habría escrito: `cuadraConSwitch`
   corta la corrida antes de tocar la base.
6. Para confirmar que la corrida de hoy entró: `switch_sync_log` con
   `empresa_key = 'confecciones_boston'` y `sync_type = 'estadocuenta'`, `status = 'success'`,
   `finished_at` de esta madrugada.
7. **Un documento que el guard rechazó** aparece en `skip_details` de esa fila **y en pantalla**,
   en el aviso arriba de las píldoras. ✅ **Sigue ahí, todos los días** — re-verificado el
   5-sep-2026 leyendo las 5 últimas corridas de `estadocuenta` de Boston: las 5 traen
   `records_skipped = 1` con el MISMO renglón,
   `{"campo": "monto_imposible_cxc", "secuencial": "155-000000129 · VENTAS", "valorCrudo":
   {"umbral": 2000000, "columnas": [{"columna":"total","valor":266541352},
   {"columna":"saldo","valor":266541352}, {"columna":"debito","valor":266541352}]}}`.
   O sea **$266.541.352 contra un umbral de $2.000.000**. Está mal **en Switch** — es un
   pendiente de Daniel, no un bug de la app, y el guard hace exactamente lo que debe: rechaza la
   fila y conserva el último valor bueno.

**2 · Que David solo ve lo suyo**
1. Entra como `david`. Tiene que aterrizar en `/boston`, **no** en el Inicio del grupo.
2. Arriba, en el menú, solo tres fichas: Confecciones Boston, Catálogos y Asistencia y Planilla.
3. Escribe `/cxc` a mano (y `/admin`, que redirige ahí) → tiene que rebotar. Escribe `/ventas`
   → rebota. Toca el buscador
   global → **no está dibujado**.
4. En Catálogos: entra a una marca, ve fotos, código, nombre, existencia y **precio de venta**.
   **No** tiene que aparecer «Administrar» ni «Pedidos», ni costo ni margen.
5. En Asistencia: **solo** la pestaña Aprobaciones, y **solo** con gente de Confecciones Boston.

**3 · La planilla**
1. `/boston?tab=planilla`. Abre **vacía**, diciendo «Elige el período que vas a pagar».
2. Elige una quincena. Tienen que aparecer las **18 columnas** de dinero y el pie de **TOTAL**.
3. Compara una fila contra la planilla del grupo (`/asistencia?tab=planilla` con
   `empresa=confecciones_boston`, como admin): **tiene que ser idéntica al centavo** — es el
   mismo motor.
4. Prueba `?empresa=vistana` en la URL siendo David: tiene que devolver **Boston igual**, no
   un error.

**4 · Las ventas**
1. `/boston?tab=ventas`. El año en curso abre desplegado.
2. Cruza el total de un mes contra `ventas_rollup_mensual_mv` (`empresa_key='confecciones_boston'`)
   o contra Ventas › Resumen (fila Boston) siendo admin: **tiene que ser el mismo número**.
3. Si Switch muestra más, revisa que no estés sumando ITBMS o notas de crédito en positivo
   (Boston tiene 1.210 NC guardadas en positivo).

**5 · Los clientes**
1. `/boston?tab=clientes`. Sin escribir, salen los que tienen saldo.
2. Escribe 3+ letras: busca contra los 4.915. Si dice «hay más, afina la búsqueda», estás en
   el tope de 100.
3. ⚠️ Un cliente con saldo que **no** aparezca aquí pero sí en «Por cobrar» no es un bug de la
   pantalla: es que no tiene ficha en `switch_clientes`. Hoy son **8**.

## Qué lo rompe

| Qué falla | Cómo se nota | Qué pasa exactamente |
|---|---|---|
| **Switch vuelve a cambiar el motor de reportes** (pasó el 19-ago-2026) | 🩸 la ruta devuelve **HTTP 200 con la página de excepción**: el `status` no dice nada | `jsonDeSwitch` valida **por forma**, no por status. Si no reconoce la respuesta, el sync falla; **dos corridas seguidas caídas** → 🔧 SISTEMA. Y la **regla 1** (24 h) avisa igual, aunque el sync se quedara callado. La pestaña además dice la fecha del dato |
| **El reporte llega corto** | ninguna señal en la respuesta: **un reporte corto cuadra al centavo consigo mismo** | `PISO_CLIENTES_REPORTE = 0.7` sobre los clientes con saldo que la tabla ya conoce (hoy: la tabla conoce 383, el reporte trae 386). Si no llega, **no se escribe ni se reconcilia**. Con la tabla vacía no hay vara (primera carga). **Un dry-run corto también falla, a propósito** |
| **`boston-cartera` no corre un día** | la pestaña muestra la fecha vieja en ámbar | 🔴 **la reconciliación NO lo recupera**: espera a mañana. La regla 1 suena una vez por día mientras el dato esté viejo — *«el día que la alerta deje de tener acción posible, la salida NO es volver a excluir a Boston: es arreglar el sync»* |
| **Un documento sin fecha, o con año fuera de 2000-2099** | la corrida entera se corta sin escribir | preferimos la cartera de ayer entera y un error a la vista |
| **Dos documentos con el mismo secuencial en el MISMO año** | la corrida se corta | fail-closed y ruidoso, nunca una fila pisando a otra |
| **Se invierte el orden `upsert → reconcile`** | 🩸 **la cartera queda en CERO** | mutación cazada |
| **Alguien lee `switch_estadocuenta` sin acotar `empresa_key`** | las 985 filas de Boston se suman a las del grupo | BARRIDO 2 del candado |
| **Alguien agrega una vista o una ruta nueva de cartera** | nace insegura | BARRIDO 1 y 2 (no son listas de objetos: recorren `supabase/migrations/` y `src/` enteros) |
| **La migración de `asistencia_aprobador_empresa` no hubiera corrido** | ya no aplica: la tolerancia se retiró el 3-sep-2026 | hoy, **sin filas propias, un aprobador no aprueba nada** — y lo ve, porque el cuadro le sale vacío |
| **`switch_clientes` de Boston se queda vieja** | la pestaña Clientes muestra nombres viejos y no conoce a nadie dado de alta después de la última corrida | 🔴 **ES EL ESTADO DE HOY, 5-sep-2026**: las 4.915 filas siguen con `synced_at = 2026-07-30 06:31:07.524` y `switch_sync_log` no tiene una sola corrida de `clientes` para Boston. El cron `sync-clientes-boston` está escrito y programado (domingos 07:10 UTC) pero **estrena mañana**. ✅ Lo que ya funciona es el aviso: la **alerta B sonó hoy 10:00 UTC** (`cron_email_errors` → `silencio_de_datos:Confecciones Boston`, `confecciones_boston/switch_clientes:quieta`), umbral semanal de **165 h**. 🩸 El hueco original no era un sync que falla: era un sync **que no existía**, y por eso ninguna alerta lo cubría |
| **`ventas_rollup_mensual_mv` no se refresca** | la pestaña Ventas y la tarjeta del Inicio se congelan | se refresca con `rpc refresh_ventas_rollup_mensual_mv` |
| **Daniel entra al panel de Boston de madrugada** | el cron de las 08:10 recibe la sesión tomada | el login usa `changesession="SI"`: **quien entra después, gana** |
| **`db-max-rows` = 1000** | las 4 rutas paginan a mano (`PAGE = 1000`); la cartera tiene 390 filas y `switch_ultimo_pago_cliente_v2` de Boston tenía **1.947** — sin paginar, 947 clientes se veían como «sin último pago» | ya arreglado el 13-ago-2026 |

## Lo que sobra o no cuadra

1. 🔴 **SIGUE VIVO (5-sep-2026): `BostonTab.tsx:224-225` dice que Boston tiene `recibos: false`
   en `EMPRESA_SYNC_CAPABILITIES` y que «su cartera va por Brand It». Es FALSO.**
   Re-verificado hoy: `src/lib/switch-api/empresas.ts:138` dice
   `confecciones_boston: { facturas: true, cxc: false, estadoCuenta: true, cxp: false,
   recibos: true, utilidad: false }`, hay **7.674 recibos suyos** y **28 corridas `success` de
   `recibos` en los últimos 7 días**. Ese comentario es el que justifica por qué se quitó la
   tarjeta «Cobrado julio» — la decisión está bien, el motivo escrito ya no. El rediseño de hoy
   **lo arrastró tal cual**.
2. 🔴 **SIGUE VIVO: `src/app/api/asistencia/planilla/route.ts:160` dice «David ve el cuadro
   ENTERO de Boston, pero por defecto SIN la plata … Daniel todavía no contestó si su hermano ve
   los sueldos».** Contestó el 31-ago y **`VE_SUELDOS_DE_BOSTON = true`** desde el 3-sep
   (verificado hoy en `src/lib/boston/rol.ts:103`). El comentario dice lo contrario de lo que
   hace el código de al lado.
3. 🔴 **SIGUE VIVO: `src/lib/asistencia/guard.ts:63-74` dice que los módulos de David son
   `["boston", "catalogos"]` y que «no tiene `asistencia`, ni puede heredarlo».**
   Re-medido el 5-sep: `role_permissions.gerente_boston = ["boston","catalogos","asistencia"]`.
   El mecanismo sigue funcionando (por eso no se rompió nada), pero el motivo escrito ya no es
   el vigente.
4. 🔴 **SIGUE VIVO: el título del test dice una cosa y la aserción otra.**
   `boston-acceso.test.ts:241` se llama *«sus módulos por defecto son exactamente
   ['boston', 'catalogos']»* y compara contra `SUS_MODULOS` (línea 81) `= [MODULO_BOSTON,
   "catalogos", "asistencia"]` — **tres**. El candado está bien; el rótulo quedó viejo.
5. **8 clientes con saldo abierto no aparecen en la pestaña Clientes** porque no tienen ficha
   en `switch_clientes` (medidos, $748,68 en total). La pantalla no lo dice.
6. **`TCKCTA` —el mostrador, que no es un cliente— está en la cartera de Boston** con $25,15.
   `esMostrador()` existe y se usa en los rankings de Ventas; esta pestaña no lo aplica.
7. 🔴🔴 **NO RESUELTO TODAVÍA — `switch_clientes` de Boston lleva 37 días congelada, HOY.**
   El arreglo está escrito, commiteado y programado (`/api/cron/sync-clientes-boston`, domingos
   07:10 UTC) **pero no ha corrido ni una vez**: hoy 5-sep es sábado y la primera corrida de su
   vida es mañana. Las 4.915 filas siguen con `synced_at = 2026-07-30 06:31:07.524`, y
   `switch_sync_log` no tiene una sola fila de `sync_type='clientes'` para Boston.
   ✅ Lo que **sí** funciona ya: la **alerta B sonó hoy a las 10:00 UTC**
   (`cron_email_errors` → `silencio_de_datos:Confecciones Boston` ·
   `confecciones_boston/switch_clientes:quieta`). **Marcar como resuelto el lunes, no antes**, y
   con las dos consultas de verificación que están en el bloque de esa tabla.
8. **La pestaña Clientes no muestra el email** aunque el endpoint lo devuelve (`email` viaja en
   el JSON y ningún layout lo pinta).
9. **`/api/boston/clientes` no puede decir «hay más» en modo saldo**: `truncado` se calcula
   solo con `?q=`. Con más de 1.000 clientes con saldo la lista se cortaría en silencio (hoy
   son 390, así que no pasa).
10. **`prestamos_empleados.empresa` guarda el NOMBRE de la empresa** («Confecciones Boston»)
    mientras `asistencia_personas.empresa` guarda la **key** (`confecciones_boston`). El Inicio
    tiene que traducir con `EMPRESA_KEY_TO_NAME` para contar una tarjeta.
11. **La cartera de Boston no tiene estado de cuenta en PDF ni por correo** (ver «Qué papeles
    produce»). Es la diferencia funcional más grande contra el CXC del grupo y no está escrita
    en ningún lado.
12. **`cxc_client_overrides` y `cxc_contact_log` comparten `nombre_normalized` entre las dos
    carteras.** Ya está anotado en el post-mortem como pendiente de decisión de Daniel.
13. ⚠️ **El comentario de `src/lib/cxc/boston-roles.ts` apunta a
    `app/admin/components/TabsCartera.tsx`, y esa carpeta ya no existe**: el CXC se mudó a
    `src/app/cxc/` el 5-sep-2026 (en `src/app/admin/` solo quedó `usuarios`). Y desde el 27-ago
    hay una segunda lectora (`BostonShell` vía `rol.ts`) que el archivo tampoco menciona.
14. **La pestaña Préstamos ordena por saldo y no distingue empresa en el orden**: los de
    Vistana y Fashion Wear se intercalan con los de Boston. Es lo que Daniel pidió (todos
    juntos), pero la única señal de empresa es la línea gris bajo el nombre.
15. ⚠️ **`CXC_ROLES = ["admin","secretaria","vendedor"]` está escrito a mano en NUEVE archivos,
    no en siete** (re-contado el 5-sep-2026 con `grep -rn "const CXC_ROLES" src/`):
    `overrides` · `enviar-email` · `ultimos-pagos` · **`cobrar-lote`** · **`envios`** ·
    `ultima-compra` · `contact-log` · `estado-cuenta/[codigo]` · `ultimo-pago`.
    Las dos nuevas **nacieron hoy** con el rediseño del CXC — o sea que el patrón no solo sigue
    vivo, **está creciendo**. Es exactamente la lista duplicada que `boston-roles.ts` vino a
    matar en su lado. No es un bug hoy —las nueve dicen lo mismo— pero es lo que hace caro
    cualquier cambio de permisos del CXC.

16. ⚠️ **El texto de la pestaña Ventas es inexacto (5-sep-2026).** Dice *«De Confecciones Boston
    no se trae el costo desde Switch»*, y el costo **sí llega**: `ventas_rollup_mensual_mv` tiene
    **$298.739,11** de costo 2026 para Boston, y `switch_articulo_diario` tiene **18.064 filas
    suyas** (hasta el 4-sep) que suman **$470.421,08** en 2026. Lo verdadero es lo otro que dice
    el mismo comentario del archivo: **el reporte de utilidad nunca se sincronizó ni se
    certificó** (`utilidad: false`), y las dos fuentes de costo que sí existen **no cuadran entre
    sí** — justamente por eso no se publica. La decisión está bien; la frase de la pantalla dice
    «no se trae» donde lo cierto es «no está certificado».

17. ⚠️ **Los 5 clientes que están en las dos carteras cambiaron de lista.** Medidos hoy
    (`join` por `nombre_normalized` entre las dos vistas de aging): **ALADDIN · LA FRONTERA DUTY
    FREE · CITY MALL DAVID · WOLF MALL CENTER INT. · CITY MALL PASO CANOA**. La escritura del
    4-sep nombraba «VENTAS LOCAL» en vez de «CITY MALL DAVID». Son los que llevan el chip
    «también en el grupo» y los que comparten `nombre_normalized` en `cxc_client_overrides` /
    `cxc_contact_log` (punto 12).

---
---

# Lo que estaba mal — verificación del 5-sep-2026

> Barrido completo del archivo contra **producción** (Management API de Supabase, solo lectura)
> y contra el **código fuente**. Se revisaron **97 afirmaciones factuales**: **73 confirmadas
> ✅**, **22 corregidas ⚠️** y **2 falsas ❌**. La escritura anterior es del 4-sep-2026, así que
> buena parte de las correcciones son cifras que se movieron en un día; las que importan de
> verdad están arriba de todo.
>
> 🔴 **Titular: el aislamiento de Boston NO tiene ninguna fuga.** Se midió en las dos
> direcciones, en la base y en el código, y aguanta — incluido el rediseño del CXC de hoy, que
> nació con Boston afuera de sus dos rutas nuevas.

## Lo grave

### 1. ❌ «El directorio de clientes de Boston se arregló el 5-sep-2026» — **todavía no**

| | |
|---|---|
| **Qué decía** | «🩸 Estuvo 37 DÍAS CONGELADA, y **se arregló** el 5-sep-2026» · «**Hoy la refresca** `sync-clientes-boston`» · en «Lo que sobra»: «✅ **RESUELTO** el 5-sep-2026» |
| **Qué es** | El cron está **escrito, commiteado y programado**, pero **no ha corrido ni una sola vez**. Las 4.915 filas siguen con `synced_at = 2026-07-30 06:31:07.524`, al milisegundo. Van **37 días**. |
| **Por qué** | El cron es **semanal, domingos 07:10 UTC** (`"10 7 * * 0"`), y se escribió un **sábado**. Su primera corrida es **mañana, domingo 6-sep**. No es un fallo — es que la doc dio por hecho el resultado antes de que el mecanismo tuviera su turno. |
| **Cómo se midió** | `select empresa_key, count(*), min(synced_at), max(synced_at), count(distinct synced_at) from switch_clientes group by 1` → Boston 4.915 filas, **1 solo `synced_at`**, del 30-jul. Contraste: ACS escribió hoy 11:30 UTC y las 6 del grupo hoy 16:00–16:11. Y `select sync_type, count(*), max(started_at) from switch_sync_log where empresa_key='confecciones_boston' group by 1` **no devuelve ninguna fila de tipo `clientes`**. |
| **Lo bueno** | ✅ La **alerta B ya funciona y sonó hoy**: `select tipo, max(created_at), max(error_message) from cron_email_errors where tipo like 'silencio%'` → `silencio_de_datos:Confecciones Boston` · **2026-09-05 10:00:28 UTC** · `confecciones_boston/switch_clientes:quieta`. El hueco que antes no cubría nadie hoy avisa solo. |
| **Qué hacer** | El **lunes 7-sep**, dos consultas: `max(synced_at)` de esa tabla tiene que decir domingo ~07:10, y `switch_sync_log` tiene que traer una fila `clientes` en `success`. Recién ahí se marca resuelto. |

### 2. ❌ «Los clientes de la cartera de Boston cruzan mejor por `cliente_switch_id` que por código»

| | |
|---|---|
| **Qué decía** | «de los 390 clientes de la cartera, solo **347** cruzan por código contra los 1.978 códigos distintos de recibos; **por id cruzan 382**» |
| **Qué es** | **346 por código y 346 por id — el mismo número.** Cambiar de llave no rescata a nadie. El «382» es el cruce contra **`switch_clientes`** (el directorio), no contra los recibos: dos mediciones distintas mezcladas en una frase. |
| **Cómo se midió** | Tres subconsultas en una: `count(distinct cliente_codigo)` de `switch_recibos` de Boston = **1.978**; `exists` por `cliente_codigo` = **346**; `exists` por `cliente_switch_id` = **346**. Y el 382 se reprodujo aparte contra `switch_clientes`, por las dos llaves, dando 382 en las dos. |
| **Qué sí es cierto** | El código de la ruta **sí** cruza por `cliente_switch_id`, y hace bien: es la llave del `DISTINCT ON` de `switch_ultimo_pago_cliente_v2` y por eso pagina estable. Pero **no gana cobertura**. |

## Lo que cambió porque el sistema cambió hoy

| # | Qué decía | Qué es | Cómo se midió |
|---|---|---|---|
| 3 | La pestaña «Por cobrar» con 4 píldoras flotando, botón «Últimos pagos ›» y columna «Último pago» | ⚠️ **Se rediseñó hoy** (`e1ae7258`): tira de totales **parada sobre sus columnas** en la misma grilla de 12; botón **«Cobrar»** + **«Documentos»** por fila; los tramos finos en el `title`; «Último pago» bajo el nombre; el bloque de últimos pagos se retiró (Boston es una empresa sola). La hoja «Cobrar» tiene **tres salidas** (WhatsApp · Copiar · Documentos) y **no tiene correo ni PDF a propósito**. | Lectura de `src/components/cxc/BostonTab.tsx` (460 líneas, 289 cambiadas hoy) y `BostonHojaCobrar.tsx`; `git show --stat e1ae7258` |
| 4 | El CXC vive en `/admin` | ⚠️ **Se mudó a `/cxc`** hoy. `/admin` redirige **307** y Next arrastra la query, así que `/admin?tab=boston` sigue llegando. `/admin/usuarios` y `/admin/data-health` **no** se movieron. | `next.config.js:89`; `ls src/app/admin/` → solo `usuarios` |
| 5 | La vista de Boston trae `d0_90 · d91_120 · d121_plus · total` | ⚠️ **Ganó 7 columnas hoy** (migración `20260928120000`, aplicada): `d0_30 · d31_60 · d61_90 · d121_180 · d181_270 · d271_365 · mas_365`. ✅ **Los tres tramos visibles no se movieron, verificado fila por fila**. | `count(*) filter (where round(d0_90,2) <> round(d0_30+d31_60+d61_90,2))` → **0** de 390; ídem `d121_plus` → 0; ídem `total` → 0 |
| 6 | `CXC_ROLES` escrito a mano en **SIETE** archivos | ⚠️ **NUEVE**. Las dos nuevas (`cobrar-lote`, `envios`) **nacieron hoy**: el patrón no solo sigue vivo, está creciendo. | `grep -rn "const CXC_ROLES" src/` |
| 7 | La cartera de Boston no tiene estado de cuenta | ⚠️ **Ahora sí, documento por documento, EN PANTALLA** (ruta nueva `GET /api/cxc/boston/estado-cuenta`). Lo que sigue faltando es **PDF y correo**. | `src/app/api/cxc/boston/estado-cuenta/route.ts`, nacido en `e1ae7258` |
| 8 | La bandera `activo` separa los préstamos vivos de los archivados | ⚠️ **Se retiró** con el rediseño de Préstamos (`c4aee92d`). El Inicio de Boston cuenta a **quien debe**, con `calcularSaldoPrestamo`. El «15 activos de 32» describe un mecanismo que ya no existe. | `/api/boston/inicio/route.ts:124-143` |

## Cifras que se movieron

| Dato | Decía (4-sep) | Es (5-sep) | Consulta |
|---|---:|---:|---|
| `switch_estadocuenta` de Boston | 985 / 920 con saldo / 65 en cero | **990 / 919 / 71** | `count(*)`, `filter (where coalesce(saldo,0)<>0)` |
| Cartera de Boston · total | $190.399,07 | **$195.509,25** | `sum(total)` de `switch_estadocuenta_aging_boston` |
| Cartera de Boston · tramos | 0-90 $53.502,14 · 91-120 $11.906,68 · 121+ $124.990,25 | **$58.612,32 · $11.956,68 · $124.940,25** | ídem, por columna |
| Cartera del grupo | 211 filas · $3.685.289,04 | 211 filas · **$3.676.935,55** | `switch_estadocuenta_aging`; se re-sincronizó a las 16:00 UTC |
| Notas de crédito de Boston | 1.210 | **1.216**, las 9.165 filas en POSITIVO | `group by tipo_comprobante` |
| Boston 2026 (rollup) | $465.785,97 · costo $297.915,43 | **$472.856,97 · $298.739,11** | `ventas_rollup_mensual_mv` |
| Boston, agosto 2026 | crudo $87.661,61 / neto $34.560,85 | **crudo $94.822,50 / neto $45.153,10** | `sum(subtotal_descuento)` crudo vs firmado; el rollup dice el mismo $45.153,10 |
| Los 8 sin ficha en `switch_clientes` | $748,68 | **$749,08** (los mismos 8 nombres; la suma estaba mal) | `left join` + `is null` |
| `switch_ultimo_pago_cliente_v2` de Boston | 1.947 | **1.940** (y 339 de los 390 muestran pago) | `count(*)` |
| Clientes en las dos carteras | ALADDIN, LA FRONTERA, WOLF MALL, CITY MALL PASO CANOA, **VENTAS LOCAL** | los cuatro primeros + ⚠️ **CITY MALL DAVID** | `join` por `nombre_normalized` |
| `_multifashion_sf_vw` | 29.708 | **29.708** ✅ | `count(*)` |
| `switch_articulo_diario` de ACS | 46.100 · hasta 3-sep | **46.187 · hasta 4-sep** | `count(*), max(fecha)` |
| `switch_articulo_marca` de ACS | 8.735 filas · **32** valores | **8.736 filas · 34 valores** | `count(*)`, `count(distinct marca_nombre)` |
| `switch_clientes` de ACS | 1.037 | **1.038**, escrito hoy 11:30 UTC | `count(*), max(synced_at)` |
| Funciones del módulo Multifashion | **18** | **21** — falta `proyeccion_mensual_mayorista_v1`, instalada y sin llamador | `pg_proc` con `like 'multifashion%' or 'mf_%' or 'proyeccion_%'` |
| Línea 🎯 Meta del Telegram | +13% (3-sep) | **+61%** con el corte de hoy (4-sep) | vendido $7.502,90 ÷ ritmo $4.667,78 − 1 |
| Caja de Multifashion sin abrir | 3 semanas | **22 días** (última fila 14-ago 06:20 UTC) | `max(synced_at)` de `multifashion_caja_diaria` |
| Sesiones de David | «4 vivas, estaba usando el sistema hoy» | **5 filas**, `last_seen` 4-sep 17:01; **no entró el 5** | `user_sessions` |

## Detalles de precisión

| # | Qué decía | Qué es | Cómo se midió |
|---|---|---|---|
| 9 | La vista del grupo excluye a Boston «con un **`NOT IN`**» (aquí y en `cxc/CLAUDE.md`) | ⚠️ El operador real es **`<>`**: `WHERE COALESCE(s.saldo,0) <> 0 AND s.empresa_key <> 'confecciones_boston'::text`. **Lo de fondo se sostiene** — excluye, no enumera — pero el SQL escrito no es el que corre. | `select pg_get_viewdef('switch_estadocuenta_aging'::regclass, true)` |
| 10 | Los buckets del grupo son «`d0_30 … mas_365`» y los de Boston «propios y distintos» | ⚠️ Al revés de como se lee: **la vista del grupo NO tiene `d0_90` ni `d121_plus`** (solo los 8 finos, y los tres gordos los arma la pantalla). **La de Boston es hoy la única con las dos familias.** | las dos `pg_get_viewdef` |
| 11 | «Ninguna afirmación sobre en qué línea está cada comentario viejo» | ⚠️ Los cuatro comentarios stale **siguen vivos**, con líneas nuevas: `planilla/route.ts:160` · `guard.ts:63-74` · `boston-acceso.test.ts:241` · y los de Multifashion en `detalle-mensual:26`, `vendedoras:33` (y `:10` el del rol `director` inexistente), `retail-recurrentes:19`, `clientes-wholesale:21` | `grep -n` sobre cada archivo |
| 12 | La pestaña Ventas de Boston: «no se trae el costo desde Switch» | ⚠️ **El costo SÍ llega**: `$298.739,11` en el rollup 2026, y `switch_articulo_diario` tiene **18.064 filas de Boston** (hasta el 4-sep) que suman $470.421,08. Lo verdadero es que **no está certificado** (`utilidad: false`) y que **las dos fuentes no cuadran entre sí**. La decisión está bien; la frase de la pantalla no. | `ventas_rollup_mensual_mv` + `sum(costo_total)` de `switch_articulo_diario` |
| 13 | `multifashion_bonos_v1` se nombra en el encabezado de `bonos/route.ts` | ⚠️ Se nombra en **TRES** lugares: `bonos/route.ts:2`, `components/ventas/types.ts:306` y `:341`. Ninguna existe en `pg_proc`. | `grep -rn` sin tests |
| 14 | `ventas_rollup_mensual_mv` tiene grano `(empresa_key, anio, mes)` | ⚠️ Cierto, pero **`mes` es una `date`** (el día 1), no un entero. Un `where mes = 8` no devuelve nada. | `select mes from ventas_rollup_mensual_mv limit 1` |
| 15 | Boston no está en `clientes_master` | ✅ Confirmado, **con un matiz que vale la pena**: **5.064 filas · 4.914 borradas · 150 vivas**, y de las 150 vivas **una sola** comparte código con Boston: **`TCKCTA` / «VENTAS LOCAL»**, el mostrador que existe en las 8 empresas. **Ni un cliente real de Boston está vivo ahí.** | `count(*) filter (where deleted)` + `exists` contra `switch_clientes` de Boston |

## Lo que se verificó y estaba bien (lo importante)

- 🔴 **El aislamiento de Boston, en las DOS direcciones.** `switch_estadocuenta_aging`: 211
  filas, **6 empresas, 0 de Boston**. `switch_estadocuenta_aging_boston`: 390 filas, **1
  empresa, 0 del grupo**. `switch_estadocuenta_aging_mv`: **idéntica a la vista al centavo**
  (211 · 0 · $3.676.935,55), o sea que sigue materializando la vista y no una copia de su
  cuerpo. **Y su plata SÍ suma**: la RPC del Resumen agrupa por empresa **sin ningún filtro**,
  y Boston es la **4ª de las 8** con **$472.856,97 = 7,5% de 2026**.
- 🔴 **El rediseño del CXC de hoy nació con Boston afuera.** Las dos rutas nuevas
  (`/api/cxc/cobrar-lote`, `/api/cxc/envios`) se acotan a `CXC_GRUPO_EMPRESA_KEYS` y lo dicen en
  su encabezado. El cajón de documentos de Boston es **una ruta aparte con su propia consulta**,
  a propósito, para que pasarle una lista de empresas no sea posible.
- **Multifashion ES `american_classic` y nunca viaja por la URL**: 11 rutas, y
  `grep searchParams.get("empresa")` sobre las 11 (+ las 4 de Boston) da **cero**.
- **La comisión de Multifashion es 0,5% sobre CONTADO**, leído de la vista viva.
  `cxc/CLAUDE.md` sigue sin ese matiz.
- **Diciembre pesa el 58,8% de sep–dic**, al centavo ($200.257,73 de $340.698,55).
- **La meta**: 1 fila, «Viaje playa», sep–dic 2026, $420.000, grupal, `premio_monto = NULL`,
  4 participantes sin objetivo individual, nunca editada.
- **Los roles**: `gerente_acs = ["multifashion"]` · `gerente_boston = ["boston","catalogos",
  "asistencia"]` · `andrea` tiene Multifashion por override y `Angela` no · los 11 usuarios
  activos con bcrypt · las 6 filas de `asistencia_aprobador_empresa` intactas.
- **El documento imposible de Boston** (`155-000000129 · VENTAS`, **$266.541.352** contra un
  umbral de $2.000.000) sigue rechazándose todos los días, y la cartera sigue entera.
- **`boston-cartera` corrió hoy 08:10:09 → 08:10:24 UTC**: 919 insertadas, 6 actualizadas, 1
  descartada. **7 de 7 corridas `success` en la semana**, cero fallos en los seis tipos de sync.
- **Los 8 clientes con saldo sin ficha en `switch_clientes`** siguen siendo exactamente los
  mismos 8, y **`TCKCTA` sigue en la cartera de Boston** con $25,15.
- **`cxc_favorites` no tiene un solo lector ni escritor** — solo comentarios y la lista del
  respaldo.

## Un error en `cxc/CLAUDE.md` (no se editó, se reporta)

- § *Boston y CXC*: «Se cierra en la vista `switch_estadocuenta_aging` … la vista **EXCLUYE**,
  no enumera» — correcto de fondo, pero el archivo (y este) describen un **`NOT IN`** donde el
  SQL real usa **`<>`**.
- § *Multifashion*: «Comisiona con otra base … `SUM(subtotal firmado) × 0,5%`, sin filtro de
  utilidad» — **le falta que solo comisiona el CONTADO** (`condicion_venta = 'Contado'` en
  `subtotal_comision`, migración `20260603000000`).
- § *Dónde vive cada dato*: `switch_estadocuenta_aging_boston` figura con **388 filas** y
  `switch_estadocuenta` de Boston con **976**; hoy son **390** y **990**.
- 🔴 § *Dónde vive cada dato* › cartera de Boston: dice que la migración `20260928120000` está
  **«pendiente»**. **Ya se aplicó** — verificado hoy leyendo la vista en producción: las 7
  columnas finas existen y suman exactamente los tres tramos visibles en las 390 filas.
- § *Dónde vive cada dato* › `switch_clientes`: dice que el directorio de Boston «lo trae
  `sync-clientes-boston`, domingos» — cierto como plan, pero **ese cron no ha corrido nunca** y
  las filas siguen congeladas.
- § *Módulos* y § *Roles*: el CXC figura como `/admin`; desde hoy es **`/cxc`**.
