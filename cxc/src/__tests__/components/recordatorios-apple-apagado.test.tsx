// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO — `RECORDATORIOS_APPLE_2026_10` APAGADO = RECORDATORIOS DE HOY,
// BYTE POR BYTE (9-oct-2026).
//
// Pinta la lista (un cheque vencido, uno pendiente, uno devuelto y una nota) y
// compara el HTML entero contra `__snapshots__/recordatorios-apple-apagado…`,
// sacado con el código de `origin/main` ANTES del rediseño. Prendido, se pone
// rojo, y el bloque de abajo dice qué trae la propuesta.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const interruptor = vi.hoisted(() => ({ prendido: false }));
vi.mock("@/lib/recordatorios/apple-2026-10", () => ({
  get RECORDATORIOS_APPLE_2026_10() { return interruptor.prendido; },
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/recordatorios",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/lib/hooks/useAuth", () => ({ useAuth: () => ({ authChecked: true, role: "secretaria", isOwner: false }) }));
vi.mock("@/lib/OnlineContext", () => ({
  useOnline: () => true,
  useOnlineContext: () => ({ online: true }),
  OnlineProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/AppHeader", () => ({ default: () => <div data-testid="encabezado" /> }));

import { render, cleanup } from "@testing-library/react";
import RecordatoriosClient, { type Cheque } from "@/app/recordatorios/RecordatoriosClient";
import { ContextMenuProvider } from "@/components/ui";
import type { Recordatorio } from "@/lib/recordatorios/recordatorio";

function almacen(): Storage {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); },
    clear: () => m.clear(), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } } as Storage;
}

const HOY = "2026-10-09";
const base = { banco: "", notas: "", vendedor: "Rey", fecha_depositado: null, created_at: "2026-10-01T00:00:00.000Z" };
const CHEQUES: Cheque[] = [
  { ...base, id: "c1", cliente: "Hanna Calzados", empresa: "fashion_shoes", numero_cheque: "000835", monto: 7500, fecha_deposito: "2026-10-15", estado: "pendiente" },
  { ...base, id: "c2", cliente: "Xtreme Shoes", empresa: "vistana", numero_cheque: "001585", monto: 1000, fecha_deposito: "2026-10-02", estado: "pendiente" },
  { ...base, id: "c3", cliente: "Grupo Hanna, S.A.", empresa: "fashion_wear", numero_cheque: "000833", monto: 10, fecha_deposito: "2026-10-01", estado: "rebotado", motivo_rebote: "Fondos insuficientes" } as Cheque,
];
const RECS: Recordatorio[] = [
  { id: "r1", fecha: "2026-10-20", texto: "Recordar cobrar", cliente: "", clienteCodigo: null, repeticion: "una_vez", hasta: null, destino: "equipo", creadoPor: "daniel", createdAt: "2026-10-01T00:00:00.000Z" },
];

function pintar() {
  return render(
    <ContextMenuProvider>
      <RecordatoriosClient initialData={{ cheques: CHEQUES, recordatorios: RECS, faltaMigracionRecordatorios: false, hoy: HOY, puedeElegirDestino: false }} />
    </ContextMenuProvider>,
  ).container;
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-10-09T15:00:00.000Z"));
  vi.stubGlobal("localStorage", almacen());
  vi.stubGlobal("sessionStorage", almacen());
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (String(url).includes("/api/recordatorios")) return { ok: true, json: async () => ({ recordatorios: RECS, faltaMigracion: false }) };
    return { ok: true, json: async () => [] };
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); interruptor.prendido = false; });

describe("Recordatorios — interruptor APAGADO = la pantalla de hoy", () => {
  it("la lista: HTML idéntico al de origin/main", () => {
    expect(pintar().innerHTML).toMatchSnapshot();
  });
});

describe("Recordatorios — interruptor PRENDIDO = la propuesta", () => {
  it("los renglones de un grupo van en UNA caja, sin tarjeta por renglón", () => {
    interruptor.prendido = true;
    const c = pintar();
    const cajas = c.querySelectorAll('[data-agenda-caja]');
    expect(cajas.length).toBeGreaterThan(0);
    expect(c.querySelector('[data-cheque-fila="c1"]')!.className).not.toContain("rounded-lg");
  });
  it("el chip «Pendiente» sale; el de devuelto se queda", () => {
    interruptor.prendido = true;
    const c = pintar();
    expect(c.querySelector('[data-cheque-fila="c1"] [data-cheque-campo="estado"]')).toBeNull();
    expect(c.querySelector('[data-cheque-fila="c3"] [data-cheque-campo="estado"]')).not.toBeNull();
    expect(c.querySelector('[data-cheque-fila="c1"]')!.textContent).toMatch(/15 oct 2026 ·\s*N° 000835\s*· Fashion Shoes/);
  });
  it("sin el renglón «Nuevo recordatorio»; «＋ Nuevo» sigue siendo la puerta", () => {
    interruptor.prendido = true;
    const c = pintar();
    expect(c.querySelector('[aria-label="Nuevo recordatorio"]')).toBeNull();
    expect(c.querySelector("[data-puerta-boton]")).not.toBeNull();
    expect(c.querySelector("[data-puerta-boton]")!.closest("[data-fila-controles]")).not.toBeNull();
  });
});
