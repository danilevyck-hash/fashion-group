// ─────────────────────────────────────────────────────────────────────────────
// Filtro de precio EXACTO del catálogo (23-ago-2026).
//
// Daniel, textual: *"quita el dropdown del filtro de precio en los catalogos y
// pon opcion de filtro exacto"*. Y después, sobre el segundo campo: *"me gusto
// el segundo campo de hasta, pero para facilidad del usuario siempre usara
// precio exacto, asi que el hasta automaticamente se ponga el precio que puso
// el usuario de desde para no hacer doble trabajo"*.
//
// 🔴 LOS CANDADOS DE ACÁ SON DE CONDUCTA, NO DE TEXTO. Pintan el componente
// REAL, escriben en los campos y leen el DOM. Este repo ya pagó cuatro veces el
// candado que se cumple con su propio comentario, así que el único barrido
// estático que queda (el de "el desplegable no vuelve") BORRA LOS COMENTARIOS
// ANTES de mirar.
//
// ── 🔴 LA FILA DE BOTONES SE FUE. EL AVISO SE QUEDA (24-ago-2026) ────────────
//
// Daniel, textual: *"sí, pero no quiero botones de precios, solo escribirlo y
// ya, me explico?"*, y sobre cuántos precios mostrar en Tommy: *"ninguno"*.
// Así que este archivo defiende AHORA lo contrario de lo que defendía ayer en
// esa mitad: que NO se pinte ni un botón de precio, ni el "Ver los N precios".
//
// ⚠️ Y defiende, con la misma fuerza, que el AVISO de "ese precio no existe"
// siga vivo: es otra cosa (texto, y solo cuando hace falta) y es lo que evita
// que la pantalla parezca rota — Tommy tiene $17.50 pero NO $17.
//
// Lo que se defiende:
//   1. el ESPEJO: escribir en «desde» llena «hasta» solo;
//   2. tocar «hasta» APAGA el espejo, y vaciarlo lo vuelve a encender;
//   3. NO hay fila de botones de precio, en ninguna marca ni con ningún dato;
//   4. cuando el precio escrito no existe, se dice en español simple — y los
//      precios reales se siguen DERIVANDO de lo que la pantalla tiene en
//      memoria, sin consulta nueva, porque de ahí sale "lo más cercano";
//   5. 44 px de alto en todo lo que se toca y nada de texto bajo 12 px;
//   6. las CUATRO marcas llevan el campo de precio (Daniel, 24-ago-2026).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";
import { createElement, useState } from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { readFileSync } from "fs";
import path from "path";

vi.mock("@/lib/tommy-supabase-server", () => ({ tommyServer: {} }));
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: {} }));

import { MARCA_THEME, type MarcaUiKey } from "@/lib/catalogo/marcas-ui";
import {
  PRECIO_VACIO, parsePrecio, precioDeUrl, precioEnFiltro, preciosDelCatalogo,
  preciosCercanos, mensajeFiltroPrecio, type FiltroPrecio,
} from "@/lib/catalogo/filtros-extra";
import CatalogoFilters from "@/components/catalogo/CatalogoFilters";

const FUENTE = readFileSync(
  path.join(process.cwd(), "src/components/catalogo/CatalogoFilters.tsx"),
  "utf8",
);

// Los precios REALES de Tommy que hacen falta para entender el bug: dos con
// medio dólar. Escribir "19" no cae en ninguno.
const PRECIOS_TOMMY = [16, 17.5, 19, 19.5, 22, 28, 38, 52];

// ── La regla pura ────────────────────────────────────────────────────────────
describe("parsePrecio — tolera lo que de verdad se teclea", () => {
  it("acepta el número pelado, con decimales y con medio dólar", () => {
    expect(parsePrecio("30")).toBe(30);
    expect(parsePrecio("17.5")).toBe(17.5);
    expect(parsePrecio("17.50")).toBe(17.5);
  });

  it("acepta el signo de dólar y la coma decimal panameña", () => {
    expect(parsePrecio("$30")).toBe(30);
    expect(parsePrecio(" $ 30 ")).toBe(30);
    expect(parsePrecio("30,00")).toBe(30);
    expect(parsePrecio("17,5")).toBe(17.5);
    expect(parsePrecio("1,234.50")).toBe(1234.5);
  });

  it("dice que no a lo que no es un precio (no lo convierte en 0)", () => {
    for (const v of ["", "   ", "abc", "-5", "1.2.3", "30$x", null, undefined]) {
      expect(parsePrecio(v as string | null), String(v)).toBeNull();
    }
  });

  it("el precio de la URL es dato NO confiable: entra normalizado o no entra", () => {
    expect(precioDeUrl("$30")).toBe("30");
    expect(precioDeUrl("17,50")).toBe("17.5");
    expect(precioDeUrl("<script>")).toBe("");
    expect(precioDeUrl(null)).toBe("");
  });
});

describe("precioEnFiltro — con los dos campos iguales es igualdad EXACTA", () => {
  it("filtra el precio exacto, incluidos los de medio dólar", () => {
    expect(precioEnFiltro(17.5, "17.5", "17.5")).toBe(true);
    expect(precioEnFiltro(17.5, "17.50", "17.50")).toBe(true);
    expect(precioEnFiltro(19.5, "17.5", "17.5")).toBe(false);
    expect(precioEnFiltro(18, "17.5", "17.5")).toBe(false);
    // El caso que hace fallar la comparación ingenua de floats.
    expect(precioEnFiltro(0.1 + 0.2, "0.3", "0.3")).toBe(true);
  });

  it("sigue sirviendo de rango cuando la persona escribe los dos", () => {
    expect(precioEnFiltro(22, "20", "30")).toBe(true);
    expect(precioEnFiltro(20, "20", "30")).toBe(true);
    expect(precioEnFiltro(30, "20", "30")).toBe(true);
    expect(precioEnFiltro(19.99, "20", "30")).toBe(false);
    expect(precioEnFiltro(30.01, "20", "30")).toBe(false);
  });

  it("con un solo campo hace tope: «desde» solo, «hasta» solo", () => {
    expect(precioEnFiltro(52, "40", "")).toBe(true);
    expect(precioEnFiltro(38, "40", "")).toBe(false);
    expect(precioEnFiltro(17.5, "", "20")).toBe(true);
    expect(precioEnFiltro(22, "", "20")).toBe(false);
  });

  it("campos vacíos o a medio escribir NO vacían la grilla (fail-open)", () => {
    expect(precioEnFiltro(52, "", "")).toBe(true);
    expect(precioEnFiltro(52, "$", "$")).toBe(true);
    expect(precioEnFiltro(52, "abc", "")).toBe(true);
    // Un precio roto en el dato tampoco esconde el producto.
    expect(precioEnFiltro(null, "20", "20")).toBe(true);
    expect(precioEnFiltro(Number.NaN, "20", "20")).toBe(true);
  });
});

describe("preciosDelCatalogo — se derivan de los productos, sin repetir", () => {
  it("junta, ordena y deduplica al centavo", () => {
    expect(preciosDelCatalogo([28, 17.5, 28, 52, 17.5, 19.5])).toEqual([17.5, 19.5, 28, 52]);
  });

  it("descarta lo que no es un precio de verdad (0, null, roto)", () => {
    expect(preciosDelCatalogo([0, null, undefined, Number.NaN, -3, 22])).toEqual([22]);
  });

  it("un catálogo vacío da lista vacía, no revienta", () => {
    expect(preciosDelCatalogo([])).toEqual([]);
  });
});

describe("mensajeFiltroPrecio — decirlo antes de que parezca un error", () => {
  it("callado cuando no hay nada escrito o el precio SÍ existe", () => {
    expect(mensajeFiltroPrecio("", "", PRECIOS_TOMMY)).toBeNull();
    expect(mensajeFiltroPrecio("17.5", "17.5", PRECIOS_TOMMY)).toBeNull();
    expect(mensajeFiltroPrecio("20", "30", PRECIOS_TOMMY)).toBeNull();
  });

  it("🔴 el caso medido: '17' en Tommy no existe y se ofrecen los vecinos", () => {
    // Tommy tiene $16 y $17.50, pero NO $17: es el precio que se escribe solo
    // y devuelve cero productos.
    const m = mensajeFiltroPrecio("17", "17", PRECIOS_TOMMY);
    expect(m).toBeTruthy();
    expect(m).toContain("$17");
    // No basta con avisar: hay que dar la salida, y en el formato de la casa
    // (sin `.00`, sin redondear).
    expect(m).toContain("$16");
    expect(m).toContain("$17.50");
  });

  it("ofrece un solo vecino cuando el precio queda fuera de los extremos", () => {
    expect(mensajeFiltroPrecio("5", "5", PRECIOS_TOMMY)).toContain("$16");
    expect(mensajeFiltroPrecio("999", "999", PRECIOS_TOMMY)).toContain("$52");
  });

  it("con un rango vacío dice entre cuánto y cuánto, y dónde SÍ hay", () => {
    const m = mensajeFiltroPrecio("40", "50", PRECIOS_TOMMY);
    expect(m).toContain("$40");
    expect(m).toContain("$50");
    // Y dónde SÍ hay: los dos extremos reales del catálogo.
    expect(m).toContain("$16");
    expect(m).toContain("$52");
  });

  it("avisa si escribieron letras, en vez de filtrar en silencio", () => {
    expect(mensajeFiltroPrecio("veinte", "", PRECIOS_TOMMY)).toContain("solo el número");
  });

  it("avisa si el «hasta» quedó por debajo del «desde»", () => {
    expect(mensajeFiltroPrecio("50", "20", PRECIOS_TOMMY)).toContain("menor");
  });

  it("con el catálogo todavía sin cargar NO acusa a nadie", () => {
    // Lista vacía = "todavía no sé", que es indistinguible de "no hay ninguno".
    expect(mensajeFiltroPrecio("19", "19", [])).toBeNull();
  });

  it("preciosCercanos devuelve el de abajo y el de arriba", () => {
    expect(preciosCercanos(17, PRECIOS_TOMMY)).toEqual({ abajo: 16, arriba: 17.5 });
    expect(preciosCercanos(5, PRECIOS_TOMMY)).toEqual({ abajo: null, arriba: 16 });
    expect(preciosCercanos(999, PRECIOS_TOMMY)).toEqual({ abajo: 52, arriba: null });
  });
});

// ── 🔴 CANDADOS DE CONDUCTA: se pinta el componente y se escribe en él ────────

/** El filtro de verdad, con estado, como lo usan las dos páginas. */
function Pantalla(props: { marca?: MarcaUiKey; precios?: number[]; inicial?: FiltroPrecio }) {
  const [precio, setPrecio] = useState<FiltroPrecio>(props.inicial ?? PRECIO_VACIO);
  return createElement(CatalogoFilters, {
    marca: props.marca ?? "tommy",
    searchInput: "", onSearchChange: () => {},
    gender: "", onGenderChange: () => {},
    category: "", onCategoryChange: () => {},
    bultosFilter: false, onBultosFilterChange: () => {},
    precio, onPrecioChange: setPrecio,
    preciosDisponibles: props.precios ?? PRECIOS_TOMMY,
    sortBy: "relevancia", onSortByChange: () => {},
    filteredCount: 0, onClearAll: () => {},
  });
}

function campos() {
  return {
    desde: screen.getByLabelText("Precio desde") as HTMLInputElement,
    hasta: screen.getByLabelText("Precio hasta") as HTMLInputElement,
  };
}

describe("🔴 el espejo: se escribe UN precio y el «hasta» se llena solo", () => {
  it("cada tecla de «desde» se copia en «hasta»", () => {
    render(createElement(Pantalla, {}));
    const { desde, hasta } = campos();
    fireEvent.change(desde, { target: { value: "2" } });
    expect(hasta.value).toBe("2");
    fireEvent.change(desde, { target: { value: "22" } });
    expect(desde.value).toBe("22");
    expect(hasta.value).toBe("22");
  });

  it("funciona con los precios de medio dólar, que son los que rompían", () => {
    render(createElement(Pantalla, {}));
    const { desde, hasta } = campos();
    fireEvent.change(desde, { target: { value: "17.50" } });
    expect(hasta.value).toBe("17.50");
    expect(precioEnFiltro(17.5, desde.value, hasta.value)).toBe(true);
    expect(precioEnFiltro(19.5, desde.value, hasta.value)).toBe(false);
  });

  it("borrar el «desde» deja los dos campos vacíos (no queda un tope pegado)", () => {
    render(createElement(Pantalla, {}));
    const { desde, hasta } = campos();
    fireEvent.change(desde, { target: { value: "22" } });
    fireEvent.change(desde, { target: { value: "" } });
    expect(hasta.value).toBe("");
  });
});

describe("🔴 tocar «hasta» APAGA el espejo, y vaciarlo lo vuelve a encender", () => {
  it("después de escribir en «hasta», el «desde» ya no lo pisa", () => {
    render(createElement(Pantalla, {}));
    const { desde, hasta } = campos();
    fireEvent.change(desde, { target: { value: "22" } });
    expect(hasta.value).toBe("22");
    // La persona quiere un rango de verdad.
    fireEvent.change(hasta, { target: { value: "52" } });
    fireEvent.change(desde, { target: { value: "28" } });
    expect(desde.value).toBe("28");
    expect(hasta.value).toBe("52");
  });

  it("vaciar «hasta» reactiva el espejo: se vuelve al precio exacto solo", () => {
    render(createElement(Pantalla, {}));
    const { desde, hasta } = campos();
    fireEvent.change(desde, { target: { value: "22" } });
    fireEvent.change(hasta, { target: { value: "52" } });
    fireEvent.change(hasta, { target: { value: "" } });
    fireEvent.change(desde, { target: { value: "38" } });
    expect(hasta.value).toBe("38");
  });

  it("un link con rango abre SIN espejo: no se le pisa el «hasta» a quien lo abrió", () => {
    render(createElement(Pantalla, { inicial: { desde: "20", hasta: "30" } }));
    const { desde, hasta } = campos();
    fireEvent.change(desde, { target: { value: "25" } });
    expect(hasta.value).toBe("30");
  });
});

describe("🔴 NO hay fila de botones de precio — solo el campo donde se escribe", () => {
  /** Un botón cuyo texto ES un precio (`$22`, `$17.50`). */
  function botonesDePrecio(container: HTMLElement): string[] {
    return [...container.querySelectorAll("button")]
      .map(b => (b.textContent || "").trim())
      .filter(t => /^\$[\d.,]+$/.test(t));
  }

  it("con 8 precios cargados no se pinta NI UNO como botón", () => {
    const { container } = render(createElement(Pantalla, {}));
    expect(botonesDePrecio(container)).toEqual([]);
    for (const txt of ["$17.50", "$19.50", "$22", "$28", "$38", "$52"]) {
      expect(within(container).queryByRole("button", { name: txt }), txt).toBeNull();
    }
  });

  it("con 41 precios (el caso de Tommy) tampoco, y no hay «Ver los N precios»", () => {
    // Medido contra producción el 23-ago-2026: Tommy tiene 41 precios
    // distintos. Antes se pintaban 16 y el resto detrás de un botón; Daniel,
    // sobre cuántos mostrar: *"ninguno"*.
    const muchos = Array.from({ length: 41 }, (_, i) => 10 + i);
    const { container } = render(createElement(Pantalla, { precios: muchos }));
    expect(botonesDePrecio(container)).toEqual([]);
    expect(within(container).queryByRole("button", { name: /Ver los .* precios/ })).toBeNull();
    expect(within(container).queryByRole("button", { name: "Ver menos" })).toBeNull();
    expect(container.textContent).not.toContain("Precios de este catálogo");
  });

  it("tampoco en las otras tres marcas", () => {
    for (const marca of ["reebok", "joybees", "calvin"] as const) {
      const { container, unmount } = render(createElement(Pantalla, { marca }));
      expect(botonesDePrecio(container), marca).toEqual([]);
      expect(container.textContent, marca).not.toContain("Precios de este catálogo");
      unmount();
    }
  });

  it("el único botón del bloque es «Quitar precio», y solo con algo escrito", () => {
    const { container } = render(createElement(Pantalla, {}));
    const bloque = () => campos().desde.closest("div.space-y-1\\.5") as HTMLElement;
    expect([...bloque().querySelectorAll("button")]).toHaveLength(0);
    fireEvent.change(campos().desde, { target: { value: "22" } });
    const botones = [...bloque().querySelectorAll("button")].map(b => (b.textContent || "").trim());
    expect(botones).toEqual(["Quitar precio"]);
  });
});

describe("🔴 el precio que no existe se avisa en pantalla, en español simple", () => {
  it("escribir 17 en Tommy muestra el aviso con los precios más cercanos", () => {
    const { container } = render(createElement(Pantalla, {}));
    fireEvent.change(campos().desde, { target: { value: "17" } });
    const aviso = container.querySelector('[role="status"]');
    expect(aviso).toBeTruthy();
    expect(aviso!.textContent).toContain("$16");
    expect(aviso!.textContent).toContain("$17.50");
  });

  it("no hay aviso cuando el precio sí existe", () => {
    const { container } = render(createElement(Pantalla, {}));
    fireEvent.change(campos().desde, { target: { value: "19.50" } });
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it("el aviso desaparece al corregir el precio", () => {
    const { container } = render(createElement(Pantalla, {}));
    fireEvent.change(campos().desde, { target: { value: "17" } });
    expect(container.querySelector('[role="status"]')).toBeTruthy();
    fireEvent.change(campos().desde, { target: { value: "22" } });
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it("«Quitar precio» apaga el filtro entero de un toque", () => {
    const { container } = render(createElement(Pantalla, {}));
    fireEvent.change(campos().desde, { target: { value: "17" } });
    fireEvent.click(within(container).getByRole("button", { name: "Quitar precio" }));
    expect(campos().desde.value).toBe("");
    expect(campos().hasta.value).toBe("");
    expect(container.querySelector('[role="status"]')).toBeNull();
  });
});

describe("🔴 táctiles de 44 px y nada de texto por debajo de 12 px", () => {
  it("los dos campos y «Quitar precio» miden 44 px de alto", () => {
    const { container } = render(createElement(Pantalla, {}));
    fireEvent.change(campos().desde, { target: { value: "17" } });
    const bloque = campos().desde.closest("div.space-y-1\\.5") as HTMLElement;
    expect(bloque).toBeTruthy();
    const tocables = bloque.querySelectorAll("input, button, select, a");
    // Los dos campos + «Quitar precio». Ya no hay botones de precio (24-ago).
    expect(tocables.length).toBe(3);
    for (const el of tocables) {
      expect(el.className, el.getAttribute("aria-label") ?? el.textContent ?? "")
        .toContain("min-h-[44px]");
    }
  });

  it("ningún texto del bloque baja de `text-xs` (12 px)", () => {
    const { container } = render(createElement(Pantalla, {}));
    const bloque = campos().desde.closest("div.space-y-1\\.5") as HTMLElement;
    for (const el of bloque.querySelectorAll("*")) {
      const cls = (el.className || "").toString();
      // Tailwind no tiene nada entre `text-xs` (12px) y `text-[10px]` & cía:
      // lo que se prohíbe es cualquier tamaño arbitrario por debajo de 12.
      expect(cls, cls).not.toMatch(/text-\[(\d|10|11)px\]/);
      expect(cls, cls).not.toMatch(/text-\[0\.[0-6]\d*rem\]/);
    }
  });
});

// ── 🔴 LAS CUATRO MARCAS LLEVAN EL CAMPO DE PRECIO (Daniel, 24-ago-2026) ─────
//
// Este bloque decía lo CONTRARIO hasta hoy: exigía `filtroPrecio === false` en
// Reebok y Joybees, congelando una medición de jul-2026 (en Joybees los precios
// casi no varían — 7 distintos; en Reebok el precio es ~90% redundante con la
// categoría — 24 distintos). **Daniel la revirtió a propósito**: *"sí, pero no
// quiero botones de precios, solo escribirlo y ya, me explico?"*.
describe("el campo de precio está en las CUATRO marcas", () => {
  it("los cuatro flags están encendidos y el control se pinta", () => {
    for (const marca of ["reebok", "joybees", "tommy", "calvin"] as const) {
      expect(MARCA_THEME[marca].features.filtroPrecio, marca).toBe(true);
      const { unmount } = render(createElement(Pantalla, { marca }));
      expect(screen.getByLabelText("Precio desde"), marca).toBeTruthy();
      expect(screen.getByLabelText("Precio hasta"), marca).toBeTruthy();
      unmount();
    }
  });

  it("🔑 Joybees es espejo EXACTO de Reebok en este flag", () => {
    // Regla del repo: lo que lleva Reebok lo lleva Joybees, y nunca al revés.
    expect(MARCA_THEME.joybees.features.filtroPrecio)
      .toBe(MARCA_THEME.reebok.features.filtroPrecio);
  });

  it("el aviso de «ese precio no existe» funciona igual en Reebok y Joybees", () => {
    // Es lo que evita que la pantalla parezca rota cuando el precio escrito no
    // está en ESE catálogo. No es exclusivo de Tommy.
    for (const marca of ["reebok", "joybees"] as const) {
      const { container, unmount } = render(createElement(Pantalla, { marca }));
      fireEvent.change(campos().desde, { target: { value: "17" } });
      const aviso = container.querySelector('[role="status"]');
      expect(aviso, marca).toBeTruthy();
      expect(aviso!.textContent, marca).toContain("$16");
      expect(aviso!.textContent, marca).toContain("$17.50");
      unmount();
    }
  });
});

// ── Las dos vistas y los DOS pipelines ───────────────────────────────────────
describe("no quedan dos comportamientos de precio en el sistema", () => {
  const VISTAS: Record<string, string> = {
    "catálogo público": "src/components/catalogo/CatalogoPublicoPage.tsx",
    "catálogo interno": "src/components/catalogo/CatalogoVendedorPage.tsx",
  };

  /** El código VIVO de una vista, sin comentarios. */
  function vivo(rel: string): string {
    return readFileSync(path.join(process.cwd(), rel), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n").filter(l => !l.trim().startsWith("//")).join("\n");
  }

  it("cada vista filtra en la lista PLANA y también en la AGRUPADA", () => {
    // 🩸 Un `toContain` suelto no alcanza y esto se verificó por mutación:
    // borrar el filtro del pipeline plano lo dejaba pasar, porque el del
    // pipeline agrupado seguía ahí. Se cuentan los DOS.
    for (const [nombre, rel] of Object.entries(VISTAS)) {
      const veces = vivo(rel).split("precioEnFiltro(p.price, precio.desde, precio.hasta)").length - 1;
      expect(veces, nombre).toBe(2);
    }
  });

  it("cada vista deriva los precios de lo que YA tiene en memoria", () => {
    // 🔴 SIGUE HACIENDO FALTA AUNQUE LOS BOTONES SE HAYAN IDO (24-ago-2026):
    // de esta lista sale el "Lo más cercano: $16 o $17.50" del aviso. Sin
    // ella el aviso no tendría qué ofrecer y la pantalla volvería a parecer
    // rota. Lo que NO puede aparecer nunca es una consulta para conseguirla:
    // el precio lo manda Switch y esta pantalla solo filtra lo que ya cargó.
    for (const [nombre, rel] of Object.entries(VISTAS)) {
      const code = vivo(rel);
      expect(code, nombre).toContain("preciosDelCatalogo(products.map(p => p.price))");
      expect(code, nombre).toContain("preciosDisponibles={preciosDisponibles}");
      expect(code, nombre).not.toMatch(/fetch\([^)]*precio/i);
    }
  });

  it("los dos precios viajan en la URL ya validados", () => {
    for (const [nombre, rel] of Object.entries(VISTAS)) {
      const code = vivo(rel);
      expect(code, nombre).toContain('precioDeUrl(searchParams.get("precio_desde"))');
      expect(code, nombre).toContain('precioDeUrl(searchParams.get("precio_hasta"))');
      expect(code, nombre).toContain('params.set("precio_desde"');
      expect(code, nombre).toContain('params.set("precio_hasta"');
    }
  });
});

// ── El desplegable de tramos no vuelve ───────────────────────────────────────
describe("el desplegable de rangos de precio no vuelve", () => {
  it("no queda ni el tipo, ni las opciones, ni el <select> en el código VIVO", () => {
    // 🩸 Se BORRAN LOS COMENTARIOS PRIMERO: este archivo explica el retiro, y un
    // barrido de texto crudo se cumpliría con su propia explicación.
    const vivo = FUENTE
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n").filter(l => !l.trim().startsWith("//")).join("\n");
    expect(vivo).not.toContain("PRECIO_RANGO_OPTIONS");
    expect(vivo).not.toContain("PrecioRango");
    expect(vivo).not.toContain("Filtrar por precio");
    expect(vivo).not.toContain("Precio: todos");
  });

  it("ni la fila de botones de precio, ni la constante que decide cuántos mostrar", () => {
    // 🩸 Mismo barrido, mismos comentarios borrados PRIMERO: este archivo y el
    // componente explican el retiro nombrando justo lo retirado, y un barrido
    // de texto crudo se cumpliría con su propia explicación (ya pasó 4 veces).
    const vivo = FUENTE
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n").filter(l => !l.trim().startsWith("//")).join("\n");
    expect(vivo).not.toContain("PRECIOS_A_LA_VISTA");
    expect(vivo).not.toContain("Precios de este catálogo");
    expect(vivo).not.toContain("Ver los ");
    expect(vivo).not.toContain("Ver menos");
    expect(vivo).not.toContain("verTodos");
    expect(vivo).not.toContain("elegirPrecio");
    // Y el AVISO sigue vivo — es lo que NO se fue.
    expect(vivo).toContain("mensajeFiltroPrecio");
    expect(vivo).toContain('role="status"');
  });

  it("y no queda un solo llamador de la regla vieja en el código de la app", () => {
    // Barrido SIN lista de archivos: caza también la pantalla que alguien
    // escriba mañana. Los comentarios se borran antes, igual que arriba, y los
    // tests quedan fuera porque este mismo archivo nombra la regla vieja para
    // poder prohibirla.
    const raiz = path.join(process.cwd(), "src");
    const pendientes = [raiz];
    const culpables: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require("fs") as typeof import("fs");
    while (pendientes.length) {
      const dir = pendientes.pop()!;
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name !== "__tests__") pendientes.push(full);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(e.name)) continue;
        const vivo = fs.readFileSync(full, "utf8")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .split("\n").filter(l => !l.trim().startsWith("//")).join("\n");
        if (/\bprecioEnRango\b|\besPrecioRango\b|\bPRECIO_RANGO_OPTIONS\b/.test(vivo)) {
          culpables.push(path.relative(raiz, full));
        }
      }
    }
    expect(culpables).toEqual([]);
  });
});
