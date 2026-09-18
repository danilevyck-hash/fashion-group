# Pendientes vivos — lo que Daniel pidió y sigue sin hacerse

> Nació el **14-sep-2026**, leyendo los 1.197 mensajes que Daniel escribió en la sesión del **31-ago al 13-sep-2026** (33.215 mensajes en total) y contrastándolos uno por uno contra el código y contra producción.
>
> 🔴 **Por qué existe este archivo.** Daniel, textual: *«no todo lo escrito es para siempre, aveces las cosas camvian»* y *«te acuerdas que te dije que se cambia a plantilla switch, no te olvides de las cosas porque yo me olvido y se pasan cosas»*. Lo que se aparca sin anotar se pierde: dos semanas de trabajo dejaron **quince pedidos suyos sin rastro en ningún documento**.
>
> **Cómo se usa:** cada punto trae su cita textual, la fecha, y **qué se comprobó** para decir que sigue pendiente. Al cerrar uno, se tacha aquí con la comprobación, y la regla se escribe donde corresponda (`CLAUDE.md` si es invariante, el postmortem del módulo si es historia).

---

## 🩸 Auditoría completa del 18-sep-2026 — esta lista mentía en NUEVE puntos

Se recorrieron los 24 puntos uno por uno contra el código y contra producción. **Nueve estaban resueltos y el documento no se había enterado**, y cuatro de ellos se descubrieron por accidente ese mismo día, después de anunciarle a Daniel que se iba a construir algo que ya existía.

Lo que estaba hecho y este archivo daba por abierto: las **fechas de entrada de las seis de Multifashion** (0-bis.1) · el **motivo de salida de los dos que salieron** (0-bis.2) · **«Otros servicios»**, construido ENTERO (0-bis.4) · **Cristiam** (20) · los **21 artículos de Reebok en Active Wear** (19) · y la migración `20261206120000` que el punto 8 daba por pendiente. Más el apellido de Julio, los tres códigos fantasma y los tres puntos de Reebok, que ya se habían tachado ese mismo día.

🔴 **Y la misma mentira estaba en `CLAUDE.md`: las ONCE migraciones que llamaba «pendientes» están TODAS aplicadas** (comprobado contra `supabase_migrations.schema_migrations` y contra el catálogo de Postgres). Se corrigieron ahí el 18-sep-2026.

🔑 **La lección, para la próxima:** una tabla que responde con lista vacía **existe**; una que no existe da error de «schema cache». Vacía no es lo mismo que inexistente, y «nadie la ha usado» no es lo mismo que «no está construida».

---

## 🔴 Mueven plata

### 0-bis. Lo que quedó abierto del cuadre contra el Excel de Yulissa (15-sep-2026)

Daniel contestó ocho preguntas del cuadre el 15-sep. **Lo cerrado se escribió directo en producción** (salarios de Ramón Miranda y Carlos Ruíz, bajas de Cristiam Blanco y Héctor Leonel Pérez, tres nombres, «Trabaja afuera» a los cuatro). Estado al **18-sep-2026**:

1. ~~**Las fechas de entrada de las seis de Multifashion.**~~ → **HECHO** (verificado el 18-sep-2026).
   Daniel, **15-sep-2026**: *«4. ponlo en la lista de pendientes»*.
   Medido contra producción: **las seis tienen `fecha_ingreso`** en `asistencia_personas` — Jenifer Miranda (301) 2018-09-16 · Jailine Quispe (303) 2025-05-02 · Milagros Torres (302) 2025-11-11 · Sheynee Batista (304) 2026-04-15 · Yeisibeth Muñoz (306) 2026-01-16 · Cindy De Gracia (3) 2026-01-16. Los ocho de `american_classic` tienen fecha; ninguno queda en NULL.
2. ~~**El motivo de salida de los dos que salieron va como «otro».**~~ → **HECHO** (verificado el 18-sep-2026).
   Medido contra producción: **Cristiam Blanco (25) sale con `renuncia`** (30-ago-2026) y **Héctor Leonel Pérez A. (48) con `despido`** (2-sep-2026). Ninguno dice «otro». La liquidación ya tiene el dato que necesitaba.
3. ~~El apellido de Julio, código 11~~ → **HECHO el 18-sep-2026.** Daniel: *«ya te dije q guzman, garay no»*. Verificado contra producción ese día: la ficha dice **«Julio Guzmán»**, empresa `vistana`. No había nada que cambiar.
4. ~~**«Otros servicios» no existe como campo.**~~ → 🩸 **ESTABA CONSTRUIDO ENTERO, y este documento lo daba por «diseño sin definir»** (verificado el 18-sep-2026).
   Daniel, **15-sep-2026**: *«debería de haber un campo en la ficha que diga "otros servicios", y a qué quincena se le aplica ese extra (debe de ser la misma en la que trabajó)»*.
   **Qué se comprobó:** la regla pura vive en `src/lib/asistencia/otros-servicios.ts` (con esa cita textual en su encabezado, más *«que sea como está, el total, ya el detalle debería estar en el perfil»* y *«no paga seguro social y educativo»*); la lectura de base en `otros-servicios-server.ts`; la pantalla en `src/app/asistencia/colaboradores/SeccionOtrosServicios.tsx`; la ruta en `src/app/api/asistencia/otros-servicios/`; y lo leen la planilla (`planilla.ts`, `planilla-server.ts`, `PlanillaTab.tsx`), el Excel (`planilla-exportar.ts`), el comprobante (`comprobante.ts`), el piso del neto (`neto-no-negativo.ts`), la lista de columnas de dinero y el respaldo (`lib/backup/tablas.ts`). Candado: `otros-servicios-desde-la-ficha.test.ts`.
   **La tabla `asistencia_otros_servicios` EXISTE** (responde 200 con `[]`) y está vacía **solo porque nadie la ha usado todavía**.
   🔴 Lo que decidió Daniel y quedó escrito: **no se elige fecha ni quincena** — *«se anota el día que se hace la gestión y entra en esa quincena, sin elegir fecha»*.
5. ~~Tres códigos del reloj sin ficha son FANTASMAS~~ → **HECHO el 18-sep-2026.** Daniel: *«los 3 codigos del reloj escondelos»*.
   🩸 **Ya estaban escondidos, y ése era el problema.** 39, 55 y 9999 estaban en `asistencia_codigos_ignorados` **desde el 11-sep-2026, puestos por `daniel`** — y él los seguía viendo en la pestaña Asistencia con su «falta configurar». La razón: esconder se enchufó en la Planilla y en Configuración, pero **el Reporte nunca lo leyó**. Arreglado el 18-sep (`src/app/api/asistencia/reporte/route.ts`, candado en `planilla-tres-descuentos.test.ts`).
   ⚠️ La tabla **no está vacía: tiene SEIS filas, las seis activas** (remedido el 18-sep): 9999, 39 y 55 por `daniel` el 11-sep; 48 (Héctor Pérez) y 25 (Cristiam Blanco) por Contabilidad el 11-sep; 52 (Daniel Levy) por Contabilidad el 16-sep.
6. ⚠️ **ABIERTO — tres personas sin marcar en el reloj, y un código del reloj sin ficha.** Remedido contra producción el 18-sep-2026:
   - **Yeisibeth Muñoz (306): CERO marcaciones**, nunca, desde que existe la tabla.
   - **Ana Trejos (2) y Cindy De Gracia (3): 4 marcaciones cada una, TODAS del 5-sep-2026** y ninguna después. O marcaron un solo día, o las sacaron del reloj; desde la base no se distingue.
   - **`luis` (id 1000, organización AMERICAN CLASSICS) sigue sin ficha**: no hay ninguna fila en `asistencia_personas` con código `1000`, y tampoco tiene marcaciones.
   🔑 Es tarea del reloj físico y de Contabilidad, no del sistema: desde aquí solo se ve quién marcó.

### 0. La quincena 1–15 de septiembre — 🔴 **ABIERTO, pero cambió mucho el 18-sep**
Daniel, **15-sep-2026**, textual: *«el 10 de septiembre se cortó el reloj de la planilla manual del excel»* y *«acuérdate que el reloj cortó el 10, así que para la próxima quincena es desde el 11 hasta cuando corte contabilidad»*.

**Remedido contra producción el 18-sep-2026.** La contadora cerró seis planillas ESE DÍA, y el cuadro ya no es el del 15-sep. `asistencia_planilla_guardada` tiene **8 filas**:

| Empresa | Período | Corte | Estado |
|---|---|---|---|
| Vistana | 1–15 sep | **2026-09-10** | **cerrada** (18-sep 18:27) ✅ |
| Confecciones Boston | 1–15 sep | **2026-09-10** | **cerrada** (18-sep 20:31) ✅ |
| Fashion Wear | 1–15 sep | 2026-09-10 | ⚠️ **reabierta** (cerrada 13-sep, reabierta 16-sep) |
| Fashion Wear · Vistana | 16–30 ago | 2026-08-28 | cerrada (18-sep) |
| Confecciones Boston | 16–30 ago | 2026-08-25 | cerrada (18-sep) |
| Fashion Wear · Vistana | 15–28 ago | — | reabiertas (rangos de prueba de Roxana) |

**Qué queda abierto, y es de la contadora:**
- 🔴 **Multifashion NO tiene NI UNA planilla guardada**, de ninguna quincena, nunca. Cero filas de `american_classic` en la tabla.
- ⚠️ **Fashion Wear 1–15 sep quedó REABIERTA** el 16-sep y no se volvió a cerrar. Mientras no se cierre, no hay corte guardado del que salga el «Ajuste quincena anterior».

🔴 **Por qué importa:** los días 11 al 15 —que se pagaron sin medir— salen del corte **GUARDADO** de la quincena cerrada. Donde no hay quincena cerrada con corte el 10, esos cinco días **no se ajustan en la del 16–30 y se pierden en silencio**.

⚠️ Y el corte **NO es siempre el 10**: lo elige ella cada quincena (`CORTE_SUGERIDO` solo propone). La regla que se repite es *desde el día siguiente al último corte, hasta donde ella corte*.

### 1. ~~El daño de mercancía no propone cuota~~ → **HECHO el 14-sep-2026**
Daniel: *«Tanto el chico como el grande que sea por cuota, ¿no? Agregan el daño como se hace un préstamo, se elige la cuota y listo»*. El daño se registra con su cuota y entra solo a la planilla hasta saldarse. Migración `20261122120000` (mercancía con los tres estados), **aplicada** (reverificado contra `schema_migrations` el 18-sep-2026).

**Cerrado entero el mismo día**, con lo que Daniel decidió punto por punto (*«1. Sí, con opción de editar. 2. Sí. 3. …»*):
1. ✅ **La cuota de daño se edita** en «Editar ficha», junto a las otras dos. Un `0` apaga la cuota y **no borra la deuda**.
2. ✅ **El cierre anota el pago del daño solo**, igual que el préstamo (ya leía `dinero.mercancia`).
3. ✅ **Boston suma las tres cuotas** en su «descuenta $X por quincena».
4. ✅ **La fecha del movimiento NO decide la quincena** y se queda así (Daniel: *«2. Sí»*): lo que se descuenta es una cuota que se repite hasta saldarse, no el evento. Para saltarse una quincena se escribe `0`.

### 2. ~~Tres quincenas cerradas sin descontar préstamos~~ → **no era un problema: eran PRUEBAS.** Queda una pregunta de USO.
Daniel, **14-sep-2026**: *«A nadie se le ha pagado nada. La contadora está probando el sistema, aún no lo entiende.»*

Las quincenas guardadas de entonces eran de **Roxana (la contadora) probando el módulo**, no planillas pagadas. Ninguna plata salió, así que **no hay nada que recuperar ni que corregir hacia atrás**.

🔴 **Lo que sigue abierto, y es de USO, no de plata: el corte no se entiende.** Roxana, por WhatsApp el 14-sep: *«Un poco complicado el tema del corte»* · *«Los préstamos no me salían pero cuando generé ya lo hizo»*.

**Comprobado el 18-sep-2026 — hoy la pantalla AVISA pero NO FRENA.** Cuando el período no es una quincena, salen dos líneas: en «Antes de cerrar», con **tono `info`** (no «arreglar»), *«Estas fechas no son una quincena (N días): del sueldo base se paga X % de un quincenal»* (`lib/asistencia/antes-de-cerrar.ts`), y debajo del cuadro *«Los montos a mano se guardan por quincena — escribe las fechas exactas de una quincena para poder llenarlos»* (`PlanillaTab.tsx`). Nada impide cerrar.

**La pregunta abierta sigue siendo de Daniel:** si eso debe pasar de aviso a **freno**.

### 3. ~~Una factura de agosto no le llegó a Rey~~ → **cerrado: no es del sistema**
Daniel, **14-sep-2026**: *«Olvídalo, no es problema del sistema»*. La factura 11-000000502 tiene otro vendedor **en Switch**; el sistema lee lo que Switch manda. No hay nada que arreglar aquí.

### 4. El cuadre del estado de cuenta llegó muerto — 🔴 **ABIERTO, sin un solo cambio**
**Remedido el 18-sep-2026:** `switch_estadocuenta_saldo` tiene **835 filas**, `synced_at` de **hoy 18-sep 21:10** — o sea que el sync corre — y **`saldo_total` NO nulo: 0 filas. `saldos` NO nulo: 0 filas.** Cero de 835, exactamente igual que el 14-sep.

Switch no manda esos dos campos con el nombre que el sync busca, así que el aviso «esto no cuadra» **no puede saltar nunca** y el cajón se comporta como si siempre cuadrara.

🔴 **Daniel ya dijo cómo tratarlo:** primero investigar qué manda de verdad `/apicliente/estadocuenta`, y **reportárselo antes de tocar nada**.

---

## 🟠 Módulos a medio terminar

### 5-bis. Reebok: en pausa hasta que Daniel junte cuatro archivos
Daniel, **14-sep-2026**: *«deja que me llegue lo que son: 1. OB, que es lo pendiente para despachar. 2. El Excel de lo facturado. 3. Las facturas en PDF. Y voy a querer también hacer lo de subir un Excel con referencias y pegar las fotos. Son 4 archivos; cuando lo tenga vemos ese tema de Reebok. Te aviso»*.

🔴 **No se toca Reebok hasta que él avise.** Lo que quedó a medias y espera esos archivos (**reverificado el 18-sep-2026**):
- **«Precio Especial» es su costo FOB y el sistema sigue sin reconocer esa columna.** `src/lib/depurador/reebok.ts:156` busca `WholesalePrice OFF` / `WholesalePriceOFF` / `WHOLESALE OFF`, y **«Precio Especial» no aparece ni una vez en todo `src/`**. Cuando el OFF falta, `fobReebok` (`reebok.ts:78-81`) **estima** el costo: `WholesalePrice × 0,80` en calzado y `× 0,70` en ropa y accesorios. O sea que el descuento del proveedor se sigue ignorando en el camino de la preforma. Medirlo y conectarlo es lo primero cuando se retome.
- Lo que ya está hecho y no espera nada: el flete elegible 1,10 / 1,15, el costo único entre las dos salidas, y el archivo de despacho (puntos 5, 6 y la mitad del 7).

### 5. ~~Reebok: el CIF está clavado en 1,10~~ → **HECHO** (verificado el 18-sep-2026)
> *«Costo CIF seria 1.1 o 1.15 (default 1.1)»* · *«que pueda cambiar el default en configuracion de reebok»* — **7 y 8-sep-2026**

El flete es elegible **1,10 / 1,15**, con 1,10 por defecto (`src/lib/depurador/flete.ts`, leído desde `reebok.ts`). La nota de «clavado en 1,10» quedó vieja.

### 6. ~~Reebok: subir también el «Detalle_ Despacho»~~ → **HECHO el 17-sep-2026** (verificado el 18)
> *«lo que quiero es poder subir ambos excels»* — **8-sep-2026**

Existe `src/lib/depurador/reebok-despacho.ts` y la pantalla dice cuál de los dos archivos se subió. Del despacho se LEE el costo (`Precio after Disc`), el código de barra sale del `EAN` y, sin él, del `UPC`, y la cantidad de `Quantity`.

### 7. Reebok: por qué a veces no llega el precio con descuento — 🔴 **la mitad ABIERTA**
> *«hay algunos excel que no me llega el precio con el descuento… estudia bien el tema de que tiene configurado que recibe vs los excel de la "preforma" enviada»* — **8-sep-2026**

**Reverificado el 18-sep-2026:**
- ✅ **El camino del DESPACHO ya no estima**: `reebok-despacho.ts:129` declara `Precio after Disc` como columna **obligatoria** (con alias `Precio After Disc` y `Precio con descuento`), y si falta, avisa.
- ❌ **El camino de la PREFORMA sigue abierto**: busca `WholesalePrice OFF` (ver 5-bis) y **cuando esa columna falta no avisa en pantalla**. `reebok.ts:365` la resuelve a `null` en silencio, y el único `warnings.push` del parseo (`reebok.ts:351`) es por la columna BASE `WholesalePrice`, no por el OFF. La pantalla tiene panel de avisos (`ReebokClient.tsx`) pero nunca recibe nada de esto.

### 8. ~~Una descripción que «pasa» no queda en el catálogo~~ → **HECHO el 17-sep-2026, y la migración YA ESTÁ APLICADA**
> *«q siga pasando pero se agregue al catalogo (para poner formulas en algun momento)»* — **8-sep-2026**

La que pasa queda registrada con `origen = 'automatica'` (ni semilla ni aprobada: no la aprobó nadie), y desde ahí se le puede poner fórmula. **«Pasar» no cambió de significado**: sigue pasando, sin alertar y sin frenar nada. Se escribe al PROCESAR el archivo, nunca en el camino de la descarga. Regla pura en `descripciones-que-pasan.ts`, envío en `useRegistrarQuePasan.ts`, ruta `…/descripciones/registrar`. Candado `descripciones-que-pasan-se-registran.test.ts`.

~~⚠️ Falta aplicar la migración `20261206120000`~~ → 🩸 **ESO ERA FALSO. Está APLICADA** (verificado el 18-sep-2026 de dos formas: la fila `20261206120000` está en `supabase_migrations.schema_migrations`, y el CHECK real de Postgres ya es `origen = ANY (ARRAY['seed','aprobada','automatica'])`).

⚠️ **Lo que sí falta es una prueba de que escriba.** Medido el 18-sep: `depurador_descripciones` tiene **304 filas — seed 227 · aprobada 77 · automatica 0**, y la última escritura de cualquier tipo es del 10-sep. Ese mismo 18-sep se procesaron tres archivos (Vistana / CK Jeans) sin que naciera ninguna fila `automatica`. Puede ser legítimo —el gancho solo registra lo que NO está ya en el catálogo—, pero hasta que aparezca la primera fila no está demostrado.

### 9. ~~Fórmulas: desplegar una EMPRESA para ver sus marcas~~ → **HECHO el 17-sep-2026** (verificado el 18)
> *«en vistana por ejemplo si toco que se me despliegue todas las marcas de vistana»* · *«los nombres no me convencen y mira el layout no se ve ordenado»* — **7-sep-2026**

La compañía es un botón que dice cuántas marcas tiene y arranca cerrada. Son **dos niveles**: abrir la compañía no abre sus marcas — el plegado por marca que ya existía se conserva. Buscando, la compañía con resultados se abre sola. Candado `formulas-empresa-plegada.test.tsx`, **corrido el 18-sep: pasa**.

### 10. ~~Plantilla Switch › Reglas: las marcas salen todas desplegadas~~ → **HECHO el 17-sep-2026** (verificado el 18)
> *«en configuraciones, las marcas deben de estar plegadas y al tocar desplegar para no irme tanto»* — **7-sep-2026**

Cada marca arranca plegada, con su conteo al lado («14 descripciones»). ⚠️ **La marca sin descripciones no se pliega ni se esconde** (Daniel: *«no se esconden»*): su texto se lee sin tocar nada. Candado `reglas-marcas-plegadas.test.tsx`, **corrido el 18-sep: pasa**.

### 11. ~~El PDF de Comisiones repite el encabezado en cada página~~ → **HECHO el 17-sep-2026** (verificado el 18)
> *«no quiero ver en cada pagina lo mismo… solo en la primera»* — **7-sep-2026**

El título —«Comisión — Vendedor · Empresa · Agosto 2026»— y el logo salen **solo en la primera hoja de cada reporte**: `cabecera(doc, titulo)` se llama una sola vez por hoja dentro de `hojas.forEach` (`src/lib/comisiones/pdf-comision.ts`), y las tablas no tienen `didDrawPage` que lo redibuje. Medido antes: un reporte de 7 hojas traía siete logos y siete veces el mismo renglón, 32 mm de cada página.

🔑 **El archivo que este pendiente nombraba estaba MUERTO.** `ImpresionComision.tsx` es la hoja HTML que se mandaba a `window.print()`; se retiró el 9-sep-2026 y no la monta nadie. Lo que Daniel ve es el PDF de `lib/comisiones/pdf-comision.ts`, y ahí el defecto seguía vivo: se arregló donde se ve.

- 🔴 **Los nombres de columna SÍ se repiten** en cada hoja: sin ellos la tabla de la hoja 3 son números sueltos. Es lo contrario de lo que pidió, y es lo correcto.
- ⚠️ **El pie con la numeración no se tocó**: «Página 2 de 7» sigue en todas.
- Los DOS papeles del módulo (el reporte y la matriz del mes) comparten `pdf-chrome.ts`, así que los dos dejaron de repetirlo.

Candado: `comisiones-titulo-solo-en-la-primera.test.ts`, que mide el texto hoja por hoja. **Corrido el 18-sep: pasa.**

### 12. ~~Catálogos: `/catalogo` da 404~~ → **HECHO el 17-sep-2026** (verificado el 18)
> *«entro a catalogo y sale /catalogos/marcas, después entro a pedidos y sale /catalogo/reebok/pedidos y si pongo /catalogo sale error»* · *«una sola ruta arriba: Inicio › Catálogos › Marcas › Reebok › Pedidos»* — **6-sep-2026**

`/catalogo` y `/catalogos` redirigen (307) a `/catalogos/marcas` desde **`next.config.js`** (`permanent: false`, fuente EXACTA: `/catalogo` no atrapa `/catalogo/reebok`). **Ninguna dirección que hoy funciona dejó de funcionar** y los dos árboles de rutas siguen enteros. La pantalla de comprobantes monta el camino completo debajo de la navbar de la marca. Candado `catalogo-una-sola-ruta-arriba.test.ts`, **corrido el 18-sep: pasa**.

⚠️ El último tramo dice **«Comprobantes»**, no «Pedidos»: ese mismo 6-sep Daniel decidió *«todo Comprobantes, porque ahí también hay cotizaciones y borradores»* justamente porque este lugar tenía tres nombres. Se DERIVA de `PANEL_COMPROBANTES`.

⚠️ **Los dos árboles de rutas siguen conviviendo** (`/catalogos/*` para el hub y administrar, `/catalogo/<marca>/*` para el catálogo con sesión). Unificarlos es otra decisión, y no se tomó.

### 13. ~~La auditoría de rutas se hizo, se entregó y nadie la ejecutó~~ → **los CUATRO puntos que Daniel aprobó, HECHOS el 17-sep-2026** (verificados el 18)
Vive en `docs/mapas/rutas.md` (6-sep, 53 direcciones). Daniel contestó **«todas»**, y se ejecutaron las cuatro:

1. ✅ **Hay pantalla de 404 propia** (`src/app/not-found.tsx`): «Esta pantalla no existe», una línea que explica por qué, y dos salidas — **Ir al inicio** y **Volver** (que solo se dibuja si hay a dónde volver).
2. ✅ **«Ir al inicio» es LA CASA DEL ROL**, no `/home` a secas (`lib/navegacion/casa-del-rol.ts`, importada por `not-found.tsx`, `home/page.tsx` y `AppHeader.tsx`). Y `/home` empuja con `replace`, no con `push`. Si ya está en su casa, el botón NO se dibuja.
   🩸 **Medido**: los roles de UN solo módulo son **`gerente_acs`** (Jennifer) y **`marcacion`**; David entra por su CASA. **BODEGA YA NO ES UNO** — tiene cuatro módulos, así que su Atrás nunca estuvo muerto por esto.
3. ✅ **El breadcrumb de Usuarios** es `Inicio › Administración › Usuarios`, con el grupo **derivado** de `grupoDeModulo("usuarios")`. Decía «Sistema» y el clic caía en `/admin` → Cuentas por Cobrar.
4. ✅ **«Reclamos sin pagar» de Vista General abre el reclamo**: `view=detail` (más la empresa cuando se sabe), por `lib/reclamos/enlace.ts`, importado desde `vista-general/page.tsx`.

Candados: `navegacion-lleva-a-donde-dice.test.ts` · `pantalla-no-existe.test.tsx`. **Corridos el 18-sep: pasan.**

⚠️ **Lo que sigue abierto de esa auditoría, y es decisión de Daniel** (recomprobado uno por uno el 18-sep-2026):
- ❌ **`?search=` de Préstamos sigue muerto.** `SearchBar.tsx` emite `/prestamos?search=<persona>`; `middleware.ts` lo pasa por `destinoDePrestamos`, que **conserva el query** y redirige 307 a `/asistencia?search=…&tab=prestamos`. **Nadie lo lee**: en `/asistencia` no hay ni una lectura de `search`, y el buscador de `PrestamosClient.tsx` es un `useState("")` local que nunca sale de la URL. El parámetro viaja entero y muere.
- 🔶 **El breadcrumb que caía en 404: la mitad se arregló.** Desde `/catalogos/marcas` el `moduleBaseHref` es `/catalogos`, que hoy redirige 307 (punto 12): **arreglado**. Desde **`/productos/cargar` sigue roto**: el `moduleBaseHref` es `/productos`, y `src/app/productos/` solo contiene `cargar/` — no hay `page.tsx` ni redirect. Lo único que cambió es que ahora cae en el 404 en español y no en el de Next.
- 🔶 **Pestañas sin dirección propia: Boston ya la tenía.** `BostonShell.tsx` usa `useUrlState("tab", "inicio")` **desde el 27-ago-2026**, tres semanas antes de la auditoría — esa línea del mapa estaba mal. **Comisiones** sigue sin ser direccionable (`ComisionesPageClient.tsx` lee `?tab=` solo para mapear cuatro valores viejos y nunca escribe de vuelta; la vista viva es `useState`) y **Comprobantes** tampoco (`PedidosListClient.tsx` no tiene ningún estado en la URL).

### 14. ~~El CSV de Reclamos sigue vivo~~ → **HECHO el 17-sep-2026** (verificado el 18)
> *«en ningún lado quiero exportar csv, solo excel»* — **8-sep-2026**

`GET /api/reclamos/export` se retiró (la carpeta ya no existe). Devolvía un CSV con TODOS los reclamos de TODAS las empresas, con precios y montos; no tenía un solo llamador desde `src/`, pero `requireRole` se lo abría a admin y secretaria, así que cualquiera que supiera la dirección se bajaba el archivo entero.

- ⚠️ **Los dos Excel de Reclamos no se tocaron**: `/api/reclamos/[id]/excel` (el que se manda al proveedor) y `/api/reclamos/export-excel` (el de la lista).
- 🔴 **`src/lib/csv-export.ts` NO se borra** (patrón `mayor_lineas`): guarda el porqué del BOM. Queda **sin un solo lector vivo** —su única importación es el test de ida y vuelta— y el candado exige que siga así.
- 🔄 **`cxc-descargas.test.ts` cambió de dirección con nota fechada**: su excepción decía «lo usa Reclamos» y por eso el barrido de «en ningún lado se exporta CSV» tenía un agujero con nombre.

Candado: `reclamos-csv-retirado.test.ts`. **Corrido el 18-sep: pasa.**

---

## 🟡 Decisiones que esperan a Daniel

### 15. El tutorial en VIDEO — él se ofreció a grabarlo y nadie se lo pidió — **ABIERTO**
> *«quiero que cuando el usuario entre, pueda ver un tutorial de todo lo nuevo, una sola vez por módulo por usuario… y si es con video mejor»* · *«Yo te mando el video y tú haces todo el demo?»* · *«avísame cuando necesites un video mío»* — **5-sep-2026**

**Recomprobado el 18-sep-2026:** `grep -rn "<video" src/` → **cero**. Cero archivos `.mp4 / .webm / .mov` en `public/` y en `src/`; cero `youtube / vimeo / loom`; cero coincidencias de «tutorial» en todo `src/`.

La mitad del pedido sí se construyó y está viva: la tira **«Qué cambió»** es `src/components/NovedadesAviso.tsx`, montada en `AppHeader.tsx` con `moduloDeRuta(pathname, ALL_MODULES)` —o sea en todas las pantallas—, con **58 novedades** en `src/lib/novedades/lista.ts`, la ruta `/api/novedades` y un panel de lectura en Usuarios › Novedades (solo admin). Es texto, no video. **El video quedó esperando un aviso que nunca salió.** Él lo quiere solo para computadora.

### 16. «Fotos a mi Excel» y «Tallas por bulto»: decidir si se quedan — **ABIERTO, y 🩸 el medidor no es de fiar**
> *«revisa cuántas veces se ha usado cada uno, y cada empresa, excel, etc.»* — **4-sep-2026**

La instrumentación se puso ese día (`descarga_tallas` desde `CurvasView.tsx` y `descarga_misfotos` desde `MiExcelFotosClient.tsx`, las dos por `logActivityClient` → `POST /api/activity`). Las cuatro semanas se cumplen alrededor del **2-oct-2026**. Son 375 + 254 líneas de código sin una sola prueba de uso.

**Remedido el 18-sep-2026:** `descarga_tallas` = **0 filas** · `descarga_misfotos` = **0 filas**. La tabla `activity_logs` está viva (3.011 filas, la última de hoy).

🩸 **Pero el cero puede no significar nada.** Agrupando `activity_logs` por acción, **NINGUNA acción que empiece por `descarga` tiene una sola fila** — tampoco `descarga_excel`, el de los tres botones de Ventas, que se conectó el 11-sep y lleva una semana en producción. Las tres pasan por el mismo `logActivityClient`. O de verdad nadie descarga nada en ninguno de los tres sitios, o **lo que no llega es el registro**. Hasta saber cuál de las dos es, el 2-oct no se puede decidir nada con este número.
⚠️ Se anota, no se arregla: este encargo era auditar.

### 17. Confecciones Boston: verificarle un dominio propio para el correo — **ABIERTO**
Su correo ya **firma como Boston** (`lib/cxc/casa-del-papel.ts`, decidido el 10-sep): sin logo del grupo, pie «Confidencial» sin `fashiongr.com`, membrete y firma de Boston.

**Recomprobado el 18-sep-2026:** el remitente sigue siendo **`Confecciones Boston <cobros@fashiongr.com>`** (`CASA_BOSTON.remitente`, usado por `/api/cxc/boston/enviar-email`). Solo cambia el NOMBRE visible; la dirección sigue en el único dominio verificado en Resend. 🔴 **Lo que no se sabe no se inventa ni se presta.**

### 18. Liquidación, vacaciones y décimo de la planilla — **ABIERTO a propósito**
> *«sobre planilla, lo de liquidación, vacaciones, etc., dejémoslo para después, primero terminemos sacar bien la planilla con sus préstamos»* — **10-sep-2026**

Pospuesto **a propósito**. Se anota para que el día que alguien retome Planilla sepa que este capítulo quedó abierto por decisión y no por olvido.

**Comprobado el 18-sep-2026 — lo único que nació desde entonces:**
- ✅ **Los días de vacaciones se calculan solos** (17-sep, `lib/asistencia/vacaciones-corresponden.ts`): 30 días corridos por cada 11 meses desde `fecha_ingreso`, menos las registradas. 🔴 **NO entra a ningún cálculo de plata**, ni planilla ni liquidación, con barrido que lo exige.
- ❌ **Liquidación y décimo siguen sin existir como concepto de planilla.** Las dos palabras solo aparecen como etiquetas de `ORIGENES_PAGO` en Préstamos (`Quincena · Décimo · Vacaciones · Liquidación · Abono`), que es de dónde vino un abono, no un cálculo.

### 19. ~~Mover los artículos de Reebok de Active Wear a Active Shoes (en Switch)~~ → **HECHO** (verificado el 18-sep-2026)
> *«no debería de haber reebok con existencia en active wear»* · *«eso lo sacaré del sistema mañana, debería estar en active shoes»* — **9-sep-2026**

Eran **21 artículos · 65 piezas**. **Remedido contra `switch_articulo_info` (sincronizada el 18-sep 04:33 UTC): Reebok con existencia en Active Wear son hoy 0 artículos · 0 piezas.** Las 124 filas de Active Wear con código numérico de 9 dígitos (el patrón de Reebok) están **todas en existencia 0**, y las 29 con «REEBOK» en la descripción, también. Lo que Active Wear tiene hoy con existencia son **13 artículos · 314 piezas, todos Karl Lagerfeld**, que es lo que corresponde.

Daniel lo movió en Switch. Su gemelo (`Men-Polo S/S Core` → `Men-Polos S/S Core`) ya estaba escrito.

### 20. ~~Cristiam: nadie sabe si sigue trabajando~~ → **RESUELTO** (verificado el 18-sep-2026)
> *«cristian no sé si trabaja o no, que la contable haga lo suyo, ¿no?»* — **11-sep-2026**

**La base ya tiene la respuesta:** `CRISTIAM BLANCO` (código 25, Confecciones Boston) está **`activo = false`**, con `fecha_salida = 2026-08-30` y `motivo_salida = "renuncia"`. Renunció el 30-ago-2026. La contadora hizo lo suyo.

### 21. ~~«Solo Angela» en un módulo~~ → **es Caja Menuda. Resuelto el 14-sep-2026**
> *«Andrea 16, Julio 11, Rodrigo 13. estos no deben de estar en el módulo, solo Angela»* — **7-sep-2026**. Daniel confirmó el **14-sep**: *«Caja»*.

**Medido ese día:** Caja tiene **77 gastos vivos y los 77 los escribió Angela**. Entran hoy los admin (alberto, daniel) y quien tenga `caja` en su `modulos_override`: **Angela y andrea, nadie más**. ⚠️ **Rodrigo (vendedor) y Bodega ya no entraban** — su rol no trae `caja` y no tienen override. De los tres que nombró, solo andrea entraba.

🔴 **Daniel decidió que NO se toca** (14-sep-2026). Andrea conserva Caja. La migración que se había preparado se borró para que nadie la corra por error; si algún día se retoma, el patrón es `array_remove` sobre `modulos_override` por `name` exacto, sin tocar `role_permissions`.

### 22. ~~La conversación con la contadora quedó a mitad de frase~~ → **cerrada**
Los tres últimos mensajes de la sesión (**13-sep 18:08 a 18:25**) terminaban en *«¿Qué le respondo? ¿Pongo send o no?»*. Daniel confirmó el **14-sep** que **sí se lo respondió**. El tema era que el corte de la quincena es para las horas extras, y eso ya quedó escrito como regla.

### 23. El botón «Últimos pagos ›» que pidió se construyó y se borró 48 horas después
> *«último 3 pagos lo quiero ahí mismo pero con un botón para expandir, no solo al expandir el card, tendría que hacer dos expandir para verlo»* — **3-sep-2026**

Se construyó el 3-sep y el rediseño del CXC del 5-sep lo eliminó. **Verificado el 18-sep-2026:** el candado que prohíbe que vuelva es `cxc-ultimos-pagos-boton-fila.test.tsx` — *«🩸 el botón «Últimos pagos ›» y su sub-fila ya no existen»*, 10 casos que exigen que no haya botón en escritorio ni en celular y que el bloque «Últimos pagos» salga **exactamente una vez**. **Pasa.**

⚠️ **El problema de fondo sí quedó resuelto** (los pagos salen dentro del panel, o sea un solo expandir), pero el control que él pidió ya no existe y nadie se lo dijo. Se anota por honestidad, no como defecto.

### 24. El Historial del Depurador «dividido en los tabs» — 🔴 **FRENADO: el dato no existe** (reconfirmado el 18-sep-2026)
> *«que historial esté dividido en los tabs, con depurador por defecto que es el que más se usará»* — **5-sep-2026**

Hoy solo tiene filtro por compañía. ⚠️ **Puede estar superado por él mismo**: minutos después dijo *«el historial solo quiero los excel para switch»*, y con un solo tipo guardado las pestañas por tipo pierden sentido.

**Se intentó construirlo con pestañas por el CAMINO que generó el archivo (Depurador · Reebok · Facturas Tienda) y se paró: ese camino NO queda registrado en la fila.** Remedido contra producción el 18-sep-2026:

- Las columnas de `carga_history` son `id · usuario · empresa · marca · cantidad_estilos · total_unidades · total_costo · created_at · archivo_path · archivo_nombre`. **No se agregó ninguna columna `camino` / `origen` / `tipo`.**
- El dispatcher SÍ lo sabe al momento de bajar (`kind` = `ckth` · `reebok` · `tienda`), pero el `onDownloaded` de los tres caminos manda lo mismo y el camino se pierde ahí.
- La pantalla (`HistorialView.tsx`, 204 líneas) tiene filtro por compañía y buscador; **cero pestañas**.
- Deducirlo de la `empresa` funcionaría hoy por casualidad del mapeo (Active Shoes → Reebok, Multifashion → Facturas Tienda, el resto → Depurador). Es exactamente la deducción inventada que hay que evitar: el día que Reebok cargue por otra compañía, la pestaña miente.
- Son **149 filas** (eran 145 el 17-sep): Vistana 61 · Fashion Wear 55 · Fashion Shoes 30 · Active Wear 2 · Active Shoes 1. Deducido por empresa quedaría **Depurador 148 · Reebok 1 · Facturas Tienda 0** — no hay ni una fila de Facturas Tienda en toda la historia.

**Qué decide Daniel:** (a) se agrega una columna `camino` que cada camino escribe al descargar, y las 149 filas viejas quedan «sin registrar» o se rellenan por empresa; (b) se deja el filtro por compañía como está, que con 148-1-0 separa lo mismo; (c) otra cosa.

### 25. La marca repetida ya no cuenta — ¿se revisa lo que la contadora descontó a mano con el Excel viejo?
> *«quiero que el sistema agarre la primera marcación y olvide la próxima si es en x cantidad de tiempo»* · *«1 minuto»* — **18-sep-2026**

Hecho ese mismo día. **Verificado:** `src/lib/asistencia/marca-repetida.ts` con `SEGUNDOS_MARCA_REPETIDA = 60`, inclusivo (60 s exactos se olvidan, 61 no). Dos candados, los dos pasan.

Lo que queda es de Daniel: **el exceso de almuerzo nunca entró al dinero de la planilla del sistema**, así que el neto de ninguna quincena cambia por esto (medido: 16–30 ago, 0 diferencias). Pero el Excel del Reporte de julio y agosto sí decía «exceso de almuerzo» de hasta 6 horas en 20 días (Ramón Miranda, Andrea Pérez, Yeritza Solís, Laura Casiano, Martha Chavarría, Kenner Hernández, Yeishka Diaz, Eloyn Mendoza, Esmer Cruz, Briceida Montero, Jorman Hernández, Cristiam Blanco): **$169,29 al valor del minuto de cada uno en las quincenas ya pagadas** (jul y ago) y $72,79 en 1–15 sep, que hoy ya se ve bien. **Si Yulissa descontó a mano a partir de esa columna, hay que devolverlo; si no, no hay nada que hacer.** Solo ella lo sabe. En el sistema, la única planilla cerrada que toca es Boston 16–30 ago ($3,24, Cristiam) y **no se reabrió nada**.

### 26. Multifashion: qué se le carga el día en que las otras tres cierran con «día libre de la empresa»
> *«multifashion no se comporta igual, ese día se les regala, igual no van a marcar»* · *«no existe que entre semana Multifashion cierre pero las otras trabajen»* — **18-sep-2026**

Hecho ese día: a Multifashion **no se le puede cargar deuda de día libre** (el servidor rechaza, la pantalla no ofrece el motivo; postmortem «Todo de lunes a sábado en Multifashion, y sin deuda de día libre») y el sábado 12-sep quedó como feriado global. Lo que queda es de Daniel: si un día ENTRE SEMANA las tres empresas cierran con día libre (deuda) y Multifashion también cierra, hoy no hay con qué justificarle ese día a Multifashion sin deuda —un feriado global les borraría la deuda a las otras tres—. Él dijo que ese caso no existe; queda anotado por si un día existe.

---

## Cómo se llegó a esta lista

Se extrajeron los **1.197 mensajes** que Daniel escribió entre el 31-ago y el 13-sep-2026, se repartieron en tres tramos y tres agentes los leyeron enteros contra `CLAUDE.md`, `docs/estado-actual.md`, los postmortems y el código. Cada punto se comprobó antes de escribirse. Lo que ya estaba documentado no entró.

🩸 **El hueco que lo hizo necesario:** `docs/estado-actual.md` **salta del 5-sep al 9-sep** — el 6, 7 y 8 de septiembre no tienen una sola línea, y tres días de decisiones viven solo en los commits.

🔴 **Y el hueco que descubrió la auditoría del 18-sep:** este archivo también envejece. Nueve de sus 24 puntos ya estaban resueltos y seguían escritos como abiertos, y once migraciones que `CLAUDE.md` llamaba «pendientes» llevaban tiempo aplicadas. **Antes de construir cualquier cosa que aquí se dé por faltante, se comprueba contra el código y contra la base.**
