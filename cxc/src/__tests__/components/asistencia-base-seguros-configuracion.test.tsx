/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LA BASE PROPIA DE LOS SEGUROS, EN LA PANTALLA DE VERDAD.
 *
 * 🔴 POR QUÉ ESTE ARCHIVO EXISTE. Que el validador acepte un `175` no prueba
 * NADA sobre lo que contabilidad puede hacer: el campo podía no estar en la
 * ficha, estar deshabilitado, o —peor— existir y NO viajar en el PUT. Y hay un
 * modo de fallo que ningún test de función pura puede ver: **el PUT es un
 * upsert de la fila entera**, así que una pantalla que se olvide de mandar la
 * base al dar de baja se la BORRA a la persona, y su liquidación se calcularía
 * con el 9,75 % sobre el bruto.
 *
 * 🩸 Y HAY UNO MÁS, QUE ES EL QUE DE VERDAD DUELE: la única ambigüedad de todo
 * esto es si los 175 son del MES o de la QUINCENA. Si son del mes, quien
 * escribe el número que dijo la contadora hace retener 8,53 USD en vez de
 * 17,06 —la MITAD del seguro— y eso no se ve en el neto de nadie. La pantalla
 * lo mata mostrando los dos montos calculados debajo del campo, y ESO es lo que
 * este archivo prueba: que quien escribe 175 lee 17,06 y 2,19 en el acto.
 *
 * Lo que se sostiene acá, RENDERIZANDO y tocando:
 *   1. el campo existe, se llama en español simple y está EDITABLE;
 *   2. 🔴 escribir 175 muestra $17.06 y $2.19 — la unidad queda dicha en montos;
 *   3. lo que se escribe VIAJA en el PUT (se lee el cuerpo del `fetch`);
 *   4. 🔴 dar de baja NO le borra la base;
 *   5. sin la migración corrida el campo se ve deshabilitado y LO DICE, antes
 *      de tocarlo y no al fallar el guardado.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

import { ToastProvider } from "@/components/ToastSystem";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import ConfiguracionTab from "@/app/asistencia/ConfiguracionTab";
import { PREGUNTA_BASE_SEGUROS } from "@/lib/asistencia/seguros-base";

/** RODRIGO MIRANDA, ficha real de producción (código 13, Vistana). */
const RODRIGO = {
  codigo: "13", nombre: "RODRIGO MIRANDA", salarioMensual: 800, jornadaSemanal: 40,
  empresa: "vistana", configurado: true, faltaSalario: false, marcaciones: 100,
  ultimaMarca: "2026-08-26", rataHora: 4.62, valorMinuto: 0.076925,
  servicioProfesional: false, pagaSeguros: true, baseSeguros: null, noMarcaReloj: false,
  fechaIngreso: "2025-01-14", fechaSalida: null, motivoSalida: null,
  saldoVacacionesDias: null, saldoVacacionesCorte: null,
  activo: true, baja: null, marcoDespuesDeLaBaja: false,
};

const datos = (over: Record<string, unknown> = {}, persona: Record<string, unknown> = {}) => ({
  personas: [{ ...RODRIGO, ...persona }],
  reglas: REGLAS_DEFAULT,
  reglasDefault: REGLAS_DEFAULT,
  resumen: {
    total: 1, sinConfigurar: 0, sinSalario: 0, conMarcaciones: 1, bajas: 0,
    servicioProfesional: 0, noMarcaReloj: 0,
  },
  faltaMigracion: false,
  avisoMigracion: null,
  avisoMigracionBajas: null,
  puedeDarDeBaja: true,
  avisoBajas: null,
  avisoMigracionServicioProfesional: null,
  puedeMarcarServicioProfesional: true,
  avisoMigracionSeguros: null,
  puedeQuitarSeguros: true,
  avisoMigracionBaseSeguros: null,
  puedeCargarBaseSeguros: true,
  avisoMigracionNoMarcaReloj: null,
  puedeMarcarSueldoFijo: true,
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
      const body = JSON.parse(String(init.body));
      enviados.push(body);
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
  await screen.findAllByText(/RODRIGO MIRANDA/);
  fireEvent.click(screen.getAllByRole("button", { name: /RODRIGO MIRANDA/ })[0]);
}

/**
 * El campo de la base, buscado por su etiqueta real.
 *
 * 🩸 Se filtra por `INPUT` a propósito: el botón ⓘ de ayuda lleva el MISMO
 * texto como `aria-label` y sale PRIMERO en el DOM, así que un `[0]` pelado
 * agarra el botón —que nunca está deshabilitado ni tiene valor— y el test pasa
 * o falla mirando el elemento equivocado.
 */
const campoBase = () =>
  screen
    .getAllByLabelText(new RegExp(PREGUNTA_BASE_SEGUROS, "i"))
    .find((e) => e.tagName === "INPUT") as HTMLInputElement;

// ─────────────────────────────────────────────────────────────────────────────
describe("el campo de la base, en la ficha", () => {
  it("existe, se llama en español simple y está EDITABLE", async () => {
    await abrirFicha();
    const c = campoBase();
    expect(c).toBeTruthy();
    expect(c.disabled).toBe(false);
    // Vacío = los seguros salen del bruto, que es lo de siempre.
    expect(c.value).toBe("");
  });

  it("🔑 va AL LADO del interruptor de los seguros, no en otra pantalla", async () => {
    await abrirFicha();
    expect(screen.getAllByText(/¿Se le descuentan los seguros\?/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(new RegExp(PREGUNTA_BASE_SEGUROS, "i")).length).toBeGreaterThan(0);
  });

  it("vacío, dice en UNA línea gris que se usa en vez del bruto y que es por quincena", async () => {
    await abrirFicha();
    // 🔑 Una línea, no un párrafo. Y dice la UNIDAD, que es lo único ambiguo.
    expect(screen.getAllByText(/Se usa en vez del bruto\. Es el monto de una quincena\./).length)
      .toBeGreaterThan(0);
    // El campo mismo también la dice, sin gastar un renglón.
    expect(campoBase().placeholder).toBe("Por quincena");
  });

  it("una ficha que YA tiene base la muestra con su monto", async () => {
    await abrirFicha(datos({}, { baseSeguros: 175 }));
    expect(campoBase().value).toBe("175");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 LA UNIDAD, DICHA EN MONTOS — quien escribe 175 lee 17,06 y 2,19", () => {
  it("escribir 175 muestra los dos seguros calculados, al centavo", async () => {
    // 🩸 ES LA PRUEBA QUE MATA LA AMBIGÜEDAD. Si el campo fuera mensual, los
    // mismos 175 darían 8,53 y 1,09: la MITAD, invisible en el neto de nadie y
    // descubierta cuando la Caja pide lo que no se retuvo. Acá contabilidad ve
    // los dos números que ella escribió a mano en su Excel y los coteja sin
    // hacer una cuenta.
    await abrirFicha();
    fireEvent.change(campoBase(), { target: { value: "175" } });
    await waitFor(() => {
      expect(screen.getAllByText(/Seguro social \$17\.06 y educativo \$2\.19 por quincena\./).length)
        .toBeGreaterThan(0);
    });
    // Y la línea gris genérica se va: no hay dos textos peleando por el lugar.
    expect(screen.queryByText(/Se usa en vez del bruto/)).toBeNull();
  });

  it("los montos salen de las REGLAS, no de dos porcentajes escritos en la pantalla", async () => {
    // Con otros porcentajes en la tabla de reglas, los montos acompañan. Si
    // estuvieran cableados en el .tsx, este test se cae — y ese cableado es
    // exactamente cómo la pantalla termina diciendo una cosa y el cuadro otra.
    await abrirFicha(datos({ reglas: { ...REGLAS_DEFAULT, seguroSocialPct: 10, seguroEducativoPct: 2 } }));
    fireEvent.change(campoBase(), { target: { value: "200" } });
    await waitFor(() => {
      expect(screen.getAllByText(/Seguro social \$20\.00 y educativo \$4\.00 por quincena\./).length)
        .toBeGreaterThan(0);
    });
  });

  it("un valor que no es una base no inventa montos: sigue la línea gris", async () => {
    await abrirFicha();
    for (const v of ["", "0", "-5", "hola"]) {
      fireEvent.change(campoBase(), { target: { value: v } });
      await waitFor(() => {
        expect(screen.getAllByText(/Se usa en vez del bruto/).length, `«${v}»`).toBeGreaterThan(0);
      });
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 LO QUE SE ESCRIBE VIAJA — el cuerpo del PUT, leído", () => {
  it("el monto va en el PUT con el nombre que el servidor espera", async () => {
    await abrirFicha();
    const c = campoBase();
    fireEvent.change(c, { target: { value: "175" } });
    fireEvent.blur(c);
    await waitFor(() => expect(enviados.length).toBeGreaterThan(0));
    expect(enviados.at(-1)!.baseSeguros).toBe("175");
    // 🔑 Viaja el TEXTO, no un `Number()`: un campo vacío convertido acá
    // viajaría como 0, y un 0 apagaría los seguros por la puerta de atrás.
    expect(typeof enviados.at(-1)!.baseSeguros).toBe("string");
  });

  it("borrar el campo manda la base VACÍA — que es como se vuelve atrás", async () => {
    await abrirFicha(datos({}, { baseSeguros: 175 }));
    const c = campoBase();
    fireEvent.change(c, { target: { value: "" } });
    fireEvent.blur(c);
    await waitFor(() => expect(enviados.length).toBeGreaterThan(0));
    expect(enviados.at(-1)!.baseSeguros).toBe("");
  });

  it("🔴 DAR DE BAJA NO LE BORRA LA BASE", async () => {
    // 🩸 El PUT es un upsert de la fila ENTERA: sin mandar la base, dar de baja
    // se la borraría y su liquidación saldría con el 9,75 % sobre el bruto.
    await abrirFicha(datos({}, { baseSeguros: 175 }));
    // El bloque de baja: la única fecha vacía de la ficha es la de salida.
    const fechas = screen.getAllByDisplayValue("") as HTMLInputElement[];
    const fechaSalida = fechas.find((i) => i.type === "date");
    expect(fechaSalida).toBeTruthy();
    fireEvent.change(fechaSalida!, { target: { value: "2026-09-30" } });
    fireEvent.click(screen.getAllByRole("button", { name: /Renunció/ })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: /Dar de baja|Guardar/ })[0]);
    await waitFor(() => expect(enviados.length).toBeGreaterThan(0));
    const baja = enviados.find((e) => e.fechaSalida === "2026-09-30")!;
    expect(baja).toBeTruthy();
    expect(baja.baseSeguros).toBe("175");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🩸 SIN LA MIGRACIÓN CORRIDA — se dice ANTES de tocar, no al fallar", () => {
  const sinMigracion = datos({
    puedeCargarBaseSeguros: false,
    avisoMigracionBaseSeguros:
      "Todavía no se le puede poner una base propia de seguros a nadie: falta preparar la base de datos.",
  });

  it("el campo se ve deshabilitado", async () => {
    await abrirFicha(sinMigracion);
    expect(campoBase().disabled).toBe(true);
  });

  it("y la pantalla LO DICE, en español y sin jerga de base de datos", async () => {
    await abrirFicha(sinMigracion);
    const avisos = screen.getAllByText(
      /Todavía no se puede poner una base propia: falta correr el archivo de la base de datos\./,
    );
    expect(avisos.length).toBeGreaterThan(0);
  });

  it("y todo lo demás de la ficha sigue funcionando: guardar un nombre no se rompe", async () => {
    await abrirFicha(sinMigracion);
    // Las etiquetas de esta pantalla no llevan `htmlFor`, así que el campo del
    // nombre se busca por su valor: es el único que trae el nombre cargado.
    const nombre = screen.getAllByDisplayValue("RODRIGO MIRANDA")
      .find((e) => e.tagName === "INPUT") as HTMLInputElement;
    expect(nombre).toBeTruthy();
    fireEvent.change(nombre, { target: { value: "RODRIGO MIRANDA G." } });
    fireEvent.blur(nombre);
    await waitFor(() => expect(enviados.length).toBeGreaterThan(0));
    expect(enviados.at(-1)!.nombre).toBe("RODRIGO MIRANDA G.");
  });
});
