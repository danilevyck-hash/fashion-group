// ─────────────────────────────────────────────────────────────────────────────
// 🔴 LO QUE LE FALTÓ A UNA GUÍA QUE YA SALIÓ — la marca, no el arreglo.
//
// Daniel, punto 13: *"Las 68 sin placa y 65 sin recibido → marcadas para
// completarlas"*.
//
// 🩸 El dato, medido contra producción: de las **207 guías despachadas**, 143
// sin N° de transportista, **68 sin placa**, **65 sin «Recibido por»**, y **190
// de 207 (92%) con al menos uno**. Se cerraron así porque durante meses nada
// bloqueaba: el bloqueo de placa/receptor/cédula se puso el 10-ago-2026 y desde
// entonces son 0 de 15.
//
// 🔴 ESTO MARCA, NO ABRE. Placa, receptor y cédula NO están entre las tres
// cosas que se pueden corregir en una guía firmada (N° del transportista ·
// cliente · facturas) y el candado del PUT las rechaza igual. Marcarlas es lo
// que permite ENCONTRARLAS.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  despachadaIncompleta,
  faltantesDeLaDespachada,
  textoFaltantesDespachada,
} from "@/lib/guias/faltantes-despacho";
import { CAMPOS_DESPACHADA } from "@/lib/guias/campos-editables";

const completa = {
  estado: "Completada",
  tipo_despacho: "externo",
  placa: "EK0700",
  receptor_nombre: "Nicolás guillen",
  cedula: "1-727-44",
};

describe("qué le falta a una guía despachada", () => {
  it("una guía completa no reclama nada", () => {
    expect(faltantesDeLaDespachada(completa)).toEqual([]);
    expect(despachadaIncompleta(completa)).toBe(false);
    expect(textoFaltantesDespachada(completa)).toBe("");
  });

  it("las 68 sin placa se marcan", () => {
    expect(faltantesDeLaDespachada({ ...completa, placa: "" })).toEqual(["la placa"]);
  });

  it("las 65 sin «Recibido por» se marcan", () => {
    expect(faltantesDeLaDespachada({ ...completa, receptor_nombre: "" })).toEqual(["quién recibió"]);
  });

  it("y la cédula también", () => {
    expect(faltantesDeLaDespachada({ ...completa, cedula: "" })).toEqual(["la cédula"]);
  });

  it("🔴 un «0» pelado NO es una placa: es lo que alguien tecleó para destrabar el botón", () => {
    // GT-194, GT-195 y GT-196 tienen `placa = "0"` en producción, y son las
    // únicas tres de toda la base. Misma regla que el papel (`sinCeroPelado`).
    expect(faltantesDeLaDespachada({ ...completa, placa: "0" })).toEqual(["la placa"]);
    // Pero una placa que CONTIENE un cero es una placa.
    expect(faltantesDeLaDespachada({ ...completa, placa: "EK0700" })).toEqual([]);
  });

  it("los espacios en blanco no cuentan como dato", () => {
    expect(faltantesDeLaDespachada({ ...completa, receptor_nombre: "   " })).toEqual(["quién recibió"]);
  });

  it("con varias, salen en el orden en que se leen en la pantalla", () => {
    const g = { ...completa, placa: "", receptor_nombre: "", cedula: "" };
    expect(faltantesDeLaDespachada(g)).toEqual(["la placa", "quién recibió", "la cédula"]);
    expect(textoFaltantesDespachada(g)).toBe("Salió sin la placa, quién recibió y la cédula");
  });

  it("la frase usa el MISMO unidor que los botones de guardar y despachar", () => {
    // Con dos idiomas —uno dice "a, b y c" y el otro "a, b, c"— la pantalla
    // habla distinto según en qué caja esté escrito el texto.
    expect(textoFaltantesDespachada({ ...completa, placa: "", cedula: "" }))
      .toBe("Salió sin la placa y la cédula");
    expect(textoFaltantesDespachada({ ...completa, placa: "" })).toBe("Salió sin la placa");
  });
});

describe("🔴 a quién NO se le reclama", () => {
  it("a una guía PENDIENTE: todavía se está llenando el dato", () => {
    // Acusarla sería ruido en la única pantalla donde bodega mira el trabajo
    // del día. Mismo criterio que `guiaSinNumeroTransp`.
    const g = { estado: "Pendiente Bodega", tipo_despacho: "externo", placa: "", receptor_nombre: "", cedula: "" };
    expect(faltantesDeLaDespachada(g)).toEqual([]);
    expect(despachadaIncompleta(g)).toBe(false);
  });

  it("🔴 a una ENTREGA DIRECTA no se le pide placa: es nuestro propio camión", () => {
    // La placa no se pide en pantalla, así que reclamarla después sería
    // inventar una tarea que nadie puede hacer.
    const g = { estado: "Completada", tipo_despacho: "directo", modo_entrega: "entrega_directa", placa: "", receptor_nombre: "Ana", cedula: "8-1-1" };
    expect(faltantesDeLaDespachada(g)).toEqual([]);
  });

  it("…pero a una entrega directa SÍ se le pide quién recibió", () => {
    const g = { estado: "Completada", tipo_despacho: "directo", modo_entrega: "entrega_directa", placa: "", receptor_nombre: "", cedula: "" };
    expect(faltantesDeLaDespachada(g)).toEqual(["quién recibió", "la cédula"]);
  });
});

describe("🔴 MARCA, NO ABRE — y esto es lo que lo prueba", () => {
  it("ninguno de los tres campos que se marcan está entre los que se pueden corregir", () => {
    // Si alguien agregara `placa` a la lista de editables, esto se pone rojo:
    // marcar algo y además dejarlo escribir en una guía firmada es otra
    // decisión, y no se tomó.
    for (const campo of ["placa", "receptor_nombre", "cedula"]) {
      expect(CAMPOS_DESPACHADA as readonly string[], campo).not.toContain(campo);
    }
  });
});
