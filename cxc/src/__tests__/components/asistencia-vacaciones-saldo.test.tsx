/**
 * ─────────────────────────────────────────────────────────────────────────────
 * EL SALDO DE VACACIONES, EN LA PANTALLA DE VERDAD.
 *
 * 🔴 POR QUÉ ESTE ARCHIVO EXISTE. Que `saldoDe()` devuelva `null` sin fecha de
 * ingreso no prueba NADA sobre lo que Daniel ve: la pantalla podía escribir
 * «0 de 0» a mano, o filtrar de la lista a las 20 personas sin fecha, y todos
 * los tests de función pura seguirían en verde. Este repo ya pagó cuatro veces
 * por un test satisfecho con su propia explicación.
 *
 * Lo que se sostiene acá, RENDERIZANDO y tocando:
 *   1. la columna de saldo existe y dice «71 de 100» — corto;
 *   2. 🔴 quien no tiene fecha de ingreso APARECE, diciendo «Falta la fecha de
 *      ingreso», y su renglón NO tiene ningún número;
 *   3. la línea que cuenta cuántas personas quedaron sin saldo se ve, con el
 *      dónde;
 *   4. al elegir a alguien en el formulario, su saldo se dice ahí mismo — que
 *      es el momento en que se decide si puede irse.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

import { ToastProvider } from "@/components/ToastSystem";
import VacacionesTab from "@/app/asistencia/VacacionesTab";
import { avisoSinSaldo, DESDE_CUANDO_CUENTA } from "@/lib/asistencia/saldo-vacaciones";

/** Con saldo: 12 al corte, +8 ganados, 10 tomados → 10 días. */
const ANGELA = {
  codigo: "7", etiqueta: "ANGELA GARCIA",
  saldo: 10, saldoInicial: 12, corte: "2026-08-25",
  ganadosDesdeCorte: 8, tomados: 10, yaPagados: 0, falta: null,
};
/** Con días COBRADOS: restan igual y se nombran aparte. Y con MEDIO día. */
const ELOYN = {
  codigo: "29", etiqueta: "ELOYN MENDOZA",
  saldo: 9.5, saldoInicial: 12.5, corte: "2026-08-25",
  ganadosDesdeCorte: 0, tomados: 0, yaPagados: 3, falta: null,
};
/** Le falta la fecha de ingreso. */
const ALEJANDRA = {
  codigo: "22", etiqueta: "ALEJANDRA CAMAÑO",
  saldo: null, saldoInicial: null, corte: null,
  ganadosDesdeCorte: 0, tomados: 0, yaPagados: 0, falta: "fecha" as const,
};
/** 🩸 Tiene fecha de ingreso de 2019 y NO tiene saldo cargado: es el caso que
 *  mostraba 245 días disponibles. Ahora tiene que decir «Falta el saldo». */
const SIN_SALDO = {
  codigo: "11", etiqueta: "JULIO GARAY",
  saldo: null, saldoInicial: null, corte: null,
  ganadosDesdeCorte: 0, tomados: 0, yaPagados: 0, falta: "saldo" as const,
};

const RESPUESTA = {
  vacaciones: [{
    id: "v1", empleado_codigo: "29", desde: "2026-07-16", hasta: "2026-08-13",
    ya_pagadas: false, registrado_por: "Daniel",
  }],
  personas: [
    { codigo: "29", nombre: "ELOYN MENDOZA", etiqueta: "ELOYN MENDOZA", configurado: true },
    { codigo: "22", nombre: "ALEJANDRA CAMAÑO", etiqueta: "ALEJANDRA CAMAÑO", configurado: true },
    { codigo: "7", nombre: "ANGELA GARCIA", etiqueta: "ANGELA GARCIA", configurado: true },
    { codigo: "11", nombre: "JULIO GARAY", etiqueta: "JULIO GARAY", configurado: true },
  ],
  faltaMigracion: false,
  puedeCargar: true,
  avisoMigracion: null,
  saldos: [ANGELA, ELOYN, ALEJANDRA, SIN_SALDO],
  avisoSaldo: avisoSinSaldo(20, 16),
  avisoSaldoIncompleto: null,
  desdeCuandoCuenta: DESDE_CUANDO_CUENTA,
};

function servir(cuerpo: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => cuerpo }) as Response));
}
const montar = () => render(<ToastProvider><VacacionesTab /></ToastProvider>);

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

/** El renglón de una persona en la lista de saldos, leído del DOM. */
const renglon = (codigo: string) =>
  document.querySelector(`li[data-saldo-codigo="${codigo}"]`) as HTMLElement | null;

// ─────────────────────────────────────────────────────────────────────────────
// 🩸 ESTE ARCHIVO ENTERO DURMIÓ UNAS HORAS (1-sep-2026) Y VOLVIÓ.
//
// La pestaña se apagó por la mañana —*«olvida lo de las vacaciones por ahora,
// quitalo del ERP para no enrredar»*— y los 14 casos pasaron a `describe.skip`
// en vez de borrarse. Se retractó el mismo día: *«vacaciones quedamos que sí,
// dejalo, solo que haslo bien»*, y despertarlos fue cambiar cuatro palabras.
//
// 🔑 LA LECCIÓN, que es por lo que esta nota se queda: si se hubieran borrado,
// volver a encender la pestaña habría dejado sin definición escrita lo que esta
// pantalla garantiza —que quien NO tiene fecha de ingreso aparezca igual
// diciendo qué le falta en vez de un número inventado, que el medio día se vea,
// que el saldo se diga en el momento en que se decide si alguien puede irse—.
// ─────────────────────────────────────────────────────────────────────────────
describe("la columna de saldo", () => {
  it("se ve, con el título y la regla en UNA línea", async () => {
    servir(RESPUESTA);
    montar();
    await screen.findByText("Saldo por persona");
    expect(
      screen.getByText((t) => t.includes("30 días por cada 11 meses trabajados")),
    ).toBeTruthy();
  });

  it("dice «10 días» — corto, sin párrafos", async () => {
    servir(RESPUESTA);
    montar();
    await waitFor(() => expect(renglon("7")).toBeTruthy());
    expect(renglon("7")!.textContent).toContain("10 días");
  });

  it("🔴 y DE DÓNDE salió: el arranque, la fecha de corte y el movimiento", async () => {
    servir(RESPUESTA);
    montar();
    await waitFor(() => expect(renglon("7")).toBeTruthy());
    const t = renglon("7")!.textContent ?? "";
    expect(t).toContain("12 al 25 ago 2026");
    expect(t).toContain("+8 ganados");
    expect(t).toContain("tomó 10");
  });

  it("🔴 los días «ya pagados» se nombran aparte: se cobraron, no se descansaron", async () => {
    servir(RESPUESTA);
    montar();
    await waitFor(() => expect(renglon("29")).toBeTruthy());
    expect(renglon("29")!.textContent).toContain("9.5 días");
    expect(renglon("29")!.textContent).toContain("ya pagados 3");
  });

  it("🔴 el MEDIO día se ve, y el entero NO se ensucia con un «.0»", async () => {
    servir(RESPUESTA);
    montar();
    await waitFor(() => expect(renglon("29")).toBeTruthy());
    // ELOYN arrancó en 12.5 y le quedan 9.5.
    expect(renglon("29")!.textContent).toContain("12.5 al 25 ago 2026");
    // ANGELA arrancó en 12 y le quedan 10: ni un decimal a la vista.
    const angela = renglon("7")!.textContent ?? "";
    expect(angela).toContain("10 días");
    expect(angela).toContain("12 al 25 ago 2026");
    expect(angela).not.toContain(".0");
  });

  it("dice cuántas personas ya tienen saldo, sin hacerlo contar a nadie", async () => {
    servir(RESPUESTA);
    montar();
    expect(await screen.findByText((t) => t.includes("2 de 4 ya tienen saldo"))).toBeTruthy();
  });
});

describe("🔴 a quien le falta un dato", () => {
  it("APARECE en la lista — no se lo esconde", async () => {
    servir(RESPUESTA);
    montar();
    await waitFor(() => expect(renglon("22")).toBeTruthy());
    expect(renglon("22")!.textContent).toContain("ALEJANDRA CAMAÑO");
  });

  it("dice «Falta la fecha de ingreso» y su renglón NO tiene ningún número", async () => {
    servir(RESPUESTA);
    montar();
    await waitFor(() => expect(renglon("22")).toBeTruthy());
    const texto = renglon("22")!.textContent ?? "";
    expect(texto).toContain("Falta la fecha de ingreso");
    // Un «0 de 0» acá se leería como «no le queda ni un día».
    expect(texto).not.toMatch(/\d/);
  });

  it("🩸 quien tiene fecha de 2019 pero no saldo NO muestra un número grande", async () => {
    servir(RESPUESTA);
    montar();
    await waitFor(() => expect(renglon("11")).toBeTruthy());
    const texto = renglon("11")!.textContent ?? "";
    expect(texto).toContain("Falta el saldo");
    // Es el renglón que antes decía «245 de 245». Ni un dígito.
    expect(texto.replace("JULIO GARAY", "")).not.toMatch(/\d/);
  });

  it("la línea de arriba dice cuántas son, por qué, y DÓNDE se arregla", async () => {
    servir(RESPUESTA);
    montar();
    const aviso = await screen.findByText((t) => t.includes("36 personas no tienen saldo"));
    expect(aviso.textContent).toContain("a 20 les falta la fecha de ingreso");
    expect(aviso.textContent).toContain("a 16 el saldo");
    expect(aviso.textContent).toContain("Configuración");
  });
});

describe("al elegir a la persona en el formulario", () => {
  it("le dice el saldo ahí mismo, que es donde se decide", async () => {
    servir(RESPUESTA);
    montar();
    await screen.findByText("Saldo por persona");
    const select = document.querySelector("select") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "7" } });
    // 🔑 Se lee el PÁRRAFO entero: el número va en un <b> adentro, así que un
    // matcher de texto por elemento no lo vería y el test pasaría en falso.
    await waitFor(() => {
      const linea = select.parentElement!.querySelector("p");
      expect(linea?.textContent ?? "").toContain("Le quedan 10 días");
    });
  });

  it("y si le falta un dato, lo dice en vez de inventar un número", async () => {
    servir(RESPUESTA);
    montar();
    await screen.findByText("Saldo por persona");
    const select = document.querySelector("select") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "22" } });
    await waitFor(() => {
      // Dos veces: en el formulario y en la lista. Ninguna con un número.
      const todos = screen.getAllByText("Falta la fecha de ingreso");
      expect(todos.length).toBe(2);
    });
  });
});

describe("nada se descarta en silencio", () => {
  it("si llegaron menos vacaciones de las que hay, la pantalla LO DICE", async () => {
    servir({
      ...RESPUESTA,
      avisoSaldoIncompleto:
        "Se están mostrando 500 de 812 vacaciones: el saldo puede estar restando de menos.",
    });
    montar();
    expect(
      await screen.findByText((t) => t.includes("el saldo puede estar restando de menos")),
    ).toBeTruthy();
  });

  it("sin saldos que mostrar, la sección entera no existe — nada de cuadros vacíos", async () => {
    servir({ ...RESPUESTA, saldos: [], avisoSaldo: null });
    montar();
    await waitFor(() => expect(document.querySelector("select")).toBeTruthy());
    expect(screen.queryByText("Saldo por persona")).toBeNull();
  });
});
