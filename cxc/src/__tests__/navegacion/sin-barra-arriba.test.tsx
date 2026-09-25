// ============================================================================
// 🔴 EN EL CELULAR NO HAY BARRA DE ARRIBA (24-sep-2026).
//
// 🩸 QUÉ VINO A ARREGLAR. La franja de 46 px —FG · el módulo · ☰— se escondía
// al deslizar (§5) pero volvía al subir el dedo. Daniel eligió la opción **a**
// del mockup: que no exista. De 844 px del iPhone quedan **763 útiles al abrir
// y al deslizar**, contra 717/763 de la barra que se escondía.
//
// Lo que este candado congela:
//   1. Hasta `sm` no se dibuja la franja; en la computadora no cambia nada.
//   2. El nombre del módulo es el TÍTULO GRANDE de la página, y se dice UNA
//      sola vez: si la portada del celular ya lo dibuja, el layout se calla.
//   3. Las tres rayas son un botón redondo de 56 px abajo a la derecha, que
//      abre el MISMO menú a pantalla completa.
//   4. 🔴 El flotante NO TAPA los botones negros fijos de las portadas: sube
//      encima de ellos, y el botón negro no se mueve.
//   5. Quien solo marca no ve ni título ni botón: su pantalla es una sola.
//   6. Con el interruptor apagado vuelve la barra de §5, entera.
//
// Mutaciones que caza: (a) sumar la franja de iOS ADEMÁS del alto de la barra
// —el flotante quedaría en el aire— · (b) escribir `false` a mano en la franja
// en vez de derivarlo del interruptor · (c) poner el título también cuando la
// pantalla ya lo dibuja (el nombre dos veces) · (d) poner el título a quien
// solo marca, que es volver a bajarle el botón · (e) dibujar el flotante en la
// computadora · (f) que una barra fija de abajo deje de publicar su alto y el
// flotante se le monte encima.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const nav = vi.hoisted(() => ({ push: vi.fn(), ruta: "/comisiones" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: vi.fn() }),
  usePathname: () => nav.ruta,
  useSearchParams: () => new URLSearchParams(""),
}));

// El interruptor se lee en cada render, así que un getter alcanza para probar
// las dos caras sin duplicar el componente. Las dos funciones derivadas se
// remedan en términos del MISMO indicador: así la cara apagada se prueba de
// verdad y no contra una constante congelada al importar.
const sw = vi.hoisted(() => ({ sinBarra: true }));
vi.mock("@/lib/navegacion/barra-celular", async (original) => {
  const real = await original<typeof import("@/lib/navegacion/barra-celular")>();
  return {
    ...real,
    get SIN_BARRA_ARRIBA() { return sw.sinBarra; },
    hayFranjaEnElCelular: () => !sw.sinBarra,
    elLayoutPoneElTitulo: (q: { tituloEnLaPantalla: boolean; soloMarca: boolean }) =>
      sw.sinBarra && !q.tituloEnLaPantalla && !q.soloMarca,
  };
});

vi.mock("@/components/SearchBar", async (original) => ({
  ...(await original<typeof import("@/components/SearchBar")>()),
  default: () => null,
}));
vi.mock("@/components/NotificationCenter", () => ({ default: () => null }));
vi.mock("@/components/NovedadesAviso", () => ({ default: () => null }));

import AppHeader from "@/components/AppHeader";
import { CLASE_COLCHON_FLOTANTE } from "@/lib/navegacion/useColchonDelFlotante";

const RAIZ = process.cwd();
const leer = (ruta: string) => readFileSync(resolve(RAIZ, ruta), "utf8");
const FUENTE_REGLA = leer("src/lib/navegacion/barra-celular.ts");
const FUENTE_HEADER = leer("src/components/AppHeader.tsx");

/** El módulo de verdad, sin el remedo: para probar las reglas puras. */
async function regla() {
  return vi.importActual<typeof import("@/lib/navegacion/barra-celular")>(
    "@/lib/navegacion/barra-celular",
  );
}

function montar(opciones: { rol?: string; ruta?: string; tituloEnLaPantalla?: boolean } = {}) {
  nav.ruta = opciones.ruta ?? "/comisiones";
  sessionStorage.setItem("cxc_role", opciones.rol ?? "admin");
  sessionStorage.setItem("fg_user_name", "daniel");
  return render(
    <AppHeader module="Comisiones" tituloEnLaPantalla={opciones.tituloEnLaPantalla} />,
  );
}

const elFlotante = () => document.querySelector("[data-boton-flotante]") as HTMLElement | null;
const elTitulo = () => document.querySelector("[data-titulo-modulo]") as HTMLElement | null;
const laFranja = () => document.querySelector("[data-encabezado]") as HTMLElement | null;

beforeEach(() => {
  sw.sinBarra = true;
  nav.push.mockClear();
  sessionStorage.clear();
  document.body.className = "";
  window.matchMedia = ((consulta: string) => ({
    matches: false,
    media: consulta,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});
afterEach(cleanup);

// ── 1 · La regla, sola ──────────────────────────────────────────────────────

describe("la regla, sin montar nada", () => {
  it("hoy la franja no existe, y que no exista se DERIVA del interruptor", async () => {
    const r = await regla();
    expect(r.SIN_BARRA_ARRIBA).toBe(true);
    expect(r.hayFranjaEnElCelular()).toBe(!r.SIN_BARRA_ARRIBA);
    // Mutación (b): nadie escribe el `false` a mano en otro archivo.
    expect(FUENTE_REGLA).toContain("return !SIN_BARRA_ARRIBA;");
    expect(FUENTE_HEADER).not.toMatch(/hayFranjaEnElCelular\s*=\s*\(\)\s*=>\s*false/);
  });

  it("el título lo pone el layout solo cuando nadie más lo dice", async () => {
    const { elLayoutPoneElTitulo } = await regla();
    expect(elLayoutPoneElTitulo({ tituloEnLaPantalla: false, soloMarca: false })).toBe(true);
    // Mutación (c): la portada ya lo dibuja — el nombre se leería DOS veces.
    expect(elLayoutPoneElTitulo({ tituloEnLaPantalla: true, soloMarca: false })).toBe(false);
    // Mutación (d): a quien solo marca se le bajaría el botón otra vez.
    expect(elLayoutPoneElTitulo({ tituloEnLaPantalla: false, soloMarca: true })).toBe(false);
    expect(elLayoutPoneElTitulo({ tituloEnLaPantalla: true, soloMarca: true })).toBe(false);
    // Con el interruptor apagado no pone ninguno: ahí el nombre vive en la franja.
    expect(FUENTE_REGLA).toContain("if (!SIN_BARRA_ARRIBA) return false;");
  });

  it("el flotante se apoya ENCIMA de la barra fija, sin sumar la franja de iOS", async () => {
    const { abajoDelFlotante, MARGEN_FLOTANTE } = await regla();
    // Sin barra: el piso de siempre, más la franja de iOS.
    expect(abajoDelFlotante(0)).toBe(MARGEN_FLOTANTE);
    expect(abajoDelFlotante(0, 34)).toBe(MARGEN_FLOTANTE + 34);
    // Con barra: justo encima de ella.
    expect(abajoDelFlotante(92)).toBe(MARGEN_FLOTANTE + 92);
    // 🔴 Mutación (a): 16 + 34 + 92 = 142 dejaría el botón flotando en el aire.
    expect(abajoDelFlotante(92, 34)).toBe(MARGEN_FLOTANTE + 92);
    expect(abajoDelFlotante(92, 34)).not.toBe(MARGEN_FLOTANTE + 34 + 92);
    // Valores imposibles no rompen la pantalla.
    expect(abajoDelFlotante(Number.NaN)).toBe(MARGEN_FLOTANTE);
    expect(abajoDelFlotante(-500)).toBe(MARGEN_FLOTANTE);
  });

  it("ninguna barra fija queda por encima del flotante: siempre el mismo aire", async () => {
    const { abajoDelFlotante, MARGEN_FLOTANTE } = await regla();
    for (const alto of [60, 80, 92, 114, 130]) {
      // El borde de abajo del botón queda `MARGEN` por encima del techo de la
      // barra: no se superponen ni un píxel.
      expect(abajoDelFlotante(alto) - alto).toBe(MARGEN_FLOTANTE);
    }
  });

  it("el CSS del flotante dice lo mismo que la función", async () => {
    const r = await regla();
    expect(r.ABAJO_DEL_FLOTANTE_CSS).toContain("max(");
    expect(r.ABAJO_DEL_FLOTANTE_CSS).toContain("env(safe-area-inset-bottom)");
    expect(r.ABAJO_DEL_FLOTANTE_CSS).toContain(`var(${r.VAR_ALTO_BARRA_FIJA}, 0px)`);
    expect(r.ABAJO_DEL_FLOTANTE_CSS).toContain(`${r.MARGEN_FLOTANTE}px`);
    // Una suma de los tres sería justo la mutación (a), en CSS.
    expect(r.ABAJO_DEL_FLOTANTE_CSS).not.toMatch(
      /env\(safe-area-inset-bottom\)\s*\+\s*var/,
    );
  });

  // 🔴 MEDIDAS NUEVAS DEL 25-sep-2026 (la «5b» del mockup de Ventas). Eran
  // 56 · 16 · 76: el botón ocupaba x 318–374 en un teléfono de 390 y se comía
  // 19 px del final de TODO monto de Ventas › Resumen (que terminan en x 337)
  // y la flechita de abrir la fila entera (x 345). Con 44 · 8 · 56 ocupa
  // x 338–382: un píxel después de donde terminan los montos. 44 sigue siendo
  // el piso de lo tocable de la casa (`toque-44`).
  it("el colchón de la lista sale de las medidas del botón, no de un número suelto", async () => {
    const r = await regla();
    expect(r.DIAMETRO_FLOTANTE).toBe(44);
    expect(r.MARGEN_FLOTANTE).toBe(8);
    expect(r.COLCHON_DE_LA_LISTA).toBe(56);
    // 🔴 El botón nunca baja del piso de lo tocable.
    expect(r.DIAMETRO_FLOTANTE).toBeGreaterThanOrEqual(44);
    // 🔴 El colchón de al lado es el MISMO número: el botón es redondo.
    expect(r.COLCHON_LATERAL_FLOTANTE).toBe(r.COLCHON_DE_LA_LISTA);
    expect(r.COLCHON_DE_LA_LISTA).toBeGreaterThanOrEqual(
      r.DIAMETRO_FLOTANTE + r.MARGEN_FLOTANTE,
    );
    // Y el cuerpo del colchón vive en `globals.css`, con la misma medida.
    expect(leer("src/app/globals.css")).toContain(`padding-bottom: ${r.COLCHON_DE_LA_LISTA}px`);
    expect(leer("src/app/globals.css")).toContain(`body.${CLASE_COLCHON_FLOTANTE}`);
  });
});

// ── 2 · La pantalla ─────────────────────────────────────────────────────────

describe("AppHeader · el celular sin la franja", () => {
  it("hasta `sm` no se dibuja la franja, y en la computadora sigue igual", async () => {
    montar();
    const franja = await waitFor(() => {
      const el = laFranja();
      if (!el) throw new Error("no está el encabezado");
      return el;
    });
    // Mutación (e): la franja se va SOLO hasta `sm`.
    expect(franja.className).toContain("hidden");
    expect(franja.className).toContain("sm:block");
    // La computadora conserva su encabezado entero: sigue siendo pegajoso y con
    // el acento del módulo.
    expect(franja.className).toContain("sticky");
    // Y la tira del camino de migas no se tocó.
    expect(FUENTE_HEADER).toContain('className="hidden sm:flex flex-wrap px-6 py-1');
  });

  it("el nombre del módulo es el título grande de la página, y es `sm:hidden`", async () => {
    montar();
    const titulo = await waitFor(() => {
      const el = elTitulo();
      if (!el) throw new Error("no está el título");
      return el;
    });
    expect(titulo.className).toContain("sm:hidden");
    const texto = titulo.querySelector("p");
    expect(texto).toBeTruthy();
    expect(texto!.textContent).toBe("Comisiones");
    // 34 px, el título grande de iOS.
    expect(texto!.className).toContain("text-[34px]");
    expect(texto!.className).toContain("font-semibold");
    // 🔴 UN SOLO `h1` DE MÓDULO POR PANTALLA: este bloque NO agrega otro. Cada
    // pantalla ya tiene el suyo en `sr-only`, y dos encabezados con la misma
    // palabra se leen dos veces en voz alta.
    expect(titulo.querySelector("h1")).toBeNull();
    expect(document.querySelectorAll("h1").length).toBe(0);
    // No es pegajoso: se va con el dedo, junto con el contenido.
    expect(titulo.className).not.toContain("sticky");
    expect(titulo.className).not.toContain("fixed");
  });

  it("el acento del módulo no se pierde: va como punto de color junto al título", async () => {
    montar({ ruta: "/comisiones" });
    const titulo = await waitFor(() => {
      const el = elTitulo();
      if (!el) throw new Error("no está el título");
      return el;
    });
    const punto = titulo.querySelector("span[aria-hidden='true']") as HTMLElement | null;
    expect(punto).toBeTruthy();
    expect(punto!.style.backgroundColor).not.toBe("");
    expect(punto!.className).toContain("rounded-full");
  });

  it("si la pantalla ya dibuja su título, el layout NO pone otro", async () => {
    montar({ tituloEnLaPantalla: true });
    await screen.findByLabelText("Abrir menú");
    expect(elTitulo()).toBeNull();
  });

  it("el botón redondo está, mide 44 px, y abre el menú entero", async () => {
    montar();
    const boton = await screen.findByLabelText("Abrir menú");
    const { DIAMETRO_FLOTANTE, MARGEN_FLOTANTE } = await regla();
    expect(boton.getAttribute("data-boton-flotante")).not.toBeNull();
    expect(boton.style.width).toBe(`${DIAMETRO_FLOTANTE}px`);
    expect(boton.style.height).toBe(`${DIAMETRO_FLOTANTE}px`);
    expect(boton.className).toContain("fixed");
    // 🔴 La separación del borde SALE DE LA REGLA, no de una clase escrita a
    // mano: era `right-4` (16 px) y el número vivía en dos lugares.
    expect(boton.style.right).toBe(`${MARGEN_FLOTANTE}px`);
    expect(boton.className).not.toContain("right-4");
    expect(boton.className).toContain("rounded-full");
    // Mutación (e): en la computadora no existe.
    expect(boton.className).toContain("sm:hidden");
    // Sigue cumpliendo el mínimo táctil de la casa.
    expect(boton.className).toContain("min-h-[44px]");
    expect(boton.className).toContain("min-w-[44px]");
    // Y se apoya donde dice la regla, no en un número escrito acá.
    const { ABAJO_DEL_FLOTANTE_CSS } = await regla();
    expect(boton.style.bottom.replace(/\s+/g, "")).toBe(
      ABAJO_DEL_FLOTANTE_CSS.replace(/\s+/g, ""),
    );

    fireEvent.click(boton);
    await waitFor(() => {
      if (!document.querySelector("[data-menu-pantalla]")) throw new Error("no abrió");
    });
  });

  it("la lista deja su colchón abajo mientras el botón está", async () => {
    const vista = montar();
    await screen.findByLabelText("Abrir menú");
    expect(document.body.classList.contains(CLASE_COLCHON_FLOTANTE)).toBe(true);
    vista.unmount();
    expect(document.body.classList.contains(CLASE_COLCHON_FLOTANTE)).toBe(false);
  });

  it("quien solo marca no ve ni título ni botón, y no queda peor que antes", async () => {
    montar({ rol: "marcacion", ruta: "/marcacion" });
    // Se le dio tiempo a que el rol llegue de `sessionStorage`.
    await waitFor(() => {
      if (!laFranja()) throw new Error("no montó");
    });
    await waitFor(() => {
      if (screen.queryByLabelText(/^Abrir menú/)) throw new Error("todavía está el menú");
    });
    expect(elFlotante()).toBeNull();
    // Mutación (d): un título de 34 px acá vuelve a empujar el reloj hacia abajo.
    expect(elTitulo()).toBeNull();
    // Y tampoco se le prende el colchón: no hay botón que esquivar.
    expect(document.body.classList.contains(CLASE_COLCHON_FLOTANTE)).toBe(false);
  });

  it("con el interruptor apagado vuelve la barra de antes, con sus tres rayas", async () => {
    sw.sinBarra = false;
    montar();
    // La hamburguesa de la franja, de vuelta.
    await screen.findByLabelText("Abrir menú de módulos");
    expect(elFlotante()).toBeNull();
    expect(elTitulo()).toBeNull();
    const franja = laFranja()!;
    expect(franja.className).not.toContain("hidden sm:block");
  });
});

// ── 3 · Que convivan: el barrido ────────────────────────────────────────────

describe("el flotante y los botones negros fijos conviven", () => {
  /**
   * Las barras fijas de abajo que viven en una pantalla CON `AppHeader`, o sea
   * las únicas que pueden chocar con el botón redondo. Cada una publica su alto
   * y el flotante se le sube encima.
   *
   * ⚠️ Las del catálogo (`CatalogoStickyCartBar`, el «↑ arriba» de
   * `marcas-ui.tsx`) NO entran: esas pantallas no montan `AppHeader` —su
   * encabezado es `CatalogoNavbar`— y por lo tanto no dibujan el flotante.
   */
  const BARRAS_CON_ENCABEZADO = [
    "src/app/reclamos/components/celular/piezas.tsx",
    "src/app/marcacion/PantallaUnToque.tsx",
    "src/components/InstallPrompt.tsx",
  ];

  it("cada barra fija de abajo dice cuánto mide", () => {
    for (const ruta of BARRAS_CON_ENCABEZADO) {
      const src = leer(ruta);
      // Se busca la LLAMADA, no el `import`: quitar la línea que mide y
      // dejar el import es exactamente la mutación (f).
      expect(src, `${ruta} no publica su alto`).toMatch(/usePublicarAltoBarraFija\s*\(/);
      expect(src, `${ruta} no se deja reconocer`).toContain("ATRIBUTO_BARRA_FIJA");
    }
  });

  it("no aparece una barra fija nueva sin avisar (mutación f)", () => {
    // Barrido sobre las pantallas de la app: cualquier archivo con una barra
    // pegada abajo de ANCHO COMPLETO tiene que publicar su alto o estar en la
    // lista de las que no llevan encabezado.
    const { execSync } = require("node:child_process") as typeof import("node:child_process");
    const salida = execSync(
      "grep -rln --include=*.tsx -e 'fixed inset-x-0 bottom-0' -e 'fixed bottom-0 left-0 right-0' src/app src/components src/lib || true",
      { cwd: RAIZ, encoding: "utf8" },
    );
    const SIN_ENCABEZADO = [
      // El carrito del catálogo: sus tres pantallas usan `CatalogoNavbar`.
      "src/components/catalogo/CatalogoStickyCartBar.tsx",
    ];
    const archivos = salida.split("\n").map((l) => l.trim()).filter(Boolean);
    expect(archivos.length).toBeGreaterThan(0);
    for (const archivo of archivos) {
      if (SIN_ENCABEZADO.includes(archivo)) continue;
      expect(
        leer(archivo),
        `${archivo} tiene una barra fija abajo y no publica su alto: el botón redondo del menú se le va a montar encima`,
      ).toMatch(/usePublicarAltoBarraFija\s*\(/);
    }
  });

  it("las portadas que ya dicen el nombre del módulo se lo avisan al layout", () => {
    // 🔴 UNA SOLA FUENTE DEL TÍTULO POR PANTALLA. Estas cinco dibujan su propio
    // título grande en el celular; si alguna dejara de pasar
    // `tituloEnLaPantalla`, el nombre del módulo se leería DOS veces.
    const CON_TITULO_PROPIO = [
      "src/app/reclamos/ReclamosClient.tsx",
      "src/app/cxc/page.tsx",
      "src/app/asistencia/AsistenciaClient.tsx",
      "src/app/multifashion/MultifashionShell.tsx",
      "src/app/marketing/page.tsx",
    ];
    for (const ruta of CON_TITULO_PROPIO) {
      expect(leer(ruta), `${ruta} dibuja su título y no se lo avisa al layout`)
        .toContain("tituloEnLaPantalla");
    }
  });

  it("el botón negro fijo no se mueve: el que sube es el flotante", () => {
    const piezas = leer("src/app/reclamos/components/celular/piezas.tsx");
    // La barra sigue pegada al piso y de ancho completo, como estaba.
    expect(piezas).toContain("fixed inset-x-0 bottom-0 z-20");
    // Y el botón de adentro sigue ocupando todo el ancho: nada de recortarle
    // 72 px a la derecha para hacerle sitio al flotante.
    expect(piezas).toContain('className="block w-full rounded-xl bg-black');
    expect(piezas).not.toMatch(/pr-\[72px\]|mr-\[72px\]/);
  });
});
