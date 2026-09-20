/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CANDADO — LA PORTADA DE RECLAMOS, SIN HUECOS Y CON LOS DÍAS AL FRENTE
 * (20-sep-2026, aprobado por Daniel).
 *
 * TRES cosas, y ninguna mueve un número:
 *
 *  1. 🩸 «Sin reclamar» EN CERO NO SE DIBUJA. Medido: hoy hay **0 sin
 *     reclamar**, y esa caja se llevaba un tercio de la fila para escribir
 *     «Nada sin reclamar». Las dos que sí dicen algo se reparten el ancho.
 *     Con uno solo sin reclamar, la caja vuelve sola y en rojo.
 *
 *  2. 🩸 ACTIVE WEAR SALE DE LA PANTALLA. **0 reclamos en toda la historia**,
 *     igual que Joystep el 10-sep. Se va por el MISMO camino
 *     (`EMPRESAS_SIN_TARJETA`), así que sale de la portada Y del desplegable
 *     del formulario — que es la invariante del 11-sep: las dos pantallas leen
 *     la MISMA lista. ⚠️ `EMPRESAS_MAP` no se toca y `empresasParaElegir`
 *     conserva la opción de un reclamo que YA esté en ella.
 *     🔄 Cambia de dirección la decisión del 10-sep (*«puede que sí se
 *     reclame»*), con nota fechada y sin borrar nada.
 *
 *  3. 🔴 LOS DÍAS DEL MÁS VIEJO, EN UN CHIP ROJO al lado del nombre de la
 *     empresa (iban en gris chico detrás del contacto), y en «Por cobrar» la
 *     línea «N pasan de 120 días».
 *
 * 🔴 EL CORTE VIVE EN UNA SOLA CONSTANTE (`DIAS_RECLAMO_VIEJO`, 120), la misma
 * que lee el aviso de los lunes. Nadie escribe 120 a mano: este candado barre
 * el módulo entero para exigirlo.
 * ────────────────────────────────────────────────────────────────────────── */
import { describe, it, expect, vi, afterEach, beforeAll, beforeEach } from "vitest";
import { render, cleanup, within } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";

vi.mock("next/navigation", () => ({
  usePathname: () => "/reclamos",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
}));

import EmpresaSelector from "@/app/reclamos/components/EmpresaSelector";
import { emptyItem } from "@/app/reclamos/components/constants";
import { hoyPanama } from "@/lib/fecha-panama";
import { diasDesde } from "@/lib/reclamos/dias";
import {
  DIAS_RECLAMO_VIEJO,
  esReclamoViejo,
  reclamosViejos,
  resumenViejos,
} from "@/lib/reclamos/viejos";
import {
  EMPRESAS_CON_RECLAMOS,
  EMPRESAS_SIN_TARJETA,
  empresasParaElegir,
} from "@/lib/reclamos/empresas-con-reclamos";
import { EMPRESAS, EMPRESAS_MAP } from "@/lib/reclamos/empresas";
import type { Reclamo } from "@/app/reclamos/components/types";

const RAIZ = process.cwd();
const almacen = () => {
  const datos = new Map<string, string>();
  return { getItem: (k: string) => datos.get(k) ?? null, setItem: (k: string, v: string) => { datos.set(k, String(v)); }, removeItem: (k: string) => { datos.delete(k); }, clear: () => datos.clear(), key: (i: number) => [...datos.keys()][i] ?? null, get length() { return datos.size; } } as unknown as Storage;
};
beforeAll(() => { process.env.SESSION_SECRET = "test-secret-reclamos-portada"; });
beforeEach(() => {
  Object.defineProperty(window, "localStorage", { value: almacen(), configurable: true, writable: true });
  Object.defineProperty(window, "sessionStorage", { value: almacen(), configurable: true, writable: true });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const HOY = hoyPanama();
/** Una fecha a `n` días de hoy, para no clavar fechas que caducan. */
function haceDias(n: number): string {
  const [a, m, d] = HOY.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d - n)).toISOString().slice(0, 10);
}

const noop = () => {};
const mk = (o: Partial<Reclamo> & { precio?: number; id: string }): Reclamo => ({
  nro_reclamo: o.id, empresa: "Fashion Wear", proveedor: "American Fashion Wear", marca: "Tommy Hilfiger",
  nro_factura: "2000013690", nro_orden_compra: "", fecha_reclamo: "2026-06-11", estado: "Creado", notas: "",
  created_at: "2026-06-11T10:00:00Z", reclamado_en: "2026-07-01T00:00:00Z",
  reclamo_items: [{ ...emptyItem(), referencia: "R", descripcion: "D", cantidad: 1, precio_unitario: o.precio ?? 100 }],
  reclamo_fotos: [], reclamo_seguimiento: [], reclamo_settlements: [],
  ...o,
});

const pintar = (reclamos: Reclamo[]) =>
  render(
    <EmpresaSelector
      role="admin" reclamos={reclamos} loading={false}
      contactos={[{ id: "c", empresa: "Fashion Wear", nombre: "", nombre_contacto: "Isaac Amar", correo: "iamar@aswgr.com" }]}
      globalSearch="" setGlobalSearch={noop} onNewReclamo={noop} onSelectEmpresa={noop} onLoadDetail={noop}
    />,
  );

// ═══ 1. La caja en cero no se dibuja ════════════════════════════════════════
describe("🔴 «Sin reclamar» en CERO no ocupa un tercio de la fila", () => {
  it("con todos reclamados, la caja NO existe y quedan dos columnas", () => {
    pintar([mk({ id: "FW-1", precio: 3000, fecha_factura: haceDias(30) })]);
    const portada = document.querySelector('[data-medir="reclamos-portada"]')!;
    expect(portada.textContent).toContain("Por cobrar");
    expect(portada.textContent).not.toContain("Sin reclamar");
    expect(portada.textContent).not.toContain("Nada sin reclamar");
    expect(portada.className).toContain("sm:grid-cols-2");
    expect(portada.className).not.toContain("sm:grid-cols-3");
  });

  it("⚠️ CONTROL: con UNO sin reclamar la caja vuelve sola, en rojo y con tres columnas", () => {
    pintar([
      mk({ id: "FW-1", precio: 3000, fecha_factura: haceDias(30) }),
      mk({ id: "FW-2", precio: 100, fecha_factura: haceDias(10), reclamado_en: null }),
    ]);
    const portada = document.querySelector('[data-medir="reclamos-portada"]')!;
    const caja = within(portada as HTMLElement).getByText("Sin reclamar").parentElement!;
    expect(caja.className).toContain("border-red-200");
    expect(caja.textContent).toContain("1 reclamo");
    expect(portada.className).toContain("sm:grid-cols-3");
  });

  it("⚠️ el número no se tocó: sigue saliendo de `resumenPortada`", () => {
    const src = fs.readFileSync(path.join(RAIZ, "src/app/reclamos/components/EmpresaSelector.tsx"), "utf8");
    expect(src).toContain("resumenPortada(reclamos, hoy)");
  });
});

// ═══ 2. Active Wear sale de la pantalla ═════════════════════════════════════
describe("🔴 Active Wear sale de la pantalla, como salió Joystep", () => {
  it("la lista se sigue DERIVANDO de `EMPRESAS` menos los retirados", () => {
    expect([...EMPRESAS_SIN_TARJETA].sort()).toEqual(["Active Wear", "Joystep"]);
    expect(EMPRESAS_CON_RECLAMOS).toEqual(EMPRESAS.filter((e) => !EMPRESAS_SIN_TARJETA.includes(e)));
    expect(EMPRESAS_CON_RECLAMOS).not.toContain("Active Wear");
  });

  it("no hay tarjeta de Active Wear en la portada", () => {
    pintar([mk({ id: "FW-1", precio: 3000, fecha_factura: haceDias(30) })]);
    const grid = document.querySelector('[data-medir="reclamos-tarjetas"]')!;
    expect(grid.textContent).not.toContain("Active Wear");
    expect(grid.textContent).not.toContain("Joystep");
    // CONTROL: las cuatro que sí reclaman siguen dibujándose.
    for (const nombre of ["Fashion Wear", "Vistana", "Fashion Shoes", "Active Shoes"]) {
      expect(grid.textContent, nombre).toContain(nombre);
    }
  });

  it("🔴 y el formulario ofrece EXACTAMENTE lo mismo (la invariante del 11-sep)", () => {
    expect(empresasParaElegir()).toEqual(EMPRESAS_CON_RECLAMOS);
    expect(empresasParaElegir()).not.toContain("Active Wear");
  });

  it("⚠️ pero un reclamo que YA esté en Active Wear conserva su opción al editar", () => {
    expect(empresasParaElegir("Active Wear")).toContain("Active Wear");
    expect(empresasParaElegir("Active Wear").length).toBe(EMPRESAS_CON_RECLAMOS.length + 1);
  });

  it("🔴 NADA SE BORRA: su proveedor, su marca y su código de Switch siguen enteros", () => {
    expect(EMPRESAS_MAP["Active Wear"]).toEqual({
      empresa_key: "active_wear",
      proveedor: "American Unique Brands SA",
      marca: "Karl Lagerfeld",
      proveedor_codigo: "126",
    });
  });
});

// ═══ 3. Los días al frente, y UN solo corte ═════════════════════════════════
describe("🔴 los días del más viejo, en un chip rojo", () => {
  it("el chip va pegado al nombre de la empresa, no en gris al final de una línea", () => {
    pintar([mk({ id: "FW-1", precio: 3000, fecha_factura: haceDias(103) })]);
    const grid = document.querySelector('[data-medir="reclamos-tarjetas"]')!;
    const chip = within(grid as HTMLElement).getByText("el más viejo lleva 103 días");
    expect(chip.className).toContain("text-red-600");
    // Pegado al nombre: comparten el mismo contenedor.
    expect(chip.parentElement!.textContent).toContain("Fashion Wear");
    // Y el contacto sigue estando, en su línea.
    expect(grid.textContent).toContain("Isaac Amar");
  });

  it("sin fecha de factura no se inventa un chip", () => {
    pintar([mk({ id: "FW-1", precio: 3000, fecha_factura: null })]);
    const grid = document.querySelector('[data-medir="reclamos-tarjetas"]')!;
    expect(grid.textContent).not.toContain("el más viejo lleva");
  });

  it("🔴 «N pasan de 120 días» va en la caja de «Por cobrar»", () => {
    pintar([
      mk({ id: "FW-1", precio: 3000, fecha_factura: haceDias(DIAS_RECLAMO_VIEJO + 1) }),
      mk({ id: "FW-2", precio: 100, fecha_factura: haceDias(DIAS_RECLAMO_VIEJO) }),
      mk({ id: "FW-3", precio: 100, fecha_factura: haceDias(DIAS_RECLAMO_VIEJO - 1) }),
    ]);
    const portada = document.querySelector('[data-medir="reclamos-portada"]')!;
    const caja = within(portada as HTMLElement).getByText("Por cobrar").parentElement!;
    expect(caja.textContent).toContain(`2 pasan de ${DIAS_RECLAMO_VIEJO} días`);
  });

  it("uno solo se dice en singular, y ninguno no se dice", () => {
    pintar([mk({ id: "FW-1", precio: 3000, fecha_factura: haceDias(DIAS_RECLAMO_VIEJO) })]);
    expect(document.querySelector('[data-medir="reclamos-portada"]')!.textContent)
      .toContain(`1 pasa de ${DIAS_RECLAMO_VIEJO} días`);
    cleanup();
    pintar([mk({ id: "FW-1", precio: 3000, fecha_factura: haceDias(3) })]);
    expect(document.querySelector('[data-medir="reclamos-portada"]')!.textContent)
      .not.toContain("pasa");
  });
});

// ═══ La regla, pura ═════════════════════════════════════════════════════════
describe("🔴 el corte vive en UNA constante, y es 120", () => {
  it("el número es el que Daniel eligió con los tres cortes a la vista", () => {
    expect(DIAS_RECLAMO_VIEJO).toBe(120);
  });

  it("el borde exacto cuenta: 120 sí, 119 no", () => {
    const r = (dias: number) => mk({ id: "X", precio: 100, fecha_factura: haceDias(dias) });
    expect(esReclamoViejo(r(DIAS_RECLAMO_VIEJO), HOY)).toBe(true);
    expect(esReclamoViejo(r(DIAS_RECLAMO_VIEJO - 1), HOY)).toBe(false);
  });

  it("un reclamo PAGADO nunca es viejo (ya no se le cobra a nadie)", () => {
    const pagado = mk({ id: "P", precio: 100, fecha_factura: haceDias(900), estado: "Pagado" });
    expect(esReclamoViejo(pagado, HOY)).toBe(false);
    expect(resumenViejos([pagado], HOY)).toEqual({ n: 0, monto: 0, masViejos: [] });
  });

  it("sin fecha de factura NO es viejo: no se adivina una fecha", () => {
    expect(esReclamoViejo(mk({ id: "S", precio: 100, fecha_factura: null }), HOY)).toBe(false);
  });

  it("vienen del MÁS viejo al menos viejo, con su monto y su número", () => {
    const rs = [
      mk({ id: "A", precio: 100, fecha_factura: haceDias(130) }),
      mk({ id: "B", precio: 100, fecha_factura: haceDias(400) }),
      mk({ id: "C", precio: 100, fecha_factura: haceDias(10) }),
    ];
    const v = reclamosViejos(rs, HOY);
    expect(v.map((x) => x.nroReclamo)).toEqual(["B", "A"]);
    expect(v[0].dias).toBe(400);
    // El monto es el TOTAL con impuestos, el mismo de la tarjeta: 100 × 1,177.
    expect(v[0].monto).toBeCloseTo(117.7, 6);
    const res = resumenViejos(rs, HOY);
    expect(res.n).toBe(2);
    expect(res.monto).toBeCloseTo(235.4, 6);
    expect(res.masViejos.length).toBe(2);
  });

  it("«los tres más viejos» son tres, no cuatro", () => {
    const rs = [200, 300, 400, 500].map((d, i) =>
      mk({ id: `R${i}`, precio: 100, fecha_factura: haceDias(d) }),
    );
    expect(resumenViejos(rs, HOY).masViejos.map((x) => x.dias)).toEqual([500, 400, 300]);
  });

  it("🔴 NADIE escribe el 120 a mano en Reclamos: sale de la constante", () => {
    const dir = path.join(RAIZ, "src/lib/reclamos");
    const pantallas = path.join(RAIZ, "src/app/reclamos");
    const archivos: string[] = [];
    const caminar = (d: string) => {
      for (const e of fs.readdirSync(d)) {
        const full = path.join(d, e);
        if (fs.statSync(full).isDirectory()) caminar(full);
        else if (/\.(ts|tsx)$/.test(e)) archivos.push(full);
      }
    };
    caminar(dir); caminar(pantallas);
    expect(archivos.length).toBeGreaterThan(20);
    for (const f of archivos) {
      if (f.endsWith(path.join("reclamos", "viejos.ts"))) continue;
      const codigo = fs.readFileSync(f, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/^[ \t]*\/\/.*$/gm, "");
      // El 120 prohibido es el que se usa COMO CORTE DE DÍAS. El gris de un PDF
      // (`setTextColor(120, 120, 120)`) no tiene nada que ver, y decir que sí
      // convertiría este candado en un estorbo que alguien apagaría.
      expect(codigo, `${path.relative(RAIZ, f)} clavó el corte de días a mano`)
        .not.toMatch(/\b120\b\s*d[ií]as?|d[ií]as?[^\n]{0,15}\b120\b|[<>]=?\s*120\b/i);
    }
  });

  it("⚠️ CONTROL: `diasDesde` no cambió — el chip y el corte miden lo mismo", () => {
    expect(diasDesde(haceDias(7), HOY)).toBe(7);
  });
});
