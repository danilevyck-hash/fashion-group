// ─────────────────────────────────────────────────────────────────────────────
// CANDADO de "quién compra una descripción".
//
// Lo que esto existe para cazar, en orden de daño:
//
//  1. 🩸 QUE LA NOTA DE CRÉDITO SUME EN VEZ DE RESTAR. Es el bug que este repo
//     ya pagó dos veces y su firma es inconfundible: la diferencia da EXACTO el
//     doble de las NC. Acá duele especialmente porque la lista es un RANKING —
//     medido en producción, City Mall David devolvió el 58% de lo que se le
//     facturó a $30, así que en bruto sale muy por encima de donde va.
//  2. Que dos grafías del mismo cliente partan su fila en dos.
//  3. Que el % se calcule contra una base que no es la suma de la lista (y los
//     porcentajes dejen de sumar 100 sin que nadie lo note).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  agruparPorCliente,
  totalDeClientes,
  participacion,
  fmtParticipacion,
  CLIENTE_SIN_NOMBRE,
  enLotes,
  bordePanama,
  diaSiguiente,
  CODIGOS_POR_LOTE,
  type LineaParaCliente,
} from "@/lib/ventas/productos-clientes";

function fa(id: number, nombre: string, cantidad: number, venta: number): LineaParaCliente {
  return {
    tipo_comprobante: "Factura",
    cliente_switch_id: id,
    cliente_nombre: nombre,
    cantidad,
    subtotal_con_descuento: venta,
  };
}
/** 🔴 Magnitudes en POSITIVO, como están en la base. El signo lo pone la lectura. */
function nc(id: number, nombre: string, cantidad: number, venta: number): LineaParaCliente {
  return {
    tipo_comprobante: "Nota de Crédito",
    cliente_switch_id: id,
    cliente_nombre: nombre,
    cantidad,
    subtotal_con_descuento: venta,
  };
}

describe("🔴 la nota de crédito RESTA", () => {
  it("una NC baja las unidades y la venta del cliente", () => {
    const r = agruparPorCliente([fa(1, "City Mall", 100, 3000), nc(1, "City Mall", 40, 1200)]);
    expect(r).toHaveLength(1);
    expect(r[0].cantidad).toBe(60);
    expect(r[0].venta).toBe(1800);
  });

  it("🩸 la firma del error: sumar sin firmar da EXACTO el doble de las NC", () => {
    const lineas = [fa(1, "City Mall", 100, 3000), nc(1, "City Mall", 40, 1200)];
    const bien = agruparPorCliente(lineas)[0].venta;
    const bruto = lineas.reduce((s, l) => s + Number(l.subtotal_con_descuento), 0);
    expect(bruto - bien).toBe(2 * 1200);
  });

  it("el caso REAL medido: quien devuelve el 58% no puede encabezar el ranking", () => {
    // City Mall David: se le facturó a $30 y devolvió el 58%. En bruto sale
    // primero; en neto es el tercero de tres.
    const r = agruparPorCliente([
      fa(7, "City Mall David", 1000, 30000),
      nc(7, "City Mall David", 580, 17400),
      fa(8, "Golden Mall", 500, 15000),
      fa(9, "Jerusalem", 460, 13800),
    ]);
    expect(r.map(c => c.cliente_nombre)).toEqual(["Golden Mall", "Jerusalem", "City Mall David"]);
    expect(r[2].venta).toBe(12600);
  });

  it("una NC sola deja al cliente en negativo, y se ve", () => {
    const r = agruparPorCliente([nc(3, "Bouti", 2, 40)]);
    expect(r[0].cantidad).toBe(-2);
    expect(r[0].venta).toBe(-40);
  });

  it("⚠️ 'Nota de Credito' SIN TILDE no es una NC (así está escrito en la base)", () => {
    // Si alguien re-escribe la comparación sin tilde, el signo deja de
    // aplicarse y el total queda mal EN SILENCIO. Acá queda dicho.
    const r = agruparPorCliente([
      { ...nc(1, "X", 5, 100), tipo_comprobante: "Nota de Credito" },
    ]);
    expect(r[0].venta).toBe(100); // suma: no la reconoce como NC
  });
});

describe("la llave es el id del cliente, no su nombre", () => {
  it("dos grafías del mismo id son UNA sola fila", () => {
    const r = agruparPorCliente([fa(1, "City Mall", 10, 300), fa(1, "CITY MALL S.A.", 5, 150)]);
    expect(r).toHaveLength(1);
    expect(r[0].venta).toBe(450);
  });

  it("dos ids distintos con el mismo nombre NO se juntan", () => {
    const r = agruparPorCliente([fa(1, "Sucursal", 10, 300), fa(2, "Sucursal", 5, 150)]);
    expect(r).toHaveLength(2);
  });

  it("sin cliente se agrupa aparte y no se le inventa un nombre", () => {
    const r = agruparPorCliente([
      { tipo_comprobante: "Factura", cliente_switch_id: null, cliente_nombre: null, cantidad: 3, subtotal_con_descuento: 90 },
    ]);
    expect(r[0].cliente_switch_id).toBeNull();
    expect(r[0].cliente_nombre).toBe(CLIENTE_SIN_NOMBRE);
  });
});

describe("el orden y los ceros", () => {
  it("del que más compra al que menos", () => {
    const r = agruparPorCliente([fa(1, "A", 1, 100), fa(2, "B", 1, 900), fa(3, "C", 1, 500)]);
    expect(r.map(c => c.cliente_nombre)).toEqual(["B", "C", "A"]);
  });

  it("compró 10 y devolvió 10 → no dice nada, se saca", () => {
    const r = agruparPorCliente([fa(1, "A", 10, 300), nc(1, "A", 10, 300), fa(2, "B", 1, 50)]);
    expect(r.map(c => c.cliente_nombre)).toEqual(["B"]);
  });

  it("pero cero en UNA sola de las dos sí dice algo y se queda", () => {
    const r = agruparPorCliente([fa(1, "A", 10, 300), nc(1, "A", 10, 340)]);
    expect(r).toHaveLength(1);
    expect(r[0].cantidad).toBe(0);
    expect(r[0].venta).toBe(-40);
  });

  it("los números que llegan como texto de PostgREST no vuelven NaN la suma", () => {
    const r = agruparPorCliente([
      { tipo_comprobante: "Factura", cliente_switch_id: 1, cliente_nombre: "A", cantidad: "24.0000", subtotal_con_descuento: "78,270.0000" },
    ]);
    expect(r[0].cantidad).toBe(24);
    expect(r[0].venta).toBe(78270);
  });
});

describe("la participación se mide contra la SUMA DE LA LISTA", () => {
  const clientes = agruparPorCliente([fa(1, "A", 1, 750), fa(2, "B", 1, 250)]);

  it("los porcentajes suman 100", () => {
    const t = totalDeClientes(clientes);
    const suma = clientes.reduce((s, c) => s + (participacion(c.venta, t.venta) ?? 0), 0);
    expect(suma).toBeCloseTo(1, 10);
    expect(fmtParticipacion(participacion(clientes[0].venta, t.venta))).toBe("75.0%");
  });

  it("el total es la suma neta, no la bruta", () => {
    const t = totalDeClientes(agruparPorCliente([fa(1, "A", 10, 300), nc(1, "A", 4, 120)]));
    expect(t).toEqual({ cantidad: 6, venta: 180 });
  });

  it("base no positiva → sin porcentaje (un 0% sería mentira)", () => {
    expect(participacion(100, 0)).toBeNull();
    expect(participacion(-50, -200)).toBeNull();
    expect(fmtParticipacion(null)).toBe("—");
  });
});

describe("la lectura no se puede truncar ni correr el día", () => {
  it("los lotes de códigos caben en una URL (el peor caso medido son 842)", () => {
    const codigos = Array.from({ length: 842 }, (_, i) => `COD-${i}`);
    const lotes = enLotes(codigos, CODIGOS_POR_LOTE);
    expect(lotes).toHaveLength(6);
    expect(lotes.flat()).toEqual(codigos);
    for (const l of lotes) expect(l.length).toBeLessThanOrEqual(CODIGOS_POR_LOTE);
  });

  it("enLotes no pierde ni repite con listas que no son múltiplo", () => {
    expect(enLotes([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(enLotes([], 3)).toEqual([]);
  });

  it("el borde del día es el de PANAMÁ (UTC−5), no el UTC pelado", () => {
    expect(bordePanama("2026-08-24")).toBe("2026-08-24T00:00:00-05:00");
  });

  it("el día siguiente cruza fin de mes y fin de año", () => {
    expect(diaSiguiente("2026-08-24")).toBe("2026-08-25");
    expect(diaSiguiente("2026-08-31")).toBe("2026-09-01");
    expect(diaSiguiente("2026-12-31")).toBe("2027-01-01");
    expect(diaSiguiente("2024-02-28")).toBe("2024-02-29"); // bisiesto
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 UNA SOLA DEFINICIÓN DEL SIGNO
//
// El barrido BORRA LOS COMENTARIOS PRIMERO: este archivo nombra
// 'Nota de Crédito' en su propio encabezado y en un test, así que leerlo crudo
// se cumpliría (o se rompería) con su propia explicación.
// ─────────────────────────────────────────────────────────────────────────────

function sinComentarios(fuente: string): string {
  return fuente
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/([^\n:"'`])\/\/[^\n]*$/gm, "$1");
}

describe("🔴 el signo no se define dos veces", () => {
  const mod = () =>
    sinComentarios(
      readFileSync(join(__dirname, "..", "..", "lib", "ventas", "productos-clientes.ts"), "utf8"),
    );

  it("importa signoDeTipo del módulo puro, no escribe el suyo", () => {
    expect(mod()).toContain("signoDeTipo");
    expect(mod()).toContain("factura-lineas-parse");
  });

  it("y NO compara contra el texto del tipo por su cuenta", () => {
    // Una comparación propia contra 'Nota de Crédito' acá sería la segunda
    // definición: la que se olvida de actualizar cuando la primera cambia.
    expect(mod()).not.toMatch(/Nota de Cr/);
  });
});
