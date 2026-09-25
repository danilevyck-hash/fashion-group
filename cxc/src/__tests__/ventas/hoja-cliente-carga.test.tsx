// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO — LA HOJA DEL CLIENTE CARGA SUS TRES DATOS EN EL TELÉFONO
// (25-sep-2026). Esto NO es un cambio de pantalla: es un defecto, y por eso va
// sin interruptor.
//
// 🩸 QUÉ PASABA, medido el 25-sep-2026 contra producción: tocando la tarjeta de
// un cliente en el teléfono, tres veces seguidas, quedaban **3 barras grises y
// CERO peticiones** a `/api/clientes/<codigo>/historial-mensual`, esperando 30
// segundos. En la computadora, los mismos 3 clientes: **3 peticiones, las 3
// buenas**. Lo que no llegaba era «Últimos 12 meses», «12 meses anteriores» y
// «Recurrencia».
//
// 🔑 LA CAUSA, y por qué solo pasaba en el teléfono. `loadHistorial` decidía si
// pedir con una variable que llenaba el actualizador de `setHistorialCache`, y
// ese actualizador **solo corre en el acto** cuando React puede calcular el
// estado por adelantado — y solo puede cuando la fibra de la pantalla no tiene
// ya un cambio pendiente. En el teléfono siempre lo tiene: tocar la tarjeta
// llama antes a `setSheetCliente`, que es un cambio de estado de ESA MISMA
// pantalla. Entonces el actualizador quedaba para después, la variable seguía
// en `false` y la función se iba antes del `fetch`. Y el segundo toque era
// peor: el estado ya decía «cargando», así que tampoco entraba. En la
// computadora el globo de Radix no toca el estado de la pantalla primero, y por
// eso ahí sí pedía.
//
// Lo que este candado sostiene:
//   1. La decisión de pedir la toma un `ref`, NUNCA el resultado de un
//      `setState`: se marca antes de pedir y se limpia al terminar.
//   2. El primer toque pide UNA vez.
//   3. Tocar dos veces seguidas mientras el pedido está en el aire NO pide dos
//      veces.
//   4. Lo que ya llegó bien no se vuelve a pedir.
//   5. Un pedido que falló SÍ se vuelve a intentar al toque siguiente.
//   6. La hoja del celular no pide nada por su cuenta: recibe lo cargado y
//      dispara al padre una sola vez al montarse.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

const RAIZ = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
const FUENTE = leer("src/components/ventas/ClientesView.tsx");

// ─────────────────────────────────────────────────────────────────────────────
// 1 · La regla, leída en la fuente: quién decide
// ─────────────────────────────────────────────────────────────────────────────

describe("quién decide si se pide el historial", () => {
  it("decide el `ref`, y se marca ANTES de pedir", () => {
    // El `ref` se consulta primero y se marca antes del `fetch`.
    const orden = FUENTE.indexOf("histInFlight.current.add(histKey)");
    const elFetch = FUENTE.indexOf("historial-mensual?empresa=");
    expect(orden).toBeGreaterThan(-1);
    expect(elFetch).toBeGreaterThan(-1);
    expect(orden).toBeLessThan(elFetch);
  });

  it("🔴 ya no existe la variable que llenaba el actualizador de setState", () => {
    // La mutación que trae el defecto de vuelta: volver a decidir con una
    // variable que React llena cuando quiere.
    expect(FUENTE).not.toMatch(/let\s+trigger\s*=\s*false/);
    expect(FUENTE).not.toMatch(/if\s*\(!trigger\)\s*return/);
  });

  it("lo que ya llegó bien tiene su propia marca, y también es un `ref`", () => {
    expect(FUENTE).toMatch(/yaCargado\s*=\s*useRef<Set<string>>/);
    expect(FUENTE).toContain("yaCargado.current.add(histKey)");
    expect(FUENTE).toContain("if (yaCargado.current.has(histKey)) return;");
  });

  it("la hoja del celular no pide nada por su cuenta", () => {
    const hoja = leer("src/components/ventas/ClienteSheet.tsx");
    expect(hoja).not.toContain("historial-mensual");
    expect(hoja).not.toMatch(/\bfetch\(/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2 · La conducta, ejecutando la MISMA regla
// ─────────────────────────────────────────────────────────────────────────────
//
// Se reconstruye el cargador con la regla nueva y se lo corre con un `setState`
// que se porta como el de React **cuando la fibra tiene trabajo pendiente**: el
// actualizador NO corre en el acto, sino en la próxima vuelta. Ése es el caso
// del teléfono, y el único en el que el defecto aparecía.

type Estado = { status: "idle" | "loading" | "ready" | "error" };

function cargadorConLaReglaNueva(pedir: (url: string) => Promise<unknown>) {
  const enElAire = new Set<string>();
  const yaCargado = new Set<string>();
  const cache: Record<string, Estado> = {};
  const pendientes: (() => void)[] = [];
  // El `setState` del teléfono: difiere el actualizador, como React cuando la
  // fibra ya tiene un cambio encolado (el `setSheetCliente` del toque).
  const setCache = (fn: (prev: Record<string, Estado>) => Record<string, Estado>) => {
    pendientes.push(() => Object.assign(cache, fn({ ...cache })));
  };
  const vaciar = () => { while (pendientes.length) pendientes.shift()!(); };

  const cargar = (codigo: string, empresaKey: string) => {
    const llave = `${codigo}|${empresaKey}`;
    if (enElAire.has(llave)) return;
    if (yaCargado.has(llave)) return;
    enElAire.add(llave);
    setCache(prev => (prev[llave]?.status === "ready" ? prev : { ...prev, [llave]: { status: "loading" } }));
    return pedir(`/api/clientes/${codigo}/historial-mensual?empresa=${empresaKey}`)
      .then(() => { yaCargado.add(llave); setCache(prev => ({ ...prev, [llave]: { status: "ready" } })); })
      .catch(() => { setCache(prev => ({ ...prev, [llave]: { status: "error" } })); })
      .finally(() => { enElAire.delete(llave); });
  };

  return { cargar, cache, vaciar, enElAire, yaCargado };
}

describe("la conducta en el teléfono", () => {
  beforeEach(() => vi.useRealTimers());
  afterEach(() => vi.restoreAllMocks());

  it("🔴 el primer toque pide UNA vez, con el actualizador diferido", async () => {
    const pedir = vi.fn().mockResolvedValue({ total_12m: 1 });
    const c = cargadorConLaReglaNueva(pedir);
    await c.cargar("D-25", "fashion_wear");
    expect(pedir).toHaveBeenCalledTimes(1);
    expect(pedir).toHaveBeenCalledWith(
      "/api/clientes/D-25/historial-mensual?empresa=fashion_wear",
    );
  });

  it("dos toques mientras el pedido está en el aire piden UNA sola vez", async () => {
    let resolver: (v: unknown) => void = () => {};
    const pedir = vi.fn(() => new Promise((res) => { resolver = res; }));
    const c = cargadorConLaReglaNueva(pedir);
    const a = c.cargar("D-25", "fashion_wear");
    c.cargar("D-25", "fashion_wear");
    expect(pedir).toHaveBeenCalledTimes(1);
    resolver({});
    await a;
  });

  it("lo que ya llegó bien no se vuelve a pedir", async () => {
    const pedir = vi.fn().mockResolvedValue({});
    const c = cargadorConLaReglaNueva(pedir);
    await c.cargar("D-25", "fashion_wear");
    await c.cargar("D-25", "fashion_wear");
    expect(pedir).toHaveBeenCalledTimes(1);
  });

  it("🔴 un pedido que falló SE VUELVE A INTENTAR al toque siguiente", async () => {
    const pedir = vi.fn()
      .mockRejectedValueOnce(new Error("sin red"))
      .mockResolvedValueOnce({});
    const c = cargadorConLaReglaNueva(pedir);
    await c.cargar("D-25", "fashion_wear");
    c.vaciar();
    expect(c.cache["D-25|fashion_wear"].status).toBe("error");
    await c.cargar("D-25", "fashion_wear");
    expect(pedir).toHaveBeenCalledTimes(2);
    c.vaciar();
    expect(c.cache["D-25|fashion_wear"].status).toBe("ready");
  });

  it("🩸 la regla VIEJA no pedía nunca con el actualizador diferido", async () => {
    // El defecto, reproducido: decidir con la variable que llena el
    // actualizador. Con el `setState` del teléfono, `trigger` sigue en `false`.
    const pedir = vi.fn().mockResolvedValue({});
    const pendientes: (() => void)[] = [];
    const cache: Record<string, Estado> = {};
    const setCache = (fn: (p: Record<string, Estado>) => Record<string, Estado>) => {
      pendientes.push(() => Object.assign(cache, fn({ ...cache })));
    };
    const cargarViejo = (llave: string) => {
      let trigger = false;
      setCache(prev => {
        if (prev[llave] && prev[llave].status !== "idle") return prev;
        trigger = true;
        return { ...prev, [llave]: { status: "loading" } };
      });
      if (!trigger) return;
      void pedir(llave);
    };
    cargarViejo("D-25|fashion_wear");
    expect(pedir).toHaveBeenCalledTimes(0); // ← 3 toques, 0 peticiones
    while (pendientes.length) pendientes.shift()!();
    cargarViejo("D-25|fashion_wear");
    expect(pedir).toHaveBeenCalledTimes(0); // ← y el segundo toque, peor
  });
});
