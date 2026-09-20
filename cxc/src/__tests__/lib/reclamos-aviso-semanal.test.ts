/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CANDADO — EL AVISO SEMANAL DE RECLAMOS VIEJOS (20-sep-2026, aprobado por
 * Daniel).
 *
 * 🩸 ANTES NO HABÍA NADA: ni cron, ni Telegram, ni recordatorio. Un reclamo que
 * Andrea carga y nadie vuelve a mirar se quedaba quieto para siempre, y la
 * única forma de enterarse era abrir el módulo. Medido contra producción el
 * 20-sep-2026: **15 reclamos pasados de 90 días por $6.220,41**, y uno de
 * **594 días por $929,83**.
 *
 * Lo que este archivo fija, y por qué cada cosa:
 *
 *  1. 🔴 EL CORTE SALE DE `DIAS_RECLAMO_VIEJO`, la MISMA constante de la
 *     portada. Un aviso que dijera «viejo» con otro número que la pantalla es
 *     un aviso que nadie puede verificar.
 *  2. 🔴 VA POR `enviarNegocio`, nunca `sendTelegramAlert` directo (es plata
 *     que se le debe a la empresa, no una avería del sistema) y **sin prefijo
 *     de sistema**.
 *  3. 🔴 SIN NADA VIEJO NO SE MANDA NADA. Nunca un «todo al día ✅» — Daniel,
 *     sobre el resumen de fotos: *«solo dime si me faltan fotos, no si no me
 *     faltan fotos»*.
 *  4. 🔴 UNA ENTRADA DE CRON = UNA OCURRENCIA, y la entrada existe de verdad en
 *     `vercel.json` los LUNES a las 14:00 UTC (9:00 a.m. de Panamá).
 *  5. 🔴 NO TOCA SWITCH: lee solo Supabase. Por eso la separación de 15 min
 *     entre crons que comparten empresa en Switch no le aplica — y este candado
 *     exige que siga sin tocarlo, que es lo que hace cierta esa excepción.
 *  6. ⚠️ Los reclamos PAGADOS no entran, y uno sin fecha de factura tampoco:
 *     no se adivina una fecha para poder avisar.
 * ────────────────────────────────────────────────────────────────────────── */
import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

// `cron-telemetry` arrastra el cliente de Supabase y el de Telegram: acá solo
// se le preguntan constantes, y nada de esto se toca de verdad.
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: { from: vi.fn() } }));
vi.mock("@/lib/telegram", () => ({ sendTelegramAlert: vi.fn(), shortError: (s: string) => s }));

import { mensajeReclamosViejos, CUANTOS_SE_NOMBRAN } from "@/lib/reclamos/aviso-viejos";
import { DIAS_RECLAMO_VIEJO } from "@/lib/reclamos/viejos";
import { CRONS_CONOCIDOS, cronStaleThresholdHours } from "@/lib/cron-telemetry";

const RAIZ = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
const RUTA = "src/app/api/cron/reclamos-viejos/route.ts";
const VERCEL = JSON.parse(leer("vercel.json")) as { crons: Array<{ path: string; schedule: string }> };

/** «Hoy» FIJO: los tests no dependen del día en que corran. */
const HOY = "2026-09-20";
const haceDias = (n: number): string => {
  const [a, m, d] = HOY.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d - n)).toISOString().slice(0, 10);
};

interface R {
  id: string;
  nro_reclamo?: string;
  empresa?: string;
  estado?: string;
  fecha_factura?: string | null;
  /** Precio de un renglón de 1 unidad; el total le suma impuestos. */
  precio?: number;
}
const mk = (o: R) => ({
  id: o.id,
  nro_reclamo: o.nro_reclamo ?? o.id,
  empresa: o.empresa ?? "Fashion Wear",
  estado: o.estado ?? "Creado",
  fecha_factura: o.fecha_factura ?? null,
  reclamo_items: [{ cantidad: 1, precio_unitario: o.precio ?? 100 }],
});

// ═══ 1. El corte, y de dónde sale ═══════════════════════════════════════════
describe("🔴 el corte es el MISMO de la pantalla", () => {
  it("el aviso no escribe su propio número de días", () => {
    const src = leer("src/lib/reclamos/aviso-viejos.ts");
    expect(src).toContain("DIAS_RECLAMO_VIEJO");
    expect(src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, ""))
      .not.toMatch(/\b(?:90|120|180)\b/);
  });

  it("el título lo dice con ese número", () => {
    const m = mensajeReclamosViejos([mk({ id: "A", fecha_factura: haceDias(500) })], HOY)!;
    expect(m).toContain(`más de ${DIAS_RECLAMO_VIEJO} días`);
  });
});

// ═══ 2. Qué dice el mensaje ═════════════════════════════════════════════════
describe("🔴 el mensaje dice cuántos son, cuánto suman y los tres más viejos", () => {
  const reclamos = [
    mk({ id: "FW-0001", empresa: "Fashion Wear", precio: 1000, fecha_factura: haceDias(594) }),
    mk({ id: "VI-0002", empresa: "Vistana International", precio: 500, fecha_factura: haceDias(300) }),
    mk({ id: "FS-0003", empresa: "Fashion Shoes", precio: 200, fecha_factura: haceDias(200) }),
    mk({ id: "FW-0004", precio: 100, fecha_factura: haceDias(DIAS_RECLAMO_VIEJO + 1) }),
    mk({ id: "FW-0005", precio: 100, fecha_factura: haceDias(10) }), // nuevo: no entra
  ];

  it("el titular trae el conteo y el total con impuestos", () => {
    const m = mensajeReclamosViejos(reclamos, HOY)!;
    // (1000 + 500 + 200 + 100) × 1,177 = 2.118,60.
    expect(m).toContain("4 reclamos llevan");
    expect(m).toContain("$2,118.60 en total");
  });

  it("nombra TRES, del más viejo al menos viejo, con empresa · días · monto", () => {
    const m = mensajeReclamosViejos(reclamos, HOY)!;
    expect(m).toContain("• FW-0001 · Fashion Wear · 594 días · $1,177.00");
    expect(m).toContain("• VI-0002 · Vistana · 300 días · $588.50");
    expect(m).toContain("• FS-0003 · Fashion Shoes · 200 días · $235.40");
    expect(m).not.toContain("FW-0004 ·");
    expect(CUANTOS_SE_NOMBRAN).toBe(3);
  });

  it("y los que no caben se cuentan, no se esconden", () => {
    expect(mensajeReclamosViejos(reclamos, HOY)!).toContain("…y 1 más.");
  });

  it("con tres o menos no hay cola de «y N más»", () => {
    const m = mensajeReclamosViejos(reclamos.slice(0, 3), HOY)!;
    expect(m).not.toContain("y 0 más");
    expect(m).not.toContain("…y");
  });

  it("uno solo se dice en singular", () => {
    const m = mensajeReclamosViejos([mk({ id: "A", fecha_factura: haceDias(500) })], HOY)!;
    expect(m).toContain("1 reclamo lleva más de");
  });

  it("dice DÓNDE están, sin jerga ni nombres de tabla", () => {
    const m = mensajeReclamosViejos(reclamos, HOY)!;
    expect(m).toContain("Reclamos");
    expect(m).toContain("Por cobrar");
    expect(m).not.toMatch(/reclamo_items|fecha_factura|supabase|SELECT/i);
    // 🔴 Y NO lleva el prefijo de SISTEMA: es negocio.
    expect(m).not.toContain("🔧 SISTEMA");
  });

  it("⚠️ NO lleva advertencias al lado de los días: la fecha de la factura es la que hay", () => {
    const m = mensajeReclamosViejos(reclamos, HOY)!;
    expect(m).not.toMatch(/pueden ser más viejas|subestimad|aproximad/i);
  });
});

// ═══ 3. Lo que NO se manda ══════════════════════════════════════════════════
describe("🔴 sin nada viejo no se manda nada", () => {
  it("ningún reclamo pasado del corte → null, nunca un «todo al día»", () => {
    expect(mensajeReclamosViejos([mk({ id: "A", fecha_factura: haceDias(10) })], HOY)).toBeNull();
  });

  it("la lista vacía también", () => {
    expect(mensajeReclamosViejos([], HOY)).toBeNull();
  });

  it("⚠️ un reclamo PAGADO no entra aunque sea de hace dos años", () => {
    expect(mensajeReclamosViejos([mk({ id: "A", estado: "Pagado", fecha_factura: haceDias(700) })], HOY)).toBeNull();
  });

  it("⚠️ uno SIN fecha de factura tampoco: no se adivina una fecha", () => {
    expect(mensajeReclamosViejos([mk({ id: "A", fecha_factura: null })], HOY)).toBeNull();
  });

  it("y «En proceso» SÍ entra: sigue siendo plata por cobrar", () => {
    expect(mensajeReclamosViejos([mk({ id: "A", estado: "En proceso", fecha_factura: haceDias(500) })], HOY))
      .toContain("1 reclamo lleva");
  });
});

// ═══ 4. El cron ═════════════════════════════════════════════════════════════
describe("🔴 el cron está registrado por los dos lados", () => {
  const entradas = VERCEL.crons.filter((c) => c.path === "/api/cron/reclamos-viejos");

  it("UNA entrada en vercel.json, los LUNES a las 14:00 UTC (9:00 a.m. Panamá)", () => {
    expect(entradas.length).toBe(1);
    expect(entradas[0].schedule).toBe("0 14 * * 1");
  });

  it("una entrada = una ocurrencia: nada de listas de horas ni de días", () => {
    expect(entradas[0].schedule).not.toContain(",");
  });

  it("y está en el registro de código, para que alguien lo vigile", () => {
    expect(CRONS_CONOCIDOS.has("reclamos-viejos")).toBe(true);
  });

  it("🔴 con umbral SEMANAL: 26 h lo darían por caído seis días de cada siete", () => {
    expect(cronStaleThresholdHours("reclamos-viejos")).toBe(8 * 24);
  });

  it("la ruta existe y pide `CRON_SECRET` (o sesión de admin)", () => {
    const src = leer(RUTA);
    expect(src).toContain("process.env.CRON_SECRET");
    expect(src).toContain("Unauthorized");
  });

  it("🔴 manda por `enviarNegocio`, nunca `sendTelegramAlert` directo", () => {
    const src = leer(RUTA);
    expect(src).toContain("enviarNegocio(");
    expect(src).not.toContain("sendTelegramAlert");
    expect(src).not.toContain("enviarSistema");
  });

  it("registra su corrida aunque no haya nada que avisar", () => {
    const src = leer(RUTA);
    expect(src).toContain("recordCronHeartbeat");
    // El heartbeat va FUERA del `if (mensaje)`: «no había nada» es un éxito.
    const iEnvio = src.lastIndexOf("enviarNegocio(");
    const iHeart = src.lastIndexOf("recordCronHeartbeat(");
    expect(iHeart).toBeGreaterThan(iEnvio);
    // Y no cuelga de que se haya mandado algo: si se condicionara, un mes sin
    // reclamos viejos haría sonar «esta tarea dejó de correr» sin ser cierto.
    expect(src).toMatch(/\n {2}await recordCronHeartbeat\(CRON_NAME\);/);
    expect(src).not.toMatch(/if \([^)]*\)\s*await recordCronHeartbeat/);
  });

  it("🔴 NO toca Switch — por eso la separación de 15 min no le aplica", () => {
    const src = leer(RUTA);
    expect(src).not.toMatch(/switch-soft|switch\/client|web-client|switch_sync_log/i);
    expect(src).toContain("supabaseServer");
  });

  it("⚠️ y solo LEE reclamos: un aviso no escribe nada del negocio", () => {
    const src = leer(RUTA).replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, "");
    expect(src).not.toMatch(/\.update\(|\.insert\(|\.upsert\(|\.delete\(/);
  });

  it("tiene modo prueba que NO manda el mensaje", () => {
    expect(leer(RUTA)).toContain('get("test") === "true"');
  });

  it("⚠️ y `docs/crons.md` lo dice a mano (el candado protege el código, no la tabla)", () => {
    const doc = leer("docs/crons.md");
    expect(doc).toContain("/api/cron/reclamos-viejos");
    expect(doc).toContain("0 14 * * 1");
  });
});
