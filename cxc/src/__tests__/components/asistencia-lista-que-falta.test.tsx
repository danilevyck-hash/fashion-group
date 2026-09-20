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

// 🔴 EL DOBLE DEL ROUTER (11-sep-2026). Colaboradores lleva buscador y su texto
// vive en la URL (`useUrlState`, `replace`), que llama a `useRouter()`: sin app
// router montado, jsdom tira «invariant expected app router to be mounted»
// antes de dibujar una sola fila. El doble devuelve una URL VACÍA a propósito
// —sin búsqueda escrita, la lista es la de siempre—, que es lo que estos
// candados miran. ⚠️ La Planilla ya NO lo necesita: se le quitó el buscador.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/asistencia",
  useSearchParams: () => new URLSearchParams(),
}));

import { render, screen, cleanup } from "@testing-library/react";
import { ToastProvider } from "@/components/ToastSystem";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import ConfiguracionTab from "@/app/asistencia/ConfiguracionTab";

const base = {
  jornadaSemanal: 48, configurado: true, faltaSalario: false, servicioProfesional: false,
  pagaSeguros: true, baseSeguros: null, noMarcaReloj: false, marcaciones: 100,
  ultimaMarca: "2026-09-10", rataHora: 4.09, valorMinuto: 0.07, fechaSalida: null,
  motivoSalida: null, activo: true, baja: null, marcoDespuesDeLaBaja: false,
  tieneHorario: true,
};
const SIN_FICHA = {
  ...base, codigo: "303", nombre: null, salarioMensual: null, empresa: null, configurado: false,
  rataHora: null, valorMinuto: null, fechaIngreso: null, tieneHorario: false,
};
const ALEJANDRA = {
  ...base, codigo: "22", nombre: "ALEJANDRA CAMAÑO", salarioMensual: 523.47, empresa: "confecciones_boston",
  jornadaSemanal: 40, rataHora: 3.02, posicion: null, cedula: null, fechaIngreso: "2024-01-08",
};
const ANDREA = {
  ...base, codigo: "16", nombre: "ANDREA PEREZ", salarioMensual: 700, empresa: "vistana",
  rataHora: 3.37, posicion: "Vendedora", cedula: "8-111-222", fechaIngreso: "2023-05-02",
};
const DATOS = {
  personas: [SIN_FICHA, ALEJANDRA, ANDREA], ignorados: [], reglas: REGLAS_DEFAULT,
  resumen: { total: 3, sinConfigurar: 1, sinSalario: 0, conMarcaciones: 3, bajas: 0, servicioProfesional: 0, noMarcaReloj: 0 },
  faltaMigracion: false, avisoMigracion: null, avisoMigracionBajas: null, puedeDarDeBaja: true, avisoBajas: null,
  avisoMigracionServicioProfesional: null, puedeMarcarServicioProfesional: true,
};
// ⚠️ CAMBIÓ DE FORMA el 17-sep-2026: la ruta ya no manda `saldos` con un saldo
// escrito a mano, manda `corresponden` con los días CALCULADOS desde la fecha
// de ingreso (`vacaciones-corresponden.ts`). `dias: null` = le falta la fecha.
const dias = (codigo: string, etiqueta: string, n: number | null) => ({
  codigo, etiqueta, dias: n, ganados: n, tomados: 0, yaPagados: 0,
  faltaFechaIngreso: n === null,
});
const SALDOS = { corresponden: [dias("303", "Código 303", null), dias("22", "ALEJANDRA CAMAÑO", null), dias("16", "ANDREA PEREZ", 0)] };

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
  // 🔄 19-sep-2026: ya no se esperan los saldos de vacaciones. La columna se
  // retiró de la lista (Daniel: *«se habló que días de vacaciones no existe,
  // sino por plata»*) y la pantalla ni siquiera los pide. El número vive en la
  // ficha de cada persona. Ver `persona-en-el-centro.test.ts` › bloque I.
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

  // ⚠️ CAMBIÓ DE TEXTO el 17-sep-2026: «saldo de vacaciones» salió de la lista
  // de faltantes con las columnas. Lo que este caso protege —gris, nunca rojo—
  // no cambió.
  it("con ficha: «Completar: cargo, cédula» en GRIS, sin nada rojo", async () => {
    await abrir();
    const grises = screen.getAllByText("Completar: cargo, cédula");
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

describe("7. los días de vacaciones se fueron de la lista", () => {
  // 🔄 CAMBIÓ DE DIRECCIÓN el 19-sep-2026, y lo decidió Daniel. Textual:
  //
  //     «se habló que días de vacaciones no existe, sino por plata, ya se
  //      habló de eso»
  //
  // 🩸 La columna mostraba un número PELADO —Briceida decía 665— que son los
  // días acumulados desde 2006 sin restar lo tomado antes de que las vacaciones
  // existieran en el sistema. Entre los 44 sumaban 2.160 días.
  //
  // 🔴 LO QUE NO SE TOCÓ: la FICHA de cada persona, donde el mismo número se
  // lee «Le corresponden N días» con su línea de aviso.
  it("🔴 no hay columna «Vacaciones», y la lista ni siquiera pide los días", async () => {
    const llamadas: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      llamadas.push(String(url));
      return { ok: true, json: async () => (String(url).includes("/configuracion") ? DATOS : {}) } as Response;
    }));
    render(<ToastProvider><ConfiguracionTab personaEnElCentro /></ToastProvider>);
    await screen.findAllByText(/Alejandra Camaño/);
    expect(screen.queryByText("Vacaciones")).toBeNull();
    expect(llamadas.some((u) => u.includes("/api/asistencia/vacaciones"))).toBe(false);
    // 🔑 CONTROL: la lista sigue mostrando lo suyo.
    expect(screen.getByText("Qué falta")).toBeTruthy();
    expect(screen.getAllByText(/\$700[.,]00/).length).toBeGreaterThan(0);
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
