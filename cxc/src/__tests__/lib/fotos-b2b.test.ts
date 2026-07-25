// ─────────────────────────────────────────────────────────────────────────────
// Núcleo del banco de fotos B2B: parseo del nombre, match normalizado, detector
// de lifestyle, regla de elección con fallback y algoritmo de recorte.
//
// Las imágenes son SINTÉTICAS (se construyen píxel a píxel) para que el test
// corra sin canvas ni archivos: lo que se verifica es la MATEMÁTICA que decide
// qué foto se usa y cómo se encuadra.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  normalizarCodigo,
  normalizarSkuStorage,
  parseNombreArchivoB2B,
  scoreLifestyle,
  esLifestyle,
  elegirVistaDefault,
  colorFondo,
  detectarBBox,
  encuadrar,
  LIFESTYLE_VAR_TOP_UMBRAL,
  OCUPACION_PRODUCTO,
  type RgbaImage,
} from "@/lib/catalogos/fotos-b2b";

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

/** Foto de estudio: fondo plano + producto centrado. */
function fotoProducto(): RgbaImage {
  const img = lienzo(200, 200, [245, 245, 245]);
  pintar(img, 60, 70, 80, 60, [30, 40, 90]);
  return img;
}

/** Foto de modelo/escena: la banda superior tiene paisaje/ropa/sombras. */
function fotoLifestyle(seed: number): RgbaImage {
  const img = lienzo(200, 200, [120, 120, 120]);
  for (let y = 0; y < 200; y++) {
    for (let x = 0; x < 200; x++) {
      const v = ((x * 7 + y * 13 + seed * 31) % 255);
      const i = (y * 200 + x) * 4;
      img.data[i] = v;
      img.data[i + 1] = (v * 2) % 255;
      img.data[i + 2] = (v * 3 + 40) % 255;
    }
  }
  return img;
}

// ── Nombre de archivo y match ────────────────────────────────────────────────

describe("nombre de archivo del banco B2B", () => {
  it("parsea {ESTILO}_{COLOR}_{N}.jpg", () => {
    expect(parseNombreArchivoB2B("FM0FM05675_YBS_1.jpg")).toEqual({ codigo: "FM0FM05675YBS", vista: 1 });
    expect(parseNombreArchivoB2B("EM0EM01164_YBR_13.jpg")).toEqual({ codigo: "EM0EM01164YBR", vista: 13 });
  });

  it("tolera el espacio antes del número (caso real del banco)", () => {
    expect(parseNombreArchivoB2B("FM0FM05675_YBS_ 1.jpg")).toEqual({ codigo: "FM0FM05675YBS", vista: 1 });
  });

  it("tolera rutas dentro del ZIP, extensiones en mayúscula y guiones", () => {
    expect(parseNombreArchivoB2B("images/FM0FM05675_YBS_6.JPG")).toEqual({ codigo: "FM0FM05675YBS", vista: 6 });
    expect(parseNombreArchivoB2B("FM0FM05675-YBS-2.jpeg")).toEqual({ codigo: "FM0FM05675YBS", vista: 2 });
  });

  it("descarta lo que no es una foto del banco", () => {
    expect(parseNombreArchivoB2B("__MACOSX/._foo.jpg")).toBeNull();
    expect(parseNombreArchivoB2B("catalogo.pdf")).toBeNull();
    expect(parseNombreArchivoB2B("FM0FM05675_YBS.jpg")).toBeNull(); // sin vista
  });

  it("el código normalizado empareja el SKU con separadores de la DB", () => {
    // SKU real de tommy_products vs. nombre del archivo del banco.
    expect(normalizarCodigo("FM0FM04474-BDS")).toBe("FM0FM04474BDS");
    expect(parseNombreArchivoB2B("FM0FM04474_BDS_1.jpg")!.codigo).toBe(normalizarCodigo("FM0FM04474-BDS"));
  });

  it("el nombre en Storage es minúsculas sin separadores (convención ya viva en Tommy)", () => {
    expect(normalizarSkuStorage("FW0FW05034DW5")).toBe("fw0fw05034dw5");
    expect(normalizarSkuStorage("FM0FM04474-BDS")).toBe("fm0fm04474bds");
    expect(normalizarSkuStorage("PZ4PK.JOY.BCHD")).toBe("pz4pkjoybchd");
  });
});

// ── Detector de lifestyle ────────────────────────────────────────────────────

describe("detector de lifestyle", () => {
  it("una foto de estudio queda muy por debajo del umbral", () => {
    const s = scoreLifestyle(fotoProducto());
    expect(s).toBeLessThan(LIFESTYLE_VAR_TOP_UMBRAL);
    expect(esLifestyle(fotoProducto())).toBe(false);
  });

  it("las 6 fotos de escena del banco se detectan todas (cero falsos negativos)", () => {
    const seeds = [1, 2, 3, 4, 5, 6];
    for (const s of seeds) {
      const score = scoreLifestyle(fotoLifestyle(s));
      expect(score).toBeGreaterThan(LIFESTYLE_VAR_TOP_UMBRAL);
      expect(esLifestyle(fotoLifestyle(s))).toBe(true);
    }
  });

  it("un fondo perfectamente plano da score 0", () => {
    expect(scoreLifestyle(lienzo(120, 120, [255, 255, 255]))).toBe(0);
  });

  it("solo mira la banda superior: ruido ABAJO no marca lifestyle", () => {
    const img = lienzo(200, 200, [240, 240, 240]);
    // Ruido fuerte en la mitad inferior — el producto y su sombra.
    for (let y = 100; y < 200; y++) {
      for (let x = 0; x < 200; x++) {
        const i = (y * 200 + x) * 4;
        const v = (x * 11 + y * 17) % 255;
        img.data[i] = v;
        img.data[i + 1] = 255 - v;
        img.data[i + 2] = v;
      }
    }
    expect(esLifestyle(img)).toBe(false);
  });
});

// ── Regla de elección ────────────────────────────────────────────────────────

describe("elección de la vista por defecto", () => {
  const v = (vista: number, lifestyle = false) => ({ vista, lifestyle });

  it("prefiere la vista _1", () => {
    expect(elegirVistaDefault([v(3), v(1), v(6)])).toBe(1);
  });

  it("si _1 es lifestyle baja a _6", () => {
    expect(elegirVistaDefault([v(1, true), v(2), v(6)])).toBe(6);
  });

  it("respeta el orden completo 1 → 6 → 13 → 7 → 2 → 3 → 4", () => {
    expect(elegirVistaDefault([v(4), v(2), v(13), v(7), v(3)])).toBe(13);
    expect(elegirVistaDefault([v(4), v(2), v(7), v(3)])).toBe(7);
    expect(elegirVistaDefault([v(4), v(3), v(2)])).toBe(2);
    expect(elegirVistaDefault([v(4), v(3)])).toBe(3);
  });

  it("las vistas fuera de la lista van al final, ascendente", () => {
    expect(elegirVistaDefault([v(21), v(9), v(15)])).toBe(9);
  });

  it("salta TODAS las lifestyle en cadena", () => {
    expect(elegirVistaDefault([v(1, true), v(6, true), v(13, true), v(7), v(2)])).toBe(7);
  });

  it("si _1 no existe usa el siguiente del orden", () => {
    expect(elegirVistaDefault([v(2), v(6), v(3)])).toBe(6);
  });

  it("si TODAS son lifestyle → sin foto (null)", () => {
    expect(elegirVistaDefault([v(1, true), v(2, true), v(6, true)])).toBeNull();
  });

  it("sin variantes → null", () => {
    expect(elegirVistaDefault([])).toBeNull();
  });
});

// ── Recorte ──────────────────────────────────────────────────────────────────

describe("recorte: color de fondo y bounding box", () => {
  it("detecta el color de fondo desde las 4 esquinas", () => {
    expect(colorFondo(fotoProducto())).toEqual([245, 245, 245]);
  });

  it("la bbox encierra exactamente el producto", () => {
    const img = lienzo(200, 200, [245, 245, 245]);
    pintar(img, 60, 70, 80, 60, [30, 40, 90]);
    expect(detectarBBox(img)).toEqual({ x: 60, y: 70, w: 80, h: 60 });
  });

  it("ignora ruido por debajo de la tolerancia (JPEG banding del fondo)", () => {
    const img = lienzo(100, 100, [245, 245, 245]);
    pintar(img, 5, 5, 10, 10, [250, 250, 250]); // +5, dentro de tolerancia 12
    pintar(img, 40, 40, 20, 20, [10, 10, 10]);
    expect(detectarBBox(img)).toEqual({ x: 40, y: 40, w: 20, h: 20 });
  });

  it("imagen de un solo color → bbox completa, nunca vacía", () => {
    expect(detectarBBox(lienzo(50, 40, [200, 200, 200]))).toEqual({ x: 0, y: 0, w: 50, h: 40 });
  });
});

describe("recorte: encuadre 4:3 al 90%", () => {
  it("el lienzo es 4:3 con el lado mayor pedido", () => {
    const e = encuadrar({ x: 0, y: 0, w: 100, h: 100 }, 720);
    expect(e.destW).toBe(720);
    expect(e.destH).toBe(540);
  });

  it("no distorsiona: conserva la proporción del producto", () => {
    const e = encuadrar({ x: 0, y: 0, w: 200, h: 100 }, 720);
    expect(e.dw / e.dh).toBeCloseTo(2, 2);
  });

  it("el producto ocupa el 90% del lado que manda y queda centrado", () => {
    // Producto ancho → manda el ancho.
    const ancho = encuadrar({ x: 0, y: 0, w: 400, h: 100 }, 720);
    expect(ancho.dw).toBe(Math.round(720 * OCUPACION_PRODUCTO));
    expect(ancho.dx).toBe(Math.round((720 - ancho.dw) / 2));

    // Producto alto → manda el alto.
    const alto = encuadrar({ x: 0, y: 0, w: 100, h: 400 }, 720);
    expect(alto.dh).toBe(Math.round(540 * OCUPACION_PRODUCTO));
    expect(alto.dy).toBe(Math.round((540 - alto.dh) / 2));
  });

  it("NUNCA corta el producto: siempre cabe dentro del lienzo", () => {
    const casos = [
      { x: 0, y: 0, w: 1000, h: 20 },
      { x: 0, y: 0, w: 20, h: 1000 },
      { x: 0, y: 0, w: 3, h: 3 },
      { x: 0, y: 0, w: 1600, h: 1600 },
    ];
    for (const bbox of casos) {
      const e = encuadrar(bbox, 720);
      expect(e.dx).toBeGreaterThanOrEqual(0);
      expect(e.dy).toBeGreaterThanOrEqual(0);
      expect(e.dx + e.dw).toBeLessThanOrEqual(e.destW);
      expect(e.dy + e.dh).toBeLessThanOrEqual(e.destH);
    }
  });

  it("un producto diminuto se AGRANDA hasta el 90% (no queda perdido en el lienzo)", () => {
    const e = encuadrar({ x: 0, y: 0, w: 10, h: 10 }, 720);
    expect(e.dh).toBe(Math.round(540 * OCUPACION_PRODUCTO));
  });
});
