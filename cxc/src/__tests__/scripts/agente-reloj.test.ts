// ─────────────────────────────────────────────────────────────────────────────
// EL AGENTE DEL RELOJ, contra un DOBLE del aparato.
//
// ⚠️ NO SE PUEDE PROBAR CONTRA EL RELOJ DE VERDAD desde acá: vive en
// `192.168.10.10`, una IP privada de la oficina. Lo que se prueba es el
// programita contra un reloj de mentira que se comporta como el real —
// incluyendo la mentira que el real dice (ver el caso de los 371).
//
// Lo que estos tests FIJAN, y por qué cada uno existe:
//   1. La paginación completa. El bug de los 371 → 40 eventos.
//   2. Que correrlo dos veces no duplique nada.
//   3. Que un evento sin código de empleado no rompa el lote.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";
// @ts-expect-error — el agente es JS puro a propósito: va a correr en una PC de
// la oficina donde nadie va a instalar TypeScript ni a compilar nada.
import { traerEventos } from "../../../scripts/agente-reloj/reloj.mjs";
// @ts-expect-error — idem.
import { parseDesafio, construirAutorizacion } from "../../../scripts/agente-reloj/digest.mjs";
// @ts-expect-error — idem.
import { mandarEventos, POR_LOTE } from "../../../scripts/agente-reloj/puente.mjs";
// @ts-expect-error — idem.
import {
  ventanaRodante,
  darVuelta,
  decidirVentana,
  anotarRecuperacion,
  RECUPERACION_CADA_HORAS,
} from "../../../scripts/agente-reloj/vuelta.mjs";
import { normalizarEventos } from "@/lib/asistencia/ingest";

/* ── Un reloj de mentira ──────────────────────────────────────────────────── */

interface OpcionesDoble {
  total: number;
  /** El firmware real manda "OK" en páginas intermedias. Es LA trampa. */
  estado?: (pagina: number, ultima: boolean) => string;
  /** Simula el firmware que NO manda `totalMatches`. */
  sinTotal?: boolean;
  /** Fábrica de eventos, para los casos raros (sin código de empleado, etc.). */
  evento?: (i: number) => Record<string, unknown>;
}

function relojDoble(op: OpcionesDoble) {
  const eventos = Array.from({ length: op.total }, (_, i) =>
    op.evento
      ? op.evento(i)
      : {
          serialNo: 40000 + i,
          time: "2026-07-13T08:0" + (i % 10) + ":00-05:00",
          employeeNoString: String((i % 37) + 1),
          name: "",
          attendanceStatus: "checkIn",
        },
  );
  const pedidos: Array<{ searchID: string; posicion: number; max: number }> = [];
  let pagina = 0;

  const fetchImpl = vi.fn(async (_url: string, opciones: RequestInit = {}) => {
    // El baile del Digest: el primer request sin credenciales recibe el desafío.
    const headers = (opciones.headers ?? {}) as Record<string, string>;
    if (!headers.Authorization) {
      return {
        status: 401,
        ok: false,
        headers: {
          get: (k: string) =>
            k.toLowerCase() === "www-authenticate"
              ? 'Digest qop="auth", realm="DS-K1T804AEF", nonce="NDU2Nzg5MA==", opaque="", algorithm="MD5"'
              : null,
        },
      };
    }

    const cuerpo = JSON.parse(String(opciones.body));
    const cond = cuerpo.AcsEventCond;
    pedidos.push({
      searchID: cond.searchID,
      posicion: cond.searchResultPosition,
      max: cond.maxResults,
    });

    const trozo = eventos.slice(cond.searchResultPosition, cond.searchResultPosition + cond.maxResults);
    const ultima = cond.searchResultPosition + trozo.length >= op.total;
    pagina += 1;

    return {
      status: 200,
      ok: true,
      headers: { get: () => null },
      json: async () => ({
        AcsEvent: {
          searchID: cond.searchID,
          responseStatusStrg: op.estado ? op.estado(pagina, ultima) : ultima ? "OK" : "MORE",
          numOfMatches: trozo.length,
          ...(op.sinTotal ? {} : { totalMatches: op.total }),
          InfoList: trozo,
        },
      }),
    };
  });

  return { fetchImpl, pedidos };
}

const pedir = (fetchImpl: unknown, extra: Record<string, unknown> = {}) =>
  traerEventos({
    host: "http://192.168.10.10",
    usuario: "admin",
    clave: "x",
    desde: "2026-07-13T00:00:00-05:00",
    hasta: "2026-07-13T23:59:59-05:00",
    fetchImpl,
    ...extra,
  });

/* ── 1. LA PAGINACIÓN ─────────────────────────────────────────────────────── */

describe("🔴 el día de los 371 eventos", () => {
  it("los trae TODOS, no los 40 de la primera medición mal hecha", async () => {
    // 🩸 El bug real: cortar cuando `responseStatusStrg` deja de decir "MORE".
    // Este doble dice "OK" desde la segunda página, igual que el firmware.
    const { fetchImpl } = relojDoble({
      total: 371,
      estado: (pagina) => (pagina === 1 ? "MORE" : "OK"),
    });
    const r = await pedir(fetchImpl);
    expect(r.eventos).toHaveLength(371);
    expect(r.totalSegunReloj).toBe(371);
  });

  it("mantiene EL MISMO searchID en las 13 páginas", async () => {
    // Cambiarlo abre una búsqueda nueva por página y `searchResultPosition`
    // deja de significar nada.
    const { fetchImpl, pedidos } = relojDoble({ total: 371 });
    await pedir(fetchImpl);
    expect(new Set(pedidos.map((p) => p.searchID)).size).toBe(1);
    expect(pedidos.length).toBe(Math.ceil(371 / 30));
  });

  it("avanza la posición con lo DEVUELTO, sin saltarse nada", async () => {
    const { fetchImpl, pedidos } = relojDoble({ total: 371 });
    await pedir(fetchImpl);
    expect(pedidos.map((p) => p.posicion)).toEqual(
      Array.from({ length: 13 }, (_, i) => i * 30),
    );
  });

  it("no se pierde ni un serialNo: los 371 son distintos y están todos", async () => {
    const { fetchImpl } = relojDoble({ total: 371 });
    const r = await pedir(fetchImpl);
    const ids = new Set(r.eventos.map((e: { serialNo: number }) => e.serialNo));
    expect(ids.size).toBe(371);
    expect(Math.min(...ids)).toBe(40000);
    expect(Math.max(...ids)).toBe(40370);
  });

  it("un mes entero (8.785 eventos) también sale completo", async () => {
    const { fetchImpl } = relojDoble({ total: 8785 });
    const r = await pedir(fetchImpl);
    expect(r.eventos).toHaveLength(8785);
  });

  it("una página exactamente llena al final no cuelga el bucle", async () => {
    // 360 = 12 páginas de 30 clavadas. La página 13 vuelve vacía.
    const { fetchImpl } = relojDoble({ total: 360 });
    const r = await pedir(fetchImpl);
    expect(r.eventos).toHaveLength(360);
  });

  it("un día sin marcaciones devuelve cero y no explota", async () => {
    const { fetchImpl } = relojDoble({ total: 0 });
    const r = await pedir(fetchImpl);
    expect(r.eventos).toHaveLength(0);
  });

  it("⚠️ sin `totalMatches` (firmware raro) sigue mientras las páginas vengan llenas", async () => {
    const { fetchImpl } = relojDoble({ total: 95, sinTotal: true });
    const r = await pedir(fetchImpl);
    expect(r.eventos).toHaveLength(95);
  });

  it("un `totalMatches` inflado NO deja el bucle girando para siempre", async () => {
    // Freno: la página vacía corta antes que el total mentiroso.
    const { fetchImpl } = relojDoble({ total: 50 });
    const r = await traerEventos({
      host: "http://x",
      usuario: "a",
      clave: "b",
      desde: "d",
      hasta: "h",
      fetchImpl: vi.fn(async (url: string, o: RequestInit) => {
        const res = await fetchImpl(url, o);
        if (res.status !== 200) return res;
        const j = await res.json();
        return { ...res, json: async () => ({ AcsEvent: { ...j.AcsEvent, totalMatches: 99999 } }) };
      }),
    });
    expect(r.eventos).toHaveLength(50);
  });
});

/* ── 2. QUE NO DUPLIQUE ───────────────────────────────────────────────────── */

describe("🔴 correrlo dos veces no puede duplicar nada", () => {
  it("dos vueltas seguidas producen exactamente las mismas llaves", async () => {
    const { fetchImpl } = relojDoble({ total: 371 });
    const a = await pedir(fetchImpl);
    const b = await pedir(fetchImpl);
    const llaves = (r: { eventos: Array<{ serialNo: number }> }) =>
      normalizarEventos("reloj cboston", r.eventos).filas.map((f) => f.evento_id);
    expect(llaves(b)).toEqual(llaves(a));
  });

  it("la ventana rodante SE SOLAPA a propósito, y el solape no cuesta nada", async () => {
    // Pedir los últimos 3 días todos los días significa mandar el mismo evento
    // 3 veces. Es el diseño: así se rellenan los huecos. Lo que lo hace gratis
    // es que la llave (dispositivo, serialNo) sea la misma siempre.
    const { fetchImpl } = relojDoble({ total: 60 });
    const r = await pedir(fetchImpl);
    const juntos = [...r.eventos, ...r.eventos, ...r.eventos];
    expect(normalizarEventos("reloj cboston", juntos).filas).toHaveLength(60);
  });

  it("la ventana siempre lleva el offset de Panamá — sin él el rango se corre 5 horas", () => {
    const v = ventanaRodante({ ahoraMs: Date.parse("2026-08-06T19:00:00Z"), dias: 3 });
    expect(v.desde).toBe("2026-08-04T00:00:00-05:00");
    expect(v.hasta).toBe("2026-08-06T23:59:59-05:00");
  });

  it("la ventana respeta el piso: no se pide historia que no se quiere", () => {
    const v = ventanaRodante({
      ahoraMs: Date.parse("2026-08-06T19:00:00Z"),
      dias: 60,
      piso: "2026-07-01",
    });
    expect(v.desde).toBe("2026-07-01T00:00:00-05:00");
  });

  it("una madrugada de Panamá sigue siendo el día anterior", () => {
    // 02:00 UTC del 7 = 21:00 del 6 en Panamá. Si se usara UTC, el reporte del
    // día 6 perdería las marcaciones de la tarde.
    const v = ventanaRodante({ ahoraMs: Date.parse("2026-08-07T02:00:00Z"), dias: 1 });
    expect(v.hasta).toBe("2026-08-06T23:59:59-05:00");
  });
});

/* ── La ventana larga, solo cuando falta algo ─────────────────────────────── */

interface EstadoAgente {
  fallosAuth: number;
  esperarHastaMs: number;
  ultimaRecuperacionMs?: number;
}

describe("🔴 la PC apagada una semana: se pide la ventana larga, y UNA sola vez", () => {
  const AHORA = Date.parse("2026-08-10T19:00:00Z"); // 14:00 en Panamá
  const base = { ahoraMs: AHORA, ventanaDias: 3, ventanaRecuperacionDias: 15 };

  it("la ventana de siempre es corta cuando no falta nada", () => {
    // Lo último leído es de hoy: la ventana normal lo tapa de sobra.
    const d = decidirVentana({ ...base, leidoHasta: "2026-08-10T13:00:00Z" });
    expect(d).toEqual({ dias: 3, recupera: false });
  });

  it("un fin de semana normal NO dispara el barrido largo", () => {
    // La ventana de 3 días arranca el 8 a las 00:00 de Panamá. Lo leído el 8 a
    // las 22:00 UTC (17:00 de Panamá) cae adentro: no hay hueco.
    const d = decidirVentana({ ...base, leidoHasta: "2026-08-08T22:00:00Z" });
    expect(d.recupera).toBe(false);
  });

  it("si lo leído queda ANTES del arranque de la ventana normal, se pide la larga", () => {
    const d = decidirVentana({ ...base, leidoHasta: "2026-08-03T13:00:00Z" });
    expect(d).toEqual({ dias: 15, recupera: true });
  });

  it("la ventana larga cubre de verdad el hueco de la semana apagada", () => {
    const { dias } = decidirVentana({ ...base, leidoHasta: "2026-08-03T13:00:00Z" });
    const v = ventanaRodante({ ahoraMs: AHORA, dias });
    expect(v.desde).toBe("2026-07-27T00:00:00-05:00");
    expect(Date.parse("2026-08-03T13:00:00Z")).toBeGreaterThan(Date.parse(v.desde));
  });

  it("🩸 no se repite cada 3 minutos: hay candado de 6 horas", () => {
    const estado: EstadoAgente = { fallosAuth: 0, esperarHastaMs: 0 };
    const args = { ...base, leidoHasta: "2026-08-03T13:00:00Z" };

    const primera = decidirVentana({ ...args, ultimaRecuperacionMs: estado.ultimaRecuperacionMs });
    expect(primera.recupera).toBe(true);
    anotarRecuperacion(estado, AHORA);

    // Tres minutos después el hueco SIGUE ahí (nadie marcó, `leido_hasta` no se
    // movió). Sin candado, acá arrancaba el barrido de 125 páginas otra vez.
    const enseguida = decidirVentana({
      ...args,
      ahoraMs: AHORA + 3 * 60_000,
      ultimaRecuperacionMs: estado.ultimaRecuperacionMs,
    });
    expect(enseguida).toEqual({ dias: 3, recupera: false });

    const despues = decidirVentana({
      ...args,
      ahoraMs: AHORA + (RECUPERACION_CADA_HORAS * 60 + 1) * 60_000,
      ultimaRecuperacionMs: estado.ultimaRecuperacionMs,
    });
    expect(despues.recupera).toBe(true);
  });

  it("🩸 sin `leido_hasta` NO se barre largo — un reloj sin marcaciones lo haría para siempre", () => {
    expect(decidirVentana({ ...base, leidoHasta: null }).recupera).toBe(false);
    expect(decidirVentana({ ...base, leidoHasta: "no es una fecha" }).recupera).toBe(false);
  });

  it("una ventana de recuperación que no es más grande no se usa", () => {
    const d = decidirVentana({
      ...base,
      ventanaRecuperacionDias: 3,
      leidoHasta: "2026-08-03T13:00:00Z",
    });
    expect(d.recupera).toBe(false);
  });

  it("el piso manda: no se pide historia anterior a `DESDE_FECHA`", () => {
    const { dias } = decidirVentana({ ...base, leidoHasta: "2026-08-03T13:00:00Z" });
    const v = ventanaRodante({ ahoraMs: AHORA, dias, piso: "2026-08-01" });
    expect(v.desde).toBe("2026-08-01T00:00:00-05:00");
  });

  it("la vuelta entera pide la ventana larga cuando el puente dice que falta algo", async () => {
    const pedidos: { desde: string; hasta: string }[] = [];
    const estado: EstadoAgente = { fallosAuth: 0, esperarHastaMs: 0 };
    const config: Record<string, unknown> = {
      host: "http://192.168.10.10",
      usuario: "admin",
      clave: "x",
      base: "https://fashiongr.com",
      secret: "s",
      dispositivo: "reloj cboston",
      ventanaDias: 3,
      ventanaRecuperacionDias: 15,
      piso: null,
      version: "1.1.0",
    };
    const deps = {
      leerEstado: async () => ({
        pedidoPendiente: false,
        estado: { leido_hasta: "2026-08-03T13:00:00Z" },
      }),
      traerEventos: async (a: { desde: string; hasta: string }) => {
        pedidos.push({ desde: a.desde, hasta: a.hasta });
        return { eventos: [] };
      },
      mandarEventos: async () => ({ lotes: 0, guardados: 0, descartados: 0, pedidoCerrado: false }),
      reportarError: async () => true,
      ahora: () => AHORA,
    };

    await darVuelta({ config, deps, estado });
    expect(pedidos[0].desde).toBe("2026-07-27T00:00:00-05:00");

    // Y la vuelta siguiente, con el mismo hueco sin cerrar, vuelve a la corta.
    await darVuelta({ config, deps: { ...deps, ahora: () => AHORA + 3 * 60_000 }, estado });
    expect(pedidos[1].desde).toBe("2026-08-08T00:00:00-05:00");
  });
});

/* ── 3. UN EVENTO SIN CÓDIGO NO ROMPE EL LOTE ─────────────────────────────── */

describe("🔴 el 66% de los eventos no trae código de empleado", () => {
  it("el agente los manda IGUAL: no filtra, filtra el servidor", async () => {
    // Medido sobre julio real: 5.845 de 8.785 vienen sin `employeeNoString`.
    // Si el agente los filtrara, el día que el reloj dejara de mandar el código
    // de TODO el mundo la asistencia quedaría vacía sin que nadie se enterara.
    const { fetchImpl } = relojDoble({
      total: 10,
      evento: (i) => ({
        serialNo: 50000 + i,
        time: "2026-07-13T08:00:00-05:00",
        ...(i % 3 === 0 ? { employeeNoString: String(i) } : {}),
      }),
    });
    const r = await pedir(fetchImpl);
    expect(r.eventos).toHaveLength(10);
    expect(r.eventos.filter((e: { employeeNoString?: string }) => !e.employeeNoString)).toHaveLength(6);
  });

  it("el servidor guarda los buenos y descarta los otros CON MOTIVO", async () => {
    const { fetchImpl } = relojDoble({
      total: 10,
      evento: (i) => ({
        serialNo: 50000 + i,
        time: "2026-07-13T08:00:00-05:00",
        ...(i % 3 === 0 ? { employeeNoString: String(i) } : {}),
      }),
    });
    const r = await pedir(fetchImpl);
    const n = normalizarEventos("reloj cboston", r.eventos);
    expect(n.filas).toHaveLength(4);
    expect(n.descartados).toHaveLength(6);
    expect(n.descartados[0].motivo).toContain("sin código de empleado");
  });

  it("⚠️ un evento roto en medio del lote NO se lleva puestos a los demás", async () => {
    const { fetchImpl } = relojDoble({
      total: 5,
      evento: (i) => ({
        // El del medio viene sin serialNo Y con fecha basura: lo peor posible.
        ...(i === 2 ? { time: "ayer" } : { serialNo: 60000 + i, time: "2026-07-13T08:00:00-05:00" }),
        employeeNoString: "7",
      }),
    });
    const r = await pedir(fetchImpl);
    const n = normalizarEventos("reloj cboston", r.eventos);
    expect(n.filas).toHaveLength(4);
    expect(n.descartados).toHaveLength(1);
  });
});

/* ── El Digest, contra el desafío textual del reloj real ──────────────────── */

describe("autenticación Digest", () => {
  const REAL = 'Digest qop="auth", realm="DS-K1T804AEF", nonce="NDU2Nzg5MA==", opaque="", algorithm="MD5"';

  it("entiende el desafío que manda el aparato", () => {
    const d = parseDesafio(REAL);
    expect(d.realm).toBe("DS-K1T804AEF");
    expect(d.qop).toBe("auth");
  });

  it("⚠️ no parte el nonce por el `=` de base64", () => {
    // Un `split('=')` a lo bruto devolvería "NDU2Nzg5MA" y la firma saldría mal
    // sin ningún mensaje que lo explique.
    expect(parseDesafio(REAL).nonce).toBe("NDU2Nzg5MA==");
  });

  it("firma con el formato de la RFC (qop, nc y cnonce presentes)", () => {
    const h = construirAutorizacion({
      desafio: parseDesafio(REAL),
      usuario: "admin",
      clave: "secreta",
      metodo: "POST",
      uri: "/ISAPI/AccessControl/AcsEvent?format=json",
      nc: 1,
      cnonce: "aaaaaaaa",
    });
    expect(h).toMatch(/^Digest /);
    expect(h).toContain('username="admin"');
    expect(h).toContain("nc=00000001");
    expect(h).toContain("qop=auth");
    expect(h).not.toContain("secreta"); // la clave NUNCA viaja
  });

  it("es determinista: el mismo desafío da la misma firma", () => {
    const args = {
      desafio: parseDesafio(REAL),
      usuario: "admin",
      clave: "secreta",
      metodo: "POST",
      uri: "/x",
      nc: 3,
      cnonce: "bbbbbbbb",
    };
    expect(construirAutorizacion(args)).toBe(construirAutorizacion(args));
  });

  it("🔴 pide el desafío de nuevo en CADA página — reusarlo bloquea el reloj", async () => {
    // 🩸 MEDIDO CONTRA EL EQUIPO REAL EL 7-AGO-2026. Este test decía lo
    // contrario ("el baile UNA sola vez para las 13 páginas") y ese ahorro era
    // justo lo que rompía todo: la primera página entra bien —el reloj dice
    // "hay 1.089 eventos"— y la SEGUNDA, la que reusa el desafío guardado,
    // vuelve 401. El cliente rehacía el baile y reintentaba, o sea que cada
    // página costaba UN INTENTO FALLIDO DE LOGIN. A los 5 el aparato bloquea
    // la cuenta y a partir de ahí todo falla, incluso con la contraseña
    // correcta — se lee como "contraseña incorrecta" y no lo es.
    //
    // Un request SIN credenciales no es un intento fallido: es la primera
    // mitad normal del Digest, la que hace cualquier navegador. Por eso el
    // contador del reloj no sube. Cuesta el doble de requests y se paga solo.
    const { fetchImpl } = relojDoble({ total: 371 });
    await pedir(fetchImpl);
    const paginas = 13;
    const sinAuth = fetchImpl.mock.calls.filter(
      ([, o]) => !(o as { headers?: Record<string, string> })?.headers?.Authorization,
    );
    expect(sinAuth).toHaveLength(paginas);
    expect(fetchImpl.mock.calls).toHaveLength(paginas * 2);
  });

  it("🔴 NINGÚN request con credenciales puede recibir un 401", async () => {
    // Es la regla de fondo, dicha sobre el efecto y no sobre el mecanismo: lo
    // que bloquea el reloj no es reusar el nonce, es que un request FIRMADO
    // sea rechazado. Si algún día se vuelve a permitir el reuso, este test es
    // el que se pone rojo.
    const { fetchImpl } = relojDoble({ total: 371 });
    await pedir(fetchImpl);
    // ⚠️ `mock.results[i].value` es una PROMESA (la función es async): leerle
    // `.status` directo da undefined y el test pasaría sin mirar nada.
    const respuestas = await Promise.all(fetchImpl.mock.results.map((r) => r.value));
    const firmados = respuestas.filter((_res, i) =>
      Boolean((fetchImpl.mock.calls[i]?.[1] as { headers?: Record<string, string> })?.headers?.Authorization),
    );
    expect(firmados.length).toBeGreaterThan(0); // que de verdad haya firmados que mirar
    expect(firmados.filter((r) => (r as { status: number }).status === 401)).toHaveLength(0);
  });
});

/* ── El envío al puente ───────────────────────────────────────────────────── */

describe("mandar las marcaciones a fashiongr", () => {
  function puenteDoble() {
    const cuerpos: Array<Record<string, unknown>> = [];
    const fetchImpl = vi.fn(async (_u: string, o: RequestInit) => {
      const b = JSON.parse(String(o.body));
      cuerpos.push(b);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          recibidos: b.eventos?.length ?? 0,
          guardados: b.eventos?.length ?? 0,
          descartados: 0,
          pedidoCerrado: !!b.atendioPedido,
        }),
      };
    });
    return { fetchImpl, cuerpos };
  }

  it("parte los lotes grandes: 8.785 eventos no van en un solo pedido", async () => {
    // El servidor rechaza lotes de más de 5.000; además, partirlo hace que un
    // backfill se pueda reintentar sin repetir todo.
    const { fetchImpl, cuerpos } = puenteDoble();
    const eventos = Array.from({ length: 8785 }, (_, i) => ({ serialNo: i }));
    const r = await mandarEventos({
      base: "https://fashiongr.com",
      secret: "s",
      dispositivo: "reloj cboston",
      eventos,
      fetchImpl,
    });
    expect(r.lotes).toBe(Math.ceil(8785 / POR_LOTE));
    expect(cuerpos.every((c) => (c.eventos as unknown[]).length <= POR_LOTE)).toBe(true);
    expect(cuerpos.reduce((a, c) => a + (c.eventos as unknown[]).length, 0)).toBe(8785);
  });

  it("⚠️ con CERO eventos manda igual: es lo que dice 'la PC está viva'", async () => {
    // Sin esto, un día sin marcaciones se vería idéntico a la PC apagada y el
    // vigía avisaría por algo que no pasa.
    const { fetchImpl, cuerpos } = puenteDoble();
    await mandarEventos({
      base: "https://fashiongr.com",
      secret: "s",
      dispositivo: "reloj cboston",
      eventos: [],
      fetchImpl,
    });
    expect(cuerpos).toHaveLength(1);
    expect(cuerpos[0].eventos).toEqual([]);
  });

  it("🔴 el pedido 'Traer ahora' se cierra en el ÚLTIMO lote, no en el primero", async () => {
    // Cerrarlo en el primero haría que la pantalla dijera "listo" con el 90%
    // de las marcaciones todavía sin entrar.
    const { fetchImpl, cuerpos } = puenteDoble();
    const eventos = Array.from({ length: POR_LOTE * 3 }, (_, i) => ({ serialNo: i }));
    await mandarEventos({
      base: "https://fashiongr.com",
      secret: "s",
      dispositivo: "reloj cboston",
      eventos,
      atendioPedido: "2026-08-06T12:00:00.000Z",
      fetchImpl,
    });
    expect(cuerpos.filter((c) => c.atendioPedido)).toHaveLength(1);
    expect(cuerpos[cuerpos.length - 1].atendioPedido).toBe("2026-08-06T12:00:00.000Z");
  });

  it("manda el `dispositivo` con el nombre exacto de las marcaciones ya cargadas", async () => {
    const { fetchImpl, cuerpos } = puenteDoble();
    await mandarEventos({
      base: "https://fashiongr.com",
      secret: "s",
      dispositivo: "reloj cboston",
      eventos: [{ serialNo: 1 }],
      fetchImpl,
    });
    expect(cuerpos[0].dispositivo).toBe("reloj cboston");
  });
});

/* ── La vuelta completa ───────────────────────────────────────────────────── */

describe("una vuelta entera del agente", () => {
  const config = {
    host: "http://192.168.10.10",
    usuario: "admin",
    clave: "x",
    base: "https://fashiongr.com",
    secret: "s",
    dispositivo: "reloj cboston",
    ventanaDias: 3,
    piso: null,
    version: "1.0.0",
  };

  it("recoge el pedido pendiente y lo devuelve cerrado", async () => {
    const mandados: Record<string, unknown>[] = [];
    const r = await darVuelta({
      config,
      deps: {
        leerEstado: async () => ({ pedidoPendiente: true, pedidoEn: "2026-08-06T12:00:00.000Z" }),
        traerEventos: async () => ({ eventos: [{ serialNo: 1 }] }),
        mandarEventos: async (a: Record<string, unknown>) => {
          mandados.push(a);
          return { lotes: 1, guardados: 1, descartados: 0, pedidoCerrado: true };
        },
        reportarError: async () => true,
      },
    });
    expect(r.ok).toBe(true);
    expect(mandados[0].atendioPedido).toBe("2026-08-06T12:00:00.000Z");
  });

  it("🔴 si el reloj no contesta, LO REPORTA — nunca falla en silencio", async () => {
    // El contador de las 3 alertas vive del otro lado. Si el agente se comiera
    // el error, un reloj muerto se vería igual que un día tranquilo.
    const errores: string[] = [];
    const r = await darVuelta({
      config,
      deps: {
        leerEstado: async () => ({ pedidoPendiente: false }),
        traerEventos: async () => {
          throw new Error("connect ETIMEDOUT 192.168.10.10:80");
        },
        mandarEventos: async () => ({}),
        reportarError: async (a: { error: string }) => {
          errores.push(a.error);
          return true;
        },
      },
    });
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe("reloj-sin-responder");
    expect(errores[0]).toContain("ETIMEDOUT");
  });

  it("si fashiongr no contesta, NO toca el reloj y se reintenta después", async () => {
    const traer = vi.fn();
    const r = await darVuelta({
      config,
      deps: {
        leerEstado: async () => {
          throw new Error("fetch failed");
        },
        traerEventos: traer,
        mandarEventos: async () => ({}),
        reportarError: async () => true,
      },
    });
    expect(r.motivo).toBe("puente-inalcanzable");
    expect(traer).not.toHaveBeenCalled();
  });

  it("⚠️ NUNCA lanza: un throw mataría el bucle y la PC quedaría muda", async () => {
    const r = await darVuelta({
      config,
      deps: {
        leerEstado: async () => ({ pedidoPendiente: false }),
        traerEventos: async () => ({ eventos: [{ serialNo: 1 }] }),
        mandarEventos: async () => {
          throw new Error("500 del servidor");
        },
        reportarError: async () => {
          throw new Error("tampoco hay internet");
        },
      },
    });
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe("no-se-pudo-guardar");
  });
});

/* ── El `searchID` y su largo ─────────────────────────────────────────────── */

describe("🔴 el searchID no puede pasar de 20 caracteres", () => {
  // 🩸 MEDIDO CONTRA EL EQUIPO REAL EL 7-AGO-2026, largo por largo: 1, 4, 8, 16
  // y 20 responden 200; **21 en adelante responden 400 `badParameters`**. No
  // son los guiones (un "abc-def" de 7 pasa): es puro largo.
  //
  // Acá se usaba `randomUUID()`, que mide 36. O sea que el agente NUNCA pudo
  // traer una sola marcación: autenticaba bien, la pantalla decía "✔ El reloj
  // contesta", y la búsqueda moría con un 400 que no nombraba el campo. Se
  // buscó el problema en la contraseña, en los permisos y en el firmware.
  it("el que se manda de verdad entra en el límite del aparato", async () => {
    const { fetchImpl, pedidos } = relojDoble({ total: 95 });
    await traerEventos({ host: "http://reloj", usuario: "admin", clave: "x", desde: "a", hasta: "b", fetchImpl });
    expect(pedidos.length).toBeGreaterThan(1);
    for (const p of pedidos) expect(p.searchID.length).toBeLessThanOrEqual(20);
  });

  it("y sigue siendo el MISMO en todas las páginas", async () => {
    // Acortarlo no puede romper lo que ya protegía: un searchID por búsqueda,
    // no por página (si no, `searchResultPosition` deja de significar nada).
    const { fetchImpl, pedidos } = relojDoble({ total: 95 });
    await traerEventos({ host: "http://reloj", usuario: "admin", clave: "x", desde: "a", hasta: "b", fetchImpl });
    expect(new Set(pedidos.map((p) => p.searchID)).size).toBe(1);
  });

  it("dos búsquedas distintas no comparten el mismo", async () => {
    const a = relojDoble({ total: 5 });
    const b = relojDoble({ total: 5 });
    await traerEventos({ host: "http://reloj", usuario: "admin", clave: "x", desde: "a", hasta: "b", fetchImpl: a.fetchImpl });
    await traerEventos({ host: "http://reloj", usuario: "admin", clave: "x", desde: "a", hasta: "b", fetchImpl: b.fetchImpl });
    expect(a.pedidos[0].searchID).not.toBe(b.pedidos[0].searchID);
  });
});

describe("⚠️ el motivo que da el reloj no se tira a la basura", () => {
  // 🩸 El 400 del searchID largo se leyó como "el reloj no responde" y mandó a
  // revisar contraseñas. El aparato SÍ decía `badParameters` — el agente lo
  // descartaba antes de que nadie lo viera.
  it("un 400 llega con lo que el reloj dijo", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({ statusCode: 6, statusString: "Invalid Content", subStatusCode: "badParameters" }),
        { status: 400 },
      ),
    );
    await expect(
      traerEventos({ host: "http://reloj", usuario: "admin", clave: "x", desde: "a", hasta: "b", fetchImpl }),
    ).rejects.toThrow(/badParameters/);
  });

  it("si el cuerpo no se puede leer, el error principal NO se pierde", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 500,
      text: async () => {
        throw new Error("conexión cortada");
      },
    }));
    await expect(
      traerEventos({ host: "http://reloj", usuario: "admin", clave: "x", desde: "a", hasta: "b", fetchImpl }),
    ).rejects.toThrow(/respondió 500/);
  });
});

/* ── El castigo del reloj ─────────────────────────────────────────────────── */

import * as espera from "../../../scripts/agente-reloj/espera.mjs";

describe("🔴 si el reloj rechaza la contraseña, se ESPERA — no se insiste", () => {
  // 🩸 VISTO EN VIVO EL 7-AGO-2026 EN LA PC DE LA OFICINA. El reloj bloquea la
  // cuenta por intentos fallidos y mientras está bloqueado rechaza TAMBIÉN la
  // contraseña correcta. El agente daba una vuelta cada 3 minutos y cada vuelta
  // renovaba el castigo: 16:43, 16:46, 16:49, 16:52… El reloj no se iba a
  // destrabar NUNCA por su cuenta. Y se leía como "contraseña incorrecta",
  // con la contraseña perfecta.

  const AHORA = Date.parse("2026-08-07T21:00:00Z");
  const config = { base: "https://x", secret: "s", dispositivo: "reloj cboston", version: "1.0.0", ventanaDias: 3 };

  const errorClave = () => {
    const e = new Error("El reloj rechazó la contraseña (401).");
    (e as Error & { codigo: string }).codigo = "credenciales";
    return e;
  };

  function deps(traer: () => Promise<unknown>, ahoraMs: number) {
    const mandados: unknown[] = [];
    const reportados: string[] = [];
    return {
      mandados,
      reportados,
      d: {
        leerEstado: async () => ({ pedidoPendiente: false }),
        traerEventos: traer,
        mandarEventos: async (a: { eventos: unknown[] }) => {
          mandados.push(a.eventos);
          return { lotes: 1, recibidos: 0, guardados: 0, descartados: 0, pedidoCerrado: false };
        },
        reportarError: async (a: { error: string }) => {
          reportados.push(a.error);
          return true;
        },
        ahora: () => ahoraMs,
      },
    };
  }

  it("la vuelta siguiente NO le pregunta al reloj", async () => {
    const estado = espera.nuevoEstadoReloj();
    let consultas = 0;
    const traer = async () => {
      consultas += 1;
      throw errorClave();
    };

    const a = deps(traer, AHORA);
    await darVuelta({ config, deps: a.d, estado });
    expect(consultas).toBe(1);

    // 3 minutos después: la vuelta corre, pero el reloj NO se toca.
    const b = deps(traer, AHORA + 3 * 60_000);
    const r = await darVuelta({ config, deps: b.d, estado });
    expect(consultas).toBe(1); // ← lo que evita el pozo
    expect(r.motivo).toBe("esperando-al-reloj");
  });

  it("pasada la espera, vuelve a intentar solo", async () => {
    const estado = espera.nuevoEstadoReloj();
    let consultas = 0;
    const traer = async () => {
      consultas += 1;
      throw errorClave();
    };
    await darVuelta({ config, deps: deps(traer, AHORA).d, estado });
    const luego = AHORA + (espera.ESCALONES_MIN[0] + 1) * 60_000;
    await darVuelta({ config, deps: deps(traer, luego).d, estado });
    expect(consultas).toBe(2);
  });

  it("⚠️ mientras espera SIGUE reportándose vivo — si no, se ve igual que la PC apagada", async () => {
    const estado = espera.nuevoEstadoReloj();
    await darVuelta({ config, deps: deps(async () => { throw errorClave(); }, AHORA).d, estado });
    const b = deps(async () => ({ eventos: [] }), AHORA + 60_000);
    await darVuelta({ config, deps: b.d, estado });
    expect(b.mandados).toEqual([[]]); // un lote vacío, no silencio
  });

  it("mientras espera NO manda avisos — el aviso queda espaciado por la espera misma", async () => {
    // Un aviso cada 3 minutos convierte un problema real en ruido, que es la
    // forma más rápida de que nadie lo lea. No hace falta una bandera aparte:
    // durante la espera la vuelta ni llega a intentar, así que el aviso sale
    // como mucho una vez cada 45 minutos por construcción.
    const estado = espera.nuevoEstadoReloj();
    const traer = async () => { throw errorClave(); };
    const a = deps(traer, AHORA);
    await darVuelta({ config, deps: a.d, estado });
    expect(a.reportados).toHaveLength(1);
    for (const min of [3, 6, 9, 30, 44]) {
      const b = deps(traer, AHORA + min * 60_000);
      await darVuelta({ config, deps: b.d, estado });
      expect(b.reportados).toHaveLength(0);
    }
  });

  it("un problema de RED sí se reintenta enseguida — no deja castigo en el aparato", async () => {
    const estado = espera.nuevoEstadoReloj();
    let consultas = 0;
    const traer = async () => {
      consultas += 1;
      throw new Error("fetch failed"); // sin `codigo`
    };
    await darVuelta({ config, deps: deps(traer, AHORA).d, estado });
    await darVuelta({ config, deps: deps(traer, AHORA + 60_000).d, estado });
    expect(consultas).toBe(2);
  });

  it("un éxito borra el castigo entero", async () => {
    const estado = espera.nuevoEstadoReloj();
    await darVuelta({ config, deps: deps(async () => { throw errorClave(); }, AHORA).d, estado });
    expect(estado.fallosAuth).toBe(1);
    const luego = AHORA + (espera.ESCALONES_MIN[0] + 1) * 60_000;
    await darVuelta({ config, deps: deps(async () => ({ eventos: [] }), luego).d, estado });
    expect(estado.fallosAuth).toBe(0);
    expect(estado.esperarHastaMs).toBe(0);
  });

  it("la primera espera supera al castigo del aparato (30 min)", async () => {
    // Quedarse corto significa gastar el intento cuando todavía está castigado
    // — o sea, renovarlo. Es el error que este módulo existe para no cometer.
    expect(espera.minutosDeEspera(1)).toBeGreaterThan(30);
  });

  it("sube con los rechazos seguidos y tiene tope", async () => {
    const v = [1, 2, 3, 4, 5, 99].map((n) => espera.minutosDeEspera(n));
    expect(v[0]).toBeLessThan(v[1]);
    expect(v[1]).toBeLessThan(v[2]);
    expect(v[5]).toBe(v[3]); // topa y no crece para siempre
  });
});
