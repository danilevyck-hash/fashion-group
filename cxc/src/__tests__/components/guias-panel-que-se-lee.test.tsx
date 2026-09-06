/**
 * ─────────────────────────────────────────────────────────────────────────────
 * EL PANEL DE GUÍAS, LEÍDO EN LA PANTALLA (5-sep-2026).
 *
 * Seis cambios que Daniel aprobó de una: *«no, mándalo así»*.
 *
 *   1. **Fuera el chip verde «despachada»** — salía en **221 de 222** tarjetas.
 *      Un color que sale siempre deja de avisar; se reserva para lo que espera.
 *   2. **Arriba, una línea con lo que falta**, que LLEVA a esa guía. Si no hay
 *      ninguna, no aparece.
 *   3. **La pendiente sube arriba de la lista**, con «Despachar» a la vista.
 *   4. **«Compartir» e «Imprimir» en la fila, sin desplegarla**; «Editar» y
 *      «Eliminar guía» al «···».
 *   5. **La lista abre con el último mes**, el resto detrás de «Ver guías más
 *      viejas».
 *   6. **El orden de lo que se lee**: el CLIENTE arriba (49 valores, es lo que
 *      distingue una guía, 49 códigos), el transportista al final (7 etiquetas). La fecha y
 *      el estado salen de la fila.
 *
 * 🔴 CANDADO DE CONDUCTA: se RENDERIZA y se lee el DOM. Un barrido de texto se
 * cumple con el comentario que explica el cambio — en este repo ya pasó cuatro
 * veces.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import GuiasList from "@/app/guias/components/GuiasList";
import type { Guia, GuiaItem } from "@/app/guias/components/types";
import { fmtDate } from "@/lib/format";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({}) })));
  vi.setSystemTime(new Date("2026-09-05T15:00:00Z"));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const ITEMS: GuiaItem[] = [
  { id: "i1", orden: 1, cliente: "City Mall Paso Canoa", cliente_codigo: "D-25", direccion: "Paso Canoas", empresa: "Fashion Wear", facturas: "2520", bultos: 7, numero_guia_transp: "725" },
];

function guia(over: Partial<Guia> = {}): Guia {
  return {
    id: "g240",
    numero: 240,
    fecha: "2026-09-04",
    transportista: "RedNblue",
    modo_entrega: "transportista",
    transportista_id: "t1",
    placa: "EK0700",
    observaciones: "",
    total_bultos: 7,
    item_count: 1,
    estado: "Completada",
    entregado_por: "Julio",
    receptor_nombre: "Eric",
    cedula: "8-930-2142",
    numero_guia_transp: "725",
    guia_items: ITEMS,
    ...over,
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

const PENDIENTE = guia({ id: "g239", numero: 239, fecha: "2026-09-01", estado: "Pendiente Bodega" });

// ─────────────────────────────────────────────────────────────────────────────
describe("1 · el chip verde «despachada» se fue", () => {
  it("🔴 una guía despachada no dice su estado: eran 221 de 222 diciendo lo mismo", () => {
    const { container } = pintar([guia()]);
    expect(container.textContent).not.toContain("despachada");
  });

  it("🔴 pero la que ESPERA sí se pinta — el color se reserva para eso", () => {
    const { container } = pintar([PENDIENTE]);
    expect(container.textContent).toContain("pendiente");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("2 · arriba, la línea con lo que falta", () => {
  it("🔴 dice cuántas son y hace cuánto — el caso real de producción", () => {
    pintar([guia(), PENDIENTE]);
    expect(screen.getByText("1 guía sin despachar — hace 4 días")).toBeTruthy();
  });

  it("🔴 lleva a esa guía", () => {
    const abrir = vi.fn();
    pintar([guia(), PENDIENTE], { onToggleExpand: abrir });
    fireEvent.click(screen.getByText("1 guía sin despachar — hace 4 días"));
    expect(abrir).toHaveBeenCalledWith("g239");
  });

  it("🔴 sin ninguna pendiente NO aparece — nada de un cero grande", () => {
    const { container } = pintar([guia()]);
    expect(container.textContent).not.toContain("sin despachar");
    expect(container.textContent).not.toContain("0 guías");
  });

  it("🔴 la ve TODO el que abre la lista, no solo bodega", () => {
    // 🩸 El banner viejo salía con `role === "bodega"`, y Angela y andrea —que
    // crean el 99% de las guías— nunca lo vieron.
    for (const rol of ["admin", "secretaria", "bodega", "vendedor"]) {
      cleanup();
      pintar([guia(), PENDIENTE], { role: rol });
      expect(screen.getByText("1 guía sin despachar — hace 4 días"), rol).toBeTruthy();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("3 · la pendiente sube arriba, con «Despachar» a la vista", () => {
  it("🔴 sale ANTES que las despachadas, aunque sea más vieja", () => {
    const { container } = pintar([guia(), PENDIENTE]);
    const texto = container.textContent || "";
    expect(texto.indexOf("GT-239")).toBeLessThan(texto.indexOf("GT-240"));
  });

  it("🔴 y fuera de los grupos de fecha: no queda enterrada", () => {
    const { container } = pintar([guia(), PENDIENTE]);
    // El encabezado del grupo lleva la cuenta entre paréntesis. La pendiente no
    // está adentro de ninguno: los grupos suman UNA sola guía.
    expect(container.textContent).toMatch(/\(1 guía\)/);
  });

  it("«Despachar» está en la fila, sin desplegar, y NAVEGA", () => {
    const despachar = vi.fn();
    pintar([PENDIENTE], { onDespachar: despachar });
    fireEvent.click(screen.getByRole("button", { name: /^Despachar$/ }));
    expect(despachar).toHaveBeenCalledWith("g239");
  });

  it("🔴 una guía ya despachada NO ofrece «Despachar»", () => {
    pintar([guia()]);
    expect(screen.queryByRole("button", { name: /^Despachar$/ })).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("4 · Compartir e Imprimir en la fila; Editar y Eliminar en el «···»", () => {
  it("🔴 los dos botones están SIN desplegar la guía", () => {
    pintar([guia()]);
    expect(screen.getByRole("button", { name: "Imprimir la guía GT-240" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Compartir la guía GT-240" })).toBeTruthy();
  });

  it("🔴 y el «···» ahora tiene DOS opciones, no una", () => {
    const { container } = pintar([guia()]);
    fireEvent.click(container.querySelector('[aria-haspopup="menu"]')!);
    const items = Array.from(document.querySelectorAll('[role="menuitem"]')).map((e) => (e.textContent || "").trim());
    expect(items).toEqual(["Editar", "Eliminar guía"]);
  });

  it("🔴 «Editar» del menú NAVEGA, no edita en la lista", () => {
    const editar = vi.fn();
    const { container } = pintar([guia()], { onEditar: editar });
    fireEvent.click(container.querySelector('[aria-haspopup="menu"]')!);
    fireEvent.click(
      Array.from(document.querySelectorAll('[role="menuitem"]')).find((e) => e.textContent === "Editar")!,
    );
    expect(editar).toHaveBeenCalledWith("g240");
  });

  it("🔴 el papel se pide COMPLETO: la fila no tiene las firmas", () => {
    // 🩸 `GET /api/guias` deja las firmas afuera a propósito (7,3 MB medidos en
    // las 156 guías firmadas). Imprimir la guía de la lista tal cual habría
    // sacado un papel SIN FIRMAS — que es justo lo que ese papel respalda.
    const llamadas: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (u: string) => { llamadas.push(String(u)); return { ok: true, json: async () => guia() }; }));
    pintar([guia()]);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Imprimir la guía GT-240" }));
    expect(llamadas).toContain("/api/guias/g240");
  });

  it("🔴 una guía que YA trae sus firmas no se vuelve a pedir", () => {
    const llamadas: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (u: string) => { llamadas.push(String(u)); return { ok: true, json: async () => guia() }; }));
    pintar([guia({ firma_base64: "data:image/png;base64,x" })]);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Imprimir la guía GT-240" }));
    expect(llamadas.filter((u) => u === "/api/guias/g240")).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("5 · la lista abre con el último mes", () => {
  const VIEJA = guia({ id: "gv", numero: 100, fecha: "2026-06-15" });

  it("🔴 lo viejo no se dibuja, y el botón dice CUÁNTO queda", () => {
    const { container } = pintar([guia(), VIEJA]);
    expect(container.textContent).toContain("GT-240");
    expect(container.textContent).not.toContain("GT-100");
    expect(screen.getByRole("button", { name: /Ver guías más viejas \(1\)/ })).toBeTruthy();
  });

  it("tocarlo trae el resto, y el botón se va", () => {
    const { container } = pintar([guia(), VIEJA]);
    fireEvent.click(screen.getByRole("button", { name: /Ver guías más viejas/ }));
    expect(container.textContent).toContain("GT-100");
    expect(screen.queryByRole("button", { name: /Ver guías más viejas/ })).toBeNull();
  });

  it("🔴 sin nada viejo el botón no aparece", () => {
    pintar([guia()]);
    expect(screen.queryByRole("button", { name: /Ver guías más viejas/ })).toBeNull();
    // Y el «Ver más (N restantes)» de 15 en 15 no volvió.
    expect(screen.queryByRole("button", { name: /restantes/ })).toBeNull();
  });

  it("⚠️ el TOTAL sigue contando todas las guías filtradas, no solo las dibujadas", () => {
    const { container } = pintar([guia(), VIEJA]);
    expect(container.textContent).toContain("2 guías");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("6 · el orden de lo que se lee", () => {
  const fila = (c: HTMLElement) => c.querySelector<HTMLElement>(".hidden.lg\\:flex")!;
  const tarjeta = (c: HTMLElement) => c.querySelector<HTMLElement>(".lg\\:hidden.px-4")!;

  it("🔴 ESCRITORIO: Guía · Cliente · Destino · Bultos · Transportista", () => {
    const { container } = pintar([guia()]);
    const texto = (fila(container).textContent || "").replace(/\s+/g, " ").trim();
    expect(texto).toContain("GT-240");
    const iCliente = texto.indexOf("City Mall Paso Canoa");
    const iDestino = texto.indexOf("Paso Canoas");
    const iBultos = texto.indexOf("7 bultos");
    const iTransp = texto.indexOf("RedNblue");
    for (const i of [iCliente, iDestino, iBultos, iTransp]) expect(i).toBeGreaterThan(-1);
    expect(iCliente).toBeLessThan(iDestino);
    expect(iDestino).toBeLessThan(iBultos);
    expect(iBultos).toBeLessThan(iTransp);
  });

  it("🔴 y la FECHA sale de la fila: la dice el encabezado del día", () => {
    const { container } = pintar([guia()]);
    expect(fila(container).textContent).not.toContain(fmtDate("2026-09-04"));
  });

  it("🔴 TELÉFONO: el cliente arriba y en negrita, el transportista abajo en gris", () => {
    const { container } = pintar([guia()]);
    const t = tarjeta(container);
    const texto = (t.textContent || "").replace(/\s+/g, " ").trim();
    expect(texto.indexOf("City Mall Paso Canoa")).toBeLessThan(texto.indexOf("RedNblue"));
    const nombre = Array.from(t.querySelectorAll("span")).find((s) => s.textContent === "City Mall Paso Canoa");
    expect(nombre!.className).toContain("font-medium");
  });

  it("🔴 y debajo, en gris: destino · N bultos · transportista", () => {
    const { container } = pintar([guia()]);
    expect((tarjeta(container).textContent || "").replace(/\s+/g, " "))
      .toContain("Paso Canoas · 7 bultos · RedNblue");
  });

  it("el número y la fecha se quedan en el teléfono, chicos", () => {
    // La fecha se escribe con `fmtDate`, que depende del `Intl` del entorno; se
    // compara contra ella y no contra un literal.
    const { container } = pintar([guia()]);
    const texto = (tarjeta(container).textContent || "").replace(/\s+/g, " ");
    expect(texto).toContain("GT-240");
    expect(texto).toContain(fmtDate("2026-09-04"));
    // Y van en la ÚLTIMA línea, no arriba: nombran la guía, no la eligen.
    expect(texto.indexOf("City Mall Paso Canoa")).toBeLessThan(texto.indexOf("GT-240"));
  });

  it("🔴 sin cliente atado la fila NO queda muda", () => {
    const { container } = pintar([guia({ guia_items: [] })]);
    expect(fila(container).textContent).toContain("Sin cliente");
  });
});
