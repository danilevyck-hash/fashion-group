/**
 * 🔴 CUATRO DEFECTOS DEL MÓDULO DE GUÍAS, salidos de la misma auditoría.
 *
 *  1. El N° del transportista se COPIABA a todos los envíos. El número que se
 *     escribe una vez al crear la guía se prellenaba en los 7 renglones y
 *     bodega los encontraba todos iguales — lo contrario de lo que se decidió
 *     el 10-ago-2026 (*"la info de guia de transp, debe de ser por linea"*).
 *  2. «Imprimir todas» no imprimía nada: abría una pestaña por guía y el
 *     navegador bloqueaba todas menos la primera.
 *  3. El Excel decía «—» en el N° del transportista aunque estuviera anotado:
 *     miraba la CABECERA, y el número que se anota tarde escribe UNA columna de
 *     UNA línea. Buscar por ese número tampoco encontraba la guía.
 *  4. Se imprimía `__other__` en el papel que firma el transportista.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { numerosTranspDeLaGuia } from "@/lib/guias/modo-despacho";
import { numeroCabeceraAlDespachar, numeroGuiaDeCabecera } from "@/lib/guias/falta-para-despachar";
import {
  ENTREGADO_POR_OTRO,
  entregadoPorElegido,
  nombreDespachadoPor,
} from "@/lib/guias/despachado-por";
import { validarGuia } from "@/app/guias/components/guia-form-logic";
import { construirPdfGuia, construirPdfGuias, nombreArchivoGuias } from "@/lib/guias/pdf-guia";
import { buildGuiasSheet } from "@/app/guias/components/excel-guias";
import type { Guia, GuiaItem } from "@/app/guias/components/types";

const leer = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
/** 🩸 Los barridos BORRAN LOS COMENTARIOS PRIMERO: en este repo un candado ya
 *  se cumplió cuatro veces con su propia explicación. */
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const HOOK = sinComentarios(leer("src/app/guias/components/useDespachoGuia.ts"));

function envio(p: Partial<GuiaItem> = {}): GuiaItem {
  return {
    id: p.id ?? "it-1", orden: p.orden ?? 1,
    cliente: p.cliente ?? "CITY MALL PASO CANOA", cliente_codigo: p.cliente_codigo ?? "D-25",
    direccion: p.direccion ?? "Paso Canoas", empresa: p.empresa ?? "Fashion Wear",
    facturas: p.facturas ?? "10234", bultos: p.bultos ?? 4,
    numero_guia_transp: p.numero_guia_transp ?? "",
  };
}

function guia(p: Partial<Guia> = {}): Guia {
  return {
    id: "g-1", numero: 206, fecha: "2026-08-25",
    transportista: "Transporte Sol", modo_entrega: "transportista", transportista_id: "t-1",
    placa: "EK0700", observaciones: "", total_bultos: 4, item_count: 1, monto_total: 0,
    estado: "Completada", tipo_despacho: "externo",
    entregado_por: "Julio", numero_guia_transp: "",
    guia_items: [envio()],
    ...p,
  } as Guia;
}

// ─────────────────────────────────────────────────────────────────────────────
describe("1 · el N° del transportista NO se copia a todos los envíos", () => {
  it("cada caja arranca con el número de SU línea, no con el de la cabecera", () => {
    // Lo que hacía el defecto, escrito tal cual: `it.numero_guia_transp || cabecera`.
    expect(HOOK).not.toMatch(/numero_guia_transp\s*\|\|\s*cabecera/);
    expect(HOOK).toContain('items.map((it) => it.numero_guia_transp || "")');
  });

  it("la herencia SIGUE viva donde corresponde: al imprimir y al mostrar", () => {
    // Una guía vieja no tiene número por línea y su papel tiene que salir igual
    // que siempre. Eso lo resuelve `numeroTranspImpreso`, no el prellenado.
    const vieja = guia({ numero_guia_transp: "TR-4471", guia_items: [envio(), envio({ id: "it-2", orden: 2 })] });
    expect(numerosTranspDeLaGuia(vieja)).toEqual(["TR-4471"]);
  });

  it("despachar con todas las cajas vacías NO borra el número de la cabecera", () => {
    // 🩸 Es el efecto colateral de dejar de prellenar: lo normal pasa a ser
    // despachar con las 7 vacías, y `numeroGuiaDeCabecera` devuelve "".
    expect(numeroGuiaDeCabecera(["", "", ""])).toBe("");
    expect(numeroCabeceraAlDespachar(["", "", ""], "TR-4471")).toBe("TR-4471");
  });

  it("pero si una línea trae número, gana la línea", () => {
    expect(numeroCabeceraAlDespachar(["", "TR-9999", ""], "TR-4471")).toBe("TR-9999");
  });

  it("sin número por ningún lado, la cabecera queda vacía", () => {
    expect(numeroCabeceraAlDespachar(["", ""], "")).toBe("");
    expect(numeroCabeceraAlDespachar([], null)).toBe("");
  });

  it("el hook usa la regla con nombre, no una expresión suelta", () => {
    expect(HOOK).toContain("numeroCabeceraAlDespachar(numerosTransp, guia.numero_guia_transp)");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("3 · el N° anotado TARDE se ve en el Excel y se puede buscar", () => {
  it("los números salen de las LÍNEAS, no de la cabecera", () => {
    const g = guia({
      numero_guia_transp: "", // el que se anota tarde NO toca la cabecera
      guia_items: [
        envio({ id: "a", orden: 1, numero_guia_transp: "TR-4471" }),
        envio({ id: "b", orden: 2, numero_guia_transp: "TR-9999" }),
      ],
    });
    expect(numerosTranspDeLaGuia(g)).toEqual(["TR-4471", "TR-9999"]);
  });

  it("sin repetidos y sin vacíos", () => {
    const g = guia({
      numero_guia_transp: "",
      guia_items: [
        envio({ id: "a", orden: 1, numero_guia_transp: "TR-1" }),
        envio({ id: "b", orden: 2, numero_guia_transp: "TR-1" }),
        envio({ id: "c", orden: 3, numero_guia_transp: "" }),
      ],
    });
    expect(numerosTranspDeLaGuia(g)).toEqual(["TR-1"]);
  });

  it('un "0" pelado NO es un número, igual que en el papel', () => {
    const g = guia({ numero_guia_transp: "0", guia_items: [envio({ numero_guia_transp: "0" })] });
    expect(numerosTranspDeLaGuia(g)).toEqual([]);
    // Pero nada que CONTENGA un cero se pierde.
    const ok = guia({ numero_guia_transp: "", guia_items: [envio({ numero_guia_transp: "EK0700" })] });
    expect(numerosTranspDeLaGuia(ok)).toEqual(["EK0700"]);
  });

  it("el Excel muestra el número anotado tarde, no un «—»", () => {
    const g = guia({
      numero_guia_transp: "",
      guia_items: [envio({ numero_guia_transp: "TR-4471" })],
    });
    const ws = buildGuiasSheet([g]);
    const celdas = Object.keys(ws)
      .filter((k) => !k.startsWith("!"))
      .map((k) => String((ws[k] as { v?: unknown }).v ?? ""));
    expect(celdas).toContain("TR-4471");
    expect(celdas).not.toContain("—");
  });

  it("con varios distintos, el Excel los lista TODOS", () => {
    const g = guia({
      numero_guia_transp: "",
      guia_items: [
        envio({ id: "a", orden: 1, numero_guia_transp: "TR-4471" }),
        envio({ id: "b", orden: 2, numero_guia_transp: "TR-9999" }),
      ],
    });
    const ws = buildGuiasSheet([g]);
    const celdas = Object.keys(ws)
      .filter((k) => !k.startsWith("!"))
      .map((k) => String((ws[k] as { v?: unknown }).v ?? ""));
    expect(celdas).toContain("TR-4471, TR-9999");
  });

  it("sin ningún número, sigue diciendo «—»", () => {
    const ws = buildGuiasSheet([guia({ numero_guia_transp: "" })]);
    const celdas = Object.keys(ws)
      .filter((k) => !k.startsWith("!"))
      .map((k) => String((ws[k] as { v?: unknown }).v ?? ""));
    expect(celdas).toContain("—");
  });

  it("el buscador de la lista mira los números de las líneas", () => {
    const LISTA = sinComentarios(leer("src/app/guias/components/GuiasList.tsx"));
    expect(LISTA).toContain("numerosTranspDeLaGuia(g).some(");
    // Y ya no se conforma con la cabecera sola.
    expect(LISTA).not.toContain('(g.numero_guia_transp || "").toLowerCase().includes(q)');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("4 · `__other__` no es un nombre y no llega al papel", () => {
  it("el centinela no cuenta como «despachado por» elegido", () => {
    expect(entregadoPorElegido(ENTREGADO_POR_OTRO)).toBe(false);
    expect(entregadoPorElegido("")).toBe(false);
    expect(entregadoPorElegido("   ")).toBe(false);
    expect(entregadoPorElegido("Julio")).toBe(true);
  });

  it("el formulario no deja guardar con el centinela puesto", () => {
    const base = {
      fecha: "2026-08-25", modoEntrega: "transportista" as const, transportistaId: "t-1",
      items: [{ ...envio(), uid: "u1" }],
    };
    expect(validarGuia({ ...base, entregadoPor: ENTREGADO_POR_OTRO }).has("entregadoPor")).toBe(true);
    expect(validarGuia({ ...base, entregadoPor: "" }).has("entregadoPor")).toBe(true);
    expect(validarGuia({ ...base, entregadoPor: "Julio" }).has("entregadoPor")).toBe(false);
  });

  it("el papel deja la línea en blanco en vez de afirmar `__other__`", () => {
    expect(nombreDespachadoPor(ENTREGADO_POR_OTRO)).toBe("");
    expect(nombreDespachadoPor(null)).toBe("");
    expect(nombreDespachadoPor("  Julio ")).toBe("Julio");
  });

  it("🔴 el PDF GENERADO no contiene `__other__`", () => {
    // Se genera el archivo de verdad y se lee: un barrido sobre el .ts se
    // cumple con su propio comentario.
    const crudo = Buffer.from(
      construirPdfGuia(guia({ entregado_por: ENTREGADO_POR_OTRO })).output("arraybuffer"),
    ).toString("latin1");
    expect(crudo).not.toContain("__other__");
    // Y el papel de una guía normal sí trae el nombre.
    const conNombre = Buffer.from(
      construirPdfGuia(guia({ entregado_por: "Julio" })).output("arraybuffer"),
    ).toString("latin1");
    expect(conNombre).toContain("Julio");
  });

  it("los dos papeles usan la misma regla", () => {
    const IMPRESO = sinComentarios(leer("src/app/guias/components/PrintDocument.tsx"));
    const PDF = sinComentarios(leer("src/lib/guias/pdf-guia.ts"));
    expect(IMPRESO).toContain("nombreDespachadoPor(g.entregado_por)");
    expect(PDF).toContain("nombreDespachadoPor(g.entregado_por)");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("2 · «Imprimir todas» baja UN PDF con todas", () => {
  const paginas = (doc: ReturnType<typeof construirPdfGuias>) =>
    doc.getNumberOfPages();

  it("una página por guía", () => {
    const g1 = guia({ id: "g-1", numero: 201 });
    const g2 = guia({ id: "g-2", numero: 202 });
    const g3 = guia({ id: "g-3", numero: 203 });
    expect(paginas(construirPdfGuias([g1, g2, g3]))).toBe(3);
  });

  it("con UNA guía no deja una hoja en blanco de más", () => {
    expect(paginas(construirPdfGuias([guia()]))).toBe(1);
    expect(paginas(construirPdfGuia(guia()))).toBe(1);
  });

  it("el documento de una sola guía es el MISMO que el de siempre", () => {
    // Mismo generador: si el "modo lote" dibujara distinto, el papel de un
    // pedido de 8 no sería el papel que la gente conoce.
    const g = guia({ numero: 207, entregado_por: "Rodrigo" });
    const solo = Buffer.from(construirPdfGuia(g).output("arraybuffer")).toString("latin1");
    const lote = Buffer.from(construirPdfGuias([g]).output("arraybuffer")).toString("latin1");
    const sinFecha = (s: string) => s.replace(/D:\d{14}[^)]*/g, "").replace(/\/ID \[[^\]]*\]/g, "");
    expect(sinFecha(lote)).toBe(sinFecha(solo));
  });

  it("todas las guías salen adentro, con su número", () => {
    const crudo = Buffer.from(
      construirPdfGuias([guia({ id: "a", numero: 201 }), guia({ id: "b", numero: 202 })]).output("arraybuffer"),
    ).toString("latin1");
    expect(crudo).toContain("GT-201");
    expect(crudo).toContain("GT-202");
  });

  it("sin guías no se inventa una hoja", () => {
    expect(construirPdfGuias([]).getNumberOfPages()).toBe(1); // el documento nace con una
    // Lo que importa: no se dibuja nada de ninguna guía.
    const crudo = Buffer.from(construirPdfGuias([]).output("arraybuffer")).toString("latin1");
    expect(crudo).not.toContain("GUIA DE TRANSPORTE INTERIOR");
  });

  it("el nombre del archivo dice cuántas van", () => {
    expect(nombreArchivoGuias([guia({ numero: 201 })])).toMatch(/GT-201/);
    expect(nombreArchivoGuias([guia({ id: "a", numero: 201 }), guia({ id: "b", numero: 202 })])).toMatch(/^Guias-2-/);
  });

  it("la lista ya no abre una pestaña por guía", () => {
    const LISTA = sinComentarios(leer("src/app/guias/components/GuiasList.tsx"));
    expect(LISTA).not.toMatch(/ids\.forEach\(id => window\.open/);
    expect(LISTA).toContain("construirPdfGuias");
  });
});
