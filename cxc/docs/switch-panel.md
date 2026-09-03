# Switch — Manual del panel (resumen)

**Dos fuentes, y no valen lo mismo.**

1. 🥇 **Las 13 guías oficiales en PDF** que Switch le entregó a Daniel (ago-2026), versionadas en **`docs/switch/`**. Son documentación de producto, fechada «Switch Soft © 2026». **Cuando una guía contradice al sitio web, gana la guía** — y en este documento queda dicho que había contradicción.
2. 🥈 **https://ayuda.switch-soft.com/** — base de conocimiento pública, extraída el **2026-08-25**: 422 artículos, todos públicos, **sin login**. Mucho contenido es de 2021 y describe un sistema que ya cambió. Las **90 URLs citadas** se verificaron una por una: todas responden HTTP 200 al 2026-08-25.

Complementa a `docs/switch/api-documentacion.pdf` (que cubre la API, no el panel; su cruce con el código está en `docs/switch-referencia.md`).

> **Cómo leer este documento**
> - **[GUÍA]** = está escrito en uno de los 13 PDF oficiales. Se cita **archivo + página**. Es la fuente más fuerte que tenemos.
> - **[DOC]** = está escrito literalmente en el sitio de ayuda. La URL citada lo respalda.
> - **[INFERENCIA]** = deducción nuestra a partir de lo anterior. **No es fuente.**
> - **[SIN FUENTE]** = no aparece **ni en las guías ni en el sitio**. Hay que preguntarle a soporte.
>
> Regla: nunca conviertas una inferencia en dato al citar este documento.

### Las 13 guías oficiales (`docs/switch/`)

| Archivo | Pág. | De qué trata | Dónde se usa acá |
|---|---|---|---|
| `Flujo_articulo_orden_de_compra_switchsoft2026.pdf` | 5 | Crear artículos (manual y por plantilla) + las 3 etapas de la orden de compra | §9, §11 |
| `Parametro de Sistema.pdf` | 10 | **Los 12 parámetros de sistema**, uno por uno, con qué pasa activo y qué pasa inactivo | §11, §14 |
| `Manual de Niveles de Autorización.pdf` | 5 | Las 8 acciones protegidas por PIN y cómo funcionan los niveles 1-5 | §15 |
| `Guia Caracteres Validos.pdf` | 4 | Qué se puede escribir en cada campo de Artículos, Clientes y Proveedores | §9 |
| `Guia_lista_precios_SwitchSoft.pdf` | 3 | Listas de precios: crear, poblar, poner precios y amarrarlas a clientes | §16 |
| `GUIA_PROMOCIONES_SWITCH_SOFT.pdf` | 3 | Promociones tipo «compra 12 y llevás 1 gratis» | §17 |
| `Guia_Puntos_Switch_soft.pdf` | 3 | Acumulación y canje de puntos | §18 |
| `GUIA_NOTA_DE_CREDITO_SWITCHREGULAR.pdf` | 4 | Emitir una nota de crédito | §8 |
| `Guia_CuentasIncobrables_Switch_soft.pdf` | 2 | Dar de baja facturas incobrables con plantilla de saldos negativos | §19 |
| `Guía_toma_de_inventario.pdf` | 4 | Toma de inventario con Switch App en equipos Sunmi | §20 |
| `Guia_facturas_proveedores_switchsoft.pdf` | 4 | Registrar facturas de **gasto** (luz, internet, alquiler) en Compras | §21 |
| `Guía_Switch_Pay_Catalogo.pdf` | 4 | Catálogo web de Switch (Ecommerce) y cobros con SwitchPay | §22 |
| `Codigos Creacion Clientes.pdf` | 3 | Códigos de tipo de cliente, identificación e impuesto por país | §23 |

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
| **Ventas** | **[SIN FUENTE]** — no aparece ni en el sitio ni en las 13 guías | ? | ? | ? |
| **Pedidos** | Documento previo a la factura; se factura desde "Buscar Comprobantes" | **Sí** [DOC] | No [INFERENCIA] | No [INFERENCIA] |
| **Cotización** | Presupuesto; el escalón más arriba de la cadena | **No** [DOC, por omisión] | No [INFERENCIA] | No [INFERENCIA] |
| **Abonos** | **Apartado / layaway**: mercancía **reservada** contra pagos parciales | **Sí — resta y reserva** [DOC] | **[SIN FUENTE]** — el manual nunca lo dice; los indicios apuntan a que **no** | No hasta liquidar; entonces nace la factura fiscal [DOC] |
| **Cotización Email** | **[SIN FUENTE]** — no aparece ni en el sitio ni en las 13 guías | ? | ? | ? |
| *(fuera del desplegable)* **Nota de Crédito** | Anula una factura. **Solo referencia facturas** | Sí — devuelve al stock [DOC] | Depende: devolución de dinero **o** saldo a favor | Sí |

**Lo que aportan las 13 guías oficiales (ago-2026) sobre este punto:**

- **[GUÍA]** La **Nota de Crédito** es su propia pestaña del facturador, al lado de las demás: *"Ventas > Comprobantes […] En la parte inferior de la pantalla verá una barra de opciones. Haga clic en la pestaña «N. Crédito»."* — `docs/switch/GUIA_NOTA_DE_CREDITO_SWITCHREGULAR.pdf`, p. 1.
- **[SIN FUENTE — confirmado en las guías]** Se buscó `Ventas` como tipo de comprobante, `Cotización Email`, `Tiquete`, `ticket`, `Transacción` (como comprobante) y `abono` en el texto completo de las 13 guías: **cero ocurrencias**. Las guías tampoco enumeran el desplegable. Los dos tipos huérfanos siguen sin fuente y **hay que preguntárselos a soporte**.
- **[GUÍA]** El **Pedido** sí aparece, en el contexto de SwitchPay: *"Al procesar y finalizar un pedido, el sistema mostrará automáticamente una ventana con el botón de SwitchPay […] si el cliente realiza el pago desde ese enlace, **el pedido se cancela automáticamente**."* — `docs/switch/Guía_Switch_Pay_Catalogo.pdf`, p. 3. Es la única mención de un pedido cobrándose sin pasar por factura.

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

**[SIN FUENTE — confirmado en las guías]** Ninguna de las 13 guías oficiales menciona la palabra **abono** ni una sola vez. **Sigue sin respuesta si el comprobante Abono genera cuenta por cobrar.** El único indicio disponible sigue siendo el del sitio: al eliminar un abono *"el dinero continuará en la empresa, mas **no en el estado de cuenta del cliente**"* — lo que apunta a que **no** genera CxC, pero es indicio, no dato.

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

## 8. Notas de crédito y débito

### 🥇 La guía oficial [GUÍA] — `docs/switch/GUIA_NOTA_DE_CREDITO_SWITCHREGULAR.pdf`

> "La nota de crédito es un comprobante que **permite anular una factura**." — p. 1

Confirma nuestra regla de negocio: **la NC RESTA**. Es la anulación (total o parcial) de una factura, no un documento independiente.

**Tiene exactamente dos sabores, y la diferencia es la forma de pago** (p. 1 y p. 3):

| Opción | Qué hace | Forma de pago que hay que elegir |
|---|---|---|
| **A · Devolución de dinero** | Se le devuelve la plata al cliente | **El mismo método de pago de la factura original** |
| **B · Saldo a favor** | Queda un crédito que el cliente usa en su próxima factura | **Crédito** |

**Restricciones y detalles [GUÍA]:**
- *"Solo permite **referencias a facturas**"* — una NC no puede colgar de un pedido, de una cotización ni de un abono. — p. 1
- Tiene un campo **Referencia** propio, para detallar el documento referenciado o dejar un comentario. — p. 1
- Se puede referenciar **más de una factura** en una sola NC (botón `+`). — p. 2
- Se localiza la factura **por número fiscal o por número de sistema**. — p. 2
- Antes de guardar se pueden **descartar líneas** (botón X) y **editar cantidades** → por eso existen las **NC parciales**. — p. 2
- Al terminar, **el sistema imprime el comprobante de la nota de crédito**. — p. 3

⚠️ **Sobre la grafía**: la guía escribe siempre **«Nota de Crédito», con tilde**, en título, cuerpo y resumen (p. 1-4). Coincide con el texto que guardamos en la base. **Pero la guía es un PDF de marketing, no el diccionario de datos de Switch** — no prueba con qué cadena exacta viaja el campo por la API. Nuestra regla actual (`'Nota de Crédito'` con tilde) **no está contradicha**, y ahora tiene respaldo documental; el que manda sigue siendo lo medido contra la API.

### Lo demás, del sitio de ayuda [DOC]

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

**[GUÍA] Confirmación y datos nuevos** — `docs/switch/Flujo_articulo_orden_de_compra_switchsoft2026.pdf`, p. 1-3:
- **Permiso para crear/editar artículos: `0199`** ("Usuarios > Crear y Editar Artículo", módulo Configuración). Se activa en Configuración → Usuarios → editar el perfil. **El sitio nunca publicó este código** — es dato nuevo. (p. 1)
- La ruta de la plantilla masiva es **Stock → Artículos → Importar/Editar Artículos** (p. 3).
- **Códigos internos de la plantilla Excel** (p. 3): **Tipo de Artículo** → `01` Artículo (producto), `02` Servicio. **Tasa de Impuesto** → `07` para 7%, `0` para exento. ⚠️ Nótese que la tasa va como **`07`, no como `7`**.
- *"Solo es obligatorio completar las columnas que contengan asterisco rojo (*)"* (p. 3).
- El orden de las pestañas al crear a mano: **Datos Generales** → Guardar → **Datos Particulares** → Guardar → **Códigos de Barra** → `+` para validar → Guardar (p. 2). Es decir, **hay que guardar tres veces**.
- La guía **confirma** el detalle de campos por pestaña que ya teníamos del sitio, y agrega que la Marca es obligatoria: *"Si el artículo no tiene marca, se puede colocar «General»"* (p. 2).

### Quién puede cambiar el nombre en el facturador [DOC]
> "Para permitir que un usuario edite la descripción del producto en el facturador: Configuración → Usuarios. Edita el usuario. Activa la opción **«Configuración impresión de pedido en comando 0065»**. Esto habilita la edición del nombre del artículo durante la facturación."
> — https://ayuda.switch-soft.com/pregunta/como-doy-permiso-a-un-usuario-para-editar-el-nombre-del-producto-en-el-facturador/ (y su duplicado https://ayuda.switch-soft.com/pregunta/como-dar-permiso-para-editar-el-nombre-del-producto-en-el-facturador/)

⚠️ El nombre del permiso **0065** ("Configuración impresión de pedido en comando") **no tiene relación semántica** con editar nombres de producto. Es un permiso reutilizado o mal etiquetado. Es el **único** permiso documentado que toca el nombre del artículo.

**[GUÍA — resultado negativo, pero útil]** `docs/switch/Parametro de Sistema.pdf` documenta **los 12 parámetros de sistema completos** (p. 1, índice) y **0065 NO está entre ellos**. Eso zanja la duda de categoría: **0065 es un PERMISO DE USUARIO, no un parámetro de sistema**, y por eso se activa en Configuración → **Usuarios** y no en Configuración → Configuración. Lo que el 0065 hace exactamente **sigue sin documentarse en las guías**.

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

### 🔑 Caracteres válidos — la guía oficial, campo por campo [GUÍA]

Fuente: `docs/switch/Guia Caracteres Validos.pdf`, p. 1-4. **Esta guía gana** sobre el artículo de 2021 del sitio (ver la contradicción al final).

| Campo | ¿Tildes? | ¿ñ/Ñ? | ¿Espacios? | Símbolos permitidos | Pág. |
|---|---|---|---|---|---|
| **Artículo · Código** | ❌ **No** | ❌ **No** | ❌ **No** | `- / _ . ( ) + *` | 1 |
| **Artículo · Código de Barra** | ❌ No | ❌ No | ❌ No | solo `-` | 1 |
| **Artículo · Referencia** | ✅ Sí | ✅ Sí | ✅ Sí | `, ; ( ) $ @ * = # & ! / _ . -` — **`+` y `%` NO** | 1 |
| **Artículo · Descripción** | ✅ **Sí** | ✅ **Sí** | ✅ Sí | `, ; ( ) $ @ * = # & ! % + / _ . -` | 1 |
| **Artículo · Rubro / Sub-rubro / Marca / Proveedor / Unidad de medida / Temporada / Composición** | ✅ Sí | ✅ Sí | ✅ Sí | `, ; ( ) $ & ! % . -` *(sin `@ * = # / _`)* | 2 |
| **Cliente · Código** | ❌ No | ❌ No | ❌ No | solo `-` | 3 |
| **Cliente · Nombre** | 🔴 **NO** | ✅ **Sí** | ✅ Sí | `, ; ( ) $ @ * = # & ! / _ . -` | 3 |
| **Proveedor · Código y Nombre** | ✅ Sí | ✅ Sí | ✅ Sí | `, ; ( ) $ @ % & ! _ . -` | 3-4 |

Ejemplos que da la propia guía: `ART-001/A.2024(*)` (código), `Camisa de algodón, talla M (100% Ok!)` (descripción), `Distribuidora Peña & Asociados` (nombre de cliente — **con ñ, sin tildes**), `Importadora Núñez & Hnos. S.A.` (nombre de **proveedor** — ahí sí con tilde).

**🔴 Lo que esto explica de nuestros 33 pares de grafías:**

1. **La asimetría acento sí / acento no es de Switch, no nuestra.** En la **Descripción del artículo** las tildes están permitidas; en el **Nombre del cliente** están **prohibidas**, pero la **ñ sí se acepta**. La regla del cliente es literal: *"No se permite: Tildes (á é í ó ú) — sí se permite ñ/Ñ, pero no vocales acentuadas"* (p. 3). Es decir: quien digitó `JOSE` sin tilde en un cliente y `José` con tilde en una descripción **no se equivocó** — el sistema lo obligó.
2. **En Proveedores las tildes SÍ se permiten**, y en Clientes no. Mismo tipo de dato, dos reglas distintas. Cualquier normalización nuestra que trate «cliente» y «proveedor» igual va a estar mal en uno de los dos lados.
3. **[SIN FUENTE] — el doble espacio no lo explica esta guía.** El espacio figura como carácter permitido en Descripción, Referencia, Rubro, Marca, etc., pero **la guía no dice nada sobre espacios consecutivos, ni sobre recorte de espacios al inicio/fin, ni sobre normalización**. Nada indica que Switch colapse `"NIKE  AIR"` a un solo espacio. **Nuestra hipótesis de que el doble espacio viene de una validación de Switch queda sin respaldo: lo más probable es que Switch simplemente lo deje pasar tal cual se digitó.**
4. **[GUÍA] El Código no admite espacios** (p. 1). Todo código de artículo con espacio en nuestra base viene de otro lado, no del alta en Switch.

⚠️ **Contradicción, y quién gana**: el artículo de 2021 del sitio dice que en la plantilla Excel la Descripción *"no se permiten tildes o la Ñ y tiene un límite de 75 caracteres"* (https://ayuda.switch-soft.com/pregunta/como-creo-productos-utilizando-la-plantilla-excel/). La guía de 2026 dice lo contrario: tildes y ñ **sí**. **Gana la guía** — pero ojo, la guía **no menciona el límite de 75 caracteres**, así que ese tope de 2021 **no está desmentido** y conviene seguir respetándolo hasta confirmarlo.

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

**✅ Signo de la NC — ahora sí hay fuente [GUÍA]**: la guía oficial abre diciendo *"La nota de crédito es un comprobante que **permite anular una factura**"* (`docs/switch/GUIA_NOTA_DE_CREDITO_SWITCHREGULAR.pdf`, p. 1). **Anular = restar.** Nuestra regla de signos contables (*"lo que resta, RESTA"*) queda **confirmada por escrito**. Lo que la guía sigue sin decir es con qué signo viaja el monto por la API — eso se mide, no se lee.

### Cancelación Pago a Cuentas [DOC] — ⚠️ con contradicción
Pantalla de **cruce/compensación** entre saldos a favor y saldos pendientes del mismo tercero, sin mover dinero.
- Clientes: Ventas → Clientes → ojo → Estado de Cuenta → "Cancelación Pago a Cuentas". **Débitos** = saldos pendientes; **Créditos** = saldos a favor. — https://ayuda.switch-soft.com/pregunta/como-cancelo-un-pago-a-cuentas-de-clientes-utilizo-un-credito-a-favor-del-cliente-para-pagar-una-factura-a-credito/
- Proveedores: Compras → Proveedores → "Cancelación pago a cuentas". — https://ayuda.switch-soft.com/pregunta/como-aplico-una-cancelacion-pago-a-cuentas-con-credito/

⚠️ **Los dos artículos del sitio definen Débitos/Créditos al revés uno del otro.** El de proveedores dice "Créditos: las facturas a crédito" y "Débitos: saldos a favor".

✅ **RESUELTO por una guía oficial — gana la guía.** `docs/switch/Guia_CuentasIncobrables_Switch_soft.pdf`, p. 2:
> "Seleccione **el crédito** (el saldo que cargó con la plantilla) y **crúcelo contra el débito (las facturas pendientes** a cancelar). […] **El crédito cargado en el Paso 1 representa el saldo anterior, y los débitos son las facturas pendientes.**"

Es decir: **Débitos = facturas pendientes · Créditos = saldos a favor.** La versión del artículo de **clientes** era la correcta; la de **proveedores** está mal escrita. Ver §19.

También: *"**No** es posible [facturar a crédito sin afectar reportes contables]. Se recomienda utilizar factura a crédito con **cancelación pago a cuentas** o el **ingreso de cobranza**."* — https://ayuda.switch-soft.com/pregunta/es-posible-realizar-facturas-a-credito-y-que-al-cancelar-no-afecte-los-reportes-contables/

---

## 11. Compras e ingreso de mercancía

### El flujo son 3 etapas en 3 módulos distintos [DOC]
1. **Crear la OC** — Compras → Órdenes de Compra. Proveedor, sucursal, artículos, cantidades y **costo unitario**. — https://ayuda.switch-soft.com/pregunta/cual-es-el-proceso-para-realizar-una-orden-de-compra-completa/
2. **Ingresar al stock** — **Stock** → Ingreso de Mercancía → botón "Orden de Compra" → buscar la OC → se pueden agregar/eliminar artículos → "Ingresar Mercancía".
3. **Comprobante del proveedor y pago** — Compras → Ingreso de Comprobantes → botón naranja de Orden de Compra → *"conviértela en el comprobante necesario"*. Pago: Compras → Proveedores → Pago a Proveedor. — https://ayuda.switch-soft.com/pregunta/como-registro-el-pago-a-mi-proveedor-despues-de-haber-creado-una-orden-de-compra/

**Gotcha [DOC]**: editar una OC **genera una OC nueva con número nuevo** (parámetro **0151**). — https://ayuda.switch-soft.com/pregunta/como-generar-una-nueva-orden-de-compra-al-editar-la-original/

**Restricción dura [DOC]**: con **control por lote** activo **no se puede** ingresar mercancía desde una OC; hay que hacerlo manual. — https://ayuda.switch-soft.com/pregunta/puedo-ingresar-mercancia-desde-una-orden-de-compra-con-control-por-lote/

**[GUÍA] Los 4 permisos que hace falta tener para el flujo completo** — `docs/switch/Flujo_articulo_orden_de_compra_switchsoft2026.pdf`, p. 4. **Ninguno estaba publicado en el sitio**:

| Código | Módulo | Funcionalidad |
|---|---|---|
| **0014** | **Stock** | **Ingreso de mercancía** |
| **0011** | Compras | Órdenes de compra |
| **0114** | Compras | Ingreso de comprobantes |
| **0117** | Compras | Pago a proveedores |

🔴 **Ojo con el `0014`**: es **permiso de Stock (ingreso de mercancía)** *y también* **parámetro de sistema de Ventas ("Artículos en forma de lista facturador")** *y también* **código de error** ("el código de artículo ya existe"). **Tres cosas distintas con el mismo número.** Ver §14.

**[GUÍA] Detalles del flujo que el sitio no daba** (mismo PDF, p. 4-5):
- Al crear la OC se elige **la bodega** donde entrará la mercancía, y los artículos **tienen que estar creados de antes**.
- Para jalar la OC en Ingreso de mercancía hay que **filtrar por estado «Aprobada»** — una OC sin aprobar no aparece.
- Tras ingresar la mercancía, **Switch abre solo una ventana con acceso directo al registro de la factura del proveedor**. Si se cierra, se llega a mano por Compras → Ingreso de comprobantes → botón **«Referenciar orden de compra»**.
- En el último paso hay dos botones: **«Generar solamente la factura»** (queda pendiente en el estado de cuenta del proveedor) o **«Guardar y pagar»**.

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

### 🔴 Costo CIF — la guía lo aclara a medias

#### 🥇 Lo que dicen las guías oficiales [GUÍA]

**1. El CIF existe porque hay un parámetro que lo enciende: el `0099`.**

> **`0099` · Sistema con manejo de costo FOB** *(módulo: Inventario)*
> "Habilita el manejo de **dos estructuras de costo** en los artículos: **costo FOB (sin fletes ni seguros)** y **costo CIF (con seguro y flete incluidos)**. Orientado a empresas importadoras."
> **Activo:** "Al crear un artículo se habilitan los campos **Costo FOB** y **Costo CIF**. En el ingreso de mercancía aparece la ventana **«Otros Costos»** para registrar **Transporte, Arancel, Impuesto y Otros gastos**."
> **Inactivo:** "Los artículos manejan un **único costo estándar**. El ingreso de mercancía no presenta la opción de costos adicionales."
> — `docs/switch/Parametro de Sistema.pdf`, p. 5

Esta es **la primera definición oficial de FOB y CIF en Switch** que tenemos. Y confirma que nuestras 6 empresas tienen el **`0099` activo** (por eso la plantilla del Depurador lleva las columnas `Costo FOB *` y `Costo CIF *`).

**2. Los costos adicionales se distribuyen entre los artículos.**

> "En este punto existen dos opciones: **Agregar un monto adicional (Costo) para distribuirlo entre los artículos: transporte, aranceles, impuestos u otros.** O simplemente hacer clic en Ingresar para finalizar el proceso."
> — `docs/switch/Flujo_articulo_orden_de_compra_switchsoft2026.pdf`, p. 5 (Paso 2 · Ingreso de mercancía)

**La palabra «distribuirlo» es la confirmación de que Switch prorratea.** Es lo más cerca que llegamos: hasta ahora teníamos `prorrat*` con **0 ocurrencias** en los 422 artículos del sitio.

**3. Los cuatro cubos de «Otros Costos» son exactamente estos cuatro** (p. 5 del PDF de parámetros): **Transporte · Arancel · Impuesto · Otros gastos**.

#### ⛔ Lo que la guía SIGUE sin decir

- **Con qué criterio se distribuye**: ¿por valor de la línea, por unidades, por peso? **No lo dice.**
- **La fórmula**: `CIF = FOB + prorrateo` es lo razonable, pero **la guía no la escribe**.
- **Si el CIF del artículo se sobreescribe** en cada ingreso de mercancía, o si es promedio ponderado, o si es el último. **No lo dice.**
- **Cuál de los tres costos usa la utilidad de las ventas.** **No lo dice.**
- ⚠️ **Bug en la propia guía**: la p. 6 del PDF de parámetros trae un pie que dice *"Ventana «Otros Costos» durante el ingreso de mercancía"* — **pero la captura que muestra es el teclado de PIN de CONTRASEÑA**, repetida del parámetro 0034. **La única captura que habría mostrado la ventana de Otros Costos está equivocada.** Vale la pena pedírsela a soporte.

#### 🔴 Contradice lo que asume nuestro Depurador

Nuestro Depurador calcula **`CIF = FOB × 1.10`** (factor configurable, default 1,1 — `src/app/productos/cargar/DepuradorClient.tsx` y `FormulasConfig.tsx`: *"El Costo CIF ya es costo × 1.1"*) y de ahí saca el precio con **`TECHO(CIF ÷ divisor) + extra`**.

**Switch no hace eso.** Para Switch el CIF no es un múltiplo del FOB: es **FOB más los costos reales de esa importación (transporte + arancel + impuesto + otros) repartidos entre los artículos de ese ingreso de mercancía**. El 10% es **una convención nuestra**, no la regla del sistema.

**Qué significa en la práctica** (esto hay que decidirlo, no arreglarlo por las buenas):

1. **Al dar de alta artículos** con la plantilla del Depurador, el `1.10` es una **estimación** que escribimos nosotros en la columna `Costo CIF *`. Mientras nadie toque «Otros Costos», Switch se queda con ese número y todo cuadra.
2. **Al ingresar mercancía con Otros Costos**, Switch recalcula el CIF con el prorrateo real. Si la importación no costó exactamente 10% sobre FOB, **el CIF de Switch y el nuestro se separan** — y con él, el precio que sale de `TECHO(CIF ÷ divisor)`.
3. En `src/components/ventas/ReferenciaTarjeta.tsx` deshacemos el factor al revés (*"que es CIF ÷ 1,10"*) para recuperar el FOB. **Ese despeje solo es válido si nadie tocó Otros Costos en ese ingreso.**

**Lo que hay que medir** (no está en ninguna guía): comparar, sobre los 34.792 ingresos de compra que ya tenemos cargados, el `costo_api` (que ya validamos que es el CIF) contra el FOB del mismo artículo. Si el cociente no da 1,10 de forma consistente, el factor está mal en los casos que se salgan.

---

#### Lo que decía el sitio de ayuda [DOC] — se mantiene, y ahora encaja

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

## 13. 🔴 Sesión única — SÍ está documentada, en el PDF del API (p. 6), y es por USUARIO

> **Corrección (3-sep-2026).** Este apartado decía «NO está documentada (resultado negativo)». Era verdad para el **sitio de ayuda** y para las **13 guías del panel** —los dos barridos de abajo se conservan porque siguen siendo ciertos—, pero la documentación oficial del **API** (`docs/switch/api-documentacion.pdf`, p. 6) sí lo dice, textual: *«Solo habrá un token válido a la vez por usuario, es decir al realizar una autenticación se tomará este token como el único token válido para este usuario, al realizar la petición con otro token se enviará una respuesta de la siguiente manera: `{ error: { code: 0006, http_code: 401, message: "TOKEN INVALIDO" } }`»*. La misma página explica el `0005` con `new_token` (renovación dentro de los 15 min tras caducar). Cruce completo con el código en `docs/switch-referencia.md` §1.1 y Parte 3, #1.
>
> La restricción es **por usuario**, no «por empresa» como decía el código hasta el 3-sep-2026: coincidía porque cada empresa es su propia instancia de Switch y el sistema entra con un único usuario de API por empresa (`daniel` en 7 de 8). Lo que el PDF **no** dice es si la sesión del **panel web** cuenta como «token» de ese mismo usuario; lo medido en producción (cada login del cron expulsa a Daniel del panel y viceversa) dice que sí. Con un usuario dedicado al API por empresa, según el PDF, serían dos tokens válidos a la vez — hay que medirlo antes de darlo por hecho.

**Lo que sigue son los dos resultados negativos originales (sitio de ayuda y guías del panel), intactos:**

Se buscó en los 422 artículos por: `sesión`, `sesion`, `concurrente`, `simultáne`, `misma cuenta`, `cierra la sesión`, `credencial`, `un solo usuario`, `una sola sesión`, `mismo usuario`, `dispositivo`, `token`, `expira`, `inicio de sesión`, `desconecta`, `otro equipo`, `otra computadora`, `licencia`.

**Cero menciones** a sesión única, sesión concurrente, expulsión del usuario anterior, o límite de sesiones/dispositivos.

Todo lo que aparece con "sesión" es una sola cosa: *"cerrá sesión y volvé a entrar para que apliquen los cambios"* (tras editar permisos).

Lo único adyacente:
> "Para utilizar la aplicación, uno debe ser cliente de Switch y tener acceso a la Plataforma. **El usuario es el mismo** que uno utiliza al ingresar a la plataforma a través de la página web. **La contraseña es la misma**."
> — https://ayuda.switch-soft.com/pregunta/con-que-credenciales-debo-ingresar-a-la-aplicacion/

…pero **no dice** si se puede estar logueado en app y web a la vez.

**[GUÍA — segundo resultado negativo]** Se buscó `sesión`, `sesion`, `login`, `iniciar sesión`, `conectado` y `simultáne` en el texto completo de las **13 guías oficiales**: **cero ocurrencias**. Las guías tampoco hablan de licenciamiento, dispositivos ni concurrencia. La única guía que menciona un login es la de toma de inventario, y solo para decir que en Switch App *"ingrese el dominio del sistema Switch, su usuario y contraseña"* (`docs/switch/Guía_toma_de_inventario.pdf`, p. 2) — **sin decir qué pasa si esa misma cuenta ya está abierta en la web**.

**Conclusión (actualizada el 3-sep-2026): ni el sitio ni las guías del panel dicen nada, pero el PDF del API sí (p. 6): un token válido a la vez por usuario. Lo que sigue sin fuente es si el panel web y el API comparten ese cupo — lo observado dice que sí; para confirmarlo hay que medir con un usuario de API distinto o preguntarle a soporte.**

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

### ⚠️ Dos numeraciones distintas con formato idéntico — **ahora sí separadas**

El sitio de ayuda mezclaba ~35 códigos `0XXX` sin decir cuál era permiso y cuál parámetro. **`docs/switch/Parametro de Sistema.pdf` cierra ese hueco: publica la lista COMPLETA y CERRADA de parámetros de sistema — son 12, ni uno más** (p. 1, índice: *"VENTAS 7 parámetros · INVENTARIO 2 · CONFIGURACIÓN 2 · COMPRAS 1"*).

**Regla nueva, y es dura: si un código `0XXX` no está en la tabla de 12 de abajo, NO es parámetro de sistema.** Eso reclasifica de un plumazo varios códigos que el sitio dejaba ambiguos — el **0065** entre ellos (ver §9).

🔴 **Y confirma que los números se repiten entre las tres numeraciones.** El **`0014`** es, a la vez: **permiso** de Stock (Ingreso de mercancía) · **parámetro** de Ventas (Artículos en forma de lista facturador) · **error** ("el código de artículo ya existe"). El **`0034`** es parámetro de Ventas, y también aparece citado como validación en el Manual de Niveles de Autorización. **Nunca cites un `0XXX` sin decir de qué numeración es.**

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
| **0011** | Compras — **Órdenes de compra** · [GUÍA] `Flujo_articulo…pdf` p. 4 |
| **0014** | Stock — **Ingreso de mercancía** · [GUÍA] `Flujo_articulo…pdf` p. 4 · ⚠️ **choca con el parámetro 0014 y con el error 0014** |
| **0114** | Compras — **Ingreso de comprobantes** · [GUÍA] `Flujo_articulo…pdf` p. 4 |
| **0117** | Compras — **Pago a proveedores** · [GUÍA] `Flujo_articulo…pdf` p. 4 |
| **0199** | Configuración — **Crear y Editar Artículo** · [GUÍA] `Flujo_articulo…pdf` p. 1 |
| **0270** | Stock — **Tomar inventario** · [GUÍA] `Guía_toma_de_inventario.pdf` p. 1 |
| **0271** | Stock — **Crear toma de inventario** · [GUÍA] `Guía_toma_de_inventario.pdf` p. 1 |
| **0272** | Stock — **Aprobar toma de inventario** · [GUÍA] `Guía_toma_de_inventario.pdf` p. 1 |

*(Las 8 filas de abajo salen de las guías oficiales y **nunca estuvieron publicadas en el sitio**. Con ellas, el hueco «no existe artículo con los permisos del módulo Stock» queda parcialmente tapado: ya tenemos 0014, 0015, 0270, 0271 y 0272.)*

**PARÁMETROS DE SISTEMA** (Configuración → Configuración → "Configuración Sistema") — **no son permisos**

#### 🥇 La lista oficial y CERRADA: 12 parámetros [GUÍA]

Fuente: `docs/switch/Parametro de Sistema.pdf`, p. 1-10. Cada uno con su efecto activo/inactivo.

| Código | Módulo | Nombre | Qué hace · Pág. |
|---|---|---|---|
| **0014** | Ventas | Artículos en forma de lista facturador | **Activo**: tabla código/descripción/precio. **Inactivo**: cuadrícula con foto. · p. 2 |
| **0021** | Configuración | Sistema con promoción | **Activo**: aparece el botón "Agregar Promoción". **Inactivo**: no se pueden crear ni aplicar promociones. · p. 3 |
| **0034** | Ventas | Solicitar password para eliminar artículo en facturador | **Activo**: al borrar una línea pide **PIN administrativo**. · p. 3 |
| **0072** | Ventas | **Control de comprobantes** | 🔴 Ver la alerta debajo de esta tabla. · p. 4 |
| **0098** | Ventas | Control de morosidad de cliente | **Activo**: si el cliente pasa el límite de morosidad, **bloquea la facturación** y pide PIN. · p. 4 |
| **0099** | Inventario | **Sistema con manejo de costo FOB** | **Activo**: campos **Costo FOB** y **Costo CIF** + ventana **"Otros Costos"** (Transporte/Arancel/Impuesto/Otros) en el ingreso de mercancía. · p. 5 |
| **0113** | Ventas | Recibido conforme comprobantes | **Activo**: el PDF de la factura lleva al pie la línea de firma "Recibido Conforme". · p. 7 |
| **0120** | Ventas | Nueva cotización al actualizar | **Activo**: editar una cotización **crea un comprobante nuevo** y conserva el original. **Inactivo**: sobreescribe. · p. 8 |
| **0121** | Ventas | Cobro activación tarjeta de crédito | Solo Switch Pay. **Activo**: primer cobro de **$1.00** para validar la tarjeta. · p. 8 |
| **0124** | Configuración | Utilizar nombre comercial en facturador | **Activo**: muestra el **nombre comercial**. **Inactivo (default)**: la **razón social**. ⚠️ *"aplica únicamente en el facturador. No afecta reportes ni otros módulos."* · p. 9 |
| **0151** | Compras | Nueva orden de compra al actualizar | **Activo**: editar una OC **crea una OC nueva**. **Inactivo**: sobreescribe. · p. 10 |
| **0181** | Inventario | Método de ingreso de asignación de LOTE | Selector: **FEFO / FIFO / Manual**. *"Siempre debe tener una opción configurada."* · p. 10 |

> 🔴 **`0072` Control de comprobantes — el parámetro que puede cambiar precios sin que nadie lo note**
>
> > "Define si los precios modificados manualmente en un comprobante **se conservan o se restablecen** al convertirlo a otro tipo de documento dentro del flujo de ventas.
> > **Activo**: al convertir un comprobante (ej. **cotización → pedido → factura**), el sistema **restablece automáticamente los precios originales del artículo, descartando modificaciones previas**.
> > **Inactivo**: los precios modificados en el comprobante original **se conservan** y se trasladan al nuevo comprobante."
> > — `docs/switch/Parametro de Sistema.pdf`, p. 4
>
> **Esto toca directamente nuestros Pedidos → Switch.** Editamos precio en el pedido (memoria: *"editar precio ya existía"*, PR #490). Si en alguna de las 6 empresas el **`0072` está ACTIVO**, el precio que editamos en el pedido **se pierde al facturarlo** y la factura sale con el precio de lista. **No sabemos cómo está configurado en nuestras empresas — hay que preguntárselo a Switch, empresa por empresa.** Es la clase de cosa que se descubre por una factura mal cobrada.

**Códigos `0XXX` que el sitio llamaba «parámetro» y que NO están en la lista de 12** — quedan reclasificados como **sin categoría confirmada** (probablemente permisos, o parámetros que Soporte habilita fuera de esa pantalla): `0028` (lote activo), `0040` (ingreso con stock ideal), `0057` (cheque recibido), `0149`/`0150` (envío automático de estado de cuenta), `0152` (costo del combo), `0162` (Comprobante Futuro), **`0164`** (Comprobante tipo Transacción), `0165`, `0174` (cupones), `0176` (Libro de Compras Guatemala). ⚠️ **El `0164` es el que más nos importa y sigue en el aire**: el sitio lo daba como parámetro necesario para emitir Transacciones, pero **no está entre los 12 oficiales**.

*(Códigos de **error**, no confundir: 0014 "código de artículo no existe", 0280 error de NC por concepto, CODE-0517 cotización por correo, CODE0458, 0710.)*

**[SIN FUENTE]** Sigue sin haber catálogo completo de **permisos** publicado. Lo que tenemos es la lista de Ventas (0001-0006) del sitio + los 8 códigos que aportaron las guías (0011, 0014, 0114, 0117, 0199, 0270, 0271, 0272) + menciones sueltas en las Novedades.

---

## 15. 🥇 Niveles de autorización — las 8 acciones que piden PIN [GUÍA]

Fuente: `docs/switch/Manual de Niveles de Autorización.pdf`, p. 1-5. **El sitio de ayuda no documenta esto en ningún lado.** Es un mecanismo **distinto y paralelo** a los permisos `0XXX`: los permisos dicen *si podés entrar a una pantalla*; los niveles dicen *si podés hacer una acción delicada sin que un jefe teclee su PIN*.

### Cómo funciona [GUÍA, p. 1]

- Cada **usuario** tiene un **nivel del 1 al 5**. Cada **acción protegida** tiene también un nivel, **configurable por el cliente**.
- 🔑 **La escala va al revés de lo que uno espera: Nivel 1 = MÁXIMA autoridad. Nivel 5 = mínima.**
- Se ejecuta sin ayuda cuando **el número del usuario es igual o MENOR** al de la acción. Si es mayor, el sistema pide **el PIN de alguien con la autoridad necesaria**.
- **El PIN no lo tienen todos**: *"El PIN no se asigna a todos los usuarios, sino únicamente al personal administrativo. Los usuarios operativos —por ejemplo, cajeras— no cuentan con PIN propio."*
- **La ventana de PIN sale SIEMPRE**, aunque no haga falta: *"Si el usuario ya tiene el nivel suficiente, solo da clic en «Siguiente», sin escribir nada."* — o sea, ese pop-up no es señal de que falte permiso.

### Las 8 acciones protegidas [GUÍA, p. 2-3]

| # | Acción | Qué permite exactamente |
|---|---|---|
| 1 | **Cambiar precio** | Modificar el precio en el campo **"Precio"** del facturador, al momento de la venta |
| 2 | **Bonificación** | Aplicar descuento por % en el campo **"%Bonif."** del facturador |
| 3 | **Eliminar Artículo** | Borrar una línea (botón X) o **todas** (botón rojo X). ⚠️ *"Esta validación **solo aplica si el parámetro de sistema 0034** está activado"* |
| 4 | **Aprobar Cierre de Caja** | Autorizar el cierre de caja del usuario, desde el módulo "Cierre Caja" |
| 5 | **Aprobar venta a Crédito** | 🔴 Autorizar la facturación **cuando la forma de pago es CRÉDITO** |
| 6 | **Aprobar certificado de regalo** | Autorizar la aplicación o uso de un certificado de regalo |
| 7 | **Cambio Lista de precio** | Cambiar el precio eligiendo **otra lista de precios** desde la pestaña "Precio" del producto en el facturador |
| 8 | **Reimpresión de comprobante** | Autorizar la reimpresión por **impresora térmica** |

La guía trae además un ejemplo real de configuración (p. 4): Cambiar precio N2 · Bonificación N3 · Eliminar Artículo N2 · Aprobar Cierre de Caja N1 · **Aprobar venta a Crédito N1** · Certificado de regalo N1 · Cambio Lista de precio N2 · Reimpresión N5. **Es un ejemplo, no la configuración de nuestras empresas.**

### 🔴 Lo que esto significa para nosotros

1. **Toda venta a crédito puede estar pasando por una autorización con PIN.** Nuestro módulo de CXC vive de las facturas a crédito. Si en las 6 empresas la acción 5 está en Nivel 1, cada factura a crédito que hace un vendedor **necesita que un gerente teclee su PIN**. Eso explicaría fricción operativa que hoy no modelamos.
2. **Editar el precio en el facturador es una acción protegida** — no un permiso `0XXX`. Cuando en §9 preguntábamos "qué permiso hace falta para editar un artículo", la respuesta se parte en dos: **editar el ARTÍCULO en el maestro = permiso `0199`**; **editar el PRECIO en la venta = nivel de autorización, acción 1**; **editar el NOMBRE en el facturador = permiso `0065`**. Son tres mecanismos distintos.
3. **[SIN FUENTE] Anular un comprobante NO está en la lista de las 8.** Preguntábamos qué permiso hace falta para anular un comprobante: **la guía de niveles no lo cubre**, y el sitio tampoco publica un permiso de anulación. Lo más cercano documentado es `0102` "Reimpresión de Comprobantes" (permiso) y la acción 8 (nivel), que son otra cosa. **Sigue sin respuesta.**
4. **[SIN FUENTE] Dónde se configuran los niveles.** La guía dice que *"el nivel de cada acción es editable"* y *"configurable por el cliente"*, pero **nunca dice en qué pantalla**. Ni cómo se asigna el nivel a un usuario, ni cómo se crea un PIN.

---

## 16. 🥇 Listas de precios [GUÍA] — módulo que no conocíamos

Fuente: `docs/switch/Guia_lista_precios_SwitchSoft.pdf`, p. 1-3. Vive en el módulo **Promociones**, no en Stock.

> "Las listas de precios permiten definir precios diferenciados por artículo y asignarlos a clientes específicos. **Cada vez que se llame al cliente en el facturador, el sistema aplicará automáticamente la lista de precios que tenga asignada.**" — p. 1

### Cómo se arma [GUÍA]

1. **Crear la lista** — `Promociones → Lista de precios`. Nombre + Guardar. (p. 1)
2. **Poblarla** — `Promociones → Administrar lista de precios → Editar lista`. Dos formas: por **artículo individual** (nombre o código) o **por grupo** (marca, rubro o sub-rubro). (p. 1)
3. **Ponerle precios** — dos métodos (p. 2):
   - **A · Coeficiente**: multiplicador sobre el precio actual. `1.00` sin cambio · `1.10` +10% · `1.20` +20% · `1.50` +50% · `0.90` −10% · `0.80` −20%. Ejemplo de la guía: $10.00 × 1.20 = **$12.00**.
   - **B · Plantilla Excel** (`Administrar lista de precios → Actualizar lista de precios`): dos columnas — **A = Código de artículo**, **B = Precio nuevo**. 🔴 **Tope duro: 2.500 artículos por carga.**
4. **Amarrarla a clientes** — `Administrar lista de precios → Lista de precios cliente`. ⚠️ *"Seleccione los clientes **uno a uno**"* — no hay carga masiva de la asignación. (p. 2)
5. **Generar lista desde otra** — `Administrar lista de precios → Generar lista de precios`: toma una lista origen, le aplica un coeficiente y la vuelca en una lista destino. (p. 2)
6. **Descargar en Excel** — `Administrar lista de precios → Lista de precios`. (p. 2)

### 🔴 Por qué nos importa

- **El precio que ve un cliente en Switch puede NO ser el precio por defecto del artículo.** Si el cliente tiene lista asignada, el facturador la aplica solo, sin que el vendedor elija nada. Nuestro catálogo B2B muestra el precio del artículo (memoria: *"precios = Switch"*): **si algún cliente tiene lista de precios, lo que le mostramos y lo que le van a facturar no coinciden.**
- Cambiar de lista en el facturador es una **acción protegida por PIN** (§15, acción 7).
- El coeficiente `1.10` de las listas de precios **no tiene nada que ver** con nuestro factor CIF `1.10` — que sea el mismo número es coincidencia. No los confundas.
- **[SIN FUENTE]** La guía no dice qué pasa cuando un artículo está en dos listas, ni si la lista pisa a la promoción, ni qué gana entre lista de precios y bonificación.

---

## 17. 🥇 Promociones [GUÍA] — módulo que no conocíamos

Fuente: `docs/switch/GUIA_PROMOCIONES_SWITCH_SOFT.pdf`, p. 1-3. Requiere el **parámetro `0021`** activo (§14): sin él no aparece el botón "Agregar Promoción".

**El modelo es «lista de compra + lista promo»**, no «descuento sobre un artículo»:

1. `Promociones → Agregar Promoción → Nueva Lista Artículos` — seleccionar los artículos que aplican y ponerle nombre a la lista. (p. 1)
2. `Promociones → Agregar Promoción → Nueva Promoción` — botón `+`, nombre, y luego (p. 2):
   - **Lista compra** = la lista del paso 1 · **Cantidad compra** = cuántas debe llevar (ej. `12`) · **Descuento %** = `100` · **Aplicar a**: marcar *Lista de compra* y elegir **"Precio más bajo"**.
   - **Lista promo** = la misma lista · **Cantidad promo** = `1` (lo que va gratis) · **Sucursales** donde aplica.
   - **Fecha inicio / Fecha final** — la promoción vive en una ventana de fechas.
3. En el facturador **hay que teclear la cantidad TOTAL**: para "compra 12 y llevás 1", se escribe **13**. *"El sistema aplicará automáticamente el descuento del 100% al artículo de menor precio."* (p. 3)

### 🔴 Por qué nos importa

- Una promoción **se materializa como un descuento del 100% sobre una línea**, no como una línea de precio cero ni como un artículo aparte. En la factura que baja la API eso se ve como **una unidad con descuento total** — y por lo tanto **infla las UNIDADES vendidas sin inflar la venta**.
- 🩸 Enlaza con la regla de memoria *"lo que resta, RESTA — también UNIDADES/pares"*: si alguna de las 6 empresas usa promociones, **los pares vendidos y los pares facturados no son el mismo número**, y la utilidad de esa factura baja por un motivo que no es descuento comercial.
- **[SIN FUENTE]** La guía no dice si la promoción y la lista de precios se pisan, ni cómo se ve la promoción en el Excel de ventas.

---

## 18. 🥇 Puntos [GUÍA] — módulo que no conocíamos

Fuente: `docs/switch/Guia_Puntos_Switch_soft.pdf`, p. 1-3. Ruta: `Promociones → Configuración de puntos`.

**Configuración de Compras** (o sea, el canje) — p. 1-2:
- **Conversión de puntos por USD** — cuántos puntos valen $1. *"Si colocas 100, significa que 100 puntos equivalen a $1."*
- **Mínimo de USD para usar** — piso de compra a partir del cual se puede canjear.
- **Límite de puntos — modalidad de acumulación**, cuatro opciones: **DIARIO CLIENTE** (una vez al día por cliente) · **TRANSACCIÓN CLIENTE** (por cada compra) · **DIARIO EMPRESA** (una vez al día en cualquier sucursal) · **TRANSACCIÓN EMPRESA** (por cada compra en cualquier sucursal).
- **Límite de puntos** — techo de puntos acumulables por cliente.

**Configuración de Ventas** (o sea, la acumulación) — p. 2: regla **"Por cada compra de $X · Recibe N puntos"**, más la **sucursal** donde aplica.

**Listado de artículos** — p. 2-3: *"**Solo los artículos incluidos en este listado otorgarán puntos** al cliente al momento de la venta."*

### 🔴 Por qué nos importa

- **Los puntos son una FORMA DE PAGO**: *"permitir el canje de puntos como forma de pago"* (p. 3). Una factura pagada con puntos **entra a Switch con una forma de pago que no es efectivo, ni tarjeta, ni crédito**. Eso toca CXC y toca comisiones.
- Confirma por qué la auditoría del 1-ago dio **puntos = 0 en 179/179 facturas de ACS**: los puntos **solo se otorgan a los artículos del "Listado de artículos"**, y si ese listado está vacío, no acumula nadie — el módulo puede estar configurado y devolver cero legítimamente. **No es necesariamente un bug del objeto `puntos` de la API.**
- **[SIN FUENTE]** La guía **no dice nada** de cómo se comporta una **nota de crédito** frente a puntos ya otorgados (¿se descuentan?). Es exactamente el hueco que teníamos anotado (`project_acs_puntos_switch`: *"NC sin objeto puntos"*). **Sigue abierto.**

---

## 19. 🥇 Cuentas incobrables [GUÍA] — cómo se borra una deuda en Switch

Fuente: `docs/switch/Guia_CuentasIncobrables_Switch_soft.pdf`, p. 1-2. **Esto toca CXC de frente.**

Son **dos pasos**, y ninguno emite una nota de crédito:

1. **Cargar un saldo NEGATIVO por plantilla** — `Ventas → Clientes → Agregar saldos a clientes`. Se descarga una plantilla Excel con 4 columnas, **las 4 obligatorias**: **Código cliente · Fecha · Saldo · Comentario**. 🔑 *"La columna de **Saldo debe ingresarse en valor negativo**"*. Ejemplo textual de la guía: *"Si un cliente tiene facturas pendientes por $500, coloca **-500**"*. (p. 1)
2. **Cruzarlo contra las facturas** — `Ventas → Clientes → Listado → ícono de ojo → **Cancelación de pagos a cuentas**`. Se selecciona el crédito y se cruza contra los débitos (las facturas). *"Con un solo saldo puede cancelar múltiples facturas al mismo tiempo."* (p. 2)

### 🔴 Por qué nos importa mucho

- **Existe una vía para hacer desaparecer una CxC que NO es un pago, NO es un recibo y NO es una nota de crédito.** Es un **saldo cargado a mano por Excel**. Si alguien la usó, nuestra cartera cuadra pero la venta nunca se cobró — y **no hay recibo que lo explique**.
- 🩸 **Esto es una fuente candidata de descuadres de CXC que hoy no modelamos.** Vale la pena preguntarle a Daniel si alguna vez se usó "Agregar saldos a clientes", y buscar en `switch_estadocuenta` movimientos de crédito **sin recibo asociado** cuyo comentario parezca un ajuste.
- La guía aclara además, de paso, la duda de §10: en **Cancelación Pago a Cuentas**, **el crédito es el saldo a favor y los débitos son las facturas pendientes** (p. 2). Eso **resuelve la contradicción** que teníamos anotada entre el artículo de clientes y el de proveedores: **gana esta guía**.

---

## 20. 🥇 Toma de inventario [GUÍA] — y el filtro que puede poner el stock en cero

Fuente: `docs/switch/Guía_toma_de_inventario.pdf`, p. 1-4.

**Requisitos** (p. 1): acceso a `Stock → Toma de Inventario`, la app **Switch App** instalada en un equipo **Android Sunmi L2K o L2H**, y los permisos **`0270`** (tomar), **`0271`** (crear) y **`0272`** (aprobar).

**Flujo**: `Stock → Toma de Inventario` → elegir sucursal → **Iniciar** (p. 1) · escanear con la Sunmi en `Stock → Inventario` de Switch App, cada escaneo **suma 1** automáticamente → **Guardar** (p. 2) · volver al panel → **Mostrar** → **Aprobar** o **Rechazar** (p. 3).

### 🔴 El filtro decide qué se ajusta — y puede poner artículos en CERO [GUÍA, p. 3]

> "**El filtro seleccionado al momento de aprobar determina qué artículos se ajustan en el sistema.**"

| Filtro activo al Aprobar | Efecto |
|---|---|
| **TODOS** | Se ajustan los escaneados a su cantidad física, **y los NO escaneados se van a 0** |
| **SÍ** | Se ajustan **solo los escaneados**. Los no escaneados quedan como estaban |
| **NO** | Los escaneados **no** se tocan, **y los NO escaneados se van a 0** |

**Dos de las tres opciones ponen en cero todo lo que no se escaneó.** Aprobar con el filtro equivocado **borra el inventario de todo lo que no pasó por la pistola**. Y **Rechazar** obliga a empezar de nuevo desde el paso 1.

**Por qué nos importa**: si alguna vez vemos una caída masiva y simultánea de stock en una sucursal, **una toma de inventario aprobada con el filtro TODOS es la primera explicación a descartar** — no un bug de sincronización. Nuestro módulo de Referencia usa el stock; una toma mal aprobada le envenena los meses de venta.

---

## 21. 🥇 Facturas de proveedores de GASTO [GUÍA] — el módulo de gastos que sí existe

Fuente: `docs/switch/Guia_facturas_proveedores_switchsoft.pdf`, p. 1-4.

🔴 **Esto contradice de frente lo que tenemos anotado.** En memoria está: *"Switch API NO tiene contabilidad (20 rutas muertas); módulo de gastos YA construido y VACÍO"*, y que los gastos hay que sacarlos de **Egresos Varios**. **Pero el PANEL de Switch sí tiene un lugar formal para los gastos**, y no es Egresos Varios:

- **`Compras → Tipos de Proveedores`** — clasificar proveedores. La guía sugiere al menos dos tipos: **"Proveedores de mercancía"** y **"Proveedores de servicios"** (Internet, electricidad, arrendamiento). *"Definir los tipos de proveedores desde el inicio facilita el filtro en los reportes."* (p. 1)
- **`Compras → Ingreso de Comprobantes`** — la MISMA pantalla donde se registra la factura de mercancía sirve para la de luz o internet. Encabezado: **Proveedor · Sucursal · Número · Fecha de factura · Fecha comprobante · Concepto** (ej. "Servicios Básicos") **· Observación**. (p. 2)
- **Detalle por línea**: **Monto · Descripción · Impuesto (exento o ITBMS) · Categoría · Sub-categoría**. *"La Categoría y Sub-categoría se pueden configurar desde el módulo de **Caja y Bancos**."* (p. 2)
- **Guardar** (queda en el estado de cuenta del proveedor) o **Guardar y Pagar**. (p. 3)
- **`Compras → Reportes → Reporte de Comprobantes`** — filtros por **tipo de proveedor** y **rango de fechas**, descargable en **Excel y PDF**. (p. 3)

### 🔴 Qué revisar

**El gasto de luz/internet/alquiler puede estar viviendo en `Compras → Ingreso de Comprobantes` con tipo de proveedor "servicios", clasificado por Categoría/Sub-categoría — y nosotros buscándolo en Egresos Varios.** Si es así, hay una fuente de gastos **estructurada, con proveedor, fecha, ITBMS y categoría**, mucho mejor que la que usamos. Hay que ver si el endpoint de **compra a proveedores** de la API (el CxP no documentado que ya tenemos anotado) devuelve también estos comprobantes de servicio, o solo los de mercancía. **Es una pregunta medible contra la API, no hay que preguntarle a nadie.**

---

## 22. 🥇 Catálogo web de Switch y SwitchPay [GUÍA]

Fuente: `docs/switch/Guía_Switch_Pay_Catalogo.pdf`, p. 1-4. Switch trae **su propio catálogo web** (módulo **Ecommerce**), que compite con el nuestro.

### Catálogo web [GUÍA, p. 1-2]

- `Ecommerce → Rubros / Marcas / Artículos` — activar/inactivar qué se ve. *"Solo los rubros, marcas y artículos que estén activos serán visibles."*
- `Ecommerce → Imágenes de catálogo` — **subir fotos**. 🔑 **El nombre del archivo ES el código**:
  > "**Opción 1 — Solo código:** `00123.jpg` · **Opción 2 — Código con descripción:** `00123-Camisa manga larga azul.jpg`. En ambos casos, **el sistema tomará como código del artículo todo lo que esté antes del guion (-)** o el nombre completo si no hay guion." — p. 2
  - Formato **PNG o JPG**, dimensiones recomendadas **640 × 640 px**.
  - *"Al subir las imágenes, estas se registran automáticamente. **No es necesario hacer clic en Guardar.**"*
- `Ecommerce → Catálogos` — verificar, filtrar y **descargar el catálogo en PDF**.
- El cliente ve una página con buscador por nombre o código y **botón de WhatsApp por artículo** que manda el enlace del producto.

🔴 **Esto explica, con fuente oficial, el gotcha de Tommy que teníamos medido**: *"12 SKU con guión pierden foto si se corrigen en Switch"* (memoria `project_fg_tommy_fotos_b2b`). **La causa está escrita en la guía: el guion es el separador entre código y descripción.** Un SKU que lleva guion **no se puede** nombrar como archivo sin que Switch le corte el código. **Confirmado, no es un bug nuestro ni de ellos: es el formato documentado.**

### SwitchPay [GUÍA, p. 3]

Tres caminos para cobrar con enlace de tarjeta:
1. **Desde un Pedido** — al finalizarlo aparece el botón SwitchPay; se recupera en `Ventas → Reportes → Reporte de Comprobantes` filtrando por Pedidos. *"Si el cliente realiza el pago desde ese enlace, **el pedido se cancela automáticamente**."*
2. **Factura a crédito + estado de cuenta** — ⚠️ *"En caso contrario, **el monto ingresará como saldo a favor** en el estado de cuenta del cliente, y **deberá asociarlo manualmente**"* desde Cancelación de pagos a cuentas.
3. **Factura a crédito + `Caja y Banco → Ingreso de cobranzas`** — acá sí *"la factura se cancela automáticamente sin necesidad de pasos adicionales"*.

**Por qué nos importa**: el camino 2 deja **pagos flotando como saldo a favor sin aplicar** en el estado de cuenta. Si alguna empresa usa SwitchPay por esa vía, en CXC veríamos **clientes con saldo a favor y facturas vencidas al mismo tiempo** — que es un descuadre aparente y no lo es. Relacionado con el parámetro **`0121`** (cobro de activación de **$1.00**, §14): esos dólares sueltos también entran a la caja.

---

## 23. 🥇 Códigos para crear clientes [GUÍA]

Fuente: `docs/switch/Codigos Creacion Clientes.pdf`, p. 1-3. Tabla de referencia pura. Lo de Panamá:

| Campo | Código | Valor |
|---|---|---|
| **Tipo de Cliente** | `01` | Contribuyente |
| | `02` | **Consumidor Final** |
| | `03` | Gobierno |
| | `04` | Extranjero |
| **Tipo de Identificación** | `1` | Natural |
| | `2` | Jurídico |
| **Código de Impuesto** | `R` | Regular |
| | `00` | **Exento** |

⚠️ **El código de exento cambia por país** y es un campo distinto en cada uno: Panamá `00` · Guatemala `2` · Colombia / El Salvador / Venezuela / México / Rep. Dominicana `02` · Honduras `03` · Costa Rica `01`. **Regular siempre es `R`.** (p. 2-3)

**Por qué nos importa**: el **tipo de cliente `02` Consumidor Final** y el **código de impuesto `00` Exento** son dos cosas independientes que en la práctica se confunden. Un cliente **exento (`00`)** no lleva ITBMS; uno **Consumidor Final (`02`)** sí puede llevarlo. Enlaza con la regla de memoria *"ITBMS ventas sin / CXC con"* y con el pendiente de **clientes de grupo sin ITBMS**: **la exención vive en el CÓDIGO DE IMPUESTO del cliente, no en su tipo.**

---

## 24. ⚠️ Advertencias sobre estas fuentes

- **~25 pares de artículos casi idénticos con URLs distintas.** Ej.: recepción de comprobantes (dos), vendedor predeterminado (dos), eliminar NC (dos), conciliación bancaria (dos). **Y no siempre dicen lo mismo**: en el par de "vendedor predeterminado", una versión aclara *"y podrá cambiar al vendedor"* y la otra no.
- **Hay artículos vacíos.** Ej.: *"¿Cómo desaplicar un recibo y volverlo a aplicar correctamente?"* — solo título, cero contenido: https://ayuda.switch-soft.com/pregunta/como-desaplicar-un-recibo-y-volverlo-a-aplicar-correctamente/ · Y *"¿Cómo hago un reporte?"* cuyo cuerpo entero dice: `Reporte, prueba.`
- **Contradicciones internas del sitio** — dos ya quedaron resueltas por las guías (§9 caracteres válidos, §10 Cancelación Pago a Cuentas). **Ante una contradicción sitio-vs-guía, gana la guía.**
- **Mucho contenido es de 2021** y describe un sistema que cambió (el desplegable de hoy no coincide con los artículos de 2021).
- **El material más confiable y actual son las Novedades** (`modulos/updates/`), que están fechadas.

**Sobre las 13 guías oficiales (`docs/switch/`)** — son mejores, pero no son perfectas:
- **Son guías de uso, no diccionario de datos.** Describen pantallas y pasos; **ninguna publica una fórmula, un nombre de campo de API ni un esquema**. Por eso el CIF sigue a medias (§11) y la grafía de "Nota de Crédito" (§8) sigue sin ser prueba de lo que viaja por la API.
- **Traen al menos una captura equivocada**: `Parametro de Sistema.pdf` p. 6 dice "Ventana Otros Costos" y muestra el teclado de PIN (§11).
- **Describen Switch en general, no nuestra instalación.** Todo lo que es "configurable por el cliente" —los 12 parámetros, los 8 niveles de autorización, las listas de precios— **puede estar de cualquier manera en nuestras 6 empresas**. Las guías dicen qué existe, no cómo lo tenemos.
- **Cubren módulos que quizás no usamos** (puntos, promociones, SwitchPay, toma de inventario con Sunmi). Que estén documentados no significa que estén encendidos.

---

## 25. 🔴 Preguntas pendientes para el soporte de Switch

Ordenadas por impacto. **Las 13 guías oficiales cerraron 4 de las 12 que teníamos y abrieron 5 nuevas.**

### ✅ Cerradas por las guías (ya no hay que preguntarlas)

| Pregunta vieja | Respuesta | Fuente |
|---|---|---|
| ¿Cuál columna es Débitos y cuál Créditos en Cancelación Pago a Cuentas? | **Débitos = facturas pendientes · Créditos = saldos a favor** | `Guia_CuentasIncobrables…pdf` p. 2 · §10 y §19 |
| Lista completa de permisos del módulo Stock | Parcial: **0014, 0015, 0270, 0271, 0272** | `Flujo_articulo…pdf` p. 4 · `Guía_toma_de_inventario.pdf` p. 1 · §14 |
| ¿Qué caracteres acepta cada campo? | **Tabla completa** — y el nombre del cliente **no admite tildes** | `Guia Caracteres Validos.pdf` p. 1-4 · §9 |
| ¿Por qué los SKU con guion pierden la foto? | Porque **el guion separa código de descripción** en el nombre del archivo | `Guía_Switch_Pay_Catalogo.pdf` p. 2 · §22 |

### 🔴 Siguen abiertas — hay que preguntarle a soporte

1. **¿Cómo se prorratean los costos de «Otros Costos» para armar el CIF?** La guía confirma que **se distribuyen** (`Flujo_articulo…pdf` p. 5) y nombra los cuatro cubos (Transporte, Arancel, Impuesto, Otros — `Parametro de Sistema.pdf` p. 5), pero **no dice con qué criterio** (valor / unidades / peso), **no dice si el CIF del artículo se sobreescribe** en cada ingreso, ni **cuál de los tres costos usa la utilidad**. *(De paso: pedirles la captura correcta de la ventana «Otros Costos», la del PDF está equivocada.)*
2. **Si cambio la descripción de un artículo, ¿el nombre en facturas ya emitidas cambia o se conserva?** **Sigue sin fuente en las 13 guías.** Nuestra medición dice que **sí** se reescribe (7 de 7 códigos). Es la pregunta más cara.
3. 🆕 **¿Cómo está configurado el parámetro `0072` (Control de comprobantes) en cada una de nuestras 6 empresas?** Si está ACTIVO, **los precios editados en un pedido se pierden al facturarlo** (`Parametro de Sistema.pdf` p. 4). Toca plata directamente. Ver §14.
4. 🆕 **¿Qué nivel de autorización tiene la acción «Aprobar venta a Crédito» en nuestras empresas, y quién tiene PIN?** (`Manual de Niveles de Autorización.pdf` p. 3). Todas nuestras ventas de CXC son a crédito.
5. **¿Qué es el tipo "Ventas" del desplegable de Reportes de comprobantes?** Cero menciones en el sitio **y cero en las 13 guías**.
6. **¿Qué es "Cotización Email"?** Cero menciones en el sitio **y cero en las 13 guías**.
7. **¿Tiquete y Transacción descargan inventario?** Las guías tampoco los mencionan.
8. **¿El comprobante "Abono" genera cuenta por cobrar?** **Las 13 guías no dicen "abono" ni una vez.** El indicio del sitio apunta a que no.
9. **¿Switch limita las sesiones concurrentes por empresa?** Cero menciones en el sitio **y cero en las guías**. Dos fuentes agotadas.
10. **¿Cuál es la base de la comisión del vendedor?** Las guías no tocan comisiones.
11. 🆕 **¿Dónde se configuran los niveles de autorización (1-5) y dónde se le asigna el PIN a un usuario?** La guía dice que es configurable pero **nunca dice en qué pantalla**.
12. 🆕 **¿Qué gana cuando chocan: lista de precios del cliente, promoción y bonificación?** Ninguna de las tres guías lo dice. Ver §16 y §17.
13. 🆕 **¿Una nota de crédito revierte los puntos ya otorgados?** `Guia_Puntos_Switch_soft.pdf` no lo menciona. Enlaza con el pendiente de ACS.
14. **¿Precedencia entre perfil y permiso individual?**
15. **¿La recepción de XML crea automáticamente el comprobante de CxP?**
16. **¿Sigue vigente el límite de 75 caracteres de la Descripción?** El artículo de 2021 lo decía; la guía de caracteres de 2026 **no lo menciona ni lo desmiente**.

### 🧪 Preguntas que NO hay que preguntar — se miden contra la API

- **¿El CIF real es FOB × 1,10?** Comparar `costo_api` (ya validado = CIF) contra el FOB del mismo artículo sobre los 34.792 ingresos de compra cargados. Ver §11.
- **¿Se usó alguna vez «Agregar saldos a clientes» para dar de baja incobrables?** Buscar créditos en `switch_estadocuenta` sin recibo asociado. Ver §19.
- **¿El endpoint de compra a proveedores trae también las facturas de GASTO** (luz, internet) además de las de mercancía? Ver §21.
- **¿Hay clientes con lista de precios asignada?** Si los hay, el precio que muestra nuestro catálogo B2B no es el que se les factura. Ver §16.

**Contacto**: chat `soporte.switch-soft.com` · WhatsApp +507 6681-7226 · `soporte@switch-soft.com` · L-V 8:00-17:00, Sáb 8:00-14:00 (Panamá).
