// ─────────────────────────────────────────────────────────────────────────────
// CANDADO — una barra pegajosa se pega DEBAJO del encabezado, nunca encima.
//
// 🩸 EL BUG, con captura. Daniel, 11-sep-2026, mirando Ventas › Clientes:
// *«mira cómo se corta arriba; y así también pasa en otros módulos, para que
// chequees y arregles eso»*. La barra de filtros de esa pantalla era
// `sticky top-0 z-20` y el `AppHeader` es `sticky top-0 z-10`: MISMO tope y
// MÁS z-index, así que al hacer scroll la barra se montaba encima del logo FG,
// del breadcrumb «Inicio › Ventas», del buscador y del usuario.
//
// Tenía razón en que pasaba en otros módulos. Medido sobre `src/**` el mismo
// día: **34 sitios** con `sticky` + `top-…`, de los cuales **4 eran barras de
// página** y ninguna de las cuatro sabía cuánto mide el encabezado:
//
//   Ventas › Clientes — barra de filtros ....... `top-0 z-20`  (la captura)
//   Guías › Nueva guía — barra de arriba ....... `top-0 z-20`
//   Guías/Recordatorios — TimeGroupHeader ...... `top-14 z-[5]`
//   Catálogo — barra del modo pedido ........... `top-0 z-30`
//
// 🔑 Y NO HAY NÚMERO BUENO QUE ESCRIBIR A MANO: el encabezado NO tiene alto
// fijo. En el escritorio lleva la tira del breadcrumb (≈70 px) y en el celular
// no (≈46 px), y el acento de 2 px del módulo lo mueve otra vez. Por eso el
// `top-14` (56 px) de `TimeGroupHeader` fallaba en las DOS pantallas a la vez:
// 14 px encima del breadcrumb en el escritorio, y 10 px de franja por la que
// se veía pasar la lista en el celular. El alto se MIDE (`ResizeObserver`) y
// viaja en `--fg-altura-encabezado`.
//
// Los otros 30 sitios NO son barras de página y se dejan como están, a
// propósito: un `<thead>`/`<th>` con `sticky top-0` se pega al CONTENEDOR que
// lo desplaza (la tabla con scroll), y la cabecera de un modal se pega al panel
// del modal. Ninguno compite con el encabezado de la app, y darles el tope del
// encabezado los rompería. Están enumerados abajo con su motivo, uno por uno.
//
// Assertions sobre el FUENTE a propósito: jsdom no calcula layout ni resuelve
// `var()`, así que no puede medir un solapamiento. Lo que se congela acá es la
// CAUSA. La prueba de pantalla está en `barras-pegajosas.test.tsx`.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { globSync } from "glob";

import {
  CLASE_BARRA_PEGAJOSA,
  VAR_ALTURA_ENCABEZADO,
  Z_ENCABEZADO,
  Z_BARRA_PEGAJOSA,
} from "@/lib/ui/barra-pegajosa";

const raiz = join(__dirname, "..", "..");
const leer = (rel: string) => readFileSync(join(raiz, rel), "utf8");

/**
 * Los DOS encabezados del sistema: los únicos que pueden pegarse en `top-0`,
 * porque son ellos los que definen dónde empieza el contenido.
 *
 *   `AppHeader`      — las 22 pantallas de la app.
 *   `CatalogoNavbar` — el catálogo con sesión, que no lleva `AppHeader`.
 */
const ENCABEZADOS = [
  "components/AppHeader.tsx",
  "components/catalogo/CatalogoNavbar.tsx",
];

/**
 * Los `sticky top-…` que NO son barras de página, con el motivo de cada uno.
 *
 * 🔴 La lista es explícita y se escribe a mano: es la única forma de que
 * agregar un `sticky top-0` nuevo obligue a pensar de qué se está pegando. Si
 * un archivo deja de tener su sticky, su entrada tiene que salir de acá (hay
 * un caso que lo exige más abajo): una lista con entradas muertas deja de
 * proteger y nadie se entera.
 */
const NO_SON_BARRAS_DE_PAGINA: { archivo: string; motivo: string }[] = [
  // `<thead>` / `<th>` — se pegan al contenedor con scroll de SU tabla.
  { archivo: "app/guias/components/GuiaForm.tsx", motivo: "thead de la tabla de renglones" },
  { archivo: "app/guias/components/GuiasList.tsx", motivo: "thead del detalle de la guía" },
  { archivo: "app/reclamos/components/EmpresaList.tsx", motivo: "thead de la lista de reclamos" },
  { archivo: "app/reclamos/components/ReclamoDetail.tsx", motivo: "thead de artículos y de liquidaciones" },
  { archivo: "app/marketing/components/ReportePorProyectoView.tsx", motivo: "thead del reporte" },
  { archivo: "app/marketing/components/ReportePorTiendaView.tsx", motivo: "thead del reporte" },
  { archivo: "app/productos/cargar/ReebokClient.tsx", motivo: "thead de la vista previa" },
  { archivo: "app/productos/cargar/HistorialView.tsx", motivo: "thead del historial" },
  { archivo: "app/productos/cargar/DepuradorClient.tsx", motivo: "thead de la vista previa" },
  { archivo: "app/productos/cargar/FacturasTiendaClient.tsx", motivo: "thead de la vista previa" },
  { archivo: "app/prestamos/components/MovimientoTable.tsx", motivo: "thead de movimientos" },
  { archivo: "components/ventas/ResumenView.tsx", motivo: "thead del heatmap (sticky en los dos ejes)" },
  // (`components/ventas/ResumenAnual.tsx` salió de la lista el 11-sep-2026: la
  // vista Anual se retiró con la pestaña.)
  { archivo: "components/catalogo/PedidoDetalleClient.tsx", motivo: "thead del detalle del pedido" },
  // Cabeceras y pies de MODAL — se pegan al panel del modal, no a la página.
  { archivo: "app/marketing/components/HistorialImpulsadoraModal.tsx", motivo: "cabecera del modal" },
  { archivo: "app/marketing/components/RegistrarPagoModal.tsx", motivo: "cabecera del modal" },
  { archivo: "app/marketing/components/NuevaImpulsadoraModal.tsx", motivo: "cabecera del modal" },
  { archivo: "app/marketing/components/ProyectoOverlay.tsx", motivo: "cabecera del overlay del proyecto" },
  { archivo: "components/marketing/EntregaForm.tsx", motivo: "cabecera del modal de entrega" },
  // ⚠️ Dentro del overlay del proyecto, y por eso queda: su contenedor de
  // scroll es el panel del modal, no la página. Lo que SÍ queda pendiente de
  // decidir con Daniel es que ahí conviven dos `sticky top-0` en el mismo panel
  // (esta tira y la cabecera del overlay) — es otra pregunta, otro módulo, y no
  // es lo que Daniel reportó.
  { archivo: "app/marketing/components/FacturasSection.tsx", motivo: "tira de borradores dentro del overlay" },
];

/** Todos los `.tsx` de la app y de los componentes. */
const ARCHIVOS = globSync("{app,components}/**/*.tsx", { cwd: raiz }).sort();

/**
 * Las líneas de un archivo que declaran un `sticky` con tope vertical.
 *
 * Se mira `sticky` + un `top-…` en la MISMA línea, que es como Tailwind se
 * escribe acá. `sticky left-0` (scroll horizontal) y `sticky bottom-0` (barras
 * de pie, como la de selección del CXC o la del carrito) quedan fuera: no
 * compiten con el encabezado.
 */
function lineasConTopePegajoso(fuente: string): { n: number; linea: string }[] {
  return fuente
    .split("\n")
    .map((linea, i) => ({ n: i + 1, linea }))
    .filter(({ linea }) => {
      const sinComentario = linea.replace(/^\s*(\/\/|\*|\/\*).*/, "");
      if (!/\bsticky\b/.test(sinComentario)) return false;
      return /\btop-(0|\d+|\[[^\]]+\])(?![\w-])/.test(sinComentario);
    });
}

describe("El token del encabezado existe y es UNO solo", () => {
  it("la variable y la clase se declaran en globals.css", () => {
    const css = leer("app/globals.css");
    expect(css).toContain(`${VAR_ALTURA_ENCABEZADO}: 0px`);
    expect(css).toContain(`.${CLASE_BARRA_PEGAJOSA}`);
    // La clase se pega al TOPE MEDIDO, nunca a un número.
    expect(css).toMatch(
      new RegExp(`\\.${CLASE_BARRA_PEGAJOSA}\\s*\\{[^}]*top:\\s*var\\(${VAR_ALTURA_ENCABEZADO}\\)`)
    );
    expect(css).toMatch(new RegExp(`\\.${CLASE_BARRA_PEGAJOSA}\\s*\\{[^}]*position:\\s*sticky`));
  });

  it("la barra queda POR DEBAJO del encabezado — es la regla entera", () => {
    expect(Z_BARRA_PEGAJOSA).toBeLessThan(Z_ENCABEZADO);
    const css = leer("app/globals.css");
    expect(css).toMatch(
      new RegExp(`\\.${CLASE_BARRA_PEGAJOSA}\\s*\\{[^}]*z-index:\\s*${Z_BARRA_PEGAJOSA}`)
    );
  });

  it("el alto se MIDE con ResizeObserver, no se escribe", () => {
    const hook = leer("lib/hooks/usePublicarAlturaEncabezado.ts");
    expect(hook).toContain("ResizeObserver");
    expect(hook).toContain("getBoundingClientRect");
    expect(hook).toContain(`setProperty(VAR_ALTURA_ENCABEZADO`);
    // Sin ResizeObserver (navegador viejo) se mide UNA vez — nunca se vuelve a
    // un valor fijo.
    expect(hook).toContain('typeof ResizeObserver === "undefined"');
  });

  it("los DOS encabezados publican su alto", () => {
    for (const archivo of ENCABEZADOS) {
      const fuente = leer(archivo);
      expect(fuente, archivo).toContain("usePublicarAlturaEncabezado");
    }
  });

  it("el AppHeader toma su z-index de la constante, no de un número suelto", () => {
    const fuente = leer("components/AppHeader.tsx");
    expect(fuente).toContain("Z_ENCABEZADO");
    // El `z-10` escrito a mano en la barra del encabezado se fue: era la mitad
    // del bug (el otro `10` vivía a 300 archivos de distancia).
    expect(fuente).not.toMatch(/sticky top-0 z-10/);
  });
});

describe("BARRIDO — ninguna barra de contenido escribe su tope a mano", () => {
  const exentos = new Set([...ENCABEZADOS, ...NO_SON_BARRAS_DE_PAGINA.map((e) => e.archivo)]);

  it("cada `sticky top-…` es un encabezado, está en la lista con motivo, o usa la clase", () => {
    const culpables: string[] = [];
    for (const archivo of ARCHIVOS) {
      if (exentos.has(archivo)) continue;
      for (const { n, linea } of lineasConTopePegajoso(leer(archivo))) {
        culpables.push(`${archivo}:${n} → ${linea.trim()}`);
      }
    }
    expect(
      culpables,
      `Barras pegajosas con el tope escrito a mano. Usa \`${CLASE_BARRA_PEGAJOSA}\` ` +
        `(src/lib/ui/barra-pegajosa.ts) o, si NO se pega a la página, agrégala a ` +
        `NO_SON_BARRAS_DE_PAGINA con su motivo:\n` + culpables.join("\n")
    ).toEqual([]);
  });

  it("las cuatro barras del arreglo usan la clase y perdieron su número", () => {
    const barras = [
      "components/ventas/ClientesView.tsx",
      "app/guias/components/GuiaForm.tsx",
      "components/TimeGroupHeader.tsx",
      "components/catalogo/BarraModoPedido.tsx",
    ];
    for (const archivo of barras) {
      const fuente = leer(archivo);
      // Se exige el CONSTANTE, no el literal: el nombre de la clase vive en
      // un solo archivo y nadie lo vuelve a teclear.
      expect(fuente, archivo).toContain("CLASE_BARRA_PEGAJOSA");
      expect(fuente, archivo).toContain('from "@/lib/ui/barra-pegajosa"');
    }
    // Los números exactos que causaron el defecto, uno por uno.
    expect(leer("components/ventas/ClientesView.tsx")).not.toContain("sticky top-0 z-20");
    expect(leer("app/guias/components/GuiaForm.tsx")).not.toContain("sticky top-0 z-20");
    expect(leer("components/TimeGroupHeader.tsx")).not.toContain("top-14");
    expect(leer("components/catalogo/BarraModoPedido.tsx")).not.toContain("sticky top-0 z-30");
  });

  it("la lista de exentos no tiene entradas muertas", () => {
    const muertas = NO_SON_BARRAS_DE_PAGINA.filter(
      (e) => lineasConTopePegajoso(leer(e.archivo)).length === 0
    ).map((e) => e.archivo);
    expect(
      muertas,
      "Estos archivos ya no tienen un `sticky top-…`: sácalos de NO_SON_BARRAS_DE_PAGINA " +
        "para que la lista siga diciendo la verdad"
    ).toEqual([]);
  });

  it("CONTROL — el barrido sabe reconocer una barra mal escrita", () => {
    // Si esto pasara, el barrido de arriba estaría verde por no mirar nada.
    expect(lineasConTopePegajoso('<div className="sticky top-0 z-20 bg-white">')).toHaveLength(1);
    expect(lineasConTopePegajoso('<div className="sticky top-14 z-[5]">')).toHaveLength(1);
    expect(lineasConTopePegajoso('<div className="sticky top-[72px]">')).toHaveLength(1);
    // Y que no confunde lo que NO compite con el encabezado.
    expect(lineasConTopePegajoso('<td className="sticky left-0 z-10">')).toHaveLength(0);
    expect(lineasConTopePegajoso('<div className="sticky bottom-0 z-20">')).toHaveLength(0);
    expect(lineasConTopePegajoso('// barra sticky top-0 de antes')).toHaveLength(0);
  });
});
