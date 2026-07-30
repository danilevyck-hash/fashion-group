/**
 * CANDADO — ningún desplegable puede volver a dibujarse DENTRO de la caja que
 * lo recorta.
 *
 * 🩸 EL BUG, y por qué esto es un barrido y no un arreglo puntual. Daniel,
 * textual, después de que se arreglara el selector de cliente de Guías:
 * *"sobre el bug que paso con guia, debe de pasar en otros modulos y otros
 * campos across todo el sistema, hay q arreglar eso"*. Tenía razón. Medido en
 * el navegador (build de producción, sesión sembrada, 390 / 834 / 1440 px):
 *
 *   Cheques › Nuevo cheque › Vendedor ......... 34 px recortados @390, 17 @834
 *   Caja › Nuevo gasto › Responsable .......... 228 px recortados @390
 *   Caja › tabla › editar fila › Categoría .... 62 px recortados @834, y el
 *        `ScrollableTable` pasaba de 0 a 62 px scrolleables — el bug de Guías
 *        exacto: la fila que se está editando se puede ir de la vista
 *   Cheques › menú ⋯ de la fila ............... 121 px recortados @834 y @1440,
 *        +206 px de desplazamiento de las columnas
 *   Cheques › Calendario › globo del cheque ... 138 px FUERA de la pantalla @1440
 *   Header › campana de notificaciones ........ 54 px fuera por la IZQUIERDA @390
 *
 * La causa es siempre la misma: un panel `position: absolute` es hijo del
 * contenedor que lo ancla, y si ese contenedor (o cualquier ancestro) recorta,
 * gana el recorte. **El z-index no tiene nada que ver** — ningún apilamiento le
 * gana al `overflow` de un ancestro. El disfraz más traicionero es
 * `overflow-x: auto` con `overflow-y: visible`, que el navegador computa como
 * `overflow-y: auto`: un `ScrollableTable` que solo quería scroll horizontal
 * recorta también hacia abajo.
 *
 * Son assertions sobre el FUENTE a propósito: jsdom no calcula layout, así que
 * no puede medir un recorte. Lo que se congela acá es la CAUSA. La medición
 * real está en `scripts/_medir-desplegables.mjs` (navegador, 3 anchos) y la
 * aritmética, en `lib/posicion-desplegable.test.ts`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { globSync } from "glob";

const raiz = join(__dirname, "..");
const leer = (rel: string) => readFileSync(join(raiz, rel), "utf8");

/**
 * Cómo se reconoce un DESPLEGABLE en el fuente: un elemento `absolute` que se
 * cuelga de un borde de su ancla (`top-full`, `left-0 right-0`, `right-0 mt-`)
 * y trae chrome de panel (fondo blanco + borde/sombra). Es deliberadamente
 * ESTRECHO: un `absolute` decorativo —un chip, el ícono de una lupa, el pomo de
 * un toggle, el fondo de un modal— no cumple las dos condiciones a la vez, y
 * marcarlos habría hecho el candado inservible por ruidoso.
 */
const ANCLADO = /\b(top-full|bottom-full|left-0 right-0|right-0 top-|left-0 top-)/;
const CHROME_DE_PANEL = /\bbg-white\b/;
const MENU_O_LISTA = /\b(shadow-lg|shadow-md|shadow-xl)\b/;

/**
 * EXCEPCIONES, una por una y con su motivo. La lista es corta a propósito:
 * cada entrada es un desplegable que un día se puede recortar, así que agregar
 * una tiene que costar escribir por qué.
 */
const EXCEPCIONES: Record<string, string> = {
  // No es un desplegable: es el PANEL de una hoja inferior, `absolute` dentro
  // de su propio `fixed inset-0`. Nada lo puede recortar porque su ancestro ES
  // la pantalla. Migrarlo a portal no arreglaría nada y rompería el arrastre.
  "components/ui.tsx": "BottomSheet — panel dentro de su propio fixed inset-0",

  // MEDIDO en el navegador el 30-jul-2026 (Marketing › Nuevo proyecto ›
  // Cliente, 390 / 834 / 1440 px, con 8 resultados reales): 0 px recortados,
  // 0 px fuera de pantalla, 0 px de desplazamiento en los tres. Sobrevive
  // porque Cliente es el PRIMER campo del modal y la lista cae dentro del
  // cuerpo con scroll. No se toca: no está roto (la regla de este barrido es
  // arreglar lo que se rompe, no lo que se parece), y el archivo es de un
  // módulo que tenía trabajo en curso el día del arreglo.
  // ⚠️ Si algún día el campo Cliente deja de ser el primero, esto se rompe:
  //     hay que pasarlo a <DesplegableFlotante> y borrar esta excepción.
  "app/guias/components/ClienteTypeahead.tsx":
    "typeahead de Marketing — medido sano en los 3 anchos; primer campo del modal",

  // Catálogos (Reebok / Joybees / Tommy) tenía trabajo en curso el día del
  // barrido, así que no se tocó. NO está medido: queda anotado como deuda.
  "lib/catalogo/marcas-ui.tsx":
    "sugerencias del detalle de pedido — sin medir, catálogos con trabajo en curso",

  // ⚠️ DEUDA CONOCIDA, los dos por el MISMO motivo: la base estaba saturada por
  // las auditorías del día y /admin y /ventas devolvían "Reintentar", así que no
  // se pudieron medir en el navegador. Se llegó a portarlos y se REVIRTIÓ: la
  // regla de este barrido es arreglar lo que se MIDIÓ roto, y mandar a CXC un
  // cambio de UI sin haberlo abierto una sola vez es justo lo que la regla de
  // calidad del repo prohíbe. Cuando la base respire:
  //   1. `node scripts/_medir-desplegables.mjs` con SOLO=cxc-,sync-now
  //   2. si sale ROTO → pasarlo a <DesplegableFlotante> y borrar la excepción.
  // El de SyncNowButton es el que más pinta tiene: su menú SÍ se dibuja (Ventas
  // › Comisiones pasa 7 empresas y no es `secuencial`) y cuelga de un botón de
  // una barra de herramientas.
  "components/shared/SyncNowButton.tsx":
    "menú de Actualizar ahora — sin medir, /ventas caído el día del barrido",
  "app/admin/components/PanelCxcMobile.tsx":
    "menú Acciones de CXC móvil — sin medir, /admin caído el día del barrido",
};

interface Sospechoso {
  archivo: string;
  linea: number;
  clase: string;
}

function buscarSospechosos(): Sospechoso[] {
  const archivos = globSync("**/*.tsx", {
    cwd: raiz,
    ignore: ["__tests__/**", "**/*.d.ts"],
  });
  const out: Sospechoso[] = [];
  for (const rel of archivos) {
    const texto = readFileSync(join(raiz, rel), "utf8");
    // Un archivo que ya usa el componente compartido (o portalea a mano, como
    // OverflowMenu y los primitivos de Radix) no puede recortar.
    const yaFlota =
      texto.includes("DesplegableFlotante") ||
      texto.includes("createPortal") ||
      texto.includes("Primitive.Portal");
    texto.split("\n").forEach((linea, i) => {
      if (!/className=|Class:|Class =/.test(linea)) return;
      if (!/\babsolute\b/.test(linea)) return;
      if (!ANCLADO.test(linea)) return;
      if (!CHROME_DE_PANEL.test(linea)) return;
      if (!MENU_O_LISTA.test(linea)) return;
      if (yaFlota) return;
      if (rel in EXCEPCIONES) return;
      out.push({ archivo: rel, linea: i + 1, clase: linea.trim().slice(0, 120) });
    });
  }
  return out;
}

describe("Ningún desplegable se dibuja adentro de lo que lo recorta", () => {
  it("barrido de src/**: cero paneles `absolute` colgados de un ancla", () => {
    const sospechosos = buscarSospechosos();
    const detalle = sospechosos
      .map((s) => `\n  ${s.archivo}:${s.linea}\n    ${s.clase}`)
      .join("");
    expect(
      sospechosos,
      "Un panel que flota tiene que usar <DesplegableFlotante> (portal a <body> " +
        "+ position:fixed). Un `absolute` acá lo recorta el primer ancestro con " +
        "overflow — y subir el z-index NO lo arregla." +
        detalle,
    ).toEqual([]);
  });
});

describe("Las excepciones siguen siendo las que se decidieron", () => {
  it("no se agregó ninguna sin escribir el motivo", () => {
    // Que la lista sea CERRADA es lo que hace que el candado sirva: si alguien
    // mete un desplegable nuevo, el barrido lo caza; para silenciarlo tiene que
    // venir acá y explicarse.
    expect(Object.keys(EXCEPCIONES).sort()).toEqual([
      "app/admin/components/PanelCxcMobile.tsx",
      "app/guias/components/ClienteTypeahead.tsx",
      "components/shared/SyncNowButton.tsx",
      "components/ui.tsx",
      "lib/catalogo/marcas-ui.tsx",
    ]);
    for (const motivo of Object.values(EXCEPCIONES)) {
      expect(motivo.length).toBeGreaterThan(20);
    }
  });
});

describe("Los cinco controles arreglados usan el componente compartido", () => {
  const CONTROLES: Array<[string, string]> = [
    ["components/ClientePicker.tsx", "Guías y Cheques · cliente"],
    ["components/ui/SearchableSelect.tsx", "Cheques · vendedor/empresa y Caja · responsable/categoría"],
    ["app/caja/components/AutocompleteInput.tsx", "Caja · categoría en la fila de la tabla"],
    ["app/cheques/ChequesClient.tsx", "Cheques · menú ⋯ y globo del calendario"],
    ["components/NotificationCenter.tsx", "Header · campana"],
  ];

  for (const [archivo, quien] of CONTROLES) {
    it(`${quien} (${archivo})`, () => {
      expect(leer(archivo)).toContain("DesplegableFlotante");
    });
  }

  it("y no hay SEIS copias del mecanismo: el portal vive en UN solo archivo", () => {
    // Lo que Daniel pidió al pedir el arreglo de raíz. `OverflowMenu` es la
    // única excepción viva y es anterior: ya portaleaba bien y lo usan 12
    // pantallas, así que migrarlo sería riesgo sin ganancia.
    const conPortal = globSync("**/*.tsx", { cwd: raiz, ignore: ["__tests__/**"] })
      .filter((rel) => readFileSync(join(raiz, rel), "utf8").includes("createPortal"))
      .filter((rel) => !rel.includes("__tests__"));
    const desplegables = conPortal.filter(
      (rel) =>
        rel.endsWith("ui/DesplegableFlotante.tsx") || rel.endsWith("ui/OverflowMenu.tsx"),
    );
    expect(desplegables.sort()).toEqual([
      "components/ui/DesplegableFlotante.tsx",
      "components/ui/OverflowMenu.tsx",
    ]);
  });
});

describe("El compartido hace las cuatro cosas que hacen falta", () => {
  const f = leer("components/ui/DesplegableFlotante.tsx");

  it("sale del flujo: portal a <body> + position fixed", () => {
    expect(f).toContain("createPortal");
    expect(f).toContain("document.body");
    expect(f).toMatch(/position: "fixed"/);
  });

  it("la posición sale del módulo PURO, no de números sueltos", () => {
    expect(f).toContain("calcularPosicionDesplegable");
    expect(f).not.toMatch(/top:\s*r\.bottom\s*\+\s*\d/);
  });

  it("reancla al scrollear con `capture` (el scroll del contenedor no burbujea)", () => {
    expect(f).toMatch(/addEventListener\("scroll", reubicar, true\)/);
    expect(f).toMatch(/addEventListener\("resize", reubicar\)/);
  });

  it("el click de afuera mira el panel Y el ancla, o el primer toque cerraría", () => {
    expect(f).toContain("panelRef.current?.contains");
    expect(f).toContain("anclaRef.current?.contains");
  });
});
