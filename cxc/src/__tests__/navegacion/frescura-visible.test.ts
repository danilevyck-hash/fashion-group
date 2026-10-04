/**
 * 🔴 CANDADO — LA LÍNEA DE FRESCURA NACE APAGADA (4-oct-2026).
 *
 * «Actualizado 4:00 pm ↻» (celular) y «Actualizado hace 5 min · Actualizar»
 * (computadora) son una PROPUESTA: se programaron detrás de
 * `FRESCURA_VISIBLE_2026_10` y se prenden solo con el «sí» de Daniel. Ver
 * `lib/ui/frescura.ts`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { FRESCURA_VISIBLE_2026_10, haceCuantoFrescura, horaDeFrescura } from "@/lib/ui/frescura";

const leer = (p: string) => readFileSync(join(__dirname, "../../..", p), "utf8");

describe("FRESCURA_VISIBLE_2026_10", () => {
  it("nace apagado", () => {
    expect(FRESCURA_VISIBLE_2026_10).toBe(false);
  });

  it("apagado, «Actualizar ahora» sigue donde estaba: el «···» de Ventas y Comisiones, la fila de la computadora y «Más» de Multifashion", () => {
    expect(leer("src/components/ventas/celular/MenuVentasCelular.tsx")).toMatch(/!FRESCURA_VISIBLE_2026_10 && \(\s*<div className="\[&>\*\]:w-full">\s*<SyncNowButton/);
    expect(leer("src/components/comisiones/celular/PortadaComisionesCelular.tsx")).toContain("conDescarga && !FRESCURA_VISIBLE_2026_10 && (");
    expect(leer("src/components/comisiones/ComisionesView.tsx")).toContain("conPapel && !FRESCURA_VISIBLE_2026_10 && (");
    expect(leer("src/app/multifashion/MultifashionShell.tsx")).toContain("acciones={conFrescura ? undefined : accionesSync}");
  });
});

describe("el texto de la línea", () => {
  const ahora = new Date("2026-10-04T23:00:00Z"); // 6:00 pm en Panamá

  it("celular: la hora de hoy con am/pm; otro día, la fecha", () => {
    expect(horaDeFrescura("2026-10-04T14:41:00Z", ahora)).toBe("9:41 am");
    expect(horaDeFrescura("2026-10-04T21:00:00Z", ahora)).toBe("4:00 pm");
    expect(horaDeFrescura("2026-10-03T21:00:00Z", ahora)).toBe("3 oct");
    expect(horaDeFrescura("no es fecha", ahora)).toBeNull();
  });

  it("computadora: hace cuánto", () => {
    expect(haceCuantoFrescura("2026-10-04T22:59:40Z", ahora)).toBe("hace un momento");
    expect(haceCuantoFrescura("2026-10-04T22:55:00Z", ahora)).toBe("hace 5 min");
    expect(haceCuantoFrescura("2026-10-04T20:00:00Z", ahora)).toBe("hace 3 h");
    expect(haceCuantoFrescura("2026-10-02T23:00:00Z", ahora)).toBe("hace 2 días");
    expect(haceCuantoFrescura("2026-10-03T22:00:00Z", ahora)).toBe("hace 1 día");
  });
});
