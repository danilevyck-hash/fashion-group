/**
 * 🔴 QUÉ LE FALTA A LA GUÍA PARA PODER GUARDARSE.
 *
 * El botón "Guardar Guía" aparecía apagado y **no decía por qué**. La pantalla
 * de despachar ya hacía lo correcto —apagado y, justo debajo, *"Falta: placa,
 * recibido por y cédula"*— y esto copia ese patrón.
 *
 * 🔑 LO QUE ESTE ARCHIVO PROTEGE DE VERDAD: que la lista de faltantes salga de
 * `validarGuia`, la MISMA función que rechaza el guardado. Con dos listas, el
 * día que una cambiara el botón se pondría negro y el guardado rechazaría igual
 * — que es peor que el botón apagado, porque miente.
 */
import { describe, it, expect } from "vitest";
import { faltaParaGuardar, validarGuia, type EstadoGuia } from "@/app/guias/components/guia-form-logic";
import { textoFalta, unirEnHumano } from "@/lib/guias/falta-para-despachar";
import type { GuiaItem } from "@/app/guias/components/types";

function envio(p: Partial<GuiaItem> = {}): GuiaItem {
  return {
    uid: p.uid ?? `u${Math.random().toString(36).slice(2, 8)}`,
    orden: p.orden ?? 1,
    cliente: p.cliente ?? "City Mall Paso Canoa",
    cliente_codigo: p.cliente_codigo ?? "D-24",
    direccion: p.direccion ?? "Paso Canoas",
    empresa: p.empresa ?? "Fashion Wear",
    facturas: p.facturas ?? "10234",
    bultos: p.bultos ?? 4,
    numero_guia_transp: p.numero_guia_transp ?? "",
  };
}

function estado(p: Partial<EstadoGuia> = {}): EstadoGuia {
  return {
    fecha: p.fecha ?? "2026-08-23",
    modoEntrega: p.modoEntrega ?? "transportista",
    // 🩸 `??` no sirve acá: `null` es un VALOR a propósito (sin transportista).
    transportistaId: p.transportistaId === undefined ? "t-1" : p.transportistaId,
    entregadoPor: p.entregadoPor ?? "Julio",
    items: p.items ?? [envio()],
  };
}

describe("una guía completa no le falta nada", () => {
  it("lista vacía = se puede guardar", () => {
    expect(faltaParaGuardar(estado())).toEqual([]);
    expect(textoFalta(faltaParaGuardar(estado()))).toBe("");
  });

  it("en entrega directa el transportista no hace falta", () => {
    expect(faltaParaGuardar(estado({ modoEntrega: "entrega_directa", transportistaId: null }))).toEqual([]);
  });
});

describe("la cabecera", () => {
  it("sin fecha", () => {
    expect(faltaParaGuardar(estado({ fecha: "" }))).toEqual(["la fecha"]);
  });
  it("sin transportista, estando en modo transportista", () => {
    expect(faltaParaGuardar(estado({ transportistaId: null }))).toEqual(["el transportista"]);
  });
  it("sin quién despacha", () => {
    expect(faltaParaGuardar(estado({ entregadoPor: "" }))).toEqual(["quién despacha"]);
  });
  it("se dicen TODOS juntos, en el orden en que se leen", () => {
    const falta = faltaParaGuardar(estado({ fecha: "", transportistaId: null, entregadoPor: "" }));
    expect(falta).toEqual(["la fecha", "el transportista", "quién despacha"]);
    expect(textoFalta(falta)).toBe("Falta: la fecha, el transportista y quién despacha");
  });
});

describe("los envíos", () => {
  it("sin ningún envío con datos, se pide un envío y NADA MÁS", () => {
    // Pedir "el cliente, la dirección, la empresa…" de una fila en blanco sería
    // gritarle cinco cosas a quien todavía no escribió ninguna.
    const falta = faltaParaGuardar(estado({ items: [envio({ cliente: "", direccion: "", empresa: "", facturas: "", bultos: 0 })] }));
    expect(falta).toEqual(["por lo menos un envío"]);
  });

  it("con UN solo envío no se lo numera", () => {
    const falta = faltaParaGuardar(estado({ items: [envio({ facturas: "", bultos: 0 })] }));
    expect(falta).toEqual(["la factura y los bultos"]);
  });

  it("con varios envíos se dice CUÁL, por la posición que se ve en pantalla", () => {
    const falta = faltaParaGuardar(estado({ items: [envio(), envio({ orden: 2, direccion: "" })] }));
    expect(falta).toEqual(["la dirección del envío 2"]);
  });

  it("una fila vacía en el medio no corre la numeración", () => {
    // El formulario numera las filas por su índice: si acá se contara solo
    // entre las que tienen datos, se mandaría a mirar el envío equivocado.
    const items = [envio(), envio({ orden: 2, cliente: "", direccion: "", empresa: "", facturas: "", bultos: 0 }), envio({ orden: 3, bultos: 0 })];
    expect(faltaParaGuardar(estado({ items }))).toEqual(["los bultos del envío 3"]);
  });

  it("con DOS envíos rotos se agrupan, no se repite el mismo renglón", () => {
    const items = [envio({ cliente: "" }), envio({ orden: 2, bultos: 0 })];
    const falta = faltaParaGuardar(estado({ items }));
    expect(falta).toEqual(["los datos de los envíos 1 y 2"]);
    expect(textoFalta(falta)).toBe("Falta: los datos de los envíos 1 y 2");
  });

  it("una factura mal escrita también frena, y se dice", () => {
    const falta = faltaParaGuardar(estado({ items: [envio({ facturas: "10234;10235" })] }));
    expect(falta).toEqual(["la factura bien escrita"]);
  });
});

describe("🔴 la lista NO es una segunda lista de reglas", () => {
  it("todo lo que `validarGuia` rechaza produce al menos un faltante", () => {
    const casos: EstadoGuia[] = [
      estado({ fecha: "" }),
      estado({ transportistaId: null }),
      estado({ entregadoPor: "" }),
      estado({ items: [envio({ cliente: "" })] }),
      estado({ items: [envio({ direccion: "" })] }),
      estado({ items: [envio({ empresa: "" })] }),
      estado({ items: [envio({ facturas: "" })] }),
      estado({ items: [envio({ bultos: 0 })] }),
      estado({ items: [envio({ facturas: "10234;10235" })] }),
      estado({ items: [envio({ facturas: "12" })] }),
      estado({ items: [envio({ cliente: "", direccion: "", empresa: "", facturas: "", bultos: 0 })] }),
    ];
    for (const c of casos) {
      expect(validarGuia(c).size).toBeGreaterThan(0);
      expect(faltaParaGuardar(c).length).toBeGreaterThan(0);
    }
  });

  it("y todo lo que `validarGuia` acepta no produce ninguno", () => {
    const casos: EstadoGuia[] = [
      estado(),
      estado({ modoEntrega: "entrega_directa", transportistaId: null }),
      estado({ items: [envio(), envio({ orden: 2, cliente: "Jerusalem", facturas: "10234, 10235" })] }),
    ];
    for (const c of casos) {
      expect(validarGuia(c).size).toBe(0);
      expect(faltaParaGuardar(c)).toEqual([]);
    }
  });
});

describe("el unidor es UNO SOLO para los dos botones", () => {
  it("«y» antes del último, como se habla", () => {
    expect(unirEnHumano([])).toBe("");
    expect(unirEnHumano(["placa"])).toBe("placa");
    expect(unirEnHumano(["placa", "cédula"])).toBe("placa y cédula");
    expect(unirEnHumano(["a", "b", "c"])).toBe("a, b y c");
  });
  it("y `textoFalta` sigue diciendo exactamente lo que decía al despachar", () => {
    expect(textoFalta(["placa", "recibido por", "cédula"])).toBe("Falta: placa, recibido por y cédula");
  });
});
