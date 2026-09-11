/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CANDADO — EL LECTOR DE FACTURAS AVISA CUANDO DEJA DE LEER (11-sep-2026)
 *
 * La `ANTHROPIC_API_KEY` de producción estuvo INVÁLIDA un tiempo que no se
 * puede medir y los dos lectores de PDF —Marketing y Reclamos— fallaron en
 * silencio: las pantallas decían «no se pudo leer» y se seguía tecleando a
 * mano, así que nadie reportó nada y nadie rotó la llave.
 *
 * Daniel, textual: «si se me acaba o algo que me llegue notificación a telegram».
 *
 * Este archivo cierra las cuatro cosas que hacen que eso no vuelva a pasar:
 *   1. QUÉ avisa — las tres causas, una por una.
 *   2. QUÉ **NO** avisa — el control: un PDF ilegible o un 500 no son noticia.
 *   3. El anti-loop de 7 días por CAUSA, marcado DESPUÉS de que Telegram
 *      confirme (la lección de `silencio-de-datos-io` y de los cheques).
 *   4. Que haya UN SOLO punto de llamada a Anthropic — si nace un tercer
 *      lector con su propio `fetch`, el aviso no lo cubriría.
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";

const enviarSistema = vi.fn(async (_texto: string) => true);
const logCronError = vi.fn(
  async (_tipo: string, _mensaje: string, _ctx?: unknown, _opts?: unknown) => {},
);
const limit = vi.fn(async () => ({
  data: [] as unknown[] | null,
  error: null as { message: string } | null,
}));

vi.mock("@/lib/alertas/canal", () => ({ enviarSistema: (t: string) => enviarSistema(t) }));
vi.mock("@/lib/cron-telemetry", () => ({
  logCronError: (t: string, m: string, c?: unknown, o?: unknown) => logCronError(t, m, c, o),
}));
vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: {
    from: () => ({ select: () => ({ eq: () => ({ gte: () => ({ limit }) }) }) }),
  },
}));

import {
  CAUSAS_LECTOR,
  DIAS_ENTRE_AVISOS,
  TIPO_LECTOR,
  clasificarFalloAnthropic,
  mensajeLectorFacturas,
  tipoDeCausa,
  type CausaLector,
} from "@/lib/alertas/lector-facturas";
import { avisarLectorCaido, yaAvisadoLector } from "@/lib/alertas/lector-facturas-io";

/** El cuerpo tal como lo manda la API de Anthropic. */
const body = (tipo: string, mensaje: string) => ({ type: "error", error: { type: tipo, message: mensaje } });

const leer = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

const RUTA_MARKETING = "src/app/api/marketing/ia/leer-factura/route.ts";
const RUTA_RECLAMOS = "src/app/api/reclamos/ia/leer-factura/route.ts";
const CLIENTE_IA = "src/lib/ia/anthropic.ts";

beforeEach(() => {
  enviarSistema.mockClear().mockResolvedValue(true);
  logCronError.mockClear();
  limit.mockClear().mockResolvedValue({ data: [], error: null });
});

// ── 1. LAS TRES CAUSAS ──────────────────────────────────────────────────────

describe("clasificarFalloAnthropic — las TRES causas que avisan", () => {
  it("llave inválida: 401 authentication_error", () => {
    expect(
      clasificarFalloAnthropic(401, body("authentication_error", "invalid x-api-key")),
    ).toBe("llave");
  });

  it("llave sin permiso: 403 permission_error", () => {
    expect(clasificarFalloAnthropic(403, body("permission_error", "not allowed"))).toBe("llave");
  });

  it("la llave también se reconoce por el TIPO aunque el status no llegue", () => {
    expect(clasificarFalloAnthropic(undefined, body("authentication_error", ""))).toBe("llave");
  });

  it("crédito agotado: llega como 400 y se reconoce por el MENSAJE, no por el status", () => {
    expect(
      clasificarFalloAnthropic(
        400,
        body(
          "invalid_request_error",
          "Your credit balance is too low to access the Anthropic API, please go to Plans & Billing to upgrade or purchase credits.",
        ),
      ),
    ).toBe("credito");
  });

  it("crédito: un 402 también, aunque el cuerpo no diga nada", () => {
    expect(clasificarFalloAnthropic(402, undefined)).toBe("credito");
  });

  it("tope de uso: 429 rate_limit_error", () => {
    expect(clasificarFalloAnthropic(429, body("rate_limit_error", "rate limit"))).toBe("limite");
    expect(clasificarFalloAnthropic(undefined, body("rate_limit_error", ""))).toBe("limite");
  });

  it("las tres causas declaradas son exactamente las tres que el mensaje sabe redactar", () => {
    expect([...CAUSAS_LECTOR]).toEqual(["llave", "credito", "limite"]);
    for (const c of CAUSAS_LECTOR) expect(mensajeLectorFacturas(c).length).toBeGreaterThan(200);
  });
});

// ── 2. EL CONTROL: LO QUE NO AVISA ──────────────────────────────────────────

describe("🔴 CONTROL — un PDF ilegible o una caída pasajera NO avisan", () => {
  it("un 500 leyendo un PDF roto no avisa", () => {
    expect(clasificarFalloAnthropic(500, body("api_error", "Internal server error"))).toBeNull();
  });

  it("un 400 por un documento que no se pudo procesar no avisa", () => {
    expect(
      clasificarFalloAnthropic(400, body("invalid_request_error", "Could not process document")),
    ).toBeNull();
  });

  it("Anthropic saturado (529 overloaded) no avisa: se arregla solo", () => {
    expect(clasificarFalloAnthropic(529, body("overloaded_error", "Overloaded"))).toBeNull();
  });

  it("un timeout o un corte de red no avisan", () => {
    expect(clasificarFalloAnthropic(undefined, "Connection error.")).toBeNull();
    expect(clasificarFalloAnthropic(undefined, undefined)).toBeNull();
  });

  it("un 404 de modelo retirado no avisa: no es la llave ni el saldo", () => {
    expect(clasificarFalloAnthropic(404, body("not_found_error", "model not found"))).toBeNull();
  });
});

// ── 3. EL TEXTO: LA REGLA DE TRES ───────────────────────────────────────────

describe("el mensaje dice qué pasó / qué significa / qué hacer", () => {
  it.each(CAUSAS_LECTOR as CausaLector[])("«%s» trae las tres partes y la pantalla exacta", (causa) => {
    const m = mensajeLectorFacturas(causa);
    expect(m).toContain("El lector de facturas no está leyendo");
    expect(m).toContain("Qué significa:");
    expect(m).toContain("Qué hacer:");
    expect(m).toContain("console.anthropic.com");
    // No se lo lleva por delante a nadie: se puede seguir tecleando.
    expect(m).toMatch(/a mano/);
  });

  it("la llave y el crédito mandan a pantallas DISTINTAS — si no, el mensaje no sirve", () => {
    expect(mensajeLectorFacturas("llave")).toContain("API Keys");
    expect(mensajeLectorFacturas("llave")).toContain("ANTHROPIC_API_KEY");
    expect(mensajeLectorFacturas("credito")).toContain("Billing");
    expect(mensajeLectorFacturas("credito")).toContain("La llave no hay que cambiarla");
  });

  it("nada de voseo ni de jerga técnica en lo que Daniel lee", () => {
    for (const c of CAUSAS_LECTOR) {
      const m = mensajeLectorFacturas(c);
      expect(m).not.toMatch(/\b(elegí|revisá|mirá|tenés|podés|acá|andá)\b/i);
      expect(m).not.toMatch(/\b(401|403|429|status|HTTP)\b/);
    }
  });
});

// ── 4. EL ANTI-LOOP ─────────────────────────────────────────────────────────

describe("anti-loop: una vez cada 7 días POR CAUSA", () => {
  it("la ventana son 7 días, la misma de todas las alertas de la casa", () => {
    expect(DIAS_ENTRE_AVISOS).toBe(7);
  });

  it("la clave del dedup lleva la causa adentro: que se venza la llave no tapa que se acabe el crédito", () => {
    expect(tipoDeCausa("llave")).toBe(`${TIPO_LECTOR}:llave`);
    expect(new Set(CAUSAS_LECTOR.map(tipoDeCausa)).size).toBe(CAUSAS_LECTOR.length);
  });

  it("la primera vez avisa y marca el dedup con la causa", async () => {
    expect(await avisarLectorCaido("llave", "marketing")).toBe(true);
    expect(enviarSistema).toHaveBeenCalledTimes(1);
    expect(logCronError).toHaveBeenCalledTimes(1);
    expect(logCronError.mock.calls[0][0]).toBe("lector_facturas:llave");
    // el aviso propio ya salió: logCronError NO puede mandar el suyo encima
    expect(logCronError.mock.calls[0][3]).toEqual({ telegram: false });
  });

  it("si ya se avisó en la ventana, NO repite", async () => {
    limit.mockResolvedValue({ data: [{ id: "x" }], error: null });
    expect(await avisarLectorCaido("credito", "reclamos")).toBe(false);
    expect(enviarSistema).not.toHaveBeenCalled();
    expect(logCronError).not.toHaveBeenCalled();
  });

  it("🩸 si Telegram NO confirma, el dedup NO se marca — el silencio de 7 días no se quema", async () => {
    enviarSistema.mockResolvedValue(false);
    expect(await avisarLectorCaido("limite", "marketing")).toBe(false);
    expect(enviarSistema).toHaveBeenCalledTimes(1);
    expect(logCronError).not.toHaveBeenCalled();
  });

  it("fail-OPEN: si no se puede leer el registro del dedup, se avisa igual", async () => {
    limit.mockResolvedValue({ data: null, error: { message: "base caída" } });
    expect(await yaAvisadoLector("llave")).toBe(false);
    expect(await avisarLectorCaido("llave", "reclamos")).toBe(true);
    expect(enviarSistema).toHaveBeenCalledTimes(1);
  });

  it("avisar NUNCA lanza: cuelga del camino de alguien que está subiendo un PDF", async () => {
    enviarSistema.mockRejectedValue(new Error("Telegram explotó"));
    await expect(avisarLectorCaido("llave", "marketing")).resolves.toBe(false);
  });
});

// ── 5. UN SOLO PUNTO DE LLAMADA ─────────────────────────────────────────────

describe("🔴 hay UN solo punto de llamada a Anthropic, y es el que avisa", () => {
  it("solo `lib/ia/anthropic.ts` importa el SDK", () => {
    const conSdk = ["src/lib", "src/app", "src/components"].flatMap((dir) => archivos(dir))
      .filter((f) => /from "@anthropic-ai\/sdk"/.test(leer(f)));
    expect(conSdk).toEqual([CLIENTE_IA]);
  });

  it("las DOS rutas de lectura de facturas pasan por él", () => {
    for (const r of [RUTA_MARKETING, RUTA_RECLAMOS]) {
      const src = leer(r);
      expect(src).toContain('from "@/lib/ia/anthropic"');
      expect(src).toContain("leerPdfConAnthropic");
      expect(src).not.toContain("new Anthropic(");
    }
  });

  it("cada lector sigue mandando SU modelo y SU prompt: acá no se elige ninguno", () => {
    const cliente = leer(CLIENTE_IA);
    expect(cliente).not.toMatch(/claude-[a-z0-9-]+"/);
    expect(leer(RUTA_MARKETING)).toContain('const MODEL = "claude-sonnet-4-6"');
    expect(leer(RUTA_RECLAMOS)).toContain("MODELO_LECTOR");
  });

  it("el punto de llamada clasifica y avisa, y vuelve a lanzar el error", () => {
    const cliente = leer(CLIENTE_IA);
    expect(cliente).toContain("clasificarFalloAnthropic");
    expect(cliente).toContain("avisarLectorCaido");
    expect(cliente).toMatch(/throw err;/);
  });

  it("el 429 que llega hasta el aviso ya se reintentó: por eso se puede llamar persistente", () => {
    expect(leer(CLIENTE_IA)).toMatch(/maxRetries: MAX_REINTENTOS/);
  });
});

function archivos(dir: string): string[] {
  const base = path.join(process.cwd(), dir);
  if (!fs.existsSync(base)) return [];
  const out: string[] = [];
  const caminar = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) caminar(full);
      else if (/\.tsx?$/.test(e.name)) out.push(path.relative(process.cwd(), full));
    }
  };
  caminar(base);
  return out;
}
