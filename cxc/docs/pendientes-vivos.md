# Pendientes vivos — lo que Daniel pidió y sigue sin hacerse

> Nació el **14-sep-2026**, leyendo los 1.197 mensajes que Daniel escribió en la sesión del **31-ago al 13-sep-2026** (33.215 mensajes en total) y contrastándolos uno por uno contra el código y contra producción.
>
> 🔴 **Por qué existe este archivo.** Daniel, textual: *«no todo lo escrito es para siempre, aveces las cosas camvian»* y *«te acuerdas que te dije que se cambia a plantilla switch, no te olvides de las cosas porque yo me olvido y se pasan cosas»*. Lo que se aparca sin anotar se pierde: dos semanas de trabajo dejaron **quince pedidos suyos sin rastro en ningún documento**.
>
> **Cómo se usa:** cada punto trae su cita textual, la fecha, y **qué se comprobó** para decir que sigue pendiente. Al cerrar uno, se borra de aquí y la regla se escribe donde corresponda (`CLAUDE.md` si es invariante, el postmortem del módulo si es historia).

---

## 🔴 Mueven plata

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

### 5. Reebok: el CIF está clavado en 1,10 y tiene que poder ser 1,15
> *«Costo CIF seria 1.1 o 1.15 (default 1.1)»* · *«porque tengo que pagar el flete que es 1.1 siempre es tommy y 1.1 y 1.15 en reebok»* · *«que pueda cambiar el default en configuracion de reebok»* — **7 y 8-sep-2026**

**Comprobado:** `src/lib/depurador/reebok.ts:503` → `round2(fob * 1.1)`, escrito a mano. No hay un solo `1.15` en todo `src/lib/depurador/`. El camino CK/TH sí tiene su `factor` configurable.

### 6. Reebok: subir también el segundo Excel, el «Detalle_ Despacho» de 25 columnas
> *«lo que quiero es poder subir ambos excels»* — **8-sep-2026**

**Comprobado:** `grep -rni "detalle.despacho" src/` → nada. El parser reconoce **un solo** formato (la preforma: `New Article` + `SKU` + `WholesalePrice`).

### 7. Reebok: estudiar por qué a veces no llega el precio con descuento
> *«hay algunos excel que no me llega el precio con el descuento… estudia bien el tema de que tiene configurado que recibe vs los excel de la "preforma" enviada»* — **8-sep-2026**

**Comprobado:** el código tolera que falte (`wholesaleOff: … ? null`), pero no hay aviso en pantalla, ni medición, ni nota de cuándo el proveedor la manda y cuándo no.

### 8. Una descripción que «pasa» no queda en el catálogo, y no se le puede poner fórmula
> *«q siga pasando pero se agregue al catalogo (para poner formulas en algun momento)»* — **8-sep-2026**

**Comprobado:** el único camino que escribe en `depurador_descripciones` es `POST …/descripciones/aprobar`, y su único llamador es `AlarmaDescripcionesNuevas.tsx` — o sea, **solo las que alertan**. Una descripción con veredicto `pasa` nunca llega a tener fila.

### 9. Fórmulas: desplegar una EMPRESA para ver sus marcas
> *«en vistana por ejemplo si toco que se me despliegue todas las marcas de vistana»* · *«los nombres no me convencen y mira el layout no se ve ordenado»* — **7-sep-2026**

**Comprobado:** en `FormulasConfig.tsx` el encabezado de la compañía es un `<div>` estático; solo cada marca se pliega.

### 10. Plantilla Switch › Reglas: las marcas salen todas desplegadas
> *«en configuraciones, las marcas deben de estar plegadas y al tocar desplegar para no irme tanto»* — **7-sep-2026**

**Comprobado:** `ReglasView.tsx` dibuja todas las marcas con todas sus descripciones abiertas.

### 11. El PDF de Comisiones repite el encabezado en cada página
> *«no quiero ver en cada pagina lo mismo… solo en la primera»* — **7-sep-2026**

**Comprobado:** `ImpresionComision.tsx` — el propio comentario dice «repetidos en cada hoja».

### 12. Catálogos: `/catalogo` da 404 y conviven dos árboles de rutas
> *«entro a catalogo y sale /catalogos/marcas, después entro a pedidos y sale /catalogo/reebok/pedidos y si pongo /catalogo sale error»* · *«una sola ruta arriba: Inicio › Catálogos › Marcas › Reebok › Pedidos»* — **6-sep-2026**

**Comprobado:** no existen `src/app/catalogo/page.tsx` ni `src/app/catalogos/page.tsx`, y `next.config.js` no redirige ninguna de las dos. La pantalla de pedidos no monta encabezado ni breadcrumb.

### 13. La auditoría de rutas se hizo, se entregó y nadie la ejecutó
Vive en `docs/mapas/rutas.md` (6-sep, 53 direcciones) y **cierra con seis preguntas para Daniel que nunca se respondieron** — él pidió un mockup y no lo recibió. Comprobado hoy, siguen vivos: el «atrás» muerto para bodega, Jennifer y David; **cero `not-found.tsx` en todo el sistema** (el 404 sale en inglés, el de Next); el breadcrumb de Usuarios que dice «Sistema» y cae en Cuentas por Cobrar; `?search=` de Préstamos que nadie lee; y «Reclamos sin pagar» de Vista General, que no abre el reclamo.

### 14. El CSV de Reclamos sigue vivo
> *«en ningún lado quiero exportar csv, solo excel»* — **8-sep-2026**

**Comprobado:** `/api/reclamos/export` sigue devolviendo CSV. No tiene llamadores desde `src/`, pero cualquier admin o secretaria que sepa la dirección la abre. El candado `cxc-descargas.test.ts` lo deja pasar como excepción («lo usa Reclamos»), y eso ya no es cierto.

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

### 24. El Historial del Depurador «dividido en los tabs»
> *«que historial esté dividido en los tabs, con depurador por defecto que es el que más se usará»* — **5-sep-2026**

Hoy solo tiene filtro por compañía. ⚠️ **Puede estar superado por él mismo**: minutos después dijo *«el historial solo quiero los excel para switch»*, y con un solo tipo guardado las pestañas por tipo pierden sentido. Preguntarle antes de construir.

---

## Cómo se llegó a esta lista

Se extrajeron los **1.197 mensajes** que Daniel escribió entre el 31-ago y el 13-sep-2026, se repartieron en tres tramos y tres agentes los leyeron enteros contra `CLAUDE.md`, `docs/estado-actual.md`, los postmortems y el código. Cada punto se comprobó antes de escribirse. Lo que ya estaba documentado no entró.

🩸 **El hueco que lo hizo necesario:** `docs/estado-actual.md` **salta del 5-sep al 9-sep** — el 6, 7 y 8 de septiembre no tienen una sola línea, y tres días de decisiones viven solo en los commits.
