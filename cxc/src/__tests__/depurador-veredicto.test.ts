import { describe, it, expect } from "vitest";
import {
  normalizarEspacios,
  veredictoDescripcion,
  esCasiIgual,
} from "../lib/depurador/veredicto";
import type { CatalogoDescripciones } from "../lib/depurador/logic";

// Recorte real del catálogo de producción (tabla depurador_descripciones), con
// las marcas y descripciones tal cual están hoy.
const CAT: CatalogoDescripciones = {
  "CK Jeans": [
    "Men-Denim Pants",
    "Men-Pant Non-Denim",
    "Men-Polos S/S",
    "Men-Shirts Woven L/S",
    "Men-T-Shirts L/S",
    "Men-T-Shirts S/S",
    "Women-Dresses",
    "Women-Shorts Denim",
    "Women-T-Shirts S/S",
  ],
  "CK Performance": ["Women-Short Knit", "Women-Tights"],
  "CK Underwear": ["Men-T-Shirts", "Men-Trunk", "Women-Bras", "Women-Panties"],
  "TH Kids": [
    "Boys-Polos S/S",
    "Boys-Polos S/S Core",
    "Boys-T-Shirts S/S",
    "Girls-Dresses",
    "Girls-T-Shirts S/S",
    "Newborn-Baby 1-Piece",
    "Newborn-T-Shirts S/S",
    "Toddler Boys-T-Shirts S/S",
  ],
  "TH Accessories": ["Men-Small Leather", "Women-Bags"],
};

const v = (d: string) => veredictoDescripcion(d, CAT);

describe("normalizarEspacios — el candado del espacio", () => {
  it("colapsa espacios dobles a uno", () => {
    expect(normalizarEspacios("Men-Shirts  L/S")).toBe("Men-Shirts L/S");
    expect(normalizarEspacios("Men-Shirts    Woven   L/S")).toBe("Men-Shirts Woven L/S");
  });

  it("recorta espacios al principio y al final", () => {
    expect(normalizarEspacios("  Women-Bags  ")).toBe("Women-Bags");
    expect(normalizarEspacios("\tWomen-Bags\n")).toBe("Women-Bags");
  });

  it("convierte tabs, saltos de línea y NBSP en un solo espacio", () => {
    expect(normalizarEspacios("Men-T-Shirts\tS/S")).toBe("Men-T-Shirts S/S");
    expect(normalizarEspacios("Men-T-Shirts S/S")).toBe("Men-T-Shirts S/S");
    expect(normalizarEspacios("Men-T-Shirts\n S/S")).toBe("Men-T-Shirts S/S");
  });

  it("NO toca la caja ni los guiones internos", () => {
    expect(normalizarEspacios("men-t-SHIRTS S/S")).toBe("men-t-SHIRTS S/S");
    expect(normalizarEspacios("Men-Pant Non-Denim")).toBe("Men-Pant Non-Denim");
  });

  it("nulos y vacíos dan cadena vacía", () => {
    expect(normalizarEspacios(null)).toBe("");
    expect(normalizarEspacios(undefined)).toBe("");
    expect(normalizarEspacios("   ")).toBe("");
  });
});

describe("veredicto — ya-existe (misma descripción, otros espacios o mayúsculas)", () => {
  it("idéntica", () => {
    const r = v("Men-T-Shirts S/S");
    expect(r.veredicto).toBe("ya-existe");
    expect(r.existente).toBe("Men-T-Shirts S/S");
  });

  it("solo cambia la caja → se usa la que ya existe, no se crea gemela", () => {
    expect(v("MEN-T-SHIRTS S/S").veredicto).toBe("ya-existe");
    expect(v("men-t-shirts s/s").existente).toBe("Men-T-Shirts S/S");
  });

  it("solo cambia el espacio (doble, al borde, alrededor del guion)", () => {
    expect(v("Men-T-Shirts  S/S").veredicto).toBe("ya-existe");
    expect(v("  Men-T-Shirts S/S  ").veredicto).toBe("ya-existe");
    expect(v("Men -T-Shirts S/S").veredicto).toBe("ya-existe");
    expect(v("Men - T-Shirts S/S").existente).toBe("Men-T-Shirts S/S");
  });

  it("existe bajo OTRA marca → igual es ya-existe (el catálogo es uno solo)", () => {
    // "Women-Bags" está bajo TH Accessories; llega bajo cualquier otra marca.
    expect(v("Women-Bags").veredicto).toBe("ya-existe");
  });

  it("una del catálogo nunca alerta contra sí misma", () => {
    for (const lista of Object.values(CAT)) {
      for (const d of lista) expect(v(d).veredicto).toBe("ya-existe");
    }
  });
});

describe("veredicto — pasa (las dos mitades exactas, en cualquier marca)", () => {
  it("el caso de Daniel: Girls-Short Knit", () => {
    // "Girls" existe (TH Kids) y "Short Knit" existe (CK Performance).
    expect(v("Girls-Short Knit").veredicto).toBe("pasa");
  });

  it("combinación rara pero con las dos mitades exactas: Boys-Dresses", () => {
    // «no me da miedo, ya que la marca nunca mandaria eso» → pasa, no alerta.
    expect(v("Boys-Dresses").veredicto).toBe("pasa");
  });

  it("respeta el guion interno de la mitad derecha (T-Shirts S/S, Pant Non-Denim)", () => {
    expect(v("Women-T-Shirts L/S").veredicto).toBe("pasa");
    expect(v("Boys-Pant Non-Denim").veredicto).toBe("pasa");
    expect(v("Newborn-Pant Non-Denim").veredicto).toBe("pasa");
  });

  it("mitad izquierda de dos palabras: Toddler Boys-Dresses", () => {
    expect(v("Toddler Boys-Dresses").veredicto).toBe("pasa");
  });

  it("las mitades exactas ganan aunque el conjunto se parezca a otra", () => {
    // "Newborn-T-Shirts L/S" está a 1 letra de "Newborn-T-Shirts S/S", pero las
    // dos mitades son exactas → pasa. Es la decisión de Daniel, a propósito.
    expect(v("Newborn-T-Shirts L/S").veredicto).toBe("pasa");
  });

  it("pasa con espacios sucios: se normaliza antes de comparar", () => {
    expect(v("  Girls-Short   Knit ").veredicto).toBe("pasa");
    expect(v("  Girls-Short   Knit ").normalizada).toBe("Girls-Short Knit");
  });
});

describe("veredicto — alerta por casi-gemela (lo que le da miedo a Daniel)", () => {
  it("tshirts vs tshirt: singular/plural en la mitad derecha", () => {
    const r = v("Boys-T-Shirt");
    expect(r.veredicto).toBe("alerta");
    expect(r.motivo).toBe("casi-igual-mitad");
    expect(r.gemela).toBe("Boys-T-Shirts");
  });

  it("Men-T-Shirt vs Men-T-Shirts (la completa, no la mitad)", () => {
    const r = v("Men-T-Shirt");
    expect(r.veredicto).toBe("alerta");
    expect(r.gemela).toBe("Men-T-Shirts");
  });

  it("Boy vs Boys: una s de menos en la mitad izquierda", () => {
    // La "s" está a mitad de la descripción completa, así que la gemela la
    // encuentra la comparación de MITADES ("Boy" vs "Boys").
    const r = v("Boy-T-Shirts S/S");
    expect(r.veredicto).toBe("alerta");
    expect(r.motivo).toBe("casi-igual-mitad");
    expect(r.gemela).toBe("Boys-T-Shirts S/S");
  });

  it("Shorts Knit vs Short Knit: una s de más", () => {
    const r = v("Women-Shorts Knit");
    expect(r.veredicto).toBe("alerta");
    expect(r.gemela).toBe("Women-Short Knit");
  });

  it("Mens vs Men: la mitad izquierda con una s de más", () => {
    const r = v("Mens-T-Shirts S/S");
    expect(r.veredicto).toBe("alerta");
    expect(r.gemela).toBe("Men-T-Shirts S/S");
  });

  it("la alerta trae SIEMPRE la gemela para mostrarla al lado", () => {
    for (const d of ["Boys-T-Shirt", "Mens-T-Shirts S/S", "Women-Shorts Knit"]) {
      expect(v(d).gemela).toBeTruthy();
    }
  });
});

describe("veredicto — alerta por mitad nueva y por formato", () => {
  it("mitad derecha que no existe ni se parece", () => {
    const r = v("Men-Watches");
    expect(r.veredicto).toBe("alerta");
    expect(r.motivo).toBe("mitad-nueva");
    expect(r.texto).toContain("Watches");
  });

  it("mitad izquierda que no existe ni se parece", () => {
    const r = v("Unisex-Bras");
    expect(r.veredicto).toBe("alerta");
    expect(r.motivo).toBe("mitad-nueva");
    expect(r.texto).toContain("Unisex");
  });

  it("las dos mitades nuevas", () => {
    const r = v("Perros-Collares");
    expect(r.veredicto).toBe("alerta");
    expect(r.texto).toContain("mitades nuevas");
  });

  it("sin guion", () => {
    const r = v("MODAL COTTON TRUNK");
    expect(r.veredicto).toBe("alerta");
    expect(r.motivo).toBe("formato");
    expect(r.texto).toBe("sin guion");
  });

  it("guion al borde", () => {
    expect(v("-Women-Bags").texto).toBe("guion al borde");
    expect(v("Women-").texto).toBe("guion al borde");
  });

  it("vacía", () => {
    expect(v("").veredicto).toBe("alerta");
    expect(v("   ").texto).toBe("descripción vacía");
  });
});

describe("esCasiIgual — un solo criterio: la «s» final", () => {
  it("difiere solo por una s final, en cualquier palabra y sin piso de largo", () => {
    expect(esCasiIgual("t-shirt", "t-shirts")).toBe(true);
    expect(esCasiIgual("boy", "boys")).toBe(true);
    expect(esCasiIgual("men", "mens")).toBe(true);
    expect(esCasiIgual("short knit", "shorts knit")).toBe(true);
    expect(esCasiIgual("denim pants", "denim pant")).toBe(true);
  });

  it("iguales no son casi-iguales", () => {
    expect(esCasiIgual("women-bags", "women-bags")).toBe(false);
  });

  it("una letra cambiada DENTRO de una palabra ya NO es casi-gemela", () => {
    // Levenshtein ≤2 se sacó: emparejaba prendas distintas, no typos.
    expect(esCasiIgual("men-trunk", "men-trank")).toBe(false);
    expect(esCasiIgual("shirts", "skirts")).toBe(false);
  });

  it("prendas legítimamente distintas NO se emparejan (el ruido que se sacó)", () => {
    expect(esCasiIgual("men-shirts", "men-t-shirts")).toBe(false);   // camisa ≠ camiseta
    expect(esCasiIgual("polos l/s", "polos s/s")).toBe(false);        // manga larga ≠ corta
    expect(esCasiIgual("shirts l/s", "shirts woven l/s")).toBe(false);
  });

  it("mitades cortas y sin relación tampoco", () => {
    expect(esCasiIgual("bras", "bags")).toBe(false);
    expect(esCasiIgual("hats", "bags")).toBe(false);
    expect(esCasiIgual("men", "kids")).toBe(false);
  });

  it("lejanas no son casi-iguales", () => {
    expect(esCasiIgual("women-panties", "men-denim pants")).toBe(false);
  });
});

describe("prendas distintas: alertan, pero como MITAD NUEVA y nombrando la mitad", () => {
  it("Men-Shirts: la mitad que falta es «Shirts», no es un typo de T-Shirts", () => {
    const r = v("Men-Shirts");
    expect(r.veredicto).toBe("alerta");
    expect(r.motivo).toBe("mitad-nueva");
    expect(r.texto).toBe("mitad nueva: «Shirts»");
    expect(r.gemela).toBeUndefined();
  });

  it("Men-Polos L/S: manga larga es otra prenda, no un typo de S/S", () => {
    const r = v("Men-Polos L/S");
    expect(r.veredicto).toBe("alerta");
    expect(r.motivo).toBe("mitad-nueva");
    expect(r.texto).toBe("mitad nueva: «Polos L/S»");
  });

  it("Men-Trank: una letra cambiada cae en mitad nueva, y la nombra", () => {
    const r = v("Men-Trank");
    expect(r.veredicto).toBe("alerta");
    expect(r.motivo).toBe("mitad-nueva");
    expect(r.texto).toBe("mitad nueva: «Trank»");
  });

  it("la etiqueta nombra SOLO la mitad desconocida, no las dos", () => {
    expect(v("Unisex-Bras").texto).toBe("mitad nueva: «Unisex»");
    expect(v("Men-Watches").texto).toBe("mitad nueva: «Watches»");
    expect(v("Perros-Collares").texto).toBe("mitades nuevas: «Perros» y «Collares»");
  });
});

describe("veredicto — la descripción que se guardaría siempre viene normalizada", () => {
  it("nunca sale con espacio doble ni con espacio al borde", () => {
    const casos = [
      "  Girls-Short   Knit ",
      "Men-T-Shirt\t\tS/S",
      "\nWomen-Bags",
      "Perros-  Collares  raros ",
    ];
    for (const c of casos) {
      const n = veredictoDescripcion(c, CAT).normalizada;
      expect(n).toBe(n.trim());
      expect(n).not.toMatch(/\s{2,}/);
      expect(n).not.toMatch(/[\t\n\r ]/);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Las 5 mitades derechas que Daniel aprobó el 25-ago-2026 (Shirts · Shirts L/S ·
// Shirts S/S · Polos L/S · Slippers). Entraron al catálogo como descripciones
// COMPLETAS en las marcas donde hay artículos de verdad (migración
// 20260826040000). Este bloque fija las dos mitades del trato:
//   1. lo que tenía que dejar de alertar, dejó de alertar;
//   2. lo que tenía que SEGUIR alertando —las 4 filas sucias de Reebok mal
//      clasificadas bajo CK Jeans— sigue alertando. Solo les cambió la etiqueta.
// ─────────────────────────────────────────────────────────────────────────────
const CAT_CON_MITADES: CatalogoDescripciones = {
  ...CAT,
  "CK Menswear": ["Men-Shirts", "Men-Polos L/S", "Men-Shirts Woven L/S"],
  "CK Kids": ["Boys-Shirts"],
  "CK Footwear": ["Men-Slippers"],
  "TH Womenswear": ["Women-Shirts L/S", "Women-Shirts S/S"],
  "TH Footwear": ["Men-Slippers", "Women-Slippers", "Boys-Slippers"],
  "TH Kids": [...CAT["TH Kids"], "Boys-Shirts L/S", "Girls-Shirts L/S", "Boys-Shirts S/S", "Boys-Polos L/S"],
};
const vm = (d: string) => veredictoDescripcion(d, CAT_CON_MITADES);

describe("las 5 mitades derechas aprobadas (25-ago-2026)", () => {
  it("antes de aprobarlas, la prenda pelada alertaba por mitad nueva", () => {
    expect(v("Men-Shirts").veredicto).toBe("alerta");
    expect(v("Men-Shirts").texto).toBe("mitad nueva: «Shirts»");
    expect(v("Boys-Polos L/S").texto).toBe("mitad nueva: «Polos L/S»");
    expect(v("Women-Slippers").texto).toBe("mitad nueva: «Slippers»");
  });

  it("con la mitad en el catálogo, la MISMA prenda en otra marca pasa sola", () => {
    // La mitad se conoce en cualquier marca (regla 1 de Daniel): alcanza con que
    // exista en una para que la hermana de otra marca no alarme.
    expect(vm("Girls-Shirts").veredicto).toBe("pasa");
    expect(vm("Women-Polos L/S").veredicto).toBe("pasa");
    expect(vm("Girls-Slippers").veredicto).toBe("pasa");
    expect(vm("Newborn-Shirts S/S").veredicto).toBe("pasa");
  });

  it("la casi-gemela sigue alertando: Shirt no se cuela por Shirts", () => {
    expect(vm("Men-Shirt").veredicto).toBe("alerta");
    // "Men-Shirt" es gemela de la descripción COMPLETA "Men-Shirts" → casi-igual.
    expect(vm("Men-Shirt").motivo).toBe("casi-igual");
    expect(vm("Men-Shirt").gemela).toBe("Men-Shirts");
    expect(vm("Men-Polo L/S").veredicto).toBe("alerta");
    expect(vm("Women-Slipper").veredicto).toBe("alerta");
  });

  it("las 4 filas sucias de Reebok bajo CK Jeans SIGUEN alertando (solo cambia la etiqueta)", () => {
    const sucias = [
      "REEBOK IDENTITY VECTOR T-SHIRT",
      "REEBOK LINEAR READ T-SHIRT",
      "TRAINING TECH T-SHIRT",
      "WORKOUT READY SPEEDWICK T-SHIRT",
    ];
    for (const d of sucias) {
      const antes = v(d);
      const despues = vm(d);
      expect(antes.veredicto).toBe("alerta");
      expect(despues.veredicto).toBe("alerta");
      expect(despues.motivo).toBe("casi-igual-mitad");
    }
    expect(vm("REEBOK IDENTITY VECTOR T-SHIRT").gemela).toBe("REEBOK IDENTITY VECTOR T-Shirts");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Segundo lote (26-ago-2026): las categorías que el negocio vende y el catálogo
// no conocía — Home · Towels · Kanine · Luggage · Watches · Boots · Pyjamas ·
// Woven Bottoms · Bikini Bottoms · Tops · los packs (2PK/3PK/5PK/6PK/7PK) — más
// la mitad IZQUIERDA "Toddler Girls", que era el espejo de "Toddler Boys".
//
// Se dieron de alta 23 descripciones completas (migración 20260826050000). Lo
// que queda alertando NO es un tercer hueco del mismo tipo: es dato sucio
// (descripciones sin género y Reebok mal clasificada bajo CK Jeans).
// ─────────────────────────────────────────────────────────────────────────────
const CAT_LOTE2: CatalogoDescripciones = {
  ...CAT_CON_MITADES,
  "TH Other": ["Unisex-Home", "Unisex-Towels", "Unisex-Kanine", "Unisex-Luggage", "Men-Watches"],
  "TH Accessories": [...CAT["TH Accessories"], "Unisex-Luggage", "Women-Watches", "Men-Watches"],
  "TH Kids": [...CAT["TH Kids"], "Toddler Girls-T-Shirts S/S", "Toddler Girls-Dresses"],
  "TH Underwear": ["Men-Underwear Bottoms 3PK", "Men-Underwear Bottoms 2PK", "Women-Panties 3PK", "Girls-Panties 7PK", "Men-Pyjamas"],
  "TH Legwear": ["Men-Socks Sport 6PK"],
  "TH Footwear": ["Boys-Boots"],
  "CK Swimwear": ["Men-Woven Bottoms", "Women-Bikini Bottoms", "Women-Tops"],
};
const v2 = (d: string) => veredictoDescripcion(d, CAT_LOTE2);

describe("segundo lote de categorías (26-ago-2026)", () => {
  it("«Toddler Girls» era una mitad IZQUIERDA nueva, no una derecha", () => {
    // El catálogo ya tenía "Toddler Boys-T-Shirts S/S": faltaba la nena.
    expect(v("Toddler Girls-T-Shirts S/S").texto).toBe("mitad nueva: «Toddler Girls»");
    expect(v2("Toddler Girls-T-Shirts S/S").veredicto).toBe("ya-existe");
    // Y con la izquierda conocida, la hermana con otra derecha pasa sola.
    expect(v2("Toddler Girls-Polos S/S").veredicto).toBe("pasa");
  });

  it("las categorías nuevas pasan en cualquier marca una vez catalogadas", () => {
    for (const d of ["Women-Home", "Men-Towels", "Women-Kanine", "Men-Luggage", "Boys-Watches", "Girls-Boots", "Women-Pyjamas"]) {
      expect(v2(d).veredicto).toBe("pasa");
    }
  });

  it("los packs no se comen la prenda suelta: 3PK y a secas son distintas", () => {
    // "Panties" y "Panties 3PK" no son gemelas (no difieren por una "s"), así
    // que la de 3 unidades no se cuela como si fuera la suelta.
    expect(esCasiIgual("panties", "panties 3pk")).toBe(false);
    expect(v2("Women-Panties 3PK").veredicto).toBe("ya-existe"); // está catalogada
    expect(v2("Boys-Panties 3PK").veredicto).toBe("pasa");        // la mitad ya se conoce
    expect(v2("Women-Panties").veredicto).toBe("ya-existe");
  });

  it("la casi-gemela del pack sigue alertando (3PK vs 3PKs no se cuela)", () => {
    expect(v2("Women-Panties 3PKs").veredicto).toBe("alerta");
    expect(v2("Men-Watch").veredicto).toBe("alerta");
    expect(v2("Boys-Boot").veredicto).toBe("alerta");
  });

  it("lo que sigue alertando es dato sucio, no una categoría nueva", () => {
    // Sin género adelante: el catálogo YA conoce Men-Bags, Men-Socks Sport,
    // Men-Polos S/S y Men-Denim Pants. Lo que llega pelado es basura de Switch.
    for (const d of ["Bags", "Socks Sport", "Polos S/S", "Denim Pants", "Cosmetiquera", "TE BOTTLE 750"]) {
      expect(v2(d).veredicto).toBe("alerta");
      expect(v2(d).motivo).toBe("formato");
    }
    // Reebok mal clasificada bajo CK Jeans: sigue alertando.
    expect(v2("REEBOK IDENTITY VECTOR T-SHIRT").veredicto).toBe("alerta");
  });
});
