/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 EL AVISO DEL RELOJ: A LAS 24 HORAS Y DE LUNES A VIERNES — el candado
 * (15-sep-2026).
 *
 * Daniel, con la captura de Telegram delante: cuatro mensajes en 35 minutos por
 * el reloj de Multifashion —«falló 3 veces» / «ya volvió» / «falló 3 veces» /
 * «ya volvió»—, a las 11:04, 11:11, 11:22 y 11:39 de la noche.
 *
 * 🔑 EL DATO QUE FALTABA LO PUSO ÉL: *«pero la PC del reloj está apagada a estas
 * horas»*. El reloj de Multifashion vive EN LA TIENDA, que cierra a las 7. Que
 * de noche no se pueda leer NO ES UNA AVERÍA: es que la tienda está cerrada.
 *
 * Su decisión, textual: *«¿que me avise si lleva más de 24 horas, si de lunes a
 * viernes?»*.
 *
 * 🔴 LO QUE SE PROTEGE:
 *
 *   A. El umbral son 24 horas (eran 6).
 *   B. Se mide la última vez que se pudo LEER EL RELOJ, no el último contacto
 *      de la PC — que es exactamente el caso que se escapaba.
 *   C. Falla ABIERTA: sin la migración corrida, cae a `visto_en` y se comporta
 *      como antes. Nunca calla de más.
 *   D. De lunes a viernes lo decide `vercel.json`, no una condición en el código.
 *   E. CONTROL: el candado anti-repetición NO se fue, y el aviso sigue sonando
 *      en cada pasada mientras el reloj siga mudo.
 * ─────────────────────────────────────────────────────────────────────────── */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

import {
  HORAS_ENTRE_AVISOS_VIGIA,
  HORAS_PARA_VIGIA,
  textoSilencio,
  vigiaDebeAlertar,
} from "@/lib/asistencia/agente";

const RAIZ = path.resolve(__dirname, "../../..");
const leer = (p: string) => fs.readFileSync(path.join(RAIZ, p), "utf8");

const AHORA = Date.parse("2026-09-15T15:00:00Z");
const haceH = (h: number) => new Date(AHORA - h * 3_600_000).toISOString();

// ═════════════════════════════════════════════════════════════════════════════
describe("A. 🔴 el umbral son 24 horas", () => {
  it("la constante lo dice", () => {
    expect(HORAS_PARA_VIGIA).toBe(24);
  });

  it("🩸 una noche con la tienda cerrada NO suena (el caso de Multifashion)", () => {
    // Cierra a las 7 de la noche; a las 10 de la mañana siguiente llevan ~15 h.
    // Con el umbral viejo de 6 h esto sonaba TODAS las noches.
    expect(vigiaDebeAlertar({ dispositivo: "reloj acs", leido_ok_en: haceH(15) }, AHORA)).toBe(false);
  });

  it("🔴 un día hábil entero sin poder leer el reloj SÍ suena", () => {
    expect(vigiaDebeAlertar({ dispositivo: "reloj acs", leido_ok_en: haceH(26) }, AHORA)).toBe(true);
  });

  it("justo en las 24 h todavía no: se pide MÁS de 24", () => {
    expect(vigiaDebeAlertar({ dispositivo: "d", leido_ok_en: haceH(24) }, AHORA)).toBe(false);
    expect(vigiaDebeAlertar({ dispositivo: "d", leido_ok_en: haceH(24.5) }, AHORA)).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("B. 🔴 se mide el RELOJ, no la PC", () => {
  it("🩸 EL CASO QUE SE ESCAPABA: la PC prendida y reportando, el reloj mudo hace 3 días", () => {
    // `visto_en` fresco porque el agente sigue dando vueltas y reportando el
    // error; `leido_ok_en` de hace tres días porque no lo puede leer. Midiendo
    // `visto_en` —lo de antes— esto NO habría sonado nunca.
    expect(
      vigiaDebeAlertar(
        { dispositivo: "reloj acs", visto_en: haceH(0.05), leido_ok_en: haceH(72), ultimo_error: "ETIMEDOUT" },
        AHORA,
      ),
    ).toBe(true);
  });

  it("y al revés: el reloj se leyó hace un rato, aunque la PC lleve un rato callada", () => {
    expect(
      vigiaDebeAlertar({ dispositivo: "d", visto_en: haceH(30), leido_ok_en: haceH(2) }, AHORA),
    ).toBe(false);
  });

  it("🔴 el ingest escribe `leido_ok_en` SOLO en el camino del éxito", () => {
    const ingest = leer("src/app/api/asistencia/ingest/route.ts");
    const rama = ingest
      .slice(ingest.indexOf("if (body.error) {"), ingest.indexOf("const eventos ="))
      .replace(/^\s*\/\/.*$/gm, "");
    expect(rama).not.toContain("leido_ok_en");
    expect(ingest).toContain("leido_ok_en: ahora");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("C. 🔴 falla ABIERTA: sin la migración corrida, la conducta de antes", () => {
  it("sin `leido_ok_en` se mide `visto_en`, como siempre", () => {
    expect(vigiaDebeAlertar({ dispositivo: "d", visto_en: haceH(30) }, AHORA)).toBe(true);
    expect(vigiaDebeAlertar({ dispositivo: "d", visto_en: haceH(10) }, AHORA)).toBe(false);
  });

  it("⚠️ nunca calla de más: sin el DDL cubre menos casos, no menos que antes", () => {
    // El único caso que se pierde sin la migración es el del reloj inalcanzable
    // con la PC prendida — que es justamente el que hoy no existía.
    expect(
      vigiaDebeAlertar({ dispositivo: "d", visto_en: haceH(0.05), ultimo_error: "ETIMEDOUT" }, AHORA),
    ).toBe(false);
  });

  it("la migración es aditiva e idempotente, y no toca ni una fila", () => {
    const sql = leer("supabase/migrations/20261130120000_asistencia_leido_ok_en.sql");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS leido_ok_en timestamptz");
    expect(sql).not.toMatch(/\bUPDATE\b|\bDELETE\b|\bDROP\b/);
  });

  it("y la columna está en la lista que `esColumnaFaltante` reconoce", () => {
    expect(leer("src/lib/asistencia/agente.ts")).toContain('"leido_ok_en",');
  });

  it("nunca se reclama por un agente que no se instaló", () => {
    expect(vigiaDebeAlertar({ dispositivo: "d" }, AHORA)).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("D. 🔴 de lunes a viernes lo decide `vercel.json`, no el código", () => {
  it("las TRES pasadas del vigía llevan `1-5`", () => {
    const vercel = JSON.parse(leer("vercel.json")) as { crons: { path: string; schedule: string }[] };
    const suyas = vercel.crons.filter((c) => c.path === "/api/cron/asistencia-vigia");
    expect(suyas).toHaveLength(3);
    for (const c of suyas) expect(c.schedule).toMatch(/\* 1-5$/);
  });

  it("⚠️ el cron NO filtra los días por su cuenta: un cron que corre y no hace nada confunde", () => {
    const cron = leer("src/app/api/cron/asistencia-vigia/route.ts").replace(/^\s*\/\/.*$/gm, "");
    expect(cron).not.toMatch(/getDay\(\)|getUTCDay\(\)/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("E. 🔴 CONTROL: el candado anti-repetición NO se fue", () => {
  it("dos pasadas muy pegadas no mandan dos mensajes por lo mismo", () => {
    expect(
      vigiaDebeAlertar(
        { dispositivo: "d", leido_ok_en: haceH(30), alertado_en: haceH(0.3) },
        AHORA,
      ),
    ).toBe(false);
  });

  it("pero vuelve a avisar en la pasada siguiente mientras siga mudo (Daniel: «telegram me tiene que avisar»)", () => {
    expect(
      vigiaDebeAlertar(
        { dispositivo: "d", leido_ok_en: haceH(30), alertado_en: haceH(HORAS_ENTRE_AVISOS_VIGIA + 1) },
        AHORA,
      ),
    ).toBe(true);
  });

  it("una fecha de aviso ilegible se trata como recién avisado: ante la duda, callar", () => {
    expect(
      vigiaDebeAlertar({ dispositivo: "d", leido_ok_en: haceH(30), alertado_en: "no-es-fecha" }, AHORA),
    ).toBe(false);
  });

  it("el mensaje dice cuánto hace, qué significa y qué hacer", () => {
    const t = textoSilencio("Reloj de Multifashion", 30 * 60);
    expect(t).toContain("Reloj de Multifashion");
    expect(t).toContain("no se puede leer el reloj");
    expect(t).toContain("Qué significa");
    expect(t).toContain("Qué hacer");
    expect(t).toContain("no se pierde ninguna");
  });
});
