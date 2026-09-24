/**
 * MARCACIÓN NO PINTA UN BLANCO ENTRE EL ENCABEZADO Y EL CONTENIDO (19-sep-2026)
 *
 * 🩸 Ana Trejos abrió la app en su teléfono y vio dos pantallas seguidas: el
 * encabezado con la raya amarilla y debajo NADA, y un instante después todo de
 * golpe —el saludo, la hora grande, el botón—. Daniel: *«se siente lagged»*.
 * La causa: la página pintaba un cascarón y `MarcacionClient` recién entonces
 * pedía los datos DESDE EL NAVEGADOR.
 *
 * Lo que este candado exige:
 *
 *  A. EL PRIMER PINTADO YA TRAE EL CONTENIDO. Con la semilla del servidor, el
 *     saludo, la hora, el botón y «Mis marcas» están en el primer cuadro, sin
 *     que haya contestado ni un solo `fetch`.
 *  B. Y LA HORA DE ESE PRIMER CUADRO ES LA DEL SERVIDOR, no la del teléfono —
 *     aunque el teléfono esté adelantado tres horas. Ni una hora inventada.
 *  C. SIN SEMILLA SE DIBUJA EL ESQUELETO, NUNCA UN BLANCO.
 *  D. EL ESQUELETO MIDE LO MISMO que lo que va a reemplazar: si no, el
 *     parpadeo se cambia por un salto, que se siente peor.
 *  E. EL ESQUELETO ES UNO SOLO: `loading.tsx` y la pantalla leen el MISMO
 *     módulo.
 *  F. LA PÁGINA ARMA EL ESTADO EN EL SERVIDOR con la MISMA función que la
 *     ruta, y FALLA ABIERTA: si la base no contesta, la pantalla se comporta
 *     como antes en vez de quedarse muerta.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import React from "react";

// 🔴 ESTE CANDADO ES EL DE LA PANTALLA DE ANTES (24-sep-2026). Con el
// rediseño «un toque» (`lib/marcacion/un-toque.ts`) la pantalla cambió de
// acomodo, pero el interruptor en `false` tiene que dejarla EXACTAMENTE como
// estaba — y eso es lo que se prueba acá, tal cual estaba escrito.
vi.mock("@/lib/marcacion/un-toque", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  MARCACION_UN_TOQUE: false,
}));

vi.mock("@/components/AppHeader", () => ({ default: () => <div data-testid="encabezado" /> }));
vi.mock("@/lib/marcacion/selfie-telefono", () => ({
  achicarEnElTelefono: async (b: Blob) => b,
}));
vi.mock("@/lib/marcacion/cola-offline", () => ({
  guardarPendiente: async () => undefined,
  leerPendientes: async () => [],
  borrarPendiente: async () => undefined,
  contarPendientes: async () => 0,
  anotarIntento: async () => undefined,
}));

import MarcacionClient from "@/app/marcacion/MarcacionClient";
import EsqueletoMarcacion, { BloquesDelEsqueleto } from "@/app/marcacion/EsqueletoMarcacion";

const RAIZ = path.resolve(__dirname, "../../..");
const leer = (p: string) => readFileSync(path.join(RAIZ, p), "utf8");

const FUENTE_PANTALLA = leer("src/app/marcacion/MarcacionClient.tsx");
const FUENTE_ESQUELETO = leer("src/app/marcacion/EsqueletoMarcacion.tsx");
const FUENTE_LOADING = leer("src/app/marcacion/loading.tsx");
const FUENTE_PAGINA = leer("src/app/marcacion/page.tsx");

/** 8:58 a. m. de Panamá. */
const AHORA_SERVIDOR = "2026-09-15T13:58:00.000Z";

function semilla(marcas: string[] = []) {
  return {
    codigo: "2",
    nombre: "ANA TREJOS",
    ahora: AHORA_SERVIDOR,
    hoy: "2026-09-15",
    quincena: { desde: "2026-09-01", hasta: "2026-09-15" },
    rotuloQuincena: "1 – 15 sep",
    marcas: marcas.map((m) => ({ ocurrioEn: m })),
    deshacer: null,
  };
}

/** Un `fetch` que NUNCA contesta: así lo que se ve es solo el primer pintado. */
let fetchLlamado = 0;
beforeEach(() => {
  fetchLlamado = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      fetchLlamado += 1;
      return new Promise<Response>(() => undefined);
    }),
  );
  // 🔴 EL TELÉFONO ESTÁ ADELANTADO TRES HORAS, como en el resto de los candados
  // de esta pantalla: es el reloj mentiroso que Daniel mandó ignorar.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-15T16:58:00.000Z"));
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("A · el primer pintado ya trae el contenido", () => {
  it("con la semilla del servidor se ven el saludo, la hora y el botón sin esperar ningún fetch", () => {
    render(<MarcacionClient inicial={semilla()} />);
    expect(screen.getByText("Ana Trejos")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Marcar entrada" })).toBeTruthy();
    expect(screen.getByText("Todavía no tienes marcas en esta quincena.")).toBeTruthy();
    // Nada de lo de arriba dependió de una respuesta: el `fetch` no contestó.
    expect(fetchLlamado).toBeGreaterThan(0);
  });

  it("y con una marca ya hecha el botón dice «Marcar salida» desde el primer cuadro", () => {
    render(<MarcacionClient inicial={semilla([AHORA_SERVIDOR])} />);
    expect(screen.getByRole("button", { name: "Marcar salida" })).toBeTruthy();
  });

  it("sin ficha de colaborador se dice desde el primer cuadro, no después", () => {
    render(
      <MarcacionClient
        inicial={{ codigo: null, aviso: "Tu usuario no tiene una ficha de colaborador.", ahora: AHORA_SERVIDOR }}
      />,
    );
    expect(screen.getByText("Tu usuario no tiene una ficha de colaborador.")).toBeTruthy();
  });

  it("no se dibuja el esqueleto cuando ya hay contenido", () => {
    const { container } = render(<MarcacionClient inicial={semilla()} />);
    expect(container.querySelector('[data-esqueleto="marcacion"]')).toBeNull();
  });
});

describe("B · la hora del primer cuadro es la del SERVIDOR", () => {
  it("dibuja 8:58 a. m., no las 11:58 del teléfono adelantado", () => {
    render(<MarcacionClient inicial={semilla()} />);
    expect(screen.getByText("8:58 a. m.")).toBeTruthy();
    expect(screen.queryByText("11:58 a. m.")).toBeNull();
  });

  it("y la fecha larga es la del día del servidor", () => {
    render(<MarcacionClient inicial={semilla()} />);
    expect(screen.getByText(/hora de Panamá/)).toBeTruthy();
  });

  it("el reloj arranca anclado en la semilla: el desfase se mide contra ella", () => {
    // Que `desfase` arranque en 0 y `ahora` en el instante de la semilla es lo
    // que hace que el servidor y el navegador dibujen el MISMO texto — y lo que
    // impide que la hora del teléfono se cuele en ese primer cuadro.
    expect(FUENTE_PANTALLA).toContain("semilla === null ? null : 0");
    expect(FUENTE_PANTALLA).toContain("semilla ?? Date.now()");
    expect(FUENTE_PANTALLA).toContain("setDesfase(semilla - enEsteTelefono);");
  });
});

describe("C · sin semilla se dibuja el esqueleto, nunca un blanco", () => {
  it("el cuerpo trae el esqueleto mientras el dato viene del navegador", () => {
    const { container } = render(<MarcacionClient />);
    const esqueleto = container.querySelector('[data-esqueleto="marcacion"]');
    expect(esqueleto).not.toBeNull();
    // Cinco bloques: saludo, reloj, fecha, botón y «Mis marcas».
    expect(esqueleto!.children.length).toBe(5);
  });

  it("y el `<main>` NO queda vacío — que es el defecto que Ana vio", () => {
    const { container } = render(<MarcacionClient />);
    const main = container.querySelector("main");
    expect(main).not.toBeNull();
    expect(main!.children.length).toBeGreaterThan(0);
  });

  it("el esqueleto no dice «Cargando…»: un texto que después desaparece es el salto", () => {
    const { container } = render(<MarcacionClient />);
    expect(container.textContent ?? "").not.toMatch(/Cargando/i);
  });
});

/** Las clases de cada bloque del esqueleto, DIBUJADO — no leídas del código,
 *  que trae también el comentario donde esas medidas están explicadas. */
function clasesDeLosBloques(): string[][] {
  const { container } = render(<BloquesDelEsqueleto />);
  const bloques = Array.from(container.firstElementChild!.children);
  return bloques.map((b) => b.className.split(/\s+/));
}

describe("D · el esqueleto mide lo mismo que lo que reemplaza", () => {
  it("el bloque del reloj mide lo que mide el reloj", () => {
    // La pantalla dibuja la hora con `text-[46px] leading-none`.
    expect(FUENTE_PANTALLA).toContain("text-[46px]");
    expect(clasesDeLosBloques()[1]).toContain("h-[46px]");
  });

  it("el bloque del botón usa el MISMO alto mínimo que el botón", () => {
    expect(FUENTE_PANTALLA).toContain("min-h-[56px]");
    expect(clasesDeLosBloques()[3]).toContain("min-h-[56px]");
  });

  it("las dos líneas de texto miden lo que mide una línea `text-sm`", () => {
    const clases = clasesDeLosBloques();
    expect(clases[0]).toContain("h-5"); // el saludo
    expect(clases[2]).toContain("h-5"); // la fecha
    expect(clases[4]).toContain("h-5"); // «Mis marcas»
  });

  it("los bloques llevan los mismos márgenes que las líneas que reemplazan", () => {
    const clases = clasesDeLosBloques();
    expect(clases[1]).toContain("mt-3");
    expect(clases[2]).toContain("mt-2");
    expect(clases[3]).toContain("mt-6");
    expect(clases[4]).toContain("mt-8");
  });

  it("la barra del encabezado del `loading.tsx` mide lo que mide el encabezado en celular", () => {
    // `AppHeader` en celular es `h-11` más los 2 px del borde del módulo.
    const { container } = render(<EsqueletoMarcacion />);
    const barra = container.firstElementChild!.firstElementChild!;
    expect(barra!.className).toContain("h-11");
    expect(barra!.className).toContain("border-b-2");
  });
});

describe("E · el esqueleto es UNO SOLO", () => {
  it("`loading.tsx` y la pantalla leen el mismo módulo", () => {
    expect(FUENTE_LOADING).toContain('from "./EsqueletoMarcacion"');
    expect(FUENTE_PANTALLA).toContain('from "./EsqueletoMarcacion"');
  });

  it("y `loading.tsx` sigue el molde de la casa: `DelayedSkeleton`", () => {
    // Envuelto de verdad, no solo importado: el molde es que en una carga
    // rápida no aparezca ni un gris.
    expect(FUENTE_LOADING).toContain("<DelayedSkeleton>");
    expect(FUENTE_LOADING).toContain("</DelayedSkeleton>");
  });
});

describe("F · la página arma el estado en el SERVIDOR", () => {
  it("usa la MISMA función que contesta la ruta, no una copia", () => {
    // 🔴 Llamada, no solo importada: una segunda forma de armar el estado es
    // cómo se llega a una pantalla que dice una cosa al abrirse y otra al
    // refrescarse.
    expect(FUENTE_PAGINA).toMatch(/return await armarEstadoDeLaPantalla\(\s*codigo/);
    expect(FUENTE_PAGINA).toMatch(/await leerEmpleadoCodigo\(/);
  });

  it("y se la pasa a la pantalla como semilla", () => {
    expect(FUENTE_PAGINA).toMatch(/inicial=\{await semillaDeLaPantalla\(\)\}/);
  });

  it("FALLA ABIERTA: si la base no contesta, devuelve null y el navegador lo pide como antes", () => {
    const i = FUENTE_PAGINA.indexOf("} catch (e) {");
    expect(i).toBeGreaterThan(-1);
    const cazado = FUENTE_PAGINA.slice(i, FUENTE_PAGINA.indexOf("export default async function Page"));
    // 🔴 El catch DEVUELVE null. Si relanza, un problema de base deja a la
    // persona sin poder marcar — un arreglo de pantalla no puede hacer eso.
    expect(cazado).toContain("return null;");
    expect(cazado).not.toContain("throw");
  });

  it("el aviso de «sin ficha de colaborador» es el MISMO texto que el de la ruta", async () => {
    const { AVISO_SIN_CODIGO } = await import("@/lib/marcacion/marcacion");
    const ruta = leer("src/app/api/marcacion/route.ts");
    expect(FUENTE_PAGINA).toContain("AVISO_SIN_CODIGO");
    expect(ruta).toContain("AVISO_SIN_CODIGO");
    expect(AVISO_SIN_CODIGO).toContain("no hay a quién marcarle");
  });
});

/**
 * G · LAS OTRAS TRES QUE SE ARREGLARON CON EL MISMO CRITERIO (19-sep-2026).
 *
 * De las 34 pantallas que piden su dato desde el navegador al abrir, éstas
 * eran las tres peores después de Marcación — medidas por quién las usa, cada
 * cuánto y si se abren en el teléfono. No se tocaron las demás.
 */
describe("G · el CXC y las dos pantallas de pedido tampoco dejan un blanco", () => {
  it("el CXC dibuja el encabezado ANTES de la lista, también mientras carga", () => {
    const cxc = leer("src/app/cxc/page.tsx");
    const rama = cxc.slice(cxc.indexOf("if (loading) {"), cxc.indexOf("const canExport"));
    // 🩸 Antes esta rama eran cinco filas grises sin encabezado y sin pestañas:
    // al llegar el dato, TODA la lista bajaba de un salto.
    expect(rama).toContain("<AppHeader module=\"Cuentas por Cobrar\" />");
    // El alto de la tira de pestañas, reservado (`TabsCartera` son botones
    // `min-h-[44px]`): sin él la lista igual baja de un salto.
    expect(rama).toContain('<div className="min-h-[44px] border-b border-gray-200" />');
    expect(rama).toContain("SkeletonRow");
  });

  it("el checkout del vendedor ya no devuelve `null` mientras lee el carrito", () => {
    const checkout = leer("src/components/catalogo/CheckoutClient.tsx");
    expect(checkout).not.toContain("if (!loaded) return null;");
    expect(checkout).toContain('data-esqueleto="checkout"');
    // El título no depende de ningún dato: se dibuja desde el primer cuadro.
    const rama = checkout.slice(checkout.indexOf("if (!loaded) {"), checkout.indexOf("if (!loaded) {") + 1200);
    expect(rama).toContain("Confirmar pedido");
  });

  it("la pantalla donde el cliente revisa su pedido tampoco", () => {
    const revisar = leer("src/components/catalogo/RevisarPedidoPublico.tsx");
    expect(revisar).not.toContain("if (!cargado) return null;");
    expect(revisar).toContain('data-esqueleto="revisar-pedido"');
    const rama = revisar.slice(revisar.indexOf("if (!cargado) {"), revisar.indexOf("if (!cargado) {") + 1400);
    expect(rama).toContain("Revisa tu pedido");
    expect(rama).toContain("CatalogoHeader");
  });
});
