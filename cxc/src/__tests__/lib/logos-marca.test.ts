/**
 * Candado de los logos de marca (Joybees / Tommy).
 *
 * Los base64 viajan DENTRO de cada PDF generado y los PNG de public/ son los
 * que cargan los correos (Gmail bloquea base64 y SVG en <img>). Si alguno se
 * vacía, deja de ser PNG o pierde la transparencia, el logo desaparece o sale
 * como un rectángulo blanco sobre las bandas oscuras — y `doc.addImage` va
 * dentro de un try/catch, así que NADIE se entera en runtime.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  JOYBEES_LOGO_BASE64,
  JOYBEES_LOGO_BLANCO_BASE64,
  JOYBEES_LOGO_WIDTH,
  JOYBEES_LOGO_HEIGHT,
} from "@/lib/joybees-logo";
import {
  TOMMY_LOGO_BASE64,
  TOMMY_LOGO_BLANCO_BASE64,
  TOMMY_LOGO_WIDTH,
  TOMMY_LOGO_HEIGHT,
} from "@/lib/tommy-logo";
import {
  CALVIN_LOGO_BASE64,
  CALVIN_LOGO_BLANCO_BASE64,
  CALVIN_LOGO_WIDTH,
  CALVIN_LOGO_HEIGHT,
} from "@/lib/calvin-logo";
import { REEBOK_LOGO_BASE64 } from "@/lib/reebok-logo";

const ROOT = process.cwd();
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function decodeDataUrl(dataUrl: string): Buffer {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  expect(m, "el dataURL debe ser PNG base64 sin espacios ni saltos").not.toBeNull();
  return Buffer.from(m![1], "base64");
}

/** Lee ancho/alto/colorType/bitDepth del IHDR y si trae tRNS (transparencia). */
function readPng(buf: Buffer) {
  expect(buf.subarray(0, 8).equals(PNG_SIG), "firma PNG").toBe(true);
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    bitDepth: buf[24],
    colorType: buf[25],
    hasTrns: buf.includes(Buffer.from("tRNS", "latin1")),
    bytes: buf.length,
  };
}

const BASE64_LOGOS: Array<[string, string]> = [
  ["JOYBEES_LOGO_BASE64", JOYBEES_LOGO_BASE64],
  ["JOYBEES_LOGO_BLANCO_BASE64", JOYBEES_LOGO_BLANCO_BASE64],
  ["TOMMY_LOGO_BASE64", TOMMY_LOGO_BASE64],
  ["TOMMY_LOGO_BLANCO_BASE64", TOMMY_LOGO_BLANCO_BASE64],
  ["CALVIN_LOGO_BASE64", CALVIN_LOGO_BASE64],
  ["CALVIN_LOGO_BLANCO_BASE64", CALVIN_LOGO_BLANCO_BASE64],
  ["REEBOK_LOGO_BASE64", REEBOK_LOGO_BASE64],
];

describe("logos de marca — base64 para jsPDF", () => {
  it.each(BASE64_LOGOS)("%s es un PNG válido y no vacío", (_name, dataUrl) => {
    const png = readPng(decodeDataUrl(dataUrl));
    expect(png.width).toBeGreaterThan(50);
    expect(png.height).toBeGreaterThan(10);
    expect(png.bytes).toBeGreaterThan(1000);
  });

  it.each(BASE64_LOGOS)("%s pesa poco: viaja en CADA PDF", (_name, dataUrl) => {
    // 30 KB del dataURL completo (4/3 del PNG) es el techo acordado.
    expect(dataUrl.length).toBeLessThan(30 * 1024);
  });

  it("los dos logos Joybees tienen canal alfa (nada de fondo blanco)", () => {
    for (const dataUrl of [JOYBEES_LOGO_BASE64, JOYBEES_LOGO_BLANCO_BASE64]) {
      const png = readPng(decodeDataUrl(dataUrl));
      // colorType 6 = RGBA, 4 = gris+alfa, 3 = paleta (alfa vía tRNS).
      const conAlfa = png.colorType === 6 || png.colorType === 4 || (png.colorType === 3 && png.hasTrns);
      expect(conAlfa, `colorType ${png.colorType} sin transparencia`).toBe(true);
    }
  });

  it("JOYBEES_LOGO_WIDTH/HEIGHT respetan la proporción real del PNG", () => {
    const png = readPng(decodeDataUrl(JOYBEES_LOGO_BASE64));
    const aspectoReal = png.width / png.height;
    const aspectoMm = JOYBEES_LOGO_WIDTH / JOYBEES_LOGO_HEIGHT;
    expect(Math.abs(aspectoReal - aspectoMm)).toBeLessThan(0.15);
  });

  it("los dos logos Calvin tienen canal alfa (nada de fondo blanco)", () => {
    for (const dataUrl of [CALVIN_LOGO_BASE64, CALVIN_LOGO_BLANCO_BASE64]) {
      const png = readPng(decodeDataUrl(dataUrl));
      const conAlfa = png.colorType === 6 || png.colorType === 4 || (png.colorType === 3 && png.hasTrns);
      expect(conAlfa, `colorType ${png.colorType} sin transparencia`).toBe(true);
    }
  });

  it("los dos logos Tommy tienen canal alfa (nada de fondo blanco)", () => {
    for (const dataUrl of [TOMMY_LOGO_BASE64, TOMMY_LOGO_BLANCO_BASE64]) {
      const png = readPng(decodeDataUrl(dataUrl));
      const conAlfa = png.colorType === 6 || png.colorType === 4 || (png.colorType === 3 && png.hasTrns);
      expect(conAlfa, `colorType ${png.colorType} sin transparencia`).toBe(true);
    }
  });

  /**
   * 🩸 Tommy era la ÚNICA marca sin este chequeo, y por eso nadie vio que sus
   * constantes decían 55 x 3.8 ("aspecto ~14.6:1") mientras el PNG embebido
   * medía 17.72. jsPDF ESTIRA la imagen a la caja que se le da, así que el
   * wordmark salía ~21% más alto de lo que corresponde en TODOS los PDF de
   * pedido — sin error, sin log, sin nadie enterándose.
   */
  it("TOMMY_LOGO_WIDTH/HEIGHT respetan la proporción real del PNG", () => {
    const png = readPng(decodeDataUrl(TOMMY_LOGO_BASE64));
    const aspectoReal = png.width / png.height;
    const aspectoMm = TOMMY_LOGO_WIDTH / TOMMY_LOGO_HEIGHT;
    // Relativo, no absoluto: con aspectos de 17:1 un margen fijo de 0.15 sería
    // 10× más estricto que el que se le pide a Joybees (6:1). 2% de la medida.
    expect(Math.abs(aspectoReal - aspectoMm) / aspectoReal).toBeLessThan(0.02);
  });

  it("CALVIN_LOGO_WIDTH/HEIGHT respetan la proporción real del PNG", () => {
    const png = readPng(decodeDataUrl(CALVIN_LOGO_BASE64));
    const aspectoReal = png.width / png.height;
    const aspectoMm = CALVIN_LOGO_WIDTH / CALVIN_LOGO_HEIGHT;
    expect(Math.abs(aspectoReal - aspectoMm)).toBeLessThan(0.15);
  });
});

describe("logos de marca — PNG hosteados para correos", () => {
  const HOSTEADOS = [
    "public/joybees/joybees-logo.png",
    "public/joybees/joybees-logo-blanco.png",
    "public/tommy/tommy-horizontal.png",
    "public/tommy/tommy-horizontal-blanco.png",
    "public/calvin/calvin-wordmark.png",
    "public/calvin/calvin-wordmark-blanco.png",
    "public/reebok/reebok-logo.png",
  ];

  it.each(HOSTEADOS)("%s existe, es PNG y tiene transparencia", (rel) => {
    const buf = fs.readFileSync(path.join(ROOT, rel));
    const png = readPng(buf);
    expect(png.bytes).toBeGreaterThan(1000);
    const conAlfa = png.colorType === 6 || png.colorType === 4 || (png.colorType === 3 && png.hasTrns);
    expect(conAlfa, `${rel}: colorType ${png.colorType} sin transparencia`).toBe(true);
  });

  it("los correos de pedido apuntan a PNG hosteados (Gmail bloquea SVG y base64)", () => {
    const src = fs.readFileSync(path.join(ROOT, "src/lib/catalogo/marcas.ts"), "utf8");
    const urls = [...src.matchAll(/<img src="(https:\/\/[^"]+)"/g)].map((m) => m[1]);
    expect(urls).toContain("https://fashiongr.com/reebok/reebok-logo.png");
    expect(urls).toContain("https://fashiongr.com/joybees/joybees-logo-blanco.png");
    expect(urls).toContain("https://fashiongr.com/tommy/tommy-horizontal-blanco.png");
    expect(urls).toContain("https://fashiongr.com/calvin/calvin-wordmark-blanco.png");
    for (const u of urls) {
      expect(u.endsWith(".png") || u.endsWith(".jpg"), `${u} no es un raster`).toBe(true);
      // El archivo tiene que existir en public/, si no el correo sale con la
      // imagen rota (nadie prueba los correos en cada deploy).
      const rel = u.replace("https://fashiongr.com/", "public/");
      expect(fs.existsSync(path.join(ROOT, rel)), `falta ${rel}`).toBe(true);
    }
  });

  /**
   * El PNG hosteado (correos, header) y el base64 embebido (PDF) salen del MISMO
   * generador, así que tienen que ser el MISMO archivo byte a byte. El riesgo
   * real es humano: regenerar los assets y olvidarse de pegar el base64 nuevo en
   * el .ts — y entonces el correo enseña un logo y el PDF adjunto otro, sin que
   * nada falle. Se verifica en las dos marcas cuyos assets se generan así.
   */
  it("el PNG hosteado y el base64 del PDF son el MISMO archivo (Tommy y Calvin)", () => {
    const pares: [string, string, string][] = [
      ["Tommy", "public/tommy/tommy-horizontal.png", TOMMY_LOGO_BASE64],
      ["Tommy blanco", "public/tommy/tommy-horizontal-blanco.png", TOMMY_LOGO_BLANCO_BASE64],
      ["Calvin", "public/calvin/calvin-wordmark.png", CALVIN_LOGO_BASE64],
      ["Calvin blanco", "public/calvin/calvin-wordmark-blanco.png", CALVIN_LOGO_BLANCO_BASE64],
    ];
    for (const [nombre, rel, dataUrl] of pares) {
      const enDisco = fs.readFileSync(path.join(ROOT, rel));
      expect(decodeDataUrl(dataUrl).equals(enDisco), `${nombre}: el .ts y ${rel} no coinciden`).toBe(true);
    }
  });

  it("no quedó ningún SVG de Tommy: el master de la marca es la única fuente", () => {
    // El wordmark salía de un trazado (public/tommy/tommy-horizontal.svg) que
    // NO era el arte oficial — aspecto 17.64 contra 17.31 y otro interletrado.
    // Se eliminó en el mismo PR que integró el master (12-ago-2026).
    expect(fs.existsSync(path.join(ROOT, "public/tommy/tommy-horizontal.svg"))).toBe(false);
    const ui = fs.readFileSync(path.join(ROOT, "src/lib/catalogo/marcas-ui.tsx"), "utf8");
    expect(ui).not.toContain("tommy-horizontal.svg");
  });

  it("el catálogo público de Joybees usa el logo real, no el emoji", () => {
    const src = fs.readFileSync(path.join(ROOT, "src/lib/catalogo/marcas-ui.tsx"), "utf8");
    const joybees = src.slice(src.indexOf("const JOYBEES: MarcaTheme"), src.indexOf("const TOMMY: MarcaTheme"));
    const logos = joybees.slice(joybees.indexOf("logos: {"), joybees.indexOf("navbar: {"));
    expect(logos).not.toContain("🐝");
    expect(logos.match(/\/joybees\/joybees-logo\.png/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
