// Candado del buscador que ignora espacios, acentos y mayúsculas.
//
// El caso que lo originó es literal: Daniel escribió "multifashion" en Clientes
// y no encontró a "Multi Fashion Holding" (D-108). Los números de este archivo
// están medidos contra producción el 27-jul-2026
// (scripts/_probe-clientes-buscar.ts y _probe-clientes-ytd-volumen.ts).

import { describe, it, expect } from "vitest";
import {
  normalizarBusqueda,
  coincideBusqueda,
  LARGO_MINIMO_SUBSTRING,
} from "@/lib/buscar-normalizado";

const D108 = ["Multi Fashion Holding", "Multi Fashion Holding, S.A.", "D-108"];

describe("normalizarBusqueda", () => {
  it("deja sólo letras y números, en minúscula", () => {
    expect(normalizarBusqueda("Multi Fashion Holding")).toBe("multifashionholding");
    expect(normalizarBusqueda("D-108")).toBe("d108");
    expect(normalizarBusqueda("  Multi   Fashion  ")).toBe("multifashion");
    expect(normalizarBusqueda("Millenium / David")).toBe("milleniumdavid");
    expect(normalizarBusqueda("Grup M.E.L. International, S.A.")).toBe("grupmelinternationalsa");
  });

  it("quita acentos y trata la ñ como letra propia", () => {
    expect(normalizarBusqueda("Peña")).toBe("pena");
    expect(normalizarBusqueda("PEÑA")).toBe("pena");
    expect(normalizarBusqueda("Almacén")).toBe("almacen");
    expect(normalizarBusqueda("ALMACÉN")).toBe("almacen");
    // Escrito con y sin tilde tiene que dar lo mismo en las dos direcciones.
    expect(normalizarBusqueda("Bazár")).toBe(normalizarBusqueda("Bazar"));
  });

  it("es tolerante con null/undefined/vacío", () => {
    expect(normalizarBusqueda(null)).toBe("");
    expect(normalizarBusqueda(undefined)).toBe("");
    expect(normalizarBusqueda("   ")).toBe("");
  });
});

describe("el caso de Daniel: multifashion → Multi Fashion Holding", () => {
  // Estas cuatro son las que fallaban o funcionaban ANTES del arreglo:
  //   "multifashion"  → 0 resultados      "multi fashion" → 1 (D-108)
  //   "MULTIFASHION"  → 0 resultados      "d108"          → 0 resultados
  it.each([
    ["multifashion"],
    ["multi fashion"],
    ["MULTIFASHION"],
    ["Multi Fashion"],
    ["  multi   fashion  "],
    ["multifashionholding"],
    ["fashion holding"],
    ["D-108"],
    ["d108"],
    ["d-108"],
    ["D 108"],
  ])("encuentra a D-108 escribiendo %j", (consulta) => {
    expect(coincideBusqueda(consulta, D108)).toBe(true);
  });

  it("no lo encuentra con un texto que no tiene nada que ver", () => {
    expect(coincideBusqueda("zapateria", D108)).toBe(false);
    expect(coincideBusqueda("D-109", D108)).toBe(false);
  });
});

describe("busca también por razón social", () => {
  // Medido: 84 de los 149 clientes vivos tienen razón social distinta del
  // nombre. "Millenium / David" factura como "Grupo Irmode De Panama, S.A".
  const millenium = ["Millenium / David", "Grupo Irmode De Panama, S.A", "D-105"];

  it("encuentra por el nombre de fantasía", () => {
    expect(coincideBusqueda("millenium", millenium)).toBe(true);
  });

  it("encuentra por la razón social, que antes no se miraba", () => {
    expect(coincideBusqueda("irmode", millenium)).toBe(true);
    expect(coincideBusqueda("grupo irmode", millenium)).toBe(true);
  });
});

describe("1-2 letras no devuelven el directorio entero", () => {
  // Con substring, "a" matchea 142 de 149 clientes y "sa" 115: es lo mismo que
  // no buscar. Con 1-2 caracteres se exige que estén al PRINCIPIO.
  const conA = ["Almacen Flash", "Faty S.A.", "D-7"];
  const conAEnElMedio = ["Bazar Palestina", "Bazar Palestina S.A.", "D-11"];

  it("con 1 letra sólo matchea si el campo empieza así", () => {
    expect(coincideBusqueda("a", conA)).toBe(true);              // "Almacen…"
    expect(coincideBusqueda("a", conAEnElMedio)).toBe(false);    // "Bazar" tiene 'a', pero no arranca
  });

  it("con 2 letras sólo matchea si el campo empieza así", () => {
    expect(coincideBusqueda("al", conA)).toBe(true);
    expect(coincideBusqueda("az", conAEnElMedio)).toBe(false);   // "bAZar"
  });

  it("desde 3 letras vale el substring, que es lo que la gente espera", () => {
    expect(LARGO_MINIMO_SUBSTRING).toBe(3);
    expect(coincideBusqueda("aza", conAEnElMedio)).toBe(true);   // "bAZAr"
    expect(coincideBusqueda("fashion", D108)).toBe(true);        // "Multi FASHION Holding"
  });

  it("el corte se mide sobre el texto YA normalizado, no sobre lo tecleado", () => {
    // "D-1" son 3 caracteres tecleados pero "d1" normalizado → regla de prefijo.
    expect(coincideBusqueda("D-1", ["Almacen Flash", null, "D-108"])).toBe(true);
    expect(coincideBusqueda("D-1", ["Almacen Flash", null, "D-7"])).toBe(false);
  });
});

describe("Ventas → Clientes: buscar alcanza a los huérfanos", () => {
  // 🩸 La búsqueda corría sólo sobre `masters` (universe.filter(c => !c.isOrphan)):
  // los clientes sin match en clientes_master quedaban colapsados en "Otros
  // clientes (N)" e eran imposibles de encontrar escribiendo su nombre. Medido
  // el 27-jul-2026: 7 clientes con compras en 12 meses estaban en ese pozo.
  const fs = require("node:fs") as typeof import("node:fs");
  const path = require("node:path") as typeof import("node:path");
  const vistaCruda = fs.readFileSync(
    path.join(__dirname, "..", "..", "components/ventas/ClientesView.tsx"), "utf8");
  // 🔴 SIN COMENTARIOS. Un comentario que NOMBRA lo que se retiró —para
  // explicar por qué se retiró— no es la cosa retirada, y este repo ya pagó
  // varias veces el candado que se cumple con su propia explicación.
  const vista = vistaCruda
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("la búsqueda incluye a los huérfanos, no sólo a los masters", () => {
    // 🔁 5-sep-2026: ya no hace falta unir dos listas porque **ya no hay dos**.
    // Los huérfanos dejaron de colapsarse en una fila agregada y entran a la
    // lista como cualquier cliente (Daniel: *«si y si»*), así que la búsqueda
    // corre sobre el universo entero. Lo que este test vigila es lo mismo de
    // siempre: que un huérfano se pueda encontrar escribiendo su nombre.
    expect(vista).toContain("let r = universe.slice();");
    expect(vista).toContain("r = r.filter(c => coincideBusqueda(search, [c.nombre, c.id]));");
    // CONTROL: los huérfanos siguen ENTRANDO al universo (no se los filtra
    // antes de buscar), que es lo que hacía el pozo.
    expect(vista).not.toMatch(/const\s+masters\s*=\s*universe\.filter/);
  });

  it("ya no compara con toLowerCase()/includes() a mano", () => {
    expect(vista).not.toContain("c.nombre.toLowerCase().includes(q)");
  });

  it("🔁 la fila agregada 'Otros clientes' ya no existe: sus clientes se listan", () => {
    // Decía que con búsqueda activa la fila agregada no se empujaba a la lista.
    // Desde el 5-sep-2026 no hay fila agregada NI diálogo: esos ocho clientes
    // van en la lista, bajo un renglón que los separa y los cuenta. La razón es
    // la misma que la de este archivo — un cliente escondido detrás de un clic
    // es un cliente que no se encuentra.
    expect(vista).not.toContain("otrosRow");
    expect(vista).not.toContain("OtrosClientesDialog");
    expect(vista).toContain("bloques.huerfanos");
    // CONTROL — con búsqueda activa NADA se pliega: ni los huérfanos ni los
    // clientes en cero. Quien escribe un nombre quiere encontrarlo.
    expect(vista).toContain("(buscando || c.ytd > 0)");
    expect(vista).toContain("const enCero = buscando ? [] :");
  });

  it("usa el MISMO normalizador que el módulo Clientes", () => {
    expect(vista).toMatch(/import \{ coincideBusqueda \} from "@\/lib\/buscar-normalizado"/);
  });
});

describe("consulta vacía y campos vacíos", () => {
  it("sin consulta no filtra nada", () => {
    expect(coincideBusqueda("", D108)).toBe(true);
    expect(coincideBusqueda("   ", D108)).toBe(true);
    expect(coincideBusqueda(null, D108)).toBe(true);
  });

  it("un cliente sin ningún campo no matchea una consulta real", () => {
    expect(coincideBusqueda("algo", [null, undefined, ""])).toBe(false);
  });
});
