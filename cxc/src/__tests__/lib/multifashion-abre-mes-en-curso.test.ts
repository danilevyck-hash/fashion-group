// 🔴 4-oct-2026 — Daniel: «quiero que en Comisiones y también en Multifashion se
// vea el mes en curso». Revisado ese día: el módulo Multifashion YA abría en el
// mes en curso de Panamá (celular y computadora usan el mismo `?mfPeriodo=`), así
// que no se cambió nada. Este candado impide que vuelva a abrir en otro mes.
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { periodoPorDefecto } from "@/lib/multifashion/periodo";
import { corteParaMultifashion } from "@/lib/comisiones/multifashion-periodo";

describe("Multifashion abre en el mes en curso", () => {
  it("sin nada en la URL, el período es el mes de corte (el de hoy en Panamá)", () => {
    expect(periodoPorDefecto({ anio: 2026, mes: 10 })).toEqual({ tipo: "mes", anio: 2026, mes: 10 });
  });

  it("el corte del módulo sale de hoyPanama, y la URL manda si trae período", () => {
    const shell = readFileSync(join(process.cwd(), "src/app/multifashion/MultifashionShell.tsx"), "utf8");
    expect(shell).toContain("const hoyIso = useMemo(() => hoyPanama(), []);");
    expect(shell).toContain("periodoDesdeUrl(periodoRaw) ?? periodoPorDefecto(corte)");
  });

  it("dentro de Comisiones, el corte de Multifashion también es el mes en curso", () => {
    expect(corteParaMultifashion("2026-10-04")).toEqual({ anio: 2026, mes: 10 });
  });
});
