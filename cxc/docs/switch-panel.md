# Switch — Manual del panel (resumen)

Fuente: **https://ayuda.switch-soft.com/** — base de conocimiento pública de Switch Soft.
Extraída el **2026-08-25**: 422 artículos, todos públicos, **sin login**.
Complementa a `docs/api-switch.pdf` (que cubre la API, no el panel).
Las **90 URLs citadas** en este documento se verificaron una por una: todas responden HTTP 200 al 2026-08-25.

> **Cómo leer este documento**
> - **[DOC]** = está escrito literalmente en el manual. La URL citada lo respalda.
> - **[INFERENCIA]** = deducción nuestra a partir de lo anterior. **No es fuente.**
> - **[SIN FUENTE]** = no aparece en ninguna parte del sitio. Hay que preguntarle a soporte.
>
> Regla: nunca conviertas una inferencia en dato al citar este documento.

**Estructura del sitio**
- KB por módulo: `https://ayuda.switch-soft.com/modulos/{ventas,compras,stock,caja-y-bancos,contabilidad,crm,promociones,reportes,e-commerce,configuracion,updates}/`
- Artículo individual: `https://ayuda.switch-soft.com/pregunta/<slug>/`
- **Novedades** = categoría `modulos/updates/` — los changelogs fechados. Es el material más valioso y más reciente del sitio.
- **Comunidad** (`/community/`) — foro **vacío**: 10 foros, 0 temas, 0 respuestas, 6 miembros. Inútil.
- **Tutoriales** — solo enlaza el canal de YouTube. **Ayuda Teórica** — artículos de marketing, sin contenido de producto.
- Soporte real: chat `soporte.switch-soft.com`, WhatsApp +507 6681-7226, `soporte@switch-soft.com`. L-V 8:00-17:00, Sáb 8:00-14:00 (Panamá).

---

## 1. 🔴 Los 8 tipos de "Reportes de comprobantes" (Ventas › Reportes)

La pantalla existe y está documentada: **Ventas → Reportes → Reporte de Comprobante**, con un filtro llamado **campo "Comprobante"** donde se elige el tipo.
— https://ayuda.switch-soft.com/pregunta/donde-encuentro-las-cotizaciones-realizadas/ y https://ayuda.switch-soft.com/pregunta/donde-puedo-ver-las-cotizaciones-que-he-realizado/

**Ningún artículo enumera las 8 opciones del desplegable.** Lo de abajo se reconstruyó cruzando artículos sueltos.

### Tabla resumen

| Tipo | Qué es | ¿Mueve inventario? | ¿Genera CxC? | ¿Fiscal? |
|---|---|---|---|---|
| **Facturas / Notas** | Factura fiscal + notas de crédito/débito | **Sí** [DOC] | Sí, si la forma de pago es CRÉDITO [DOC] | Sí [DOC] |
| **Transacción** | Comprobante **no fiscal**, consecutivo propio. **Reemplaza al Tiquete en Panamá** desde mayo 2025 | [SIN FUENTE] | [SIN FUENTE] | **No** [DOC] |
| **Tiquete** | Comprobante **no fiscal** de punto de venta, **sin cliente receptor definido** | [SIN FUENTE] | [SIN FUENTE] | **No** [DOC] |
| **Ventas** | **[SIN FUENTE]** — no aparece en todo el sitio | ? | ? | ? |
| **Pedidos** | Documento previo a la factura; se factura desde "Buscar Comprobantes" | **Sí** [DOC] | No [INFERENCIA] | No [INFERENCIA] |
| **Cotización** | Presupuesto; el escalón más arriba de la cadena | **No** [DOC, por omisión] | No [INFERENCIA] | No [INFERENCIA] |
| **Abonos** | **Apartado / layaway**: mercancía **reservada** contra pagos parciales | **Sí — resta y reserva** [DOC] | **[SIN FUENTE]** — el manual nunca lo dice; los indicios apuntan a que **no** | No hasta liquidar; entonces nace la factura fiscal [DOC] |
| **Cotización Email** | **[SIN FUENTE]** — no aparece en todo el sitio | ? | ? | ? |

### El dato duro sobre inventario

Un solo artículo dice explícitamente qué documentos restan stock, y es el más importante de todo el sitio para esta pregunta:

> "Permite facturar sin control de stock, **pedido, abono** […] ya hemos deshabilitado las opciones que nos restan inventarios que serian cuando hacemos una **factura, pedido o abono**."
> — https://ayuda.switch-soft.com/pregunta/por-que-mi-inventario-en-transito-esta-en-negativo/

**[DOC]** Restan inventario: **Factura, Pedido, Abono**.
**[DOC, por omisión]** La **Cotización no aparece** en esa lista — y el manual de facturar cotizaciones advierte: *"Es importante estar atento a que los productos cotizados estén disponibles en el stock"* (https://ayuda.switch-soft.com/pregunta/como-facturo-una-cotizacion/), lo cual solo tiene sentido si la cotización **no** apartó nada.
**[SIN FUENTE]** Tiquete y Transacción no se mencionan en ese artículo. Son ventas de mostrador, así que casi con seguridad descargan stock, pero **el manual no lo dice**.

### Cadena de documentos [DOC]

```
Cotización ──► Pedido ──► Factura fiscal
```

En la pantalla de cada sección se puede arrastrar el documento de más arriba:
- En **Cotización**: solo listado de cotizaciones.
- En **Pedidos**: listado de cotizaciones + listado de pedidos.
- En **Facturas**: listado de cotizaciones + listado de pedidos.
— https://ayuda.switch-soft.com/pregunta/como-puedo-ver-comprobantes-creados-previamente/

Facturar desde el documento previo: Ventas → Comprobantes → **Buscar Comprobantes** → filtrar por tipo → botón `+` → **Pagar** → **Terminar**.
— Cotización: https://ayuda.switch-soft.com/pregunta/como-facturo-una-cotizacion/ · Pedido: https://ayuda.switch-soft.com/pregunta/como-facturo-un-pedido/

**Aprobación previa**: si el usuario tiene *"Requiere aprobación Pedido/Cotización"* en SÍ, **sus pedidos no se muestran hasta ser aprobados**. Se configura en Configuración → Usuarios (o → Perfiles).
— https://ayuda.switch-soft.com/pregunta/como-apruebo-pedidos-y-cotizaciones-antes-de-facturar/ y https://ayuda.switch-soft.com/pregunta/hice-unos-pedidos-pero-no-me-aparecen-en-el-modulo-de-ventas-que-puedo-hacer/

### Permisos por tipo de comprobante [DOC]

| Código | Permiso |
|---|---|
| **0001** | **Comprobantes** — acceso al facturador. **Sin 0001 no funciona ninguno de los demás.** |
| 0002 | Factura (facturas fiscales) |
| 0003 | Cotización |
| 0004 | Pedido |
| 0005 | Abono |
| 0006 | Clientes (crear/editar + acceso a Cancelación Pago a Cuentas) |
| 0291 | Emitir comprobantes tipo **Transacción** (requiere además parámetro de sistema **0164**) |

— https://ayuda.switch-soft.com/pregunta/cuales-son-los-permisos-en-el-modulo%e2%80%afde-ventas/ (0001-0006)
— https://ayuda.switch-soft.com/pregunta/novedades-en-switch-soft-a-enero-2026/ (0291 / 0164)

Nótese que **no hay permiso documentado para Tiquete, "Ventas" ni "Cotización Email"**. Los 4 tipos creables desde el facturador son Factura, Cotización, Pedido y Abono.

---

## 2. 🔴 Tiquete vs Transacción vs Ventas

### Tiquete [DOC]
> "Un 'ticket' es un documento **no fiscal**, que **sustituye al comprobante de caja de un punto de venta**. Aunque la estructura del ticket y de la factura son casi idénticas, los datos que tiene uno y otro son diferentes. La diferencia más importante radica en que un 'ticket' electrónico **no tiene un cliente receptor definido** mientras que la factura sí lo tiene."
> — https://ayuda.switch-soft.com/pregunta/que-es-un-ticket-y-cual-es-la-diferencia-con-una-factura-regular/

Esto **confirma con fuente** la sospecha de que Tiquete = venta de mostrador. Y agrega el dato clave: **no lleva cliente**.

Otros datos de Tiquete:
- Se le pueden hacer notas de crédito (desde dic-2024), con **secuencia de NC distinta** a la de facturas. **No es comprobante electrónico fiscal enviado a la DGI (Panamá).** — https://ayuda.switch-soft.com/pregunta/novedades27diciembre2024/ y https://ayuda.switch-soft.com/pregunta/novedades-en-switch-abril-2025/
- Tiene pie de comprobante propio, hasta 6 líneas de 120 caracteres, configurable por sucursal en Stock → Sucursales → Editar → Pie de Comprobantes → Tiquete. — https://ayuda.switch-soft.com/pregunta/novedades-en-switch-abril-2025/

### Transacción [DOC] — ⚠️ el hallazgo más importante
> "**NUEVO COMPROBANTE: TRANSACCIÓN.** Este es un comprobante **no fiscal** que registra la información de la transacción realizada. El mismo **no emite facturación electrónica** y **tiene un consecutivo propio**. Se habilita con el parámetro de sistema 0164.
> - Este comprobante **reemplaza el llamado Tiquete en Panamá, Guatemala, El Salvador y Honduras**.
> - Aquellos que usaban este tipo de comprobante van a poder **seguir viendo los tiquetes emitidos anteriormente** y luego de la actualización verán además los que llevan nombre comprobante Transacción.
> - En Costa Rica se mantiene el comprobante Tiquete y se adiciona Transacción."
> — https://ayuda.switch-soft.com/pregunta/novedades-en-switch-mayo-2025/ (mayo 2025, solo versión WEB al 22-may-2025)

**Consecuencia para Fashion Group (Panamá):**
- Tiquete y Transacción son **el mismo concepto en dos épocas**. Tiquete = histórico (hasta ~mayo 2025), Transacción = actual.
- Por eso el desplegable tiene los dos: hay que poder consultar el histórico.
- **[INFERENCIA]** Si FG tiene tiquetes viejos, están bajo "Tiquete"; lo nuevo cae en "Transacción". Un reporte que solo mire uno de los dos **parte la serie histórica en mayo 2025**.
- **Ninguno de los dos es fiscal ni va a la DGI.** [DOC]

### "Ventas" [SIN FUENTE]
No aparece en ninguno de los 422 artículos, ni en las páginas, ni en el foro, ni en búsqueda web. **No inventamos qué es.** Es la primera pregunta para soporte.

### "Cotización Email" [SIN FUENTE]
Igual: cero menciones en todo el sitio. Lo único documentado es que **una cotización se puede enviar por email** con el botón "Email" de la pantalla de cotización (https://ayuda.switch-soft.com/pregunta/como-realizo-una-cotizacion/), y que existe un error CODE-0517 al enviar cotización por correo (https://ayuda.switch-soft.com/pregunta/por-que-me-aparece-el-error-code-0517-al-intentar-enviar-una-cotizacion-por-correo/).
**[INFERENCIA, sin confirmar]** podría ser el subconjunto de cotizaciones que efectivamente se enviaron por correo. **No usar como dato.**

---

## 3. 🔴 Abonos — NO son los recibos de pago

Este es el segundo hallazgo grande, y **contradice lo que asumíamos**.

El **Abono** es un tipo de comprobante que se crea **en el facturador, eligiendo artículos** — es un **apartado (layaway)**, no un recibo:

1. **Crear**: Ventas → Comprobantes → botón **"Abono"** → *"Selecciona los artículos que va a abonar el cliente"* → cliente y vendedor → cantidades, precio, %bonificación → **Pagar** → se registra el **primer abono** y su forma de pago → **Terminar** → se puede imprimir un **comprobante no fiscal**.
   — https://ayuda.switch-soft.com/pregunta/como-realizo-un-abono/
2. **Reserva mercancía**: *"Al eliminar un abono, solo se regresa el **producto reservado** al inventario, el dinero continuará en la empresa, mas **no en el estado de cuenta del cliente**."*
   — https://ayuda.switch-soft.com/pregunta/como-elimino-un-abono/
3. **Pagos sucesivos**: Caja y Bancos → **Ingreso de Cobranzas Abono** → cliente → monto. La columna "Documento" muestra el número del abono.
   — https://ayuda.switch-soft.com/pregunta/como-veo-pagos-a-un-abono-ya-creado/
4. **Liquidación → factura fiscal**: Ventas → Comprobantes → Buscar Comprobante → el abono → *"El saldo debería salir en **$0.00**, lo cual indicaría que ya fue cancelado por el cliente. Debes presionar **Terminar** para realizar la factura fiscal."*
   — https://ayuda.switch-soft.com/pregunta/como-genero-la-factura-fiscal-de-un-abono-ya-pago/ y https://ayuda.switch-soft.com/pregunta/como-facturo-un-abono/

**Y no entra al diario de ventas hasta liquidarse** [DOC]:
> "Los abonos a facturas pendientes **no se reflejan inmediatamente en el diario de ventas**. Esto ocurre porque el diario de ventas registra operaciones facturadas o completamente finalizadas. […] Puedes consultar el abono en **Caja y Banco → Analítico de Caja**."
> — https://ayuda.switch-soft.com/pregunta/por-que-un-abono-no-se-refleja-en-el-diario-de-ventas-y-donde-puedo/

### ⚠️ La palabra "abono" está sobrecargada en Switch

Son **dos cosas distintas** y el manual usa la misma palabra:

| | Comprobante **Abono** (Ventas) | **Abono** como pago parcial (Caja y Bancos) |
|---|---|---|
| Dónde se crea | Ventas → Comprobantes → Abono | Caja y Bancos → **Ingreso de Cobranzas** |
| Qué es | Apartado con artículos reservados | Pago parcial contra una **factura a crédito** ya emitida |
| Reporte donde se ve | Ventas → Reportes → Reporte de Comprobante, tipo "Abonos" | Caja y Bancos → Reportes → **Ingreso Cobranzas** |
| Fuente | https://ayuda.switch-soft.com/pregunta/como-realizo-un-abono/ | https://ayuda.switch-soft.com/pregunta/como-puedo-ver-un-recibo-de-abono-en-una-factura-a-credito/ |

Ojo con los dos artículos casi homónimos:
- *"¿Cómo puedo ver un **recibo de abono**?"* → Caja y Bancos → Reportes → **Ingreso de Cobranzas Abono** (los pagos del apartado). https://ayuda.switch-soft.com/pregunta/como-puedo-ver-un-recibo-de-abono/
- *"¿Cómo puedo ver un **recibo de abono en una factura a crédito**?"* → Caja y Bancos → Reportes → **Ingreso Cobranzas** (los pagos de CxC). https://ayuda.switch-soft.com/pregunta/como-puedo-ver-un-recibo-de-abono-en-una-factura-a-credito/

**[INFERENCIA — verificar contra nuestros datos]** Si `switch_recibos` viene del endpoint de recibos/cobranza, corresponde al **Ingreso de Cobranzas** (los pagos de CxC), **no** al comprobante "Abonos" del desplegable de Ventas. Son dos poblaciones distintas y **no deberían compararse ni sumarse**.

---

## 4. Consecutivos, sucursales y terminales [DOC]

Desde el **5 de mayo de 2025**:
- Los comprobantes **Factura, Tiquete, Nota de Crédito, Nota de Débito, Abono, Pedido y Cotización** tienen **número independiente por sucursal**.
- Cada sucursal arranca desde el último consecutivo que tenía la empresa al momento de la actualización.
- Una terminal **sin Factura Electrónica** lleva un consecutivo **distinto** al de las terminales electrónicas.
— https://ayuda.switch-soft.com/pregunta/como-funcionan-los-consecutivos-por-comprobante-si-tengo-varias-sucursales/ y https://ayuda.switch-soft.com/pregunta/novedades-en-switch-abril-2025/

⚠️ **Implicación fuerte**: el número de comprobante **no es único a nivel empresa** después de mayo 2025. Cualquier deduplicación o llave que use solo el número de comprobante está mal — hay que incluir **sucursal** (y probablemente terminal).

**Transacción tiene consecutivo propio**, separado de todo lo anterior. — https://ayuda.switch-soft.com/pregunta/novedades-en-switch-mayo-2025/

---

## 5. Reportes fiscales: X y Z [DOC]

- **Reporte X**: resumen **no fiscal** de las ventas desde el último reporte X. Se puede imprimir varias veces al día; sirve para cambio de cajero. Cierre de caja **parcial**. — https://ayuda.switch-soft.com/pregunta/que-es-un-reporte-x/
- **Reporte Z**: **cierre fiscal** diario. Muestra **todas las facturas y notas de crédito fiscales** de un período de 24 h, resumen de ventas por método de pago, cantidad de facturas y NC, total de ventas gravadas. **Solo se puede emitir una vez cada 24 h.** — https://ayuda.switch-soft.com/pregunta/que-es-un-reporte-z/
- **Por qué el Z no cuadra con el diario de ventas**: el Z se imprimió a mitad del día, o se facturó después de imprimirlo. *"Una factura puede no salir impresa, pero **sí queda registrada**."* — https://ayuda.switch-soft.com/pregunta/porque-no-cuadra-el-reporte-z-con-el-diario-de-ventas/
- **Por qué el X no cuadra**: impresora fiscal apagada/sin papel/desconectada, o un X impreso por otro usuario. Arreglo: Caja y Bancos → Reportes Fiscales → Reimpresión de Comprobantes, verificar que todas las facturas tengan número fiscal. — https://ayuda.switch-soft.com/pregunta/porque-no-cuadra-el-reporte-x/

**[INFERENCIA]** Como el Z solo lista facturas y NC **fiscales**, los Tiquetes/Transacciones **no entran al Reporte Z**. El manual no lo dice de frente, pero es coherente con que ambos sean no fiscales.

### ITBMS: exento vs gravado [DOC]
No hay un cierre diario nativo que separe exento de gravado. La respuesta oficial es:
> "Puedes usar el **reporte de impuestos** ubicado en el módulo **Caja y Bancos**. Aunque el reporte es global por defecto, puedes filtrar por fecha. Otra alternativa es exportar el **reporte de ventas por artículos** (en Excel) y organizar los datos manualmente."
> — https://ayuda.switch-soft.com/pregunta/donde-puedo-ver-un-cierre-diario-que-separe-lo-exento-de-lo-gravado-por-itbms/

---

## 6. Facturar sin control de stock [DOC]

Se configura **por sucursal y por bodega**, no globalmente: Stock → Sucursal (o Bodegas) → Editar → Datos Generales → *"Permite Facturar sin Control de Stock"* → Sí/No.
— https://ayuda.switch-soft.com/pregunta/como-habilito-deshabilito-la-opcion-facturar-sin-control-de-inventario/ y https://ayuda.switch-soft.com/pregunta/como-habilito-la-opcion-de-facturar-sin-control-de-inventario-por-configuracion/

Con la opción en **Sí**, el sistema **permite dejar el stock en negativo** al facturar, pedir o abonar — esa es la causa documentada del "inventario en tránsito negativo".
— https://ayuda.switch-soft.com/pregunta/por-que-mi-inventario-en-transito-esta-en-negativo/

---

## 7. Factura: el flujo y qué se puede editar en la línea [DOC]

Ventas → Comprobantes → seleccionar artículos con `+`. En cada línea se pueden modificar **cuatro** cosas:
- **Cantidad** (bloqueada si hay promociones activas)
- **Descripción** — *"Puedes modificar la descripción **de ser un artículo tipo servicio**"*
- **Precio**
- **%Bonificación** (descuento por artículo; `10` = 10%)

Además hay un **Descuento Global** que se aplica antes de "Pagar".
— https://ayuda.switch-soft.com/pregunta/como%e2%80%afrealizo-una-factura-fiscal%e2%80%af/

**Factura a crédito**: en "Pagar" se elige forma de pago **CRÉDITO**, se puede indicar el plazo, y *"el saldo ahora quedará pendiente para pagar a crédito"* — así nace la CxC.
— https://ayuda.switch-soft.com/pregunta/como-emito-una-factura-a-credito/

## 8. Notas de crédito y débito [DOC]

- **Las notas de crédito no se pueden eliminar.** Para anular su efecto hay que emitir una **nota de débito** con la misma información (mismos artículos, mismo cliente, misma forma de pago), lo que compensa el saldo y deja la cuenta en cero.
  — https://ayuda.switch-soft.com/pregunta/como-elimino-una-nota-de-credito-registrada-en-la-cuenta-de-un-cliente-2/
- **NC por concepto** (contra una cuenta contable, no contra un artículo) sirve para aplicar un descuento a una factura a crédito ya emitida **sin afectar inventario**.
  — https://ayuda.switch-soft.com/pregunta/como-aplico-un-descuento-al-saldo-pendiente-de-una-factura-a-credito/
- Desde mayo 2025 la NC por concepto con cuenta contable **afecta la cuenta de Ventas** (o Total ventas extranjeras). — https://ayuda.switch-soft.com/pregunta/novedades-en-switch-mayo-2025/
- Se puede **desaplicar** una NC ya aplicada a una factura desde **Cancelación Pago a Cuentas**. — https://ayuda.switch-soft.com/pregunta/novedades27diciembre2024/

---

## 9. 🔴 Artículos: dónde vive la descripción y quién la cambia

### El modelo padre/variante [DOC]
> "Las descripciones de los artículos están **vinculadas al código base** del producto principal. […] El código base (ejemplo: «001») **lidera** la descripción del artículo. Las variaciones de talla y color **heredan** esta descripción base. […] Si necesitas agregar el color o talla en la descripción para diferenciar los productos, **la descripción cambiará para TODAS las variaciones asociadas al código base**."
> "No es posible establecer descripciones únicas para cada variación […] Si necesitas descripciones únicas, deberás **registrar cada variación como un artículo independiente con su propio código base**."
> — https://ayuda.switch-soft.com/pregunta/como-puedo-modificar-la-descripcion-de-un-articulo-por-cada-talla-y-color-sin-que-se-cambie-para-todos-los-productos-asociados/

**La descripción es del artículo padre, no de la variante.** Es un campo **compartido y mutable**, no una copia por registro.

### Dónde se crea/edita [DOC]
- Crear a mano: Stock → Artículos → "Crear Artículo". Pestañas **Datos Generales** (Código, **Descripción**, Referencia, Rubro, Sub-Rubro, Imagen, Unidad de Medida, Tipo, Tasa de Impuesto, Marca), **Datos Particulares** (Proveedor, Origen, **Costo**, Precio por Defecto, Bonificación, Mínimo Stock, Stock Ideal), **Códigos de Barra**. — https://ayuda.switch-soft.com/pregunta/como-crear-un-producto-servicio-manualmente/
- Masivo: Stock → Importar / Editar Artículos → "Descargar Plantilla Modelo". — https://ayuda.switch-soft.com/pregunta/como-creo-productos-utilizando-la-plantilla-excel/
- Editar: Stock → Artículos → ícono lápiz. Rutas internas citadas: `/articulos/editar`, `/articulos/mostrar`.
- **Cambiar el código** NO se hace con la plantilla normal (duplicaría): existen `Stock → Actualizar Código` y `Stock → Actualizar Código de Barra`. — https://ayuda.switch-soft.com/pregunta/como-actualizar-los-codigos-de-los-articulos-mediante-una-plantilla-de-excel-sin-que-aparezca-el-error-codigo-de-articulo-no-existe/
- Tipos de artículo: `01` Producto · `02` Servicio · `03` Producto por peso · `04` Producto por precio · `05` Combo.
- **Error 0014** = el código ya existe, **incluidos los inactivos**. — https://ayuda.switch-soft.com/pregunta/que-es-error-0014-al-crear-un-articulo/

### Quién puede cambiar el nombre en el facturador [DOC]
> "Para permitir que un usuario edite la descripción del producto en el facturador: Configuración → Usuarios. Edita el usuario. Activa la opción **«Configuración impresión de pedido en comando 0065»**. Esto habilita la edición del nombre del artículo durante la facturación."
> — https://ayuda.switch-soft.com/pregunta/como-doy-permiso-a-un-usuario-para-editar-el-nombre-del-producto-en-el-facturador/ (y su duplicado https://ayuda.switch-soft.com/pregunta/como-dar-permiso-para-editar-el-nombre-del-producto-en-el-facturador/)

⚠️ El nombre del permiso **0065** ("Configuración impresión de pedido en comando") **no tiene relación semántica** con editar nombres de producto. Es un permiso reutilizado o mal etiquetado. Es el **único** permiso documentado que toca el nombre del artículo.

En el facturador web, sin ese permiso, la Descripción solo se edita **si el artículo es tipo servicio**:
> "Descripción: Puedes modificar la descripción **de ser un artículo tipo servicio**."
> — https://ayuda.switch-soft.com/pregunta/como%e2%80%afrealizo-una-factura-fiscal%e2%80%af/

En la **app móvil no existe** edición de artículo; solo precio/cantidad/descuento dentro del comprobante. — https://ayuda.switch-soft.com/pregunta/como-cambio-los-detalles-de-un-producto/

### 🔴 ¿Switch reescribe la historia de ventas con el nombre actual?

**[SIN FUENTE] — el manual no lo dice ni a favor ni en contra.** Se buscó en los 422 artículos por `histórico`, `historial`, `retroactivo`, `ya emitido`, `ya facturado`, `comprobantes anteriores`, `reimprimir`: **cero resultados sobre este punto**.

Lo que sí aporta el manual, y hay que sopesar:
1. **[DOC]** La descripción es un campo compartido del código base, y cambiarla **repinta todas las variantes**. Es mutable por diseño. → coherente con nuestro hallazgo.
2. **[DOC]** Existe un concepto **separado** llamado **"detalle"**, editable por línea en el facturador, que tuvo que ser **agregado explícitamente a la impresión del comprobante** en dic-2024:
   > "Se permite **editar detalle de artículo** ya sea servicio o producto al seleccionarlo en el facturador y no solo cuando ya esté en el carrito."
   > "Se **incluye el detalle** para que aparezca **en la impresión del comprobante** (Factura, Nota de Crédito y Tiquete)."
   > — https://ayuda.switch-soft.com/pregunta/news10dic/
3. **[INFERENCIA, sin confirmar]** El comprobante imprimiría el **detalle** de la línea cuando existe, y la **descripción del maestro** cuando no. Si es así, la línea sin detalle propio se resuelve por join contra el maestro al reimprimir — que es exactamente el mecanismo que produciría la reescritura que observamos.

**El manual no permite cerrar esta pregunta. Hay que medirlo contra la API o preguntarle a soporte.** Nuestra observación empírica (Switch reescribe el nombre histórico) **no está contradicha** por el manual, y el punto 1 la hace plausible.

### Artículos eliminados [DOC]
Es **soft delete** y **el código queda quemado**:
> "Los artículos eliminados **pasan a la lista de artículos inactivos**. En esta lista los artículos **no pueden ser facturados** y **los códigos no pueden ser utilizados en otros artículos**."
> — https://ayuda.switch-soft.com/pregunta/que-sucede-con-los-articulos-eliminados/

Verlos: filtro Estatus = Inactivo. Reactivar: mismo filtro → lápiz corrector. Inactivación masiva por Excel (`Stock → Artículos → Inactivar Artículos`) **requiere stock en cero**.

### Costos del artículo [DOC — poco y disperso]

| Costo | Lo que dice el manual |
|---|---|
| **Costo** | Campo en "Datos Particulares": *"el costo del artículo por unidad"*. Editable a mano o por plantilla. |
| **Costo FOB** | **Una sola mención** en todo el sitio: *"Al descargar excel del listado de artículos se incluye el costo FOB."* Sin definición ni dónde se captura. — https://ayuda.switch-soft.com/pregunta/news10dic/ |
| **Costo CIF** | Dos menciones, ambas en reportes: *"al descargar excel se incluye precio individual de venta, **costo CIF individual** y utilidad en %"* (reporte de inventario y de ingreso de mercancía). — https://ayuda.switch-soft.com/pregunta/novedades-switch-10-de-marzo-2025/ |
| **Costo promedio** | Campo **distinto** de "costo": el Informe de Producto lo muestra aparte, y producción *"actualiza los costos del producto (costo promedio, costo)"* — son dos campos. |

> "Si el artículo tiene dos costos diferentes pero deseas llevar el inventario de **manera separada**, crea **dos artículos** […] con códigos y costos diferentes. Si deseas llevar el inventario **unificado y obtener un precio promedio**, deberás ingresar el **costo del producto cada vez que se haga un ingreso de mercancía** al stock."
> — https://ayuda.switch-soft.com/pregunta/como-creo-un-articulo-con-dos-costos-diferentes/

**[SIN FUENTE]** El manual **no define** qué es FOB vs CIF en Switch, **no dice** dónde se captura el FOB, **no publica** la fórmula del CIF (si prorratea flete/seguro/impuestos) ni la del costo promedio, y **no dice** cuál de los tres costos usa la utilidad de las ventas. Todo eso hay que medirlo contra la API.

Relacionado: permiso **0205** "Ver costo y utilidad del artículo". Kardex del artículo (ingresos, ajustes, facturas, NC) en la pestaña "Kardex" del ícono del ojo. — https://ayuda.switch-soft.com/pregunta/como-puedo-ver-los-movimientos-de-un-articulo-y-saber-su-disponibilidad-en-las-bodegas/

### Combos [DOC]
Artículo tipo `05 – Combo`, creado en 2 pasos (crear artículo → Stock → Combos → agregar componentes y cantidades). Los componentes **se siguen pudiendo vender sueltos**.
> "El combo **toma los costos de sus componentes**. Al guardar **pregunta si desea actualizar el costo del combo** […] Se parametriza con el **código de parámetro 0152**."
> — https://ayuda.switch-soft.com/pregunta/news10dic/

### Caracteres válidos — ⚠️ contradicción en el manual
- Plantilla Excel (2021): Descripción *"no se permiten tildes o la Ñ y tiene un límite de 75 caracteres"*. — https://ayuda.switch-soft.com/pregunta/como-creo-productos-utilizando-la-plantilla-excel/
- Guía de Caracteres Válidos (2026): Descripción **sí** permite ñ/Ñ y tildes, más `, ; ( ) $ @ * = # & ! % + / _ . -`. Ejemplo: `Camisa de algodón, talla M (100% Ok!)`. — https://ayuda.switch-soft.com/pregunta/guia-de-caracteres-validos-en-switch-soft/
- En ambos: el **Código** NO admite tildes, ñ ni espacios.

---

## 10. Estado de cuenta y cartera

### Dos caminos distintos [DOC]
- **Ventas → Clientes → ícono del ojo**: pestañas **Histórico** (todo) y **Pendiente** (lo que debe). Botones Descargar / Excel / Imprimir. — https://ayuda.switch-soft.com/pregunta/como-verifico-el-estado-de-cuenta-de-un-cliente/
- **Reportes → Estado de cuenta cliente**: filtro de cliente → Generar → Descargar (Imprimir / PDF / Excel). — https://ayuda.switch-soft.com/pregunta/como-puedo-exportar-los-estados-de-cuenta-cliente/

### Antigüedad de deuda [DOC]
Reportes → Estado de cuenta cliente → pestaña **Antigüedad de la deuda**. **Sin filtrar cliente = reporte general de todos**, agrupado por rangos de días, incluidos los saldos **mayores a 121 días**.
— https://ayuda.switch-soft.com/pregunta/como-puedo-generar-un-estado-de-cuenta-resumido-por-antiguedad-de-deuda/

### Envío por email [DOC]
- **Manual**: cargar correo en Ventas → Cliente → lápiz → Datos Generales. Luego Ventas → Cliente → ojo → pestaña Estado de Cuenta → botón del avión de papel ("EMAIL"). Envía el estado de cuenta **pendiente**. — https://ayuda.switch-soft.com/pregunta/como-envio-el-estado-de-cuenta-de-un-cliente-por-email-desde-switch/
- **Automático programado**: Configuración → Configuración → solapa Configuración sistema → **"Periodo envío estado de cuenta" (parámetro #0150)**. Opciones: No enviar / Semanal (lunes) / Quincenal (1 y 16) / Mensual (día 1). Requiere que el **Contacto Contable** del cliente tenga "Nombre" y "Correo" llenos y válidos, y que el sistema tenga habilitada la opción **0149** — *"consulta con tu asesor comercial si implica **cargos extra**"*. — https://ayuda.switch-soft.com/pregunta/switch-puede-enviar-de-forma-automatica-los-estados-de-cuenta-a-mis-clientes/

### Campos que se le fueron agregando [DOC]
- Límite de crédito y tiempo de morosidad; datos de la empresa en el Excel (mar-2025). — https://ayuda.switch-soft.com/pregunta/novedades-switch-10-de-marzo-2025/
- Columna **"comentario"** con los comentarios de **factura y recibo** (ene-2026). — https://ayuda.switch-soft.com/pregunta/novedades-en-switch-soft-a-enero-2026/
- **Fecha de vencimiento de cada factura**, en la descarga opción **"detalle saldos"** (mar-2026). — https://ayuda.switch-soft.com/pregunta/novedades-en-switch-a-marzo-2026/

**[SIN FUENTE]** El manual **no describe la estructura de columnas** del estado de cuenta ni **cómo se calcula el saldo por documento**. Solo dice que "muestra el saldo pendiente del cliente".

### Facturas a crédito [DOC]
- Emitir: forma de pago **CRÉDITO** → se puede ingresar el plazo **u omitirlo** con "Aceptar" → el saldo queda pendiente. — https://ayuda.switch-soft.com/pregunta/como-emito-una-factura-a-credito/
- **Días de crédito automáticos**: Ventas → Clientes → lápiz → pestaña **Datos Financieros** → Límite de crédito ($) y días de crédito / Tiempo de morosidad. *"Esto evitará tener que ingresarlos manualmente en cada factura."* — https://ayuda.switch-soft.com/pregunta/puedo-configurar-los-dias-de-credito-de-un-cliente-para-que-se-apliquen-automaticamente-al-facturar/
- Descuento al saldo pendiente: **no se edita la factura**; se crea un artículo tipo Servicio por el monto y se emite **NC por Concepto** con forma de pago Crédito. Explícitamente **sin afectar inventario**. — https://ayuda.switch-soft.com/pregunta/como-aplico-un-descuento-al-saldo-pendiente-de-una-factura-a-credito/

### Anular vs Desaplicar — no son lo mismo [DOC]
Caja y Bancos → **Recibos**:
- **Anular** = eliminarlo del sistema.
- **Desaplicar** = regresar el monto a la cuenta del cliente.

Para revertir del todo hay que hacer **las dos, en orden desaplicar → anular**.
— https://ayuda.switch-soft.com/pregunta/como%e2%80%afanulo-un-pago-de-factura-a-credito-y-pagos-a-cuenta-del-cliente/ y https://ayuda.switch-soft.com/pregunta/como-puedo-reversar-un-pago-aplicado-por-error-a-un-cliente/

### Orden obligatorio: NC sobre factura que ya tiene pago [DOC]
1. Caja y Bancos → Recibos → **desaplicar y anular** el recibo.
2. Recién entonces Ventas → Comprobantes → Nota de Crédito sobre la factura.
— https://ayuda.switch-soft.com/pregunta/como-hacer-una-nota-de-credito-a-una-factura-que-ya-tiene-un-abono-aplicado/

### Notas de crédito: inventario y fecha [DOC]
- **Devuelven el producto al inventario automáticamente.** Se verifica en el Kardex del artículo (movimiento de entrada). — https://ayuda.switch-soft.com/pregunta/al-realizar-una-nota-de-credito-el-producto-vuelve-al-inventario/
- **No se puede modificar la fecha de emisión** de factura, NC ni ND — la ND correctora sale con fecha de hoy. — https://ayuda.switch-soft.com/pregunta/puedo-emitir-una-nota-de-debito-con-la-misma-fecha-que-una-nota-de-credito-previamente-creada/
- **Factura de año fiscal cerrado**: *"Como el período fiscal ya cerró, **no puedes generar una NC directa** sobre la factura del año anterior"* → NC por concepto con artículo tipo servicio. — https://ayuda.switch-soft.com/pregunta/como-emitir-una-nota-de-credito-por-una-devolucion-de-mercancia-de-una-factura-del-ano-pasado/

**[SIN FUENTE] Signo de la NC**: el manual **nunca dice** explícitamente "la NC resta". Lo más cercano es que el reporte Total de Ventas muestra *"el total de facturas emitidas **contra** las notas de crédito aplicadas"* y que los puntos *"se restarán"*. Nuestra regla de signos contables **no está contradicha**, pero tampoco confirmada por escrito.

### Cancelación Pago a Cuentas [DOC] — ⚠️ con contradicción
Pantalla de **cruce/compensación** entre saldos a favor y saldos pendientes del mismo tercero, sin mover dinero.
- Clientes: Ventas → Clientes → ojo → Estado de Cuenta → "Cancelación Pago a Cuentas". **Débitos** = saldos pendientes; **Créditos** = saldos a favor. — https://ayuda.switch-soft.com/pregunta/como-cancelo-un-pago-a-cuentas-de-clientes-utilizo-un-credito-a-favor-del-cliente-para-pagar-una-factura-a-credito/
- Proveedores: Compras → Proveedores → "Cancelación pago a cuentas". — https://ayuda.switch-soft.com/pregunta/como-aplico-una-cancelacion-pago-a-cuentas-con-credito/

⚠️ **Los dos artículos definen Débitos/Créditos al revés uno del otro.** El de proveedores dice "Créditos: las facturas a crédito" y "Débitos: saldos a favor". No sabemos cuál refleja la pantalla real — **verificar antes de construir nada encima**.

También: *"**No** es posible [facturar a crédito sin afectar reportes contables]. Se recomienda utilizar factura a crédito con **cancelación pago a cuentas** o el **ingreso de cobranza**."* — https://ayuda.switch-soft.com/pregunta/es-posible-realizar-facturas-a-credito-y-que-al-cancelar-no-afecte-los-reportes-contables/

---

## 11. Compras e ingreso de mercancía

### El flujo son 3 etapas en 3 módulos distintos [DOC]
1. **Crear la OC** — Compras → Órdenes de Compra. Proveedor, sucursal, artículos, cantidades y **costo unitario**. — https://ayuda.switch-soft.com/pregunta/cual-es-el-proceso-para-realizar-una-orden-de-compra-completa/
2. **Ingresar al stock** — **Stock** → Ingreso de Mercancía → botón "Orden de Compra" → buscar la OC → se pueden agregar/eliminar artículos → "Ingresar Mercancía".
3. **Comprobante del proveedor y pago** — Compras → Ingreso de Comprobantes → botón naranja de Orden de Compra → *"conviértela en el comprobante necesario"*. Pago: Compras → Proveedores → Pago a Proveedor. — https://ayuda.switch-soft.com/pregunta/como-registro-el-pago-a-mi-proveedor-despues-de-haber-creado-una-orden-de-compra/

**Gotcha [DOC]**: editar una OC **genera una OC nueva con número nuevo** (parámetro **0151**). — https://ayuda.switch-soft.com/pregunta/como-generar-una-nueva-orden-de-compra-al-editar-la-original/

**Restricción dura [DOC]**: con **control por lote** activo **no se puede** ingresar mercancía desde una OC; hay que hacerlo manual. — https://ayuda.switch-soft.com/pregunta/puedo-ingresar-mercancia-desde-una-orden-de-compra-con-control-por-lote/

### ⚠️ "Ingreso de comprobantes" ≠ "Recepción de comprobantes" ≠ "Ingreso de mercancía" [DOC]

Tres cosas distintas que se confunden fácil:

| | Módulo | Qué hace |
|---|---|---|
| **Ingreso de mercancía** | **Stock** | Mete la mercancía física al inventario |
| **Ingreso de comprobantes** | **Compras** | Registra **a mano** la factura del proveedor (documento de CxP) |
| **Recepción de comprobantes** | **Compras** | Sube el **XML de factura electrónica** que mandó el proveedor, y **lo envía a Hacienda** |

> "Ingresa al módulo de COMPRAS y luego a la opción **RECEPCIÓN DE COMPROBANTES**. **Sube el archivo XML que su distribuidor le envió.**"
> — https://ayuda.switch-soft.com/pregunta/como-hago-una-recepcion-de-comprobantes-2/
> "El sistema una vez ingresada la factura enviará el comprobante a **Hacienda**. […] Por más de que ingreses dos veces la misma factura, el ingreso no va a repetirse ya que Hacienda tiene el número de factura aprobada."
> — https://ayuda.switch-soft.com/pregunta/que-hago-si-se-ingresa-una-factura-a-recepcion-de-comprobantes-dos-veces/

Estatus de recepción: **Caja y Bancos** → Reportes Fiscales → Recepción Fiscal (columnas "Estatus Envío" y "Estatus Fiscal"). — https://ayuda.switch-soft.com/pregunta/como-veo-el-estatus-de-la-recepcion-de-comprobantes/

### 🔴 Costo CIF — el hueco más grande del manual

**Lo que SÍ dice [DOC]:**
- Existe una pantalla **COSTOS** dentro del ingreso de mercancía, para costos adicionales:
  > "presionar el **icono de costos** si la mercancía ingresada adquirió **costos adicionales como por ejemplo transporte, aranceles, otros**"
  > — https://ayuda.switch-soft.com/pregunta/como-ingreso-una-orden-de-compra-al-modulo-de-stock-cuando-ya-ha-sido-creada/
- El **costo CIF individual** aparece como columna en dos reportes descargables (Reporte de inventario y **Reporte de ingreso de mercancía**):
  > "al descargar excel se incluye precio individual de venta de producto, **costo CIF individual** y utilidad en %"
  > — https://ayuda.switch-soft.com/pregunta/novedades-switch-10-de-marzo-2025/
- **Costo FOB**: una sola mención, como columna del Excel del listado de artículos. — https://ayuda.switch-soft.com/pregunta/news10dic/
- Flujo contable: *"Debes utilizar la cuenta **Inventario en tránsito**. Esta cuenta se afecta **al ingresar el comprobante de la compra**. Luego, cuando se registra el **ingreso de mercancía, el sistema transfiere el valor al inventario final**."* — https://ayuda.switch-soft.com/pregunta/que-cuenta-contable-debo-usar-al-registrar-compras-a-proveedores/

**[SIN FUENTE] — resultado de búsqueda exhaustiva sobre los 422 artículos:**

| Término | Ocurrencias |
|---|---|
| `prorrat*` (prorrateo/prorratear) | **0** |
| `flete` | **0** |
| `seguro` (como componente de costo) | **0** |
| `proporcional` / `se reparte` | **0** |
| `FOB` | **1** (solo nombre de columna) |
| `CIF` | **2** (solo nombre de columna) |

**El manual público NUNCA explica cómo Switch calcula el CIF.** No dice si los costos adicionales se prorratean, ni con qué criterio (valor / unidades / peso), ni cuál de los tres costos (FOB, CIF, promedio) queda en el artículo tras el ingreso, ni cuál usa la utilidad de las ventas.

**[INFERENCIA]** Que exista la pantalla COSTOS para transporte/aranceles **y** que el reporte de ingreso de mercancía exponga un "costo CIF **individual**" (por artículo) sugiere que Switch sí prorratea a nivel de línea. **Pero es inferencia a partir de dos frases sueltas — no lo tomes como dato.**

### Corregir un costo NO reescribe la historia [DOC — importante]
La receta oficial para arreglar artículos facturados con costo malo es: NC a todas las facturas → ajuste a stock cero → reingreso con costo correcto → **refacturar**. Con la advertencia:
> "**Nota: Este proceso aplica a partir de la fecha en que se realicen los ajustes.**"
> — https://ayuda.switch-soft.com/pregunta/como-puedo-ajustar-el-inventario-de-articulos-con-costo-cero-debido-a-mercancia-en-consignacion/

**[INFERENCIA]** Que obliguen a refacturar implica que **el costo histórico de ventas pasadas no se recalcula**. Contrasta con lo que observamos en la **descripción**, que sí se reescribe. Si ambas cosas son ciertas, Switch **congela el costo por línea pero no el nombre** — vale la pena verificarlo.

### Consignación e inventario en tránsito [DOC]
- **No hay modo consignación.** El workaround oficial es bodega separada + transferir lo vendido + generar comprobantes de proveedor **parciales**. — https://ayuda.switch-soft.com/pregunta/como-ingreso-un-inventario-a-consignacion-y-manejo-ventas-parciales-de-mercancia/
- **En tránsito negativo** = la sucursal tiene activado "Permite facturar sin control de stock, pedido, abono". — https://ayuda.switch-soft.com/pregunta/por-que-mi-inventario-en-transito-esta-en-negativo/
- El **Reporte para Compras** (Compras → Reportes) muestra inventario en tránsito, *"tiempo de tránsito del producto según la última compra"*, meses de inventario, stock mínimo/ideal, y fecha del último ingreso. — https://ayuda.switch-soft.com/pregunta/donde-puedo-encontrar-un-reporte-que-me-ayude-a-hacer-compras/

---

## 12. 🔴 Vendedores — hay TRES niveles, y los reportes no usan el mismo

### Nivel 1 — vendedor por defecto = atributo del **usuario** [DOC]
> "El vendedor que aparece por defecto en la factura es **el que está asignado al usuario** que está realizando la venta. […] Configuración → Usuarios → lápiz → Datos del Usuario → campo **'Vendedor asignado'**. […] cada vez que ese usuario facture aparecerá automáticamente el vendedor actualizado **y podrá cambiar al vendedor**."
> — https://ayuda.switch-soft.com/pregunta/como-cambio-el-vendedor-que-aparece-por-defecto-al-momento-de-facturar/

### Nivel 2 — vendedor **por línea/artículo** [DOC]
> "Dale clic al botón de **añadir vendedor**. Este se encuentra **al lado derecho del 'ITBMS'** con el ícono de un miembro y el signo de más. **Podrás asignar un vendedor por producto en la lista a facturar.**"
> — https://ayuda.switch-soft.com/pregunta/como-asigno-varios-vendedores-a-una-factura/

### Nivel 3 — "Vendedor Principal de la factura" [DOC]
Existe como concepto distinto del vendedor de línea, y **los reportes eligen uno u otro**:
> "**No se contempla Productos por Vendedor sino el vendedor del comprobante.** […] Muestra la sucursal, **Vendedor (Vendedor Principal de la factura)**, Cliente, Artículo, Descuento por Línea, Descuento Global…"
> — https://ayuda.switch-soft.com/pregunta/news10dic/ (spec del Reporte de Descuentos por Usuario)

⚠️ **Coexisten dos vendedores por factura** — el del comprobante (principal) y el del producto — **y distintos reportes usan distintos**. Es una fuente estructural de descuadre si un cálculo de comisiones cruza reportes diferentes.

### 🔴 El vendedor del recibo NO es el vendedor de la venta [DOC]
Artículo completo, íntegro:
> **"No, pueden ser diferentes. El vendedor del recibo es quien **procesó el pago**, mientras que la venta pudo haber sido realizada por otro vendedor."**
> — https://ayuda.switch-soft.com/pregunta/el-vendedor-del-recibo-y-el-vendedor-de-la-venta-son-iguales/

**Ésta es la fuente oficial para justificar que la comisión no se puede calcular desde recibos.**

### Comisiones — el manual es casi mudo
El artículo completo sobre cómo asignar el %:
> "Para agregar el % de comisión al vendedor debes ingresar al **módulo de ventas, opción vendedores**, consultas el vendedor y presionas el ícono del lápiz para editarlo, ahí podrás colocar la información."
> — https://ayuda.switch-soft.com/pregunta/como-asigno-un-porcentaje-de-comision-a-un-vendedor/

Eso es **todo**. La palabra "comisi\*" aparece en solo **4 de los 422 artículos**, y dos son sobre consignación.

**[SIN FUENTE]** El manual **nunca dice cuál es la base de la comisión** (venta, utilidad o cobrado), ni si aplica a subtotal o total, ni si las NC restan, ni cuándo se devenga, ni la ruta del reporte de comisiones.
La única mención del **Reporte de comisiones** es que *"se incluye utilidad en $ y %"* y que esas columnas están amarradas al permiso **0205 "Ver costo y utilidad del artículo"** — que es un permiso de **visibilidad de márgenes**, no de acceso al reporte. — https://ayuda.switch-soft.com/pregunta/news10dic/

⚠️ Nuestra regla `base = venta (subtotal_con_descuento) de facturas con utilidad>20%` **no está ni confirmada ni contradicha** por el manual. No hay fuente.

### "Ventas por vendedor" no existe como reporte [DOC]
Es **Productos por Vendedor** en dos modos de agrupación:
- Un vendedor: Reportes → Productos por Vendedor → seleccionar vendedor → lupa → artículos que vendió.
- Todos: campo **"Personalizar Búsqueda"** → **"Ordenado por Vendedor"** → Vendedor = **Todos** → PDF con *"las ventas agrupadas y totalizadas por cada vendedor"*.
— https://ayuda.switch-soft.com/pregunta/como-puedo-ver-un-reporte-de-ventas-por-vendedor/

Ojo: el **Dashboard** (Reportes → Dashboard) también muestra "vendedores con más ventas" — otro camino, **otro número posible**. — https://ayuda.switch-soft.com/pregunta/como-accedo-a-reportes-generales-del-sistema/

**Reporte por usuario ≠ por vendedor ≠ por sucursal** [DOC]: *"El reporte por **usuario** te permite ver el total de ventas realizadas en el día bajo ese **usuario** en diferentes sucursales y bodegas. El reporte por **sucursal** te muestra el total de ventas de esa única sucursal."* — https://ayuda.switch-soft.com/pregunta/que-es-el-reporte-por-usuario-y-el-reporte-por-sucursal/

**Novedad ene-2026**: **ABM de Vendedores** con **líneas de negocio y categorías**, bajo permiso **0290**. — https://ayuda.switch-soft.com/pregunta/novedades-en-switch-soft-a-enero-2026/

---

## 13. 🔴 Sesión única — NO está documentada (resultado negativo)

Se buscó en los 422 artículos por: `sesión`, `sesion`, `concurrente`, `simultáne`, `misma cuenta`, `cierra la sesión`, `credencial`, `un solo usuario`, `una sola sesión`, `mismo usuario`, `dispositivo`, `token`, `expira`, `inicio de sesión`, `desconecta`, `otro equipo`, `otra computadora`, `licencia`.

**Cero menciones** a sesión única, sesión concurrente, expulsión del usuario anterior, o límite de sesiones/dispositivos.

Todo lo que aparece con "sesión" es una sola cosa: *"cerrá sesión y volvé a entrar para que apliquen los cambios"* (tras editar permisos).

Lo único adyacente:
> "Para utilizar la aplicación, uno debe ser cliente de Switch y tener acceso a la Plataforma. **El usuario es el mismo** que uno utiliza al ingresar a la plataforma a través de la página web. **La contraseña es la misma**."
> — https://ayuda.switch-soft.com/pregunta/con-que-credenciales-debo-ingresar-a-la-aplicacion/

…pero **no dice** si se puede estar logueado en app y web a la vez.

**Conclusión: el comportamiento de sesión única que observamos en la API no está documentado ni desmentido. No hay fuente pública. Hay que preguntárselo a soporte.**

---

## 14. Usuarios, perfiles y catálogo de códigos

### Crear usuario [DOC] — el flujo oficial es reciclar, no crear
> "Ve al módulo de configuración → Usuarios → **Selecciona uno de los usuarios que viene por default en el sistema** → lápiz gris para editar → llena los datos → actualizar."
> — https://ayuda.switch-soft.com/pregunta/como-crear-un-nuevo-usuario-con-todos-los-accesos/

La otra versión menciona `Configuración → Usuarios → Usuarios Inactivos` y "Agregar Usuario (**si el sistema lo permite**)". — https://ayuda.switch-soft.com/pregunta/como-creo-un-nuevo-usuario-con-todos-los-accesos-y-establezco-su-contrasena/
**[INFERENCIA]** Coherente con licenciamiento por número de usuarios. El manual no lo explica.

### Perfiles [DOC]
> "**Perfil es un cargo asignado a un usuario con limitaciones determinadas** según sus funciones. […] Configuración → Perfiles → editar → **los permisos estarán divididos por módulos**. Para asignar: Configuración → Usuarios → editar → parámetro **'Perfil'**."
> — https://ayuda.switch-soft.com/pregunta/como-le-asigno-un-perfil-a-un-usuario/

**[SIN FUENTE]** El manual **nunca explica la precedencia entre perfil y permiso individual** (¿el perfil pisa lo individual? ¿se suman?).

### ⚠️ El manual mezcla dos numeraciones distintas con formato idéntico

**PERMISOS DE USUARIO** (Configuración → Usuarios → Permisos)

| Código | Nombre |
|---|---|
| 0001 | Comprobantes — acceso al facturador. **Prerrequisito de 0002-0005 y 0291** |
| 0002 / 0003 / 0004 / 0005 | Factura / Cotización / Pedido / Abono |
| 0006 | Clientes — crear/editar + acceso a cancelación pago a cuentas ingreso |
| 0015 | Ajuste de inventario |
| 0042 | Configuración de cupones de descuento |
| **0065** | "Configuración impresión de pedido en comando" — **habilita editar el nombre del artículo en el facturador** (etiqueta engañosa) |
| 0087 | Reporte Factura |
| 0102 | Reimpresión de Comprobantes |
| 0138 | **Mostrar todas las sucursales** |
| 0153 | Crear forma de pago concepto otra moneda *(lo activa Soporte)* |
| **0194** | **Facturar/ver clientes creados por otros usuarios** |
| **0205** | **Ver costo y utilidad del artículo** — gobierna columnas de costo/utilidad (Reporte de comisiones, Total de Ventas) |
| 0231 | Traslado de recibo de clientes |
| 0279-0283 | Producción (guía, producción, insumos, reporte, proyección) |
| 0285 | Reporte de descuentos |
| 0286 | Actualizar tasa de forma de pago |
| 0289 | Comprobante Futuro (crear pedidos a futuro) |
| 0290 | Ver el ABM de Vendedores |
| **0291** | **Emitir comprobantes de Transacción** (requiere 0001) |

**PARÁMETROS DE SISTEMA** (Configuración → Configuración → "Configuración Sistema") — **no son permisos**

| Código | Nombre |
|---|---|
| 0014 | Artículos en forma de lista en el facturador |
| 0028 | Sistema con lote activo |
| 0034 | Pedir password para eliminar artículo en el facturador |
| 0040 | Ingreso de mercancía con stock ideal |
| 0057 | Registro de cheque recibido |
| **0149 / 0150** | Envío automático de estado de cuenta / "Período envío estado de cuenta" |
| **0151** | Nueva orden de compra al actualizar la original |
| 0152 | Actualizar costo del combo desde componentes |
| 0162 | Comprobante Futuro *(lo habilita Soporte)* |
| **0164** | **Comprobante tipo Transacción** |
| 0165 | En `false`: no agrupar cuentas contables repetidas en asientos manuales |
| 0174 | Cupones de descuento |
| 0176 | Con valor `01`: descarga del Libro de Compras (Guatemala) |

*(Códigos de **error**, no confundir: 0014 "código de artículo no existe", 0280 error de NC por concepto, CODE-0517 cotización por correo, CODE0458, 0710.)*

**[SIN FUENTE]** No hay catálogo completo de permisos publicado — solo la lista de Ventas (0001-0006) y menciones sueltas en las Novedades. **No existe artículo con los permisos del módulo Stock.**

---

## 15. ⚠️ Advertencias sobre este KB como fuente

- **~25 pares de artículos casi idénticos con URLs distintas.** Ej.: recepción de comprobantes (dos), vendedor predeterminado (dos), eliminar NC (dos), conciliación bancaria (dos). **Y no siempre dicen lo mismo**: en el par de "vendedor predeterminado", una versión aclara *"y podrá cambiar al vendedor"* y la otra no.
- **Hay artículos vacíos.** Ej.: *"¿Cómo desaplicar un recibo y volverlo a aplicar correctamente?"* — solo título, cero contenido: https://ayuda.switch-soft.com/pregunta/como-desaplicar-un-recibo-y-volverlo-a-aplicar-correctamente/ · Y *"¿Cómo hago un reporte?"* cuyo cuerpo entero dice: `Reporte, prueba.`
- **Contradicciones internas sin resolver** (ver §10 Cancelación Pago a Cuentas, y §9 caracteres válidos).
- **Mucho contenido es de 2021** y describe un sistema que cambió (el desplegable de hoy no coincide con los artículos de 2021).
- **El material más confiable y actual son las Novedades** (`modulos/updates/`), que están fechadas.

---

## 16. 🔴 Preguntas pendientes para el soporte de Switch

Ordenadas por impacto para nosotros:

1. **¿Qué es el tipo "Ventas" del desplegable de Reportes de comprobantes?** ¿Es un consolidado de facturas + transacciones + tiquetes? No está en el manual.
2. **¿Qué es "Cotización Email" y en qué se diferencia de "Cotización"?** ¿Son las cotizaciones efectivamente enviadas por correo? No está en el manual.
3. **¿Tiquete y Transacción descargan inventario?** El artículo que lista qué resta stock solo menciona factura, pedido y abono.
4. **Si cambio la descripción de un artículo, ¿el nombre en facturas ya emitidas cambia o se conserva?** Cero documentación. Es nuestra pregunta más cara.
5. **¿Cómo se calcula el costo CIF?** ¿Los costos adicionales (transporte, aranceles) se prorratean por valor, por unidades o por peso? ¿Qué costo queda en el artículo tras el ingreso: FOB, CIF, último o promedio ponderado?
6. **¿Cuál es la base de la comisión del vendedor?** ¿Venta, utilidad o cobrado? ¿Las NC restan?
7. **¿Switch limita las sesiones concurrentes por empresa?** Observamos que un login nuevo echa al anterior. ¿Es por diseño, por licencia, o solo en la API?
8. **¿El comprobante "Abono" genera cuenta por cobrar / aparece en el estado de cuenta del cliente?** El manual nunca lo dice y los indicios apuntan a que no.
9. **En "Cancelación Pago a Cuentas", ¿cuál columna es Débitos y cuál Créditos?** Los artículos de clientes y de proveedores se contradicen.
10. **¿Precedencia entre perfil y permiso individual?**
11. **¿La recepción de XML crea automáticamente el comprobante de CxP?** ¿Y puede alimentar un ingreso de mercancía?
12. **Lista completa de permisos del módulo Stock** — nunca se publicó.

**Contacto**: chat `soporte.switch-soft.com` · WhatsApp +507 6681-7226 · `soporte@switch-soft.com` · L-V 8:00-17:00, Sáb 8:00-14:00 (Panamá).
