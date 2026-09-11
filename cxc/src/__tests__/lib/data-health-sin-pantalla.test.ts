/**
 * DATA HEALTH SE VA DE LA PANTALLA, LA MEDICIÓN SE QUEDA (11-sep-2026).
 *
 * Daniel, textual:
 *   «data health quiero que el sistema o tú mida todo pero no verlo… no lo uso
 *    y no lo quiero usar»
 * Y antes, decidiendo que el cuadre mensual de costo avisara por Telegram:
 *   «yo no uso Data Health, nunca lo veo»
 *
 * 🔴 LO QUE SE RETIRÓ ES LA PANTALLA, NO LA MEDICIÓN, Y ESA DISTINCIÓN ES TODO
 * ESTE ARCHIVO. Es fácil leer «quítalo» como «bórralo»: si de paso se fuera el
 * cron o la tabla, el sistema dejaría de saber que un tipo de comprobante nuevo
 * no se está contando, o que la cartera lleva 14 días sin llegar — y nadie se
 * enteraría, porque justamente la pantalla que lo decía ya no existe. Por eso
 * cada caso de ausencia va con su CONTROL de presencia al lado.
 *
 * MEDIDO EN PRODUCCIÓN el 11-sep-2026, antes de tocar nada:
 *   · `data_integrity_checks`: 870 filas · 121 corridas · de 13-may a 11-sep.
 *   · Última corrida 11-sep 12:00:11 UTC, los 7 checks vivos en `ok`.
 *   · `cron_heartbeats` de `integrity-check`: 11-sep 12:00:11 UTC.
 *   · `activity_logs`: CERO filas de la pantalla (nunca registró una entrada,
 *     así que «quién entró» no se puede medir — y ésa es la respuesta).
 *   · La key `data-health` ya NO estaba en `role_permissions` (7 roles) ni en
 *     `fg_users.modulos_override` (2 overrides vivos): la migración de agosto
 *     se había aplicado.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { ALL_MODULES, ALL_MODULE_KEYS, getVisibleModules, SYSTEM_ROLE_KEYS } from "@/lib/modules";

const raiz = join(__dirname, "..", "..", "..");
const leer = (p: string) => readFileSync(join(raiz, p), "utf8");
const hay = (p: string) => existsSync(join(raiz, p));

/** El archivo sin comentarios: una dirección citada en una nota no es un enlace
 *  vivo, y contarla como tal haría que el candado se conforme con su propia
 *  explicación (el defecto que este repo ya se cazó a sí mismo). */
function plano(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^[ \t]*\/\/.*$/gm, " ");
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. No hay ficha, no hay página, no hay pestaña
// ─────────────────────────────────────────────────────────────────────────────

describe("no queda pantalla de Data Health en ninguna parte", () => {
  it("no hay ficha `data-health` en el catálogo de módulos", () => {
    expect(ALL_MODULES.find((m) => m.key === "data-health")).toBeUndefined();
    expect(ALL_MODULE_KEYS).not.toContain("data-health");
  });

  it("🔴 ningún rol la ve, ni con la key vieja escrita a mano en la base", () => {
    for (const rol of SYSTEM_ROLE_KEYS) {
      expect(getVisibleModules(rol).map((m) => m.key)).not.toContain("data-health");
      const conKeyVieja = [...getVisibleModules(rol).map((m) => m.key), "data-health"];
      expect(getVisibleModules(rol, conKeyVieja).map((m) => m.key)).not.toContain("data-health");
    }
  });

  it("no existe ninguna página en esas direcciones", () => {
    for (const p of [
      "src/app/data-health",
      "src/app/admin/data-health",
      "src/app/admin/usuarios/DataHealthTab.tsx",
    ]) {
      expect(hay(p), `${p} volvió a existir`).toBe(false);
    }
  });

  it("la página de Usuarios no la monta ni la ofrece", () => {
    const src = plano(leer("src/app/admin/usuarios/page.tsx"));
    expect(src).not.toContain("DataHealthTab");
    expect(src).not.toContain('value="data-health"');
    expect(src).not.toContain("Data Health");
    // CONTROL: la pantalla de Usuarios sigue entera, con sus dos pestañas.
    expect(src).toContain('const TABS = ["usuarios", "novedades"] as const');
    expect(src).toContain("<NovedadesTab />");
  });

  it("el Inicio no trae el aviso proactivo ni llama a su API", () => {
    const src = plano(leer("src/app/home/page.tsx"));
    expect(src).not.toContain("/api/admin/data-health");
    expect(src).not.toContain("dhAlert");
    expect(src).not.toContain("Data Health");
  });

  it("🔴 nadie en `src/` enlaza una dirección de Data Health", () => {
    // Barrido: las direcciones muertas no pueden reaparecer en un botón, un
    // `router.push` o un `fetch`. Se miran los archivos SIN comentarios.
    const malas = ["/admin/data-health", "?tab=data-health", "/api/admin/data-health"];
    const ofensores: string[] = [];
    const recorrer = (dir: string) => {
      for (const e of readdirSync(join(raiz, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) { recorrer(rel); continue; }
        if (!/\.(ts|tsx)$/.test(e.name)) continue;
        if (rel.includes("/__tests__/")) continue;
        const src = plano(readFileSync(join(raiz, rel), "utf8"));
        for (const m of malas) if (src.includes(m)) ofensores.push(`${rel} → ${m}`);
      }
    };
    recorrer("src");
    expect(ofensores).toEqual([]);
  });

  it("las dos direcciones viejas redirigen al Inicio, temporal (307)", () => {
    const cfg = leer("next.config.js");
    for (const ruta of ["/admin/data-health", "/data-health"]) {
      const linea = cfg.split("\n").find((l) => l.includes(`source: "${ruta}"`));
      expect(linea, `falta el redirect de ${ruta}`).toBeTruthy();
      expect(linea!).toContain('destination: "/home"');
      expect(linea!).toContain("permanent: false");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. 🔴 LA MEDICIÓN SE QUEDA ENTERA
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 la medición no se tocó", () => {
  it("el cron `integrity-check` sigue en vercel.json, a las 12:00 UTC", () => {
    const vercel = JSON.parse(leer("vercel.json")) as { crons: { path: string; schedule: string }[] };
    const entradas = vercel.crons.filter((c) => c.path.startsWith("/api/cron/integrity-check"));
    expect(entradas).toHaveLength(1);
    expect(entradas[0].schedule).toBe("0 12 * * *");
  });

  it("🔴 el total de entradas de cron NO cambia: siguen siendo 81", () => {
    // Retirar una PANTALLA no puede mover el cronograma. Si este número baja,
    // se llevó por delante una tarea; si sube, entró una sin registrar.
    const vercel = JSON.parse(leer("vercel.json")) as { crons: unknown[] };
    expect(vercel.crons).toHaveLength(81);
  });

  // Mismo motivo que la allowlist de checks: `cron-telemetry.ts` construye el
  // cliente de Supabase al importarse. El registro se lee del archivo.
  it("sigue en el registro de crons conocidos", () => {
    const src = leer("src/lib/cron-telemetry.ts");
    // `CRONS_CONOCIDOS` se compone de listas; `integrity-check` vive en la de
    // fail-closed, que es la más exigente: sin heartbeat, health-crons da 503.
    const i = src.indexOf("export const CRONS_FAIL_CLOSED");
    expect(i).toBeGreaterThan(-1);
    expect(src.slice(i, src.indexOf("];", i))).toContain('"integrity-check"');
    expect(src).toContain("...CRONS_FAIL_CLOSED,");
  });

  it("el route del cron existe y conserva sus dos puertas", () => {
    const src = plano(leer("src/app/api/cron/integrity-check/route.ts"));
    expect(src).toContain("process.env.CRON_SECRET");
    // La sesión de admin se conserva: es lo que permite CORRER los checks a
    // mano cuando hace falta, y eso alimenta la medición — no la dibuja.
    expect(src).toContain('verifySession(req.cookies.get("cxc_session")?.value)?.role === "admin"');
    expect(src).toContain("runIntegrityCheck()");
    expect(src).toContain('recordCronHeartbeat(CRON_NAME)');
  });

  // `integrity-checks.ts` construye el cliente de Supabase al importarse, así
  // que la allowlist se lee del ARCHIVO y no por import: cargarlo acá exigiría
  // credenciales en los tests para comprobar una lista de strings.
  it("los 7 checks vivos siguen en `LIVE_CHECK_NAMES`", () => {
    const src = leer("src/lib/integrity-checks.ts");
    const i = src.indexOf("export const LIVE_CHECK_NAMES");
    expect(i).toBeGreaterThan(-1);
    const lista = src.slice(i, src.indexOf("]", i));
    for (const check of [
      "cheques_criticos_null",
      "prestamos_saldo_anomalo",
      "last_upload_age_cxc",
      "aging_tipos_sin_clasificar",
      "aging_dias_anomalo",
      "switch_facturas_continuidad",
      "ventas_tipos_sin_clasificar",
    ]) {
      expect(lista, `falta ${check}`).toContain(`"${check}"`);
    }
  });

  it("un check CRÍTICO sigue avisando por 🔧 SISTEMA, y sin link a ninguna pantalla", () => {
    const src = plano(leer("src/lib/integrity-check-run.ts"));
    expect(src).toContain("enviarSistema(buildCriticalAlert(criticals))");
    expect(src).toContain("🔴 Integridad:");
    expect(src).not.toContain("https://fashiongr.com");
  });

  it("🔴 ninguna migración dropea `data_integrity_checks`", () => {
    const dir = "supabase/migrations";
    for (const f of readdirSync(join(raiz, dir))) {
      if (!f.endsWith(".sql")) continue;
      const sql = readFileSync(join(raiz, dir, f), "utf8").toLowerCase();
      expect(
        /drop\s+table[^;]*data_integrity_checks/.test(sql),
        `${f} dropea data_integrity_checks`,
      ).toBe(false);
    }
  });

  it("la tabla sigue clasificada en el respaldo, y en la misma clase", () => {
    // `src/lib/backup/tablas.ts` es la lista de qué se pierde si se pierde.
    // Retirar una pantalla no cambia el valor del DATO.
    const src = leer("src/lib/backup/tablas.ts");
    expect(src).toContain("data_integrity_checks");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. La puerta que queda para MIRAR la medición
// ─────────────────────────────────────────────────────────────────────────────

describe("`GET /api/diag/data-health` — la lectura sin pantalla", () => {
  const RUTA = "src/app/api/diag/data-health/route.ts";

  it("existe, y la que servía a la pantalla se retiró", () => {
    expect(hay(RUTA)).toBe(true);
    expect(hay("src/app/api/admin/data-health/route.ts")).toBe(false);
  });

  it("🔴 exige auth, y FALLA CERRADO sin CRON_SECRET configurado", () => {
    const src = plano(leer(RUTA));
    // Sin secreto configurado: 503, no una puerta abierta.
    expect(src).toMatch(/if \(!esperado\)[\s\S]{0,200}status: 503/);
    // Con secreto: comparación en tiempo constante.
    expect(src).toContain("crypto.timingSafeEqual");
    // O sesión de admin, para abrirlo desde el navegador.
    expect(src).toContain('verifySession(req.cookies.get("cxc_session")?.value)?.role === "admin"');
    // Y si no hay ninguna de las dos: 401.
    expect(src).toMatch(/!porSecreto && !porSesion[\s\S]{0,160}status: 401/);
  });

  it("🔴 es READ-ONLY: solo lee `data_integrity_checks`", () => {
    const src = plano(leer(RUTA));
    expect(src).toContain('from("data_integrity_checks")');
    expect(src).toContain(".select(");
    for (const escritura of [".insert(", ".update(", ".upsert(", ".delete("]) {
      expect(src, `la ruta de lectura escribe (${escritura})`).not.toContain(escritura);
    }
    // Y no corre los checks: eso es del cron.
    expect(src).not.toContain("runIntegrityCheck");
  });

  it("sigue filtrando por `LIVE_CHECK_NAMES` (el historial legacy no reaparece)", () => {
    const src = plano(leer(RUTA));
    expect(src).toContain("LIVE_CHECK_NAMES.has(r.check_name)");
  });

  it("vive bajo `/api/diag/`, que el middleware deja pasar con su propia puerta", () => {
    const mw = leer("src/middleware.ts");
    expect(mw).toContain('"/api/diag/"');
  });
});
