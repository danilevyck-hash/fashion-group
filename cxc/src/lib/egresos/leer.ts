/**
 * Lectura de EGRESOS VARIOS desde la base. **UNA sola implementación**, igual
 * que `mayor/leer.ts`: si dos rutas escribieran su propia consulta, el día que
 * dieran números distintos Daniel no dejaría de creerle a la que está mal —
 * dejaría de creerle a las dos.
 *
 * 🔴 DEGRADACIÓN LIMPIA. La migración `20260813120000_egresos_varios.sql` la
 * corre Daniel A MANO. Mientras las tablas no existan se devuelve
 * `{ instalado: false, empresas: [] }` — nunca un 500, y nunca un $0 (que es la
 * mentira que este módulo entero existe para no decir).
 *
 * 🔴 PAGINADO. `db-max-rows` de PostgREST es 1000 y corta EN SILENCIO. Vistana
 * sola hace ~380 egresos al año y las 8 empresas juntas pueden pasar las mil en
 * UN mes sin ningún error: el gasto saldría corto y nadie se enteraría. Todo va
 * por `leerTodoPaginado`, que verifica contra un COUNT exacto y revienta si no
 * cuadra.
 *
 * Los montos viajan en CENTAVOS ENTEROS. Convertir a dólares es cosa de quien
 * pinta: sumar floats por el camino es la forma clásica de perder el centavo.
 */

import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { ALL_EMPRESA_KEYS, EMPRESA_KEY_TO_NAME } from "@/lib/empresa-mapping";
import { montoACentavos } from "@/lib/mayor/parser";
import { esTablaAusente } from "@/lib/mayor/leer";
import { empresasConEgresosEnCron } from "@/lib/switch-api/empresas";
import { leerNombresDeCuentas, type NombresPorEmpresa } from "@/lib/cuentas/leer";
import type { EgresoLinea } from "./parser";
import { esGasto, resumirMesEgresos, type Cobertura, type ResumenEgresosMes } from "./reglas";
import { alDiaDe, serieDeGasto, type AlDia } from "./al-dia";
import { hoyPanama } from "@/lib/fecha-panama";

/** El mes de UNA empresa, ya resumido. */
export interface EmpresaEgresos {
  empresaKey: string;
  nombre: string;
  resumen: ResumenEgresosMes;
  /** Último mes con movimientos que tiene esa empresa (`YYYY-MM`), o `null`.
   *  Es lo que permite decir "los egresos llegan hasta …" en vez de un cero. */
  ultimoMesConMovimientos: string | null;
  /** Hasta qué mes está al día esa empresa — el avance de la contadora, para
   *  que Daniel lo vea sin preguntarlo. Se DERIVA del dato (ver `./al-dia.ts`),
   *  nunca de una lista escrita a mano. */
  alDia: AlDia;
  /** ¿El cron baja sola esta empresa?
   *
   *  🔴 `false` en `confecciones_boston` por pedido de Daniel — su usuario de
   *  Switch es el de él y no quiere que nada se lo tome. Viaja al navegador
   *  porque **una empresa que se ve vacía sin explicación se lee como un error
   *  del sistema**: la pantalla tiene que poder decir que sus gastos no se están
   *  trayendo de esta fuente, no dejar un "No traído" mudo. */
  descargaAutomatica: boolean;
}

export interface LecturaEgresos {
  /** `false` mientras la migración de egresos no haya corrido. */
  instalado: boolean;
  mes: string;
  empresas: EmpresaEgresos[];
}

/** `"2026-07"` → `"2026-07-01"` (la columna `mes` es date, día 1). */
const primerDia = (mes: string) => `${mes}-01`;

/** numeric(14,2) de PostgREST (número o texto) → centavos enteros, sin float. */
function centDe(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const s = typeof v === "number" ? v.toFixed(2) : String(v);
  return montoACentavos(s) ?? 0;
}

interface EgresoRow {
  empresa_key: string;
  mes: string;
  fecha: string;
  n_interno: string | null;
  cuenta: string;
  sucursal: string | null;
  proveedor: string | null;
  referencia: string | null;
  total: number | string | null;
  linea_nro: number | null;
}

/** Fila de la base → `EgresoLinea`, la forma que come `resumirMesEgresos`. */
function aEgresoLinea(r: EgresoRow): EgresoLinea {
  return {
    fecha: String(r.fecha).slice(0, 10),
    // La columna es un date (día 1); el módulo trabaja con el bucket `YYYY-MM`.
    mes: String(r.mes).slice(0, 7),
    nInterno: r.n_interno ?? "",
    cuenta: r.cuenta,
    sucursal: r.sucursal ?? "",
    proveedor: r.proveedor ?? "",
    referencia: r.referencia ?? "",
    totalCent: centDe(r.total),
    linea: r.linea_nro ?? 0,
  };
}

/**
 * Los egresos de UN mes, resumidos para las 8 empresas del grupo.
 *
 * Devuelve SIEMPRE las 8, aunque una no tenga ni un renglón: es la única forma
 * de que la pantalla pueda decir "de esta empresa todavía no se trajo nada" en
 * vez de omitirla en silencio.
 */
export async function leerEgresosMes(mes: string): Promise<LecturaEgresos> {
  const vacio: LecturaEgresos = { instalado: false, mes, empresas: [] };

  // Sonda barata ANTES de paginar nada: acá sí llega el `code` de PostgREST,
  // que es la señal más precisa de "la migración todavía no corrió".
  const sonda = await supabaseServer.from("egresos_varios").select("id").limit(1);
  if (sonda.error) {
    if (esTablaAusente(sonda.error)) return vacio;
    throw new Error(sonda.error.message);
  }

  const [importaciones, delMes, mesesConMovimiento] = await Promise.all([
    // Qué rangos se le pidieron a Switch. Es lo único que distingue "se pidió y
    // no hubo movimientos" de "nunca se trajo".
    leerTodoPaginado<{ empresa_key: string; rango_desde: string; rango_hasta: string }>(
      "egresos_importaciones (coberturas)",
      (pedirCount, desde, hasta) =>
        supabaseServer
          .from("egresos_importaciones")
          .select("empresa_key, rango_desde, rango_hasta", pedirCount ? { count: "exact" } : {})
          .order("id", { ascending: true })
          .range(desde, hasta),
    ),
    leerTodoPaginado<EgresoRow>("egresos_varios (mes)", (pedirCount, desde, hasta) =>
      supabaseServer
        .from("egresos_varios")
        .select(
          "empresa_key, mes, fecha, n_interno, cuenta, sucursal, proveedor, referencia, total, linea_nro",
          pedirCount ? { count: "exact" } : {},
        )
        .eq("mes", primerDia(mes))
        .order("id", { ascending: true })
        .range(desde, hasta),
    ),
    // Para el "hasta qué mes está al día". Cuatro columnas, NO la fila entera:
    // traer los meses completos serían decenas de miles de filas para responder
    // una pregunta de una línea por empresa. `cuenta` y `total` se suman a
    // `empresa_key, mes` porque la sospecha de "mes a medio cargar" se mide
    // contra el GASTO de los meses previos de esa misma empresa — sin el monto
    // solo se podría decir hasta qué mes hay algo, no si ese mes se ve raro.
    leerTodoPaginado<{ empresa_key: string; mes: string; cuenta: string; total: number | string | null }>(
      "egresos_varios (meses con movimiento)",
      (pedirCount, desde, hasta) =>
        supabaseServer
          .from("egresos_varios")
          .select("empresa_key, mes, cuenta, total", pedirCount ? { count: "exact" } : {})
          .order("id", { ascending: true })
          .range(desde, hasta),
    ),
  ]);

  const coberturas = new Map<string, Cobertura[]>();
  for (const i of importaciones) {
    const arr = coberturas.get(i.empresa_key) ?? [];
    arr.push({
      desde: String(i.rango_desde).slice(0, 10),
      hasta: String(i.rango_hasta).slice(0, 10),
    });
    coberturas.set(i.empresa_key, arr);
  }

  const porEmpresa = new Map<string, EgresoLinea[]>();
  for (const r of delMes) {
    const arr = porEmpresa.get(r.empresa_key) ?? [];
    arr.push(aEgresoLinea(r));
    porEmpresa.set(r.empresa_key, arr);
  }

  // Último mes con movimientos, y la serie mensual de GASTO de cada empresa —
  // las dos salen de la MISMA lectura, en una sola pasada.
  //
  // ⚠️ La serie es de GASTO (grupo 6), no de todo lo que salió: un mes puede
  // estar lleno de transferencias entre cuentas propias y no tener un peso de
  // gasto. Es el mismo criterio con el que la pantalla pinta "De eso, gastos".
  const ultimoMes = new Map<string, string>();
  const renglonesPorEmpresa = new Map<string, { mes: string; gastoCent: number }[]>();
  for (const r of mesesConMovimiento) {
    const bucket = String(r.mes).slice(0, 7);
    const previo = ultimoMes.get(r.empresa_key);
    if (!previo || bucket > previo) ultimoMes.set(r.empresa_key, bucket);

    const arr = renglonesPorEmpresa.get(r.empresa_key) ?? [];
    arr.push({ mes: bucket, gastoCent: esGasto(r.cuenta) ? centDe(r.total) : 0 });
    renglonesPorEmpresa.set(r.empresa_key, arr);
  }
  const mesEnCurso = hoyPanama().slice(0, 7);

  // Los NOMBRES de las cuentas, en una sola pasada para las 8 empresas y sólo
  // por los códigos que este mes usa. Falla ABIERTO: sin nombres la pantalla
  // muestra los códigos, que es como se veía antes del catálogo.
  const usadas = new Map<string, string[]>();
  for (const [key, lineas] of porEmpresa) {
    usadas.set(key, [...new Set(lineas.map((l) => l.cuenta))]);
  }
  let nombres: NombresPorEmpresa = new Map();
  try {
    nombres = await leerNombresDeCuentas(usadas);
  } catch (e) {
    console.error("[egresos/leer] nombres de cuenta:", e);
  }

  const enCron = new Set<string>(empresasConEgresosEnCron());

  const empresas: EmpresaEgresos[] = ALL_EMPRESA_KEYS.map((key) => ({
    empresaKey: key,
    nombre: EMPRESA_KEY_TO_NAME[key] ?? key,
    resumen: resumirMesEgresos(
      mes,
      porEmpresa.get(key) ?? [],
      coberturas.get(key) ?? [],
      nombres.get(key),
    ),
    ultimoMesConMovimientos: ultimoMes.get(key) ?? null,
    alDia: alDiaDe(serieDeGasto(renglonesPorEmpresa.get(key) ?? []), mesEnCurso),
    descargaAutomatica: enCron.has(key),
  }));

  return { instalado: true, mes, empresas };
}
