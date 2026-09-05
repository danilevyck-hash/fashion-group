/**
 * Candados de los dos textos que quedaron sueltos del PR #284 (auditoría de
 * copies). Son literales de JSX, así que se verifican leyendo la fuente — mismo
 * patrón que sw-static-cache-dpl.test.ts.
 *
 *  1. El pill de "última sincronización" tiene que decir lo mismo en TODAS las
 *     vistas que lo montan. Ventas (desktop y móvil) ya decían "Sincronizado";
 *     Comisiones se había quedado con el vocabulario viejo "Data actualizada al".
 *
 *     🔴 EL CANDADO CAMBIÓ DE DIRECCIÓN EL 4-sep-2026. Las dos vistas del
 *     Resumen (`ResumenView` y `ResumenViewMobile`) YA NO montan la píldora: la
 *     que tenían vigilaba 3 empresas de 8 (`SWITCH_FACTURAS_EMPRESA_KEYS`, una
 *     lista escrita a mano que se quedó atrás del cron) y pintaba de VERDE un
 *     Resumen con Vistana o Fashion Wear congeladas. Daniel: *«¿de qué sirve
 *     tenerlo si ya el sistema corre fluido y si no me avisa por Telegram para
 *     arreglarlo?»*. Quien avisa de verdad es `src/lib/datos-frescos.ts`, que
 *     DERIVA su lista de `empresasConFacturas()` — las 8 — y manda Telegram a
 *     las +24 h.
 *     Donde se EXIGÍA la píldora ahora se exige que NO esté, y va con CONTROL:
 *     el Resumen se sigue pintando (matriz, tarjetas y «Actualizar ahora»), o
 *     sea que borrar la vista entera no pasaría por verde. Comisiones SÍ la
 *     conserva y sigue con el vocabulario único.
 *  2. La UI no habla inglés: la sección de clientes de Multifashion decía
 *     "Wholesale". La columna de la DB sigue siendo `is_wholesale` — lo que
 *     cambia es lo que LEE la secretaria.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const root = join(__dirname, "..", "..", "..");
const src = (...p: string[]) => readFileSync(join(root, "src", ...p), "utf8");

const VISTAS_CON_PILL = [["components", "ventas", "ComisionesView.tsx"]];

/** Las dos caras del Resumen — la de escritorio y la de celular. */
const VISTAS_DEL_RESUMEN = [
  ["components", "ventas", "ResumenView.tsx"],
  ["components", "ventas", "ResumenViewMobile.tsx"],
];

describe("#284 · pill de sincronización con un solo vocabulario", () => {
  it("la vista que monta SyncStatus usa prefix=\"Sincronizado\"", () => {
    for (const p of VISTAS_CON_PILL) {
      const code = src(...p);
      expect(code, `${p.join("/")} monta SyncStatus`).toContain("<SyncStatus");
      expect(code, `${p.join("/")} usa el prefix nuevo`).toContain('prefix="Sincronizado"');
    }
  });

  it("nadie quedó con el vocabulario viejo \"Data actualizada\"", () => {
    for (const p of [...VISTAS_CON_PILL, ...VISTAS_DEL_RESUMEN]) {
      expect(src(...p), `${p.join("/")}`).not.toContain("Data actualizada");
    }
  });
});

describe("🔴 Ventas › Resumen ya NO lleva píldora de sincronización (4-sep-2026)", () => {
  it("ninguna de las dos caras del Resumen monta SyncStatus", () => {
    for (const p of VISTAS_DEL_RESUMEN) {
      const code = src(...p);
      expect(code, `${p.join("/")} no monta la píldora`).not.toContain("<SyncStatus");
      expect(code, `${p.join("/")} no importa SyncStatus`).not.toContain('from "@/components/shared/SyncStatus"');
    }
  });

  it("la lista de 3-de-8 no existe en ningún lado", () => {
    // Volver a escribirla es volver a vigilar un subconjunto: la lista real se
    // DERIVA (`empresasConFacturas()`), nunca se escribe a mano.
    const mapping = src("lib", "empresa-mapping.ts");
    expect(mapping).not.toContain("export const SWITCH_FACTURAS_EMPRESA_KEYS");
    for (const p of VISTAS_DEL_RESUMEN) {
      expect(src(...p), `${p.join("/")}`).not.toContain("SWITCH_FACTURAS_EMPRESA_KEYS");
    }
  });

  it("quien vigila las ventas son las 8 empresas, por Telegram", () => {
    // El CONTROL de que quitar la píldora no dejó las ventas sin vigilancia.
    const frescos = src("lib", "datos-frescos.ts");
    expect(frescos).toContain("empresasConFacturas()");
    expect(frescos).toContain("HORAS_DATO_VIEJO = 24");
  });

  it("CONTROL: el Resumen se sigue pintando", () => {
    // Sin esto, borrar la vista entera pasaría por verde.
    const desktop = src("components", "ventas", "ResumenView.tsx");
    expect(desktop).toContain("<SyncNowButton");
    expect(desktop).toContain("<FilaDetalleTr");
    expect(desktop).toContain("Total Grupo");
    const movil = src("components", "ventas", "ResumenViewMobile.tsx");
    expect(movil).toContain("<SyncNowButton");
    expect(movil).toContain("<MobileKpis");
    expect(movil).toContain("<MobileTarjetas");
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
