# Estado al 31-ago-2026 — complemento del documento maestro

> El documento maestro (`fashion-group-erp-master-context.md`) es del **5-jul-2026** y quedó desactualizado.
> Este archivo cubre el gap jul→ago y el estado real medido contra producción hoy.
> Léelos juntos: el maestro para arquitectura y decisiones, este para qué existe hoy y qué falta.
>
> ⚠️ **Al pie hay una sección «Lo que cambió después»** con el 1 y 2 de septiembre. Léela también.

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
- 🔴 **Documento de $266.541.352 rechazado TODOS LOS DÍAS** en la cartera de Boston (`monto_imposible_cxc`, secuencial 155-…). El guard funciona y la cartera queda sana, pero **el dato está mal EN SWITCH** y lleva 6+ días. Es tarea de Daniel, en el panel de Switch.
- 🔴 **Rotar el token de acceso de Supabase** (el de Management API). Quedó expuesto en un chat el 31-ago.

### Abierto
- **PR #633** abierto y frío desde el 26-ago — "la gente de Multi Fashion no marca el reloj". Es un diagnóstico sin decisión: ~11 personas de ACS no marcan.
- **25 timestamps de migración repetidos en 52 archivos.** Hoy no rompe nada, pero el CLI indexa por ese número: dos archivos futuros con el mismo timestamp harían que uno nunca corra, en silencio. Hay candado nuevo (`migraciones-timestamp-unico.test.ts`) que congela las heredadas y falla con cualquier duplicado nuevo.
- **~44 archivos con código de tolerancia a DDL que ya corrió** (`faltaTabla` / `esTablaAusente` / `PGRST205` / `42703`). Rama muerta: si un permiso o timeout devuelve ese código, convierte un error real en "no hay datos" en silencio.
- **`sync-mayor` dejó heartbeat huérfano** (retirado el 13-ago, su fila sigue en `cron_heartbeats`). No alerta, pero nadie lo barrió.
- **Boston arrastra 21 filas con saldo 0** en `switch_estadocuenta`. No mueve plata, contamina conteos.
- **Tests fallando pre-existentes:** `reclamos-itbms-rotulo-y-pendientes` (2 casos) y `catalogo-pedidos-ux-arreglos` (3 casos, huele a flaky).
- **`supabase/.temp/` no está en `.gitignore`** y se commitea.

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

# Lo que cambió después — 1 y 2 de septiembre de 2026

> Esta sección la mantiene el asistente al cierre de cada sesión. Lo de arriba es la foto del 31-ago tal cual la escribió Daniel; esto es el delta.

## Cerrado (ya en producción)

| tema | qué quedó |
|---|---|
| **Pendientes críticos del 31-ago** | ✅ Token de Supabase rotado por Daniel el 2-sep. El documento de $266M sigue siendo tarea suya en Switch. |
| **Asistencia** | Planilla con ciclo elegir rango → Generar → revisar → **Cerrar** (congelada, con reabrir). Calendario de un solo mes, primer clic elige el inicio, sugiere el día siguiente a la última quincena cerrada. **Hora extra arranca a los 10 min** (era 15) y **ya no se le resta el atraso**. Vacaciones encendida con el texto de la casilla arreglado. **Reporte pasó a ser la primera pestaña** (primero se ordena, después se paga). |
| **PDF de asistencia** | El pie se salía 213 mm de la hoja (jsPDF no corta solo) y una flecha `→` dejaba ilegible la línea entera de vacaciones. Arreglados los dos con candado. |
| **Reclamos** | ITBMS dice **7%** (era 7.7%): la tasa real aplicada sobre subtotal + importación. Ni un centavo cambia; verificado contra los 47 reclamos. |
| **Voseo** | 62 textos en 38 archivos pasaron a tuteo neutro. Candado `nada-de-voseo.test.ts`. «Decidilo vos» → «Tú decides». |
| **Gastos** | Switch cambió el formato del CSV el 1-sep (la cuenta llega con el nombre pegado). Se lee por el principio de la celda, y **un renglón ilegible ya no desaparece en silencio**: queda en `skip_details`, se ve en pantalla y avisa. Primera corrida verde esperada el 3-sep 10:35 UTC. |
| **Alertas** | Dos nuevas: «un sync trajo cero donde siempre trae cientos» y «un módulo dejó de recibir datos». Backtest de 96 días: 1 disparo, 0 falsas alarmas. Las ventas de ACS van al chat privado de Daniel (`enviarNegocioPrivado`), fuera del grupo de 3. |
| **Catálogo Reebok** | El sync inventaba `male`/`footwear` para todo. Ahora lee `rubro`/`subrubro`/`marca` de Switch vía `switch_articulo_info` (fichas por `/apiarticulos/info`, tope 400/corrida). Mapa por marca: **la marca manda la categoría** (FOOTWEAR/APPAREL/HARDWARE), el subrubro el género, y **UNISEX se desempata por el nombre** (`WOMEN` o `W` sola → Mujer, si no → Hombre). Medias = Ropa. 0 sin clasificar entre los 217 con existencia. |
| **Ventas › Clientes** | Tres defectos. (1) **Boston estaba dentro de `clientes_master`** (4.914 de 5.064 filas) y el ranking unía por nombre: City Mall David decía $227.872 y son **$113.936**. Boston fuera (soft delete), y el ranking une por **código** vía `(empresa_key, cliente_switch_id)`. (2) **Faltaba Joystep** en los filtros de empresa. (3) **El mostrador** se buscaba por nombre y encontraba 1 de 6: decía $25.835 y son **$54.478**. Los tres con migración aplicada por Daniel. |
| **Boston** | Sus **clientes** ya no se ven en ninguna superficie del grupo (ni por URL: `/api/clientes/<código>` contesta 404). Sus **ventas** siguen sumando en Vista General y Ventas › Resumen — decisión de Daniel: *«su plata suma, sus clientes no se ven»*. |
| **Acceso a Switch** | Las 8 URLs del panel están en `.env.local` (gitignored). Verificado login en las 8. Ya se puede consultar cualquier empresa al momento sin depender de crons ni de Analítica. |
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
| ¿Cómo trabajar? | **Mapear → definir juntos → ejecutar.** Nunca código antes de que él defina. Mockup de ahora/después solo cuando hace falta, visual, sin párrafos. |

## Pendientes vivos al 2-sep (los del 31-ago siguen salvo los marcados ✅)

- 🔴 El documento de $266M en Switch (Boston) — tarea de Daniel.
- **Ventas › Clientes «vs 2025» compara 8 meses contra 9** (corta el año anterior a fin de mes). Multi Fashion Holding dice +3% y es **+36%**. En arreglo el 3-sep.
- **1.363 fichas de Reebok** sin traer (artículos sin existencia). Drenan solas a 400/día.
- **4 reportes de Switch** que valdría la pena traer: cobros contra factura · renglones de Multifashion · ingresos varios · inventario a fecha. Ninguno urgente.
- **Documentación oficial de Switch** (14 PDFs) en digestión → `docs/switch-referencia.md`.
