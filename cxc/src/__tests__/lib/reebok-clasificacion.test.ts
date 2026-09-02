// ─────────────────────────────────────────────────────────────────────────────
// CANDADO — la clasificación del catálogo Reebok sale de Switch, no se inventa.
//
// 🩸 EL BUG QUE ESTE ARCHIVO VIGILA NO ESCRIBÍA NINGÚN VALOR RARO. El sync
// ponía `category = "footwear"` y dejaba que el DEFAULT de la columna pusiera
// `gender = "male"`: dos valores perfectamente VÁLIDOS, mintiendo en el 100% de
// las altas (173 de 173 desde el 24-jun-2026, medido contra producción). Un
// centinela que busca valores desconocidos no caza una mentira bien formada.
//
// Por eso los tests de acá miran DOS cosas distintas:
//   · que el mapa traduzca lo que Switch dice (lo fácil), y
//   · que lo que Switch NO dice caiga en un cajón NEUTRO — que no es una
//     categoría ni un género del negocio— y que ese cajón nunca pise una
//     clasificación que ya existía. Eso último es plata: el bulto sale de la
//     categoría.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  categoriaReebok,
  generoReebok,
  clasificacionDeArticulo,
  fichaLlego,
  CATEGORIA_SIN_CLASIFICAR,
  GENERO_SIN_CLASIFICAR,
} from "@/lib/reebok-clasificacion";
import { getBultoSize } from "@/lib/reebok-bulto";

/** Cuándo se le pidió la ficha a Switch. Fecha FIJA — en este repo un test no
 *  usa `new Date()`. Lo único que importa es que NO sea null: eso es lo que
 *  significa «la ficha llegó». */
const FICHA_AT = "2026-09-02T04:50:00.000Z";

// ─────────────────────────────────────────────────────────────────────────────
// 1. CATEGORÍA — el vocabulario REAL de Switch para active_shoes
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 categoriaReebok — LA MARCA MANDA; el rubro es el plan B", () => {
  // Medido sobre los 609 artículos distintos de active_shoes en
  // switch_factura_lineas: FOOTWEAR↔SHOES 456/456, APPAREL↔APPAREL 10/10,
  // HARDWARE↔BAGS 1/1, CERO contradicciones. El rubro tiene 35 valores, casi
  // todos basura vieja.
  it("marca FOOTWEAR / APPAREL / HARDWARE resuelve sola", () => {
    expect(categoriaReebok(null, "FOOTWEAR")).toBe("footwear");
    expect(categoriaReebok(null, "APPAREL")).toBe("apparel");
    expect(categoriaReebok(null, "HARDWARE")).toBe("accessories");
    expect(categoriaReebok("", " footwear ")).toBe("footwear");
  });

  it("🔴 y GANA cuando los dos dicen algo DISTINTO — que es lo que define «primaria»", () => {
    // 💸 Hoy no hay una sola contradicción real (456/456, 10/10, 1/1), así que
    // este test no describe un dato: describe qué pasa EL DÍA que la haya. Y
    // pasa algo caro, porque de la categoría sale el bulto: si ganara el rubro,
    // una zapatilla con el rubro mal cargado se cobraría de 6 en vez de 12.
    expect(categoriaReebok("BAGS", "FOOTWEAR")).toBe("footwear");
    expect(categoriaReebok("SHOES", "APPAREL")).toBe("apparel");
    expect(categoriaReebok("APPAREL", "HARDWARE")).toBe("accessories");
    expect(categoriaReebok("SOCKS", "FOOTWEAR")).toBe("footwear");
  });

  it("🔴 y GANA sobre el rubro: un rubro basura no la puede tumbar", () => {
    // Éste es el caso que motivó el cambio: 274 renglones reales traen
    // rubro="REEBOK CLASSICS CORE FTW MEN" con marca=FOOTWEAR.
    expect(categoriaReebok("REEBOK CLASSICS CORE FTW MEN", "FOOTWEAR")).toBe("footwear");
    expect(categoriaReebok("PROMO", "APPAREL")).toBe("apparel");
    expect(categoriaReebok("OFERTA", "FOOTWEAR")).toBe("footwear");
    expect(categoriaReebok("GENERAL", "HARDWARE")).toBe("accessories");
  });

  it("el RUBRO solo se consulta si la marca vino vacía", () => {
    expect(categoriaReebok("SHOES", null)).toBe("footwear");
    expect(categoriaReebok("APPAREL", "")).toBe("apparel");
    expect(categoriaReebok("BAGS", null)).toBe("accessories");
    expect(categoriaReebok("  Shoes  ", null)).toBe("footwear");
  });

  it("⚠️ SHORTS y SOCKS son valores NUEVOS: el mapa los acepta aunque no estén en los datos de hoy", () => {
    // No aparecen ni una vez en el histórico de renglones de factura. El
    // candado los prueba con literales para no depender de que existan.
    expect(categoriaReebok("SHORTS", null)).toBe("apparel");
    expect(categoriaReebok("SOCKS", null)).toBe("apparel");
  });

  it("🔴 MEDIAS = ROPA. Decisión de Daniel: «es apparel, o sea ropa, ¿por qué sería accesorio?»", () => {
    // Los 7 ACCS0xx reales: Switch los manda marca=APPAREL, así que ya caen
    // bien por el camino primario; y por rubro SOCKS también.
    expect(categoriaReebok("SOCKS", "APPAREL")).toBe("apparel");
    expect(categoriaReebok("SOCKS", null)).toBe("apparel");
    expect(categoriaReebok("SOCKS", "APPAREL")).not.toBe("accessories");
  });

  it("lo que el mapa no conoce devuelve null — NO 'otros', que es otra cosa", () => {
    // null = "no sé". Es lo que le permite a quien llama conservar lo guardado.
    expect(categoriaReebok("PROMO", "GENERAL")).toBeNull();
    expect(categoriaReebok("OFERTA", "CK DISPLAY & PROMO")).toBeNull();
    expect(categoriaReebok("DISPLAY & PROMO", "AT CRAZE 3")).toBeNull();
    expect(categoriaReebok(null, null)).toBeNull();
    expect(categoriaReebok("", "")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. GÉNERO — y la regla que dice qué NO se puede hacer
// ─────────────────────────────────────────────────────────────────────────────

describe("generoReebok — el subrubro de Switch, y nada más", () => {
  it("MALE / MEN → male · FEMALE / WOMEN → female · KIDS → kids", () => {
    expect(generoReebok("MALE")).toBe("male");
    expect(generoReebok("MEN")).toBe("male");
    expect(generoReebok("FEMALE")).toBe("female");
    expect(generoReebok("WOMEN")).toBe("female");
    expect(generoReebok("KIDS")).toBe("kids");
    expect(generoReebok(" female ")).toBe("female");
  });

  it("🔴 UNISEX sin nada en el nombre → Hombre. Daniel: «yo compro lo que me venden como unisex, o sea hombre»", () => {
    expect(generoReebok("UNISEX")).toBe("male");
    expect(generoReebok("unisex", "BIG LOGO TEE")).toBe("male");
    expect(generoReebok("UNISEX", "ID TRAIN SS TECH TEE")).toBe("male");
  });

  it("los subrubros VIEJOS sin género NO se mapean: son historia y no tienen existencia", () => {
    // RUNNING/TENNIS/TRAINING/BASKETBALL: último uso mayo-2024. Inventarles un
    // género sería adivinar; caen en el cajón neutro y avisan como cualquier
    // valor desconocido.
    for (const v of ["RUNNING", "TENNIS", "TRAINING", "BASKETBALL", "WALKING", "SWIM", "CASUAL"]) {
      expect(generoReebok(v)).toBeNull();
    }
  });

  it("vacío y desconocido → null", () => {
    expect(generoReebok(null)).toBeNull();
    expect(generoReebok("")).toBeNull();
    expect(generoReebok("GENERAL")).toBeNull();
    expect(generoReebok("DISPLAY & PROMO")).toBeNull();
  });
});

describe("🔴 EL NOMBRE **SOLO** DESEMPATA EL UNISEX", () => {
  // Daniel: «las camisetas WOMEN LOGO TEE deben de ir a mujer; debe de Switch
  // decir women o unisex, si es unisex, que lea el nombre».
  //
  // La línea que separa DESEMPATAR de ADIVINAR: el nombre entra en UNA rama, la
  // del empate, y en ninguna otra.

  it("los 8 WOMEN LOGO TEE reales (UNISEX en Switch) salen MUJER", () => {
    // APPCL071/072/074/075/077/084/085/097 — 1.239 piezas.
    for (const n of ["WOMEN BIG LOGO TEE", "WOMEN SMALL LOGO TEE"]) {
      expect(generoReebok("UNISEX", n), n).toBe("female");
    }
  });

  it("una W SOLA también dice mujer: FOUND W 3P INVISBLE SOCK", () => {
    expect(generoReebok("UNISEX", "FOUND W 3P INVISBLE SOCK")).toBe("female");
  });

  it("🩸 …pero la W de LOW NO. Es palabra completa o no es nada.", () => {
    // Un `includes("W")` o un "¿termina en W?" manda estas dos zapatillas de
    // hombre a la sección de mujer. Están acá con nombre y apellido porque son
    // los dos casos REALES que la trampa agarraba.
    expect(generoReebok("UNISEX", "REEBOK TERRAIN EDGE LOW")).toBe("male");
    expect(generoReebok("UNISEX", "REEBOK BASE TRAIL LOW")).toBe("male");
    // Y la familia entera de falsos amigos, por si mañana aparece otra.
    for (const n of ["CLUB C LOW", "NANO SHOW", "WORKOUT PLUS", "ZIG DYNAMICA 6"]) {
      expect(generoReebok("UNISEX", n), n).toBe("male");
    }
  });

  it("🔴 un FEMALE explícito de Switch NO lo puede contradecir el nombre", () => {
    expect(generoReebok("FEMALE", "REEBOK TERRAIN EDGE LOW")).toBe("female");
    expect(generoReebok("WOMEN", "BIG LOGO TEE")).toBe("female");
  });

  it("🔴 un MALE explícito de Switch TAMPOCO — ni con WOMEN en el nombre", () => {
    expect(generoReebok("MALE", "WOMEN BIG LOGO TEE")).toBe("male");
    expect(generoReebok("MEN", "FOUND W 3P INVISBLE SOCK")).toBe("male");
    const c = clasificacionDeArticulo(
      { rubro: "SHOES", subrubro: "MALE", marca: "FOOTWEAR", ficha_at: FICHA_AT },
      "WOMEN BIG LOGO TEE",
      { category: "footwear", gender: "women" },
    );
    expect(c.gender).toBe("male");
  });

  it("🔴 un KIDS explícito tampoco se desempata", () => {
    expect(generoReebok("KIDS", "WOMEN BIG LOGO TEE")).toBe("kids");
  });

  it("🔴 y un subrubro DESCONOCIDO no se salva leyendo el nombre: sigue siendo null", () => {
    // Si el nombre pudiera rescatar cualquier subrubro, el cajón neutro dejaría
    // de existir y volveríamos a adivinar.
    expect(generoReebok("RUNNING", "WOMEN BIG LOGO TEE")).toBeNull();
    expect(generoReebok("PROMO", "FOUND W 3P INVISBLE SOCK")).toBeNull();
    expect(generoReebok(null, "WOMEN BIG LOGO TEE")).toBeNull();
  });

  it("el desempate llega hasta la clasificación completa, con la ficha real de los APPCL0xx", () => {
    const c = clasificacionDeArticulo(
      { rubro: "APPAREL", subrubro: "UNISEX", marca: "APPAREL", ficha_at: FICHA_AT },
      "WOMEN BIG LOGO TEE",
      { category: "apparel", gender: "unisex" },
    );
    expect(c).toMatchObject({ category: "apparel", gender: "female", desconocidos: [] });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. EL CAJÓN NEUTRO, y la regla que protege la plata
// ─────────────────────────────────────────────────────────────────────────────

describe("clasificacionDeArticulo — el cajón neutro", () => {
  it("un producto NUEVO sin ficha entra al cajón neutro, no a footwear/male", () => {
    const c = clasificacionDeArticulo(null, null, {});
    expect(c.category).toBe(CATEGORIA_SIN_CLASIFICAR);
    expect(c.gender).toBe(GENERO_SIN_CLASIFICAR);
    // 🔴 Lo que este candado de verdad prohíbe: los dos valores del bug.
    expect(c.category).not.toBe("footwear");
    expect(c.gender).not.toBe("male");
  });

  it("sin ficha NO se avisa: «todavía no le pedí la ficha» ≠ «Switch mandó algo raro»", () => {
    expect(clasificacionDeArticulo(null, null, {}).desconocidos).toEqual([]);
  });

  it("una ficha con valores desconocidos SÍ avisa, y nombra los tres campos que se miraron", () => {
    const c = clasificacionDeArticulo({ rubro: "PROMO", subrubro: "GENERAL", marca: "GENERAL", ficha_at: FICHA_AT }, null, {});
    expect(c.category).toBe(CATEGORIA_SIN_CLASIFICAR);
    expect(c.gender).toBe(GENERO_SIN_CLASIFICAR);
    expect(c.desconocidos).toEqual([
      { campo: "rubro", valor: "PROMO" },
      { campo: "marca", valor: "GENERAL" },
      { campo: "subrubro", valor: "GENERAL" },
    ]);
  });

  it("una ficha TRAÍDA y vacía sí avisa: preguntamos y Switch contestó «nada»", () => {
    // 🔑 Este test NO cambió de dirección con el arreglo de la falsa alarma, y
    // por eso queda tal cual: lo que cambió es que ahora la ficha DICE cuándo
    // llegó. Con `ficha_at` puesto, un campo vacío es un dato REAL sobre lo que
    // hay cargado en Switch —el caso de la columna renombrada del Depurador— y
    // pasa la regla 2 completa: es real, no se arregla solo (ningún cron llena
    // un campo que Switch no tiene) y hay algo concreto que hacer.
    const c = clasificacionDeArticulo({ rubro: null, subrubro: null, marca: null, ficha_at: FICHA_AT }, null, {});
    expect(c.desconocidos).toContainEqual({ campo: "rubro", valor: "(vacío)" });
    expect(c.desconocidos).toContainEqual({ campo: "subrubro", valor: "(vacío)" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3b. 🩸 LA FALSA ALARMA DE LAS 233 — 2-sep-2026, 2:52 PM
// ─────────────────────────────────────────────────────────────────────────────
//
// El aviso que salió a Telegram, textual:
//
//     🔧 SISTEMA · El catálogo de Reebok recibió una clasificación que no
//     conoce — Active Shoes
//     · rubro "(vacío)" — 233 producto(s) …
//     · subrubro "(vacío)" — 233 producto(s) …
//     Qué hacer: revisar esos artículos en Switch y ponerles el rubro y el
//     subrubro que les corresponde.
//
// Era mentira. La migración acababa de crear las columnas y estaban en NULL
// porque el cron de fichas todavía no había corrido: mandaba a Daniel a Switch a
// arreglar 233 artículos que no tenían nada malo y que se arreglaron solos con
// la primera corrida. De la regla 2 de SISTEMA —«es real · no se arregla solo ·
// alguien tiene que hacer algo»— **fallaba las tres**.
//
// 🔑 La distinción, y es la única que hay que sostener:
//     ficha_at = null  →  "todavía no pregunté"   →  CALLA
//     ficha_at puesto  →  "pregunté y esto vino"  →  habla
// ─────────────────────────────────────────────────────────────────────────────

describe("🩸🔴 un artículo SIN ficha nunca puede disparar el aviso", () => {
  /** La fila tal como la deja el barrido de PRECIOS: existe, y los tres campos
   *  de la ficha están en NULL porque nadie se la pidió a Switch todavía. */
  const FILA_SIN_FICHA = { rubro: null, subrubro: null, marca: null, ficha_at: null };

  it("🔴 los 233: fila con los tres campos en NULL y sin ficha_at ⇒ CERO desconocidos", () => {
    expect(clasificacionDeArticulo(FILA_SIN_FICHA, null, {}).desconocidos).toEqual([]);
  });

  it("🔴 tampoco avisa si el producto YA estaba clasificado (era el 100% de los 233)", () => {
    const c = clasificacionDeArticulo(FILA_SIN_FICHA, "ZIG DYNAMICA 6", {
      category: "footwear", gender: "male",
    });
    expect(c.desconocidos).toEqual([]);
    // …y conserva lo suyo: no preguntar no puede degradar a nadie.
    expect(c.category).toBe("footwear");
    expect(c.gender).toBe("male");
  });

  it('un ficha_at en blanco o con espacios cuenta como "todavía no llegó"', () => {
    for (const vacio of ["", "   "]) {
      expect(fichaLlego({ ...FILA_SIN_FICHA, ficha_at: vacio })).toBe(false);
      expect(clasificacionDeArticulo({ ...FILA_SIN_FICHA, ficha_at: vacio }, null, {}).desconocidos).toEqual([]);
    }
  });

  it("un producto nuevo sin ficha entra al cajón neutro Y EN SILENCIO", () => {
    const c = clasificacionDeArticulo(FILA_SIN_FICHA, "ALGO NUEVO", {});
    expect(c.category).toBe(CATEGORIA_SIN_CLASIFICAR);
    expect(c.gender).toBe(GENERO_SIN_CLASIFICAR);
    expect(c.desconocidos).toEqual([]);
  });

  it("🔴 sin ficha tampoco CLASIFICA: los valores viejos de la fila no se miran", () => {
    // El contrafáctico del bug: si `ficha_at` se ignorara, estos valores —que
    // pueden ser de cualquier época— entrarían como si Switch los acabara de
    // mandar. No se pregunta, no se decide.
    const c = clasificacionDeArticulo(
      { rubro: "SHOES", subrubro: "FEMALE", marca: "FOOTWEAR", ficha_at: null },
      null,
      { category: "apparel", gender: "male" },
    );
    expect(c.category).toBe("apparel");
    expect(c.gender).toBe("male");
    expect(c.desconocidos).toEqual([]);
  });

  it("🔑 y la MISMA fila, una vez traída, sí habla — es toda la diferencia", () => {
    const traida = clasificacionDeArticulo({ ...FILA_SIN_FICHA, ficha_at: FICHA_AT }, null, {});
    expect(traida.desconocidos).toContainEqual({ campo: "rubro", valor: "(vacío)" });
    expect(traida.desconocidos).toContainEqual({ campo: "subrubro", valor: "(vacío)" });
  });

  it("fichaLlego separa las dos cosas, y nada más", () => {
    expect(fichaLlego(null)).toBe(false);
    expect(fichaLlego(undefined)).toBe(false);
    expect(fichaLlego(FILA_SIN_FICHA)).toBe(false);
    expect(fichaLlego({ ...FILA_SIN_FICHA, ficha_at: FICHA_AT })).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3c. HEADWEAR — las gorras, con las fichas REALES del 2-sep-2026
// ─────────────────────────────────────────────────────────────────────────────

describe("HEADWEAR: las gorras van a accesorios", () => {
  it("🔴 y ya lo resolvía la MARCA: los 7 con existencia traen marca=HARDWARE", () => {
    // Medido sobre las 400 fichas reales: rubro HEADWEAR = 7 artículos con
    // existencia, y los 7 con marca HARDWARE. O sea que el camino primario
    // —«manda la marca»— los manda a accesorios sin consultar el mapa de rubros.
    expect(categoriaReebok("HEADWEAR", "HARDWARE")).toBe("accessories");
    for (const sku of ["ACCC002", "ACCC006", "ACCC062", "ACCC113", "ACCC118", "ACCC121", "H36572"]) {
      const c = clasificacionDeArticulo(
        { rubro: "HEADWEAR", subrubro: "UNISEX", marca: "HARDWARE", ficha_at: FICHA_AT },
        sku,
        {},
      );
      expect(c.category, sku).toBe("accessories");
      expect(c.desconocidos, sku).toEqual([]);
    }
  });

  it("y el plan B lo cubre el día que la marca venga vacía", () => {
    expect(categoriaReebok("HEADWEAR", null)).toBe("accessories");
    expect(categoriaReebok("HEADWEAR", "")).toBe("accessories");
  });

  it("💸 una gorra es bulto 6, no 12 — no es calzado", () => {
    const c = clasificacionDeArticulo(
      { rubro: "HEADWEAR", subrubro: "UNISEX", marca: "HARDWARE", ficha_at: FICHA_AT }, "CAP", {},
    );
    expect(getBultoSize(c.category)).toBe(6);
  });
});

describe("💸 UN «NO SÉ» NUNCA PISA UNA CLASIFICACIÓN QUE YA EXISTE", () => {
  it("una zapatilla clasificada conserva footwear aunque Switch estrene un rubro", () => {
    const c = clasificacionDeArticulo(
      { rubro: "RUBRO QUE NADIE VIO NUNCA", subrubro: "MALE", marca: "MARCA NUEVA", ficha_at: FICHA_AT },
      null,
      { category: "footwear", gender: "male" },
    );
    expect(c.category).toBe("footwear");
    // Y avisa igual: conservar no es callar.
    expect(c.desconocidos.length).toBeGreaterThan(0);
  });

  it("🔴 y por eso el BULTO no se mueve — que es exactamente la plata en juego", () => {
    // Si el cajón neutro pisara la categoría, 288 zapatillas pasarían de bulto
    // 12 a bulto 6 y el sistema cobraría LA MITAD de lo que vende.
    const antes = getBultoSize("footwear");
    const c = clasificacionDeArticulo(
      { rubro: "ALGO NUEVO", subrubro: "ALGO NUEVO", marca: "ALGO NUEVO", ficha_at: FICHA_AT },
      null,
      { category: "footwear", gender: "male" },
    );
    expect(getBultoSize(c.category)).toBe(antes);
    expect(getBultoSize(c.category)).toBe(12);
  });

  it("el género conocido tampoco se pierde ante un subrubro nuevo", () => {
    const c = clasificacionDeArticulo(
      { rubro: "SHOES", subrubro: "SUBRUBRO NUEVO", marca: "FOOTWEAR", ficha_at: FICHA_AT },
      null,
      { category: "footwear", gender: "female" },
    );
    expect(c.gender).toBe("female");
  });

  it('una columna guardada en "" cuenta como sin clasificar, no como dato', () => {
    const c = clasificacionDeArticulo(
      { rubro: "NUEVO", subrubro: "NUEVO", marca: "NUEVO", ficha_at: FICHA_AT },
      null,
      { category: "", gender: "" },
    );
    expect(c.category).toBe(CATEGORIA_SIN_CLASIFICAR);
    expect(c.gender).toBe(GENERO_SIN_CLASIFICAR);
  });

  it("pero lo que Switch SÍ dice sí pisa lo guardado: la clasificación la manda Switch", () => {
    // Los 7 ACCS0xx: estaban en accessories y Switch dice SOCKS ⇒ apparel.
    const c = clasificacionDeArticulo(
      { rubro: "SOCKS", subrubro: "UNISEX", marca: "APPAREL", ficha_at: FICHA_AT },
      "ACT CORE ANKLE SOCK 3P",
      { category: "accessories", gender: "unisex" },
    );
    expect(c.category).toBe("apparel");
    expect(c.gender).toBe("male");
  });
});
