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
import { avisoSinFechaIngreso, DESDE_CUANDO_CUENTA } from "@/lib/asistencia/saldo-vacaciones";

const ELOYN = {
  codigo: "29", etiqueta: "ELOYN MENDOZA",
  ganados: 100, tomados: 29, yaPagados: 0, saldo: 71, faltaFechaIngreso: false,
};
const ALEJANDRA = {
  codigo: "22", etiqueta: "ALEJANDRA CAMAÑO",
  ganados: null, tomados: 0, yaPagados: 0, saldo: null, faltaFechaIngreso: true,
};
const COBRADAS = {
  codigo: "7", etiqueta: "ANGELA GARCIA",
  ganados: 245, tomados: 0, yaPagados: 3, saldo: 242, faltaFechaIngreso: false,
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
  ],
  faltaMigracion: false,
  puedeCargar: true,
  avisoMigracion: null,
  saldos: [ELOYN, ALEJANDRA, COBRADAS],
  avisoSaldo: avisoSinFechaIngreso(20),
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

describe("la columna de saldo", () => {
  it("se ve, con el título y la regla en UNA línea", async () => {
    servir(RESPUESTA);
    montar();
    await screen.findByText("Saldo por persona");
    expect(
      screen.getByText((t) => t.includes("30 días por cada 11 meses trabajados")),
    ).toBeTruthy();
  });

  it("dice «71 de 100» — corto, sin párrafos", async () => {
    servir(RESPUESTA);
    montar();
    await waitFor(() => expect(renglon("29")).toBeTruthy());
    expect(renglon("29")!.textContent).toContain("71 de 100");
    // Y el detalle de en qué se fueron los días, chiquito al lado.
    expect(renglon("29")!.textContent).toContain("tomó 29");
  });

  it("🔴 los días «ya pagados» se nombran aparte: se cobraron, no se descansaron", async () => {
    servir(RESPUESTA);
    montar();
    await waitFor(() => expect(renglon("7")).toBeTruthy());
    expect(renglon("7")!.textContent).toContain("242 de 245");
    expect(renglon("7")!.textContent).toContain("ya pagados 3");
  });
});

describe("🔴 quien no tiene fecha de ingreso", () => {
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

  it("la línea de arriba dice cuántas son y DÓNDE se arregla", async () => {
    servir(RESPUESTA);
    montar();
    const aviso = await screen.findByText((t) => t.includes("20 personas no tienen saldo"));
    expect(aviso.textContent).toContain("Configuración");
  });
});

describe("al elegir a la persona en el formulario", () => {
  it("le dice el saldo ahí mismo, que es donde se decide", async () => {
    servir(RESPUESTA);
    montar();
    await screen.findByText("Saldo por persona");
    const select = document.querySelector("select") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "29" } });
    // 🔑 Se lee el PÁRRAFO entero: el número va en un <b> adentro, así que un
    // matcher de texto por elemento no lo vería y el test pasaría en falso.
    await waitFor(() => {
      const linea = select.parentElement!.querySelector("p");
      expect(linea?.textContent ?? "").toContain("Le quedan 71 de 100 días");
    });
  });

  it("y si le falta la fecha, lo dice en vez de inventar un número", async () => {
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
