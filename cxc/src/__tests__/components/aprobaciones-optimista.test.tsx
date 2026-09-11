// ─────────────────────────────────────────────────────────────────────────────
// 🔴 APROBAR NO ESPERA (10-sep-2026). Daniel: *«¿por qué al seleccionar un
// colaborador en aprobaciones se pone como un segundo cada vez que aprieto? no
// debería ser así»*. Cada toque hacía el POST y después volvía a pedir el
// período entero, apagando la pantalla ~1 s. Ahora (CLAUDE.md › UX Principles,
// «Optimistic UI»):
//   1. la casilla y los contadores cambian EN EL ACTO, el POST va detrás;
//   2. solo la casilla que viaja se apaga; dos toques = dos POST;
//   3. UNA recarga completa, 1,5 s después del último toque — y el servidor
//      manda: lo que devuelva reemplaza lo local;
//   4. si el POST falla, la casilla vuelve a como estaba y sale el aviso.
// Nada cambia en la ruta ni en lo que se guarda.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, act } from "@testing-library/react";
import { ToastProvider } from "@/components/ToastSystem";
import AprobacionesTab, { RECARGA_MS } from "@/app/asistencia/AprobacionesTab";
import { aplicarAprobacionLocal, previoDe, revertirAprobacionLocal, resumenPendientes, type DiaAprobacion } from "@/lib/asistencia/aprobaciones";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/asistencia",
  useSearchParams: () => new URLSearchParams(),
}));

const gente = (xs: Array<[string, string, number, boolean]>) =>
  xs.map(([codigo, etiqueta, minutos, aprobado]) => ({
    codigo, etiqueta, empresa: "vistana", empresaEtiqueta: "Vistana", salida: "18:11",
    minutos, diurnoMin: minutos, nocturnoMin: 0, domFerMin: 0, tipo: "extra" as const,
    aprobado, por: aprobado ? "Julio" : null, cuando: null, minutosVistos: aprobado ? minutos : null, cambio: false,
  }));
const DIAS: DiaAprobacion[] = [
  { fecha: "2026-08-24", etiqueta: "lun 24 ago", semana: "2026-08-24", minutos: 178,
    gente: gente([["11", "JULIO GARAY", 107, false], ["6", "KEVIN LUBO", 71, false]]) },
  { fecha: "2026-08-25", etiqueta: "mar 25 ago", semana: "2026-08-24", minutos: 55,
    gente: gente([["9", "LUIS ARROYO", 55, false]]) },
];

/** Un servidor cuyo POST se resuelve cuando el test quiere, y que cuenta los GET. */
let gets = 0;
let posts: Array<{ resolver: (ok: boolean) => void }> = [];
let respuestaGet: DiaAprobacion[] = DIAS;
function servidor() {
  gets = 0; posts = [];
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).startsWith("/api/asistencia/aprobaciones")) {
      return new Promise<Response>((resolve) => {
        posts.push({ resolver: (ok) => resolve({ ok, json: async () => (ok ? { ok: true } : { error: "No se pudo guardar" }) } as Response) });
      });
    }
    gets += 1;
    void init;
    return { ok: true, json: async () => ({ aprobaciones: respuestaGet, puedeAprobar: true, avisos: {} }) } as Response;
  });
}
const casilla = (re: RegExp) => screen.getAllByRole("checkbox").find((c) => re.test(c.getAttribute("aria-label") ?? "")) as HTMLInputElement;
const toca = async (el: Element) => { await act(async () => { (el as HTMLElement).click(); }); };
async function montar() {
  render(<ToastProvider><AprobacionesTab /></ToastProvider>);
  await waitFor(() => expect(screen.getByText(/lun 24/)).toBeTruthy());
  await toca(screen.getByText(/lun 24/).closest("button")!);
}

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); respuestaGet = DIAS; vi.stubGlobal("fetch", servidor()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("el módulo puro", () => {
  it("aplica y revierte sin mutar; los contadores salen del mismo estado", () => {
    const items = [{ codigo: "6", fecha: "2026-08-24", minutos: 71 }];
    const previo = previoDe(DIAS, items);
    expect([...previo.entries()]).toEqual([["6|2026-08-24", false]]);
    const despues = aplicarAprobacionLocal(DIAS, items, true);
    expect(despues[0].gente[1].aprobado).toBe(true);
    expect(DIAS[0].gente[1].aprobado).toBe(false);
    expect(resumenPendientes(despues).pendientes).toBe(2);
    expect(revertirAprobacionLocal(despues, previo)[0].gente[1].aprobado).toBe(false);
  });
});

describe("🔴 1 · el toque se ve en el acto, sin esperar el fetch", () => {
  it("la casilla queda marcada y el contador baja ANTES de que el POST conteste", async () => {
    await montar();
    expect(screen.getByText(/sin aprobar/).parentElement!.textContent).toMatch(/^3sin aprobar/);
    await toca(casilla(/Aprobar KEVIN LUBO/));
    expect(posts).toHaveLength(1);           // el POST salió…
    expect(casilla(/Aprobar KEVIN LUBO/).checked).toBe(true); // …y la casilla ya está marcada
    expect(screen.getByText(/sin aprobar/).parentElement!.textContent).toMatch(/^2sin aprobar/);
  });

  it("🔴 solo la casilla que viaja se apaga; otra persona se puede tocar → dos POST", async () => {
    await montar();
    await toca(casilla(/Aprobar KEVIN LUBO/));
    expect(casilla(/Aprobar KEVIN LUBO/).disabled).toBe(true);
    expect(casilla(/Aprobar JULIO GARAY/).disabled).toBe(false);
    await toca(casilla(/Aprobar JULIO GARAY/));
    expect(posts).toHaveLength(2);
    expect(casilla(/Aprobar JULIO GARAY/).checked).toBe(true);
  });
});

describe("🔴 4 · si el POST falla, la casilla vuelve a como estaba", () => {
  it("revierte y avisa", async () => {
    await montar();
    await toca(casilla(/Aprobar KEVIN LUBO/));
    expect(casilla(/Aprobar KEVIN LUBO/).checked).toBe(true);
    await act(async () => { posts[0].resolver(false); });
    await waitFor(() => expect(casilla(/Aprobar KEVIN LUBO/).checked).toBe(false));
    expect(casilla(/Aprobar KEVIN LUBO/).disabled).toBe(false);
    expect(screen.getByText(/No se pudo guardar/)).toBeTruthy();
    expect(screen.getByText(/sin aprobar/).parentElement!.textContent).toMatch(/^3sin aprobar/);
  });
});

describe("🔴 3 · N toques → UNA recarga, y el servidor manda", () => {
  it("tres toques seguidos: tres POST, y un solo GET después de 1,5 s", async () => {
    await montar();
    const antes = gets;
    await toca(casilla(/Aprobar KEVIN LUBO/));
    await toca(casilla(/Aprobar JULIO GARAY/));
    await act(async () => { posts.forEach((p) => p.resolver(true)); });
    await toca(screen.getByText(/mar 25/).closest("button")!);
    await toca(casilla(/Aprobar LUIS ARROYO/));
    await act(async () => { posts[2].resolver(true); });
    expect(posts).toHaveLength(3);
    expect(gets).toBe(antes);                              // todavía no recargó
    await act(async () => { vi.advanceTimersByTime(RECARGA_MS - 100); });
    expect(gets).toBe(antes);
    await act(async () => { vi.advanceTimersByTime(200); });
    await waitFor(() => expect(gets).toBe(antes + 1));     // UNA sola
  });

  it("🔴 lo que diga el servidor reemplaza lo local (es lo que la planilla paga)", async () => {
    await montar();
    await toca(casilla(/Aprobar KEVIN LUBO/));
    await act(async () => { posts[0].resolver(true); });
    expect(casilla(/Aprobar KEVIN LUBO/).checked).toBe(true);
    // El servidor dice otra cosa (alguien lo desaprobó desde otra pantalla).
    respuestaGet = DIAS;
    await act(async () => { vi.advanceTimersByTime(RECARGA_MS + 100); });
    await waitFor(() => expect(casilla(/Aprobar KEVIN LUBO/).checked).toBe(false));
  });
});
