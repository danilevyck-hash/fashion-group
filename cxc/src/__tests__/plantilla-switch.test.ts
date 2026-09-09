// ─────────────────────────────────────────────────────────────────────────────
// PLANTILLA SWITCH — el módulo que se llamaba «Depurador» (8-sep-2026).
//
// Seis decisiones de Daniel, un candado cada una:
//
//   1. El módulo se llama «Plantilla Switch» en pantalla. La `key` sigue siendo
//      `cargar` y la dirección `/productos/cargar` NO cambia (la key está en
//      `role_permissions` y en `fg_users.modulos_override`).
//   2. La tabla de talla de la pestaña «Reglas» sale del CÓDIGO. Estaba
//      TECLEADA A MANO y ya se había separado de la regla real.
//   3. El short de baño busca talla M, no 41. «SWIMSHO» vivía en la lista de
//      CALZADO desde el primer commit.
//   4. La secretaria puede QUITAR una descripción — ella la escribió.
//   5. Las 22 reglas de normalización se muestran solo donde HACEN FALTA (10) y
//      con lo que de verdad sale al Excel, no con el valor crudo del mapa.
//   6. Las dos mitades del veredicto solo valen DENTRO DE LA MISMA MARCA.
//
// Medido contra producción el 8-sep-2026: 281 descripciones activas en 26
// marcas; 7 marcas del catálogo (33) sin una sola descripción; 22 reglas de
// normalización, de las que 10 hacen falta.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CASOS_TALLA,
  CASO_TALLA_RESTO,
  TALLA_POR_DEFECTO,
  familiaDeTalla,
  tallasAProbar,
  normalizeDescripcion,
  reglasDeNormalizacionQueHacenFalta,
  processRows,
  MARCA_CATALOGO,
  type SheetRow,
} from "@/lib/depurador/logic";
import { NORMALIZACION } from "@/lib/depurador/marca-descripciones";
import { CASOS_TALLA_REEBOK, casoTallaReebok } from "@/lib/depurador/reebok";
import { veredictoDescripcion, MITADES_POR_MARCA } from "@/lib/depurador/veredicto";
import { ALL_MODULES } from "@/lib/modules";
import type { CatalogoDescripciones } from "@/lib/depurador/logic";

const RAIZ = join(__dirname, "..");
const leer = (rel: string) => readFileSync(join(RAIZ, rel), "utf8");

/* ═══ 1 · El módulo se llama «Plantilla Switch» ═══════════════════════════ */

describe("🔴 el módulo se llama «Plantilla Switch», y la key NO cambia", () => {
  const modulo = ALL_MODULES.find((m) => m.key === "cargar");

  it("el rótulo del home y del menú dice «Plantilla Switch»", () => {
    expect(modulo?.label).toBe("Plantilla Switch");
  });

  it("la key sigue siendo `cargar` y la dirección `/productos/cargar`", () => {
    // Están en role_permissions y en fg_users.modulos_override: renombrarlas
    // rompe permisos sin comprar nada.
    expect(modulo?.key).toBe("cargar");
    expect(modulo?.href).toBe("/productos/cargar");
  });

  it("ninguna pantalla del módulo dice «Depurador» donde se lee", () => {
    // Barrido sobre el texto VISIBLE: rótulo del encabezado, aria-labels,
    // encabezados y rótulos de pestaña. Los comentarios de código pueden
    // seguir diciendo Depurador (el archivo se llama DepuradorClient.tsx).
    const archivos = [
      "app/productos/cargar/page.tsx",
      "app/productos/cargar/DepuradorClient.tsx",
      "app/productos/cargar/ReglasView.tsx",
      "app/productos/cargar/CatalogoDescripcionesAdmin.tsx",
    ];
    for (const rel of archivos) {
      const sinComentarios = leer(rel)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^[ \t]*\/\/.*$/gm, "");
      const visible = [
        ...sinComentarios.matchAll(/aria-label="([^"]*)"/g),
        ...sinComentarios.matchAll(/module="([^"]*)"/g),
        ...sinComentarios.matchAll(/>([^<>{}\n]*Depurador[^<>{}\n]*)</g),
      ].map((m) => m[1]);
      for (const t of visible) {
        expect(t, `${rel}: «${t}» todavía dice Depurador`).not.toMatch(/Depurador/);
      }
    }
    expect(leer("lib/modules.ts")).not.toMatch(/label: "Depurador"/);
  });
});

/* ═══ 2 · La tabla de talla sale del CÓDIGO ═══════════════════════════════ */

describe("🔴 la tabla de talla de la pantalla se GENERA del código", () => {
  it("`ReglasView` dibuja CASOS_TALLA y CASOS_TALLA_REEBOK, no una lista propia", () => {
    const vista = leer("app/productos/cargar/ReglasView.tsx");
    expect(vista).toMatch(/CASOS_TALLA\b/);
    expect(vista).toMatch(/CASOS_TALLA_REEBOK\b/);
    expect(vista).toMatch(/CASO_TALLA_RESTO\b/);
    // Las tablas viejas, tecleadas a mano, no pueden volver.
    expect(vista).not.toMatch(/const REGLA_TALLA\b/);
    expect(vista).not.toMatch(/const REGLA_TALLA_REEBOK\b/);
  });

  it("cada caso de la tabla produce SU talla cuando se corre la regla", () => {
    // El candado de verdad: no que los textos coincidan, sino que la regla
    // devuelva lo que la tabla promete.
    const ejemplo: Record<string, { cat: string; gen: string }> = {
      kids: { cat: "Kids-T-Shirts", gen: "" },
      bano: { cat: "Men-Swimshorts", gen: "" },
      "calzado-hombre": { cat: "Men-Sneakers", gen: "" },
      "calzado-dama": { cat: "Women-Sneakers", gen: "" },
      "bottom-hombre": { cat: "Men-Shorts", gen: "" },
      "bottom-dama": { cat: "Women-Shorts", gen: "" },
    };
    for (const c of CASOS_TALLA) {
      const e = ejemplo[c.id];
      expect(e, `falta un ejemplo para el caso «${c.id}»`).toBeTruthy();
      expect(tallasAProbar(e.cat, e.gen)[0], `caso ${c.id}`).toBe(c.talla);
    }
  });

  it("el «resto» prueba la talla por defecto y siempre se cierra en ella", () => {
    expect(CASO_TALLA_RESTO.talla).toBe(TALLA_POR_DEFECTO);
    expect(tallasAProbar("Men-T-Shirts S/S", "")).toEqual([TALLA_POR_DEFECTO]);
    for (const cat of ["Men-Sneakers", "Women-Shorts", "Kids-T-Shirts", "Men-Swimshorts"]) {
      expect(tallasAProbar(cat, "").at(-1)).toBe(TALLA_POR_DEFECTO);
    }
  });

  it("Reebok: cada caso de la tabla es el que elige `casoTallaReebok`", () => {
    const ejemplo: Record<string, { department: string; ageGroup: string; gender: string }> = {
      "calzado-hombre": { department: "FOOTWEAR", ageGroup: "Adult", gender: "Male" },
      "calzado-dama": { department: "FOOTWEAR", ageGroup: "Adult", gender: "Female" },
      "calzado-kids": { department: "FOOTWEAR", ageGroup: "Kids", gender: "Male" },
      ropa: { department: "APPAREL", ageGroup: "Adult", gender: "Male" },
    };
    for (const c of CASOS_TALLA_REEBOK) {
      expect(casoTallaReebok(ejemplo[c.id]), `caso ${c.id}`).toBe(c.id);
    }
    // Unisex y sin género también caen en el caso de la mediana.
    expect(casoTallaReebok({ department: "FOOTWEAR", ageGroup: "Adult", gender: "Unisex" })).toBe("calzado-kids");
    expect(casoTallaReebok({ department: "FOOTWEAR", ageGroup: "", gender: "" })).toBe("calzado-kids");
  });
});

/* ═══ 3 · El short de baño busca M, no 41 ═════════════════════════════════ */

describe("🩸 el short de baño se mide en LETRA, no en número", () => {
  it("«Men-Swimshorts» prueba M — ni la 41 de zapato ni la 32 de pantalón", () => {
    expect(tallasAProbar("Men-Swimshorts", "")).toEqual(["M"]);
    expect(tallasAProbar("Men-Swimshorts", "MEN")).toEqual(["M"]);
    expect(tallasAProbar("Women-Swimshorts", "")).toEqual(["M"]);
  });

  it("su familia es «letra», que gana a calzado y a pantalón", () => {
    expect(familiaDeTalla("Men-Swimshorts")).toBe("letra");
    // Contiene "SHORT" y aun así NO cae en bottoms.
    expect(familiaDeTalla("Men-Shorts")).toBe("bottom");
    expect(familiaDeTalla("Men-Sneakers")).toBe("calzado");
  });

  it("«SWIMSHO» salió de la lista de CALZADO del código", () => {
    // El defecto original: vivía ahí desde el primer commit del módulo.
    const fuente = leer("lib/depurador/talla.ts");
    const listaCalzado = fuente.match(/const FOOTWEAR = \[[^\]]*\]/)?.[0] ?? "";
    expect(listaCalzado).not.toMatch(/SWIMSHO/);
    expect(listaCalzado).toMatch(/SNEAKER/); // CONTROL: la lista sigue ahí
  });

  it("Kids NO se lleva el turno: un zapato de kids sigue probando la 41", () => {
    expect(tallasAProbar("Kids-Sneakers", "MEN")).toEqual(["8", "41", "M"]);
  });

  it("el caso del baño solo aplica a su familia, no a todo", () => {
    // Si «letra» dejara de ser una familia y aplicara a todo, el calzado
    // perdería su número.
    expect(tallasAProbar("Men-Sneakers", "")[0]).toBe("41");
    expect(tallasAProbar("Men-Shorts", "")[0]).toBe("32");
  });

  it("el resto del calzado NO se movió", () => {
    expect(tallasAProbar("Men-Sneakers", "")).toEqual(["41", "M"]);
    expect(tallasAProbar("Women-Sandals", "")).toEqual(["37", "M"]);
    expect(tallasAProbar("Men-Shorts", "")).toEqual(["32", "M"]);
    expect(tallasAProbar("Women-Pants", "")).toEqual(["27", "M"]);
    expect(tallasAProbar("Kids-T-Shirts", "")).toEqual(["8", "M"]);
  });

  it("el EAN elegido de un short de baño es el de la M (extremo a extremo)", () => {
    const filas: SheetRow[] = [
      ["REFERENCIA", "EAN", "P_CATEGORY", "TALLA", "CANTIDAD", "COSTO", "PRECIO2", "MARCA", "GENERO"],
      ["SW1", "111", "Men-Swimshorts", "41", 1, 10, 20, "TH Swimwear", "MEN"],
      ["SW1", "222", "Men-Swimshorts", "M", 1, 10, 20, "TH Swimwear", "MEN"],
    ];
    const r = processRows(filas, { factor: 1.1, tasa: "7", mesIdx: 0, anio: "2026" });
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].talla).toBe("M");
    expect(r.rows[0].cols["Código Barra *"]).toBe("222");
  });
});

/* ═══ 4 · La secretaria puede quitar una descripción ══════════════════════ */

describe("🔴 la secretaria puede QUITAR una descripción — ella la escribió", () => {
  const ruta = leer("app/api/productos/cargar/descripciones/[id]/route.ts");

  it("el PATCH deja entrar a admin Y secretaria", () => {
    expect(ruta).toMatch(/const ALLOWED = \["admin", "secretaria"\]/);
    expect(ruta).toMatch(/requireAuth\(req, ALLOWED\)/);
    expect(ruta).not.toMatch(/requireAuth\(req, \["admin"\]\)/);
  });

  it("sigue siendo DESACTIVAR, nunca un DELETE", () => {
    expect(ruta).toMatch(/\.update\(\{ activa: body\.activa \}\)/);
    expect(ruta).not.toMatch(/\.delete\(/);
  });

  it("la lectura del catálogo trae el id de cada descripción activa", () => {
    // Sin id no hay forma de quitarla desde la pantalla que ella ve.
    const lista = leer("app/api/productos/cargar/descripciones/route.ts");
    expect(lista).toMatch(/filas\.push\(\{ id: r\.id/);
    expect(lista).toMatch(/NextResponse\.json\(\{ catalogo, filas \}\)/);
    // El catálogo NO cambió de forma: los demás consumidores siguen igual.
    expect(lista).toMatch(/\(catalogo\[r\.marca\] \?\?= \[\]\)\.push\(r\.descripcion\)/);
  });
});

/* ═══ 5 · Las correcciones de nombre: solo las que hacen falta, y de verdad ═ */

describe("🩸 la tabla de nombres muestra LO QUE SALE AL EXCEL", () => {
  const necesarias = reglasDeNormalizacionQueHacenFalta();

  it("son 10 de las 22 — el resto lo resuelven los principios solos", () => {
    expect(Object.keys(NORMALIZACION)).toHaveLength(22);
    expect(necesarias).toHaveLength(10);
  });

  it("cada fila dice exactamente lo que produce `normalizeDescripcion`", () => {
    for (const r of necesarias) {
      expect(r.limpia, `«${r.sucia}»`).toBe(normalizeDescripcion(r.sucia));
    }
  });

  it("la fila que MENTÍA ya no se muestra, y su valor del mapa era falso", () => {
    const sucia = "Boys-Shirts - Woven Tops S-S";
    // El mapa promete una cosa…
    expect(NORMALIZACION[sucia]).toBe("Boys-Shirts - Woven Tops S/S");
    // …y al Excel sale otra (el principio SHIRTS_WOVEN la reescribe después).
    expect(normalizeDescripcion(sucia)).toBe("Boys-Shirts Woven S/S");
    expect(necesarias.some((r) => r.sucia === sucia)).toBe(false);
  });

  it("las 10 son las medidas el 8-sep-2026", () => {
    expect(necesarias.map((r) => r.sucia).sort()).toEqual([
      "BoyS Shirts S/S",
      "Girls-Panties 2PZ",
      "MEN-WATCHES",
      "Men-Blazers / Sports Jackets",
      "Men-Polo S/S",
      "Men-Ties / Neckwear",
      "WOMEN-WATCHES",
      "Women-Blazers / Sports Jackets",
      "Women-Panties C",
      "women-T-Shirts S/S",
    ].sort());
  });

  it("la pantalla NO teclea la lista: la pide a la función", () => {
    const vista = leer("app/productos/cargar/ReglasView.tsx");
    expect(vista).toMatch(/reglasDeNormalizacionQueHacenFalta\(\)/);
    // Los 8 principios de limpieza se fueron de la pantalla.
    expect(vista).not.toMatch(/PRINCIPIOS_LIMPIEZA/);
    // Y no vuelve a leer el mapa crudo.
    expect(vista).not.toMatch(/NORMALIZACION/);
  });
});

/* ═══ 6 · Las dos mitades solo valen dentro de la MISMA marca ═════════════ */

describe("🩸 las dos mitades solo valen DENTRO DE LA MISMA MARCA", () => {
  // Recorte real del catálogo (medido el 8-sep-2026).
  const CAT: CatalogoDescripciones = {
    "TH Menswear": ["Men-Polo S/S Core", "Men-Polos L/S", "Men-Polos S/S"],
    "TH Kids": ["Boys-Polos S/S", "Boys-Polos S/S Core", "Toddler Boys-Polos S/S Core"],
  };

  it("el interruptor está encendido, y se midió antes de encenderlo", () => {
    expect(MITADES_POR_MARCA).toBe(true);
  });

  it("«Men-Polos S/S Core» en TH Menswear ALERTA, y muestra la gemela", () => {
    // La mitad «Polos S/S Core» existe, pero en TH KIDS. Antes eso la dejaba
    // pasar y tapaba la casi-gemela real, «Men-Polo S/S Core» (singular).
    const v = veredictoDescripcion("Men-Polos S/S Core", CAT, "TH Menswear");
    expect(v.veredicto).toBe("alerta");
    expect(v.gemela).toBe("Men-Polo S/S Core");
  });

  it("CONTROL: «Boys-Polos S/S Core» en TH Kids NO alerta — ahí sí vive", () => {
    expect(veredictoDescripcion("Boys-Polos S/S Core", CAT, "TH Kids").veredicto).not.toBe("alerta");
  });

  it("las dos mitades en SU marca siguen pasando solas (regla 1 de Daniel)", () => {
    // «Men» y «Polos L/S» viven las dos en TH Menswear.
    expect(veredictoDescripcion("Men-Polos L/S Core X", CAT, "TH Menswear").veredicto).toBe("alerta");
    expect(veredictoDescripcion("Men-Polos S/S", CAT, "TH Menswear").veredicto).toBe("ya-existe");
    const otro: CatalogoDescripciones = { "CK Kids": ["Girls-Shorts", "Boys-Short Knit"] };
    expect(veredictoDescripcion("Girls-Short Knit", otro, "CK Kids").veredicto).toBe("pasa");
  });

  it("«ya-existe» y `normalizarEspacios` NO se acotaron: siguen mirando todo", () => {
    // La misma descripción con otros espacios/mayúsculas se resuelve igual
    // aunque se pregunte por otra marca.
    expect(veredictoDescripcion("men-polos  s/s", CAT, "TH Kids").veredicto).toBe("ya-existe");
  });

  it("sin marca, el veredicto es el de siempre (el interruptor no aplica)", () => {
    expect(veredictoDescripcion("Men-Polos S/S Core", CAT).veredicto).toBe("pasa");
  });

  it("los dos llamadores le pasan la marca", () => {
    expect(leer("app/productos/cargar/DepuradorClient.tsx"))
      .toMatch(/veredictoDescripcion\(desc, catalogo, marca\)/);
    expect(leer("lib/depurador/tienda.ts"))
      .toMatch(/veredictoDescripcion\(desc, cfg\.catalogo, marca\)/);
  });
});

/* ═══ El catálogo de marcas: las 7 vacías se ven ══════════════════════════ */

describe("🔴 las marcas sin descripciones se MUESTRAN, diciendo qué les pasa", () => {
  it("el catálogo de marcas sigue teniendo 33", () => {
    expect(MARCA_CATALOGO).toHaveLength(33);
  });

  it("la pantalla no esconde ninguna marca por estar vacía", () => {
    const vista = leer("app/productos/cargar/ReglasView.tsx");
    expect(vista).toMatch(/SIN_DESCRIPCIONES/);
    expect(vista).toMatch(/Todavía sin descripciones cargadas/);
  });
});
