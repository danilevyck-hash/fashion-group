/**
 * CANDADO DE CONDUCTA — la línea de lo que quedó AFUERA se DIBUJA.
 *
 * ─── POR QUÉ ESTE TEST PINTA LA PANTALLA EN VEZ DE LEER EL ARCHIVO ──────────
 *
 * Un barrido de texto (`expect(FUENTE).toContain("AvisoRechazosSwitch")`) se
 * satisface con el `import` — y encima con el COMENTARIO que explica el cambio.
 * Este repo ya pagó CUATRO veces ese candado. Dejaría pasar el componente
 * montado con `texto={null}` a mano, escondido con una clase, o detrás de un
 * `{false && …}`. Acá se RENDERIZA y se lee lo que el navegador habría
 * mostrado, en las DOS direcciones: con rechazo la línea aparece; sin rechazo
 * NO se dibuja nada.
 *
 * 🔴 Y SE VERIFICA QUE EL NÚMERO NO SE HAYA MOVIDO: el total de Boston tiene
 * que seguir diciendo $198,296.55 con la línea a la vista. La opción de mostrar
 * el dato crudo se descartó explícitamente — la cartera pasaría a
 * $266,739,648.55 y dejaría de servir para cobrar.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";
import React from "react";

import BostonTab from "@/components/cxc/BostonTab";
import AvisoRechazosSwitch from "@/components/AvisoRechazosSwitch";

/** El texto EXACTO que arma el módulo único para el documento real de Boston. */
const LINEA =
  "1 documento fuera de la cuenta: el 155-000000129 llega con $266,541,352.00. Está mal en Switch.";

/** Los números REALES de la pestaña de Boston (medidos en producción). */
const TOTALES = {
  total: 198296.55,
  d0_90: 52169.15,
  d91_120: 13969.43,
  d121_plus: 132157.97,
  clientes: 386,
};

const CARTERA = {
  clientes: [
    {
      codigo: "CB-0001",
      nombre: "CITY MALL PASO CANOA",
      nombre_normalized: "city mall paso canoa",
      d0_90: 52169.15,
      d91_120: 13969.43,
      d121_plus: 132157.97,
      total: 198296.55,
      ultimo_pago_fecha: null,
      ultimo_pago_monto: null,
      tambien_en_grupo: false,
    },
  ],
  totales: TOTALES,
};

function montarBoston(avisoMontos: string | null) {
  const fetchMock = vi.fn(async (url: string) => {
    const u = String(url);
    const cuerpo = u.startsWith("/api/sync-status")
      ? {
          ok: true,
          tabla: "estadocuenta",
          last_global: "2026-08-25T02:11:00.000Z",
          por_empresa: { confecciones_boston: "2026-08-25T02:11:00.000Z" },
          stale: [],
        }
      : u.startsWith("/api/cxc/favorites")
        ? { favorites: [] }
        : { ...CARTERA, avisoMontos };
    return { ok: true, status: 200, json: async () => cuerpo } as unknown as Response;
  });
  vi.stubGlobal("fetch", fetchMock);

  // Caché de SWR propia por test: sin esto el segundo `render` reusaría la
  // respuesta del primero y los dos casos darían el mismo resultado.
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <BostonTab />
    </SWRConfig>,
  );
}

const textoPintado = () => document.body.textContent ?? "";

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-08-25T20:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  cleanup();
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. LA PESTAÑA DE BOSTON — el caso que Daniel pidió
// ─────────────────────────────────────────────────────────────────────────────

describe("la pestaña de Boston DICE qué se quedó afuera", () => {
  it("la línea se dibuja, con el documento y el monto", async () => {
    montarBoston(LINEA);
    await waitFor(() => expect(textoPintado()).toContain("198,296.55"));
    const aviso = document.querySelector('[data-aviso="rechazos-switch"]');
    expect(aviso, "no se dibujó la línea").toBeTruthy();
    expect(aviso!.textContent).toContain("155-000000129");
    expect(aviso!.textContent).toContain("266,541,352.00");
    expect(aviso!.textContent).toContain("Está mal en Switch");
  });

  it("🔴 EL TOTAL NO SE MOVIÓ: sigue en $198,296.55 · 386 clientes", async () => {
    montarBoston(LINEA);
    await waitFor(() => expect(textoPintado()).toContain("198,296.55"));
    const texto = textoPintado();
    expect(texto).toContain("198,296.55");
    expect(texto).toContain("386");
    // El dato crudo se descartó a propósito: con él la cartera diría esto.
    expect(texto).not.toContain("266,739,648.55");
  });

  it("va ARRIBA del total, no debajo (Daniel: «y arriba aparece…»)", async () => {
    montarBoston(LINEA);
    await waitFor(() => expect(textoPintado()).toContain("198,296.55"));
    const aviso = document.querySelector('[data-aviso="rechazos-switch"]')!;
    const total = Array.from(document.querySelectorAll("span")).find((s) =>
      (s.textContent ?? "").includes("198,296.55"),
    )!;
    expect(total, "no encontré el total en pantalla").toBeTruthy();
    // DOCUMENT_POSITION_FOLLOWING = el total va DESPUÉS del aviso.
    expect(aviso.compareDocumentPosition(total) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("se VE: nadie la esconde con una clase", async () => {
    montarBoston(LINEA);
    await waitFor(() => expect(textoPintado()).toContain("198,296.55"));
    let nodo: Element | null = document.querySelector('[data-aviso="rechazos-switch"]');
    while (nodo) {
      const cls = nodo.className;
      const clases = typeof cls === "string" ? cls : "";
      expect(clases, `escondida en ${nodo.tagName}`).not.toMatch(/\bhidden\b|\bsr-only\b|\binvisible\b/);
      nodo = nodo.parentElement;
    }
  });

  it("🔴 SIN RECHAZOS NO SE DIBUJA NADA (ni un cartel de 'todo bien')", async () => {
    montarBoston(null);
    await waitFor(() => expect(textoPintado()).toContain("198,296.55"));
    expect(document.querySelector('[data-aviso="rechazos-switch"]')).toBeNull();
    expect(textoPintado()).not.toContain("fuera de la cuenta");
    expect(textoPintado()).not.toContain("Está mal en Switch");
  });

  it("sin rechazos el total tampoco se mueve", async () => {
    montarBoston(null);
    await waitFor(() => expect(textoPintado()).toContain("198,296.55"));
    expect(textoPintado()).toContain("386");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. LA PIEZA — ámbar, no rojo; una línea, cero párrafos
// ─────────────────────────────────────────────────────────────────────────────

describe("cómo se ve la línea", () => {
  it("va en ÁMBAR, no en rojo — no se rompió nada", () => {
    render(<AvisoRechazosSwitch texto={LINEA} />);
    const aviso = document.querySelector('[data-aviso="rechazos-switch"]')!;
    const clases = aviso.className;
    expect(clases).toMatch(/amber/);
    expect(clases).not.toMatch(/\btext-red-/);
  });

  it("con `null` no devuelve NADA, ni un contenedor vacío", () => {
    const { container } = render(<AvisoRechazosSwitch texto={null} />);
    expect(container.innerHTML).toBe("");
  });

  it("con `undefined` tampoco (una respuesta vieja sin el campo)", () => {
    const { container } = render(<AvisoRechazosSwitch texto={undefined} />);
    expect(container.innerHTML).toBe("");
  });

  it("con texto vacío tampoco — un aviso en blanco es peor que ninguno", () => {
    const { container } = render(<AvisoRechazosSwitch texto="" />);
    expect(container.innerHTML).toBe("");
  });

  it("es UNA línea: no parte el texto en párrafos", () => {
    render(<AvisoRechazosSwitch texto={LINEA} />);
    const aviso = document.querySelector('[data-aviso="rechazos-switch"]')!;
    expect(aviso.querySelectorAll("p").length).toBe(0);
    expect(aviso.textContent).toContain(LINEA);
  });

  it("no dice nada de más: el texto pintado ES el que armó el módulo", () => {
    render(<AvisoRechazosSwitch texto={LINEA} />);
    const aviso = document.querySelector('[data-aviso="rechazos-switch"]')!;
    // Solo se le agrega el ⚠️; ninguna pantalla puede sumarle explicaciones.
    expect((aviso.textContent ?? "").replace("⚠️", "").trim()).toBe(LINEA);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. NADIE ESCRIBE EL MENSAJE POR SU CUENTA
// ─────────────────────────────────────────────────────────────────────────────

describe("una sola redacción en todo el sistema", () => {
  it("ninguna pantalla escribe 'fuera de la cuenta' ni 'Está mal en Switch' a mano", async () => {
    const { readFileSync, readdirSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");

    const DUENOS = [
      "src/lib/rechazos-de-switch.ts",
      // El texto se cita en su propio candado y en el de conducta.
      "src/__tests__/lib/rechazos-de-switch.test.ts",
      "src/__tests__/components/rechazos-visibles-en-pantalla.test.tsx",
      // Este exige la línea EXACTA al final de la cadena sync → log → texto.
      "src/__tests__/lib/rechazo-queda-registrado.test.ts",
    ];

    function listar(dir: string, out: string[] = []): string[] {
      for (const e of readdirSync(dir)) {
        if (e === "node_modules" || e === ".next") continue;
        const ruta = join(dir, e);
        if (statSync(ruta).isDirectory()) listar(ruta, out);
        else if (/\.(ts|tsx)$/.test(e)) out.push(ruta);
      }
      return out;
    }

    // 🩸 SE BORRAN LOS COMENTARIOS PRIMERO. Cada pantalla explica en un
    // comentario qué dibuja, y ese comentario contiene el texto — el candado se
    // cumpliría con su propia explicación. Este repo ya pagó cuatro veces eso.
    const sinComentarios = (t: string) =>
      t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

    const culpables = listar(join(process.cwd(), "src"))
      .map((ruta) => ({ rel: ruta.slice(process.cwd().length + 1), texto: readFileSync(ruta, "utf8") }))
      .filter((f) => !DUENOS.includes(f.rel))
      // ⚠️ "fuera del catálogo" NO entra al patrón: es castellano corriente y
      // ya lo usa un test de dominio de ventas para otra cosa. Alcanza con las
      // dos frases que SOLO puede producir este módulo — y "Está mal en Switch"
      // está en TODAS las variantes, así que ninguna se escapa.
      .filter((f) => /fuera de la cuenta|Está mal en Switch/.test(sinComentarios(f.texto)))
      .map((f) => f.rel);

    expect(
      culpables,
      'Estos archivos escriben el mensaje a mano. Usá `lineaDeRechazos` de "@/lib/rechazos-de-switch".',
    ).toEqual([]);
  });
});
