// ─────────────────────────────────────────────────────────────────────────────
// CLASIFICACIÓN DEL CATÁLOGO REEBOK — categoría y género, DERIVADAS DE SWITCH.
//
// Módulo PURO (sin base, sin red, sin DOM). Es el mapa de UNA marca: Reebok.
//
// 🔴 ESTE MAPA NO SE COMPARTE CON OTRA MARCA, Y NO ES UN DESCUIDO.
// Los tres campos de Switch significan cosas OPUESTAS según la marca:
//
//     Reebok (active_shoes)        rubro = CATEGORÍA   subrubro = GÉNERO
//     Tommy / Calvin               rubro ≈ GÉNERO      subrubro ≈ CATEGORÍA
//
// Tommy y Calvin derivan de la `descripcion` ("Women-Sandals") con su propio
// parser (`tommy-nombres.ts` / `calvin-nombres.ts`). Reebok NO PUEDE copiar ese
// método: su `descripcion` es SOLO el nombre del producto ("ZIG DYNAMICA 6",
// "CLASSIC LEATHER") y no lleva género — medido el 2-sep-2026 sobre los 237
// artículos con existencia de `active_shoes` en `switch_articulo_info`: **solo 2
// tienen un guion, y los dos son "T-SHIRT"**, no un separador género-categoría.
// Un mapa compartido entre marcas leería el género de Reebok en el campo de la
// categoría de Tommy. Por eso hay un archivo por marca y ningún tronco común.
//
// ═══ 🔴 EL SISTEMA LE CREE A SWITCH ══════════════════════════════════════════
// Daniel, textual: *«las cosas deben ser sencillas y yo ordenarlas como se debe
// en Switch»*. De acá se sigue todo lo demás:
//   · NO hay reglas con nombre propio: ni un `if (sku === "APPCL071")`, ni una
//     lista de excepciones, ni un parseo del nombre para "arreglar" lo que
//     Switch dice. Un dato mal cargado se corrige EN SWITCH.
//   · Lo que el mapa no reconoce NO se adivina: cae en el cajón neutro y AVISA
//     (`clasificacion-aviso.ts`, canal 🔧 SISTEMA). Adivinar y avisar son cosas
//     distintas: esta función solo sabe hacer la segunda.
//
// 🩸 LA REGLA GENERAL QUE ESTE ARCHIVO ESTRENA, y que el repo ya tenía escrita
// del otro lado: **un cajón por defecto NUNCA puede ser el primero de la lista.**
// `sync-articulo-marca.ts:19` lo dice para las marcas — *«LA MARCA NO SE
// ADIVINA»*— y el sync de catálogos hacía exactamente lo que esa regla prohíbe:
// metía TODO en `footwear` + `male`, que son dos valores VÁLIDOS. Medido el
// 2-sep-2026 contra producción: **173 de 173 altas desde el 24-jun quedaron
// `male`**, 107 de ellas el 1-sep. Ningún centinela de "valores raros" iba a
// atrapar eso, porque no había ningún valor raro: había una mentira bien
// formada. Por eso el cajón por defecto de esta marca es `otros` /
// `sin_clasificar` — valores que NO están en `categoryOptions` ni en
// `genderOptions`, así que no se pueden confundir con una clasificación real.
// ─────────────────────────────────────────────────────────────────────────────

/** Las categorías REALES del catálogo Reebok (las que tienen chip propio). */
export type CategoriaReebok = "footwear" | "apparel" | "accessories";

/** Los géneros REALES del catálogo Reebok (los que tienen chip propio).
 *  `unisex` NO está: Switch lo manda, pero el mapa lo resuelve a `male` — ver
 *  `generoReebok`. Nada se guarda como "unisex" desde este mapa. */
export type GeneroReebok = "male" | "female" | "kids";

/**
 * 🔴 EL CAJÓN NEUTRO DE CATEGORÍA.
 *
 * NO es una categoría del negocio: no está en `categoryOptions` del tema, así
 * que el producto se ve en «Todos» y **bajo ningún chip**. Hay candado que pone
 * el build rojo si el `defaultCategory` de cualquier marca vuelve a ser una
 * categoría real (`catalogo-cajon-neutro.test.ts`).
 */
export const CATEGORIA_SIN_CLASIFICAR = "otros";

/**
 * 🔴 EL CAJÓN NEUTRO DE GÉNERO.
 *
 * Es un STRING y no `null` a propósito: `joybees_products.gender` es NOT NULL
 * (verificado contra el esquema de producción el 2-sep-2026), así que un `null`
 * tumbaría el INSERT de esa marca ANTES de que corra ninguna migración. El
 * sentinel entra igual en las dos tablas, hoy, sin DDL previa.
 *
 * `normalizeGender` no lo reconoce (no contiene ninguna raíz de ningún grupo) ⇒
 * cae en el grupo "otros" ⇒ visible en «Todos», invisible bajo cada chip. Es
 * exactamente el mismo comportamiento que tendría un `null`, y encima se puede
 * buscar con grep.
 */
export const GENERO_SIN_CLASIFICAR = "sin_clasificar";

/** lowercase→UPPER + trim + colapsa espacios. Switch manda con espacios
 *  sobrantes y mayúsculas inconsistentes ("women-Sneakers" existe en los datos
 *  reales de otra marca); acá se compara SIEMPRE normalizado. */
const U = (v: string | null | undefined): string =>
  String(v ?? "").trim().toUpperCase().replace(/\s+/g, " ");

/**
 * 🔴 LA CATEGORÍA LA MANDA LA **MARCA**. Ésta es la fuente primaria.
 *
 * En Reebok lo que Switch llama "marca" es en realidad el DEPARTMENT del archivo
 * del proveedor (FOOTWEAR / APPAREL / HARDWARE) — es lo que el propio Depurador
 * escribe en esa columna al armar la plantilla (`depurador/reebok.ts`:
 * `"Marca *": first.department`). Es un vocabulario de TRES valores, cerrado y
 * estable.
 *
 * **Medido sobre los 609 artículos distintos de `active_shoes` en
 * `switch_factura_lineas` (2-sep-2026), y con CERO contradicciones en las dos
 * direcciones** —ningún FOOTWEAR que no sea SHOES, ningún APPAREL que sea
 * SHOES—:
 *
 *     marca FOOTWEAR ↔ rubro SHOES      456 / 456
 *     marca APPAREL  ↔ rubro APPAREL     10 / 10
 *     marca HARDWARE ↔ rubro BAGS         1 / 1
 *
 * El `rubro`, en cambio, tiene **35 valores** y casi todos son basura vieja:
 * `REEBOK CLASSICS CORE FTW MEN`, `PROMO`, `OFERTA`, `GENERAL`, `RUNNING CORE`…
 * Elegir el campo con 3 valores estables antes que el de 35 es la diferencia
 * entre un mapa que se mantiene solo y uno que hay que estar remendando.
 */
const CATEGORIA_POR_MARCA: Record<string, CategoriaReebok> = {
  FOOTWEAR: "footwear",
  APPAREL: "apparel",
  HARDWARE: "accessories",
};

/**
 * `rubro` → categoría. **SEGUNDO intento: solo se consulta si la marca vino
 * VACÍA.** Nunca compite con la marca ni la corrige — si la marca dice algo, la
 * marca gana.
 *
 * ⚠️ SOCKS es APPAREL, no ACCESSORIES. Decisión de Daniel, textual: *«es
 * apparel, o sea ropa, ¿por qué sería accesorio?»* — y Switch mismo las manda
 * con `marca=APPAREL`, así que por el camino primario ya caen bien. Son los 7
 * códigos `ACCS0xx`.
 *
 * ⚠️ `SHORTS` y `SOCKS` **no aparecen ni una vez** en el histórico de renglones
 * de factura: son valores nuevos que el mapa acepta por adelantado. Por eso el
 * candado que los prueba usa valores LITERALES y no se apoya en que existan en
 * los datos de hoy — un test que solo mira lo que ya pasó no protege lo que va
 * a pasar.
 *
 * ⚠️ `HEADWEAR` (las gorras) entró el 2-sep-2026, con las primeras 400 fichas
 * REALES de `switch_articulo_info`. **No cambia nada de lo que pasa hoy**, y eso
 * está medido: los 7 artículos con existencia cuyo rubro es HEADWEAR traen los
 * 7 `marca = HARDWARE`, así que el camino primario ya los manda a `accessories`
 * sin consultar esta tabla. Está acá por las otras dos razones:
 *   · es el plan B honesto del día que una gorra llegue con la marca vacía —
 *     HARDWARE ya es `accessories`, así que decir otra cosa sería inventar; y
 *   · el Depurador tiene la lista ESPEJO de ésta
 *     (`REEBOK_CATEGORY_ESPERADAS`), y sin HEADWEAR ahí **cada archivo de
 *     Reebok con gorras avisaba en pantalla «valor inesperado» por un valor
 *     perfectamente normal**. Un aviso que grita sobre un dato bueno es el
 *     mismo defecto que la falsa alarma de abajo, en la otra punta del sistema.
 * El candado compara las dos listas y no deja agregar en una sin la otra.
 */
const CATEGORIA_POR_RUBRO: Record<string, CategoriaReebok> = {
  SHOES: "footwear",
  APPAREL: "apparel",
  SHORTS: "apparel",
  SOCKS: "apparel",
  BAGS: "accessories",
  HEADWEAR: "accessories",
};

/**
 * `subrubro` → género. LISTA CERRADA, igual que la de Tommy: lo que no está,
 * no se adivina.
 *
 * ⚠️ `UNISEX` **NO está en este mapa a propósito** — no es un género, es un
 * empate, y se resuelve aparte (ver `generoReebok`).
 *
 * ⚠️ Los subrubros VIEJOS sin género —RUNNING, TENNIS, TRAINING, BASKETBALL—
 * son historia (último uso mayo-2024, ninguno con existencia) y NO se mapean a
 * propósito: caen en el cajón neutro como cualquier valor que el mapa no
 * conozca. Mapearlos sería inventarles un género que Switch nunca dijo.
 */
const GENERO_POR_SUBRUBRO: Record<string, GeneroReebok> = {
  MALE: "male",
  MEN: "male",
  FEMALE: "female",
  WOMEN: "female",
  KIDS: "kids",
};

/** El valor con el que Switch dice "no me decido". Es lo ÚNICO que habilita a
 *  mirar el nombre. */
const SUBRUBRO_EMPATE = "UNISEX";

/**
 * ¿El nombre del producto dice que es de mujer?
 *
 * 🔴 SOLO SE LLAMA PARA DESEMPATAR UN `UNISEX`. Ver `generoReebok`.
 *
 * Dos formas, y nada más — barrido completo sobre los nombres reales de
 * `active_shoes` (2-sep-2026): no existe `WMN`, ni `LADIES`, ni `FEM`, ni
 * ninguna otra marca de mujer en el maestro.
 *   · `WOMEN` como palabra  → los 8 `APPCL0xx` "WOMEN BIG/SMALL LOGO TEE"
 *   · `W` como palabra ENTERA → `FOUND W 3P INVISBLE SOCK` (2 artículos)
 *
 * 🩸 **LA TRAMPA, Y ESTÁ MEDIDA: la `W` tiene que ser PALABRA COMPLETA.** Un
 * "¿termina en W?" o un `includes("W")` agarra **`REEBOK TERRAIN EDGE LOW`** y
 * **`REEBOK BASE TRAIL LOW`** — la W de **LOW** — y manda dos zapatillas de
 * hombre a la sección de mujer. Por eso `\bW\b` y no otra cosa, y por eso esos
 * dos nombres están en el candado con nombre y apellido.
 */
export function nombreDiceMujer(nombre: string | null | undefined): boolean {
  const n = U(nombre);
  return /\bWOMEN\b/.test(n) || /\bW\b/.test(n);
}

/**
 * Categoría del artículo, o `null` si el mapa no la reconoce.
 *
 * `null` NO es "otros": es "no sé". Quien llama decide qué hacer con eso —y la
 * decisión de este sistema es **no pisar lo que ya está clasificado** (ver
 * `clasificacionDeArticulo`). Devolver "otros" desde acá haría imposible
 * distinguir "Switch dice que no encaja" de "Switch mandó algo nuevo".
 */
export function categoriaReebok(
  rubro: string | null | undefined,
  marca: string | null | undefined,
): CategoriaReebok | null {
  // La MARCA primero, siempre. El rubro es el plan B de una marca vacía.
  const porMarca = CATEGORIA_POR_MARCA[U(marca)];
  if (porMarca) return porMarca;
  return CATEGORIA_POR_RUBRO[U(rubro)] ?? null;
}

/**
 * Género del artículo, o `null` si el mapa no lo reconoce (misma regla que
 * `categoriaReebok`: `null` es "no sé", no un valor).
 *
 * ═══ 🔴 EL NOMBRE **SOLO** DESEMPATA EL UNISEX ═══════════════════════════════
 *
 * Daniel, textual: *«las camisetas WOMEN LOGO TEE deben de ir a mujer; debe de
 * Switch decir women o unisex, si es unisex, que lea el nombre»*.
 *
 *     Switch dice MALE / MEN      → Hombre   ← el nombre NO se mira
 *     Switch dice FEMALE / WOMEN  → Mujer    ← el nombre NO se mira
 *     Switch dice KIDS            → Niños    ← el nombre NO se mira
 *     Switch dice UNISEX          → el nombre desempata; si no dice nada, Hombre
 *     cualquier otra cosa         → null (cajón neutro + aviso)
 *
 * 🔴 **UN MALE O UN FEMALE EXPLÍCITO DE SWITCH NO SE PUEDE CONTRADECIR NUNCA**,
 * diga lo que diga el nombre. Ésa es la diferencia entre DESEMPATAR y ADIVINAR,
 * y es la línea que separa este mapa de un parser de nombres. La estructura del
 * código la hace imposible de cruzar sin querer: `nombreDiceMujer` se consulta
 * dentro de UNA rama, la del empate, y en ningún otro lugar. Hay candado.
 *
 * Y el default del empate es Hombre, no el cajón neutro: *«yo compro lo que me
 * venden como unisex, o sea hombre»*. Un unisex SÍ tiene respuesta; lo que no
 * la tiene es un subrubro que nadie conoce.
 */
export function generoReebok(
  subrubro: string | null | undefined,
  nombre?: string | null,
): GeneroReebok | null {
  const s = U(subrubro);
  // 🔴 Primero lo explícito. Si Switch se decidió, acá termina la función y el
  // nombre no llega a mirarse.
  const explicito = GENERO_POR_SUBRUBRO[s];
  if (explicito) return explicito;
  // Y solo acá, en el empate, el nombre tiene algo que decir.
  if (s === SUBRUBRO_EMPATE) return nombreDiceMujer(nombre) ? "female" : "male";
  return null;
}

/** La ficha de Switch, con lo único que la clasificación mira. */
export interface FichaSwitch {
  rubro: string | null;
  subrubro: string | null;
  marca: string | null;
  /**
   * 🩸 **CUÁNDO SE LE PIDIÓ ESTA FICHA A SWITCH.** `null` = TODAVÍA NO SE PIDIÓ.
   *
   * Es OBLIGATORIA en el tipo a propósito, y no opcional: quien arme una ficha
   * tiene que DECIR si llegó o no. Un campo opcional se olvida en silencio y el
   * olvido se paga con un aviso falso — ver `fichaLlego`, justo abajo.
   */
  ficha_at: string | null;
}

/**
 * ═══ 🩸 «TODAVÍA NO LLEGÓ» NO ES «LLEGÓ ALGO QUE NO ENTIENDO» ════════════════
 *
 * LA FALSA ALARMA DEL 2-SEP-2026, 2:52 PM. Textual, a Telegram:
 *
 *     🔧 SISTEMA · El catálogo de Reebok recibió una clasificación que no
 *     conoce — Active Shoes
 *     · rubro "(vacío)" — 233 producto(s) …
 *     · subrubro "(vacío)" — 233 producto(s) …
 *     Qué hacer: revisar esos artículos en Switch y ponerles el rubro y el
 *     subrubro que les corresponde.
 *
 * **Era mentira, y las tres partes eran mentira.** Switch no había mandado nada
 * raro: la migración acababa de crear `rubro`/`subrubro`/`marca` y estaban en
 * `NULL` porque el cron de fichas todavía no había corrido. El aviso mandaba a
 * Daniel a Switch a arreglar 233 artículos que no tenían absolutamente nada
 * malo — y que a las pocas horas se arreglaron solos, con la primera corrida.
 *
 * 🔑 **De la regla 2 de las alertas de SISTEMA — «es real · no se arregla solo ·
 * alguien tiene que hacer algo» — ese aviso fallaba las TRES.**
 *
 * La causa: el sync leía la FILA de `switch_articulo_info` (que existe desde el
 * barrido de páginas, que trae el precio) y la trataba como una FICHA. Una fila
 * con los tres campos en `NULL` no es una ficha vacía: es una ficha que todavía
 * no se pidió. `ficha_at` es lo único que distingue las dos cosas, y por eso
 * viaja hasta acá en vez de quedarse en la consulta.
 *
 * ⚠️ **LA DECISIÓN SE TOMA ACÁ Y EN UN SOLO LUGAR** — no en el `select`. Filtrar
 * en la consulta (`.not("ficha_at","is",null)`) parece más barato y no lo es:
 * son 2 páginas de PostgREST igual, y partiría la regla en dos lugares que se
 * pueden desincronizar. Con la regla en el módulo puro, el candado la prueba sin
 * base y CUALQUIER lector de fichas —el sync, el backfill, el verificador—
 * hereda la protección sin acordarse de ella.
 *
 * Los TRES casos, separados:
 *   · `ficha_at = null`            → **no avisa.** No es un hallazgo: es una
 *     cola que todavía no se drenó, y se arregla sola en la próxima corrida.
 *   · ficha traída, valor que el
 *     mapa no traduce               → **avisa**, como siempre.
 *   · ficha traída, campo VACÍO     → **avisa.** Preguntamos y Switch contestó
 *     "nada": eso es un dato REAL sobre lo que hay cargado en Switch, no se
 *     arregla solo (ningún cron llena un campo que Switch no tiene) y lo que hay
 *     que hacer es exactamente lo que el mensaje dice. Medido el 2-sep-2026
 *     sobre las 400 fichas ya traídas: **1 solo artículo** (ACCH001, con
 *     existencia 39) tiene el subrubro vacío de verdad, y ni siquiera está en el
 *     catálogo. O sea que con esta separación el aviso hoy queda MUDO: los 233
 *     eran falsos, los 0 restantes son verdaderos.
 */
export function fichaLlego(ficha: FichaSwitch | null | undefined): ficha is FichaSwitch {
  return !!ficha && String(ficha.ficha_at ?? "").trim() !== "";
}

/** Lo que el producto YA tiene guardado (para no pisarlo con un "no sé"). */
export interface ClasificacionGuardada {
  category?: string | null;
  gender?: string | null;
}

export interface Clasificacion {
  category: string;
  gender: string;
  /** Valores crudos que el mapa NO reconoció. Alimentan el aviso de SISTEMA —
   *  van con su campo para que el mensaje diga QUÉ hay que arreglar en Switch. */
  desconocidos: Array<{ campo: "rubro" | "subrubro" | "marca"; valor: string }>;
}

/**
 * La clasificación FINAL de un artículo: lo que el sync tiene que escribir.
 *
 * 💸 🔴 **UN "NO SÉ" NUNCA PISA UNA CLASIFICACIÓN QUE YA EXISTE, Y ESO ES PLATA.**
 * El bulto sale de la categoría (`reebok-bulto.ts`: calzado 12, todo lo demás 6)
 * y el total del pedido se cobra por bulto (`reebok-order-total.ts`). Si Switch
 * renombrara mañana el rubro `SHOES`, un mapa ingenuo mandaría 288 zapatillas al
 * cajón neutro y **el sistema empezaría a cobrar 6 pares donde vende 12: la
 * mitad**. Con esta regla eso no puede pasar — la zapatilla conserva `footwear`,
 * el aviso sale igual, y el cajón neutro queda SOLO para los productos NUEVOS,
 * que es donde de verdad no hay nada que conservar.
 *
 * PURA: no lee la base, recibe lo guardado como argumento.
 */
export function clasificacionDeArticulo(
  ficha: FichaSwitch | null | undefined,
  /** El nombre del producto — **solo** para desempatar un `subrubro = UNISEX`
   *  (ver `generoReebok`). Ningún otro camino lo mira. */
  nombre: string | null | undefined = null,
  guardado: ClasificacionGuardada = {},
): Clasificacion {
  const desconocidos: Clasificacion["desconocidos"] = [];

  // Sin ficha no hay nada que decidir: se conserva lo que haya (y un producto
  // nuevo entra al cajón neutro). NO se avisa: "todavía no le pedí la ficha a
  // Switch" no es "Switch mandó algo que no entiendo".
  //
  // 🩸 `fichaLlego` y no `!ficha`: una FILA de `switch_articulo_info` sin
  // `ficha_at` existe (la escribe el barrido de precios) y tiene los tres campos
  // en NULL. Tratarla como ficha es lo que produjo la falsa alarma de las 233
  // — ver el bloque completo arriba de `fichaLlego`.
  if (!fichaLlego(ficha)) {
    return {
      category: guardado.category || CATEGORIA_SIN_CLASIFICAR,
      gender: guardado.gender || GENERO_SIN_CLASIFICAR,
      desconocidos,
    };
  }

  const cat = categoriaReebok(ficha.rubro, ficha.marca);
  if (cat === null) {
    // Se reporta el rubro Y la marca: los dos se miraron y ninguno alcanzó, así
    // que decir solo uno mandaría a corregir el campo equivocado.
    if (U(ficha.rubro)) desconocidos.push({ campo: "rubro", valor: U(ficha.rubro) });
    if (U(ficha.marca)) desconocidos.push({ campo: "marca", valor: U(ficha.marca) });
    if (!U(ficha.rubro) && !U(ficha.marca)) {
      desconocidos.push({ campo: "rubro", valor: "(vacío)" });
    }
  }

  const gen = generoReebok(ficha.subrubro, nombre);
  if (gen === null) {
    desconocidos.push({ campo: "subrubro", valor: U(ficha.subrubro) || "(vacío)" });
  }

  // `||` y no `??`: una columna en `""` es tan "sin clasificar" como un `null`,
  // y conservar un `""` dejaría el producto fuera de «Todos» sin decir por qué.
  return {
    category: cat ?? (guardado.category || CATEGORIA_SIN_CLASIFICAR),
    gender: gen ?? (guardado.gender || GENERO_SIN_CLASIFICAR),
    desconocidos,
  };
}
