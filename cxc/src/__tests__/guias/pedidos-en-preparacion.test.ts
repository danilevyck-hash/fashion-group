// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO — Despachos › Pedidos: «En preparación» y «En espera de muestra»
// (Daniel, 9-oct-2026)
//
//   1. Pendiente → En preparación (bodega: le entregaron la hoja) → Preparado
//      (bodega) → Recibido (secretaria). Cada paso, recortado en el servidor.
//   2. «En espera de muestra» solo existe En preparación (código y CHECK de la
//      base), un solo motivo, nota opcional, y marcar Preparado la quita.
//   3. Tocar una pestaña vuelve a leer la lista de la BASE — nunca llama a
//      Switch (cada llamada bota a Daniel de su panel).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  ESTADOS_FLUJO_SIMPLE,
  PESTANA_FLUJO_SIMPLE,
  puedeMoverFlujoSimple,
  columnasDelPaso,
  puedeMarcarEsperaMuestra,
  columnasEsperaMuestra,
  lineaEsperaMuestra,
  type EstadoFlujoSimple,
} from "@/lib/guias/pedidos-flujo-simple";

const leer = (f: string) => fs.readFileSync(path.resolve(__dirname, "../..", f), "utf8");
const vista = () => leer("app/despachos/components/PedidosView.tsx");
const ruta = () => leer("app/api/guias/pedidos/route.ts");
const migracion = () => fs.readFileSync(path.resolve(__dirname, "../../../supabase/migrations/20270109120000_pedidos_en_preparacion.sql"), "utf8");

const bodega = { role: "bodega", userName: "julio" };
const secretaria = { role: "secretaria", userName: "angela" };
const admin = { role: "admin", userName: "daniel" };
const mover = (desde: EstadoFlujoSimple, hasta: EstadoFlujoSimple, q: typeof bodega) =>
  puedeMoverFlujoSimple({ desde, hasta, empresa_key: "fashion_wear" }, q);

describe("🔴 1 · cuatro pasos, y quién marca cada uno", () => {
  it("las cuatro pestañas, con nombres de ERP", () => {
    expect(ESTADOS_FLUJO_SIMPLE.map((e) => PESTANA_FLUJO_SIMPLE[e])).toEqual(["Pendientes", "En preparación", "Preparados", "Recibidos"]);
  });

  it("«En preparación»: solo bodega o admin, nunca la secretaria", () => {
    expect(mover("pendiente", "en_preparacion", bodega).ok).toBe(true);
    expect(mover("pendiente", "en_preparacion", admin).ok).toBe(true);
    expect(mover("pendiente", "en_preparacion", secretaria)).toEqual({
      ok: false,
      error: "«En preparación» lo marca bodega. La sesión abierta es de angela (secretaria).",
    });
  });

  it("«Preparado»: solo bodega o admin, y solo desde En preparación", () => {
    expect(mover("en_preparacion", "preparado", bodega).ok).toBe(true);
    expect(mover("en_preparacion", "preparado", secretaria).ok).toBe(false);
    expect(mover("pendiente", "preparado", bodega).ok).toBe(false);
  });

  it("«Recibido»: solo la secretaria o admin, nunca bodega", () => {
    expect(mover("preparado", "recibido", secretaria).ok).toBe(true);
    expect(mover("preparado", "recibido", bodega).ok).toBe(false);
  });

  it("deshacer En preparación (volver a Pendiente) es de bodega", () => {
    expect(mover("en_preparacion", "pendiente", bodega).ok).toBe(true);
    expect(mover("en_preparacion", "pendiente", secretaria).ok).toBe(false);
  });

  it("el PATCH pide los bultos al pasar de En preparación a Preparado", () => {
    expect(ruta()).toContain('if (estado === "preparado" && desde === "en_preparacion") {');
  });

  it("la migración SOLO agrega: ningún UPDATE ni DELETE sobre filas", () => {
    const sql = migracion().replace(/--.*$/gm, "");
    expect(sql).not.toMatch(/\bUPDATE\b|\bDELETE\b|\bTRUNCATE\b|DROP\s+(TABLE|COLUMN)/i);
    expect(sql).toContain("'pendiente', 'en_preparacion', 'preparado', 'verificado', 'recibido'");
  });
});

describe("🔴 2 · «En espera de muestra»", () => {
  it("solo se marca En preparación", () => {
    for (const estado of ESTADOS_FLUJO_SIMPLE) {
      expect(puedeMarcarEsperaMuestra({ estado, empresa_key: "fashion_wear" }, bodega).ok).toBe(estado === "en_preparacion");
    }
  });

  it("la marca bodega (o admin), nunca la secretaria", () => {
    expect(puedeMarcarEsperaMuestra({ estado: "en_preparacion", empresa_key: "fashion_wear" }, admin).ok).toBe(true);
    expect(puedeMarcarEsperaMuestra({ estado: "en_preparacion", empresa_key: "fashion_wear" }, secretaria).ok).toBe(false);
  });

  it("la base también la impide fuera de En preparación", () => {
    expect(migracion()).toContain("CHECK (espera_muestra_desde IS NULL OR estado = 'en_preparacion')");
  });

  it("marcar Preparado la quita sola", () => {
    const c = columnasDelPaso("en_preparacion", "preparado", "julio", "2026-10-09T15:00:00.000Z", 4);
    expect(c).toMatchObject({ espera_muestra_desde: null, espera_muestra_por: null, espera_muestra_nota: null });
  });

  it("volver a Pendiente también la quita", () => {
    expect(columnasDelPaso("en_preparacion", "pendiente", "julio", "x")).toMatchObject({ espera_muestra_desde: null });
  });

  it("poner guarda quién, cuándo y la nota (opcional, recortada); quitar la limpia", () => {
    const ahora = "2026-10-09T15:00:00.000Z";
    expect(columnasEsperaMuestra(true, "julio", ahora, "  2 cajas talla 10 ")).toEqual({
      espera_muestra_desde: ahora, espera_muestra_por: "julio", espera_muestra_nota: "2 cajas talla 10",
    });
    expect(columnasEsperaMuestra(true, "julio", ahora, "")).toMatchObject({ espera_muestra_nota: null });
    expect(columnasEsperaMuestra(true, "julio", ahora, "x".repeat(500)).espera_muestra_nota).toHaveLength(200);
    expect(columnasEsperaMuestra(false, "julio", ahora)).toEqual({ espera_muestra_desde: null, espera_muestra_por: null, espera_muestra_nota: null });
  });

  it("la fila dice «En espera de muestra · hace N días», en ámbar", () => {
    expect(lineaEsperaMuestra(2)).toBe("En espera de muestra · hace 2 días");
    expect(lineaEsperaMuestra(1)).toBe("En espera de muestra · hace 1 día");
    expect(lineaEsperaMuestra(0)).toBe("En espera de muestra · desde hoy");
    expect(vista()).toMatch(/text-amber-700">\s*\{lineaEsperaMuestra\(dias\)\}/);
  });

  it("queda en el registro de actividad al poner y al quitar", () => {
    const r = ruta();
    expect(r).toContain('poner ? "marcar_espera_muestra" : "quitar_espera_muestra"');
  });
});

describe("🔴 3 · cambiar de pestaña refresca desde la base, sin Switch", () => {
  it("tocar una pestaña vuelve a leer la lista", () => {
    expect(vista()).toContain("onClick={() => { setFiltro(c.value); void cargar(); }}");
  });

  it("`cargar` solo lee /api/guias/pedidos con GET, nada de sync", () => {
    const v = vista();
    const cargar = v.slice(v.indexOf("async function cargar()"), v.indexOf("useEffect(() => { void cargar(); }, []);"));
    expect(cargar).toContain('fetch("/api/guias/pedidos", { cache: "no-store" })');
    expect(cargar).not.toMatch(/\bsync|switch/i);
  });

  it("la ruta de la lista no importa nada de Switch", () => {
    expect(ruta()).not.toMatch(/from "@\/lib\/switch|switch-api|sync-now/);
  });
});
