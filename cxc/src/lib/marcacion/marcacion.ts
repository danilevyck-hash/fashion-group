// ─────────────────────────────────────────────────────────────────────────────
// MARCACIÓN — el reloj del teléfono. Las reglas, en UN lugar (14-sep-2026).
//
// Módulo PURO: sin base, sin red, sin `new Date()`. Todo «ahora» entra por
// parámetro. Lo leen la pantalla del teléfono, las dos rutas, el reporte de la
// contadora y los candados — para que ninguno pueda decir otra cosa.
//
// Las reglas, todas decididas por Daniel el 14-sep-2026:
//   1. UN SOLO BOTÓN. Nunca se elige entrada o salida: el botón cambia de
//      texto y a la segunda marca se apaga. Dos marcas al día.
//   2. 🔴 LA HORA ES LA DEL SERVIDOR (Panamá), no la del teléfono — *«que no
//      puedan cambiar la hora de su teléfono»*. Salvo sin señal: ahí la que
//      cuenta es la de la foto, y se guardan LAS DOS.
//   3. Selfie obligatoria.  4. Ubicación obligatoria.
//   5. Sin señal marca igual: el teléfono la guarda y la manda sola.
//   7. La marca cae en `asistencia_marcaciones` con su origen (`dispositivo`).
//   8. Reloj físico y teléfono el mismo día: la primera es la entrada y la
//      última la salida, venga de donde venga. *«el sistema junta todo»*.
//   9. Las notitas: al entrar «Acuérdate de marcar la salida», al salir
//      «Mañana acuérdate de marcar la entrada».
//
// 🔴 LA PALABRA «llegó» ESTÁ PROHIBIDA en lo que lee la contadora. El mockup
// decía «Llegó a las 11:30» y Daniel avisó que se iba a entender que llegó a
// trabajar a esa hora. Se dice «el teléfono la envió 11:30». Hay candado.
// ─────────────────────────────────────────────────────────────────────────────

/** La key del módulo en `modules.ts`, `role_permissions` y el override. */
export const MODULO_MARCACION = "marcacion";

/**
 * 🔑 EL ORIGEN DE LA MARCA. Es el `dispositivo` con el que cae en
 * `asistencia_marcaciones`, al lado de `reloj cboston` y `reloj acs`. Con el
 * `evento_id` (un uuid que acuña el teléfono) forma la llave anti-duplicado:
 * un reenvío sin señal choca contra el índice y se ignora, igual que el repaso
 * nocturno del reloj. Es una constante y no un literal suelto a propósito —
 * el teléfono no puede decir cómo se llama, lo dice el sistema en UN lugar.
 */
export const DISPOSITIVO_TELEFONO = "telefono";

/** Dos marcas al día: entrada y salida. Daniel: *«dos, no cuatro»*. */
export const MARCAS_POR_DIA = 2;

/** Daniel: las selfies *«se borran solas a los 90 días»*. */
export const RETENCION_SELFIE_DIAS = 90;

/** Una selfie de teléfono ya achicada pesa <500 KB; 8 MB deja aire para una
 *  que llegue sin achicar y sigue por debajo del techo de una función. */
export const MAX_BYTES_SELFIE = 8 * 1024 * 1024;

/**
 * Cuánto puede ir ADELANTADA la hora del teléfono respecto de la del servidor
 * en una marca sin señal. Diez minutos es el desfase normal de un reloj que
 * nadie ajustó; más que eso es un reloj movido, y esa marca no entra.
 */
export const TOLERANCIA_ADELANTO_MS = 10 * 60_000;

/** Una marca sin señal más vieja que esto no entra: el teléfono manda la cola
 *  apenas vuelve internet, y una semana sin internet no es un caso real. */
export const MAX_ATRASO_SIN_SENAL_DIAS = 7;

/** Quién corrige una marca que salió mal. Es el nombre del mockup que Daniel
 *  aprobó; si cambia, cambia acá y en ningún otro lado. */
export const QUIEN_CORRIGE = "Roxana";

export type TipoMarca = "entrada" | "salida";

const PANAMA_OFFSET_MS = 5 * 3600_000;

/** Día-calendario de Panamá (YYYY-MM-DD) de un instante. La misma regla que
 *  `diaPanama` del motor del reporte (hay candado que las compara): UTC−5
 *  fijo, sin horario de verano. Se repite acá y no se importa para que la
 *  pantalla del teléfono no arrastre el motor entero. */
export function diaPanamaDe(iso: string): string {
  return new Date(Date.parse(iso) - PANAMA_OFFSET_MS).toISOString().slice(0, 10);
}

/** «HH:MM» de Panamá. */
export function horaCorta(iso: string): string {
  const d = new Date(Date.parse(iso) - PANAMA_OFFSET_MS);
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
}

/** «9:12 a. m.» / «6:04 p. m.», hora de Panamá — como lo lee la gente. */
export function horaAmPm(iso: string): string {
  const d = new Date(Date.parse(iso) - PANAMA_OFFSET_MS);
  const h24 = d.getUTCHours();
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${h12}:${mm} ${h24 < 12 ? "a. m." : "p. m."}`;
}

const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const DIAS_CORTOS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** «Lunes 15 de septiembre» — el día bajo el reloj grande. */
export function fechaLarga(fecha: string): string {
  const [a, m, d] = fecha.split("-").map(Number);
  const dow = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  const nombre = DIAS_SEMANA[dow];
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${d} de ${MESES[m - 1]}`;
}

/** «Lun 15» — un renglón de «Mis marcas». */
export function diaCorto(fecha: string): string {
  const [a, m, d] = fecha.split("-").map(Number);
  return `${DIAS_CORTOS[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]} ${d}`;
}

/** «1 – 15 sep» — la quincena que se está mirando. */
export function rotuloQuincena(q: { desde: string; hasta: string }): string {
  return `${Number(q.desde.slice(8, 10))} – ${Number(q.hasta.slice(8, 10))} ${MESES_CORTOS[Number(q.desde.slice(5, 7)) - 1]}`;
}

// ── 1. EL BOTÓN ──────────────────────────────────────────────────────────────

export interface EstadoBoton {
  /** Lo que la próxima marca ES. `null` = ya no hay nada que marcar. */
  tipo: TipoMarca | null;
  texto: string;
  apagado: boolean;
}

/**
 * Cuántas marcas lleva HOY (reloj físico + teléfono + las que esperan señal)
 * → qué dice el botón. 0 → entrada · 1 → salida · 2 o más → apagado.
 */
export function estadoDelBoton(marcasHoy: number): EstadoBoton {
  if (marcasHoy <= 0) return { tipo: "entrada", texto: "Marcar entrada", apagado: false };
  if (marcasHoy < MARCAS_POR_DIA) return { tipo: "salida", texto: "Marcar salida", apagado: false };
  return { tipo: null, texto: "Ya marcaste hoy", apagado: true };
}

/** La notita de después. Regla 9. `null` cuando todavía no marcó. */
export function notaDespuesDe(marcasHoy: number): string | null {
  if (marcasHoy <= 0) return null;
  if (marcasHoy < MARCAS_POR_DIA) return "Acuérdate de marcar la salida.";
  return "Mañana acuérdate de marcar la entrada.";
}

// ── 2. LA HORA QUE CUENTA ────────────────────────────────────────────────────

export type HoraQueCuenta =
  | { ok: true; ocurrioEn: string }
  | { ok: false; motivo: string };

/**
 * 🔴 CON SEÑAL, LA HORA ES LA DEL SERVIDOR y la del teléfono no se mira.
 * SIN SEÑAL, es la de la foto — la del teléfono, no hay otra — con dos
 * frenos: no puede estar en el futuro (más allá del desfase normal de un
 * reloj) ni ser más vieja que una semana. Las dos horas se guardan igual.
 */
export function horaQueCuenta(x: {
  sinSenal: boolean;
  horaTelefono: string | null;
  ahoraServidor: string;
}): HoraQueCuenta {
  const ahora = Date.parse(x.ahoraServidor);
  if (!Number.isFinite(ahora)) return { ok: false, motivo: "El servidor no supo qué hora es. Intenta de nuevo." };
  if (!x.sinSenal) return { ok: true, ocurrioEn: new Date(ahora).toISOString() };

  const tel = x.horaTelefono ? Date.parse(x.horaTelefono) : NaN;
  if (!Number.isFinite(tel)) {
    return { ok: false, motivo: "La marca sin señal llegó sin la hora de la foto. Vuelve a marcar." };
  }
  if (tel > ahora + TOLERANCIA_ADELANTO_MS) {
    return { ok: false, motivo: "La hora del teléfono está adelantada respecto de la del sistema. Revisa la hora del teléfono y vuelve a marcar." };
  }
  if (tel < ahora - MAX_ATRASO_SIN_SENAL_DIAS * 86_400_000) {
    return { ok: false, motivo: `Esa marca tiene más de ${MAX_ATRASO_SIN_SENAL_DIAS} días. Avísale a ${QUIEN_CORRIGE} para que la anote.` };
  }
  return { ok: true, ocurrioEn: new Date(tel).toISOString() };
}

// ── 3 y 4. QUÉ ENTRA ─────────────────────────────────────────────────────────

export interface PayloadMarca {
  eventoId: string;
  tipo: string;
  lat: number | null;
  lng: number | null;
  precisionM: number | null;
  selfie: { tipo: string; bytes: number } | null;
}

/** `null` = entra. Si no, EL MENSAJE QUE VE LA PERSONA. */
export function validarPayloadMarca(p: PayloadMarca): string | null {
  if (!/^[A-Za-z0-9-]{8,64}$/.test(String(p.eventoId ?? ""))) {
    return "La marca llegó sin identificador. Vuelve a marcar.";
  }
  if (p.tipo !== "entrada" && p.tipo !== "salida") {
    return "No se entendió si es entrada o salida. Vuelve a marcar.";
  }
  if (!p.selfie || !(p.selfie.bytes > 0)) {
    return "Falta la selfie. Toma la foto para poder marcar.";
  }
  if (!/^image\//i.test(String(p.selfie.tipo ?? ""))) {
    return "Lo que llegó no es una foto. Toma la selfie con la cámara.";
  }
  if (p.selfie.bytes > MAX_BYTES_SELFIE) {
    return "La foto pesa demasiado. Toma la selfie de nuevo.";
  }
  const lat = Number(p.lat), lng = Number(p.lng);
  if (p.lat === null || p.lng === null || !Number.isFinite(lat) || !Number.isFinite(lng) ||
      lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return "Falta la ubicación. Acepta el permiso de ubicación para poder marcar.";
  }
  if (p.precisionM !== null && (!Number.isFinite(Number(p.precisionM)) || Number(p.precisionM) < 0)) {
    return "La ubicación llegó incompleta. Vuelve a marcar.";
  }
  return null;
}

/** Dónde se guarda la selfie: `<codigo>/<día>/<evento_id>.jpg`. El código es
 *  la carpeta porque la identidad es el código, nunca el nombre. */
export function rutaDeSelfie(codigo: string, fecha: string, eventoId: string): string {
  const cod = String(codigo ?? "").trim().replace(/[^A-Za-z0-9_-]/g, "") || "sin-codigo";
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : "sin-fecha";
  const id = String(eventoId ?? "").replace(/[^A-Za-z0-9-]/g, "") || "sin-id";
  return `${cod}/${dia}/${id}.jpg`;
}

/** ¿Ya pasaron los 90 días? Se mide desde el DÍA de la marca (la carpeta). */
export function selfieVencida(fechaDeLaMarca: string, hoy: string): boolean {
  const a = Date.parse(`${fechaDeLaMarca}T00:00:00Z`);
  const b = Date.parse(`${hoy}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return (b - a) / 86_400_000 >= RETENCION_SELFIE_DIAS;
}

// ── 8. LAS MARCAS DEL DÍA Y DE LA QUINCENA ───────────────────────────────────

export interface MarcaSimple {
  ocurrioEn: string;
}

/** Cuántas marcas hay en un día de Panamá, venga de donde venga cada una. */
export function marcasDelDia(marcas: readonly MarcaSimple[], fecha: string): number {
  return marcas.filter((m) => diaPanamaDe(m.ocurrioEn) === fecha).length;
}

/** La quincena en curso de `hoy`: 1–15 o 16–último día REAL del mes. */
export function quincenaDeHoy(hoy: string): { desde: string; hasta: string } {
  const [a, m, d] = hoy.split("-").map(Number);
  const mm = String(m).padStart(2, "0");
  if (d <= 15) return { desde: `${a}-${mm}-01`, hasta: `${a}-${mm}-15` };
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return { desde: `${a}-${mm}-16`, hasta: `${a}-${mm}-${String(ultimo).padStart(2, "0")}` };
}

export interface DiaMarcado {
  fecha: string;
  /** «8:58» */
  entrada: string;
  /** «18:04», o `null` si todavía no salió. */
  salida: string | null;
  /** Un día que YA PASÓ con una sola marca: le falta la salida. Hoy no se
   *  juzga — el día va corriendo. */
  faltaSalida: boolean;
}

/**
 * «Mis marcas»: un renglón por día CON marcas, el más reciente arriba. La
 * primera del día es la entrada y la última la salida — regla 8, la misma del
 * motor. Ella ve sus horas y nada más: ni sueldo, ni minutos, ni nadie más.
 */
export function diasDeLaQuincena(marcas: readonly MarcaSimple[], hoy: string): DiaMarcado[] {
  const porDia = new Map<string, number[]>();
  for (const m of marcas) {
    const t = Date.parse(m.ocurrioEn);
    if (!Number.isFinite(t)) continue;
    const dia = diaPanamaDe(m.ocurrioEn);
    porDia.set(dia, [...(porDia.get(dia) ?? []), t]);
  }
  return [...porDia.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([fecha, ts]) => {
      const orden = ts.slice().sort((x, y) => x - y);
      const soloUna = orden.length === 1;
      return {
        fecha,
        entrada: horaCorta(new Date(orden[0]).toISOString()),
        salida: soloUna ? null : horaCorta(new Date(orden[orden.length - 1]).toISOString()),
        faltaSalida: soloUna && fecha < hoy,
      };
    });
}

// ── LO QUE VE LA CONTADORA ───────────────────────────────────────────────────

export interface MarcaDelTelefono {
  sinSenal: boolean;
  /** Cuándo llegó al servidor (`created_at`). */
  creadoEn: string;
}

/**
 * 🔴 «Entrada 9:12 a. m.» va grande; esto va chico, en gris, debajo. Dice que
 * fue sin señal y cuándo la ENVIÓ el teléfono. Nunca «llegó»: la contadora
 * entendería que llegó a trabajar a esa hora (Daniel, 14-sep-2026).
 */
export function textoParaLaContadora(m: MarcaDelTelefono): string {
  if (m.sinSenal) return `Marcada sin señal · el teléfono la envió ${horaCorta(m.creadoEn)}`;
  return "Marcada desde el teléfono";
}

/** Qué es la marca `idx` de un día con `total` marcas: la primera es la
 *  entrada, la última la salida, y una del medio es una marca más. */
export function rotuloDeLaMarca(idx: number, total: number): "Entrada" | "Salida" | "Marca" {
  if (idx === 0) return "Entrada";
  if (total > 1 && idx === total - 1) return "Salida";
  return "Marca";
}

/** El enlace al mapa. Sin llave de API ni imagen externa: abre Google Maps. */
export function enlaceAlMapa(lat: number, lng: number): string {
  return `https://maps.google.com/?q=${lat},${lng}`;
}

/** El mapa embebido (sin llave de API). Se dibuja solo cuando alguien lo pide. */
export function mapaEmbebido(lat: number, lng: number): string {
  return `https://maps.google.com/maps?q=${lat},${lng}&z=16&output=embed`;
}

// ── CUANDO LA DDL TODAVÍA NO CORRIÓ ──────────────────────────────────────────

/** Las columnas que agrega `20261127120000`. Si falta una, falta la migración. */
export const COLUMNAS_DE_LA_MARCA = [
  "sin_senal", "hora_telefono", "foto_path", "lat", "lng", "precision_m", "marcada_por",
] as const;

/**
 * 🔴 ACÁ NO SE DEGRADA, SE DICE. En el resto del sistema una migración
 * pendiente se tolera porque la pantalla ya existía sin ella; ésta NACE con la
 * migración, y guardar la marca sin la foto ni la ubicación sería guardar algo
 * que no es lo que Daniel aprobó. Se rechaza con el nombre del archivo que hay
 * que correr, para que el mensaje sirva para algo.
 */
export function faltaLaMigracion(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = String(error.message ?? "").toLowerCase();
  const nombra = COLUMNAS_DE_LA_MARCA.some((c) => msg.includes(c));
  if (!nombra) return false;
  return (
    error.code === "PGRST204" ||
    error.code === "42703" ||
    msg.includes("could not find") ||
    msg.includes("does not exist")
  );
}

/** Lo que se le dice a quien intenta marcar antes de que la migración corra. */
export const AVISO_FALTA_MIGRACION =
  "Todavía falta prender esta pantalla del lado del sistema. Avísale a Daniel: falta correr la migración 20261127120000_marcacion_telefono.sql.";
