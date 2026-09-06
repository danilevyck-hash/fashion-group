// ─────────────────────────────────────────────────────────────────────────────
// LAS TRES PESTAÑAS DE VENTAS SE PARECEN ENTRE SÍ (5-sep-2026).
//
// Daniel las miró una al lado de la otra, en capturas de sus propias pantallas,
// y lo que encontró no fueron datos mal calculados: fueron TRES formas de hacer
// la misma cosa dentro del mismo módulo. Cada una obliga a aprender la pantalla
// de nuevo.
//
//  1. Un Excel por pestaña, ADENTRO — vive en `ventas-tres-pestanas.test.tsx`.
//  2. UN SOLO COLOR para el chip de ordenar. Era negro en Productos y verde en
//     Utilidad, a una pestaña de distancia. Dos colores para el mismo estado
//     enseñan que el color significa algo, y no significaba nada.
//  3. UNA SOLA FORMA DE ELEGIR. El Resumen de escritorio usaba cajas grises
//     escritas a mano, el del celular su propio `SegmentedRow` y Clientes
//     píldoras sueltas.
//  4. «Actualizar ahora» en las TRES. Estaba en Resumen y en Clientes; desde
//     Productos había que cambiar de pestaña para traer datos frescos.
//  5. NOMBRES CORTOS de empresa en todo el módulo (diccionario § 0, #4).
//  6. PORCENTAJES SIN DECIMAL (diccionario § 0, #5) y la plata negativa con el
//     signo DELANTE del símbolo (#6).
//  7. LAS LISTAS SE VEN ENTERAS. Daniel: *«no me gusta tener que andar poniendo
//     mas clientes abajo, ni productos, se deben de ver todo en una sola
//     lista»*. Utilidad mostraba 25 de 209 y Productos 20 de 140 — y una lista
//     paginada no se puede buscar con ⌘F, que es como Daniel la usa.
//  8. EL CELULAR NO SE QUEDA ATRÁS. `ResumenView` y `ResumenViewMobile` son dos
//     archivos separados y el celular YA se quedó atrás una vez: acá se exige
//     que muestren los MISMOS BLOQUES.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fmtMoney, fmtMoneyCompact, fmtPorcentaje } from "@/lib/ventas/format";
import { nombreCortoEmpresa } from "@/lib/empresa-mapping";

const raiz = path.resolve(__dirname, "../../..");
const leer = (rel: string) => readFileSync(path.join(raiz, rel), "utf8");
const plano = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const VISTAS = {
  resumen: "src/components/ventas/ResumenView.tsx",
  resumenMovil: "src/components/ventas/ResumenViewMobile.tsx",
  clientes: "src/components/ventas/ClientesView.tsx",
  productos: "src/components/ventas/ProductosView.tsx",
  utilidad: "src/components/ventas/UtilidadView.tsx",
} as const;

const fuentes = Object.fromEntries(
  Object.entries(VISTAS).map(([k, rel]) => [k, plano(leer(rel))]),
) as Record<keyof typeof VISTAS, string>;

// ─────────────────────────────────────────────────────────────────────────────
// 2 · UN SOLO CHIP DE ORDENAR
// ─────────────────────────────────────────────────────────────────────────────

describe("2 · 🩸 el chip de ordenar es UNO, de un solo color", () => {
  it("Productos y Utilidad montan el MISMO componente", () => {
    expect(fuentes.productos).toContain("TiraOrden");
    expect(fuentes.utilidad).toContain("TiraOrden");
  });

  it("ninguna de las dos se pinta su propio color de activo", () => {
    // El defecto exacto: `bg-gray-800` acá y `bg-teal-700` allá.
    expect(fuentes.productos).not.toContain("bg-gray-800");
    expect(fuentes.productos).not.toContain("data-orden-chip");
    expect(fuentes.utilidad).not.toContain("aria-pressed");
  });

  it("y el componente compartido tiene UN activo, en teal", () => {
    const chip = plano(leer("src/components/ventas/ChipOrden.tsx"));
    expect(chip).toContain("bg-teal-700");
    expect(chip).not.toContain("bg-gray-800");
    // 44 px táctiles: reemplaza al encabezado de columna cuando la tabla se
    // vuelve tarjetas, y errarle el dedo ordena por otra cosa.
    expect(chip).toContain("min-h-[44px]");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3 · UNA SOLA FORMA DE ELEGIR
// ─────────────────────────────────────────────────────────────────────────────

describe("3 · 🔴 un solo control segmentado en todo el módulo", () => {
  it("las tres pantallas que eligen una vista montan el MISMO control", () => {
    expect(fuentes.resumen).toContain("ControlSegmentado");
    expect(fuentes.resumenMovil).toContain("ControlSegmentado");
    expect(fuentes.clientes).toContain("ControlSegmentado");
  });

  it("🩸 y ninguna se dibuja las cajas grises escritas a mano de antes", () => {
    // La firma del control viejo del Resumen de escritorio.
    expect(fuentes.resumen).not.toContain('inline-flex rounded-full bg-gray-100 p-0.5');
    // Y el `SegmentedRow` propio del celular ya no existe.
    expect(fuentes.resumenMovil).not.toContain("function SegmentedRow");
  });

  it("🔴 las OPCIONES salen de UNA lista, no de dos copias", () => {
    // Escritorio y celular decían las mismas palabras, pero nada lo garantizaba.
    expect(fuentes.resumen).toContain("export const MODO_OPCIONES");
    expect(fuentes.resumenMovil).toContain("MODO_OPCIONES");
    expect(fuentes.resumenMovil).toContain("GRANULARIDAD_OPCIONES");
    // 🔴 Y las PASA tal cual, sin rearmarlas: la mutación barata es escribir
    // un array literal con las mismas palabras, que hoy coincide y mañana no.
    expect(fuentes.resumenMovil).toContain("options={MODO_OPCIONES}");
    expect(fuentes.resumenMovil).toContain("options={GRANULARIDAD_OPCIONES}");
    expect(fuentes.resumenMovil).not.toMatch(/value:\s*"trimestral"/);
    expect(fuentes.resumenMovil).not.toMatch(/label:\s*"Utilidad"/);
  });

  it("⚠️ las píldoras de EMPRESA se quedan como píldoras, y no es un olvido", () => {
    // Son SIETE opciones y envuelven en dos líneas: un segmentado de siete a
    // 390 px aprieta los nombres hasta partirlos. No son la misma clase de
    // control.
    expect(fuentes.clientes).toContain("EMPRESA_PILLS");
    expect(fuentes.clientes).toContain("flex flex-wrap gap-1.5");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4 · «ACTUALIZAR AHORA» EN LAS TRES
// ─────────────────────────────────────────────────────────────────────────────

describe("3b · 🔴 la píldora de empresa y el alcance viven en Utilidad también", () => {
  it("la píldora filtra el modo Utilidad, no solo el de Ventas", () => {
    // Sin esto, elegir «Fashion Wear» filtraba la lista de Ventas y dejaba la de
    // Utilidad con las seis: la misma píldora diciendo dos cosas.
    expect(fuentes.utilidad).toContain('empresaFiltro !== "todas"');
    expect(fuentes.utilidad).toContain("c.empresaKey === empresaFiltro");
    expect(fuentes.clientes).toContain("empresaFiltro={empresa}");
  });

  it("🔴 y el alcance «6 empresas» se dice EN PANTALLA, con su ancla", () => {
    // Escondido en un ⓘ, el que no lo abre se queda pensando que faltan dos
    // empresas de plata.
    expect(fuentes.utilidad).toContain("data-alcance-utilidad");
    expect(fuentes.utilidad).toContain("alcanceEmpresas(data.empresas)");
    expect(fuentes.utilidad).toContain("Boston y Multifashion no llevan utilidad");
    // Y ya no hay ayuda que abrir para enterarse.
    expect(fuentes.utilidad).not.toContain("<Ayuda");
  });
});

describe("4 · 🔴 «Actualizar ahora» está en las TRES pestañas", () => {
  it("Resumen, Clientes y Productos, con la MISMA secuencia", () => {
    for (const k of ["resumen", "resumenMovil", "clientes", "productos"] as const) {
      expect(fuentes[k], `${k} se quedó sin «Actualizar ahora»`).toContain("SyncNowButton");
      expect(fuentes[k], `${k} usa otra secuencia`).toContain("SYNC_NOW_VENTAS_SECUENCIA");
    }
  });

  it("y va `secuencial` — Switch admite UNA sesión por empresa a la vez", () => {
    for (const k of ["resumen", "clientes", "productos"] as const) {
      expect(fuentes[k]).toMatch(/SYNC_NOW_VENTAS_SECUENCIA\}\s+secuencial/);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5 · NOMBRES CORTOS
// ─────────────────────────────────────────────────────────────────────────────

describe("5 · el nombre de la empresa es el CORTO (diccionario § 0, #4)", () => {
  it("«Vistana», no «Vistana International»; «Boston», no «Confecciones Boston»", () => {
    expect(nombreCortoEmpresa("vistana")).toBe("Vistana");
    expect(nombreCortoEmpresa("confecciones_boston")).toBe("Boston");
    // Una clave que no está en el mapa no rompe la fila.
    expect(nombreCortoEmpresa("inventada")).toBe("inventada");
  });

  it("las cuatro vistas lo leen de la MISMA lista, no de un mapa propio", () => {
    for (const k of ["resumen", "resumenMovil", "clientes", "productos", "utilidad"] as const) {
      expect(fuentes[k], `${k} no usa el nombre corto`).toMatch(/nombreCortoEmpresa|nombreEmpresaEnPantalla/);
    }
    // 🔴 Y nadie escribe el nombre largo a mano — el diccionario encontró TRES
    // mapas de nombres para las mismas 8 empresas que no decían lo mismo, y un
    // cuarto habría sido exactamente el problema que se vino a arreglar.
    for (const k of ["clientes", "utilidad"] as const) {
      expect(fuentes[k]).not.toContain("Vistana International");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6 · PORCENTAJES Y PLATA
// ─────────────────────────────────────────────────────────────────────────────

describe("6 · el formato de los números lo decide UNA función por cosa", () => {
  it("🔴 el porcentaje va sin decimal, y redondea (no trunca)", () => {
    expect(fmtPorcentaje(0.287332)).toBe("29%");   // el margen del grupo
    expect(fmtPorcentaje(0.313)).toBe("31%");
    expect(fmtPorcentaje(0.197)).toBe("20%");
    expect(fmtPorcentaje(-0.123)).toBe("−12%");
    expect(fmtPorcentaje(null)).toBe("—");
    // −0,2 % redondea a 0 y NO se pinta «−0%», que se lee como una caída.
    expect(fmtPorcentaje(-0.002)).toBe("0%");
  });

  it("🔴 la plata negativa lleva el signo DELANTE del símbolo", () => {
    expect(fmtMoney(-100)).toBe("−$100.00");
    expect(fmtMoney(1_234.5)).toBe("$1,234.50");
    expect(fmtMoneyCompact(-1_234)).toBe("−$1,234");
    // Y `Math.round(-0.4)` da `-0`: no puede imprimirse «−$0».
    expect(fmtMoneyCompact(-0.4)).toBe("$0");
  });

  it("⚠️ nadie del módulo vuelve a escribir `(x * 100).toFixed(1) + \"%\"`", () => {
    // Es lo que hacía que el mismo margen saliera «28.7%» en una pestaña y
    // «28.73%» en otra. La multiplicación vive en `fmtPorcentaje` y en ningún
    // otro lado.
    const infractores: string[] = [];
    for (const [k, rel] of Object.entries(VISTAS)) {
      if (/\(\s*\w+(?:\.\w+)*\s*\*\s*100\s*\)\.toFixed\(1\)\s*\+\s*"%"/.test(fuentes[k as keyof typeof VISTAS])) {
        infractores.push(rel);
      }
    }
    expect(infractores).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7 · LAS LISTAS SE VEN ENTERAS
// ─────────────────────────────────────────────────────────────────────────────

describe("7 · 🔴 no queda un «Mostrar más» en ninguna lista", () => {
  it("ni el botón ni la paginación que lo alimentaba", () => {
    for (const k of ["clientes", "productos", "utilidad"] as const) {
      expect(fuentes[k], `${k} todavía pagina`).not.toContain("Mostrar más");
      // 🔴 Cualquier ventana sobre la lista, no solo la variable `visible` que
      // había: cambiarla por un número literal es la forma más barata de que
      // la paginación vuelva sin que nadie lo note.
      expect(fuentes[k], `${k} conserva una ventana sobre la lista`).not.toMatch(/rows\.slice\(\s*0\s*,/);
      expect(fuentes[k], `${k} conserva el estado de paginación`).not.toMatch(/setVisible|const PAGE\b/);
    }
  });

  it("⚠️ y el plegable de los clientes en cero NO es paginación", () => {
    // Es lo contrario: agrupa cien renglones idénticos («$0.00 / −100%») que
    // hacían parecer rota la lista, los cuenta y los deja a UN toque. La lista
    // de los que SÍ compraron se ve entera.
    expect(fuentes.clientes).toContain("data-clientes-en-cero");
    expect(fuentes.clientes).toContain("bloques.conCompras.map");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8 · EL CELULAR NO SE QUEDA ATRÁS
// ─────────────────────────────────────────────────────────────────────────────

describe("8 · 🔴 las DOS vistas del Resumen muestran los mismos bloques", () => {
  // ⚠️ `ResumenView` (1.110 líneas) y `ResumenViewMobile` (893) son dos archivos
  // SEPARADOS y el celular ya se quedó atrás una vez. Fusionarlos es un cambio
  // grande y no está aprobado; mientras tanto, este candado exige que los
  // bloques no se separen. Qué falta para fusionarlos está en el reporte.
  const BLOQUES: { nombre: string; escritorio: RegExp; celular: RegExp }[] = [
    { nombre: "tarjeta de Ventas netas",  escritorio: /ventasNetasYTD/,            celular: /ventasNetasYTD/ },
    { nombre: "tarjeta de Utilidad",      escritorio: /utilidadYTD/,               celular: /utilidadYTD/ },
    { nombre: "tarjeta de Margen",        escritorio: /margenYTD/,                 celular: /margenYTD/ },
    { nombre: "tarjeta Cierre del año",   escritorio: /CIERRE DEL AÑO/,            celular: /Cierre del año/ },
    { nombre: "explicación del cierre",   escritorio: /explicacionProyeccionGrupo/, celular: /explicacionProyeccionGrupo/ },
    { nombre: "control Ventas/Utilidad/Margen", escritorio: /MODO_OPCIONES/,       celular: /MODO_OPCIONES/ },
    { nombre: "control Mensual/Trim/Anual",     escritorio: /GRANULARIDAD_OPCIONES/, celular: /GRANULARIDAD_OPCIONES/ },
    { nombre: "vista Anual",              escritorio: /<ResumenAnual/,             celular: /<ResumenAnual/ },
    { nombre: "proyección por empresa",   escritorio: /buildSlotsProyeccion/,      celular: /buildSlotsProyeccion/ },
    { nombre: "detalle de la celda",      escritorio: /buildSlotsMetrica/,         celular: /buildSlotsMetrica/ },
    { nombre: "nota de mayoreo de Multifashion", escritorio: /multiMayoreoNota/,   celular: /multiMayoreoNota/ },
    { nombre: "Actualizar ahora",         escritorio: /SyncNowButton/,             celular: /SyncNowButton/ },
    { nombre: "nombre corto de empresa",  escritorio: /nombreEmpresaEnPantalla/,   celular: /nombreEmpresaEnPantalla/ },
  ];

  for (const b of BLOQUES) {
    it(`«${b.nombre}» está en las dos`, () => {
      expect(b.escritorio.test(fuentes.resumen), `falta en el ESCRITORIO`).toBe(true);
      expect(b.celular.test(fuentes.resumenMovil), `falta en el CELULAR`).toBe(true);
    });
  }

  it("🔴 el celular NO abrevia la plata en millones (diccionario § 0, #7)", () => {
    // Decía «$6.27M» donde el escritorio decía «$6,270,375.73»: el mismo total
    // con dos caras según la pantalla. `formatCompactCurrency` (la que pone la
    // «M») ya no se usa acá.
    expect(fuentes.resumenMovil).not.toContain("formatCompactCurrency");
    expect(fuentes.resumenMovil).toContain("fmtMoney(");
  });

  it("⚠️ la PROYECCIÓN sí va redondeada, en las dos, y a propósito", () => {
    // Es una estimación: darle centavos la haría parecer medida.
    expect(fuentes.resumen).toContain("fmtMoneyCompact(data.proyeccion!.totales_grupo.proyeccion_cierre)");
    expect(fuentes.resumenMovil).toContain("fmtMoneyCompact(proy.totales_grupo.proyeccion_cierre)");
  });
});
