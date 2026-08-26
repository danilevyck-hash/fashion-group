/**
 * ─────────────────────────────────────────────────────────────────────────────
 * EL NOMBRE DEL CLIENTE SE DICE UNA SOLA VEZ (26-ago-2026).
 *
 * 🩸 En el acordeón de `/guias`, la columna CLIENTE dibujaba el texto escrito a
 * mano Y, debajo, el chip verde del cliente atado — que dice el MISMO nombre
 * con su código al lado. Daniel, textual: *"porque me salen dos veces nombres
 * de clientes, es ruido"*. Medido en producción sobre GT-229:
 *
 *     Outlet Duty Free N3, S.A.
 *     ● Outlet Duty Free N3, S.A.  D-118
 *
 * 🔴 EL CANDADO ES DE CONDUCTA: se RENDERIZA la lista y se lee la CELDA. Un
 * barrido de texto sobre el `.tsx` no puede ver cuántas veces se pinta el
 * nombre, y en este repo esos barridos ya pasaron CUATRO veces estando mutados
 * porque el comentario que explica el cambio contiene lo que el barrido busca.
 *
 * 🔑 LA REGLA: manda el CHIP (nombre + código, que es la prueba de que la línea
 * está amarrada a Switch). El texto escrito vuelve a salir en cuanto NO hay
 * chip con nombre que lo reemplace — línea sin atar, o directorio no leído.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import GuiasList from "@/app/guias/components/GuiasList";
import type { Guia, GuiaItem } from "@/app/guias/components/types";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({}) })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Los renglones REALES de GT-229, la guía de la captura de Daniel. */
const ITEMS: GuiaItem[] = [
  { id: "i1", orden: 1, cliente: "Outlet Duty Free N3, S.A.", cliente_codigo: "D-118", direccion: "Paso Canoas", empresa: "Fashion Shoes", facturas: "2520", bultos: 128, numero_guia_transp: "725" },
  { id: "i2", orden: 2, cliente: "America Clasic", cliente_codigo: "D-108", direccion: "Panamá", empresa: "Vistana", facturas: "2521", bultos: 4, numero_guia_transp: "724" },
  { id: "i3", orden: 3, cliente: "Tienda del barrio", cliente_codigo: "", direccion: "Santiago", empresa: "Fashion Wear", facturas: "2522", bultos: 2, numero_guia_transp: "" },
];

function guia(over: Partial<Guia> = {}): Guia {
  return {
    id: "g229",
    numero: 229,
    fecha: "2026-08-19",
    transportista: "Edwin",
    modo_entrega: "transportista",
    transportista_id: "t1",
    placa: "EK0700",
    observaciones: "",
    total_bultos: 134,
    item_count: 3,
    monto_total: 0,
    estado: "Completada",
    entregado_por: "Julio",
    numero_guia_transp: "725",
    guia_items: ITEMS,
    ...over,
  } as Guia;
}

/** `D-XXX` → cómo se llama, tal como lo entrega el directorio del grupo. */
const NOMBRES = new Map<string, string>([
  ["D-118", "Outlet Duty Free N3, S.A."],
  ["D-108", "American Classics Store"],
]);

function pintar(nombres?: ReadonlyMap<string, string>) {
  const g = guia();
  return render(
    <GuiasList
      guias={[g]} loading={false} error={null} search="" setSearch={() => {}}
      showPending={false} setShowPending={() => {}} role="admin" onNewGuia={() => {}}
      expandedId="g229" expandedGuia={g} expandedLoading={false} onToggleExpand={() => {}}
      onEditar={() => {}} onDespachar={() => {}} onDelete={() => {}}
      onAtarCliente={() => {}} nombresPorCodigo={nombres}
    />,
  );
}

/** La celda CLIENTE de cada renglón del acordeón (la 2ª columna). */
function celdasCliente(container: HTMLElement): string[] {
  const filas = Array.from(container.querySelectorAll("table tbody tr"));
  return filas
    .map((tr) => tr.children[1])
    .filter(Boolean)
    .map((td) => (td!.textContent || "").replace(/\s+/g, " ").trim());
}

describe("🔴 con el directorio leído, el nombre se dice UNA vez", () => {
  it("la celda dice el nombre y el código, sin repetir el nombre", () => {
    const { container } = pintar(NOMBRES);
    const celdas = celdasCliente(container);
    expect(celdas.length).toBe(3);
    // GT-229, renglón 1: el caso EXACTO de la captura.
    expect(celdas[0]).toBe("Outlet Duty Free N3, S.A.D-118");
  });

  it("🔴 y NO importa que el texto escrito difiera del nombre atado", () => {
    // Renglón 2: alguien escribió «America Clasic» y el cliente atado es
    // «American Classics Store» (el alias de display de D-108). Medido en
    // producción: 226 de las 423 líneas atadas difieren así, y NINGUNA es otro
    // cliente. Mostrar las dos dibujaría dos nombres en el 53% de los
    // renglones — o sea, no resolvería nada de lo que Daniel señaló.
    const { container } = pintar(NOMBRES);
    const celda = celdasCliente(container)[1];
    expect(celda).toBe("American Classics StoreD-108");
    expect(celda).not.toContain("America Clasic ");
  });

  it("el chip del código NO se perdió: es la prueba de que está amarrada", () => {
    const { container } = pintar(NOMBRES);
    expect(container.textContent).toContain("D-118");
    expect(container.textContent).toContain("D-108");
  });
});

describe("🔴 sin chip que lo reemplace, el texto escrito VUELVE", () => {
  it("una línea SIN atar sigue mostrando lo que escribió bodega", () => {
    const { container } = pintar(NOMBRES);
    const celda = celdasCliente(container)[2];
    expect(celda).toContain("Tienda del barrio");
    expect(celda).toContain("Atar cliente");
  });

  it("🔴 con el directorio SIN leer, el chip degrada al código y el texto se queda", () => {
    // `useNombresDeClientes` devuelve un mapa VACÍO mientras no pueda leer el
    // directorio COMPLETO. Ahí el chip solo sabe decir «D-118», y esconder el
    // texto escrito dejaría la fila sin decir de quién se trata.
    const { container } = pintar(new Map());
    const celdas = celdasCliente(container);
    expect(celdas[0]).toContain("Outlet Duty Free N3, S.A.");
    expect(celdas[0]).toContain("D-118");
    expect(celdas[1]).toContain("America Clasic");
  });

  it("sin el mapa del directorio (prop ausente) pasa lo mismo", () => {
    const { container } = pintar(undefined);
    expect(celdasCliente(container)[0]).toContain("Outlet Duty Free N3, S.A.");
  });
});
