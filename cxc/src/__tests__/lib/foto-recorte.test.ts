// ─────────────────────────────────────────────────────────────────────────────
// Auto-recorte de fotos de producto (foto-recorte.ts): detección de la caja
// sobre fondo con DEGRADADO (el caso real del banco B2B de PVH que detectarBBox
// no podía resolver), las guardas del fail-open y el plan de encuadre.
//
// Las imágenes son SINTÉTICAS (píxel a píxel), como en fotos-b2b.test.ts: lo
// que se verifica es la MATEMÁTICA, sin canvas ni archivos.
//
// Incluye el candado que más importa: el fallo del recorte NUNCA frena una
// subida — recortarEnCanvas devuelve null ante cualquier error y compress()
// devuelve el archivo original.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  medirRecorte,
  detectarCajaProducto,
  rugosidadBorde,
  rangoBorde,
  fondoBorde,
  escalarCaja,
  planRecorte,
  MIN_LADO_ORIGINAL,
  RUGOSIDAD_BORDE_MAX,
  TOLERANCIA_FONDO,
  OCUPACION_YA_ENCUADRADA,
  OCUPACION_REPROCESO,
  MARGEN_PRODUCTO,
  LADO_MAX_SALIDA,
} from "@/lib/catalogos/foto-recorte";
import type { RgbaImage } from "@/lib/catalogos/fotos-b2b";

// ── Helpers de imágenes sintéticas ───────────────────────────────────────────

function lienzo(w: number, h: number, rgb: [number, number, number]): RgbaImage {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = rgb[0];
    data[i * 4 + 1] = rgb[1];
    data[i * 4 + 2] = rgb[2];
    data[i * 4 + 3] = 255;
  }
  return { width: w, height: h, data };
}

/** Fondo de estudio con DEGRADADO vertical (el caso real de PVH). */
function lienzoDegradado(w: number, h: number, de: number, a: number): RgbaImage {
  const img = lienzo(w, h, [de, de, de]);
  for (let y = 0; y < h; y++) {
    const v = Math.round(de + ((a - de) * y) / (h - 1));
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
    }
  }
  return img;
}

function pintar(img: RgbaImage, x0: number, y0: number, w: number, h: number, rgb: [number, number, number]) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const i = (y * img.width + x) * 4;
      img.data[i] = rgb[0];
      img.data[i + 1] = rgb[1];
      img.data[i + 2] = rgb[2];
    }
  }
}

/** Fondo ruidoso (escena/local): valor pseudo-aleatorio por píxel. */
function lienzoRuidoso(w: number, h: number): RgbaImage {
  const img = lienzo(w, h, [0, 0, 0]);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = (x * 97 + y * 131) % 255;
      const i = (y * w + x) * 4;
      img.data[i] = v;
      img.data[i + 1] = (v * 2 + 60) % 255;
      img.data[i + 2] = (v * 3 + 120) % 255;
    }
  }
  return img;
}

/** El caso de Daniel: producto chico y descentrado ABAJO sobre degradado. */
function fotoBancoPvh(): RgbaImage {
  // 240×320 ≈ la copia de medición de una foto 1364×1819.
  const img = lienzoDegradado(240, 320, 120, 175);
  pintar(img, 50, 250, 140, 45, [235, 230, 220]); // sandalia crema, cuarto de abajo
  return img;
}

// ── Detección de la caja con fondo por fila ──────────────────────────────────

describe("detectarCajaProducto", () => {
  it("encuentra el producto sobre fondo con degradado vertical (el caso que rompía detectarBBox)", () => {
    const caja = detectarCajaProducto(fotoBancoPvh());
    expect(caja).not.toBeNull();
    // La caja es EXACTAMENTE el rectángulo pintado.
    expect(caja).toEqual({ x: 50, y: 250, w: 140, h: 45 });
  });

  it("encuentra el producto sobre fondo plano (no se pierde el caso fácil)", () => {
    const img = lienzo(300, 300, [245, 245, 245]);
    pintar(img, 100, 120, 80, 60, [30, 40, 90]);
    expect(detectarCajaProducto(img)).toEqual({ x: 100, y: 120, w: 80, h: 60 });
  });

  it("tolera un degradado HORIZONTAL (el fondo se interpola a lo ancho)", () => {
    const img = lienzo(300, 200, [0, 0, 0]);
    for (let x = 0; x < 300; x++) {
      const v = Math.round(110 + (60 * x) / 299);
      for (let y = 0; y < 200; y++) {
        const i = (y * 300 + x) * 4;
        img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v;
      }
    }
    pintar(img, 120, 80, 60, 40, [250, 245, 235]);
    expect(detectarCajaProducto(img)).toEqual({ x: 120, y: 80, w: 60, h: 40 });
  });

  it("imagen de un solo color → null (nunca una caja inventada)", () => {
    expect(detectarCajaProducto(lienzo(200, 200, [180, 180, 180]))).toBeNull();
  });
});

// ── Métricas del borde ───────────────────────────────────────────────────────

describe("rugosidad y rango del borde", () => {
  it("un degradado suave tiene rugosidad casi nula (fondos de estudio reales: <1)", () => {
    expect(rugosidadBorde(lienzoDegradado(240, 320, 120, 175))).toBeLessThan(1);
  });

  it("una escena ruidosa supera el umbral por mucho", () => {
    expect(rugosidadBorde(lienzoRuidoso(240, 320))).toBeGreaterThan(RUGOSIDAD_BORDE_MAX * 3);
  });

  it("el rango del degradado es el tramo del degradado", () => {
    const r = rangoBorde(lienzoDegradado(240, 320, 120, 175));
    expect(r).toBeGreaterThan(45);
    expect(r).toBeLessThan(60);
  });

  it("fondoBorde devuelve el color del anillo (para el relleno)", () => {
    const [r, g, b] = fondoBorde(lienzo(200, 200, [140, 150, 160]));
    expect([r, g, b]).toEqual([140, 150, 160]);
  });
});

// ── medirRecorte: las guardas del fail-open ──────────────────────────────────

describe("medirRecorte — guardas (ante la duda, NO se toca la foto)", () => {
  it("recorta el caso real: producto abajo sobre degradado, ocupación ~8%", () => {
    const med = medirRecorte(fotoBancoPvh(), 1364, 1819);
    expect(med.ok).toBe(true);
    expect(med.caja).toEqual({ x: 50, y: 250, w: 140, h: 45 });
    expect(med.ocupacionArea!).toBeLessThan(OCUPACION_REPROCESO); // candidata al re-proceso
    expect(med.fondo).toBeDefined();
  });

  it("recorta el producto centrado sobre fondo plano", () => {
    const img = lienzo(300, 300, [245, 245, 245]);
    pintar(img, 100, 120, 80, 60, [30, 40, 90]);
    const med = medirRecorte(img, 1200, 1200);
    expect(med.ok).toBe(true);
    expect(med.caja).toEqual({ x: 100, y: 120, w: 80, h: 60 });
  });

  it("imagen chica → muy-chica, no se toca", () => {
    const med = medirRecorte(fotoBancoPvh(), MIN_LADO_ORIGINAL - 1, 1819);
    expect(med).toEqual({ ok: false, motivo: "muy-chica" });
  });

  it("fondo ruidoso (foto de local/escena) → fondo-no-uniforme, no se toca", () => {
    const med = medirRecorte(lienzoRuidoso(240, 320), 1364, 1819);
    expect(med.ok).toBe(false);
    expect(med.motivo).toBe("fondo-no-uniforme");
  });

  it("producto que toca los 4 bordes → toca-bordes, no se toca", () => {
    // Rombo que toca el punto medio de cada borde (las esquinas quedan fondo).
    const img = lienzo(200, 200, [240, 240, 240]);
    for (let y = 0; y < 200; y++) {
      for (let x = 0; x < 200; x++) {
        if (Math.abs(x - 100) / 100 + Math.abs(y - 100) / 100 <= 1) {
          const i = (y * 200 + x) * 4;
          img.data[i] = 20; img.data[i + 1] = 20; img.data[i + 2] = 60;
        }
      }
    }
    const med = medirRecorte(img, 1200, 1200);
    expect(med.ok).toBe(false);
    expect(med.motivo).toBe("toca-bordes");
  });

  it("producto que ya ocupa casi todo → ya-encuadrada, no se re-encodea", () => {
    const img = lienzo(200, 200, [245, 245, 245]);
    const lado = Math.ceil(200 * OCUPACION_YA_ENCUADRADA) + 2;
    const off = Math.floor((200 - lado) / 2);
    pintar(img, off, off, lado, lado, [30, 40, 90]);
    const med = medirRecorte(img, 1200, 1200);
    expect(med.ok).toBe(false);
    expect(med.motivo).toBe("ya-encuadrada");
  });

  it("imagen sin producto distinguible → sin-producto", () => {
    const med = medirRecorte(lienzo(240, 320, [200, 200, 200]), 1364, 1819);
    expect(med).toEqual({ ok: false, motivo: "sin-producto" });
  });

  it("producto casi del color del fondo (bajo la tolerancia) → sin-producto", () => {
    const img = lienzo(240, 320, [200, 200, 200]);
    const v = 200 + TOLERANCIA_FONDO - 2; // difiere menos que la tolerancia
    pintar(img, 80, 100, 60, 60, [v, v, v]);
    const med = medirRecorte(img, 1364, 1819);
    expect(med.ok).toBe(false);
    expect(med.motivo).toBe("sin-producto");
  });
});

// ── Plan de encuadre ─────────────────────────────────────────────────────────

describe("planRecorte — margen parejo, sin distorsión, sin salirse", () => {
  it("margen parejo: el producto queda a MARGEN_PRODUCTO del lado mayor en los 4 lados", () => {
    const caja = { x: 300, y: 900, w: 500, h: 250 };
    const p = planRecorte(caja, 1400, 1800);
    const m = Math.round(MARGEN_PRODUCTO * 500);
    expect(p.destW).toBe(500 + 2 * m);
    expect(p.destH).toBe(250 + 2 * m);
    // Todo el rectángulo cae dentro de la foto → se dibuja completo, sin relleno.
    expect([p.dx, p.dy]).toEqual([0, 0]);
    expect(p.srcX).toBe(300 - m);
    expect(p.srcY).toBe(900 - m);
  });

  it("no distorsiona: una sola escala para ancho y alto (caja horizontal Y vertical)", () => {
    for (const caja of [
      { x: 0, y: 0, w: 2000, h: 1000 }, // más ancha que alta
      { x: 0, y: 0, w: 1000, h: 2000 }, // más alta que ancha — el techo manda por el ALTO
    ]) {
      const p = planRecorte(caja, 2400, 2400);
      // Con techo 1600, la escala es la misma en los dos ejes…
      expect(p.dw / p.srcW).toBeCloseTo(p.dh / p.srcH, 2);
      // …y NINGÚN lado se pasa del techo (mirar solo el ancho dejaría salir
      // lienzos de 2320px de alto).
      expect(Math.max(p.destW, p.destH)).toBeLessThanOrEqual(LADO_MAX_SALIDA);
    }
  });

  it("nunca agranda: escala ≤ 1 cuando el rectángulo cabe en el techo", () => {
    const caja = { x: 100, y: 100, w: 300, h: 200 };
    const p = planRecorte(caja, 1000, 1000);
    expect(p.dw).toBe(p.srcW);
    expect(p.dh).toBe(p.srcH);
  });

  it("producto pegado a un borde: la fuente se recorta al límite y el faltante queda para relleno", () => {
    const caja = { x: 10, y: 940, w: 200, h: 50 };
    const p = planRecorte(caja, 1000, 1000);
    const m = Math.round(MARGEN_PRODUCTO * 200);
    expect(p.destH).toBe(50 + 2 * m);
    expect(p.srcY).toBe(940 - m);
    expect(p.srcY + p.srcH).toBe(1000); // no se sale de la foto
    expect(p.dy).toBe(0);
    expect(p.dh).toBeLessThan(p.destH); // lo que falta abajo se rellena con fondo
  });

  it("escalarCaja reescala de la copia medida al bitmap original sin salirse", () => {
    expect(escalarCaja({ x: 10, y: 20, w: 50, h: 40 }, 100, 100, 1000, 1000)).toEqual({
      x: 100,
      y: 200,
      w: 500,
      h: 400,
    });
    const c = escalarCaja({ x: 90, y: 90, w: 10, h: 10 }, 100, 100, 1000, 1000);
    expect(c.x + c.w).toBeLessThanOrEqual(1000);
    expect(c.y + c.h).toBeLessThanOrEqual(1000);
  });
});

// ── CANDADO: el fallo del recorte nunca frena la subida ─────────────────────

describe("candado fail-open (estático)", () => {
  const raiz = path.join(__dirname, "..", "..");

  it("recortarEnCanvas atrapa CUALQUIER excepción y devuelve null", () => {
    const src = fs.readFileSync(path.join(raiz, "lib/catalogos/foto-recorte.ts"), "utf8");
    const fn = src.slice(src.indexOf("export function recortarEnCanvas"));
    expect(fn).toMatch(/catch\s*\{\s*return null;?\s*\}/);
  });

  it("compress() de photoUpload usa el recorte DENTRO de su try y devuelve el archivo original si algo falla", () => {
    const src = fs.readFileSync(
      path.join(raiz, "app/catalogos/admin/[marca]/photoUpload.ts"),
      "utf8",
    );
    // El recorte está cableado…
    expect(src).toContain("recortarEnCanvas(src, w, h)");
    // …dentro de una función cuyo catch devuelve el archivo original.
    const fn = src.slice(src.indexOf("async function compress"));
    expect(fn).toMatch(/catch\s*\{\s*return file;?\s*\}/);
    // Y null NO bloquea: se sigue con el camino de siempre (resize).
    expect(fn).toContain("MAX_DIMENSION / longest");
  });

  it("una foto NO recortada sigue pasando por la compresión de SIEMPRE (nada de salidas tempranas)", () => {
    // El fail-open no es solo "no revientes": una foto que el detector prefirió
    // no tocar tiene que seguir achicándose a 1600 como antes. Un `return file`
    // metido entre el recorte y el resize se ve inofensivo (sube la original)
    // y en realidad sube fotos de 5 MB sin comprimir a todo el catálogo.
    const src = fs.readFileSync(
      path.join(raiz, "app/catalogos/admin/[marca]/photoUpload.ts"),
      "utf8",
    );
    const fn = src.slice(src.indexOf("async function compress"));
    const cuerpo = fn.slice(0, fn.indexOf("\n}\n"));
    const iRecorte = cuerpo.indexOf("recortarEnCanvas(src, w, h)");
    const iResize = cuerpo.indexOf("MAX_DIMENSION / longest");
    expect(iRecorte).toBeGreaterThan(-1);
    // El resize vive DESPUÉS del recorte y es ALCANZABLE: nada devuelve antes.
    expect(iResize).toBeGreaterThan(iRecorte);
    expect(cuerpo.slice(iRecorte, iResize)).not.toMatch(/return\s+file/);
  });

  it("el ZIP del banco B2B cae al detector de siempre si la medición no es confiable", () => {
    const src = fs.readFileSync(path.join(raiz, "lib/catalogos/zip-b2b-client.ts"), "utf8");
    expect(src).toContain("med.ok && med.caja ? med.caja : detectarBBox(small, fondo)");
  });
});
