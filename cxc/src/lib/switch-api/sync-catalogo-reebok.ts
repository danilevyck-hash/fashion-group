// Sync del catálogo Reebok (tabla `products`) desde Switch. Wrapper delgado sobre
// el motor parametrizado `syncCatalogo` — la lógica (existencia/fail-safe/auto-add/
// nunca-sobreescribir-foto) vive en `./sync-catalogo`.
//
// Reebok vive 100% en active_shoes (Daniel movió todo desde active_wear; active_wear
// pasó a Karl Lagerfeld/KL, excluido por el filtro). UNA sola entrada que lee las 3
// categorías y matchea por SKU → cada artículo se matchea o inserta una vez.
//
// FILTRO PROVEEDOR: solo el distribuidor Reebok (Latin Fitness Group), excluyendo
// códigos "KL*" (Karl Lagerfeld, mismo proveedor pero NO Reebok). Si un producto
// ya publicado SALE del filtro (p.ej. pasa a proveedor KL), el motor lo oculta en
// el siguiente run (regla 5 de sync-catalogo) — no queda huérfano publicado.
//
// ═══ 🩸 LA CLASIFICACIÓN SE INVENTABA (arreglado el 2-sep-2026) ══════════════
//
// Este archivo decía `defaultCategory: "footwear"` y no escribía `gender` nunca,
// así que el DEFAULT de la columna ponía `male`. Resultado medido contra
// producción: **173 de 173 altas desde el 24-jun quedaron `male`**, 107 de ellas
// en una sola corrida del 1-sep. Los filtros del catálogo leen exactamente esas
// dos columnas, así que las dos pantallas —el catálogo público y el del
// vendedor— mostraban todo el surtido nuevo bajo "Hombre" y bajo "Calzado".
//
// 🩸 **NO ERA UN VALOR RARO: ERA UNA MENTIRA BIEN FORMADA.** `footwear` y `male`
// son dos valores válidos, así que ningún centinela de "valores desconocidos"
// podía cazarlo. La regla general que sale de acá está escrita en
// `reebok-clasificacion.ts` y tiene su candado: **un cajón por defecto nunca
// puede ser el primero de la lista.**
//
// Ahora la clasificación **la manda Switch** (`rubro` = categoría, `subrubro` =
// género — ver el mapa, que es POR MARCA y no se comparte) y llega por
// `switch_articulo_info`, que el cron `sync-articulo-info` llena todas las
// noches. Este sync NO le pide nada nuevo a Switch: lee una tabla.
//
// ⚠️ `categories: []` — LEE TODA LA TABLA, y eso es load-bearing. Antes leía
// `["apparel","accessories","footwear"]`; con el cajón neutro `otros` en juego,
// ese filtro habría dejado FUERA de la consulta a todo producto sin clasificar
// y el motor lo habría tratado como inexistente: lo re-insertaría duplicado o lo
// dejaría huérfano y oculto. `products` es 100% Reebok (391 filas, medido el
// 2-sep-2026), así que leerla entera es correcto y es lo que ya hacen las otras
// tres marcas.

import { syncCatalogo, type CatalogoSyncResult } from "./sync-catalogo";
import { reebokServer } from "@/lib/reebok-supabase-server";
import type { SwitchArticulo } from "./client";
import {
  clasificacionDeArticulo,
  CATEGORIA_SIN_CLASIFICAR,
  GENERO_SIN_CLASIFICAR,
  type FichaSwitch,
} from "@/lib/reebok-clasificacion";
import {
  agruparSinClasificar,
  detallesDeClasificacion,
  avisarClasificacionDesconocida,
} from "@/lib/catalogos/clasificacion-aviso";

const REEBOK_EMPRESA = "active_shoes";

const EMPRESAS = [
  // categories: [] = leer TODA la tabla (ver la nota de la cabecera).
  { empresaKey: REEBOK_EMPRESA, categories: [] as const, defaultCategory: CATEGORIA_SIN_CLASIFICAR },
] as const;

const REEBOK_PROVEEDOR = "LATIN FITNESS GROUP";

/** Un artículo entra al catálogo Reebok SOLO si su proveedor es Latin Fitness
 *  Group Y su código NO empieza con "KL" (case-insensitive). */
function isReebokArticulo(a: SwitchArticulo): boolean {
  const proveedor = (a.proveedor ?? "").trim().toUpperCase();
  if (proveedor !== REEBOK_PROVEEDOR) return false;
  const codigo = (a.codigo ?? "").trim().toUpperCase();
  if (codigo.startsWith("KL")) return false;
  return true;
}

/**
 * Las fichas de Switch guardadas, por código.
 *
 * Es UNA consulta a una tabla del proyecto principal, no una llamada a Switch:
 * el sync del catálogo corre 4×/día y no puede permitirse pedir cientos de
 * fichas cada vez. Quien las trae es `sync-articulo-info` (1×/día, 04:50 UTC),
 * que las pide de a una y solo a quien todavía no la tiene.
 *
 * 🔴 DEVUELVE UN MAPA VACÍO ANTE CUALQUIER PROBLEMA, y eso es deliberado: sin
 * fichas, `clasificacionDeArticulo` conserva lo que cada producto ya tiene y los
 * nuevos entran al cajón neutro. Nunca reclasifica a ciegas. Cubre también el
 * período pre-DDL en el que las columnas todavía no existen.
 *
 * 🩸 **SE LEE `ficha_at` Y VIAJA HASTA EL MÓDULO PURO.** No se filtra acá con un
 * `.not("ficha_at","is",null)`, y no es un descuido: la fila de
 * `switch_articulo_info` la crea el barrido de PRECIOS, mucho antes de que
 * alguien le pida la ficha a Switch, así que una fila con los tres campos en
 * NULL existe y es NORMAL. Confundirla con "Switch mandó una ficha vacía" es lo
 * que produjo la falsa alarma de las 233 del 2-sep-2026 (el bloque completo está
 * en `reebok-clasificacion.ts`, arriba de `fichaLlego`). La distinción se hace
 * en UN solo lugar —el módulo puro— para que el candado la pruebe sin base y
 * para que ningún lector futuro de fichas se olvide de repetir el filtro.
 */
export async function cargarFichas(empresaKey: string): Promise<Map<string, FichaSwitch>> {
  const fichas = new Map<string, FichaSwitch>();
  try {
    // Import DINÁMICO, por la misma razón que `catalogo/marcas.ts` resuelve sus
    // clients de forma lazy: importar este módulo NUNCA puede construir un
    // cliente de Supabase. El arnés de paridad mockea los clients por archivo de
    // test, y un import eager arrastraría el client real (sin env → throw) a
    // tests que no tienen por qué saber que este sync lee una tabla más.
    const { supabaseServer } = await import("@/lib/supabase-server");
    // `leerTodoPaginado` no hace falta: son ~1.800 filas de UNA empresa y el
    // tope de PostgREST son 1.000, así que se pagina a mano con orden estable.
    for (let p = 0; p < 20; p++) {
      const { data, error } = await supabaseServer
        .from("switch_articulo_info")
        .select("codigo, rubro, subrubro, marca, ficha_at")
        .eq("empresa_key", empresaKey)
        .order("codigo", { ascending: true })
        .range(p * 1000, p * 1000 + 999);
      if (error) {
        console.error(`[catalogo_reebok] no pude leer las fichas de ${empresaKey}: ${error.message}`);
        return new Map();
      }
      const lote = data ?? [];
      for (const r of lote as unknown as Array<{ codigo: string; rubro: string | null; subrubro: string | null; marca: string | null; ficha_at: string | null }>) {
        if (!r.codigo) continue;
        fichas.set(String(r.codigo).trim(), {
          rubro: r.rubro, subrubro: r.subrubro, marca: r.marca,
          // 🔴 Sin esto, una fila a la que nunca se le pidió la ficha se lee como
          // una ficha vacía y AVISA. Ver el encabezado de esta función.
          ficha_at: r.ficha_at,
        });
      }
      if (lote.length < 1000) break;
    }
  } catch (e) {
    console.error(`[catalogo_reebok] no pude leer las fichas de ${empresaKey}: ${String(e)}`);
    return new Map();
  }
  return fichas;
}

export async function syncCatalogoReebok(
  opts: { dryRun?: boolean; triggeredBy?: "cron" | "manual" | "backfill" } = {},
): Promise<CatalogoSyncResult> {
  const fichas = await cargarFichas(REEBOK_EMPRESA);

  // Lo que Switch mandó y el mapa no supo traducir, juntado a lo largo de la
  // corrida. Se avisa UNA vez al cerrar la empresa, no producto por producto.
  const desconocidos: Array<{ sku: string; campo: "rubro" | "subrubro" | "marca"; valor: string }> = [];

  /** La clasificación de un artículo + el registro de lo que no se entendió.
   *
   *  El NOMBRE que se pasa es la `descripcion` de Switch, con el nombre guardado
   *  como respaldo si Switch no mandó ninguna — es el mismo nombre que el motor
   *  termina escribiendo (`nameFinal`) y el mismo que el cliente ve en la
   *  tarjeta. 🔴 Solo se usa para desempatar un `subrubro = UNISEX`; ver
   *  `generoReebok`. */
  const clasificar = (a: SwitchArticulo, guardado: { category?: unknown; gender?: unknown; name?: unknown }) => {
    const nombre = (a.descripcion ?? "").trim() || (typeof guardado.name === "string" ? guardado.name : null);
    const c = clasificacionDeArticulo(fichas.get(String(a.codigo).trim()), nombre, {
      category: typeof guardado.category === "string" ? guardado.category : null,
      gender: typeof guardado.gender === "string" ? guardado.gender : null,
    });
    for (const d of c.desconocidos) desconocidos.push({ sku: String(a.codigo), ...d });
    return { category: c.category, gender: c.gender };
  };

  return syncCatalogo({
    db: reebokServer,
    marca: "reebok",
    syncLogType: "catalogo_reebok",
    productsTable: "products",
    empresas: EMPRESAS,
    articuloFilter: isReebokArticulo,
    inventoryTable: "inventory",
    stockFields: (existencia, disponibilidad) => ({ existencia, disponibilidad }),
    // Las columnas que el UPDATE escribe además de price/name/active, para poder
    // comparar antes de escribir (misma consulta, sin lecturas nuevas).
    // `category`/`gender` entran acá desde el 2-sep-2026: sin declararlas, esas
    // dos columnas se escribirían en TODAS las corridas de TODOS los productos.
    columnasEscritas: ["existencia", "disponibilidad", "codigo_barra_id", "category", "gender"],
    // Persistir el codigoBarraId de Switch (backfill llega solo con cada corrida del cron).
    articuloFields: (a) => ({ codigo_barra_id: a.codigoBarraId ?? null }),
    // El INSERT arranca en el cajón neutro; `derive.insertFields` lo pisa con la
    // clasificación real si la ficha ya está. 🔴 El `gender` explícito es lo que
    // corrige el bug HOY, sin esperar a que corra la migración que quita el
    // DEFAULT: un valor explícito siempre gana sobre el default de la columna.
    insertExtras: { on_sale: false, gender: GENERO_SIN_CLASIFICAR },
    derive: {
      insertFields: (a) => clasificar(a, {}),
      // 🔴 SE REFRESCA EN CADA CORRIDA, igual que en Tommy y Calvin: la
      // clasificación no es un campo manual, es lo que dice Switch. Y un "no sé"
      // NUNCA pisa lo que ya está clasificado — esa regla vive en
      // `clasificacionDeArticulo` y es la que protege el bulto (y la plata).
      updateFields: (a, existing) => clasificar(a, existing),
    },
    alCerrarEmpresa: async ({ empresaKey, logId, dryRun }) => {
      const valores = agruparSinClasificar(desconocidos);
      if (valores.length === 0) return [];
      console.warn(
        `[catalogo_reebok ${empresaKey}] ${valores.length} valor(es) de clasificación que Switch manda y el ` +
          `catálogo no conoce: ${valores.map((v) => `${v.campo}="${v.valor}" (${v.skus.length})`).join(", ")}`,
      );
      // Un dry-run no escribe ni avisa: mide.
      if (!dryRun) {
        await avisarClasificacionDesconocida({
          empresaKey,
          syncType: "catalogo_reebok",
          marca: "Reebok",
          valores,
          logId,
        });
      }
      return detallesDeClasificacion(valores);
    },
  }, opts);
}

export type { CatalogoSyncResult, CatalogoSyncResultEmpresa } from "./sync-catalogo";
