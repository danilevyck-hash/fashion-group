// ─────────────────────────────────────────────────────────────────────────────
// PRÉSTAMOS: UNA SOLA PUERTA, NUNCA DOS (10-sep-2026).
//
// Este candado prueba las DOS direcciones, y las dos importan igual:
//
//   · APAGADO  → el módulo suelto está en el menú, `/prestamos` no redirige, y
//                Asistencia NO tiene pestaña de Préstamos. O sea: el sistema de
//                hoy, sin una coma de diferencia. Es la mitad que protege a
//                producción el día que esto se sube con el interruptor en cero.
//   · PRENDIDO → la pestaña es la ÚNICA puerta: la ficha sale del menú y del
//                home, `/prestamos` EXACTO redirige con 307 y la query intacta,
//                y la pestaña la autoriza el módulo PRÉSTAMOS.
//                ⚠️ 11-sep-2026: `/prestamos/<id>` (los movimientos de una
//                persona) YA NO redirige — la pestaña la ENLAZA. Daniel: *«sí,
//                arregla lo de préstamos»*. Ver la sección B.
//
// 🔴 Lo que este candado NO deja pasar nunca, en ningún estado del interruptor:
// que `/api/prestamos/*` se redirija (son las rutas que la pestaña usa para
// leer y escribir), y que alguien que hoy entra a Préstamos se quede sin puerta.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";

const RAIZ = path.resolve(__dirname, "../../..");
const leer = (p: string) => fs.readFileSync(path.join(RAIZ, p), "utf8");

/** Carga el módulo con el interruptor en el estado pedido. */
async function conInterruptor(prendido: boolean) {
  vi.resetModules();
  if (prendido) vi.stubEnv("NEXT_PUBLIC_PLANILLA_UNIDA", "1");
  else vi.stubEnv("NEXT_PUBLIC_PLANILLA_UNIDA", "");
  return await import("@/lib/prestamos-una-puerta");
}

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllEnvs());

describe("A. APAGADO — el módulo es exactamente el de hoy", () => {
  it("la ficha de Préstamos sigue en el menú y en el home", async () => {
    const m = await conInterruptor(false);
    expect(m.moduloPrestamosEnElMenu()).toBe(true);
  });

  it("🔴 `/prestamos` NO redirige a ningún lado", async () => {
    const m = await conInterruptor(false);
    expect(m.destinoDePrestamos("/prestamos", "")).toBeNull();
    expect(m.destinoDePrestamos("/prestamos/42", "")).toBeNull();
    expect(m.destinoDePrestamos("/prestamos/aprobaciones", "")).toBeNull();
  });

  it("la página de la persona enlaza a la ficha de siempre", async () => {
    const m = await conInterruptor(false);
    expect(m.enlaceAPrestamos()).toBe("/prestamos");
    expect(m.enlaceAPrestamos("42")).toBe("/prestamos/42");
    expect(m.enlaceVolverAPrestamos()).toBe("/prestamos");
  });

  it("🔴 Asistencia NO tiene pestaña de Préstamos", async () => {
    vi.stubEnv("NEXT_PUBLIC_PLANILLA_UNIDA", "");
    vi.resetModules();
    const { pestanasDeAsistencia } = await import("@/lib/asistencia/persona-en-el-centro");
    const claves = pestanasDeAsistencia({ personaEnElCentro: false, planillaUnida: false })
      .map(([k]) => k);
    expect(claves).not.toContain("prestamos");
  });
});

describe("B. PRENDIDO — la pestaña es la única puerta", () => {
  it("🔴 la ficha suelta sale del menú y del home", async () => {
    const m = await conInterruptor(true);
    expect(m.moduloPrestamosEnElMenu()).toBe(false);
  });

  // ⚠️ CAMBIÓ DE DIRECCIÓN EL 11-SEP-2026, NO SE BORRÓ. Decía «`/prestamos` y sus
  // subrutas van a la pestaña» y probaba `/prestamos/42` → pestaña. Con eso
  // desapareció la ÚNICA pantalla que muestra los movimientos de una persona.
  // Daniel: *«sí, arregla lo de préstamos»* (mockup: tocar el nombre abre los
  // movimientos). Ahora solo la LISTA rebota; la página de la persona se queda.
  it("🔴 `/prestamos` EXACTO va a la pestaña; `/prestamos/<id>` (los movimientos) NO rebota", async () => {
    const m = await conInterruptor(true);
    expect(m.destinoDePrestamos("/prestamos", "")).toBe("/asistencia?tab=prestamos");
    expect(m.destinoDePrestamos("/prestamos/", "")).toBe("/asistencia?tab=prestamos");
    expect(m.destinoDePrestamos("/prestamos/42", "")).toBeNull();
    expect(m.esRutaDelModuloPrestamos("/prestamos/42")).toBe(false);
  });

  it("🔴 LA QUERY VIAJA INTACTA — un enlace con `persona` no la pierde", async () => {
    const m = await conInterruptor(true);
    const d = m.destinoDePrestamos("/prestamos", "?persona=7&desde=2026-09-01")!;
    const q = new URLSearchParams(d.split("?")[1]);
    expect(q.get("persona")).toBe("7");
    expect(q.get("desde")).toBe("2026-09-01");
    expect(q.get("tab")).toBe("prestamos");
  });

  it("un `tab` que venga en la query NO gana: el destino ES la pestaña", async () => {
    const m = await conInterruptor(true);
    const d = m.destinoDePrestamos("/prestamos", "?tab=planilla")!;
    expect(new URLSearchParams(d.split("?")[1]).get("tab")).toBe("prestamos");
  });

  it("la página de la persona enlaza a la PESTAÑA (la lista) y a los MOVIMIENTOS (la ficha)", async () => {
    const m = await conInterruptor(true);
    expect(m.enlaceAPrestamos()).toBe("/asistencia?tab=prestamos");
    // ⚠️ 11-sep-2026: con id es la página de sus movimientos, que ya no rebota.
    expect(m.enlaceAPrestamos("42")).toBe("/prestamos/42");
    // Y «← Préstamos» desde esa página vuelve a la pestaña.
    expect(m.enlaceVolverAPrestamos()).toBe("/asistencia?tab=prestamos");
  });

  it("la pestaña aparece en la lista de Asistencia", async () => {
    vi.stubEnv("NEXT_PUBLIC_PLANILLA_UNIDA", "1");
    vi.resetModules();
    const { pestanasDeAsistencia } = await import("@/lib/asistencia/persona-en-el-centro");
    const claves = pestanasDeAsistencia({ personaEnElCentro: false, planillaUnida: true })
      .map(([k]) => k);
    expect(claves).toContain("prestamos");
  });
});

describe("C. 🔴 LAS RUTAS DE DATOS NO SE TOCAN", () => {
  it("`/api/prestamos/*` nunca redirige, ni con el interruptor prendido", async () => {
    const m = await conInterruptor(true);
    for (const r of [
      "/api/prestamos/empleados",
      "/api/prestamos/movimientos",
      "/api/prestamos/pendientes",
      "/api/prestamos/empleados/42",
    ]) {
      expect(m.esRutaDelModuloPrestamos(r)).toBe(false);
      expect(m.destinoDePrestamos(r, "")).toBeNull();
    }
  });

  // 🔑 ESTE SE PRUEBA SOBRE EL FUENTE, Y NO ES PEREZA. Hoy el guard de `/api/`
  // es INALCANZABLE —ninguna ruta de datos empieza con `/prestamos/`, empiezan
  // con `/api/`— así que quitarlo no cambia ninguna conducta y ninguna prueba
  // de comportamiento podría cazarlo. Es defensa en profundidad: existe para el
  // día que alguien afloje el reconocimiento de la ruta (la mutación de acá
  // abajo lo afloja, y entonces el guard SÍ decide). Un guard que no se puede
  // probar por conducta se ancla donde vive, o se borra sin que nadie se entere.
  it("🔴 el guard de `/api/` sigue escrito en el módulo", () => {
    const src = leer("src/lib/prestamos-una-puerta.ts");
    expect(src).toMatch(/if \(p\.startsWith\("\/api\/"\)\) return false;/);
  });

  it("una dirección que solo EMPIEZA parecido no se lleva por delante", async () => {
    const m = await conInterruptor(true);
    expect(m.esRutaDelModuloPrestamos("/prestamos-otros")).toBe(false);
    expect(m.destinoDePrestamos("/asistencia", "")).toBeNull();
  });
});

describe("D. 🔴 NADIE PIERDE LA PUERTA", () => {
  it("quien entra al módulo Préstamos ve la pestaña", async () => {
    const { PRESTAMOS_ROLES } = await import("@/lib/prestamos-roles");
    const { vePestanaPrestamos } = await conInterruptor(true);
    for (const rol of PRESTAMOS_ROLES) expect(vePestanaPrestamos(rol)).toBe(true);
  });

  it("la secretaria la sigue viendo (entra SOLO A VER, y eso ya era así)", async () => {
    const { vePestanaPrestamos } = await conInterruptor(true);
    expect(vePestanaPrestamos("secretaria")).toBe(true);
  });

  it("🔴 bodega y vendedor NO", async () => {
    const { vePestanaPrestamos } = await conInterruptor(true);
    expect(vePestanaPrestamos("bodega")).toBe(false);
    expect(vePestanaPrestamos("vendedor")).toBe(false);
    expect(vePestanaPrestamos("")).toBe(false);
    expect(vePestanaPrestamos(null)).toBe(false);
  });

  it("🔴 la lista se DERIVA de PRESTAMOS_ROLES, no se teclea", async () => {
    const { PRESTAMOS_ROLES } = await import("@/lib/prestamos-roles");
    const { PRESTAMOS_PESTANA_ROLES } = await conInterruptor(true);
    for (const r of PRESTAMOS_ROLES) expect(PRESTAMOS_PESTANA_ROLES).toContain(r);
    const src = leer("src/lib/prestamos-una-puerta.ts");
    expect(src).toMatch(/\.\.\.PRESTAMOS_ROLES/);
  });

  it("🔴 la pestaña se autoriza por PRÉSTAMOS, no por tener Asistencia", async () => {
    const src = leer("src/lib/asistencia/roles.ts");
    // `vePestana` desvía la pestaña de Préstamos a su propia lista ANTES de
    // preguntar por ASISTENCIA_ROLES.
    expect(src).toMatch(/if \(pestana === "prestamos"\) return vePestanaPrestamos\(rol\);/);
  });
});

describe("E. El cableado está puesto donde tiene que estar", () => {
  it("el menú y el home podan la ficha por el interruptor", () => {
    const src = leer("src/lib/modules.ts");
    expect(src).toMatch(/moduloPrestamosEnElMenu\(\)/);
    // 🔴 Se FILTRA, no se borra de la lista: la key sigue en `role_permissions`.
    expect(src).toMatch(/key: "prestamos"/);
  });

  it("🔴 el redirect es 307 (temporal), no 308", () => {
    const src = leer("src/middleware.ts");
    expect(src).toMatch(/destinoDePrestamos\(pathname, req\.nextUrl\.search\)/);
    expect(src).toMatch(/NextResponse\.redirect\(new URL\(destino, req\.url\), 307\)/);
    expect(src).not.toMatch(/destinoDePrestamos[\s\S]{0,200}308/);
  });

  it("la sección de la persona enlaza, no dibuja un segundo formulario", () => {
// 🔴 10-sep-2026: «persona» pasó a «colaborador» en todo texto visible del módulo
// (Daniel: *«no lo llames personas, sino colaboradores»*). Este candado cambió de
// texto, no de regla. Ver `asistencia-colaboradores-no-personas.test.ts`.
    const src = leer("src/app/asistencia/colaboradores/SeccionPrestamos.tsx");
    expect(src).toMatch(/enlaceAPrestamos\(\)/);
    expect(src).toMatch(/enlaceAPrestamos\(ficha\.id\)/);
    // 🔴 Ni un `<form>` ni un POST: acá se MUESTRA y se enlaza.
    expect(src).not.toMatch(/<form/);
    expect(src).not.toMatch(/method:\s*"POST"/);
  });
});
