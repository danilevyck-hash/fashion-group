/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LAS OBSERVACIONES, EN LA PANTALLA DONDE SE DESPACHA.
 *
 * Se escriben al crear la guía y vivían SOLO en el acordeón de la lista y en
 * el papel impreso: quien carga el camión tenía que volver a la lista y abrir
 * la guía ahí para leerlas. El dato ya viajaba a `/guias/[id]` — solo no se
 * dibujaba.
 *
 * 🔴 SE RENDERIZA LA PÁGINA REAL Y SE LEE EL DOM. En este repo los candados
 * que buscan un literal dentro de un archivo pasan **estando mutados** (ya
 * pasó cuatro veces: el `revalidateOnFocus` de Reclamos, el `<h1>` de Saldos,
 * el `fetchMayorAsientos` del mayor y el aporte de Metas), porque el comentario
 * que explica lo que se hizo contiene el texto que el barrido busca.
 *
 * Los fixtures son las notas REALES de producción, medidas el 14-ago-2026
 * sobre las 186 guías vivas (`scripts/_diag-guias-observaciones.ts`):
 *   · 36 notas de trabajo · 96 guías SIN nada · 54 con el texto administrativo
 *   · mediana 32 caracteres · la más larga 83 (GT-137) · máximo 2 líneas
 *   · basura real: GT-124 = "|" · GT-001 = "S1373259"
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import type { Guia } from "@/app/guias/components/types";

// La sesión y el encabezado no son lo que se prueba.
vi.mock("@/lib/hooks/useAuth", () => ({
  useAuth: () => ({ authChecked: true, role: "bodega" }),
}));
vi.mock("@/components/AppHeader", () => ({
  default: () => <div data-testid="app-header" />,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ id: "g1" }),
}));

// El hook del despacho se dobla para poder poner la guía que se quiere medir.
const guiaMock = vi.fn();
vi.mock("@/app/guias/components/useDespachoGuia", () => ({
  useDespachoGuia: () => guiaMock(),
}));

const ITEMS = [
  { id: "i1", orden: 1, cliente: "NOVA LUX", cliente_codigo: "D-110", direccion: "Paso Canoas", empresa: "Fashion Wear", facturas: "F-1001", bultos: 17, numero_guia_transp: "" },
];

function guiaBase(over: Partial<Guia> = {}): Guia {
  return {
    id: "g1",
    numero: 188,
    fecha: "2026-08-05",
    transportista: "Transporte Rápido",
    modo_entrega: "transportista",
    transportista_id: "t1",
    placa: "",
    observaciones: "",
    total_bultos: 17,
    item_count: 1,
    monto_total: 0,
    estado: "Pendiente Bodega",
    entregado_por: "Julio",
    numero_guia_transp: "",
    guia_items: ITEMS,
    ...over,
  };
}

function montar(over: Partial<Guia> = {}) {
  guiaMock.mockReturnValue({
    guia: guiaBase(over),
    loading: false,
    error: null,
    toast: null,
    despachada: over.estado === "Completada" || over.estado === "Rechazada",
    tipoDespacho: "externo",
    setTipoDespacho: () => {},
    bPlaca: "", setBPlaca: () => {},
    bReceptor: "", setBReceptor: () => {},
    bCedula: "", setBCedula: () => {},
    bChofer: "", setBChofer: () => {},
    juegos: [], usarJuego: () => {},
    numerosTransp: [""], setNumeroTransp: () => {},
    bSaving: false, confirmarDespacho: () => {},
    pendingFirma1: null, setPendingFirma1: () => {},
    pendingFirma2: null, setPendingFirma2: () => {},
  });
  return render(<GuiaPage />);
}

// Se importa DESPUÉS de los mocks.
import GuiaPage from "@/app/guias/[id]/page";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({}) })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  guiaMock.mockReset();
});

/** La caja de observaciones, buscada por su rótulo (no por una clase de CSS). */
function cajaObservaciones(container: HTMLElement): HTMLElement | null {
  const rotulo = [...container.querySelectorAll("span")].find(
    (s) => (s.textContent ?? "").trim().toUpperCase() === "OBSERVACIONES",
  );
  return (rotulo?.parentElement as HTMLElement | undefined) ?? null;
}

describe("🔴 la observación se lee en la pantalla donde se despacha", () => {
  it("la nota REAL de GT-188 se ve entera, sin truncar", () => {
    const nota = "NOVA LUX 17 PANELES - PLAZA LOS ANGELES 3 MUEBLES DE CALVIN KLEIN";
    const { container } = montar({ observaciones: nota });
    const caja = cajaObservaciones(container);
    expect(caja).not.toBeNull();
    expect((caja as HTMLElement).textContent).toContain(nota);
  });

  it("la MÁS LARGA de producción (83 caracteres, GT-137) también entra completa", () => {
    const nota = "Se entrega Zona Sur Dutty Free en America CLasic Fac 2969  4 Bultos, con el caballo";
    const { container } = montar({ observaciones: nota });
    expect((cajaObservaciones(container) as HTMLElement).textContent).toContain(nota);
  });

  it("🔴 NO se trunca: nada de line-clamp ni truncate en el texto", () => {
    const { container } = montar({ observaciones: "Keriddine son muebles" });
    const p = (cajaObservaciones(container) as HTMLElement).querySelector("p") as HTMLElement;
    expect(p.className).not.toContain("truncate");
    expect(p.className).not.toContain("line-clamp");
    expect(p.className).not.toContain("overflow-hidden");
    // Y respeta el salto de línea de la única nota que lo tiene.
    expect(p.className).toContain("whitespace-pre-wrap");
    expect(p.className).toContain("break-words");
  });

  it("el rótulo es «Observaciones» — Daniel corrigió «Nota de entrega»", () => {
    const { container } = montar({ observaciones: "Citymall lleva ganchos" });
    const texto = container.textContent ?? "";
    expect(texto).toContain("Observaciones");
    expect(texto).not.toContain("Nota de entrega");
  });
});

describe("🔴 SIN observación no se dibuja NADA", () => {
  it("la guía sin observación no muestra ninguna caja (96 de 186 están así)", () => {
    const { container } = montar({ observaciones: "" });
    expect(cajaObservaciones(container)).toBeNull();
    expect(container.textContent ?? "").not.toContain("Observaciones");
  });

  it("⚠️ y NO aparece una caja vacía diciendo «sin observaciones»", () => {
    const { container } = montar({ observaciones: "" });
    const texto = (container.textContent ?? "").toLowerCase();
    expect(texto).not.toContain("sin observaciones");
    expect(texto).not.toContain("sin observación");
    expect(texto).not.toContain("no hay observaciones");
  });

  it("un texto de solo espacios cuenta como vacío", () => {
    const { container } = montar({ observaciones: "   \n  " });
    expect(cajaObservaciones(container)).toBeNull();
  });

  it("`null` y `undefined` no revientan la pantalla", () => {
    for (const v of [null, undefined] as unknown as string[]) {
      const { container } = montar({ observaciones: v });
      expect(cajaObservaciones(container)).toBeNull();
      cleanup();
    }
  });
});

describe("⚠️ se muestra TAL CUAL: la basura no se filtra ni se limpia", () => {
  it("el «|» de GT-124 se muestra", () => {
    const { container } = montar({ observaciones: "|" });
    const caja = cajaObservaciones(container);
    expect(caja).not.toBeNull();
    expect((caja as HTMLElement).textContent).toContain("|");
  });

  it("el «S1373259» de GT-001 se muestra", () => {
    const { container } = montar({ observaciones: "S1373259" });
    expect((cajaObservaciones(container) as HTMLElement).textContent).toContain("S1373259");
  });

  it("el texto administrativo del cierre en bloque también se muestra", () => {
    // Son 54 guías. No es una nota de trabajo, pero esta pantalla no juzga:
    // esconderlo sería decidir por Daniel qué observación vale.
    const nota = "Cerrada en bloque el 3-ago-2026";
    const { container } = montar({ observaciones: nota, estado: "Completada" });
    expect((cajaObservaciones(container) as HTMLElement).textContent).toContain(nota);
  });
});

describe("🔴 va ARRIBA de los campos que se llenan al despachar", () => {
  it("la observación aparece ANTES que la placa en el orden de la pantalla", () => {
    const { container } = montar({ observaciones: "lleva 5 cajas de ganchos" });
    const caja = cajaObservaciones(container) as HTMLElement;
    const placa = document.getElementById("despacho-placa");
    expect(placa).not.toBeNull();
    // Node.compareDocumentPosition: 4 = el otro viene DESPUÉS en el documento.
    expect(caja.compareDocumentPosition(placa as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("…y DESPUÉS de los envíos: se lee pegada a lo que se carga", () => {
    const { container } = montar({ observaciones: "Jerusalem lleva un muble de CK" });
    const caja = cajaObservaciones(container) as HTMLElement;
    const envios = [...container.querySelectorAll("span")].find(
      (s) => (s.textContent ?? "").trim() === "Envíos",
    ) as HTMLElement;
    expect(envios).toBeTruthy();
    expect(envios.compareDocumentPosition(caja) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("también se ve en una guía YA despachada (ahí viven las 36 notas reales)", () => {
    const { container } = montar({
      observaciones: "RETIRO EN BODEGA POR PARTE DEL CLIENTE.",
      estado: "Completada",
    });
    expect((cajaObservaciones(container) as HTMLElement).textContent).toContain(
      "RETIRO EN BODEGA POR PARTE DEL CLIENTE.",
    );
  });
});

describe("⚠️ es de SOLO LECTURA: esta pantalla la muestra, no la cambia", () => {
  it("no hay ningún campo editable dentro de la caja", () => {
    const { container } = montar({ observaciones: "Pasillo del dinosaurio" });
    const caja = cajaObservaciones(container) as HTMLElement;
    expect(caja.querySelector("input")).toBeNull();
    expect(caja.querySelector("textarea")).toBeNull();
    expect(caja.querySelector("button")).toBeNull();
    expect(within(caja).queryByRole("textbox")).toBeNull();
  });

  it("y no ofrece «Guardar» ni «Editar» al lado", () => {
    const { container } = montar({ observaciones: "Al lado de la joyeria super oro" });
    const caja = cajaObservaciones(container) as HTMLElement;
    const texto = (caja.textContent ?? "").toLowerCase();
    expect(texto).not.toContain("guardar");
    expect(texto).not.toContain("editar");
  });
});
