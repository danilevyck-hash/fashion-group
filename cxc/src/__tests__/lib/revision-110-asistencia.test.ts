import { describe, expect, it } from "vitest";
import {
  colaColaboradores, opcionConNumeros, pendientesConUnidad, pendientesEnDosRenglones, textoPastillaEmpresa,
} from "@/lib/ui/revision-110-asistencia";
import { datosDeLaTarjeta, filasDeLaPortada } from "@/lib/asistencia/celular-asistencia";

describe("revisión 110 · Asistencia (solo pantalla)", () => {
  it("74 · la unidad dicha", () => {
    expect(pendientesConUnidad(36, 118, 586 * 60 + 52)).toBe("36 colaboradores · 118 días · 586:52 h");
    expect(pendientesConUnidad(1, 1, 30)).toBe("1 colaborador · 1 día · 0:30 h");
    expect(colaColaboradores(36, 118, 35212)).toBe("colaboradores · 118 días · 586:52 h");
  });

  it("74 · la portada usa los colaboradores como número; sin el dato, lo de antes", () => {
    const base = {
      colaboradores: 50, sinFicha: 3, personasDelReporte: null, ausencias: null,
      porDecidir: 118, horasPorDecidir: "586:52 h", quincenaCerrada: null, conDeuda: null, deudaTotal: null,
    };
    const tabs = [["aprobaciones", "Aprobaciones"]] as const;
    expect(filasDeLaPortada(tabs, base)[0]).toMatchObject({ detalle: "118 pendientes · 586:52 h", cuenta: "118" });
    expect(filasDeLaPortada(tabs, { ...base, colaboradoresPorDecidir: 36, minutosPorDecidir: 35212 })[0])
      .toMatchObject({ detalle: "36 colaboradores · 118 días · 586:52 h", cuenta: "36" });
  });

  it("73 · la opción del título lleva su número sin repetirlo", () => {
    expect(opcionConNumeros("Préstamos", "19 con saldo", "$20,097.51")).toBe("Préstamos · 19 con saldo · $20,097.51");
    expect(opcionConNumeros("Aprobaciones", "36 colaboradores · 118 días · 586:52 h", "36")).toBe("Aprobaciones · 36 colaboradores · 118 días · 586:52 h");
    expect(opcionConNumeros("Planilla", null, null)).toBe("Planilla");
  });

  it("76 · horas sin segundos solo con el interruptor", () => {
    const r = { ausenciasSinJustificar: 0, vecesTarde: 2, minutosTarde: 347 + 43 / 60, extraMin: 272 + 39 / 60, diasARevisar: 0 };
    expect(datosDeLaTarjeta(r, { horasCortas: true }).map((d) => d.texto)).toEqual(["2 tardanzas 5:48 h", "4:33 h de extra"]);
    expect(datosDeLaTarjeta(r).map((d) => d.texto)).toEqual(["2 tardanzas de 5h 47m 43s", "4h 32m 39s de extra"]);
  });

  it("79 · «Todas» dice qué filtra", () => {
    expect(textoPastillaEmpresa("Todas")).toBe("Todas las empresas");
    expect(textoPastillaEmpresa("Vistana")).toBe("Vistana");
  });

  it("81 · dos renglones, o nada si el texto es otro", () => {
    expect(pendientesEnDosRenglones("15 con horas extra sin decidir · 121:36 h")).toEqual(["15 sin decidir", "121:36 h"]);
    expect(pendientesEnDosRenglones("Lista para cerrar")).toBeNull();
  });
});
