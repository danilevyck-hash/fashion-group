// Envío automático del estado de cuenta de los lunes (26-nov-2026, Daniel):
// quién entra, cómo se agrupa, la semana (llave del «a lo sumo una vez») y los
// textos. El I/O vive en `app/api/cron/estado-cuenta-semanal/route.ts`.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  ESTADO_CUENTA_AUTOMATICO_2026_11,
  REMITENTE_AUTOMATICO,
  asuntoAutomatico,
  cuerpoAutomatico,
  direccionesValidas,
  lunesDeLaSemana,
  mensajeDelLunes,
  seleccionarClientes,
  type FilaCartera,
} from "@/lib/cxc/estado-cuenta-automatico";

const fila = (codigo: string, empresa: string, total: number, nombre = codigo): FilaCartera => ({
  codigo,
  empresa,
  total,
  nombre,
  nombreNormalizado: nombre.toUpperCase(),
});

describe("quién entra", () => {
  const sel = seleccionarClientes([
    fila("D-24", "vistana", 100),
    fila("D-24", "fashion_wear", 50.5),
    fila("D-24", "joystep", -20), // saldo a favor: no viaja ni resta
    fila("D-25", "fashion_shoes", "300.10" as unknown as number),
    fila("D-30", "vistana", 0), // sin saldo
    fila("D-31", "active_wear", -5),
    fila("TCKCTA", "vistana", 999), // mostrador
    fila("tckcta", "fashion_wear", 999),
    fila("12188", "active_wear", 10), // empresa del grupo como cliente
    fila("D-108", "vistana", 10),
    fila("D-38", "vistana", 10),
    fila("D-40", "confecciones_boston", 500), // Boston
    fila("D-41", "american_classic", 500), // Multifashion
    fila("D-42", "vistana", 0.004), // redondea a 0
  ]);

  it("solo saldo > 0, solo las 6 del grupo, sin mostrador ni empresas del grupo", () => {
    expect(sel.map((c) => c.codigo).sort()).toEqual(["D-24", "D-25"]);
  });

  it("UN cliente por código, con las empresas de saldo > 0 en el orden del grupo", () => {
    const d24 = sel.find((c) => c.codigo === "D-24")!;
    expect(d24.empresas).toEqual(["vistana", "fashion_wear"]);
    expect(d24.saldo).toBe(150.5);
  });

  it("ordena por saldo, el mayor primero", () => {
    expect(sel[0].codigo).toBe("D-25");
  });
});

describe("a lo sumo una vez por semana: la llave es el lunes de Panamá", () => {
  it.each([
    ["2026-11-30", "2026-11-30"], // lunes
    ["2026-12-02", "2026-11-30"], // miércoles
    ["2026-12-06", "2026-11-30"], // domingo
    ["2026-12-07", "2026-12-07"],
    ["2027-01-01", "2026-12-28"],
  ])("%s → %s", (hoy, lunes) => {
    expect(lunesDeLaSemana(hoy)).toBe(lunes);
  });

  it("la tabla tiene UNIQUE (cliente_codigo, semana) y la ruta reserva antes de mandar", () => {
    const sql = fs.readFileSync(
      path.join(process.cwd(), "supabase/migrations/20270127120000_cxc_estado_cuenta_automatico.sql"),
      "utf8",
    );
    expect(sql).toMatch(/UNIQUE \(cliente_codigo, semana\)/);
    expect(sql).not.toMatch(/\b(DROP TABLE|DELETE FROM|TRUNCATE)\b/i);
    const ruta = fs.readFileSync(path.join(process.cwd(), "src/app/api/cron/estado-cuenta-semanal/route.ts"), "utf8");
    expect(ruta.indexOf("reservar(c, semana)")).toBeGreaterThan(-1);
    expect(ruta.indexOf("reservar(c, semana)")).toBeLessThan(ruta.indexOf("mandarUno(c, correos)"));
    expect(ruta).toContain("Idempotency-Key");
  });
});

describe("correo", () => {
  it("sale de info@ y el interruptor está APAGADO (26-nov: PDF de Switch)", () => {
    expect(REMITENTE_AUTOMATICO).toBe("Fashion Group <info@fashiongr.com>");
    expect(ESTADO_CUENTA_AUTOMATICO_2026_11).toBe(false);
  });

  it("direcciones: separa, valida y no repite", () => {
    expect(direccionesValidas("A@x.com; b@y.com, a@x.com")).toEqual(["a@x.com", "b@y.com"]);
    expect(direccionesValidas("sin correo")).toEqual([]);
    expect(direccionesValidas("")).toEqual([]);
  });

  it("texto: saludo por contacto, ustedes, nunca «vencido» ni voseo", () => {
    const t = cuerpoAutomatico("30 nov 2026", "Ana");
    expect(t.startsWith("Buen día Ana,")).toBe(true);
    expect(cuerpoAutomatico("30 nov 2026").startsWith("Buen día,")).toBe(true);
    expect(t).toContain("actualizados al 30 nov 2026");
    expect(t).not.toMatch(/vencid/i);
    expect(asuntoAutomatico(["Vistana", "Fashion Wear"], "30 nov 2026")).toBe(
      "Vistana - Fashion Wear — Estado de cuenta al 30 nov 2026",
    );
  });

  it("mensaje del lunes: enviados, sin correo con su deuda", () => {
    const m = mensajeDelLunes({
      enviados: 70,
      pdfs: 150,
      sinCorreo: [
        { nombre: "Cliente A", saldo: 100 },
        { nombre: "Cliente B", saldo: 1000.5 },
      ],
      fallaron: [],
      yaEnviados: 0,
      pendientes: 0,
    });
    expect(m.split("\n")[0]).toBe("📧 Estados de cuenta del lunes: 70 enviados · 2 clientes sin correo (deben $1,100.50)");
    expect(m.indexOf("Cliente B")).toBeLessThan(m.indexOf("Cliente A"));
  });
});
