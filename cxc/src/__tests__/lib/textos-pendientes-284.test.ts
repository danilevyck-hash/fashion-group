/**
 * Candados de los dos textos que quedaron sueltos del PR #284 (auditoría de
 * copies). Son literales de JSX, así que se verifican leyendo la fuente — mismo
 * patrón que sw-static-cache-dpl.test.ts.
 *
 *  1. El pill de "última sincronización" tiene que decir lo mismo en TODAS las
 *     vistas que lo montan. Ventas (desktop y móvil) ya decían "Sincronizado";
 *     Comisiones se había quedado con el vocabulario viejo "Data actualizada al".
 *  2. La UI no habla inglés: la sección de clientes de Multifashion decía
 *     "Wholesale". La columna de la DB sigue siendo `is_wholesale` — lo que
 *     cambia es lo que LEE la secretaria.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const root = join(__dirname, "..", "..", "..");
const src = (...p: string[]) => readFileSync(join(root, "src", ...p), "utf8");

const VISTAS_CON_PILL = [
  ["components", "ventas", "ComisionesView.tsx"],
  ["components", "ventas", "ResumenView.tsx"],
  ["components", "ventas", "ResumenViewMobile.tsx"],
];

describe("#284 · pill de sincronización con un solo vocabulario", () => {
  it("las 3 vistas que montan SyncStatus usan prefix=\"Sincronizado\"", () => {
    for (const p of VISTAS_CON_PILL) {
      const code = src(...p);
      expect(code, `${p.join("/")} monta SyncStatus`).toContain("<SyncStatus");
      expect(code, `${p.join("/")} usa el prefix nuevo`).toContain('prefix="Sincronizado"');
    }
  });

  it("nadie quedó con el vocabulario viejo \"Data actualizada\"", () => {
    for (const p of VISTAS_CON_PILL) {
      expect(src(...p), `${p.join("/")}`).not.toContain("Data actualizada");
    }
  });
});

describe("#284 · Multifashion → Clientes en español", () => {
  const code = src("components", "multifashion", "ClientesMultifashionSubtab.tsx");

  it("la sección se titula Mayoreo, no Wholesale", () => {
    expect(code).toContain('title="Mayoreo"');
    expect(code).not.toContain('title="Wholesale"');
  });

  it("el mensaje de vacío concuerda en español (\"clientes de mayoreo\")", () => {
    expect(code).toContain("No hay clientes de mayoreo en ${periodoStr}.");
    expect(code).not.toContain("clientes wholesale");
  });

  it("no queda ningún literal de UI en inglés con \"Wholesale\"", () => {
    // Se permite el identificador técnico (is_wholesale, WholesaleResp, la ruta
    // /api/multifashion/clientes-wholesale): lo prohibido es el texto visible.
    const literalesUI = [...code.matchAll(/(?:title|emptyText|subtitle)=\{?[`"'][^`"']*[Ww]holesale/g)];
    expect(literalesUI.map((m) => m[0])).toEqual([]);
  });
});
