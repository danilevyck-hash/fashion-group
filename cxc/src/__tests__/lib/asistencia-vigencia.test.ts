// ─────────────────────────────────────────────────────────────────────────────
// ALTAS Y BAJAS DE PERSONAL — el candado
//
// Lo que se prueba acá no es "una función devuelve lo que devuelve": es que dar
// de baja a alguien HOY no pueda mover un centavo de una planilla ya cerrada.
// Ese es el test que más importa de todo el archivo (el último describe), y es
// el que justifica que la baja sea una FECHA y no un borrado ni un booleano.
//
// Los otros tres, en orden de lo que puede salir mal:
//   · la baja a mitad de quincena sale en ESA quincena y no en la siguiente —
//     se le deben esos días;
//   · la reactivación devuelve a la persona a la planilla;
//   · quien marca DESPUÉS de su baja se avisa, nunca se esconde.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";

import {
  avisoMarcasPosteriores,
  codigosFueraDeRango,
  esColumnaDeBajaFaltante,
  esFechaValida,
  fechaLegible,
  fraseBaja,
  marcoDespuesDeLaBaja,
  MOTIVOS_SALIDA,
  tieneBaja,
  trabajaEnRango,
  ultimoDiaConMarcas,
  validarFechaOpcional,
  validarVigencia,
  VIGENCIA_ACTIVA,
  type Vigencia,
} from "@/lib/asistencia/vigencia";
import {
  armarPlanilla,
  quincenaDesdeClave,
  totalizar,
  type FichaPlanilla,
} from "@/lib/asistencia/planilla";
import { REGLAS_DEFAULT, esTablaFaltante } from "@/lib/asistencia/config";
import { armarReporte, type Marcacion } from "@/lib/asistencia/reporte";

// ── Ayudantes ────────────────────────────────────────────────────────────────

const baja = (fechaSalida: string, motivo: Vigencia["motivoSalida"] = "renuncia"): Vigencia => ({
  fechaIngreso: null,
  fechaSalida,
  motivoSalida: motivo,
});

const Q1_JUL = quincenaDesdeClave("2026-07-1")!; // 1 al 15 de julio
const Q2_JUL = quincenaDesdeClave("2026-07-2")!; // 16 al 31 de julio
const Q1_AGO = quincenaDesdeClave("2026-08-1")!; // 1 al 15 de agosto

// ─────────────────────────────────────────────────────────────────────────────
describe("la fecha, antes que nada", () => {
  it("acepta una fecha de calendario y rechaza una que no existe", () => {
    expect(esFechaValida("2026-08-12")).toBe(true);
    // 🩸 El formato NO alcanza: el 31 de febrero pasa cualquier expresión regular.
    expect(esFechaValida("2026-02-31")).toBe(false);
    expect(esFechaValida("2026-13-01")).toBe(false);
    expect(esFechaValida("12/08/2026")).toBe(false);
    expect(esFechaValida("")).toBe(false);
    expect(esFechaValida(null)).toBe(false);
    expect(esFechaValida(20260812)).toBe(false);
  });

  it("se lee como la lee una persona", () => {
    expect(fechaLegible("2026-08-12")).toBe("12 de agosto de 2026");
    expect(fechaLegible("2026-01-01")).toBe("1 de enero de 2026");
    expect(fechaLegible("basura")).toBe("");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("quién entra a una quincena", () => {
  it("sin fechas trabaja siempre — es el estado de las 32 fichas de hoy", () => {
    expect(trabajaEnRango(VIGENCIA_ACTIVA, Q1_JUL.desde, Q1_JUL.hasta)).toBe(true);
    expect(trabajaEnRango(VIGENCIA_ACTIVA, Q1_AGO.desde, Q1_AGO.hasta)).toBe(true);
  });

  it("🔑 se va a MITAD de quincena: sale en ESA y no en la siguiente", () => {
    const v = baja("2026-07-20"); // dentro del 16 al 31
    expect(trabajaEnRango(v, Q2_JUL.desde, Q2_JUL.hasta)).toBe(true); // se le deben esos días
    expect(trabajaEnRango(v, Q1_AGO.desde, Q1_AGO.hasta)).toBe(false);
  });

  it("el último día de la quincena todavía cuenta, y el primero de la siguiente no", () => {
    expect(trabajaEnRango(baja("2026-07-31"), Q2_JUL.desde, Q2_JUL.hasta)).toBe(true);
    expect(trabajaEnRango(baja("2026-07-31"), Q1_AGO.desde, Q1_AGO.hasta)).toBe(false);
    // Se fue el 15: la quincena del 16 al 31 ya no lo tiene.
    expect(trabajaEnRango(baja("2026-07-15"), Q2_JUL.desde, Q2_JUL.hasta)).toBe(false);
    expect(trabajaEnRango(baja("2026-07-15"), Q1_JUL.desde, Q1_JUL.hasta)).toBe(true);
  });

  it("quien entra a mitad de quincena aparece en ESA y no en la anterior", () => {
    const v: Vigencia = { fechaIngreso: "2026-07-20", fechaSalida: null, motivoSalida: null };
    expect(trabajaEnRango(v, Q2_JUL.desde, Q2_JUL.hasta)).toBe(true);
    expect(trabajaEnRango(v, Q1_JUL.desde, Q1_JUL.hasta)).toBe(false);
  });

  it("sin ficha SIEMPRE entra: son los códigos que marcan y nadie configuró (48 a 53)", () => {
    expect(trabajaEnRango(null, Q1_AGO.desde, Q1_AGO.hasta)).toBe(true);
    expect(trabajaEnRango(undefined, Q1_AGO.desde, Q1_AGO.hasta)).toBe(true);
  });

  it("una fecha basura no saca a nadie de la planilla", () => {
    // Preferir dejarla adentro es deliberado: una ficha con la fecha rota se ve
    // y se corrige; una persona que desapareció del cuadro no se nota.
    const rota = { fechaIngreso: "ayer", fechaSalida: "31/07/2026", motivoSalida: null } as unknown as Vigencia;
    expect(trabajaEnRango(rota, Q1_AGO.desde, Q1_AGO.hasta)).toBe(true);
  });

  it("`codigosFueraDeRango` saca exactamente a los que no van", () => {
    const vigencias = new Map<string, Vigencia>([
      ["6", VIGENCIA_ACTIVA],
      ["47", baja("2026-07-20")],
      ["50", { fechaIngreso: "2026-09-01", fechaSalida: null, motivoSalida: null }],
    ]);
    expect([...codigosFueraDeRango(vigencias, Q2_JUL.desde, Q2_JUL.hasta)]).toEqual(["50"]);
    expect([...codigosFueraDeRango(vigencias, Q1_AGO.desde, Q1_AGO.hasta)].sort()).toEqual(["47", "50"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("reactivar: si vuelve —o fue un error— se deshace sin perder nada", () => {
  it("borrar la fecha devuelve a la persona a TODAS las quincenas", () => {
    const v = baja("2026-07-20");
    expect(trabajaEnRango(v, Q1_AGO.desde, Q1_AGO.hasta)).toBe(false);

    const reactivada = validarVigencia({ fechaSalida: "", motivoSalida: "" });
    expect(reactivada.ok).toBe(true);
    if (!reactivada.ok) return;
    expect(reactivada.valor).toEqual({ fechaIngreso: null, fechaSalida: null, motivoSalida: null });
    expect(trabajaEnRango(reactivada.valor, Q1_AGO.desde, Q1_AGO.hasta)).toBe(true);
    expect(tieneBaja(reactivada.valor)).toBe(false);
  });

  it("reactivar NO puede dejar el motivo suelto: sin fecha no hay baja", () => {
    const r = validarVigencia({ fechaSalida: "", motivoSalida: "despido" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor.motivoSalida).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("el motivo: se guarda hoy para la liquidación de mañana", () => {
  it("es obligatorio al dar de baja — media baja no sirve", () => {
    const r = validarVigencia({ fechaSalida: "2026-08-12" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("por qué salió");
  });

  it("solo los tres del negocio", () => {
    for (const m of MOTIVOS_SALIDA) {
      const r = validarVigencia({ fechaSalida: "2026-08-12", motivoSalida: m });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.valor.motivoSalida).toBe(m);
    }
    expect(validarVigencia({ fechaSalida: "2026-08-12", motivoSalida: "se fue" }).ok).toBe(false);
  });

  it("⛔ el motivo NO cambia quién entra a la quincena: para el cálculo los tres son iguales", () => {
    const rangos = [Q2_JUL, Q1_AGO];
    for (const q of rangos) {
      const resultados = MOTIVOS_SALIDA.map((m) =>
        trabajaEnRango(baja("2026-07-20", m), q.desde, q.hasta),
      );
      expect(new Set(resultados).size).toBe(1);
    }
  });

  it("la salida no puede ser anterior a la entrada", () => {
    const r = validarVigencia({
      fechaIngreso: "2026-08-01",
      fechaSalida: "2026-07-01",
      motivoSalida: "renuncia",
    });
    expect(r.ok).toBe(false);
  });

  it("una fecha inventada se rechaza en vez de guardarse", () => {
    expect(validarVigencia({ fechaSalida: "2026-02-31", motivoSalida: "renuncia" }).ok).toBe(false);
    expect(validarFechaOpcional("", "La fecha de salida").ok).toBe(true);
    expect(validarFechaOpcional(null, "La fecha de salida").ok).toBe(true);
    expect(validarFechaOpcional("ayer", "La fecha de salida").ok).toBe(false);
  });

  it("se lee en español simple, y en futuro si la baja se cargó por adelantado", () => {
    expect(fraseBaja(baja("2026-08-12", "renuncia"), "2026-08-20")).toBe("Renunció el 12 de agosto de 2026");
    expect(fraseBaja(baja("2026-08-12", "despido"), "2026-08-20")).toBe("Despedido el 12 de agosto de 2026");
    expect(fraseBaja(baja("2026-08-12", "otro"), "2026-08-20")).toBe("Salió el 12 de agosto de 2026");
    expect(fraseBaja(baja("2026-08-30", "renuncia"), "2026-08-20")).toBe("Renuncia el 30 de agosto de 2026");
    expect(fraseBaja(VIGENCIA_ACTIVA, "2026-08-20")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🩸 marcó DESPUÉS de su baja: se avisa, no se esconde", () => {
  it("marcar después de la fecha de salida se detecta", () => {
    expect(marcoDespuesDeLaBaja(baja("2026-07-20"), "2026-07-25")).toBe(true);
    // El MISMO día de la salida es normal: ese día todavía trabajó.
    expect(marcoDespuesDeLaBaja(baja("2026-07-20"), "2026-07-20")).toBe(false);
    expect(marcoDespuesDeLaBaja(baja("2026-07-20"), "2026-07-19")).toBe(false);
    // Sin baja no hay nada que avisar.
    expect(marcoDespuesDeLaBaja(VIGENCIA_ACTIVA, "2026-07-25")).toBe(false);
    expect(marcoDespuesDeLaBaja(baja("2026-07-20"), null)).toBe(false);
  });

  it("el último día con marcas ignora los días vacíos del rango", () => {
    // 🩸 El motor devuelve TODOS los días —ausentes y domingos incluidos—, así
    // que mirar la última fecha diría "marcó el 31" de quien no aparece desde el 12.
    const dias = [
      { fecha: "2026-07-10", marcas: ["08:00", "17:00"] },
      { fecha: "2026-07-12", marcas: ["08:00"] },
      { fecha: "2026-07-31", marcas: [] },
    ];
    expect(ultimoDiaConMarcas(dias)).toBe("2026-07-12");
    expect(ultimoDiaConMarcas([])).toBeNull();
    expect(ultimoDiaConMarcas(null)).toBeNull();
  });

  it("el aviso dice las DOS explicaciones posibles, con nombre y fechas", () => {
    const a = avisoMarcasPosteriores([
      { etiqueta: "YERIBETH GONZALEZ", fechaSalida: "2026-07-20", ultimaMarca: "2026-07-25" },
    ])!;
    expect(a.titulo).toBe("1 persona dada de baja siguió marcando en el reloj.");
    expect(a.detalle[0]).toContain("YERIBETH GONZALEZ");
    expect(a.detalle[0]).toContain("20 de julio de 2026");
    expect(a.detalle[0]).toContain("25 de julio de 2026");
    expect(a.detalle[0]).toContain("huella");
  });

  it("sin casos NO hay cartel: un aviso permanente se deja de leer", () => {
    expect(avisoMarcasPosteriores([])).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EL TEST QUE MÁS IMPORTA
//
// Se arma la planilla ENTERA —con el motor de verdad, no con un doble— de una
// quincena vieja, se le da de baja a alguien HOY, y se vuelve a armar la misma
// quincena. Tiene que salir IDÉNTICA: mismas líneas, mismos centavos.
// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 una quincena vieja NO cambia al dar de baja a alguien hoy", () => {
  const reglas = REGLAS_DEFAULT;
  const jornadaDiariaMin = () => 8 * 60;

  /** Dos personas de Boston con marcaciones reales de la quincena del 16 al 31. */
  const marcaciones: Marcacion[] = [
    // Código 6 — entra 8:00, sale 17:00.
    ...["18", "20", "21"].flatMap((d) => [
      { empleado_codigo: "6", empleado_nombre: null, ocurrio_en: `2026-07-${d}T13:00:00.000Z` },
      { empleado_codigo: "6", empleado_nombre: null, ocurrio_en: `2026-07-${d}T22:00:00.000Z` },
    ]),
    // Código 47 — trabajó hasta el 20 y no volvió más.
    ...["17", "20"].flatMap((d) => [
      { empleado_codigo: "47", empleado_nombre: null, ocurrio_en: `2026-07-${d}T13:00:00.000Z` },
      { empleado_codigo: "47", empleado_nombre: null, ocurrio_en: `2026-07-${d}T22:00:00.000Z` },
    ]),
  ];

  const fichaDe = (codigo: string): FichaPlanilla => ({
    codigo,
    nombre: codigo === "6" ? "KEVIN LUBO" : "YERIBETH GONZALEZ",
    salarioMensual: 523.47,
    jornadaSemanal: 48,
    empresa: "confecciones_boston",
  });

  /** La MISMA capa que usa la ruta: filtra por vigencia y después arma. */
  function planillaDe(q: { desde: string; hasta: string }, vigencias: Map<string, Vigencia>) {
    const personas = armarReporte({
      marcaciones,
      horarios: [],
      justificaciones: [],
      feriados: new Map(),
      desde: q.desde,
      hasta: q.hasta,
      reglas,
      nombres: new Map(),
      incluirNoHabiles: true,
    });
    const fuera = codigosFueraDeRango(vigencias, q.desde, q.hasta);
    const fichas = new Map<string, FichaPlanilla>();
    for (const cod of ["6", "47"]) if (!fuera.has(cod)) fichas.set(cod, fichaDe(cod));
    const lineas = armarPlanilla({
      personas: personas.filter((p) => !fuera.has(p.codigo)),
      fichas,
      jornadaDiariaMin,
      reglas,
      empresa: "confecciones_boston",
    });
    return { lineas, totales: totalizar(lineas) };
  }

  const todosActivos = new Map<string, Vigencia>([
    ["6", VIGENCIA_ACTIVA],
    ["47", VIGENCIA_ACTIVA],
  ]);
  // La baja se carga HOY (agosto) con fecha del 20 de julio.
  const conBaja = new Map<string, Vigencia>([
    ["6", VIGENCIA_ACTIVA],
    ["47", baja("2026-07-20", "renuncia")],
  ]);

  it("la quincena del 16 al 31 de julio sale EXACTAMENTE igual, línea por línea", () => {
    const antes = planillaDe(Q2_JUL, todosActivos);
    const despues = planillaDe(Q2_JUL, conBaja);

    expect(antes.lineas.length).toBe(2);
    expect(despues.lineas).toEqual(antes.lineas);
    expect(despues.totales).toEqual(antes.totales);
    // Y el neto no es cero: si lo fuera, el test estaría comparando dos nadas.
    expect(antes.totales.netoPagar).toBeGreaterThan(0);
  });

  it("la quincena del 1 al 15 —anterior a todo— tampoco se mueve", () => {
    const antes = planillaDe(Q1_JUL, todosActivos);
    const despues = planillaDe(Q1_JUL, conBaja);
    expect(despues.lineas).toEqual(antes.lineas);
    expect(despues.totales).toEqual(antes.totales);
  });

  it("la quincena SIGUIENTE sí cambia: la persona ya no está, y el total baja lo suyo", () => {
    const antes = planillaDe(Q1_AGO, todosActivos);
    const despues = planillaDe(Q1_AGO, conBaja);

    expect(antes.lineas.map((l) => l.codigo).sort()).toEqual(["47", "6"]);
    expect(despues.lineas.map((l) => l.codigo)).toEqual(["6"]);
    // 🩸 En agosto nadie marcó: las dos líneas salen sin dinero («no marcó ni un
    // día»), así que lo que se mide es que la PERSONA desaparezca, no el monto.
    expect(despues.totales.personas).toBe(antes.totales.personas);
  });

  it("la persona dada de baja sigue COMPLETA en su quincena: nombre, salario y neto", () => {
    const l = planillaDe(Q2_JUL, conBaja).lineas.find((x) => x.codigo === "47")!;
    expect(l.nombre).toBe("YERIBETH GONZALEZ");
    expect(l.salarioMensual).toBe(523.47);
    expect(l.faltaConfigurar).toEqual([]);
    expect(l.dinero!.netoPagar).toBeGreaterThan(0);
  });

  it("⚠️ entrar a mitad de quincena NO reparte el salario: el quincenal sale entero", () => {
    // No hay regla de proporción definida —hay que preguntarla— así que el dato
    // se guarda y no se usa para prorratear. Este test es el que avisa si
    // alguien la inventa por su cuenta.
    const entraTarde = new Map<string, Vigencia>([
      ["6", { fechaIngreso: "2026-07-25", fechaSalida: null, motivoSalida: null }],
      ["47", VIGENCIA_ACTIVA],
    ]);
    const conAlta = planillaDe(Q2_JUL, entraTarde).lineas.find((l) => l.codigo === "6")!;
    const normal = planillaDe(Q2_JUL, todosActivos).lineas.find((l) => l.codigo === "6")!;
    expect(conAlta.dinero!.salarioQuincenal).toBe(normal.dinero!.salarioQuincenal);
    expect(conAlta.dinero!.salarioQuincenal).toBe(261.74); // 523,47 ÷ 2, a centavos
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("aguanta que la migración NO esté corrida", () => {
  it("sin columnas todo el mundo queda activo, que es como está hoy", () => {
    // Es lo que devuelve `vigenciaDeFila` cuando el `select` no las trajo.
    const sinColumnas: Vigencia = { fechaIngreso: null, fechaSalida: null, motivoSalida: null };
    expect(trabajaEnRango(sinColumnas, Q1_AGO.desde, Q1_AGO.hasta)).toBe(true);
    expect(tieneBaja(sinColumnas)).toBe(false);
    expect(fraseBaja(sinColumnas, "2026-08-06")).toBeNull();
  });

  it("reconoce el error de PostgREST/Postgres cuando faltan las columnas", () => {
    expect(esColumnaDeBajaFaltante({
      code: "42703",
      message: 'column asistencia_personas.fecha_salida does not exist',
    })).toBe(true);
    expect(esColumnaDeBajaFaltante({
      code: "PGRST204",
      message: "Could not find the 'motivo_salida' column of 'asistencia_personas' in the schema cache",
    })).toBe(true);
  });

  it("🔴 la trampa: el error de COLUMNA también parece un error de TABLA — por eso el orden", () => {
    // Medido en el navegador el 7-ago-2026 contra producción. Postgres dice
    // «column asistencia_personas.fecha_ingreso does not exist»: ese texto
    // NOMBRA la tabla y trae "does not exist", así que `esTablaFaltante` lo da
    // por bueno. Preguntando por la tabla PRIMERO, faltar tres columnas se leía
    // como «falta la tabla entera» y la pantalla escondía las 32 fichas reales:
    // las 37 personas salían «sin configurar», sin nombre y sin salario.
    //
    // Este test no arregla nada por sí solo: deja escrito POR QUÉ
    // `leerPersonas` y el PUT preguntan por la columna antes que por la tabla.
    const errorDeColumna = {
      code: "42703",
      message: "column asistencia_personas.fecha_ingreso does not exist",
    };
    expect(esColumnaDeBajaFaltante(errorDeColumna)).toBe(true);
    expect(esTablaFaltante(errorDeColumna, "asistencia_personas")).toBe(true); // ⚠️ la trampa

    const errorDeUpsert = {
      code: "PGRST204",
      message: "Could not find the 'fecha_salida' column of 'asistencia_personas' in the schema cache",
    };
    expect(esColumnaDeBajaFaltante(errorDeUpsert)).toBe(true);
    expect(esTablaFaltante(errorDeUpsert, "asistencia_personas")).toBe(true); // ⚠️ la misma trampa
  });

  it("⚠️ y NO se traga cualquier error: un problema real tiene que seguir fallando", () => {
    // Tragarse esto convertiría un permiso o una caída de red en una lectura
    // silenciosamente incompleta, que es peor que fallar.
    expect(esColumnaDeBajaFaltante({ code: "42501", message: "permission denied for table asistencia_personas" })).toBe(false);
    expect(esColumnaDeBajaFaltante({ message: "fetch failed" })).toBe(false);
    expect(esColumnaDeBajaFaltante(null)).toBe(false);
    // Nombra OTRA columna: no es este problema.
    expect(esColumnaDeBajaFaltante({ code: "42703", message: "column asistencia_personas.salario_mensual does not exist" })).toBe(false);
  });
});
