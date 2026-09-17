/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LOS DÍAS DE VACACIONES QUE LE CORRESPONDEN, EN LA PANTALLA DE VERDAD.
 *
 * ⚠️ ESTE ARCHIVO CAMBIÓ DE DIRECCIÓN el 17-sep-2026, y por eso la nota va
 * fechada. Hasta hoy exigía que la pantalla mostrara un SALDO que contabilidad
 * escribía a mano con su fecha de corte, y que a quien no lo tuviera le dijera
 * «Falta el saldo». Ese saldo se retiró: medido ese día, de las 49 fichas
 * NINGUNA tenía un número —47 vacías y 2 con un 0—, así que la pantalla decía
 * «Falta el saldo» para todo el mundo y
 * el dato que hacía falta —cuántos días le tocan por antigüedad— no se veía
 * nunca.
 *
 * Daniel, textual: *«las vacaciones no funciona por día, hay que cambiar eso,
 * funciona que por cada 11 meses trabajado, 1 mes de vacaciones»* · *«1. Un mes
 * son 30 días corridos. 2. La fecha de ingreso que tiene la ficha»* · *«Quita
 * lo del saldo vacaciones»*.
 *
 * 🔴 LO QUE NO CAMBIÓ, y son los CONTROLES de este cambio de dirección:
 *   · quien NO tiene el dato APARECE igual, diciendo qué le falta, y su renglón
 *     NO tiene ningún número (era «245 días disponibles» lo que había que
 *     evitar, y lo sigue siendo);
 *   · el número se dice en el formulario, en el momento en que se decide si
 *     alguien puede irse;
 *   · nada se descarta en silencio: si llegaron menos vacaciones de las que
 *     hay, la pantalla lo dice.
 *
 * 🔴 LO QUE SE AGREGÓ: el número NO se llama «saldo» ni «le quedan», y va
 * SIEMPRE con la línea gris que dice que no incluye lo tomado antes. Sin ella
 * alguien le paga 45 días a quien ya se tomó 30.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

import { ToastProvider } from "@/components/ToastSystem";
import VacacionesTab from "@/app/asistencia/VacacionesTab";
import {
  avisoSinFechaIngreso,
  COMO_SE_CALCULA,
  NO_INCLUYE_ANTES,
} from "@/lib/asistencia/vacaciones-corresponden";

/** Ganó 30 por antigüedad, se tomó 10 → le corresponden 20. */
const ANGELA = {
  codigo: "7", etiqueta: "ANGELA GARCIA",
  dias: 20, ganados: 30, tomados: 10, yaPagados: 0, faltaFechaIngreso: false,
};
/** Con días COBRADOS: restan igual y se nombran aparte. */
const ELOYN = {
  codigo: "29", etiqueta: "ELOYN MENDOZA",
  dias: 27, ganados: 30, tomados: 0, yaPagados: 3, faltaFechaIngreso: false,
};
/** 🔴 Le falta la fecha de ingreso: no hay número, y se dice. */
const ALEJANDRA = {
  codigo: "22", etiqueta: "ALEJANDRA CAMAÑO",
  dias: null, ganados: null, tomados: 0, yaPagados: 0, faltaFechaIngreso: true,
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
  corresponden: [ANGELA, ELOYN, ALEJANDRA],
  avisoSinFecha: avisoSinFechaIngreso(20),
  avisoIncompleto: null,
  comoSeCalcula: COMO_SE_CALCULA,
  noIncluyeAntes: NO_INCLUYE_ANTES,
};

function servir(cuerpo: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => cuerpo }) as Response));
}
const montar = () => render(<ToastProvider><VacacionesTab /></ToastProvider>);

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

/** El renglón de una persona en la lista, leído del DOM. */
const renglon = (codigo: string) =>
  document.querySelector(`li[data-saldo-codigo="${codigo}"]`) as HTMLElement | null;

const TITULO = "Días de vacaciones por colaborador";

// ═════════════════════════════════════════════════════════════════════════════
describe("la lista de días", () => {
  it("se ve, con el título y la regla en UNA línea", async () => {
    servir(RESPUESTA);
    montar();
    await screen.findByText(TITULO);
    expect(
      screen.getByText((t) => t.includes("30 días corridos por cada 11 meses trabajados")),
    ).toBeTruthy();
  });

  // 🔴 LA LÍNEA QUE NO SE PUEDE SACAR. Sin ella el número se lee como un saldo.
  it("🔴 dice que NO incluye lo tomado antes del 17 de septiembre de 2026", async () => {
    servir(RESPUESTA);
    montar();
    await screen.findByText(TITULO);
    expect(
      screen.getByText((t) => t.includes("No incluye vacaciones tomadas antes del 17 de septiembre de 2026")),
    ).toBeTruthy();
  });

  // 🔴 «Le corresponden», NUNCA «le quedan»: no es un saldo.
  it("🔴 dice «Le corresponden 20 días», y en ningún lado «le quedan»", async () => {
    servir(RESPUESTA);
    montar();
    await waitFor(() => expect(renglon("7")).toBeTruthy());
    expect(renglon("7")!.textContent).toContain("Le corresponden 20 días");
    expect(document.body.textContent ?? "").not.toMatch(/[Ll]e quedan/);
    expect(document.body.textContent ?? "").not.toMatch(/Saldo por colaborador/);
  });

  it("🔴 y DE DÓNDE salió: lo ganado y lo que se tomó", async () => {
    servir(RESPUESTA);
    montar();
    await waitFor(() => expect(renglon("7")).toBeTruthy());
    const t = renglon("7")!.textContent ?? "";
    expect(t).toContain("30 ganados");
    expect(t).toContain("tomó 10");
  });

  it("🔴 los días «ya pagados» se nombran aparte: se cobraron, no se descansaron", async () => {
    servir(RESPUESTA);
    montar();
    await waitFor(() => expect(renglon("29")).toBeTruthy());
    expect(renglon("29")!.textContent).toContain("Le corresponden 27 días");
    expect(renglon("29")!.textContent).toContain("ya pagados 3");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("🔑 CONTROL — a quien le falta la fecha de ingreso", () => {
  it("APARECE en la lista — no se lo esconde", async () => {
    servir(RESPUESTA);
    montar();
    await waitFor(() => expect(renglon("22")).toBeTruthy());
    expect(renglon("22")!.textContent).toContain("ALEJANDRA CAMAÑO");
  });

  it("🔴 dice qué falta y su renglón NO tiene ningún número", async () => {
    servir(RESPUESTA);
    montar();
    await waitFor(() => expect(renglon("22")).toBeTruthy());
    const texto = renglon("22")!.textContent ?? "";
    expect(texto).toContain("Falta la fecha de ingreso");
    // Un «0» acá se leería como «no le toca ni un día».
    expect(texto).not.toMatch(/\d/);
  });

  it("la línea de arriba dice cuántas son y por qué", async () => {
    servir(RESPUESTA);
    montar();
    const aviso = await screen.findByText((t) => t.includes("20 colaboradores no tienen fecha de ingreso"));
    expect(aviso.textContent).toContain("no se pueden calcular sus días de vacaciones");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("🔑 CONTROL — al elegir a la persona en el formulario", () => {
  it("le dice los días ahí mismo, que es donde se decide", async () => {
    servir(RESPUESTA);
    montar();
    await screen.findByText(TITULO);
    const select = document.querySelector("select") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "7" } });
    // 🔑 Se lee el PÁRRAFO entero: el número va en un <b> adentro, así que un
    // matcher de texto por elemento no lo vería y el test pasaría en falso.
    await waitFor(() => {
      const linea = select.parentElement!.querySelector("p");
      expect(linea?.textContent ?? "").toContain("Le corresponden 20 días");
    });
  });

  it("y si le falta la fecha, lo dice en vez de inventar un número", async () => {
    servir(RESPUESTA);
    montar();
    await screen.findByText(TITULO);
    const select = document.querySelector("select") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "22" } });
    await waitFor(() => {
      // Dos veces: en el formulario y en la lista. Ninguna con un número.
      expect(screen.getAllByText("Falta la fecha de ingreso").length).toBe(2);
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("🔑 CONTROL — nada se descarta en silencio", () => {
  it("si llegaron menos vacaciones de las que hay, la pantalla LO DICE", async () => {
    servir({
      ...RESPUESTA,
      avisoIncompleto:
        "Se están mostrando 500 de 812 vacaciones: los días pueden estar restando de menos.",
    });
    montar();
    expect(
      await screen.findByText((t) => t.includes("los días pueden estar restando de menos")),
    ).toBeTruthy();
  });

  it("sin nadie que mostrar, la sección entera no existe — nada de cuadros vacíos", async () => {
    servir({ ...RESPUESTA, corresponden: [], avisoSinFecha: null });
    montar();
    await waitFor(() => expect(document.querySelector("select")).toBeTruthy());
    expect(screen.queryByText(TITULO)).toBeNull();
  });
});
