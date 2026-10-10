// ─────────────────────────────────────────────────────────────────────────────
// 🔴 UN HUECO DEL RELOJ NO SE DA POR CERRADO HASTA QUE DE VERDAD SE CERRÓ.
//
// 🩸 El caso (5→8-oct-2026, reloj de Boston): la PC estuvo apagada del lunes 5 a
// las 14:25 al jueves 8. Al volver, el barrido largo no llegó a leer el reloj;
// 46 minutos después el programa pidió su ventana normal (6, 7 y 8) y el
// servidor movió `leido_hasta` al 8. ~45 marcas de la tarde del 5 nunca subieron
// y nadie las volvió a pedir.
//
// Acá corre el programa REAL de la PC (`darVuelta`) contra un servidor de
// mentira que usa las reglas REALES del servidor (`normalizarEventos` y
// `decidirLeidoHasta`) y una tabla con la misma llave única que la base.
//
// Verificado por mutación el 9-oct-2026: con la regla de antes (cualquier lote
// mueve `leido_hasta` a su última marca) fallan las pruebas marcadas con 🔴.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { darVuelta, ventanaRodante } from "../../../scripts/agente-reloj/vuelta.mjs";
import {
  VERSION,
  VENTANA_DIAS_DEFAULT,
  VENTANA_RECUPERACION_DIAS_DEFAULT,
} from "../../../scripts/agente-reloj/config.mjs";
import { POR_LOTE } from "../../../scripts/agente-reloj/puente.mjs";
import {
  DIAS_RECUPERACION_AGENTE,
  DIAS_VENTANA_NORMAL_AGENTE,
  arranqueVentana,
  decidirLeidoHasta,
  diasQueAlcanza,
} from "@/lib/asistencia/agente";
import { normalizarEventos, ultimoInstante, type EventoCrudo } from "@/lib/asistencia/ingest";

const leer = (p: string) => fs.readFileSync(path.join(__dirname, "../../..", p), "utf8");
const HORA = 3_600_000;
const pa = (s: string) => Date.parse(`${s}-05:00`);

/** El reloj: una marca reconocida y una huella sin reconocer por cada hora
 *  hábil, de lunes a viernes. Guarda todo, como el de verdad. */
function relojCon(desde: string, hasta: string): EventoCrudo[] {
  const eventos: EventoCrudo[] = [];
  let serial = 60_000;
  for (let t = pa(`${desde}T00:00:00`); t <= pa(`${hasta}T23:59:59`); t += HORA) {
    const local = new Date(t - 5 * HORA);
    const h = local.getUTCHours();
    if (local.getUTCDay() % 6 === 0 || h < 7 || h > 18) continue;
    const time = `${local.toISOString().slice(0, 19)}-05:00`;
    eventos.push({ serialNo: serial++, time, employeeNoString: "13" });
    eventos.push({ serialNo: serial++, time });
  }
  return eventos;
}

/** El servidor de mentira: la misma decisión que `/api/asistencia/ingest`. */
function montar(reloj: EventoCrudo[], leidoHasta: string, version: string = VERSION) {
  const m = {
    ahora: 0,
    leidoHasta: leidoHasta as string | null,
    tabla: new Map<string, string>(), // (dispositivo, evento_id) → ocurrio_en
    caducados: [] as Array<{ desde: string; hasta: string }>,
    pedidos: [] as string[],
    relojFalla: false,
  };
  const deps = {
    ahora: () => m.ahora,
    leerEstado: async () => ({ pedidoPendiente: false, estado: { leido_hasta: m.leidoHasta } }),
    traerEventos: async ({ desde, hasta }: { desde: string; hasta: string }) => {
      m.pedidos.push(desde.slice(0, 10));
      if (m.relojFalla) throw new Error("el reloj no contestó");
      const eventos = reloj.filter((e) => {
        const t = Date.parse(String(e.time));
        return t >= Date.parse(desde) && t <= Math.min(Date.parse(hasta), m.ahora);
      });
      return { eventos };
    },
    // El `mandarEventos` real parte en lotes de POR_LOTE; acá igual.
    mandarEventos: async ({ dispositivo, eventos }: { dispositivo: string; eventos: EventoCrudo[] }) => {
      let guardados = 0;
      for (let i = 0; i < Math.max(1, eventos.length); i += POR_LOTE) {
        const lote = eventos.slice(i, i + POR_LOTE);
        const { filas } = normalizarEventos(dispositivo, lote);
        for (const f of filas) {
          const llave = `${f.dispositivo}|${f.evento_id}`;
          if (!m.tabla.has(llave)) guardados++;
          m.tabla.set(llave, f.ocurrio_en);
        }
        const tiempos = lote.map((e) => Date.parse(String(e.time)));
        const d = decidirLeidoHasta({
          previo: m.leidoHasta,
          primeroMs: tiempos.length ? Math.min(...tiempos) : null,
          ultimo: ultimoInstante(filas),
          ahoraMs: m.ahora,
          agenteVersion: version,
        });
        if (d.leidoHasta) m.leidoHasta = d.leidoHasta;
        if (d.caducado) m.caducados.push(d.caducado);
      }
      return { guardados, descartados: 0, pedidoCerrado: false };
    },
    reportarError: async () => true,
  };
  const config = {
    dispositivo: "reloj cboston",
    host: "http://192.168.10.10",
    base: "https://www.fashiongr.com",
    secret: "s",
    ventanaDias: VENTANA_DIAS_DEFAULT,
    ventanaRecuperacionDias: diasQueAlcanza(version),
    piso: null,
    version,
  };
  const estado = { fallosAuth: 0, esperarHastaMs: 0 };
  const vuelta = (cuando: string) => {
    m.ahora = pa(cuando);
    return darVuelta({ config, deps, estado });
  };
  const delDia = (dia: string) =>
    [...m.tabla.values()].filter((t) => new Date(Date.parse(t) - 5 * HORA).toISOString().startsWith(dia));
  return { m, vuelta, delDia };
}

/** La PC se apagó el lunes 5 a las 14:25: en la base está todo hasta ahí. */
function casoDel5deOctubre(version?: string) {
  const reloj = relojCon("2026-09-01", "2026-10-30");
  const s = montar(reloj, new Date(pa("2026-10-05T14:00:00")).toISOString(), version);
  for (const e of reloj) {
    if (e.employeeNoString && Date.parse(String(e.time)) <= pa("2026-10-05T14:00:00")) {
      s.m.tabla.set(`reloj cboston|${e.serialNo}`, new Date(Date.parse(String(e.time))).toISOString());
    }
  }
  return s;
}

describe("el caso del 5-oct-2026: el barrido largo falla y después entra la ventana normal", () => {
  it("🔴 un barrido que falla NO cierra el hueco, aunque después entren el 6, el 7 y el 8", async () => {
    const { m, vuelta, delDia } = casoDel5deOctubre();
    const antes = m.leidoHasta;

    m.relojFalla = true;
    expect((await vuelta("2026-10-08T12:43:00")).ok).toBe(false);
    m.relojFalla = false;
    const normal = await vuelta("2026-10-08T13:29:00");

    expect(normal.ok).toBe(true);
    expect(delDia("2026-10-08").length).toBeGreaterThan(0); // las marcas nuevas SÍ entran
    expect(delDia("2026-10-05").length).toBe(8); // 7:00 a 14:00 — la tarde sigue faltando
    expect(m.leidoHasta).toBe(antes); // …y por eso el hueco sigue abierto
  });

  it("🔴 el hueco se vuelve a pedir hasta que entra, y recién ahí se cierra", async () => {
    const { m, vuelta, delDia } = casoDel5deOctubre();
    m.relojFalla = true;
    await vuelta("2026-10-08T12:43:00");
    m.relojFalla = false;
    await vuelta("2026-10-08T13:29:00");
    await vuelta("2026-10-08T13:32:00"); // las vueltas de cada 3 minutos tampoco lo cierran
    expect(delDia("2026-10-05").length).toBe(8);

    // La PC se apaga y se prende al otro día: el programa arranca sin memoria.
    // (Viernes y no lunes a propósito: un lunes barre largo igual, por el fin
    // de semana; el viernes solo barre si el hueco siguió abierto.)
    const s2 = montar(relojCon("2026-09-01", "2026-10-30"), m.leidoHasta as string);
    for (const [k, v] of m.tabla) s2.m.tabla.set(k, v);
    const viernes = await s2.vuelta("2026-10-09T08:05:00");

    expect(viernes.ok).toBe(true);
    expect(s2.m.pedidos[0]).toBe("2026-09-10"); // barrió largo: 30 días
    expect(s2.delDia("2026-10-05").length).toBe(12); // entró la tarde del 5
    expect(Date.parse(s2.m.leidoHasta as string)).toBe(pa("2026-10-09T08:00:00")); // cerrado de verdad
    expect(s2.m.caducados).toEqual([]);
  });

  it("sin apagar la PC también: a las 6 horas el programa vuelve a barrer largo", async () => {
    const { m, vuelta, delDia } = casoDel5deOctubre();
    m.relojFalla = true;
    await vuelta("2026-10-08T08:00:00");
    m.relojFalla = false;
    await vuelta("2026-10-08T08:45:00");
    expect(delDia("2026-10-05").length).toBe(8);
    await vuelta("2026-10-08T14:01:00");
    expect(delDia("2026-10-05").length).toBe(12);
    expect(Date.parse(m.leidoHasta as string)).toBe(pa("2026-10-08T14:00:00"));
  });

  it("las marcas repetidas no se duplican: barrer dos veces lo mismo deja la tabla igual", async () => {
    const { m, vuelta } = casoDel5deOctubre();
    await vuelta("2026-10-12T08:05:00");
    const filas = m.tabla.size;
    const otra = montar(relojCon("2026-09-01", "2026-10-30"), new Date(pa("2026-10-05T14:00:00")).toISOString());
    for (const [k, v] of m.tabla) otra.m.tabla.set(k, v);
    const r = await otra.vuelta("2026-10-12T08:10:00"); // otro barrido largo entero
    expect(r.guardados).toBe(0);
    expect(otra.m.tabla.size).toBe(filas);
  });

  it("la base ignora las repetidas por la llave (dispositivo, evento_id)", () => {
    const guardar = leer("src/lib/asistencia/guardar-marcaciones.ts");
    expect(guardar).toMatch(/onConflict:\s*"dispositivo,evento_id",\s*ignoreDuplicates:\s*true/);
  });
});

describe("un hueco que el reloj ya no puede devolver caduca solo", () => {
  it("🔴 más viejo que el plazo: avanza, queda anotado desde/hasta, y deja de pedirse", async () => {
    const reloj = relojCon("2026-09-01", "2026-10-30");
    const viejo = new Date(pa("2026-09-08T14:00:00")).toISOString(); // 34 días antes
    const { m, vuelta } = montar(reloj, viejo);

    await vuelta("2026-10-12T08:05:00");
    expect(m.caducados).toHaveLength(1);
    expect(m.caducados[0].desde).toBe(viejo);
    expect(Date.parse(m.caducados[0].hasta)).toBe(pa("2026-09-14T07:00:00")); // lo más viejo que se alcanzó
    expect(Date.parse(m.leidoHasta as string)).toBe(pa("2026-10-12T08:00:00"));

    m.pedidos.length = 0;
    await vuelta("2026-10-12T14:10:00"); // 6 horas después: ya no barre largo
    expect(m.pedidos).toEqual(["2026-10-10"]);
    expect(m.caducados).toHaveLength(1);
  });

  it("dentro del plazo NO caduca: 20 días atrás todavía se recupera", async () => {
    const { m, vuelta, delDia } = montar(
      relojCon("2026-09-01", "2026-10-30"),
      new Date(pa("2026-09-22T14:00:00")).toISOString(),
    );
    await vuelta("2026-10-12T08:05:00");
    expect(m.caducados).toEqual([]);
    expect(delDia("2026-09-22").length).toBe(12); // el día entero, tarde incluida
  });

  it("el programa viejo (1.2.0) alcanza 15 días: a ese no se le atribuyen 30", async () => {
    expect(diasQueAlcanza("1.2.0")).toBe(15);
    expect(diasQueAlcanza(null)).toBe(15);
    const { m, vuelta } = montar(
      relojCon("2026-09-01", "2026-10-30"),
      new Date(pa("2026-09-22T14:00:00")).toISOString(),
      "1.2.0",
    );
    await vuelta("2026-10-12T08:05:00");
    expect(m.caducados).toHaveLength(1);
  });
});

describe("la regla, suelta", () => {
  const AHORA = pa("2026-10-08T13:29:00");
  const iso = (s: string) => new Date(pa(s)).toISOString();
  const base = { ahoraMs: AHORA, agenteVersion: VERSION };

  it("sin hueco avanza como siempre, y nunca retrocede", () => {
    const previo = iso("2026-10-07T18:00:00");
    expect(
      decidirLeidoHasta({ ...base, previo, primeroMs: pa("2026-10-06T07:00:00"), ultimo: iso("2026-10-08T13:00:00") })
        .leidoHasta,
    ).toBe(iso("2026-10-08T13:00:00"));
    expect(
      decidirLeidoHasta({ ...base, previo, primeroMs: pa("2026-10-06T07:00:00"), ultimo: iso("2026-10-06T09:00:00") })
        .leidoHasta,
    ).toBeNull();
  });

  it("un reloj recién puesto (sin `leido_hasta`) toma la última marca", () => {
    expect(decidirLeidoHasta({ ...base, previo: null, primeroMs: AHORA, ultimo: iso("2026-10-08T13:00:00") }).leidoHasta).toBe(
      iso("2026-10-08T13:00:00"),
    );
  });

  it("un lote vacío no mueve nada ni caduca nada", () => {
    expect(decidirLeidoHasta({ ...base, previo: iso("2026-08-01T10:00:00"), primeroMs: null, ultimo: null })).toEqual({
      leidoHasta: null,
      caducado: null,
    });
  });
});

describe("los candados de los números", () => {
  it("el plazo es 30 días y vive en un lugar: el servidor y el programa dicen lo mismo", () => {
    expect(DIAS_RECUPERACION_AGENTE).toBe(30);
    expect(DIAS_RECUPERACION_AGENTE).toBe(VENTANA_RECUPERACION_DIAS_DEFAULT);
    expect(DIAS_VENTANA_NORMAL_AGENTE).toBe(VENTANA_DIAS_DEFAULT);
    // La versión que viaja a la PC es la que el servidor reconoce como de 30.
    expect(diasQueAlcanza(VERSION)).toBe(VENTANA_RECUPERACION_DIAS_DEFAULT);
  });

  it("el servidor calcula el arranque de la ventana igual que el programa", () => {
    for (const cuando of ["2026-10-08T13:29:00", "2026-10-08T00:00:01", "2026-10-08T23:59:59", "2026-10-12T04:00:00"]) {
      for (const dias of [3, 15, 30]) {
        const { desde } = ventanaRodante({ ahoraMs: pa(cuando), dias });
        expect(arranqueVentana(pa(cuando), dias)).toBe(Date.parse(desde));
      }
    }
  });

  it("la ruta de ingesta usa la regla, y el hueco caducado va al registro sin aviso", () => {
    const ruta = leer("src/app/api/asistencia/ingest/route.ts");
    expect(ruta).toContain("decidirLeidoHasta(");
    expect(ruta).toContain('"hueco_caducado"');
    expect(ruta.replace(/\/\/.*$/gm, "")).not.toMatch(/enviarSistema|telegram/i);
  });
});
