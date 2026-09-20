/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CANDADO — EL PAPEL DE LA GUÍA ESTÁ ESCRITO EN ESPAÑOL, CON ACENTOS.
 *
 * 🩸 Los DOS dibujos del mismo papel —`PrintDocument.tsx` (la hoja que se
 * imprime) y `pdf-guia.ts` (el PDF que se comparte por WhatsApp)— salían sin
 * UN SOLO acento: «GUIA DE TRANSPORTE INTERIOR», «DIRECCION», «CEDULA»,
 * «OBSERVACIONES GENERALES DEL ENVIO» y un pie legal que decía «constituye
 * aceptacion expresa de la mercancia… condicion indicadas… faltante o dano no
 * reportado al momento de la recepcion». Es el documento que firma el
 * transportista y el que el cliente recibe por chat.
 *
 * 🔑 NO ERA UNA LIMITACIÓN TÉCNICA, y está medido: jsPDF escribe las vocales
 * acentuadas y la ñ en UN byte (WinAnsiEncoding) — lo documenta carácter por
 * carácter `asistencia-pdf-solo-latin1.test.ts`, y el PDF de Asistencia imprime
 * «POSICIÓN DESEMPEÑADA» desde hace meses. Era un olvido.
 *
 * ── CÓMO MIDE ───────────────────────────────────────────────────────────────
 *
 * No lee el código: DIBUJA los dos papeles de verdad —renderiza la hoja y
 * genera el PDF— y barre lo que sale. Así un rótulo nuevo sin acento se cae
 * acá venga de donde venga, incluso si lo escribe un módulo de más abajo.
 *
 * ⚠️ El barrido NO es «todo lo que no tenga tilde»: es una lista de palabras
 * que en español SIEMPRE la llevan. Los plurales de las palabras en -ción la
 * pierden («direcciones», «condiciones», «observaciones») y por eso NO están:
 * un candado que las acusara empujaría a escribir mal.
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, expect, it } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { readFileSync } from "fs";
import path from "path";
import PrintDocument from "@/app/guias/components/PrintDocument";
import { construirPdfGuia } from "@/lib/guias/pdf-guia";
import {
  casillaEnBlanco,
  rayaDeLaCasilla,
  tintaDeLaCasilla,
  RAYA_A_MANO,
  RAYA_CON_VALOR,
  TINTA_RAYA_A_MANO,
  TINTA_RAYA_CON_VALOR,
} from "@/lib/guias/casilla-en-blanco";
import { esCeroDeFactura, facturasParaElPapel } from "@/lib/guias/numero-factura";
import type { Guia } from "@/app/guias/components/types";

const raiz = process.cwd();
const leer = (r: string) => readFileSync(path.join(raiz, r), "utf8");

/** El byte que delata el UTF-16: jsPDF escribe un NUL entre letra y letra. */
const NUL = String.fromCharCode(0);

// ── La guía del fixture ──────────────────────────────────────────────────────
// ⚠️ Sus DATOS no pueden traer ninguna de las palabras del barrido: lo que se
// vigila es el texto FIJO del papel, no lo que alguien tecleó en un renglón.
const GUIA: Guia = {
  id: "g1",
  numero: 412,
  fecha: "2026-08-05",
  transportista: "Transporte Sol",
  placa: "AB-1234",
  observaciones: "Dos bultos van en caja aparte.",
  total_bultos: 7,
  item_count: 2,
  monto_total: 0,
  estado: "Completada",
  receptor_nombre: "Luis Pérez",
  cedula: "8-888-8888",
  entregado_por: "Julio",
  numero_guia_transp: "GT-99120",
  tipo_despacho: "transportista",
  guia_items: [
    { orden: 1, cliente: "CITY MALL", direccion: "Paso Canoas", empresa: "Fashion Shoes", facturas: "2534", bultos: 4, numero_guia_transp: "" },
    { orden: 2, cliente: "LA FRONTERA", direccion: "Santiago", empresa: "Fashion Wear", facturas: "2540, 2541", bultos: 3, numero_guia_transp: "" },
  ],
};

// ── Sacarle al PDF lo que de verdad dibuja ───────────────────────────────────
// Mismo método que `asistencia-pdf-solo-latin1.test.ts`: se lee el content
// stream sin comprimir del PDF ya armado.

/** Deshace el escapado de un string literal de PDF: `\(`, `\\` y octales. */
function desescapar(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== "\\") { out += s[i]; continue; }
    const sig = s[i + 1];
    if (sig >= "0" && sig <= "7") {
      out += String.fromCharCode(parseInt(s.slice(i + 1, i + 4), 8));
      i += 3;
    } else {
      out += sig;
      i += 1;
    }
  }
  return out;
}

function cadenasDelPdf(bytes: ArrayBuffer): string[] {
  const raw = Buffer.from(bytes).toString("latin1");
  const cadenas: string[] = [];
  for (const stream of raw.matchAll(/stream\n([\s\S]*?)\nendstream/g)) {
    const cuerpo = stream[1];
    if (!cuerpo.includes("BT")) continue;
    for (const t of cuerpo.matchAll(/\(((?:\\.|[^\\()])*)\)\s*Tj/g)) {
      cadenas.push(desescapar(t[1]));
    }
  }
  return cadenas;
}

/** Todo lo que el PDF escribe, en un solo texto. */
function textoDelPdf(g: Guia = GUIA): string {
  return cadenasDelPdf(construirPdfGuia(g).output("arraybuffer")).join("\n");
}

/** Todo lo que la hoja impresa muestra, en un solo texto. */
function textoDeLaHoja(g: Guia = GUIA): string {
  cleanup();
  const { container } = render(<PrintDocument guia={g} />);
  return container.textContent ?? "";
}

// ── El barrido ───────────────────────────────────────────────────────────────

/**
 * Palabras que en español SIEMPRE llevan tilde (o ñ). Escritas acá SIN ella:
 * es la forma que no puede aparecer en el papel.
 *
 * ⚠️ Nada de plurales de -ción («direcciones», «condiciones») ni de palabras
 * que existen de las dos formas («mas», «esta», «si»): acusarlas sería empujar
 * a escribir mal.
 */
const SIN_ACENTO = [
  "guia", "guias", "direccion", "cedula", "cedulas", "vehiculo", "vehiculos",
  "envio", "envios", "aceptacion", "mercancia", "mercancias", "condicion",
  "recepcion", "dano", "danos", "sera", "seran", "numero", "numeros",
  "dia", "dias", "telefono", "telefonos", "articulo", "articulos",
  "codigo", "codigos", "credito", "deposito", "maximo", "minimo",
  "ultimo", "ultima", "ultimos", "ultimas", "proximo", "proxima",
  "aqui", "tambien", "ademas", "segun", "despues", "razon", "camion",
  "informacion", "seccion", "atencion", "devolucion", "descripcion",
  "facturacion", "impresion", "operacion", "ubicacion", "observacion",
];

/** Las palabras del barrido que aparecen en un texto, con su contexto. */
function acusar(texto: string): string[] {
  const plano = texto.toLowerCase();
  const encontradas: string[] = [];
  for (const p of SIN_ACENTO) {
    const re = new RegExp(`(^|[^a-záéíóúüñ])${p}([^a-záéíóúüñ]|$)`);
    const m = re.exec(plano);
    if (m) {
      const desde = Math.max(0, m.index - 30);
      encontradas.push(
        `«${p}» en «…${texto.slice(desde, m.index + p.length + 30).replace(/\s+/g, " ")}…»`,
      );
    }
  }
  return encontradas;
}

describe("🔴 los DOS papeles de la guía están escritos con acentos", () => {
  it("la hoja que se imprime no tiene una sola palabra sin acento", () => {
    const malas = acusar(textoDeLaHoja());
    expect(malas, `\nla hoja impresa escribe sin acento:\n${malas.join("\n")}\n`).toEqual([]);
  });

  it("el PDF que se comparte no tiene una sola palabra sin acento", () => {
    const malas = acusar(textoDelPdf());
    expect(malas, `\nel PDF escribe sin acento:\n${malas.join("\n")}\n`).toEqual([]);
  });

  it("la guía de ENTREGA DIRECTA tampoco (dibuja otras casillas)", () => {
    const directa: Guia = {
      ...GUIA,
      tipo_despacho: "directo",
      modo_entrega: "entrega_directa",
      nombre_chofer: "Marcos R.",
    };
    expect(acusar(textoDeLaHoja(directa))).toEqual([]);
    expect(acusar(textoDelPdf(directa))).toEqual([]);
  });

  it("CONTROL — el barrido no está mudo: acusa una palabra sin acento", () => {
    expect(acusar("GUIA DE TRANSPORTE INTERIOR").length).toBe(1);
    expect(acusar("faltante o dano no reportado").length).toBe(1);
    // …y no acusa lo que está BIEN escrito, ni los plurales sin tilde.
    expect(acusar("GUÍA DE TRANSPORTE INTERIOR · direcciones · observaciones")).toEqual([]);
  });

  it("🔴 las palabras acentuadas salen LEGIBLES en el PDF (un byte, no UTF-16)", () => {
    // jsPDF cambia SOLO a UTF-16 ante un carácter que no entra en WinAnsi, y
    // ahí se pierde la LÍNEA ENTERA. Las vocales acentuadas y la ñ sí entran:
    // una cadena en UTF-16 se reconoce por el NUL entre letra y letra.
    const cadenas = cadenasDelPdf(construirPdfGuia(GUIA).output("arraybuffer"));
    expect(cadenas.length).toBeGreaterThan(10);
    expect(cadenas.filter((c) => c.includes(NUL))).toEqual([]);
    expect(cadenas.join("\n")).toContain("GUÍA DE TRANSPORTE INTERIOR");
  });

  it("los dos papeles dicen LO MISMO, palabra por palabra, en sus rótulos", () => {
    const hoja = textoDeLaHoja();
    const pdf = textoDelPdf();
    for (const rotulo of [
      "DIRECCIÓN", "FACTURA(S)", "BULTOS", "CLIENTE", "EMPRESA",
      "PLACA / VEHÍCULO:", "N GUÍA:", "N GUÍA TRANSP.", "CÉDULA:",
    ]) {
      expect(hoja, `la hoja no dice «${rotulo}»`).toContain(rotulo);
      expect(pdf, `el PDF no dice «${rotulo}»`).toContain(rotulo);
    }
    // El título y las observaciones cambian de caja entre los dos papeles
    // (la hoja lo pone en mayúsculas con CSS), así que se comparan en minúscula.
    expect(hoja.toLowerCase()).toContain("guía de transporte interior");
    expect(pdf.toLowerCase()).toContain("guía de transporte interior");
    expect(hoja.toLowerCase()).toContain("observaciones generales del envío");
    expect(pdf.toLowerCase()).toContain("observaciones generales del envío");
  });
});

describe("🔴 una casilla vacía sale con raya para escribirla a mano", () => {
  it("la regla está en UN solo lugar y la usan los dos papeles", () => {
    expect(leer("src/app/guias/components/PrintDocument.tsx")).toContain("rayaDeLaCasilla");
    expect(leer("src/lib/guias/pdf-guia.ts")).toContain("tintaDeLaCasilla");
  });

  it("sin placa, la raya de PLACA / VEHÍCULO es la de escribir a mano", () => {
    cleanup();
    render(<PrintDocument guia={{ ...GUIA, placa: "" }} />);
    const casilla = screen.getByText("PLACA / VEHÍCULO:").nextElementSibling as HTMLElement;
    expect(casilla.className).toContain(RAYA_A_MANO);
    expect(casilla.className).not.toContain(RAYA_CON_VALOR);
  });

  it("con placa, la raya vuelve a ser la fina de siempre", () => {
    cleanup();
    render(<PrintDocument guia={GUIA} />);
    const casilla = screen.getByText("PLACA / VEHÍCULO:").nextElementSibling as HTMLElement;
    expect(casilla.className).toContain(RAYA_CON_VALOR);
  });

  it("un «0» pelado no es una placa: también sale con raya a mano", () => {
    cleanup();
    render(<PrintDocument guia={{ ...GUIA, placa: "0" }} />);
    const casilla = screen.getByText("PLACA / VEHÍCULO:").nextElementSibling as HTMLElement;
    expect(casilla.className).toContain(RAYA_A_MANO);
  });

  it("el módulo puro decide igual para los dos papeles", () => {
    expect(casillaEnBlanco("")).toBe(true);
    expect(casillaEnBlanco("   ")).toBe(true);
    expect(casillaEnBlanco(null)).toBe(true);
    expect(casillaEnBlanco("AB-1234")).toBe(false);
    expect(rayaDeLaCasilla("")).toBe(RAYA_A_MANO);
    expect(rayaDeLaCasilla("AB-1234")).toBe(RAYA_CON_VALOR);
    expect(tintaDeLaCasilla("")).toBe(TINTA_RAYA_A_MANO);
    expect(tintaDeLaCasilla("AB-1234")).toBe(TINTA_RAYA_CON_VALOR);
    // La raya a mano es más OSCURA que la de una casilla escrita: si se
    // invirtieran, la que hay que llenar sería la que menos se ve.
    expect(TINTA_RAYA_A_MANO).toBeLessThan(TINTA_RAYA_CON_VALOR);
  });

  it("⚠️ sigue sin dibujarse la casilla de placa en ENTREGA DIRECTA", () => {
    // Nuestro propio camión: no hay placa de tercero que declarar, y la raya
    // no puede invitar a escribir una.
    cleanup();
    render(
      <PrintDocument
        guia={{ ...GUIA, placa: "", tipo_despacho: "directo", modo_entrega: "entrega_directa" }}
      />,
    );
    expect(screen.queryByText("PLACA / VEHÍCULO:")).toBeNull();
  });
});

describe("🔴 el «0000» no se imprime, y «Traslado» sí", () => {
  const conCeros: Guia = {
    ...GUIA,
    guia_items: [
      { orden: 1, cliente: "CITY MALL", direccion: "Paso Canoas", empresa: "Fashion Shoes", facturas: "0000", bultos: 4, numero_guia_transp: "" },
      { orden: 2, cliente: "LA FRONTERA", direccion: "Santiago", empresa: "Fashion Wear", facturas: "Traslado", bultos: 3, numero_guia_transp: "" },
    ],
  };

  it("la hoja impresa deja la casilla vacía en el renglón del 0000", () => {
    const texto = textoDeLaHoja(conCeros);
    expect(texto).not.toContain("0000");
    expect(texto).toContain("Traslado");
  });

  it("el PDF tampoco lo escribe", () => {
    const texto = textoDelPdf(conCeros);
    expect(texto).not.toContain("0000");
    expect(texto).toContain("Traslado");
  });

  it("🔴 lo GUARDADO no se toca: la regla es solo de dibujo", () => {
    // El renglón sigue diciendo `0000` en la base y en el campo que se edita.
    expect(conCeros.guia_items![0].facturas).toBe("0000");
    // Y la lista, la ficha y el Excel lo siguen mostrando: ahí es donde
    // alguien revisa lo que tecleó.
    expect(leer("src/app/guias/components/excel-guias.ts")).toContain("facturasParaMostrar");
    expect(leer("src/app/guias/components/ResumenEnvio.tsx")).toContain("facturasParaMostrar");
  });

  it("el módulo puro distingue el 0000 del Traslado", () => {
    expect(esCeroDeFactura("0000")).toBe(true);
    expect(esCeroDeFactura("00000")).toBe(true);
    expect(esCeroDeFactura("0")).toBe(true);
    expect(esCeroDeFactura("00-000000")).toBe(true);
    expect(esCeroDeFactura("Traslado")).toBe(false);
    // 🔴 Con LETRAS no es el marcador «sin factura», aunque sus dígitos sean
    // ceros: es texto que alguien escribió y el papel lo tiene que decir.
    expect(esCeroDeFactura("Factura 0000")).toBe(false);
    expect(esCeroDeFactura("Traslado 000")).toBe(false);
    expect(esCeroDeFactura("2534")).toBe(false);
    expect(esCeroDeFactura("11-000002534")).toBe(false);
    expect(esCeroDeFactura("")).toBe(false);
    expect(esCeroDeFactura(null)).toBe(false);
  });

  it("de una lista mixta se cae SOLO el 0000", () => {
    expect(facturasParaElPapel("0000, 2534")).toBe("2534");
    expect(facturasParaElPapel("2534, 0000, 2540")).toBe("2534, 2540");
    expect(facturasParaElPapel("0000")).toBe("");
    expect(facturasParaElPapel("Traslado")).toBe("Traslado");
    expect(facturasParaElPapel("Factura 0000")).toBe("Factura 0000");
    // Y lo demás sale EXACTAMENTE como antes: el largo de Switch, corto.
    expect(facturasParaElPapel("11-000002534, 11-000002540")).toBe("2534, 2540");
    expect(facturasParaElPapel("23589")).toBe("23589");
    expect(facturasParaElPapel("")).toBe("");
  });
});
