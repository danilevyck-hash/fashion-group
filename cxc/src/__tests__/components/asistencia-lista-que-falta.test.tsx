// ─────────────────────────────────────────────────────────────────────────────
// 🔴 LA LISTA DE COLABORADORES: «Qué falta» EN VEZ DE «Estado», SIN «Rata / hora»
// Y SIN EL ROJO DEL SALDO (10-sep-2026, mockup aprobado por Daniel)
//
//   7. «Falta el saldo» deja de ir en rojo: guion gris cuando no hay saldo
//      cargado; con saldo, «N días» como hoy. Daniel: *«un rojo que sale
//      siempre no avisa nada»*.
//   8. La columna «Rata / hora» sale de la lista; el dato queda en la página de
//      cada colaborador.
//   9. «Estado» (Listo / Falta) se reemplaza por «Qué falta»: lo de pagar en
//      rojo («Para pagar: empresa, salario, horario»), lo de completar en gris
//      («Completar: cargo, cédula»), vacío cuando no falta nada.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ToastProvider } from "@/components/ToastSystem";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import ConfiguracionTab from "@/app/asistencia/ConfiguracionTab";

const base = {
  jornadaSemanal: 48, configurado: true, faltaSalario: false, servicioProfesional: false,
  pagaSeguros: true, baseSeguros: null, noMarcaReloj: false, marcaciones: 100,
  ultimaMarca: "2026-09-10", rataHora: 4.09, valorMinuto: 0.07, fechaSalida: null,
  motivoSalida: null, activo: true, baja: null, marcoDespuesDeLaBaja: false,
  tieneHorario: true, saldoVacacionesCorte: null,
};
const SIN_FICHA = {
  ...base, codigo: "303", nombre: null, salarioMensual: null, empresa: null, configurado: false,
  rataHora: null, valorMinuto: null, fechaIngreso: null, saldoVacacionesDias: null, tieneHorario: false,
};
const ALEJANDRA = {
  ...base, codigo: "22", nombre: "ALEJANDRA CAMAÑO", salarioMensual: 523.47, empresa: "confecciones_boston",
  jornadaSemanal: 40, rataHora: 3.02, posicion: null, cedula: null, fechaIngreso: "2024-01-08",
  saldoVacacionesDias: null,
};
const ANDREA = {
  ...base, codigo: "16", nombre: "ANDREA PEREZ", salarioMensual: 700, empresa: "vistana",
  rataHora: 3.37, posicion: "Vendedora", cedula: "8-111-222", fechaIngreso: "2023-05-02",
  saldoVacacionesDias: 0, saldoVacacionesCorte: "2026-09-01",
};
const DATOS = {
  personas: [SIN_FICHA, ALEJANDRA, ANDREA], ignorados: [], reglas: REGLAS_DEFAULT,
  resumen: { total: 3, sinConfigurar: 1, sinSalario: 0, conMarcaciones: 3, bajas: 0, servicioProfesional: 0, noMarcaReloj: 0 },
  faltaMigracion: false, avisoMigracion: null, avisoMigracionBajas: null, puedeDarDeBaja: true, avisoBajas: null,
  avisoMigracionServicioProfesional: null, puedeMarcarServicioProfesional: true,
};
const saldo = (codigo: string, etiqueta: string, s: number | null, falta: string | null) => ({
  codigo, etiqueta, saldo: s, saldoInicial: s, corte: s === null ? null : "2026-09-01",
  ganadosDesdeCorte: 0, tomados: 0, yaPagados: 0, falta,
});
const SALDOS = { saldos: [saldo("303", "Código 303", null, "ambos"), saldo("22", "ALEJANDRA CAMAÑO", null, "saldo"), saldo("16", "ANDREA PEREZ", 0, null)] };

function servir() {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const u = String(url);
    const body = u.includes("/api/asistencia/configuracion") ? DATOS : u.includes("/api/asistencia/vacaciones") ? SALDOS : {};
    return { ok: true, json: async () => body } as Response;
  }));
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function abrir() {
  servir();
  render(<ToastProvider><ConfiguracionTab personaEnElCentro /></ToastProvider>);
  await screen.findAllByText(/Alejandra Camaño/);
  // Y los saldos, que llegan aparte.
  await screen.findAllByText("0 días");
}

/** La fila de escritorio y la tarjeta del celular se montan LAS DOS en jsdom. */
const filaDe = (nombre: RegExp) =>
  screen.getAllByText(nombre).map((el) => el.closest("a") ?? el.closest("button") ?? el.parentElement!);

describe("9. 🔴 «Qué falta» reemplaza a «Estado»", () => {
  it("el encabezado dice «Qué falta» y ya no dice «Estado» ni «Rata / hora»", async () => {
    await abrir();
    expect(screen.getByText("Qué falta")).toBeTruthy();
    expect(screen.queryByText("Estado")).toBeNull();
    expect(screen.queryByText("Rata / hora")).toBeNull();
  });

  it("sin ficha: «Para pagar: empresa, salario, horario» en ROJO, y nada que completar", async () => {
    await abrir();
    const rojos = screen.getAllByText("Para pagar: empresa, salario, horario");
    expect(rojos.length).toBeGreaterThan(0);
    for (const r of rojos) expect(r.className).toContain("text-red-700");
    for (const fila of filaDe(/Código 303|303/)) {
      expect(fila.textContent).not.toContain("Completar:");
    }
  });

  it("con ficha: «Completar: cargo, cédula, saldo de vacaciones» en GRIS, sin nada rojo", async () => {
    await abrir();
    const grises = screen.getAllByText("Completar: cargo, cédula, saldo de vacaciones");
    expect(grises.length).toBeGreaterThan(0);
    for (const g of grises) expect(g.className).toContain("text-gray-500");
    for (const fila of filaDe(/Alejandra Camaño/)) expect(fila.textContent).not.toContain("Para pagar:");
  });

  it("sin nada que falte, la celda va VACÍA: ni «Listo» ni un chip «Falta»", async () => {
    await abrir();
    expect(screen.queryByText("Listo")).toBeNull();
    expect(screen.queryByText(/^Falta$/)).toBeNull();
    for (const fila of filaDe(/Andrea Perez/)) {
      expect(fila.textContent).not.toContain("Para pagar:");
      expect(fila.textContent).not.toContain("Completar:");
    }
  });
});

describe("7. el saldo de vacaciones: guion gris, nunca rojo", () => {
  it("sin saldo cargado la celda dice «—»; con saldo, «0 días»", async () => {
    await abrir();
    expect(screen.queryByText("Falta el saldo")).toBeNull();
    expect(screen.queryByText(/Faltan la fecha de ingreso/)).toBeNull();
    expect(screen.getAllByText("0 días").length).toBeGreaterThan(0);
    for (const fila of filaDe(/Alejandra Camaño/)) expect(fila.textContent).toContain("—");
    // Y ningún ámbar/rojo colgado del saldo.
    for (const el of screen.getAllByText("0 días")) expect(el.className).not.toContain("amber");
  });
});

describe("8. la rata por hora se fue de la lista", () => {
  it("no se dibuja la rata de nadie ($3.02, $3.37, $4.09)", async () => {
    await abrir();
    expect(screen.queryByText(/\$3[.,]02/)).toBeNull();
    expect(screen.queryByText(/\$3[.,]37/)).toBeNull();
    expect(screen.queryByText(/\$4[.,]09/)).toBeNull();
    // El salario sí sigue.
    expect(screen.getAllByText(/\$700[.,]00/).length).toBeGreaterThan(0);
  });
});
