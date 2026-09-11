/**
 * ─────────────────────────────────────────────────────────────────────────────
 * MARKETING Y CAJA MENUDA — LOS CUATRO DEFECTOS DEL 11-sep-2026.
 *
 *  10. **Un proyecto eliminado no se recuperaba desde ninguna pantalla.**
 *      `anular` es soft delete, pero `proyectos-lista` filtra
 *      `.is("anulado_en", null)` y la pantalla «Anulados» se retiró: la única
 *      puerta a `papelera/restaurar` era el aviso «Deshacer» guardado en
 *      `useState`, así que bastaba recargar con F5 para perderlo. Daniel:
 *      *«a) una lista "Eliminados" con "Restaurar", como en Guías»*.
 *  11. **«Otro gasto» prometía leer el PDF con IA y nunca lo hacía**: ese
 *      camino guarda con `proyecto_id = null` y la ruta que firma la subida
 *      exigía proyecto, factura o impulsadora, así que `subirPdfParaIA`
 *      cortaba con `return null` — spinner que se enciende, se apaga, y los
 *      seis campos vacíos.
 *  12. **Las fotos del recibo no se podían ver en un período CERRADO**: el
 *      «···» que las abre se dibujaba solo con el período abierto, y hoy 2 de
 *      3 períodos están cerrados.
 *  13. **El aviso de eliminar prometía un «Restaurar» que se había retirado**
 *      el 7-sep. Daniel: *«a) vuelve Restaurar»*.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { accionesDelGasto, fotosSoloVer } from "@/lib/caja/menu-del-gasto";

const leer = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ─────────────────────────────────────────────────────────────────────────────
describe("10 · un proyecto eliminado se puede devolver", () => {
  const RUTA = sinComentarios(leer("src/app/api/marketing/proyectos-anulados/route.ts"));
  const LISTA = sinComentarios(leer("src/app/marketing/components/ProyectosEliminados.tsx"));
  const VISTA = sinComentarios(leer("src/app/marketing/components/DetallePeriodoView.tsx"));

  it("🔴 hay una ruta que LISTA los anulados, y solo eso", () => {
    expect(RUTA).toContain('.not("anulado_en", "is", null)');
    // No escribe: restaurar sigue siendo `papelera/restaurar`.
    expect(RUTA).not.toContain(".update(");
    expect(RUTA).not.toContain(".delete(");
  });

  it("⚠️ va APARTE de `proyectos-lista`: un anulado no es gasto de nadie", () => {
    const listaViva = sinComentarios(leer("src/app/api/marketing/proyectos-lista/route.ts"));
    expect(listaViva).toContain('.is("anulado_en", null)');
  });

  it("🔴 la pantalla restaura por la MISMA ruta que el «Deshacer»", () => {
    expect(LISTA).toContain("/api/marketing/papelera/restaurar");
    expect(LISTA).toContain('tipo: "proyecto"');
    expect(VISTA).toContain("/api/marketing/papelera/restaurar");
  });

  it("🔴 sin ninguno eliminado, la lista NO se dibuja (nada de un «(0)»)", () => {
    expect(LISTA).toContain("if (lista.length === 0) return null;");
  });

  it("⚠️ y falla ABIERTA: si la lectura se cae, la pantalla es la de antes", () => {
    expect(LISTA).toMatch(/catch\s*\{/);
  });

  it("el bloque cuelga al pie de la lista de proyectos de la marca", () => {
    expect(VISTA).toContain("<ProyectosEliminados");
    expect(VISTA).toContain("bloque={marca.key}");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("11 · «Otro gasto» sí le pasa el PDF a la IA", () => {
  const RUTA = sinComentarios(leer("src/app/api/marketing/adjuntos/upload-url/route.ts"));
  const MODAL = sinComentarios(leer("src/app/marketing/components/RegistrarGastoModal.tsx"));

  it("🔴 la promesa dejó de ser falsa: sin proyecto ya no devuelve `null`", () => {
    expect(MODAL).toContain("paraLeerConIA: true");
    expect(MODAL).not.toContain("if (!proyectoId) return null;");
  });

  it("🔴 el archivo sin dueño va a su propia carpeta", () => {
    expect(RUTA).toContain('parts.push("sin-dueno")');
  });

  it("⚠️ la ruta sigue pidiendo un dueño para todo lo demás", () => {
    expect(RUTA).toContain(
      '!body.proyectoId && !body.facturaId && !body.impulsadoraId && !body.paraLeerConIA',
    );
    expect(RUTA).toContain("Se requiere proyectoId, facturaId o impulsadoraId");
  });

  it("🔴 el mismo PDF NO se sube dos veces: al guardar se reusa su `path`", () => {
    expect(MODAL).toContain("pathPreSubido: pdfPathPreSubido");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("12 · las fotos del recibo se ven con el período cerrado", () => {
  it("🔴 con el período CERRADO el menú lleva la foto, y nada más", () => {
    expect(accionesDelGasto(false)).toEqual(["foto"]);
  });

  it("con el período abierto no se perdió nada", () => {
    expect(accionesDelGasto(true)).toEqual(["editar", "foto", "eliminar"]);
  });

  it("🔴 y cerrado, la zona de fotos abre en SOLO LECTURA", () => {
    expect(fotosSoloVer(false)).toBe(true);
    expect(fotosSoloVer(true)).toBe(false);
  });

  it("🔴 las dos pantallas (tabla y ficha) leen la MISMA lista", () => {
    for (const rel of [
      "src/app/caja/components/GastoTable.tsx",
      "src/app/caja/components/FichaGasto.tsx",
    ]) {
      const src = sinComentarios(leer(rel));
      expect(src, rel).toContain("accionesDelGasto(isOpen)");
      expect(src, rel).toContain("fotosSoloVer(isOpen)");
      // El menú ya no cuelga de `isOpen &&`.
      expect(src, rel).not.toMatch(/isOpen && \(\s*<div className="-my-2 -mr-2">/);
    }
  });

  it("⚠️ editar y borrar siguen cerrados en el SERVIDOR", () => {
    const ruta = sinComentarios(leer("src/app/api/caja/gastos/[id]/route.ts"));
    expect(ruta).toContain("No se pueden editar gastos de un período cerrado.");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("13 · vuelve «Restaurar», y el aviso deja de mentir", () => {
  const RUTA = sinComentarios(leer("src/app/api/caja/gastos/[id]/route.ts"));
  const MODAL = sinComentarios(leer("src/app/caja/components/DeletedGastosModal.tsx"));
  const PAGINA = sinComentarios(leer("src/app/caja/[periodoId]/page.tsx"));

  it("🔴 el servidor sabe devolver un gasto borrado", () => {
    expect(RUTA).toContain("body?.restaurar === true");
    expect(RUTA).toContain("deleted: false");
    expect(RUTA).toContain("caja_gasto_restore");
  });

  it("🔴 va en su propia rama: `deleted` NO entra por los campos editables", () => {
    expect(RUTA).toMatch(/const ALLOWED_FIELDS = \[[^\]]*\]/);
    const allowed = RUTA.match(/const ALLOWED_FIELDS = \[([^\]]*)\]/)![1];
    expect(allowed).not.toContain("deleted");
  });

  it("⚠️ solo con el período ABIERTO: un cerrado ya se imprimió", () => {
    expect(RUTA).toContain("El período ya está cerrado: no se puede devolver un gasto.");
  });

  it("🔴 y hay botón en la pantalla que el aviso nombra", () => {
    expect(MODAL).toContain("Restaurar");
    expect(MODAL).toContain('JSON.stringify({ restaurar: true })');
    expect(PAGINA).toContain("periodoAbierto={detailIsOpen}");
    // El aviso de eliminar sigue prometiéndolo — y ahora es verdad.
    expect(PAGINA).toContain("Podrás restaurarlo desde Gastos eliminados si es un error.");
  });

  it("⚠️ sigue siendo SOFT delete: restaurar no inserta nada", () => {
    expect(RUTA).not.toMatch(/restaurar[\s\S]{0,600}\.insert\(/);
  });
});
