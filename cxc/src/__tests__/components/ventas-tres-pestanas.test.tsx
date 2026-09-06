// ─────────────────────────────────────────────────────────────────────────────
// CANDADO: VENTAS TIENE **TRES** PESTAÑAS, Y CADA UNA DICE LO SUYO.
//
// 5-sep-2026. Daniel, mirando capturas de sus propias pantallas, decidió:
//   · «Comisiones» se retira — *«si quitala»*. Vive completa en `/comisiones`.
//   · «Utilidad» deja de ser pestaña y pasa a ser un MODO de Clientes, con el
//     MISMO control segmentado que el Resumen (Ventas · Utilidad · Margen %).
//
// Quedan **Resumen · Clientes · Productos**.
//
// 🔴 LO QUE ESTE ARCHIVO VIGILA, Y POR QUÉ CADA COSA:
//
//  1. La tira son tres, con su contenido. Una pestaña sin panel deja la
//     pantalla EN BLANCO (Radix no dibuja nada con un `value` sin trigger).
//  2. Los enlaces viejos siguen llegando. `?tab=comisiones` → `/comisiones`
//     (redirect, otra ruta); `?tab=utilidad` → `?tab=clientes&modo=utilidad`
//     (traducido en el cliente, porque un redirect a la MISMA ruta con la MISMA
//     clave `tab` volvería a matchear su propia salida: un bucle).
//  3. Cada pestaña declara CUÁNTAS empresas mira. Las cinco decían «8» y solo
//     el Resumen las mira todas.
//  4. Cada pestaña tiene SU Excel, ADENTRO. El de la barra de arriba no era del
//     módulo: era el del Resumen, así que desde Clientes se bajaba la matriz de
//     empresas × meses.
//  5. El selector de año no se dibuja en Productos: esa pantalla tiene su
//     propio período y tres de sus cuatro opciones se cuentan desde HOY.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import path from "path";
import {
  TABS_VENTAS, MODOS_CLIENTES, esTabVentas, esModoClientes,
  tabHeredado, alcanceDeLaPestana,
} from "@/lib/ventas/pestanas";

const raiz = path.resolve(__dirname, "../../..");
const leer = (rel: string) => readFileSync(path.join(raiz, rel), "utf8");

/** El archivo SIN comentarios: un comentario que NOMBRA lo retirado —para
 *  explicar por qué se retiró— no es la cosa retirada. Este repo ya pagó varias
 *  veces el candado que se cumple con su propia explicación. */
const plano = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const shell = leer("src/app/ventas/VentasShell.tsx");
const shellPlano = plano(shell);
const clientes = plano(leer("src/components/ventas/ClientesView.tsx"));
const productos = plano(leer("src/components/ventas/ProductosView.tsx"));
const resumen = plano(leer("src/components/ventas/ResumenView.tsx"));
const utilidad = plano(leer("src/components/ventas/UtilidadView.tsx"));

// ─────────────────────────────────────────────────────────────────────────────
// 1 · SON TRES
// ─────────────────────────────────────────────────────────────────────────────

describe("1 · la tira son TRES pestañas, y cada una con su panel", () => {
  it("la lista es literal y no un `toContain`", () => {
    // Si mañana aparece una cuarta sin que nadie la haya decidido, el build se
    // pone rojo — que es exactamente lo que pasó con Referencia y con
    // Comisiones, las dos veces por buenos motivos y las dos veces con costo.
    expect([...TABS_VENTAS]).toEqual(["resumen", "clientes", "productos"]);
  });

  it("la tira dibuja esas tres, y ninguna más", () => {
    const tira = shell.slice(shell.indexOf("<TabsList"), shell.indexOf("</TabsList>"));
    const triggers = [...tira.matchAll(/<TabsTrigger value="([a-z]+)"/g)].map((m) => m[1]);
    expect(triggers).toEqual([...TABS_VENTAS]);

    const contenidos = [...shell.matchAll(/<TabsContent value="([a-z]+)"/g)].map((m) => m[1]);
    expect(contenidos).toEqual(triggers);
  });

  it("🔴 ni «utilidad» ni «comisiones» se montan en el shell", () => {
    expect(shellPlano).not.toContain("ComisionesView");
    expect(shellPlano).not.toContain('value="comisiones"');
    expect(shellPlano).not.toContain('value="utilidad"');
    // `UtilidadView` ya NO la monta el shell: la monta Clientes.
    expect(shellPlano).not.toContain("<UtilidadView");
  });

  it("🔴 UTILIDAD SE REUSA, no se reescribió: Clientes monta el MISMO archivo", () => {
    // Dos implementaciones de la misma tabla son dos totales posibles para el
    // mismo año. La pestaña se retiró; la PANTALLA se conservó entera.
    expect(existsSync(path.join(raiz, "src/components/ventas/UtilidadView.tsx"))).toBe(true);
    expect(clientes).toContain('from "./UtilidadView"');
    expect(clientes).toContain("<UtilidadView");
    // Y sigue trayendo sus SEIS campos: cliente, empresa, ventas, costo,
    // utilidad y margen. Perder una columna al mudarla sería perder el dato.
    for (const col of ["cliente", "empresa", "ventas", "costo", "utilidad", "margen"]) {
      expect(utilidad).toContain(`data-col="${col}"`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2 · LOS ENLACES VIEJOS SIGUEN LLEGANDO
// ─────────────────────────────────────────────────────────────────────────────

describe("2 · un favorito guardado no muere", () => {
  it("`?tab=utilidad` se traduce a Clientes en modo Utilidad", () => {
    expect(tabHeredado("utilidad")).toEqual({ tab: "clientes", modo: "utilidad" });
    // CONTROL: lo que NO es heredado devuelve null y sigue el camino normal.
    expect(tabHeredado("clientes")).toBeNull();
    expect(tabHeredado("resumen")).toBeNull();
    expect(tabHeredado("loquesea")).toBeNull();
  });

  it("🔴 `?tab=utilidad` NO se resuelve con un redirect — sería un bucle", () => {
    // Su destino es la MISMA ruta con la MISMA clave `tab`. Next arrastra la
    // query original al destino, así que el redirect volvería a matchear su
    // propia salida y el navegador giraría en redondo. Por eso lo traduce el
    // cliente, donde no puede haber bucle.
    const nextConfig = leer("next.config.js");
    expect(nextConfig).not.toContain('value: "utilidad"');
    expect(shellPlano).toContain("tabHeredado(tabRaw)");
  });

  it("`?tab=comisiones` SÍ se redirige — su destino es otra ruta", () => {
    const nextConfig = leer("next.config.js");
    const bloque = nextConfig.slice(nextConfig.indexOf("async redirects()"), nextConfig.indexOf("experimental:"));
    expect(bloque).toContain('has: [{ type: "query", key: "tab", value: "comisiones" }]');
    const trozo = bloque.slice(bloque.indexOf('value: "comisiones"'));
    expect(trozo).toContain('destination: "/comisiones"');
    // Temporal (307) como TODOS los de este archivo: un 308 se quema en el
    // caché del navegador y ya no hay forma de volver atrás.
    expect(trozo).toContain("permanent: false");
  });

  it("un `?tab=` desconocido cae en Resumen, nunca en blanco", () => {
    expect(esTabVentas("loquesea")).toBe(false);
    expect(esTabVentas("resumen")).toBe(true);
    expect(shellPlano).toContain('esTabVentas(tabRaw) ? tabRaw : "resumen"');
  });

  it("un `?modo=` desconocido cae en Ventas, nunca en blanco", () => {
    expect([...MODOS_CLIENTES]).toEqual(["ventas", "utilidad", "margen"]);
    expect(esModoClientes("loquesea")).toBe(false);
    expect(esModoClientes("margen")).toBe(true);
    expect(shellPlano).toContain('esModoClientes(modoRaw) ? modoRaw : "ventas"');
    // Y el modo vive en la URL: un enlace compartido abre la misma vista.
    expect(shellPlano).toContain('useUrlState("modo"');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3 · CADA PESTAÑA DICE SUS EMPRESAS
// ─────────────────────────────────────────────────────────────────────────────

describe("3 · el encabezado ya no dice «8 empresas» en las tres", () => {
  it("Resumen ocho, Clientes seis, Productos una a la vez", () => {
    expect(alcanceDeLaPestana("resumen", "cierre Ago (mes en curso Sep)"))
      .toBe("8 empresas · cierre Ago (mes en curso Sep)");
    expect(alcanceDeLaPestana("clientes", "cierre Ago (mes en curso Sep)"))
      .toBe("6 empresas · cierre Ago (mes en curso Sep)");
    // Productos se mira de a UNA y con su propio período: nombrar el rango de
    // meses del Resumen ahí sería nombrar un período que esa pantalla no usa.
    expect(alcanceDeLaPestana("productos", "cierre Ago (mes en curso Sep)"))
      .toBe("una empresa a la vez");
  });

  it("el shell lo pinta desde esa función, no con un texto fijo", () => {
    expect(shellPlano).toContain("alcanceDeLaPestana(tab, mesesLabel)");
    // Y ya no queda el literal viejo escrito a mano.
    expect(shellPlano).not.toContain("`8 empresas · ${mesesLabel}`");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4 · UN EXCEL POR PESTAÑA, ADENTRO
// ─────────────────────────────────────────────────────────────────────────────

describe("4 · cada pestaña baja LO QUE ESTÁS VIENDO", () => {
  it("🩸 el Excel de la barra de arriba se retiró — no era el del módulo", () => {
    // Era el del RESUMEN (`exportResumenToExcel`), puesto al lado del año: desde
    // Clientes o desde Productos bajaba la matriz de empresas × meses.
    expect(shellPlano).not.toContain("exportResumenToExcel");
    expect(shellPlano).not.toContain("TABS_CON_CONTROLES_PROPIOS");
  });

  it("las TRES tienen el suyo adentro", () => {
    expect(resumen).toContain("exportResumenToExcel");
    expect(clientes).toContain("exportClientesToExcel");
    expect(clientes).toContain("exportUtilidadToExcel");
    expect(productos).toContain("exportProductosToExcel");
  });

  it("🔴 el de Clientes baja lo FILTRADO, no la respuesta completa", () => {
    // Un archivo que ignora los filtros de la pantalla no cuadra con lo que se
    // acaba de mirar, y eso es una hora buscando un descuadre que no existe.
    expect(clientes).toContain("filas: enPantalla");
    expect(clientes).toContain("exportUtilidadToExcel(utilidadData, utilidadFilas)");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5 · UN SOLO CONTROL DE TIEMPO POR PANTALLA
// ─────────────────────────────────────────────────────────────────────────────

describe("5 · el año de la barra no se dibuja donde no manda", () => {
  it("🔴 en Productos NO se dibuja", () => {
    // «Últimos 6 meses», «Últimos 12 meses» y «Año pasado» se cuentan desde HOY
    // y NO miran el año del selector. Dos controles de tiempo en la misma
    // pantalla, uno inerte, es cómo se lee un número de un año creyendo que es
    // de otro.
    expect(shellPlano).toContain('tab !== "productos"');
  });

  it("y Productos rotula el suyo «Período», que es lo que es", () => {
    // Decía «Año en curso» pegado al «2026» de arriba y se leía como un segundo
    // selector de año. Sus cuatro opciones son períodos, no años.
    expect(productos).toContain("data-selector-periodo");
    expect(productos).toContain(">Período<");
  });
});
