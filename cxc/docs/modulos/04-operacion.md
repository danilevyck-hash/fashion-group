# Operación — Guías, Packing Lists, Reclamos, Marketing y Caja Menuda

> Referencia módulo por módulo, para decidir sin adivinar. **No repite `CLAUDE.md`**: lo apunta
> (`ver CLAUDE.md § X`) y escribe lo que le falta. Cero sugerencias de mejora — eso vive en
> `docs/eficiencia/`. Aquí solo lo que HAY.
>
> Mediciones contra producción del **4-sep-2026** (API SQL de Supabase, proyecto `rspocgqhtpveytgbtler`).
> Cuando un dato no se pudo medir, dice «no medible» y por qué.

Los cinco módulos de este archivo viven en el grupo **Operación** de `src/lib/modules.ts`
(los otros cuatro del grupo —Asistencia y Planilla, Depurador, Gastos, Préstamos, Recordatorios—
están en sus propios archivos).

| Módulo | `key` | `href` | `roles[]` del catálogo |
|---|---|---|---|
| Guías de Despacho | `guias` | `/guias` | admin · secretaria · bodega · vendedor |
| Packing Lists | `packing-lists` | `/packing-lists` | admin · secretaria · bodega |
| Reclamos | `reclamos` | `/reclamos` | admin · secretaria |
| Marketing | `marketing` | `/marketing` | admin · secretaria |
| Caja Menuda | `caja` | `/caja` | admin · secretaria |

---

# Guías de Despacho (`/guias`, key `guias`)

## Qué es

La hoja de papel con la que sale la mercancía de la bodega: qué se manda, a quién, a qué destino,
en cuántos bultos, con qué facturas y en qué camión. Se crea, se imprime, el transportista la firma
al recibir y queda como el comprobante de que la mercancía salió. Es la pantalla que más se usa en
todo el sistema: **242 guías y 566 renglones desde el 25-mar-2026**, y **770 acciones registradas**
en `activity_logs` — más que cualquier otro módulo salvo el login.

⚠️ **Cambió mucho el 4-sep-2026** (cinco commits: `115f90ed` · `c5cc0502` · `f43eb4c0` · `7fa88bf6` ·
`77cdc68a`). Todo lo nuevo cuelga de UN interruptor, `GUIAS_ATAJOS_NUEVOS`. Ver
[§ El interruptor](#-el-interruptor-guias_atajos_nuevos) más abajo.

Postmortem completo (1.198 líneas, verbatim): `docs/postmortems/guias.md`.
Invariantes vigentes resumidos: `CLAUDE.md § Invariantes por módulo › Guías`.

## Quién entra

| Quién | Puede |
|---|---|
| **admin** | Todo |
| **secretaria** | Todo, incluida la pestaña **Configuración** (`CONFIG_GUIAS_ROLES = ["admin","secretaria"]`, `src/lib/guias/destinos-config.ts`) |
| **bodega** | Crear, editar, despachar, borrar renglones — **pero NO la pestaña Configuración** (403 en `/api/guias/destinos-config`, y la fila de pestañas ni se dibuja). Auto-redirige a Guías desde `/home` por ser su único módulo |
| **vendedor** | **Solo lectura.** `GUIAS_ROLES` (GET) lo incluye; `GUIAS_WRITE_ROLES = ["admin","secretaria","bodega"]` no. Todo POST/PUT/PATCH le contesta **403** |

**Borrar una guía** es más estrecho todavía: `DELETE /api/guias/[id]` exige `["admin","secretaria"]` —
bodega no borra.

**Quién la usa de verdad** (medido en `activity_logs`, `entity_type = 'guias'`, el nombre sale de
`details->>'user_name'` porque la tabla **no tiene columna `user_name`**):

| Persona | Guías creadas | Despachos | Última acción |
|---|---|---|---|
| **Angela** (secretaria) | 119 | 251 | 4-sep-2026 20:27 UTC |
| **andrea** (secretaria) | 81 | 106 | 3-sep-2026 21:40 UTC |
| **Bodega** (usuario del rol) | 0 | 166 | 4-sep-2026 21:06 UTC |
| daniel (admin) | 2 | 17 | 17-ago-2026 |
| medicion-t203b (script de medición) | 1 | 8 | 18-ago-2026 |

O sea: **las secretarias crean, bodega despacha.** Es exactamente el reparto que el módulo asume.

**Modo solo lectura escondido:** `sessionStorage.fg_guias_readonly = "1"` apaga las escrituras de la
pantalla (`src/app/guias/page.tsx`). No hay UI para encenderlo — lo usan los scripts de medición.

## Las pantallas

### 1 · `/guias` — la lista (pestaña «Guías»)

**Qué se ve.** Buscador (*«Buscar por transportista, cliente, factura o N° de guía…»*), interruptor
«pendientes», y una fila por guía en orden de `numero` descendente. Cada fila colapsada dice
N° (`GT-XXX`), fecha, transportista y un resumen del cliente. Al tocarla se despliega el acordeón con
los envíos, el chip del cliente de cada renglón y los botones.

**Qué se puede hacer**, sin salir de la lista:
- **Editar** → `router.push('/guias/[id]?editar=1')` (navega, no escribe)
- **Despachar** → `router.push('/guias/[id]')` (solo aparece en `Pendiente Bodega`)
- **Imprimir** → arma el PDF en el cliente
- **«···»** en la FILA (no adentro del acordeón) → Eliminar, con confirmación que exige teclear
  `ELIMINAR`
- **Atar cliente** / el chip verde `D-XXX` de un renglón → abre `AtarClienteModal`

**🔴 La lista NUNCA escribe una guía.** Ni por swipe ni desplegando un formulario. El candado
(`src/__tests__/components/guias-eliminar-en-la-fila.test.tsx`, 17 casos) monta la página real, toca
los botones y cuenta lo que sale por `fetch`. Desde el 4-sep permite **exactamente una** salida que
no es lectura: el refresco de facturas de hoy (abajo). Cualquier otra la pone en rojo.

**El disparo automático al abrir `/guias`** (4-sep-2026, Daniel: *«¿por qué no se puede hacer al
apretar guías? Prefiero eso»*): al montar, si el rol puede crear guías y no está en solo lectura y
`GUIAS_ATAJOS_NUEVOS` está encendido, la pantalla llama `refrescarFacturasDelDia()` →
`POST /api/guias/facturas-hoy`, que le pide a Switch las facturas del día de las 6 empresas del
grupo. **No toca ni una guía.** Acelerador de 10 min en `sessionStorage` para evitar el doble disparo.

### 2 · `/guias/nueva` — crear una guía

**Cabecera (Información General):**

| Campo en pantalla | Obligatorio | Nota |
|---|---|---|
| **Fecha** | Sí | `<input type="date">` nativo |
| **Modo de entrega** | Sí | «Transportista» o «Entrega directa» (nuestro propio camión) |
| **Transportista** | Sí **si** el modo es transportista | Desplegable con buscador; 6 activos: RedNblue (52 guías) · Boston (30) · Edwin (28) · Transporte Sol (16) · Mojica (16) · Sanjur (14). Tiene «Otro…» |
| **Despachado por** | Sí | *«Escribe el nombre de quien despacha»*. Medido: Julio 186 · Rodrigo 33 |
| **Observaciones** | No | Va **arriba** de los campos del despacho, a propósito: se lee antes de trabajar |
| **N° guía del transportista** (cabecera) | No | Existe, pero el número real es **por renglón** |

**Panel «Facturas del cliente»** (`FacturasDelCliente.tsx`, solo con el interruptor encendido y
solo al CREAR — nunca al editar ni en una Completada):
1. Se elige el **cliente UNA vez** con `ClientePicker` (el único selector de cliente del sistema).
2. Aparecen sus facturas de las **6 empresas del grupo juntas**, agrupadas por los **últimos 3 DÍAS
   CON FACTURA** (no de calendario), el más reciente arriba, con encabezado en palabras
   («Miércoles 3 sep», `tituloDelDia`). Cada factura muestra número, empresa, monto y fecha.
3. Botón **«Ver más días»** trae 3 días más (`DIAS_POR_VER_MAS = 3`).
4. Marcar una factura **llena el renglón de SU empresa**: 4 facturas de 3 empresas = 3 envíos.
5. Chip ámbar **«Ya salió en GT-XXX»** — es **aviso, nunca bloqueo**; la casilla se marca igual.
6. Botón **«Traslado»**, separado por un «o» — escribe el texto `Traslado` en el campo Factura(s).
   Sirve para cualquier cliente. **No pide factura, pero la empresa SÍ se elige a mano.**
7. Botón **«Escribir el número»** — escribe la factura a mano con el cliente ya puesto.
8. Al pie: *«hasta las HH:MM»* (la frescura, = el sync exitoso más VIEJO de las 6 empresas) y
   **«Buscar otra vez»**.

**Envíos (uno o más renglones).** Campos por renglón:

| Campo | Obligatorio | Nota |
|---|---|---|
| **Cliente** | Sí (para poder guardar) | `ClientePicker` con «Otro…». Atar el CÓDIGO no es obligatorio: 451 de 566 renglones lo tienen (79,7%) |
| **Dirección** | Sí | *«Ciudad o destino»*. **Texto libre.** Se autollena con «el de siempre» del cliente; los demás destinos salen como botones (ver abajo) |
| **Empresa** | Sí | *«Elegir empresa…»*, valida contra las 8 empresas (`validarEmpresasItems`) |
| **Factura(s)** | Sí | *«10234, 10235»* — separadas por coma y espacio. *«Mín. 4 dígitos por factura»* |
| **Bultos** | Sí, **> 0 en total** | El POST rechaza una guía con 0 bultos totales |
| **N° transportista** | No | **No bloquea el despacho** |

**Botones de destino** (`DestinosDelCliente.tsx`): debajo de Dirección aparecen hasta 6 botones con
los destinos que ese cliente ya recibió. Se tocan, no se aplican solos. Para D-142 (Sporting Shoes
N 4) sale además un renglón de **tienda** con los números ya usados y «+ otra»; tocar «6» sobre
«Westland» compone `Westland · tienda 6` (`componerDestino`, un solo lugar).

**Guardar.** El botón dice *«Guardar Guía»*, y cuando falta algo **está apagado Y lo dice**:
*«Falta: la fecha, el transportista y quién despacha»* / *«Falta: el cliente, la empresa, la factura
y los bultos del envío 2»*. Hay **autoguardado**, pero valida sin pintar de rojo
(`validate({ pintar: false })`).

**La tarea más frecuente, contada** (crear una guía de un cliente con una factura del día):
elegir fecha (1) → modo + transportista (2) → despachado por (1) → elegir cliente en el panel (1) →
marcar la factura (1) → escribir bultos (1) → Guardar (1) = **8 toques**. La dirección se llena sola
si el cliente tiene «el de siempre».

### 3 · `/guias/[id]` — la guía: aquí se despacha

Tres estados de la misma pantalla:

- **Pendiente Bodega, en lectura:** ficha de la guía + `ListaEnvios` (una sola lista, cada renglón
  con cliente · dirección · empresa · facturas · bultos **y su caja del N° del transportista con su
  botón «Corregir»**) + el bloque de despacho abajo.
- **Pendiente Bodega, editando** (`?editar=1` o el botón «Editar»): monta el MISMO `GuiaForm` de
  `/guias/nueva`, con todo editable, sin cambiar de URL. Mientras se edita, el resumen de lectura
  **no se dibuja** — serían los mismos envíos dos veces.
- **Completada / Rechazada:** no hay botón «Editar». La cabecera dice, UNA vez,
  *«Solo se puede cambiar el cliente»* y *«Esta guía ya se despachó: no se puede editar…»*.

**El bloque de despacho** (`DespachoForm.tsx`), campos:

| Campo | ¿Bloquea el despacho? |
|---|---|
| **Placa** | **Sí**, salvo en entrega directa (`tipo_despacho = 'directo'`) |
| **Recibido por** (`receptor_nombre`) | **Sí** — es quien FIRMA, **no el cliente** |
| **Cédula** | **Sí** |
| **Chofer** (entrega directa) | **Sí** si `tipo_despacho = 'directo'` |
| **Las dos firmas** (`firma_base64` del receptor, `firma_entregador_base64`) | **Sí** |
| **≥ 1 bulto** | **Sí** |
| **N° del transportista** | **No** — *«a veces el transportista lo da, a veces no»* |

Ayuda **«Los que más usa este transportista»**: chips con los juegos (receptor + cédula + placa) más
frecuentes de ese transportista (`GET /api/guias/despachos-frecuentes`, `juegosMasFrecuentes`).

**El aviso ámbar «Falta N° transportista»** de una guía ya cerrada se apaga anotando el número desde
la propia guía (`PATCH /api/guias/[id]/numero-transp`). 🔴 **Medido: ese endpoint nunca se ha usado
en producción** — `guia_item_numero_transp` tiene **0 filas** en `activity_logs`.

### 4 · `/guias/[id]/imprimir` y el PDF

El papel (`PrintDocument.tsx` / `HojaEscalada.tsx` / `src/lib/guias/pdf-guia.ts`). Encabezado:
`N GUIA:` · `FECHA:` · `TIPO:` · `TRANSPORTISTA:` · `PLACA / VEHICULO:` · `N GUIA TRANSP.:` ·
`DESPACHADO POR:` · `CHOFER:`. Tabla: `CLIENTE` · `DIRECCION` · `EMPRESA` · `FACTURA(S)` · `BULTOS` ·
`N GUIA TRANSP.`. Al pie: `Observaciones Generales del Envio`, `Nombre y firma`,
`Nombre, cedula y firma`.

Reglas del papel:
- El encabezado **solo anuncia un N° del transportista cuando hay UNO SOLO** en toda la guía
  (`numerosTranspDeLaGuia`, `modo-despacho.ts`); si hay varios, cada uno sale en la fila de su envío.
- Un **`"0"` pelado se imprime como vacío** (`sinCeroPelado`).
- En **entrega directa no se imprimen placa ni transportista**.
- `jsPDF` (~148 kB) se pide con `await import()` y **se precarga al montar**: en iOS un `await` de red
  en medio del gesto hace que el navegador **no abra la hoja de compartir, en silencio**.

### 5 · `/guias?vista=config` — la pestaña «Configuración» (4-sep-2026)

**Solo admin y secretaria.** Para bodega y vendedor la fila de pestañas **ni se dibuja**.

Daniel: *«city shoes → Calle 19 Central, al lado de la joyería Super Oro. Y Nine Sport en Calle 19
Central»* + *«configuraciones también deja a secretaria»*. El problema que resolvió: cada corrección
de un destino costaba un **despliegue**, porque vivían en una constante de código.

**Qué se ve.** Buscador (*«Buscar cliente por nombre o código…»*), y la lista **agrupada por cliente**
(nombre + código + contador). Cada grupo DICE qué hace el formulario, con la palabra de la casa —
nunca «override» / «default» / «fallback» (`comoSeUsa`):
- con «el de siempre» y un destino: *«Se llena solo al elegir el cliente.»*
- con «el de siempre» y varios: *«El de siempre se llena solo al elegir el cliente; los demás salen
  como botones.»*
- sin marca y un destino: *«Se ofrece como botón y la persona elige. Marca «el de siempre» para que
  se llene solo.»*

**Qué se puede hacer:**
- **＋ Agregar destino**: `ClientePicker` (sin salida a mano — un destino se define para un cliente
  del directorio; el código pasa además por `validarCodigoParaAtar` en el servidor) + **Destino**
  (*«Tal como debe salir en la guía»*) + **Tiendas (opcional, separadas por coma)** (*«5, 6, 14, Mas
  Flow»*).
- **Editar** el texto de un destino en la fila.
- Marcar **«el de siempre»** (una por cliente; marcarla apaga a los hermanos **en el servidor**).
- **Quitar**, con confirmación **en palabras**: *«La Frontera Duty Free dejará de ofrecer «Guabito»
  en las guías.»* + *«Quitar un destino no borra nada: queda guardado como historial.»*
- **Promover un histórico**: los destinos que el cliente ya usó y no están definidos salen como chips
  bajo *«Usados en guías, sin definir:»* con un botón **«Definir»**. 🔴 **Promover es UN toque y
  NUNCA pasa solo** (hay mutación que lo hace pasar al dibujarse y muere en rojo).

Si la migración no hubiera corrido, la pantalla **falla CERRADO** y lo dice:
*«Falta correr la migración de guias_destino_cliente (20260918120000)»*. ✅ **Verificado el
4-sep-2026: la migración SÍ está aplicada** (`supabase_migrations.schema_migrations` tiene
`20260918120000 · guias_destino_cliente`, y la tabla trae 34 filas).

## Los datos

### `guia_transporte` — la cabecera. Grano: 1 fila por guía. Llave: `id` (uuid); `numero` es UNIQUE.

Soft delete: **`deleted boolean DEFAULT false`**. Medido: **242 filas · 20 borradas · 222 vivas** ·
`fecha` del 25-mar-2026 al 4-sep-2026.

Estados vivos: **Completada 221 · Pendiente Bodega 1**. Cero `Rechazada`, cero `Preparando`
(el `DEFAULT` de la columna) en toda la historia.
`modo_entrega` × `tipo_despacho`: transportista/externo 156 · entrega_directa/externo 50 ·
entrega_directa/directo 16.

| Columna | Para qué · quién escribe · quién lee | Llenas |
|---|---|---|
| `id` uuid | PK | 242 |
| `numero` int | `GT-XXX`. Lo asigna el POST con `max(numero)+1` y **hasta 3 reintentos** ante colisión única | 242 |
| `fecha` date | Fecha de la guía. La pone la persona | 242 |
| `transportista` **text** | 🔴 **Columna LEGACY: nadie la lee.** El `select` del GET la excluye a propósito; el nombre sale del JOIN a `transportistas`. Quedó congelada | 94 |
| `transportista_id` uuid | FK a `transportistas`. NULL en entrega directa | 173 |
| `placa` text | Placa del vehículo. Bloquea el despacho salvo entrega directa | 160 |
| `observaciones` text | Nota libre del envío. 🩸 Hace **tres trabajos** a la vez: qué va adentro, dónde entregar y quién retira | 154 |
| `monto_total` numeric | 🔴 **NADIE LA LLENA con un valor útil: 242 filas, 0 distintas de cero.** El POST/PUT la escribe como `monto_total \|\| 0` y ninguna pantalla la pide | 242 (0 ≠ 0) |
| `estado` text | Máquina de estados. **Sin CHECK constraint** — los valores válidos son convención de código. `DEFAULT 'Preparando'`, valor que **nunca se usa** (el POST escribe `'Pendiente Bodega'`) | 242 |
| `firma_transportista` text | 🔴 **0 filas.** El POST la acepta y el PATCH la permite, pero nunca llegó una | **0** |
| `nombre_entregador` text | 🔴 **0 filas.** El PATCH la permite; ninguna pantalla la manda | **0** |
| `cedula_entregador` text | 🔴 **0 filas.** Idem | **0** |
| `receptor_nombre` text | **Quien FIRMA el recibido, NO el cliente.** Son choferes; de 109 guías con receptor, **0 coinciden** con un nombre de cliente | 160 |
| `cedula` text | Cédula de quien firma. También la lee la lista, para la marca «salió incompleta» | 160 |
| `firma_base64` text | Firma del receptor (30-100 kB). **Excluida del `select` del listado** a propósito | 160 |
| `entregado_por` text | Quién despacha de nuestro lado. Julio 186 · Rodrigo 33 · 3 sin dato | 237 |
| `numero_guia_transp` text | N° del transportista de la CABECERA (herencia para las guías viejas) | 88 |
| `firma_entregador_base64` text | Firma de quien entrega | 160 |
| `deleted` bool | Soft delete | 242 |
| `tipo_despacho` text | `externo` (DEFAULT) o `directo`. Con `directo` no se pide placa y sí chofer | 242 |
| `nombre_chofer` text | Chofer de la entrega directa | 16 |
| `modo_entrega` text NOT NULL | `transportista` / `entrega_directa`. `DEFAULT 'entrega_directa'`. Es la que decide, no `tipo_despacho` | 242 |
| `motivo_rechazo` text | 🔴 **0 filas.** El estado `Rechazada` existe en el código pero **nunca se usó** | **0** |
| `created_at` | now() | 242 |

### `guia_items` — los envíos. Grano: 1 fila por renglón. Llave: `id` (uuid); único por `(guia_id, orden)` de hecho.

Soft delete: **`deleted boolean DEFAULT false`, INDEPENDIENTE del de la cabecera.** ⚠️ Filtrar solo
la cabecera deja pasar renglones borrados. Medido: **566 filas · 0 borradas** — el `deleted` de esta
tabla **nunca se ha usado**, porque el PUT reemplaza los renglones con un DELETE real (ver
«Lo que sobra o no cuadra»).

| Columna | Para qué | Llenas (no vacías) |
|---|---|---|
| `guia_id` uuid | FK a la cabecera | 566 |
| `orden` int NOT NULL | Orden del envío en la guía. El PUT usa **`orden` negativo como marcador temporal** del lote nuevo, y después lo voltea | 566 |
| `cliente` text | 🔴 **El nombre escrito a mano.** Se conserva SIEMPRE como display, aunque se ate el código | 566 (100%) |
| `cliente_codigo` text | 🔴 **La identidad del cliente.** `D-XXX` del directorio. **NO es obligatorio** — decisión de Daniel, no del código | **451 (79,7%)** |
| `direccion` text | 🔴 **El DESTINO del envío, no la dirección del cliente** (`clientes_master` no tiene esa columna). Texto libre | 566 (100%) |
| `empresa` text | Nombre de la empresa, en texto. Se valida contra las 8 | 566 (100%) |
| `facturas` text | Números separados por `", "`. Desde el 4-sep también puede decir `Traslado`. Medido: 55 renglones con 2+ facturas; **67 con `0000`** (el antiguo «Traslado sin factura»); **0 con `Traslado` todavía** | 566 (100%) |
| `bultos` int | Cantidad. El POST rechaza total 0 | 566, **todos ≠ 0** |
| `numero_guia_transp` text | El N° **POR LÍNEA** | 68 no vacías |
| `deleted` bool | Soft delete propio | 566, **0 en true** |

### `guias_destino_cliente` — los destinos definidos (migración `20260918120000`, **APLICADA**)

Grano: **(cliente_codigo, destino)**. Llave: `id` (bigint). Único **solo entre ACTIVAS**, más un
índice parcial único de «a lo sumo UN `el_de_siempre` activo por cliente».

Soft delete: **`activo = false` + firma (`desactivado_por` / `desactivado_en`), NUNCA `DELETE`** — el
patrón de `comision_exclusion`, con CHECK que exige la firma. Hay barrido sin comentarios que prohíbe
`.delete(` en la capa de base.

Medido: **34 filas, 34 activas, 26 clientes, 25 con «el de siempre», 4 con tiendas**, todas
`creado_por = 'daniel'` (la carga inicial de la migración, 4-sep 17:00 → 5-sep 01:00 UTC).

| Columna | Para qué | Llenas |
|---|---|---|
| `cliente_codigo` text NOT NULL | `D-XXX` | 34 |
| `destino` text NOT NULL | El texto tal como sale en la guía (máx. 160 caracteres) | 34 |
| `tiendas` text[] NOT NULL DEFAULT `{}` | Los números/nombres de tienda de ese destino. **Columna del mismo grano, no tabla hermana**: solo D-142 las usa | 4 filas con contenido |
| `orden` int NOT NULL DEFAULT 1 | Orden de los botones | 34 |
| `el_de_siempre` bool NOT NULL DEFAULT false | El que se llena solo al elegir el cliente | 25 en true |
| `activo` bool NOT NULL DEFAULT true | Soft delete | 34 en true |
| `creado_por` / `creado_en` | Firma del alta | 34 |
| `desactivado_por` / `desactivado_en` | Firma de la baja | 0 (nunca se quitó ninguno) |

**Contenido real, tal como está en producción:**

| Código | Destino(s) | «el de siempre» |
|---|---|---|
| D-7 | Penonomé | sí |
| D-25 | Paso Canoas | sí |
| D-26 | **Sport Corner Calidonia** (sí) · Chorrera (botón) | Sport Corner Calidonia |
| D-27, D-28, D-29, D-31, D-32, D-33, D-34, D-42, D-78 | Sport Corner Calidonia | sí (cada uno) |
| D-35 | Calle 19 Central, al lado de la joyería Super Oro | sí |
| D-43 | Las Tablas | sí |
| D-80, D-81 | Paso Canoas | sí |
| D-86 | Albrook | sí |
| D-87 | **Guabito** (gana sobre su histórico, que dice Changinola ×7) | sí |
| D-99 | Westland | sí |
| D-112 | Calle 19 Central | sí |
| D-117 | Guabito | sí |
| D-141 | Los Andes | sí |
| D-142 | Westland `[5,6,14,Mas Flow]` · Albrook `[7,8,9]` · Los Andes `[3,4]` · Santiago · Penonomé · Metromall `[10]` · Megamall · Outlet Vía España | **ninguno** (el único sin marca) |
| D-144 | Albrook | sí |
| D-147 | Changuinola | sí |
| D-156 | Changuinola | sí |

### `transportistas`

Grano: 1 fila por transportista. **6 filas, las 6 activas.** Columnas: `id`, `nombre` (NOT NULL),
`activo` (NOT NULL DEFAULT true), `created_at`. Sin soft delete `deleted` — usa `activo`.
Uso medido: RedNblue 52 · Boston 30 · Edwin 28 · Transporte Sol 16 · Mojica 16 · Sanjur 14.

### Volumen por mes (guías vivas / renglones)

| Mes | Guías | Renglones |
|---|---|---|
| 2026-03 | 9 | 13 |
| 2026-04 | 50 | 106 |
| 2026-05 | 33 | 121 |
| 2026-06 | 33 | 90 |
| 2026-07 | 46 | 94 |
| 2026-08 | 45 | 102 |
| 2026-09 (al día 4) | 6 | 6 |

## De dónde vienen los datos

Guías es **un módulo de captura**: los datos los escribe la gente. Lo que viene de afuera es la
ayuda.

| Fuente | Qué trae | Qué pasa si falla |
|---|---|---|
| `GET /api/guias/frecuencias` | Los 12 clientes más usados (chips), el orden de las empresas, la última dirección por cliente, los **destinos históricos** y los **definidos** de la tabla | La pantalla sigue: sin chips, sin botones de destino, sin autollenado. `leerDefinidosOVacio` devuelve `{}` ante `PGRST205` (tabla ausente) **sin lanzar** — fail-open a propósito |
| `GET /api/guias/facturas-cliente?codigo=D-XXX` | Las facturas del cliente en las 6 empresas del grupo, de **nuestra base** (`switch_facturas`), sin límite de días, tope 200. Trae `yaSalioEn` | Devuelve 500; el panel muestra vacío y se puede escribir a mano |
| `POST /api/guias/facturas-hoy` | Pide a **Switch en vivo** las facturas de HOY de las 6 empresas, **en serie**, ventana de UN día | **Fail-open**: una empresa caída no frena a las demás ni a la pantalla. Cooldown de 10 min (`SYNC_NOW_COOLDOWN_MIN`), lock de `switch_sync_log`, y `logoutAllSwitchSessions()` en el `finally` |
| `GET /api/guias/despachos-frecuentes?transportista=<uuid>` | Los juegos (receptor+cédula+placa) más usados de ese transportista, de las últimas 1.000 guías Completadas/Rechazadas | Devuelve `{juegos: []}` — nunca error |
| El sync programado de facturas | Alimenta `switch_facturas`, que es de donde sale el panel. 11:50/15/19/23 UTC para las 8 empresas | El panel muestra facturas viejas y la etiqueta *«hasta las HH:MM»* lo dice |

⚠️ **La sesión de Switch es por USUARIO**, y el sistema entra como `daniel`: el refresco de
`facturas-hoy` puede chocar con un cron de la misma empresa. Es el mismo trade-off que «Actualizar
ahora» (sync-now, jul-2026): el que pierda falla limpio y la reconciliación lo recupera.

**El cron que lo vigila:** `/api/cron/guias-pendientes` — **14:30 UTC** (9:30 a.m. Panamá). Lee las
guías en `Pendiente Bodega`, calcula los días completos en calendario de **Panamá** (`diaPanama`,
UTC−5 fijo) y avisa por **📊 NEGOCIO** (`enviarNegocio`) las que llevan **≥ 2 días**
(`DIAS_PARA_AVISAR`), hasta 10 listadas y el resto como «y N más» (`MAX_EN_MENSAJE`).
Lógica pura: `src/lib/guias/pendientes-aviso.ts`.

## Las reglas que ya están fijadas

Cada regla con el archivo que la sostiene. Las que tocan plata o el papel firmado van marcadas 🔴.

1. 🔴 **Una guía `Completada` está bloqueada para edición: el PUT la rechaza.**
   `if (previous?.estado === "Completada" && estado !== "Completada") → 400 "Guía ya despachada, no
   se puede editar"` (`src/app/api/guias/[id]/route.ts`). Candado: `src/__tests__/api/guias.test.ts`.
2. 🔴 **DOS excepciones que NO miran el estado**, cada una escribe UNA columna de UNA línea acotada
   con `.eq("guia_id", id)`: `PATCH /api/guias/[id]/cliente` y `PATCH /api/guias/[id]/numero-transp`.
   Candados: `guias-atar-cliente-route.test.ts` · `guias-numero-transp-tarde-route.test.ts`.
3. 🔴 **En una guía despachada se corrigen TRES campos y nada más: cliente · cliente_codigo ·
   facturas · N° del transportista. Los BULTOS NO** — es lo que el transportista firmó. Fuente única
   `CAMPOS_DESPACHADA` en `src/lib/guias/campos-editables.ts`, leída por el formulario, por
   `PATCH /api/guias/[id]/item` y por el candado `guias-campos-editables.test.ts`.
4. 🔴 **El cliente vive en `guia_items.cliente_codigo`, uno por renglón.** `receptor_nombre` es quien
   FIRMA, no el cliente. Candado: `src/__tests__/api/guias.test.ts`.
5. **Elegir cliente NO es obligatorio.** 62% de los renglones históricos van a un destino que no
   existe en el directorio; volverlo obligatorio traba a bodega. Hay mutación que lo vuelve
   obligatorio y muere en rojo (`_mutar-candados-guias-facturas.sh`).
6. **El N° del transportista es POR LÍNEA y NO bloquea el despacho.** Placa, «recibido por», cédula y
   **las dos firmas SÍ** bloquean. Candados: `guias-numero-transp-no-bloquea.test.ts` ·
   `guias-faltantes-despacho.test.ts`.
7. 🔴 **Entrega directa = nuestro propio camión: no lleva placa ni transportista**, y un `"0"` pelado
   se imprime como vacío (`sinCeroPelado`). 🩸 De 51 guías creadas como entrega directa, **50 quedaron
   grabadas como transportista externo**. Candados: `guias-modo-despacho.test.ts` (17, con el PDF
   generado de verdad) · `guias-placa-entrega-directa.test.ts` ·
   `components/guias-entrega-directa.test.tsx`.
8. 🔴 **La lista NO despacha** — ni por swipe ni desplegando un formulario. Sus botones solo navegan.
   Candados: `guias-despacho-una-sola-puerta.test.ts` ·
   `components/guias-eliminar-en-la-fila.test.tsx` (17). Desde el 4-sep el candado admite **una sola**
   salida que no es lectura: `/api/guias/facturas-hoy`.
9. 🔴 **Las sugerencias de cliente NUNCA atan solas**, ni con un único candidato. El pareo es
   **exacto y normalizado, nunca por parecido**: `Outlet Duty Free N2` y `N3` son tiendas distintas.
   Candados: `clientes-sugerencias.test.ts` · `components/guias-sugerencias-cliente.test.tsx`.
10. **El formulario no guarda si nada cambió** (`src/lib/guias/cambios-form.ts`): cargar la guía no
    puede producir una diferencia contra sí misma. Candados: `guias-cambios-form.test.ts` (30) ·
    `components/guias-editar-no-guarda-sola.test.tsx` (7, dentro de `<StrictMode>`).
11. 🔴 **UN SOLO SELECTOR DE CLIENTE en todo el sistema.** `src/__tests__/un-solo-selector-de-cliente.test.ts`
    es un **detector puro** sobre el código con tres señales y excepciones explícitas — no una lista
    de pantallas a revisar a mano.
12. 🔴 **«Ya salió en otra guía» es AVISO, nunca bloqueo.** El pareo es **por (EMPRESA, NÚMERO)**:
    los secuenciales de Switch se repiten entre empresas — «2535» existe en Vistana Y en Fashion
    Wear. Y el sistema puede afirmar «ya salió» pero **NO lo contrario** (hay facturas sin guía que
    son mostrador o retiro). El índice lee renglones VIVOS de guías VIVAS con `leerTodoPaginado`
    (`db-max-rows` corta en 1000 en silencio). Candado:
    `src/__tests__/api/guias-facturas-del-cliente.test.ts` (11, llama al handler real con la base
    doblada, y el doble APLICA los filtros capturados).
13. 🔴 **El puente a las facturas va por CÓDIGO, jamás por nombre**, y **solo las 6 del grupo por
    INCLUSIÓN** (`.in("empresa_key", B2B_EMPRESA_KEYS)`): un código que también exista en Boston no
    trae las facturas de Boston. Solo `tipo_comprobante = 'Factura'` (`TIPO_FACTURA`, amarrada con
    `satisfies` al vocabulario de `tipos-comprobante.ts`).
14. 🔴 **El campo Dirección SIGUE siendo texto libre.** Botones y autollenado son atajo, jamás
    candado; hay mutación que lo vuelve `readOnly` y muere en rojo.
15. 🔴 **El botón de destino se toca, NUNCA se aplica solo.** Lo que sí se llena solo es el destino
    marcado «el de siempre» (o el único de la historia agrupada), y **solo al ELEGIR el cliente** —
    nunca al dibujar una fila ya cargada. **Lo escrito no se pisa.** Candados:
    `guias-destinos-cliente.test.ts` (54) · `components/guia-form-destinos.test.tsx` (16).
16. 🔴 **Los destinos se agrupan por regla EXACTA (`claveDestino`), nunca por parecido**: minúsculas,
    sin acentos, sin espacios ni puntuación, **una «s» final ignorada** (junta «Paso Canoas» /
    «Pasocanoas» / «Paso Canoa»), y **los DÍGITOS se comparan tal cual sobre el texto crudo**, aparte
    de las letras. «N2» ≠ «N3»; «Wesland» (typo) ≠ «Westland». **Nada de distancia de edición.**
17. 🔴 **Orden de precedencia de los destinos: tabla → constante → histórico, en UNA función**
    (`destinosDefinidosPara`, `src/lib/guias/destinos-clientes.ts`). Si la tabla tiene filas para un
    cliente, la constante **no se mezcla** — la tabla es la foto completa de ese cliente, o quitar un
    destino en la pantalla lo reviviría desde el código. `botonesDeDestino`, `tiendasDelDestino` y
    `destinoParaAutollenar` pasan TODOS por ahí. Candado: `guias-destinos-precedencia.test.ts` (11).
18. 🔴 **Configuración es de admin y secretaria; bodega y vendedor reciben 403.** Candado:
    `src/__tests__/api/guias-destinos-config-route.test.ts` (19) con la cita de Daniel.
19. 🔴 **Quitar un destino escribe un UPDATE, nunca un DELETE.** Candado de conducta que mira QUÉ se
    escribió + barrido sin comentarios que prohíbe `.delete(` en la capa de base.
20. 🔴 **Marcar «el de siempre» apaga primero a los hermanos** (dos UPDATE, en ese orden): el índice
    parcial único rechazaría dos encendidos a la vez.
21. **Las facturas se agrupan por los últimos 3 DÍAS CON FACTURA, no de calendario**
    (`DIAS_CON_FACTURA_VISIBLES = 3`). Medido: de 471 facturas usadas en guías este año, el **77%
    salen del último día facturado, el 95% de los últimos 3**. El día es el de **Panamá**
    (`fechaPanamaDe`): una factura de las 03:00 UTC es del día anterior. Hay mutación que agrupa por
    calendario y muere en rojo.
22. 🔴 **DOS caminos y nada más: factura o «Traslado».** Daniel descartó explícitamente «Factura
    pendiente» y «Sin factura». El botón viejo «Traslado sin factura» (que escribía `0000`) **se
    retiró**; los 67 renglones viejos con `0000` **no se tocan** — es lo que el transportista firmó.
23. 🔴 **Cero migración que «limpie» el histórico de `guia_items`.** Ni los `0000`, ni las variantes
    de escritura de las direcciones. Es lo que se firmó.
24. **Los Excel del sistema empiezan en la fila 1**, con filtro desde A1 y encabezados fijos. Salen
    por `workbookBytes`/`workbookBuffer`/`workbookBlob`. Candado:
    `src/__tests__/excel-exports-operacion.test.ts`.
25. **La empresa es POR ENVÍO, no por guía** (`validarEmpresasItems`, `guias-empresa-servidor.test.ts`).
26. 🔴 **La guía nueva se numera con reintentos, no con una secuencia de base de datos**: el POST lee
    `max(numero)`, suma 1 e **intenta hasta 3 veces** si choca con el UNIQUE.

### 🔴 El interruptor `GUIAS_ATAJOS_NUEVOS`

Vive en **`src/lib/guias/atajos-facturas.ts`**, hoy en **`true`**. Daniel fijó la salida antes de
empezar: *«te aviso si quiero revertir todo después de probarlo en producción con mi secretaria estas
semanas»*.

**Qué se apaga si se pone en `false`** (la pantalla vuelve a ser exactamente la de antes de
`115f90ed`):
- El panel **«Facturas del cliente»** entero (`GuiaForm` no lo dibuja).
- El botón **«Traslado»** y su validación (`esTraslado` solo aplica encendido).
- Los **botones de destino** y el **autollenado** de la dirección.
- La ruta `/api/guias/frecuencias` **deja de mandar** `destinos` y `definidos`.
- La **pestaña Configuración** (`hayConfig` la exige) — ni la pestaña ni la vista existen.
- El **disparo automático** de `facturas-hoy` al abrir `/guias` y al entrar a `/guias/nueva`.

**Qué NO cambia, con el interruptor en cualquier posición:** el payload que sale al guardar, las
filas de `guia_items`, la guía impresa y el Excel. Hay candado que arma la misma guía por los dos
caminos y compara `instantaneaRenglones` — que es exactamente lo que el PUT escribe. **Apagarlo no
deja datos raros atrás y no hay nada que migrar de vuelta.** Las rutas nuevas
(`facturas-cliente`, `facturas-hoy`, `destinos-config`) siguen respondiendo; simplemente nadie las
llama.

Cobertura de mutación de los cuatro scripts del módulo, re-corridos enteros el 4-sep:
`_mutar-candados-guias-facturas.sh` **16/16** · `_mutar-candados-guias-destinos.sh` **15/15** ·
`_mutar-candados-guias-ajustes-4sep.sh` **17/17** · `_mutar-candados-guias-destinos-config.sh`
**11/11** = **59 de 59 cazadas, 0 sobrevivientes**.

## Con qué conecta

### Qué LEE de otros módulos

| De dónde | Qué | Para qué |
|---|---|---|
| `clientes_master` (vía `leerClientesDelGrupo`, `src/lib/clientes/directorio-cache.ts`) | Código + nombre de los 150 clientes vivos del grupo | El `ClientePicker`, la validación del código al atar (`validarCodigoParaAtar`), los nombres del chip, los chips de cliente frecuente, y la **puerta única** del alta de un destino en Configuración |
| `switch_clientes (empresa_key, cliente_switch_id)` | El **puente por CÓDIGO** a las facturas | `/api/guias/facturas-cliente`. Ese par es único por construcción: no puede multiplicar una factura |
| `switch_facturas` | Número, empresa, fecha y total de las facturas del cliente | El panel «Facturas del cliente». Solo `tipo_comprobante = 'Factura'`, solo las 6 del grupo |
| `switch_sync_log` | El último sync exitoso de facturas por empresa | La etiqueta *«hasta las HH:MM»* y el cooldown de 10 min del refresco |
| `B2B_EMPRESA_KEYS` / `ALL_EMPRESA_KEYS` (`src/lib/empresa-mapping.ts`) | Las 6 del grupo y las 8 totales | El puente (6, por inclusión) y la validación de empresa del renglón (8) |
| Switch Soft, API en vivo (`syncEmpresaFacturas`) | Las facturas de HOY | `/api/guias/facturas-hoy` |

### Quién LEE lo suyo

| Quién | Qué lee | Archivo |
|---|---|---|
| **Búsqueda global** | `guia_transporte` por N° de guía, por nombre de transportista (vía FK) y por cliente/factura de los renglones. Devuelve hasta 5 | `src/app/api/search/route.ts` |
| **Badges de notificación** (🔔) | `count` de guías en `Pendiente Bodega` | `src/app/api/notification-badges/route.ts` |
| **Cron `guias-pendientes`** (14:30 UTC) | Las pendientes con ≥ 2 días → 📊 NEGOCIO | `src/app/api/cron/guias-pendientes/route.ts` |
| **Telegram, al despachar** | `notifyGuiaDespachada` manda a 📊 NEGOCIO un `<pre>` con `GT-XXX · transportista`, los bultos **por empresa y por cliente** y el total. Sale desde el PUT **y** desde el PATCH — dos lugares | `src/app/api/guias/[id]/route.ts` |
| **Ficha de cliente** (`/clientes/[codigo]`) | Las guías de ese cliente | `src/app/clientes/[codigo]/page.tsx` |
| **`ClientePicker`** | Cuenta cuántas guías tiene cada cliente, para ordenar | `src/components/ClientePicker.tsx` |
| **Cron `backup`** (06:00/10:30/18:30 UTC) | Copia `guia_transporte` y `guia_items` | `src/app/api/cron/backup/route.ts` |
| **Excel de guías** | Una fila **por ENVÍO** (no por guía): N° Guía · Fecha · Transportista · Envío · Cliente · Destino · Empresa · Facturas · Bultos · N° Guía Transp. · Estado | `src/app/guias/components/excel-guias.ts` |

### Qué se rompería si cambiara la forma de sus datos

- **Renombrar o quitar `guia_items.cliente_codigo`** rompe: el panel de facturas, los botones de
  destino, el autollenado, `direccion-sugerida.ts`, `ClientePicker` (el conteo), la ficha de cliente
  y la búsqueda global.
- **Cambiar el separador de `facturas` (hoy `", "`)** rompe: `numerosDeFacturas` → el índice «ya
  salió», el marcado/desmarcado del panel, el papel, el PDF y el Excel. El candado de igualdad de
  payload lo caza.
- **Meter Boston en el puente de `facturas-cliente`** viola el invariante de `clientes_master` y
  muere en `_mutar-candados-guias-facturas.sh`.
- **Dropear `guias_destino_cliente`** NO rompe el formulario (fail-open a la constante) pero deja la
  pestaña Configuración en 503 con su mensaje.
- **Cambiar `estado` de `'Completada'` a otra cosa** rompe el candado del PUT, el badge, el cron de
  pendientes, `guiaYaDespachada` y `campos-editables.ts` de un golpe. La columna **no tiene CHECK**:
  nada en la base lo impide.
- **Tocar el orden negativo de `guia_items.orden`** rompe el PUT: usa el signo como marcador del lote
  nuevo.

## Por qué está así

Una línea por decisión, con la cita textual de Daniel y su fecha.

| Fecha | Decisión | Cita |
|---|---|---|
| 8-ago-2026 | El cliente de una guía vive en las LÍNEAS, no en la cabecera | *«en guía el cliente es a dónde se despachó, no el nombre del transportista»* |
| 9-ago-2026 | El chip del cliente dice el NOMBRE, no solo el código | *«quiero que se llame american classics store en guia porque sino el personal no va a saber»* |
| 14-ago-2026 | La dirección no la teclea la persona (para que no nazca otro «Pasocanoas») | *«la dirección no se escribe sola»* — regla que él mismo revocó el 4-sep |
| 17-ago-2026 | Una sola lista de envíos, y el N° del transportista deja de bloquear | *«a veces el transportista lo da, a veces no»* |
| 23-ago-2026 | «Editar» abre el MISMO formulario con el que se creó la guía | *«veo algo raro en guias, al editar una, tengo que poner despachar para editar en vez de editar, quiero botón de editar y que se me abra la guía para editar así mismo como si estuviese haciendo la guía, no algo diferente»* |
| 25-ago-2026 | Un solo botón por fila para entrar a la guía | *«solo quiero una y en boton de editar para entrar a la guia y terminarla»* |
| 25-ago-2026 | El formulario tiene que sentirse como un papel | *«que se sienta como un papel»* |
| 4-sep-2026 | El cliente se elige UNA vez y se marcan sus facturas | *«va»* (aprobó el mockup) + *«te aviso si quiero revertir todo después de probarlo en producción con mi secretaria estas semanas»* |
| 4-sep-2026 | La búsqueda de facturas se dispara al tocar Guías, no solo en «Nueva guía» | *«¿por qué no se puede hacer al apretar guías? Prefiero eso.»* |
| 4-sep-2026 | 🔴 El destino SÍ se autollena — Daniel revoca su propia regla del 14-ago | *«sí quiero que se llene sola, ¿ese no era el propósito de todo esto? ¿Cómo que no pre-llenaste la dirección?»* y *«"la dirección no se escribe sola" me refería a que el usuario no lo haga para no escribirlo mal como lo vimos, quita esa regla»* |
| 4-sep-2026 | La Frontera Duty Free es Guabito, aunque su histórico diga Changinola 7 veces | *«en Frontera Duty Free es Guabito, hazme caso.»* |
| 4-sep-2026 | Los destinos se corrigen desde una pantalla, no con un despliegue | *«crea configuración para modificar cualquier cosa así como se hizo en comisiones»* |
| 4-sep-2026 | La secretaria también administra Configuración | *«configuraciones también deja a secretaria»* |
| 4-sep-2026 | El botón Traslado, para lo que sale sin factura | *«tiene que haber la factura normal, y opción traslado por si a no solo Multifashion pero también otra tienda se le mandan cosas, que en factura salga traslado»* |
| 4-sep-2026 | «El de siempre» reemplaza a «solo autollena si hay uno» | *«sí correcto, con entrega Sport Corner como default, que elija si quiere el otro sino»* |
| 4-sep-2026 | No hay que definir cliente por cliente: la historia alcanza | *«no quiero definir cliente por cliente, ya tú debes de saberlo con las guías que hemos hecho»* |
| 4-sep-2026 | Todos los City Moda van a Sport Corner Calidonia | *«todos los City Moda en Sport Corner Calidonia, y a veces solo City Moda Chorrera en Chorrera»* |

🩸 **Lección de VOCABULARIO, escrita el 4-sep:** Daniel leyó «abrir la lista no manda ningún pedido de
escritura» y entendió *pedido de mercancía* (*«guía no es para mandar pedidos»*). En texto que Daniel
pueda leer, HTTP nunca se dice «pedido» ni «request»: se dice **leer / escribir**.

## Lo que se intentó y se retiró

| Qué | Por qué se quitó | Cuándo |
|---|---|---|
| **El formulario de despacho DENTRO de la fila de la lista** (desplegable) | Dos caminos para lo mismo. Daniel: *«solo quiero una…»* | 10-ago-2026 |
| **Dos botones «Despachar» Y «Editar» uno al lado del otro dentro del acordeón** | Se resolvió con UN solo `onEdit` que cambia de nombre según el estado | 17-ago-2026 |
| **El resumen de solo lectura de los envíos + su «Corregir», mientras se edita** | Serían los mismos envíos dos veces en la misma pantalla | 23-ago-2026 |
| **Bajar un PDF por guía al imprimir varias** | Ahora baja UN solo PDF con todas, una por página | 25-ago-2026 |
| **El botón «Traslado sin factura» (escribía `0000`)** | Lo reemplazó el botón **«Traslado»**, que escribe el texto. Los 67 renglones viejos con `0000` no se tocaron | 4-sep-2026 |
| **«Factura pendiente» y «Sin factura» como caminos del panel** | Daniel los descartó explícitamente: son DOS caminos, factura o Traslado | 4-sep-2026 |
| **El campo «tienda» para City Moda D-26** | Cada «tienda» de City Moda es OTRO cliente con código propio; el campo habría perpetuado cargarle a D-26 los envíos de los demás | 4-sep-2026 |
| **`5 de Mayo` como destino de D-26** | Se quitó al cerrar la lista definitiva: D-26 queda con «Sport Corner Calidonia» (el de siempre) y «Chorrera» | 4-sep-2026 (noche) |
| **La regla «solo autollena si el cliente tiene UN destino»** | La reemplazó la marca **«el de siempre»**, que autollena aunque haya varios | 4-sep-2026 (noche) |
| **El pre-marcado del destino sin construir** | Se anotó como «choca con el postmortem del 14-ago» y no se hizo… y ese mismo día Daniel revocó la regla del 14-ago, así que se construyó | 4-sep-2026 |

⚠️ **Lo que NO se retiró, aunque parezca:** el estado `Rechazada` con su `motivo_rechazo` sigue en el
código (nunca se usó, ver «Lo que sobra»), y `/guias/[id]/editar` sigue existiendo como redirect.

## Cuánto se usa

**Es el módulo más usado del sistema después del login.** 770 acciones en `activity_logs`
(`entity_type='guias'`) contra 168 de Préstamos y 93 de Reclamos.

**Guías creadas y despachos por mes y persona** (calendario de Panamá):

| Mes | Angela (crea/despacha) | andrea (crea/despacha) | Bodega (despacha) | daniel |
|---|---|---|---|---|
| abr-2026 | 17 / 19 | 13 / 13 | 27 | 0/7 |
| may-2026 | 20 / 104 | 13 / 32 | 21 | — |
| jun-2026 | 20 / 57 | 14 / 20 | 20 | — |
| jul-2026 | 16 / 29 | **30** / 22 | 23 | 0/5 |
| ago-2026 | **41** / 40 | 10 / 19 | **68** | 2/5 |
| sep-2026 (al día 4) | 5 / 2 | 1 / 0 | 7 | — |

Promedio: **~40 guías nuevas al mes** y **~110 despachos al mes** (un despacho registra cada PUT con
cambio de estado, así que una guía puede dejar más de uno).

**A qué hora se trabaja** (hora de Panamá, las 770 acciones): la punta es **2 p.m. (141) · 3 p.m.
(129) · 4 p.m. (127)**, con un segundo pico a **11 a.m. (65) y 1 p.m. (70)**. Antes de las 8 a.m.
casi nada (5 acciones a las 7) y después de las 6 p.m. se apaga (20 · 7 · 8).

**Última actividad:** 4-sep-2026 21:06 UTC (un despacho de Bodega). El módulo se usa **todos los
días hábiles**.

**Lo que NO se puede medir:** `activity_logs` solo registra escrituras (crear, despachar, borrar,
atar cliente, corregir renglón). No registra quién abrió la lista, quién imprimió, quién bajó el
Excel ni quién miró una guía. Como aproximación de «cuánto se mira», lo que hay es el volumen de
guías: 222 vivas.

## Qué papeles y Excel produce

🔴 **Es el módulo del sistema cuyos papeles ve más gente de afuera:** el transportista firma uno cada
vez que sale mercancía.

### 1 · La guía impresa — el papel que firma el transportista

- **De dónde sale:** botón **«Imprimir»** en la fila de la lista, o en la guía abierta.
  `PrintDocument.tsx` (pantalla) + `HojaEscalada.tsx` (la vista ampliada) + `src/lib/guias/pdf-guia.ts`
  (el PDF). Un solo generador para compartir e imprimir (`papel-de-la-guia.ts`).
- **Quién lo recibe:** el **transportista** (firma), la **tienda que recibe** (firma) y el archivo de
  la oficina.
- **Qué lleva:**
  - Encabezado — `N GUIA:` (`GT-XXX`) · `FECHA:` · `TIPO:` (Transportista externo / Entrega directa) ·
    `TRANSPORTISTA:` · `PLACA / VEHICULO:` · `N GUIA TRANSP.:` · `DESPACHADO POR:` · `CHOFER:`
  - Tabla de envíos — `CLIENTE` · `DIRECCION` · `EMPRESA` · `FACTURA(S)` · `BULTOS` · `N GUIA TRANSP.`
  - Pie — `Observaciones Generales del Envio` · `Nombre y firma` (quien entrega) ·
    `Nombre, cedula y firma` (quien recibe) · el texto legal completo
- **Reglas del papel** (candado: `guias-numero-por-linea-y-papel.test.ts` + el PDF **generado de
  verdad** y leído con `pdftotext`, `scripts/_verif-guias-papel-pdf.ts` → 33 ✅ / 0 🔴):
  el encabezado **solo anuncia un N° del transportista si hay UNO SOLO**; el `"0"` pelado no se
  imprime; en entrega directa no salen placa ni transportista; `__other__` no aparece nunca.
- **Nombre del archivo:** lo arma `papel-de-la-guia.ts` con el `GT-XXX`.

### 2 · El PDF de lote — varias guías, una por página

- **De dónde sale:** seleccionar varias guías en la lista → **«Imprimir»**.
- **Qué es:** `construirPdfGuias([...])`. Verificado: es **byte por byte** el mismo documento que
  `construirPdfGuia(g)` salvo `/CreationDate` y `/ID` (19.957 bytes los dos) y **sin hoja en blanco al
  principio**; con 3 guías, 3 páginas exactas.
- **Antes** se bajaba un PDF por guía (retirado el 25-ago-2026).

### 3 · El Excel de guías

- **De dónde sale:** el botón de exportar de la lista. `src/app/guias/components/excel-guias.ts`.
- **Quién lo recibe:** la oficina (Angela / Andrea / Daniel). No sale para afuera.
- **Grano: UNA FILA POR ENVÍO**, no por guía (cambió el 25-ago-2026). Columnas:
  **N° Guía · Fecha · Transportista · Envío · Cliente · Destino · Empresa · Facturas · Bultos ·
  N° Guía Transp. · Estado**. «Envío» dice `1 de 4 … 4 de 4`; bultos numéricos; el `"0"` pelado sale
  `«—»`; una guía sin renglones **igual aparece**.
- Verificado leyendo el archivo con **dos parsers** (`xlsx-js-style` y **openpyxl 3.1.5**):
  `A1:K14`, 14×11, **154 celdas, 0 distintas** (`scripts/_verif-guias-excel.ts`, 44 ✅ / 0 🔴).
- Empieza en la fila 1, con filtro desde A1 y encabezados fijos.

### 4 · El mensaje de Telegram al despachar

- **De dónde sale:** automático, al pasar la guía a `Completada` (PUT o PATCH).
- **Quién lo recibe:** el grupo **📊 NEGOCIO** (tres personas, incluido el celular de la empresa).
- **Qué lleva:** un bloque `<pre>` con `📦 GT-XXX · <transportista>`, después una sección por
  **empresa** y dentro los **clientes con sus bultos**, y al final `Total: N bultos`.

### 5 · El aviso diario de guías pendientes

- **De dónde sale:** cron `/api/cron/guias-pendientes`, 14:30 UTC.
- **Quién lo recibe:** **📊 NEGOCIO**.
- **Qué lleva:** las guías en `Pendiente Bodega` con ≥ 2 días, cada una con su número, sus días y su
  destino (transportista o «entrega directa»); hasta 10, y el resto como «y N más».

## Cómo probarlo a mano

Escrito para alguien que no programa. **Usa una guía de prueba, no una real.**

**A · Crear una guía con el panel de facturas**
1. Entra a **Guías**. Espera unos segundos: al abrir la lista el sistema le pide a Switch las
   facturas de hoy (no se ve nada, es callado).
2. Toca **«+ Nueva guía»**.
3. Pon la fecha de hoy, elige **Transportista** y uno de la lista, y escribe quién despacha.
4. En el panel **«Facturas del cliente»**, elige un cliente que compre seguido (por ejemplo
   *City Mall Paso Canoa*).
5. **Confirma que la Dirección se llenó sola** con «Paso Canoas». Eso prueba «el de siempre».
6. Marca una factura de la lista. **Confirma** que se llenó un envío con ese cliente, esa empresa y
   ese número de factura.
7. Escribe los bultos y toca **«Guardar Guía»**.
8. **Dónde mirar que quedó:** vuelve a `/guias` — la guía nueva aparece arriba con su `GT-XXX` en
   estado *Pendiente Bodega*. Ábrela: los envíos están ahí.

**B · Probar «Traslado»**
1. En una guía nueva, elige un cliente y toca el botón **«Traslado»** (debajo de la lista de
   facturas, después del «o»).
2. **Confirma** que el campo Factura(s) dice `Traslado` y que la empresa quedó **vacía** — hay que
   elegirla a mano.
3. Guarda e **Imprime**: en la columna FACTURA(S) del papel debe decir `Traslado`.

**C · Despachar**
1. Abre una guía pendiente y toca **«Despachar»**.
2. Escribe placa, quién recibió y su cédula, y firma las dos casillas.
3. **Confirma** que el botón se enciende. Si falta algo, el botón está apagado y **dice qué falta**.
4. Al confirmar, **mira el Telegram de 📊 NEGOCIO**: debe llegar el resumen con los bultos por
   empresa.
5. Vuelve a abrir la guía: ya no hay botón «Editar» y arriba dice *«Solo se puede cambiar el
   cliente»*.

**D · Configuración de destinos** (solo admin o secretaria)
1. En `/guias`, toca la pestaña **«Configuración»**.
2. Busca *La Frontera*. Debe decir **Guabito** y *«Se llena solo al elegir el cliente.»*
3. Toca el texto, cámbialo, guarda. Toca **Deshacer no existe** — vuelve a editarlo si te
   equivocaste.
4. **Dónde mirar que quedó:** crea una guía nueva y elige ese cliente — la dirección debe llenarse
   con el texto nuevo.
5. Toca **Quitar** en un destino: pide confirmación en palabras y aclara que nada se borra.

**E · Verificar el interruptor**
Si `GUIAS_ATAJOS_NUEVOS` estuviera en `false` (hoy está en `true`), la pantalla de Nueva guía **no
debe tener** ni panel de facturas, ni botón Traslado, ni botones de destino, ni la pestaña
Configuración — y la guía se guarda exactamente igual.

## Qué lo rompe

### La frontera con Switch

Guías toca Switch en **un solo punto**, y por **API con token** (nunca por el panel web):

| Qué | Endpoint / reporte | Vía | Usuario | Cron que lo trae |
|---|---|---|---|---|
| Las facturas del cliente | **`GET /apifactura/lista`** (`client.ts`, `listFacturas`), con `desde/hasta/porPagina/paginaActual` | **API con token** (`SWITCH_<EMPRESA>_API_*`) | `SWITCH_<EMPRESA>_API_USER` — es **`daniel`** en 7 de 8 empresas | `switch-sync tipo=facturas`, las 8 empresas a **11:50 · 15:00 · 19:00 · 23:00 UTC** (06:50 · 10:00 · 14:00 · 18:00 Panamá), ventana de 7 días atrás. Cae en `switch_facturas` |
| Las facturas de **HOY**, en vivo | El mismo `GET /apifactura/lista`, con ventana de **UN día** | **API con token** | el mismo | **Ninguno** — lo dispara `POST /api/guias/facturas-hoy` al abrir `/guias` |

**Lo que Guías descarta de la respuesta:** el sync guarda 20 campos y **tira `urlswitchpay`** (queda
solo dentro de `raw_data`); Guías, a su vez, solo lee **4** de los que sí se guardaron
(`empresa_key`, `secuencial`, `fecha`, `total`) más `tipo_comprobante` y `cliente_switch_id` para
filtrar. Todo lo demás (subtotal, descuento, impuesto, saldo, condición de venta, vendedor,
sucursal) está en la base y el panel no lo muestra.

⚠️ **La sesión de Switch es por USUARIO, no por empresa.** El refresco de `facturas-hoy` entra como
`daniel`, así que **puede chocar con un cron de la misma empresa** y con Daniel si está en el panel.
Es el mismo trade-off aceptado en jul-2026 para «Actualizar ahora». Se acota con: ventana de un día ·
cooldown de 10 min (`SYNC_NOW_COOLDOWN_MIN`) · el lock `running` de `switch_sync_log` ·
`logoutAllSwitchSessions()` en el `finally`.

### Qué pasa si algo falla, y cómo se notaría

| Falla | Qué pasa | Cómo se notaría |
|---|---|---|
| **Switch no contesta** al refresco de hoy | **Fail-open, en serie**: cada empresa se intenta por separado; la que falla se marca `error` y las demás siguen. La pantalla **no se bloquea** ni avisa | El panel muestra facturas de ayer y la etiqueta *«hasta las HH:MM»* dice una hora vieja. Hay que mirar esa etiqueta — no hay alerta |
| **Un cron de la misma empresa está corriendo** | El lock devuelve conflicto → la empresa sale como `en_curso` y se salta | Igual que arriba: solo la etiqueta |
| **El cron `switch-sync tipo=facturas` falla dos corridas seguidas** | La regla 2 de alertas dispara **🔧 SISTEMA** al chat privado de Daniel | Telegram. Y el panel de facturas se queda sin lo reciente |
| **Switch cambia el formato de `/apifactura/lista`** | El sync se cae o escribe cero; el panel muestra menos facturas de las que hay | 🔴 **Lo cubre la alerta A de `silencio-de-datos.ts`** (un sync trajo CERO con `status=success` donde siempre trae cientos) — `facturas` es un sync de universo completo. Pero **Guías no tiene alerta propia**: se enteraría por el sync, no por el módulo |
| **Switch cambia el `tipo_comprobante`** | El panel deja de ofrecer esas facturas (filtra `= 'Factura'`) | Silencioso en Guías. Lo caza el centinela `ventas_tipos` de Ventas, no este módulo |
| **La migración `20260918120000` no estuviera aplicada** | El formulario cae **limpio** a la constante (`leerDefinidosOVacio` devuelve `{}` ante `PGRST205`, fail-open) y todo sigue igual. La pestaña Configuración falla **cerrado** con 503 | La pestaña dice *«Falta correr la migración de guias_destino_cliente (20260918120000)»*. ✅ Hoy está aplicada |
| **`clientes_master` llega vacío** | `leerClientesDelGrupo()` falla → `PATCH …/cliente` y `PATCH …/item` devuelven 500 *«No se pudo leer el directorio de clientes»*; los chips de cliente frecuente no salen; el `ClientePicker` queda vacío | La pantalla lo dice al intentar atar. Los chips desaparecen en silencio |
| **`db-max-rows` (1000) sin paginar** | El índice «ya salió en otra guía» dejaría de ver guías. **Ya está resuelto**: `/api/guias/facturas-cliente` y `/api/guias/frecuencias` usan `leerTodoPaginado` con `count: "exact"` | Sería silencioso: chips ámbar que dejan de aparecer |
| **El cron `guias-pendientes` no corre** | Nadie avisa de las guías atascadas | El badge 🔔 de la app sigue contándolas (es una lectura en vivo, no depende del cron) |
| **`switch_sync_log` vacío o sin `finished_at`** | `frescuraFacturas()` devuelve `null` → la etiqueta *«hasta las HH:MM»* **no se dibuja** | Falta la etiqueta. No hay error |

🔴 **El punto ciego:** las tres veces que Switch cambió un formato este año (la cartera de Boston el
19-ago, los egresos el 1-sep, el motor de reportes) se descubrió **por accidente**. Guías no tiene
ninguna alerta propia — depende enteramente de las alertas del sync de facturas, que sí lo cubren
porque `facturas` es un sync de universo completo con historia suficiente.

## Lo que sobra o no cuadra

1. 🔴 **Cuatro columnas de `guia_transporte` con CERO filas en toda la historia:**
   `firma_transportista`, `nombre_entregador`, `cedula_entregador` y `motivo_rechazo`. Las tres
   primeras las **acepta** el POST y las **permite** el PATCH; ninguna pantalla las manda.
2. 🔴 **`motivo_rechazo` con 0 filas y el estado `Rechazada` con 0 guías.** La máquina de estados
   documentada tiene tres estados; en producción solo han existido dos (`Pendiente Bodega` y
   `Completada`). El código de `Rechazada` sigue en el listado, en `despachos-frecuentes` (que lo
   incluye en su `.in()`) y en el Excel. Hay incluso un test que se llama
   `components/guias-sin-rechazo.test.tsx`.
3. 🔴 **`monto_total` es una columna muerta con dato:** 242 filas escritas, **las 242 en cero**.
   El POST y el PUT la escriben (`monto_total || 0`); ninguna pantalla la pide ni la muestra.
4. 🔴 **`guia_transporte.transportista` (TEXT) es legacy:** 94 filas la tienen llena y el `select`
   del GET la excluye **a propósito** («la columna TEXT vieja ya no se selecciona ni se lee»). Nadie
   la lee, nadie la escribe, no se borró.
5. 🔴 **`estado` no tiene CHECK constraint** y su `DEFAULT` es `'Preparando'` — un valor que **ninguna
   guía ha tenido jamás**, porque el POST siempre escribe `'Pendiente Bodega'`. Una fila insertada
   fuera de la app nacería en un estado que ninguna pantalla entiende.
6. 🩸 **El soft delete de `guia_items` existe y nunca se usó (0 filas en `true`) — y el PUT hace
   `DELETE` REAL.** Al reemplazar los renglones,
   `supabaseServer.from("guia_items").delete().eq("guia_id", id).gte("orden", 0)` borra de verdad.
   O sea: el módulo **tiene** una convención de soft delete que su propio camino principal no
   respeta. El código que filtra `!i.deleted` (el GET, el índice «ya salió», `destinosHistoricos`) es
   correcto pero hoy no filtra nada.
7. **Tres endpoints que nunca se han usado en producción**, medido en `activity_logs`:
   - `PATCH /api/guias/[id]` (acción `guia_patch`): **0 filas**. Es un camino de escritura entero
     —con su lista de 15 campos permitidos y su propia validación de placa— que nadie ha ejercido.
   - `PUT` sin cambio de estado (acción `guia_edit`): **0 filas**. Todos los PUT registrados son
     `guia_dispatch`.
   - `PATCH /api/guias/[id]/numero-transp` (acción `guia_item_numero_transp`): **0 filas** — el flujo
     de «anotar el N° tarde» del 18-ago-2026 no se ha usado ni una vez.
8. **`activity_logs` no tiene columna `user_name`.** El nombre viaja **dentro del JSON de `details`**
   (`log-activity.ts`: «userName is merged into details (no column)»). Cualquier consulta que agrupe
   por persona tiene que hacer `details::json->>'user_name'`.
9. **Dos caminos vivos para lo mismo, a propósito:** `/guias/[id]/editar` y `/guias/[id]?editar=1`
   montan la misma pantalla — el primero redirige al segundo, que es la puerta única. Está
   documentado y con candado; se anota para que nadie lo «arregle».
10. **`numero_guia_transp` vive en las DOS tablas** (cabecera y renglón), con la de la cabecera como
    herencia para las guías viejas. 88 cabeceras y 68 renglones la tienen. La regla de qué se imprime
    está centralizada en `numerosTranspDeLaGuia` / `numeroTranspImpreso`, pero el dato sigue duplicado.
11. **Datos sucios que el módulo decidió NO limpiar** (y lo dice): 67 renglones con `facturas =
    '0000'` (el antiguo «Traslado sin factura»); las variantes de escritura de las direcciones
    («Paso Canoas» ×208 / «Pasocanoas» ×1 / «Paso Canoa» ×1, «Wesland» / «Westland», «Penonome» /
    «Penonomé»); y las 8 direcciones del histórico de D-26 que en realidad eran **envíos cargados al
    cliente equivocado** (iban a los otros City Moda, que tienen código propio).
12. **115 de 566 renglones (20,3%) no tienen `cliente_codigo`.** Es una decisión, no un bug — pero
    significa que un quinto de los envíos no cruza a la ficha del cliente ni alimenta los destinos.
13. **`FacturasDelCliente.tsx` usa `"America/Panama"` como zona horaria** en un lugar
    (`horaCorta`), mientras el resto del módulo usa el UTC−5 fijo de `fecha-panama.ts`. Para Panamá
    da lo mismo (no hay horario de verano), pero son dos mecanismos para el mismo cálculo.

---

# Packing Lists (`/packing-lists`, key `packing-lists`)

> 🔴 **DATO DE ENTRADA, VERIFICADO EL 4-SEP-2026: la tabla está VACÍA (0 filas en `packing_lists` y
> 0 en `pl_items`) y nadie carga un PL desde el 22-abr-2026 — más de cuatro meses.** El módulo entero
> sigue en pie, la pantalla funciona y el cron de limpieza corre todos los días sobre la nada
> (`cron_heartbeats.cleanup-packing-lists.last_success_at = 2026-09-05 03:00:44 UTC`).

## Qué es

Convierte el PDF de Packing List que manda el proveedor (la fábrica) en un índice buscable: **qué
estilo está en qué bulto y cuántas piezas**. Resuelve un problema físico de bodega: cuando llega un
contenedor con decenas de bultos, hay que saber en cuál abrir para sacar la **muestra** de cada
estilo (la talla M o la 32) sin abrir todos. Es solo lectura y consulta — **no descuenta inventario,
no habla con Switch, no genera ningún movimiento contable.**

## Quién entra

| Quién | Puede |
|---|---|
| **admin**, **secretaria** | Todo: subir, guardar, borrar, resolver con IA |
| **bodega** | **Solo leer**: ver el historial, abrir un PL, descargar el PDF |
| **vendedor** | ⚠️ **Solo leer, pero sin puerta**: ver abajo |

- Página (SSR y cliente) y las dos rutas GET: `allowedRoles = ["admin","secretaria","bodega","vendedor"]`.
- `POST /api/packing-lists` y `DELETE /api/packing-lists/[id]`: `["admin","secretaria"]`.
- `POST /api/packing-lists/fallback-bulto` (llama a Claude, cuesta dinero): **solo
  `["admin","secretaria"]`**.
- **Todos los demás roles** (contabilidad, gerente_acs, gerente_boston): 403 / redirect.

🔴 **Incoherencia medida entre el menú y la API:** `src/lib/modules.ts` declara
`roles: ["admin","secretaria","bodega"]` — **sin vendedor**, así que un vendedor **no ve la ficha**
en el home ni en el sidebar. Pero `hasModuleAccess()` (`src/lib/auth-check.ts`) acepta primero
`allowedRoles.includes(role)`, y las tres pantallas y las dos rutas GET **sí nombran a `vendedor`**.
Un vendedor que escriba la URL a mano **entra y lee el historial completo de las 8 empresas**. No
puede subir, editar ni borrar. No hay plata ni clientes en esa tabla, pero es una discrepancia real
entre «lo que se navega» y «lo que la API permite».

**Uso medido** en `activity_logs`: `packing_list_batch_create` **7 corridas, todas entre el 18 y el
22-abr-2026**; `packing_list_delete` **3, todas el 18-abr-2026**; `packing_lists_cleanup` **24
corridas entre el 14-may y el 6-jun-2026**, que purgaron **28 filas** en total.

## Las pantallas

### 1 · `/packing-lists` — historial + carga (`PackingListsClient.tsx`, 1.325 líneas)

**Zona de subida** (solo admin/secretaria; se oculta si hay un preview activo): arrastra o elige un
`.pdf`. 🔑 **El texto se extrae en el NAVEGADOR** con `pdfjs-dist` (worker local en
`/public/pdf.worker.min.mjs`) — **el PDF nunca sube al servidor ni a Storage**; solo viaja el texto
parseado.

**Preview de validación** (obligatorio antes de guardar). Un PDF puede traer varios PLs
concatenados; cada uno sale como una tarjeta expandible: **«PL #\<numero_pl\>»**, empresa, fecha,
bultos, piezas, estilos, y un badge:
- **«OK»** (verde)
- **«N errores»** (rojo) — la suma de piezas del parser no cuadra con el «Total piezas» del PDF
- **«Ya existe — se actualizará»** (ámbar) — ese número de PL ya está en la base

Banner fijo: **«⚠ Valida cada PL contra el PDF original antes de guardar»**.

Cuando un bulto no cuadra sale **«Bultos que no cuadran (N)»** con dos botones por bulto:
- **«Usar total del PDF (X)»** — colapsa el bulto a un ítem sintético `AJUSTE-MANUAL`
- **«Resolver con IA»** — manda el texto crudo de ese bulto a **Claude Haiku 4.5**
  (`POST /api/packing-lists/fallback-bulto`)

La tabla de estilos es editable: cada distribución por bulto es un badge que se toca
(`EditableDistBadge`) → input numérico → el blur guarda (solo si puede editar).

Botón: **«Guardar N PLs»**, o **«Guardar N de M PLs»** si algunos tienen errores sin resolver — esos
quedan bloqueados. **«Cancelar»** descarta el preview entero.

**Historial**: agrupado por día de carga (colapsable, el más reciente abierto), con pestañas de
filtro por empresa y contador. Columnas: casilla · **PL #** · **Empresa** · **Fecha Entrega** ·
**Bultos** · **Piezas** · **Estilos** · (si puede editar) el ícono de borrar. Tocar una fila navega
al detalle. Botones **«Descargar N seleccionados»** y **«Descargar todos (N)»**.

⚠️ Bajo el título «Historial» dice: **«Los PLs se eliminan automáticamente después de 7 días.»** —
**ese texto miente hoy**; ver «Lo que sobra».

Borrar pide confirmación: *«¿Eliminar PL \<numero\>? No se puede deshacer.»*

**La tarea más frecuente, contada:** arrastrar el PDF (1) → revisar el preview (0) → resolver los
bultos en rojo si los hay (0-N) → **«Guardar N PLs»** (1) = **2 toques** cuando el PDF cuadra.

### 2 · `/packing-lists/[id]` — el detalle

- Encabezado **«PL #\<numero\>»** (h1 — el número queda visible incluso a 390 px, decisión
  explícita), empresa, fecha, estilos/piezas/bultos.
- Botón **«Descargar PDF»**.
- Bloque colapsable **«Vista para sacar muestras (N bultos)»**: por bulto, los estilos cuya
  **muestra** (talla M o 32) está ahí, con casillas dibujadas para tachar con lápiz, y la marca
  **«OS»** (otro tamaño) cuando un estilo nunca tuvo M/32 en ningún bulto.
- Buscador: *«Buscar referencia…»*.
- Tabla **«Distribución completa por estilo»**: Estilo / Total / Distribución por Bulto, agrupada
  por producto.
- Ayuda (ⓘ): *«Muestra = bulto con talla M o 32 · OS = otro tamaño»*.

🔑 **La numeración de bultos (`B1`, `B2`…) sigue el orden FÍSICO del PDF original**
(`parser_metadata.bulto_order`), no el id interno — para que el `B1` de la pantalla sea el mismo `B1`
que bodega tiene en la mano.

## Los datos

### `packing_lists` — Grano: 1 fila por PL. Llave: `id` (uuid); `numero_pl` es la llave de negocio.
Soft delete: 🔴 **`deleted_at` (timestamp), NO la columna `deleted`** — es la única tabla del sistema
con esta convención (`CLAUDE.md § Trampas transversales`).

**🔴 0 filas. Ninguna viva, ninguna borrada.** No hay `min/max created_at`, no hay conteo por
columna, no hay valores distintos: **no hay ni una fila que contar.**

Columnas: `id` · `numero_pl` (text NOT NULL) · `empresa` (text) · `fecha_entrega` (date) ·
`total_bultos` (int DEFAULT 0) · `total_piezas` (int DEFAULT 0) · `total_estilos` (int DEFAULT 0) ·
`created_at` (DEFAULT now()) · `created_by` (text) · `parser_metadata` (jsonb NOT NULL DEFAULT `{}`)
· `deleted_at` (timestamptz).
⚠️ **No existe `updated_at`** — no confundirla con `deleted_at`.

### `pl_items` — Grano: 1 fila por (PL, estilo). FK `pl_id` con **CASCADE**.
Columnas: `id` · `pl_id` (uuid NOT NULL) · `estilo` (text NOT NULL) · `producto` (text NOT NULL) ·
`total_pcs` (int DEFAULT 0) · `bultos` (jsonb DEFAULT `{}`) · `bulto_muestra` (text) ·
`is_os` (boolean DEFAULT false).
**También 0 filas** — consecuencia directa del CASCADE.

**No hay «columnas que nadie llena» que marcar: el vacío es total, no parcial.**

## De dónde vienen los datos

- **Lo escribe una persona, arrastrando un PDF.** No hay cron de carga, no hay sync, no hay Switch.
- **La escritura va por una RPC atómica**: `save_packing_list`
  (`supabase/migrations/packing-lists-rpc.sql`, ajustada en
  `20260727190000_save_packing_list_producto_coalesce.sql`) — DELETE items, DELETE header, INSERT
  header, INSERT items, todo en una transacción. Si algo falla, no queda nada a medias.
- **Storage: NINGUNO.** El PDF se procesa en el navegador y no se guarda en ningún bucket.
- **La IA de respaldo** (`/api/packing-lists/fallback-bulto`): **Claude Haiku 4.5**, con
  `ANTHROPIC_API_KEY`. Recibe el texto crudo de UN bulto y devuelve el desglose. `validateFallback`
  **exige que la suma cuadre exactamente** con lo esperado antes de aceptar la respuesta.
- **El cron de limpieza**: `/api/cron/cleanup-packing-lists`, **03:00 UTC** diario
  (`src/lib/cleanup-packing-lists.ts`). 🔑 **Soft delete + retención de 90 días**
  (`RETENCION_DIAS = 90`): el borrado del usuario solo marca `deleted_at`; **un PL activo NUNCA se
  purga por edad**. El cron busca `deleted_at IS NOT NULL AND deleted_at < NOW() - 90 días`, deja un
  **snapshot** (header + items) en `activity_logs` (`packing_list_purge_snapshot`) y **recién
  entonces** hace el `DELETE` físico. Sin candidatos, **no hace nada y no deja rastro**.
  Se llama también desde `switch-reconciliacion` (10/14/18 UTC) como red por si el cron directo falló.
- **El backup diario sí copia la tabla** (`src/app/api/cron/backup/route.ts`), así que aunque el cron
  purgue, queda copia fuera de la app.

## Las reglas que ya están fijadas

1. **Un PL no se guarda si sus piezas no cuadran contra el header del PDF.** `validateParsedPL()`
   compara `sum(items.qty)` contra el «Total piezas» de cada bulto; si no cuadra, ese PL queda
   bloqueado hasta que alguien lo resuelva. Candados:
   `src/__tests__/lib/parse-packing-list.test.ts` (incluye la fusión del dígito huérfano cuando una
   cantidad ≥ 100 se parte en dos líneas) y `parse-packing-list.fixtures.test.ts` (fixture real de
   **20 PLs**: números, orden físico, etiquetas de bulto, 0 errores de cuadre).
2. **`estilo` (el SKU) es obligatorio y nunca puede faltar.** Un ítem sin estilo tumba **solo ese
   PL**, con el número de la fila — no revienta el lote entero con un 500 mudo. `producto` vacío **sí
   es legítimo** (el parser lo produce así a propósito). Candado:
   `src/__tests__/lib/campos-obligatorios.test.ts`, sección 5.
3. **El orden físico del bulto se preserva** (`parser_metadata.bulto_order`), para que el `B1` de la
   pantalla sea el `B1` que bodega tiene en la mano. Candado: el fixture test, caso «respeta orden
   físico de bultos por PL».
4. **Cuatro invariantes al guardar** (`checkSaveTimeInvariants`) marcan `needs_review` en
   `parser_metadata` si algo no cuadra: la suma por SKU, la suma por bulto, una muestra sin M/32 y la
   cobertura de `bulto_order`. Sin test dedicado.
5. **La respuesta de la IA se valida antes de aceptarse**: `validateFallback` exige que la suma cuadre
   exactamente. ⚠️ **Sin test unitario propio** — no existe `fallback-bulto.test.ts`.
6. **Retención: soft delete y 90 días desde el borrado, con snapshot antes de purgar.**
   ⚠️ **Sin candado unitario del corte de 90 días** — el único registro es
   `src/__tests__/lib/cron-registro.test.ts`, que verifica que el cron **exista** en `vercel.json`,
   no que la lógica sea correcta.

## Con qué conecta

### Qué LEE de otros módulos
**Nada.** No toca Switch, ni `switch_articulo_info`, ni guías, ni CXC, ni clientes. Es una isla.
Su único acoplamiento externo es `ANTHROPIC_API_KEY` (la IA de respaldo) y `activity_logs`.

### Quién LEE lo suyo
**Nadie.** Verificado por `grep` de `packing` en todo `src/`:
- **No** está en la búsqueda global (los 8 módulos son CXC, Reclamos, Guías, Directorio, Cheques,
  Ventas, Préstamos, Caja).
- **No** aparece en badges ni notificaciones.
- **No** aparece en Data Health ni en Vista General.
- Las únicas menciones fuera de sus propios archivos son **comentarios de otros módulos** que lo
  citan: como ejemplo de patrón (`ReporteTab.tsx` de Asistencia, `ComisionesPorEmpresaView.tsx` de
  Comisiones — los dos por el `await import()` de las librerías pesadas) y como **evidencia de tabla
  vacía** (`src/lib/tommy-bulto.ts`, que dice que el dato de bultos por estilo no se puede derivar de
  `packing_lists` porque está vacía).
- El único lector real es el **cron de backup**, que la incluye en la lista de tablas a copiar.

### Qué se rompería
**Nada del resto del sistema.** Si el módulo se apagara mañana, ningún endpoint, ninguna pantalla y
ningún número de otro módulo cambiaría.

## Por qué está así

No hay ninguna cita de Daniel registrada sobre este módulo en `docs/postmortems/`,
`docs/estado-actual.md` ni en los comentarios del código. Lo que sí hay son decisiones técnicas con
su razón escrita:

| Decisión | Razón escrita |
|---|---|
| El PDF se parsea en el navegador, no en el servidor | El PDF nunca sube: no hay bucket, no hay costo de Storage, no hay archivo que purgar |
| La numeración de bultos sigue el orden físico del PDF | Para que el `B1` de la pantalla sea el `B1` que bodega tiene en la mano |
| La «muestra» es la talla M (o la 32) | Es el criterio real de bodega para abrir un solo bulto |
| El PDF descargable lleva casillas de verdad | Para imprimirlo y tachar con lápiz en la bodega |
| Un ítem sin `estilo` tumba solo su PL | Antes tumbaba el lote entero con un 500 mudo |
| El guardado va por RPC atómica | Un guardado a medias dejaría un PL sin ítems |

## Lo que se intentó y se retiró

| Qué | Por qué se quitó | Cuándo |
|---|---|---|
| **Auto-borrado a los 7 días por edad** (borrado FÍSICO directo por `created_at`, sin soft delete) | Se cambió por **soft delete + 90 días desde el borrado manual**: un PL activo ya no se borra solo | 7-jun-2026 (commit `e90f1aa8`, migración `20260607132000_packing_lists_soft_delete.sql`) |

🔴 **El texto de la pantalla nunca se actualizó** y sigue diciendo la regla vieja. Ver «Lo que sobra».

## Cuánto se usa

🔴 **No se usa. Medido:**

| Señal | Valor |
|---|---|
| Filas en `packing_lists` hoy | **0** |
| Filas en `pl_items` hoy | **0** |
| Última carga real (`packing_list_batch_create`) | **22-abr-2026 21:26 UTC** — 7 corridas entre el 18 y el 22-abr |
| Último borrado manual (`packing_list_delete`) | **18-abr-2026**, 3 registros |
| Última purga con trabajo (`packing_lists_cleanup`) | **6-jun-2026** — 24 corridas del 14-may al 6-jun, 28 filas purgadas |
| El cron sigue corriendo | **Sí**: `cron_heartbeats.cleanup-packing-lists.last_success_at = 2026-09-05 03:00:44 UTC` |

O sea: se usó **cinco días de abril**, lo cargado se borró a mano, el cron lo purgó en mayo-junio, y
desde el 6-jun-2026 el cron corre en silencio (early return, sin candidatos) sobre una tabla vacía.
**Cuatro meses y medio sin un solo PL.**

## Qué papeles y Excel produce

**Un solo papel, y no sale de la bodega.**

### El PDF «Índice de Estilos por Bulto»
- **De dónde sale:** botón **«Descargar PDF»** en el detalle de un PL, o **«Descargar N
  seleccionados»** / **«Descargar todos (N)»** en el historial (que combinan varios haciendo un fetch
  por PL).
- **Quién lo recibe:** **bodega**, para imprimirlo y trabajar con él en la mano.
- **Qué lleva, dos secciones:**
  1. **«Vista para sacar muestras»** — por bulto, los estilos cuya muestra está ahí, **con casillas
     de verdad para tachar con lápiz**, y la marca `OS` para los estilos sin M/32.
  2. **«Distribución completa por estilo»** — tabla Estilo / Total / Distribución por bulto.
- **Título:** `Índice de Estilos por Bulto - PL #X`. Generado con jsPDF.

**No hay Excel, no hay correo, no hay Telegram.** Nada sale de este módulo hacia afuera.

⚠️ La pantalla del detalle usa `id="pl-print-area"` con clases `print:hidden`, pero el `@media print`
global (`src/app/globals.css`) solo hace visible `#print-document` — un **Ctrl+P del navegador en
esa pantalla no imprimiría nada útil**. En la práctica no importa: el único camino real es el botón
«Descargar PDF», que no usa `window.print()`.

## Cómo probarlo a mano

⚠️ Para probarlo hace falta un **PDF de Packing List de un proveedor**. Sin uno, no hay nada que
probar — la pantalla arranca vacía.

1. Entra a **Packing Lists** con el usuario de admin o secretaria.
2. **Confirma que el historial está vacío** («No hay packing lists» o similar). Eso es lo esperado
   hoy.
3. Arrastra un PDF de packing list a la zona de subida.
4. **Confirma que aparece una tarjeta por cada PL del PDF**, con su número, su empresa y su badge:
   verde **«OK»** o rojo **«N errores»**.
5. Si algún bulto sale en rojo, ábrelo y usa **«Usar total del PDF»** o **«Resolver con IA»**.
   **Confirma que el badge pasa a verde.**
6. Toca **«Guardar N PLs»**.
7. **Dónde mirar que quedó:** el PL aparece en el historial, agrupado por el día de hoy.
8. Ábrelo. **Confirma** que el bloque «Vista para sacar muestras» dice, por cada bulto, los estilos
   que ahí tienen su M o su 32.
9. Toca **«Descargar PDF»** e imprímelo. **Confirma** que las casillas se pueden tachar.
10. Borra el PL de prueba. **Confirma** que desaparece del historial — pero **no se borra de verdad**:
    queda con `deleted_at` puesto y el cron lo purgará a los 90 días.

## Qué lo rompe

**No toca Switch.** Nada de lo que Switch cambie puede romperlo.

| Falla | Qué pasa | Cómo se notaría |
|---|---|---|
| 🔴 **El proveedor cambia el formato de su PDF** | El parser deja de reconocer bultos o cantidades. Los PLs salen con badge rojo **«N errores»** — o peor, **cuadran mal en silencio si el cambio no altera la suma** | **Se notaría en el preview**, que es exactamente para eso. Es el único módulo del archivo cuya validación es la pantalla misma |
| **`ANTHROPIC_API_KEY` falta o Claude no contesta** | «Resolver con IA» falla. Queda «Usar total del PDF (X)» como salida | Un error en el botón. El flujo no se bloquea |
| **La IA devuelve algo que no suma** | `validateFallback` **la rechaza** — no se acepta una respuesta que no cuadre | El bulto sigue en rojo |
| **El cron `cleanup-packing-lists` no corre** | Los PLs borrados a mano se quedan indefinidamente con `deleted_at` puesto | 🔴 **Nadie se enteraría**: no hay alerta, y hoy la tabla está vacía |
| **La RPC `save_packing_list` no existe** | El POST falla entero. Nada se guarda a medias | Error visible al guardar |
| **`pdfjs-dist` o su worker no cargan** | No se puede extraer el texto: la subida falla en el navegador | Error visible |
| **`db-max-rows` (1000)** | Irrelevante con 0 filas. Un contenedor grande puede pasar 1.000 `pl_items` — no encontré paginación en las lecturas del detalle | Se notaría como un PL al que le faltan estilos |

🔴 **El riesgo mayor de este módulo no es que se rompa: es que ya nadie lo mire.** Si el proveedor
cambió su formato en mayo, no hay forma de saberlo — nadie ha vuelto a subir un PDF.

## Lo que sobra o no cuadra

1. 🔴 **EL MÓDULO ENTERO ESTÁ SIN USO.** `packing_lists` y `pl_items` con **0 filas**; la última carga
   real fue el **22-abr-2026**; los últimos borrados a mano, el **18-abr-2026**; la última purga con
   trabajo, el **6-jun-2026**. Son **2.250 líneas de pantalla + 464 de API + el parser + el fallback
   de IA + un cron diario** funcionando sobre la nada. **Más de cuatro meses.**
2. 🔴 **El texto de la pantalla miente sobre la retención.** El historial dice
   **«Los PLs se eliminan automáticamente después de 7 días.»** Eso era cierto cuando se escribió
   (commit `954ce96d`, borrado FÍSICO directo por `created_at`). El **7-jun-2026** (commit `e90f1aa8`,
   migración `20260607132000_packing_lists_soft_delete.sql`) el mecanismo cambió por completo: hoy un
   PL activo **NUNCA se borra por edad**, y solo se purga a los **90 días DESPUÉS de que alguien lo
   borra a mano**. El texto nunca se actualizó — dice 7 días de vida automática cuando la realidad es
   vida indefinida.
3. ⚠️ **Acceso de `vendedor` fantasma.** `src/lib/modules.ts` **no** lo incluye en `roles[]` (por eso
   no ve la ficha en el menú), pero las tres pantallas y las dos rutas GET **sí lo nombran** en
   `allowedRoles` / `READ_ROLES`. Un vendedor que escriba la URL entra y lee el historial completo de
   las 8 empresas. No es una filtración sensible (no hay plata ni clientes ahí), pero es una
   inconsistencia real entre lo que se navega y lo que la API permite.
4. **Sin candado de test para dos cosas que importan:** el **corte de 90 días** del cron (no existe
   `cleanup-packing-lists.test.ts`) y la **validación de la respuesta de la IA** (no existe
   `fallback-bulto.test.ts`). El único registro vivo de la retención es el comentario del código y
   `cron-registro.test.ts`, que solo verifica que el cron **exista** en `vercel.json`.
5. **La pantalla del detalle tiene marcas de impresión que no funcionan:** usa `id="pl-print-area"` y
   `print:hidden`, pero el `@media print` global solo hace visible `#print-document`. Un Ctrl+P no
   imprimiría nada útil. No importa en la práctica (el camino real es «Descargar PDF»), pero es
   código de impresión huérfano.
6. **`packing_lists` es la ÚNICA tabla del sistema que usa `deleted_at` (timestamp) en vez de
   `deleted boolean`.** Está documentado en `CLAUDE.md § Trampas transversales`, y sigue siendo una
   trampa para cualquiera que escriba una consulta nueva.
7. **No existe `updated_at`** en `packing_lists`, pese a que el guardado de un PL que ya existe lo
   reescribe entero. No hay forma de saber cuándo se corrigió un PL.
8. **El módulo es una isla total:** cero lectores, cero conexiones, cero alertas. Las tres menciones
   que quedan en el código son **comentarios de otros módulos** que lo citan como ejemplo de patrón o
   como evidencia de que su tabla está vacía (`src/lib/tommy-bulto.ts`).

---

# Reclamos (`/reclamos`, key `reclamos`)

## Qué es

El expediente y el cobro de los **reclamos a proveedores**: mercancía defectuosa, faltante, sobrante
o manchada que llegó mal, y por la que hay que pedirle una **nota de crédito** a la marca. Se arma el
papel (factura, ítems, fotos), se le manda al proveedor por correo, y se lleva la cuenta de cuánto se
reclamó contra cuánto se recuperó.

⚠️ **No tiene nada que ver con el CXC del grupo.** El CXC es plata que los CLIENTES le deben a
Fashion Group; aquí es plata que un PROVEEDOR le debe a Fashion Group.

## Quién entra

- **admin** y **secretaria**, y nadie más. La ficha del módulo declara `roles: ["admin","secretaria"]`
  y el guard SSR de la página redirige a `/` (no muestra 403) a cualquier otro rol.
- 🔑 **No hay ninguna diferencia de permisos entre admin y secretaria en el servidor.** Las 19 rutas
  exigen lo mismo, vía `requireRole(req, ["admin","secretaria"])` o `requireAdmin`
  (`src/lib/api-auth.ts`, que **pese al nombre** define `ADMIN_ROLES = ['admin','secretaria']`).
- **La única diferencia es la UI**: el botón de eliminar (reclamo, fila, selección múltiple) solo se
  pinta si `role === "admin"` (`ReclamoDetail.tsx`, `EmpresaList.tsx`), pero el `DELETE` del servidor
  también deja pasar a secretaria. Medido: de los 13 reclamos borrados, **9 los hizo admin y 4
  secretaria** — o sea que en la práctica la secretaria SÍ ha borrado.
- 🔴 **Rol fantasma:** `GET /api/reclamos` acepta además el rol **`"upload"`**, que **no existe en
  `SYSTEM_ROLES`**. Es código inalcanzable.
- **Búsqueda global**: la ruta acepta admin, secretaria, vendedor, bodega y contabilidad, pero solo
  arma resultados de reclamos para los roles del módulo; a vendedor le devuelve `reclamos: []`
  explícitamente.

**Quién lo usa de verdad** (medido en `activity_logs`, 27-mar a 26-ago-2026): casi todo es de **una
sola persona, «andrea» (secretaria)** — 30 altas, 28 ediciones, 5 comprobantes, 5 «marcar Pagado»,
4 borrados, 2 ediciones de ítems. **admin** aparece con 9 altas, 9 borrados y 1 edición (perfil de
pruebas y limpieza, no de operación diaria).

## Las pantallas

Es una **SPA de un solo route**: todos los niveles viven bajo `/reclamos` y el estado se reconstruye
desde la URL (`ReclamosClient.tsx`).

### 1 · `/reclamos` — el selector de empresa (`EmpresaSelector.tsx`)

- Encabezado con **«Nuevo Reclamo»**.
- Tres tarjetas KPI: **Total Pendiente · Abiertos · Alertas +45 días**.
- Buscador global de texto libre (N° de factura, N° de reclamo, código de ítem o empresa).
- Grilla de **6 tarjetas de empresa**: Vistana International · Fashion Wear · Fashion Shoes ·
  Active Shoes · Active Wear · **Joystep** (`EMPRESAS_MAP`, ahora en `src/lib/reclamos/empresas.ts`
  y re-exportado desde `components/constants.ts` — lo lee también el servidor). Cada una
  con: el contacto, badge **«Alerta»** si algo pasó los 45 días, reclamos abiertos, monto pendiente,
  botones **↓ Excel** y **↓ PDF**, y un **«Historial»** desplegable con los últimos 5.

### 2 · `/reclamos?empresa=X` — la lista de una empresa (`EmpresaList.tsx`)

- Pills de estado con contador: **Todos / Creado / En proceso / Pagado**. Buscador de texto.
- Modo selección múltiple: **Enviar al proveedor** · **Descargar Excel** · **Descargar PDF** ·
  **Eliminar seleccionados** (solo admin en la UI).
- Tabla (≥ lg) o tarjetas (< lg): **N° Reclamo** (con badge de fotos) · **Factura** · **Fecha** ·
  **Antigüedad en días** (rojo > 60, ámbar > 30, solo mientras siga pendiente) · **Estado** ·
  **Total**, más los íconos por fila: enviar por correo, Excel, PDF, Editar, Eliminar.
- **Vacío inteligente:** si la empresa tiene reclamos pero todos están Pagados, dice
  *«Todo al día — N reclamos resueltos»* en vez de una lista vacía genérica.

### 3 · `/reclamos?view=form` — Nuevo Reclamo (`ReclamoForm.tsx`)

Formulario **progresivo**: se revela paso a paso con un indicador de puntos, y hay un
**«Mostrar todos los campos»** para verlo entero.

| Paso | Campos | Obligatorio |
|---|---|---|
| 1 | **Factura (PDF) — autocompletar** | No. Sube el PDF y la IA rellena la cabecera |
| 2 | **Empresa** \* | **Sí** — una de las 6; muestra proveedor y marca derivados |
| 3 | **N° Factura** \* · **Fecha** \* · **N° Pedido** \* | Sí — ⚠️ **el N° Pedido NO aparece para Active Shoes** |
| 4 | **Ítems**: Código \* · Descripción \* · Talla \* · Género \* · Cant. \* · Precio U. \* · Motivo \* · Subtotal (calculado) | Sí, **al menos un ítem**. Género = Hombre/Mujer/Niños/Accesorios en pantalla, se **guarda en inglés** |
| — | Al pie: Subtotal / Importación / ITBMS (si aplica) / **Total** | Calculado |
| 5 | **Notas** | No |
| 6 | **Evidencia fotográfica** — hasta 5 fotos | No. Se eligen antes de guardar y se suben al crear |

Botón **«Guardar Reclamo»** — valida todo con `validateReclamoFull` y recién entonces llama al POST.
Al terminar ofrece **«Ver reclamo →»** o **«Crear otro reclamo»**.

**La tarea más frecuente, contada** (un reclamo típico sin PDF): Nuevo Reclamo (1) → elegir empresa
(1) → N° factura, fecha, N° pedido (3) → por cada ítem: código, descripción, talla, género, cantidad,
precio, motivo (7) → Guardar (1) = **13 toques para un reclamo de un solo ítem**.

### 4 · `/reclamos?view=detail&id=X` — el detalle (`ReclamoDetail.tsx`, 836 líneas)

La pantalla más grande del módulo.
- **Cabecera:** N° de reclamo, badge de fotos, empresa · marca, factura, pedido (oculto en Active
  Shoes), fecha, proveedor, antigüedad; **«Ver factura»** si hay PDF adjunto.
- **Barra de acciones:** Editar · Descargar Excel · Descargar PDF · Eliminar (solo admin en la UI).
- **Acciones de estado**, según en cuál esté.
- **Tarjetas de totales:** Subtotal / Importación / ITBMS (si aplica) / Total.
- **Bloque «Recuperación»** (solo si está Pagado o ya tiene notas de crédito): **Reclamado vs.
  Recuperado vs. Pendiente/A favor**, el **% recuperado** con barra, la lista de NCs con **«Quitar»**,
  y **«+ Agregar nota de crédito»**.
- **Tabla de ítems**, editable en el sitio en modo edición.
- **Evidencia fotográfica:** miniaturas, subir y borrar (hasta 5).
- **Seguimiento:** caja para agregar una nota + el historial cronológico (fecha, hora, autor).
- **Sugerencia inteligente** (`SuggestionCard`) si el reclamo lleva más de 45 días abierto:
  *«Pásalo a En proceso»* o *«Márcalo como Pagado»*.

### 5 · `/reclamos/galeria/[id]` — la galería pública (sin entrada de menú)

Página **pública**, exenta de sesión: la protege un **token HMAC** en `?t=`
(`src/lib/reclamos/gallery-token.ts`). Muestra solo el título
*«Fotos · \<N° reclamo\> · \<empresa\>»* y la grilla de miniaturas de ESE reclamo, con lightbox y
manejo de HEIC (abre en pestaña nueva en vez de intentar renderizarlo). **Nunca expone montos, ítems
ni datos financieros.** Es el link «Ver fotos» que el proveedor recibe dentro del Excel. Sin fotos
dice *«Este reclamo no tiene fotos.»*

### La máquina de estados

Definida en `VALID_TRANSITIONS` (`src/app/api/reclamos/[id]/route.ts`):

```
Creado      → En proceso
En proceso  → Creado        (rollback)
Pagado      → En proceso    (rollback)
```

- `Creado → En proceso`: por `POST /api/reclamos/[id]/en-proceso`. El comprobante es **opcional** en
  este paso.
- `→ Pagado`: **NUNCA** por el PATCH genérico. Solo por
  `POST /api/reclamos/[id]/settlements` con `markPaid: true`, que **exige comprobante ya adjunto** y
  **congela `monto_reclamado_snapshot`**.
- **No existe `Pagado → Creado`**: el rollback desde Pagado solo llega a «En proceso».

🔴 **Medido: de 34 reclamos vivos, 29 están en «Creado» y 5 en «Pagado» — CERO en «En proceso»**, y
en 5 meses de `activity_logs` la acción `reclamo_en_proceso` **nunca ocurrió**. El estado intermedio
existe en el código y nadie lo usa: todo salta directo de Creado a Pagado.

## Los datos

7 tablas propias + 1 compartida. Medido el 4-sep-2026.

### `reclamos` — Grano: 1 fila por reclamo. Soft delete: `deleted boolean`.
**47 totales, 34 vivas** (13 borradas). `created_at` del 1-abr al 26-ago-2026.

| Columna | Llenas / 34 vivas | Nota |
|---|---|---|
| `nro_reclamo` · `empresa` · `proveedor` · `marca` · `nro_factura` · `nro_orden_compra` · `fecha_reclamo` · `estado` · `notas` · `updated_at` | 34/34 | (`notas` está a `''` en 32 — solo 2 tienen texto real) |
| `monto_reclamado_snapshot` | 5/34 | Solo los Pagados. Se congela al marcar Pagado |
| `factura_pdf_path` | **4/34 (12%)** | La mayoría **no** usa el autocompletado por IA |
| `comprobante_url` / `comprobante_path` | 5/34 | Solo los Pagados |
| `comprobante_nota` | 🔴 **0/34** | Campo opcional que **se ofrece en pantalla** (`ComprobanteModal`, `SettlementModal`) y **nadie ha escrito jamás** |
| `proveedor_codigo` | **34/34** tras la migración `20260922120000` (pendiente de aplicar) | 🔴 **La identidad del proveedor.** El par (`empresa`, `proveedor_codigo`) es lo que cruza con `switch_proveedor_estadocuenta`. NULL = el reclamo no se vincula a ningún proveedor |

**`estado`** (vivas): Creado 29 · Pagado 5.
**`empresa`** (vivas): Fashion Wear 21 · Vistana International 7 · Fashion Shoes 5 · Active Shoes 1 ·
**Active Wear 0** (su único reclamo histórico está borrado).
**`nro_orden_compra` vacío** pese a ser «obligatorio» para las no-Active-Shoes: Fashion Wear 15/21 ·
Vistana 5/7 · Fashion Shoes 5/5 — o sea **25 de 33** reclamos vivos no-Active-Shoes **no tienen** el
pedido que la validación de hoy exige. Son datos anteriores a la regla.

### `reclamo_items` — Grano: 1 fila por ítem. **143 filas.**
Columna `deleted boolean` presente pero 🔴 **nunca en `true`**: el flujo de edición
(`PUT /api/reclamos/[id]/items`) hace **`DELETE` real + `INSERT`**, no soft delete. `pdf-bulk.ts`
filtra `!i.deleted` defensivamente, pero esa rama nunca se activa.

| Columna | Llenas / 143 | Nota |
|---|---|---|
| `reclamo_id` · `referencia` · `descripcion` · `talla` · `cantidad` · `precio_unitario` · `motivo` · `nro_factura` · `nro_orden_compra` | 143/143 no-NULL (el default es `''`) | — |
| `genero` | **29/143 (20%)** | 114 son NULL — el campo es de la migración `20260623120000` y las filas anteriores se quedaron sin él. El CHECK admite NULL a propósito |

**Vacíos reales** (contenido `''`, no NULL): `descripcion` 29 · `talla` 3 · `referencia` 2 ·
🔴 **`nro_factura` 140/143 (98%)** y **`nro_orden_compra` 140/143 (98%)** — la factura por ítem (para
reclamos multi-factura) casi no se usa: solo **3 ítems** en toda la historia llevan una propia.
**`genero`**: Men 16 · Women 10 · Kids 3 · **Accessories 0**.

🔴 **`motivo` tiene 14 valores distintos para lo que son pocos motivos reales:** `FALTANTE` (42)
contra `Faltante de Mercancía` (16, el default) · `sobrante` (26, en minúscula, que no coincide con
ningún default) · `Mercancía manchada` (7, el default) contra `MANCHADAS` (10), `MANCHADA` (4) y
`MANCHADAS AMARILLAS` (3) · más `Mercancía dañada`, `Producto manchado`, `Cantidad incorrecta`,
`destallado` (1 cada uno).

### `reclamo_fotos` — Grano: 1 foto. **18 filas. SIN soft delete** (hard delete real).
🔴 `nombre_archivo`: **0/18** — la columna existe y `POST /api/reclamos/[id]/fotos` **nunca la llena**.

### `reclamo_seguimiento` — Grano: 1 nota o evento. Append-only, sin `deleted`. **47 filas.**
`autor`: **«Sistema» 42** (generadas por `/en-proceso`, `/comprobante`, `send-zip`) y **«andrea» 5**
(notas a mano).
🔴 **Rango: 23-jun a 17-jul-2026 — ni una entrada nueva desde mediados de julio**, aunque hay
reclamos creados hasta el 26-ago. Los reclamos más recientes no han recibido ni una nota ni un cambio
de estado desde que se crearon.

### `reclamo_settlements` — Grano: 1 recuperación / NC. Soft delete: `deleted boolean NOT NULL DEFAULT false`.
**5 filas, todas vivas, todas del 8-jul-2026.**
🔴 `nota_credito`: **0/5** — el campo «N° nota de crédito (opcional)» nunca se llenó.
🔴 `nota_credito_ccte_id`: **0/5, y ningún código de la app lo escribe** — es una columna «V2»
(comentario de la migración `20260610120000_reclamo_settlements.sql`: *«id interno Switch si se
linkea»*) reservada para un enlace con Switch que **nunca se construyó**.

### `reclamo_contactos` — Grano: 1 fila por empresa (la libreta del proveedor). **5 filas**, todas
`activo=true`, todas creadas el mismo instante (25-mar-2026). ⚠️ Desde el 4-sep-2026 `EMPRESAS_MAP`
tiene **6** empresas: **Joystep no tiene contacto todavía** y su tarjeta se dibuja sin él.
Sin soft delete: se apaga con `activo`.
🔴 `whatsapp`: se captura en la columna pero **nunca se lee ni se muestra** en ninguna pantalla — el
propio comentario del código lo dice (`contactos/route.ts`).

### `reclamo_custom_motivos` — 🔴 **0 filas.**
`saveCustomMotivo` (`constants.ts`) existe y se llama desde el formulario y el detalle, pero en
producción **nadie ha guardado nunca un motivo por esa vía** — pese a que `reclamo_items.motivo` sí
trae 8 variantes que no están en `DEFAULT_MOTIVOS`.

### `contactos_email` — libreta GLOBAL de correos (no exclusiva de Reclamos, pero solo la usa
Reclamos). 🔴 **0 filas.** La «Libreta de contactos» de `EnviarProveedorModal` nunca se usó.

## De dónde vienen los datos

**Reclamos no toca Switch.** Ningún endpoint, ningún reporte, ningún cron.

| Fuente | Cómo entra | Si falla |
|---|---|---|
| **Fotos de evidencia** | Se **comprimen en el navegador** (`compressImage`: 1600 px, JPEG q0.8) y suben a `POST /api/reclamos/[id]/fotos` → bucket **público `reclamo-fotos`**, path `<reclamoId>/<uuid>.<ext>`, con `getPublicUrl` directo (nunca firmada) | El estado por foto queda en `"error"` **con el mensaje real** (nunca un spinner colgado) y se puede reintentar |
| **Comprobante de pago** (foto o PDF) | Mismo bucket, subcarpeta `/comprobante` (`comprobante-storage.ts`). PDF sin compresión, máx. 4 MB | El flujo de marcar Pagado se detiene: exige comprobante |
| **PDF de la factura** | Bucket **privado `reclamo-facturas`** (`factura-storage.ts`), con signed-upload-URL (`POST /api/reclamos/factura-pdf/upload-url`). **Nunca** `getPublicUrl`: siempre URL firmada (TTL 1 h en el detalle, **1 año** en los links del Excel) | El reclamo se guarda igual, sin PDF |
| **La IA que lee la factura** (`POST /api/reclamos/ia/leer-factura`) | **Claude Sonnet 4.6** (`claude-sonnet-4-6`, `@anthropic-ai/sdk` directo, `ANTHROPIC_API_KEY`). Recibe el PDF como `document` base64 y devuelve JSON estricto `{proveedor, marca, nro_factura, fecha_factura, nro_orden_compra}`. **Nunca inventa**: campo ilegible → `null`. **Solo prellena la cabecera, jamás los ítems** | **Nunca bloquea** — la persona llena a mano |
| **El correo al proveedor** (`POST /api/reclamos/proveedor/[empresa]/send-zip`) | **Resend**, desde **`info@fashiongr.com`** | Responde 500 *«Error al enviar el correo.»* y **no** escribe la nota de seguimiento |

⚠️ **Si Storage falla al BORRAR una foto**, el registro de la base se borra igual y el fallo solo
queda en el log (`console.warn`) — **el usuario nunca se entera** de que el archivo pudo quedar
huérfano en el bucket.

## Las reglas que ya están fijadas

1. 🔴 **Solo lo PENDIENTE sale hacia el proveedor.** Los botones ↓Excel / ↓PDF usan `soloPendientes()`
   (`src/lib/reclamos/pendientes.ts`, `esPendiente = estado !== "Pagado"`) para **no cobrarle dos
   veces al proveedor** un reclamo ya pagado. Medido antes del fix: **5 de 33 reclamos vivos ya
   Pagados ($5.306,62) se colaban** en los archivos. Candado de conducta —genera el PDF real y lo lee
   con `pdftotext`, arma el Excel real—: `src/__tests__/reclamos-itbms-rotulo-y-pendientes.test.tsx`.
2. 🔴 **El rótulo del ITBMS se deriva de la misma constante que hace la cuenta, nunca se escribe a
   mano.** `pctLabel()` en `src/lib/reclamos/tax.ts`. El candado prohíbe escribirlo aparte en **5
   lugares** (ReclamoDetail, ReclamoForm, el PDF, el Excel por reclamo, el CSV global).
3. **Active Shoes es la excepción fiscal:** importación **15% SIN ITBMS**, contra **10% + ITBMS 7%**
   en las demás. Y **no usa N° de pedido**. `esActiveShoes()` / `ocultaPedido()`
   (`src/lib/reclamos/tax.ts`). Candado: `src/__tests__/reclamos-tax.test.ts`.
4. **El ITBMS se cobra sobre (subtotal + importación), no sobre el subtotal pelado** — 1,10 × 0,07 =
   0,077, la misma plata que «7,7% del subtotal» pero con el rótulo correcto («7%»). Migrado el
   1-sep-2026; medido contra los 47 reclamos vivos de entonces: **cero centavos de diferencia** salvo
   1.407 de 20 millones de subtotales simulados que redondean 1 centavo hacia arriba en un empate
   exacto.
5. **La obligatoriedad es única y compartida cliente↔servidor:** `src/lib/reclamos/validate.ts`.
   Cabecera (`empresa`, `nro_factura`, `fecha_reclamo`, y `nro_orden_compra` salvo Active Shoes) e
   ítems (`referencia`, `descripcion`, `talla`, `genero`, `cantidad > 0`, `precio_unitario >= 0`,
   `motivo`, ≥ 1 ítem). La usan el POST, el PATCH de cabecera y el PUT de ítems.
6. 🔴 **El género se guarda en INGLÉS, se muestra en español, y esa distinción no se puede «terminar
   de traducir».** `reclamo_items.genero` tiene un **CHECK en la base** que solo admite NULL o
   `Men|Women|Kids|Accessories` (migración `20260623120000_reclamo_items_genero.sql`). Candado que
   **lee el SQL de la migración SIN comentarios** y lo compara byte a byte contra `GENEROS`:
   `src/__tests__/lib/reclamos-genero-valor-vs-etiqueta.test.ts`.
7. **`subtotal` no existe como columna** en `reclamo_items`: se deriva siempre
   `cantidad × precio_unitario` al vuelo (UI, PDF, Excel, CSV). Mandarlo al insert da `PGRST204`.
   Fuente única del payload: `buildReclamoItemRows` (`src/lib/reclamos/item-rows.ts`), compartida por
   crear y editar. Candado: `src/__tests__/reclamo-item-rows.test.ts`.
8. 🔴 **Marcar Pagado exige comprobante ya adjunto** (foto o PDF). Lo valida
   `POST /api/reclamos/[id]/settlements` **antes** de escribir el cambio de estado; y si el cambio
   falla, **compensa** borrando los settlements recién insertados (reintento seguro).
9. **`monto_reclamado_snapshot` se congela al marcar Pagado**, para que el % recuperado no se mueva
   si después se edita un ítem.
10. **La numeración es `<INICIALES>-<AÑO>-<correlativo>`** (ej. `VI-2026-0001`), con correlativo
    independiente **por empresa y año**, y reintento ante colisión de unicidad (código `23505`).
    Los reclamos viejos `REC-YYYY-XXXX` no se tocan.
11. **`reclamo_contactos.nombre_contacto` es obligatorio y se valida explícitamente** (antes daba un
    500 genérico). La columna `nombre` no existe y se retiró del allow-list. Candado:
    `src/__tests__/lib/campos-obligatorios.test.ts`.
12. 🔴 **El proveedor de un reclamo se identifica por el par (empresa, CÓDIGO), nunca por el nombre**
    (4-sep-2026). El código **no es único entre empresas**: `122` es «American Fashion Wear, SA» en
    Fashion Wear y «LATIN FITNESS GROUP» en Active Shoes; `112` es Tommy en Fashion Shoes y Joybees
    en Joystep. El par viaja siempre junto. El nombre se conserva **solo para imprimirlo** (PDF,
    Excel, correo). Fuente única: `EMPRESAS_MAP` en `src/lib/reclamos/empresas.ts`, con las **6**
    empresas y su código; el servidor lo escribe al crear y lo rehace al cambiar de empresa.
    🩸 Medido antes del fix: **26 de los 34 reclamos vivos ya no cruzaban** por nombre, y las fichas
    de Fashion Wear (21) y Fashion Shoes (5) mostraban CERO reclamos sin decir por qué. Candados:
    `reclamos-proveedor-por-codigo.test.ts` (incluye barrido estático que prohíbe
    `LIKE/ILIKE/similarity/levenshtein/soundex/regexp` en el SQL de la migración) ·
    `reclamos-estado-pagado-unico.test.ts` · `reclamos-fetch-empresa-una-sola.test.ts`.
    **28 mutaciones, 28 cazadas** (`scripts/_mutar-candados-reclamos-proveedor-codigo.sh`).
13. **Una sola `fetchReclamosForEmpresa`** (`src/lib/reclamos/fetch-empresa.ts`), y **filtra los
    borrados**. 🩸 Había dos con el mismo nombre: la del PDF filtraba `deleted = false` y la del
    Excel no — un reclamo borrado no salía en el PDF pero **sí en el Excel que se le manda al
    proveedor**.

## Con qué conecta

### Qué LEE de otros módulos
**Prácticamente nada — es un módulo casi autónomo.** No lee `switch_*`, no lee `clientes_master`, no
lee el directorio. Su única dependencia externa es Claude para leer la factura.

### Quién LEE lo suyo

| Quién | Qué lee | Archivo |
|---|---|---|
| **Proveedores** (`/proveedores/[key]`) | Los **«reclamos vinculados»** de un proveedor: lee `reclamos` (vivas) y cruza por el **par (empresa, código)** contra las filas de `switch_proveedor_estadocuenta` de esa ficha (`paresDelProveedor` / `reclamosDelProveedor`, `src/lib/reclamos/proveedor-vinculo.ts`) | `src/app/api/proveedores/[key]/route.ts` |
| **Búsqueda global** | Por `nro_reclamo` / `nro_factura`, solo para admin y secretaria | `src/app/api/search/route.ts` |
| **Badge de notificaciones** 🔔 | Reclamos «viejos»: `estado NOT IN ('Aplicado','Rechazado','Aplicada','Pagado')` y `fecha_reclamo` > 45 días | `src/app/api/notification-badges/route.ts` |
| **Home / Vista General** | `reclamosPendientes` / `reclamosViejos`, vía la RPC `home_dashboard_summary` | migración `20260812190000_home_lastupload_solo_grupo.sql` |
| **Sugerencia inline «escalar reclamo +45d»** | Vive **dentro** de `ReclamoDetail.tsx` (`useSmartSuggestions`), no en un feed central | — |
| **Atajo de teclado `G+R`** | Navega a `/reclamos` | `src/lib/hooks/useKeyboardShortcuts.ts` |
| **Cron `backup`** | Copia las tablas | — |

🔴 **Ningún cron toca Reclamos** (`grep "reclamo" vercel.json` → vacío) y **ninguna alerta de Telegram
lo menciona** (`src/lib/alertas/*.ts` → vacío). No hay escalamiento automático más allá de la
sugerencia visual dentro del detalle. El único correo saliente lo dispara una persona a mano.

### Qué se rompería si cambiara la forma de sus datos
- ✅ **Cambiar un nombre de `EMPRESAS_MAP`** (empresa / proveedor / marca) **ya NO rompe la ficha de
  Proveedores** (4-sep-2026): la unión es por el par **(empresa, código)** y el nombre solo se
  imprime. Sí sigue mandando en la numeración por iniciales (`src/lib/empresa-mapping.ts`).
- 🔴 **Cambiar un `proveedor_codigo` o un `empresa_key` de `EMPRESAS_MAP`** sí rompe la ficha: es la
  identidad. El candado exige que cada par exista de verdad en Switch.
- 🔴 **Un reclamo sin `proveedor_codigo` no aparece en ninguna ficha de proveedor.** Es a propósito:
  antes que atarlo por el nombre a quien quizás no es, no aparece.
- **Cambiar el CHECK de `genero`** sin tocar `GENEROS` lo caza el candado.
- ✅ **Cambiar el literal `"Pagado"`** ya no rompe cuatro cosas en silencio: los cuatro lugares
  (`esPendiente()`, el badge de notificaciones, el flip que exige comprobante y la máquina de
  estados del PATCH — más Vista General) usan `ESTADO_PAGADO`, y un candado compara byte a byte
  contra el `'Pagado'` del RPC del home, que es SQL y no puede importar la constante.

## Por qué está así

| Fecha | Decisión | Origen |
|---|---|---|
| jun-2026 (#161) | Los estados **Borrador** y **Enviado** se fusionan en **«Creado»** | `docs/historico/superado.md` § Reclamos |
| jul-2026 (`c1dcd854`) | Se agrega el estado **«En proceso»** | idem |
| 23-jun-2026 | El **género** entra como campo obligatorio, con CHECK en la base | migración `20260623120000` |
| 1-sep-2026 | El ITBMS se cobra sobre **(subtotal + importación)** y el rótulo dice **7%** | El rótulo anterior («7,7%») era la misma plata mal nombrada |
| — | **Solo lo pendiente** sale hacia el proveedor | Para no cobrarle dos veces por lo ya pagado |
| — | Active Shoes: importación 15% sin ITBMS y sin N° de pedido | Régimen fiscal distinto (zona libre) |
| — | La galería del proveedor va por **token HMAC**, sin login, y **sin montos** | El proveedor tiene que ver las fotos sin entrar al sistema, y sin ver plata |
| — | `revalidateOnFocus: true` **se queda** en Reclamos | *«lo editan varias personas y no hay realtime: volver a la pestaña es cómo cada uno se entera de lo de los demás»* (`docs/historico/superado.md`) |

**No hay ninguna cita textual de Daniel registrada sobre Reclamos** en los postmortems ni en
`docs/estado-actual.md`. Es el módulo con menos huella de decisión escrita de los cinco.

## Lo que se intentó y se retiró

| Qué | Por qué se quitó | Cuándo |
|---|---|---|
| **Estados «Borrador» y «Enviado»** | Se fusionaron en «Creado» — dos nombres para lo mismo | jun-2026 (#161) |
| 🔴 **El ZIP con los binarios adentro** | Ahora sale un **Excel pelado con links WEB** — el propio código lo dice: *«Excel pelado con links WEB… Ya no se arma ZIP con binarios»*. ⚠️ **Las rutas, el nombre y las variables se quedaron llamándose `export-zip` y `send-zip`** | fecha no registrada |
| **El rótulo «7,7%» del ITBMS** | Era la misma plata con el nombre equivocado. Ahora dice 7% y se cobra sobre subtotal + importación | 1-sep-2026 |
| **La confirmación del `revalidateOnFocus` apagado** | Se evaluó apagarlo en la auditoría de rendimiento y **se decidió dejarlo encendido a propósito** | ago-2026 |

🩸 **Y una lección que salió de Reclamos:** en esa auditoría, el candado que exigía
`revalidateOnFocus: true` **pasaba en verde con la mutación puesta**, porque leía el archivo entero
**comentarios incluidos** — y el comentario que explica por qué se queja contenía el mismo texto que
el candado buscaba: *se daba por satisfecho con su propia explicación*. Los barridos estáticos ahora
**borran los comentarios primero**.

## Cuánto se usa

**Reclamos creados por mes** (vivos):

| Mes | Reclamos |
|---|---|
| abr-2026 | 6 |
| may-2026 | 9 |
| jun-2026 | **12** |
| jul-2026 | 4 |
| ago-2026 | 3 |
| sep-2026 | **0** |

**La tendencia es a la baja**: de 12 en junio a 3 en agosto y ninguno en septiembre.

**Quién:** casi todo es **andrea (secretaria)** — 30 altas, 28 ediciones, 5 comprobantes, 5 «marcar
Pagado», 4 borrados. **admin** aparece con 9 altas, 9 borrados y 1 edición.

**Última actividad:** **26-ago-2026 16:41 UTC** (una edición de ítems). Nueve días sin tocarse al
4-sep.

⚠️ **Dos señales de abandono parcial** que no se ven en el conteo de altas:
- **`reclamo_seguimiento` no recibe una entrada desde el 17-jul-2026**, aunque hay reclamos creados
  hasta el 26-ago: los más recientes **nunca han recibido una nota ni un cambio de estado**.
- **Los 5 settlements son todos del mismo día (8-jul-2026).** Nadie ha registrado una recuperación en
  casi dos meses.

**Lo que NO se puede medir:** cuántas veces se abre la pantalla, cuántos Excel/PDF se bajan, cuántos
correos se mandan al proveedor (el envío escribe una nota de seguimiento, así que sí queda traza —
pero desde el 17-jul no hay ninguna, o sea que **no se ha mandado ningún correo al proveedor en mes y
medio**).

## Qué papeles y Excel produce

🔴 **Este módulo es el que más papeles distintos produce, y varios van a un PROVEEDOR de afuera.**
Son **seis** salidas, por **cuatro rutas distintas con reglas de borrado distintas** (ver «Lo que
sobra»).

### 1 · El Excel del proveedor — el papel que se cobra

- **De dónde sale:** ↓Excel de la tarjeta de empresa, ↓Excel de la selección múltiple, o
  `GET /api/reclamos/proveedor/[empresa]/export-excel` · `.../export-zip` (que **ya no arma ningún
  ZIP**: devuelve el mismo `.xlsx`).
- **Quién lo recibe:** 🔴 **el PROVEEDOR de la marca** (Tommy, Calvin, Reebok…).
- **Nombre del archivo:** `Reclamos_<Empresa>_<YYYY-MM-DD>.xlsx`.
- **Columnas:** **N° Reclamo · Factura · Fecha · Estado · Subtotal · Importación · ITBMS · Total ·
  # Fotos · Factura PDF · Fotos** (`src/lib/reclamos/excel-bulk.ts`).
- 🔴 **Las columnas «Factura PDF» y «Fotos» son LINKS**: al PDF privado (URL firmada con TTL de **1
  año**) y a la **galería pública** con su token HMAC. El proveedor entra a ver las fotos sin login y
  **sin ver ni un monto**.
- 🔴 **Solo lleva lo PENDIENTE** (`soloPendientes()`), para no cobrar dos veces.

### 2 · El PDF del proveedor — «Resumen de reclamos»

- **De dónde sale:** ↓PDF de la tarjeta de empresa o de la selección múltiple, o
  `GET /api/reclamos/proveedor/[empresa]/export-pdf` (`src/lib/reclamos/pdf-bulk.ts`).
- **Quién lo recibe:** **el proveedor**.
- **Nombre del archivo:** `Reclamos_<Empresa>_<YYYY-MM-DD>.pdf`.
- **Qué lleva:**
  - Portada: logo **FASHION GROUP**, `Resumen de reclamos — <Empresa>`, `Generado el <fecha>`,
    `N reclamos` y **`Total a acreditar: $X`**.
  - Por reclamo: una banda con el **N° de reclamo** y `Factura: XXX` a la derecha; un bloque de meta
    con **Empresa · Proveedor · Marca** y **Fecha · Orden de Compra · Estado** (la Orden de Compra
    **no se dibuja para Active Shoes**); la tabla de ítems; y los totales.
- 🔴 **Solo lleva lo PENDIENTE**, y a diferencia de su gemelo de Excel **sí filtra `deleted = false`**
  y **sí trae los settlements**.

### 3 · El correo al proveedor

- **De dónde sale:** botón **«Enviar al proveedor»** (una fila o una selección) →
  `POST /api/reclamos/proveedor/[empresa]/send-zip`.
- **Quién lo recibe:** el contacto de `reclamo_contactos` de esa empresa.
- **Sale desde:** **`info@fashiongr.com`** vía **Resend**.
- **Qué lleva:** el **Excel adjunto** (`Reclamos_<Empresa>_<fecha>.xlsx`, el mismo del punto 1) y una
  **tabla-resumen embebida en el HTML** del cuerpo.
- Si sale bien, escribe una nota en `reclamo_seguimiento` con autor «Sistema». Si Resend falla,
  responde 500 y **no escribe nada**.

### 4 · El Excel de un solo reclamo

- **De dónde sale:** «Descargar Excel» del detalle o del ícono de la fila →
  `GET /api/reclamos/[id]/excel`.
- **Quién lo recibe:** la oficina, o el proveedor si se manda a mano.
- **Nombre:** `Reclamo-<nro_reclamo>.xlsx` (ej. `Reclamo-VI-2026-0001.xlsx`).
- ⚠️ **No filtra `deleted`**: puede exportar un reclamo borrado si se conoce su id.

### 5 · El Excel de una selección

- `POST /api/reclamos/export-excel`. Nombre: `Reclamos-<YYYY-MM-DD>.xlsx`.
- ⚠️ **Tampoco filtra `deleted`.**

### 6 · El CSV global

- `GET /api/reclamos/export`. Nombre: `reclamos_<YYYY-MM-DD>.csv`.
- ⚠️ **Tampoco filtra `deleted`.**

### 7 · La galería pública (no es un archivo, pero es lo que el proveedor abre)

`/reclamos/galeria/[id]?t=<token HMAC>` — solo el título y las fotos. **Cero montos, cero ítems.**

## Cómo probarlo a mano

**A · Crear un reclamo**
1. Entra a **Reclamos** y toca **«Nuevo Reclamo»**.
2. (Opcional) Sube el PDF de la factura y **confirma que la cabecera se llena sola** (proveedor,
   marca, N° de factura, fecha, N° de pedido). Si algún campo queda vacío, la IA no lo pudo leer —
   llénalo a mano, es lo esperado.
3. Elige la empresa. **Confirma que aparecen el proveedor y la marca** debajo.
4. Escribe N° de factura, fecha y N° de pedido. **Si eliges Active Shoes, el N° de pedido no debe
   aparecer.**
5. Llena el primer ítem entero: código, descripción, talla, género, cantidad, precio y motivo.
6. **Confirma los totales al pie**: el ITBMS debe decir **7%** (o no aparecer, si es Active Shoes) y
   la importación debe ser el 10% (o el 15% en Active Shoes).
7. Adjunta una o dos fotos.
8. **«Guardar Reclamo»**.
9. **Dónde mirar que quedó:** vuelve al selector de empresa — la tarjeta de esa empresa debe haber
   subido su contador de abiertos y su monto pendiente.

**B · Mandarlo al proveedor**
1. Entra a la lista de la empresa y toca el ícono del correo en la fila.
2. **Confirma que el correo lleva el Excel adjunto** y que sale desde `info@fashiongr.com`.
3. Abre el Excel: las columnas **Factura PDF** y **Fotos** deben ser **enlaces que se pueden tocar**.
4. Toca el enlace de **Fotos**: debe abrir la galería pública, **sin pedir login**, con el título del
   reclamo y las fotos, **y sin ningún monto a la vista**.
5. **Dónde mirar que quedó:** abre el reclamo → bloque **Seguimiento**: debe haber una nota nueva con
   autor **«Sistema»**.

**C · Verificar que un reclamo Pagado NO sale**
1. Marca un reclamo como Pagado (adjunta comprobante y registra la nota de crédito).
2. Baja el **Excel de esa empresa**. **Confirma que ese reclamo NO está.** Ese es el candado que
   evita cobrarle dos veces al proveedor.

**D · Marcar Pagado**
1. En el detalle, intenta marcar Pagado **sin comprobante**: debe rechazarlo.
2. Adjunta el comprobante y vuelve a intentarlo.
3. Agrega la nota de crédito con su monto.
4. **Confirma el bloque «Recuperación»**: Reclamado vs. Recuperado vs. Pendiente, con su barra de %.
5. **Dónde mirar que quedó:** el estado dice Pagado y `monto_reclamado_snapshot` queda congelado — si
   después editas un ítem, el % recuperado **no se mueve**.

## Qué lo rompe

**Reclamos NO toca Switch** — ni por API, ni por panel web, ni por CSV. Nada de lo que Switch cambie
lo afecta. Su frontera externa son **Anthropic (Claude Sonnet 4.6), Resend y Supabase Storage**.

| Falla | Qué pasa | Cómo se notaría |
|---|---|---|
| **`ANTHROPIC_API_KEY` falta o Claude no contesta** | `/ia/leer-factura` devuelve 500/502. **El flujo NO se bloquea** — se llena a mano | La pantalla dice «no se pudo leer con IA, llena a mano» |
| **Claude devuelve algo que no es JSON** | Mismo camino: 502, se llena a mano | idem |
| **Resend cae** | El correo al proveedor devuelve 500 *«Error al enviar el correo.»* y **no se escribe la nota de seguimiento** | La pantalla lo dice. 🔴 **No hay alerta ni reintento** |
| 🔴 **Storage falla al BORRAR una foto** | La fila de la base **se borra igual**; el archivo queda huérfano en el bucket. Solo un `console.warn` | **Nadie se entera nunca.** No hay alerta, no hay conteo, no hay limpieza |
| **El bucket `reclamo-facturas` cambia de nombre o de política** | Los links firmados del Excel dejan de abrir | El proveedor lo reporta. No hay chequeo |
| **`SESSION_SECRET` cambia** | Los tokens HMAC de las galerías ya enviadas **dejan de validar**: el proveedor ve «enlace inválido» | El proveedor lo reporta |
| **`EMPRESAS_MAP` cambia un nombre** | 🔴 La ficha de **Proveedores** deja de encontrar sus reclamos **en silencio** (unión por nombre normalizado, en JS, sin candado) | **Nadie se entera**: la ficha muestra 0 reclamos y parece correcto |
| **Alguien cambia el literal `"Pagado"`** | Se rompen a la vez `esPendiente()`, el badge, el RPC del home y la condición del comprobante | Reclamos pagados volviendo a salir en el Excel del proveedor — **lo peor posible**, porque es cobrar dos veces |
| **La migración del CHECK de `genero` se revierte** | Los ítems podrían guardar cualquier cosa en `genero` | Lo caza el candado del build, no producción |
| **`db-max-rows` (1000)** | Con 34 reclamos vivos y 143 ítems está a dos órdenes de magnitud. Las exportaciones por empresa no paginan | No se notaría hasta llegar a 1.000 reclamos |
| **`contactos_email` / `reclamo_contactos` vacíos** | No hay a quién mandarle el correo | La pantalla del envío queda sin destinatario |

🔴 **El punto ciego más caro:** el módulo **no tiene ni un cron ni una alerta**. Un reclamo abierto
hace seis meses solo se ve si alguien entra a la pantalla. El badge 🔔 y la sugerencia de +45 días
son lecturas en vivo, no avisos. Medido: **`reclamo_seguimiento` lleva desde el 17-jul sin una
entrada**, o sea que hace mes y medio que no se le manda nada a ningún proveedor — y **nada en el
sistema lo dice**.

## Lo que sobra o no cuadra

1. 🔴 **Cuatro caminos de export con reglas de borrado DISTINTAS.**
   `POST /api/reclamos/export-excel`, `GET /api/reclamos/export` (CSV) y
   `GET /api/reclamos/[id]/excel` **no filtran `deleted = false`** — pueden exportar un reclamo
   soft-borrado. Y peor: **hay dos implementaciones de la misma función con el mismo nombre**,
   `fetchReclamosForEmpresa`, en dos archivos: `src/lib/reclamos/excel-bulk.ts` **no** filtra
   `deleted` y **no** trae settlements; `src/lib/reclamos/pdf-bulk.ts` **sí** filtra
   `.eq("deleted", false)` y **sí** trae `reclamo_settlements`. Misma firma, comportamiento distinto.
2. 🔴 **«export-zip» y «send-zip» ya no arman ningún ZIP.** El propio código lo dice
   (`export-zip/route.ts`: *«Excel pelado con links WEB… Ya no se arma ZIP con binarios»*), pero la
   ruta, el nombre interno del archivo y las variables se quedaron con el nombre viejo.
3. 🔴 **El home y el badge NO cuentan lo mismo como «pendiente».** El badge
   (`notification-badges/route.ts`) excluye 4 estados terminales/legacy
   (`Aplicado, Rechazado, Aplicada, Pagado`), así que cuenta **Creado Y En proceso**. La migración del
   RPC del home (`20260812190000_home_lastupload_solo_grupo.sql`) filtra **solo `estado = 'Creado'`**.
   Un reclamo «En proceso» con más de 45 días **no aparecería** en `reclamosPendientes` /
   `reclamosViejos` de Vista General, aunque el módulo y el badge sí lo consideren abierto. Hoy no se
   manifiesta porque no hay ninguno En proceso — **el día que lo haya, Vista General lo va a
   subcontar.**
4. 🔴 **El estado «En proceso» está construido y nunca se usó**: 0 de 34 reclamos vivos, 0
   apariciones de `reclamo_en_proceso` en 5 meses. Todo salta directo de Creado a Pagado.
5. **`EnviarProveedorModal.tsx` lee campos que el servidor ya no manda.** Al terminar el envío mira
   `data?.mode === "link"` y `data?.fotosOmitidas`, pero `send-zip` solo devuelve
   `{ ok, sent, to }` — nunca `mode` ni `fotosOmitidas`. Es lógica muerta de cuando el envío sí armaba
   un ZIP con binarios y podía omitir fotos pesadas.
6. 🔴 **Cinco columnas que nadie llena:** `reclamo_fotos.nombre_archivo` (0/18) ·
   `reclamos.comprobante_nota` (0/34, y se ofrece en pantalla) · `reclamo_settlements.nota_credito`
   (0/5) · `reclamo_settlements.nota_credito_ccte_id` (0/5, **sin ningún escritor en el código** — es
   un campo «V2» reservado para un enlace con Switch que nunca se construyó) ·
   `reclamo_contactos.whatsapp` (se captura y el propio código dice que nunca se lee).
7. **Columna que nadie deja en `true`:** `reclamo_items.deleted`. Existe, tiene un lector defensivo en
   `pdf-bulk.ts`, y el único flujo de edición hace **`DELETE` + `INSERT` real**.
8. 🔴 **La función de «motivos personalizados» tiene la tabla vacía y los datos que la necesitarían.**
   `reclamo_custom_motivos` = **0 filas**, pero `reclamo_items.motivo` trae **8 valores que no están
   en `DEFAULT_MOTIVOS`** (`FALTANTE` 42 · `sobrante` 26 · las tres variantes de MANCHADA 17…). Esos
   valores entraron por otro camino: una versión anterior del formulario, o el `upsert` de
   `saveCustomMotivo` falló en silencio y el navegador se quedó con el respaldo de `localStorage`, que
   nunca sincronizó.
9. 🔴 **Marcar Pagado no valida que quede al menos una nota de crédito activa.**
   `DELETE .../settlements?sid=X` hace soft delete **sin mirar si es la última y sin tocar el
   `estado`** — un reclamo puede quedar **«Pagado» con 0% recuperado** después de borrar su única NC,
   sin ninguna advertencia.
10. **Rol `"upload"` fantasma** en `GET /api/reclamos` — no existe en `SYSTEM_ROLES`.
11. **La mayoría de los reclamos vivos no cumple la regla «obligatoria» de hoy:**
    `nro_orden_compra` vacío en **25 de 33** reclamos no-Active-Shoes, y `descripcion` vacía en
    **29 de 143** ítems. Son datos anteriores a que `validate.ts` exigiera esos campos, y **no hay
    migración de backfill ni marca que distinga «viejo, sin validar» de «nuevo, incompleto»**.
12. **`reclamoInitials` (`src/lib/empresa-mapping.ts`) sabe de empresas que la UI no puede crear** —
    Joystep, Confecciones Boston, Multifashion/American Classics. Código a la espera de que Reclamos
    se abra a esas empresas, o sobrante.
13. **`activity_logs` tiene DOS nombres para la misma acción:** 5 filas con `user_role = "system"` y
    `action = "reclamo_creado"` (con «d»), conviviendo con las 39 de `reclamo_create`. Probablemente
    de una siembra o migración antigua, y nadie lo notó.
14. **La condición `role === "admin" || role === "secretaria"` que envuelve las tarjetas KPI de
    `EmpresaSelector.tsx` es SIEMPRE verdadera**: la página ya excluyó a cualquier otro rol. Es una
    condición muerta.

---

# Marketing (`/marketing`, key `marketing`) — incluido Mobiliario

## Qué es

El módulo donde se registra el **gasto compartido con las marcas que Fashion Group representa**
(Tommy Hilfiger, Calvin Klein, Karl Lagerfeld, Reebok, Joybees): facturas de proveedores, pagos a
impulsadoras de tienda, y entregas de **mobiliario** (paneles, colgadores, barras, tablas) a las
tiendas. Cada marca es una cuenta aparte que se **cierra por período** y se le reporta a su encargado
con un Excel y un ZIP de respaldo.

Resuelve: *«¿cuánto le reporto a Tommy este trimestre y con qué papeles lo respaldo?»* — sin mezclar
el gasto de una marca con el de otra.

Postmortem: `docs/postmortems/marketing-mobiliario.md`.
Invariantes resumidos: `CLAUDE.md § Invariantes por módulo › Marketing › Mobiliario`.

## Quién entra

- **admin** y **secretaria** en el 100% de las ~40 rutas de negocio
  (`requireRole(req, ["admin","secretaria"])`). Verificado ruta por ruta.
- Cada página monta con `moduleKey: "marketing"` y `allowedRoles: ["admin","secretaria"]`
  (`page.tsx`, `[marca]/page.tsx`, `[marca]/[periodo]/page.tsx`, `mobiliario/page.tsx`).
- **Ningún otro rol** (bodega, contabilidad, vendedor, gerente_acs, gerente_boston) tiene el módulo.

**Excepciones más estrechas, con candado** (`marketing-notas-proveedor.test.ts` ·
`marketing-precios-proveedor.test.ts`):

| Ruta | Quién |
|---|---|
| `DELETE /api/marketing/facturas/[id]` | 🔴 **Solo admin** |
| `DELETE /api/marketing/proyectos/[id]` | 🔴 **Solo admin** |
| `DELETE /api/marketing/inventario/productos/[id]` | 🔴 **Solo admin** |
| `GET/PATCH/DELETE /api/marketing/mobiliario/notas-proveedor/**` y su `upload-url` | 🔴 **Solo admin** — son los **costos del proveedor**, secretaria nunca los ve |
| `DELETE /api/marketing/impulsadoras/[id]` | admin o secretaria — **el SERVIDOR decide** si oculta (`activa=false`) o borra de verdad, según haya pagos. El front no elige |

**Tres rutas públicas, sin sesión, con token HMAC propio** (exentas en el middleware; el token se
firma con `SESSION_SECRET`, con **namespace propio por `scope`** — `galeria` / `facturas` /
`entrega` — y **fail-closed** si falta el secreto):
- `GET /marketing/galeria/[cliente]?t=` — las fotos de un cliente
- `GET /api/marketing/facturas-pdf/[cliente]?t=` — el PDF combinado de sus facturas
- `GET /api/marketing/entregas-pdf/[id]?t=` — el comprobante de una entrega

Sin token válido responden **403 / «enlace inválido»**, nunca 404 — un 404 sería un oráculo.

**Quién lo usa de verdad** (medido en `activity_logs`; ⚠️ **crear un proyecto o una factura NO se
audita** — solo el PATCH/DELETE de proyecto y el DELETE de factura/adjunto):
- `mk_proyectos` update 10 · `mk_proyectos` delete_definitivo 2 · `mk_facturas` delete_definitivo 5 ·
  `mk_adjuntos` delete_definitivo 5. Por rol: **admin 19 · secretaria 3**.
- Impulsadoras (esas **sí** se auditan una por una): `impulsadora_pago` 17 · `impulsadora_creada` 9 ·
  `impulsadora_eliminada` 3 · `impulsadora_ocultada` 2. Por rol: **secretaria 22 · admin 9** —
  🔑 **al revés que en proyectos y facturas**: en impulsadoras quien opera es la secretaria.

## Las pantallas

Rediseño de **tres niveles** (12-ago-2026).

### Nivel 1 · `/marketing` — las marcas (`InicioMarketing.tsx`)

- **Resumen** arriba: el monto total gastado en el período actual y cuántos clientes, con dos enlaces
  **«Por cliente»** y **«Por marca»** que abren sus modales (`PorClienteModal` / `PorMarcaModal`).
- Lista **«Marcas»**: una fila por marca (Tommy, Calvin, Karl, Reebok, Joybees, Multifashion, «Sin
  marca asignada»), con subtítulo («N períodos» o **«Sin gasto este período»**) y el monto a la
  derecha. 🔑 **Las marcas con gasto van primero**; dentro de cada grupo, el orden fijo de siempre.
- Lista **«Herramientas»**: **Mobiliario** («N entregas · $X entregados»), **Impulsadoras**
  («N impulsadoras · $X al mes»), **Reportes**.
- Un solo botón de acción: **«+ Registrar gasto»**.
- 🔑 **Ningún cálculo se hace en pantalla**: todo viene ya sumado de `GET /api/marketing/inicio`.

**La tarea más frecuente, contada** (registrar una factura de gasto):
**«+ Registrar gasto»** (1) → elegir el camino **Factura / Mueble / Gasto de la marca** (1) → elegir
**cliente** (1, obligatorio en Factura y Mueble) → elegir **marca** (1, o se hereda si vienes de la
página de esa marca) → llenar número, fecha, proveedor, concepto, subtotal e **ITBMS (0% / 7% / Zona
libre)** (6) — **o** subir el PDF y dejar que la IA lo prellene (1) → **Guardar** (1) =
**11 toques a mano, o 5 con el PDF**.

### Nivel 2 · `/marketing/[marca]` — los períodos de una marca

Lista de períodos de esa marca: **ABIERTO primero**, después los cerrados del más nuevo al más viejo.
Cada fila con su chip de estado, su monto y un botón **ZIP** al lado.
🔑 **Con un solo período, la página salta directo al nivel 3** — no tiene sentido una lista de un
renglón. Multifashion y «Sin marca asignada» **no tienen períodos**: esta misma página es su detalle
sintetizado.

### Nivel 3 · `/marketing/[marca]/[periodo]` — el detalle (`DetallePeriodoView.tsx`)

La pantalla de trabajo real.
- **Cabecera:** chip ABIERTO/CERRADO, nombre del período, y sus acciones — **«+ Registrar gasto»**
  (solo si está abierto), **«Cerrar»** (solo si puede), **«Bajar ZIP»**, **«Excel»**.
- **Tarjeta de total:** el monto, «N grupos · N gastos», y si hay facturas y muebles a la vez, el
  desglose («Facturas $X · Mobiliario $Y»).
- **Aviso «Lo que falta»** (solo en el abierto): cuántos gastos sin comprobante y cuántos sin foto de
  instalación.
- **Buscador** — filtra la lista, **no** los totales de arriba.
- **Lista de filas:** una por proyecto/cliente, con contador («2 facturas · 1 entrega») y monto; menú
  **«···»** con **Editar** · **Descargar ZIP** · **«Registrado por error — eliminar»** (rojo, con
  **Deshacer de 5 s** vía `papelera/restaurar`). Una fila **«General»** aparte para los gastos sin
  cliente (impulsadoras, eventos).
- **`ProyectoOverlay`** (modal grande, al tocar una fila): datos del proyecto, una línea de contexto
  si el proyecto también tiene plata de otra marca (*«En Calvin Klein · Período 2026: $2.600 — este
  proyecto también tiene $2.470 de Tommy Hilfiger»*), y dos pestañas: **Facturas** (donde también van
  las **entregas de muebles** de ese proyecto) y **Fotos**.

### `/marketing?vista=impulsadoras` (`ImpulsadorasView.tsx`)

Catálogo: nombre, sueldo mensual, marcas con su **% de reparto**, y el estado de pago del mes actual
y el anterior (pagado / parcial / pendiente, con los días que faltan si es parcial).
- **Registrar pago** (`RegistrarPagoModal`): pide el **período trabajado desde/hasta**, el
  **comprobante (obligatorio)** y una foto opcional.
- **Historial** (`HistorialImpulsadoraModal`): la lista de pagos, con **anular** (pide motivo).
- **Nueva impulsadora** (`NuevaImpulsadoraModal`).

### `/marketing?vista=reportes` (`ReportesTabs.tsx`)
Tres pestañas: **Por marca** · **Por tienda** (con filtro de marca) · **Por proyecto**.

### `/marketing/mobiliario` (1.322 líneas)

- Línea de resumen: **«En bodega: $X · Entregado: $Y · Tiendas: N»**.
- **Tabla «Productos»**: foto · nombre · precio · **comprado** (= entregado + disponible) ·
  **entregado** · **disponible** (= `stock_total`) · **valor** (precio × disponible) ·
  Editar / Borrar (Borrar solo admin). Botón **«+ Agregar producto»** y el **«?»** de **precios del
  proveedor** (`PreciosProveedorAyuda`, **solo admin**).
- **Tabla «Resumen por tienda»**: cliente · total de paneles · **una columna $ por cada marca usada**
  · Total $. Incluye **todas** las entregas, también las pendientes.
- **Modal de producto:** **Nombre \*** (obligatorio) · Precio · Stock total · Foto (opcional, se
  comprime en el navegador). 🔑 Cambiar el precio de un producto ya usado **pide confirmación con el
  impacto** («se usa en N entregas… pasa de $X a $Y»).
- Botón **«Descargar Excel»** (arriba, uno solo).
- Bajo `lg` (celular y tablet chico) las dos tablas se convierten en **tarjetas con las mismas
  etiquetas**.

### `/marketing/galeria/[cliente]` — sin entrada de menú

Página **pública** (token HMAC en `?t=`). Solo el nombre del cliente y la grilla de fotos de
instalación, con lightbox. **Cero datos financieros.** Se llega **únicamente** desde un link embebido
en el Excel de reporte (`zip-export.ts`) — nunca desde un botón dentro de la app.

## Los datos

**14 tablas `mk_*`.** Medido el 3/4-sep-2026.
**Soft delete, dos convenciones dentro del mismo módulo:** `mk_proyectos` y `mk_facturas` usan
🔴 **`anulado_en` / `anulado_motivo`** (propio del módulo, distinto del `deleted boolean` del resto
del sistema); las demás (`mk_adjuntos`, `mk_entrega_items`, `mk_impulsadora_marcas`,
`mk_factura_marcas`, `mk_periodo_documentos`, `mk_proyecto_marcas`) son **hard delete / append-only,
sin columna de borrado**.

| Tabla | Grano / llave | Filas | Columna por columna |
|---|---|---|---|
| `mk_proyectos` | 1 por proyecto (cliente) | **25 vivas** (0 anuladas) | `nombre` 25/25 · `tienda_codigo` 19/25 · `notas` **1/25** · 🔴 `fecha_cierre` **0/25**, `fecha_enviado` **0/25**, `fecha_cobrado` **0/25** (el workflow se retiró el 11-ago-2026: columnas muertas) · `estado` fijo en `'abierto'` en las 25 (ya no se escribe otra cosa; se lee legacy con `normalizarEstadoProyecto`). `created_at` 26-abr → 25-ago-2026 |
| `mk_facturas` | 1 por factura | **102** (14 anuladas) | `proyecto_id` 85/102 · `impulsadora_id` 17/102 · `impulsadora_mes`/`periodo_desde`/`periodo_hasta` **17/17** donde aplica (100% de los pagos) · `tiene_importacion` (zona libre) 3/102 · `grupo_legacy` true en 81/102 · `estado_pago`: creado 85, pagado 17. ⚠️ **Fecha de factura del 25-feb-2024** al 25-ago-2026 (histórico retroactivo); `created_at` del 26-abr al 28-ago-2026 (el uso real) |
| `mk_factura_marcas` | 1 por (factura, marca) | **102** — o sea **una marca por factura, ninguna repartida** | `empresa_pagadora_codigo` 61/102 — 🔴 **en extinción**: desde que se retiró el reparto 50/50, `setMarcasDeFactura` la escribe siempre `null`. Los 61 son filas viejas |
| `mk_adjuntos` | 1 por archivo | **162** | Por `tipo`: `pdf_factura` **100** · `foto_proyecto` **60** · `foto_factura` 2 · 🔴 `foto_instalacion` **0**. `proyecto_id` 60/162 · `factura_id` 102/162 |
| `mk_entregas_muebles` | 1 por entrega | **24** | `proyecto_id` **24/24** (cero pendientes hoy) · `notas` 2/24 · `numero` secuencial 1→25 **con un hueco** (una entrega se borró) · `total_por_marca` / `total_por_empresa_interna` según el reparto. 12-jun → 28-ago-2026 |
| `mk_entrega_items` | 1 por renglón | **111** | 🔴 `bultos` **0/111** — la columna existe (migración corrida), hay módulo puro (`piezas-bultos.ts`), tests y PDF que la muestran, y **nadie ha anotado un bulto todavía** |
| `mk_inventario_productos` | 1 por producto de bodega | **6** — Barra flauta, Barra plana, Conjunto soporte, Norte colgador, Paneles, Tablas | `foto_path` **6/6** (backfill completo). Precios $10–$130. `stock_total`: 🔴 **solo Barra plana con 18; las otras 5 en 0** (agotadas). Ninguna en negativo hoy (el postmortem citaba −95 y −16 en agosto; se repuso) |
| `mk_mobiliario_notas_proveedor` | 1 por renglón del proveedor | **6** | `precio` 6/6 · `nota` 1/6 («el par completo», en Conjunto soporte tabla). Los precios del proveedor van **bien por debajo** de los de venta (Paneles $65 proveedor vs. $130 inventario) |
| `mk_marcas` | 1 por marca, único por `codigo` | **6** | TH · CK · KL · RBK · J activas (externas salvo J = interna) + **OTR** («Otros», `activo=false`, **sin `empresa_codigo`**) |
| `mk_impulsadoras` | 1 por persona | **2** — Ana Trejos y Cindy de Gracia, las dos activas, **$800/mes cada una** | — |
| `mk_impulsadora_marcas` | 1 por (impulsadora, marca) | **2** | — |
| `mk_periodos` | 1 por (marca, apertura) | **6** — CK · J · KL · RBK · TH **abiertos** («Período 2026») + **pvh cerrado** («mid 2026», cerrado el 12-ago-2026) | 🔴 `reporte` **NULL en las 6, incluido el cerrado** — el campo pensado para congelar el reporte al cerrar **nunca se llenó ni en el único período que ya cerró**. ✅ **La migración por marca YA CORRIÓ** (medido: hoy hay 5 períodos por código de marca, no solo `pvh` — el postmortem que dice «la corre Daniel a mano» quedó viejo) |
| `mk_periodo_documentos` | 1 por (documento, marca sellada) | **191** | pvh/factura 73 · TH/factura 48 · CK/factura 45 · TH/entrega 12 · CK/entrega 11 · KL/factura 1 · J/entrega 1. Los sellos legacy (`pvh`) **conviven** con los de código nuevo, como predice `bloques.ts` |
| `mk_proyecto_marcas` | 1 por (proyecto, marca) | **5** | 🔴 **Tabla legacy que ya casi nadie llena** — 5 filas para 25 proyectos. El reparto real vive en `mk_factura_marcas` (por FACTURA, no por proyecto) desde la Fase 2 |

## De dónde vienen los datos

**Marketing no toca Switch.** Verificado: **ningún cron de `vercel.json` toca `marketing` ni
`mobiliario`**. El cron con nombre parecido, `catalogos-fotos-resumen` (lunes 13:30 UTC), es de otro
módulo (las fotos del catálogo público de Reebok/Joybees/Tommy).

| Fuente | Cómo entra | Si falla |
|---|---|---|
| **Todo el gasto** | **A mano**, desde la pantalla. 100% de las facturas y entregas |  — |
| **Storage** | Bucket **`marketing`** (privado), con **URLs firmadas** (`storage.ts`, TTL **1 h** por defecto, **1 año** para los links de la galería pública). Guarda: fotos y PDFs de factura, fotos de instalación, fotos de mobiliario, comprobantes de impulsadora | La factura o el pago **no se pierde**: la foto opcional que no sube deja `fotoGuardada: false` en vez de mentir; el PDF prescindible avisa por toast y no tumba el guardado |
| **La IA que lee la factura** (`POST /api/marketing/ia/leer-factura`) | **Claude Sonnet 4.6** (`claude-sonnet-4-6`, `@anthropic-ai/sdk`, `ANTHROPIC_API_KEY`). Le manda el PDF completo en base64 (`type: "document"`) y pide un JSON con **número, fecha, proveedor, concepto, subtotal e ITBMS (0 o 7%)** | 500/502 y la pantalla dice «no se pudo leer con IA, llena a mano». **Nunca bloquea** |
| **`clientes_master`** | El `ClientePicker` lee el directorio del grupo — Marketing **no tiene catálogo propio de clientes** | Sin clientes no se puede registrar una Factura ni un Mueble (los dos exigen cliente) |

## Las reglas que ya están fijadas

1. 🔴 **El inventario se descuenta en PIEZAS, nunca en bultos.** Los bultos son solo cómo viajó la
   mercancía y **no existe conversión fija**. `piezasParaStock()` es la **única** función que puede
   tocar el stock, y recibe el renglón entero (piezas + bultos) a propósito. Candado:
   `src/__tests__/lib/marketing-piezas-bultos.test.ts` — **barrido estático que pone el build ROJO si
   `bultos` entra en la aritmética de `inventario.ts`**.
2. **Bultos es opcional**: `null` = «no se anotó» → se muestra **vacío, nunca `0`**
   (`src/lib/marketing/piezas-bultos.ts`).
3. **Paneles NO es obligatorio para registrar una entrega** (desde el 23-ago-2026). El único freno es
   `tieneAlMenosUno` (al menos un producto con cantidad), cerrado también en el servidor
   (`createEntrega` lo repite). Candado: `marketing-reclamos-toques.test.tsx`.
4. **El stock puede quedar negativo, a propósito**, con aviso en pantalla: **la entrega no se
   bloquea.** Decisión de Daniel: *«negativo»*.
5. **Editar y borrar una entrega devuelven el stock por DELTA**; ejecutar dos veces no cuenta dos
   veces. `deleteEntrega` **lee los renglones ANTES del DELETE** (con CASCADE, después vendrían
   vacíos). Candado: `marketing-stock-piezas.test.ts` (17 casos).
6. 🔴 **`mk_mobiliario_notas_proveedor` queda SEPARADA del inventario. NO se fusiona.** Son los mismos
   muebles con precios distintos a propósito (el costo del proveedor contra lo que se le reporta a la
   marca). El «?» **no suma, no promedia**, y es **solo admin**. Candados:
   `marketing-notas-proveedor.test.ts` · `marketing-precios-proveedor.test.ts`.
7. **Precio del proveedor opcional → «—», nunca «$0.00»**: un costo desconocido no es cero.
8. **La MARCA es la unidad de todo el módulo**, no el «proveedor»: cada marca se cierra sola. Candado:
   `marketing-bloques-por-marca.test.ts`.
9. 🔴 **Un documento se sella con el período que su marca tenía ABIERTO cuando se REGISTRÓ**, no con
   la fecha del papel. Una factura vieja que llega tarde entra al período abierto y se reporta en el
   próximo corte — **nunca reabre un período cerrado** (`periodos-io.ts`).
10. **La plata se congela, los papeles no**: agregar una foto a un período cerrado no mueve ni un
    centavo. Candado: `marketing-zip-marca.test.ts`.
11. 🔴 **Multifashion nunca entra en el ZIP de una marca ni en el archivo del proveedor** — es tienda
    propia, no co-op (`multifashion.ts` + `marketing-multifashion.test.ts`).
12. 🔴 **El cliente se ELIGE, nunca se tipea libre.** Factura y Mueble exigen cliente **obligatorio**
    desde el `ClientePicker`; el texto libre **no enciende «Continuar»**. Un cliente que falta se da
    de alta **en Switch**, no en Marketing. Candado: `marketing-registrar-gasto.test.tsx`.
13. **Una marca por gasto, sin repartos 50/50.** Si hay que repartir, se registran **dos gastos**.
14. **Los dos papeles del gasto son distintos y nunca se confunden en el aviso «lo que falta»**: el
    **comprobante** lo lleva TODO gasto (impulsadoras incluidas); la **foto de instalación** solo los
    gastos CON cliente.
15. **El comprobante de pago de impulsadora es obligatorio** — sin `path`, la función lanza error del
    lado del servidor.
16. **El anti-duplicado de un pago de impulsadora es por SOLAPAMIENTO de días**, no por mes: dos
    quincenas contiguas conviven.
17. **Editar la ficha de una impulsadora NO recalcula los pagos ya hechos** — el cambio de sueldo o de
    reparto aplica del próximo pago en adelante.
18. **Eliminar una impulsadora CON pagos la OCULTA (`activa=false`), nunca la borra** — y **decide el
    servidor**, no el cliente.
19. **«Otras marcas» del Excel es un RESIDUO por construcción** (`subtotal − ck − th`), nunca la suma
    de las partes ajenas: así `ck + th + otras` cuadra siempre con el subtotal.
20. **Registrar o editar un proyecto sin cambios no escribe nada de más.** Anular es **reversible**
    (5 s de «Deshacer» vía `papelera/restaurar`); eliminar definitivo no lo es.
21. 🔴 **`mk_proyecto_marcas` NO es la fuente de las marcas de un proyecto** — lo real vive en
    `mk_factura_marcas` (por factura).
22. **La nota de entrega se arma ANTES del clic** — en iOS un `await` de red en medio del gesto
    bloquea la hoja de compartir en silencio.

## Con qué conecta

### Qué LEE de otros módulos
- **`clientes_master`** — vía `ClientePicker`, para elegir el cliente de un proyecto o un gasto.
- **`mk_marcas.empresa_codigo` → `src/lib/companies.ts`** (`getCompany`), para pintar la sigla y el
  color de la empresa interna pagadora (Fashion Wear, Vistana…) en `EmpresaStyle`.
- **`activity_logs`** — Marketing **escribe** ahí (`logAudit`, `logActivity`); no lee de nadie.

### Quién LEE lo suyo
🔴 **Nadie. Las 14 tablas `mk_*` no tienen NI UN lector fuera de `src/app/api/marketing/**` y
`src/lib/marketing/**`.** Verificado con
`grep -rl "mk_facturas\|mk_proyectos" src/app/api | grep -v marketing` → sin resultados.

- **No** está en la búsqueda global (los 8 son CXC, Reclamos, Guías, Directorio, Cheques, Ventas,
  Préstamos, Caja).
- **No** dispara ni recibe ninguna alerta de Telegram:
  `grep enviarNegocio|enviarSistema|sendTelegramAlert` en `src/lib/marketing/**` y
  `src/app/api/marketing/**` → **cero resultados**.
- **No** aparece en Vista General ni en Data Health.
- **No** lo toca ningún cron.
- Lo único que sale del módulo va a **gente de afuera** (las marcas), por los papeles de abajo.

### Qué se rompería si cambiara la forma de sus datos
- **Si `mk_facturas.total` cambiara de signo o de definición:** rompe `reportes.ts`,
  `resumen-bloques.ts`, `zip-export.ts` y los **tres** Excel/ZIP de reporte (por marca, tienda y
  proyecto) — todos derivan del mismo campo.
- 🔴 **Si `mk_periodos.proveedor_key` dejara de aceptar la clave legacy (`pvh` / `reebok` /
  `joybees`):** los **121+ sellos históricos** (73 de `pvh` + los demás) se leerían como «período
  actual» y **movería ~$100K en pantalla de golpe**. Documentado y con candado:
  `marketing-periodos.test.ts`.
- **Si `mk_entrega_items.reparto` (jsonb) cambiara de forma:** rompe `inventario.ts`
  (`normalizeReparto`), `inventario-resumen.ts` (el conteo de paneles) y el comprobante PDF
  (`entrega-comprobante.ts`).

## Por qué está así

| Fecha | Decisión | Cita / razón |
|---|---|---|
| 11-ago-2026 | **Se retira el workflow «Cerrar / Enviar / Cobrar» del proyecto** | Las tres columnas de fecha quedaron muertas |
| 11-ago-2026 | **Cada marca se cierra sola** — se retira el «Cerrar las tres» | La marca es la unidad del módulo |
| 12-ago-2026 | **Rediseño de tres niveles** (marcas → períodos → detalle) | — |
| 23-ago-2026 | **Paneles deja de ser obligatorio** para registrar una entrega | El único freno pasa a ser «al menos un producto con cantidad» |
| — | 🔴 **El stock se descuenta en PIEZAS, no en bultos** | *«no existe conversión fija»* entre unos y otros — los bultos son solo cómo viajó la mercancía |
| — | **El stock puede quedar negativo** | Daniel: **«negativo»** — la entrega no se bloquea |
| — | 🔴 **Los costos del proveedor NO se fusionan con el inventario** | Son los mismos muebles con precios distintos **a propósito** |
| — | 🔴 **El cliente se elige del `ClientePicker`, nunca a mano** | Un cliente que falta se da de alta **en Switch**, no en Marketing |
| — | **Una marca por gasto** — sin repartos 50/50 | Si hay que repartir, se registran dos gastos |
| — | **La nota de entrega se arma ANTES del clic** | En iOS, un `await` de red en medio del gesto **bloquea la hoja de compartir en silencio** |
| — | **La galería del cliente va por token HMAC y sin montos** | El link viaja dentro de un Excel que ve la marca |

⚠️ **No hay citas textuales de Daniel registradas** para la mayoría de estas decisiones en
`docs/postmortems/marketing-mobiliario.md` (47 líneas, el postmortem más corto del repo) — a
diferencia de Guías o Caja, aquí las razones están escritas pero no atribuidas verbatim. La única
frase suya que aparece es **«negativo»**, sobre el stock.

## Lo que se intentó y se retiró

| Qué | Por qué se quitó | Cuándo |
|---|---|---|
| **El workflow «Cerrar / Enviar / Cobrar proyecto»** | Se retiró entero. Dejó `fecha_cierre`, `fecha_enviado` y `fecha_cobrado` **muertas: 0 de 25 proyectos las tienen** | 11-ago-2026 |
| **El cierre conjunto «Cerrar las tres» (marcas)** | Cada marca se cierra sola: la marca es la unidad | 11-ago-2026 |
| **El reparto 50/50 marca ↔ empresa interna** | Una marca por gasto. Dejó `mk_factura_marcas.empresa_pagadora_codigo` **en extinción**: 61 filas viejas la tienen, y todo insert nuevo la escribe `null` | fecha no registrada |
| **`mk_proyecto_marcas` como fuente de las marcas de un proyecto** | Lo reemplazó `mk_factura_marcas` (por FACTURA) en la Fase 2. La tabla vieja **sigue leyéndose y escribiéndose en 3 lugares «por compatibilidad»** con 5 filas para 25 proyectos | Fase 2 |
| **Un segundo botón «Descargar Excel» dentro de «Resumen por tienda»** | Llamaba **exactamente** a la misma función que el de la cabecera — dos caminos para lo mismo | documentado en `mobiliario/page.tsx` |
| **La carpeta/fila «Impulsadoras» en el ZIP** | La reemplazó **«General»** — cubre impulsadoras y cualquier otro gasto sin cliente | documentado en `zip-marca.ts` |
| **`PORCENTAJE_MARCA_FIJO`** (`factura-marcas.ts`) | Marcado *«Legacy: se mantiene para importaciones antiguas»* — pero **no hay ningún importador** en todo `src/`. Export muerto | — |

## Cuánto se usa

**Facturas de marketing por mes** (vivas, por `created_at` — o sea cuándo se cargaron, no la fecha del
papel):

| Mes | Facturas | Monto |
|---|---|---|
| abr-2026 | **34** | **$50.466,17** |
| may-2026 | 5 | $5.350,06 |
| jun-2026 | 28 | $12.319,65 |
| jul-2026 | 6 | $14.507,32 |
| ago-2026 | 15 | $10.562,64 |
| **sep-2026** | **0** | **$0** |

⚠️ **La fecha del papel llega hasta el 25-feb-2024**: abril fue la carga retroactiva del histórico
(34 facturas, $50 mil), no un mes de operación normal.

**Otras señales de volumen:**
- **25 proyectos** (clientes) en total, del 26-abr al 25-ago-2026.
- **24 entregas de mobiliario**, del 12-jun al 28-ago-2026 → **~3 al mes**.
- **17 pagos de impulsadora** registrados, a **2 personas** ($800/mes cada una).
- **162 adjuntos** subidos (100 PDF de factura + 60 fotos de proyecto + 2 fotos de factura).
- **1 solo período cerrado** en la vida del módulo: `pvh` / «mid 2026», el 12-ago-2026.

**Última actividad medida:** `mk_facturas.created_at` máximo = **28-ago-2026**;
`activity_logs` de impulsadoras = **6-ago-2026**; `mk_entregas_muebles` = **28-ago-2026**.
**Al 4-sep no se ha registrado nada en septiembre.**

**Quién:** admin domina proyectos y facturas (19 de 22 acciones auditadas); **secretaria domina
impulsadoras** (22 de 31).

**Lo que NO se puede medir:** 🔴 **crear un proyecto o una factura NO se audita** — solo se registran
el PATCH/DELETE de proyecto y el DELETE de factura/adjunto. Así que no hay traza de quién cargó las
102 facturas ni a qué hora. Lo que sí hay es `created_at` de cada fila y los 33 registros de
`activity_logs` que sí existen.

## Qué papeles y Excel produce

🔴 **Es el módulo que produce los papeles más caros del sistema: lo que Fashion Group le presenta a
las MARCAS para cobrarles.**

### 1 · El ZIP del período de una marca — el paquete que recibe la marca

- **De dónde sale:** botón **«Bajar ZIP»** del período, o el botón ZIP de la fila en el nivel 2 →
  `GET /api/marketing/zip-marca` (`src/lib/marketing/zip-marca.ts`).
- **Quién lo recibe:** 🔴 **el encargado de la marca** (Tommy, Calvin, Karl, Reebok, Joybees).
- **Nombre del archivo:** `<Marca> · <Período>.zip` — o `Multifashion · <fecha>.zip` cuando no hay
  período. ⚠️ **Lleva acentos y el separador `·`, que no son ASCII**: se manda
  `filename*=UTF-8''…` (RFC 5987) para los navegadores de verdad y un `filename=` sin adornos como
  respaldo.
- **Qué lleva adentro:**
  - **`resumen_gastos.xlsx`** en la raíz — hoja **«Resumen»** + **una hoja por cliente**
  - **`<carpeta del cliente>/facturas/<nombre>.pdf`** — los PDF de las facturas
  - **`<carpeta del cliente>/fotos/<nombre>.jpg`** — las fotos de instalación
  - Una carpeta/fila **«General»** para lo que no tiene cliente (impulsadoras, eventos)
- 🔴 **Multifashion nunca entra en el ZIP de una marca.**

### 2 · El Excel del período (`resumen_gastos.xlsx`)

- **De dónde sale:** botón **«Excel»** del período → `GET /api/marketing/periodos/[id]/reporte`.
- **Nombre del archivo:** `marketing-<proveedor>-<periodo>.xlsx`.
- 🔑 **Es EXACTAMENTE el mismo archivo que va dentro del ZIP** — mismo constructor
  (`armarWorkbookDescarga`), para que no puedan divergir.
- **Estructura:** una hoja **«Resumen»** + **una hoja por cliente**.
- 🔴 **La columna «Otras marcas» es un RESIDUO por construcción** (`subtotal − ck − th`), nunca la
  suma de las partes ajenas: así `ck + th + otras` **cuadra siempre** con el subtotal.
- 🔴 **Dentro del Excel viaja el link «Ver todas las fotos (N)»** — apunta a
  `/marketing/galeria/<código>?t=<token HMAC>`, con tooltip *«Abrir galería del cliente»*. Es lo que
  hace que la marca pueda ver las fotos sin entrar al sistema y **sin ver ningún monto**.

### 3 · La NOTA DE ENTREGA de mobiliario — el papel que firma la tienda

- **De dónde sale:** `NotaEntregaAcciones.tsx` (imprimir / compartir) y
  `GET /api/marketing/entregas-pdf/[id]?t=` (público, token HMAC).
  Generador: `src/lib/marketing/pdf-entrega-mueble.ts`.
- **Quién lo recibe:** 🔴 **la TIENDA** que recibe los muebles.
- **Dos variantes del mismo generador**, y la diferencia es una columna:
  - `incluirBultos: true` (por defecto) → **«NOTA DE ENTREGA»**, **con columna Bultos** — el papel de
    la entrega física
  - `incluirBultos: false` → **«COMPROBANTE DE ENTREGA»**, sin bultos
- **Nombre del archivo:** `comprobante-<ME-XXXX>.pdf`. El número es
  **`ME-0001`** (`numeroComprobante`, `ME-` + `numero` a 4 dígitos); si la entrega no tiene número,
  cae a los primeros 8 caracteres hex del uuid.
- **Qué lleva:**
  - Encabezado: **NOTA DE ENTREGA** (o COMPROBANTE DE ENTREGA) · el número **`ME-XXXX`** a la derecha
    · la fecha
  - Tabla: **(foto) · Artículo · Piezas · [Bultos] · Precio unitario · Importe**, en azul marino con
    filas alternadas. Si no hay detalle: *«Sin detalle de artículos registrado»* con el total
  - Caja de **TOTAL** al pie
  - Las notas de la entrega (hasta 4 líneas)
- 🔑 **El PDF se arma ANTES del clic** — en iOS un `await` de red en medio del gesto bloquea la hoja
  de compartir, en silencio.

### 4 · El Excel de inventario de muebles

- **De dónde sale:** botón **«Descargar Excel»** de `/marketing/mobiliario` →
  `GET /api/marketing/inventario/export`.
- **Quién lo recibe:** la oficina.
- **Nombre:** `inventario-muebles-<YYYY-MM-DD>.xlsx`.

### 5 · El Excel de entrega por proyecto

- Misma ruta, con `proyectoId`. **Nombre:** `entrega-<tienda o proyecto>.xlsx`.

### 6 · El PDF combinado de facturas de un cliente

- `GET /api/marketing/facturas-pdf/[cliente]?t=` — **público, con token HMAC**. Junta los PDF de las
  facturas de ese cliente en un solo documento.

### 7 · La galería pública de fotos

- `/marketing/galeria/[cliente]?t=` — solo el nombre del cliente y sus fotos de instalación.
  **Cero datos financieros.** Se llega **únicamente** desde el link embebido en el Excel.

**Marketing no manda ningún correo automático ni ningún Telegram.** Los papeles se bajan y se mandan
a mano.

## Cómo probarlo a mano

**A · Registrar una factura de gasto**
1. Entra a **Marketing** y toca **«+ Registrar gasto»**.
2. Elige el camino **Factura**.
3. Elige el **cliente** de la lista. **Confirma que escribir un nombre a mano NO enciende
   «Continuar»** — el cliente se elige, no se tipea.
4. Elige la **marca**.
5. (Opcional) Sube el PDF de la factura y **confirma que se llenan solos** el número, la fecha, el
   proveedor, el concepto, el subtotal y el ITBMS.
6. Elige el ITBMS: **0% · 7% · Zona libre**.
7. Guarda.
8. **Dónde mirar que quedó:** vuelve a `/marketing`. El monto de esa marca subió, y la marca ahora
   aparece **arriba en la lista** (las marcas con gasto van primero).
9. Entra a la marca → su período → la fila de ese cliente. La factura está adentro, en la pestaña
   **Facturas**.

**B · Registrar una entrega de muebles**
1. Entra a **Marketing › Mobiliario**.
2. Anota el **disponible** de «Paneles» antes de empezar.
3. Registra una entrega con, por ejemplo, 5 paneles.
4. **Confirma que el disponible bajó en 5 PIEZAS**, no en bultos.
5. Si el disponible queda **negativo**, debe avisar **pero dejarte guardar igual**.
6. Deja el campo **Bultos vacío**: debe verse **en blanco, nunca como `0`**.
7. **Dónde mirar que quedó:** la tabla **«Resumen por tienda»** suma esa entrega, y el producto en
   «Productos» muestra el nuevo entregado / disponible.
8. **Edita** la entrega y baja de 5 a 3 paneles. **Confirma que el disponible sube en 2** — el
   devuelto es por diferencia, no por el total.

**C · La nota de entrega**
1. En la entrega, toca **imprimir** o **compartir**.
2. **Confirma** que el papel dice **«NOTA DE ENTREGA»** arriba y trae el número **`ME-XXXX`** a la
   derecha.
3. **Confirma** que la tabla tiene la columna **Bultos** (la variante «COMPROBANTE DE ENTREGA» es la
   misma sin esa columna).
4. En un iPhone: la hoja de compartir **debe abrirse de inmediato**, sin quedarse pensando — el PDF ya
   estaba armado.

**D · El paquete que se le manda a la marca**
1. Entra a una marca → su período abierto.
2. **Confirma el aviso «Lo que falta»**: cuántos gastos sin comprobante y cuántos sin foto.
3. Toca **«Excel»**: baja `marketing-<marca>-<periodo>.xlsx`.
4. Ábrelo. **Confirma que hay una hoja «Resumen» y una hoja por cliente**, y que en la hoja del
   cliente hay un enlace **«Ver todas las fotos (N)»**.
5. Toca ese enlace: debe abrir la galería **sin pedir login**, con las fotos y **sin ningún monto**.
6. Toca **«Bajar ZIP»**. Ábrelo: en la raíz está **`resumen_gastos.xlsx`** (el **mismo** archivo del
   paso 3) y una carpeta por cliente con `facturas/` y `fotos/`.

**E · Cerrar un período** ⚠️ (irreversible en la práctica: la plata se congela)
1. En el período abierto, toca **«Cerrar»**.
2. **Confirma que después de cerrar puedes seguir agregando FOTOS pero no mueve un centavo** — los
   papeles se agregan, la plata está congelada.
3. Registra un gasto nuevo de esa marca: debe entrar al **período nuevo**, no al cerrado.

## Qué lo rompe

**Marketing NO toca Switch.** Ningún endpoint, ningún reporte, ningún cron, ni por API ni por panel.
Su frontera externa son **Anthropic (Claude Sonnet 4.6)**, **Supabase Storage** y el `SESSION_SECRET`
que firma los tokens públicos.

| Falla | Qué pasa | Cómo se notaría |
|---|---|---|
| **`ANTHROPIC_API_KEY` falta o Claude no contesta** | `/ia/leer-factura` devuelve 500/502. **No bloquea**: se llena a mano | La pantalla lo dice |
| **Storage no responde al SUBIR** | El gasto **igual se guarda**. La foto opcional que no sube deja `fotoGuardada: false` **en vez de mentir**; el PDF avisa por toast | Un toast. La factura queda sin PDF y el aviso «Lo que falta» lo cuenta |
| **Storage no responde al armar el ZIP** | Los links firmados y las fotos no se pueden traer | El ZIP sale incompleto o falla |
| 🔴 **`SESSION_SECRET` cambia** | **TODOS los links ya enviados dejan de validar**: la marca ve «enlace inválido» en las galerías y en los PDF combinados de todos los Excel que ya recibió | La marca lo reporta. **No hay chequeo ni alerta** |
| 🔴 **`mk_periodos.proveedor_key` deja de aceptar la clave legacy `pvh`** | Los **121+ sellos históricos** se leerían como «período actual» → **~$100K se moverían en pantalla de golpe** | Un salto de seis cifras en el total del período. Lo caza el candado `marketing-periodos.test.ts` **en el build**, no en producción |
| **`clientes_master` llega vacío** | El `ClientePicker` queda sin opciones → **no se puede registrar ninguna Factura ni ningún Mueble** (los dos exigen cliente) | Se ve en el acto: no hay a quién elegir |
| **`mk_marcas` llega vacía** | No hay marcas que elegir; los períodos quedan huérfanos | Se ve en el acto |
| **`db-max-rows` (1000)** | La tabla más grande es `mk_adjuntos` con **162 filas** — está a un orden de magnitud del corte. `mk_facturas` 102, `mk_entrega_items` 111 | No se notaría hasta multiplicar por 6 el volumen |
| **Una migración de `mk_*` sin aplicar** | El módulo no tiene fallback declarado como el de Guías. La lectura fallaría | Error en la pantalla |

🔴 **El punto ciego:** Marketing **no tiene ni un cron, ni una alerta, ni un lector externo.** Si el
módulo se congelara mañana (y de hecho **lleva desde el 28-ago sin una factura nueva**), **nada en el
sistema lo diría**. La única señal es entrar y mirar. Es lo mismo que le pasó a Packing Lists.

## Lo que sobra o no cuadra

1. 🔴 **Código muerto confirmado en `/marketing/mobiliario/page.tsx`:** el estado
   `editEntrega` / `setEditEntrega` y el modal `<EntregaForm … open={true} …>` que lo consume
   **nunca se activan** — `grep` de `setEditEntrega(` en todo el archivo solo encuentra la
   declaración y **dos llamadas que lo ponen en `null`**. No hay ningún botón «Editar entrega» en la
   tabla que lo dispare. Es un **modal completo de edición de entrega inalcanzable desde la UI**.
2. **`PORCENTAJE_MARCA_FIJO` (`src/lib/marketing/factura-marcas.ts`) es un export muerto:** está
   marcado *«Legacy: se mantiene para importaciones antiguas»* y `grep` en todo `src/` **no encuentra
   ningún importador**. (Existe una constante local homónima, no relacionada, en `mutations.ts`.)
3. 🔴 **Tres columnas muertas en `mk_proyectos`:** `fecha_cierre`, `fecha_enviado` y `fecha_cobrado` —
   **0 de 25 filas** las tienen, porque el workflow «Cerrar / Enviar / Cobrar» se retiró el
   11-ago-2026 y **nada las vuelve a escribir**.
4. 🔴 **`mk_entrega_items.bultos` es una columna con cero adopción real:** hay un módulo puro dedicado
   (`piezas-bultos.ts`), tests de conducta y un PDF que la muestra — y **0 de 111 renglones la
   tienen**. Todo el trabajo de ingeniería está listo y nadie en la operación la usa.
5. 🔴 **`foto_instalacion` es un tipo de adjunto sin una sola fila:** el aviso «gastos sin foto»
   (`esFotoDeInstalacion`) y el modal de cierre lo mencionan activamente, pero **0 de 162 adjuntos**
   son de ese tipo. O nadie sube esa foto, o las fotos reales siguen entrando como `foto_proyecto`
   (60 filas) — y en ese caso **el aviso «sin foto» está sistemáticamente en rojo sin que nadie lo
   note**.
6. 🔴 **`mk_periodos.reporte` está vacío en el 100% de los períodos, incluido el único que ya
   cerró.** El campo pensado para **congelar** el reporte al cerrar nunca se llenó ni siquiera en
   «mid 2026». El sistema entero depende del cálculo **en vivo** (`periodos-reporte.ts`) como si esa
   columna no existiera — así que **el Excel de un período cerrado se recalcula cada vez**.
7. 🔴 **`mk_proyecto_marcas` es una tabla en vías de abandono:** **5 filas para 25 proyectos**,
   superada por `mk_factura_marcas` desde la Fase 2, pero **se sigue leyendo y escribiendo en 3
   lugares** (`queries.ts`, `reportes.ts`, `mutations.ts`) «por compatibilidad». Dos caminos para
   saber la marca de un proyecto, uno de ellos casi vacío.
8. **`mk_factura_marcas.empresa_pagadora_codigo` en extinción activa:** 61 de 102 filas la tienen
   (datos de cuando existía el reparto 50/50), y **todo insert nuevo la escribe `null`**. Sigue en el
   schema solo por las filas viejas.
9. **`mk_marcas` tiene una marca apagada sin empresa:** `OTR` («Otros»), `activo = false`, **sin
   `empresa_codigo`**.
10. **Cinco de los seis productos de mobiliario están en stock 0.** Solo «Barra plana» tiene 18. El
    postmortem cita stocks negativos de −95 y −16 en agosto; hoy están en cero, o sea que se repuso.
11. **Dos convenciones de soft delete dentro del mismo módulo:** `anulado_en` en `mk_proyectos` y
    `mk_facturas`; **nada** en las otras seis (hard delete). El resto del sistema usa
    `deleted boolean`.
12. **Un segundo botón «Descargar Excel» duplicado ya se retiró** — pero el comentario que lo
    documenta (`mobiliario/page.tsx`) es evidencia de que el patrón «dos caminos para lo mismo» ya
    ocurrió en esta pantalla.
13. **Crear un proyecto o una factura no se audita.** Solo el PATCH/DELETE de proyecto y el DELETE de
    factura/adjunto. Las 102 facturas y los 25 proyectos **no tienen traza de quién los cargó** más
    allá de `created_at`.
14. **El postmortem dice que la migración por marca «la corre Daniel a mano» y ya corrió.** Medido:
    hoy hay 5 períodos por **código de marca** (CK, J, KL, RBK, TH), no solo el `pvh` legacy. El
    documento quedó viejo.
15. **La marca `pvh` legacy convive con los códigos nuevos en `mk_periodo_documentos`** (73 sellos
    `pvh` contra 118 de código nuevo). Funciona a propósito (`bloques.ts` lo predice), pero significa
    que **hay dos vocabularios de marca vivos en la misma tabla**.

---

# Caja Menuda (`/caja`, key `caja`)

## Qué es

El fondo de caja chica de la oficina: $200 que la secretaria gasta en cosas del día (almuerzos,
taxis, materiales), pega los recibos, y cuando queda poca plata cierra el período, se le repone la
diferencia y se abre el siguiente. Es un módulo chico y muy usado por **una sola persona**.

⚠️ **Cambió el 4-sep-2026** (commit `ad80b89d`): el cierre ya no exige saldo 0, la fecha se conserva
al «Guardar y nuevo», y el ITBMS arranca plegado. ✅ **La migración `20260920120000_caja_reposicion`
YA ESTÁ APLICADA** (verificado en `supabase_migrations.schema_migrations` el 4-sep-2026; la nota de
`docs/estado-actual.md` que dice «pendiente de aplicar» quedó vieja).

No tiene postmortem propio en `docs/postmortems/`. El resumen del cambio está en
`docs/estado-actual.md`.

## Quién entra

- **admin** y **secretaria**: todo (`CAJA_ROLES = ["admin","secretaria"]` en las 7 rutas).
- **Todos los demás roles: 403** en cada ruta de `/api/caja/**`.
- **Excepciones más estrechas dentro del módulo:**
  - `DELETE /api/caja/periodos/[id]` → **solo `admin`**. La secretaria no borra períodos.
  - `POST` y `DELETE` de `/api/caja/categorias` → exigen `auth.isOwner`, con el mensaje
    *«Solo el dueño puede crear categorías.»* / *«…eliminar categorías.»*. Es un gate distinto del
    rol: lo da la sesión, no `role_permissions`.

**Quién lo usa de verdad** (medido): **Angela** es la única responsable de los 93 gastos
—escrita de tres formas distintas, ver «Lo que sobra»—. En `activity_logs` (`entity_type='caja'`,
39 filas desde el 17-abr-2026): `caja_gasto_update` 20 · `caja_gasto_delete` 16 (último 2-sep-2026)
· `caja_periodo_close` 2 (último 2-sep-2026) · `caja_gasto_restore_manual` 1.
⚠️ El **alta** de un gasto (`POST /api/caja/gastos`) **no llama a `logActivity`**: por eso no hay
ni una acción `caja_gasto_create` en el log, pese a los 93 gastos.

## Las pantallas

### 1 · `/caja` — la lista de períodos

Tabla con: **Estado · Apertura · Cierre · Fondo · Gastado · Saldo · Acciones**. Ordenada por `numero`
descendente. Acciones por fila: **Cerrar período** (solo si está abierto) e **Imprimir**.
Botón **«+ Nuevo período»** arriba. Vacío: *«No hay períodos registrados»*.

### 2 · `/caja/[periodoId]` — el detalle de un período

**Cabecera** (`PeriodoDetailHeader`): tres cifras — **Fondo · Gastado · Saldo** — con barra de
porcentaje usado. Botones: **Cerrar período** (si está abierto) · **Imprimir** · **Exportar Excel** ·
**Aprobar reposición** · **Gastos eliminados** (con su contador).

**Tabla de gastos** (`GastoTable`): **Fecha · Descripción · Proveedor · Categoría · Sub-total ·
ITBMS · Total**, con filtro de categoría (*«Todas»*) y edición en línea. En una fila se puede
**cambiar la categoría** con un desplegable rápido (*«Cambiar categoría»*). Solo se puede editar si
el período está **abierto** — el servidor lo verifica también
(*«No se pueden editar gastos de un período cerrado.»*).

**Modal «Gastos eliminados»** (`DeletedGastosModal`): **Fecha · Descripción · Responsable · Total ·
Borrado por · Borrado cuándo**, con **Restaurar**. Vacío: *«Ninguno.»*. El nombre de quien borró sale
de un `IN` contra `fg_users` con los uuid de `deleted_by`.

**Borrar un gasto** pide confirmación con el resumen entero del gasto y avisa:
*«Podrás restaurarlo desde Gastos eliminados si es un error.»*. **Restaurar ya NO pide
confirmación** (no tiene consecuencia).

### 3 · Nuevo gasto (`NuevoGastoDrawer` — un cajón, no una página)

Se abre desde el detalle con **«+ Nuevo gasto»** y empuja una entrada de historial
(`window.history.pushState`), así que el botón «atrás» del teléfono lo cierra.

Campos (`GastoForm`), agrupados en cuatro secciones con su eyebrow. El asterisco rojo marca lo
obligatorio:

| Sección | Campo en pantalla | Obligatorio | Nota |
|---|---|---|---|
| **Comprobante** | **Fecha** * | Sí | El servidor rechaza una fecha **futura** (calendario de Panamá, UTC−5) |
| | **Descripción** * | Sí | *«¿En qué se gastó?»* |
| **Origen del gasto** | **Proveedor** * | Sí | *«Nombre del proveedor»*. 🔴 **Texto libre, SIN lista** — Daniel: *«no»*, con candado explícito. El servidor rechaza vacío y rechaza `"—"` |
| | **Nº de factura** | **No** | *«Opcional»* |
| **Clasificación** | **Responsable** * | Sí | Desplegable con buscador (*«Buscar responsable…»*), contra `caja_responsables` activos. El servidor valida que el id exista y esté activo |
| | **Categoría** * | Sí | Desplegable con buscador (*«Buscar categoría…»*). Respaldo **UNO**: `"Varios"`. El dueño puede crear/borrar categorías desde el ícono *«Gestionar categorías»* |
| **Montos (USD)** | **Sub-total** | Sí (> 0) | El servidor: *«El monto debe ser mayor a 0»* |
| | **ITBMS** | No | 🔴 **Arranca PLEGADO** tras un botón **«＋ Agregar ITBMS»**. Solo se despliega si el gasto ya trae un porcentaje. Plegado, `itbms = 0` — la cuenta no cambia |
| | **Total** | Calculado | `subtotal + itbms`, redondeado a 2 decimales |

Dos botones al pie: **«Guardar y nuevo»** y guardar-y-cerrar.
🔴 **«Guardar y nuevo» conserva la fecha, la categoría y el responsable** — la tanda real son ~38
recibos de semanas atrás tecleados en una sentada. Limpia descripción, proveedor, N° de factura y
montos.

**La tarea más frecuente, contada** (cargar un recibo en tanda): descripción (1) → proveedor (1) →
subtotal (1) → «Guardar y nuevo» (1) = **4 toques**, porque fecha, categoría y responsable ya vienen
puestos del recibo anterior.

### 4 · Cerrar período (`CerrarPeriodoModal`)

🔴 **El cierre YA NO exige saldo 0.** Daniel, textual: *«cierro cuando queda poca plata (criterio de
la secretaria) y le doy la diferencia para llegar a los 200»*.

El modal muestra cuatro filas:
- **Fondo** — `$200.00`
- **Gastado (N recibos)**
- **Queda en caja** — en **rojo** si es negativo, con la línea *«Se gastó más que el fondo.»*
- **Reposición para volver a $200**

El botón dice **«Cerrar y abrir el N»** (N = `numero + 1`). Un saldo negativo **se ve y se dice, pero
NO bloquea**.

Al confirmar, el PATCH: (1) verifica que el período exista y no esté ya cerrado, (2) suma los gastos
VIVOS, (3) escribe `estado='cerrado'`, `fecha_cierre=hoy` y **`saldo_cierre`** — y si esa columna no
existiera, **reintenta sin ella** (el código cae limpio con la DDL sin correr), (4) **abre el período
siguiente** con el mismo fondo, por el mismo camino que «+ Nuevo período»
(`src/lib/caja/abrir-periodo.ts`, el único camino de creación).

### 5 · `/caja/[periodoId]/imprimir` y el Excel

**Imprimir** (`PrintView.tsx`): la hoja del período para pegarle los recibos.
**Excel** (`POST /api/caja/export-excel`, `src/lib/exports/caja-excel.ts`): columnas
**Fecha · Descripción · Proveedor · Categoría · N° Factura · Sub-total · ITBMS · Total**, con totales
al pie y el saldo pintado (verde `15803D` positivo, rojo `DC2626` negativo). Nombre:
`CajaMenuda-Periodo<N>-<fecha>.xlsx`. Formato de moneda `$#,##0.00` como números reales.

### 6 · `/caja/[periodoId]/nuevo` — 🔴 ruta HUÉRFANA

**Nada en la UI enlaza a esta página.** Se escribió como destino de deep-links con prefill
(`?descripcion=&total=&categoria=`), pero **hoy nadie genera esos links**, no tiene smart defaults y
al guardar navega a `/caja?view=detail&id=…`, una URL legacy que cae en la lista. **Se conserva a
propósito** (decisión del 4-sep-2026: anotar, no borrar) y tiene la nota escrita en su cabecera.

## Los datos

### `caja_periodos` — Grano: 1 fila por período. Llave: `id` (uuid); `numero` es UNIQUE.

Soft delete: **`deleted boolean DEFAULT false`**. Medido: **3 filas, 0 borradas.**

| N° | Apertura | Cierre | Fondo | Estado | `repuesto` | `saldo_cierre` |
|---|---|---|---|---|---|---|
| 1 | 2026-03-25 | 2026-07-08 | 200 | cerrado | false | NULL |
| 2 | 2026-07-08 | 2026-09-02 | 200 | cerrado | false | NULL |
| 3 | 2026-09-02 | — | 200 | **abierto** | false | NULL |

| Columna | Para qué · quién escribe · quién lee | Llenas |
|---|---|---|
| `numero` int NOT NULL | Correlativo. Lo asigna `abrirPeriodo` con `max(numero)+1`, **incluidos los borrados** (el UNIQUE sigue ocupado) | 3 |
| `fecha_apertura` date NOT NULL | Día en que se abrió | 3 |
| `fecha_cierre` date | Día del cierre. La escribe el PATCH | 2 |
| `fondo_inicial` numeric DEFAULT 200 | El fondo. El POST acepta otro valor en el body; el cierre hereda el mismo | 3 (los 3 en $200) |
| `estado` text DEFAULT `'abierto'` | `abierto` / `cerrado`. **Sin CHECK** | 3 |
| `repuesto` bool DEFAULT false | Lo marca «Aprobar reposición». 🔴 **NUNCA se ha usado: 0 filas en `true`** | 3 (0 en true) |
| `repuesto_at` timestamptz | Cuándo se aprobó. 🔴 **0 filas** | **0** |
| `created_by` uuid | Quién abrió el período | 2 (el N°1 no lo tiene: es anterior al campo) |
| `saldo_cierre` numeric(12,2) | 🔴 **Columna nueva (`20260920120000`, aplicada). 0 filas llenas** — los 2 períodos cerrados cerraron bajo la regla vieja, y NULL dice «no hay foto», no «cerró en $0.00». La primera foto llegará con el cierre del período 3 | **0** |
| `deleted` bool DEFAULT false | Soft delete | 3 |
| `created_at` | now() | 3 |

**Reposición = `fondo_inicial − saldo_cierre`** (= lo gastado). **No hay columna de reposición**: se
deriva, y el hecho de que se repuso vive en `repuesto` / `repuesto_at`.

### `caja_gastos` — Grano: 1 renglón de gasto. Llave: `id` (uuid). FK `periodo_id`.

Soft delete: **`deleted boolean DEFAULT false` + `deleted_by` (uuid) + `deleted_at`** — el patrón
completo, el único módulo de este archivo que firma la baja de un renglón.
Medido: **93 filas · 16 borradas · 77 vivas** · `fecha` del 5-mar-2026 al 2-sep-2026.

| Columna | Para qué · quién escribe · quién lee | Llenas (no vacías / ≠ 0) |
|---|---|---|
| `periodo_id` uuid NOT NULL | FK | 93 |
| `fecha` date NOT NULL | Fecha del recibo. **No puede ser futura** (validado en POST y PATCH contra el día de Panamá) | 93 |
| `descripcion` text | *«¿En qué se gastó?»*. La lee la tabla, el Excel, la impresión **y la búsqueda global** | 93 |
| `proveedor` text | Texto libre, obligatorio. La lee la tabla, el Excel **y la búsqueda global** | 92 |
| `nro_factura` text | Opcional | 51 |
| `responsable` text DEFAULT `''` | Nombre en texto, copiado de `caja_responsables.nombre` al guardar | 92 |
| `responsable_id` uuid | 🔑 FK real al catálogo. Desde que existe es obligatorio en el POST | 90 |
| `categoria` text DEFAULT `'Varios'` | Se normaliza (`normalizeStr`: primera mayúscula, resto minúsculas) al escribir | 93 |
| `subtotal` numeric DEFAULT 0 | El monto sin impuesto. **Debe ser > 0** | 93 |
| `itbms` numeric DEFAULT 0 | Impuesto. Redondeado a 2 decimales en el servidor | **9 ≠ 0** (9,7%) |
| `total` numeric DEFAULT 0 | `subtotal + itbms`. Redondeado en el servidor | 93 |
| `nombre` text | 🔴 **DUPLICADO de `descripcion`**: el POST escribe `nombre: descripcion \|\| ""`. Solo el Excel lo lee, como respaldo (`g.descripcion \|\| g.nombre`) | 93 |
| `factura` text | 🔴 **Columna LEGACY, nadie la lee ni la escribe.** El campo vivo es `nro_factura` | **2** |
| `ruc` text | 🔴 **Columna LEGACY, nadie la lee ni la escribe** | **2** |
| `dv` text | 🔴 **Columna LEGACY, 0 filas y nadie la lee** | **0** |
| `empresa` text | 🔴 **Ninguna pantalla la escribe** — el formulario no tiene ese campo. Solo se **lee** para copiarla al JSON de `activity_logs` al borrar/restaurar. Valores: `NULL` ×71 · `"Otro / General"` ×17 · `"Fashion Shoes"` ×3 · `""` ×2 | 20 |
| `created_by` uuid | Quién lo cargó | 73 |
| `deleted` / `deleted_by` / `deleted_at` | Soft delete firmado | 93 / 14 / 14 |
| `created_at` | now() | 93 |

⚠️ **16 filas con `deleted = true` pero solo 14 con `deleted_by`/`deleted_at`**: dos borrados son
anteriores a que se firmara la baja.

**Categorías realmente usadas** (gastos vivos): Alimentación 47 · Otros 18 · Transporte 10 ·
Materiales 2. **`caja_categorias` tiene 6 filas** — o sea **2 categorías definidas que nadie usa**.

### `caja_categorias` — Grano: 1 fila por categoría. **6 filas.**
Columnas: `id`, `nombre` (NOT NULL), `created_at`. **Sin soft delete y sin `activo`**: el DELETE es
real, y por eso la ruta cuenta primero cuántos gastos vivos la usan y devuelve 400 con
*«La categoría "X" está en uso en N gastos activos. No se puede eliminar.»*

### `caja_responsables` — Grano: 1 fila por persona. **8 filas, las 8 activas.**
Columnas: `id`, `nombre` (NOT NULL), `activo` (DEFAULT true), `created_at`. Sin `deleted` — usa
`activo`. El GET solo devuelve los activos.

## De dónde vienen los datos

**Todo lo escribe la gente, desde la pantalla.** Caja Menuda no tiene ningún cron, ningún sync, ningún
endpoint de Switch y ningún archivo que subir. Es el módulo más autocontenido de los cinco.

Lo único externo es la lectura de **`fg_users`** (por `id`) para poner el nombre de quien borró un
gasto en el modal de eliminados. Si esa lectura falla, el modal muestra `deleted_by_name = null` y
nada más.

## Las reglas que ya están fijadas

1. 🔴 **El cierre NO exige saldo 0.** Cierra con lo que quede, negativo incluido, y lo dice en
   palabras. Candado: `src/__tests__/api/caja-cierre-con-saldo.test.ts` (7).
2. 🔴 **Cerrar encadena cerrar + abrir en una sola acción**, y el período nuevo sale por
   `abrirPeriodo` — el **único** camino de creación, compartido con «+ Nuevo período». Candado:
   `caja-cierre-con-saldo.test.ts`.
3. **El cierre reintenta sin `saldo_cierre` si la columna no existe.** El código funciona con la DDL
   corrida o sin correr (`src/app/api/caja/periodos/[id]/route.ts`).
4. 🔴 **El proveedor sigue siendo texto libre, SIN lista.** Daniel, textual: *«no»*. Candado
   explícito en `src/__tests__/components/caja-formulario.test.tsx` (5).
5. **«Guardar y nuevo» conserva la fecha, la categoría y el responsable.** Candado:
   `caja-formulario.test.tsx`.
6. **El ITBMS arranca plegado** y la cuenta no cambia (`total = subtotal + itbms`, plegado = 0).
   Candado: `caja-formulario.test.tsx`.
7. **El respaldo de categoría es UNO: `"Varios"`** — servidor y cliente dicen lo mismo (antes el
   cliente decía «Otros»).
8. **La fecha de un gasto no puede ser futura**, en el POST **y** en el PATCH, con el día de Panamá
   calculado como `now() − 5 h`.
9. **No se agregan, editan ni restauran gastos de un período cerrado**, ni de un período borrado.
   Verificado en el servidor en las tres rutas.
10. **El GET de un período borrado contesta 404** (*«Este período ya no existe.»*), no 200 con datos.
11. **El PATCH de gasto solo acepta columnas REALES** (`ALLOWED_FIELDS`, con `nro_factura` adentro).
    🩸 Antes aceptaba `metodo_pago` y `numero_factura`, que no existen: corregir el N° de factura
    desde la tabla **nunca guardaba nada y no avisaba**.
12. **El responsable se valida contra el catálogo** (existe y está activo) y su **nombre se copia**
    del catálogo, no del body.
13. **Solo el dueño (`isOwner`) crea o borra categorías**, y no se puede borrar una categoría en uso.
14. **Borrar un período es solo de admin.**
15. **Los Excel empiezan en la fila 1** y salen por `workbookBuffer`. Candado:
    `src/__tests__/excel-exports-operacion.test.ts`.
16. **La 💡 sugerencia «cerrar período +30 días» se retiró**: el criterio es la plata, no los días.

Cobertura de mutación: **8 de 8 cazadas** (`scripts/_mutar-candados-caja.sh`).

## Con qué conecta

### Qué LEE de otros módulos
- **`fg_users`** — solo para el nombre de quien borró un gasto (modal «Gastos eliminados»).
- Nada más. Ni clientes, ni Switch, ni empresas.

### Quién LEE lo suyo
| Quién | Qué lee | Archivo |
|---|---|---|
| **Búsqueda global** | `caja_gastos` por `descripcion` o `proveedor`. Es uno de los 8 módulos de la búsqueda | `src/app/api/search/route.ts` |
| **Cron `backup`** | Copia las 4 tablas | `src/app/api/cron/backup/route.ts` |
| **`activity_logs`** | Registra update, delete, restore, cierre y reposición — **pero NO el alta** | — |

🔴 **Caja Menuda NO alimenta ningún número del negocio.** No suma en Gastos
(`gastos-contabilidad`, que es Egresos Varios y fuente ÚNICA desde el 13-ago-2026), ni en Vista
General, ni en Ventas, ni en Telegram. Es un registro de control interno, cerrado sobre sí mismo. Es
la conexión más importante del módulo justamente **porque no existe**: quien busque «cuánto gastó la
empresa» no debe mirar aquí.

### Qué se rompería si cambiara la forma de sus datos
- **Renombrar `caja_gastos.descripcion` o `proveedor`** rompe la búsqueda global
  (`src/app/api/search/route.ts`).
- **Quitar `caja_gastos.nombre`** rompe el respaldo del Excel (`g.descripcion || g.nombre`), que hoy
  no se llega a usar porque `descripcion` está llena en las 93 filas.
- **Quitar `saldo_cierre`** no rompe nada: el cierre reintenta sin ella.
- **Poner `numero` sin UNIQUE** rompe `abrirPeriodo`, que asume que el máximo es único.

## Por qué está así

| Fecha | Decisión | Cita |
|---|---|---|
| 4-sep-2026 | 🔴 El cierre no exige saldo 0 | *«cierro cuando queda poca plata (criterio de la secretaria) y le doy la diferencia para llegar a los 200»* |
| 4-sep-2026 | El proveedor sigue siendo texto libre, sin lista de sugerencias | *«no»* (respuesta a la propuesta de una lista) |
| Sin fecha registrada | El fondo es $200 y se repone hasta $200 | Está en el `DEFAULT` de la columna y en el modal; los 3 períodos históricos son de $200 |

Las otras decisiones del 4-sep (la fecha que se conserva, el ITBMS plegado) salieron de la auditoría
de eficiencia y las aprobó Daniel en bloque, sin cita individual: la razón medida está escrita en el
código (*«el ITBMS arranca plegado: solo 9 de 77 gastos vivos lo tienen»*, `GastoForm.tsx:367`).

## Lo que se intentó y se retiró

| Qué | Por qué se quitó | Cuándo |
|---|---|---|
| **La regla de cerrar solo con saldo $0.00** | Forzaba los datos. Medido: los 2 períodos cerrados dan **$200.00 clavados**, y hay gastos de **$0.05 y $0.87 creados y borrados el día del cierre** solo para cuadrar | 4-sep-2026 |
| **La 💡 sugerencia «cerrar período +30 días»** | El criterio es la plata, no los días | 4-sep-2026 |
| **La confirmación al restaurar un gasto** | Restaurar no tiene consecuencia. La de eliminar se queda | 4-sep-2026 |
| **`metodo_pago` y `numero_factura` en el PATCH de un gasto** | Son columnas que **no existen** → daban 500. 🩸 El editar en línea mandaba `numero_factura` y **el filtro lo tiraba en silencio**: corregir el N° de factura desde la tabla nunca guardaba nada | 4-sep-2026 |
| **El respaldo de categoría «Otros» en el cliente** | El servidor siempre dijo `"Varios"`. Ahora hay UNO solo | 4-sep-2026 |
| **`/caja/[periodoId]/nuevo` como página de alta con deep-links** | Nadie genera esos links. **NO se borró**: se conserva con la nota en su cabecera | 4-sep-2026 (anotada, no retirada) |

## Cuánto se usa

**Es un módulo de una sola persona y de poco volumen.**

**Gastos vivos por mes** (por `fecha` del recibo, no por carga):

| Mes | Gastos | Monto |
|---|---|---|
| mar-2026 | 12 | $83,10 |
| abr-2026 | 13 | $116,90 |
| may-2026 | 5 | $66,00 |
| jun-2026 | 8 | $59,25 |
| jul-2026 | **26** | $166,56 |
| ago-2026 | 11 | $57,09 |
| sep-2026 (al día 2) | 2 | $14,38 |

Promedio: **~13 gastos al mes, ~$80**. El pico de julio (26 recibos) es la «tanda» que motivó
conservar la fecha en «Guardar y nuevo».

**Quién:** el `responsable` de los 93 gastos es **Angela** en las tres grafías. En `activity_logs`
(39 filas del 17-abr al 2-sep-2026): `caja_gasto_update` 20 · `caja_gasto_delete` 16 ·
`caja_periodo_close` 2 · `caja_gasto_restore_manual` 1.

**Períodos:** **3 en 5 meses y medio** — el 1 duró del 25-mar al 8-jul (105 días), el 2 del 8-jul al
2-sep (56 días), el 3 abrió el 2-sep y sigue abierto.

**Última actividad:** 2-sep-2026 18:25 UTC (un borrado de gasto). El último gasto cargado es del
2-sep-2026.

**Lo que NO se puede medir:** el **alta** de un gasto no se registra en `activity_logs` (no llama a
`logActivity`), así que no hay traza de a qué hora se cargan. Lo que sí hay es `caja_gastos.fecha` (el
día del recibo) y `created_at` (cuándo se tecleó) — la diferencia entre las dos es lo que mide la
«tanda».

## Qué papeles y Excel produce

### 1 · La hoja del período para imprimir

- **De dónde sale:** botón **«Imprimir»** en la fila de la lista o en la cabecera del detalle →
  `/caja/[periodoId]/imprimir` (`PrintView.tsx`).
- **Quién la recibe:** **contabilidad**, para archivar con los recibos pegados.
- **Qué lleva:** la cabecera del período (número, apertura, fondo) y la tabla de gastos.

### 2 · El Excel del período

- **De dónde sale:** botón **«Exportar Excel»** en la cabecera del detalle →
  `POST /api/caja/export-excel` (`src/lib/exports/caja-excel.ts`).
- **Quién lo recibe:** contabilidad y Daniel. No sale para afuera.
- **Nombre del archivo:** `CajaMenuda-Periodo<N>-<fecha>.xlsx`.
- **Columnas:** **Fecha · Descripción · Proveedor · Categoría · N° Factura · Sub-total · ITBMS ·
  Total**. Fila de totales al pie; el saldo se pinta **verde (`15803D`)** si es positivo y **rojo
  (`DC2626`)** si es negativo. Moneda `$#,##0.00` como números reales, no texto.
- Empieza en la **fila 1**, con filtro desde A1 y encabezados fijos.
- ⚠️ El Excel muestra **`responsable` (texto)**, no el nombre del catálogo — por eso arrastra las tres
  grafías de Angela.

**Caja Menuda no manda ningún correo ni ningún Telegram.** No hay nada que salga del módulo hacia
afuera de la oficina.

## Cómo probarlo a mano

**A · Cargar un gasto**
1. Entra a **Caja Menuda** y abre el período **abierto** (dice ABIERTO en la lista).
2. Toca **«+ Nuevo gasto»**.
3. Llena Fecha, Descripción, Proveedor, Responsable, Categoría y Sub-total.
4. Toca **«＋ Agregar ITBMS»** solo si el recibo lo tiene. Confirma que el **Total** se recalcula solo.
5. Toca **«Guardar y nuevo»**.
6. **Confirma que la Fecha, la Categoría y el Responsable siguen puestos** — eso es lo que se arregló
   el 4-sep. Descripción, proveedor y montos quedan en blanco.
7. **Dónde mirar que quedó:** cierra el cajón. El gasto aparece en la tabla y las cifras de arriba
   (Gastado, Saldo) cambian.

**B · Corregir el N° de factura desde la tabla**
1. En la tabla, toca el renglón para editarlo en línea.
2. Cambia el **N° de factura** y guarda.
3. **Confirma que quedó**: recarga la página. Antes del 4-sep esto **no guardaba nada y no avisaba**.

**C · Borrar y restaurar**
1. Borra un gasto. Pide confirmación con el resumen completo.
2. Abre **«Gastos eliminados»** en la cabecera: debe estar ahí, con quién lo borró y cuándo.
3. Toca **Restaurar** — **no pide confirmación**, y vuelve a la tabla.

**D · Cerrar el período** ⚠️ (esto abre uno nuevo, hazlo solo cuando toque de verdad)
1. Toca **«Cerrar período»**.
2. **Confirma que el modal muestra las cuatro filas:** Fondo · Gastado (N recibos) · Queda en caja ·
   Reposición para volver a $200.
3. Si «Queda en caja» es negativo, debe salir **en rojo** con *«Se gastó más que el fondo.»* — y el
   botón **igual debe funcionar**.
4. Toca **«Cerrar y abrir el N»**.
5. **Dónde mirar que quedó:** en `/caja` el período viejo dice *cerrado* con su fecha de cierre, y
   arriba hay uno nuevo con fondo $200 en estado *abierto*.

## Qué lo rompe

**Caja Menuda no toca Switch.** Ningún endpoint, ningún reporte, ningún cron, ningún archivo que
subir. Eso lo hace el módulo **menos frágil** de este archivo: nada de lo que Switch cambie puede
romperlo.

| Falla | Qué pasa | Cómo se notaría |
|---|---|---|
| **La migración `20260920120000` no estuviera aplicada** | El cierre **reintenta sin `saldo_cierre`** y funciona igual, solo que sin la foto del saldo | Nada visible. ✅ Hoy **sí está aplicada** (verificado el 4-sep-2026) — la nota de `docs/estado-actual.md` que la da por pendiente quedó vieja |
| **`caja_responsables` llega vacía** | El POST rechaza todo gasto con *«Responsable inválido o inactivo.»* — **no se puede cargar nada** | La pantalla lo dice al guardar |
| **`caja_categorias` llega vacía** | El desplegable queda vacío; el servidor cae al respaldo `"Varios"` | El desplegable vacío |
| **`fg_users` no responde** | El modal de eliminados muestra `deleted_by_name = null` | Se ve «—» en la columna «Borrado por» |
| **Se borra la fila UNIQUE de `numero`** | `abrirPeriodo` calcularía mal el siguiente correlativo | Un período repetido en la lista |
| **Alguien inserta un período fuera de la app con `estado` raro** | La columna **no tiene CHECK**: la pantalla lo trataría como cerrado (`estado !== 'abierto'` cierra la edición) | El período aparece pero no deja agregar gastos |
| **`db-max-rows` (1000)** | Ninguna consulta del módulo pagina — pero con **93 gastos y 3 períodos** está a dos órdenes de magnitud del corte | No se notaría hasta llegar a 1.000 gastos en un período |

🔴 **El riesgo real de este módulo no es técnico: es que nadie lo mire.** Es un registro de control
interno sin alertas, sin cron y sin nadie que lea sus números fuera de la oficina. Un período que
quede abierto meses no dispara nada — la 💡 de «+30 días» se retiró el 4-sep a propósito.

## Lo que sobra o no cuadra

1. 🔴 **Tres columnas LEGACY en `caja_gastos` que nadie lee ni escribe:** `ruc` (2 filas), `dv`
   (**0 filas**) y `factura` (2 filas). El campo vivo es `nro_factura`.
2. 🔴 **`nombre` es un duplicado literal de `descripcion`** — el POST escribe las dos con el mismo
   valor. Solo el Excel lo menciona, como respaldo.
3. 🔴 **`empresa` es una columna que ninguna pantalla escribe.** El formulario no tiene el campo;
   solo se lee para copiarla al JSON del `activity_logs` de borrar/restaurar. 20 filas la tienen
   (`"Otro / General"` ×17, `"Fashion Shoes"` ×3, `""` ×2) — restos de una versión anterior.
4. 🔴 **«Aprobar reposición» nunca se ha usado:** `repuesto` en `false` en los 3 períodos,
   `repuesto_at` con **0 filas**. El botón existe en la cabecera del detalle y su endpoint
   (`PATCH … {action:"repuesto"}`) funciona.
5. 🔴 **`saldo_cierre` está aplicada y vacía.** La migración corrió el 4-sep; los 2 períodos cerrados
   quedan en NULL a propósito.
6. 🩸 **Los datos de los cierres viejos están forzados.** Los 2 períodos cerrados dan **$200.00
   clavados**, y hay gastos de **$0.05 y $0.87 creados y borrados el día del cierre** para cuadrar el
   saldo 0 que la regla vieja exigía. Ese es el hecho que motivó el cambio del 4-sep.
7. 🔴 **`responsable` (texto) está sucio: la misma persona escrita de tres formas** — `Angela Garcia`
   ×59 · `Angela garcia` ×17 · `Angela garciia` ×1. Es exactamente el problema que `responsable_id`
   (90/93 filas) vino a resolver, pero **el texto viejo no se limpió** y el Excel, la impresión y el
   modal de eliminados muestran `responsable`, no el nombre del catálogo.
8. **`caja_responsables` tiene 8 filas activas y solo 1 se usa.** Las otras 7 nunca aparecen en un
   gasto.
9. **`caja_categorias` tiene 6 filas y solo 4 se usan** en gastos vivos.
10. 🔴 **`/caja/[periodoId]/nuevo` es una ruta huérfana** (410 líneas): nada la enlaza, no tiene
    smart defaults y al guardar navega a una URL legacy. Conservada a propósito, con la nota en su
    cabecera.
11. **`AvisoSaldoNegativo.tsx` solo lo usa la ruta huérfana** — no aparece en el detalle real. Su
    comentario apuntaba a un deep-link que ya no existe (corregido en `4801d4ef`).
12. **El alta de un gasto no se registra en `activity_logs`**: hay 93 gastos y ni una acción
    `caja_gasto_create`. Se registran el update, el delete, el restore y el cierre, pero no el alta —
    así que el log no puede reconstruir quién cargó qué (eso solo vive en `created_by`).
13. **`caja_periodos.estado` no tiene CHECK constraint.** Los valores `abierto`/`cerrado` son
    convención de código, igual que en `guia_transporte.estado`.
14. **Dos mecanismos para el mismo «hoy de Panamá»** dentro del módulo: las rutas de gastos calculan
    `new Date(Date.now() - 5*3600*1000)` a mano, mientras el resto del sistema usa `hoyPanama()` de
    `src/lib/fecha-panama.ts`. Dan lo mismo, pero son dos.
15. **La lista de categorías se puede borrar de verdad (`DELETE` real)**, a diferencia de casi todo
    el resto del sistema. Lo protege el conteo de uso, no un soft delete.

---
