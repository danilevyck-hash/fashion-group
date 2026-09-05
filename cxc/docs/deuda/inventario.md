# Inventario de deuda — lo que está muerto, lo que sobra y lo que está a medio hacer

**Medido el 5-sep-2026** contra producción (proyecto `rspocgqhtpveytgbtler`, Management API, solo lectura)
y contra el árbol de `src/` en la rama `main`.

> **Para qué existe este archivo.** No es una lista de cosas para borrar. Es la lista de las cosas
> que **engañan**: el archivo que alguien va a arreglar creyendo que cambia una pantalla, la tabla
> que alguien va a llenar creyendo que alguien la lee, el aviso que nunca puede salir. El repo ya se
> quemó tres veces con esto — un juego de filtros que nunca se dibujaba, una vista de tarjetas que
> jamás se pintó en ningún ancho, y una tabla de favoritos con cero filas cuyo endpoint le contestaba
> 403 al único rol que la vería.
>
> 🔴 **Nada de lo que está aquí se borra por estar aquí.** Al final hay un orden sugerido, y hay una
> sección aparte —«Lo que parece muerto pero NO se borra nunca»— con lo que guarda datos que no se
> pueden volver a conseguir.

---

## 0. Lo urgente primero

| # | Qué | Estado |
|---|---|---|
| 1 | **Recordatorios está caído en producción** — la pantalla contesta 500, y el aviso de cheques vencidos no sale | 🔴 roto hoy |
| 2 | **Ningún atajo de teclado funciona, el chequeo de sesión no ocurre y los contadores del 🔔 no cargan** — tres hooks que nadie monta. Y uno se «arregló» HOY | 🔴 no ocurre |
| 3 | `ventas_raw` (48.378 filas) **SÍ tiene lectores**; la documentación dice que no. Borrarla rompe las series históricas en silencio | 🔴 doc miente |
| 4 | ~46 caminos de «falta correr la migración» que **ya no pueden dispararse**, incluidos 13 banderines de pantalla | 🟠 engaña |
| 5 | **26** rutas API sin llamador (2 lo están *transitivamente*), y **3 cadenas completas** tabla→función→ruta→nadie | 🟠 engaña |
| 6 | `panamaDate()` copiado 4 veces con la técnica que el repo declara rota | 🟠 divergencia real |
| 7 | 8 tablas sin lector ni escritor · 2 archivos `.tsx` invisibles, uno por **colisión de nombre** | 🟡 peso |

✅ **Y una buena, dicha aparte:** el error de la **vista de tarjetas que jamás se pintó en ningún
ancho no se ha repetido** — cero cruces de breakpoint rotos, verificado por dos métodos
independientes (§9.10).

---

## 1. Recordatorios: roto en producción ahora mismo

**Es el único hallazgo que no es deuda sino avería.**

La única migración sin aplicar del repo es `20260925130000_recordatorios_rediseno.sql`, y el código
que ya está desplegado **cuenta con que corrió**.

⚠️ **Esto no es un descubrimiento: está escrito.** `CLAUDE.md:240` ya dice que la migración está
«**pendiente de aplicar**» y que «el código **no degrada** sin ella (la tolerancia a "falta el DDL"
se retiró de este módulo el 3-sep-2026, a propósito)». Lo que aporta esta medición es **qué significa
"no degrada" en la práctica**, que resultó ser más caro de lo que suena:

Evidencia — el `SELECT` real del módulo, corrido contra producción:

```
select id, fecha, texto, cliente, cliente_codigo, repeticion, hasta, destino,
       creado_por, created_at from recordatorios limit 1
→ ERROR 42703: column "hasta" does not exist
```

Columnas que la tabla tiene hoy: `id, fecha, texto, cliente, cliente_codigo, repeticion, deleted,
creado_por, created_at`. Faltan `hasta` y `destino`.

Y la red que lo cubría **se retiró a propósito**. `src/lib/recordatorios/server.ts:91`:

```ts
// Sin `try/catch` (tolerancia a DDL retirada): un error de la lectura LANZA.
```

Así que `GET /api/recordatorios` cae en su `catch` genérico y devuelve **`{"error":"Error interno"}`
con status 500** (`src/app/api/recordatorios/route.ts:46-49`) — no el aviso amable de «falta la
migración» que el módulo tiene escrito (`avisoMigracionRecordatorios`, nunca se alcanza).

**Daño colateral, más silencioso:** la misma migración agrega `cheques.aviso_vencido_en` y
`cheques.deleted_at`, que tampoco existen. El cron `cheques-alert` (14:15 UTC, 9:15 a.m. Panamá) los
usa en `src/lib/cheques-alert.ts:197-201`. Ahí **sí** hay `try/catch`, así que el cron no revienta:
se traga el error y sigue. El efecto es que **el aviso de cheques VENCIDOS nunca sale** y el cron se
anota `ok: true` con una nota escondida en `detail`. Es exactamente el modo de fallo que la regla 2
de alertas existe para evitar: se rompió y no avisa.

**Qué hacer:** correr `npm run migrar supabase/migrations/20260925130000_recordatorios_rediseno.sql`.
Es una migración, no un cambio de código.

---

## 2. Tablas: quién lee, quién escribe, cuántas filas

Método: por cada tabla de `public` se buscó en `src/` (sin tests) una referencia real —comentarios
borrados— por tres caminos: `.from("tabla")` literal, constante intermedia (`TABLA_VACACIONES`,
`cfg.ordersTable`), y **vista o función de la base que sí se llame** (`pg_depend` para las vistas,
`pg_get_functiondef` para las 88 funciones propias de la app, cruzado contra los `.rpc(...)` de
`src/`). Las filas son `count(*)` exacto, no la estimación de `pg_stat_user_tables` (que está vieja:
daba `ventas_raw` en 0 y `cheques` en 0).

### 2.1 🔴 Sin un solo lector NI escritor (ni directo, ni por vista, ni por RPC)

| Tabla | Filas | ¿Se recupera? | Nota |
|---|---:|---|---|
| `multifashion_tickets` | **15.819** | ⚠️ **probablemente sí** — ver nota | Congelada el 26-jul-2026 al retirar su cron. Ninguna vista, ninguna función, ninguna referencia. Cubre **2-may-2025 → 25-jul-2026**, y `switch_facturas` de `american_classic` cubre **7-may-2024 → hoy** (29.716 filas): la ventana del ticket cae **entera** dentro de lo que Switch ya tiene. Lo que se perdería es el **grano de ticket**, no la venta. **Decisión de Daniel, no borrar por las nuestras.** |
| `cxc_rows` | **1.097** | ❌ **NO** | CSV viejo. Retirada a propósito. Confirmada. |
| `multifashion_sync_log` | 98 | ✅ bitácora | Cero referencias en TODO el repo (ni scripts ni tests). La más limpia de retirar. |
| `mayor_importaciones` | 16 | ✅ bitácora | Mayor contable retirado. Confirmada. |
| `app_settings` | 7 | ⚠️ config a mano | Solo la lee `get_app_setting()`, que **nadie llama**. Las 2 menciones en `src/` son comentarios que dicen «no se tocó». |
| `cxc_uploads` | 6 | ✅ bitácora | Única mención en `src/` es un comentario en `integrity-checks.ts:387`. |
| `gastos_categorias` | 6 | ⚠️ config a mano | Traía `es_fijo` de la carga manual de gastos. Menciones = solo comentarios. |
| `empresa_gastos_mensuales` | 0 | — | Vacía y sin lectores. |

**Confirmadas como retiradas a propósito** (estaban en la lista conocida y se verificaron):
`cxc_rows` ✅ · `mayor_lineas` ✅ (1 lector residual, ver 2.3) · `mayor_importaciones` ✅ ·
`cxc_favorites` ✅ (0 filas, 0 lectores, solo el barrido que la vigila).

### 2.2 🔴 Dos que la documentación da por muertas y **están vivas**

**`ventas_raw` — 48.378 filas, CLAUDE.md dice «congelada, sin lectores en la app». Es falso.**

No tiene ningún `.from("ventas_raw")` en `src/`, y por eso parecía muerta. Pero la leen **cinco
funciones de la base que la app sí llama por RPC**:

| Función que la lee | ¿La llama `src/`? |
|---|---|
| `ventas_proyeccion_cierre_v6` / `_v7` | ✅ sí |
| `multifashion_detalle_mensual_v2` | ✅ sí |
| `multifashion_bonos_v3` | ✅ sí |
| `multifashion_overview_serie_v1` | ✅ sí |
| `_multifashion_retail_blend_sum` | ✅ (vía las de arriba) |

Es el **empalme histórico**: todas cortan en `DATE '2025-05-01'` y lo anterior sale de `ventas_raw`.
Verbatim de `ventas_proyeccion_cierre_v7`:

```sql
FROM ventas_raw WHERE fecha < DATE '2025-05-01'
```

y de `multifashion_overview_serie_v1`:

```sql
UNION ALL
SELECT fecha, subtotal FROM ventas_raw
WHERE empresa = 'american_classic' AND is_wholesale = false
```

🔴 **Borrarla rompe las series históricas de Ventas y de Multifashion en silencio** — no da error,
da números más chicos.

⚠️ **Un matiz medido, para no exagerar el riesgo ni subestimarlo.** Son **27.518 filas** anteriores
al corte (14-oct-2022 → 30-abr-2025). Esa ventana **no está vacía en Switch**: `switch_facturas`
arranca en 2022-10-14 (Boston), 2022-10-31 (Vistana), 2023-01/02 (el resto). O sea que el corte del
`2025-05-01` **no es «hasta aquí no hay datos de Switch»** — es un empalme que alguien eligió. Si esas
dos fuentes cuadran o no para ese período **nadie lo ha medido**, y es justo la clase de pregunta que
el libreto `numero-no-cuadra` existe para responder. Hasta que se mida: **`ventas_raw` es la fuente
declarada de ese tramo y no se toca.** Ver §10.

**`ventas_metas` — 7 filas, sin `.from()` en `src/`, pero viva.** La leen
`ventas_proyeccion_cierre_v6/v7` (que `src/` sí llama) como `metas_manuales`:

```sql
SELECT empresa AS nombre_display, meta::numeric AS meta_anual_manual
FROM ventas_metas WHERE anio = p_anio
```

Son las metas anuales escritas a mano. Sin ellas la proyección cae al valor calculado sin avisar.
**No hay ninguna pantalla en la app para escribirlas** — entran por SQL. Eso sí es deuda: un dato de
negocio sin puerta.

### 2.3 🔴 `directorio_clientes` — una cadena que parece viva en cada eslabón y termina en nada

Este es el ejemplo perfecto de por qué existe este archivo. La tabla se retiró hoy de la búsqueda
global, del selector de catálogos y de Recordatorios (los comentarios en
`src/app/api/search/route.ts:47` y `src/app/api/catalogo/[marca]/clientes-search/route.ts:4` lo dicen).

Quedó lo que parece un lector vivo, y **es el más visible de todos**: `home_dashboard_summary()` trae

```sql
'totalClientes', ( SELECT count(*) FROM directorio_clientes WHERE deleted = false )
```

o sea, el número de clientes del home. Y esa función **sí** se llama, desde
`src/app/api/home-stats/route.ts:43`.

🔴 **Pero `/api/home-stats` no lo llama nadie.** Cero apariciones de `home-stats` en `src/`,
`scripts/`, `tests/` y `vercel.json`. El home de hoy se arma con `/api/dashboard/vista-general` y
`/api/notification-badges`.

La cadena completa:

```
directorio_clientes (33 filas)
  → home_dashboard_summary()          ← existe, y lee la tabla
    → /api/home-stats                 ← existe, y llama la función
      → NADIE                         ← aquí se corta
```

Cada eslabón se ve sano por separado. Alguien que quisiera «arreglar el conteo de clientes del home»
tocaría los tres y no cambiaría nada en la pantalla.

**Conclusión:** `directorio_clientes` **sí** está totalmente retirada, y `/api/home-stats` +
`home_dashboard_summary()` se retiraron con ella sin que nadie lo anotara. Las 33 filas son la libreta
de contactos escrita a mano → **la tabla se queda** (ver §10), la ruta y la función se pueden retirar.

### 2.4 🔴 `cxc_contact_log` — 141 filas de historia que ya no se pueden ver

Misma forma, distinto módulo. La tabla tiene **141 filas** y una puerta bien hecha
(`src/lib/cxc/anotaciones.ts:108,120` → `/api/cxc/contact-log`). Lo que no tiene es quién toque esa
puerta: `src/app/cxc/hooks/useAdminData.ts:51`, verbatim:

> 🔴 La bitácora de contactos (`/api/cxc/contact-log`) ya NO se pide: nadie la dibujaba. Llegaba
> hasta la tabla y la tarjeta del celular como prop y ninguna de las dos la desestructuraba.
> Retirada el 14-ago-2026 junto con las opciones "Ya contacté" del menú.

Así que hoy **nada escribe y nada lee** esa bitácora, y las 141 filas —quién contactó a qué cliente
por su deuda, y cuándo— no se ven desde ninguna pantalla. Es información que escribieron personas:
**no se borra** (§10). Lo que hay que decidir es si se vuelve a dibujar o se da por cerrada.

### 2.5 🔴 `vendor_assignments` — 483 filas y un módulo entero (`lib/vendors.ts`) sin un solo consumidor

La tercera cadena de la misma forma, y la más completa: **el archivo entero está muerto.**

`src/lib/vendors.ts` exporta dos cosas y **nadie usa ninguna**:

```ts
export const VENDOR_MAP: Record<string, Record<string, string>> = {};   // línea 5 — nace vacío
export async function getVendorMap(companyKey?: string): Promise<VendorMap>   // línea 10
```

`VENDOR_MAP` es un objeto **vacío en el código fuente** que nada rellena a nivel de módulo, y
`getVendorMap()` —lo único que leería las 483 filas de `vendor_assignments`— **no se llama desde
ningún lado**. Búsqueda de `VENDOR_MAP|getVendorMap` en todo `src/` sin tests: tres apariciones, y
son la definición, la definición y un comentario que ya lo dice
(`src/app/cxc/hooks/useAdminData.ts:57`: «llenaba el objeto global `VENDOR_MAP`, que NINGUNA pantalla
lee»).

La cadena: `vendor_assignments` (483) → `getVendorMap()` → nadie · y `/api/vendors` (la ruta que
escribía) → nadie (§6.1).

Las 483 filas son la asignación cliente→vendedor de la era anterior a que el vendedor viniera en
`switch_facturas.vendedor_nombre`. **La tabla se queda** (§10); `lib/vendors.ts` y la ruta se pueden
retirar.

### 2.6 🟡 Otras correcciones a la documentación

- **`mayor_lineas` (135 filas) todavía tiene un lector en la app:** `src/lib/cuentas/leer.ts:117`.
  Además cuelgan de ella la vista `mayor_gastos_mensual_v` (sin lectores) y la función
  `mayor_reemplazar_mes()` (sin llamador). El módulo está retirado; el hilo no se cortó del todo.
- **`asistencia_planilla_guardada` y `_linea` siguen en 0 filas**: nunca se cerró una quincena. No es
  deuda —el código está listo— pero conviene saberlo antes de tocar el cierre.

### 2.7 Vistas y funciones sin llamador

**Vistas sin una sola referencia en `src/`** (3 de 20):

| Vista | Nota |
|---|---|
| `mayor_gastos_mensual_v` | Cuelga del mayor retirado. |
| `switch_costo_unificado_vw` | La reemplazó `switch_costo_unificado_v2` (migración `20260915120000`, aplicada). **La vieja se queda corta en el costo de las notas de débito** — comparadas las dos definiciones: la vieja suma `switch_articulo_diario` entera, y esa tabla **no trae las ND**; la v2 excluye `tipo = 'ND'` de ahí y **suma el costo de las ND desde `switch_factura_utilidad`**. Es la diferencia que dio el costo negativo de Active Wear en agosto. Dejar las dos con casi el mismo nombre y una corta es una trampa para el próximo que busque «costo unificado». |
| `egresos_varios_mensual_v` | Sin lectores. |

**Funciones propias sin llamador** (3 de 88 — el resto son triggers o están encadenadas):

- `mayor_reemplazar_mes()` — mayor retirado.
- `ventas_meta_sugerida_v2()` — la meta sugerida ya no se ofrece.
- `proyeccion_mensual_mayorista_v1()` — reemplazada por `ventas_proyeccion_cierre_v6/v7`.

(Se descartaron 188 funciones más que son internas de la extensión `btree_gist`, no de la app.)

---

## 3. Migraciones: una sola sin aplicar, y mucha documentación vieja

Comparado `supabase/migrations/` (332 archivos con timestamp + 52 sin timestamp, más viejos) contra
`supabase_migrations.schema_migrations` (**304 registradas**).

### 3.1 La única pendiente

```
20260925130000_recordatorios_rediseno.sql
```

Qué queda apagado por eso: **el módulo Recordatorios entero (500) y el aviso de cheques vencidos**.
Ver §1.

### 3.2 Aplicadas hoy, confirmadas

`20260925120000` (préstamos: dos cuentas y tope) · `20260926120000` (clientes_master contacto) ·
`20260927120000` (cxc envíos canal) · `20260928120000` (aging Boston tramos finos). Las cuatro están
en `schema_migrations`.

### 3.3 🔴 CLAUDE.md dice «pendiente de aplicar» sobre cuatro que **ya corrieron**

Esto importa porque el código todavía trae la red por si faltan, y la red ya no puede activarse:

| Migración | CLAUDE.md dice | Realidad |
|---|---|---|
| `20260918120000_guias_destino_cliente` | «⚠️ migración pendiente» | **aplicada** (`el_de_siempre` y `tiendas` existen) |
| `20260921120000_carga_history_archivo` | «pendiente de aplicar» | **aplicada** (`archivo_path`, `archivo_nombre` existen) |
| `20260919120000_clientes_master_ausente` | «migración pendiente» | **aplicada** (`ausente_desde` existe) |
| `20260924120000_borrar_pedidos_de_prueba` | «pendiente de aplicar» | **aplicada** |

Consecuencia práctica: la precedencia de destinos de guías ya **no** necesita la constante
`DESTINOS_DEFINIDOS` como red, el Historial del Depurador ya guarda archivo, y los pedidos de prueba
ya se borraron.

---

## 4. Tolerancia a DDL que ya corrió

Se extrajeron **las 64 migraciones nombradas dentro del código** (`\d{14}_nombre`) y se cruzaron con
`schema_migrations`.

> **Resultado: 63 de 64 ya están aplicadas.** La única que no es `20260925130000_recordatorios_rediseno`.

O sea: **casi toda la tolerancia a «falta el DDL» que hay en el repo es código que no puede
ejecutarse.** No es peso muerto inofensivo — cada rama de esas produce un aviso en pantalla que
nunca puede salir, y cualquiera que lea el código va a creer que ese estado es posible.

### 4.1 Las 22 constantes `MIGRACION_*` — todas apuntan a migraciones aplicadas

| Constante | Archivo | Migración | Estado |
|---|---|---|---|
| `MIGRACION_CONFIGURACION` | `lib/asistencia/config.ts:636` | `20260806160000` | ✅ aplicada |
| `MIGRACION_PLANILLA` | `lib/asistencia/planilla-server.ts:17` | `20260806220000` | ✅ |
| `MIGRACION_AGENTE` | `lib/asistencia/agente.ts:39` | `20260806200000` | ✅ |
| `MIGRACION_BAJAS` | `lib/asistencia/vigencia.ts:400` | `20260807120000` | ✅ |
| `MIGRACION_CORRECCIONES` | `lib/asistencia/correcciones.ts:39` | `20260813150000` | ✅ |
| `MIGRACION_SERVICIO_PROFESIONAL` | `lib/asistencia/participacion.ts:134` | `20260813120000` | ✅ |
| `MIGRACION_SEGUROS` | `lib/asistencia/seguros.ts:117` | `20260825120000` | ✅ |
| `MIGRACION_PERMISO_HORAS` | `lib/asistencia/permiso-horas.ts:137` | `20260825140000` | ✅ |
| `MIGRACION_VACACIONES` | `lib/asistencia/config-server.ts:462` | `20260825160000` | ✅ |
| `MIGRACION_SALDO_VACACIONES` | `lib/asistencia/saldo-vacaciones.ts:589` | `20260826040000` | ✅ |
| `MIGRACION_SALDO_MEDIOS_DIAS` | `lib/asistencia/saldo-vacaciones.ts:593` | `20260826060000` | ✅ |
| `MIGRACION_NO_MARCA_RELOJ` | `lib/asistencia/sueldo-fijo.ts:126` | `20260826080000` | ✅ |
| `MIGRACION_BASE_SEGUROS` | `lib/asistencia/seguros-base.ts:206` | `20260826120000` | ✅ |
| `MIGRACION_APROBACIONES` | `lib/asistencia/aprobaciones.ts:58` | `20260829120000` | ✅ |
| `MIGRACION_REPARTO` | `lib/asistencia/reparto.ts:294` | `20260901120000` | ✅ |
| `MIGRACION_AMARRE_PRESTAMOS` | `lib/asistencia/prestamos-planilla.ts:69` | `20260902120000` | ✅ |
| `MIGRACION_PRESTAMO_APROBADO` | `lib/asistencia/prestamos-planilla.ts:71` | `20260902130000` | ✅ |
| `MIGRACION_PLANILLA_GUARDADA` | `lib/asistencia/planilla-guardada.ts:76` | `20260904120000` | ✅ |
| `MIGRACION_CITY_MALL` | `lib/guias/reglas-city-mall.ts:23` | `20260809120000` | ✅ |
| `MIGRACION_NOMBRES_EXACTOS` | `lib/guias/reglas-nombres-exactos.ts:21` | `20260810120000` | ✅ |
| `MIGRACION_NOTAS` | `lib/marketing/notas-proveedor-server.ts:34` | `20260808120000` | ✅ |
| `MIGRACION_RECORDATORIOS` | `lib/recordatorios/recordatorio.ts:67` | `20260824120000` | ✅ |

Columnas verificadas una por una en producción: `asistencia_personas` tiene
`servicio_profesional, paga_seguros, saldo_vacaciones_dias, saldo_vacaciones_corte, no_marca_reloj,
seguros_base_quincena, fecha_salida`; `asistencia_justificaciones` tiene `hora_desde, hora_hasta`;
`guias_destino_cliente` tiene `el_de_siempre, tiendas`; `comision_exclusion` tiene
`excluye_venta, excluye_cobro`; `clientes_master` tiene `ausente_desde, telefono, email`;
`carga_history` tiene `archivo_path, archivo_nombre`; `cxc_emails_enviados` tiene `canal`.

### 4.2 Los 24 detectores de tabla/columna ausente

Todos vivos en el código, todos para DDL que ya corrió:

```
lib/asistencia/config.ts:662            esTablaFaltante
lib/asistencia/participacion.ts:160     esColumnaServicioProfesionalFaltante
lib/asistencia/permiso-horas.ts:157     esColumnaPermisoHorasFaltante
lib/asistencia/seguros.ts:142           esColumnaPagaSegurosFaltante
lib/asistencia/seguros-base.ts:235      esColumnaBaseSegurosFaltante
lib/asistencia/saldo-vacaciones.ts:621  esColumnaSaldoVacacionesFaltante
lib/asistencia/vigencia.ts:426          esColumnaDeBajaFaltante
lib/asistencia/sueldo-fijo.ts:151       esColumnaNoMarcaRelojFaltante
lib/asistencia/agente.ts:62             esColumnaFaltante
lib/guias/destinos-config-server.ts:37  esTablaAusente
lib/marketing/periodos-io.ts:90,108     esTablaAusente / esFaltaDeTablas
lib/contable/tabla-ausente.ts:29        esTablaAusente
lib/cxc/cartera.ts:76                   esErrorSinColumnaCartera   (ya sin uso — lo dice el comentario)
lib/clientes/columna-codigo-opcional.ts:36  esColumnaFaltante
lib/multifashion/productos-lectura.ts:72    esFuncionAusente
lib/recordatorios/recordatorio.ts:459   esTablaRecordatoriosFaltante  ← el único que HOY sí podría servir, y no se usa (§1)
api/cxc/envios/route.ts:45              faltaColumnaCanal
api/cxc/aging/route.ts:71               faltaColumnaContacto
api/clientes/[codigo]/route.ts:197      faltaColumnaContacto        ← duplicado del anterior, ver §8
api/asistencia/vacaciones/route.ts:50   faltaLaTabla
api/catalogo/[marca]/vendedores-switch/route.ts:30  esColumnaAusente
api/catalogo/[marca]/clientes-switch/route.ts:21    esColumnaAusente  ← duplicado del anterior
api/ventas/comisiones/exclusiones/route.ts:111      (inline, comision_exclusion)
api/guias/destinos-config/route.ts:48               (inline, guias_destino_cliente)
```

### 4.3 Los avisos que nunca pueden salir

Asistencia renderiza **13 banderines** de «falta correr la migración», y **ninguno puede
aparecer** porque las 13 migraciones están aplicadas:

| Archivo | Líneas | Cuántos |
|---|---|---:|
| `PlanillaTab.tsx` | 852, 1033, 1082, 1087, 1111, 1117, 1145, 1150, 1155, 1160 | **10** |
| `ConfiguracionTab.tsx` | 706 | 1 |
| `EstadoReloj.tsx` | 157 (y la línea 131, que además **deshabilita el botón** «pedir marcaciones») | 1 |
| `AprobacionesTab.tsx` | 330 | 1 |

Es el caso exacto por el que existe este archivo: pantalla que alguien podría estar «arreglando» sin
que nada cambie nunca.

---

## 5. Archivos de más de 800 líneas

El límite de la casa es 800 (`.claude/rules/common/coding-style.md`). **47 archivos lo pasan.**

| Líneas | Archivo |
|---:|---|
| 2.190 | `src/lib/asistencia/planilla.ts` |
| 2.119 | `src/lib/cron-telemetry.ts` |
| 2.035 | `src/app/asistencia/PlanillaTab.tsx` |
| 1.874 | `src/lib/catalogo/marcas-ui.tsx` |
| 1.810 | `src/app/asistencia/ConfiguracionTab.tsx` |
| 1.615 | `src/lib/ventas/resumen-articulo.ts` |
| 1.541 | `src/components/multifashion/ProductosSubtab.tsx` |
| 1.480 | `src/lib/marketing/zip-marca.ts` |
| 1.469 | `src/components/catalogo/PedidoDetalleClient.tsx` |
| 1.420 | `src/app/productos/cargar/DepuradorClient.tsx` |
| 1.416 | `src/lib/switch-api/client.ts` |
| 1.408 | `src/lib/marketing/zip-export.ts` |
| 1.325 | `src/app/packing-lists/PackingListsClient.tsx` |
| 1.322 | `src/app/marketing/mobiliario/page.tsx` |
| 1.307 | `src/components/ui.tsx` |
| 1.305 | `src/components/ventas/ProductosView.tsx` |
| 1.268 | `src/app/api/cron/switch-reconciliacion/route.ts` |
| 1.211 | `src/lib/marketing/inventario.ts` |
| 1.181 | `src/app/guias/components/GuiaForm.tsx` |
| 1.168 | `src/lib/switch-api/sync-empresa.ts` |
| 1.122 | `src/components/marketing/EntregaForm.tsx` |
| 1.110 | `src/components/ventas/ResumenView.tsx` |
| 1.078 | `src/lib/depurador/logic.ts` |
| 1.066 | `src/app/catalogos/admin/[marca]/ProductosBatch.tsx` |
| 1.055 | `src/app/productos/cargar/ReebokClient.tsx` |
| 1.029 | `src/app/guias/components/GuiasList.tsx` |
| 1.028 | `src/lib/database.types.ts` |
| 1.021 | `src/components/ventas/ClientesView.tsx` |
| 986 | `src/lib/switch-api/sync-catalogo.ts` |
| 978 | `src/components/multifashion/MultifashionResumenView.tsx` |
| 978 | `src/app/marketing/components/FacturasSection.tsx` |
| 956 | `src/lib/switch-api/web-client.ts` |
| 917 | `src/components/marketing/FacturaForm.tsx` |
| 905 | `src/app/cxc/page.tsx` |
| 900 | `src/components/multifashion/ClientesMultifashionSubtab.tsx` |
| 893 | `src/components/ventas/ResumenViewMobile.tsx` |
| 885 | `src/app/api/cron/backup/route.ts` |
| 871 | `src/components/catalogo/CatalogoVendedorPage.tsx` |
| 866 | `src/components/catalogo/ComprobantesPanel.tsx` |
| 865 | `src/lib/marketing/impulsadoras.ts` |
| 850 | `src/lib/parse-packing-list.ts` |
| 843 | `src/lib/asistencia/reporte.ts` |
| 836 | `src/app/reclamos/components/ReclamoDetail.tsx` |
| 824 | `src/lib/marketing/mutations.ts` |
| 819 | `src/app/marketing/components/RegistrarGastoModal.tsx` |
| 811 | `src/app/productos/cargar/FacturasTiendaClient.tsx` |
| 810 | `src/app/api/asistencia/planilla/route.ts` |

⚠️ **El tamaño solo no es deuda.** Varios de estos son grandes porque llevan el post-mortem adentro
en comentarios, que es una decisión deliberada de la casa. Los que sí preocupan son los que mezclan
varias pantallas en un archivo: `PlanillaTab.tsx` (2.035), `ConfiguracionTab.tsx` (1.810),
`marcas-ui.tsx` (1.874) y `DepuradorClient.tsx` (1.420) — de ahí salen las pestañas que ya son
módulos distintos.

---

## 6. Rutas API sin llamadores

**275 rutas** bajo `src/app/api/**`. Método: dos búsquedas por ruta como mínimo — path completo con
los segmentos dinámicos expandidos, y **sufijo**, porque el 80% de las llamadas de catálogo se arman
con una base (`theme.api = "/api/catalogo/reebok"` + `` `${theme.api}/orders` ``). El pase por sufijo
rescató 20 falsos positivos; un pase inverso —rutas cuyo único match era un comentario— sacó 4
huérfanas que la búsqueda literal daba por vivas.

| Categoría | Rutas |
|---|---:|
| Llamada desde la app | 215 |
| Cron (en `vercel.json`) | 32 |
| Pública / entrada externa (sin llamador a propósito) | 4 |
| **Huérfana** | **24** (26 contando las transitivas — §9.3) |

Las 4 públicas no son huérfanas: `/api/asistencia/ingest` (lo empuja el reloj), `/api/health-crons`
(healthcheck externo con `HEALTHCHECK_TOKEN`), `/api/diag/canales-telegram` y
`/api/diag/egresos-varios` (curl a mano con `CRON_SECRET`). Las cuatro están declaradas en
`src/middleware.ts` como prefijos sin cookie.

✅ **La biyección `vercel.json` ↔ `src/app/api/cron/*` es perfecta: 32 caminos y 32 archivos**, sin
sobrantes de ningún lado. (Son **82 entradas** en `vercel.json` sobre esos 32 caminos — varias
entradas del mismo path, que es la regla de la casa: una entrada = una ocurrencia al día.) El candado
`cron-registro.test.ts` está haciendo su trabajo.

### 6.1 Restos de retiros que el propio código documenta (las 3 más seguras)

| Ruta | Qué hacía | Evidencia |
|---|---|---|
| `/api/cxc/contact-log` | Bitácora de contactos de cobro | `useAdminData.ts:51`: «ya NO se pide… Retirada el 14-ago-2026» |
| `/api/vendors` | Llenaba `VENDOR_MAP` | `useAdminData.ts:56`: «NINGUNA pantalla lee». `VENDOR_MAP` (`lib/vendors.ts:5`) es un objeto **vacío** |
| `/api/upload` | Frescura de CXC por empresa | Mismo comentario: «se desestructuraba y no se usaba en una sola línea» |

### 6.2 Las otras 21 huérfanas

**CXC, era `cxc_rows`:** `/api/clients` (SELECT * crudo del aging) · `/api/cxc-summary` (KPIs de
cartera sumados a mano). La cartera viva se lee por `/api/cxc/aging`.

**Ventas, el camino `v2` que nunca se conectó:** `/api/ventas/v2` · `/api/ventas/v2/status` ·
`/api/ventas/años`. La pantalla usa `/api/ventas/resumen`.

**Marketing:** `/api/marketing/marca-resumen` (la pantalla usa `/inicio`) ·
`/api/marketing/periodos` y `/api/marketing/periodos/[id]` (el listado real sale de
`/proyectos-lista`) · `/api/marketing/proyectos/[id]/marcas` (la app solo escribe
`facturas/[id]/marcas`) · `/api/marketing/mobiliario/notas-proveedor/upload-url` (las subidas van por
`/api/marketing/adjuntos/upload-url`).

**Reclamos, tres exports que nadie ofrece:** `/api/reclamos/export` (CSV) ·
`/api/reclamos/export-excel` · `/api/reclamos/proveedor/[empresa]/export-excel`. De esa carpeta sí se
usan `export-zip` y `export-pdf`; **el Excel no.**

**Catálogos, restos previos al refactor `[marca]`:** `/api/catalogo/reebok/stats` ·
`/api/catalogo/reebok/inventory/bulk` (carga masiva por CSV) · `/api/catalogo/reebok/pedidos-publicos`
(la lista viva es `${theme.api}/pedidos-unificado`) · `/api/catalogo/joybees/seed` (su hermana
`joybees/import` **sí** se llama).

**Sueltas:** `/api/home-stats` (ver §2.3) · `/api/activity-logs` · `/api/cheques/[id]/historial` ·
`/api/user/module-order` (el orden personalizado de módulos del home — la tabla
`fg_user_module_order` tiene 3 filas y nadie las lee).

### 6.3 ⚠️ Antes de borrar cualquiera de estas

**Diez huérfanas están importadas por candados** y borrarlas rompe tests a propósito:
`reebok/stats`, `cxc-summary`, `cxc/contact-log`, `marca-resumen`, `notas-proveedor/upload-url`,
`marketing/periodos`, `reclamos/export`, `upload`, `vendors`, `ventas/v2`. Varios son candados de
Boston (`boston-no-se-mezcla`, `cxc-boston-fuera-de-toda-superficie`) que las listan **justamente
para exigir que no mezclen Boston** — retirar la ruta obliga a tocar el candado a conciencia, no de
pasada. Y `/api/vendors` está en `scripts/_mutar-candados-cxc-clientes.sh:136`: su ausencia ya es una
regla probada por mutación.

---

## 7. Los interruptores, y cuánto valen hoy

### 7.1 Los dos de verdad — los dos ENCENDIDOS, los dos vivos

| Nombre | Archivo:línea | Valor HOY | Qué prende / qué apaga |
|---|---|---|---|
| `GUIAS_ATAJOS_NUEVOS` | `lib/guias/atajos-facturas.ts:39` | **`true`** | **Prende:** el panel «Facturas del cliente» al crear una guía, los botones de destino bajo el campo dirección, el autollenado del «de siempre», la **pestaña Configuración** de `/guias` (`page.tsx:124`), el refresco de facturas al abrir Guías, «Traslado» como factura válida (`guia-form-logic.ts:138`) y los destinos de `/api/guias/frecuencias`. **Apaga:** el formulario vuelve exacto al de antes y la pestaña Configuración desaparece. **No cambia lo que se guarda.** |
| `VE_SUELDOS_DE_BOSTON` | `lib/boston/rol.ts:103` | **`true`** | Se lee en **un solo lugar** (`planillaSinDinero()`, línea 113). **Prende:** David (`gerente_boston`) ve la planilla de Boston completa — el bloque `dinero`, los `totales` y la aprobación de préstamo. **Apaga:** el servidor corta antes y los sueldos no viajan. El recorte va en el SERVIDOR. |

🔴 **Ninguno de los dos se retira.** `GUIAS_ATAJOS_NUEVOS` es exactamente el caso que Daniel pidió
—probar en producción con su secretaria y poder revertir— y `VE_SUELDOS_DE_BOSTON` está en `true`
por decisión suya del 3-sep-2026, con el mecanismo conservado a propósito. Son reversibles en una
línea; eso es lo que valen.

> Nota de diseño que conviene copiar: `planillaSinDinero()` **deriva** de la constante en vez de
> repetir la condición. Es el patrón correcto.

### 7.2 Los 8 interruptores por marca (`theme.features`, `lib/catalogo/marcas-ui.tsx:209`)

Valores en Reebok 547 · Joybees 880 · Tommy 1206 · Calvin 1552.

| Bandera | Reebok | Joybees | Tommy | Calvin |
|---|:--:|:--:|:--:|:--:|
| `preorder` | ✅ | — | — | — |
| `agrupacionPorModelo` | — | ✅ | — | — |
| `inventarioPorTalla` | ✅ | — | — | — |
| `categoryChips` | ✅ | — | ✅ | ✅ |
| `filtroBultos` | — | — | ✅ | ✅ |
| **`filtroPrecio`** | ✅ | ✅ | ✅ | ✅ |
| `roleClienteGuard` | ✅ | — | — | — |
| `navInicioRequiereRol` | ✅ | — | — | — |

**`filtroPrecio` dejó de ser un interruptor:** está en `true` en las cuatro marcas y trae escrito
«⚠️ No volver a apagarlo por la medición de jul-2026» (Daniel lo revirtió a mano el 24-ago-2026
contra una medición nuestra). Las otras siete son configuración legítima por marca, no deuda.

### 7.3 Lo que NO es un interruptor (para que nadie lo busque)

- **No hay un solo feature flag por variable de entorno.** Las 41 `process.env.*` del repo son
  credenciales, secretos y variables de Vercel. Las únicas dos que gatean algo (`RUN_DB_TESTS`,
  `PGLITE_DIR`) solo aplican en tests.
- `NUNCA_SILENCIAR` (`cron-telemetry.ts:417`) es una lista de excepción de alertas.
- Los ~20 bloques «si la DDL no corrió, cae a la versión anterior» (comisiones v8→v7→v6→v5, aging,
  envíos de CXC, marketing) son **tolerancias de despliegue**, no interruptores — y hoy están todas
  muertas (§4).

---

## 8. Duplicación real de reglas de negocio

Ordenado por riesgo de que alguien arregle la copia equivocada.

### 8.1 🔴 `panamaDate()` — cuatro copias, con la técnica que el propio repo declara rota

| Copia |
|---|
| `src/app/api/cron/switch-sync/route.ts:72` |
| `src/app/api/cron/switch-articulos/route.ts:30` |
| `src/app/api/cron/switch-reconciliacion/route.ts:161` (el comentario admite que replica a las otras) |
| `src/app/api/admin/sync-now/route.ts:77` |

Cuerpo idéntico en las cuatro:

```ts
const panama = new Date(now.toLocaleString("en-US", { timeZone: "America/Panama" }));
panama.setDate(panama.getDate() + offsetDays);
return panama.toISOString().slice(0, 10);
```

**Diverge de verdad — comprobado ejecutándolo** con el instante `2026-09-06T02:30:00Z`:

```
TZ=UTC             -> 2026-09-05     (igual que la canónica)
TZ=America/Panama  -> 2026-09-06     ← un día entero de diferencia
```

Coincide en producción **solo** porque Vercel corre en UTC. Y lo grave:
`src/lib/cheques-aviso-ventana.ts:58` documenta esta misma técnica como el bug que ya se arregló
ahí — *«El truco viejo (toLocaleString + new Date()) dependía de la zona del SERVIDOR y se corría de
día cerca de la medianoche»*. Sigue vivo en los cuatro crons que definen **la ventana de fechas que
se le pide a Switch**.

**Copia buena:** `hoyPanama()` en `src/lib/fecha-panama.ts:10` (usa `Intl.DateTimeFormat`, no depende
de la zona del servidor).

### 8.2 🔴 `CURRENT_DATE` (UTC) contra `multifashion_hoy_panama()` en SQL vivo

- `20260517000000_multifashion_dia_a_dia_v4.sql:66, 84, 227` — `to_char(CURRENT_DATE,'YYYY-MM-DD')`
  como el «hoy» que sale a pantalla. **Es la última versión de `multifashion_dia_a_dia`.**
- `20260606040000_multifashion_funcs_solo_switch.sql:145, 147, 326, 555, 578` — `es_parcial`,
  `v_is_mes_actual` y la **elegibilidad de bonos**.

De 19:00 a medianoche de Panamá `CURRENT_DATE` ya es mañana. La migración `20260731120000:30`
documenta este bug exacto y lo arregló **solo** en `multifashion_mensual_v7` y `detalle_mensual`,
dejando `dia_a_dia_v4` y `bonos_v3` sin tocar. El candado `mismos-dias-todas-las-comparaciones.test.ts`
solo cubre las funciones que nombra, así que estas dos quedan fuera de su alcance.

### 8.3 🟠 `diaPanama` — dos funciones, mismo nombre, tipos incompatibles

| Archivo:línea | Firma |
|---|---|
| `lib/asistencia/reporte.ts:357` | `diaPanama(iso: string)` |
| `lib/guias/pendientes-aviso.ts:43` | `diaPanama(ahora: Date)` |
| `lib/multifashion/productos-ranking.ts:385` | copia privada de la segunda |
| `lib/clientes-ytd.ts:58` | `ymdPanama(iso: string)` — cuerpo idéntico a la primera, otro nombre |

Dan el mismo resultado con el tipo correcto. **Pasarle un `Date` a la de asistencia da `Invalid Date`
en silencio** — la clase de import equivocado que TypeScript no atrapa cuando el valor llega como
`any` desde una respuesta. Además, `const PANAMA_OFFSET_MS = 5 * 60 * 60 * 1000` está repetido en 5
módulos.

### 8.4 🟠 El signo del negativo: DOS convenciones en producción

~25 formateadores de moneda locales, y **dan salidas distintas para el mismo número**:

| Convención | Dónde |
|---|---|
| `-$1,234.50` (signo **fuera**) | `cxc/components/EstadoCuentaDrawer.tsx:39` · `lib/cxc/estado-cuenta-email.ts:43` · `lib/pdf-estado-cuenta.ts:10` · `vista-general/formato.ts:7` |
| `$-1,234.50` (signo **dentro**) | `components/ui.tsx:567` · `lib/ventas/format.ts:7` · `ventas/ReferenciaTarjeta.tsx:91` · `switch-api/monto-guard.ts:391` · `gastos-contabilidad/.../saldos/types.ts:77` |

`vista-general/formato.ts:7` además redondea a **0 decimales** donde el resto usa 2. Y
`monto-guard.ts:390` lleva el comentario «Un solo lugar» siendo una de diez.

Se ve donde hay negativos reales: notas de crédito en Ventas, «saldo a favor» en CXC, y **el estado
de cuenta que se le manda al cliente por correo**. Copia buena: `fmt()` en `src/lib/format.ts:1`.

### 8.5 🟠 Fecha en pantalla: ~25 arrays de meses a mano, con dos grafías

`fmtDate()` (`lib/format.ts:14`) da el formato de la casa `"5 sep 2026"` y lo importan 75 archivos.
Aun así hay ~25 arrays de meses escritos a mano, en minúscula (asistencia ×6, `packing-lists`,
`vista-general`, `RangoFechas`, las 4 rutas de `api/ventas`…) y capitalizada (`VentasShell.tsx:438`,
`ComisionesPeriodo.tsx:26`, `home-stats/route.ts:76`).

**Divergencia concreta:** `lib/reclamos/pdf-bulk.ts:110` usa `toLocaleDateString("es-PA")` sin
opciones → imprime **`5/9/2026`** en el PDF que se le manda al proveedor, mientras todo el resto del
sistema dice `5 sep 2026`.

### 8.6 🟡 Paginación: 5 bucles a mano sin la segunda defensa

`leerTodoPaginado` (`lib/supabase-paginado.ts:70`) exige **dos** defensas: orden estable **y**
verificación contra `count: "exact"` que falle ruidosamente. Lo usan 47 archivos. Cinco rutas
escriben el bucle a mano y **ninguna trae la verificación** — si se pierde una página siguen con
datos a medias en silencio, que es el bug exacto que el helper vino a matar:

| Archivo:línea | Tabla |
|---|---|
| `api/cxc/ultima-compra/route.ts:48` | `switch_facturas` |
| `api/cxc/ultimo-pago/route.ts:63` | `switch_recibos` |
| `api/cxc/boston/route.ts:47, 78, 109` | aging Boston · `switch_ultimo_pago_cliente_v2` (1.947) · `switch_clientes` Boston (4.915) |
| `api/boston/inicio/route.ts:59` | aging Boston |
| `api/boston/clientes/route.ts:75` | aging Boston |

El orden sí está pensado y justificado en comentarios: la defensa 1 está, la 2 no. (Las dos de
`sync-recibos.ts` están declaradas deuda a propósito en el encabezado del helper, líneas 39-46 — ésas
no cuentan.)

### 8.7 🟡 `hoyISO()` y `hoy()` que usan la hora del SERVIDOR

- `lib/switch-api/web-client.ts:394` — `hoyISO()` arma la fecha con `getFullYear/getMonth/getDate`
  locales; en Vercel eso es **UTC, no Panamá**. Se usa en la línea 448 para el `desde`/`hasta` del
  reporte web de Switch. Hoy no muerde porque los crons de login web corren después de las 05:00 UTC;
  una corrida manual de noche, o un cron movido antes de las 05:00, **pide el día equivocado**.
- `lib/pdf-estado-cuenta.ts:18` — `hoy()`, con el comentario «fecha LOCAL, no UTC (si no, de
  madrugada adelanta un día)». Está **al revés para dos de sus tres llamadores**:
  `api/cxc/enviar-email/route.ts:34` y `api/cxc/cobrar-lote/route.ts:44` corren en el SERVIDOR, donde
  local **es** UTC. El tercero (`HojaCobrar.tsx:126`) corre en el navegador, en Panamá, y ahí sí
  funciona. Misma función, dos caminos, uno bien y uno mal.

### 8.8 🟡 Roles: 167 arrays literales contra 98 usos de constante

Casos donde la constante ya existe y nadie la usa:

- **`ROLES_LECTURA_METAS`** (`lib/multifashion/metas-permiso.ts:49` = `["admin","secretaria","gerente_acs"]`)
  — ocho rutas de Multifashion escriben ese trío a mano (`retail-recurrentes:21`, `vendedoras:35`,
  `caja:47`, `fidelizacion:67`, `clientes-wholesale:23`, `detalle-mensual:28`, `bonos:25`,
  `productos:148`). Dos le agregan `contabilidad`: `overview:22` (justificado) y **`venta-hoy:27`**,
  cuyo único consumidor visible es `VentaHoyCard`, del módulo Multifashion, que contabilidad no
  tiene → **vale la pena que Daniel lo confirme**.
- **`SEARCH_ROLES`** (`components/SearchBar.tsx:44`) dice de sí misma «Roles admitidos por
  /api/search», pero `api/search/route.ts:57` reescribe la lista a mano **en otro orden**, y
  `api/home-stats/route.ts:27` y `api/notification-badges/route.ts:12` la escriben una tercera y
  cuarta vez. Si mañana se agrega un rol al servidor, la caja de búsqueda sigue escondida; si se
  agrega solo a la constante, la caja aparece y devuelve 403.

Contraejemplo de cómo se hace bien: Préstamos usa `[...PRESTAMOS_ROLES]` y Recordatorios
`[...RECORDATORIOS_ROLES]` en todas sus rutas.

### 8.9 🟢 `normalizeStr` de Caja — 4 copias byte-idénticas

`caja/components/GastoForm.tsx:49` · `caja/hooks/useCajaState.ts:7` · `api/caja/gastos/route.ts:5` ·
`api/caja/gastos/[id]/route.ts:12`. Las cuatro: `t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()`.
Hoy dicen lo mismo. Normalizan el campo «responsable»: si alguien cambia la del cliente sin cambiar
las dos del servidor, el mismo responsable se guarda con dos grafías y deja de agruparse. Ninguna
vive en `src/lib`.

### 8.10 🟢 Los cuatro módulos de catálogo, clonados por marca

`{reebok,joybees,tommy,calvin}-pedido-publico-validate.ts` · `-pedido-rate-limit.ts` · `-bulto.ts` ·
`-order-total.ts` · `-logo.ts` · `-gender.ts`: cuatro juegos con las mismas constantes
(`PEDIDOS_MAX = 5`, `PEDIDOS_WINDOW_MIN = 10`, `MAX_ITEMS = 200`, `MAX_QUANTITY = 500`). Deuda
estructural conocida, y `MARCA_THEME` ya es el patrón de salida. **No urgente:** el diseño contempla
que difieran por marca y hoy nada diverge de forma peligrosa.

### 8.11 ✅ Lo que YA está bien consolidado (verificado, no supuesto)

- **Guard de montos imposibles:** una sola implementación (`switch-api/monto-guard.ts` +
  `monto-guard-io.ts`), 18 módulos la importan. **Las 13 copias se fueron.**
- **Saldo de préstamos:** un solo lugar (`lib/prestamos-saldo.ts`), 17 archivos lo importan. **Las 8
  copias se fueron.**
- **Listas de empresas:** derivadas de `B2B_EMPRESA_KEYS` / `ALL_EMPRESA_KEYS`
  (`lib/empresa-mapping.ts:87,104`). La única lista literal viva, `EMPRESAS_UTILIDAD_V1`
  (`ventas/utilidad-cliente.ts:19`), es un espejo **deliberado y documentado** del WHERE de la RPC v1.
- **Corte «vs año anterior»:** vive solo en `lib/ventas/clientes-corte-comparativo.ts`, 7 módulos lo
  importan. No hay un segundo cálculo del corte en TypeScript.

---

## 9. Código que no se dibuja

La sección más cara de producir y la más valiosa. Método: tres análisis independientes que se cruzan
—(1) inventario símbolo por símbolo de los 328 exports de 269 `.tsx` contra su uso como JSX; (2) un
**grafo de montaje transitivo** desde los 349 puntos de entrada de Next, resolviendo imports, barriles
y `dynamic()`, que **no depende de nombres** y por eso caza colisiones; (3) barrido de props
constantes atando cada componente a su `Props` real—. Cada hallazgo confirmado con dos búsquedas como
mínimo; 12 falsos positivos descartados.

### 9.1 🔴 `SwipeableRow` murió HOY, y tres carteles siguen apuntando ahí

`src/components/ui.tsx:1123`. **Cero referencias en producción** (verificado: solo su propia
definición y un comentario).

Su único usuario era `src/app/cheques/ChequesClient.tsx`, que desapareció en el commit de hoy
(*«recordatorios: un renglón para escribir…»*): aparece en `HEAD~1` y no en `HEAD`. Quedaron tres
carteles mintiendo:

- `docs/postmortems/catalogos-pedidos.md:228` — *«**`SwipeableRow` NO se borró**: `cheques` lo usa
  para "depositar" y ahí el gesto se queda»*. **La justificación para conservarlo ya no existe.**
- `CLAUDE.md:593` y `:664` lo listan en Design System y en Shared Components.
- `src/app/globals.css:244` conserva CSS solo para él.

**Nadie desliza nada en ninguna pantalla del sistema.**

### 9.2 🔴 Tres hooks huérfanos — y con ellos, dos funciones documentadas que NO ocurren

Ninguno de los tres tiene **un solo importador** (medido contra los 18 hooks de `src/lib/hooks/`; los
otros 15 tienen entre 1 y 36 importadores):

| Hook | Qué prometía | Consecuencia real |
|---|---|---|
| `useSessionCheck.ts` | ping a `/api/auth/check` cada 2 min + aviso antes de vencer la sesión | 🔴 **El chequeo de sesión no ocurre.** `CLAUDE.md` dice «pinged cada 2 min, warning banner antes de expirar». No hay ping ni banner: `SessionWarning.tsx` **ya no existe como archivo**. |
| `useBadges.ts` | contadores del 🔔 cada 60 s | 🔴 **Los contadores nunca se cargan.** |
| `useKeyboardShortcuts.ts` | `G+H`, `G+C`, `G+Q`…, `J/K`, `E`, panel `?` | 🔴 **Ningún atajo de teclado funciona**, salvo `⌘K`, que tiene su propio listener en `SearchBar.tsx:290`. `KeyboardShortcutsProvider.tsx` **ya no existe**. `CLAUDE.md` documenta ocho atajos. |

🩸 **Lo que más engaña: `useKeyboardShortcuts.ts` se editó HOY.** En el mismo commit de Recordatorios,
el diff completo del archivo es `- q: "/cheques"` → `+ q: "/recordatorios"` (línea 51). **Se arregló
un atajo que no está enchufado a nada.** Es, literalmente, el modo de fallo que este inventario existe
para evitar.

Y el comentario de `next.config.js:106` justifica el redirect de `/cheques` diciendo que la dirección
vieja *«está en marcadores, en la búsqueda global y en el atajo G+Q»*. **G+Q no existe.**

### 9.3 🔴 Dos rutas API **transitivamente** muertas (que §6 daba por vivas)

Este es un límite de método que vale la pena dejar escrito. §6 pregunta «¿algún archivo de `src/`
llama esta ruta?». Para estas dos la respuesta es **sí** — y aun así están muertas, porque su único
llamador es un hook que nadie monta:

```
/api/auth/check          ← único llamador: useSessionCheck.ts   ← nadie lo importa
/api/notification-badges ← único llamador: useBadges.ts         ← nadie lo importa
```

Verificado: `grep 'auth/check'` da 3 líneas (la propia ruta + dos `fetch` dentro del hook muerto);
`grep 'notification-badges'` da 1 (el `fetch` del hook muerto). **El conteo real de rutas huérfanas
es 26, no 24.**

⚠️ Y **tres candados gastan su garantía sobre `/api/notification-badges`**, incluido uno de
aislamiento de Boston: `boston-no-se-mezcla.test.ts:113` («badge cxcStale»),
`supabase-paginado.test.ts:100` y `reclamos-estado-pagado-unico.test.ts:37`. Están protegiendo una
ruta que ninguna pantalla llama.

### 9.4 🟠 `components/marketing/AutocompleteInput.tsx` — 216 líneas invisibles por colisión de nombre

**El punto ciego más traicionero del repo.** Existen **dos** `AutocompleteInput.tsx`:

- `src/app/caja/components/AutocompleteInput.tsx` — **79 líneas, vivo.** Es el que importa
  `GastoTable.tsx:7` con `"./AutocompleteInput"` (ruta relativa).
- `src/components/marketing/AutocompleteInput.tsx` — **216 líneas, muerto.** Solo lo mantiene «vivo»
  el barril `src/components/marketing/index.ts:6`, y nadie pide ese símbolo del barril.

Cualquier búsqueda por nombre lo da por vivo. Lo cazó el grafo de montaje, que no mira nombres.
**Quien vaya a tocar Caja › tabla de gastos › categoría va a abrir el archivo de 216 líneas y no va a
cambiar nada.**

### 9.5 🟠 Ramas muertas por prop constante

| Componente | Prop | Único montaje | Qué no se dibuja NUNCA |
|---|---|---|---|
| `components/cxc/UltimosPagos.tsx:18` | `compacto` / `empresa` | `BostonDocumentosDrawer.tsx:112`, siempre `compacto` | La tarjeta con marco (`:30`) y el sufijo «· Fashion Wear» (`:34`) |
| `marketing/components/FotosSection.tsx:19` | `readonly` | `ProyectoOverlay.tsx:573`, `readonly={false}` | `:215`, `:246` y el vacío **«Este proyecto no tiene fotos.»** (`:256`) |
| `marketing/components/FacturasSection.tsx:43` | `readonly` | `ProyectoOverlay.tsx:552`, `readonly={false}` | 5 ramas: `:469`, `:534`, `:549`, `:763`, `:841` |
| `reclamos/components/ComprobanteModal.tsx:14` | `requireFile` (**requerida**) | `ReclamosClient.tsx:737`, `requireFile={false}` | El aviso «Adjunta una foto o PDF del comprobante para continuar» (`:70`); el rótulo siempre dice «(opcional)» (`:122`) |
| `components/ventas/FilaDetalle.tsx:200` | `compacto` de `FilaDetalleTr` | `ResumenView.tsx:417` y `:499`, ninguno la pasa | La versión compacta por ESE camino (existe por otro: `FilaDetalleBloque:279`) |

🩸 **`UltimosPagos` tiene la trampa completa:** un test **sí** dibuja la mitad muerta
(`cxc-ultimos-pagos-bloque.test.tsx:77` renderiza `empresa="Fashion Wear"` sin `compacto` y afirma
sobre ese dibujo). **Sigue muerta en producción.** Y el «Últimos pagos» del CXC del grupo —el que
alguien creería estar tocando— es **otro archivo**: `src/app/cxc/components/UltimosPagosPorFecha.tsx`.
El encabezado de `UltimosPagos.tsx` todavía dice «Quien lo monta decide la ruta»; lo monta uno solo,
Boston.

### 9.6 🟠 `BottomSheet` — sin usuarios desde el rediseño de Préstamos

`src/components/ui.tsx:947`. Cero montajes; las 6 menciones que quedan son comentarios. Último uso
real: `PrestamosClient.tsx` en `HEAD~6`.

Carteles que engañan: `CLAUDE.md:596` y `:661`, y sobre todo
`src/app/cxc/components/PanelCxcMobile.tsx:61`, cuyo JSDoc dice *«Abre la hoja «Cobrar» — en celular
sube desde abajo (BottomSheet)»*. Esa hoja es `HojaCobrar.tsx`, **con marcado propio**.

### 9.7 🟡 Packing Lists — el esqueleto de carga nunca aparece

`src/app/packing-lists/PackingListsClient.tsx`: `loading` nace `false` (`:122`), el **único**
`setLoading` del archivo también lo pone en `false` (`:328`), y `:1145` es el único lector. **No hay
`setLoading(true)` en ninguna parte** y el setter no viaja como prop. Las tres barras `animate-pulse`
de `:1146-1152` no se dibujan nunca. Quedó huérfano cuando la lista pasó a sembrarse del SSR
(`initialData.plList`, `:121`).

### 9.8 🟡 Restos pequeños, todos con cero referencias

| Símbolo | Nota |
|---|---|
| `src/components/ui/badge.tsx` (archivo entero) | Un **segundo** `Badge` que nadie importa. Engaña porque hay otro vivo en `ui.tsx:523`. Trae variantes `default`/`outline` que ninguna pantalla usa. |
| `src/components/ui.tsx:572` `MoneyCell` | Cero referencias, ninguna en los últimos 20 commits. |
| `src/app/cxc/components/Skeleton.tsx:12` `SkeletonBlock` | Cero referencias. Su hermano `SkeletonRow` **sí** vive (`cxc/page.tsx:625`). |
| `src/components/ui/select.tsx:9` `SelectGroup` | Re-export de Radix sin consumidores. |

### 9.9 ✅ Muertos a propósito — NO los toques sin leer su comentario

- **`MarcaClientesSinComision`** (`components/ventas/MarcaClientesSinComision.tsx:36`) — el chip se
  quitó de las tablas el 4-sep-2026 (Daniel: *«quita el cuadro sin comisión»*) y el componente se
  conservó **a propósito**. Su encabezado lo explica.
- **Boston › Planilla, el pie sin sueldos** (`app/boston/tabs/PlanillaBoston.tsx:319-323`) — cadena de
  cuatro saltos desde `VE_SUELDOS_DE_BOSTON = true`: `planillaSinDinero()` siempre `false` →
  `sinPlata` siempre `false` → `sinSueldos` nunca se serializa → el párrafo no se pinta. **Es el
  interruptor dormido de §7.1 funcionando como debe.**

### 9.10 ✅ Lo que salió limpio (dicho explícitamente)

🔴 **No hay ni un solo cruce de breakpoint roto.** Verificado por **dos rutas independientes que
coinciden**: un modelo de rangos de anchos que intersecta cada elemento con sus ancestros, y un
barrido paralelo. Los 7 componentes con gate de visibilidad en la raíz (`PanelCxcMobile`,
`ResumenViewMobile`, `TiraTotales`, `SelectorPestanas`, `ClienteSheet`, `SortSheet` y el ya muerto
`BottomSheet`) se montan como hermanos de su contrapartida o en contenedores sin gate.

**El error de la vista de tarjetas que jamás se pintó en ningún ancho NO se ha repetido.**

Tampoco hay `{false && …}`, ni constantes booleanas exportadas en `false`, ni `return null`
incondicional.

**Falsos positivos descartados** (por si alguien repite el barrido): `HorasChart` y las 5 vistas de
`VentasShell` viven por `dynamic()` · `InventarioKpiValue` se llama como función, no como JSX
(`vista-general/page.tsx:269`) · `FiltroPrecioExacto` se dibuja (`filtroPrecio: true` en las cuatro
marcas, §7.2) · `TiraTotales` (`hidden sm:grid` dentro de `hidden lg:block`) intersecta en ≥1024 —el
`sm:` sobra pero no mata— · los 28 `<input type="file" className="hidden">` son legítimos, igual que
`hidden print:block` y `hidden group-hover:inline` · `SyncStatus.variant`,
`EnviarDocumentoSwitch.tono`, `FGLogo.variant` y `PanelCxcMobile.BucketChip.variant` usan todos sus
valores · `marcas-ui.tsx` es un `.tsx` de datos, no un componente.

### 9.11 🟡 47 exports que no se usan en ningún lado

Barrido complementario al de componentes: por cada `export function|const|class` de `src/`, se contó
cuántas veces aparece su nombre en **todo** `src/` con los comentarios borrados. **Estos 47 aparecen
UNA sola vez: su propia definición.** Ni otra pantalla, ni otro módulo, ni un test.

⚠️ **Criterio estricto a propósito.** Un primer corte más flojo («no se usa fuera de su archivo») daba
884, y **casi todos eran falsos positivos**: constantes usadas más abajo en el mismo archivo, donde lo
que sobra es la palabra `export`, no el código. Y en este repo **exportar solo para el test es un
patrón deliberado** de los módulos puros. Por eso el corte es «cero apariciones en todo `src`».

| Archivo | Exports muertos |
|---|---|
| `lib/vendors.ts` | `getVendorMap`, `getVendorFromMap`, `getClientsForVendorFromMap` — **el archivo entero** (§2.5) |
| `lib/hooks/useSessionCheck.ts` · `useBadges.ts` | `useSessionCheck`, `useBadges` (§9.2) |
| `lib/hooks/useKeyboardShortcuts.ts` | `SHORTCUT_GROUPS` — la tabla del panel de ayuda `?` (§9.2) |
| `lib/asistencia/saldo-vacaciones.ts` | `esColumnaSaldoVacacionesFaltante`, `avisoMigracionSaldoMediosDias` |
| `lib/asistencia/aprobador-empresa-server.ts` · `planilla-guardada.ts` · `prestamos-planilla.ts` | `avisoMigracionAprobador`, `avisoMigracionPlanillaGuardada`, `avisoMigracionAmarrePrestamos` |
| `lib/marketing/notas-proveedor-server.ts` | `MIGRACION_NOTAS` |
| `lib/depurador/logic.ts` | `convertTemporada`, `calcHint` |
| `lib/inventario-calc.ts` | `calcularSubtotalLinea`, `validarStockSuficiente` |
| `lib/ventas/format.ts` | `deltaSymbol`, `heatmapClasses` |
| `components/ui.tsx` · `ui/select.tsx` · `cxc/components/Skeleton.tsx` | `MoneyCell`, `SelectGroup`, `SkeletonBlock` (§9.8) |
| `lib/cxc/anotaciones.ts` · `cartera-http.ts` | `TABLAS_ANOTACIONES`, `respuestaSiCarteraAjena` |
| `lib/prestamos-conceptos.ts` · `prestamos-lista-server.ts` · `prestamos-roles.ts` | `CONCEPTOS_CONOCIDOS`, `leerSalarioMensual`, `esRolDePrestamos` |
| Sueltos | `getMonthOptions` · `MOV_CONCEPTOS` · `resolveAlias` · `getCompaniesForRole` · `stripBom` · `worstSeverity` · `getEmpresaStyle` · `addNotification` · `PRODUCT_ORDER` · `isVencenSemana` · `guardarTolerandoColumnaNueva` · `nombreMarcaSeguro` · `getEntregaTotalPorMarcaByProyecto` · `DERIVADOS_VACIOS` · `MONTO_DIAS_HISTORIA` · `SERIE_GRAFICO_MESES` · `esCodigoArticuloConocido` · `CHIP_SIN_SEGUROS` · `ETIQUETA_MOTIVO` · `REPETICIONES_QUE_VUELVEN` · `CLASES_QUE_OBLIGAN` |

**Lo que este barrido corrobora por un camino independiente**, y por eso vale más que su tamaño:

- **`lib/vendors.ts` está muerto entero** — sus tres funciones, no solo `VENDOR_MAP` (§2.5).
- **La familia `avisoMigracion*` y `esColumna…Faltante` no la llama nadie** — es la misma conclusión
  de §4 llegando por otra puerta: son los textos que le explicarían a la gente que falta un DDL que
  ya corrió.
- `SkeletonBlock`, `MoneyCell`, `SelectGroup`, `useBadges`, `useSessionCheck` y `SHORTCUT_GROUPS`
  coinciden con lo que encontró el grafo de montaje (§9.2, §9.8). **Dos métodos distintos, la misma
  lista.**

⚠️ **Dos que NO son código muerto y por eso no están en la tabla como tales:** `buildMarketingZip`
(`lib/marketing/zip-export.ts:195`) y `esRolDePrestamos` **sí** tienen un llamador, pero vive en
`scripts/` (`_verif-marketing-excel.ts:19`), no en producción. `zip-export.ts` —1.408 líneas— sigue
vivo por sus otros 15 exports, que `zip-marca.ts:91` sí importa: **el archivo no se toca; lo que está
sin usar en producción es su función de entrada.**

### 9.12 ⚠️ El hueco que queda

**No se siguieron datos de la base.** Una columna que en la práctica siempre llegue `null` y apague un
bloque **no se ve leyendo código**. Ese barrido es otro trabajo, y hoy no está hecho.

---

## 10. Lo que parece muerto pero NO se borra nunca

Regla de la casa (5-sep-2026): *nada que no se pueda volver a conseguir se queda sin copia*. Estas
tablas aparecen arriba como «sin lectores», y aun así **la tabla se queda**. Lo que se retira, en su
caso, es el código que ya no la usa — nunca los datos.

| Tabla | Filas | Por qué no se borra |
|---|---:|---|
| `ventas_raw` | **48.378** | Es la **fuente declarada de las ventas anteriores al 1-may-2025** y la leen 5 RPC vivas. Además, 27.518 de esas filas son de un empalme que nadie ha cuadrado contra Switch. Borrarla cambia números en silencio. |
| `multifashion_tickets` | **15.819** | Grano de **ticket** de la tienda (2-may-2025 → 25-jul-2026). La venta está en Switch; el ticket no. Su cron se retiró: nadie la va a volver a llenar. |
| `cxc_rows` | **1.097** | CSV viejo de cartera, anterior a Switch. No re-derivable. |
| `cxc_contact_log` | **141** | **Lo escribieron personas**: quién contactó a qué cliente por su deuda y cuándo. No se re-deriva de ningún lado. |
| `vendor_assignments` | **483** | **Lo escribieron personas**: qué vendedor atiende a qué cliente, de la era anterior a que Switch mandara el vendedor en la factura. |
| `directorio_clientes` | **33** | **Lo escribieron personas**: la libreta de contactos a mano (teléfono, correo, notas). |
| `ventas_metas` | 7 | **Lo escribió Daniel**: las metas anuales por empresa. Sin pantalla que las edite — entran por SQL. |
| `app_settings` / `gastos_categorias` | 7 / 6 | Configuración cargada a mano. Chica, pero no re-derivable. |
| `cxc_uploads` · `mayor_importaciones` · `multifashion_sync_log` | 6 / 16 / 98 | Bitácoras. Se pueden retirar sin drama, pero tampoco estorban. |

✅ **Verificado: las 15 están clasificadas en `src/lib/backup/tablas.ts`** — ninguna quedó fuera del
respaldo. El candado `backup-nada-sin-copia.test.ts` está haciendo su trabajo.

🔴 **En este repo la baja de una tabla es `activo = false` y `COMMENT`, nunca `DROP`** (el patrón
`mayor_lineas`). Si algo de esto se retira, se retira el **código**, y la tabla se queda con un test
que pone el build rojo si una migración intenta dropearla.

---

## 11. Qué retiraría primero

Ordenado **por riesgo de que alguien se equivoque por culpa de eso**, no por tamaño.

### Primero — no es deuda, es una avería abierta

1. 🔴 **Correr `20260925130000_recordatorios_rediseno.sql`.** Recordatorios contesta 500 y el aviso de
   cheques vencidos no sale. Un comando, cero código. (§1)
2. 🔴 **Decidir qué pasa con los tres hooks huérfanos** (§9.2). No es limpieza: son **tres funciones
   que la documentación promete y no ocurren** —el chequeo de sesión cada 2 min, los contadores del
   🔔 y los ocho atajos de teclado—. Hay dos caminos y los dos son válidos, pero hay que elegir uno:
   **enchufarlos** (montar los hooks) o **retirarlos** y borrar los ocho atajos de `CLAUDE.md`,
   `SessionWarning` y `KeyboardShortcutsProvider` de Shared Components, y la frase de
   `next.config.js:106` que habla del atajo `G+Q`. Hoy no está ninguno de los dos, y **alguien ya
   perdió tiempo hoy arreglando `G+Q`**.

### Después — lo que hace que alguien arregle el archivo equivocado

3. 🔴 **`components/marketing/AutocompleteInput.tsx`** (§9.4). 216 líneas invisibles por **colisión de
   nombre** con el de Caja, que es el vivo. Es el único hallazgo del inventario que **ninguna búsqueda
   por nombre puede encontrar**: quien vaya a tocar la categoría de un gasto abre el archivo grande y
   no cambia nada. Va arriba de todo lo demás por eso.
4. 🔴 **Los cuatro `panamaDate()` → `hoyPanama()`.** Es la única divergencia de **un día entero**
   medida en TypeScript, y vive en los crons que le piden la ventana de fechas a Switch. Hoy no
   muerde solo porque Vercel corre en UTC — o sea que está bien por accidente, no por diseño. (§8.1)
5. 🔴 **`CURRENT_DATE` → `multifashion_hoy_panama()`** en `dia_a_dia_v4` y `bonos_v3`. Cinco horas de
   desfase cada noche, en pantalla y en la **elegibilidad de bonos** (o sea, plata de las
   vendedoras). El arreglo ya se hizo en las funciones hermanas; estas dos quedaron. (§8.2)
6. 🟠 **Las tres cadenas que terminan en nada.** Cada eslabón se ve sano por separado, y por eso son
   las que más engañan:

   | Cadena | Dónde |
   |---|---|
   | `directorio_clientes` (33) → `home_dashboard_summary()` → `/api/home-stats` → **nadie** | §2.3 |
   | `cxc_contact_log` (141) → `/api/cxc/contact-log` → **nadie** | §2.4 |
   | `vendor_assignments` (483) → `getVendorMap()` · `/api/vendors` → `VENDOR_MAP` vacío → **nadie** | §2.5 |

   **Se retira el código; las tres tablas se quedan** (§10).
7. 🟠 **La tolerancia a DDL de Asistencia.** 18 `MIGRACION_*` + sus detectores + **13 banderines de
   pantalla que no pueden aparecer** (10 de ellos en `PlanillaTab.tsx`). Es el bloque más grande de
   código imposible del repo, y está en el módulo que más se toca. (§4)

### Luego — lo que se ve en un papel que sale de la empresa

8. 🟠 **Un solo formateador de moneda, una sola convención de signo.** Hoy conviven `-$1,234.50` y
   `$-1,234.50`, y una versión que redondea a 0 decimales. Se ve en el **estado de cuenta que se le
   manda al cliente**. (§8.4)
9. 🟠 **`pdf-bulk.ts:110`**: el PDF que va al proveedor imprime `5/9/2026` mientras todo el sistema
   dice `5 sep 2026`. Un renglón. (§8.5)

### Después — silencios latentes

10. 🟡 **Los 5 bucles de paginación a mano de CXC/Boston** sin la verificación contra `count: "exact"`.
   Tres de ellos leen tablas de 1.947 y 4.915 filas, o sea **por encima del corte de 1.000 que
   `db-max-rows` aplica en silencio**. (§8.6)
11. 🟡 **`SEARCH_ROLES` escrito cuatro veces** (§8.8) y **`ROLES_LECTURA_METAS` ocho** — con una
   pregunta abierta para Daniel: ¿`contabilidad` debe ver `/api/multifashion/venta-hoy`? Hoy puede,
   y Multifashion no es su módulo.
12. 🟡 **`switch_costo_unificado_vw`** — la vista vieja, sin lectores, que **se queda corta en el
    costo de las notas de débito** (verificado comparando las dos definiciones). Es la diferencia que
    dio el costo negativo de Active Wear. Dos vistas con casi el mismo nombre y una corta es una
    trampa para el próximo que busque «costo unificado». (§2.7)

### Al final — barrido, bajo riesgo

13. 🟢 Las **26 rutas huérfanas** (§6 y §9.3). ⚠️ **Diez están importadas por candados** —varios de Boston,
    que las listan justamente para exigir que no mezclen Boston— así que cada una obliga a tocar su
    test a conciencia. No es un barrido de una tarde.
14. 🟢 Las **3 funciones sin llamador** (`mayor_reemplazar_mes`, `ventas_meta_sugerida_v2`,
    `proyeccion_mensual_mayorista_v1`) y las **3 vistas sin lectores** (§2.7).
15. 🟢 `normalizeStr` de Caja, 4 copias byte-idénticas, a `src/lib` (§8.9).
16. 🟢 **Los componentes muertos y sus carteles.** `SwipeableRow` (§9.1) y `BottomSheet` (§9.6) —
    los dos con cero montajes— más `ui/badge.tsx`, `MoneyCell`, `SkeletonBlock` y `SelectGroup`
    (§9.8). 🔴 **Lo que importa aquí no es el código, son los carteles:** el post-mortem que dice que
    `SwipeableRow` se conserva «porque cheques lo usa», el JSDoc de `PanelCxcMobile.tsx:61` que manda
    a `BottomSheet` cuando la hoja es `HojaCobrar.tsx`, y las entradas de `CLAUDE.md`. Si se borra el
    código y quedan los carteles, no se arregló nada.
17. 🟢 **Las ramas muertas por prop constante** (§9.5) — `UltimosPagos`, las dos `readonly` de
    Marketing, `requireFile` de Reclamos y el `compacto` de `FilaDetalleTr`. Ojo con `UltimosPagos`:
    un test dibuja la mitad muerta, así que hay que tocar el test a propósito.
18. 🟢 El esqueleto de carga de Packing Lists, que nunca aparece (§9.7).
19. 🟢 **Los 47 exports sin un solo uso** (§9.11). Incluye `lib/vendors.ts` entero y toda la familia
    `avisoMigracion*` / `esColumna…Faltante`, así que **se solapa con los puntos 2, 6 y 7** — conviene
    hacerlo en la misma pasada que la tolerancia a DDL, no aparte.
20. 🟢 Partir los archivos que mezclan varias pantallas: `PlanillaTab.tsx` (2.035),
    `ConfiguracionTab.tsx` (1.810), `marcas-ui.tsx` (1.874), `DepuradorClient.tsx` (1.420). (§5)

### Lo que NO tocaría

- Los **dos interruptores** (`GUIAS_ATAJOS_NUEVOS`, `VE_SUELDOS_DE_BOSTON`): están encendidos y son
  reversibles en una línea. Eso es exactamente lo que valen. (§7.1)
- Los **cuatro módulos clonados por marca** (§8.10): el diseño contempla que difieran y hoy nada
  diverge de forma peligrosa.
- **`MarcaClientesSinComision`** y el **pie sin sueldos de Boston** (§9.9): están muertos **a
  propósito** y su comentario lo explica. El segundo es el interruptor de §7.1 funcionando bien.
- **Ninguna tabla** (§10).

---

### Una última cosa, que es la que más vale

De los 20 puntos de arriba, **los dos primeros no son deuda: son cosas que hoy no funcionan** y que
nadie está viendo. Y el patrón que los une con `AutocompleteInput`, con `G+Q` y con los 13 banderines
es siempre el mismo: **el código se ve sano, la documentación lo respalda, y no pasa nada.**

🔴 **Lo único que este inventario no puede hacer es evitar que vuelva a pasar.** Hay candados para los
crons (`cron-registro.test.ts`) y para las tablas (`backup-nada-sin-copia.test.ts`), y los dos
funcionan. **No hay ninguno que ponga el build rojo cuando nace una ruta sin llamador, un componente
que nadie monta o un hook que nadie importa.** Los tres hooks de §9.2 habrían saltado el día que se
quedaron huérfanos, en vez de descubrirse hoy — después de que alguien les arreglara un atajo.

---

## Apéndice — cómo se midió, y qué NO cubre

**Producción se tocó SOLO en lectura.** Ni una escritura, ni un `DROP`, ni una migración. No se corrió
`npm test` ni `next build`. Este archivo es la lista; el borrado es otra conversación.

### Consultas y búsquedas que sostienen cada sección

| Sección | Cómo se midió |
|---|---|
| §1 Recordatorios | El `SELECT` textual del módulo, ejecutado contra producción → `42703`. `information_schema.columns` para `recordatorios` y `cheques`. |
| §2 Tablas | `count(*)` exacto de las 136 tablas (una sola consulta armada con `format()` sobre `pg_tables`). Lectores: barrido de `src/` **con los comentarios borrados**, por `.from("t")` literal, por constante intermedia y por `pg_depend` (vistas) + `pg_get_functiondef` de las 88 funciones propias, cruzado con los `.rpc()` de `src/`. |
| §3 Migraciones | `supabase_migrations.schema_migrations` (304 filas) contra los 332 archivos con timestamp de `supabase/migrations/`. |
| §4 Tolerancia DDL | Las 64 migraciones nombradas dentro del código (regex `\d{14}_nombre`), cruzadas con las aplicadas. Columnas verificadas una por una en `information_schema.columns`. |
| §5 Archivos grandes | `wc -l` sobre `src/**/*.{ts,tsx}` sin tests. |
| §6 Rutas | Dos búsquedas mínimas por ruta (path completo y sufijo), más un pase inverso para descartar matches que eran solo comentarios. |
| §8.1 `panamaDate` | **Se ejecutó** el cuerpo duplicado en `TZ=UTC` y `TZ=America/Panama` con el mismo instante. Divergencia reproducible. |
| §9 Código muerto | Tres análisis que se cruzan: inventario de exports contra uso como JSX, **grafo de montaje transitivo** desde los 349 entry points de Next (no mira nombres → caza colisiones) y barrido de props constantes. Más un cuarto barrido independiente de exports sin uso (§9.11), que llegó a la misma lista por otro camino. |

### Lo que este inventario NO cubre

- **No se midió el uso real.** Nada de esto sale de `activity_logs` ni de analítica: «sin lectores en
  el código» no es lo mismo que «nadie lo usa». Para las pantallas, el mapa de uso vive en
  `docs/eficiencia/`.
- **No se revisó SQL de migraciones viejas** salvo los dos casos de §8.2. Puede haber más
  `CURRENT_DATE` en funciones que ya nadie llama.
- **Los 52 archivos de migración sin timestamp** (los más viejos, nombre libre) no se pudieron cruzar
  contra `schema_migrations`, que indexa por versión numérica. Son anteriores al esquema actual de
  nombres.
- **No se midió cobertura de tests** de lo que se propone retirar, más allá de anotar qué candados
  importan cada ruta huérfana (§6.3) y de marcar qué ramas muertas tienen un test que las dibuja
  (§9.5).
- **No se siguieron datos de la base hasta la pantalla** (§9.12): una columna que siempre llegue
  `null` y apague un bloque no se ve leyendo código.
- **`scripts/`** se miró solo para no contar un script como si fuera un llamador de producción. No se
  auditó su deuda propia.

### Cuándo vuelve a medirse

Este archivo envejece por dos vías: una migración que corre (apaga media §4) y una ruta o tabla nueva
que nace. Los dos candados que ya existen —`cron-registro.test.ts` para los crons y
`backup-nada-sin-copia.test.ts` para las tablas— cubren su parte. **Lo que no tiene candado es esto
mismo:** nada pone el build rojo cuando nace una ruta sin llamador o un componente que no se dibuja.
