/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CANDADO — ARRIBA DE PROVEEDORES VA UNA SOLA LÍNEA, Y DICE DE CUÁNDO ES EL
 * NÚMERO (20-sep-2026)
 *
 * Daniel, textual: *«¿por qué buscar proveedor si ya está todo en la lista?
 * solo es desplegar»*.
 *
 * 🩸 Encima de la lista había OCHO pestañas de empresa y un buscador. Con la
 * lista dada vuelta —las empresas arriba, sus proveedores adentro— todo está a
 * un toque: las pestañas son las filas y el buscador filtraba algo que ya se ve
 * entero. Los dos se fueron.
 *
 * 🩸 Y lo que la pantalla NUNCA decía: **de cuándo es el dato**. Mostraba
 * $4.829.819,40 de deuda sin una palabra sobre la última corrida del sync, que
 * pasa 1×/día. Ahora arriba va, en UNA línea: «Actualizado: …» · Descargar
 * Excel · Actualizar ahora.
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { textoActualizado, PREFIJO_ACTUALIZADO } from "@/lib/proveedores/actualizado";

const raiz = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(raiz, rel), "utf8");
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, "");

const VISTA = sinComentarios(leer("src/app/proveedores/ProveedoresListClient.tsx"));
const RUTA = sinComentarios(leer("src/app/api/proveedores/route.ts"));

describe("🔴 se fueron las pestañas de empresa y el buscador", () => {
  it("🩸 no queda ni un chip de empresa", () => {
    expect(VISTA).not.toContain("<Chip");
    expect(VISTA).not.toContain("function Chip(");
  });

  it("🩸 no queda ningún campo de búsqueda", () => {
    expect(VISTA).not.toContain('type="search"');
    expect(VISTA).not.toContain("Buscar proveedor");
  });

  it("la lista ya no se pide filtrada: un solo pedido, el grupo entero", () => {
    expect(VISTA).toContain("fetch(`/api/proveedores`");
    expect(VISTA).not.toContain('params.set("empresa"');
    expect(VISTA).not.toContain('params.set("q"');
  });

  it("CONTROL: la ruta sigue aceptando ?empresa= y ?q= — no se rompe un enlace viejo", () => {
    expect(RUTA).toContain('sp.get("empresa")');
    expect(RUTA).toContain('sp.get("q")');
  });
});

describe("🔴 arriba se dice de cuándo es el dato", () => {
  it("la pantalla pinta «Actualizado: …» con la fecha del sync", () => {
    expect(VISTA).toContain("textoActualizado(sincronizado)");
    expect(VISTA).toContain("setSincronizado(json.synced_at ?? null)");
  });

  it("la ruta manda el `synced_at` más reciente de lo que leyó", () => {
    expect(RUTA).toContain("synced_at:");
    expect(RUTA).toContain("rows.map((r) => r.synced_at)");
  });

  it("🔑 sin fecha no se afirma nada: ni «—» ni una fecha inventada", () => {
    expect(textoActualizado(null)).toBeNull();
    expect(textoActualizado(undefined)).toBeNull();
    expect(textoActualizado("")).toBeNull();
    expect(textoActualizado("no es una fecha")).toBeNull();
  });

  it("dice la hora de PANAMÁ, no la del servidor (que corre en UTC)", () => {
    // 2026-09-20 09:32 UTC = 4:32 a.m. en Panamá (UTC−5 fijo).
    const t = textoActualizado("2026-09-20T09:32:03.668+00:00");
    expect(t).toContain(PREFIJO_ACTUALIZADO);
    // «sept» o «sep» según la versión de ICU; lo que importa es el día y el año.
    expect(t).toMatch(/20 sept?\.? 2026/);
    expect(t).toContain("4:32");
    expect(t).not.toContain("9:32");
  });

  it("el prefijo es el MISMO del resto del sistema", () => {
    expect(PREFIJO_ACTUALIZADO).toBe("Actualizado:");
    expect(leer("src/components/shared/SyncStatus.tsx")).toContain('"Actualizado:"');
  });

  it("Descargar Excel y Actualizar ahora comparten esa línea de arriba", () => {
    const arriba = VISTA.slice(VISTA.indexOf("<h1"), VISTA.indexOf("<AvisoRechazosSwitch"));
    expect(arriba).toContain("textoActualizado(sincronizado)");
    expect(arriba).toContain("Descargar Excel");
    expect(arriba).toContain("<SyncNowButton");
  });
});

describe("🩸 el rótulo con filtro se retiró, y el archivo se queda", () => {
  it("nadie importa `lib/proveedores/rotulo`", () => {
    const hits: string[] = [];
    const recorrer = (dir: string) => {
      for (const e of fs.readdirSync(path.join(raiz, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) {
          if (e.name !== "node_modules") recorrer(rel);
        } else if (/\.tsx?$/.test(e.name) && !rel.includes("__tests__")) {
          if (leer(rel).includes("proveedores/rotulo")) hits.push(rel);
        }
      }
    };
    recorrer("src");
    expect(hits).toEqual([]);
  });

  it("pero el archivo sigue ahí, rotulado — la regla no se borra de la memoria", () => {
    const rotulo = leer("src/lib/proveedores/rotulo.ts");
    expect(rotulo).toContain("RETIRADO EL 20-sep-2026");
    expect(rotulo).toContain("export function rotuloPorPagar");
  });
});
