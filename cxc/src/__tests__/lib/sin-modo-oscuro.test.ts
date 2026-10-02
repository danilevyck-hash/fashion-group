// 🔴 SIN MODO OSCURO (Daniel, 2-oct-2026). Quien lo había prendido quedaba en
// oscuro sin forma de salir. Ahora la clave vieja se borra al cargar, nada
// vuelve a poner la clase `dark` y no quedan reglas `.dark`.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

function* archivos(dir: string): Generator<string> {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) { if (!p.endsWith("__tests__")) yield* archivos(p); }
    else if (/\.(tsx?|css)$/.test(n)) yield p;
  }
}

describe("nadie queda en oscuro", () => {
  const layout = readFileSync("src/app/layout.tsx", "utf8");

  it("el layout borra la clave vieja, con try/catch, y no prende nada", () => {
    expect(layout).toContain("try{localStorage.removeItem('fg_dark_mode')}catch(e){}");
    expect(layout).not.toMatch(/classList\.add\(['"]dark/);
  });

  it("no quedan reglas .dark en globals.css", () => {
    expect(readFileSync("src/app/globals.css", "utf8")).not.toMatch(/\.dark[\s.{]/);
  });

  it("ningún archivo prende la clase dark ni guarda fg_dark_mode", () => {
    for (const f of archivos("src")) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/classList\.(add|toggle)\(\s*['"]dark['"]/);
      expect(src, f).not.toMatch(/setItem\(\s*['"]fg_dark_mode/);
    }
  });

  it("no hay interruptor de modo oscuro a la vista", () => {
    for (const f of archivos("src")) expect(readFileSync(f, "utf8"), f).not.toMatch(/["']Modo (oscuro|claro)["']/);
  });

  it("Tailwind sigue en `class`: con `media` el sistema operativo prendería las clases dark:", () => {
    expect(readFileSync("tailwind.config.ts", "utf8")).toMatch(/darkMode:\s*"class"/);
  });
});
