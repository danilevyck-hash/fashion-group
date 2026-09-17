/**
 * ─────────────────────────────────────────────────────────────────────────────
 * EL SALDO DE VACACIONES A MANO SE FUE DE LA FICHA (17-sep-2026).
 *
 * ⚠️ ESTE ARCHIVO CAMBIÓ DE DIRECCIÓN, y por eso la nota va fechada. Hasta hoy
 * exigía lo contrario: que el campo «Días de vacaciones que le quedan hoy»
 * EXISTIERA en la ficha, estuviera editable, VIAJARA en el PUT y sobreviviera a
 * una baja. Todo eso era cierto — y **no lo usó nadie**: medido el 17-sep-2026,
 * de las 49 fichas NINGUNA tenía un número:
 * 47 con el saldo vacío y 2 con un 0.
 *
 * Daniel, textual: *«las vacaciones no funciona por día, hay que cambiar eso,
 * funciona que por cada 11 meses trabajado, 1 mes de vacaciones»* · *«Quita lo
 * del saldo vacaciones»*.
 *
 * Lo que se sostiene acá ahora, RENDERIZANDO:
 *   1. el campo del saldo YA NO EXISTE en la ficha;
 *   2. nada de lo que se guarda lleva `saldoVacacionesDias` ni su fecha de corte;
 *   3. 🔑 CONTROL — «Empezó a trabajar» SIGUE ahí y sigue viajando en el PUT:
 *      es el dato del que salen ahora los días, así que perderlo sería peor que
 *      lo que se quitó;
 *   4. 🔑 CONTROL — dar de baja sigue guardando la fecha de salida (la baja no
 *      se rompió al sacar el campo de al lado).
 * ─────────────────────────────────────────────────────────────────────────────
 */
// 🩸 Los nombres se muestran CAPITALIZADOS desde el 10-sep-2026 (Daniel: «no me
// gustan los nombres en planilla de los usuarios todo en mayúscula»). Los
// buscadores van sin distinguir mayúsculas: lo guardado no cambió, solo la
// grafía en pantalla.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";

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

import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

import { ToastProvider } from "@/components/ToastSystem";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import ConfiguracionTab from "@/app/asistencia/ConfiguracionTab";

const ANGELA = {
  codigo: "7", nombre: "ANGELA GARCIA", salarioMensual: 850, jornadaSemanal: 48,
  empresa: "vistana", configurado: true, faltaSalario: false, marcaciones: 120,
  ultimaMarca: "2026-08-25", rataHora: 4.09, valorMinuto: 0.07,
  servicioProfesional: false, pagaSeguros: true,
  fechaIngreso: "2019-02-16", fechaSalida: null, motivoSalida: null,
  activo: true, baja: null, marcoDespuesDeLaBaja: false,
};

const datos = (over: Record<string, unknown> = {}) => ({
  personas: [ANGELA],
  reglas: REGLAS_DEFAULT,
  reglasDefault: REGLAS_DEFAULT,
  resumen: { total: 1, sinConfigurar: 0, sinSalario: 0, conMarcaciones: 1, bajas: 0, servicioProfesional: 0 },
  faltaMigracion: false,
  avisoMigracion: null,
  avisoMigracionBajas: null,
  puedeDarDeBaja: true,
  avisoBajas: null,
  avisoMigracionServicioProfesional: null,
  puedeMarcarServicioProfesional: true,
  avisoMigracionSeguros: null,
  puedeQuitarSeguros: true,
  ...over,
});

/** Guarda los cuerpos de todos los PUT para poder leerlos. */
let enviados: Array<Record<string, unknown>>;

function servir(cuerpo: unknown) {
  enviados = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "PUT") {
      enviados.push(JSON.parse(String(init.body)));
      return { ok: true, json: async () => ({ ok: true }) } as Response;
    }
    return { ok: true, json: async () => cuerpo } as Response;
  }));
}
const montar = () => render(<ToastProvider><ConfiguracionTab /></ToastProvider>);

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function abrirFicha(cuerpo: unknown = datos()) {
  servir(cuerpo);
  montar();
  await screen.findAllByText(/ANGELA GARCIA/i);
  fireEvent.click(screen.getAllByRole("button", { name: /ANGELA GARCIA/i })[0]);
}

describe("🔴 el campo del saldo se fue de la ficha", () => {
  it("no hay ningún campo de «días de vacaciones» que teclear", async () => {
    await abrirFicha();
    expect(screen.queryByLabelText(/días de vacaciones/i)).toBeNull();
    expect(screen.queryByText(/que le quedan hoy/i)).toBeNull();
  });

  it("⛔ ni el saldo ni su fecha de corte viajan en lo que se guarda", async () => {
    await abrirFicha();
    // Se guarda por cualquier campo: se toca el nombre, que sí sigue existiendo.
    const nombre = screen.getAllByDisplayValue("ANGELA GARCIA")[0] as HTMLInputElement;
    fireEvent.change(nombre, { target: { value: "ANGELA GARCIA R" } });
    fireEvent.blur(nombre);
    await waitFor(() => expect(enviados.length).toBeGreaterThan(0));
    for (const cuerpo of enviados) {
      expect(Object.keys(cuerpo)).not.toContain("saldoVacacionesDias");
      expect(Object.keys(cuerpo)).not.toContain("saldoVacacionesCorte");
    }
  });

  // 🔑 CONTROL — lo que NO se podía perder al sacar el campo de al lado.
  it("🔑 CONTROL — «Empezó a trabajar» sigue en la ficha y sigue viajando", async () => {
    await abrirFicha();
    expect(screen.getAllByText(/Empezó a trabajar/).length).toBeGreaterThan(0);
    const ingreso = screen.getAllByDisplayValue("2019-02-16")[0] as HTMLInputElement;
    expect(ingreso).toBeTruthy();
    fireEvent.change(ingreso, { target: { value: "2019-03-16" } });
    fireEvent.blur(ingreso);
    await waitFor(() => expect(enviados.length).toBeGreaterThan(0));
    expect(enviados.some((e) => e.fechaIngreso === "2019-03-16")).toBe(true);
  });
});

describe("🔑 CONTROL — dar de baja no se rompió", () => {
  it("el PUT de la baja lleva la fecha de salida", async () => {
    await abrirFicha();
    const fechas = screen.getAllByDisplayValue("") as HTMLInputElement[];
    const fechaSalida = fechas.find((i) => i.type === "date");
    expect(fechaSalida).toBeTruthy();
    fireEvent.change(fechaSalida!, { target: { value: "2026-09-30" } });
    fireEvent.click(screen.getAllByRole("button", { name: /Renunció/ })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: /Dar de baja|Guardar/ })[0]);
    await waitFor(() => expect(enviados.length).toBeGreaterThan(0));
    expect(enviados.some((e) => e.fechaSalida === "2026-09-30")).toBe(true);
  });
});
