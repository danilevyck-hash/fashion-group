// ─────────────────────────────────────────────────────────────────────────────
// Lo que /guias tiene que DECIR en pantalla, y que no puede dejar de decir.
//
//   1. el chip de una línea atada muestra el NOMBRE, no solo `D-108`;
//   2. en una guía ya despachada queda claro que lo ÚNICO editable es el cliente
//      — sin eso, el chip tocable se lee como si el despacho fuera editable.
//
// Es un test ESTÁTICO sobre el fuente, igual que `guias-atar-cliente-route`:
// lo que se protege es que estas dos cosas no desaparezcan en un refactor.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const leer = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const LISTA = leer("src/app/guias/components/GuiasList.tsx");
const PAGE = leer("src/app/guias/page.tsx");
const RUTA_CLIENTE = leer("src/app/api/guias/[id]/cliente/route.ts");

describe("el chip dice el NOMBRE del cliente, no solo el código", () => {
  it("existe un ChipCliente y es lo que se dibuja en las dos ramas (con y sin permiso)", () => {
    expect(LISTA).toContain("function ChipCliente");
    expect((LISTA.match(/<ChipCliente\b/g) ?? []).length).toBe(2);
  });

  it("🔴 el NOMBRE va primero y el código de apoyo — es el contrato que aprobó Daniel", () => {
    const chip = LISTA.slice(LISTA.indexOf("function ChipCliente"), LISTA.indexOf("const DESPACHO_ROLES"));
    expect(chip).toContain("{codigo}");
    expect(chip).toContain("{nombre}");
    // El nombre sale del mapa del directorio; nunca se arma acá.
    expect(chip).toMatch(/nombres\?\.get\(/);
    // Orden en el JSX: cuando hay nombre, se pinta ANTES que el código.
    const conNombre = chip.slice(chip.indexOf("{nombre ? ("), chip.indexOf(") : ("));
    expect(conNombre.indexOf("{nombre}")).toBeGreaterThan(-1);
    expect(conNombre.indexOf("{codigo}")).toBeGreaterThan(conNombre.indexOf("{nombre}"));
    // 🔴 El código es SECUNDARIO por color y tipografía, nunca por tamaño: en
    // guías nada baja de 12 px (candado `iphone-targets-guias`).
    expect(conNombre).toMatch(/font-mono/);
    expect(conNombre).toMatch(/text-emerald-600/);
    expect(conNombre).not.toMatch(/text-\[\d+px\]/);
  });

  it("🔴 sin directorio, el chip degrada al código pelado — nunca inventa un nombre", () => {
    const chip = LISTA.slice(LISTA.indexOf("function ChipCliente"), LISTA.indexOf("const DESPACHO_ROLES"));
    // Con nombre se pinta nombre+código; SIN nombre, el código solo — que es
    // exactamente como se veía antes de este cambio.
    expect(chip).toMatch(/\{nombre \? \(/);
    const sinNombre = chip.slice(chip.indexOf(") : ("), chip.indexOf("</span>\n    </span>"));
    expect(sinNombre).toContain("{codigo}");
    expect(sinNombre).not.toContain("{nombre}");
    // Y el fallback tiene que ser VACÍO. Un `|| "Cliente"` acá pintaría un
    // nombre de relleno que se lee como si el sistema supiera de quién se
    // trata — peor que no decir nada.
    const linea = chip.split("\n").find((l) => l.includes("const nombre ="));
    expect(linea).toBeDefined();
    expect(linea).toContain('?? ""');
    expect(linea).not.toMatch(/["'`][A-Za-zÀ-ÿ]/);
  });

  it("🔴 un nombre largo BAJA DE LÍNEA, no se esconde", () => {
    // Truncar sería deshacer lo que este cambio vino a arreglar. El peor caso
    // real, medido sobre los 148 clientes D-XXX vivos, es de 47 caracteres:
    // "Sistema Nacional De Proteccion Civil (Sinaproc)" (D-138).
    const chip = LISTA.slice(LISTA.indexOf("function ChipCliente"), LISTA.indexOf("const DESPACHO_ROLES"));
    expect(chip).toContain("break-words");
    expect(chip).not.toContain("truncate");
    expect(chip).not.toMatch(/max-w-\[\d/);
    expect(chip).toContain("title=");
  });

  it("la página le pasa el mapa a la lista y al modal, desde el caché del selector", () => {
    expect(PAGE).toContain("useNombresDeClientes");
    expect(PAGE).toContain("nombresPorCodigo={nombresPorCodigo}");
    expect(PAGE).toContain("nombreActual=");
  });

  it("el chip SIGUE siendo un botón — una línea mal atada tiene que poder corregirse", () => {
    // Regla del PR #443: sin esto, un código equivocado sería para siempre.
    expect((LISTA.match(/puedeAtarCliente && item\.id/g) ?? []).length).toBe(2);
    const celda = LISTA.slice(LISTA.indexOf("item.cliente_codigo ? ("), LISTA.indexOf("Atar cliente"));
    expect(celda).toContain("<button");
    expect(celda).toContain("onAtarCliente?.(item)");
  });
});

describe("en una guía despachada se dice qué se puede tocar", () => {
  const RE_AVISO = /\{isDispatched && puedeAtarCliente && \(\s*<p/;

  it("🔴 dice exactamente el texto aprobado", () => {
    expect(LISTA).toMatch(RE_AVISO);
    const i = LISTA.search(RE_AVISO);
    expect(LISTA.slice(i, i + 400)).toContain("Solo se puede cambiar el cliente");
  });

  it("🔴 va en la CABECERA y UNA vez por guía — nunca por línea", () => {
    // Repetido por renglón saldría cinco veces en una guía como GT-189.
    expect((LISTA.match(/Solo se puede cambiar el cliente/g) ?? []).length).toBe(1);
    const iAviso = LISTA.search(RE_AVISO);
    const iAcciones = LISTA.indexOf("{/* Acciones rápidas (header de la card expandida) */}");
    const iTabla = LISTA.indexOf("{/* Items table */}");
    expect(iAviso).toBeGreaterThan(-1);
    expect(iAviso).toBeLessThan(iAcciones); // arriba de todo
    expect(iAviso).toBeLessThan(iTabla);
    // Y fuera del `.map` de los ítems.
    expect(iAviso).toBeLessThan(LISTA.indexOf("(expandedGuia.guia_items || []).map("));
  });

  it("no promete editar el cliente a quien no puede hacerlo", () => {
    const i = LISTA.search(RE_AVISO);
    expect(LISTA.slice(i, i + 120)).toContain("puedeAtarCliente");
  });

  it("🔴 y el candado del despacho sigue intacto: atar NO mira el estado", () => {
    const soloCodigo = RUTA_CLIENTE.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*")).join("\n");
    expect(soloCodigo).not.toContain("Completada");
    expect(soloCodigo).not.toMatch(/\bestado\b/);
    expect(leer("src/app/api/guias/[id]/route.ts")).toContain("Guía ya despachada, no se puede editar");
  });
});
