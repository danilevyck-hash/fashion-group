# Fashion Group — fashiongr.com

## Stack
- **Framework:** Next.js 14 (App Router)
- **Database:** Supabase (project: rspocgqhtpveytgbtler), PostgreSQL
- **Hosting:** Vercel
- **Styling:** Tailwind CSS
- **Email:** Resend API
- **PDF:** jsPDF + jspdf-autotable
- **Excel:** xlsx-js-style

## Empresas del grupo
Vistana International, Fashion Wear, Fashion Shoes, Active Shoes, Active Wear, Joystep, Confecciones Boston, Multifashion

> **Qué sincroniza cada empresa vive en UN solo lugar: `EMPRESA_SYNC_CAPABILITIES` (`src/lib/switch-api/empresas.ts`).** Cinco banderas por empresa — `facturas`, `cxc`, `cxp`, `recibos`, `utilidad` — y los syncs DERIVAN sus listas de ahí: `RECIBOS_EMPRESA_KEYS` (sync-recibos) = `empresasConRecibos()`, `B2B_COMISION_KEYS` (sync-utilidad) = `empresasConUtilidad()`, y el cronograma de sesión única de `cron-telemetry.ts` (`CRON_EMPRESAS_*`) también. **No volver a escribir un array de empresas a mano.**
>
> 🩸 **Por qué (27-jul-2026):** eran arrays literales repartidos en tres archivos y se contradecían en silencio. `joystep` estaba en `B2B_EMPRESA_KEYS` (o sea, con CXC y pestaña de comisiones) pero **no** en el sync de recibos ni en el de utilidad, **desde el commit que creó cada sync** (`86b0d0d4`) y sin un comentario que lo explicara. La certificación contra Switch lo midió: **$15.262,00 de cobros de julio invisibles**, `switch_factura_utilidad` con **cero filas de joystep en toda su historia**, comisión de julio en **$0,00 con 0 vendedores**, y los clientes de sus **$60.606,37** de cartera abierta sin "último pago" porque `switch_ultimo_pago_cliente_v2` no tenía una sola fila suya. Daniel: *"fue un olvido — activalo"*, con histórico hacia atrás. Peor que el agujero era que el cronograma de crons repetía las mismas listas: el candado que protege la sesión única de Switch (`cron-calendario.test.ts`) medía un calendario que no era el real.
>
> **Invariante que lo habría cazado el día 1, ahora en `src/__tests__/lib/empresa-capabilities.test.ts`: toda empresa con `cxc: true` tiene que tener `recibos: true`** — una cartera abierta sin recibos es una ficha de cliente que nunca puede decir cuándo pagó. La implicación va en UN solo sentido: `american_classic` es `cxc:false` + `recibos:true` a propósito (retail sin cuenta corriente pero con cobros de mostrador). El mismo test fija que `B2B_EMPRESA_KEYS` ≡ `empresasConCxc()` — no se puede derivar en código porque `empresas.ts` importa el tipo `EmpresaKey` de `empresa-mapping.ts` y sería circular, así que la coherencia la sostiene el test.
>
> **`confecciones_boston` sigue EXCLUIDO de recibos y utilidad, y eso es diseño, no olvido** — ahora dicho en el código en vez de implícito. Su CXC entera se lleva fuera de este sistema (`cxc:false`, va por Brand It), así que traer sus 125 recibos/mes acá poblaría un "último pago" que no le corresponde a ninguna cartera nuestra. Son **$35.338,99 de julio 2026 que quedan fuera a propósito.**
>
> **Guard del "cero silencioso" en `sync-utilidad`:** si el reporte de Switch devuelve 0 documentos **pero `switch_facturas` sí tiene documentos en el rango**, la empresa queda `ok:false` con el error en `switch_sync_log` en vez de anotarse `success` con la tabla vacía. Cero filas sigue siendo legítimo cuando la empresa no facturó. Candado: `src/__tests__/lib/utilidad-cero-silencioso.test.ts`. (Ojo, un dato que se prestó a confusión: el `success` diario de joystep en `switch_sync_log` es `sync_type='costo'`, que escribe `switch_costo_diario` — 92 filas correctas, julio $4.310,00 — y **no** tiene nada que ver con `switch_factura_utilidad`. No eran el mismo cron.)

## Roles
| Rol | DB value | Acceso |
|-----|----------|--------|
| Admin | `admin` | Todo |
| Secretaria | `secretaria` | upload, guias, caja, reclamos, cheques, directorio, marketing, comisiones, packing-lists, **catálogos incluido ADMINISTRAR** (ver nota), KPIs dashboard |
| Bodega | `bodega` | guias (despacho), packing-lists, catálogos (**solo ver**), búsqueda global (guías+directorio). Auto-redirect a Guías desde home (único módulo). Nota: directorio aparece solo en la búsqueda global, NO como módulo navegable |
| Contabilidad | `contabilidad` | prestamos, proveedores, ventas, búsqueda global (ventas+prestamos). En API directorio solo lectura (GET), no edición |
| Vendedor | `vendedor` | catálogos (**solo ver** + armar pedidos), CXC, directorio, guías (solo lectura), búsqueda global (CXC+directorio) |
| Gerente ACS | `gerente_acs` | SOLO Multifashion (/multifashion + /api/multifashion/*). Auto-redirect a Multifashion desde home (único módulo). Módulos vía `role_permissions` |

> Roles reales del sistema = los 6 de arriba (`src/lib/modules.ts` → `SYSTEM_ROLES`). No existen roles `director` ni `cliente` (el catálogo Reebok es público, sin login).

> **Catálogos tiene DOS niveles de rol, y viven en `src/lib/catalogo/roles.ts` (fuente única, 27-jul-2026):**
> - `CATALOGO_ROLES` = admin, secretaria, vendedor, bodega → **ver** el catálogo interno y el hub `/catalogos/marcas`.
> - `CATALOGO_ADMIN_ROLES` = admin, **secretaria** → **administrar** `/catalogos/admin/[marca]` en las 3 marcas: fotos (subida individual, ZIP del banco B2B, selector de variantes), etiqueta `badge`, ocultar del catálogo (`oculto_manual`), "Actualizar ahora", Excel sin foto y el tab Pedidos (borrar individual/masivo, exportar, editar, enviar a Switch).
>
> La secretaria se sumó por pedido de Daniel ("catálogos como a daniel, con administrar también"). **No hizo falta migración:** `role_permissions.secretaria` ya traía `catalogos` — el módulo nunca fue el problema. Lo que faltaba estaba repartido en dos capas y estaba INCONSISTENTE consigo mismo:
> - **UI:** el hub escondía el botón "Administrar" con `role === "admin"`, y `AdminCatalogoClient` pedía `allowedRoles: ["admin"]`. (Ojo: ese `allowedRoles` era decorativo — `hasModuleAccess` cae de vuelta a `fg_modules`, así que cualquiera con el módulo `catalogos` ya entraba por URL. El botón era el único freno real.)
> - **API:** `requireAdmin` (= admin+secretaria) ya protegía casi todo el admin (`products`, `products/variantes*`), pero quedaban dos huecos solo-admin: `upload` en **Joybees y Tommy** (Reebok sí la dejaba → la secretaria no podía subir foto en 2 de las 3 marcas) y `pedidos-publicos/[short_id]` DELETE/PUT (mientras `orders/bulk-delete` con `fuente="publicos"` sí la aceptaba: se podía borrar el MISMO pedido en masa pero no de a uno).
>
> **Lo que NO cambió y no debe cambiar:** los **precios** los manda Switch — la allow-list editable a mano es `image_url`/`badge` (+`name` solo en Tommy, que marca `nombre_manual=true`). Y `createRoles` sigue incluyendo `vendedor` (y el `cliente` legacy en Reebok) para armar pedidos.
>
> Candado: `src/__tests__/lib/catalogo-roles.test.ts` congela **las dos listas**, prueba `requireRole`/`requireAdmin` con cookies firmadas rol por rol, verifica `upload.roles` en las 3 marcas y trae un **snapshot literal de los módulos de `bodega`, `contabilidad`, `vendedor` y `gerente_acs`**: si alguno gana un módulo sin querer, el build se pone rojo. Verificado por mutación (agregar `bodega` a `CATALOGO_ADMIN_ROLES` rompe 10 tests).

## Módulos (src/lib/modules.ts)
Fuente única de navegación + permisos de UI. **3 grupos** (rediseño del home, jul-2026):
- **Ventas y clientes:** Vista General, Ventas, CXC (`/admin`), Multifashion, Clientes/Directorio (`/clientes`), Proveedores, Catálogos (Reebok, Joybees, Tommy Hilfiger — las 3 marcas ENCENDIDAS: tarjeta en el hub /catalogos/marcas, catálogo público compartible /catalogo-publico/tommy y pedido público /pedido-tommy/[id] accesibles sin sesión, cron tommy-catalogo bajo vigilancia estricta)
- **Operación:** Guías de Despacho, Packing Lists, Reclamos, Depurador (`/productos/cargar`), Comisiones, Marketing, Caja Menuda, Gastos de Empresa, Préstamos, Cheques
- **Administración:** Usuarios, Data Health

> Las fichas del home y del sidebar NO llevan subtítulo (auditoría de textos, #278): el campo `subtitle` se eliminó de `AppModule`.
> Páginas de grupo: `/g/[grupo]` con los 3 slugs nuevos. Los slugs viejos redirigen en `next.config.js` (`/g/sistema` → `/g/administracion`; `/g/plata-entra`, `/g/plata-sale`, `/g/productos` → `/home`).

## Guías — máquina de estados
- Estado en `guia_transporte.estado` (TEXT, **sin CHECK constraint** — valores válidos por convención de código).
- Flujo: **Pendiente Bodega** (default al crear) → **Completada** (al despachar; exige receptor, cédula, placa, ≥1 bulto y firmas; queda **bloqueada** para edición) → **Rechazada** (solo desde Completada, con `motivo_rechazo`).

## Auth
- Passwords: bcrypt hashed (migración de plaintext completada — todos los usuarios en bcrypt; el login exige bcrypt y rechaza cualquier password no-hasheada)
- Session: httpOnly cookie `cxc_session`, base64url-encoded JSON `{role, userId, userName, sessionToken}`
- Middleware: `src/middleware.ts` valida sesión contra `user_sessions` table
- **Expiración de sesión — vive SOLO en el cron (26-jul-2026).** `user_sessions` **no tiene `expires_at`** (columnas reales: id, user_name, user_role, session_token, ip_address, last_seen, created_at, revoked) y la cookie firmada tampoco lleva claim de expiración: del lado del servidor una sesión no vencía nunca. Lo único que la mataba era el `maxAge` de 7 días de la cookie en el navegador — un control del CLIENTE, que quien se quede con el valor de la cookie ignora. Medido antes del fix: 1.190 filas, 259 sin revocar para 9 usuarios (daniel 73, Angela 66), y solo 3 usadas en 24h. Ahora `/api/cron/cleanup-sessions` (02:30 UTC) revoca a los **14 días** sin `last_seen` (el doble de los 7 del `maxAge` → no desloguea a nadie que todavía pudiera estar usando la app), pone un **tope duro de 90 días** de vida por sesión aunque se la mantenga viva a pings, y **borra** las revocadas con `last_seen` > 90 días. Constantes en `src/lib/session-retention.ts`. Si se agrega un `expires_at` algún día, el middleware tiene que respetarlo — hoy no existe nada que respetar.
- Session health check: `/api/auth/check` — pinged cada 2 min, warning banner antes de expirar
- API auth: `src/lib/requireRole.ts` — admin siempre pasa, verifica rol contra array
- Rate limiting: login en Supabase (tabla `login_attempts` + RPC `register_login_failure`/`clear_login_attempts`), por IP — 5 fallos en ventana de 15 min → lockout 15 min (`src/lib/login-rate-limit.ts`, fail-open). Reemplazó el Map en-memoria (inefectivo en serverless)
- Login case-insensitive: contraseñas no distinguen mayúsculas/minúsculas (autocapitalizar iPhone)
- Input login: autoCapitalize=none, autoCorrect=off
- User indicator: nombre + rol visible en header desktop y drawer mobile
- Forgot password: link en login → "Contacta al administrador"

## Base de datos
- **Tablas grandes:** cxc_rows (~50K), switch_facturas (historia 2022+, fuente única de ventas), ventas_raw (~100K, congelada — solo la lee costo)

> **REGLA — filtrar por año va por RANGO, nunca con `EXTRACT(YEAR ...)` (26-jul-2026).** `WHERE EXTRACT(YEAR FROM (fecha AT TIME ZONE 'America/Panama'))::int = p_anio` es una función SOBRE la columna: no es sargable, ningún índice de `fecha` se puede usar y Postgres cae en seq scan de `switch_facturas` entera (52.269 filas, ~58 MB de heap por el `raw_data` jsonb) en CADA llamada. Es la causa medida de los picos de /ventas: en frío 2.882-3.493 ms contra 368-451 ms en caliente (8×), y el año anterior casi nunca está en caché. La forma correcta es el intervalo semiabierto en UTC — Panamá es **UTC-5 fijo**, sin horario de verano (verificado fila por fila contra la tzdb en las 52.269 facturas: 0 discrepancias):
> ```sql
> WHERE fecha >= (make_date(p_anio,     1, 1)::timestamp AT TIME ZONE 'America/Panama')
>   AND fecha <  (make_date(p_anio + 1, 1, 1)::timestamp AT TIME ZONE 'America/Panama')
> ```
> Los límites van en una CTE leída con subconsulta escalar (InitPlan) para que el planner los vea como constantes. Ya aplicado en `ventas_dashboard_summary` (20260725170100), `ventas_topclientes_summary` y `ventas_clientes_detalle_summary` (20260726190000). **Ojo con las funciones que alimentan a varios consumidores:** `ventas_clientes_detalle_summary` no puede llevar techo porque su CTE `last12m_filtered` no tiene cota superior — solo cota inferior `LEAST(1-ene de p_anio-1, p_twelve_months_ago)`. Índice de cobertura: `idx_sf_fecha_cliente_cover (fecha) INCLUDE (empresa_key, cliente_nombre, tipo_comprobante, subtotal_descuento)` — `idx_sf_fecha_cover` NO sirve para estas dos porque le falta `cliente_nombre`. Candado: `src/__tests__/lib/ventas-reportes-sargable.test.ts`.

> **Proveedores / CxP — los tres campos derivados se calculan AL LEER, y en hora Panamá (27-jul-2026).** Fuente única: `src/lib/proveedores-derivados.ts` (módulo puro), usado por el sync (`switch-api/sync-proveedores.ts`) **y** por la lectura (`lib/proveedores.ts`). Candado: `src/__tests__/lib/proveedores-derivados.test.ts`.
>
> 🩸 **El bug:** `parseFecha()` del sync exigía **DD-MM-YYYY** y `/apiproveedor/info` manda **YYYY-MM-DD**. Medido sobre los 821 renglones guardados: **821 en YYYY-MM-DD, 0 en DD-MM-YYYY** → devolvía `null` 821 de 821 veces y, como todo el cálculo vivía dentro de un `if (f && …)`, **"Comprado YTD", "Pagado YTD" y "Último pago" salían en cero/vacío en 66 de 66 filas, en las 7 empresas**. El formato DD-MM-YYYY sí es el del estado de cuenta de **CXC** (`parseFechaDMY` en `switch-api/parse.ts`): se copió el parser al módulo equivocado y el comentario documentaba un formato que el endpoint nunca usó. Ahora se aceptan los dos, más fechas con hora.
>
> **Tres correcciones más que iban en el mismo cálculo, todas medidas:**
> - **El año se corta en hora PANAMÁ, no en UTC.** Era `new Date().getUTCFullYear()`: entre las 19:00 y las 23:59 del 31-dic de Panamá el corte ya saltaba al año siguiente y el YTD se vaciaba 5 h antes de tiempo. Una fecha con hora se lleva al día-calendario de Panamá (UTC−5 fijo) **antes** de mirarle el año.
> - **Las notas de crédito NO son pagos.** Se clasificaba por `debito > 0` a secas; de los 90 renglones con débito, **57 son "Pago a proveedores" y 33 son "Nota de Crédito"**. Con eso, 6 de las 17 filas con débito habrían mostrado como "Último pago" la fecha de una NC —plata que nunca salió— y 5 proveedores sin un solo pago habrían mostrado uno. Ahora `esPagoAProveedor()` filtra por `abrev='PP'`.
> - **`credito`/`debito` son el SALDO abierto del documento, no su monto.** Medido: `credito === saldo` en 731/731 renglones de cargo y `debito === |saldo|` en 90/90. Sumarlos bajo "Comprado YTD" daba el saldo por cobrar de las facturas del año — salía **idéntico a la columna "Por pagar" en 17 de 32 filas**, y para LATIN FITNESS (active_wear) decía $81.430,83 comprado cuando las facturas del año suman $206.430,83. El monto del documento es `total` (el acumulado es `saldoConsecutivo`, no `total`).
>
> **Se recalcula al LEER, desde el mismo `elements` que la fila ya guarda**, no solo al sincronizar: `sync-proveedores` corre 1×/día (09:30 UTC), así que leer la columna guardada habría dejado el módulo vacío hasta la corrida siguiente, y "hace N días" se congelaba en el instante del sync. Es la misma función en los dos lados, así que no hay dos verdades posibles.
>
> ⚠️ **LÍMITE DEL DATO, no del cálculo — que nadie lea estas dos columnas como el total del año.** `/apiproveedor/info` devuelve solo el ledger **ABIERTO** (verificado: 0 de 821 renglones con saldo cero). Una factura del año ya pagada por completo desaparece de ahí, así que **"Comprado YTD" y "Pagado YTD" cubren solo lo del año que todavía figura en la cuenta y se quedan cortos**. `Último pago` no tiene ese problema. Para un YTD de verdad hace falta otra fuente (un reporte de compras de Switch); no existe hoy en la base. Verificación read-only: `npx tsx scripts/_verif-prov-ytd.ts`.

> **Costo diario — Switch manda cifras IMPOSIBLES y ahora hay un guard que las frena ANTES de escribirlas (27-jul-2026).** La certificación encontró en `switch_costo_diario` la fila `confecciones_boston · 2026-07-14 · costo_total = $1,000,000,049.22` contra una venta de $493,00 (para el mismo día el reporte de artículos dice $59,22). Viene tal cual de Switch — se pidió `/apireporte/totalventas?tipo=03` en vivo y devuelve ese número — y `syncCostoDiario` no pasaba por ningún guard: escribía lo que le dieran. **No es un caso aislado:** el mismo día, `/apiingresomercancia/lista` de `active_shoes` devolvió el documento `19-000000011` con `subTotal 4.460.999.999.999,55` y `total 1.000.000.000`. La fila se borró (aprobada por Daniel) con `scripts/_borrar-costo-absurdo-boston.mjs`.
>
> **El umbral es RELATIVO, no un número fijo** (`src/lib/switch-api/costo-guard.ts` → `umbralCostoDiario`): `max($1.000.000, 20 × el récord histórico de ESA empresa)`. Calibrado contra las 736 filas reales de la tabla — el día de costo más caro jamás registrado en el grupo es **$141.707,12** (active_wear, 13-may) y el costo de las 8 empresas juntas en junio fue **$489.788,26**, así que el piso de $1M en un día de una empresa es 7× el récord y el doble del mes del grupo entero: nada operativo real lo alcanza. El factor 20× es lo que lo hace envejecer bien — si la empresa crece, el umbral la sigue sin tocar una constante. ⚠️ **Un valor GRANDE no es un valor IMPOSIBLE:** un mes fuerte no puede quedar bloqueado, por eso el umbral es tan holgado.
>
> **Anti-envenenamiento:** el histórico sale de la misma tabla que se protege, así que las filas ≥ $10M **no cuentan como historia** — si la fila de mil millones contara, ella sola levantaría el umbral por encima de sí misma y desarmaría el guard para siempre.
>
> **Se RECHAZA la fila, no se pone en cero** (al revés que el guard de artículos): el sync es un UPSERT que refresca el mes entero todos los días, así que **no escribir CONSERVA el último valor bueno de ese día**; escribir un 0 lo destruiría. Los demás días se guardan normal — una fila mala no tumba el sync de la empresa. El descarte queda en `switch_sync_log.skip_details` con `campo='costo_imposible'`.
>
> **Avisa por 🔧 SISTEMA y NO en loop.** El reporte trae el mes en curso entero cada día, así que un día mal cargado vuelve a llegar en cada corrida: solo se avisa por las fechas que no se avisaron en los últimos 7 días. Si Telegram falla, el sync sigue `success`. (📌 Ojo con el canal: el guard de **artículos** manda su "costo sospechoso" a 📊 NEGOCIO. Este va a SISTEMA porque no es un costo mal cargado sino el reporte devolviendo una cifra imposible. Si Daniel los prefiere en el mismo chat, es cambiar `enviarSistema` por `enviarNegocio` en `avisarCostoDiarioImposible`.)
>
> Candado: `src/__tests__/lib/costo-diario-guard.test.ts` (24 casos, verificado por mutación: desarmar el umbral rompe 13 tests, quitar el anti-loop rompe 5). Barridos read-only: `node scripts/_diag-costo-absurdo.mjs`, `node scripts/_diag-montos-absurdos.mjs` (todas las tablas de plata) y `node scripts/_verif-costo-arrastre.mjs` (qué pantallas toca la tabla).

> **Depurador — el DIVISOR tiene rango, y el rango es 0 ó 0.10-1.00 (27-jul-2026).** El precio es `TECHO(Costo CIF ÷ divisor) + extra`: el divisor NO es un porcentaje, es la **fracción del precio que representa el costo** — para 30% de margen se escribe **0.70**. 🩸 `marca_formulas` tenía **`TH Tommy Jeans` con `divisor = 70`** desde el 29-jun (un punto decimal olvidado): un costo CIF de $42 daba **$4** en vez de $63, o sea precios **100× más baratos**. Las 4 rutas que escriben fórmulas solo pedían `divisor >= 0`, así que el 70 entraba igual que el 0.70. Daniel: *"divisor deberia de ser 0.7, y si puedes obligar a que ese error no vuelva a pasar, no existe q sea mas de 1.0"*. Fila corregida a 0.70 con su aprobación; era la **única** fuera de rango en las 4 tablas.
> - **Fuente única: `src/lib/depurador/divisor.ts` → `validarDivisor()`** (módulo PURO), usada por `formulas`, `rubro-formulas`, `tienda-formulas` y `tienda-rubro-formulas`. El CHECK de la base (`20260727190000_divisor_rango.sql`, las 4 tablas) repite el mismo rango como último freno para lo que no pase por las rutas; **el código funciona con o sin él.**
> - **El 0 SIGUE SIENDO VÁLIDO y no es un descuido:** es el default de la columna y el centinela que `calcPrecio()` usa (`if (!f.divisor) return null`) para dejar el precio vacío y que se ponga a mano, o para mandarlo a `precio_fijo`. Hay filas reales apoyadas en eso (3 marcas + 10 excepciones). Rechazarlo habría roto guardarlas. Nunca se divide entre 0 — el centinela corta antes.
> - **Los dos bordes, y por qué ahí:** techo **1.00 inclusive** (arriba de 1 el precio queda POR DEBAJO del costo = definición de error de tipeo; 1.00 exacto es vender al costo, raro pero no destructivo). Piso **0.10**, porque el error simétrico es igual de caro: `0.07` en vez de `0.7` daría el precio **10× más caro**. El margen más agresivo que el negocio usó nunca es **0.63** (CK Legwear), así que el piso deja 6× de aire y no bloquea ninguna decisión concebible — mismo criterio holgado que el guard de costo diario: **un valor GRANDE no es un valor IMPOSIBLE.**
> - **El guard hace la conversión él mismo** en vez de recibir un `Number(body.divisor)` ya hecho: con la coerción del llamador, `null`, `""` y `[]` llegaban convertidos en **0** y se habrían leído como "sin fórmula", **borrando una fórmula buena en silencio**.
> - ⚠️ **Daño medido:** 3 plantillas de `TH Tommy Jeans` se descargaron con el divisor malo (3-jul, 21-jul y 22-jul; Angela / Fashion Wear; 10 estilos, 828 unidades, **$16.177,92** de costo). `carga_history` NO guarda los precios, solo los totales, y el Excel se sube a Switch a mano — **hay que revisar en Switch los precios de esos estilos**, el arreglo del divisor no los corrige hacia atrás.
> - Candado: `src/__tests__/lib/divisor-rango.test.ts` (46 casos, verificado por mutación: desarmar el techo rompe 11). Incluye barrido estático — una ruta que escriba un divisor sin llamar al guard pone el build **ROJO**.
> - **Barrido del mismo patrón "porcentaje vs fracción" (27-jul):** `comision_vendedor_tasa.tasa_venta` ya está blindada (`config/route.ts:90`, cap `0..0.20`, decimal). `itbms_pct` es un enum cerrado `0|7` (porcentaje entero, siempre `/100` al usarse) y `descuento_global_pct` es solo lectura desde Switch. **El divisor era el único campo de configuración sin tope.**

- **Soft delete (`deleted` boolean), por módulo:**
  - Caja: `caja_gastos` (+ `deleted_by`, `deleted_at`), `caja_periodos`
  - Préstamos: `prestamos_empleados`, `prestamos_movimientos`
  - Reclamos: `reclamos`, `reclamo_items`, `reclamo_settlements`
  - Cheques: `cheques`
  - Guías: `guia_transporte`, `guia_items`
  - Directorio: `directorio_clientes`, `clientes_master`
  - Nota: `packing_lists` usa `deleted_at` (timestamp), NO la columna `deleted` — patrón distinto.
- **Vistas / Materialized views:** Convención de nombres: sufijo `_mv` = materialized view, `_vw` = view. (No verificado contra catálogo pg — vía REST no se distingue MV de view; confirmar con acceso a catálogo si se necesita certeza.)
  - `ventas_rollup_mensual_mv` (única `_mv`), `clientes_agregado_12m_vw`, `clientes_empresa_12m_vw`, `reebok_pedidos_unificado_vw`, `switch_costo_unificado_vw`, `switch_ventas_unificado_vw`, `_multifashion_sf_vw`
  - **Borradas en la limpieza del 26-jul-2026** (migración `20260726210100`): `switch_ventas_netas_vw` (nunca se usó — incluye ITBMS, lo descartó `20260529000300:22`), `switch_ultimo_pago_cliente` v1 (el CXC lee la `_v2`) y `cxc_aging` (la sucedió `switch_estadocuenta_aging_mv`). Tablas borradas en la misma tanda: `webauthn_credentials`, `chat_history`, `backup_clientes_master_20260509`, `fg_audit_log` (+ su ruta `/api/audit`, sin llamadores y con la tabla vacía) y `ventas_clientes` (+ su ruta `/api/ventas/clientes`; la UI usa `/api/ventas/clientes-12m`).
  - **Filas muertas y autovacuum (26-jul-2026, migración `20260726210200`):** `switch_recibos` (18,3%), `multifashion_tickets` (17,7%) y `switch_facturas` (2,4%) tienen `autovacuum_vacuum_scale_factor = 0.05`. La causa del churn es el sync: recibos hacía DELETE+INSERT de 3 meses 4×/día (no hay llave natural para upsert), tickets hace UPDATE ciego de la ventana, y facturas hace upsert no selectivo con `updated_at = now()`. El ajuste de autovacuum es paliativo; la cura para recibos ya está aplicada (ver abajo), la de tickets fue apagar el sync entero (ver abajo), y `20260726210300` (corrida A, sin bloqueo) es lo que devuelve el espacio ya inflado.
  - **`multifashion_tickets` — TABLA CONGELADA el 26-jul-2026. Ya no se escribe; los datos QUEDAN.** Era una copia derivada: las mismas facturas de `american_classic` que ya viven en `switch_facturas` (fecha, subtotal, descuento, impuesto, total, saldo) más un `switch_factura_id` que apunta a la factura. **Nadie la leía** — se auditó el código TS, los 57 RPCs y las 15 vistas que PostgREST expone, las migraciones, los scripts, `vercel.json`, el backup y el módulo Multifashion entero: cero lectores. El módulo saca TODOS sus números de `switch_facturas` vía `_multifashion_sf_vw`, y `switch_facturas` de american_classic arranca el **2024-05-07**, un año antes que los tickets (2025-05-02) y con 28.225 filas contra 15.819. La propia migración que la creó (`20260530000000`) decía "retirar en fase 3". Su cron reescribía **183 filas/día con un request HTTP por fila** para 0-6 cambios reales (el 97% de los tiquetes nace con saldo 0 y no se mueve nunca; solo 455 de 15.819 tienen saldo ≠ 0).
    - **Qué se apagó:** la entrada `/api/cron/multifashion-sync` de `vercel.json` (54 → 53 crons), el route entero, `src/lib/switch-api/sync.ts` (única librería que la escribía), `scripts/multifashion-backfill.ts`, el colateral de `switch-reconciliacion` (si quedaba, la reconciliación lo vería sin heartbeat 3×/día y volvería a escribir la tabla por la puerta de atrás) y sus filas en `EXPECTED_CRONS` (health-crons), `COLATERAL_RECOVER_AFTER_HOUR_UTC`, `SWITCH_CRON_ENTRADAS` y `CRONS_CUBIERTOS_POR_SYNC_LOG`. `multifashion_sync_log` (98 filas) queda congelada también: solo la escribía ese cron.
    - **Los datos NO se borraron**: 15.819 filas desde 2025-05-02. **Candidata a borrar si en unos meses nadie las extraña** — apagar la escritura se deshace en un minuto, borrar 15.819 filas no.
    - **El backup la SIGUE copiando** a propósito (`SWITCH_DATASETS` en el cron backup): mientras las filas existan es la única copia que las protege, y una tabla congelada comprime igual todos los días. Se saca del backup en el MISMO cambio que borre la tabla, nunca antes.
    - **Cómo volver a encenderla:** revertir el PR "retirar multifashion_tickets" (`git revert`) — trae de vuelta el route, `sync.ts`, la entrada de `vercel.json` y las 4 listas de vigilancia de una sola vez. Borrar también el candado `src/__tests__/lib/multifashion-tickets-congelada.test.ts`, que es lo que hace fallar el build si alguien vuelve a escribirla sin querer.
  - **`switch_recibos` — escritura selectiva (26-jul-2026).** El sync ya NO reescribe la ventana entera. Antes: DELETE de los 3 meses + INSERT de todo, en cada una de las 4 corridas diarias = **3.416 filas borradas + 3.416 insertadas por corrida** (13.664 filas muertas/día) para reflejar **~10 recibos nuevos** (medido: 41,4 recibos/día de alta real sobre 18 días). Ahora `leerMesGuardado()` trae el mes tal como está, `diffRecibos()` (`src/lib/switch-api/recibos-diff.ts`) lo compara contra lo que devolvió Switch y solo se escriben las diferencias. Medido contra producción el 26-jul: **3.416/3.416 filas pareadas, 0 escrituras, equivalencia exacta fila por fila** (`scripts/_diag-recibos-churn.ts`, solo lectura).
    - **La garantía de las BAJAS se conserva por construcción.** `existentes` = exactamente lo que borraba el DELETE viejo (mismo predicado), `deseadas` = exactamente lo que insertaba el INSERT viejo → `(tabla \ borrar) ∪ insertar` = `(tabla \ existentes) ∪ deseadas`. Un recibo que Switch anuló no se parea con nada y se borra igual que antes. Demostración completa en el encabezado de `recibos-diff.ts`.
    - **Por qué no puede conservar un dato viejo:** el único riesgo de un diff es el falso positivo. Las normalizaciones son sin pérdida contra la precisión de las columnas (`total` a 4 decimales = `numeric(14,4)`; `fecha_creacion` al milisegundo). Si alguna quedara corta el error sería falso NEGATIVO → se reescribe la fila (churn), nunca un dato desactualizado. En el peor caso el diff degrada al DELETE+INSERT de antes.
    - ⚠️ **`db-max-rows` = 1000 y corta EN SILENCIO.** `.range(0, 49999)` devuelve 1.000 filas sin error. `american_classic` jun-2026 tiene 1.259 recibos: sin paginar, las 259 invisibles se habrían leído como ausentes y **re-insertado en cada corrida** (recibos duplicados → comisión-cobro inflada). `leerMesGuardado()` pagina con `order("id")` —hace falta orden estable— y **verifica el total contra un `count: "exact"`**, cortando con error si no cuadra. Candados: `src/__tests__/lib/recibos-lectura-mes.test.ts` y `recibos-diff.test.ts`. **Cualquier otro lugar que compare contra una lectura de PostgREST tiene el mismo riesgo.**
    - `records_inserted` del `switch_sync_log` sigue siendo el TAMAÑO DE LA VENTANA, no lo escrito: es lo que muestran `/api/sync-status` y "Actualizar ahora". `synced_at` de las filas sin cambio queda con el sello de la corrida que las escribió — nadie la lee (solo la escribe el sync y la copia el backup).
    - ✅ **`loadImpuestoMap()` PAGINADO (26-jul-2026).** Tenía el mismo defecto: `.range(0, 99999)` sobre `switch_facturas` traía 1.000 filas en silencio. Solo truncaba en `american_classic` (3.904 facturas en la ventana contra 47-208 de las 5 B2B, muy por debajo del tope), pero el día que una B2B pase de 1.000 facturas en 4 meses, una retención de ITBMS real no se reconocería y se guardaría como **cobro real** → plata que nunca entró contada como cobrada en el "último pago" del CXC y en la comisión sobre cobro. Ahora pagina con `order("id")` y verifica contra `count: "exact"`, igual que `leerMesGuardado`. Además **falla cerrada**: antes un error del select devolvía un mapa VACÍO (todos los recibos → `es_retencion=false`); ahora lanza y la empresa queda `ok:false` en `switch_sync_log` con el mes intacto. Candado: `src/__tests__/lib/recibos-impuesto-map-paginado.test.ts` (incluye un chequeo estático que falla si alguien vuelve a meter un `.range()` con tope ≥ 1000 en el archivo).
    - ✅ **El MOSTRADOR no retiene ITBMS — guard aplicado (26-jul-2026, aprobado por Daniel).** Paginar el mapa destapaba **20 falsos positivos** de la heurística en `american_classic`. La heurística ("el recibo coincide con `impuesto/2` de ALGUNA factura del cliente dentro de ±35 días") asume un puñado de facturas candidatas; contra el pseudo-cliente de mostrador —**25.800 de las ~26.500** facturas de la empresa, 3.455 solo en la ventana— deja de ser evidencia y pasa a ser el problema del cumpleaños: un recibo de **$2.00 cuadra con 6 facturas distintas** y uno de $0.01 con 4. Y de fondo es una figura fiscal: agente de retención es un negocio registrado, no quien paga en efectivo en el mostrador. Los 6 `es_retencion=true` históricos de esa empresa son todos del mostrador, o sea la misma colisión.
      - **La identidad es `cliente_codigo = 'TCKCTA'`, NO el nombre.** El nombre cambia por empresa —verificado en la tabla: `"CONTADO"` en american_classic, `"VENTAS"` en vistana/fashion_wear, `"VENTAS LOCA"` en fashion_shoes, `"Contado"` en active_shoes/active_wear— mientras el código es **siempre `TCKCTA`**. Comparar por nombre habría sido un colador. `TCKCTA` además **ya es el criterio del sistema** para lo mismo: las RPC de comisión lo excluyen de la base de cobro sobre la MISMA tabla (`AND COALESCE(r.cliente_codigo,'') <> 'TCKCTA'` en `comision_b2b_v4/v5`, `comision_cobro_v3`, `comision_detalle`) y el checkout público lo resuelve con `CODIGO_CLIENTE_CONTADO` (`lib/catalogo/publico-switch-actor.ts`), constante que se REUSA en vez de duplicarla.
      - **Impacto medido del guard (26-jul-2026, ventana may-jul):** en `american_classic` cancela exactamente los 20 falsos positivos → **cambio neto CERO**. En 3 empresas B2B apaga **4 recibos** que hoy están marcados como retención: vistana 1, fashion_wear 2, fashion_shoes 1. **Los 4 son de total $0.00 y del pseudo-cliente mostrador**, o sea el caso degenerado de la heurística (un recibo de $0 "coincide" con `impuesto/2` de cualquier factura con ITBMS 0). No mueven un centavo: el **"último pago" no cambia para ningún cliente de ninguna empresa** (medido), y en comisiones son irrelevantes por partida doble — las RPC ya excluyen `TCKCTA` de la base de cobro Y suman por `total`, que es 0. Evidencia: `scripts/_probe-guard-impacto.ts`.
  - ✅ **`db-max-rows` = 1000 — barrido del repo COMPLETADO (26-jul-2026).** Helper único: **`src/lib/supabase-paginado.ts` → `leerTodoPaginado()`** (pagina, exige `count: "exact"` y **revienta** si lo leído no cuadra). Se blindaron: `leerMesGuardado` y `loadImpuestoMap` (sync-recibos), `buildSwitchIdMap` (sync-utilidad), frescura de CXC (`api/upload` + `api/notification-badges`), `api/catalogo/switch-clientes`, `lib/ventas/queries.ts`, catálogo público (`api/catalogo/[marca]/public`) y `api/catalogo/reebok/stats` + `/inventory`.
    - 🩸 **LECCIÓN CARA — contar la TABLA no es contar la CONSULTA.** El primer barrido dio 4 truncados "confirmados" a partir del tamaño de la tabla. Al medirlos consulta por consulta, **3 de los 4 eran falsa alarma**: la consulta real filtra y nunca se acerca a 1.000. `clientes_empresa_12m_vw` tiene 1.563 filas **pero se lee con `.eq("empresa", …)`** → máx. 791 (confecciones_boston), y el modo "Todas" usa otra vista de 115 filas. `switch_clientes` tiene 1.710 **pero se lee con `.eq("empresa_key", …)`** → 136-137 por marca. `products`/`inventory` del catálogo tienen 224 filas cada una, no miles. **Antes de declarar un truncado hay que correr LA CONSULTA con sus filtros y comparar contra su propio COUNT** — el tamaño de la tabla solo dice que el bug es posible, no que esté ocurriendo.
    - **El único que truncaba de verdad era `switch_estadocuenta`** (1.000 de 1.511) — y aun así **no cambia ningún número en pantalla**: las 6 empresas ya salían con su frescura correcta y el badge `cxcStale` da 0 antes y después. Es suerte, no diseño: las 6 sincronizan con minutos de diferencia y las 1.000 filas más recientes alcanzaban a incluir al menos una de cada una. Con otro reparto de filas por empresa, una se quedaba sin frescura. Por eso se arregla igual.
    - **REGLA — el orden de negocio NO se cambia al paginar.** Paginar exige un orden TOTAL (con filas empatadas PostgREST puede repetir o saltear entre páginas), pero cambiar la columna de orden cambiaría el orden en que el usuario ve los datos. Se conserva el orden original y se le agrega una columna única como **desempate**: `created_at desc, id` · `nombre, cliente_switch_id` · `ultima_compra desc, cliente_nombre, cliente_id` · `size, id`. Donde el orden sólo servía para tomar un máximo (frescura de CXC) se pagina por `id` y el máximo se calcula explícito — más robusto que confiar en "la primera fila gana".
    - **Dos disfraces del bug, ambos vedados por el candado:** (1) `.limit(N)` con N > 1000 es "alguien creyó estar cubierto" y no cubre nada; (2) paginar **sin `.order()`** no arregla nada. Candado: `src/__tests__/lib/supabase-paginado.test.ts` (comportamiento + barrido estático sobre los 9 archivos saneados).
    - **Medidos y SANOS hoy** (registrados para no volver a auditarlos a ciegas): `switch_estadocuenta_aging_mv` 218, `clientes_agregado_12m_vw` 115, `guia_items` 427, `prestamos_movimientos` 393, `guia_transporte` 160, `switch_proveedor_estadocuenta` 66, `directorio_clientes` 33, `reclamos` 31, `cheques` 5, `packing_lists` 0.
    - ⚠️ **Queda pendiente:** `api/multifashion/fidelizacion/route.ts:67,80,93` pagina pero **sin `.order()`**, y agrega. No se tocó en esta tanda.
    - **El doble de Supabase del arnés de catálogos** (`src/__tests__/helpers/catalogo-mock-db.ts`) ahora devuelve `count` = largo de `data` por defecto, como haría PostgREST. Antes entregaba filas con `count: null` — la firma de una lectura NO verificable — y hacía fallar en el arnés a lectores que en producción reciben el count perfectamente.
  - **`switch_sync_log` se poda** desde el cron `cleanup-sessions` (02:30 UTC) vía la RPC `podar_switch_sync_log(90)`: retención de 90 días, pero SIEMPRE conserva las 10 filas más recientes de cada `(empresa_key, sync_type)` y nunca toca `status='running'`. Los tres lectores que no filtran por fecha (`alert-policy`, `/api/sync-status`, `/api/admin/sync-now`) piden "las últimas N de este par": una poda por fecha pura le borraría la última fila a un par retirado y el panel diría "nunca sincronizó". El paso es NO FATAL dentro del cron.
- **Flags de negocio:**
  - `is_wholesale`: en `ventas_raw`, `switch_facturas` y `_multifashion_sf_vw` (segrega retail/wholesale en Multifashion)
  - `is_preorder`: en `reebok_order_items` (preventa Reebok)
- **Tablas UX audit (abril 2026):**
  - `cxc_favorites` — favoritos ⭐ por usuario (antes localStorage)
  - `reclamo_custom_motivos` — motivos personalizados de reclamos (antes localStorage)
  - `reebok_orders.client_email` — email del cliente capturado al crear pedido

## Switch Soft (ERP externo)
- CSVs semicolon-delimited (`;`)
- Encoding: **latin-1** para inventario Reebok, **UTF-8** para CXC y Ventas
- Upload: 100% manual (drag-drop), no hay API/SFTP
- Auto-detect delimiter en CXC upload (`;` o `,`)
- Upload de ventas muestra resumen de filas excluidas con razón

## Email (Resend)
- `noreply@fashiongr.com` — cheques reminders
- `notificaciones@fashiongr.com` — alertas, reports, guias, reebok
- `info@fashiongr.com` — reclamos a proveedores
- `pedidos@fashiongr.com` — guias notify

## Crons (vercel.json)
64 entradas configuradas (53 hasta el 26-jul-2026 cuando se retiró `multifashion-sync`, +11 del vigía `db-salud` el 27-jul — ver abajo). **Una entrada = una ocurrencia al día**: para frecuencia sub-diaria se agregan entradas separadas del mismo path, NUNCA una lista de horas (`0 15,19,23 * * *`), que Vercel Pro sí acepta — ver la nota de slots más abajo. Límite Vercel Pro: 100 cron jobs/proyecto.

| Cron | Schedule (UTC) |
|------|----------------|
| /api/cron/db-salud | 01:45, 04:35, 07:25, 09:55, 12:25, 14:45, 16:45, 18:45, 20:25, 21:45, 22:45 (11 entradas — vigía de recursos, ver nota abajo) |
| /api/cron/cleanup-sessions | 02:30 (revoca sesiones inactivas — ver nota abajo) |
| /api/cron/cleanup-packing-lists | 03:00 |
| /api/cron/switch-sync tipo=all (vistana, active_wear) | 05:30 |
| /api/cron/switch-sync tipo=all (fashion_shoes, fashion_wear) | 05:35 |
| /api/cron/switch-sync tipo=all (active_shoes, joystep) | 05:40 |
| /api/cron/backup | 06:00, 10:30, 18:30 (3 entradas — las 2ª/3ª son "segunda oportunidad": no-op si una anterior ya registró success hoy) |
| /api/cron/backup?grupo=switch | 06:45, 11:15, **23:30** (3 entradas, mismo guard no-op) |
| /api/cron/backup?grupo=storage | 04:00, 15:30 (2 entradas — réplica off-site de los buckets de Storage a Cloudflare R2) |

> **`db-salud` — el único vigía que NO depende de la base (27-jul-2026).** Lee el endpoint Prometheus de Supabase (`https://<ref>.supabase.co/customer/v1/privileged/metrics`, Basic auth `service_role:<SUPABASE_SERVICE_ROLE_KEY>`; add-on GRATIS del plan Pro, no existe en Free — verificado contra producción: HTTP 200, 135 KB, 317 métricas), lo compara contra los umbrales de `src/lib/db-recursos.ts` y avisa a Telegram. **Por qué hacía falta:** el 26-jul la base devolvió 521 durante 1 h 16 min (22:41→23:57 UTC) y `cron_email_errors` no registró **ni una fila** de esa ventana — porque esa tabla vive DENTRO de la base caída. Toda la telemetría del sistema tenía el mismo defecto: escribe en el paciente. Acá el camino métricas HTTP → Telegram no toca Postgres, y el orden del route lo respeta (Telegram PRIMERO, base después). El dedup contra `cron_email_errors` (5 h por tipo) es **fail-ABIERTO**: si la consulta falla —típicamente porque la base está caída, o sea el caso que importa— se alerta igual.
> - **Umbrales** calibrados contra la línea base real con Micro en reposo (memoria libre 56,8 % · swap 13,5 % · disco /data 92 % · base 261 MB de 8 GB · load5 0,04 sobre 2 núcleos · 9 de 60 conexiones): avisa bajo 20 % de memoria libre, sobre 40 % de swap, bajo 25 % de disco, sobre 75 % de los 8 GB, sobre 1,5 de carga por núcleo, sobre 70 % de conexiones. Crítico en 10 / 70 / 12 / 90 / 3 / 90.
> - **Ojo con MemFree**: son 76 MB (8 %) en reposo. El número que vale es `MemAvailable` (539 MB, 57 %) — usar MemFree haría alertar todos los días. Igual con el disco: la partición correcta es `/data` (92 % libre), no `/` (28 %). Candados en `src/__tests__/lib/db-recursos.test.ts`.
> - **11 entradas, reparto NO uniforme**: más denso de tarde/noche (hueco máximo 180 min, mínimo 60 min entre 21:45 y 22:45), que es cuando corren los crons pesados y cuando ocurrió la caída. En la banda 00:00-05:00 hay que quedar a ≥30 min de los crons nocturnos — `cleanup-sessions.test.ts` lo hace fallar si no (fue lo que rechazó el primer reparto uniforme de 2 h).
> - **Para mirar sin spamear**: `GET /api/cron/db-salud?test=true` (sesión admin) devuelve muestra + evaluación **sin** tocar Telegram ni la base.
> - Runbook para Daniel: `docs/runbook-base-lenta.md`.
>
> **Un backup fallido ya no pisa el índice bueno (27-jul-2026).** El meta (`meta.json` / `meta-switch.json`) es lo que le dice a `restore.mjs` QUÉ tablas restaurar y cuántas filas esperar. Se subía siempre, con `upsert: true`, incluso cuando todos los datasets habían fallado. La corrida `?grupo=switch` de las 23:30 del 26-jul cayó dentro de la caída de Supabase y subió un meta con `datasets: []` y 60 KB del HTML del 521, **pisando el bueno de la 01:28**. Medido en R2: `data/2026-07-26/` tenía los 59 objetos correctos y el índice decía cero — `restore.mjs --list` mostraba "OK … switch 0". La peor forma de fallar: una copia buena que se ve inservible. Ahora, si la corrida no salvó NI UN dataset y hubo errores, el meta viejo se conserva (en Supabase **y** en R2) y sale un aviso a Telegram. Una corrida PARCIAL sí escribe: refleja lo que quedó. Agravante que lo hace urgente: 23:30 es la ÚLTIMA entrada del grupo switch del día UTC — no hay segunda oportunidad detrás. Candado: `src/__tests__/lib/backup-meta-no-pisar.test.ts`.
>
> **`?grupo=switch` salió del horario de oficina: 19:15 → 23:30 UTC (26-jul-2026).** Es el ÚNICO grupo de backup que barre las tablas grandes (`SWITCH_DATASETS`: `switch_articulo_diario` 197k filas + `switch_facturas` 52k; el grupo core NO las incluye), y a las 19:15 UTC = **14:15 Panamá** lo hacía en plena tarde. Movido a 23:30 UTC (18:30 Panamá), **dentro del mismo día UTC** — el guard no-op de la 2ª oportunidad compara contra el día UTC, así que cruzar la medianoche la habría convertido en la corrida primaria del día siguiente — y con margen antes de la ventana de deploy 23:50-00:20. `EXTRA_ENTRY_HOURS_UTC` se actualizó en el mismo commit; `cron-calendario.test.ts` ahora **deriva** esas horas de vercel.json en vez de repetirlas a mano.
>
> **Es higiene, NO el arreglo de los picos de /ventas — no confundirlos.** Se probó la hipótesis de que este scan enfriara la caché y disparara los picos: UNA observación lo sugirió (270 ms → 1.514 ms justo después de un scan) pero **3 ensayos controlados no la reprodujeron**, y en uno el pico apareció ANTES del scan. Los picos de /ventas eran el seq scan de las RPC no sargables (ver la regla de rangos en "Base de datos"); eso se arregló aparte. Mover el backup se sostiene solo por sentido común (barrer 250k filas en horario de oficina no aporta nada), no por evidencia causal.
>
> **Backup — estructura en R2 y completitud (jul-2026):** los 3 grupos escriben en el MISMO esquema: `data/YYYY-MM-DD/<tabla>.ndjson.gz` + `data/YYYY-MM-DD/meta.json` (core, 49 datasets), `data/YYYY-MM-DD/meta-switch.json` (switch, 8), y `_storage/<bucket>/<path>` con path ESTABLE (binarios inmutables — versionarlos por fecha multiplicaría 198 MB/día sin ganar nada). El `manifest.json` de la raíz NO es dedup entre días: las keys llevan la fecha, así que solo evita repetir trabajo dentro del mismo día (2ª/3ª entrada, pendientes por deadline).
> **Storage: una sola réplica, y vive en R2 (26-jul-2026).** La copia bucket→bucket DENTRO de Supabase (`backups/_storage/<bucket>/<path>`) se eliminó: eran **1.596 archivos / 103,2 MB** en el MISMO proyecto que decía proteger, el 18% del GB del plan (Storage estaba al 56%), y encima nunca había copiado `marketing` (55,1 MB) ni `joybees-photos` (15,9 MB). R2 sí tiene los 5 buckets completos (3.204 archivos, 198 MB), verificados uno a uno por tamaño + 20 por sha256 antes de borrar. Restore: `node scripts/restore.mjs --source r2 --storage <bucket>` (sin `--source` ya asume r2; con `--source supabase` corta con mensaje). Candado: `src/__tests__/lib/backup-storage-solo-r2.test.ts`. **No reintroducir la copia intra-Supabase.** Lo único que queda bajo ese prefijo es `_storage/meta-r2.json`, el resumen auditable de la réplica a R2.
>
> Una carpeta de fecha necesita **los DOS metas** para ser restaurable. `scripts/restore.mjs --list` valida eso y marca `OK / PARCIAL / DAÑADO / INSERVIBLE` (antes listaba las carpetas a secas: el 25-jul mostraba `2026-07-25` como disponible y el restore moría con 404 en meta.json). La corrida core evalúa AYER y alerta por Telegram (`backup_r2_incompleto`) si quedó a medias. Retención R2: `RETENCION_R2` = 21 diarios + 8 lunes + 24 días-1, **solo informe** (no borra nada en R2 todavía).
| /api/cron/switch-sync tipo=all (american_classic, confecciones_boston) | 06:30 |
| /api/cron/sync-utilidad | 07:00 |
| /api/cron/sync-clientes-master | 07:00 |
| /api/cron/refresh-clientes-views | 07:35 (fuera del minuto 06:30 de switch-sync AC/Boston y de la ráfaga 07:00-07:31 — solo DB, sin Switch) |
| /api/cron/sync-recibos (pagos) | 07:50, 15:15, 19:15, 23:15 (4 entradas — corridas REALES, no "segunda oportunidad": el route no tiene guard no-op y re-lee la ventana rodante de 3 meses cada vez, pero desde el 26-jul-2026 solo ESCRIBE lo que cambió — ver "escritura selectiva" en Base de datos. Las 3 de la tarde van 15 min DESPUÉS de las ventas porque comparten 6 empresas) |
| /api/cron/switch-articulos | 08:40 |
| /api/cron/acs-fidelizacion | 11:30, 16:30 (2 entradas — la 2ª es "segunda oportunidad": no-op si la 1ª ya registró success hoy; 11:30 esquiva sync-recibos 07:50 y switch-articulos 08:40 en american_classic) |
| /api/cron/reebok-catalogo | 12:10, 17:00 (2 entradas — solo toca active_shoes en Switch; 12:10 esquiva sync-utilidad 07:00 en active_shoes) |
| /api/cron/sync-proveedores | 09:30 |
| /api/cron/joybees-catalogo | 11:00, 17:05 (2 entradas — solo toca joystep en Switch) |
| /api/cron/tommy-catalogo | 12:40, 17:40 (2 entradas — solo toca fashion_shoes; artículos marcaId=3; mientras la DDL 20260724150000 no corra se omite limpio sin tocar Switch) |
| /api/cron/integrity-check | 12:00 |
| /api/cron/cheques-alert | **14:15** (9:15 a.m. Panamá — aviso de cheques por vencer, ver nota abajo) |
| /api/cron/switch-reconciliacion | 10:00, 14:00, 18:00 (3 entradas) |
| /api/cron/switch-sync tipo=facturas — **ventas** | 11:50, 13:00, 15:00, 17:00, 19:00, 21:00, 23:00, 00:15 (8 entradas). **13/17/21 y 00:15 = solo american_classic** (ventas ACS cada 2h; 00:15 = sync de cierre, tras cerrar tienda 7pm Panamá — de él depende el resumen de la 01:00). **11:50/15/19/23 = las 8 empresas con facturas** (ACS + las 7 B2B): 06:50, 10:00, 14:00 y 18:00 Panamá |
| /api/cron/acs-resumen-diario | 01:00 (resumen diario ventas ACS a Telegram; 20:00 Panamá = 8pm, tras el sync de cierre de 00:15) |
| /api/cron/grupo-resumen-mensual | 13:00 el día 3 de cada mes (`0 13 3 * *` — resumen mensual del grupo a Telegram; único cron NO diario, umbral propio en health-crons) |
| /api/cron/switch-sync tipo=estadocuenta (3 pares B2B) | 16:00/16:05/16:10 y 21:10/21:15/21:20 (6 entradas — CXC intradía; ronda 1 con active_shoes,joystep PRIMERO para dar 60 min a reebok-catalogo 17:00) |

> **`cheques-alert` — aviso el DÍA HÁBIL ANTERIOR, 14:15 UTC = 9:15 a.m. Panamá (27-jul-2026).** Pedido de Daniel, textual: *"QUIERO aviso de cuando se vence un cheque un dia antes, almenos q venca el lunes, avisame el viernes."* Corriendo un día hábil D, la ventana de `fecha_deposito` es **[D, N]** con N = el próximo día hábil después de D: jueves→viernes, **viernes→sábado+domingo+lunes**, sábado/domingo→**no se manda nada**. La regla vive en `src/lib/cheques-aviso-ventana.ts` (módulo PURO, sin base ni Telegram); el I/O en `cheques-alert.ts`.
> - **Por qué la ventana llega hasta el próximo día hábil y no solo "mañana":** si el viernes solo mirara mañana, un cheque que vence el **sábado** no se avisaría nunca — sábado y domingo no hay aviso y el lunes ya venció. Antes el cron miraba hoy+mañana a secas y ese hueco existía. **HOY sigue incluido** (comportamiento previo, y a Daniel le sirve el recordatorio del día): un cheque del lunes se anuncia el viernes *"el lunes 3 ago"* y otra vez el lunes *"HOY"* — días distintos, no un duplicado.
> - **Anti-duplicado (`yaAvisoHoy`):** el `cron_heartbeats` de `cheques-alert` es la llave. Si hay un success posterior al inicio del día **Panamá** (05:00 UTC), la corrida no manda nada — cubre el reintento de Vercel y la recuperación de la reconciliación. **Fail-OPEN**: si no se puede leer el heartbeat, el aviso sale igual (perder un cheque cuesta más que repetir un mensaje). El heartbeat se registra **también** el fin de semana y sin cheques, o el watchdog alertaría cada sábado.
> - **Por qué 14:15 y no 14:00 en punto:** 14:00 es `switch-reconciliacion`, que puede correr hasta 740 s. 14:15 queda limpio y a 30 min de `db-salud` 14:45. Y `COLATERAL_RECOVER_AFTER_HOUR_UTC["cheques-alert"]` subió **14 → 15** para que la pasada de las 14:00 no se adelante 15 min a su propio run (solo recupera la de las 18:00).
> - **Filtros:** `estado='pendiente'` **y `deleted=false`** — lo segundo faltaba: un cheque borrado (soft-delete) seguía avisando. **Sin cheques por vencer NO se manda mensaje** (un "no hay nada" diario es ruido).
> - ⚠️ **Feriados de Panamá: NO los tenemos y no se inventa un calendario.** Si el lunes es feriado el aviso igual salió el viernes, que es lo correcto. Lo que queda descubierto es el caso inverso: un cheque que vence el martes tras un lunes feriado se avisa el lunes (feriado) en vez del viernes. Limitación conocida y aceptada.
> - Para ver el texto sin spamear Telegram: `npx tsx scripts/_dryrun-cheques-aviso.ts`. Candado: `src/__tests__/lib/cheques-aviso-vencimiento.test.ts` (20 casos con fechas FIJAS).
>
> **Corrida temprana de ventas 11:50 UTC = 06:50 Panamá (26-jul-2026):** las 8 empresas, `tipo=facturas`, slot `facturas-1150`. Cierra el hueco entre el bloque `tipo=all` de la madrugada (00:30-01:30 Panamá) y las 10:00 a.m.: quien entraba a trabajar a las 8 a.m. veía datos de 7h30 atrás; ahora ve los de las 6:50 a.m. (1h10). **Por qué 11:50 y no 12:00:** a las 12:10 corre `reebok-catalogo` (active_shoes) — 12:00 dejaría 10 min, por debajo de los 15 de `SEPARACION_MINIMA_MIN`. 11:50 queda a 20 min de sus dos vecinos (`acs-fidelizacion` 11:30 y `reebok-catalogo` 12:10) y la corrida dura ~1 min. `integrity-check` 12:00 no toca Switch.
>
> **Ventas B2B y ventas ACS a la misma hora, en UNA sola entrada (26-jul-2026):** a las 11:50/15/19/23 UTC el sync de facturas cubre las 8 empresas en una entrada, no dos. Dos entradas de `tipo=facturas` a la misma hora producirían el MISMO nombre de slot (`facturas-1500`, derivado de `<tipo>-<hhmm>`) → heartbeats pisados y `slotsHuerfanos` sin poder decir cuál ocurrencia se perdió. Las empresas se procesan serialmente dentro del route (sesión única) con american_classic primero; la corrida completa mide ~1 min (facturas son 4-8 s por empresa).
>
> **Por qué 15/19/23 y no 14/18/22 (las 09:00/13:00/17:00 Panamá que se pidieron):** 14:00 y 18:00 son EXACTAMENTE las pasadas de `switch-reconciliacion`, que puede abrir la sesión de cualquier empresa hasta 12 min (`RECOVERY_BUDGET_MS` = 740 s). Se corrió todo una hora → 10:00/14:00/18:00 Panamá.
>
> **Plan Vercel Pro:** las funciones tienen tope `maxDuration` 800s (Fluid Compute). Cada entrada de cron sigue siendo 1×/día por diseño del sistema de slots, no por límite del plan.
>
> **Heartbeats por-slot de switch-sync:** cada entrada de switch-sync lleva `&slot=<tipo>-<hhmm>` (hhmm = hora UTC de su schedule, ej. `estadocuenta-2110`) y registra un heartbeat granular `switch-sync:<slot>` además del base. Los slots se DERIVAN de `SWITCH_CRON_ENTRADAS` (src/lib/cron-telemetry.ts) — fuente única: al agregar/mover una entrada de switch-sync se actualiza vercel.json y esa constante, y un test compara ambas. health-crons NO alerta por filas de slot que aún no existen (se siembran solas en <24h).
>
> **Slots huérfanos (jul-2026):** si la ocurrencia de un slot no dejó su heartbeat propio pero sus pares quedaron al día (recuperación de la reconciliación u otra entrada que cubre los mismos pares), `switch-reconciliacion` escribe la marca `switch-sync:<slot>#recuperado` y health-crons deja de contarlo como caído (`slotsCubiertos[]`, 200). La marca NUNCA pisa el heartbeat propio del slot: si la entrada lleva >50h (2 ocurrencias) sin correr de verdad, vuelve a reportarse — ESE es el anti-enmascaramiento.
>
> **El criterio de "cubierto" es el TRABAJO, no quién lo hizo (26-jul-2026).** Antes se exigía además que la entrada NO se hubiera invocado ("un slot que corrió y falló no se cubre"). Esa condición no protegía nada —el fallo ya se reporta como `corrio-y-fallo` mientras el trabajo esté pendiente— y dejaba un hueco: compensado el trabajo por otra corrida, el slot no recibía marca NI volvía a reportarse, y su heartbeat congelado disparaba "sin success reciente" en el watchdog día tras día con los datos frescos. Medido ese día: `facturas-1500` (invocación perdida) quedó silenciado y `estadocuenta-1605`/`1610` (corrieron 25-jul 16:20/16:22, fallaron, y la ronda de las 21:1x reparó los pares) alertaron — mismo estado, distinto trato. Lo único que sigue vedado es certificar una ocurrencia que la propia entrada resolvió ENTERA dentro de su ventana (`entradaHizoTodo`): ahí no hubo recuperación de nadie y un día sano debe seguir siendo cero marcas. El campo `entradaCorrio` de `slotsCubiertos[]` distingue los dos casos para auditoría.
>
> **Slots INTRADÍA — el ancla es la OCURRENCIA, no el día (jul-2026):** la reconciliación recupera por PAR (empresa, sync_type) contra el día Panamá. Para un cron diario eso alcanza; para uno intradía cuyo trabajo es "refrescar otra vez lo mismo", NO: el par ya tiene el success de la mañana. `clasificarSlots()` (src/lib/cron-telemetry.ts) pregunta lo correcto —"¿hay un success POSTERIOR a MI ocurrencia?"— y devuelve `cubiertos` (marca `#recuperado`) y `desatendidos`. Los `desatendidos` se **re-ejecutan** en la misma pasada, sumados al mapa por empresa (sesión única, un solo token). `motivo`:
> - `sin-invocacion` — Vercel perdió la corrida. Solo se declara cuando venció la ventana de jitter (`SLOT_RUN_WINDOW_MIN`=**30 min** desde el 26-jul-2026; era 120 bajo Hobby, donde el disparo se atrasaba hasta 58 min. Con Pro el disparo va de +1s a +40s y el slot más largo dura ~4 min): no adelantarse a una entrada que puede llegar tarde. Bajar el número fue lo que destapó la ronda de las 16:0x — con 120 min sus ocurrencias de 16:05 y 16:10 vencían 18:05/18:10, o sea después de su única pasada posterior (18:00), y no se re-ejecutaban nunca.
> - `corrio-y-fallo` — la entrada llegó y dejó el trabajo a medias. NO espera la ventana (ya no hay a quién esperar) y se **reporta** vía `alertSwitchCronErrors` con la política anti-ruido 401 intacta (un `statement timeout` no es silenciable → alerta ya). Dedup: si el propio route de switch-sync ya dejó rastro en `cron_email_errors` posterior a la ocurrencia, no se duplica.
>
> Guarda de concurrencia: una fila `running` más joven que `RUNNING_STALE_MIN` (30 min) congela el slot — no se re-ejecuta encima de una corrida viva. En un día sano el barrido es un **no-op total** (cero llamadas a Switch).

> **El candado de sync EXPIRA y se suelta solo (27-jul-2026).** El mutex que protege la sesión única de Switch es el índice único parcial `switch_sync_log_running_lock` sobre `(empresa_key, sync_type) WHERE status='running'`. Una fila 'running' solo se cierra si el proceso que la abrió llega VIVO a `finishSwitchSyncLog` — y cuando Vercel mata la función al agotar su `maxDuration`, **el proceso deja de existir en ese instante: no hay `finally`, `catch` ni handler de salida que alcance a escribir**. La fila queda abierta y el candado, puesto. No es un bug de manejo de errores; es la consecuencia de un kill, y ningún arreglo dentro del proceso puede evitarlo.
>
> 🩸 **La causa concreta era aritmética, no una carrera:** `/api/admin/sync-now` ("Actualizar ahora") declaraba `maxDuration = 300` y el sync de `catalogo_tommy` mide **427-485 s** (p50 485 s sobre 30 días). 300 s de presupuesto para 8 min de trabajo = **muerte garantizada en cada clic**. Medido el 27-jul: las 3 filas colgadas de ese día eran `triggered_by='manual'`; las corridas del cron `tommy-catalogo` (800 s) del mismo día salieron todas `success`. Ese techo subió a **800, igual que los crons** — corre exactamente los mismos syncs, así que no hay razón para que tenga menos presupuesto. Censo de 30 días: **12 atascos en 9 pares / 7 crons** (`catalogo_tommy` 3, `costo` 4, `estadocuenta` 4, `catalogo_reebok` 1); los de `by=cron` son muertes reales de la invocación (p. ej. el `statement timeout` del 25-jul). Evidencia reproducible: `node scripts/_diag-lock-atascado.mjs` (solo lectura).
>
> **Tres cambios, y los tres hacen falta:**
> - **El corte se DERIVA del techo real**, no es un número suelto: `RUNNING_STALE_MIN = ceil((FUNCTION_MAX_DURATION_S + margen)/60)` = 30 min, o sea **más del doble** de la vida máxima posible de un run (800 s). Una corrida VIVA nunca entra. `markStaleRunningLogs` (sync-empresa) era una **segunda implementación** con su propio `30 * 60 * 1000` a mano y su propia copia del mensaje: ahora delega en `clearStaleRunning`. Dos copias del mismo candado es una que se corrige sola y otra que empieza a soltar candados de corridas vivas.
> - **`barrerRunningAtascados()` — barrido GLOBAL**, de cualquier par, en `switch-reconciliacion` (10/14/18 UTC) y `cleanup-sessions` (02:30), ambos pasos NO FATALES. Sin esto la limpieza dependía de que volviera a correr **el mismo par**: `catalogo_tommy` corre 2×/día, así que la fila de las 18:52 mantenía el candado puesto hasta las 12:40 del día siguiente — **17 h 48 min bloqueando "Actualizar ahora"** por un proceso que ya no existía. En `cleanup-sessions` va ANTES de la poda a propósito: `podar_switch_sync_log` nunca borra filas 'running', así que una atascada sobrevivía a la poda para siempre.
> - **"error" vuelve a significar error.** El cierre por atasco lleva la marca **`#atascado`** (misma convención que `#recuperado`/`#visto`; `status` sigue siendo `'error'` porque el CHECK de la tabla solo admite running/success/error y no hacía falta DDL). `computeStreakSilenciable` **saltea** esas filas con `continue` en vez de cortar. Mentía en las dos direcciones: sumaba al streak y podía escalar una alerta de Switch por un timeout NUESTRO, y —peor— como el texto del atasco **no es silenciable**, la fila **CORTABA** el streak: un 401 real con una corrida atascada en el medio se leía como "primer fallo" y se callaba, corrida tras corrida. `esRunAtascado()` reconoce las 3 redacciones que existen en producción para que las 17 filas históricas también cuenten bien.
>
> **Lo que NO se tocó y no debe tocarse:** la protección de sesión única. Switch admite **un solo login por empresa** y dos syncs simultáneos de la misma empresa se tumban el token entre sí (code 0006). Un run RECIENTE sigue bloqueando igual que siempre. Candado: `src/__tests__/lib/sync-lock-atascado.test.ts` (17 casos), verificado por mutación — aflojar el corte a 1 min, quitar el skip de `#atascado` o devolver `sync-now` a 300 s rompen 6 tests.
>
> **Gracia de siembra acotada (jul-2026):** "fila de slot ausente = todavía no sembrada" ya no es eterno. La reconciliación escribe una vez la marca `switch-sync:<slot>#visto` (insert-if-absent) para los slots sin heartbeat propio; pasadas `SLOT_SEED_GRACE_HOURS` (50h) la ausencia se reporta como caído en health-crons y en el watchdog Telegram. Sin esto, `switch-sync:all-0540` llevaba desde el 23-jul sin fila propia (corrió y falló el 24, invocación perdida el 25) y era invisible para AMBOS vigías. Las marcas `#recuperado`/`#visto` no se vigilan como crons (`esMarcaDeSlot`).
>
> **`#visto` es además el PISO de ocurrencias (26-jul-2026).** `ultimaOcurrenciaUtc` ancla en la ocurrencia programada más reciente y, para una hora que hoy aún no llegó, esa ocurrencia cae AYER. Para una entrada creada HOY —el calendario pasó de 47 a 52 entradas a las 06:14 UTC— eso es una ocurrencia en la que la entrada no existía: la pasada de las 10:02 evaluó `facturas-1300/1700/1900/2100` contra las 13:00-21:00 del día anterior y, como american_classic/facturas tenía corridas posteriores, les escribió `#recuperado` certificando corridas que jamás estuvieron programadas. La rama simétrica era peor: con esos pares atrasados los mismos slots habrían salido `sin-invocacion` → re-sync contra Switch y alerta 🚨. Ahora `slotConocidoDesdeMs()` = el más antiguo de {heartbeat propio, `#visto`} y **ninguna ocurrencia anterior a ese instante se clasifica** —ni cubierta ni desatendida—. La marca se agrega al mapa en la misma pasada en que se escribe, así que el piso ya rige la primera vez. Sin ningún rastro (NaN) no hay piso: fail-abierto, para no volver ciego al clasificador si la escritura falla.
>
> **Un cron RETIRADO deja de alertar — registro único de crons vigilados (27-jul-2026).** Retirar un cron nunca borraba su fila de `cron_heartbeats`, y el watchdog Telegram recorre **todas** las filas de la tabla (health-crons no: recorre listas). Resultado: la fila huérfana envejecía para siempre y disparaba `⏰ Watchdog crons — N sin success reciente` **todos los días**. Medido: el #316 retiró `multifashion-sync` el 26-jul (entrada de vercel.json, route, librería y colateral) y su fila quedó con `last_success_at = 2026-07-26T05:00:34` → alerta diaria eterna por un cron que ya no existe. El mecanismo `esSlotRetirado` (#290) cubría exactamente esto pero **solo para los slots** de switch-sync, porque los slots se derivan de una lista; un heartbeat de nombre plano se escapaba por el costado.
> - **Ahora `esCronRetirado()` lo generaliza** (src/lib/cron-telemetry.ts): un `cron_name` que no esté en el registro de crons conocidos no se vigila. El registro son `CRONS_FAIL_CLOSED` (fila ausente = caído) + `SEED_TOLERANT_CRONS` (fila ausente = aún no sembrada), y `esSlotRetirado` queda como su rama de slots. `esHeartbeatNoVigilable()` suma las marcas (`#recuperado`/`#visto`) y los heartbeats de acción MANUAL (`HEARTBEATS_NO_CRON` → `sync-now-refresh-vistas`, que escribe el botón "Actualizar ahora" de Ventas como cooldown: nadie lo programa, así que estar stale es su estado normal. Era un falso positivo LATENTE — la fila no existe en producción todavía, pero el día que alguien usara el botón, el watchdog habría alertado 26h después).
> - **La tensión con el fail-closed se resuelve FUERA del runtime.** La regla ingenua "si no está en vercel.json no alerto" sería **peor que el bug**: quien borrara una entrada por accidente apagaría la alerta en silencio. Por eso el criterio de runtime mira un **registro de código**, que borrar vercel.json no encoge — el cron sigue vigilado, su heartbeat envejece y los dos vigías alertan igual que hoy. Retirar un cron a propósito son **dos ediciones deliberadas** (vercel.json + registro), y `src/__tests__/lib/cron-registro.test.ts` exige la **biyección** entre ambos: tocar uno solo pone el build **ROJO**. El accidente se atrapa en CI, no en silencio en producción. El mismo test verifica estáticamente que `cron-telemetry.ts` no lea `vercel.json` ni el filesystem — si lo hiciera, todo el argumento se cae.
> - **Los dos vigías comparten el registro.** `EXPECTED_CRONS` vivía dentro de health-crons y ahora **es** `CRONS_FAIL_CLOSED`. Con la lista duplicada divergían: `db-salud` (desplegado el 27-jul) estaba vigilado por el watchdog Telegram —que recorre todas las filas— y era **invisible** para health-crons. Quedó en `SEED_TOLERANT_CRONS` hasta que lleve días sembrado. La decisión de a quién reportar es una función pura, `cronsStaleParaAlerta()`, testeada en las **dos direcciones** (un retirado no alerta / un vivo sí, uno por uno sobre todo el registro).
> - **Filas viejas:** migración `20260727120000_cron_heartbeats_borrar_retirados.sql` borra las 3 huérfanas (`multifashion-sync`, `switch-sync:facturas-2315` y su marca `#recuperado`) con una lista EXPLÍCITA — nada de `LIKE`: llevarse por delante el heartbeat de un cron VIVO se ve igual que "nunca corrió" y dispararía la alerta falsa en la dirección contraria. Es higiene: el arreglo de código ya calla la alerta con la fila puesta.
>
> **Regla de espaciado (sesión única Switch por empresa):** crons que tocan la MISMA empresa en Switch van **≥15 min** separados (`SEPARACION_MINIMA_MIN` en cron-telemetry.ts; era 50 y bajó el 26-jul-2026 con las duraciones medidas bajo Pro: facturas 4-8 s/empresa, costo 1-2 s, y el route cierra sesiones con `/cierresesion` en su `finally`). Crons de empresas disjuntas pueden ir a la misma hora (patrón 05:30/05:35/05:40, y ventas ACS 17:00 junto a reebok-catalogo 17:00). **`src/__tests__/lib/cron-calendario.test.ts` recorre los 453 pares de `SWITCH_CRON_ENTRADAS` que comparten empresa y falla si alguien mete un choque** — es la red que protege el calendario a futuro.
>
> Ojo con los crons LARGOS, donde el margen real es menor que la distancia inicio-contra-inicio que mide el test: `estadocuenta` ~152 s/empresa (máx), catálogos 79 s (joybees) / 162 s (reebok) / **433 s (tommy)**, y la reconciliación hasta 740 s. Esas parejas se dejaron a ≥50 min a propósito. Las dos más ajustadas son pre-existentes o benignas: `tommy-catalogo` 17:40 → reconciliación 18:00 (20 min, documentado en docs/cron-reliability-recovery.md) y `acs-fidelizacion` 16:30 → ventas ACS 17:00 (30 min, y la de 16:30 es no-op si la de 11:30 salió bien).
>
> **Frescura del dato con el calendario del 26-jul-2026** (hueco más largo entre dos refrescos consecutivos):
>
> | Dato | Antes | Ahora | En horario laboral (10:00-18:00 Panamá) |
> |---|---|---|---|
> | Ventas B2B | 24h (solo el bloque `all` de madrugada) | **7h30** (23:00 → 06:30 de confecciones_boston, de noche; vistana 6h30) | **4h** |
> | Ventas ACS | 8h30 | **6h15** (00:15 → 06:30, de madrugada) | **2h** |
> | Pagos (recibos) | 12h20 | **8h35** (23:15 → 07:50) | 4h |
> | Saldos CXC (estadocuenta) | sin cambio | 10h40 (vistana 05:30 → 16:10) | 5h |
>
> Los saldos de CXC NO se tocaron a propósito (paso 2, pendiente): cuestan ~101-152 s por empresa contra 4-8 s de las ventas, y son los que el 25-jul reventaron la base con `canceling statement due to statement timeout`.

## Catálogos — fotos faltantes (30-jul-2026)

> **El aviso de "entraron productos NUEVOS sin foto" es un delta de ESTADO, no el resultado de una corrida.** Daniel, textual: *"meti productos nuevos al sistema, y no me llega, almenos no instantaneo, q hay productos nuevos para subir fotos"*. Fuente única: `src/lib/catalogos/fotos-nuevos.ts` (I/O) + `planAvisoNuevos` en `fotos-faltantes.ts` (puro).
>
> 🩸 **El aviso ya existía y era imposible que llegara, medido contra producción.** Estaba atado al evento de una corrida: el motor empujaba el código a `nuevosSinFoto` en el MISMO `if` que hacía el INSERT, y solo los 3 routes de cron leían ese resultado. Los 60 productos de Reebok entraron en `2026-07-28T17:23:23` con **`triggered_by='manual'`** —el botón "Actualizar ahora"— y **`/api/admin/sync-now` nunca mandaba ese mensaje**. Las 6 corridas del cron de esos días (12:10 y 17:00 UTC) registraron `records_inserted = 0`: para cuando llegó el cron las filas YA existían y caían por la rama "producto conocido". O sea, **el único camino por el que entraron era justo el que no avisaba, y el aviso no se atrasaba: se perdía para siempre.** (61 en la captura = 60 nuevos + 1 anterior; ya los subió, hoy Reebok está en 0.)
>
> **Se cambió la PREGUNTA:** de "¿esta corrida insertó algo?" a "¿hay productos sin foto más nuevos que la última vez que avisé?". Consecuencias, todas buscadas:
> - **Cubre los 5 caminos**: los 3 crons de catálogo, `sync-now` y los 3 colaterales de `switch-reconciliacion`. Candado: `catalogos-aviso-nuevos-sin-foto.test.ts` incluye un **barrido estático** — un archivo que dispare `syncCatalogo{Reebok,Joybees,Tommy}` sin llamar a `avisarNuevosSinFoto` pone el build ROJO, y otro test prohíbe volver a leer `nuevosSinFotoTotal` desde los routes.
> - **No repite.** Los 61 de siempre no vuelven a sonar a diario (eso lo cubre el resumen semanal de los lunes).
> - **Marca de agua en `cron_heartbeats`**, una fila por marca (`catalogos-fotos-nuevos:<marca>`) — **sin DDL**: es la misma tabla que ya guarda "cuándo salió bien esto por última vez". Los 3 nombres están en `HEARTBEATS_NO_CRON` para que ni el watchdog Telegram ni health-crons los vigilen como crons (nadie los programa → estar stale es su estado normal). Se repiten como literales en `cron-telemetry.ts` a propósito: importar `fotos-nuevos.ts` desde ahí arrastraría `MARCAS_CONFIG` a toda la telemetría. La coherencia la sostiene el test.
> - **La marca de agua nueva es `max(ahora, created_at más nuevo)`**, no `ahora` a secas. Una fila insertada MIENTRAS corría la consulta tiene `created_at > ahora`: entra en este aviso y, sin el `max`, volvería a entrar en el siguiente → el mismo producto anunciado dos veces.
> - **Avanza SOLO si Telegram aceptó el mensaje.** Si falla, el aviso se reintenta en la corrida siguiente en vez de perderse. Y una marca de agua **ilegible ≠ "nunca se avisó"**: si el select falla no se hace nada (tratarlo como `null` sembraría de nuevo y se comería el aviso en silencio).
> - **Primera pasada SIEMBRA EN SILENCIO** (y con la tabla vacía no siembra: escondería el atraso real). Después del deploy, el primer producto nuevo es el primero que suena.
> - **Paginado obligatorio** (`leerTodoPaginado`, orden por `sku`): hoy son 490 filas, pero un aviso ciego a partir del producto 1.001 sin error ni señal es el bug de `db-max-rows` que este proyecto ya pagó. ⚠️ `fotos-resumen.ts` (resumen semanal) **sigue sin paginar** — deuda anotada, no tocada.
> - **Canal 📊 NEGOCIO** (`enviarNegocio`, sin perilla de silenciar) y el texto de siempre (`buildNuevosSinFotoMsg`, no se tocó). Frecuencia sin cambios (2×/día por marca) — lo que le faltaba a Daniel no era otro horario, era que el clic manual avisara.
> - Para revisar contra producción sin spamear: `npx tsx scripts/_dryrun-fotos-nuevos.ts` (usa el MISMO `avisarNuevosSinFoto` con `dryRun`, no una segunda implementación).

> **El botón "Excel sin foto" sale con la forma de la plantilla del banco B2B.** Daniel: *"quiero que al descargar los codigos de fotos sin excel, se me ponga en orden de a-z en la columna b, para que asi se me descargue automatico (los numeros que aparecen en el excel no deberian de estar ahi, es solo la muestra)"*. Fuente única: `src/lib/catalogos/dash-busqueda-excel.ts`, usada por las 3 marcas.
> - Estructura MEDIDA sobre `Dash Search Template.xlsx` (no supuesta): hoja `DASHBOARD DE BUSQUEDA`, `B1` = "INSERTE ARTICLE NUMBER AQUÍ (máximo 200)" con fondo `FFC000`, `D1` = "COPIAR " combinada D1:K1, `A2:A201` contador, `B2:B201` los códigos, `D2` la expresión combinada D2:K17, anchos A=4 B=52.78 C=8.89 D=85.11. Los ART Number de muestra NO se copian.
> - **`D2` va con la expresión `"cod" OR "cod" OR …` YA RESUELTA como texto.** En la plantilla es una fórmula que apunta a una hoja auxiliar `DATA ` (A=`"`, B=código, C=`"`, D=` OR `, E=CONCAT acumulado); escribirla resuelta hace que el archivo sirva recién abierto, sin recalcular y sin arrastrar la hoja auxiliar. El flujo del portal es copiar esa celda en la barra de búsqueda de Dash, **no subir el archivo** — por eso una segunda hoja no molesta.
> - **DOS hojas, y la de la plantilla va PRIMERA** (es la que abre Excel). La hoja de detalle de siempre ("Sin foto", con descripción/categoría/stock) **NO se quitó**.
> - **Los códigos van como TEXTO**, no número: hay SKU con guión (`T1A8-32600-313`) y con ceros a la izquierda.
> - **Orden A-Z con comparación cruda en MAYÚSCULAS, sin `localeCompare`**: el orden tiene que ser el mismo en el navegador, en Node y en el test, y las tablas de ICU no lo garantizan.
> - **Más de 200 códigos → hojas extra** (`DASHBOARD DE BUSQUEDA 2`, …), porque 200 es el tope del portal.
> - Candados: `dash-busqueda-excel.test.ts` (incluye el viaje completo de escritura+lectura del `.xlsx`, no solo el objeto en memoria) y el `SheetNames` actualizado en `excel-exports-catalogos.test.ts`. Verificado además con **openpyxl** (parser independiente del que escribe).

> **¿Qué foto de Storage está EN USO? — criterio en `src/lib/catalogos/fotos-en-uso.ts` (puro).** Pedido de Daniel: *"revisa todas mis fotos del catalogo de fashion shoes tommy, y borra solo las que no esten en uso"*. **El módulo CLASIFICA y arma el plan; el borrado vive aparte, en un script que por defecto es dry-run**: una foto borrada no vuelve y Daniel subió 389 a mano. Informe: `npx tsx scripts/_diag-fotos-tommy.ts [--lista]` (read-only; sirve para las 3 marcas con `MARCA=`), que le da datos de producción al MISMO módulo que cubre el test, así que informe y candado no pueden contradecirse.
> - **Cuatro clases, y tres de ellas SÍ están en uso:** `EN USO` (su ruta exacta está en `image_url`) · `BANCO VIVO` (variante `_v/{sku}/{n}.jpg` de un SKU que existe — NO referenciada y eso es NORMAL: el selector de variantes las necesita) · `REEMPLAZADA` (objeto de nivel raíz cuyo SKU existe **y** ya tiene otra foto) · `HUÉRFANA` (no se ató a ninguna fila).
> - **Solo se propone borrar las REEMPLAZADAS.** Es la única clase donde el reemplazo es DEMOSTRABLE: la fila existe y tiene otra foto, así que borrar no puede dejar a ningún producto sin foto.
> - 🩸 **La HUÉRFANA NO se borra.** "No hay fila" no significa "no sirve", significa "no encontré la fila", y las dos formas conocidas de eso terminan con la foto necesitándose otra vez: (a) Switch deja de traer un artículo un rato —estar fuera del catálogo es el estado normal y reversible de un agotado—, y (b) un SKU con guión que se corrige en Switch (**precedente real: 12 SKU de Tommy perdieron la foto por eso**). El housekeeping semanal ya borra el caso acotado y verificable (`_v/{sku}/` de un SKU que desapareció, ver `variantes-housekeeping.ts`); acá no se amplía.
> - **Guard anti-catástrofe**, igual que el housekeeping: sin filas de la tabla no se propone NADA ("la query falló" y "la marca no tiene productos" se ven igual, y solo una es segura). Se le pasan **TODAS** las filas, activas e inactivas: un producto oculto o agotado conserva sus fotos.
> - **Tolera las 3 formas de nombre que existen de verdad** (medidas 30-jul-2026): `{skuStorage}.jpg`, `{skuNormalizado}` sin extensión (endpoint legacy `/upload` con SKU) y `{epoch}-{archivo}` (subida masiva legacy SIN SKU — el SKU va adentro del nombre). Ignorar la tercera fue el primer error de medición: daba 39 falsas huérfanas que en realidad son duplicados de productos vivos.
> - **Inventario de Tommy antes de la limpieza (30-jul-2026):** 2.667 archivos / 74,73 MB → **468 EN USO (16,31 MB) · 2.157 BANCO VIVO (52,74 MB) · 42 REEMPLAZADAS (5,67 MB) · 0 HUÉRFANAS**. Las 42 eran 39 subidas el 29-jul y re-subidas ~8 min después (el lote se subió dos veces) + 3 miniaturas de 7-11 KB del 27-jul.
>
> **EJECUTADO el 30-jul-2026 con el OK de Daniel: se borraron 2.199 archivos (58,41 MB) y Tommy quedó en 468 / 16,31 MB.** Dos tandas: primero las 42 reemplazadas, después las **2.157 alternativas del banco**. Lo segundo fue decisión suya, reafirmada tras advertirle dos veces que pierde la posibilidad de cambiar la foto: *"ya escogi la que utilizare, asi que ya no necesito tenerla como opcion"*. Herramienta: `npx tsx scripts/_borrar-fotos-reemplazadas.ts [--confirm]` (dry-run por defecto).
> - 🩸 **"Borrar las variantes de un SKU" es una frase que suena inofensiva y NO lo era: 383 de las 468 fotos elegidas VIVEN dentro de `_v/`.** El selector guarda en `image_url` la ruta de la variante elegida, no una copia aparte — barrer la carpeta habría dejado sin foto a 383 de 490 productos. Por eso `planBorradoAlternativas` opera por OBJETO, no por carpeta, y salva la elegida comparando la ruta exacta.
> - **Segura por construcción:** solo se borra la alternativa de un SKU con foto elegida **VIVA** (que `image_url` traiga una ruta no prueba que el archivo exista: se verifica contra Storage). Un SKU sin elegida viva conserva TODAS sus variantes. Garantía: **ningún producto puede quedar sin foto**. Medido: 468 → 468 en uso, "sin foto" 18 → 18, y 30 fotos al azar verificadas por HTTP (>5 KB, `content-type: image/*`).
> - **Última red independiente del criterio**, en el script: si alguna ruta de la lista aparece en `image_url` de algún producto, aborta sin borrar nada.
> - **El selector ya no deja un control muerto:** `VariantePicker` **no pinta nada** cuando el SKU no tiene alternativas (antes salía un botón deshabilitado al 40% con el tooltip "Sube el ZIP del B2B para ver más fotos" — un consejo imposible de seguir, porque el ZIP ya se subió y las alternativas se borraron a propósito). Y "más fotos" ahora significa fotos **distintas a la puesta**: a los SKU cuya elegida vive en `_v/` les queda ese único archivo, y ofrecerlo como opción sería mentir.
> - ⚠️ **Volver a tener alternativas = volver a subir el ZIP del B2B.** No hay vuelta atrás para las 2.157.

## Alertas a Telegram — DOS canales (27-jul-2026)

Daniel divide los mensajes en dos, textual: **"tengo dividido los mensajes en info de la empresa y alertas cuando el sistema no funciona"**. No son un flujo con más o menos ruido: son dos cosas con reglas **opuestas**. Punto único: `src/lib/alertas/canal.ts` (`enviarNegocio` / `enviarSistema`). **Nadie llama `sendTelegramAlert` directo.**

- **📊 NEGOCIO** — ventas del día, pedidos, guías, cheques por vencer, fotos faltantes, costo sospechoso. Textual: *"NO, ES SUPER IMPORTANTE ESAS. NECESITO SABER QUE PASA EN LA EMPRESA Y ESO AYUDA BASTANTE"*. **NINGUNA regla anti-ruido aplica acá** — ni frecuencia, ni agrupación, ni "esto funciona bien, no avisar". `enviarNegocio` no acepta perilla de silenciar: que no exista es la garantía. Los textos NO se tocaron.
- **🔧 SISTEMA** — prefijo `🔧 SISTEMA · ` al principio (se lee en la notificación del iPhone sin abrirla). Regla de tres: **(1)** es real, **(2)** no se arregla solo —si la reconciliación, una 2ª oportunidad o el propio cron lo recupera en horas, NO se avisa—, **(3)** alguien tiene que hacer algo. Y el texto dice **qué pasó / qué significa para el negocio / qué hacer**. Sin nombres de tabla, códigos HTTP ni HTML del proveedor.

> **Los dos chats YA ESTÁN SEPARADOS (27-jul-2026), y la separación la da el BOT, no el chat.** Daniel creó `@fashiongr_sistema_bot` ("FashionGR Sistema") y lo usa en un chat **privado** con él. Ese bot nuevo lleva el **NEGOCIO**; las alertas de **SISTEMA** se quedan en el bot de siempre (`@fashiongr_alertas_bot`) sin tocar nada. **Sí: el bot que se llama "sistema" lleva negocio.** Lo decidió Daniel, el nombre se cambia desde Telegram cuando quiera, y **el ruteo no se invierte para que haga juego con el nombre.**
>
> **Por qué el diseño del #321 (una sola env var de chat) no alcanzaba — medido:** `TELEGRAM_CHAT_ID` ya vale **`1367251585`, el MISMO número del chat nuevo**. En un chat privado el `chat_id` es el id del **usuario**, idéntico para todos los bots, así que apuntar el otro canal a ese número habría sido un **no-op perfecto**. Y al revés tampoco: Telegram solo deja escribir al bot al que el usuario le habló primero, o sea que el bot A mandando al privado del bot B recibe **403**. Por eso el destino es el PAR `(token, chat)` — tipo `DestinoTelegram` en `src/lib/telegram.ts`.
>
> **El override es SIMÉTRICO — ninguno de los dos canales es el caso especial:**
>
> | Env vars (por canal, `_NEGOCIO` o `_SISTEMA`) | A dónde va ese canal |
> |---|---|
> | `TELEGRAM_BOT_TOKEN_<canal>` + `TELEGRAM_CHAT_ID_<canal>` | bot propio, chat propio ← **negocio está así hoy** |
> | solo `TELEGRAM_CHAT_ID_<canal>` | el bot de siempre en otro chat/grupo |
> | solo `TELEGRAM_BOT_TOKEN_<canal>` | se **ignora** con warning — un bot sin chat no tiene a dónde escribir |
> | ninguna | el canal de siempre ← **sistema está así hoy** |
>
> Concretamente, en Vercel hay **dos** variables nuevas: `TELEGRAM_BOT_TOKEN_NEGOCIO` (token de `@fashiongr_sistema_bot`) y `TELEGRAM_CHAT_ID_NEGOCIO` = `1367251585`. `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` no se tocan: son el canal de sistema **y** la red de rescate. Las `_SISTEMA` existen y funcionan, pero hoy van vacías.
>
> **FAIL-SAFE en dos capas.** Pesa más que antes: con el negocio en el bot nuevo, un olvido de configuración ya no silenciaría avisos técnicos sino justo lo que Daniel dijo que más le importa. (1) El resolvedor nunca arma un destino a medias — nada de mandar el chat de siempre con el bot nuevo, que sería 403 seguro. (2) Si el envío al canal aparte **falla** (token mal copiado, bot bloqueado, chat equivocado), `sendTelegramAlert` lo **reintenta una vez en el canal de siempre**; el prefijo `🔧 SISTEMA · ` viaja intacto para que se reconozca si cae ahí. El reintento solo ocurre cuando el destino elegido difiere del de siempre → sin duplicados ni bucles. Probado contra la API real de Telegram: con un token de override inválido el POST sale a `/bot<token-nuevo>/sendMessage`, Telegram responde **401**, y el mensaje **llega igual** al chat de siempre.
>
> **`enviarNegocio` sigue sin perilla:** el override es de **destino**, nunca de **si se manda**. Su cuerpo es una sola sentencia sin `if`, sin `return false/true` y sin `process.env`; el test lo verifica por aridad **y** leyendo el cuerpo de la función.
>
> Para ver a qué bot/chat va cada canal **sin mandar nada**: `npx tsx scripts/_probe-canales-telegram.ts` (con `--enviar` manda exactamente 1 mensaje a cada uno) — eso es local, contra `.env.local`.
>
> **Contra PRODUCCIÓN, sin spamear: `GET /api/diag/canales-telegram`** (Bearer `CRON_SECRET`, o abierto en el navegador con sesión de admin). Dice, por canal, si tiene destino propio o cae en el de siempre, el `bot_id` y el **username real** que devuelve `getMe`, y el veredicto `bots_distintos` — que es LO que hay que verificar: negocio y sistema no pueden salir por el mismo bot. Read-only: lo único que sale a la red es `getMe` (un GET), no hay `sendMessage` en ningún camino. **Por qué hacía falta y no alcanzaba con mandar un mensaje de prueba:** por el fail-safe, un mensaje que LLEGA no prueba nada — pudo haber llegado por el reintento en el canal de siempre. **El token nunca sale entero** (bot_id + últimos 4 + largo; `sinToken()` barre el secreto de los mensajes de error), y `dynamic = "force-dynamic"` para que lea `process.env` en cada request y no quede horneado del build — si no, una variable cargada en Vercel DESPUÉS del deploy se vería como ausente. Auth **fail-closed**: sin `CRON_SECRET` configurado responde 503, nunca abierto (la ruta vive bajo el prefijo público `/api/diag/` del middleware, igual que `/api/health-crons`: la puerta es el propio route). Candado: `src/__tests__/lib/diagnostico-canales-telegram.test.ts` (21 casos, incluido que el token no aparezca en el JSON y que ningún fetch vaya a `sendMessage`).

**La medición que justificó todo** (30 días a 26-jul-2026, `scripts/_diag-alertas-30d.mjs` / `_diag-synclog-30d.mjs` / `_diag-huecos.mjs`, solo lectura): `switch_sync_log` tuvo **1.987 corridas, 58 errores, y los 58 se recuperaron solos en ≤24h** (88% en ≤12h). **Cero fallos sostenidos.** O sea: todas las alertas de sync del mes fueron por algo que el sistema ya estaba arreglando.

> **NO SE AVISA AL PRIMER FALLO — se avisa a partir del segundo seguido (28-jul-2026).** Pedido de Daniel, textual: *"quiero q un error de crones me avise si no paso de 2 en adelante, no cada vez porq aveces se recupera y es en vano"*. Es la condición (2) de la regla de tres, que este archivo ya tenía escrita y `alert-policy.ts` aplicaba a medias.
>
> 🩸 **Lo que la tenía a medias:** la racha (`computeStreak…`) solo cubría los errores **silenciables** (401 de sesión única, red/timeout/5xx, la página HTML de Switch). Todo lo demás —un `statement timeout`, un UPSERT fallido, un `No pude crear switch_sync_log`— caía en la rama `inmediatos` y sonaba al primer fallo. Caso medido: **27-jul 23:11 UTC** llegó *"3 sync(s) fallaron — american_classic/facturas, vistana/facturas, fashion_wear/facturas: No pude crear switch_sync_log: vacío"* (la base bajo presión de memoria; `db-salud` ya lo había avisado a las 22:45, y **esa** era la alerta correcta) y **a las 00:11 las 8 empresas corrieron bien solas**. Peor: un error de otra clase **CORTABA** la racha, así que un par alternando 401 → timeout de base → 401 se leía como tres "primeros fallos" seguidos.
>
> **La unidad de "seguidas" es el PAR `(empresa_key, sync_type)`** — la misma con la que ya medía el streak de 401 y con la que recupera la reconciliación, no una agrupación nueva. `vistana/facturas` y `joystep/facturas` son sesiones de Switch distintas sobre datos distintos: que fallen una vez cada uno no es un problema repitiéndose. Lo que despierta a Daniel es el MISMO trabajo fallando otra vez **sin un `success` en el medio** (un success sigue siendo lo único que reinicia la racha).
>
> **Los cinco desenlaces de `evaluateSwitchEscalation`** (todos con su motivo escrito en `cron_email_errors`, para poder auditar después por qué sonó o no):
>
> | motivo | condición | ¿avisa? |
> |---|---|---|
> | `racha` | streak ≥ 2 | **sí**, y el texto dice *"van N corridas seguidas fallando desde \<fecha\>"* |
> | `primer-fallo` | streak = 1 (la corrida anterior fue bien) | no — la siguiente decide |
> | `no-medible` | streak = 0 **con** historia del par | no — la corrida que falló no llegó a registrarse (su propio INSERT falló). **Este es el caso de las 23:11** |
> | `sin-historia` | streak = 0 **sin ninguna** fila del par | **sí** (fail-open) |
> | `lectura-fallo` | la consulta al log falló | **sí** (fail-open) |
>
> **La distinción que hace todo el trabajo: "no hay fila de ESTA corrida" ≠ "no hay NINGUNA fila del par".** Lo primero es un tropiezo puntual de nuestra telemetría y la corrida siguiente vuelve a medir; lo segundo es telemetría rota de raíz, y callarla sería callarla **para siempre**. Sin separar los dos casos había que elegir entre el ruido de las 23:11 y el silencio permanente de `american_classic/articulos` (falló el 5, 8 y 10-jul sin una sola fila previa en el log — esos 3 avisos siguen saliendo).
>
> **Única excepción que avisa al primer fallo: `LICENCIA NO SE ENCUENTRA ACTIVA`** (`alertaInmediataSiempre`). El proveedor nos cortó el servicio y ninguna corrida siguiente lo arregla. **No es una excepción nueva:** `isSwitch401` e `isSwitchTransitorio` ya la excluían a mano de todo silenciamiento; ahora esa decisión vive UNA vez y con nombre. La lista se mantiene deliberadamente corta — cada entrada nueva es un aviso que vuelve a sonar al primer chispazo. Un "faltan env vars" tampoco se arregla solo, pero es una clase abierta imposible de reconocer por texto: se avisa igual, una corrida después, como racha.
>
> **El fallo que NUNCA vuelve a correr no queda en silencio, y no hizo falta un mecanismo nuevo:** los **11 routes** que llaman a `alertSwitchCronErrors` registran el heartbeat **solo si no hubo ningún error** (`if (errors.length === 0) recordCronHeartbeat(...)`), así que un fallo callado deja el heartbeat sin refrescar y a las 26h lo levantan `cronsStaleParaAlerta` (watchdog Telegram) y health-crons. Para las entradas intradía la red llega antes: `clasificarSlots` re-ejecuta el slot desatendido en la pasada siguiente de la reconciliación y, si vuelve a fallar, eso YA es el segundo fallo del par.
>
> **`isSwitchSilenciable` sigue existiendo pero YA NO decide si se avisa** — eso lo decide la racha, para todos los errores por igual. La usan `outage-resumen.ts` y la clasificación de slots.
>
> **Medición sobre 4 semanas (29-jun → 28-jul-2026, producción):** 22 alertas llegaron a Telegram, 12 eran de sync → **se ahorran 7, siguen saliendo 5** (3 de `sin-historia`, 1 racha real de 2-3 corridas del 19-jul, 1 LICENCIA). De las 7 calladas, **ninguna quedó rota**: los 12 pares involucrados tuvieron un `success` propio entre **1,0 y 10,1 horas** después. La única que roza "problema real" es `joystep/utilidad: faltan env vars` (27-jul 18:19) — se arregló sola en 1h18 porque alguien estaba trabajando ahí en ese momento; de no ser así, la corrida siguiente la habría avisado como racha.
>
> **El mismo defecto en otra alerta, arreglado en el mismo PR: `acs-fidelizacion`.** Tiene 2 entradas (11:30 y 16:30 UTC) con el guard no-op de `cronSuccessHoyUtc`, o sea que la segunda oportunidad ya existía — y su `catch` la ignoraba: avisaba a las 11:30 aunque a las 16:30 se arreglara. Toca Switch MULTI con sesión única, así que el 401 transitorio es su modo de fallo típico. Ahora usa `recoveryStillComingToday` (el mismo mecanismo del backup): calla si queda otra entrada por delante hoy, suena si era la última.
>
> **Revisados y NO tocados a propósito:** `grupo-resumen-mensual` y `catalogos-fotos-resumen` están en `NUNCA_SILENCIAR` porque son demasiado esporádicos para asumir auto-recuperación; `cleanup-sessions` no tiene quién lo re-ejecute; `backup` corrida estéril y `backup_r2_incompleto` ya tienen su "por qué no espera" escrito; `db-salud` mide una condición sostenida y ya deduplica por ventana; `campos-obligatorios` y el guard de costo diario ya deduplican; lo de `pedido-publico`/`switch-envio` deja un pedido sin salir y exige "Reintentar" a mano. Verificado contra producción que `catalogo_tommy` **sí** se registra en `switch_sync_log` (7 filas), o sea que Tommy no cae en `sin-historia` aunque el CHECK del repo no lo liste.
>
> **Deuda anotada, no arreglada:** el conflicto del candado (`"Ya hay una corrida de X en curso"`, `sync-log.ts`) cuenta como fallo normal de la racha. Con la regla nueva ya no suena al primer choque; si suena a la segunda es porque el candado lleva horas trabado, que es exactamente el bug del 27-jul y merece el aviso. Y `integrity-check-run.ts:67` tiene un defecto DISTINTO (repite el mismo crítico todos los días, sin dedup) — no se tocó.
>
> Candado: `src/__tests__/lib/alerta-cron-dos-fallos.test.ts` (17 casos en las dos direcciones, con el caso real del 27-jul completo). Verificado por mutación: devolver el fail-open de `streak===0` rompe 2 tests, quitar la excepción LICENCIA rompe 1, bajar el umbral a 1 rompe 5.

**Qué se calló, con su prueba:**
- **La página de excepción de Switch es una CAÍDA, no una emergencia.** `client.ts:295` arma `"Auth respondió 200 pero sin token: <!DOCTYPE html>…"` cuando Switch sirve su HTML de error en vez del token. `isSwitchTransitorio` no lo matcheaba (el código HTTP es 200) → alertaba de inmediato con 200 chars de HTML crudo. **Y el sistema ya sabía que era una caída**: `outage-resumen.ts` lo clasificaba como *"estuvo caído… sin impacto"*. Un archivo decía no-evento y el otro 🚨. Ahora el predicado vive UNA vez (`isSwitchTransitorio`) y `isSwitchCaida` delega. LICENCIA sigue excluida: envuelta en HTML tampoco se silencia.
- **Backup: un fallo con 2ª oportunidad hoy no despierta a nadie.** `cronSuccessHoyUtc` solo evita repetir TRABAJO; no retira un mensaje ya enviado. Un fallo a las 06:00 sonaba aunque 10:30 lo arreglara. Ahora `alertaDeBackupEsperaSegundaOportunidad` (reusa `recoveryStillComingToday` + `EXTRA_ENTRY_HOURS_UTC`) difiere el aviso; **la ÚLTIMA entrada del día SIEMPRE suena** (`backup-switch` 23:30 no tiene red detrás). Dos excepciones que suenan siempre: la **corrida estéril** (0 datasets — pone el índice del día en riesgo) y `backup_r2_incompleto` (mira AYER, día cerrado, sin oportunidades por delante). El fallo se sigue persistiendo con `telegram:false` → el rastro no se pierde.
- **`ℹ️ Switch estuvo caído… sin impacto` ya no se manda.** Se declara a sí mismo un no-evento: falla las tres condiciones. La fila queda en `cron_email_errors` (de ahí salió la evidencia de esta auditoría).
- **HTML/XML del proveedor nunca llega al celular.** `shortError` detecta `<!DOCTYPE`/`<html`/`<?xml`/`<Error>`, conserva el prefijo humano y reemplaza la sopa por *"el proveedor devolvió una página de error en vez de datos"*.

**Huecos cerrados (lo que estaba roto y NO avisaba):**
- **`sync-proveedores` fallaba en SILENCIO ABSOLUTO** — sin `alertSwitchCronErrors` y sin `logCronError`; lo único era la ausencia de heartbeat. Era el único sync de Switch así. Ahora pasa por la misma política anti-ruido (sí escribe `switch_sync_log` con `sync_type='proveedores'`, así que el streak funciona y un corte de red se calla igual que en el resto).
- **`db-salud` invisible para health-crons** — lo cerró el #320 (quedó en `SEED_TOLERANT_CRONS`).
- ⚠️ **PENDIENTE — el rastro se pierde cuando la base es lo que falla.** `logCronError` escribe en `cron_email_errors` ANTES de mandar el Telegram: el aviso sale igual (el insert está en try/catch), pero **la fila no queda**. Medido: **38 de 58 errores** de los últimos 30 días no dejaron rastro, incluido el `statement timeout` de `fashion_shoes/estadocuenta` del 25-jul 16:20 que dejó los saldos de CXC viejos ~5h. No se puede auditar desde la base si Daniel recibió o no ese mensaje. `db-salud` (27-jul) cubre la DETECCIÓN de la caída por un camino que no toca Postgres; **falta un rastro de alertas que sobreviva a la base caída**.

**Redacción** — `describirCronParaDaniel(tipo)` (cron-telemetry) traduce el `tipo` interno a una frase de negocio, y `consecuenciaDeSyncType(syncType)` (alert-policy) dice qué se ve viejo en la app. Un tipo no listado cae en un texto genérico honesto en vez de vomitar el identificador. Candado: `src/__tests__/lib/alertas-canal.test.ts` — 32 casos en las DOS direcciones (el ruido se calla **y** LICENCIA / statement timeout / errores de negocio siguen sonando), más el ruteo bot-por-bot, los 6 casos del fail-safe y el candado de que negocio no gane una perilla de silenciar.

**Para revisar redacción sin spamear el chat real:** `npx tsx scripts/_dryrun-alertas.ts` (no manda nada).

## PWA (iOS)
- `viewport-fit: cover` + `env(safe-area-inset-top/bottom)` para notch/Dynamic Island
- `apple-mobile-web-app-status-bar-style: black`
- Standalone mode, start_url: `/home`
- Service worker MÍNIMO (Serwist, `src/app/sw.ts`) — la app es SIEMPRE online (Modo Viaje / lectura offline ELIMINADO jul 2026, nunca se usó). Solo cachea assets inmutables (`/_next/static` CacheFirst, imágenes/fuentes SWR); navegación y APIs van directo a la red (sin handler). Sin precache del app shell.
  - **`matchOptions: { ignoreSearch: true }` en la estrategia de `/_next/static`** — obligatorio mientras `next.config.js` defina `deploymentId` (Skew Protection de Vercel Pro): Next estampa `?dpl=<id>` en cada asset y ese query cambia en CADA deploy, así que sin esto los chunks cuyo contenido no cambió se re-descargan tras cada promoción. Es seguro porque el nombre del archivo lleva el hash del contenido. El fetch a la red (en un MISS) conserva la URL con `?dpl=`, así que el ruteo de Skew Protection no se toca. Candado en `src/__tests__/lib/sw-static-cache-dpl.test.ts`.
- Actualización automática y SILENCIOSA: `skipWaiting`+`clientsClaim` en sw.ts + `SWUpdater` (`src/components/SWUpdater.tsx`, registra el SW; `next.config` con `register:false`) → al haber build nuevo, swap + reload inmediato SIN UI de versión, con guard de formulario sucio (si hay un input con foco y contenido, difiere hasta blur/submit/ocultar app) y guard anti-loop en sessionStorage.
- Recovery una-sola-vez: ChunkLoadError / import dinámico fallido tras un deploy → `src/lib/chunk-recovery.ts` (listeners globales en SWUpdater + `error.tsx`/`global-error.tsx` raíz). Guard sessionStorage `fg_chunk_recovery` (1/min); si se repite, error boundary visible "Algo salió mal" con botón Recargar.
- Roles con 1 solo módulo auto-redirigen desde home (ej: Bodega → Guías)
- Sin bottom tab bar — navegación por módulos del home + drawer del header

## Design System
- **Direction:** Precision & Density + Apple-grade fluidity
- **Buttons:** `rounded-md`, `bg-black text-white`, `active:scale-[0.97]` tap feedback
- **Cards:** `rounded-lg`, `border border-gray-200`, no shadows
- **Tables:** sticky headers, `tabular-nums`, ScrollableTable con gradient indicators, SwipeableRow en mobile
- **Modals:** ConfirmModal (normal), ConfirmDeleteModal (destructivo, 1s delay), BottomSheet (mobile)
- **Spacing:** 4px base, py-6 containers, mb-4 sections, p-3 cards
- **Depth:** borders-only (no shadows en cards/modules)
- **Module colors:** CXC=blue, Guías=emerald, Cheques=amber, Reclamos=orange, Caja=violet, Directorio=cyan, Préstamos=rose, Ventas=indigo, Reebok=red (2px accent en header)
- **Animations:** AccordionContent (CSS grid 250ms), page transitions (slide-right/left/crossfade 180ms), KPI count-up, deposit flash, saldo shake, new row highlight

## UX Principles
- Usuarios: secretarias, bodegueros, vendedores en Panamá. NO tech-savvy.
- Labels en español simple. Cero jerga (CXC → "Cuentas por Cobrar")
- Botones descriptivos ("Guardar gasto", no "Guardar")
- Errores accionables y humanos ("No se pudo guardar. Intenta de nuevo en unos segundos.")
- Micro-copy con personalidad ("Listo, guardado", "Excel listo — revisa tu carpeta de descargas")
- Font size mínimo text-sm para datos. text-gray-600 mínimo para montos.
- Confirmación solo para acciones destructivas (eliminar), NO para guardar.
- Undo universal: 5 segundos para deshacer acciones destructivas (depositar, eliminar, cambiar estado)
- Optimistic UI: actualizar UI antes de respuesta del server, revertir si falla
- 1 acción principal por vista + OverflowMenu "···" para secundarias
- Toasts: errores 8s, éxitos 3s, con botón X para cerrar

## Navegación e Historial (Back/Forward consistente)
- **Regla:** el stack del historial debe ser ESPEJO del breadcrumb (Inicio › Grupo › Módulo › Detalle). El Back del navegador solo deshace la última URL — no conoce la jerarquía, así que la jerarquía debe vivir en el historial.
- **Drill-down a un nivel más profundo → `push`** (selector→empresa, lista→detalle, módulo→sub-route). Cada nivel deja entrada → Back deshace un nivel a la vez.
- **Filtro / tab / sort en el MISMO nivel → `replace`** (no debe crear entrada; Back no debe ciclar por tabs/filtros).
- `useUrlState(key, default, { history: "push" })` para params que representan un nivel; default `"replace"` para filtros/tabs.
- **SPAs de un solo route** (varios niveles bajo un mismo `/route`): el patrón de referencia es **Reclamos** (`src/app/reclamos/ReclamosClient.tsx`) — drill-down/tabs/back-forward vía el router de Next reconstruyendo el estado desde la URL. (El ejemplo anterior, Camisetas, fue eliminado en #35.)
- Módulos con **routes reales** (Caja, Préstamos, Guías, Clientes detalle) ya son correctos: cada nivel es una URL distinta empujada con `router.push`/`<Link>`. No requieren tratamiento especial.

## Keyboard Shortcuts (Desktop)
- `/` o `⌘K` — buscar
- `?` — mostrar ayuda de atajos
- `G+H` — ir a inicio, `G+C` — CXC, `G+G` — guías, `G+Q` — cheques, `G+R` — reclamos
- `J/K` — navegar filas, `Enter/Space` — expandir, `E` — editar, `Escape` — cerrar
- Right-click en filas de CXC y Cheques → context menu con acciones

## Smart Features
- **Búsqueda global:** 8 módulos (CXC, Reclamos, Guías, Directorio, Cheques, Ventas, Préstamos, Caja)
- **Spotlight:** "cheques que vencen mañana" → ⚡ quick action con deep link
- **Búsquedas recientes:** últimas 5 + "Ir a..." shortcuts de módulos
- **Smart defaults:** recuerda última categoría, empresa, banco, transportista (localStorage `fg_last_*`)
- **Smart suggestions:** 💡 proactivas inline (contactar cliente $10K+, depositar vencidos, escalar reclamo +45d, cerrar período +30d)
- **Dashboard feed:** "Acciones pendientes" con 8 fuentes de datos ordenadas por urgencia
- **Daily summary:** resumen matutino 1x/día con bullets accionables
- **Draft auto-save:** formularios de reclamos, guías, cheques se guardan cada 5s en localStorage
- **Time grouping:** cheques y guías agrupados por "Hoy/Esta semana/Vencidos"- **Contextual color:** tinte rojo/ámbar ambient cuando hay datos urgentes
- **Inline previews:** último contacto, días para depósito, próxima deducción visibles sin expandir
- **Hover preview:** cards ricas en CXC al hover 500ms sobre nombre de cliente
- **URL state:** filtros persisten en URL (?risk=vencido&empresa=fashion_wear) — deep links y back/forward funcionan
- **UI persistence:** filas expandidas y scroll position sobreviven navegación (sessionStorage)
- **Offline:** banner "Sin conexión" (informativo) + botones deshabilitados sin red. NO hay lectura offline: el Modo Viaje (snapshots localStorage + cache de páginas del SW) se eliminó en jul 2026

## Exports
- Todos los PDFs tienen logo Fashion Group (src/lib/pdf-logo.ts, base64)
- Reebok PDFs/emails tienen logo Reebok (src/lib/reebok-logo.ts, base64)
- Fechas display: "5 abr 2026" (fmtDate en src/lib/format.ts)
- Moneda: `$#,##0.00` en Excel (números reales, no texto)
- Nombres de archivo con fecha: `Pedido-RBK001-2026-04-05.pdf`

## Shared Components (src/components/)
- **AppHeader** — sticky header con module color accent, user info, search, notifications, shortcuts
- **SearchBar** — ⌘K + mobile full-screen + recientes + spotlight NLP
- **MobileBottomBar** — ELIMINADO (abril 2026). Navegación es solo por módulos del home + drawer del header
- **NotificationCenter** — 🔔 bell con historial de toasts
- **SessionWarning** — banner/modal antes de expirar sesión
- **OfflineBanner** — amber offline, green reconexión
- **KeyboardShortcutsProvider** — global shortcuts + table navigation
- **ContextMenuWrapper** — right-click menus en desktop
- **UndoToast** — countdown bar 5s con "Deshacer"
- **SuggestionCard** — 💡 sugerencias proactivas inline
- **TimeGroupHeader** — headers colapsables por período de tiempo- **OverflowMenu** — "···" dropdown para acciones secundarias
- **ScrollableTable** — gradient indicators para scroll horizontal
- **SwipeableRow** — swipe-to-action en mobile
- **PullToRefresh** — pull down para refrescar en mobile
- **BottomSheet** — half/full screen draggable (mobile)
- **AccordionContent** — CSS grid expand/collapse animado
- **AnimatedNumber** — count-up con easing
## Hooks (src/lib/hooks/)
- **useAuth** — check role, user info
- **useBadges** — notification badge counts
- **useSessionCheck** — ping /api/auth/check cada 2 min
- **useKeyboardShortcuts** — global + table shortcuts
- **useUrlState** — sync state ↔ URL params
- **useLastUsed** — remember last form values
- **useDraftAutoSave** — auto-save formularios cada 5s
- **usePersistedState** — sessionStorage-backed state
- **useUndoAction** — delayed execution con 5s undo window
- **useSmartSuggestions** — proactive inline suggestions
- **useOnlineStatus** — offline/online detection
- **useTableShortcuts** — J/K row navigation context

## Changes — April 2026 Session

### Home & Navigation
- Home reorganized with grouped modules: Día a día, Consultas, Catálogos, Admin
- Claude chat removed from layout

### Roles
- Bodega now sees all guías by default (not just pending)
- Vendedor can now view guías (read-only)

### UX Audit (45+ fixes)
- alert() replaced with toast notifications across all modules
- Error handling improved (try/catch, user-friendly messages)
- Copies and microcopy refined
- Dead code removed across modules


### API & Cache
- 165 rutas API (`route.ts`); 150 tienen `export const dynamic = 'force-dynamic'` (evita cache stale en Vercel)
- `SWRProvider` (caché de navegación stale-while-revalidate, #115/#117) — fetchers comparten caché entre vistas, dedupe y revalidación en foco

### Hooks
- Hooks fixed in cheques and caja (moved before conditional returns per React rules)

### Auth
- Password minimum length changed to 3 characters
- Password field clears on edit (prevents double-hash bug)

### Reebok Catalog & Orders (April 10-11)
- Public catalog at `/catalogo-publico/reebok` (no login required, shareable link)
- Orders via shareable link (`/pedido-reebok/[id]`) with photos, SKU, bulto quantities
- Bulto system: footwear=12pzas, apparel/accessories=6pzas per bulto
- Unified catalog design: CatalogHeader, CatalogFilters, CatalogProductCard, StickyCartBar (shared components)
- "Compartir" button (copy link + PDF) for vendors
- Removed old auth system and CartProvider (dead code)

### Reclamos — pipeline de estados (julio 2026)
- Estados reales (código y DB, CHECK de migración `20260629100000`): **Creado → En proceso → Pagado**. Los nombres viejos Borrador/Enviado ya no existen (#161 los fusionó en Creado; `c1dcd854` agregó "En proceso"). `ESTADOS` en `src/app/reclamos/components/constants.ts`; transiciones server-side en `VALID_TRANSITIONS` de `api/reclamos/[id]/route.ts`.
- **Creado → En proceso** (`POST /[id]/en-proceso`): comprobante (foto o PDF) **opcional**.
- **→ Pagado**: SOLO vía `POST /[id]/settlements` con `markPaid` (nunca por PATCH). Acepta desde **Creado (salto directo, pago inmediato) o En proceso** y **exige comprobante ya adjunto** (foto o PDF) — sin adjunto responde 400 y revierte los settlements (compensación).
- Adjuntar comprobante sin cambiar estado: `POST /[id]/comprobante`. Subida compartida en `src/lib/reclamos/comprobante-storage.ts` (bucket reclamo-fotos `/comprobante`; PDF sin compresión, máx 4MB).
- Rollbacks de un paso vía PATCH: En proceso→Creado, Pagado→En proceso.

### CXC (April 10-11)
- Simplified ContactPanel (6 clear sections)
- Risk filter subtitles
- Stale data banner

> **La píldora de tramo FILTRA y ORDENA en una sola acción (27-jul-2026).** Pedido de Daniel, textual: *"los card de cxc por buckets al tocarlo debe de acomodar las cxc en orden de la deuda del bucket no?"*. Tenía razón: tocar "121d+" dejaba los 64 clientes del tramo pero **ordenados por saldo TOTAL**, así que el que más debía EN ESE TRAMO podía no quedar arriba — que es justo lo que se fue a buscar. Medido en producción: por total mandaba CITY MALL PASO CANOA ($587.299,70), y por tramo mandan INTERNACIONAL BELEN ($143.713,36), LA FRONTERA DUTY FREE ($127.052,15) y JERUSALEM DUTY FREE ($122.920,80). Reordenar era un **segundo** control aparte (clic en el título de la columna): dos controles para una sola intención.
> - **Fuente única: `src/lib/cxc-orden.ts`** (módulo PURO — filtro por tramo + comparador), usada por el escritorio (`KpiCards` + `ClientTable` vía `admin/page.tsx`) **y** por el móvil (`PanelCxcMobile`). Antes el comparador estaba escrito dos veces, con dos criterios distintos. Los tramos siguen siendo 0-90 / 91-120 / 121+ y **no se toca ningún número**: esto solo filtra y ordena.
> - **El orden se DERIVA del tramo; el clic en el título es un override ANCLADO a ese tramo** (`ordenEfectivo`). Por eso los dos controles no pueden contradecirse: son un solo estado, y la flecha del encabezado siempre describe el orden real. Al cambiar de píldora el override caduca solo, sin efectos ni sincronización manual — y un deep link `?risk=overdue` o un back/forward llegan ya ordenados por su tramo. El orden por título **se queda**: sirve para ordenar sin filtrar.
> - **Tocar la píldora encendida la apaga** (vuelve a "Total pendiente", que ordena por total). Antes en escritorio no había salida del filtro sin recargar.
> - **Se ven tocables** (Daniel: "no parecen tocables"): la activa lleva borde de color + fondo tenue + label en negrita, las inactivas borde gris-300 con hover de fondo/borde/sombra, y todas `min-h-[44px]` + `active:scale-[0.97]`. **Sin flechitas** — la única flecha de la pantalla es la del selector de mes; agregar más prometería opciones que no existen.
> - Candado: `src/__tests__/lib/cxc-orden.test.ts` (21 casos, verificado por mutación: que la píldora no reordene rompe 4, que no se pueda apagar rompe 2, que el override no caduque rompe 1). Verificación en navegador con datos de producción: `node scripts/_verif-pildoras.mjs` (solo lectura; **gotchas**: sembrar `sessionStorage.cxc_role` o `useAuth` redirige todo al login, y `delete Navigator.prototype.serviceWorker` antes de navegar).

### Cheques (April 10-11)
- Guided rebotado → re-depositar flow

### Préstamos (April 10-11)
- Visual status badges + filter tabs + batch undo

### Camisetas — módulo eliminado por completo en #35 (jun 2026)

### Ventas (April 10-11)
- View preference saved to localStorage

### Upload (April 10-11)
- 3-step progress indicator

### Directorio (April 10-11)
- Chevron icons on expandable rows

### Infrastructure (April 10-11)
- 165 rutas API; 150 con `export const dynamic = 'force-dynamic'`
- Sentry monitoring added
- Backup cron exists
- 20 tests (vitest)
- Password min 3 chars, no double-hash on edit
- Dead code cleaned: ChatPanel, MobileBottomBar, LoadingScreen, KeyboardShortcutsProvider, SessionWarning, old Reebok auth
- console.logs cleaned from production

### Attempted & Reverted
- Face ID (WebAuthn): implemented and removed — too unstable on serverless (DER/P1363 format issues, challenge storage in memory)
- Trading bot dashboard: added and removed — localhost IBKR gateway not accessible from Vercel

## Testing
```bash
npm test          # Vitest — 20 tests, run before pushing
npx next build    # Build check — must pass before push
```

## Deploy
```bash
git push origin main   # Auto-deploy via Vercel
```


## Regla de Calidad
- Todo código debe funcionar a la primera. No pushear sin verificar el flujo completo end-to-end.
- Verificar: datos fluyen escritura → DB → lectura → UI
- Auth en serverless: usar tokens HMAC firmados, NO Maps en memoria
- No hacer fire-and-forget (.then().catch()) para operaciones críticas — siempre await
- useState en useEffect como dependencia puede causar re-renders destructivos — usar useRef para estado interno
- Verificar compatibilidad de formatos antes de integrar (PNG/JPEG en jsPDF, DER/P1363 en WebAuthn)
- Si no puedo probar en browser, simular el flujo con script
