# Permisos, medidos — qué ve y qué puede hacer cada rol de verdad

> **Medido el 5-sep-2026.** Contra el código de `main` y contra la configuración
> real de producción (`fg_users`, `role_permissions`, `user_sessions`, leídas por
> la Management API). Producción **no se tocó**: solo lectura.
>
> Este archivo existe porque ya pasó un agujero real. Las secretarias no veían la
> tarjeta de Asistencia, pero **entrando por la URL recibían los 40 sueldos** —
> `requireRole` valida el ROL y nunca los módulos que la persona tiene de verdad.
> Ese caso se cerró con un guard propio (`requireAsistencia`). Lo que sigue es el
> barrido que nunca se había hecho: **las 275 rutas del sistema, una por una.**

---

## 1. La foto real

### Los 11 usuarios (todos activos, todos con contraseña cifrada)

| Usuario | Rol | Empresa fija | Dueño | Permisos a medida (`modulos_override`) |
|---|---|---|---|---|
| daniel | admin | — | sí | — (hereda del rol) |
| alberto | admin | — | no | — |
| Angela | secretaria | — | no | **sí**, 11 módulos |
| andrea | secretaria | — | no | **sí**, 11 módulos |
| Bodega | bodega | — | no | — |
| Contabilidad | contabilidad | — | no | — |
| edwin | vendedor | **vistana** | no | — |
| rey | vendedor | — | no | — |
| rodrigo | vendedor | — | no | — |
| jennifer | gerente_acs | — | no | — |
| david | gerente_boston | — | no | — |

**Bodega y Contabilidad son cuentas COMPARTIDAS**, no personas. Lo que se le abre a
esa cuenta se le abre a cualquiera que la use. Ya está dicho en el código a
propósito de Julio Garay, y vale igual para la contadora.

### Los módulos que hoy da cada rol (`role_permissions`)

| Rol | Módulos |
|---|---|
| admin | asistencia, caja, cargar, catalogos, cheques, comisiones, cxc, directorio, guias, marketing, multifashion, packing-lists, prestamos, reclamos, usuarios, ventas, referencia |
| secretaria | asistencia, caja, cargar, catalogos, cheques, comisiones, directorio, guias, marketing, packing-lists, reclamos |
| vendedor | catalogos, cxc, directorio, guias, referencia |
| bodega | guias, packing-lists, catalogos, referencia, **asistencia** |
| contabilidad | asistencia, prestamos, proveedores, gastos-contabilidad, comisiones |
| gerente_acs | multifashion |
| gerente_boston | boston, catalogos, **asistencia** |

⚠️ **La lista de `admin` no nombra `boston`, `gastos-contabilidad`, `proveedores`,
`vista-general` ni `data-health`** — y aun así los ve, porque `admin` se salta la
comprobación en todos lados. No es una falla; es que esa fila **no describe** lo
que puede un admin, y leerla como si lo hiciera engaña.

### Los permisos a medida de las dos secretarias

Cuando `modulos_override` está lleno, **REEMPLAZA** la lista del rol — no la suma.

| | Angela | andrea |
|---|---|---|
| Igual que el rol | caja, cargar, catalogos, cheques, comisiones, directorio, guias, marketing, packing-lists, reclamos | idem |
| **Le quita** | asistencia | asistencia |
| **Le agrega** | **cxc** | **multifashion** |

O sea: **Angela ve la cartera y no ve Multifashion; andrea ve Multifashion y no ve
la cartera.** Esa diferencia es la que el sistema **no respeta** — ver §5.

### La casa de cada rol

`MODULO_CASA_POR_ROL` (`src/lib/modules.ts:359`) tiene **una sola entrada**:
`gerente_boston → boston`. David aterriza en `/boston` por su casa. Jennifer y
Bodega aterrizan en su módulo por otra vía: el redirect automático de quien tiene
**un solo módulo**.

---

## 2. Cómo se protege una ruta (y dónde está la grieta)

| Guard | Archivo | Qué comprueba |
|---|---|---|
| `requireRole` | `src/lib/requireRole.ts` | Cookie firmada + **el ROL** está en la lista. **Nunca los módulos.** `admin` pasa siempre. |
| `requireAuth` | `src/lib/require-auth.ts` | Lo mismo, otra firma. `admin` pasa siempre. |
| `requireAdmin` | `src/lib/api-auth.ts` | ⚠️ **El nombre miente:** deja pasar `admin` **y `secretaria`**. |
| `requireAsistencia` | `src/lib/asistencia/guard.ts` | `requireRole` **+ el módulo efectivo**. 🔑 **El único que cierra el agujero.** |
| `CRON_SECRET` | cada cron | Bearer/`?secret=`, o sesión de admin para probarlo a mano. |
| token HMAC | galerías y PDF por cliente | Enlace firmado, sin sesión. |

🔴 **La grieta, en una línea:** de las 275 rutas, **una sola familia (Asistencia,
15 rutas) comprueba los módulos que la persona tiene de verdad.** Las otras 224
rutas de aplicación se conforman con el rol. Mientras el rol y los módulos digan
lo mismo, no se nota. En cuanto una persona tiene permisos a medida —las dos
secretarias— deja de ser cierto.

**El middleware (`src/middleware.ts`) exige sesión válida y nada más.** No mira
rol ni módulo. Todo lo que no esté en su lista pública queda detrás del login,
pero **cualquiera que esté logueado llega a cualquier ruta sin guard propio.**

---

## 3. Rutas sin ningún guard de rol

Ocho, de 275. **Ninguna es un agujero**: seis son públicas a propósito y dos
delegan el guard al handler compartido.

| Ruta | Métodos | Realidad |
|---|---|---|
| `/api/auth/check` | GET | Solo dice si la sesión vive. Sin datos. ✅ |
| `/api/catalogo/[marca]/public` | GET | **Pública a propósito** (catálogo compartible). ✅ |
| `/api/catalogo/[marca]/pedido-publico` | POST | **Pública a propósito.** ✅ |
| `/api/catalogo/[marca]/pedido-publico/[id]` | GET | **Pública a propósito.** ✅ |
| `/api/catalogo/[marca]/pedido-publico/[id]/confirmar` | POST | **Pública a propósito.** ✅ |
| `/api/marketing/facturas-pdf/[cliente]` | GET | Pública, pero con **token HMAC** por cliente (`verifyFacturasToken`). ✅ |
| `/api/catalogo/[marca]/orders/[id]/duplicar` | POST | El archivo no tiene guard, pero **`handleDuplicarPedido` sí** (`duplicar-pedido.ts:80`). ✅ |
| `/api/catalogo/[marca]/orders/[id]/enviar-switch` | GET,POST | El archivo no tiene guard, pero **`enviar-switch-route.ts:81,108` sí** (admin, secretaria, vendedor). ✅ |

🔎 **Lo público expone solo lo que debe.** Las cuatro rutas públicas cuelgan de
`/catalogo/<marca>/`: productos, precio de venta y el pedido de ese enlace.
**No tocan la cartera ni el directorio.** El pedido que entra por un enlace
público va a Contado y **no puede elegir cliente** — `clienteSwitchRoles()`
saca el rol legacy `cliente` justamente para no entregarle el directorio.

### Crons y diagnóstico: `CRON_SECRET` **o** sesión de admin

Diez rutas aceptan las dos cosas (`/api/cron/backup`, `db-salud`,
`cleanup-sessions`, `cheques-alert`, `guias-pendientes`, `integrity-check`,
`asistencia-vigia`, `prestamos-caducan`, `refresh-clientes-views`,
`/api/diag/canales-telegram`). **Es deliberado y está bien**: la segunda puerta
es `verifySession(...)?.role === "admin"`, no una sesión cualquiera. Nadie que no
sea admin entra por ahí.

⚠️ Detalle menor: seis de esas comparan `secret === process.env.CRON_SECRET`
**sin comprobar antes que la variable exista**. Hoy no abre nada — cuando no
mandan secreto el valor es `null` y `null === undefined` es falso — pero se
sostiene por una casualidad del lenguaje, no por una decisión. `canales-telegram`
sí lo comprueba explícito y contesta 503. Vale igualar las otras seis.

---

## 4. Los cinco casos que importan

### David (`gerente_boston`) — ✅ cerrado

| Debe | Estado |
|---|---|
| Boston (`/boston`, `/api/boston/*`, `/api/cxc/boston/*`) | ✅ `ROLES_MODULO_BOSTON` / `ROLES_BOSTON` |
| Catálogos **solo ver** | ✅ está en `CATALOGO_ROLES`, **no** en `CATALOGO_ADMIN_ROLES` |
| **No** la lista de comprobantes | ✅ `COMPROBANTES_ROLES` no lo nombra |
| **No** el CXC del grupo | ✅ `CXC_ROLES` = admin, secretaria, vendedor |
| **No** Ventas, Comisiones, Guías | ✅ ninguna lista lo nombra → 403 por defecto |
| **No** la búsqueda global | ✅ `/api/search` = admin, bodega, contabilidad, secretaria, vendedor |
| La ficha de un cliente del grupo contesta **404** | ✅ `esCodigoDelGrupo()` en `/api/clientes/[codigo]` |
| Su planilla con los sueldos | ✅ vía `MODULOS_PLANILLA`, empresa forzada a Boston |

### Jennifer (`gerente_acs`) — ✅ cerrado

Las 11 rutas de `/api/multifashion/*` la nombran explícitamente. **En ninguna la
empresa sale de la URL**: `american_classic` es constante del servidor en cada
una. Puede **leer** las metas pero no escribirlas (`puedeEditarMetas` = solo
admin). Fuera de Multifashion no aparece en una sola lista de roles → 403 por
defecto en ventas, cxc, clientes, comisiones y gastos.

### Bodega — ✅ cerrado, y el recorte de dinero funciona

Guías (lee y despacha), packing lists, catálogos **solo ver**, comprobantes
**solo ver**, Referencia (sin margen). La búsqueda global le da **guías +
directorio** y nada más.

🔑 **Lo más delicado está bien hecho.** Bodega está en `APROBACIONES_ROLES` (para
que Julio apruebe horas extra) pero **no** en `ASISTENCIA_ROLES`. Resultado
verificado línea por línea en `src/app/api/asistencia/planilla/route.ts:569-586`:
la respuesta **retorna antes de calcular sueldos** y trae solo `periodo`,
`aprobaciones`, `puedeAprobar` y `avisos`. **No hay `lineas` ni `totales`** — ni
siquiera el monto de las horas extra, porque de la rata se deduce el sueldo. Las
otras 11 rutas de `/api/asistencia/*` le contestan 403.

### Vendedores (Edwin, Rey, Rodrigo)

Catálogos (ver y armar pedidos, y **enviar a Switch**), CXC del grupo, directorio,
guías (lectura), Referencia. **No** alcanzan Ventas, Comisiones, Gastos,
Préstamos, Asistencia, Multifashion ni Boston.

🔴 **`associated_company` de Edwin (`vistana`) no limita nada.** Es el único
usuario que lo tiene puesto, viaja en la cookie de sesión — y **ninguna ruta de
datos filtra por él**. Edwin ve la cartera y el directorio de las **seis**
empresas, igual que Rey y Rodrigo. Si la intención era acotarlo a Vistana, hoy
no se cumple; si el campo ya no sirve, sobra y confunde.

⚠️ Dos rutas de más: `/api/packing-lists` (GET, **POST**) y
`/api/packing-lists/[id]` (GET, **DELETE**) admiten `vendedor`, que **no tiene el
módulo `packing-lists`**. No ven la ficha, pero por URL crean y borran.

### Secretarias (Ángela, Andrea) — 🔴 aquí está el problema

Ver §5. Es el mismo agujero de Asistencia, **sin tapar, en otros dos módulos.**

---

## 5. 🔴 El agujero de Asistencia tiene hermanos

`requireRole` compara el ROL. Las secretarias tienen permisos **a medida**, y ahí
el rol y los módulos dejan de coincidir. Medido ruta por ruta:

### Andrea llega a la cartera del grupo, y no tiene el módulo `cxc`

Su `modulos_override` **no incluye `cxc`** (el de Angela sí). Pero `CXC_ROLES =
["admin", "secretaria", "vendedor"]` mira el rol. **Once rutas, y no todas leen:**

| Ruta | Métodos | Qué le entrega |
|---|---|---|
| `/api/cxc/estado-cuenta/[codigo]` | GET | El estado de cuenta de cualquier cliente |
| `/api/cxc/aging-por-cliente/[codigo]` | GET | Cuánto debe y desde cuándo |
| `/api/cxc/ultimos-pagos` · `/ultimo-pago` · `/ultima-compra` | GET | Los pagos y compras |
| `/api/cxc/overrides` | GET, **POST** | **Escribe** notas del cliente |
| `/api/cxc/contact-log` | GET, **POST** | **Escribe** el registro de contacto |
| `/api/cxc/envios` | GET, **POST** | **Escribe** |
| `/api/cxc/enviar-email` | GET, **POST** | 🔴 **Le manda un correo de cobro a un cliente** |
| `/api/cxc/cobrar-lote` | **POST** | 🔴 **Cobro en lote** |

Y la búsqueda global le devuelve resultados de CXC (`search/route.ts`: «secretaria
= todo menos ventas y préstamos»).

### Angela llega a Multifashion, y no tiene el módulo

Su override **no incluye `multifashion`** (el de andrea sí). Las 10 rutas de
`/api/multifashion/*` admiten `secretaria` por rol: overview, venta del día, caja,
bonos, vendedoras, productos, fidelización, clientes wholesale, detalle mensual y
recurrentes.

### Las dos llegan a la cartera de **Boston**

`ROLES_BOSTON = ["admin", "secretaria", ROL_BOSTON]` (`src/lib/cxc/boston-roles.ts:50`).
El comentario lo justifica como «los mismos roles que el CXC menos vendedor» — pero
**ninguna de las dos secretarias tiene el módulo `cxc` por el rol**, y ninguna tiene
`boston`. Contra la regla 🔴 «Boston nunca se mezcla con el CXC del grupo», que dos
personas sin ninguno de los dos módulos lean esa cartera merece una decisión tuya,
no un comentario.

### Contabilidad llega a Ventas, y no tiene el módulo

`role_permissions.contabilidad` = asistencia, prestamos, proveedores,
gastos-contabilidad, comisiones. **No incluye `ventas`.** Pero seis rutas la
admiten por rol: `/api/ventas/resumen`, `/resumen-anual`, `/años`, `/mes-anio`,
`/clientes-12m`, `/v2`. Más `/api/multifashion/overview`, `/venta-hoy`,
`/api/cxc/aging-por-cliente/[codigo]` y dos de `/api/clientes/[codigo]/*`.

⚠️ **Y la documentación no ayuda:** la tabla de Roles de `cxc/CLAUDE.md` dice que
contabilidad tiene «ventas». **La base dice que no.** Una de las dos está vieja y
hay que decidir cuál manda.

---

## 6. Sesiones

| Dato | Valor |
|---|---|
| Total en `user_sessions` | 1.040 |
| **Vivas (sin revocar)** | **179** |
| Revocadas | 861 |
| Vivas usadas en las últimas 24 h | **10** |
| Vivas sin uso hace más de 14 días | 2 |
| La más vieja sin revocar (último uso) | 22-ago-2026 |
| Cron `cleanup-sessions` | ✅ **corrió hoy, 02:30 UTC** |

Vivas por usuario: daniel 40 · andrea 32 · Bodega 32 · Angela 21 · Contabilidad 19
· rey 13 · jennifer 13 · david 4 · edwin 4 · alberto 1.

**179 sesiones vivas para 11 personas, y solo 10 en uso.** Es el diseño
multi-dispositivo: entrar no expulsa las sesiones anteriores, y cada una corre su
propia ventana de 7 días. El cron revoca a los 14 días sin uso y corta a los 90
duro, y está corriendo. No hay nada roto — pero cada sesión viva es una llave más
que sigue abriendo la puerta, y hoy hay **18 llaves por persona**.

---

## 7. Secretos

✅ **No hay ni una clave escrita a mano en `src/`.** Se barrió con los patrones de
las claves reales (JWT `eyJ...`, `sk_live`/`sk_test`, `re_...` de Resend, `AIza...`,
tokens de bot de Telegram, bloques `BEGIN PRIVATE KEY`) y asignaciones literales a
`password`/`secret`/`apiKey`/`token`. El único acierto es un logo PNG en base64
(`src/lib/calvin-logo.ts`), que no es un secreto.

✅ `.env*` está en `.gitignore`; en git solo hay `.env.local.example` y
`scripts/agente-reloj/.env.ejemplo`, que son plantillas.

**Variables que el código exige y no están en `.env.local`** (viven en Vercel — en
producción funcionan; localmente el efecto es que esas piezas no corren):

`SESSION_SECRET` · `CRON_SECRET` · `HEALTHCHECK_TOKEN` · `ASISTENCIA_INGEST_SECRET` ·
`SUPABASE_URL` · `NEXT_PUBLIC_SITE_URL` · `TELEGRAM_BOT_TOKEN` · `TELEGRAM_CHAT_ID` ·
`TELEGRAM_BOT_TOKEN_NEGOCIO` · `TELEGRAM_CHAT_ID_NEGOCIO` · `TELEGRAM_BOT_TOKEN_SISTEMA` ·
`TELEGRAM_CHAT_ID_SISTEMA` · `R2_ACCOUNT_ID` · `R2_ACCESS_KEY_ID` · `R2_SECRET_ACCESS_KEY` ·
`R2_BUCKET` · `R2_ENDPOINT` · `TOMMY_SERVICE_ROLE_KEY` · `CALVIN_SERVICE_ROLE_KEY` ·
`JOYBEES_SERVICE_ROLE_KEY` · `REEBOK_SERVICE_ROLE_KEY` · y las seis
`NEXT_PUBLIC_{TOMMY,CALVIN,JOYBEES}_SUPABASE_{URL,ANON_KEY}`.

🔑 **`SESSION_SECRET` falla cerrado**: sin él `signSession` lanza y `verifySession`
devuelve `false` (`src/lib/session-cookie.ts:33-34`). Es el comportamiento correcto.
Ese mismo secreto firma **también** los enlaces de galería de marketing y reclamos y
el PDF de facturas por cliente — **rotarlo cierra todas las sesiones y rompe todos
los enlaces compartidos a la vez.** Hay que saberlo antes de rotarlo, no después.

⚠️ En `.env.local` sobreviven tres nombres de la era de las contraseñas por rol:
`CLIENTE_PASSWORD`, `VENDEDOR_PASSWORD`, `REEBOK_ADMIN_PASSWORD`. El código de
login **ya no las lee** (se retiraron en el Sprint 1E), pero mientras el valor siga
ahí es un secreto vivo sin dueño.

---

## 8. El login no pide usuario: la contraseña **es** la identidad

`src/app/api/auth/route.ts:56` → `const { password } = await req.json();`

No hay campo de usuario. El sistema recorre los 11 usuarios activos y compara la
contraseña contra cada uno. Consecuencias medidas:

- **Quien acierta una contraseña entra como esa persona**, sin tener que saber a
  quién apunta. Un atacante no elige objetivo: le sirve cualquiera de los 11 — y
  **dos de los 11 son admin**.
- **No distingue mayúsculas**: compara la contraseña tal cual **y** en minúsculas
  (`route.ts:77-78`). Fue para el autocapitalizado del iPhone, y el precio es un
  espacio de búsqueda más chico.
- Mínimo **8 caracteres**, y son globalmente únicas (hay una comprobación al
  crearlas). Si dos coincidieran el login se **rechaza** por ambiguo, que es la
  decisión correcta.
- El freno es el límite por IP: **5 fallos en 15 minutos**. Frena a uno; no frena a
  muchos desde muchas IP.

Todo lo demás de la autenticación está bien: bcrypt, cookie firmada con HMAC,
`httpOnly`, validación contra `user_sessions` en cada request, y `admin` sin
puertas traseras. **La debilidad no es la implementación: es que falta la mitad de
la credencial.**

---

## 9. Lo que hay que arreglar

Ordenado por gravedad. Nada de esto se tocó — es tu decisión.

### 🔴 Grave

1. **El agujero de Asistencia sigue abierto en CXC, Multifashion, Boston y Ventas.**
   Se tapó el caso que se descubrió y no la causa. Hoy: **andrea lee y ESCRIBE la
   cartera del grupo** —incluido mandar un correo de cobro a un cliente y cobrar en
   lote— **sin tener el módulo**; **Angela entra a Multifashion** sin tenerlo; **las
   dos leen la cartera de Boston**; y **Contabilidad entra a Ventas** sin tenerlo.
   *El arreglo de fondo es uno solo:* que el guard general compruebe el módulo
   efectivo, como ya hace `requireAsistencia`. Todo lo demás es tapar agujeros de a
   uno y esperar al siguiente.

2. **Decidir qué es lo correcto antes de cerrar nada.** Puede que quieras que
   andrea vea la cartera y que Angela vea Multifashion — en ese caso lo que está mal
   no es el código, son sus permisos a medida. Son dos preguntas tuyas:
   ¿andrea debe cobrar? ¿las secretarias deben ver la cartera de Boston?

### 🟠 Importante

3. **`associated_company` de Edwin no hace nada.** Está puesto en `vistana`, viaja
   en la sesión y ninguna ruta filtra por él. O se usa, o se quita: un permiso que
   parece existir y no existe es peor que ninguno.

4. **La documentación y la base no coinciden.** `cxc/CLAUDE.md` le da «ventas» a
   contabilidad; `role_permissions` no. Y la fila de `admin` no nombra cinco módulos
   que sí ve. Una de las dos fuentes tiene que mandar.

5. **Login sin nombre de usuario.** Once cuentas, dos de ellas admin, una sola
   credencial cada una, sin distinguir mayúsculas. Es la puerta de entrada de todo
   el ERP. Agregar el nombre de usuario es el cambio de mayor efecto por menor
   trabajo de esta lista.

6. **`requireAdmin` no es de admin.** Deja pasar `secretaria`
   (`src/lib/api-auth.ts:4`). El nombre va a hacer que alguien lo use creyendo que
   cierra, y no cierra. Renombrarlo.

### 🟡 Menor

7. **Vendedores crean y borran packing lists** (`POST /api/packing-lists`,
   `DELETE /api/packing-lists/[id]`) sin tener el módulo.

8. **Seis crons comparan el secreto sin comprobar que exista.** Hoy no abre nada
   por una casualidad de JavaScript. Igualarlos a `canales-telegram`, que contesta
   503 explícito.

9. **Tres contraseñas retiradas siguen en `.env.local`** (`CLIENTE_PASSWORD`,
   `VENDEDOR_PASSWORD`, `REEBOK_ADMIN_PASSWORD`). El código ya no las lee. Borrarlas.

10. **179 sesiones vivas para 11 personas**, 10 en uso. El cron corre y limpia
    bien; es el diseño multi-dispositivo. Vale saber que existe: son 18 llaves por
    persona que siguen abriendo.

11. **`/comisiones` es la única página de «Ventas y clientes» sin guard en el
    servidor.** `src/app/comisiones/page.tsx` arma los datos y recién el
    componente filtra por rol; `src/app/ventas/page.tsx:20-22` en cambio rebota
    antes. Cualquiera logueado —David incluido— recibe los años disponibles y un
    texto genérico de documentos rechazados. **No hay comisiones por vendedor ni
    cifras ahí**, así que es prolijidad, no una fuga.

12. **La navegación puede separarse del candado.** `fgModulesIncluye`
    (`src/lib/modules.ts:378`) da por bueno el permiso directo sin mirar si el
    módulo declara ese rol. Hoy no hay ningún caso real, pero un
    `role_permissions` cargado a mano pintaría una ficha que la API rebota.

---

## 10. Las 275 rutas, una por una

`admin` pasa siempre y no se repite en cada fila. «ninguno» significa que el
archivo no tiene guard propio: la sesión la exige el middleware, y en dos casos el
guard vive en el handler compartido (§3).

### Rutas de aplicación (239)

| Ruta | Métodos | Guard | Roles que pasan |
|---|---|---|---|
| `/activity-logs` | GET | requireAuth | admin |
| `/activity` | POST,GET | requireAuth | admin |
| `/admin/data-health` | GET | requireRole | admin |
| `/admin/sessions` | GET,DELETE | requireAuth | admin |
| `/admin/switch-vendedores` | GET | requireRole |  (+ sin resolver) |
| `/admin/sync-now` | POST | requireRole | admin, contabilidad, secretaria, vendedor |
| `/admin/users` | GET,POST,PUT,PATCH | requireAuth | admin |
| `/admin/vendedor-mapping` | GET,PUT | requireRole | admin |
| `/asistencia/aprobaciones` | POST | requireAsistencia | admin, bodega, contabilidad, gerente_boston |
| `/asistencia/configuracion/reglas` | GET,PUT | requireAsistencia | admin, contabilidad, secretaria |
| `/asistencia/configuracion` | GET,PUT | requireAsistencia | admin, contabilidad, secretaria |
| `/asistencia/correcciones` | GET,POST,DELETE | requireAsistencia | admin, contabilidad, secretaria |
| `/asistencia/dias-con-datos` | GET | requireAsistencia |  (+ sin resolver) |
| `/asistencia/feriados` | GET,POST,DELETE | requireAsistencia | admin, contabilidad, secretaria |
| `/asistencia/horarios` | GET,PUT | requireAsistencia | admin, contabilidad, secretaria |
| `/asistencia/justificaciones` | GET,POST,DELETE | requireAsistencia | admin, contabilidad, secretaria |
| `/asistencia/planilla-guardada` | GET,POST,PATCH | requireAsistencia | admin, contabilidad, secretaria (+ sin resolver) |
| `/asistencia/planilla` | GET,POST | requireAsistencia | admin, contabilidad, secretaria |
| `/asistencia/prestamos` | POST | requireAsistencia | admin, contabilidad, secretaria |
| `/asistencia/reloj` | GET,POST | requireAsistencia | admin, contabilidad, secretaria |
| `/asistencia/reporte` | GET | requireAsistencia | admin, contabilidad, secretaria |
| `/asistencia/vacaciones` | GET,POST,PATCH,DELETE | requireAsistencia | admin, contabilidad, secretaria |
| `/auth/check` | GET | **ninguno** | — |
| `/auth/perfil` | GET | **ninguno** | — |
| `/auth` | POST,DELETE | **ninguno** | — |
| `/auth/sesion` | GET | **ninguno** | — |
| `/boston/clientes` | GET | requireRole |  (+ sin resolver) |
| `/boston/inicio` | GET | requireRole |  (+ sin resolver) |
| `/boston/prestamos` | GET | requireRole |  (+ sin resolver) |
| `/boston/ventas` | GET | requireRole |  (+ sin resolver) |
| `/caja/categorias` | GET,POST,DELETE | requireRole | admin, secretaria |
| `/caja/export-excel` | POST | requireRole | admin, secretaria |
| `/caja/gastos/[id]` | PATCH,DELETE | requireRole | admin, secretaria |
| `/caja/gastos` | POST | requireRole | admin, secretaria |
| `/caja/periodos/[id]` | GET,PATCH,DELETE | requireRole | admin, secretaria |
| `/caja/periodos` | GET,POST | requireRole | admin, secretaria |
| `/caja/responsables` | GET,POST | requireRole | admin, secretaria |
| `/catalogo/[marca]/clientes-search` | GET | requireRole | admin, secretaria, vendedor |
| `/catalogo/[marca]/clientes-switch` | GET,PATCH | requireRole |  (+ sin resolver) |
| `/catalogo/[marca]/orders/[id]/duplicar` | POST | **ninguno** | — |
| `/catalogo/[marca]/orders/[id]/enviar-switch` | GET,POST | **ninguno** | — |
| `/catalogo/[marca]/orders/[id]/item` | PATCH | requireRole | admin, secretaria, vendedor |
| `/catalogo/[marca]/orders/[id]/pdf` | GET | requireRole | admin, secretaria, vendedor |
| `/catalogo/[marca]/orders/[id]` | GET,PUT,DELETE | **ninguno** | — |
| `/catalogo/[marca]/orders/bulk-delete` | POST | requireRole | admin, secretaria |
| `/catalogo/[marca]/orders` | GET,POST | **ninguno** | — |
| `/catalogo/[marca]/pedido-publico/[id]/confirmar` | POST | **ninguno** | — |
| `/catalogo/[marca]/pedido-publico/[id]` | GET | **ninguno** | — |
| `/catalogo/[marca]/pedido-publico` | POST | **ninguno** | — |
| `/catalogo/[marca]/pedidos-export` | POST | requireRole | admin, secretaria |
| `/catalogo/[marca]/pedidos-publicos/[short_id]/convertir` | POST | requireRole | admin, secretaria, vendedor |
| `/catalogo/[marca]/pedidos-publicos/[short_id]` | DELETE,PUT | requireRole | admin, secretaria |
| `/catalogo/[marca]/pedidos-unificado` | GET | requireRole | admin, secretaria |
| `/catalogo/[marca]/permiso-precio` | GET | requireRole | admin, secretaria, vendedor |
| `/catalogo/[marca]/products` | GET,PUT,POST,PATCH,DELETE | requireRole + requireAdmin | admin, bodega, gerente_boston, secretaria, vendedor |
| `/catalogo/[marca]/products/variantes/firmar` | POST | requireAdmin | admin, secretaria |
| `/catalogo/[marca]/products/variantes/manifiesto` | POST | requireAdmin | admin, secretaria |
| `/catalogo/[marca]/products/variantes` | GET,POST | requireAdmin | admin, secretaria |
| `/catalogo/[marca]/public` | GET | **ninguno** | — |
| `/catalogo/[marca]/send-order` | POST | requireRole | admin, secretaria, vendedor |
| `/catalogo/[marca]/sync-status` | GET | requireRole | admin, secretaria, vendedor |
| `/catalogo/[marca]/upload` | POST | requireRole |  (+ sin resolver) |
| `/catalogo/[marca]/vendedores-switch` | GET,PATCH | requireRole |  (+ sin resolver) |
| `/catalogo/checkout` | POST | requireRole | admin, secretaria, vendedor |
| `/catalogo/joybees/import` | POST | requireAdmin | admin, secretaria |
| `/catalogo/joybees/seed` | POST | requireAdmin | admin, secretaria |
| `/catalogo/mi-vendedor` | GET | requireRole | admin, secretaria, vendedor |
| `/catalogo/reebok/inventory/bulk` | POST | requireRole | admin, secretaria |
| `/catalogo/reebok/inventory` | GET,POST,PUT,DELETE | requireRole | admin, secretaria |
| `/catalogo/reebok/pedidos-publicos` | GET | requireRole | admin, secretaria |
| `/catalogo/reebok/stats` | GET | requireRole | admin, secretaria, vendedor |
| `/cheques/[id]/historial` | GET | requireRole | admin, secretaria |
| `/cheques/[id]` | PUT,DELETE | requireRole | admin, secretaria |
| `/cheques/frecuencias` | GET | **ninguno** | — |
| `/cheques` | GET,POST | **ninguno** | — |
| `/cheques/vendedores` | GET,POST | **ninguno** | — |
| `/clientes/[codigo]/historial-mensual` | GET | requireAuth | admin, contabilidad, secretaria, vendedor |
| `/clientes/[codigo]` | GET,PATCH | requireAuth | admin, bodega, secretaria, vendedor |
| `/clientes/[codigo]/ultimas-facturas` | GET | requireAuth | admin, contabilidad, secretaria, vendedor |
| `/clientes` | GET | requireAuth | admin, bodega, secretaria, vendedor |
| `/clientes/ytd` | GET | requireAuth | admin, bodega, secretaria, vendedor |
| `/clients` | GET | requireRole | admin, secretaria |
| `/cxc-summary` | GET | requireRole | admin |
| `/cxc/aging-por-cliente/[codigo]` | GET | requireAuth | admin, contabilidad, secretaria, vendedor |
| `/cxc/aging` | GET | **ninguno** | — |
| `/cxc/boston/estado-cuenta` | GET | requireRole |  (+ sin resolver) |
| `/cxc/boston` | GET | requireRole |  (+ sin resolver) |
| `/cxc/boston/ultimos-pagos` | GET | requireRole |  (+ sin resolver) |
| `/cxc/cobrar-lote` | POST | requireRole | admin, secretaria, vendedor |
| `/cxc/contact-log` | GET,POST | requireRole | admin, secretaria, vendedor |
| `/cxc/enviar-email` | GET,POST | requireRole | admin, secretaria, vendedor |
| `/cxc/envios` | GET,POST | requireRole | admin, secretaria, vendedor |
| `/cxc/estado-cuenta/[codigo]` | GET | requireRole | admin, secretaria, vendedor |
| `/cxc/overrides` | GET,POST | requireRole | admin, secretaria, vendedor |
| `/cxc/ultima-compra` | GET | requireRole | admin, secretaria, vendedor |
| `/cxc/ultimo-pago` | GET | requireRole | admin, secretaria, vendedor |
| `/cxc/ultimos-pagos` | GET | requireRole | admin, secretaria, vendedor |
| `/dashboard/vista-general` | GET | requireRole | admin |
| `/gastos-contabilidad/egresos` | GET | requireRole | admin, contabilidad |
| `/guias/[id]/cliente` | PATCH | requireRole | admin, bodega, secretaria |
| `/guias/[id]/item` | PATCH | requireRole | admin, bodega, secretaria |
| `/guias/[id]/numero-transp` | PATCH | requireRole | admin, bodega, secretaria |
| `/guias/[id]` | GET,PUT,PATCH,DELETE | requireRole | admin, bodega, secretaria, vendedor |
| `/guias/despachos-frecuentes` | GET | **ninguno** | — |
| `/guias/destinos-config` | GET,POST,PATCH,DELETE | requireRole |  (+ sin resolver) |
| `/guias/facturas-cliente` | GET | requireAuth | admin, bodega, secretaria |
| `/guias/facturas-hoy` | POST | requireAuth | admin, bodega, secretaria |
| `/guias/frecuencias` | GET | **ninguno** | — |
| `/guias` | GET,POST | **ninguno** | — |
| `/home-stats` | GET | requireRole | admin, bodega, contabilidad, secretaria, vendedor |
| `/marketing/adjuntos/[id]` | DELETE | requireRole | admin, secretaria |
| `/marketing/adjuntos` | POST | requireRole | admin, secretaria |
| `/marketing/adjuntos/upload-url` | POST | requireRole | admin, secretaria |
| `/marketing/entregas-pdf/[id]/datos` | GET | requireRole | admin, secretaria |
| `/marketing/entregas-pdf/[id]` | GET | requireRole | admin, secretaria |
| `/marketing/facturas-pdf/[cliente]` | GET | token HMAC | — |
| `/marketing/facturas/[id]/anular` | POST | requireRole | admin, secretaria |
| `/marketing/facturas/[id]/marcas` | GET,PUT | requireRole | admin, secretaria |
| `/marketing/facturas/[id]` | GET,PATCH,DELETE | requireRole | admin, secretaria |
| `/marketing/facturas/bulk` | POST | requireRole | admin, secretaria |
| `/marketing/facturas/check-duplicate` | GET | requireRole | admin, secretaria |
| `/marketing/facturas` | POST | requireRole | admin, secretaria |
| `/marketing/ia/leer-factura` | POST | requireRole | admin, secretaria |
| `/marketing/impulsadoras/[id]/pagos` | POST,GET,DELETE | requireRole | admin, secretaria |
| `/marketing/impulsadoras/[id]` | DELETE,PUT | requireRole | admin, secretaria |
| `/marketing/impulsadoras` | GET,POST | requireRole | admin, secretaria |
| `/marketing/inicio` | GET | requireRole | admin, secretaria |
| `/marketing/inventario/entregas/[id]` | PATCH,DELETE | requireRole | admin, secretaria |
| `/marketing/inventario/entregas` | GET,POST | requireRole | admin, secretaria |
| `/marketing/inventario/export` | GET | requireRole | admin, secretaria |
| `/marketing/inventario/productos/[id]/impacto-precio` | GET | requireRole | admin, secretaria |
| `/marketing/inventario/productos/[id]` | PATCH,DELETE | requireRole | admin, secretaria |
| `/marketing/inventario/productos` | GET,POST | requireRole | admin, secretaria |
| `/marketing/inventario/productos/upload-url` | POST | requireRole | admin, secretaria |
| `/marketing/marca-resumen` | GET | requireRole | admin, secretaria |
| `/marketing/marcas` | GET | requireRole | admin, secretaria |
| `/marketing/mobiliario/notas-proveedor/[id]` | PUT,DELETE | requireRole | admin |
| `/marketing/mobiliario/notas-proveedor` | GET,POST | requireRole | admin |
| `/marketing/mobiliario/notas-proveedor/upload-url` | POST | requireRole | admin |
| `/marketing/papelera/restaurar` | POST | requireRole | admin, secretaria |
| `/marketing/periodos/[id]/cerrar` | POST | requireRole | admin, secretaria |
| `/marketing/periodos/[id]/reporte` | GET | requireRole | admin, secretaria |
| `/marketing/periodos/[id]` | PATCH | requireRole | admin, secretaria |
| `/marketing/periodos` | GET | requireRole | admin, secretaria |
| `/marketing/proyectos-lista` | GET | requireRole | admin, secretaria |
| `/marketing/proyectos/[id]/anular` | POST | requireRole | admin, secretaria |
| `/marketing/proyectos/[id]/datos-zip` | GET | requireRole | admin, secretaria |
| `/marketing/proyectos/[id]/facturas-anuladas` | GET | requireRole | admin, secretaria |
| `/marketing/proyectos/[id]/facturas` | GET | requireRole | admin, secretaria |
| `/marketing/proyectos/[id]/fotos` | GET | requireRole | admin, secretaria |
| `/marketing/proyectos/[id]/marcas` | PUT | requireRole | admin, secretaria |
| `/marketing/proyectos/[id]` | GET,PATCH,DELETE | requireRole | admin, secretaria |
| `/marketing/proyectos` | GET,POST | requireRole | admin, secretaria |
| `/marketing/reportes/marca` | GET | requireRole | admin, secretaria |
| `/marketing/reportes/proyecto` | GET | requireRole | admin, secretaria |
| `/marketing/reportes/tienda` | GET | requireRole | admin, secretaria |
| `/marketing/zip-marca` | POST | requireRole | admin, secretaria |
| `/multifashion/bonos` | GET | requireRole | admin, gerente_acs, secretaria |
| `/multifashion/caja` | GET | requireRole | admin, gerente_acs, secretaria |
| `/multifashion/clientes-wholesale` | GET | requireRole | admin, gerente_acs, secretaria |
| `/multifashion/detalle-mensual` | GET | requireRole | admin, gerente_acs, secretaria |
| `/multifashion/fidelizacion` | GET | requireRole | admin, gerente_acs, secretaria |
| `/multifashion/metas` | GET,POST,PUT,DELETE | requireRole | admin, gerente_acs, secretaria |
| `/multifashion/overview` | GET | requireRole | admin, contabilidad, gerente_acs, secretaria |
| `/multifashion/productos` | GET | requireRole | admin, gerente_acs, secretaria |
| `/multifashion/retail-recurrentes` | GET | requireRole | admin, gerente_acs, secretaria |
| `/multifashion/vendedoras` | GET | requireRole | admin, gerente_acs, secretaria |
| `/multifashion/venta-hoy` | GET | requireRole | admin, contabilidad, gerente_acs, secretaria |
| `/notification-badges` | GET | requireRole | admin, bodega, contabilidad, secretaria, vendedor |
| `/overrides` | GET,POST | requireRole | admin, secretaria |
| `/packing-lists/[id]` | GET,DELETE | requireRole | admin, bodega, secretaria, vendedor |
| `/packing-lists/fallback-bulto` | POST | requireRole | admin, secretaria |
| `/packing-lists` | GET,POST | requireRole | admin, bodega, secretaria, vendedor |
| `/prestamos/aplicar-quincena` | POST | **ninguno** | — |
| `/prestamos/empleados/[id]` | GET,PUT,DELETE | requireRole |  (+ sin resolver) |
| `/prestamos/empleados` | GET,POST | requireRole |  (+ sin resolver) |
| `/prestamos/export-excel` | GET | requireRole |  (+ sin resolver) |
| `/prestamos/movimientos/[id]` | PUT,DELETE | requireRole |  (+ sin resolver) |
| `/prestamos/movimientos` | GET,POST,DELETE | requireRole |  (+ sin resolver) |
| `/prestamos/pendientes` | GET,POST | requireRole |  (+ sin resolver) |
| `/productos/cargar/descripciones/[id]` | PATCH | requireAuth | admin |
| `/productos/cargar/descripciones/aprobar` | POST | requireAuth | admin, secretaria |
| `/productos/cargar/descripciones` | GET | requireAuth | admin |
| `/productos/cargar/formulas` | GET,PUT | requireAuth | admin, secretaria |
| `/productos/cargar/historial/archivo` | GET | requireAuth | admin, secretaria |
| `/productos/cargar/historial` | GET,POST | requireAuth | admin, secretaria |
| `/productos/cargar/rubro-formulas` | GET,PUT,DELETE | requireAuth | admin, secretaria |
| `/productos/cargar/tienda-formulas` | GET,PUT | requireAuth | admin, secretaria |
| `/productos/cargar/tienda-rubro-formulas` | GET,PUT,DELETE | requireAuth | admin, secretaria |
| `/proveedores/[key]` | GET | requireRole | admin, contabilidad |
| `/proveedores` | GET | requireRole | admin, contabilidad |
| `/reclamos/[id]/comprobante` | POST | requireRole | admin, secretaria |
| `/reclamos/[id]/en-proceso` | POST | requireRole | admin, secretaria |
| `/reclamos/[id]/excel` | GET | requireRole | admin, secretaria |
| `/reclamos/[id]/fotos` | POST,DELETE | requireRole | admin, secretaria |
| `/reclamos/[id]/items` | PUT | requireRole | admin, secretaria |
| `/reclamos/[id]` | GET,PATCH,DELETE | requireRole + requireAdmin | admin, secretaria |
| `/reclamos/[id]/settlements` | POST,DELETE | requireRole | admin, secretaria |
| `/reclamos/contactos-email` | GET,POST,PATCH,DELETE | requireRole | admin, secretaria |
| `/reclamos/contactos` | GET,POST,PATCH | requireRole | admin, secretaria |
| `/reclamos/export-excel` | POST | requireRole | admin, secretaria |
| `/reclamos/export` | GET | requireRole | admin, secretaria |
| `/reclamos/factura-pdf/upload-url` | POST | requireAdmin | admin, secretaria |
| `/reclamos/ia/leer-factura` | POST | requireAdmin | admin, secretaria |
| `/reclamos/motivos` | GET,POST | requireRole | admin, secretaria |
| `/reclamos/proveedor/[empresa]/export-excel` | POST | requireRole | admin, secretaria |
| `/reclamos/proveedor/[empresa]/export-pdf` | POST | requireRole | admin, secretaria |
| `/reclamos/proveedor/[empresa]/export-zip` | POST | requireRole | admin, secretaria |
| `/reclamos/proveedor/[empresa]/send-zip` | POST | requireRole | admin, secretaria |
| `/reclamos` | GET,POST | requireAdmin | admin, secretaria |
| `/recordatorios/[id]` | PUT,DELETE | requireRole |  (+ sin resolver) |
| `/recordatorios` | GET,POST | **ninguno** | — |
| `/saldos-banco` | GET,POST | requireRole | admin, contabilidad |
| `/search` | GET | requireRole | admin, bodega, contabilidad, secretaria, vendedor |
| `/sync-status` | GET | requireAuth | — |
| `/transportistas` | GET | requireRole | admin, bodega, secretaria, vendedor |
| `/upload` | GET | requireRole | admin, secretaria |
| `/user/module-order` | GET,POST | requireRole | admin, bodega, contabilidad, secretaria, vendedor |
| `/vendors` | GET,POST,DELETE | requireRole | admin, secretaria |
| `/ventas/años` | GET | requireRole | admin, contabilidad |
| `/ventas/clientes-12m` | GET | requireRole | admin, contabilidad |
| `/ventas/comisiones/config` | GET,PUT | requireRole | admin |
| `/ventas/comisiones/consolidado` | GET | requireRole | admin, contabilidad, secretaria |
| `/ventas/comisiones/descuentos` | GET,POST | requireRole | admin, contabilidad, secretaria |
| `/ventas/comisiones/detalle` | GET | requireRole | admin, contabilidad, secretaria |
| `/ventas/comisiones/exclusiones/[empresa]/clientes-switch` | GET | requireRole | admin |
| `/ventas/comisiones/exclusiones` | GET,POST,PATCH,DELETE | requireRole | admin |
| `/ventas/comisiones` | GET | requireRole | admin, contabilidad, secretaria |
| `/ventas/mes-anio` | GET | requireRole | admin, contabilidad |
| `/ventas/productos/codigos` | GET | requireRole | admin |
| `/ventas/productos/por-cliente` | GET | requireRole | admin |
| `/ventas/productos` | GET | requireRole | admin |
| `/ventas/referencia/actualizar` | POST | requireRole |  (+ sin resolver) |
| `/ventas/referencia` | GET | requireRole |  (+ sin resolver) |
| `/ventas/resumen-anual` | GET | requireRole | admin, contabilidad |
| `/ventas/resumen` | GET | requireRole | admin, contabilidad |
| `/ventas/utilidad-cliente` | GET | requireRole | admin |
| `/ventas/v2` | GET | requireAuth | admin, contabilidad |
| `/ventas/v2/status` | GET | requireRole | admin, secretaria |

### Crons e infraestructura (36) — llave propia, nunca sesión de un usuario común

| Ruta | Métodos | Guard |
|---|---|---|
| `/asistencia/ingest` | POST,GET | INGEST_SECRET |
| `/cron/acs-fidelizacion` | GET | CRON_SECRET |
| `/cron/acs-resumen-diario` | GET | CRON_SECRET |
| `/cron/asistencia-vigia` | GET | CRON_SECRET |
| `/cron/backup` | GET | CRON_SECRET |
| `/cron/boston-cartera` | GET | CRON_SECRET |
| `/cron/calvin-catalogo` | GET | CRON_SECRET |
| `/cron/catalogos-fotos-resumen` | GET | CRON_SECRET |
| `/cron/cheques-alert` | GET | CRON_SECRET |
| `/cron/cleanup-depurador-archivos` | GET | CRON_SECRET |
| `/cron/cleanup-packing-lists` | GET | CRON_SECRET |
| `/cron/cleanup-sessions` | GET | CRON_SECRET |
| `/cron/db-salud` | GET | CRON_SECRET |
| `/cron/grupo-resumen-mensual` | GET | CRON_SECRET |
| `/cron/guias-pendientes` | GET | CRON_SECRET |
| `/cron/integrity-check` | GET | CRON_SECRET |
| `/cron/joybees-catalogo` | GET | CRON_SECRET |
| `/cron/prestamos-caducan` | GET | CRON_SECRET |
| `/cron/reebok-catalogo` | GET | CRON_SECRET |
| `/cron/refresh-clientes-views` | GET | CRON_SECRET |
| `/cron/switch-articulos` | GET | CRON_SECRET |
| `/cron/switch-reconciliacion` | GET | CRON_SECRET |
| `/cron/switch-sync` | GET | CRON_SECRET |
| `/cron/sync-articulo-info` | GET | CRON_SECRET |
| `/cron/sync-clientes-boston` | GET | CRON_SECRET |
| `/cron/sync-clientes-master` | GET | CRON_SECRET |
| `/cron/sync-egresos-varios` | GET | CRON_SECRET |
| `/cron/sync-factura-lineas` | GET | CRON_SECRET |
| `/cron/sync-ingresos-mercancia` | GET | CRON_SECRET |
| `/cron/sync-proveedores` | GET | CRON_SECRET |
| `/cron/sync-recibos` | GET | CRON_SECRET |
| `/cron/sync-utilidad` | GET | CRON_SECRET |
| `/cron/tommy-catalogo` | GET | CRON_SECRET |
| `/diag/canales-telegram` | GET | CRON_SECRET |
| `/diag/egresos-varios` | GET | CRON_SECRET |
| `/health-crons` | GET | HEALTHCHECK_TOKEN |
