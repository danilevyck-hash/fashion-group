/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CANDADO — «DESPACHADO POR» ARRANCA VACÍO EN UNA GUÍA NUEVA.
 *
 * Daniel, textual: **no** lo quiere preseleccionado, *«porque puede que
 * alguien deje ese por error»*.
 *
 * 🩸 Y estaba preseleccionado igual: `useGuiaFormState` recordaba el último
 * elegido en `fg_last_entregado_por` y lo ponía en el campo de toda guía
 * nueva. O sea que una guía nacía diciendo que la despachó quien despachó la
 * ANTERIOR —que pudo haberla armado otra persona, otro día—, y como el campo
 * es obligatorio la pantalla no frena a nadie: se guarda y sale impreso en el
 * papel que alguien firma.
 *
 * ⚠️ LO QUE NO CAMBIA, y son las dos mitades:
 *   · el campo SIGUE SIENDO OBLIGATORIO (`validarGuia`);
 *   · al EDITAR sigue trayendo el nombre que la guía tiene guardado — eso es
 *     el dato, no una sugerencia.
 *
 * ⚠️ Y `localStorage` no está prohibido: el último modo de entrega y el último
 * transportista se siguen recordando. La diferencia es que ésos son atajos que
 * se ven de un vistazo, y «quién despachó» es un dato que alguien firma.
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";
import { entregadoPorElegido } from "@/lib/guias/despachado-por";

const raiz = process.cwd();
const leer = (r: string) => readFileSync(path.join(raiz, r), "utf8");

/** Barre `src/` (sin los tests) buscando un patrón. Devuelve los archivos. */
function barrer(re: RegExp): string[] {
  const encontrados: string[] = [];
  const recorrer = (dir: string) => {
    for (const e of readdirSync(path.join(raiz, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) {
        if (rel === "src/__tests__") continue;
        recorrer(rel);
      } else if (/\.tsx?$/.test(e.name) && re.test(readFileSync(path.join(raiz, rel), "utf8"))) {
        encontrados.push(rel);
      }
    }
  };
  recorrer("src");
  return encontrados;
}

const estado = leer("src/app/guias/components/useGuiaFormState.ts");
const form = leer("src/app/guias/components/GuiaForm.tsx");
const logica = leer("src/app/guias/components/guia-form-logic.ts");

describe("🔴 el campo nace vacío", () => {
  it("🩸 la clave `fg_last_entregado_por` no la USA ningún archivo", () => {
    // Se busca la clave ENTRE COMILLAS (el uso), no la palabra: el comentario
    // que cuenta esta historia la nombra, y contarlo sería un candado que se
    // caza a sí mismo.
    const rastro = barrer(/["']fg_last_entregado_por["']/);
    expect(rastro, `todavía se recuerda quién despachó: ${rastro.join(", ")}`).toEqual([]);
  });

  it("el estado inicial es «» cuando no hay guía que editar", () => {
    expect(estado).toContain('const [entregadoPor, setEntregadoPor] = useState(inicial?.entregadoPor ?? "");');
  });

  it("⚠️ al EDITAR sigue trayendo lo que la guía tiene guardado", () => {
    expect(estado).toContain("inicial?.entregadoPor");
    // `camposDeLaGuia` es quien lo saca de la guía servida; no se tocó.
    expect(estado).toContain("camposDeLaGuia(guiaInicial)");
  });

  it("⚠️ CONTROL — los atajos que SÍ son comodidades siguen recordándose", () => {
    // Esto no es una cruzada contra localStorage: el modo de entrega y el
    // transportista se ven de un vistazo en la pantalla. Lo que salió es el
    // dato que alguien firma.
    expect(estado).toContain('localStorage.setItem("fg_last_modo_entrega", modoEntrega)');
    expect(estado).toContain('localStorage.setItem("fg_last_transportista_id", transportistaId)');
  });
});

describe("🔴 y sigue siendo OBLIGATORIO", () => {
  it("la validación lo exige antes de guardar", () => {
    expect(logica).toContain('if (!entregadoPorElegido(estado.entregadoPor)) errores.add("entregadoPor");');
    expect(logica).toContain('falta.push("quién despacha")');
  });

  it("el campo lleva el rótulo de obligatorio", () => {
    expect(form).toContain('label="Despachado por" requerido');
  });

  it("vacío NO cuenta como elegido, y el centinela tampoco", () => {
    expect(entregadoPorElegido("")).toBe(false);
    expect(entregadoPorElegido("   ")).toBe(false);
    expect(entregadoPorElegido(null)).toBe(false);
    expect(entregadoPorElegido("__other__")).toBe(false);
    expect(entregadoPorElegido("Julio")).toBe(true);
  });

  it("el desplegable abre en «Seleccionar...», no en un nombre", () => {
    const campo = form.slice(form.indexOf('id="guia-entregado-por"'));
    expect(campo.slice(0, 600)).toContain('<option value="">Seleccionar...</option>');
  });
});
