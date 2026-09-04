// La sincronización de EGRESOS VARIOS — candados de diseño.
//
// La aritmética vive en `egresos-parser.test.ts` y `egresos-reglas.test.ts`,
// medidas contra el archivo REAL. Acá se protegen las decisiones que, si alguien
// las deshace, rompen algo caro y EN SILENCIO:
//
//  A. La ventana es el AÑO ENTERO y se reescriben los 12 meses.
//  B. SECUENCIAL, con la sesión cerrada, y con los DOS guards (cero silencioso
//     y barrido corto) ANTES de escribir.
//  C. La hora es la MADRUGADA DE PANAMÁ (UTC−5), no la de UTC.
//  D. No se estrena una cuarta alerta de sistema.
//  E. 🔴 LAS DOS FUENTES NO SE SUMAN NUNCA. Enero-2026 está en las dos.
//  F. Sin la DDL corrida, el cron NO abre una sola sesión en Switch.

import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";

vi.mock("@/lib/supabase-server", () => ({ supabaseServer: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock("@/lib/telegram", () => ({ sendTelegramAlert: vi.fn(), shortError: (s: string) => s }));
vi.mock("@/lib/alertas/canal", () => ({ enviarSistema: vi.fn(), enviarNegocio: vi.fn() }));

import {
  rangoDelAnio,
  EGRESOS_EMPRESA_KEYS,
  UMBRAL_BARRIDO_CORTO,
} from "@/lib/switch-api/sync-egresos-varios";
import { SYNC_LOG_TYPES } from "@/lib/switch-api/sync-log-tipos";
import { ALL_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import { GUARDS, umbralMonto, esMontoImposible } from "@/lib/switch-api/monto-guard";
import {
  horaPanamaDeUtc,
  esHorarioDeOficinaPanama,
  SWITCH_CRON_ENTRADAS,
  SEPARACION_MINIMA_MIN,
} from "@/lib/cron-telemetry";

const SRC = path.join(process.cwd(), "src");
const leer = (rel: string) => fs.readFileSync(path.join(SRC, rel), "utf8");

/** Quita comentarios: los barridos tienen que mirar el CÓDIGO. Un archivo que
 *  EXPLICA en prosa por qué no usa `Promise.all` se marcaría a sí mismo. */
const soloCodigo = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const SYNC = soloCodigo(leer(path.join("lib", "switch-api", "sync-egresos-varios.ts")));
const ROUTE = soloCodigo(leer(path.join("app", "api", "cron", "sync-egresos-varios", "route.ts")));
/**
 * ⚠️ `web-client.ts` se lee CRUDO, sin quitarle los comentarios.
 * `soloCodigo` no sirve acá: el archivo contiene el header
 * `Accept: "text/csv,application/octet-stream,*<slash>*"`, y adentro de esa
 * cadena hay una apertura de comentario de bloque que se come el resto del
 * archivo — el barrido pasaría en verde sin haber mirado nada. Por eso las
 * afirmaciones de abajo son literales que no pueden aparecer en prosa.
 */
const WEB = leer(path.join("lib", "switch-api", "web-client.ts"));
const MIGRACION = fs.readFileSync(
  path.join(process.cwd(), "supabase", "migrations", "20260813120000_egresos_varios.sql"),
  "utf8",
);

// ─────────────────────────────────────────────────────────────────────────────
describe("A. la ventana es el AÑO ENTERO", () => {
  it("1-ene al 31-dic — el mismo rango que baja el mayor", () => {
    expect(rangoDelAnio(2026)).toEqual({ desde: "2026-01-01", hasta: "2026-12-31" });
  });

  it("se recorren los 12 meses al escribir, no solo los que traen renglones", () => {
    // Un egreso ANULADO en Switch tiene que desaparecer acá también, y uno al
    // que le corrigieron la fecha no puede quedar duplicado en dos meses.
    expect(SYNC).toMatch(/for \(const mes of mesesDelAnio\(anio\)\)/);
  });

  it("entran las 8 empresas del módulo — las mismas que el mayor", () => {
    expect([...EGRESOS_EMPRESA_KEYS].sort()).toEqual([...ALL_EMPRESA_KEYS].sort());
    expect(EGRESOS_EMPRESA_KEYS).toHaveLength(8);
    expect(EGRESOS_EMPRESA_KEYS).toContain("american_classic");
    // Boston está en el módulo Gastos desde que existe (tiene su propio aviso de
    // alquiler); dejarla afuera haría imposible comparar las dos fuentes ahí.
    expect(EGRESOS_EMPRESA_KEYS).toContain("confecciones_boston");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("B. secuencial, sesión cerrada, y los guards ANTES de escribir", () => {
  it("NO usa Promise.all / allSettled: serían 8 sesiones a la vez", () => {
    expect(SYNC).not.toMatch(/Promise\.all\b/);
    expect(SYNC).not.toMatch(/Promise\.allSettled\b/);
  });

  it("el bucle de empresas es un for…of que espera cada una", () => {
    expect(SYNC).toMatch(/for \(const empresaKey of empresas\)[\s\S]*?await syncEmpresaEgresos/);
  });

  it("la sesión se cierra SIEMPRE, en un finally", () => {
    expect(SYNC).toMatch(/finally\s*\{[\s\S]*?cerrarSesionWeb/);
  });

  it("el reemplazo del mes es ATÓMICO (RPC), no un delete + insert suelto", () => {
    expect(SYNC).toMatch(/rpc\("egresos_reemplazar_mes"/);
    expect(SYNC).not.toMatch(/\.from\("egresos_varios"\)[\s\S]{0,120}\.delete\(/);
  });

  it("guard del CERO SILENCIOSO: no borra un año que ya tenía renglones", () => {
    expect(SYNC).toMatch(/vino vacío pero ya había/);
    // Y el guard corre ANTES de insertar la importación.
    const iGuard = SYNC.indexOf("vino vacío pero ya había");
    const iInsert = SYNC.indexOf('from("egresos_importaciones")');
    expect(iGuard).toBeGreaterThan(-1);
    expect(iGuard).toBeLessThan(iInsert);
  });

  it("guard del BARRIDO CORTO: una descarga a medias no borra los meses que faltan", () => {
    expect(UMBRAL_BARRIDO_CORTO).toBe(0.7);
    expect(SYNC).toMatch(/yaGuardados \* UMBRAL_BARRIDO_CORTO/);
    const iGuard = SYNC.indexOf("UMBRAL_BARRIDO_CORTO");
    const iInsert = SYNC.indexOf('from("egresos_importaciones")');
    expect(iGuard).toBeLessThan(iInsert);
  });

  it("el guard de MONTOS IMPOSIBLES corre antes de escribir, y es el compartido", () => {
    expect(SYNC).toMatch(/particionarFilas\(\s*"egreso_vario"/);
    expect(SYNC).toMatch(/calibrarUmbral\("egreso_vario"/);
    // Nada de escribir la validación a mano: el candado anti-copia del repo.
    expect(SYNC).not.toMatch(/Math\.abs\([^)]*\)\s*>\s*\d/);
  });

  it("los duplicados se REPORTAN, no se descartan en silencio", () => {
    // Un egreso repartido en dos cuentas es legítimo; colapsarlo PERDERÍA plata.
    expect(SYNC).toMatch(/duplicadosExactos\(/);
    expect(SYNC).not.toMatch(/duplicados\.length\s*>\s*0[\s\S]{0,60}filter/);
  });

  it("no baja el archivo por un segundo cliente web: reusa el login del mayor", () => {
    expect(SYNC).toMatch(/from "\.\/web-client"/);
    expect(SYNC).toMatch(/loginSwitchWeb/);
    expect(SYNC).not.toMatch(/users\/login/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("B2. el reporte se baja como manda SU JS, no como el del mayor", () => {
  it("el rango viaja en el POST del exportador (no hay paso que lo fije en sesión)", () => {
    // `caja/egresosvariosexportar` lleva desde/hasta adentro; copiarle al mayor
    // su paso `/asientos/lista` sería llamar a un endpoint que no existe acá.
    expect(WEB).toMatch(/caja\/egresosvariosexportar/);
    expect(WEB).toMatch(/chunk: String\(EGRESOS_CHUNK\)[\s\S]{0,400}?desde,\s*\n\s*hasta,/);
    // Y NO se llama al paso que fija el rango en la sesión del MAYOR.
    const bloque = WEB.slice(WEB.indexOf("export async function fetchEgresosVarios"));
    expect(bloque).not.toMatch(/asientos\/lista/);
  });

  it("sucursal va VACÍA = todas; fijarla en 1 perdería egresos sin dar error", () => {
    expect(WEB).toMatch(/sucursal: ""/);
    expect(WEB).not.toMatch(/sucursal: "1"/);
  });

  it("los filtros van vacíos, NUNCA con la palabra \"null\"", () => {
    // `pais:"null"` ya devolvió una cartera VACÍA con HTTP 200 en este repo.
    expect(WEB).toMatch(/searchInput: ""/);
    expect(WEB).toMatch(/comprascategoria: ""/);
    expect(WEB).toMatch(/comprassubcategoria: ""/);
    expect(WEB).not.toMatch(/comprascategoria: "null"/);
    expect(WEB).not.toMatch(/comprassubcategoria: "null"/);
  });

  it("el archivo se valida por CONTENIDO antes de usarlo (200 no alcanza)", () => {
    expect(WEB).toMatch(/pareceCsvDeEgresos\(csv\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("C. la hora es la MADRUGADA DE PANAMÁ, no la de UTC", () => {
  const entrada = SWITCH_CRON_ENTRADAS.find((e) => e.cron === "sync-egresos-varios");

  it("está declarada en el cronograma de Switch", () => {
    expect(entrada, "sync-egresos-varios falta en SWITCH_CRON_ENTRADAS").toBeTruthy();
    expect(entrada!.hhmmUtc).toBe("1035");
  });

  it("10:35 UTC son las 5:35 a.m. de Panamá — fuera de horario de oficina", () => {
    expect(horaPanamaDeUtc(10)).toBe(5);
    expect(esHorarioDeOficinaPanama(10)).toBe(false);
  });

  it("🩸 la franja 00:20-05:20 UTC NO es madrugada: es la tarde-noche de Panamá", () => {
    expect(horaPanamaDeUtc(1)).toBe(20);
    expect(horaPanamaDeUtc(2)).toBe(21);
  });

  it("y está en vercel.json con el MISMO horario", () => {
    const vercel = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "vercel.json"), "utf8"),
    ) as { crons: Array<{ path: string; schedule: string }> };
    const entradas = vercel.crons.filter((c) => c.path === "/api/cron/sync-egresos-varios");
    expect(entradas).toHaveLength(1); // 1×/día
    expect(entradas[0].schedule).toBe("35 10 * * *");
  });

  it("respeta la separación mínima con TODA entrada que comparta empresa", () => {
    // Es la red que protege la sesión única de Switch: un 2º login mata al 1º.
    const min = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(2));
    const yo = entrada!;
    for (const otra of SWITCH_CRON_ENTRADAS) {
      if (otra === yo) continue;
      const comparte = otra.empresas.some((e) => yo.empresas.includes(e));
      if (!comparte) continue;
      const d = Math.abs(min(otra.hhmmUtc) - min(yo.hhmmUtc));
      const dist = Math.min(d, 24 * 60 - d);
      expect(
        dist,
        `${otra.cron} ${otra.hhmmUtc} queda a ${dist} min de sync-egresos-varios`,
      ).toBeGreaterThanOrEqual(SEPARACION_MINIMA_MIN);
    }
  });

  it("queda a 35 min de la reconciliación, que puede tardar 12", () => {
    // Es la vecina crítica: RECOVERY_BUDGET_MS = 740 s y puede abrir la sesión
    // de cualquier empresa. 35 − 12 = 23 min de aire real.
    const recon = SWITCH_CRON_ENTRADAS.find(
      (e) => e.cron === "switch-reconciliacion" && e.hhmmUtc === "1000",
    );
    expect(recon).toBeTruthy();
    expect(10 * 60 + 35 - (10 * 60)).toBe(35);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("D. no se estrena una cuarta alerta de sistema", () => {
  it("el fallo va por alertSwitchCronErrors (regla de los 2 fallos seguidos)", () => {
    expect(ROUTE).toMatch(/alertSwitchCronErrors/);
  });

  it("el route NO manda Telegram por su cuenta", () => {
    expect(ROUTE).not.toMatch(/enviarSistema|enviarNegocio|sendTelegramAlert/);
  });

  it("el heartbeat se registra SOLO si no falló ninguna empresa", () => {
    expect(ROUTE).toMatch(/if \(fallidas\.length === 0\)[\s\S]{0,80}recordCronHeartbeat/);
  });

  it("'egresos_varios' está en SYNC_LOG_TYPES (si no, la corrida sería invisible)", () => {
    expect(SYNC_LOG_TYPES).toContain("egresos_varios");
  });

  it("y su DDL reescribe el CHECK en la misma migración", () => {
    expect(MIGRACION).toMatch(/switch_sync_log_sync_type_check/);
    expect(MIGRACION).toMatch(/'egresos_varios'/);

    // 🔑 Y no inventa tipos: todo lo que este CHECK admite tiene que estar en
    // SYNC_LOG_TYPES. Al revés NO se puede exigir acá — una migración vieja no
    // puede conocer un tipo que se estrenó después (`cuentas_contables` llegó
    // en 20260813180000, que reescribe el CHECK otra vez). Que el CHECK
    // **VIGENTE** —el de la migración más nueva— tenga la lista COMPLETA lo
    // verifica `sync-log-tipos-check.test.ts`, que es su dueño.
    const bloque = MIGRACION.slice(MIGRACION.indexOf("switch_sync_log_sync_type_check"));
    const admitidos = [...bloque.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(admitidos.length).toBeGreaterThan(10);
    for (const t of admitidos) expect(SYNC_LOG_TYPES).toContain(t);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("E. 🔴 LAS DOS FUENTES NO SE SUMAN — enero está en las dos", () => {
  /** Todos los .ts/.tsx de producción (los tests quedan fuera). */
  function archivosDeProduccion(dir: string, out: string[] = []): string[] {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "__tests__" || e.name === "node_modules") continue;
        archivosDeProduccion(p, out);
      } else if (/\.tsx?$/.test(e.name)) out.push(p);
    }
    return out;
  }

  const ARCHIVOS = archivosDeProduccion(SRC);

  it("hay archivos que barrer (un barrido roto devolvería 0 y pasaría en verde)", () => {
    expect(ARCHIVOS.length).toBeGreaterThan(300);
  });

  it("NINGÚN archivo lee las dos fuentes a la vez", () => {
    // Para sumarlas habría que importar las dos lecturas. Con este candado,
    // hacerlo exige borrar el test a propósito — no puede ocurrir sin querer.
    const culpables = ARCHIVOS.filter((f) => {
      const c = soloCodigo(fs.readFileSync(f, "utf8"));
      return c.includes("leerMayorMes") && c.includes("leerEgresosMes");
    });
    expect(culpables, "un archivo lee el mayor Y los egresos: se pueden sumar").toEqual([]);
  });

  it("no existe ninguna función que combine las dos fuentes", () => {
    const culpables = ARCHIVOS.filter((f) =>
      /sumarFuentes|totalCombinado|gastoUnificado|fusionarFuentes/.test(
        soloCodigo(fs.readFileSync(f, "utf8")),
      ),
    );
    expect(culpables).toEqual([]);
  });

  it("🔴 la pantalla ya no puede pedir el mayor: no hay segunda fuente", () => {
    // El mayor se retiró el 13-ago-2026 y con él el selector de fuente. La regla
    // de "no se suman" no se relajó: se volvió TRIVIAL, porque ya no hay dos
    // fuentes que sumar. Lo que se vigila ahora es que no vuelva por la ventana.
    const cliente = soloCodigo(leer(path.join("app", "gastos-contabilidad", "GastosContabilidadClient.tsx")));
    expect(cliente).not.toMatch(/pedirMayor/);
    expect(cliente).not.toMatch(/RespuestaResumen/);
    expect(cliente).not.toMatch(/SelectorFuente/);
    // Y la única lectura que queda sigue apagada fuera de su pestaña: la base
    // está en compute Micro.
    expect(cliente).toMatch(/pedirEgresos\s*=\s*authChecked && enGastos/);
  });

  it("y la ruta de egresos no devuelve nada del mayor", () => {
    const ruta = soloCodigo(leer(path.join("app", "api", "gastos-contabilidad", "egresos", "route.ts")));
    expect(ruta).not.toMatch(/leerMayorMes|mayor_lineas/);
  });

  it("la tabla de egresos es propia: no escribe en mayor_lineas", () => {
    expect(SYNC).not.toMatch(/mayor_lineas|mayor_reemplazar_mes|mayor_importaciones/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ Cambio de dirección (3-sep-2026). Este bloque se llamaba "sin la DDL
// corrida, NO se toca Switch" y fijaba que un "esa tabla no existe" omitiera el
// cron LIMPIO (503, sin heartbeat). La tolerancia se retiró: la tabla existe
// desde 20260813120000 (verificado en producción). Lo que SE CONSERVA es la
// sonda ANTES de tocar Switch — si la base no contesta, no se abren 8 sesiones—
// pero hoy CUALQUIER error de la sonda es un 500 sin heartbeat, y `omitido` /
// `esTablaAusente` no existen más en este camino.
describe("F. si la base no contesta, NO se toca Switch — y ya no hay 'no instalado'", () => {
  it("el route sondea la base ANTES de sincronizar", () => {
    // Desde el handler: en los imports el orden no significa nada.
    const handler = ROUTE.slice(ROUTE.indexOf("export async function GET"));
    const iChequeo = handler.indexOf("verificarBaseDeEgresos");
    const iSync = handler.indexOf("syncAllEgresos");
    expect(iChequeo).toBeGreaterThan(-1);
    expect(iChequeo).toBeLessThan(iSync);
  });

  it("si la sonda falla responde 500 y NO registra heartbeat; el 503 'no instalado' se fue", () => {
    const bloque = ROUTE.slice(ROUTE.indexOf("await verificarBaseDeEgresos()"), ROUTE.indexOf("const sp ="));
    expect(bloque).toMatch(/status: 500/);
    expect(bloque).not.toMatch(/recordCronHeartbeat/);
    expect(ROUTE).not.toMatch(/status: 503|omitido|instalado/);
  });

  it("la sonda lanza ante CUALQUIER error — un 'no existe la tabla' ya no se lee como 'no instalado'", () => {
    // Si un timeout (o un PGRST205, con la tabla puesta) se leyera como
    // "todavía no corrió el SQL", el cron se apagaría en silencio para siempre.
    expect(SYNC).not.toMatch(/esTablaAusente|egresosInstalado/);
    const sonda = SYNC.slice(SYNC.indexOf("export async function verificarBaseDeEgresos"));
    expect(sonda.slice(0, 300)).toMatch(/if \(error\) throw new Error\(error\.message\)/);
  });

  it("está en SEED_TOLERANT_CRONS, no en los fail-closed", async () => {
    const { CRONS_FAIL_CLOSED, SEED_TOLERANT_CRONS } = await import("@/lib/cron-telemetry");
    expect(SEED_TOLERANT_CRONS).toContain("sync-egresos-varios");
    expect(CRONS_FAIL_CLOSED).not.toContain("sync-egresos-varios");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("G. el guard de montos está calibrado contra el récord REAL", () => {
  const def = GUARDS.egreso_vario;

  it("el récord anotado es el del archivo real de Vistana", () => {
    expect(def.record).toBe(11_700.95);
    expect(def.tabla).toBe("egresos_varios");
    expect(def.porEmpresa).toBe(true);
  });

  it("deja MUCHO más de 7× de aire sobre el récord", () => {
    expect(def.piso / def.record).toBeGreaterThanOrEqual(7);
  });

  it("el egreso más grande de la historia pasa sin problema", () => {
    const umbral = umbralMonto("egreso_vario", []);
    expect(esMontoImposible(11_700.95, umbral)).toBe(false);
    // Y un pago intercompañía grande tampoco se traba: el reporte incluye
    // transferencias, que son legítimamente mucho mayores que un gasto.
    expect(esMontoImposible(500_000, umbral)).toBe(false);
  });

  it("la clase $1.000.000.049,22 sí se frena", () => {
    const umbral = umbralMonto("egreso_vario", []);
    expect(esMontoImposible(1_000_000_049.22, umbral)).toBe(true);
    // Y también en negativo: −$1.000M es tan imposible como +$1.000M.
    expect(esMontoImposible(-1_000_000_049.22, umbral)).toBe(true);
  });

  it("una fila absurda ya guardada NO puede levantar el umbral (anti-envenenamiento)", () => {
    expect(umbralMonto("egreso_vario", [1_000_000_049.22])).toBe(def.piso);
  });
});
