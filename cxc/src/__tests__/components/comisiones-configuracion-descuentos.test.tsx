// ═════════════════════════════════════════════════════════════════════════════
// 🔴 CONFIGURACIÓN: SE VA EL INTERRUPTOR «ACTIVO», LLEGAN LOS «DESCUENTOS».
// ═════════════════════════════════════════════════════════════════════════════
// 🩸 (1) EL INTERRUPTOR QUE MENTÍA. Daniel, 6-sep-2026: «quitarlo». MEDIDO: no
// le quitaba la comisión a NADIE. `comision_b2b_v8` une la tabla de tasas SIN
// filtrar por `activo` (el `t.activo = true` de la CTE `universo` solo arma la
// lista de quienes NO vendieron ni cobraron nada; cualquiera con una venta o un
// cobro entra igual por el UNION y su tasa se aplica desde un LEFT JOIN sin
// filtro). Prueba: `REY STOUTE AGUAS` estaba en `activo = false` desde el
// 4-sep-2026 y la RPC lo SEGUÍA devolviendo con comisión los 9 meses de 2026
// ($49,83) — solo desaparecía de la pantalla por estar en la lista de
// retirados, que es otra cosa. La COLUMNA no se dropea (patrón de la casa).
//
// 🩸 (2) LA PALANCA QUE NO SE PODÍA VER. `comision_descuentos_fijos` no tenía
// POST, ni PUT, ni DELETE en NINGUNA parte de la aplicación: las dos filas
// vivas se escribieron directo en la base y solo asomaban dentro del modal de
// detalle. Es lo que más plata mueve del módulo — $14.157,72 en 2026, más que
// toda la comisión de Edwin en el año. Daniel: «sí, minimalista».
// ═════════════════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, cleanup, within, fireEvent, waitFor, act } from "@testing-library/react";
import { ComisionesConfiguracionView } from "@/components/ventas/ComisionesConfiguracionView";
import { mesEnPalabras, hastaEnPalabras, ROTULO_DESCUENTOS } from "@/components/ventas/comisiones-config/Descuentos";

const RAIZ = process.cwd();
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");

const almacenReal = (): Storage => {
  const datos = new Map<string, string>();
  return {
    getItem: (k: string) => (datos.has(k) ? datos.get(k)! : null),
    setItem: (k: string, v: string) => { datos.set(k, String(v)); },
    removeItem: (k: string) => { datos.delete(k); },
    clear: () => datos.clear(),
    key: (i: number) => [...datos.keys()][i] ?? null,
    get length() { return datos.size; },
  } as unknown as Storage;
};

const CONFIG = {
  vendedores: [
    { vendedor_nombre: "EDWIN", tasa_venta: 0.005, tasa_cobro: 0.005, origen: ["Vistana"] },
    { vendedor_nombre: "REYNALDO ESPINOSA", tasa_venta: 0.01, tasa_cobro: 0.01, origen: ["Fashion Shoes"] },
    // Los que el servidor ya filtra, mandados igual: la pantalla tampoco los
    // puede ofrecer (respuesta vieja, o alguien que quita el filtro del cliente).
    { vendedor_nombre: "REY STOUTE AGUAS", tasa_venta: 0.005, tasa_cobro: 0.005, origen: ["Vistana"] },
    { vendedor_nombre: "DANIEL LEVY", tasa_venta: 0.005, tasa_cobro: 0.005, origen: ["Vistana"] },
    { vendedor_nombre: "DEFAULT", tasa_venta: 0.005, tasa_cobro: 0.005, origen: ["Vistana"] },
  ],
};
// Las dos filas REALES de producción, ahora con su vigencia.
const DESCUENTOS = {
  descuentos: [
    { id: "bcb616f4-1ba4-44f4-8e02-f0ab233dc93b", vendedor_nombre: "REYNALDO ESPINOSA", empresa_key: "fashion_shoes", concepto: "Descuento", monto: 1400, desde: "2026-01-01", hasta: null },
    { id: "15cd4b98-9322-497a-863c-3cdd03cc6a41", vendedor_nombre: "REYNALDO ESPINOSA", empresa_key: "fashion_shoes", concepto: "Descuento de adelanto", monto: 173.08, desde: "2026-01-01", hasta: null },
  ],
};
const EXCLUSIONES = { exclusiones: [], vendedores: { active_shoes: [], active_wear: [], vistana: [], fashion_wear: [], fashion_shoes: [], joystep: [] } };

const llamadas: { url: string; method: string; body?: Record<string, unknown> }[] = [];

beforeEach(() => {
  llamadas.length = 0;
  Object.defineProperty(window, "localStorage", { value: almacenReal(), configurable: true, writable: true });
  Object.defineProperty(window, "sessionStorage", { value: almacenReal(), configurable: true, writable: true });
  sessionStorage.setItem("cxc_role", "admin");
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const u = String(url);
    const method = init?.method ?? "GET";
    llamadas.push({ url: u, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
    if (u.includes("/descuentos-fijos")) return json(method === "GET" ? DESCUENTOS : { ok: true, id: "nuevo" }, method === "POST" ? 201 : 200);
    if (u.includes("/api/ventas/comisiones/config")) return json(method === "GET" ? CONFIG : { ok: true });
    if (u.includes("/api/ventas/comisiones/exclusiones")) return json(EXCLUSIONES);
    return json({});
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const seccion = (id: string) => document.querySelector(`[aria-labelledby="${id}"]`) as HTMLElement;

// ═══ 1. El interruptor «Activo» se fue ═══════════════════════════════════════
describe("🔴 «Activo» salió de Tasas por vendedor — era un control que mentía", () => {
  it("no hay columna «Activo» ni interruptor en la tabla de tasas", async () => {
    render(<ComisionesConfiguracionView />);
    await screen.findByText("Tasas por vendedor");
    const tabla = seccion("tasas-titulo");
    expect(within(tabla).queryByRole("columnheader", { name: "Activo" })).toBeNull();
    expect(within(tabla).queryByRole("button", { name: /Desactivar a|Activar a/ })).toBeNull();
    // Lo que se queda: las dos tasas y las empresas.
    expect(within(tabla).getByRole("columnheader", { name: "Venta" })).toBeTruthy();
    expect(within(tabla).getByRole("columnheader", { name: "Cobro" })).toBeTruthy();
  });

  // 🔄 CANDADO RE-APUNTADO EL 6-sep-2026. Disparaba el botón «Guardar tasas»,
  // que se retiró: era un segundo botón NEGRO compitiendo con «+ Agregar», y las
  // tasas pedían guardar mientras las casillas de las otras dos tarjetas se
  // guardaban solas. Ahora se manda al SALIR DEL CAMPO. Lo que este caso cuida
  // —que el PUT no lleve `activo`— no cambió.
  it("🔴 lo que se guarda no manda `activo`: la columna quedó sin escritores", async () => {
    render(<ComisionesConfiguracionView />);
    const campo = await screen.findByLabelText("Tasa de venta de Edwin");
    fireEvent.change(campo, { target: { value: "0.75" } });
    fireEvent.blur(campo);
    await waitFor(() => expect(llamadas.some((l) => l.method === "PUT")).toBe(true));
    const put = llamadas.find((l) => l.method === "PUT")!;
    for (const u of (put.body as { updates: Record<string, unknown>[] }).updates) {
      expect(Object.keys(u).sort()).toEqual(["tasa_cobro", "tasa_venta", "vendedor_nombre"]);
    }
  });

  it("🔴 la columna NO se dropea, y el servidor tampoco la lee ni la escribe", () => {
    const ruta = leer("src/app/api/ventas/comisiones/config/route.ts");
    const codigo = ruta.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
    expect(codigo).not.toMatch(/select\("vendedor_nombre, tasa_venta, tasa_cobro, activo"\)/);
    // 🔴 La ÚNICA mención viva a `activo` en toda la ruta es la de la tabla
    // `vendedores`, que es OTRA tabla y OTRA cosa. Si aparece una segunda, la
    // columna volvió a tener lector o escritor.
    const menciones = codigo.match(/activo/g) ?? [];
    expect(menciones).toHaveLength(1);
    expect(codigo).toContain('from("vendedores").select("nombre, empresa_key").eq("activo", true)');
    // Ninguna migración la dropea.
    const migs = leer("supabase/migrations/20261007120000_comision_descuentos_vigencia.sql")
      + leer("supabase/migrations/20261008120000_comision_b2b_v9_cliente_por_codigo.sql");
    expect(migs).not.toMatch(/DROP\s+COLUMN\s+activo/i);
  });

  it("🔑 para sacar a alguien queda UNA sola forma, y ésa sí funciona en el servidor", async () => {
    const { VENDEDORES_RETIRADOS, estaRetirado } = await import("@/lib/comisiones/retirados");
    expect(VENDEDORES_RETIRADOS).toContain("REY STOUTE AGUAS");
    expect(estaRetirado("REY STOUTE AGUAS")).toBe(true);
  });
});

// ═══ 2. La tarjeta «Descuentos» ══════════════════════════════════════════════
describe("🔴 «Descuentos»: la tercera tarjeta, minimalista", () => {
  it("se llama «Descuentos» — nunca «descuento fijo» en pantalla", async () => {
    render(<ComisionesConfiguracionView />);
    await screen.findByText(ROTULO_DESCUENTOS);
    expect(ROTULO_DESCUENTOS).toBe("Descuentos");
    expect(document.body.textContent ?? "").not.toMatch(/descuento fijo/i);
  });

  it("🔴 muestra las dos filas reales con su vigencia: vendedor · empresa · concepto · monto · desde · hasta, y nada más", async () => {
    render(<ComisionesConfiguracionView />);
    await screen.findByText("Descuento de adelanto");
    const s = seccion("descuentos-titulo");
    const encabezados = within(s).getAllByRole("columnheader").map((h) => h.textContent?.trim());
    expect(encabezados).toEqual(["Vendedor", "Empresa", "Concepto", "Monto", "Desde", "Hasta", "Quitar"]);
    // Nombre capitalizado, con Y.
    expect(within(s).getAllByText("Reynaldo Espinosa")).toHaveLength(2);
    expect(within(s).getByText("$1,400.00")).toBeTruthy();
    expect(within(s).getByText("$173.08")).toBeTruthy();
    // Enero 2026, y sin fin. Daniel: «el descuento es indefinido. No hay hasta.»
    expect(within(s).getAllByText("ene 2026")).toHaveLength(2);
    expect(within(s).getAllByText("Sin fin")).toHaveLength(2);
    // 🔴 «—» se lee como un dato que falta: un descuento indefinido no es eso.
    expect(within(s).queryByText("—")).toBeNull();
    // Minimalista: ni totales al pie ni explicaciones.
    expect(within(s).queryByText("$1,573.08")).toBeNull();
    expect(s.textContent ?? "").not.toMatch(/total/i);
  });

  it("el mes se dice en palabras, y un «Hasta» vacío es «Sin fin», nunca una fecha inventada", () => {
    expect(mesEnPalabras("2026-01-01")).toBe("ene 2026");
    expect(mesEnPalabras("2026-12-31")).toBe("dic 2026");
    expect(mesEnPalabras(null)).toBe("—");
    // 🔴 Un descuento sin fin es lo NORMAL: se dice, no se deja en guion.
    expect(hastaEnPalabras(null)).toBe("Sin fin");
    expect(hastaEnPalabras("")).toBe("Sin fin");
    expect(hastaEnPalabras("2026-12-01")).toBe("dic 2026");
  });

  it("🔴 el «Hasta» es OPCIONAL y se ve que lo es: lo dice el rótulo", async () => {
    render(<ComisionesConfiguracionView />);
    await screen.findByText(ROTULO_DESCUENTOS);
    const s = seccion("descuentos-titulo");
    fireEvent.click(within(s).getByRole("button", { name: "+ Agregar" }));
    await within(s).findByTestId("alta-descuento");
    expect(within(s).getByText("(opcional)")).toBeTruthy();
    // Y «Desde» NO lo dice: es la fecha que evita que un descuento nuevo se
    // aplique hacia atrás, que es el defecto que esto vino a cerrar.
    expect(within(s).getAllByText("(opcional)")).toHaveLength(1);
  });

  it("🔴 guardar SIN «Hasta» es el camino natural: no se pide, no se avisa", async () => {
    render(<ComisionesConfiguracionView />);
    await screen.findByText(ROTULO_DESCUENTOS);
    const s = seccion("descuentos-titulo");
    fireEvent.click(within(s).getByRole("button", { name: "+ Agregar" }));
    await within(s).findByTestId("alta-descuento");
    fireEvent.change(within(s).getByLabelText("Vendedor"), { target: { value: "EDWIN" } });
    fireEvent.change(within(s).getByLabelText("Concepto"), { target: { value: "Adelanto" } });
    fireEvent.change(within(s).getByLabelText("Monto por mes"), { target: { value: "100" } });
    // Sin tocar «Desde» ni «Hasta»: el botón ya está vivo y no hay ningún aviso.
    const guardar = within(s).getByRole("button", { name: "Guardar" }) as HTMLButtonElement;
    expect(guardar.disabled).toBe(false);
    expect(within(s).queryByText(/Falta/)).toBeNull();
    fireEvent.click(guardar);
    await waitFor(() => expect(llamadas.some((l) => l.method === "POST" && l.url.includes("/descuentos-fijos"))).toBe(true));
    const post = llamadas.find((l) => l.method === "POST" && l.url.includes("/descuentos-fijos"))!;
    expect((post.body as { hasta: unknown }).hasta).toBeNull();
    expect((post.body as { desde: unknown }).desde).toBeNull();
  });

  it("🔴 «+ Agregar» manda vendedor · empresa · concepto · monto · desde · hasta", async () => {
    render(<ComisionesConfiguracionView />);
    await screen.findByText(ROTULO_DESCUENTOS);
    const s = seccion("descuentos-titulo");
    fireEvent.click(within(s).getByRole("button", { name: "+ Agregar" }));
    await within(s).findByTestId("alta-descuento");

    fireEvent.change(within(s).getByLabelText("Vendedor"), { target: { value: "REYNALDO ESPINOSA" } });
    fireEvent.change(within(s).getByLabelText("Concepto"), { target: { value: "Adelanto de octubre" } });
    fireEvent.change(within(s).getByLabelText("Monto por mes"), { target: { value: "250" } });
    fireEvent.change(within(s).getByLabelText("Desde"), { target: { value: "2026-10-01" } });
    fireEvent.change(within(s).getByLabelText("Hasta"), { target: { value: "2026-12-01" } });
    fireEvent.click(within(s).getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(llamadas.some((l) => l.method === "POST" && l.url.includes("/descuentos-fijos"))).toBe(true));
    const post = llamadas.find((l) => l.method === "POST" && l.url.includes("/descuentos-fijos"))!;
    expect(post.body).toEqual({
      vendedor_nombre: "REYNALDO ESPINOSA",
      empresa_key: "vistana",
      concepto: "Adelanto de octubre",
      monto: 250,
      desde: "2026-10-01",
      hasta: "2026-12-01",
    });
  });

  it("sin vendedor, sin concepto o sin monto NO se guarda, y se dice qué falta", async () => {
    render(<ComisionesConfiguracionView />);
    await screen.findByText(ROTULO_DESCUENTOS);
    const s = seccion("descuentos-titulo");
    fireEvent.click(within(s).getByRole("button", { name: "+ Agregar" }));
    await within(s).findByTestId("alta-descuento");
    expect((within(s).getByRole("button", { name: "Guardar" }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(s).getByText("Falta elegir el vendedor")).toBeTruthy();
    fireEvent.change(within(s).getByLabelText("Vendedor"), { target: { value: "EDWIN" } });
    expect(within(s).getByText("Falta el concepto")).toBeTruthy();
  });

  it("🔴 el desplegable NO ofrece a los retirados ni a quien no se le paga", async () => {
    render(<ComisionesConfiguracionView />);
    await screen.findByText(ROTULO_DESCUENTOS);
    const s = seccion("descuentos-titulo");
    fireEvent.click(within(s).getByRole("button", { name: "+ Agregar" }));
    await within(s).findByTestId("alta-descuento");
    const opciones = within(s).getAllByRole("option").map((o) => o.textContent);
    expect(opciones).not.toContain("Rey Stoute Aguas");
    expect(opciones).not.toContain("Daniel Levy");
    expect(opciones).not.toContain("Oficina (DEFAULT)");
  });

  it("🔴 quitar es SOFT DELETE con confirmación: DELETE a la ruta, y la ruta apaga `activo`", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ComisionesConfiguracionView />);
    await screen.findByText("Descuento de adelanto");
    const s = seccion("descuentos-titulo");
    fireEvent.click(within(s).getByRole("button", { name: /Quitar Descuento de adelanto/ }));
    await screen.findByText("¿Quitar este descuento?");
    // Dice a quién y cuánto deja de restársele, antes de confirmar.
    expect(screen.getByText(/A Reynaldo Espinosa deja de restársele \$173\.08 por mes en Fashion Shoes/)).toBeTruthy();
    // Sin confirmar no hay DELETE (el botón rojo se habilita a 1 s).
    await act(async () => { vi.advanceTimersByTime(50); });
    expect(llamadas.some((l) => l.method === "DELETE")).toBe(false);
    await act(async () => { vi.advanceTimersByTime(1100); });
    const quitar = screen.getByRole("button", { name: "Quitar", exact: true });
    await waitFor(() => expect((quitar as HTMLButtonElement).disabled).toBe(false));
    await act(async () => { fireEvent.click(quitar); });
    await waitFor(() => expect(llamadas.some((l) => l.method === "DELETE" && l.url.includes("/descuentos-fijos?id="))).toBe(true));
    vi.useRealTimers();

    // 🔴 NUNCA un DELETE de verdad sobre la tabla: es historial de decisiones
    // sobre plata. (Se barre el código sin comentarios: el encabezado nombra
    // `.delete()` justamente para explicar que no se usa.)
    const ruta = leer("src/app/api/ventas/comisiones/descuentos-fijos/route.ts");
    const codigo = ruta.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
    expect(codigo).not.toMatch(/\.delete\(/);
    expect(codigo).toContain("activo: false");
  });
});

// ═══ 3. Los 800 y el molde ═══════════════════════════════════════════════════
describe("🔴 el archivo se partió y las tres tarjetas comparten molde", () => {
  const archivos = [
    "src/components/ventas/ComisionesConfiguracionView.tsx",
    "src/components/ventas/comisiones-config/TasasPorVendedor.tsx",
    "src/components/ventas/comisiones-config/ClientesQueNoComisionan.tsx",
    "src/components/ventas/comisiones-config/Descuentos.tsx",
  ];

  it("ninguno pasa las 800 líneas de la casa", () => {
    for (const a of archivos) {
      expect(leer(a).split("\n").length, a).toBeLessThan(800);
    }
  });

  it("las tres tarjetas son <section> con borde, sin sombra (Design System)", () => {
    for (const a of archivos.slice(1)) {
      expect(leer(a), a).toContain('<section className="rounded-lg border border-gray-200 bg-white p-4 sm:p-5"');
      expect(leer(a), a).not.toMatch(/shadow-(sm|md|lg)/);
    }
  });

  it("la pestaña las dibuja en orden y no calcula ningún número", () => {
    const shell = leer(archivos[0]);
    expect(shell.indexOf("<TasasPorVendedor")).toBeLessThan(shell.indexOf("<ClientesQueNoComisionan"));
    expect(shell.indexOf("<ClientesQueNoComisionan")).toBeLessThan(shell.indexOf("<Descuentos"));
  });
});
