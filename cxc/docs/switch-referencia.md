# Switch Soft — referencia oficial cruzada con el código

**Para consultar, no para leer de corrido.** Cada afirmación lleva la página del PDF de donde sale. Lo que la doc no dice, se dice que no lo dice.

Fuentes (14 PDF que Switch le entregó a Daniel, 3-sep-2026):

- **`API Documentación.pdf`** — «API - Switch, Documento Versión 1.0», 74 páginas, 52 métodos (§5.1 a §5.52; el índice salta el §5.36 y el §5.53 está vacío, p. 3, 49 y 74). Los ejemplos son de **2019-2020** (p. 14, 17, 23). ⚠️ **No está versionado en el repo**: `docs/switch-panel.md:8` y `src/lib/switch-api/client.ts:574` apuntan a `docs/api-switch.pdf`, que no existe. Vive en `~/Downloads/API Documentación.pdf`.
- **Las 13 guías de usuario** — versionadas en `docs/switch/`. Su resumen completo, sección por sección, ya está en [`docs/switch-panel.md`](switch-panel.md) (§8-§23). **Aquí no se repite**: se extrae solo lo que explica un comportamiento que el sistema ve.

Cómo se cita: `p. N` = página del PDF del API salvo que se nombre otra guía. Del lado nuestro, `archivo:línea` relativo a `cxc/`.

Convenciones del API (p. 4-6):

- Todo responde `{ "data": {...} }` con HTTP 200; los errores `{ "error": { code, http_code, message } }` con otro código (p. 4). ⚠️ Medido: varios endpoints responden **200 con HTML de excepción** (`client.ts:1001-1003`, `client.ts:602-606`); en este conector un endpoint se valida por la **forma** de la respuesta, no por el status.
- Token: `POST /autenticacion` → `expires_in` **en minutos** (p. 5: *«te informa en cuantos minutos expirará el token»*, ejemplo `60`). Header `Authorization: <token>` — la prosa dice «(Bearer)» pero el ejemplo va **sin prefijo** (p. 5); medido: sin prefijo (`client.ts:9-10`).
- Token vencido hace menos de 15 min → 401 code `0005` **con `new_token`** adentro (p. 6). Implementado en `client.ts:266-300` (`extractNewToken`).
- 🔴 **«Solo habrá un token válido a la vez por usuario»** (p. 6, textual). Un segundo login invalida el primero → code `0006` TOKEN INVALIDO. Es la «sesión única» que el sistema descubrió a los golpes. Ver Parte 3, #1.
- `porPagina`: *«por defecto 50, máximo 50»* en TODAS las listas (p. 12, 13, 21, 29, 31, 39, 40, 43, 47, 58, 61, 65, 67, 69, 72). Ver Parte 3, #6.
- Fechas de entrada `YYYY-MM-DD` (p. 17, 19, 43…). Fechas de salida: **mezcla** — `DD-MM-YYYY` en totalventas (p. 14), diarioventas (p. 17) y estadocuenta (p. 23); sin formato declarado en facturas/pedidos/cotizaciones (p. 43, 48, 59).

---

## Parte 1 — El API, endpoint por endpoint

Columna «¿Lo usamos?» = archivo que lo llama en producción. «Descartamos» = campos que la doc dice que vienen y el código no guarda.

### 1.1 Sesión y sistema

| Endpoint (§, pág.) | Qué devuelve / parámetros | ¿Lo usamos? | Descartamos · notas |
|---|---|---|---|
| `POST /autenticacion` (§5.1, p. 7) | `token, sucursalId, codigoPais, expires_in, expires_at` | Sí — `client.ts:336-374` | Guardamos solo `token`. El API real manda además `vendedorId, usuarioId, terminalCodigo, sucursalCodigo…` (`types.ts:27-42`), **no documentados**. |
| `POST /cierresesion` (§5.2, p. 8) | cierra el token | Sí — `client.ts:1057-1067` (`logoutAllSwitchSessions`, en el `finally` de cada cron) | Es lo que libera la sesión única (p. 6). |
| `GET /validar` (§5.3, p. 8) | «si la URL tiene activo API» — **sin token** | No | 🔑 Única llamada que no consume la sesión única: serviría de sonda de «¿Switch está vivo?» sin tumbar a nadie. |
| `GET /empresainfo` (§5.4, p. 8) | «JSON con la información de la empresa» (no detalla campos) | No | — |
| `POST /apipassword` (§5.5, p. 9) | manda correo de recuperación | No | Nunca. |
| `GET /parametro?codigo=` (§5.6, p. 10) | **el valor de un parámetro de sistema** | No | 🔑 Permite LEER los 12 parámetros de `Parametro de Sistema.pdf` (0072 control de comprobantes, 0099 FOB, 0098 morosidad, 0120…). Ver Parte 3, #4. |
| `POST /apipermiso` (§5.7, p. 11) | `permiso: TRUE/FALSE`. `proceso`: 0001 cambiar precio · 0002 descuento · 0003 eliminar artículo · 0004 aprobar cierre de caja. `pin` opcional; `monto` **obligatorio** para 0002 (es el % de descuento) | Sí — `client.ts:1380-1388` desde `lib/catalogo/permiso-precio.ts` (solo 0001) | Si algún día se manda `descuento` por línea, hay que pasar `monto`. |

### 1.2 Reportes de ventas

| Endpoint (§, pág.) | Qué devuelve / parámetros | ¿Lo usamos? | Descartamos · notas |
|---|---|---|---|
| `GET /apireporte/totalventas?tipo=` (§5.10, p. 14-16) | `01` hoy · `02` ayer · `03` mes en curso por día · `04` **año en curso por mes** (`etiqueta: "Ene"…`). Cada renglón: `total, costo, utilidad`. Sin parámetro de fecha. | Sí, solo `tipo=03` — `client.ts:1193-1200` → `switch_costo_diario` (`sync-empresa.ts:1100-1150`) | No usamos `04`: da costo y utilidad **por mes del año en curso** — un cuadre gratis del rollup mensual. Confirma que no hay forma de pedir un mes pasado por aquí (`types.ts:196-199`). |
| `GET /apireporte/diarioventas` (§5.11, p. 17-18) | `sucursalId, desde, hasta` obligatorios. Devuelve `totalVentas, totalNotasCredito, totalDescuentos, granTotal, totalProductos, formasDePago[]` | Sí — `app/api/multifashion/caja/route.ts:90` (cierre de caja ACS) | ⚠️ El ejemplo de la doc usa `desde = hasta` el mismo día y devuelve datos (p. 17); medido: **`hasta` es exclusivo** y con `desde=hasta` responde ceros (`client.ts:661-663`). Manda lo medido. |
| `GET /apireporte/ventasucursal` (§5.47, p. 65-66) | `sucursalId, fecha` (UN día), paginado. Por artículo: `tipo, totalcomprobantes` («Total de Facturas y Notas de créditos»), `ventatotal, costototal` | Sí — `sync-articulos.ts:127` → `switch_articulo_diario` (la tabla más grande, 203 K filas) | La doc no menciona `cantidadtotal`, que el código sí lee (`client.ts:882`). Confirma que **no hay id de fila** (p. 66) → el grano es (empresa, fecha, artículo, tipo). |
| `GET /apireporte/transferenciasucursal` (§5.48, p. 67-68) | transferencias de artículos entre sucursales, por día | No | Todas las empresas tienen una sola sucursal (`sync-articulos.ts:25`), así que no aplica. |

### 1.3 Clientes y cartera (CXC)

| Endpoint (§, pág.) | Qué devuelve / parámetros | ¿Lo usamos? | Descartamos · notas |
|---|---|---|---|
| `GET /apicliente/lista` (§5.14, p. 21-22) | `filtro` opcional. Por cliente: `id, nombre, codigo, razonsocial, clienteImpuesto, clienteImpuestoCodigo` | Sí — `sync-empresa.ts:840-847` → `switch_clientes`; `sync-utilidad.ts:61`; `sync-recibos.ts:205`; `sync-acs-fidelizacion.ts:46` | Descartamos `clienteImpuesto` / `clienteImpuestoCodigo` (deciden el impuesto de un pedido, p. 51). 🔴 Dependemos de campos **que la doc NO lista**: `vendedor`/`vendedorId` (la cartera que atribuye comisiones, `sync-utilidad.ts:64`), `email, telefono, celular, identificacion, dv` (`types.ts:77-91`). |
| `GET /apicliente/estadocuenta?clienteId=` (§5.15, p. 22-24) | `estadocuenta.elements[]` (`ccteId, secuencial, numeroFiscal, plazoCredito, total, saldo, tipoComprobante, abrev, tiporecibo, fechaCreacion DD-MM-YYYY, dias, saldoConsecutivo, debito, credito`) **+ `Saldos[]` (aging `0-30`…) + `saldoTotal`** | Sí — `sync-empresa.ts:640-671` → `switch_estadocuenta` | 🔑 **Descartamos `Saldos[]` y `saldoTotal`**: el aging que Switch ya calcula. Nosotros lo recalculamos en `switch_estadocuenta_aging`; los buckets de Switch serían un cuadre gratis (el equivalente de proveedores SÍ se guarda, `client.ts:847-853`). Es **uno por cliente** — por eso Boston (4.912 clientes) va por reporte web (`CLAUDE.md:426`). |
| `GET /apicliente/info` (§5.16, p. 24) | ficha de un cliente (mismos 6 campos de la lista) | No | Nada que la lista no dé. |
| `GET /apicliente/impuestos` · `/tiposcliente` · `/tiposidentificacion` (§5.17-5.19, p. 25-27) | catálogos para crear clientes | No | Solo sirven para `POST /apicliente/crear`. |
| `POST /apicliente/crear` (§5.20, p. 27-29) | crea cliente. **`codigo` obligatorio, `[a-zA-Z0-9\-]`, lo escribe quien crea** | No | Es la prueba de que el `D-24` es una convención humana, no un formato de Switch. Ver Parte 2 y Parte 3, #10. |
| `GET /apivendedor/lista` (§5.21, p. 29-30) | `id, nombre` | Sí — `lib/catalogo/vendedor-switch.ts:250`, `sync-utilidad.ts:235` | El API real agrega `codigo, negocio, categoria` (`types.ts:62-68`). |
| `GET /apicobranza/cliente?clienteId=` (§5.43, p. 61-62) | «facturas, tiquetes y notas de débito **con saldo pendiente**» de un cliente: `id, secuencial, fecha, total, saldo, comprobante, urlswitchpay` | No | Es el estado de cuenta «solo lo abierto», también uno por cliente. No resuelve Boston. |
| `POST /apicobranza/cliente` (§5.44, p. 62-63) | **registra un cobro** contra un comprobante | No | Escritura. El sistema no cobra en Switch. |
| `POST /apicobranza/switchpay` · `/apicobranzapedido/switchpay` (§5.45-5.46, p. 63-65) | manda por correo el link de pago SwitchPay | No | Retail/ACS. |

### 1.4 Artículos y stock

| Endpoint (§, pág.) | Qué devuelve / parámetros | ¿Lo usamos? | Descartamos · notas |
|---|---|---|---|
| `GET /apiarticulos/lista` (§5.22, p. 30-32) | Filtros: `filtro`, **`rubroId`** (de `/apirubro/lista`), `proveedorId`, **`clienteId`** («precio específico para un cliente»), `sucursalId`, **`estatus` Activo/Inactivo**, `comprobante` FACTURA/PEDIDO («verifica si hay control de inventario»). Campos: `id, codigo, descripcion, codigoBarra, codigoBarraId, costo, disponible, precio, listaPrecioId, unidadmedidaId, unidadmedida, proveedorId, proveedor` | Sí — `sync-catalogo.ts:560`, `sync-articulo-info.ts:406`, `sync-articulo-marca.ts:245`, `switch-envio.ts:242` (`filtro=SKU`) | Descartamos `listaPrecioId` (qué lista se aplicó) y `unidadmedida`. Dependemos de campos no documentados: `marcaId, talla, color, cantidadPorCaja` (`client.ts:723-752`). La doc **confirma** que no trae `rubro`/`subrubro`/`marca` (medido en `sync-articulo-info.ts:72-78`), **pero acepta `rubroId`** → Parte 3, #2. Solo usamos `filtro`; nunca `clienteId` (→ Parte 3, #4), `estatus` ni `comprobante`. Solo trae `disponible`, no `saldo` (p. 31) → Parte 3, #9. |
| `GET /apiarticulos/info?codigoBarra=` (§5.23, p. 32-34) | por **código de barra**, de a uno. `clienteId`/`sucursalId` opcionales para el precio. Campos: `…, imagen, tipoArticulo, rubroId, rubro, subrubroId, subrubro, marcaId, marca, articuloImpuesto, articuloImpuestoCodigo, precio, listaPrecioId, fechacreacion` | Sí — `sync-articulo-info.ts:457+` (fichas, solo `active_shoes`), `sync-articulo-marca.ts` | Guardamos `marca, rubro, subrubro` (`client.ts:756-782`); descartamos `imagen` (URL de la foto en Switch — el catálogo público usa fotos propias), `fechacreacion`, `articuloImpuesto`, `tipoArticulo`. Doc: 4 llaves + ~20 campos; medido: ~29. |
| `GET /apiarticulos/buscar?buscar=` (§5.24, p. 35) | «el primer artículo que coincida el código **o** código de barra» — 7 campos | No | Para resolver un SKU es UNA llamada sin paginar; hoy `switch-envio.ts:242` hace `/lista?filtro=SKU` y busca `codigo === sku` en la página. Equivalente; sin ventaja clara. |
| `GET /apiarticulos/stock?articuloId=` (§5.25, p. 36) | por sucursal: `saldo` (existencia física), `disponible`, `costo`, **`costopromedio`** | Sí — `sync-catalogo.ts:683-698`, `lib/catalogos/disponible.ts` | Descartamos `costopromedio` (el mismo «COSTO PROMEDIO» del reporte web de ingresos). Confirma: no hay bulk ni fecha (p. 36) — «inventario a fecha» no existe en el API. |
| `GET /apiarticulos/precios?articuloId=` (§5.26, p. 37) | **todas las listas de precios** de un artículo: `listaPrecioId, nombre, precio` | No | 🔑 Es la forma de saber si un SKU tiene precio distinto por lista antes de mandar un pedido. Ver Parte 3, #4. |
| `GET /apiarticulos/tallacolor?articuloId=` (§5.27, p. 38) | por talla/color × sucursal: `codigoBarraId, codigoBarra, color, talla, saldo, disponible` | Sí — `switch-envio.ts`, `lib/tommy-bulto.ts`, `sync-catalogo.ts` | Completo. |
| `GET /apirubro/lista` · `GET /apisubrubro/lista?rubroId=` (§5.28-5.29, p. 39-41) | `id, nombre` de rubros; subrubros con su rubro | No | 🔑 Ver Parte 3, #2. |
| `POST /apiarticulos/ingresomercancia` (§5.12, p. 19) | **escribe** un ingreso (`codigoBarra, cantidad, costo, sucursalId, proveedorId, lote…`) | No | Escritura. |
| `POST /apiarticulos/ajusteinventario` (§5.13, p. 20-21) | **escribe** un ajuste — exige `costo`, `proveedorId`, `fecha`, `hora` | No | Escritura. Dice algo útil: **un ajuste de inventario lleva costo y proveedor**, aunque no sea una compra (`ingresos-mercancia.ts:48-50`). |

### 1.5 Cotizaciones, pedidos y facturas

| Endpoint (§, pág.) | Qué devuelve / parámetros | ¿Lo usamos? | Descartamos · notas |
|---|---|---|---|
| `GET /apicotizacion/lista` (§5.31, p. 42-44) | `filtro, estatus, desde, hasta, clienteId, sucursalId`; cabeceras con totales | No | Serviría para listar cotizaciones hechas desde el panel; hoy solo leemos las nuestras por id. |
| `GET /apicotizacion/info?cotizacionId=` (§5.32, p. 45-46) | `cotizacion{…}` + `detalle[]` (`codigoBarraId, cantidad, precio, descuento, descuentoGlobal, vendedorId, articuloImpuesto…`) | Sí — `switch-envio.ts:449` (verificación post-escritura) | Completo. |
| `POST /apicotizacion/correo` · `/apipedido/correo` · `/apifactura/correo` (§5.33, 5.35, 5.42) | Switch manda el PDF por correo | No | El sistema arma y manda su propio PDF. |
| `GET /apipedido/lista` (§5.34, p. 47-48) | como cotizaciones, con `urlswitchpay` | No | Ídem. |
| `GET /apipedido/info?pedidoId=` (§5.37, p. 50-51) | cabecera + `detalle[]` | Sí — `switch-envio.ts` (verificación) | Completo. |
| `POST /apipedido/terminar` (§5.38, p. 51-53) | **Reglas de cálculo** (p. 51): descuento **por línea primero, global después** ($100 −5% = $95 −20% = $76); impuesto por línea = si `clienteImpuestoCodigo ≠ "R"` → **el menor** entre `clienteImpuesto` y `articuloImpuesto`; si es `"R"` → `articuloImpuesto`. Params: `vendedorId, clienteId, articulos[]{codigoBarraId, cantidad, precio, descuento, vendedorId?}`, `descuentoGlobal?`, **`comprobante` COTIZACION/PEDIDO + `comprobanteId`** («pedido a partir de una cotización»). Respuesta: `numeroInterno, pedidoId, clienteEmail, urlswitchpay` | Sí — `client.ts:1313-1333`, desde `lib/catalogo/switch-envio.ts` | No usamos `comprobante`/`comprobanteId`: la doc ofrece **convertir una cotización en pedido** sin reescribir las líneas. Hoy «para vender se duplica» (`CLAUDE.md:114`) — es una decisión nuestra, no un límite del API. Descartamos `urlswitchpay`. |
| `POST /apifactura/terminar` (§5.39, p. 54-56) | **factura o tiquete** (`tipoComprobante` FACTURA/TIQUETE), exige `formasPago[]` | No | Escritura fiscal. Deliberado: el sistema no factura. |
| `GET /apifactura/info?facturaId=` (§5.40, p. 56-58) | cabecera + `detalle[]` (mismas columnas que pedido) | Sí — `sync-factura-lineas.ts:15` → `switch_factura_lineas`; `sync-acs-fidelizacion.ts` | ⚠️ `types.ts:144-147` dice «shape no validado… refinemos cuando lo probemos»: la doc lo documenta y el sync ya lo consume (Parte 3, #8). La doc **no** lista `id` en la línea; el código sí lo ve en facturas y no en NC (`client.ts:571-580`). |
| `GET /apifactura/lista` (§5.41, p. 58-59) | «facturas **y tiquetes**». `filtro, estatus, desde, hasta, clienteId, sucursalId`. Campos: `id, secuencial, fecha, subTotal, descuento, subTotalDescuento, impuesto, total, saldo, cliente, clienteId, vendedor, vendedorId, sucursal, sucursalId, urlswitchpay` | Sí — `sync-empresa.ts:525` → `switch_facturas` (fuente única de ventas) | 🔴 **Dependemos de tres campos que la doc no lista**: `tipoComprobante` (el que separa Factura/Tiquete/Transacción, `sync-empresa.ts:251-271`), `condicionVenta`, `clienteEmail` (`types.ts:104-125`). Nunca usamos `estatus` (¿excluye anuladas? la doc no lo dice; en ingresos se midió que se ignora, `proveedores-derivados.ts:33-36`). `saldo` sí se guarda (`sync-empresa.ts:278`). |

### 1.6 Compras

| Endpoint (§, pág.) | Qué devuelve / parámetros | ¿Lo usamos? | Descartamos · notas |
|---|---|---|---|
| `GET /apiproveedor/lista` (§5.8, p. 12-13) | `id, nombre, ruc, direccion, contacto, telefono, celular, email, tipoproveedor` | Sí — `sync-proveedores.ts:100` | Guardamos `tipo_proveedor` (`sync-proveedores.ts:144`) — es el «tipo» que la guía de facturas de proveedores usa para separar mercancía de servicios. El API real manda `identificacion`/`dv` en vez de `ruc` (`client.ts:787-799`). |
| `GET /apiordenescompra/lista` (§5.49, p. 68-69) | `estatus` **Inactivo / Activo / Pendiente / Ingresada**, `desde, hasta, proveedorId`. Cabeceras con `estatus, total, proveedor` | No | 🔑 Es la etapa 1 del flujo de compra (guía `Flujo_articulo…pdf` p. 4). Una OC `Pendiente` = mercancía **pedida y no llegada** — el dato que «Compré» de Referencia no tiene. Y tiene el `estatus` que a los ingresos les falta. |
| `GET /apiordenescompra/info?ordencompraId=` (§5.50, p. 70-71) | cabecera + `detalle[]` (`codigoBarraId, codigoArticulo, cantidad, costo, impuesto, subtotal, total`) | No | Ídem, línea por artículo. |
| `GET /apiingresomercancia/lista` (§5.51, p. 71-73) | `estatus, desde, hasta, proveedorId, sucursalId`. Cabeceras: `id, secuencial, fecha, subTotal, impuesto, total, proveedor, proveedorId, sucursal, sucursalId` | **Evaluado y descartado** (`proveedores-derivados.ts:28-50`, 27-jul-2026): `estatus` se ignora, trae montos de billones, es bruto | La doc documenta exactamente esos 10 campos de cabecera (p. 72). El «Compré» sale del reporte web (`web-client.ts:756-790`). |
| `GET /apiingresomercancia/info?ingresomercanciaId=` (§5.52, p. 73-74) | cabecera `ingresomercancia{…}` **+ `detalle[]`** al mismo nivel: `codigoBarraId, codigobarra, articuloId, codigoArticulo, descripcion, cantidad, costo, impuesto, subtotal, total, tipoArticulo` | No | 🔴 **El código dice que no trae líneas** (`ingresos-mercancia.ts:9-15`, `web-client.ts:758-762`); la doc dice que sí. Ver Parte 3, #3. |

### 1.7 Endpoints que USAMOS y la doc NO tiene

Siete. Cualquiera puede cambiar sin aviso; la doc oficial no los respalda.

| Endpoint | Dónde | Qué se sabe |
|---|---|---|
| `GET /apireporte/recibos` | `sync-recibos.ts:347` → `switch_recibos` (46.556 filas; último pago del CXC y comisión sobre cobro) | Sin `id` ni `secuencial` de recibo (`sync-recibos.ts:4-8`) — por eso se reemplaza el mes entero. |
| `GET /apiproveedor/info` | `sync-proveedores.ts:82` → `switch_proveedor_estadocuenta` (CxP con aging) | Devuelve 200 con HTML si falla (`client.ts:602-606`). `fechaCreacion` en `YYYY-MM-DD`, al revés que el estado de cuenta de clientes (`client.ts:819-822`). |
| `GET /apinotacredito/lista` · `GET /apinotadebito/lista` | `sync-empresa.ts:535-545` → `switch_facturas` | Mismo shape que facturas sin `tipoComprobante` (`types.ts:156-163`). Las NC llegan con total **negativo**. |
| `GET /apinotacredito/info?notacreditoId=` | `sync-factura-lineas.ts:16` | Parámetro `notacreditoId` en minúscula, todo junto (`client.ts:1133-1140`). Cantidad negativa, monto positivo, línea sin `id`. |
| `POST /apicotizacion/terminar` | `switch-envio.ts:149-185` | Mismo contrato que `/apipedido/terminar`, medido campo por campo (`client.ts:991-1003`). |
| `POST /apicotizacion/crear` | referenciado en `lib/catalogo/documento-switch.ts:24` | **No existe**: devuelve la página de excepción con 200 (`client.ts:1001-1003`). |

### 1.8 Lo que la doc NO tiene y el sistema necesita (confirmado por omisión)

- **Pagos a proveedores**: ni lista ni reporte (confirma `proveedores-derivados.ts:24-26`).
- **Costo/utilidad por documento**: solo agregados (`totalventas`, `ventasucursal`); por eso `sync-utilidad.ts:4-5` va por el reporte web `/reportesventa/facturas`.
- **FOB**: `costo` es un solo valor en `/lista`, `/info` y `/stock`. El parámetro 0099 (`Parametro de Sistema.pdf` p. 5) dice que el panel maneja FOB y CIF por artículo, pero el API no expone el FOB (medido: `costo` = CIF, `sync-articulo-info.ts:9-16`).
- **Egresos varios / ingresos varios de caja**: nada de caja y bancos. Gastos sigue por scraping (`sync-egresos-varios.ts`).
- **Inventario a una fecha**: `/stock` es «ahora» (p. 36); no hay kardex por API.
- **Recibo → factura** (qué recibo pagó qué factura): el estado de cuenta muestra `debito`/`credito` por documento (p. 23) pero no el cruce; `/apireporte/recibos` no está en la doc.
- **Cartera en bloque**: el estado de cuenta es uno por cliente (p. 22). Lo más cercano en bloque es `saldo` en `/apifactura/lista` (p. 59) — abre por factura, sin NC ni anticipos a favor.

> Los cuatro candidatos que sobrevivieron la evaluación del 2-sep-2026 (recibos contra factura · renglones de Multifashion · ingresos varios · inventario a fecha) **no están escritos en el repo**. Contra esta doc: los tres primeros y el cuarto **no tienen endpoint** (ver arriba); «renglones de Multifashion» sí — es `/apifactura/info` (p. 56), excluido de `switch_factura_lineas` por decisión (29.000 llamadas para tiquetes a `TCKCTA`, `factura-lineas-parse.ts:12-19`).

---

## Parte 2 — Las guías, solo lo que explica algo que el sistema ve

El resumen completo de cada guía está en [`switch-panel.md`](switch-panel.md) §8-§23. Aquí, solo el cruce con el código.

**Códigos de clientes** — `Codigos Creacion Clientes.pdf` (3 p.) es una tabla de **tipo de cliente** (Panamá: 01 Contribuyente · 02 Consumidor Final · 03 Gobierno · 04 Extranjero, p. 1), **tipo de identificación** (1 Natural · 2 Jurídico, p. 2) e **impuesto** (Panamá: `R` Regular · `00` Exento, p. 2). **No dice nada de `D-xx` ni de `TCKCTA`.** Lo que sí dice el API: `codigo` lo escribe quien crea el cliente, obligatorio, `[a-zA-Z0-9\-]` (p. 28); `Guia Caracteres Validos.pdf` p. 3: letras sin tildes ni ñ, números y guion. O sea: **que `D-24` sea City Mall en las 6 empresas es una convención humana repetida en 6 instancias separadas** (cada empresa tiene su propia URL y su propio padrón, `client.ts:4-7`, `sync-clientes-master.ts:15-16`). Switch no la impone ni la verifica; el 138/147 medido en el commit `44be9b16` es disciplina, no sistema. El código `R`/`00` de impuesto es el `clienteImpuestoCodigo` que descartamos (p. 22) y que decide el impuesto del pedido (p. 51).

**Caracteres válidos** — `Guia Caracteres Validos.pdf`. Cliente › Nombre: letras **y ñ pero SIN tildes**, números y `, ; ( ) $ @ * = # & ! / _ . -` (p. 3). Artículo › Descripción sí admite tildes (p. 1); Código de artículo **sin espacios ni tildes**, solo `- / _ . ( ) + *` (p. 1); Código de barra: letras, números y guion (p. 1). **La guía no cubre longitudes máximas**: «VENTAS LOCA» en Fashion Shoes (`docs/postmortems/crons-alertas.md:469`) no se explica por esta guía — es un nombre tal como lo escribieron en ESA instancia, igual que «CONTADO» y «VENTAS» en las otras. Los nombres que difieren por empresa son la misma causa: seis padrones tecleados por separado.

**Notas de crédito** — `GUIA_NOTA_DE_CREDITO_SWITCHREGULAR.pdf`. Una NC «solo permite referencias a facturas» y tiene un campo **Referencia** libre para «detallar el documento referenciado o agregar un comentario» (p. 1). Se busca la factura por número fiscal o de sistema y **«puede agregar más de una factura»** (p. 2). Dos formas: devolución de dinero (mismo método de pago) o **saldo a favor** (método Crédito, p. 1, 3). Para el sistema: (a) el vínculo NC → factura es **1:N**, no 1:1; (b) el API **no lo expone**: ni `/apinotacredito/lista` ni `/info` están documentados (§1.7) y la doc no tiene ningún campo «factura referenciada» — el descarte de las 651 NC de ACS «porque su renglón referencia otro documento» no tiene respaldo ni desmentido en estos PDF; (c) una NC «saldo a favor» aparece en el estado de cuenta como crédito abierto del cliente (guía p. 1) — es un renglón de `switch_estadocuenta` con `credito > 0`.

**Niveles de autorización** — `Manual de Niveles de Autorización.pdf`. 8 acciones con nivel 1-5 (1 = más restrictivo, p. 1): cambiar precio, bonificación, eliminar artículo, aprobar cierre de caja, aprobar venta a crédito, certificado de regalo, **cambio de lista de precio**, reimpresión (p. 2-4). El API refleja los cuatro primeros en `/apipermiso` (p. 11). Lo que puede romper un envío: si el usuario del API no tiene nivel para **cambiar precio** (acción 1) y el pedido va con precio ≠ lista, Switch lo rechaza — ya está manejado (`switch-envio.ts:322-331`, `permiso-precio.ts`). **Aprobar venta a crédito** (acción 5, p. 3) aplica a facturar, no a pedidos; la doc del API no dice si `/apipedido/terminar` la evalúa.

**Parámetros de sistema** — `Parametro de Sistema.pdf` (12 parámetros, p. 1). Los que le importan al sync:
- **0072 Control de comprobantes** (p. 4): ACTIVO → al convertir cotización → pedido → factura «el sistema **restablece automáticamente los precios originales** del artículo, descartando modificaciones previas». 🔴 Si está activo, el precio que manda el pedido (`switch-envio.ts:351-357`) **se pierde al facturar**. Se lee con `GET /parametro?codigo=0072` (p. 10). Ver Parte 3, #4.
- **0099 Costo FOB** (p. 5): ACTIVO → el artículo tiene «Costo FOB» y «Costo CIF» y el ingreso de mercancía abre «Otros Costos» (transporte, arancel, impuesto). Explica por qué el reporte web trae FOB y CIF separados (`ingresos-mercancia.ts:36-42`) y el API un solo `costo`.
- **0098 Control de morosidad** (p. 4): ACTIVO → factura bloqueada con PIN si el cliente supera el límite. La doc del API no dice si afecta a `/apipedido/terminar`.
- **0120 Nueva cotización al actualizar** (p. 8): ACTIVO → editar una cotización en el panel **crea otra con número nuevo** y conserva la original. Afecta lo que `/apicotizacion/info` devuelve para un id nuestro después de que alguien la edite en el panel.
- **0124 Nombre comercial en facturador** (p. 9): solo cambia qué nombre muestra el facturador (`nombre` vs `razonsocial`); «no afecta reportes ni otros módulos». No explica diferencias de nombre en el API.
- **0151 Nueva orden de compra al actualizar** (p. 10): mismo mecanismo que 0120 para OC — una OC editada puede ser dos ids.
- **Ninguno controla formato de fecha, separador decimal ni lista de precios por defecto**: la guía no los cubre. El cambio de formato del CSV de egresos del 1-sep no sale de estos 12 parámetros.

**Listas de precios** — `Guia_lista_precios_SwitchSoft.pdf`. Varias listas por artículo; a un cliente se le asigna una y «cada vez que ese cliente sea llamado en el facturador, el sistema aplicará automáticamente la lista de precios asignada» (p. 1, 3). Se pueblan por coeficiente o por plantilla Excel de hasta 2.500 artículos (p. 2). En el API: `/apiarticulos/lista?clienteId=` y `/info?clienteId=` devuelven «el precio específico para un cliente» (p. 30, 32), `listaPrecioId` dice qué lista se aplicó (p. 31, 33) y `/apiarticulos/precios` las lista todas (p. 37). 🔴 **«El precio lo manda Switch» (`CLAUDE.md:118`) hoy significa «el precio de la lista por defecto»**: `switch-envio.ts:242` pregunta sin `clienteId`. Ver Parte 3, #4.

**Orden de compra e ingreso de mercancía** — `Flujo_articulo_orden_de_compra_switchsoft2026.pdf`. Tres etapas en tres módulos: OC (Compras), ingreso de mercancía (Stock, «jalar» la OC **Aprobada** con el botón +, opcional «monto adicional para distribuir: transporte, aranceles, impuestos»), factura del proveedor (Compras › Ingreso de comprobantes, p. 4-5). Para «Compré»: el ingreso puede llevar costos adicionales distribuidos → el CIF por línea del reporte web ya los incluye; el `costo` del `detalle[]` de `/apiingresomercancia/info` (p. 74) no dice si es antes o después de distribuir — **la doc no lo cubre**. Y la OC es un documento **anterior** al ingreso con su propio estado (Pendiente/Ingresada, p. 68): mercancía comprada que todavía no llegó, que hoy nadie ve.

**Toma de inventario** — `Guía_toma_de_inventario.pdf`. Al aprobar, el filtro decide qué se ajusta (p. 3): **TODOS** → los no escaneados «con saldo positivo o negativo **cambian a 0**»; **SÍ** → solo los escaneados; **NO** → los escaneados no se tocan y los no escaneados van a 0. Para Referencia: una caída de stock sin venta puede ser una toma aprobada con TODOS/NO. Estos ajustes **no pasan por el reporte de ingreso de mercancía** (son otra operación: `ajusteinventario`, p. 20, que lleva costo y proveedor) — confirma `ingresos-mercancia.ts:48-50`. «Stock es siempre la existencia real de Switch» (`CLAUDE.md:176`) incluye estos ceros.

**Cuentas incobrables** — `Guia_CuentasIncobrables_Switch_soft.pdf`. Se carga por plantilla un saldo **negativo** por cliente (Ventas › Clientes › Agregar saldos a clientes, p. 1) y se cruza contra las facturas en «Cancelación de pagos a cuentas» del estado de cuenta (p. 2). Efecto en `switch_estadocuenta`: la factura incobrable **desaparece como si se hubiera cobrado** (saldo 0) y aparece un crédito cargado por plantilla. La guía **no dice** si el cruce genera un recibo; los recibos con total $0 «por aplicación/cruce» de `sync-recibos.ts:26-31` son compatibles con esto, pero no está confirmado. Para el aging: una deuda dada de baja no se distingue de una pagada.

**Promociones, puntos, SwitchPay** — retail (ACS). Promociones: «compra 12 y lleva 1 gratis» se aplica como **descuento 100% al artículo de menor precio** cuando el facturador ve la cantidad total (`GUIA_PROMOCIONES…pdf` p. 2-3); necesita el parámetro 0021 activo (`Parametro…pdf` p. 3) — en `switch_factura_lineas` sería una línea con `descuento = 100`. Puntos: canje como forma de pago con conversión puntos/USD (`Guia_Puntos…pdf` p. 1-2) — aparecería como forma de pago en `/apireporte/diarioventas` (p. 17). SwitchPay: un pago por link contra una factura a crédito, si no cancela solo, **«ingresará como saldo a favor en el estado de cuenta»** (`Guía_Switch_Pay_Catalogo.pdf` p. 3) — otro origen de créditos abiertos en CXC.

**Facturas de proveedores de gasto** — `Guia_facturas_proveedores_switchsoft.pdf`. Ya está en `switch-panel.md` §21. Lo único que agrega el API: `tipoproveedor` viaja en `/apiproveedor/lista` (p. 12) y ya se guarda (`sync-proveedores.ts:144`); las facturas de servicio quedan en el estado de cuenta del proveedor (`/apiproveedor/info`, no documentado). **No hay endpoint del «Reporte de Comprobantes» de compras** (p. 3 de la guía): si esos gastos no salen por Egresos Varios, hoy no hay forma de bajarlos por API.

---

## Parte 3 — Lo que la doc corrige o precisa

Ordenado por lo que importa. 🔴 = contradice o pide re-verificar; ⚠️ = precisa algo que el repo dice a medias.

1. 🔴 **La sesión única SÍ está documentada, y es por USUARIO.** `docs/switch-panel.md:639` («Sesión única — NO está documentada, resultado negativo») y `CLAUDE.md:157` / `client.ts:401-403` / `sync-log.ts:64` («una sola sesión **por empresa**») contra la doc p. 6: *«Solo habrá un token válido a la vez **por usuario**»*. Como el API usa el usuario `daniel` en 7 de 8 empresas (`client.ts:275-278`), cada login del cron tumba la sesión del panel de Daniel y viceversa. Con un **usuario dedicado al API por empresa**, la doc dice que serían dos tokens válidos a la vez. Si el panel web cuenta como «token» del mismo usuario, la doc no lo dice — hay que medirlo con un usuario nuevo. Cambia también la regla de los 15 min entre crons (`SEPARACION_MINIMA_MIN`), que hoy protege una restricción que podría no existir entre usuarios distintos.

2. 🔴 **`/apiarticulos/lista` acepta `rubroId`** (p. 30, «Id del rubro retornado por `/apirubro/lista`»). `sync-articulo-info.ts:76-78` dice que el barrido de páginas «**no puede** dar la clasificación» y por eso pide `/apiarticulos/info` de a uno (1.363 fichas pendientes en active_shoes, `CLAUDE.md:267`). Con `/apirubro/lista` (p. 39) + una pasada de `/lista?rubroId=` por rubro, el **rubro** (categoría en Reebok) sale en bloque. ⚠️ Lo que NO sale así: `subrubro` (el género en Reebok) y `marca` — la lista no filtra por ellos (p. 30-31) y siguen necesitando `/info`. Hay que medir: `rubroId` puede ser otro parámetro ignorado como `estatus`.

3. 🔴 **`/apiingresomercancia/info` está documentado CON `detalle[]`** (p. 73-74: `codigoBarraId, codigoArticulo, descripcion, cantidad, costo, impuesto, subtotal, total`), hermano de `ingresomercancia{…}` bajo `data`. `ingresos-mercancia.ts:9-15` y `web-client.ts:758-762` dicen «**CERO líneas por artículo** — ningún array en la respuesta». El único sondeo que quedó en el repo (`scripts/_probe-ingresomercancia-info.ts:65-67`) lee `data.ingresomercancia` y **filtra explícitamente las llaves que son arrays** — nunca miró `data.detalle`. Hay que re-verificar con una llamada. Si el detalle existe, es el respaldo del reporte web (que el 1-sep demostró que puede cambiar de formato); no lo reemplaza: el `detalle[]` no trae FOB, CIF ni costo promedio (p. 74), que el CSV sí.

4. 🔴 **El precio que se valida y se manda es el de la lista POR DEFECTO, no el del cliente.** `switch-envio.ts:242` pide `/apiarticulos/lista?filtro=SKU` **sin `clienteId`**; la doc p. 30 dice que con `clienteId` viene «el precio específico para un cliente» y `Guia_lista_precios…pdf` p. 3 que la lista del cliente se aplica sola en el facturador. Consecuencias: (a) el aviso `precio_distinto` (`switch-envio.ts:262-266`) puede sonar por un cliente que simplemente tiene otra lista; (b) el pedido viaja con el precio del catálogo (`switch-envio.ts:351-357`), que puede no ser el que Switch le cobraría a ese cliente; (c) con el parámetro **0072 activo** (`Parametro…pdf` p. 4), al convertir el pedido en factura Switch **restablece los precios originales** y el precio enviado se pierde. Tres cosas medibles: `GET /parametro?codigo=0072` (p. 10), `/apiarticulos/precios?articuloId=` (p. 37) y `/lista?filtro=SKU&clienteId=` (p. 30).

5. ⚠️ **`/apifactura/lista` y `/apicliente/lista` nos sirven por campos que la doc NO promete.** `tipoComprobante`, `condicionVenta`, `clienteEmail` (`types.ts:107-119`; la doc p. 59 no los lista) y `vendedor`/`vendedorId` del cliente (`types.ts:88-89`; p. 22 no los lista), del que sale la **cartera de comisiones** (`sync-utilidad.ts:7-9, 64`). También `marcaId, talla, color, cantidadPorCaja` de artículos (`client.ts:723-752`; p. 31 no los lista). Un cambio de versión del API puede quitarlos sin romper la doc. Vale un candado que ponga el sync en `ok:false` si `tipoComprobante` o `vendedor` desaparecen del 100% de las filas.

6. ⚠️ **`porPagina` máximo 50 no es un «cap silencioso»: está escrito** («por defecto 50, máximo 50», p. 12 y todas las listas). `sync-empresa.ts:831-832` lo llama «cap silencioso ~50», `sync-acs-fidelizacion.ts:25` «~50». `sync-utilidad.ts:61,235` y `sync-recibos.ts:205` piden 500. No es bug (los bucles cortan por página vacía o por acumulado), pero el número miente en el código.

7. ⚠️ **`expires_in` viene en MINUTOS** (p. 5), no en segundos. `types.ts:38-40` dice «Segundos … valor inflado (~7884000)». `ttlFromExpiresIn` (`client.ts:307-321`) ya lo trata como minutos y lo capa a 55 min — el código está bien; el comentario del tipo no. El 7884000 medido no cuadra con ninguna unidad (15 años en minutos, 91 días en segundos): el TTL fijo de 55 min sigue siendo lo correcto.

8. ⚠️ **`/apifactura/info` está documentado desde siempre** (p. 56-58). `types.ts:144-147` dice «shape no validado en POC … refinemos cuando lo probemos en vivo», y `sync-factura-lineas.ts` lo consume desde el 24-ago-2026 con 163.559 líneas guardadas. Comentario viejo.

9. ⚠️ **«Existencia» en Referencia es `disponible`, no `saldo`.** `/apiarticulos/lista` solo trae `disponible` (p. 31); `saldo` (existencia física) vive en `/stock` (p. 36) y `disponible` = física − comprometida en pedidos. `switch_articulo_info.existencia` se llena con `disponible` (`sync-articulo-info.ts:121-122`). «Stock es SIEMPRE la existencia real de Switch» (`CLAUDE.md:176`) es cierto neto de pedidos abiertos; el sync de catálogos sí distingue las dos (`sync-catalogo.ts:3-29`).

10. ⚠️ **El código del cliente es texto libre que escribe una persona** (`POST /apicliente/crear`, `codigo` `[a-zA-Z0-9\-]`, p. 28; `Caracteres Validos` p. 3). El commit `44be9b16` («el código ES la identidad del cliente en el grupo») es correcto como medición (138/147) pero la identidad la sostiene la disciplina de quien crea clientes en seis instancias, no Switch. `lib/clientes/mundos.ts:112` (`/^D-\d+$/`) es una regla nuestra. La guía `Codigos Creacion Clientes.pdf` **no trata de estos códigos** — son tipos de cliente/identificación/impuesto por país.

11. ⚠️ **Descartamos el aging que Switch calcula.** `/apicliente/estadocuenta` devuelve `Saldos[]` por bucket y `saldoTotal` (p. 23); `sync-empresa.ts:640-671` guarda solo `elements[]` y `switch_estadocuenta_aging` recalcula. Para proveedores sí se guardan los buckets de Switch (`client.ts:847-853`). Un cuadre gratis que no se hace.

12. ⚠️ **`/apireporte/diarioventas`: `hasta` exclusivo, contra el ejemplo de la doc.** p. 17 muestra `"fecha": "2019-07-18 / 2019-07-18"` con datos; `client.ts:661-663` midió (4-jul-2026) que `desde=hasta` devuelve ceros. Manda lo medido; el ejemplo es de 2019.

13. ⚠️ **`/apiingresomercancia/lista?estatus=` existe en la doc (p. 71) y la API lo ignora** (`proveedores-derivados.ts:33-36`, medido). La doc no desmiente la medición; solo dice que el parámetro está. Lo que sí tiene estado documentado con 4 valores es la **orden de compra** (p. 68: Inactivo/Activo/Pendiente/Ingresada).

14. ⚠️ **Una NC puede referenciar VARIAS facturas** (`GUIA_NOTA_DE_CREDITO…pdf` p. 2). Cualquier cruce NC → factura tiene que ser 1:N. El API no expone el vínculo (§1.7, §1.8).

15. ⚠️ **`CLAUDE.md:380` está viejo**: «Upload: 100% manual (drag-drop), no hay API/SFTP». Hay 52 métodos documentados, 25 en uso y 79 crons que viven de ellos. Esa sección describe el sistema de antes de jun-2026.

16. ⚠️ **`docs/api-switch.pdf` no existe en el repo** aunque `switch-panel.md:8` y `client.ts:574` lo citan. Las 13 guías sí están en `docs/switch/`; el PDF del API debería estar al lado.
