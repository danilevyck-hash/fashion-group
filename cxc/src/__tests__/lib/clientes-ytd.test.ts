// Candado de "compras del año" — la definición que comparten la ficha del
// cliente y la columna nueva del listado.
//
// Lo que este archivo protege NO es la aritmética (sumar es fácil): es que el
// listado y la ficha no puedan decir dos números distintos para el mismo
// cliente, y que el año siga cortándose en hora de Panamá.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  ymdPanama,
  anioEnCursoPanama,
  ventanaAnioPanama,
  montoFirmado,
  aCentavos,
  TIPOS_QUE_SUMAN,
} from "@/lib/clientes-ytd";

describe("el año se corta en hora de PANAMÁ, no en UTC", () => {
  // Es el bug que esta casa ya pagó dos veces (Proveedores y el YTD que se
  // cortaba en hora de Londres). Panamá es UTC−5 fijo, sin horario de verano.

  it("el 31-dic 19:00 de Panamá todavía es del año viejo (aunque en UTC ya sea enero)", () => {
    const instante = new Date("2027-01-01T00:00:00.000Z"); // = 31-dic-2026 19:00 Panamá
    expect(ymdPanama(instante.toISOString())).toBe("2026-12-31");
    expect(anioEnCursoPanama(instante)).toBe(2026);
  });

  it("el 31-dic 23:59 de Panamá sigue siendo del año viejo", () => {
    const instante = new Date("2027-01-01T04:59:59.000Z");
    expect(anioEnCursoPanama(instante)).toBe(2026);
  });

  it("recién a las 00:00 del 1-ene de Panamá cambia el año", () => {
    expect(anioEnCursoPanama(new Date("2027-01-01T05:00:00.000Z"))).toBe(2027);
  });

  it("la ventana es semiabierta y arranca a las 05:00 UTC del 1-ene", () => {
    const v = ventanaAnioPanama(new Date("2026-07-27T12:00:00.000Z"));
    expect(v).toEqual({
      anio: 2026,
      desde: "2026-01-01T05:00:00.000Z",
      hasta: "2027-01-01T05:00:00.000Z",
    });
  });

  it("una factura del 31-dic 19:00 de Panamá cae DENTRO del año que le toca", () => {
    const v = ventanaAnioPanama(new Date("2026-12-31T23:00:00.000Z"));
    const factura = "2027-01-01T00:30:00.000Z"; // 31-dic-2026 19:30 Panamá
    expect(factura >= v.desde && factura < v.hasta).toBe(true);
  });

  it("una factura del 1-ene 00:30 de Panamá NO cuenta para el año anterior", () => {
    const v = ventanaAnioPanama(new Date("2026-06-01T12:00:00.000Z")); // año 2026
    const factura = "2027-01-01T05:30:00.000Z"; // 1-ene-2027 00:30 Panamá
    expect(factura < v.hasta).toBe(false);
  });
});

describe("signo por tipo de comprobante", () => {
  it("Factura, Tiquete, Transacción y Nota de Débito SUMAN", () => {
    for (const tipo of TIPOS_QUE_SUMAN) {
      expect(montoFirmado(tipo, 100)).toBe(100);
    }
  });

  it("Nota de Crédito RESTA — es lo que hace que las compras sean netas", () => {
    expect(montoFirmado("Nota de Crédito", 100)).toBe(-100);
  });

  it("un tipo desconocido vale 0, no se cuela como venta", () => {
    expect(montoFirmado("Cotización", 100)).toBe(0);
    expect(montoFirmado(null, 100)).toBe(0);
    expect(montoFirmado(undefined, 100)).toBe(0);
  });

  it("acepta el numeric como string, que es como lo manda PostgREST", () => {
    expect(montoFirmado("Factura", "1234.56")).toBe(1234.56);
    expect(montoFirmado("Nota de Crédito", "10.5")).toBe(-10.5);
  });

  it("un monto ilegible vale 0 en vez de contaminar la suma con NaN", () => {
    expect(montoFirmado("Factura", "no es un número")).toBe(0);
    expect(montoFirmado("Factura", null)).toBe(0);
  });

  it("reproduce el número de D-108 medido en producción", () => {
    // Muestra reducida con la misma forma que la real: facturas menos NCs.
    const docs = [
      { tipo: "Factura", monto: 200_000 },
      { tipo: "Nota de Débito", monto: 12_000 },
      { tipo: "Nota de Crédito", monto: 1_297.5 },
      { tipo: "Cotización", monto: 999_999 }, // no cuenta
    ];
    const suma = docs.reduce((s, d) => s + montoFirmado(d.tipo, d.monto), 0);
    expect(aCentavos(suma)).toBe(210_702.5);
  });
});

describe("redondeo a centavos", () => {
  it("no deja colas binarias llegar a la pantalla", () => {
    // 44307.630000000005 fue un valor REAL de la suma de vistana para D-108.
    expect(aCentavos(44_307.630000000005)).toBe(44_307.63);
    expect(aCentavos(0.1 + 0.2)).toBe(0.3);
  });
});

describe("UNA sola definición: la ficha no reimplementa el cálculo", () => {
  const raiz = path.join(__dirname, "..", "..");
  const ficha = fs.readFileSync(path.join(raiz, "app/api/clientes/[codigo]/route.ts"), "utf8");
  const ytdEndpoint = fs.readFileSync(path.join(raiz, "app/api/clientes/ytd/route.ts"), "utf8");

  it("la ficha importa el módulo compartido", () => {
    expect(ficha).toMatch(/from "@\/lib\/clientes-ytd"/);
  });

  it("el endpoint del listado importa el MISMO módulo", () => {
    expect(ytdEndpoint).toMatch(/from "@\/lib\/clientes-ytd"/);
  });

  it("la ficha ya no lleva su propia lista de tipos ni su propio offset de Panamá", () => {
    // Estas dos líneas eran la copia local que podía divergir del listado.
    expect(ficha).not.toContain('const POS = new Set(');
    expect(ficha).not.toContain("5 * 3600 * 1000");
  });

  it("la ficha ya no saca el año del reloj del servidor", () => {
    // Era `new Date(new Date().getFullYear(), 0, 1)`: en un servidor UTC eso
    // adelanta el cambio de año 5 horas respecto de Panamá.
    expect(ficha).not.toContain("new Date(new Date().getFullYear()");
    expect(ficha).toContain("ventanaAnioPanama()");
  });
});
