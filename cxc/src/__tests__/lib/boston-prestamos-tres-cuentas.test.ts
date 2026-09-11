// ─────────────────────────────────────────────────────────────────────────────
// 🔴 EL «DESCUENTA $X POR QUINCENA» DE DAVID SUMA LAS TRES CUENTAS (11-sep-2026).
//
// 🩸 `/api/boston/prestamos` pedía `deduccion_dano` —columna SIN LECTORES desde
// el 10-sep: el daño no propone cuota— y nunca `deduccion_terceros`, que sí se
// descuenta sola cada quincena. Así el descuento que veía David era menor al
// que la planilla aplica. Ahora: saldo por `calcularSaldoPrestamo` (las tres
// cuentas, la MISMA cuenta del módulo) y cuota = préstamo + terceros.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { signSession } from "@/lib/session-cookie";

const SECRET_PREV = process.env.SESSION_SECRET;
beforeAll(() => { process.env.SESSION_SECRET = "test-secret-boston-prestamos"; });
afterAll(() => { process.env.SESSION_SECRET = SECRET_PREV; });

const selects: string[] = [];
const FILAS = [{
  id: "f1", nombre: "KEVIN LUBO", empresa: "Confecciones Boston",
  deduccion_quincenal: 20, deduccion_terceros: 15,
  prestamos_movimientos: [
    { concepto: "Préstamo", monto: 200, estado: "aprobado", deleted: false, fecha: "2026-08-01", cuenta: "prestamo" },
    { concepto: "Pago", monto: 50, estado: "aprobado", deleted: false, fecha: "2026-08-15", cuenta: "prestamo" },
    { concepto: "Descuento a terceros", monto: 90, estado: "aprobado", deleted: false, fecha: "2026-09-10", cuenta: "terceros" },
    { concepto: "Responsabilidad por daño", monto: 30, estado: "aprobado", deleted: false, fecha: "2026-09-01", cuenta: "dano" },
  ],
}];
vi.mock("@/lib/supabase-server", () => ({
  HAS_SERVICE_ROLE: true,
  supabaseServer: {
    from: () => ({
      select: (s: string) => {
        selects.push(s);
        return { or: () => ({ order: () => Promise.resolve({ data: FILAS, error: null }) }) };
      },
    }),
  },
}));

const { GET } = await import("@/app/api/boston/prestamos/route");

function pedir(role: string) {
  const cookie = signSession({ role, userId: "u", userName: role, sessionToken: "t", modules: ["boston"] });
  return GET(new NextRequest("http://x/api/boston/prestamos", { headers: { cookie: `cxc_session=${cookie}` } }));
}

describe("GET /api/boston/prestamos", () => {
  it("🔴 pide `deduccion_terceros` y NO `deduccion_dano` (sin lectores desde el 10-sep)", async () => {
    await pedir("gerente_boston");
    expect(selects[0]).toContain("deduccion_terceros");
    expect(selects[0]).not.toContain("deduccion_dano");
  });
  it("🔴 el saldo son las tres cuentas y la cuota es préstamo + terceros", async () => {
    const j = await (await pedir("gerente_boston")).json();
    const k = j.empleados.find((e: { nombre: string }) => e.nombre === "KEVIN LUBO");
    expect(k.saldoPrestamo).toBe(150);
    expect(k.saldoDano).toBe(30);
    expect(k.saldoTerceros).toBe(90);
    expect(k.saldo).toBe(270);
    expect(k.deduccionQuincenal).toBe(35);
    expect(k.deduccionPrestamo).toBe(20);
    expect(k.deduccionTerceros).toBe(15);
    expect(j.totales.saldo).toBe(270);
  });
  it("la pantalla dibuja esa cuota como «descuenta $X por quincena»", () => {
    const src = readFileSync(join(process.cwd(), "src", "app", "boston", "tabs", "PrestamosBoston.tsx"), "utf8");
    expect(src).toContain("descuenta $${fmt(e.deduccionQuincenal)} por quincena");
  });
});
