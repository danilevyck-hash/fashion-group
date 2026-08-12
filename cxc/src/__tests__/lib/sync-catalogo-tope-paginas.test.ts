/**
 * CANDADO — el barrido del catálogo no puede volver a cortarse EN SILENCIO.
 *
 * 🩸 LO QUE PASÓ (12-ago-2026, primera carga de Calvin Klein). `MAX_PAGES = 80`
 * (×50 = 4.000 artículos) era un freno de emergencia dimensionado cuando todas
 * las empresas con catálogo eran chicas (Reebok/Joybees/Tommy ≤ 665 artículos:
 * el corte legítimo —la página corta— llegaba mucho antes del tope). Vistana
 * tiene 8.173 artículos = 164 páginas: el barrido llegó al tope, se quedó con
 * media empresa y **se anotó success con 4 productos** donde iban ~80. La misma
 * enfermedad del `db-max-rows`: un truncado sin error se lee como "no había más".
 *
 * Dos invariantes, cada una caza una mutación distinta:
 *  1) El tope cubre holgado la empresa más grande del grupo (vistana 8.173).
 *  2) Llegar al tope sin ver la página corta LANZA — nunca devuelve la lista
 *     a medias. La corrida queda en error y el catálogo guardado, intacto.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const SRC = readFileSync(
  join(__dirname, "../../lib/switch-api/sync-catalogo.ts"),
  "utf8",
);

describe("sync-catalogo — tope de páginas", () => {
  it("el tope cubre la empresa más grande del grupo con margen (vistana: 8.173 artículos)", () => {
    const perPage = Number(/const PER_PAGE = (\d+);/.exec(SRC)?.[1]);
    const maxPages = Number(/const MAX_PAGES = (\d+);/.exec(SRC)?.[1]);
    expect(perPage).toBeGreaterThan(0);
    expect(maxPages).toBeGreaterThan(0);
    // 8.173 medidos el 12-ago-2026 + 45% de aire para que crecer no vuelva a truncar.
    expect(perPage * maxPages).toBeGreaterThanOrEqual(12_000);
  });

  it("llegar al tope sin ver la última página es un ERROR, no un éxito a medias", () => {
    // El corte legítimo es la página corta; si el for agota MAX_PAGES sin verla,
    // el barrido tiene que lanzar. Se fija el mecanismo (la bandera y el throw),
    // no la redacción del mensaje.
    expect(SRC).toMatch(/vioElFinal/);
    expect(SRC).toMatch(/if \(!vioElFinal\) \{[\s\S]{0,400}?throw new Error\(/);
  });

  it("el corte por página corta sigue existiendo (no se barre de más)", () => {
    expect(SRC).toMatch(/arr\.length < PER_PAGE/);
  });
});
