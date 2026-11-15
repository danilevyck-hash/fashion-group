// Revisión 110 · segunda revisión en vivo (15-nov-2026). Candados de los
// interruptores de `revision-110-vivo2.ts`: todos prendidos y enchufados donde
// dicen. La medida de pantalla se hizo con Playwright contra el build local.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as vivo2 from "@/lib/ui/revision-110-vivo2";

const leer = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");

describe("revisión 110 · en vivo 2", () => {
  it("todos los interruptores están prendidos", () => {
    for (const [k, v] of Object.entries(vivo2)) expect([k, v]).toEqual([k, true]);
  });

  it("01 · Asistencia: hay un punto de corte (espacio de ancho cero) antes de cada distintivo", () => {
    const src = leer("app/asistencia/ReporteTab.tsx");
    // «17:00» + «2 días…» es dígito con dígito: sin esto la línea no se parte.
    expect(src.match(/DISTINTIVO_CON_ESPACIO && "\\u200B"/g)?.length).toBe(4);
  });

  it("02 / 03 · Comisiones: «Comisión $X» y «Descuento $Y» cada uno en su línea, sin recortar el monto", () => {
    for (const f of ["components/comisiones/ComisionesConsolidadoView.tsx", "components/comisiones/ComisionesTarjetas.tsx"]) {
      const src = leer(f);
      // En la tabla, sin partirse desde xl (en el iPad la línea puede partirse y la tabla sigue cabiendo).
      expect(src).toMatch(/whitespace-nowrap">Comisión \{fmtMoney\(desglose\.bruto\)\}/);
      expect(src).toMatch(/whitespace-nowrap">Descuento \{fmtMoney\(desglose\.descuento\)\}/);
    }
  });

  it("04 · Multifashion: la barra del período se pega por la única puerta, debajo del encabezado", () => {
    const src = leer("app/multifashion/MultifashionShell.tsx");
    expect(src).toMatch(/MULTIFASHION_BARRA_PEGAJOSA \? `\$\{CLASE_BARRA_PEGAJOSA\}/);
  });

  it("05 · Búsqueda: el resultado de Ventas usa el fmtDate de la casa y el nombre de la empresa", () => {
    const src = leer("components/SearchBar.tsx");
    expect(src).toMatch(/import \{ fmtDate \} from "@\/lib\/format"/);
    expect(src).not.toMatch(/function fmtDate/);
    expect(src).toMatch(/EMPRESA_KEY_TO_NAME\[v\.empresa\]/);
  });
});
