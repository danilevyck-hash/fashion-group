// ─────────────────────────────────────────────────────────────────────────────
// LO QUE LA PESTAÑA «MARCACIONES» DIBUJA — la regla, sin pantalla (25-sep-2026).
//
// Aquí no hay JSX, no hay `fetch` y no hay `new Date()`: entran las marcas que
// mandó la ruta y salen las tarjetas del celular, las filas de la computadora,
// los chips de filtro y el pie. La pantalla solo lo aplica.
//
// 🔴 SOLO SE MIRA. Este módulo no tiene una sola función que escriba: no hay
// corregir, no hay borrar, no hay justificar. Corregir una hora sigue viviendo
// en Asistencia, con su motivo obligatorio y su firma.
//
// 🔴 EL RÓTULO DE LA MARCA SALE DEL ORDEN DEL DÍA, NO DE LA COLUMNA `tipo`. La
// base solo guarda `entrada` / `salida` —son los dos únicos valores que el
// validador conoce— y las cuatro marcas alternan entre esos dos. Quien mira no
// necesita saber eso: necesita leer «Salida a almuerzo». El orden es el de
// `NOMBRES_DE_LA_MARCA` (`lib/marcacion/cuatro-marcas.ts`), que es la MISMA
// lista con la que el teléfono rotula su botón — una segunda copia aquí sería
// la forma de que un día digan cosas distintas.
//
// 🔴 EL LUGAR SE ESCRIBE UNA SOLA VEZ POR TARJETA cuando las marcas del día
// cayeron todas en el mismo sitio. Repetir «City Mall David» cuatro veces en
// una tarjeta de teléfono es gastar los cuatro renglones que hay.
// ─────────────────────────────────────────────────────────────────────────────

import { capitalizarNombre } from "@/lib/nombre-en-pantalla";
import { diaPanamaDe, horaCorta } from "@/lib/marcacion/marcacion";
import { NOMBRES_DE_LA_MARCA } from "@/lib/marcacion/cuatro-marcas";
import { selloValido } from "@/lib/marcacion/sello-del-aparato";
import { aparatosCompartidos } from "@/lib/asistencia/mismo-aparato";
import { SIN_LUGAR } from "@/lib/asistencia/lugar-de-marca";
import { demoraEnPalabras, llegoTarde } from "@/lib/asistencia/marcaciones-pestana";
import type { PalabrasDeLaLista } from "@/lib/ui/pie-de-lista";

// ─────────────────────────────────────────────────────────────────────────────
// LO QUE MANDA LA RUTA
// ─────────────────────────────────────────────────────────────────────────────

/** El lugar, tal como lo arma `lugarDeMarca` del lado del servidor. */
export interface LugarDeLaMarca {
  texto: string;
  metros?: number | null;
  /** Cayó cerca del punto de referencia de su empresa. La pantalla no decide
   *  nada con esto; se conserva porque la ruta lo manda. */
  enLaTienda?: boolean;
}

/** Una marca del TELÉFONO, tal como viaja en `GET /api/asistencia/marcaciones`. */
export interface MarcaDeTelefono {
  id: string;
  codigo: string;
  nombre: string;
  tipo: string;
  /** ISO en UTC. La pantalla la dibuja en hora de PANAMÁ. */
  ocurrioEn: string;
  /** Cuándo entró a la base. `null` en las marcas viejas. */
  creadoEn: string | null;
  sinSenal: boolean;
  horaTelefono: string | null;
  tieneFoto: boolean;
  lat: number | null;
  lng: number | null;
  precisionM: number | null;
  /** El sello del teléfono. `null` = marca vieja o del reloj. */
  aparatoId: string | null;
  empresaKey: string | null;
  lugar: LugarDeLaMarca;
}

// ─────────────────────────────────────────────────────────────────────────────
// LOS RÓTULOS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 🔴 LAS SEIS COLUMNAS DE LA COMPUTADORA, EN ESTE ORDEN. Se leen de izquierda a
 * derecha como la pregunta que se hace quien mira: cuándo · quién · qué marca ·
 * dónde estaba · cuánto tardó en llegar · desde qué teléfono.
 */
export const COLUMNAS_MARCACIONES = [
  "Hora", "Colaborador", "Marca", "Lugar", "Llegó", "Aparato",
] as const;

/** Cómo se nombra lo que esta lista cuenta, para el pie común de la casa. */
export const PALABRAS_MARCAS: PalabrasDeLaLista = { singular: "marca", plural: "marcas" };

/** Lo que dice la celda «Aparato» cuando la marca no trae sello. */
export const SIN_APARATO = "—";

/** Cuántos caracteres del sello alcanzan para reconocerlo de un vistazo. */
export const LARGO_DEL_SELLO = 6;

/** El chip de la marca que salió del MISMO teléfono que la de otra persona. */
export const CHIP_MISMO_APARATO = "mismo teléfono";
export const TITULO_MISMO_APARATO =
  "Ese día, otro colaborador marcó desde este mismo teléfono.";

/** Lo que se dice de una marca que se mandó sin señal. */
export const TEXTO_SIN_SENAL = "sin señal";

/** El aviso de que la migración del lugar y del sello todavía no corrió. */
export const SIN_COLUMNAS_NUEVAS =
  "Todavía no se guardan el lugar ni el teléfono de cada marca: esas dos columnas salen en «—».";

/** Cuando el período no trae ni una marca de teléfono. */
export const SIN_MARCAS =
  "Ningún colaborador marcó desde el teléfono en este período.";

/** El rótulo del chip que muestra TODO, en los dos filtros. */
export const CHIP_TODOS = "Todos";
export const CHIP_TODOS_LOS_DIAS = "Todos los días";

/**
 * El sello corto y legible de un teléfono. Sin sello —marca vieja, o el
 * `localStorage` bloqueado— una raya, nunca un cero ni un invento.
 */
export function selloCorto(aparatoId: string | null | undefined): string {
  return selloValido(aparatoId) ? String(aparatoId).slice(0, LARGO_DEL_SELLO) : SIN_APARATO;
}

/**
 * Cómo se llama la marca número `indice` del día de esa persona: «Entrada»,
 * «Salida a almuerzo», «Vuelta de almuerzo», «Salida». Más allá de la cuarta
 * —o con un `tipo` que no se reconoce— se dice lo que trae la base, capitalizado.
 */
export function rotuloDeLaMarca(indice: number, tipo: string | null | undefined): string {
  const i = Math.floor(Number.isFinite(indice) ? indice : -1);
  const nombre = i >= 0 && i < NOMBRES_DE_LA_MARCA.length ? NOMBRES_DE_LA_MARCA[i] : String(tipo ?? "").trim();
  if (!nombre) return "Marca";
  return nombre.charAt(0).toUpperCase() + nombre.slice(1);
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

/** «jue 25 sep» — la fecha de un día de Panamá (`YYYY-MM-DD`), como se lee aquí. */
export function fechaDelDia(dia: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dia ?? "").trim());
  if (!m) return String(dia ?? "");
  const [a, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dow = new Date(Date.UTC(a, mes - 1, d)).getUTCDay();
  return `${DIAS[dow]} ${d} ${MESES[mes - 1]}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// LAS TARJETAS DEL CELULAR: UNA POR COLABORADOR Y POR DÍA
// ─────────────────────────────────────────────────────────────────────────────

/** Una marca ya lista para dibujar: con su rótulo, su hora y su demora. */
export interface MarcaDibujada {
  marca: MarcaDeTelefono;
  /** «Entrada», «Salida a almuerzo»… */
  rotulo: string;
  /** «08:17», hora de PANAMÁ y en 24 h, como todo el reporte y la planilla. */
  hora: string;
  /** «al instante» / «llegó 9 h después». */
  llego: string;
  /** ¿Hubo demora? Solo entonces se dibuja el chip gris. */
  tarde: boolean;
  /** Sale del MISMO teléfono que la marca de otro colaborador ese día. */
  mismoAparato: boolean;
}

export interface TarjetaDeDia {
  /** `codigo|dia`, estable: sirve de `key` y de ancla. */
  llave: string;
  codigo: string;
  nombre: string;
  /** El día de PANAMÁ (`YYYY-MM-DD`). */
  dia: string;
  marcas: MarcaDibujada[];
  /**
   * 🔴 El lugar, escrito UNA sola vez, cuando todas las marcas del día cayeron
   * en el mismo sitio. `null` = cada marca lleva el suyo.
   */
  lugarComun: string | null;
}

const porHora = (a: MarcaDeTelefono, b: MarcaDeTelefono): number =>
  a.ocurrioEn.localeCompare(b.ocurrioEn) || a.id.localeCompare(b.id);

/**
 * 🔴 EL LUGAR COMÚN DE UN DÍA. Devuelve el texto solo cuando **todas** las
 * marcas dicen exactamente lo mismo y ese texto dice algo (una raya no es un
 * lugar). Con una sola distinta, `null`: ahí cada marca lleva el suyo, que es
 * justamente el día que hay que mirar.
 */
export function lugarComunDelDia(marcas: readonly MarcaDeTelefono[]): string | null {
  if (marcas.length === 0) return null;
  const primero = String(marcas[0].lugar?.texto ?? "").trim();
  if (!primero || primero === SIN_LUGAR) return null;
  for (const m of marcas) {
    if (String(m.lugar?.texto ?? "").trim() !== primero) return null;
  }
  return primero;
}

/**
 * Las marcas de un día y una persona que salieron del MISMO teléfono que las de
 * otra persona. Se reusa `aparatosCompartidos` —la MISMA regla con la que se le
 * avisa a Daniel por Telegram— para que la pantalla y el aviso no puedan
 * discrepar. Las marcas sin sello nunca entran: `null` no es igual a `null`.
 */
export function marcasDeAparatoCompartido(
  marcas: readonly MarcaDeTelefono[],
): ReadonlySet<string> {
  const casos = aparatosCompartidos(
    marcas.map((m) => ({
      empleado_codigo: m.codigo,
      empleado_nombre: m.nombre,
      ocurrio_en: m.ocurrioEn,
      aparato_id: m.aparatoId,
    })),
  );
  const pares = new Set(casos.map((c) => `${c.aparatoId}|${c.dia}`));
  const out = new Set<string>();
  if (pares.size === 0) return out;
  for (const m of marcas) {
    if (!selloValido(m.aparatoId)) continue;
    if (pares.has(`${m.aparatoId}|${diaPanamaDe(m.ocurrioEn)}`)) out.add(m.id);
  }
  return out;
}

/** Una marca, ya lista para dibujar. `indice` es su lugar en el día. */
export function dibujarMarca(
  marca: MarcaDeTelefono,
  indice: number,
  compartidas: ReadonlySet<string>,
): MarcaDibujada {
  return {
    marca,
    rotulo: rotuloDeLaMarca(indice, marca.tipo),
    hora: horaCorta(marca.ocurrioEn),
    llego: demoraEnPalabras(marca.ocurrioEn, marca.creadoEn),
    tarde: llegoTarde(marca.ocurrioEn, marca.creadoEn),
    mismoAparato: compartidas.has(marca.id),
  };
}

/**
 * 🔴 UNA TARJETA POR COLABORADOR Y POR DÍA, con sus marcas en orden. El día más
 * reciente arriba —es el que se viene a mirar— y, dentro del día, por nombre.
 */
export function tarjetasDeMarcaciones(marcas: readonly MarcaDeTelefono[]): TarjetaDeDia[] {
  const compartidas = marcasDeAparatoCompartido(marcas);
  const grupos = new Map<string, { codigo: string; nombre: string; dia: string; marcas: MarcaDeTelefono[] }>();

  for (const m of marcas) {
    const dia = diaPanamaDe(m.ocurrioEn);
    if (!dia) continue;
    const llave = `${m.codigo}|${dia}`;
    const g = grupos.get(llave) ?? { codigo: m.codigo, nombre: m.nombre, dia, marcas: [] };
    g.marcas.push(m);
    grupos.set(llave, g);
  }

  return [...grupos.entries()]
    .map(([llave, g]) => {
      const ordenadas = [...g.marcas].sort(porHora);
      return {
        llave,
        codigo: g.codigo,
        nombre: capitalizarNombre(g.nombre) || g.codigo,
        dia: g.dia,
        marcas: ordenadas.map((m, i) => dibujarMarca(m, i, compartidas)),
        lugarComun: lugarComunDelDia(ordenadas),
      };
    })
    .sort((a, b) => b.dia.localeCompare(a.dia) || a.nombre.localeCompare(b.nombre));
}

// ─────────────────────────────────────────────────────────────────────────────
// LA TABLA DE LA COMPUTADORA
// ─────────────────────────────────────────────────────────────────────────────

/** Una fila de la tabla: la marca, con el índice que tuvo dentro de su día. */
export function filasDeMarcaciones(marcas: readonly MarcaDeTelefono[]): MarcaDibujada[] {
  const compartidas = marcasDeAparatoCompartido(marcas);
  const indice = new Map<string, number>();
  const ordenadas = [...marcas].sort(porHora);
  const conIndice = ordenadas.map((m) => {
    const llave = `${m.codigo}|${diaPanamaDe(m.ocurrioEn)}`;
    const i = indice.get(llave) ?? 0;
    indice.set(llave, i + 1);
    return dibujarMarca(m, i, compartidas);
  });
  // Lo más reciente arriba: es el día que se viene a mirar.
  return conIndice.reverse();
}

// ─────────────────────────────────────────────────────────────────────────────
// LOS DOS FILTROS: POR COLABORADOR Y POR DÍA
//
// 🔴 EL TOTAL DEL PIE SIGUE AL FILTRO. La regla de la casa, escrita en
// `lib/ui/pie-de-lista.ts`: o el total sigue a lo que se ve, o no hay filtro.
// ─────────────────────────────────────────────────────────────────────────────

export interface FiltroDeMarcaciones {
  /** Código del colaborador. Vacío = todos. */
  codigo: string;
  /** Día de Panamá (`YYYY-MM-DD`). Vacío = todos. */
  dia: string;
}

export interface OpcionColaborador { codigo: string; nombre: string }

/** Los colaboradores que marcaron en el período, por nombre. */
export function colaboradoresDeLasMarcas(marcas: readonly MarcaDeTelefono[]): OpcionColaborador[] {
  const m = new Map<string, string>();
  for (const x of marcas) if (!m.has(x.codigo)) m.set(x.codigo, capitalizarNombre(x.nombre) || x.codigo);
  return [...m.entries()]
    .map(([codigo, nombre]) => ({ codigo, nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

/** Los días con marcas, el más reciente primero. */
export function diasDeLasMarcas(marcas: readonly MarcaDeTelefono[]): string[] {
  const s = new Set<string>();
  for (const m of marcas) {
    const d = diaPanamaDe(m.ocurrioEn);
    if (d) s.add(d);
  }
  return [...s].sort((a, b) => b.localeCompare(a));
}

/** Lo que queda después de los dos chips. Igualdad exacta, nunca por parecido. */
export function filtrarMarcas(
  marcas: readonly MarcaDeTelefono[],
  filtro: FiltroDeMarcaciones,
): MarcaDeTelefono[] {
  const codigo = String(filtro.codigo ?? "").trim();
  const dia = String(filtro.dia ?? "").trim();
  return marcas.filter((m) => {
    if (codigo && m.codigo !== codigo) return false;
    if (dia && diaPanamaDe(m.ocurrioEn) !== dia) return false;
    return true;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// LO QUE DICE LA HOJA DE UNA MARCA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Los renglones sueltos de la hoja: dónde estaba, con cuánta precisión, si la
 * mandó sin señal y cuánto tardó en llegar. **Lo que no se sabe no se escribe**:
 * una raya nunca sube a esta lista.
 */
export function lineasDeLaHoja(m: MarcaDeTelefono): string[] {
  const out: string[] = [];
  const lugar = String(m.lugar?.texto ?? "").trim();
  if (lugar && lugar !== SIN_LUGAR) out.push(lugar);
  if (typeof m.precisionM === "number" && Number.isFinite(m.precisionM)) {
    out.push(`Precisión de ${Math.round(m.precisionM)} m`);
  }
  if (m.sinSenal) {
    out.push(
      m.horaTelefono
        ? `Se marcó ${TEXTO_SIN_SENAL}: la hora la puso el teléfono (${m.horaTelefono}).`
        : `Se marcó ${TEXTO_SIN_SENAL}.`,
    );
  }
  if (llegoTarde(m.ocurrioEn, m.creadoEn)) {
    out.push(`Esta marca ${demoraEnPalabras(m.ocurrioEn, m.creadoEn)}.`);
  }
  return out;
}

/**
 * El renglón chico bajo una marca de la tarjeta del celular.
 *
 * 🔴 EL LUGAR SOLO SE REPITE CUANDO HACE FALTA: con `lugarComun` puesto ya se
 * escribió arriba, así que aquí no vuelve a salir. «Sin señal» sí, siempre que
 * lo haya, porque es de esa marca y de ninguna otra.
 */
export function subtituloDeLaMarca(
  d: MarcaDibujada,
  lugarComun: string | null,
): string {
  const partes: string[] = [];
  if (!lugarComun) {
    const lugar = String(d.marca.lugar?.texto ?? "").trim();
    if (lugar && lugar !== SIN_LUGAR) partes.push(lugar);
  }
  if (d.marca.sinSenal) partes.push(TEXTO_SIN_SENAL);
  return partes.join(" · ");
}

/** El detalle de una línea que va bajo el título de la hoja. */
export function detalleDeLaHoja(m: MarcaDeTelefono): string {
  return m.sinSenal
    ? `Marcada ${TEXTO_SIN_SENAL} · ${demoraEnPalabras(m.ocurrioEn, m.creadoEn)}`
    : `Marcada con señal · ${demoraEnPalabras(m.ocurrioEn, m.creadoEn)}`;
}
