/**
 * Lectura de los NOMBRES de las cuentas contables. **Una sola implementación**,
 * igual que `mayor/leer.ts` y `egresos/leer.ts`.
 *
 * 🔴 DEGRADACIÓN LIMPIA. La migración `20260813180000_cuentas_contables.sql` la
 * corre Daniel A MANO. Mientras la tabla no exista se usa el único nombre que
 * hoy hay —el que el CSV del mayor trae pegado a cada línea— y la pantalla se
 * dibuja igual. Sin ninguno de los dos, los renglones muestran el código pelado,
 * que es exactamente como se veían antes: nunca un nombre inventado.
 *
 * 🔴 SE PIDEN SÓLO LOS NOMBRES QUE EL MES USA. Con Supabase en compute Micro,
 * bajarse el catálogo entero de 8 empresas para pintar una pantalla es carga
 * regalada. `codigosCandidatos` arma la lista exacta (cada cuenta y sus padres):
 * para Vistana son 42 cuentas → ~100 códigos.
 *
 * 🔴 UN PROBLEMA LEYENDO NOMBRES NO PUEDE TUMBAR UNA PANTALLA DE PLATA. Las dos
 * lecturas fallan ABIERTAS: si algo sale mal se devuelve lo que se pudo armar y
 * los renglones sin nombre muestran el código. Lo único que se propaga es el
 * truncado silencioso del mayor, que se caza con `leerTodoPaginado` — un nombre
 * que falta por un corte invisible es peor que uno que falta a la vista.
 */

import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { esTablaAusente } from "@/lib/mayor/leer";
import { armarNombres, codigosCandidatos, type NombresDeCuentas } from "./catalogo";

/** Nombres por empresa: `empresa_key` → (`cuenta` completa → nombre). */
export type NombresPorEmpresa = ReadonlyMap<string, NombresDeCuentas>;

const VACIO: NombresPorEmpresa = new Map();

type ParCuentaNombre = { cuenta: string; nombre: string };

/**
 * Cuántos códigos entran en un `.in(...)`.
 *
 * ⚠️ El filtro viaja en la URL y una URL demasiado larga la rechaza el gateway,
 * no PostgREST — o sea que el fallo sería un 4xx sin relación aparente con lo
 * que se pidió. Los códigos miden 13 caracteres, así que 200 son ~2,8 KB: muy
 * por debajo de cualquier límite, y en el caso real alcanza con una sola tanda.
 * Partir en tandas no cambia ningún resultado: la unión de las respuestas es la
 * respuesta de la lista entera.
 */
const CODIGOS_POR_TANDA = 200;

function tandas<T>(xs: readonly T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

/**
 * Los nombres de las cuentas que se le pasen, por empresa.
 *
 * @param usadas qué cuentas usa cada empresa en lo que se va a pintar.
 */
export async function leerNombresDeCuentas(
  usadas: ReadonlyMap<string, readonly string[]>,
): Promise<NombresPorEmpresa> {
  const empresas = [...usadas.keys()];
  const porEmpresa = new Map<string, string[]>();
  for (const [empresaKey, cuentas] of usadas) {
    porEmpresa.set(empresaKey, codigosCandidatos(cuentas));
  }
  const codigos = [...new Set([...porEmpresa.values()].flat())];
  if (empresas.length === 0 || codigos.length === 0) return VACIO;

  const catalogo = await leerCatalogo(empresas, codigos);

  // 🔑 El mayor se consulta SÓLO por los códigos que el catálogo no resolvió, y
  // por eso va DESPUÉS y no en paralelo. En cuanto el catálogo esté completo
  // esta lista queda vacía y la consulta ni siquiera se hace: el respaldo se
  // apaga solo, sin que nadie tenga que acordarse de quitarlo.
  const faltantes = new Set<string>();
  for (const [empresaKey, suyos] of porEmpresa) {
    const resueltos = new Set((catalogo.get(empresaKey) ?? []).map((f) => f.cuenta));
    for (const c of suyos) if (!resueltos.has(c)) faltantes.add(c);
  }
  const mayor =
    faltantes.size > 0
      ? await leerDelMayor(empresas, [...faltantes])
      : new Map<string, ParCuentaNombre[]>();

  const out = new Map<string, NombresDeCuentas>();
  for (const empresaKey of empresas) {
    out.set(
      empresaKey,
      armarNombres(catalogo.get(empresaKey) ?? [], mayor.get(empresaKey) ?? []),
    );
  }
  return out;
}

function agrupar(filas: ReadonlyArray<{ empresa_key: string } & ParCuentaNombre>): Map<string, ParCuentaNombre[]> {
  const out = new Map<string, ParCuentaNombre[]>();
  for (const f of filas) {
    out.set(f.empresa_key, [...(out.get(f.empresa_key) ?? []), { cuenta: f.cuenta, nombre: f.nombre }]);
  }
  return out;
}

/**
 * El catálogo de Switch. La tabla puede no existir todavía, y eso NO es un
 * error: es el estado normal hasta que Daniel corra la migración.
 *
 * No necesita paginar: se piden como mucho `CODIGOS_POR_TANDA` códigos por
 * tanda y la llave es `(empresa_key, cuenta)`, así que el techo de filas por
 * respuesta es 200 × 8 empresas = 1.600… que SÍ pasa las 1.000 de PostgREST en
 * el caso extremo. Por eso la tanda se acota a 100 cuando hay más de 5 empresas
 * (ver `tamanoDeTanda`): el corte silencioso no se negocia.
 */
async function leerCatalogo(
  empresas: readonly string[],
  codigos: readonly string[],
): Promise<Map<string, ParCuentaNombre[]>> {
  const filas: Array<{ empresa_key: string } & ParCuentaNombre> = [];

  for (const tanda of tandas(codigos, tamanoDeTanda(empresas.length))) {
    const { data, error } = await supabaseServer
      .from("cuentas_contables")
      .select("empresa_key, cuenta, nombre")
      .in("empresa_key", empresas as string[])
      .in("cuenta", tanda);

    if (error) {
      if (!esTablaAusente(error)) {
        console.error("[cuentas/leer] cuentas_contables:", error.message);
      }
      return new Map();
    }

    for (const f of (data ?? []) as Array<{ empresa_key: string; cuenta: string; nombre: string | null }>) {
      if (!f.nombre) continue;
      filas.push({ empresa_key: f.empresa_key, cuenta: f.cuenta, nombre: f.nombre });
    }
  }
  return agrupar(filas);
}

/**
 * Cuántos códigos por tanda, para que `códigos × empresas` no llegue nunca a las
 * 1.000 filas con las que PostgREST corta EN SILENCIO. Con 8 empresas quedan
 * 100 códigos → 800 filas como techo absoluto.
 */
function tamanoDeTanda(empresas: number): number {
  const techo = Math.floor(800 / Math.max(1, empresas));
  return Math.max(50, Math.min(CODIGOS_POR_TANDA, techo));
}

/**
 * El nombre que el CSV del mayor trae pegado a cada línea. Es lo único que hay
 * hasta que el catálogo se baje, y sigue siendo el respaldo después.
 *
 * ⚠️ Acá SÍ hay que paginar de verdad: `mayor_lineas` tiene una fila por LÍNEA
 * de asiento, así que la misma cuenta aparece una vez por mes y por empresa.
 * Filtrando por 100 códigos, un año cerrado de las 8 empresas ya pasa las 1.000
 * filas — y PostgREST las corta sin error. `leerTodoPaginado` verifica contra un
 * COUNT exacto y revienta si no cuadra.
 *
 * ⚠️ Filtra `cuenta_nombre` no nulo en el SERVIDOR: traer líneas sin nombre para
 * descartarlas acá sería pedirle a la base trabajo que no sirve.
 */
async function leerDelMayor(
  empresas: readonly string[],
  codigos: readonly string[],
): Promise<Map<string, ParCuentaNombre[]>> {
  const filas: Array<{ empresa_key: string } & ParCuentaNombre> = [];

  try {
    for (const tanda of tandas(codigos, CODIGOS_POR_TANDA)) {
      const leidas = await leerTodoPaginado<{
        empresa_key: string;
        cuenta: string;
        cuenta_nombre: string | null;
      }>("mayor_lineas (nombres de cuenta)", (pedirCount, desde, hasta) =>
        supabaseServer
          .from("mayor_lineas")
          .select("empresa_key, cuenta, cuenta_nombre", pedirCount ? { count: "exact" } : {})
          .in("empresa_key", empresas as string[])
          .in("cuenta", tanda)
          .not("cuenta_nombre", "is", null)
          .order("id", { ascending: true })
          .range(desde, hasta),
      );
      for (const f of leidas) {
        if (!f.cuenta_nombre) continue;
        filas.push({ empresa_key: f.empresa_key, cuenta: f.cuenta, nombre: f.cuenta_nombre });
      }
    }
  } catch (e) {
    // Sin mayor (tabla ausente, lectura caída) se sigue sin respaldo: los
    // renglones sin nombre muestran el código, que es como se veían antes.
    if (!esTablaAusente(e)) console.error("[cuentas/leer] mayor_lineas:", e);
    return new Map();
  }

  return agrupar(filas);
}
