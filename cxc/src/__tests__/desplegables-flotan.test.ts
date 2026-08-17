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

  // Catálogos (Reebok / Joybees / Tommy) tenía trabajo en curso el día del
  // barrido, así que no se tocó. NO está medido: queda anotado como deuda.
  "lib/catalogo/marcas-ui.tsx":
    "sugerencias del detalle de pedido — sin medir, catálogos con trabajo en curso",

  // ✅ MEDIDO en el navegador el 30-jul-2026 (build de producción, datos de
  // producción, /comisiones con las 7 empresas de recibos en el menú):
  // **SANO en 390 / 834 / 1440 px** — 0 px recortados, 0 px fuera de pantalla,
  // 0 px de desplazamiento de columnas, 0 px de arrastre nuevo, y el panel
  // flotando por encima. Panel de 224 px: a 390 px el botón arranca en x=132 y
  // el panel termina en 356, o sea 34 px de aire hasta el borde.
  //
  // Sobrevive porque su barra de herramientas NO recorta (`flex flex-wrap
  // items-center`, sin overflow) y el `<main>` tampoco. **Se deja como está: la
  // regla de este barrido es arreglar lo que se MIDIÓ roto, no lo que se
  // parece.**
  // ⚠️ Si algún día ese menú se dibuja DENTRO de una tabla o de un modal con
  //    scroll, se rompe: ahí sí hay que pasarlo a <DesplegableFlotante>.
  // ⚠️ Al medirlo: con `secuencial` este botón NO abre menú, EJECUTA el sync.
  //    /comisiones es el único llamador que abre menú (7 opciones, sin
  //    `secuencial`), y NUNCA se toca un item — eso sí sincronizaría de verdad.
  //    Reproducir con: `SOLO=sync-now node scripts/_medir-desplegables.mjs`
  "components/shared/SyncNowButton.tsx":
    "menú de Actualizar ahora — medido SANO en los 3 anchos (30-jul-2026); su barra no recorta",

  // ⚠️ DEUDA CONOCIDA: la base estaba saturada por las auditorías del día y
  // /admin devolvía "Reintentar", así que no se pudo medir en el navegador. Se
  // llegó a portarlo y se REVIRTIÓ: mandar a CXC un cambio de UI sin haberlo
  // abierto una sola vez es justo lo que la regla de calidad del repo prohíbe.
  // Cuando se pueda abrir /admin:
  //   1. `node scripts/_medir-desplegables.mjs` con SOLO=cxc-
  //   2. si sale ROTO → pasarlo a <DesplegableFlotante> y borrar la excepción.
  "app/admin/components/PanelCxcMobile.tsx":
    "menú Acciones de CXC móvil — sin medir, /admin caído el día del barrido",

  // ✅ MEDIDOS en el navegador el 30-jul-2026 (build de producción, datos de
  // producción, /comisiones). Nacieron en el #355 y el barrido original NUNCA
  // LOS VIO; el #364 los anotó como deuda "muy probablemente sanos, pero
  // probable no es medido". Ahora están medidos, en los DOS modos de la
  // pantalla y en los 3 anchos:
  //
  //   ⓘ Criterios ....... 390: panel 300×219 en x=74 · 834: x=506 · 1440: x=1112
  //   Período ........... 390: panel 276×258 en x=16 · 834: x=252 · 1440: x=252
  //
  // En los seis casos: **0 px recortados, 0 px fuera de pantalla, 0 px de
  // desplazamiento de columnas, 0 px de arrastre nuevo, flotando por encima.**
  // Ninguno de los dos tiene un ancestro que recorte (fila 1 `flex items-center
  // gap-1 border-b`, fila 2 `flex flex-wrap items-center`, `<main>` sin
  // overflow) y los dos anclan hacia adentro: `right-0` el ⓘ, que vive pegado
  // al borde derecho con `ml-auto`, y `left-0` el de período, que es el control
  // más a la izquierda con un panel de 276 px sobre 358 px útiles en un iPhone.
  // **NO se portan**: no están rotos.
  //   Reproducir: `SOLO=comisiones node scripts/_medir-desplegables.mjs`
  //
  // 🩸 SI algún día hay que portar el ⓘ: su panel se esconde con `hidden` y NO
  // se desmonta, a propósito. Adentro vive el <SyncStatus> que consulta la
  // frescura al cargar la página para poder encender el punto ámbar.
  // `DesplegableFlotante` hace `return null` cuando está cerrado, así que un
  // port directo desmonta el SyncStatus y **el aviso solo aparecería después de
  // abrir el ⓘ — o sea, nunca**. Hay que sacar el SyncStatus del panel primero.
  "components/ventas/ComisionesCriterios.tsx":
    "ⓘ Criterios de Comisiones — medido SANO en los 3 anchos y los 2 modos (30-jul-2026)",
  "components/ventas/ComisionesPeriodo.tsx":
    "selector de período de Comisiones — medido SANO en los 3 anchos y los 2 modos (30-jul-2026)",
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
      "components/shared/SyncNowButton.tsx",
      "components/ui.tsx",
      "components/ventas/ComisionesCriterios.tsx",
      "components/ventas/ComisionesPeriodo.tsx",
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
