// ─────────────────────────────────────────────────────────────────────────────
// CANDADOS del módulo puro «qué me compra un cliente» (el inverso del #591).
//
// Lo que este archivo existe para cazar, y ninguna de las cinco cosas se ve
// mirando si compila:
//
//  1. 🔴 LA NOTA DE CRÉDITO RESTA. Su firma cuando alguien la suma es
//     inconfundible: la diferencia da EXACTO el doble de las NC.
//  2. 🔴 EL CRUCE ES POR CÓDIGO, no por el texto de la línea. Si alguien lo
//     cambia por el texto, las descripciones se parten en dos y nadie lo ve.
//  3. 🔴 «DEJÓ DE COMPRAR» DISTINGUE las dos cosas que no son lo mismo: que el
//     cliente lo dejara (hay a quién llamar) o que la empresa ya no lo venda
//     (no hay nada que reclamar).
//  4. La llave del cliente es el ID, no el nombre.
//  5. No hay margen por cliente ni puede haberlo: acá no entra ningún costo.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  armarMatriz,
  claveCliente,
  clientesDelPeriodo,
  comprasDe,
  dejoDeComprar,
  mapaCodigoDescripcion,
  totalDeCompras,
  type LineaConCodigo,
} from "@/lib/ventas/productos-por-cliente";

const DIARIO = [
  { codigo: "A-1", descripcion: "Men-Boxer Brief", fecha: "2026-03-01" },
  { codigo: "A-2", descripcion: "Men-Boxer Brief", fecha: "2026-03-02" },
  { codigo: "B-1", descripcion: "Women-Panties", fecha: "2026-03-01" },
];
const MAPA = mapaCodigoDescripcion(DIARIO);

function linea(over: Partial<LineaConCodigo>): LineaConCodigo {
  return {
    tipo_comprobante: "Factura",
    cliente_switch_id: 12,
    cliente_nombre: "City Mall Paso Canoa",
    codigo: "A-1",
    cantidad: 10,
    subtotal_con_descuento: 300,
    ...over,
  };
}

describe("🔴 la nota de crédito RESTA", () => {
  it("una NC baja piezas y venta del mismo cliente", () => {
    const { filas } = armarMatriz(
      [linea({}), linea({ tipo_comprobante: "Nota de Crédito", cantidad: 2, subtotal_con_descuento: 60 })],
      MAPA,
    );
    expect(filas).toHaveLength(1);
    expect(filas[0].cantidad).toBe(8);
    expect(filas[0].venta).toBe(240);
  });

  it("🩸 la firma del error: sumando sin firmar da EXACTO el doble de las NC", () => {
    const nc = 60;
    const { filas } = armarMatriz(
      [linea({}), linea({ tipo_comprobante: "Nota de Crédito", cantidad: 2, subtotal_con_descuento: nc })],
      MAPA,
    );
    const bruto = 300 + nc;
    expect(bruto - filas[0].venta).toBe(2 * nc);
  });

  it("un cliente que quedó en cero de las DOS se cae; en cero de una sola, no", () => {
    const enCero = armarMatriz(
      [
        linea({ cliente_switch_id: 5, cantidad: 10, subtotal_con_descuento: 100 }),
        linea({ cliente_switch_id: 5, tipo_comprobante: "Nota de Crédito", cantidad: 10, subtotal_con_descuento: 100 }),
      ],
      MAPA,
    );
    expect(enCero.filas).toHaveLength(0);

    const soloNC = armarMatriz(
      [linea({ cliente_switch_id: 5, tipo_comprobante: "Nota de Crédito", cantidad: 0, subtotal_con_descuento: 40 })],
      MAPA,
    );
    expect(soloNC.filas).toHaveLength(1);
    expect(soloNC.filas[0].venta).toBe(-40);
  });
});

describe("🔴 el cruce es por CÓDIGO, no por el texto de la línea", () => {
  it("dos códigos de la MISMA descripción caen en UNA fila", () => {
    const { filas } = armarMatriz([linea({ codigo: "A-1" }), linea({ codigo: "A-2" })], MAPA);
    expect(filas).toHaveLength(1);
    expect(filas[0].descripcion).toBe("Men-Boxer Brief");
    expect(filas[0].venta).toBe(600);
  });

  it("⛔ el texto de la LÍNEA no manda: manda el de switch_articulo_diario", () => {
    // Las dos tablas nombran distinto al mismo producto. Si alguien cruzara por
    // el texto de la línea, esta fila se llamaría "Men Boxer Brief" (sin guión)
    // y no caería sobre ninguna fila de la tabla de arriba.
    const { filas } = armarMatriz(
      [{ ...linea({}), descripcion: "Men Boxer Brief" } as LineaConCodigo & { descripcion: string }],
      MAPA,
    );
    expect(filas[0].descripcion).toBe("Men-Boxer Brief");
  });

  it("un código que no está en el diario NO se inventa: se cuenta aparte", () => {
    const { filas, sinDescripcion } = armarMatriz([linea({ codigo: "ZZZ-9" }), linea({})], MAPA);
    expect(sinDescripcion).toBe(1);
    expect(filas).toHaveLength(1);
  });

  it("🩸 con DOS grafías del mismo código gana la MÁS RECIENTE (una regla, no un empate)", () => {
    const mapa = mapaCodigoDescripcion([
      { codigo: "C-1", descripcion: "Women-Small Leather", fecha: "2026-01-05" },
      { codigo: "C-1", descripcion: "Women-Small Leather Goods", fecha: "2026-06-20" },
    ]);
    expect(mapa.get("C-1")).toBe("Women-Small Leather Goods");
  });
});

describe("🔑 la llave del cliente es el ID, no el nombre", () => {
  it("el mismo id con el nombre editado en Switch sigue siendo UNA fila", () => {
    const { filas } = armarMatriz(
      [linea({ cliente_nombre: "City Mall Paso Canoa" }), linea({ cliente_nombre: "CITY MALL PASO CANOA, S.A." })],
      MAPA,
    );
    expect(filas).toHaveLength(1);
    expect(filas[0].venta).toBe(600);
  });

  it("dos ids distintos con el MISMO nombre no se funden", () => {
    const { filas } = armarMatriz(
      [linea({ cliente_switch_id: 1 }), linea({ cliente_switch_id: 2 })],
      MAPA,
    );
    expect(filas).toHaveLength(2);
  });
});

describe("el desplegable sale de la matriz que YA viajó", () => {
  const { filas } = armarMatriz(
    [
      linea({ cliente_switch_id: 1, cliente_nombre: "Chico", subtotal_con_descuento: 100 }),
      linea({ cliente_switch_id: 2, cliente_nombre: "Grande", subtotal_con_descuento: 900 }),
      linea({ cliente_switch_id: 2, cliente_nombre: "Grande", codigo: "B-1", subtotal_con_descuento: 500 }),
    ],
    MAPA,
  );

  it("del que más compra al que menos (no alfabético)", () => {
    expect(clientesDelPeriodo(filas).map(c => c.nombre)).toEqual(["Grande", "Chico"]);
  });

  it("suma TODAS las descripciones de cada cliente", () => {
    expect(clientesDelPeriodo(filas)[0].venta).toBe(1400);
  });

  it("`comprasDe` devuelve sólo las de ESE cliente", () => {
    const c = comprasDe(filas, 2);
    expect([...c.keys()].sort()).toEqual(["Men-Boxer Brief", "Women-Panties"]);
    expect(totalDeCompras(c)).toEqual({ cantidad: 20, venta: 1400 });
    expect(comprasDe(filas, 1).size).toBe(1);
  });

  it("una línea sin cliente no se mezcla con otro: tiene su propia clave", () => {
    expect(claveCliente(null)).toBe("sin-cliente");
    expect(claveCliente(12)).toBe("12");
  });
});

describe("🔴 «Dejó de comprar» distingue las dos cosas que NO son lo mismo", () => {
  // 🔑 EL ORDEN ALFABÉTICO Y EL ORDEN POR PLATA SON DISTINTOS A PROPÓSITO: si
  // coincidieran, un `sort` por nombre pasaría este test sin haber ordenado por
  // plata (y la mutación que lo prueba SOBREVIVIRÍA).
  const antes = new Map([
    ["Boys-T-Shirts S/S", { cantidad: 66, venta: 954 }],
    ["Girls-Flip Flops", { cantidad: 875, venta: 6249.5 }],
    ["Men-Boxer Brief", { cantidad: 100, venta: 2000 }],
    ["Devuelto entero", { cantidad: -5, venta: -120 }],
  ]);
  const hoy = new Map([["Men-Boxer Brief", { cantidad: 120, venta: 2500 }]]);
  const seVendeHoy = new Set(["Men-Boxer Brief", "Boys-T-Shirts S/S"]);

  it("lo que sigue comprando NO aparece", () => {
    expect(dejoDeComprar(hoy, antes, seVendeHoy).map(d => d.descripcion)).not.toContain("Men-Boxer Brief");
  });

  it("ordena por CUÁNTA PLATA ERA, de mayor a menor", () => {
    expect(dejoDeComprar(hoy, antes, seVendeHoy).map(d => d.descripcion)).toEqual([
      "Girls-Flip Flops",
      "Boys-T-Shirts S/S",
    ]);
  });

  it("🔴 marca cuál se sigue vendiendo y cuál ya no — sin eso la lista manda a llamar por algo que no existe", () => {
    const r = dejoDeComprar(hoy, antes, seVendeHoy);
    expect(r.find(d => d.descripcion === "Boys-T-Shirts S/S")!.seSigueVendiendo).toBe(true);
    expect(r.find(d => d.descripcion === "Girls-Flip Flops")!.seSigueVendiendo).toBe(false);
  });

  it("una devolución neta del período anterior NO es algo que se dejó de comprar", () => {
    expect(dejoDeComprar(hoy, antes, seVendeHoy).map(d => d.descripcion)).not.toContain("Devuelto entero");
  });

  it("una descripción que HOY quedó en devolución neta SÍ cuenta como dejada", () => {
    const conDevolucion = new Map([["Boys-T-Shirts S/S", { cantidad: -2, venta: -50 }]]);
    expect(dejoDeComprar(conDevolucion, antes, seVendeHoy).map(d => d.descripcion))
      .toContain("Boys-T-Shirts S/S");
  });
});

describe("⚠️ acá NO hay margen por cliente, y no puede haberlo", () => {
  it("la fila de la matriz sólo tiene piezas y venta", () => {
    const { filas } = armarMatriz([linea({})], MAPA);
    expect(Object.keys(filas[0]).sort()).toEqual(
      ["cantidad", "cliente_nombre", "cliente_switch_id", "descripcion", "venta"],
    );
  });
});
