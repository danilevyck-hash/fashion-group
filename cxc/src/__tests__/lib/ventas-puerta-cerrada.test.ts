// ─────────────────────────────────────────────────────────────────────────────
// VENTAS — LA PUERTA DE ATRÁS SE CIERRA Y LO QUE NO ES DE VENTAS SE VA
// (11-sep-2026, punto 13 del rediseño aprobado por Daniel).
//
// 🩸 LO QUE MEDÍA EL MAPA. La pantalla `/ventas` manda a `/home` a todo lo que
// no sea admin, pero SEIS rutas de datos del módulo aceptaban `contabilidad`
// (`/resumen`, `/resumen-anual`, `/mes-anio`, `/clientes-12m`, `/años` y `/v2`):
// con su sesión y la dirección, contabilidad se llevaba el resumen entero del
// grupo y la lista de clientes con montos. Peor: `/v2/status` aceptaba
// `secretaria`, un rol que no tiene nada en Ventas — y era una ruta que nadie
// llamaba. Había **208 líneas de rutas sin un solo llamador** (`/v2` 124,
// `/v2/status` 53, `/años` 31) más `/ventas/reporte`, siete líneas que solo
// redirigían. Y **~5.900 líneas de componentes en `components/ventas/`** que
// ya no eran de Ventas: los 16 de Comisiones (viven en `/comisiones` desde el
// 5-sep-2026) y los 3 de Referencia (en `/referencia` desde el 12-ago-2026).
// La búsqueda global, además, le ofrecía a contabilidad un resultado «Ventas»
// que la mandaba a una puerta cerrada.
//
// Este candado exige las cinco cosas, y DERIVA las listas del disco (glob, no
// nombres escritos a mano): retirar otra ruta mañana no lo rompe, y una ruta
// nueva que nazca con la lista de roles a mano lo pone rojo.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import path from "path";

const raiz = path.resolve(__dirname, "../../..");
const leer = (rel: string) => readFileSync(path.join(raiz, rel), "utf8");
const plano = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/** Todos los archivos bajo `dir` (recursivo), como rutas relativas a la raíz. */
function archivosBajo(dirRel: string): string[] {
  const abs = path.join(raiz, dirRel);
  if (!existsSync(abs)) return [];
  const out: string[] = [];
  const caminar = (d: string) => {
    for (const nombre of readdirSync(d)) {
      const p = path.join(d, nombre);
      if (statSync(p).isDirectory()) caminar(p);
      else out.push(path.relative(raiz, p));
    }
  };
  caminar(abs);
  return out.sort();
}

/** Las rutas de DATOS de Ventas: todo `route.ts` bajo `api/ventas`, menos los
 *  módulos que ya no son de Ventas y tienen su propia lista de roles. */
const rutasDeVentas = archivosBajo("src/app/api/ventas").filter(
  (p) =>
    p.endsWith("route.ts") &&
    !p.includes("/api/ventas/comisiones/") &&
    !p.includes("/api/ventas/referencia/"),
);

describe("1 · las rutas de datos de Ventas son solo admin, como la pantalla", () => {
  it("hay rutas que barrer (el glob no puede estar vacío)", () => {
    expect(rutasDeVentas.length).toBeGreaterThan(0);
  });

  it.each(rutasDeVentas)("%s — cada requireRole lleva exactamente [\"admin\"]", (rel) => {
    const src = plano(leer(rel));
    const llamadas = [...src.matchAll(/requireRole\(\s*req\s*,\s*(\[[^\]]*\])/g)].map((m) => m[1]);
    expect(llamadas.length, `${rel} no tiene requireRole`).toBeGreaterThan(0);
    for (const lista of llamadas) {
      expect(lista.replace(/\s+/g, ""), rel).toBe('["admin"]');
    }
    expect(src, `${rel} nombra a contabilidad`).not.toMatch(/"contabilidad"/);
    expect(src, `${rel} nombra a secretaria`).not.toMatch(/"secretaria"/);
  });

  it("la pantalla sigue siendo admin-only (es contra lo que se cierran las rutas)", () => {
    const page = plano(leer("src/app/ventas/page.tsx"));
    expect(page).toContain('if (role !== "admin") redirect("/home")');
  });
});

describe("2 · las rutas sin llamador se retiraron", () => {
  it.each([
    "src/app/api/ventas/v2",
    "src/app/api/ventas/años",
    "src/app/ventas/reporte",
  ])("%s ya no existe", (rel) => {
    expect(existsSync(path.join(raiz, rel))).toBe(false);
  });

  it("y nadie en src/ las llama", () => {
    const todo = [...archivosBajo("src/app"), ...archivosBajo("src/components"), ...archivosBajo("src/lib")]
      .filter((p) => /\.(ts|tsx)$/.test(p));
    for (const rel of todo) {
      const src = plano(leer(rel));
      expect(src, rel).not.toMatch(/api\/ventas\/v2\b/);
      expect(src, rel).not.toMatch(/api\/ventas\/años/);
      expect(src, rel).not.toMatch(/ventas_status_summary/);
    }
  });

  it("`/ventas/reporte` sigue llegando, por next.config.js", () => {
    const cfg = leer("next.config.js");
    expect(cfg).toContain('source: "/ventas/reporte", destination: "/ventas", permanent: false');
  });
});

describe("3 · Comisiones y Referencia viven en su carpeta, no en la de Ventas", () => {
  it("no queda ningún archivo de Comisiones ni de Referencia en components/ventas/", () => {
    const ajenos = archivosBajo("src/components/ventas").filter((p) =>
      /\/(Comisiones|comisiones-|Referencia|MarcaClientesSinComision)/.test(p),
    );
    expect(ajenos).toEqual([]);
  });

  it("las carpetas nuevas existen y traen lo mudado", () => {
    const comisiones = archivosBajo("src/components/comisiones");
    const referencia = archivosBajo("src/components/referencia");
    expect(comisiones.some((p) => p.endsWith("ComisionesView.tsx"))).toBe(true);
    expect(comisiones.some((p) => p.includes("comisiones-config/"))).toBe(true);
    expect(comisiones.some((p) => p.includes("comisiones-detalle/"))).toBe(true);
    expect(referencia.some((p) => p.endsWith("ReferenciaView.tsx"))).toBe(true);
  });

  it("las páginas importan de la carpeta nueva (ninguna pantalla cambió)", () => {
    expect(plano(leer("src/app/comisiones/ComisionesPageClient.tsx")))
      .toContain('from "@/components/comisiones/ComisionesView"');
    expect(plano(leer("src/app/referencia/ReferenciaClient.tsx")))
      .toContain('from "@/components/referencia/ReferenciaView"');
  });

  it("nadie sigue importando lo mudado por el path viejo", () => {
    const todo = [...archivosBajo("src/app"), ...archivosBajo("src/components"), ...archivosBajo("src/lib"), ...archivosBajo("src/__tests__")]
      .filter((p) => /\.(ts|tsx)$/.test(p));
    for (const rel of todo) {
      const src = leer(rel);
      expect(src, rel).not.toMatch(/components\/ventas\/(Comisiones|comisiones-|Referencia|MarcaClientesSinComision)/);
    }
  });
});

describe("4 · la búsqueda global no le ofrece «Ventas» a contabilidad", () => {
  it("la rama de contabilidad devuelve ventas vacío", () => {
    const src = plano(leer("src/app/api/search/route.ts"));
    const i = src.indexOf('role === "contabilidad"');
    expect(i).toBeGreaterThan(-1);
    const rama = src.slice(i, src.indexOf("}", src.indexOf("NextResponse.json", i)));
    expect(rama).not.toContain("ventas: allResults.ventas");
    expect(rama).toContain("ventas: []");
    expect(rama).toContain("prestamos: allResults.prestamos");
  });
});
