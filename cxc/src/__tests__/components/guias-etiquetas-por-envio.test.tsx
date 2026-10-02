/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 GUÍAS › ETIQUETAS POR ENVÍO — LAS PANTALLAS, dibujadas de verdad
 * (1-oct-2026)
 *
 * Daniel, 1-oct-2026: etiquetas POR ENVÍO, numeración corrida, nota opcional
 * con las 3 más usadas a la mano, se imprime AL FINAL; lo impreso no se cambia
 * («Anular envío», nunca «Corregir bultos»); en la guía el envío es UN renglón
 * con los bultos bloqueados, también en el celular de bodega.
 *
 * Lo que este archivo fija:
 *   1. La lista: UNA fila por envío, con el rango de cada factura y su nota;
 *      el «···» ofrece Reimprimir y Anular envío —bloqueado si ya salió en una
 *      guía— y NUNCA «Corregir bultos».
 *   2. El panel: varias facturas con casilla, bultos y nota por factura, los
 *      atajos de notas, la numeración corrida a la vista, 4×6 por defecto, y
 *      un solo POST con el envío entero.
 *   3. Nueva guía: una casilla por ENVÍO llena UN renglón.
 *   4. La guía: el renglón del envío muestra sus bultos con candado, sin caja.
 *   5. El celular de bodega: sin caja de bultos para el envío etiquetado.
 * ─────────────────────────────────────────────────────────────────────────────
 */
// 🔄 1-oct-2026: nombres de ERP en Guías (Daniel aprobó el audit): rótulos en tipo oración
// («Guardar guía», «Nueva guía de despacho», «Tipo de despacho», «Vincular cliente»…).
// Este candado leía los textos viejos y se actualiza a propósito.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, cleanup, act, waitFor } from "@testing-library/react";

// El PDF no se arma en jsdom: se deja que `armar` corra (el POST es lo que se
// mira) y se traga lo que el navegador de mentira no sabe hacer.
const pdf = vi.hoisted(() => ({ llamadas: 0 }));
vi.mock("@/lib/guias/pdf-en-pestana", () => ({
  abrirPdfEnPestana: async (armar: () => Promise<unknown>) => {
    pdf.llamadas++;
    try { await armar(); } catch { /* jsdom sin bloburl */ }
    return "pestana";
  },
}));

import EtiquetasView from "@/app/guias/components/EtiquetasView";
import EtiquetasPendientes from "@/app/guias/components/EtiquetasPendientes";
import ListaEnvios from "@/app/guias/components/ListaEnvios";
import GuiaForm from "@/app/guias/components/GuiaForm";
import type { GuiaItem } from "@/app/guias/components/types";
import type { EtiquetaFila } from "@/lib/guias/etiquetas";

const NOVA = { codigo: "D-170", nombre: "Nova Lux, S.A." };
const ENVIO = "6f1c2b9e-0000-4000-8000-000000000001";

function etq(over: Partial<EtiquetaFila> = {}): EtiquetaFila {
  return {
    id: 1,
    empresa_key: "fashion_shoes",
    empresa: "Fashion Shoes",
    switch_factura_id: 1,
    secuencial: "11-000000001",
    fecha_factura: "2026-10-01",
    cliente_codigo: NOVA.codigo,
    cliente_nombre: NOVA.nombre,
    destino: "Paso Canoas",
    cajas: 10,
    creado_en: "2026-10-01T10:00:00-05:00",
    guia_numero: null,
    envio_id: ENVIO,
    orden_en_envio: 1,
    nota: null,
    ...over,
  };
}

const A = etq({ id: 1 });
const B = etq({ id: 2, switch_factura_id: 2, secuencial: "11-000000002", orden_en_envio: 2, nota: "FRÁGIL" });

const FACTURAS = [
  { empresa_key: "fashion_shoes", empresa: "Fashion Shoes", switch_factura_id: 31, secuencial: "11-000000031", fecha: "2026-10-01T16:00:00Z", total: 1200, yaSalioEn: null },
  { empresa_key: "fashion_shoes", empresa: "Fashion Shoes", switch_factura_id: 32, secuencial: "11-000000032", fecha: "2026-10-01T15:00:00Z", total: 300, yaSalioEn: null },
];

let posts: Array<Record<string, unknown>>;

function servir(etiquetas: EtiquetaFila[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      const u = String(url);
      if (u.startsWith("/api/guias/etiquetas") && init?.method === "POST") {
        const cuerpo = JSON.parse(String(init.body)) as Record<string, unknown>;
        posts.push(cuerpo);
        const fs = cuerpo.facturas as Array<Record<string, unknown>>;
        const creadas = fs.map((f, i) => etq({ id: 50 + i, switch_factura_id: Number(f.switch_factura_id), secuencial: String(f.secuencial), cajas: Number(f.cajas), orden_en_envio: i + 1, nota: (f.nota as string | null) ?? null }));
        return { ok: true, status: 201, json: async () => ({ ok: true, etiquetas: creadas }) } as unknown as Response;
      }
      if (u.startsWith("/api/guias/etiquetas")) {
        return { ok: true, status: 200, json: async () => ({ etiquetas }) } as unknown as Response;
      }
      if (u.startsWith("/api/guias/facturas-cliente")) {
        return { ok: true, json: async () => ({ facturas: FACTURAS, hasta: null }) } as unknown as Response;
      }
      if (u.startsWith("/api/guias/frecuencias") || u.startsWith("/api/clientes")) {
        return { ok: true, json: async () => ({ clientes: [NOVA], empresas: [], destinos: {}, definidos: {} }) } as unknown as Response;
      }
      return { ok: true, json: async () => ({}) } as unknown as Response;
    }),
  );
}

function memStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
    removeItem: (k: string) => { m.delete(k); },
    clear: () => m.clear(),
    key: () => null,
    length: 0,
  } as unknown as Storage;
}

async function asentar() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  posts = [];
  pdf.llamadas = 0;
  vi.stubGlobal("localStorage", memStorage());
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => { cb(0); return 0; });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

// ─── 1 · la lista ────────────────────────────────────────────────────────────

describe("🔴 1. la lista: una fila por ENVÍO, y lo impreso no se corrige", () => {
  it("dos facturas del mismo envío son UNA fila: cada una con su rango, la nota y el total", async () => {
    servir([B, A]);
    render(<EtiquetasView />);
    await waitFor(() => expect(screen.getByText("11-000000001")).toBeTruthy());
    expect(document.querySelectorAll("tr[data-envio]")).toHaveLength(1);
    expect(screen.getByText("· 1–10")).toBeTruthy();
    expect(screen.getByText("· 11–20")).toBeTruthy();
    expect(screen.getByText("FRÁGIL")).toBeTruthy();
    expect(screen.getByText("20")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Pendientes de guía · 1/ })).toBeTruthy();
  });

  it("🔴 el «···»: Reimprimir y Anular envío — y NUNCA «Corregir bultos»", async () => {
    servir([A, B]);
    render(<EtiquetasView />);
    fireEvent.click((await screen.findAllByRole("button", { name: /Más opciones/ }))[0]);
    const items = (await screen.findAllByRole("menuitem")) as HTMLButtonElement[];
    expect(items.map((b) => b.textContent)).toEqual(["Reimprimir", "Anular envío"]);
    expect(items.every((b) => !b.disabled)).toBe(true);
    fireEvent.click(items[1]);
    expect(await screen.findByText(/Se anulan las 20 etiquetas de las facturas 11-000000001, 11-000000002/)).toBeTruthy();
    expect(screen.getByText(/nada se borra de verdad/i)).toBeTruthy();
  });

  it("🔴 ya en una guía: «Anular envío» sale APAGADO y lo dice", async () => {
    servir([{ ...A, guia_numero: 256 }, { ...B, guia_numero: 256 }]);
    render(<EtiquetasView />);
    fireEvent.click(await screen.findByRole("button", { name: /Todos · 1/ }));
    fireEvent.click((await screen.findAllByRole("button", { name: /Más opciones/ }))[0]);
    const [reimprimir, anular] = (await screen.findAllByRole("menuitem")) as HTMLButtonElement[];
    expect(reimprimir.disabled).toBe(false);
    expect(anular.disabled).toBe(true);
    expect(anular.textContent).toContain("bloqueado");
    expect(screen.getByText("En GT-256")).toBeTruthy();
  });

  it("reimprimir: el envío completo o UN bulto, diciendo de qué factura es", async () => {
    servir([A, B]);
    render(<EtiquetasView />);
    fireEvent.click((await screen.findAllByRole("button", { name: /Más opciones/ }))[0]);
    fireEvent.click((await screen.findAllByRole("menuitem"))[0]);
    expect(await screen.findByText("Las 20 etiquetas, iguales a las impresas.")).toBeTruthy();
    fireEvent.click(screen.getByText("Un solo bulto"));
    fireEvent.change(screen.getByLabelText("Bulto"), { target: { value: "15" } });
    expect(screen.getByText("Es de la factura 11-000000002.")).toBeTruthy();
  });
});

// ─── 2 · el panel ────────────────────────────────────────────────────────────

async function abrirPanel(etiquetas: EtiquetaFila[]) {
  servir(etiquetas);
  render(<EtiquetasView />);
  fireEvent.click(await screen.findByRole("button", { name: /Nuevo envío/ }));
  const campo = document.getElementById("etiquetas-cliente") as HTMLInputElement;
  fireEvent.focus(campo);
  fireEvent.change(campo, { target: { value: "Nova" } });
  const opcion = await screen.findByText(NOVA.nombre, { selector: "[data-desplegable] *" });
  fireEvent.mouseDown(opcion.closest("button") ?? opcion);
  await asentar();
}

describe("🔴 2. el panel: varias facturas, bultos y nota por factura, imprimir al final", () => {
  it("marca dos, escribe 10 y 5: la numeración corrida a la vista, y 4×6 por defecto", async () => {
    await abrirPanel([]);
    const [c1, c2] = screen.getAllByRole("checkbox") as HTMLInputElement[];
    fireEvent.click(c1);
    fireEvent.click(c2);
    fireEvent.change(document.getElementById("envio-bultos-fashion_shoes-11-000000031")!, { target: { value: "10" } });
    fireEvent.change(document.getElementById("envio-bultos-fashion_shoes-11-000000032")!, { target: { value: "5" } });
    const resumen = screen.getByTestId("resumen-envio");
    expect(resumen.textContent).toContain("bultos 1–10 de 15");
    expect(resumen.textContent).toContain("bultos 11–15 de 15");
    expect(screen.getByRole("button", { name: "Imprimir 15 etiquetas · 15 páginas" })).toBeTruthy();
  });

  it("🔴 la nota va en mayúsculas, ≤ 15, y abajo las notas MÁS USADAS como atajo", async () => {
    await abrirPanel([
      etq({ id: 7, envio_id: "x", switch_factura_id: 900, nota: "NO APILAR" }),
      etq({ id: 8, envio_id: "y", switch_factura_id: 901, nota: "NO APILAR" }),
      etq({ id: 9, envio_id: "z", switch_factura_id: 902, nota: "VIDRIO" }),
    ]);
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    const nota = document.getElementById("envio-nota-fashion_shoes-11-000000031") as HTMLInputElement;
    expect(nota.maxLength).toBe(15);
    fireEvent.change(nota, { target: { value: "frágil" } });
    expect(nota.value).toBe("FRÁGIL");
    const atajos = screen.getAllByRole("button", { name: /^(NO APILAR|VIDRIO)$/ });
    expect(atajos.map((b) => b.textContent)).toEqual(["NO APILAR", "VIDRIO"]);
    fireEvent.click(atajos[0]);
    expect(nota.value).toBe("NO APILAR");
  });

  it("🔴 imprimir manda UN POST con el envío entero, en el orden en que se marcó", async () => {
    await abrirPanel([]);
    const [c1, c2] = screen.getAllByRole("checkbox") as HTMLInputElement[];
    fireEvent.click(c2);
    fireEvent.click(c1);
    fireEvent.change(document.getElementById("envio-bultos-fashion_shoes-11-000000032")!, { target: { value: "3" } });
    fireEvent.change(document.getElementById("envio-bultos-fashion_shoes-11-000000031")!, { target: { value: "2" } });
    fireEvent.change(document.getElementById("envio-nota-fashion_shoes-11-000000031")!, { target: { value: "urgente" } });
    fireEvent.change(screen.getByLabelText("Destino del envío"), { target: { value: "David" } });
    fireEvent.click(screen.getByRole("button", { name: /Imprimir 5 etiquetas/ }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({ empresa_key: "fashion_shoes", cliente_codigo: "D-170", destino: "David" });
    expect((posts[0].facturas as Array<Record<string, unknown>>).map((f) => [f.secuencial, f.cajas, f.nota])).toEqual([
      ["11-000000032", 3, null],
      ["11-000000031", 2, "URGENTE"],
    ]);
    expect(pdf.llamadas).toBe(1);
  });

  it("sin bultos no se imprime: dice qué falta y no manda nada", async () => {
    await abrirPanel([]);
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    fireEvent.change(screen.getByLabelText("Destino del envío"), { target: { value: "David" } });
    fireEvent.click(screen.getByRole("button", { name: "Imprimir" }));
    expect(await screen.findByText(/11-000000031: Tiene que ser al menos un bulto/)).toBeTruthy();
    expect(posts).toHaveLength(0);
  });
});

// ─── 2b · el orden de los bultos (1-oct-2026) ───────────────────────────────

describe("🔴 2b. cada factura marcada lleva su NÚMERO DE ORDEN y se reordena con ↑ ↓ (1-oct-2026)", () => {
  it("1 y 2 al marcar; ↑ en la segunda la pone primera, los rangos se mueven y el POST sale en ese orden", async () => {
    await abrirPanel([]);
    const [c1, c2] = screen.getAllByRole("checkbox") as HTMLInputElement[];
    fireEvent.click(c1);
    fireEvent.click(c2);
    expect([...document.querySelectorAll("[data-orden]")].map((e) => e.textContent)).toEqual(["1", "2"]);
    fireEvent.change(document.getElementById("envio-bultos-fashion_shoes-11-000000031")!, { target: { value: "10" } });
    fireEvent.change(document.getElementById("envio-bultos-fashion_shoes-11-000000032")!, { target: { value: "5" } });
    const resumen = () => screen.getByTestId("resumen-envio").textContent ?? "";
    expect(resumen()).toMatch(/11-000000031bultos 1–10 de 15.*11-000000032bultos 11–15 de 15/);
    // El primero no sube y el último no baja.
    expect((screen.getByRole("button", { name: "Subir 11-000000031" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Bajar 11-000000032" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Subir 11-000000032" }));
    expect(resumen()).toMatch(/11-000000032bultos 1–5 de 15.*11-000000031bultos 6–15 de 15/);
    // El número de orden de la lista sigue al cambio.
    const orden = (sec: string) =>
      screen.getAllByText(sec).map((el) => el.closest("label")?.querySelector("[data-orden]")?.textContent).find(Boolean);
    expect(orden("11-000000032")).toBe("1");
    expect(orden("11-000000031")).toBe("2");
    fireEvent.change(screen.getByLabelText("Destino del envío"), { target: { value: "David" } });
    fireEvent.click(screen.getByRole("button", { name: /Imprimir 15 etiquetas/ }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect((posts[0].facturas as Array<Record<string, unknown>>).map((f) => f.secuencial)).toEqual([
      "11-000000032",
      "11-000000031",
    ]);
  });

  it("🔴 no se ofrece la factura que ya salió en una guía, y se dice", async () => {
    servirConYaSalida();
    render(<EtiquetasView />);
    fireEvent.click(await screen.findByRole("button", { name: /Nuevo envío/ }));
    const campo = document.getElementById("etiquetas-cliente") as HTMLInputElement;
    fireEvent.focus(campo);
    fireEvent.change(campo, { target: { value: "Nova" } });
    const opcion = await screen.findByText(NOVA.nombre, { selector: "[data-desplegable] *" });
    fireEvent.mouseDown(opcion.closest("button") ?? opcion);
    await asentar();
    await screen.findByText("11-000000032");
    expect(screen.queryByText("11-000000031")).toBeNull();
    expect(screen.getByText("1 factura de este cliente ya salió en una guía")).toBeTruthy();
  });
});

/** La 31 ya salió en GT-271 (una guía hecha a mano). */
function servirConYaSalida() {
  servir([]);
  const base = globalThis.fetch as unknown as (u: string, i?: unknown) => Promise<unknown>;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: unknown) => {
      if (String(url).startsWith("/api/guias/facturas-cliente")) {
        return {
          ok: true,
          json: async () => ({ facturas: [{ ...FACTURAS[0], yaSalioEn: 271 }, FACTURAS[1]], hasta: null }),
        } as unknown as Response;
      }
      return base(url, init);
    }),
  );
}

// ─── 3 · Nueva guía ──────────────────────────────────────────────────────────

function filaVacia(uid = "a"): GuiaItem {
  return { uid, orden: 1, cliente: "", cliente_codigo: "", direccion: "", empresa: "", facturas: "", bultos: 0, numero_guia_transp: "" };
}

let capturados: GuiaItem[] = [];
let seleccion: number[] = [];

function PendientesHarness({ etiquetas }: { etiquetas: EtiquetaFila[] }) {
  const [items, setItems] = useState<GuiaItem[]>([filaVacia()]);
  capturados = items;
  return (
    <EtiquetasPendientes
      items={items}
      etiquetas={etiquetas}
      onReemplazarItems={(next) => setItems(next.map((it, i) => ({ ...it, orden: i + 1, uid: it.uid ?? `n${i}` })))}
      onSeleccion={(ids) => { seleccion = ids; }}
    />
  );
}

describe("🔴 3. Nueva guía: una casilla por ENVÍO, un renglón, bultos bloqueados", () => {
  it("marcar el envío llena UN renglón con sus dos facturas y 20 bultos; los dos ids se atan", async () => {
    render(<PendientesHarness etiquetas={[A, B]} />);
    expect(screen.getByText("Envíos etiquetados pendientes · 1")).toBeTruthy();
    const casillas = screen.getAllByRole("checkbox");
    expect(casillas).toHaveLength(1);
    fireEvent.click(casillas[0]);
    await asentar();
    expect(capturados).toHaveLength(1);
    expect(capturados[0]).toMatchObject({ facturas: "11-000000001, 11-000000002", bultos: 20, direccion: "Paso Canoas", con_etiquetas: true });
    expect(seleccion.sort()).toEqual([1, 2]);
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    await asentar();
    expect(capturados[0]).toMatchObject({ facturas: "", bultos: 0 });
    expect(seleccion).toEqual([]);
  });
});

// ─── 4 · la guía ─────────────────────────────────────────────────────────────

function FormHarness({ items }: { items: GuiaItem[] }) {
  return (
    <GuiaForm
      editingId="g-1"
      formNumero={231}
      fecha="2026-10-01" setFecha={() => {}}
      modoEntrega="entrega_directa" setModoEntrega={() => {}}
      transportistaId={null} setTransportistaId={() => {}}
      entregadoPor="Julio" setEntregadoPor={() => {}}
      observaciones="" setObservaciones={() => {}}
      items={items}
      transportistas={[]}
      direcciones={[]}
      validationErrors={new Set()}
      error={null}
      saving={false}
      onAddDireccion={() => {}}
      onAddTransportista={() => {}}
      onUpdateItem={() => {}}
      onUpdateItemFields={() => {}}
      onAddRow={() => {}}
      onRemoveRow={() => {}}
      onRestoreRow={() => {}}
      onSave={() => {}}
      onCancel={() => {}}
    />
  );
}

const DEL_ENVIO: GuiaItem = {
  id: "r1", uid: "env", orden: 1, cliente: NOVA.nombre, cliente_codigo: NOVA.codigo, direccion: "Paso Canoas",
  empresa: "Fashion Shoes", facturas: "11-000000001, 11-000000002", bultos: 20, numero_guia_transp: "", con_etiquetas: true,
};
const A_MANO: GuiaItem = {
  id: "r2", uid: "mano", orden: 2, cliente: "Golden Mall", cliente_codigo: "D-55", direccion: "David",
  empresa: "Vistana International", facturas: "11-000003102", bultos: 7, numero_guia_transp: "",
};

describe("🔴 4. en la guía, los bultos del envío se ven con candado y no se editan", () => {
  beforeEach(() => servir([]));

  it("el renglón del envío: sin caja de bultos, con candado; el escrito a mano, editable como siempre", () => {
    render(<FormHarness items={[DEL_ENVIO, A_MANO]} />);
    expect(document.getElementById("bultos-env-d")).toBeNull();
    expect(document.getElementById("bultos-env-m")).toBeNull();
    expect(document.querySelectorAll("[data-bloqueado-por-etiquetas]").length).toBeGreaterThan(0);
    expect(document.getElementById("bultos-mano-d")).toBeTruthy();
    expect(document.getElementById("bultos-mano-m")).toBeTruthy();
  });
});

// ─── 5 · el celular de bodega ────────────────────────────────────────────────

describe("🔴 5. el celular de bodega: el envío etiquetado no tiene caja de bultos", () => {
  it("al despachar, solo el renglón a mano trae la caja; el del envío se LEE con candado", () => {
    render(
      <ListaEnvios
        items={[DEL_ENVIO, A_MANO]}
        numerosTransp={["", ""]}
        setNumeroTransp={() => {}}
        editable
        externo
        bultosPorLinea={[20, 7]}
        setBultos={() => {}}
        rol="bodega"
      />,
    );
    expect(document.getElementById("despacho-bultos-0")).toBeNull();
    expect(document.getElementById("despacho-bultos-1")).toBeTruthy();
    const fijo = document.querySelector("[data-bultos-de-etiquetas]");
    expect(fijo?.textContent).toContain("20 bultos");
    // 🔴 Lo que NO se quitó: el N° del transportista sigue en LAS DOS líneas.
    expect(document.getElementById("transp-0")).toBeTruthy();
    expect(document.getElementById("transp-1")).toBeTruthy();
  });
});
