// ─────────────────────────────────────────────────────────────────────────────
// PUENTE: marcaciones desde el Excel que exporta iVMS-4200.
//
// 🩸 POR QUÉ EXISTE. La contraseña de red del reloj se perdió (3-ago-2026) y
// recuperarla depende de Hikvision o del instalador. Mientras tanto iVMS SÍ
// tiene las marcaciones y las exporta a Excel.
//
// ⚠️ NO ES TRABAJO TIRADO: escribe en la MISMA tabla que va a usar el agente
// automático, con la MISMA protección anti-duplicados.
//
// ── EL FORMATO REAL, medido contra 3 exportes de producción (4-ago-2026) ─────
//
// La primera versión de este archivo asumió una lista de marcaciones sueltas.
// **Estaba equivocada.** El export real ("Detalles de asistencia") es así:
//
//   fila 1  │ "Detalles de asistencia"          ← TÍTULO, no encabezados
//   fila 2  │ ID de persona │ Nombre │ Departamento │ Fecha │ … │ Entrada │ Salida
//   fila 3  │ 8 │ BRICEIDA MONTERO │ CONFECCIONES BOSTON │ 2026-07-13 │ … │ 07:59:33 │ 12:42:13
//   fila 4  │ "Hora de entrada: 2026-07-13 " │ …    ← FILA DE DETALLE, basura
//   fila 5  │ (siguiente registro)
//
// O sea tres cosas que rompían el lector viejo:
//   1. los encabezados están en la fila 2, no en la 1;
//   2. entre cada dato hay una fila de resumen que hay que saltear (185 de 408
//      filas en el archivo de Boston);
//   3. **no es una marcación por fila: es una JORNADA por fila**, con la fecha
//      en una columna y las horas de entrada y salida en otras dos.
//
// Se convierte cada jornada en DOS marcaciones (entrada y salida) porque la
// tabla guarda marcaciones y la pantalla las vuelve a agrupar. Así el día que
// el agente traiga marcaciones de verdad, todo encaja sin migrar nada.
//
// ⚠️ `entrada`/`salida` en "-" significa que ESE DÍA NO MARCÓ (día libre, sin
// turno). Son 20 filas de 221 en el archivo real. Guardarlas inventaría
// jornadas que no existieron.
//
// ── LA DECISIÓN QUE HACE QUE LAS DOS FUENTES CONVIVAN ────────────────────────
// El Excel no trae el `serialNo` que el agente usa como llave. Si acá se
// inventara un id cualquiera, la misma marcación entraría DOS VECES —una por
// Excel y otra por el agente— y las horas saldrían dobles en la transición. Por
// eso el id se DERIVA DEL CONTENIDO (`empleado + instante`), que es la
// identidad natural de una marcación. Bonus: si entrada y salida caen en el
// mismo segundo (pasa cuando solo hubo un marcaje), las dos colapsan en una
// sola fila sin necesidad de un caso especial.
//
// Módulo PURO: recibe la hoja como matriz de celdas, devuelve filas listas.
// ─────────────────────────────────────────────────────────────────────────────

import { createHash } from "crypto";

/** Una hoja: filas de celdas, tal como las entrega `sheet_to_json({header:1})`. */
export type Celda = string | number | Date | null | undefined;
export type Matriz = Celda[][];

export interface MarcacionImportada {
  dispositivo: string;
  evento_id: string;
  empleado_codigo: string | null;
  empleado_nombre: string | null;
  ocurrio_en: string;
  tipo: string | null;
  raw: Record<string, unknown>;
}

export interface ResultadoImport {
  filas: MarcacionImportada[];
  descartadas: Array<{ fila: number; motivo: string }>;
  encabezados: string[];
  /** Qué columnas se reconocieron, para mostrárselas al usuario. */
  columnas: {
    codigo: number | null;
    nombre: number | null;
    departamento: number | null;
    fecha: number | null;
    entrada: number | null;
    salida: number | null;
    estado: number | null;
    ausente: number | null;
  };
  /** Cuántas filas de detalle ("Hora de entrada: …") se saltearon. */
  filasDeDetalle: number;
}

const norm = (v: Celda): string =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();

const txt = (v: Celda): string | null => {
  if (v === null || v === undefined) return null;
  const s = v instanceof Date ? v.toISOString() : String(v).trim();
  return s === "" ? null : s;
};

const CANDIDATOS = {
  codigo: ["id de persona", "person id", "no. de persona", "person no", "employee no", "codigo", "id"],
  nombre: ["nombre", "name", "person name"],
  departamento: ["departamento", "department"],
  fecha: ["fecha", "date"],
  entrada: ["entrada", "check-in", "check in", "checkin", "hora de entrada"],
  salida: ["salida", "check-out", "check out", "checkout", "hora de salida"],
  estado: ["estado de asistencia", "attendance status", "estado", "status"],
  ausente: ["ausente", "absent"],
} as const;

function elegir(encabezados: readonly string[], opciones: readonly string[]): number | null {
  // Exacto primero: "entrada" está contenido en "entrada con retraso", y elegir
  // por "contiene" tomaría la columna equivocada.
  for (const o of opciones) {
    const i = encabezados.findIndex((h) => norm(h) === o);
    if (i >= 0) return i;
  }
  for (const o of opciones) {
    const i = encabezados.findIndex((h) => norm(h).startsWith(o));
    if (i >= 0) return i;
  }
  return null;
}

/**
 * Encuentra la fila de encabezados. NO se asume la fila 1: el export real tiene
 * el título "Detalles de asistencia" arriba y los encabezados en la 2.
 */
export function buscarEncabezados(matriz: Matriz): number {
  const limite = Math.min(matriz.length, 12);
  for (let i = 0; i < limite; i++) {
    const fila = matriz[i] ?? [];
    const celdas = fila.map(norm);
    const tieneFecha = celdas.some((c) => c === "fecha" || c === "date");
    const tieneQuien = celdas.some((c) => c.includes("persona") || c === "nombre" || c === "name");
    if (tieneFecha && tieneQuien) return i;
  }
  return 0;
}

/**
 * Fila de "detalle" que iVMS intercala debajo de cada jornada.
 *
 * 🩸 LA LLAMÉ BASURA Y ERA EL DATO MÁS IMPORTANTE (5-ago-2026). Se veía así:
 *
 *   [0] "Hora de entrada: 2026-07-13 08:16:24 Hora de entrada: 2026-07-13 13:39:45"
 *   [1] "Hora de salida:  2026-07-13 13:10:13 Hora de salida:  2026-07-13 16:50:21"
 *
 * O sea que trae **LAS CUATRO MARCACIONES DEL DÍA** —entrada, salida a
 * almuerzo, regreso, salida a casa— mientras las columnas `Entrada`/`Salida` de
 * la fila de arriba solo muestran la PRIMERA y la ÚLTIMA. Saltearla dejaba el
 * almuerzo invisible, y sin almuerzo no hay forma de medir el exceso ni las
 * horas realmente trabajadas.
 */
function esFilaDeDetalle(fila: readonly Celda[]): boolean {
  const p = norm(fila[0]);
  return p.startsWith("hora de entrada") || p.startsWith("check-in time") || p.startsWith("duracion");
}

/** Las horas `HH:MM:SS` que aparezcan en la fila de detalle, en orden. */
export function marcasDeDetalle(fila: readonly Celda[]): string[] {
  const texto = `${txt(fila[0]) ?? ""} ${txt(fila[1]) ?? ""}`;
  const horas = texto.match(/\d{2}:\d{2}:\d{2}/g) ?? [];
  // Orden cronológico y sin repetidas: iVMS lista primero todas las entradas y
  // después todas las salidas, así que tal cual vienen NO están en orden.
  return [...new Set(horas)].sort();
}

/** "-" y variantes = ese día no marcó. */
function sinMarcaje(v: Celda): boolean {
  const s = norm(v);
  return s === "" || s === "-" || s === "--" || s === "n/a";
}

/**
 * ⚠️ FECHA + HORA SON DE PANAMÁ (UTC−5 fijo), y vienen en columnas SEPARADAS.
 * Interpretarlas como UTC guardaría todo 5 horas antes y el reporte de horas
 * saldría mal.
 */
export function instantePanama(fecha: Celda, hora: Celda): string | null {
  let y: number, mes: number, dia: number;
  if (fecha instanceof Date && !Number.isNaN(fecha.getTime())) {
    y = fecha.getFullYear(); mes = fecha.getMonth() + 1; dia = fecha.getDate();
  } else {
    const s = txt(fecha);
    if (!s) return null;
    const iso = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (iso) { y = +iso[1]; mes = +iso[2]; dia = +iso[3]; }
    else if (dmy) { y = +dmy[3]; mes = +dmy[2]; dia = +dmy[1]; }
    else return null;
  }

  let h = 0, min = 0, seg = 0;
  if (hora instanceof Date && !Number.isNaN(hora.getTime())) {
    h = hora.getHours(); min = hora.getMinutes(); seg = hora.getSeconds();
  } else {
    const s = txt(hora);
    if (!s) return null;
    const m = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!m) return null;
    h = +m[1]; min = +m[2]; seg = +(m[3] ?? 0);
  }

  if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || h > 23 || min > 59 || seg > 59) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  const ms = Date.parse(`${y}-${p(mes)}-${p(dia)}T${p(h)}:${p(min)}:${p(seg)}-05:00`);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** El id derivado del contenido. Ver la nota del encabezado. */
export function idDeContenido(empleado: string, instante: string): string {
  return createHash("sha1").update(`${empleado}|${instante}`).digest("hex").slice(0, 32);
}

export function importarMatriz(dispositivo: string, matriz: Matriz): ResultadoImport {
  const iCab = buscarEncabezados(matriz);
  const encabezados = (matriz[iCab] ?? []).map((c) => String(c ?? ""));
  const columnas = {
    codigo: elegir(encabezados, CANDIDATOS.codigo),
    nombre: elegir(encabezados, CANDIDATOS.nombre),
    departamento: elegir(encabezados, CANDIDATOS.departamento),
    fecha: elegir(encabezados, CANDIDATOS.fecha),
    entrada: elegir(encabezados, CANDIDATOS.entrada),
    salida: elegir(encabezados, CANDIDATOS.salida),
    estado: elegir(encabezados, CANDIDATOS.estado),
    ausente: elegir(encabezados, CANDIDATOS.ausente),
  };

  const filas: MarcacionImportada[] = [];
  const descartadas: ResultadoImport["descartadas"] = [];
  const vistos = new Set<string>();
  let filasDeDetalle = 0;

  for (let i = iCab + 1; i < matriz.length; i++) {
    const fila = matriz[i] ?? [];
    const numero = i + 1; // Excel cuenta desde 1
    if (fila.every((c) => c === null || c === undefined || String(c).trim() === "")) continue;
    if (esFilaDeDetalle(fila)) { filasDeDetalle++; continue; }
    // La fila de detalle vive JUSTO DEBAJO y trae las 4 marcas del día.
    const detalle = matriz[i + 1] ?? [];
    const marcasReales = esFilaDeDetalle(detalle) ? marcasDeDetalle(detalle) : [];

    if (columnas.fecha === null) {
      descartadas.push({ fila: numero, motivo: "no se encontró la columna de fecha" });
      continue;
    }
    const codigo = columnas.codigo !== null ? txt(fila[columnas.codigo]) : null;
    const nombre = columnas.nombre !== null ? txt(fila[columnas.nombre]) : null;
    const quien = codigo ?? nombre;
    if (!quien) {
      descartadas.push({ fila: numero, motivo: "sin ID ni nombre de empleado" });
      continue;
    }
    const departamento = columnas.departamento !== null ? txt(fila[columnas.departamento]) : null;
    const estado = columnas.estado !== null ? txt(fila[columnas.estado]) : null;

    // Se prefieren SIEMPRE las marcas de la fila de detalle: son todas las del
    // día (normalmente 4). Las columnas Entrada/Salida solo tienen la primera y
    // la última, y con eso el almuerzo no se puede medir.
    const puntos: Array<{ hora: Celda; tipo: string }> =
      marcasReales.length > 0
        ? marcasReales.map((h, k) => ({
            // Se alternan entrada/salida por posición. Con 4 marcas queda
            // Entrada · Salida almuerzo · Entrada · Salida — que es el orden
            // que Daniel describió. No se usa `attendanceStatus`: viene vacío.
            hora: h,
            tipo: k % 2 === 0 ? "Entrada" : "Salida",
          }))
        : [
            ...(columnas.entrada !== null ? [{ hora: fila[columnas.entrada], tipo: "Entrada" }] : []),
            ...(columnas.salida !== null ? [{ hora: fila[columnas.salida], tipo: "Salida" }] : []),
          ];

    let algunaValida = false;
    for (const p of puntos) {
      if (sinMarcaje(p.hora)) continue;
      const instante = instantePanama(fila[columnas.fecha], p.hora);
      if (!instante) {
        descartadas.push({ fila: numero, motivo: `hora de ${p.tipo.toLowerCase()} no reconocida` });
        continue;
      }
      algunaValida = true;
      const eventoId = idDeContenido(quien, instante);
      if (vistos.has(eventoId)) continue; // entrada == salida, o fila repetida
      vistos.add(eventoId);
      filas.push({
        dispositivo,
        evento_id: eventoId,
        empleado_codigo: codigo,
        empleado_nombre: nombre,
        ocurrio_en: instante,
        tipo: p.tipo,
        raw: { departamento, estado, fecha: txt(fila[columnas.fecha]), hora: txt(p.hora), origen: "excel-ivms" },
      });
    }

    if (!algunaValida && puntos.length > 0 && puntos.every((p) => sinMarcaje(p.hora))) {
      // ⚠️ NO se echa el "Estado de asistencia" en el motivo: ese campo es la
      // REGLA DEL TURNO, no lo que pasó. Medido en los archivos reales, 18
      // ausencias venían rotuladas "Entrada con retraso/Temprano" —que se lee
      // como que sí llegó— mientras la columna Ausente decía 8h30 y Trabajado
      // 0. Repetir esa etiqueta hacía que un descarte correcto pareciera un
      // error del lector.
      const ausente = columnas.ausente !== null ? txt(fila[columnas.ausente]) : null;
      const faltoDeVerdad = !!ausente && !/^0\s*hora/i.test(ausente);
      const sinTurno = norm(estado).includes("sin turno");
      descartadas.push({
        fila: numero,
        motivo: sinTurno
          ? "sin turno programado (día libre)"
          : faltoDeVerdad
            ? `no vino ese día (ausente ${ausente})`
            : "no marcó ese día",
      });
    }
  }

  return { filas, descartadas, encabezados, columnas, filasDeDetalle };
}
