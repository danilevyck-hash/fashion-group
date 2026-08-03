// ─────────────────────────────────────────────────────────────────────────────
// La guía de despacho: la HOJA ENTERA en el celular, y el PAPEL INTACTO.
//
// 🩸 LO MEDIDO, navegador real, build y datos de producción (30-jul-2026).
// Px de arrastre horizontal de la pantalla /guias/<id>/imprimir:
//
//   ancho   antes   después   escala   ¿entra la hoja entera?
//    390     158       0       0.733   sí   ← el único que se toca
//    834       0       0       1       sí   (ya entraba: 562 útiles vs 548)
//   1024       0       0       1       sí
//   1440       0       0       1       sí
//
// Daniel eligió la opción 2 —verla completa y achicada, como la vista previa de
// un PDF— sobre la de tarjetas, porque este documento se imprime, se FIRMA y se
// le entrega al transportista: que la pantalla y la hoja digan lo mismo vale más
// que la comodidad de leer.
//
// ── 🔴 EL CANDADO QUE IMPORTA ES EL DEL PAPEL ───────────────────────────────
//
// `globals.css` deja `#print-document { position: absolute; ... }` dentro de
// `@media print`. Un ancestro con `transform` ≠ none **o** con `position` ≠
// static le crea un bloque contenedor, así que si cualquiera de las dos
// sobrevive al print, la guía sale mal EN EL PAPEL.
//
// No es hipotético — se probó quitando esas dos líneas y generando el PDF:
//
//   con guard:  106 palabras · desplazamiento máx 0,0000 pts · borde der 542,72
//   SIN guard:  la guía sale al **73,3 %** · borde der 447,33 pts
//
// 73,3 % es exactamente la escala de pantalla de 390 px. Este archivo congela la
// CAUSA (jsdom no calcula layout ni imprime); la prueba de verdad la hace
// `scripts/_verif-guia-impresa-identica.mjs` con el Chrome real + pdfinfo +
// pdftotext -bbox, y la medición de pantalla `_medir-guia-imprimir-escala.mjs`.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const leer = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

const HOJA = "src/app/guias/components/HojaEscalada.tsx";
const DETALLE = "src/app/guias/components/GuiaDetail.tsx";
const GLOBALS = "src/app/globals.css";

const hoja = leer(HOJA);
const detalle = leer(DETALLE);

/** El bloque `@media print` que vive dentro del componente. */
function bloquePrint(src: string): string {
  const i = src.indexOf("@media print");
  expect(i, "HojaEscalada tiene que traer su propio bloque @media print").toBeGreaterThan(-1);
  return src.slice(i, src.indexOf("`}</style>", i));
}

describe("🔴 el papel no se entera de la escala", () => {
  const print = bloquePrint(hoja);

  it("anula el transform al imprimir — es lo que evita que la guía salga al 73,3%", () => {
    expect(print).toMatch(/transform:\s*none\s*!important/);
  });

  it("anula también el position — relative crea el MISMO bloque contenedor que transform", () => {
    // El marco necesita position:relative en pantalla para el overlay que
    // amplía. Si eso llegara al print, el #print-document (absolute) se
    // posicionaría contra el marco en vez de contra la página.
    expect(print).toMatch(/position:\s*static\s*!important/);
  });

  it("anula ancho, alto y overflow — un marco con scroll o con alto fijo corta el papel", () => {
    expect(print).toMatch(/width:\s*auto\s*!important/);
    expect(print).toMatch(/height:\s*auto\s*!important/);
    expect(print).toMatch(/overflow:\s*visible\s*!important/);
  });

  it("usa !important a propósito: el transform es estilo INLINE y una clase no le gana", () => {
    const reglas = print.match(/!important/g) ?? [];
    expect(reglas.length).toBeGreaterThanOrEqual(5);
  });

  it("las dos marcas quedan cubiertas por el bloque print", () => {
    expect(print).toContain("[data-hoja-marco]");
    expect(print).toContain("[data-hoja-escala]");
  });

  it("sigue en pie la premisa: globals.css posiciona #print-document en @media print", () => {
    // Si algún día esto dejara de ser cierto, el guard de arriba pasa a ser
    // inofensivo pero deja de ser NECESARIO — y este test avisa para revisarlo.
    const g = leer(GLOBALS);
    const i = g.indexOf("@media print");
    const bloque = g.slice(i, i + 400);
    expect(bloque).toMatch(/#print-document\s*\{[^}]*position:\s*absolute/);
  });

  it("los controles no se imprimen", () => {
    // `.no-print { display: none !important }` ya vive en globals.
    expect(hoja).toContain("no-print");
    expect(leer(GLOBALS)).toMatch(/\.no-print\s*\{\s*display:\s*none\s*!important/);
  });
});

describe("la hoja se achica SOLO si no entra", () => {
  it("el corte es aritmético, no un breakpoint", () => {
    // Un breakpoint fijo acertaría a veces: el ancho natural depende de los
    // DATOS (un cliente con nombre largo ensancha la tabla).
    expect(hoja).toContain("medida.ancho <= medida.disponible");
    expect(hoja).not.toMatch(/\b(sm|md|lg|xl):(hidden|block|flex)/);
  });

  it("nunca AGRANDA: si la hoja entra, la escala es 1 y no se le fija ancho", () => {
    expect(hoja).toContain("const escala = cabe ? 1 : medida.disponible / medida.ancho");
    // Sin ancho fijo cuando entra = iPad, 1024 y escritorio quedan intactos.
    expect(hoja).toContain("achicada\n              ? {\n                  width: medida.ancho,");
  });

  it("mide el ancho natural con scrollWidth, NUNCA con max-content", () => {
    // 🩸 `width: max-content` estira la tabla a 1.616px (no corta ni una línea)
    // y achicaba la hoja en los CUATRO anchos, escritorio incluido.
    expect(hoja).toContain("Math.max(hoja.scrollWidth, hoja.offsetWidth)");
    expect(hoja).not.toContain('width: "max-content"');
  });

  it("se re-mide al cambiar el tamaño (rotar el iPad, abrir el sidebar)", () => {
    expect(hoja).toContain("ResizeObserver");
    expect(hoja).toContain('window.addEventListener("resize"');
  });
});

describe("se ve cómo volver del zoom", () => {
  it("hay un botón de salida, no solo el gesto", () => {
    expect(hoja).toContain("Ver hoja completa");
    expect(hoja).toContain("data-hoja-reducir");
  });

  it("Escape también sale", () => {
    expect(hoja).toMatch(/e\.key === "Escape"/);
  });

  it("los controles llegan a 44px", () => {
    const controles = hoja.match(/min-h-\[44px\]/g) ?? [];
    expect(controles.length).toBeGreaterThanOrEqual(2);
  });

  it("al volver a la hoja completa el marco vuelve al principio", () => {
    // Si quedaba scrolleado a la derecha, la hoja achicada aparecía corrida.
    expect(hoja).toContain("marcoRef.current.scrollLeft = 0");
  });

  it("en español de Panamá: TÚ, nunca VOS", () => {
    // "Toca", "Arrastra" — nunca "Tocá", "Arrastrá".
    expect(hoja).toContain("Toca la hoja");
    expect(hoja).not.toMatch(/\b(Tocá|Arrastrá|Mirá|Volvé|Acercá)\b/);
  });
});

describe("lo que ya estaba arreglado se conserva", () => {
  it("el documento scrollea en su MARCO, no la página entera (#378)", () => {
    expect(hoja).toContain("overflow-x-auto");
    expect(hoja).toContain("data-hoja-marco");
  });

  it("GuiaDetail delega en HojaEscalada y NO envuelve el documento a mano", () => {
    expect(detalle).toContain("<HojaEscalada>");
    expect(detalle).toContain("<PrintDocument guia={guia} />");
    // El marco viejo, escrito a mano en #378, ya no está duplicado acá.
    expect(detalle).not.toContain('className="overflow-x-auto -mx-4 px-4 sm:mx-0');
  });

  it("NO se convirtió en tarjetas: es un documento que se firma y se entrega", () => {
    expect(detalle).not.toContain('data-vista="tarjetas"');
    expect(hoja).not.toContain('data-vista="tarjetas"');
  });
});
