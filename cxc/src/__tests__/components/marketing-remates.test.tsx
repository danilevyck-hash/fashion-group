/**
 * CANDADO — MARKETING › LOS TRES REMATES DEL REDISEÑO (22-sep-2026).
 *
 * Los tres pendientes que dejaron las piezas A, B y D, y que este archivo no
 * deja aflojar:
 *
 *   1. EDITAR UN GASTO CONSERVA —Y DEJA CAMBIAR— SU TIENDA, SU «se reporta» Y
 *      SU NOTA. 🩸 Las rutas de edición no las mandaban: se podía poner la
 *      tienda al crear el gasto y nunca más corregirla. 🔴 Lo que NO viaja no
 *      se pisa (`columnasDelGasto` solo escribe lo que vino), y al editar el
 *      freno de duplicados NO se cuenta a sí mismo.
 *   2. EL MUEBLE TIENE FOTO, COLGADA DE LA TIENDA. 🩸 «＋ Gasto › Mueble» no
 *      ofrecía foto porque sin proyecto no había de dónde colgarla; hoy cuelga
 *      de `mk_adjuntos.tienda_codigo` y, en «General», del cajón
 *      `TIENDA_GENERAL`.
 *   3. LA PANTALLA DEL PERÍODO LISTA LO QUE YA SE LE MANDÓ A LA MARCA.
 *      🔴 Sin ZIPs anotados NO se dibuja nada (medido el 22-sep-2026: los 6
 *      períodos tienen `zips_bajados = []`), y «Volver a firmar» llama a
 *      `POST /api/marketing/zip/firmar-de-nuevo` — no vuelve a armar el ZIP.
 *
 * Mutaciones a mano: ver `docs/postmortems/marketing-rediseno.md` § remates.
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
  type Q = { op: string; payload: unknown; filtros: Array<[string, unknown]>; unico: boolean };
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

// La entrega es un motor grande (stock, precios, sellos): acá se dobla para
// AFIRMAR qué le pasa la ruta de edición, que es lo que este candado cuida.
const entregaRecibida = vi.hoisted(() => ({ input: null as unknown }));
vi.mock("@/lib/marketing/inventario", () => ({
  updateEntrega: vi.fn(async (_id: string, input: unknown) => {
    entregaRecibida.input = input;
    return { id: "e-1" };
  }),
  deleteEntrega: vi.fn(async () => {}),
}));

// Los formularios propios de la puerta se doblan: acá se prueba el PASO 2.
vi.mock("@/components/marketing/EntregaForm", () => ({
  default: () => <div data-testid="entrega-form" />,
}));
vi.mock("@/app/marketing/components/RegistrarPagoModal", () => ({
  default: () => <div data-testid="registrar-pago-modal" />,
}));

import { ToastProvider } from "@/components/ToastSystem";
import RegistrarGastoModal from "@/app/marketing/components/RegistrarGastoModal";
import ZipsBajados from "@/app/marketing/components/ZipsBajados";
import { invalidarDirectorioClientes } from "@/lib/hooks/useBusquedaClientes";
import { TIENDA_GENERAL } from "@/lib/marketing/gasto";
import {
  columnasQueVinieron,
  cuerpoDeLaEdicion,
  datosDeLaFila,
  traeAlgoDelGasto,
} from "@/lib/marketing/editar-gasto";
import {
  DIAS_DEL_LINK,
  cuandoSeBajo,
  hayZipsQueMostrar,
  loQueLlevaba,
  quienLoBajo,
  zipsDelPeriodo,
} from "@/lib/marketing/zips-del-periodo";
import { updateFactura } from "@/lib/marketing/mutations";
import { PATCH as patchEntrega } from "@/app/api/marketing/inventario/entregas/[id]/route";
import { GET as getPeriodo } from "@/app/api/marketing/periodos/[id]/route";
import type { MkMarca } from "@/lib/marketing/types";

const RAIZ = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

const MARCAS: MkMarca[] = [
  { id: "m-th", codigo: "TH", nombre: "Tommy Hilfiger" } as MkMarca,
  { id: "m-ck", codigo: "CK", nombre: "Calvin Klein" } as MkMarca,
];

const UUID = "11111111-1111-4111-8111-111111111111";

function pedir(body: unknown): NextRequest {
  return new NextRequest("http://x/api/marketing/inventario/entregas/" + UUID, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** El último `update` que se le hizo a una tabla. */
function ultimoUpdate(tabla: string): Record<string, unknown> | null {
  const w = [...db.escrituras].reverse().find((e) => e.tabla === tabla && e.op === "update");
  return (w?.payload as Record<string, unknown>) ?? null;
}

beforeEach(() => {
  db.reiniciar();
  entregaRecibida.input = null;
  db.filas["clientes_master"] = [
    { codigo: "D-24", nombre: "City Mall David" },
    { codigo: "D-30", nombre: "City Moda Chorrera" },
  ];
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// ════════════════════════════════════════════════════════════════════════════
describe("1. editar un gasto: lo que NO viaja no se pisa", () => {
  it("del cuerpo salen SOLO las claves presentes", () => {
    expect(columnasQueVinieron({ items: [], marcas: [] })).toEqual({});
    expect(traeAlgoDelGasto(columnasQueVinieron({ notas: "x" }))).toBe(false);
    expect(columnasQueVinieron({ tiendaCodigo: " d-24 " })).toEqual({ tiendaCodigo: "D-24" });
    expect(columnasQueVinieron({ seReporta: false })).toEqual({ seReporta: false });
    expect(columnasQueVinieron({ nota: "  Apertura   de  tienda " })).toEqual({
      nota: "Apertura de tienda",
    });
  });

  it("🔴 `tiendaCodigo: null` SÍ es una decisión: «General», no «no viajó»", () => {
    const cols = columnasQueVinieron({ tiendaCodigo: null });
    expect(traeAlgoDelGasto(cols)).toBe(true);
    expect(cols.tiendaCodigo).toBeNull();
  });

  it("el formulario de edición abre con el valor que la fila tiene HOY", () => {
    const d = datosDeLaFila({ tienda_codigo: "d-24", se_reporta: false, nota: "Remodelación" });
    expect(d.esDeTienda).toBe(true);
    expect(d.tiendaCodigo).toBe("D-24");
    expect(d.seReporta).toBe(false);
    expect(d.nota).toBe("Remodelación");
    // Una fila guardada en «General» abre en «General».
    expect(datosDeLaFila({ tienda_codigo: null }).esDeTienda).toBe(false);
    // Una fila vieja (columna ausente) abre PRENDIDA, como el DEFAULT.
    expect(datosDeLaFila({}).seReporta).toBe(true);
    // Lo que la pantalla manda de vuelta.
    expect(cuerpoDeLaEdicion(d)).toEqual({
      tiendaCodigo: "D-24",
      seReporta: false,
      nota: "Remodelación",
    });
  });

  it("🔴 editar una FACTURA sin mandar la tienda no la pisa", async () => {
    db.filas["mk_facturas"] = [
      {
        id: "f-1",
        anulado_en: null,
        impulsadora_id: null,
        proveedor: "Premium Paint",
        total: 100,
        fecha_factura: "2026-06-01",
        subtotal: 100,
        itbms: 0,
        tiene_importacion: false,
        tienda_codigo: "D-24",
        se_reporta: true,
        nota: null,
      },
    ];
    await updateFactura("f-1", { concepto: "Pintura de vitrina" });
    const payload = ultimoUpdate("mk_facturas");
    expect(payload).toBeTruthy();
    expect(payload).toHaveProperty("concepto");
    expect(payload).not.toHaveProperty("tienda_codigo");
    expect(payload).not.toHaveProperty("se_reporta");
    expect(payload).not.toHaveProperty("nota");
  });

  it("🔴 editar una FACTURA mandando la tienda SÍ la cambia", async () => {
    db.filas["mk_facturas"] = [
      {
        id: "f-1",
        anulado_en: null,
        impulsadora_id: null,
        proveedor: "Premium Paint",
        total: 100,
        fecha_factura: "2026-06-01",
        tienda_codigo: "D-24",
      },
    ];
    await updateFactura("f-1", { tiendaCodigo: "D-30", seReporta: false, nota: "Apertura" });
    const payload = ultimoUpdate("mk_facturas");
    expect(payload?.tienda_codigo).toBe("D-30");
    expect(payload?.se_reporta).toBe(false);
    expect(payload?.nota).toBe("Apertura");
  });

  it("🔴 la ruta de la ENTREGA deja pasar las tres, y solo si vinieron", async () => {
    const items = [{ productoId: "p-1", cantidad: 2 }];
    await patchEntrega(pedir({ items, marcas: [{ marcaId: "m-th", porcentaje: 100 }] }), {
      params: { id: UUID },
    });
    const sinNada = entregaRecibida.input as Record<string, unknown>;
    expect(sinNada).not.toHaveProperty("tiendaCodigo");
    expect(sinNada).not.toHaveProperty("seReporta");
    expect(sinNada).not.toHaveProperty("nota");

    await patchEntrega(
      pedir({
        items,
        marcas: [{ marcaId: "m-th", porcentaje: 100 }],
        tiendaCodigo: "d-30",
        seReporta: false,
        nota: "Remodelación",
      }),
      { params: { id: UUID } },
    );
    const conTodo = entregaRecibida.input as Record<string, unknown>;
    expect(conTodo.tiendaCodigo).toBe("D-30");
    expect(conTodo.seReporta).toBe(false);
    expect(conTodo.nota).toBe("Remodelación");
  });

  it("la entrega llega a la pantalla CON sus tres columnas (`mapEntrega` no las tira)", () => {
    const src = sinComentarios(leer("src/lib/marketing/inventario.ts"));
    const mapa = src.slice(src.indexOf("function mapEntrega"), src.indexOf("function mapItem"));
    expect(mapa).toContain("completarGasto");
    expect(mapa).toContain("tienda_codigo");
    expect(mapa).toContain("se_reporta");
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("2. el duplicado, al editar, no se cuenta a sí mismo", () => {
  const fila = (id: string) => ({
    id,
    anulado_en: null,
    impulsadora_id: null,
    proveedor: "Premium Paint",
    total: 250,
    fecha_factura: "2026-06-01",
  });

  it("🔴 guardar la MISMA factura sin cambiarle nada no la acusa de duplicada", async () => {
    db.filas["mk_facturas"] = [fila("f-1")];
    await expect(
      updateFactura("f-1", { proveedor: "Premium Paint", tiendaCodigo: "D-24" }),
    ).resolves.toBeTruthy();
    expect(ultimoUpdate("mk_facturas")?.tienda_codigo).toBe("D-24");
  });

  it("🔴 pero OTRA factura igual sí la frena, y no escribe nada", async () => {
    db.filas["mk_facturas"] = [fila("f-1"), fila("f-2")];
    await expect(updateFactura("f-1", { proveedor: "Premium Paint" })).rejects.toThrow(
      /Ya existe un gasto/i,
    );
    expect(db.escrituras.filter((e) => e.op === "update")).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("3. el mueble ofrece foto, y cuelga de la TIENDA", () => {
  function instalarFetchDeLaPuerta() {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        const url = String(input);
        const cuerpo = url.includes("/api/marketing/marcas") ? MARCAS : [];
        return {
          ok: true,
          status: 200,
          json: async () => cuerpo,
          text: async () => JSON.stringify(cuerpo),
        } as unknown as Response;
      }),
    );
    invalidarDirectorioClientes();
  }

  it("🔴 «Mueble de la bodega» ofrece subir una foto", async () => {
    instalarFetchDeLaPuerta();
    render(
      <ToastProvider>
        <RegistrarGastoModal marcas={MARCAS} onClose={() => {}} onSaved={() => {}} />
      </ToastProvider>,
    );
    fireEvent.click(document.querySelector('[data-tipo="mueble"]') as HTMLElement);
    await waitFor(() => {
      expect(screen.getByText("Foto del mueble")).toBeTruthy();
    });
    expect(screen.getByTestId("subir-archivo-de-la-puerta").textContent).toContain("Subir foto");
  });

  it("🔴 la foto del mueble se sube por la puerta de la TIENDA, con «General» de respaldo", () => {
    const src = sinComentarios(leer("src/app/marketing/components/PuertaGasto.tsx"));
    expect(src).toContain("subirAdjunto");
    expect(src).toMatch(/tiendaCodigo:\s*destino/);
    expect(src).toMatch(/comun\.tiendaCodigo \?\? TIENDA_GENERAL/);
    // Y solo DESPUÉS de que la entrega quedó guardada.
    expect(src).toMatch(/adjuntarFotoALaTienda\(\)\.then\(onSaved\)/);
  });

  it("`subirAdjunto` con tienda registra por la ruta de la tienda, nunca por la de siempre", () => {
    const src = sinComentarios(leer("src/app/marketing/components/uploadHelpers.ts"));
    expect(src).toMatch(/api\/marketing\/tienda\/\$\{encodeURIComponent\(tiendaCodigo\)\}\/fotos/);
  });

  it("🔴 el cajón «General» acepta y devuelve sus fotos (antes contestaba vacío)", () => {
    const src = sinComentarios(leer("src/app/api/marketing/tienda/[codigo]/fotos/route.ts"));
    expect(src).toContain("TIENDA_GENERAL");
    // Ya no se corta el GET ni se rechaza el POST por ser «General».
    expect(src).not.toMatch(/esCodigoGeneral\(crudo\)\)\s*return NextResponse\.json\(\[\]\)/);
    expect(src).not.toMatch(/crudo\.length > 40 \|\| esCodigoGeneral\(crudo\)/);
    expect(TIENDA_GENERAL.toUpperCase()).toBe("GENERAL");
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("4. «Lo que ya se mandó»: la lista de ZIPs del período", () => {
  const ZIP_A = {
    bajado_en: "2026-09-10T14:00:00.000Z",
    bajado_por: "Daniela",
    gastos: 40,
    monto: 94104.43,
    archivo_path: "periodos/p-1/2026-09-10.zip",
  };
  const ZIP_B = { ...ZIP_A, bajado_en: "2026-09-20T14:00:00.000Z", gastos: 2, monto: 100 };

  it("lo que no es lista se lee como lista vacía, y el más NUEVO va arriba", () => {
    expect(zipsDelPeriodo(null)).toEqual([]);
    expect(zipsDelPeriodo("[]")).toEqual([]);
    expect(hayZipsQueMostrar(zipsDelPeriodo([]))).toBe(false);
    expect(zipsDelPeriodo([ZIP_A, ZIP_B])[0].bajado_en).toBe(ZIP_B.bajado_en);
  });

  it("cada renglón dice cuándo (Panamá), quién y qué llevaba", () => {
    expect(cuandoSeBajo(ZIP_A)).toContain("2026");
    // 14:00 UTC = 9:00 a. m. en Panamá (UTC−5), no las 2 de la tarde.
    expect(cuandoSeBajo(ZIP_A)).toMatch(/\b9:00\b/);
    expect(cuandoSeBajo({ bajado_en: "" })).toBe("Sin fecha");
    expect(quienLoBajo(ZIP_A)).toBe("Daniela");
    expect(quienLoBajo({ bajado_por: "sistema" })).toBeNull();
    expect(loQueLlevaba(ZIP_A)).toBe("40 gastos · $94,104.43");
    expect(loQueLlevaba({ gastos: 1, monto: 5 })).toBe("1 gasto · $5.00");
  });

  it("🔴 SIN ZIPS ANOTADOS NO SE DIBUJA NADA (los 6 períodos de hoy)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ zips: [] }) }) as unknown as Response),
    );
    const { container } = render(
      <ToastProvider>
        <ZipsBajados periodoId="p-1" />
      </ToastProvider>,
    );
    await waitFor(() => expect(container.querySelector('[data-testid="zips-bajados"]')).toBeNull());
    expect(screen.queryByText("Lo que ya se mandó")).toBeNull();
  });

  it("🔴 con un ZIP anotado se lista, y «Volver a firmar» llama a la ruta de firmar de nuevo", async () => {
    const llamadas: Array<{ url: string; cuerpo: unknown }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown, init?: RequestInit) => {
        const url = String(input);
        llamadas.push({ url, cuerpo: init?.body ? JSON.parse(String(init.body)) : null });
        if (url.includes("firmar-de-nuevo")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ links: [{ path: ZIP_A.archivo_path, url: "https://x/zip" }] }),
          } as unknown as Response;
        }
        return { ok: true, status: 200, json: async () => ({ zips: [ZIP_A] }) } as unknown as Response;
      }),
    );
    const abrir = vi.fn();
    vi.stubGlobal("open", abrir);

    render(
      <ToastProvider>
        <ZipsBajados periodoId="p-1" />
      </ToastProvider>,
    );
    await screen.findByText("Lo que ya se mandó");
    expect(screen.getByText("40 gastos · $94,104.43")).toBeTruthy();

    fireEvent.click(screen.getByText("Volver a firmar"));
    await waitFor(() => {
      const f = llamadas.find((l) => l.url.includes("firmar-de-nuevo"));
      expect(f).toBeTruthy();
      expect(f?.cuerpo).toEqual({ paths: [ZIP_A.archivo_path] });
    });
    await waitFor(() => expect(abrir).toHaveBeenCalled());
    expect(DIAS_DEL_LINK).toBe(30);
  });

  it("la ruta del período LEE la bitácora y nunca escribe", async () => {
    db.filas["mk_periodos"] = [{ id: UUID, zips_bajados: [ZIP_A, ZIP_B] }];
    const res = await getPeriodo(new NextRequest("http://x/api/marketing/periodos/" + UUID), {
      params: { id: UUID },
    });
    const body = (await res.json()) as { zips: Array<{ bajado_en: string }> };
    expect(body.zips).toHaveLength(2);
    expect(body.zips[0].bajado_en).toBe(ZIP_B.bajado_en);
    expect(db.escrituras).toHaveLength(0);
  });

  it("la pantalla del período monta la lista, y no en los buckets sin período", () => {
    const src = sinComentarios(leer("src/app/marketing/components/DetallePeriodoView.tsx"));
    expect(src).toContain("<ZipsBajados");
    expect(src).toMatch(/ZIP_E_IMPULSADORAS_NUEVO && !esBucket/);
  });
});
