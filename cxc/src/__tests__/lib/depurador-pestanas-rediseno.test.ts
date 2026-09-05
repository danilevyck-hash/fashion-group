// ─────────────────────────────────────────────────────────────────────────────
// CANDADO — el Depurador tiene 3 pestañas y los enlaces viejos no se rompen
// (4-sep-2026, rediseño aprobado por Daniel).
//
//   Plantilla ............ Nuevo · Historial
//   Tallas y catálogo .... Tallas por bulto · Fotos a mi Excel
//   Configuración ........ Fórmulas · Descripciones (solo admin) · Reglas
//
// Lo que se vigila sobre el módulo puro (resolverTab, pestanas.ts):
//   · las 3 pestañas y sus vistas, con la primera como default;
//   · TODO ?tab= viejo (las 7 pestañas de antes) redirige a su pestaña nueva;
//   · un valor desconocido cae en «Plantilla», nunca en blanco;
//   · «Descripciones» es solo admin: para secretaria cae a «Fórmulas»;
//   · nada se borró: los componentes son los mismos, cambió dónde cuelgan.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  PESTANAS,
  VISTAS_POR_TAB,
  TAB_VIEJO_A_NUEVO,
  resolverTab,
} from "@/app/productos/cargar/pestanas";

const leer = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

describe("las 3 pestañas y sus vistas", () => {
  it("son exactamente Plantilla · Tallas y catálogo · Configuración", () => {
    expect(PESTANAS.map((p) => p.id)).toEqual(["plantilla", "tallas", "config"]);
    expect(PESTANAS.map((p) => p.label)).toEqual(["Plantilla", "Tallas y catálogo", "Configuración"]);
  });

  it("cada pestaña tiene sus vistas, con la primera como default", () => {
    expect(VISTAS_POR_TAB.plantilla.map((v) => v.id)).toEqual(["nuevo", "historial"]);
    expect(VISTAS_POR_TAB.tallas.map((v) => v.id)).toEqual(["curvas", "misfotos"]);
    expect(VISTAS_POR_TAB.config.map((v) => v.id)).toEqual(["formulas", "descripciones", "reglas"]);
    // «Descripciones» sigue siendo SOLO admin, como cuando colgaba de Fórmulas.
    expect(VISTAS_POR_TAB.config.find((v) => v.id === "descripciones")?.soloAdmin).toBe(true);
  });

  it("una pestaña nueva válida pasa tal cual, sin marca de redirección", () => {
    expect(resolverTab("tallas", "misfotos", false)).toEqual({ tab: "tallas", vista: "misfotos", redirigido: false });
    expect(resolverTab("plantilla", "", false)).toEqual({ tab: "plantilla", vista: "nuevo", redirigido: false });
  });
});

describe("🔴 los ?tab= viejos redirigen (enlaces guardados no se rompen)", () => {
  // Las 7 pestañas que existían hasta el 4-sep-2026, TODAS cubiertas.
  const VIEJAS: Record<string, { tab: string; vista: string }> = {
    depurador: { tab: "plantilla", vista: "nuevo" },
    misfotos: { tab: "tallas", vista: "misfotos" },
    facturas: { tab: "plantilla", vista: "nuevo" },
    curvas: { tab: "tallas", vista: "curvas" },
    formulas: { tab: "config", vista: "formulas" },
    reglas: { tab: "config", vista: "reglas" },
    historial: { tab: "plantilla", vista: "historial" },
  };

  it("cada pestaña vieja tiene su destino nuevo", () => {
    expect(Object.keys(TAB_VIEJO_A_NUEVO).sort()).toEqual(Object.keys(VIEJAS).sort());
    for (const [viejo, destino] of Object.entries(VIEJAS)) {
      const r = resolverTab(viejo, "", false);
      expect({ viejo, tab: r.tab, vista: r.vista, redirigido: r.redirigido })
        .toEqual({ viejo, tab: destino.tab, vista: destino.vista, redirigido: true });
    }
  });

  it("un ?tab= desconocido cae en Plantilla › Nuevo, nunca en blanco", () => {
    expect(resolverTab("", "", false)).toEqual({ tab: "plantilla", vista: "nuevo", redirigido: false });
    expect(resolverTab("cualquier-cosa", "", false)).toEqual({ tab: "plantilla", vista: "nuevo", redirigido: false });
  });

  it("una vista que no es de esa pestaña cae a la primera", () => {
    expect(resolverTab("tallas", "historial", false).vista).toBe("curvas");
    expect(resolverTab("config", "nuevo", false).vista).toBe("formulas");
  });

  it("«Descripciones» para quien no es admin cae a «Fórmulas»; para admin abre", () => {
    expect(resolverTab("config", "descripciones", false).vista).toBe("formulas");
    expect(resolverTab("config", "descripciones", true).vista).toBe("descripciones");
  });
});

describe("nada se borró: los componentes son los mismos, cambia dónde cuelgan", () => {
  it("la página sigue montando los 7 componentes de siempre", () => {
    const page = leer("src/app/productos/cargar/page.tsx");
    for (const comp of [
      "DepuradorDispatcher", "HistorialView", "CurvasView", "MiExcelFotosClient",
      "FormulasConfig", "CatalogoDescripcionesAdmin", "ReglasView",
    ]) {
      expect(page, `${comp} desapareció de la página`).toContain(`<${comp}`);
    }
    // Facturas Tienda vive dentro del dispatcher (ya no es pestaña).
    expect(leer("src/app/productos/cargar/DepuradorDispatcher.tsx")).toContain("<FacturasTiendaClient");
  });

  it("los caminos ya no se nombran como pestañas y el ámbito de fórmulas conserva sus dos lados", () => {
    const page = leer("src/app/productos/cargar/page.tsx");
    expect(page).toContain("Depurador (importación)");
    expect(page).toContain("Tienda (facturas)");
  });
});
