// ─────────────────────────────────────────────────────────────────────────────
// LOS TRES MUNDOS DE CLIENTES — LA ÚNICA FUENTE DE VERDAD.
//
// ── 🩸 LA REGLA, cerrada con Daniel (30-jul-2026) ───────────────────────────
//
// Textual: *"los clientes de multifashion q vivan solo en el modulo de
// multifashion. en cxc de boston que este como hoy en dia, solo viven ahi. los
// de las otras empresas q si son un grupo, que conviva en todos lados"*.
//
//   MUNDO           clientes   sus clientes se listan SOLO en
//   ───────────────────────────────────────────────────────────────────────────
//   Grupo (6)            145    todos lados: Directorio, CXC, Guías, Ventas…
//   Boston             4.883    la pestaña CXC › Boston
//   Multifashion         857    el módulo Multifashion
//
// Y la frase que ordena todo lo demás: *"sus ventas suman, pero sus clientes no
// se ven"*. **LA PLATA DE LOS TRES MUNDOS SIGUE CONTANDO** en Ventas y en Vista
// General. Lo único que se va son las LISTAS de clientes. Si un total cambia,
// el cambio está mal.
//
// ── EL GRUPO SE DEFINE POR INCLUSIÓN, NO POR EXCLUSIÓN ──────────────────────
//
// Se listan las 6 que SÍ conviven, no las 2 que no. Es a propósito: si mañana
// entra una empresa nueva al sistema, el default seguro es que **no contamine**
// el Directorio hasta que alguien la agregue acá a mano. Al revés (excluir dos)
// una empresa nueva aparecería en todos lados sin que nadie lo decida.
//
// Mismo espíritu que `EMPRESA_SYNC_CAPABILITIES` en `switch-api/empresas.ts`:
// una sola lista con nombre y motivo, no un `!==` suelto repartido por las
// consultas — así fue como este repo se quemó antes, con listas que se
// contradecían en silencio.
//
// ── 🔴 SI NO SE PUEDE DETERMINAR EL MUNDO, EL CLIENTE SE QUEDA ──────────────
//
// La pertenencia se deriva de `switch_clientes` (par empresa↔código). Hay 4
// clientes de `clientes_master` sin fila ahí, y mirarlos uno por uno mostró por
// qué el default importa — **3 de los 4 son del grupo con el código desfasado**:
//
//   D-173  Metro Shoes Panama      → en Switch es D-103 en las 6 del grupo
//   D-200  City Mall               → en Switch es D-25/D-24 en las 6 del grupo
//   D-101  El Machetazo S.M.       → en Switch es D-171 en active_wear
//   D-201  American Classics       → solo confecciones_boston (ese sí es Boston)
//
// Un default "si no lo encuentro, lo escondo" borraría 3 clientes reales del
// grupo del Directorio, de Guías y de todos los selectores. Mostrar 1 cliente
// de Boston de más es ruido; esconder 3 buenos es un módulo roto. El arreglo de
// fondo es corregirles el código en el panel de Switch, no adivinar por nombre.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import type { EmpresaKey } from "@/lib/empresa-mapping";

/**
 * Las 6 empresas que forman "el grupo": sus clientes conviven en todo el
 * sistema. Cualquier empresa que NO esté acá tiene sus clientes confinados a su
 * propio módulo (Boston → CXC › Boston, Multifashion → módulo Multifashion).
 */
export const EMPRESAS_DEL_GRUPO: readonly EmpresaKey[] = [
  "vistana",
  "fashion_wear",
  "fashion_shoes",
  "active_shoes",
  "active_wear",
  "joystep",
] as const;

const GRUPO = new Set<string>(EMPRESAS_DEL_GRUPO);

/** ¿Esta empresa comparte sus clientes con el resto del sistema? */
export function esEmpresaDelGrupo(empresa: string | null | undefined): boolean {
  return !!empresa && GRUPO.has(empresa);
}

// ─────────────────────────────────────────────────────────────────────────────
// LAS DOS PUERTAS DE AL LADO — Boston y Multifashion se siguen leyendo, pero
// NUNCA por la misma puerta que "la lista de clientes".
//
// Daniel, textual: *"clientes de boston solo quiero verlos solo en su tab.
// igual que multifashion. esos no deben de convivir con el resto del sistema"*.
//
// Se nombran acá para que pedirlos sea una decisión ESCRITA y no un `.eq()`
// suelto que alguien copió de otra consulta. Quien lea `EMPRESA_CARTERA_BOSTON`
// está diciendo "quiero Boston"; quien lea `EMPRESAS_DEL_GRUPO` está diciendo
// "quiero clientes". No hay una tercera forma cómoda de pedir "todos juntos",
// y esa ausencia es el diseño.
// ─────────────────────────────────────────────────────────────────────────────

/** La pestaña CXC › Boston, y nada más. */
export const EMPRESA_CARTERA_BOSTON = "confecciones_boston" as const;

/** El módulo Multifashion, y nada más. */
export const EMPRESA_MOSTRADOR_MULTIFASHION = "american_classic" as const;

/**
 * El código de cliente del grupo tiene la forma `D-<número>`.
 *
 * 🩸 **NO es una llave global, y por eso este predicado NO alcanza solo.**
 * Medido contra producción el 8-ago-2026: cada empresa de Switch lleva su
 * PROPIA numeración, así que el mismo `D-XXX` puede nombrar a dos clientes
 * distintos en dos empresas. Ejemplo real: `D-170` es *"Nova Lux, S.A."* en
 * cinco empresas y *"El Machetazo-Calidonia"* en `active_wear`.
 *
 * Por eso el criterio de "es cliente" son las DOS cosas juntas — tener código
 * D-XXX **y** pertenecer a alguna de las 6 —, que es exactamente lo que hace
 * `soloClientesDelGrupo` con los conjuntos de `mundosDeClientes()`.
 *
 * Boston y Multifashion usan códigos NUMÉRICOS pelados (`181`, `12188`,
 * `111380`) y el mostrador usa `TCKCTA`: ninguno pasa este predicado.
 */
export function esCodigoDeCliente(codigo: string | null | undefined): boolean {
  return /^D-\d+$/i.test((codigo ?? "").trim());
}

/**
 * El pseudo-cliente de mostrador. La identidad es el CÓDIGO, nunca el nombre:
 * se llama "Contado" en active_shoes/active_wear/joystep, "VENTAS" en
 * fashion_wear/vistana y "VENTAS LOCA" en fashion_shoes (medido). Comparar por
 * nombre sería un colador — es la misma regla que ya aplican las RPC de
 * comisión y el checkout público.
 *
 * La definición se mudó a `./mostrador` —dos líneas puras, sin Supabase— para
 * que una PANTALLA pueda usarla sin arrastrar el cliente de servidor que este
 * archivo importa. Se re-exporta acá para que siga habiendo una sola puerta:
 * quien ya lo importaba de `mundos` no cambia nada.
 */
export { CODIGO_MOSTRADOR, esMostrador } from "./mostrador";

/** Lo que hace falta para clasificar: qué códigos son del grupo y cuáles conoce
 *  Switch. Se leen JUNTOS porque salen de la misma tabla — dos consultas al
 *  mismo lugar es la forma de que un día se contradigan. */
export interface MundosDeClientes {
  /** Códigos que le compran a alguna de las 6 del grupo. */
  grupo: Set<string>;
  /** Todos los códigos que Switch conoce, de cualquier empresa. */
  conocidos: Set<string>;
}

/**
 * Lee `switch_clientes` una sola vez y arma los dos conjuntos.
 *
 * ⚠️ `leerTodoPaginado` no es opcional: la tabla tiene 6.634 filas y
 * **PostgREST corta en 1.000 EN SILENCIO**. Truncada, empresas enteras del
 * grupo desaparecerían y sus clientes se volverían invisibles de golpe.
 *
 * Devuelve `null` si falla: quien llame MUESTRA TODO en ese caso (ver el bloque
 * de arriba — esconder de más es peor que mostrar de más).
 */
export async function mundosDeClientes(): Promise<MundosDeClientes | null> {
  try {
    const filas = await leerTodoPaginado<{ empresa_key: string; codigo: string | null }>(
      "switch_clientes (mundos de clientes)",
      (pedirCount, from, to) =>
        supabaseServer
          .from("switch_clientes")
          .select("empresa_key, codigo", pedirCount ? { count: "exact" } : {})
          .order("id", { ascending: true })
          .range(from, to)
    );
    const grupo = new Set<string>();
    const conocidos = new Set<string>();
    for (const f of filas) {
      if (!f.codigo) continue;
      const cod = f.codigo.trim();
      conocidos.add(cod);
      if (esEmpresaDelGrupo(f.empresa_key)) grupo.add(cod);
    }
    return { grupo, conocidos };
  } catch {
    return null;
  }
}

/**
 * Deja solo los clientes que se listan en todo el sistema.
 *
 * `mundos === null` (la consulta falló) devuelve la lista intacta. Y un cliente
 * cuyo código no aparece en `switch_clientes` TAMBIÉN se queda: son los 4 del
 * comentario de arriba, 3 de los cuales son del grupo con el código viejo.
 */
/**
 * ¿ESTE código, uno solo, es de un cliente del grupo?
 *
 * La misma regla que `soloClientesDelGrupo`, pero para cuando ya se sabe el
 * código y leer los 6.800 pares de `switch_clientes` para juzgar UNA ficha sería
 * absurdo: acá va una consulta indexada por `codigo`.
 *
 * 🩸 POR QUÉ EXISTE (2-sep-2026). `/api/clientes/[codigo]` SERVÍA Y DEJABA
 * EDITAR las 4.915 fichas de Boston que se habían colado en `clientes_master`:
 * el GET y el PATCH solo miraban `deleted = false`, y ni uno ni otro pasaba por
 * `soloClientesDelGrupo` — la única que filtraba era la página SSR. Daniel:
 * *"la ficha de cliente por dirección se va. El directorio por dentro se va."*
 * Marcar esas filas como borradas cerró la puerta HOY; esto la cierra SIEMPRE,
 * incluso si mañana alguien las revive o un sync las vuelve a traer.
 *
 * Los tres defaults son los mismos de `soloClientesDelGrupo`, y los tres dicen
 * "se queda" — **esconder de más es peor que mostrar de más**:
 *   · la consulta falló  → se queda (fail-open)
 *   · sin código         → se queda
 *   · Switch no lo conoce → se queda (D-201, D-173, D-101)
 */
export async function esCodigoDelGrupo(codigo: string | null | undefined): Promise<boolean> {
  const cod = (codigo ?? "").trim();
  if (!cod) return true;
  const { data, error } = await supabaseServer
    .from("switch_clientes")
    .select("empresa_key")
    .eq("codigo", cod);
  if (error || !data) return true;          // fail-open, igual que mundos === null
  if (data.length === 0) return true;       // Switch no lo conoce: se queda
  return data.some((f) => esEmpresaDelGrupo(f.empresa_key));
}

export function soloClientesDelGrupo<T extends { codigo: string | null }>(
  clientes: T[],
  mundos: MundosDeClientes | null
): T[] {
  if (!mundos) return clientes;
  return clientes.filter((c) => {
    const cod = (c.codigo ?? "").trim();
    if (!cod) return true;                        // sin código: no se puede juzgar
    if (mundos.grupo.has(cod)) return true;       // es del grupo
    if (!mundos.conocidos.has(cod)) return true;  // sin rastro: se queda (los 4)
    return false;                                 // Boston o Multifashion
  });
}
