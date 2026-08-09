// ─────────────────────────────────────────────────────────────────────────────
// Candado del alias de display de clientes.
//
// El riesgo que cubre no es que el alias esté mal escrito: es que la pantalla
// se CONTRADIGA. Si el chip de la guía dice "American Classics Store" y el
// buscador del selector no encuentra nada con ese texto, quien lo lea va a
// concluir que el cliente no existe. Medido contra producción antes del cambio:
//     "american classics store" → 0 coincidencias
// Por eso el alias y los campos de búsqueda viven en el MISMO módulo y este
// test los prueba juntos, con el matcher REAL.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ALIAS_DISPLAY_CLIENTE,
  nombreParaMostrar,
  camposDeBusquedaCliente,
} from "@/lib/clientes/nombre-display";
import { coincideBusqueda } from "@/lib/buscar-normalizado";

/** Los clientes reales que importan acá, tal como están en `clientes_master`. */
const D108 = { codigo: "D-108", nombre: "Multi Fashion Holding", razon_social: null };
const D201 = { codigo: "D-201", nombre: "American Classics", razon_social: null };
const D24 = { codigo: "D-24", nombre: "City Mall David", razon_social: null };
const D25 = { codigo: "D-25", nombre: "City Mall Paso Canoa", razon_social: null };

describe("nombreParaMostrar", () => {
  it("🔴 D-108 se muestra como 'American Classics Store' — pedido explícito de Daniel", () => {
    expect(nombreParaMostrar("D-108", "Multi Fashion Holding")).toBe("American Classics Store");
  });

  it("cualquier otro cliente conserva su nombre de la base", () => {
    expect(nombreParaMostrar("D-25", "City Mall Paso Canoa")).toBe("City Mall Paso Canoa");
    expect(nombreParaMostrar("D-201", "American Classics")).toBe("American Classics");
  });

  it("tolera código con espacios y en minúsculas", () => {
    expect(nombreParaMostrar("  d-108  ", "Multi Fashion Holding")).toBe("American Classics Store");
  });

  it("sin nombre ni alias devuelve vacío — nunca inventa un texto", () => {
    expect(nombreParaMostrar("D-999", null)).toBe("");
    expect(nombreParaMostrar(null, null)).toBe("");
    expect(nombreParaMostrar("", "  ")).toBe("");
  });

  it("el alias gana aunque no venga el nombre oficial", () => {
    expect(nombreParaMostrar("D-108", null)).toBe("American Classics Store");
  });

  it("🔴 D-201 NO tiene alias: es un duplicado, no se le facilita ser elegido", () => {
    expect(ALIAS_DISPLAY_CLIENTE["D-201"]).toBeUndefined();
  });

  it("la lista de alias es CORTA a propósito — cada entrada es una verdad que la base no tiene", () => {
    expect(Object.keys(ALIAS_DISPLAY_CLIENTE)).toEqual(["D-108"]);
  });
});

describe("camposDeBusquedaCliente — el alias también se puede TECLEAR", () => {
  const buscar = (q: string, c: Parameters<typeof camposDeBusquedaCliente>[0]) =>
    coincideBusqueda(q, camposDeBusquedaCliente(c));

  it("🩸 'american classics store' encuentra D-108 (antes daba 0)", () => {
    expect(buscar("american classics store", D108)).toBe(true);
    expect(buscar("American Classics Store", D108)).toBe(true);
    expect(buscar("americanclassicsstore", D108)).toBe(true);
  });

  it("el nombre oficial y el código siguen encontrándolo", () => {
    expect(buscar("multifashion", D108)).toBe(true);
    expect(buscar("multi fashion", D108)).toBe(true);
    expect(buscar("d108", D108)).toBe(true);
    expect(buscar("D-108", D108)).toBe(true);
  });

  it("🔴 'City Mall' ofrece LAS DOS tiendas — es el caso que motivó todo", () => {
    expect(buscar("City Mall", D24)).toBe(true);
    expect(buscar("City Mall", D25)).toBe(true);
    expect(buscar("city mall", D24)).toBe(true);
    expect(buscar("CITY MALL", D25)).toBe(true);
    expect(buscar("citymall", D24)).toBe(true);
    expect(buscar("Cíty Máll", D25)).toBe(true);
  });

  it("el alias no vuelve buscable a quien no lo tiene", () => {
    expect(buscar("american classics store", D201)).toBe(false);
    expect(buscar("american classics store", D25)).toBe(false);
  });

  it("no ensancha el colador: una consulta que no coincidía sigue sin coincidir", () => {
    expect(buscar("jerusalem", D108)).toBe(false);
    expect(buscar("sporting", D24)).toBe(false);
  });
});

describe("candado estático — el alias no puede vivir en dos lados", () => {
  const leer = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

  it("los dos caminos de búsqueda usan camposDeBusquedaCliente, no una lista a mano", () => {
    // El del navegador y el del servidor. Si uno filtrara distinto, el usuario
    // vería resultados distintos según si el caché cargó o no.
    for (const p of ["src/lib/hooks/useBusquedaClientes.ts", "src/app/api/clientes/route.ts"]) {
      const src = leer(p);
      expect(src).toContain("camposDeBusquedaCliente");
      expect(src).not.toMatch(/coincideBusqueda\([^)]*\[\s*c\.nombre/);
    }
  });

  it("nadie más escribe 'American Classics Store' a mano", () => {
    const enModulo = leer("src/lib/clientes/nombre-display.ts");
    expect(enModulo).toContain("American Classics Store");
    for (const p of [
      "src/app/guias/components/GuiasList.tsx",
      "src/app/guias/components/AtarClienteModal.tsx",
      "src/components/ClientePicker.tsx",
      "src/app/guias/page.tsx",
    ]) {
      expect(leer(p)).not.toContain("American Classics Store");
    }
  });

  it("el chip y la lista del selector leen el MISMO nombre", () => {
    expect(leer("src/components/ClientePicker.tsx")).toContain("nombreParaMostrar");
    expect(leer("src/lib/hooks/useBusquedaClientes.ts")).toContain("nombreParaMostrar");
  });
});
