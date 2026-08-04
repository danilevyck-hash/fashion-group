// ─────────────────────────────────────────────────────────────────────────────
// El visor de fotos del catálogo tiene ZOOM, y tocar la foto la ACERCA.
//
// 🩸 POR QUÉ (4-ago-2026). Daniel, desde el iPad: *"¿cómo hago para hacer zoom a
// la foto del catálogo? aparte de apretar la imagen, quiero zoom al apretarla"*.
// Dos cosas se lo impedían:
//
//   1. El visor mostraba la foto con `object-contain` y nada más — del tamaño
//      de la pantalla, sin forma de acercarla.
//   2. **Tocar la foto la CERRABA.** El `onClick` de cerrar vivía en el fondo y
//      la imagen no frenaba la propagación: el gesto natural hacía lo contrario
//      de lo que uno espera.
//
// ⚠️ Y EL PELLIZCO DEL NAVEGADOR NO ERA OPCIÓN: `layout.tsx` declara
// `maximumScale: 1`, que en iOS apaga el zoom de la página. Está ahí a propósito
// (evita que iOS haga zoom solo al enfocar un input) y cambiarlo tocaría TODAS
// las pantallas por un problema de una. Por eso el zoom vive dentro del visor.
// Este test vigila las dos puntas: que el visor tenga zoom Y que nadie “arregle”
// el problema quitando el maximumScale global.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const leer = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
const visor = leer("src/components/catalogo/VisorFoto.tsx");
const card = leer("src/components/catalogo/CatalogoProductCard.tsx");
const grouped = leer("src/components/catalogo/CatalogoGroupedCard.tsx");
const layout = leer("src/app/layout.tsx");
const ficha = leer("src/components/catalogo/ProductoDetalleClient.tsx");

describe("🔴 tocar la foto la acerca; tocar afuera cierra", () => {
  // 🩸 SEGUNDO BUG, reportado por Daniel: *"no funciona lo de tocar el fondo
  // pero si la x"*. El primer intento puso `stopPropagation` en el contenedor
  // de gestos — que ocupa la pantalla ENTERA porque necesita captar el pellizco
  // en cualquier lado. Resultado: no quedaba ningún "fondo" que tocar, se
  // tragaba todos los toques y solo servía la ×. La distinción no puede ser por
  // elemento; tiene que ser por POSICIÓN.
  it("decide por la POSICIÓN del toque, no por el elemento", () => {
    expect(visor).toContain("const tocoLaFoto");
    expect(visor).toContain("imgRef.current?.getBoundingClientRect()");
  });

  it("un toque fuera de la foto cierra", () => {
    expect(visor).toContain("else cerrar();");
    expect(visor).toContain("if (!tocoLaFoto(e.clientX, e.clientY)) cerrar();");
  });

  it("ya NO hay un stopPropagation que se trague todo", () => {
    expect(visor).not.toContain("onClick={(e) => e.stopPropagation()}");
  });

  it("un toque limpio alterna el zoom", () => {
    expect(visor).toContain("alternarZoom");
    expect(visor).toContain("if (!g.movio &&");
  });

  it("acerca centrado en DONDE se tocó, no al centro de la pantalla", () => {
    expect(visor).toContain("clientX - (caja.left + caja.width / 2)");
  });

  it("tolera el micro-movimiento del dedo (si no, ningún toque contaría)", () => {
    expect(visor).toMatch(/Math\.abs\(dx\) > 6 \|\| Math\.abs\(dy\) > 6/);
  });
});

describe("🔴 pellizcar y arrastrar", () => {
  it("hay pellizco con dos dedos", () => {
    expect(visor).toContain("e.touches.length === 2");
    expect(visor).toContain("Math.hypot");
  });

  it("el zoom tiene tope, no se va al infinito", () => {
    expect(visor).toContain("ZOOM_MAX = 5");
    expect(visor).toContain("Math.min(ZOOM_MAX, Math.max(ZOOM_MIN,");
  });

  it("se puede arrastrar SOLO cuando está acercada", () => {
    expect(visor).toContain("g.arrastrando = escala > 1");
  });

  it("al volver a 1× la foto se recentra sola", () => {
    expect(visor).toContain("if (nueva === 1) setPos({ x: 0, y: 0 })");
  });

  it("touchAction none: el navegador no roba el gesto", () => {
    expect(visor).toContain('touchAction: "none"');
  });
});

describe("⚠️ el arreglo NO fue quitar el zoom global", () => {
  it("layout.tsx conserva maximumScale: 1", () => {
    // Quitarlo haría que iOS haga zoom al enfocar cualquier input en TODA la
    // app. Si alguien lo borra “para que se pueda hacer zoom”, este test avisa.
    expect(layout).toContain("maximumScale: 1");
  });
});

describe("las dos tarjetas usan el MISMO visor", () => {
  it.each([
    ["CatalogoProductCard", card],
    ["CatalogoGroupedCard", grouped],
  ])("%s abre VisorFoto", (_, archivo) => {
    expect(archivo).toContain('import VisorFoto from "./VisorFoto"');
    expect(archivo).toContain("<VisorFoto");
  });

  it.each([
    ["CatalogoProductCard", card],
    ["CatalogoGroupedCard", grouped],
  ])("%s ya no tiene el visor viejo sin zoom", (_, archivo) => {
    expect(archivo).not.toContain("max-w-full max-h-full object-contain rounded-lg");
  });
});

describe("⚠️ la FICHA de producto también tiene visor", () => {
  // Estaba sin visor: tocar la foto ahí no hacía absolutamente nada.
  it("las dos variantes de ficha (tallas y variantes) lo montan", () => {
    expect(ficha).toContain('import VisorFoto from "./VisorFoto"');
    expect(ficha.match(/<VisorFoto/g) ?? []).toHaveLength(2);
  });

  it("y la foto se ve tocable", () => {
    expect(ficha.match(/cursor-zoom-in/g) ?? []).toHaveLength(2);
  });
});

describe("detalles de iPhone", () => {
  it("la X respeta el notch y tiene 44px de área táctil", () => {
    expect(visor).toContain("env(safe-area-inset-top)");
    expect(visor).toContain("h-11 w-11");
  });

  it("bloquea el scroll del fondo mientras está abierto", () => {
    expect(visor).toContain("useBodyScrollLock(true)");
  });

  it("Escape cierra en escritorio", () => {
    expect(visor).toContain('e.key === "Escape"');
  });
});
