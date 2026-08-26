/**
 * ─────────────────────────────────────────────────────────────────────────────
 * UNA GUÍA DESPACHADA SE VE COMO AL CREARLA, Y LO BLOQUEADO SE VE BLOQUEADO.
 *
 * Daniel, textual: ***"Editar guía despachada, debe de verse igual que al crear
 * una guía para mantener consistencia y uso fácil"*** · ***"que se vea
 * desbloqueado solo las editables así el usuario no adivina"***.
 *
 * 🩸 Lo que vio en el iPhone sobre GT-229: `CLIENTE *`, `DIRECCIÓN *`,
 * `EMPRESA *`, `FACTURA(S) *` y `BULTOS *` — los cinco con su asterisco rojo de
 * obligatorio, **como si los cinco se pudieran tocar**, cuando en una guía
 * firmada solo se corrigen tres (N° del transportista · cliente · facturas).
 * Había que tocarlos para descubrir cuáles no.
 *
 * 🔴 ESTE ARCHIVO ES DE PRESENTACIÓN, Y SU OTRA MITAD ES IGUAL DE IMPORTANTE:
 * que lo que se puede ESCRIBIR no haya cambiado ni un campo. Por eso, además de
 * leer el DOM, cuenta lo que sale por `fetch`. El candado de qué acepta el
 * servidor sigue viviendo en `lib/guias-campos-editables.test.ts` y
 * `api/guias-corregir-item-route.test.ts`, que no se tocaron.
 *
 * 🔴 SE MONTA LA PANTALLA REAL. Un barrido de texto sobre el `.tsx` no puede
 * ver lo único que importa acá (qué rótulo lleva asterisco, qué caja se puede
 * escribir), y en este repo ya se cumplió CUATRO veces con el comentario que
 * explicaba el cambio.
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
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({ id: "11111111-1111-4111-8111-111111111111" }),
}));

import GuiaPage from "@/app/guias/[id]/page";

const GUIA_ID = "11111111-1111-4111-8111-111111111111";
const ITEM_ID = "aaaaaaaa-aaaa-4aaa-8aaa-000000000000";

/** GT-229, una guía REAL: despachada, firmada, con su N° por renglón. */
function guia(over: Record<string, unknown> = {}) {
  return {
    id: GUIA_ID,
    numero: 229,
    fecha: "2026-08-19",
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
    numero_guia_transp: "725",
    guia_items: [
      {
        id: ITEM_ID,
        orden: 1,
        cliente: "CITY MALL PASO CANOA",
        cliente_codigo: "D-25",
        direccion: "Paso Canoas",
        empresa: "Fashion Wear",
        facturas: "F-1001",
        bultos: 6,
        numero_guia_transp: "725",
      },
    ],
    ...over,
  };
}

let llamadas: Array<{ url: string; method: string }>;

function stubFetch(over: Record<string, unknown> = {}) {
  llamadas = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method || "GET").toUpperCase();
      llamadas.push({ url: String(url), method });
      if (String(url).startsWith(`/api/guias/${GUIA_ID}`)) {
        return { ok: true, json: async () => guia(over) };
      }
      if (String(url).startsWith("/api/transportistas")) {
        return { ok: true, json: async () => [{ id: "t1", nombre: "Transporte Sol", activo: true }] };
      }
      return { ok: true, json: async () => ({ clientes: [], completo: true, juegos: [], direcciones: {} }) };
    }),
  );
}

/** Sale del `fetch`: lo único que la base llega a ver. */
const escrituras = () => llamadas.filter((l) => l.method !== "GET");

/**
 * El layout de TARJETA. El formulario dibuja los DOS (uno lo esconde el CSS),
 * así que mirar el DOM entero cuenta cada campo dos veces.
 */
const campo = (prefijo: string) =>
  document.querySelector<HTMLElement>(`[id^="${prefijo}-"][id$="-m"]`);

/** El rótulo de un campo de la tarjeta, con su asterisco si lo lleva. */
function rotulo(texto: string): HTMLElement {
  const todos = Array.from(document.querySelectorAll("label"));
  const l = todos.find((e) => (e.textContent || "").trim().startsWith(texto));
  if (!l) throw new Error(`no se encontró el rótulo «${texto}» — rótulos: ${todos.map((e) => e.textContent).join(" | ")}`);
  return l as HTMLElement;
}

/** La caja de un campo bloqueado: existe, y NO es un control escribible. */
const cajasBloqueadas = () =>
  Array.from(document.querySelectorAll<HTMLElement>("[data-bloqueado='1']"));

async function montarDespachada(over: Record<string, unknown> = {}) {
  window.history.replaceState({}, "", `/guias/${GUIA_ID}?editar=1`);
  stubFetch(over);
  const r = render(<GuiaPage />);
  await screen.findByText(/Editar Guía de Transporte/i);
  await waitFor(() => expect(campo("cliente")).not.toBeNull());
  return r;
}

async function montarPendiente() {
  window.history.replaceState({}, "", `/guias/${GUIA_ID}?editar=1`);
  stubFetch({ estado: "Pendiente Bodega", firma_base64: "", firma_entregador_base64: "" });
  const r = render(<GuiaPage />);
  await screen.findByText(/Editar Guía de Transporte/i);
  await waitFor(() => expect(campo("cliente")).not.toBeNull());
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
  vi.stubGlobal("localStorage", memStorage());
  vi.stubGlobal("sessionStorage", memStorage());
  // ⚠️ Un `?editar=1` que quede pegado abre el formulario en la prueba
  // siguiente y la deja midiendo otra cosa.
  window.history.replaceState(null, "", "/guias/x");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/guias/x");
});

// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 en una guía DESPACHADA no queda un solo asterisco", () => {
  it("los cinco rótulos que Daniel vio con `*` ya no lo llevan", async () => {
    await montarDespachada();
    for (const t of ["Cliente", "Dirección", "Empresa", "Factura(s)", "Bultos"]) {
      expect(rotulo(t).textContent, `«${t}» sigue con asterisco`).not.toContain("*");
    }
  });

  it("…y el asterisco NO desapareció del sistema: en una PENDIENTE sigue estando", async () => {
    await montarPendiente();
    for (const t of ["Cliente", "Dirección", "Empresa", "Factura(s)", "Bultos"]) {
      expect(rotulo(t).textContent, `«${t}» perdió su asterisco al crear`).toContain("*");
    }
  });
});

describe("🔴 lo bloqueado SE VE bloqueado, y lo editable SE VE editable", () => {
  it("dirección, empresa y bultos salen como caja apagada, NO como campo", async () => {
    await montarDespachada();
    // No existe ningún control escribible con esos ids…
    expect(campo("direccion")).toBeNull();
    expect(campo("empresa")).toBeNull();
    expect(campo("bultos")).toBeNull();
    // …y las cajas apagadas SÍ están (se muestran, no se esconden).
    const cajas = cajasBloqueadas().map((e) => (e.textContent || "").trim());
    expect(cajas).toContain("Paso Canoas");
    expect(cajas).toContain("Fashion Wear");
    expect(cajas).toContain("6");
  });

  it("la caja apagada NO es un input: no hay forma de escribir ahí", async () => {
    await montarDespachada();
    for (const caja of cajasBloqueadas()) {
      expect(["INPUT", "SELECT", "TEXTAREA"]).not.toContain(caja.tagName);
      expect(caja.getAttribute("aria-disabled")).toBe("true");
      expect(caja.querySelector("input, select, textarea")).toBeNull();
    }
  });

  it("cada rótulo bloqueado lo DICE también para quien no ve la pantalla", async () => {
    await montarDespachada();
    for (const t of ["Dirección", "Empresa", "Bultos"]) {
      const fila = rotulo(t).parentElement!;
      expect(fila.querySelector("svg"), `«${t}» sin candado`).not.toBeNull();
      expect(fila.textContent, `«${t}» sin texto para lector de pantalla`).toContain("bloqueado");
    }
  });

  it("🔴 las TRES que se corrigen siguen siendo campos de verdad", async () => {
    await montarDespachada();
    expect(campo("cliente")).not.toBeNull();
    expect(campo("facturas")).not.toBeNull();
    expect(campo("numtransp")).not.toBeNull();
    // Y ninguna de las tres lleva candado.
    for (const t of ["Cliente", "Factura(s)"]) {
      expect(rotulo(t).parentElement!.textContent).not.toContain("bloqueado");
    }
  });

  it("se puede ESCRIBIR en las tres, sin que salga una escritura al servidor", async () => {
    await montarDespachada();
    fireEvent.change(campo("facturas")!, { target: { value: "F-1001, F-1002" } });
    expect((campo("facturas") as HTMLInputElement).value).toBe("F-1001, F-1002");
    expect(escrituras()).toEqual([]);
  });

  it("en una PENDIENTE no hay ni una caja bloqueada — el alta no cambió", async () => {
    await montarPendiente();
    expect(cajasBloqueadas()).toEqual([]);
    expect(campo("direccion")).not.toBeNull();
    expect(campo("empresa")).not.toBeNull();
    expect(campo("bultos")).not.toBeNull();
  });

  it("abrir la guía firmada y mirarla NO escribe nada", async () => {
    await montarDespachada();
    expect(escrituras()).toEqual([]);
  });
});

describe("🔴 la cabecera se ve como la del alta", () => {
  it("mismos rótulos que al crear, los cuatro bloqueados", async () => {
    await montarDespachada();
    for (const t of ["Fecha", "Modo de entrega", "Transportista", "Despachado por"]) {
      const fila = rotulo(t).parentElement!;
      expect(fila.textContent, `«${t}» sin candado`).toContain("bloqueado");
    }
    // Y su valor se lee, no desaparece.
    const cajas = cajasBloqueadas().map((e) => (e.textContent || "").trim());
    expect(cajas).toContain("2026-08-19");
    expect(cajas).toContain("Transporte Sol");
    expect(cajas).toContain("Julio");
  });

  it("la fecha, el transportista y quién despachó NO son campos escribibles", async () => {
    await montarDespachada();
    expect(document.querySelector("#guia-fecha")).toBeNull();
    expect(document.querySelector("#guia-entregado-por")).toBeNull();
    expect(document.querySelectorAll("select")).toHaveLength(0);
  });

  it("las observaciones se dibujan SIEMPRE, bloqueadas, aunque estén vacías", async () => {
    await montarDespachada();
    const fila = rotulo("Observaciones").parentElement!;
    expect(fila.textContent).toContain("bloqueado");
    expect(document.querySelector("#guia-observaciones")).toBeNull();
  });
});

describe('🔴 el «Falta: …» se dice UNA SOLA VEZ, y es la de abajo', () => {
  it("una pendiente sin transportista lo dice exactamente una vez", async () => {
    window.history.replaceState({}, "", `/guias/${GUIA_ID}?editar=1`);
    stubFetch({
      estado: "Pendiente Bodega",
      transportista_id: null,
      transportista: "",
      firma_base64: "",
      firma_entregador_base64: "",
    });
    render(<GuiaPage />);
    await screen.findByText(/Editar Guía de Transporte/i);
    const textos = (await screen.findAllByText(/^Falta:/)).map((e) => (e.textContent || "").trim());

    // 🔴 EL INVARIANTE ES QUE NINGÚN AVISO SE REPITA, no que haya uno solo en
    // pantalla: el «Falta: placa, recibido por y cédula» del bloque de DESPACHO
    // es OTRO aviso, de otro botón, y sigue igual. Lo que Daniel vio repetido
    // fue el del formulario, dos veces con las MISMAS palabras.
    expect(new Set(textos).size, `repetido: ${textos.join(" | ")}`).toBe(textos.length);

    // El aviso del formulario, palabra por palabra. (El otro «Falta: …» de la
    // pantalla es el de las FIRMAS, del bloque de despacho, y no se tocó.)
    expect(textos.filter((t) => t === "Falta: el transportista")).toHaveLength(1);
  });

  it("…y el único que queda está JUNTO al botón grande, no en la barra pegajosa", async () => {
    window.history.replaceState({}, "", `/guias/${GUIA_ID}?editar=1`);
    stubFetch({
      estado: "Pendiente Bodega",
      transportista_id: null,
      transportista: "",
      firma_base64: "",
      firma_entregador_base64: "",
    });
    render(<GuiaPage />);
    await screen.findByText(/Editar Guía de Transporte/i);
    const aviso = (await screen.findAllByText(/^Falta:/)).find(
      (e) => (e.textContent || "").trim() === "Falta: el transportista",
    )!;
    expect(aviso, "no salió el «Falta: …» del formulario").not.toBeUndefined();
    // La barra pegajosa es el ancestro con `sticky`; el aviso no puede colgar de ella.
    let p: HTMLElement | null = aviso.parentElement;
    let dentroDeLaBarra = false;
    while (p) {
      if ((p.className || "").includes("sticky")) dentroDeLaBarra = true;
      p = p.parentElement;
    }
    expect(dentroDeLaBarra).toBe(false);
    // Y el botón apagado sigue explicándose al pasar por encima.
    const guardar = screen.getAllByRole("button", { name: /Guardar Cambios/i });
    expect(guardar.some((b) => (b.getAttribute("title") || "").startsWith("Falta:"))).toBe(true);
  });
});

describe('🔴 «Agregar destino» salió del título de la sección', () => {
  it("el encabezado «Detalle de Envío» ya no tiene ningún botón pegado", async () => {
    await montarPendiente();
    const enc = Array.from(document.querySelectorAll("div")).find(
      (d) => (d.textContent || "").trim() === "Detalle de Envío",
    );
    expect(enc, "no se encontró el encabezado de la sección").not.toBeUndefined();
    expect(enc!.querySelector("button")).toBeNull();
  });

  it("sigue existiendo, DEBAJO de la lista y diciendo qué hace", async () => {
    await montarPendiente();
    const boton = screen.getByRole("button", { name: /Agregar destino a la lista/i });
    // El rótulo se LEE, no vive solo en el aria-label: un "＋" pelado no dice nada.
    expect(boton.textContent).toContain("Agregar destino a la lista");
    expect(boton.className).toContain("min-h-[44px]");
  });

  it("y sigue agregando la ciudad a las sugerencias de dirección", async () => {
    await montarPendiente();
    fireEvent.click(screen.getByRole("button", { name: /Agregar destino a la lista/i }));
    const input = screen.getByLabelText(/Agregar destino a la lista/i);
    fireEvent.change(input, { target: { value: "Aguadulce" } });
    fireEvent.click(screen.getByRole("button", { name: /^Guardar$/i }));
    await waitFor(() => {
      const opciones = Array.from(
        document.querySelectorAll<HTMLOptionElement>("#direcciones-list option"),
      ).map((o) => o.value);
      expect(opciones).toContain("Aguadulce");
    });
  });

  it("en una guía firmada NO se ofrece: la dirección está bloqueada", async () => {
    await montarDespachada();
    expect(screen.queryByRole("button", { name: /Agregar destino/i })).toBeNull();
  });
});
