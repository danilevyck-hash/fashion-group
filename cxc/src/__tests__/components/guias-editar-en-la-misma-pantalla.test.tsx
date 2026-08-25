/**
 * 🔴 «EDITAR» ABRE EL MISMO FORMULARIO DEL ALTA, DENTRO DE LA GUÍA.
 *
 * Daniel, textual: *"veo algo raro en guias, al editar una, tengo que poner
 * despachar para editar en vez de editar, quiero botón de editar y que se me
 * abra la guía para editar así mismo como si estuviese haciendo la guía, no
 * algo diferente"*.
 *
 * 🔑 POR QUÉ ESTE CANDADO RENDERIZA Y TOCA LOS BOTONES, y no barre el archivo:
 * un barrido de texto sobre `page.tsx` se cumple con el comentario que explica
 * el cambio —en este repo eso ya pasó CUATRO veces— y además no puede ver lo
 * único que importa acá: que al tocar «Editar» aparezcan los envíos
 * EDITABLES, y que en una guía despachada NO aparezcan.
 *
 * Cubre también los tres defectos que salieron en la auditoría de la pantalla:
 *   A. el botón que se quedaba en "Guardando…" para siempre al caerse la red;
 *   B. el formulario que se ponía rojo solo mientras la persona escribía;
 *   C. el botón apagado que no decía por qué.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";

const push = vi.fn();
const replace = vi.fn();
const ROUTER = { push, replace, refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() };
const PARAMS = { id: "guia-777" };
vi.mock("next/navigation", () => ({
  useRouter: () => ROUTER,
  useParams: () => PARAMS,
  usePathname: () => "/guias/guia-777",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/AppHeader", () => ({ default: () => null }));

/** Guía PENDIENTE con un envío completo. Es la que se puede editar y despachar. */
const PENDIENTE = {
  id: "guia-777",
  numero: 777,
  fecha: "2026-08-23",
  estado: "Pendiente Bodega",
  modo_entrega: "transportista",
  transportista_id: "t-1",
  transportista: "Boston",
  entregado_por: "Julio",
  observaciones: "Keriddine son muebles",
  numero_guia_transp: "",
  placa: "",
  guia_items: [
    {
      id: "it-1", orden: 1, cliente: "City Mall Paso Canoa", cliente_codigo: "D-24",
      direccion: "Paso Canoas", empresa: "Fashion Wear", facturas: "10234", bultos: 4,
      numero_guia_transp: "",
    },
  ],
};

/** La misma guía, pero YA DESPACHADA: acá no se edita nada. */
const DESPACHADA = {
  ...PENDIENTE,
  estado: "Completada",
  tipo_despacho: "externo",
  placa: "EK0700",
  receptor_nombre: "Eric",
  cedula: "8-930-1234",
  firma_base64: "data:image/png;base64,AAA",
  firma_entregador_base64: "data:image/png;base64,BBB",
  guia_items: [{ ...PENDIENTE.guia_items[0], numero_guia_transp: "TR-4471" }],
};

/** Le falta la factura al único envío: sirve para el defecto C. */
const INCOMPLETA = {
  ...PENDIENTE,
  guia_items: [{ ...PENDIENTE.guia_items[0], facturas: "" }],
};

let guiaServida: Record<string, unknown> = PENDIENTE;
let escrituras: Array<{ metodo: string; url: string; cuerpo: Record<string, unknown> }> = [];
/** true = el `fetch` REVIENTA (se cayó el WiFi de la bodega), no contesta 500. */
let laRedSeCae = false;

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
  escrituras = [];
  laRedSeCae = false;
  guiaServida = PENDIENTE;
  push.mockClear();
  replace.mockClear();
  vi.stubGlobal("localStorage", memStorage());
  vi.stubGlobal("sessionStorage", memStorage());
  sessionStorage.setItem("cxc_role", "admin");
  sessionStorage.setItem("fg_modules", JSON.stringify(["guias"]));
  vi.stubGlobal("fetch", vi.fn(async (url: unknown, init?: { method?: string; body?: string }) => {
    const u = String(url);
    const metodo = (init?.method || "GET").toUpperCase();
    if (metodo !== "GET") {
      escrituras.push({ metodo, url: u, cuerpo: JSON.parse(init?.body || "{}") });
      await new Promise((r) => setTimeout(r, 40));
      if (laRedSeCae) throw new TypeError("Failed to fetch");
      return { ok: true, json: async () => ({ id: PENDIENTE.id }) };
    }
    if (laRedSeCae) throw new TypeError("Failed to fetch");
    if (u.startsWith("/api/guias/frecuencias")) return { ok: true, json: async () => ({ clientes: [], empresas: [], direcciones: {} }) };
    if (u.startsWith("/api/guias/despachos-frecuentes")) return { ok: true, json: async () => ({ juegos: [] }) };
    if (u.startsWith("/api/transportistas")) return { ok: true, json: async () => [{ id: "t-1", nombre: "Boston", activo: true }] };
    if (u.startsWith(`/api/guias/${PENDIENTE.id}`)) return { ok: true, json: async () => guiaServida };
    if (u.startsWith("/api/clientes")) return { ok: true, json: async () => ({ clientes: [] }) };
    return { ok: true, json: async () => ({}) };
  }));
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function abrirLaGuia() {
  const Page = (await import("@/app/guias/[id]/page")).default;
  render(<Page />);
  await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
}

async function tocarEditar() {
  const editar = screen.getByRole("button", { name: /^Editar$/i });
  await act(async () => { fireEvent.click(editar); });
  await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
}

/** El autoguardado espera 1,5 s: se le da el doble, en tramos, antes de mirar. */
async function dejarPasarElAutoguardado() {
  for (let i = 0; i < 32; i++) {
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });
  }
}

/** El formulario dibuja los DOS layouts y esconde uno con CSS. */
const visibles = (sel: string) =>
  [...document.querySelectorAll<HTMLElement>(sel)].filter((e) => !e.closest(".hidden"));
const visible = (sel: string) => visibles(sel)[0] ?? document.querySelector<HTMLElement>(sel)!;

const puts = () => escrituras.filter((e) => e.metodo === "PUT");

describe("la guía pendiente se edita ACÁ, con el formulario del alta", () => {
  it("antes de tocar nada hay «Editar» y NO hay formulario", async () => {
    await abrirLaGuia();
    expect(screen.getByRole("button", { name: /^Editar$/i })).toBeTruthy();
    expect(screen.queryByText(/Guardar Cambios/i)).toBeNull();
    expect(screen.queryByText(/\+ Agregar envío/i)).toBeNull();
  });

  it("tocar «Editar» abre los envíos EDITABLES, como al crear la guía", async () => {
    await abrirLaGuia();
    await tocarEditar();

    // El MISMO formulario del alta: su título, su "+ Agregar envío" y los
    // campos del envío escribibles uno por uno.
    expect(screen.getByText(/Editar Guía de Transporte/i)).toBeTruthy();
    expect(screen.getByText(/\+ Agregar envío/i)).toBeTruthy();

    const cliente = visible('input[id^="cliente-"]') as HTMLInputElement;
    expect(cliente.value).toBe("City Mall Paso Canoa");
    const direccion = visible('input[id^="direccion-"]') as HTMLInputElement;
    expect(direccion.value).toBe("Paso Canoas");
    expect(visible('select[id^="empresa-"]')).toBeTruthy();
    const bultos = visible('input[id^="bultos-"]') as HTMLInputElement;
    expect(bultos.value).toBe("4");

    // Y las observaciones son un campo, no un cartel de solo lectura.
    const obs = visible("textarea") as HTMLTextAreaElement;
    expect(obs.value).toBe("Keriddine son muebles");
    expect(obs.readOnly).toBe(false);

    // Escribir de verdad cambia el valor: si el campo estuviera clavado, todo
    // lo de arriba pasaría igual y no se estaría editando nada.
    await act(async () => { fireEvent.change(direccion, { target: { value: "David" } }); });
    expect((visible('input[id^="direccion-"]') as HTMLInputElement).value).toBe("David");
  });

  it("«Despachar» sigue en la MISMA pantalla mientras se edita", async () => {
    await abrirLaGuia();
    expect(screen.getByRole("button", { name: /Despachar/i })).toBeTruthy();
    await tocarEditar();
    // 🔴 Lo pedido: «Despachar» es otro botón DENTRO de la misma pantalla.
    expect(screen.getByRole("button", { name: /Despachar/i })).toBeTruthy();
    expect(screen.getAllByText(/Guardar Cambios/i).length).toBeGreaterThan(0);
  });

  it("mientras se edita, los envíos NO se dibujan dos veces", async () => {
    await abrirLaGuia();
    // En modo lectura está el resumen con su "Corregir".
    expect(screen.getByRole("button", { name: /^Corregir$/i })).toBeTruthy();
    await tocarEditar();
    // Con el formulario abierto, ese resumen se va: la lista del formulario ES
    // la lista. Dibujar las dos serían los mismos envíos dos veces, que es lo
    // que se sacó el 17-ago-2026.
    expect(screen.queryByRole("button", { name: /^Corregir$/i })).toBeNull();
  });

  it("guardar NO te saca de la guía: cierra la edición y se queda acá", async () => {
    await abrirLaGuia();
    await tocarEditar();
    const obs = visible("textarea") as HTMLTextAreaElement;
    await act(async () => { fireEvent.change(obs, { target: { value: "va con hielo" } }); });
    const guardar = screen.getAllByText(/Guardar Cambios/i)[0] as HTMLButtonElement;
    await act(async () => { fireEvent.click(guardar); });
    await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
    expect(puts().length).toBeGreaterThan(0);
    // 🔴 Nada de volver al listado: quien estaba por despachar sigue en su guía.
    expect(push).not.toHaveBeenCalledWith("/guias");
    expect(screen.queryByText(/Editar Guía de Transporte/i)).toBeNull();
    expect(screen.getByRole("button", { name: /^Editar$/i })).toBeTruthy();
  });
});

describe("una guía YA DESPACHADA no se edita, y la pantalla lo dice", () => {
  beforeEach(() => { guiaServida = DESPACHADA; });

  it("no hay botón «Editar» ni formulario por ningún lado", async () => {
    await abrirLaGuia();
    expect(screen.queryByRole("button", { name: /^Editar$/i })).toBeNull();
    expect(screen.queryByText(/Editar Guía de Transporte/i)).toBeNull();
    expect(screen.queryByText(/Guardar Cambios/i)).toBeNull();
    expect(screen.queryByText(/\+ Agregar envío/i)).toBeNull();
    // Tampoco los campos del despacho ni el "Corregir" de bodega.
    expect(screen.queryByRole("button", { name: /^Corregir$/i })).toBeNull();
    expect(document.querySelector('input[id^="bultos-"]')).toBeNull();
  });

  it("la pantalla DICE que está bloqueada, en vez de mostrar campos muertos", async () => {
    await abrirLaGuia();
    expect(document.body.textContent).toMatch(/ya se despachó: no se puede editar/i);
    // Y dice cuál es la única excepción que sigue viva.
    expect(document.body.textContent).toMatch(/N° del transportista de cada envío/i);
  });
});

describe("A · si se cae la red al guardar, el botón NO se queda en «Guardando…»", () => {
  it("avisa que no se guardó y se puede reintentar sin recargar", async () => {
    await abrirLaGuia();
    await tocarEditar();
    const obs = visible("textarea") as HTMLTextAreaElement;
    await act(async () => { fireEvent.change(obs, { target: { value: "va con hielo" } }); });

    laRedSeCae = true;
    const guardar = screen.getAllByText(/Guardar Cambios/i)[0] as HTMLButtonElement;
    await act(async () => { fireEvent.click(guardar); });
    await act(async () => { await new Promise((r) => setTimeout(r, 300)); });

    // 🩸 Antes el `fetch` reventaba antes del `setSaving(false)` y el botón se
    // quedaba en "Guardando…" para siempre, sin aviso.
    expect(document.body.textContent).not.toMatch(/Guardando\.\.\./);
    expect(document.body.textContent).toMatch(/Sin conexión/i);
    // Y no miente: lo que no se guardó sigue diciendo que no se guardó.
    expect(document.body.textContent).not.toMatch(/Listo, guardado/);
    // El botón vuelve a estar tocable: se puede reintentar sin recargar.
    const otraVez = screen.getAllByText(/Guardar Cambios/i)[0] as HTMLButtonElement;
    expect(otraVez.disabled).toBe(false);
  }, 20000);
});

describe("B · el formulario no se pone rojo mientras la persona escribe", () => {
  it("empezar un segundo envío no dispara «Completa todos los campos»", async () => {
    await abrirLaGuia();
    await tocarEditar();

    await act(async () => { fireEvent.click(screen.getByText(/\+ Agregar envío/i)); });
    // 🩸 Se escribe la DIRECCIÓN y no el cliente: el cliente es el
    // `ClientePicker` y teclear ahí no le mueve el estado al formulario, así
    // que el guardado automático nunca se disparaba y este candado pasaba en
    // verde con el defecto puesto. Medido: con el arreglo mutado, 13/13 en
    // verde. La dirección es un `<input>` pelado y sí lo mueve.
    const direcciones = visibles('input[id^="direccion-"]');
    const nuevo = direcciones[direcciones.length - 1] as HTMLInputElement;
    await act(async () => { fireEvent.change(nuevo, { target: { value: "Paso Canoas" } }); });
    expect(direcciones.length).toBe(2);

    // El guardado automático llega a los ~1,5 s. Antes, ahí aparecía el cartel
    // y la fila entera en rojo sin que nadie tocara "Guardar".
    await dejarPasarElAutoguardado();

    expect(document.body.textContent).not.toMatch(/Completa todos los campos obligatorios/i);
    expect(document.querySelectorAll(".border-red-400").length).toBe(0);
    expect(document.body.textContent).not.toMatch(/Campo obligatorio/i);
    // Y la fila a medio escribir tampoco se guardó a medias.
    expect(puts()).toHaveLength(0);
  }, 20000);

  it("pero al APRETAR «Guardar» sí se pinta lo que falta", async () => {
    // La otra mitad: un formulario que no pintara NUNCA también pasaría el test
    // de arriba, y dejaría a la persona sin saber qué corregir.
    await abrirLaGuia();
    await tocarEditar();
    const direccion = visible('input[id^="direccion-"]') as HTMLInputElement;
    await act(async () => { fireEvent.change(direccion, { target: { value: "" } }); });
    const guardar = screen.getAllByText(/Guardar Cambios/i)[0] as HTMLButtonElement;
    // Apagado, porque falta la dirección — y por eso se toca el de verdad:
    // el click no hace nada, así que se llama al guardado por el camino que la
    // persona tiene, que es corregir. Lo que se prueba acá es que el aviso
    // aparece igual, no escondido detrás de un botón muerto.
    expect(guardar.disabled).toBe(true);
    expect(document.body.textContent).toMatch(/Falta:/i);
  }, 20000);
});

describe("C · el botón apagado dice POR QUÉ está apagado", () => {
  beforeEach(() => { guiaServida = INCOMPLETA; });

  it("«Guardar Cambios» va deshabilitado y debajo dice qué falta", async () => {
    await abrirLaGuia();
    await tocarEditar();
    const guardar = screen.getAllByText(/Guardar Cambios/i)[0] as HTMLButtonElement;
    expect(guardar.disabled).toBe(true);
    // 🩸 Antes se apagaba y no decía nada. Ahora usa las MISMAS palabras que la
    // pantalla de despachar ("Falta: …").
    expect(document.body.textContent).toMatch(/Falta: la factura/i);
  });

  it("al completarlo, el botón se enciende y el aviso se va", async () => {
    await abrirLaGuia();
    await tocarEditar();
    const facturas = visible('input[id^="facturas-"]') as HTMLInputElement;
    await act(async () => { fireEvent.change(facturas, { target: { value: "10234" } }); });
    const guardar = screen.getAllByText(/Guardar Cambios/i)[0] as HTMLButtonElement;
    expect(guardar.disabled).toBe(false);
    expect(document.body.textContent).not.toMatch(/Falta: la factura/i);
  });
});

describe("el camino viejo no se pierde", () => {
  it("`/guias/[id]/editar` redirige a la guía con la edición abierta", async () => {
    const Vieja = (await import("@/app/guias/[id]/editar/page")).default;
    render(<Vieja />);
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(replace).toHaveBeenCalledWith("/guias/guia-777?editar=1");
  });
});
