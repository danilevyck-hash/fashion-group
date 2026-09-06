// ─────────────────────────────────────────────────────────────────────────────
// 🔴 QUÉ SE PUEDE TOCAR DE UNA GUÍA, SEGÚN SI YA SALIÓ O NO — la regla, sola.
//
// Daniel, punto por punto:
//   · punto 4 — *"Guía despachada → se puede corregir **N° del transportista ·
//     cliente · facturas**"*
//   · punto 5 — *"los **bultos** de una despachada **NO se tocan** — es lo que
//     el transportista firmó"*
//   · punto 6 — *"la firma queda la vieja. No se vuelve a firmar"*
//
// 🔑 POR QUÉ ES UN MÓDULO Y NO UN `if` EN CADA LADO: la regla la aplican TRES
// lugares —el formulario, el endpoint que escribe y el candado—. Con tres
// copias, el día que una cambiara la pantalla ofrecería un campo que el
// servidor rechaza, o peor, al revés.
//
// ⚠️ Lo que este archivo NO prueba (y tiene su propio candado, de conducta):
// que lo que se corrige salga por ESCRITURA POR COLUMNA y nunca por el PUT —
// `guias-anotar-numero-tarde.test.tsx`.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  CAMPOS_DESPACHADA,
  CAMPOS_DE_RENGLON,
  cabeceraEditable,
  cambiosDeRenglon,
  camposEditablesDeRenglon,
  campoEditable,
  renglonesSeAgregan,
} from "@/lib/guias/campos-editables";

const ABIERTAS = ["Pendiente Bodega", "Confirmada", "Despachada", null, undefined, ""];
// ⚠️ NOTA 5-sep-2026 — este candado CAMBIÓ DE DIRECCIÓN, no se borró.
// Daniel retiró el estado «Rechazada» entero (*«quitarlo»*): medido contra
// producción, **0 de las 242 guías** de toda la historia lo usaron, el botón de
// rechazar ya se había ido el 14-ago-2026 y `motivo_rechazo` salió de la lista
// de campos que el PATCH acepta. `guiaYaDespachada` ya no lo reconoce.
// Lo que se sigue exigiendo es lo MISMO, sobre «Completada».
const CERRADAS = ["Completada"];

describe("antes de salir se corrige TODO", () => {
  it.each(ABIERTAS)("estado %s → todos los campos", (estado) => {
    expect(camposEditablesDeRenglon(estado)).toEqual(CAMPOS_DE_RENGLON);
    for (const c of ["cliente", "cliente_codigo", "direccion", "empresa", "facturas", "bultos", "numero_guia_transp"]) {
      expect(campoEditable(estado, c), c).toBe(true);
    }
    expect(cabeceraEditable(estado)).toBe(true);
    expect(renglonesSeAgregan(estado)).toBe(true);
  });
});

describe("🔴 después de salir, TRES cosas y nada más", () => {
  it.each(CERRADAS)("estado %s → cliente, facturas y el N° del transportista", (estado) => {
    expect(camposEditablesDeRenglon(estado)).toEqual(CAMPOS_DESPACHADA);
    expect(campoEditable(estado, "cliente")).toBe(true);
    expect(campoEditable(estado, "cliente_codigo")).toBe(true);
    expect(campoEditable(estado, "facturas")).toBe(true);
    expect(campoEditable(estado, "numero_guia_transp")).toBe(true);
  });

  it.each(CERRADAS)("🔴 estado %s → los BULTOS no se tocan: es lo que el transportista firmó", (estado) => {
    expect(campoEditable(estado, "bultos")).toBe(false);
  });

  it.each(CERRADAS)("estado %s → la dirección y la empresa tampoco", (estado) => {
    expect(campoEditable(estado, "direccion")).toBe(false);
    expect(campoEditable(estado, "empresa")).toBe(false);
  });

  it.each(CERRADAS)("estado %s → la cabecera se lee, y no se agregan envíos", (estado) => {
    expect(cabeceraEditable(estado)).toBe(false);
    expect(renglonesSeAgregan(estado)).toBe(false);
  });

  it("🔴 nada del DESPACHO se cuela por acá: ni placa, ni receptor, ni firmas", () => {
    // La firma queda la vieja (punto 6). Si alguna de éstas apareciera en la
    // lista, el formulario la dibujaría y el servidor la aceptaría.
    for (const c of ["placa", "receptor_nombre", "cedula", "firma_base64", "firma_entregador_base64", "estado", "nombre_chofer"]) {
      expect(campoEditable("Completada", c), c).toBe(false);
      expect(campoEditable("Pendiente Bodega", c), c).toBe(false);
    }
  });

  it("la lista de la guía firmada es un SUBCONJUNTO de la lista completa", () => {
    // Un campo que se pudiera tocar solo después de despachar sería absurdo.
    for (const c of CAMPOS_DESPACHADA) {
      expect(CAMPOS_DE_RENGLON as readonly string[], c).toContain(c);
    }
  });
});

describe("🔴 las escrituras que no cambian nada NO se hacen", () => {
  const guardado = {
    cliente: "CITY MALL PASO CANOA",
    cliente_codigo: "D-25",
    direccion: "Paso Canoas",
    empresa: "Fashion Wear",
    facturas: "F-1001",
    bultos: 6,
    numero_guia_transp: "",
  };

  it("mirar la guía y guardar sin tocar nada no manda un solo campo", () => {
    expect(cambiosDeRenglon("Completada", guardado, { ...guardado })).toEqual({});
    expect(cambiosDeRenglon("Pendiente Bodega", guardado, { ...guardado })).toEqual({});
  });

  it("solo viaja lo que cambió", () => {
    expect(cambiosDeRenglon("Completada", guardado, { ...guardado, facturas: "F-2002" }))
      .toEqual({ facturas: "F-2002" });
  });

  it("🔴 en una guía firmada, tocar los bultos NO produce escritura", () => {
    // Sin esto, mandar la fila entera pisaría lo que el transportista firmó —
    // aunque el servidor lo rechace, la pantalla estaría pidiéndolo.
    expect(cambiosDeRenglon("Completada", guardado, { ...guardado, bultos: 99 })).toEqual({});
    // En una PENDIENTE sí, claro.
    expect(cambiosDeRenglon("Pendiente Bodega", guardado, { ...guardado, bultos: 99 }))
      .toEqual({ bultos: 99 });
  });

  it("🔴 «» y `null` son el MISMO estado para el código de cliente: desatar guarda NULL", () => {
    // Con "" un `cliente_codigo IS NOT NULL` contaría líneas que no están atadas.
    expect(cambiosDeRenglon("Completada", guardado, { ...guardado, cliente_codigo: "" }))
      .toEqual({ cliente_codigo: null });
    expect(cambiosDeRenglon("Completada", { ...guardado, cliente_codigo: null }, { ...guardado, cliente_codigo: "" }))
      .toEqual({});
  });

  it("los espacios de más no son un cambio", () => {
    expect(cambiosDeRenglon("Completada", guardado, { ...guardado, facturas: " F-1001 " })).toEqual({});
  });

  it("un campo que no vino no se toca (no se borra con un «» que nadie escribió)", () => {
    // Es el mismo error que `items` del PUT, en chico: corregir los bultos no
    // puede borrar la dirección de la fila.
    expect(cambiosDeRenglon("Pendiente Bodega", guardado, { bultos: 9 })).toEqual({ bultos: 9 });
  });
});
