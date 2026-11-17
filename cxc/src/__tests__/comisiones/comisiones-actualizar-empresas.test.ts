// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO — «ACTUALIZAR» EN COMISIONES OFRECE SOLO LAS 6 QUE COMISIONAN
// (error #9 de los videos, 16-nov-2026).
//
// 🩸 Las tres superficies (computadora, celular, la barra vieja) usaban
// `SYNC_NOW_RECIBOS_OPCIONES`, que son TODAS las empresas con recibos: también
// Multifashion (otro módulo de comisiones) y Confecciones Boston (no comisiona).
// Ahora usan `SYNC_NOW_RECIBOS_COMISIONES`, derivada de `EMPRESAS_COMISIONAN`.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { SYNC_NOW_RECIBOS_COMISIONES } from "@/components/shared/syncNowOpciones";
import { EMPRESAS_COMISIONAN } from "@/lib/comisiones/empresas";

const archivos = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? archivos(p) : /\.tsx?$/.test(f) ? [p] : [];
  });

describe("🔴 #9 — «Actualizar» de Comisiones", () => {
  it("ofrece exactamente las empresas que comisionan (sin Multifashion ni Boston)", () => {
    const ofrecidas = SYNC_NOW_RECIBOS_COMISIONES.map((o) => o.empresa).sort();
    expect(ofrecidas).toEqual([...EMPRESAS_COMISIONAN].sort());
    expect(ofrecidas).not.toContain("american_classic");
    expect(ofrecidas).not.toContain("confecciones_boston");
  });

  it("ninguna pantalla de Comisiones usa la lista de TODAS las empresas con recibos", () => {
    const culpables = archivos(join(process.cwd(), "src/components/comisiones")).filter((f) =>
      /\bSYNC_NOW_RECIBOS_OPCIONES\b/.test(readFileSync(f, "utf8")),
    );
    expect(culpables).toEqual([]);
  });
});
