/**
 * Lectura del MAYOR CONTABLE desde la base. **UNA sola implementación.**
 *
 * La usan los DOS consumidores:
 *   · `/api/gastos-contabilidad/resumen` — el módulo "Gastos".
 *   · `/api/dashboard/vista-general`     — el gasto y la rentabilidad del dueño.
 *
 * 🔴 POR QUÉ VIVE ACÁ Y NO EN CADA RUTA. Si Vista General escribiera su propia
 * consulta, el día que las dos den números distintos Daniel no dejaría de
 * creerle a la que está mal: dejaría de creerle a las dos. La suma la hace
 * `resumirMes` (`./gastos.ts`), que es puro y está probado contra el archivo
 * real de Vistana; acá sólo se leen filas y se les da la forma que esa función
 * espera.
 *
 * 🔴 DEGRADACIÓN LIMPIA. La migración `20260810160000_mayor_contable.sql` la
 * corre Daniel A MANO. Mientras las tablas no existan se devuelve
 * `{ instalado: false, empresas: [] }` — nunca un 500, y nunca un $0 (que es la
 * mentira que este módulo entero existe para no decir).
 *
 * 🔴 PAGINADO. `db-max-rows` de PostgREST es 1000 y corta EN SILENCIO. Un mes
 * de una empresa puede pasar las mil líneas sin ningún error y el gasto saldría
 * corto sin que nadie se entere. Todo va por `leerTodoPaginado`, que verifica
 * contra un COUNT exacto y revienta si no cuadra.
 *
 * Los montos viajan en CENTAVOS ENTEROS. Convertir a dólares es cosa de quien
 * pinta: sumar floats por el camino es la forma clásica de perder el centavo.
 */

import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { ALL_EMPRESA_KEYS, EMPRESA_KEY_TO_NAME } from "@/lib/empresa-mapping";
import { montoACentavos, type MayorLinea } from "./parser";
import {
  avisosDelMes,
  esAsientoDeCierre,
  resumirMes,
  type Aviso,
  type Cobertura,
  type ResumenMes,
} from "./gastos";

/** El mes de UNA empresa, ya resumido. */
export interface EmpresaMayor {
  empresaKey: string;
  nombre: string;
  resumen: ResumenMes;
  avisos: Aviso[];
  /** Último mes CERRADO que tiene esa empresa (`YYYY-MM`), o `null`. */
  ultimoMesCerrado: string | null;
}

export interface LecturaMayor {
  /** `false` mientras la migración del mayor no haya corrido. */
  instalado: boolean;
  mes: string;
  empresas: EmpresaMayor[];
}

const MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export const mesMayorValido = (m: string): boolean => MES_RE.test(m);

/** `"2026-07"` → `"2026-06"`. */
export function mesAnterior(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/** `"2026-07"` → `"2026-07-01"` (la columna `mes` de la tabla es date, día 1). */
const primerDia = (mes: string) => `${mes}-01`;

/**
 * ¿El error de PostgREST dice que la tabla/relación no existe?
 *
 * Postgres devuelve `42P01`; PostgREST, cuando el schema cache todavía no la
 * conoce, `PGRST205`. Se miran también los textos porque `leerTodoPaginado` sólo
 * propaga el mensaje. Es un reconocimiento ESTRECHO a propósito: un timeout o un
 * permiso denegado NO son "no instalado" y tienen que seguir siendo un error.
 */
export function esTablaAusente(err: unknown): boolean {
  if (!err) return false;
  const e = err as { code?: string; message?: string };
  if (e.code === "42P01" || e.code === "PGRST205") return true;
  const msg = (e.message ?? String(err)).toLowerCase();
  return (
    msg.includes("does not exist") ||
    msg.includes("could not find the table") ||
    msg.includes("42p01") ||
    msg.includes("pgrst205")
  );
}

/** numeric(14,2) de PostgREST (número o texto) → centavos enteros, sin float. */
function centDe(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const s = typeof v === "number" ? v.toFixed(2) : String(v);
  return montoACentavos(s) ?? 0;
}

interface LineaRow {
  empresa_key: string;
  mes: string;
  fecha: string;
  asiento: string | null;
  descripcion: string | null;
  cuenta: string;
  cuenta_nombre: string | null;
  debito: number | string | null;
  credito: number | string | null;
  linea_nro: number | null;
}

/** Fila de la base → `MayorLinea`, la forma que comen `resumirMes` y compañía. */
function aMayorLinea(r: LineaRow): MayorLinea {
  const debitoCent = centDe(r.debito);
  const creditoCent = centDe(r.credito);
  return {
    asiento: r.asiento ?? "",
    descripcion: r.descripcion ?? "",
    fecha: String(r.fecha).slice(0, 10),
    // La columna es un date (día 1); el módulo trabaja con el bucket `YYYY-MM`.
    mes: String(r.mes).slice(0, 7),
    cuenta: r.cuenta,
    cuentaNombre: r.cuenta_nombre ?? "",
    debitoCent,
    creditoCent,
    netoCent: debitoCent - creditoCent,
    linea: r.linea_nro ?? 0,
  };
}

/**
 * El mayor de UN mes, resumido para las 8 empresas del grupo.
 *
 * Devuelve SIEMPRE las 8, aunque una no tenga ni una línea: es la única forma
 * de que la pantalla pueda decir "de esta empresa todavía no hay contabilidad"
 * en vez de omitirla en silencio.
 *
 * Lanza si la lectura falla de verdad; devuelve `instalado:false` sólo cuando
 * las tablas no existen.
 */
export async function leerMayorMes(mes: string): Promise<LecturaMayor> {
  const vacio: LecturaMayor = { instalado: false, mes, empresas: [] };

  // Sonda barata ANTES de paginar nada: acá sí llega el `code` de PostgREST,
  // que es la señal más precisa de "la migración todavía no corrió".
  const sonda = await supabaseServer.from("mayor_lineas").select("id").limit(1);
  if (sonda.error) {
    if (esTablaAusente(sonda.error)) return vacio;
    throw new Error(sonda.error.message);
  }

  const prev = mesAnterior(mes);

  const [importaciones, lineasDeLosDosMeses, lineasDeCierre] = await Promise.all([
    // Qué rangos se le pidieron a Switch. Es lo único que distingue "se pidió y
    // vino vacío" (sin cerrar) de "nunca se trajo" (no traído).
    leerTodoPaginado<{ empresa_key: string; rango_desde: string; rango_hasta: string }>(
      "mayor_importaciones (coberturas)",
      (pedirCount, desde, hasta) =>
        supabaseServer
          .from("mayor_importaciones")
          .select(
            "empresa_key, rango_desde, rango_hasta",
            pedirCount ? { count: "exact" } : {},
          )
          .order("id", { ascending: true })
          .range(desde, hasta),
    ),
    // El mes pedido Y el anterior: `avisosDelMes` compara el ISR contra el mes
    // previo, y sin él ese aviso no se puede calcular.
    leerTodoPaginado<LineaRow>(
      "mayor_lineas (mes y mes anterior)",
      (pedirCount, desde, hasta) =>
        supabaseServer
          .from("mayor_lineas")
          .select(
            "empresa_key, mes, fecha, asiento, descripcion, cuenta, cuenta_nombre, debito, credito, linea_nro",
            pedirCount ? { count: "exact" } : {},
          )
          .in("mes", [primerDia(mes), primerDia(prev)])
          .order("id", { ascending: true })
          .range(desde, hasta),
    ),
    // Para el "la contabilidad llega hasta …": sólo las líneas que PUEDEN ser
    // un asiento de cierre. Traer todos los meses enteros serían decenas de
    // miles de filas para responder una pregunta de cuatro líneas por mes.
    // El filtro es un SUPERCONJUNTO de lo que reconoce `esAsientoDeCierre`
    // (que además exige que el mes citado sea el de la línea), así que no
    // puede dar por cerrado un mes que no lo está.
    leerTodoPaginado<{ empresa_key: string; mes: string; descripcion: string | null }>(
      "mayor_lineas (asientos de cierre)",
      (pedirCount, desde, hasta) =>
        supabaseServer
          .from("mayor_lineas")
          .select("empresa_key, mes, descripcion", pedirCount ? { count: "exact" } : {})
          .ilike("descripcion", "ASIENTO%")
          .order("id", { ascending: true })
          .range(desde, hasta),
    ),
  ]);

  // ── Coberturas por empresa ──
  const coberturas = new Map<string, Cobertura[]>();
  for (const i of importaciones) {
    const arr = coberturas.get(i.empresa_key) ?? [];
    arr.push({
      desde: String(i.rango_desde).slice(0, 10),
      hasta: String(i.rango_hasta).slice(0, 10),
    });
    coberturas.set(i.empresa_key, arr);
  }

  // ── Líneas del mes y del mes anterior, por empresa ──
  const delMes = new Map<string, MayorLinea[]>();
  const delPrev = new Map<string, MayorLinea[]>();
  for (const r of lineasDeLosDosMeses) {
    const l = aMayorLinea(r);
    const destino = l.mes === mes ? delMes : l.mes === prev ? delPrev : null;
    if (!destino) continue;
    const arr = destino.get(r.empresa_key) ?? [];
    arr.push(l);
    destino.set(r.empresa_key, arr);
  }

  // ── Último mes CERRADO por empresa ──
  const ultimoCerrado = new Map<string, string>();
  for (const r of lineasDeCierre) {
    const bucket = String(r.mes).slice(0, 7);
    if (!esAsientoDeCierre({ descripcion: r.descripcion ?? "", mes: bucket })) continue;
    const previo = ultimoCerrado.get(r.empresa_key);
    if (!previo || bucket > previo) ultimoCerrado.set(r.empresa_key, bucket);
  }

  const empresas: EmpresaMayor[] = ALL_EMPRESA_KEYS.map((key) => {
    const cob = coberturas.get(key) ?? [];
    const resumen = resumirMes(mes, delMes.get(key) ?? [], cob);
    const anterior = resumirMes(prev, delPrev.get(key) ?? [], cob);
    return {
      empresaKey: key,
      nombre: EMPRESA_KEY_TO_NAME[key] ?? key,
      resumen,
      avisos: avisosDelMes(key, resumen, anterior),
      ultimoMesCerrado: ultimoCerrado.get(key) ?? null,
    };
  });

  return { instalado: true, mes, empresas };
}
