// ─────────────────────────────────────────────────────────────────────────────
// CANDADO DE PANTALLA: la lista de seguimiento se DIBUJA, y dibuja cuatro cosas.
//
// El candado hermano (`lib/multifashion-clientes-seguimiento.test.ts`) lee el
// código fuente; éste monta el componente de verdad. 🩸 Un barrido de fuente
// puede pasar en verde sobre una pantalla que revienta al primer render — y la
// que ve Jennifer es ésta, no el archivo.
//
// Se comprueba lo que Daniel definió el 16-sep-2026:
//   · la fila lleva NOMBRE · hace cuántos días no compra · si ya le
//     escribieron · el botón, y nada más;
//   · abre en «No vuelven», del más viejo al más nuevo;
//   · sin teléfono NO hay botón;
//   · tocar el nombre abre su ficha (cuánto compró, cuántas veces, la fecha).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/multifashion",
  useSearchParams: () => new URLSearchParams(),
}));

import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { SWRConfig } from "swr";
import { ListaSeguimientoClientes } from "@/components/multifashion/ListaSeguimientoClientes";
import { armarUniverso, type FilaFactura, type FilaRegistrado } from "@/lib/multifashion/clientes-universo";
import { FILAS_SEGUIMIENTO_AL_ABRIR } from "@/lib/multifashion/clientes-seguimiento";

const HOY = "2026-09-16";

function reg(id: number, nombre: string, tel: string | null): FilaRegistrado {
  return { cliente_switch_id: id, nombre, telefono: tel, celular: null, raw_data: null };
}
function fac(id: number, fecha: string, monto = 100): FilaFactura {
  return {
    cliente_switch_id: id,
    cliente_nombre: null,
    fecha: `${fecha}T15:00:00+00:00`,
    tipo_comprobante: "Factura",
    subtotal_descuento: monto,
    is_wholesale: false,
  };
}

// Tres clientes reales del mockup que Daniel aprobó, con sus fechas.
const { clientes } = armarUniverso(
  [
    reg(1, "LUIS CARLOS AVILA", "6212-0673"),
    reg(2, "SERGIO GUERRERO", "6301-1122"),
    // 🔴 Sin teléfono: el que NO lleva botón.
    reg(3, "GRUPO SEQUOIA PANAMA", null),
  ],
  [fac(1, "2026-07-07", 929.54), fac(2, "2025-12-06", 681.47), fac(3, "2025-12-21", 327.28)],
  HOY,
);

beforeEach(() => {
  // La lista pide el rastro de contactos. Se le contesta que a Sergio ya le
  // escribieron hace 3 días, igual que en el mockup.
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true,
    json: async () => ({
      hoy: HOY,
      porCliente: { "2": { canal: "whatsapp", fecha: "2026-09-13" } },
    }),
  })));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** 🩸 Cada render con su propia caché de SWR: la del módulo es GLOBAL y, sin
 *  esto, el rastro de contactos de un test se filtra al siguiente. */
const montar = (props: { clientes: typeof clientes; hoy: string }) =>
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <ListaSeguimientoClientes {...props} />
    </SWRConfig>,
  );

const dibujar = () => montar({ clientes, hoy: HOY });

describe("la lista de seguimiento se dibuja", () => {
  it("🔴 abre en «No vuelven» con los tres, del más viejo al más nuevo", async () => {
    dibujar();
    const nombres = screen.getAllByText(/Luis Carlos Avila|Sergio Guerrero|Grupo Sequoia Panama/)
      .map((e) => e.textContent);
    expect(nombres).toEqual(["Sergio Guerrero", "Grupo Sequoia Panama", "Luis Carlos Avila"]);
    expect(screen.getByRole("button", { name: /No vuelven/ }).getAttribute("aria-pressed")).toBe("true");
  });

  it("🔴 cada fila dice hace cuántos días no compra", async () => {
    dibujar();
    expect(screen.getByText("284 días sin comprar")).toBeTruthy();  // Sergio, 6-dic-2025
    expect(screen.getByText("269 días sin comprar")).toBeTruthy();  // Sequoia, 21-dic-2025
    expect(screen.getByText("71 días sin comprar")).toBeTruthy();   // Luis, 7-jul-2026
  });

  it("🔴 y si ya le escribieron, lo dice en la misma línea gris", async () => {
    dibujar();
    expect(await screen.findByText(/le escribieron hace 3 días/)).toBeTruthy();
    // Solo UNO: a los otros dos no les escribió nadie y no se dice nada.
    expect(screen.queryAllByText(/le escribieron/).length).toBe(1);
    expect(screen.queryByText(/nunca/i)).toBeNull();
  });

  it("🔴 SIN TELÉFONO NO SE DIBUJA EL BOTÓN", async () => {
    dibujar();
    const botones = screen.getAllByRole("link", { name: /WhatsApp/ });
    expect(botones.length).toBe(2);
    for (const b of botones) {
      // El enlace va VACÍO: `wa.me/<dígitos>` y nada más.
      expect(b.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/\d+$/);
      expect(b.getAttribute("href")).not.toContain("text=");
    }
  });

  it("🔴 tocar el nombre abre su ficha: cuánto compró, cuántas veces y la fecha", async () => {
    dibujar();
    expect(screen.queryByText("Compró")).toBeNull();
    fireEvent.click(screen.getByText("Luis Carlos Avila"));
    expect(screen.getByText("Compró")).toBeTruthy();
    expect(screen.getByText("$929.54")).toBeTruthy();
    expect(screen.getByText("1 visita")).toBeTruthy();
    expect(screen.getByText("7 jul 2026")).toBeTruthy();
  });

  it("🔴 la fila NO lleva nada más: ni monto, ni tickets, ni posición", async () => {
    dibujar();
    // Con la ficha cerrada no hay un solo signo de dólar en la lista.
    expect(screen.queryByText(/\$/)).toBeNull();
  });

  it("los chips filtran, y son TRES", async () => {
    dibujar();
    const chips = ["No vuelven", "Nuevos", "Todos"];
    for (const c of chips) expect(screen.getByRole("button", { name: new RegExp(c) })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Frecuentes/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Nuevos/ }));
    expect(screen.getByText(/Ningún cliente cae en "Nuevos"/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Todos/ }));
    expect(screen.getAllByText(/días sin comprar/).length).toBe(3);
  });

  it("🔴 no hay encabezados que ordenen: la lista viene en su orden y punto", async () => {
    const { container } = dibujar();
    expect(container.querySelector("thead")).toBeNull();
    expect(container.querySelector("table")).toBeNull();
  });

  it("apretar WhatsApp anota el contacto POR CÓDIGO, y la marca aparece al toque", async () => {
    dibujar();
    const enlaces = screen.getAllByRole("link", { name: /WhatsApp/ });
    // El primero de la lista es Sergio (el más viejo); el segundo, Luis.
    fireEvent.click(enlaces[1]);
    expect(await screen.findByText(/le escribieron hoy/)).toBeTruthy();
    const llamadas = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const post = llamadas.find((c) => (c[1] as { method?: string } | undefined)?.method === "POST");
    expect(post).toBeTruthy();
    const cuerpo = JSON.parse((post![1] as { body: string }).body);
    expect(cuerpo).toEqual({ cliente_switch_id: 1, canal: "whatsapp" });
    // 🔴 Lo que viaja es el CÓDIGO. Ningún nombre.
    expect(JSON.stringify(cuerpo)).not.toMatch(/Luis|AVILA/i);
  });
});

describe("la lista aguanta lo raro sin romperse", () => {
  it("sin clientes no explota: lo dice y ya", () => {
    montar({ clientes: [], hoy: HOY });
    expect(screen.getByText(/Ningún cliente cae en "No vuelven"/)).toBeTruthy();
  });

  it("si la ruta de contactos se cae, la lista se dibuja igual", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })));
    dibujar();
    expect(screen.getAllByText(/días sin comprar/).length).toBe(3);
    expect(screen.queryByText(/le escribieron/)).toBeNull();
  });

  /* 🩸 ERAN 10 HASTA EL 16-sep-2026. Daniel: «2. Sí» a las 25. Medido ese día:
   * el chip que abre trae 668 filas, así que diez se acaban en dos segundos de
   * trabajo. Mayoreo se queda en 10 y por eso son dos constantes. */
  it("abre con 25 filas y ofrece «Ver los N» cuando hay más", () => {
    const muchos = armarUniverso(
      Array.from({ length: 30 }, (_, i) => reg(i + 10, `CLIENTE ${i + 10}`, "6212-0673")),
      Array.from({ length: 30 }, (_, i) => fac(i + 10, "2025-12-01")),
      HOY,
    ).clientes;
    montar({ clientes: muchos, hoy: HOY });
    expect(screen.getAllByText(/días sin comprar/).length).toBe(FILAS_SEGUIMIENTO_AL_ABRIR);
    const ver = screen.getByRole("button", { name: "Ver los 30" });
    fireEvent.click(ver);
    expect(screen.getAllByText(/días sin comprar/).length).toBe(30);
  });
});
