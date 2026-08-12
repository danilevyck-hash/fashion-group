// ─────────────────────────────────────────────────────────────────────────────
// La lista de empresas con catálogo se DERIVA de las marcas, nunca se escribe.
//
// 🩸 EL BUG (6-ago-2026). Daniel armó un pedido de Tommy de $1.584,00 y el botón
// "Enviar a Switch" estaba apagado con el aviso *"No tienes vendedor
// de Switch asignado — pídele al admin asignarlo en Sistema → Usuarios"*. Fue a
// Usuarios y ahí SOLO estaban Reebok y Joybees: no había forma de asignárselo.
//
// La causa eran TRES listas escritas a mano, todas con las mismas dos empresas,
// ninguna actualizada cuando se encendió el catálogo de Tommy:
//   1. `EMPRESAS` en la pantalla de Usuarios      → Tommy ni aparecía
//   2. /api/admin/switch-vendedores               → 400 "empresa inválida"
//   3. /api/catalogo/mi-vendedor                  → 400 "empresa inválida"
//
// Todo lo demás YA era genérico: la tabla de mapeos y el checkout aceptan
// cualquier empresa. Y Switch tenía los vendedores de fashion_shoes todo el
// tiempo (REINALDO ESPINOSA y DEFAULT, verificado en vivo). O sea: tres
// arreglos de dos elementos bloquearon una marca entera.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { EMPRESAS_CATALOGO, MARCAS_CONFIG } from "@/lib/catalogo/marcas";
import { MARCAS_UI, getMarcaTheme } from "@/lib/catalogo/marcas-ui";

const raiz = process.cwd();
const leer = (p: string) => readFileSync(path.join(raiz, p), "utf8");

describe("🔴 toda marca encendida tiene su empresa habilitada", () => {
  it("EMPRESAS_CATALOGO son exactamente las empresas de las marcas", () => {
    const esperadas = new Set(Object.values(MARCAS_CONFIG).map((m) => m.empresaKey));
    expect([...EMPRESAS_CATALOGO].sort()).toEqual([...esperadas].sort());
  });

  it("Tommy está — era el que faltaba", () => {
    expect(EMPRESAS_CATALOGO.has("fashion_shoes")).toBe(true);
    expect(EMPRESAS_CATALOGO.has("active_shoes")).toBe(true);
    expect(EMPRESAS_CATALOGO.has("joystep")).toBe(true);
  });

  it("Calvin (vistana) entra derivado, sin tocar las listas a mano", () => {
    expect(EMPRESAS_CATALOGO.has("vistana")).toBe(true);
  });

  it("una empresa del grupo SIN catálogo no entra", () => {
    // La lista habilita llamadas a Switch y lectura de mapeos: que no se
    // convierta en "todas las empresas" por comodidad. (vistana salió de esta
    // lista al encender el catálogo Calvin Klein, ago-2026.)
    for (const k of ["fashion_wear", "american_classic", "confecciones_boston"]) {
      expect(EMPRESAS_CATALOGO.has(k)).toBe(false);
    }
  });

  it("la pantalla de Usuarios llega a las MISMAS empresas", () => {
    // No puede importar `marcas.ts` (es servidor, trae clientes de base), así
    // que deriva de `MARCAS_UI`. Este test es lo que sostiene que las dos
    // derivaciones no se separen.
    const desdeUi = MARCAS_UI.map((m) => getMarcaTheme(m)!.empresaKey);
    expect([...desdeUi].sort()).toEqual([...EMPRESAS_CATALOGO].sort());
  });
});

describe("🔴 nadie vuelve a escribir la lista a mano", () => {
  const RUTAS = [
    "src/app/api/admin/switch-vendedores/route.ts",
    "src/app/api/catalogo/mi-vendedor/route.ts",
  ];

  it("las dos rutas importan la fuente única", () => {
    for (const r of RUTAS) {
      expect(leer(r), r).toContain('import { EMPRESAS_CATALOGO } from "@/lib/catalogo/marcas"');
    }
  });

  it("⚠️ ningún archivo vuelve a listar active_shoes + joystep a mano", () => {
    // El barrido es lo que caza la reincidencia: el bug no fue una lista mal
    // escrita, fue TRES copias de la misma y ninguna se actualizó.
    for (const r of [...RUTAS, "src/app/admin/usuarios/VendedorSwitchSection.tsx"]) {
      const src = leer(r);
      expect(src, `${r} escribe la lista a mano`).not.toMatch(
        /\[\s*"active_shoes"\s*,\s*"joystep"\s*\]/,
      );
      expect(src, `${r} escribe la empresa a mano`).not.toContain('key: "active_shoes"');
    }
  });

  it("la pantalla de Usuarios deriva de MARCAS_UI", () => {
    const sec = leer("src/app/admin/usuarios/VendedorSwitchSection.tsx");
    expect(sec).toContain("MARCAS_UI.map((marca)");
    expect(sec).toContain("theme.empresaKey");
  });
});

describe("🔴 la etiqueta dice marca Y empresa", () => {
  it("se arma con el nombre real de la empresa, no con la key", () => {
    // "Tommy Hilfiger (Fashion Shoes)": la marca es lo que el vendedor
    // reconoce, la empresa es lo que hay que elegir en Switch.
    const sec = leer("src/app/admin/usuarios/VendedorSwitchSection.tsx");
    expect(sec).toContain("EMPRESA_KEY_TO_NAME[theme.empresaKey]");
    expect(sec).toContain("${theme.label} (");
  });

  it("las 3 empresas tienen nombre humano", async () => {
    const { EMPRESA_KEY_TO_NAME } = await import("@/lib/empresa-mapping");
    for (const k of EMPRESAS_CATALOGO) {
      expect(EMPRESA_KEY_TO_NAME[k], k).toBeTruthy();
    }
    expect(EMPRESA_KEY_TO_NAME["fashion_shoes"]).toBe("Fashion Shoes");
  });
});
