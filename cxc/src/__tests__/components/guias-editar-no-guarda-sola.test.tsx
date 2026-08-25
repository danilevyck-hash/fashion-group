/**
 * 🔴 EL CANDADO: abrir el formulario de editar NO puede producir ni una
 * escritura.
 *
 * ⚠️ 23-ago-2026: el formulario dejó de vivir en `/guias/[id]/editar` y se abre
 * DENTRO de la guía, con el botón «Editar» de `/guias/[id]` (Daniel: *"quiero
 * botón de editar y que se me abra la guía para editar así mismo como si
 * estuviese haciendo la guía"*). Este candado se MUDÓ con él: ahora monta la
 * página de la guía y TOCA «Editar», que es el camino que la gente usa. Dejarlo
 * apuntando a la ruta vieja lo habría convertido en un candado sobre una
 * pantalla que ya nadie abre.
 *
 * 🩸 El bug, reproducido en producción el 17-ago-2026 sobre GT-204: el
 * formulario se marcaba como sucio contando cuántas veces había corrido un
 * `useEffect` (`changeCount.current > 1`), o sea que TERMINAR DE CARGAR LOS
 * DATOS contaba como cambio, y a los ~1,5 s salía un `PUT /api/guias/[id]`.
 * Ese PUT manda `items`, que en el servidor es un **reemplazo completo** —
 * borra los renglones e inserta otros nuevos—, así que **abrir la pantalla y
 * arrepentirse ya le había cambiado el id a cada línea**. Medido con un doble
 * (GT-205, creado y borrado ese día): abrir la pantalla y no tocar nada rotó
 * los dos uuid de `guia_items`.
 *
 * 🔑 POR QUÉ ESTE TEST MONTA LA PÁGINA ENTERA y no `GuiaForm` suelto: el bug
 * vivía en la costura entre el hook que carga la guía y el formulario que
 * decide guardar. Con `GuiaForm` solo habría que pasarle a mano el "hay
 * cambios" que el hook calcula, y el candado probaría el mock en vez del
 * producto. Acá se cuenta lo que SALE POR `fetch`, que es lo único que la base
 * llega a ver.
 *
 * ⚠️ Y se monta también dentro de `<StrictMode>`, que es la configuración en la
 * que el bug se dispara siempre: React monta el árbol dos veces y el contador
 * de renders llegaba a 2 sin que nadie tocara una tecla.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { StrictMode, type ReactNode } from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";

const push = vi.fn();
const ROUTER = { push, replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() };
const PARAMS = { id: "guia-205" };
vi.mock("next/navigation", () => ({
  useRouter: () => ROUTER,
  useParams: () => PARAMS,
  usePathname: () => "/guias/guia-205",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/AppHeader", () => ({ default: () => null }));

/**
 * El doble REAL que se usó para medir contra producción (GT-205, 17-ago-2026):
 * dos envíos completos y una cabecera completa, o sea el peor caso — es
 * justamente cuando el autoguardado se anima a disparar.
 */
const GUIA = {
  id: "guia-205",
  numero: 205,
  fecha: "2026-08-18",
  estado: "Pendiente Bodega",
  modo_entrega: "transportista",
  transportista_id: "t-1",
  entregado_por: "Julio",
  observaciones: "DOBLE DE PRUEBA",
  numero_guia_transp: "9999",
  guia_items: [
    { id: "it-1", orden: 1, cliente: "City Mall David", cliente_codigo: "D-24", direccion: "David", empresa: "Fashion Wear", facturas: "9001", bultos: 3, numero_guia_transp: "9999" },
    { id: "it-2", orden: 2, cliente: "Jerusalem De Panama", cliente_codigo: "D-80", direccion: "Paso Canoas", empresa: "Fashion Shoes", facturas: "9002", bultos: 5, numero_guia_transp: "9999" },
  ],
};

interface Escritura { metodo: string; url: string; cuerpo: Record<string, unknown> }
let escrituras: Escritura[] = [];
/** Para probar el caso REAL de una guía ya despachada: el servidor contesta 400. */
let servidorRechazaElPut = false;

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
  servidorRechazaElPut = false;
  vi.stubGlobal("localStorage", memStorage());
  vi.stubGlobal("sessionStorage", memStorage());
  sessionStorage.setItem("cxc_role", "admin");
  sessionStorage.setItem("fg_modules", JSON.stringify(["guias"]));
  vi.stubGlobal("fetch", vi.fn(async (url: unknown, init?: { method?: string; body?: string }) => {
    const u = String(url);
    const metodo = (init?.method || "GET").toUpperCase();
    if (metodo !== "GET") {
      escrituras.push({ metodo, url: u, cuerpo: JSON.parse(init?.body || "{}") });
      // El pedido TARDA, como en la vida real (medido contra el servidor local:
      // 866-2412 ms). Con una respuesta instantánea React nunca llega a
      // renderizar con `saving` en true y el candado del bucle no probaría nada.
      await new Promise((r) => setTimeout(r, 60));
      if (servidorRechazaElPut) {
        return { ok: false, json: async () => ({ error: "Guía ya despachada, no se puede editar" }) };
      }
      return { ok: true, json: async () => ({ id: GUIA.id }) };
    }
    if (u.startsWith("/api/guias/frecuencias")) return { ok: true, json: async () => ({ clientes: [], empresas: [], direcciones: {} }) };
    if (u.startsWith("/api/transportistas")) return { ok: true, json: async () => [{ id: "t-1", nombre: "Boston", activo: true }] };
    if (u.startsWith(`/api/guias/${GUIA.id}`)) return { ok: true, json: async () => GUIA };
    if (u.startsWith("/api/clientes")) return { ok: true, json: async () => ({ clientes: [] }) };
    return { ok: true, json: async () => ({}) };
  }));
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

/**
 * El autoguardado espera 1,5 s: se le da el doble antes de contar.
 *
 * 🩸 El tiempo se deja pasar en TRAMOS de 100 ms, no en un `act` de 3,2 s: con
 * un solo tramo largo React acumula los cambios de estado hasta el final y el
 * formulario nunca llega a "ver" que un guardado terminó, así que un
 * autoguardado que se reintenta en bucle se vería igual que uno que se dispara
 * una sola vez — y el candado del bucle pasaría en verde sin haber mirado nada.
 * Con tramos cortos React refresca entre medio, como en el navegador.
 */
async function esperarElAutoguardado() {
  for (let i = 0; i < 32; i++) {
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });
  }
}

async function abrirPantallaDeEditar(envoltorio?: (hijo: ReactNode) => ReactNode) {
  const Page = (await import("@/app/guias/[id]/page")).default;
  const arbol = <Page />;
  render(<>{envoltorio ? envoltorio(arbol) : arbol}</>);
  await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
  // 🔴 Se entra POR EL BOTÓN, como la gente. Si el botón no estuviera, este
  // candado probaría una pantalla que nadie puede abrir.
  const editar = screen.getByRole("button", { name: /^Editar$/i });
  await act(async () => { fireEvent.click(editar); });
  await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
  // Si la pantalla no cargó, cualquier "0 escrituras" sería verde por nada.
  expect(screen.getAllByText(/Guardar Cambios/i).length).toBeGreaterThan(0);
}

const puts = () => escrituras.filter((e) => e.metodo === "PUT");
/** El campo visible: el formulario dibuja los DOS layouts y esconde uno con CSS. */
const visible = (sel: string) =>
  [...document.querySelectorAll<HTMLElement>(sel)].find((e) => !e.closest(".hidden")) ?? document.querySelector<HTMLElement>(sel)!;

describe("abrir la pantalla de editar no escribe", () => {
  it("montar y esperar el tiempo del autoguardado deja CERO escrituras", async () => {
    await abrirPantallaDeEditar();
    await esperarElAutoguardado();
    expect(escrituras).toEqual([]);
  }, 30000);

  it("tampoco con el árbol montado dos veces (StrictMode)", async () => {
    // Es la configuración que hacía llegar el contador de renders a 2 sin que
    // nadie tocara nada — o sea la que reproducía el bug siempre.
    await abrirPantallaDeEditar((hijo) => <StrictMode>{hijo}</StrictMode>);
    await esperarElAutoguardado();
    expect(escrituras).toEqual([]);
  }, 30000);

  it("y la pantalla no miente diciendo que guardó", async () => {
    await abrirPantallaDeEditar();
    await esperarElAutoguardado();
    expect(document.body.textContent).not.toMatch(/Listo, guardado/);
    expect(document.body.textContent).not.toMatch(/Sin guardar/);
  }, 30000);
});

describe("cambiar algo SÍ guarda", () => {
  it("tocar las observaciones manda UN PUT… y SIN los renglones", async () => {
    await abrirPantallaDeEditar();
    await esperarElAutoguardado();
    const obs = visible("textarea") as HTMLTextAreaElement;
    fireEvent.change(obs, { target: { value: "va con hielo" } });
    await esperarElAutoguardado();
    expect(puts()).toHaveLength(1);
    // 🔴 `items` es un reemplazo completo (borra e inserta con ids nuevos):
    // anotar una observación no puede costarle el id a cada línea.
    expect(puts()[0].cuerpo.items).toBeUndefined();
    expect(puts()[0].cuerpo.observaciones).toBe("va con hielo");
  }, 30000);

  it("tocar los bultos de una línea manda UN PUT con los renglones", async () => {
    // La otra mitad: un formulario que no guardara NUNCA también daría cero
    // escrituras al abrir.
    await abrirPantallaDeEditar();
    await esperarElAutoguardado();
    const bultos = visible('input[id^="bultos-"]') as HTMLInputElement;
    fireEvent.change(bultos, { target: { value: "7" } });
    await esperarElAutoguardado();
    expect(puts()).toHaveLength(1);
    const items = puts()[0].cuerpo.items as Array<{ bultos: number; cliente: string; cliente_codigo: string }>;
    expect(items).toHaveLength(2);
    expect(items[0].bultos).toBe(7);
    // El trabajo de atar clientes viaja intacto en el reemplazo.
    expect(items.map((i) => i.cliente_codigo)).toEqual(["D-24", "D-80"]);
  }, 30000);

  it("un guardado RECHAZADO no se reintenta en bucle", async () => {
    // 🔴 El caso real: una guía ya despachada. El servidor contesta 400, así
    // que sigue habiendo cambios sin guardar — y sin freno el temporizador
    // volvería a disparar cada 1,5 s para siempre contra la misma guía.
    servidorRechazaElPut = true;
    await abrirPantallaDeEditar();
    await esperarElAutoguardado();
    const obs = visible("textarea") as HTMLTextAreaElement;
    fireEvent.change(obs, { target: { value: "va con hielo" } });
    await esperarElAutoguardado();
    await esperarElAutoguardado();
    await esperarElAutoguardado();
    expect(puts()).toHaveLength(1);
    // Y lo que sigue sin guardarse se dice: nada de "Listo, guardado".
    expect(document.body.textContent).toMatch(/Sin guardar/);
    expect(document.body.textContent).not.toMatch(/Listo, guardado/);
  }, 40000);

  it("tras un rechazo, cambiar OTRA cosa sí vuelve a intentar", async () => {
    // El freno no puede volverse un candado permanente: si la persona corrige
    // algo, tiene que reintentarse.
    servidorRechazaElPut = true;
    await abrirPantallaDeEditar();
    await esperarElAutoguardado();
    const obs = visible("textarea") as HTMLTextAreaElement;
    fireEvent.change(obs, { target: { value: "va con hielo" } });
    await esperarElAutoguardado();
    fireEvent.change(obs, { target: { value: "va con hielo y sal" } });
    await esperarElAutoguardado();
    expect(puts()).toHaveLength(2);
  }, 40000);
});
