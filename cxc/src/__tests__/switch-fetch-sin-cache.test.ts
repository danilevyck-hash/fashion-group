/**
 * Candado: ninguna llamada a Switch puede salir cacheable.
 *
 * Next 14 guarda en su Data Cache cualquier `fetch` de servidor sin `cache`
 * (incluso POST o con Authorization) si en esa petición no hubo antes un fetch
 * sin caché. Medido el 8-oct-2026 con `next build && next start`: dos llamadas
 * seguidas a una ruta `force-dynamic` devolvieron la MISMA respuesta. Todas las
 * llamadas a Switch pasan por `client.ts` y `web-client.ts`; si alguien agrega un
 * `fetch(` en `switch-api/` sin `cache: "no-store"`, esta prueba falla.
 */
import { readFileSync, readdirSync } from "fs";
import path from "path";

const SRC = path.join(__dirname, "..");
const DIR = path.join(SRC, "lib", "switch-api");

/** Texto de los argumentos de cada `fetch(` (paréntesis balanceados). */
function llamadasFetch(texto: string): string[] {
  const out: string[] = [];
  const re = /(?<![\w.])fetch\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto))) {
    let i = m.index + m[0].length, prof = 1;
    while (i < texto.length && prof > 0) {
      if (texto[i] === "(") prof++;
      else if (texto[i] === ")") prof--;
      i++;
    }
    out.push(texto.slice(m.index, i));
  }
  return out;
}

describe("Switch: toda llamada sale sin caché", () => {
  const archivos = readdirSync(DIR).filter((f) => f.endsWith(".ts"));

  it("los dos clientes existen y llaman a fetch", () => {
    for (const f of ["client.ts", "web-client.ts"]) {
      expect(llamadasFetch(readFileSync(path.join(DIR, f), "utf8")).length).toBeGreaterThan(0);
    }
  });

  it.each(archivos)("%s: cada fetch( lleva cache: \"no-store\"", (f) => {
    for (const llamada of llamadasFetch(readFileSync(path.join(DIR, f), "utf8"))) {
      expect(llamada, `${f}: ${llamada.slice(0, 80)}`).toMatch(/cache:\s*["']no-store["']/);
    }
  });

  it("los crons que tocan Switch se declaran dinámicos", () => {
    const crons = path.join(SRC, "app", "api", "cron");
    const conSwitch = readdirSync(crons)
      .map((d) => path.join(crons, d, "route.ts"))
      .filter((p) => { try { return readFileSync(p, "utf8").includes("@/lib/switch-api"); } catch { return false; } });
    expect(conSwitch.length).toBeGreaterThan(10);
    for (const p of conSwitch) {
      expect(readFileSync(p, "utf8"), p).toMatch(/export const dynamic = ["']force-dynamic["']/);
    }
  });
});
