// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO · Marketing estilo Apple V2 (`MARKETING_APPLE_V2_2026_10`,
// 6-oct-2026). Solo cambia la pantalla:
//   1. Apagado hasta el «sí» de Daniel; la v1 sigue prendida.
//   2. Las líneas grises dicen los MISMOS números de las celdas de hoy.
//   3. Lo que se guarda no cambia: el cuerpo del POST del pago, la regla de
//      «Guardar pago» y la galería PÚBLICA quedan como hoy.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  MARKETING_APPLE_V2_2026_10,
  atajoPrendido,
  faltaParaGuardarPago,
  lineaDelProyecto,
  lineaDistribucion,
  lineaMontosFactura,
  lineaTotalesProyecto,
  textoFaltaPago,
  tituloGaleria,
} from "@/lib/marketing/marketing-2026-10-v2";
import { MARKETING_APPLE_2026_10 } from "@/lib/marketing/marketing-2026-10";

const RAIZ = process.cwd();
const leer = (p: string) => fs.readFileSync(path.join(RAIZ, p), "utf8");
const $ = (n: number) => `$${n.toFixed(2)}`;

describe("1 · el interruptor", () => {
  it("V2 apagado; la v1 sigue prendida", () => {
    expect(MARKETING_APPLE_V2_2026_10).toBe(false);
    expect(MARKETING_APPLE_2026_10).toBe(true);
  });
});

describe("2 · los mismos números, en una línea", () => {
  it("proyecto: entregas e importación solo si existen, como las celdas", () => {
    const base = { conteo: 3, subtotal: 100, conteoEntregas: 0, totalEntregas: 0, tieneAlgunaZonaLibre: false, importacion: 0 };
    expect(lineaTotalesProyecto(base, $, 15)).toBe("3 facturas · Subtotal $100.00");
    expect(
      lineaTotalesProyecto({ ...base, conteo: 1, conteoEntregas: 2, totalEntregas: 50, tieneAlgunaZonaLibre: true, importacion: 15 }, $, 15),
    ).toBe("1 factura · Subtotal $100.00 · 2 entregas $50.00 · Importación 15% +$15.00");
    expect(lineaDelProyecto({ tienda: "D-118", mostrarTienda: true, inicio: "3 oct 2026" })).toBe("Tienda D-118 · Inicio 3 oct 2026");
    expect(lineaDelProyecto({ tienda: "D-118", mostrarTienda: false, inicio: "3 oct 2026" })).toBe("Inicio 3 oct 2026");
  });

  it("factura y pago", () => {
    expect(lineaMontosFactura({ subtotal: 100, itbms: 7, tiene_importacion: false }, $, 15, 15)).toBe("Subtotal $100.00 · ITBMS $7.00");
    expect(lineaMontosFactura({ subtotal: 100, itbms: 0, tiene_importacion: true }, $, 15, 15)).toBe("Subtotal $100.00 · Importación 15% $15.00");
    expect(lineaDistribucion([{ nombre: "Tommy Hilfiger", porcentaje: 50, monto: 150 }, { nombre: "Calvin Klein", porcentaje: 50, monto: 150 }], $))
      .toBe("Tommy Hilfiger 50% $150.00 · Calvin Klein 50% $150.00");
  });

  it("el cero de la galería SÍ se ve", () => {
    expect(tituloGaleria("Fotos de la tienda", 0)).toBe("Fotos de la tienda · 0");
  });
});

describe("3 · el pago guarda lo mismo", () => {
  const atajos = [
    { clave: "q1", rotulo: "1ª quincena", desde: "2026-10-01", hasta: "2026-10-15" },
    { clave: "mes", rotulo: "Mes completo", desde: "2026-10-01", hasta: "2026-10-31" },
  ];
  it("un rango a mano prende «Rango»", () => {
    expect(atajoPrendido("2026-10-01", "2026-10-31", atajos)).toBe("mes");
    expect(atajoPrendido("2026-10-03", "2026-10-20", atajos)).toBeNull();
  });

  it("lo que falta es la MISMA regla del botón de hoy, dicha toda de una vez", () => {
    expect(faltaParaGuardarPago({ errorPeriodo: null, monto: 300, hayComprobante: true })).toEqual([]);
    expect(textoFaltaPago(faltaParaGuardarPago({ errorPeriodo: "x", monto: 0, hayComprobante: false })))
      .toBe("Falta: el período, el monto y el comprobante");
    const modal = leer("src/app/marketing/components/RegistrarPagoModal.tsx");
    expect(modal).toContain("montoNum > 0 && !!comprobante && !errorPeriodo && !subiendo && !guardando;");
    expect(modal).toContain("if (!puedeGuardar || !comprobante) return;");
    expect(modal).toContain("`/api/marketing/impulsadoras/${impulsadora.id}/pagos`");
    expect(modal).toContain("desde,\n          hasta,\n          monto: montoNum,");
  });

  it("la galería pública y ninguna ruta del servidor leen el interruptor", () => {
    expect(leer("src/app/marketing/galeria/[cliente]/GaleriaView.tsx")).not.toContain("marketing-2026-10-v2");
    const listar = (dir: string): string[] =>
      fs.readdirSync(path.join(RAIZ, dir), { withFileTypes: true }).flatMap((e) => {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) return listar(p);
        return /\.(ts|tsx)$/.test(e.name) ? [p] : [];
      });
    for (const p of listar("src/app/api")) expect(leer(p), p).not.toContain("marketing-2026-10-v2");
  });
});
