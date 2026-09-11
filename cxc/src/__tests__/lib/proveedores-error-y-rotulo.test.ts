/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CANDADO — PROVEEDORES NO MIENTE: NI CUANDO FALLA, NI EN EL RÓTULO
 *
 * 11-sep-2026. Dos defectos de la misma pantalla.
 *
 * 🩸 1. UNA LECTURA CAÍDA SE MOSTRABA COMO «no hay nada». El `fetch` ignoraba
 * todo lo que no fuera 200: no guardaba el error, no reintentaba, y la lista se
 * quedaba vacía — o sea, con el cartel **«Sin proveedores — No hay datos
 * sincronizados aún»**. Con $4.696.830,50 en la cartera, decirle a la contadora
 * que no hay datos es la peor respuesta posible: los datos están, lo que se
 * cayó fue la consulta. Ahora dice **«No se pudo cargar. Intenta de nuevo en
 * unos segundos»** con su botón, y lo que ya estaba en pantalla NO se borra.
 *
 * 🩸 2. EL CARTEL GRANDE DECÍA «Por pagar · grupo» CON EL NÚMERO FILTRADO.
 * Escribir «boston» en el buscador dejaba en pantalla «Por pagar · grupo
 * $4,165.96» contra los $4.696.830,50 de verdad. Con el chip de empresa sí
 * cambiaba el rótulo; con el buscador, no. La regla vive en un módulo puro
 * (`lib/proveedores/rotulo.ts`) y el buscador manda sobre el chip porque es el
 * filtro más fino.
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { rotuloPorPagar } from "@/lib/proveedores/rotulo";

const leer = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, "");

const VISTA = sinComentarios(leer("src/app/proveedores/ProveedoresListClient.tsx"));

describe("🔴 el rótulo dice de QUÉ es el número", () => {
  it("sin filtros, el grupo", () => {
    expect(rotuloPorPagar(null, "")).toBe("Por pagar · grupo");
    expect(rotuloPorPagar(undefined, undefined)).toBe("Por pagar · grupo");
  });

  it("con empresa elegida, la empresa", () => {
    expect(rotuloPorPagar("Vistana", "")).toBe("Por pagar · Vistana");
  });

  it("🔴 con búsqueda escrita, LO BUSCADO — el caso que lo destapó", () => {
    expect(rotuloPorPagar(null, "boston")).toBe("Por pagar · boston");
    expect(rotuloPorPagar(null, "boston")).not.toContain("grupo");
  });

  it("la búsqueda manda sobre el chip de empresa", () => {
    expect(rotuloPorPagar("Vistana", "latin")).toBe("Por pagar · latin");
  });

  it("lo buscado se muestra como se tecleó, solo sin bordes", () => {
    expect(rotuloPorPagar(null, "  Latin Fitness  ")).toBe("Por pagar · Latin Fitness");
    // Nada de capitalizar ni normalizar: la persona tiene que reconocer lo suyo.
    expect(rotuloPorPagar(null, "boston")).not.toContain("BOSTON");
  });

  it("la pantalla usa la función, no arma el texto a mano", () => {
    expect(VISTA).toContain("rotuloPorPagar(");
    expect(VISTA).not.toContain('"Por pagar · grupo"');
  });
});

describe("🔴 una lectura que falla se dice y se puede reintentar", () => {
  it("el fetch mira el status y guarda el fallo", () => {
    expect(VISTA).toContain("if (!res.ok) throw new Error");
    expect(VISTA).toContain("setFalloLectura(true)");
    expect(VISTA).toContain("setFalloLectura(false)");
  });

  it("el aviso dice qué pasó y ofrece intentar otra vez", () => {
    expect(VISTA).toContain("No se pudo cargar. Intenta de nuevo en unos segundos.");
    expect(VISTA).toContain("Intentar de nuevo");
    expect(VISTA).toContain("void fetchList(empresa, q)");
  });

  it("🔴 el vacío deja de afirmar «no hay datos» cuando lo que hubo fue un error", () => {
    expect(VISTA).toContain('title={falloLectura ? "No se pudo cargar" : "Sin proveedores"}');
  });

  it("CONTROL: el vacío de verdad sigue diciendo lo suyo", () => {
    expect(VISTA).toContain("No hay datos sincronizados aún.");
  });

  it("el botón de reintentar se toca en 44 px", () => {
    expect(VISTA).toMatch(/Intentar de nuevo[\s\S]{0,40}<\/button>/);
    const bloque = VISTA.slice(VISTA.indexOf("falloLectura && ("), VISTA.indexOf("Intentar de nuevo"));
    expect(bloque).toContain("min-h-[44px]");
  });
});
