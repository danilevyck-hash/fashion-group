// ─────────────────────────────────────────────────────────────────────────────
// MULTIFASHION — LOS DEFECTOS DEL 11-sep-2026, aprobados por Daniel
//
// 8. El año se decía DOS veces con números distintos: la tarjeta «Año» usa
//    `overview.retail.ytdVentas` (12 meses) y la fila «YTD» de «Mes a mes»
//    sumaba solo los meses con base del año anterior. Medido contra
//    producción: 2025 → $652.420,19 arriba y $509.291,64 abajo.
// 9. Jennifer (`gerente_acs`) sin «Actualizar ahora» (el botón usaba su
//    default admin+secretaria); la lista de roles del shell escrita a mano; el
//    desplegable de período en blanco cuando el mes de corte no vendió.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { filaAnio, ROTULO_FILA_ANIO } from "@/lib/multifashion/fila-anio";
import { ROLES_MULTIFASHION } from "@/lib/multifashion/acceso";
import { PLACEHOLDER_PERIODO } from "@/components/multifashion/PeriodoSelect";

const leer = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("8 · la fila del año dice lo mismo que la tarjeta", () => {
  // 2025 medido el 11-sep-2026: 12 meses con dato, 8 con base de 2024.
  const meses2025 = [
    { label: "Ene", v: 30000, vPrev: null }, { label: "Feb", v: 31000, vPrev: null },
    { label: "Mar", v: 40000, vPrev: null }, { label: "Abr", v: 42128.55, vPrev: null },
    { label: "May", v: 50000, vPrev: 45000 }, { label: "Jun", v: 60000, vPrev: 55000 },
    { label: "Jul", v: 65000, vPrev: 60000 }, { label: "Ago", v: 55000, vPrev: 52000 },
    { label: "Sep", v: 58000, vPrev: 54000 }, { label: "Oct", v: 62000, vPrev: 60000 },
    { label: "Nov", v: 70000, vPrev: 66000 }, { label: "Dic", v: 89291.64, vPrev: 85843.10 },
  ];

  it("🔴 el total es el de la TARJETA, no la suma de los meses con base", () => {
    const fila = filaAnio({ totalAnio: 652420.19, meses: meses2025, prevYear: 2024 });
    expect(fila.total).toBe(652420.19);
    // La suma vieja (solo los 8 con base) NO es lo que se muestra como total.
    const vieja = meses2025.filter((m) => m.vPrev != null).reduce((s, m) => s + m.v, 0);
    expect(vieja).toBeCloseTo(509291.64, 2);
    expect(fila.total).not.toBeCloseTo(vieja, 0);
  });

  it("el Δ se mide sobre los meses comparables, y la fila DICE sobre cuántos", () => {
    const fila = filaAnio({ totalAnio: 652420.19, meses: meses2025, prevYear: 2024 });
    expect(fila.totalPrev).toBeCloseTo(477843.10, 2);
    expect(fila.pct).toBeCloseTo((509291.64 - 477843.10) / 477843.10, 6);
    expect(fila.abs).toBeCloseTo(509291.64 - 477843.10, 2);
    expect(fila.nota).toBe("Δ sobre los 8 meses que tienen 2024: $509,291.64 vs $477,843.10");
  });

  it("con todos los meses comparables no hay nota (2026)", () => {
    const meses = [{ label: "Ene", v: 10000, vPrev: 8000 }, { label: "Feb", v: 12000, vPrev: 9000 }];
    const fila = filaAnio({ totalAnio: 22000, meses, prevYear: 2025 });
    expect(fila.nota).toBeNull();
    expect(fila.totalPrev).toBe(17000);
    expect(fila.pct).toBeCloseTo(5000 / 17000, 6);
  });

  it("sin ningún mes comparable: el total igual, y el Δ se abstiene", () => {
    const fila = filaAnio({ totalAnio: 100, meses: [{ label: "Ene", v: 100, vPrev: null }], prevYear: 2025 });
    expect(fila).toEqual({ total: 100, totalPrev: null, pct: null, abs: null, nota: null });
  });

  it("la fila se llama «Año» — la sigla YTD se fue de la tabla", () => {
    expect(ROTULO_FILA_ANIO).toBe("Año");
    const src = sinComentarios(leer("src/components/multifashion/MultifashionResumenView.tsx"));
    expect(src).toContain("totalAnio={overview.retail.ytdVentas}");
    expect(src).toContain("{ROTULO_FILA_ANIO}");
    expect(src).not.toContain('>YTD<');
    expect(src).toContain('data-nota="anio"');
    // CONTROL: la tarjeta sigue diciendo el mismo número.
    expect(src).toContain("{fmtMoney(overview.retail.ytdVentas)}");
  });
});

describe("9 · Jennifer, la lista del shell y el desplegable", () => {
  const shell = sinComentarios(leer("src/app/multifashion/MultifashionShell.tsx"));

  it("«Actualizar ahora» lleva los roles del módulo (gerente_acs incluido)", () => {
    expect(shell).toContain("roles={ROLES_MULTIFASHION}");
    expect(ROLES_MULTIFASHION).toContain("gerente_acs");
    // Y el default del botón sigue sin incluirla: por eso hay que pasarlos.
    const boton = sinComentarios(leer("src/components/shared/SyncNowButton.tsx"));
    expect(boton).toContain('const ROLES_DEFAULT = ["admin", "secretaria"];');
  });

  it("la lista de roles del shell se LEE de acceso.ts, no se escribe", () => {
    expect(shell).toContain("allowedRoles: ROLES_MULTIFASHION");
    expect(shell).not.toMatch(/"gerente_acs"/);
  });

  it("el desplegable de período tiene placeholder", () => {
    expect(PLACEHOLDER_PERIODO).toBe("Elige el período");
    const sel = sinComentarios(leer("src/components/multifashion/PeriodoSelect.tsx"));
    expect(sel).toContain("<SelectValue placeholder={PLACEHOLDER_PERIODO} />");
  });
});
