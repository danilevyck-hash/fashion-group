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
  const filas = await leerTodoPaginado<FilaCliente>(
    "clientes_master (listado)",
    (pedirCount, from, to) => {
      let sel = supabaseServer
        .from("clientes_master")
        .select(
          "id, codigo, nombre, razon_social, telefono, celular, email, provincia",
          pedirCount ? { count: "exact" } : {},
        )
        .eq("deleted", false);
      if (provincia) sel = sel.eq("provincia", provincia);
      // Orden de PAGINACIÓN (estable y único), no el de presentación.
      return sel.order("id", { ascending: true }).range(from, to);
    },
  );
  // El filtro de mundos va acá adentro para que TAMBIÉN quede cacheado: es la
  // mitad cara del trabajo (los 6.667 de switch_clientes).
  return soloClientesDelGrupo(filas, await mundosDeClientes());
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
 */
export function leerClientesDelGrupo(provincia = ""): Promise<FilaCliente[]> {
  const ahora = Date.now();
  const hit = cache.get(provincia);
  if (hit && hit.expiraEn > ahora) return hit.datos;

  const datos = leerDelaBase(provincia).catch((e) => {
    cache.delete(provincia);
    throw e;
  });
  cache.set(provincia, { expiraEn: ahora + TTL_MS, datos });
  return datos;
}
