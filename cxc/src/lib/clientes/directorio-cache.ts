// ─────────────────────────────────────────────────────────────────────────────
// Caché en memoria del directorio de clientes del GRUPO.
//
// 🩸 POR QUÉ (3-ago-2026). `GET /api/clientes` leía DOS tablas COMPLETAS en
// cada llamada para devolver ~149 clientes:
//
//     clientes_master   5.062 filas vivas   → 6 viajes (páginas de 1.000)
//     switch_clientes   6.667 filas         → 7 viajes
//     ─────────────────────────────────────────────────────────────────
//     11.729 filas y 13 viajes a Supabase   POR LLAMADA
//
// El filtro de mundos (qué cliente es del grupo y cuál de Boston/Multifashion)
// se calcula en TypeScript, no en SQL, así que no se puede empujar a la base
// sin una migración. Pero el resultado **solo cambia cuando corre un sync o
// alguien edita una ficha** — no entre dos tecleos de la misma persona.
//
// ⚠️ EL COMENTARIO DEL ENDPOINT DECÍA "149 filas" Y ESO ERA FALSO. 149 es lo
// que queda DESPUÉS de filtrar por mundos, no el tamaño de la tabla. Con ese
// número la lectura completa parecía barata y por eso nadie la tocó. Medido
// contra producción: 5.062.
//
// ⚠️ ESTO ES CACHÉ POR INSTANCIA, no compartido. En serverless cada lambda
// tiene la suya, así que invalidar en una NO limpia las otras: tras editar un
// cliente, otra instancia puede seguir sirviendo lo viejo hasta que venza el
// TTL. Por eso el TTL es corto (60 s) en vez de horas — acota esa ventana a
// algo que una persona no llega a notar, sin depender de que la invalidación
// alcance a todos.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { mundosDeClientes, soloClientesDelGrupo } from "@/lib/clientes/mundos";
import { sinAusentesDeSwitch } from "@/lib/clientes/ausentes";

/** Ventana de frescura. Ver la nota de arriba sobre por qué es corta. */
export const TTL_MS = 60_000;

export interface FilaCliente {
  id: string;
  codigo: string | null;
  nombre: string | null;
  razon_social: string | null;
  telefono: string | null;
  celular: string | null;
  email: string | null;
  provincia: string | null;
  /** Ninguna de las 6 empresas lo manda ya en Switch (4-sep-2026). Los
   *  selectores no lo ofrecen; la ficha y las guías viejas lo siguen viendo.
   *  `null` = vivo. Ver `lib/clientes/ausentes`. */
  ausente_desde: string | null;
}

interface Entrada {
  expiraEn: number;
  datos: Promise<FilaCliente[]>;
}

// Clave = provincia (o "" para todas). La provincia se filtra en la base, así
// que cada una es una lectura distinta y no se puede compartir una sola lista.
const cache = new Map<string, Entrada>();

/** Limpia el caché. Se llama al escribir sobre un cliente. */
export function invalidarDirectorioServidor(): void {
  cache.clear();
}

async function leerDelaBase(provincia: string): Promise<FilaCliente[]> {
  // `ausente_desde` puede no existir todavía (migración 20260919120000, la
  // corre Daniel): el intento de respaldo va sin la columna y la mapea a null
  // — con la DDL pendiente TODO se sigue ofreciendo, igual que siempre.
  const leerMaster = async (conAusencia: boolean): Promise<FilaCliente[]> => {
    const filas = await leerTodoPaginado<FilaCliente>(
      "clientes_master (listado)",
      (pedirCount, from, to) => {
        let sel = supabaseServer
          .from("clientes_master")
          .select(
            "id, codigo, nombre, razon_social, telefono, celular, email, provincia" +
              (conAusencia ? ", ausente_desde" : ""),
            pedirCount ? { count: "exact" } : {},
          )
          .eq("deleted", false);
        if (provincia) sel = sel.eq("provincia", provincia);
        // Orden de PAGINACIÓN (estable y único), no el de presentación.
        return sel.order("id", { ascending: true }).range(from, to);
      },
    );
    return conAusencia ? filas : filas.map((f) => ({ ...f, ausente_desde: null }));
  };

  // ⚠️ LAS DOS LECTURAS VAN EN PARALELO, y no es cosmético: son 6 viajes
  // paginados a `clientes_master` y 7 a `switch_clientes`, y encadenadas suman
  // 13 esperas de red UNA DETRÁS DE OTRA. No dependen entre sí — el filtro de
  // mundos necesita las dos listas ya completas, no una para pedir la otra.
  const [filas, mundos] = await Promise.all([
    leerMaster(true).catch(() => leerMaster(false)),
    // El filtro de mundos va acá adentro para que TAMBIÉN quede cacheado: es la
    // mitad cara del trabajo (los 6.667 de switch_clientes).
    mundosDeClientes(),
  ]);
  return soloClientesDelGrupo(filas, mundos);
}

/**
 * 🚪 **LA PUERTA ÚNICA para "dame la lista de clientes".**
 *
 * Todo módulo que necesite clientes entra por acá y recibe SOLO los del grupo,
 * ya filtrados y sin truncar. Nadie tiene que acordarse de nada: la puerta
 * correcta es también la más cómoda, que es la única forma de que se use.
 *
 * 🩸 **Por qué existe (8-ago-2026).** Los dos selectores de "más usados"
 * armaban su propia consulta a `clientes_master`. El de Cheques la hacía **sin
 * paginar y sin `.order()`** con un comentario que afirmaba *"son 149 filas
 * vivas"*: son **5.062**, así que PostgREST devolvía **1.000 EN SILENCIO**.
 * Medido contra producción: **64 de los 146 clientes del grupo eran
 * inofrecibles**, incluido *"Jerusalem De Panamá"* — que es el cliente de
 * **11 de los 19 cheques** y por lo tanto el que SIEMPRE debió encabezar sus
 * propios chips. Además ninguno de los dos filtraba por mundo, así que un
 * nombre compartido con Boston (hay 10) podía resolver a un código de Boston.
 *
 * Los clientes de Boston y de Multifashion se piden por SU puerta
 * (`EMPRESA_CARTERA_BOSTON` / `EMPRESA_MOSTRADOR_MULTIFASHION` en
 * `lib/clientes/mundos`), nunca por esta.
 *
 * Los clientes del grupo, ya filtrados. Sirve del caché mientras esté fresco.
 *
 * Se cachea la PROMESA, no el resultado: si llegan tres pedidos a la vez con el
 * caché vencido, los tres esperan la MISMA lectura en vez de disparar tres. Un
 * fallo borra la entrada para que el próximo intento vuelva a probar en vez de
 * quedar envenenada por 60 s.
 *
 * 🔑 EL DEFAULT ES "SOLO LO QUE SE PUEDE OFRECER" (4-sep-2026, aprobado por
 * Daniel): un cliente que Switch dejó de mandar en las 6 empresas
 * (`ausente_desde` puesto) NO sale por acá — así los selectores, los chips de
 * "más usados" y el candado de atar dejan de ofrecerlo sin que cada caller
 * tenga que acordarse. Quien necesite el directorio ENTERO (la lista de
 * /clientes, el mapa código→nombre de las guías viejas) lo pide con
 * `{ incluirAusentes: true }` — pedir de más es una decisión escrita, no un
 * olvido.
 */
export function leerClientesDelGrupo(
  provincia = "",
  opts?: { incluirAusentes?: boolean },
): Promise<FilaCliente[]> {
  const ahora = Date.now();
  const hit = cache.get(provincia);
  const datos =
    hit && hit.expiraEn > ahora
      ? hit.datos
      : (() => {
          const nuevos = leerDelaBase(provincia).catch((e) => {
            cache.delete(provincia);
            throw e;
          });
          cache.set(provincia, { expiraEn: ahora + TTL_MS, datos: nuevos });
          return nuevos;
        })();

  if (opts?.incluirAusentes) return datos;
  // `filter` devuelve un array NUEVO: el caché nunca se muta desde afuera.
  return datos.then(sinAusentesDeSwitch);
}
