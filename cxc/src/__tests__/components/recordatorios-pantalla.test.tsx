// ─────────────────────────────────────────────────────────────────────────────
// RECORDATORIOS EN PANTALLA — candado de CONDUCTA.
//
// 🔴 Acá NO se busca texto en un archivo: se MONTA la pantalla real
// (`ChequesClient`, la misma que ve Daniel), se leen los nodos y se TOCAN los
// botones. Que el .tsx contenga la palabra "Recordatorios" no prueba que se
// dibuje uno, y este repo ya pagó CUATRO veces el barrido que se cumple con su
// propio comentario.
//
// Lo que protege, en orden de lo que costaría más si se rompe:
//   1. Los 19 cheques SE SIGUEN VIENDO igual (el rename no se llevó nada).
//   2. Un recordatorio se distingue de un cheque a simple vista.
//   3. Sin la migración corrida la pantalla NO se rompe: cheques igual + ámbar.
//   4. Guardar manda lo que la persona puso, y nada se guarda solo.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act, within } from "@testing-library/react";
import ChequesClient, { type Cheque } from "@/app/cheques/ChequesClient";
import { ContextMenuProvider } from "@/components/ui";
import type { Recordatorio } from "@/lib/recordatorios/recordatorio";

vi.mock("next/navigation", () => ({
  usePathname: () => "/cheques",
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

// 🔴 EL RELOJ VA CLAVADO, y no es una formalidad: este archivo se puso ROJO
// SOLO, sin que nadie tocara una línea, al cambiar la fecha del día.
//
// El cheque de prueba tiene `fecha_deposito: "2026-08-24"` clavado, pero la
// pantalla pregunta la hora al reloj REAL (`todayStr()` en ChequesClient) para
// decidir si un cheque va en "Hoy", en "Esta semana" o en "Vencidos", y para
// contar la pestaña "Pendientes". El 24-ago pasaba; el 25-ago a las 00:00 UTC
// el mismo test, con el mismo código, empezó a fallar.
//
// Es la regla que este repo ya tiene escrita para asistencia y para los cheques:
// **fechas FIJAS, nunca `new Date()`**. Un test que depende del calendario no
// prueba el código: prueba qué día es hoy, y rompe el build una madrugada
// cualquiera sin que nadie sepa por qué.
const HOY = new Date("2026-08-24T15:00:00.000Z"); // el día del fixture

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(HOY);
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

// Un cheque REAL de producción (24-ago-2026: 19 vivos, $279.396,12).
const CHEQUE: Cheque = {
  id: "c1",
  cliente: "JERUSALEM DE PANAMA",
  empresa: "vistana",
  banco: "",
  numero_cheque: "246001",
  monto: 1000,
  fecha_deposito: "2026-08-24",
  notas: "",
  vendedor: "Rey",
  estado: "pendiente",
  fecha_depositado: null,
  created_at: "2026-08-01T00:00:00.000Z",
};

const REC: Recordatorio = {
  id: "r1",
  fecha: "2026-08-24",
  texto: "Recordar cobrar",
  cliente: "",
  clienteCodigo: null,
  repeticion: "una_vez",
  creadoPor: "Daniel",
  createdAt: "2026-08-24T14:00:00.000Z",
};

function pintar(over: {
  cheques?: Cheque[];
  recordatorios?: Recordatorio[];
  faltaMigracionRecordatorios?: boolean;
} = {}) {
  // La pantalla real usa el menú de clic derecho de la app: sin su proveedor,
  // `useContextMenu` revienta. Se monta el REAL, no un doble.
  return render(
    <ContextMenuProvider>
      <ChequesClient
        initialData={{
          cheques: over.cheques ?? [CHEQUE],
          recordatorios: over.recordatorios ?? [],
          faltaMigracionRecordatorios: over.faltaMigracionRecordatorios ?? false,
        }}
      />
    </ContextMenuProvider>,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 LOS CHEQUES NO SE PERDIERON — el rename no se llevó nada", () => {
  it("el cheque se sigue viendo, con su cliente y su monto", () => {
    pintar();
    expect(screen.getAllByText("JERUSALEM DE PANAMA").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$1,000.00").length).toBeGreaterThan(0);
  });

  it("los botones de siempre siguen ahí: Nuevo Cheque, Exportar, Lista y Calendario", () => {
    pintar();
    expect(screen.getByRole("button", { name: /Nuevo Cheque/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Exportar/ })).toBeTruthy();
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

  it("la pestaña Pendientes sigue contando SOLO cheques", () => {
    pintar({ recordatorios: [REC, { ...REC, id: "r2" }] });
    const tab = screen.getByRole("button", { name: /^Pendientes/ });
    // 1 cheque pendiente. Si los recordatorios se hubieran mezclado acá, este
    // contador diría 3 y estaría mintiendo sobre plata por cobrar.
    expect(tab.textContent).toContain("1");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("un recordatorio SE DISTINGUE de un cheque a simple vista", () => {
  it("tiene su propia pestaña, con su cuenta", () => {
    pintar({ recordatorios: [REC, { ...REC, id: "r2", texto: "Llamar al banco" }] });
    const tab = screen.getByRole("button", { name: /^Recordatorios/ });
    expect(tab.textContent).toContain("2");
  });

  it("la pestaña existe aunque no haya ninguno (es la puerta para crear el primero)", () => {
    pintar({ recordatorios: [] });
    expect(screen.getByRole("button", { name: /^Recordatorios/ })).toBeTruthy();
  });

  it("al tocarla se listan, con campanita y su fecha", () => {
    const { container } = pintar({ recordatorios: [REC] });
    fireEvent.click(screen.getByRole("button", { name: /^Recordatorios/ }));

    const fila = container.querySelector('[data-recordatorio-fila="r1"]');
    expect(fila, "el recordatorio no se dibujó en la lista").toBeTruthy();
    expect(within(fila as HTMLElement).getByText("Recordar cobrar")).toBeTruthy();
    // 🔔 es lo que lo separa de un cheque de un vistazo.
    expect((fila as HTMLElement).textContent).toContain("🔔");
  });

  it("un recordatorio que se repite lo DICE en la fila", () => {
    const { container } = pintar({ recordatorios: [{ ...REC, repeticion: "mensual" }] });
    fireEvent.click(screen.getByRole("button", { name: /^Recordatorios/ }));
    const fila = container.querySelector('[data-recordatorio-fila="r1"]') as HTMLElement;
    expect(fila.textContent).toContain("Cada mes");
  });

  it("el cliente aparece con su código cuando lo hay", () => {
    const { container } = pintar({
      recordatorios: [{ ...REC, cliente: "City Mall Paso Canoa", clienteCodigo: "D-25" }],
    });
    fireEvent.click(screen.getByRole("button", { name: /^Recordatorios/ }));
    const fila = container.querySelector('[data-recordatorio-fila="r1"]') as HTMLElement;
    expect(fila.textContent).toContain("City Mall Paso Canoa");
    expect(fila.textContent).toContain("D-25");
  });

  it("🔴 sin cliente NO se dibuja ningún chip vacío (es un estado legítimo)", () => {
    // Se pinta APARTE en vez de re-renderizar: `recordatorios` es estado
    // inicializado del prop, así que un `rerender` con otros datos no lo mueve
    // — el test habría medido la pantalla anterior y pasado por casualidad.
    const { container } = pintar({ recordatorios: [REC] });
    fireEvent.click(screen.getByRole("button", { name: /^Recordatorios/ }));
    const fila = container.querySelector('[data-recordatorio-fila="r1"]') as HTMLElement;
    expect(fila.textContent).not.toContain("D-");
    expect(fila.textContent).toContain("Recordar cobrar");
  });

  it("🔴 en la pestaña de recordatorios NO se cuela ningún cheque", () => {
    const { container } = pintar({ recordatorios: [REC] });
    fireEvent.click(screen.getByRole("button", { name: /^Recordatorios/ }));
    expect(container.querySelector('[data-cheque-fila="c1"]')).toBeNull();
    expect(screen.queryByText("JERUSALEM DE PANAMA")).toBeNull();
  });

  // 🔑 El calendario tiene DOS layouts (la grilla de escritorio y la lista de
  // celular) y en jsdom NO hay Tailwind, así que los dos se montan a la vez:
  // mirar "¿hay alguna píldora?" deja que uno de los dos se caiga sin que nada
  // se ponga rojo — pasó, y la mutación sobrevivió. Se busca por `data-vista`,
  // que es fijo, y NO por la clase del breakpoint, que se mueve.
  for (const vista of ["calendario-grid", "calendario-lista"]) {
    it(`aparece en el CALENDARIO (${vista}) — es donde Daniel dijo que lo quería`, () => {
      // "quisiera poner ahí en el calendario «recordar cobrar»".
      const hoy = HOY.toISOString().slice(0, 10); // el reloj está clavado arriba
      const { container } = pintar({ recordatorios: [{ ...REC, fecha: hoy }] });
      fireEvent.click(screen.getByRole("button", { name: /^Calendario$/ }));

      const layout = container.querySelector(`[data-vista="${vista}"]`);
      expect(layout, `no se encontró el layout ${vista}`).toBeTruthy();
      const pills = (layout as HTMLElement).querySelectorAll('[data-recordatorio-pill="r1"]');
      expect(pills.length, `el recordatorio no se dibujó en ${vista}`).toBeGreaterThan(0);
      expect((pills[0] as HTMLElement).textContent).toContain("Recordar cobrar");
    });
  }

  it("el calendario sigue dibujando los cheques (no los reemplazó)", () => {
    const hoy = HOY.toISOString().slice(0, 10); // el reloj está clavado arriba
    pintar({ cheques: [{ ...CHEQUE, fecha_deposito: hoy }], recordatorios: [{ ...REC, fecha: hoy }] });
    fireEvent.click(screen.getByRole("button", { name: /^Calendario$/ }));
    expect(screen.getAllByText("JERUSALEM DE PANAMA").length).toBeGreaterThan(0);
  });

  it("avisa arriba cuando hay uno para HOY, sin abrir nada", () => {
    const hoy = HOY.toISOString().slice(0, 10); // el reloj está clavado arriba
    pintar({ recordatorios: [{ ...REC, fecha: hoy }] });
    expect(screen.getByText(/1 recordatorio para hoy/)).toBeTruthy();
  });

  it("uno de MAÑANA no enciende el aviso de hoy", () => {
    const manana = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    pintar({ recordatorios: [{ ...REC, fecha: manana }] });
    expect(screen.queryByText(/recordatorio para hoy/)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 SIN LA MIGRACIÓN CORRIDA, la pantalla de cheques NO se rompe", () => {
  it("los cheques se ven igual y el aviso va en ÁMBAR, no en rojo", () => {
    const { container } = pintar({ faltaMigracionRecordatorios: true });
    expect(screen.getAllByText("JERUSALEM DE PANAMA").length).toBeGreaterThan(0);

    const aviso = screen.getByText(/todavía no están activos/i);
    const caja = aviso.closest("div") as HTMLElement;
    // Ámbar: rojo se leería como "algo se rompió", y no se rompió nada.
    expect(caja.className).toContain("amber");
    expect(caja.className).not.toContain("red");
    // Y dice QUÉ archivo falta: el que lo corre es Daniel, a mano.
    expect(container.textContent).toContain("20260824120000_recordatorios.sql");
  });

  it("el botón de crear va APAGADO (un 'guardar' que no guarda es peor)", () => {
    pintar({ faltaMigracionRecordatorios: true });
    const btn = screen.getByRole("button", { name: /\+ Recordatorio/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.title).toMatch(/no están activos/i);
  });

  it("con la migración corrida, el botón está encendido", () => {
    pintar({ faltaMigracionRecordatorios: false });
    expect((screen.getByRole("button", { name: /\+ Recordatorio/ }) as HTMLButtonElement).disabled).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("crear y editar — nada se guarda solo", () => {
  it("abrir la ventana NO escribe nada", async () => {
    pintar();
    salidas.length = 0;
    fireEvent.click(screen.getByRole("button", { name: /\+ Recordatorio/ }));
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByRole("dialog", { name: /Nuevo recordatorio/ })).toBeTruthy();
    expect(salidas.filter((s) => s.metodo !== "GET")).toEqual([]);
  });

  it("🔴 sin texto el botón está APAGADO y dice qué falta", async () => {
    pintar();
    fireEvent.click(screen.getByRole("button", { name: /\+ Recordatorio/ }));
    await act(async () => { await Promise.resolve(); });
    const guardar = screen.getByRole("button", { name: /Guardar recordatorio/ }) as HTMLButtonElement;
    expect(guardar.disabled).toBe(true);
    expect(screen.getByText(/Falta: qué hay que recordar/)).toBeTruthy();
  });

  it("con texto se enciende, y al guardar manda lo que la persona puso", async () => {
    pintar();
    fireEvent.click(screen.getByRole("button", { name: /\+ Recordatorio/ }));
    await act(async () => { await Promise.resolve(); });

    fireEvent.change(screen.getByLabelText("Qué hay que recordar"), { target: { value: "Recordar cobrar" } });
    fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: "2026-08-31" } });
    fireEvent.click(screen.getByRole("button", { name: /Cada mes/ }));

    const guardar = screen.getByRole("button", { name: /Guardar recordatorio/ }) as HTMLButtonElement;
    expect(guardar.disabled).toBe(false);

    salidas.length = 0;
    await act(async () => { fireEvent.click(guardar); await Promise.resolve(); });

    const post = salidas.find((s) => s.metodo === "POST");
    expect(post, "no salió ningún POST al guardar").toBeTruthy();
    expect(post!.url).toContain("/api/recordatorios");
    expect(post!.cuerpo).toMatchObject({
      fecha: "2026-08-31",
      texto: "Recordar cobrar",
      repeticion: "mensual",
    });
  });

  it("tocar la fila de un recordatorio abre EDITAR con sus datos", async () => {
    const { container } = pintar({
      recordatorios: [{ ...REC, texto: "Pagar el alquiler", repeticion: "mensual" }],
    });
    fireEvent.click(screen.getByRole("button", { name: /^Recordatorios/ }));
    salidas.length = 0;
    fireEvent.click(container.querySelector('[data-recordatorio-fila="r1"]') as HTMLElement);
    await act(async () => { await Promise.resolve(); });

    const dialogo = screen.getByRole("dialog", { name: /Editar recordatorio/ });
    expect((within(dialogo).getByLabelText("Qué hay que recordar") as HTMLTextAreaElement).value).toBe("Pagar el alquiler");
    // El botón de la repetición se busca DENTRO de la ventana: "Cada mes"
    // también aparece en la fila de la lista que quedó detrás.
    expect(
      within(dialogo).getByRole("button", { name: /Cada mes/ }).getAttribute("aria-pressed"),
    ).toBe("true");
    // Abrir a editar NO escribe: es el bug que Guías ya pagó (#570).
    expect(salidas.filter((s) => s.metodo !== "GET")).toEqual([]);
  });

  it("🔴 eliminar pide confirmación — un toque no borra", async () => {
    const { container } = pintar({ recordatorios: [REC] });
    fireEvent.click(screen.getByRole("button", { name: /^Recordatorios/ }));
    fireEvent.click(container.querySelector('[data-recordatorio-fila="r1"]') as HTMLElement);
    await act(async () => { await Promise.resolve(); });

    salidas.length = 0;
    fireEvent.click(screen.getByRole("button", { name: /^Eliminar$/ }));
    await act(async () => { await Promise.resolve(); });
    expect(salidas.filter((s) => s.metodo === "DELETE")).toEqual([]);

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Sí, eliminar/ })); await Promise.resolve(); });
    expect(salidas.some((s) => s.metodo === "DELETE" && s.url.includes("/api/recordatorios/r1"))).toBe(true);
  });

  it("la ventana NO se autoenfoca (en iPhone levantaría el teclado sola)", async () => {
    pintar();
    fireEvent.click(screen.getByRole("button", { name: /\+ Recordatorio/ }));
    await act(async () => { await Promise.resolve(); });
    // Nada del formulario se quedó con el foco al abrir.
    const activo = document.activeElement;
    expect(activo === document.body || activo === null || activo?.tagName === "DIV").toBe(true);
  });
});
