/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 VER Y QUITAR LAS MARCACIONES DE MÁS (18-sep-2026)
 *
 * La contadora, por WhatsApp el 17-sep-2026, textual:
 *
 *     «el motivo de que no me deja cerrar es porque hay marcaciones de mas y no
 *      me deja eliminar»
 *
 * y al día siguiente, mirando el archivo que descarga:
 *
 *     «y como veo quien marco de mas? en el excel solo salen max 4 marcaciones
 *      el excel que descargo»
 *
 * Daniel, aclarando de cuáles habla: *«las marcaciones del reloj, no las del
 * app que hicimos»*. Y, decidiendo la regla:
 *
 *     «osea las quincena solo cierran con 4, hay q quitar hasta que llegue a 4
 *      maximo. cuando hay 5 o mas es porq es error. quiero saber todos los que
 *      marcaron 5 veces last 30 days y si marcan 5 o mas poder quitarlas»
 *
 * 🔴 LO QUE ESTE CANDADO PROTEGE:
 *   A. las cuatro columnas de siempre ESCONDEN marcas, y se sabe cuáles;
 *   B. las marcas pegadas se señalan, con el umbral MEDIDO;
 *   C. el Excel lleva todas las marcas Y las cuatro columnas NO se movieron;
 *   D. quitar escribe una corrección ENCIMA y NO toca `asistencia_marcaciones`;
 *   E. la regla del cierre es IMPAR **o** MÁS DE 4 (cambió de dirección hoy).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import {
  MARCAS_NORMALES,
  SEGUNDOS_PEGADAS,
  cabenEnLasCuatroColumnas,
  columnasClasicas,
  cuantasMarcasTexto,
  cuantoDespues,
  indicesPegados,
  marcasEscondidas,
  marcasPegadas,
  segundosDeHora,
  textoTodasLasMarcas,
  tieneMarcasDeMas,
  tituloPegada,
} from "@/lib/asistencia/marcas-del-dia";
import {
  MARCAS_MAXIMO,
  contarDias,
  diasConMarcasImpares,
  marcasMalContadas,
  marcasImparesDeLineas,
  partirImpares,
  textoFrenoMarcasImpares,
} from "@/lib/asistencia/marcas-impares";

const RAIZ = path.join(process.cwd(), "src");

/** El día real de Ramón Miranda (21), 26-ago-2026. La 4.ª no se veía. */
const RAMON = ["08:10:21", "13:58:34", "14:23:38", "14:23:39", "18:00:50"];
/** El de Alejandra Camaño (22), 9-sep-2026. Mismo caso, 51 segundos. */
const ALEJANDRA = ["07:59:20", "13:03:44", "13:33:07", "13:33:58", "16:58:25"];
/** Un día normal, de los 679 de 840 medidos. */
const NORMAL = ["08:04:08", "12:06:59", "12:39:52", "16:37:50"];

// ─────────────────────────────────────────────────────────────────────────────
// A. LAS CUATRO COLUMNAS ESCONDEN MARCAS
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 A. las cuatro columnas de siempre, y qué esconden", () => {
  it("🔑 con 4 marcas la cuenta es la de SIEMPRE: [0, 1, 2, 3] y no esconde nada", () => {
    expect(columnasClasicas(4)).toEqual([0, 1, 2, 3]);
    expect(marcasEscondidas(4)).toEqual([]);
    expect(cabenEnLasCuatroColumnas(4)).toBe(true);
  });

  it("🩸 UN DÍA DE 5 MARCAS ESCONDÍA LA CUARTA — que es justo la repetida", () => {
    // Lo que la pantalla dibujaba: la 1.ª, la 2.ª, la 3.ª y la ÚLTIMA.
    expect(columnasClasicas(5)).toEqual([0, 1, 2, 4]);
    expect(marcasEscondidas(5)).toEqual([3]);
    expect(cabenEnLasCuatroColumnas(5)).toBe(false);
    // En el día de Ramón, la escondida era 14:23:39 — la que sobra.
    expect(marcasEscondidas(RAMON.length).map((i) => RAMON[i])).toEqual(["14:23:39"]);
    expect(marcasEscondidas(ALEJANDRA.length).map((i) => ALEJANDRA[i])).toEqual(["13:33:58"]);
  });

  it("🩸 y con 6 esconde DOS; con 3, la del MEDIO", () => {
    expect(marcasEscondidas(6)).toEqual([3, 4]);
    // Con 3 marcas se veían la 1.ª y la 3.ª: la del medio no estaba en ningún lado.
    expect(columnasClasicas(3)).toEqual([0, null, null, 2]);
    expect(marcasEscondidas(3)).toEqual([1]);
    expect(cabenEnLasCuatroColumnas(3)).toBe(false);
  });

  it("los días de 0, 1 y 2 marcas se ven enteros, como siempre", () => {
    expect(columnasClasicas(0)).toEqual([null, null, null, null]);
    expect(columnasClasicas(1)).toEqual([0, null, null, null]);
    expect(columnasClasicas(2)).toEqual([0, null, null, 1]);
    expect(marcasEscondidas(0)).toEqual([]);
    expect(marcasEscondidas(1)).toEqual([]);
    expect(marcasEscondidas(2)).toEqual([]);
  });

  it("«5 marcas» / «1 marca», y el día normal son 4", () => {
    expect(cuantasMarcasTexto(5)).toBe("5 marcas");
    expect(cuantasMarcasTexto(1)).toBe("1 marca");
    expect(MARCAS_NORMALES).toBe(4);
    expect(tieneMarcasDeMas(4)).toBe(false);
    expect(tieneMarcasDeMas(5)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. LAS PEGADAS SE SEÑALAN, CON EL UMBRAL MEDIDO
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 B. dos marcas pegadas se señalan", () => {
  it("🔑 el umbral son CINCO minutos — el error que Daniel cometió él mismo", () => {
    expect(SEGUNDOS_PEGADAS).toBe(300);
  });

  it("en el día de Ramón señala la 4.ª, a un segundo de la 3.ª", () => {
    expect(marcasPegadas(RAMON)).toEqual([{ idx: 3, segundos: 1 }]);
    expect(indicesPegados(RAMON).has(3)).toBe(true);
    expect(indicesPegados(RAMON).has(2)).toBe(false);
  });

  it("y en el de Alejandra, la 4.ª a 51 segundos", () => {
    expect(marcasPegadas(ALEJANDRA)).toEqual([{ idx: 3, segundos: 51 }]);
  });

  it("🔴 UN DÍA NORMAL NO SEÑALA NADA: sus marcas están a horas una de otra", () => {
    expect(marcasPegadas(NORMAL)).toEqual([]);
    expect(indicesPegados(NORMAL).size).toBe(0);
  });

  it("tres seguidas señalan la 2.ª y la 3.ª, cada una con su brecha (colaborador 40, 31-ago)", () => {
    const tres = ["07:44:27", "13:34:06", "14:05:00", "18:27:46", "18:27:49", "18:27:57"];
    expect(marcasPegadas(tres)).toEqual([
      { idx: 4, segundos: 3 },
      { idx: 5, segundos: 8 },
    ]);
  });

  it("⚠️ a los 5 minutos justos todavía señala; a los 5 minutos y un segundo, no", () => {
    expect(marcasPegadas(["08:00:00", "08:05:00"])).toHaveLength(1);
    expect(marcasPegadas(["08:00:00", "08:05:01"])).toEqual([]);
  });

  it("una hora que no se entiende no rompe nada: se salta", () => {
    expect(segundosDeHora("25:00:00")).toBeNull();
    expect(segundosDeHora("")).toBeNull();
    expect(segundosDeHora("08:10:21")).toBe(8 * 3600 + 10 * 60 + 21);
    expect(marcasPegadas(["nada", "08:00:01"])).toEqual([]);
  });

  it("el título dice el hecho y NO afirma que sobre: ofrece el botón", () => {
    expect(cuantoDespues(1)).toBe("1 segundo");
    expect(cuantoDespues(51)).toBe("51 segundos");
    expect(cuantoDespues(96)).toBe("1 min 36 s");
    expect(cuantoDespues(120)).toBe("2 min");
    expect(tituloPegada(1)).toContain("1 segundo después");
    expect(tituloPegada(1)).toContain("Quitar esta marcación");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. EL EXCEL — todas las marcas, y las cuatro columnas donde estaban
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 C. el Excel dice quién marcó de más", () => {
  const dia = (over: Record<string, unknown>) => ({
    fecha: "2026-08-26", marcas: [] as string[], marcasIds: [], repetidas: [], entrada: null, salida: null,
    tardeMin: 0, excesoAlmuerzoMin: 0, salidaTempranaMin: 0, extraMin: 0, trabajadoMin: 0,
    revisar: false, salidaSospechosa: false, enCurso: false, fueraDeVigencia: false,
    ausente: false, vacacion: null, justificado: null, permiso: null, permisoRango: null,
    permisoPerdonaMin: 0, permisoPerdonaSalidaMin: 0, permisoPerdonaAlmuerzoMin: 0,
    feriado: null, habil: true, correcciones: [],
    ...over,
  });
  const resumen = {
    diasTrabajados: 1, ausenciasSinJustificar: 0, ausenciasJustificadas: 0,
    diasTrabajandoFuera: 0, diasVacaciones: 0, diasVacacionesYaPagadas: 0,
    vecesTarde: 0, minutosTarde: 0, minutosTardeDeDiasARevisar: 0,
    diasConPermiso: 0, minutosPerdonadosPorPermiso: 0,
    minutosPerdonadosTarde: 0, minutosPerdonadosSalidaTemprana: 0, minutosPerdonadosAlmuerzo: 0,
    excesoAlmuerzoMin: 0, salidaTempranaMin: 0, extraMin: 0, diasARevisar: 1,
    diasEnCurso: 0, tiempoNoTrabajadoMin: 0, diasCorregidos: 0, correcciones: 0,
  };

  async function hoja(marcas: string[], overDia: Record<string, unknown> = {}) {
    const XLSX = await import("xlsx-js-style");
    const { construirExcel, COL_ENTRADA, COL_SALIDA, COL_TODAS_LAS_MARCAS, COL_CUANTAS_MARCAS } =
      await import("@/lib/asistencia/exportar");
    const wb = construirExcel({
      personas: [{
        codigo: "21", nombre: "RAMON MIRANDA", salida: "18:00", almuerzoMin: 30,
        dias: [dia({ marcas, revisar: true, ...overDia })], resumen,
      }] as never,
      desde: "2026-08-26", hasta: "2026-08-26",
    });
    const h = wb.Sheets["Detalle"];
    const celda = (r: number, c: number) => h[XLSX.utils.encode_cell({ r, c })]?.v;
    return { celda, COL_ENTRADA, COL_SALIDA, COL_TODAS_LAS_MARCAS, COL_CUANTAS_MARCAS };
  }

  it("🔴 LAS CUATRO DE SIEMPRE NO SE MOVIERON: D · E · F · G, con sus nombres", async () => {
    const { celda, COL_ENTRADA, COL_SALIDA } = await hoja(RAMON);
    expect(COL_ENTRADA).toBe(3);
    expect(COL_SALIDA).toBe(6);
    expect(celda(0, 3)).toBe("Entrada");
    expect(celda(0, 4)).toBe("Sale almuerzo");
    expect(celda(0, 5)).toBe("Vuelve");
    expect(celda(0, 6)).toBe("Salida");
    // Y su contenido es el de siempre: 1.ª, 2.ª, 3.ª y ÚLTIMA.
    expect(celda(1, 3)).toBe("08:10:21");
    expect(celda(1, 4)).toBe("13:58:34");
    expect(celda(1, 5)).toBe("14:23:38");
    expect(celda(1, 6)).toBe("18:00:50");
  });

  it("🔴 AL LADO, TODAS LAS MARCAS Y CUÁNTAS SON — con la cuarta adentro", async () => {
    const { celda, COL_TODAS_LAS_MARCAS, COL_CUANTAS_MARCAS } = await hoja(RAMON);
    expect(COL_TODAS_LAS_MARCAS).toBe(7);
    expect(COL_CUANTAS_MARCAS).toBe(8);
    expect(celda(0, 7)).toBe("Todas las marcas");
    expect(celda(0, 8)).toBe("Cuántas marcas");
    expect(celda(1, 7)).toBe(textoTodasLasMarcas(RAMON));
    // 🔴 La que NO se veía por ningún lado, ahora está en el archivo.
    expect(String(celda(1, 7))).toContain("14:23:39");
    // Número, no texto: así se filtra y se ordena por «5 o más».
    expect(celda(1, 8)).toBe(5);
  });

  it("un día sin marcas deja las dos celdas vacías, nunca un 0", async () => {
    // Un día de AUSENCIA sí tiene fila en la hoja, y no tiene ni una marca.
    const { celda } = await hoja([], { ausente: true });
    expect(celda(1, 7)).toBe("");
    expect(celda(1, 8)).toBe("");
  });

  it("⚠️ el archivo explica las columnas nuevas en la hoja de la guía", async () => {
    const fuente = fs.readFileSync(path.join(RAIZ, "lib/asistencia/exportar.ts"), "utf8");
    expect(fuente).toContain("Todas las marcas / Cuántas marcas");
    // Y «A revisar» dice la regla NUEVA, no «sin las 4».
    expect(fuente).toContain("EXACTAMENTE 4 marcas");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D. LA REGLA DEL CIERRE CAMBIÓ DE DIRECCIÓN: IMPAR **O** MÁS DE 4
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 D. impar O más de 4 (18-sep-2026)", () => {
  const diaImpar = (marcas: number, over: Record<string, unknown> = {}) => ({
    fecha: "2026-09-01",
    marcas: Array.from({ length: marcas }, (_, i) => `0${i}`),
    habil: true, enCurso: false, fueraDeVigencia: false, vacacion: null,
    ...over,
  });

  it("el tope son 4 y sale del MISMO 4 de la pantalla", () => {
    expect(MARCAS_MAXIMO).toBe(MARCAS_NORMALES);
    expect(MARCAS_MAXIMO).toBe(4);
  });

  it("🔴 5 frena · 6 frena TAMBIÉN (antes no) · 4 no · 2 sigue sin frenar", () => {
    expect(marcasMalContadas(5)).toBe(true);
    // 🩸 ACÁ CAMBIÓ: hasta el 17-sep-2026 esto era `false` porque 6 es par.
    expect(marcasMalContadas(6)).toBe(true);
    expect(marcasMalContadas(7)).toBe(true);
    expect(marcasMalContadas(4)).toBe(false);
    expect(marcasMalContadas(3)).toBe(true);
    // 🔑 El par de 2 sigue pasando, y es deliberado (Andrea Pérez, 1-sep).
    expect(marcasMalContadas(2)).toBe(false);
    expect(marcasMalContadas(0)).toBe(false);
  });

  it("🔴 EN EL MOTOR: el día de 6 marcas ahora sale en la lista que frena", () => {
    const dias = [diaImpar(4), diaImpar(6, { fecha: "2026-09-02" }), diaImpar(5, { fecha: "2026-09-03" })];
    expect(diasConMarcasImpares(dias)).toEqual([
      { fecha: "2026-09-02", marcas: 6 },
      { fecha: "2026-09-03", marcas: 5 },
    ]);
  });

  it("⚠️ y lo que quedaba afuera sigue afuera: no hábil, en curso, sin vigencia, vacaciones", () => {
    expect(diasConMarcasImpares([diaImpar(6, { habil: false })])).toEqual([]);
    expect(diasConMarcasImpares([diaImpar(6, { enCurso: true })])).toEqual([]);
    expect(diasConMarcasImpares([diaImpar(6, { fueraDeVigencia: true })])).toEqual([]);
    expect(diasConMarcasImpares([diaImpar(6, { vacacion: {} })])).toEqual([]);
  });

  it("el día de 6 cae del lado «de MÁS», que es donde tiene que estar", () => {
    const gente = marcasImparesDeLineas([
      { codigo: "54", etiqueta: "Yeishka (54)", marcasImpares: [{ fecha: "2026-09-02", marcas: 6 }] },
      { codigo: "16", etiqueta: "Andrea (16)", marcasImpares: [{ fecha: "2026-09-01", marcas: 3 }] },
    ]);
    const { deMenos, deMas } = partirImpares(gente);
    expect(deMas.map((p) => p.codigo)).toEqual(["54"]);
    expect(deMenos.map((p) => p.codigo)).toEqual(["16"]);
    expect(contarDias(gente)).toBe(2);
  });

  it("🔴 EL TEXTO DEL FRENO dice el tope y nombra el botón NUEVO", () => {
    const t = textoFrenoMarcasImpares(
      marcasImparesDeLineas([
        { codigo: "54", etiqueta: "Yeishka (54)", marcasImpares: [{ fecha: "2026-09-02", marcas: 6 }] },
      ]),
    ) ?? "";
    expect(t).toContain("nunca pasa de 4 marcaciones");
    expect(t).toContain("Quitar esta marcación");
    expect(t).toContain("Agregar hora");
    // 🩸 Ya no dice «un número PAR»: 6 es par y hoy frena.
    expect(t).not.toContain("número PAR");
  });

  it("⚠️ el comentario VIEJO se conserva, con su nota fechada al lado", () => {
    const fuente = fs.readFileSync(path.join(RAIZ, "lib/asistencia/marcas-impares.ts"), "utf8");
    expect(fuente).toContain("LA REGLA ES **IMPAR**, PUNTO — Y 6 ES PAR, ASÍ QUE NO LA ATRAPA");
    expect(fuente).toContain("18-sep-2026 — ESTO CAMBIÓ DE DIRECCIÓN");
    expect(fuente).toContain("las quincena solo cierran con 4");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E. QUITAR — la ruta, con la base mockeada
// ─────────────────────────────────────────────────────────────────────────────

const escrituras: Array<{ tabla: string; op: string; payload: unknown }> = [];
let marcacionEnLaBase: Record<string, unknown> | null = {
  id: "m4", empleado_codigo: "21", ocurrio_en: "2026-08-26T19:23:39.000Z",
};

vi.mock("@/lib/supabase-server", () => {
  const cadena = (tabla: string) => {
    const api: Record<string, unknown> = {};
    for (const m of ["select", "eq", "is", "order", "range", "gte", "lte", "limit"]) api[m] = () => api;
    for (const op of ["insert", "update", "upsert"]) {
      api[op] = (payload: unknown) => { escrituras.push({ tabla, op, payload }); return api; };
    }
    api.delete = () => { escrituras.push({ tabla, op: "delete", payload: null }); return api; };
    api.single = async () => ({ data: { id: "corr-nueva" }, error: null });
    api.maybeSingle = async () => ({
      data: tabla === "asistencia_marcaciones" ? marcacionEnLaBase : null,
      error: null,
    });
    (api as { then: unknown }).then = (ok: (v: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(ok);
    return api;
  };
  return { HAS_SERVICE_ROLE: true, supabaseServer: { from: (t: string) => cadena(t) } };
});

const SECRET_PREV = process.env.SESSION_SECRET;
beforeAll(() => { process.env.SESSION_SECRET = "test-secret-quitar"; });
afterAll(() => { process.env.SESSION_SECRET = SECRET_PREV; });
beforeEach(() => {
  escrituras.length = 0;
  marcacionEnLaBase = { id: "m4", empleado_codigo: "21", ocurrio_en: "2026-08-26T19:23:39.000Z" };
});

async function postear(body: Record<string, unknown>) {
  const { POST } = await import("@/app/api/asistencia/correcciones/route");
  const { NextRequest } = await import("next/server");
  const { signSession } = await import("@/lib/session-cookie");
  const cookie = signSession({
    role: "contabilidad", userId: "u", userName: "Yulissa", sessionToken: "t",
    modules: ["asistencia"],
  });
  const res = await POST(new NextRequest("http://x/api/asistencia/correcciones", {
    method: "POST",
    headers: { cookie: `cxc_session=${cookie}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

describe("🔴 E. quitar una marcación del reloj", () => {
  it("🔴 ESCRIBE UNA CORRECCIÓN ENCIMA Y NO TOCA `asistencia_marcaciones`", async () => {
    const r = await postear({ marcacionId: "m4", quita: true, motivo: "marcó dos veces seguidas" });
    expect(r.status).toBe(200);
    expect(escrituras).toHaveLength(1);
    expect(escrituras[0].tabla).toBe("asistencia_correcciones");
    expect(escrituras[0].op).toBe("insert");
    const p = escrituras[0].payload as Record<string, unknown>;
    expect(p.quita).toBe(true);
    expect(p.hora).toBeNull();
    expect(p.marcacion_id).toBe("m4");
    // La persona y el día salen de la MARCACIÓN, no del cuerpo.
    expect(p.empleado_codigo).toBe("21");
    expect(p.fecha).toBe("2026-08-26");
    expect(p.motivo).toBe("marcó dos veces seguidas");
    expect(p.creada_por).toBe("Yulissa");
    // 🔴 NI UN update / delete / upsert sobre la tabla del reloj, pase lo que pase.
    expect(escrituras.filter((e) => e.tabla === "asistencia_marcaciones")).toEqual([]);
  });

  it("🔴 el PORQUÉ sigue siendo obligatorio, y no se escribe nada sin él", async () => {
    const r = await postear({ marcacionId: "m4", quita: true, motivo: "   " });
    expect(r.status).toBe(400);
    expect(String(r.json.error)).toContain("Sin razón");
    expect(escrituras).toEqual([]);
  });

  it("🔴 no se quita una marcación que no existe: sin `marcacionId`, 400", async () => {
    const r = await postear({ quita: true, motivo: "sobra", codigo: "21", fecha: "2026-08-26" });
    expect(r.status).toBe(400);
    expect(String(r.json.error)).toContain("Elige cuál marcación");
    expect(escrituras).toEqual([]);
  });

  it("si la marcación ya no está, 404 y nada escrito", async () => {
    marcacionEnLaBase = null;
    const r = await postear({ marcacionId: "m4", quita: true, motivo: "sobra" });
    expect(r.status).toBe(404);
    expect(escrituras).toEqual([]);
  });

  it("⚠️ corregir la hora NO cambió: sigue exigiendo hora y NO manda `quita`", async () => {
    const r = await postear({ marcacionId: "m4", hora: "14:23:38", motivo: "cambió el turno" });
    expect(r.status).toBe(200);
    const p = escrituras[0].payload as Record<string, unknown>;
    expect(p.hora).toBe("14:23:38");
    expect(p).not.toHaveProperty("quita");
  });

  it("⚠️ y sin `quita` una hora que no sirve se sigue rechazando", async () => {
    const r = await postear({ marcacionId: "m4", hora: "99:99", motivo: "cualquiera" });
    expect(r.status).toBe(400);
    expect(String(r.json.error)).toContain("La hora no sirve");
    expect(escrituras).toEqual([]);
  });
});

describe("🔴 la ruta de correcciones no tiene forma de borrar una marcación", () => {
  it("el archivo no escribe sobre `asistencia_marcaciones` ni hace delete/update", () => {
    const ruta = fs.readFileSync(path.join(RAIZ, "app/api/asistencia/correcciones/route.ts"), "utf8");
    const sinComentarios = ruta.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(sinComentarios).not.toContain("asistencia_marcaciones");
    expect(sinComentarios).not.toMatch(/\.delete\(|\.update\(|\.upsert\(/);
  });

  it("y `crearCorreccion` sigue siendo un INSERT y nada más", () => {
    const srv = fs.readFileSync(path.join(RAIZ, "lib/asistencia/correcciones-server.ts"), "utf8");
    const crear = srv.slice(srv.indexOf("export async function crearCorreccion"));
    const cuerpo = crear.slice(0, crear.indexOf("\n}\n"));
    expect(cuerpo).not.toMatch(/asistencia_marcaciones/);
    expect(cuerpo).not.toMatch(/\.delete\(|\.update\(|\.upsert\(/);
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CANDADO — LA PRIMERA EN «ENTRADA» Y LA ÚLTIMA EN «SALIDA» (18-sep-2026).
 *
 * 🩸 Un día que no entraba en las cuatro columnas fundía las CUATRO celdas en
 * una sola: las horas quedaban corridas a la derecha y el conteo («3 marcas»)
 * caía debajo de «Entrada». Daniel, con la captura del 15-sep de Yulissa
 * —12:40:53 / 13:08:15 / 17:11:19—: *«hay 3 marcas y no se puso en orden…
 * aparte que no está en su columna, se ve desordenado»*.
 *
 * Ahora solo se funden las DOS del almuerzo, porque ésas sí son las que no se
 * pueden adivinar.
 * ────────────────────────────────────────────────────────────────────────── */
describe("Las marcas del medio", () => {
  it("con 3 marcas, la del medio es UNA sola", async () => {
    const { marcasDelMedio } = await import("@/lib/asistencia/marcas-del-dia");
    expect(marcasDelMedio(3)).toEqual([1]);
  });

  it("con 5 y 6 marcas, todas las del medio", async () => {
    const { marcasDelMedio } = await import("@/lib/asistencia/marcas-del-dia");
    expect(marcasDelMedio(5)).toEqual([1, 2, 3]);
    expect(marcasDelMedio(6)).toEqual([1, 2, 3, 4]);
  });

  it("🔴 la primera y la última NUNCA son del medio", async () => {
    const { marcasDelMedio } = await import("@/lib/asistencia/marcas-del-dia");
    for (const n of [3, 5, 6, 7, 8]) {
      expect(marcasDelMedio(n), `${n}`).not.toContain(0);
      expect(marcasDelMedio(n), `${n}`).not.toContain(n - 1);
    }
  });

  it("con 2 marcas o menos no hay medio", async () => {
    const { marcasDelMedio } = await import("@/lib/asistencia/marcas-del-dia");
    expect(marcasDelMedio(2)).toEqual([]);
    expect(marcasDelMedio(1)).toEqual([]);
    expect(marcasDelMedio(0)).toEqual([]);
    expect(marcasDelMedio(-3)).toEqual([]);
  });

  it("la pantalla ya NO funde las cuatro celdas en una", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "src/app/asistencia/ReporteTab.tsx"), "utf8");
    expect(src).not.toContain('<td colSpan={4}');
    // La primera y la última van a SU columna; solo el almuerzo se funde.
    expect(src).toContain("<Hora idx={0} />");
    expect(src).toContain("<Hora idx={d.marcas.length - 1} />");
    expect(src).toContain('<td colSpan={2}');
  });

  it("CONTROL: con 4 marcas se siguen dibujando las cuatro columnas", async () => {
    const { columnasClasicas, cabenEnLasCuatroColumnas } =
      await import("@/lib/asistencia/marcas-del-dia");
    expect(cabenEnLasCuatroColumnas(4)).toBe(true);
    expect(columnasClasicas(4)).toEqual([0, 1, 2, 3]);
  });
});
