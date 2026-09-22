/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 EL TOTAL DE BULTOS DEL PIE SIGUE A LO QUE SE VE (22-sep-2026)
 *
 * Daniel aprobó con un «sí» que el número de la derecha del pie deje de contar
 * guías que no están en pantalla.
 *
 * 🩸 LO QUE PASABA. En la MISMA línea del pie convivían dos números y solo uno
 * seguía al filtro: a la izquierda «30 guías de 236» (lo dibujado) y a la
 * derecha los bultos de las 236. Medido contra producción el 22-sep-2026:
 *
 *      236 guías vivas · 576 renglones · 8.433 bultos
 *      la lista abre con la ventana de 30 días → 30 guías · 1.629 bultos
 *      el pie decía                            → 8.433 bultos  (5,2 veces más)
 *
 * 🔴 LA REGLA DE LA CASA, y este pie es justo el caso que nombra: *«o el total
 * sigue al filtro, o no hay buscador»*.
 *
 * 🔴 LOS DOS NÚMEROS SALEN DE LA MISMA LISTA (`mostradas`), y la suma vive en
 * UN solo lugar (`sumarBultos`), el mismo que usa la banda del total del Excel.
 *
 * ⚠️ SE SUMA EL NÚMERO **FINAL**, el que firmó el transportista: `total_bultos`
 * lo arma `GET /api/guias` con `guia_items.bultos`, la columna que bodega
 * CORRIGE al despachar. `bultos_original` es el rastro de lo que había antes y
 * no se suma en ninguna parte — en el papel, el PDF y el Excel sale el final.
 *
 * 🔴 CANDADO DE CONDUCTA: se RENDERIZA y se lee el DOM. Un barrido de texto se
 * cumple con el comentario que explica el cambio.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import GuiasList from "@/app/guias/components/GuiasList";
import type { Guia, GuiaItem } from "@/app/guias/components/types";
import { sumarBultos } from "@/lib/guias/pie-de-la-lista";

// El GET de la ruta se prueba con la base mockeada: es donde nace
// `total_bultos`, y es el único lugar desde donde alguien podría empezar a
// sumar `bultos_original` sin que la pantalla se entere.
const mockFrom = vi.fn();
vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: { from: (...args: unknown[]) => mockFrom(...args) },
}));
vi.mock("@/lib/require-auth", () => ({
  getSession: vi.fn().mockReturnValue({ role: "admin", userName: "Test" }),
}));
vi.mock("@/lib/log-activity", () => ({ logActivity: vi.fn() }));

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({}) })));
  vi.setSystemTime(new Date("2026-09-22T15:00:00Z"));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function item(over: Partial<GuiaItem> = {}): GuiaItem {
  return {
    id: "i1", orden: 1, cliente: "City Mall Paso Canoa", cliente_codigo: "D-25",
    direccion: "Paso Canoas", empresa: "Fashion Wear", facturas: "2520", bultos: 7,
    numero_guia_transp: "725",
    ...over,
  } as GuiaItem;
}

function guia(over: Partial<Guia> = {}): Guia {
  const items = (over.guia_items as GuiaItem[] | undefined) ?? [item()];
  return {
    id: "g240", numero: 240, fecha: "2026-09-18", transportista: "RedNblue",
    modo_entrega: "transportista", transportista_id: "t1", placa: "EK0700",
    observaciones: "", item_count: items.length, estado: "Completada",
    entregado_por: "Julio", receptor_nombre: "Eric", cedula: "8-930-2142",
    numero_guia_transp: "725",
    total_bultos: items.reduce((s, i) => s + (i.bultos || 0), 0),
    ...over,
    guia_items: items,
  } as Guia;
}

function pintar(guias: Guia[], props: Record<string, unknown> = {}) {
  return render(
    <GuiasList
      guias={guias} loading={false} error={null} search="" setSearch={() => {}}
      showPending={false} setShowPending={() => {}} role="admin" onNewGuia={() => {}}
      expandedId={null} expandedGuia={null} expandedLoading={false} onToggleExpand={() => {}}
      onEditar={() => {}} onDespachar={() => {}} onDelete={() => {}}
      onAtarCliente={() => {}}
      {...props}
    />,
  );
}

/** El número de bultos del pie, tal como se lee en pantalla. */
const bultosDelPie = (c: HTMLElement) =>
  (c.querySelector<HTMLElement>('[data-testid="pie-bultos"]')?.textContent || "").trim();

/** Dentro de la ventana de 30 días (hoy es el 22-sep-2026). */
const RECIENTE_A = guia({ id: "gA", numero: 240, fecha: "2026-09-18", guia_items: [item({ id: "a1", bultos: 7 })] });
const RECIENTE_B = guia({
  id: "gB", numero: 239, fecha: "2026-09-10", transportista: "Edwin",
  guia_items: [item({ id: "b1", bultos: 5, cliente: "Golden Mall", cliente_codigo: "D-60" })],
});
/** Fuera de la ventana: espera detrás de «Ver guías más viejas». */
const VIEJA = guia({
  id: "gV", numero: 100, fecha: "2026-06-19",
  guia_items: [item({ id: "v1", bultos: 300, cliente: "Plaza Los Angeles", cliente_codigo: "D-77" })],
});

// ─── 1 · el total sigue a la VENTANA ─────────────────────────────────────────

describe("🔴 1 · el total de bultos cuenta lo que está dibujado, no la historia", () => {
  it("🩸 con guías detrás del botón, el pie NO suma las escondidas", () => {
    const { container } = pintar([RECIENTE_A, RECIENTE_B, VIEJA]);
    // Lo que se ve: dos guías, 12 bultos. Detrás del botón: una de 300.
    expect(container.textContent, "el pie de guías tiene que decir lo dibujado").toContain("2 guías de 3");
    expect(bultosDelPie(container)).toBe("12 bultos");
    expect(bultosDelPie(container), "sumó las 3 guías, como antes").not.toBe("312 bultos");
  });

  it("al abrir «Ver guías más viejas» los bultos crecen con la lista", () => {
    const { container, getByText } = pintar([RECIENTE_A, RECIENTE_B, VIEJA]);
    fireEvent.click(getByText(/Ver guías más viejas/));
    expect(container.textContent).toContain("3 guías");
    expect(bultosDelPie(container)).toBe("312 bultos");
  });

  it("sin nada escondido, el pie dice los bultos de todas", () => {
    const { container } = pintar([RECIENTE_A, RECIENTE_B]);
    expect(bultosDelPie(container)).toBe("12 bultos");
  });
});

// ─── 2 · el total sigue a la BÚSQUEDA y al filtro ────────────────────────────

describe("🔴 2 · «o el total sigue al filtro, o no hay buscador»", () => {
  it("con algo tecleado, solo cuenta las que coinciden", () => {
    // 🔴 Buscar abre la ventana entera (19-sep-2026), así que la vieja entra a
    // la lista: lo que la deja afuera del total es el BUSCADOR.
    const { container } = pintar([RECIENTE_A, RECIENTE_B, VIEJA], { search: "Edwin" });
    expect(bultosDelPie(container)).toBe("5 bultos");
  });

  it("buscar una guía VIEJA la encuentra, y sus bultos son los que se cuentan", () => {
    const { container } = pintar([RECIENTE_A, RECIENTE_B, VIEJA], { search: "Plaza Los Angeles" });
    expect(container.textContent).toContain("1 guía de 3");
    expect(bultosDelPie(container)).toBe("300 bultos");
  });

  it("una búsqueda sin resultados no deja un total colgado", () => {
    const { container } = pintar([RECIENTE_A, VIEJA], { search: "no existe este cliente" });
    expect(container.textContent).toContain("No hay guías");
    expect(container.querySelector('[data-testid="pie-bultos"]')).toBeNull();
  });

  it("con el filtro «solo pendientes», los bultos son los de las pendientes", () => {
    const PENDIENTE = guia({
      id: "gP", numero: 241, fecha: "2026-09-19", estado: "Pendiente Bodega",
      guia_items: [item({ id: "p1", bultos: 4 })],
    });
    const { container } = pintar([PENDIENTE, RECIENTE_A, RECIENTE_B], { showPending: true });
    expect(bultosDelPie(container)).toBe("4 bultos");
  });
});

// ─── 3 · el número FINAL, nunca el original ──────────────────────────────────

describe("🔴 3 · se suman los bultos FINALES, los que firmó el transportista", () => {
  it("una guía con bultos corregidos por bodega cuenta el número corregido", () => {
    // Bodega contó 8 donde la secretaria había puesto 3: el papel, el PDF y el
    // Excel dicen 8, y el pie tiene que decir lo mismo.
    const CORREGIDA = guia({
      id: "gC", numero: 242, fecha: "2026-09-17",
      guia_items: [item({ id: "c1", bultos: 8, bultos_original: 3, bultos_corregido_por: "Bodega" } as Partial<GuiaItem>)],
    });
    const { container } = pintar([CORREGIDA]);
    expect(bultosDelPie(container)).toBe("8 bultos");
    expect(bultosDelPie(container), "sumó el rastro en vez del número final").not.toBe("3 bultos");
  });

  it("y `sumarBultos` mira `total_bultos`, no los renglones ni su rastro", () => {
    const g = { total_bultos: 8, guia_items: [{ bultos: 8, bultos_original: 3 }] };
    expect(sumarBultos([g])).toBe(8);
    // Una guía sin renglones cargados conserva su total: contarla por renglón
    // la dejaría en cero.
    expect(sumarBultos([{ total_bultos: 6, guia_items: [] }])).toBe(6);
    expect(sumarBultos([])).toBe(0);
    expect(sumarBultos([{ total_bultos: null }, { total_bultos: undefined }, { total_bultos: 5 }])).toBe(5);
  });

  it("🔴 y el `total_bultos` que sirve la ruta sale de `bultos`, nunca de `bultos_original`", async () => {
    const filas = [
      {
        id: "g1", numero: 1, fecha: "2026-09-18", estado: "Completada",
        guia_items: [
          { orden: 1, bultos: 8, bultos_original: 3, facturas: "1", cliente: "X" },
          { orden: 2, bultos: 2, bultos_original: 9, facturas: "2", cliente: "Y" },
        ],
      },
    ];
    mockFrom.mockReturnValue({
      select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: filas, error: null }) }) }),
    });
    const { GET } = await import("@/app/api/guias/route");
    const { NextRequest } = await import("next/server");
    const req = new NextRequest("http://localhost/api/guias");
    req.cookies.set(
      "cxc_session",
      Buffer.from(JSON.stringify({ role: "admin", userId: "u1", userName: "Test" })).toString("base64url"),
    );
    const json = (await (await GET(req)).json()) as Array<{ total_bultos: number }>;
    expect(json[0].total_bultos, "8 + 2 = 10, el número final").toBe(10);
    expect(json[0].total_bultos, "sumó el rastro: 3 + 9").not.toBe(12);
  });
});

// ─── 4 · UNA sola suma en todo el módulo ─────────────────────────────────────

describe("🔴 4 · la suma de bultos vive en UN solo lugar", () => {
  const leer = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

  it("ni la lista ni el Excel tienen su propio `reduce` de `total_bultos`", () => {
    for (const rel of [
      "src/app/guias/components/GuiasList.tsx",
      "src/app/guias/components/excel-guias.ts",
    ]) {
      const codigo = leer(rel)
        .split("\n")
        .filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*"))
        .join("\n");
      expect(/reduce\([^)]*total_bultos/.test(codigo.replace(/\s+/g, " ")), rel).toBe(false);
      expect(codigo, `${rel} tiene que usar la suma común`).toContain("sumarBultos(");
    }
  });

  it("🔴 y la suma común NO conoce el rastro: solo sabe de `total_bultos`", () => {
    // Un módulo que empieza a mirar `guia_items`/`bultos_original` es la
    // antesala de sumarlos. Se mira el CÓDIGO, no los comentarios —que sí los
    // nombran, para explicar por qué no se usan—.
    const codigo = leer("src/lib/guias/pie-de-la-lista.ts")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("//"))
      .join("\n");
    expect(codigo).not.toContain("bultos_original");
    expect(codigo).not.toContain("guia_items");
    expect(codigo).toContain("total_bultos");
  });

  it("el pie se arma con la MISMA lista que se dibuja", () => {
    const codigo = leer("src/app/guias/components/GuiasList.tsx");
    expect(codigo).toContain("const mostradas = [...pendientes, ...visible];");
    expect(codigo).toContain("sumarBultos(mostradas)");
    expect(codigo).toContain("textoPieDeLista(mostradas.length, guias.length)");
    // 🩸 Lo que había antes: el conteo seguía a lo dibujado y la suma se hacía
    // sobre `filtered`, que incluye lo que espera detrás del botón.
    expect(codigo).not.toContain("sumarBultos(filtered)");
  });
});
