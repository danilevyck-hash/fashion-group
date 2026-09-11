# Estado al 31-ago-2026 — complemento del documento maestro

> El documento maestro (`fashion-group-erp-master-context.md`) es del **5-jul-2026** y quedó desactualizado.
> Este archivo cubre el gap jul→ago y el estado real medido contra producción hoy.
> Léelos juntos: el maestro para arquitectura y decisiones, este para qué existe hoy y qué falta.
>
> ⚠️ **Al pie hay una sección «Lo que cambió después»** con el 1 al 5 de septiembre. Léela también — al final están los rediseños de **Cuentas por Cobrar**, **Clientes** y **Recordatorios** (5-sep).

---

## 1. Entorno local reconstruido (compu robada)

La MacBook fue robada. Nada crítico se perdió: código en GitHub, data en Supabase, producción en Vercel.

**Ruta y comando (sin cambios):**
```
cd ~/Code/fashion-group/cxc && claude --dangerously-skip-permissions
```

**Ojo al re-clonar:** el repo se llama `fashion-group` y el proyecto Next vive en la subcarpeta `cxc/`.
Clonar así: `git clone <repo> fashion-group && cd fashion-group/cxc`

**npm 11 bloquea install scripts por defecto.** Sin esto, `sharp` y `esbuild` no funcionan:
`npm install-scripts approve esbuild sharp fsevents core-js @sentry/cli && npm rebuild`
(ya quedó en `package.json` como `allowScripts`)

**Llaves rotadas** tras el robo. `.env.local` se regenera con `npx vercel env pull .env.local`.

---

## 2. Qué se construyó entre el 5-jul y el 31-ago

464 commits, 449 merges de PR (#210 → #662). 28 páginas, 262 rutas API.

| commits | módulo |
|---|---|
| 119 | Catálogos · pedidos · cotización · fotos |
| 54 | Ventas · Referencia · artículos · margen |
| 45 | Asistencia · planilla · préstamos |
| 34 | Boston · CXC · cartera |
| 33 | Crons · alertas · backup |
| 32 | Guías |
| 22 | Multifashion |
| 20 | Comisiones |
| 19 | Gastos · mayor · saldos de banco |
| 16 | Marketing · reclamos · mobiliario |

### Módulos NUEVOS que no están en el doc maestro

| nace | página |
|---|---|
| 24-jul | `/pedido-tommy` |
| 3-ago | `/asistencia` — el más grande de los nuevos |
| 11-ago | `/gastos-contabilidad` |
| 12-ago | `/pedido-calvin` · `/referencia` |
| 27-ago | `/boston` |

Grupos de API nuevos: `api/diag` · `api/asistencia` · `api/gastos-contabilidad` · `api/saldos-banco` · `api/recordatorios` · `api/boston`

---

## 3. Módulo Asistencia y Planilla (nuevo, jul-ago 2026)

De cero a producción entre el 3 y el 27 de ago. 13 rutas API, 12 migraciones aplicadas.

**Cubre:** marcaciones biométricas, correcciones sin tocar el reloj, planilla por quincena y por rango libre, vacaciones, seguros, aprobación de horas extra, descuento de préstamo.

**3 empresas con marcación:** Confecciones Boston (22 personas) · Vistana (10) · Fashion Wear (8) = 40 fichas.

### Pestañas de `/asistencia`
Reporte · Aprobaciones · Planilla · Justificaciones · Vacaciones · Configuración

- **Aprobaciones** es la única que muestra aprobadas y no aprobadas con su estado (día verde = todo aprobado).
- **Reporte** muestra extras en minutos pero NO distingue si están aprobadas.
- La API de planilla acepta rango arbitrario (`?desde=&hasta=`), tope 366 días.

### `asistencia_reparto_empresa` (27-ago)
Reparte el SUELDO de una persona entre dos empresas. **No** tiene nada que ver con aprobación (el nombre engaña).

Caso vivo: JULIO GARAY (código 11) — $800 Vistana + $200 Fashion Wear.
🔑 La rata por hora sale del salario TOTAL de la ficha ($1.000 → $5,77/h), no de la parte de cada empresa. Si saliera de los $200, su hora valdría $1,15.
`paga_seguros = false` = "servicios profesionales": esa parte sí se paga, no lleva el 11%.

---

## 4. Cambios del 31-ago-2026 (6 commits)

### `8ce17aff` — cerrar acceso por URL a Asistencia
**Agujero real que estaba abierto:** `requireRole` valida el ROL, nunca los módulos efectivos. Las secretarias tenían `modulos_override` sin asistencia (no veían la tarjeta) pero entrando por URL recibían los 40 sueldos.

Guard nuevo: `src/lib/asistencia/guard.ts` → `requireAsistencia(req, roles, modulos?)`. Lee `modules` de la cookie HMAC-firmada, misma fuente que el menú. Fail-closed.

Resultado medido: respuestas no-403 a usuarios sin el módulo, 26 → 2 (las 2 son la planilla de David, legítima).

⚠️ Precio del diseño: un cambio de permisos entra en el próximo login.

### `8bd81113` — `VE_SUELDOS_DE_BOSTON = true`
David (gerente_boston) ahora ve los sueldos de sus 22 personas. Un flag, un rol, una pantalla.
La empresa la sigue forzando el servidor (con `?empresa=vistana` igual devuelve Boston).

### `9a5e351b` — columnas de dinero en la planilla de Boston
Las mismas 18 columnas de `PlanillaTab`, mismo orden, mismo pie de TOTAL. Cuadra al centavo.
⚠️ Los 5 montos manuales son de SOLO LECTURA para David — decisión de Daniel. El POST exige `asistenciaRoles()`, donde David no está.

### `d3b766bc` — Excel de Aprobaciones
11 columnas con Estado, Aprobó y Cuándo. Una fila por persona y día. Autofiltro `A1:K3`.

### `aaf106ce` — aprobación de horas extra segmentada por empresa
**Antes:** quien podía aprobar aprobaba a las 40 personas de las 3 empresas. Julio había aprobado 57 días de Boston, que no le tocaban.

**Reparto vigente** (tabla `asistencia_aprobador_empresa`, DDL aplicado):

| aprobador | empresas |
|---|---|
| David (`gerente_boston`) | confecciones_boston |
| Julio (usuario `bodega`) | fashion_wear, vistana |
| Contabilidad | las 3 |
| admin (Daniel, Alberto) | las 3 |

- **Todo o nada:** una persona ajena en el lote → 403 y no se escribe ni una fila.
- Una persona sin empresa también rechaza.
- David ganó la puerta al módulo, no el módulo: las otras 11 rutas le dan 403.
- Las 521 aprobaciones históricas intactas.

### `40cc01ed` — calendario de rango único en Asistencia
Un solo control de fechas en 6 pantallas: Reporte, Aprobaciones, Planilla, Justificaciones, Vacaciones (×2), Boston Planilla.

**Diseño:** cerrado muestra `📅 28 oct – 10 nov 2026 · 14 días`. Abierto, calendario de rango: toque 1 fija ancla, toque 2 cierra y aplica. Si eligen al revés se ordena solo. Días sin marcaciones en gris claro.

🔴 **Se quitaron los 4 presets** ("Quincena en curso", etc.). El corte de quincena de Fashion Group es **variable** (a veces 28 al 10), así que los presets mentían casi siempre.

Librería: `react-day-picker` v9 + `date-fns`, cargada con `dynamic()`.
⚠️ Se usó `DesplegableFlotante` (el de la casa) en vez de Radix Popover — ahorra 34 kB y es consistente con otros 6 controles.
Bundle final: **+2 kB** (/asistencia 210→212, /boston 191→193).

Ruta nueva: `/api/asistencia/dias-con-datos` (tope 120 días).

---

## 5. Correcciones de documentación aplicadas (`dffe1244`)

- **Boston y recibos:** la nota decía que `confecciones_boston` estaba EXCLUIDO de recibos. **Falso desde el PR #347 (28-jul)** — 7.636 recibos suyos, 4 corridas diarias en success. Daniel confirmó que SÍ debe sincronizar. **Utilidad sí sigue excluido y eso sí es diseño** (0 filas en `switch_factura_utilidad`).
- **6 crons que corrían sin documentar:** `boston-cartera` 08:10 · `guias-pendientes` 14:30 · `catalogos-fotos-resumen` 13:30 lunes · `sync-egresos-varios` 10:35 · `sync-factura-lineas` 03:30 · `sync-ingresos-mercancia` 09:05
- **db-salud:** la tabla decía 11 horarios, hay 5 (01:45 · 07:25 · 12:25 · 16:45 · 21:45)
- **Encabezado de crons:** 77 → **79 entradas**

### Poda de CLAUDE.md
`cxc/CLAUDE.md` pesaba **822.526 chars** (5,5× el límite de 150k) y se inyectaba entero en cada sesión de Code.

Ahora: **39.537 chars**. Cero líneas perdidas — todo se MOVIÓ, nada se borró:
- `cxc/docs/postmortems/` — 9 archivos temáticos, verbatim (candados, mediciones, "Daniel textual", 🩸)
- `cxc/docs/historico/superado.md` — módulos retirados y changelog de abril
- Sección nueva "Invariantes por módulo": la regla vigente + link a su post-mortem

También se retiró `.claude/rules/zh/**` (traducción al chino de reglas ya cargadas en inglés) y se reemplazó `.claude/CLAUDE.md` de la raíz, que describía otro proyecto.

---

## 6. Aislamiento de Boston — verificado 31-ago

| | |
|---|---|
| `switch_estadocuenta_aging` | 214 filas, **0** de Boston |
| `switch_estadocuenta_aging_mv` | 214 filas, **0** de Boston |
| `switch_estadocuenta_aging_boston` | 391 filas, aparte |

(Antes del arreglo del 12-ago eran 211 vs 593, con 382 de Boston contaminando.)

`VE_SUELDOS_DE_BOSTON` vive en `src/lib/boston/rol.ts:88`. Volver a `false` es una línea y la pantalla vuelve sola a 5 columnas.

---

## 7. PENDIENTES VIVOS al 31-ago-2026

### Crítico
- 🔴 **Rotar el token de acceso de Supabase** (el de Management API). Quedó expuesto en un chat el 31-ago.

### Abierto
- **PR #633** — "la gente de Multi Fashion no marca el reloj" (~11 personas de ACS). **Decidido el 3-sep:** en ACS no hay reloj; Daniel lo configura él — *«lo del reloj de acs lo tengo q configurar»*. Tarea de Daniel; cuando esté, se conectan al ingest como los otros.
- **25 timestamps de migración repetidos en 52 archivos.** Hoy no rompe nada, pero el CLI indexa por ese número: dos archivos futuros con el mismo timestamp harían que uno nunca corra, en silencio. Hay candado nuevo (`migraciones-timestamp-unico.test.ts`) que congela las heredadas y falla con cualquier duplicado nuevo.
- ✅ **~44 archivos con código de tolerancia a DDL que ya corrió** (`faltaTabla` / `esTablaAusente` / `PGRST205` / `42703`). Cerrado el 3-sep en 4 tandas (commits `425b1bd4`, `2a410d13` y los de marketing/cxc/ventas): se verificó tabla por tabla en producción que existen y se retiró la tolerancia en **~44 archivos**; un error de Supabase ahora falla visible (500 con mensaje, o se propaga) en vez de decir «sin datos». Cero cambio cuando todo va bien. 4 tests nuevos por tanda (marketing 8, cxc/ventas 18, asistencia 48, resto 30), **todas las mutaciones cazadas** (9/9, 6/6, 26/26, 18/18). Hallazgo colateral: enviar un pedido a Switch contestaba 404 «no encontrado» ante cualquier error de lectura; ahora solo `PGRST116` es 404. Quedan **sin usos** pero no se borraron: `esTablaAusente` (`contable/tabla-ausente.ts`) y `columna-codigo-opcional.ts`. Preexistente detectado y NO tocado: `avisos.extraSinAprobar` de la planilla siempre sale vacío aunque haya extras sin aprobar (mira `extraMedido`, que ya viene filtrado).
- ✅ **`sync-mayor` dejó heartbeat huérfano** (retirado el 13-ago, su fila sigue en `cron_heartbeats`). Cerrado el 3-sep: verificado que nada lo lee (solo comentarios de franjas horarias); **migración `20260914120000_barrer_heartbeat_sync_mayor.sql` aplicada por Daniel el 3-sep** (un `DELETE` por nombre exacto; verificado: la fila ya no está). Candado nuevo: `esHeartbeatHuerfano` en `cron-telemetry.ts` + sección D de `cron-registro.test.ts` (foto real de las 75 filas del 3-sep → el único huérfano es `sync-mayor`; 7 mutaciones cazadas, CONTROL ⛔) + `integration/cron-heartbeats-huerfanos.test.ts` contra producción con `RUN_DB_TESTS=1`, que hoy pinta ROJO con exactamente `sync-mayor` y queda verde al aplicar la migración. Excepciones explícitas con motivo: slots vivos de switch-sync y sus marcas `#recuperado`/`#visto`, `HEARTBEATS_NO_CRON` (manuales), `vigia-externo`.
- ✅ **Boston arrastra filas con saldo 0** en `switch_estadocuenta` — eran 21 el 31-ago, **45 el 3-sep** (de 981). **No es basura ni hay que borrar nada**: son documentos que SE PAGARON entre una corrida y la siguiente. Evidencia: cada una tiene `synced_at` = el último día que el reporte la trajo con plata y `updated_at` = el día siguiente a las 08:11 UTC, la hora del reconcile de `boston-cartera`; `debito`/`credito` conservan el monto original y solo `saldo` está en 0 — exactamente lo que hace el reconcile (`sync-estadocuenta-web.ts:246`). Las 6 del grupo arrastran 835 por el mismo camino (API). Y **nadie las cuenta**: la pestaña, `/api/boston/*` y `/api/cxc/boston` pasan por `switch_estadocuenta_aging_boston` (`WHERE COALESCE(saldo,0) <> 0`), el estado de cuenta filtra `.neq("saldo", 0)`, el guard `PISO_CLIENTES_REPORTE` mide solo `saldo != 0`, y `datos-frescos`/`sync-status`/`integrity-check` miran `synced_at`, no conteos. Candado nuevo en `boston-no-se-mezcla.test.ts` (2 mutaciones cazadas). Crecerán con cada pago; si algún día molestan, la limpieza es una migración por lista explícita como la `20260826150000`, nunca tocar el reconcile.
- ✅ **Tests fallando pre-existentes** (`reclamos-itbms-rotulo-y-pendientes`, `catalogo-pedidos-ux-arreglos`): al cierre del 3-sep la suite completa está en verde (10.429 tests, 0 fallos).
- ✅ **`supabase/.temp/` no está en `.gitignore`** y se commitea. Cerrado el 3-sep: el único archivo que alguna vez entró (en todo el historial) es `cli-latest` con la versión del CLI (`v2.84.2`) — **nada sensible**, ni project-ref ni tokens. Agregado `supabase/.temp/` a `.gitignore` y `git rm --cached` (sigue en disco). Sin commitear.

### Tandas de fechas pendientes (2, 3 y 4)
La tanda 1 (Asistencia) está hecha. Faltan:
- **Tanda 2** — los 2 rangos restantes: Marketing pagos, Metas de Multifashion. Trabajo mecánico.
- **Tanda 3** — unificar selectores de MES: `ComisionesPeriodo` (el mejor) absorbe `SelectorMes` (Gastos) y Select+flechas (MF). ⚠️ Cada uno tiene reglas propias (tope = mes en curso en Gastos; minMonth/maxMonth según data en MF) — hay que parametrizarlas, no borrarlas. La de más riesgo.
- **Tanda 4** — selectores de AÑO: Ventas/MF (shadcn) + Marketing (nativo, con "Todos"). La de menos valor.

🔴 **NO migrar:** las 20 fechas ÚNICAS (`<input type="date">` nativo). Son un hecho que se registra, no una ventana que se consulta: vencimiento de cheque, fecha de gasto, fecha de guía, feriado, alta/baja de empleado, movimiento de préstamo, fecha de reclamo/NC/settlement, fecha de factura de marketing, `fecha_dato` de saldo bancario, "Día" de caja de MF. El nativo en iPhone abre la rueda del sistema, es accesible gratis y pesa 0 kB.
Tampoco migran las píldoras relativas (Mes/3m/6m/12m): no son fechas, son ventanas con semántica propia.

---

## 8. Decisiones de Daniel tomadas el 31-ago

| decisión | resultado |
|---|---|
| ¿Boston sincroniza recibos? | **Sí.** La doc estaba mal, el código bien. |
| ¿Secretarias ven Asistencia? | **No.** Se cerró el acceso por URL. |
| ¿David ve los sueldos de Boston? | **Sí.** |
| ¿David edita los montos manuales? | **No.** Solo mira. |
| ¿Contabilidad sigue aprobando las 3 empresas? | **Sí.** |
| ¿Julio aprueba todo el personal de FW y Vistana? | **Sí**, no solo bodega. |
| ¿Presets de quincena? | **Fuera.** El corte es variable. |
| ¿Code aplica DDL solo en Supabase? | Técnicamente montado vía Management API. **Recomendación en contra**: ese paso manual es el único control humano sobre cambios de esquema en una base con $3M. |

---

## 9. Notas de operación

- **`asistencia_horas_extra_aprobadas`:** hoy hay **521 aprobaciones**, no 223. Las 298 nuevas son todo julio, aprobado por Daniel desde la app el 31-ago (5 clics de casilla semanal — julio tiene 5 semanas).
- **Ver horas extra de días pasados:** `fashiongr.com/asistencia` → pestaña Aprobaciones → tocar el selector de fechas → elegir el rango. Muestra aprobadas y no aprobadas juntas, con estado.
- **Migraciones:** 306 con timestamp, 305 verificadas aplicadas + 52 legacy sin timestamp que el CLI ignora.

---
---

# Lo que cambió después — del 1 al 4 de septiembre de 2026

> Esta sección la mantiene el asistente al cierre de cada sesión. Lo de arriba es la foto del 31-ago tal cual la escribió Daniel; esto es el delta.

## Cerrado (ya en producción)

| tema | qué quedó |
|---|---|
| **Reclamos — el proveedor se identifica por (empresa, código), no por el nombre** (4-sep) | **Defecto medido:** la ficha de `/proveedores/[key]` leía **toda** la tabla `reclamos` y la unía con el proveedor **por nombre normalizado, en JavaScript, sin ningún candado** — el mismo error que con los clientes de Boston. Y ya estaba fallando: de los **34 reclamos vivos, 26 no cruzaban** porque Switch escribe «American Fashion Wear, SA» y los reclamos dicen «American Fashion Wear»; las fichas de **Fashion Wear (21) y Fashion Shoes (5) mostraban CERO reclamos**, en silencio. **Ahora:** columna nueva `reclamos.proveedor_codigo` y unión por el par **(empresa, código)**, exacta, sin una sola comparación de texto libre. 🔴 El código **no es único entre empresas** — verificado contra `switch_proveedor_estadocuenta`: `122` es American Fashion Wear en Fashion Wear ($2.270.756,78) y Latin Fitness Group en Active Shoes ($206.954,76); `112` es Tommy en Fashion Shoes ($1.302.582,91) y Joybees en Joystep ($16.165,61) — así que el par viaja siempre junto. **`EMPRESAS_MAP` pasa de 5 a 6 filas** (`src/lib/reclamos/empresas.ts`, ahora también la lee el servidor) con el mapa que cerró Daniel: Vistana→American Designer Fashion `01` · Fashion Wear→American Fashion Wear `122` · Fashion Shoes→American Fashion Wear `112` · Active Shoes→Latin Fitness Group `122` · **Active Wear→American Unique Brands SA (Karl Lagerfeld) `126`** · **Joystep→JCBBRANDS (Joybees) `112`**. **Por qué cambia Active Wear:** Daniel pasó todo lo de Reebok (apparel y hardware) a Active Shoes para tenerlo en un solo sistema y le dio Active Wear a Karl Lagerfeld — medido, American Unique Brands (126) es el único proveedor con llegadas a Active Wear entre junio y agosto de 2026, y su ingreso del 20-ago trae 48 artículos, el mismo día en que Andrea corrió el Depurador con 48 estilos de «KL Accessories»; Latin Fitness no le manda nada desde el 11 de junio. **Los 34 reclamos viejos se rellenan en la misma migración**, por lista explícita de (empresa, proveedor) → código — Daniel: *«código a los viejos también, no habrán otros»* —: los 34 cruzan (FW 21 · Vistana 7 · FS 5 · AS 1) y además 10 de las 13 filas borradas; las 3 que no cruzan se quedan **sin código a propósito** (2 de prueba y 1 de Active Wear con el proveedor viejo). **Cero cambio en lo que ve el proveedor:** el correo, el PDF y el Excel siguen imprimiendo el NOMBRE; el código no se muestra nunca. De paso: el literal `"Pagado"` estaba suelto en cuatro lugares entre SQL y TypeScript (cobrarle dos veces al proveedor si uno cambiaba y otro no) — los cuatro usan ya `ESTADO_PAGADO`, con candado que compara byte a byte contra el `'Pagado'` del RPC del home; y **las dos `fetchReclamosForEmpresa`** (la del Excel no filtraba borrados, la del PDF sí) son **una sola, que filtra**. ⚠️ **Migración `20260922120000_reclamos_proveedor_codigo.sql` aplicada (verificado el 5-sep-2026)** — mientras no corra, la ficha de Proveedores muestra 0 reclamos vinculados (hoy ya muestra 8 de 34, así que no empeora nada) y todo lo demás funciona igual. ⚠️ Joystep entra al desplegable sin fila en `reclamo_contactos`: su tarjeta se dibuja sin contacto hasta que se cargue. Candados: `reclamos-proveedor-por-codigo.test.ts` (25, con barrido estático que prohíbe `LIKE/ILIKE/similarity/levenshtein/soundex/regexp` en el SQL) · `reclamos-estado-pagado-unico.test.ts` (9) · `reclamos-fetch-empresa-una-sola.test.ts` (6); **28 mutaciones, 28 cazadas** (`scripts/_mutar-candados-reclamos-proveedor-codigo.sh`). Build en verde. Sin commitear. |
| **Depurador — 3 pestañas, la compañía se reconoce y el Excel se puede volver a bajar 90 días** (4-sep) | Rediseño de la navegación aprobado por Daniel («Aprobado»), **cero cambio en el cálculo** (misma plantilla de 25 columnas, candado en verde). **(1)** De 7 pestañas a 3: **Plantilla** (Nuevo · Historial) · **Tallas y catálogo** · **Configuración**; los tres caminos (CK/TH, Reebok, Facturas Tienda) viven en la dropzone única de «Plantilla › Nuevo» y no se nombran; todo `?tab=` viejo redirige. **(2)** La compañía se **reconoce de la marca del archivo** (*«¿para qué elegir la compañía si la puede detectar?»*) con «cambiar» (las 6) por si falla; con marcas de 2 compañías se dice y no se adivina. **(3)** UN campo **«Temporada»** (era «Mes»+«Año», que engañaban): arranca SIEMPRE en el mes actual de Panamá (*«la temporada es el mes que se hace el archivo»*) y **no se recuerda**. **(4)** El Historial guarda **el mismo Excel que bajó** (bytes idénticos) 90 días en el bucket privado `depurador-plantillas`; **solo los Excel de Switch** (*«el historial solo quiero los excel para switch»*) — el pedido de Reebok con fotos NO; la fila con los totales queda para siempre; cron nuevo `cleanup-depurador-archivos` 03:20 UTC; filtro por compañía, todos ven todo (*«todos»*). **(5)** El divisor valida en pantalla **en los tres caminos** (Reebok y Facturas Tienda se sumaron al guard de CK/TH). **(6)** Tallas y Fotos a mi Excel dejan rastro en `activity_logs` (`descarga_tallas`/`descarga_misfotos`) para medir uso en unas semanas — de paso se arregló `/api/activity`, que insertaba columnas inexistentes. ⚠️ La marca desconocida quedó EXACTAMENTE como está (*«Como está»*). ⚠️ **Migración `20260921120000_carga_history_archivo.sql` aplicada (verificado el 5-sep-2026)** — mientras no corra, todo funciona y las filas quedan sin botón. Candados: `depurador-validacion-pantalla` (25) · `depurador-divisor-tres-caminos` (5) · `depurador-pestanas-rediseno` (9) · `api/depurador-historial-archivo` (7); **10 mutaciones, 10 cazadas** (`scripts/_mutar-candados-depurador-rediseno.sh`) + las 10/10 del script del 4-sep re-corridas. Suite completa y build en verde. Sin commitear. |
| **Caja Menuda — el cierre dice la verdad y la tanda no pelea con el formulario** (4-sep) | Los puntos de Caja de la auditoría de eficiencia, aprobados por Daniel. **(1) 🔴 El cierre YA NO exige saldo 0** — Daniel, textual: *«cierro cuando queda poca plata (criterio de la secretaria) y le doy la diferencia para llegar a los 200»*. La regla vieja forzaba los datos (medido: los 2 períodos cerrados dan $200.00 clavados, con gastos de $0.05 y $0.87 creados y borrados el día del cierre para cuadrar). El modal ahora muestra Fondo · Gastado (N recibos) · Queda en caja · Reposición para volver a $200, y el botón es **«Cerrar y abrir el N»**: cierra con el saldo que tenga (negativo se ve en rojo y se dice, pero NO bloquea) y abre el período siguiente en $200 por el mismo camino que «+ Nuevo período» (`src/lib/caja/abrir-periodo.ts`). El saldo del cierre se guarda (`saldo_cierre`); ⚠️ **migración `20260920120000_caja_reposicion.sql` aplicada (verificado el 5-sep-2026)** — mientras no corra, el cierre funciona igual, sin la foto. La 💡 «cerrar período +30 días» se retiró: el criterio es la plata, no los días. **(2)** «Guardar y nuevo» **conserva la fecha elegida** (la tanda real: ~38 recibos de semanas atrás tecleados en una sentada; categoría y responsable ya se conservaban). **(3)** El **ITBMS arranca plegado** tras «＋ Agregar ITBMS» (lo tienen 9 de 77 gastos); la cuenta no cambia: total = subtotal + itbms, plegado = 0. El N° de factura ya era opcional (verificado en el servidor); 🔴 **el proveedor sigue texto libre SIN lista** (Daniel: *«no»*), con candado explícito. **(4) Bugs de la auditoría:** el PATCH de gasto aceptaba `metodo_pago`/`numero_factura` (columnas inexistentes → 500); ahora la lista es de columnas reales e incluye `nro_factura` (el editar en línea lo mandaba y se perdía en silencio). El respaldo de categoría es UNO («Varios»; el cliente decía «Otros»). El GET de un período borrado contesta 404. «¿Restaurar?» ya no pide confirmación (sin consecuencia); la de eliminar queda. La ruta huérfana `/caja/[periodoId]/nuevo` NO se borró: nota en su cabecera (nada la enlaza). Candados: `caja-cierre-con-saldo.test.ts` (7) · `caja-formulario.test.tsx` (5); **8 mutaciones, 8 cazadas** (`scripts/_mutar-candados-caja.sh`). Suite completa y build en verde. Sin commitear. |
| **Depurador — la pantalla valida lo que se teclea y no borra el trabajo hecho** (4-sep) | El punto 1 de «Lo urgente» de la auditoría de eficiencia, aprobado por Daniel. **(1)** El divisor pasa por `validarDivisor` TAMBIÉN en los inputs de la pantalla (global y por marca, vía `mensajeDivisorEnPantalla` — el mismo guard de las rutas, no otra copia): `70` → campo en rojo, «Debe estar entre 0.10 y 1.00. ¿Quisiste poner 0.70?» y **la descarga se apaga, nunca el tecleo** — antes ese `70` bajaba un Excel con costos 100× mal directo a Switch (50-60 corridas/mes). **(2)** La tasa dejó de ser texto libre: select de dos — Daniel: *«solo existen esas dos»* — 7% → `07` y Exento (0%) → `0`, siempre TEXTO; `tasaSwitch` intacto. **(3)** Los precios escritos a mano **se conservan** al re-procesar y al cambiar empresa/mes/tasa/factor — Daniel: *«y también consérvalos»* — pegados por REFERENCIA de artículo (nunca por índice), con «N precios escritos a mano se conservaron» y botón «Borrarlos todos»; año/factor ya no re-procesan en cada tecla (300 ms o blur). **(4)** La pantalla abre como quedó la última vez (`useLastUsed` / `fg_last_depurador_*`); el archivo no se recuerda. CONTROL: con datos válidos el Excel sale IDÉNTICO (25 encabezados y valores, comparado celda a celda). Candado: `depurador-validacion-pantalla.test.tsx` (18); **10 mutaciones, 10 cazadas** (`scripts/_mutar-candados-depurador-pantalla.sh`); suite completa y build en verde. ~~⚠️ Reebok y Facturas Tienda conservan inputs de divisor sin validación de pantalla — decisión pendiente de Daniel.~~ **Superado el mismo 4-sep: la validación llegó a los tres caminos con el rediseño (fila de arriba).** Sin commitear. |
| **Clientes — el que Switch borró deja de ofrecerse** (4-sep) | Daniel, textual: **«APROBADO»**. **Defecto medido:** `switch_clientes` notaba al cliente borrado en Switch (`activo=false` desde julio) pero `clientes_master` era un upsert puro que nunca marcaba lo que dejó de llegar — **D-30 «City Moda Chorrera»** (el duplicado de D-26, borrado en las 6 el 13-ago) y **D-135 «Rey Store (Aguas)»** se seguían ofreciendo en todos los selectores. **Ahora:** columna nueva `clientes_master.ausente_desde` (NO se reusó `deleted`: eso significa «no existe» y lo filtran vistas, índice y ficha) — el sync la marca cuando **ninguna** de las 6 lo manda y la quita solo si reaparece. Deja de ofrecerse (ClientePicker de Guías/Cheques, «más usados», atar, y el selector de pedidos de catálogo filtra `activo=true`) pero **no se borra**: la lista lo muestra con rótulo, la ficha dice «Ya no está en Switch desde el 13 ago 2026», y las guías viejas siguen con su nombre. 🔴 Protección en capas: `activo` solo cambia con lista de Switch completa y no vacía; lectura fallida no marca a nadie; sin datos de `activo` la pasada se omite; freno si saldría ausente >10% del directorio. Medido: se ofrecen 150 → quedarían **148**; ninguno de los 2 tiene guías, cheques, pedidos ni CXC vivos. ⚠️ **Migración `20260919120000_clientes_master_ausente.sql` aplicada (verificado el 5-sep-2026)** (mientras tanto, todo igual que hoy). Candados: `clientes-ausentes-de-switch.test.ts` (16) · `clientes-ausentes-selector-y-ficha.test.tsx` (5); **14 mutaciones, 14 cazadas** (`scripts/_mutar-candados-clientes-ausentes.sh`). Sin commitear. |
| **Guías — el mockup FINAL: días con factura, «Traslado» y «el de siempre»** (4-sep, noche) | Daniel aprobó el mockup final: **«dale aprobado»**. Tres cosas, todas bajo el mismo `GUIAS_ATAJOS_NUEVOS`. **(1)** El panel de facturas abre con **los últimos 3 días CON factura** (no de calendario: si el último fue hace dos semanas, ese es el primer grupo), cada día con su encabezado en palabras («Miércoles 3 sep») y **«Ver más días»** +3 — medido: de 471 facturas usadas en guías este año, 77% salen del último día facturado, 92% de los últimos 2, 95% de los últimos 3. **(2)** Botón **«Traslado»** debajo de la lista, separado por un «o» (Daniel: *«que en factura salga traslado»*; descartó «Factura pendiente» y «Sin factura» — son DOS caminos: factura o Traslado): escribe el TEXTO `Traslado` en `facturas` y así sale en el papel, el PDF y el Excel; la **empresa se elige a mano**; los 58 renglones viejos con `0000` no se tocan. **(3)** **«El de siempre»** (*«sí correcto, con entrega Sport Corner como default, que elija si quiere el otro sino»*): cada cliente puede tener UN destino marcado así — columna `el_de_siempre` en `guias_destino_cliente` (índice parcial: a lo sumo uno activo por cliente) + marca por fila en Guías › Configuración — y ESE se autollena al elegir el cliente **aunque tenga varios**; sin ninguno marcado, nada. Los definidos que cerró Daniel: los 10 de su tabla (D-81 · D-80 · D-156 · D-117 · D-87 · D-25 · D-35 · D-112 · D-144 · D-141), las 5 correcciones de escritura (D-99 Westland · D-147 Changuinola · D-7 Penonomé · D-43 Las Tablas · D-86 Albrook), la familia City Moda entera a «Sport Corner Calidonia» (D-26 con «Chorrera» de segundo botón; el «5 de Mayo» se quitó; D-30 no se define — Switch lo borró), y D-142 sin marca con sus 8 botones. Los ~40 restantes siguen de su historia, y con UN solo destino histórico también autollenan. ⚠️ **Migración `20260918120000` editada en el lugar (todavía aplicada (verificado el 5-sep-2026)): ahora carga 34 filas con la marca.** Candados extendidos (no duplicados): `guias-atajos-facturas` (28) · `guia-form-marcar-facturas` (15, papel y Excel generados con «Traslado») · `guias-destinos-cliente` (54) · `guia-form-destinos` (16) · `guias-destinos-precedencia` (11) · `guias-destinos-config-route` (19) · `guias-configuracion-pantalla` (14); los 4 scripts de mutación del módulo re-corridos enteros — ver el postmortem. Sin commitear. |
| **Guías › Configuración — los destinos definidos se corrigen desde la pantalla** (4-sep, tarde) | Daniel mandó dos correcciones, textual: *«city shoes → Calle 19 Central, al lado de la joyería Super Oro. Y Nine Sport en Calle 19 Central.»* — y cada corrección así costaba un despliegue, porque los definidos vivían en la constante. **Las dos correcciones ya rigen** (D-35 con el texto completo; D-112 Nine Sports entra nuevo con «Calle 19 Central» — su histórico decía «Calle 19»): van en la constante para no depender de la migración. **Lo nuevo:** tabla `guias_destino_cliente` (grano cliente+destino, `tiendas text[]` en el mismo grano — solo D-142 las usa —, **soft delete firmado NUNCA DELETE**, única entre activas, RLS service_role) + pestaña **Guías › Configuración** a pantalla completa (molde de Comisiones): lista agrupada por cliente con buscador, dice si autollena o si salen botones, agrega con `ClientePicker`, edita el texto en la fila, quita con confirmación en palabras, y muestra los destinos ya usados en guías para **promoverlos de UN toque — nunca solos**. 🔴 La ven y editan **admin Y secretaria** — Daniel: *«configuraciones también deja a secretaria»*; bodega y vendedor 403. Precedencia en UNA función (`destinosDefinidosPara`): **tabla → constante → histórico**; con la tabla ausente (PGRST205) todo cae a la constante y nada se rompe. El campo Dirección sigue texto libre, `guia_items` no se toca, todo bajo `GUIAS_ATAJOS_NUEVOS`. ⚠️ **Migración `20260918120000_guias_destino_cliente.sql` aplicada (verificado el 5-sep-2026)** (carga los 24 definidos de hoy: encenderla no cambia ni un comportamiento). ⚠️ **Pendiente: Daniel aprueba el mockup de la pantalla antes de publicar.** Candados: `guias-destinos-precedencia.test.ts` (11) · `guias-destinos-config-route.test.ts` (15) · `guias-configuracion-pantalla.test.tsx` (13); **9 mutaciones, 9 cazadas** (`scripts/_mutar-candados-guias-destinos-config.sh`) y los tres scripts previos del módulo re-corridos en verde (13/13 · 12/12 · 17/17). Sin commitear. |
| **Guías — los DESTINOS del cliente como botones bajo Dirección** (4-sep) | La otra mitad del mismo encargo («va») y el MISMO interruptor `GUIAS_ATAJOS_NUEVOS` — no hay un segundo. **Antes:** la dirección (que es el DESTINO del envío, no la del cliente — `clientes_master` no la tiene) se escribía a mano cada vez, y el mismo lugar entraba de varias formas (medido: «Paso Canoas»×208 · «Pasocanoas» · «Paso Canoa»; de 48 clientes con guías, 40 usan siempre el mismo destino). **Ahora:** bajo el campo Dirección aparecen botones con los destinos de ese cliente — **9 clientes con destino DEFINIDO por Daniel** (su tabla, en `src/lib/guias/destinos-clientes.ts`, fuente de verdad que gana sobre el histórico: el de D-87 decía más veces «Changinola» que el «Guabito» que él definió) y el resto por historia (agrupado **exacto**: sin acentos/espacios, «s» final ignorada, **los dígitos jamás se juntan** — N2 ≠ N3; grafía más usada, máx. 6). **D-142 Sporting Shoes** con sus 8 destinos + tienda opcional (5·6·14·«Mas Flow»…, «+ otra») → `Westland · tienda 6` (separador en UN lugar, `componerDestino`; papel/PDF/Excel imprimen la dirección en celda propia, nada choca). 🔴 ~~El botón se toca, nunca se aplica solo — el pre-marcado NO se construyó~~ **superado el mismo 4-sep al probarlo Daniel: ver la fila «Guías — los ajustes de Daniel» abajo** (el destino ÚNICO se autollena; los botones para varios destinos quedan igual). El campo sigue texto libre, una Completada no muestra nada, el payload no cambia, cero migraciones. Candados: `guias-destinos-cliente.test.ts` (28) · `guia-form-destinos.test.tsx` (10, CONTROL apagado y Completada) · caso nuevo en `guias-frecuencias-ruta.test.ts`; **13 mutaciones, 13 cazadas** (`scripts/_mutar-candados-guias-destinos.sh`); diagnóstico `scripts/_diag-guias-destinos-cliente.ts`. Sin commitear. |
| **Guías — el cliente se elige UNA vez y se MARCAN sus facturas** (4-sep) | Daniel aprobó el mockup: **«va»**, y fijó la salida: *«te aviso si quiero revertir todo después de probarlo en producción con mi secretaria estas semanas»*. **Antes:** cada envío pedía a mano Cliente · Dirección · Empresa · Factura(s) · Bultos — un cliente de 3 empresas = 3 envíos con el cliente escrito 3 veces (medido: Angela 57 guías y Andrea 41 en 2 meses; 68 de 563 renglones con 2+ facturas, hasta 5). **Ahora:** en Nueva guía se elige el cliente una vez y aparecen sus facturas de las 6 empresas (agrupadas Hoy · Esta semana · Antes, 20 + «Ver más»); marcar arma los envíos de siempre, uno por empresa, con bultos por empresa. Puente por **CÓDIGO** (`switch_clientes`, jamás por nombre); solo tipo `Factura`; «Ya salió en GT-XXX» es **aviso, nunca bloqueo**; «No está en la lista» y «Traslado sin factura» (0000) siguen; elegir cliente **sigue sin ser obligatorio**. Lo de HOY lo trae una lectura corta en segundo plano — desde el mismo 4-sep se dispara **al tocar Guías** (ver la fila de los ajustes abajo), y en Nueva guía queda para quien entra directo por URL (fail-open, cooldown 10 min, lock del sync; medido: 92% de las facturas ya existían en la base al crear la guía y 58% eran del mismo día — la lectura cubre el resto). 🔴 **Reversible en UN lugar:** `GUIAS_ATAJOS_NUEVOS` (`src/lib/guias/atajos-facturas.ts`) — en `false` la pantalla es exactamente la de hoy, y **el payload que se guarda no cambia** con el interruptor en ninguna posición (candado que compara los dos caminos). Candados: `guias-facturas-del-cliente.test.ts` (11) · `guia-form-marcar-facturas.test.tsx` (11, CONTROL con la constante apagada) · `guias-atajos-facturas.test.ts` (19); **12 mutaciones, 12 cazadas** (`scripts/_mutar-candados-guias-facturas.sh`). Sin commitear. |
| **Guías — los AJUSTES de Daniel al probarlo + el resumen mensual al privado y al día 1** (4-sep) | Daniel probó lo del 4-sep y corrigió cuatro cosas (postmortem: sección nueva en `docs/postmortems/guias.md`). **(1)** El refresco de facturas de hoy se dispara **al tocar Guías** — *«¿por qué no se puede hacer al apretar guías? Prefiero eso.»* El candado de la lista **cambió de dirección, no se aflojó**: la regla es «la lista solo LEE, nunca escribe una guía», y la única salida que no es lectura es exactamente ese refresco (rol que no crea, solo lectura e interruptor apagado siguen en 100% lectura). **(2)** El destino se **AUTOLLENA** al elegir el cliente cuando tiene UN solo destino — definido o único en su historia agrupada (40 de 48 clientes; Bouti D-14 → «David») — porque Daniel quitó su propia regla del 14-ago: *«"la dirección no se escribe sola" me refería a que el usuario no lo haga… quita esa regla. Que se autollene»*. Con varios destinos, botones; lo escrito no se pisa; el pareo por parecido sigue prohibido. **(3)** **City Moda son ONCE clientes** (*«¿hay varios city moda no?»*): D-27/28/29/31/32/34/42 definidos a «Sport Corner Calidonia», D-26 a «5 de Mayo» (sus 8 direcciones «X (ENTREGA EN SPORTCORNER)» eran envíos cargados al código equivocado y se ignoran), **sin campo tienda**; D-30, D-33 y D-78 sin guías todavía → sin destino. **(4)** D-87 = Guabito con candado propio (*«en Frontera Duty Free es Guabito, hazme caso.»*). Y **(5)** el resumen mensual del grupo sale por `enviarNegocioPrivado` (*«este mensaje también lo quiero en alertas de Telegram, no en negocio.»*) **y corre el día 1** (*«sí, lo quiero lo antes posible»*): el «día 3» se apoyaba en un margen de sync-utilidad; medido, las ventas cierran la misma noche (última factura de julio 31-jul 19:15 UTC, de agosto 31-ago 19:15 UTC). Guardia nueva: sin sync de facturas en success para las 8 tras el cierre, el mensaje NO sale (error interno, lo reintenta la reconciliación días 1-2). Candados: `guias-eliminar-en-la-fila` (redirigido) · `guia-form-destinos` · `guias-destinos-cliente` · `guias-atajos-facturas` · `acs-resumen-canal-privado` (extendido) · `grupo-resumen-mensual-dia-1` (nuevo); **17 mutaciones, 17 cazadas** (`scripts/_mutar-candados-guias-ajustes-4sep.sh`) y los dos scripts anteriores re-corridos en verde. Sin commitear. |
| **Login — sesión vigente ya no pide contraseña** (3-sep) | **Defecto medido:** en 30 días hubo **451 entradas y en 297 el mismo usuario tenía el pase de 7 días vigente** (remedido al 3-sep: 453 de 468; Bodega 81/81, Daniel 146/147, gap mediano entre logins del mismo usuario: 2,3 h). La cookie estaba viva, pero el rol vivía solo en `sessionStorage` —que se borra al cerrar la app— y la pantalla de login nunca miraba la cookie: cada apertura pedía contraseña y creaba una sesión nueva. **Arreglo** (Daniel: «Aprobado»): con el pase vigente se entra directo a la casa del rol vía `GET /api/auth/sesion` — fail-closed: firma HMAC + token vivo y del MISMO usuario en `user_sessions` + usuario activo en `fg_users`, rol y módulos frescos de la base (payload compartido con el login: `src/lib/sesion-payload.ts`). Pase vencido, revocado o cerró sesión → la contraseña, exactamente como hoy. **No se tocó**: maxAge 7 días, middleware, rate limit, bcrypt, retención de 14/90 días. Colateral encontrado al mapear: el «Salir» del home NO revocaba la cookie (solo borraba `sessionStorage`) y los otros dos logouts mandaban el DELETE sin esperar — los 3 ahora revocan y esperan antes de navegar. Candado `sesion-vigente-no-pide-contrasena.test.tsx` (13 casos, CONTROL explícito); **9 mutaciones, 9 cazadas** (`scripts/_mutar-sesion-vigente.sh`). Sin commitear. |
| **Préstamos — «Aplicar quincena» pregunta la fecha de pago** (3-sep) | **Defecto medido:** el botón «Aplicar quincena (N)» existía desde junio y **no se usó ni una vez en 90 días** (cero `prestamo_aplicar_quincena` en `activity_logs`): escribía la fecha de HOY y contabilidad registra 1–4 días después del pago (las 6 quincenas jun–ago, todas: 15-jun→18-jun, 30-jun→1-jul, 15-jul→16-jul, 30-jul→3-ago, 15-ago→17-ago, 30-ago→1-sep). Por eso lo hacía a mano: 6 pasos × 13 personas, **15 minutos por quincena** (la del 1-sep: 13 movimientos, 16:14–16:29). **Arreglo** (Daniel: «Aprobado»): el botón abre un diálogo que **pregunta la fecha de pago** — dos atajos con los 2 días de pago que acaban de pasar (el 15 y el fin de mes REAL: 28/29/30/31) más cualquier fecha —, dice cuántas personas y el total, y **dice en pantalla quién ya tiene el descuento de esa quincena y no se lo vuelve a aplicar**. De 78 pasos a 1. La quincena del dedup se deriva de la fecha ELEGIDA (nueva migración `20260917120000_prestamos_quincena_fecha_elegida.sql`, **aplicada** (verificado el 5-sep-2026): recorta la tolerancia del dedup a `[inicio, fin+3]` — con los −3 días viejos, el pago del 15 bloqueaba el lote del 31 y no le aplicaba a nadie). **No se tocó**: el pago individual ni el cálculo del monto. Candados `prestamos-aplicar-quincena-fecha.test.ts` (37) + `prestamos-aplicar-quincena-pantalla.test.tsx` (6); **17 mutaciones, 17 cazadas** (`scripts/_mutar-prestamos-quincena-fecha.sh`). Sorpresa medida: contabilidad guarda el fin de mes como día **30** incluso en meses de 31 (30-jul, 30-ago) — el atajo propone el fin de mes real (31), la misma quincena; si prefiere el 30, un toque en el campo de fecha. Sin commitear. |
| **Ventas › Resumen — costo con notas de débito** | (3-sep) Active Wear agosto 2026 mostraba costo **−$44.483** (una NC de $74.166 restada y su ND de $73.752 nunca sumada). El costo del Resumen y de Vista General ahora incluye las ND vía `switch_factura_utilidad` (`switch_costo_unificado_v2`, `ventas_dashboard_summary_v2`, `prev_same_period_v4`); **migración `20260915120000` aplicada por Daniel el 3-sep** → Active Wear agosto = **$5.558,17** (= Switch). Cuadrado al centavo en 8 empresas × may–ago. `switch_costo_diario` ya no alimenta ninguna pantalla: solo el **cuadre mensual** (`cuadre-costo.ts`, reconciliación 10/14/18 UTC; más de 2 % y de $100 → 🔧 SISTEMA por Telegram, anti-loop 7 días; backtest 32 pares: 0 disparos). Commit `910cb244`. |
| **Pendientes críticos del 31-ago** | ✅ Token de Supabase rotado por Daniel el 2-sep. El documento de Boston: Daniel pidió olvidarlo (ver decisiones). |
| **Asistencia** | Planilla con ciclo elegir rango → Generar → revisar → **Cerrar** (congelada, con reabrir). Calendario de un solo mes, primer clic elige el inicio, sugiere el día siguiente a la última quincena cerrada. **Hora extra arranca a los 10 min** (era 15) y **ya no se le resta el atraso**. Vacaciones encendida con el texto de la casilla arreglado. **Reporte pasó a ser la primera pestaña** (primero se ordena, después se paga). |
| **Asistencia › Planilla — el aviso «horas extra sin aprobar» nunca salía** (3-sep) | **Defecto:** el aviso ámbar «N personas tienen horas extra sin aprobar: NO se pagaron en este cuadro» y el **freno para cerrar la quincena** leían `extraMedido`, que son las horas **ya filtradas** (lo PAGADO). Con todo sin aprobar era `null` → ni aviso ni freno, y se podía cerrar la quincena con extras sin aprobar «sin forma de arreglarlo después sin reabrir»; con aprobación parcial (martes sí, miércoles no) el aviso decía los minutos del **martes** como «sin aprobar». **Arreglo:** lo que quedó afuera viaja en la línea (`extraNoAprobada`: minutos, diurno/nocturno y **el monto que se pagaría al aprobar**, misma rata y mismos recargos que el pago); aviso y freno leen eso. Cero cambio en lo que se paga. **Medido en producción, quincena 1–15 sep al 3-sep:** el aviso viejo decía **0**; el real es **24 personas · 20,22 h · $81,19** (Boston 11 · 7,74 h · $29,83 — Fashion Wear 8 · 9,14 h · $39,16 — Vistana 5 · 3,34 h · $12,20), 0 días aprobados en la tabla, y el cierre **sí frena**. Candado `planilla-aviso-extras-sin-aprobar.test.ts` (motor real, 23 casos); **26 mutaciones, 26 cazadas** (`scripts/_mutar-candados-aviso-extras.sh`); medición `scripts/_medir-aviso-extras-sin-aprobar.ts`. ✅ **Segunda vuelta el 3-sep (noche), con las dos decisiones de Daniel:** (1) cada persona del aviso y del freno es un **enlace** que lleva a Aprobaciones con esa persona abierta y resaltada, con el mismo rango; (2) **Yulissa (servicio profesional) ya no genera horas extra** —ni aviso, ni freno, ni fila en Aprobaciones; sus tardanzas y ausencias se siguen midiendo—: el aviso queda en **23 personas · 19,50 h · $81,19**. Ver la tabla de decisiones. |
| **PDF de asistencia** | El pie se salía 213 mm de la hoja (jsPDF no corta solo) y una flecha `→` dejaba ilegible la línea entera de vacaciones. Arreglados los dos con candado. |
| **Reclamos** | ITBMS dice **7%** (era 7.7%): la tasa real aplicada sobre subtotal + importación. Ni un centavo cambia; verificado contra los 47 reclamos. |
| **Voseo** | 62 textos en 38 archivos pasaron a tuteo neutro. Candado `nada-de-voseo.test.ts`. «Decidilo vos» → «Tú decides». |
| **Gastos** | Switch cambió el formato del CSV el 1-sep (la cuenta llega con el nombre pegado). Se lee por el principio de la celda, y **un renglón ilegible ya no desaparece en silencio**: queda en `skip_details`, se ve en pantalla y avisa. Primera corrida verde esperada el 3-sep 10:35 UTC. |
| **Alertas** | Dos nuevas: «un sync trajo cero donde siempre trae cientos» y «un módulo dejó de recibir datos». Backtest de 96 días: 1 disparo, 0 falsas alarmas. Las ventas de ACS van al chat privado de Daniel (`enviarNegocioPrivado`), fuera del grupo de 3. |
| **Catálogo Reebok** | El sync inventaba `male`/`footwear` para todo. Ahora lee `rubro`/`subrubro`/`marca` de Switch vía `switch_articulo_info` (fichas por `/apiarticulos/info`, tope 400/corrida). Mapa por marca: **la marca manda la categoría** (FOOTWEAR/APPAREL/HARDWARE), el subrubro el género, y **UNISEX se desempata por el nombre** (`WOMEN` o `W` sola → Mujer, si no → Hombre). Medias = Ropa. 0 sin clasificar entre los 217 con existencia. |
| **Ventas › Clientes** | Tres defectos. (1) **Boston estaba dentro de `clientes_master`** (4.914 de 5.064 filas) y el ranking unía por nombre: City Mall David decía $227.872 y son **$113.936**. Boston fuera (soft delete), y el ranking une por **código** vía `(empresa_key, cliente_switch_id)`. (2) **Faltaba Joystep** en los filtros de empresa. (3) **El mostrador** se buscaba por nombre y encontraba 1 de 6: decía $25.835 y son **$54.478**. Los tres con migración aplicada por Daniel. |
| **Boston** | Sus **clientes** ya no se ven en ninguna superficie del grupo (ni por URL: `/api/clientes/<código>` contesta 404). Sus **ventas** siguen sumando en Vista General y Ventas › Resumen — decisión de Daniel: *«su plata suma, sus clientes no se ven»*. |
| **Acceso a Switch** | Las 8 URLs del panel están en `.env.local` (gitignored). Verificado login en las 8. Ya se puede consultar cualquier empresa al momento sin depender de crons ni de Analítica. |
| **Ventas — «vs año anterior», 7 lugares** (3-sep) | Clientes comparaba 8 meses contra 9 (+3% → **+36%** Multi Fashion Holding). Una auditoría medida encontró 6 más con el mismo error: Resumen › Anual (grupo −7,0% → **+2,5%**, 5 de 8 cambian de signo) · Resumen › mes×año (Boston −93,5% → **+2,2%**) · Vista General · Productos de Ventas y de Multifashion (un día de más al año pasado, siempre) · Vendedoras (decía «vs año pasado», comparaba vs mes anterior → **rótulo corregido**, decisión de Daniel) · la RPC del Resumen cortaba en UTC. Definición única en `clientes-corte-comparativo.ts`. **Migración `20260910120000` (corte en Panamá) aplicada (verificado el 5-sep-2026)** — hasta entonces Resumen/Anual/Vista General comparan mismos días pero con corte UTC. |
| **CXC — últimos 3 pagos** (3-sep) | Al lado del nombre, botón «Últimos pagos ›»: un clic, la fila sigue cerrada, sub-fila con los 3 últimos por empresa. Mismo patrón que Boston ya tenía. Celular igual. Boston con su consulta aparte. |
| **Gastos** (3-sep) | Primera corrida verde con el arreglo: 10:35 UTC, 7 empresas, 0 descartados, Vistana de vuelta en 378. |
| **Herramientas** (3-sep) | 5 skills (`supabase-postgres-best-practices`, `vercel-react-best-practices`, `numero-no-cuadra`, `traer-reporte-switch`, `cerrar-sesion`). `npm run migrar <archivo.sql>` aplica una migración desde la terminal con confirmación; necesita `SUPABASE_ACCESS_TOKEN` en `.env.local`. Las 8 URLs del panel de Switch en `.env.local`, login verificado en las 8. `docs/switch-referencia.md`: los 14 PDFs oficiales digeridos con 86 citas de página. |
| **Verificado contra Switch** (3-sep) | El precio editado en un pedido **sí** llega a la factura (271 de 272 renglones; el parámetro 0072 está apagado en las 4 empresas — no encenderlo). La sesión única es **por USUARIO**: el sistema entra como `daniel` y por eso cada cron lo expulsa del panel. |
| **Tests** (3-sep) | Suite en **cero rojos** por primera vez: los 3 de catálogo fallaban porque el test miraba el calendario real (pedido de agosto, lista abre el mes en curso). Fecha fija. |
| **Análisis para Daniel** (3-sep) | Bolsas de ACS (censo de 14.462 tickets: 60% de 1 ítem; de los con calzado, 54% son un par y nada más). Inventario de ACS: $123K a costo, gira en 3,4 meses, compra el 84% de lo que vende (no acumula; el +36% de compras al grupo es normalización tras vaciar en 2025). $34,8K sin rotación en 90 días; lo peor son colores de cartera que no rotan mientras el color bueno se agotó, y 63 artículos que venden bien están en cero. Daniel confirmó ajuste de inventario de ~$68K y que ACS compra 100% al grupo. |
| **Telegram ACS — línea «🎯 Meta»** (3-sep) | El resumen de las 8pm cierra con `🎯 Meta  ▲ +13% arriba del ritmo` (o `▼ … abajo del ritmo`), y nada más cambia del mensaje. Ritmo = lo que vendió el año pasado hasta el mismo día, multiplicado por el factor de la meta (420.000 ÷ 340.698,55 = 1,2328); mismo corte que Mes/Año, mismo «vendido» que la pestaña Metas. Sin meta grupal activa que cubra el día, la línea no sale. **Medido 3-sep:** vendido $4.599,07 · ritmo $4.061,12 · **+13%** (igual al mockup aprobado). Candado `acs-resumen-meta-ritmo.test.ts` (33 casos); **22 mutaciones, 22 cazadas** (`scripts/_mutar-candados-meta-ritmo-telegram.sh`); medición `scripts/_medir-meta-ritmo-telegram.ts`. |
| **Documentación** | `CLAUDE.md` ganó «Dónde vive cada dato» (mapa por pregunta, con advertencias de para qué NO sirve cada tabla) y «Cómo trabajar con Daniel». Skill nueva `switch-cambio-algo`. Este archivo. |

## Decisiones de Daniel del 1 y 2 de septiembre

| decisión | resultado |
|---|---|
| ¿El «Mes» del resumen de ACS el día 1? | **Se deja.** Calendario contra calendario es lo correcto para un mes. |
| ¿Unisex en Reebok? | **Hombre**, salvo que el nombre diga `WOMEN` o `W` sola → Mujer. Un producto en un solo lugar. |
| ¿Medias? | **Ropa.** *«Es apparel, ¿por qué sería accesorio?»* |
| ¿Bulto? | **Calzado 12, todo lo demás 6.** |
| ¿Boston en el directorio del grupo? | **Fuera.** ¿Sus ventas en Vista General? **Se quedan.** |
| ¿El cliente se identifica por…? | **Código.** *«Todos los D-24 son de City Mall across mis 6 empresas.»* Medido: 138 de 147 códigos cuadran en las 6. |
| ¿Usuario dedicado `sistema-api` en Switch por empresa? | **No.** (3-sep) Se confirmó midiendo que la sesión de Switch es por USUARIO y que cada cron expulsa a Daniel del panel; la solución era un usuario aparte por empresa. Daniel: *«no»*. El sistema sigue entrando como `daniel` y la regla de ≥15 min entre crons de la misma empresa se queda. **No volver a proponerlo.** |
| ¿Los 4 reportes de Switch que sobrevivieron? | **Ninguno.** (3-sep) *«No me interesa saber qué factura pagó, solo ver sus últimos 3 pagos y fecha en CXC»* — eso se hizo. Ventas por renglón de ACS: *«solo quiero saber cuánto se vendió, y eso ya lo tengo al centavo»*. Ingresos varios e inventario a fecha: tampoco. Preguntas de inventario y análisis se las hace al asistente directo, no se construyen pantallas. |
| ¿El documento de $266M en la cartera de Boston? | **Olvidarlo.** (3-sep) Daniel: *«quiero olvidar esto»*. No listar como pendiente. |
| ¿Vendedoras de Multifashion: arreglar la comparación o el rótulo? | **El rótulo.** (3-sep) *«el rótulo (que diga "vs mes anterior", que es lo que hace)»*. Ahora dice «Δ vs agosto 2026». |
| ¿Tandas de fechas 2, 3 y 4 (unificar selectores de mes/año)? | **Eliminadas.** (3-sep) *«elimínalo»*. Cosmético, con riesgo, nadie se queja. |
| ¿Analítica de Switch? | **No hace falta.** (3-sep) *«no necesitas Analítica para consultar, tienes el acceso a cada switch»*. Se entra por la web con usuario y contraseña. |
| ¿Cómo mandarle comandos? | Con el prefijo `!` desde el chat, **siempre con ruta absoluta**, o directo en su terminal. Un `.sql` no se ejecuta: se copia con `pbcopy` o se aplica con `npm run migrar`. *«así es como me gusta»* (el `!`). |
| ¿Cómo trabajar? | **Mapear → definir juntos → ejecutar.** Nunca código antes de que él defina. Mockup de ahora/después solo cuando hace falta, visual, sin párrafos. |
| ¿Los 4 Reinaldo de la tabla de tasas? | **Una persona, una fila.** (3-sep, noche) Tabla de alias; el nombre es **«Reynaldo», con Y** (*«llámalo Reynaldo y no Reinaldo»*), capitalizado en pantalla, sin la nota «N nombres en Switch». AGUAS y Rey Stoute Aguas son la misma persona. |
| ¿Daniel Levy en «Tasas por vendedor»? | **Fuera.** (*«quítalo»*) Sigue en `VENDEDORES_SIN_PAGO` y en la tabla de comisiones, gris. |
| ¿Las exclusiones aplican a venta y cobro juntos? | **Por separado.** (*«poder quitar comisiones en ventas o comisiones sin que tengan que ser de los dos»*) Dos casillas; las 11 cargadas quedan con las dos; al agregar arranca con las dos y él desmarca. Las dos apagadas no se guarda. |
| ¿La lista de clientes que no comisionan? | **Agrupada por empresa.** Y el botón «Configurar» de Por empresa se quita: *«configuración en dos lados»*. |
| ¿Rey Stoute Aguas, que con el alias volvió a la matriz ($49,83 en 2026)? ¿Y el nombre capitalizado, solo en Configuración? | (3-sep) *«esconder rey stoute. si capitiliza reynaldo.»* y, corrigiendo la primera versión: *«te dije que eliminaras Rey Stoute Aguas.»* **Retirado**, no escondido: no existe en ninguna superficie de Comisiones (matriz, por empresa, tarjetas, detalle, los 3 Excel, Configuración) ni en los totales; el servidor rechaza con mensaje una tasa o una exclusión a su nombre; su fila de tasa se desactiva (`activo = false`, nunca DELETE) con **migración `20260916120000_retirar_rey_stoute_aguas.sql` **aplicada el 3-sep-2026**. El alias AGUAS → REY STOUTE AGUAS se queda. Sus 4 facturas siguen en Switch. Lista única `src/lib/comisiones/retirados.ts`, por el nombre canónico. **«Reynaldo Espinosa» capitalizado en todas las tablas, tarjetas, el detalle y el Excel** (solo cómo se muestra; la clave sigue en mayúsculas, 0 números cambian). Medido: total pagable 2026 82.109,56 → **82.059,73**, exactamente los 49,83 de su fila. 32 mutaciones, 32 cazadas (`scripts/_mutar-candados-comisiones-retirados-mayusculas.sh`). |
| ¿Se puede cerrar la quincena con horas extra sin aprobar? ¿Y el aviso lleva a la persona? | (3-sep) *«si, no dejar cerrar hasta que se apruebe o se rechace, y al hacer clic en el mensaje de aprobacion, que te lleve al colaborador para aprobar»*. El freno del cierre ya existía (a386c658); ahora **cada nombre del aviso ámbar y del freno es un enlace** a Aprobaciones con `persona=<código>` y el rango del cuadro; la pestaña abre el primer día pendiente de esa persona, la resalta y muestra «Mostrando a … — ver a todos ×». No filtra a los demás. Candado `planilla-aviso-lleva-a-aprobaciones.test.tsx` (8 casos; 6 mutaciones, 6 cazadas a mano). |
| ¿Yulissa (servicio profesional) genera horas extra? | **No.** (3-sep) *«yulisa marca pero no deberia de calcular ya que es salario fijo, es solo para ver sus tardanzas y ausencias»*. Tardanzas y ausencias sí; extra, excedente, domingo y feriado en cero (`sinHorasExtra`); no sale en el aviso, no frena el cierre, Aprobaciones no la ofrece, y Planilla/Reporte/Excel/PDF muestran «—». Medido 1–15 sep: el aviso pasa de **24 personas · 20,22 h · $81,19** a **23 · 19,50 h · $81,19** (Vistana 5 → 4; los 43,5 min de Yulissa; el monto no cambia porque el suyo era null). Solo ella es servicio profesional hoy. `_mutar-candados-aviso-extras.sh`: **26 mutaciones, 26 cazadas** (los 21 de antes + 5). |
| ¿Qué le agregamos al Telegram de ventas de ACS por la meta? | (3-sep) *«el mensaje de telegram igual que hoy en día solo que diciéndome si están qué porcentaje arriba o abajo para la meta, pero tienes que calcular bien cómo hacerlo para hacerlo accurate»*; confirmó la cuenta: *«es calcular 23% arriba del mismo día año anterior sumando todos los días pasados?»* → sí. **Una sola línea al final**, con 0 decimales como el mockup. |
| ¿Y la fila «COLABORADOR» (−$5,28 en 2026) que quedó en la matriz? | (3-sep) *«quita colaborador».* **Retirado** igual que Rey Stoute Aguas: agregado a `VENDEDORES_RETIRADOS` (`src/lib/comisiones/retirados.ts`) y con eso sale de todas las superficies y de los totales. Qué es: el usuario genérico de Switch en Vistana con el que se facturó el mostrador («Ventas Locales») 2023-2025 — 1.024 facturas y 827 recibos, todos en Vistana, último documento 23-mar-2026. En 2026 son 2 movimientos (cobro $343,75 en enero → +1,72; NC $1.400 a Minera Panamá en marzo → −7,00). Medido: total pagable 2026 81.866,22 → **81.871,50** (sube exactamente los 5,28). Sin tasa, exclusión, alias ni descuento fijo → **sin migración**. Candado en `comisiones-retirados-y-mayusculas.test.tsx` (CONTROL Edwin sigue), mutación nueva «se quita COLABORADOR de la lista» en el mismo script. |

## Pendientes vivos al 3-sep (los del 31-ago siguen salvo los marcados ✅)

- ✅ **Ventas › Clientes «vs 2025» compara 8 meses contra 9** (cortaba el año anterior a fin de mes). Multi Fashion Holding decía +3% y es **+36%**; medido sobre los 115 del ranking, 37 cambiaban de número y 6 de signo. Arreglado el 3-sep con la regla de «mismos días»: **migración `20260909120000_clientes_vs_anio_anterior_mismos_dias.sql` **aplicada** (verificado el 5-sep-2026).
- **1.363 fichas de Reebok** sin traer (artículos sin existencia). Drenan solas a 400/día.
- ✅ Documentación de Switch digerida → `docs/switch-referencia.md` (3-sep).
- ✅ **Los tres chicos del 31-ago** (3-sep, tarde): heartbeat huérfano de `sync-mayor` (**migración `20260914120000` aplicada el 3-sep**; candado en verde), `supabase/.temp/` fuera del índice y en `.gitignore` (nada sensible en el historial), y las filas con saldo 0 de Boston **son correctas** — documentos pagados que el reconcile cerró; se filtran, no se borran. Detalle en la sección 7.
- ✅ **Comisiones — UNA PERSONA, UNA FILA (alias de vendedor) + Venta/Cobro por separado** (3-sep, noche). Daniel revisó la pestaña Configuración ya en producción: *«¿por qué hay 4 Reinaldo?»*, *«llámalo Reynaldo y no Reinaldo»*, Daniel Levy en tasas *«quítalo»*, *«poder quitar comisiones en ventas o comisiones sin que tengan que ser de los dos»* (*«las 11 que ya cargamos quedan con las dos marcadas»*, *«arranca con las dos marcadas pero yo deselecciono»*), agrupado por empresa y sin el botón Configurar de Por empresa (*«configuración en dos lados»*). Commit `c1d84b2d`; **migración `20260913120000_comision_vendedor_alias_v8.sql` aplicada por Daniel el 3-sep** (verificado: alias, tasas 5 filas, 11 exclusiones activas, v8 responde) (tabla `comision_vendedor_alias` + `comision_vendedor_canonico()` + `comision_b2b_v8` + detalle v5 + colapso de tasas 9→5 con `REYNALDO ESPINOSA` 1 %/1 % + exclusiones 17→11 activas con `excluye_venta`/`excluye_cobro`). Hasta entonces la pantalla cae sola a la v7 y lo dice (`alias_aplicado: false`), y la Configuración muestra las grafías como vienen. **Medido con el SQL real, ene–sep 2026, por persona: 0 celdas cambian** (cuadre v7 pglite vs producción 680/0); la fila de tasa con cobro 0 % (`REINDALDO`) solo tocaba 2023 (+1.017,31) y 2024 (+327,79). Detalle en `docs/postmortems/ventas-referencia.md` («UNA PERSONA, UNA FILA»). ✅ **Las dos decisiones que quedaban se tomaron el 3-sep** (*«esconder rey stoute. si capitiliza reynaldo.»* → *«te dije que eliminaras Rey Stoute Aguas.»*): Rey Stoute Aguas **retirado** de Comisiones entera (lista única `lib/comisiones/retirados.ts`, **migración `20260916120000_retirar_rey_stoute_aguas.sql` **aplicada el 3-sep-2026** — desactiva su tasa, nunca DELETE) y «Reynaldo Espinosa» capitalizado en tablas, tarjetas, detalle y Excel. Ver la tabla de decisiones.
- ✅ **Comisiones — CLIENTES QUE NO COMISIONAN para un vendedor + pestaña Configuración** (3-sep, tarde). **Migración `20260912120000` aplicada por Daniel el 3-sep** (verificado: la tabla, las 17 filas y la RPC v7 responden en producción). Daniel: *«crea configuración en comisiones para desactivar cálculos de clientes»*, grano *«cliente vendedor»*, *«también venta»*; *«no lo llames así [exclusiones] y ponlo en Configuración»*; *«¿por qué en card y no como tab en toda la pantalla normal?»*; *«pon a Reinaldo 1 y 1»*. La migración cargó la tabla `comision_exclusion` + 17 filas de Daniel + `comision_b2b_v7` + detalle v4 + Reinaldo 1 %/1 %. Medido ene–sep 2026 con el SQL real: **solo Reinaldo se mueve**, Active Shoes −447,67 · Active Wear −151,19 · grupo −598,86; nadie sube. 29 mutaciones, 29 cazadas. Detalle en `docs/postmortems/ventas-referencia.md`. La decisión de alias que quedaba abierta se tomó esa misma noche (ver el punto de arriba).
- ✅ **Comisiones — el cobro se paga a QUIEN REGISTRÓ el recibo, y DEFAULT y Daniel no se pagan** (3-sep). **Migración `20260911120000` aplicada** (la v6 responde en producción) — hasta entonces la pantalla cae sola a la v5 (cobro por cartera) y lo dice en la respuesta (`regla_cobro: "cartera"`). Medido ene–ago 2026 con el SQL real: grupo +1.253,58 · Reinaldo +2.507,14 · Daniel +1.943,86 · Edwin −2.640,50; lo que de verdad se paga (sin DEFAULT ni Daniel) **48.491,64 → 48.064,15**. Detalle en `docs/postmortems/ventas-referencia.md`.

## 5-sep-2026 — el respaldo completo y el directorio de Boston

| qué | resultado |
|---|---|
| 🔴 **El respaldo tenía 63 tablas afuera, y una era irrecuperable** | Medido contra producción: **56 tablas respaldadas de 136**. Afuera quedaba el **módulo Asistencia entero**, con las **6.081 marcaciones del reloj** (append-only: el reloj no reenvía el pasado — si se perdían, se perdía la asistencia de todos). También `bancos_saldos` (contabilidad a mano), `egresos_varios`, la configuración de comisiones, los tres catálogos nuevos con sus pedidos, `depurador_descripciones`, `carga_history`, `guias_destino_cliente`, `fg_user_switch_vendedor`, el mayor retirado, `recordatorios` y `activity_logs`. 🩸 Y **`products`, el catálogo de Reebok**, que la documentación daba por respaldado y no lo estaba. Ahora se respaldan **125 tablas** (113 en el grupo core, 12 en el de switch); el archivo diario pasa de **33,60 MB a ~37,2 MB** (+11%). |
| **El arreglo de verdad es el candado, no las 63 líneas** | El hueco no fue descuido: **nada avisaba**. Toda la base quedó clasificada por *qué se pierde si se pierde* (`src/lib/backup/tablas.ts`: `personas` · `congelada` · `switch` · `bitacora` · `retirada` · `vista`) y `backup-nada-sin-copia.test.ts` pone el build **ROJO** si una migración crea una tabla que nadie clasificó, o si alguien saca del respaldo algo que no vuelve. El test de integración (`RUN_DB_TESTS=1`) compara contra el catálogo real, porque **31 de las 136 tablas nacieron en el panel de Supabase** y el candado estático no las ve. |
| 🩸 **Segundo hueco, silencioso de verdad** | Una tabla cuya PK **no es `id`** y no está en `ORDER_BY` deja un respaldo **incompleto que parece completo** (PostgREST puede saltear filas entre páginas). Había 3 excepciones escritas a mano; de las 63 tablas nuevas, **16 tienen PK compuesta**. La llave real de producción vive medida en `PK_QUE_NO_ES_ID` y el candado exige que el `ORDER_BY` la cubra columna por columna. |
| **Lo que quedó afuera a propósito** | `switch_factura_lineas` (163.722 filas, 97 MB crudos): re-derivable de verdad y suma ~10 MB gz **por día**. Los logs de sync (se podan a propósito), el estado de infraestructura y 🔴 **`user_sessions`, por seguridad**: son tokens vivos y sacarlos del proyecto es repartir credenciales. |
| 🩸 **El directorio de clientes de Boston llevaba 37 días congelado** | Sus **4.915 filas** tenían el MISMO `synced_at` —`2026-07-30 06:31:07`, al milisegundo—. Causa: el único escritor del directorio vivía **dentro** del sync de estado de cuenta por API, vetado para Boston (4.912 llamadas HTTP, 54 min contra un techo de 800 s). El `switch_sync_log` lo confirma: **el día que Boston salió de ese cron es el día exacto en que su directorio se congeló**. Nadie lo vio porque **ninguna alerta lo cubría**. |
| **El arreglo: un cron semanal propio** | `/api/cron/sync-clientes-boston`, **domingos 07:10 UTC** (domingo 2:10 a.m. de Panamá). Daniel: *«semanal»*. Pide solo la lista (~99 páginas, no 4.912 llamadas) y escribe con el MISMO código que las 6 del grupo (`clientes-directorio.ts`, un solo escritor). Queda a **40 min** del bloque `all-0630` y a 40 de `sync-recibos` (07:50) — el doble de la separación mínima. |
| 🔴 **Y sigue sin tocar al grupo** | Escribe SOLO `switch_clientes` con `empresa_key = 'confecciones_boston'`. `clientes_master` **no se toca** (Daniel: *«los clientes de Boston no quiero que toquen los de Fashion Group… no quiero volver a pasar por el mismo error»*). Dos guardas antes de marcar a alguien como ausente: lista completa **y** que no haya encogido por debajo del 70% de lo conocido. Lista vacía = error, no se escribe nada. |
| **Y ahora sí se vigila** | Alerta **B** de silencio de datos sobre `switch_clientes`, **solo Boston** (la misma tabla la escriben tres crons con tres ritmos), umbral **semanal de 165 h**: avisa a la primera corrida perdida, porque la siguiente oportunidad es dentro de siete días. `clientes` **no** entra a la alerta A a propósito: A pide 10 corridas previas en 30 días y un par semanal nunca junta más de 4 — sería una vigilancia que parece existir y nunca puede disparar. |
| **Tests** | `backup-nada-sin-copia.test.ts` (9) · `backup-tablas-produccion.test.ts` (4, contra producción) · `boston-clientes-no-tocan-el-grupo.test.ts` (21). **29 mutaciones, 29 cazadas** (`scripts/_mutar-candados-respaldo-boston.sh`), CONTROL en verde. |

### Pendiente de Daniel (5-sep)

- ✅ **Migración `20260923120000_sync_log_clientes.sql` — APLICADA** (verificada el 5-sep-2026 contra `supabase_migrations.schema_migrations`). Agrega el `sync_type` `clientes` al CHECK de `switch_sync_log`. **La app funciona sin ella**: el cron escribe el directorio y registra su heartbeat igual; lo único que falta hasta que corra es la fila del log (y la alerta B no depende de ella).
- **Confirmar el tiempo de la corrida del respaldo después del deploy.** La core midió 248 s de 800 con 59 archivos; ahora suma ~69 tablas chiquitas (estimado +60-120 s). Lo que no entre queda **pendiente**, como siempre, pero conviene mirar la respuesta del primer cron.
- ⚠️ **`switch_factura_lineas` fuera del respaldo es una decisión de costo, no de riesgo.** Si Daniel prefiere protegerla, es una línea en `SWITCH_DATASETS` y ~10 MB gz por día.

---

## 4-sep-2026 — limpieza de Ventas, CXC, Referencia y Comprobantes

Cuatro cosas chicas, las cuatro aprobadas por Daniel. Nada de esto cambia un número.

### 1. Fuera la píldora «Sincronizado» de Ventas › Resumen

**Estaba:** el Resumen mostraba una píldora verde «Sincronizado \<fecha\>» que vigilaba
**3 empresas de 8** — `SWITCH_FACTURAS_EMPRESA_KEYS` se había quedado en
`active_shoes, active_wear, american_classic` mientras el cron de facturas cubre las ocho.
Con Vistana o Fashion Wear congeladas, el Resumen mostraba números viejos **en verde**.

**Daniel:** *«¿de qué sirve tenerlo si ya el sistema corre fluido y si no me avisa por Telegram
para arreglarlo?»*

**Queda:** la píldora se fue de las dos caras del Resumen (escritorio y celular) y la constante
se retiró de `empresa-mapping.ts`. **Verificado antes de quitar nada:** la cobertura por Telegram
para las 8 es real — `src/lib/datos-frescos.ts` DERIVA su lista de `empresasConFacturas()`, y las
ocho empresas tienen `facturas: true` en `EMPRESA_SYNC_CAPABILITIES`; el umbral es 24 h, corre en
las tres pasadas de `switch-reconciliacion` (10/14/18 UTC) y encima está la regla 2 (dos fallos
seguidos del mismo par). Comisiones **conserva** su píldora: lee `switch_recibos`, otra tabla.
El candado (`textos-pendientes-284.test.ts`) cambió de dirección —donde exigía la píldora ahora
exige que NO esté— y lleva CONTROL de que el Resumen sí se pinta.

### 2. Fuera los favoritos ⭐ del Cuentas por Cobrar

**Daniel:** *«quita favoritos»*.

`cxc_favorites` tuvo **0 filas en toda su historia** y su endpoint exigía `rolesBoston()`, así que
un **vendedor** —que sí ve el CXC— recibía **403** al tocar la estrella. Se fueron: la estrella
(escritorio, celular y la pestaña de Boston), la regla de orden «favoritos arriba», el
*optimistic update* con su rollback, la copia en `localStorage`, `leerFavoritos` /
`alternarFavorito` y la ruta `/api/cxc/favorites`.

🔴 **La tabla NO se borró** (patrón `mayor_lineas`): queda sin lectores ni escritores, y
`cxc-favoritos-retirados.test.ts` pone el build rojo si una migración la dropea o si la estrella
vuelve por cualquiera de sus cuatro puertas.

Efecto lateral que conviene saber: era la ÚNICA ruta de anotación que alcanzaba `gerente_boston`
(David). Hoy no tiene ninguna — las dos que quedan (`overrides`, `contact-log`) son de
`["admin","secretaria","vendedor"]`. El tabique por cartera (`respuestaSiCarteraAjena`) **se
conserva** para el día en que alguna se abra a `ROLES_BOSTON`, y pasó a medirse por conducta.

### 3. El botón «Actualizar datos de Switch» de Referencia volvió

**Daniel:** *«activa el botón de Referencia»*, *«referencia lo puede ver todos, y sin aviso»*.

La ruta `POST /api/ventas/referencia/actualizar` siguió viva 24 días **sin botón**: se lo llevó
por delante el rediseño de Referencia del 11-ago (`9b1899e1`), dentro de la «franja de catálogo»
que ese PR retiró. No fue una decisión, fue colateral.

**Queda:** el botón vive junto a «Bajar a Excel», aparece cuando hay resultados y actualiza la
empresa (o las empresas) de lo que se buscó, **en serie** —la sesión de Switch es una por
usuario—, y al terminar re-hace la búsqueda. **Sin aviso** en pantalla. Los roles salen de
**`REFERENCIA_ROLES`** (`src/lib/ventas/referencia.ts`), UNA lista que ahora comparten la página,
la búsqueda y el botón: el POST estaba en `["admin"]` mientras la pantalla se abría a vendedor y
bodega, y tres copias a mano fue exactamente el defecto. Se le puso el **acelerador de Guías**
(`SYNC_NOW_COOLDOWN_MIN` = 10 min, contra `switch_sync_log` con `sync_type = 'articulo_info'`):
dos toques seguidos no abren dos sesiones. Lo que ya hacía —higiene de sesión en el `finally`,
el candado de una corrida a la vez— quedó intacto.

### 4. Catálogos: la basura fuera de verdad, y la lista a 90 días

**Daniel:** *«borro de verdad de la base»* y, sobre los pedidos viejos,
*«si un pedido se mandó a switch, ya está safe, no?»*.

- **Se borran de verdad los pedidos de PRUEBA**: 16 de `calvin_orders` y 37 de `joybees_orders`
  (todos ya `deleted`, todos `borrador`, de las corridas de verificación del 12-13 de agosto más
  dos del bot del 24-jul). Va por migración —
  **`supabase/migrations/20260924120000_borrar_pedidos_de_prueba.sql`, ⚠️ PENDIENTE DE APLICAR,
  la corre Daniel**. Trae los frenos adentro: lista explícita de **ids** (nada de `LIKE`), el que
  tenga un **envío vivo** a Switch (`estado <> 'error'`) se saca de la lista, y solo se borra lo
  que ya estaba `deleted`. **Medido: cero pedidos se salvan por tener envío** — las 3 filas de
  `calvin_switch_envios` y las 4 de `joybees_switch_envios` apuntan a otros pedidos. Se borran
  también sus renglones (16 y 45).
  ⚠️ El nombre del archivo iba a ser `20260923120000_…`, pero otro trabajo en paralelo tomó ese
  timestamp el mismo día; se movió a `20260924120000` porque dos migraciones con el mismo
  timestamp son **una sola fila** en el registro del CLI.
- **Los pedidos VIEJOS no se borran.** El pedido guarda lo que Switch no tiene (quién lo armó, el
  comentario, si fue pedido o cotización, el PDF que se le mandó al cliente) y son pocos: 23
  Reebok · 38 Tommy · 21 Calvin · 41 Joybees en todo 2026. Lo que se recorta es la **lista**: la
  pantalla de Comprobantes muestra los **últimos 90 días** y el resto queda detrás de
  **«Ver más (N)»**, sin texto explicativo al lado. El corte va después del filtro y de la
  búsqueda, y la selección masiva solo alcanza lo visible. La decisión quedó escrita, con su
  cita, en `docs/postmortems/catalogos-pedidos.md`.

### Verificación

`tsc` limpio en `src/app`, `src/lib` y `src/components` · `npx next build` verde · suite completa
verde · candados de voseo y de selector único incluidos. **29 mutaciones, 29 cazadas**
(`scripts/_mutar-limpieza-ventas.py`, con su mutación de CONTROL saliendo ⛔), más las 2 de
`_mutar-candados-boston.py` que cubrían el tabique por cartera y que se re-apuntaron a las
anotaciones que quedan.

---

## 5-sep-2026 — Préstamos, reescrito entero

Daniel definió el módulo completo con mockups aprobados uno por uno. El porqué de cada punto, con sus
citas y sus mediciones, está en **[`docs/postmortems/prestamos.md`](postmortems/prestamos.md)**; la
referencia de qué hay, en **[`docs/modulos/07-prestamos.md`](modulos/07-prestamos.md)**.

### 🔴 La regla que no se podía romper — y no se rompió

**Cero cambio en el saldo de nadie.** Medido contra producción ANTES de tocar nada: **14 personas con
saldo, $5.062,01** ($4.962,01 + $100 de BRICEIDA MONTERO). Las 14 quedaron congeladas una por una en
`prestamos-dos-cuentas.test.ts`: si una migración mueve un centavo, el build se pone rojo **con el
nombre de la persona**.

### Qué cambió

- **Dos cuentas por persona** (Préstamo · Daño de mercancía), cada una con su cuota. El total es la
  suma. 🔴 **Ningún concepto se renombró**: «Daño de mercancía» es una ETIQUETA de `Responsabilidad
  por daño` — renombrar el valor guardado no revienta nada, **lo deja de contar en silencio**.
- **La persona sale de Asistencia**: nombre, empresa, si trabaja y salario. Una ficha nace con su
  `empleado_codigo`, y ese código **ya se puede editar desde la pantalla** (hasta hoy no se podía
  desde ningún lado, y el aviso de la planilla decía que sí — así nacieron **$400** de deuda que la
  planilla no podía descontar).
- **La bandera `activo` se retiró.** Nunca significó «trabaja acá» sino «tiene algo abierto»: a ESMER
  CRUZ le archivaron la ficha al terminar de pagar sus $600 y sigue trabajando. La lista muestra
  **solo a quien debe**; quien llega a cero sale solo; quien ya no trabaja y debe **sí aparece**,
  marcado. **La columna no se borra** (patrón `mayor_lineas`).
- **Tope de un sueldo mensual** sobre la deuda TOTAL, $500 sin sueldo cargado. Solo frena el
  préstamo — **el daño se registra siempre**. Lo que pasa el tope se guarda **pendiente**, sale un
  Telegram al chat privado de Daniel, y **solo él aprueba** (rol admin **y** que sea él: hay dos
  admins). 🩸 A diferencia del freno de $500 que se retiró el 27-ago, **lo que espera se ve** en tres
  superficies y **caduca a los 7 días** (cron nuevo `prestamos-caducan`, 13:15 UTC).
- 🩸 **El freno de duplicados dejó de leer texto.** Miraba `notas ilike 'Deducción quincenal%'` y
  `ilike` no ignora acentos: **18 filas vivas lo burlaban**. El candado estaba apagado y nadie lo
  sabía. Ahora mira `concepto + origen_pago + fecha`, por cuenta. La nota es **opcional** (8 de cada
  10 eran un eco del concepto).
- **«De dónde salió» un pago**: Quincena · Décimo · Vacaciones · Liquidación · Efectivo. Medido: 9
  pagos reales salieron de una liquidación, del décimo o de vacaciones.
- **Al marcar la fecha de salida** de alguien con deuda, Asistencia lo dice ahí mismo: *«Debe $100 —
  descuéntalo de la liquidación»*. Sin Telegram.
- 🩸 **«Eliminar Todo el Historial» dejó de ser el único hard delete del repo**: soft delete con
  `logActivity`.
- **El saldo se calcula en UN solo lugar** (había ocho) y **`PRESTAMOS_ROLES` vive en uno** (estaba
  en seis).
- **El Excel pregunta «¿Solo los que deben o todos?»** y perdió la columna «Estado».

### ⚠️ Pendiente de Daniel (5-sep)

1. 🔴 **Correr `supabase/migrations/20260925120000_prestamos_dos_cuentas_y_tope.sql`.** Está
   **ESCRITA Y NO APLICADA**. Sin ella faltan `deduccion_dano`, `cuenta` y `origen_pago`, y **el
   módulo devuelve 500**: acá no hay tolerancia a DDL pendiente y es deliberado (degradar sería
   «nadie está atado» otra vez). La migración también ata a MARTHA (43) y YERITZA (51), copia los
   nombres de Asistencia, junta las dos fichas de RAMON MIRANDA ($220 + $0 = $220) y reemplaza la RPC
   de la quincena.
2. ⚠️ **BRICEIDA MONTERO**: el brief la daba por retirada, pero en `asistencia_personas` está
   **activa** (Boston, salario $566,52, sin fecha de salida). Con la regla nueva —«quién trabaja lo
   dice Asistencia»— su ficha **vuelve a proponer el descuento** de sus $100, que no se descuentan
   desde marzo. Si de verdad ya no trabaja, **la baja se marca en Asistencia**.
3. ⚠️ **STEPHANY MORALES** queda con préstamo −$254,50 / daño +$254,50 (neto $0), porque sus pagos de
   daño se registraron como `Pago`. **No se reasignó nada**: si Daniel quiere que se reasigne, es una
   migración aparte y a propósito.

### Verificación

`tsc` limpio en `src/app` y `src/lib` · `npx next build` verde · suite completa verde (**11.015
tests**) · candados de voseo, de crons y de iPhone/iPad de Préstamos incluidos.
**32 mutaciones, 32 cazadas** (`scripts/_mutar-candados-prestamos-dos-cuentas.sh`), con las seis que
el brief exigía: que lo pendiente sume al saldo · que Contabilidad pueda aprobar · que el freno vuelva
a leer la nota · que el tope mire solo el préstamo · que el daño se frene por tope · que se ate por
parecido.

⚠️ **Lo que NO se pudo verificar**: el cuerpo plpgsql de la RPC nueva no se ejecutó en ningún lado —
no hay Postgres local y producción es de solo lectura. Su lógica está cubierta por candados de texto
(que compara la derivación del SQL con la de TypeScript) pero **la primera corrida real es la de
Daniel**.

---

## 5-sep-2026 (tarde) — Cuentas por Cobrar, rediseñado entero

Daniel definió el módulo completo tras una sesión larga de mapeo contra producción. El porqué de cada
punto, con sus citas y sus mediciones, está en
**[`docs/postmortems/boston-cxc.md`](postmortems/boston-cxc.md)** (sección «Cuentas por Cobrar,
rediseñado entero»); la referencia de qué hay, en
**[`docs/modulos/01-ventas-y-clientes.md`](modulos/01-ventas-y-clientes.md)**.

### 🔴 La regla que no se podía romper — y no se rompió

**Ni un centavo se movió.** Medido contra producción ANTES y DESPUÉS, sobre
`switch_estadocuenta_aging_mv` (que es lo que lee la pantalla):

| | antes | después |
|---|---|---|
| Total de la cartera del grupo | **$3.685.289,04** | **$3.685.289,04** |
| Clientes | **100** | **100** |
| 0-90d · 91-120d · 121d+ | $1.538.790,86 · $876.667,94 · $1.269.830,24 | idénticos |

Este rediseño no toca una sola consulta de plata de la cartera.

### Cerrado

| Qué | Detalle |
|---|---|
| **«Cobrar», una hoja, cuatro salidas** | Correo (un clic, **Deshacer 5 s**) · WhatsApp · Copiar · Ver o bajar el PDF, más «Escribirlo yo». Reemplaza a **SEIS puertas**: el menú «···» (4 opciones), el botón del panel y el menú de **clic derecho**. Los dos menús se retiraron y hay candado que impide que vuelvan. Cobra todo el que ve el módulo |
| **Siempre las 6 empresas** | 🩸 El modal le pasaba el filtro de la pantalla a la ruta: con Vistana seleccionado el CLIENTE recibía un estado de cuenta **de Vistana solamente**, y Edwin (Vistana fija) no podía mandar el completo ni queriendo. La regla vive en el SERVIDOR |
| **Aviso «sin pagar hace +90 d»** | El único dato nuevo. Días desde el último pago REAL en las 6, por CÓDIGO, **sin retenciones ni recibos en cero**. El que **nunca pagó también avisa**. Cero peticiones nuevas. Filtra al tocarlo. Medido: **37 clientes · $647.944,31** |
| **Mandar a varios** | **UN correo por DIRECCIÓN**, con UN PDF de una hoja por cliente. Medido: 31 de 79 comparten 9 direcciones → **57 correos, no 79**. Los sin correo **no abortan el lote**: se dicen por nombre |
| **Estado de cuenta legible** | Total grande arriba, pastillas por empresa, **encabezados de columna**, `Original` separado de `Saldo`. **Lo chico se agrupa por MONTO (< $50), nunca por tipo**. El pie dice **«Cobrar»** |
| **«Últimos pagos» por FECHA** | Las 3 últimas fechas con el total del día y las empresas. 🩸 Por empresa eran **18 líneas para decir lo que dicen 3** |
| **Rastro de envíos** | Se anotan los tres canales (correo · whatsapp · copia) y la fila lo dice 7 días. Si lo último fue un **copiar**, la frase cambia |
| **Casilla «Contacto»** | En la ficha del cliente, arriba de Correo. **El sync nunca la pisa.** El saludo del correo y del WhatsApp la usa |
| **La pantalla** | De **SEIS bloques a DOS**: una línea de filtros + la tira de totales **en la misma grilla de 12 columnas que la tabla**. En celular los tramos entran en la tarjeta negra y **el nombre sube de 12 px a 14** |
| **Boston, mismo formato** | Tira alineada, «Cobrar» y «Documentos» por fila, cajón con encabezados. **Sigue aparte**: su propia ruta, y sus contactos salen de `switch_clientes` acotado, nunca de `clientes_master` |
| **`/admin` → `/cxc`** | El rótulo no cambió. Redirección de `/admin` **exacto** (307, con la query intacta): `/admin/usuarios` y `/admin/data-health` **no se movieron**. Todos los enlaces internos apuntan al nuevo, con barrido que lo exige |
| **La pantalla de error** | 🩸 Mostraba el `error.message` y el **stack trace completo** — la única del sistema. Hoy dice qué pasó, qué significa y qué hacer |
| **`/api/cxc-rows` retirada** | Cero llamadas desde `src/`. La tabla `cxc_rows` **no se borra** (patrón `mayor_lineas`) |

### Decisiones de Daniel

- **«todo»** — preguntado si el filtro de empresa tenía que recortar el estado de cuenta que se le
  manda al cliente. Es la que más plata cambia: hasta hoy, con «Vistana» puesto, el cliente recibía
  un pedazo de su saldo creyendo que era todo.
- Sobre el aviso nuevo, eligió **«sin pagar hace +90 d»** como la mejora más valiosa del rediseño.
- Sobre el rastro de envíos, fue explícito en que **«copiar» y «enviar» no digan lo mismo** en la
  marca de la fila.
- El **desglose por empresa del panel se queda exactamente como está**, con sus columnas «Último
  pago» y «Última compra».
- **No** se usa el plazo de crédito para redefinir los tramos (se quedan por antigüedad), **no** se
  saca del CXC a `ACTIVE SHOES, S.A.` (lo habla con contabilidad), **no** vuelve el seguimiento de
  cobro, **no** vuelven los favoritos, y **no** cambia el texto del correo más allá del saludo.

### ⚠️ Pendiente de Daniel (5-sep, tarde)

1. 🔴 **Correr las TRES migraciones.** Están **escritas y NO aplicadas**. Las tres son **tolerantes**:
   sin ellas el módulo funciona igual y solo faltan las tres cosas nuevas.
   - `supabase/migrations/20260926120000_clientes_master_contacto.sql` — la casilla **Contacto**.
     Agrega la columna y rescata los 5 que ya existían (3 de las notas del CXC + D-170 y D-202 de
     Switch), **sin pisar** lo que alguien escriba. Sin ella la casilla no se dibuja y el PATCH la
     ignora (lo demás sí se guarda, y el aviso lo dice).
   - `supabase/migrations/20260927120000_cxc_envios_canal.sql` — la columna **`canal`** de
     `cxc_emails_enviados` (correo · whatsapp · copia) + su índice. Sin ella los envíos **se
     registran igual, sin canal**, y la marca gris de la fila no se dibuja.
   - `supabase/migrations/20260928120000_aging_boston_tramos_finos.sql` — los **cortes finos** de la
     vista de Boston, iguales a los del grupo. Sin ella el detalle del `title` no se dibuja y la
     pestaña se ve como hoy. ⚠️ Los tres tramos que se VEN **no cambian**: verificado contra
     producción, `d0_90 = d0_30+d31_60+d61_90` y `d121_plus = d121_180+…+mas_365` en los 390
     clientes, **0 discrepancias**.
2. ⚠️ **La hoja «Cobrar» de Boston no manda correos, y hace falta una decisión.** Medido: de sus 390
   clientes con saldo, **272 tienen teléfono pero solo 113 correo**, y el texto de cobro del sistema
   está escrito y firmado por **Fashion Group**, que no es Boston. Mandar un correo desde ahí exige
   decidir **quién lo firma y con qué texto**. Las tres salidas que sí se pueden dar con el dato que
   hay (WhatsApp · Copiar · Ver los documentos) están todas.
3. ⚠️ **`src/app/cxc/page.tsx` quedó en 905 líneas** y el tope de la casa son 800. No se partió ahora
   a propósito —partir la pantalla en el mismo cambio que la rediseña es cómo se pierde el hilo de
   qué se rompió—, pero queda anotado.
4. ⚠️ **`/api/cxc/contact-log` y `/api/cxc-summary` tienen CERO lectores y NO se retiraron**, porque
   dos candados de Boston (`boston-acceso.test.ts` y `cxc-boston-fuera-de-toda-superficie.test.ts`)
   las nombran por su ruta y esos candados no se tocan. Retirarlas es una decisión aparte.

### 🩸 Lo que no cuadraba

**Un número del encargo estaba mal medido, y valía la pena mirarlo.** El brief traía «30 clientes,
$591.271,75» para el aviso de +90 días. Reproducida la consulta, esos 30 son los que tienen un pago
viejo: la medición se hizo con un join que **dejaba afuera a los 7 que nunca pagaron** — entre ellos
**ACTIVE SHOES, S.A. con $43.806,10**, que el mismo brief pedía como caso de control. La DEFINICIÓN
escrita («sin ningún recibo → nunca ha pagado») y la MEDICIÓN no coincidían. Se implementó la
definición: **37 clientes y $647.944,31**. Los cinco casos de control dan exactos, y la cifra de 180
días del brief ($408.414,81) reproduce **al centavo** la de los 24 que sí tienen pago — que es lo que
confirma de dónde salió la diferencia.

# Recordatorios — el rediseño del módulo (5-sep-2026)

> Post-mortem completo, con las citas y las mediciones:
> [`docs/postmortems/recordatorios.md`](postmortems/recordatorios.md).
> Mapa de la pantalla: [`docs/modulos/06-recordatorios-usuarios-infra.md`](modulos/06-recordatorios-usuarios-infra.md) § 1.

El módulo `cheques` se llamaba **Recordatorios** desde el 24-ago, pero por dentro seguía siendo la
pantalla de cheques con una pestaña pegada. Esta tanda rediseñó lo de adentro.

### Lo que se midió antes de tocar nada

19 cheques vivos (17 depositados $257.174,34 + 2 pendientes $22.221,78), **0 borrados**, un solo
cliente (Jerusalem de Panamá), último movimiento el 28-ago. **1** recordatorio (creado ese mismo
día); antes, **cero en toda su historia**. La pantalla: **1.693 líneas** y **8 pestañas**.

🔑 La lectura: el módulo SÍ se usa —la parte de cheques—, y la de recordatorios estaba vacía **no
porque no hiciera falta sino porque costaba cuatro toques y una ventana**.

### Lo que quedó

- 🩸 **Un cheque que venció y nadie marcó NO se volvía a mencionar jamás.** El aviso solo miraba hoy y
  el próximo día hábil. Estaba pasando: Vistana chq 018094, Edwin, **$18.393,32**, vencía el 31-ago y
  seguía pendiente 5 días después. Ahora hay un bloque `🔴 N cheque(s) venció…` que sale **UNA SOLA
  VEZ** y no se repite nunca más (`cheques.aviso_vencido_en`, escrito **después** de que Telegram
  confirme). Un rebotado no avisa.
- 🔑 **Las 8 pestañas se fueron.** Cuatro de ellas —vencido, vencen hoy, vencen mañana, vencen esta
  semana— **nunca fueron estados: son CUÁNDO**. Ahora son grupos de UNA lista: **Vencido · Hoy · Esta
  semana · Después · Se repiten**, con cheques y recordatorios juntos.
- **Lo depositado sale de la lista pero se encuentra con la lupa** (por cliente o número de cheque);
  el buscador es su única puerta.
- 🔴 **Ningún total sumado, en ninguna parte.** Las tres tarjetas se fueron y **no se reemplazaron**.
- **Escribir un recordatorio es UN RENGLÓN** siempre visible. **«Hoy» no existe** (todo sale a las
  9:00 a.m., ya pasó) y **no hay selector de hora**. Entró `cada_dia` y un **«Hasta…»** opcional.
- **«A quién le llega»**: al equipo o solo a Daniel. Lo eligen **solo los admin** y lo fuerza el
  servidor. ⚠️ Hay UN solo chat privado y DOS admin: si Alberto marca «solo a mí», le llega a Daniel.
- **Se quitó la línea de WhatsApp** del aviso de cheques; el resto del texto no se tocó.
- **El Excel se retiró** («se va»). Los datos siguen en la base.
- **A los 365 días un cheque depositado se retira solo**, con soft delete, dentro del mismo cron
  (sin entrada nueva en `vercel.json`).
- **El cron pasó de 14:15 a 14:00 UTC** (9:15 → 9:00 a.m. de Panamá).
- **La dirección pasó de `/cheques` a `/recordatorios`** (redirect 307 del enlace viejo). 🔴 **La
  `key` sigue siendo `cheques`**: está en `role_permissions`.
- El archivo de 1.693 líneas quedó en **800**, repartido en seis piezas, con las decisiones en
  módulos puros.

### ⚠️ Pendiente de Daniel (5-sep)

1. 🔴 **Correr `supabase/migrations/20260925130000_recordatorios_rediseno.sql`.** Está **ESCRITA Y NO
   APLICADA**. Es aditiva (ni una fila cambia de valor): `recordatorios` gana `hasta` y `destino` y
   su CHECK gana `cada_dia`; `cheques` gana `aviso_vencido_en` y `deleted_at`. ⚠️ **El código no
   degrada sin ella** — la tolerancia a «falta el DDL» se retiró de este módulo el 3-sep-2026, a
   propósito.
2. **«Recordarme este cliente» desde la hoja Cobrar del CXC** quedó pendiente: toca archivos del
   módulo CXC, que se estaba rediseñando en paralelo.

### Verificación

`tsc` limpio en `src/app`, `src/lib` y `src/components` · `npx next build` verde · suite completa
verde (**11.184 tests**, 558 archivos) · candados de voseo, de Boston y de iPhone/iPad incluidos.
**61 mutaciones, 61 cazadas** (`bash scripts/_mutar-candados-cxc-rediseno.sh`), con **3 CONTROL en
verde**.

🩸 **Siete mutaciones sobrevivieron en la primera corrida y las siete eran huecos REALES del
candado**, todas del mismo tipo: la aserción miraba el **import** o la **desestructuración** y no la
**llamada** (`expect(src).toContain("hoyPanama")` pasa aunque `const hoy = new Date()`). Se
ajustaron a mirar el uso real.

🩸 **Y los tres CONTROL salieron ROJOS en la primera corrida**, que era un hallazgo aparte: el script
mutaba `src/lib/cxc/estado-cuenta-email.ts` **sin tenerlo en su lista de respaldo**, así que esa
mutación nunca se restauraba y contaminaba todo lo que corriera después. Un script de mutación que
muta un archivo que no respalda es peor que no tenerlo.

**Candados nuevos (9)**: `cxc-sin-pagar.test.ts` · `cxc-correos-por-direccion.test.ts` ·
`cxc-estado-cuenta-legible.test.ts` · `cxc-cobrar-una-hoja.test.ts` ·
`cxc-envios-y-pagos-por-fecha.test.ts` · `cxc-ruta-y-error.test.ts` ·
`cxc-contacto-del-cliente.test.ts` · `cxc-boston-mismo-formato.test.ts` ·
`components/cxc-tira-totales.test.tsx`.

**Candados cambiados de dirección (7), ninguno borrado, todos con nota fechada**:
`cxc-pestanas-y-menu.test.tsx` · `cxc-estado-cuenta-un-boton.test.tsx` ·
`cxc-ultimos-pagos-boton-fila.test.tsx` · `cxc-ultimos-pagos-bloque.test.tsx` ·
`cxc-tramos-un-solo-nombre.test.tsx` · `cxc-ultima-compra-pantalla.test.tsx` ·
`cxc-codigo-muerto-podado.test.tsx`.


## 5-sep-2026 — Clientes: la libreta vieja retirada

Al empezar a mapear el módulo Clientes apareció **un segundo directorio**: `directorio_clientes`, 33 contactos escritos a mano antes de que el directorio viniera de Switch (jun-2026). Medido: la última entrada es del 28-may, 8 no tienen código, hay correos distintos a los reales (DE MODA: `Joseca28castillo@…` en la libreta, `josue24castillo@…` en Switch) y **3 de los 10 clientes que más deben no existían ahí** (City Moda Chorrera, Internacional Belén, Grup M.E.L.). Su único lector que quedaba era la sugerencia de nombre al abrir un pedido de catálogo; la búsqueda global la mezclaba con los resultados.

| decisión | resultado |
|---|---|
| ¿Hay dos directorios? | *«Supuestamente debe de haber uno y amarrado por código»*. Lo hay: `clientes_master`. La libreta era un sobrante. |
| ¿Se borra? | *«si sí y ningún módulo toca esa lista, bórralo»*. Se retiró de la app: `clientes-search` del catálogo y el bloque «Directorio» de la búsqueda global leen `clientes_master` (por código, sin ausentes); `/api/directorio` (3 rutas, cero llamadores) se borró. **La tabla no se dropea** —son datos que tecleó una persona— y queda `congelada` en el respaldo. |

Candado: `directorio-viejo-retirado.test.ts` (6 casos); `buscador-solo-grupo` cambió de dirección con nota. 2 mutaciones, 2 cazadas, 1 control verde. Sin migración.

**Clientes sigue en definición** (mockup enviado: la ficha con la plata primero y «Cobrar» ahí mismo; 99 de 150 sin provincia, que es el único filtro de la lista).

⚠️ **Asistencia NO está terminada con el enfoque módulo por módulo.** Recibió arreglos el 1-3 de septiembre (planilla, aviso de horas extra, Yulissa, vacaciones), pero no la vuelta completa de mapear → preguntas → mockup → aprobar con la mirada de eficiencia. Daniel (5-sep): *«asistencia no se hizo con el enfoque que estamos teniendo con los otros modulos ya terminados»*. Queda en la lista de los que faltan. Terminados con ese enfoque: Guías · Depurador · Caja · Comisiones · Préstamos · Cuentas por Cobrar; en construcción: Recordatorios.

verde (**11.100 tests, 550 archivos**) · **56 mutaciones, 56 cazadas**
(`scripts/_mutar-candados-recordatorios.sh`), de las cuales **2 son controles** que se mutan a
propósito y quedan verdes.

🩸 **Cinco mutaciones sobrevivieron en la primera corrida y las cinco eran huecos reales** (el PUT sin
mover la fecha, el destino mandado a mano, la marca antes de que Telegram confirme, el orden de los
bloques del mensaje y el `destino` ilegible en la base). Se escribieron los cinco tests que faltaban.

⚠️ **Lo que NO se pudo verificar:** la migración no se ejecutó en ningún lado (no hay Postgres local y
producción es de solo lectura). Sus CHECK están cubiertos por candados de texto que los comparan con
las listas de TypeScript, pero **la primera corrida real es la de Daniel**.


## 5-sep-2026 — La medición completa: trece agentes, todo verificado contra producción

Daniel encontró que le di **información falsa sacada de la documentación sin volver a medir** (dije que Marketing no guarda el cliente, y que los pedidos de catálogo guardan el nombre en texto; las dos cosas eran falsas). Textual: *«mira como te equivocas sin tener contexto… quiero que te tomes dos horas con varios agentes recopilando información para que estas cosas no vuelvan a suceder que me digas una info falsa, yo confío en ti y debes estar al tanto hasta más que yo del sistema»*.

Trece agentes en paralelo, **solo lectura de producción, cero cambios de código**. Se verificaron **~900 afirmaciones**; **más de 120 estaban mal**. Cada cifra quedó con la consulta que la produjo, y cada archivo con una sección «Lo que estaba mal».

### Archivos nuevos

| archivo | qué contesta |
|---|---|
| `docs/modulos/08-amarres.md` | con qué llave identifica cada módulo al cliente, proveedor y empleado |
| `docs/negocio/estado-medido.md` | ventas, cartera, cobros, margen, inventario y clientes, medidos |
| `docs/seguridad/permisos-medidos.md` | las 275 rutas, su guardia y qué alcanza cada rol de verdad |
| `docs/deuda/inventario.md` | tablas sin lectores, rutas huérfanas, código que no se dibuja |
| `docs/rendimiento/riesgos-silenciosos.md` | dónde un número puede salir cortado y verse completo |
| `docs/diccionario.md` | dónde la misma cosa se llama distinto (paso 4 del plan) |

### 🔴 Roto AHORA (pendiente de Daniel)

1. **Recordatorios está caído**: la migración `20260925130000_recordatorios_rediseno.sql` no ha corrido; verificado que las 4 columnas no existen. La pantalla da 500, el aviso de cheque vencido no sale **y el cron se anota `ok: true`**. Un comando lo arregla.
2. **No se puede cerrar la quincena**: 24 personas con horas extra sin aprobar del 1 al 4 de septiembre y **cero aprobaciones de septiembre**.
3. **Dos personas marcaron el reloj sin ficha** (códigos 39 y 55, 11 marcaciones desde el 1-sep). Sin ficha no se les calcula un dólar.
4. **Los gastos de Fashion Wear están a medio cargar desde marzo**: $3.841 en marzo, **$27,18** en abril, $257 en mayo, nada en junio ni julio, contra $62.688 y $85.148 en enero-febrero. Las demás van hasta julio. Cualquier rentabilidad de Fashion Wear que reste gastos está mal desde marzo.

### 🔴 Roto y arreglable por nosotros

5. **El sync de fichas de Reebok se rompió al cruzar las 1.000 filas.** Hay 1.408 fichas y la consulta devuelve 1.000: pide ~400 fichas por día que ya tiene y **los 355 que faltan no se clasifican nunca**. Vistana (8.273 artículos) espera el mismo destino.
6. **Una unión por NOMBRE viva, en Proveedores.** Confecciones Boston aparece en 5 empresas con 4 grafías y el mismo RUC (`655-544-133465`): la pantalla dibuja 3 fichas de un proveedor que es uno. Y funde en una los 7 `GENERAL`. El RUC está lleno en 57 de 65 filas pero tampoco está limpio: **es decisión de Daniel** cómo se identifica un proveedor entre empresas.
7. **Tres funciones que la documentación promete y no ocurren**: `useSessionCheck`, `useBadges` y `useKeyboardShortcuts` no tienen un solo importador. El chequeo de sesión no pasa, el 🔔 no cuenta, y **ningún atajo de teclado funciona** salvo ⌘K. 🩸 Uno de esos archivos **se editó hoy**: el cambio completo fue `/cheques` → `/recordatorios`.
8. **26 «avisame» (voseo) en mensajes de Telegram.** El candado tiene `avisale` pero no `avisame`: le falta la familia imperativo + `me`.
9. ~~**Packing Lists le miente al usuario**: dice «se eliminan automáticamente después de 7 días» y la retención real son 90 días desde el borrado a mano.~~ ✅ **RESUELTO el 10-sep-2026 retirando el MÓDULO entero** — Daniel: *«packing list no se usa, eliminar»*. Ver [historico/superado.md](historico/superado.md).
10. **`requireAdmin` deja pasar a `secretaria`** (`api-auth.ts`, `ADMIN_ROLES = ['admin','secretaria']`). Lo usan 10 rutas.

### ⚠️ Decisiones que solo puede tomar Daniel

- **¿Andrea debe cobrar?** No tiene el módulo `cxc` y alcanza 11 rutas de la cartera: manda correos de cobro y cobra en lote. Al revés, **Ángela no tiene `multifashion` y lo alcanza**. Causa: el guardia mira el rol, no los módulos — se tapó para Asistencia y quedó igual en las otras 224 rutas.
- **¿Las secretarias deben ver la cartera de Boston?** Hoy la ven sin tener `cxc` ni `boston`.
- **El login no pide usuario: la contraseña es la identidad.** 11 cuentas, 2 admin, sin distinguir mayúsculas.
- **Cómo se identifica un proveedor** entre empresas (ver 6).
- **`GENERAL`**: valor nuevo de Switch en 3 fichas de Reebok, el mapa no lo conoce y está avisando por Telegram.
- **Las 10 palabras del diccionario** (`docs/diccionario.md`, sección final).

### Lo que se verificó BUENO

- **Nada sin copia de seguridad**: 136 tablas, 125 respaldadas, las 11 de afuera son a propósito. El catálogo de Reebok, las marcaciones del reloj y los saldos de banco **sí están**. ⚠️ Esa copia tiene **un solo día**: el respaldo ampliado estrenó hoy.
- **Ningún cron muerto**: los 76 al día; 72 h sin una sola corrida de sync fallida (100 pares en `success`). `vercel.json` ↔ registro: biyección perfecta, 82 entradas.
- **El aislamiento de Boston no tiene fugas**, medido en las dos direcciones: cartera del grupo 211 filas / 6 empresas / **0 de Boston**; la suya 390 / 1 / **0 del grupo**. Su venta sí suma: **$472.856,97 = 7,5% de 2026**. Los tramos finos aplicados hoy: **los 390 clientes cuadran**.
- **Ninguna ruta desprotegida ni secreto escrito en el código** (275 rutas barridas). David y Jennifer, cerrados.
- **Ningún total de plata en pantalla está cortado hoy** por el tope de 1.000 filas. El CXC es el más justo: 211 de 900.
- Los tramos de la cartera (`cxc-aging.ts`) son **el modelo**: una sola fuente que leen escritorio, celular, PDF y Boston.

### Correcciones de bulto en la documentación

- **«Te deben 211 clientes» → son 100.** La vista guarda una fila por empresa; City Mall se contaba seis veces.
- **Los saldos de banco estaban inflados ~$255.000**: la doc daba el saldo **más alto de la historia** como si fuera el último. Vistana $165.363,98 → **$132.870,42**; Active Shoes $150.620,36 → **$27.647,97**.
- **El pagable de comisiones 2026 no son ~$82.000 sino $67.773,98**: un descuento que la doc daba por apagado corre todos los meses ($1.573,08 × 9).
- **Personas activas: 36, no 37** (mal desde el 26-ago).
- `06-recordatorios-usuarios-infra.md` tenía **431 líneas duplicadas**, y la copia vieja daba las marcaciones del reloj por **sin respaldo**.
- Los pedidos de prueba **ya se borraron**: Calvin 21 → **5**, Joybees 41 → **4**. Las «alarmas rojas» sobre esas marcas eran un denominador podrido.
- **Siete migraciones que `CLAUDE.md` da por pendientes ya están aplicadas.** La única pendiente es la de Recordatorios.

### Datos de Switch que tenemos y no usamos

- **La dirección del cliente**: la mandan **702 de 847** clientes del grupo y **no hay columna para ella**. Es justo lo que en Guías se arma a mano con botones del histórico.
- **La fecha en que se abrió cada ficha**: 100 códigos nuevos en 2026, 90 en 2025.
- **Crédito vs contado**, ya guardado y sin un solo lector: **1.144 facturas a crédito ($5.764.781,82) contra 53 al contado ($146.501,36)** en 2026. El 97,5% de la venta es a crédito.
- Y al revés: el **límite de crédito vale $0,00 en los 847** — una pantalla de «clientes sobre su límite» sería trabajo perdido.

### Cómo se repite esta medición

Cada archivo trae la consulta debajo de cada cifra. La regla que nació hoy: **antes de afirmar que un dato no existe, mirar la tabla del propio objeto, no la de sus hijos** (el error de Marketing fue mirar las entregas en vez de los proyectos).


### Decisiones de Daniel del 5-sep-2026 (tarde)

| decisión | resultado |
|---|---|
| ¿Andrea debe cobrar? | **Sí.** *«si, andrea si cobra»*. Se le agregó el módulo `cxc` a sus permisos: ahora cobra con el módulo puesto, no por el hueco del guardia. |
| ¿Las secretarias ven la cartera de Boston? | **No.** *«no, quita boston a las secretarias»*. `secretaria` salió de `ROLES_BOSTON`; quedan admin y `gerente_boston`. Candado `cxc-boston-permiso.test.ts` cambiado de dirección con nota. |
| ¿Cómo se identifica un proveedor entre empresas? | **Se pospone** hasta que toquemos Proveedores. *«dejalo para cuando toquemos proveedores»*. Hoy se unen por NOMBRE y Confecciones Boston sale en 3 fichas. |
| Las diez palabras del diccionario | **Decididas.** Ver `docs/diccionario.md` § 0. La única donde eligió al revés de mi recomendación: el nombre de la empresa va **corto** («Vistana», «Boston»). |
| Horas extra sin aprobar · gastos de Fashion Wear · las dos personas sin ficha | **Para después.** *«horas extras y gastos para despues»*, *«es tema de contabilidad que aun no lo han hecho»*. |

## 5-sep-2026 (noche) — proyección mensual: DEFINIDO, sin código todavía

Se cerró la definición con Daniel y **queda parqueado hasta que termine el rediseño de Ventas**
(*«3. b»* — va aparte, después). No se escribió una línea de código.

**El disparador.** Daniel preguntó por qué la retrospectiva daba **36% de error en Multifashion**
si es tienda y debería ser la más predecible (*«es el q mas exacto debe dar porque no es mayoreo»*).
No era el negocio, y **tampoco era el sistema**: 🩸 el 36% salió de una réplica a mano de la
fórmula que se dejó afuera el CLAMP de la v7. Corrido con el SQL real parado el 5-sep-2025, la v7
proyecta **$764.549** contra un cierre de **$686.044** = **+11,4%**. Lo que sí es cierto es que su
2024 arranca en junio (la tienda abrió en mayo-2024). Para 2026 el molde es 2025, que está
completo: proyecta **$790.779** (+15%, igual que su ritmo real). El freno que debería haber
atajado eso existe (`c_cobertura_min` = 0.10 en `ventas_proyeccion_cierre_v7`) pero es **demasiado
bajo**: el 2024 de Multifashion sacó 0,55 y pasó. A Joystep, que abrió en julio, sí lo agarra (0,001).

**Lo aprobado** (mockup medido, artifact `13a7bcbb`, las 8 empresas al 5-sep-2026):

| decisión | resultado |
|---|---|
| ¿Dónde va la proyección mensual? | **En la MISMA matriz de 12 meses de Ventas › Resumen.** Los meses que faltan se llenan en gris con la forma del año pasado × el factor de crecimiento, y la columna **«Proyección» pasa a ser la SUMA de la fila** — hoy es un número que aparece de la nada al final. Septiembre va mitad y mitad: el mes proyectado completo arriba, «van $10.569» abajo. |
| ¿Cuáles empresas? | **Las 8.** *«las 8»*. |
| ¿Y las que venden a golpes? | **Se deja el gris igual.** *«1. a»*. Active Wear y Joystep vendieron **$0 en noviembre de 2025**, así que noviembre de 2026 les proyecta 0 — y eso **es la verdad de lo que hicieron**. Su cierre de año sigue siendo bueno (38.864 y 355.805); lo que no sirve es repartirlo mes a mes. |
| ¿Nota de «diciembre pesa mucho»? | **No.** *«no, porque todas las empresas su venta mas fuerte es en x mes»*. La fila lo dice sola: Multifashion 230.831 en diciembre, Fashion Wear más en noviembre que en diciembre. |
| ¿Los tres escenarios (flojo · al ritmo · alto)? | **NO van en pantalla** (*«Los 3 escenarios era solo para verlo. No lo ponga.»*). Se midieron el 5-sep-2026 para que Daniel los viera una vez —sep-dic de Multifashion: flojo $352.002 · al ritmo del año (+15%) $404.127 · al ritmo de los últimos 3 meses (+19%) $417.634, contra los $413.348 que pide su meta de $800.000— y ahí murieron. La tarjeta muestra **un solo número**. |
| ¿El freno del año incompleto? | **Sí, preventivo.** *«no se si habran nuevos»*. Hoy no cambia un solo número: ninguna empresa tiene el molde roto en 2026. Es para el día que abra una tienda nueva. |
| ¿Fashion Wear facturó $326 en enero de 2026? | **Daniel ya lo sabía** (*«2. si»*). No es dato faltante: en Switch hay **8 facturas por $2.989** en todo el mes, el resto son notas de crédito y débito. Es la razón de que sea la única grande que proyecta por debajo del año pasado (4.021.278 contra 4.216.180). |

**Los tres detalles que faltaban** (mockup `df95e1e6`, decididos la misma noche):

| detalle | decisión |
|---|---|
| La celda del mes en curso | **Se queda EXACTAMENTE como hoy** (*«b pero con % real dia a dia»*). Verificado contra producción: **ya es día a día** — `ventas_dashboard_prev_same_period_v4(2026)` devuelve para septiembre la base **$5.343,98** (1–5 sep 2025, `dia_corte_anio_anterior`), no el mes entero, así que Multifashion muestra **10.569 · +98%**. No había nada que arreglar. Solo oct-nov-dic van en gris. 🔴 **Y la celda NO lleva rótulo de «vs 1–5 sep»** (*«no pongas vs 1–5 sep, ensuscia»*): monto y %, nada más — el rango vive en el panel de detalle, no en la celda. ⚠️ Consecuencia aceptada: **la fila no suma la Proyección** (le faltan los 25 días de septiembre que no se muestran); Total y Proyección siguen correctos cada uno por su lado. |
| La columna «Total» | **Sin cambios** (*«si igual»*): Total = lo vendido, Proyección = todo el año. Dos preguntas distintas, dos columnas. |
| El celular | **Los tres meses también se llenan en gris** (*«a»*). ⚠️ Corrección de lo que se le dijo primero: la tarjeta de `ResumenViewMobile` **ya lista los 12 meses en vertical** con su Total y su Proyección al final — no hay que inventar una vista nueva, es el mismo arreglo. |

**Por qué septiembre se ve en −83% y no es un problema** (medido el 5-sep-2026, a raíz de *«porq todo fashion group esta muy abajo en % en sept»*): el grupo va **+2% en el año**. Son tres cosas, ninguna una avería. (1) **Los días 1–4 del mes no dicen nada en mayoreo**: en 2025 fueron de $237 (enero) a $397.546 (diciembre), mediana **$92.124**; en 2026, de $14 a $74.929, mediana **$35.997**. (2) **Septiembre de 2025 arrancó con $260.424 en cuatro días — el segundo mejor arranque de ese año**; septiembre de 2026 arrancó con $21.270, dentro de lo normal. (3) Son **4 días contra 5**: el 5-sep-2026 cae **sábado** y el mayoreo no factura; la última factura de las 6 es del día 4 (Multifashion sí llega a hoy porque es tienda). Fashion Wear lo muestra solo: días 1–4 de 2026 = may 13.919 · jun 41.988 · **jul 361** · ago 17.919 · sep 7.076, y julio cerró en $203.295.

**Pendiente mío** (después de Ventas): llenar oct-nov-dic en gris en la matriz del escritorio y en la
tarjeta del celular + subir el freno del año incompleto. Números medidos y listos en los dos artifacts;
**nada que preguntarle a Daniel**.

---

## 9-sep-2026 — «Qué cambió»: el aviso de novedades dentro de cada módulo

Daniel, textual: *«revisa todo lo que hemos hecho desde que empezó esta conversación, para que a cada
usuario que entre a cada módulo le salga mensajito de que hay nuevo o qué cambió, de manera súper
resumida»*.

🩸 **El porqué.** En cuatro días cambiaron de sitio el botón de descargar de Cuentas por Cobrar, el
nombre entero del módulo «Depurador», el desplegable de dónde salió un pago en Préstamos y dos
destinos de Guías. Angela, andrea, Edwin y David abren la pantalla al día siguiente y la encuentran
distinta, sin que nada se los diga.

### Las siete reglas (`src/lib/novedades/seleccion.ts`, módulo PURO)

1. Se ve **una sola vez por persona y por novedad**. Cerrada, no vuelve; si nunca la cerró, sigue.
2. **No bloquea nada**: una tira gris arriba del contenido con una ×, nunca un modal.
3. **Máximo 3 a la vez**, las más nuevas.
4. **Cada novedad es UNA línea**, sin jerga (hay barrido que prohíbe «endpoint», rutas y nombres de tabla).
5. **Solo la ve quien TIENE ese módulo** — lo decide el SERVIDOR, con los módulos de la cookie firmada.
6. **Caduca sola a los 30 días.**
7. **Nunca sale una novedad de un módulo dentro de otro** — y el `id` empieza con la key del módulo,
   así que cerrar una en Guías no puede apagar otra en Préstamos.

🔴 **Las novedades son DATOS escritos a mano** en `src/lib/novedades/lista.ts` (módulo · fecha · una
línea). No se generan del historial de cambios: un texto para una persona lo escribe una persona.
**Mejor cero que una de relleno** — hoy la traen CINCO de los 22 módulos.

### Las 10 novedades que quedaron (verificadas contra el código, una por una)

| módulo | qué dice |
|---|---|
| **Plantilla Switch** | El módulo ahora se llama «Plantilla Switch». Es el mismo de siempre, con el nombre de lo que hace. |
| **Plantilla Switch** | En «Reglas» ya puedes quitar una descripción que escribiste, sin pedírselo a nadie. |
| **Plantilla Switch** | Si una descripción es casi igual a otra de la misma marca, el sistema te lo avisa antes de que entre. |
| **Cuentas por Cobrar** | «Exportar» ahora dice «Descargar» y ofrece dos cosas: total por cliente o detallado por compañía, en PDF o Excel. |
| **Cuentas por Cobrar** | Al cliente que tiene saldo a favor ya no se le ofrece cobrar: sigue viéndose, pero no se le pide plata que le debemos. |
| **Cuentas por Cobrar** | El estado de cuenta que le mandas al cliente ahora sale con la misma forma que el de Switch. |
| **Comisiones** | La flechita gris al lado de cada número descarga ese reporte sin tener que abrir el detalle. |
| **Guías de Despacho** | La lista de destinos ya dice «Westland» bien escrito; las guías viejas quedan como están. |
| **Guías de Despacho** | «CALLE 19» salió de la lista de destinos: sola no dice a qué tienda va el envío. |
| **Préstamos** | Al registrar un pago ahora eliges de dónde salió la plata; ya no viene contestado «Quincena». |

Los otros 17 módulos **no llevan ninguna**: no tuvieron un cambio que la persona note.

### Dónde se guarda lo leído, y por qué

🔴 **En una tabla (`novedades_vistas`), no solo en el navegador.** «Qué leí yo» ES un dato de la
persona, así que la regla 2 de la casa no lo manda al servidor por sí sola. Lo que lo manda es la otra
mitad del encargo: Daniel quiere **saber cuántas personas la vieron**, y un `localStorage` vive dentro
de UN navegador — no lo puede leer nadie más, ni la misma persona desde el iPad.

⚠️ **`localStorage` se queda como respaldo del mismo dato personal**, por dos razones: (1) mientras la
DDL no corra, cerrar un aviso tiene que funcionar igual; (2) la × tiene que apagar la tira en el acto,
sin esperar a la red. Se leen los dos y se unen.

Migración **`20261024120000_novedades_vistas.sql`** — ⚠️ **escrita, SIN aplicar**. Aditiva (crea una
tabla y no toca una fila de nada), llave `(usuario_id, novedad_id)`, RLS service_role. El código
**falla abierto**: sin ella el aviso sale y se cierra igual. Clasificada como `bitacora` en el
respaldo (cerrar un aviso es un clic, no un dato tecleado).

### Dónde vive cada cosa

- Tira: `src/components/NovedadesAviso.tsx`, montada UNA vez en `AppHeader` (no se tocaron 22 pantallas).
- 🩸 **El aviso ESPERA 800 ms a que la pantalla cargue.** Sin esa espera pedía lo suyo en el mismo
  instante que el módulo y le competía: Guías › Configuración se quedó en «Cargando…» dentro de su
  propia prueba. Primero los datos del módulo, después el aviso. Y si la lista escrita a mano no tiene
  nada vivo para ese módulo, **no se pregunta nada** — en 17 de los 22 no hay ni una lectura de red.
- Pantalla de Daniel: **Usuarios › Novedades** (`?tab=novedades`, solo admin) — la lista completa y
  quiénes la leyeron. No es un módulo nuevo.

### Candados

`src/__tests__/lib/novedades.test.ts` (43) · `src/__tests__/components/novedades-aviso.test.tsx` (14);
**30 mutaciones, 30 cazadas** con 2 controles (`scripts/_mutar-candados-novedades.sh`).

---

## 9-sep-2026 (tarde) — «Salen todas»: las novedades de las DOS SEMANAS anteriores

Daniel, textual: *«lo de novedades tienes que empezar de todo lo aplicable desde que empezó este
chat»* y, al preguntarle si recortaba por antigüedad: ***«Salen todas — que se enteren de todo aunque
sea viejo»***.

El aviso nació esa mañana con **10 novedades** (el 8 y el 9 de septiembre, cinco módulos). Ahora la
lista trae **55 novedades en los 21 módulos**: todo lo que cambió del **25-ago al 9-sep** y que la
persona NOTA al usar la pantalla.

### 🔴 Lo único que se tocó del mecanismo: `desde`

La regla 6 (caduca a los 30 días) contaba desde `fecha`, el día en que el cambio SALIÓ. Con eso, lo
del 25 de agosto habría nacido con **cuatro días de vida**. La novedad gana un campo OPCIONAL,
`desde` — *el día en que empezó a avisarse* — y **los 30 días se cuentan de ahí**. Las 45 nuevas
llevan `desde: "2026-09-09"`; las 10 de la mañana no lo necesitan.

`fecha` no cambió de significado: sigue diciendo **cuándo cambió**, es lo que ordena la tira (lo más
nuevo arriba) y es lo que Daniel ve en Usuarios › Novedades. `estaVigente` ahora exige las dos cosas
—que el cambio ya haya salido **y** que el aviso ya haya empezado y no lleve 30 días—, así que una
novedad no puede avisar antes de existir (hay candado sobre la lista real).

⚠️ **Un módulo con más de tres NO pierde ninguna**: se ven las tres más nuevas, se cierran con la ×, y
a la vuelta salen las siguientes. Lo que sigue prohibido es escribir más de tres del MISMO módulo con
la MISMA fecha — entre esas no hay segunda vuelta que valga. Tope nuevo de higiene: **6 por módulo**
(Guías y Cuentas por Cobrar llegan a 6 y 5).

⚠️ **Colateral medido:** con 20 de los 21 módulos trayendo novedad, el aviso ya pide lo suyo en casi
todas las pantallas (antes eran 5 de 22). Sigue detrás de los 800 ms de espera y de una sola lectura;
cuando estas caduquen, en 30 días, vuelve a callarse solo.

### Lo que se verificó ANTES de escribir cada línea

Cuatro barridos en paralelo contra el código, y las claves dudosas **contra la base de producción**
(lectura de solo lectura, `apikey` de servicio). Se comprobó que **están aplicadas**:
`cheques.aviso_vencido_en` · `cheques.deleted_at` · `recordatorios.hasta` · `recordatorios.destino` ·
`clientes_master.contacto` · `guia_items.bultos_original` · `comision_descuentos_fijos.desde` ·
`caja_gasto_fotos` **y el bucket `caja-recibos`** · `novedades_vistas` · `proveedor_amarre` ·
`switch_estadocuenta_saldo` · `guias_destino_lista` · `calvin_products.foto_manual` ·
`multifashion_vendedora_alias`.

🩸 **La documentación miente en las dos direcciones y por eso se midió.** `docs/estado-actual.md` daba
por pendientes `20260925130000` (Recordatorios) y `20260926120000` (el contacto del cliente), y
`CLAUDE.md` las daba por aplicadas; `CLAUDE.md` da por pendientes `20261010120000` (Proveedores),
`20261013120000` (la foto del recibo de Caja), `20261004120000` (los bultos de Bodega) y
`20261007120000` (las fechas del descuento) — **las cuatro están aplicadas**. Sin medir, o se anunciaba
una pantalla que no abre, o se dejaba de anunciar media docena de cosas que sí se ven.

### Lo que se decidió NO anunciar

- **El freno del año base incompleto de Ventas** (`ventas_proyeccion_cierre_v8`): está vivo, y con las
  coberturas de 2026 **no mueve un solo número**. Nadie lo nota.
- **«Descargar» en Marketing**: la estandarización del verbo se hizo en Comisiones y Catálogos, no ahí
  — el módulo sigue mezclando «Exportar Excel», «Bajar ZIP» y «Descargar ZIP». Sería falso.
- **El ITBMS de Reclamos como cambio de plata**: sobre los 47 reclamos vivos el total da **el mismo
  centavo** con las dos fórmulas. Lo que cambió es el PAPEL, que decía una tasa que no existe. Se
  anunció así.
- **«Compartir manda una imagen en el celular»**: dejó de ser cierto el 9-sep — `formatoParaCompartir`
  devuelve **siempre PDF**. La novedad dice PDF en los dos aparatos.

### Candados

`src/__tests__/lib/novedades.test.ts` (**53**) · `src/__tests__/components/novedades-aviso.test.tsx`
(14); **36 mutaciones, 36 cazadas** con **3 controles**
(`scripts/_mutar-candados-novedades.sh`). Seis mutaciones nuevas para `desde` y para «salen todas»,
entre ellas *«los 30 días vuelven a contarse desde el cambio: lo viejo nace muerto»* y *«un módulo que
cambió se queda sin novedad»*. Dos candados **cambiaron de dirección con nota fechada, ninguno se
borró**: la forma de una novedad ahora admite `desde` (y lo exige `YYYY-MM-DD` y nunca anterior a
`fecha`), y «son las de los CINCO módulos» pasó a «los 21 módulos tienen la suya» — el día que nazca
un módulo, ese candado obliga a decidir si lleva novedad o no lleva ninguna a propósito.

⚠️ **Pendiente de Daniel:** leer las 55 líneas y cambiar las que no suenen a él. Se cambian en
`src/lib/novedades/lista.ts` y nada más; no hay nada que volver a aplicar.

Un candado **cambió de dirección con nota fechada**, ninguno se borró:
`data-health-dentro-de-usuarios` (la condición de la pestaña solo-admin pasó de una comparación
textual a una LISTA, con Data Health adentro como control).

---

## Los cuadritos del aviso «qué cambió» (9-sep-2026)

Daniel, textual: *«pero hazlo con una imagen cada punto de ser necesario para que el usuario lo vea»*
y, al acotarlo, *«las que cambian de botón o algo más que sea necesario para facilidad de usuario»*.
Y cómo: *«yo dibujo un cuadrito simple — la flechita, el botón nuevo — sin captura real»*.

🔴 **La regla que manda sobre todo**: *«acuérdate que solo lo verá una vez cada vez que entra al
módulo por usuario»*. Una sola oportunidad ⇒ **un dibujo que no aclara ESTORBA**.

- 🔴 **CATORCE de las 55, y no una más.** Llevan cuadrito solo las novedades donde la persona **no
  encuentra la cosa sola**: un botón que se movió, cambió de nombre o nació, y un control que
  desapareció y hay que decir a dónde se fue. Las que cambian un **número, una regla o un texto** no
  llevan — ahí no hay nada que buscar en pantalla. El candado congela las catorce una por una y trae
  el **control al revés**: nueve novedades de regla que no pueden ganar dibujo.
- 🔴 **SVG en línea, sin archivos de imagen y sin dependencias.** Siete formas y nada más: una caja
  con su rótulo, una flecha, una tira de pestañas, una lista, una caja punteada, un texto subrayado y
  el ⚙. El catálogo es **dato puro** (`src/lib/novedades/dibujos.ts`) y quien lo pinta es
  `src/components/novedades/DibujoNovedad.tsx` — así el catálogo se prueba sin montar React.
- 🔴 **SE SIENTEN DEL SISTEMA** (Daniel, corrigiendo la primera versión: *«que se sienta como si
  fuese del sistema»*). Dos cosas, y las dos **derivadas**:
  - **El acento es EL COLOR DE SU MÓDULO** (`src/lib/moduleColors.ts`, el mismo filete de 2 px que
    pinta el encabezado): Cuentas por Cobrar azul · Guías esmeralda · Recordatorios ámbar · Clientes
    cian · Préstamos rosa · Caja violeta · Multifashion celeste · Plantilla Switch verde azulado.
    🩸 La primera versión sacaba los catorce del MISMO `teal`, **un color que la paleta de Fashion
    Group no usa en ningún módulo** — se veía pegado encima, no salido de la app. ⚠️ **Comisiones y
    Asistencia no están en ese mapa y caen al GRIS** — no se les inventa un tono; el día que entren,
    el cuadrito se pinta solo. `getModuleColorByKey()` es nuevo y aditivo.
  - **El botón principal se dibuja NEGRO RELLENO con letra blanca** (`bg-black text-white` del
    sistema de diseño), y **solo donde de verdad lo es**: 🩸 antes «Cobrar» se dibujaba con borde, o
    sea igual que un campo de texto — quien buscara el botón negro no lo iba a reconocer. Medido en
    el código: `ClientRow.tsx` pinta **Cobrar** `rounded-md bg-black … text-white`; el botón de la
    barra del CXC (`cxc/page.tsx`) es `bg-black text-white` y su propio comentario dice *«mismo
    botón, mismo lugar, mismo color; cambia el verbo»*, así que **`Exportar` y `Descargar ⌄` van
    los DOS negros** —no se movió, se renombró—; y el **Guardar** que se fue de la ficha del cliente
    era `bg-black text-white` (commit `0b2701d5`), por eso se dibuja negro **y tachado**.
    🩸 **La primera medición fue del botón equivocado**: se miró `MenuDescargar.tsx` (`text-gray-500`),
    que es el `PDF · EXCEL` gris de ADENTRO del menú, no el botón que la persona busca en la barra.
    Hay candado que mira el archivo de la barra. ⚠️ Los tres desplegables (`Empresa ⌄`,
    `Septiembre 2026 ⌄`, `¿De dónde? ⌄`) llevan borde, con candado que lo exige.
- **El redondeo es el de la app**: `rounded-md` son 6 px sobre los ~25 de un botón real ⇒ **4** sobre
  los 16 de la caja del dibujo. Se decidió mirando: con 3 se veía más cuadrado que todo lo demás.
- 🔴 **Ni un `#hex`, y ningún tono escrito.** Todo se pinta con `currentColor` desde clases de la app.
  El barrido exige que en el dibujo **no viva ni una clase de color** que no sea gris, negro o blanco:
  cada tono entra en tiempo de dibujo desde `moduleColors.ts`. El negro del botón lleva su vuelta
  (`dark:text-white` / `dark:fill-black`): un relleno negro clavado es lo que desaparece el día que la
  pantalla cambie de fondo.
- 🔴 **Los anchos se CALCULAN del rótulo** (`anchoDePieza`), nunca se teclean uno por uno. Ninguno
  pasa de **200 px** y hay candado con el número adentro: es un cuadrito, no un banner.
- 🔴 **Sin dibujo, la novedad se ve EXACTAMENTE como antes**: el renglón queda texto pelado, sin
  envoltura. Con dibujo, el renglón envuelve — en el celular el cuadrito cae **debajo** del texto en
  vez de cortarlo, y se achica sin deformarse (`max-w-full` + `preserveAspectRatio`).
- **Accesible**: cada cuadrito lleva `role="img"`, `aria-label` y `<title>` con el mismo texto, que
  dice **la cosa** y no «imagen de…». Ninguno se esconde con `aria-hidden`.
- ⚠️ **Nada se mueve**, así que `prefers-reduced-motion` no tiene qué apagar; hay candado que prohíbe
  `animate-`, `transition` y `@keyframes` en el dibujo.
- ⚠️ **Una llave que el navegador no conoce NO se dibuja** y la novedad se ve como si no tuviera:
  el dato viaja por la red y una llave vieja no puede dejar un cuadro roto.

**Los catorce, y qué dibuja cada uno** (novedad → cuadrito):

| módulo | qué dibuja |
|---|---|
| Comisiones | la celda `$1,234.00` con la **flechita ↓** gris al lado |
| Comisiones | cuatro pestañas tachadas → `Empresa ⌄` + el **⚙** |
| Cuentas por Cobrar | el botón negro `Exportar` tachado → el mismo, ahora `Descargar ⌄` |
| Cuentas por Cobrar | `Menú ···` tachado → el botón **`Cobrar`**, negro relleno |
| Multifashion | el control único `Septiembre 2026 ⌄` |
| Multifashion | seis pestañas, las dos últimas tachadas → cuatro |
| Recordatorios | ocho pestañas tachadas → una sola lista |
| Clientes | el botón negro `Guardar` tachado → el campo `Correo` con su cursor |
| Guías | `N° transp.` al lado de la caja nueva `Bultos 8` |
| Plantilla Switch | `Compañía ⌄` tachado → `Vistana` (la reconoce sola) |
| Plantilla Switch | la fila `Descripción` con su **×** al lado |
| Préstamos | `Quincena` tachado → `¿De dónde? ⌄` |
| Caja Menuda | el cuadro punteado `＋ Foto` |
| Asistencia | `el nombre` subrayado → `su día` |

🩸 **Todo lo que se arregló salió de MIRAR LA PANTALLA, no el código.** Se renderizaron los catorce
a un PNG, dos veces:
- **Primera pasada:** una caja con `···` tachada se lee como una caja **vacía** (pasó a decir
  `Menú ···`), y el ⚙ con un aro fino y rayas largas se lee como un **sol** (aro grueso, dientes
  cortos y un hueco adentro).
- **Segunda pasada, en los DOS temas:** con el color de cada módulo puesto, la tira dejó de parecer
  una lista de dibujitos iguales — se lee de un golpe de qué módulo habla cada renglón. El botón
  negro es lo único que salta a la vista en su línea, que es exactamente lo que hace en la pantalla
  de verdad. Sobre fondo oscuro **no desaparece nada**: el negro se invierte y los acentos de `-500`
  siguen legibles.
- **Tercera pasada, la tira REAL del CXC**: se preguntó si los dos botones negros del módulo
  (`Descargar` y `Cobrar`) iban a competir. **No se cruzan, y está medido**: de las cinco novedades
  vivas de Cuentas por Cobrar, la primera ronda de tres trae `Descargar` (2ª) y la segunda trae
  `Cobrar` (4ª) — **un solo botón negro por tanda**.

### Candados

`src/__tests__/components/novedades-dibujos.test.tsx` (**41**); **40 mutaciones, 40 cazadas** con
**2 controles** (`scripts/_mutar-candados-novedades-dibujos.sh`). Entre ellas *«vuelve el color único
para los catorce»*, *«al módulo sin color se le inventa un tono»*, *«Cobrar vuelve a dibujarse con
borde»*, *«Descargar vuelve al borde»* y *«un desplegable se pinta como el botón negro»*. Un candado **cambió de dirección
con nota fechada, no se borró**: la forma de una novedad ahora admite `dibujo` como quinto campo, y
el CONTROL al revés exige que un campo **inventado** siga cayendo — la lista sigue siendo CERRADA.

⚠️ **Pendiente de Daniel:** (1) mirar los catorce cuadritos y decir cuál no se entiende — se cambian
en `src/lib/novedades/dibujos.ts` (el catálogo) y en `src/lib/novedades/lista.ts` (a quién se le
pone), y no hay nada que aplicar a la base; (2) decidir si **Comisiones y Asistencia** merecen su
color de módulo en `moduleColors.ts` — hoy son los únicos dos de los catorce que salen en gris, y no
por olvido del dibujo sino porque nunca tuvieron acento propio en el encabezado.

---

## 10-sep-2026 — La Planilla Unida llega a producción, APAGADA

Todo el trabajo de **Asistencia · Planilla · Préstamos** que se construyó en la copia
de pruebas está en `main` y desplegado. 🔴 **Con los dos interruptores apagados el
módulo en producción es EXACTAMENTE el de siempre**, y hay candado que lo exige en las
dos direcciones.

### Los DOS interruptores (los dos apagados)

| Interruptor | Archivo:línea | Qué prende |
|---|---|---|
| `NEXT_PUBLIC_PLANILLA_UNIDA` | `src/lib/asistencia/planilla-unida.ts:26` | Comprobante de pago · el cierre que escribe el pago del préstamo (reabrir lo revierte) · corte 13/28 + «Ajuste quincena anterior» · **pestaña Préstamos** y la «una sola puerta» |
| `NEXT_PUBLIC_PERSONA_EN_EL_CENTRO` | `src/lib/asistencia/persona-en-el-centro.ts:43` | 6 pestañas → 4 (5 con Préstamos) · **Colaboradores** primera (era «Personas» hasta el 10-sep-2026 por la tarde) · la página de cada colaborador con Editar · saldo de vacaciones en Colaboradores · justificaciones del período en Reporte |

**Cómo se prenden:** variable en Vercel (`=1`) **+ un despliegue**. Next reemplaza las
`NEXT_PUBLIC_*` como TEXTO al compilar, así que cambiarla en caliente no alcanza.
Se prenden **uno por uno**, cuando Daniel diga.

### Lo que NO cuelga de un interruptor (aditivo por datos, hoy inerte)

Medido contra producción antes de subirlo: la tercera cuenta **«Descuento a terceros»**
(0 movimientos), el daño que **deja de proponer cuota** (0 de 31 empleados tenían cuota
de daño, así que esa casilla no se dibujaba), **códigos ignorados** (tabla vacía),
**ACS como cuarta empresa** (0 personas en `american_classic`) y sus **30 min de extra
automáticos** (las otras tres empresas en 0). Lo único visible hoy sin prender nada es
**una cuarta opción en el desplegable de conceptos de Préstamos**, que no hace nada
hasta que alguien la use.

### Migraciones aplicadas ese día (las 6, verificadas contra la base)

`20261028120000_planilla_unida` · `20261029120000_terceros_tercera_cuenta` ·
`20261030120000_codigos_ignorados` · `20261031120000_acs_cuarta_empresa` ·
`20261101120000_acs_aprueba_daniel` · `20261102120000_cedula_foto_bucket`.

Todas aditivas; los CHECK que se re-crean van **más anchos**. ⚠️ La única sentencia no
aditiva es el `DELETE` de `(Contabilidad, american_classic)` en `20261101120000`:
**medido antes y después, 0 filas** — esa fila no existía, y Contabilidad conserva sus 3.
Se creó el bucket **privado** `asistencia-cedulas` (`public = false`).

### Lo que se resolvió al traerlo

- **Un solo choque con producción**, en la pantalla del reloj: los dos lados arreglaron
  el mismo defecto (dibujaba solo `relojes[0]`). Se conservó **la versión de producción**,
  que es superconjunto (una tarjeta por reloj, pedido y spinner por dispositivo, el
  nombre del reloj solo cuando hay más de uno). El candado que venía de pruebas fijaba
  la GRAFÍA de la otra solución: cambió de dirección con nota fechada y conserva su
  control (`relojes[0]` sigue prohibido).
- **El andamiaje del ambiente de pruebas NO viajó**: sello amarillo, `vercel.json` vacío,
  el bloqueo de `/api/cron/*`, `npm run migrar` apagado, `LEEME-PRUEBAS.md`,
  `scripts/pruebas/` y el título «PRUEBAS». Verificado: **82 crons intactos** y el
  middleware NO bloquea los crons.
- **`.env.local` no se tocó** en ningún commit.

### Pendiente de Daniel

1. **Prender `NEXT_PUBLIC_PLANILLA_UNIDA`** cuando quiera empezar a usar el comprobante,
   el corte 13/28 y la pestaña de Préstamos. ⚠️ Al prenderlo, `/prestamos` deja de estar
   en el menú y redirige a la pestaña.
2. **Prender `NEXT_PUBLIC_PERSONA_EN_EL_CENTRO`** para el acomodo nuevo del módulo.
3. **Cargar las personas de ACS** si quiere que Multifashion entre a la planilla (hoy
   tiene 0) — recién ahí los 30 min automáticos mueven algo.
4. **Dictar el cargo y la cédula** de la gente: sin cargo, el comprobante imprime un guion.

---

## 10-sep-2026 (tarde) — «Colaboradores», no «personas»

Daniel, textual, con `NEXT_PUBLIC_PERSONA_EN_EL_CENTRO` ya prendido en producción:
*«no lo llames personas, sino colaboradores»*.

**Qué cambió (solo NOMBRES; nada de lo que se guarda):**

- La pestaña que abre Asistencia se rotula **«Colaboradores»** y su clave de URL es
  `?tab=colaboradores` (`src/lib/asistencia/persona-en-el-centro.ts`).
- La página de cada quien vive en **`/asistencia/colaboradores/[codigo]`** (carpeta
  `src/app/asistencia/colaboradores/`, movida con `git mv`).
- **Lo viejo sigue llegando:** `?tab=personas` entró a la MUDANZA del módulo puro (junto a
  `configuracion` y `vacaciones`) y `/asistencia/personas/:codigo` redirige **307** con la
  query intacta desde `next.config.js`, como `/cheques` → `/recordatorios`.
- Todo texto visible del módulo (pantalla, Excel, PDF, avisos): columna «Colaborador» en
  Planilla · Reporte · Horarios · Préstamos · Justificaciones · Vacaciones · los dos Excel y
  el PDF; «+ Nuevo colaborador» y «Colaborador nuevo»; «‹ Colaboradores»; «Buscar
  colaborador»; «Elige al colaborador»; «N colaboradores tienen horas extra sin aprobar»;
  «N colaboradores de 38 todavía no salen en la planilla»; «N colaboradores no tienen
  saldo»; «1 colaborador dado de baja siguió marcando»; «TOTAL — N colaboradores»;
  «días-colaborador» (Excel de aprobaciones); «Préstamos sin colaborador»; los mensajes
  «Falta el colaborador» de las rutas API; los avisos de DDL pendiente («todos los
  colaboradores aparecen como activos»…); y la planilla de Boston, que reusa el mismo
  cuadro («N colaboradores»).

**Lo que se dejó a propósito:** identificadores y tablas (`asistencia_personas`,
`persona-en-el-centro.ts`, `PersonaPagina`, `RUTA_PERSONAS`, `PARAM_PERSONA = "persona"`
en la URL de Aprobaciones, `data-testid="chip-persona"`, `seccion.personas` del
acordeón), los comentarios de código, y las frases donde «persona» es «un humano decide»
(«lo decide una persona», en la planilla exportada). También `PrestamosClient.tsx`
(«N personas · $…»), que es el módulo Préstamos y no Asistencia. ⚠️ Detalle visto de paso,
sin tocar: el aviso de saldo de vacaciones dice «Se cargan en Configuración» y con el
interruptor prendido esa pestaña se llama Colaboradores.

**Candados:** nuevo `asistencia-colaboradores-no-personas.test.ts` (rótulo · `?tab=personas`
→ colaboradores · la carpeta vieja no existe y el redirect está · barrido de «Personas» y
`"Persona"` en `src/app/asistencia` + `src/lib/asistencia` · los avisos). **13 candados
cambiaron de texto con nota fechada, ninguno se borró**: `persona-en-el-centro` ·
`asistencia-pestanas` · `asistencia-poda-textos` · `asistencia-vacaciones-saldo` ·
`boston-planilla-con-dinero` · `planilla-aviso-lleva-a-aprobaciones` · `aprobaciones-excel` ·
`asistencia-aprobador-empresa` · `asistencia-saldo-vacaciones` · `asistencia-vigencia` ·
`planilla-aviso-extras-sin-aprobar` · `planilla-unida-cierre-prestamo` · `prestamos-una-puerta`.

---

## 10-sep-2026 (tarde) — Dos chips: «Falta para pagar» y «Falta completar»

Daniel, textual: *«veo falta configurar 4 y sin saldo bastantes, todos deben de estar en sin
configurar no?»* → sí. Y al definirlo mejor: **dos chips, separados por si el dato que falta
hace que la quincena salga mal**.

| | Qué cuenta | Dónde vive la regla |
|---|---|---|
| **Falta para pagar (N)** | sin ficha · sin empresa · sin salario (salvo servicio profesional) · sin horario (salvo quien cobra fijo y no marca) | `src/lib/asistencia/que-le-falta.ts` → `queLeFalta().paraPagar` |
| **Falta completar (N)** | sin cargo · sin cédula · sin saldo de vacaciones (saldo **y** fecha de corte) · sin fecha de ingreso | `queLeFalta().completar` |

- Solo ACTIVOS; uno puede estar en los dos; el chip en cero no se dibuja. Reemplazan a «Falta
  configurar» y a «Sin saldo» (los dos retirados de la pantalla).
- La fila lo dice en texto corto debajo del nombre, lo de pagar primero: «Falta horario, cargo y
  cédula». Se retiró el chip ámbar «Falta» de la columna Estado (la fila ya lo dice).
- La cabecera de la sección dice el MISMO número del chip de pagar («N faltan para pagar»).
- El servidor (`/api/asistencia/configuracion`) manda `tieneHorario` leyendo `asistencia_horarios`;
  **falla abierto**: sin lectura, `null`, y a nadie se le acusa de no tener horario.
- ⚠️ Decisión mínima, anotada: un código sin ficha cuenta solo en «para pagar» y dice «Falta ficha»
  — sin ficha no hay cargo ni cédula que revisar todavía.
- **Nada de lo que se guarda cambia.**

**Medido contra producción (solo lectura, `scripts/_medir-falta-configurar.ts`):** 47 activos
(41 fichas + 10 códigos del reloj sin ficha, 0 ignorados). **ANTES:** «Falta configurar (10)» ·
«Sin saldo (45)». **DESPUÉS:** «Falta para pagar (11)» · «Falta completar (37)», 1 en los dos
(Enrique Sanchez, código 56: sin horario). Por faltante: cargo 37 · cédula 37 · saldo 35 · ficha 10
· horario 1. Los 10 sin ficha: 2 · 3 · 39 · 55 · 9999 y **301–305** (los de Multifashion).

**Candados:** nuevo `asistencia-falta-configurar.test.ts` (regla pura, texto de la fila, la pantalla
usa el módulo, los chips viejos no vuelven, el servidor falla abierto). Dos cambiaron de texto con
nota fechada, ninguno se borró: `persona-en-el-centro` («Sin saldo» → «Falta completar», con el
control de que el nombre viejo no vuelve) y `asistencia-poda-textos` (el chip que se toca es «Falta
completar»; «Falta para pagar» en cero no se dibuja).

---

## 10-sep-2026 (tarde) — Las 7 pantallas de Asistencia, revisadas por Daniel

Ocho arreglos aprobados uno por uno, más una carga (el punto 9, abajo).

| # | Qué | Dónde |
|---|---|---|
| 1 | Los totales del Reporte con dos decimales (eran `9544.499999999998`). **Verificado:** ningún total de pago se armaba con flotantes sin redondear — `totalizar` suma a centavos en cada paso, `totalesDe` redondea, Excel/PDF/comprobante leen `d.totales`. | `ReporteTab.tsx` |
| 2 | Nombres capitalizados en el Reporte, como en la lista. Solo cómo se muestra. | `ReporteTab.tsx` |
| 3 | «Justificaciones del período» no se dibuja sin justificaciones (el enlace vive en el componente; `null` vacío o cargando). | `JustificacionesDelPeriodo.tsx` |
| 4 | Código sin ficha: «—» en Jornada (48 es relleno). | `ConfiguracionTab.tsx` |
| 5 | Avisos del reloj en UNA línea por reloj; el párrafo pasó a un «?»; el error sigue a la vista; el botón se queda. *«debe de ser más chico, que no estorbe tanto»*. | `EstadoReloj.tsx` |
| 6 | «QUÉ CAMBIÓ» se marca visto **al mostrarse** (localStorage + `novedades_vistas`, mismo mecanismo); la × sigue apagándolo. *«se muestra una vez y se va solo al cerrarlo; si no lo cierran, no se vuelve a mostrar»*. Vale para todos los usuarios y módulos. | `NovedadesAviso.tsx` |
| 7 | Asistencia › Préstamos: «Descuento a terceros» solo cuando alguien lo tiene (columna y tarjeta). | `PrestamosTab.tsx` |
| 8 | **Almuerzo por empresa**: 30 en las tres de siempre, **60 en Multifashion** (`ALMUERZO_POR_EMPRESA`, `almuerzoDeEmpresa`, `textoAlmuerzo`). El PUT de Horarios escribe el de la empresa de la ficha y conserva la entrada guardada. **Medido antes y después, quincena 1–15 sep, 45 colaboradores: 0 diferencias** (`scripts/_medir-almuerzo-por-empresa.ts`). | `config.ts` · `api/asistencia/horarios` |

⚠️ Decidido al mínimo y anotado: el motor sigue leyendo `asistencia_horarios.almuerzo_minutos` por
persona (donde el PUT lo deja escrito); quien no tiene fila cae a 30, como siempre. La columna
«Terceros» de la PLANILLA (los cinco montos a mano) no se tocó: es otra pantalla. En Préstamos, la
cuota que se muestra sigue siendo préstamo + daño.

**Candados:** `asistencia-siete-pantallas.test.ts` (1-5, 7, 8) · `novedades-una-vez.test.tsx` (6).
Tres cambiaron con nota fechada, ninguno se borró: `persona-en-el-centro` (el enlace de
justificaciones vive en el componente), `asistencia-poda-textos` (la frase del almuerzo),
`asistencia-almuerzo-fijo` (sus casos siguen valiendo: sin ficha se escribe 30).

**Punto 9 — las 5 fichas de Multifashion, cargadas en producción (10-sep-2026).** Daniel,
textual: *«a los de multifashion que te mandé la foto configúralos»* — la única escritura en
producción, aprobada por él. `scripts/_cargar-acs-fichas.mjs` (idempotente; `--escribir` para
escribir) creó **5 fichas** (`asistencia_personas`: 301 Jenifer Miranda · 302 Milagros Torres ·
303 Jailine Quispe · 304 Sheynee Batista · 305 Angel Pizza, empresa `american_classic`, salario
NULL: lo llena la contable) y **5 horarios** (`asistencia_horarios`: 10:00 → 19:00, almuerzo 60).
Nadie más se tocó (el 1000 tampoco). Verificado con la regla de la lista
(`_medir-falta-configurar.ts`): los 5 salen con Multifashion y en «Falta para pagar» **solo por el
salario** (y en «Falta completar» por cargo, cédula, saldo y fecha de ingreso). Los chips quedan
en **Falta para pagar (11) · Falta completar (42)**.

---

## 10-sep-2026 (tarde) — Lista de colaboradores y Planilla, con el mockup aprobado (puntos 7–10)

Daniel aprobó el mockup «Colaboradores y Planilla, ahora vs después». Todo es PANTALLA: ni lo que
se guarda ni lo que se calcula cambia.

**Lista de colaboradores (`ConfiguracionTab.tsx`, la misma tabla):**

| # | Antes | Después |
|---|---|---|
| 7 | «Falta el saldo» / «Faltan la fecha de ingreso y el saldo» en ROJO en la columna Vacaciones | `—` gris sin saldo cargado; «N días» con saldo. *«un rojo que sale siempre no avisa nada»* |
| 8 | Columna «Rata / hora» | Se fue de la lista. Vive en la página del colaborador («Rata por hora», junto al salario). El cálculo no se tocó |
| 9 | Columna «Estado» (Listo / Falta) + el texto «Falta cargo y cédula» bajo el nombre (segundo encargo) | Columna **«Qué falta»**: «Para pagar: empresa, salario, horario» en rojo · «Completar: cargo, cédula» en gris · vacía si no falta nada (`lineasQueFalta`, `que-le-falta.ts`). Sin ficha dice lo que le falta para cobrar, no «ficha» |

**Planilla (`PlanillaTab.tsx`, punto 10):** dos botones «1 – 15 sep» / «16 – 30 sep» (mes en curso
de Panamá, último día real del mes) + «Otro rango ⌄» (el calendario de siempre, `RangoFechas` con
`textoVacio`). «Cortar el reloj el» se ve desde el inicio, con el corte propuesto (13 o 28) y la frase
«Del 14 al 15 se paga normal y se ajusta en la siguiente.»; vacío = quincena entera. «Generar» negro.
Excel / PDF / Comprobantes solo con la planilla generada. Módulo puro `lib/asistencia/elegir-quincena.ts`.
🔴 **Mismo pedido**: candado que compara la URL del botón contra la del calendario para el mismo rango
(`/api/asistencia/planilla?desde=2026-09-01&hasta=2026-09-15&empresa=…&corte=2026-09-13`).

**Candados:** `asistencia-lista-que-falta.test.tsx` · `planilla-elegir-quincena.test.tsx`. Cambiaron con
nota fechada, ninguno se borró: `persona-en-el-centro` (rejilla y el dato «rata»),
`asistencia-falta-configurar` (columna en vez de texto bajo el nombre; sin ficha → empresa, salario,
horario), `asistencia-planilla-cerrar-quincena` (el calendario ya no va en línea),
`asistencia-planilla-solo-rango` (lo elegido se ve en el botón prendido).

⚠️ Dejado a propósito: la columna «Terceros» de los montos a mano de la Planilla no se tocó (es otra
cosa que Préstamos); en el celular la tarjeta muestra las mismas dos líneas de «Qué falta» bajo el
nombre.

---

## 10-sep-2026 (noche) — Lo que definió el backtest contra los Excel de la contable

Informe: `~/.claude/jobs/a93eb587/tmp/backtest/informe.md` (§ 3 y § 5). Daniel, textual: *«a, sí.
b, se descuenta obvio. c, se paga días trabajados. kener 40h, reloj»* · *«ISR a mano por ahora, quién
aprueba horas extra de cada empresa: daniel y contabilidad en todas las empresas incluyendo boston,
david solo boston»* · corrigiendo: *«bodega también aprueba fashion wear y vistana. domingo también
necesita aprobación»* · *«si salió 20 minutos antes no debería de haber tolerancia»* · sobre los
centavos: **«a) el sistema manda y ella se adapta»**.

| # | Regla | Qué cambió |
|---|---|---|
| 1 | Domingo/feriado trabajado | 🩸 No se podía aprobar (Aprobaciones solo ofrecía L–V): se perdía en silencio. Ahora se OFRECE con su tipo, el aviso ámbar y el freno del cierre lo cuentan, y **sigue necesitando aprobación** (aprobado → `recargo_domingo_feriado`; no aprobado → no se paga, se ve) |
| 2 | Salida antes de la hora | Se descuenta **desde el minuto uno** (sin tolerancia; los 10 min son solo de la entrada): `salidaTemprana` en Planilla, Excel, PDF, comprobante y cierre (`salida_temprana`, migración `20261104120000` aplicada) |
| 3 | Entra o sale a mitad de quincena | Cobra los **días trabajados**: quincenal ÷ hábiles L–V de la quincena × hábiles trabajados (`prorrateo-ingreso.ts`), dicho al lado del nombre y congelado. Reemplaza al «Tú decides» del 25-ago. Yeritza (51): **$125,00** (5 de 12) vs $115,38 de la contable (600 ÷ 26 × 5) |
| 4 | Horas extra exactas | Verificado: `extraMin = brutoSeg / 60`, sin cuartos. Nada cambió |
| 5 | Aprobadores | Migración `20261103120000` (aplicada, solo INSERT): daniel ×4, Contabilidad ×4 (entró Multifashion), david Boston, **Bodega sigue** en Fashion Wear y Vistana. Verificado leyendo la tabla: 11 filas |
| 6 | Kener (17) | Jornada 48 → **40 h** (`_ajustar-kener-jornada.mjs`, aprobado). Rata $2,88 → $3,46 |
| 7 | ISR | Sigue a mano. Y los centavos: el sistema manda (rata × 8, 2 decimales); no se copia el ÷ 26 ni los 4 decimales de la contable |

**Medido contra producción, quincena 16–30 ago 2026 (40 colaboradores, solo lectura):** cambian de
neto **6**: por salida temprana 5 (**−$68,08**: Andrea 16 −11,93 · Eloyn 29 −21,51 · María B. 49 −14,18 ·
Yeishka 54 −5,69 · Angela 7 −14,77) y Kener +0,52 por la jornada. Domingo/feriado pagados: 0 (los 7 del
domingo 23-ago quedan en Aprobaciones, pendientes de que alguien los apruebe). Prorrateo: nadie en esa
quincena (Yeritza entró el 27-jul: en la 16–31 jul cobra $125,00).

**Candados:** `asistencia-reglas-de-la-contable.test.ts`. Cambiaron con nota fechada, ninguno se borró:
`asistencia-planilla-guardada` (25 cifras de dinero / 22 del reloj; la migración nueva entra al barrido),
`asistencia-planilla-rango` (la columna nueva), `asistencia-dias-que-no-pasaron` (Yeishka cobra 5 de 10
hábiles, $150, y sigue sin cobrar $300).

---

## 10-sep-2026 (noche, 2) — El día vale sueldo ÷ 26, y ningún aviso manda a «Configuración»

1. **Prorrateo**: Daniel eligió **«a»** — cada día hábil (L–V) trabajado desde el ingreso (o hasta la
   salida) vale **sueldo mensual ÷ 26**, la costumbre de Panamá y lo que la contable ya paga
   (`DIAS_PAGADOS_POR_MES = 26`, factor `días ÷ 13` sobre el quincenal). Caso de control: Yeritza
   (51), entró el 27-jul-2026, 5 días → **$115,38** con $600 (antes, con los hábiles de la quincena,
   $125,00). Yeishka (10-ago, 5 días) también queda en $115,38. `asistencia-reglas-de-la-contable` y
   `asistencia-dias-que-no-pasaron` cambiaron de dirección con nota fechada.
2. **Avisos**: la pestaña de las fichas se nombra desde el módulo puro (`PESTANA_FICHAS` =
   «Colaboradores» con el interruptor prendido) en Planilla, Reporte, Justificaciones, Vacaciones,
   «Cómo funciona», el glosario del Excel/PDF y `FALTA.ficha`; el aviso del saldo de vacaciones dice
   «Se cargan en la ficha de cada colaborador». Candado con barrido:
   `asistencia-pestana-fichas-y-26.test.ts` (ningún texto visible de `src/app/asistencia` ni
   `src/lib/asistencia` escribe «Configuración» ni «Personas» a mano).

---

## 10-sep-2026 (noche, 3) — «Asistencia» en vez de «Reporte», y un selector de empresa para todo

Daniel, textual: *«Reporte pasa a llamarse Asistencia. Tu orden»* · *«que reporte se pueda filtrar
también por empresa y sacar un excel filtrado para revisar tardanzas, ausencia, etc. Aprobaciones
también se debería de poder ver por empresa, todo por empresa no?»*.

- **Pestañas:** Colaboradores · Asistencia · Aprobaciones · Planilla · Préstamos (el orden del
  trabajo). `?tab=reporte` sigue llegando (MUDANZA → asistencia); aterriza en Colaboradores.
- **Un selector de empresa** arriba de las pestañas (`lib/asistencia/empresa-para-todo.ts`): «Todas»
  + las 4 con nombre corto; en la URL (`?empresa=`) y recordado por usuario; las opciones salen del
  rol (David solo Boston, sin «Todas»). Filtra Asistencia (servidor: tabla, totales, «A revisar»,
  justificaciones del período), Aprobaciones (días, contadores, «Aprobar todo» y el aviso),
  Colaboradores (se fueron los chips de empresa) y Préstamos (lista y total). Planilla lo reusa: con
  «Todas» pide elegir una. Excel/PDF filtrados y con la empresa en el nombre
  (`Asistencia-Boston-2026-09-01_2026-09-15.xlsx`).
- 🔴 Lectura pura: nada de lo que se guarda cambia. `POST /api/asistencia/aprobaciones?empresa=`
  rechaza (400, todo o nada) cualquier código de otra empresa.

**Medido contra producción (1–15 sep 2026, `scripts/_medir-asistencia-por-empresa.ts`):** «Todas» =
**45 filas, las mismas que hoy**; Boston **20** (todas de Boston) · Vistana 8 · Fashion Wear 7 ·
Multifashion 5 · sin ficha 5 = 45, cuadra.

**Candados:** `asistencia-empresa-para-todo.test.ts` (orden y nombre, opciones por rol, filtro de
lectura, nombre del archivo, la ruta que rechaza otra empresa, y que cada pestaña cuelga del mismo
selector). Cambiaron con nota fechada, ninguno se borró: `persona-en-el-centro`,
`asistencia-colaboradores-no-personas`, `asistencia-siete-pantallas`, `asistencia-planilla`,
`asistencia-config`, `asistencia-planilla-cerrar-quincena`, `aprobaciones-excel`, `peso-muerto-js`.

---

## 10-sep-2026 (noche, 4) — Aprobar no espera

Daniel: *«¿por qué al seleccionar un colaborador en aprobaciones se pone como un segundo cada vez que
aprieto? no debería ser así»*. Causa: cada toque hacía el POST y después recargaba el período entero
apagando toda la pantalla (~1 s por toque). Arreglo (`AprobacionesTab.tsx`, optimista): la casilla
y los contadores cambian en el acto desde lo local; el POST va detrás; solo la casilla que viaja se
apaga (dos toques = dos POST); una sola recarga, silenciosa, 1,5 s después del último toque — y el
servidor manda. Si el POST falla, la casilla vuelve a como estaba y sale el aviso. Nada cambia en la
ruta ni en lo que se guarda. Candado: `aprobaciones-optimista.test.tsx` (toque sin esperar el fetch ·
fallo revierte · N toques → una recarga · el servidor reemplaza lo local).

---

## 10-sep-2026 — Packing Lists se retiró

Daniel, textual: ***«packing list no se usa, eliminar»***.

**Medido contra producción ese día, antes de tocar nada:** `packing_lists` **0 filas** y `pl_items`
**0 filas** —vacías desde el 14-may-2026, cuando el cron viejo borró de verdad las 28 que había, sin
copia—; **34 rastros** en `activity_logs` en toda la historia del módulo (7 cargas + 3 borrados,
todos con rol `admin`, entre el 18 y el 22-abr-2026, más 24 latidos del cron); **0 cargas de bodega
y 0 de secretaria**, que eran quienes lo tenían en el menú. Ningún bucket de Storage era suyo.

**Se fue:** la ficha (`modules.ts`) y su color teal, la pantalla `/packing-lists` (1.325 líneas el
cliente), las 3 rutas API —incluida `fallback-bulto`, la que llamaba a Claude Haiku—, el lector de
PDF (`parse-packing-list.ts`, 850 líneas), el cron **`cleanup-packing-lists`** con su colateral en la
reconciliación (**82 → 81 crons**), la novedad del módulo, 3 tests, 8 scripts y el fixture del PDF.

**Se queda:** las TABLAS `packing_lists` y `pl_items` (patrón `mayor_lineas`), los 34 rastros de
`activity_logs`, la RPC `save_packing_list` inerte, y `/packing-lists` + `/packing-lists/<id>`
redirigiendo a `/home` con **307**. Las dos tablas pasaron de clase `personas` a **`retirada`** en el
respaldo — se puede porque no hay una sola fila que proteger.

**Migración `20261110120000`** (aplicada): `array_remove` de la key en `role_permissions` (admin ·
secretaria · bodega) y en los dos `modulos_override` (Angela y andrea), más el `DELETE` de la fila
huérfana de `cron_heartbeats` — el mismo camino que `sync-mayor`.

**De paso quedó corregida una línea vieja de CLAUDE.md**: decía que bodega hace «auto-redirect a
Guías desde home (único módulo)» y hace tiempo que no: tenía 5 módulos y ahora tiene **4** (guías ·
catálogos · referencia · asistencia).

**Candado:** `packing-lists-retirado.test.ts` (24 casos, 3 controles al revés). Cambiaron de
dirección con nota fechada, ninguno se borró: `boston-acceso` · `multifashion-acceso` ·
`campos-obligatorios` · `catalogo-roles` · `data-health-dentro-de-usuarios` · `cron-registro` ·
`poda-textos-ayuda` · `poda-textos-cxc-multifashion` · `novedades-dibujos` · `novedades` ·
`cleanup-sessions`. El porqué completo, con la medición, en
[historico/superado.md](historico/superado.md).

---

## 10-sep-2026 (noche, 5) — Aprobaciones: una sola lista de decisiones (Sí · No), por colaborador o por día

Daniel, textual: *«Aprobaciones es una sola lista de decisiones. Cada renglón es una persona en la
quincena, con sus horas extra sumadas. Dos botones: Sí y No. Se decide, y el renglón se va»* ·
*«Cobra horas extra por default a todos sí»* · *«y si quiero poder ver por día y por persona? con un
tab arriba que diga colaborador / día»*. Mockup aprobado.

| | Antes | Después |
|---|---|---|
| Estados | aprobado true/false — **false era pendiente**; «no se paga» no existía | **Sí · No · Pendiente** (`decision`); un No deja de ser pendiente: sin aviso ámbar, sin freno del cierre. `aprobado` se sigue escribiendo derivado: **el motor paga igual** |
| Pantalla | días con casillas (y una fila por semana) | **Colaborador** (abre): un renglón por persona, «N días · H:MM h», **Sí · No**, ⌄ con sus días. **Día**: lo mismo agrupado por día. Control `Colaborador · Día` (`?vista=`, recordado). «N por decidir · H:MM h» arriba; **«Ya decididas (N) ▸»** plegado abajo con «cambiar» |
| Botón de arriba | «Aprobar todo» | **«Sí a todo lo pendiente»** (mismo comportamiento). Sin «No a todo» |
| Ficha | — | **«¿Cobra horas extra?»** en Sí para todos (`cobra_horas_extra DEFAULT true`). En No: no sale en Aprobaciones ni en el aviso, cero recargo; tardanzas, ausencias y salida temprana siguen; sigue en planilla |
| Excel | 11 columnas | + **«Decisión»** (Sí / No / Pendiente) |

- Migración `20261105120000_aprobaciones_decision_y_cobra_horas_extra.sql` **aplicada** y verificada:
  555 filas, 391 `aprobado = true` → 391 `decision = 'si'`, 0 `'no'`, 164 pendientes; 46 fichas, 0 con
  `cobra_horas_extra = false`.
- Módulos puros nuevos: `lib/asistencia/aprobaciones-vistas.ts` (los dos agrupamientos, una fuente) y
  `lib/asistencia/cobra-horas-extra.ts`. La pestaña se partió en `app/asistencia/aprobaciones/`
  (`BotonesSiNo` · `PorColaborador` · `PorDia` · `YaDecididas`); `AprobacionesTab.tsx` quedó en ~330 líneas.
- Ruta `POST /api/asistencia/aprobaciones` acepta `decision: 'si' | 'no' | null` (y el `aprobado`
  viejo: true = si, false = pendiente); cualquier otra cosa, 400.

**Medido contra producción (solo lectura, `scripts/_medir-almuerzo-por-empresa.ts`, quincena 1–15 sep
2026):** 45 colaboradores, 33 con neto (Vistana 7 · Fashion Wear 7 · Boston 19; los 5 de Multifashion
sin salario todavía), neto total **$8.853,42 antes = $8.853,42 después, 0 diferencias** por colaborador.

**Candados:** `aprobaciones-por-persona.test.ts` (27: la decisión en el motor real, la casilla, las dos
vistas, la migración, el servidor, barrido de la pantalla) · `aprobaciones-por-persona.test.tsx` (11:
control de vistas, domingo marcado, «Sí y No», la ficha); **19 mutaciones, 19 cazadas con 2 controles**
(`scripts/_mutar-candados-aprobaciones-por-persona.sh`). Cambiaron de dirección con nota fechada,
ninguno se borró: `asistencia-aprobaciones-pantalla`, `aprobaciones-optimista`,
`planilla-aviso-lleva-a-aprobaciones`, `aprobaciones-excel`.

⚠️ Dejado a propósito: un «No» sigue pagando los 30 min automáticos de Multifashion (son los minutos
que no pasan por aprobación); el Reporte de asistencia muestra los minutos medidos de quien no cobra
extra (es asistencia, no pago; el «—» sigue siendo solo del servicio profesional); «N por decidir»
cuenta colaboradores en las dos vistas; la fila por semana no volvió.

---

## 11-sep-2026 — Corregir una hora en Asistencia: selector, el porqué con botones, «Justificar» en la fila

Daniel, textual: *«no me gusta texto libre para escribir la hora, enreda. algo que se sienta más
seguro y que el formato vaya con el módulo»* · *«el porqué se corrige debe de ser obligatorio y campo
libre con opciones rápidas de las más usadas (autocrear a medida de tiempo poniendo las más usadas y
eliminando si una no se usa, empezar vacíos)»* · *«máximo 4»*. Mockup aprobado (caso real: Yulissa
Juárez, lun 31 ago, el reloj marcó 13:22:02).

| | Antes | Después |
|---|---|---|
| La hora | texto libre («Como 8:00 o 17:04…»), precargada `13:22` | **selector del sistema** (`type="time" step="1"`, ruedita en iPhone, flechas en PC), precargada `13:22:02`; segundos opcionales: sin tocarlos se conservan los del reloj, hora nueva → `:00` |
| Arriba | título + «Yulissa Juarez · 31 ago 2026» + recuadro «Lo que marcó el reloj / Esto no se borra nunca…» | **una línea**: «Yulissa Juárez · lun 31 ago · el reloj marcó 13:22:02»; el «no se borra nunca / cuenta para el pago» vive UNA vez en el «?» de la pestaña |
| El porqué | textarea obligatorio | textarea obligatorio **+ hasta 4 botones** con los motivos más escritos en 90 días (2+ usos, grafía más reciente, sin acentos ni mayúsculas para agrupar); tocar uno escribe en el campo. **Empiezan vacíos y se van solos** |
| Botones | «Cerrar» · «Guardar corrección» / «Agregar marcación» | «Cerrar» · «Guardar» |
| Fila del día | «Revisar» · «Agregar hora» | «Revisar» · «Agregar hora» · **«Justificar»** → el MISMO formulario de la ficha con el colaborador y ESE día puestos; al guardar se refresca la pestaña. Sin menú «···» |
| Aviso ámbar | «…revísalo en **Horarios**» (pestaña que ya no existe) | «…se confirma en la ficha de cada colaborador, en **Colaboradores**» (Asistencia, Planilla y «Cómo funciona», desde `dondeSeCargaLaFicha()`) |

- Módulo puro nuevo `lib/asistencia/motivos-frecuentes.ts` (clave, ventana de 90 días, 4 máximo,
  2+ usos); `completarSegundos` y `encabezadoCorreccion` en `lib/asistencia/correcciones.ts`.
  Ruta nueva **`GET /api/asistencia/correcciones/motivos`**, solo lectura, **sin tabla nueva**.
- El formulario de justificar salió de `SeccionJustificaciones` a **`JustificarForm.tsx`** (lo montan
  la ficha con hoy y `JustificarDiaModal` con el día de la fila); misma ruta, mismo cuerpo.
- 🔴 Nada de lo que se guarda cambió: `asistencia_marcaciones` sigue sin tocarse; la corrección sigue
  yendo a `asistencia_correcciones` con motivo y firma.

**Medido contra producción (solo lectura):** 8 correcciones en la base (6 vivas), todas de los últimos
90 días → con la regla salen **3 botones** («No marco salida» 2× · «Boda de Daniel» 2× ·
«ENFERMEDAD» 2×); quedan fuera «Mensajería de Daniel» (1×) y «No marco la salida» (1×, otra clave a
propósito: nada por parecido). Quincena 1–15 sep 2026 (`scripts/_medir-almuerzo-por-empresa.ts`):
45 colaboradores, 33 con neto, **$8.793,42 antes = $8.793,42 después, 0 diferencias**; las 8
correcciones siguen siendo 8.

**Candados:** `asistencia-corregir-hora.test.ts` (30) · `asistencia-corregir-hora.test.tsx` (10);
**31 mutaciones, 31 cazadas, 2 controles en verde** (`scripts/_mutar-candados-asistencia-corregir-hora.sh`).
Cambiaron de dirección con nota fechada, ninguno se borró: `poda-textos-explicaciones` («Por qué»),
`persona-en-el-centro` y `asistencia-siete-pantallas` (el POST vive en `JustificarForm`;
`JustificacionesDelPeriodo` recibe `refresco`).

⚠️ Dejado a propósito: los motivos frecuentes cuentan también las correcciones **anuladas** (un
motivo escrito es un motivo usado); «Justificar» no se dibuja en feriados, vacaciones ni días ya
justificados; el permiso de HORAS (desde/hasta hora) sigue solo en la pestaña vieja de
Justificaciones, no en este formulario mínimo; en el iPhone el selector no ofrece segundos y por eso
se conservan los del reloj. ⚠️ Al momento de subir, `guias-entrega-directa` y `guias-sin-rechazo`
fallaban **en HEAD puro** (13 casos, ajenos a este trabajo): lo tiene que mirar quien tocó Guías.



---

## 11-sep-2026 — Reclamos: el rediseño (portada, empresa, reclamo, nuevo reclamo) y el bucket de fotos cerrado

Aprobado por Daniel el 10/11-sep con tres mockups (portada+empresa+nuevo, «Reclamar un renglón de cien», «La pantalla del reclamo»). El bloque **Reclamos — el rediseño** de `CLAUDE.md` trae cada decisión con su cita. Aquí, lo que quedó y lo que falta.

### Lo medido (antes y después, idéntico)
- 29 por cobrar · **$14.939,64**; 20 reclamados **$5.347,61** · 9 sin reclamar **$9.592,03**; 5 pagados $5.306,62.
- Migración `20261111120000_reclamos_rediseno.sql` **aplicada**: `reclamado_en` rellenó 20 de 20 desde las notas de correo del sistema; `fecha_factura` nació vacía; las dos facturas pegadas (REC-2026-0019 y REC-2026-0020) corregidas por id; bucket `reclamo-fotos` → **privado** (la URL pública vieja contesta 400; una firmada, 200).
- Los PDF del bucket: 26 archivos = **8 distintos** (el mismo subido hasta 13 veces). 7 de 9 (con la factura de referencia de Daniel) sin talla por renglón (aswgr); 2 de 9 con talla desglosada (Latin Fitness). 4 de los de aswgr son imagen escaneada.

### Pendiente de Daniel
1. 🔴 **Rotar `ANTHROPIC_API_KEY`**: la llave de `.env.local` y la de Vercel son la misma y el API la rechaza («API key is invalid»). Sin ella el lector de facturas no lee (Reclamos y Marketing, en producción, desde antes de hoy). Al rotarla, correr el backfill: `ANTHROPIC_API_KEY=<nueva> npx tsx scripts/_backfill-reclamos-fecha-factura.mjs` → llena `fecha_factura` en los **4** reclamos vivos con PDF; los **30** sin PDF los teclea Andrea (la lista los muestra al final con «Falta la fecha de la factura» y Editar la pide).
2. Los links públicos de fotos/comprobantes ya se cerraron (decisión del 11-sep). Lo que sigue abierto es la **galería del proveedor** con token HMAC en el link del Excel (la página firma las fotos al cargar) — es lo que hace que el correo no se rompa.
3. En la página de la empresa quedaron **Correo · Descargar Excel · Descargar PDF** arriba (actúan sobre la selección o sobre lo que se está mirando). Los ↓Excel/↓PDF de la tarjeta de la portada se fueron con el mockup; si Daniel los quiere de vuelta en la tarjeta, es un cambio de pantalla, no de datos.
4. Género quedó como columna en la lista de renglones del PDF porque el formulario lo exige desde siempre (Daniel: «no lo toques»). Si quiere que deje de ser obligatorio, es otra decisión.

### Candados
`reclamos-rediseno.test.ts` (puro + barridos) · `reclamos-rediseno.test.tsx` (las cuatro pantallas montadas); **34 mutaciones, 34 cazadas, 2 controles** (`scripts/_mutar-candados-reclamos-rediseno.sh`). Seis candados viejos cambiaron de dirección con nota fechada (ver CLAUDE.md).

⚠️ Al correr la suite completa fallaban además `guias-entrega-directa` y `guias-sin-rechazo` (13 casos) — **fallan igual en HEAD limpio**, no son de este cambio; y en el árbol había trabajo de Asistencia sin commitear de otra sesión (con errores de `tsc`), que no se tocó ni se commiteó.

---

## 11-sep-2026 — Telegram avisa cuando el lector de facturas deja de leer

Cierra el pendiente #1 de arriba por el otro lado: la llave **ya se rotó**, pero nada impedía que
volviera a pasar. La `ANTHROPIC_API_KEY` de producción estuvo inválida **un tiempo que no se puede
medir** —no hay tabla que lo registre— y los dos lectores de PDF fallaron en silencio: Marketing
(«+ Registrar gasto» y la pantalla del proyecto) y Reclamos. Las dos pantallas hacían lo correcto
—«no se pudo leer», sigue tecleando a mano— y por eso nadie reportó nada y nadie rotó la llave.

Daniel, textual: *«si se me acaba o algo que me llegue notificación a telegram»*.

### Qué quedó
- **Tres causas avisan** por 🔧 SISTEMA, y nada más: **llave que no sirve** (401/403, y también la
  llave ausente), **crédito agotado** (402, o el 400 cuyo mensaje dice `credit balance`/`billing`)
  y **tope de uso persistente** (429).
- **Lo que NO avisa es la mitad del diseño**: PDF ilegible, 400 de documento, timeout, 500 y 529
  «overloaded» no suenan — se arreglan volviendo a intentar y la pantalla ya lo dice.
- «Persistente» está medido, no supuesto: el cliente fija `maxRetries` en **2**, así que un 429 que
  llega al aviso ya se reintentó dos veces con espera.
- **Un solo punto de llamada a Anthropic**: `src/lib/ia/anthropic.ts`. Antes cada ruta armaba su
  cliente y su `try/catch` — dos copias del mismo silencio. **Ni un prompt ni un modelo cambiaron**
  y el error se vuelve a lanzar tal cual: las dos rutas contestan el mismo 500 de siempre.
- **Anti-loop de 7 días por CAUSA** (`cron_email_errors.tipo` = `lector_facturas:<causa>`), marcado
  **después** de que Telegram confirme. La causa va en la llave para que una llave vencida no tape
  que después se acabe el crédito.
- El mensaje manda a la pantalla exacta: llave → API Keys y después Vercel; crédito → Billing («la
  llave no hay que cambiarla»); tope → esperar y, si sigue, Limits.

### Sin migración
No hace falta DDL: el dedup vive en `cron_email_errors`, que ya existe y ya usan el guard de montos
y el silencio de datos.

### Candado
`lector-facturas-avisa.test.ts` (29 casos): las tres causas, el CONTROL de que un 500 de PDF y un
529 no avisan, el anti-loop en las cuatro direcciones (avisa · no repite · Telegram no confirma →
no marca · fail-open) y el barrido que exige que **solo `lib/ia/anthropic.ts` importe el SDK**.

### Pendiente de Daniel
- Nada. Se comprueba subiendo un PDF en Marketing o en Reclamos; si la llave vuelve a fallar, el
  aviso llega solo.

⚠️ Al correr la suite completa fallaba `data-health-dentro-de-usuarios` — era el trabajo **en curso
de otra sesión** (la que retiró la pantalla Data Health), no de este cambio. Nada de ese árbol se
tocó ni se commiteó. **Ya cerró**: ver el bloque de abajo.

---

## Data Health se va de la pantalla, la medición se queda (11-sep-2026)

Daniel, textual: ***«data health quiero que el sistema o tú mida todo pero no verlo… no lo uso y no
lo quiero usar»***. Y antes: ***«yo no uso Data Health, nunca lo veo»***.

### Lo medido contra producción, antes de tocar nada

| Qué | Cuánto |
|---|---|
| `data_integrity_checks` | **870 filas · 121 corridas**, del 13-may al 11-sep-2026 |
| Última corrida | 11-sep **12:00:11 UTC** — los 7 checks vivos, todos en `ok` |
| `cron_heartbeats` de `integrity-check` | 11-sep 12:00:11 UTC |
| Entradas de la pantalla en `activity_logs` | **CERO**, en toda su historia |
| La key `data-health` en permisos | **en ninguno** de los 7 roles ni de los 2 overrides vivos |

🔑 **«Quién entró» no se podía medir, y ésa fue la respuesta.** La pantalla nunca registró una
entrada en `activity_logs`.

### Qué se fue

La **2ª pestaña de `/admin/usuarios`** (`DataHealthTab.tsx`, 478 líneas), el **aviso proactivo del
Inicio**, la ruta `GET /api/admin/data-health` y el **link del mensaje de Telegram** (apuntaba a una
pantalla que ya no existe). `/admin/data-health` y `/data-health` → **`/home`**, 307.

### 🔴 Qué se quedó — que es el punto

El cron **`integrity-check`** (12:00 UTC) y su recuperación in-process en `switch-reconciliacion`;
las **81 entradas de cron NO se movieron**; `data_integrity_checks` (insert-only, sin dropear, con
su clase intacta en el respaldo); `LIVE_CHECK_NAMES` con sus 7 checks; y la **alerta**: un check
`critical` sigue saliendo por 🔧 SISTEMA.

### Cómo se mira ahora, sin pantalla

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  https://fashiongr.com/api/diag/data-health | jq '.latest[] | {check_name, severity, rows_affected}'
```

Es la MISMA lectura del dashboard, movida a `/api/diag/`. Auth: `CRON_SECRET` **o** sesión de admin.
Fail-closed (503 sin secreto configurado, 401 sin credencial). Read-only: un solo SELECT.

### Migración y candados

`20261112120000_retirar_pantalla_data_health.sql` (**aplicada**), aditiva, **cero filas afectadas**
— la de agosto ya había limpiado los permisos. Candado nuevo `data-health-sin-pantalla.test.ts` (20
casos, cada ausencia con su control de presencia). Siete candados cambiaron de dirección con nota
fechada, ninguno se borró.

### Pendiente de Daniel
- Nada.

---

## 11-sep-2026 — El ajuste de los días después del corte entra en las columnas de siempre

Viene de la contadora (Yulissa), textual: *«no puedes netear las horas extras con las horas de
tardanza o de ausencia porque valen diferente… debe poner lo que llegó en tardanza en tardanza y lo
que llegó como extra en extra porque los valores de la rata por hora son diferentes porque una tiene
recargo»*. Daniel: *«el ajuste separado como lo hace ella»* → *«sí»*. Medido en sus Excel (backtest
del 10-sep, § 3.4): ella NO tiene columna de ajuste; las horas de los días después del corte entran
en la quincena siguiente dentro de las columnas normales.

**Dónde:** Asistencia › Planilla (pantalla, Excel, PDF y comprobante), con `NEXT_PUBLIC_PLANILLA_UNIDA`
prendido (lo está en producción desde el 10-sep).

**Antes:** `ajusteDeDiasSinMedir()` devolvía UN número (la suma firmada de los 7 conceptos del reloj)
y la planilla lo mostraba como una línea/columna «Ajuste quincena anterior» (chip ámbar en la fila,
caja ámbar arriba del cuadro, renglón en el comprobante), restándolo del neto en pantalla, en el
cierre y en el papel.

**Ahora:** el ajuste se reparte concepto por concepto (`repartirAjuste`) y se SUMA dentro de la
columna de la quincena que se paga (`aplicarAjusteEnLinea`, en la ruta, antes de totalizar): extra
diurna → Horas extra 1.25 · nocturna → 1.50 · excedente/domingo/feriado → las suyas · tardanza →
Tardanzas · ausencia → Ausencias. Cada monto con SU rata (ya venía valuado por el motor). `netoPagar`
ES el neto que se paga; nadie lo vuelve a restar (pantalla, `totalesDe`, comprobante, Boston).
La columna «Ajuste quincena anterior» se retiró de las cuatro superficies. En su lugar:
- Planilla: `title` en la celda («Incluye $5.00 de los días 14–15 sep, que la quincena anterior pagó
  sin medir.») y un pie de tabla; en el celular, una línea gris en el detalle de la tarjeta.
- Excel: nota al pie de la hoja «Planilla», fila en «Cómo se calcula» y hoja aparte **«Ajuste
  anterior»** (una fila por colaborador, una columna por concepto, efecto en el neto) — solo cuando
  hay ajuste.
- PDF y comprobante: la misma nota al pie. Sin cajas ni chips.

**🔴 El neto por persona no cambia.** Candado con el caso de Daniel (Ana, $600, 14 y 15 con 1 h
tarde y 1 h extra: antes «ajuste −2.00 (se le devuelven $2)», después «Extras +5.00» y «Tardanza
+3.00», neto 269 por los dos caminos) y **medición contra producción (solo lectura)**: quincena
16–31 ago con corte el 28 → días sin medir 29–31 ago → quincena 1–15 sep, las 3 empresas
(`scripts/_medir-ajuste-por-concepto.ts`):

| | Personas con dinero | Con ajuste | Dif. neto antes/después (máx.) | Dif. Σreparto vs ajuste viejo (máx.) |
|---|---:|---:|---:|---:|
| Boston · Fashion Wear · Vistana | 35 | 9 | **$0,00** | **$0,00** |

Los 9 con ajuste: Alejandra 22 (tard. 0,69) · Andrés 23 (tard. 0,77) · Yeritza 51 (aus. 2,90) ·
Julio Garay 11 FW (extra 1.25 10,94 + 1.50 3,93 → −14,87) · Andrea 16 (extra 3,35 · tard. 0,84 →
−2,51) · Jorman 5 (extra 5,97 · tard. 0,81 → −5,16) · Luis Arroyo 9 (extra 6,20 + 2,22 → −8,42) ·
Rodrigo 13 (extra 8,76 + 3,13 → −11,89) · Roxana 1 (tard. 0,74).

**Lo que se conserva:** `ajusteDeDiasSinMedir` (derivada: Σ signo × reparto), `netoConAjuste` (la
única cuenta, ahora adentro de `aplicarAjusteEnLinea`), el testigo `ajuste_anterior` del cierre, ISR
a mano, préstamo/daño/terceros desde Préstamos.

**⚠️ Pendiente de Daniel (dos cosas que se dejaron a propósito):**
1. **La salida temprana de los días después del corte NO entra al ajuste** — `CONCEPTOS_DEL_RELOJ`
   son 7 y «Salida temprana» nació el 10-sep, después del corte. Medido: **$11,83** (Eloyn 29, el
   29–31 ago) que ni antes ni ahora se descuentan. Agregarla es una línea; falta que Daniel diga.
2. **Los seguros no se recalculan sobre lo repartido** (nunca lo hicieron): con $5 más de extras el
   seguro social de esa quincena sigue saliendo del bruto sin ajuste.

**Candados:** `planilla-ajuste-por-concepto.test.ts` (nuevo); cambiaron de dirección con nota
fechada `planilla-unida-comprobante` (bloque C), `planilla-unida-corte-y-cableado` (H e I) y
`excel-encabezados-fila-1` (27 → 28 hojas). Mutaciones: `scripts/_mutar-candados-ajuste-por-concepto.sh`.


---

## 11-sep-2026 — Reclamos: el correo con adjuntos, el papel con el orden de la pantalla, y dos fechas viejas resueltas

Cuatro encargos, cuatro commits. Dos de código y dos migraciones aplicadas y verificadas.

### A · El correo al proveedor lleva la factura y las fotos ADJUNTAS

Daniel, textual: *«la factura y la foto del reclamo que sale por correo en el excel, sale por medio
de un link… se puede adjuntar directo al correo y quitarlo del excel? Va»*.

Hasta hoy el correo llevaba **un** archivo —el Excel— con dos links adentro: la factura firmada por
un año contra el bucket privado y la galería pública por token. El proveedor abría el Excel, tocaba
un link y esperaba al navegador. Ahora:

- Se adjuntan el Excel, la **factura en PDF** de cada reclamo (`REC-2026-0026-factura.pdf`) y sus
  **fotos** (`REC-2026-0026-foto-1.jpg`), achicadas antes de viajar (**1600 px** de lado mayor,
  **JPEG 80**, `sharp` con `.rotate()` por el EXIF — el mismo tratamiento del ZIP de Marketing).
  Si `sharp` no puede leer una, viaja tal cual: pesada es mejor que ausente.
- 🔴 **El tope es el del correo YA CODIFICADO.** Resend acepta 40 MB y base64 crece 4/3, así que el
  presupuesto crudo es 3/4 de eso y los dos se derivan uno del otro. Pasarse tira el correo entero.
- 🔴 **Lo que no cabe se dice.** Se manda lo que quepa —el Excel, después las facturas, y al final
  las fotos de la más liviana a la más pesada, para que entren más y no menos— y el cuerpo dice
  «N fotos no cupieron; pídelas si las necesitas». Un archivo enorme no deja fuera a los chicos.
- El Excel del correo **no contiene un solo `http`**. El que se **descarga** conserva sus links y es
  a propósito: ahí no hay correo que cargue los archivos. Y sin links **tampoco se firma nada**.

**Medido contra producción** (`scripts/_medir-reclamos-adjuntos.mjs`, solo lectura): de los 33
reclamos vivos, **4 tienen factura en PDF** (4,57 MB en total, la mayor 2,13 MB) y hay **14 fotos**
(2,03 MB, la mayor 0,25 MB). Hoy el tope no se toca ni de lejos.

**Candado:** `reclamos-correo-adjuntos.test.ts` (26 casos, con el CONTROL de que el Excel de descarga
sigue trayendo sus links). Cambió de texto con nota fechada: `poda-textos-ayuda`.

### B · Los reclamos viejos sin fecha de reclamo se marcan con la de su creación

Migración `20261113120000`, **aplicada y verificada**. Daniel: *«todas las hemos reclamado ya que se
descarga y se envía… los 9 como reclamados con la fecha en que se crearon. Va»*.

⚠️ **Medido, y no eran 9 sino 6.** El número de ayer era 9 sobre 29 por cobrar ($14.939,64); remedido
hoy antes de escribir la lista: **27 por cobrar ($10.674,19)** y **6 sin reclamar ($3.167,96)**. Los
tres que faltan no se perdieron — FW-2026-0001 pasó a Pagado hoy 14:32 UTC, y FW-2026-0006 y
FW-2026-0007 salieron de la casa a las 14:33 y 14:28.

| | por cobrar | sin reclamar |
|---|---|---|
| antes | 27 · $10.674,19 | 6 · $3.167,96 |
| después | 27 · $10.674,19 | **0 · $0,00** |

Las 6 fechas quedaron iguales al centésimo de segundo a su `created_at`.
Verificación: `scripts/_verif-reclamos-viejos-reclamados.mjs`.

### C · El papel del reclamo con el orden de la pantalla, y un solo «Descargar»

Mockup aprobado. El PDF, el Excel y la pantalla decían lo mismo de tres formas distintas; ahora los
tres salen del mismo módulo puro (`lib/reclamos/papel.ts`).

- Cabecera: logo · **FASHION GROUP** · la empresa a la izquierda; **Reclamo N° + fecha de la
  factura** a la derecha. Sin fecha de factura cae a la del reclamo, **nunca a «hoy»**.
- Una línea: `Proveedor · Marca · Factura · PO · Contacto`, sin escribir lo que no existe. El
  contacto entra por primera vez al PDF (ya se leía para el Excel y se tiraba).
- Tabla `Estilo · Descripción · Talla · Cant. · Precio · Subtotal · Motivo`, motivo capitalizado.
  🔴 Las columnas vacías —Género, Factura, PO— no se dibujan. **Medido: de los 33 vivos, CERO traen
  Factura o PO por renglón y solo 8 traen Género**, así que el papel normal es de siete columnas.
- 🔴 El pie de totales a la derecha, uno debajo del otro, con el **Total** en negrita y raya arriba.
  Se fueron las cuatro cajas de arriba y la banda «TOTAL A ACREDITAR».
- Pie de página: `Confidencial · fashiongr.com`.
- La pantalla: **«Descargar ⌄» pasa de dos salidas a tres** — Reclamo en PDF · Reclamo en Excel ·
  **Factura del proveedor** (el PDF original, solo si existe). Se retiró el botón suelto «Ver
  factura»; el visor sigue en la pantalla de edición.

**NINGÚN NÚMERO SE MUEVE.** REC-2026-0026 (Vistana, 10 renglones): **$376,65 · $37,67 · $29,00 ·
$443,32** en las tres superficies. 🔑 El candado los compara con el **mismo formateador de la
pantalla** y no con `toFixed`: la importación son 37,665 exactos y los dos redondeos difieren.

**Candado:** `reclamos-papel.test.ts` (25 casos, el PDF generado de verdad y leído con `pdftotext`).
Tres cambiaron de ancla con nota fechada: `reclamos-itbms-rotulo-y-pendientes`,
`excel-exports-reclamos`, `reclamos-genero-valor-vs-etiqueta`.

### D · Las fechas de factura de los reclamos viejos

Migración `20261114120000`, **aplicada y verificada**. Daniel: *«sobre la fecha de la factura de lo
viejo que no tiene pdf, ponle fecha tú»*.

⚠️ **Son 29, no 30, y la fecha NO es la de la factura: es la del RECLAMO.** Medido: 33 vivos, 4 con
fecha —los mismos 4 que tienen PDF— y **29 sin ella, los 29 sin PDF**, del 16-ago-2024 al
26-ago-2026. Se les puso su `fecha_reclamo`, que es la mejor aproximación que existe: la factura
siempre es anterior, así que **los días quedan subestimados, nunca inflados**. Quien necesite la
fecha real la corrige desde «Editar», que pide ese campo.

Después: **0 reclamos vivos sin fecha de factura**, y los 4 con PDF no se tocaron.
Medición y verificación: `scripts/_medir-reclamos-fecha-factura.mjs` ·
`scripts/_verif-reclamos-fecha-factura.mjs`.

### ⚠️ Pendiente de Daniel

1. **La factura del proveedor en el correo la firma «Fashion Group»** y el adjunto se llama
   `<N° de reclamo>-factura.pdf`. Si un proveedor prefiere el nombre original del archivo que subió
   Andrea, se cambia en una línea (`nombreFactura`, `lib/reclamos/adjuntos-plan.ts`).
2. **La galería pública por token sigue viva** aunque ya no se cite en ningún Excel nuevo: los links
   de los Excel viejos, que ya están en los correos del proveedor, no se rompen. Cerrarla es una
   decisión aparte.
3. **Las 29 fechas de factura se pueden mejorar una por una** cuando Andrea tenga el papel a mano.
   Hoy son la fecha del reclamo y así queda dicho acá y en `CLAUDE.md`.

---

## 11-sep-2026 (tarde) — Reclamos: «sin links», y la galería pública se retira

Daniel cerró la decisión de la mañana: *«sin links»*. No solo el Excel del correo — **el que se
descarga tampoco**.

### Un solo Excel, sin un `http`

- La opción `conLinks` se retiró: **un Excel con links no se puede armar ni queriendo**. Las dos
  columnas del Resumen («Factura PDF» y «Fotos») y la sección «Archivos y evidencia» de cada hoja
  se fueron. La columna **«# Fotos» se queda**: es un dato, no un camino a un archivo.
- 🔴 **No se firma nada.** Con los links se fueron `adjuntarFacturaUrls`, `firmarFacturasLote` y
  `FACTURA_LINK_TTL_SECONDS` — el TTL de **UN AÑO** que el Excel exportado le metía adentro al
  proveedor. Hoy lo único que se firma es lo que se MIRA en pantalla, y dura una hora.
- La factura se baja desde **«Descargar › Factura del proveedor»** (encargo C de esta mañana) y las
  fotos se miran en la página del reclamo. Al correo viajan **adjuntas** (encargo A).

### 🩸 La galería pública se retiró entera

`/reclamos/galeria/[id]` abría **sin ninguna sesión**, con un token HMAC **sin vencimiento**, y su
único citador era el link «Ver fotos» del Excel. Al quedarse el Excel sin links se quedó sin un solo
lector. Se fueron:

| | |
|---|---|
| `src/app/reclamos/galeria/[id]/page.tsx` | la página pública |
| `src/app/reclamos/galeria/[id]/GaleriaView.tsx` | su vista |
| `src/lib/reclamos/galeria.ts` | la lectura |
| `src/lib/reclamos/gallery-token.ts` | el token HMAC y `reclamoGaleriaUrl` |
| `PUBLIC_PREFIXES` del middleware | **su exención de auth** |

Sin esa última línea nada la puede volver a abrir sin pasar por la sesión.

⚠️ **Los Excel VIEJOS que ya están en el correo de algún proveedor dejan de abrir sus fotos.** Daniel
lo sabe y lo decidió así. ⚠️ El bucket `reclamo-fotos` **no se toca** (privado desde la mañana) y las
fotos **no se pierden**.

**Candados:** `reclamos-correo-adjuntos.test.ts` — el bloque (2) **cambió de dirección con nota y sin
borrarse**: decía «CONTROL — el Excel que se DESCARGA conserva sus links» y ahora exige lo contrario,
más tres casos nuevos (los cuatro archivos no existen, el middleware no la nombra, y un `git grep`
exige que nadie firme ya un token de galería). También cambiaron de dirección con nota:
`excel-exports-reclamos` (la hoja no puede tener NI UN hipervínculo, ni siquiera cuando se le pasa
una `factura_pdf_url` ya firmada) y `reclamos-rediseno` (el barrido de URL públicas bajó de 5
archivos a 3, porque dos ya no existen).
