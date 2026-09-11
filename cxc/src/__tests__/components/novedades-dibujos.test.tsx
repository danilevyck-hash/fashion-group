// ─────────────────────────────────────────────────────────────────────────────
// LOS CUADRITOS DEL AVISO «QUÉ CAMBIÓ» — SUS CANDADOS (9-sep-2026).
//
// Daniel: *«pero hazlo con una imagen cada punto de ser necesario para que el
// usuario lo vea»* · *«las que cambian de botón o algo más que sea necesario
// para facilidad de usuario»* · *«yo dibujo un cuadrito simple — la flechita, el
// botón nuevo — sin captura real»*.
//
// Y el que manda sobre todos: *«acuérdate que solo lo verá una vez cada vez que
// entra al módulo por usuario»*. Una sola oportunidad ⇒ un dibujo que no aclara
// ESTORBA. Por eso el candado más importante de este archivo no es que el dibujo
// se vea: es **quiénes NO lo llevan**.
//
// Las siete reglas del aviso siguen en `src/__tests__/lib/novedades.test.ts` y
// `novedades-aviso.test.tsx`; acá solo lo que agregaron los dibujos.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, render, screen, cleanup } from "@testing-library/react";
import NovedadesAviso, { ESPERA_MS } from "@/components/NovedadesAviso";
import DibujoNovedad, {
  ACENTO_SIN_COLOR,
  RADIO,
  acentoDelModulo,
} from "@/components/novedades/DibujoNovedad";
import { getModuleColorByKey } from "@/lib/moduleColors";
import { NOVEDADES } from "@/lib/novedades/lista";
import {
  DIBUJOS,
  DIBUJO_KEYS,
  anchoDePieza,
  anchoTotal,
  esDibujoConocido,
  posicionesDe,
  type Pieza,
} from "@/lib/novedades/dibujos";

const RAIZ = join(__dirname, "..", "..", "..");
const leer = (rel: string) => readFileSync(join(RAIZ, rel), "utf8");

const FUENTE_DIBUJOS = leer("src/lib/novedades/dibujos.ts");
const FUENTE_COMPONENTE = leer("src/components/novedades/DibujoNovedad.tsx");
const FUENTE_TIRA = leer("src/components/NovedadesAviso.tsx");

/* ═══ QUIÉNES LLEVAN DIBUJO (y sobre todo, quiénes NO) ════════════════════ */

/**
 * 🔴 LAS CATORCE, CONGELADAS UNA POR UNA. Cada una es un BOTÓN que se movió,
 * cambió de nombre o nació, o un CONTROL que desapareció y hay que decir a dónde
 * se fue. Agregar una más obliga a defenderla acá.
 */
const CON_DIBUJO = [
  "asistencia-el-aviso-lleva-a-la-persona",   // el aviso pasó a ser un enlace
  "caja-la-foto-del-recibo",                  // cuadro nuevo donde soltar la foto
  "cargar-la-compania-se-reconoce-sola",      // se fue el selector de compañía
  "cargar-quitar-una-descripcion",            // nació la × de quitar
  "cheques-una-sola-lista",                   // se fueron las ocho pestañas
  "comisiones-flechita-descarga-el-reporte",  // nació la flechita ↓
  "comisiones-un-selector-y-un-engranaje",    // se fueron las pestañas; nació el ⚙
  "cxc-cobrar-es-la-unica-puerta",            // se fueron el «···» y el clic derecho
  "cxc-descargar-en-vez-de-exportar",         // el botón cambió de nombre
  "directorio-se-edita-tocando-el-dato",      // se fue el botón «Guardar»
  "guias-bodega-corrige-los-bultos",          // nació la caja de bultos
  "multifashion-cuatro-pestanas",             // se fue la pestaña «Caja»
  "multifashion-un-solo-control-de-tiempo",   // tres controles pasaron a uno
  "prestamos-de-donde-salio-el-pago",         // nació el desplegable
];

/**
 * CONTROL AL REVÉS: las que NO llevan y no pueden llevar. Son cambios de
 * NÚMERO, de REGLA o de TEXTO — ahí no hay ninguna cosa que buscar en pantalla,
 * y el dibujo gastaría la única vez que la persona lee el aviso.
 */
const SIN_DIBUJO_A_PROPOSITO = [
  "vista-general-vs-el-ano-pasado-mismos-dias",
  "ventas-vs-el-ano-pasado-mismos-dias",
  "comisiones-abre-en-el-mes-cerrado",
  "reclamos-el-itbms-dice-7",
  "asistencia-la-hora-extra-arranca-a-los-10-minutos",
  // 10-sep-2026 · NOTA FECHADA — «packing-lists-no-se-borran-a-los-7-dias» salió
  // de este control porque salió la NOVEDAD, y salió con su módulo (Daniel:
  // «packing list no se usa, eliminar»). El control no se debilitó: las otras
  // ocho siguen exigiendo que un cambio de número, regla o texto no gane dibujo.
  "catalogos-el-excel-de-comprobantes-cuadra",
  "cxc-estado-de-cuenta-como-switch",
  "guias-westland-bien-escrito",
];

describe("🔴 quién lleva cuadrito: solo lo que no se encuentra solo", () => {
  it("las catorce que llevan son exactamente éstas", () => {
    const llevan = NOVEDADES.filter((x) => x.dibujo).map((x) => x.id).sort();
    expect(llevan).toEqual([...CON_DIBUJO].sort());
  });

  it("🔴 CONTROL · un cambio de número, de regla o de texto NUNCA lleva", () => {
    for (const id of SIN_DIBUJO_A_PROPOSITO) {
      const nov = NOVEDADES.find((x) => x.id === id);
      expect(nov, `«${id}» ya no existe: revisa la lista de control`).toBeTruthy();
      expect(nov!.dibujo, `«${id}» ganó un dibujo que no aclara nada`).toBeUndefined();
    }
  });

  it("no se dibuja de más: a lo sumo 15 cuadritos en todo el sistema", () => {
    // Daniel acotó el encargo a «las que cambian de botón o algo más que sea
    // necesario»: pasado ese puñado, la tira deja de ser un aviso.
    expect(DIBUJO_KEYS.length).toBeLessThanOrEqual(15);
    expect(NOVEDADES.filter((x) => x.dibujo).length).toBeLessThanOrEqual(15);
  });

  it("y menos de la mitad de las novedades llevan uno", () => {
    const con = NOVEDADES.filter((x) => x.dibujo).length;
    expect(con * 2, `${con} de ${NOVEDADES.length} llevan dibujo`).toBeLessThan(NOVEDADES.length);
  });

  it("cada `dibujo` apunta a un cuadrito QUE EXISTE", () => {
    for (const nov of NOVEDADES) {
      if (!nov.dibujo) continue;
      expect(esDibujoConocido(nov.dibujo), `«${nov.id}» apunta a «${nov.dibujo}»`).toBe(true);
    }
  });

  it("y ningún cuadrito quedó dibujado sin dueño", () => {
    const usadas = new Set(NOVEDADES.map((x) => x.dibujo).filter(Boolean));
    const huerfanas = DIBUJO_KEYS.filter((k) => !usadas.has(k));
    expect(huerfanas, "cuadritos que no muestra ninguna novedad").toEqual([]);
  });
});

/* ═══ EL TEXTO ALTERNATIVO ════════════════════════════════════════════════ */

describe("🔴 cada cuadrito dice lo suyo para quien no lo puede ver", () => {
  it("todos traen texto alternativo, y dice LA COSA", () => {
    for (const [k, d] of Object.entries(DIBUJOS)) {
      expect(d.alt.trim(), `«${k}» sin texto alternativo`).toBe(d.alt);
      expect(d.alt.length, `«${k}» con un alternativo de relleno`).toBeGreaterThan(25);
      expect(d.alt.includes("\n"), `«${k}» con más de una línea`).toBe(false);
      // «Imagen de…» / «Dibujo de…» no le dice nada a nadie.
      expect(/^(imagen|dibujo|captura|foto)\b/i.test(d.alt), `«${k}» empieza narrando`).toBe(false);
    }
  });

  it("sin voseo: es el mismo español del resto del sistema", () => {
    // El barrido de verdad es `nada-de-voseo.test.ts`, que ya cubre
    // `src/lib/novedades/dibujos.ts`. Éste es el recordatorio pegado al dato:
    // solo las formas del voseo (las que llevan tilde al final).
    // Mismo corte que el barrido real: los bordes se miden con LETRAS
    // Unicode, porque `\b` no reconoce la í de «decía» y cortaría en falso.
    const VOSEO = /(?<![\p{L}\p{M}])(elegí|escribí|revisá|guardá|tocá|mirá|tenés|podés|sabés|querés|acá|andá|vení|hacés|decí)(?![\p{L}\p{M}])/iu;
    for (const [k, d] of Object.entries(DIBUJOS)) {
      expect(VOSEO.test(d.alt), `«${k}» tiene voseo: ${d.alt}`).toBe(false);
    }
  });

  it("sin jerga: ni rutas, ni nombres de tabla, ni inglés técnico", () => {
    const PROHIBIDO = [/\bendpoint\b/i, /\bAPI\b/, /\bSVG\b/i, /\/api\//, /\bsrc\//, /\bbotón nuevo del componente\b/i];
    for (const [k, d] of Object.entries(DIBUJOS)) {
      for (const re of PROHIBIDO) {
        expect(re.test(d.alt), `«${k}» dice jerga: ${re}`).toBe(false);
      }
    }
  });

  it("en pantalla el alternativo llega como `aria-label` Y como título", () => {
    const { container } = render(<DibujoNovedad clave="exportar-a-descargar" />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.getAttribute("aria-label")).toBe(DIBUJOS["exportar-a-descargar"].alt);
    expect(svg.querySelector("title")?.textContent).toBe(DIBUJOS["exportar-a-descargar"].alt);
  });

  it("y NO se esconde de los lectores de pantalla", () => {
    const { container } = render(<DibujoNovedad clave="una-sola-puerta-cobrar" />);
    expect(container.querySelector("svg")!.getAttribute("aria-hidden")).toBeNull();
  });
});

/* ═══ LOS COLORES SALEN DE LAS CLASES, NUNCA DE UN #HEX ═══════════════════ */

describe("🔴 ni un color escrito a mano", () => {
  it("no hay un solo `#hex`, `rgb(` ni `hsl(` en el dibujo", () => {
    for (const [nombre, src] of [["dibujos.ts", FUENTE_DIBUJOS], ["DibujoNovedad.tsx", FUENTE_COMPONENTE]] as const) {
      expect(/#[0-9a-fA-F]{3,8}\b/.test(src), `${nombre} clava un color`).toBe(false);
      expect(/\brgba?\(/.test(src), `${nombre} clava un rgb`).toBe(false);
      expect(/\bhsla?\(/.test(src), `${nombre} clava un hsl`).toBe(false);
    }
  });

  it("todo se pinta con `currentColor`: `stroke-current` y `fill-current`", () => {
    expect(FUENTE_COMPONENTE).toContain("stroke-current");
    expect(FUENTE_COMPONENTE).toContain("fill-current");
    // El color de arriba es una clase de la app, no un valor.
    expect(FUENTE_COMPONENTE).toContain("text-gray-500");
  });

  it("el `currentColor` llega de verdad al trazo", () => {
    const { container } = render(<DibujoNovedad clave="flechita-en-el-numero" modulo="comisiones" />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("class")).toContain("text-gray-500");
    expect(container.querySelector("rect")!.getAttribute("class")).toContain("stroke-current");
  });

  it("🔴 NINGÚN tono vive escrito en el dibujo: solo gris, negro y blanco", () => {
    // Todo lo de color sale de `moduleColors.ts` en tiempo de dibujo. Lo único
    // que puede estar escrito acá es lo que NO es un tono: el gris de siempre,
    // el negro del botón de la casa y su letra.
    const NEUTROS = /^(gray|black|white|current)$/;
    const clases = FUENTE_COMPONENTE.match(/\b(?:text|fill|stroke)-[a-z]+(?:-\d{2,3})?\b/g) ?? [];
    const conTono = clases.filter((c) => !NEUTROS.test(c.split("-")[1]));
    expect(conTono, "un color escrito a mano en el dibujo").toEqual([]);
  });
});

/* ═══ EL ACENTO ES EL DEL MÓDULO ══════════════════════════════════════════ */

describe("🔴 el cuadrito se pinta del color de SU módulo", () => {
  it("el acento SALE de `moduleColors.ts`, la misma lista del encabezado", () => {
    expect(FUENTE_COMPONENTE).toContain("getModuleColorByKey");
    expect(acentoDelModulo("guias")).toBe(getModuleColorByKey("guias")!.text);
    expect(acentoDelModulo("cxc")).toBe(getModuleColorByKey("cxc")!.text);
    expect(acentoDelModulo("prestamos")).toBe(getModuleColorByKey("prestamos")!.text);
  });

  it("Guías va esmeralda y Préstamos rosa — no son el mismo color", () => {
    expect(acentoDelModulo("guias")).toBe("text-emerald-500");
    expect(acentoDelModulo("prestamos")).toBe("text-rose-500");
    expect(acentoDelModulo("guias")).not.toBe(acentoDelModulo("prestamos"));
  });

  // ⚠️ CAMBIÓ DE DIRECCIÓN el 9-sep-2026, no se borró. Este caso usaba a
  // COMISIONES como ejemplo de «módulo sin color», y ese día dejó de serlo:
  // Daniel eligió rosado para Comisiones y lima para Asistencia, los dos
  // últimos módulos sin acento propio. Lo que el candado protege NO cambió —
  // «a un módulo sin color NO se le inventa un tono»—, solo el ejemplo.
  it("⚠️ el módulo SIN color en el mapa cae al gris: no se le inventa un tono", () => {
    // Una key que no existe: nadie le inventa un color.
    expect(getModuleColorByKey("modulo-que-no-existe")).toBeNull();
    expect(acentoDelModulo("modulo-que-no-existe")).toBe(ACENTO_SIN_COLOR);
    expect(acentoDelModulo(undefined)).toBe(ACENTO_SIN_COLOR);
    expect(ACENTO_SIN_COLOR.startsWith("text-gray-")).toBe(true);
  });

  // 🔴 EL CONTROL AL REVÉS del caso de arriba: los dos que ANTES caían al gris
  // ahora tienen el suyo, y son distintos entre sí y de todos los demás.
  it("🔴 Comisiones va rosado y Asistencia lima — ya no caen al gris", () => {
    expect(acentoDelModulo("comisiones")).toBe("text-pink-500");
    expect(acentoDelModulo("asistencia")).toBe("text-lime-500");
    for (const k of ["comisiones", "asistencia"]) {
      expect(acentoDelModulo(k)).not.toBe(ACENTO_SIN_COLOR);
    }
    // Y ninguno pisa un tono que ya tenía dueño.
    expect(acentoDelModulo("comisiones")).not.toBe(acentoDelModulo("prestamos"));
    expect(acentoDelModulo("comisiones")).not.toBe(acentoDelModulo("marketing"));
    expect(acentoDelModulo("asistencia")).not.toBe(acentoDelModulo("guias"));
    expect(acentoDelModulo("asistencia")).not.toBe(acentoDelModulo("gastos-contabilidad"));
  });

  it("🔴 los catorce NO salen todos del mismo color", () => {
    const tonos = new Set(
      NOVEDADES.filter((x) => x.dibujo).map((x) => acentoDelModulo(x.modulo)),
    );
    expect(tonos.size, `los cuadritos usan ${tonos.size} color(es)`).toBeGreaterThanOrEqual(5);
  });

  it("y en pantalla el módulo pinta de verdad", () => {
    const g = render(<DibujoNovedad clave="caja-de-bultos-al-despachar" modulo="guias" />);
    expect(g.container.innerHTML).toContain("text-emerald-500");
    cleanup();
    const p = render(<DibujoNovedad clave="de-donde-salio-la-plata" modulo="prestamos" />);
    expect(p.container.innerHTML).toContain("text-rose-500");
    expect(p.container.innerHTML).not.toContain("text-emerald-500");
  });

  it("la tira le pasa el módulo de la novedad, no uno escrito", () => {
    expect(FUENTE_TIRA).toContain("modulo={n.modulo}");
  });
});

/* ═══ EL BOTÓN PRINCIPAL DE LA CASA ES NEGRO RELLENO ══════════════════════ */

describe("🔴 el botón de la casa se dibuja negro, y solo donde LO ES", () => {
  const cajasDe = (k: keyof typeof DIBUJOS) =>
    (DIBUJOS[k].piezas as readonly Pieza[])
      .filter((p): p is Extract<Pieza, { t: "caja" }> => p.t === "caja");

  it("«Cobrar», «Descargar» y «Guardar» son botones negros — medido en la app", () => {
    // `ClientRow.tsx` pinta Cobrar `rounded-md bg-black … text-white`; el botón
    // de la barra del CXC (`cxc/page.tsx`) es `bg-black text-white` y su propio
    // comentario dice «mismo botón, mismo lugar, mismo color»; y el Guardar de
    // la ficha era `bg-black text-white` antes de que lo quitaran (`0b2701d5`).
    const cobrar = cajasDe("una-sola-puerta-cobrar").find((c) => c.texto === "Cobrar");
    const guardar = cajasDe("se-edita-tocando-el-dato").find((c) => c.texto === "Guardar");
    const descargar = cajasDe("exportar-a-descargar").find((c) => c.texto === "Descargar ⌄");
    const exportar = cajasDe("exportar-a-descargar").find((c) => c.texto === "Exportar");
    expect(cobrar?.boton, "«Cobrar» se dibuja como un campo de texto").toBe(true);
    expect(guardar?.boton, "«Guardar» se dibuja como un campo de texto").toBe(true);
    expect(descargar?.boton, "«Descargar» se dibuja como un campo de texto").toBe(true);
    // No se movió, se renombró: el de antes es EL MISMO botón negro.
    expect(exportar?.boton, "«Exportar» era el mismo botón negro").toBe(true);
  });

  it("🩸 y sale del botón de la BARRA, no del gris de adentro del menú", () => {
    // Medir el que no era fue el error de la primera versión: `MenuDescargar`
    // es el `PDF · EXCEL` gris de ADENTRO del menú, no el botón que se busca.
    const barra = leer("src/app/cxc/page.tsx");
    expect(/bg-black[\s\S]{0,900}?Descargar\n/.test(barra), "el botón de la barra dejó de ser negro").toBe(true);
  });

  it("🔴 CONTROL · un DESPLEGABLE no es el botón negro: lleva borde", () => {
    for (const k of ["pestanas-a-selector-y-engranaje", "un-solo-control-de-tiempo", "de-donde-salio-la-plata"] as const) {
      for (const c of cajasDe(k)) {
        expect(c.boton, `«${c.texto}» se pinta de negro y en la app es un desplegable`).toBeFalsy();
      }
    }
  });

  it("y tampoco lo son los campos ni las celdas", () => {
    for (const k of ["flechita-en-el-numero", "caja-de-bultos-al-despachar", "quitar-con-la-equis"] as const) {
      for (const c of cajasDe(k)) {
        expect(c.boton, `«${c.texto}» no es un botón de la app`).toBeFalsy();
      }
    }
  });

  it("el botón negro se RELLENA y su letra va al revés", () => {
    const { container } = render(<DibujoNovedad clave="una-sola-puerta-cobrar" modulo="cxc" />);
    const cobrar = [...container.querySelectorAll("g")].find((g) => g.textContent === "Cobrar")!;
    expect(cobrar.getAttribute("class")).toContain("text-black");
    expect(cobrar.querySelector("rect")!.getAttribute("class")).toContain("fill-current");
    expect(cobrar.querySelector("rect")!.getAttribute("fill")).not.toBe("none");
    expect(cobrar.querySelector("text")!.getAttribute("class")).toContain("fill-white");
  });

  it("⚠️ y se invierte si la pantalla cambia de fondo, no se apaga", () => {
    const { container } = render(<DibujoNovedad clave="una-sola-puerta-cobrar" modulo="cxc" />);
    const cobrar = [...container.querySelectorAll("g")].find((g) => g.textContent === "Cobrar")!;
    expect(cobrar.getAttribute("class")).toContain("dark:text-white");
    expect(cobrar.querySelector("text")!.getAttribute("class")).toContain("dark:fill-black");
  });

  it("el redondeo es el de un botón de la app, no una caja cuadrada", () => {
    // `rounded-md` (6 px) sobre los ~25 px del botón real ⇒ 4 sobre los 16 de acá.
    expect(RADIO).toBeGreaterThan(3);
    const { container } = render(<DibujoNovedad clave="exportar-a-descargar" modulo="cxc" />);
    expect(container.querySelector("rect")!.getAttribute("rx")).toBe(String(RADIO));
  });
});

/* ═══ QUE NO ESTORBE ══════════════════════════════════════════════════════ */

describe("🔴 el cuadrito no estorba", () => {
  it("es chiquito: entra en la línea de texto y no pasa de 200 px de ancho", () => {
    for (const [k, d] of Object.entries(DIBUJOS)) {
      const ancho = anchoTotal(d.piezas);
      expect(ancho, `«${k}» está vacío`).toBeGreaterThan(0);
      expect(ancho, `«${k}» mide ${ancho} px: es un banner, no un cuadrito`).toBeLessThanOrEqual(200);
    }
  });

  it("en el celular se achica en vez de cortar el texto", () => {
    const { container } = render(<DibujoNovedad clave="ocho-pestanas-a-una-lista" />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("class")).toContain("max-w-full");
    // Achicado no se deforma: la proporción se conserva.
    expect(svg.getAttribute("preserveAspectRatio")).toContain("meet");
    // Y el renglón ENVUELVE: el dibujo cae debajo, nunca corta la frase.
    expect(FUENTE_TIRA).toContain("flex flex-wrap items-center");
  });

  it("nada se mueve: `prefers-reduced-motion` no tiene qué apagar", () => {
    for (const [nombre, src] of [["dibujos.ts", FUENTE_DIBUJOS], ["DibujoNovedad.tsx", FUENTE_COMPONENTE]] as const) {
      for (const re of [/\banimate-/, /\btransition\b/, /@keyframes/, /<animate/]) {
        expect(re.test(src), `${nombre} mueve algo: ${re}`).toBe(false);
      }
    }
  });

  it("no trae archivos de imagen ni dependencias nuevas", () => {
    for (const re of [/<img\b/i, /\.png\b/i, /\.svg"/i, /from "(?!@\/|react)/]) {
      expect(re.test(FUENTE_COMPONENTE), `el dibujo trae algo de afuera: ${re}`).toBe(false);
    }
  });
});

/* ═══ LOS ANCHOS SE CALCULAN ══════════════════════════════════════════════ */

describe("🔴 el ancho se deriva del rótulo, no se teclea", () => {
  it("un rótulo más largo hace una caja más ancha", () => {
    const corta: Pieza = { t: "caja", texto: "Ir" };
    const larga: Pieza = { t: "caja", texto: "Descargar el detalle" };
    expect(anchoDePieza(larga)).toBeGreaterThan(anchoDePieza(corta));
  });

  it("una caja de una letra igual se ve: hay ancho mínimo", () => {
    expect(anchoDePieza({ t: "caja", texto: "×" })).toBeGreaterThanOrEqual(22);
  });

  it("las piezas se acomodan una tras otra, sin encimarse", () => {
    const piezas: Pieza[] = [
      { t: "caja", texto: "Exportar" },
      { t: "flecha" },
      { t: "caja", texto: "Descargar ⌄" },
    ];
    const xs = posicionesDe(piezas);
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i], "una pieza se le monta a la anterior")
        .toBeGreaterThan(xs[i - 1] + anchoDePieza(piezas[i - 1]) - 1);
    }
    expect(anchoTotal(piezas)).toBeGreaterThan(xs[xs.length - 1]);
  });

  it("una tira de más pestañas es más ancha", () => {
    expect(anchoDePieza({ t: "pestanas", n: 8 })).toBeGreaterThan(anchoDePieza({ t: "pestanas", n: 4 }));
  });
});

/* ═══ EN LA TIRA ══════════════════════════════════════════════════════════ */

const HOY = new Date("2026-09-09T15:00:00Z");

function almacenDeMentira(): Storage {
  let d: Record<string, string> = {};
  return {
    getItem: (k: string) => (k in d ? d[k] : null),
    setItem: (k: string, v: string) => { d[k] = String(v); },
    removeItem: (k: string) => { delete d[k]; },
    clear: () => { d = {}; },
    key: (i: number) => Object.keys(d)[i] ?? null,
    get length() { return Object.keys(d).length; },
  } as unknown as Storage;
}

function servidorDice(novedades: unknown[]) {
  vi.stubGlobal("fetch", vi.fn(async () => (
    { ok: true, json: async () => ({ novedades }) } as unknown as Response
  )));
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(HOY);
  Object.defineProperty(globalThis, "localStorage", {
    value: almacenDeMentira(), configurable: true, writable: true,
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function dejarQuePase() {
  await act(async () => { vi.advanceTimersByTime(ESPERA_MS + 1); });
}

const SIN = { id: "cxc-sin", modulo: "cxc", fecha: "2026-09-08", texto: "Una regla que cambió." };
const CON = {
  id: "cxc-con", modulo: "cxc", fecha: "2026-09-09",
  texto: "«Exportar» ahora dice «Descargar».", dibujo: "exportar-a-descargar",
};

describe("🔴 en la tira: con dibujo se dibuja, sin dibujo NO cambia nada", () => {
  it("🔴 una novedad SIN dibujo se sigue viendo exactamente como antes", async () => {
    servidorDice([SIN]);
    render(<NovedadesAviso moduloKey="cxc" />);
    await dejarQuePase();
    const li = await screen.findByText("Una regla que cambió.");
    expect(document.querySelector("[data-dibujo]"), "le dibujaron algo que no pidió").toBeNull();
    // El renglón es texto pelado, sin envoltura: el `<li>` no tiene hijos.
    expect(li.tagName).toBe("LI");
    expect(li.children).toHaveLength(0);
    expect(li.className).toBe("text-sm leading-snug text-gray-700");
  });

  it("una novedad CON dibujo lo trae al lado de su texto", async () => {
    servidorDice([CON]);
    render(<NovedadesAviso moduloKey="cxc" />);
    await dejarQuePase();
    await screen.findByText("«Exportar» ahora dice «Descargar».");
    const svg = document.querySelector('[data-dibujo="exportar-a-descargar"]');
    expect(svg).toBeTruthy();
    expect(svg!.closest("li")!.textContent).toContain("«Exportar» ahora dice «Descargar».");
  });

  it("🔴 el dibujo NO rompe el máximo de tres", async () => {
    const cinco = [1, 2, 3, 4, 5].map((i) => ({
      id: `cxc-${i}`, modulo: "cxc", fecha: `2026-09-0${i}`,
      texto: `Cambio ${i} de la cartera.`, dibujo: "exportar-a-descargar",
    }));
    servidorDice(cinco);
    render(<NovedadesAviso moduloKey="cxc" />);
    await dejarQuePase();
    await screen.findByText("Cambio 5 de la cartera.");
    const tira = document.querySelector("[data-novedades]")!;
    expect(tira.querySelectorAll("li")).toHaveLength(3);
    expect(tira.querySelectorAll("[data-dibujo]")).toHaveLength(3);
  });

  it("🔴 un dibujo que el navegador no conoce NO rompe la novedad", async () => {
    // El dato viaja por la red: una llave vieja o de otro despliegue puede
    // llegar. Se muestra el texto y no se dibuja nada — nunca un cuadro roto.
    servidorDice([{ ...CON, dibujo: "esto-no-existe" }]);
    render(<NovedadesAviso moduloKey="cxc" />);
    await dejarQuePase();
    await screen.findByText("«Exportar» ahora dice «Descargar».");
    expect(document.querySelector("[data-dibujo]")).toBeNull();
  });

  it("sin `clave` no se dibuja nada", () => {
    const { container } = render(<DibujoNovedad />);
    expect(container.innerHTML).toBe("");
  });
});
