/* ─────────────────────────────────────────────────────────────────────────────
 * DOS RELOJES, UNA SOLA PC — el candado.
 *
 * Desde el 10-sep-2026 la PC de la oficina lee DOS relojes Hikvision:
 *
 *   · "reloj cboston" — Confecciones Boston, 192.168.10.10, en la red de la
 *     oficina. Es el de siempre: sus 6.000+ marcaciones ya están guardadas con
 *     ESE nombre.
 *   · "reloj acs"     — Multifashion, 192.168.20.98, que se ve desde la MISMA
 *     PC por un túnel WireGuard.
 *
 * ⚠️ NO SE PUEDE PROBAR CONTRA LOS APARATOS DE VERDAD desde acá: los dos viven
 * en IPs privadas de la oficina. Lo que se prueba es el programita contra
 * dobles, que es lo único que se puede probar desde afuera.
 *
 * Las TRES reglas que este archivo existe para cazar:
 *
 *   1. 🔴 NO SE MEZCLAN. El `dispositivo` es la mitad de la llave anti-duplicado
 *      `(dispositivo, evento_id)`, y los dos relojes numeran sus `serialNo`
 *      desde 1. Un solo nombre para los dos = una marcación tapa a la otra y
 *      alguien aparece sin haber entrado. Ya pasó con `RELOJ_FG` (ver
 *      `asistencia-una-sola-entrada.test.ts`), y salió caro.
 *   2. 🔴 UNO CAÍDO NO FRENA AL OTRO. El túnel WireGuard se cae; la red de la
 *      oficina no. Si la ronda se cortara en el primer error, un túnel caído
 *      dejaría a Boston sin traer marcaciones.
 *   3. 🔴 EL `.env` DE LA OFICINA, TAL COMO ESTÁ ESCRITO HOY, SIGUE VALIENDO.
 *      Nadie va a ir a esa PC a reescribir un archivo: la lista es ADITIVA.
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
// @ts-expect-error — el agente es JS puro a propósito: corre en una PC de la
// oficina con Node pelado, sin `npm install` y sin build.
import {
  armarRelojes,
  configDeReloj,
  leerConfig,
  MAX_RELOJES,
  DISPOSITIVO_POR_DEFECTO,
} from "../../../scripts/agente-reloj/config.mjs";
// @ts-expect-error — idem.
import { darRonda, nuevosEstados, etiqueta } from "../../../scripts/agente-reloj/ronda.mjs";
// @ts-expect-error — idem.
import { darVuelta } from "../../../scripts/agente-reloj/vuelta.mjs";
import { normalizarEventos } from "@/lib/asistencia/ingest";
import { nombreRelojEnPantalla } from "@/lib/asistencia/agente";

interface Reloj {
  dispositivo: string;
  host: string;
  usuario: string;
  clave: string;
}

/** El `.env` que está escrito HOY en la PC de la oficina, sin una letra nueva. */
const ENV_DE_HOY = {
  RELOJ_HOST: "192.168.10.10",
  RELOJ_USUARIO: "admin",
  RELOJ_CLAVE: "la-clave",
  FASHIONGR_SECRET: "llave",
  FASHIONGR_URL: "https://www.fashiongr.com",
  DISPOSITIVO: "reloj cboston",
  VUELTA_MINUTOS: "3",
  VENTANA_DIAS: "3",
};

/** El mismo, más los DOS renglones del reloj de Multifashion. */
const ENV_CON_DOS = {
  ...ENV_DE_HOY,
  RELOJ_2_HOST: "192.168.20.98",
  RELOJ_2_DISPOSITIVO: "reloj acs",
};

/* ── 1. LA CONFIG VIEJA SIGUE VALIENDO ────────────────────────────────────── */

describe("🔴 el .env de la oficina no se toca: la lista es ADITIVA", () => {
  it("con la configuración de siempre hay UN reloj, idéntico al de siempre", () => {
    expect(armarRelojes(ENV_DE_HOY)).toEqual([
      {
        dispositivo: "reloj cboston",
        host: "http://192.168.10.10",
        usuario: "admin",
        clave: "la-clave",
      },
    ]);
  });

  it("sin `DISPOSITIVO` escrito, el reloj 1 sigue siendo el de siempre", () => {
    // 🔑 Es la llave con la que ya están guardadas las marcaciones. Un default
    // distinto las volvería a insertar todas: las horas saldrían al doble.
    const { DISPOSITIVO: _fuera, ...sinNombre } = ENV_DE_HOY;
    expect(armarRelojes(sinNombre)[0].dispositivo).toBe("reloj cboston");
    expect(DISPOSITIVO_POR_DEFECTO).toBe("reloj cboston");
  });

  it("lo que dice el `.env` MANDA sobre el valor por defecto", () => {
    // Hoy los dos coinciden ("reloj cboston"), así que el default tapa el
    // defecto. Se prueba con otro nombre a propósito: si algún día alguien le
    // cambia el nombre al reloj en la PC, tiene que valer lo que él escribió y
    // no lo que dice el código.
    expect(armarRelojes({ ...ENV_DE_HOY, DISPOSITIVO: "reloj de prueba" })[0].dispositivo).toBe(
      "reloj de prueba",
    );
  });

  it("leerConfig sobre un archivo viejo de verdad devuelve un solo reloj", () => {
    const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "agente-viejo-"));
    const ruta = path.join(carpeta, ".env");
    fs.writeFileSync(
      ruta,
      Object.entries(ENV_DE_HOY)
        .map(([k, v]) => `${k}=${v}`)
        .join("\n"),
      "utf8",
    );
    const cfg = leerConfig(ruta);
    expect(cfg.relojes).toHaveLength(1);
    expect(cfg.relojes[0].dispositivo).toBe("reloj cboston");
    expect(cfg.base).toBe("https://www.fashiongr.com");
    expect(cfg.vueltaMin).toBe(3);
    fs.rmSync(carpeta, { recursive: true, force: true });
  });
});

/* ── 2. EL SEGUNDO RELOJ ──────────────────────────────────────────────────── */

describe("🔴 el segundo reloj se agrega con DOS renglones", () => {
  it("hereda usuario y contraseña del primero — hoy son los mismos aparatos", () => {
    // Daniel lo confirmó: la contraseña del reloj de Multifashion es la MISMA
    // que la del de Boston. Repetirla en el archivo es una copia más que se
    // puede quedar vieja el día que se cambie una sola.
    const relojes = armarRelojes(ENV_CON_DOS) as Reloj[];
    expect(relojes).toHaveLength(2);
    expect(relojes[1]).toEqual({
      dispositivo: "reloj acs",
      host: "http://192.168.20.98",
      usuario: "admin",
      clave: "la-clave",
    });
  });

  it("si un día le cambian la contraseña a UNO solo, se puede escribir aparte", () => {
    const relojes = armarRelojes({
      ...ENV_CON_DOS,
      RELOJ_2_USUARIO: "otro",
      RELOJ_2_CLAVE: "otra-clave",
    }) as Reloj[];
    expect(relojes[1].usuario).toBe("otro");
    expect(relojes[1].clave).toBe("otra-clave");
    // Y el primero no se contagia.
    expect(relojes[0].clave).toBe("la-clave");
  });

  it("la dirección se completa con http:// si no la trae", () => {
    const relojes = armarRelojes(ENV_CON_DOS) as Reloj[];
    expect(relojes[0].host).toBe("http://192.168.10.10");
    expect(relojes[1].host).toBe("http://192.168.20.98");
    // Y si alguien escribe el esquema, se respeta tal cual.
    const conEsquema = armarRelojes({
      ...ENV_CON_DOS,
      RELOJ_2_HOST: "http://192.168.20.98:8080",
    }) as Reloj[];
    expect(conEsquema[1].host).toBe("http://192.168.20.98:8080");
  });

  it("caben más relojes, y se paran donde dice la constante", () => {
    const muchos: Record<string, string> = { ...ENV_DE_HOY };
    for (let i = 2; i <= MAX_RELOJES + 1; i++) {
      muchos[`RELOJ_${i}_HOST`] = `10.0.0.${i}`;
      muchos[`RELOJ_${i}_DISPOSITIVO`] = `reloj ${i}`;
    }
    // El que pasa del tope no se lee: mejor que se note al configurarlo que
    // tener un reloj mudo del que nadie sabe.
    expect(armarRelojes(muchos)).toHaveLength(MAX_RELOJES);
  });
});

/* ── 3. NO SE MEZCLAN ─────────────────────────────────────────────────────── */

describe("🔴 dos relojes NUNCA comparten el nombre ni la dirección", () => {
  it("un reloj sin nombre se rechaza, y el mensaje dice qué falta", () => {
    expect(() => armarRelojes({ ...ENV_DE_HOY, RELOJ_2_HOST: "192.168.20.98" })).toThrow(
      /RELOJ_2_DISPOSITIVO/,
    );
  });

  it("🩸 dos relojes con el MISMO nombre se rechazan antes de mandar nada", () => {
    // Los dos aparatos numeran sus eventos desde 1. Con un solo nombre, el
    // `serialNo` 40 de Multifashion y el 40 de Boston son la MISMA llave: el
    // segundo se ignora en silencio y alguien aparece sin haber entrado.
    expect(() =>
      armarRelojes({ ...ENV_CON_DOS, RELOJ_2_DISPOSITIVO: "reloj cboston" }),
    ).toThrow(/mismo nombre/);
  });

  it("🩸 el mismo aparato dos veces se rechaza: serían horas al doble", () => {
    expect(() =>
      armarRelojes({ ...ENV_CON_DOS, RELOJ_2_HOST: "192.168.10.10" }),
    ).toThrow(/misma dirección/);
  });

  it("la llave anti-duplicado separa a los dos relojes aunque el serialNo se repita", () => {
    // Los dos mandan el evento 40001. Con dos nombres son dos filas distintas;
    // con uno solo, una taparía a la otra.
    const evento = { serialNo: 40001, time: "2026-09-10T08:00:00-05:00", employeeNoString: "7" };
    const boston = normalizarEventos("reloj cboston", [evento]).filas;
    const acs = normalizarEventos("reloj acs", [evento]).filas;
    expect(boston[0].evento_id).toBe(acs[0].evento_id);
    expect(boston[0].dispositivo).not.toBe(acs[0].dispositivo);
    const llave = (f: { dispositivo: string; evento_id: string }) =>
      `${f.dispositivo}|${f.evento_id}`;
    expect(new Set([llave(boston[0]), llave(acs[0])]).size).toBe(2);
  });
});

/* ── 4. LA RONDA: uno caído no frena al otro ──────────────────────────────── */

function configDos() {
  return {
    relojes: armarRelojes(ENV_CON_DOS),
    base: "https://www.fashiongr.com",
    secret: "llave",
    ventanaDias: 3,
    ventanaRecuperacionDias: 15,
    piso: null,
    version: "1.2.0",
  };
}

describe("🔴 la ronda pasa por los dos relojes, pase lo que pase", () => {
  it("cada vuelta va con SU dispositivo, su dirección y su contraseña", async () => {
    const config = configDos();
    const vistos: Array<{ dispositivo: string; host: string }> = [];
    const vuelta = vi.fn(async ({ config: c }: { config: Record<string, string> }) => {
      vistos.push({ dispositivo: c.dispositivo, host: c.host });
      return { ok: true, traidos: 0, guardados: 0, descartados: 0 };
    });
    const r = await darRonda({
      config,
      deps: {},
      estados: nuevosEstados(config.relojes),
      vuelta,
    });
    expect(vistos).toEqual([
      { dispositivo: "reloj cboston", host: "http://192.168.10.10" },
      { dispositivo: "reloj acs", host: "http://192.168.20.98" },
    ]);
    expect(r.map((x: { dispositivo: string }) => x.dispositivo)).toEqual([
      "reloj cboston",
      "reloj acs",
    ]);
  });

  it("🩸 el túnel caído NO deja a Boston sin marcaciones", async () => {
    // El caso real: el reloj de Multifashion se ve por WireGuard y el túnel se
    // cae. Boston está en la red de la oficina y sigue perfecto.
    const config = { ...configDos(), relojes: [...armarRelojes(ENV_CON_DOS)].reverse() };
    const vuelta = vi.fn(async ({ config: c }: { config: { dispositivo: string } }) => {
      if (c.dispositivo === "reloj acs") {
        return { ok: false, motivo: "reloj-sin-responder", error: "ETIMEDOUT" };
      }
      return { ok: true, traidos: 12, guardados: 12, descartados: 0 };
    });
    const r = await darRonda({
      config,
      deps: {},
      estados: nuevosEstados(config.relojes),
      vuelta,
    });
    expect(vuelta).toHaveBeenCalledTimes(2);
    const boston = r.find((x: { dispositivo: string }) => x.dispositivo === "reloj cboston");
    expect(boston.ok).toBe(true);
    expect(boston.guardados).toBe(12);
  });

  it("⚠️ ni siquiera un error inesperado corta la ronda", async () => {
    // `darVuelta` promete no lanzar. Si igual lanzara (un bug nuestro), el
    // reloj siguiente TIENE que seguir: es la razón de que la ronda exista.
    const config = configDos();
    const vuelta = vi.fn(async ({ config: c }: { config: { dispositivo: string } }) => {
      if (c.dispositivo === "reloj cboston") throw new Error("bug nuestro");
      return { ok: true, traidos: 3, guardados: 3, descartados: 0 };
    });
    const r = await darRonda({
      config,
      deps: {},
      estados: nuevosEstados(config.relojes),
      vuelta,
    });
    expect(r[0]).toMatchObject({ dispositivo: "reloj cboston", ok: false, motivo: "error-inesperado" });
    expect(r[1]).toMatchObject({ dispositivo: "reloj acs", ok: true, guardados: 3 });
  });

  it("🔴 el castigo de la contraseña es de CADA reloj, no de los dos", async () => {
    // Con una sola memoria, el reloj que rechaza la contraseña dejaría al otro
    // 45 minutos sin preguntar — el sano apagado por el enfermo.
    const config = configDos();
    const estados = nuevosEstados(config.relojes);
    const AHORA = Date.parse("2026-09-10T14:00:00Z");
    const consultas: string[] = [];

    const deps = {
      leerEstado: async () => ({ pedidoPendiente: false, estado: { leido_hasta: null } }),
      traerEventos: async (a: { host: string }) => {
        consultas.push(a.host);
        if (a.host.includes("192.168.20.98")) {
          const e = new Error("El reloj rechazó la contraseña (401).");
          (e as Error & { codigo: string }).codigo = "credenciales";
          throw e;
        }
        return { eventos: [] };
      },
      mandarEventos: async () => ({ lotes: 1, guardados: 0, descartados: 0, pedidoCerrado: false }),
      reportarError: async () => true,
      ahora: () => AHORA,
    };

    await darRonda({ config, deps, estados, vuelta: darVuelta });
    expect(consultas).toHaveLength(2);

    // Tres minutos después: al de Multifashion NO se le pregunta (está en
    // penitencia), al de Boston SÍ.
    consultas.length = 0;
    await darRonda({
      config,
      deps: { ...deps, ahora: () => AHORA + 3 * 60_000 },
      estados,
      vuelta: darVuelta,
    });
    expect(consultas).toEqual(["http://192.168.10.10"]);
  });
});

/* ── 5. EL LOG ────────────────────────────────────────────────────────────── */

describe("⚠️ el log dice de qué reloj habla — solo cuando hay más de uno", () => {
  it("con un solo reloj el log queda EXACTAMENTE como siempre", () => {
    expect(etiqueta(armarRelojes(ENV_DE_HOY), "reloj cboston")).toBe("");
  });

  it("con dos, cada línea lleva el nombre adelante", () => {
    const relojes = armarRelojes(ENV_CON_DOS);
    expect(etiqueta(relojes, "reloj acs")).toBe("[reloj acs] ");
  });
});

/* ── 6. LA CONFIG DE UN RELOJ ─────────────────────────────────────────────── */

describe("configDeReloj: lo del reloj y lo de la casa, juntos", () => {
  it("lleva la ventana, la llave y la dirección de fashiongr sin cambiarlas", () => {
    const config = configDos();
    const c = configDeReloj(config, config.relojes[1]);
    expect(c).toEqual({
      dispositivo: "reloj acs",
      host: "http://192.168.20.98",
      usuario: "admin",
      clave: "la-clave",
      base: "https://www.fashiongr.com",
      secret: "llave",
      ventanaDias: 3,
      ventanaRecuperacionDias: 15,
      piso: null,
      version: "1.2.0",
    });
  });
});

/* ── 7. CÓMO SE LLAMAN EN PANTALLA ────────────────────────────────────────── */

describe("el nombre que se lee en pantalla sale de una lista escrita a mano", () => {
  it("los dos relojes de hoy tienen su nombre", () => {
    expect(nombreRelojEnPantalla("reloj cboston")).toBe("Reloj de Boston");
    // ⚠️ Se dice Multifashion, no «American Classics», aunque la llave diga acs.
    expect(nombreRelojEnPantalla("reloj acs")).toBe("Reloj de Multifashion");
    expect(nombreRelojEnPantalla("reloj acs")).not.toMatch(/American/i);
  });

  it("⚠️ uno que no esté en la lista se muestra TAL CUAL — no se inventa nada", () => {
    expect(nombreRelojEnPantalla("reloj bodega")).toBe("reloj bodega");
  });

  it("🔴 el Telegram también dice el nombre legible, no la llave", () => {
    // Con dos relojes, «no puede leer el reloj (reloj acs)» no le dice a nadie
    // cuál se cayó. Las cinco salidas de sistema pasan por el mismo traductor.
    const rutas = [
      "src/app/api/asistencia/ingest/route.ts",
      "src/app/api/cron/asistencia-vigia/route.ts",
    ].map((r) => fs.readFileSync(path.join(process.cwd(), r), "utf8"));
    const juntas = rutas.join("\n");
    for (const texto of [
      "textoCaido",
      "textoRecuperado",
      "textoSilencio",
      "textoHuecoViejo",
      "textoHuecoCerrado",
    ]) {
      const usos = juntas.match(new RegExp(`${texto}\\(([^)]*)`, "g")) ?? [];
      const enviados = usos.filter((u) => !u.includes("import") && u.includes("("));
      expect(enviados.length).toBeGreaterThan(0);
      for (const u of enviados) {
        expect(u).toContain("nombreRelojEnPantalla");
      }
    }
  });
});

/* ── 8. EL EJEMPLO QUE SE COPIA ───────────────────────────────────────────── */

describe("🔴 el .env.ejemplo enseña cómo se agrega el segundo reloj", () => {
  const ejemplo = fs.readFileSync(
    path.join(process.cwd(), "scripts/agente-reloj/.env.ejemplo"),
    "utf8",
  );

  it("trae los dos renglones del reloj de Multifashion, con su dirección medida", () => {
    expect(ejemplo).toContain("RELOJ_2_HOST=192.168.20.98");
    expect(ejemplo).toContain("RELOJ_2_DISPOSITIVO=reloj acs");
  });

  it("y el reloj 1 sigue con el nombre con el que están guardadas las marcaciones", () => {
    expect(ejemplo).toContain("DISPOSITIVO=reloj cboston");
  });

  it("⚠️ el ejemplo tiene que poder LEERSE: si no, enseña una config rota", () => {
    const env: Record<string, string> = {};
    for (const linea of ejemplo.split(/\r?\n/)) {
      const l = linea.trim();
      if (!l || l.startsWith("#")) continue;
      const i = l.indexOf("=");
      if (i > 0) env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
    }
    const relojes = armarRelojes(env) as Reloj[];
    expect(relojes.map((r) => r.dispositivo)).toEqual(["reloj cboston", "reloj acs"]);
  });
});
