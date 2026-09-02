// ─────────────────────────────────────────────────────────────────────────────
// Motor PARAMETRIZADO de sync de catálogo desde Switch (Reebok, Joybees, …).
// El catálogo = TODO lo que tenga EXISTENCIA física (saldo) >= 1 en Switch; el
// usuario solo sube fotos.
//
// Reglas (existencia = saldo, disponibilidad = disponible):
//   1. Existencia >= 1 → visible (active=true); <= 0 → oculto (active=false, NO
//      se borra); si vuelve a tener existencia, reaparece.
//   2. Auto-agregar: codigo nuevo (no en la tabla) con existencia >= 1.
//   3. Refrescar precio + existencia + disponibilidad cada corrida. El PRECIO se
//      alinea a Switch para TODO el universo matcheado (decisión 22-jul-2026):
//      los productos fuera del set /stock (ocultos con disponible=0) se alinean
//      con el precio del bulk /lista, y cada cambio de precio queda logueado en
//      cron_email_errors (tipo catalogo_precio_cambios, SIN Telegram).
//   4. keep_visible / badge "proximamente" fuerzan visible aunque existencia=0.
//      oculto_manual=true (toggle admin "Ocultar del catálogo") GANA sobre todo:
//      el producto queda active=false aunque tenga existencia — el toggle
//      sobrevive al sync. Regla única en lib/catalogos/visibilidad.ts.
//   5. Huérfanos del filtro: un producto PUBLICADO cuyo SKU ya no está en el
//      conjunto FILTRADO de Switch (cambió de proveedor, pasó a KL, o desapareció
//      de /lista) se oculta (active=false); si vuelve a entrar al filtro con
//      existencia, la regla 1 lo reactiva.
//   La regla mostrar/ocultar/agregar usa EXISTENCIA, no disponibilidad.
//
// RETO: `saldo` (existencia) NO viene en el bulk /lista — solo en /stock (1 call
// por artículo), y MEDIDO el 30-jul-2026 no hay forma masiva de pedirlo (ver el
// comentario de STOCK_CONCURRENCIA). ESTRATEGIA: /lista da el universo +
// `disponible`; como existencia >= disponible SIEMPRE, solo se piden /stock del
// set acotado { productos ACTIVOS } ∪ { artículos con disponible >= 1 }, y esas
// llamadas van de a STOCK_CONCURRENCIA en paralelo.
//
// FAIL-SAFE: read-all-then-write. Se juntan TODOS los /stock primero; si CUALQUIER
// llamada falla (ej. 401 sesión muerta) se ABORTA la empresa SIN escribir nada —
// un fallo de Switch NUNCA vacía el catálogo. Idempotente.
//
// ⚠️ Las EMPRESAS se siguen recorriendo EN SERIE (sesión única de Switch: dos
// logins de la misma empresa se matan entre sí). Lo que va en paralelo son las
// llamadas de UNA empresa, que comparten un solo token.
//
// PARAMETRIZACIÓN: cada marca pasa su `CatalogoSyncConfig` (cliente Supabase,
// tabla, scope de empresas, filtro de artículo, campos de stock e inserción). El
// `image_url` JAMÁS se sobreescribe en el UPDATE.
//
// ⚠️ LA `category` TAMPOCO LA ESCRIBE EL MOTOR — pero una marca SÍ puede, por su
// hook `derive`, y hoy lo hacen las cuatro. Tommy y Calvin desde el 5-ago-2026
// (la categoría se DERIVA de la misma descripción que el nombre: refrescar una y
// congelar la otra las dejaba contradiciéndose) y **Reebok desde el 2-sep-2026**,
// cuando se descubrió que la suya no venía de ningún lado: el motor le ponía
// `defaultCategory` en el INSERT y nadie la tocaba nunca más. La regla vigente es
// la de Daniel: **la clasificación la manda Switch**; lo que se edita a mano y el
// sync respeta es la FOTO y el NOMBRE (`foto_manual` / `nombre_manual`).
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from "@supabase/supabase-js";
import { createSwitchClient, type SwitchArticulo } from "./client";
import { createSwitchSyncLog, finishSwitchSyncLog, type SyncLogType } from "./sync-log";
import { columnasImposibles, campoSkip, fmtMonto } from "./monto-guard";
import { calibrarUmbral, avisarMontosImposibles } from "./monto-guard-io";
import { logCronError } from "@/lib/cron-telemetry";
import { esVisibleEnCatalogo } from "@/lib/catalogos/visibilidad";
import { invalidarCatalogoPublico } from "@/lib/catalogo/cache";
import { enParalelo } from "./en-paralelo";
import {
  filaIgual,
  todoSalteado,
  detalleEscrituras,
  type ContadoresEscritura,
} from "./catalogo-igualdad";
import type { MarcaKey } from "@/lib/catalogo/marcas";

const PER_PAGE = 50;
/**
 * 🩸 Freno de emergencia, NO un límite de trabajo (12-ago-2026). Con 80 estaba
 * DEBAJO del catálogo real de vistana (8.173 artículos = 164 páginas): el barrido
 * de Calvin se cortaba en 4.000 EN SILENCIO y se anotaba success con 4 productos.
 * El corte legítimo del barrido es la página corta (arr.length < PER_PAGE);
 * llegar a MAX_PAGES sin verla ahora es un ERROR, nunca un éxito a medias.
 * 250 páginas = 12.500 artículos: 1,5× la empresa más grande del grupo.
 */
const MAX_PAGES = 250;

/**
 * Cuántas llamadas `/apiarticulos/stock` van a la vez.
 *
 * 🩸 POR QUÉ EXISTE ESTE NÚMERO (30-jul-2026). El cron `tommy-catalogo` medía
 * **395-485 s contra un techo de función de 800 s** — el más largo del sistema.
 * Medido fase por fase (`scripts/_medir-tommy-catalogo.ts`): de sus 4 fases, el
 * **72% del tiempo son 478 llamadas `/stock`, una por artículo**, hechas en
 * serie. Es la misma forma que tenía el sync de Boston (4.912 llamadas, 54 min).
 *
 * **No se pudo eliminar las llamadas, así que se acortó el tiempo de pared.**
 * Medido antes de tocar nada (`scripts/_probe-tommy-alternativas.ts`): el bulk
 * `/apiarticulos/lista` devuelve 26 campos y **ninguno es el saldo** (trae
 * `disponible`, que no alcanza: la regla del catálogo es por EXISTENCIA), y
 * `/apiarticulos/stock` **no admite forma masiva** — sin `articuloId`, vacío, 0
 * o -1 responde 200 con body vacío, que en Switch es "esa forma no existe". O
 * sea que la salida de Boston (un reporte del panel web) no está disponible acá.
 *
 * **Nació en 4, conservador a propósito** (30-jul-2026). Medido con lotes
 * DISJUNTOS (reusar el mismo lote medía la caché del servidor y daba un 13,6×
 * imposible): ×3 → 2,8× · ×5 → 4,7× · ×8 → 6,8×, **0 errores y 0 respuestas
 * vacías** en los tres. La curva ya subía en 8 y aun así se eligió 4, porque el
 * único argumento entonces era el presupuesto del CRON (800 s) y ahí sobraba.
 *
 * ⚠️ **Requiere el de-dup de login de `client.ts` (`loginEnVuelo`).** Switch
 * admite UNA sesión por empresa; sin ese candado, N llamadas concurrentes que
 * encuentren el token vencido dispararían N `/autenticacion` y se matarían el
 * token entre sí (code 0006). Subir este número sin ese candado rompe el sync.
 * Candado: `catalogo-stock-paralelo.test.ts`.
 *
 * ═══ 📌 SUBIDO DE 4 A 8 EL 14-AGO-2026, POR DECISIÓN DE DANIEL ═══
 *
 * Textual: *"sobre tommy solo mejoralo si no hay riesgo"*. Lo que cambió no es
 * la matemática sino QUIÉN espera: el presupuesto del cron nunca fue el
 * problema, pero **Daniel también espera mirando** este sync desde "Actualizar
 * ahora", y Tommy es el más largo del sistema por lejos — **455 llamadas
 * `/stock` contra las 127 de Reebok**.
 *
 * **LA CURVA, medida contra `fashion_shoes` con lotes DISJUNTOS y niveles
 * INTERCALADOS** (`N=30 NIVELES=6,8,12,6,8,12 npx tsx scripts/_probe-stock-tommy.ts`),
 * la corrida más limpia (deriva del serial de control: **−1%**), ms/llamada:
 *
 *     ×6   71 · 61
 *     ×8   58 · 54     ← acá
 *     ×12  59 · 54     ← la curva YA NO BAJA
 *
 * y el 4 contra el 8, intercalado ×3 en otra corrida: **×4 107 · 126 ms** contra
 * **×8 66 · 74 ms**. **0 errores y 0 respuestas vacías en TODOS los niveles de
 * las cuatro corridas, ×12 incluido.**
 *
 * **Se elige 8 porque es donde la curva SE APLANA, no porque sea el máximo
 * probado.** De 8 a 12 la mejora es de 1 ms sobre 55: el borde está en 8, y la
 * regla de esta casa es quedarse en el borde y no pasarlo — el cuello es un ERP
 * ajeno del que no controlamos ni el dimensionamiento ni el límite de
 * peticiones.
 *
 * 🩸 **POR QUÉ EL DISEÑO INTERCALADO, y no medir los niveles uno tras otro.**
 * La primera corrida de ese día, con los niveles en orden (4, 6, 8, 12), midió
 * **×8 en 404 ms y ×12 en 281** — peor que ×4 —, con 0 errores y 0 vacías. No se
 * reprodujo ni una vez más: fue un bache del propio Switch (entre corridas, el
 * serial de base saltó de 513 a 1.491 ms/llamada, y el control final de una
 * corrida acusó **−47% de deriva**). Con los niveles en orden, un bache se ve
 * IDÉNTICO a "este nivel es malo"; intercalados, la deriva le pega igual a los
 * dos y la comparación sobrevive. Por eso `_probe-stock-tommy.ts` acepta
 * `NIVELES` repetidos y `FASE` (carril de artículos frío, para que repetir el
 * probe no mida la caché de Switch).
 *
 * ⛔ **LO QUE ESTE CAMBIO NO TOCA, y es la mitad de por qué se pudo hacer.** Es
 * un número: no cambia QUÉ se escribe ni CÓMO. Siguen intactos el read-all-
 * then-write (una `/stock` fallida aborta la empresa sin escribir), los 5 campos
 * que Daniel pone A MANO y que el sync respeta (`image_url`, `badge`,
 * `nombre_manual`, `oculto_manual`, `bulto_pzas`), la regla de que un precio
 * imposible NO se escribe y el producto conserva el último bueno, y los guards
 * del barrido de páginas. **Agrupar las escrituras es OTRO día, con su propia
 * verificación**: un `upsert` mal armado se lleva puestas las fotos de 490
 * productos.
 *
 * **EL ANTES/DESPUÉS REAL, en producción** — no en la laptop: se dispara el cron
 * de verdad y se lee la duración que queda en `switch_sync_log`
 * (`scripts/_verif-stock-concurrencia.ts`). **5 corridas por catálogo de cada
 * lado**, medianas:
 *
 *     catálogo   llamadas /stock    ×4       ×8
 *     Joybees          83          17 s     11 s
 *     Reebok          127          48 s     46 s
 *     Calvin           79          59 s     61 s
 *     Tommy           455         138 s    107 s   ← −31 s (−22%)
 *
 * ⚠️ **Reebok y Calvin casi no se mueven, y es lo esperado**: su set de `/stock`
 * son 127 y 79 artículos. Lo que se come el sync de Calvin es el barrido de las
 * 164 páginas del catálogo de `vistana` (8.173 artículos), que ya se paralelizó
 * en el #540 y no toca este número. **La dispersión de Switch es grande** (las
 * 5 corridas de Tommy antes fueron 180/127/141/122/138 y después
 * 100/107/95/109/151): por eso 5 muestras y mediana, y no un antes y un después.
 *
 * 📊 **DÓNDE QUEDA EL TIEMPO DE TOMMY DESPUÉS DE ESTO.** Medido en producción
 * con `?dryRun=1` —que corre el motor ENTERO contra Switch y **no escribe
 * nada**—, la resta `corrida real − dryRun` es el costo de las **455 UPDATE de a
 * uno** contra Supabase (`scripts/_medir-catalogo-escrituras.ts`):
 *
 *     fase Switch (dryRun)   ×4 107 s  →  ×8  57 s     ← esto es lo que compró
 *     escrituras (resta)         ~31-50 s, sin cambio
 *     corrida completa       ×4 138 s  →  ×8 106 s
 *
 * O sea que de los ~107 s que le quedan a Tommy, **cerca de la mitad son las
 * escrituras**, y ese es el próximo cuello: es de la BASE, no de Switch.
 *
 * ═══ ✅ ESE CUELLO SE ATACÓ EL 14-AGO-2026, Y **NO** AGRUPANDO LOS UPDATE ═══
 * Ver el bloque "LAS ESCRITURAS QUE NO CAMBIAN NADA NO SE HACEN", abajo.
 */
const STOCK_CONCURRENCIA = 8;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LAS ESCRITURAS QUE NO CAMBIAN NADA NO SE HACEN (14-ago-2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 🩸 **EL DATO QUE LO DISPARÓ, medido en producción.** El sync de Tommy manda
 * **455 UPDATE de a uno** en cada corrida (Reebok 127, Joybees 83, Calvin 79) y
 * esas escrituras son ~la mitad de su tiempo. Medido con `_verif-stock-
 * concurrencia.ts` el 14-ago a las 06:17-06:38 UTC, sacando foto de las 5 tablas
 * antes y después de cada corrida: **5 vueltas × 4 catálogos, 1.028 filas y
 * 17.672 campos comparados por vuelta → 🟢 IDÉNTICO en las 20 corridas.** O sea
 * que las 744 escrituras de cada vuelta le escribieron a la base exactamente lo
 * que ya tenía, y en la verificación anterior (misma herramienta) de 497
 * productos de Tommy solo se habían movido 54 campos, todos de
 * `disponibilidad`.
 *
 * ⛔ **LO QUE NO SE HIZO, Y ES LA MITAD DE POR QUÉ SE PUDO HACER.** Daniel lo
 * autorizó con una condición textual: *"solo si no me daña nada"*. En este write
 * path viven la **foto** (`image_url` / `foto_manual`), el **nombre editado**
 * (`nombre_manual`), la **etiqueta** (`badge`), el **"ocultar"**
 * (`oculto_manual`) y el **bulto** (`bulto_pzas`) — trabajo hecho A MANO que
 * **no vuelve de Switch si se pierde**: son 389 fotos de Tommy subidas una por
 * una y 493 productos con foto. Así que:
 *   · **NO se agruparon las escrituras en lotes** — un `upsert` mal armado se
 *     lleva puestas las fotos de 490 productos;
 *   · **NO cambió QUÉ columnas escribe un UPDATE ni con qué valores** — el
 *     payload es el MISMO objeto de siempre, solo que ahora tiene nombre
 *     (`cambios`) para poder compararlo antes de mandarlo;
 *   · **NO se reordenó el write path**, ni se tocaron el read-all-then-write, el
 *     guard del barrido de páginas (#498), el guard de precios imposibles ni la
 *     regla de visibilidad.
 * **Lo único que cambia es CUÁNTAS escrituras se hacen.** Un UPDATE que no
 * ocurre no puede pisar una foto: no hay un camino donde esto borre nada.
 *
 * 🩸 **EL RIESGO REAL NO ES ESCRIBIR DE MÁS: ES NO ESCRIBIR NUNCA.** Si la
 * comparación se equivoca por tipos (numeric contra string, `0` contra
 * `"0.00"`, `null` contra `""`), se saltea el 100% y el catálogo se congela
 * **sin un solo error** — el "cero silencioso". Se cubre con tres cosas:
 *   1. **comparación por tipo EXPLÍCITO** en `catalogo-igualdad.ts` (módulo
 *      puro), que solo devuelve "igual" cuando lo puede PROBAR: columna sin
 *      declarar, columna que no se leyó o tipo inesperado ⇒ se escribe, o sea el
 *      comportamiento de ayer;
 *   2. **contadores por corrida** (`comparados` / `escrituras` / `sinCambios`)
 *      en el resultado y en `switch_sync_log.skip_details` — sin DDL: esa
 *      columna ya existe y los guards de montos ya la usan con SU propio
 *      `campo`;
 *   3. **guard de sanidad** cuando se saltea el 100%, que queda registrado y
 *      **no falla cerrado** a propósito (ver `todoSalteado`).
 * Y el peor caso del acierto es benigno: si se saltea una actualización que
 * hacía falta, los 4 catálogos corren **4×/día** y la siguiente la agarra.
 *
 * **EL ANTES/DESPUÉS REAL, en producción** — no en la laptop: se dispara el cron
 * de verdad y se lee la duración que queda en `switch_sync_log`
 * (`scripts/_verif-stock-concurrencia.ts`). **5 corridas de cada lado, medianas**
 * (antes 06:17-06:38 UTC sobre `main`; después 08:05-08:23, ya deployado):
 *
 *     catálogo   UPDATE/corrida    antes    después
 *     Joybees       83 →  0         15 s      8 s    −47%
 *     Reebok       127 →  0         53 s     28 s    −47%
 *     Calvin        79 →  0         56 s     57 s     ~
 *     Tommy        455 →  0         87 s     65 s    −25%
 *
 * Las 5 corridas, una por una:
 *     antes    joybees 36·41·15·15·15 · reebok 41·38·64·53·63
 *              calvin  56·56·60·106·46 · tommy  77·84·87·109·116
 *     después  joybees  8·28· 7·22· 7 · reebok 57·28·27·39·27
 *              calvin  47·106·57·47·90 · tommy  37·64·65·65·65
 *
 * ⚠️ **CALVIN NO SE MUEVE, Y ES LO ESPERADO** — son 79 escrituras contra el
 * barrido de las **164 páginas** del catálogo de `vistana` (8.173 artículos),
 * que es lo que se come su sync y no tiene nada que ver con esto. Mismo motivo
 * por el que Reebok y Calvin casi no se movieron cuando se subió
 * `STOCK_CONCURRENCIA`.
 *
 * ⚠️ **Y EL NÚMERO DE TOMMY ES MÁS CHICO QUE LOS ~50 s QUE SE ESPERABAN.** Los
 * ~50 s salían de una medición de otro horario; en esta franja (01:00-03:30 a.m.
 * Panamá) la base contesta más rápido y las 455 escrituras costaban ~22 s. Lo que
 * sí mejoró mucho es la **dispersión**: Tommy pasó de 77-116 s a 37-65 s, o sea
 * que el peor caso —que es el que ve Daniel esperando en "Actualizar ahora"— se
 * partió casi al medio.
 *
 * **LA IDENTIDAD, campo por campo, primera foto contra última**: la foto de las
 * 06:17 (antes de todo, con el código viejo) contra la de las 08:23, con **10
 * corridas de sync de por medio** (5 de cada lado) — `joybees_products` 83 filas
 * · `products` 284 · `inventory` 284 · `calvin_products` 80 · `tommy_products`
 * 497 = **1.228 filas y 17.672 campos → 🟢 IDÉNTICO, cero cambios**, con las 493
 * fotos de Tommy y las 283 de Reebok en su lugar. Y en cada una de las 20
 * corridas el log dejó `escrituras=0 · sinCambios=744`.
 */

/**
 * Cuántas páginas de `/apiarticulos/lista` se piden a la vez.
 *
 * 🩸 POR QUÉ EXISTE (13-ago-2026). Daniel: *"hay manera que al actualizar en el
 * sistema en catalogo, ventas, cxc, ect, sea mas rapido la sincronizacion?"*.
 * Medido contra `switch_sync_log` (7 días): los catálogos tardan 135-200 s y la
 * CXC 109 s; las ventas ya salen en 7 s. Medido después contra Switch fase por
 * fase (`scripts/_probe-sync-lento.ts`), el barrido de páginas EN SERIE es la
 * fase que se come el catálogo: vistana tiene 8.173 artículos = 164 páginas de
 * 50, una esperando a la otra.
 *
 * **PRIMERO se intentó pedir MENOS páginas, y no se puede.** Medido contra
 * `vistana` el 13-ago-2026:
 *   · `porPagina` está CAPADO EN 50 — pedir 100, 200, 500 o 1000 devuelve 50
 *     igual (y el propio endpoint informa `paginacion.total = 8173`);
 *   · el parámetro `filtro` —que el cliente acepta y nadie usaba— NO acota por
 *     marca: `filtro=8` devuelve 50 artículos de marcaId 2 y 3, y
 *     `filtro="CK FOOTWEAR"` devuelve 0. No sirve para pedir una sola marca.
 * O sea que las 164 páginas son irreducibles y lo único que queda es acortar el
 * tiempo de pared, igual que con `/stock`.
 *
 * **LA CURVA, con páginas DISJUNTAS** (reusar el mismo lote mide la caché de
 * Switch y da aceleraciones imposibles — ver STOCK_CONCURRENCIA), 16 páginas por
 * nivel, ms/página efectivo y **0 errores y 0 páginas vacías en todos**:
 *
 *     serial ×1  1053 ms   —
 *     ×2          321 ms   3,3×
 *     ×4          160 ms   6,6×
 *     ×6          118 ms   8,9×   ← acá
 *     ×8           98 ms  10,8×
 *     ×12          91 ms  11,6×   ← la curva ya está plana
 *
 * **Se elige 6 y no 12** aunque 12 mida un poco mejor: entre 8 y 12 la mejora es
 * del 8%, o sea que el borde está ahí, y la regla es quedarse POR DEBAJO del
 * borde. Es el mismo criterio con el que se eligió 4 para `/stock`: el cuello de
 * botella es un ERP ajeno del que no controlamos ni el dimensionamiento ni el
 * límite de peticiones, y comprar 4 segundos apretando al proveedor no vale.
 *
 * ⚠️ Requiere el de-dup de login de `client.ts` (`loginEnVuelo`), igual que
 * `/stock`: Switch admite UNA sesión por empresa.
 */
const PAGINAS_CONCURRENCIA = 6;

export interface CatalogoEmpresaScope {
  empresaKey: string;
  /** Categorías existentes a leer para matchear por SKU. [] = leer TODA la tabla
   *  (cuando la tabla es 100% de una marca y las categorías son libres). */
  categories: readonly string[];
  /** Categoría de los productos NUEVOS (la tabla suele tener category NOT NULL). */
  defaultCategory: string;
}

export interface CatalogoSyncConfig {
  /** Marca del catálogo — obligatoria: es la tag que se invalida al terminar
   *  (`catalogo:<marca>`). Al agregar una marca nueva el compilador la exige,
   *  así que no se puede olvidar la invalidación de su catálogo público. */
  marca: MarcaKey;
  /** Cliente Supabase del proyecto donde vive la tabla del catálogo. */
  db: SupabaseClient;
  /** sync_type con el que cada corrida por empresa se registra en switch_sync_log
   *  ('catalogo_reebok' / 'catalogo_joybees') — fuente del streak de la política
   *  anti-ruido 401 (alert-policy.ts). Los dry-run NO se registran. */
  syncLogType: SyncLogType;
  /** Tabla de productos: "products" (Reebok), "joybees_products" (Joybees). */
  productsTable: string;
  empresas: readonly CatalogoEmpresaScope[];
  /** Un artículo entra al catálogo solo si pasa este filtro (Reebok: proveedor;
   *  Joybees: todo). */
  articuloFilter: (a: SwitchArticulo) => boolean;
  /** Tabla de inventario aparte (Reebok). Omitir si el stock vive en el producto
   *  (Joybees usa la columna `stock`). */
  inventoryTable?: string;
  /** Columnas de stock a escribir en UPDATE e INSERT — mapea existencia/
   *  disponibilidad a las columnas de cada tabla (Joybees agrega stock=existencia). */
  stockFields: (existencia: number, disponibilidad: number) => Record<string, unknown>;
  /**
   * Columnas que el UPDATE de esta marca escribe y que NO están en `COLS_BASE`
   * (`stockFields`, `articuloFields`, `derive.updateFields`). Se piden en LA
   * MISMA consulta que ya leía los productos —no es una lectura extra, es la de
   * siempre con más columnas— para poder comparar antes de escribir y saltear
   * el UPDATE que guardaría lo que ya está (ver `catalogo-igualdad.ts`).
   *
   * ⚠️ Olvidar una columna acá NO rompe nada: esa fila nunca se dará por igual y
   * se seguirá escribiendo siempre, o sea el comportamiento de antes. La
   * dirección insegura —dar por igual algo que no se leyó— es imposible por
   * construcción (`filaIgual` exige que la columna esté presente en la fila).
   */
  columnasEscritas?: readonly string[];
  /** Campos fijos extra en el INSERT de nuevos (Reebok: {on_sale:false};
   *  Joybees: {gender:"adults_m"} porque gender es NOT NULL). */
  insertExtras?: Record<string, unknown>;
  /** Columnas extra derivadas del artículo Switch, escritas en UPDATE e INSERT
   *  (Reebok: {codigo_barra_id}). Opcional — omitir si la tabla no tiene las
   *  columnas (Joybees). */
  articuloFields?: (a: SwitchArticulo) => Record<string, unknown>;
  /** Hook por-marca de campos DERIVADOS del artículo (Tommy: name/category/
   *  gender parseados de `descripcion`). A diferencia de articuloFields, puede
   *  PISAR defaults del motor (name/category) y decidir por-fila en el UPDATE
   *  mirando la fila existente (respeta flags tipo nombre_manual):
   *    - insertFields: se aplica en el INSERT, después de los defaults.
   *    - updateFields: se aplica en el UPDATE, después de nameFinal; recibe la
   *      fila existente (con extraCols). {} = no derivar nada en esa fila.
   *    - extraCols: columnas adicionales a leer de la tabla para ese update
   *      (fallback pre-migración igual que oculto_manual: si la columna no
   *      existe aún, se relee sin ella y el hook las ve como undefined).
   *  Reebok/Joybees no lo usan — comportamiento intacto. */
  derive?: {
    extraCols?: readonly string[];
    insertFields: (a: SwitchArticulo) => Record<string, unknown>;
    updateFields?: (a: SwitchArticulo, existing: Record<string, unknown>) => Record<string, unknown>;
  };
  /**
   * Cierre por-marca de UNA empresa, en el MISMO lugar y con las MISMAS
   * garantías que el aviso de precios imposibles: corre con el `logId` de esta
   * corrida todavía abierto y devuelve lo que quiera dejar en `skip_details`.
   *
   * 🔑 Corre ANTES de cerrar el log a propósito. Un aviso con anti-loop lee las
   * corridas anteriores del mismo par (empresa, sync_type) y descarta la
   * ACTUAL por su `logId`; si el hook corriera después del `finish`, su propio
   * rastro ya estaría escrito, se contaría como "ya avisado" y el aviso no
   * saldría NUNCA — un anti-loop que se calla a sí mismo.
   *
   * Nunca puede tumbar el sync: el motor lo envuelve en try/catch y la corrida
   * sigue en `success` aunque el hook falle. Reebok lo usa para el centinela de
   * clasificación; las demás marcas no lo pasan y no cambia nada.
   */
  alCerrarEmpresa?: (ctx: {
    empresaKey: string;
    logId: string | null;
    dryRun: boolean;
  }) => Promise<unknown[]>;
}

interface ExistingProduct {
  id: string;
  sku: string;
  name: string | null;
  price: number | null;
  active: boolean;
  image_url: string | null;
  badge: string | null;
  keep_visible: boolean | null;
  /** Toggle admin "Ocultar del catálogo" (DDL 20260723120000). Puede venir
   *  undefined pre-migración (fallback de lectura) → se trata como false. */
  oculto_manual?: boolean | null;
}

export interface CatalogoPrecioCambio {
  sku: string;
  antes: number | null;
  despues: number;
}

export interface CatalogoSyncResultEmpresa {
  empresaKey: string;
  switchCount: number;   // artículos totales en /lista
  stockChecks: number;   // cuántos /stock se hicieron
  actualizados: number;
  agregados: number;
  ocultados: number;
  reactivados: number;
  nuevosSinFoto: string[];
  /** Precios que esta corrida alineó a Switch (antes → después), logueados
   *  además en cron_email_errors (tipo catalogo_precio_cambios). */
  preciosCambiados: CatalogoPrecioCambio[];
  /** Productos existentes que pasaron por la comparación previa al UPDATE. */
  comparados: number;
  /** UPDATE que SÍ se hicieron (algo había cambiado de verdad). */
  escrituras: number;
  /** UPDATE que se ahorraron porque la base ya tenía exactamente ese valor. */
  sinCambios: number;
  error?: string;        // si está, NO se tocó el catálogo de esta empresa
}

export interface CatalogoSyncResult {
  dryRun: boolean;
  empresas: CatalogoSyncResultEmpresa[];
  nuevosSinFotoTotal: string[];
  hadError: boolean;
}

function num(s: string | null | undefined): number {
  const n = parseFloat(String(s ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Barre TODAS las páginas del catálogo, de a `concurrencia` a la vez.
 *
 * 🔴 LA GARANTÍA DEL #498 NO SE AFLOJA, y en paralelo hay que sostenerla a mano:
 * el corte legítimo sigue siendo la PÁGINA CORTA (`arr.length < PER_PAGE`) y
 * llegar al tope sin verla sigue siendo un ERROR, nunca un éxito a medias. Lo
 * que cambia es que las páginas se piden en TANDAS: dentro de una tanda pueden
 * llegar desordenadas, así que los resultados se recorren SIEMPRE en orden de
 * página y todo lo que venga después de la página corta se descarta.
 *
 * 🩸 Y aparece un caso que en serie era INVISIBLE: que una página corta tenga
 * páginas NO VACÍAS detrás. En serie el barrido cortaba ahí y perdía el resto
 * EN SILENCIO — el mismo modo de fallo del db-max-rows. Acá se ve, porque la
 * tanda ya las pidió, y se trata como lo que es: el catálogo se movió (o Switch
 * devolvió una página trunca) mientras barríamos. Se lanza y no se escribe nada.
 * Es estrictamente más seguro que lo de antes, no menos.
 *
 * ⚠️ Ese guard SOLO es correcto porque se MIDIÓ qué contesta Switch más allá del
 * final, y no se podía suponer: si el endpoint CLAMPEARA a la última página
 * (devolver lo mismo otra vez, que es lo que hacen muchos ERP), la señal sería
 * ruido y el sync erroraría en cada corrida. Medido el 13-ago-2026 contra
 * vistana, cuyo catálogo termina en la página 164: las páginas **165, 167 y 184
 * devuelven 0 artículos**. También se verificó, página por página en las 164,
 * que **todas las intermedias traen exactamente 50** y solo la última trae menos
 * (23) — o sea que el corte por página corta de este archivo es correcto acá.
 * (Ojo: `sync-articulo-marca.ts` y `sync-articulo-info.ts` documentan lo
 * contrario para SU empresa y por eso cortan por página VACÍA. No se tocaron.)
 *
 * `traerPagina` se inyecta para poder probar el barrido sin red.
 */
export async function barrerPaginasArticulos(
  traerPagina: (pagina: number) => Promise<SwitchArticulo[]>,
  opts: {
    empresaKey: string;
    perPage?: number;
    maxPages?: number;
    concurrencia?: number;
  },
): Promise<SwitchArticulo[]> {
  const perPage = opts.perPage ?? PER_PAGE;
  const maxPages = opts.maxPages ?? MAX_PAGES;
  const concurrencia = Math.max(1, opts.concurrencia ?? PAGINAS_CONCURRENCIA);

  const all: SwitchArticulo[] = [];
  let vioElFinal = false;
  let paginaCorta = 0;
  let primeraPagina = 1;

  while (!vioElFinal && primeraPagina <= maxPages) {
    const tanda: number[] = [];
    for (let k = 0; k < concurrencia && primeraPagina + k <= maxPages; k++) {
      tanda.push(primeraPagina + k);
    }
    // enParalelo devuelve EN EL ORDEN DE ENTRADA, así que `respuestas[i]` es la
    // página `tanda[i]` sin importar en qué orden contestó Switch.
    const respuestas = await enParalelo(tanda, concurrencia, (p) => traerPagina(p));
    for (let i = 0; i < tanda.length; i++) {
      const arr = respuestas[i] ?? [];
      if (vioElFinal) {
        if (arr.length > 0) {
          throw new Error(
            `El barrido de artículos de ${opts.empresaKey} vio corta la página ${paginaCorta} y la página ` +
              `${tanda[i]} igual trajo ${arr.length} artículos — el catálogo cambió mientras se barría o Switch ` +
              `devolvió una página trunca. No se escribe nada.`,
          );
        }
        continue;
      }
      all.push(...arr);
      if (arr.length < perPage) {
        vioElFinal = true;
        paginaCorta = tanda[i];
      }
    }
    primeraPagina += tanda.length;
  }

  if (!vioElFinal) {
    // Un catálogo a medias escribiría "agregados: pocos" con cara de success —
    // el mismo silencio del db-max-rows. Mejor la corrida en error y el dato intacto.
    throw new Error(
      `El barrido de artículos de ${opts.empresaKey} llegó al tope de ${maxPages} páginas sin ver la última — catálogo incompleto, no se escribe nada.`,
    );
  }
  return all;
}

async function fetchAllArticulos(empresaKey: string): Promise<SwitchArticulo[]> {
  const client = createSwitchClient(empresaKey);
  return barrerPaginasArticulos(
    async (pagina) => {
      const data = await client.getArticulos({ porPagina: PER_PAGE, paginaActual: pagina });
      return data?.articulos ?? [];
    },
    { empresaKey },
  );
}

export async function syncCatalogo(
  config: CatalogoSyncConfig,
  opts: { dryRun?: boolean; triggeredBy?: "cron" | "manual" | "backfill" } = {},
): Promise<CatalogoSyncResult> {
  const dryRun = !!opts.dryRun;
  const { db, productsTable, inventoryTable } = config;
  const empresasOut: CatalogoSyncResultEmpresa[] = [];

  for (const emp of config.empresas) {
    const out: CatalogoSyncResultEmpresa = {
      empresaKey: emp.empresaKey, switchCount: 0, stockChecks: 0,
      actualizados: 0, agregados: 0, ocultados: 0, reactivados: 0, nuevosSinFoto: [],
      preciosCambiados: [],
      comparados: 0, escrituras: 0, sinCambios: 0,
    };
    // Corrida por empresa en switch_sync_log (streak 401 de alert-policy.ts).
    // Los dry-run no se registran: no son corridas reales y ensuciarían el streak.
    // El insert va DENTRO del try: con el lock de 'running' (índice único,
    // DDL 20260723150000) puede lanzar si ya hay una corrida en curso → la
    // empresa falla limpio (out.error) sin tumbar el resto.
    let logId: string | null = null;
    /** Descartes del guard de precios — se persisten en el log de esta empresa
     *  aunque después falle algo: de ahí sale el anti-loop del aviso. */
    let skipDetailsPrecio: unknown[] | undefined;
    try {
      if (!dryRun) {
        logId = await createSwitchSyncLog({
          empresaKey: emp.empresaKey,
          syncType: config.syncLogType,
          triggeredBy: opts.triggeredBy ?? "cron",
        });
      }
      const client = createSwitchClient(emp.empresaKey);

      // Guard de montos imposibles sobre el PRECIO. Es la única familia que un
      // tercero VE: el precio se publica en el catálogo público. El umbral se
      // calibra contra la tabla de ESTA marca (products / joybees_products /
      // tommy_products), no contra un número fijo.
      const umbralPrecio = await calibrarUmbral("producto", undefined, productsTable);
      const preciosRechazados: Array<{ clave: string; fila: unknown; columnas: Array<{ columna: string; valor: number }> }> = [];
      /** ¿El precio de Switch es usable? Si no, se REGISTRA y se devuelve null:
       *  el producto existente conserva el precio bueno que ya tenía (stock,
       *  nombre y visibilidad se actualizan igual) y el producto nuevo no se
       *  crea — publicarle al cliente final un precio imposible es peor que no
       *  tenerlo en el catálogo. Una fila mala no frena a las demás. */
      const precioUsable = (precio: number, sku: string): number | null => {
        const malas = columnasImposibles("producto", { price: precio }, umbralPrecio);
        if (malas.length === 0) return precio;
        preciosRechazados.push({ clave: sku, fila: { sku, price: precio }, columnas: malas });
        console.error(
          `[${config.syncLogType} ${emp.empresaKey}] PRECIO IMPOSIBLE sku=${sku}: ${fmtMonto(precio)} (tope ${fmtMonto(umbralPrecio)})`,
        );
        return null;
      };

      // (1) /lista bulk → universo + disponible.
      const artsAll = await fetchAllArticulos(emp.empresaKey);
      out.switchCount = artsAll.length;
      // Fail-safe sobre la respuesta CRUDA: 0 artículos = Switch falló → no tocar.
      if (artsAll.length === 0) throw new Error("Switch /lista devolvió 0 artículos — no se toca el catálogo");

      const arts = artsAll.filter(config.articuloFilter);

      // Productos existentes (por categoría, o TODA la tabla si categories=[]).
      // `oculto_manual` (toggle admin, DDL 20260723120000) puede no existir aún:
      // fallback pre-migración — se relee sin la columna y se trata como false,
      // para que la migración manual pendiente NO tumbe el cron del catálogo.
      const readExisting = (cols: string) => {
        let q = db.from(productsTable).select(cols);
        if (emp.categories.length > 0) q = q.in("category", emp.categories as string[]);
        return q;
      };
      const COLS_BASE = "id, sku, name, price, active, image_url, badge, keep_visible";
      // Columnas opcionales: oculto_manual + las extraCols del hook derive
      // (p.ej. nombre_manual de Tommy). Mismo fallback pre-migración para todas.
      const optionalCols = ["oculto_manual", ...(config.derive?.extraCols ?? [])];
      // Columnas que el UPDATE escribe (stock, derivadas de marca…) y que no se
      // pedían porque nadie las leía. Se suman a LA MISMA consulta —no hay una
      // consulta más— para poder comparar antes de escribir.
      const yaPedidas = new Set([...COLS_BASE.split(",").map((c) => c.trim()), ...optionalCols]);
      const colsComparacion = (config.columnasEscritas ?? []).filter((c) => !yaPedidas.has(c));
      // 🩸 ESCALERA, y NO el fallback de un solo escalón que había antes. Con un
      // único "si algo falla, pedí solo COLS_BASE", una columna de comparación
      // ausente (p.ej. `bulto_pzas` antes de su DDL) se habría llevado puesto
      // también `nombre_manual` — y sin `nombre_manual` el sync PISA el nombre
      // editado a mano. O sea: una optimización de velocidad borrando trabajo
      // manual, exactamente lo que este cambio no puede hacer. Cada escalón
      // quita lo menos posible y solo se baja si el error NOMBRA una columna
      // opcional; un error ajeno (permisos, red) se propaga como siempre.
      const escalones = [
        [COLS_BASE, ...optionalCols, ...colsComparacion],
        [COLS_BASE, ...optionalCols],
        [COLS_BASE],
      ];
      const todasOpcionales = [...optionalCols, ...colsComparacion];
      let existing: unknown[] | null = null;
      let exErr: { message: string } | null = null;
      for (let i = 0; i < escalones.length; i++) {
        const r = await readExisting(escalones[i].join(", "));
        existing = r.data as unknown[] | null;
        exErr = r.error;
        if (!exErr) break;
        if (i === escalones.length - 1) break;
        if (!todasOpcionales.some((c) => exErr!.message.includes(c))) break;
      }
      if (exErr) throw new Error(`leer ${productsTable}: ${exErr.message}`);
      const bySku = new Map<string, ExistingProduct>();
      const activeSkus = new Set<string>();
      // Cast vía unknown: el select dinámico (fallback oculto_manual) hace que
      // supabase-js no pueda inferir las columnas.
      for (const p of (existing ?? []) as unknown as ExistingProduct[]) {
        if (!p.sku) continue;
        bySku.set(String(p.sku), p);
        if (p.active) activeSkus.add(String(p.sku));
      }

      // (2) Set a /stock = catálogo ACTIVO ∪ disponible>=1.
      const stockSet = arts.filter(
        (a) => activeSkus.has(String(a.codigo)) || num(a.disponible) >= 1,
      );

      // (3) Junta TODOS los /stock primero (read-all). Si uno falla → throw → ABORTA empresa sin escribir.
      //
      // EN PARALELO, de a STOCK_CONCURRENCIA. Es la fase que se come el sync:
      // medido el 30-jul-2026 en Tommy, 478 llamadas serie = **72% del tiempo
      // total** del cron (que corre en 395-485 s contra un techo de 800).
      const resultados = await enParalelo(stockSet, STOCK_CONCURRENCIA, async (a) => {
        const sd = await client.getStock(a.id);
        const rows = sd?.stock ?? [];
        const saldo = rows.reduce((s, r) => s + num(r.saldo), 0);
        const disp = rows.reduce((s, r) => s + num(r.disponible), 0);
        return { existencia: Math.trunc(saldo), disponibilidad: Math.trunc(disp), art: a };
      });
      // El Map se arma DESPUÉS y en el orden original de `stockSet`, no en el
      // orden en que fueron llegando las respuestas: el loop (4) itera este Map
      // para escribir, y un orden que cambia entre corridas vuelve el sync
      // irreproducible al depurar. El resultado no cambia (cada UPDATE va por
      // id), pero la reproducibilidad sí.
      const stockByCodigo = new Map<string, { existencia: number; disponibilidad: number; art: SwitchArticulo }>();
      for (let i = 0; i < stockSet.length; i++) {
        stockByCodigo.set(String(stockSet[i].codigo), resultados[i]);
      }
      out.stockChecks = stockByCodigo.size;

      // (4) WRITE — solo después de tener TODA la existencia. Por regla EXISTENCIA.
      for (const [codigo, { existencia, disponibilidad, art }] of stockByCodigo) {
        const p = bySku.get(codigo);
        const precio = num(art.precio);

        const precioOk = precioUsable(precio, codigo);

        if (p) {
          // Regla única de visibilidad (lib/catalogos/visibilidad.ts):
          // oculto_manual=true (toggle admin) gana SIEMPRE → el toggle sobrevive
          // al sync; si no, existencia>=1 o keep_visible/proximamente.
          const shouldShow = esVisibleEnCatalogo({
            existencia,
            keepVisible: p.keep_visible,
            badge: p.badge,
            ocultoManual: p.oculto_manual,
          });
          const nameFinal = p.name && p.name.trim() ? p.name : (art.descripcion ?? p.name);
          if (precioOk != null && (p.price == null || Math.abs(Number(p.price) - precio) > 0.004)) {
            out.preciosCambiados.push({ sku: codigo, antes: p.price, despues: precio });
          }
          // 🔴 EL PAYLOAD NO CAMBIÓ NI UNA COLUMNA NI UN VALOR — es el MISMO
          // objeto que se escribía antes, solo que ahora tiene nombre para poder
          // compararlo contra lo guardado. Si algún día hay que tocar QUÉ se
          // escribe, se toca acá y se declara el tipo de la columna en
          // `TIPOS_CAMPO_CATALOGO`; una columna sin declarar se escribe SIEMPRE.
          const cambios: Record<string, unknown> = {
            // Precio imposible → NO se escribe la columna: el producto
            // conserva el último precio bueno y el resto se actualiza igual.
            ...(precioOk != null ? { price: precioOk } : {}),
            name: nameFinal,
            active: shouldShow,
            ...config.stockFields(existencia, disponibilidad),
            ...(config.articuloFields ? config.articuloFields(art) : {}),
            // Hook derive por-marca (Tommy): puede pisar name mirando la fila
            // existente (respeta nombre_manual). {} en Reebok/Joybees.
            ...(config.derive?.updateFields
              ? config.derive.updateFields(art, p as unknown as Record<string, unknown>)
              : {}),
            // image_url INTENCIONALMENTE ausente — jamás se sobreescribe.
            // `category`/`gender` tampoco los pone el motor: los pone la marca
            // por `derive.updateFields`, que corre arriba y ya los agregó si
            // corresponde (ver la nota de la cabecera).
          };
          // ¿Este UPDATE guardaría exactamente lo que ya está? Se compara contra
          // la fila que el read-all-then-write YA tenía en memoria: comparar no
          // cuesta ni una lectura más. Ante cualquier duda, `igual` es false y se
          // escribe igual que ayer (ver el encabezado de catalogo-igualdad.ts).
          const igualdad = filaIgual(cambios, p as unknown as Record<string, unknown>);
          out.comparados++;
          if (igualdad.igual) out.sinCambios++;
          else out.escrituras++;
          if (!dryRun) {
            // supabase-js NO lanza ante error de DB: devuelve { error }. Si no lo
            // chequeamos, un fallo de escritura (p.ej. columna inexistente) queda
            // invisible → contadores mentirosos + heartbeat verde. Throw → aborta
            // la empresa, setea out.error, dispara alerta Telegram (sin falso éxito).
            if (!igualdad.igual) {
              const { error: upErr } = await db.from(productsTable).update(cambios).eq("id", p.id);
              if (upErr) throw new Error(`update ${productsTable} sku=${codigo}: ${upErr.message}`);
            }
            // ⚠️ El inventario de Reebok se sigue escribiendo SIEMPRE, aunque el
            // producto no haya cambiado: saber si ya tiene esa cantidad exigiría
            // LEER `inventory`, y eso sí sería una consulta nueva. Se prefiere la
            // escritura de más antes que una lectura de más contra una base en
            // compute Micro.
            if (inventoryTable) {
              const { error: invErr } = await db.from(inventoryTable).upsert(
                { product_id: p.id, size: "UNICA", quantity: existencia },
                { onConflict: "product_id,size" },
              );
              if (invErr) throw new Error(`upsert ${inventoryTable} product=${p.id}: ${invErr.message}`);
            }
          }
          if (p.active === false && shouldShow) out.reactivados++;
          else if (p.active === true && !shouldShow) out.ocultados++;
          else out.actualizados++;
        } else if (existencia >= 1) {
          // Producto NUEVO con precio imposible: no se crea. No hay precio
          // anterior que conservar y publicarlo sería mostrarle la cifra al
          // cliente final. Vuelve a intentarse en la corrida siguiente.
          if (precioOk == null) continue;
          // Auto-agregar nuevo con EXISTENCIA >= 1.
          out.agregados++;
          out.nuevosSinFoto.push(codigo); // nuevo ⇒ image_url null ⇒ sin foto
          if (!dryRun) {
            const { data: np, error: insErr } = await db.from(productsTable).insert({
              sku: art.codigo,
              name: art.descripcion ?? art.codigo,
              price: precioOk,
              category: emp.defaultCategory,
              active: true,
              image_url: null,
              ...config.stockFields(existencia, disponibilidad),
              ...(config.articuloFields ? config.articuloFields(art) : {}),
              ...(config.insertExtras ?? {}),
              // Hook derive por-marca (Tommy): name/category/gender parseados
              // de la descripcion — pisa el name/category default del motor.
              ...(config.derive ? config.derive.insertFields(art) : {}),
            }).select("id").single();
            // Antes: `if (!insErr && ...)` tragaba el error del INSERT en silencio
            // (contaba el producto como agregado + alerta "nuevo sin foto" aunque no
            // se guardara). Ahora el fallo aborta la empresa y se reporta.
            if (insErr) throw new Error(`insert ${productsTable} sku=${art.codigo}: ${insErr.message}`);
            if (np?.id && inventoryTable) {
              const { error: invErr } = await db.from(inventoryTable).upsert(
                { product_id: np.id, size: "UNICA", quantity: existencia },
                { onConflict: "product_id,size" },
              );
              if (invErr) throw new Error(`upsert ${inventoryTable} product=${np.id}: ${invErr.message}`);
            }
          }
        }
        // existencia<=0 y no está en catálogo → no entra (correcto).
      }

      // (4b) PRECIO SIEMPRE ALINEADO A SWITCH (decisión Daniel 22-jul-2026): el
      // loop (4) solo toca artículos con /stock (activos ∪ disponible>=1). Un
      // producto OCULTO con disponible=0 conservaba su precio local para siempre
      // (audit 22-jul: 100256061 local 45 vs Switch 46). El bulk /lista ya trae
      // `precio` para TODO el universo filtrado → aquí se alinea el precio del
      // resto de los productos matcheados SIN llamadas extra a Switch. Solo se
      // escribe `price` (no se toca active/stock/foto).
      for (const a of arts) {
        const codigo = String(a.codigo);
        if (stockByCodigo.has(codigo)) continue; // ya alineado en (4)
        const p = bySku.get(codigo);
        if (!p) continue;
        const precio = num(a.precio);
        if (precioUsable(precio, codigo) == null) continue; // conserva el precio bueno
        if (p.price != null && Math.abs(Number(p.price) - precio) <= 0.004) continue;
        if (!dryRun) {
          const { error: prErr } = await db
            .from(productsTable)
            .update({ price: precio })
            .eq("id", p.id);
          if (prErr) throw new Error(`precio ${productsTable} sku=${codigo}: ${prErr.message}`);
        }
        out.preciosCambiados.push({ sku: codigo, antes: p.price, despues: precio });
      }

      // (5) HUÉRFANOS DEL FILTRO: el loop (4) solo toca lo que está en
      // stockByCodigo (artículos que PASAN articuloFilter). Un producto PUBLICADO
      // cuyo SKU ya no está en el conjunto FILTRADO (el artículo cambió de
      // proveedor, pasó a "KL*", o desapareció de /lista) quedaba activo para
      // siempre. Se oculta (active=false, NO se borra) — mismo mecanismo que la
      // regla existencia=0. keep_visible / badge "proximamente" se respetan.
      //
      // FAIL-SAFE adicional (no debilita el existente): si el conjunto FILTRADO
      // quedó vacío (p.ej. Switch cambió el formato del campo proveedor y el
      // filtro dejó de matchear), NO se oculta nada en masa — mismo espíritu que
      // el guard de /lista vacía. Solo se ocultan huérfanos cuando el filtro
      // sigue devolviendo artículos reales.
      if (arts.length > 0) {
        const filteredSkus = new Set(arts.map((a) => String(a.codigo)));
        for (const p of bySku.values()) {
          if (!p.active) continue; // ya oculto — nada que hacer
          if (filteredSkus.has(String(p.sku))) continue; // sigue en el filtro (lo maneja el loop 4)
          if (p.keep_visible === true || p.badge === "proximamente") continue;
          if (!dryRun) {
            const { error: hideErr } = await db
              .from(productsTable)
              .update({ active: false })
              .eq("id", p.id);
            if (hideErr) throw new Error(`ocultar huérfano ${productsTable} sku=${p.sku}: ${hideErr.message}`);
          }
          out.ocultados++;
        }
      }

      // Log CONSULTABLE de cambios de precio (cron_email_errors, SIN Telegram —
      // no es un error, es rastro auditable): cada corrida que movió precios
      // deja una fila con el detalle sku: antes → después. Consultar por
      // tipo='catalogo_precio_cambios'. Best-effort: logCronError nunca lanza.
      if (!dryRun && out.preciosCambiados.length > 0) {
        const detalle = out.preciosCambiados
          .map((c) => `${c.sku}: ${c.antes ?? "s/precio"} → ${c.despues}`)
          .join(", ");
        await logCronError(
          "catalogo_precio_cambios",
          `${config.syncLogType} ${emp.empresaKey}: ${out.preciosCambiados.length} precio(s) alineado(s) a Switch — ${detalle}`.slice(0, 1900),
          `${config.syncLogType}:${emp.empresaKey}`,
          { telegram: false },
        );
      }
      // Aviso DESPUÉS de escribir; nunca tumba la corrida.
      if (preciosRechazados.length > 0 && !dryRun) {
        skipDetailsPrecio = preciosRechazados.map((r) => ({
          facturaId: null,
          secuencial: r.clave,
          campo: campoSkip("producto"),
          valorCrudo: { umbral: umbralPrecio, columnas: r.columnas },
        }));
        try {
          await avisarMontosImposibles({
            familia: "producto",
            empresaKey: emp.empresaKey,
            syncType: config.syncLogType,
            rechazadas: preciosRechazados,
            umbral: umbralPrecio,
            logId,
          });
        } catch (e) {
          console.error(`[${config.syncLogType} ${emp.empresaKey}] no pude avisar el precio imposible: ${String(e)}`);
        }
      }
    } catch (err) {
      out.error = err instanceof Error ? err.message : String(err);
    }
    // ── Cuántas escrituras se hicieron y cuántas se ahorraron, POR CORRIDA ──
    // Va en `switch_sync_log.skip_details` (jsonb, sin DDL: la columna ya existe
    // y ya la usan los guards de montos con SU propio `campo`). Los contadores
    // de siempre NO cambian de significado: `records_updated` sigue siendo los
    // productos PROCESADOS y `records_skipped` los ocultados — reinterpretarlos
    // habría movido el piso de `/api/sync-status` y del verificador.
    const contadores: ContadoresEscritura = {
      comparados: out.comparados,
      escrituras: out.escrituras,
      sinCambios: out.sinCambios,
    };
    if (todoSalteado(contadores) && !out.error) {
      // GUARD DE SANIDAD, a propósito NO fail-closed (ver `todoSalteado`): un
      // catálogo que de verdad no se movió entre dos pasadas del mismo día es
      // posible, y tumbar la corrida sería estrenar la alerta que suena para
      // siempre. Lo que no puede es pasar inadvertido: si esto sale TODOS los
      // días en TODOS los catálogos, la comparación se rompió y el catálogo se
      // está congelando en silencio.
      console.warn(
        `[${config.syncLogType} ${emp.empresaKey}] ⚠️ se saltearon las ${contadores.comparados} escrituras (100%): ` +
          `ningún producto cambió. Normal entre dos pasadas seguidas; sospechoso si se repite corrida tras corrida.`,
      );
    }
    // Cierre por-marca (Reebok: el centinela de clasificación). Va acá y no
    // después del `finish` — ver el comentario de `alCerrarEmpresa`.
    let detallesDelCierre: unknown[] = [];
    if (config.alCerrarEmpresa) {
      try {
        detallesDelCierre = await config.alCerrarEmpresa({ empresaKey: emp.empresaKey, logId, dryRun });
      } catch (e) {
        console.error(`[${config.syncLogType} ${emp.empresaKey}] el cierre de la marca falló: ${String(e)}`);
      }
    }
    const detalles = dryRun
      ? undefined
      : [...(skipDetailsPrecio ?? []), ...detallesDelCierre, detalleEscrituras(contadores)];
    if (out.error) {
      await finishSwitchSyncLog(logId, "error", { errorMessage: out.error, skipDetails: detalles });
    } else {
      await finishSwitchSyncLog(logId, "success", {
        inserted: out.agregados,
        updated: out.actualizados + out.reactivados,
        skipped: out.ocultados,
        skipDetails: detalles,
      });
    }
    empresasOut.push(out);
  }

  // Invalidación del catálogo público de ESTA marca (lib/catalogo/cache.ts).
  // Incondicional en corridas reales: el sync es el mayor write path del
  // catálogo (precio, nombre, active, stock) y una corrida "sin cambios"
  // solo cuesta una consulta fría extra. Los dry-run no escriben → no invalidan.
  // Cubre de una sola vez los 3 crons, "Actualizar ahora" y la reconciliación,
  // porque todos entran por aquí.
  if (!dryRun) invalidarCatalogoPublico(config.marca);

  return {
    dryRun,
    empresas: empresasOut,
    nuevosSinFotoTotal: empresasOut.flatMap((e) => e.nuevosSinFoto),
    hadError: empresasOut.some((e) => !!e.error),
  };
}
