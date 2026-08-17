// EL CÓDIGO DESEMPATA EL ORDEN DEL CATÁLOGO — se renderiza la pantalla REAL.
//
// El caso de Daniel, medido contra producción el 17-ago-2026: en Calvin los
// cuatro `KCMEENA…` salían desperdigados entre los `HW0HW…` y los `KCTO…`
// (posiciones 17 · 22 · 37 · 39 de 81) porque los cuatro se llaman igual —
// `Women-Flip Flops`— y al empatar el nombre el orden quedaba como viniera de
// la base. Con el desempate quedan en 32 · 33 · 34 · 35: pegados.
//
// 🔑 Es un test de CONDUCTA: monta el grid y LEE el orden de las tarjetas. Un
// barrido de texto sobre el .tsx se cumple con su propio comentario —este repo
// ya lo pagó cuatro veces— y además no puede ver que los DOS pipelines (lista
// plana y grupos) queden ordenados, que es justo lo que se rompe al tocar uno
// solo de los dos `.sort()`.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import CatalogoVendedorPage from "@/components/catalogo/CatalogoVendedorPage";
import CatalogoPublicoPage from "@/components/catalogo/CatalogoPublicoPage";
import { compararCodigos } from "@/lib/catalogos/orden-codigo";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/catalogo/calvin",
}));
vi.mock("@/components/shared/CatalogoSyncNow", () => ({ default: () => null }));

function makeStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  } as Storage;
}

/** Producto de catálogo plano, con lo mínimo que el grid necesita para pintarlo. */
function p(sku: string, name: string, category: string, gender: string, price = 10) {
  return { id: sku, sku, name, price, image_url: null, category, gender, bulto_pzas: 12, disponibilidad: 240, existencia: 240, active: true };
}

// Los cuatro `KCMEENA…` REALES de Calvin — los cuatro `Women-Flip Flops`, los
// cuatro `flip_flops`/`women` — con los vecinos REALES entre los que salían
// desperdigados. El orden de entrada es el que devolvía la base.
const CALVIN = [
  p("HW0HW01624BEH", "Women-Flip Flops", "flip_flops", "women"),
  p("KCMEENA683", "Women-Flip Flops", "flip_flops", "women"),
  p("HW0HW029570GJ", "Women-Flip Flops", "flip_flops", "women"),
  p("KCARMIRA001", "Women-Flip Flops", "flip_flops", "women"),
  p("KCMEENA-A210", "Women-Flip Flops", "flip_flops", "women"),
  p("KCTO12311400", "Women-Flip Flops", "flip_flops", "women"),
  p("HW0HW02960ABH", "Women-Flip Flops", "flip_flops", "women"),
  p("KCMEENAA962", "Women-Flip Flops", "flip_flops", "women"),
  p("KCTO12311001", "Women-Flip Flops", "flip_flops", "women"),
  p("KCMEENA004", "Women-Flip Flops", "flip_flops", "women"),
  p("KCTO12311200", "Women-Flip Flops", "flip_flops", "women"),
];

const KCMEENA = ["KCMEENA-A210", "KCMEENA004", "KCMEENA683", "KCMEENAA962"];

function stubRed(productos: unknown[]) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const u = String(url);
    if (u.includes("/inventory")) return { ok: true, status: 200, json: async () => [] };
    // El vendedor pide `/products` y recibe el arreglo; el público pide
    // `/public` y recibe `{ products, inventory }`. Son las dos formas reales.
    if (u.includes("/public")) return { ok: true, status: 200, json: async () => ({ products: productos, inventory: [] }) };
    if (u.includes("/products")) return { ok: true, status: 200, json: async () => productos };
    return { ok: true, status: 200, json: async () => ({}) };
  }));
}

/** Los códigos, en el orden en que la pantalla los pintó. */
function codigosEnPantalla(): string[] {
  return Array.from(document.querySelectorAll("span"))
    .map((s) => (s.textContent || "").trim())
    .filter((t) => /^[A-Z0-9-]{6,}$/.test(t) && CALVIN.some((x) => x.sku === t));
}

beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", { value: makeStorage(), configurable: true, writable: true });
  Object.defineProperty(globalThis, "sessionStorage", { value: makeStorage(), configurable: true, writable: true });
  sessionStorage.setItem("cxc_role", "vendedor");
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("el caso de Daniel: los cuatro KCMEENA quedan juntos", () => {
  it("catálogo del VENDEDOR — orden por defecto (Relevancia)", async () => {
    stubRed(CALVIN);
    render(<CatalogoVendedorPage marca="calvin" />);
    await waitFor(() => expect(screen.getByText("KCMEENA683")).toBeTruthy());

    const orden = codigosEnPantalla();
    const pos = KCMEENA.map((s) => orden.indexOf(s));
    expect(pos.every((i) => i >= 0)).toBe(true);
    // Contiguos, y en el orden A-Z del código.
    expect(orden.slice(Math.min(...pos), Math.max(...pos) + 1)).toEqual(KCMEENA);
  });

  it("catálogo PÚBLICO — el mismo orden que ve el vendedor", async () => {
    stubRed(CALVIN);
    render(<CatalogoPublicoPage marca="calvin" />);
    await waitFor(() => expect(screen.getByText("KCMEENA683")).toBeTruthy());

    const orden = codigosEnPantalla();
    const pos = KCMEENA.map((s) => orden.indexOf(s));
    expect(orden.slice(Math.min(...pos), Math.max(...pos) + 1)).toEqual(KCMEENA);
  });
});

describe("Tommy: 19 nombres para 453 productos — el nombre no puede ordenar", () => {
  // Todos `Women-Sneakers`, todos la misma sección: sin el desempate el orden
  // final es el de la base.
  const TOMMY = [
    p("FW0FW07581-DW6", "Women-Sneakers", "sneakers", "women"),
    p("FW0FW06447DW5", "Women-Sneakers", "sneakers", "women"),
    p("FW0FW06158-DW5", "Women-Sneakers", "sneakers", "women"),
    p("FW0FW06149-DW5", "Women-Sneakers", "sneakers", "women"),
    p("FW0FW05034-DW5", "Women-Sneakers", "sneakers", "women"),
  ];

  it("quedan en orden A-Z de código, con los de guión pegados a su familia", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes("/inventory")) return { ok: true, status: 200, json: async () => [] };
      if (u.includes("/public")) return { ok: true, status: 200, json: async () => ({ products: TOMMY, inventory: [] }) };
      if (u.includes("/products")) return { ok: true, status: 200, json: async () => TOMMY };
      return { ok: true, status: 200, json: async () => ({}) };
    }));
    render(<CatalogoVendedorPage marca="tommy" />);
    await waitFor(() => expect(screen.getByText("FW0FW05034-DW5")).toBeTruthy());

    const orden = Array.from(document.querySelectorAll("span"))
      .map((s) => (s.textContent || "").trim())
      .filter((t) => TOMMY.some((x) => x.sku === t));
    expect(orden).toEqual([
      "FW0FW05034-DW5",
      "FW0FW06149-DW5",
      "FW0FW06158-DW5",
      "FW0FW06447DW5",
      "FW0FW07581-DW6",
    ]);
  });
});

describe("el desempate va AL FINAL: no mueve nada que hoy no empate", () => {
  it("categoría y género siguen mandando sobre el código", async () => {
    // `AAA…` en sandals contra `ZZZ…` en flip_flops: en el tema de Calvin
    // flip_flops va antes que sandals, así que el ZZZ tiene que ir PRIMERO.
    const MIX = [
      p("AAA0000001", "Women-Sandals", "sandals", "women"),
      p("ZZZ0000001", "Women-Flip Flops", "flip_flops", "women"),
    ];
    stubRed(MIX);
    render(<CatalogoVendedorPage marca="calvin" />);
    await waitFor(() => expect(screen.getByText("AAA0000001")).toBeTruthy());

    const orden = Array.from(document.querySelectorAll("span"))
      .map((s) => (s.textContent || "").trim())
      .filter((t) => t === "AAA0000001" || t === "ZZZ0000001");
    expect(orden).toEqual(["ZZZ0000001", "AAA0000001"]);
  });

  it("nombres DISTINTOS: manda el nombre, el código ni se mira", async () => {
    const MIX = [
      p("ZZZ0000001", "Women-Alpha", "flip_flops", "women"),
      p("AAA0000001", "Women-Beta", "flip_flops", "women"),
    ];
    stubRed(MIX);
    render(<CatalogoVendedorPage marca="calvin" />);
    await waitFor(() => expect(screen.getByText("AAA0000001")).toBeTruthy());

    const orden = Array.from(document.querySelectorAll("span"))
      .map((s) => (s.textContent || "").trim())
      .filter((t) => t === "AAA0000001" || t === "ZZZ0000001");
    expect(orden).toEqual(["ZZZ0000001", "AAA0000001"]);
  });
});

describe("los DOS pipelines: la vista agrupada (Joybees) también ordena", () => {
  // Joybees agrupa por modelo (`groupByModel`): el desempate va sobre el
  // `baseSku` del grupo. Tocar solo el `.sort()` de la lista plana dejaría
  // esta vista igual de desordenada.
  const JOY = [
    { ...p("UZZZZ.BLK.M09", "Kids Clog", "footwear", "kids"), stock: 10 },
    { ...p("UAAAA.BLK.M09", "Kids Clog", "footwear", "kids"), stock: 10 },
    { ...p("UMMMM.BLK.M09", "Kids Clog", "footwear", "kids"), stock: 10 },
  ];

  it("los grupos quedan en orden A-Z de su código base", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes("/inventory")) return { ok: true, status: 200, json: async () => [] };
      if (u.includes("/public")) return { ok: true, status: 200, json: async () => ({ products: JOY, inventory: [] }) };
      if (u.includes("/products")) return { ok: true, status: 200, json: async () => JOY };
      return { ok: true, status: 200, json: async () => ({}) };
    }));
    render(<CatalogoVendedorPage marca="joybees" />);
    await waitFor(() => expect(screen.getAllByText("Kids Clog").length).toBe(3));

    const orden = Array.from(document.querySelectorAll("span"))
      .map((s) => (s.textContent || "").trim())
      .filter((t) => /^U(AAAA|MMMM|ZZZZ)\.BLK/.test(t));
    expect(orden.map((s) => s.slice(0, 5))).toEqual(["UAAAA", "UMMMM", "UZZZZ"]);
  });
});

describe("la comparación es estable y predecible en cualquier entorno", () => {
  it("no usa localeCompare: compara crudo en MAYÚSCULAS", () => {
    // Los cuatro códigos reales de Daniel.
    expect([...KCMEENA].reverse().sort(compararCodigos)).toEqual(KCMEENA);
    // Case-insensitive para ordenar, pero total: dos códigos que solo difieren
    // en mayúsculas no pueden quedar en orden aleatorio.
    expect(compararCodigos("kcmeena004", "KCMEENA004")).not.toBe(0);
    expect(compararCodigos("KCMEENA004", "KCMEENA004")).toBe(0);
    // Un código nulo o vacío no revienta la comparación (ordena como "").
    expect(["B", null, "A"].sort(compararCodigos)).toEqual([null, "A", "B"]);
    expect(compararCodigos(undefined, "A")).toBeLessThan(0);
  });

  it("el guión NO se quita, y los códigos con guión caen pegados a su familia", () => {
    // Medido sobre los 579 SKU reales de Calvin + Tommy: los 41 con guión
    // quedan al lado de su propia familia sin normalizar nada.
    expect(["KCMEENAA962", "KCMEENA683", "KCMEENA-A210", "KCMEENA004"].sort(compararCodigos))
      .toEqual(["KCMEENA-A210", "KCMEENA004", "KCMEENA683", "KCMEENAA962"]);
    expect(["T1A8-32600313", "T1A030881313", "T1A8-32600-313"].sort(compararCodigos))
      .toEqual(["T1A030881313", "T1A8-32600-313", "T1A8-32600313"]);
    expect(["FW0FW06447DW5", "FW0FW06158-DW5", "FW0FW06149-DW5"].sort(compararCodigos))
      .toEqual(["FW0FW06149-DW5", "FW0FW06158-DW5", "FW0FW06447DW5"]);
  });
});

describe("barrido: los CUATRO .sort() del catálogo desempatan por código", () => {
  // ⚠️ Borra los comentarios PRIMERO: este repo ya pagó cuatro veces el
  // candado que se cumple con su propia explicación.
  const sinComentarios = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");

  const ARCHIVOS = [
    "src/components/catalogo/CatalogoVendedorPage.tsx",
    "src/components/catalogo/CatalogoPublicoPage.tsx",
    "src/app/catalogos/admin/[marca]/ProductosBatch.tsx",
    "src/app/catalogos/admin/[marca]/ProductosTarjetas.tsx",
  ];

  it("ninguna rama de orden se queda sin el desempate", async () => {
    const { readFileSync } = await import("node:fs");
    for (const ruta of ARCHIVOS) {
      const src = sinComentarios(readFileSync(ruta, "utf8"));
      expect(src, `${ruta} importa el comparador`).toContain("compararCodigos");
      // Toda comparación de NOMBRE dentro de un orden lleva el desempate pegado.
      const nombres = src.match(/\.name\.localeCompare\([^)]*\)[^\n]*/g) ?? [];
      expect(nombres.length, `${ruta} compara nombres`).toBeGreaterThan(0);
      for (const linea of nombres) {
        expect(linea, `${ruta}: "${linea.trim()}" sin desempate`).toContain("compararCodigos");
      }
    }
  });

  it("las dos pantallas del catálogo desempatan también por PRECIO", async () => {
    const { readFileSync } = await import("node:fs");
    for (const ruta of ARCHIVOS.slice(0, 2)) {
      const src = sinComentarios(readFileSync(ruta, "utf8"));
      const precios = src.match(/sortBy === "precio-(asc|desc)"[^\n]*/g) ?? [];
      expect(precios.length, `${ruta} ordena por precio`).toBe(4); // 2 ramas × 2 pipelines
      for (const linea of precios) {
        expect(linea, `${ruta}: "${linea.trim()}" sin desempate`).toContain("compararCodigos");
      }
    }
  });
});
