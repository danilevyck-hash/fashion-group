/**
 * CANDADO DE CONDUCTA — la pestaña de Boston DICE de cuándo es su plata.
 *
 * ─── 🩸 EL DÍA QUE LO HIZO FALTA (19 → 24-ago-2026) ─────────────────────────
 *
 * El 19-ago a las 12:37 Switch cambió el motor de sus reportes y la ruta que
 * usaba `boston-cartera` dejó de existir. La cartera quedó congelada en el
 * 19-ago y durante CINCO días la pestaña siguió mostrando
 *
 *     Total pendiente  $187,018.00 · 383
 *
 * sin una sola palabra sobre la fecha. Se leía como si fuera de hoy. **Un número
 * viejo presentado como actual es peor que no tener número**: con el número
 * ausente uno pregunta; con el número puesto, uno cobra.
 *
 * ─── POR QUÉ ESTE TEST PINTA LA PANTALLA EN VEZ DE LEER EL ARCHIVO ──────────
 *
 * Un barrido estático (`expect(FUENTE).toContain("SyncStatus")`) se satisface con
 * el import: dejaría pasar el componente montado con la empresa equivocada, con
 * `className="hidden"`, o detrás de un `{false && …}`. En este repo ya se
 * comprobó por mutación que un candado de texto se desarma con un `if (false)`
 * sin que nada se ponga rojo. Así que acá se RENDERIZA y se lee lo que el
 * navegador habría mostrado, en las DOS direcciones: con dato viejo el aviso
 * aparece, con dato fresco NO.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";
import React from "react";

import BostonTab from "@/components/cxc/BostonTab";
import { B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";

// ─── Los datos REALES que estaban en pantalla el 24-ago-2026 ────────────────
const CARTERA_BOSTON_RESPUESTA = {
  clientes: [
    {
      codigo: "CB-0001",
      nombre: "CITY MALL PASO CANOA",
      nombre_normalized: "city mall paso canoa",
      d0_90: 51748.18,
      d91_120: 13627.15,
      d121_plus: 121642.67,
      total: 187018.0,
      ultimo_pago_fecha: null,
      ultimo_pago_monto: null,
      tambien_en_grupo: false,
    },
  ],
  totales: { total: 187018.0, d0_90: 51748.18, d91_120: 13627.15, d121_plus: 121642.67, clientes: 383 },
};

/** Lo que `/api/sync-status` contesta. `stale` lo calcula el servidor con su
 *  umbral; acá se le pasa hecho, que es exactamente lo que la pantalla recibe. */
function respuestaSyncStatus(iso: string, vieja: boolean) {
  return {
    ok: true,
    tabla: "estadocuenta",
    last_global: iso,
    por_empresa: { confecciones_boston: iso },
    stale: vieja ? [{ empresa: "confecciones_boston", last_synced_at: iso }] : [],
  };
}

/** El último sync bueno antes de que Switch cambiara: 19-ago-2026 08:10 UTC, o sea
 *  las 3:10 a.m. de Panamá — la hora a la que corre `boston-cartera`. Es el valor
 *  REAL leído de producción el 24-ago-2026. */
const CONGELADA_ISO = "2026-08-19T08:10:00.000Z";
/** Una corrida de hace un rato. */
const FRESCA_ISO = "2026-08-24T08:10:00.000Z";

function montar(syncIso: string, vieja: boolean) {
  const fetchMock = vi.fn(async (url: string) => {
    const u = String(url);
    const cuerpo = u.startsWith("/api/sync-status")
      ? respuestaSyncStatus(syncIso, vieja)
      : u.startsWith("/api/cxc/favorites")
        ? { favorites: [] }
        : CARTERA_BOSTON_RESPUESTA;
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
  return fetchMock;
}

/** Todo el texto que la pantalla realmente pintó. */
const textoPintado = () => document.body.textContent ?? "";

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-08-24T20:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  cleanup();
});

describe("con el dato VIEJO, la pestaña lo dice", () => {
  it("aparece el aviso y NOMBRA a Confecciones Boston", async () => {
    montar(CONGELADA_ISO, true);
    const aviso = await screen.findByRole("status");
    expect(aviso.textContent).toContain("⚠️");
    expect(aviso.textContent).toContain("Confecciones Boston");
    expect(aviso.textContent).toMatch(/sin actualizar desde/i);
  });

  it("dice de qué DÍA es la plata que está mostrando", async () => {
    montar(CONGELADA_ISO, true);
    await screen.findByRole("status");
    const texto = textoPintado();
    // La pantalla habla en hora de Panamá (UTC−5), así que 08:10 UTC se lee como
    // las 3:10 a.m. del 19. Medido en el navegador contra producción, esta línea
    // sale literal: «Actualizado: 19 ago 2026, 3:10 a m».
    expect(texto).toMatch(/Actualizado:/);
    expect(texto).toMatch(/19 ago 2026/);
    expect(texto).toMatch(/3:10/);
    // Y la cifra congelada sigue en pantalla — no se esconde, se fecha.
    expect(texto).toContain("187,018.00");
  });

  it("el aviso vive en la MISMA pantalla que el número, no en otra pestaña", async () => {
    montar(CONGELADA_ISO, true);
    const aviso = await screen.findByRole("status");
    // El total y el aviso comparten el árbol que se está pintando.
    expect(textoPintado()).toContain("187,018.00");
    expect(document.body.contains(aviso)).toBe(true);
  });

  it("y se VE: nadie lo esconde con una clase", async () => {
    // jsdom no resuelve Tailwind, así que un `hidden` / `sr-only` / `opacity-0`
    // pasaría el resto de los tests con el texto igual de presente en el DOM. Se
    // mira la cadena de clases desde el aviso hasta la raíz de la pestaña.
    montar(CONGELADA_ISO, true);
    const aviso = await screen.findByRole("status");
    const ESCONDIDAS = /(^|\s)(hidden|sr-only|invisible|opacity-0)(\s|$)/;
    for (let n: HTMLElement | null = aviso; n && n !== document.body; n = n.parentElement) {
      expect(n.className, `un ancestro del aviso lo esconde: "${n.className}"`).not.toMatch(ESCONDIDAS);
      expect(n.hasAttribute("hidden")).toBe(false);
    }
  });
});

describe("con el dato FRESCO, el aviso NO aparece", () => {
  it("sin ámbar, sin ⚠️ — solo la fecha", async () => {
    montar(FRESCA_ISO, false);
    await waitFor(() => expect(textoPintado()).toMatch(/Actualizado:/));
    expect(screen.queryByRole("status")).toBeNull();
    expect(textoPintado()).not.toContain("⚠️");
    expect(textoPintado()).not.toMatch(/sin actualizar desde/i);
  });
});

describe("🔴 el aviso no mezcla a Boston con el grupo", () => {
  it("solo le pregunta por confecciones_boston, nunca por las 6 del grupo", async () => {
    const fetchMock = montar(CONGELADA_ISO, true);
    await screen.findByRole("status");

    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    const consultaSync = urls.find((u) => u.startsWith("/api/sync-status"));
    expect(consultaSync, "la pestaña no consultó la frescura").toBeTruthy();
    expect(consultaSync).toContain("empresas=confecciones_boston");
    for (const e of B2B_EMPRESA_KEYS) {
      expect(consultaSync, `${e} no tiene nada que hacer en la pestaña de Boston`).not.toContain(e);
    }
  });

  it("ninguna empresa del grupo se pinta en la pestaña", async () => {
    montar(CONGELADA_ISO, true);
    await screen.findByRole("status");
    const texto = textoPintado();
    for (const e of B2B_EMPRESA_KEYS) expect(texto).not.toContain(e);
    for (const nombre of ["Vistana", "Fashion Wear", "Fashion Shoes", "Active Shoes", "Active Wear", "Joystep"]) {
      expect(texto, `${nombre} no puede aparecer acá`).not.toContain(nombre);
    }
  });
});
