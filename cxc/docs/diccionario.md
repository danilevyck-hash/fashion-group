# Diccionario del sistema — una palabra por cosa

> **Barrido el 5-sep-2026.** 13.906 textos visibles de `src/app/**`, `src/components/**` y los
> generadores de PDF, Excel, correo y Telegram de `src/lib/**`. Sin tocar código, sin correr tests.
>
> **Qué mide:** cuántas palabras distintas usa el sistema para la MISMA cosa, y dónde está cada una.
> **Para qué:** que Daniel elija una por concepto. Mientras no elija, no se cambia nada.
>
> **Resultado:** **31 conceptos** tienen más de una palabra. **17** son decisión de nadie (hay una
> correcta y las otras son descuido); **10** necesitan que Daniel decida — están al final.

---

## 1. Las palabras

Una fila por concepto. «Se usa hoy» trae las variantes con su conteo; «Propongo» es la recomendación
cuando la respuesta es obvia, y lleva **«↓ Daniel»** cuando de verdad hay que decidir — esos diez
están juntos y en una línea cada uno en **§5**.

### 1.1 Cosas que se borran

| Concepto | Se usa hoy | Propongo | Dónde cambiarla |
|---|---|---|---|
| Sacar algo de la lista, con vuelta atrás | **Quitar** (18) · **Eliminar** (46) · **Borrar** (6) | **Quitar** para lo reversible, **Eliminar** para lo definitivo | `catalogo/BulkDeletePedidosModal.tsx` («eliminar» a pedidos que solo se ocultan) · `ComprobantesPanel.tsx:544` · `guias/GuiasConfiguracionView` ya lo hace bien («Quitar un destino no borra nada») |
| Sacar algo para siempre | **Eliminar** · **Borrar** (`"No se pudo borrar"` ×4, `"¿Borrar de la libreta?"`) | **Eliminar** | `clientes/*` («Borrar de la libreta») · `catalogo` («No se pudo borrar el pedido», «No se pudo borrar la excepción») |
| Persona/cliente que ya no está | **Retirado** (Comisiones) · **Dado de baja** (Asistencia) · **Ausente** (Clientes) · **Inactivo** (Usuarios) · **Desactivar** (Usuarios) | Son cuatro cosas distintas y está bien; **solo unificar «Desactivar/Inactivo»** en Usuarios | `admin/usuarios/page.tsx:678` |
| — | *«Archivado» no existe en el sistema.* Confirmado: 0 apariciones. | — | — |

### 1.2 Personas

| Concepto | Se usa hoy | Propongo | Dónde cambiarla |
|---|---|---|---|
| Quien trabaja en el grupo | **Persona** (Asistencia, 14) · **Empleado** (Préstamos, 5) · **Colaborador** (0 en pantalla — solo `COLABORADOR`, el usuario genérico de Switch en Comisiones) | **↓ Daniel** | Préstamos: `PrestamosClient.tsx:296` «Buscar empleado…» · `ConfirmModals.tsx:30,35` «Eliminar Empleado», «Escribe el nombre del empleado» · `DataHealthTab.tsx:76` «Empleados con saldo…» |
| Quien vende | **Vendedor** (Ventas, Comisiones, Guías) · **Vendedora** (Multifashion) · **Impulsadora** (Marketing) | Se quedan: son tres oficios distintos | — |

> 🩸 **El mismo nombre entra a dos módulos con dos palabras.** La ficha de Préstamos saca la persona
> de Asistencia (`empleado_codigo`), y en una pantalla se llama «empleado» y en la otra «persona».

### 1.3 El cajón de lo que no encaja

| Concepto | Se usa hoy | Propongo | Dónde cambiarla |
|---|---|---|---|
| Lo que no entra en ninguna categoría | **Otros** (`Otros clientes` 8 · `Otros gastos` · `Otras marcas` · `Otros servicios`) · **Sin clasificar** (2) · **Sin categoría** (5) · **Marca desconocida** (36) · **Sin marca** (3) | **«Otros»** cuando es un grupo real de cosas · **«Sin categoría»** cuando falta el dato | `catalogo`: unificar `Marca desconocida` / `Sin marca` en una sola |
| No hay dato | **Sin datos** (6) · **sin data** (3) · **Sin dato** · **—** (raya) | **—** en una celda, **«Sin datos»** en un bloque. Nunca «sin data» (medio inglés) | `ventas/queries.ts`, `ResumenView*` («sin data», «Data actualizada al …») |

### 1.4 Cliente, tienda, empresa

| Concepto | Se usa hoy | Propongo | Dónde cambiarla |
|---|---|---|---|
| A quién le vendemos | **Cliente** (todo el sistema) · **Tienda** (Marketing) | **↓ Daniel** | Marketing: `ReportesTabs.tsx:14` «Por Tienda» + `ReportePorTiendaView.tsx:153` y `ReportePorProyectoView.tsx:164,212` columna «Tienda», contra `PorClienteModal.tsx:72` «Por cliente» y `inventario-excel.ts:113` columna «Cliente» — **los dos conviven dentro del mismo módulo** |
| La libreta de clientes | **Directorio** (ClientePicker, Marketing) · **Clientes** (el módulo, `modules.ts:155`) | **Clientes** en el menú, **«el directorio»** dentro del texto está bien | — |
| Cuentas por cobrar | **Cuentas por Cobrar** (12, el nombre del módulo) · **CXC** (16) | **Cuentas por Cobrar** en pantalla; CXC solo en Data Health (es de admin) — **↓ Daniel** | `vista-general/page.tsx:287,288,376,429` («Por cobrar (CXC)», «Ir a CXC» ×3) · `cxc/page.tsx:119` «Reporte CXC» · `recordatorios/RecordatoriosClient.tsx:401,403` |

### 1.5 Cómo se llama una empresa

🔴 **Hay TRES mapas de nombres para las mismas 8 empresas, y no dicen lo mismo.**

| Empresa | `empresa-mapping.ts` (pantalla) | `grupo-resumen-mensual.ts` (Telegram) | `ReferenciaTarjeta.tsx` (Referencia) |
|---|---|---|---|
| `vistana` | **Vistana International** | **Vistana** | **Vistana** |
| `confecciones_boston` | **Confecciones Boston** | **Boston** | *(no está)* |
| `american_classic` | **Multifashion** | **Multifashion** | *(no está)* |

Un cuarto en `companies.ts` (`ALL_COMPANIES.name`) repite «Vistana International» y **no tiene
Multifashion**. Además `parse-packing-list.ts` reconoce «VISTANA INTERNACIONAL PANAMA» (con
*Internacional* en español), que es como lo escribe Switch.

**Propongo (↓ Daniel):** **una sola lista** — la de `empresa-mapping.ts` — y que Telegram y Referencia la lean.
Si el mensaje de Telegram necesita nombres cortos, que sean un segundo campo de la MISMA lista
(`labelCorto`), no otra lista.
**Dónde:** `src/lib/grupo-resumen-mensual.ts:49-58` · `src/components/ventas/ReferenciaTarjeta.tsx:111-117` · `src/lib/companies.ts:13-31`.

### 1.6 Papeles y comprobantes

| Concepto | Se usa hoy | Propongo | Dónde cambiarla |
|---|---|---|---|
| El papel de una venta | **Factura** · **Nota de Crédito** (17) · **Nota de Débito** (7) · **Comprobante** (7) · **Documento** (5) | **Factura** cuando es una factura; **Comprobante** para el conjunto (ya es el nombre del panel de Catálogos); **Documento** solo en el estado de cuenta, donde entran facturas y notas juntas | `EstadoCuentaDrawer.tsx:149` «N documentos» (correcto) vs `ContactPanel` «Este cliente no tiene documentos con saldo pendiente» (correcto) — el problema es `Ver factura` (13) y `Ver comprobante` (7) para **el mismo botón** en Catálogos |
| El archivo que baja | **Excel** (10 «Descargar Excel») · **CSV** (`Exportar CSV`, `CSV (Excel)`) | **Excel** siempre — el usuario lo abre en Excel | `cxc/page.tsx:753` «CSV (Excel)» · `cxc/components/PanelCxcMobile.tsx:298` «Exportar CSV» |
| Bajar / sacar | **Descargar** (13) · **Exportar** (3) | **Descargar** | `cxc/PanelCxcMobile.tsx:298` · los 2 «Exportar Excel» sueltos |

### 1.7 Botones de acción

| Concepto | Se usa hoy | Propongo | Dónde cambiarla |
|---|---|---|---|
| Confirmar un guardado | **Guardar X** (`Guardar gasto`, `Guardar Guía`, `Guardar cambios`) · **Confirmar** (el default de `ConfirmModal`, `ui.tsx:210`) · **Registrar X** (`Registrar gasto` 15) · **Aceptar** (0) | **El verbo + el sustantivo**, como ya manda CLAUDE.md. **«Confirmar» a secas no dice qué confirma** | `src/components/ui.tsx:210` — cambiar el default o exigir que cada llamador lo pase |
| Mayúsculas | **Guardar cambios** (5) vs **Guardar Cambios** (4) · **Guardar Guía** · **Guardar Reclamo** · **Eliminar Empleado** | Primera palabra en mayúscula y nada más (`Guardar cambios`) | `prestamos/ConfirmModals.tsx:30` · `reclamos/*` · `guias/*` |
| Traer datos frescos de Switch | **Actualizar ahora** (63 — el botón compartido) · **Actualizar datos de Switch** (Referencia) · **sincronizado** (Catálogos) · **Última sincronización** · **Sincronizado con Switch hace X** | **Actualizar ahora** en el botón; **«Actualizado hace X»** en el rótulo. La palabra «sincronizar» no se le dice a nadie | `api/ventas/referencia/actualizar` → el botón de `/referencia` · `catalogo/marcas-ui.tsx:1079,1413,1754` « · sincronizado 05 sep, 01:45» · `SyncStatus.tsx` |

### 1.8 Correo

| Concepto | Se usa hoy | Propongo | Dónde cambiarla |
|---|---|---|---|
| Dirección de correo | **Correo** (30+, CXC y Reclamos) · **Email** (5, Clientes y Catálogos) | **Correo** — **↓ Daniel** | `clientes/ClientesListClient.tsx:277` (encabezado «Email») · `clientes/[codigo]/ClienteDetail.tsx:254,282` (dos rótulos «Email») · `cxc/PanelCxcMobile.tsx:470` («Buscar cliente, teléfono, email…») · `catalogo/PedidoDetalleClient.tsx:779` («Ingresa un email válido») · `lib/catalogo/order-email.ts:22` («Enviar por email al cliente») |

### 1.9 Existencia

| Concepto | Se usa hoy | Propongo | Dónde cambiarla |
|---|---|---|---|
| Lo que hay en bodega | **Stock** (Referencia, Marketing, Catálogos admin) · **Inventario** (Vista General, Marketing) | **Stock** para el número, **Inventario** para el conjunto | `ventas/ReferenciaTarjeta.tsx` («Stock» y «en bodega» en la misma tarjeta) · `marketing/mobiliario/page.tsx:1058` «Stock total» vs `EntregaForm.tsx:616` «El stock se devolverá al inventario» |

✅ **«Disponibilidad» y «Existencia» del catálogo NO son lo mismo y se quedan** — Daniel las eligió
el 25-jul-2026: *Disponibilidad* = vendible (saldo − apartado), *Existencia* = saldo físico
(`components/catalogo/CatalogoStockLine.tsx:28-31`). Dos números distintos, dos palabras distintas.
Es el caso a favor de tener dos palabras.

> ⚠️ **«Stock Ideal», «CODIGO ARTICULO», «CODIGO BARRA» del Depurador NO se tocan**: son los
> encabezados exactos de la plantilla de Switch (`OUT_COLS`), con candado que los compara byte a byte.

### 1.10 Vacío

| Concepto | Se usa hoy | Propongo | Dónde cambiarla |
|---|---|---|---|
| Todavía no hay nada | **Todavía no hay X** (5) · **Aún no hay X** (4) · **Sin X** (~40) · **No hay X** (3) | **«Todavía no hay X»** cuando va a haber · **«Sin X»** cuando es una celda o un chip | `marketing/mobiliario/page.tsx:783,919` «Aún no hay entregas registradas» · `marketing/ImpulsadorasView.tsx:194` «Aún no hay impulsadoras» · `ventas/ComisionesConfiguracionView.tsx:163` «Aún no hay vendedores» — **Marketing usa las DOS formas** (`PorClienteModal.tsx:93` dice «Todavía no hay gasto que mostrar») |
| Gastos vacíos | **Todavía no hay gastos registrados** (Gastos) · **Sin gastos registrados** (Caja) · **Todavía no hay gastos cargados de esta empresa para este mes** (Vista General) · **Todavía no hay gasto que mostrar** (Marketing) | Una sola: **«Todavía no hay gastos»** | `gastos-contabilidad/ResumenEgresos.tsx:52` · `caja/GastoTable.tsx:250,342` · `vista-general/RentabilidadPorEmpresa.tsx:197` · `marketing/PorClienteModal.tsx:93` + `PorMarcaModal.tsx:78` |

### 1.11 Puntuación y símbolos

| Concepto | Se usa hoy | Propongo | Dónde cambiarla |
|---|---|---|---|
| «esto sigue» | **…** (287) · **...** (70) | **…** | 70 lugares. El más visible: `cxc/BostonTab.tsx:209` «Buscar cliente...» al lado de `Buscar cliente…` en las otras tres búsquedas |
| Comillas de énfasis | **« »** (32) · **“ ”** (2) | **« »** | `productos/cargar/FacturasTiendaClient.tsx:586` · `asistencia/ComoFuncionaTab.tsx:29` |
| Rango de fechas | **–** (guion medio, 48) · **—** (raya, 285, como separador) | Correcto como está: `–` para rangos, `—` para separar frases | — |
| Signo menos | **-** (ASCII) · **−** (U+2212) | **-** ASCII | `lib/ventas/format.ts:22` (`formatCompactCurrency`) y `lib/ventas/proyeccion-texto.ts:107` usan `−`; el resto usa `-` |

---

## 2. Los tres formatos

### 2.1 Plata — **casi consistente, tres excepciones**

La casa escribe **`$1,234.56`** (miles con coma, 2 decimales) y así sale en **37** formateadores
distintos. Lo que no cuadra:

| Excepción | Qué escribe | Dónde |
|---|---|---|
| Vista General redondea | **`$1,235`** (0 decimales) | `src/app/vista-general/formato.ts:7` |
| Telegram redondea | **`$1,235`** (0 decimales) — resumen diario de ACS y resumen mensual del grupo | `src/lib/acs-resumen-diario.ts:207` |
| 🔴 **El negativo se escribe de dos maneras** | **`-$100.00`** en CXC, el correo de estado de cuenta, el PDF de estado de cuenta y Vista General · **`$-100.00`** en Ventas, Referencia y los componentes compartidos | `-$`: `cxc/EstadoCuentaDrawer.tsx:39`, `lib/cxc/estado-cuenta-email.ts:43`, `lib/pdf-estado-cuenta.ts:10`, `vista-general/formato.ts:7` — `$-`: `components/ui.tsx:567`, `lib/ventas/format.ts:7`, `ventas/ReferenciaTarjeta.tsx:91` |

**Propongo (↓ Daniel):** `-$1,234.56` en todas partes, y **un solo módulo** (`src/lib/format.ts`) del que salgan
los 37. La forma corta también está partida en cuatro (`$1.2K` · `$1k` · `$87K` · `1.2k` sin `$`):
`format.ts fmtCompact` · `vista-general/formato.ts moneyK` · `ventas/format.ts formatCompactCurrency` ·
`ReferenciaTarjeta.tsx`.

### 2.2 Fechas — 🔴 **la pantalla y el papel hablan distinto**

| Superficie | Formato | Ejemplo | Dónde |
|---|---|---|---|
| Pantalla (la casa) | `d mmm aaaa` | **5 sep 2026** | `lib/format.ts:14` `fmtDate` |
| **PDF de CXC** | `dd/mm/aaaa` | **05/09/2026** | `lib/pdf-cxc.ts:36` |
| **PDF de reclamos** | `dd/mm/aaaa` | **05/09/2026** | `lib/reclamos/pdf-bulk.ts:73` |
| **PDF de entrega de mueble** | `dd/mm/aaaa` | **05/09/2026** | `lib/marketing/pdf-entrega-mueble.ts:131` |
| **Todo Excel** | `dd/mm/aaaa` | **05/09/2026** | `lib/excel-export.ts:129` `fmtFechaExcel` |
| **Excel de pedidos** | `dd/mm/aaaa` | **05/09/2026** | `lib/catalogos/pedidos-excel.ts:60` |
| PDF de estado de cuenta | `d mmm aaaa` ✅ | 5 sep 2026 | `lib/pdf-estado-cuenta.ts` (el único papel que sigue la casa) |
| Telegram | `d-mmm` | **5-sep** | `lib/acs-resumen-diario.ts:286` |
| Asistencia › Reporte | `Vie 5 sep` | | `asistencia/ReporteTab.tsx:24` |
| Gastos, Vista General, Multifashion | `5 sep` (sin año) | | 4 sitios |

**Propongo (↓ Daniel):** **«5 sep 2026» también en el papel y en el Excel.** Es el formato que Daniel lee en
pantalla todos los días; el `05/09/2026` del papel obliga a traducir. *(Excepción legítima: una celda
de Excel que se quiera ordenar o filtrar por fecha necesita ser fecha de verdad, no texto — eso se
resuelve con el formato de celda, no con el texto.)*

**Y 🩸 hay ~33 copias del arreglo de meses**, con tres mayúsculas distintas: **`"ene"`** (26 copias),
**`"Ene"`** (4), **`"Enero"`** (1). Los días de semana igual: `"dom"` (3) y `"Domingo"` (2). Un solo
archivo (`lib/fechas.ts`) y las 33 leen de ahí.

### 2.3 Hora — tres relojes

| Escribe | Dónde |
|---|---|
| **1:45 a. m.** (12 h, sin cero) | `SyncStatus.tsx:52` · `multifashion/VentaHoyCard.tsx:41` |
| **01:45 a. m.** (12 h, con cero) | `guias/useGuiaFormState.ts:519` · `DataHealthTab.tsx:119` · `reclamos/ReclamoDetail.tsx:813` · `productos/cargar/HistorialView.tsx:24` |
| **01:45** (24 h) | `alertas/silencio-de-datos.ts:484` · `switch-api/alert-policy.ts:358` · `outage-resumen.ts:300` (Telegram) |

**Propongo:** **«1:45 a. m.»** en pantalla y en el papel; 24 h solo si Daniel lo prefiere para Telegram.

### 2.4 Porcentajes — **el peor de los tres**

Sin regla: **0 decimales** (Ventas, Multifashion, Préstamos, PDF de CXC), **1 decimal** (Vista
General, márgenes del Resumen, Multifashion › Productos, Comisiones detalle), **2 decimales**
(`comisionExcel.ts:179`, `NuevaImpulsadoraModal.tsx:218`). El signo también: `+12%` · `▲ +12%` ·
`▲ 12%` · `−12%` (con U+2212) · `-12%`.

**Propongo (↓ Daniel):** **1 decimal para márgenes y participaciones, 0 para variaciones** («+13%»), con el
triángulo aparte del número. Un solo `fmtPct`.

---

## 3. Los mensajes de error

### 3.1 🔴 Lo técnico que llega a la pantalla

| Texto | Dónde | Reemplazo propuesto |
|---|---|---|
| «Falta SUPABASE_SERVICE_ROLE_KEY en este entorno: las fórmulas no se pueden leer ni guardar (RLS las bloquea para el rol anon).» **(9 variantes)** | `productos/cargar/*` y `catalogos/admin/*` | **«Esta pantalla no está conectada todavía. Avísame y lo dejo listo.»** |
| «Falta correr la migración 20260806120000 (columna bulto_pzas).» **(16 variantes)** | packing-lists, catálogos, comisiones, guías, marketing | **«Esto todavía no está encendido. Avísame y lo enciendo.»** |
| «El producto se guardó, pero la foto todavía no: falta correr en Supabase la migración 20260808160000_mk_mobiliario_bultos_y_foto.sql» | `marketing/mobiliario/page.tsx:365` | **«El producto se guardó; la foto todavía no. Avísame.»** |
| «El inventario todavía no está conectado — falta correr la migración en Supabase.» | `vista-general/InventarioPorEmpresa.tsx:88` — **en la pantalla que Daniel abre primero** | **«El inventario todavía no está conectado. Avísame.»** |
| «HTTP ${res.status}» | varios | **«No se pudo. Intenta de nuevo en unos segundos.»** |
| «Body JSON inválido» · «Cuerpo inválido» · «RPC sin order_number» · «No periodo_id» · «Claude no devolvió JSON válido» | rutas de API que el cliente muestra en un toast | **«No se pudo guardar. Recarga la página e intenta de nuevo.»** |
| «anio inválido» · «codigo requerido» · «cardId requerido» · «action y module requeridos» · «periodo inválido» | ~40 respuestas de API con el nombre crudo del parámetro | Ninguna debería llegar a pantalla; si llega, **«No se pudo. Recarga la página.»** |
| «El API de Switch no expone el número de recibo.» | `ventas/ComisionesDetalleModal.tsx:589` | **«Switch no manda el número de recibo.»** |
| «Aún no hay vendedores. Aparecerán tras el próximo sync de Switch.» | `ventas/ComisionesConfiguracionView.tsx:163` | **«Todavía no hay vendedores. Aparecen cuando lleguen los datos de Switch.»** |
| «Editar nombre (el sync deja de cambiarlo)» · «Listo, nombre guardado — el sync ya no lo cambia» | `catalogos/admin/[marca]/ProductosBatch.tsx:335,445` | **«…Switch ya no lo cambia»** |
| «Filas con días NULL o negativos y saldo: no entran en ningún rango del aging.» · «Clasifícalos en una migración para que el aging de CXC sea correcto.» | `admin/usuarios/DataHealthTab.tsx:85,89,92` | Es pantalla de admin — aceptable, pero **«aging» → «tramos»** |
| «No hay fotos con SKU valido» | `catalogos/admin/[marca]/ProductosBatch.tsx:948` | **«Ninguna foto tiene un código válido»** (y le falta la tilde a *válido*) |

### 3.2 Los que no dicen qué hacer

**43 mensajes** empiezan con «Error al …» y **45** con «No se pudo …» / «No pude …», y **terminan ahí**: sin qué
hacer, sin si se perdió algo. Los más caros, porque el usuario acaba de escribir algo:

`Error al guardar` · `Error al guardar cambios` · `Error al crear período` · `Error al cerrar periodo` ·
`Error al eliminar` · `No se pudo guardar el motivo` · `No se pudo enviar el pedido.` ·
`Error al crear items del reclamo. No se guardo el reclamo.`

**Propongo:** que todo error de guardado diga las tres cosas — **qué pasó · si se perdió · qué hacer**:
> «No se pudo guardar el reclamo. No se perdió nada — intenta de nuevo en unos segundos.»

### 3.3 Cinco maneras de decir «vuelve a intentar»

| Se usa hoy | Veces |
|---|---|
| «Intenta de nuevo.» | 26 |
| «Intenta de nuevo en unos segundos.» | 15 |
| «Revisa tu conexión e intenta de nuevo.» | 6 |
| «Intenta de nuevo en unos minutos.» | 3 |
| «Verifica tu internet e intenta de nuevo.» · «revisa el internet y vuelve a intentar.» · «Recarga la página e intenta de nuevo.» | 1 c/u |

Y **«conexión» e «internet» se mezclan dentro del mismo módulo** (Guías dice las dos:
`useGuiaFormState.ts:506,626` «revisa el internet», y el banner global dice «Sin conexión»).

**Propongo dos colas y nada más:**
- se puede reintentar → **«Intenta de nuevo en unos segundos.»**
- es la red → **«Revisa tu conexión e intenta de nuevo.»** (siempre *conexión*, nunca *internet*)

### 3.4 Acentos que faltan en pantalla

`Error al cerrar periodo` (`caja/useCajaState.ts:166,172`) · `Sin datos para este periodo.`
(`marketing/ReportePorMarcaView.tsx:112`, `ReportePorTiendaView.tsx:146`) · `No se guardo el reclamo.`
· `Error al procesar importacion` · `No hay fotos con SKU valido`.

**«período» con tilde: 106 veces. «periodo» sin tilde en pantalla: 5.** Se corrigen las 5.

---

## 4. Lo que sobra

El barrido encontró **poco** — las podas anteriores (#278, #284, `poda-textos-cxc-multifashion`)
funcionaron. Quedan estos candidatos:

| Texto | Dónde | Por qué sobra |
|---|---|---|
| «Cómo se calcula y cuándo se actualizó» ×2 | `ventas/ComisionesCriterios.tsx:46,47` | El rótulo repetido en el botón y en el título de lo que abre |
| «Los gastos de esta empresa no se traen solos de Switch, para no quitarle el panel a quien lo esté usando. … Esta pantalla es el único lugar donde se ven: para ponerlos al día hay que traerlos a mano otra vez.» | `gastos-contabilidad/ResumenEgresos.tsx:101` | 3 frases pegadas a un número; con **«Se traen a mano. Toca Actualizar.»** alcanza |
| «Empresa del grupo. Es una venta real y cuenta en los totales igual que cualquier cliente; la marca es sólo para reconocerla.» | `ventas/ClientesView.tsx:726` | Explica una insignia que ya se entiende sola. *(Y dice «sólo» con tilde, que la RAE ya no pide.)* |
| «Este proyecto trabaja N marcas, así que en el inicio aparece en la tarjeta de cada una. Es el mismo proyecto, no está duplicado.» | `marketing/ProyectoOverlay.tsx:445` | La segunda frase es la única que hace falta |
| «La comisión de cada línea es referencial. El total se calcula sobre el total del mes, …» | `ventas/ComisionesDetalleModal.tsx:56` | Pegado a la tabla; cabe en **«El total no es la suma de las líneas.»** |
| «Se vendieron N antes de la primera compra que tenemos registrada — falta una compra anterior, así que esa parte no está contada en ninguna fila.» | `ventas/ReferenciaTarjeta.tsx:621` | Dos explicaciones de la misma cosa |

> ⚠️ **No entra en esta lista** el tab «Cómo funciona» de Asistencia
> (`asistencia/ComoFuncionaTab.tsx`): es una pantalla de ayuda a propósito, no texto pegado a un dato.

---

## 5. Para que Daniel elija

Solo lo que de verdad hay que decidir. Todo lo demás de este archivo tiene una respuesta obvia.

1. **¿«Persona» o «Empleado»?** Hoy Asistencia dice *persona* y Préstamos dice *empleado*, y es la misma gente.
2. **En Marketing, ¿«Cliente» o «Tienda»?** Hoy el módulo usa las dos: la pestaña dice *Por Tienda* y el modal dice *Por cliente*.
3. **En el papel y el Excel, ¿«5 sep 2026» o «05/09/2026»?** Hoy la pantalla dice una cosa y los PDF y todos los Excel dicen la otra.
4. **¿La empresa se dice «Vistana» o «Vistana International»?** Y Boston, ¿«Boston» o «Confecciones Boston»? Telegram y Referencia dicen la corta; el resto la larga.
5. **¿Los porcentajes con decimal o sin?** Hoy conviven 12%, 12.3% y 12.35%.
6. **¿La plata negativa se escribe `-$100.00` o `$-100.00`?** Hoy conviven las dos.
7. **¿Vista General y Telegram siguen redondeando la plata** (`$1,235` sin centavos) **o van con centavos como el resto?**
8. **¿«Correo» o «Email»?** El sistema dice *correo* casi siempre; el módulo Clientes dice *Email*.
9. **¿En Vista General decimos «Cuentas por Cobrar» en vez de «CXC»?** Es la única pantalla donde aparecen las siglas fuera de admin.
10. **Cuando falta encender algo, ¿qué le decimos al usuario?** Hoy 25 mensajes dicen el nombre del archivo de la migración o de una clave del servidor. Propongo: **«Esto todavía no está encendido. Avísame.»**

---

## 6. Voseo y jerga — lo que se le escapa al candado

El candado (`src/__tests__/lib/nada-de-voseo.test.ts`) está **verde y funciona**: barrido manual de
`src/app/**` y `src/components/**` no encontró voseo en texto visible. Los dos únicos «probá con
otros» y «mirá esto» del repo están **dentro de comentarios**, que el candado borra a propósito.

Lo que sí se escapa:

### 🩸 «avisame» — 15 mensajes de Telegram

`avisame` es voseo (*avisá + me*). El tuteo es **«avísame»**. El candado tiene `avisale` en su lista
pero **no tiene `avisame`**, así que pasa.

| Forma | Veces | Dónde |
|---|---|---|
| **avisame** ❌ | **15** | `src/lib/cron-telemetry.ts:2006` (la constante que alimenta 14 avisos: sync viejo, costo, referencia, margen, proveedores, clientes, respaldo, cheques, integridad, resúmenes…) · `src/lib/switch-api/alert-policy.ts:414` |
| **avísame** ✅ | 2 | `src/lib/alertas/silencio-de-datos.ts:535` · `src/lib/alertas/cuadre-costo.ts:240` |

**Propongo:** corregir las 15 y **agregar `avisame`, `contame`, `decime`, `mandame`, `mostrame`,
`pasame` a `FORMAS_PROHIBIDAS`** — son la familia de imperativo + `me`, que hoy solo está cubierta
por su prima `-le`.

### Fuera de `src/`

`supabase/migrations/**` tiene «acá» y «PARÁ ACÁ» en comentarios de SQL. **No llega a ninguna
pantalla** — se deja.

### Jerga en pantalla

Ya listada en §3.1. Las palabras a desterrar de lo que ve el usuario: **sync · aging · API · RPC ·
migración · Supabase · SUPABASE_SERVICE_ROLE_KEY · RLS · JSON · HTTP · SKU · NULL · CSV**.
(«SKU» tiene defensa: es la palabra que usa el proveedor en el B2B — se deja.)

---

## 7. Lo que ya está bien — no tocar

- **Los tramos de la cartera.** `src/lib/cxc-aging.ts` es fuente única: *Por vencer 0-90d · Vencido
  reciente 91-120d · Vencido crítico 121d+*, y el escritorio, el celular, el PDF y Boston leen de ahí.
  Es el modelo de lo que este archivo propone para todo lo demás.
- **Los mensajes de Telegram de 🔧 SISTEMA** ya dicen *qué pasó / qué significa / qué hacer*, sin
  nombres de tabla. Solo les falta la tilde de «avísame».
- **Los encabezados de Excel** son consistentes (Total · Cliente · Fecha · Código · Empresa…).
- **El tono.** «Listo, guardado» (14) · «Excel listo — revisa tu carpeta de descargas» (8) ·
  «Sin conexión» — la voz de la casa está y se reconoce.
