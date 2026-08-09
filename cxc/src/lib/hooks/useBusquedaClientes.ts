"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Búsqueda de clientes para el selector de Guías y el typeahead de Marketing.
//
// 🩸 POR QUÉ SE REESCRIBIÓ (3-ago-2026). Daniel: *"no me gusta que demore en
// buscar"*. Antes cada pausa de tecleo salía a la red y el endpoint, para
// responder, **leía la tabla `clientes_master` ENTERA** —5.063 filas, paginadas
// de a 1.000— y recién después la achicaba al grupo (~150) y filtraba. O sea:
// escribir "city mall" disparaba varias lecturas completas de la tabla, una
// tanda por cada letra que uno dejaba de teclear. El debounce de 250 ms no era
// el problema: era el trabajo que había del otro lado.
//
// LA IDEA: el universo que este buscador puede devolver es CHICO y no cambia
// mientras alguien escribe. Se trae UNA vez, se guarda en memoria y se filtra
// en el navegador → resultados instantáneos y cero red por tecla.
//
// ⚠️ EL MISMO MATCHER QUE EL SERVIDOR. Se importa `coincideBusqueda` (módulo
// PURO, sin imports, el mismo que usa el endpoint) en vez de escribir un
// `includes` a mano. Si acá se filtrara distinto, el usuario vería resultados
// distintos según si el caché cargó o no — un bug imposible de reproducir. Ese
// módulo es el que hace que "multifashion" encuentre a "Multi Fashion Holding".
//
// ⚠️ FALLBACK OBLIGATORIO. Si el universo no entrara completo en una sola
// lectura, filtrar local mostraría resultados INCOMPLETOS sin avisar — que es
// el bug de `db-max-rows` que este repo ya pagó una vez. Por eso se compara
// `total` contra lo recibido y, si no cuadra, se vuelve al comportamiento de
// antes (una consulta al servidor por búsqueda). Nunca se adivina.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { coincideBusqueda } from "@/lib/buscar-normalizado";
import { camposDeBusquedaCliente, nombreParaMostrar } from "@/lib/clientes/nombre-display";

export interface ClienteHit {
  codigo: string;
  nombre: string;
  razon_social?: string | null;
}

/** Tope que acepta el endpoint. El universo del grupo está muy por debajo. */
const TOPE_ENDPOINT = 200;

/** Cuántas sugerencias se muestran (igual que antes). */
const MAX_SUGERENCIAS = 8;

type Directorio =
  | { completo: true; clientes: ClienteHit[] }
  /** No entró entero: hay que preguntarle al servidor cada vez. */
  | { completo: false; clientes: null };

// Caché a nivel de MÓDULO, no de componente: la guía tiene una fila por
// producto y cada una monta su propio selector. Con caché por componente, abrir
// una guía de 10 líneas dispararía 10 lecturas idénticas.
let cache: Promise<Directorio> | null = null;

/** Para llamar al crear un cliente nuevo, y que aparezca sin recargar la página. */
export function invalidarDirectorioClientes(): void {
  cache = null;
}

async function cargarDirectorio(): Promise<Directorio> {
  const res = await fetch(`/api/clientes?limit=${TOPE_ENDPOINT}`, { cache: "no-store" });
  if (!res.ok) throw new Error("no se pudo leer el directorio");
  const data = (await res.json()) as { clientes?: ClienteHit[]; total?: number };
  const clientes = Array.isArray(data.clientes) ? data.clientes : [];
  const total = typeof data.total === "number" ? data.total : clientes.length;
  // Esta comparación es la que evita mostrar una lista recortada como completa.
  if (clientes.length < total) return { completo: false, clientes: null };
  return { completo: true, clientes };
}

function obtenerDirectorio(): Promise<Directorio> {
  if (!cache) {
    cache = cargarDirectorio().catch((e) => {
      // Un fallo no puede envenenar el caché para toda la sesión: se limpia
      // para que el próximo intento vuelva a probar, y mientras tanto se
      // degrada al servidor.
      cache = null;
      throw e;
    });
  }
  return cache;
}

function filtrar(clientes: readonly ClienteHit[], q: string): ClienteHit[] {
  return clientes
    .filter((c) => coincideBusqueda(q, camposDeBusquedaCliente(c)))
    .slice(0, MAX_SUGERENCIAS);
}

/**
 * Mapa `D-XXX → cómo se llama` para poder mostrar el NOMBRE junto al código.
 *
 * 🩸 Un chip que dice `D-108` y nada más no le sirve a nadie. El nombre no
 * viaja en la línea de guía (ahí solo se guarda el código), así que hay que
 * traerlo del directorio.
 *
 * **Reusa el MISMO caché de módulo que el selector**: si alguien ya abrió un
 * `ClientePicker` en la pantalla, esto no toca la red. Y el nombre pasa por
 * `nombreParaMostrar`, así que el chip y la lista del selector dicen lo mismo.
 *
 * Degrada en silencio: si el directorio no se puede leer o vino RECORTADO
 * (`completo: false`), devuelve un mapa vacío y quien lo use muestra solo el
 * código. Nunca muestra un nombre a medias ni inventa uno.
 */
export function useNombresDeClientes(activa: boolean): ReadonlyMap<string, string> {
  const [nombres, setNombres] = useState<ReadonlyMap<string, string>>(() => new Map());

  useEffect(() => {
    if (!activa) return;
    let cancel = false;
    void (async () => {
      try {
        const dir = await obtenerDirectorio();
        if (cancel || !dir.completo) return;
        const m = new Map<string, string>();
        for (const c of dir.clientes) {
          const cod = (c.codigo ?? "").trim();
          const nombre = nombreParaMostrar(cod, c.nombre);
          if (cod && nombre) m.set(cod.toUpperCase(), nombre);
        }
        setNombres(m);
      } catch {
        /* sin nombres: se muestra el código pelado, que es lo de antes */
      }
    })();
    return () => {
      cancel = true;
    };
  }, [activa]);

  return nombres;
}

/**
 * @param query    lo que el usuario está escribiendo
 * @param activa   false = no buscar (dropdown cerrado). Evita pedir por pedir.
 */
export function useBusquedaClientes(query: string, activa: boolean) {
  const [hits, setHits] = useState<ClienteHit[]>([]);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (!activa || q.length < 2) {
      setHits([]);
      setCargando(false);
      return;
    }
    let cancel = false;
    setCargando(true);

    void (async () => {
      // Camino rápido: el directorio ya está en memoria → sin red, sin espera.
      try {
        const dir = await obtenerDirectorio();
        if (cancel) return;
        if (dir.completo) {
          setHits(filtrar(dir.clientes, q));
          setCargando(false);
          return;
        }
      } catch {
        // Cae al fallback de abajo.
      }
      if (cancel) return;

      // Fallback: el comportamiento de siempre, una consulta por búsqueda.
      try {
        const res = await fetch(
          `/api/clientes?q=${encodeURIComponent(q)}&limit=${MAX_SUGERENCIAS}`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { clientes?: ClienteHit[] };
        if (!cancel) setHits(Array.isArray(data.clientes) ? data.clientes : []);
      } catch {
        if (!cancel) setHits([]);
      } finally {
        if (!cancel) setCargando(false);
      }
    })();

    return () => {
      cancel = true;
    };
  }, [query, activa]);

  return { hits, cargando };
}
