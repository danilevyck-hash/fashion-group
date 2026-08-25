// El login WEB de Switch no se abre en horario de oficina.
//
// EL PROBLEMA (ago-2026). Switch tiene dos puertas: la API JSON (`client.ts`) y
// la APP WEB del panel (`web-client.ts`). La segunda hace `POST /users/login`
// con `changesession="SI"`, y ese "SI" TOMA la sesión: quien esté adentro del
// panel de esa empresa queda expulsado en el acto. El usuario configurado en
// `SWITCH_<EMPRESA>_WEB_USER` es el de Daniel, así que cada login web en
// horario de oficina lo saca a él de Switch mientras trabaja.
//
// Los dos crons que usan esa puerta YA corrían de madrugada (sync-utilidad
// 07:00 UTC = 02:00 Panamá, boston-cartera 08:10 = 03:10). El hueco era la
// RECUPERACIÓN: `sync-utilidad` es colateral de switch-reconciliacion, y la
// reconciliación pasa 10:00 / 14:00 / 18:00 UTC = 05:00 / 09:00 / 13:00 de
// Panamá. Las dos últimas caen en plena jornada.
//
// LO QUE NO ERA EL PROBLEMA, y por eso no se movió un solo horario:
// `sync-recibos` importa de `sync-utilidad` SOLO helpers de fecha (`mesActual`,
// `mesesDeAnio`, el tipo `Mes`); su librería habla por la API JSON. Sus 4
// corridas —07:50, 15:15, 19:15 y 23:15 UTC— NO abren el login web, así que
// mandarlas a la madrugada habría envejecido la CXC todo el día a cambio de
// nada. Ese es el candado C.
//
// Estos tests fijan cuatro cosas:
//   A. La regla horaria: qué pasada puede abrir el login web y cuál no.
//   B. Que el silenciamiento por "recuperación en camino" siga la misma regla —
//      prometer una recuperación de las 18:00 que ya no va a ocurrir sería peor
//      que no prometer nada.
//   C. Barrido estático: SOLO dos módulos importan `web-client`. Si aparece un
//      tercero, el build se pone ROJO y alguien tiene que decidir su horario.
//   D. Barrido estático: un colateral de la reconciliación que llame a una
//      función de login web TIENE que estar en COLATERALES_LOGIN_WEB.
import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";

vi.mock("@/lib/supabase-server", () => ({ supabaseServer: { from: vi.fn() } }));
vi.mock("@/lib/telegram", () => ({
  sendTelegramAlert: vi.fn(),
  shortError: (s: string) => s,
}));
vi.mock("@/lib/alertas/canal", () => ({ enviarSistema: vi.fn(), enviarNegocio: vi.fn() }));

import {
  SWITCH_CRON_ENTRADAS,
  COLATERALES_LOGIN_WEB,
  COLATERAL_RECOVER_AFTER_HOUR_UTC,
  RECONCILIACION_PASS_HOURS,
  esHorarioDeOficinaPanama,
  horaPanamaDeUtc,
  pasadaPuedeUsarLoginWeb,
  pasadasElegiblesParaColateral,
  recoveryStillComingToday,
  cronStaleThresholdHours,
  CRON_STALE_HOURS_DEFAULT,
} from "@/lib/cron-telemetry";

const SRC = path.join(process.cwd(), "src");
const leer = (rel: string) => fs.readFileSync(path.join(SRC, rel), "utf8");

/** Todos los .ts/.tsx bajo src/, sin tests. */
function archivosFuente(dir = SRC, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") continue;
      archivosFuente(full, acc);
    } else if (/\.tsx?$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

/** Borra comentarios: este repo ya pagó cuatro veces el candado que se cumple
 *  con su propia explicación. */
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/**
 * Las PUERTAS al login web: llamarlas abre (directa o indirectamente) una
 * sesión con `changesession="SI"`, que expulsa a quien esté en el panel.
 *
 * Es UNA sola lista para los dos candados que la necesitan — el bloque D (un
 * colateral de la reconciliación tiene que declararse) y el bloque E (un cron
 * que la llame no puede correr en horario de oficina). Con dos copias, la que
 * quede vieja deja de vigilar sin que nada avise. El último test del bloque E
 * la mantiene honesta.
 */
const PUERTAS_LOGIN_WEB = [
  "loginSwitchWeb",
  "fetchUtilidadMes",
  "fetchCarteraAntiguedad",
  "fetchEgresosVarios",
  "fetchIngresosMercancia",
  "syncEmpresaUtilidad",
  "syncAllUtilidad",
  "syncCarteraWeb",
  "syncEmpresaEgresos",
  "syncAllEgresos",
  "syncEmpresaIngresos",
  "syncAllIngresos",
];

/** Crons cuyo route LLAMA a una puerta del login web. Sin listas escritas a
 *  mano: se recorre `app/api/cron/` y se mira el código, sin comentarios. */
const aplicanLaReglaSolos: string[] = [];

function cronsConLoginWeb(): string[] {
  const dir = path.join(SRC, "app", "api", "cron");
  aplicanLaReglaSolos.length = 0;
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const route = path.join(dir, entry.name, "route.ts");
    if (!fs.existsSync(route)) continue;
    const src = sinComentarios(fs.readFileSync(route, "utf8"));
    if (!PUERTAS_LOGIN_WEB.some((fn) => new RegExp(`\\b${fn}\\s*\\(`).test(src))) continue;
    // 🔴 `switch-reconciliacion` SÍ llama una puerta, y por eso NO se le exige
    // horario: es el único que aplica la regla ÉL MISMO, pasada por pasada, con
    // `pasadaPuedeUsarLoginWeb` — sus corridas de las 14:00 y 18:00 corren pero
    // SALTEAN el colateral de login web. Eso es lo que prueban los bloques A, B
    // y D; exigirle acá una hora de madrugada sería pedirle que no exista.
    if (/\bpasadaPuedeUsarLoginWeb\s*\(/.test(src)) {
      aplicanLaReglaSolos.push(entry.name);
      continue;
    }
    out.push(entry.name);
  }
  return out.sort();
}

describe("A. qué hora puede abrir el login web", () => {
  it("Panamá es UTC−5 fijo, y da la vuelta al día sin negativos", () => {
    expect(horaPanamaDeUtc(10)).toBe(5);
    expect(horaPanamaDeUtc(14)).toBe(9);
    expect(horaPanamaDeUtc(18)).toBe(13);
    expect(horaPanamaDeUtc(7)).toBe(2); // sync-utilidad
    expect(horaPanamaDeUtc(2)).toBe(21); // cruza la medianoche hacia atrás
    expect(horaPanamaDeUtc(0)).toBe(19);
  });

  it("las 3 pasadas de reconciliación: solo la de las 10:00 UTC es de madrugada", () => {
    expect(RECONCILIACION_PASS_HOURS).toEqual([10, 14, 18]);
    expect(esHorarioDeOficinaPanama(10)).toBe(false); // 5 a.m.
    expect(esHorarioDeOficinaPanama(14)).toBe(true); // 9 a.m.
    expect(esHorarioDeOficinaPanama(18)).toBe(true); // 1 p.m.
    expect(RECONCILIACION_PASS_HOURS.filter(pasadaPuedeUsarLoginWeb)).toEqual([10]);
  });

  it("los bordes de la oficina: 8 a.m. adentro, 6 p.m. afuera", () => {
    expect(esHorarioDeOficinaPanama(13)).toBe(true); // 8:00 a.m. exactas
    expect(esHorarioDeOficinaPanama(12.99)).toBe(false); // 7:59 a.m.
    expect(esHorarioDeOficinaPanama(23)).toBe(false); // 6:00 p.m. exactas
    expect(esHorarioDeOficinaPanama(22.9)).toBe(true); // 5:54 p.m.
  });

  it("sync-utilidad solo se recupera en la pasada de las 10:00 UTC", () => {
    expect([...COLATERALES_LOGIN_WEB]).toEqual(["sync-utilidad"]);
    expect(pasadasElegiblesParaColateral("sync-utilidad")).toEqual([10]);
  });

  it("los colaterales que NO abren el login web conservan sus 3 pasadas", () => {
    for (const cron of Object.keys(COLATERAL_RECOVER_AFTER_HOUR_UTC)) {
      if (COLATERALES_LOGIN_WEB.has(cron)) continue;
      const minima = COLATERAL_RECOVER_AFTER_HOUR_UTC[cron];
      expect(pasadasElegiblesParaColateral(cron)).toEqual(
        RECONCILIACION_PASS_HOURS.filter((p) => p >= minima),
      );
    }
    // El caso que más importa: sync-recibos NO abre el login web (ver el
    // candado C) y por lo tanto no pierde ninguna oportunidad de recuperación.
    expect(pasadasElegiblesParaColateral("sync-recibos")).toEqual([10, 14, 18]);
  });
});

describe("B. el silenciamiento sigue la misma regla", () => {
  it("antes de las 10:00 UTC la recuperación de utilidad SÍ viene", () => {
    expect(recoveryStillComingToday("sync-utilidad", 8)).toBe(true);
    expect(recoveryStillComingToday("sync-utilidad", 9.9)).toBe(true);
  });

  it("pasadas las 10:00 UTC ya NO viene, y el stale deja de silenciarse", () => {
    // Estricto (>): la pasada en curso no cuenta como "por venir".
    expect(recoveryStillComingToday("sync-utilidad", 10)).toBe(false);
    expect(recoveryStillComingToday("sync-utilidad", 11)).toBe(false);
    // Acá está el punto: antes esto decía `true` hasta las 18:00 prometiendo
    // una recuperación que con la regla nueva no va a ocurrir.
    expect(recoveryStillComingToday("sync-utilidad", 15)).toBe(false);
  });

  it("sync-recibos conserva su promesa hasta la última pasada", () => {
    expect(recoveryStillComingToday("sync-recibos", 11)).toBe(true);
    expect(recoveryStillComingToday("sync-recibos", 15)).toBe(true);
    expect(recoveryStillComingToday("sync-recibos", 18)).toBe(false);
  });

  it("el umbral stale NO cambia: el hueco del camino feliz sigue siendo 24h", () => {
    // No se movió ninguna entrada de vercel.json, así que sync-utilidad y
    // boston-cartera siguen corriendo 1×/día y el default de 26h les sobra.
    // El peor caso con recuperación pasó de 13h (18:00 UTC → 07:00) a 21h
    // (10:00 UTC → 07:00), que sigue por debajo de 26h.
    expect(cronStaleThresholdHours("sync-utilidad")).toBe(CRON_STALE_HOURS_DEFAULT);
    expect(cronStaleThresholdHours("boston-cartera")).toBe(CRON_STALE_HOURS_DEFAULT);
    expect(CRON_STALE_HOURS_DEFAULT).toBeGreaterThan(21);
  });
});

describe("C. quién importa web-client", () => {
  it("SOLO los cinco módulos declarados abren (o reciben) una sesión web", () => {
    const importadores = archivosFuente()
      .filter((f) => !f.endsWith(path.join("switch-api", "web-client.ts")))
      .filter((f) => /from\s+["'][^"']*web-client["']/.test(fs.readFileSync(f, "utf8")))
      .map((f) => path.relative(SRC, f))
      .sort();
    // Si este test falla es porque un módulo NUEVO abre el login web. No basta
    // con agregarlo a la lista: hay que decidir a qué hora corre y, si lo
    // recupera la reconciliación, sumarlo a COLATERALES_LOGIN_WEB.
    expect(importadores).toEqual([
      // 🔴 NO es un cron: es la ruta de CERTIFICACIÓN de egresos varios, que se
      // corre A MANO con curl (Bearer CRON_SECRET) para cuadrar contra el
      // archivo que Daniel bajó del panel. No tiene entrada en vercel.json, así
      // que no le corresponde horario ni COLATERALES_LOGIN_WEB — pero SÍ abre
      // una sesión web, y por eso tiene que estar declarada acá: quien la corra
      // es responsable de hacerlo en la madrugada de Panamá y de mirar el
      // calendario, porque no hay ningún cron que se lo haga cumplir.
      path.join("app", "api", "diag", "egresos-varios", "route.ts"),
      // COMPRAS (ingreso de mercancía) de las 6 de Fashion Group: corre 09:05
      // UTC = 04:05 a.m. Panamá (madrugada, igual que los otros). Es la franja
      // que dejó libre `sync-mayor` al retirarse, y era de un cron de login web.
      // NO es colateral de la reconciliación, así que no entra en
      // COLATERALES_LOGIN_WEB — como boston-cartera y como egresos varios.
      path.join("lib", "switch-api", "ingresos-mercancia-web.ts"),
      // 🔑 CATÁLOGO DE CUENTAS — importa `web-client` pero **NO ABRE SESIÓN**:
      // recibe una `WebSession` ya abierta y sólo hace un GET. Viaja pegado al
      // sync de egresos, en la MISMA sesión de las 10:35 UTC, justamente para
      // no sumar ni un login más (cada uno expulsa a Daniel del panel). Por eso
      // NO le corresponde horario propio ni COLATERALES_LOGIN_WEB, y por eso el
      // test de abajo exige que nunca llame a `loginSwitchWeb`.
      path.join("lib", "switch-api", "sync-cuentas-contables.ts"),
      // Egresos varios (caja y banco): corre 10:35 UTC = 05:35 a.m. Panamá
      // (madrugada, igual que los otros tres). NO es colateral de la
      // reconciliación, así que no entra en COLATERALES_LOGIN_WEB — como
      // boston-cartera.
      path.join("lib", "switch-api", "sync-egresos-varios.ts"),
      path.join("lib", "switch-api", "sync-estadocuenta-web.ts"),
      // 🔴 `sync-mayor.ts` SE RETIRÓ el 13-ago-2026 (Daniel: *"y entonces borra
      // Mayor contable en el sistema"*) y con él su login web de las 09:05 UTC:
      // una sesión menos por día contra Switch, que es un login menos que puede
      // expulsar a Daniel del panel.
      path.join("lib", "switch-api", "sync-utilidad.ts"),
    ]);
  });

  it("🔑 el catálogo de cuentas REUSA la sesión: no puede abrir una propia", () => {
    // Es lo que lo mantiene fuera del calendario. Si algún día llamara a
    // `loginSwitchWeb`, serían 7 expulsiones más por día para traer una lista
    // de nombres que casi nunca cambia — y este test se pone ROJO antes.
    const fuente = fs.readFileSync(
      path.join(SRC, "lib", "switch-api", "sync-cuentas-contables.ts"),
      "utf8",
    );
    const sinComentarios = fuente
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(sinComentarios).not.toMatch(/loginSwitchWeb/);
    expect(sinComentarios).not.toMatch(/cerrarSesionWeb/);
    // Recibe la sesión de afuera.
    expect(sinComentarios).toMatch(/session:\s*WebSession/);
  });

  it("sync-recibos NO abre el login web: de sync-utilidad solo saca fechas", () => {
    const src = leer(path.join("lib", "switch-api", "sync-recibos.ts"));
    expect(src).not.toMatch(/web-client/);
    expect(src).toMatch(/from "\.\/client"/); // API JSON
    const route = leer(path.join("app", "api", "cron", "sync-recibos", "route.ts"));
    expect(route).not.toMatch(/web-client|syncEmpresaUtilidad|syncAllUtilidad|syncCarteraWeb/);
    // Lo único que toma de sync-utilidad son helpers de fecha puros.
    const imp = route.match(/import\s*\{([^}]*)\}\s*from\s*"@\/lib\/switch-api\/sync-utilidad"/);
    expect(imp).not.toBeNull();
    const nombres = imp![1]
      .split(",")
      .map((s) => s.replace(/\btype\b/, "").trim())
      .filter(Boolean)
      .sort();
    expect(nombres).toEqual(["Mes", "mesActual", "mesesDeAnio"]);
  });
});

describe("D. un colateral con login web tiene que estar declarado", () => {
  // Se REUSA la lista de arriba: dos copias divergen y la vieja deja de vigilar.
  const FUNCIONES_LOGIN_WEB = PUERTAS_LOGIN_WEB;

  it("ningún COLATERAL_CRONS llama a una función de login web sin declararse", () => {
    const src = leer(path.join("app", "api", "cron", "switch-reconciliacion", "route.ts"));
    const inicio = src.indexOf("const COLATERAL_CRONS");
    expect(inicio).toBeGreaterThan(-1);
    const bloque = src.slice(inicio);
    // Cada entrada va desde su `cronName:` hasta el `cronName:` siguiente.
    const marcas = [...bloque.matchAll(/cronName:\s*"([^"]+)"/g)];
    expect(marcas.length).toBeGreaterThan(5);
    const conLoginWeb: string[] = [];
    marcas.forEach((m, i) => {
      const desde = m.index!;
      const hasta = i + 1 < marcas.length ? marcas[i + 1].index! : bloque.length;
      const cuerpo = bloque.slice(desde, hasta);
      if (FUNCIONES_LOGIN_WEB.some((fn) => new RegExp(`\\b${fn}\\s*\\(`).test(cuerpo))) {
        conLoginWeb.push(m[1]);
      }
    });
    expect(conLoginWeb.sort()).toEqual([...COLATERALES_LOGIN_WEB].sort());
  });

  it("la reconciliación aplica la regla (no la declara y se olvida)", () => {
    const src = leer(path.join("app", "api", "cron", "switch-reconciliacion", "route.ts"));
    expect(src).toMatch(/COLATERALES_LOGIN_WEB/);
    expect(src).toMatch(/pasadaPuedeUsarLoginWeb/);
    // Lo omitido se REPORTA, no se esconde.
    expect(src).toMatch(/omitidosLoginWeb/);
  });

  it("boston-cartera usa el login web pero NO es colateral: nada que apagar", () => {
    const src = leer(path.join("app", "api", "cron", "switch-reconciliacion", "route.ts"));
    expect(src).not.toMatch(/"boston-cartera"/);
    expect(COLATERALES_LOGIN_WEB.has("boston-cartera")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("E. un cron que abre el login web NO corre en horario de oficina", () => {
  /**
   * 🩸 ESTA REGLA ESTABA ESCRITA EN PROSA, EN TRES ENCABEZADOS DE ROUTE, Y NO
   * LA VIGILABA NADIE. Salió en la verificación por mutación del cron de
   * compras (25-ago-2026): moverlo a las 16:00 UTC —las 11 de la mañana de
   * Panamá— solo se ponía rojo de casualidad, porque a esa hora ya corre el
   * estadocuenta de las mismas empresas. A una hora de oficina LIBRE no había
   * un solo test que se quejara, y el login hace `changesession="SI"`: expulsa
   * a Daniel del panel mientras trabaja.
   *
   * 🔴 SE MIRA QUÉ LLAMA EL ROUTE, NO DE DÓNDE IMPORTA. Un barrido que siga los
   * imports a secas acusa a `sync-recibos`, que importa de `sync-utilidad`
   * SOLO helpers de fecha y habla por la API JSON — es exactamente lo que el
   * bloque C prueba. Por eso se reusa `PUERTAS_LOGIN_WEB`, que es la MISMA
   * lista del bloque D, y hay un test que la mantiene honesta: si un módulo
   * abre el login con un nombre que no está ahí, el build se pone rojo.
   */
  it("el barrido encuentra crons (si diera 0, no estaría mirando nada)", () => {
    expect(cronsConLoginWeb().length).toBeGreaterThanOrEqual(4);
  });

  it("el único que se exime es la reconciliación, y porque aplica la regla sola", () => {
    cronsConLoginWeb();
    expect(aplicanLaReglaSolos).toEqual(["switch-reconciliacion"]);
  });

  it("los cuatro que abren el login web son los esperados", () => {
    expect(cronsConLoginWeb()).toEqual([
      "boston-cartera",
      "sync-egresos-varios",
      "sync-ingresos-mercancia",
      "sync-utilidad",
    ]);
  });

  it("🔴 todos corren fuera del horario de oficina de Panamá", () => {
    const enOficina: string[] = [];
    for (const cron of cronsConLoginWeb()) {
      const entradas = SWITCH_CRON_ENTRADAS.filter((e) => e.cron === cron);
      expect(
        entradas.length,
        `${cron} abre el login web y no está en SWITCH_CRON_ENTRADAS: nadie vigila su sesión única`,
      ).toBeGreaterThan(0);
      for (const e of entradas) {
        const hora = Number(e.hhmmUtc.slice(0, 2));
        if (esHorarioDeOficinaPanama(hora)) {
          enOficina.push(`${cron} ${e.hhmmUtc} = ${horaPanamaDeUtc(hora)}h de Panamá`);
        }
      }
    }
    expect(
      enOficina,
      `estos crons abren el login web en plena jornada y expulsan a Daniel del panel:\n${enOficina.join("\n")}`,
    ).toEqual([]);
  });

  it("la lista de puertas se mantiene honesta: nadie abre el login por un nombre suelto", () => {
    // Todo módulo que llame a `loginSwitchWeb` tiene que exportar al menos una
    // puerta declarada. Si no, un cron podría abrir sesión y quedar invisible
    // para el test de arriba.
    const sinPuerta: string[] = [];
    const fueraDeLib: string[] = [];
    for (const f of archivosFuente()) {
      if (f.endsWith(path.join("switch-api", "web-client.ts"))) continue;
      const src = sinComentarios(fs.readFileSync(f, "utf8"));
      if (!/\bloginSwitchWeb\s*\(/.test(src)) continue;
      const rel = path.relative(SRC, f);
      // Un ROUTE que abre la sesión ya es visible por sí mismo (no necesita
      // exportar una puerta): o está bajo app/api/cron/ y lo ve el barrido de
      // arriba, o no está programado y va en la lista de excepciones.
      if (!rel.startsWith("lib" + path.sep)) {
        fueraDeLib.push(rel);
        continue;
      }
      const exporta = PUERTAS_LOGIN_WEB.some((fn) =>
        new RegExp(`export\\s+(async\\s+)?function\\s+${fn}\\b`).test(src),
      );
      if (!exporta) sinPuerta.push(path.relative(SRC, f));
    }
    expect(
      sinPuerta,
      `estos módulos abren el login web sin una puerta declarada en PUERTAS_LOGIN_WEB:\n${sinPuerta.join("\n")}`,
    ).toEqual([]);

    // 🔴 El ÚNICO route que abre sesión sin ser un cron es la ruta de
    // certificación de egresos varios, que se corre A MANO con curl. No tiene
    // entrada en vercel.json, así que no le corresponde horario — pero quien la
    // corra es responsable de hacerlo en la madrugada de Panamá, porque no hay
    // ningún cron que se lo haga cumplir. Ver el bloque C.
    expect(fueraDeLib.sort()).toEqual([path.join("app", "api", "diag", "egresos-varios", "route.ts")]);
  });
});
