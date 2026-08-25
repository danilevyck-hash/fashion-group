/**
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPRIMIR · COMPARTIR · QUEDARSE EN LA GUÍA · Y LO QUE FALTÓ, MARCADO.
 *
 * Cuatro cosas que Daniel aprobó punto por punto y que sin candado se
 * desarman solas:
 *   · punto 10 — *"Imprimir → un botón que imprime directo"* (antes abría una
 *     pestaña con la vista previa y adentro había que buscar otro «Imprimir»);
 *   · punto 11 — *"Compartir → otro botón que manda el PDF"*;
 *   · punto 12 — *"Al guardar una guía nueva te deja **EN la guía**, lista para
 *     imprimir"* (antes te sacaba al listado, justo cuando lo siguiente es
 *     imprimirla para dársela al chofer);
 *   · punto 13 — *"Las 68 sin placa y 65 sin recibido → marcadas"*.
 *
 * 🔴 CANDADO DE CONDUCTA: se RENDERIZA y se TOCAN LOS BOTONES. Un barrido de
 * texto sobre el .tsx se cumple con el comentario que explica el cambio — en
 * este repo ya pasó cuatro veces.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";
import GuiasList from "@/app/guias/components/GuiasList";
import type { Guia } from "@/app/guias/components/types";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useParams: () => ({}),
}));
vi.mock("@/lib/hooks/useAuth", () => ({
  useAuth: () => ({ authChecked: true, role: "secretaria" }),
}));
vi.mock("@/components/AppHeader", () => ({ default: () => <div /> }));

/** El papel se arma de verdad; acá solo se mira QUIÉN lo pide y con qué guía. */
const impresas: Guia[] = [];
const compartidas: Guia[] = [];
vi.mock("@/lib/guias/papel-de-la-guia", async () => {
  const real = await vi.importActual<typeof import("@/lib/guias/papel-de-la-guia")>(
    "@/lib/guias/papel-de-la-guia",
  );
  return {
    ...real,
    imprimirGuia: (g: Guia) => { impresas.push(g); return "dialogo" as const; },
    compartirGuia: async (g: Guia) => { compartidas.push(g); return "compartido" as const; },
  };
});

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

const ITEMS = [
  { id: "i1", orden: 1, cliente: "CITY MALL PASO CANOA", cliente_codigo: "D-25", direccion: "Paso Canoas", empresa: "Fashion Wear", facturas: "F-1001", bultos: 6, numero_guia_transp: "725" },
];

function guia(over: Partial<Guia> = {}): Guia {
  return {
    id: "g1",
    numero: 229,
    fecha: "2026-08-20",
    transportista: "Transporte Sol",
    modo_entrega: "transportista",
    transportista_id: "t1",
    placa: "EK0700",
    observaciones: "",
    total_bultos: 6,
    item_count: 1,
    monto_total: 0,
    estado: "Completada",
    tipo_despacho: "externo",
    receptor_nombre: "Nicolás guillen",
    cedula: "1-727-44",
    numero_guia_transp: "725",
    guia_items: ITEMS,
    ...over,
  } as Guia;
}

function lista(over: Partial<Guia> = {}, role = "secretaria") {
  const g = guia(over);
  return render(
    <GuiasList
      guias={[g]}
      loading={false}
      error={null}
      search=""
      setSearch={() => {}}
      showPending={false}
      setShowPending={() => {}}
      role={role}
      onNewGuia={() => {}}
      expandedId="g1"
      expandedGuia={g}
      expandedLoading={false}
      onToggleExpand={() => {}}
      onEditar={() => {}}
      onDespachar={() => {}}
      onDelete={() => {}}
    />,
  );
}

beforeEach(() => {
  impresas.length = 0;
  compartidas.length = 0;
  push.mockClear();
  vi.stubGlobal("localStorage", memStorage());
  vi.stubGlobal("sessionStorage", memStorage());
  vi.stubGlobal("open", vi.fn());
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 10 · «Imprimir» IMPRIME, no abre una pestaña", () => {
  it("tocar «Imprimir» manda ESA guía al papel, de un toque", async () => {
    lista();
    fireEvent.click(screen.getByRole("button", { name: /Imprimir/ }));
    await waitFor(() => expect(impresas).toHaveLength(1));
    expect(impresas[0].numero).toBe(229);
  });

  it("🩸 y NO abre una pestaña con la vista previa — ése era el defecto", async () => {
    lista();
    fireEvent.click(screen.getByRole("button", { name: /Imprimir/ }));
    await waitFor(() => expect(impresas).toHaveLength(1));
    expect(window.open).not.toHaveBeenCalled();
  });

  it("no imprime una guía sin renglones: sería un papel sin envíos", async () => {
    lista({ guia_items: [] });
    fireEvent.click(screen.getByRole("button", { name: /Imprimir/ }));
    await new Promise((r) => setTimeout(r, 30));
    expect(impresas).toHaveLength(0);
  });
});

describe("🔴 11 · «Compartir» manda el PDF", () => {
  it("está, y es OTRO botón: no comparte el que imprime", async () => {
    lista();
    const compartir = screen.getByRole("button", { name: /Compartir/ });
    const imprimir = screen.getByRole("button", { name: /Imprimir/ });
    expect(compartir).not.toBe(imprimir);
    fireEvent.click(compartir);
    await waitFor(() => expect(compartidas).toHaveLength(1));
    expect(compartidas[0].numero).toBe(229);
    // Y compartir NO imprime.
    expect(impresas).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 13 · la guía que salió incompleta queda MARCADA", () => {
  it("🔴 sin placa → el chip está en LOS DOS layouts, y adentro dice qué falta", () => {
    // ⚠️ La fila se dibuja DOS veces —tarjeta de celular y renglón de
    // escritorio— y el CSS esconde una. Contar "al menos uno" dejaba pasar la
    // mutación que borraba el chip de escritorio: el de celular la tapaba.
    // Medido: la mutación SOBREVIVIÓ hasta que este test exigió los dos.
    lista({ placa: "" });
    expect(screen.getAllByText("Salió incompleta")).toHaveLength(2);
    expect(screen.getByText(/Salió sin la placa/)).toBeTruthy();
  });

  it("sin «Recibido por» → también, y en los dos layouts", () => {
    lista({ receptor_nombre: "" });
    expect(screen.getAllByText("Salió incompleta")).toHaveLength(2);
    expect(screen.getByText(/Salió sin quién recibió/)).toBeTruthy();
  });

  it("una guía completa NO se marca", () => {
    lista();
    expect(screen.queryByText("Salió incompleta")).toBeNull();
  });

  it("🔴 una guía PENDIENTE no se marca: todavía se está llenando el dato", () => {
    lista({ estado: "Pendiente Bodega", placa: "", receptor_nombre: "", cedula: "" });
    expect(screen.queryByText("Salió incompleta")).toBeNull();
  });

  it("🔴 MARCA, NO ABRE: no aparece ningún campo para escribir la placa", () => {
    lista({ placa: "" });
    expect(document.getElementById("despacho-placa")).toBeNull();
    expect(screen.queryByRole("button", { name: /Anotar la placa/i })).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 12 · GUARDAR UNA GUÍA NUEVA TE DEJA **EN LA GUÍA**
//
// 🩸 Se terminaba de cargar la guía, se apretaba «Guardar Guía» y la pantalla
// saltaba a `/guias` — justo cuando lo siguiente que hace la secretaria es
// IMPRIMIRLA para dársela al chofer. Había que buscarla en la lista, abrir el
// acordeón y recién ahí imprimir.
//
// Va en un archivo aparte del resto porque monta OTRA pantalla.
// ─────────────────────────────────────────────────────────────────────────────
import GuiaNuevaPage from "@/app/guias/nueva/page";

describe("🔴 12 · al guardar una guía nueva, te quedás EN la guía", () => {
  const ID_CREADA = "77777777-7777-4777-8777-777777777777";

  let llamadasPost: Array<Record<string, unknown>> = [];

  function stubCrear(devuelveId = true) {
    llamadasPost = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const u = String(url);
        const metodo = (init?.method || "GET").toUpperCase();
        if (metodo === "POST" && u === "/api/guias") {
          try { llamadasPost.push(JSON.parse(String(init?.body ?? "{}"))); } catch { /* */ }
          return { ok: true, json: async () => (devuelveId ? { id: ID_CREADA, numero: 231 } : { numero: 231 }) };
        }
        if (u.startsWith("/api/transportistas")) {
          return { ok: true, json: async () => [{ id: "t1", nombre: "Transporte Sol", activo: true }] };
        }
        if (u.startsWith("/api/guias")) return { ok: true, json: async () => [] };
        return { ok: true, json: async () => ({ clientes: [], empresas: [], direcciones: {} }) };
      }),
    );
  }

  /** Llena lo mínimo que `validarGuia` exige y aprieta «Guardar Guía». */
  async function crearYGuardar(opts: { numeroTransp?: string } = {}) {
    render(<GuiaNuevaPage />);
    await screen.findByText(/Nueva Guía de Transporte/i);
    const campo = (prefijo: string) =>
      document.querySelector<HTMLInputElement | HTMLSelectElement>(`[id^="${prefijo}-"][id$="-m"]`)!;
    await act(async () => {
      fireEvent.change(document.getElementById("guia-fecha") as HTMLInputElement, { target: { value: "2026-08-25" } });
      fireEvent.change(document.querySelector("select")!, { target: { value: "t1" } });
      fireEvent.change(document.getElementById("guia-entregado-por") as HTMLSelectElement, { target: { value: "Julio" } });
      // 🩸 EL CLIENTE ES UN `ClientePicker`, NO UN `<input>` PELADO: teclear
      // ahí NO le mueve el estado al formulario — hay que ELEGIR. La salida a
      // mano se llama con todas las letras y hay que tocarla a propósito
      // (#567). Este mismo detalle ya dejó una mutación sin cazar el 23-ago.
      fireEvent.change(campo("cliente"), { target: { value: "CITY MALL" } });
    });
    await act(async () => {
      // ⚠️ `onMouseDown`, no `onClick`: la opción se elige antes del `onBlur`
      // del campo (si esperara al click, el desplegable ya se cerró).
      fireEvent.mouseDown(screen.getAllByText(/No está en la lista — escribir a mano/)[0]);
    });
    await act(async () => {
      fireEvent.change(campo("direccion"), { target: { value: "Paso Canoas" } });
      fireEvent.change(campo("empresa"), { target: { value: "Fashion Wear" } });
      fireEvent.change(campo("facturas"), { target: { value: "10234" } });
      fireEvent.change(campo("bultos"), { target: { value: "6" } });
      // 🔴 El N° del transportista es POR LÍNEA, al lado de los bultos.
      if (opts.numeroTransp) {
        fireEvent.change(campo("numtransp"), { target: { value: opts.numeroTransp } });
      }
    });
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: /Guardar Guía/i })[0]);
      await new Promise((r) => setTimeout(r, 200));
    });
  }

  it("🔴 aterriza en la guía recién creada, lista para imprimir", async () => {
    stubCrear(true);
    await crearYGuardar();
    expect(push).toHaveBeenCalledWith(`/guias/${ID_CREADA}`);
    expect(push).not.toHaveBeenCalledWith("/guias");
  });

  it("🔴 la guía nueva manda a la cabecera el N° de su PRIMERA línea", async () => {
    // La columna `guia_transporte.numero_guia_transp` no se retiró: la leen el
    // buscador, el Excel, el chip ámbar y el encabezado del papel. El campo de
    // cabecera salió del formulario, así que el valor se DERIVA de los
    // renglones — si no viajara, una guía nueva nacería sin él.
    stubCrear(true);
    await crearYGuardar({ numeroTransp: "TR-4471" });
    const post = llamadasPost.at(-1)!;
    expect(post.numero_guia_transp).toBe("TR-4471");
  });

  it("⚠️ si el servidor no devuelve el id, se vuelve al listado — quedarse quieto sería peor", async () => {
    stubCrear(false);
    await crearYGuardar();
    expect(push).toHaveBeenCalledWith("/guias");
  });
});
