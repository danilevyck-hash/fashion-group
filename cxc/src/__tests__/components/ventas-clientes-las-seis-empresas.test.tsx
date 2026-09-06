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
// Que `EMPRESA_PILLS` derive de `B2B_EMPRESA_KEYS` no prueba que la pantalla
// pinte las seis: un `.slice()`, un `hidden` o un `{cond && …}` en el `.map()`
// dejarían el test verde con joystep invisible otra vez. Acá se monta la vista
// REAL y se leen los botones que el navegador habría mostrado.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { readFileSync } from "fs";
import path from "path";

// `mundos.ts` importa Supabase para su lectura de `switch_clientes`; acá solo se
// usan sus constantes, así que se dobla el cliente.
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: { from: () => ({}) } }));
vi.mock("@/lib/supabase-paginado", () => ({ leerTodoPaginado: async () => [] }));

import { ClientesView } from "@/components/ventas/ClientesView";
import { B2B_EMPRESA_KEYS, EMPRESA_KEY_TO_NAME, nombreCortoEmpresa } from "@/lib/empresa-mapping";
import { EMPRESA_CARTERA_BOSTON, EMPRESA_MOSTRADOR_MULTIFASHION } from "@/lib/clientes/mundos";

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

/** Los rótulos de los botones de la tira de empresas, tal como se pintan. */
function pillsEnPantalla(): string[] {
  render(<ClientesView data={DATA} selectedYear={2026} isClosedYear={false} modo="ventas" onModo={() => {}} />);
  // 🔁 5-sep-2026: el rótulo de la píldora es el nombre CORTO («Vistana», no
  // «Vistana International») — diccionario § 0, #4, decidido por Daniel ese
  // día. Lo que este archivo vigila NO cambió: QUIÉNES son las seis y que la
  // lista se DERIVE de `B2B_EMPRESA_KEYS` en vez de escribirse a mano, que fue
  // lo que dejó a joystep afuera.
  const nombres = ["Todas", ...B2B_EMPRESA_KEYS.map((k) => nombreCortoEmpresa(k))];
  return nombres.filter((n) => screen.queryAllByRole("button", { name: n }).length > 0);
}

describe("Ventas › Clientes — la tira de empresas", () => {
  it("pinta JOYSTEP, que es lo que faltaba", () => {
    expect(pillsEnPantalla()).toContain(nombreCortoEmpresa("joystep"));
  });

  it("pinta las SEIS de Fashion Group más «Todas», y nada más", () => {
    // El conjunto exacto: ni de menos (el bug de hoy) ni de más (meter a Boston
    // o a Multifashion acá sería el bug OPUESTO, y más caro).
    expect(pillsEnPantalla()).toEqual([
      "Todas",
      ...B2B_EMPRESA_KEYS.map((k) => nombreCortoEmpresa(k)),
    ]);
    // CONTROL — el nombre corto sale de la MISMA lista que el largo: es su
    // segundo campo, no un cuarto mapa de nombres (que es el problema que el
    // diccionario vino a arreglar). Las claves tienen que ser las mismas.
    expect(Object.keys(EMPRESA_KEY_TO_NAME).sort())
      .toEqual([...B2B_EMPRESA_KEYS, EMPRESA_CARTERA_BOSTON, EMPRESA_MOSTRADOR_MULTIFASHION].sort());
  });

  it("NO ofrece Confecciones Boston ni Multifashion", () => {
    // 🔴 Sus clientes viven en su propio módulo. `docs/postmortems/boston-cxc.md`.
    render(<ClientesView data={DATA} selectedYear={2026} isClosedYear={false} modo="ventas" onModo={() => {}} />);
    for (const key of [EMPRESA_CARTERA_BOSTON, EMPRESA_MOSTRADOR_MULTIFASHION]) {
      expect(
        screen.queryAllByRole("button", { name: nombreCortoEmpresa(key) }),
        `${key} no puede tener botón en Ventas › Clientes`,
      ).toHaveLength(0);
    }
  });

  it("la lista se DERIVA: no hay nombres de empresa escritos a mano en la vista", () => {
    // El barrido que impide que alguien "arregle" el conjunto agregando la línea
    // que falta en vez de derivarla — que es como nació este bug.
    const src = readFileSync(
      path.join(process.cwd(), "src/components/ventas/ClientesView.tsx"),
      "utf8",
    ).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    const decl = /const\s+EMPRESA_PILLS[\s\S]*?\n\];/.exec(src)?.[0] ?? "";
    expect(decl, "no se encontró la declaración de EMPRESA_PILLS").not.toBe("");
    expect(decl).toContain("B2B_EMPRESA_KEYS");
    for (const key of B2B_EMPRESA_KEYS) {
      expect(decl, `"${key}" está escrito a mano en EMPRESA_PILLS`).not.toContain(`"${key}"`);
    }
  });
});
