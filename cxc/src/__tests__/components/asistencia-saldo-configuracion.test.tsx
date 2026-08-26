/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CARGAR EL SALDO DE VACACIONES, EN LA PANTALLA DE VERDAD.
 *
 * 🔴 POR QUÉ ESTE ARCHIVO EXISTE. Que el validador acepte un `12` no prueba
 * NADA sobre lo que contabilidad puede hacer: el campo podía no estar en la
 * ficha, estar deshabilitado, o —peor— existir y NO viajar en el PUT. Y hay un
 * modo de fallo que ningún test de función pura puede ver: **el PUT es un
 * upsert de la fila entera**, así que una pantalla que se olvide de mandar el
 * saldo al dar de baja se lo BORRA a la persona, junto con la fecha de corte
 * que es lo único que impide volver a restar días ya contados.
 *
 * Lo que se sostiene acá, RENDERIZANDO y tocando:
 *   1. el campo existe, se llama en español simple y está EDITABLE;
 *   2. lo que se escribe VIAJA en el PUT (se lee el cuerpo del `fetch`);
 *   3. la pantalla dice a qué día quedó fijado el número — sin esa fecha, «12»
 *      no significa nada;
 *   4. 🔴 dar de baja NO le borra el saldo;
 *   5. sin la migración corrida el campo se ve deshabilitado y LO DICE, antes
 *      de tocarlo y no al fallar el guardado.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

import { ToastProvider } from "@/components/ToastSystem";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import ConfiguracionTab from "@/app/asistencia/ConfiguracionTab";
import { ETIQUETA_SALDO_INICIAL } from "@/lib/asistencia/saldo-vacaciones";

const ANGELA = {
  codigo: "7", nombre: "ANGELA GARCIA", salarioMensual: 850, jornadaSemanal: 48,
  empresa: "vistana", configurado: true, faltaSalario: false, marcaciones: 120,
  ultimaMarca: "2026-08-25", rataHora: 4.09, valorMinuto: 0.07,
  servicioProfesional: false, pagaSeguros: true,
  fechaIngreso: "2019-02-16", fechaSalida: null, motivoSalida: null,
  saldoVacacionesDias: 12, saldoVacacionesCorte: "2026-08-25",
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
  avisoMigracionSaldoVacaciones: null,
  puedeCargarSaldoVacaciones: true,
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
  await screen.findAllByText(/ANGELA GARCIA/);
  fireEvent.click(screen.getAllByRole("button", { name: /ANGELA GARCIA/ })[0]);
}

/**
 * El campo del saldo, buscado por su etiqueta real.
 *
 * 🩸 Se filtra por `INPUT` a propósito: el botón ⓘ de ayuda lleva el MISMO
 * texto como `aria-label` y sale PRIMERO en el DOM, así que un `[0]` pelado
 * agarra el botón —que nunca está deshabilitado ni tiene valor— y el test pasa
 * o falla mirando el elemento equivocado.
 */
const campoSaldo = () =>
  screen
    .getAllByLabelText(new RegExp(ETIQUETA_SALDO_INICIAL, "i"))
    .find((e) => e.tagName === "INPUT") as HTMLInputElement;

describe("el campo del saldo, en la ficha", () => {
  it("existe, se llama en español simple y está EDITABLE", async () => {
    await abrirFicha();
    const c = campoSaldo();
    expect(c).toBeTruthy();
    expect(c.disabled).toBe(false);
    expect(c.value).toBe("12");
  });

  it("🔑 va AL LADO de «Empezó a trabajar», no en otra pantalla", async () => {
    await abrirFicha();
    expect(screen.getAllByText(/Empezó a trabajar/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(new RegExp(ETIQUETA_SALDO_INICIAL, "i")).length).toBeGreaterThan(0);
  });

  it("dice a QUÉ DÍA quedó fijado el número — sin eso, «12» no significa nada", async () => {
    await abrirFicha();
    expect(screen.getAllByText(/Al 25 de agosto de 2026/).length).toBeGreaterThan(0);
  });
});

describe("🔴 medios días en el campo", () => {
  it("el campo se mueve de a MEDIO día", async () => {
    await abrirFicha();
    expect(campoSaldo().step).toBe("0.5");
  });

  it("🔑 en el iPhone el teclado trae el punto: `inputMode=decimal`, no `numeric`", async () => {
    await abrirFicha();
    expect(campoSaldo().getAttribute("inputmode")).toBe("decimal");
  });

  it("un 12.5 escrito a mano VIAJA tal cual", async () => {
    await abrirFicha();
    const c = campoSaldo();
    fireEvent.change(c, { target: { value: "12.5" } });
    fireEvent.blur(c);
    await waitFor(() => expect(enviados.length).toBeGreaterThan(0));
    expect(enviados[0].saldoVacacionesDias).toBe("12.5");
  });

  it("🔴 un saldo entero se ve «12», nunca «12.0»", async () => {
    await abrirFicha();
    expect(campoSaldo().value).toBe("12");
  });

  it("y uno de medio día se ve con su decimal", async () => {
    await abrirFicha(datos({
      personas: [{ ...ANGELA, saldoVacacionesDias: 12.5 }],
    }));
    expect(campoSaldo().value).toBe("12.5");
  });
});

describe("🔴 lo que se escribe VIAJA en el PUT", () => {
  it("el número nuevo sale en el cuerpo del pedido", async () => {
    await abrirFicha();
    const c = campoSaldo();
    fireEvent.change(c, { target: { value: "20" } });
    fireEvent.blur(c);
    await waitFor(() => expect(enviados.length).toBeGreaterThan(0));
    expect(enviados[0].saldoVacacionesDias).toBe("20");
  });

  it("🔑 vaciarlo también viaja: es «todavía no lo sé», no «no cambies nada»", async () => {
    await abrirFicha();
    const c = campoSaldo();
    fireEvent.change(c, { target: { value: "" } });
    fireEvent.blur(c);
    await waitFor(() => expect(enviados.length).toBeGreaterThan(0));
    expect(enviados[0].saldoVacacionesDias).toBe("");
  });

  it("⛔ la FECHA DE CORTE no la manda la pantalla: la pone el servidor", async () => {
    await abrirFicha();
    const c = campoSaldo();
    fireEvent.change(c, { target: { value: "20" } });
    fireEvent.blur(c);
    await waitFor(() => expect(enviados.length).toBeGreaterThan(0));
    expect(Object.keys(enviados[0])).not.toContain("saldoVacacionesCorte");
  });
});

describe("🔴 dar de baja NO le borra el saldo", () => {
  it("el PUT de la baja lleva el saldo de la persona", async () => {
    await abrirFicha();
    // El bloque de baja: se elige el motivo y se guarda.
    const fechas = screen.getAllByDisplayValue("") as HTMLInputElement[];
    const fechaSalida = fechas.find((i) => i.type === "date");
    expect(fechaSalida).toBeTruthy();
    fireEvent.change(fechaSalida!, { target: { value: "2026-09-30" } });
    fireEvent.click(screen.getAllByRole("button", { name: /Renunció/ })[0]);
    const guardar = screen.getAllByRole("button", { name: /Dar de baja|Guardar/ })[0];
    fireEvent.click(guardar);
    await waitFor(() => expect(enviados.length).toBeGreaterThan(0));
    // 🩸 El PUT es un upsert de la fila ENTERA: sin este campo, la baja le
    // dejaría el saldo en NULL y la fecha de corte también.
    const baja = enviados.find((e) => e.fechaSalida === "2026-09-30");
    expect(baja).toBeTruthy();
    expect(baja!.saldoVacacionesDias).toBe("12");
  });
});

describe("sin la migración corrida", () => {
  it("el campo se ve deshabilitado y LO DICE, antes de tocarlo", async () => {
    await abrirFicha(datos({
      puedeCargarSaldoVacaciones: false,
      avisoMigracionSaldoVacaciones: "falta correr el archivo",
    }));
    expect(campoSaldo().disabled).toBe(true);
    expect(
      screen.getAllByText(/Todavía no se puede cargar el saldo/).length,
    ).toBeGreaterThan(0);
  });
});
