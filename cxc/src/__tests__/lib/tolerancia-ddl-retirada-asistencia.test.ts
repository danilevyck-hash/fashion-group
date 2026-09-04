/**
 * CANDADO — LA TOLERANCIA A LA DDL SE RETIRÓ EN ASISTENCIA (3-sep-2026).
 *
 * ─── QUÉ PASABA ─────────────────────────────────────────────────────────────
 * Cuando se estrenaba una tabla o una columna de Asistencia, el código se
 * escribía para funcionar ANTES de que la migración corriera: si Supabase
 * contestaba «eso no existe» (`PGRST205`, `42P01`, `42703`, `PGRST204`) y el
 * error NOMBRABA la tabla o la columna, el módulo degradaba a «no hay datos»
 * con un aviso en ámbar. Era CORRECTO mientras la migración estuviera
 * pendiente — en esta casa los DDL los corre Daniel a mano.
 *
 * ─── POR QUÉ YA NO ──────────────────────────────────────────────────────────
 * Las diez migraciones de esta tanda ya corrieron (verificado contra producción
 * por PostgREST el 3-sep-2026, tabla por tabla y columna por columna). Ese
 * camino quedó como RAMA MUERTA que solo puede esconder errores reales — y en
 * Asistencia «esconder» es PAGAR MAL: todos activos, nadie de vacaciones, nadie
 * fuera de planilla, seguros sobre el bruto, todas las extras pagadas sin
 * aprobar, nadie atado a su préstamo, y el reparto por empresa abierto. Con la
 * pantalla tranquila.
 *
 * ─── QUÉ MIDE ESTE ARCHIVO ──────────────────────────────────────────────────
 * Para cada archivo tocado, las dos direcciones:
 *   · CONTROL — con la tabla presente la respuesta es la MISMA de antes.
 *   · el PGRST205 / 42703 / PGRST204 — ahora FALLA VISIBLE (lanza, o 500 con
 *     mensaje), nunca vacío, nunca `faltaTabla: true`, nunca un 503 «falta
 *     correr el archivo».
 *
 * Son tests de CONDUCTA con la base doblada: llaman a las funciones y a los
 * handlers reales. Un barrido de texto no serviría — en este repo ya pasó que
 * el candado se cumpliera con el comentario que explica la regla.
 *
 * ⚠️ Los detectores (`esTablaFaltante`, `esColumna*Faltante`, `esColumnaFaltante`
 * de `agente.ts`) NO se borraron: los siguen usando `reglas`, `justificaciones`,
 * `vacaciones`, `reloj`, `ingest`, `correcciones` y el cron vigía — otra tanda.
 *
 * 🔴 IDIOMA: español neutro, tuteo. Candado aparte: `nada-de-voseo.test.ts`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── La base doblada ──────────────────────────────────────────────────────────

/** «Esa tabla no existe», tal cual la manda PostgREST cuando el schema cache
 *  no la conoce. Es el error que ANTES se tragaba cada uno de estos módulos. */
const PGRST205 = (tabla: string) => ({
  code: "PGRST205",
  message: `Could not find the table 'public.${tabla}' in the schema cache`,
});
/** «Esa columna no existe» (Postgres, en un select). */
const SIN_COLUMNA_42703 = (tabla: string, col: string) => ({
  code: "42703",
  message: `column ${tabla}.${col} does not exist`,
});
/** «Esa columna no existe» (PostgREST, en un upsert). */
const SIN_COLUMNA_PGRST204 = (tabla: string, col: string) => ({
  code: "PGRST204",
  message: `Could not find the '${col}' column of '${tabla}' in the schema cache`,
});

type Res = { data: unknown; error: unknown; count?: number | null };
/** Lo que se pidió: la operación y, en un `select`, las columnas. */
type Pedido = { op: string; cols: string; payload: unknown };

/** Qué contesta cada tabla. Se reescribe por test. Lo que no esté, contesta
 *  vacío. Una FUNCIÓN mira qué se pidió — sirve para contestar «esa columna no
 *  existe» SOLO cuando el `select` la nombra, que es como se comporta PostgREST
 *  y lo único que deja cazar una relectura «sin la columna». */
let porTabla: Record<string, Res | ((p: Pedido) => Res)> = {};
/** Las escrituras que llegaron a la base, en orden. */
const escrituras: Array<{ tabla: string; op: string; payload: unknown }> = [];
/** Las lecturas, con sus columnas: para afirmar que NO hubo segunda lectura. */
const lecturas: Array<{ tabla: string; cols: string }> = [];

/**
 * Una cadena de PostgREST de mentira: cualquier método devuelve la misma
 * cadena; `await`, `.single()` y `.maybeSingle()` resuelven con lo de `porTabla`.
 * Las escrituras (`insert`/`upsert`/`update`/`delete`) se anotan.
 */
function cadena(tabla: string): unknown {
  let op = "select";
  let cols = "";
  let payload: unknown;
  const resolver = (): Res => {
    const r = porTabla[tabla];
    const base = typeof r === "function" ? r({ op, cols, payload }) : (r ?? { data: [], error: null });
    if (op !== "select") escrituras.push({ tabla, op, payload });
    else lecturas.push({ tabla, cols });
    if (base.error == null && base.count === undefined && Array.isArray(base.data)) {
      return { ...base, count: base.data.length };
    }
    return base;
  };
  const p: Record<string | symbol, unknown> = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") {
          return (ok: (v: Res) => unknown, rej?: (e: unknown) => unknown) =>
            Promise.resolve(resolver()).then(ok, rej);
        }
        if (prop === "maybeSingle" || prop === "single") {
          return () => {
            const r = resolver();
            return Promise.resolve({
              ...r,
              data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data,
            });
          };
        }
        if (prop === "insert" || prop === "upsert" || prop === "update" || prop === "delete") {
          return (arg: unknown) => {
            op = String(prop);
            payload = arg;
            return p;
          };
        }
        if (prop === "select") {
          return (arg: unknown) => {
            if (typeof arg === "string") cols = arg;
            return p;
          };
        }
        return () => p;
      },
    },
  );
  return p;
}

vi.mock("@/lib/supabase-server", () => ({
  HAS_SERVICE_ROLE: true,
  supabaseServer: { from: (tabla: string) => cadena(tabla) },
}));

// `admin` pasa por `requireAsistencia` sin mirar módulos: es lo que hay que
// probar acá no es el permiso sino la base.
vi.mock("@/lib/requireRole", () => ({
  requireRole: () => ({ role: "admin", userId: "u-1", userName: "Daniel", sessionToken: "t" }),
}));

const JULIO = "11";
const FICHA_JULIO = {
  empleado_codigo: JULIO, nombre: "JULIO GARAY", salario_mensual: "1000.00",
  jornada_semanal: 40, empresa: "vistana", fecha_ingreso: null, fecha_salida: null,
  motivo_salida: null, servicio_profesional: false, paga_seguros: true,
  saldo_vacaciones_dias: null, saldo_vacaciones_corte: null, no_marca_reloj: false,
  seguros_base_quincena: null,
};

/** «Esa columna no existe» SOLO si el `select` la pide; si no, contesta `data`. */
const sinColumna = (tabla: string, col: string, data: unknown[] = []) => (p: Pedido): Res =>
  p.cols.includes(col) ? { data: null, error: SIN_COLUMNA_42703(tabla, col) } : { data, error: null };

beforeEach(() => {
  porTabla = {};
  escrituras.length = 0;
  lecturas.length = 0;
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. config-server.ts — el hub: reglas, fichas, justificaciones, vacaciones,
//    reparto. Era el archivo con más escalones (siete, solo en `leerPersonas`).
// ═════════════════════════════════════════════════════════════════════════════
describe("1. config-server.ts — cinco lecturas, ninguna degrada ya", () => {
  it("CONTROL: con las tablas presentes, cada lectura devuelve lo de siempre", async () => {
    porTabla["asistencia_reglas"] = { data: [{ id: 1, tolerancia_tardanza_min: 10 }], error: null };
    porTabla["asistencia_personas"] = { data: [FICHA_JULIO], error: null };
    porTabla["asistencia_justificaciones"] = {
      data: [{ empleado_codigo: JULIO, desde: "2026-08-03", hasta: "2026-08-03", motivo: "Enfermedad", hora_desde: null, hora_hasta: null }],
      error: null,
    };
    porTabla["asistencia_vacaciones"] = {
      data: [{ empleado_codigo: JULIO, desde: "2026-08-10", hasta: "2026-08-12", ya_pagadas: false }],
      error: null,
    };
    porTabla["asistencia_reparto_empresa"] = {
      data: [{ empleado_codigo: JULIO, empresa: "vistana", salario_mensual: "800.00", paga_seguros: true, paga_horas_extra: false, orden: 0 }],
      error: null,
    };
    const cs = await import("@/lib/asistencia/config-server");

    const reglas = await cs.leerReglas();
    expect(reglas.reglas.toleranciaTardanzaMin).toBe(10);
    expect(reglas.faltaMigracion).toBe(false);

    const personas = await cs.leerPersonas();
    expect(personas.filas).toHaveLength(1);
    expect(personas.faltaMigracion).toBe(false);
    // Las banderas `faltaColumna*` ya no viajan: no hay escalera que las llene.
    expect("faltaColumnasBajas" in personas).toBe(false);

    expect((await cs.leerJustificaciones("2026-08-01", "2026-08-15")).filas).toHaveLength(1);
    const vac = await cs.leerVacaciones("2026-08-01", "2026-08-15");
    expect(vac.filas).toEqual([{ empleado_codigo: JULIO, desde: "2026-08-10", hasta: "2026-08-12", ya_pagadas: false }]);
    expect("faltaTabla" in vac).toBe(false);
    expect((await cs.leerRepartos()).filas).toHaveLength(1);
  });

  it("🔴 leerReglas con PGRST205 lanza — antes caía a REGLAS_DEFAULT en silencio", async () => {
    porTabla["asistencia_reglas"] = { data: null, error: PGRST205("asistencia_reglas") };
    const { leerReglas } = await import("@/lib/asistencia/config-server");
    await expect(leerReglas()).rejects.toThrow(/asistencia_reglas/);
  });

  it("🔴 leerPersonas con PGRST205 lanza — antes devolvía cero fichas con faltaMigracion", async () => {
    porTabla["asistencia_personas"] = { data: null, error: PGRST205("asistencia_personas") };
    const { leerPersonas } = await import("@/lib/asistencia/config-server");
    await expect(leerPersonas()).rejects.toThrow(/asistencia_personas/);
  });

  it("🔴 leerPersonas con 42703 de una columna NUEVA lanza — antes bajaba un peldaño y leía SIN esa columna", async () => {
    // Cada una de las columnas que la escalera sabía quitar. La base doblada
    // contesta el 42703 SOLO si el `select` nombra la columna (como PostgREST):
    // así una relectura «sin ella» tendría ÉXITO, y se vería. Una sola
    // relectura sin cualquiera de ellas es plata mal pagada.
    for (const col of [
      "seguros_base_quincena", "no_marca_reloj", "saldo_vacaciones_dias",
      "paga_seguros", "servicio_profesional", "fecha_salida",
    ]) {
      lecturas.length = 0;
      porTabla["asistencia_personas"] = sinColumna("asistencia_personas", col, [FICHA_JULIO]);
      const { leerPersonas } = await import("@/lib/asistencia/config-server");
      await expect(leerPersonas(), col).rejects.toThrow(new RegExp(col));
      expect(lecturas.filter((l) => l.tabla === "asistencia_personas"), col).toHaveLength(1);
    }
  });

  it("🔴 leerJustificaciones con 42703 de `hora_desde` lanza — antes releía sin horas (todas de DÍA ENTERO)", async () => {
    porTabla["asistencia_justificaciones"] = sinColumna("asistencia_justificaciones", "hora_desde", [
      { empleado_codigo: JULIO, desde: "2026-08-03", hasta: "2026-08-03", motivo: "Enfermedad" },
    ]);
    const { leerJustificaciones } = await import("@/lib/asistencia/config-server");
    await expect(leerJustificaciones("2026-08-01", "2026-08-15")).rejects.toThrow(/hora_desde/);
    expect(lecturas.filter((l) => l.tabla === "asistencia_justificaciones")).toHaveLength(1);
  });

  it("🔴 leerVacaciones con PGRST205 lanza — antes «nadie está de vacaciones» (y esos días se cobraban como ausencia)", async () => {
    porTabla["asistencia_vacaciones"] = { data: null, error: PGRST205("asistencia_vacaciones") };
    const { leerVacaciones } = await import("@/lib/asistencia/config-server");
    await expect(leerVacaciones("2026-08-01", "2026-08-15")).rejects.toThrow(/asistencia_vacaciones/);
  });

  it("🔴 leerRepartos con PGRST205 lanza — antes «nadie reparte» (Julio con seguros sobre sus extras)", async () => {
    porTabla["asistencia_reparto_empresa"] = { data: null, error: PGRST205("asistencia_reparto_empresa") };
    const { leerRepartos } = await import("@/lib/asistencia/config-server");
    await expect(leerRepartos()).rejects.toThrow(/asistencia_reparto_empresa/);
  });

  it("⚠️ y con PGRST205 tampoco hay SEGUNDA lectura: un error es un error, no una pregunta", async () => {
    porTabla["asistencia_personas"] = { data: null, error: PGRST205("asistencia_personas") };
    const { leerPersonas } = await import("@/lib/asistencia/config-server");
    await expect(leerPersonas()).rejects.toThrow();
    expect(lecturas.filter((l) => l.tabla === "asistencia_personas")).toHaveLength(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. aprobaciones-server.ts — las horas extra autorizadas.
// ═════════════════════════════════════════════════════════════════════════════
describe("2. aprobaciones-server.ts — el candado de las extras no se suelta por un error", () => {
  it("CONTROL: con la tabla presente lee y escribe como siempre", async () => {
    porTabla["asistencia_horas_extra_aprobadas"] = {
      data: [{ empleado_codigo: JULIO, fecha: "2026-08-03", aprobado: true, minutos_vistos: 60, marcado_por: "Contabilidad", marcado_en: "2026-08-04T12:00:00Z" }],
      error: null,
    };
    const { leerAprobaciones, guardarAprobaciones } = await import("@/lib/asistencia/aprobaciones-server");
    const r = await leerAprobaciones("2026-08-01", "2026-08-15");
    expect(r.filas).toHaveLength(1);
    expect(r.filas[0].aprobado).toBe(true);
    expect("faltaTabla" in r).toBe(false);
    const ok = await guardarAprobaciones({
      dias: [{ codigo: JULIO, fecha: "2026-08-03", minutos: 60 }],
      aprobado: true, por: "Contabilidad", cuando: "2026-08-04T12:00:00.000Z",
    });
    expect(ok).toBe(true);
    expect(escrituras.map((e) => e.op)).toEqual(["upsert"]);
  });

  it("🔴 leer con PGRST205 lanza — antes devolvía cero filas con `faltaTabla` y la planilla pagaba TODAS las extras", async () => {
    porTabla["asistencia_horas_extra_aprobadas"] = { data: null, error: PGRST205("asistencia_horas_extra_aprobadas") };
    const { leerAprobaciones } = await import("@/lib/asistencia/aprobaciones-server");
    await expect(leerAprobaciones("2026-08-01", "2026-08-15")).rejects.toThrow(/asistencia_horas_extra_aprobadas/);
  });

  it("🔴 guardar con PGRST205 lanza — antes devolvía `false` y la ruta contestaba un aviso tranquilizador", async () => {
    porTabla["asistencia_horas_extra_aprobadas"] = { data: null, error: PGRST205("asistencia_horas_extra_aprobadas") };
    const { guardarAprobaciones } = await import("@/lib/asistencia/aprobaciones-server");
    await expect(guardarAprobaciones({
      dias: [{ codigo: JULIO, fecha: "2026-08-03", minutos: 60 }],
      aprobado: true, por: "Contabilidad", cuando: "2026-08-04T12:00:00.000Z",
    })).rejects.toThrow(/asistencia_horas_extra_aprobadas/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. aprobador-empresa-server.ts + 4. aprobador-empresa.ts — de qué empresas
//    aprueba cada uno. El agujero de los 57 días de Boston.
// ═════════════════════════════════════════════════════════════════════════════
describe("3. aprobador-empresa-server.ts — un error NO abre el reparto", () => {
  it("CONTROL: Julio (cuenta `Bodega`) alcanza sus dos empresas y no Boston", async () => {
    porTabla["asistencia_aprobador_empresa"] = {
      data: [{ usuario: "Bodega", empresa: "fashion_wear" }, { usuario: "Bodega", empresa: "vistana" }],
      error: null,
    };
    const { leerAlcanceAprobador } = await import("@/lib/asistencia/aprobador-empresa-server");
    const a = await leerAlcanceAprobador("bodega", "Bodega");
    expect([...(a.empresas ?? [])].sort()).toEqual(["fashion_wear", "vistana"]);
    expect(a.faltaTabla).toBe(false);
  });

  it("🔴 con PGRST205 lanza — antes «nadie queda segmentado» y Julio podía aprobar Boston", async () => {
    porTabla["asistencia_aprobador_empresa"] = { data: null, error: PGRST205("asistencia_aprobador_empresa") };
    const { leerAlcanceAprobador } = await import("@/lib/asistencia/aprobador-empresa-server");
    await expect(leerAlcanceAprobador("bodega", "Bodega")).rejects.toThrow(/asistencia_aprobador_empresa/);
  });

  it("admin sigue sin consultar la tabla: pasa aunque la base esté rota", async () => {
    porTabla["asistencia_aprobador_empresa"] = { data: null, error: PGRST205("asistencia_aprobador_empresa") };
    const { leerAlcanceAprobador } = await import("@/lib/asistencia/aprobador-empresa-server");
    const a = await leerAlcanceAprobador("admin", "daniel");
    expect(a.empresas).toBeNull();
  });
});

describe("4. aprobador-empresa.ts — ya no hay forma de pedirle «todas» sin ser admin", () => {
  it("🔴 `alcanceDe` acepta TRES argumentos: el cuarto (`faltaTabla`) se fue con la escalera", async () => {
    const { alcanceDe, puedeAprobarA } = await import("@/lib/asistencia/aprobador-empresa");
    expect(alcanceDe.length).toBe(3);
    // Y un cuarto argumento colado por `as any` no abre nada.
    const a = (alcanceDe as unknown as (...args: unknown[]) => { empresas: ReadonlySet<string> | null; faltaTabla: boolean })(
      "bodega", "Bodega", [], true,
    );
    expect(a.empresas).not.toBeNull();
    expect(a.faltaTabla).toBe(false);
    expect(puedeAprobarA(a, [{ codigo: "40", empresa: "confecciones_boston" }]).ok).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. planilla-guardada-server.ts — la planilla congelada.
// ═════════════════════════════════════════════════════════════════════════════
describe("5. planilla-guardada-server.ts — leer vacío ante un error abre el doble pago", () => {
  const CAB = {
    id: "vieja-1", empresa: "vistana", desde: "2026-08-01", hasta: "2026-08-15",
    quincena: "2026-08-1", version: 1, estado: "cerrada", cerrada_por: "Angela",
    cerrada_en: "2026-08-16T10:00:00Z", reabierta_por: null, reabierta_en: null,
    motivo_reabrir: null, personas: 1, total_bruto: "249.37", total_deducciones: "87.43",
    total_neto: "161.94", factor_base: 1,
  };

  it("CONTROL: con la tabla presente lee la cabecera y las cabeceras", async () => {
    porTabla["asistencia_planilla_guardada"] = { data: [CAB], error: null };
    const { leerCabeceras, leerCabecera } = await import("@/lib/asistencia/planilla-guardada-server");
    const todas = await leerCabeceras("vistana");
    expect(todas.cabeceras).toHaveLength(1);
    expect(todas.cabeceras[0].totalNeto).toBe(161.94);
    expect("faltaTabla" in todas).toBe(false);
    expect((await leerCabecera("vieja-1")).cabecera?.id).toBe("vieja-1");
  });

  it("🔴 leerCabeceras con PGRST205 lanza — antes «no hay nada cerrado» y el solapamiento no frenaba", async () => {
    porTabla["asistencia_planilla_guardada"] = { data: null, error: PGRST205("asistencia_planilla_guardada") };
    const { leerCabeceras } = await import("@/lib/asistencia/planilla-guardada-server");
    await expect(leerCabeceras("vistana")).rejects.toThrow(/asistencia_planilla_guardada/);
  });

  it("🔴 leerCabecera con PGRST205 lanza", async () => {
    porTabla["asistencia_planilla_guardada"] = { data: null, error: PGRST205("asistencia_planilla_guardada") };
    const { leerCabecera } = await import("@/lib/asistencia/planilla-guardada-server");
    await expect(leerCabecera("vieja-1")).rejects.toThrow(/asistencia_planilla_guardada/);
  });

  it("🔴 cerrarPlanilla con PGRST205 en la cabecera lanza — antes `{ ok: false, faltaTabla: true }`", async () => {
    porTabla["asistencia_planilla_guardada"] = { data: null, error: PGRST205("asistencia_planilla_guardada") };
    const { cerrarPlanilla } = await import("@/lib/asistencia/planilla-guardada-server");
    await expect(cerrarPlanilla({
      empresa: "vistana", desde: "2026-08-01", hasta: "2026-08-15", quincena: "2026-08-1",
      factorBase: 1, usuario: "Angela", lineas: [], yaGuardadas: [],
    })).rejects.toThrow(/asistencia_planilla_guardada/);
    // Y no escribió renglones ni marcó nada como cerrada.
    expect(escrituras.filter((e) => e.tabla === "asistencia_planilla_guardada_linea")).toHaveLength(0);
  });

  it("🔴 cerrarPlanilla con PGRST205 en los RENGLONES lanza — antes también degradaba", async () => {
    porTabla["asistencia_planilla_guardada_linea"] = { data: null, error: PGRST205("asistencia_planilla_guardada_linea") };
    const { cerrarPlanilla } = await import("@/lib/asistencia/planilla-guardada-server");
    // Una línea con lo que `filaDeLinea` lee. `dinero: null` = «decidirlo a
    // mano»; alcanza para que el insert de renglones se intente.
    const linea = {
      codigo: JULIO, nombre: "JULIO GARAY", etiqueta: "JULIO GARAY", empresa: "vistana",
      empresaEtiqueta: "Vistana", salarioMensual: 1000, jornadaSemanal: 40, pagaSeguros: true,
      noMarcaReloj: false, fueraDePlanilla: false, faltaConfigurar: false, decidirAMano: null,
      parte: null, quincenalReferencia: 500, extraMedido: null, extraNoAprobada: null, extraAprobada: true,
      horas: {}, dinero: null,
    } as unknown as import("@/lib/asistencia/planilla").LineaPlanilla;
    await expect(cerrarPlanilla({
      empresa: "vistana", desde: "2026-08-01", hasta: "2026-08-15", quincena: "2026-08-1",
      factorBase: 1, usuario: "Angela", lineas: [linea], yaGuardadas: [],
    })).rejects.toThrow(/asistencia_planilla_guardada_linea/);
    // El commit (`estado = cerrada`) nunca se escribió.
    expect(escrituras.filter((e) => e.op === "update")).toHaveLength(0);
  });

  it("🔴 reabrirPlanilla con PGRST205 lanza", async () => {
    porTabla["asistencia_planilla_guardada"] = { data: null, error: PGRST205("asistencia_planilla_guardada") };
    const { reabrirPlanilla } = await import("@/lib/asistencia/planilla-guardada-server");
    await expect(reabrirPlanilla("vieja-1", "Angela", "se pagó mal")).rejects.toThrow(/asistencia_planilla_guardada/);
  });

  it("el EXCLUDE del solapamiento (23P01) sigue siendo `choque`, no un error: es OTRA invariante", async () => {
    porTabla["asistencia_planilla_guardada"] = {
      data: null,
      error: { code: "23P01", message: 'conflicting key value violates exclusion constraint "sin_solape"' },
    };
    const { cerrarPlanilla } = await import("@/lib/asistencia/planilla-guardada-server");
    const r = await cerrarPlanilla({
      empresa: "vistana", desde: "2026-08-01", hasta: "2026-08-15", quincena: "2026-08-1",
      factorBase: 1, usuario: "Angela", lineas: [], yaGuardadas: [],
    });
    expect(r).toEqual({ ok: false, choque: true });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. prestamos-planilla-server.ts — el préstamo traído del módulo.
// ═════════════════════════════════════════════════════════════════════════════
describe("6. prestamos-planilla-server.ts — «nadie atado» ante un error es cómo se perdieron $700", () => {
  it("CONTROL: con la columna del amarre presente, la ficha viene con su código", async () => {
    porTabla["prestamos_empleados"] = {
      data: [{ id: "p-1", nombre: "LUIS ADRIAN ARROYO", activo: true, deduccion_quincenal: "50.00", empleado_codigo: "49" }],
      error: null,
    };
    porTabla["prestamos_movimientos"] = {
      data: [{ id: "m-1", empleado_id: "p-1", fecha: "2026-07-01", concepto: "Préstamo", monto: "700.00" }],
      error: null,
    };
    const { leerPrestamosDeQuincena } = await import("@/lib/asistencia/prestamos-planilla-server");
    const r = await leerPrestamosDeQuincena("2026-08-01", "2026-08-15");
    expect(r.fichas).toHaveLength(1);
    expect(r.fichas[0].codigo).toBe("49");
    expect(r.fichas[0].saldo).toBe(700);
    expect("faltaColumnaAmarre" in r).toBe(false);
  });

  it("🔴 con 42703 de `empleado_codigo` lanza — antes releía SIN el amarre y nadie quedaba atado", async () => {
    // La base contesta el 42703 SOLO si el `select` pide `empleado_codigo`: una
    // relectura sin el amarre tendría ÉXITO (con la ficha suelta) y se vería.
    porTabla["prestamos_empleados"] = sinColumna("prestamos_empleados", "empleado_codigo", [
      { id: "p-1", nombre: "LUIS ADRIAN ARROYO", activo: true, deduccion_quincenal: "50.00" },
    ]);
    const { leerPrestamosDeQuincena } = await import("@/lib/asistencia/prestamos-planilla-server");
    await expect(leerPrestamosDeQuincena("2026-08-01", "2026-08-15")).rejects.toThrow(/empleado_codigo/);
    expect(lecturas.filter((l) => l.tabla === "prestamos_empleados")).toHaveLength(1);
  });

  it("🔴 leerAprobacionesPrestamo con PGRST205 lanza — antes «nadie aprobado, la casilla a mano»", async () => {
    porTabla["asistencia_prestamo_aprobado"] = { data: null, error: PGRST205("asistencia_prestamo_aprobado") };
    const { leerAprobacionesPrestamo } = await import("@/lib/asistencia/prestamos-planilla-server");
    await expect(leerAprobacionesPrestamo("2026-08-1")).rejects.toThrow(/asistencia_prestamo_aprobado/);
  });

  it("🔴 guardarAprobacionesPrestamo con PGRST205 lanza — antes devolvía `false` con aviso", async () => {
    porTabla["asistencia_prestamo_aprobado"] = { data: null, error: PGRST205("asistencia_prestamo_aprobado") };
    const { guardarAprobacionesPrestamo } = await import("@/lib/asistencia/prestamos-planilla-server");
    await expect(guardarAprobacionesPrestamo({
      quincena: "2026-08-1", items: [{ codigo: "49", monto: 50 }], aprobado: true,
      por: "Contabilidad", cuando: "2026-08-04T12:00:00.000Z",
    })).rejects.toThrow(/asistencia_prestamo_aprobado/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. /api/asistencia/configuracion — GET (fichas) y PUT (una ficha).
// ═════════════════════════════════════════════════════════════════════════════
describe("7. /api/asistencia/configuracion — la pantalla ya no dice «falta correr el archivo»", () => {
  const pedirGet = () => new NextRequest("https://fashiongr.com/api/asistencia/configuracion");
  const pedirPut = (body: unknown) =>
    new NextRequest("https://fashiongr.com/api/asistencia/configuracion", {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
  const FICHA = {
    codigo: JULIO, nombre: "JULIO GARAY", salarioMensual: "1000", jornadaSemanal: 40,
    empresa: "vistana",
  };

  it("CONTROL GET: 200 con la ficha, y las banderas de migración en su valor «todo bien»", async () => {
    porTabla["asistencia_personas"] = { data: [FICHA_JULIO], error: null };
    const { GET } = await import("@/app/api/asistencia/configuracion/route");
    const res = await GET(pedirGet());
    expect(res.status).toBe(200);
    const j = (await res.json()) as Record<string, unknown> & { personas: Array<{ codigo: string }> };
    expect(j.personas.map((p) => p.codigo)).toEqual([JULIO]);
    expect(j.faltaMigracion).toBe(false);
    expect(j.avisoMigracion).toBeNull();
    for (const k of ["puedeDarDeBaja", "puedeMarcarServicioProfesional", "puedeQuitarSeguros", "puedeCargarBaseSeguros", "puedeMarcarSueldoFijo", "puedeCargarSaldoVacaciones"]) {
      expect(j[k], k).toBe(true);
    }
    for (const k of ["avisoMigracionBajas", "avisoMigracionServicioProfesional", "avisoMigracionSeguros", "avisoMigracionBaseSeguros", "avisoMigracionNoMarcaReloj", "avisoMigracionSaldoVacaciones", "avisoMigracionReparto"]) {
      expect(j[k], k).toBeNull();
    }
  });

  it("🔴 GET con PGRST205 en las fichas es 500 con el mensaje — antes 200 con la lista del reloj y un aviso", async () => {
    porTabla["asistencia_personas"] = { data: null, error: PGRST205("asistencia_personas") };
    const { GET } = await import("@/app/api/asistencia/configuracion/route");
    const res = await GET(pedirGet());
    expect(res.status).toBe(500);
    const j = (await res.json()) as { error?: string; personas?: unknown; faltaMigracion?: unknown };
    expect(j.error).toContain("asistencia_personas");
    expect(j.personas).toBeUndefined();
    expect(j.faltaMigracion).toBeUndefined();
  });

  it("🔴 GET con PGRST205 en el reparto es 500 — antes 200 con `avisoMigracionReparto`", async () => {
    porTabla["asistencia_personas"] = { data: [FICHA_JULIO], error: null };
    porTabla["asistencia_reparto_empresa"] = { data: null, error: PGRST205("asistencia_reparto_empresa") };
    const { GET } = await import("@/app/api/asistencia/configuracion/route");
    const res = await GET(pedirGet());
    expect(res.status).toBe(500);
    expect(((await res.json()) as { error: string }).error).toContain("asistencia_reparto_empresa");
  });

  it("CONTROL PUT: 200 y UN upsert con las siete columnas adentro", async () => {
    const { PUT } = await import("@/app/api/asistencia/configuracion/route");
    const res = await PUT(pedirPut(FICHA));
    expect(res.status).toBe(200);
    expect(escrituras).toHaveLength(1);
    const fila = escrituras[0].payload as Record<string, unknown>;
    for (const col of ["fecha_salida", "servicio_profesional", "paga_seguros", "saldo_vacaciones_dias", "no_marca_reloj", "seguros_base_quincena"]) {
      expect(col in fila, col).toBe(true);
    }
  });

  it("🔴 PUT con PGRST204 de CADA columna es 500 y un solo upsert — antes reintentaba sin ella (o 503)", async () => {
    for (const col of ["seguros_base_quincena", "no_marca_reloj", "saldo_vacaciones_dias", "paga_seguros", "servicio_profesional", "fecha_salida"]) {
      escrituras.length = 0;
      // Como PostgREST: el PGRST204 sale SOLO si el upsert trae la columna. Un
      // reintento «sin ella» tendría ÉXITO y contestaría 200 — y se vería.
      porTabla["asistencia_personas"] = (p) =>
        p.op === "upsert" && col in (p.payload as Record<string, unknown>)
          ? { data: null, error: SIN_COLUMNA_PGRST204("asistencia_personas", col) }
          : { data: [], error: null };
      const { PUT } = await import("@/app/api/asistencia/configuracion/route");
      const res = await PUT(pedirPut(FICHA));
      expect(res.status, col).toBe(500);
      const j = (await res.json()) as Record<string, unknown>;
      expect(Object.keys(j).filter((k) => k.startsWith("faltaMigracion")), col).toEqual([]);
      expect(escrituras.filter((e) => e.op === "upsert"), col).toHaveLength(1);
    }
  });

  it("🔴 PUT con PGRST205 de la tabla es 500, no 503 «falta la migración»", async () => {
    porTabla["asistencia_personas"] = { data: null, error: PGRST205("asistencia_personas") };
    const { PUT } = await import("@/app/api/asistencia/configuracion/route");
    const res = await PUT(pedirPut(FICHA));
    expect(res.status).toBe(500);
    expect(((await res.json()) as { faltaMigracion?: unknown }).faltaMigracion).toBeUndefined();
  });

  it("🔴 PUT con 22P02 y medio día de saldo es 500 — antes 503 «falta la migración de medios días» (la columna ya es numeric)", async () => {
    // La relectura del corte ANTES de escribir contesta bien (sin saldo previo);
    // el upsert es el que trae el 22P02.
    porTabla["asistencia_personas"] = (p) =>
      p.op === "upsert"
        ? { data: null, error: { code: "22P02", message: 'invalid input syntax for type integer: "12.5"' } }
        : { data: [], error: null };
    const { PUT } = await import("@/app/api/asistencia/configuracion/route");
    const res = await PUT(pedirPut({ ...FICHA, saldoVacacionesDias: "12.5" }));
    expect(res.status).toBe(500);
    const j = (await res.json()) as { faltaMigracionSaldoMediosDias?: unknown; error?: string };
    expect(j.faltaMigracionSaldoMediosDias).toBeUndefined();
    expect(j.error).not.toContain("20260826060000");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8. /api/asistencia/planilla-guardada — cerrar, reabrir, leer lo cerrado.
// ═════════════════════════════════════════════════════════════════════════════
describe("8. /api/asistencia/planilla-guardada — las tres puertas contestan 500, ninguna un aviso", () => {
  const leer = (qs: string) => new NextRequest(`https://fashiongr.com/api/asistencia/planilla-guardada?${qs}`);
  const mandar = (metodo: "POST" | "PATCH", body: unknown) =>
    new NextRequest("https://fashiongr.com/api/asistencia/planilla-guardada", {
      method: metodo, headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });

  it("CONTROL: leer una empresa sin nada cerrado es 200 en borrador, aviso null", async () => {
    const { GET } = await import("@/app/api/asistencia/planilla-guardada/route");
    const res = await GET(leer("empresa=vistana&desde=2026-08-01&hasta=2026-08-15"));
    expect(res.status).toBe(200);
    const j = (await res.json()) as { estado: string; aviso: unknown };
    expect(j.estado).toBe("borrador");
    expect(j.aviso).toBeNull();
  });

  it("🔴 leer con PGRST205 es 500 — antes 200 «borrador» con el aviso (y el freno del solapamiento abierto)", async () => {
    porTabla["asistencia_planilla_guardada"] = { data: null, error: PGRST205("asistencia_planilla_guardada") };
    const { GET } = await import("@/app/api/asistencia/planilla-guardada/route");
    const res = await GET(leer("empresa=vistana&desde=2026-08-01&hasta=2026-08-15"));
    expect(res.status).toBe(500);
    const j = (await res.json()) as { aviso?: unknown; error?: string };
    expect(j.aviso).toBeUndefined();
    expect(j.error).toContain("asistencia_planilla_guardada");
  });

  it("🔴 cerrar con PGRST205 es 500 sin `faltaTabla` — antes 503 con el archivo — y no se escribió nada", async () => {
    porTabla["asistencia_planilla_guardada"] = { data: null, error: PGRST205("asistencia_planilla_guardada") };
    const { POST } = await import("@/app/api/asistencia/planilla-guardada/route");
    const res = await POST(mandar("POST", { empresa: "vistana", desde: "2026-08-01", hasta: "2026-08-15" }));
    expect(res.status).toBe(500);
    const j = (await res.json()) as { faltaTabla?: unknown; aviso?: unknown };
    expect(j.faltaTabla).toBeUndefined();
    expect(j.aviso).toBeUndefined();
    expect(escrituras).toHaveLength(0);
  });

  it("🔴 reabrir con PGRST205 es 500 sin `faltaTabla`", async () => {
    porTabla["asistencia_planilla_guardada"] = { data: null, error: PGRST205("asistencia_planilla_guardada") };
    const { PATCH } = await import("@/app/api/asistencia/planilla-guardada/route");
    const res = await PATCH(mandar("PATCH", { id: "vieja-1", motivo: "se pagó mal" }));
    expect(res.status).toBe(500);
    expect(((await res.json()) as { faltaTabla?: unknown }).faltaTabla).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 9. /api/asistencia/planilla — el cuadro. Con la base doblada de punta a punta.
// ═════════════════════════════════════════════════════════════════════════════
describe("9. /api/asistencia/planilla — si una lectura falla, la PLANILLA NO SALE", () => {
  const pedir = () =>
    new NextRequest("https://fashiongr.com/api/asistencia/planilla?quincena=2026-08-1&empresa=vistana");

  /** Un lunes real: entra 08:00 y sale 18:00 (Panamá) → hay una hora extra. */
  function baseSana() {
    porTabla["asistencia_personas"] = { data: [FICHA_JULIO], error: null };
    porTabla["asistencia_marcaciones"] = {
      data: [
        { id: "m1", empleado_codigo: JULIO, empleado_nombre: "", ocurrio_en: "2026-08-03T13:00:00.000Z" },
        { id: "m2", empleado_codigo: JULIO, empleado_nombre: "", ocurrio_en: "2026-08-03T23:00:00.000Z" },
      ],
      error: null,
    };
    porTabla["asistencia_horarios"] = {
      data: [{ empleado_codigo: JULIO, entrada: "08:00:00", salida: "17:00:00", almuerzo_minutos: 30 }],
      error: null,
    };
  }

  type Linea = {
    codigo: string;
    dinero: { extraDiurno: number; extraNocturno: number } | null;
    horas: { extraNoAprobadaMin: number };
    extraAprobada: boolean;
  };
  type Cuadro = { lineas: Linea[]; avisos: Record<string, unknown> };

  it("CONTROL: 200, Julio en el cuadro, y los avisos de migración en null", async () => {
    baseSana();
    const { GET } = await import("@/app/api/asistencia/planilla/route");
    const res = await GET(pedir());
    expect(res.status).toBe(200);
    const j = (await res.json()) as Cuadro;
    expect(j.lineas.map((l) => l.codigo)).toEqual([JULIO]);
    for (const k of [
      "faltaMigracionConfiguracion", "faltaMigracionBajas", "faltaMigracionServicioProfesional",
      "faltaMigracionBaseSeguros", "faltaMigracionAmarrePrestamos", "faltaMigracionPrestamoAprobado",
      "faltaMigracionAprobaciones", "faltaMigracionAprobador", "faltaMigracionVacaciones",
      "faltaMigracionReparto",
    ]) {
      expect(j.avisos[k], k).toBeNull();
    }
  });

  it("🔴 el candado de las extras está SIEMPRE puesto: sin aprobación, no se pagan — y quedan apartadas", async () => {
    baseSana();
    const { GET } = await import("@/app/api/asistencia/planilla/route");
    const j = (await (await GET(pedir())).json()) as Cuadro;
    const l = j.lineas[0];
    expect(l.dinero).not.toBeNull();
    expect(l.dinero!.extraDiurno + l.dinero!.extraNocturno).toBe(0);
    // Los 60 minutos del reloj no desaparecen: quedan apartados como «sin
    // aprobar» (así los ve la pestaña Aprobaciones).
    expect(l.horas.extraNoAprobadaMin).toBe(60);
    expect(l.extraAprobada).toBe(false);
  });

  it("y con el día aprobado, se pagan: el candado responde a la tabla, no a su ausencia", async () => {
    baseSana();
    porTabla["asistencia_horas_extra_aprobadas"] = {
      data: [{ empleado_codigo: JULIO, fecha: "2026-08-03", aprobado: true, minutos_vistos: 60, marcado_por: "Contabilidad", marcado_en: "2026-08-04T12:00:00Z" }],
      error: null,
    };
    const { GET } = await import("@/app/api/asistencia/planilla/route");
    const j = (await (await GET(pedir())).json()) as Cuadro;
    expect(j.lineas[0].dinero!.extraDiurno + j.lineas[0].dinero!.extraNocturno).toBeGreaterThan(0);
  });

  const CASOS: Array<[string, () => void]> = [
    ["fichas (asistencia_personas)", () => { porTabla["asistencia_personas"] = { data: null, error: PGRST205("asistencia_personas") }; }],
    ["vacaciones", () => { porTabla["asistencia_vacaciones"] = { data: null, error: PGRST205("asistencia_vacaciones") }; }],
    ["reparto", () => { porTabla["asistencia_reparto_empresa"] = { data: null, error: PGRST205("asistencia_reparto_empresa") }; }],
    ["aprobaciones de extras", () => { porTabla["asistencia_horas_extra_aprobadas"] = { data: null, error: PGRST205("asistencia_horas_extra_aprobadas") }; }],
    ["justificaciones sin `hora_desde`", () => { porTabla["asistencia_justificaciones"] = sinColumna("asistencia_justificaciones", "hora_desde"); }],
    ["préstamos sin el amarre", () => { porTabla["prestamos_empleados"] = sinColumna("prestamos_empleados", "empleado_codigo"); }],
    ["aprobación de préstamo", () => { porTabla["asistencia_prestamo_aprobado"] = { data: null, error: PGRST205("asistencia_prestamo_aprobado") }; }],
    ["reglas", () => { porTabla["asistencia_reglas"] = { data: null, error: PGRST205("asistencia_reglas") }; }],
  ];

  for (const [nombre, romper] of CASOS) {
    it(`🔴 con la base rota en ${nombre}: 500 con el mensaje, sin cuadro — antes 200 «como ayer» con un aviso`, async () => {
      baseSana();
      romper();
      const { GET } = await import("@/app/api/asistencia/planilla/route");
      const res = await GET(pedir());
      expect(res.status).toBe(500);
      const j = (await res.json()) as { error?: string; lineas?: unknown; avisos?: unknown };
      expect(j.error).toBeTruthy();
      expect(j.lineas).toBeUndefined();
      expect(j.avisos).toBeUndefined();
    });
  }
});
