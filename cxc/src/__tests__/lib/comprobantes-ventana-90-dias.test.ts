/**
 * CANDADO — la lista de Comprobantes muestra los últimos 90 días, y el resto
 * queda detrás de «Ver más». Nada se borra.
 *
 * ─── LA PREGUNTA DE DANIEL (4-sep-2026), textual ────────────────────────────
 *   «si un pedido se mandó a switch, ya está safe, no?»
 *
 * La respuesta es NO, y por eso este archivo existe:
 *   1. El pedido guarda lo que Switch **no** tiene: quién lo armó, el
 *      comentario, si salió como pedido o como cotización, y el PDF que se le
 *      mandó al cliente. Switch guarda el documento, no cómo se llegó a él.
 *   2. Son POCOS: en todo 2026, 23 Reebok · 38 Tommy · 21 Calvin · 41 Joybees.
 *      No hay un problema de volumen que borrar resuelva.
 * Lo que sí pesa es la LISTA. Así que se muestra menos y se guarda todo.
 *
 * ─── LO QUE VIGILA ──────────────────────────────────────────────────────────
 * 1. El corte existe y es por FECHA (90 días), no por cantidad.
 * 2. Lo de afuera NO se pierde: sale con «Ver más», y «Ver más» lo trae todo.
 * 3. 🔴 Sin texto explicativo al lado del botón (Daniel: «no me gustan tantas
 *    palabras extras»).
 * 4. La selección masiva solo puede alcanzar lo que se ve.
 * 5. CONTROL — la lista se sigue dibujando y agrupando por mes.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  DIAS_VENTANA_COMPROBANTES,
  partirPorVentana,
} from "@/lib/catalogo/comprobantes-ventana";

const PANEL = fs.readFileSync(
  path.join(process.cwd(), "src/components/catalogo/ComprobantesPanel.tsx"),
  "utf8",
);
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, "");
const PANEL_LIMPIO = sinComentarios(PANEL);

/** Fecha fija: nada de `new Date()` en un candado. */
const AHORA = new Date("2026-09-04T12:00:00.000Z");
const haceDias = (d: number) =>
  new Date(AHORA.getTime() - d * 24 * 60 * 60 * 1000).toISOString();

const fila = (id: string, created_at: string) => ({ id, created_at });

// ─────────────────────────────────────────────────────────────────────────────
describe("el corte es de 90 días y es por FECHA", () => {
  it("la ventana vale 90 días", () => {
    expect(DIAS_VENTANA_COMPROBANTES).toBe(90);
  });

  it("lo de adentro se muestra y lo de afuera espera", () => {
    const { recientes, viejos } = partirPorVentana(
      [
        fila("hoy", haceDias(0)),
        fila("ayer", haceDias(1)),
        fila("dia-89", haceDias(89)),
        fila("dia-91", haceDias(91)),
        fila("hace-un-año", haceDias(365)),
      ],
      AHORA,
    );
    expect(recientes.map((f) => f.id)).toEqual(["hoy", "ayer", "dia-89"]);
    expect(viejos.map((f) => f.id)).toEqual(["dia-91", "hace-un-año"]);
  });

  it("🔴 el borde de los 90 días entra; el de 91 no", () => {
    const dentro = partirPorVentana([fila("x", haceDias(90))], AHORA);
    expect(dentro.recientes).toHaveLength(1);
    const fuera = partirPorVentana([fila("x", haceDias(90.001))], AHORA);
    expect(fuera.viejos).toHaveLength(1);
  });

  it("nada se pierde: recientes + viejos son SIEMPRE la lista entera", () => {
    const filas = Array.from({ length: 40 }, (_, i) => fila(`f${i}`, haceDias(i * 7)));
    const { recientes, viejos } = partirPorVentana(filas, AHORA);
    expect(recientes.length + viejos.length).toBe(filas.length);
    expect([...recientes, ...viejos].map((f) => f.id).sort()).toEqual(filas.map((f) => f.id).sort());
  });

  it("una fecha ilegible se MUESTRA, no se esconde", () => {
    // Esconder un comprobante por un dato roto es peor que mostrarlo de más.
    const { recientes, viejos } = partirPorVentana([fila("roto", "no-es-fecha")], AHORA);
    expect(recientes.map((f) => f.id)).toEqual(["roto"]);
    expect(viejos).toEqual([]);
  });

  it("no muta la lista que recibe ni cambia el orden", () => {
    const filas = [fila("a", haceDias(1)), fila("b", haceDias(200)), fila("c", haceDias(2))];
    const copia = [...filas];
    const { recientes } = partirPorVentana(filas, AHORA);
    expect(filas).toEqual(copia);
    expect(recientes.map((f) => f.id)).toEqual(["a", "c"]);
  });

  it("el módulo es PURO: no lee el reloj por su cuenta", () => {
    const modulo = fs.readFileSync(
      path.join(process.cwd(), "src/lib/catalogo/comprobantes-ventana.ts"),
      "utf8",
    );
    expect(sinComentarios(modulo)).not.toContain("new Date()");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("la pantalla usa el corte, y «Ver más» trae el resto", () => {
  it("🔴 la lista NO se dibuja entera: pasa por la ventana", () => {
    expect(PANEL_LIMPIO).toContain("partirPorVentana(filtered, new Date())");
    expect(PANEL_LIMPIO).toContain("const visibles = verTodo ? filtered : recientes;");
    // Los grupos por mes se arman sobre lo VISIBLE, no sobre `filtered`.
    expect(PANEL_LIMPIO).toContain("for (const p of visibles)");
    expect(PANEL_LIMPIO).not.toContain("for (const p of filtered)");
  });

  it("«Ver más» aparece solo si hay algo detrás, y lo trae TODO", () => {
    expect(PANEL_LIMPIO).toContain("const hayMas = !verTodo && viejos.length > 0;");
    expect(PANEL_LIMPIO).toContain("{hayMas && (");
    expect(PANEL_LIMPIO).toContain("onClick={() => setVerTodo(true)}");
    expect(PANEL_LIMPIO).toContain("Ver más ({viejos.length})");
  });

  it("🔴 el botón va SOLO — sin texto explicativo al lado", () => {
    // Daniel: «no me gustan tantas palabras extras».
    const i = PANEL_LIMPIO.indexOf("{hayMas && (");
    const bloque = PANEL_LIMPIO.slice(i, PANEL_LIMPIO.indexOf("</div>", i));
    for (const frase of ["más viejo", "más antiguos", "de más de", "90 días", "Mostrando"]) {
      expect(bloque, `el bloque no puede explicar «${frase}»`).not.toContain(frase);
    }
  });

  it("la selección masiva no puede alcanzar lo que la ventana escondió", () => {
    // `visibleRows` sale de los grupos, y los grupos salen de `visibles`.
    expect(PANEL_LIMPIO).toContain(
      "const visibleRows = grupos.filter((g) => isMesOpen(g.key)).flatMap((g) => g.items);",
    );
  });

  it("CONTROL: la lista se sigue dibujando y agrupando por mes", () => {
    expect(PANEL_LIMPIO).toContain("{grupos.map((grupo) => (");
    expect(PANEL_LIMPIO).toContain("<MesGroup");
    expect(PANEL_LIMPIO).toContain("mesLabel(p.created_at)");
  });
});
