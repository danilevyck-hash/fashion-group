/**
 * CANDADO del "Atrás fluido" (12-ago-2026).
 *
 * 🩸 El caso que lo originó: /marketing → tocar el bloque de Tommy → Atrás
 * caía en el Inicio ("/") en vez de volver a /marketing. La causa era que
 * navegar() usaba router.replace para el DRILL-DOWN: entrar a la marca PISABA
 * la entrada /marketing del historial, así que Atrás se la saltaba entera.
 *
 * La convención del sistema (CLAUDE.md › "Navegación e Historial"):
 *   - Drill-down a un nivel más profundo → push (deja entrada; Atrás deshace
 *     UN nivel, espejo del breadcrumb).
 *   - Filtro / tab / sort en el MISMO nivel → replace (Atrás no cicla tabs).
 *   - Toda vista principal (tab de módulo, detalle) tiene URL propia →
 *     sobrevive refresh y se puede compartir.
 *
 * Este test es estático: lee los archivos, no ejecuta las pantallas.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const leer = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("Marketing: el drill-down APILA historial", () => {
  const fuente = leer("src/app/marketing/page.tsx");

  it("navegar() usa router.push (con replace, Atrás desde la marca caía en Inicio)", () => {
    // La función navegar es la única puerta de navegación interna del módulo.
    const navegar = fuente.slice(
      fuente.indexOf("const navegar"),
      fuente.indexOf("const refrescar"),
    );
    expect(navegar).toContain("router.push(");
    expect(navegar).not.toContain("router.replace(");
  });

  it("el único router.replace que queda es el redirect de enlaces viejos (papelera/anulados)", () => {
    const usos = fuente.split("router.replace(").length - 1;
    expect(usos).toBe(1);
    // Y está en el efecto del redirect legacy, no en la navegación normal.
    const idx = fuente.indexOf("router.replace(");
    const contexto = fuente.slice(Math.max(0, idx - 400), idx);
    expect(contexto).toContain("papelera");
  });
});

describe("Tabs principales con URL propia (sobreviven refresh, se comparten)", () => {
  const casos: Array<[string, string]> = [
    // [archivo, firma que prueba que el tab vive en la URL]
    ["src/app/cxc/page.tsx", 'useUrlState<"grupo" | "boston">("tab"'],
    ["src/app/asistencia/AsistenciaClient.tsx", 'useUrlState<Tab>("tab"'],
    ["src/app/productos/cargar/page.tsx", 'useUrlState<Tab>("tab"'],
    ["src/app/ventas/VentasShell.tsx", 'useUrlState("tab"'],
    ["src/components/multifashion/MultifashionView.tsx", 'useUrlState("subtab"'],
    ["src/app/catalogos/admin/[marca]/AdminCatalogoClient.tsx", 'useUrlState<Tab>("tab"'],
    ["src/app/marketing/components/ReportesTabs.tsx", 'useUrlState<Tab>("rep"'],
  ];

  for (const [rel, firma] of casos) {
    it(`${rel} guarda su pestaña en la URL`, () => {
      const fuente = leer(rel);
      expect(fuente).toContain(firma);
      // Y no puede volver al useState puro que el refresh se come. (Se busca la
      // firma exacta del tab; otros useState del archivo — p.ej. formulasScope
      // del Depurador — no son pestañas de navegación y quedan fuera.)
      expect(fuente).not.toMatch(/\[tab(?:Raw)?, setTab\] = useState/);
    });
  }

  it("un ?tab= desconocido cae en la pestaña por defecto, nunca en blanco", () => {
    // Los tres convertidos hoy validan el valor crudo antes de usarlo.
    //
    // El CXC lo hace desde el 14-ago-2026 con `tabCxcPermitida`, que además de
    // caer al grupo ante un valor desconocido mira el ROL: la pestaña de Boston
    // solo la puede leer admin/secretaria, así que un link con `?tab=boston`
    // tampoco puede dejar a un vendedor parado ahí. Lo que la función devuelve,
    // caso por caso, lo prueba `cxc-boston-permiso.test.ts`.
    expect(leer("src/app/cxc/page.tsx")).toContain("tabCxcPermitida(tabRaw, userRole)");
    // ⚠️ Asistencia validaba contra `TABS` y desde el 26-ago-2026 valida contra
    // `visibles` — el candado se ENDURECIÓ, no se aflojó: Aprobaciones solo la
    // ve quien puede aprobar, así que un `?tab=aprobaciones` en manos de la
    // contadora tampoco puede dejarla parada en una pestaña que no le toca.
    // Es el MISMO movimiento que hizo el CXC con `tabCxcPermitida` y Boston.
    expect(leer("src/app/asistencia/AsistenciaClient.tsx")).toContain('visibles.some(([k]) => k === tabRaw)');
    // El Depurador resuelve el ?tab= en un módulo puro desde el rediseño de 3
    // pestañas (4-sep-2026): un valor desconocido cae en "plantilla" y un
    // ?tab= VIEJO (depurador, misfotos, historial…) redirige a su pestaña
    // nueva en vez de romper el enlace guardado.
    expect(leer("src/app/productos/cargar/page.tsx")).toContain("resolverTab(tabRaw");
    const pestanas = leer("src/app/productos/cargar/pestanas.ts");
    expect(pestanas).toContain("PESTANAS.some((p) => p.id === tabRaw)");
    expect(pestanas).toContain('viejo?.tab ?? "plantilla"');
    // Ventas se sumó al retirar la pestaña Referencia (12-ago-2026): sin este
    // filtro, un favorito de `?tab=referencia` dejaba la pantalla EN BLANCO
    // (Radix no dibuja nada con un value sin trigger). Ese enlace además
    // redirige a /referencia en next.config.js; esto es la red de abajo.
    expect(leer("src/app/ventas/VentasShell.tsx")).toContain("TABS.some((t) => t === tabRaw)");
  });
});

describe("useUrlState conserva la convención push/replace", () => {
  const hook = leer("src/lib/hooks/useUrlState.ts");

  it("default replace (filtros/tabs no ensucian el historial) + push opcional (drill-down)", () => {
    expect(hook).toContain('options?.history === "push"');
    expect(hook).toContain("router.push(url, { scroll: false })");
    expect(hook).toContain("router.replace(url, { scroll: false })");
  });
});
