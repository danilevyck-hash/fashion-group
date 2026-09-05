// ─────────────────────────────────────────────────────────────────────────────
// RECORDATORIOS EN PANTALLA — candado de CONDUCTA.
//
// 🔴 Acá NO se busca texto en un archivo: se MONTA la pantalla real
// (`RecordatoriosClient`, la misma que ve Daniel), se leen los nodos y se TOCAN
// los botones. Que el .tsx contenga la palabra "Recordatorios" no prueba que se
// dibuje uno, y este repo ya pagó CUATRO veces el barrido que se cumple con su
// propio comentario.
//
// ── 🩸 ESTE ARCHIVO CAMBIÓ DE DIRECCIÓN EL 5-SEP-2026 ────────────────────────
//
// LO QUE MEDÍA ANTES: que el recordatorio tuviera SU PROPIA PESTAÑA, que la
// pestaña «Pendientes» contara solo cheques, que el botón «+ Recordatorio»
// abriera una ventana de cuatro campos y que el Excel siguiera ahí.
//
// POR QUÉ YA NO: **las ocho pestañas se fueron.** Cuatro de ellas —vencido,
// vencen hoy, vencen mañana, vencen esta semana— nunca fueron estados sino
// CUÁNDO, y ahora son grupos de UNA sola lista donde cheques y recordatorios
// conviven. El «+ Recordatorio» se volvió un renglón siempre visible, y el Excel
// se retiró (Daniel: «se va»).
//
// LO QUE MIDE AHORA, en orden de lo que costaría más si se rompe:
//   1. Los 19 cheques SE SIGUEN VIENDO, agrupados por cuándo.
//   2. Lo depositado NO está en la lista pero SÍ aparece al buscarlo.
//   3. No hay ningún total sumado en pantalla.
//   4. El renglón de escribir guarda lo que la persona puso, y nada solo.
//   5. «Hoy» no se puede elegir, y se dice por qué.
//   6. «A quién» solo lo ve un admin.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act, within } from "@testing-library/react";
import RecordatoriosClient, { type Cheque } from "@/app/recordatorios/RecordatoriosClient";
import { ContextMenuProvider } from "@/components/ui";
import type { Recordatorio } from "@/lib/recordatorios/recordatorio";

vi.mock("next/navigation", () => ({
  usePathname: () => "/recordatorios",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/lib/hooks/useAuth", () => ({
  useAuth: () => ({ authChecked: true, role: "admin", isOwner: true }),
}));

vi.mock("@/lib/OnlineContext", () => ({
  useOnline: () => true,
  useOnlineContext: () => ({ online: true }),
  OnlineProvider: ({ children }: { children: React.ReactNode }) => children,
}));

/** `localStorage`/`sessionStorage` del arnés son objetos pelados: sin métodos
 *  de verdad, el borrador y el scroll persistido revientan. */
function almacenFalso(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
    removeItem: (k: string) => { m.delete(k); },
    clear: () => { m.clear(); },
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  } as Storage;
}

/** Todo lo que salió por `fetch`, para poder afirmar que NADA se guarda solo. */
let salidas: Array<{ url: string; metodo: string; cuerpo: unknown }> = [];

// 🔴 HOY entra por PROP, del servidor y en fecha de Panamá — la pantalla ya no
// le pregunta la hora al navegador. Aun así el reloj va clavado: los modales y
// el borrador miran timers.
const HOY = "2026-08-24"; // un lunes
const RELOJ = new Date("2026-08-24T15:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(RELOJ);
  vi.stubGlobal("localStorage", almacenFalso());
  vi.stubGlobal("sessionStorage", almacenFalso());
  salidas = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    salidas.push({
      url: String(url),
      metodo: (init?.method ?? "GET").toUpperCase(),
      cuerpo: init?.body ? JSON.parse(String(init.body)) : null,
    });
    if (String(url).includes("/api/recordatorios")) {
      return { ok: true, json: async () => ({ recordatorios: [], faltaMigracion: false }) };
    }
    if (String(url).includes("/frecuencias")) return { ok: true, json: async () => ({ clientes: [] }) };
    if (String(url).includes("/vendedores")) return { ok: true, json: async () => ({ vendedores: ["Rey"], fuente: "db" }) };
    return { ok: true, json: async () => [] };
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// Un cheque REAL de producción (Jerusalem de Panamá es el único cliente con
// cheques: 19 filas al 5-sep-2026).
const CHEQUE: Cheque = {
  id: "c1",
  cliente: "JERUSALEM DE PANAMA",
  empresa: "vistana",
  banco: "",
  numero_cheque: "246001",
  monto: 1000,
  fecha_deposito: HOY,
  notas: "",
  vendedor: "Rey",
  estado: "pendiente",
  fecha_depositado: null,
  created_at: "2026-08-01T00:00:00.000Z",
};

const REC: Recordatorio = {
  id: "r1",
  fecha: "2026-08-25",
  texto: "Recordar cobrar",
  cliente: "",
  clienteCodigo: null,
  repeticion: "una_vez",
  hasta: null,
  destino: "equipo",
  creadoPor: "Daniel",
  createdAt: "2026-08-24T14:00:00.000Z",
};

function pintar(over: {
  cheques?: Cheque[];
  recordatorios?: Recordatorio[];
  puedeElegirDestino?: boolean;
} = {}) {
  // La pantalla real usa el menú de clic derecho de la app: sin su proveedor,
  // `useContextMenu` revienta. Se monta el REAL, no un doble.
  return render(
    <ContextMenuProvider>
      <RecordatoriosClient
        initialData={{
          cheques: over.cheques ?? [CHEQUE],
          recordatorios: over.recordatorios ?? [],
          faltaMigracionRecordatorios: false,
          hoy: HOY,
          puedeElegirDestino: over.puedeElegirDestino ?? true,
        }}
      />
    </ContextMenuProvider>,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 LOS CHEQUES NO SE PERDIERON — el rediseño no se llevó nada", () => {
  it("el cheque se sigue viendo, con su cliente y su monto", () => {
    pintar();
    expect(screen.getAllByText("JERUSALEM DE PANAMA").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$1,000.00").length).toBeGreaterThan(0);
  });

  it("los botones que quedan siguen ahí: Nuevo Cheque, Lista y Calendario", () => {
    pintar();
    expect(screen.getByRole("button", { name: /Nuevo Cheque/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Lista$/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Calendario$/ })).toBeTruthy();
  });

  it("la pantalla se llama Recordatorios y conserva UN solo encabezado", () => {
    const { container } = pintar();
    const h1 = container.querySelectorAll("h1");
    expect(h1).toHaveLength(1);
    expect(h1[0].textContent).toBe("Recordatorios");
    expect(h1[0].className).toContain("sr-only");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 UNA SOLA LISTA — ninguna pestaña, agrupada por CUÁNDO", () => {
  it("no queda ni una pestaña de las ocho", () => {
    pintar({ recordatorios: [REC] });
    for (const viejo of [
      /^Pendientes/, /^Depositados/, /^Vencidos/, /^Rebotados/, /^Recordatorios\s/,
    ]) {
      expect(screen.queryByRole("button", { name: viejo }), String(viejo)).toBeNull();
    }
  });

  it("un cheque vencido cae en el grupo «Vencido», arriba", () => {
    const { container } = pintar({
      cheques: [{ ...CHEQUE, fecha_deposito: "2026-08-20" }],
    });
    const grupos = [...container.querySelectorAll("[data-agenda-grupo]")].map((n) =>
      n.getAttribute("data-agenda-grupo"),
    );
    expect(grupos[0]).toBe("vencido");
    expect(screen.getByText("Vencido")).toBeTruthy();
  });

  it("cheques y recordatorios conviven en la MISMA lista", () => {
    const { container } = pintar({ recordatorios: [{ ...REC, fecha: HOY }] });
    const lista = container.querySelector('[data-agenda="lista"]') as HTMLElement;
    expect(lista, "no se dibujó la lista única").toBeTruthy();
    expect(lista.querySelector('[data-cheque-fila="c1"]'), "falta el cheque").toBeTruthy();
    expect(lista.querySelector('[data-recordatorio-fila="r1"]'), "falta el recordatorio").toBeTruthy();
  });

  it("🔴 un recordatorio que se REPITE va en «Se repiten», en UNA sola fila", () => {
    const { container } = pintar({
      recordatorios: [{ ...REC, repeticion: "cada_dia", fecha: "2026-08-01" }],
    });
    const grupo = container.querySelector('[data-agenda-grupo="se_repiten"]') as HTMLElement;
    expect(grupo, "no se dibujó el grupo «Se repiten»").toBeTruthy();
    // UNA fila, no una por día: con «Cada día» sin fin, una por ocurrencia
    // sería una lista infinita.
    expect(grupo.querySelectorAll('[data-recordatorio-fila="r1"]')).toHaveLength(1);
    expect(grupo.textContent).toContain("Cada día");
  });

  it("y dice hasta cuándo cuando tiene fin", () => {
    const { container } = pintar({
      recordatorios: [{ ...REC, repeticion: "semanal", fecha: "2026-08-01", hasta: "2026-12-31" }],
    });
    const fila = container.querySelector('[data-recordatorio-fila="r1"]') as HTMLElement;
    expect(fila.textContent).toContain("Cada semana");
    expect(fila.textContent).toContain("hasta el");
  });

  it("🔴 un cheque REBOTADO se queda en la lista, con su marca", () => {
    const { container } = pintar({
      cheques: [{ ...CHEQUE, estado: "rebotado", motivo_rebote: "Fondos insuficientes" }],
    });
    const fila = container.querySelector('[data-cheque-fila="c1"]') as HTMLElement;
    expect(fila, "el rebotado desapareció de la lista").toBeTruthy();
    expect(fila.textContent).toContain("Este cheque rebotó");
    expect(fila.textContent).toContain("Fondos insuficientes");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 LO DEPOSITADO: fuera de la lista, dentro del buscador", () => {
  const DEPOSITADO: Cheque = {
    ...CHEQUE,
    id: "c2",
    numero_cheque: "246002",
    estado: "depositado",
    fecha_depositado: "2026-08-20",
  };

  it("no aparece en la lista", () => {
    const { container } = pintar({ cheques: [DEPOSITADO] });
    expect(container.querySelector('[data-cheque-fila="c2"]')).toBeNull();
  });

  it("🔴 pero SÍ aparece al buscarlo por número de cheque", () => {
    const { container } = pintar({ cheques: [DEPOSITADO] });
    fireEvent.change(screen.getByPlaceholderText(/Buscar cheque o cliente/), { target: { value: "246002" } });
    expect(container.querySelector('[data-agenda="busqueda"]')).toBeTruthy();
    expect(container.querySelector('[data-cheque-fila="c2"]'), "el buscador no lo encontró").toBeTruthy();
  });

  it("y por cliente", () => {
    const { container } = pintar({ cheques: [DEPOSITADO] });
    fireEvent.change(screen.getByPlaceholderText(/Buscar cheque o cliente/), { target: { value: "jerusalem" } });
    expect(container.querySelector('[data-cheque-fila="c2"]')).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 NINGÚN TOTAL SUMADO — Daniel lo eligió así", () => {
  it("con dos cheques abiertos, el total ($3,000.00) NO se muestra en ninguna parte", () => {
    const { container } = pintar({
      cheques: [CHEQUE, { ...CHEQUE, id: "c3", numero_cheque: "246003", monto: 2000 }],
    });
    // Los montos POR FILA sí están.
    expect(container.textContent).toContain("$1,000.00");
    expect(container.textContent).toContain("$2,000.00");
    // La suma NO.
    expect(container.textContent).not.toContain("$3,000.00");
  });

  it("y no queda ninguna casilla de resumen arriba", () => {
    const { container } = pintar();
    for (const rotulo of ["Total a cobrar", "Vencen esta semana", "Depositados"]) {
      expect(container.textContent, rotulo).not.toContain(rotulo);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 EL RENGLÓN DE ESCRIBIR — una línea, siempre visible", () => {
  it("está a la vista sin abrir nada", () => {
    const { container } = pintar();
    expect(container.querySelector("[data-linea-nueva]")).toBeTruthy();
    expect(screen.getByLabelText("¿Qué te recuerdo?")).toBeTruthy();
  });

  it("🔴 «Hoy» NO es una opción — el aviso sale a las 9:00 y ya pasó", () => {
    pintar();
    const grupo = screen.getByRole("group", { name: "Cuándo" });
    const opciones = within(grupo).getAllByRole("button").map((b) => b.textContent);
    expect(opciones).toEqual([
      "Mañana", "Lunes", "Elegir fecha", "Cada día", "Cada semana", "Cada mes",
    ]);
    expect(opciones).not.toContain("Hoy");
  });

  it("🔴 no hay ningún selector de HORA", () => {
    const { container } = pintar();
    expect(container.querySelector('input[type="time"]')).toBeNull();
  });

  it("escribir y guardar manda MAÑANA por defecto, y nada más", async () => {
    pintar();
    fireEvent.change(screen.getByLabelText("¿Qué te recuerdo?"), {
      target: { value: "Llamar al banco" },
    });
    salidas.length = 0;
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Guardar$/ }));
      await Promise.resolve();
    });
    const post = salidas.find((s) => s.metodo === "POST");
    expect(post, "no salió ningún POST").toBeTruthy();
    expect(post!.url).toContain("/api/recordatorios");
    expect(post!.cuerpo).toMatchObject({
      texto: "Llamar al banco",
      fecha: "2026-08-25", // mañana: HOY es el 24
      repeticion: "una_vez",
      hasta: null,
      destino: "equipo",
    });
  });

  it("«Lunes» es el PRÓXIMO lunes, nunca hoy (hoy ES lunes en el fixture)", async () => {
    pintar();
    fireEvent.change(screen.getByLabelText("¿Qué te recuerdo?"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Lunes" }));
    salidas.length = 0;
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Guardar$/ }));
      await Promise.resolve();
    });
    expect((salidas.find((s) => s.metodo === "POST")!.cuerpo as { fecha: string }).fecha).toBe(
      "2026-08-31",
    );
  });

  it("«Cada semana» abre el «Hasta…», y viaja cuando se llena", async () => {
    pintar();
    fireEvent.change(screen.getByLabelText("¿Qué te recuerdo?"), { target: { value: "x" } });
    expect(screen.queryByLabelText("Hasta")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cada semana" }));
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2026-12-31" } });
    salidas.length = 0;
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Guardar$/ }));
      await Promise.resolve();
    });
    expect(salidas.find((s) => s.metodo === "POST")!.cuerpo).toMatchObject({
      repeticion: "semanal",
      hasta: "2026-12-31",
    });
  });

  it("🔴 elegir un día que ya pasó APAGA el botón y dice POR QUÉ", () => {
    pintar();
    fireEvent.change(screen.getByLabelText("¿Qué te recuerdo?"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Elegir fecha" }));
    fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: "2026-08-20" } });

    const guardar = screen.getByRole("button", { name: /^Guardar$/ }) as HTMLButtonElement;
    expect(guardar.disabled).toBe(true);
    // Y se dice la razón, no un "falta la fecha" que no explica nada.
    expect(screen.getByText(/9:00 de la mañana/)).toBeTruthy();
  });

  it("sin texto no se puede guardar y NO se avisa de nada todavía", () => {
    const { container } = pintar();
    expect((screen.getByRole("button", { name: /^Guardar$/ }) as HTMLButtonElement).disabled).toBe(true);
    // Regañar antes de que la persona escriba una letra es ruido.
    expect(container.querySelector("[data-linea-nueva-falta]")).toBeNull();
  });

  it("escribir NO guarda solo: hasta tocar Guardar no sale ninguna escritura", async () => {
    pintar();
    salidas.length = 0;
    fireEvent.change(screen.getByLabelText("¿Qué te recuerdo?"), { target: { value: "algo" } });
    fireEvent.click(screen.getByRole("button", { name: "Cada mes" }));
    await act(async () => { await Promise.resolve(); });
    expect(salidas.filter((s) => s.metodo !== "GET")).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 «A QUIÉN» — solo lo ven los admin", () => {
  it("un admin ve las dos opciones", () => {
    pintar({ puedeElegirDestino: true });
    const grupo = screen.getByRole("group", { name: "A quién" });
    expect(within(grupo).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Al equipo", "Solo a mí",
    ]);
  });

  it("una secretaria NO ve el control (lo suyo va siempre al equipo)", () => {
    pintar({ puedeElegirDestino: false });
    expect(screen.queryByRole("group", { name: "A quién" })).toBeNull();
    expect(screen.queryByText("Solo a mí")).toBeNull();
  });

  it("marcar «Solo a mí» viaja en el POST", async () => {
    pintar({ puedeElegirDestino: true });
    fireEvent.change(screen.getByLabelText("¿Qué te recuerdo?"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Solo a mí" }));
    salidas.length = 0;
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Guardar$/ }));
      await Promise.resolve();
    });
    expect(salidas.find((s) => s.metodo === "POST")!.cuerpo).toMatchObject({ destino: "privado" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 EL CLIENTE es opcional y NO se muestra por defecto", () => {
  it("arranca escondido y se abre con un toque", () => {
    pintar();
    expect(screen.queryByPlaceholderText(/Buscar cliente/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "+ Cliente" }));
    expect(screen.getByPlaceholderText(/Buscar cliente/)).toBeTruthy();
  });

  it("sin abrirlo, el POST manda cliente vacío (no null a medias, no basura)", async () => {
    pintar();
    fireEvent.change(screen.getByLabelText("¿Qué te recuerdo?"), { target: { value: "x" } });
    salidas.length = 0;
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Guardar$/ }));
      await Promise.resolve();
    });
    expect(salidas.find((s) => s.metodo === "POST")!.cuerpo).toMatchObject({
      cliente: "",
      cliente_codigo: null,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("editar y borrar un recordatorio siguen existiendo", () => {
  it("tocar la fila abre EDITAR con sus datos, y NO escribe nada", async () => {
    const { container } = pintar({
      recordatorios: [{ ...REC, texto: "Pagar el alquiler", repeticion: "mensual", fecha: "2026-08-25" }],
    });
    salidas.length = 0;
    fireEvent.click(container.querySelector('[data-recordatorio-fila="r1"]') as HTMLElement);
    await act(async () => { await Promise.resolve(); });

    const dialogo = screen.getByRole("dialog", { name: /Editar recordatorio/ });
    expect(
      (within(dialogo).getByLabelText("Qué hay que recordar") as HTMLTextAreaElement).value,
    ).toBe("Pagar el alquiler");
    expect(
      within(dialogo).getByRole("button", { name: /Cada mes/ }).getAttribute("aria-pressed"),
    ).toBe("true");
    // Abrir a editar NO escribe: es el bug que Guías ya pagó (#570).
    expect(salidas.filter((s) => s.metodo !== "GET")).toEqual([]);
  });

  it("🔴 editar un recordatorio VIEJO que se repite no exige mover la fecha", async () => {
    const { container } = pintar({
      recordatorios: [{ ...REC, repeticion: "semanal", fecha: "2026-06-01" }],
    });
    fireEvent.click(container.querySelector('[data-recordatorio-fila="r1"]') as HTMLElement);
    await act(async () => { await Promise.resolve(); });
    const dialogo = screen.getByRole("dialog", { name: /Editar recordatorio/ });
    // Su fecha de arranque es de junio (pasada) y el botón tiene que estar
    // ENCENDIDO: si no, un semanal viejo no se podría corregir nunca.
    expect(
      (within(dialogo).getByRole("button", { name: /Guardar recordatorio/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it("🔴 eliminar pide confirmación — un toque no borra", async () => {
    const { container } = pintar({ recordatorios: [REC] });
    fireEvent.click(container.querySelector('[data-recordatorio-fila="r1"]') as HTMLElement);
    await act(async () => { await Promise.resolve(); });

    salidas.length = 0;
    fireEvent.click(screen.getByRole("button", { name: /^Eliminar$/ }));
    await act(async () => { await Promise.resolve(); });
    expect(salidas.filter((s) => s.metodo === "DELETE")).toEqual([]);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Sí, eliminar/ }));
      await Promise.resolve();
    });
    expect(salidas.some((s) => s.metodo === "DELETE" && s.url.includes("/api/recordatorios/r1"))).toBe(true);
  });

  it("🔴 y NO existe ningún «marcar como hecho»", () => {
    const { container } = pintar({ recordatorios: [REC] });
    for (const palabra of ["Hecho", "Completado", "Ya lo hice", "Marcar como hecho"]) {
      expect(container.textContent, palabra).not.toContain(palabra);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("el CALENDARIO sigue siendo un MODO, no una pestaña", () => {
  // 🔑 El calendario tiene DOS layouts (grilla de escritorio y lista de celular)
  // y en jsdom NO hay Tailwind, así que los dos se montan a la vez: mirar «¿hay
  // alguna píldora?» deja que uno de los dos se caiga sin que nada se ponga
  // rojo — pasó, y la mutación sobrevivió. Se busca por `data-vista`, que es
  // fijo, y NO por la clase del breakpoint, que se mueve.
  for (const vista of ["calendario-grid", "calendario-lista"]) {
    it(`el recordatorio aparece en el calendario (${vista})`, () => {
      const { container } = pintar({ recordatorios: [{ ...REC, fecha: HOY }] });
      fireEvent.click(screen.getByRole("button", { name: /^Calendario$/ }));
      const layout = container.querySelector(`[data-vista="${vista}"]`);
      expect(layout, `no se encontró el layout ${vista}`).toBeTruthy();
      const pills = (layout as HTMLElement).querySelectorAll('[data-recordatorio-pill="r1"]');
      expect(pills.length, `el recordatorio no se dibujó en ${vista}`).toBeGreaterThan(0);
      expect((pills[0] as HTMLElement).textContent).toContain("Recordar cobrar");
    });
  }

  it("y los cheques también (no los reemplazó)", () => {
    pintar({ recordatorios: [{ ...REC, fecha: HOY }] });
    fireEvent.click(screen.getByRole("button", { name: /^Calendario$/ }));
    expect(screen.getAllByText("JERUSALEM DE PANAMA").length).toBeGreaterThan(0);
  });

  it("🔴 el calendario tampoco muestra un total del mes", () => {
    const { container } = pintar({
      cheques: [CHEQUE, { ...CHEQUE, id: "c3", numero_cheque: "246003", monto: 2000 }],
    });
    fireEvent.click(screen.getByRole("button", { name: /^Calendario$/ }));
    expect(container.textContent).toContain("2 cheques");
    expect(container.textContent).not.toContain("$3,000.00");
  });
});
