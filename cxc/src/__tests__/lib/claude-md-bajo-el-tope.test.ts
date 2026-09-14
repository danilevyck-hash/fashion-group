/**
 * 🔴 CLAUDE.md TIENE QUE CABER EN EL HARNESS (14-sep-2026).
 *
 * Claude Code corta CLAUDE.md a 150.000 caracteres y NO avisa qué quedó
 * afuera: el 14-sep-2026 el archivo pesaba 333.000 y más de la mitad de
 * las invariantes —las de Ventas, Asistencia, Crons, Clientes, Multifashion—
 * no llegaban a ninguna sesión. Se recortó a las reglas vigentes y el texto
 * completo se movió, verbatim, a `docs/postmortems/*.md` › «Lo que decía
 * CLAUDE.md hasta el 14-sep-2026».
 *
 * La regla de la casa desde ese día: una regla nueva entra a CLAUDE.md en
 * UNA o dos líneas, y el detalle (mediciones, citas, candados, mutaciones)
 * va al postmortem de su módulo. Este candado deja 20.000 caracteres de
 * margen para que el aviso llegue antes que el corte.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const RAIZ = process.cwd();
const TOPE_DEL_HARNESS = 150_000;
const MARGEN = 20_000;

describe("🔴 CLAUDE.md cabe en el harness", () => {
  it(`pesa menos de ${(TOPE_DEL_HARNESS - MARGEN).toLocaleString("es")} caracteres`, () => {
    const doc = fs.readFileSync(path.join(RAIZ, "CLAUDE.md"), "utf8");
    const chars = [...doc].length;
    expect(
      chars,
      `\n\nCLAUDE.md pesa ${chars.toLocaleString("es")} caracteres; el harness lo corta a ` +
        `${TOPE_DEL_HARNESS.toLocaleString("es")} y a partir de ahí las reglas dejan de llegar.\n` +
        `Mueve el detalle del bloque que creció a docs/postmortems/<módulo>.md y deja aquí la regla en una línea.\n`,
    ).toBeLessThanOrEqual(TOPE_DEL_HARNESS - MARGEN);
  });

  it("y sigue apuntando a donde se fue el detalle", () => {
    const doc = fs.readFileSync(path.join(RAIZ, "CLAUDE.md"), "utf8");
    expect(doc).toContain("docs/donde-vive-cada-dato.md");
    expect(doc).toContain("docs/crons.md");
    expect(doc).toContain("Lo que decía CLAUDE.md hasta el 14-sep-2026");
  });
});
