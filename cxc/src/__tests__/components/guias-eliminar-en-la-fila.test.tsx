/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 BORRAR UNA GUÍA SIN TENER QUE ABRIRLA — el «···» vive en la FILA
 * (27-ago-2026)
 *
 * Daniel, textual: *"y darle acceso a secretaria de poder eliminar guias"*.
 *
 * 🩸 EL PERMISO YA LO TENÍA. `DELETE /api/guias/[id]` exige
 * `["admin","secretaria"]` desde siempre y `DELETE_ROLES` de `GuiasList` dice lo
 * mismo. Lo que faltaba era ENCONTRAR el botón: «Eliminar guía» era el único
 * ítem del «···» de la guía **EXPANDIDA**, al lado de «Compartir», o sea que
 * había que abrir la guía primero. Tres toques, y nadie lo hallaba.
 *
 * 🔑 LA DECISIÓN: el «···» sube a la fila; «Eliminar» NO sale como botón suelto.
 * La fila ya tiene Editar · Despachar · Imprimir · Compartir, y en un celular un
 * botón de borrar al lado de «Imprimir» es un toque equivocado esperando pasar
 * sobre un documento firmado. De 3 toques a 2, y sigue protegido por el menú y
 * por la ventana que exige escribir ELIMINAR.
 *
 * 🔴 EL CANDADO ES DE CONDUCTA, NO DE TEXTO. En este repo los barridos que
 * buscan un literal dentro de un archivo pasan ESTANDO MUTADOS: el comentario
 * que explica el cambio contiene lo que el barrido busca, y el barrido se da por
 * satisfecho con su propia explicación (ya pasó cuatro veces). Así que acá se
 * monta la PÁGINA REAL de `/guias`, se toca el «···» de una fila **CERRADA** y
 * se lee el DOM.
 *
 * 🩸 Y EL MENÚ NO PINTA SUS ÍTEMS HASTA QUE SE ABRE (`{open && …}` en
 * `ui/OverflowMenu`): mirar el DOM con el menú cerrado no probaría nada. Hay que
 * abrirlo, y los ítems salen por un PORTAL — se buscan en el documento, no en el
 * container.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, act, fireEvent, within } from "@testing-library/react";

const ROUTER = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => ROUTER,
  useParams: () => ({}),
  usePathname: () => "/guias",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/AppHeader", () => ({ default: () => null }));

// El interruptor de los atajos, controlable por test: el CONTROL de abajo
// necesita probar que con GUIAS_ATAJOS_NUEVOS apagado la lista vuelve a ser
// 100% lectura. El resto del módulo es el REAL.
let atajosEncendidos = true;
vi.mock("@/lib/guias/atajos-facturas", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/guias/atajos-facturas")>();
  return {
    ...real,
    get GUIAS_ATAJOS_NUEVOS() {
      return atajosEncendidos;
    },
  };
});

import GuiasPage from "@/app/guias/page";

/** Dos guías: la que se va a borrar y una vecina, para que "la fila correcta"
 *  sea una afirmación con contenido. Las dos PENDIENTES y las dos con renglones,
 *  como las que bodega ve todas las mañanas. */
const GUIAS = [
  {
    id: "guia-aaa", numero: 231, fecha: "2026-08-26", estado: "Pendiente Bodega",
    transportista: "Transporte Sol", modo_entrega: "transportista", transportista_id: "t-1",
    placa: "", observaciones: "", total_bultos: 8, item_count: 1, monto_total: 0,
    entregado_por: "Julio", numero_guia_transp: "TR-4471",
    guia_items: [{ id: "it-1", cliente: "City Mall Paso Canoa", cliente_codigo: "D-25", direccion: "Paso Canoas", empresa: "Fashion Wear", facturas: "10234", bultos: 8 }],
  },
  {
    id: "guia-bbb", numero: 232, fecha: "2026-08-26", estado: "Pendiente Bodega",
    transportista: "Transporte Luna", modo_entrega: "transportista", transportista_id: "t-1",
    placa: "", observaciones: "", total_bultos: 3, item_count: 1, monto_total: 0,
    entregado_por: "Julio", numero_guia_transp: "TR-9999",
    guia_items: [{ id: "it-2", cliente: "Grupo Hanna", cliente_codigo: "D-68", direccion: "Changuinola", empresa: "Active Wear", facturas: "10235", bultos: 3 }],
  },
];

interface Pedido { metodo: string; url: string }
let pedidos: Pedido[] = [];

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

function sembrarRol(rol: string) {
  sessionStorage.setItem("cxc_role", rol);
  sessionStorage.setItem("fg_modules", JSON.stringify(["guias"]));
}

beforeEach(() => {
  pedidos = [];
  atajosEncendidos = true;
  ROUTER.push.mockClear();
  vi.stubGlobal("localStorage", memStorage());
  vi.stubGlobal("sessionStorage", memStorage());
  vi.stubGlobal("fetch", vi.fn(async (url: unknown, init?: { method?: string }) => {
    const u = String(url);
    const metodo = (init?.method || "GET").toUpperCase();
    pedidos.push({ metodo, url: u });
    if (metodo === "DELETE") return { ok: true, json: async () => ({ ok: true }) };
    if (u.startsWith("/api/guias/frecuencias")) return { ok: true, json: async () => ({ clientes: [], empresas: [], direcciones: {} }) };
    if (u === "/api/guias") return { ok: true, json: async () => GUIAS };
    if (u.startsWith("/api/guias/")) return { ok: true, json: async () => GUIAS.find((g) => u.includes(g.id)) ?? GUIAS[0] };
    if (u.startsWith("/api/clientes")) return { ok: true, json: async () => ({ clientes: [] }) };
    return { ok: true, json: async () => ({}) };
  }));
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

/** Monta `/guias` con el rol pedido y deja que la lista termine de cargar. */
async function abrirLista(rol: string) {
  sembrarRol(rol);
  const vista = render(<GuiasPage />);
  await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
  return vista;
}

const doc = () => document.body;
/** Los «···» de la lista. Uno por fila; el rótulo lleva el N° de la guía. */
const menusDeFila = (c: HTMLElement) =>
  Array.from(c.querySelectorAll<HTMLElement>('[aria-haspopup="menu"]'));
const menuDe = (c: HTMLElement, gt: string) =>
  menusDeFila(c).find((b) => (b.getAttribute("aria-label") || "").includes(gt));
/** Los ítems del menú abierto — salen por un portal, van en el documento. */
const itemsAbiertos = () =>
  Array.from(document.querySelectorAll('[role="menuitem"]')).map((e) => (e.textContent || "").trim());

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 el «···» está en la fila CERRADA — no hay que abrir la guía", () => {
  it("secretaria: toca el «···» de una fila cerrada y aparece «Eliminar guía»", async () => {
    const { container } = await abrirLista("secretaria");

    // La guía NUNCA se abrió: nadie pidió su detalle.
    expect(pedidos.some((p) => p.url === "/api/guias/guia-aaa")).toBe(false);
    expect(container.textContent).toContain("GT-231");

    const trigger = menuDe(container, "GT-231");
    expect(trigger, "no hay «···» en la fila de GT-231").toBeTruthy();

    // TOQUE 1 — el menú. Con el menú cerrado no hay ítems: si los hubiera, el
    // candado estaría leyendo un menú que nadie abrió.
    expect(itemsAbiertos()).toHaveLength(0);
    // ⚠️ CAMBIO DE DIRECCIÓN (5-sep-2026, «el panel de guías»). Daniel:
    // *«"Editar" y "Eliminar guía" pasan al "···"»* — el menú tenía UNA sola
    // opción y además solo lo veía quien puede borrar, así que bodega no tenía
    // menú ninguno. Lo que este archivo protege NO cambió: borrar sigue
    // costando DOS toques desde la fila cerrada, sigue detrás del menú y sigue
    // pidiendo escribir ELIMINAR. Lo que cambió es que el menú ahora lleva
    // también «Editar».
    fireEvent.click(trigger!);
    expect(itemsAbiertos()).toEqual(["Editar", "Eliminar guía"]);

    // Y la guía SIGUE sin abrirse: el menú no dispara la carga del acordeón.
    expect(pedidos.some((p) => p.url === "/api/guias/guia-aaa")).toBe(false);
  });

  it("🔴 tocar «Eliminar guía» PIDE CONFIRMACIÓN y no borra nada todavía", async () => {
    const { container } = await abrirLista("secretaria");
    fireEvent.click(menuDe(container, "GT-231")!);
    // TOQUE 2 — el ítem.
    const item = Array.from(document.querySelectorAll('[role="menuitem"]'))
      .find((e) => /Eliminar guía/.test(e.textContent || ""));
    fireEvent.click(item!);

    // La ventana de confirmación, con lo que de verdad frena: hay que escribir
    // ELIMINAR y se avisa que no se puede deshacer.
    const texto = doc().textContent || "";
    expect(texto).toContain("Eliminar guía GT-231");
    expect(texto).toContain("Esta acción no se puede deshacer");
    expect(doc().querySelector('input[placeholder="Escribe ELIMINAR para confirmar"]')).toBeTruthy();

    // 🔴 Y NADA salió al servidor: el menú abre la ventana, no borra.
    expect(pedidos.filter((p) => p.metodo === "DELETE")).toHaveLength(0);
  });

  it("🔴 borra la guía de ESA fila, no la de al lado", async () => {
    const { container } = await abrirLista("secretaria");
    fireEvent.click(menuDe(container, "GT-232")!);
    fireEvent.click(Array.from(document.querySelectorAll('[role="menuitem"]'))
      .find((e) => /Eliminar guía/.test(e.textContent || ""))!);

    expect(doc().textContent).toContain("Eliminar guía GT-232");
    const input = doc().querySelector<HTMLInputElement>('input[placeholder="Escribe ELIMINAR para confirmar"]')!;
    // El botón nace apagado: sin la palabra no se puede confirmar.
    const confirmar = Array.from(doc().querySelectorAll("button"))
      .find((b) => (b.textContent || "").trim() === "Eliminar") as HTMLButtonElement;
    expect(confirmar.disabled).toBe(true);

    fireEvent.change(input, { target: { value: "ELIMINAR" } });
    await act(async () => { fireEvent.click(confirmar); await new Promise((r) => setTimeout(r, 20)); });

    const borrados = pedidos.filter((p) => p.metodo === "DELETE");
    expect(borrados).toHaveLength(1);
    expect(borrados[0].url).toBe("/api/guias/guia-bbb");
  });

  it("cada fila tiene su propio «···» y el rótulo dice de cuál guía es", async () => {
    const { container } = await abrirLista("secretaria");
    const rotulos = menusDeFila(container).map((b) => b.getAttribute("aria-label"));
    expect(rotulos).toHaveLength(2);
    expect(rotulos.some((r) => (r || "").includes("GT-231"))).toBe(true);
    expect(rotulos.some((r) => (r || "").includes("GT-232"))).toBe(true);
  });

  it("en modo SELECCIÓN el «···» se va: ahí manda la barra de acciones", async () => {
    // Seleccionar es para imprimir o exportar VARIAS. Un menú por fila ahí
    // adentro no es un atajo: es 44 px menos de ancho en cada fila para algo
    // que ese modo no hace.
    const { container } = await abrirLista("secretaria");
    expect(menusDeFila(container)).toHaveLength(2);
    const seleccionar = Array.from(container.querySelectorAll("button"))
      .find((b) => (b.textContent || "").trim() === "Seleccionar")!;
    fireEvent.click(seleccionar);
    expect(menusDeFila(container)).toHaveLength(0);
    // Y vuelve al cancelar: no se pierde el camino.
    fireEvent.click(Array.from(container.querySelectorAll("button"))
      .find((b) => (b.textContent || "").trim() === "Cancelar")!);
    expect(menusDeFila(container)).toHaveLength(2);
  });

  it("🩸 el «···» NO va anidado dentro del botón de la fila", async () => {
    // Un `<button>` dentro de otro es HTML inválido y, peor, el toque
    // abriría/cerraría el acordeón además del menú: el «···» dejaría de ser un
    // atajo y sería un toque más.
    // 🩸 `closest()` ARRANCA EN EL PROPIO ELEMENTO, así que `trigger.closest("button")`
    // devuelve el trigger SIEMPRE — con el menú anidado y sin él. La mutación
    // sobrevivía. Hay que preguntarle a los PADRES.
    const { container } = await abrirLista("secretaria");
    const trigger = menuDe(container, "GT-231")!;
    expect(trigger.parentElement?.closest("button")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 quien no puede borrar NUNCA ve «Eliminar guía»", () => {
  // ⚠️ CAMBIO DE DIRECCIÓN (5-sep-2026, «el panel de guías»). Antes este bloque
  // exigía que bodega y vendedor no vieran NINGÚN «···», porque el menú tenía un
  // solo ítem y era el destructivo. Desde que «Editar» se mudó al menú, bodega
  // —que sí puede editar— tiene menú. Lo que se protege es lo mismo y más
  // preciso: el permiso, no el dibujo. **«Eliminar guía» no le aparece a nadie
  // que no pueda borrar**, tenga menú o no.
  it("bodega tiene menú porque puede EDITAR, pero ahí no está «Eliminar guía»", async () => {
    const { container } = await abrirLista("bodega");
    expect(container.textContent).toContain("GT-231");
    const trigger = menuDe(container, "GT-231");
    expect(trigger, "bodega perdió el «···» y con él «Editar»").toBeTruthy();
    fireEvent.click(trigger!);
    expect(itemsAbiertos()).toEqual(["Editar"]);
    expect(doc().textContent || "").not.toContain("Eliminar guía");
  });

  it("vendedor: la lista NO dibuja ningún «···» — no edita ni borra", async () => {
    const { container } = await abrirLista("vendedor");
    expect(container.textContent).toContain("GT-231");
    expect(menusDeFila(container)).toHaveLength(0);
    expect(doc().textContent || "").not.toContain("Eliminar guía");
  });

  it("admin también lo tiene (el conjunto de siempre: admin + secretaria)", async () => {
    const { container } = await abrirLista("admin");
    expect(menusDeFila(container)).toHaveLength(2);
  });

  it("🔴 en modo SOLO LECTURA no aparece, ni siendo admin", async () => {
    // `fg_guias_readonly` apaga TODA escritura de la pantalla. Un «···» que
    // ofrece borrar sobre una lista de solo lectura es la peor contradicción
    // posible: promete algo que el servidor va a rechazar.
    sembrarRol("admin");
    sessionStorage.setItem("fg_guias_readonly", "1");
    const { container } = render(<GuiasPage />);
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(container.textContent).toContain("GT-231");
    expect(menusDeFila(container)).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("⚠️ lo que NO se tocó", () => {
  /**
   * 🔁 ESTE CANDADO CAMBIÓ DE DIRECCIÓN EL 4-sep-2026, y no se aflojó.
   *
   * Antes exigía que abrir la lista fuera 100% lectura, sin excepción. Su
   * intención real siempre fue la invariante del módulo — LA LISTA NO DESPACHA
   * NI EDITA GUÍAS: **la lista solo LEE, nunca escribe** una guía
   * (docs/postmortems/guias.md) — no «la lista nunca habla con Switch».
   * Daniel, textual: *«¿por qué no se puede hacer al apretar guías? Prefiero
   * eso.»* — el refresco de las facturas de HOY (`/api/guias/facturas-hoy`,
   * que solo dispara una lectura corta de Switch y no toca una sola guía)
   * ahora se dispara al tocar Guías.
   *
   * Es la MISMA regla, no una excepción cómoda: lo que se prohíbe es ESCRIBIR
   * SOBRE GUÍAS. Por eso acá se exige (a) que la ÚNICA salida que no es
   * lectura sea EXACTAMENTE ese refresco — cualquier otra que alguien cuele
   * mañana pone esto en rojo —, (b) que ninguna escritura (PUT/PATCH/DELETE)
   * salga a ningún lado, y (c) que a `/api/guias/**` no le llegue nada que no
   * sea lectura, salvo el refresco. Y quien no puede crear guías (vendedor),
   * el modo solo lectura y el interruptor apagado siguen en 100% lectura.
   */
  it("🔁 la lista solo LEE, nunca escribe una guía: lo único que sale además de lecturas es el refresco de facturas de hoy", async () => {
    await abrirLista("secretaria");
    const noGet = pedidos.filter((p) => p.metodo !== "GET");
    // EXACTAMENTE el refresco, y nada más — cualquier otra salida mañana = rojo.
    expect(noGet.map((p) => `${p.metodo} ${p.url}`)).toEqual(["POST /api/guias/facturas-hoy"]);
    // Ni una escritura de verdad, a ningún lado.
    expect(pedidos.filter((p) => ["PUT", "PATCH", "DELETE"].includes(p.metodo))).toHaveLength(0);
    // Y sobre /api/guias/** no entra nada que no sea lectura, salvo el refresco.
    expect(
      pedidos.filter((p) => p.metodo !== "GET" && p.url.startsWith("/api/guias") && p.url !== "/api/guias/facturas-hoy"),
    ).toHaveLength(0);
  });

  it("🔁 el refresco NO dispara para quien no puede crear guías (vendedor): su lista es 100% lectura", async () => {
    await abrirLista("vendedor");
    expect(pedidos.filter((p) => p.metodo !== "GET")).toHaveLength(0);
  });

  it("🔁 en modo solo lectura no dispara, ni siendo admin", async () => {
    sembrarRol("admin");
    sessionStorage.setItem("fg_guias_readonly", "1");
    render(<GuiasPage />);
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(pedidos.filter((p) => p.metodo !== "GET")).toHaveLength(0);
  });

  it("🔁 CONTROL — con GUIAS_ATAJOS_NUEVOS apagado la lista vuelve a ser 100% lectura", async () => {
    atajosEncendidos = false;
    await abrirLista("secretaria");
    expect(pedidos.filter((p) => p.metodo !== "GET")).toHaveLength(0);
  });

  it("🔴 los cuatro siguen alcanzables SIN abrir la guía — se mudaron a la FILA", async () => {
    // ⚠️ CAMBIO DE DIRECCIÓN (5-sep-2026, «el panel de guías»). Este caso exigía
    // los cuatro rótulos DENTRO del acordeón. Daniel los sacó de ahí: *«
    // "Compartir" e "Imprimir" en la tarjeta, sin desplegarla»* y *«"Editar" y
    // "Eliminar guía" pasan al "···"»*. Lo que se protege es lo mismo —que
    // ninguno se pierda— pero contra la fila CERRADA, que es el camino nuevo.
    const { container } = await abrirLista("admin");
    const nombres = Array.from(container.querySelectorAll("button"))
      .map((b) => (b.getAttribute("aria-label") || b.textContent || "").trim());
    expect(nombres.some((n) => /^Imprimir la guía GT-231$/.test(n)), "se perdió «Imprimir»").toBe(true);
    expect(nombres.some((n) => /^Compartir la guía GT-231$/.test(n)), "se perdió «Compartir»").toBe(true);
    // «Despachar» está en la fila de la guía PENDIENTE (GT-232 en este fixture).
    expect(nombres, "se perdió «Despachar»").toContain("Despachar");
    // «Editar» vive en el «···», que no pinta sus ítems hasta abrirse.
    fireEvent.click(menuDe(container, "GT-231")!);
    expect(itemsAbiertos(), "se perdió «Editar»").toContain("Editar");
  });

  it("🔑 con la guía ABIERTA el «···» sigue a la vista — no se perdió una puerta", async () => {
    // Se MOVIÓ, no se duplicó: adentro ya no hay un segundo «···», pero la fila
    // no desaparece al abrirse, así que el menú sigue en la misma pantalla.
    const { container } = await abrirLista("admin");
    const fila = Array.from(container.querySelectorAll("button"))
      .find((b) => /GT-231/.test(b.textContent || ""))!;
    await act(async () => { fireEvent.click(fila); await new Promise((r) => setTimeout(r, 30)); });
    expect(menusDeFila(container)).toHaveLength(2);
    fireEvent.click(menuDe(container, "GT-231")!);
    expect(itemsAbiertos()).toEqual(["Editar", "Eliminar guía"]);
  });

  it("«Eliminar guía» se ofrece UNA sola vez con la guía abierta", async () => {
    // Dos menús con el mismo ítem serían dos caminos para lo mismo en la misma
    // pantalla, que es justo lo que este módulo viene podando.
    const { container } = await abrirLista("admin");
    const fila = Array.from(container.querySelectorAll("button"))
      .find((b) => /GT-231/.test(b.textContent || ""))!;
    await act(async () => { fireEvent.click(fila); await new Promise((r) => setTimeout(r, 30)); });
    for (const t of menusDeFila(container)) fireEvent.click(t);
    expect(itemsAbiertos().filter((t) => t === "Eliminar guía")).toHaveLength(2); // uno por FILA
    const dentroDelAcordeon = within(container).queryAllByText("Eliminar guía");
    expect(dentroDelAcordeon, "volvió el «···» adentro de la guía").toHaveLength(0);
  });
});
