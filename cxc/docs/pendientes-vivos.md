# Pendientes vivos — lo que Daniel pidió y sigue sin hacerse

> Nació el **14-sep-2026**, leyendo los 1.197 mensajes que Daniel escribió en la sesión del **31-ago al 13-sep-2026** (33.215 mensajes en total) y contrastándolos uno por uno contra el código y contra producción.
>
> 🔴 **Por qué existe este archivo.** Daniel, textual: *«no todo lo escrito es para siempre, aveces las cosas camvian»* y *«te acuerdas que te dije que se cambia a plantilla switch, no te olvides de las cosas porque yo me olvido y se pasan cosas»*. Lo que se aparca sin anotar se pierde: dos semanas de trabajo dejaron **quince pedidos suyos sin rastro en ningún documento**.
>
> **Cómo se usa:** cada punto trae su cita textual, la fecha, y **qué se comprobó** para decir que sigue pendiente. Al cerrar uno, se borra de aquí y la regla se escribe donde corresponda (`CLAUDE.md` si es invariante, el postmortem del módulo si es historia).

---

## 🔴 Mueven plata

### 0-bis. Lo que quedó abierto del cuadre contra el Excel de Yulissa (15-sep-2026)

Daniel contestó ocho preguntas del cuadre el 15-sep. **Lo cerrado se escribió directo en producción** (salarios de Ramón Miranda y Carlos Ruíz, bajas de Cristiam Blanco y Héctor Leonel Pérez, tres nombres, «Trabaja afuera» a los cuatro). Queda abierto:

1. 🔴 **Las fechas de entrada de las seis de Multifashion.** Jenifer Miranda · Jailine Quispe · Milagros Torres · Sheynee Batista · Yeisibeth Muñoz · Cindy De Gracia. Daniel, **15-sep-2026**: *«4. ponlo en la lista de pendientes»*. Sin ellas, el sistema cuenta como falta todos los días anteriores a que empezaran.
2. ⚠️ **El motivo de salida de los dos que salieron va como «otro».** Cristiam Blanco (30-ago-2026) y Héctor Leonel Pérez A. (2-sep-2026). El CHECK `asistencia_personas_baja_completa` exige fecha **y** motivo juntos, y el motivo no se sabe. **La liquidación lo necesita**: hay que cambiarlo a `despido` o `renuncia`.
3. ~~El apellido de Julio, código 11~~ → **RESUELTO el 18-sep-2026.** Daniel: *«ya te dije q guzman, garay no»*. Verificado contra producción ese día: la ficha ya dice **«Julio Guzmán»**, empresa `vistana`. No había nada que cambiar.
4. ⚠️ **«Otros servicios» no existe como campo.** Daniel, **15-sep-2026**: *«debería de haber un campo en la ficha que diga "otros servicios", y a qué quincena se le aplica ese extra (debe de ser la misma en la que trabajó)»*. Hoy solo se puede escribir en la casilla de la fila de la planilla, quincena por quincena. Diseño sin definir.
5. ~~Tres códigos del reloj sin ficha son FANTASMAS~~ → **RESUELTO el 18-sep-2026.** Daniel: *«los 3 codigos del reloj escondelos»*.
   🩸 **Ya estaban escondidos, y ése era el problema.** Medido contra producción ese día: 39, 55 y 9999 estaban en `asistencia_codigos_ignorados` **desde el 11-sep-2026, puestos por `daniel`** — y él los seguía viendo en la pestaña Asistencia con su «falta configurar». La razón: esconder se enchufó en la Planilla y en Configuración, pero **el Reporte nunca lo leyó**. Arreglado el 18-sep (`src/app/api/asistencia/reporte/route.ts`, candado en `planilla-tres-descuentos.test.ts`).
   ⚠️ La tabla **no estaba vacía**: tiene SEIS filas. Las otras tres las puso Contabilidad — 25 (Cristiam Blanco) y 48 (Héctor Pérez), que ya salieron, y 52 (Daniel Levy).
6. ⚠️ **Ana Trejos (2), Cindy De Gracia (3) y Yeisibeth Muñoz (306) no están dadas de alta en el reloj**, y `luis` (id 1000, organización AMERICAN CLASSICS) sí está en el reloj y **nunca marcó ni tiene ficha**. Medido contra las fotos del 15-sep-2026.

### 0. El reloj de la quincena 1–15 de septiembre cortó el **10**, y solo Fashion Wear quedó cerrada así
Daniel, **15-sep-2026**, textual: *«el 10 de septiembre se cortó el reloj de la planilla manual del excel»* y *«acuérdate que el reloj cortó el 10, así que para la próxima quincena es desde el 11 hasta cuando corte contabilidad»*.

**Medido contra producción el 15-sep-2026.** De las cuatro empresas, la quincena 1–15 de septiembre está guardada **solo en Fashion Wear**, con `corte = 2026-09-10`. Vistana, Confecciones Boston y Multifashion **no la tienen cerrada**, y lo que sí tienen son rangos que no son quincenas (`2026-08-29 → 2026-09-10` en Vistana, `2026-08-15 → 2026-08-31` y `→ 2026-08-25` en Boston), de cuando Roxana estaba probando.

🔴 **Por qué importa:** el «Ajuste quincena anterior» —los días 11 al 15, que se pagaron sin medir— sale del corte **GUARDADO** de la quincena cerrada. Sin cerrar 1–15 con corte el 10, esos cinco días **no se ajustan en la del 16–30 y se pierden en silencio**.

**Qué falta:** cerrar 1–15 de septiembre con corte **2026-09-10** en Vistana, Confecciones Boston y Multifashion. Lo hace la contadora, no se puede hacer por ella: cerrar es suyo.

⚠️ Y el corte **NO es siempre el 10**: lo elige ella cada quincena (`CORTE_SUGERIDO` solo propone). La regla que se repite es *desde el día siguiente al último corte, hasta donde ella corte*.


### 1. ~~El daño de mercancía no propone cuota~~ → **HECHO el 14-sep-2026**
Daniel: *«Tanto el chico como el grande que sea por cuota, ¿no? Agregan el daño como se hace un préstamo, se elige la cuota y listo»*. El daño se registra con su cuota y entra solo a la planilla hasta saldarse. Migración `20261122120000` (mercancía con los tres estados), **aplicada y verificada el 14-sep-2026**.

**Cerrado entero el mismo día**, con lo que Daniel decidió punto por punto (*«1. Sí, con opción de editar. 2. Sí. 3. …»*):
1. ✅ **La cuota de daño se edita** en «Editar ficha», junto a las otras dos. Un `0` apaga la cuota y **no borra la deuda**.
2. ✅ **El cierre anota el pago del daño solo**, igual que el préstamo (ya leía `dinero.mercancia`).
3. ✅ **Boston suma las tres cuotas** en su «descuenta $X por quincena».
4. ✅ **La fecha del movimiento NO decide la quincena** y se queda así (Daniel: *«2. Sí»*): lo que se descuenta es una cuota que se repite hasta saldarse, no el evento. Para saltarse una quincena se escribe `0`.

### 2. ~~Tres quincenas cerradas sin descontar préstamos~~ → **no era un problema: son PRUEBAS**
Daniel, **14-sep-2026**: *«A nadie se le ha pagado nada. La contadora está probando el sistema, aún no lo entiende.»*

Las 6 quincenas guardadas son de **Roxana (la contadora) probando el módulo**, no planillas pagadas. Ninguna plata salió, así que **no hay nada que recuperar ni que corregir hacia atrás**. Las 5 armadas como rango libre —que prorratean el sueldo y apagan los montos a mano— son parte del aprendizaje.

🔴 **Lo que sí queda, y es de USO, no de plata: el corte no se entiende.** Roxana, por WhatsApp el 14-sep: *«Un poco complicado el tema del corte»* · *«Los préstamos no me salían pero cuando generé ya lo hizo»*. Está esperando la planilla de Yulissa para comparar. La pregunta abierta: **si la pantalla debe frenar (o avisar fuerte) cuando el período que se va a cerrar no es una quincena real.**

### 3. ~~Una factura de agosto no le llegó a Rey~~ → **cerrado: no es del sistema**
Daniel, **14-sep-2026**: *«Olvídalo, no es problema del sistema»*. La factura 11-000000502 tiene otro vendedor **en Switch**; el sistema lee lo que Switch manda. No hay nada que arreglar aquí.

### 4. El cuadre del estado de cuenta llegó muerto
**Medido el 14-sep-2026:** `switch_estadocuenta_saldo` se escribe en cada corrida, pero **las 835 filas traen `saldo_total` y `saldos` en NULL — cero llenas**. Switch no manda esos dos campos con el nombre que el sync busca, así que el aviso «esto no cuadra» **no puede saltar nunca** y el cajón se comporta como si siempre cuadrara.

🔴 **Daniel ya dijo cómo tratarlo:** primero investigar qué manda de verdad `/apicliente/estadocuenta`, y **reportárselo antes de tocar nada**.

---

## 🟠 Módulos a medio terminar

### 5-bis. Reebok: en pausa hasta que Daniel junte cuatro archivos
Daniel, **14-sep-2026**: *«deja que me llegue lo que son: 1. OB, que es lo pendiente para despachar. 2. El Excel de lo facturado. 3. Las facturas en PDF. Y voy a querer también hacer lo de subir un Excel con referencias y pegar las fotos. Son 4 archivos; cuando lo tenga vemos ese tema de Reebok. Te aviso»*.

🔴 **No se toca Reebok hasta que él avise.** Lo que quedó a medias y espera esos archivos:
- **«Precio Especial» es su costo FOB** y el sistema no reconoce esa columna. Hoy busca `WholesalePrice OFF`, que **no existe en ningún Excel real de Reebok** (ni el de agosto ni el de septiembre). O sea que el descuento del proveedor **se está ignorando en las dos salidas** y esos artículos entran a Switch con el precio completo. Medirlo y conectarlo es lo primero cuando se retome.
- Lo que ya está hecho y no espera nada: el flete elegible 1,10 / 1,15 y el costo único entre las dos salidas.

### 5. ~~Reebok: el CIF está clavado en 1,10~~ → **HECHO** (verificado el 18-sep-2026)
> *«Costo CIF seria 1.1 o 1.15 (default 1.1)»* · *«que pueda cambiar el default en configuracion de reebok»* — **7 y 8-sep-2026**

El flete es elegible **1,10 / 1,15**, con 1,10 por defecto (`src/lib/depurador/flete.ts`, leído desde `reebok.ts`). La nota de «clavado en 1,10» quedó vieja.

### 6. ~~Reebok: subir también el «Detalle_ Despacho»~~ → **HECHO el 17-sep-2026** (verificado el 18)
> *«lo que quiero es poder subir ambos excels»* — **8-sep-2026**

Existe `src/lib/depurador/reebok-despacho.ts` y la pantalla dice cuál de los dos archivos se subió. Del despacho se LEE el costo (`Precio after Disc`), el código de barra sale del `EAN` y, sin él, del `UPC`, y la cantidad de `Quantity`.

### 7. Reebok: estudiar por qué a veces no llega el precio con descuento
> *«hay algunos excel que no me llega el precio con el descuento… estudia bien el tema de que tiene configurado que recibe vs los excel de la "preforma" enviada»* — **8-sep-2026**

**Comprobado el 18-sep-2026:** en el camino del **despacho** ya no se estima: el costo se LEE de `Precio after Disc`. Lo que sigue abierto es el camino de la **preforma**, que busca `WholesalePrice OFF` — una columna que no aparece en ningún Excel real (ver 5-bis) — y que cuando falta no avisa en pantalla.

### 8. ~~Una descripción que «pasa» no queda en el catálogo~~ → **HECHO el 17-sep-2026**
> *«q siga pasando pero se agregue al catalogo (para poner formulas en algun momento)»* — **8-sep-2026**

La que pasa queda registrada con `origen = 'automatica'` (ni semilla ni aprobada: no la aprobó nadie), y desde ahí se le puede poner fórmula. **«Pasar» no cambió de significado**: sigue pasando, sin alertar y sin frenar nada. Se escribe al PROCESAR el archivo, nunca en el camino de la descarga. Regla pura en `descripciones-que-pasan.ts`, envío en `useRegistrarQuePasan.ts`, ruta `…/descripciones/registrar`. Candado `descripciones-que-pasan-se-registran.test.ts`.

⚠️ **Falta aplicar la migración `20261206120000`** (ensancha el CHECK de `origen`). Hasta entonces falla ABIERTA: no registra nada y todo se comporta como antes.

### 9. ~~Fórmulas: desplegar una EMPRESA para ver sus marcas~~ → **HECHO el 17-sep-2026**
> *«en vistana por ejemplo si toco que se me despliegue todas las marcas de vistana»* · *«los nombres no me convencen y mira el layout no se ve ordenado»* — **7-sep-2026**

La compañía es un botón que dice cuántas marcas tiene y arranca cerrada. Son **dos niveles**: abrir la compañía no abre sus marcas — el plegado por marca que ya existía se conserva. Buscando, la compañía con resultados se abre sola. Candado `formulas-empresa-plegada.test.tsx`.

### 10. ~~Plantilla Switch › Reglas: las marcas salen todas desplegadas~~ → **HECHO el 17-sep-2026**
> *«en configuraciones, las marcas deben de estar plegadas y al tocar desplegar para no irme tanto»* — **7-sep-2026**

Cada marca arranca plegada, con su conteo al lado («14 descripciones»). ⚠️ **La marca sin descripciones no se pliega ni se esconde** (Daniel: *«no se esconden»*): su texto se lee sin tocar nada. Candado `reglas-marcas-plegadas.test.tsx`.

### 11. ~~El PDF de Comisiones repite el encabezado en cada página~~ → **HECHO el 17-sep-2026**
> *«no quiero ver en cada pagina lo mismo… solo en la primera»* — **7-sep-2026**

El título —«Comisión — Vendedor · Empresa · Agosto 2026»— y el logo salen **solo en la primera hoja de cada reporte**. Medido antes: un reporte de 7 hojas traía siete logos y siete veces el mismo renglón, 32 mm de cada página.

🔑 **El archivo que este pendiente nombraba estaba MUERTO.** `ImpresionComision.tsx` es la hoja HTML que se mandaba a `window.print()`; se retiró el 9-sep-2026 y no la monta nadie. Lo que Daniel ve es el PDF de `lib/comisiones/pdf-comision.ts`, y ahí el defecto seguía vivo: se arregló donde se ve.

- 🔴 **Los nombres de columna SÍ se repiten** en cada hoja: sin ellos la tabla de la hoja 3 son números sueltos. Es lo contrario de lo que pidió, y es lo correcto.
- ⚠️ **El pie con la numeración no se tocó**: «Página 2 de 7» sigue en todas.
- Los DOS papeles del módulo (el reporte y la matriz del mes) comparten `pdf-chrome.ts`, así que los dos dejaron de repetirlo.

Candado: `comisiones-titulo-solo-en-la-primera.test.ts` (11), que mide el texto hoja por hoja.

### 12. ~~Catálogos: `/catalogo` da 404~~ → **HECHO el 17-sep-2026**
> *«entro a catalogo y sale /catalogos/marcas, después entro a pedidos y sale /catalogo/reebok/pedidos y si pongo /catalogo sale error»* · *«una sola ruta arriba: Inicio › Catálogos › Marcas › Reebok › Pedidos»* — **6-sep-2026**

`/catalogo` y `/catalogos` redirigen (307) a `/catalogos/marcas`, con fuente EXACTA: **ninguna dirección que hoy funciona dejó de funcionar** y los dos árboles de rutas siguen enteros. La pantalla de comprobantes monta el camino completo debajo de la navbar de la marca. Candado `catalogo-una-sola-ruta-arriba.test.ts`.

⚠️ El último tramo dice **«Comprobantes»**, no «Pedidos»: ese mismo 6-sep Daniel decidió *«todo Comprobantes, porque ahí también hay cotizaciones y borradores»* justamente porque este lugar tenía tres nombres. Se DERIVA de `PANEL_COMPROBANTES`.

⚠️ **Los dos árboles de rutas siguen conviviendo** (`/catalogos/*` para el hub y administrar, `/catalogo/<marca>/*` para el catálogo con sesión). Unificarlos es otra decisión, y no se tomó.

### 13. ~~La auditoría de rutas se hizo, se entregó y nadie la ejecutó~~ → **los CUATRO puntos que Daniel aprobó, HECHOS el 17-sep-2026**
Vive en `docs/mapas/rutas.md` (6-sep, 53 direcciones). Daniel contestó **«todas»**, y se ejecutaron las cuatro:

1. ✅ **Hay pantalla de 404 propia** (`src/app/not-found.tsx`): «Esta pantalla no existe», una línea que explica por qué, y dos salidas — **Ir al inicio** y **Volver** (que solo se dibuja si hay a dónde volver).
2. ✅ **«Ir al inicio» es LA CASA DEL ROL**, no `/home` a secas (`lib/navegacion/casa-del-rol.ts`, una sola función para el redirect del home, el 404 y el botón del encabezado). Y `/home` empuja con `replace`, no con `push`: así dejaba la pantalla en el historial y el Atrás rebotaba. Si ya está en su casa, el botón NO se dibuja.
   🩸 **Medido el 17-sep-2026**: los roles de UN solo módulo son **`gerente_acs`** (Jennifer) y **`marcacion`**; David entra por su CASA. **BODEGA YA NO ES UNO** — tiene cuatro módulos, así que su Atrás nunca estuvo muerto por esto. La auditoría lo contaba entre los tres y esa línea ya era vieja.
3. ✅ **El breadcrumb de Usuarios** es `Inicio › Administración › Usuarios`, con el grupo derivado de `grupoDeModulo("usuarios")`. Decía «Sistema» y el clic caía en `/admin` → Cuentas por Cobrar.
4. ✅ **«Reclamos sin pagar» de Vista General abre el reclamo**: `view=detail` (más la empresa cuando se sabe), por `lib/reclamos/enlace.ts`.

Candados: `navegacion-lleva-a-donde-dice.test.ts` (25) · `pantalla-no-existe.test.tsx` (6).

⚠️ **Lo que sigue abierto de esa auditoría, y es decisión de Daniel**: los dos árboles de Catálogos (punto 12 de esta lista), `?search=` de Préstamos que nadie lee, el breadcrumb que cae en 404 desde `/catalogos/marcas` y `/productos/cargar`, y las pestañas sin dirección propia de Comisiones, Comprobantes y Boston.

### 14. ~~El CSV de Reclamos sigue vivo~~ → **HECHO el 17-sep-2026**
> *«en ningún lado quiero exportar csv, solo excel»* — **8-sep-2026**

`GET /api/reclamos/export` se retiró. Devolvía un CSV con TODOS los reclamos de TODAS las empresas, con precios y montos; no tenía un solo llamador desde `src/`, pero `requireRole` se lo abría a admin y secretaria, así que cualquiera que supiera la dirección se bajaba el archivo entero.

- ⚠️ **Los dos Excel de Reclamos no se tocaron**: `/api/reclamos/[id]/excel` (el que se manda al proveedor) y `/api/reclamos/export-excel` (el de la lista).
- 🔴 **`src/lib/csv-export.ts` NO se borra** (patrón `mayor_lineas`): guarda el porqué del BOM. Queda **sin un solo lector**, y el candado exige que siga así.
- 🔄 **`cxc-descargas.test.ts` cambió de dirección con nota fechada**: su excepción decía «lo usa Reclamos» y por eso el barrido de «en ningún lado se exporta CSV» tenía un agujero con nombre.

Candado: `reclamos-csv-retirado.test.ts` (8).

---

## 🟡 Decisiones que esperan a Daniel

### 15. El tutorial en VIDEO — él se ofreció a grabarlo y nadie se lo pidió
> *«quiero que cuando el usuario entre, pueda ver un tutorial de todo lo nuevo, una sola vez por módulo por usuario… y si es con video mejor»* · *«Yo te mando el video y tú haces todo el demo?»* · *«avísame cuando necesites un video mío»* — **5-sep-2026**

**Comprobado:** `grep -rn "<video" src/` → cero. La mitad del pedido sí se construyó (la tira «Qué cambió», que cumple lo de una vez por módulo por usuario); **el video quedó esperando un aviso que nunca salió.** Él lo quiere solo para computadora.

### 16. «Fotos a mi Excel» y «Tallas por bulto»: decidir si se quedan
> *«revisa cuántas veces se ha usado cada uno, y cada empresa, excel, etc.»* — **4-sep-2026**

La instrumentación se puso ese día (`descarga_tallas` / `descarga_misfotos` en `activity_logs`). `docs/mapas/depurador.md` dice que no hay **ni una fila** y anota «vuelve a mirar en 4 semanas» — que se cumplen alrededor del **2-oct-2026**. Son 375 + 254 líneas de código sin una sola prueba de uso.

### 17. Confecciones Boston: verificarle un dominio propio para el correo
Su correo ya **firma como Boston** (`lib/cxc/casa-del-papel.ts`, decidido el 10-sep). Pero sale por Resend desde `fashiongr.com` con el nombre cambiado, porque Boston no tiene dominio. 🔴 **Lo que no se sabe no se inventa ni se presta.**

### 18. Liquidación, vacaciones y décimo de la planilla
> *«sobre planilla, lo de liquidación, vacaciones, etc., dejémoslo para después, primero terminemos sacar bien la planilla con sus préstamos»* — **10-sep-2026**

Pospuesto **a propósito**, pero no anotado: el día que alguien retome Planilla no hay nada que le diga que este capítulo quedó abierto por decisión y no por olvido.

### 19. Mover los artículos de Reebok de Active Wear a Active Shoes (en Switch)
> *«no debería de haber reebok con existencia en active wear»* · *«eso lo sacaré del sistema mañana, debería estar en active shoes»* — **9-sep-2026**

Son **21 artículos · 65 piezas**. Es tarea de Daniel en Switch. Su gemelo (`Men-Polo S/S Core` → `Men-Polos S/S Core`) sí quedó escrito; éste no.

### 20. Cristiam: nadie sabe si sigue trabajando
> *«cristian no sé si trabaja o no, que la contable haga lo suyo, ¿no?»* — **11-sep-2026**. Pregunta abierta para la contadora.

### 21. ~~«Solo Angela» en un módulo~~ → **es Caja Menuda. Resuelto el 14-sep-2026**
> *«Andrea 16, Julio 11, Rodrigo 13. estos no deben de estar en el módulo, solo Angela»* — **7-sep-2026**. Daniel confirmó el **14-sep**: *«Caja»*.

**Medido ese día:** Caja tiene **77 gastos vivos y los 77 los escribió Angela**. Entran hoy los admin (alberto, daniel) y quien tenga `caja` en su `modulos_override`: **Angela y andrea, nadie más**. ⚠️ **Rodrigo (vendedor) y Bodega ya no entraban** — su rol no trae `caja` y no tienen override. De los tres que nombró, solo andrea entraba.

🔴 **Daniel decidió que NO se toca** (14-sep-2026). Andrea conserva Caja. La migración que se había preparado se borró para que nadie la corra por error; si algún día se retoma, el patrón es `array_remove` sobre `modulos_override` por `name` exacto, sin tocar `role_permissions`.

### 22. ~~La conversación con la contadora quedó a mitad de frase~~ → **cerrada**
Los tres últimos mensajes de la sesión (**13-sep 18:08 a 18:25**) terminaban en *«¿Qué le respondo? ¿Pongo send o no?»*. Daniel confirmó el **14-sep** que **sí se lo respondió**. El tema era que el corte de la quincena es para las horas extras, y eso ya quedó escrito como regla.

### 23. El botón «Últimos pagos ›» que pidió se construyó y se borró 48 horas después
> *«último 3 pagos lo quiero ahí mismo pero con un botón para expandir, no solo al expandir el card, tendría que hacer dos expandir para verlo»* — **3-sep-2026**

Se construyó el 3-sep y el rediseño del CXC del 5-sep lo eliminó; hoy hay un candado que **prohíbe que vuelva**. ⚠️ **El problema de fondo sí quedó resuelto** (los pagos salen dentro del panel, o sea un solo expandir), pero el control que él pidió ya no existe y nadie se lo dijo. Se anota por honestidad, no como defecto.

### 24. El Historial del Depurador «dividido en los tabs» — 🔴 **FRENADO el 17-sep-2026: el dato no existe**
> *«que historial esté dividido en los tabs, con depurador por defecto que es el que más se usará»* — **5-sep-2026**

Hoy solo tiene filtro por compañía. ⚠️ **Puede estar superado por él mismo**: minutos después dijo *«el historial solo quiero los excel para switch»*, y con un solo tipo guardado las pestañas por tipo pierden sentido.

**Se intentó construirlo con pestañas por el CAMINO que generó el archivo (Depurador · Reebok · Facturas Tienda) y se paró: ese camino NO queda registrado en la fila.** Medido contra producción el 17-sep-2026:

- Las columnas de `carga_history` son `id · usuario · empresa · marca · cantidad_estilos · total_unidades · total_costo · created_at · archivo_path · archivo_nombre`. **No hay ninguna que diga por dónde entró el archivo.**
- El dispatcher SÍ lo sabe al momento de bajar (`kind` = `ckth` · `reebok` · `tienda`), pero el `onDownloaded` de los tres caminos manda lo mismo y el camino se pierde ahí.
- Deducirlo de la `empresa` funcionaría hoy por casualidad del mapeo (Active Shoes → Reebok, Multifashion → Facturas Tienda, el resto → Depurador). Es exactamente la deducción inventada que hay que evitar: el día que Reebok cargue por otra compañía, la pestaña miente.
- Y las **145 filas** de junio a septiembre quedarían así: **Depurador 144 · Reebok 1 · Facturas Tienda 0** (no hay ni una fila de Facturas Tienda en toda la historia).

**Qué decide Daniel:** (a) se agrega una columna `camino` que cada camino escribe al descargar, y las 145 filas viejas quedan «sin registrar» o se rellenan por empresa; (b) se deja el filtro por compañía como está, que con 144-1-0 separa lo mismo; (c) otra cosa.

---

## Cómo se llegó a esta lista

Se extrajeron los **1.197 mensajes** que Daniel escribió entre el 31-ago y el 13-sep-2026, se repartieron en tres tramos y tres agentes los leyeron enteros contra `CLAUDE.md`, `docs/estado-actual.md`, los postmortems y el código. Cada punto se comprobó antes de escribirse. Lo que ya estaba documentado no entró.

🩸 **El hueco que lo hizo necesario:** `docs/estado-actual.md` **salta del 5-sep al 9-sep** — el 6, 7 y 8 de septiembre no tienen una sola línea, y tres días de decisiones viven solo en los commits.
