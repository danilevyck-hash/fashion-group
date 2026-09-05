# Estado al 31-ago-2026 — complemento del documento maestro

> El documento maestro (`fashion-group-erp-master-context.md`) es del **5-jul-2026** y quedó desactualizado.
> Este archivo cubre el gap jul→ago y el estado real medido contra producción hoy.
> Léelos juntos: el maestro para arquitectura y decisiones, este para qué existe hoy y qué falta.
>
> ⚠️ **Al pie hay una sección «Lo que cambió después»** con el 1 al 4 de septiembre. Léela también.

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
| **Depurador — 3 pestañas, la compañía se reconoce y el Excel se puede volver a bajar 90 días** (4-sep) | Rediseño de la navegación aprobado por Daniel («Aprobado»), **cero cambio en el cálculo** (misma plantilla de 25 columnas, candado en verde). **(1)** De 7 pestañas a 3: **Plantilla** (Nuevo · Historial) · **Tallas y catálogo** · **Configuración**; los tres caminos (CK/TH, Reebok, Facturas Tienda) viven en la dropzone única de «Plantilla › Nuevo» y no se nombran; todo `?tab=` viejo redirige. **(2)** La compañía se **reconoce de la marca del archivo** (*«¿para qué elegir la compañía si la puede detectar?»*) con «cambiar» (las 6) por si falla; con marcas de 2 compañías se dice y no se adivina. **(3)** UN campo **«Temporada»** (era «Mes»+«Año», que engañaban): arranca SIEMPRE en el mes actual de Panamá (*«la temporada es el mes que se hace el archivo»*) y **no se recuerda**. **(4)** El Historial guarda **el mismo Excel que bajó** (bytes idénticos) 90 días en el bucket privado `depurador-plantillas`; **solo los Excel de Switch** (*«el historial solo quiero los excel para switch»*) — el pedido de Reebok con fotos NO; la fila con los totales queda para siempre; cron nuevo `cleanup-depurador-archivos` 03:20 UTC; filtro por compañía, todos ven todo (*«todos»*). **(5)** El divisor valida en pantalla **en los tres caminos** (Reebok y Facturas Tienda se sumaron al guard de CK/TH). **(6)** Tallas y Fotos a mi Excel dejan rastro en `activity_logs` (`descarga_tallas`/`descarga_misfotos`) para medir uso en unas semanas — de paso se arregló `/api/activity`, que insertaba columnas inexistentes. ⚠️ La marca desconocida quedó EXACTAMENTE como está (*«Como está»*). ⚠️ **Migración `20260921120000_carga_history_archivo.sql` pendiente de aplicar** — mientras no corra, todo funciona y las filas quedan sin botón. Candados: `depurador-validacion-pantalla` (25) · `depurador-divisor-tres-caminos` (5) · `depurador-pestanas-rediseno` (9) · `api/depurador-historial-archivo` (7); **10 mutaciones, 10 cazadas** (`scripts/_mutar-candados-depurador-rediseno.sh`) + las 10/10 del script del 4-sep re-corridas. Suite completa y build en verde. Sin commitear. |
| **Caja Menuda — el cierre dice la verdad y la tanda no pelea con el formulario** (4-sep) | Los puntos de Caja de la auditoría de eficiencia, aprobados por Daniel. **(1) 🔴 El cierre YA NO exige saldo 0** — Daniel, textual: *«cierro cuando queda poca plata (criterio de la secretaria) y le doy la diferencia para llegar a los 200»*. La regla vieja forzaba los datos (medido: los 2 períodos cerrados dan $200.00 clavados, con gastos de $0.05 y $0.87 creados y borrados el día del cierre para cuadrar). El modal ahora muestra Fondo · Gastado (N recibos) · Queda en caja · Reposición para volver a $200, y el botón es **«Cerrar y abrir el N»**: cierra con el saldo que tenga (negativo se ve en rojo y se dice, pero NO bloquea) y abre el período siguiente en $200 por el mismo camino que «+ Nuevo período» (`src/lib/caja/abrir-periodo.ts`). El saldo del cierre se guarda (`saldo_cierre`); ⚠️ **migración `20260920120000_caja_reposicion.sql` pendiente de aplicar** — mientras no corra, el cierre funciona igual, sin la foto. La 💡 «cerrar período +30 días» se retiró: el criterio es la plata, no los días. **(2)** «Guardar y nuevo» **conserva la fecha elegida** (la tanda real: ~38 recibos de semanas atrás tecleados en una sentada; categoría y responsable ya se conservaban). **(3)** El **ITBMS arranca plegado** tras «＋ Agregar ITBMS» (lo tienen 9 de 77 gastos); la cuenta no cambia: total = subtotal + itbms, plegado = 0. El N° de factura ya era opcional (verificado en el servidor); 🔴 **el proveedor sigue texto libre SIN lista** (Daniel: *«no»*), con candado explícito. **(4) Bugs de la auditoría:** el PATCH de gasto aceptaba `metodo_pago`/`numero_factura` (columnas inexistentes → 500); ahora la lista es de columnas reales e incluye `nro_factura` (el editar en línea lo mandaba y se perdía en silencio). El respaldo de categoría es UNO («Varios»; el cliente decía «Otros»). El GET de un período borrado contesta 404. «¿Restaurar?» ya no pide confirmación (sin consecuencia); la de eliminar queda. La ruta huérfana `/caja/[periodoId]/nuevo` NO se borró: nota en su cabecera (nada la enlaza). Candados: `caja-cierre-con-saldo.test.ts` (7) · `caja-formulario.test.tsx` (5); **8 mutaciones, 8 cazadas** (`scripts/_mutar-candados-caja.sh`). Suite completa y build en verde. Sin commitear. |
| **Depurador — la pantalla valida lo que se teclea y no borra el trabajo hecho** (4-sep) | El punto 1 de «Lo urgente» de la auditoría de eficiencia, aprobado por Daniel. **(1)** El divisor pasa por `validarDivisor` TAMBIÉN en los inputs de la pantalla (global y por marca, vía `mensajeDivisorEnPantalla` — el mismo guard de las rutas, no otra copia): `70` → campo en rojo, «Debe estar entre 0.10 y 1.00. ¿Quisiste poner 0.70?» y **la descarga se apaga, nunca el tecleo** — antes ese `70` bajaba un Excel con costos 100× mal directo a Switch (50-60 corridas/mes). **(2)** La tasa dejó de ser texto libre: select de dos — Daniel: *«solo existen esas dos»* — 7% → `07` y Exento (0%) → `0`, siempre TEXTO; `tasaSwitch` intacto. **(3)** Los precios escritos a mano **se conservan** al re-procesar y al cambiar empresa/mes/tasa/factor — Daniel: *«y también consérvalos»* — pegados por REFERENCIA de artículo (nunca por índice), con «N precios escritos a mano se conservaron» y botón «Borrarlos todos»; año/factor ya no re-procesan en cada tecla (300 ms o blur). **(4)** La pantalla abre como quedó la última vez (`useLastUsed` / `fg_last_depurador_*`); el archivo no se recuerda. CONTROL: con datos válidos el Excel sale IDÉNTICO (25 encabezados y valores, comparado celda a celda). Candado: `depurador-validacion-pantalla.test.tsx` (18); **10 mutaciones, 10 cazadas** (`scripts/_mutar-candados-depurador-pantalla.sh`); suite completa y build en verde. ~~⚠️ Reebok y Facturas Tienda conservan inputs de divisor sin validación de pantalla — decisión pendiente de Daniel.~~ **Superado el mismo 4-sep: la validación llegó a los tres caminos con el rediseño (fila de arriba).** Sin commitear. |
| **Clientes — el que Switch borró deja de ofrecerse** (4-sep) | Daniel, textual: **«APROBADO»**. **Defecto medido:** `switch_clientes` notaba al cliente borrado en Switch (`activo=false` desde julio) pero `clientes_master` era un upsert puro que nunca marcaba lo que dejó de llegar — **D-30 «City Moda Chorrera»** (el duplicado de D-26, borrado en las 6 el 13-ago) y **D-135 «Rey Store (Aguas)»** se seguían ofreciendo en todos los selectores. **Ahora:** columna nueva `clientes_master.ausente_desde` (NO se reusó `deleted`: eso significa «no existe» y lo filtran vistas, índice y ficha) — el sync la marca cuando **ninguna** de las 6 lo manda y la quita solo si reaparece. Deja de ofrecerse (ClientePicker de Guías/Cheques, «más usados», atar, y el selector de pedidos de catálogo filtra `activo=true`) pero **no se borra**: la lista lo muestra con rótulo, la ficha dice «Ya no está en Switch desde el 13 ago 2026», y las guías viejas siguen con su nombre. 🔴 Protección en capas: `activo` solo cambia con lista de Switch completa y no vacía; lectura fallida no marca a nadie; sin datos de `activo` la pasada se omite; freno si saldría ausente >10% del directorio. Medido: se ofrecen 150 → quedarían **148**; ninguno de los 2 tiene guías, cheques, pedidos ni CXC vivos. ⚠️ **Migración `20260919120000_clientes_master_ausente.sql` pendiente de aplicar** (mientras tanto, todo igual que hoy). Candados: `clientes-ausentes-de-switch.test.ts` (16) · `clientes-ausentes-selector-y-ficha.test.tsx` (5); **14 mutaciones, 14 cazadas** (`scripts/_mutar-candados-clientes-ausentes.sh`). Sin commitear. |
| **Guías — el mockup FINAL: días con factura, «Traslado» y «el de siempre»** (4-sep, noche) | Daniel aprobó el mockup final: **«dale aprobado»**. Tres cosas, todas bajo el mismo `GUIAS_ATAJOS_NUEVOS`. **(1)** El panel de facturas abre con **los últimos 3 días CON factura** (no de calendario: si el último fue hace dos semanas, ese es el primer grupo), cada día con su encabezado en palabras («Miércoles 3 sep») y **«Ver más días»** +3 — medido: de 471 facturas usadas en guías este año, 77% salen del último día facturado, 92% de los últimos 2, 95% de los últimos 3. **(2)** Botón **«Traslado»** debajo de la lista, separado por un «o» (Daniel: *«que en factura salga traslado»*; descartó «Factura pendiente» y «Sin factura» — son DOS caminos: factura o Traslado): escribe el TEXTO `Traslado` en `facturas` y así sale en el papel, el PDF y el Excel; la **empresa se elige a mano**; los 58 renglones viejos con `0000` no se tocan. **(3)** **«El de siempre»** (*«sí correcto, con entrega Sport Corner como default, que elija si quiere el otro sino»*): cada cliente puede tener UN destino marcado así — columna `el_de_siempre` en `guias_destino_cliente` (índice parcial: a lo sumo uno activo por cliente) + marca por fila en Guías › Configuración — y ESE se autollena al elegir el cliente **aunque tenga varios**; sin ninguno marcado, nada. Los definidos que cerró Daniel: los 10 de su tabla (D-81 · D-80 · D-156 · D-117 · D-87 · D-25 · D-35 · D-112 · D-144 · D-141), las 5 correcciones de escritura (D-99 Westland · D-147 Changuinola · D-7 Penonomé · D-43 Las Tablas · D-86 Albrook), la familia City Moda entera a «Sport Corner Calidonia» (D-26 con «Chorrera» de segundo botón; el «5 de Mayo» se quitó; D-30 no se define — Switch lo borró), y D-142 sin marca con sus 8 botones. Los ~40 restantes siguen de su historia, y con UN solo destino histórico también autollenan. ⚠️ **Migración `20260918120000` editada en el lugar (todavía pendiente de aplicar): ahora carga 34 filas con la marca.** Candados extendidos (no duplicados): `guias-atajos-facturas` (28) · `guia-form-marcar-facturas` (15, papel y Excel generados con «Traslado») · `guias-destinos-cliente` (54) · `guia-form-destinos` (16) · `guias-destinos-precedencia` (11) · `guias-destinos-config-route` (19) · `guias-configuracion-pantalla` (14); los 4 scripts de mutación del módulo re-corridos enteros — ver el postmortem. Sin commitear. |
| **Guías › Configuración — los destinos definidos se corrigen desde la pantalla** (4-sep, tarde) | Daniel mandó dos correcciones, textual: *«city shoes → Calle 19 Central, al lado de la joyería Super Oro. Y Nine Sport en Calle 19 Central.»* — y cada corrección así costaba un despliegue, porque los definidos vivían en la constante. **Las dos correcciones ya rigen** (D-35 con el texto completo; D-112 Nine Sports entra nuevo con «Calle 19 Central» — su histórico decía «Calle 19»): van en la constante para no depender de la migración. **Lo nuevo:** tabla `guias_destino_cliente` (grano cliente+destino, `tiendas text[]` en el mismo grano — solo D-142 las usa —, **soft delete firmado NUNCA DELETE**, única entre activas, RLS service_role) + pestaña **Guías › Configuración** a pantalla completa (molde de Comisiones): lista agrupada por cliente con buscador, dice si autollena o si salen botones, agrega con `ClientePicker`, edita el texto en la fila, quita con confirmación en palabras, y muestra los destinos ya usados en guías para **promoverlos de UN toque — nunca solos**. 🔴 La ven y editan **admin Y secretaria** — Daniel: *«configuraciones también deja a secretaria»*; bodega y vendedor 403. Precedencia en UNA función (`destinosDefinidosPara`): **tabla → constante → histórico**; con la tabla ausente (PGRST205) todo cae a la constante y nada se rompe. El campo Dirección sigue texto libre, `guia_items` no se toca, todo bajo `GUIAS_ATAJOS_NUEVOS`. ⚠️ **Migración `20260918120000_guias_destino_cliente.sql` pendiente de aplicar** (carga los 24 definidos de hoy: encenderla no cambia ni un comportamiento). ⚠️ **Pendiente: Daniel aprueba el mockup de la pantalla antes de publicar.** Candados: `guias-destinos-precedencia.test.ts` (11) · `guias-destinos-config-route.test.ts` (15) · `guias-configuracion-pantalla.test.tsx` (13); **9 mutaciones, 9 cazadas** (`scripts/_mutar-candados-guias-destinos-config.sh`) y los tres scripts previos del módulo re-corridos en verde (13/13 · 12/12 · 17/17). Sin commitear. |
| **Guías — los DESTINOS del cliente como botones bajo Dirección** (4-sep) | La otra mitad del mismo encargo («va») y el MISMO interruptor `GUIAS_ATAJOS_NUEVOS` — no hay un segundo. **Antes:** la dirección (que es el DESTINO del envío, no la del cliente — `clientes_master` no la tiene) se escribía a mano cada vez, y el mismo lugar entraba de varias formas (medido: «Paso Canoas»×208 · «Pasocanoas» · «Paso Canoa»; de 48 clientes con guías, 40 usan siempre el mismo destino). **Ahora:** bajo el campo Dirección aparecen botones con los destinos de ese cliente — **9 clientes con destino DEFINIDO por Daniel** (su tabla, en `src/lib/guias/destinos-clientes.ts`, fuente de verdad que gana sobre el histórico: el de D-87 decía más veces «Changinola» que el «Guabito» que él definió) y el resto por historia (agrupado **exacto**: sin acentos/espacios, «s» final ignorada, **los dígitos jamás se juntan** — N2 ≠ N3; grafía más usada, máx. 6). **D-142 Sporting Shoes** con sus 8 destinos + tienda opcional (5·6·14·«Mas Flow»…, «+ otra») → `Westland · tienda 6` (separador en UN lugar, `componerDestino`; papel/PDF/Excel imprimen la dirección en celda propia, nada choca). 🔴 ~~El botón se toca, nunca se aplica solo — el pre-marcado NO se construyó~~ **superado el mismo 4-sep al probarlo Daniel: ver la fila «Guías — los ajustes de Daniel» abajo** (el destino ÚNICO se autollena; los botones para varios destinos quedan igual). El campo sigue texto libre, una Completada no muestra nada, el payload no cambia, cero migraciones. Candados: `guias-destinos-cliente.test.ts` (28) · `guia-form-destinos.test.tsx` (10, CONTROL apagado y Completada) · caso nuevo en `guias-frecuencias-ruta.test.ts`; **13 mutaciones, 13 cazadas** (`scripts/_mutar-candados-guias-destinos.sh`); diagnóstico `scripts/_diag-guias-destinos-cliente.ts`. Sin commitear. |
| **Guías — el cliente se elige UNA vez y se MARCAN sus facturas** (4-sep) | Daniel aprobó el mockup: **«va»**, y fijó la salida: *«te aviso si quiero revertir todo después de probarlo en producción con mi secretaria estas semanas»*. **Antes:** cada envío pedía a mano Cliente · Dirección · Empresa · Factura(s) · Bultos — un cliente de 3 empresas = 3 envíos con el cliente escrito 3 veces (medido: Angela 57 guías y Andrea 41 en 2 meses; 68 de 563 renglones con 2+ facturas, hasta 5). **Ahora:** en Nueva guía se elige el cliente una vez y aparecen sus facturas de las 6 empresas (agrupadas Hoy · Esta semana · Antes, 20 + «Ver más»); marcar arma los envíos de siempre, uno por empresa, con bultos por empresa. Puente por **CÓDIGO** (`switch_clientes`, jamás por nombre); solo tipo `Factura`; «Ya salió en GT-XXX» es **aviso, nunca bloqueo**; «No está en la lista» y «Traslado sin factura» (0000) siguen; elegir cliente **sigue sin ser obligatorio**. Lo de HOY lo trae una lectura corta en segundo plano — desde el mismo 4-sep se dispara **al tocar Guías** (ver la fila de los ajustes abajo), y en Nueva guía queda para quien entra directo por URL (fail-open, cooldown 10 min, lock del sync; medido: 92% de las facturas ya existían en la base al crear la guía y 58% eran del mismo día — la lectura cubre el resto). 🔴 **Reversible en UN lugar:** `GUIAS_ATAJOS_NUEVOS` (`src/lib/guias/atajos-facturas.ts`) — en `false` la pantalla es exactamente la de hoy, y **el payload que se guarda no cambia** con el interruptor en ninguna posición (candado que compara los dos caminos). Candados: `guias-facturas-del-cliente.test.ts` (11) · `guia-form-marcar-facturas.test.tsx` (11, CONTROL con la constante apagada) · `guias-atajos-facturas.test.ts` (19); **12 mutaciones, 12 cazadas** (`scripts/_mutar-candados-guias-facturas.sh`). Sin commitear. |
| **Guías — los AJUSTES de Daniel al probarlo + el resumen mensual al privado y al día 1** (4-sep) | Daniel probó lo del 4-sep y corrigió cuatro cosas (postmortem: sección nueva en `docs/postmortems/guias.md`). **(1)** El refresco de facturas de hoy se dispara **al tocar Guías** — *«¿por qué no se puede hacer al apretar guías? Prefiero eso.»* El candado de la lista **cambió de dirección, no se aflojó**: la regla es «la lista solo LEE, nunca escribe una guía», y la única salida que no es lectura es exactamente ese refresco (rol que no crea, solo lectura e interruptor apagado siguen en 100% lectura). **(2)** El destino se **AUTOLLENA** al elegir el cliente cuando tiene UN solo destino — definido o único en su historia agrupada (40 de 48 clientes; Bouti D-14 → «David») — porque Daniel quitó su propia regla del 14-ago: *«"la dirección no se escribe sola" me refería a que el usuario no lo haga… quita esa regla. Que se autollene»*. Con varios destinos, botones; lo escrito no se pisa; el pareo por parecido sigue prohibido. **(3)** **City Moda son ONCE clientes** (*«¿hay varios city moda no?»*): D-27/28/29/31/32/34/42 definidos a «Sport Corner Calidonia», D-26 a «5 de Mayo» (sus 8 direcciones «X (ENTREGA EN SPORTCORNER)» eran envíos cargados al código equivocado y se ignoran), **sin campo tienda**; D-30, D-33 y D-78 sin guías todavía → sin destino. **(4)** D-87 = Guabito con candado propio (*«en Frontera Duty Free es Guabito, hazme caso.»*). Y **(5)** el resumen mensual del grupo sale por `enviarNegocioPrivado` (*«este mensaje también lo quiero en alertas de Telegram, no en negocio.»*) **y corre el día 1** (*«sí, lo quiero lo antes posible»*): el «día 3» se apoyaba en un margen de sync-utilidad; medido, las ventas cierran la misma noche (última factura de julio 31-jul 19:15 UTC, de agosto 31-ago 19:15 UTC). Guardia nueva: sin sync de facturas en success para las 8 tras el cierre, el mensaje NO sale (error interno, lo reintenta la reconciliación días 1-2). Candados: `guias-eliminar-en-la-fila` (redirigido) · `guia-form-destinos` · `guias-destinos-cliente` · `guias-atajos-facturas` · `acs-resumen-canal-privado` (extendido) · `grupo-resumen-mensual-dia-1` (nuevo); **17 mutaciones, 17 cazadas** (`scripts/_mutar-candados-guias-ajustes-4sep.sh`) y los dos scripts anteriores re-corridos en verde. Sin commitear. |
| **Login — sesión vigente ya no pide contraseña** (3-sep) | **Defecto medido:** en 30 días hubo **451 entradas y en 297 el mismo usuario tenía el pase de 7 días vigente** (remedido al 3-sep: 453 de 468; Bodega 81/81, Daniel 146/147, gap mediano entre logins del mismo usuario: 2,3 h). La cookie estaba viva, pero el rol vivía solo en `sessionStorage` —que se borra al cerrar la app— y la pantalla de login nunca miraba la cookie: cada apertura pedía contraseña y creaba una sesión nueva. **Arreglo** (Daniel: «Aprobado»): con el pase vigente se entra directo a la casa del rol vía `GET /api/auth/sesion` — fail-closed: firma HMAC + token vivo y del MISMO usuario en `user_sessions` + usuario activo en `fg_users`, rol y módulos frescos de la base (payload compartido con el login: `src/lib/sesion-payload.ts`). Pase vencido, revocado o cerró sesión → la contraseña, exactamente como hoy. **No se tocó**: maxAge 7 días, middleware, rate limit, bcrypt, retención de 14/90 días. Colateral encontrado al mapear: el «Salir» del home NO revocaba la cookie (solo borraba `sessionStorage`) y los otros dos logouts mandaban el DELETE sin esperar — los 3 ahora revocan y esperan antes de navegar. Candado `sesion-vigente-no-pide-contrasena.test.tsx` (13 casos, CONTROL explícito); **9 mutaciones, 9 cazadas** (`scripts/_mutar-sesion-vigente.sh`). Sin commitear. |
| **Préstamos — «Aplicar quincena» pregunta la fecha de pago** (3-sep) | **Defecto medido:** el botón «Aplicar quincena (N)» existía desde junio y **no se usó ni una vez en 90 días** (cero `prestamo_aplicar_quincena` en `activity_logs`): escribía la fecha de HOY y contabilidad registra 1–4 días después del pago (las 6 quincenas jun–ago, todas: 15-jun→18-jun, 30-jun→1-jul, 15-jul→16-jul, 30-jul→3-ago, 15-ago→17-ago, 30-ago→1-sep). Por eso lo hacía a mano: 6 pasos × 13 personas, **15 minutos por quincena** (la del 1-sep: 13 movimientos, 16:14–16:29). **Arreglo** (Daniel: «Aprobado»): el botón abre un diálogo que **pregunta la fecha de pago** — dos atajos con los 2 días de pago que acaban de pasar (el 15 y el fin de mes REAL: 28/29/30/31) más cualquier fecha —, dice cuántas personas y el total, y **dice en pantalla quién ya tiene el descuento de esa quincena y no se lo vuelve a aplicar**. De 78 pasos a 1. La quincena del dedup se deriva de la fecha ELEGIDA (nueva migración `20260917120000_prestamos_quincena_fecha_elegida.sql`, ⚠️ **pendiente de aplicar**: recorta la tolerancia del dedup a `[inicio, fin+3]` — con los −3 días viejos, el pago del 15 bloqueaba el lote del 31 y no le aplicaba a nadie). **No se tocó**: el pago individual ni el cálculo del monto. Candados `prestamos-aplicar-quincena-fecha.test.ts` (37) + `prestamos-aplicar-quincena-pantalla.test.tsx` (6); **17 mutaciones, 17 cazadas** (`scripts/_mutar-prestamos-quincena-fecha.sh`). Sorpresa medida: contabilidad guarda el fin de mes como día **30** incluso en meses de 31 (30-jul, 30-ago) — el atajo propone el fin de mes real (31), la misma quincena; si prefiere el 30, un toque en el campo de fecha. Sin commitear. |
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
| **Ventas — «vs año anterior», 7 lugares** (3-sep) | Clientes comparaba 8 meses contra 9 (+3% → **+36%** Multi Fashion Holding). Una auditoría medida encontró 6 más con el mismo error: Resumen › Anual (grupo −7,0% → **+2,5%**, 5 de 8 cambian de signo) · Resumen › mes×año (Boston −93,5% → **+2,2%**) · Vista General · Productos de Ventas y de Multifashion (un día de más al año pasado, siempre) · Vendedoras (decía «vs año pasado», comparaba vs mes anterior → **rótulo corregido**, decisión de Daniel) · la RPC del Resumen cortaba en UTC. Definición única en `clientes-corte-comparativo.ts`. **Migración `20260910120000` (corte en Panamá) pendiente de aplicar** — hasta entonces Resumen/Anual/Vista General comparan mismos días pero con corte UTC. |
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

- ✅ **Ventas › Clientes «vs 2025» compara 8 meses contra 9** (cortaba el año anterior a fin de mes). Multi Fashion Holding decía +3% y es **+36%**; medido sobre los 115 del ranking, 37 cambiaban de número y 6 de signo. Arreglado el 3-sep con la regla de «mismos días»: **migración `20260909120000_clientes_vs_anio_anterior_mismos_dias.sql` pendiente de que Daniel la aplique** — hasta entonces la columna sigue como estaba.
- **1.363 fichas de Reebok** sin traer (artículos sin existencia). Drenan solas a 400/día.
- ✅ Documentación de Switch digerida → `docs/switch-referencia.md` (3-sep).
- ✅ **Los tres chicos del 31-ago** (3-sep, tarde): heartbeat huérfano de `sync-mayor` (**migración `20260914120000` aplicada el 3-sep**; candado en verde), `supabase/.temp/` fuera del índice y en `.gitignore` (nada sensible en el historial), y las filas con saldo 0 de Boston **son correctas** — documentos pagados que el reconcile cerró; se filtran, no se borran. Detalle en la sección 7.
- ✅ **Comisiones — UNA PERSONA, UNA FILA (alias de vendedor) + Venta/Cobro por separado** (3-sep, noche). Daniel revisó la pestaña Configuración ya en producción: *«¿por qué hay 4 Reinaldo?»*, *«llámalo Reynaldo y no Reinaldo»*, Daniel Levy en tasas *«quítalo»*, *«poder quitar comisiones en ventas o comisiones sin que tengan que ser de los dos»* (*«las 11 que ya cargamos quedan con las dos marcadas»*, *«arranca con las dos marcadas pero yo deselecciono»*), agrupado por empresa y sin el botón Configurar de Por empresa (*«configuración en dos lados»*). Commit `c1d84b2d`; **migración `20260913120000_comision_vendedor_alias_v8.sql` aplicada por Daniel el 3-sep** (verificado: alias, tasas 5 filas, 11 exclusiones activas, v8 responde) (tabla `comision_vendedor_alias` + `comision_vendedor_canonico()` + `comision_b2b_v8` + detalle v5 + colapso de tasas 9→5 con `REYNALDO ESPINOSA` 1 %/1 % + exclusiones 17→11 activas con `excluye_venta`/`excluye_cobro`). Hasta entonces la pantalla cae sola a la v7 y lo dice (`alias_aplicado: false`), y la Configuración muestra las grafías como vienen. **Medido con el SQL real, ene–sep 2026, por persona: 0 celdas cambian** (cuadre v7 pglite vs producción 680/0); la fila de tasa con cobro 0 % (`REINDALDO`) solo tocaba 2023 (+1.017,31) y 2024 (+327,79). Detalle en `docs/postmortems/ventas-referencia.md` («UNA PERSONA, UNA FILA»). ✅ **Las dos decisiones que quedaban se tomaron el 3-sep** (*«esconder rey stoute. si capitiliza reynaldo.»* → *«te dije que eliminaras Rey Stoute Aguas.»*): Rey Stoute Aguas **retirado** de Comisiones entera (lista única `lib/comisiones/retirados.ts`, **migración `20260916120000_retirar_rey_stoute_aguas.sql` **aplicada el 3-sep-2026** — desactiva su tasa, nunca DELETE) y «Reynaldo Espinosa» capitalizado en tablas, tarjetas, detalle y Excel. Ver la tabla de decisiones.
- ✅ **Comisiones — CLIENTES QUE NO COMISIONAN para un vendedor + pestaña Configuración** (3-sep, tarde). **Migración `20260912120000` aplicada por Daniel el 3-sep** (verificado: la tabla, las 17 filas y la RPC v7 responden en producción). Daniel: *«crea configuración en comisiones para desactivar cálculos de clientes»*, grano *«cliente vendedor»*, *«también venta»*; *«no lo llames así [exclusiones] y ponlo en Configuración»*; *«¿por qué en card y no como tab en toda la pantalla normal?»*; *«pon a Reinaldo 1 y 1»*. La migración cargó la tabla `comision_exclusion` + 17 filas de Daniel + `comision_b2b_v7` + detalle v4 + Reinaldo 1 %/1 %. Medido ene–sep 2026 con el SQL real: **solo Reinaldo se mueve**, Active Shoes −447,67 · Active Wear −151,19 · grupo −598,86; nadie sube. 29 mutaciones, 29 cazadas. Detalle en `docs/postmortems/ventas-referencia.md`. La decisión de alias que quedaba abierta se tomó esa misma noche (ver el punto de arriba).
- ✅ **Comisiones — el cobro se paga a QUIEN REGISTRÓ el recibo, y DEFAULT y Daniel no se pagan** (3-sep). **Migración `20260911120000` aplicada** (la v6 responde en producción) — hasta entonces la pantalla cae sola a la v5 (cobro por cartera) y lo dice en la respuesta (`regla_cobro: "cartera"`). Medido ene–ago 2026 con el SQL real: grupo +1.253,58 · Reinaldo +2.507,14 · Daniel +1.943,86 · Edwin −2.640,50; lo que de verdad se paga (sin DEFAULT ni Daniel) **48.491,64 → 48.064,15**. Detalle en `docs/postmortems/ventas-referencia.md`.
