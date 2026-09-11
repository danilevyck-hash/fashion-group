// ─────────────────────────────────────────────────────────────────────────────
// CANDADO DE CONDUCTA — Ventas › Clientes con el mockup del 11-sep-2026:
// el desplegable de empresa, «Nuevo», la columna que dice su período y la
// línea de frescura. Se MONTA la pantalla y se lee lo que quedó dibujado.
//
//  🔴 EL FILTRO DE EMPRESA ES UN DESPLEGABLE (Daniel: «B»). Siete píldoras en
//     una fila —cuatro líneas en el celular antes del primer cliente— pasan a
//     ser el mismo desplegable del resto del sistema. Y el universo («Clientes:
//     últimos 12 meses / con compras en 2026») se retiró: no hacía nada en
//     Utilidad y en Ventas era lo mismo que no abrir los plegados.
//
//  🔴 «NUEVO» EN VEZ DE «+0 %». 34 de 116 clientes no tenían con qué compararse
//     y salían «+0 %» en gris, igual que uno estancado. Un cliente con
//     `delta: null` dice «Nuevo»; uno con `delta: 0` sigue diciendo «+0%» —
//     son dos cosas distintas y por eso son dos textos.
//
//  🔴 LA COLUMNA DICE QUÉ PERÍODO SUMA. «Compras · Año 2026» o «Compras ·
//     Últimos 12 meses», según lo que el servidor SIRVIÓ (`data.ventana`).
//
//  🔴 «datos de hoy 10:00 a.m.». La vista se refresca con cada sync y la
//     pantalla dice a qué hora. Sin marca, no dice nada.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";

vi.mock("@/lib/supabase-server", () => ({ supabaseServer: { from: () => ({}) } }));
vi.mock("@/lib/supabase-paginado", () => ({ leerTodoPaginado: async () => [] }));
vi.mock("@/components/shared/SyncNowButton", () => ({
  default: () => <button type="button">Actualizar ahora</button>,
}));

import { ClientesView, ROTULO_NUEVO } from "@/components/ventas/ClientesView";
import type { Clientes, Cliente } from "@/components/ventas/types";
import { ROTULO_TODAS_LAS_EMPRESAS } from "@/lib/ventas/rotulo-empresas";
import { B2B_EMPRESA_KEYS, nombreCortoEmpresa } from "@/lib/empresa-mapping";

// Radix Select necesita estas APIs del navegador que jsdom no trae.
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

afterEach(cleanup);

const cliente = (over: Partial<Cliente>): Cliente => ({
  rank: 1,
  id: "D-1",
  nombre: "CLIENTE",
  empresa: "Vistana",
  empresaKey: "vistana",
  ytd: 1_000,
  prev: 900,
  delta: 0.1,
  ultima: "1 sep 2026",
  ultimaIso: "2026-09-01",
  wa: "",
  empresas_count: 1,
  isOrphan: false,
  ...over,
});

/** Tres clientes: uno que creció, uno SIN base (Nuevo) y uno en cero exacto. */
const DATA = {
  anioComparativo: 2025,
  rows: [
    cliente({ id: "D-25", nombre: "CITY MALL PASO CANOA", ytd: 1_256_838, delta: 0.18, empresas_count: 6, ultimaIso: "2026-09-07", ultima: "7 sep 2026" }),
    cliente({ id: "D-45", nombre: "DISTRIBUIDORA KAREN", ytd: 68_435, prev: 0, delta: null, ultimaIso: "2026-09-07", ultima: "7 sep 2026" }),
    cliente({ id: "D-60", nombre: "ESTANCADO", ytd: 5_000, prev: 5_000, delta: 0, ultimaIso: "2026-09-05", ultima: "5 sep 2026" }),
  ],
} as unknown as Clientes;

function pintar(data: Clientes = DATA, extra: Partial<Parameters<typeof ClientesView>[0]> = {}) {
  return render(
    <ClientesView data={data} selectedYear={2026} isClosedYear={false} modo="ventas" onModo={() => {}} {...extra} />,
  );
}

const tabla = () => document.querySelector("table") as HTMLElement;
const encabezados = () => [...tabla().querySelectorAll("thead th")].map((th) => th.textContent?.trim() ?? "");

const plano = (rel: string) =>
  readFileSync(path.join(process.cwd(), rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n").map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1")).join("\n");

// ─────────────────────────────────────────────────────────────────────────────
describe("b · el filtro de empresa es UN desplegable, y no quedan píldoras", () => {
  it("🔴 hay un solo `data-empresa-clientes`, y abre con «Todas las empresas» puesta", () => {
    pintar();
    const triggers = document.querySelectorAll("[data-empresa-clientes]");
    expect(triggers).toHaveLength(1);
    expect(triggers[0].textContent).toContain(ROTULO_TODAS_LAS_EMPRESAS);
    // Mide 44 px de alto: la regla táctil de la casa.
    expect(triggers[0].className).toContain("h-11");
  });

  it("abierto, ofrece «Todas las empresas» y las seis del grupo con nombre corto", async () => {
    pintar();
    fireEvent.keyDown(document.querySelector("[data-empresa-clientes]") as HTMLElement, { key: "ArrowDown" });
    await screen.findByRole("option", { name: ROTULO_TODAS_LAS_EMPRESAS });
    const opciones = screen.getAllByRole("option").map((o) => (o.textContent ?? "").trim());
    expect(opciones).toEqual([ROTULO_TODAS_LAS_EMPRESAS, ...B2B_EMPRESA_KEYS.map((k) => nombreCortoEmpresa(k))]);
    // Y NO dice «Fashion Group»: acá las únicas que hay son las del grupo.
    expect(opciones).not.toContain("Fashion Group");
    expect(opciones).not.toContain("Todas");
  });

  it("🩸 no queda ni una píldora de empresa ni el desplegable del universo", () => {
    pintar();
    expect(screen.queryAllByRole("button", { name: "Todas" })).toHaveLength(0);
    for (const k of B2B_EMPRESA_KEYS) {
      expect(screen.queryAllByRole("button", { name: nombreCortoEmpresa(k) })).toHaveLength(0);
    }
    expect(document.querySelector("[data-universo-clientes]")).toBeNull();
    const src = plano("src/components/ventas/ClientesView.tsx");
    expect(src).not.toContain("EMPRESA_PILLS");
    expect(src).not.toContain("data-universo-clientes");
    expect(src).not.toContain("Clientes: últimos 12 meses");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("c · «Nuevo» es distinto de «+0 %»", () => {
  it("🔴 el cliente sin base dice «Nuevo» en la fila Y en la tarjeta", () => {
    pintar();
    const nuevos = document.querySelectorAll("[data-nuevo]");
    // La tabla del escritorio y la tarjeta del celular se montan a la vez en jsdom.
    expect(nuevos).toHaveLength(2);
    for (const n of nuevos) expect(n.textContent?.trim()).toBe(ROTULO_NUEVO);
    expect(ROTULO_NUEVO).toBe("Nuevo");
    // Y va en la celda de cambio de ESE cliente, no en otra.
    const fila = document.querySelector('tr[data-fila-cliente="vistana|D-45"]')!;
    expect(fila.querySelector("[data-nuevo]")).toBeTruthy();
  });

  it("🔴 el que está en cero exacto NO dice «Nuevo»: dice su porcentaje", () => {
    pintar();
    const fila = document.querySelector('tr[data-fila-cliente="vistana|D-60"]')!;
    expect(fila.querySelector("[data-nuevo]")).toBeNull();
    expect(fila.querySelector('[data-col="delta"]')?.textContent).toContain("+0%");
    // Y el que creció tampoco.
    const cm = document.querySelector('tr[data-fila-cliente="vistana|D-25"]')!;
    expect(cm.querySelector("[data-nuevo]")).toBeNull();
    expect(cm.querySelector('[data-col="delta"]')?.textContent).toContain("+18%");
  });

  it("ordenando por el cambio, los «Nuevo» quedan al FINAL en los dos sentidos", () => {
    pintar();
    const th = screen.getByText(/vs 2025/);
    const orden = () =>
      [...tabla().querySelectorAll("tbody tr[data-fila-cliente]")].map((tr) => tr.getAttribute("data-fila-cliente"));
    fireEvent.click(th); // desc
    expect(orden().at(-1)).toBe("vistana|D-45");
    fireEvent.click(th); // asc
    expect(orden().at(-1)).toBe("vistana|D-45");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("d · la columna dice el período que el servidor SIRVIÓ", () => {
  it("sin ventana: «Compras · Año 2026» y «vs 2025»", () => {
    pintar();
    const hs = encabezados().join("|");
    expect(hs).toContain("Compras · Año 2026");
    expect(hs).toContain("vs 2025");
    expect(hs).not.toContain("Compras 2026");
  });

  it("🔴 con `data.ventana = 12`: «Compras · Últimos 12 meses» y «vs año anterior»", () => {
    pintar({ ...DATA, ventana: 12, ventanasDisponibles: [12, 6] } as Clientes, { periodo: { tipo: "ultimos", n: 12 } });
    const hs = encabezados().join("|");
    expect(hs).toContain("Compras · Últimos 12 meses");
    expect(hs).toContain("vs año anterior");
    expect(hs).not.toContain("vs 2025");
  });

  it("🔴 se pidió la ventana pero el servidor sirvió el año → la columna dice el AÑO, nunca lo que no se sumó", () => {
    pintar({ ...DATA, ventana: null, ventanasDisponibles: [] } as Clientes, { periodo: { tipo: "ultimos", n: 12 } });
    const hs = encabezados().join("|");
    expect(hs).toContain("Compras · Año 2026");
    expect(hs).not.toContain("Últimos 12 meses");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("e · la línea de frescura", () => {
  it("con marca, dice a qué hora se refrescó (escritorio y celular)", () => {
    vi.useFakeTimers({ now: new Date("2026-09-11T17:00:00Z") });
    try {
      pintar({ ...DATA, actualizadoAt: "2026-09-11T15:00:00Z" } as Clientes);
      const lineas = [...document.querySelectorAll("[data-frescura-clientes]")];
      expect(lineas.length).toBeGreaterThanOrEqual(1);
      for (const l of lineas) expect(l.textContent).toContain("datos de hoy 10:00 a.m.");
    } finally {
      vi.useRealTimers();
    }
  });

  it("sin marca, no se dice nada", () => {
    pintar({ ...DATA, actualizadoAt: null } as Clientes);
    expect(document.querySelector("[data-frescura-clientes]")).toBeNull();
    expect(document.body.textContent).not.toContain("datos de hoy");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("f · el control segmentado ofrece exactamente Ventas y Utilidad", () => {
  it("dos opciones, y ninguna «Margen %»", () => {
    pintar();
    const grupos = [...document.querySelectorAll("[data-control-segmentado]")];
    expect(grupos.length).toBeGreaterThanOrEqual(1);
    for (const g of grupos) {
      const tabs = [...g.querySelectorAll('[role="tab"]')].map((t) => t.textContent?.trim());
      expect(tabs).toEqual(["Ventas", "Utilidad"]);
    }
  });

  it("el botón de descarga dice «Descargar en Excel», no «Excel» a secas", () => {
    pintar();
    expect(screen.getAllByRole("button", { name: /Descargar en Excel/ }).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole("button", { name: /^Excel$/ })).toBeNull();
  });
});
