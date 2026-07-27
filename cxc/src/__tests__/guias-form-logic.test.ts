/**
 * Candados del formulario de guía. Hasta jul-2026 su cobertura era CERO: toda la
 * validación vivía adentro del hook y no había forma de probarla sin montar el
 * árbol entero. Ahora las reglas son funciones puras (`guia-form-logic.ts`).
 *
 * Los tres bugs que estos tests congelan se veían así en producción:
 *
 *  1. El rojo se quedaba pegado a la fila EQUIVOCADA. Las marcas iban por
 *     posición (`item-2-cliente`), así que borrar una fila corría los índices y
 *     el error apuntaba a otra línea.
 *  2. "Deshacer" perdía el vínculo del cliente en silencio: restauraba 5 campos
 *     a mano y `cliente_codigo` no estaba en la lista. El nombre volvía, el
 *     código no, y la guía quedaba "sin vincular" sin que nadie lo notara.
 *  3. Una guía vieja con empresa sucia tenía que poder abrirse y guardarse
 *     igual, aunque el selector ahora sea cerrado.
 */
import { describe, it, expect } from "vitest";
import {
  EMPRESAS_CANONICAS,
  claveCampo,
  esEmpresaCanonica,
  filaTieneDatos,
  nuevoUid,
  opcionesEmpresa,
  quitarFila,
  restaurarFila,
  validarGuia,
  vinculoCliente,
  type EstadoGuia,
} from "@/app/guias/components/guia-form-logic";
import { emptyItem } from "@/app/guias/components/constants";
import type { GuiaItem } from "@/app/guias/components/types";

function fila(over: Partial<GuiaItem> = {}): GuiaItem {
  return {
    uid: over.uid ?? nuevoUid(),
    orden: 1,
    cliente: "City Mall",
    cliente_codigo: "D-101",
    direccion: "David",
    empresa: "Fashion Wear",
    facturas: "10234",
    bultos: 3,
    numero_guia_transp: "",
    ...over,
  };
}

function estado(over: Partial<EstadoGuia> = {}): EstadoGuia {
  return {
    fecha: "2026-07-27",
    modoEntrega: "transportista",
    transportistaId: "t-1",
    entregadoPor: "Julio",
    items: [fila()],
    ...over,
  };
}

// ── validate() ───────────────────────────────────────────────────────────────

describe("validarGuia · una guía completa no tiene errores", () => {
  it("el caso feliz da cero errores", () => {
    expect([...validarGuia(estado())]).toEqual([]);
  });
});

describe("validarGuia · cabecera", () => {
  it("sin fecha", () => {
    expect(validarGuia(estado({ fecha: "" })).has("fecha")).toBe(true);
  });

  it("modo transportista sin transportista elegido", () => {
    expect(validarGuia(estado({ transportistaId: null })).has("transportista")).toBe(true);
  });

  it("entrega directa NO exige transportista", () => {
    const e = validarGuia(estado({ modoEntrega: "entrega_directa", transportistaId: null }));
    expect(e.has("transportista")).toBe(false);
  });

  it("sin quien despacha", () => {
    expect(validarGuia(estado({ entregadoPor: "" })).has("entregadoPor")).toBe(true);
  });
});

describe("validarGuia · filas", () => {
  it("una guía sin ninguna fila con datos no se puede guardar", () => {
    expect(validarGuia(estado({ items: [emptyItem(1)] })).has("items-empty")).toBe(true);
  });

  it("una fila totalmente vacía NO genera errores propios (se descarta al guardar)", () => {
    const vacia = emptyItem(2);
    const errores = validarGuia(estado({ items: [fila(), vacia] }));
    expect([...errores]).toEqual([]);
    expect(filaTieneDatos(vacia)).toBe(false);
  });

  it("una fila a medias sí exige TODOS sus campos", () => {
    const f = fila({ uid: "x", cliente: "", direccion: "", empresa: "", facturas: "", bultos: 0 });
    // bultos > 0 la vuelve "con datos"
    const errores = validarGuia(estado({ items: [{ ...f, bultos: 2 }] }));
    expect(errores.has("item-x-cliente")).toBe(true);
    expect(errores.has("item-x-direccion")).toBe(true);
    expect(errores.has("item-x-empresa")).toBe(true);
    expect(errores.has("item-x-facturas")).toBe(true);
    expect(errores.has("item-x-bultos")).toBe(false);
  });

  it("bultos en 0 con el resto lleno es error", () => {
    const errores = validarGuia(estado({ items: [fila({ uid: "x", bultos: 0 })] }));
    expect(errores.has("item-x-bultos")).toBe(true);
  });

  it("facturas: separador equivocado", () => {
    for (const malo of ["10234;10235", "10234,10235"]) {
      const errores = validarGuia(estado({ items: [fila({ uid: "x", facturas: malo })] }));
      expect(errores.has("item-x-facturas-separator"), malo).toBe(true);
    }
  });

  it("facturas: coma+espacio es la forma correcta", () => {
    const errores = validarGuia(estado({ items: [fila({ uid: "x", facturas: "10234, 10235" })] }));
    expect(errores.has("item-x-facturas-separator")).toBe(false);
    expect(errores.has("item-x-facturas-format")).toBe(false);
  });

  it("facturas: mínimo 4 dígitos por factura", () => {
    const errores = validarGuia(estado({ items: [fila({ uid: "x", facturas: "102" })] }));
    expect(errores.has("item-x-facturas-format")).toBe(true);
  });
});

describe("validarGuia · las claves van por FILA, no por posición", () => {
  // Este es el bug: con `item-<idx>-campo`, borrar la fila de arriba corría los
  // índices y el rojo quedaba señalando a la fila de al lado.
  it("el error nombra el uid de la fila, no su índice", () => {
    const errores = validarGuia(
      estado({ items: [fila(), fila({ uid: "segunda", cliente: "" })] }),
    );
    expect(errores.has("item-segunda-cliente")).toBe(true);
    expect(errores.has("item-1-cliente")).toBe(false);
  });

  it("borrar la fila de arriba NO mueve el error de la de abajo", () => {
    const a = fila({ uid: "a" });
    const b = fila({ uid: "b", cliente: "" });
    const antes = validarGuia(estado({ items: [a, b] }));
    const despues = validarGuia(estado({ items: quitarFila([a, b], 0) }));
    expect(antes.has("item-b-cliente")).toBe(true);
    expect(despues.has("item-b-cliente")).toBe(true);
    // Y "a" nunca hereda el error de "b".
    expect(despues.has("item-a-cliente")).toBe(false);
  });

  it("claveCampo es la misma que arma la validación", () => {
    expect(claveCampo({ uid: "abc" }, "bultos")).toBe("item-abc-bultos");
  });
});

// ── Filas ────────────────────────────────────────────────────────────────────

describe("quitarFila", () => {
  it("nunca deja el formulario sin filas", () => {
    const uno = [fila({ uid: "a" })];
    expect(quitarFila(uno, 0)).toBe(uno);
  });

  it("renumera `orden` pero NO toca los uid", () => {
    const items = [fila({ uid: "a" }), fila({ uid: "b" }), fila({ uid: "c" })];
    const r = quitarFila(items, 1);
    expect(r.map((i) => i.uid)).toEqual(["a", "c"]);
    expect(r.map((i) => i.orden)).toEqual([1, 2]);
  });
});

describe("restaurarFila · el Deshacer conserva el vínculo del cliente", () => {
  it("devuelve cliente_codigo, que el Deshacer viejo perdía en silencio", () => {
    const items = [fila({ uid: "a" }), fila({ uid: "b" }), fila({ uid: "c" })];
    const borrada = items[1];
    const sinElla = quitarFila(items, 1);
    const restaurado = restaurarFila(sinElla, 1, borrada);

    expect(restaurado.map((i) => i.uid)).toEqual(["a", "b", "c"]);
    expect(restaurado[1].cliente_codigo).toBe("D-101");
    expect(restaurado[1]).toEqual({ ...borrada, orden: 2 });
  });

  it("vuelve a SU posición, no al final", () => {
    const items = [fila({ uid: "a" }), fila({ uid: "b" }), fila({ uid: "c" })];
    const restaurado = restaurarFila(quitarFila(items, 0), 0, items[0]);
    expect(restaurado.map((i) => i.uid)).toEqual(["a", "b", "c"]);
  });

  it("no se pierde ningún campo de la fila", () => {
    const borrada = fila({ uid: "b", direccion: "Guabito", facturas: "9991, 9992", bultos: 7 });
    const r = restaurarFila([fila({ uid: "a" })], 1, borrada);
    expect(r[1].direccion).toBe("Guabito");
    expect(r[1].facturas).toBe("9991, 9992");
    expect(r[1].bultos).toBe(7);
  });
});

describe("uid", () => {
  it("una fila nueva nace con identidad propia", () => {
    expect(emptyItem(1).uid).toBeTruthy();
    expect(emptyItem(1).uid).not.toBe(emptyItem(2).uid);
  });

  it("la fila nueva arranca VACÍA — no copia nada de la anterior", () => {
    const n = emptyItem(2);
    expect([n.cliente, n.cliente_codigo, n.direccion, n.empresa, n.facturas]).toEqual(["", "", "", "", ""]);
    expect(n.bultos).toBe(0);
  });
});

// ── Cliente ──────────────────────────────────────────────────────────────────

describe("vinculoCliente · un cliente a mano se tiene que ver distinto", () => {
  it("con código = vinculado al directorio", () => {
    expect(vinculoCliente({ cliente: "City Mall", cliente_codigo: "D-101" })).toBe("vinculado");
  });

  it("sin código = escrito a mano (Otro)", () => {
    expect(vinculoCliente({ cliente: "Tienda del barrio", cliente_codigo: "" })).toBe("otro");
    expect(vinculoCliente({ cliente: "Tienda del barrio" })).toBe("otro");
  });

  it("sin nombre = vacío", () => {
    expect(vinculoCliente({ cliente: "", cliente_codigo: "" })).toBe("vacio");
  });
});

// ── Empresa ──────────────────────────────────────────────────────────────────

describe("empresa · lista cerrada de 8, una sola fuente", () => {
  it("son las 8 del grupo", () => {
    expect(EMPRESAS_CANONICAS).toEqual([
      "Vistana International",
      "Fashion Wear",
      "Fashion Shoes",
      "Active Shoes",
      "Active Wear",
      "Joystep",
      "Confecciones Boston",
      "Multifashion",
    ]);
  });

  it("las listas muertas de constants.ts ya no existen", async () => {
    const mod = await import("@/app/guias/components/constants");
    expect("DEFAULT_EMPRESAS" in mod).toBe(false);
    expect("DEFAULT_CLIENTES" in mod).toBe(false);
  });

  it("esEmpresaCanonica reconoce las 8 y rechaza el texto sucio", () => {
    expect(esEmpresaCanonica("Fashion Wear")).toBe(true);
    expect(esEmpresaCanonica("VISTANA")).toBe(false);
    expect(esEmpresaCanonica("VISTANA / FASHION WEAR")).toBe(false);
    expect(esEmpresaCanonica("")).toBe(false);
    expect(esEmpresaCanonica(null)).toBe(false);
  });
});

describe("opcionesEmpresa · las guías viejas se pueden abrir Y guardar", () => {
  it("una guía nueva solo ofrece las 8", () => {
    const ops = opcionesEmpresa("");
    expect(ops).toHaveLength(8);
    expect(ops.every((o) => !o.legacy)).toBe(true);
  });

  it("un valor sucio guardado entra a la lista marcado (como estaba)", () => {
    const ops = opcionesEmpresa("VISTANA / FASHION WEAR");
    expect(ops).toHaveLength(9);
    const legacy = ops[ops.length - 1];
    expect(legacy.value).toBe("VISTANA / FASHION WEAR");
    expect(legacy.label).toBe("VISTANA / FASHION WEAR (como estaba)");
    expect(legacy.legacy).toBe(true);
  });

  it("el valor sucio se puede seleccionar (no se pierde al guardar)", () => {
    const ops = opcionesEmpresa("VISTANA");
    expect(ops.map((o) => o.value)).toContain("VISTANA");
  });

  it("limpiar es de ida: elegida una de las 8, el valor sucio ya no vuelve a la lista", () => {
    expect(opcionesEmpresa("Fashion Wear").map((o) => o.value)).not.toContain("VISTANA");
    expect(opcionesEmpresa("Fashion Wear")).toHaveLength(8);
  });

  it("un valor que YA es canónico no se duplica", () => {
    expect(opcionesEmpresa("Joystep")).toHaveLength(8);
  });

  it("respeta el orden por frecuencia que manda /api/guias/frecuencias", () => {
    const porUso = ["Joystep", "Fashion Wear"];
    expect(opcionesEmpresa("", porUso).map((o) => o.value)).toEqual(porUso);
  });
});
