// 🔴 SIN EJEMPLOS EN LOS CAMPOS (nov-2026). El texto gris de un campo dice QUÉ
// va ahí («Número de factura», «Correo del cliente»), nunca un valor de ejemplo
// («Ej. 4020000422», «correo@cliente.com», «8-1010-2403»). Si el rótulo del
// campo ya lo dice, el campo va sin texto. Se permiten las pistas de FORMATO
// («0.00», «HH:MM», «--:--»).
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { describe, it, expect } from "vitest";

const EJEMPLO = /^(Ej[.:]|.*@)|\d{3,}/;
const FORMATO = /^[0.$:\-—HM ]*$|^0\.00/;

function* archivos(dir: string): Generator<string> {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) { if (!p.endsWith("__tests__")) yield* archivos(p); }
    else if (/\.tsx?$/.test(n)) yield p;
  }
}

describe("placeholders sin ejemplos", () => {
  it("ningún campo trae un valor de ejemplo", () => {
    const malos: string[] = [];
    for (const f of archivos("src")) {
      for (const m of readFileSync(f, "utf8").matchAll(/placeholder[=:]\s*\{?\s*["'`]([^"'`]+)["'`]/g)) {
        const t = m[1].trim();
        if (EJEMPLO.test(t) && !FORMATO.test(t)) malos.push(`${f}: «${t}»`);
      }
    }
    expect(malos).toEqual([]);
  });
});
