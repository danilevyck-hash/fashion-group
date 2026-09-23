/**
 * CANDADO — MARKETING › LA PUERTA «＋ Gasto» (pieza A del rediseño, 22-sep-2026).
 *
 * Lo que Daniel definió y este archivo no deja aflojar:
 *   1. La puerta ofrece EXACTAMENTE los tres tipos de `gasto.ts`, en su orden.
 *   2. UNA marca, obligatoria: sin marca no se sigue en la pantalla («Falta: la
 *      marca») y el servidor contesta 400 antes de escribir nada.
 *   3. La tienda es obligatoria si el gasto «es de una tienda»; «General» no
 *      pide nada. Desde una tienda ya elegida no se pregunta.
 *   4. «Se reporta a la marca» nace PRENDIDA.
 *   5. El duplicado (proveedor normalizado + monto + fecha) lo frena el
 *      SERVIDOR: 400 con `duplicado: true`, y no escribe. En impulsadora la
 *      fecha es `periodo_desde`.
 *   6. Las tres columnas del rediseño viajan en el MISMO guardado y solo si la
 *      pantalla las mandó (la pantalla de antes no las manda).
 *   7. Con `MARKETING_PUERTA_GASTO` en `false`, `RegistrarGastoModal` es la
 *      pantalla de antes, sin un cambio.
 *
 * Mutaciones a mano (22-sep-2026): ver `docs/postmortems/marketing-rediseno.md` § A.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "test-anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-key";
  process.env.SESSION_SECRET ||= "test-secret";
});

// ── La base de mentira: filas por tabla + registro de ESCRITURAS ────────────
const db = vi.hoisted(() => ({
  filas: {} as Record<string, Array<Record<string, unknown>>>,
  escrituras: [] as Array<{ tabla: string; op: string; payload: unknown }>,
  reiniciar() {
    this.filas = {};
    this.escrituras = [];
  },
}));

vi.mock("@/lib/supabase-server", () => {
  type Q = {
    op: string;
    payload: unknown;
    filtros: Array<[string, unknown]>;
    unico: boolean;
  };
  function consulta(tabla: string) {
    const q: Q = { op: "select", payload: null, filtros: [], unico: false };
    const filtrar = () => {
      let rows = db.filas[tabla] ?? [];
      for (const [col, val] of q.filtros) rows = rows.filter((r) => (r[col] ?? null) === val);
      return rows;
    };
    const resolver = () => {
      if (q.op === "select") {
        const rows = filtrar();
        return { data: q.unico ? (rows[0] ?? null) : rows, error: null };
      }
      db.escrituras.push({ tabla, op: q.op, payload: q.payload });
      if (q.op === "insert") {
        return { data: { id: `${tabla}-${db.escrituras.length}`, ...(q.payload as object) }, error: null };
      }
      return { data: q.unico ? { id: "x" } : [], error: null };
    };
    const chain: Record<string, unknown> = new Proxy(q as unknown as Record<string, unknown>, {
      get(target, prop) {
        const t = target as unknown as Q;
        if (prop === "then") {
          return (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
            Promise.resolve(resolver()).then(res, rej);
        }
        if (prop === "insert" || prop === "update" || prop === "delete") {
          return (p?: unknown) => {
            t.op = prop;
            t.payload = p ?? null;
            return chain;
          };
        }
        if (prop === "eq" || prop === "is") {
          return (col: string, val: unknown) => {
            t.filtros.push([col, val]);
            return chain;
          };
        }
        if (prop === "single" || prop === "maybeSingle") {
          return () => {
            t.unico = true;
            return chain;
          };
        }
        if (typeof prop === "string") return () => chain;
        return undefined;
      },
    });
    return chain;
  }
  return {
    supabaseServer: { from: consulta, storage: { from: () => ({}) } },
    HAS_SERVICE_ROLE: true,
  };
});

vi.mock("@/lib/requireRole", () => ({
  requireRole: () => ({ role: "admin", userId: "u-1", userName: "Daniel" }),
}));
vi.mock("@/lib/log-activity", () => ({ logActivity: vi.fn(async () => {}) }));
const marcasEscritas = vi.hoisted(() => ({ llamadas: [] as unknown[] }));
vi.mock("@/lib/marketing/factura-marcas", () => ({
  setMarcasDeFactura: vi.fn(async (id: string, marcas: unknown) => {
    marcasEscritas.llamadas.push({ id, marcas });
  }),
  getMarcasDeFactura: vi.fn(async () => []),
}));

// ── El interruptor, con perilla para el CONTROL ──────────────────────────────
const perilla = vi.hoisted(() => ({ encendido: true }));
vi.mock("@/lib/marketing/puerta-gasto", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/marketing/puerta-gasto")>();
  return {
    ...real,
    get MARKETING_PUERTA_GASTO() {
      return perilla.encendido;
    },
  };
});

// La factura en PDF obligatoria la cubre `marketing-pdf-en-la-puerta.test.tsx`;
// acá se dobla para poder llegar a «Guardar factura» sin subir un archivo.
vi.mock("@/lib/marketing/pdf-en-la-puerta", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/marketing/pdf-en-la-puerta")>();
  return { ...real, faltaLaFactura: () => null };
});

// Los dos modales propios se doblan para AFIRMAR qué recibieron de la puerta.
vi.mock("@/components/marketing/EntregaForm", () => ({
  default: (p: { marcaFija?: boolean; gasto?: unknown; proyectoId: unknown; marcasProyecto: Array<{ marca: { id: string } }> }) => (
    <div
      data-testid="entrega-form"
      data-marca-fija={String(!!p.marcaFija)}
      data-proyecto={String(p.proyectoId)}
      data-marca={p.marcasProyecto[0]?.marca.id ?? ""}
      data-gasto={JSON.stringify(p.gasto ?? null)}
    />
  ),
}));
vi.mock("@/app/marketing/components/RegistrarPagoModal", () => ({
  default: (p: { impulsadora: { nombre: string }; gasto?: unknown }) => (
    <div data-testid="registrar-pago-modal" data-gasto={JSON.stringify(p.gasto ?? null)}>
      Pago a {p.impulsadora.nombre}
    </div>
  ),
}));

import { ToastProvider } from "@/components/ToastSystem";
import RegistrarGastoModal from "@/app/marketing/components/RegistrarGastoModal";
import { invalidarDirectorioClientes } from "@/lib/hooks/useBusquedaClientes";
import { ROTULO_DE_TIPO, SE_REPORTA_POR_DEFECTO, TIPOS_DE_GASTO } from "@/lib/marketing/gasto";
import {
  OPCIONES_DE_TIPO,
  columnasDelGasto,
  datosPorDefecto,
  esErrorDeDuplicado,
  paraGuardar,
  queFaltaEnLaPuerta,
  resumenDelGasto,
  textoFaltaEnLaPuerta,
} from "@/lib/marketing/puerta-gasto";
import { frenarFacturaDuplicada, frenarPagoDuplicado } from "@/lib/marketing/puerta-gasto-server";
import { createFactura } from "@/lib/marketing/mutations";
import { POST as postFactura } from "@/app/api/marketing/facturas/route";
import type { MkMarca } from "@/lib/marketing/types";

const RAIZ = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

const MARCAS: MkMarca[] = [
  { id: "m-th", codigo: "TH", nombre: "Tommy Hilfiger" } as MkMarca,
  { id: "m-ck", codigo: "CK", nombre: "Calvin Klein" } as MkMarca,
];
const DIRECTORIO = [
  { codigo: "D-30", nombre: "City Moda Chorrera" },
  { codigo: "D-24", nombre: "City Mall David" },
];

interface Llamada {
  url: string;
  metodo: string;
  cuerpo: Record<string, unknown> | null;
}

function instalarFetch(opts: { facturaResponde?: { ok: boolean; status: number; body: unknown } } = {}) {
  const llamadas: Llamada[] = [];
  const fn = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    let cuerpo: Record<string, unknown> | null = null;
    if (typeof init?.body === "string") {
      try {
        cuerpo = JSON.parse(init.body) as Record<string, unknown>;
      } catch {
        cuerpo = null;
      }
    }
    const metodo = (init?.method ?? "GET").toUpperCase();
    llamadas.push({ url, metodo, cuerpo });
    const json = (body: unknown, ok = true, status = 200) => ({ ok, status, json: async () => body });
    if (url.includes("/api/marketing/impulsadoras")) {
      return json([
        { id: "i1", nombre: "Ana Trejos", monto_mensual: 800, marcas: [{ marca: MARCAS[0], porcentaje: 100 }], mesActual: null },
      ]);
    }
    if (url.includes("/api/marketing/inventario/productos")) return json([]);
    if (url.includes("/api/marketing/facturas/proveedores")) {
      return json({ proveedores: ["Impresora Comercial, S.A.", "Impresora Comercial", "Premium Paint"] });
    }
    if (url.includes("check-duplicate")) return json({ existe: false, facturas: [] });
    if (url.includes("/api/marketing/facturas") && metodo === "POST") {
      const r = opts.facturaResponde;
      return r ? json(r.body, r.ok, r.status) : json({ id: "f-1" });
    }
    if (url.includes("/api/clientes")) return json({ clientes: DIRECTORIO, total: DIRECTORIO.length });
    return json({});
  });
  vi.stubGlobal("fetch", fn);
  return llamadas;
}

function abrir(
  props: {
    marcaInicial?: MkMarca | null;
    tiendaInicial?: { codigo: string; nombre: string } | null;
    tiendaCodigo?: string | null;
  } = {},
) {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  render(
    <ToastProvider>
      <RegistrarGastoModal
        marcas={MARCAS}
        marcaInicial={props.marcaInicial ?? null}
        tiendaInicial={props.tiendaInicial ?? null}
        tiendaCodigo={props.tiendaCodigo ?? null}
        onClose={onClose}
        onSaved={onSaved}
      />
    </ToastProvider>,
  );
  return { onClose, onSaved };
}

const tipo = (k: string) => document.querySelector(`[data-tipo="${k}"]`) as HTMLElement;
const continuar = () => screen.getByRole("button", { name: "Continuar" }) as HTMLButtonElement;
const selectMarca = () => document.querySelector('select[name="marca"]') as HTMLSelectElement;
const casillaReporta = () => document.querySelector('input[name="se-reporta"]') as HTMLInputElement;
const falta = () => screen.queryByTestId("falta-para-continuar")?.textContent ?? "";

async function elegirTienda(nombre = "City Moda Chorrera") {
  const campo = screen.getByPlaceholderText("Busca la tienda…") as HTMLInputElement;
  fireEvent.focus(campo);
  fireEvent.change(campo, { target: { value: nombre.slice(0, 4) } });
  await waitFor(() => expect(screen.getByText(nombre)).toBeTruthy());
  fireEvent.mouseDown(screen.getByText(nombre));
}

let llamadas: Llamada[];

beforeEach(() => {
  perilla.encendido = true;
  db.reiniciar();
  marcasEscritas.llamadas = [];
  invalidarDirectorioClientes();
  llamadas = instalarFetch();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// ═════════════════════════════════════════════════════════════════════════════
describe("1 · 🔴 la puerta ofrece EXACTAMENTE los tres tipos de gasto.ts", () => {
  it("las opciones se DERIVAN de la lista cerrada, en su orden y con su rótulo", () => {
    expect(OPCIONES_DE_TIPO.map((o) => o.key)).toEqual([...TIPOS_DE_GASTO]);
    expect(OPCIONES_DE_TIPO).toHaveLength(3);
    for (const o of OPCIONES_DE_TIPO) expect(o.titulo).toBe(ROTULO_DE_TIPO[o.key]);
  });

  it("en pantalla hay tres botones, uno por tipo, y ninguno de los caminos viejos", () => {
    abrir();
    expect(screen.getByText("¿Qué es el gasto?")).toBeTruthy();
    expect(document.querySelectorAll("[data-tipo]")).toHaveLength(3);
    for (const t of TIPOS_DE_GASTO) expect(tipo(t).textContent).toContain(ROTULO_DE_TIPO[t]);
    expect(document.querySelector("[data-camino]")).toBeNull();
    expect(screen.queryByText("Gasto de la marca")).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("2 · 🔴 sin marca no se sigue, y el botón apagado DICE qué falta", () => {
  it("la regla pura: la marca siempre; la tienda solo si «es de una tienda»", () => {
    const d = datosPorDefecto("factura");
    expect(queFaltaEnLaPuerta({ tipo: "factura", datos: d })).toEqual(["marca", "tienda"]);
    expect(textoFaltaEnLaPuerta(["marca", "tienda"])).toBe("Falta: la marca y la tienda");
    expect(queFaltaEnLaPuerta({ tipo: "factura", datos: { ...d, marcaId: "m-th", esDeTienda: false } })).toEqual([]);
    expect(queFaltaEnLaPuerta({ tipo: "mueble", datos: { ...d, marcaId: "m-th", tiendaCodigo: "D-30" } })).toEqual([]);
    // En impulsadora la marca es la de ella: lo que falta es a quién se le paga.
    expect(queFaltaEnLaPuerta({ tipo: "impulsadora", datos: datosPorDefecto("impulsadora") })).toEqual(["impulsadora"]);
    expect(queFaltaEnLaPuerta({ tipo: "impulsadora", datos: datosPorDefecto("impulsadora"), impulsadoraId: "i1" })).toEqual([]);
    expect(queFaltaEnLaPuerta({ tipo: "proyecto", datos: d })).toEqual(["tipo"]);
    expect(textoFaltaEnLaPuerta([])).toBe("");
  });

  it("Factura: Continuar apagado con «Falta: la marca y la tienda»; con marca queda la tienda; con General se enciende", async () => {
    abrir();
    fireEvent.click(tipo("factura"));
    expect(continuar().disabled).toBe(true);
    expect(falta()).toBe("Falta: la marca y la tienda");
    fireEvent.change(selectMarca(), { target: { value: "m-th" } });
    expect(falta()).toBe("Falta: la tienda");
    expect(continuar().disabled).toBe(true);
    fireEvent.click(document.querySelector('[data-tienda="general"]')!);
    expect(falta()).toBe("");
    expect(continuar().disabled).toBe(false);
  });

  it("🔴 el servidor: `marcaId` vacío contesta 400 y NO escribe nada", async () => {
    const res = await postFactura(peticionFactura({ marcaId: "" }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/necesita una marca/);
    expect(db.escrituras).toEqual([]);
    expect(marcasEscritas.llamadas).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("3 · 🔴 la tienda: del directorio, obligatoria si es de una tienda; desde una tienda no se pregunta", () => {
  it("elegida de la lista enciende Continuar y el formulario la dice con su código", async () => {
    abrir();
    fireEvent.click(tipo("factura"));
    fireEvent.change(selectMarca(), { target: { value: "m-th" } });
    await elegirTienda();
    expect(continuar().disabled).toBe(false);
    fireEvent.click(continuar());
    expect(screen.getByTestId("resumen-del-gasto").textContent).toContain("Tommy Hilfiger · City Moda Chorrera (D-30)");
  });

  it("desde una tienda ya elegida viene puesta: sin buscador, y Continuar se enciende con la marca", () => {
    abrir({ tiendaInicial: { codigo: "D-24", nombre: "City Mall David" } });
    fireEvent.click(tipo("factura"));
    expect(screen.getByTestId("tienda-fija").textContent).toContain("City Mall David");
    expect(screen.queryByPlaceholderText("Busca la tienda…")).toBeNull();
    expect(falta()).toBe("Falta: la marca");
    fireEvent.change(selectMarca(), { target: { value: "m-ck" } });
    expect(continuar().disabled).toBe(false);
  });

  it("por CÓDIGO (la vista de tienda de la pieza B) también viene puesta, y viaja en el guardado", async () => {
    abrir({ tiendaCodigo: "d-24" });
    fireEvent.click(tipo("mueble"));
    expect(screen.getByTestId("tienda-fija").textContent).toContain("D-24");
    expect(screen.queryByPlaceholderText("Busca la tienda…")).toBeNull();
    fireEvent.change(selectMarca(), { target: { value: "m-th" } });
    fireEvent.click(continuar());
    expect(JSON.parse(screen.getByTestId("entrega-form").getAttribute("data-gasto")!)).toMatchObject({ tiendaCodigo: "D-24" });
  });

  it("desde una marca viene puesta con «Cambiar», sin desplegable", () => {
    abrir({ marcaInicial: MARCAS[1] });
    fireEvent.click(tipo("mueble"));
    expect(screen.getByText("Calvin Klein")).toBeTruthy();
    // Dos «Cambiar»: el del tipo (arriba) y el de la marca fija.
    expect(screen.getAllByRole("button", { name: "Cambiar" })).toHaveLength(2);
    expect(selectMarca()).toBeNull();
    expect(falta()).toBe("Falta: la tienda");
  });

  it("`paraGuardar`: con General la tienda va en null aunque haya un código tecleado; el código sale en mayúsculas", () => {
    const d = { ...datosPorDefecto("factura"), tiendaCodigo: "d-30", esDeTienda: false, nota: "  Apertura   tienda " };
    expect(paraGuardar(d)).toEqual({ tiendaCodigo: null, seReporta: true, nota: "Apertura tienda" });
    expect(paraGuardar({ ...d, esDeTienda: true }).tiendaCodigo).toBe("D-30");
    expect(resumenDelGasto({ ...d, esDeTienda: false, seReporta: false }, "Reebok")).toBe("Reebok · General · No se reporta");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("4 · 🔴 «Se reporta a la marca» nace PRENDIDA", () => {
  it("en los datos por defecto de los TRES tipos", () => {
    expect(SE_REPORTA_POR_DEFECTO).toBe(true);
    for (const t of TIPOS_DE_GASTO) expect(datosPorDefecto(t).seReporta).toBe(true);
    // Impulsadora arranca en General; factura y mueble, de una tienda.
    expect(datosPorDefecto("impulsadora").esDeTienda).toBe(false);
    expect(datosPorDefecto("factura").esDeTienda).toBe(true);
  });

  it("y en la pantalla la casilla está marcada al abrir cualquier tipo", () => {
    abrir();
    fireEvent.click(tipo("mueble"));
    expect(casillaReporta().checked).toBe(true);
    expect(screen.queryByTestId("aviso-no-se-reporta")).toBeNull();
    fireEvent.click(casillaReporta());
    expect(casillaReporta().checked).toBe(false);
    expect(screen.getByTestId("aviso-no-se-reporta")).toBeTruthy();
  });

  it("en el servidor solo un `false` explícito apaga, y lo ausente no se escribe", () => {
    expect(columnasDelGasto({})).toEqual({});
    expect(columnasDelGasto({ seReporta: false })).toEqual({ se_reporta: false });
    expect(columnasDelGasto({ seReporta: "no" })).toEqual({ se_reporta: true });
    expect(columnasDelGasto({ tiendaCodigo: " d-30 ", nota: "  Apertura  " })).toEqual({
      tienda_codigo: "D-30",
      nota: "Apertura",
    });
    expect(columnasDelGasto({ tiendaCodigo: "", nota: "" })).toEqual({ tienda_codigo: null, nota: null });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("5 · 🔴 el duplicado lo frena el SERVIDOR: 400 y no escribe", () => {
  const yaEsta = () => {
    db.filas.mk_facturas = [
      {
        id: "f-viva",
        numero_factura: "0000063894",
        proveedor: "Impresora Comercial, S.A.",
        total: 55.64,
        fecha_factura: "2026-06-10",
        anulado_en: null,
        impulsadora_id: null,
      },
    ];
    db.filas.clientes_master = [{ codigo: "D-30" }];
  };

  it("`createFactura` lanza `ErrorGastoDuplicado` con otra grafía y otro número, y no inserta", async () => {
    yaEsta();
    await expect(
      createFactura({
        numeroFactura: "0000063895",
        fechaFactura: "2026-06-10",
        proveedor: "IMPRESORA COMERCIAL S A",
        concepto: "Letrero",
        subtotal: 52,
        itbms: 3.64,
      }),
    ).rejects.toSatisfy((e: unknown) => esErrorDeDuplicado(e) && /No se guarda dos veces/.test(String((e as Error).message)));
    expect(db.escrituras).toEqual([]);
  });

  it("cambia uno de los tres (la fecha) y entra", async () => {
    yaEsta();
    const f = await createFactura({
      numeroFactura: "0000063895",
      fechaFactura: "2026-06-11",
      proveedor: "IMPRESORA COMERCIAL S A",
      concepto: "Letrero",
      subtotal: 52,
      itbms: 3.64,
    });
    expect(f.id).toBeTruthy();
    expect(db.escrituras.filter((e) => e.op === "insert")).toHaveLength(1);
  });

  it("🔴 la ruta contesta 400 con `duplicado: true` y no escribió nada", async () => {
    yaEsta();
    const res = await postFactura(
      peticionFactura({ marcaId: "m-th", proveedor: "Impresora Comercial", subtotal: 52, itbms: 3.64, fechaFactura: "2026-06-10" }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; duplicado?: boolean };
    expect(body.duplicado).toBe(true);
    expect(body.error).toMatch(/Ya existe un gasto de Impresora Comercial, S\.A\. por \$55\.64 del 2026-06-10 \(N° 0000063894\)/);
    expect(db.escrituras).toEqual([]);
    expect(marcasEscritas.llamadas).toEqual([]);
  });

  it("en impulsadora la fecha es `periodo_desde`, no el día en que se cargó", async () => {
    db.filas.mk_facturas = [
      {
        id: "p-1",
        numero_factura: "IMP-2026-08-01",
        proveedor: "Ana Trejos",
        total: 800,
        fecha_factura: "2026-08-04",
        periodo_desde: "2026-08-01",
        impulsadora_id: "i1",
        anulado_en: null,
      },
    ];
    await expect(frenarPagoDuplicado("i1", { proveedor: "ANA TREJOS", monto: 800, fecha: "2026-08-01" })).rejects.toSatisfy(esErrorDeDuplicado);
    // El mismo día de carga con otro período NO es duplicado (7 pagos de Ana el 4-ago).
    await expect(frenarPagoDuplicado("i1", { proveedor: "Ana Trejos", monto: 800, fecha: "2026-09-01" })).resolves.toBeUndefined();
    // Y una factura de proveedor no mira los pagos de impulsadora.
    await expect(frenarFacturaDuplicada({ proveedor: "Ana Trejos", monto: 800, fecha: "2026-08-04" })).resolves.toBeUndefined();
  });

  it("la pantalla dice el 400 tal cual y NO llama a onSaved", async () => {
    vi.unstubAllGlobals();
    llamadas = instalarFetch({
      facturaResponde: { ok: false, status: 400, body: { error: "Ya existe un gasto de Premium Paint por $120.00 del 2026-09-01. No se guarda dos veces.", duplicado: true } },
    });
    const { onSaved } = abrir();
    fireEvent.click(tipo("factura"));
    fireEvent.change(selectMarca(), { target: { value: "m-th" } });
    fireEvent.click(document.querySelector('[data-tienda="general"]')!);
    fireEvent.click(continuar());
    await llenarFactura();
    fireEvent.click(screen.getByRole("button", { name: /Guardar factura/ }));
    await waitFor(() => expect(screen.getByText(/No se guarda dos veces/)).toBeTruthy());
    expect(onSaved).not.toHaveBeenCalled();
    expect(llamadas.filter((l) => l.url.includes("/api/marketing/facturas") && l.metodo === "POST")).toHaveLength(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("6 · 🔴 las tres columnas viajan en el MISMO guardado, y solo si la pantalla las mandó", () => {
  it("Factura: el POST lleva marcaId, tiendaCodigo, seReporta y nota; proyecto en null; sin PUT de marcas ni proyectos", async () => {
    const { onSaved } = abrir();
    fireEvent.click(tipo("factura"));
    fireEvent.change(selectMarca(), { target: { value: "m-ck" } });
    await elegirTienda("City Mall David");
    fireEvent.click(casillaReporta());
    fireEvent.change(document.querySelector('input[name="nota"]')!, { target: { value: "Apertura" } });
    fireEvent.click(continuar());
    await llenarFactura();
    fireEvent.click(screen.getByRole("button", { name: /Guardar factura/ }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const post = llamadas.find((l) => l.url.includes("/api/marketing/facturas") && l.metodo === "POST")!;
    expect(post.cuerpo).toMatchObject({
      proyectoId: null,
      marcaId: "m-ck",
      tiendaCodigo: "D-24",
      seReporta: false,
      nota: "Apertura",
      proveedor: "Premium Paint",
    });
    expect(llamadas.some((l) => /\/facturas\/[^/]+\/marcas/.test(l.url))).toBe(false);
    expect(llamadas.some((l) => l.url.includes("/api/marketing/proyectos"))).toBe(false);
  });

  it("Mueble: EntregaForm recibe la marca FIJA, proyecto null y lo del paso 2", async () => {
    abrir();
    fireEvent.click(tipo("mueble"));
    fireEvent.change(selectMarca(), { target: { value: "m-th" } });
    await elegirTienda();
    fireEvent.click(continuar());
    const form = screen.getByTestId("entrega-form");
    expect(form.getAttribute("data-marca-fija")).toBe("true");
    expect(form.getAttribute("data-proyecto")).toBe("null");
    expect(form.getAttribute("data-marca")).toBe("m-th");
    expect(JSON.parse(form.getAttribute("data-gasto")!)).toEqual({ tiendaCodigo: "D-30", seReporta: true, nota: null });
  });

  it("Impulsadora: la marca es la de ella, y su modal recibe lo del paso 2", async () => {
    abrir();
    fireEvent.click(tipo("impulsadora"));
    expect(falta()).toBe("Falta: a quién le pagas");
    await waitFor(() => expect(document.querySelector('[data-impulsadora="i1"]')).not.toBeNull());
    fireEvent.click(document.querySelector('[data-impulsadora="i1"]')!);
    expect(screen.getByTestId("marca-de-impulsadora").textContent).toContain("Tommy Hilfiger");
    expect(selectMarca()).toBeNull();
    expect(continuar().disabled).toBe(false);
    fireEvent.click(continuar());
    const modal = screen.getByTestId("registrar-pago-modal");
    expect(JSON.parse(modal.getAttribute("data-gasto")!)).toEqual({ tiendaCodigo: null, seReporta: true, nota: null });
  });

  it("🔴 el servidor escribe las tres en la fila y pone la marca en el mismo acto", async () => {
    db.filas.clientes_master = [{ codigo: "D-30" }];
    const res = await postFactura(peticionFactura({ marcaId: "m-th", tiendaCodigo: "d-30", seReporta: false, nota: " Apertura " }));
    expect(res.status).toBe(200);
    const ins = db.escrituras.find((e) => e.tabla === "mk_facturas" && e.op === "insert")!;
    expect(ins.payload).toMatchObject({ se_reporta: false, tienda_codigo: "D-30", nota: "Apertura", proyecto_id: null });
    expect(marcasEscritas.llamadas).toEqual([{ id: expect.any(String), marcas: [{ marcaId: "m-th", porcentaje: 100 }] }]);
  });

  it("⚠️ la pantalla de antes no las manda, y entonces no se escriben (la base pone su DEFAULT)", async () => {
    const res = await postFactura(peticionFactura({}));
    expect(res.status).toBe(200);
    const ins = db.escrituras.find((e) => e.tabla === "mk_facturas" && e.op === "insert")!;
    const p = ins.payload as Record<string, unknown>;
    expect("se_reporta" in p).toBe(false);
    expect("tienda_codigo" in p).toBe(false);
    expect("nota" in p).toBe(false);
    expect(marcasEscritas.llamadas).toEqual([]);
  });

  it("una tienda que no está en el directorio se rechaza con su mensaje", async () => {
    db.filas.clientes_master = [{ codigo: "D-30" }];
    const res = await postFactura(peticionFactura({ marcaId: "m-th", tiendaCodigo: "D-999" }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/D-999 no está en el directorio/);
    expect(db.escrituras).toEqual([]);
  });

  it("candado estático: las tres puertas del servidor leen las columnas por `columnasDelGasto` y las rutas las pasan", () => {
    for (const rel of ["src/lib/marketing/mutations.ts", "src/lib/marketing/inventario.ts", "src/lib/marketing/impulsadoras.ts"]) {
      expect(sinComentarios(leer(rel)), rel).toMatch(/columnasDelGasto\(input\)/);
      expect(sinComentarios(leer(rel)), rel).toMatch(/conRespaldoSinColumnas\(/);
    }
    for (const rel of [
      "src/app/api/marketing/facturas/route.ts",
      "src/app/api/marketing/inventario/entregas/route.ts",
      "src/app/api/marketing/impulsadoras/[id]/pagos/route.ts",
    ]) {
      const src = sinComentarios(leer(rel));
      expect(src, rel).toMatch(/seReporta: body\.seReporta/);
      expect(src, rel).toMatch(/tiendaCodigo: body\.tiendaCodigo/);
      expect(src, rel).toMatch(/nota: body\.nota/);
    }
    // El módulo puro de la puerta no conoce el proyecto (extiende el candado 7 del cimiento).
    expect(sinComentarios(leer("src/lib/marketing/puerta-gasto.ts"))).not.toMatch(/proyecto_?[iI]d/);
    expect(sinComentarios(leer("src/app/marketing/components/PuertaGasto.tsx"))).not.toMatch(/api\/marketing\/proyectos/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("7 · 🔴 CONTROL — con MARKETING_PUERTA_GASTO en false es la pantalla de antes", () => {
  beforeEach(() => {
    perilla.encendido = false;
  });

  it("los tres caminos viejos, con «Gasto de la marca», y ningún botón por tipo", () => {
    abrir();
    expect(document.querySelectorAll("[data-camino]")).toHaveLength(3);
    expect(screen.getByText("Gasto de la marca")).toBeTruthy();
    expect(document.querySelector("[data-tipo]")).toBeNull();
    expect(selectMarca()).toBeNull();
  });

  it("y el freno del servidor no corre: el mismo gasto entra como hoy", async () => {
    db.filas.mk_facturas = [
      { id: "f-viva", numero_factura: "1", proveedor: "Premium Paint", total: 120, fecha_factura: "2026-09-01", anulado_en: null, impulsadora_id: null },
    ];
    await expect(frenarFacturaDuplicada({ proveedor: "Premium Paint", monto: 120, fecha: "2026-09-01" })).resolves.toBeUndefined();
  });

  it("candado estático: `RegistrarGastoModal` elige por el interruptor y la pantalla vieja sigue entera", () => {
    const src = sinComentarios(leer("src/app/marketing/components/RegistrarGastoModal.tsx"));
    expect(src).toMatch(/if \(MARKETING_PUERTA_GASTO\) return <PuertaGasto \{\.\.\.props\} \/>;/);
    expect(src).toMatch(/return <RegistrarGastoModalAnterior \{\.\.\.props\} \/>;/);
    expect(src).toContain("permitirOtro={false}");
  });
});

// ── Ayudas ───────────────────────────────────────────────────────────────────

function peticionFactura(extra: Record<string, unknown>): NextRequest {
  const cuerpo = {
    numeroFactura: "F-100",
    fechaFactura: "2026-09-01",
    proveedor: "Premium Paint",
    concepto: "Pintura",
    subtotal: 120,
    itbms: 0,
    ...extra,
  };
  return new NextRequest("http://localhost/api/marketing/facturas", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
}

async function llenarFactura() {
  await waitFor(() => expect(document.querySelector("#factura-numero")).not.toBeNull());
  fireEvent.change(document.querySelector("#factura-numero")!, { target: { value: "F-100" } });
  fireEvent.change(document.querySelector("#factura-fecha")!, { target: { value: "2026-09-01" } });
  fireEvent.change(document.querySelector("#factura-proveedor")!, { target: { value: "Premium Paint" } });
  fireEvent.change(document.querySelector("#factura-concepto")!, { target: { value: "Pintura" } });
  fireEvent.change(document.querySelector("#factura-subtotal")!, { target: { value: "120" } });
  await waitFor(() =>
    expect((screen.getByRole("button", { name: /Guardar factura/ }) as HTMLButtonElement).disabled).toBe(false),
  );
}
