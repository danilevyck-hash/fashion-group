/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CORREGIR UNA GUÍA QUE YA SALIÓ — TRES COSAS, Y NADA MÁS.
 *
 * Daniel, punto 4: ***"Guía despachada → se puede corregir N° del transportista
 * · cliente · facturas"***. Punto 5: ***"los bultos de una despachada NO se
 * tocan — es lo que el transportista firmó"***. Punto 6: ***"la firma queda la
 * vieja. No se vuelve a firmar"***.
 *
 * 🩸 QUÉ AFIRMABA ESTE ARCHIVO ANTES, Y POR QUÉ CAMBIÓ DE DIRECCIÓN.
 *
 * Hasta el 25-ago-2026 protegía la ÚNICA excepción del 18-ago: un botón
 * «Anotar el N°» por renglón, con su cajita de un solo campo, que escribía
 * `numero_guia_transp` en una guía cerrada. Ese botón se retiró — no porque la
 * excepción se cayera, sino porque **dejó de ser una excepción**: hoy una guía
 * despachada se abre con el MISMO formulario del alta (punto 1: *"una sola
 * forma de editar"*) y ahí adentro se corrigen las tres cosas.
 *
 * 🔴 SE RENDERIZA LA PÁGINA REAL, CON EL HOOK REAL, Y SE TOCAN LOS BOTONES. Lo
 * que hay que ver es de CONDUCTA y un barrido de texto no lo ve: que los bultos
 * NO se puedan escribir, que lo que se guarda salga por COLUMNA y que el PUT
 * —que borra los renglones y les cambia el id— no aparezca nunca.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/lib/hooks/useAuth", () => ({
  useAuth: () => ({ authChecked: true, role: "bodega" }),
}));
vi.mock("@/components/AppHeader", () => ({
  default: () => <div data-testid="app-header" />,
}));
const replaceSpy = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: replaceSpy }),
  useParams: () => ({ id: "11111111-1111-4111-8111-111111111111" }),
}));

import GuiaPage from "@/app/guias/[id]/page";

const GUIA_ID = "11111111-1111-4111-8111-111111111111";
const ITEM_ID = "aaaaaaaa-aaaa-4aaa-8aaa-000000000000";
const ITEM_ID_2 = "aaaaaaaa-aaaa-4aaa-8aaa-000000000001";

/** GT-204 tal como quedó: despachada, firmada, y SIN el N° del transportista. */
function guia(over: Record<string, unknown> = {}) {
  return {
    id: GUIA_ID,
    numero: 204,
    fecha: "2026-08-16",
    transportista: "Transporte Sol",
    modo_entrega: "transportista",
    transportista_id: "t1",
    entregado_por: "Julio",
    placa: "EK0700",
    observaciones: "",
    monto_total: 0,
    estado: "Completada",
    tipo_despacho: "externo",
    receptor_nombre: "Nicolás guillen",
    cedula: "1-727-44",
    firma_base64: "data:image/png;base64,x",
    firma_entregador_base64: "data:image/png;base64,y",
    numero_guia_transp: "",
    guia_items: [
      { id: ITEM_ID, orden: 1, cliente: "CITY MALL PASO CANOA", cliente_codigo: "D-25", direccion: "Paso Canoas", empresa: "Fashion Wear", facturas: "F-1001", bultos: 6, numero_guia_transp: "" },
      { id: ITEM_ID_2, orden: 2, cliente: "GRUPO HANNA", cliente_codigo: "", direccion: "Changuinola", empresa: "Active Wear", facturas: "F-1002", bultos: 2, numero_guia_transp: "" },
    ],
    ...over,
  };
}

let llamadas: Array<{ url: string; method: string; body: Record<string, unknown> | null }>;

function stubFetch(over: Record<string, unknown> = {}) {
  llamadas = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method || "GET").toUpperCase();
      let body: Record<string, unknown> | null = null;
      try { body = init?.body ? JSON.parse(String(init.body)) : null; } catch { body = null; }
      llamadas.push({ url: String(url), method, body });

      if (String(url).includes("/numero-transp")) {
        const n = String(body?.numero_guia_transp ?? "").trim();
        if (n === "0") {
          return { ok: false, json: async () => ({ error: "Un 0 no es un N° de guía. Déjalo vacío si el transportista no dio ninguno." }) };
        }
        return { ok: true, json: async () => ({ ok: true, numero_guia_transp: n }) };
      }
      if (String(url).includes("/item")) {
        return { ok: true, json: async () => ({ ok: true, item: { id: body?.itemId } }) };
      }
      if (String(url).startsWith(`/api/guias/${GUIA_ID}`)) {
        return { ok: true, json: async () => guia(over) };
      }
      if (String(url).startsWith("/api/transportistas")) {
        return { ok: true, json: async () => [{ id: "t1", nombre: "Transporte Sol", activo: true }] };
      }
      return { ok: true, json: async () => ({ clientes: [], completo: true, juegos: [] }) };
    }),
  );
}

/** Los campos del layout de TARJETA. El formulario dibuja los DOS layouts (uno
 *  lo esconde el CSS), así que contar el DOM entero devuelve el doble. */
const campos = (prefijo: string) =>
  Array.from(document.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
    `[id^="${prefijo}-"][id$="-m"]`,
  ));

async function montar(over: Record<string, unknown> = {}) {
  stubFetch(over);
  const r = render(<GuiaPage />);
  await screen.findByText("CITY MALL PASO CANOA");
  return r;
}

/** Abre el formulario con «Editar» y espera a que los campos existan. */
async function editar(over: Record<string, unknown> = {}) {
  const r = await montar(over);
  fireEvent.click(screen.getByRole("button", { name: /Editar/ }));
  await waitFor(() => expect(campos("facturas").length).toBeGreaterThan(0));
  return r;
}

/** jsdom trae un `localStorage` a medias; el formulario guarda borradores. */
function memStorage(): Storage {
  let m: Record<string, string> = {};
  return {
    getItem: (k: string) => (k in m ? m[k] : null),
    setItem: (k: string, v: string) => { m[k] = String(v); },
    removeItem: (k: string) => { delete m[k]; },
    clear: () => { m = {}; },
    key: () => null,
    length: 0,
  } as unknown as Storage;
}

beforeEach(() => {
  replaceSpy.mockClear();
  vi.stubGlobal("localStorage", memStorage());
  vi.stubGlobal("sessionStorage", memStorage());
  // ⚠️ La dirección se resetea entre pruebas: un `?editar=1` que quede pegado
  // abre el formulario en la siguiente y la deja midiendo otra cosa.
  window.history.replaceState(null, "", "/guias/x");
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 a una guía despachada se ENTRA y se abre el MISMO formulario", () => {
  it("la guía firmada ofrece «Editar» (antes solo se llegaba escribiendo la URL)", async () => {
    await montar();
    expect(screen.getByRole("button", { name: /Editar/ })).toBeTruthy();
  });

  it("el formulario abre los TRES campos: cliente, facturas y N° del transportista", async () => {
    await editar();
    // Uno por renglón, en los dos casos.
    expect(campos("facturas")).toHaveLength(2);
    expect(campos("numtransp")).toHaveLength(2);
    expect(campos("cliente")).toHaveLength(2);
  });

  it("🔴 los BULTOS no se pueden escribir — es lo que el transportista firmó", async () => {
    await editar();
    expect(campos("bultos")).toHaveLength(0);
    // Pero se SIGUEN VIENDO: esconderlos sería peor que mostrarlos quietos.
    expect(screen.getAllByText("6").length).toBeGreaterThan(0);
  });

  it("🔴 la dirección y la empresa tampoco: no están en la lista de tres", async () => {
    await editar();
    expect(campos("direccion")).toHaveLength(0);
    expect(campos("empresa")).toHaveLength(0);
    expect(screen.getAllByText("Paso Canoas").length).toBeGreaterThan(0);
  });

  it("🔴 la firma queda la vieja: no se vuelve a firmar ni se pide despachar", async () => {
    await editar();
    expect(document.querySelector("canvas")).toBeNull();
    expect(screen.queryByRole("button", { name: /Confirmar despacho/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Despachar$/i })).toBeNull();
    // ⚠️ CAMBIO DE DIRECCIÓN (5-sep-2026, «las firmas plegadas al MIRAR»). Antes
    // exigía las DOS firmas dibujadas a tamaño completo. Se pliegan: la línea
    // dice que está firmada y «Ver firmas» las abre. Lo que este caso protege no
    // cambió —que la firma vieja SIGA y no se vuelva a pedir— así que se sigue
    // exigiendo que estén, después de un toque.
    expect(screen.getByText("✓ Firmada por las dos partes")).toBeTruthy();
    expect(document.querySelectorAll('img[alt^="Firma"]')).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: /Ver firmas/i }));
    expect(document.querySelectorAll('img[alt^="Firma"]')).toHaveLength(2);
  });

  it("🔴 no se agregan ni se quitan envíos de una guía que ya viajó", async () => {
    await editar();
    expect(screen.queryByRole("button", { name: /Agregar envío/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Quitar envío/i })).toBeNull();
  });

  it("la cabecera se LEE, no se escribe", async () => {
    await editar();
    expect(document.getElementById("guia-fecha")).toBeNull();
    expect(document.getElementById("guia-entregado-por")).toBeNull();
    expect(document.getElementById("guia-observaciones")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 lo que se corrige se escribe POR COLUMNA — nunca por el PUT", () => {
  it("el N° del transportista sale por su endpoint de UNA columna, con su itemId", async () => {
    await editar();
    fireEvent.change(campos("numtransp")[0], { target: { value: "TR-4471" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Guardar Cambios" })[0]);
    await waitFor(() => expect(llamadas.some((l) => l.url.includes("/numero-transp"))).toBe(true));
    const patch = llamadas.find((l) => l.url.includes("/numero-transp"))!;
    expect(patch.method).toBe("PATCH");
    expect(patch.url).toBe(`/api/guias/${GUIA_ID}/numero-transp`);
    expect(patch.body).toEqual({ itemId: ITEM_ID, numero_guia_transp: "TR-4471" });
  });

  it("las facturas salen por `PATCH …/item`, con su itemId y SOLO ese campo", async () => {
    await editar();
    fireEvent.change(campos("facturas")[1], { target: { value: "F-2002" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Guardar Cambios" })[0]);
    await waitFor(() => expect(llamadas.some((l) => l.url.endsWith("/item"))).toBe(true));
    const patch = llamadas.find((l) => l.url.endsWith("/item"))!;
    expect(patch.method).toBe("PATCH");
    expect(patch.body).toEqual({ itemId: ITEM_ID_2, facturas: "F-2002" });
    // 🔴 Y NUNCA los bultos: sin esto, mandar la fila entera pisaría lo firmado.
    expect(Object.keys(patch.body ?? {})).not.toContain("bultos");
  });

  it("🔴 NUNCA sale un PUT, y nunca viaja `items`", async () => {
    await editar();
    fireEvent.change(campos("facturas")[0], { target: { value: "F-9999" } });
    fireEvent.change(campos("numtransp")[0], { target: { value: "TR-1" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Guardar Cambios" })[0]);
    await waitFor(() => expect(llamadas.some((l) => l.method === "PATCH")).toBe(true));
    for (const l of llamadas) {
      expect(l.method, l.url).not.toBe("PUT");
      expect(Object.keys(l.body ?? {}), l.url).not.toContain("items");
    }
  });

  it("🔴 SOLO se escribe el renglón que cambió — los otros no se tocan", async () => {
    await editar();
    fireEvent.change(campos("facturas")[0], { target: { value: "F-9999" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Guardar Cambios" })[0]);
    await waitFor(() => expect(llamadas.some((l) => l.method === "PATCH")).toBe(true));
    const escrituras = llamadas.filter((l) => l.method === "PATCH");
    expect(escrituras).toHaveLength(1);
    expect(escrituras[0].body).toEqual({ itemId: ITEM_ID, facturas: "F-9999" });
  });

  it("🔴 mirar la guía y guardar sin cambiar nada NO escribe — el botón ni se enciende", async () => {
    await editar();
    const boton = screen.getAllByRole("button", { name: "Guardar Cambios" })[0] as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
    fireEvent.click(boton);
    await new Promise((r) => setTimeout(r, 50));
    expect(llamadas.filter((l) => l.method !== "GET")).toHaveLength(0);
  });

  it("🔴 abrir el formulario y ESPERAR no autoguarda nada", async () => {
    // El autoguardado de 1,5 s vive para que bodega no pierda renglones en el
    // celular. Sobre un papel ya firmado sería una escritura que nadie pidió.
    await editar();
    fireEvent.change(campos("facturas")[0], { target: { value: "F-9999" } });
    await new Promise((r) => setTimeout(r, 2200));
    expect(llamadas.filter((l) => l.method !== "GET")).toHaveLength(0);
  });

  it("el error del servidor se ve en la pantalla, no en un toast que se va", async () => {
    await editar();
    fireEvent.change(campos("numtransp")[0], { target: { value: "0" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Guardar Cambios" })[0]);
    await screen.findByText(/Un 0 no es un N° de guía/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 la guía que salió sin el N° queda MARCADA", () => {
  it("el aviso ámbar está, y dice con qué completarlo", async () => {
    await montar();
    expect(screen.getByText(/salió sin el N° del transportista/i)).toBeTruthy();
    expect(screen.getByText(/anótalo con «Editar»/i)).toBeTruthy();
  });

  it("en ENTREGA DIRECTA no se marca: no hay transportista a quien pedírselo", async () => {
    await montar({ tipo_despacho: "directo", modo_entrega: "entrega_directa", placa: "", nombre_chofer: "Julio" });
    expect(screen.queryByText(/salió sin el N° del transportista/i)).toBeNull();
  });

  it("una guía que YA tiene su número no se marca", async () => {
    await montar({ numero_guia_transp: "TR-900" });
    expect(screen.queryByText(/salió sin el N° del transportista/i)).toBeNull();
  });

  it("🩸 la guía con el N° ANOTADO TARDE no nace «Sin guardar»", async () => {
    // 🔴 EL CASO REAL, no uno teórico. Anotar el N° tarde escribe UNA columna de
    // UNA línea y **no toca `guia_transporte`**, así que hay guías con la
    // cabecera VACÍA y `725` en un renglón. Como el N° de cabecera pasó a
    // DERIVARSE de los renglones, la referencia ("" guardado) y lo actual
    // ("725" derivado) diferían apenas se abría la guía: el formulario se
    // declaraba sucio sin que nadie tocara una tecla, y en una guía firmada eso
    // además ENCIENDE el botón de guardar.
    //
    // Es exactamente lo que `cambios-form.ts` vino a matar: *cargar la guía no
    // puede producir una diferencia contra sí misma*.
    await editar({
      numero_guia_transp: "",
      guia_items: [
        { id: ITEM_ID, orden: 1, cliente: "CITY MALL PASO CANOA", cliente_codigo: "D-25", direccion: "Paso Canoas", empresa: "Fashion Wear", facturas: "F-1001", bultos: 6, numero_guia_transp: "725" },
        { id: ITEM_ID_2, orden: 2, cliente: "GRUPO HANNA", cliente_codigo: "", direccion: "Changuinola", empresa: "Active Wear", facturas: "F-1002", bultos: 2, numero_guia_transp: "" },
      ],
    });
    expect(document.body.textContent).not.toMatch(/Sin guardar/);
    const boton = screen.getAllByRole("button", { name: "Guardar Cambios" })[0] as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
  });

  it("🔴 y en el formulario la caja del N° arranca con el de SU línea, no con el de la cabecera", async () => {
    // La herencia sigue viva al IMPRIMIR y al MOSTRAR; lo que no puede es
    // prellenar un campo editable con un valor que después se ESCRIBE en las
    // dos líneas como si alguien lo hubiera puesto ahí (25-ago-2026).
    await editar({ numero_guia_transp: "TR-900" });
    for (const caja of campos("numtransp")) expect(caja.value).toBe("");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 los dos botones del papel viven en la guía, y son DOS", () => {
  it("«Imprimir» y «Compartir» están los dos, y no son el mismo", async () => {
    await montar();
    const imprimir = screen.getByRole("button", { name: /^Imprimir$/ });
    const compartir = screen.getByRole("button", { name: /^Compartir$/ });
    expect(imprimir).not.toBe(compartir);
  });

  it("🔴 y también en una guía PENDIENTE — es cuando la secretaria la imprime para el chofer", async () => {
    await montar({ estado: "Pendiente Bodega", receptor_nombre: "", cedula: "", firma_base64: "", firma_entregador_base64: "" });
    expect(screen.getByRole("button", { name: /^Imprimir$/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Compartir$/ })).toBeTruthy();
  });
});

describe("🔴 abrir «Editar» NO pide la guía dos veces", () => {
  it("la guía viaja UNA sola vez: el formulario la recibe ya cargada", async () => {
    // 🩸 Eran **6 pedidos** para abrir «Editar**, con la guía viajando DOS
    // veces: una la pide la pantalla (`useDespachoGuia`) y otra la pedía el
    // formulario al montarse. Además de la red, ese segundo viaje es lo que
    // hacía que el formulario apareciera un instante DESPUÉS que la pantalla.
    // Medido en el navegador contra el build de producción: 6 → 5 llamadas.
    await editar();
    const veces = llamadas.filter(
      (l) => l.method === "GET" && l.url === `/api/guias/${GUIA_ID}`,
    ).length;
    expect(veces).toBe(1);
  });
});

describe("🔴 mientras la guía viaja se muestra el esqueleto DEL FORMULARIO", () => {
  it("llegando con ?editar=1 no se dibuja ni un cuadro de la pantalla de lectura", async () => {
    // 🩸 `enEdicion` exigía que la guía YA estuviera cargada (`&& !!g`), así que
    // mientras viajaba la pantalla caía en LECTURA y dibujaba SU esqueleto, su
    // «‹ Atrás» y su encabezado. Al llegar los datos saltaba al formulario: ése
    // es el segundo tiempo del parpadeo.
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => { /* nunca contesta */ })));
    window.history.replaceState(null, "", "/guias/x?editar=1");
    render(<GuiaPage />);
    await new Promise((r) => setTimeout(r, 60));
    // El esqueleto del formulario no trae el encabezado de la lectura.
    expect(screen.queryByRole("button", { name: /Atrás/ })).toBeNull();
    expect(screen.queryByText("Envíos")).toBeNull();
    expect(document.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });
});

describe("🔴 el resto del despacho sigue cerrado", () => {
  it("no hay placa, ni receptor, ni cédula, ni «Despachar»", async () => {
    await editar();
    expect(document.getElementById("despacho-placa")).toBeNull();
    expect(document.getElementById("despacho-receptor")).toBeNull();
    expect(document.getElementById("despacho-cedula")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Despachar$/i })).toBeNull();
  });

  it("tampoco vuelve el «Corregir» por renglón: una sola forma de editar", async () => {
    await montar();
    expect(screen.queryByRole("button", { name: "Corregir" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Anotar el N°" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cambiar el N°" })).toBeNull();
  });
});
