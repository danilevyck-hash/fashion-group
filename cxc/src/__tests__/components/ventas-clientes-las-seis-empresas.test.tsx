// ─────────────────────────────────────────────────────────────────────────────
// CANDADO — Ventas › Clientes ofrece LAS SEIS de Fashion Group, ni una más
//
// Daniel, 2-sep-2026, mirando la pantalla: *"deberían estar solo las 6 de
// Fashion Group, que son las 5 de las fotos y joystep"*. Faltaba **joystep**.
//
// ─── QUÉ ERA Y QUÉ NO ERA (medido antes de tocar nada) ──────────────────────
// El comentario que estaba en el código decía que joystep se ocultaba por
// "decisión visual". No era eso: era una lista escrita a mano que se quedó en 5
// cuando joystep entró al grupo. Y **la plata nunca faltó**, lo cual decidía si
// esto era cosmético o grave: el modo "Todas" lee `clientes_agregado_12m_vw`,
// que incluye a joystep desde siempre — medido en producción, joystep aporta 14
// filas de cliente al ranking y su venta ya estaba dentro del total. Lo que no
// se podía era FILTRAR por ella: sus clientes no se dejaban aislar.
//
// 🩸 ES LA CUARTA VEZ QUE UNA LISTA DE EMPRESAS COPIADA A MANO CUESTA ALGO.
// El precedente exacto está en el post-mortem de Comisiones: `ComisionesView.tsx`
// tenía su propio `B2B_EMPRESA_KEYS.filter(k => k !== "joystep")` mientras las
// otras tres vistas ya leían la constante. Antes de eso, joystep fuera del sync
// de recibos y de utilidad costó **$15.262,00 de cobros invisibles**.
//
// ─── POR QUÉ SE RENDERIZA Y NO SE LEE LA CONSTANTE ──────────────────────────
// Que la lista derive de `B2B_EMPRESA_KEYS` no prueba que la pantalla pinte
// las seis: un `.slice()`, un `hidden` o un `{cond && …}` en el `.map()`
// dejarían el test verde con joystep invisible otra vez. Acá se monta la vista
// REAL y se leen las opciones que el navegador habría mostrado.
//
// 🔁 11-sep-2026: las píldoras pasaron a un DESPLEGABLE (Daniel: «B») y la
// lista vive en `lib/ventas/rotulo-empresas.ts` (`opcionesEmpresaClientes`).
// La primera opción dice «Todas las empresas», no «Todas»: la regla de
// `rotuloDeTodas`. Lo que este archivo vigila NO cambió: QUIÉNES son las seis
// y que se DERIVEN. Se abre el Radix Select con el teclado (jsdom no trae
// `hasPointerCapture` ni `scrollIntoView`, se doblan abajo).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, afterEach, vi, beforeAll } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { readFileSync } from "fs";
import path from "path";

beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  window.HTMLElement.prototype.hasPointerCapture = vi.fn(() => false) as never;
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  window.HTMLElement.prototype.setPointerCapture = vi.fn();
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

// `mundos.ts` importa Supabase para su lectura de `switch_clientes`; acá solo se
// usan sus constantes, así que se dobla el cliente.
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: { from: () => ({}) } }));
vi.mock("@/lib/supabase-paginado", () => ({ leerTodoPaginado: async () => [] }));

import { ClientesView } from "@/components/ventas/ClientesView";
import { B2B_EMPRESA_KEYS, EMPRESA_KEY_TO_NAME, nombreCortoEmpresa } from "@/lib/empresa-mapping";
import { EMPRESA_CARTERA_BOSTON, EMPRESA_MOSTRADOR_MULTIFASHION } from "@/lib/clientes/mundos";
import { ROTULO_TODAS_LAS_EMPRESAS } from "@/lib/ventas/rotulo-empresas";

/** Una fila mínima con la forma que la vista espera. */
const fila = (over: Partial<Record<string, unknown>> = {}) => ({
  rank: 1,
  id: "D-24",
  nombre: "City Mall David",
  empresa: "Vistana International",
  empresaKey: "vistana",
  ytd: 113936.14,
  prev: 90000,
  delta: 0.26,
  ultima: "1 sep 2026",
  ultimaIso: "2026-09-01",
  wa: "",
  empresas_count: 1,
  isOrphan: false,
  esDelGrupo: false,
  ...over,
});

const DATA = { rows: [fila()] } as unknown as Parameters<typeof ClientesView>[0]["data"];

afterEach(cleanup);

/** Abre el desplegable de empresa y devuelve sus opciones, tal como se pintan. */
async function opcionesEnPantalla(): Promise<string[]> {
  render(<ClientesView data={DATA} selectedYear={2026} isClosedYear={false} modo="ventas" onModo={() => {}} />);
  const trigger = document.querySelector("[data-empresa-clientes]") as HTMLElement;
  expect(trigger, "no está el desplegable de empresa").toBeTruthy();
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  await screen.findByRole("option", { name: ROTULO_TODAS_LAS_EMPRESAS });
  return screen.getAllByRole("option").map((o) => (o.textContent ?? "").trim());
}

/** Los rótulos de las seis, con el nombre CORTO (diccionario § 0, #4). */
const pillsEnPantalla = async (): Promise<string[]> => {
  const nombres = [ROTULO_TODAS_LAS_EMPRESAS, ...B2B_EMPRESA_KEYS.map((k) => nombreCortoEmpresa(k))];
  const opciones = await opcionesEnPantalla();
  return nombres.filter((n) => opciones.includes(n));
};

describe("Ventas › Clientes — el desplegable de empresas", () => {
  it("pinta JOYSTEP, que es lo que faltaba", async () => {
    expect(await pillsEnPantalla()).toContain(nombreCortoEmpresa("joystep"));
  });

  it("pinta las SEIS de Fashion Group más «Todas las empresas», y nada más", async () => {
    // El conjunto exacto: ni de menos (el bug de hoy) ni de más (meter a Boston
    // o a Multifashion acá sería el bug OPUESTO, y más caro).
    expect(await opcionesEnPantalla()).toEqual([
      ROTULO_TODAS_LAS_EMPRESAS,
      ...B2B_EMPRESA_KEYS.map((k) => nombreCortoEmpresa(k)),
    ]);
    // CONTROL — el nombre corto sale de la MISMA lista que el largo: es su
    // segundo campo, no un cuarto mapa de nombres (que es el problema que el
    // diccionario vino a arreglar). Las claves tienen que ser las mismas.
    expect(Object.keys(EMPRESA_KEY_TO_NAME).sort())
      .toEqual([...B2B_EMPRESA_KEYS, EMPRESA_CARTERA_BOSTON, EMPRESA_MOSTRADOR_MULTIFASHION].sort());
  });

  it("NO ofrece Confecciones Boston ni Multifashion", async () => {
    // 🔴 Sus clientes viven en su propio módulo. `docs/postmortems/boston-cxc.md`.
    const opciones = await opcionesEnPantalla();
    for (const key of [EMPRESA_CARTERA_BOSTON, EMPRESA_MOSTRADOR_MULTIFASHION]) {
      expect(opciones, `${key} no puede ofrecerse en Ventas › Clientes`).not.toContain(nombreCortoEmpresa(key));
    }
  });

  it("la lista se DERIVA: no hay nombres de empresa escritos a mano, ni en la vista ni en el módulo", () => {
    // El barrido que impide que alguien "arregle" el conjunto agregando la línea
    // que falta en vez de derivarla — que es como nació este bug. 🔁 11-sep-2026:
    // la lista se mudó de `EMPRESA_PILLS` (ClientesView) a
    // `opcionesEmpresaClientes` (rotulo-empresas.ts); se vigilan los dos lados.
    const plano = (rel: string) =>
      readFileSync(path.join(process.cwd(), rel), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    const modulo = plano("src/lib/ventas/rotulo-empresas.ts");
    const decl = /export function opcionesEmpresaClientes[\s\S]*?\n\}/.exec(modulo)?.[0] ?? "";
    expect(decl, "no se encontró `opcionesEmpresaClientes`").not.toBe("");
    expect(decl).toContain("B2B_EMPRESA_KEYS");
    const vista = plano("src/components/ventas/ClientesView.tsx");
    expect(vista).toContain("opcionesEmpresaClientes()");
    expect(vista, "las píldoras volvieron").not.toContain("EMPRESA_PILLS");
    for (const key of B2B_EMPRESA_KEYS) {
      expect(decl, `"${key}" está escrito a mano en opcionesEmpresaClientes`).not.toContain(`"${key}"`);
      expect(vista, `"${key}" está escrito a mano en ClientesView`).not.toContain(`"${key}"`);
    }
  });
});
