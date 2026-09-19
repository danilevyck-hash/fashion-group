/**
 * 🔴 EL CUADRE DEL ESTADO DE CUENTA SE LEE DESDE ADENTRO (18-sep-2026).
 *
 * Switch manda el saldo del cliente en `/apicliente/estadocuenta` ANIDADO
 * (PDF del API, p. 23, §5.15):
 *
 *   data: { estadocuenta: { elements: [...], Saldos: [...], saldoTotal: 0.00 } }
 *
 * 🩸 Del 9 al 18-sep-2026 el sync lo buscó un piso más arriba (`data.saldoTotal`,
 * `data.Saldos`) porque el tipo los había puesto como hermanos de
 * `estadocuenta`. Ahí no hay nada: `switch_estadocuenta_saldo` tenía **835
 * filas, 0 con `saldo_total`, 0 con `saldos`**, con `synced_at` de hace horas.
 * El aviso «esto no cuadra» no podía saltar nunca.
 *
 * 🔑 Proveedores tiene la MISMA forma y ahí sí se leía anidado: 65 de 65 con
 * su saldo. Este candado exige que clientes haga lo mismo.
 *
 * Lo que se protege:
 *  A. Se lee desde `estadocuenta`, NUNCA del nivel de afuera.
 *  B. Las DOS grafías del aging: `Saldos` y `saldos`.
 *  C. Sin el campo se guarda NULL, NUNCA un 0 inventado. Un `0.00` que sí
 *     viene es un cero de verdad.
 *  D. El sync arma la fila SOLO por `filaDeCuadre`, y el tipo declara el
 *     cuadre adentro de `estadocuenta`.
 *
 * Mutaciones: `scripts/_mutar-candados-cuadre-desde-adentro.sh`.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  cuadreDeSwitch,
  filaDeCuadre,
  totalDeSwitch,
} from "@/lib/switch-api/estadocuenta-cuadre";
import type { SwitchEstadoCuentaData } from "@/lib/switch-api/types";

const leer = (rel: string) =>
  fs.readFileSync(path.join(process.cwd(), "src", rel), "utf8");

/** La respuesta tal cual la imprime el PDF del API en la página 23. */
const RESPUESTA_DEL_PDF = {
  estadocuenta: {
    elements: [
      {
        ccteId: 868,
        numeroOrden: "133511",
        secuencial: "11-000000347",
        numeroFiscal: "00109999010000000347",
        plazoCredito: "90.0000",
        total: "100.9000",
        saldo: "50.9000",
        tipoComprobante: "Factura",
        abrev: "FA",
        tiporecibo: null,
        fechaCreacion: "15-04-2020",
        dias: 54,
        saldoConsecutivo: 50.9,
        debito: "50.9000",
        credito: 0,
      },
    ],
    Saldos: [
      { title: "0-30", saldo: 0 },
      { title: "31-60", saldo: 50.9 },
    ],
    saldoTotal: 50.9,
  },
  http_code: "200",
};

describe("A. 🔴 se lee desde `estadocuenta`, no del nivel de afuera", () => {
  it("la respuesta del PDF (p. 23) da su total y su aging", () => {
    const c = cuadreDeSwitch(RESPUESTA_DEL_PDF);
    expect(c.saldoTotal).toBe(50.9);
    expect(c.saldos).toEqual([
      { title: "0-30", saldo: 0 },
      { title: "31-60", saldo: 50.9 },
    ]);
  });

  it("🩸 el nivel de afuera NO cuenta: ahí es donde se buscaba y no había nada", () => {
    // Si alguien vuelve a leer `data.saldoTotal`, este caso le daría 999 en
    // vez del 50.9 que Switch de verdad manda adentro.
    const c = cuadreDeSwitch({
      saldoTotal: 999,
      Saldos: [{ title: "0-30", saldo: 999 }],
      estadocuenta: { elements: [], Saldos: [{ title: "0-30", saldo: 50.9 }], saldoTotal: 50.9 },
    });
    expect(c.saldoTotal).toBe(50.9);
    expect(c.saldos).toEqual([{ title: "0-30", saldo: 50.9 }]);
  });

  it("…y si SOLO viene afuera (la forma que el tipo inventó), se queda en NULL", () => {
    const c = cuadreDeSwitch({ saldoTotal: 999, Saldos: [], estadocuenta: { elements: [] } });
    expect(c.saldoTotal).toBeNull();
    expect(c.saldos).toBeNull();
  });
});

describe("B. 🔴 las DOS grafías del aging", () => {
  it("`Saldos` con mayúscula (así lo imprime el PDF para clientes)", () => {
    const c = cuadreDeSwitch({ estadocuenta: { elements: [], Saldos: [{ title: "0-30", saldo: 1 }], saldoTotal: 1 } });
    expect(c.saldos).toEqual([{ title: "0-30", saldo: 1 }]);
  });

  it("`saldos` con minúscula (así lo manda proveedores)", () => {
    const c = cuadreDeSwitch({ estadocuenta: { elements: [], saldos: [{ title: "0-30", saldo: 2 }], saldoTotal: 2 } });
    expect(c.saldos).toEqual([{ title: "0-30", saldo: 2 }]);
  });

  it("con las dos, manda la del PDF y la otra no se pierde en NULL", () => {
    const c = cuadreDeSwitch({
      estadocuenta: { elements: [], Saldos: [{ title: "0-30", saldo: 1 }], saldos: [{ title: "0-30", saldo: 2 }] },
    });
    expect(c.saldos).toEqual([{ title: "0-30", saldo: 1 }]);
  });
});

describe("C. 🔴 falla ABIERTO: sin el campo, NULL — nunca un cero inventado", () => {
  it("sin `saldoTotal` ni aging → las dos en NULL", () => {
    const c = cuadreDeSwitch({ estadocuenta: { elements: [] } });
    expect(c.saldoTotal).toBeNull();
    expect(c.saldos).toBeNull();
  });

  it("sin `estadocuenta`, o con basura, → NULL sin explotar", () => {
    for (const raro of [null, undefined, "html de error", 42, [], { estadocuenta: "x" }, { estadocuenta: null }]) {
      const c = cuadreDeSwitch(raro);
      expect(c.saldoTotal, JSON.stringify(raro)).toBeNull();
      expect(c.saldos, JSON.stringify(raro)).toBeNull();
    }
  });

  it("un total vacío, nulo o ilegible es NULL, no 0", () => {
    for (const bruto of ["", "   ", null, undefined, "abc", NaN, Infinity, {}, []]) {
      expect(totalDeSwitch(bruto), String(bruto)).toBeNull();
    }
  });

  it("🔑 un `0.00` que SÍ viene es un cero de verdad", () => {
    expect(totalDeSwitch("0.00")).toBe(0);
    expect(totalDeSwitch(0)).toBe(0);
    expect(cuadreDeSwitch({ estadocuenta: { elements: [], saldoTotal: "0.00" } }).saldoTotal).toBe(0);
  });

  it("acepta texto con coma de miles y número crudo", () => {
    expect(totalDeSwitch("130,699.36")).toBe(130699.36);
    expect(totalDeSwitch("50.9000")).toBe(50.9);
    expect(totalDeSwitch(130699.36)).toBe(130699.36);
  });

  it("un aging que no es una lista no se guarda como si lo fuera", () => {
    const c = cuadreDeSwitch({ estadocuenta: { elements: [], Saldos: "0-30: 1", saldoTotal: 1 } });
    expect(c.saldos).toBeNull();
    expect(c.saldoTotal).toBe(1);
  });
});

describe("D. la fila que va a `switch_estadocuenta_saldo`", () => {
  it("se arma entera desde la respuesta, con empresa, cliente y sello de corrida", () => {
    const fila = filaDeCuadre({
      empresaKey: "fashion_wear",
      clienteId: 25,
      clienteCodigo: "D-25",
      respuesta: RESPUESTA_DEL_PDF,
      runStamp: "2026-09-18T21:10:00.000Z",
      ahora: "2026-09-18T21:10:05.000Z",
    });
    expect(fila).toEqual({
      empresa_key: "fashion_wear",
      cliente_switch_id: 25,
      cliente_codigo: "D-25",
      saldo_total: 50.9,
      saldos: [
        { title: "0-30", saldo: 0 },
        { title: "31-60", saldo: 50.9 },
      ],
      synced_at: "2026-09-18T21:10:00.000Z",
      updated_at: "2026-09-18T21:10:05.000Z",
    });
  });

  it("sin cuadre en la respuesta la fila igual se escribe, con NULL en las dos", () => {
    const fila = filaDeCuadre({
      empresaKey: "vistana",
      clienteId: 7,
      clienteCodigo: undefined,
      respuesta: { estadocuenta: { elements: [] } },
      runStamp: "2026-09-18T21:10:00.000Z",
    });
    expect(fila.cliente_codigo).toBeNull();
    expect(fila.saldo_total).toBeNull();
    expect(fila.saldos).toBeNull();
  });

  it("🔴 el sync arma la fila SOLO por `filaDeCuadre` y le pasa la respuesta ENTERA", () => {
    const src = leer("lib/switch-api/sync-empresa.ts");
    expect(src).toContain('from "./estadocuenta-cuadre"');
    expect(src).toContain("filaDeCuadre({");
    expect(src).toContain("respuesta: ec,");
    expect(src).toContain("await guardarSaldosSwitch(empresaKey, saldosSwitch);");
    // Nada de leer el JSON a mano en el sync: ahí nació el error.
    expect(src).not.toMatch(/ec\?\.\s*saldoTotal/);
    expect(src).not.toMatch(/ec\?\.\s*Saldos/);
    expect(src).not.toMatch(/saldo_total:\s*[^,]*\?\?/);
  });

  it("🔴 el tipo declara el cuadre ADENTRO de `estadocuenta` (ahí nació el error)", () => {
    const src = leer("lib/switch-api/types.ts");
    const desde = src.indexOf("export interface SwitchEstadoCuentaData {");
    expect(desde).toBeGreaterThan(-1);
    const bloque = src.slice(desde, src.indexOf("\n}\n", desde));
    // Adentro de `estadocuenta: {` (indentación de 4) y no como hermano (de 2).
    expect(bloque).toMatch(/\n    saldoTotal\?:/);
    expect(bloque).toMatch(/\n    Saldos\?:/);
    expect(bloque).toMatch(/\n    saldos\?:/);
    expect(bloque).not.toMatch(/\n  saldoTotal\?:/);
    expect(bloque).not.toMatch(/\n  Saldos\?:/);
    // Y compila con la forma del PDF: si el tipo vuelve a subirlos, esto no compila.
    const tipada: SwitchEstadoCuentaData = {
      estadocuenta: { elements: [], Saldos: [{ title: "0-30", saldo: 0 }], saldoTotal: "0.00" },
    };
    expect(tipada.estadocuenta.saldoTotal).toBe("0.00");
  });

  it("el módulo es PURO: sin red, sin base, sin reloj adentro de la regla", () => {
    const src = leer("lib/switch-api/estadocuenta-cuadre.ts");
    expect(src).not.toContain("supabase");
    expect(src).not.toContain("fetch(");
    expect(src).not.toContain("createSwitchClient");
  });
});
