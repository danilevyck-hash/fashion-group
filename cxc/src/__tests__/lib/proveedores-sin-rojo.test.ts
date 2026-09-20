/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CANDADO — PROVEEDORES NO PINTA DE ROJO (20-sep-2026)
 *
 * 🩸 La lista y la ficha pintaban los tramos con el vocabulario de color del
 * CXC —ámbar «vencido reciente», rojo «vencido crítico»—. Medido ese día,
 * **$3.035.153 salían en rojo** sin nada que lo sostenga: en CxP el dato que
 * manda Switch es la EDAD del documento desde su emisión, no días de mora, y
 * no hay plazo ni fecha de vencimiento en ninguna parte del dato.
 *
 * Es la misma regla que el papel del CXC tiene por escrito desde el 9-sep-2026
 * (`cxc-papel-vocabulario`): «vencido» está prohibido donde `dias` es edad.
 * Acá el que lo decía era el color.
 *
 * Queda UN tono, el tramo más viejo en negrita, y el azul solo para lo que está
 * a favor —que no es edad: es crédito—.
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { tonoDeMonto, textoDeMonto, TONO_A_FAVOR } from "@/lib/proveedores/tono";

const leer = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, "");

const PANTALLAS = [
  "src/app/proveedores/ProveedoresListClient.tsx",
  "src/app/proveedores/[key]/ProveedorDetail.tsx",
];

describe("🔴 un solo tono: ni rojo ni ámbar en los montos de CxP", () => {
  it("la regla dice lo mismo para cualquier monto que se deba", () => {
    // Un mes y tres años se pintan igual: la edad la dice el encabezado.
    expect(tonoDeMonto(100)).toBe(tonoDeMonto(1_300_000));
    expect(tonoDeMonto(100)).not.toContain("red");
    expect(tonoDeMonto(100)).not.toContain("amber");
  });

  it("🔴 lo que está a favor va en el azul del CXC, no en un tramo de edad", () => {
    expect(tonoDeMonto(-250)).toBe(TONO_A_FAVOR);
    expect(TONO_A_FAVOR).toContain("blue");
  });

  it("el cero sigue en gris claro y dibujado como «—»", () => {
    expect(tonoDeMonto(0)).toContain("gray-300");
    expect(textoDeMonto(0, (n) => String(n))).toBe("—");
    expect(textoDeMonto(-250, (n) => n.toFixed(2))).toBe("-$250.00");
    expect(textoDeMonto(250, (n) => n.toFixed(2))).toBe("$250.00");
  });

  for (const rel of PANTALLAS) {
    it(`🩸 ${rel} no pinta un monto de rojo ni de ámbar`, () => {
      const src = sinComentarios(leer(rel));
      // Los montos son las líneas con `tabular-nums` — así se dibuja la plata en
      // todo el sistema. Ninguna puede llevar rojo ni ámbar.
      const conMonto = src.split("\n").filter((l) => l.includes("tabular-nums"));
      expect(conMonto.length).toBeGreaterThan(0);
      for (const linea of conMonto) {
        expect(linea).not.toMatch(/(red|amber|rose)-\d/);
      }
      // El vocabulario de color del CXC no entra acá ni por la puerta de atrás.
      expect(src).not.toContain("AGING.watch.text");
      expect(src).not.toContain("AGING.overdue.text");
      expect(src).not.toContain("agingKeyForBucket");
    });

    it(`${rel} usa la regla común y no arma el color a mano`, () => {
      expect(sinComentarios(leer(rel))).toContain("tonoDeMonto(");
    });
  }

  it("🔴 el peso lo da la negrita del tramo más viejo, no el color", () => {
    expect(sinComentarios(leer(PANTALLAS[0]))).toContain("viejo");
    expect(sinComentarios(leer(PANTALLAS[0]))).toContain("font-medium");
    expect(sinComentarios(leer(PANTALLAS[1]))).toContain('b.title === "Mas de 365"');
  });

  it("CONTROL: el aviso ámbar de lo que Switch rechazó SÍ se queda", () => {
    // No es un monto de la tabla: es la línea que dice qué quedó afuera del
    // total, y está en ámbar a propósito (ver AvisoRechazosSwitch).
    expect(sinComentarios(leer(PANTALLAS[0]))).toContain("<AvisoRechazosSwitch");
    expect(leer("src/components/AvisoRechazosSwitch.tsx")).toContain("amber");
  });

  it("CONTROL: el aviso de lectura caída sigue siendo rojo — eso sí falló", () => {
    expect(sinComentarios(leer(PANTALLAS[0]))).toContain("border-red-200");
    expect(sinComentarios(leer(PANTALLAS[0]))).toContain("No se pudo cargar");
  });
});
