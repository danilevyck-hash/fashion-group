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

> ## 🔴 EL CXC DE BOSTON VA APARTE, Y EL DEL GRUPO CONVIVE CON TODO — LA REGLA, TEXTUAL (12-ago-2026)
>
> Daniel, palabra por palabra: *"debe de ser cxc de fashion group y otro aparte de boston, **no deben de ni convivir juntos**. cxc de fashion group **si debe de convivir con todo el sistema** por guias, marketing, clientes, ventas, ect, ect, eso quiero que este muy claro."*
>
> **Son DOS afirmaciones y las dos son la regla:**
> 1. **Boston NUNCA se mezcla con el CXC del grupo.** Ni una fila, ni un número, en ninguna vista, tarjeta, total, lista, export, correo o badge. Se ve SOLO en su pestaña.
> 2. **El CXC del grupo SÍ convive con el resto del sistema** — guías, marketing, clientes, ventas. No se aísla "por las dudas": **aislarlo de más también es un error**, y es el error fácil de cometer justo después de tapar una fuga.
>
> **Fashion Group son SEIS empresas:** `vistana · fashion_wear · fashion_shoes · active_wear · active_shoes · joystep` (= `B2B_EMPRESA_KEYS` = `CXC_GRUPO_EMPRESA_KEYS` = `empresasConCxc()`). **`confecciones_boston` y `american_classic` NO lo son.**
>
> **DÓNDE SE CIERRA: en la vista `switch_estadocuenta_aging`, UNA sola vez.** Ella ES la definición de "cartera del grupo" y todo lo que la lea queda separado sin tener que enterarse. No se blinda pantalla por pantalla: unas 20 rutas leen esa vista, y blindar 20 sitios deja la garantía a cargo de que nadie se olvide — la pantalla 21 que alguien escriba mañana nacería insegura.
>
> 🩸 **Y ya se olvidaron una vez.** La migración del 28-jul (`20260728120000`) le puso el filtro a la VISTA y **se olvidó de su MV** — `switch_estadocuenta_aging_mv`, que había nacido como copia verbatim de su cuerpo y es **lo que lee `/api/cxc/aging`**. Mientras Boston tuvo 0 filas de estado de cuenta no se vio; desde que su cartera se carga (30-jul), la MV empezó a traerla. Medido en producción el 12-ago-2026: **VIEW 211 filas / 0 de Boston · MV 593 filas / 382 de Boston**.
> - **Las tarjetas del panel NO llegaron a mostrar un número inflado, y está medido en el navegador**: `Total $3.718.004,16 · 99 clientes · 0-90d $1.816.089,65 · 91-120d $763.886,47 · 121d+ $1.138.028,04`, iguales antes y después del arreglo. **Lo que las salvaba era una proyección en React** (`roleClients`/`filtered` en `admin/page.tsx`, que se queda solo con las 6 empresas): las 382 filas de Boston llegaban al navegador y ahí se descartaban. La separación estaba a cargo de un `useMemo`.
> - **Lo que ese `useMemo` tapaba**, si se lo quita o si alguien lee el payload crudo: total **$3.905.038,06** (+$187.033,90, la cartera de Boston entera, tramo por tramo) y **476 clientes** en vez de 99. Y como el CXC consolida por `nombre_normalized`, **5 clientes quedarían con las dos deudas SUMADAS en una sola fila** — ALADDIN ($1.247,00 + $11.176,58), LA FRONTERA DUTY FREE ($380.732,79 + $5.077,69), WOLF MALL CENTER INT, CITY MALL PASO CANOA y VENTAS LOCAL —, que es literalmente lo que Daniel prohibió.
> - **El arreglo (`20260812180000_aging_mv_excluye_boston.sql`, la corre Daniel A MANO) NO le agrega el `NOT IN` a la copia.** Eso arreglaría hoy y dejaría el mismo defecto para mañana: dos cuerpos SQL que hay que acordarse de tocar juntos. **La MV pasa a MATERIALIZAR LA VISTA** (`SELECT v.*, now() AS materializado_en FROM switch_estadocuenta_aging v`), así que hereda el filtro, los buckets y el signo defensivo **por construcción** y no puede volver a apartarse. Hay que `DROP` + `CREATE` porque el cuerpo de una MV no se puede reemplazar; es seguro (dato derivado, se repuebla sola) y **no hay ventana ciega**: `/api/cxc/aging` ya cae solo a la VIEW en vivo, que da los números buenos.
> - **La pestaña de Boston no cambia en nada** (`switch_estadocuenta_aging_boston` no se toca). Medida en el navegador antes y después: **382 clientes · $187.033,90 · 0-90 $51.748,18 · 91-120 $13.627,15 · 121+ $121.658,57**.
>
> **Otras dos fugas del MISMO patrón, encontradas en el barrido y arregladas en el mismo PR.** Las dos son "una fila de Boston contestando una pregunta del grupo", las dos son de FRESCURA (no de plata) y las dos son **LATENTES** — hoy no se notan porque Boston va 13 h más atrasada que el grupo (08:10 UTC contra 21:22, medido), o sea que el `MAX` global da justo el del grupo. Latente es el peor estado posible para un vigía: el día que Boston sincronice más tarde, el número se vuelve mentira sin que nada avise.
> - `integrity-checks.ts` → `last_upload_age_cxc` leía `MAX(synced_at)` de `switch_estadocuenta` **sin filtro**: un sync de Boston taparía un atraso real del grupo y el check quedaría verde justo cuando hay que mirarlo. Ahora `.in("empresa_key", CXC_GRUPO_EMPRESA_KEYS)`.
> - `home_dashboard_summary` → `lastUpload` (el "actualizado hace…" del Inicio), lo mismo. DDL aparte: `20260812190000_home_lastupload_solo_grupo.sql`. **Va en un archivo SEPARADO a propósito**: el arreglo de la MV es el urgente y no puede quedar sin correr porque éste falle. Su cuerpo se copió **programáticamente** de la definición vigente y el diff es **UNA línea** — copiar un cuerpo SQL a mano es justo el mecanismo que produjo el bug de la MV. La PLATA del Inicio (`cxcTotal`, `cxcVencida`) ya salía de la vista y **nunca estuvo mal**.
>
> **EL CANDADO: `src/__tests__/lib/cxc-boston-fuera-de-toda-superficie.test.ts`.** No alcanzaba con probar la vista. `boston-no-se-mezcla.test.ts` protege superficies NOMBRADAS a mano (abre `20260728120000` por su nombre y verifica 6 rutas de una lista literal): caza lo que ya se conoce y **no puede cazar lo que se agregue mañana** — que es exactamente cómo se escapó este bug. El candado nuevo son **dos BARRIDOS sin listas de objetos**:
> - **BARRIDO 1 (SQL)** — recorre `supabase/migrations/` ENTERA, arma la definición **FINAL** de cada VIEW / MV / FUNCTION (respetando redefiniciones y `DROP`s) y exige que **todo** lo que lea `switch_estadocuenta` esté acotado: o excluye la cartera aparte, o es de un solo lado, o recibe la empresa por parámetro, o **DERIVA** de un objeto ya seguro. Un test aparte exige que la MV **no** lea la tabla base (o sea: que siga siendo la vista materializada y no una copia).
> - **BARRIDO 2 (TypeScript)** — recorre `src/` y exige que **toda** lectura de la tabla base acote por `empresa_key` en la misma cadena. Comentarios fuera, así que un ejemplo en la documentación no cuenta como filtro.
> - Las excepciones existen pero son **explícitas y con el motivo escrito** (`SQL_PERMITIDOS` / `TS_PERMITIDOS`), y hay tests que fallan si una excepción queda **zombi** (el objeto o el archivo ya no existe). Los dos barridos empiezan con un test que exige encontrar objetos: un parser roto devolvería 0 y todo pasaría en verde sin haber mirado nada.
> - **También se prueba la SEGUNDA mitad de la regla**: que las 6 sean exactamente las 6, que ninguna esté en la cartera aparte, que la vista **excluya en vez de enumerar** (enumerar deja a joystep pudiéndose caer en silencio otra vez — ya costó $15.262) y que Clientes, Ventas, Búsqueda y Vista General **sigan** mirando la cartera del grupo.
> - **Verificado por mutación, 9 de 9 cazadas:** que la MV vuelva a leer la tabla base con filtro (1) o sin filtro (2) · sacarle el `NOT IN` a la vista (4) · revertir el arreglo de `home_dashboard_summary` (1) · revertir el de `integrity-checks` (1) · **agregar una vista nueva de cartera sin filtro** (1) · **agregar una ruta nueva que lea la tabla base sin empresa** (1) · enumerar las 6 en vez de excluir (3) · que la MV pierda `materializado_en` (1).
>
> **Herramientas (solo lectura):** `DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-cxc-boston-mezclado.ts` reproduce las tarjetas del panel desde la MV y desde la VIEW, **con y sin la proyección de React**, y lista los clientes que quedarían sumados. `BASE=… node scripts/_medir-panel-cxc-boston.mjs` lo mide en el navegador, en las dos pestañas.
>
> ⚠️ **`cxc_favorites`, `cxc_client_overrides` y `cxc_contact_log` comparten el namespace de `nombre_normalized` entre grupo y Boston** (no tienen columna de empresa): los 5-10 nombres que existen en los dos lados comparten estrella, contacto y correo. **NO es plata y no se tocó** — arreglarlo pide DDL y una decisión de Daniel (¿el contacto de CITY MALL PASO CANOA es el mismo señor para las dos carteras?). Hoy la pestaña de Boston ni siquiera muestra favoritos (`BostonTab.tsx` pasa `esFavorito: () => false`).

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
| Gerente ACS | `gerente_acs` | SOLO Multifashion (/multifashion + /api/multifashion/*), y **el módulo COMPLETO** — todo el histórico, igual que admin (ver nota abajo). Auto-redirect a Multifashion desde home (único módulo). Módulos vía `role_permissions` |

> Roles reales del sistema = los 6 de arriba (`src/lib/modules.ts` → `SYSTEM_ROLES`). No existen roles `director` ni `cliente` (el catálogo Reebok es público, sin login).

> ## 🔴 LA VENTANA DE `gerente_acs` SE LEVANTÓ — Multifashion COMPLETO (13-ago-2026)
>
> Daniel, textual: ***"abrile Multifashion completo"***. Desde jul-2026 Jennifer solo podía ver, **dentro** de Multifashion, el mes en curso + el mismo mes del año pasado, impuesto en el SERVIDOR ruta por ruta. **Se retiró entero.** Hoy ve el módulo igual que un admin.
>
> **Por qué se levantó, y por qué no es aflojar un candado:** Jennifer es la GERENTE de Multifashion y **ya veía TODO del mes en curso, incluido el margen**. Lo que la ventana le tapaba no era información sensible: era el HISTÓRICO — o sea la única forma de saber si un mes fue bueno o malo. Y se le paga un **bono mensual por un +10% de crecimiento** que, sin el año anterior completo, no podía verificar. La restricción le costaba más de lo que protegía.
>
> ### Qué se retiró exactamente
>
> - **El módulo entero `src/lib/multifashion/ventana-gerente.ts`**, con sus 6 clamps (`clampAnioMes`, `clampRangoFechas`, `clampFechaDia`, `clampDiaComparable`, `clampPeriodoProductos`, `clampPeriodoVendedoras`), `ventanaGerente`, `esRolAcotado` y sus tipos. **Ningún otro módulo lo usaba**: `ultimoDiaDelMes` de `asistencia/planilla.ts` y de `egresos/reglas.ts` son funciones PROPIAS de esos archivos (otras firmas), y el `fechaPanama` que sobrevive es el de `cheques-aviso-ventana.ts` + `hoyPanama`/`fechaPanamaDe` de `src/lib/fecha-panama.ts`. Nada que mudar, nada roto.
> - **Las 9 rutas** (`overview`, `detalle-mensual`, `bonos`, `vendedoras`, `clientes-wholesale`, `retail-recurrentes`, `caja`, `venta-hoy`, `productos`) usan los parámetros CRUDOS que ya venían parseados.
> - **La UI**: se fue el prop `ventanaAcotada` del shell y de los 4 sub-tabs. El selector de mes con las flechas ‹ ›, los chips de período (mes cerrado / YTD / 3m-6m-12m), las pills de rango de Clientes y la píldora "Últimos 12 meses" de Productos están **visibles y funcionando** para `gerente_acs` igual que para admin, y el selector de año ya no filtra a {actual, anterior}.
> - **`venta-hoy` dejó de tener un camino a medias**: `clampDiaComparable` devolvía `null` para apagar un comparativo fuera de ventana, así que los primeros días de cada mes Jennifer veía la tarjeta sin el "vs el lunes pasado". Ahora los DOS comparativos se piden siempre y `VentaHoy.semanaPasada`/`.ayer` dejaron de ser nulables.
> - **El candado viejo** `src/__tests__/lib/multifashion-ventana-gerente.test.ts` (77 casos) se borró.
>
> ### ⚠️ LO QUE **NO** CAMBIÓ — y es la mitad que importa
>
> **Abrirle el histórico NO le abrió NADA más.** Sigue siendo su **ÚNICO** módulo (`getDefaultModulesForRole("gerente_acs")` = `["multifashion"]`), conserva el **auto-redirect** a `/multifashion` desde `/home`, y las rutas de todos los demás módulos le siguen contestando **403**. Tampoco cambió quién entra a cada ruta de Multifashion: los `requireRole` están intactos.
>
> ⚠️ **La validación de parámetros NO era la ventana y se QUEDA**: `year` entre 2000 y 2100, `mes` 1..12, `periodo` en su lista cerrada, `n` en {3,6,12}, formato `YYYY-MM-DD`, `limit` 1..500 y "la fecha no puede ser futura". Eso protege a la base de un parámetro absurdo y nunca tuvo que ver con Jennifer.
>
> ⚠️ **La empresa sigue siendo una CONSTANTE, no un parámetro.** Multifashion ES `american_classic`; aceptarla por query le abriría desde su único módulo las otras 7 empresas del grupo. Hay candado.
>
> ### El candado nuevo que lo vigila
>
> **`src/__tests__/lib/multifashion-acceso.test.ts` (35 casos).** Conserva lo del archivo viejo que NO era la ventana y agrega lo que faltaba:
> - **Inventario CONGELADO** de `/api/multifashion/**` (bonos, caja, clientes-wholesale, detalle-mensual, fidelizacion, metas, overview, productos, retail-recurrentes, vendedoras, venta-hoy): una ruta nueva en el único módulo de un rol acotado la mira alguien antes de que exista. Ya no se exige clamp —no hay ventana— pero sí que **ninguna** ruta importe el módulo retirado, que todas exijan sesión y rol, y que ninguna lea la empresa de la URL. **`metas` no exige clamp y nunca lo necesitó**: no acepta fechas del navegador, su período sale de la fila de la base.
> - 🔴 **CONDUCTA, rol por rol**: llama a los handlers REALES de 9 módulos ajenos (Ventas, Proveedores, Gastos–saldos, Gastos–egresos, Marketing, Caja Menuda, Packing Lists, Directorio, Asistencia) con una **cookie firmada de `gerente_acs`** y exige **403** — y encima verifica que esas mismas rutas SÍ dejen entrar a `admin`, para que el 403 pruebe algo. Sin cookie → 401.
> - **Y lo que sí ganó**, también medido: las 10 llamadas de Multifashion con períodos que antes se recortaban (año 2024, YTD, rolling 12m, rangos de 3 años, día viejo de caja, `periodo=12m`) responden **200**, y el payload es **byte a byte el mismo que recibe un admin**.
> - El snapshot literal de módulos por rol sigue viviendo en `src/__tests__/lib/catalogo-roles.test.ts` (`gerente_acs: ["multifashion"]`, junto a bodega, contabilidad y vendedor) y **no se aflojó**.
> - **Verificado por mutación:** agregarle `gerente_acs` al `roles[]` de otro módulo rompe 3, agregar una ruta nueva al árbol rompe 1, aceptar `?empresa=` rompe 1, sacarle el `requireRole` a una ruta del módulo rompe 1, abrirle una ruta ajena rompe 1, quitar el auto-redirect de módulo único rompe 1, volver a recortar el período por rol rompe 2 y aflojar una validación de parámetro rompe 1.
>
> ### Lo que sobrevive del bloque viejo
>
> - **Borde de mes = UTC-5 fijo.** Panamá no tiene horario de verano y el 1-ago 02:00 UTC allá todavía es 31-jul. Sigue valiendo para todo lo que corte un día de negocio (`hoyPanama` / `fechaPanamaDe` en `src/lib/fecha-panama.ts`), y los tests siguen usando fechas FIJAS (`vi.setSystemTime`), nunca `new Date()`.
> - **La serie anual del overview se devuelve COMPLETA** (`multifashion_overview_serie_v1(p_year)` da los 12 meses). Antes era una decisión que había que explicar porque convivía con la ventana; ahora es simplemente lo que hace la RPC.

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
- **Operación:** Guías de Despacho, Packing Lists, **Asistencia y Planilla**, Reclamos, Depurador (`/productos/cargar`), Comisiones, Marketing, Caja Menuda, **Gastos** (2 pestañas: *Gastos* —Egresos Varios, fuente ÚNICA desde el 13-ago-2026— y *Saldos de banco*), Préstamos, Cheques

> ## 🔴 EL MAYOR CONTABLE SE RETIRÓ — queda UNA sola fuente de gasto (13-ago-2026)
>
> Daniel, textual, después de entender que Vista General usaba el mayor y el módulo de Gastos usa Egresos Varios: ***"y entonces borra Mayor contable en el sistema"***.
>
> **Por qué:** eran dos formas de medir lo mismo y el mayor iba **siete meses atrás** — `mayor_lineas` tiene **135 filas y solo enero**, contra los 441 renglones de `egresos_varios` que llegan hasta julio. El módulo ya mostraba Egresos Varios por defecto; el mayor era una fuente ALTERNATIVA que había que elegir a mano.
>
> 🔴 **EL ORDEN IMPORTABA Y SE RESPETÓ.** Este retiro esperó a que **#536 (Vista General sale del mayor) estuviera MERGEADO en `main`** — se verificó en el commit, no de palabra. Sacarlo antes le habría roto el tablero al dueño. Cuando se revisó por primera vez, #536 seguía abierta y el trabajo se frenó.
>
> ### Qué se retiró
>
> El cron **`sync-mayor`** (09:05 UTC — un login web menos por día contra Switch, y cada login puede expulsar a Daniel del panel), su route, `lib/switch-api/sync-mayor.ts`, `lib/mayor/` entero, la **fuente "mayor"** del módulo con su **selector** y el **`?fuente=`** de la URL, la ruta `api/gastos-contabilidad/resumen`, los componentes `ResumenEmpresas` · `DetalleEmpresa` · `EstadoMesTag` · `AvisosDelMes` · `SelectorFuente`, `fetchMayorAsientos` y `pareceCsvDelMayor` de `web-client.ts`, y los tests y scripts que solo probaban esa fuente. **66 → 65 crons.** Un `?fuente=mayor` guardado en un marcador es **INERTE**: la pantalla lo ignora.
>
> 🩸 **`lib/mayor/` NO ERA SOLO DEL MAYOR, y borrarlo de una habría roto la única fuente de gasto que queda.** El barrido encontró **SEIS módulos vivos** colgados de esa carpeta: `esTablaAusente` (la degradación limpia de `cuentas/leer`, `egresos/leer`, `inventario/leer`, `sync-cuentas-contables`, `sync-egresos-varios` y la ruta de egresos), `montoACentavos`/`normalizarTexto`/`CUENTA_RE` (`egresos/parser` y `egresos/leer`) y **`esGasto`** (`egresos/reglas`, que lo importaba **a propósito** para que el criterio de gasto fuera EL MISMO en las dos fuentes). Nunca fueron del mayor: son del formato en que Switch exporta contabilidad, y estaban ahí porque el mayor llegó primero. Se **MUDARON** a `src/lib/contable/` (`tabla-ausente.ts`, `csv.ts`, `cuentas.ts`) con los **cuerpos EXACTOS, sin reescribir** — volver a escribir `montoACentavos` habría estrenado una segunda forma de leer un monto, y su modo de fallo es un gasto perdido en silencio.
>
> ⚠️ **`web-client.ts` ES COMPARTIDO y no se tocó de más.** El login web, el token CSRF, `/cierresesion`, `fetchEgresosVarios` y `fetchCatalogoCuentas` son de Egresos Varios y del catálogo de cuentas: los dos siguen vivos. Solo se quitó lo que **únicamente el mayor** llamaba. La lección del mecanismo tampoco se pierde: el rango de fechas viaja en un POST previo y el servidor **se lo guarda en la sesión**, así que saltarse ese paso devuelve un CSV perfecto del período EQUIVOCADO sin un solo error — está escrito en el bloque de EGRESOS VARIOS, que hace exactamente lo mismo.
>
> ### 🔴 Lo que NO se borró
>
> - **LA TABLA `mayor_lineas` (135 filas) y `mayor_importaciones` QUEDAN.** Misma decisión que con `multifashion_tickets` y `empresa_gastos_mensuales`: **borrar datos es irreversible, apagar la escritura se deshace en un minuto.** Un test recorre TODAS las migraciones y pone el build **rojo** si alguna intenta un `DROP TABLE` de las dos.
> - **El backup las sigue copiando** mientras las filas existan. Se sacan del backup en el MISMO cambio que borre las tablas, nunca antes.
> - **`"mayor"` sigue en `SYNC_LOG_TYPES`**: el CHECK de `switch_sync_log` lo admite y hay filas históricas con ese valor. Sacarlo del TS sin una DDL que reescriba el CHECK haría **divergir el código de la base**, que es justo lo que ese candado vigila. Barrer el CHECK es higiene opcional, no un pendiente.
>
> ### ✅ Los nombres de las cuentas NO dependían ya del mayor — medido
>
> `cuentas/leer.ts` busca el nombre en `cuentas_contables` y **cae de respaldo a `mayor_lineas.cuenta_nombre`**, así que cortar el mayor podía dejar la pantalla mostrando códigos pelados. Medido (`scripts/_diag-nombres-sin-mayor.ts`, solo lectura): `cuentas_contables` (987 filas, sync `success` el 13-ago 17:47) cubre **las 64 de 64 cuentas** que Egresos Varios usa. **No se pierde ni un nombre.**
> - 🩸 **La primera corrida dio 0 de 64 y era EL SCRIPT, no el dato:** paginaba con `.order("id")` —columna que esa tabla no tiene— y un `.catch(() => [])` convertía el error de PostgREST en *"el catálogo no cubre nada"*. **Medir cero y darlo por bueno es el peor resultado posible**; se quitó el catch y el orden va por `(empresa_key, cuenta)`, que es la llave real.
>
> ### ⚠️ Qué pierde Daniel, y cómo volver a encenderlo
>
> El mayor era **"lo que la contadora cerró"** — contabilidad devengada, con el ISR en su línea, las cuatro cuentas sin salida de caja y el estado del mes (cerrado / incompleto / sin cerrar / no traído). **Esa vista desaparece.** Es lo que él pidió, y el motivo es que iba 7 meses atrás mientras Egresos Varios está vivo; pero es una pérdida real y queda escrita.
> - **Para volver a encenderlo: `git revert` del PR "el mayor contable se retira".** Trae de una sola vez el cron, `vercel.json`, el registro de crons, la librería, la ruta, los cuatro componentes y el selector. **Los datos ya están** (las tablas nunca se borraron), así que el módulo vuelve con enero cargado. Habría que borrar también el candado `vista-general-gasto-egresos.test.ts` → *"el MAYOR se retiró"*, que es lo que hace fallar el build si alguien lo reenciende sin querer.
>
> ### Ningún número del módulo cambió — medido
>
> **`BASE=… OTRO=… node scripts/_verif-gastos-no-cambian.mjs`** lee la MISMA API en los DOS builds (esta rama y `origin/main`) y compara **campo por campo, por POSICIÓN** (como conjunto, dos empresas intercambiadas se verían idénticas): **6 meses · 1.813 campos · 0 diferencias.** Vista General: **359 campos, 0 diferencias reales** (solo `generadoEn` y `ms`, que son el reloj), con **Disponibilidad $629.531,03 · 7 cuentas · al 31 jul**.
>
> **Los 3 anchos** (`scripts/_medir-gastos-al-dia.mjs`, en un mes con datos y en uno casi vacío): **390 · 834 · 1440 → 0 px de arrastre, 0 blancos táctiles bajo 44 px, 0 textos bajo 12 px.**
>
> **Candados:** `vista-general-gasto-egresos.test.ts` **cambió de dirección el mismo día** — cuando #536 salió del mayor, exigía que el mayor SIGUIERA VIVO (apagarlo de paso habría sido un recorte que nadie pidió); ahora exige que **no vuelva a encenderse sin decisión**, que lo compartido se haya mudado, que el login web compartido siga entero, que ninguna migración dropee las tablas y que el cron se haya ido de vercel.json **y** del registro (la biyección de `cron-registro.test.ts` pone el build rojo si se toca uno solo).
> - 🩸 **Un candado volvió a fallar por leer comentarios:** `not.toContain("fetchMayorAsientos")` sobre `web-client.ts` fallaba **con el código ya limpio**, porque la nota que documenta el retiro nombra justo lo retirado. El barrido ahora borra los comentarios primero — tercera vez que este repo paga lo mismo.

> ## HASTA QUÉ MES ESTÁ AL DÍA CADA EMPRESA — el avance de la contadora, en una línea (13-ago-2026)
>
> Daniel confirmó que los gastos de las 8 empresas SÍ se registran en el mismo lugar y que lo que falta es que la contadora se ponga al día. Textual: ***"por ahi mismo pero no esta acutalizado aun, estamos en eso"***. Este indicador existe por UNA razón: **que él vea ese avance sin preguntárselo a nadie**. Vive en la pestaña *Gastos*, debajo del nombre de cada empresa, en las dos formas de la lista (tarjetas y tabla) y **siempre** — no solo cuando el mes que se está mirando está vacío.
>
> ```
> Vistana International  [Al día]     Cargado hasta julio 2026
> Fashion Wear           [Al día]     Cargado hasta mayo 2026 · ese mes va en $257.43
>                                     y lo habitual acá es $2,482.05: puede estar a medio cargar   ← ámbar
> Active Shoes      [Sin movimientos] Todavía no hay gastos registrados
> ```
>
> 🔴 **LA LÍNEA DE LA HONESTIDAD, que es de lo que trata todo esto:** lo único que se AFIRMA es lo que el dato dice literalmente — **hasta qué mes hay renglones cargados**. **"Ese mes está incompleto" NO se puede afirmar con egresos**: son pagos sueltos, no tienen un asiento de cierre que diga "terminé" (eso sí existe en el mayor, `esAsientoDeCierre`). Así que **no hay semáforo inventado**: hay un mes y, cuando el historial de la PROPIA empresa lo justifica, una sospecha declarada como tal (*"puede estar a medio cargar"*, nunca *"está"*) **con los dos números a la vista** para que se pueda juzgar.
>
> 🩸 **EL CASO REAL, medido en producción sobre los 441 renglones de `egresos_varios`** (`scripts/_diag-gastos-al-dia.ts`, solo lectura): `fashion_wear` viene de $6.482,97 en enero y su último mes cargado, mayo, trae **$257,43 — el 10% de lo habitual**. No PRUEBA que esté a medias (una empresa puede gastar menos), pero es exactamente lo que hay que poner delante de los ojos.
>
> | Empresa | Cargado hasta | ¿Marcada? |
> |---|---|---|
> | vistana | **julio** ($13.276,86, el 92% de su mediana) | no |
> | fashion_wear | **mayo** ($257,43 contra $2.482,05) | **sí, 10%** |
> | fashion_shoes | **abril** ($2.250, el 75%) | no |
> | active_wear | **abril** ($0,00 contra $416,95) | **sí, 0%** |
> | active_shoes · joystep · american_classic | — | *"Todavía no hay gastos registrados"* |
> | confecciones_boston | *(sin línea)* | no se baja sola — su explicación ya lo dice |
>
> - **LA FUENTE ES EGRESOS VARIOS, y se eligió MIDIENDO las dos.** El mayor contable tiene 135 filas y solo enero; los números de la tabla de arriba cuadran **exacto** con `egresos_varios`. **El indicador NO se puso en la pestaña del mayor**: ahí el dato no es el que la contadora está poniendo al día, y una segunda línea diciendo "cargado hasta enero" al lado de ésta se leería como una contradicción. (Y con el retiro del mayor esa pestaña desaparece.)
> - **La regla, en `src/lib/egresos/al-dia.ts` (módulo PURO):** se marca cuando el último mes trae **menos del 25%** (`UMBRAL_INCOMPLETO`) de la **MEDIANA** de los meses previos, y solo con **3+ meses previos** (`MIN_MESES_PREVIOS`) — con uno o dos, "lo habitual de esta empresa" no existe todavía y la sospecha sería ruido. **MEDIANA y no promedio**: vistana tiene un marzo de $37.404 entre meses de ~$13.000, y con promedio su julio queda en 75% mientras con mediana da 92% — un solo mes atípico no puede mover la vara. El 25% está calibrado contra los datos reales **en las dos direcciones**: marca a fashion_wear y active_wear, y **NO** marca a fashion_shoes (75%) ni a vistana (92%). Un umbral flojo marcaría a las cuatro y el aviso dejaría de leerse.
> - 🔴 **"Todavía no hay gastos registrados", NUNCA $0.00.** Un cero le diría a Daniel que esas empresas no gastaron; gastan, lo que falta es que estén cargadas. Es la misma regla que ya rige para Boston.
> - **El mes EN CURSO es un hecho del calendario, no una sospecha** (*"que todavía va corriendo"*), y **gana** sobre la estadística: sin ese orden, el primer día de cada mes las 8 empresas dirían "puede estar a medio cargar" — verdadero e inútil, y el aviso se quemaría.
> - **La serie es de GASTO (grupo 6), no de todo lo que salió de caja.** Es el mismo criterio con el que la pantalla pinta "De eso, gastos": comparar contra las transferencias entre cuentas propias sería comparar contra un número que no está a la vista.
> - **Boston queda SIN línea**, a propósito: su vacío no es atraso de la contadora sino la decisión de Daniel de que no se baje sola, y su explicación ya lo dice entera. Acusarla de un atraso que no tiene sería peor que no decir nada.
> - 🔴 **DICE "CARGADO HASTA", NO "AL DÍA HASTA".** La píldora de la MISMA fila ya usa **"Al día"** para otra cosa (que el mes que estás mirando tuvo movimientos): dos frases parecidas diciendo cosas distintas en el mismo renglón es el defecto que este módulo ya pagó con "Gastos de Empresa" vs "Gastos por Empresa". La píldora es anterior y **no se toca**; se renombró el texto nuevo.
> - **De paso se podó una repetición:** la coletilla *"Lo último que hay es de mayo 2026"* del estado `sin_datos` **se fue** — la línea nueva dice exactamente eso, y decía DOS VECES el mismo mes en la misma tarjeta.
> - ⚠️ **SIN CONSULTA NUEVA NI DDL.** La serie mensual sale de la MISMA lectura que ya traía "los meses con movimiento" (se le sumaron 2 columnas, `cuenta` y `total`, a un `leerTodoPaginado` que ya recorría la tabla). Cero consultas extra contra una base en compute Micro.
>
> **Los 3 anchos, en el navegador contra el build de producción y con datos de producción** (`BASE=… node scripts/_medir-gastos-al-dia.mjs`, solo lectura, en un mes CON datos y en uno casi vacío): **390 · 834 · 1440 → 0 px de arrastre, 0 blancos táctiles bajo 44 px y 0 textos bajo 12 px**; el único "recortado" es el `h1.sr-only`, que ya estaba. La línea crece hacia abajo. El script **falla** si no encuentra las 8 empresas, si falta el texto de la empresa sin gastos, o si una empresa sin nada aparece con un `$0.00`.
>
> **Candados:** `gastos-al-dia.test.ts` (17, con los datos REALES de producción), **`gastos-al-dia-lectura.test.ts`** (6, ejecuta `leerEgresosMes` con la base mockeada) y **`components/gastos-al-dia-pantalla.test.tsx`** (12, **pinta la lista y lee las filas**).
> - 🩸 **DOS mutaciones pasaban en verde, y las dos vivían en la capa de LECTURA, que no tenía un solo test:** borrar la línea que agrega `alDia` (la pantalla se quedaba sin el indicador entero, **en silencio** — `fraseAlDia` tolera un `alDia` ausente, que es correcto para un payload viejo de SWR y acá era el tapón perfecto) y dejar de filtrar la serie a grupo 6. Por eso existe `gastos-al-dia-lectura.test.ts`. ⚠️ Y el fixture de esa segunda tuvo que **rehacerse**: con transferencias en un solo mes la mediana no se movía y el candado pasaba igual — un test que no discrimina no es un candado.
> - **Verificado por mutación, 15 de 15 cazadas:** que la línea no se dibuje en las tarjetas (6) o en la tabla (1) · que la empresa sin nada se muestre en $0.00 (1) · que la sospecha pierda los dos números (1) · que deje de ir en ámbar (1) · que Boston se acuse de atraso (1) · que vuelva el "Al día hasta" que choca con la píldora (5) · aflojar el umbral al 80% (2) · comparar contra el promedio (1) · sospechar con 1 mes previo (1) · tratar el mes en curso como sospecha (3) · inventar los meses vacíos como $0 (3) · que la serie deje de ser solo gasto (2) · que la ruta deje de mandar `alDia` (5) · calcular el `alDia` sobre el mes mirado en vez de sobre toda la historia (3).

> ## 🔴 EN GASTOS LAS EMPRESAS SE VEN TODAS, PERO NO SE SUMAN — LA REGLA, TEXTUAL (13-ago-2026)
>
> Daniel, palabra por palabra, cuando se le preguntó si Confecciones Boston tenía que quedar en el módulo: *"si quiero ver gastos de boston, pero **cada compañia por separado, sin juntar los gastos entre todos** me explico?"*
>
> **Son DOS afirmaciones y las dos son la regla:**
> 1. **Boston SE VE en Gastos.** Las **8** empresas están en el módulo, Boston y Multifashion incluidas. No se esconde ninguna.
> 2. **NUNCA existe un número que sume los gastos de más de una empresa.** Ni una fila "Total del grupo", ni un gran total al pie de una tabla, ni un "todas las empresas", ni una suma en un export. Si algún día hay un selector "Todas", muestra las empresas **una al lado de la otra**, jamás sumadas.
>
> ⚠️ **NO ES LA REGLA DE CXC, y copiarla de más sería un error.** Ahí Daniel dijo de Boston *"no deben de ni convivir juntos"* y su cartera va en una pestaña aparte (ver arriba). Acá el matiz es el contrario en su primera mitad: en Gastos Boston **sí convive en la misma pantalla**; lo único prohibido es **mezclar los números entre empresas**. Aislar a Boston de la vista sería aislar de más.
>
> **Estado medido al escribir la regla (13-ago-2026):** el módulo ya cumplía —no tenía ni un total de grupo, ni exports— así que no hubo que quitar nada. Lo que se agregó es el **candado**: `src/__tests__/components/gastos-sin-totales-entre-empresas.test.tsx` **PINTA** la lista con dos empresas de $100 y $200 y exige que **$300 no aparezca por ningún lado**, en las dos fuentes (mayor y egresos varios) y en las dos formas (tarjetas y tabla). Verificado por mutación: una fila `<tfoot>` con el total y un total suelto en las tarjetas lo ponen rojo. **Es un test de CONDUCTA a propósito** — un barrido de texto sobre el archivo no sirve, y en este mismo PR se comprobó por qué: el guard del cero silencioso de egresos se pudo desarmar (`if (false)`) sin que nada se pusiera rojo, porque el barrido encontraba el mensaje del `throw` ya inalcanzable.
>
> ⚠️ **PENDIENTE DE DECISIÓN DE DANIEL — Vista General sí suma gastos entre empresas.** `api/dashboard/vista-general` calcula `gastos.total` sumando el gasto de las empresas cuyo mes es mostrable, y de ahí sale la Rentabilidad del grupo. **NO se tocó**: es otro módulo, la suma es deliberada y documentada (ventas, utilidad y gasto salen del MISMO subconjunto de empresas justamente para no inflarla), y quitarla desarma el tablero del dueño. Si la regla de "no juntar" también vale ahí, hay que decidirlo y rehacer esas tarjetas — no es un descuido que se arregle de paso.

> ## 🔴 UN SOLO MÓDULO DE GASTOS, CON DOS PESTAÑAS — y el permiso prestado se retiró (13-ago-2026)
>
> Daniel, sobre Gastos y Saldos de Banco, textual: ***"y debeeria estar en un solo modulo"***. Se fusionaron: **"Gastos"** (`gastos-contabilidad`) con las pestañas *Gastos* y *Saldos de banco* (`/gastos-contabilidad?tab=saldos-banco`). El menú de Operación baja de 12 fichas a 11.
>
> ⚠️ **NO ES DESHACER LO DEL 11-ago, es la CONSECUENCIA de que aquello terminó.** `saldos-banco` nació como ficha suelta (#465/#467) por UNA razón acotada: poder retirar el módulo viejo "Gastos de Empresa" sin dejar a Contabilidad sin el único dato que usaba. Cerrada esa mudanza, la ficha no compra nada — ver el bloque de abajo, que sigue vigente en todo lo demás.
> - **La pantalla se MUDÓ ENTERA, no se recortó.** `SaldosBancarios.tsx` y `types.ts` son los MISMOS archivos (`git mv`, tercera mudanza y nunca una copia): viven en `app/gastos-contabilidad/components/saldos/`. Lo único que perdieron es su `AppHeader` y su `<h1>` — los pone la página anfitriona. **La API NO se movió**: sigue siendo `/api/saldos-banco`.
> - **`/saldos-banco` sigue llegando** (redirect 307 en `next.config.js` → `/gastos-contabilidad?tab=saldos-banco`), como los demás slugs viejos. La tarjeta "Disponibilidad" de Vista General apunta ahí y **no se tocó** (es de otro módulo).
> - 🔑 **SE RETIRÓ EL PERMISO PRESTADO** (`MODULO_HEREDA_PERMISO_DE["saldos-banco"] = "gastos-empresa"`), y por las DOS razones a la vez: (1) `saldos-banco` ya no es módulo → la entrada quedaba **zombi**, y (2) la puerta al dato pasa a ser `gastos-contabilidad`, que **Contabilidad tiene POR DERECHO PROPIO**. Medido en producción antes de tocar nada (`scripts/_diag-gastos-saldos-fusion.ts`, solo lectura): `role_permissions.contabilidad.modulos` = `["asistencia","gastos-empresa","prestamos","proveedores","ventas","saldos-banco","gastos-contabilidad"]`. O sea que las DOS migraciones del 11-ago que "nunca se corrieron" **sí se corrieron a medias**: `20260811120000` está aplicada (la key está) y `20260811130000` no (`gastos-empresa` sigue ahí). La herencia de `referencia` **se queda** (es otra cosa, otra DDL).
> - **Quién ve qué, rol por rol — antes y después:** `admin` pasa de **2 fichas a 1** (y ve las dos pestañas) · `contabilidad` pasa de **6 módulos a 5**, entra por Gastos y toca la pestaña · `secretaria`, `bodega`, `vendedor` y `gerente_acs` **no veían ninguno de los dos y siguen sin verlos**. La API tampoco se abrió: `requireRole(["admin","contabilidad"])` intacto.
> - ⚠️ **DDL ADITIVA, la corre Daniel A MANO y la app funciona SIN ella:** `20260813140000_retirar_modulo_saldos_banco.sql` barre las keys `saldos-banco` y `gastos-empresa`, que quedaron **INERTES** (no están en `ALL_MODULES`, así que no pintan ficha). **Asegura `gastos-contabilidad` ANTES de sacar nada** — al revés dejaría al rol sin ningún módulo de gastos. No toca `bancos_saldos`.
> - 🔴 **La "Disponibilidad" no se movió un centavo**, medida en el navegador contra el build de producción **y contra `origin/main`**: **$629.531,03 · 7 cuentas · al 31 jul**, idéntica en los dos. No pasa por esta API, pero se verificó igual.
>
> ### La carga de saldos: ver el historial y corregir sin pisar otra fecha
>
> Daniel: *"hagamoslo carga manual, pero que se pueda editar, corregir, ver historial, osea lo necesario para que la contable meta los saldos y vea si lo hizo bien de manera minimalista y simple"*.
>
> 🩸 **HAY UN CASO REAL QUE PRUEBA QUE HACÍA FALTA, y es el que se usa de fixture.** Medido en producción: las **3 cargas del 10-ago repiten AL CENTAVO el saldo del 31-jul** — `active_shoes $27.647,97 · active_wear $60.678,97 · fashion_shoes $74.336,02`. Se copiaron los de julio, y la pantalla vieja —un saldo por empresa y nada más— **no tenía forma de enseñarlo**.
> - **Ahora la pantalla lo hace evidente en DOS lugares:** un aviso ámbar arriba (*"3 saldos quedaron igualitos al anterior — Fashion Shoes, Active Shoes, Active Wear…"*) y un chip `igual al 31 jul` en la fila de cada una. El aviso mira **solo el ÚLTIMO** saldo, a propósito: es el que hoy dice cuánta plata hay; un repetido viejo queda marcado en su fila y ya.
> - **El historial es lo que la tabla YA guarda** (`fecha_dato`, `saldo`, `created_by`) — **no se inventó auditoría**. Se despliega por empresa (*"Ver las N cargas anteriores"*) y **tocar una carga vieja la trae al formulario**: monto y fecha. **NO guarda sola** — Guardar sigue siendo un toque aparte, y el botón cambia a **"Corregir"** con la línea *"Vas a corregir el saldo del 31 jul 2026 (hoy dice $27.647,97). Las demás fechas no se tocan."*
> - ⚠️ **`bancos_saldos` NO cambió su forma de escribir:** el MISMO upsert `(empresa_key, fecha_dato)` — repetir una fecha corrige ESA carga y no puede pisar la de otro día — y **cero `DELETE`**. Se lee con `leerTodoPaginado` verificado contra `count: "exact"`: `db-max-rows` = 1000 corta en silencio y acá un truncado se vería como *"esta empresa no tiene saldo"*. Hoy son 52 filas y crece ~84/año; el historial las manda TODAS.
> - **Fuente ÚNICA `src/lib/saldos-banco/historial.ts`** (módulo PURO): la API y la pantalla derivan el "último por empresa" y el "repite exacto" de las MISMAS funciones. Si cada una lo calculara por su cuenta, el saldo de arriba y el historial de abajo podrían contradecirse — que es justo lo que esto vino a hacer visible. La igualdad se mide **al CENTAVO** (`Math.round(x*100)`), no en coma flotante: es la precisión que se muestra.
>
> ### "Asistencia" pasó a llamarse "Asistencia y Planilla"
>
> Daniel, textual: *"y asistencia se debe de llamar asistencia y planilla"*. El módulo ya calculaba la planilla (sueldos, extras, deducciones, el Excel y el PDF que firma la contadora) y el nombre solo hablaba de las marcaciones. 🔴 **La `key` NO cambia** (`asistencia`): está en `role_permissions` y en `fg_users.modulos_override`, y renombrarla rompería permisos y overrides sin comprar nada. Verificado contra el **candado de labels parecidos**, que no se aflojó: "Asistencia y Planilla" no comparte ninguna palabra que distinga con ninguna otra ficha del catálogo.
>
> ### Medición y candados
>
> **Los 3 anchos, en el navegador contra el build de producción y CONTRA `origin/main`** (`BASE=… node scripts/_medir-gastos-saldos-fusion.mjs`, solo lectura): **390 · 834 · 1440 → 0 px de arrastre, 0 blancos táctiles bajo 44 px y 0 textos bajo 12 px** en las dos pestañas, con el historial cerrado y desplegado, y en `/vista-general`. El aviso y los 3 chips se ven en los tres anchos, y `/saldos-banco` responde **200 en `/gastos-contabilidad?tab=saldos-banco`**. Los "recortados" son los `truncate` del nombre de empresa, los `<input>` con monto y el `h1.sr-only` — **el mecanismo, no un defecto**: main mide 10 a 390 px y este PR 12, y los 2 de más son el nombre de las empresas que ahora llevan chip (16 px y 6 px de puntos suspensivos; el monto y el chip se ven enteros). El script **falla** si no encuentra las 2 pestañas, las 8 empresas, el aviso, el historial o el redirect: medir cero y dar verde sin haber mirado nada es el peor resultado posible.
>
> **Candados:** `saldos-banco-modulo.test.ts` (27 — la ficha suelta no vuelve, la pantalla no se perdió, el redirect, la herencia como lista cerrada, quién ve qué rol por rol, el label de Asistencia contra TODO el catálogo), `saldos-banco-historial.test.ts` (19, con los datos REALES de producción), **`saldos-banco-ruta.test.ts`** (7, llama al GET real) y **`components/saldos-banco-pantalla.test.tsx`** (11, **pinta la pantalla y toca los botones**).
> - 🩸 **DOS candados de texto pasaban en verde con la mutación puesta, y los dos por lo mismo que este repo ya pagó antes.** (a) "esta pestaña no tiene `<h1>`" se cumplía **con el comentario que explica que su h1 se fue** → ahora el barrido borra los comentarios primero. (b) Cambiar el `return` del GET de `{ bancos, historial }` a `{ bancos }` **no rompía nada**: el barrido veía que el archivo llamaba a `historialPorEmpresa(...)` y se daba por satisfecho, con el resultado calculado y tirado a la basura — la pantalla habría perdido el historial **en silencio**. Por eso existe `saldos-banco-ruta.test.ts`, que ejecuta el handler y mira el JSON.
> - **Verificado por mutación, 18 de 18 cazadas:** que el aviso desaparezca (1) · que el chip de la fila desaparezca (1) · que tocar una carga vieja GUARDE sola (3) · que el historial no se pueda desplegar (4) · comparar en coma flotante cruda (1) · buscar "la anterior" entre TODAS las empresas (15) · que el "último" gane por orden de fila y no por fecha (1) · que vuelva la ficha suelta al menú (5) · que vuelva el permiso prestado (1) · que Asistencia vuelva a llamarse solo así (1) · que se caiga el redirect (1) · sacar la pestaña del módulo (1) · que el GET deje de mandar el historial (4) · que lo mande SIN marcar los repetidos (1) · que el saldo viaje como string de PostgREST (2) · abrir la API a otro rol (2) · que la migración toque `bancos_saldos` (1).

> **UN SOLO MÓDULO DE GASTOS: "Gastos" — y los saldos de banco viven aparte (11-ago-2026).** ⚠️ **SUPERADO EN PARTE el 13-ago-2026** — ver el bloque de arriba: los saldos dejaron de ser una ficha suelta y son la 2ª PESTAÑA de Gastos, y el permiso prestado se retiró. Todo lo demás de este bloque (el orden de merge, la key `gastos-contabilidad`, las tablas que no se borran, el upsert de `bancos_saldos`) **sigue vigente tal cual**. Decisión de Daniel, textual: *"o simplemente gastos y eliminar el otro"*. Se hizo en DOS PRs sobre el módulo del mayor (#463), y el orden no era negociable.
>
> ```
> ANTES                                     AHORA
> "Gastos de Empresa"  (viejo)              "Gastos"           ← el mayor de Switch, automático
>    ├─ carga manual de gastos (0 usos)     "Saldos de Banco"  ← lo único que sobrevivió del viejo
>    └─ saldos bancarios (52 filas, EN USO)
> "Gastos según Contabilidad" (nuevo)
> ```
>
> **Medido en producción antes de tocar nada:** `bancos_saldos` **52 filas** (ene→ago 2026, **7 empresas**, las 52 con `created_by = "Contabilidad"`) y alimenta la **"Disponibilidad"** de Vista General; `empresa_gastos_mensuales` (la carga manual) **0 filas** — nunca se usó en toda su historia.
>
> 🔴 **EL ORDEN DE MERGE, y por qué importaba:** (1) #463 publica el módulo del mayor · (2) #465 AGREGA "Saldos de Banco" sin quitar nada · (3) #467 retira `gastos-empresa` y el módulo nuevo pasa a llamarse **"Gastos"** a secas. Si la carga manual se hubiera ido antes de que el nuevo estuviera publicado, Daniel se quedaba **sin ninguno de los dos**. Los candados de `src/__tests__/lib/saldos-banco-modulo.test.ts` sostienen el orden en las dos direcciones: en el #465 exigían que el módulo viejo siguiera ENTERO; ahora exigen que el nuevo EXISTA antes de dar el retiro por bueno.
> - **La `key` del módulo nuevo NO cambió con el label: sigue siendo `gastos-contabilidad`.** La migración del #463 y la fila de `role_permissions` ya corrieron con ese nombre; renombrarla no compra nada y rompe las dos. El label es lo único que se movió.
> - **El componente de saldos se MUDÓ, no se copió.** `SaldosBancarios.tsx` y los helpers de saldo/fecha/monto viven en `app/saldos-banco/components/`. Mientras `gastos-empresa` existió, los importaba de ahí — nunca hubo dos copias.
> - **`bancos_saldos` NO se toca.** `/api/saldos-banco` usa el MISMO upsert `(empresa_key, fecha_dato)` que la ruta vieja (repetir la fecha corrige el saldo del día, nunca duplica ni borra) y **pagina con `leerTodoPaginado`**: `db-max-rows` = 1000 corta en silencio y acá un truncado se vería como "esta empresa no tiene saldo", no como un error.
> - **La "Disponibilidad" NO pasa por esa API y no cambió ni un centavo.** La sigue calculando `api/dashboard/vista-general` sobre la misma tabla. Medido contra `origin/main`, mismo build y mismos datos, y otra vez con el módulo viejo ya retirado: **$629.531,03 · 7 cuentas · al 31 jul, idéntico en los tres estados.** Lo único que cambió es a dónde lleva el toque (`/gastos-empresa` → `/saldos-banco`), y las otras tarjetas de gastos ahora llevan a `/gastos-contabilidad` — que acepta los MISMOS `?mes=` y `?empresa=`, así que el deep link por empresa se conserva.
> - 🔴 **LAS TABLAS NO SE BORRARON.** `empresa_gastos_mensuales` (0 filas) y `gastos_categorias` (6 filas) **quedan**: borrar tablas es irreversible y Daniel no lo pidió. Vista General las sigue leyendo para "Gastos / Rentabilidad / Equilibrio" y **no se rompe con la tabla vacía — hoy YA está vacía y la pantalla funciona**. ⚠️ **`gastos_categorias` queda HUÉRFANA**: el módulo nuevo **no la usa** (tiene tabla propia, ver `20260810160000_mayor_contable.sql`), así que su único lector vivo es el `es_fijo` del punto de equilibrio sobre una tabla de 0 filas. Es deuda anotada, no un pendiente urgente. Un test recorre TODAS las migraciones y pone el build rojo si alguna intenta un `DROP TABLE` de las tres.
> - ⚠️ **DOS DDL, las corre Daniel A MANO, y la app funciona SIN ellas:** `20260811120000_modulo_saldos_banco.sql` (le da `saldos-banco` a quien tenía `gastos-empresa`) y `20260811130000_retirar_modulo_gastos_empresa.sql` (asegura las dos keys nuevas y RECIÉN DESPUÉS saca la vieja, también de `fg_users.modulos_override`). 🩸 **Lo que las hace no-bloqueantes es `MODULO_HEREDA_PERMISO_DE`** (`src/lib/modules.ts`): `role_permissions.contabilidad.modulos` es una lista guardada en la base que el login copia a `fg_modules`, y una key nueva no está ahí — sin la herencia, la persona que carga los saldos (contabilidad: las 52 filas están firmadas por ella) se habría quedado sin ninguna puerta al dato el día del retiro. La herencia se borra del código **cuando la DDL esté corrida y verificada**, no antes.
> - **El candado de nombres parecidos se GENERALIZÓ en vez de desactivarse.** El #463 estrenó "Gastos por Empresa" al lado de "Gastos de Empresa" —una preposición de diferencia, uno debajo del otro en el menú— y su test protegía ese par puntual; retirado el viejo, el par deja de existir. La regla ahora vale para TODO el catálogo: dos labels que **comparten** una palabra que distingue (ignorando "de/por/la/y"…) tienen que diferenciarse en **2+ palabras propias**; sin palabras en común no se comparan ("Gastos" vs "Cheques" no se parecen en nada). Verificado por mutación: "Gastos por Empresa" lo pone rojo, "Ventas" vs "Ventas por Empresa" también, "Gastos" vs "Saldos de Banco" pasa.
> - **Los 3 anchos, en el navegador contra el build de producción y CONTRA `origin/main`** (`BASE=… node scripts/_medir-saldos-banco.mjs`, solo lectura, `RUTA_GASTOS` elige el módulo de gastos vivo): **390 · 834 · 1440 → 0 px de arrastre, 0 blancos táctiles bajo 44 px y 0 textos bajo 12 px** en `/saldos-banco`, `/gastos-contabilidad` y `/vista-general`. Los 9 "recortados" de 390 px son los `truncate` del nombre de empresa y los `<input>` con monto —el mecanismo, no un defecto— medidos **idénticos en main, elemento por elemento y píxel por píxel**.
> - **Editable, verificado SIN escribir en producción:** las 8 filas traen su monto en el input con Guardar habilitado (Joystep sale "sin dato" y su Guardar apagado, porque nunca tuvo saldo cargado); el clic dispara `POST /api/saldos-banco {empresa_key, saldo, fecha_dato}` —interceptado en el navegador, nunca llega a la base— y la ruta REAL contra producción responde `400 "Empresa inválida."` a un payload inválido: está viva, autenticada y validando. Con el retiro aplicado, `/gastos-empresa` responde **404** y el menú de Operación dice exactamente `Gastos` y `Saldos de Banco`.

- **Administración:** Usuarios, Data Health

> Las fichas del home y del sidebar NO llevan subtítulo (auditoría de textos, #278): el campo `subtitle` se eliminó de `AppModule`.
> Páginas de grupo: `/g/[grupo]` con los 3 slugs nuevos. Los slugs viejos redirigen en `next.config.js` (`/g/sistema` → `/g/administracion`; `/g/plata-entra`, `/g/plata-sale`, `/g/productos` → `/home`).

## Guías — máquina de estados
- Estado en `guia_transporte.estado` (TEXT, **sin CHECK constraint** — valores válidos por convención de código).
- Flujo: **Pendiente Bodega** (default al crear) → **Completada** (al despachar; exige receptor, cédula, placa, ≥1 bulto y firmas; queda **bloqueada** para edición) → **Rechazada** (solo desde Completada, con `motivo_rechazo`).

> **EL CLIENTE DE UNA GUÍA VIVE EN LAS LÍNEAS, y atarlo NO es editar la guía (8-ago-2026).**
>
> Una guía sale con VARIOS destinos: la real GT-189 lleva America Clasic, Jerusalem, City Mall Paso Canoa y City Mall David en el mismo viaje. Por eso el cliente es `guia_items.cliente_codigo` (D-XXX), uno por renglón. ⚠️ **`guia_transporte.receptor_nombre` NO es el cliente** — es quien FIRMA el recibido, y son choferes ("Nicolás guillen", "Reynel", "Walter arauz"): de 109 guías con receptor, **0 coinciden** con el nombre de un cliente. Daniel, textual: *"en guía el cliente es a dónde se despachó, no el nombre del transportista"*. Candado en `src/__tests__/api/guias.test.ts`.
>
> **El estado del arte, medido contra producción:** 441 líneas vivas · **441 con el nombre escrito (100%)** · 120 con código (27%). El cliente SÍ se anota siempre, pero **a mano**, y cada quien lo escribe distinto: `"City Mall"` / `"City Mall "` / `"City Mall Paso Canoa"`, `"Jerusalem Panama"` vs `"Jerusalem De Panamá"`.
>
> 🩸 **`PATCH /api/guias/[id]/cliente` existe PORQUE el 98% de las guías están cerradas.** 174 de 177 guías vivas están **Completada**, y el PUT y el PATCH de `/api/guias/[id]` las rechazan con *"Guía ya despachada, no se puede editar"* — un candado que protege el DESPACHO (bultos, facturas, firmas, placa) y que **sigue intacto**. Anotar a qué cliente fue un renglón no es editar el despacho: no cambia el texto que escribió bodega, ni un bulto, ni una firma. Si atar el cliente pasara por el PUT, el 98% de las guías serían inatables para siempre. Por eso el endpoint **toca UNA columna de UNA línea y ni siquiera consulta el estado** — candado en `src/__tests__/api/guias-atar-cliente-route.test.ts`.
>
> **En pantalla:** en el acordeón de `/guias`, cada renglón muestra debajo del nombre o el chip verde `D-XXX` o el enlace *"Atar cliente"*. **Los dos abren la misma ventana** — el chip también es un botón, y eso no es cosmético: sin él, una línea atada al cliente EQUIVOCADO no se podría corregir nunca (y hay una así, ver abajo). El texto escrito a mano **se conserva siempre** como display; solo se guarda el código. Mismo patrón que `mk_proyectos.tienda` + `tienda_codigo` y que `cheques.cliente_codigo`.
>
> **Elegir cliente NO es obligatorio para crear una guía, y es una decisión de Daniel, no del código.** La pantalla la usa bodega todos los días y **272 de las 441 líneas (62%) tienen un destino que hoy NO existe en el directorio** — volverlo obligatorio de un día para otro les traba el trabajo. El selector cerrado (`ClientePicker`, con su opción "Otro") ya hace que elegir de la lista sea el camino cómodo.
>
> ⚠️ **`clientes_master.nombre_normalized` NO es único entre los D-XXX vivos.** El comentario de la migración de jun-2026 afirmaba que un índice UNIQUE parcial lo garantizaba; **es falso**, medido: `"CITY MODA CHORRERA"` → D-30 **y** D-26, `"METRO SHOES PANAMA SA"` → D-103 y D-173, `"EL MACHETAZO SAN MIGUELITO"` → D-171 y D-101. Un `UPDATE … FROM` con dos candidatos elige uno EN SILENCIO y sin determinismo. Cualquier pareo automático por nombre necesita el `NOT EXISTS` que exige **un solo** código vivo.
>
> **LA DIRECCIÓN es lo que desambigua "City Mall", y el chip ahora dice el NOMBRE (9-ago-2026).**
>
> Estado medido: 441 líneas vivas · **169 atadas** · 272 sin atar. Las sin atar estaban concentradas en 4 destinos, y la mitad se resuelve con un dato que la línea ya tenía: **`guia_items.direccion`**.
>
> 🩸 **`D-200 "City Mall"` está borrado y está BIEN borrado: es ambiguo porque hay DOS tiendas.** Las buenas están vivas — `D-24 "City Mall David"` y `D-25 "City Mall Paso Canoa"` — y la dirección las separa sin adivinar nada: `paso canoas`/`pasocanoas`/`paso canoa` → D-25 (62 líneas), `david` → D-24 (27). Los otros tres van por nombre: `Sporting Shoes`/`Sporting Shoes N4` → **D-142** (38), `American`/`America Clasic` → **D-108** (15), `Jerusalem Panama` → **D-80** (8).
>
> **El pareo es EXACTO y normalizado — nada por parecido ni por distancia de edición.** Por eso quedan afuera `Sporting Shoes N7/N8/N9` y `tienda 7/8/9` (son OTRAS tiendas, no la N4) y `american clasicc` con tres c.
>
> 🔴 **`City Mall · Guabito` (GUÍA 36, 15-abr-2026) SÍ se ata a D-25 — Daniel: *"era paso canoas"*— pero como CORRECCIÓN PUNTUAL DE UNA FILA, no como regla.** `guabito` **NO** entra en la tabla de equivalencias, y la diferencia no es cosmética: Guabito es la frontera con Costa Rica y ahí despachan los **duty free** (La Frontera, Outlet Duty Free N2, Jerusalem Duty Free, Wolf Mall). Hay **12 líneas más** con esa dirección que son de esos clientes; como regla general, la próxima que alguien cargue se ataría a City Mall. Por eso vive en su propio paso (`PASO 3B`), acotada por **número de guía**, y la vista previa la muestra aparte de las 99. ⚠️ **La dirección sigue diciendo "Guabito" y se queda así**: esa guía está Completada y firmada, y cambiarle el texto impreso a un documento ya entregado es otra cosa que lo que se aprobó. Con esto City Mall queda **100 de 100**.
>
> ⚠️ **`D-201 "American Classics"` es un DUPLICADO** — no existe en Switch, 0 facturas, 0 CXC — y tenía **13 líneas atadas**: se **remapean a D-108**, el American Classics real del grupo. Es el ÚNICO caso de reescritura. **D-201 NO se borra del maestro**: eso es decisión de Daniel. Y `111380` (Boston) ya no tiene ninguna línea viva: se corrigió desde la pantalla, como decía la nota de arriba.
>
> **Resultado medido:** 150 por reglas + 1 puntual + 13 remapeadas → **320 de 441 (73%)**, 121 sin atar. Las 121 son destinos que hoy no existen en el directorio (City Moda, los duty free de Guabito, las otras Sporting Shoes) y se atan a mano desde `/guias`.
>
> 🔴 **EL TEXTO ESCRITO NO SE TOCA. Solo se escribe `cliente_codigo`.** La guía tiene que seguir imprimiendo `"City Mall | Paso Canoas"` tal cual — Daniel: *"el código es plomería invisible"*. Reemplazarlo por el nombre oficial dejaría `"City Mall Paso Canoa | Paso Canoas"`, la redundancia que él mismo detectó. El backfill va en `supabase/migrations/20260809120000_guias_atar_city_mall_y_remapeo_d201.sql`, **lo corre Daniel A MANO**, y el **PASO 1 es una vista previa que no escribe**: si los conteos no dan, se para ahí.
> - **Las reglas viven en el SQL y NADIE las copia.** `src/lib/guias/reglas-city-mall.ts` las LEE del archivo de migración, así que la verificación contra producción mide la migración que va a correr y no una segunda lista. El mismo módulo exige que la copia del PASO 1 y la del UPDATE sean idénticas — si difirieran, **la vista previa estaría mintiendo**, que es la peor forma de fallar acá.
> - Verificación read-only contra producción, antes de correrla: `DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_verif-migracion-guias-city-mall.ts` (compara los 8 conteos, exige que la **GUÍA 36 quede en D-25** y que los **otros de Guabito NO se toquen** — que es lo que prueba que la corrección puntual no se volvió una regla).
>
> **EL CHIP DICE EL NOMBRE, y el código va de apoyo.** Antes decía `D-108` a secas; Daniel, textual: *"quiero que se llame american classics store en guia porque sino el personal no va a saber"*.
> - **El alias de display vive en UN lugar: `src/lib/clientes/nombre-display.ts`.** D-108 se llama **"Multi Fashion Holding"** en `clientes_master` (la razón social) y bodega no la reconoce. El alias es de DISPLAY: la base no se toca y el sync sigue trayendo el nombre oficial.
> - 🩸 **El alias TAMBIÉN tiene que ser buscable, y eso no es un detalle.** Medido antes del cambio con el matcher real: `"american classics store"` → **0 coincidencias**. Sin agregarlo a los campos de búsqueda, el chip enseñaría un nombre que tecleado en el selector no encuentra nada — **una pantalla que se contradice a sí misma es peor que la que solo mostraba el código**. Por eso `camposDeBusquedaCliente()` vive al lado del alias y la usan **los dos** caminos (`useBusquedaClientes` en el navegador y `/api/clientes` en el servidor): no puede haber dos resultados para la misma consulta.
> - **El buscador ya encontraba "City Mall" y ofrecía las dos** (medido: `"City Mall"`, `"CITY MALL"`, `"citymall"`, `"Cíty Máll"` → D-24 y D-25 siempre). Lo que faltaba era que el chip dijera de quién se trata. `"city"` ofrece las dos City Mall más las City Moda, por coincidencia parcial desde 3 caracteres.
> - ⚠️ **El nombre NO se trunca: baja de línea.** Esconderlo sería deshacer lo que el cambio vino a arreglar. El peor caso REAL —medido sobre los 148 clientes D-XXX vivos— son **47 caracteres**: `"Sistema Nacional De Proteccion Civil (Sinaproc)"` (D-138), no `"City Mall Paso Canoa"`. Y la jerarquía va por **color y tipografía, nunca por tamaño**: en guías nada baja de 12 px (candado `iphone-targets-guias`).
>
> **En una guía Completada la pantalla DICE qué se puede tocar:** `Solo se puede cambiar el cliente`, **una vez en la cabecera** de la guía abierta — no por línea, que en GT-189 lo repetiría cinco veces. Sin eso, un chip tocable sobre una guía cerrada se lee como si el despacho entero fuera editable. **El candado del PUT no se toca** y el endpoint de atar sigue sin mirar el estado.
>
> **Los 3 anchos, medidos en el navegador contra el build de producción y CONTRA `origin/main`** (`BASE=… node scripts/_medir-guias-chip-anchos.mjs`, solo lectura): **390 · 834 · 1440 → 0 px de arrastre de página en los tres, y el scroller de la tabla de ítems da 255 / 83 / 0 px — EXACTAMENTE lo mismo que main**. O sea que meterle el nombre al chip **no ensanchó nada**: crece hacia abajo (62 px de alto con el peor caso de 47 caracteres, texto entero). Los recortes de 16 / 190 / 35 px y el blanco de 39 px son **PRE-EXISTENTES, medidos idénticos en main** (`w-40 truncate` del resumen de la fila colapsada y el `swipeable-row`). Contrato visual: `node scripts/_verif-guias-contrato-visual.mjs`.
>
> Candados: `src/__tests__/lib/guias-city-mall-reglas.test.ts` (el SQL no puede escribir el texto, ni borrar, ni usar LIKE; `guabito` no puede ser regla y la corrección puntual tiene que ir acotada por número de guía), `clientes-nombre-display.test.ts` y `guias-chip-nombre-y-candado.test.ts`. **Verificado por mutación: 22 de 22 cazadas** — meter Guabito como regla, sacarle el `numero = 36` a la corrección puntual, que ésta pise líneas ya atadas o reescriba la dirección, que la vista previa difiera del UPDATE, que un UPDATE pise líneas atadas o toque el texto, parear con LIKE, un `translate` desbalanceado, quitar el alias, volverlo no buscable, truncar el nombre, poner el código adelante, repetir el aviso por línea o mostrárselo a quien no puede atar.

> **LO QUE SE ESCRIBE SOLO Y LO QUE NECESITA OJOS — la pantalla SUGIERE, la migración no adivina (10-ago-2026).**
>
> Punto de partida medido: **441 líneas vivas · 320 atadas (73%) · 121 sin atar en 68 nombres distintos**. Esas 121 son dos cosas que se ven iguales y **se resuelven distinto**, y mezclarlas es el error caro:
>
> **(A) 35 líneas / 12 nombres se escriben solas, porque no hay nada que adivinar.** El nombre escrito ES el del cliente salvo la coletilla jurídica y la puntuación: `GRUPO HANNA` → `Grupo Hanna, S.A.` (D-68), `Wolf Mall Center` → `Wolf Mall Center Int` (D-156), `City Moda Calidonia` → `City Moda / Calidonia` (D-27), y al revés `Dollar Mall S, A` → `Dollar Mall` (D-46). Backfill en `supabase/migrations/20260810120000_guias_atar_nombres_exactos.sql`, **lo corre Daniel A MANO**, aditivo, con **vista previa que no escribe** en el PASO 1. Solo filas con `cliente_codigo IS NULL`. **Resultado: 320 → 355 de 441 (80,5%)**, quedan 86.
> - 🔴 **LA REGLA ES IGUALDAD EXACTA TRAS QUITAR EL SUFIJO LEGAL, Y NO SE TOCA UN SOLO DÍGITO.** `Outlet Duty Free N2` (D-117), `N3` (D-118) y `Sporting Shoes N 4` (D-142) son **TIENDAS DISTINTAS**. Una normalización que borre o ignore los números las vuelve el mismo nombre y mete el despacho de una en la cuenta de otra — sin dejar rastro, porque el texto escrito sigue diciendo "N2", y sin que nadie se entere hasta que el cliente reclame mercancía que nunca pidió. `src/lib/clientes/nombre-normalizado.ts` (módulo PURO) compara los dígitos **sobre el texto crudo**, aparte de las letras, para que un cambio futuro en el quita-sufijos no pueda comérselos en silencio.
> - ⚠️ **La coletilla se quita UNA vez y como PATRÓN COMPLETO, no token por token.** `S` y `A` sueltas son letras normales: quitarlas en bucle desde el final convierte `R.J.A.S.A.` (→ "r j a s a") en **"r j"**, o sea se come la J y la R. Sacando `s a` una sola vez queda "r j a", que es lo que permite reconocer a **RJA**.
> - **Verificación read-only contra producción, antes de correrla:** `DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_verif-migracion-guias-nombres-exactos.ts`. Chequea regla por regla que el destino esté VIVO, que la pareja sea exacta, que los dígitos coincidan y —lo que más importa— que haya **UN SOLO** cliente D-XXX vivo que la cumpla, mirando nombre **y razón social**: `clientes_master.nombre_normalized` NO es único ("City Moda Chorrera" es D-26 **y** D-30). Medido el 9-ago: 12/12 únicos, 35 líneas, 🟢.
> - Las reglas **NO se copian a TypeScript**: `src/lib/guias/reglas-nombres-exactos.ts` las LEE del .sql (mismo mecanismo que `reglas-city-mall`, cuyo `normalizarComoSql` se **reusa** en vez de escribir un segundo normalizador) y exige que la vista previa y el UPDATE sean idénticos — si difirieran, la vista previa estaría mintiendo. La migración **tampoco redefine `fg_norm_guia_texto`**: la exige y para con `RAISE EXCEPTION` si falta.
>
> **(B) 86 líneas / 56 nombres NO se adivinan: la pantalla SUGIERE y una persona confirma.** Son tipeos (`Hanna Calzado` por `Hanna Calzados`, `Jerusalem Dutty Free`, `American Clasicc` con tres c, `Sporsam` por `Sportsam`) y tiendas que no existen en el directorio. Al abrir "Atar cliente" de una línea sin código, arriba del selector aparece **"¿Quisiste decir…?"** con hasta 3 candidatos. Motor PURO: `src/lib/clientes/sugerencias.ts`; UI: `src/app/guias/components/SugerenciasCliente.tsx`.
> - 🔴 **LA SUGERENCIA NUNCA ATA SOLA. NI CON UN ÚNICO CANDIDATO CLAVADO.** Tocarla solo la copia al selector; se escribe recién al apretar **Guardar**. `Sporting Shoes N7` y `Sporting Shoes N 4` comparten TODAS las palabras y son tiendas distintas: un auto-atado "cuando el parecido es altísimo" habría metido el despacho en el negocio equivocado. La función devuelve una LISTA y no expone ningún `elegido`/`auto` del que un consumidor pueda deducir una decisión.
> - 🔴 **Una diferencia de NÚMERO se ve, no se esconde.** Cada candidato lleva su aviso — *"los números no son los mismos"*, *"uno lleva número y el otro no"*, *"los nombres no son iguales del todo"* — y además **pesa en el orden**. Medido con el texto real `Outle Dutty Free # 3`: por letras, `Outlet Duty Free` (sin número, D-119) puntuaba **0,93** y el correcto `…N3` (D-118) **0,90**, así que la lista arrancaba con el equivocado. El número penaliza el orden ×0,8 (distinto) / ×0,9 (falta), pero **no saca a nadie de la lista**: eso sería decidir por la persona.
> - 🔴 **Cuando no hay nada parecido, la pantalla LO DICE**: *"No hay ningún cliente parecido en el directorio — hay que darlo de alta en Switch"*. Sin eso alguien se queda buscando algo que no está. Medido: **7 nombres / 10 líneas** están así (`ALMACEN JORDANIA` 4, `Almacen Amin`, `Almacen Lutty Lui`, `Business display`, `DUCASA`, `HOTEL GRAN DAVID`, `Punto Maravilloso`).
> - 🩸 **Sin directorio, la ventana se CALLA.** `useClientesDelGrupo` devuelve `[]` mientras no lo haya leído COMPLETO (incluido el caso `completo:false`, la lista recortada), y con `[]` no se dibuja ni el "¿quisiste decir?" ni el aviso. Decir "no hay ninguno" sin haber podido mirar mandaría a dar de alta en Switch un cliente que ya existe. Reusa el **MISMO caché de módulo** que el selector y `useNombresDeClientes`: abrir la ventana no dispara ni una lectura extra.
> - **Cómo decide que algo se parece:** cuatro puertas (basta una) y después un puntaje. (a) comparten una palabra **idéntica** de 4+ letras · (b) una casi idéntica de 6+ (`sporsam`≈`sportsam`) · (c) las letras pegadas son las mismas (`LUTY LUI` ≡ `Lutylui`, `Rja` ≡ `R.J.A.S.A.`) · (d) el texto escrito ES el código (`d-35` → D-35). Esa puerta es la que deja afuera a lo que no existe sin necesidad de umbrales finos. **También se compara contra la RAZÓN SOCIAL**, y no es un lujo: `City Moda Chorrera` factura como *"Inversiones Z15, S.A."*, así que sin ella `City Moda Inversiones Z15` no encontraría a su cliente, que SÍ está. Cuando pega por ahí, la tarjeta lo dice (*"factura como …"*) — si no, la sugerencia parecería sacada de la nada.
> - 🩸 **D-201 NO se sugiere** (`CODIGOS_QUE_NO_SE_SUGIEREN`). Es el duplicado sin respaldo en Switch del que la migración de #444 sacó 13 líneas: por parecido a secas, `American Clasicc` pegaba **mejor** contra el duplicado (0,94) que contra el bueno D-108 (0,83), o sea que la pantalla habría recomendado, primero en la lista, deshacer lo que se acababa de arreglar. **No se lo saca del directorio ni del selector** — quien lo busque a propósito lo encuentra; borrarlo del maestro es decisión de Daniel. Se le quita solo la RECOMENDACIÓN.
> - **Cobertura medida contra producción** (`DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-sugerencias-guias.ts`, solo lectura, corre el motor REAL contra el directorio REAL): **61 de los 68 nombres (111 de 121 líneas) reciben al menos un candidato**.
> - ⚠️ **Hallazgos que contradicen el punto de partida y que Daniel tiene que decidir** (no se atan solos): `King Sport` (5 líneas) → **D-86 "Kings Sport"**, `Rja` (5) → **D-131 "R.J.A.S.A."**, `Xtreme Shos` → D-159, `LUTY LUI` → D-98, `BOUTI SHOPPING CENTER` → D-14. **Sí existen en el directorio.** Y hay 3 parejas EXACTAS más que quedaron fuera del grupo A porque no estaban en la lista aprobada: `Boutique Chez moi` → D-20, `COMERCIAL LA NUEVA REINA` → D-88, `Rja` → D-131 (las tres pegan por razón social).
>
> **Los 3 anchos, medidos en el navegador contra el build de producción y con datos de producción** (`BASE=… node scripts/_medir-guias-sugerencias-anchos.mjs`, solo lectura), en los DOS estados —con sugerencias (`GRUPO HANNA` → D-68) y sin parecidos (`DUCASA`)—: **390 · 834 · 1440 → 0 px de arrastre de página, 0 recortados, 0 blancos táctiles bajo 44 px y 0 textos bajo 12 px, en los seis casos.** Y **CONTRA `origin/main`, la misma ventana y la misma línea: 0 / 0 / 0 / 0 también** — o sea que el bloque nuevo **no ensanchó nada**: la ventana pasa de **344 px de alto a 470** (con sugerencias) o **447** (sin parecidos) y sigue entrando entera en los tres anchos. Crece hacia abajo, que es lo único que un modal puede regalar. (El `sr-only` de `ClientePicker` mide 1 px de ancho a propósito y se excluye del conteo: contarlo sería ruido.)
>
> Candados: `src/__tests__/lib/guias-reglas-nombres-exactos.test.ts` (18), `clientes-sugerencias.test.ts` (45, todos con TEXTOS REALES de `guia_items` contra CLIENTES REALES) y **`src/__tests__/components/guias-sugerencias-cliente.test.tsx` (11), que RENDERIZA la ventana y toca los botones** — el riesgo de verdad no es la matemática sino que la sugerencia se convierta en un atado, y eso un test de función pura no lo puede ver. **Verificado por mutación: 6 de 6 cazadas** — borrar los dígitos al normalizar (3 tests), cruzar `N2 → D-118` (2), que la vista previa difiera del UPDATE (el archivo entero se pone rojo), dejar de excluir D-201 (3), sacarle al número su peso en el orden (1) y hacer que tocar una sugerencia guarde (3).

> 🔴 **UNA línea atada a `111380`, que no es del grupo** (GT-183, "American Classic Store"). Se coló por el backfill de jun-2026 (`20260607131000`), que filtraba `cm.codigo IS NOT NULL` en vez de `LIKE 'D-%'` — y Boston/Multifashion usan códigos numéricos pelados. **No se corrigió automáticamente porque no es inequívoco** si va a NULL o a un D-XXX ("American Classic Store" de Boston vs "American Classics" D-201 del grupo no son obviamente el mismo negocio). Se arregla desde la pantalla: `/guias` → GT-183 → tocar el chip `111380` → elegir o "Quitar".

> **DESPACHAR ES UNA PANTALLA, NO UN ACORDEÓN — y el N° del transportista es POR LÍNEA (10-ago-2026).**
>
> 🩸 **Había DOS caminos para lo mismo dentro de la misma tarjeta.** Al abrir una guía pendiente en `/guias` aparecía un botón "Editar" arriba **y**, más abajo, el formulario de despacho ENTERO desplegado (placa, N° de guía, receptor, cédula, dos canvas de firma y "Confirmar despacho"). Daniel lo vio en **ESCRITORIO** —o sea que nunca fue un problema de pantalla chica— y fue textual: *"mira como me sale editar al hacer clic en por despachar y esta ya aparece el campo para editar, confunde, solo quiero una y en boton de editar para entrar a la guia y terminarla"*. Y sobre el gesto: *"al hacer slide a la izquierda de una guia no despachada da la opcion de despachar, no quiero eso asi"*.
>
> **Ahora:** la lista solo MUESTRA (los envíos, el chip del cliente, "Imprimir" y el menú "···" siguen igual), **un solo botón "Editar"** lleva a **`/guias/[id]`**, y ahí se corrige y se despacha. Desde esa página se sigue llegando a `/guias/[id]/editar` para cambiar los renglones — el camino viejo no se perdió. **Las guías DESPACHADAS no cambiaron en la lista**: Daniel dijo *"me gusta como esta actualmente las de despachados"*.
> - **`SwipeableRow` NO se borró**: `cheques` lo usa para "depositar" y ahí el gesto se queda. Lo que se quitó es la acción `despachoSwipeAction` de guías, que era su único uso en el módulo.
> - **El estado del despacho se MUDÓ de hook.** `useGuiasState` (la lista) perdió placa/receptor/cédula/chofer/firmas/`confirmarDespacho`; viven en `useDespachoGuia` (`/guias/[id]`). Dejarlos en una pantalla que ya no despacha era la mitad del problema de vuelta. El borrador en `localStorage` por guía se conserva, ahora con los N° por línea adentro.
>
> 🔴 **EL N° DE GUÍA DEL TRANSPORTISTA ES POR LÍNEA.** Daniel: *"la info de guia de transp, debe de ser por linea, no por guia porque nos hacen varias guias el transportista por guia"*. La columna `guia_items.numero_guia_transp` **ya existía** (~470 filas pobladas) — **no hace falta ninguna DDL**. Lo que faltaba era pedirla renglón por renglón y, sobre todo, IMPRIMIRLA: los dos papeles (`PrintDocument` y `pdf-guia`) tenían la columna "N GUIA TRANSP." pero pintaban **`g.numero_guia_transp` (el de la cabecera) en TODAS las filas**, así que aunque la línea tuviera el suyo, el papel mostraba el mismo en todas.
> - **Se guarda con `items_guia_transp`, NUNCA mandando `items`.** `items` en el PUT es un **reemplazo completo** (borra e inserta): usarlo en pleno despacho le cambiaría el id a cada línea y tiraría el trabajo de atar clientes. El campo nuevo toca UNA columna, con `.eq("guia_id", id)` — sin eso, el id de cualquier línea del sistema serviría para escribirle encima.
> - **`guia_transporte.numero_guia_transp` NO se retira**: la usan el buscador de la lista, el Excel y el encabezado del papel. Se llena con el **primer** número de línea que haya (`numeroGuiaDeCabecera`).
> - **Una guía VIEJA sale igual que siempre**: si la línea no trae número propio, hereda el de la cabecera (`numeroTranspDeLinea`).
> - **El encabezado del papel solo anuncia un número cuando hay UNO SOLO en toda la guía** (`numeroTranspUnico`). Con varios distintos, poner uno arriba sería una mentira impresa en un documento que alguien firma.
>
> **EL BOTÓN SE APAGA Y DICE QUÉ FALTA.** Antes se podía tocar siempre y contestaba con un toast por vez que se iba solo a los 3 segundos; faltando tres cosas había que tocar tres veces. Ahora `Despachar` va deshabilitado y justo debajo: *"Falta: placa, recibido por y cédula"*. Las reglas viven en el módulo PURO `src/lib/guias/falta-para-despachar.ts`, **las mismas que aplica el servidor** — si difirieran, el botón se pondría verde y el PUT rechazaría igual, que es peor que el botón apagado. ⚠️ **La placa sigue sin ser obligatoria en entrega directa** (ver `guias-placa-entrega-directa.test.ts`) y **una línea sin número no traba el despacho**: lo que el servidor exige es que **al menos una** lo traiga.
>
> **Verificado con una guía de prueba REAL (creada y borrada el 10-ago-2026):** GT-192 con dos líneas, `TR-4471` y `TR-9999`. En la base quedaron distintas (cabecera `TR-4471`), y **los DOS papeles imprimen el de cada línea**: el PDF de compartir (`scripts/_verif-guia-transp-por-linea.ts` + `pdftotext`) y el impreso HTML (`/guias/[id]/imprimir` a PDF). En los dos, el encabezado **omite** "N GUIA TRANSP.:" porque los números difieren. Las dos guías de prueba se borraron (soft delete) y la lista volvió a 177.
>
> **Los 3 anchos, medidos en el navegador contra el build de producción y CONTRA `origin/main`** (`BASE=… GUIA_PENDIENTE=… GUIA_DESPACHADA=… node scripts/_medir-guias-rediseno.mjs`, solo lectura): **390 · 834 · 1440 → 0 px de arrastre de página en las tres pantallas** (lista, lista abierta, página de la guía pendiente y despachada), **0 blancos táctiles bajo 44 px y 0 textos bajo 12 px en la página de la guía**. Y el rediseño **redujo** los recortes que ya había: la lista a 390 pasó de **7 a 1** recortado y la lista abierta de **19 a 1**; a 834, de 21/33 a 15/15 y el peor recorte de **340 px a 190**. Lo que queda es PRE-EXISTENTE y medido idéntico en main: los `truncate` del resumen de la fila (puntos suspensivos = el mecanismo, no un defecto), el input de búsqueda de 39 px de alto en escritorio/iPad y los 8 px del `-mx-2` de los botones de `SignatureCanvas` (9 veces en main, 3 en la página nueva — es el mismo componente, sin tocar).
>
> Candados: `src/__tests__/lib/guias-despacho-una-sola-puerta.test.ts` (la lista no puede volver a despachar ni por swipe ni por formulario, el hook de la lista no puede recuperar estado de despacho, el papel tiene que imprimir el de cada línea, y el "Falta:" del mockup aprobado) y `guias-placa-entrega-directa.test.ts`, que pasó a probar las reglas sobre el módulo puro en vez de sobre los `if` del formulario.

> ## 🔴 ENTREGA DIRECTA NO LLEVA PLACA NI TRANSPORTISTA — y `tipo_despacho` NO dice cómo sale una guía (14-ago-2026)
>
> Daniel, textual: *«Entrega directa no debería de llevar placa, ya que es directo con nuestro propio camión.»*
>
> 🩸 **EL BUG, Y POR QUÉ UN `??` NO LO ARREGLABA.** `useDespachoGuia` arrancaba con `(g.tipo_despacho as TipoDespacho) || "externo"` y **nunca miraba `modo_entrega`**, que es lo que la persona ya eligió al crear la guía. La trampa: **`guia_transporte.tipo_despacho` tiene DEFAULT `'externo'` en la base**, así que esa rama de respaldo es **inalcanzable** — medido el 14-ago-2026, las **186 guías vivas** traen la columna con valor, incluida la única PENDIENTE (GT-201, sin placa ni chofer). Un `g.tipo_despacho ?? derivado` habría sido un no-op perfecto.
>
> **El daño, medido:** de **51 guías creadas como entrega directa, 50 quedaron grabadas como transportista externo** (la única bien es GT-186). Y seguía pasando: **GT-194, GT-195 y GT-196 (11-ago)** tienen `placa = "0"` y `numero_guia_transp = "0"` —alguien tecleó ceros para poder apretar el botón— y son **las únicas tres placas "0" de toda la base**. El papel firmado salía diciendo `TIPO: Transportista externo · PLACA: 0 · N GUIA TRANSP.: 0`.
>
> ### 🔴 LA REGLA, y las dos mitades importan (`src/lib/guias/modo-despacho.ts`, módulo PURO)
>
> - **Guía SIN despachar → manda `modo_entrega`**, que es lo único que alguien decidió a propósito.
> - **Guía YA despachada (Completada/Rechazada) → manda `tipo_despacho`**, que es lo que realmente pasó y quedó firmado.
>
> ⚠️ **La segunda mitad es la que evita una mentira NUEVA.** Con el botón "Cambiar", alguien puede crear una guía como entrega directa y despacharla con el camión de un tercero. Si `modo_entrega` ganara siempre, ESA guía saldría impresa como "Entrega directa" con una placa ajena al lado: se cambiaría un papel que miente por otro que miente distinto. Hay candado en las dos direcciones.
>
> ### Qué cambió en pantalla
>
> - **El modo arranca en lo que se eligió al crear la guía**, y **no se vuelve a preguntar: se MUESTRA, con un "Cambiar" al lado.** Preguntarlo de nuevo con "Transportista externo" preseleccionado es lo que produjo las 50 guías mal grabadas.
> - **En entrega directa NO se piden placa ni N° de guía del transportista.** No son "opcionales": no existe un transportista. **Se esconden.** Cuando eran opcionales pero visibles, alguien tecleó "0" en los dos.
> - **Y tampoco se ESCRIBEN**: el despacho manda `placa: ""`, `numero_guia_transp: ""` y limpia el número de cada línea. **Se mandan vacíos a propósito, no se omiten** — omitirlos dejaría pegada la placa de un tercero si alguien empezó en modo externo y después tocó "Cambiar".
> - **Las MISMAS palabras en las dos pantallas.** Al crear decía "Transportista" y al despachar "Transportista externo". Fuente única: `ETIQUETA_TIPO_DESPACHO`. Gana "Transportista externo" porque ya es lo que dicen el papel, el PDF, la lista y la ficha — y "externo" es justo lo que lo distingue de nuestro camión.
> - **Los DOS papeles dicen la verdad**: `PrintDocument.tsx` y `pdf-guia.ts` derivan el modo del mismo módulo, y en entrega directa no imprimen PLACA, ni el N° de la cabecera, ni la columna "N GUIA TRANSP." de la tabla.
> - 🔴 **Un "0" pelado se trata como vacío EN EL PAPEL** (`sinCeroPelado`). No toca la base: ninguna placa de Panamá es "0", e imprimirlo en un documento que alguien firma es afirmar algo falso. **Nada que CONTENGA un 0 se pierde** (`EK0700`, `TR-0`, `00` quedan intactos) — hay candado.
>
> ⚠️ **LAS 50 GUÍAS YA GRABADAS MAL NO SE TOCAN.** Son Completada con `tipo_despacho='externo'` y su papel las sigue mostrando así: reinterpretarlas es otra decisión de Daniel. Lo único que se limpia en su papel es el "0".
>
> ### 🔴 La dirección del cliente, como PRIMERA OPCIÓN
>
> Daniel, textual: *«Ponerla sola, pero sí como primera opción.»* — **aparece arriba de todo en la lista de sugerencias; NO se escribe sola en el campo**, y el campo sigue editable. `src/lib/guias/direccion-sugerida.ts` devuelve una LISTA y no expone ningún "elegido" del que alguien pueda deducir un auto-completado.
>
> **Medido contra producción (491 envíos vivos, 200 guías desde el 25-mar):** 380 envíos atados a un cliente del directorio · **47 clientes atados, 37 con UNA SOLA dirección** en toda su historia · *"la anterior acierta"* **267/333 = 80,2%** · 78 direcciones distintas (Paso Canoas 192 · David 98 · Santiago 26 · Changinola 21 · Guabito 11).
>
> ⚠️ **ESTO NO APLICA A LA EMPRESA, y está medido con el mismo método: acierta 114/333 = 34,2%.** Autocompletarla metería el dato equivocado en dos de cada tres envíos. La empresa es POR ENVÍO. Hay candado que impide que la ruta empiece a devolverla.
> - **Solo por `cliente_codigo`**, no por nombre a mano: por nombre normalizado el acierto baja a 67,2%.
> - **"Última" es cronológica**, y `guia_items` no tiene fecha propia: se ordena por la `fecha` de la GUÍA y se desempata por `numero` (correlativo). Ordenar por `id` sería ordenar por un uuid.
> - Viaja en `/api/guias/frecuencias` (campo `direcciones`), **sin consulta nueva de ítems**: se le agregaron columnas a la lectura que ya existía, más una lectura de ~200 guías para tener la fecha.
>
> ### El botón de la fila dice «Despachar»
>
> **185 de las 186 guías terminaron despachadas.** Despachar es *la* acción del día para bodega; editar es el camino secundario y vive un nivel más adentro ("Cambiar los envíos de esta guía"). En "Pendiente Bodega" el botón dice **Despachar** con un camión; en los demás estados sigue diciendo **Editar** con el lápiz. ⚠️ **Sigue siendo UN SOLO botón** (un solo `onEdit`): lo que Daniel pidió sacar era tener "Despachar" Y "Editar" uno al lado del otro, y eso no se aflojó.
>
>
> ### 🔴 LA MEMORIA DE LA GUÍA: los juegos MÁS FRECUENTES de este transportista
>
> Daniel: *«Si quiero»* a recordar placa y cédula por transportista, y después precisando cómo: *«normalmente mandamos con las mismas 3/4 compañías. Y los que varían a veces son los choferes. **Que tenga memoria guía para mostrar los más frecuentes.**»*
>
> Al despachar con transportista externo se ofrecen **los 3 juegos más usados** (recibido por + cédula + placa) **con ESE transportista**; **un toque llena los tres** y quedan editables.
>
> 🔴 **LOS MÁS FRECUENTES, NO LOS ÚLTIMOS — y no es un matiz.** Medido sobre las 185 guías despachadas de producción (14-ago-2026), ordenar por frecuencia da un resultado **DISTINTO** que ordenar por fecha **en los 6 transportistas**. El caso más claro es Boston: el juego que se usó **10 veces** (`Eric · 8-930 · Ek0700`) **no** es el de la guía más reciente. En Transporte Sol, `Nicolás guillen · 172744 · 961885` se repite **7 de 12 veces**.
>
> 🩸 **NORMALIZAR PARA AGRUPAR ES LA MITAD DEL VALOR: sin eso, el más usado aparece PARTIDO y ninguno llega arriba.** Medido:
> - un mismo juego de RedNblue está escrito de **4 formas**: `Jocsan murillo · 8918246 · DG7115` + `Jocsan murillo · 8-918-246 · DG7115` + `Jocsan · 8-918-246 · DG7115` + **`Jocnsa · 8918246 · Dg7115`** (un tipeo)
> - uno de Sanjur, también de 4: `Elaeric Sanjur` / `Adrián sanjur` / `Adrian sanjur` / `Elaeric sanjur`, los cuatro con cédula `9-764-2287`
> - `Nicolás guillen · 172744 · 961885` ×3 + `… · 1-727-44 · 961885` ×3 + `Nicolas · 172744 · 961885` ×1 → es **UN juego de 7**, no tres de 3/3/1
> - las cédulas: **72 valores crudos → 52** agrupados · los receptores 69 → 59 · las placas 56 → 47 (`DG7115`+`Dg7115`, `EL6433`+`El6433`, `Ek7003`+`EK7003`…)
>
> 🔑 **LA IDENTIDAD DE UN JUEGO ES LA CÉDULA + LA PLACA, NO EL NOMBRE.** `Jocsan murillo`, `Jocsan` y `Jocnsa` son la misma persona, y **ninguna** normalización de mayúsculas/tildes/guiones los junta: son textos distintos. Lo que sí los junta es el documento de identidad.
>
> ⚠️ **SE MUESTRA LA FORMA MÁS USADA, Y ES UN VALOR ORIGINAL.** De las formas del juego se ofrece la que más veces se escribió (desempata la más reciente): en Boston gana `Eric` (10) sobre `Erick` (1). **Nunca se ofrece el valor normalizado** — inventar `JOCSAN MURILLO` estrenaría una forma MÁS de escribir lo mismo, que es justo lo que esto vino a evitar. El botón dice cuántas veces (`· 10 veces`), y con una sola no dice nada.
>
> - Solo de guías **ya despachadas** y solo juegos **completos** (el valor es llenar los tres de un toque). **En entrega directa no aparece** — no hay transportista ni placa.
> - `GET /api/guias/despachos-frecuentes?transportista=<uuid>`, acotada en el servidor y **fail-ABIERTA**: si falla, los campos se escriben a mano como siempre. 🔴 **Se trae TODA la historia del transportista, no una ventana**: contar frecuencias sobre las N más recientes daría un "más usado" que depende de dónde se corte — o sea ordenar por fecha disfrazado. El más cargado tiene 47 guías.
>
> ⚠️ **LO QUE ESTO NO ARREGLA, Y NO DEBE INTENTAR:** en la columna de texto vieja conviven **`Boston` ×19 y `C. BOSTON` ×9** — la misma empresa escrita de dos formas. La normalización **no** los junta (`BOSTON` ≠ `C. BOSTON`) y está bien que no lo haga: juntarlos pide adivinar por prefijo, que es lo que este repo tiene prohibido con nombres (la lección de `Outlet Duty Free N2` vs `N3`). Además no afecta a esto: los juegos se agrupan por `transportista_id` —el catálogo tiene **6 filas**— y no por ese texto. **Es un arreglo de datos en Switch, y es decisión de Daniel.**
>
> 🩸 **REGISTRO DE UN ERROR MÍO, para que nadie lo lea al revés en el historial de git.** Esta funcionalidad se construyó (#554), se **revirtió por error** (#555) y se restauró (#556). El revert estuvo MAL: al releer el encargo original —que decía *"Daniel dijo NO explícito"*— concluí que la había construido sin permiso y que había inventado las estadísticas, y lo escribí así en el commit y en el PR. **Las dos cosas eran falsas**: Daniel había cambiado de opinión en un mensaje posterior (*«Si quiero»*) y los datos me los habían pasado medidos. **La lección no es "no auditarse": es que una confesión falsa cuesta lo mismo que un dato falso.** Antes de escribir "inventé esto" y borrar código aprobado, hay que correr la consulta y comprobarlo — acá era UNA consulta, y es la que produjo todos los números de arriba.
>
> **Candados:** `guias-juegos-despacho.test.ts` (30, **todos los fixtures son valores REALES de producción**, con las 4 formas de RedNblue y el caso de Boston donde frecuencia ≠ fecha) y `components/guias-direccion-y-juegos.test.tsx`, que **pinta la pantalla** y verifica que el más usado quede primero. Diagnóstico read-only: `DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-guias-juegos-frecuencia.ts`.
> ### Medición y candados
>
> **Los 3 anchos (+ el iPad acostado), en el navegador contra el build de producción y con datos de producción** (`BASE=… GUIA_PENDIENTE=… node scripts/_medir-guias-entrega-directa.mjs`, solo lectura, **nunca toca "Despachar"**): **390 · 834 · 1024 · 1440 → 0 px de arrastre de página y 0 textos bajo 12 px** en los 20 casos (lista con la pendiente abierta · guía con transportista · la misma cambiada a entrega directa · los renglones con el cliente atado · guía nueva). Los recortes y los blancos táctiles que quedan son **PRE-EXISTENTES**: los 8 px del `-mx-2` de `SignatureCanvas`, el `w-40 truncate` del resumen de la fila, el input de búsqueda de 39 px y los campos densos de `pointer:fine` en escritorio. El script **falla** si no encuentra el botón "Despachar", el bloque de los juegos más usados, la explicación de la entrega directa o la dirección sugerida primera.
> - 🩸 **Gotcha de medición, y daba verde sin haber mirado nada:** el encabezado del bloque de juegos lleva `uppercase` **por CSS**, así que `innerText` lo devuelve en MAYÚSCULAS y compararlo tal cual daba SIEMPRE `false` — o sea que el chequeo de "los juegos NO aparecen en entrega directa" habría pasado con el bloque a la vista.
>
> **Candados:** `guias-modo-despacho.test.ts` (17 + el PDF **generado de verdad** y leído), `guias-direccion-sugerida.test.ts`, `guias-juegos-despacho.test.ts`, **`guias-frecuencias-ruta.test.ts`** (llama al handler REAL) y **dos de CONDUCTA que PINTAN la pantalla**: `components/guias-entrega-directa.test.tsx` y `components/guias-direccion-y-juegos.test.tsx`.
> - 🩸 **Dos candados de texto pasaban en verde con la mutación puesta, y los dos por lo de siempre: leían sus propios comentarios.** El barrido de `guia-pdf-compartir` veía `g.tipo_despacho` dentro de la nota que documenta que el papel DEJÓ de mirarlo, y exigía al PDF dibujar un campo que ninguno de los dos dibuja ya. Y sacarle la placa al PDF, o sacar `direcciones` del `return` de la ruta, **no ponía rojo NADA**. Por eso los barridos borran los comentarios primero, el PDF se genera y se lee, y la ruta se ejecuta.
> - **Verificado por mutación, 29 de 29 cazadas** (`bash scripts/_mutar-candados-guias.sh`): el modo vuelve a salir de `tipo_despacho` · `modo_entrega` gana siempre y le pisa la historia a una despachada · sin `modo_entrega` inventa una directa · el "0" vuelve a imprimirse · `sinCeroPelado` se come cualquier cosa con un 0 · la hoja y el PDF vuelven a imprimir PLACA en directa · el PDF se separa del papel · vuelve a pedir placa o N° de transportista en directa · vuelve a PREGUNTAR el modo · el despacho vuelve a mandar la placa · el alta vuelve a decir "Transportista" · el botón vuelve a decir "Editar" con la guía pendiente · la dirección deja de ir primera · la sugerencia se ESCRIBE SOLA · la última dirección sale de la guía más vieja · la ruta deja de mandar las direcciones · la identidad del juego vuelve a ser el nombre · los juegos dejan de normalizar guiones y mayúsculas · se ordenan por fecha en vez de por frecuencia · se ofrece la forma menos usada · entran juegos de guías que no salieron · entran juegos incompletos · se guarda el valor normalizado · los juegos aparecen en entrega directa · la ruta deja de acotar por transportista · la ruta cuenta sobre una ventana de las N más recientes.
>
> **Diagnóstico read-only contra producción:** `DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-guias-entrega-directa.ts`.

> ## 🔴 LAS OBSERVACIONES SE LEEN DONDE SE CARGA EL CAMIÓN (14-ago-2026)
>
> La observación se escribe al crear la guía y **no aparecía en `/guias/[id]`, la pantalla donde se despacha**: vivía solo en el acordeón de la lista y en el papel impreso, así que quien carga el camión tenía que volver a la lista y abrir la guía ahí para leerla. **El dato ya viajaba a esa pantalla — solo no se dibujaba** (`GET /api/guias/[id]` hace `select("*")`).
>
> **Va pegada a los envíos y ARRIBA de los campos que se llenan al despachar** (placa, recibido por, cédula): se lee antes de trabajar, no después. Hay candado de posición en las dos direcciones.
>
> **El nombre es «Observaciones».** Daniel, textual: *«Nota de entrega sí cambia a observaciones»* — 🩸 se lo habían mockeado como «Nota de entrega» y **corrigió**: no es un campo de dirección.
>
> ### 🔑 EL DISEÑO SALIÓ DE MEDIR EL CAMPO, NO DE SUPONERLO
>
> Medido contra producción el 14-ago-2026 (`scripts/_diag-guias-observaciones.ts`, solo lectura) sobre las **186 guías vivas**:
> - **36 notas de trabajo reales** · **96 guías sin nada** · **54 con el texto administrativo** *"Cerrada en bloque el 3-ago-2026…"*
> - **mediana 32 caracteres · la más larga 83** (GT-137) · **máximo 2 líneas**, y una sola nota tiene salto de línea
> - o sea: **es texto CORTO y variado, no un párrafo.** Se lee de un vistazo y **no se trunca** (`whitespace-pre-wrap break-words`, sin `truncate` ni `line-clamp`). Hay candado que lee las clases del DOM.
>
> **Qué dicen de verdad** — el campo está haciendo **tres trabajos**: qué va adentro del bulto (`"Keriddine son muebles"`, `"1 TANQUE DE PINTURA PARA AMERICAN CLASSICS"`, `"NOVA LUX 17 PANELES - PLAZA LOS ANGELES 3 MUEBLES DE CALVIN KLEIN"`), dónde entregar (`"TIENDA 9 ALBROK MALL PASILLO DEL DELFIN"`, `"Pasillo del dinosaurio"`) y **quién retira** (`"RETIRO EN BODEGA POR PARTE DEL CLIENTE."`, `"EL CLIENTE RETIRA EN BODEGA"`, 2 guías).
>
> 🔑 **HALLAZGO PARA DANIEL, NO CONSTRUIDO: ese tercer uso es un MODO DE ENTREGA que no tiene campo propio** y por eso se escribe en la nota. Hoy esas dos guías salen con un transportista que no existe. **Es decisión de negocio** — no se construyó nada.
>
> ### Lo que NO hace
>
> - ⚠️ **Si la guía no tiene observación, NO se dibuja nada.** Nada de una caja vacía diciendo "sin observaciones": son **96 de 186**. Texto de solo espacios cuenta como vacío.
> - ⚠️ **Es de SOLO LECTURA acá.** La observación se edita donde se editaba; esta pantalla la muestra, no la cambia. Candado: dentro de la caja no puede haber `input`, `textarea` ni `button`.
> - ⚠️ **Se muestra TAL CUAL está guardada.** Hay basura en el campo (**GT-124 = `"|"`**, **GT-001 = `"S1373259"`**) y **no se filtra ni se "limpia"**: limpiar datos es decisión de Daniel. Hay candado — un `replace` que se coma la basura pone el build rojo.
> - **También se ve en una guía YA despachada**, que es donde viven las 36 notas reales (las 36 son de guías `Completada`).
>
> ### Medición y candados
>
> **Los 3 anchos (+ el iPad acostado), en el navegador contra el build de producción y con guías REALES** (`BASE=… node scripts/_medir-guias-observaciones.mjs`, solo lectura, **nunca toca "Despachar"**): **390 · 834 · 1024 · 1440 → 0 px de arrastre, 0 recortados, 0 blancos táctiles bajo 44 px y 0 textos bajo 12 px** en los **20 casos** (GT-137 la más larga · GT-188 Nova Lux · GT-194 corta · GT-124 la basura · GT-201 sin nota). La caja **crece hacia abajo**: 98 px de alto a 390 con la nota más larga (2 líneas) y 77 px cuando entra en una. Los 3 recortes de GT-201 son los 8 px del `-mx-2` de `SignatureCanvas`, **PRE-EXISTENTES** (solo salen ahí porque es la única guía pendiente, o sea la única que dibuja las firmas). El script **falla** si la caja no aparece donde debe, si el texto no coincide carácter por carácter, si sale cortado, si es editable, o si aparece en la guía sin observación.
> - 🩸 **Gotcha de medición, el de siempre:** el rótulo lleva `uppercase` **por CSS**, así que `innerText` lo devuelve en MAYÚSCULAS y compararlo tal cual da SIEMPRE `false` — el chequeo pasaría en verde sin haber mirado nada.
>
> **Candado: `src/__tests__/components/guias-observaciones-despacho.test.tsx` (16).** **RENDERIZA la página real y lee el DOM** — un barrido de texto sobre el archivo se cumple con su propio comentario, que en este repo ya falló cuatro veces. Los fixtures son las notas REALES de producción.
> - **Verificado por mutación, 6 de 6 cazadas** (dentro de `bash scripts/_mutar-candados-guias.sh`, que sube a **35 de 35**): la observación deja de dibujarse · se dibuja la caja aunque no haya observación · el texto se trunca a una línea · vuelve el rótulo «Nota de entrega» · la pantalla filtra la basura · la observación se vuelve editable acá.
>
> **Diagnóstico read-only contra producción:** `DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-guias-observaciones.ts`.

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

> **Switch manda cifras IMPOSIBLES, y ahora hay UN guard que las frena en las 8 tablas de plata (30-jul-2026, aprobado por Daniel).** El 27-jul la certificación encontró en `switch_costo_diario` la fila `confecciones_boston · 2026-07-14 · costo_total = $1.000.000.049,22` contra una venta de $493,00, y el propio reporte de Switch salía corrupto por ella (Utilidad −$999.861.591,01, margen −228.547,91%). **No fue un tecleo de nadie: vino de la fuente** — se pidió `/apireporte/totalventas?tipo=03` en vivo y Switch devuelve ese número. Daniel lo dijo textual: *no es "protegerse de gente inepta"*, por eso lo aprobó. El mismo día `/apiingresomercancia/lista` de `active_shoes` devolvió un documento con `subTotal 4.460.999.999.999,55`. El #340 tapó UNA tabla; este PR tapa el resto.
>
> **Fuente ÚNICA, no seis copias:** `src/lib/switch-api/monto-guard.ts` (PURO — registro, umbral, simetría, anti-envenenamiento, anti-loop) + `monto-guard-io.ts` (calibración contra la base y el aviso). El guard de costo diario **se mudó ahí**: `costo-guard.ts` ya no tiene su copia, solo `esCostoSospechoso` (que es otra cosa, ver abajo).
>
> **El umbral es RELATIVO: `max(piso de la familia, 20 × el récord histórico de ESA empresa)`.** El 20× es lo que lo hace envejecer bien — si la empresa crece, el umbral la sigue sin que nadie toque una constante.
>
> **Los pisos, medidos uno por uno el 30-jul contra producción** (`scripts/_diag-calibrar-guard-montos.mjs`, solo lectura):
>
> | Tabla | Récord REAL medido | Piso | Aire |
> |---|---|---|---|
> | `switch_facturas` (subtotal/total/saldo/impuesto/descuento) | $97.866,48 — la factura más grande jamás emitida | $1M | 10× |
> | `switch_estadocuenta` (total/saldo/débito/crédito/…) | $151.630,66 | **$2M** | 13,2× |
> | `switch_factura_utilidad` (subtotal/costo/utilidad) | $73.752,00 | $1M | 13,6× |
> | `switch_recibos.total` | $266.923,96 (fashion_wear, 28-feb-2023) | **$2M** | 7,5× |
> | `switch_proveedor_estadocuenta.saldo_total` | **$2.074.195,21 — LEGÍTIMO** | **$20M** | 9,6× |
> | `products/joybees_products/tommy_products.price` | $64,00 | **$10.000** | 156× |
> | `switch_costo_diario` (venta/costo/utilidad) | $141.707,12 | $1M | 7× |
> | `switch_articulo_diario` (venta/costo) | $88.592,00 | $1M | 11× |
>
> 🩸 **Por qué el piso NO es un número único global.** `switch_proveedor_estadocuenta` tiene **TRES filas por encima de $1.000.000** —$2.074.195,21 (fashion_wear), $1.233.330,25 (fashion_shoes), $1.035.616,02 (vistana)— y **son legítimas**: proveedores intercompañía, y no es un documento sino el saldo ACUMULADO de una cuenta corriente de importación. Copiar el $1M del guard de costo habría **rechazado datos buenos el primer día**. ⚠️ **Un valor GRANDE no es un valor IMPOSIBLE:** el riesgo real de este guard no es que se cuele una fila mala, es que BLOQUEE un mes fuerte — con estas tablas se calculan el margen y las comisiones. Por eso cada piso deja ≥7× de aire sobre el récord de SU tabla, y el test lo verifica familia por familia.
>
> **SIMETRÍA — se mira la fila ENTERA, no una columna.** 🩸 Los dos guards que ya existían eran asimétricos: validaban el **costo** y dejaban pasar la **venta** de la misma fila sin mirarla, y con la venta corrupta el margen queda igual de reventado. Ahora cada familia declara TODAS sus columnas de plata y el umbral se aplica a todas (arreglado en `syncCostoDiario` y en `sync-articulos`).
>
> **Anti-envenenamiento:** las filas ≥ **10 × el piso** no cuentan como historia — si la fila de mil millones contara, ella sola levantaría el umbral por encima de sí misma y desarmaría el guard para siempre. El filtro va en el servidor (pedir el máximo sin él devolvería justo la fila absurda). Las 3 filas reales de proveedores SÍ cuentan (están muy por debajo de su techo de $200M).
>
> **Se RECHAZA la fila, no se pone en cero:** los syncs son UPSERT, así que no escribir CONSERVA el último valor bueno; escribir un 0 lo destruiría. **Una fila mala NO tumba el sync** — `particionarFilas()` separa buenas de malas y las buenas se escriben igual. Dos lugares donde rechazar habría sido DESTRUCTIVO y hubo que protegerlos aparte:
> - **CXC:** el reconcile pone `saldo = 0` a todo lo que tenga `synced_at < runStamp`. Como la fila rechazada no se reescribe, el reconcile la habría leído como "documento cerrado" y le habría puesto 0 — justo el valor bueno que el guard existe para conservar. Ahora se excluyen sus `ccte_id` del reconcile.
> - **Recibos:** `total` entra en la identidad del diff, así que el recibo con cifra corrupta no se parea con su fila guardada y esa fila caía en `borrarIds`. Rechazar el dato malo habría **borrado el bueno**. Ahora se protege la fila guardada del recibo rechazado (misma fecha + mismo cliente).
> - **Catálogo:** producto existente con precio imposible → **no se toca la columna `price`** (stock, nombre y visibilidad se actualizan igual). Producto NUEVO con precio imposible → **no se crea**: no hay precio anterior que conservar y este precio se PUBLICA al cliente final.
>
> **El aviso NO es una cuarta regla de sistema.** Es la MISMA alerta que existía desde el 27-jul para el costo diario, generalizada: antes había una regla para una tabla, ahora una regla para las ocho. **El conteo de reglas baja, no sube.** Sigue en 🔧 SISTEMA y cumple la regla de tres (es real, no se arregla solo porque el dato está mal EN Switch, y hay que corregirlo allá). **Dos frenos para que no sea la alerta-que-suena-para-siempre:** UN mensaje por corrida (no uno por fila — 40 documentos corruptos = 1 aviso con los 5 primeros) y anti-loop de **7 días por fila** contra `switch_sync_log.skip_details` (`campo = 'monto_imposible_<familia>'`). Si Telegram falla, el sync sigue `success`.
>
> **Fail-open en todo el camino de lectura:** si no se puede calibrar (base caída, error de PostgREST, lo que sea) se usa el piso — nunca se vuelve MÁS agresivo por no poder leer. Supabase se importa **perezoso** para que el guard no arrastre la base a quien solo usa la matemática. Costo: **2 consultas (~180 ms cada una) por corrida de sync**, no por fila.
>
> **`esCostoSospechoso` sigue vivo y hace OTRA cosa:** mira el costo UNITARIO de un artículo (costo mal cargado en Switch, no una cifra imposible), guarda la fila con costo $0 en vez de rechazarla, y avisa por 📊 **NEGOCIO**. Los dos guards corren juntos en `sync-articulos`.
>
> **Candados:** `src/__tests__/lib/monto-guard.test.ts` (los picos históricos REALES de cada tabla pasan todos ← el test que más importa; lo imposible se rechaza en las 8 familias; simetría columna por columna; anti-envenenamiento; una fila mala no tumba las demás; el mismo dato malo 7 días seguidos avisa 1 vez) y **`monto-guard-candado.test.ts`**, que pone el build en ROJO si alguien escribe la validación a mano en otro archivo, si un sync protegido deja de importar el guard, o si el aviso se saltea el anti-loop. Barridos read-only: `node scripts/_diag-montos-absurdos.mjs` (todas las tablas de plata) y `node scripts/_diag-calibrar-guard-montos.mjs` (la calibración).
>
> ⚠️ **Filas absurdas ya guardadas: NINGUNA.** El barrido del 30-jul sobre las 10 tablas de plata dio 0 hallazgos salvo las 3 de `switch_proveedor_estadocuenta`, que **son legítimas y NO se tocan**. La de Boston ya se había borrado el 27-jul.

> **Depurador — el DIVISOR tiene rango, y el rango es 0 ó 0.10-1.00 (27-jul-2026).** El precio es `TECHO(Costo CIF ÷ divisor) + extra`: el divisor NO es un porcentaje, es la **fracción del precio que representa el costo** — para 30% de margen se escribe **0.70**. 🩸 `marca_formulas` tenía **`TH Tommy Jeans` con `divisor = 70`** desde el 29-jun (un punto decimal olvidado): un costo CIF de $42 daba **$4** en vez de $63, o sea precios **100× más baratos**. Las 4 rutas que escriben fórmulas solo pedían `divisor >= 0`, así que el 70 entraba igual que el 0.70. Daniel: *"divisor deberia de ser 0.7, y si puedes obligar a que ese error no vuelva a pasar, no existe q sea mas de 1.0"*. Fila corregida a 0.70 con su aprobación; era la **única** fuera de rango en las 4 tablas.
> - **Fuente única: `src/lib/depurador/divisor.ts` → `validarDivisor()`** (módulo PURO), usada por `formulas`, `rubro-formulas`, `tienda-formulas` y `tienda-rubro-formulas`. El CHECK de la base (`20260727190000_divisor_rango.sql`, las 4 tablas) repite el mismo rango como último freno para lo que no pase por las rutas; **el código funciona con o sin él.**
> - **El 0 SIGUE SIENDO VÁLIDO y no es un descuido:** es el default de la columna y el centinela que `calcPrecio()` usa (`if (!f.divisor) return null`) para dejar el precio vacío y que se ponga a mano, o para mandarlo a `precio_fijo`. Hay filas reales apoyadas en eso (3 marcas + 10 excepciones). Rechazarlo habría roto guardarlas. Nunca se divide entre 0 — el centinela corta antes.
> - **Los dos bordes, y por qué ahí:** techo **1.00 inclusive** (arriba de 1 el precio queda POR DEBAJO del costo = definición de error de tipeo; 1.00 exacto es vender al costo, raro pero no destructivo). Piso **0.10**, porque el error simétrico es igual de caro: `0.07` en vez de `0.7` daría el precio **10× más caro**. El margen más agresivo que el negocio usó nunca es **0.63** (CK Legwear), así que el piso deja 6× de aire y no bloquea ninguna decisión concebible — mismo criterio holgado que el guard de costo diario: **un valor GRANDE no es un valor IMPOSIBLE.**
> - **El guard hace la conversión él mismo** en vez de recibir un `Number(body.divisor)` ya hecho: con la coerción del llamador, `null`, `""` y `[]` llegaban convertidos en **0** y se habrían leído como "sin fórmula", **borrando una fórmula buena en silencio**.
> - ⚠️ **Daño medido:** 3 plantillas de `TH Tommy Jeans` se descargaron con el divisor malo (3-jul, 21-jul y 22-jul; Angela / Fashion Wear; 10 estilos, 828 unidades, **$16.177,92** de costo). `carga_history` NO guarda los precios, solo los totales, y el Excel se sube a Switch a mano — **hay que revisar en Switch los precios de esos estilos**, el arreglo del divisor no los corrige hacia atrás.
> - Candado: `src/__tests__/lib/divisor-rango.test.ts` (46 casos, verificado por mutación: desarmar el techo rompe 11). Incluye barrido estático — una ruta que escriba un divisor sin llamar al guard pone el build **ROJO**.
> - **Barrido del mismo patrón "porcentaje vs fracción" (27-jul):** `comision_vendedor_tasa.tasa_venta` ya está blindada (`config/route.ts:90`, cap `0..0.20`, decimal). `itbms_pct` es un enum cerrado `0|7` (porcentaje entero, siempre `/100` al usarse) y `descuento_global_pct` es solo lectura desde Switch. **El divisor era el único campo de configuración sin tope.**

> ## 🔴 Depurador — EL PEDIDO DE REEBOK SALE CON LAS FOTOS PEGADAS, Y LAS FOTOS NO SE SUBEN (17-ago-2026)
>
> Hasta hoy Daniel armaba ese Excel **a mano con un macro de VBA**: pegaba los códigos en una columna, corría el macro, elegía una carpeta y el macro le pegaba la foto de cada código al lado. Lo quiere desde el sistema para que su secretaria (Windows) lo use **sin instalar nada**. Para qué es, textual: ***"interno"*** — nadie más lo usa; esos códigos entran a Switch más adelante, hoy todavía no están.
>
> **El flujo:** se carga el Excel del proveedor como siempre → en *Pedido para cliente* aparece **"Fotos del pedido (opcional)"** → se elige la carpeta (selector de carpeta del navegador, `webkitdirectory`) → antes de descargar la pantalla ya dice **"172 de 172 códigos con foto · no falta ninguna"** → el Excel baja con la foto incrustada en la **primera columna**, a la izquierda del código.
>
> ### 🔑 LAS FOTOS NO SE SUBEN A NINGÚN LADO — todo pasa en el navegador
>
> La carpeta real (`OneDrive-FashionGroup/Reebok/Fotos`) son **4.744 .jpg y ~818 MB**. Subirlas sería otro problema —almacenamiento, sincronización, permisos— que nadie pidió. El emparejado, el achicado y el armado del ZIP ocurren **en la máquina de la persona**: en `fotos-carpeta.ts` no hay un solo `fetch`, y el índice de la carpeta se arma **solo con los NOMBRES** (no se lee el contenido de ningún archivo que no empareje con un código del pedido).
>
> ### 🔴 EL EMPAREJADO ES POR NOMBRE EXACTO, SIN MAYÚSCULAS Y NADA MÁS
>
> `100262385` ↔ `100262385.jpg`. No se quitan guiones, no se recorta, no se comparan parecidos ni distancias de edición. **Es la lección de `Outlet Duty Free N2` vs `N3`** (ver Guías): dos códigos parecidos son DOS artículos, y pegarle al pedido la foto del artículo de al lado **no deja ningún rastro** — el cliente recibe el catálogo con la foto equivocada y nadie se entera nunca. Un código sin foto exacta sale con **`NO IMAGEN`**, que es la verdad, y **la fila NO se salta** (mismo texto que usa hoy el macro). Hay candado con los casos que engañan: `100073063_black.jpg` no es `100073063`, `T1A8-32600-313.jpg` no es `T1A832600313`, `00100262385.jpg` no es `100262385`.
>
> ### ⚠️ `xlsx-js-style` NO SABE INCRUSTAR IMÁGENES — y NO se cambió la librería
>
> Verificado abriendo el bundle publicado (`dist/xlsx.bundle.js`, v1.2.0): **cero apariciones** de `xdr:`, `oneCellAnchor`, `twoCellAnchor`, `xl/media`, `drawing1.xml` y `sheet_add_image`. No hay opción escondida.
>
> **La salida la sigue armando `xlsx-js-style` exactamente como hoy** (mismas celdas, mismos anchos, mismo forzado a texto de los códigos) y después `src/lib/depurador/fotos-xlsx.ts` le agrega al ZIP las partes que le faltan (`xl/media/*`, `xl/drawings/drawing1.xml` + sus rels, el `<drawing r:id>` de la hoja y el Override de `[Content_Types].xml`). **`jszip` YA era dependencia** (lo usa el ZIP de Marketing) y se importa perezoso, así que solo se descarga cuando de verdad hay fotos. Cambiar de librería de exports habría tocado TODO el sistema por un botón.
> - La hoja se resuelve por el índice del propio archivo (`workbook.xml` → `workbook.xml.rels`), no adivinando `sheet1.xml`.
> - El `<drawing>` va al FINAL del `<worksheet>` (después de `<ignoredErrors>`, que es lo último que escribe SheetJS): ese es el orden del esquema.
> - Si la hoja YA tenía un dibujo, **corta con error en vez de pisarlo**.
> - Dos filas con la MISMA foto (el mismo artículo en dos PO) comparten un solo archivo dentro del ZIP: medido, **172 anclas contra 109 imágenes**.
>
> ### Las fotos se achican REUSANDO `compressImage`, no con un segundo compresor
>
> `compressImage` (el de Reclamos) ganó un `opts` OPCIONAL —`{ maxDimension, quality }`— y **sin `opts` se comporta exactamente igual que siempre** (1600 px · JPEG 0.8), así que Reclamos y Mobiliario no cambian. El Depurador le pide **300 px · 0.72**: 203 fotos de 600×600 sin achicar son **20,5 MB** y el Excel sería imposible de mandar por correo.
> - **La foto se encaja en la celda con UNA SOLA escala para los dos ejes** (`encajar`): dos escalas distintas deforman el producto. Nunca agranda una foto más chica que la caja.
> - Una foto que no se puede leer NO deja la celda en blanco: ese código sale de `conFoto` y su celda dice `NO IMAGEN`. Una celda vacía se vería igual que "no se pegó y nadie se dio cuenta".
>
> ### 🔴 SIN CARPETA, EL EXCEL DE HOY SALE IDÉNTICO
>
> `buildCatalogoAoa(rows, mes)` sin el tercer parámetro devuelve **exactamente** las 10 columnas de siempre, y `incrustarFotosEnXlsx` con la lista vacía **devuelve los mismos bytes sin abrir el ZIP** (no lo re-empaqueta "por las dudas"). Medido en el navegador: sin carpeta el archivo pesa **87 KB, primera columna `PO NAME`, 10 columnas, 0 imágenes en el ZIP**.
> - ⚠️ **Con la columna `Foto` adelante, `New Article` pasó del índice 1 al 2** y el `forceTextCols` se corrió con él: forzar el índice viejo habría dejado los códigos en **notación científica**. Verificado en el archivo descargado: `C2 = "100277416"` con `t="s"`.
> - **La plantilla Switch NO lleva fotos** (se sube a Switch, no la mira nadie) y el bloque ni se dibuja en ese modo. **El Depurador CK/TH tampoco cambió**: la carpeta de fotos y los códigos son de Reebok.
> - ⚠️ **No se tocó una sola línea del cálculo de precios** (`TECHO(CIF ÷ divisor) + extra`, `validarDivisor`).
>
> ### Medido con la carpeta REAL y el pedido REAL
>
> `BASE=… node scripts/_medir-fotos-pedido.mjs` (solo lectura sobre la carpeta). **Se le pasa la CARPETA ENTERA de verdad** —las 4.744 fotos, 818 MB—, que es lo que hace la persona; `MUESTRA=1` arma una copia por enlaces duros (mismos bytes, sin copiar) para iterar más rápido, y da los mismos números. La entrada son los **203 códigos del `1000 fiver excel.xlsm`** de Daniel, puestos en el formato Book4 que el Depurador lee.
>
> | | |
> |---|---|
> | del clic a que el archivo baja | **906 ms** |
> | peso del .xlsx | **0,65 MB** (contra **20,5 MB** de originales) |
> | filas / fotos | 172 filas · **172 de 172 con foto** · 109 imágenes distintas |
> | elegir la carpeta de 4.744 y emparejar | **299 ms** |
> | sin carpeta de fotos | 87 KB · `PO NAME` · 10 columnas · 0 imágenes |
>
> ⚠️ **Las 172 filas no son un recorte de las 203 líneas del macro:** el Depurador agrupa por PO + artículo y descarta los que no tienen piezas del mes, que es lo que ya hacía antes de este cambio. Y **109 imágenes contra 172 anclas** es el mismo artículo repetido en dos PO, no fotos perdidas.
>
> **El archivo se abre de verdad, y con DOS parsers independientes:** `xlsx-js-style` lo relee (172 filas, 1ª columna `Foto`, el código sigue siendo texto) y **`openpyxl` ve las 172 imágenes** ancladas en `col 0`, con `alto de fila 72` y `ancho de columna 14,83`. Una de las miniaturas extraída del ZIP es un JPEG real de 300×300 y 7 KB.
>
> **Los 3 anchos (+ el iPad acostado), contra el build de producción:** **390 · 834 · 1024 · 1440 → 0 px de arrastre de página**, y la caja nueva da **0 recorte, 0 blancos táctiles bajo 44 px y 0 textos bajo 12 px** en los cuatro (crece hacia abajo: 211 px de alto a 390, 174 a 834, 156 a 1024 y 1440). Su rótulo va a **12 px y no a los 11 de los dos rótulos vecinos**, a propósito: es texto NUEVO. El único recorte de la pantalla es el **scroller declarado de la vista previa** (`DIV.max-h-[440px].overflow-auto`, 291 px a 390 y 71 a 834): es PRE-EXISTENTE y es el mecanismo, no un defecto. El script **falla** si no encuentra la caja, si falta alguna foto, si el archivo no baja o si no se puede abrir.
>
> **Candado: `src/__tests__/lib/depurador-fotos-excel.test.ts` (26).** No busca texto en archivos: arma libros de verdad, los incrusta, los vuelve a abrir con la librería de Excel y con JSZip, y lee las anclas. Incluye un bloque que corre contra la **carpeta real** si está en la máquina (y se saltea en CI en vez de dar verde por nada).

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
    - ✅ **`api/multifashion/fidelizacion/route.ts` SANEADA (12-ago-2026).** Paginaba a mano y **sin `.order()`** — el peor disfraz del bug, porque esta ruta AGREGA: con filas empatadas PostgREST puede saltear entre páginas y un salteo se ve como un número más chico, sin error y sin señal. Y no era latente: **`switch_facturas` de ACS ya está en 1.273 filas**, o sea que la 2ª página se pedía de verdad (`switch_clientes` va en 950, una sola página). Ahora usa `leerTodoPaginado` con `.order("id")` (uuid PK, único y estable) en las dos lecturas. **NO se pisó ningún orden de negocio: esta ruta no tiene uno** — el único consumidor (`ClientesMultifashionSubtab`) convierte `clientes[]` en un Map por `nombre_norm` y el orden de la lista lo pone el ranking de retail. Lo único que el orden decide es el desempate de `nombreFactura` en los huérfanos (gana el primer `cliente_nombre` no nulo): hoy eso ya era arbitrario y ahora es determinista — medido, **3 clientes de ACS tienen más de un nombre en sus facturas** (`LEIDYS RAQUEL ARAUZ`/`LEIDYS ARAUZ`, `Monica Rios`/`Monica Ríos`, `rafael rodriguez`/`RAFAEL RODRIGUEZ`). **Medido contra producción antes y después: cards IDÉNTICAS** (`frecuentes 66 · nuevos_mes 43 · dormidos 486 · cinco_pendiente 774`), **953 filas de `clientes` y 0 diferencias campo por campo.** El `catch` de degradación pre-DDL sigue funcionando: `leerTodoPaginado` prefija su etiqueta pero conserva el mensaje de PostgREST, así que `/descuento_global_pct/` sigue matcheando.
    - **El doble de Supabase del arnés de catálogos** (`src/__tests__/helpers/catalogo-mock-db.ts`) ahora devuelve `count` = largo de `data` por defecto, como haría PostgREST. Antes entregaba filas con `count: null` — la firma de una lectura NO verificable — y hacía fallar en el arnés a lectores que en producción reciben el count perfectamente.
  - **`switch_sync_log` se poda** desde el cron `cleanup-sessions` (02:30 UTC) vía la RPC `podar_switch_sync_log(90)`: retención de 90 días, pero SIEMPRE conserva las 10 filas más recientes de cada `(empresa_key, sync_type)` y nunca toca `status='running'`. Los tres lectores que no filtran por fecha (`alert-policy`, `/api/sync-status`, `/api/admin/sync-now`) piden "las últimas N de este par": una poda por fecha pura le borraría la última fila a un par retirado y el panel diría "nunca sincronizó". El paso es NO FATAL dentro del cron.

> **`switch_articulo_marca` — el diccionario que se quedó con el 22% del catálogo, y las DOS cosas que lo hicieron posible (7-ago-2026).** Es el `articulo_id → marca` que alimenta "Multifashion › Productos › por marca" (`switch_articulo_diario` no sabe de marcas: su `descripcion` es categoría+género). Lo escribe `sync-articulo-marca.ts` desde el cron `switch-articulos` (08:40 UTC).
>
> 🩸 **Medido en producción:** la tabla tenía **2.000 filas** (`articulo_id` 1…2004, 19 marcas de 33) contra un catálogo de **9.126 renglones**, y el módulo mostraba como "Sin marca" el **91,3% de los 4.071 códigos vendidos en 12 meses** y el **97,8% de los dólares**. En `switch_sync_log` no había **NI UNA** fila de `sync_type='articulo_marca'` — ni success, ni error, ni running.
>
> **Causa 1 — el catálogo de Switch REPITE artículos, y eso rompía el upsert.** `/apiarticulos/lista` devuelve **9.126 renglones con solo 8.447 `id` distintos**: 221 artículos vienen repetidos (679 renglones de más; uno aparece 12 veces), casi siempre en renglones CONSECUTIVOS de la misma página. Las copias son idénticas — 0 de 221 difieren en `codigo` y 0 de 221 en `marcaId`—, o sea que no hay dato que elegir, solo un renglón de más. Pero Postgres rechaza un `INSERT … ON CONFLICT` que traiga la misma llave dos veces en la MISMA sentencia, y el upsert manda de a 500: **el primer lote con un repetido adentro es el 5.º**, así que los 4 primeros entraban (500 × 4 = 2.000 filas exactas) y el 5.º tumbaba la corrida. Ahora se DEDUPLICA antes de escribir (`dedupeCatalogo`, puro), que además es lo correcto por definición — la llave de la tabla es `(empresa_key, articulo_id)`.
> - **Lo que NO era**, descartado midiendo y no razonando: **no fue el `maxDuration`** (el barrido completo mide **204 s** —184 páginas, p50 658 ms— y el sync de ventas de las 8 empresas **63-71 s** en 7 días seguidos, contra 800 s de techo: sobra más del doble, y por eso **no hace falta un cron aparte ni un barrido reanudable**, que además serían una segunda sesión contra american_classic); **no fue el endpoint cortando la paginación** (la página 41 devuelve datos, el barrido llega hasta la 184); **no fue una fila borrada del log** (la poda nunca toca `running` y conserva las 10 últimas de cada par).
>
> **Causa 2 — la corrida era INVISIBLE, y es la MISMA de `catalogo_tommy` repetida dos semanas después.** La migración del 6-ago creó la TABLA pero no tocó el CHECK de `switch_sync_log.sync_type`. El logger es degradable: el INSERT viola el CHECK, se traga el error y devuelve `logId = null` → `finishSwitchSyncLog` queda en no-op → **la corrida no deja fila, corra bien o corra mal**. Sin fila no hay racha, y sin racha la regla de los 2 fallos no tiene qué medir. Migración `20260807200000`; y el fix de raíz para que no haya una tercera vez es **`SYNC_LOG_TYPES`** (módulo PURO `sync-log-tipos.ts`, con `createSwitchSyncLog` tipado contra él) más el candado **`sync-log-tipos-check.test.ts`**, que lee el SQL de las migraciones y pone el build ROJO si el código estrena un tipo sin su DDL.
>
> **Causa 3 — el fallo no despertaba a nadie.** `switch-articulos` guardaba el error del diccionario en una variable, lo escribía con `console.error` y lo devolvía en un JSON que no lee nadie. Ahora pasa por la MISMA política anti-ruido que el resto (`alertSwitchCronErrors`, regla de los 2 fallos seguidos del par `(american_classic, articulo_marca)`, canal 🔧 SISTEMA) — **se reusa, no se duplica**, y en UNA sola llamada junto con los errores de ventas para no mandar dos mensajes por la misma corrida. El **heartbeat no cambia**: sigue mirando solo las ventas por artículo, porque un diccionario viejo no es un cron que no corrió (es el error de `all-0630`).
>
> **Guard del barrido corto:** el corte del barrido es una página VACÍA, así que un 200 con lista vacía a mitad del catálogo cortaría el sync contento, escribiría poco y se anotaría `success`. Ahora, si el barrido trae menos del **70%** de lo que la tabla ya sabe de esa empresa, **no se escribe nada** y la corrida queda `error`. El 70% es holgado a propósito: la tabla es aditiva (los descatalogados conservan su fila), así que con los años lo guardado puede superar al catálogo vivo — pero caer a menos de dos tercios no es un cambio de negocio plausible. El caso del 7-ago habría dado 2.000 contra 8.447 = **24%**.
>
> Candados: `src/__tests__/lib/articulo-marca-dedupe.test.ts` (incluye el barrido estático que impide volver a mandar el catálogo crudo al upsert) y `sync-log-tipos-check.test.ts`. Verificado por mutación: quitar el dedupe rompe 2, apagar el guard del barrido rompe 1, sacar `articulo_marca` del CHECK rompe 2, y dejar de alertar el fallo del diccionario rompe 1. Diagnóstico read-only: `FASE=a|c|d|e npx tsx scripts/_diag-articulo-marca-hueco.ts`.

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
77 entradas configuradas (+8 el 13-ago-2026 al pasar los 4 catálogos de 2 a 4 pasadas diarias, todas dentro de la ventana de uso de Panamá — ver la nota abajo; 66 hasta ese mismo día, cuando se retiró `sync-mayor`; 53 hasta el 26-jul-2026 cuando se retiró `multifashion-sync`, +11 del vigía `db-salud` el 27-jul, −6 al bajar `db-salud` a 5, +3 al pasar `asistencia-vigia` de 1 pasada L-V a 4 diarias el 10-ago, −1 al quitarle la pasada de las 13:45 UTC ese mismo día — ver abajo). **Una entrada = una ocurrencia al día**: para frecuencia sub-diaria se agregan entradas separadas del mismo path, NUNCA una lista de horas (`0 15,19,23 * * *`), que Vercel Pro sí acepta — ver la nota de slots más abajo. Límite Vercel Pro: 100 cron jobs/proyecto.

| Cron | Schedule (UTC) |
|------|----------------|
| /api/cron/db-salud | 01:45, 04:35, 07:25, 09:55, 12:25, 14:45, 16:45, 18:45, 20:25, 21:45, 22:45 (11 entradas — vigía de recursos, ver nota abajo) |
| /api/cron/cleanup-sessions | 02:30 (revoca sesiones inactivas — ver nota abajo) |
| /api/cron/cleanup-packing-lists | 03:00 |
| /api/cron/sync-articulo-info (3 grupos de 2 empresas FG) | 04:30 (vistana, active_wear), 04:40 (fashion_shoes, fashion_wear), 04:50 (active_shoes, joystep) — catálogo del tab Ventas › Referencia (existencia, precio de etiqueta, nombre real, CIF). 3 entradas y NO una de 6: vistana sola midió **155 s / 8.122 artículos** (10-ago-2026) y 6 así desbordan los 800 s (el caso Boston). La franja 00:30-05:15 es la única sin sesiones de Switch de estas 6; cada grupo queda a 60/55/50 min de SU par del bloque `all`. Boston y ACS EXCLUIDOS (decisión de Daniel, la misma del tab). El botón "Actualizar datos de Switch" del tab SE QUEDA para el dato del momento. Candado: `cron-sync-articulo-info.test.ts` |
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
> 🩸 **El aviso de memoria se leía como falta de ESPACIO, y al 42% no debía sonar (30-jul-2026).** Daniel, textual: *"me preocupa que me manda alerta de espacio, eso que es si subi supabase"*. Acababa de pagar Supabase Pro y recibió `🟡 Memoria de emergencia en uso: 42%` seguido, **en la misma lista**, de `Disco libre 92%` y `Tamaño de la base 270 MB de 8 GB`. Dos defectos distintos:
> - **El umbral de swap era RUIDO PURO: 40 → 70 aviso, 70 → 85 crítico.** Medido ese día contra el endpoint de métricas: swap usado **40,3 %** —parado justo encima del umbral— con memoria disponible **53,3 %** y `node_vmstat_oom_kill` en **0** (la base nunca fue matada por memoria). O sea la base estaba **sana** y el mensaje llegó **3 veces** (28, 29 y 30-jul). ⚠️ **Por qué el número solo no sirve de mucho:** el swap usado es una **marca de marea alta y pegajosa** — el kernel no trae de vuelta las páginas hasta que alguien las pide, así que sube y casi nunca baja: **13,5 % el 27-jul → 40,3 % el 30-jul, sin ningún incidente en el medio**. Un umbral cerca de la deriva normal es una alerta que, una vez que suena, suena para siempre. La señal que importa es la memoria **DISPONIBLE** (umbral propio, 20 %) y `oom_kill`. El 70 deja el doble de aire sobre la deriva observada y **sigue atrapando el episodio real**: durante la caída del 26-jul el swap llegó a **86 % → crítico**. Si algún día la deriva normal cruza el 70, el arreglo **NO** es volver a subir el número: es dejar de alertar por swap usado y mirar la **actividad** de swap (`node_vmstat_pswpin/pswpout` entre dos muestras), que sí distingue "hay páginas viejas guardadas" de "está paginando ahora".
> - **El mensaje ya no mezcla memoria con almacenamiento.** El estado va en **bloques rotulados** — `MEMORIA (es lo que se aprieta)` / `ALMACENAMIENTO (va aparte, no tiene que ver con la memoria)` / `SERVIDOR` —, los hallazgos de memoria empiezan con la palabra **MEMORIA** en mayúsculas, y cuando el problema ES de memoria se agrega una línea que dice lo que hacía falta decir: *es MEMORIA (RAM), no espacio de almacenamiento; tener disco libre no lo arregla, y el plan de Supabase no cambia la RAM*. Esa aclaración **no** aparece cuando el hallazgo es de almacenamiento (volvería a mezclar los dos temas). La palabra "swap" sigue prohibida en los textos (regla vieja de no-jerga): se dice "memoria de respaldo".
> - Candados en `src/__tests__/lib/db-recursos.test.ts`: que la medición real del 30-jul (base sana) **no mande ningún mensaje**, que el 86 % siga siendo crítico, y que el disco nunca vuelva a quedar entre las cifras de memoria.
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
| /api/cron/tommy-catalogo | **14:30, 17:00, 19:40, 21:55** (4 entradas — solo toca fashion_shoes; artículos marcaId=3; mientras la DDL 20260724150000 no corra se omite limpio sin tocar Switch) |
| /api/cron/calvin-catalogo | **14:35, 17:05, 19:45, 22:00** (4 entradas — solo toca vistana; artículos marcaId=8 = CK FOOTWEAR; mientras la DDL 20260812150000 no corra se omite limpio sin tocar Switch) |
| /api/cron/reebok-catalogo | **14:40, 17:10, 19:50, 22:05** (4 entradas — solo toca active_shoes en Switch) |
| /api/cron/sync-proveedores | 09:30 |
| /api/cron/joybees-catalogo | **14:45, 17:15, 19:55, 22:10** (4 entradas — solo toca joystep en Switch) |
| /api/cron/integrity-check | 12:00 |
| /api/cron/cheques-alert | **14:15** (9:15 a.m. Panamá — aviso de cheques por vencer, ver nota abajo) |
| /api/cron/switch-reconciliacion | 10:00, 14:00, 18:00 (3 entradas) |
| /api/cron/switch-sync tipo=facturas — **ventas** | 11:50, 13:00, 15:00, 17:00, 19:00, 21:00, 23:00, 00:15 (8 entradas). **13/17/21 y 00:15 = solo american_classic** (ventas ACS cada 2h; 00:15 = sync de cierre, tras cerrar tienda 7pm Panamá — de él depende el resumen de la 01:00). **11:50/15/19/23 = las 8 empresas con facturas** (ACS + las 7 B2B): 06:50, 10:00, 14:00 y 18:00 Panamá |
| /api/cron/acs-resumen-diario | 01:00 (resumen diario ventas ACS a Telegram; 20:00 Panamá = 8pm, tras el sync de cierre de 00:15) |
| /api/cron/grupo-resumen-mensual | 13:00 el día 3 de cada mes (`0 13 3 * *` — resumen mensual del grupo a Telegram; único cron NO diario, umbral propio en health-crons) |
| /api/cron/switch-sync tipo=estadocuenta (3 pares B2B) | 16:00/16:05/16:10 y 21:10/21:15/21:20 (6 entradas — CXC intradía; ronda 1 con active_shoes,joystep PRIMERO, que hoy le da 70 min a reebok-catalogo 17:10) |
| /api/cron/asistencia-vigia | 15:00, 20:00, 22:15 (3 entradas, TODOS los días = 10:00 a.m. / 3:00 p.m. / 5:15 p.m. Panamá — el reloj de asistencia lleva +6h sin reportar; ver nota abajo) |

> **La pasada de las 8:45 a.m. se quitó porque era una falsa alarma DIARIA (10-ago-2026).** Daniel empezó a apagar la PC de la oficina a las 5/6 de la tarde. Apagada desde las 6 p.m., a las 8:45 a.m. (13:45 UTC) el agente lleva **~14 horas** sin reportar: el umbral de silencio de 6 h se cruza **siempre**, y el vigía avisaba todos los días de algo que es el horario normal, no una falla. La primera pasada que queda es **15:00 UTC = 10:00 a.m.**, con la oficina ya abierta: a esa hora, que nadie haya prendido la PC sí merece que suene. **NO se tocó `HORAS_PARA_VIGIA` (6 h)** — el umbral estaba bien; lo que estaba mal era la hora a la que se preguntaba.
> - **Hueco máximo con 3 pasadas: 16h45** (22:15 UTC → 15:00 UTC del día siguiente; los otros dos son 5h y 2h15). Sigue por debajo de `CRON_STALE_HOURS_DEFAULT` (26 h) con 9h15 de margen, así que `asistencia-vigia` **no** necesita entrada en `CRON_STALE_HOURS_POR_CRON`. Con 4 pasadas el hueco era 15h30 — el cambio no acerca el cron al umbral lo suficiente como para justificar un override.
> - **Correr menos veces NO pierde avisos**: `alertado_en` deja pasar uno por episodio de todas formas. Lo único que cambia es la demora entre que la PC se apaga y Daniel se entera, y de noche esa demora no era accionable.

> **`cheques-alert` — aviso el DÍA HÁBIL ANTERIOR, 14:15 UTC = 9:15 a.m. Panamá (27-jul-2026).** Pedido de Daniel, textual: *"QUIERO aviso de cuando se vence un cheque un dia antes, almenos q venca el lunes, avisame el viernes."* Corriendo un día hábil D, la ventana de `fecha_deposito` es **[D, N]** con N = el próximo día hábil después de D: jueves→viernes, **viernes→sábado+domingo+lunes**, sábado/domingo→**no se manda nada**. La regla vive en `src/lib/cheques-aviso-ventana.ts` (módulo PURO, sin base ni Telegram); el I/O en `cheques-alert.ts`.
> - **Por qué la ventana llega hasta el próximo día hábil y no solo "mañana":** si el viernes solo mirara mañana, un cheque que vence el **sábado** no se avisaría nunca — sábado y domingo no hay aviso y el lunes ya venció. Antes el cron miraba hoy+mañana a secas y ese hueco existía. **HOY sigue incluido** (comportamiento previo, y a Daniel le sirve el recordatorio del día): un cheque del lunes se anuncia el viernes *"el lunes 3 ago"* y otra vez el lunes *"HOY"* — días distintos, no un duplicado.
> - **Anti-duplicado (`yaAvisoHoy`):** el `cron_heartbeats` de `cheques-alert` es la llave. Si hay un success posterior al inicio del día **Panamá** (05:00 UTC), la corrida no manda nada — cubre el reintento de Vercel y la recuperación de la reconciliación. **Fail-OPEN**: si no se puede leer el heartbeat, el aviso sale igual (perder un cheque cuesta más que repetir un mensaje). El heartbeat se registra **también** el fin de semana y sin cheques, o el watchdog alertaría cada sábado.
> - **Por qué 14:15 y no 14:00 en punto:** 14:00 es `switch-reconciliacion`, que puede correr hasta 740 s. 14:15 queda limpio y a 30 min de `db-salud` 14:45. Y `COLATERAL_RECOVER_AFTER_HOUR_UTC["cheques-alert"]` subió **14 → 15** para que la pasada de las 14:00 no se adelante 15 min a su propio run (solo recupera la de las 18:00).
> - **Filtros:** `estado='pendiente'` **y `deleted=false`** — lo segundo faltaba: un cheque borrado (soft-delete) seguía avisando. **Sin cheques por vencer NO se manda mensaje** (un "no hay nada" diario es ruido).
> - ⚠️ **Feriados de Panamá: NO los tenemos y no se inventa un calendario.** Si el lunes es feriado el aviso igual salió el viernes, que es lo correcto. Lo que queda descubierto es el caso inverso: un cheque que vence el martes tras un lunes feriado se avisa el lunes (feriado) en vez del viernes. Limitación conocida y aceptada.
> - Para ver el texto sin spamear Telegram: `npx tsx scripts/_dryrun-cheques-aviso.ts`. Candado: `src/__tests__/lib/cheques-aviso-vencimiento.test.ts` (20 casos con fechas FIJAS).
>
> **Corrida temprana de ventas 11:50 UTC = 06:50 Panamá (26-jul-2026):** las 8 empresas, `tipo=facturas`, slot `facturas-1150`. Cierra el hueco entre el bloque `tipo=all` de la madrugada (00:30-01:30 Panamá) y las 10:00 a.m.: quien entraba a trabajar a las 8 a.m. veía datos de 7h30 atrás; ahora ve los de las 6:50 a.m. (1h10). **Por qué 11:50 y no 12:00:** en su momento a las 12:10 corría `reebok-catalogo` (active_shoes) — 12:00 dejaba 10 min, por debajo de los 15 de `SEPARACION_MINIMA_MIN`. La hora se conserva; desde el 13-ago-2026 los catálogos se mudaron a la ventana de uso de Panamá y su vecino más cercano pasó a ser `acs-fidelizacion` 11:30, a 20 min. `integrity-check` 12:00 no toca Switch.
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
> **El vigía externo se murió en silencio — y el 503 era el culpable (30-jul-2026).** cron-job.org le mandó a Daniel *"your cronjob has been disabled automatically because of too many failed executions"*: **26 fallos consecutivos** de `/api/health-crons`, todos **503**. Durante días, si un sync se caía, **ningún observador externo avisaba**. El que vigilaba a los crons no tenía quien lo vigilara.
> - **La cadena completa, medida contra producción.** `confecciones_boston` ganó `estadoCuenta: true` (pestaña de Boston). Su estadocuenta hace **una llamada HTTP por cliente** y boston tiene **4.912 clientes** contra 136-139 de las demás: el ÚNICO run exitoso de su historia tardó **3.240 s (54 min)** y fue un `triggered_by='backfill'` local. El techo de la función es **800 s** → el run de las 06:30 **muere siempre**, y un proceso matado no ejecuta `finally`: no registra heartbeat NI alerta. Por eso `switch-sync:all-0630` no volvió a registrar heartbeat desde el **27-jul 06:30:39**, aunque las facturas de american_classic del MISMO run salieran bien (06:31:23). Todas las filas de `confecciones_boston/estadocuenta` desde el 28-jul son `error` con `#atascado` (las cierra el run siguiente). Reproducible: `DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-vigia-503.ts`.
> - **El 503 no estaba equivocado: estaba MAL DIRIGIDO.** Bastaba UN cron stale para que el endpoint devolviera 503 en TODAS las llamadas. Un semáforo que se queda en rojo para siempre no es un semáforo: es un semáforo que alguien apaga. Y el cron roto **ya lo venía reportando el watchdog Telegram** los días 27, 28 y 29 — la redundancia costó la vigilancia externa de los otros ~50 crons.
> - **Ahora el código HTTP responde "¿la vigilancia funciona?", NO "¿hay hallazgos?"** (`veredictoVigiaExterno`, función PURA en cron-telemetry.ts). Los hallazgos viajan **siempre** en el cuerpo (`stale[]`, `staleCount`) — no se esconden — pero solo levantan 503 cuando el vigía INTERNO no puede reportarlos él mismo: **(a)** `switch-reconciliacion` stale (es quien hospeda el watchdog Telegram: si él no corre, nadie adentro puede avisar nada), **(b)** **caída masiva** ≥ `UMBRAL_CAIDA_MASIVA` (5) crons stale a la vez = la firma de "Vercel dejó de invocar crons", **(c)** no se pudo leer `cron_heartbeats` (fail-closed: un vigía ciego grita). `ok` conserva su viejo significado (cero hallazgos); **`vigilanciaOk` es el semáforo**. Un 503 vuelve a ser raro y significativo, que es la única forma de que un servicio de monitoreo no lo termine apagando.
> - **Un problema de AUTH ya nunca devuelve 503.** Sin `HEALTHCHECK_TOKEN` configurado respondía 503 "fail-closed" — prudente en apariencia y un error de diseño: hacía que un olvido de configuración se viera **idéntico** a "los crons se cayeron", y para siempre (una env var ausente no se arregla sola) hasta que el monitor se apagara. Ahora es **401**, igual de fail-closed (nadie entra sin credencial) pero diciendo la verdad.
> - ⚠️ **La credencial NO es `CRON_SECRET`** — probarlo con `Authorization: Bearer $CRON_SECRET` da **401 a propósito**: un monitor de terceros no debe poder disparar crons. Es `?token=<HEALTHCHECK_TOKEN>` (o header `x-healthcheck-token`), comparado en tiempo constante. Verificado en producción: la env var **está** configurada (sin token da 401, no 503), o sea que cron-job.org venía autenticando bien y el 503 era genuino. El 401 ahora incluye el campo `comoAutenticar` como pista.
> - **VIGILANCIA MUTUA — el que vigila también es vigilado, y NO hizo falta otro cron** (que podría morirse igual de callado). Cada llamada autenticada registra el heartbeat **`vigia-externo`**; si cron-job.org deja de llamar, esa fila envejece y el **watchdog Telegram interno** la reporta a las 26h como cualquier cron caído (cron-job.org llama cada hora: 26h sin una sola llamada es inequívoco). Los dos se cubren: **crons de Vercel caídos → el vigía externo ve 503 → correo a Daniel; vigía externo caído → heartbeat stale → Telegram a Daniel.**
> - **`HEARTBEATS_EXTERNOS` es la tercera lista del registro**, y es lo CONTRARIO de `HEARTBEATS_NO_CRON`: no está en vercel.json (lo dispara un tercero desde afuera) pero **SÍ se vigila**. Por eso queda excluida de la biyección de `cron-registro.test.ts` — con un test propio que verifica que ninguno se cuele como cron programado y que `esCronRetirado`/`esHeartbeatNoVigilable` no lo descarten (era el error que lo habría dejado sin vigilancia). Candado: `src/__tests__/lib/vigia-externo.test.ts` (32 casos: auth correcta→200, sin token/token malo/env ausente→401 y nunca 503, un cron roto→200 con el hallazgo en el cuerpo, ≥5→503, watchdog interno caído→503, lectura fallida→503, y el heartbeat mutuo en las dos direcciones).
> - ✅ **El slot de las 06:30 dejó de morirse: `confecciones_boston` salió del estadocuenta POR CRON** (`EMPRESAS_ESTADOCUENTA_FUERA_DE_CRON` en `switch-api/empresas.ts`, consumida por `empresasConEstadoCuentaEnCron()` en el route de switch-sync **y** en los pares de la reconciliación — eran los dos lugares que lo intentaban, 4 corridas muertas por día). Ahora `all-0630` solo hace american_classic (facturas+costo, segundos) y registra su heartbeat.
>   - **Por qué una lista aparte y NO `estadoCuenta: false`:** la capability dice "traemos sus saldos" y eso sigue siendo cierto — la pestaña de Boston lee las 1.067 filas ya cargadas, y el sync **manual** sigue aceptando la empresa (`universe` en el route no se tocó). Apagar la bandera desharía lo que aprobó el #347. La lista dice algo más chico y más honesto: *por cron, todavía no*.
>   - 🔴 **PENDIENTE, tarea aparte con aprobación — sus saldos siguen congelados desde el 28-jul 04:36.** Su universo real son **459 clientes con saldo abierto** (+326 con factura desde el 1-may), no 4.912 → consultar solo esos entra cómodo (~300 s). ⚠️ **El reconcile pone `saldo = 0` a TODA la empresa** por `synced_at < runStamp`, así que restringir el bucle exige excluir del reconcile a los clientes no consultados (mismo mecanismo que `failedClienteIds`); hacerlo mal pone en cero saldos buenos. **Partirlo en 8 tandas es PEOR: cada tanda zerearía lo que cargó la anterior.** Es ruta del DINERO + define qué clientes se refrescan (lógica de negocio) → no se toca sin decisión explícita.
>   - **Mientras esté en esa lista, la regla 1 NO lo vigila** (`empresasDe("cartera")` lo excluye): avisar todos los días de algo ya diagnosticado y sin acción posible es la alerta-que-suena-para-siempre. Al sacarlo de la lista vuelve a entrar solo.
>
> **Regla de espaciado (sesión única Switch por empresa):** crons que tocan la MISMA empresa en Switch van **≥15 min** separados (`SEPARACION_MINIMA_MIN` en cron-telemetry.ts; era 50 y bajó el 26-jul-2026 con las duraciones medidas bajo Pro: facturas 4-8 s/empresa, costo 1-2 s, y el route cierra sesiones con `/cierresesion` en su `finally`). Crons de empresas disjuntas pueden ir a la misma hora (patrón 05:30/05:35/05:40, y ventas ACS 17:00 junto a tommy-catalogo 17:00). **`src/__tests__/lib/cron-calendario.test.ts` recorre los 453 pares de `SWITCH_CRON_ENTRADAS` que comparten empresa y falla si alguien mete un choque** — es la red que protege el calendario a futuro.
>
> Ojo con los crons LARGOS, donde el margen real es menor que la distancia inicio-contra-inicio que mide el test: `estadocuenta` ~152 s/empresa (máx), catálogos —medidos el 12-ago-2026, tras el paralelismo del #540— **26 s (joybees) / 49 s (reebok) / 70 s (calvin) / 156 s (tommy)**, y la reconciliación hasta 740 s. Esas parejas se dejaron a ≥50 min a propósito. La más ajustada que queda es `acs-fidelizacion` 16:30 → ventas ACS 17:00 (30 min, y la de 16:30 es no-op si la de 11:30 salió bien). ✅ **El par de 20 min de `tommy-catalogo` 17:40 → reconciliación 18:00 DEJÓ DE EXISTIR** el 13-ago-2026: hoy son 60 min.
>
> ## 🔴 LOS 4 CATÁLOGOS CORREN DENTRO DE LA VENTANA DE USO — 4 pases entre las 9:30 a.m. y las 5:10 p.m. de Panamá (13-ago-2026)
>
> Daniel, textual: ***"se usa catalogo mas de 10am a 6pm aproximadamente"***. Con ese dato, el pase de las 6-7 a.m. **no le servía a nadie**: quien abría el catálogo a las 10 lo veía con 4 horas encima. **No son 4 pases nuevos: son los que había, REUBICADOS, más uno.**
>
> | Catálogo | Empresa | Panamá (UTC−5 fijo) | UTC | Duración |
> |---|---|---|---|---|
> | tommy | fashion_shoes | 9:30a · 12:00p · 2:40p · 4:55p | 14:30 · 17:00 · 19:40 · 21:55 | 156 s |
> | calvin | vistana | 9:35a · 12:05p · 2:45p · 5:00p | 14:35 · 17:05 · 19:45 · 22:00 | 70 s |
> | reebok | active_shoes | 9:40a · 12:10p · 2:50p · 5:05p | 14:40 · 17:10 · 19:50 · 22:05 | 49 s |
> | joybees | joystep | 9:45a · 12:15p · 2:55p · 5:10p | 14:45 · 17:15 · 19:55 · 22:10 | 26 s |
>
> - **Los minutos NO son decorativos.** Las únicas bandas libres con ≥15 min (`SEPARACION_MINIMA_MIN`) contra TODO cron que toque la misma empresa son **14:15-14:45 · 16:15-17:45 · 19:30-20:55 · 21:35-22:45** (los bordes los ponen: reconciliación 14:00/18:00, ventas 15:00/19:00/23:00, recibos 15:15/19:15 y estadocuenta 16:0x/21:1x). Los cuatro pases caen adentro con margen.
> - 🔴 **La banda de la mañana arranca a las 14:30 y no a las 14:15**, que la regla de los 15 min permitiría: la reconciliación de las 14:00 puede correr **740 s** y terminar 14:12. A las 14:15 quedarían 3 minutos de aire REAL contra un cron que abre la sesión de cualquier empresa; a las 14:30 son 18.
> - **El orden dentro de cada banda es por DURACIÓN, el más largo primero** (tommy → calvin → reebok → joybees). Los 5 min entre uno y otro **no los pide el test** —son cuatro empresas disjuntas— sino la base en compute Micro: es el mismo patrón de 05:30/05:35/05:40. Y por eso joybees va último: es el único que queda a los 15 min justos de las ventas de las 15:00, y dura 26 s (termina 14:45:26).
> - ⚠️ **LOS CICLOS DE RECUPERACIÓN CAMBIARON, y hay una pérdida que se dice de frente.** `COLATERAL_RECOVER_AFTER_HOUR_UTC` de los 4 subió de 12-13 a **15**, así que **la única pasada de `switch-reconciliacion` que los recupera es la de las 18:00** (el primer slot del día, 14:3x, cae DESPUÉS de la pasada de las 14:00). Consecuencia: **los pases de las 19:4x y 21:5x/22:1x NO se recuperan el mismo día si fallan.** Con 4 pases pesa menos —si falla el de las 19:40, el de las 21:55 lo tapa; si falla ése, el de las 14:30 de mañana—, pero es real. Por qué 15 y no 14: a las 14:00 el último success posible es el de ayer 21:5x, o sea 16h05 contra un ciclo de 16h35 — 30 min de margen, y cualquier recorte futuro del ciclo re-sincronizaría los CUATRO catálogos todos los días (el incidente del 25-jul-2026 exacto).
> - 🔴 **El hueco NOCTURNO pasa de ~19h a 16h35** (5:10 p.m. → 9:30 a.m. del día siguiente) **y NO despierta ninguna alerta, medido**: el umbral de heartbeat es `CRON_STALE_HOURS_DEFAULT` = 26 h (9h25 de margen, contra 7h de antes) y ningún catálogo tiene override propio; y la regla de "dato viejo" de 24 h (`datos-frescos.ts`) vigila **solo cartera y ventas**, nunca catálogos. Los dos hechos tienen candado.
> - **Costo:** +8 corridas/día (2 por catálogo) = **~600 s de función** y 8 sesiones más de Switch, serial y cerradas con `/cierresesion`. Los syncs de catálogo son UPSERT de lo que cambió, no reescritura: decenas de filas en una tarde normal.
> - **Candados:** `cron-calendario.test.ts` (la separación, sobre todos los pares), `cron-registro.test.ts` (la biyección con vercel.json) y `catalogo-ciclo-recovery.test.ts`, que suma **el invariante de las dos cotas del ciclo derivado del horario** (no de números sueltos), que **ningún pase quede fuera de la ventana de uso**, que solo la pasada de las 18:00 sea elegible, y que el hueco nocturno no dispare ni el heartbeat ni la regla de las 24 h. Verificado por mutación: bajar la hora mínima a 14 rompe 2, devolver un pase a las 6:30 a.m. rompe 5.
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

## 🔴 Catálogos — LAS ESCRITURAS QUE NO CAMBIAN NADA NO SE HACEN (14-ago-2026)

> Daniel lo autorizó con una condición textual: ***"solo si no me daña nada"***. **Lo único que cambia es CUÁNTAS escrituras se hacen: el `UPDATE` que guardaría exactamente el mismo valor que ya está en la base, no se hace.**
>
> 🩸 **EL DATO.** El sync de Tommy manda **455 UPDATE de a uno** por corrida (Reebok 127, Joybees 79→83, Calvin 79) y esas escrituras eran cerca de la mitad de su tiempo. Medido con `_verif-stock-concurrencia.ts`, que saca foto de las 5 tablas antes y después de cada corrida: **en las 5 vueltas previas al cambio, 1.228 filas y 17.672 campos → 🟢 IDÉNTICO**. O sea que las **744 escrituras de cada vuelta le escribían a la base exactamente lo que ya tenía.**
>
> ### ⛔ LO QUE NO SE HIZO, y es la mitad de por qué se pudo hacer
>
> En ese write path viven la **foto** (`image_url` / `foto_manual`), el **nombre editado** (`nombre_manual`), la **etiqueta** (`badge`), el **"ocultar"** (`oculto_manual`) y el **bulto** (`bulto_pzas`) — trabajo hecho A MANO que **no vuelve de Switch si se pierde**: 389 fotos de Tommy subidas una por una y 493 productos con foto.
> - **NO se agruparon las escrituras en lotes.** Un `upsert` mal armado se lleva puestas las fotos de 490 productos. *"Agrupar las escrituras es OTRO día"* sigue siendo cierto — y ya no hace falta.
> - **NO cambió QUÉ columnas escribe un UPDATE ni con qué valores.** El payload es el MISMO objeto de siempre; lo único que ganó es un nombre (`cambios`) para poder compararlo antes de mandarlo.
> - **NO se reordenó el write path**, ni se tocaron el read-all-then-write, el guard del barrido de páginas (#498), el guard de precios imposibles ni la regla de visibilidad.
> - **El `inventory` de Reebok se sigue escribiendo SIEMPRE**, aunque el producto no cambie: saber si ya tiene esa cantidad exigiría **leer** `inventory`, y eso sí sería una consulta nueva contra una base en compute Micro.
>
> **Comparar no cuesta una lectura extra** — eso se VERIFICÓ antes de avanzar: el motor ya hacía read-all-then-write. Lo único que se agregó son **columnas a la consulta que ya existía** (`existencia`, `disponibilidad`, `stock`, `category`, `gender`, `bulto_pzas`, `codigo_barra_id`): misma consulta, mismo viaje, más columnas. Cero consultas nuevas.
>
> ### 🩸 EL RIESGO REAL NO ES ESCRIBIR DE MÁS: ES NO ESCRIBIR NUNCA
>
> Si la comparación se equivoca diciendo "igual", se saltea el 100% y **el catálogo se congela sin un solo error** — el "cero silencioso" que este repo ya pagó. Tres cosas lo cubren:
> 1. **Comparación por tipo EXPLÍCITO** (`src/lib/switch-api/catalogo-igualdad.ts`, módulo PURO): `entero` / `monto` / `texto` / `booleano` declarados **columna por columna** contra el tipo REAL de la base. 🔴 `campoIgual` devuelve `true` **solo cuando puede PROBAR la igualdad**: columna sin declarar, columna que no se leyó o tipo inesperado ⇒ **se escribe**, o sea el comportamiento de ayer. Los pares que engañan están todos en el test: `0` vs `"0.00"` (iguales, es la misma plata) · `null` vs `""` (**DISTINTOS**) · `"10"` vs `10` (iguales en un entero) · `"Sandals "` vs `"Sandals"` (**DISTINTOS**: el write path escribe el texto tal cual). Los montos se comparan **al centavo con aritmética de texto**, no con `Math.round(n*100)` — en coma flotante `16.555*100` da `1655.4999…` y el precio no se saltearía nunca.
> 2. **Contadores POR CORRIDA**: `comparados` / `escrituras` / `sinCambios` en el resultado (y en el JSON de los 4 routes) y en **`switch_sync_log.skip_details`** con el campo `catalogo_escrituras`. **Sin DDL**: la columna ya existe y los guards de montos ya la usan con SU propio `campo`. `records_updated` y `records_skipped` **no cambiaron de significado** (siguen siendo procesados y ocultados).
> 3. **Guard de sanidad**: saltearse el **100%** queda registrado (`skip_details` + `console.warn`) y **NO falla cerrado, a propósito**: un catálogo que de verdad no se movió entre dos pasadas del mismo día es posible —Joybees son 83 artículos y las 4 pasadas están a 2-3 h—, así que tumbar la corrida sería estrenar la alerta que suena para siempre. Si esto sale todos los días en todos los catálogos, la comparación se rompió.
>
> Y el peor caso del acierto es benigno: si se saltea una actualización que hacía falta, los 4 catálogos corren **4×/día** y la siguiente la agarra. **No existe un camino donde esto borre una foto**, porque no cambia lo que hace una escritura.
>
> 🩸 **LA ESCALERA DE LECTURA, y por qué no alcanzaba el fallback que había.** El motor tenía UN fallback pre-migración: si el SELECT fallaba, se releía con `COLS_BASE` a secas. Con las columnas nuevas adentro, una que todavía no exista (`bulto_pzas` antes de su DDL) habría disparado ese fallback y se habría llevado puesto también **`nombre_manual`** — y sin `nombre_manual` el sync **PISA el nombre editado a mano**. O sea: una optimización de velocidad borrando trabajo manual, justo lo que este cambio no podía hacer. Ahora son **tres escalones** que quitan lo menos posible, y un error ajeno (permisos, red) se propaga como siempre.
>
> ### EL ANTES/DESPUÉS, en producción, 5 corridas de cada lado y MEDIANA
>
> | catálogo | UPDATE/corrida | antes | después | |
> |---|---:|---:|---:|---|
> | Joybees | 83 → **0** | 15 s | **8 s** | −47% |
> | Reebok | 127 → **0** | 53 s | **28 s** | −47% |
> | Calvin | 79 → **0** | 56 s | **57 s** | ~ |
> | Tommy | 455 → **0** | 87 s | **65 s** | −25% |
>
> Las 5 corridas una por una — antes (06:17-06:38 UTC, sobre `main`) y después (08:05-08:23, ya deployado):
> `antes` joybees 36·41·15·15·15 · reebok 41·38·64·53·63 · calvin 56·56·60·106·46 · tommy 77·84·87·109·116
> `después` joybees 8·28·7·22·7 · reebok 57·28·27·39·27 · calvin 47·106·57·47·90 · tommy 37·64·65·65·65
> - ⚠️ **Calvin no se mueve, y es lo esperado**: son 79 escrituras contra el barrido de las **164 páginas** de `vistana` (8.173 artículos), que es lo que se come su sync. Mismo motivo por el que casi no se movió cuando se subió `STOCK_CONCURRENCIA`.
> - ⚠️ **Tommy mejora menos que los ~50 s que se esperaban**: esa cifra salía de una medición de otro horario; en esta franja (01:00-03:30 a.m. Panamá) la base contesta más rápido y las 455 escrituras costaban ~22 s. Lo que sí mejoró mucho es la **dispersión**: de 77-116 s a 37-65 s, o sea que el peor caso —el que ve Daniel esperando en "Actualizar ahora"— se partió casi al medio.
>
> ### 🔴 La identidad, campo por campo — primera foto contra última
>
> La foto de las **06:17** (antes de todo, con el código viejo) contra la de las **08:23**, con **10 corridas de sync de por medio**: `joybees_products` 83 · `products` 284 · `inventory` 284 · `calvin_products` 80 · `tommy_products` 497 = **1.228 filas y 17.672 campos → 🟢 IDÉNTICO, cero cambios**, con las 493 fotos de Tommy y las 283 de Reebok en su lugar. `image_url`, `foto_manual`, el nombre, la etiqueta, `oculto_manual` y el bulto están **fuera** de la lista de movimiento legítimo del verificador: si alguno se hubiera movido, sería un fallo y no un resultado. En las 20 corridas el log dejó `escrituras=0 · sinCambios=744`.
>
> ### Candados
>
> `src/__tests__/lib/catalogo-sin-escrituras-iguales.test.ts` (51 casos). **Son de CONDUCTA, no de texto**: corren el motor REAL contra un Supabase simulado que **proyecta a las columnas pedidas** (como PostgREST) y miran los payloads exactos de cada escritura. Uno recorre las **4 marcas reales** y exige que toda columna del UPDATE esté declarada con su tipo **y** se lea en la misma consulta — si mañana alguien agrega una columna al write path y se olvida, ese catálogo vuelve a escribir siempre (seguro) y el test lo dice.
> - **Verificado por mutación, 14 de 14 cazadas** (`bash scripts/_mutar-candados-catalogo.sh`): `campoIgual` siempre true · "no la leí" = "es igual" · comparación laxa (`null` == `""` == `0`) · textos normalizados · montos en coma flotante · payload vacío = igual · el guard del 100% no marca · el motor no escribe nunca · el motor escribe siempre · la escalera pierde su escalón intermedio · los contadores no se registran · el inventario deja de escribirse · Tommy deja de declarar sus columnas · una columna del UPDATE sin tipo.
> - 🔴 **La prueba de que SÍ actualiza lo que cambió**: `MARCA=tommy DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_verif-catalogo-escribe-lo-que-cambio.ts` corre el motor REAL contra los **productos REALES de producción** y el **Switch REAL**, en `dryRun` (cero escrituras), dos veces: control y con **UNA** columna movida en la RESPUESTA de la lectura (no en la base). Medido el 14-ago-2026: **CONTROL 455 comparados · 0 escrituras · 455 sinCambios** · **MUTADO `T1XH343351800` disponibilidad 20→21 ⇒ 455 comparados · 1 escritura · 454 sinCambios**, y la base quedó **INTACTA** (`disponibilidad=20`). Un solo campo distinto ⇒ exactamente una escritura más.
>   - 🩸 **La primera corrida dio 🔴 y era EL SCRIPT, no el motor**: eligió `FW0FW06158-DW5`, un producto **inactivo**. El loop que compara solo recorre el set de `/stock` (= activos ∪ disponible≥1), así que mover una fila que no está ahí no produce ninguna escritura y el veredicto habría acusado al motor de algo que no hacía. Ahora elige un producto **activo**. Un verificador que miente en cualquiera de las dos direcciones es peor que no tenerlo.

## 🔴 Pedidos — EL CLIENTE SE ELIGE, NUNCA VIENE PUESTO (14-ago-2026)

> El checkout del catálogo nacía con **`Contado` PUESTO** y "Enviar a Switch" no exigía tocar nada: se armaba el pedido, se apretaba, y salía a nombre de Contado sin que nadie lo notara. Daniel, textual: ***"Que arranque vacío y el botón apagado hasta elegir cliente."***
>
> 🩸 **EL DATO, medido contra producción y reproducido al centavo** (`DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-pedidos-sin-cliente.ts`, solo lectura): **18 de 33 pedidos vivos (55%) sin cliente real · 15 ya confirmados y en Switch por $53.124**, ocho de $1.000 o más (TOM-002 $16.920 · TOM-017 $16.722 · TOM-003 $7.254 · PED-017 $2.760 · PED-006 $2.100 · CKP-005 $1.704 · TOM-001 $1.584 · PED-015 $1.560). **Ninguno era venta de mostrador**, y los 18 son INTERNOS — ni uno del link.
>
> ⚠️ **"Sin cliente real" son DOS formas del mismo olvido:** `cliente_switch_id` en NULL (4 pedidos) **o** apuntando al cliente de mostrador (14). Contar solo los NULL da 4 de 33 y esconde el problema.
>
> ### Las dos mitades del arreglo
>
> **1. El checkout arranca VACÍO.** `useState<Cliente | undefined>(undefined)`, la caja dice **"Elige el cliente"** en ámbar y el botón va apagado **diciendo qué falta** (*"Falta: elegir el cliente"*, el patrón de Guías: apagado Y explicado, no un toast por vez). 🔴 **Contado NO desaparece** — sigue primero en la lista, rotulado **"Contado (venta de mostrador)"** con todas las letras, pero hay que TOCARLO; dejó de decir "(default)" porque ya no lo es.
>
> **2. En el detalle el cliente es UNO SOLO.** Había DOS nombres que no se hablaban: el título era un `<input>` de texto libre con sugerencias y más abajo una caja aparte "Cliente de Switch" cuyo "Cambiar" NO tocaba el título. Medido: **PED-004 quedó con `client_name = "CITY MALL PASO CANOA"` y `cliente_switch_id = null`** — el nombre correcto en pantalla y NINGÚN cliente atrás. Ahora manda el picker: al elegir se guarda el cliente **y** se escribe el título (por `clientNameRef`, el mecanismo que este archivo ya usa para que el guardado nunca mande un valor viejo).
>
> ### ⚠️ LA EXCEPCIÓN REAL: EL LINK PÚBLICO, y no se rompe
>
> En un pedido del link no hay sesión que aporte cliente: la persona escribe su nombre a mano y el sistema le asigna el mostrador de la empresa (`publico-switch-actor`, código TCKCTA). **Eso es la regla del sistema, no un olvido** — medido: **PED-022 vive con `client_name = "Nathalie"` y `cliente_switch_id = 1`**. Ahí el texto libre se queda y el envío no se traba.
> - **El origen se mira por `origen_original` Y por `origen_short_id`**, nunca por uno solo: el primero solo viaja en el select base de **Reebok**, así que mirarlo solo dejaría a Joybees/Tommy/Calvin leyendo un pedido del link como interno y **cerrándole el campo al cliente**.
>
> ### 🔴 EL CANDADO QUE NO SE PUEDE SALTEAR VIVE EN EL SERVIDOR
>
> `handlePostEnvio` responde **422** si un pedido interno no tiene cliente. Hacía falta porque justo debajo hay **tres redes que INVENTAN un cliente cuando falta** (el fallback del piloto Reebok y `resolvePublicoSwitchActor`) — exactamente cómo los 15 pedidos se fueron a Switch. **Esas redes NO se retiran**: siguen sirviendo para el pedido del link, que es para lo que se hicieron.
> - ⚠️ **Un candado viejo CAMBIÓ DE DIRECCIÓN**: `catalogo-paridad-enviar-switch.test.ts` exigía que un pedido interno sin cliente cayera al Contado del piloto. **Eso ERA el agujero.** Ahora exige 422, y un test nuevo (con `origen_short_id`) prueba que el fallback sigue vivo para el link.
> - ⚠️ **Los `return` de guarda del NAVEGADOR son segunda capa y NO son verificables por mutación**: React no despacha el click de un botón deshabilitado ni forzándole `disabled = false` (medido). Está dicho así en el código; el candado es el del servidor.
>
> ### 🔴 CONTADO PASA A USAR EL ID REAL — y el destino NO se movió
>
> `null` significaba las DOS cosas a la vez ("elegí mostrador" / "nadie eligió"), y con esa ambigüedad no hay forma de exigir una elección deliberada. Ahora `GET /[marca]/clientes-switch` devuelve el `contado` de la empresa (código **TCKCTA**, el mismo que ya usa el link público) y elegirlo guarda un id.
> - **Verificado en las 4 empresas antes de mergear** (`scripts/_diag-contado-por-empresa.ts`, solo lectura): TCKCTA es **único** en cada una, **es el id 1 en las cuatro** (o sea que el cambio **no mueve el destino**, es idéntico al `1` escrito a mano), **no hay ningún otro cliente con nombre confundible** (0 candidatos), y las cuatro tienen facturación real de mostrador: `active_shoes "Contado"` 43 · `joystep "Contado"` 65 · `fashion_shoes "VENTAS LOCA"` 388 · `vistana "VENTAS"` 500 facturas.
> - 🩸 **La primera medición dijo "0 facturas" en las 4 y era EL SCRIPT**: preguntaba por `cliente_id`, columna que no existe (es `cliente_switch_id`), y devolvía 0 **sin error visible**. Un cero que parece un dato y no es ninguno.
> - **El mostrador se dice SIEMPRE con la misma frase** aunque en Switch cada empresa lo llame distinto: se toca "Contado (venta de mostrador)" y eso mismo se ve después. El nombre que viaja a Switch NO sale de ahí — lo lee el servidor del directorio.
> - **Efecto en las 4 marcas**: el picker es compartido, así que Reebok · Joybees · Tommy · Calvin se comportan igual. **Joybees sigue siendo espejo exacto de Reebok y no se tocó nada propio de Reebok.**
>
> ### Medición
>
> **Los 3 anchos (+ el iPad acostado), en el navegador contra el build de producción y con pedidos REALES** (`BASE=… node scripts/_medir-cliente-pedido-anchos.mjs`, solo lectura, 5 estados): **390 · 834 · 1024 · 1440 → las cajas del cliente dan 0 px de arrastre, 0 recorte, 0 táctil <44 y 0 texto <12px** en los 20 casos. El script **falla** si no encuentra "Elige el cliente", el "Falta:", el botón apagado o el nombre del pedido del link.
> - 🔴 **Los tocables <44px que quedan en el resto de la pantalla se COMPARARON contra `origin/main`** (`scripts/_medir-tactiles-comparar.mjs`, mismo script en las dos ramas): **main 42 · esta rama 39**, y la ÚNICA diferencia es que este cambio **quitó 3** (el input de texto libre del pedido interno). Todo lo demás —`← Catálogo`, `← Volver a Pedidos`, la `x` de quitar línea, `Eliminar pedido`, el precio por pieza y **los inputs de cantidad de 48×26 / 56×26**— está **idéntico en main: es PRE-EXISTENTE y NO se tocó** (Daniel no aprobó arreglarlo; los inputs de cantidad son el hallazgo conocido de Tommy/Calvin/Joybees).
> - 🩸 **Dos falsos hallazgos del MEDIDOR, no del producto:** `innerText` **no incluye el valor de un `<input>`**, así que acusaba al pedido del link de haber perdido "Nathalie" con el campo escrito; y el caso "pedido del link EDITABLE" **no se puede simular en el navegador** — al neutralizar el candado de Switch el autoguardado dispara un PUT, el SERVIDOR (que sí sabe que el pedido está en Switch) responde 409 y el candado vuelve. Se retiró del script y se dice de frente: ese caso lo cubre el candado de conducta. **En el estado REAL no sale ningún PUT, ni acá ni en main** (medido en las dos ramas).
>
> ### Candados
>
> `src/__tests__/components/pedido-cliente-obligatorio.test.tsx` (19) y `cliente-elegido.test.ts` (16). **Son de CONDUCTA**: renderizan las pantallas reales, tocan los botones reales y cuentan qué salió por `fetch` — el `disabled` y el `return` se pueden mutar sin cambiar una palabra del archivo.
> - **Verificado por mutación, 16 de 16 cazadas** (`bash scripts/_mutar-candados-cliente-pedido.sh`): el checkout vuelve a arrancar con Contado · el botón deja de exigir lo que falta · deja de decir qué falta · Contado vuelve a un id escrito a mano · el detalle deja mandar sin cliente · elegir cliente deja de escribir el título · vuelve el texto libre en los internos · el picker vuelve a preseleccionar el mostrador · **el SERVIDOR deja pasar un pedido sin cliente** · el servidor deja de leer el origen · el origen se mira solo por `origen_original` · el pedido del link se traba · `null` vuelve a contar como elegido · el selector ignora el mostrador real · las dos etiquetas.
> - 🩸 **LA PRIMERA CORRIDA DIO 16/16 **MINTIENDO**.** El script restauraba con `git checkout` y `cliente-elegido.ts` es un archivo NUEVO: git **aborta el comando entero** y no restaura NADA, así que las mutaciones se **apilaban** y ninguna se probó por separado. Con restauración por copia el resultado honesto fue **13/16**, y las 3 brechas se cerraron (una era un barrido de texto cuyo regex no matcheaba nunca). **Un verificador que miente en verde es peor que no tenerlo.**
>
> ### 🔴 Lo que NO se tocó
>
> El flujo de ~10 toques a 3 (#504/#506/#508/#509) · **Duplicar sigue preguntando el cliente y agregándolo DE UNA, sin botón de confirmar** · el modo pedido `?agregarA=` · **los 15 pedidos que ya están en Switch NO se corrigen desde acá** (es data en Switch y la decide Daniel aparte) · y nada más del informe de auditoría (precio por pieza/bulto, ITBMS, cantidad escribible en el catálogo público, renombrar los productos de Tommy).

## 🔴 Comisiones — FASHION GROUP SON SEIS EMPRESAS, y Multifashion es OTRO módulo (14-ago-2026)

> Daniel, textual: ***"joystep sí debe de tener comisiones al 0.5%"***, y después, para cortar el enredo de raíz: ***"joystep mismo criterio que las otras de fashion group. multifashion es otro módulo de comisiones, ese ya está bien. me explico? no quiero que te enrredes aquí, ponlo en md."***
>
> ### 1. Las SEIS empresas de Fashion Group comisionan igual
>
> `vistana · fashion_wear · fashion_shoes · active_shoes · active_wear · joystep` — **las seis**, con la MISMA función (`comision_b2b_v5`) y los mismos argumentos. **Joystep no es un caso especial: es la sexta empresa del mismo módulo.**
>
> 🔴 **SOBRE QUÉ SE APLICA EL %, porque es fácil decirlo mal:** sobre la **VENTA** (`subtotal_con_descuento`). **La utilidad NO es la base: es el CRITERIO de entrada** — solo comisionan las facturas con `pct_utilidad > 20`, y **las notas de crédito RESTAN**. Está en la línea 53 de `20260703120000_comision_b2b_v5_vendedor_factura.sql`. Decir *"comisionan sobre utilidad"* es incorrecto y ya se dijo mal una vez.
>
> **Reglas duras que joystep hereda sin excepción:** las **retenciones NO comisionan** (`r.es_retencion = false`) y **`TCKCTA` (mostrador) queda fuera de la base de cobro**. La RPC **no conoce a joystep**: es la misma función para las seis, así que entrar a la matriz no puede mover a las otras cinco.
>
> ### 2. La tasa de joystep es 0,5% — y NO se escribió una sola fila
>
> `comision_b2b_v5` ya aplica `COALESCE(t.tasa_venta, 0.0050)` a todo vendedor **sin fila propia** en `comision_vendedor_tasa`. O sea que el 0,5% **ya era el default del cálculo**: entrando a la matriz, joystep lo hereda sin tocar la tabla. **`comision_vendedor_tasa` NO se tocó.**
>
> ⚠️ **La tasa es GLOBAL por vendedor, no por empresa** — por eso escribirla habría sido peligroso: la misma fila la usan todas las empresas donde esa persona trabaja. Así conviven Edwin al 0,5% y Reinaldo al 1%. **Cambiarle la tasa a alguien para "poner joystep en 0,5%" le movería la comisión en las otras empresas.**
>
> 🔴 **Joystep tiene DOS vendedores y ninguno de los dos es una persona que cobre hoy:** `DEFAULT` (el centinela "cliente sin dueño", sin fila de tasa → 0,5% por default, y es de donde sale TODO el dinero) y `DANIEL LEVY` (**tasa propia 1%, compartida con vistana**, con base **$0,00 en los tres meses medidos**). En pantalla, lo de `DEFAULT` se muestra en la fila **"Sin asignar"**, igual que en las otras cinco — no es una anomalía de joystep: `active_wear` de mayo-2026 tiene $1.259,04 y son 100% DEFAULT.
>
> **Medido contra producción (14-ago-2026):** julio **$56,33** · junio **$18,83** · mayo **$50,13**. El de julio **coincide exacto** con lo que midió la auditoría. La fórmula de Multifashion sobre los mismos datos habría dado $21,55 — **no es la de acá**.
>
> ### 3. 🔴 MULTIFASHION ES OTRO MÓDULO Y ESTÁ BIEN COMO ESTÁ — NO FUSIONAR
>
> Multifashion (`american_classic`) comisiona con **OTRA base**: `SUM(subtotal firmado) × 0.5%`. **No es `comision_b2b_v5` y no debe serlo.**
>
> **Que los dos digan "0,5%" es una COINCIDENCIA, no una relación.** Uno es 0,5% de la venta de las facturas que superan el 20% de utilidad; el otro es 0,5% del subtotal firmado, sin filtro de utilidad. **Sobre los mismos datos dan números distintos.** No compartir código entre los dos, no unificar las listas de empresas, no tocar un archivo de Multifashion para "arreglar" comisiones de Fashion Group. Este párrafo existe porque Daniel pidió que quedara escrito ANTES de que alguien lo intente.
>
> ### Por qué joystep estaba afuera, y qué lo cambió
>
> `EMPRESAS_COMISIONAN` (`src/lib/comisiones/empresas.ts`) restaba joystep **a propósito y documentado** (*"Joystep tiene CXC pero NO comisiona"*). Era un olvido con el mismo perfil que el de recibos y utilidad: **los insumos estaban COMPLETOS desde siempre** —`switch_factura_utilidad` y `switch_recibos` con datos, la RPC devolviendo cifras correctas— y **nadie los veía porque la empresa no se dibujaba**. Es el precedente exacto de este repo: cuando joystep se activó en recibos y utilidad aparecieron **$15.262,00 de cobros de julio invisibles** que llevaban meses sin contarse. **Lo que no se dibuja, no se cuenta.**
>
> ### 🔑 La lista se DERIVA, y había una CUARTA copia escrita a mano
>
> `EMPRESAS_COMISIONAN = B2B_EMPRESA_KEYS` — sin `.filter`, nunca escrita a mano. El módulo existe justamente para que la lista viva en un solo lugar, y aun así **`ComisionesView.tsx` tenía su propia línea** `B2B_EMPRESA_KEYS.filter((k) => k !== "joystep")` mientras las otras tres ya leían la constante. Alimentaba el banner **"Sincronizado"**: al entrar joystep a la matriz, las tablas lo habrían mostrado y el vigía de frescura habría seguido sin mirarlo. Ya no.
>
> ⚠️ El prop `empresas` de `ComisionesTarjetas.tsx` pasó a `readonly string[]`: la lista viene de un `as const` y esas tarjetas solo la RECORREN.
>
> ### La prueba de que las otras cinco no se movieron un centavo
>
> `node scripts/_verif-joystep-no-mueve-las-otras.mjs` (**solo lectura**) corre la MISMA aritmética que `ComisionesConsolidadoView` —el pivot por vendedor y el descuento restado de LA CELDA de su empresa— sobre datos REALES, dos veces: con la lista de 5 y con la de 6, y compara **celda por celda**. Medido: **93 celdas, 0 distintas**.
>
> | período | grupo antes → después | joystep aporta | Sin asignar |
> |---|---|---:|---|
> | 2026-07 | $11.394,57 → **$11.450,90** | $56,33 | $245,75 → $302,08 |
> | 2026-06 | $10.086,82 → **$10.105,65** | $18,83 | $1.197,44 → $1.216,27 |
> | 2026-05 | $14.340,89 → **$14.391,02** | $50,13 | $1.639,26 → $1.689,39 |
>
> El total del grupo sube **exactamente** lo de joystep, y **todo cae en "Sin asignar"**: ninguna persona que cobra cambió de número.
>
> **Los 3 anchos (+ los dos iPad acostados), en el navegador contra el build de producción y con datos de producción** (`BASE=… COOKIE_FILE=… node scripts/_medir-comisiones-tabla.mjs`, solo lectura, nunca toca "Actualizar ahora" ni "Excel"): **390 · 834 · 1024 · 1180 · 1440 → 0 px de arrastre de página, 0 px de arrastre interno, 0 px de recorte**, en los dos modos (Todas / Por empresa), y **0 tocables bajo 44 px y 0 textos bajo 12 px**. La 6ª columna **no ensanchó nada**: en celular y iPad la vista ya es de **tarjetas** (`ComisionesTarjetas.tsx`, la tabla va `hidden`), y ahí joystep entra como una fila más que crece **hacia abajo**.
>
> ### Candados
>
> `src/__tests__/lib/comisiones-joystep-entra.test.ts` (15). Son de **CONDUCTA**: llaman a los handlers REALES de `/api/ventas/comisiones/consolidado` y `/api/ventas/comisiones` con supabase mockeado y **cuentan qué RPC salió de verdad** — que la lista contenga "joystep" no prueba que el endpoint lo pida. El barrido de texto que queda **borra los comentarios primero**: este repo ya pagó cuatro veces el candado que se cumple con su propia explicación.
> - **Verificado por mutación, 6 de 6 cazadas:** volver a restar joystep en `empresas.ts` (5 tests) · devolver el filtro a mano en `ComisionesView.tsx` (1) · el punto decimal mal en la RPC, `0.0050 → 0.5` (1) · un caso especial por empresa dentro de la RPC (1) · quitarle el guard de retenciones (1) · sacar joystep del consolidado (2).
> - El candado viejo de `comisiones-consolidado-neto.test.ts` exigía un `.filter` en `empresas.ts` — **era el candado el que fijaba el bug**. Pasó a exigir lo que siempre quiso decir: que la lista se DERIVE de `B2B_EMPRESA_KEYS`, y suma `ComisionesView.tsx` a los archivos vigilados.

## Catálogos — auto-recorte del fondo al subir (12-ago-2026)

> **Las fotos del banco B2B de PVH vienen con el producto CHICO abajo y un fondo enorme; en la tarjeta se ven diminutas al lado de las buenas.** Caso real de Daniel: `HW0HW02958AEF.jpg`, **1364×1819**, una sandalia que ocupa el **9% del área** y el resto es fondo gris en degradado. Fuente única: **`src/lib/catalogos/foto-recorte.ts`** — núcleo PURO (fondo, caja, guardas, plan de encuadre) + un envoltorio de canvas que solo dibuja lo que el plan ya decidió.
>
> **Entra en el pipeline COMPARTIDO de las 4 marcas**, en los dos caminos: `compress()` de `photoUpload.ts` (subida individual y masiva) y `recortarYEncuadrar()` de `zip-b2b-client.ts` (ZIP del banco). Después sigue la compresión de siempre (1600 px, JPEG 0.82).
>
> 🔴 **FAIL-OPEN, y es la regla que manda: el recorte NUNCA puede bloquear ni limitar una subida.** Ante cualquier duda se sube LA ORIGINAL sin tocar. Cinco motivos, cada uno con su nombre en `MotivoNoRecorte`: `muy-chica` (lado menor < 300 px) · `fondo-no-uniforme` · `sin-producto` · `toca-bordes` (los 4) · `ya-encuadrada` (la caja ya llena ≥85% de ancho **y** alto). Dos capas más: `recortarEnCanvas` atrapa CUALQUIER excepción y devuelve `null`, y el `catch` de `compress()` devuelve el archivo original.
> - 🩸 **Fail-open no es solo "no revientes".** Una foto que el detector prefirió no tocar tiene que seguir **comprimiéndose a 1600 como antes**. Un `return file` metido entre el recorte y el resize se ve inofensivo (sube la original) y en realidad subiría fotos de 5 MB sin comprimir a todo el catálogo — **esa mutación sobrevivía a los candados y por eso existe el test que exige que el resize sea ALCANZABLE**, no solo que el texto esté en el archivo.
> - **Daniel preguntó explícitamente si esto tocaría las fotos normales.** No: solo entra cuando el fondo es uniforme **Y** el producto ocupa una parte chica. `ya-encuadrada` es lo que protege a las buenas de un re-encode que solo pierde calidad.
>
> 🩸 **Por qué no alcanzaba `detectarBBox` de `fotos-b2b.ts`** (el detector que el ZIP ya usaba): estima el fondo como el promedio de las 4 esquinas con tolerancia fija 12, y el fondo de estudio de PVH es un **degradado vertical** — las puntas difieren del promedio en más de 12, TODO el fondo se marca como producto, la caja da la imagen entera y el recorte es un **no-op**. Acá el fondo se estima **POR FILA** (banda izquierda + banda derecha, interpolado a lo ancho), que absorbe el degradado vertical **y** el horizontal sin inventar nada. El ZIP prueba primero `medirRecorte` y **cae al detector de siempre** si no es confiable.
>
> **Cómo distingue un fondo de estudio de una foto de local: la RUGOSIDAD del borde**, no su rango. `rugosidadBorde` = promedio de |Δ luminancia| entre píxeles CONSECUTIVOS recorriendo el borde como un camino continuo. Un degradado de estudio da **<1,5** (cambia suave aunque el rango sea grande); una escena da 8-40. El umbral es **4**. `RANGO_BORDE_MAX = 230` es un techo de SANIDAD, no el detector: medido sobre las 33 fotos reales del banco CK, un producto oscuro que asoma al borde sobre fondo blanco llega a **190-215** con rugosidad baja — un rango apretado habría rechazado fotos buenas.
>
> **El encuadre no distorsiona ni agranda:** margen PAREJO de **8%** del lado mayor de la caja en los 4 lados, **una sola escala** para ancho y alto (mirar solo el ancho dejaba salir lienzos de 2320 px de alto), techo 1600. El margen sale de la FOTO REAL —conserva el degradado, sin costuras— y solo lo que se pasa del límite se rellena con el color promedio del borde.
>
> **Medido sobre las 33 fotos reales de `Downloads/CK 2`** (`DIR=… OUT=… npx tsx scripts/_test-recorte-local.ts`, no toca red ni DB): **33/33 recortadas, ocupación previa 8%–35%**. Ninguna cayó en el fail-open porque ninguna era dudosa — no es que el detector sea permisivo. Antes/después en `~/.claude/jobs/5b66fe8c/tmp/recorte-antes-despues/` (`index.html`).
>
> **Re-proceso de las fotos YA subidas: `npx tsx scripts/_recortar-fotos-calvin.ts [--confirm]`** (dry-run por defecto). ⚠️ **SOLO CALVIN** — la tabla y el prefijo van FIJOS, sin parámetro de marca a propósito: Tommy/Reebok/Joybees ya están curadas a mano. Criterio: el MISMO módulo puro, y solo si la caja ocupa menos de **`OCUPACION_REPROCESO` = 50%** del área. Respalda cada original antes de escribir (si el backup falla, esa foto NO se toca), re-sube al MISMO path —la URL no cambia— **renovando el `?v=`** (sin eso, con `cacheControl` de 1 año el navegador seguiría mostrando los bytes viejos y el arreglo sería invisible), y **verifica por HTTP** (200, `image/*`, >5 KB, y que el producto ahora llene ≥70% de la dimensión que manda).
>
> Candado: `src/__tests__/lib/foto-recorte.test.ts` (25 casos con imágenes SINTÉTICAS píxel a píxel — producto abajo sobre degradado → recorta; centrado/lleno → no toca; toca los 4 bordes → no toca; fondo ruidoso → no toca; casi del color del fondo → no toca). Verificado por mutación, **10 de 10 cazadas**: quitar el `catch` de `recortarEnCanvas`, apagar cualquiera de los 4 guards, romper el fail-open de `compress`, saltarse la compresión cuando no hay recorte, que el ZIP deje de caer al detector de siempre, margen desparejo y escala por eje (distorsión).

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
> - **Paginado obligatorio** (`leerTodoPaginado`, orden por `sku`): hoy son 490 filas, pero un aviso ciego a partir del producto 1.001 sin error ni señal es el bug de `db-max-rows` que este proyecto ya pagó. ✅ **`fotos-resumen.ts` (resumen semanal) TAMBIÉN pagina desde el 12-ago-2026.** Tenía el mismo bug latente: hoy la marca más grande es Tommy con 453 activos, pero desde la fila 1.001 el aviso diría *"faltan N fotos"* quedándose corto, sin error y sin señal — **un aviso que subestima es peor que no tenerlo**. 🔴 **EL ORDEN DE NEGOCIO SE CONSERVA**: sigue mandando `disponibilidad` desc (lo más vendible primero, que es lo que se lee en el Telegram) y solo se le agrega `sku` como DESEMPATE — es `text UNIQUE NOT NULL` en las cuatro tablas, así que el orden queda total. Ningún número cambió: las 4 marcas están muy por debajo de 1.000 (products 126 activos · joybees 81 · tommy 453 · calvin 80).
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
> - **El selector ya no deja un control muerto — y el primer intento NO alcanzó.** Daniel, con captura del producto `THS10159C000`: *"no me deberia de salir el boton de Cambiar foto si no hay opciones"*. El botón se pintaba con solo **EXISTIR** la carpeta `_v/{sku}/`, y tras la limpieza esa carpeta conserva UN archivo: **justamente la foto elegida**. Resultado: botón visible → clic → *"Este código no tiene más fotos guardadas"*. Enterarse DESPUÉS de tocar es exactamente lo que se quería evitar.
>   - **La pregunta correcta no es "¿hay carpeta?" ni "¿hay fotos?", es "¿hay alguna foto que NO sea la puesta?"** — `tieneAlternativas` / `contarAlternativas` en `variantes-paths.ts` (puras), alimentadas por el `image_url` que la pantalla YA tiene. El botón ahora dice cuántas hay: `Cambiar foto (2)`.
>   - ⚠️ **El costo era la trampa: saberlo exige el CONTENIDO de cada carpeta, y un `list()` por SKU serían 383 llamadas por carga de pantalla** — los metadatos de Storage viven en el mismo Postgres del negocio. Se resolvió con **`list-v2` + `delimiter: ""`**, que devuelve rutas completas de forma **recursiva**: todo el banco de una marca en **1 llamada** (Tommy: 383 objetos, 1 página, ~230 ms). **Mismo costo que el listado de carpetas que reemplaza.** No está en supabase-js: se llama por REST con las credenciales del MISMO client de la marca (`db.supabaseKey` + `db.storage.url`), nunca leyendo env aparte. Si `list-v2` fallara, se degrada al listado de carpetas con `exacto:false` y el cliente vuelve al comportamiento viejo (mostrar el botón) — **ante la duda se muestra de más, nunca se esconde una función que sirve**.
>   - **Verificado en el navegador contra el build de producción y datos de producción:** Tommy real → **0 botones en los 490 productos** (469 fotos renderizadas, así que el 0 no es "no cargó"); el mismo Tommy con el banco **como estaba antes de la limpieza** → aparece **1 botón, `Cambiar foto (2)`** en `THS10159C000` (vistas 1/6/13 menos la puesta). **Reebok y Joybees NUNCA tuvieron banco** (0 carpetas en `_v/`, medido) → ahí el botón tampoco se pinta, y no se les quitó nada: el control ya estaba muerto para ellas.
>   - ⚠️ **Hoy NO existe en producción ningún producto con alternativas** (Tommy quedó sin banco por decisión de Daniel; Reebok/Joybees nunca lo tuvieron). Por eso el caso positivo se verifica sirviéndole a la pantalla la forma exacta que tenía el banco antes de la limpieza, no inventando datos.
>   - Candado: 9 casos nuevos en `variantes-fotos.test.ts`, incluido el caso real `THS10159C000` (1 foto y ES la puesta → 0 alternativas) y que Reebok/Joybees conserven el botón cuando sí hay banco.
> - ⚠️ **Volver a tener alternativas = volver a subir el ZIP del B2B.** No hay vuelta atrás para las 2.157.

## Marketing › Mobiliario — piezas, bultos y la nota de entrega (8-ago-2026)

> 🔴 **EL INVENTARIO SE DESCUENTA EN PIEZAS. LOS BULTOS SON SÓLO CÓMO VIAJÓ LA MERCANCÍA.** Daniel, textual: *"puedo mandar 30 norte colgador en 1 bulto. o 20 norte colgador en un bulto"* — o sea que **el bulto es VARIABLE y NO hay conversión fija**. No existe, y no debe existir nunca, una tabla de "piezas por bulto". Son dos números independientes por renglón: `Norte colgador · 150 piezas en 5 bultos`.
>
> Fuente única: **`src/lib/marketing/piezas-bultos.ts`** (módulo PURO), usado por el servidor (`inventario.ts`, `entrega-comprobante.ts`), por el papel (`pdf-entrega-mueble.ts`) y por la pantalla (`EntregaForm`, `EntregasSection`) — el número que descuenta el stock y el texto que lee Daniel salen del MISMO lugar. La única función que puede tocar el inventario se llama `piezasParaStock()` y recibe el renglón ENTERO, bultos incluidos, para dejar escrito en la firma misma que teniendo los dos delante se elige piezas.
>
> **Por qué importa tanto:** descontar bultos sacaría **5** unidades del inventario donde salieron **150**, y nadie lo notaría hasta que el conteo físico no diera. Candado: `src/__tests__/lib/marketing-piezas-bultos.test.ts` — comportamiento + **barrido estático** que pone el build ROJO si `bultos` aparece en la aritmética de stock de `inventario.ts` o si alguien escribe una conversión (`piezasDeBultos`, `PIEZAS_POR_BULTO`, `bultos * cantidad`…). Verificado por mutación: hacer que `piezasParaStock` devuelva bultos rompe 9 tests.
>
> **Los bultos son OPCIONALES y `null` ≠ 0.** En blanco significa "no se anotó" y se muestra vacío, nunca como cero (un cero diría "viajó en cero bultos", que es falso). Las 21 entregas que ya existen no tienen el dato y no se les inventa uno.
>
> **El stock puede quedar NEGATIVO, con aviso.** Decisión explícita de Daniel: *"negativo"*. La entrega **no se bloquea**; `EntregaForm` avisa en pantalla y deja pasar. Un stock negativo es un dato real (entregó más de lo que tenía cargado) y esconderlo sería peor. Medido en producción hoy: `Barra plana` está en **−95** y `Norte colgador` en **−16**.
>
> **Editar y borrar DEVUELVEN el stock, y ejecutar dos veces no cuenta dos veces.** `updateEntrega` calcula un **delta** contra los renglones ya guardados (bajar de 150 a 100 devuelve 50; guardar lo mismo dos veces da delta 0) y `deleteEntrega` lee los renglones **antes** del DELETE —después del CASCADE la lista vendría vacía y la mercancía se perdería en silencio— así que un segundo borrado no encuentra nada y es no-op. Candado: `src/__tests__/lib/marketing-stock-piezas.test.ts` (17 casos contra un doble EN MEMORIA de PostgREST que ejecuta `inventario.ts` de verdad, con CASCADE incluido). Verificado por mutación: quitar la devolución al borrar rompe 5, dejar de usar el delta al editar rompe 7.
>
> **La NOTA DE ENTREGA lleva foto y sirve para las dos cosas: compartir e imprimir.** Daniel: *"es como un pedido para un cliente"*, *"en la nota de entrega que vaya con foto"*. El generador sigue siendo UNO (`pdf-entrega-mueble.ts`): la ruta del servidor (el link del Excel del ZIP) y los botones de la pantalla dibujan el mismo papel. La columna "Cantidad" pasó a llamarse **"Piezas"** y se agregó **"Bultos"** al lado; sin bultos anotados la celda va vacía.
> - 🩸 **El PDF se arma ANTES del clic, no dentro.** Safari en iOS sólo abre la hoja de compartir dentro del gesto del toque; ir al servidor a buscar el papel en ese momento lo bloquea con `NotAllowedError` (ver `src/lib/compartir-archivo.ts`). Por eso existe **`GET /api/marketing/entregas-pdf/[id]/datos`**: `NotaEntregaAcciones` pide los datos al desplegar la entrega y, al tocar, sólo dibuja —que es sincrónico—. Mientras no estén, los botones dicen "Preparando…" y no se pueden tocar.
> - **"Imprimir" reemplaza al viejo "Ver comprobante" sin perder nada:** abre el MISMO PDF en una pestaña, con el diálogo de impresión ya lanzado (`autoPrint`). Si el navegador bloquea la pestaña, el archivo se descarga.
> - **Las fotos se bajan UNA VEZ POR PRODUCTO y por lote** (el ZIP global son 21 entregas sobre los mismos 5 muebles) y se comprimen en el navegador antes de subirlas (`compressImage` de Reclamos, ~1600 px JPEG). Medido con datos de producción: nota de 5 renglones con foto = **34,4 KB** (jsPDF deduplica la imagen repetida), o sea perfectamente compartible por WhatsApp. Tope de sanidad de 1,5 MB por foto: pasarse deja ese renglón sin foto y el resto del papel idéntico.
>
> 🔴 **`mk_mobiliario_notas_proveedor` (el bloque "Notas del proveedor") queda SEPARADO del inventario. NO FUSIONAR.** Son los mismos productos físicos con precios distintos **a propósito** — Daniel: *"un precio es lo que reporto en marketing en proyectos y otro lo que me costó"*: el **costo del proveedor** contra el **precio que le reporta a las marcas**. Ese bloque es **solo admin** y **no suma en ningún total**, y sigue así. Las fotos también van aparte: `mk_inventario_productos.foto_path` es la foto del mueble que se entrega (y sale en la nota); `mk_mobiliario_notas_proveedor.foto_paths` es la libreta de costos.
>
> ⚠️ **DDL PENDIENTE — `supabase/migrations/20260808160000_mk_mobiliario_bultos_y_foto.sql`, la corre Daniel A MANO.** Agrega `mk_entrega_items.bultos` y `mk_inventario_productos.foto_path`. **La pantalla funciona ANTES de que corra** (patrón `cols-opcionales`): las entregas se guardan sin bultos, los productos se guardan sin foto, las lecturas se reintentan sin la columna y el modal de producto **avisa con todas las letras** si la foto no se pudo guardar. Verificado contra producción con la migración SIN correr: la nota de entrega sale entera y el stock se descuenta igual.
> - ⚠️ **También sigue sin correr `20260730120000_mk_entregas_muebles_numero.sql`** (medido el 8-ago: `numero` viene `null` y el comprobante cae al número derivado del uuid, `ME-E8CC66DD` en vez de `ME-0001`). Es un pendiente ANTERIOR a este cambio, no un efecto suyo.
>
> **Medición de los 3 anchos** (`BASE=… node scripts/_medir-mobiliario-piezas-bultos.mjs`, solo lectura): **390 · 834 · 1440 → 0 arrastre y 0 recortado** en Mobiliario (lista y modal de producto) y en el formulario de entrega, con todos los controles nuevos ≥44 px. Quedan dos desbordes en el detalle del proyecto —5 px a 390 dentro del scroller de la tabla y 15 px a 834 en la tira de navegación de `/marketing`— **medidos IDÉNTICOS contra `origin/main`: son PRE-EXISTENTES**, no los trajo este cambio.
>
> Verificaciones read-only contra producción: `DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_verif-foto-nota-entrega.ts` (la foto firma, baja y es una imagen de verdad: 200, `image/jpeg`, 15,4 KB, magic JPEG) y `…/_verif-nota-entrega-con-fotos.ts` (las 5 fotos se DIBUJAN en el papel — se cuentan las colocaciones `/I<n> Do`, no los XObject, porque jsPDF deduplica imágenes idénticas).

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

> ## 🔔 SOLO 3 ALERTAS DE SISTEMA — todo lo demás se calla (30-jul-2026, aprobado por Daniel)
>
> Daniel fijó la lista cerrada. **Si un aviso no entra en una de estas 3 categorías, no se manda.**
>
> | # | Alerta | Regla exacta | Dónde vive |
> |---|---|---|---|
> | 1 | **"Un dato que mirás está viejo"** | la **cartera** o las **ventas** llevan **+24 h** sin actualizarse | `src/lib/datos-frescos.ts` → `checkDatosViejos()` en switch-reconciliacion |
> | 2 | **"Algo se rompió y no se arregló solo"** | **2 fallos seguidos** del mismo par `(empresa, sync_type)` | `alert-policy.ts` (PR #345) — **se reusa, NO se duplica** |
> | 3 | **"La base está en problemas de verdad"** | **+80 % de memoria usada** (= <20 % disponible) | `db-recursos.ts` |
> | 4 | **"El reloj de asistencia tiene un hueco que ya no entra solo"** | lo último traído del reloj quedó **más viejo que los 15 días** que el agente recupera solo (`VENTANA_RECUPERACION_DIAS`); UN aviso por episodio (candado `hueco_alertado_en`) + "ya se arregló" al cerrarse | `asistencia/agente.ts` → chequeo 2 del vigía `asistencia-vigia` |
>
> **La 4ª la pidió Daniel explícitamente el 12-ago-2026** — textual: *"ok lo corro pero si pasa mas de 15 dias que me llegue notificacion a telegram alertas para saber q hay q arreglarlo"*. La lista sigue siendo CERRADA: se sumó esta porque él la aprobó, no porque la política se haya aflojado. El umbral se DERIVA de la constante del agente (`DIAS_RECUPERACION_AGENTE` espejo de `VENTANA_RECUPERACION_DIAS_DEFAULT`, candado en `asistencia-vigia-hueco.test.ts`); DDL aditiva `20260812130000_asistencia_hueco_alertado.sql` (la corre Daniel a mano; sin ella el vigía degrada limpio y no avisa).
>
> **Las 24 h son de Daniel** (mi propuesta eran 12). Es más estricto que las 26 h del indicador `SyncStatus` de la app, y a propósito: esas 26 h se dimensionaron cuando los syncs corrían 1×/día bajo Hobby; hoy las ventas van 8×/día y la cartera 6-7×/día. Entre 24 h y 26 h hay una ventana donde la alerta suena y la pantalla todavía dice "al día" — se prefiere el aviso antes que después.
>
> **QUÉ SE ELIMINÓ, y por qué cada uno:**
> - ⛔ **El watchdog de heartbeats de cron ya NO manda Telegram.** Era `"Una tarea automática lleva más de un día sin completarse. Detalle: switch-sync:all-0630"`. Medía el MECANISMO, no el resultado, y erraba en las dos direcciones: mandó ese mensaje el **27, 28 y 29 de julio** mientras las ventas de american_classic de ese mismísimo run entraban bien (06:31:23); y al revés, un sync que corre y no trae nada deja el heartbeat fresco y el dato viejo pasa inadvertido. `checkStaleCrons()` **sigue calculando** (entra en el JSON de la respuesta y en los logs, y health-crons lo sigue publicando en `stale[]`) — lo único que se quitó es el `enviarSistema`. **El fantasma de `all-0630` y cualquier heartbeat huérfano dejan de avisar por construcción**, sin necesidad de una lista de excepciones.
> - ⛔ **El swap dejó de alertar del todo.** Era el `🟡 Memoria de emergencia en uso: 42%` que llegó **3 veces** (28, 29 y 30-jul) con la base sana. Subir el umbral a 70/85 no alcanzaba: el swap usado es una **marca de marea pegajosa** (13,5 % → 40,3 % en 3 días sin incidentes), así que cualquier umbral sobre él acaba sonando para siempre. Se sigue MIDIENDO y se muestra como contexto en el bloque de estado, pero no genera hallazgos. **Costo de quitarlo: cero** — el episodio real del 26-jul tenía memoria al 4 % y carga 6×/núcleo, y se detecta igual (test `la caída del 26-jul se habría detectado antes de los 521`, ahora con hallazgos `["carga","memoria"]`).
> - ⛔ **`db-salud` bajó de 11 entradas de cron a 5** (64 → 58 crons en total). Las 11 se dimensionaron para cazar una caída corta (la del 26-jul duró 76 min), no para el umbral de recursos. Ya no hacen falta: **(a)** lo que queda vigilando la memoria es un umbral SOSTENIDO, que no se detecta mejor mirándolo 11 veces que 5; **(b)** la detección de "la base no responde" la cubre el **vigía externo, que llama cada HORA** desde afuera y devuelve 503 cuando no puede leer `cron_heartbeats` — más denso que cualquier cron nuestro y, a diferencia de db-salud, sin vivir dentro del sistema que vigila. Quedan 01:45 / 07:25 / 12:25 / 16:45 / 21:45 UTC (hueco máximo 5 h 40).
>
> **Lo que NO se tocó:** 📊 **NEGOCIO** sigue intacto y sin perillas (*"ES SUPER IMPORTANTE ESAS"*) — ventas del día, pedidos, guías, cheques por vencer, fotos faltantes, costo sospechoso. Estas 3 reglas son SOLO del canal 🔧 SISTEMA.
>
> **Candados:** `src/__tests__/lib/datos-viejos.test.ts` (17 casos) y `db-recursos.test.ts`. El primero incluye el que más importa: **`confecciones_boston` NO puede entrar en el universo de cartera** — con `estadoCuenta:true` y su sync roto, sonaría todos los días para siempre, que es literalmente el modo de fallo que estas reglas vinieron a eliminar (y con el que este repo ya se quemó dos veces: umbral de swap y heartbeat de cron retirado).
>
> ⚠️ **Deuda que estas reglas NO cubren y sigue abierta:** `integrity-check-run.ts:67` repite el mismo crítico todos los días sin dedup (el check `last_upload_age_cxc` es GLOBAL y de 7 días, así que hoy no se solapa con la regla 1, que es por empresa y de 24 h). Y `refresh_clientes_views_failed` + `refresh_clientes_vw` escriben **dos filas para el mismo evento** (medido: 23-jul 07:24, los dos con `statement timeout`) — candidato a agrupar.

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

## Asistencia — el almuerzo es FIJO y quién marca sin ir en planilla (13-ago-2026)

> Daniel va a usar la **planilla** de verdad (calcular pago, horas extra, tardanzas), así que estas dos cosas dejaron de ser cosméticas.
>
> ### 1. EL ALMUERZO ES SIEMPRE 30 MINUTOS — una sola fuente
>
> Daniel, textual: *"todos 30 minutos de almuerzo (puedes quitar la opcion de elegir tiempo de almuerzo, siempre es fijo 30 mins)"*.
>
> 🩸 **HABÍA DOS PERILLAS PARA EL MISMO DATO**, y es la forma conocida de que dos números se separen: la columna `asistencia_horarios.almuerzo_minutos` (por persona, con botones de 30 y 60 en Horarios) y la regla `almuerzo_default_min` de `asistencia_reglas` (una casilla más en «Reglas del cálculo»). **Medido en producción el 13-ago-2026: las 33 personas con horario tienen 30, sin UNA excepción en toda la historia de la tabla, y la regla también vale 30.** Era una perilla que nadie usó nunca y que solo podía quedar mal puesta.
> - **Fuente única: `ALMUERZO_FIJO_MIN` (`src/lib/asistencia/config.ts`).** `almuerzoDefaultMin` salió de `ReglasAsistencia`, de `validarReglas`, de `reglasDesdeFila` y de `reglasHaciaFila`: mandarlo en el cuerpo ahora se **ignora**, y una fila vieja de la base con otro valor **ya no se lee**.
> - 🔴 **LA COLUMNA POR PERSONA NO SE BORRA Y EL CÁLCULO LA SIGUE LEYENDO** (lo pidió Daniel). Borrar una columna es irreversible y no compra nada: lo que se retira es la POSIBILIDAD DE ELEGIR MAL. La pantalla de Horarios la muestra como dato (`30 minutos`) y **el PUT escribe `ALMUERZO_FIJO_MIN` mire lo que mire el cuerpo** — esconder los botones sin cerrar la ruta habría sido cosmético, y el almuerzo entra en la jornada con la que se valúa una ausencia, o sea en plata.
> - `asistencia_reglas.almuerzo_default_min` **queda en la base con su 30** (el upsert solo pisa lo que manda) y nadie la lee. En la pantalla, el almuerzo pasó de ser una CASILLA a ser una regla declarada en «Esto no se cambia desde acá», junto a las otras tres.
>
> ### 2. «SERVICIO PROFESIONAL» — marca en el reloj y NO va en planilla
>
> Daniel sobre **YULISSA JUAREZ** (código 26): *"yulissa es servicio profesional, no esta en planilla pero quiero medir asistencia"*.
>
> 🩸 **El módulo no sabía decir eso.** Una ficha sin salario era, para TODAS las pantallas, un dato PENDIENTE: salía en «les falta el salario», en la píldora «Falta configurar» y en la sección ámbar de la planilla — o sea que una decisión de negocio se veía **idéntica a un olvido, para siempre**. Y peor: el día que alguien le escribiera un salario "para que deje de molestar", el sistema le habría calculado quincena, seguros y neto sin que nadie lo pidiera.
> - **Las dos mitades:** FUERA de todo cálculo de pago · **DENTRO** del control de asistencia (marcaciones, tardanzas, ausencias, horas y reportes). La segunda es la que Daniel quiere conservar, y por eso **esto NO se resuelve dando de baja a la persona**: la baja la sacaría también del reporte.
> - 🔴 **EL CANDADO DEL PAGO ES `armarLinea` (`planilla.ts`), no la falta de sueldo:** el `if` pregunta por la BANDERA, así que una ficha marcada **con salario cargado tampoco produce un centavo**. `LineaPlanilla.fueraDePlanilla` es un tercer estado —ni pagada ni pendiente—: `totalizar` lo cuenta aparte de `sinConfigurar`, `faltantesDe` deja de pedirle salario y jornada (la **empresa sí** se sigue pidiendo: separa las tres planillas), y en pantalla/Excel/PDF va en **gris**, nunca en ámbar (el color es la mitad del mensaje).
> - **Por qué una bandera y no "no tiene salario":** un salario en blanco es AMBIGUO y hoy conviven los dos casos — YULISSA es servicio profesional, y GABRIELA JARAMILLO (53) y YEISHKA DIAZ MARKHAM (54) son altas de Boston a las que **todavía les falta el sueldo**.
> - ⚠️ **DDL ADITIVA PENDIENTE — `supabase/migrations/20260813120000_asistencia_servicio_profesional.sql`, la corre Daniel A MANO. La app funciona ANTES de que corra** (patrón `cols-opcionales`): `leerPersonas` es ahora una ESCALERA (todo → sin `servicio_profesional` → sin las columnas de baja → sin tabla) y cada peldaño se baja solo si el error NOMBRA la columna que ese peldaño quita. Sin la columna nadie queda fuera de planilla y la pantalla dice qué archivo falta; el PUT **no guarda a medias**: si se estaba marcando a alguien devuelve 503 con el aviso, y si no, reintenta sin la columna para que poner un nombre o un salario siga funcionando igual que ayer.
>
> ### La prueba de que NO se movió un centavo
>
> `DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_verif-planilla-no-se-movio.ts` (solo lectura) corre el motor **VIEJO** —sacado de `origin/main` al ejecutar, no una copia versionada que envejece— y el NUEVO sobre los MISMOS datos de producción. Medido el 13-ago-2026, 4 quincenas × 3 empresas: **148 líneas, 2.040 cifras de dinero, 0 diferencias** (netos idénticos: Boston $4.282,97 / $4.595,93 / $4.255,86 · Vistana $1.704,88 / $1.990,38 / $1.837,13 · Fashion Wear $1.745,14 / $1.544,76 / $1.345,97). La 2ª pasada marca al código 26 y demuestra lo que importa del cambio 2: **0 cambios en las otras personas y los totales de las 3 empresas idénticos**; lo único que se mueve en Yulissa es que pierde «falta el salario», gana `fueraDePlanilla` y **conserva sus horas exactamente iguales**.
>
> **Los 3 anchos, en el navegador contra el build de producción y CONTRA `origin/main`** (`BASE=… ETAPA=antes|despues node scripts/_medir-asistencia-almuerzo-planilla.mjs`, solo lectura): **390 · 834 · 1440 → 0 px de arrastre y 0 blancos táctiles bajo 44 px en las 4 pantallas** (ficha, Horarios, Reglas y Planilla), y los recortes y textos chicos **idénticos elemento por elemento a main** (el `h1.sr-only` y los `truncate` del nombre; los 10,5 px son las etiquetas de columna que el módulo ya tenía). Lo único que cambió en pantalla: **78 botones de almuerzo → 0** y «Almuerzo por defecto» fuera de las reglas.
> - 🩸 **Gotchas de medición, los dos costaron una vuelta:** esta app **no tiene `<main>`**, y quedarse con el primer `div[class*="transition-"]` agarra un overlay VACÍO del menú → 0 en todo y verde sin haber mirado nada (se elige el contenedor con más texto); y la pestaña vive en la URL (`?tab=configuracion`), no en un clic.
>
> Candados: `src/__tests__/lib/asistencia-almuerzo-fijo.test.ts` (13) y `asistencia-servicio-profesional.test.ts` (20). **Ejecutan la conducta, no buscan texto**: llaman a los PUT REALES con supabase mockeado y miran qué fila se escribe. **Verificado por mutación, 10 de 10 cazadas:** calcularle pago al servicio profesional (4 tests), volver a pedirle el salario (2), contarlo como pendiente (1), que el PUT acepte el almuerzo del cuerpo (2), que el almuerzo vuelva a entrar por reglas (2), dejar de leer la columna por persona (2), que la pantalla vuelva a pedir el salario (1), guardar a medias sin la columna (1), mezclarlo en el orden con los que cobran (1) y que la pantalla deje de declarar el almuerzo fijo (1).

## Asistencia — la planilla por RANGO de fechas y la marcación AL SEGUNDO (13-ago-2026)

> Daniel pidió dos cosas el mismo día, y las dos son de plata.
>
> ### 3. LA PLANILLA POR UN RANGO DE FECHAS CUALQUIERA
>
> Antes solo se podía pedir por quincena. Ahora el selector tiene dos modos —**Quincena** (lo que se mira el 95% de las veces, y sigue siendo lo que abre la pantalla) y **Rango de fechas**— y las horas, extras, tardanzas y ausencias se cuentan solo dentro de esas fechas.
>
> 🔴 **EL SUELDO ES MENSUAL, ASÍ QUE PRORRATEARLO NECESITA UNA REGLA. LA ELEGIDA: la fracción de QUINCENA que el rango cubre**, no la de mes ni la de días hábiles. Se eligió por una razón verificable: **es la única que deja la quincena en factor exactamente 1**. El negocio paga medio sueldo por quincena sin importar que tenga 15 o 16 días (`salario ÷ 2`, y el día 31 no paga base); prorratear por días del MES daría 15/31 = 0,4839 para la primera de julio — **un 3% menos en TODAS las planillas por haber agregado una pantalla**. Para un rango partido, cada quincena aporta su parte: del 25-jul al 10-ago = **7/16 + 10/15 = 1,104167**.
> - **`factorBase` viaja hasta `calcularDinero` y su valor por defecto es 1**, así que todo lo que ya existía sigue dando el mismo número sin tocar una llamada. `× 1` no cambia un número IEEE-754: con el factor por defecto es literalmente el `centavos(salarioMensual / 2)` de siempre.
> - 🩸 **Un factor `NaN`/0/negativo cae en 1, NUNCA en $0** — y el guard va en `calcularDinero`, no solo en `armarPlanilla`: `centavos(NaN)` devuelve 0, o sea una planilla de $0 que se paga en silencio. Ante la duda se paga la quincena completa, que es lo que se pagaba ayer.
> - ⚠️ **LOS MONTOS ESCRITOS A MANO NO SE REPARTEN.** Viven por quincena —`asistencia_planilla_manual.quincena` tiene un CHECK que solo acepta `2026-07-2`— así que en un rango libre **no se aplican y las celdas se muestran apagadas**, con el aviso en ámbar arriba de todo: repartir un ISR por días sería inventar plata. Para pagar, se elige la quincena.
> - **El aviso del rango libre va PRIMERO y no se esconde detrás de un ⓘ**: dice cuántos días son, qué porcentaje del sueldo quincenal se está pagando y que los montos a mano no entran. También viaja al **Excel y al PDF** (subtítulo + hoja «Cómo se calcula»): el papel se manda por correo y sobrevive a la conversación donde se explicó.
> - **El camino viejo NO se tocó:** `?quincena=2026-07-2` sigue funcionando igual, y si el rango COINCIDE con una quincena, `periodoDesdeRango` devuelve el período de ESA quincena (misma clave de montos manuales, factor 1). **Medido contra la ruta real en el build de producción: los dos caminos dan el MISMO cuadro, campo por campo, en 6 combinaciones** (2 quincenas × 3 empresas).
> - **Tope de 366 días** y validación de fechas (`2026-02-31` → 400): cada consulta pagina TODAS las marcaciones del rango, y un rango de diez años sería una forma de tumbar la base desde la barra de direcciones.
>
> ### 4. LA MARCACIÓN SE MIDE AL SEGUNDO
>
> Daniel, textual: *"y la marcancion tiene que ser al segundo, porque redondeas minutos"*.
>
> 🩸 **EL DATO SIEMPRE ESTUVO COMPLETO** (medido: 198 de las últimas 200 marcaciones traen segundos ≠ 00). Lo que redondeaba era el CÁLCULO: `minutosDelDia` devolvía minutos enteros y empujaba los segundos al minuto más cercano, con un comentario al lado que decía *"discutir por segundos es exactamente lo que la tolerancia evita"* — un argumento que **confunde medir con perdonar**. La tolerancia perdona 10 minutos a la entrada y sigue igual; lo que no se puede es medir mal a la salida, porque ahí no hay nada que perdonar y el error se paga a 1,25 o 1,50.
> - **`segundosDelDia` es la unidad del día entero.** Los umbrales de negocio siguen en MINUTOS y se escalan: tolerancia, mínimo de hora extra y almuerzo no cambiaron ni un número. `minutosDelDia` sigue existiendo **solo** para sugerir la hora de salida (elegir entre 16:30 y 17:00 con la mediana no cambia por 29 segundos, y no toca plata).
> - 🔴 **LAS MARCAS SE MUESTRAN CON SEGUNDOS** (`08:04:39`, en pantalla y en el papel). Son el dato del que sale todo: si el papel dijera 08:04, nadie podría reproducir a mano las horas que la planilla paga.
> - **Los minutos se muestran con 2 decimales cuando tienen fracción** (`fmtMin`, fuente única de pantalla y exports). Redondear cada celda al entero haría que la columna no sumara su propio total.
> - ⚠️ **EL REDONDEO DEL DINERO NO SE TOCÓ.** `centavos` y su corrección de coma flotante quedaron intactos — eso es de plata, no de tiempo.
>
> ### La prueba de que ninguna regla se movió, y el impacto REAL
>
> `DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_verif-planilla-segundos-impacto.ts` (solo lectura). 🔴 **Acá no se espera un cero —medir mejor cambia números, ese es el punto—: lo que se prueba es más fuerte.** Se le dan al motor NUEVO las marcas REDONDEADAS al minuto (lo que hacía el viejo) y se exige que dé **EXACTAMENTE lo mismo que `origin/main`, campo por campo**. Medido el 13-ago sobre 3 quincenas × 3 empresas: **🟢 idéntico**. Toda la diferencia viene de la precisión del reloj y de nada más.
> - 🩸 **Una tolerancia de "30 s por marca" NO servía, y medirlo lo demostró: en un UMBRAL, 29 segundos mueven MINUTOS.** Los 3 casos reales: quien marcó **8:10:15** pasa de 0 a **10,25 min** de tardanza (la gracia son 10 minutos y el atraso se cuenta DESDE las 8:00 — regla vieja, sin cambios; lo que cambió es de qué lado del umbral cae el segundo), y quien se quedó hasta **17:29:31** pierde los 30 minutos de extra porque no alcanza el mínimo de 30 (en producción `extra_minimo_min` = 30). Un tope por marca habría marcado eso como "regla rota" **y habría dejado pasar un error real de 1 minuto**.
> - **Impacto en dólares, 3 quincenas × 3 empresas: $22.918,02 → $22.914,74 (−$3,28).** Los tres más movidos: ANDREA PEREZ −$1,73 (−29,43 min de extra), CARLOS BALTODANO −$1,05, ANDRES GONZALEZ −$0,64. Las otras 34 personas se mueven ±$0,09 o menos.
> - ⚠️ **Si Daniel prefiere que 8:10:15 no sea tarde, NO hay que tocar código: se sube la tolerancia a 11 minutos en «Reglas del cálculo».** Ya es configurable.
>
> **Los 3 anchos, en el navegador contra el build de producción** (`BASE=… node scripts/_medir-asistencia-rango-segundos.mjs`, solo lectura): **390 · 834 · 1440 → 0 px de arrastre y 0 blancos táctiles bajo 44 px** en Planilla (modo quincena y modo rango) y en el Reporte con el detalle abierto. Los recortes (3 a 390, 1 en los otros) y los textos de 10,5 px son **los mismos que ya medía el módulo antes de este PR**.
> - 🩸 **Dos gotchas más de medición, y los dos daban verde sin haber mirado nada:** contar `tbody tr` a secas mezcla las filas de la tabla ANIDADA del detalle con las de las personas —el índice deja de significar "la persona i" y los clics terminan abriendo y cerrando a la misma—, y buscar horas con segundos en `document.body` encuentra la del banner del reloj aunque el detalle esté vacío (se cuentan solo dentro de la tabla anidada). El script **falla** si no encuentra el selector, el aviso del rango libre o una marca con segundos.
>
> Candados: `asistencia-planilla-rango.test.ts` (17) y `asistencia-segundos.test.ts` (15). **Verificado por mutación, 6 de 6 cazadas:** prorratear por días del mes rompe 6, volver a redondear la marca al minuto rompe 9, quitarle la tolerancia a la tardanza rompe 6, quitar el guard del factor (NaN → planilla de $0) rompe 1, aplicar los montos manuales en un rango libre rompe 1, y descartar los segundos en la frontera de las 18:00 rompe 1.

## ✅ Asistencia — LA REGLA DE PRORRATEO, CERRADA POR LA CONTADORA (13-ago-2026)

> Daniel había contestado que el prorrateo era *"8 horas por dias por los total de dia trabajado"*, que **no es** lo que hace el módulo. Se midió contra producción ANTES de tocar el cálculo, se paró y se preguntó — y la respuesta cerró el tema:
>
> **Daniel, textual:** *"pero me dijo mi contable que el calculo dio exacto, solo le falto elegir la fecha exacta y no redonear minutos"*.
>
> O sea: **lo que faltaba eran las dos cosas que ya se construyeron** (el rango de fechas libre y medir al segundo). **La matemática de la planilla NO se toca.**
>
> ### Por qué se paró, y por qué estuvo bien parar (`scripts/_medir-prorrateo-daniel.ts`)
>
> | quincena | días hábiles | hoy (`salario ÷ 2`) | 8 h × días hábiles |
> |---|---|---|---|
> | 1 al 15 de julio | 11 | $9.647,40 | $9.204,80 (**−4,6 %**) |
> | 16 al 31 de julio | 12 | $9.647,40 | $10.041,60 (**+4,1 %**) |
> | 1 al 15 de agosto | 10 | $9.647,40 | $8.368,00 (**−13,3 %**) |
>
> El mismo sueldo habría pagado **13 % menos en una quincena que en otra** según cuántos lunes-a-viernes le tocaron. Implementarlo "porque lo dijo el dueño" habría roto una planilla que la contadora ya daba por exacta.
>
> ### ⛔ Las tres dudas que quedaron abiertas están CONTESTADAS. Ninguna era un bug
>
> 1. **Las 13 personas de 48 h/semana están BIEN cargadas.** Daniel: *"no"*, explícito — no se pasan a 40. Su jornada **contratada** es de 48 horas, aunque marquen lunes a viernes.
> 2. **La media hora de los que salen 17:00 NO es hora extra.** Daniel, textual: *"los que salen a las 5 no es mediahora extra, sino que eso es un reemplzao de sus horas para completar 48 mensuales, me explico? aun q alfinal no se completa"* — se quedan media hora de lun-vie para **reponer el sábado que no trabajan**, no completan las 48, y **está bien así**: no genera extra ni deducción. (Por eso «nadie marca sábado» con divisor 208 NO era un error de carga.)
> 3. **Días trabajados = días con marcación, y la incapacidad justificada SÍ SE PAGA.**
>
> ### 🔴 La incapacidad justificada se paga, y ahora hay candado EN DÓLARES
>
> El módulo ya lo hacía —un día justificado no es `ausente`, así que no entra a `ausenciaMin`— pero **no había un solo test que lo probara en dinero**, y la diferencia entre "se paga" y "no se paga" era un `!justificado` que alguien podía borrar sin que se cayera nada.
> - **Verificado en producción con el caso real:** MARTHA ASUCENA CHAVARRIA Z. (código 43) tiene dos días sin marcas en la quincena 1-15 de agosto — el **4 con «Incapacidad»** y el **14 sin justificar**. El 4 sale `ausente=false` y **no se le descuenta**; el 14 sí. Se le descuenta **un** día, no dos.
> - Candado nuevo: sin justificación el día se descuenta, con incapacidad **el neto es idéntico al de haber trabajado**, y el día se sigue viendo aparte (`ausenciaJustificadaDias`) en vez de desaparecer.
>
> ### Lo demás que quedó confirmado y con candado
>
> - **Décimo tercer mes y vacaciones NO se provisionan** (*"se registran cuando se pagan"*). Se verificó el cálculo línea por línea: no había nada que sacar. El test fija las **20 columnas exactas** de `DineroLinea` y la fórmula del bruto.
> - **Seguro social 9,75 % y educativo 1,25 % son los correctos** y salen del BRUTO.
> - **La quincena no depende de sus días hábiles** (10, 11 o 12 → la misma base).
> - **Verificado por mutación:** volver a descontar la incapacidad rompe 3 tests; prorratear con `8 h × días hábiles` rompe 14.
>
> **La distinción del servicio profesional ya existía en la contabilidad:** a Daniel y a David se les paga por **SERVICIOS PROFESIONALES (6.02.01)**, otra cuenta que **SALARIOS POR PAGAR (2.01.05.01)**. Va en el ⓘ de la ficha, donde la contable reconoce los números de cuenta.


## 🔴 Asistencia — EL 90% DE LO QUE LA PLANILLA DESCONTABA POR AUSENCIA ERA FALSO (14-ago-2026)

> La contadora corre la primera quincena real en 2 días. Una auditoría medida contra producción encontró que de los **$1.127,78** que la planilla descontaba por ausencia en la quincena del 1 al 15 de agosto, **$1.013,87 (el 90%) eran falsos**. Reales: **$113,91**.
>
> 🔴 **NINGUNO DE LOS TRES ARREGLOS TOCA EL MOTOR DE CÁLCULO.** `planilla.ts` está cotejado al centavo contra el Excel de la contadora y su matemática NO se tocó: ni una fórmula, ni un redondeo, ni un recargo. Los tres son sobre **qué días entran** al cálculo y **de quién se abstiene el sistema**.
>
> ### 1. El día que no terminó no puede ser ausencia
>
> `armarReporte` sabía callarse el día en curso desde el 13-ago —lo usaba el Reporte— y **la Planilla no le pasaba `diaEnCurso`**: un `grep` sobre `route.ts`, `PlanillaTab.tsx`, `planilla.ts` y `planilla-exportar.ts` daba **cero**. Resultado medido: las **33 personas** salían ausentes el **14-ago (hoy)** = **$866,99**.
> - 🔴 **Y NO ALCANZABA CON EXCLUIR HOY.** `diaEnCurso` excluía UNO solo (`fecha === diaEnCurso`): abierta la quincena un día 3, quedaban ~9 días hábiles futuros contándose como falta **a ~$870 cada uno**. La comparación pasó a **`fecha >= diaEnCurso`** — *"de acá en adelante todavía no pasó nada"*. Un día futuro no es que "no terminó": es que ni siquiera empezó.
> - **El día es el de PANAMÁ (`hoyPanama()`, UTC−5 fijo).** Agrupar por UTC ya dio números falsos dos veces en este módulo: entre las 7 p.m. y la medianoche el día salta y "hoy" pasaría a ser mañana.
> - ⚠️ **Se pasa SIEMPRE, sin mirar si cae dentro del período.** Una quincena vieja no tiene ningún día que lo alcance y su cálculo no se mueve un centavo: eso es lo que hace que reimprimir julio siga dando lo de julio.
> - 🔑 **Lo que ya se trabajó se sigue midiendo**: quien llegó tarde HOY se lo cobra igual. Lo único que se suspende es el veredicto (`ausente` y `revisar`), no la medición.
> - **Aviso arriba del cuadro** (`avisoPeriodoAbierto`, azul): *«Esta quincena todavía no termina — falta 1 día hábil. Los días que no pasaron no se cuentan.»* Desaparece solo cuando el período cierra — un cartel permanente se deja de leer.
>
> ### 2. Quien entró o salió a mitad del período NO recibe un número inventado
>
> **YEISHKA DIAZ (54)**, ingreso 10-ago, salía ausente el 3, 4, 5, 6 y 7 —días en que no trabajaba acá— y su neto quedaba en **$133,34 sobre un quincenal de $300**. **GABRIELA JARAMILLO (53)**, ingreso 4-ago, ausente el 3.
> - 🔴 **EL ARREGLO OBVIO ES EL EQUIVOCADO, y hay un test que lo demuestra en dólares:** medirla solo desde su ingreso le borra las ausencias y le paga **$300 completos** por 4 días trabajados de 10 hábiles. Las dos cuentas automáticas están mal por lados opuestos.
> - **Lo que Daniel decidió: el sistema NO le calcula pago.** Sale en **«Decidilo vos»** con la leyenda *«entró el 10 de agosto de 2026»*, con el quincenal que le correspondería a la vista, y **fuera del total**. La contadora usa el **rango de fechas libre** (10 al 15), que ya existe. Textual: *«pero igual nos pagan por quincena, no? Solo hay que escoger cada vez de qué fecha a qué fecha se calcula y ya»*.
> - 🔑 **Es la MISMA regla que el módulo ya aplica** y que está escrita en `planilla.ts`: cuando el sistema no puede saber, se abstiene. *"Descontarle la quincena entera en automático sería inventarle una renuncia; pagarle completo, inventarle unas vacaciones."* **NO SE CONSTRUYÓ PRORRATEO.** La única cifra que se muestra es la quincena COMPLETA, rotulada como lo que le TOCARÍA — nunca una fracción calculada por el sistema.
> - **El candado del pago vive en `armarLinea`, en el MISMO `if` que el de servicio profesional**: no pregunta por el sueldo ni por los días, pregunta por el motivo. Con salario cargado, marcando todos los días, sigue sin producir un centavo.
> - ⚠️ **29 de 38 fichas no tienen `fecha_ingreso`** (medido): con ésas `motivoPeriodoParcial` devuelve `null` y se comportan EXACTAMENTE como hoy. Los bordes son ESTRICTOS: quien entró el primer día del período (o salió el último) trabajó el período completo.
>
> ### 3. Quien tiene justificación viva sale del cajón «falta configurar»
>
> **RODRIGO MIRANDA** (Trabajo fuera de la oficina, 1→13 ago) y **ELOYN MENDOZA** (Vacaciones, 16-jul→13-ago) salían los dos en ámbar diciendo *«falta configurarles algo… se arreglan en Configuración»* — **y en Configuración no hay nada que arreglarles**.
> - **La bolsa ámbar se partió en DOS grupos con nombre propio** (`grupoDeLinea`, fuente ÚNICA usada por la pantalla, el orden, los totales, el Excel y el PDF): **«Falta un dato»** (ámbar, con el botón a Configuración) y **«Decidilo vos»** (GRIS, con el motivo escrito —*«Vacaciones del 16 jul 2026 al 13 ago 2026»*— y el quincenal que les correspondería). El color es la mitad del mensaje: ámbar dice "arreglame".
> - ⚠️ **La justificación solo cuenta cuando la persona NO marcó NI UN DÍA.** Quien se tomó dos días y trabajó trece **cobra normal**: confundir los dos casos le quitaría la quincena entera a quien sí vino. Hay candado.
> - **El código 50** (sin ficha) aparecía **tres veces, una por empresa** — `armarPlanilla` los mete en todas a propósito para que nadie los borre en silencio. Ahora sale del cuadro (`separarSinFicha`) y se muestra **una sola vez arriba**: *«1 código marcó N veces y no tiene ficha (código 50). Hasta saber quién es, no se le puede calcular pago.»* **La intención de que no desaparezca se conserva; lo que cambia es dónde se muestra.**
> - **Los avisos viajan al Excel y al PDF**: el papel se manda por correo y sobrevive a la conversación donde se explicó.
>
> ### La medición contra producción
>
> `DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_verif-planilla-dias-que-no-pasaron.ts` (solo lectura) corre la lógica de la ruta **VIEJA** —sacada de `origin/main` AL EJECUTAR, no una copia versionada que envejece— y la nueva sobre los MISMOS datos:
>
> | | antes | después |
> |---|---:|---:|
> | Ausencias (3 empresas) | **$1.127,78** | **$113,91** |
> | Neto | $7.194,92 | $7.583,01 |
> | Yeishka (54) | neto $133,34 | **sin número** · «entró el 10 de agosto» · quincena completa $300,00 |
> | Gabriela (53) | neto $206,62 | **sin número** · «entró el 4 de agosto» · quincena completa $300,00 |
> | Rodrigo (13) | ámbar «no marcó ni un día» | **gris** · «Trabajo fuera de la oficina del 1 ago al 13 ago» · $400,00 |
> | Eloyn (29) | ámbar «no marcó ni un día» | **gris** · «Vacaciones del 16 jul al 13 ago» · $283,26 |
> | Código 50 | 3 filas (una por empresa) | 1 aviso arriba |
>
> 🔴 **Y LAS DOS QUINCENAS YA CERRADAS DE JULIO NO SE MOVIERON: 1.264 cifras comparadas, 0 diferencias** (Boston $4.264,23 y $4.550,78 · Vistana $2.092,04 y $2.379,29 · Fashion Wear $1.699,15 y $1.500,22, idénticos antes y después). El script **falla** si una sola cifra cambia, si Yeishka cobra, o si el código sin ficha sigue adentro del cuadro. Para reproducir la auditoría desde cero: `scripts/_diag-planilla-dias-que-no-pasaron.ts`.
>
> **Los 3 anchos (+ el iPad acostado), en el navegador contra el build de producción y con datos de producción** (`BASE=… node scripts/_medir-planilla-dias-que-no-pasaron.mjs`, solo lectura, en las 3 empresas): **390 · 834 · 1024 · 1440 → 0 px de arrastre, 0 blancos táctiles bajo 44 px y 0 textos NUEVOS bajo 12 px** en los 12 casos. Los únicos recortes son el `H1.sr-only` (77 px) y el `truncate` del nombre en la tarjeta de celular — los dos PRE-EXISTENTES, en código que este PR no toca; los textos de 10-11 px son las etiquetas de columna que el módulo ya tenía. El script **falla** si la planilla sale vacía, si falta alguno de los tres avisos, o si el del código sin ficha aparece más de una vez.
>
> **Candados:** `src/__tests__/lib/asistencia-dias-que-no-pasaron.test.ts` (38, incluido un bloque que llama al **handler REAL de la ruta** — el bug original era que la ruta no pasaba el parámetro, y eso ninguna prueba del motor puede verlo) y **`src/__tests__/components/asistencia-planilla-decidir-pantalla.test.tsx` (10), que RENDERIZA `PlanillaTab`** y lee los renglones: que `grupoDeLinea` devuelva "decidir" no prueba nada sobre lo que la contadora ve.
> - **Verificado por mutación, 16 de 16 cazadas:** volver a `===` en el motor (1) · que la ruta deje de pasar el día de hoy (1) · quitarle a `armarLinea` el candado de la abstención (7) · que `armarPlanilla` deje de pasar el motivo (7) · que la ruta deje de armar el mapa de vigencia (1) o el de justificaciones (1) · contar «decidir» como pendiente (2) · que `separarSinFicha` no separe (1) o que la ruta no lo llame (1) · `quincenalReferencia` siempre null (3) · aflojar el borde del ingreso (1) · aplicar la justificación a quien SÍ marcó (1) · que la pantalla vuelva a una sola bolsa ámbar (5) · que pierda el aviso del período (1) o el del código sin ficha (2) · que la ruta deje de mandar el aviso (1).
> - 🔑 **Ningún candado busca texto en un archivo**: todos ejecutan la conducta y miran los dólares o el DOM. En este repo ya fallaron varios candados por leer sus propios comentarios.

## 🔴 Asistencia — LA MARCACIÓN DEL RELOJ NUNCA SE BORRA NI SE EDITA (13-ago-2026)

> Daniel, textual: *"en asistencia- reporte, quiero poder editar el registro de marcacion en caso de caso especial, se puede? o enrreda mucho?"*. Y a las dos preguntas del diseño: **"1. todos pueden corregir. 2. si"** (la razón es obligatoria).
>
> ### 🔴 LA REGLA QUE NO SE NEGOCIA
>
> `asistencia_marcaciones` **es lo que dijo el reloj, y es la única prueba de a qué hora entró una persona — o sea que define un pago.** Un UPDATE ahí destruye esa prueba para siempre y no hay de dónde recuperarla (el reloj tiene memoria limitada y los eventos viejos se le caen). **Por eso la marcación queda INTACTA y la corrección va ENCIMA**, en `asistencia_correcciones`. La corrección manda para el cálculo; en pantalla se ven las dos:
>
> ```
> mié 5 ago   08:00:00   12:00:23   12:31:07   17:04:12   Revisar
>             Reloj 08:47:12 → 08:00 · "se le dañó el carro, avisó" · Daniel · 13 ago
> ```
>
> Es el MISMO patrón que Guías (el texto que escribió bodega se conserva; encima va `guia_items.cliente_codigo`) y que `mk_proyectos.tienda` + `tienda_codigo`. **No es un patrón nuevo.**
>
> ### El caso que Daniel no nombró y es el más común: la marcación que NO existe
>
> Quien **olvidó marcar** no tiene registro que corregir. **Medido en producción el 13-ago-2026** (`DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-marcaciones-incompletas.ts`, solo lectura) sobre las **3.894 marcaciones cargadas** (1-jul → 13-ago, 38 personas, 1.020 días-persona):
>
> | Marcas en el día | Días-persona | % |
> |---|---:|---:|
> | 1 (entrada sin salida) | 12 | 1,2% |
> | 2 (sin almuerzo) | 69 | 6,8% |
> | 3 (falta una) | 85 | 8,3% |
> | **4 (completo)** | **789** | **77,4%** |
> | 5-7 (de más) | 65 | 6,4% |
>
> 🔴 **231 de 1.020 días están mal marcados (22,6%)**, **97 con número IMPAR de marcas** (falta una) y **12 con una sola**. Más **24 días hábiles sin NINGUNA marca y sin justificación**. **No es un caso raro: es pan de todos los días**, y por eso se puede **AGREGAR** una marcación faltante con el mismo motivo obligatorio y la misma firma.
>
> ⚠️ **La marcación agregada NUNCA se escribe dentro de `asistencia_marcaciones`** — se mezclaría con lo que dijo el reloj y se perdería la separación que es todo el punto. Va en `asistencia_correcciones` con `marcacion_id = NULL`, y en pantalla dice *"Marcación **agregada** — el reloj no registró nada"*. En el motor se distingue porque `DiaReporte.marcasIds[i]` viene en `null`.
>
> ### Dónde entra al cálculo
>
> `aplicarCorrecciones` (módulo PURO, `src/lib/asistencia/correcciones.ts`) devuelve una **COPIA** de la lista de marcaciones con las horas corregidas, y **las DOS rutas la aplican ANTES de llamar al motor**: `/api/asistencia/reporte` y `/api/asistencia/planilla`. 🔴 **Si la corrección no llegara al pago, no serviría para nada**: la pantalla diría una cosa y la planilla pagaría otra.
> - **`DiaReporte.correcciones` y `resumen.diasCorregidos` son INFORMATIVOS y no entran en ninguna cuenta** — las horas ya vienen aplicadas. Hay un test que le pasa al motor un mapa lleno de correcciones absurdas y exige que ni un minuto se mueva.
> - 🔑 **Una corrección NO puede mover una marcación de DÍA.** Para la forma «pisar una hora», el día sale de la MARCACIÓN (`diaPanama(ocurrio_en)`), nunca del campo `fecha` de la corrección: mover horas de un día a otro es mover plata de una quincena a otra sin que nada lo avise. Y la ruta tampoco se cree la persona ni el día que manda el navegador: los lee de la marcación.
> - **Deshacer NO borra**: `anulada_en` + `anulada_por`. La fila queda y el cálculo vuelve a la hora del reloj. Un botón que no se puede deshacer sobre un dato de pago es una trampa; y deshacer sin dejar rastro es peor que no haber corregido.
>
> ### Quién puede, y la firma
>
> **TODOS los roles de Asistencia** (`asistenciaRoles()` = admin, secretaria, contabilidad). Decisión explícita de Daniel. **Por eso mismo la FIRMA no es opcional**: sale de la sesión (`auth.userName`), nunca del cuerpo del pedido — sin ella, "todos pueden" se vuelve "nadie sabe quién fue". El **motivo es obligatorio** en las tres capas: el botón se apaga y dice qué falta, la ruta rechaza con 400, y el CHECK de la base exige `btrim(motivo) <> ''` (⚠️ `NOT NULL` a secas deja pasar `""` y `"   "`, que es justo lo que teclea quien quiere saltarse el campo).
>
> ### Se ve SIN abrir nada
>
> Arriba de la tabla: *"**1** hora corregida a mano en **1** día. Los números de abajo ya cuentan con eso."* · chip azul **«N días corregidos»** en la fila de la persona · la línea con las dos horas dentro del detalle. Y también en el **Excel** (columna «Corregido a mano» en Detalle con la hora del reloj, la corregida, el motivo y quién; «Días corregidos a mano» en Resumen) y en el **PDF que se firma** (columna «Días correg.» + pie de página). No hay forma de leer un total sin enterarse de que hay una hora tocada a mano.
>
> ### 🔴 EL CANDADO PRINCIPAL, verificado por mutación
>
> `src/__tests__/lib/asistencia-correcciones.test.ts` (42 casos). **BARRIDO ESTÁTICO sobre todo `src/`, sin listas de archivos que se queden viejas**: ningún `.from("asistencia_marcaciones")` puede encadenar `.update(`, `.delete(` ni `.upsert(`. ⚠️ El barrido **borra los comentarios primero** — un candado que se cumple a sí mismo con su propia explicación da permiso para romper (este repo ya se quemó con eso, ver la nota de `revalidateOnFocus`). La ÚNICA forma de upsert admitida es la del INGEST con `ignoreDuplicates: true`, que **nunca pisa una fila**: es lo que hace idempotente el repaso nocturno del reloj. Otro barrido recorre TODAS las migraciones y prohíbe `DROP TABLE` / `TRUNCATE` / `DELETE FROM` sobre la tabla. Y hay **test de CONDUCTA**: llama a la ruta REAL con supabase mockeado y mira qué se escribió de verdad.
> - **Verificado por mutación, 13 de 13 cazadas:** escribir un UPDATE (1) o un DELETE (1) sobre las marcaciones · aflojar el motivo obligatorio (4) · que la planilla NO aplique las correcciones (1) · que el reporte no las aplique (1) · que el select pierda el `id` (1) · que una corrección pueda mover el día (1) · que `aplicarCorrecciones` mute el original (2) · que deshacer borre en vez de anular (1) · que la firma salga del cuerpo (1) · que la ruta se crea la persona/día del cuerpo (1) · la llave con CASCADE en vez de RESTRICT (1) · el motivo sin su CHECK (1).
>
> ### 🔴 SIN CORRECCIÓN NO SE MOVIÓ UN CENTAVO — medido contra producción
>
> `DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_verif-correcciones-no-mueven-nada.ts` (solo lectura) corre el motor **VIEJO** —sacado de `origin/main` AL EJECUTAR, no una copia versionada que envejece— y el NUEVO sobre los MISMOS datos. **4 quincenas × 3 empresas: 150 líneas, 3.992 cifras, 🟢 0 diferencias** (netos idénticos: Boston $4.282,31 / $4.596,04 / $4.465,79 · Vistana $2.177,55 / $2.488,80 / $1.677,11 · Fashion Wear $1.745,05 / $1.544,90 / $1.249,86).
> - **Candado de dinero, con una tardanza REAL de producción:** ALEJANDRA CAMAÑO, 1-jul, marcó 08:15 → corregida a 08:00 → tardanza **15,75 → 0,00 min**, neto **$251,94 → $252,64**. **Personas ajenas movidas: 0.** Deshacerla devuelve **620 cifras idénticas** y el neto exacto a $251,94.
>
> ### ⚠️ DDL ADITIVA PENDIENTE — la corre Daniel A MANO, y la app funciona ANTES
>
> `supabase/migrations/20260813150000_asistencia_correcciones.sql`. Patrón `cols-opcionales`: **sin la tabla, la pantalla NO ofrece corregir y lo dice** (*"Pídele a Daniel que corra el archivo…"*), y el cálculo es el de siempre. **Verificado contra producción con la DDL SIN correr** (`scripts/_verif-correcciones-sin-ddl.ts` + el navegador): el reporte carga sus 48 personas, **0 botones de corregir**, el aviso a la vista, y la detección de «falta la tabla» es ESTRECHA — 6/6 casos (permiso denegado, timeout, red caída y «otra tabla no existe» se PROPAGAN, no se leen como migración faltante).
> - 🩸 **Gotcha de verificación:** el primer probe usaba `select(…, { head: true })` y decía **«EXISTE»** sobre una tabla que no estaba creada — con `head` PostgREST puede contestar sin cuerpo y el error se pierde. Un script de verificación que miente es peor que no tenerlo.
>
> ### Los 3 anchos (+ el iPad acostado)
>
> `BASE=… node scripts/_medir-correcciones-anchos.mjs` (solo lectura), en **5 estados** — reporte cerrado, detalle abierto, ventana de corregir, de deshacer y de agregar: **390 · 834 · 1024 · 1440 → 0 px de arrastre, 0 blancos táctiles bajo 44 px y 0 textos bajo 12 px NUEVOS** en los 20 casos. El único recorte es el `H1.sr-only` y los textos de 10,5/10/11 px son las etiquetas de columna y el chip «Revisar» que el módulo ya tenía — **medidos IDÉNTICOS con y sin correcciones**, o sea que este cambio no agregó ni un texto chico (la primera versión sí: el chip y los «Agregar hora» salieron a 11 px y se subieron a 12). Modal con el patrón de la casa: `createPortal` + `inset-0` + `useBodyScrollLock`, **sin `autoFocus`**.
> - 🩸 **La tabla no existe todavía en producción, así que la medición INTERCEPTA la respuesta de `/api/asistencia/reporte`** y le inyecta UNA corrección con la forma exacta que va a tener. Los datos siguen siendo los de producción y el componente medido es el REAL; no se toca la base ni se aprieta ningún botón que guarde. Sin eso no habría nada que medir y el script pasaría en verde sin haber mirado nada — por eso **falla** si no encuentra el aviso, el chip, la línea con la hora del reloj o el botón de guardar apagado.

## 🔴 Asistencia — «TRABAJO FUERA DE LA OFICINA»: el motivo que NO es una ausencia (13-ago-2026)

> El caso: **RODRIGO MIRANDA (código 13, vistana, $800/mes) no marca desde el 31 de julio porque está trabajando FUERA de la empresa.** Daniel, textual: *"rodrigo esta trabajando fuera de la empresa (justificado)"*. Los cinco motivos que había —`Vacaciones · Incapacidad · Permiso · Luto · Otro`— describen a alguien que **NO trabajó**. Rodrigo **sí trabajó**.
>
> | | Vacaciones | Trabajo fuera |
> |---|---|---|
> | ¿se le paga? | sí | sí |
> | **¿trabajó ese día?** | **NO** | **SÍ** |
> | ¿le consume días de vacaciones? | **SÍ** | no |
>
> Metidos como lo mismo, en tres meses nadie puede distinguir quién estuvo de vacaciones de quién estuvo trabajando afuera — y las vacaciones son un derecho que se acumula y se gasta.
>
> 🩸 **SE DICE «OFICINA» Y NO «EMPRESA», aunque la palabra de Daniel fuera "empresa".** En castellano *"está fuera de la empresa"* se lee, con la misma naturalidad, como *"ya no trabaja acá"* — la confusión más cara posible justo en la pantalla que decide un pago. "Fuera de la oficina" dice lo mismo sin esa segunda lectura.
>
> ### ⚠️ NO HIZO FALTA NINGUNA DDL — y está COMPROBADO contra producción, no deducido
>
> `asistencia_justificaciones.motivo` es un `text NOT NULL` **sin CHECK** (`20260805120000_asistencia_reglas.sql`). Pero "las migraciones dicen" no es "la base hace": `npx tsx scripts/_probe-motivo-check.ts` **inserta los 6 motivos de verdad y los borra**, verificando que no quede ninguna fila (PostgREST no expone `information_schema`, así que no hay forma de leer un CHECK). Medido: **6/6 aceptados, 2 filas antes y 2 después.** El centinela es un código imposible (`__PROBE_MOTIVO__`) con fechas de 1900.
>
> ### 🔴 EL PAGO ES EXACTAMENTE EL DE UNA JUSTIFICACIÓN DE HOY — medido contra producción
>
> `DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_verif-motivo-trabajo-fuera.ts` (**solo lectura**; la justificación de Rodrigo se calcula EN MEMORIA, no se escribe). Corre el motor **VIEJO** —sacado de `origin/main` AL EJECUTAR, no una copia versionada que envejece— y el nuevo sobre los MISMOS datos. Medido el 13-ago-2026, 3 quincenas × 3 empresas:
>
> - **El código no mueve nada: 114 líneas · 1.880 cifras de dinero · 0 diferencias 🟢**
> - **Nadie más se mueve al justificar a Rodrigo: 0 personas ajenas movidas 🟢**
> - 🔴 **«Vacaciones» y «Trabajo fuera de la oficina» pagan IDÉNTICO: 94 personas comparadas campo por campo, 0 diferencias 🟢.** Es la prueba directa de "no se descuenta", y no depende de leer un `if`.
> - **Casos reales de "descontado → no descontado"**, con los dos números: HECTOR LEONEL PEREZ **$245,22 → $267,00** (ausencia $24,48 → $0,00) · SAMIR POLO **$207,29 → $228,80** · GABRIELA JARAMILLO **$206,62 → $228,41** · YEISHKA DIAZ **$133,34 → $155,13**. En los cuatro, con «Vacaciones» el neto es EL MISMO.
> - ⚠️ **CERO HORAS EXTRA, y es lo correcto:** sin marcaciones no hay horas que medir. `extraDiurnoMin`, `extraNocturnoMin`, `domingoMin` y `feriadoMin` quedan en 0 — ni se le inventan 8 horas ni se le quitan las de los días que sí trabajó.
>
> 🩸 **HALLAZGO — RODRIGO NUNCA ESTUVO "DESCONTADO", Y LA JUSTIFICACIÓN NO LE CAMBIA EL NÚMERO.** Con **cero marcaciones en toda la quincena** no llega a existir en el reporte, así que la planilla lo lista con `dinero: null` y `faltaConfigurar = ["no marcó ni un día en esta quincena"]` — **antes y después de la justificación, exactamente igual**. Medido, y **ELOYN MENDOZA (29) con «Vacaciones» 16-jul→13-ago sale idéntico**: `dinero=NO · falta=[no marcó ni un día]`. O sea que el motivo nuevo **hereda** el comportamiento que ya había, no estrena uno. Es una decisión deliberada y escrita en `planilla.ts`: *"Descontarle la quincena entera en automático sería inventarle una renuncia; pagarle completo, inventarle unas vacaciones. Se lista y lo decide una persona."* **NO se tocó.** Si Daniel quiere que una quincena 100% justificada se pague sola, es una decisión suya y cambia a los cinco motivos de golpe, no solo a éste.
>
> ### El reporte lo DISTINGUE, que es el punto de haberlo agregado
>
> - El renglón del día dice **«Trabajando fuera de la oficina»**, sin la palabra *ausencia* — el genérico habría sido *"Ausencia justificada — Trabajo fuera de la oficina"*, que afirma lo contrario de lo que pasó. Fuente única: `textoDiaJustificado()` en `motivos.ts`, usada por la pantalla **y** por el Excel.
> - 🔴 **Chip en la fila de la persona: «N días trabajando fuera», SIN abrir nada.** Sin él, quien trabajó todo el mes afuera aparece con «0 días trabajados» y ninguna explicación: idéntico a alguien que no vino.
> - **`resumen.diasTrabajandoFuera` va APARTE de `ausenciasJustificadas`, y los dos conjuntos son DISJUNTOS.** Ningún número histórico se mueve: hasta hoy el motivo no existía, así que no había un solo día que sacar de ahí.
> - **Excel:** la columna «Ausencia» del Detalle pasó a **«Ausencia / justificación»** (a secas ya no alcanzaba), el Resumen gana **«Días trabajando fuera»** en columna propia, y la hoja «Cómo se calcula» explica que **NO es una ausencia**. ⚠️ Al insertar la columna, el índice de la celda que se pinta en ROJO se corrió de 8 a **9**: pintar la de al lado teñiría los minutos tarde, que no son una advertencia.
> - **PDF (el que se firma):** en el papel esa persona sale con «Días 0», así que el pie lo dice — *"N días son de trabajo fuera de la oficina: la persona trabajó (no marcó porque no estaba acá), no se descuenta y no genera extras"*.
>
> ### Los 3 anchos (+ el iPad acostado)
>
> `BASE=… node scripts/_medir-trabajo-fuera-anchos.mjs` (solo lectura), en 3 estados — reporte cerrado, detalle abierto y Justificaciones: **390 · 834 · 1024 · 1440 → 0 px de arrastre, 0 blancos táctiles bajo 44 px y 0 textos bajo 12 px NUEVOS** en los 12 casos. El único recorte es el `H1.sr-only` (77 px) y los textos de 10,5 px son las etiquetas de columna que el módulo ya tenía. El chip mide 20 px de alto y no ensancha la fila.
> - 🩸 **En producción todavía no hay ninguna justificación con este motivo**, así que la medición **INTERCEPTA** `/api/asistencia/reporte` y le inyecta días con la forma exacta que van a tener; los datos siguen siendo los de producción y el componente medido es el REAL. Sin eso el script pasaría en verde sin haber mirado nada — por eso **falla** si no encuentra el chip, el renglón o la opción en el desplegable, y **también si encuentra «Ausencia justificada — Trabajo fuera»**.
>
> ### Candados
>
> `src/__tests__/lib/asistencia-motivo-trabajo-fuera.test.ts` (23) y **`src/__tests__/components/asistencia-trabajo-fuera-pantalla.test.tsx` (6, RENDERIZA `ReporteTab` y `JustificacionesTab` de verdad)**. Ninguno busca texto en un archivo: corren el motor, corren la planilla, arman el Excel y el PDF y leen las celdas. **Verificado por mutación, 15 de 15 cazadas:** `esTrabajoFuera` siempre false (6) · el texto vuelve al genérico en el módulo (2) o en la pantalla (1) · el día cuenta como ausencia justificada (3) · `diasTrabajandoFuera` siempre 0 (3) · el día se marca como AUSENTE, o sea toca el pago (7) · el motivo sale de la lista (1 + 1) · la celda roja del Excel vuelve al índice 8 (1) · el Excel Detalle vuelve al genérico (2) · se quita la columna del Resumen (3) o su valor, que desalinea el TOTAL (1) · se cae el pie del PDF (1) o su total (1) · se cae el chip (2) o queda siempre en plural (1) · se borra la fila de «Cómo se calcula» (1).
>
> ### ❓ NO existe cuenta de días de vacaciones — y NO se construyó
>
> Barrido completo (`supabase/migrations/` y `src/`): **no hay columna, ni tabla, ni cálculo** que lleve el saldo de vacaciones de nadie. `asistencia_personas` tiene nombre, salario, jornada, empresa, activo, fechas de ingreso/salida y `servicio_profesional` — nada de vacaciones. Lo único que existe es la justificación con motivo «Vacaciones» como un rango suelto: **nadie cuenta cuántos días se ganaron ni cuántos se gastaron.** Es una decisión de Daniel y no se construyó.

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

> **"SIENTO QUE TODO EL SISTEMA ES LENTO A VECES" — NO ERAN LAS FOTOS: EL SISTEMA PEDÍA LOS MISMOS DATOS DOS VECES (12-ago-2026).**
>
> Daniel, textual. La auditoría midió contra producción y el titular fue que las fotos (6-9 KB, WebP) no tenían nada que ver: el servidor armaba la pantalla y **apenas llegaba el HTML, el cliente volvía a pedir lo MISMO**. Cada visita costaba el doble de base de datos, con Supabase en compute **Micro** y 4 caídas esa semana — bajarle la carga era el objetivo real, no los segundos.
>
> **Medido contra el build de producción, mediana de 3 corridas por pantalla (la de calentamiento se descarta: el arranque en frío de la función da picos de hasta 25 s que no representan nada). `BASE=… ETAPA=antes|despues PERFIL=escritorio|celular node scripts/_medir-lentitud-sistema.mjs`, solo lectura.**
>
> | Pantalla | Peticiones/visita | "Listo" (ms) | HTML del servidor (ms) |
> |---|---|---|---|
> | Ventas | **8 → 1** | 3.494 → 2.723 | 1.070 → 1.033 |
> | Clientes | 5 → **1** | 5.098 → 2.758 | **3.215 → 334** |
> | Multifashion | 7 → 3 | 2.526 → 2.378 | 538 → 561 |
> | Reclamos | 4 → **0** | 2.189 → 2.051 | 658 → 656 |
> | Comisiones | **14 → 2** | 2.938 → 2.562 | 362 → 346 |
> | Home | 5 → 2 | 2.416 → 2.394 | 174 → 168 |
> | Asistencia | 4 → 1 | 2.119 → 2.060 | 177 → 180 |
>
> **43 peticiones por vuelta al sistema → 10.** Idéntico en el perfil de celular (390 px). Y **ningún número de negocio cambió**: `node scripts/_verif-numeros-no-cambian.mjs` captura TODAS las cifras visibles de 6 pantallas y las compara **posición por posición** (no como conjunto: un conjunto diría "los mismos números" aunque dos filas se hubieran intercambiado, que es el error que más daño hace en Comisiones) — **1.256 cifras, 0 distintas**, antes y después, mismo build de producción y mismos datos.
>
> **1. `fallbackData` de SWR NO evita el re-fetch, y cuatro pantallas creían que sí.** Ventas, Clientes, Multifashion y Reclamos ya pasaban los datos del server component como `fallbackData`, con comentarios que decían *"sin re-fetch redundante"*. **Es falso**: `fallbackData` no puebla la caché — SWR lo trata como dato *stale* y su default `revalidateIfStale: true` dispara el fetch igual al montar. En Ventas eso eran `/api/ventas/resumen` (1.034 ms), `/api/multifashion/overview` (716 ms) y `/api/ventas/clientes-12m` (400 ms) **repitiendo lo que el servidor acababa de resolver**.
> - Fuente única: **`src/lib/swr-servidor.ts` → `opcionesDelServidor()`**, que devuelve `fallbackData` **y** `revalidateOnMount: false` JUNTOS. 🔴 Van juntos porque separarlos rompe en las dos direcciones: sin la opción vuelve la petición duplicada, y con la opción puesta A CIEGAS —sin dato del servidor— la **página 2 del directorio, una búsqueda o un año distinto quedan EN BLANCO para siempre**. Por eso la combinación peligrosa no se puede construir, y hay un test que lo prueba caso por caso.
> - 🩸 **`useSembrarDelServidor()` es lo que impide perder frescura, y sin él SÍ se perdía.** Al volver a un módulo por navegación del SPA, Next vuelve a correr el server component (`staleTimes.dynamic` = 30 s) y manda datos NUEVOS, pero `fallbackData` solo aplica con la caché VACÍA: la pantalla se habría quedado mostrando lo viejo **sin revalidar nunca**. El hook escribe los datos del servidor en la caché con `mutate(datos, { revalidate: false })` — sin tocar la red.
> - 🔴 **`revalidateOnFocus` NO se tocó.** Reclamos lo tiene en `true` a propósito (lo editan varias personas y no hay realtime: volver a la pestaña es cómo cada uno se entera de lo de los demás) y la tarjeta de "venta de hoy" de Multifashion también. Lo único que se apagó es la petición INICIAL.
>
> **2. Clientes era la pantalla más lenta del sistema (5,4 s) porque tenía una SEGUNDA copia de una lectura que ya estaba cacheada.** El server component leía `clientes_master` entera (5.062 filas, 6 viajes paginados) más `switch_clientes` (6.634 filas, 7 viajes) —**11.700 filas y 13 idas a Supabase**— con `force-dynamic` y sin caché, **en cada apertura**, mientras `/api/clientes` hacía exactamente lo mismo detrás de una caché de 60 s. Ahora la pantalla entra por la MISMA puerta (`leerClientesDelGrupo`): **HTML de 3.215 ms → 334 ms**.
> - **Las columnas se compararon una por una antes de tocar nada: son las MISMAS ocho**, el mismo filtro de mundos y el mismo orden — el primer render y el refetch siguen dando el MISMO total, que es lo que sostiene la paginación.
> - ⚠️ **`.slice()` OBLIGATORIO antes del `sort`**: la puerta devuelve el MISMO array que guarda el caché y `sort` ordena en el lugar; sin la copia la pantalla mutaría estado compartido entre requests. Candado en `clientes-puerta-unica.test.ts`.
> - De paso, `leerDelaBase` pasó a leer las dos tablas **en paralelo**: encadenadas eran 13 esperas de red una detrás de otra y no dependen entre sí.
>
> **3. Comisiones disparaba 10 peticiones y 15 consultas donde alcanzaban 1 y 7.** No era un `useEffect` inestable ni componentes duplicados —las deps del hook siempre fueron 3 primitivos—: era un `Promise.all` sobre las **5 empresas que comisionan** con un segundo `fetch` anidado adentro (`/api/ventas/comisiones` ×5 en el mismo milisegundo + `/api/ventas/comisiones/descuentos` ×5). Estaba declarado en el comentario de cabecera del archivo desde el día 1.
> - Nuevo `GET /api/ventas/comisiones/consolidado?year=&mes=`: hace las **mismas 5 RPC `comision_b2b_v5`** del lado del servidor y lee los descuentos de las 5 empresas **de una sola vez** (el `empresa_key` de los descuentos era solo un `.eq()` de filtro: nada obligaba a partirlo en cinco). **10 peticiones → 1 · 15 consultas → 7.**
> - 🔴 **NO se creó una RPC nueva que agrupe las 5.** Eso pide una migración (que corre Daniel a mano) y es la ruta del DINERO. Las 5 RPC siguen siendo 5, con los mismos argumentos: lo que se elimina son los 5 viajes de red del navegador y las 8 consultas de descuentos de más.
> - La lectura de descuentos y la regla del `activo` efectivo se mudaron a **`src/lib/comisiones/descuentos.ts`**, compartidas por los dos endpoints — dos copias serían dos totales de comisión posibles para el mismo mes. La lista de empresas que comisionan (estaba escrita idéntica en dos vistas y ahora la necesita también el endpoint) vive en **`src/lib/comisiones/empresas.ts`**, derivada de `B2B_EMPRESA_KEYS`.
> - **Los descuentos siguen fallando ABIERTO** (si su lectura se cae, la tabla sale con descuentos en 0 en vez de quedar en blanco) y un error de las COMISIONES sí se propaga: una tabla vacía silenciosa se leería como *"este mes no se vendió nada"*.
>
> **4. La MISMA pantalla montaba `<SyncStatus>` dos veces.** Ventas dibuja `ResumenView` (escritorio) y `ResumenViewMobile` a la vez y esconde una con CSS — pero escondida con `hidden md:block` igual se **monta**, así que las dos pedían `/api/sync-status` con la MISMA URL en el mismo instante (733 ms sumados por visita). Le pasaba lo mismo al CXC (`admin/page.tsx` + `PanelCxcMobile`). Ahora se comparte la petición **EN VUELO** por URL. 🔴 **Sin TTL ni caché de resultado a propósito**: con una ventana de tiempo, el refresco tras "Actualizar ahora" —que dispara un `focus` inmediatamente después del sync— devolvería lo viejo, justo cuando el banner tiene que decir la verdad.
>
> **5. Peso muerto de JavaScript.**
> - 🩸 **NO era Session Replay, y la diferencia importa.** La auditoría le atribuyó *"3-4 paquetes por carga y ~55 KB fijos"*; se abrieron los paquetes y los tres dicen **`{"type":"session"}`** (510 bytes cada uno): es el **Release Health** de `browserSessionIntegration`. Replay **no está corriendo ni entra al bundle** — `rrweb` aparece **0 veces** en los chunks del cliente, porque este SDK no lo trae entre sus integraciones por defecto y nadie lo agregó; `replaysSessionSampleRate`/`replaysOnErrorSampleRate` eran opciones **inertes** que hacían creer lo contrario y se quitaron. Se apaga el Release Health (nadie mira "crash-free sessions" y costaba **3 peticiones por pantalla abierta, en cada visita de cada persona**) filtrando la integración por nombre. ⚠️ **`captureException`, `captureMessage`, breadcrumbs, handlers globales y `tracesSampleRate: 0.1` quedan EXACTAMENTE igual.** `disableLogger` (deprecado, avisaba en cada build) pasó a `webpack.treeshake.removeDebugLogging`.
> - **Asistencia era la pantalla más pesada del sistema: 864 KB de JS** porque importaba `xlsx-js-style`, `jspdf` y `jspdf-autotable` ARRIBA del archivo, o sea al ABRIR la pantalla, aunque quien entra a mirar marcas no baje ningún archivo. Ahora se cargan con `await import()` dentro del handler, el patrón que ya usan Ventas, Packing Lists y Catálogos. **864 → 542 KB en escritorio y 693 → 232 KB en celular**; el reporte de build baja de **661 KB a 193 KB** de First Load JS. ⚠️ **El indirecto es la trampa**: `lib/asistencia/exportar` y `lib/excel-export` importan xlsx/jspdf de forma estática, así que importarlos a ELLOS ya arrastra las tres librerías — por eso el `await import()` los envuelve a ellos, no solo a xlsx. `construirPdfPlanilla` se deja SÍNCRONA porque hay un candado que la busca por el texto `export function construirPdfPlanilla`.
> - **`react-markdown` y `@hello-pangea/dnd` desinstaladas** (0 usos, verificado con grep incluyendo `ReactMarkdown`, `DragDropContext`, `Droppable`, `remark-gfm`; ⚠️ `audit-mobile-modulos.md` afirma que las tarjetas del home son draggables con esa librería y **está desactualizado**: el único drag del repo es el nativo del DOM en `VisorFoto.tsx`). **`papaparse` NO se borró**: su único uso es el round-trip de `csv-exports.test.ts`, que es lo que hace valer ese test — se movió a `devDependencies` para que no viaje al runtime de producción.
>
> **Lo que NO se tocó, y es decisión previa documentada:** el prefetch de pantallas (250 ms, 11 KB, no toca la base), la caché del catálogo con invalidación por tag (es el modelo a copiar), el service worker mínimo, el Modo Viaje eliminado y el tamaño 600 px de las fotos.
>
> Candados: `src/__tests__/lib/swr-datos-del-servidor.test.ts` (24), `peso-muerto-js.test.ts` (14) y los de `comisiones-consolidado-neto.test.ts` / `clientes-puerta-unica.test.ts` / `mundos-clientes.test.ts`, actualizados a la regla NUEVA y más estricta (el Directorio pasa de "una consulta propia" a **cero**).
>
> **Verificado por mutación, 12 de 12 cazadas:** separar `revalidateOnMount` de su `fallbackData` rompe 2 · que la siembra no escriba rompe 1 · que un shell deje de usar `opcionesDelServidor` rompe 1 · que deje de sembrar rompe 1 · apagarle a Reclamos la revalidación al foco rompe 1 · sacarle el dedupe a `SyncStatus` rompe 1 · devolver el bucle de 5 fetch a Comisiones rompe 2 · leer los descuentos de a una empresa rompe 1 · que el Directorio se salga de la puerta rompe 2 · reimportar xlsx arriba en Asistencia rompe 1 · devolver el Release Health rompe 1 · devolver `react-markdown` a `dependencies` rompe 1.
>
> 🩸 **DOS DE ESOS CANDADOS PASABAN EN VERDE CON LA MUTACIÓN PUESTA, Y LOS DOS FALLABAN POR LO MISMO: leían el archivo ENTERO, comentarios incluidos.** (a) Apagarle el foco a Reclamos no rompía nada porque **el comentario que explica por qué `revalidateOnFocus: true` se queda contiene el mismo texto que el candado buscaba** — se daba por satisfecho con su propia explicación. (b) `toContain('import from "xlsx-js-style"')` no cazaba un `import * as XLSX2 from "xlsx-js-style"`: la forma de un import no es una sola. Ahora los barridos estáticos **borran los comentarios primero** y el de Asistencia mira las SENTENCIAS `import` línea por línea. Un candado que se cumple a sí mismo con un comentario es peor que no tener candado: da permiso para romper.

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

> **Ventas › Resumen en CELULAR: tarjetas, no matriz (30-jul-2026).** Daniel, textual: *"todavia hay q hacer mucho scroll a la derecha para ver la info"*. Medido en el navegador a 390 px sobre el build de producción: el heatmap pedía **1.109 px contra 356 visibles = 753 px de arrastre**, el peor de las 26 pantallas censadas (el CXC, ya pasado a tarjetas, mide 0). Con 12 meses en 390 px se ven DOS a la vez, así que el heatmap no cumplía ni su propia promesa —comparar empresas dentro del mismo mes— porque para llegar a la columna había que perder de vista la de nombres.
> - **Después: 54 px, y NO son de la tabla** — es la tira de pestañas del módulo (Resumen/Clientes/Productos/Utilidad), que ya desbordaba lo mismo en los 4 tabs desde antes. La tabla pasó de 753 a **0**.
> - **El patrón es el de `admin/components/PanelCxcMobile.tsx`** (tabla ancha → tarjetas), no uno nuevo. Cerrada, la tarjeta muestra empresa + total del año + **el período en curso** (lo que era la columna resaltada del heatmap: sin eso habría que abrir las 8 tarjetas para ver cómo va el mes). Abierta, la lista vertical de los 12 meses (o 4 trimestres) + Total + Proyección, y un enlace al panel mes × año.
> - **El ESCRITORIO NO SE TOCÓ.** Sigue con su matriz en `ResumenView.tsx` detrás de `hidden md:block`: en una pantalla ancha se ve entera y es mejor que las tarjetas. Por eso NO se unificaron, y por eso los candados de `ventas-fila-detalle.test.ts` ahora verifican cada regla contra la vista que le corresponde — exigirle al celular un `colSpan` o un ancho medido sería exigirle la tabla de vuelta.
> - **NINGÚN número cambió, y está medido:** `node scripts/_verif-ventas-tarjetas.mjs` abre las 9 tarjetas en 390 px, lee sus 12 meses + Total + Proyección y los compara **celda por celda contra la matriz del escritorio a 1440 px** — 79 celdas, 0 distintas. ⚠️ El texto crudo de las dos vistas NO es comparable tal cual: el escritorio pega el Δ al monto en la misma celda y el celular usa formato compacto en los totales (`$27K`) desde mucho antes de este cambio. La tolerancia sale de la **precisión que se muestra** (`$27K` no distingue nada por debajo de medio millar), no de un porcentaje al ojo — con un 0,5 % fijo, 27K contra 26.574,97 se leía como "cambió el número" siendo solo el redondeo.
> - **El detalle por período se conserva y sigue abriendo donde se tocó**, ahora como `FilaDetalleBloque` (un `<div>`) en vez de `FilaDetalleTr`. `FilaDetalle.tsx` dibuja el contenido UNA vez (`FilaDetalleContenido`) para las dos formas: cinco copias de la misma celda es lo que ya había divergido en el heatmap —la Proyección del grupo era un `<td>` mudo mientras la de cada empresa sí explicaba de dónde salía—. El bloque de tarjeta **no lleva ancho fijo**: no hay contenedor con scroll lateral que compensar, que es justo lo que se vino a eliminar.
> - **Cerrar la tarjeta cierra el detalle que tuviera adentro.** Sin eso queda vivo en el state del padre y reaparece al volver a abrirla.
>
> **CENSO de scroll lateral a 390 px — `node scripts/_medir-scroll-lateral.mjs`** (26 pantallas, solo lectura). Lo que queda pendiente, de peor a mejor: **Comisiones 628 px** (7 columnas), **Data Health 448**, **Préstamos › Detalle 315** (+218 px cortados), **Depurador 295** (tira de pestañas), **Multifashion › Clientes 288 CORTADOS**, **Ventas › Utilidad 284**, **Ventas › Productos 204**, **Vista General 204**. Sanas en 0: CXC, Cheques (lista y calendario), Caja, Préstamos lista, Guías, Reclamos, Proveedores, Clientes (lista y ficha), Multifashion Resumen/Vendedoras, Marketing, Gastos de Empresa.
> - **Dos desbordes del censo son CARRUSELES a propósito, no defectos:** Ventas › Clientes 369 px y Caja › Período 327 px, los dos con `scroll-snap`. El script los anota igual —no adivina intención— y guarda el `snap` en el JSON para poder distinguirlos a mano.
> - 🩸 **"Recortado" y "hay que arrastrar" NO son lo mismo, y el peor de los dos es el que no se ve.** `Multifashion › Clientes` pierde 288 px con `overflow:hidden`: el dato queda fuera de la pantalla y **no hay forma de alcanzarlo ni arrastrando**. El script lo reporta aparte (`CORTADO`). Distinguir esos de un texto con puntos suspensivos —donde que `scrollWidth` pase del `clientWidth` ES el mecanismo, no un defecto— necesitó dos criterios, porque un `<table>` adentro no alcanza: esa tabla está hecha de `div`. El segundo es de tamaño y el umbral está MEDIDO: en las 26 pantallas todo recorte de texto quedó en **≤53 px** y el único recorte de datos real fue de **288**. Contar los recortes de texto era ruido puro — el CXC, que ya está resuelto, salía con 2 px por un nombre de cliente.
> - ⚠️ **Una tabla vacía mide 0 px y no prueba nada.** El veredicto lo dice (`SIN-DATOS`), y el largo del texto NO sirve para detectarlo: Reclamos, con 26 reclamos y 5 tarjetas, tiene menos texto que el mensaje de "no hay nada" de otra pantalla. La señal confiable es que la pantalla lo DIGA ("No hay…"). Hoy solo Packing Lists está genuinamente vacía.
> - **Gotchas de medición:** sembrar la cookie de sesión **y** `sessionStorage.cxc_role` (si no, todo redirige al login), y `delete Navigator.prototype.serviceWorker` antes de navegar (bloquear el SW de otra forma mata la hidratación). **Préstamos › Detalle se mide por URL directa**: en un viewport <640 px `handleRowClick` abre un bottom sheet en vez de navegar, así que su tabla de movimientos no se alcanza tocando la lista.

### Upload (April 10-11)
- 3-step progress indicator

### Tablas anchas en iPhone y iPad (30-jul-2026)

> **Cuatro pantallas del grupo "Ventas y clientes" se adaptaron, y el ancho que fallaba era el que nadie miraba: el iPad.** Medido en el navegador contra el build de producción, ANTES:
>
> | Pantalla | 390 | 834 | Qué pasaba |
> |---|---:|---:|---|
> | **Multifashion › Clientes** | **288 px RECORTADOS** | **92 px RECORTADOS** | el top-50 perdía columnas **sin forma de alcanzarlas** |
> | Proveedores | 0 | **249 px** de arrastre | columnas de la cuenta por pagar |
> | Clientes › Directorio | 0 | **226 px** de arrastre | columnas de contacto |
> | Multifashion › Vendedoras | 0 | **208 px** de arrastre | columnas de la derecha |
>
> **DESPUÉS: 0 en los cuatro anchos medidos (390 · 834 · 1024 · 1440), en las 4 pantallas.**
>
> 🔑 **LO QUE DECIDE ES EL ANCHO ÚTIL, NO EL DE LA VENTANA.** La barra lateral se lleva 224 px, así que un iPad de 834 deja **610** y su contenido ~552-562 — **más angosto que un iPhone acostado**. Por eso el corte de layout es `lg` (1024) y no `sm` (640) ni `md` (768): a 640 y a 768 la tabla NO entra, y dibujarla ahí ES el bug.
>
> ⚠️ **1024 no es "escritorio": es el MISMO iPad, acostado.** Con el corte en `lg` las tablas reaparecían justo ahí y volvían a arrastrar 18-59 px. Se resolvió haciéndolas ENTRAR en 1024 (relleno `px-1.5 xl:px-3` **solo por debajo de xl**, y el piso de Vendedoras de 760 → 720) en vez de empujar el corte a `xl`, que le habría sacado la tabla a un escritorio de 1024-1279 donde sí cabía. **El escritorio no cambió en nada.**
>
> 🩸 **"Recortado" es PEOR que "hay que arrastrar", y Multifashion › Clientes era el caso.** Su grilla de ancho fijo (`2.5rem 1fr 7rem 4rem 5rem 6rem 5.5rem 2.5rem 1.25rem` = 644 px) vive en una `Card` con `overflow-hidden` y **sin scroller propio**: los píxeles que sobran no se alcanzan de ninguna manera, ni sabiendo que están. Encima el `1fr` del NOMBRE era lo único elástico y se lo comía el resto: **la columna "Cliente" se veía vacía** (0 px de ancho). Es la causa que ya apareció tres veces — contenido dentro de un contenedor recortado y sin scroller adentro. Y está hecha de `div`, sin un solo `<table>`, que es por lo que ningún barrido genérico la había cazado.
> - **Patrón: tarjetas**, el de `admin/components/PanelCxcMobile.tsx` y `components/ventas/ResumenViewMobile.tsx`. No se inventó uno nuevo.
> - **Los meses van en LISTA VERTICAL, no en el gráfico a lo ancho** del escritorio: con 12 meses en 356 px cada columna del sparkline queda en ~29 px y la etiqueta ("May '25", con `whitespace-nowrap`) se sale de su celda. La barra sigue estando —la comparación no se pierde, cambia de eje— y la escala es la MISMA (`peakMes`, compartida entre mayoreo y retail).
> - **El WhatsApp pasó de 24×24 a 44 px** de alto (regla de la casa).
>
> **Las otras tres NO necesitaron componente nuevo:** ya tenían su layout de tarjetas, funcionando y verificado, escondido detrás de `sm:`/`md:`. Solo se les amplió el tramo hasta `lg`.
>
> **NINGÚN número cambió, y está medido:** `node scripts/_verif-tarjetas-vs-tabla.mjs` compara las tarjetas contra la tabla **elemento por elemento** — **215 montos, 0 distintos**, y **0 blancos táctiles bajo 44 px** en las 4 pantallas a 390 y 834.
> - 🩸 **La trampa que el script evita:** verificar buscando el elemento por su clase de breakpoint (`.md\:hidden`) devuelve **vacío** en cuanto el corte se mueve → el chequeo compara CERO y **pasa en verde sin haber mirado nada**. Por eso cada layout lleva un `data-vista` FIJO ("tarjetas"/"tabla") y el script **falla si encuentra cero**.
> - **El pareo va por POSICIÓN, no por nombre**: los dos layouts recorren el MISMO arreglo ya ordenado. Parsear nombres daba falsos "sin par" (nombres partidos en dos líneas, el renglón "Ver N sin saldo" que no es una entidad).
> - **Solo se comparan montos con `$`**: un extractor de "todo lo que parezca número" leía las etiquetas de tramo del CxP ("91-120 días", "121+ días") como cifras y daba 31 falsos positivos.
> - **La tolerancia sale de la precisión MOSTRADA**, media unidad del último dígito visible y sin casos especiales: `$1,234.56` → 0,005 · `$11,406` → 0,50 · `$27K` → 500. La tarjeta de Vendedoras muestra los montos sin centavos; exigirle 0,005 la marcaba como "cambió" cuando la diferencia era el redondeo que ella misma declara.
>
> **Medición cruda sin umbrales: `node scripts/_diag-recorte-exacto.mjs`.** El censo (`_medir-scroll-lateral.mjs`) usa un umbral de 100 px para separar una tabla recortada de un texto con puntos suspensivos — correcto para barrer 26 pantallas, pero **esconde los recortes chicos**: por eso el censo reportó 0 en Multifashion › Clientes a 834 cuando en realidad recortaba 92. Para arreglar una pantalla hace falta el número crudo.
>
> Candado: `src/__tests__/lib/tablas-anchas-ipad.test.ts` (18 casos, verificado por mutación: devolver un corte a `sm` rompe 2).

### Multifashion › Productos — de planilla a respuesta (7-ago-2026)

> Daniel, textual: *"no me encanta, piensa como un CEO quisiera ver de manera simple rapida y minimalista y arreglalo asi"*. **Los números estaban bien; el problema era la forma.** La pestaña entregaba 570 categorías (o 3.928 códigos) × 6 columnas de cifras y nada más: para sacar una conclusión había que leerla entera. **Ningún número cambió** — la matemática sigue viviendo en `productos-ranking.ts` y no se tocó.
>
> **El orden nuevo es el orden en que un dueño PREGUNTA**, no el de las columnas: (1) cómo vamos —unidades, venta, utilidad y margen, cada uno con su cambio contra el año pasado—, (2) qué se vende más y qué deja más plata, en dos listas SEPARADAS con barra proporcional, (3) qué se vende mucho y deja poco, (4) qué movió la aguja en dólares, (5) la tabla completa detrás de **"Ver todo"** (sigue entera: buscador, filtro por categoría, orden por columna y paginado). Derivaciones en `src/lib/multifashion/productos-resumen.ts` (módulo PURO).
>
> **LO NUEVO ES LA COMPARACIÓN, y es una LECTURA, no una estimación.** Se lee el MISMO período un año antes, de la MISMA tabla, agregado con la MISMA función. Medido en producción el 7-ago: 12 meses = **$690.034,75 contra $615.155,70 (+12,2%)** con unidades **+21,2%** y margen **34,7% contra 36,9% (−2,2 puntos)** — o sea *se vende más y se gana proporcionalmente menos*, que es exactamente la conclusión que la planilla tenía adentro y no mostraba.
> - 🩸 **Un mes EMPEZADO se compara contra los MISMOS DÍAS del año pasado.** El 7 de agosto, medir 7 días contra los 31 de agosto-2025 habría mostrado una caída del ~78% que no ocurrió — el error más caro posible acá, porque se ve idéntico a un dato. La pantalla lo dice con las dos fechas: *"Comparado con 1 ago 2025 – 7 ago 2025 (los mismos días del año pasado, para que sea comparable)"*. Medido: **$9.779,01 contra $6.997,07 = +39,8%**. El período actual NUNCA se infla con una proyección; lo que se recorta es el de comparación (`rangoComparativo`).
> - **Contra el AÑO pasado y no contra el mes anterior**, por dos razones que apuntan al mismo lado: en ropa la temporada manda, y es el único otro período que `gerente_acs` puede ver.
> - **El Δ% lo calcula `variacionPct` de `@/lib/variacion`, no este módulo.** Esta pantalla tiene la misma forma de datos que produjo el *"+363024750%"* (grupos con centavos en un período y miles en el otro), así que reescribir la división habría reproducido el bug. El candado `pct-variacion.test.ts` lo impide.
>
> ⚠️ **SUPERADO el 13-ago-2026: la ventana de `gerente_acs` se levantó entera** (*"abrile Multifashion completo"*, ver § Roles). Lo de abajo queda como registro de por qué se hizo así mientras existió; el clamp ya no está y el candado vive en `multifashion-acceso.test.ts`. 
>
> 🔴 **SON DOS RANGOS, y los DOS pasan por el clamp.** La regla de esa ruta ya no es "la ruta tiene un clamp" sino **ningún rango llega a la DB sin que el rol lo haya aprobado**: el comparativo se deriva del período YA acotado y encima se revalida con `clampRangoComparativo`, que exige que quepa ENTERO en uno de los dos meses permitidos (pedir solo que las dos puntas estén "dentro de la ventana" dejaría pasar un rango que las une y se lleva los once meses del medio). Para Jennifer el rango pedido ES el mismo mes del año pasado, así que sí ve su comparación; el guard existe para que eso siga siendo cierto si algún día `rangoComparativo` se mueve. El candado ahora mira **TODAS** las lecturas de `switch_articulo_diario`, no la primera — mirar solo la primera habría dejado la segunda sin vigilancia.
>
> **Costo medido, y falla ABIERTO.** 12 meses = 20.445 + 18.281 filas = 38.726, **7,6 s** contra los 60 s de `maxDuration`; un mes suelto 344 + 236 filas, **1,9 s**. Las dos lecturas van en paralelo y el payload comprimido pasa de **129 KB a 190 KB**. Si la segunda lectura se cae, `comparativo` sale `null`, la pantalla se dibuja completa sin deltas y el error viaja en `comparativoError`: una comparación que no cargó no puede tumbar los números que sí cargaron.
>
> **Lo que NO cambió:** el orden por defecto de la tabla sigue siendo **UNIDADES** y las demás columnas se siguen ordenando con un clic; la línea de que **las notas de crédito ya están restadas** sigue ahí (sin ella, cuadrar contra Switch da exactamente el doble de las devoluciones); el margen puede ser **"—"** y los "—" van al final al ordenar; las descripciones se muestran **tal cual vienen de Switch**; y el agrupador **por marca** no se tocó.
>
> **Diseño dentro del sistema que ya existe** (tarjetas con borde y sin sombra, Playfair en títulos, Geist Mono en toda cifra). Lo único que se agrega es jerarquía: la cifra del pulso a 24 px contra los 13-14 px del resto, **teal = plata / gris = piezas** (son unidades distintas y verlas iguales era la mitad del problema), verde-rojo SOLO para la dirección del cambio y ámbar SOLO para la advertencia de margen. **La barra se mide contra el LÍDER de su lista, no contra el total**: con 570 categorías, contra el total quedan cinco hilos de 1-3 px que no comparan nada; el % del total va como número al lado.
>
> **Los 3 anchos, medidos en el navegador contra el build de producción** (`BASE=… node scripts/_medir-productos-ceo.mjs`, solo lectura), con el detalle cerrado **y** abierto: **390 (útil 390) · 834 (útil 610) · 1440 (útil 1216) → 0 px de arrastre, 0 recortados y 0 blancos táctiles bajo 44 px en los seis estados.** Las dos listas del punto 2 van una debajo de otra hasta `lg` por la misma razón de siempre: a 610 px útiles, dos columnas dejan ~295 px por lista y un monto de 5 cifras con centavos pide 92 px sin contar etiqueta ni barra.
>
> Candados: `src/__tests__/lib/multifashion-productos-resumen.test.ts` (34 casos) y los 4 que en su momento se sumaron a `multifashion-ventana-gerente.test.ts` (archivo retirado el 13-ago-2026 junto con la ventana). Verificado por mutación: comparar contra el mes COMPLETO rompe 2, comparar contra el mes anterior rompe 7, medir la barra contra el total rompe 1, dejar entrar los márgenes "—" en la alerta rompe 3, rankear los movimientos por % en vez de por dólares rompe 2, y aceptar el rango de comparación sin mirar el rol rompe 3.

### Multifashion › Productos — el filtro de MARCA (8-ago-2026)

> Daniel, textual: *"y si quiero ver mis articulos top sellers? o descripciones top seller?"*. El agrupador (categoría / artículo / marca) lo obligaba a **bajar nivel por nivel**. Lo aprobado: **un filtro de marca ARRIBA que filtra todo lo de abajo — un toque, no cuatro.**
>
> 🔴 **LO QUE SWITCH LLAMA "MARCA" NO SON MARCAS, y ese es el corazón del cambio.** El campo `marca` del catálogo de american_classic trae **marca + departamento pegados** (`TH MENSWEAR`, `TH FOOTWEAR`, `CK JEANS`): por eso hay **32 valores con ventas**. **Marcas de verdad hay CINCO.** Medido contra producción el 8-ago (ventana de 12 meses `2025-09-01 → 2026-08-08`, NC restadas, total **$690.034,75**):
>
> | Marca | Venta | % | Margen |
> |---|---:|---:|---:|
> | Tommy Hilfiger | $447.830,67 | 64,9% | 37,8% |
> | Calvin Klein | $160.286,09 | 23,2% | 32,4% |
> | Karl Lagerfeld | $63.296,14 | 9,2% | **23,4%** |
> | Reebok | $15.200,40 | 2,2% | **18,2%** |
> | Joybees | $2.590,80 | 0,4% | 25,3% |
> | Otros | $830,65 | 0,1% | 58,4% |
>
> ⚠️ **Karl Lagerfeld y Reebok venden $78.496 al año con márgenes de 23,4% y 18,2% contra el 37,8% de Tommy.** Ese es el hallazgo, y por eso el filtro **no es un desplegable**: es una tarjeta "Marcas" siempre visible que muestra venta, % y **margen** de cada una, y que además ES el control. **Un solo control** — dos (píldoras arriba + tabla abajo) es el error que este módulo ya pagó con los dos selectores de período. El **ámbar** marca el margen por debajo del general del período (34,7%), el MISMO criterio de la alerta "se vende mucho pero deja poco" que ya existía más abajo.
>
> **El mapa prefijo → marca es EXPLÍCITO** (`src/lib/multifashion/marcas-grupo.ts`, módulo PURO): `TH`→Tommy Hilfiger, `CK`→Calvin Klein, `KL`→Karl Lagerfeld, `RBK`→Reebok, `JOYBEES`→Joybees. Se compara la **PRIMERA PALABRA COMPLETA**, por igualdad exacta — **nada de `startsWith`**, que es un colador: un `THX SPORT` empieza con "TH" y no es Tommy. Todo lo que no esté en el mapa (incluido un nombre que aparezca mañana en Switch) cae en **"Otros"**: la pantalla sigue funcionando y sumando 100%, y nunca se le inventa una marca a un texto que nadie definió.
>
> **Departamentos mal escritos: se juntan AL MOSTRAR (aprobado por Daniel; corregirlo en Switch es tarea suya, aparte).** Lista EXPLÍCITA y corta, no un algoritmo de parecido — `TH MEN` y `TH MENSWEAR` se parecen, pero dos departamentos legítimamente distintos también, y una fusión equivocada no deja rastro. Medido: `TH ACCESSORIES` ($57.669,44) + `TH ACCESORIES` ($2.923,55) = **$60.592,99** · `TH MENSWEAR` + `TH MEN` · `TH OTHER` + `TH OTHERS`. Los 32 departamentos quedan en **29**.
>
> **El agrupador "Por marca" pasó a llamarse "Por departamento"**, y es lo único que cambió de nombre: con el filtro de marca arriba, llamarle "marca" a los 32 valores de Switch dejaba dos controles diciendo cosas distintas con la misma palabra. Sus números no cambiaron (salvo la fusión de los mal escritos).
>
> **NINGÚN NÚMERO CAMBIA, y no se recalcula nada a mano.** Cada marca se agrega con `agregarRanking`, la MISMA función que produce los totales de siempre: las NC siguen restando **dentro de cada marca**, el margen sale del agregado y los "—" siguen siendo "—". Verificado contra producción: **la suma de las 6 marcas da $690.034,75, exactamente el total sin filtrar (diferencia $0,00)**, y lo mismo en el comparativo ($616.960,32). El orden por defecto sigue siendo unidades y la línea de "las devoluciones ya están restadas" sigue ahí.
>
> 🔴 **EL FILTRO NO ES UN PARÁMETRO DE LA RUTA — y eso es lo que lo mantiene fuera del clamp.** Las mismas filas ya leídas se reparten en las 5 marcas (+Otros) y viajan particionadas en `porMarca`; el navegador filtra **sin red**. Un `?marca=TH` habría sido (a) otro rango contra la base por cada toque —20.445 filas, 9 s— contra una base que ya se cayó por saturación, y (b) una superficie nueva que tendría que pasar por `clampPeriodoProductos`. **No se agregó ni un parámetro ni una lectura**, así que el inventario de rutas del candado estructural no se movió y sigue verde (hoy en `multifashion-acceso.test.ts`). Jennifer ve el filtro sobre SU mes, con la comparación de SU mes.
>
> **La comparación contra el año pasado también se filtra**, y por eso el comparativo viaja particionado igual: con Tommy elegido, compararlo contra el total del período daría una caída del 35% que es puro artefacto del filtro. Una marca que no existía el año pasado lo DICE ("En ese período esta marca no vendió nada") en vez de dejar tres "sin comparación" sueltos.
>
> **Las filas particionadas viajan LIVIANAS** (`{g,c,u,v,k,a}`, nombres de un carácter porque se repiten 4.573 veces) y el navegador rearma `utilidad = venta − costo` y el margen con `margenDe` — **las MISMAS funciones del servidor**, no una segunda definición de margen. La descripción del artículo se reusa del arreglo completo que ya viajaba (es el texto más pesado del payload). **Costo medido, 12 meses: 1.721 KB crudos / ~303 KB comprimidos (antes 190 KB) y 9,1 s contra los 60 s de `maxDuration`; un mes suelto 129 KB y 1,87 s (sin cambio).** Si algún día hay que bajarlo, la palanca es mandar los códigos con una etiqueta de marca en vez de particionarlos (un código pertenece a UNA marca: medido, 0 de 3.928 caen en dos) — no cortar listas.
>
> **Fail-open:** sin diccionario de marcas (`marcaDisponible=false`) `porMarca` sale `null`, no se dibuja el filtro y la pantalla queda **exactamente como estaba**. Un artículo que el diccionario no conoce cae en "Otros", nunca se descarta: si se descartara, las marcas no sumarían el total. Medido el 8-ago: **0 filas del período sin entrada en el diccionario.**
>
> **Los 3 anchos, medidos en el navegador contra el build de producción** (`BASE=… node scripts/_medir-productos-marca.mjs`, solo lectura), en tres estados (Todas / una marca / una marca con "Ver todo" abierto): **390 (útil 390) · 834 (útil 610) · 1440 (útil 1216) → 0 px de arrastre, 0 recortados y 0 blancos táctiles bajo 44 px en los NUEVE estados.** El selector mide 447 px de alto en celular y iPad (7 filas de ~56 px, ya en el piso táctil) y **253 px desde `xl`**, donde va a dos columnas: a 1216 px útiles una sola columna dejaba ~900 px de blanco entre el nombre y el monto. No se pasa a dos columnas antes de `xl` porque a 610 px útiles el renglón "% del total · N piezas" empieza a recortarse.
>
> Candados: `src/__tests__/lib/multifashion-marcas-grupo.test.ts` (30 casos: los 32 departamentos reales caen en su marca, `THX SPORT`→Otros, las 3 equivalencias y solo esas, las particiones suman el total, las NC restan por marca, rehidratar es idéntico campo por campo a `agregarRanking`) y **`src/__tests__/components/multifashion-filtro-marca.test.tsx`** (11 casos que RENDERIZAN el componente real y tocan la marca: el riesgo verdadero no es la matemática sino que el filtro llegue a unos bloques y a otros no — un pulso de Tommy con la tabla de todas se ve normal y es una pantalla mintiendo). Verificado por mutación: dejar la tabla sin filtrar rompe 3, dejar el pulso con los totales globales rompe 2, comparar la marca contra el período completo rompe 1, cambiar el mapa a `startsWith` rompe 1, quitar las equivalencias rompe 2, descartar los artículos sin marca rompe 6 y tocar la cuenta de utilidad al rehidratar rompe 10. Diagnóstico read-only: `npx tsx scripts/_diag-marcas-multifashion.ts`.

### Multifashion › Productos — la suma la hace Postgres (9-ago-2026)

> **9,0 s → menos de 1 s, y NINGÚN número cambia.** El filtro de marca había subido la pestaña de 7,6 a 9,1 s. La causa no era el filtro ni la matemática: **la ruta se bajaba las filas CRUDAS y las sumaba en JavaScript**, y bajarlas cuesta 49 viajes a Supabase puestos uno atrás de otro.
>
> **Medido contra producción el 9-ago (ventana `2025-09-01 → 2026-08-09`):** 20.483 filas del período (21 páginas de PostgREST, `db-max-rows`=1000) + 18.417 del comparativo (19 páginas) + 8.454 del diccionario de marcas (9 páginas, y **estas empezaban recién cuando las otras dos terminaban**). Respuesta: **8.622 / 9.030 / 8.622 ms**, payload 1.723 KB crudos / **303,5 KB** comprimidos. Un mes suelto: 382+372 filas, **1.628-1.801 ms**, 24,8 KB.
>
> **La palanca: agrupar en Postgres.** `multifashion_articulo_diario_agrupado_v1` (migración `20260809140000`) devuelve el período ya sumado por `(articulo_id, codigo, descripcion, tipo)`: **20.483 filas → 4.740 (4,32× menos) en UNA llamada**, y de 3,70 MB a 0,40 MB entre Supabase y Vercel. Con `multifashion_articulo_marca_v1` para el diccionario, las **tres** lecturas van en paralelo y son **3 viajes en vez de 49**.
> - **El trabajo REAL de Postgres está medido, no supuesto: 222 ms** para agregar las 20.483 filas (383 ms de una RPC equivalente que ya existe en producción, `switch_top_descripciones`, menos 161 ms de piso de red medido con una RPC trivial). Una sola página de 1.000 filas cuesta **364 ms**: la agregación entera sale igual que UNO de los 21 viajes que elimina.
> - **Lo que NO era el problema, medido:** agregar en JavaScript cuesta **35-75 ms** y serializar los 1.723 KB **3-4 ms**. Los 9 segundos eran red, enteros.
>
> 🩸 **`tipo` ES PARTE DE LA LLAVE DE AGRUPACIÓN Y LA RPC NO FIRMA NADA.** Devuelve MAGNITUDES, igual que la tabla; las notas de crédito las sigue restando `signoDeTipo()` en `productos-ranking.ts`, que es la ÚNICA definición del signo que tiene la pantalla. Firmar en el SQL habría creado una segunda — el bug que este repo ya pagó dos veces, y cuya firma es que la diferencia da exactamente el DOBLE de las NC (acá serían $51.694,14 sobre $25.847,07).
>
> **Por qué agrupar así es seguro por construcción: la llave del SQL es más FINA que la del código.** La pantalla agrupa por categoría (`descripcion` con los espacios colapsados) y por código; el SQL agrupa por el texto CRUDO sin normalizar nada. Lo que Postgres deja separado, el código lo junta igual que siempre. Al revés sería imposible de deshacer.
>
> **Tres detalles sin los cuales sí cambiaban números:**
> - **`ORDER BY MIN(id)`.** La lectura vieja paginaba con `.order("id")`, y de ese orden depende un dato VISIBLE: la 2ª línea de "por artículo" es la descripción de la PRIMERA fila que la traiga. Medido: **69 de 3.941 códigos tienen MÁS DE UNA descripción** en la ventana (`Women-Polo S/S Core` vs `Women-Polos S/S Core`). Sin el orden, esas 69 filas podían mostrar la otra. Se ordena por `id::text` —el uuid se imprime en hex de sus 16 bytes en orden, así que el orden de texto es EL MISMO— para no depender de `min(uuid)`, que solo existe desde PG14.
> - **`filasLeidas` sigue contando filas CRUDAS, no grupos.** La RPC devuelve `COUNT(*)` en la misma pasada. Ese campo es la prueba de que no hubo truncado silencioso; hacerlo significar otra cosa lo habría vaciado de sentido.
> - **Las sumas no pueden redondear distinto, y está medido.** Postgres suma `numeric` exacto y el código suma en coma flotante: un total parado justo en el borde `.005` podría redondear a centavos distinto. Sobre las 20.483 filas de la ventana, `cantidad_total` no tiene decimales y `venta_total`/`costo_total` tienen **como máximo 2** → toda suma es múltiplo exacto de un centavo y ese borde no existe en este dato.
>
> ⚠️ **SUPERADO el 13-ago-2026: la ventana de `gerente_acs` se levantó entera** (*"abrile Multifashion completo"*, ver § Roles). Lo de abajo queda como registro de por qué se hizo así mientras existió; el clamp ya no está y el candado vive en `multifashion-acceso.test.ts`. 
>
> 🔴 **LA VENTANA DE `gerente_acs` NO SE MOVIÓ DE LUGAR.** `p_desde`/`p_hasta` los sigue decidiendo el servidor DESPUÉS de `clampPeriodoProductos` y `clampRangoComparativo`; la RPC no sabe de roles y no debe. El candado `multifashion-ventana-gerente.test.ts` ahora normaliza **las dos formas de leer** (`lecturasArticulos()`: los argumentos de la RPC **y** los `.gte()/.lte()` de la tabla) y las mira juntas — vigilar una sola habría dejado la otra abierta, que es exactamente el error que ese archivo ya había corregido cuando la ruta pasó a leer dos períodos. Sube de 75 a 77 casos, con uno nuevo que prueba el **fallback** y otro que prueba que la empresa no se cambia ni por query.
>
> ⚠️ **DDL PENDIENTE — `supabase/migrations/20260809140000_multifashion_productos_agregado.sql`, la corre Daniel A MANO. La pantalla funciona ANTES de que corra.** Si PostgREST contesta "no existe esa función" (PGRST202/42883), la ruta cae sola al camino paginado de siempre, lo escribe en el log de Vercel y lo dice en el campo nuevo **`fuentes`** de la respuesta (`{"periodo":"rpc|paginado", …}`). **Verificado contra producción con la migración SIN correr:** las respuestas de 12 meses y de un mes salen **idénticas campo por campo** a las de producción. `esFuncionAusente()` es estrecho a propósito: un timeout o un permiso denegado se propagan — caerse al camino de 49 consultas ante un error de verdad sería esconderlo y agrandarlo contra una base que ya se cayó por saturación.
>
> **El camino paginado NO es decorado y se queda:** `db-max-rows`=1000 corta EN SILENCIO, y sin paginar se leerían 1.000 de 20.483 filas — el 4,9% de las ventas SIN UN SOLO ERROR.
>
> **Verificación, y es la que importa: `ANTES=/tmp/mf-antes/12m.json npx tsx scripts/_verif-productos-rpc-equivalencia.ts`** (solo lectura). Reconstruye la respuesta ENTERA por los dos caminos sobre las MISMAS filas de producción y las compara contra la respuesta real capturada, campo por campo: **0 diferencias en los tres pares**, y **la suma de las 6 marcas da $691.237,28 = el total sin filtrar, diferencia $0,00**. Medición: `SESSION_TOKEN=… BASE=… OUT=… node scripts/_medir-productos-multifashion.mjs`. Diagnóstico del agrupamiento (cuántos grupos, decimales, códigos con dos descripciones): `node scripts/_diag-agrupacion-articulo-diario.mjs`.
>
> Candado: `src/__tests__/lib/multifashion-productos-lectura.test.ts` (20 casos; `agruparComoPostgres()` simula el SQL y se exige EQUIVALENCIA con `agregarRanking` ×2, `agregarProductos` y `armarPorMarca`). Verificado por mutación: firmar las NC en el SQL rompe 7, sacar `tipo` de la llave rompe 6, perder el `tipo` al traducir rompe 7, quedarse sin `ORDER BY MIN(id)` rompe 3, sacar `descripcion` de la llave rompe 3, reordenar al traducir rompe 2, un `esFuncionAusente` generoso rompe 1 y devolver los grupos como `filasLeidas` rompe 1. En el candado de la ventana: mandarle a la RPC el rango sin clamp rompe 7, mirar solo la tabla rompe 13 y aceptar la empresa por query rompe 1.

### Multifashion › la venta de HOY, en pantalla (8-ago-2026)

> Daniel, textual: *"quiero ver también venta del día en multifashion"*. Ese número existía —y era correcto— pero **solo le llegaba por Telegram a las 8pm** (cron `acs-resumen-diario`, 01:00 UTC). Ahora es lo PRIMERO que se ve al abrir el módulo, arriba de los sub-tabs y del selector de mes.
>
> 🔴 **NO SE ESCRIBIÓ UNA SEGUNDA CUENTA.** La venta retail del día vive en **`src/lib/multifashion/retail-dia.ts`** (`leerRetailRango`), y de ahí salen **los dos**: el mensaje de Telegram (`acs-resumen-diario.ts` perdió su consulta y ahora la importa) y la tarjeta de la pantalla (`/api/multifashion/venta-hoy`). Si la pantalla y el Telegram dieran números distintos, Daniel no dejaría de creerle al que está mal: dejaría de creerle a los dos. El candado `multifashion-venta-hoy.test.ts` corre **los dos consumidores sobre las mismas filas y exige el mismo centavo**, más un barrido estático que pone el build ROJO si `acs-resumen-diario.ts` vuelve a tener su propio `.from("_multifashion_sf_vw")` o su propio `.eq("is_wholesale", …)`.
>
> **Semántica (la del módulo, sin cambios):** `_multifashion_sf_vw`, **retail puro** (`is_wholesale=false`), `SUM(subtotal)` FIRMADO sobre `subtotal_descuento` — **las notas de crédito RESTAN**. `documentos` es el `COUNT(*)` de siempre (NC incluidas), el mismo que el Resumen muestra como "tiquetes".
>
> 🩸 **La firma del error de signos, medida el 8-ago-2026:** ACS tuvo **48 facturas por $2.718,44 y 2 NC por $98,75**. Sumando todo en crudo dan **$2.817,19**; restando las NC —lo correcto, y lo que hace la vista— dan **$2.619,69 con 50 documentos**. La diferencia ($197,50) es **exactamente el doble de las NC**. El número bueno es $2.619,69, y así lo dice el Telegram desde siempre.
>
> **La frescura NO es opcional, y por eso viaja SIEMPRE en el payload.** El sync de facturas de ACS corre cada ~2 h: el número nunca es "ahora mismo", es "hasta el último sync". Una pantalla que a las 11pm muestre `$2.619` a secas cuando lo último que entró es de las 8pm **está mintiendo**, y encima miente hacia abajo justo cuando el dueño quiere saber cómo cerró el día. `sync.ultimo` = el `finished_at` del último sync **success** de `(american_classic, facturas)` cuyo rango cubre el día; pasadas **3 h** (`REZAGO_MS`, una corrida perdida) la tarjeta cambia a ámbar y dice *"sin actualizar desde las …"*. Sin poder confirmarlo dice eso mismo, nunca inventa una hora. No hay rama que pinte el monto sin su hora — el test lo verifica leyendo el componente.
>
> **$0 y "todavía no hay ventas" NO son lo mismo.** La bandera es `hayVentas = documentos > 0`, **no el monto**: a las 9am la tienda no facturó porque recién abre, y pintar "$0" ahí asusta a quien mira. Pero un día que vendió $100 y los devolvió tiene neto $0 **con** movimiento, y ése es un cero de verdad que se muestra como cero.
>
> **El titular compara contra el MISMO DÍA DE LA SEMANA PASADA (−7 días), no contra ayer.** Se calculan y se muestran los dos, pero el grande es el de hace 7 días: en una tienda de mostrador el día de la semana manda sobre casi todo, y "hoy lunes vs ayer domingo" produce una caída enorme que es del calendario, no del negocio. Hace 7 días es el mismo día de semana **y** está a una semana (misma temporada, mismos precios). Es la misma razón por la que el Telegram compara el día contra −364 días. "Ayer" queda en chico y rotulado. Mientras la tienda no cierre (7pm Panamá) la tarjeta rotula el día como **en curso**, para que el comparativo contra un día completo no se lea como un desplome a media mañana.
>
> **Panamá es UTC-5 fijo.** "Hoy" sale de `hoyPanama()`; calculado en UTC pelado, entre las 7pm y la medianoche el día saltaría al siguiente y la pantalla mostraría $0 todas las noches. Los tests usan fechas FIJAS (`vi.setSystemTime`).
>
> ⚠️ **SUPERADO el 13-ago-2026: la ventana de `gerente_acs` se levantó entera** (*"abrile Multifashion completo"*, ver § Roles). Lo de abajo queda como registro de por qué se hizo así mientras existió; el clamp ya no está y el candado vive en `multifashion-acceso.test.ts`.  Hoy los DOS comparativos se piden siempre.
>
> 🔴 **La ventana de `gerente_acs`, con un matiz nuevo.** "Hoy" cae en el mes en curso, así que para Jennifer siempre está adentro y `clampFechaDia` nunca lo mueve — **el clamp va igual**, porque la regla del módulo es que ninguna ruta toca la base sin acotar con `auth.role`. Lo que SÍ se cae de la ventana son los **días comparativos** los primeros días de cada mes (el 3 de agosto, "hace 7 días" es el 27 de julio): **`clampDiaComparable` devuelve `null` y ese comparativo no se consulta ni se muestra**. Devolverle "hoy" —como hace `clampFechaDia`— habría sido comparar hoy contra hoy: un **0% perfectamente falso**, peor que no mostrar nada.
>
> **Los 3 anchos, medidos en el navegador con datos de producción** (`BASE=… node scripts/_medir-venta-hoy-anchos.mjs`, solo lectura): **390 · 834 · 1440 → 0 px de arrastre, 0 recortados y 0 hijos desbordados**. La tarjeta es de solo lectura (sin controles), así que no hay blancos de 44 px que respetar. Verificación read-only del dato: `node scripts/_diag-venta-hoy-acs.mjs`.
>
> Candado: `src/__tests__/lib/multifashion-venta-hoy.test.ts` (26 casos) + los 5 que entonces vivían en `multifashion-ventana-gerente.test.ts` (archivo retirado el 13-ago-2026 junto con la ventana). Verificado por mutación (9 de 9 cazadas): quitar el filtro retail rompe 7, sumar las NC rompe 7, calcular "hoy" en UTC rompe 3, hacer que `clampDiaComparable` devuelva siempre la fecha rompe 4, mirar el monto en vez de los documentos rompe 1, dar la frescura siempre por buena rompe 1, comparar contra ayer en vez de hace 7 días rompe 6, sacarle el clamp a la ruta rompe 1 y sacar la tarjeta del shell rompe 2.

### Multifashion › METAS — configurables, con proyección por temporada (13-ago-2026)

> Daniel, textual: *"si armalo, en multifashion, y que sea configurable para el futuro hacer otras metas grupales y por vendedora (incluyendo a la gerente jennifer que comisiona por tienda y ventas personales)"*.
>
> La primera meta —**ya anunciada al personal, o sea que el número NO se toca**— es **"Meta del viaje" · 1-sep a 31-dic-2026 · $420.000 · premio: un viaje para todas ($2.000)**. Pero lo que se construyó **no es esa meta**: es un sistema donde Daniel crea las que quiera, con período libre, tipo (grupal o por vendedora) y participantes.
>
> **Pestaña nueva: Multifashion › Metas** (6ª). El módulo pasa de 5 a 6 sub-tabs.
>
> ### 🔴 QUÉ ES "VENTA" PARA UNA META — la misma definición de siempre, sin una segunda
>
> `_multifashion_sf_vw` (american_classic), **`is_wholesale = false`**, y la suma del subtotal **FIRMADO** — con el descuento ya aplicado y las **notas de crédito RESTANDO**. Es exactamente lo que ya usaban `leerRetailRango` y el Resumen; no se escribió una segunda cuenta.
>
> 🩸 **NO es `subtotal` a secas de `switch_facturas`: ése es ANTES del descuento.** Factura real: `subtotal 354,10 − descuento 221,01 = subtotal_descuento 133,09`, más ITBMS 9,32 = total 142,41. Daniel mira el subtotal **sin ITBMS**, o sea `subtotal_descuento` — que es justo lo que la vista proyecta como `subtotal`. Usar el otro **infla la meta ~5%**. Y si las NC se suman en vez de restarse, la diferencia da EXACTAMENTE el doble de las devoluciones.
>
> **Medido contra producción el 13-ago-2026** (`DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-metas-multifashion.ts`, solo lectura), y estos números son los fixtures de los tests: retail **ene-jul 2026 $305.092,60** · **sep-dic 2025 $340.698,55** · **1-13 ago 2026 $21.055,23** (contra $14.376,71 los mismos días de 2025).
>
> ### 🔴 LA PROYECCIÓN NO VA POR DÍAS, Y ES TODO EL PUNTO
>
> Daniel pidió *"que vean cómo van"*. La respuesta ingenua —regla de tres sobre los días transcurridos— **MIENTE**, con un error medido:
>
> | mes | venta 2025 | % de la temporada |
> |---|---:|---:|
> | septiembre | $36.430,41 | 10,7% |
> | octubre | $46.429,63 | 13,6% |
> | noviembre | $57.580,78 | 16,9% |
> | **diciembre** | **$200.257,73** | **58,8%** |
>
> Al 31 de octubre habrán pasado **61 de 122 días (la mitad del calendario) pero apenas el 24,3% de la venta esperada**. Con regla de tres, una tienda que va **PERFECTA** para llegar a $420.000 se vería como si fuera a cerrar en **~$204.000**: la pantalla anunciaría un fracaso rotundo en el mes en que todavía no pasó nada. Y el error simétrico es igual de caro.
>
> Así que el reloj de esta pantalla **no son los días: es cuánta temporada pasó**. `proyección = vendido ÷ (temporada transcurrida ÷ temporada total)`, donde el peso de cada día sale de lo que ESE MISMO mes vendió el año pasado. Misma idea que `multifashion_proyeccion_cierre_v1` usa para el año, acá sobre un rango libre. Módulo PURO: `src/lib/multifashion/metas-avance.ts`.
> - ⚠️ **El peso de un mes se reparte entre los días de ESE MES, no del período.** Un período que agarra medio diciembre no puede llevarse el peso de diciembre entero — y diciembre pesa el 58,8%.
> - ⚠️ **Sin año pasado se cae a los días Y LA PANTALLA LO DICE.** Proyectar con una regla peor sin avisarlo sería el problema; la regla peor no.
> - 🔴 **Al principio NO se proyecta.** Con el 2% de la temporada transcurrida, dividir por 0,02 multiplica por 50 cualquier ruido: un día bueno "proyecta" el triple de la meta. Por debajo de `FRACCION_MINIMA_PARA_PROYECTAR` (5%) la pantalla dice *"todavía es muy pronto para saber si el ritmo alcanza"*. **Un número inventado con cara de dato es peor que no tener número.**
> - 🔑 **Los pesos NO cuestan una lectura cara**: salen de `multifashion_overview_serie_v1(anio)`, una RPC que ya está en producción desde jun-2026 y devuelve los 12 meses en una llamada. **La proyección ponderada funciona ANTES de que corra la DDL.**
>
> ### 🩸 LOS NOMBRES DE VENDEDORA ESTÁN PARTIDOS EN DOS, Y UNA META MEDIRÍA LA MITAD
>
> Medido: **14 nombres distintos en Switch para 11 personas**. Tres están cargadas de dos formas — `Ana Trejos`/`ANA TREJOS`, `Yeisibeth Muñoz`/`YEISIBETH MUÑOZ`, `Cindy De Gracia`/`CINDY DE GRACIA` — así que una meta por vendedora sobre el texto crudo mediría **la mitad** de lo que esa persona vendió, sin un solo error a la vista.
>
> Fuente única: **`claveVendedora`** (`src/lib/multifashion/metas-clave.ts`) — mayúsculas, sin acentos, espacios colapsados, **igualdad EXACTA**. La MISMA función arma la lista que se elige y suma el avance, así que **lo elegido y lo medido no se pueden separar**.
> - 🔴 **Nada de parecido ni distancia de edición.** Es la lección de las tiendas (`Outlet Duty Free N2` vs `N3`, ver § Guías): dos personas fusionadas por parecido repartirían un premio mal.
> - 🔴 **NO se corrigen los nombres en Switch ni en la base.** No se escribe una sola fila; se agrupa AL LEER. Corregirlos es decisión de Daniel y va aparte.
> - 🔴 **NO hay lista negra de personas.** Solo se excluye `DEFAULT` (el marcador del sistema, con el MISMO criterio que ya usa `multifashion_vendedoras_v3`). Cualquier otro nombre se muestra y **simplemente no se marca** — decidir por código quién es vendedora sería decidir por Daniel.
> - **Quién participa se elige de una LISTA, nunca se escribe.** Y cuando alguien está cargada de varias formas, la fila lo dice (*"En Switch está escrita de 2 formas: …"*): si la agrupación juntara a dos personas distintas, se vería ahí en vez de esconderse dentro de un total.
>
> 🔴 **LA LISTA DICE DESDE CUÁNDO NO VENDE CADA UNA.** Varias de las que aparecen con ventas grandes ya no trabajan, y el premio de esta meta es un viaje. Medido (venta 2026, 1-ene → 13-ago): **Jailine $90.777,30** (última 13-ago) · **Milagros Torres $83.537,61** (13-ago) · **Sheynee Batista $62.112,09** (13-ago) · **Jennifer Miranda $42.669,12** (13-ago) · **Witney Miranda $27.018,20 (última 28-mar — hace 4 meses)** · Yeisibeth Muñoz $7.269,10 (29-jun) · Ana Trejos $6.739,75 (21-jul) · **Cindy De Gracia $3.203,24 (11-ago, o sea que SÍ está vendiendo)** · Angel pizza $1.310,57 (13-feb) · Yerling Gómez $9,97 (6-mar).
> - ⚠️ **El sistema NO las filtra: lo DICE** (fecha + ámbar pasados 45 días) y elige Daniel.
>
> ### 🔴 UNA META GRUPAL MIDE LA TIENDA ENTERA — elegir participantes NO recorta lo que se mide (14-ago-2026)
>
> Daniel, textual: ***"la meta es de 420 del subtotal para la tienda. Mostrar aporte porcentual de cada vendedora de las 4 q están todos los meses"***.
>
> **El código del #547 hacía lo contrario y era el defecto más caro del módulo:** `avanceDeMeta` sumaba SOLO a las participantes en cuanto había alguna elegida, así que marcar a las 4 habría hecho que la meta midiera únicamente lo de ellas. Hoy el avance de una meta `grupal` es **SIEMPRE `totalDe(filas)`** —el total pelado, `DEFAULT` incluido, el mismo número contra el que Daniel verifica en la pantalla de Ventas— y **los participantes pasan a ser solo a quién se le MUESTRA el aporte**. En una meta `tipo === "vendedora"` no cambia nada: ahí cada una tiene su objetivo escrito a mano y el grupo ES la suma de las elegidas.
>
> 🩸 **POR QUÉ, medido contra producción (may-jul 2026, `scripts/_verif-meta-mide-la-tienda.ts`, solo lectura):** la tienda vendió **$147.737,77** y las 4 vendedoras **$141.705,00 = 95,9%**. El otro **4,1% ($6.032,77)** son ventas facturadas con **códigos viejos que siguen abiertos en Switch** — `YEISIBETH MUÑOZ $2.042,21` (última 29-jun), `ANA TREJOS $1.786,77` (21-jul), `CINDY DE GRACIA $1.607,98` (11-ago) y `DEFAULT $595,81`: gente que **ya no es vendedora** y cuyos usuarios alguien sigue usando para facturar. Sobre los $420.000 de la meta eso son **~$17.000**, y la proyección al ritmo real cierra en **$378.654** — o sea que esos $17.000 deciden si el viaje se gana o no. **Una venta de la tienda no puede desaparecer del viaje porque se facturó con el código equivocado.**
>
> 🔴 **LA CONSECUENCIA SE MUESTRA, NO SE ESCONDE: los aportes suman ~96% y la pantalla dice por qué.** Una lista que suma 96% sin explicación se lee como una cuenta mal hecha y hace desconfiar del número entero. La línea es *"El 4% que falta son ventas hechas con el código de alguien que no está en esta lista — casi siempre, gente que ya no trabaja acá. Cuentan para la meta igual."*, y va **al pie de la lista de aportes en las DOS pantallas** (la tarjeta de Metas y el bloque dentro de Vendedoras), sacada del MISMO módulo puro (`textoAporteNoAsignado` en `metas-clave.ts`) — dos redacciones del mismo hecho se separan con el tiempo.
> - ⚠️ **EL PORCENTAJE SE CALCULA DEL PERÍODO DE CADA META** (`MetaConAvance.aporteNoAsignado`), **no es un 4% escrito a mano**: sobre sep-dic 2025 con las mismas 4 da **59,3%**. El día que esos códigos se cierren en Switch baja solo hasta 0 y la línea **desaparece** de la pantalla.
> - ⚠️ **LA CAUSA VA COMO "CASI SIEMPRE", NO COMO CERTEZA.** Lo que SIEMPRE es cierto es que esa venta salió con el código de alguien que no está en la lista; que sea gente que ya no trabaja acá es lo que pasa HOY. En el 59,3% de sep-dic 2025 son personas que en ese momento sí trabajaban — afirmar la causa haría que la pantalla mienta en cuanto cambie el período.
> - **No se dibuja nunca "el 0% que falta"**: por debajo de `APORTE_NO_ASIGNADO_MINIMO` (0,5%) devuelve `null`.
>
> **El formulario lo dice AL ELEGIR, no después.** La opción grupal pasó de *"Se suma lo que venden todas juntas"* a **"Cuenta toda la venta de la tienda."**, y el texto de participantes de *"Si no marcas a nadie, la meta cuenta toda la venta de la tienda"* (que insinuaba lo contrario) a **"La meta cuenta toda la venta de la tienda, marques a quien marques. A las que marques se les muestra cuánto aportó cada una."**
> - 🩸 **Y de paso se corrigió un texto que MENTÍA** en el otro tipo de meta: decía *"ponle su monto (si lo dejas vacío, usa el monto de arriba)"* y **ese monto NO se hereda** — `avanceDeMeta` deja `objetivo` en `null` a propósito (*"Las metas personales las pongo yo a mano"*), así que dejarlo vacío deja a esa vendedora **SIN meta**. **El código está bien y no se tocó**; lo que llevaba a dejar campos vacíos era el texto. Ahora dice **"La que quede sin monto no tiene meta."** (y el placeholder, *"sin esto no tiene meta"*). Guardar con montos vacíos **ya estaba bloqueado** por `falta` → *"Falta: el monto de N vendedoras"*, y ahora hay candado que lo fija.
>
> **Medido contra producción:** el avance con las 4 elegidas da **$147.737,77 = el total de la tienda**, idéntico a pedirlo **sin ningún participante**; los aportes son Sheynee 32,4% · Milagros 28,0% · Jailine 23,9% · Jennifer 11,6% = **95,9%**, y lo no asignado **4,1%** — los aportes más el faltante dan exactamente 100% al centavo.
>
> **Los 3 anchos (+ el iPad acostado), en el navegador contra el build de producción** (`BASE=… node scripts/_medir-metas-anchos.mjs`, solo lectura): **390 · 834 · 1024 · 1440 → 0 px de arrastre, 0 recorte, 0 blancos táctiles bajo 44 px y 0 textos bajo 12 px** en los 14 casos. La línea nueva crece hacia abajo (la tarjeta pasa de 767 a **789 px** de alto a 390 px).
>
> **Candados:** los del archivo de siempre (`multifashion-metas.test.ts`, ahora 92) **ejecutan `avanceDeMeta` de verdad** con la base doblada — un barrido de texto no serviría, la regla vieja y la nueva se distinguen por UNA línea — más **`src/__tests__/components/multifashion-meta-aporte-tienda.test.tsx` (9), que RENDERIZA las dos pantallas**.
> - 🩸 **El primer candado de la línea pasaba en VERDE con la línea borrada**, porque buscaba `textoAporteNoAsignado` dentro del .tsx y el `import` de arriba ya lo contiene. **Cuarta vez que este repo paga lo mismo** (ver el `revalidateOnFocus` de Reclamos, el `<h1>` de Saldos y el `fetchMayorAsientos` del mayor). Por eso el candado bueno pinta la pantalla.
> - **Verificado por mutación, 8 de 8 cazadas:** volver a la regla vieja (6 tests) · hardcodear el 4% (3) · borrar la línea de la tarjeta (1) o de Vendedoras (1) · devolver el texto viejo de la opción grupal (1) · devolver la mentira del monto heredado (1) · afirmar la causa como certeza (1) · dibujar la línea aunque redondee a 0% (3).
>
> ### 🔴 UNA META GRUPAL NO GENERA METAS INDIVIDUALES
>
> Daniel, textual: *"las vendedoras no deberian de tener meta individual diferente cuando se abre una nueva meta, lo de verlo en la vendedora es solo si se programa meta por vendedora"* y *"Las metas personales las pongo yo a mano… es cuando no hay metas grupales, sino individuales"*.
>
> **No existe ningún reparto automático**: ni en partes iguales ni a prorrata de lo vendido, y **no hay `?? meta.objetivo` de respaldo** (sería inventarle un objetivo a alguien). En una meta por vendedora, cada monto **se escribe a mano** y el monto del grupo es la **SUMA** de esos — la dirección contraria. Una participante sin monto puesto se muestra *"sin monto puesto"*, no con uno inventado. Candados por conducta + barrido estático.
>
> **Las dos vistas, según el tipo:**
> - **GRUPAL** → cuánto **APORTÓ** cada una al avance (`Jailine · $28.140 · 29% del avance`).
> - **POR VENDEDORA** → la meta de cada una y su avance contra ella.
> - **Pueden CONVIVIR**, y cada bloque nombra su meta: sin eso, alguien leería el avance de la grupal como si fuera el de su meta personal.
>
> ⚠️ **SIN PODIO, SIN MEDALLAS, SIN "1º/2º/3º"** — aunque vaya ordenado por aporte. El premio grupal es colectivo (*"el viaje es de todas o de ninguna"*) y un ranking acá le daría **dos mensajes contradictorios a la misma gente**: "compitan" y "ayúdense". La competencia individual ya existe y vive **FUERA de este módulo**: el bono de $50 mensual a la mejor vendedora y los $100 de la gerente **no entran acá** (decisión de Daniel) y no se tocaron.
>
> **Las metas terminadas quedan como historia** — Daniel: *"pero que esté ordenado y no tenga mucho protagonismo"*. Van al pie, **una línea cada una** (nombre, período, cierre, cumplida/no) de la más reciente a la más vieja, y se despliegan al tocarlas. La meta viva es la que manda la pantalla. El estado lo decide el SERVIDOR: si lo recalculara el navegador, una laptop con la fecha corrida movería una meta de sección.
>
> ### ⚠️ EL COSTO ESTÁ MEDIDO, y por eso la suma la hace Postgres
>
> El período de la meta real (sep-dic) tuvo el año pasado **6.610 documentos**: leerlos crudos son **~8 viajes paginados y 1,5 s POR CARGA DE PANTALLA**, contra una base en compute Micro que ya se cayó varias veces esta semana. Mismo problema que resolvió `multifashion_articulo_diario_agrupado_v1` bajando 49 viajes a 3.
> - **Camino 1 (bueno):** `multifashion_meta_ventas_v1(desde, hasta)` devuelve el período ya sumado por `(vendedor, mes)` con su última venta — **1 viaje, decenas de filas**.
> - **Camino 2 (respaldo):** lectura paginada con `leerTodoPaginado`. **No es decoración:** `db-max-rows` = 1000 corta EN SILENCIO, así que sin paginar se leerían 1.000 de 6.610 documentos —el 15% de la venta— **sin un solo error**. Un avance que se queda corto y no avisa es peor que no tenerlo.
> - **La RPC devuelve MAGNITUDES, no vuelve a firmar las NC** (la vista ya las firma). Firmarlas dos veces da exactamente el doble de las devoluciones de diferencia.
> - **La RPC agrupa por el texto CRUDO** — una llave más FINA que la del código. Lo que Postgres deja separado, `claveVendedora` lo junta igual; una segunda normalización escrita en SQL podría separarse de la de la pantalla.
> - El GET recorre las metas **secuencialmente**, no en paralelo: hoy hay una, y dispararlas todas juntas convierte una pantalla en una ráfaga.
>
> ### 🔑 EL CÁLCULO Y EL PERMISO ESTÁN SEPARADOS — y se probó en la práctica
>
> `avanceDeMeta` calcula **siempre el período entero** y **no mira ni un rol**; quién lo recibe se decide en `src/lib/multifashion/metas-permiso.ts`. Cuando se construyó, Jennifer (`gerente_acs`) tenía la ventana acotada y las metas quedaron detrás de una perilla a la espera de que Daniel decidiera. **Decidió** (*"abrile Multifashion completo"*, ver § Roles) → **habilitarla fue agregar un rol a una lista, no rehacer ninguna cuenta.** Si el permiso hubiera estado metido dentro de la aritmética —por ejemplo recortando el rango antes de sumar— habría sido un rediseño, y ahí es donde aparecen los números que no cuadran entre dos pantallas.
> - **La perilla se BORRÓ en vez de dejarse en `true`**: una perilla que ya no puede estar en `false` es una mentira que alguien lee como una opción viva. Candado que lo verifica.
> - **Quién entra hoy:** `admin` y `secretaria` ven; `gerente_acs` **ve** (desde el 13-ago); **solo `admin` edita**. ⚠️ **VER NO ES EDITAR**, y va aparte a propósito: Jennifer comisiona por la tienda **y** por sus ventas personales, así que dejarla editar metas sería dejarla editarse su propio objetivo.
> - ⚠️ **La ruta `/api/multifashion/metas` NO acepta ni una fecha del navegador**: el período sale de la fila de la meta. No hay nada del cliente que acotar, y recortarlo sería mostrar un avance recortado con el rótulo de "el avance de la meta" — un número MAL en vez de un permiso bien.
>
> ### ⚠️ DDL ADITIVA PENDIENTE — la corre Daniel A MANO, y la app funciona ANTES
>
> **`supabase/migrations/20260813170000_multifashion_metas.sql`**. Crea `multifashion_metas` + `multifashion_meta_participantes` (con RLS prendida, solo `service_role`) y la RPC de agregado. Patrón `cols-opcionales`: **sin las tablas, la pestaña se dibuja y dice en ámbar qué archivo falta** (no en rojo, que se leería como que algo se rompió), y **ningún otro número de Multifashion cambia**.
> - 🔴 **NO se reusó `ventas_metas`.** Existe y tiene 7 filas cargadas a mano el 13-may-2026, pero su forma es `(empresa, anio, mes) → un número`: no sabe de rangos libres, ni de tipo, ni de participantes, ni de premio. Y tiene una trampa medida: **el repo la declara con la columna `año` mientras las 11 RPC vivas la consultan como `anio`**. Se deja intacta — la lee la proyección viva de `/ventas`.
> - **Soft delete** (`deleted`): una meta anunciada al personal no se borra, se retira.
> - Los participantes cuelgan con `ON DELETE CASCADE` (son parte de la definición de la meta, no evidencia).
>
> ### 🔴 "METAS FANTASMA" — confirmadas, y NO se tocaron
>
> La auditoría de jul-2026 tenía razón y sigue vigente. Es código muerto **ajeno a este módulo** y retirarlo de paso habría sido un recorte que nadie pidió:
> - `meta_efectiva` / `gap_vs_meta` / `meta_total` se calculan en `ventas_proyeccion_cierre_v7` y están tipados en `src/components/ventas/types.ts` — **cero renders**.
> - `ventas_meta_sugerida_v2(int)` está instalada en producción con **cero llamadores** en todo el repo.
> - `ResumenKpis.metaAnualMultifashion` se pide con una RPC `get_app_setting` **en cada carga del Resumen** y no lo lee nadie.
> - `Multifashion.metaAnual` (= `app_settings['multifashion_meta_anual_2026']` = $800.000) y `expectedTodayPct` viajan por el cable y **no se pintan en ninguna pantalla**.
> - El comentario de `src/app/ventas/reporte/page.tsx:4` sigue prometiendo *"metas y proyección"*, que hoy es falso.
>
> ⚠️ **Ese $800.000 anual NO es la meta de Daniel** ($420.000 de sep a dic) y no se relacionan. Y el bono de Multifashion (`multifashion_bonos_v3`) es crecimiento YoY, **no una meta**: está vivo y no depende de nada de esto.
>
> ### 🩸 LA 6ª PESTAÑA NO ENTRABA — medido, no supuesto
>
> Con Metas el módulo pasa de 5 a 6 sub-tabs, y la tira **volvió a desbordar**: medido en el navegador, **433 px contra 390 en el iPhone (43 de más) y 565 contra 554 en el iPad (11 de más)**. Una tira que desborda deja la última pestaña —justamente la nueva— fuera de la pantalla, alcanzable solo arrastrando: el MISMO defecto que ya se había corregido cuando entró Productos.
> - **Los íconos pasan de esconderse en celular a esconderse hasta `lg`.** Cada uno se lleva 18 px (12 del `h-3 w-3` + 6 del `gap-1.5`, que un hijo con `display:none` deja de generar): 6 × 18 = **108 px**, y el iPad pasa de 565 a **457 sobre 554**. En celular ya estaban ocultos, así que ahí lo que cierra la cuenta es el relleno: `px-1.5` en vez de `px-2.5` son 8 px por pestaña × 6 = **48 px**.
> - **Resultado medido: 390/390 · 554/554 · 744/744 · 1000/1000 · 1160/1160 — entra en los cinco anchos.** Desde `lg` los íconos vuelven, donde sobra ancho.
> - ⚠️ **NO se acortó ningún rótulo.** Son texto que el personal lee y cambiarlos es decisión de Daniel; hay un candado que los congela.
>
> ### Los 3 anchos (+ el iPad acostado)
>
> `BASE=… node scripts/_medir-metas-anchos.mjs` (solo lectura), en cuatro estados —tarjeta de meta en curso, meta cumplida, la ventana de "Nueva meta" y la pestaña Vendedoras con el bloque de aporte—: **390 · 834 · 1024 · 1440 → 0 px de arrastre, 0 recorte, 0 blancos táctiles bajo 44 px y 0 textos bajo 12 px** en los 14 casos. La tarjeta crece hacia abajo (647 px de alto a 390, 507 a 1440).
> - 🩸 **LA DDL NO CORRIÓ TODAVÍA, así que la medición INTERCEPTA `/api/multifashion/metas`** y le inyecta una respuesta con la forma exacta y los números REALES medidos. El componente medido es el REAL; no se toca la base ni se aprieta ningún botón que guarde. El script **falla** si no encuentra la tarjeta, la línea de la proyección, el aviso de "última venta" de Witney, el del nombre partido en dos o el aporte en Vendedoras — y también si aparece un podio.
> - 🩸 **Dos falsos hallazgos que costaron una vuelta, los dos del MEDIDOR y no del producto:** los encabezados llevan `uppercase` por CSS, así que `innerText` los devuelve en mayúsculas y compararlos tal cual decía que faltaba un texto que estaba; y un checkbox de 16 px DENTRO de una etiqueta de 44 px cumple la regla táctil (lo que se toca es la etiqueta entera), así que contarlo marcaba en rojo el patrón de la casa.
>
> ### Candados
>
> `src/__tests__/lib/multifashion-metas.test.ts` (**92 casos** desde el 14-ago-2026, todos con los números REALES medidos). Ejecutan la conducta, no buscan texto: corren la proyección con la temporada real, agrupan los nombres partidos y verifican los permisos rol por rol. Incluye barridos estáticos que ponen el build ROJO si vuelve el reparto automático del objetivo, si alguien lee `switch_facturas` en vez de la vista, si el SQL vuelve a firmar las NC, si la migración deja de ser aditiva o si el cálculo del avance empieza a mirar roles.
> - 🩸 **Los barridos borran los comentarios PRIMERO** — este repo ya pagó **tres** veces el candado que se cumple (o se rompe) por su propia explicación, y acá volvió a pasar en las dos direcciones: el barrido de la perilla acusaba al archivo que solo la documenta, y el del SQL encontraba `ventas_metas` en el comentario que explica **por qué NO se reusa**. Hay un stripper aparte para SQL, donde el comentario empieza con `--`.
> - ⚠️ **El caso del "ritmo exacto" no exige `alcanza === true`**: cae JUSTO en el borde y el redondeo a centavos decide por un centavo. Lo que se exige es que la proyección diga 420.000 y no 204.000, y un caso 1% por encima sí exige que alcance.

### Multifashion › Resumen — los números pegados de "Mes a mes" (30-jul-2026)

> Daniel, mirando el iPhone: *"mira en multifashion, en resumen, lo pegado que estan los numeros, arreglalo"*. Medido en el navegador a 390 px con las cifras reales (5 dígitos con centavos, el peor caso es la fila YTD): el aire entre el monto del año actual y el del anterior era **−4,8 px**. **No estaban apretados: se SUPERPONÍAN** (`$302,556.86$271,191.20`).
>
> **DESPUÉS: +16 px, con desborde 0. iPad y escritorio quedaron IDÉNTICOS** (93,2 px a 834 · 188,2 a 1024 · 396,2 a 1440, los mismos antes y después), y el arrastre horizontal sigue en **0 en los cuatro anchos**.
>
> 🩸 **La causa NO era el relleno ni el interletrado — que es lo que uno toca si arregla a ojo.** Con las 4 columnas en una sola línea, a cada monto le tocaba una pista de **79,6 px** cuando el texto pide **92,4**: cada uno desbordaba **12,8 px** y eso se comía los 8 px del `gap` (8 − 12,8 = −4,8). Las dos columnas estaban **compitiendo** por un ancho que no alcanzaba. Por eso el diagnóstico mide **pista contra texto** y no solo el hueco: distingue "falta aire" de "no entra", que se arreglan distinto.
>
> **La cuenta que cierra el caso, a 390 px:** quedan 326 px útiles dentro de la tarjeta, y Mes (44,8) + dos montos (92,4 × 2) + Δ (96) + 3 separaciones = **350,4**. **Faltan 24,4 px.** Las 4 columnas en una línea no entran, y las dos salidas baratas están prohibidas: **la letra no baja de 12 px** (#301, y esta pantalla es de plata) y **los montos van completos con centavos** (nada de `$33.2K`).
>
> **Solución: en celular la fila usa DOS líneas.** Arriba Mes + los dos montos; abajo el Δ (porcentaje y absoluto, uno al lado del otro), alineado a la derecha.
> - **Los montos van en columnas `auto`, no en fracciones.** En un grid, una pista `auto` vale lo mismo para TODAS las filas (el ancho del contenido más largo, el YTD), así que los montos siguen **alineados de arriba abajo** —que es lo que permite comparar de un barrido— y el aire entre ellos es **exactamente el `gap-x-4` = 16 px**, ni más ni menos. Con `1fr 1fr` el aire habría salido de 48 px y variable; con `auto` es el que se elige.
> - **La columna Mes se queda con el sobrante** (`minmax(2.8rem,1fr)`), que es donde no molesta.
> - **El corte es `md` y no `sm`:** a 640 px la tabla quedaría con **8 px de aire total**, otra vez al borde de tocarse.
> - **Desde `md` no cambia NADA**: vuelve el reparto de 4 columnas en una línea. El encabezado "Δ" se esconde solo en celular (un encabezado suelto en la segunda línea sobra; el valor ya se explica con su signo, % y $).
>
> **Ningún número cambió, y está medido:** `node scripts/_verif-mes-a-mes.mjs` compara las 8 filas celda por celda entre 390 y 1440 — **32 celdas, 0 distintas**. La comparación va contra `data-col`, **no** contra la clase del breakpoint: buscar por `.md\:block` devuelve vacío en cuanto el corte se mueve, el chequeo compara CERO y **pasa en verde sin haber mirado nada**; el script falla si encuentra cero.
>
> **Diagnóstico reproducible: `ETAPA=antes node scripts/_medir-aire-mes-a-mes.mjs`** (390/834/1024/1440, solo lectura). Mide sobre la fila del **peor caso** —la de más dígitos, no la primera—: un mes de 4 cifras no prueba nada sobre uno de 5 con centavos. Deja capturas de la tabla en cada ancho.
>
> **De paso, blancos táctiles de Multifashion › Clientes:** las píldoras de período (Mes / 3 meses / 6 meses / 12 meses) medían **26 px** y los chips de segmento (Todos / Frecuentes / Dormidos / 5% disponible) **28**. Los dos grupos pasaron a **44** con `-my-1.5` para que crecer no separe el filtro del título. Verificado: **0 blancos bajo 44 px** en Resumen y Clientes, a 390 y 834.
>
> Candado: `src/__tests__/lib/multifashion-numeros-aire.test.ts` (12 casos; verificado por mutación: volver a `minmax(0,1fr)` en celular rompe 1). Incluye los candados de las reglas que no se pueden romper para ganar espacio — que la letra siga en `text-sm` y que la tabla no use `fmtMoneyCompact`.

### Ventas › Referencia — la primera caja deja de INTERPRETAR (11-ago-2026)

> ⚠️ **ESTA SECCIÓN ES DE LA MAÑANA. Lo de la fila de costos, el botón "Ver las otras N compras" y los dos pies de página quedó SUPERADO esa misma noche** — ver *"UNA fila de plata, y el mismo número una sola vez"* más abajo. Todo lo demás (la caja de Compras cruda, el fin del reparto FIFO, el cotejo agregado) sigue vigente tal cual.

> 🩸 **LA CAJA "Mi última compra" NO SERVÍA, Y NO ERA UN PROBLEMA DE REDACCIÓN.** Decía *"todavía no se acaba · llegó 180 el 19 feb · van 0"*, y ese "van 0" salía de un **reparto FIFO** que le asignaba ventas a cada llegada para poder contestar "¿cuánto tardó ESTA compra?". Eso solo se sostiene si la mercancía viene marcada por tanda, y **no viene**: cuando llega un contenedor SOBRE stock que todavía no se acaba, decir de qué compra salió una venta es **INVENTAR**. Y el caso real de Daniel es exactamente ése — `NB2570001` tiene tres compras recientes que bajo FIFO no habían vendido nada, así que la caja más visible de la pantalla anunciaba **"van 0 de 180"** mientras el artículo vendía **28 u/mes**. Cero información, en el peor lugar.
>
> Daniel, textual: *"si llego una compra mientras tenia stock, yo lo que quiero ver en cuanto tiempo se me mueve el articulo, para saber si con el stock actual que tengo debo de comprar mas, menos o no comprar. **pero no quiero que decidas tu, lo decido yo con la data que me extraigas**"*.
>
> **AHORA la primera caja se llama "Compras" y muestra FECHA y CANTIDAD, la más reciente arriba.** Nada más. Los dos números que sí contestan su pregunta —**Vendo por mes** y **Me queda para**— no se tocaron.
>
> ```
> Compras                    Vendo por mes      Me queda para
> 19 feb 2026 · 180 u             28 u             13 meses
> 11 feb 2026 · 120 u        promedio de los     345 en bodega
> 21 oct 2025 ·  60 u        últimos 12 meses
>  9 abr 2025 · 240 u
> Ver 1 compra más           ← botón: la 5ª de los 3 años, ya en el payload
> y 2 más de hace años       ← texto: ésas NO vienen, solo el conteo
> ```
>
> **Cuántas se muestran: 4** (`COMPRAS_VISIBLES`, el número del mockup aprobado). Es lo que cabe sin empujar a las otras dos cajas —la caja crece HACIA ABAJO y a 390 px las tres van una debajo de otra— y lo que se está decidiendo es REPONER, o sea que pesan las últimas. **El resto sigue alcanzable de un toque, y el enlace del pie de la tarjeta ("Ver las N compras anteriores") se INTEGRÓ en la caja**: tener el resto de la lista en otro lugar de la tarjeta que la enseña no ayudaba a nadie. Con **una sola compra** la caja lo dice: `26 dic 2025 · 180 u` + *"única compra"*.
>
> 🔴 **DOS LÍNEAS DISTINTAS PORQUE SON DOS COSAS DISTINTAS.** Las compras que no entran en las 4 pero **sí están dentro de los 3 años ya vienen en la respuesta** → botón, se despliegan sin tocar la red. Las de **más de 3 años NO vienen** (solo el conteo) → texto, no se pueden desplegar. Juntarlas en un solo "y N más" prometería desplegar algo que no está.
>
> **El límite de 3 años se conserva, y el aviso también** — reescrito: *"Hay N compras más viejas de 3 años que no se muestran — lo que trajeron sí cuenta para lo que hay en bodega"*. Sin eso, el total de bodega no cerraría contra las compras que se ven y la pantalla parecería equivocada. (Antes decía *"sí cuentan para el reparto"*, que era lenguaje del FIFO que se fue.)
>
> **La línea `Esta: … · Anterior: …` SE ELIMINÓ**: nacía del mismo reparto inventado.
>
> #### Qué código se borró, y la prueba de que nada más lo usaba
>
> De `src/lib/ventas/compras.ts` se fueron **`repartirFifo` · `RepartoFifo` · `medirCompra` · `CompraMedida` · `EstadoCompra` · `repartirExistencia` · `resumirArticulo` · `ResumenArticulo` · `mesesVendiendo` · `estaAgotada` · `textoMesesVendidos` · `nombreMes` · `diasEntre` · `DIAS_POR_MES` · `UMBRAL_VENDIDO`**; de `resumen-articulo.ts`, **`resumirCompra` · `ResumenCompra` · `lineaComparacion`**; de `referencia-excel.ts`, **`textoSeVendio` · `mesesDeCompra` · `textoAgotadas`**. `ArticuloCompras.compras` pasó de `CompraMedida[]` a `Compra[]` (fecha, cantidad, costos, proveedor, documento) y `ArticuloCompras.resumen` desapareció del contrato del API.
>
> **Los consumidores se auditaron uno por uno antes de borrar** (`grep` sobre `src/` y `scripts/`): la vista `ReferenciaView.tsx`, el route `/api/ventas/referencia`, el Excel `referencia-excel.ts`, 4 tests y 4 scripts `_diag`/`_verif`. **Ninguna otra pantalla y ningún otro export los tocaba.** El Excel SÍ los consumía y por eso se actualizó (ver abajo) en vez de romperse. Los 3 scripts que existían solo para medir el diseño removido se borraron (`_diag-formas-resumen`, `_diag-bordes-resumen`, `_diag-resumen-articulo`) y `_verif-compras-referencia.ts` se reescribió sobre la caja nueva.
>
> #### Lo que ocupó el lugar del FIFO, y por qué hacía falta algo
>
> Tres cosas seguían dependiendo del reparto y **no son atribución**: los avisos *"se vendieron N antes de la primera compra"* / *"N vendidas de más"*, el gate del **ajuste de inventario** y el *"N en bodega sin compra que las respalde"*. Todo eso se puede afirmar **en agregado**, sin marcar cajas, y ahora sale de **`cotejarVentasConCompras()`**: recorre los días en orden, va sumando lo que fue LLEGANDO y pregunta si alcanza. Devuelve `{vendidoAntes, vendidoDeMas, respaldado}` y **NADA por compra** — hay un test que lo fija leyendo las claves del objeto.
> - **La semántica de los dos baldes es EXACTAMENTE la de antes**, borde por borde: una venta anterior a toda compra va a `vendidoAntes`, una posterior que no cabe va a `vendidoDeMas`, y una devolución sin nada consumido deja `vendidoDeMas` **negativo**. ⚠️ El borde fino: *"¿ya llegó alguna?"* se pregunta por la **cantidad de compras llegadas**, no por las unidades — una compra de 0 unidades igual es una llegada, y preguntarlo mal manda el sobrante al balde equivocado.
> - **El aviso del ajuste sale del CUADRE del artículo** (`comprado − vendido − existencia`), no de repartirle faltantes a cada compra. Da el mismo número en el caso que Daniel reconstruyó a mano (`40HM265032`: 280 − 279 − 0 = **1 unidad**) y es más correcto cuando hay compras de más de 3 años, porque las cuenta.
> - **`stockSinRespaldo`** = `existencia − (comprado − respaldado)`, acotado a ≥ 0.
> - 🔴 **El cotejo mira TODAS las compras, también las de más de 3 años.** Si la ventana de pantalla lo recortara, las ventas viejas quedarían sin respaldo, la pantalla avisaría un hueco inexistente y —peor— **apagaría el aviso del ajuste**, que exige que la cuenta cierre. Hay un test.
>
> #### El Excel refleja la caja nueva
>
> **Hoja "Referencia"** (una fila por ARTÍCULO): perdió `Mi última compra`, `Vendidas`, `Meses en venderse`, `Anterior: meses` y `Compras anteriores`; ganó **`Última compra: llegó` · `Última compra: cuánto` · `Compras (últimos 3 años)` · `Compras de más de 3 años`**. Conserva `Anterior: llegó/cuánto`, los tres números, `Vendí a` · `Me costó (CIF)` · `Margen`, los costos y los **12 meses en columnas** (encabezados derivados de la MISMA ventana que la pantalla).
> **Hoja "Compras"** (una fila por COMPRA): queda con **fecha, cantidad y costos** (`Llegó` · `Cuánto` · `CIF` · `FOB` · `FOB de dónde` · `Lista` · `Proveedor` · `Documento`). Perdió `U. vendidas`, `Meses`, `Queda`, `Meses en que vendió` y `Salió a` — las cinco eran atribución. Un test recorre los encabezados de **las dos hojas** y falla si alguna de esas columnas vuelve.
>
> #### Lo que NO se tocó, a propósito
>
> **"Vendo por mes" y "Me queda para"** (incluido que el promedio se divide entre los meses que el artículo lleva vendiéndose y que **el mes en curso NUNCA entra** — medido: 18,3 vs 34,3 u/mes el mismo día) · las **barras de 12 meses** con oct·nov·dic resaltados y la línea de temporada · la **fila de costos completa** con el ⓘ del FOB no confiable y el **margen contra el CIF** · el buscador único · el aviso del ajuste de inventario (*"si hay menos es porq robaron"*) · el "Bajar a Excel".
>
> #### Medición
>
> **Los 3 anchos, en el navegador contra el build de producción y con datos de producción** (`BASE=… CODIGO=… node scripts/_medir-referencia-simple.mjs`, solo lectura): **390 · 834 · 1024 · 1440 → 0 px de arrastre, 0 recortados, 0 blancos táctiles bajo 44 px y 0 textos bajo 12 px**, en los cinco casos reales (`NB2570001` con la lista desplegada Y cerrada, `QD3958033` de una sola compra, `40HM265032` agotado, `RETENCION` sin compra registrada, y el modelo `40HM265` con **43 tarjetas** a la vez). La caja crece **hacia abajo**, que es lo único que puede regalar sin ensanchar nada. El script ahora **falla si encuentra en pantalla cualquiera de los textos de la atribución** (`Mi última compra`, `todavía no se acaba`, `van 0`, `Esta:`).
>
> **Contra producción, los dos artículos de Daniel** (`DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_verif-compras-referencia.ts`, solo lectura, corre los MISMOS módulos puros que la pantalla): `NB2570001` → 4 compras + 1 desplegable + 2 de hace años · 28 u/mes · 13 meses · vendí a $26.92 · margen 39%. `QD3958033` → única compra 26-dic-2025 180 u · 8 u/mes · 16 meses · $6.78 · 34%.
>
> Candados: `src/__tests__/lib/ventas-compras.test.ts` (53), `ventas-resumen-articulo.test.ts` (39) y `ventas-poda-textos.test.tsx` (26, **renderiza la pantalla de verdad y toca el botón de desplegar** — que la lista completa siga alcanzable de un toque no lo puede ver un test de función pura). Incluyen dos barridos estáticos: uno prohíbe que los símbolos del reparto (`repartirFifo`, `medirCompra`, `repartirExistencia`, `CompraMedida`, `UMBRAL_VENDIDO`) vuelvan a `compras.ts`, y otro que ninguna compra del payload traiga campos de atribución (`vendidas`, `quedan`, `meses`, `estado`, `precioVendido`…).

### Ventas › Referencia — UNA fila de plata, y el mismo número una sola vez (11-ago-2026, noche)

> Daniel, sobre la pantalla que se acababa de publicar: *"me gusta pero no se siente simple, facil"*. Los números estaban bien; el diagnóstico concreto era que **el mismo $16.56 aparecía TRES veces** en la misma tarjeta —en "me costó", en "CIF de hoy" y en "FOB"— porque Switch manda el FOB **igual al CIF en el 93% de las líneas** (error de carga conocido). Cinco bloques pasaron a tres.
>
> ```
> ANTES                                        AHORA
> Vendí a $26.92 · me costó $16.56 · margen 39%   Precio prom $26.92 · Costo CIF $16.56 ·
> ┌──────────┬─────────────┬───────┬──────────┐   Costo FOB (calculado) $15.05 · margen 39% ·
> │CIF de hoy│CIF anterior │  FOB  │  Lista   │   lista $27.00
> │  $16.56  │   $16.56    │$16.56 │  $27.00  │
> └──────────┴─────────────┴───────┴──────────┘
> Hay 2 compras más viejas de 3 años que…          (los dos pies se fueron)
> Lo que queda en bodega es de Switch, al…
> ```
>
> 🔴 **EL COSTO FOB ES UNA CUENTA NUESTRA, Y SE ROTULA COMO TAL.** Daniel, textual: *"pon costo fob (calcula fob/1.1)"*. **NO se usa el FOB de Switch** — llega igual al CIF en 93 de cada 100 líneas, o sea que no distingue nada. El calculado por lo menos significa siempre lo mismo, y el rótulo dice **"(calculado)"**: un número que parece traído y no lo es sería peor que no tenerlo. **Se REUSA `fobEstimado()`** de `referencia-info.ts`, que ya era la única definición de esta división en el repo (CIF ÷ 1,10, **nunca** CIF × 0,9: no es la inversa y da otro número — Daniel mismo cazó esa diferencia en su día). Candado estático: `costos.fob` y `fobOrigen` **no pueden volver** a `ReferenciaView.tsx`.
>
> 🔴 **EL CIF ANTERIOR APARECE SOLO CUANDO CAMBIÓ**, pegado al costo: `Costo CIF $16.56 (antes $9.46 ↑)` en rojo si subió, en verde si bajó. Era una columna fija que repetía el mismo número en la mayoría de los artículos; ahora es **la señal de que te subieron el costo**, no un dato de relleno. Medido en producción (vistana, 6.250 códigos): **396 tienen el CIF cambiado entre sus dos últimas compras — 118 subieron y 278 bajaron**. Ejemplos reales: `NB3705906` $16.56 (antes $9.46 ↑) · `U2661946` $13.33 (antes $15.79 ↓).
> - ⚠️ **Se compara a la precisión que se MUESTRA (centavos).** Los costos son promedios PONDERADOS de varias líneas: dos compras "iguales" pueden diferir en la milésima, y anunciar "(antes $16.56)" al lado de "$16.56" sería una señal que no señala nada.
>
> 🩸 **`toFixed(2)` y la pantalla NO coincidían, y el caso está en producción.** El CIF de `NB2570001` es **16,555**: la pantalla (Intl) redondea sobre el decimal y muestra **$16.56**, mientras `(16.555).toFixed(2)` mira el binario —que en realidad es 16,554999…— y da **16.55**. O sea que el Excel decía **un centavo menos que la ficha del mismo artículo**. Fuente única: **`centavos()`** en `resumen-articulo.ts`, que formatea con el MISMO formateador de la pantalla y lee el número de vuelta — la igualdad queda garantizada por construcción, no por parecido. La usan el Excel (las dos hojas) y el script de verificación. **Todo monto va a 2 decimales; las unidades siguen enteras.**
>
> **La caja de Compras: 4 líneas y UNA línea gris que no se despliega.** `y 3 compras más`, sin enlace. Antes eran DOS renglones —un botón "Ver las otras N compras" y un texto "y 2 más de hace años"— separados por un detalle NUESTRO (unas venían en el payload y otras no); Daniel ve cuatro fechas y lo que quiere saber es cuántas hay detrás. `ListaCompras` **ya no expone el arreglo escondido** (`{visibles, restantes, unica}`) — si lo expusiera volvería el botón, y con él los dos renglones.
>
> **LOS DOS PIES DE PÁGINA SE ELIMINARON:**
> - *"Hay N compras más viejas de 3 años que no se muestran — lo que trajeron sí cuenta para lo que hay en bodega"*: la caja ya dice "y N compras más", y —lo que hacía falta verificar antes de borrarla— **el total de bodega NO sale de las compras que se ven**. Sale de `switch_articulo_info.existencia`, medido: `NB2570001` = **345**, tal cual en la base, mientras las 4 compras visibles suman 600 y el total comprado es 935. El número no cambia; se va la explicación de una cuenta que la pantalla no hace.
> - *"Lo que queda en bodega es de Switch, al 10-ago, 11:30 pm"*: una hora que no cambia ninguna decisión. (`fmtFrescura` **sigue existiendo** y con su test — solo dejó de usarse acá.)
>
> #### El Excel
>
> **Hoja "Referencia"** — los MISMOS rótulos que la pantalla y en el mismo orden: `Precio prom` · `Costo CIF` · **`CIF anterior (solo si cambió)`** · `Costo FOB (calculado)` · `Margen` · `Lista`. Se fue **`FOB de dónde`** de esta hoja (ya no hay dos procedencias que distinguir: hay una cuenta).
> - **La columna del CIF anterior SE QUEDA pero se llena solo cuando difiere** — decisión tomada: una columna que aparece y desaparece rompe cualquier planilla que apunte a ella, y **vacío ES el dato** ("no cambió"), igual que en pantalla. Está dicho en el subtítulo de la hoja.
> - **Hoja "Compras": intacta, y conserva el FOB CRUDO de Switch con su `FOB de dónde`.** No es una contradicción: esa hoja es el registro tal como llegó, y ahí `"igual al CIF (revisar)"` es justamente el dato que hay que ver para corregirlo EN Switch. La cuenta de la ficha vive en la hoja 1. Lo único que cambió ahí son los 2 decimales.
>
> #### Medición
>
> **Los 3 anchos + el iPad acostado, en el navegador contra el build de producción y con datos de producción** (`BASE=… CODIGO=… node scripts/_medir-referencia-simple.mjs`, solo lectura): **390 · 834 · 1024 · 1440 → 0 px de arrastre, 0 recortados, 0 blancos táctiles bajo 44 px y 0 textos bajo 12 px**, en los seis casos reales (`NB2570001`, `QD3958033` de una sola compra, `NB3705906` con el costo subido, `40HM265032` agotado, `RETENCION` sin compra registrada, y el modelo `40HM265` con **43 tarjetas** a la vez). La fila fusionada es más larga y **crece HACIA ABAJO**: 44 px de alto a 1440, 69 a 834/1024 y 94-119 a 390 (dos o tres líneas), sin empujar nada de lado. El script ahora **falla si encuentra en pantalla** `CIF de hoy`, `Vendí a`, `me costó`, `Lo que queda en bodega es de Switch` o `compras más viejas de 3 años`.
>
> **Contra producción, los dos artículos de Daniel** (`scripts/_verif-compras-referencia.ts`, solo lectura, corre los MISMOS módulos puros que la pantalla y ahora imprime la fila de plata tal como se lee):
> ```
> NB2570001  Precio prom $26.92 · Costo CIF $16.56 · Costo FOB (calculado) $15.05 · margen 39% · lista $27.00
> QD3958033  Precio prom $6.78  · Costo CIF $4.47  · Costo FOB (calculado) $4.06  · margen 34% · lista $7.00
> ```
>
> Candados: `ventas-resumen-articulo.test.ts` (58), `ventas-compras.test.ts` (59), `ventas-poda-textos.test.tsx` (31, **renderiza la pantalla y compara el renglón entero, carácter por carácter**) y `articulo-info.test.ts`. Verificado por mutación: mostrar el FOB de Switch rompe 3, escribir la división a mano rompe 1, volver a `toFixed(2)` en el Excel rompe 2, devolver el botón de desplegar rompe 2 y mostrar el CIF anterior cuando no cambió rompe 2.

### Ventas › Referencia — los TRES GRANDES, la línea del 90% y el MODO PEDIDO (12-ago-2026)

> Daniel, sobre la ficha recién publicada: *"el numero importante estan chiquito. cuanto compre es importante, cuanto vendi en total es importante… me queda 2 meses de venta / vendo 11u mes es lo que mas llama la atencion y no es lo mas importante ya que un mes puedo vender mucho y otros meses no, vendo b2b al por mayor no retail"*. La tarjeta se reordenó entera y la vista ahora son TRES archivos: `ReferenciaView.tsx` (buscador y despacho), `ReferenciaTarjeta.tsx` (la tarjeta y su cuerpo) y `ReferenciaTablaPedido.tsx` (modo pedido). Los candados que barren el código de la vista miran los tres.
>
> **1. LOS TRES GRANDES: Compré · Vendí · Me quedan (34 px, unidades).** `Compré` = TODAS las compras registradas (también las de +3 años que la lista no muestra) = `cuadre.comprado`; `Vendí` = neto histórico con NC restadas = `cuadre.vendido`; `Me quedan` = `switch_articulo_info.existencia`, NUNCA deducido. 🔴 **NO SE FUERZA EL CUADRE**: medido en producción, `NB2570001` da 935 − 552 = 383 contra 345 en bodega (residuo 38), y los peores descuadres del barrido (`scripts/_diag-descuadres-referencia.ts`, read-only) son `TERMO` (active_shoes, vendió 1.648 de 796 compradas — faltan compras) y `UMBRELLATH000` (850 compradas, 50 vendidas, 98 en bodega → 702 desaparecidas). Cada número dice su verdad y los avisos de descuadre de siempre (ajuste / vendido sin compra / stock sin respaldo) son la válvula. Debajo de Compré va la lista aprobada (4 líneas `fecha · cantidad` + `y N compras más` gris sin enlace); con UNA compra dice `23 oct 2025 · única compra` (la cantidad ya es el número grande). Vendí dice el % de lo comprado (`textoParteVendida`).
>
> **2. LA LÍNEA DEL 90% reemplaza al "vendo por mes" como protagonista.** Daniel: *"creo que es mas importante saber en cuanto meses se vendio digamos que el 80%? 90%? siento que es mas util que unidades por mes"* — confirmó 90% (su regla vieja: la cola no cuenta). `medirNoventa()` en `resumen-articulo.ts`, tres formas según lo que se pueda AFIRMAR:
> - Compra ÚNICA cruzada: `El 90% se vendió en 17 meses` (40HM265032; granularidad MENSUAL — índice de mes de la llegada al mes del cruce, por eso da 17 y no el 16 de la medición vieja por días).
> - Compra ÚNICA viva: `En 10 meses va el 80% de la compra` (CVM253CR02001, exacto al mockup).
> - VARIAS compras: **agregado ROTULADO** — `Desde oct 2025 llegaron 360 u · van vendidas 295` (NB2570001). El FIFO sigue prohibido. 🩸 **El ancla se EXTIENDE hacia atrás** hasta que lo llegado cubra lo vendido desde entonces: `NB3705906` (120 u de jul-2024 vivas + 20 de sep-2025) anclado en sep decía *"llegaron 20 · van vendidas 36"* — roto; extendido dice `Desde jul 2024 llegaron 140 u · van vendidas 97`. Si ni la compra más vieja con fecha alcanza (36 códigos en producción, p.ej. `40HM265540`: llegaron 860 · van 1.327), el texto queda así y el aviso "vendidas de más" explica.
> - El `· vendo 28 u por mes` quedó de dato chiquito al final (`textoVendoPorMes`); sin ventas no se dice "vendo 0". El texto entero sale de `textoLineaNoventa()` — pantalla y verificación comparan contra ESO.
>
> **3. LAS BARRAS SE ANCLAN A LA LLEGADA (mockup aprobado).** `vistaDeBarras()`: con UNA compra las barras arrancan el mes que llegó — título `Desde que llegó · 23 oct 2025 · 120 u`, subtítulo `10 meses en bodega · van vendidas 96 de 120`, y debajo corre el **ACUMULADO en verde** (0 · 12 · 36 · 36 · 36 · 72 · 72 · 96 · 96 · 96 — idéntico al mockup, verificado contra producción). Una compra de +12 meses se recorta a los PRIMEROS 12 y el subtítulo lo dice. Con VARIAS compras quedan los últimos 12 meses y **cada llegada se marca con ▲ bajo su mes** (fila propia, no pegada al rótulo del mes — a 390 px no entra) + leyenda `▲ oct: llegaron 60 u · ▲▲ feb: llegaron 120 y 180 u`. El mes en curso sigue sin dibujarse; el "van vendidas" del subtítulo SÍ lo incluye (es acumulado, no promedio). Oct·nov·dic resaltados y la línea de temporada se conservan — la temporada se calcula SIEMPRE sobre la ventana de 12 meses (`ficha.temporada`), no sobre la ventana dibujada.
>
> **4. LA FILA DE PLATA, AGRUPADA.** Daniel: *"precio prom y precio lista porque estan separado"* → `Precio prom $26.92 · lista $27.00 | Costo CIF $16.56 · FOB $15.05 | margen 39%`. Precios juntos (¿estoy descontando?), costos juntos, margen al final; un grupo sin datos no deja un `|` colgado. 🔴 **"(calculado)" SE FUE del rótulo del FOB** (*"la palabra calculado esta de mas"*) — sigue siendo CIF ÷ 1,10 vía `fobEstimado()` y el ⓘ lo explica; el candado de `articulo-info.test.ts` ahora exige `k="FOB"` y prohíbe "(calculado)" en las tres piezas de la vista. El `(antes $X ↑/↓)` del CIF cuando cambió SE QUEDA.
>
> **5. MODO PEDIDO (mockup aprobado).** Daniel pega hasta 50 códigos para armar pedido: con **2+ códigos pegados** (el MISMO `parsearListaCodigos` del route — no un segundo parseo) sale una TABLA `Código · Compré · Vendí · Quedan · 90% en · Margen · Últ. compra`, **una fila por color EN EL ORDEN PEGADO** (`ordenarComoPegado`, puro en `referencia.ts`) para leerla con su Excel al lado. Quedan 0 en ROJO. Tocar una fila abre **el cuerpo REAL de la tarjeta** (`CuerpoArticulo`) ahí mismo, acordeón de a una; el detalle va FUERA del scroller horizontal (adentro, a 390 px habría que arrastrar para leerlo), y la tabla se parte en segmentos con `colgroup` de anchos FIJOS para que queden alineados. La tabla scrollea ELLA SOLA (overflow-x-auto); el body nunca. **El Excel baja la misma lista en el orden pegado** (el botón exporta `articulosOrdenados`). Un código solo sigue mostrando tarjetas.
>
> **El Excel refleja la ficha:** hoja Referencia con `Compré` · `Vendí` · `En bodega` primero, columna `90% en` (misma métrica, `textoNoventaCorto`), y la plata en el orden de pantalla `Precio prom · Lista · Costo CIF · CIF anterior (solo si cambió) · Costo FOB · Margen` — sin "(calculado)" en el encabezado. La hoja Compras quedó como estaba.
>
> **Medido en el navegador contra el build de producción y datos de producción** (`BASE=… node scripts/_medir-referencia-simple.mjs` y `_medir-referencia-pedido.mjs`, solo lectura): **390 · 834 · 1024 · 1440 → 0 px de arrastre de página, 0 recortados, 0 blancos táctiles <44 px y 0 textos <12 px** en los 5 artículos de prueba y en el modo pedido cerrado y abierto (el scroller declarado de la tabla no cuenta como recorte: es el mecanismo). Verificación de números contra producción: `DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_verif-compras-referencia.ts` (corre los MISMOS módulos puros).
>
> Candados: `ventas-resumen-articulo.test.ts` (72 — tres grandes, 90% con el caso NB3705906, barras ancladas con el acumulado del mockup), `referencia-tabla-pedido.test.tsx` (10 — renderiza la tabla real, toca filas, espía el Excel) y `ventas-poda-textos.test.tsx` (35 — la fila de plata carácter por carácter, y "Vendo por mes"/"Me queda para"/"(calculado)" PROHIBIDOS en pantalla).

### Ventas › Referencia — la regla del 90% SE FUE y el Excel quedó en 13 columnas (12-ago-2026, noche)

> 🩸 **EL RELOJ NO SE DETENÍA CON VARIAS COMPRAS, Y AL ARREGLARLO DANIEL SIMPLIFICÓ LA REGLA ENTERA.** El caso de su captura (`4G5004G030`, vistana): 2 compras el MISMO día (5-oct-2025: 30 + 6 = 36), vendió 12 en oct y 24 en nov — TODO, stock 0 — y la ficha decía *"Meses: 10 · de venta, desde oct 2025"*. Daniel: *"dice que vendi 36 en 10 meses, pero enverdad fueron en dos meses"*. En el camino cazó dos contradicciones más (*"como stock 0 y vendido 90%?"*) y cerró, textual: *"debe de ser cuanto tiempo de venta tiene y % de la venta, asi en todo el modulo… podemos no tener esa regla y entender la info?"* → **la regla del 90% (congelar en el cruce) se ELIMINÓ del módulo entero.**
>
> **UNA regla para ficha, tabla del modo pedido y Excel:**
> - **VENDIDO = el % REAL**: `Vendí ÷ Compré` (los totales de los tres grandes). 100% si stock 0 y se vendió todo. ⚠️ **SUPERADO esa misma noche**: "vendido > comprado" YA NO es "—" — se muestra el % igual (TERMO 207%), ver *"VENDIDO muestra el % real aunque pase de 100%"* más abajo. El "—" quedó solo para sin compras registradas o vendido negativo.
> - **MESES = tiempo de venta**, meses CALENDARIO desde el ancla (la extendida de siempre): **AGOTADO (stock 0) → hasta el mes de su ÚLTIMA venta neta, CERRADO ahí** (la cola en bodega no infla el tiempo); **VIVO → hasta hoy**, corriendo. Negro = agotado, gris = vivo.
> - ⚠️ **El conteo del agotado es INCLUSIVE** (oct → nov = **2** meses, como cuenta Daniel: *"fueron en dos meses"*); el vivo sigue contando meses TRANSCURRIDOS (oct-2025 → ago-2026 = 10). Al agotarse, el mes que cierra el episodio se suma.
> - ⚠️ La última venta **SÍ puede ser el mes en curso** (es un hecho, no un promedio); los promedios siguen sin verlo. Y una compra que llegó DESPUÉS de la última venta NO corre el reloj (test del borde en `ventas-resumen-articulo.test.ts`).
> - **Sin FIFO, como siempre**: el mes de la última venta es del ARTÍCULO y aplica igual con 1 o N compras. `medirNoventa`/`LineaNoventa`/`textoNoventa*`/`PARTE_NOVENTA` **ya no existen** → `medirAvance`/`LineaAvance`/`textoAvance`/`textoAvanceCorto`/`textoLineaVenta`; `FichaArticulo.noventa` → `avance`. La ficha del agotado dice **"Se vendió todo en 2 meses"** (o *"Se vendió el 80% en…"* si el % real no llega a 100 — los avisos explican el resto), KPI *"Meses: 2 · en venderse"*; los vivos quedaron EXACTAMENTE como estaban ("En 10 meses va el 80% de la compra" / el agregado rotulado "Desde oct 2025 llegaron 360 u · van vendidas 295" con su ancla extendida). `(bajó por devoluciones)` y el retroceso del cruce murieron con la regla.
> - **Medido contra producción** (`scripts/_verif-compras-referencia.ts`, ahora con `4G5004G030` en la lista): `4G5004G030` → **100% · 2 meses** · `CVM253CR02001` 80%·10 vivo (no cambió) · `NB2570001`/`QD3958033`/`RETENCION` sin cambios · **`40HM265032` cambió A PROPÓSITO: era "90% en 17" y ahora es 100% · 23 meses** (última venta sep-2025, ancla nov-2023, inclusive) — el 17 era el cruce del 90%, que ya no es la pregunta.
>
> **EL EXCEL "LO ESENCIAL" — hoja Referencia en 13 COLUMNAS, aprobadas por Daniel** (*"mucha info, quiero lo escencial"*, y después sumó la Lista): `Referencia · Descripción · Compré · Vendí · Stock · Vendido · Meses · Última compra · Precio prom · Lista · Costo CIF · Margen · Nota`. Se fueron las otras 26 (Empresa, los 12 meses en columnas, Oct-nov-dic ×2, Vendo por mes, Me queda para, CIF anterior, Costo FOB, Anterior: llegó/cuánto, Compras últimos 3 años / +3 años, Última compra: cuánto, Meses de venta, "Si no hay margen, por qué" — **su contenido se FUSIONÓ en la Nota**, solo cuando el margen baja). Sin margen (vendedor/bodega) son 12: se quita solo `Margen`. **La hoja Compras quedó INTACTA** (es el registro crudo, con su FOB de Switch y "FOB de dónde"). Candado: `ventas-compras.test.ts` fija el encabezado EXACTO (`TRECE`) y una lista de columnas que no pueden volver; el orden pegado se conserva (`articulosOrdenados`).
>
> **Medido en el navegador contra el build de producción y datos de producción** (`_medir-referencia-simple.mjs` y `_medir-referencia-pedido.mjs`): **390 · 834 · 1024 · 1440 → 0 px de arrastre, 0 recortados, 0 blancos <44 px, 0 textos <12 px**, ficha y tabla (cerrada y abierta). Candados: `ventas-resumen-articulo.test.ts` (fixture `4G5004G030` EXACTO + el borde de la compra tardía + TERMO agotado "—"·17), `ventas-compras.test.ts` (Excel), `referencia-tabla-pedido.test.tsx` (100%·3 del agotado en negro) y `ventas-poda-textos.test.tsx` (**"El 90% se vendió" y "en vender el 90%" están PROHIBIDOS en pantalla**).

### Ventas › Referencia — el reloj se REINICIA cuando la bodega quedó en 0 (12-ago-2026)

> ⚠️ **DOS COSAS DE ESTA SECCIÓN QUEDARON SUPERADAS esa misma noche** — ver *"los TRES GRANDES pasan a ser de la ÚLTIMA LLEGADA"* más abajo: **(a)** *"Compré · Vendí · Stock siguen siendo los históricos TOTALES (72 · 61 · 12)"* — Compré y Vendí ahora son de la última llegada (36 · 25) y **solo Stock** sigue siendo el total de bodega; **(b)** la frase perdió el `→ me quedan 11 u` **y** el `→ va el 69% en 5 meses`, y quedó en `Llegaron 36 u en mar 2026 · vendo 8.7 u por mes`. **Todo el motor de llegadas (`medirTandas`, el umbral del cero, los tres vetos del timeline, el ritmo sin los meses vacíos) sigue vigente tal cual** — es la misma medida, mostrada en más lugares.

> 🩸 **EL TIEMPO DE VENTA SEGUÍA SUMANDO LOS MESES CON LA BODEGA VACÍA.** El caso de la captura de Daniel (`4G5004G001`, vistana): compró 36 u en oct-2025 (30 + 6 el MISMO día), las vendió TODAS en oct-nov, estuvo **dic-feb sin una sola unidad**, y en mar-2026 llegaron 36 más. La ficha decía *"Meses: 10 · de venta, desde oct 2025"* y *"Vendo 6.1 u por mes"*. Daniel, textual: *"no me hace sentido que me dice 10 meses de venta, entonces pense no comprar porque yo compro para 3 o 4 meses. pero me lo suma y me lo aplaza"*, y la regla la fijó él: *"si llego a 0 y llego mercancia, cual es la logica q me muestre 10 meses? me debe de mostrar la ultima (y mira q hubo dos el mismo dia (se tienen que sumar))"*.
>
> **EL MOTOR: una LLEGADA (episodio) se corta donde la bodega quedó en 0.** `medirTandas()` en `resumen-articulo.ts` recorre el **neto acumulado compras − ventas mes a mes** (la misma granularidad MENSUAL de todo el módulo, con los datos que la ficha ya tenía) y abre episodio **solo** cuando entra mercancía con el saldo en cero. Compras que llegan con **stock vivo — o el mismo día, o el mismo mes — se SUMAN** a la llegada abierta.
> - 🔴 **NO ES EL FIFO PROHIBIDO.** El FIFO repartía ventas ENTRE compras con stock vivo encima — inventado, nadie marcó las cajas. Acá el corte es un **hecho agregado**: si el stock tocó 0 antes de la siguiente compra, todo lo vendido hasta ahí salió de lo que había llegado hasta ahí, no hay nada que atribuir. **Dentro de una llegada todo sigue siendo agregado.**
> - ⚠️ **"Quedó en 0" = saldo ≤ `min(2, 10% de lo llegado)`** (`umbralTandaCero`). El 10% protege a las llegadas chicas: 2 en bodega de una de 8 u NO es cero (le queda el 25%); de una de 36 sí (94% vendido, la cola no cuenta). Medido: con 0 exacto serían 422 códigos en vez de 468 — quedarían fuera los que tienen 1-2 u de ajuste.
> - ⚠️ **CUÁNDO NO SE PUEDE AFIRMAR EL TIMELINE** (y entonces **TODO queda como siempre**): compras de **+3 años** (sus fechas no viajan, el saldo arrancaría mentiroso), **ventas anteriores a la primera compra**, o **"vendidas de más"** que pasen del ruido de ±2 (`TERMO` vendió 1.648 de 796: con el saldo en −852 cada compra "abriría llegada" sobre un cero falso). `NB2570001` y `TERMO` caen acá y **no cambiaron en nada**.
> - 🔴 **CON UNA SOLA LLEGADA NO CAMBIA NADA**: `armarFicha` solo activa el camino nuevo con **2+**; con una, `medirAvance`/`medirRitmo`/`medirVendidoMeses` se comportan EXACTAMENTE como antes (ancla extendida, agotado en la última venta, etc.).
>
> **LA FRASE, protagonista de la ficha** (`fraseLlegadaActual`) — 🔴 **la palabra "tanda" NO existe en pantalla**, Daniel rechazó ese formato: se dice "llegada" o la fecha a secas.
> ```
> Llegaron 36 u en mar 2026 → va el 69% en 5 meses → me quedan 11 u · vendo 8.7 u por mes
> La anterior (oct 2025): 36 u — se vendió toda en 2 meses          ← gris, debajo
> ```
> - **Viva** = *"va el X% en Y meses"* (gris, en curso). **Agotada** = *"se vendió toda en Y meses"* (negro, cerrada) y **sin "me quedan"**: la bodega quedó en 0.
> - ⚠️ **"me quedan N u" es de ESA llegada** (llegaron − vendidas), no el stock total. En `4G5004G001` dice 11 y Switch dice 12: **el cuadre NO se fuerza**, lo explica el aviso de siempre (*"Hay 1 unidad en bodega que no sale de ninguna compra registrada"*).
> - La historia (`textoLlegadaAnterior`) detalla **solo la anterior**; con 3+ suma *"· y N llegadas anteriores"* en gris sin enlace — el detalle de llegadas de hace años no decide la compra de hoy.
> - **NO hay predicciones** ("te dura ~2 meses"): los veredictos siguen PROHIBIDOS en este módulo.
>
> **LO DEMÁS, sobre la ÚLTIMA llegada:** las columnas **VENDIDO · MESES** de la tabla del modo pedido y del Excel (`medirVendidoMeses`, la misma función de siempre) → **69% · 5** para ese código, gris viva / negro cerrada; el **KPI grande "Meses" = 5** con subtítulo **"de venta · desde mar 2026"** (`pieGrandeMeses`, base `tanda-viva`). **Compré · Vendí · Stock siguen siendo los históricos TOTALES** (72 · 61 · 12). El **"Vendo X u por mes" excluye los meses SIN mercancía** (además del mes en curso, como siempre): 61 ÷ **7 meses con stock** = 8.7, no 61 ÷ 10 = 6.1 — es el MISMO timeline, no una segunda cuenta. El Excel **no ganó columnas**; solo la leyenda dice que Vendido/Meses son de la última llegada.
>
> **Medido contra producción** (`scripts/_verif-compras-referencia.ts`, ahora con `4G5004G001`): `4G5004G001` → llegadas `oct-2025: 36 u, vendidas 36, CERRADA, 2 m` + `mar-2026: 36 u, vendidas 25, viva, 5 m`; `4G5004G030` (una sola llegada, agotada) **sigue 100% · 2, sin un carácter de diferencia**; `CVM253CR02001` 80%·10, `NB2570001` 59%·10, `QD3958033` 30%·8, `40HM265032` 100%·23, `RETENCION` "—" y `TERMO` "—" **idénticos**. **Impacto medido** (`scripts/_diag-tandas-referencia.ts`, read-only, vistana): de **8.108 códigos**, **468 cambian de número** (2 llegadas: 432 · 3: 30 · 4: 6 — 151 con la actual viva, 317 agotada); 5.350 tienen una sola llegada y 2.290 no tienen timeline afirmable → **7.640 no se mueven**.
>
> **Medido en el navegador contra el build de producción y datos de producción** (`_medir-referencia-simple.mjs` en los 6 artículos y `_medir-referencia-pedido.mjs` con la tabla cerrada y abierta): **390 · 834 · 1024 · 1440 → 0 px de arrastre de página, 0 recortados, 0 blancos <44 px, 0 textos <12 px**. En la tabla se lee `4G5004G001 · 69% · 5` en gris (viva) contra `4G5004G030 · 100% · 2` en negro (agotada), una al lado de la otra.
>
> Candados: `ventas-resumen-articulo.test.ts` (el fixture `4G5004G001` EXACTO, mismo-día que suma, stock vivo que NO abre, cero que SÍ abre, el umbral chico/grande, los tres vetos del timeline, 3+ llegadas y la regresión "una sola = idéntico") y `ventas-poda-textos.test.tsx` (renderiza la pantalla y compara la frase carácter por carácter; **"Tanda " y "tandas anteriores" quedaron PROHIBIDOS**). Verificado por mutación: no sumar el mismo día rompe 4, que toda compra abra llegada rompe 5, que nunca corte en 0 rompe 12, dividir el vendo/mes por los meses vacíos rompe 4, activar el camino nuevo con una sola llegada rompe 4 y no cerrar el reloj de la llegada agotada rompe 9.

### Ventas › Referencia — los TRES GRANDES pasan a ser de la ÚLTIMA LLEGADA (12-ago-2026, noche)

> 🩸 **LA FICHA SE CONTRADECÍA CONSIGO MISMA, Y DANIEL LO VIO EN LA MISMA PANTALLA.** Sobre `4G5004G001`, textual: *"mira que sigue diciendo compre 72 cuando enverdad son 36"*. El #501 había puesto la frase y el KPI sobre la ÚLTIMA llegada, pero los tres números grandes seguían siendo el histórico:
> ```
> ANTES                                          AHORA
> Compré 72  Vendí 61  Stock 12  Meses 5          Compré 36  Vendí 25  Stock 12  Meses 5
>   ↑ (29 mar 36u · 5 oct 30u · 5 oct 6u)           ↑ las mismas 3 fechas
>                                                   72 u en total · 61 vendidas   ← gris
> Llegaron 36 u en mar 2026 → va el 69% en 5      Llegaron 36 u en mar 2026 · vendo 8.7 u por mes
> meses → me quedan 11 u · vendo 8.7 u por mes    La anterior (oct 2025): 36 u — se vendió toda en 2 meses
> ```
> Él eligió la salida entre las opciones que se le ofrecieron: *"(a) Los grandes pasan a ser de la última llegada: Compré 36 · Vendí 25 · Stock 12 — **que sea coherente**"*.
>
> 🔴 **NO ES UNA SEGUNDA CUENTA.** `tresGrandes(art, tandas)` recibe la MISMA `medirTandas()` que ya alimenta la frase, el reloj y el ritmo desde el #501, y `armarFicha` le pasa la misma medida a los cuatro. Si acá se volviera a calcular la llegada, dos definiciones del mismo episodio se separarían con el tiempo — hay un candado de mutación para eso.
>
> 🔴 **STOCK SIGUE SIENDO LA EXISTENCIA REAL DE BODEGA** (`switch_articulo_info.existencia`), nunca deducida y **nunca recortada a la llegada**. Lo eligió Daniel explícitamente. En `4G5004G001` dice **12** mientras la llegada da 36 − 25 = **11**: el cuadre NO se fuerza, como siempre, y la unidad la explica el aviso de siempre (*"Hay 1 unidad en bodega que no sale de ninguna compra registrada"* — de paso se le corrigió el verbo, decía "no salen" con "1 unidad").
>
> **UNA SOLA CIFRA POR CONCEPTO — de la frase se podó DOS veces, y las dos por lo mismo: decía números que ya estaban arriba.**
> - **`→ me quedan 11 u`**: era lo que quedaba DE ESA llegada mientras el grande Stock decía **12**. Dos cifras para *"¿cuántas me quedan?"* hacen desconfiar de las dos, y la que hay que creer es la de bodega.
> - **`→ va el 69% en 5 meses`** (y su gemelo cerrado *"se vendió toda en 2 meses"*): con los grandes ya de la llegada quedó repetido palabra por palabra — el 69% es el pie de Vendí y los 5 meses son el KPI "Meses". Es la misma poda del *"$16.56 tres veces"* de la fila de plata.
> - Lo que la frase SÍ aporta es la **FECHA** de la llegada (que ningún grande dice) y el ritmo. `fraseLlegadaActual` quedó en una línea. **La historia gris NO se tocó** (`La anterior (oct 2025): 36 u — se vendió toda en 2 meses`): habla de OTRA llegada, no repite nada. El estado sigue diciéndose con el peso de la letra (negro = agotada, gris = viva) y con el Stock.
>
> **EL HISTÓRICO NO SE PIERDE:** viaja en `grandes.historico` y se lee en chico bajo la lista de compras — **`72 u en total · 61 vendidas`** (`textoHistoricoTotal`). Con **UNA sola llegada** en toda la historia, esa llegada ES el histórico: `historico` sale `null`, la línea no se dibuja y la ficha queda **idéntica a la de ayer** (repetir el mismo número dos veces en la misma caja sería el defecto que este módulo viene podando).
>
> **COHERENCIA EN TODO EL MÓDULO, sin encabezados nuevos:**
> - **Tabla del modo pedido:** las celdas `Compré`/`Vendí` leían `art.cuadre` CRUDO — o sea que la misma fila decía *72 · 61* al lado de *69% · 5*. Ahora salen de `armarFicha`, la misma ficha que se abre al tocarla. `Stock` sigue siendo la existencia.
> - **Excel:** las filas ya salían de `f.grandes`, así que se corrigieron solas. **Los 13 encabezados NO se tocaron** (candado `TRECE`): matizarlos rompería cualquier planilla que apunte a ellos, y el que decide es el mismo criterio que ya rige VENDIDO·MESES desde el #501. Lo que se actualizó es la **leyenda de la hoja**, que ahora dice que `Compré`, `Vendí`, `Vendido` y `Meses` son de la última llegada cuando la bodega quedó en 0, y que `Stock` es SIEMPRE la existencia total.
>
> **Medido contra producción** (`scripts/_verif-compras-referencia.ts`, corre los MISMOS módulos puros): `4G5004G001` → **Compré 36 · Vendí 25 (el 69% de esa llegada) · Stock 12 · Meses 5**, frase `Llegaron 36 u en mar 2026 · vendo 8.7 u por mes`, histórico `72 u en total · 61 vendidas`. **`4G5004G030` (una sola llegada) → 36 · 36 (el 100% de lo comprado) · 0 · 2, sin un carácter de diferencia**; `CVM253CR02001` 120·96·24·10, `NB2570001` 935·552·345·10, `QD3958033` 180·54·126·8, `40HM265032` 280·279·0·23, `RETENCION` y `TERMO` (207% de lo comprado, sin tope) **idénticos**.
>
> **Medido en el navegador contra el build de producción y datos de producción** (`_medir-referencia-simple.mjs` en 7 casos —incluido el modelo `40HM265` con 43 tarjetas— y `_medir-referencia-pedido.mjs` con la tabla cerrada y abierta): **390 · 834 · 1024 · 1440 → 0 px de arrastre de página, 0 recortados, 0 blancos <44 px, 0 textos <12 px**. En la tabla se lee `4G5004G001 | 36 | 25 | 12 | 69% | 5` contra `4G5004G030 | 36 | 36 | 0 | 100% | 2`, y al abrir la primera la ficha dice los MISMOS cuatro números. El script de medición ahora **falla si aparece "me quedan" en pantalla**.
>
> Candados: `ventas-resumen-articulo.test.ts` (los grandes de la llegada, Stock = existencia real y ≠ llegaron − vendidas, el histórico visible, "no queda ninguna cifra rival de lo que me queda" y la regresión de **una sola llegada = idéntica**), `referencia-tabla-pedido.test.tsx` (renderiza la tabla real, lee las celdas y las compara contra la ficha que abre debajo) y `ventas-compras.test.ts` (la fila del Excel + la leyenda). Verificado por mutación: dejar los grandes en el histórico rompe 5, devolver el `me quedan` a la frase rompe 7, deducir Stock de la llegada rompe 5 y volver a repetir el % y los meses en la frase rompe 7.

### Ventas › Referencia — VENDIDO muestra el % real aunque pase de 100% (12-ago-2026, noche)

> 🩸 **DOS PANTALLAS DECÍAN COSAS DISTINTAS DEL MISMO ARTÍCULO, A TRES CENTÍMETROS DE DISTANCIA.** Daniel, con captura de `44D202G110` (vistana; compré 64, vendí 66, stock 0, una sola compra del 28-oct-2025): la tabla del modo pedido decía **`VENDIDO —`** y su propia ficha, justo debajo, decía **"el 103% de lo comprado"**. Textual: *"PORQUE NO SALE PORCENTAJE?"*.
>
> **El bug NO era el 103%: era la contradicción.** Y nació de lo de siempre — **DOS cuentas del mismo porcentaje**. `tresGrandes` lo calculaba sin tope (para la ficha) y `medirVendidoMeses` lo volvía a calcular con un guard `vendido <= comprado` (para la tabla y el Excel). Mientras nadie vendiera de más las dos coincidían; el día que pasó, se separaron.
>
> **EL ARREGLO, en dos partes:**
> - 🔴 **UN SOLO CAMPO.** `medirVendidoMeses` ya no calcula nada: **LEE `f.grandes.parteVendida`**, el mismo número que muestra la ficha. Ahora la coincidencia es por construcción, no por parecido — el candado de mutación exige que volver a calcularlo acá ponga el build rojo.
> - 🔴 **EL % SE MUESTRA AUNQUE PASE DE 100%.** Vender más de lo comprado no es "no calculable": es un **descuadre real** que el número INFORMA — dice *se vendió todo y además faltan compras por registrar*, que es justo lo que hay que ver. Esconderlo detrás de un "—" es peor. Lo explica el aviso de siempre, que ya existía y funciona: *"Se vendieron 2 unidades más de las que llegaron según los ingresos registrados"*.
>
> **El "—" queda SOLO para lo que de verdad no se puede dividir:** sin compras registradas con fecha (`RETENCION`), comprado 0, o **vendido negativo** (*"el −5% de lo comprado"* no es castellano). Esos tres siguen exactamente igual.
>
> ⚠️ **`TERMO` pasó de "—" a 207%** (vendió 1.648 de 796 compradas), y **es correcto**: su ficha ya decía "el 207% de lo comprado" desde siempre. El candado que fijaba `TERMO → "—"` se actualizó a la semántica nueva en los dos archivos (`ventas-resumen-articulo.test.ts` y el Excel en `ventas-compras.test.ts`) — era el candado el que estaba fijando el bug.
>
> **MESES no cambió, y su "—" sigue significando lo mismo:** solo aparece sin fecha de llegada utilizable. `44D202G110` da 9 (agotado, cerrado en su última venta) y `TERMO` 7.
>
> **Los tres dicen lo mismo (ficha · tabla · Excel), medido contra producción** (`scripts/_verif-compras-referencia.ts`, corre los MISMOS módulos puros):
>
> | Código | Ficha (pie de Vendí) | Tabla (VENDIDO · MESES) | Excel |
> |---|---|---|---|
> | `44D202G110` | el **103%** de lo comprado | **103% · 9** | 1,03 · 9 |
> | `TERMO` | el **207%** de lo comprado | **207% · 7** | 2,07 · 7 |
> | `RETENCION` | — | **— · —** | vacío · vacío |
>
> Y los patrón de siempre, **sin un carácter de diferencia**: `4G5004G001` 36·25 (69% de esa llegada)·12·5 · `4G5004G030` 36·36 (100%)·0·2 · `CVM253CR02001` 80%·10 · `NB2570001` 59%·10 · `QD3958033` 30%·8 · `40HM265032` 100%·23.
>
> **Verificado en el navegador contra el build de producción y datos de producción** (`_medir-referencia-pedido.mjs`, 12 filas reales): **390 · 834 · 1024 · 1440 → 0 px de arrastre, 0 recortados, 0 blancos <44 px, 0 textos <12 px**, tabla cerrada y abierta. La celda más ancha posible sigue siendo de 4 caracteres (`207%` mide lo mismo que `100%`), así que **no se tocó ni un ancho**. Leída en pantalla, la fila dice `44D202G110 | 64 | 66 | 0 | 103% | 9` y al abrirla la ficha dice `el 103% de lo comprado` con su aviso de las 2 unidades.
>
> **Candado en la otra dirección** (el que caza ESTE bug, no el que lo fijaba): `ventas-resumen-articulo.test.ts` trae el fixture `44D202G110` EXACTO y un **barrido de coherencia** que recorre los fixtures de siempre —vivos, agotados, con devoluciones, sin compra, vendido de más y con 2 llegadas— y exige que `medirVendidoMeses().parte` sea **el mismo campo** que el pie de Vendí y que los textos no puedan discrepar. `referencia-tabla-pedido.test.tsx` renderiza la tabla real, lee la celda, abre la fila y compara contra el pie de la ficha. Verificado por mutación: devolver el guard `vendido <= comprado` rompe 4, volver a calcular el % dentro de `medirVendidoMeses` rompe 5 y topear el % en 100% rompe 4.

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
