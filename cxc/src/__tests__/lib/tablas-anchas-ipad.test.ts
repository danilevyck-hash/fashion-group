// Candado de las 4 pantallas que se adaptaron a iPhone y iPad el 30-jul-2026.
//
// 🩸 QUÉ SE ROMPIÓ Y POR QUÉ HAY QUE SOSTENERLO. Las cuatro tenían tabla ancha
// dentro de un ancho que no le alcanzaba, y el ancho que fallaba era el que nadie
// miraba: **el iPad**. Medido en el navegador contra el build de producción:
//
//   Multifashion › Clientes   390: 288 px RECORTADOS · 834: 92 px RECORTADOS
//   Proveedores                             834: 249 px de arrastre
//   Clientes › Directorio                   834: 226 px de arrastre
//   Multifashion › Vendedoras               834: 208 px de arrastre
//
// "Recortado" es peor que "hay que arrastrar": la grilla de Multifashion vive en
// un contenedor con `overflow-hidden` y SIN scroller propio, así que esos píxeles
// no se alcanzaban de ninguna forma. Encima el `1fr` del NOMBRE era lo único
// elástico y colapsaba a 0 px: la columna "Cliente" se veía vacía.
//
// 🔑 LO QUE DECIDE ES EL ANCHO ÚTIL, NO EL DE LA VENTANA. La barra lateral se
// lleva 224 px, así que un iPad de 834 deja **610** y su contenido ~552-562 —
// más angosto que un iPhone acostado. Por eso el corte es `lg` (1024) y no `sm`
// (640) ni `md` (768): a 640 y 768 la tabla NO entra, y ponerla ahí es
// exactamente el bug que se vino a arreglar.
//
// ⚠️ 1024 NO es "escritorio": es el MISMO iPad, acostado. Por eso las tres
// tablas se ajustaron para entrar también ahí (menos relleno por debajo de `xl`,
// y el piso de Vendedoras de 760 a 720) en vez de empujar el corte a `xl`, que
// le habría sacado la tabla a un escritorio de 1024-1279 donde sí entraba.
//
// Este archivo es estático a propósito: mide el CÓDIGO. La verificación de que
// los números no cambiaron y de que el arrastre quedó en 0 se hace en el
// navegador con `scripts/_verif-tarjetas-vs-tabla.mjs` y
// `scripts/_diag-recorte-exacto.mjs` — 215 montos comparados, 0 distintos.

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const raiz = path.resolve(__dirname, "../..");
const leer = (rel: string) => readFileSync(path.join(raiz, rel), "utf8");

const ARCHIVOS = {
  multiClientes: "components/multifashion/ClientesMultifashionSubtab.tsx",
  multiVendedoras: "components/multifashion/VendedorasSubtab.tsx",
  proveedores: "app/proveedores/ProveedoresListClient.tsx",
  clientes: "app/clientes/ClientesListClient.tsx",
  // 🩸 La QUINTA, sumada el 24-ago-2026: la pestaña de Confecciones Boston del
  // CXC. Tenía el mismo defecto que las otras cuatro y por el mismo motivo —su
  // tabla de 6 columnas se dibujaba desde `sm` (640)—, así que en el iPad de 834
  // px había que ARRASTRARLA de lado: **184 px medidos en el navegador contra el
  // build de producción**. Sus tarjetas ya existían y funcionaban; sólo se les
  // amplió el tramo hasta `lg`, que es lo mismo que se hizo con las otras tres
  // que no necesitaron componente nuevo. **No se rediseñó nada.**
  bostonCxc: "components/cxc/BostonTab.tsx",
} as const;

describe("las 5 pantallas declaran sus dos layouts con una marca FIJA", () => {
  // 🩸 Sin esto, verificar el cambio buscando la clase del breakpoint
  // (`.md\:hidden`) devuelve vacío en cuanto el corte se mueve: el chequeo
  // compara CERO elementos y pasa en verde sin haber mirado nada. `data-vista`
  // no depende del breakpoint, así que sobrevive a moverlo.
  for (const [nombre, rel] of Object.entries(ARCHIVOS)) {
    it(`${nombre} marca tarjetas y tabla`, () => {
      const src = leer(rel);
      expect(src).toContain('data-vista="tarjetas"');
      expect(src).toContain('data-vista="tabla"');
    });
  }
});

describe("el corte es lg, porque a sm y md la tabla NO entra", () => {
  const casos: { nombre: keyof typeof ARCHIVOS; tabla: RegExp; tarjetas: RegExp }[] = [
    { nombre: "multiClientes", tabla: /data-vista="tabla"[^>]*hidden[^"]*lg:block/, tarjetas: /data-vista="tarjetas"[^>]*lg:hidden/ },
    { nombre: "multiVendedoras", tabla: /data-vista="tabla"[^>]*hidden[^"]*lg:block/, tarjetas: /data-vista="tarjetas"[^>]*lg:hidden/ },
    { nombre: "proveedores", tabla: /data-vista="tabla"[^>]*hidden lg:block/, tarjetas: /data-vista="tarjetas"[^>]*lg:hidden/ },
    { nombre: "clientes", tabla: /data-vista="tabla"[^>]*hidden lg:block/, tarjetas: /data-vista="tarjetas"[^>]*lg:hidden/ },
    { nombre: "bostonCxc", tabla: /data-vista="tabla"[^>]*hidden lg:block/, tarjetas: /data-vista="tarjetas"[^>]*lg:hidden/ },
  ];

  for (const c of casos) {
    it(`${c.nombre}: la tabla desde lg y las tarjetas por debajo`, () => {
      const src = leer(ARCHIVOS[c.nombre]);
      expect(src).toMatch(c.tabla);
      expect(src).toMatch(c.tarjetas);
    });

    it(`${c.nombre}: no vuelve a sm ni a md`, () => {
      const src = leer(ARCHIVOS[c.nombre]);
      // El breakpoint del layout de lista. Otros `sm:`/`md:` del archivo
      // (padding del contenedor, ancho de un filtro) no son esto y se dejan.
      expect(src).not.toMatch(/data-vista="tabla"[^>]*hidden (sm|md):block/);
      expect(src).not.toMatch(/data-vista="tarjetas"[^>]*(sm|md):hidden/);
    });
  }
});

describe("la grilla de Multifashion › Clientes ya no puede recortar sin salida", () => {
  const src = leer(ARCHIVOS.multiClientes);

  it("sigue existiendo la grilla de ancho fijo, pero SOLO en el layout de tabla", () => {
    // La grilla en sí no es el problema — en una pantalla ancha entra y es mejor
    // que las tarjetas. El problema era dibujarla donde no cabe.
    expect(src).toContain("grid-cols-[2.5rem_minmax(0,1fr)_7rem_4rem_5rem_6rem_5.5rem_2.5rem_1.25rem]");
    expect(src).toMatch(/data-vista="tabla"[^>]*overflow-hidden[^>]*lg:block/);
  });

  it("las tarjetas le dan al nombre el ancho que la grilla le quitaba", () => {
    // El `1fr` colapsaba a 0 px. Acá el nombre es el elemento elástico.
    expect(src).toContain("function ClienteTarjeta");
    expect(src).toMatch(/block truncate text-sm font-medium/);
  });

  it("los meses van en lista vertical, no en un gráfico a lo ancho", () => {
    // Con 12 meses en 356 px cada columna del sparkline queda en ~29 px y la
    // etiqueta ("May '25", con `whitespace-nowrap`) se sale de su celda.
    expect(src).toContain("function ClienteMesesLista");
    expect(src).toContain("Escala compartida entre mayoreo y retail");
  });

  it("el WhatsApp de la tarjeta llega a 44 px", () => {
    // En la grilla mide 24×24. La regla de la casa son 44.
    expect(src).toMatch(/min-h-\[44px\][^"]*"\s*\n?\s*>\s*\n?\s*<MessageCircle|MessageCircle[\s\S]{0,200}min-h-\[44px\]|min-h-\[44px\][\s\S]{0,200}MessageCircle/);
  });
});

describe("las tablas entran a 1024, que es el mismo iPad acostado", () => {
  it("Vendedoras bajó su piso de 760 a 720", () => {
    const src = leer(ARCHIVOS.multiVendedoras);
    expect(src).toContain("minWidth: 720");
    expect(src).not.toContain("minWidth: 760");
  });

  it("Proveedores y Clientes aprietan el relleno SOLO por debajo de xl", () => {
    // Apretar en todos los anchos habría cambiado la densidad del escritorio,
    // que es justo lo que no se puede tocar.
    for (const rel of [ARCHIVOS.proveedores, ARCHIVOS.clientes]) {
      const src = leer(rel);
      expect(src).toContain("px-1.5 xl:px-3");
      expect(src).not.toMatch(/py-2 px-3\b/);
    }
  });
});
