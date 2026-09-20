// ─────────────────────────────────────────────────────────────────────────────
// 🔴 EL LOGO DE TOMMY SE LEE (20-sep-2026). Daniel: *«veo que el logo de TH no
// está bien»*.
//
// 🩸 QUÉ LE PASABA, MEDIDO PÍXEL A PÍXEL. El defecto está en la versión BLANCA
// del wordmark (`public/tommy/tommy-horizontal-blanco.png`): la **banderita**
// que va entre TOMMY y HILFIGER sale INVERTIDA.
//
// Comparando los dos PNG (900×52 los dos), dentro del recuadro de la bandera
// (x 389-466):
//   · el de COLOR   → 4.004 píxeles opacos: 1.105 blancos + navy + rojo
//   · el BLANCO     → 3.051 píxeles opacos, TODOS blancos
// O sea: las **953 franjas blancas de la bandera quedaron transparentes** y lo
// navy y lo rojo quedaron blancos. Sobre la banda navy del papel eso se lee al
// revés — un bloque blanco con muescas donde iban las franjas.
//
// LA CAUSA está escrita en `scripts/_generar-logo-tommy.mjs`: el alfa se deriva
// de la OSCURIDAD del píxel (`alpha = (255 − min(r,g,b)) / 128`), así que todo
// lo blanco del arte original se vuelve transparente. Con un wordmark monocromo
// —Calvin— esa regla funciona; con una bandera de tres colores, no. Tommy es la
// única de las cuatro marcas con bandera, y por eso es la única rota.
//
// EL ARREGLO NO INVENTA UN ARCHIVO: se usa el wordmark OFICIAL de COLOR sobre
// una PLACA BLANCA, que es exactamente lo que ya hace la pantalla del pedido
// público (`marcas-ui.tsx` → `pedidoPublico`, 25-jul-2026). Mismo arte, mismo
// patrón, cero arte nuevo.
//
// 🔴 LO QUE SIGUE PENDIENTE DE DANIEL: una versión BLANCA correcta pide el
// master REVERSADO de Tommy Hilfiger (el que la marca publica para fondos
// oscuros). Ninguna regla automática sobre el arte de color puede inventar el
// contorno que la bandera necesita, así que **no se genera**: se pide.
//
// ⚠️ De paso se corrigió el APLASTADO del correo: el PNG es 900×52 (17,31:1) y
// se dibujaba en `160×9` (17,78:1), un **2,6 % más bajo** de lo que corresponde.
// Tommy era la única de las cuatro marcas que pasaba el 2 % (Reebok −0,1 %,
// Joybees y Calvin +0,44 %). Ahora va `156×9` (17,33:1).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { TOMMY_LOGO_BASE64, TOMMY_LOGO_WIDTH, TOMMY_LOGO_HEIGHT } from "@/lib/tommy-logo";

const RAIZ = process.cwd();
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n").map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1")).join("\n");
const plano = (rel: string) => sinComentarios(fs.readFileSync(path.join(RAIZ, rel), "utf8"));

const PDF = "src/lib/catalogo/order-pdf-core.ts";
const CORREOS = "src/lib/catalogo/marcas.ts";
const PANTALLA = "src/lib/catalogo/marcas-ui.tsx";

/** El bloque del header de Tommy dentro del generador del PDF. */
function headerTommy(): string {
  const src = plano(PDF);
  const desde = src.indexOf('} else if (marca === "tommy") {');
  expect(desde, "se movió el header de Tommy").toBeGreaterThan(-1);
  return src.slice(desde, src.indexOf('} else if (marca === "calvin") {', desde));
}

// ─────────────────────────────────────────────────────────────────────────────
// 1 · El PDF del pedido
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 1 · el PDF lleva el wordmark de COLOR sobre placa blanca", () => {
  const header = headerTommy();

  it("🩸 dejó de usar la versión blanca, la de la bandera rota", () => {
    expect(header, "volvió el wordmark blanco al PDF").not.toContain("TOMMY_LOGO_BLANCO_BASE64");
    expect(plano(PDF), "el import del blanco volvió al PDF").not.toContain("TOMMY_LOGO_BLANCO_BASE64");
  });

  it("dibuja el arte oficial de color", () => {
    expect(header).toContain("TOMMY_LOGO_BASE64");
  });

  it("🔴 …sobre una PLACA BLANCA, o el navy se comería el navy del wordmark", () => {
    expect(header).toContain("doc.setFillColor(255, 255, 255)");
    expect(header).toContain("roundedRect");
    // Y la banda navy de la marca no se tocó.
    expect(header).toContain("doc.setFillColor(21, 35, 66)");
  });

  it("⚠️ la placa es MÁS GRANDE que el logo: si no, no es una placa", () => {
    expect(header).toContain("TOMMY_LOGO_WIDTH + 4");
    expect(header).toContain("TOMMY_LOGO_HEIGHT + 3.6");
  });

  it("⚠️ y el tamaño del logo no se movió: sigue respetando la proporción real", () => {
    const png = Buffer.from(TOMMY_LOGO_BASE64.split(",")[1], "base64");
    // Cabecera IHDR del PNG: ancho y alto en píxeles.
    const w = png.readUInt32BE(16);
    const h = png.readUInt32BE(20);
    expect([w, h]).toEqual([900, 52]);
    expect(TOMMY_LOGO_WIDTH / TOMMY_LOGO_HEIGHT).toBeCloseTo(w / h, 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2 · Los dos correos
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 2 · los dos correos de Tommy, igual", () => {
  const src = plano(CORREOS);
  // El bloque de Tommy dentro del mapa de marcas, entre su llave y la siguiente.
  const tommy = src.slice(src.indexOf("\n  tommy: {"), src.indexOf("\n  calvin: {"));

  it("🩸 ya no apuntan al PNG blanco de la bandera rota", () => {
    expect(src, "volvió el PNG blanco a los correos").not.toContain("tommy-horizontal-blanco.png");
  });

  it("apuntan al wordmark de color, hosteado (Gmail bloquea base64)", () => {
    const usos = [...tommy.matchAll(/https:\/\/fashiongr\.com\/tommy\/tommy-horizontal\.png/g)];
    // Uno en el correo interno y otro en el del cliente.
    expect(usos).toHaveLength(2);
  });

  it("🔴 …sobre placa blanca, dentro de la banda navy", () => {
    const placas = [...tommy.matchAll(/background:#ffffff;border-radius:6px/g)];
    expect(placas).toHaveLength(2);
    expect(tommy).toContain("background:#152342");
  });

  it("🩸 y deja de salir APLASTADO: 156×9, no 160×9", () => {
    expect(tommy, "volvió el 160×9 aplastado").not.toContain('width="160" height="9"');
    const medidas = [...tommy.matchAll(/width="156" height="9"/g)];
    expect(medidas).toHaveLength(2);
    // La proporción dibujada contra la real del PNG (900/52 = 17,31): < 2 %.
    const real = 900 / 52;
    expect(Math.abs(156 / 9 - real) / real).toBeLessThan(0.02);
    // Y el 160×9 que había se pasaba del 2 %: es el defecto que se midió.
    expect(Math.abs(160 / 9 - real) / real).toBeGreaterThan(0.02);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3 · El patrón ya existía, y lo que queda pendiente
// ─────────────────────────────────────────────────────────────────────────────

describe("🔑 3 · no se inventó nada: es el patrón del pedido público", () => {
  it("la pantalla del pedido público ya dibujaba el color sobre placa blanca", () => {
    const src = plano(PANTALLA);
    const bloque = src.slice(src.indexOf("pedidoPublico: () =>"));
    expect(bloque).toContain("/tommy/tommy-horizontal.png");
    expect(bloque).toContain("bg-white");
  });

  it("⚠️ el PNG blanco NO se borra: sigue en public/ y en el módulo, rotulado", () => {
    // Patrón `mayor_lineas`: el archivo se queda hasta que llegue el master
    // reversado de la marca. Borrarlo obligaría a inventar uno.
    expect(fs.existsSync(path.join(RAIZ, "public/tommy/tommy-horizontal-blanco.png"))).toBe(true);
    expect(plano("src/lib/tommy-logo.ts")).toContain("TOMMY_LOGO_BLANCO_BASE64");
  });

  it("🔴 y no se generó un blanco nuevo con la regla que rompe la bandera", () => {
    // `alpha = oscuridad` borra las franjas BLANCAS. Mientras esa regla siga
    // ahí, ninguna superficie puede volver a consumir su salida.
    const script = plano("scripts/_generar-logo-tommy.mjs");
    expect(script).toContain("oscuridad");
    for (const rel of [PDF, CORREOS]) {
      expect(plano(rel), `${rel} volvió a consumir el blanco generado`)
        .not.toContain("tommy-horizontal-blanco");
    }
  });
});
