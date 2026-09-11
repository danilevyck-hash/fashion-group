// ─────────────────────────────────────────────────────────────────────────────
// 🔴 «QUÉ CAMBIÓ» SE MUESTRA UNA VEZ — MOSTRARLA YA CUENTA (10-sep-2026)
//
// Daniel, textual: *«se muestra una vez y se va solo al cerrarlo; si no lo
// cierran, no se vuelve a mostrar»*. Hasta ese día lo visto se anotaba solo al
// tocar la ×, así que quien no la tocaba la veía en cada visita. Ahora se anota
// al DIBUJARSE, con el mismo mecanismo (localStorage + POST a la base) y sin
// tabla nueva; la × la sigue apagando en el acto.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act, waitFor, fireEvent } from "@testing-library/react";
import NovedadesAviso, { ESPERA_MS, LLAVE_LOCAL } from "@/components/NovedadesAviso";

const HOY = new Date("2026-09-10T15:00:00Z");
const DOS = [
  { id: "cxc-a", modulo: "cxc", fecha: "2026-09-08", texto: "Cambio a de la cartera." },
  { id: "cxc-b", modulo: "cxc", fecha: "2026-09-09", texto: "Cambio b de la cartera." },
];

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

let llamadas: { url: string; init?: RequestInit }[] = [];
function servidorDice(novedades: unknown[]) {
  llamadas = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    llamadas.push({ url: String(url), init });
    return { ok: true, json: async () => ({ novedades }) } as unknown as Response;
  }));
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(HOY);
  Object.defineProperty(globalThis, "localStorage", { value: almacenDeMentira(), configurable: true, writable: true });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const tira = () => document.querySelector("[data-novedades]") as HTMLElement | null;
async function dejarQuePase() { await act(async () => { vi.advanceTimersByTime(ESPERA_MS + 1); }); }
const posts = () => llamadas.filter((l) => l.init?.method === "POST");

describe("🔴 mostrarla ya cuenta como vista", () => {
  it("al dibujarse queda anotada en este navegador y en la base, SIN tocar la ×", async () => {
    servidorDice(DOS);
    render(<NovedadesAviso moduloKey="cxc" />);
    await dejarQuePase();
    await screen.findByText("Cambio b de la cartera.");
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(JSON.parse(String(posts()[0].init!.body))).toEqual({ ids: ["cxc-b", "cxc-a"] });
    expect(JSON.parse(localStorage.getItem(LLAVE_LOCAL)!)).toEqual(["cxc-b", "cxc-a"]);
    // Y la tira SIGUE en pantalla: anotarla no la apaga.
    expect(tira()).not.toBeNull();
  });

  it("🔴 si no la cierran, a la siguiente visita NO vuelve", async () => {
    servidorDice(DOS);
    const primera = render(<NovedadesAviso moduloKey="cxc" />);
    await dejarQuePase();
    await screen.findByText("Cambio b de la cartera.");
    await waitFor(() => expect(posts()).toHaveLength(1));
    primera.unmount();
    // Segunda visita: el servidor todavía la manda (la DDL puede estar pendiente).
    servidorDice(DOS);
    render(<NovedadesAviso moduloKey="cxc" />);
    await dejarQuePase();
    expect(tira()).toBeNull();
    expect(screen.queryByText("Cambio b de la cartera.")).toBeNull();
  });

  it("la × la apaga en el acto y no vuelve a anotar lo ya anotado", async () => {
    servidorDice(DOS);
    render(<NovedadesAviso moduloKey="cxc" />);
    await dejarQuePase();
    await screen.findByText("Cambio b de la cartera.");
    await waitFor(() => expect(posts()).toHaveLength(1));
    fireEvent.click(screen.getByLabelText("Cerrar avisos"));
    expect(tira()).toBeNull();
    expect(posts()).toHaveLength(1);
  });
});
