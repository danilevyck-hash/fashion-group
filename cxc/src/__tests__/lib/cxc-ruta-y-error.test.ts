// ─────────────────────────────────────────────────────────────────────────────
// DOS LIMPIEZAS DEL REDISEÑO (5-sep-2026).
//
// 1) `/admin` PASÓ A `/cxc`. La dirección ahora dice lo que es. El RÓTULO no
//    cambió: sigue siendo «Cuentas por Cobrar» en el home, el sidebar, la barra
//    y la búsqueda. ⚠️ `/admin/usuarios` y `/admin/data-health` NO se movieron.
//
// 2) LA PANTALLA DE ERROR DEJÓ DE MOSTRAR EL ERROR CRUDO. Era la ÚNICA del
//    sistema que imprimía `error.message` y `error.stack` en pantalla: a la
//    secretaria le decía `TypeError: Cannot read properties of undefined
//    (reading 'd91_120')` —que no le dice qué hacer— y de paso publicaba
//    nombres de tablas y rutas internas a cualquiera que abriera el módulo.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const RAIZ = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n").map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1")).join("\n");

/** Todos los .ts/.tsx de src, menos los tests. */
function archivosDeSrc(dir = path.join(RAIZ, "src")): string[] {
  const salida: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "__tests__" || e.name === "node_modules") continue;
      salida.push(...archivosDeSrc(abs));
    } else if (/\.tsx?$/.test(e.name)) {
      salida.push(abs);
    }
  }
  return salida;
}

describe("🔴 Cuentas por Cobrar vive en /cxc", () => {
  it("la pantalla está en `src/app/cxc/page.tsx` y ya no en `src/app/admin`", () => {
    expect(fs.existsSync(path.join(RAIZ, "src/app/cxc/page.tsx"))).toBe(true);
    expect(fs.existsSync(path.join(RAIZ, "src/app/admin/page.tsx"))).toBe(false);
  });

  it("⚠️ Usuarios NO se movió: sigue en /admin/usuarios", () => {
    expect(fs.existsSync(path.join(RAIZ, "src/app/admin/usuarios/page.tsx"))).toBe(true);
  });

  it("el módulo apunta a /cxc y sigue rotulado «Cuentas por Cobrar»", () => {
    const src = leer("src/lib/modules.ts");
    expect(src).toMatch(/key: "cxc",[\s\S]{0,120}href: "\/cxc"/);
    expect(src).toContain('label: "Cuentas por Cobrar"');
  });

  it("hay redirección de /admin en next.config.js, y SOLO de esa ruta exacta", () => {
    const src = leer("next.config.js");
    expect(src).toMatch(/source: "\/admin", destination: "\/cxc"/);
    // Nada de `/admin/:path*`: se llevaría puesto /admin/usuarios.
    expect(src).not.toContain('source: "/admin/:path');
    // Y las dos rutas que se quedan siguen resolviendo.
    expect(src).toContain('source: "/admin/data-health"');
  });

  it("🔴 NINGÚN enlace interno apunta al /cxc viejo", () => {
    const culpables: string[] = [];
    for (const abs of archivosDeSrc()) {
      const rel = path.relative(RAIZ, abs);
      const src = sinComentarios(fs.readFileSync(abs, "utf8"));
      // `/admin` seguido de fin de cadena, `?` o backtick — o sea el módulo,
      // no `/admin/usuarios` ni `/api/admin/...`.
      if (/["'`]\/admin(["'`?])/.test(src)) culpables.push(rel);
    }
    expect(culpables, `estos siguen apuntando a /admin: ${culpables.join(", ")}`).toEqual([]);
  });

  it("los enlaces que llevaban al CXC ahora llevan a /cxc", () => {
    expect(leer("src/components/SearchBar.tsx")).toContain('href: "/cxc"');
    expect(leer("src/components/SearchBar.tsx")).toContain("/cxc?search=");
    expect(leer("src/app/vista-general/page.tsx")).toContain('href="/cxc"');
    expect(leer("src/app/clientes/[codigo]/ClienteDetail.tsx")).toContain("/cxc?search=");
    expect(leer("src/lib/hooks/useKeyboardShortcuts.ts")).toContain('c: "/cxc"');
  });

  it("el color del módulo se resuelve por la ruta nueva", () => {
    const src = leer("src/lib/moduleColors.ts");
    expect(src).toMatch(/startsWith\("\/cxc"\)\s*\)?\s*return "cxc"/);
    expect(src).not.toContain('startsWith("/admin")');
  });
});

describe("🔴 la pantalla de error no filtra detalles internos", () => {
  const src = leer("src/app/cxc/error.tsx");

  it("existe, y la vieja de /admin se fue con la mudanza", () => {
    expect(fs.existsSync(path.join(RAIZ, "src/app/admin/error.tsx"))).toBe(false);
  });

  it("🩸 ya NO imprime `error.message` ni `error.stack` en pantalla", () => {
    expect(src).not.toContain("{error.message}");
    expect(src).not.toContain("{error.stack}");
    expect(src).not.toContain("error.stack &&");
  });

  it("dice qué pasó, qué significa y qué hacer", () => {
    expect(src).toContain("No se pudo mostrar Cuentas por Cobrar");
    expect(src).toContain("No se perdió nada");
    expect(src).toContain("Intentar de nuevo");
    expect(src).toContain("Ir al inicio");
  });

  it("el detalle técnico va a la consola (y a Sentry), no a la cara de nadie", () => {
    expect(src).toMatch(/console\.error\([^)]*error\)/);
  });

  it("«Error en CXC» y la jerga se fueron: el módulo se llama por su nombre", () => {
    expect(src).not.toContain("Error en CXC");
  });
});

describe("rutas del CXC sin lectores", () => {
  it("🩸 `/api/cxc-rows` se retiró: cero llamadas desde `src/`", () => {
    expect(fs.existsSync(path.join(RAIZ, "src/app/api/cxc-rows"))).toBe(false);
    for (const abs of archivosDeSrc()) {
      expect(fs.readFileSync(abs, "utf8"), path.relative(RAIZ, abs)).not.toContain("/api/cxc-rows");
    }
  });

  it("⚠️ `cxc_rows` y `cxc_contact_log` NO se borran de la base", () => {
    // Patrón `mayor_lineas`: la tabla queda, sin lectores. Lo que se retiró es
    // el camino, no la historia.
    const migraciones = path.join(RAIZ, "supabase/migrations");
    for (const f of fs.readdirSync(migraciones)) {
      const sql = fs.readFileSync(path.join(migraciones, f), "utf8").toLowerCase();
      // El nombre EXACTO: una migración vieja dropea `backup_cxc_rows_20260509`,
      // que es una copia y no la tabla.
      expect(sql, f).not.toMatch(/drop table (if exists )?(public\.)?cxc_rows\b/);
      expect(sql, f).not.toMatch(/drop table (if exists )?(public\.)?cxc_contact_log\b/);
    }
  });
});
