// ─────────────────────────────────────────────────────────────────────────────
// El REPORTE de asistencia: de marcaciones sueltas a minutos que se discuten.
//
// Módulo PURO. Todas las reglas del negocio viven acá, en un solo lugar, para
// que cambiar una política sea cambiar una constante y no perseguir cuentas por
// media app.
//
// ── LAS REGLAS, acordadas con Daniel el 5-ago-2026 ───────────────────────────
//
// 1. ENTRADA 8:00 CON 5 MINUTOS DE TOLERANCIA, y pasados los 5 se cuenta DESDE
//    LAS 8:00, no desde las 8:05.
//    🩸 El "desde las 8:00" no es un detalle: si al que llega 8:06 le contaras
//    1 minuto, le acabás de enseñar que la entrada es 8:05. Con 0 de tolerancia
//    discutís por segundos de cola en el lector; con 10, la gente aprende y
//    llega 8:09 — con 30 personas son 5 horas perdidas por día.
//
// 2. ALMUERZO 30 MINUTOS por defecto, configurable por persona.
//    Medido contra los 3 archivos reales: la mayoría toma entre 23 y 30.
//
// 3. HORAS EXTRA: mínimo 15 minutos, y MENOS EL ATRASO DEL MISMO DÍA.
//    🩸 Lo segundo es lo que evita pagar dos veces: el que llegó 20 minutos
//    tarde y se va 20 tarde NO hizo horas extra, RECUPERÓ. El mínimo de 15
//    evita pagarle a quien se quedó terminando algo.
//    ⚠️ Acá solo se MIDEN. Que sean pagables lo decide una persona aprobándolas
//    — si no, cualquiera se gana un extra quedándose a conversar.
//
// 4. AUSENCIA: día hábil, sin ninguna marca, que no sea feriado ni tenga
//    justificación.
//
// 5. DÍA MAL MARCADO: **SÍ SUMA**, y además se marca para revisar.
//    🩸 Esto CONTRADICE lo que yo recomendé, y es decisión de Daniel:
//    *"quiero que sume lo que marca la persona pero si se detecta anomalía que
//    también marque para revisar, quiero que las personas sepan marcar bien, es
//    responsabilidad de ellos"*. El caso que lo motivó: Ángela García el 21-jul
//    marcó 12:41 · 13:07 · 17:04 (no marcó al entrar) → cuentan 281 minutos de
//    atraso. Es un número duro a propósito: si no doliera, nadie corregiría.
//    Por eso el resumen ADEMÁS separa cuántos de esos minutos vienen de días
//    marcados mal — para que nadie descuente sobre un dato sin haberlo mirado.
// ─────────────────────────────────────────────────────────────────────────────

/** Panamá es UTC−5 fijo, sin horario de verano. */
const PANAMA_OFFSET_MS = 5 * 60 * 60 * 1000;

export const TOLERANCIA_MIN = 5;
export const ALMUERZO_DEFAULT_MIN = 30;
export const EXTRA_MINIMO_MIN = 15;
export const ENTRADA_DEFAULT = "08:00";
export const SALIDA_DEFAULT = "17:00";

export interface Marcacion {
  empleado_codigo: string | null;
  empleado_nombre: string | null;
  ocurrio_en: string;
}

export interface HorarioPersona {
  empleado_codigo: string;
  entrada: string;   // "08:00"
  salida: string;    // "16:30" | "17:00"
  almuerzo_minutos: number;
}

export interface Justificacion {
  empleado_codigo: string;
  desde: string; // YYYY-MM-DD
  hasta: string;
  motivo: string;
}

export interface DiaReporte {
  fecha: string;
  /** Horas HH:MM en orden. Normalmente 4. */
  marcas: string[];
  entrada: string | null;
  salida: string | null;
  tardeMin: number;
  excesoAlmuerzoMin: number;
  salidaTempranaMin: number;
  extraMin: number;
  trabajadoMin: number;
  /** El día no tiene 4 marcas: los números salen igual, pero hay que revisarlo. */
  revisar: boolean;
  ausente: boolean;
  justificado: string | null;
  feriado: string | null;
}

export interface PersonaReporte {
  codigo: string;
  nombre: string | null;
  salida: string;
  almuerzoMin: number;
  dias: DiaReporte[];
  resumen: {
    diasTrabajados: number;
    ausenciasSinJustificar: number;
    ausenciasJustificadas: number;
    vecesTarde: number;
    minutosTarde: number;
    /** De `minutosTarde`, cuántos salen de días mal marcados. Ver regla 5. */
    minutosTardeDeDiasARevisar: number;
    excesoAlmuerzoMin: number;
    salidaTempranaMin: number;
    extraMin: number;
    diasARevisar: number;
    tiempoNoTrabajadoMin: number;
  };
}

const p2 = (n: number) => String(n).padStart(2, "0");

/** El día-calendario de Panamá de un instante ISO. */
export function diaPanama(iso: string): string {
  return new Date(Date.parse(iso) - PANAMA_OFFSET_MS).toISOString().slice(0, 10);
}

/** Minutos desde medianoche, en hora de Panamá. */
export function minutosDelDia(iso: string): number {
  const d = new Date(Date.parse(iso) - PANAMA_OFFSET_MS);
  // Los segundos se redondean al minuto más cercano: 08:05:31 es más 8:06 que
  // 8:05, y discutir por segundos es exactamente lo que la tolerancia evita.
  return d.getUTCHours() * 60 + d.getUTCMinutes() + (d.getUTCSeconds() >= 30 ? 1 : 0);
}

export function horaPanama(iso: string): string {
  const d = new Date(Date.parse(iso) - PANAMA_OFFSET_MS);
  return `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
}

function hhmmAMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Días hábiles del rango (lunes a viernes). Nadie trabaja sábado: medido. */
function diasHabiles(desde: string, hasta: string): string[] {
  const out: string[] = [];
  const d = new Date(`${desde}T12:00:00Z`);
  const fin = new Date(`${hasta}T12:00:00Z`);
  while (d <= fin) {
    const dow = d.getUTCDay();
    if (dow >= 1 && dow <= 5) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function justificacionDe(
  justis: readonly Justificacion[],
  codigo: string,
  fecha: string,
): string | null {
  const j = justis.find(
    (x) => x.empleado_codigo === codigo && x.desde <= fecha && fecha <= x.hasta,
  );
  return j ? j.motivo : null;
}

export function armarReporte(opts: {
  marcaciones: readonly Marcacion[];
  horarios: readonly HorarioPersona[];
  justificaciones: readonly Justificacion[];
  feriados: ReadonlyMap<string, string>;
  desde: string;
  hasta: string;
}): PersonaReporte[] {
  const { marcaciones, horarios, justificaciones, feriados, desde, hasta } = opts;

  const horarioDe = new Map(horarios.map((h) => [h.empleado_codigo, h]));
  const habiles = diasHabiles(desde, hasta);

  // Agrupar marcaciones por persona y día.
  const porPersona = new Map<string, { nombre: string | null; dias: Map<string, number[]> }>();
  for (const m of marcaciones) {
    const cod = (m.empleado_codigo ?? m.empleado_nombre ?? "").trim();
    if (!cod || !m.ocurrio_en) continue;
    const dia = diaPanama(m.ocurrio_en);
    if (dia < desde || dia > hasta) continue;
    let p = porPersona.get(cod);
    if (!p) { p = { nombre: m.empleado_nombre, dias: new Map() }; porPersona.set(cod, p); }
    if (!p.nombre && m.empleado_nombre) p.nombre = m.empleado_nombre;
    const lista = p.dias.get(dia);
    if (lista) lista.push(minutosDelDia(m.ocurrio_en));
    else p.dias.set(dia, [minutosDelDia(m.ocurrio_en)]);
  }

  const out: PersonaReporte[] = [];
  for (const [codigo, p] of porPersona) {
    const h = horarioDe.get(codigo);
    const entradaProg = hhmmAMin(h?.entrada ?? ENTRADA_DEFAULT);
    const salidaProg = hhmmAMin(h?.salida ?? SALIDA_DEFAULT);
    const almuerzoProg = h?.almuerzo_minutos ?? ALMUERZO_DEFAULT_MIN;

    const dias: DiaReporte[] = [];
    for (const fecha of habiles) {
      const feriado = feriados.get(fecha) ?? null;
      const justificado = justificacionDe(justificaciones, codigo, fecha);
      const crudas = (p.dias.get(fecha) ?? []).slice().sort((a, b) => a - b);
      // Sin marcas: ausente, salvo que sea feriado o esté justificado.
      if (crudas.length === 0) {
        dias.push({
          fecha, marcas: [], entrada: null, salida: null,
          tardeMin: 0, excesoAlmuerzoMin: 0, salidaTempranaMin: 0, extraMin: 0, trabajadoMin: 0,
          revisar: false, ausente: !feriado && !justificado, justificado, feriado,
        });
        continue;
      }

      const fmt = (min: number) => `${p2(Math.floor(min / 60))}:${p2(min % 60)}`;
      const ent = crudas[0];
      const sal = crudas[crudas.length - 1];

      // Regla 1. Tolerancia para CLASIFICAR; una vez pasada, se cuenta desde
      // la hora de entrada, no desde el fin de la tolerancia.
      const tardeMin = ent > entradaProg + TOLERANCIA_MIN ? ent - entradaProg : 0;

      // Regla 2. Solo se puede medir con 4 marcas (o más): las del medio son
      // el almuerzo. Con 2 marcas no hay almuerzo que medir.
      let excesoAlmuerzoMin = 0;
      let almuerzoTomado = 0;
      if (crudas.length >= 4) {
        almuerzoTomado = crudas[2] - crudas[1];
        excesoAlmuerzoMin = Math.max(0, almuerzoTomado - almuerzoProg);
      }

      const salidaTempranaMin = Math.max(0, salidaProg - sal);
      // Regla 3. Mínimo 15 min y neto del atraso del mismo día.
      const bruto = Math.max(0, sal - salidaProg);
      const extraMin = bruto < EXTRA_MINIMO_MIN ? 0 : Math.max(0, bruto - tardeMin);

      const trabajadoMin = Math.max(0, sal - ent - almuerzoTomado);
      // Regla 5. 4 marcas es lo normal; cualquier otra cosa se revisa —pero
      // los números se calculan igual.
      const revisar = crudas.length !== 4;

      dias.push({
        fecha,
        marcas: crudas.map(fmt),
        entrada: fmt(ent),
        salida: fmt(sal),
        tardeMin, excesoAlmuerzoMin, salidaTempranaMin, extraMin, trabajadoMin,
        revisar, ausente: false, justificado, feriado,
      });
    }

    const conMarcas = dias.filter((d) => d.marcas.length > 0);
    const resumen = {
      diasTrabajados: conMarcas.length,
      ausenciasSinJustificar: dias.filter((d) => d.ausente).length,
      ausenciasJustificadas: dias.filter((d) => !d.marcas.length && d.justificado).length,
      vecesTarde: conMarcas.filter((d) => d.tardeMin > 0).length,
      minutosTarde: conMarcas.reduce((a, d) => a + d.tardeMin, 0),
      minutosTardeDeDiasARevisar: conMarcas.filter((d) => d.revisar).reduce((a, d) => a + d.tardeMin, 0),
      excesoAlmuerzoMin: conMarcas.reduce((a, d) => a + d.excesoAlmuerzoMin, 0),
      salidaTempranaMin: conMarcas.reduce((a, d) => a + d.salidaTempranaMin, 0),
      extraMin: conMarcas.reduce((a, d) => a + d.extraMin, 0),
      diasARevisar: conMarcas.filter((d) => d.revisar).length,
      tiempoNoTrabajadoMin: 0,
    };
    // El número de planilla: todo lo que no se trabajó, junto.
    resumen.tiempoNoTrabajadoMin =
      resumen.minutosTarde + resumen.excesoAlmuerzoMin + resumen.salidaTempranaMin;

    out.push({
      codigo,
      nombre: p.nombre,
      salida: h?.salida ?? SALIDA_DEFAULT,
      almuerzoMin: almuerzoProg,
      dias,
      resumen,
    });
  }

  // Lo que más duele, arriba.
  return out.sort((a, b) => b.resumen.tiempoNoTrabajadoMin - a.resumen.tiempoNoTrabajadoMin);
}

/**
 * Hora de salida sugerida a partir de las marcaciones reales.
 *
 * 🩸 Se usa para SEMBRAR la pantalla de Horarios, porque el `Turno` de iVMS
 * está mal en 12 de 31 personas (medido). Se toma la MEDIANA de la última marca
 * de cada día: el promedio lo arruina un día que alguien se quedó hasta las 9.
 */
export function salidaSugerida(ultimasMarcas: readonly number[]): string {
  if (ultimasMarcas.length === 0) return SALIDA_DEFAULT;
  const ord = [...ultimasMarcas].sort((a, b) => a - b);
  const mediana = ord[Math.floor(ord.length / 2)];
  // Solo dos turnos reales en el negocio; se elige el más cercano.
  return Math.abs(mediana - 16 * 60 - 30) <= Math.abs(mediana - 17 * 60) ? "16:30" : "17:00";
}
