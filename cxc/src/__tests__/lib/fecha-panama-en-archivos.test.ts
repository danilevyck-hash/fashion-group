/**
 * 🔴 EL NOMBRE DEL ARCHIVO Y LA FECHA POR DEFECTO SON DE PANAMÁ (16-nov-2026,
 * errores de los videos #16 y #29). Con `new Date().toISOString().slice(0, 10)`
 * (UTC) desde las 7 p. m. de Panamá el archivo salía con la fecha de MAÑANA:
 * Proveedores, Consulta de artículos, Reclamos, Catálogos, Despachos, y la
 * fecha de «Nuevo cheque» en Recordatorios. La fecha es `hoyPanama()`.
 *
 * Dos candados: (1) a las 6:30 p. m. de Panamá cada nombre dice el día de
 * Panamá; (2) un barrido que pone el build rojo si vuelve el UTC junto a un
 * nombre de archivo o una descarga.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// 🔑 23:30Z (6:30 p. m.) todavía es el 16 también en UTC; el defecto aparece
// desde las 7 p. m. de Panamá (00:00Z). Se prueban las dos horas.
const HOY = "2026-11-16";

describe.each([
  ["6:30 p. m.", new Date("2026-11-16T23:30:00Z")],
  ["8:30 p. m.", new Date("2026-11-17T01:30:00Z")],
])("nombres de archivo con la fecha de Panamá a las %s", (_hora, AHORA) => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(AHORA);
  });
  afterEach(() => vi.useRealTimers());

  it("exportFilename (Consulta de artículos y demás Excel)", async () => {
    const { exportFilename } = await import("@/lib/excel-export");
    expect(exportFilename("ventas-referencia")).toBe(`ventas-referencia-${HOY}.xlsx`);
  });

  it("Despachos: varias guías en un PDF", async () => {
    const { nombreArchivoGuias } = await import("@/lib/guias/pdf-guia");
    const g = {} as never;
    expect(nombreArchivoGuias([g, g])).toBe(`Guias-2-${HOY}.pdf`);
  });

  it("Recordatorios: «Nuevo cheque» abre con la fecha de hoy en Panamá", async () => {
    const { chequeFormVacio } = await import("@/app/recordatorios/components/ChequeFormModal");
    expect(chequeFormVacio().fecha_deposito).toBe(HOY);
  });
});

// ── Barrido ──────────────────────────────────────────────────────────────────
const RAIZ = join(__dirname, "..", "..");
// Los dos permitidos: convierte un serial de Excel (no es «hoy») y un corte de retención.
const PERMITIDOS = new Set(["lib/tallas-pedido/despacho-archivo.ts", "lib/depurador/historial-archivos.ts"]);
const UTC_HOY = /toISOString\(\)\s*\.\s*(slice\(0,\s*10\)|substring\(0,\s*10\)|split\(["']T["']\)\[0\])/;
const ARCHIVO = /\.xlsx|\.pdf|\.zip|filename|download|Content-Disposition/i;

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === "__tests__" ? [] : archivos(p);
    return /\.tsx?$/.test(n) ? [p] : [];
  });
}

describe("barrido: ningún nombre de archivo con la fecha UTC", () => {
  it("toISOString().slice(0, 10) no vive a 6 líneas de un nombre de archivo", () => {
    const malos: string[] = [];
    for (const f of archivos(RAIZ)) {
      const rel = relative(RAIZ, f).replace(/\\/g, "/");
      if (PERMITIDOS.has(rel)) continue;
      const lineas = readFileSync(f, "utf8").split("\n");
      lineas.forEach((l, i) => {
        if (!UTC_HOY.test(l) || l.trim().startsWith("//")) return;
        const cerca = lineas.slice(Math.max(0, i - 6), i + 7).join("\n");
        if (ARCHIVO.test(cerca)) malos.push(`${rel}:${i + 1}`);
      });
    }
    expect(malos).toEqual([]);
  });

  it("los formularios abren con la fecha de Panamá (Nuevo cheque, Nuevo gasto)", () => {
    for (const rel of ["app/recordatorios/components/ChequeFormModal.tsx", "app/caja/components/NuevoGastoDrawer.tsx"]) {
      expect(readFileSync(join(RAIZ, rel), "utf8"), rel).not.toMatch(UTC_HOY);
    }
  });
});
