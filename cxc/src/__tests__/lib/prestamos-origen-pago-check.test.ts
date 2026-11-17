/* ─────────────────────────────────────────────────────────────────────────────
 * CANDADO: LO QUE EL CÓDIGO ACEPTA COMO ORIGEN DE UN PAGO, LA BASE LO GUARDA.
 *
 * 🩸 16-nov-2026. El 8-sep-2026 «Efectivo» se cambió por «Abono» en
 * `ORIGENES_PAGO` (`prestamos-conceptos.ts`) y nadie amplió el CHECK de
 * `prestamos_movimientos.origen_pago` (migración `20260925120000`). La pantalla
 * ofrecía «Abono», la ruta lo aceptaba y Postgres lo rechazaba: el pago de
 * $200 de Roxana del 15-nov-2026 no se pudo guardar como venía.
 *
 * Esta prueba cruza la lista del código con la ÚLTIMA definición del CHECK
 * que haya en `supabase/migrations/` (sin comentarios: el SQL NOMBRA lo que
 * prohíbe). Un origen nuevo en el código sin su migración pone esto en ROJO.
 * ─────────────────────────────────────────────────────────────────────────── */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { ORIGENES_PAGO } from "@/lib/prestamos-conceptos";

const DIR = join(process.cwd(), "supabase", "migrations");
const CONSTRAINT = "prestamos_movimientos_origen_pago_chk";

/** La última definición del CHECK, en el orden en que se aplican las migraciones. */
function ultimoCheck(): string {
  const archivos = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
  let def = "";
  for (const f of archivos) {
    const codigo = readFileSync(join(DIR, f), "utf8")
      .split("\n")
      .filter((l) => !l.trim().startsWith("--"))
      .join("\n");
    const re = new RegExp(`CONSTRAINT\\s+${CONSTRAINT}\\s+CHECK\\s*\\(([\\s\\S]*?)\\);`, "gi");
    for (const m of codigo.matchAll(re)) def = m[1];
  }
  return def;
}

describe("🔴 origen_pago: el CHECK de la base acepta todo lo que el código ofrece", () => {
  const check = ultimoCheck();

  it("hay una definición del CHECK en las migraciones", () => {
    expect(check).not.toBe("");
  });

  for (const origen of ORIGENES_PAGO) {
    it(`«${origen}» está en el CHECK`, () => {
      expect(check).toContain(`'${origen}'`);
    });
  }

  it("control: un origen inventado NO está en el CHECK", () => {
    expect(check).not.toContain("'Transferencia'");
  });

  it("control: el código ya no ofrece «Efectivo» (0 filas en toda la historia hasta el 8-sep-2026)", () => {
    expect(ORIGENES_PAGO as readonly string[]).not.toContain("Efectivo");
  });
});
