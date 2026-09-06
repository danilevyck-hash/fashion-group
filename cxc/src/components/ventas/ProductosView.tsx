"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Download, Search, ChevronRight } from "lucide-react";
import { SkeletonTable } from "@/components/ui";
import { MONTHS, fmtMoney } from "@/lib/ventas/format";
import { TiraOrden } from "./ChipOrden";
import SyncNowButton from "@/components/shared/SyncNowButton";
import { SYNC_NOW_VENTAS_SECUENCIA } from "@/components/shared/syncNowOpciones";
import { nombreCortoEmpresa } from "@/lib/empresa-mapping";
import { dejoDeVenderse, totalDejadoDeVender, type DejadoDeVender } from "@/lib/ventas/productos-dejados";
import { variacionPct } from "@/lib/variacion";
import {
  fmtParticipacion,
  participacion,
  totalDeClientes,
  type ClienteDeProducto,
} from "@/lib/ventas/productos-clientes";
import {
  claveCliente,
  clientesDelPeriodo,
  comprasDe,
  dejoDeComprar,
  totalDeCompras,
  type CompraDelCliente,
  type DejadoDeComprar,
  type FilaPorCliente,
} from "@/lib/ventas/productos-por-cliente";
import {
  PRODUCTOS_EMPRESAS,
  PRODUCTOS_EMPRESA_KEYS,
  DEFAULT_PRODUCTOS_EMPRESA,
  esProductosPeriodo,
  fmtMargen,
  fmtPrecioProm,
  precioPromedio,
  periodoLabel,
  exportProductosToExcel,
  type ProductosResponse,
  type ProductoNivel1,
  type ProductoCodigo,
  type ProductosPeriodo,
} from "@/lib/ventas/productos";

// "precio" NO es una columna de la RPC: sale de venta ÷ cantidad. Por eso el
// orden pasa por `valorOrden` y no por `p[sort.key]` — indexar un campo que no
// existe daba `undefined` y la tabla quedaba en el orden que venía, sin avisar.
type SortKey = "cantidad" | "venta" | "precio" | "margen";

/** Las dos cosas que se ven ADENTRO de una descripción. */
type DrillTab = "clientes" | "codigos";

// ⛔ ACÁ VIVÍA `const PAGE = 20` Y SU «Mostrar más». Se retiró el 5-sep-2026.
// Daniel: *«no me gusta tener que andar poniendo mas clientes abajo, ni
// productos, se deben de ver todo en una sola lista»*. Mostraba 20 de 140 —
// una lista chica que cabe entera con scroll, y entera se puede buscar con ⌘F,
// que era justo lo que la paginación rompía.

// ─────────────────────────────────────────────────────────────────────────────
// EL FILTRO POR CLIENTE — el camino inverso del #591.
//
// El #591 dejó "descripción → clientes". Esto es la vuelta: se elige un cliente
// y TODA la tabla contesta *"¿qué me compra más éste?"*.
//
// 🔴 ES UN FILTRO, NO UN SELECTOR DE CLIENTE. La diferencia la fija el candado
// `src/__tests__/un-solo-selector-de-cliente.test.ts` con todas las letras:
// *"«Elegir» no es «buscar»: un buscador que solo FILTRA una lista que ya está
// en pantalla no ata a nadie a ningún registro"*. Acá no se guarda un cliente en
// ningún registro, no se consulta ningún directorio y las opciones NO salen de
// una búsqueda: son exactamente los clientes que ya vinieron en la respuesta de
// este período. Delegar en `ClienteSwitchPicker` sería peor y no mejor —
// ofrecería clientes de Switch que no compraron nada acá, o sea un filtro que
// devuelve la tabla vacía sin decir por qué. Es la misma categoría que los
// filtros de reporte de Marketing, y el barrido no lo marca (se verifica en
// `ventas-productos-filtro-cliente.test.tsx`).
// ─────────────────────────────────────────────────────────────────────────────

/** Valor del desplegable cuando no hay ningún cliente puesto. */
const TODOS = "todos";

/** Cuántos renglones muestra «Dejó de comprar» antes de decir cuántos faltan. */
const DEJADOS_VISIBLES = 5;

/** Los criterios de la tira de orden del celular. Mismas etiquetas que los
 *  encabezados de la tabla — no se abrevió ni se renombró nada. */
const ORDEN_TARJETAS_SIN_MARGEN: { key: SortKey; label: string }[] = [
  { key: "cantidad", label: "Piezas" },
  { key: "venta", label: "Venta" },
  { key: "precio", label: "Precio prom." },
];
const ORDEN_TARJETAS: { key: SortKey; label: string }[] = [
  ...ORDEN_TARJETAS_SIN_MARGEN,
  { key: "margen", label: "Margen %" },
];

/** Valor por el que se ordena cada columna. El precio se calcula al vuelo. */
function valorOrden(p: ProductoNivel1, key: SortKey): number | null {
  return key === "precio" ? precioPromedio(p.venta, p.cantidad) : p[key];
}

// El selector de período: los CUATRO que pidió Daniel y nada más.
//
// ⛔ ACÁ VIVÍAN TAMBIÉN LOS 12 MESES SUELTOS (Ene 2026, Feb 2026, …). Daniel,
// textual (24-ago-2026): *"solo dejame las 4 primeras, las otras quítamelas que
// sobran, nunca te las pedí"*. Se fueron de la LISTA, no del sistema: el
// servidor sigue aceptando `?mes=6` y contestando exactamente lo mismo, así que
// nada que ya funcionara dejó de funcionar — simplemente la pantalla no lo pide
// más, y `productosRange(year, mes)` sigue intacta con sus candados.
//
// Los tres relativos están anclados en HOY y no en el año del selector global
// (ver la nota de `productosRangoPeriodo`), por eso la pantalla imprime siempre
// las dos fechas debajo del total.
const PERIODOS_FIJOS: { key: ProductosPeriodo; nombre: string }[] = [
  { key: "6m", nombre: "Últimos 6 meses" },
  { key: "12m", nombre: "Últimos 12 meses" },
  { key: "anio_pasado", nombre: "Año pasado" },
];

/** "24 ago 2026" — fecha corta y legible, sin depender de la zona del navegador. */
function fmtDia(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${Number(d)} ${MONTHS[Number(m) - 1].toLowerCase()} ${y}`;
}

export function ProductosView({ selectedYear }: { selectedYear: number }) {
  // Deep-link: /ventas?tab=productos&empresa=american_classic preselecciona la
  // empresa (ej. desde el link "Top productos" del módulo Multifashion). Es solo
  // semilla inicial; el usuario puede cambiarla con el selector después.
  const searchParams = useSearchParams();
  const initialEmpresa = (() => {
    const e = searchParams.get("empresa");
    return e && PRODUCTOS_EMPRESA_KEYS.includes(e) ? e : DEFAULT_PRODUCTOS_EMPRESA;
  })();
  const [empresa, setEmpresa] = useState(initialEmpresa);
  const [periodo, setPeriodo] = useState<ProductosPeriodo>("ytd");
  const [data, setData] = useState<ProductosResponse | null>(null);
  // Venta del MISMO período del año anterior por descripción → columna Δ.
  const [prevVenta, setPrevVenta] = useState<Record<string, number>>({});
  // 🩸 SIN VENTANA DE COMPARACIÓN, CADA RENGLÓN SALE "Nuevo" Y LA TABLA ENTERA
  // PARECE UN ESTRENO. Y eso pasa por DOS motivos que no son lo mismo:
  //
  //   "vacio" → la consulta funcionó y ese período no tuvo ni una venta. Es un
  //             HECHO del negocio (Joystep arranca en jul-2025, así que su "Año
  //             pasado" se compara contra un 2024 sin nada) y "Nuevo" es cierto.
  //   "fallo" → la consulta se cayó (un tropiezo de red, un timeout). NO
  //             sabemos si hubo ventas, así que decir "Nuevo" es AFIRMAR algo
  //             que no se midió — y antes salía sin ningún aviso, porque el
  //             cartel ámbar solo miraba el caso vacío. El catálogo entero se
  //             leía como estreno por un error de red.
  const [comparativo, setComparativo] = useState<"ok" | "vacio" | "fallo">("ok");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "venta", dir: "desc" });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [codigos, setCodigos] = useState<Record<string, ProductoCodigo[]>>({});
  // Quién compra cada descripción. `null` = la lectura falló (distinto de `[]`,
  // que es "no hay detalle"): son dos mensajes distintos y no se pueden mezclar.
  const [clientes, setClientes] = useState<Record<string, ClienteDeProducto[] | null>>({});
  const [codigosLoading, setCodigosLoading] = useState<string | null>(null);
  // Qué pestaña del desplegable se está mirando. Una sola fila se abre a la
  // vez, así que un solo valor alcanza. Arranca en CLIENTES porque es lo que
  // Daniel vino a buscar; los códigos quedan a un toque.
  const [drillTab, setDrillTab] = useState<DrillTab>("clientes");

  // ── El filtro por cliente ────────────────────────────────────────────────
  const [filtroCliente, setFiltroCliente] = useState<string>(TODOS);
  // La matriz (cliente × descripción) del período. 🔑 SE PIDE UNA SOLA VEZ, y
  // sólo cuando alguien TOCA el filtro: quien nunca lo usa no paga ni una
  // consulta, y quien lo usa filtra, busca, ordena y pagina sin volver a pedir
  // nada. Medido el 26-ago-2026: son 930 filas en vistana y 1.199 en
  // fashion_wear sobre 12 meses — cabe de sobra en la respuesta.
  const [matriz, setMatriz] = useState<FilaPorCliente[] | null>(null);
  const [matrizEstado, setMatrizEstado] =
    useState<"sin-pedir" | "cargando" | "listo" | "fallo">("sin-pedir");
  // Lo que CADA cliente compraba en la ventana anterior. Se pide por cliente
  // (no el período entero) y se guarda: volver a elegirlo no vuelve a consultar.
  // `null` = la lectura falló, distinto de `[]`, que es "no compraba nada".
  const [previo, setPrevio] = useState<Record<string, FilaPorCliente[] | null>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ empresa, year: String(selectedYear), periodo });
      // Mismo período del año anterior (para Δ). Mismo endpoint, y el rango
      // comparativo lo resuelve EL SERVIDOR (`previo=1`): si lo rearmara el
      // cliente, los dos criterios divergen el día que uno de los dos cambie.
      const prevQs = new URLSearchParams(qs);
      prevQs.set("previo", "1");
      const [res, prevRes] = await Promise.all([
        fetch(`/api/ventas/productos?${qs.toString()}`, { cache: "no-store" }),
        fetch(`/api/ventas/productos?${prevQs.toString()}`, { cache: "no-store" }),
      ]);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as ProductosResponse;
      // Δ es informativo: si el año anterior falla, seguimos sin la columna —
      // pero la pantalla lo DICE, y la columna deja de afirmar "Nuevo".
      const prevMap: Record<string, number> = {};
      let estado: "ok" | "vacio" | "fallo" = "fallo";
      if (prevRes.ok) {
        const prevJson = (await prevRes.json()) as ProductosResponse;
        for (const p of prevJson.productos) prevMap[p.descripcion] = p.venta;
        estado = prevJson.productos.length === 0 ? "vacio" : "ok";
      }
      setPrevVenta(prevMap);
      setComparativo(estado);
      setData(json);
      setCodigos({});
      setClientes({});
      // La matriz es de ESTE período y de ESTA empresa: dejarla puesta mostraría
      // los números de la anterior. Se vuelve a pedir sola si el filtro está
      // puesto (ver el efecto de más abajo).
      setMatriz(null);
      setMatrizEstado("sin-pedir");
      setPrevio({});
      setExpanded(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "error inesperado");
      setData(null);
      setComparativo("fallo");
    } finally {
      setLoading(false);
    }
  }, [empresa, periodo, selectedYear]);

  useEffect(() => { load(); }, [load]);

  // ── LA MATRIZ: UNA consulta por empresa+período, y ninguna por toque ──────
  const pedirMatriz = useCallback(async () => {
    setMatrizEstado("cargando");
    try {
      const qs = new URLSearchParams({
        empresa, year: String(selectedYear), periodo, ventana: "actual",
      });
      const res = await fetch(`/api/ventas/productos/por-cliente?${qs.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { filas?: FilaPorCliente[] };
      setMatriz(json.filas ?? []);
      setMatrizEstado("listo");
    } catch {
      setMatriz(null);
      setMatrizEstado("fallo");
    }
  }, [empresa, periodo, selectedYear]);

  // Con el filtro puesto, cambiar de período la vuelve a pedir sola: un filtro
  // vivo sobre una matriz vieja mostraría números de otro rango.
  useEffect(() => {
    if (filtroCliente !== TODOS && matrizEstado === "sin-pedir") pedirMatriz();
  }, [filtroCliente, matrizEstado, pedirMatriz]);

  // Los clientes del desplegable salen de la matriz que YA viajó — no de una
  // búsqueda ni de un directorio. Sin `cliente_switch_id` no se puede pedir su
  // ventana anterior, así que esas líneas suman en la tabla sin filtro pero no
  // son una opción del filtro.
  const clientesDelFiltro = useMemo(
    () => (matriz ? clientesDelPeriodo(matriz).filter(c => c.id != null) : []),
    [matriz],
  );

  // Un cliente que compraba en un período y en el nuevo no, deja de existir en
  // la lista: el filtro vuelve a «todos» en vez de dejar la tabla vacía sin
  // decir por qué. Y si la matriz no se pudo leer, tampoco se puede sostener un
  // filtro: se suelta en vez de dejar la pantalla esperando para siempre.
  useEffect(() => {
    if (filtroCliente === TODOS) return;
    if (matrizEstado === "fallo") { setFiltroCliente(TODOS); return; }
    if (matrizEstado !== "listo") return;
    if (!clientesDelFiltro.some(c => claveCliente(c.id) === filtroCliente)) setFiltroCliente(TODOS);
  }, [matrizEstado, clientesDelFiltro, filtroCliente]);

  // 🩸 CON UN CLIENTE PUESTO Y LA MATRIZ TODAVÍA EN CAMINO, LA TABLA ENTERA SE
  // VERÍA UN INSTANTE COMO SI FUERA LA DE ESE CLIENTE — números de la empresa
  // debajo del nombre de un negocio. Mientras no esté, se muestra el esqueleto.
  const esperandoMatriz = filtroCliente !== TODOS && (matrizEstado === "sin-pedir" || matrizEstado === "cargando");

  // Lo que ese cliente compraba ANTES. Una consulta por cliente, y sólo la
  // primera vez que se lo elige.
  useEffect(() => {
    if (filtroCliente === TODOS || filtroCliente in previo) return;
    let vivo = true;
    (async () => {
      try {
        const qs = new URLSearchParams({
          empresa, year: String(selectedYear), periodo, ventana: "previa", cliente: filtroCliente,
        });
        const res = await fetch(`/api/ventas/productos/por-cliente?${qs.toString()}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { filas?: FilaPorCliente[] };
        if (vivo) setPrevio(p => ({ ...p, [filtroCliente]: json.filas ?? [] }));
      } catch {
        if (vivo) setPrevio(p => ({ ...p, [filtroCliente]: null }));
      }
    })();
    return () => { vivo = false; };
  }, [filtroCliente, previo, empresa, periodo, selectedYear]);

  const clienteId = filtroCliente === TODOS ? null : Number(filtroCliente);
  const conCliente = clienteId != null && Number.isFinite(clienteId);
  const nombreCliente = clientesDelFiltro.find(c => claveCliente(c.id) === filtroCliente)?.nombre ?? "";

  /** Qué compró ESTE cliente, por descripción. Todo en el navegador. */
  const comprasActual = useMemo<Map<string, CompraDelCliente> | null>(
    () => (matriz && conCliente ? comprasDe(matriz, clienteId) : null),
    [matriz, conCliente, clienteId],
  );
  /** Y qué compraba en la ventana anterior. `null` = todavía no está o falló. */
  const comprasPrevias = useMemo<Map<string, CompraDelCliente> | null>(() => {
    if (!conCliente) return null;
    const filas = previo[filtroCliente];
    return filas ? comprasDe(filas, clienteId) : null;
  }, [previo, filtroCliente, conCliente, clienteId]);
  const previoFallo = conCliente && previo[filtroCliente] === null;
  const previoCargando = conCliente && !(filtroCliente in previo);

  // 🔴 EL FILTRO NO CONSULTA NADA. Toma las descripciones que YA están en
  // pantalla y les cambia piezas y venta por las de este cliente; la que no
  // compró, se cae. Ordenar, buscar y paginar siguen siendo gratis.
  const productosDelFiltro = useMemo(() => {
    if (!data) return [];
    if (!comprasActual) return data.productos;
    const out: ProductoNivel1[] = [];
    for (const p of data.productos) {
      const c = comprasActual.get(p.descripcion);
      if (!c) continue;
      out.push({ ...p, cantidad: c.cantidad, venta: c.venta });
    }
    return out;
  }, [data, comprasActual]);

  /** Piezas y venta de este cliente en el período — el renglón de totales. */
  const totalCliente = useMemo(
    () => (comprasActual ? totalDeCompras(comprasActual) : null),
    [comprasActual],
  );

  /**
   * QUÉ DEJÓ DE COMPRAR — y la distinción que hace que la lista sirva.
   *
   * `seVendeHoy` NO se consulta: son las descripciones que la tabla de arriba ya
   * tiene en pantalla para el período actual, de TODA la empresa. Con eso, la
   * lista separa "este cliente la dejó y otros la siguen comprando" (hay a quién
   * llamar) de "la empresa dejó de venderla" (no hay nada que reclamar).
   */
  const dejados = useMemo<DejadoDeComprar[]>(() => {
    if (!data || !comprasActual || !comprasPrevias) return [];
    const seVendeHoy = new Set(data.productos.filter(p => p.venta > 0).map(p => p.descripcion));
    return dejoDeComprar(comprasActual, comprasPrevias, seVendeHoy);
  }, [data, comprasActual, comprasPrevias]);

  /**
   * QUÉ DEJÓ DE VENDERSE — lo que el año pasado vendió y este año no.
   *
   * 🔴 Solo SIN cliente puesto. Con un cliente, la pregunta ya la contesta
   * «Dejó de comprar», que además distingue si la empresa se lo sigue vendiendo
   * a otros — y dos listas parecidas al mismo tiempo se leen como una sola.
   *
   * ⚠️ Solo cuando la ventana anterior se MIDIÓ (`comparativo === "ok"`). Si la
   * consulta del año pasado se cayó, no sabemos qué vendió: una lista vacía
   * diría «no se dejó de vender nada», que es afirmar algo que no se midió.
   */
  const dejadosDeVender = useMemo<DejadoDeVender[]>(() => {
    if (!data || conCliente || comparativo !== "ok") return [];
    return dejoDeVenderse(data.productos, prevVenta);
  }, [data, conCliente, comparativo, prevVenta]);

  // 🔴 CAMBIAR DE EMPRESA (O DE AÑO) NO BORRA LO QUE ELEGISTE. Antes esto
  // reseteaba el período a "Año en curso" y vaciaba el buscador: estabas
  // mirando "Últimos 12 meses" de una empresa, cambiabas a otra, y la pantalla
  // volvía sola al año sin decir nada. El único motivo real era que la empresa
  // nueva podía no tener el MES elegido — y desde que los meses sueltos ya no
  // están en el selector, ese motivo no existe. (Lo mismo al cambiar el año:
  // `VentasShell` ya no remonta la vista.)
  const onEmpresaChange = (key: string) => {
    setEmpresa(key);
    // 🔴 EL CLIENTE SÍ SE LIMPIA, y es la excepción que confirma la regla de
    // arriba: `cliente_switch_id` es de UNA empresa. El id 412 de Vistana es
    // otro negocio —o ninguno— en Fashion Wear, así que arrastrarlo mostraría
    // la tabla de otro cliente con el nombre del anterior.
    setFiltroCliente(TODOS);
  };

  // ⛔ ACÁ ABAJO VIVÍA EL GUARD QUE RESETEABA EL MES cuando la empresa nueva no
  // lo tenía (miraba `data.meses`). MUERE CON LOS MESES, y se cae porque su
  // motivo de existir desapareció: sin meses sueltos en el selector no hay
  // ninguna elección que pueda quedar inválida al cambiar de empresa. Los tres
  // períodos relativos no dependen ni de la empresa ni del año.
  //
  // Lo que SÍ se conserva de ese mismo cambio es lo de arriba: cambiar de
  // empresa YA NO borra el buscador ni te devuelve al año en curso.

  // Cuatro opciones y ninguna más. `esProductosPeriodo` sigue guardando la
  // puerta: un valor que no sea uno de los cuatro no cambia nada (antes acá
  // convivían los meses "1".."12", y `parseInt("12m")` = 12 convertía "Últimos
  // 12 meses" en diciembre en silencio — ese enredo ya no existe).
  const onPeriodoChange = (v: string) => {
    if (!esProductosPeriodo(v)) return;
    setPeriodo(v);
  };

  const onFiltroClienteChange = (v: string) => {
    setFiltroCliente(v);
    setExpanded(null);
    // Con un cliente puesto, Margen % no se muestra (no hay margen por cliente:
    // la línea de factura no trae costo). Dejar el orden apuntando a una columna
    // que no está sería una tabla ordenada por algo invisible.
    if (v !== TODOS) setSort(prev => (prev.key === "margen" ? { key: "venta", dir: "desc" } : prev));
  };

  const rows = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    let r = productosDelFiltro;
    if (q) r = r.filter(p => p.descripcion.toLowerCase().includes(q));
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...r].sort((a, b) => {
      // `?? -Infinity` es el criterio que esta tabla YA usaba para el margen sin
      // valor; el precio sin unidades netas entra por la misma puerta para que
      // ordenar por una columna u otra no siga dos reglas distintas.
      const av = valorOrden(a, sort.key) ?? -Infinity;
      const bv = valorOrden(b, sort.key) ?? -Infinity;
      return (Number(av) - Number(bv)) * dir;
    });
  }, [data, productosDelFiltro, search, sort]);

  // 🔴 LA LISTA SE VE ENTERA — ver el comentario de `PAGE`, que ya no existe.
  const visibleRows = rows;

  const toggleSort = (key: SortKey) => {
    setSort(prev => (prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));
  };

  // 🩸 ANTES ESTO ARRANCABA CON `if (p.num_codigos <= 1) return;` — un grupo de
  // un solo código no tenía nada que desplegar. Con la lista de clientes SÍ
  // tiene: en Joystep y en Active Wear las descripciones que más venden son
  // justo de UN código (medido), así que con aquella guarda "quién lo compra"
  // no se podía abrir precisamente donde más falta hace. Ahora abren todas.
  const toggleExpand = async (p: ProductoNivel1) => {
    const key = p.descripcion;
    if (expanded === key) {
      setExpanded(null);
      return;
    }
    setExpanded(key);
    setDrillTab("clientes");
    if (!(key in codigos)) {
      setCodigosLoading(key);
      try {
        const qs = new URLSearchParams({ empresa, year: String(selectedYear), periodo, descripcion: key });
        const res = await fetch(`/api/ventas/productos/codigos?${qs.toString()}`, { cache: "no-store" });
        if (res.ok) {
          const json = (await res.json()) as {
            codigos: ProductoCodigo[];
            clientes: ClienteDeProducto[] | null;
          };
          setCodigos(prev => ({ ...prev, [key]: json.codigos }));
          setClientes(prev => ({ ...prev, [key]: json.clientes ?? null }));
        }
      } catch {
        /* el render muestra "no se pudo cargar" si queda sin data */
      } finally {
        setCodigosLoading(null);
      }
    }
  };

  const onExcel = async () => {
    if (!data) return;
    // Sin filtro, el Excel es el de siempre. Con un cliente puesto exporta LO
    // QUE SE ESTÁ VIENDO —sus descripciones, sus piezas, su venta— y sin la
    // columna Margen%: no hay margen por cliente, y una columna vacía en un
    // archivo que se manda por correo se lee como un cero.
    if (!comprasActual || !totalCliente) {
      await exportProductosToExcel(data);
      return;
    }
    await exportProductosToExcel(
      {
        ...data,
        productos: productosDelFiltro,
        totales: { venta: totalCliente.venta, costo: 0, margen: null },
      },
      nombreCliente,
    );
  };

  // Unidades y precio promedio del período completo (no del Top 20 visible):
  // se suman TODAS las descripciones que devolvió el nivel 1, que es la misma
  // base con la que ya se calculan Venta y Margen del renglón de totales.
  const totalUnidades = data ? data.productos.reduce((acc, p) => acc + p.cantidad, 0) : 0;
  const totalPrecio = data ? precioPromedio(data.totales.venta, totalUnidades) : null;
  // Con el filtro puesto, el renglón de arriba habla del CLIENTE. Sin filtro es
  // el de siempre, al centavo.
  const unidadesEnPantalla = totalCliente ? totalCliente.cantidad : totalUnidades;
  const precioEnPantalla = totalCliente
    ? precioPromedio(totalCliente.venta, totalCliente.cantidad)
    : totalPrecio;

  // El rótulo de la columna de cambio: para el año/mes sigue diciendo el año
  // contra el que compara (lo que se lee hoy); para las ventanas relativas no
  // hay un año que nombrar. Sin la "Δ", que es notación de matemática.
  const deltaLabel = periodo === "ytd" ? `vs ${selectedYear - 1}` : "vs año ant.";

  // 🔴 CON UN PERÍODO RELATIVO, EL SELECTOR DE AÑO DE ARRIBA NO HACE NADA — y
  // hasta hoy no lo decía. "Últimos 12 meses" y "Año pasado" se cuentan desde
  // HOY (ver `productosRangoPeriodo`: para esos tres el servidor ni mira el
  // año), así que había dos controles de tiempo en la misma pantalla y ninguno
  // aclaraba cuál manda. Ahora lo dice la pantalla, al lado de las fechas que
  // ya imprime — apagar el selector no se puede: es global de /ventas y lo
  // comparten los otros tres tabs, donde sí manda.
  const anioNoAplica = periodo !== "ytd";

  return (
    <div>
      {/* Toolbar — todos los controles a 44px de alto (h-11 / min-h-[44px]):
          los defaults del design system (h-9 en Select/Input, h-8 en
          size="sm") quedan 8-12px por debajo del mínimo táctil en iPhone. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={empresa} onValueChange={onEmpresaChange}>
          <SelectTrigger className="h-11 w-auto min-w-[150px] text-xs" disabled={loading}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {/* El nombre CORTO — «Vistana», no «Vistana International»
                (diccionario § 0, #4). Sale del mismo mapa que el resto del
                módulo, no de la lista local de esta pantalla. */}
            {PRODUCTOS_EMPRESAS.map(e => (
              <SelectItem key={e.key} value={e.key} className="text-xs">{nombreCortoEmpresa(e.key)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* 🔴 EL RÓTULO «Período» (5-sep-2026). El desplegable decía «Año en
            curso» y estaba pegado al selector «2026» de la barra de arriba, así
            que se leía como un SEGUNDO selector de año — y no lo es: sus cuatro
            opciones son Año en curso · Últimos 6 meses · Últimos 12 meses · Año
            pasado (`PERIODOS_FIJOS`), y tres de las cuatro se cuentan desde HOY
            y ni siquiera miran el año. Con el nombre puesto, la pregunta que
            contesta cada control se lee sin abrirlo. (El selector de año de la
            barra, además, ya no se dibuja en esta pestaña.) */}
        <label className="inline-flex items-center gap-1.5">
          <span className="text-xs text-gray-500">Período</span>
          <Select value={periodo} onValueChange={onPeriodoChange}>
          <SelectTrigger data-selector-periodo className="h-11 w-auto min-w-[150px] text-xs" disabled={loading}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ytd" className="text-xs">{periodoLabel(selectedYear, null, "ytd")}</SelectItem>
            {PERIODOS_FIJOS.map(p => (
              <SelectItem key={p.key} value={p.key} className="text-xs">{p.nombre}</SelectItem>
            ))}
          </SelectContent>
          </Select>
        </label>

        {/* FILTRO por cliente. Cerrado: no es un campo de texto y no ata a
            nadie a nada — sólo acota lo que ya está en pantalla. Las opciones
            son los clientes de ESTE período, del que más compra al que menos:
            con 66 clientes el orden alfabético deja al que importa en la mitad
            de la lista. */}
        <Select
          value={filtroCliente}
          onValueChange={onFiltroClienteChange}
          onOpenChange={abierto => {
            // 🔑 LA MATRIZ SE PIDE ACÁ Y NO EN LA CARGA DE LA PANTALLA: quien
            // nunca toca el filtro no paga ni una consulta.
            if (abierto && matrizEstado === "sin-pedir") pedirMatriz();
          }}
        >
          <SelectTrigger
            data-filtro-cliente
            className="h-11 w-auto min-w-[150px] max-w-[220px] text-xs"
            disabled={loading || !data}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-[320px]">
            <SelectItem value={TODOS} className="text-xs">Cliente: todos</SelectItem>
            {matrizEstado === "cargando" && (
              <div className="px-2 py-2 text-xs text-gray-400">Cargando…</div>
            )}
            {matrizEstado === "fallo" && (
              <div className="px-2 py-2 text-xs text-gray-500">No se pudo cargar la lista.</div>
            )}
            {/* 🔴 UN DESPLEGABLE VACÍO NO SE EXPLICA SOLO. Multifashion no tiene
                ni una línea en `switch_factura_lineas` (medido: 0), así que su
                lista sale vacía y sin esto quedaría un menú con una sola opción
                y ningún motivo. NO dice "no le vende a nadie" —sería falso—:
                dice que falta el detalle. */}
            {matrizEstado === "listo" && clientesDelFiltro.length === 0 && (
              <div className="px-2 py-2 text-xs text-gray-500">Sin detalle por cliente en este período.</div>
            )}
            {clientesDelFiltro.map(c => (
              <SelectItem key={claveCliente(c.id)} value={claveCliente(c.id)} className="text-xs">
                {c.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative min-w-[160px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar descripción…"
            /* text-base en móvil: Safari hace zoom al enfocar un input con
               letra < 16px (text-xs = 12px). Desde sm vuelve al text-xs. */
            className="h-11 pl-8 text-base sm:text-xs"
          />
        </div>

        {/* 🔴 «Actualizar ahora» EN LAS TRES PESTAÑAS (5-sep-2026). Estaba solo
            en Resumen y en Clientes: desde Productos había que cambiar de
            pestaña para traer datos frescos y volver. Es el MISMO botón y la
            MISMA secuencia (las 8 empresas en orden + el refresco de vistas al
            final), no una variante: dos formas de actualizar son dos estados
            posibles de los mismos datos. */}
        <SyncNowButton opciones={SYNC_NOW_VENTAS_SECUENCIA} secuencial onSuccess={load} />

        <Button variant="outline" size="sm" onClick={onExcel} disabled={!data || loading} className="min-h-[44px]">
          <Download className="mr-1.5 h-3.5 w-3.5" /> Excel
        </Button>
      </div>

      {/* Totales — texto simple, sin cards.
          🔒 Este <p> NO se toca: es el que compara el verificador de "ningún
          número cambió" (scripts/_verif-productos-numeros.mjs). Lo nuevo va en
          la línea de abajo, que es un elemento aparte. */}
      {data && !loading && (
        <>
          {/* 🔴 CON UN CLIENTE PUESTO, MARGEN NO SE MUESTRA. `switch_factura_lineas`
              NO TRAE COSTO: no hay margen de este cliente, y el margen del
              producto pegado a la venta del cliente se lee como si lo fuera.
              Se saca en vez de explicarlo — es la decisión más corta y la única
              que no puede malinterpretarse. */}
          <p data-totales-productos className="mb-1 text-sm text-gray-600">
            Venta <span className="font-mono font-semibold tabular-nums text-gray-900">{fmtMoney(totalCliente ? totalCliente.venta : data.totales.venta)}</span>
            {!conCliente && (
              <>
                <span className="mx-2 text-gray-300">·</span>
                Margen <span className="font-mono font-semibold tabular-nums text-gray-900">{fmtMargen(data.totales.margen)}</span>
              </>
            )}
          </p>
          {/* Las piezas y el precio promedio del período, y —clave para los
              períodos relativos— LAS DOS FECHAS. "Últimos 12 meses" sin fechas
              es el rótulo que se malinterpreta. */}
          <p data-resumen-productos className="mb-3 text-xs text-gray-500">
            <span className="font-mono tabular-nums text-gray-700">{Math.round(unidadesEnPantalla).toLocaleString("en-US")}</span> piezas
            <span className="mx-1.5 text-gray-300">·</span>
            Precio prom. <span className="font-mono tabular-nums text-gray-700">{fmtPrecioProm(precioEnPantalla)}</span>
            <span className="mx-1.5 text-gray-300">·</span>
            {/* 🩸 SIN `whitespace-nowrap`. Medido a 390 px: "Δ contra 1 ene 2025
                – 31 dic 2025" en una sola línea llegaba hasta el px 490 y se
                llevaba la PÁGINA ENTERA 100 px de lado. Que el renglón se parta
                en dos líneas en iPhone no le quita nada; que la página se vaya
                de lado, sí. */}
            <span>Del {fmtDia(data.desde)} al {fmtDia(data.hasta)}</span>
            {data.comparativo && (
              <>
                <span className="mx-1.5 text-gray-300">·</span>
                <span>comparado con {fmtDia(data.comparativo.desde)} – {fmtDia(data.comparativo.hasta)}</span>
              </>
            )}
            {/* Con el filtro puesto los números salen del detalle de facturas y
                notas de crédito, que no tiene las ventas de mostrador (~1%). Es
                lo mismo que ya dice el pie de «Quién lo compra», dicho en cinco
                palabras y una sola vez, y al final del renglón. */}
            {conCliente && (
              <>
                <span className="mx-1.5 text-gray-300">·</span>
                <span data-sin-mostrador>sin las ventas de mostrador</span>
              </>
            )}
          </p>
          {/* El aviso va JUNTO a las fechas, que son la prueba de lo que dice:
              el período impreso arranca en otro año que el del selector. */}
          {anioNoAplica && (
            <p data-anio-no-aplica className="mb-3 text-xs text-gray-500">
              El año {selectedYear} de arriba no se aplica a este período: «{periodoLabel(selectedYear, null, periodo)}»
              se cuenta desde hoy hacia atrás. Para mirar un año elige «{periodoLabel(selectedYear, null, "ytd")}» o un mes.
            </p>
          )}
          {comparativo === "vacio" && data.comparativo && (
            <p data-sin-comparativo className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              El período de comparación ({fmtDia(data.comparativo.desde)} – {fmtDia(data.comparativo.hasta)}) no tiene
              ventas de esta empresa: la columna de cambio no está comparando contra nada.
            </p>
          )}
          {/* 🔴 "No se pudo cargar" NO es "no hubo ventas". Va en gris y no en
              ámbar —no hay nada roto en los datos, se cayó una consulta— y
              ofrece reintentar, que es lo único accionable. La columna de
              cambio, mientras tanto, muestra "—" en vez de "Nuevo". */}
          {comparativo === "fallo" && (
            <p data-comparativo-fallo className="mb-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
              No se pudo cargar el período de comparación, así que la columna de cambio queda vacía. Los
              números de esta tabla no cambian.{" "}
              <button onClick={load} className="underline">Reintentar</button>
            </p>
          )}
        </>
      )}

      {!conCliente && !loading && data && (
        <DejoDeVenderse filas={dejadosDeVender} comparativo={data.comparativo} />
      )}

      {conCliente && !loading && data && (
        <DejoDeComprar
          filas={dejados}
          cargando={previoCargando}
          fallo={previoFallo}
          desde={data.comparativo?.desde}
          hasta={data.comparativo?.hasta}
        />
      )}

      {error && (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-700">
          No se pudieron cargar los productos. <button onClick={load} className="underline">Reintentar</button>
        </div>
      )}

      {(loading || esperandoMatriz) && (
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <SkeletonTable rows={6} cols={5} />
        </div>
      )}

      {/* ── NIVEL 1: TABLA desde `sm`, TARJETAS en celular ──────────────────
          🩸 EN CELULAR LA TABLA ENTRABA, PERO CONTESTABA LA MITAD. Daniel,
          textual (25-ago-2026): *"solo veo sort venta y margen. Quiero ver
          cantidad también y precio de venta promedio."* A 390 px sólo caben
          Descripción · Venta · Margen % —medido, `scripts/_medir-productos-
          precio-anchos.mjs`— y esa decisión era la correcta PARA UNA TABLA: una
          columna más agrega arrastre. Lo que había que cambiar era la FORMA.

          Con tarjetas los cuatro números entran sin arrastrar nada, porque no
          compiten por el mismo renglón. Es el patrón que este repo ya usa dos
          veces para exactamente esto (`admin/components/PanelCxcMobile.tsx` y
          `ventas/ResumenViewMobile.tsx`), copiado y no reinventado.

          🔴 DESDE `sm` NO CAMBIA NADA: la tabla es la de siempre, con sus siete
          columnas y su orden por encabezado.

          🩸 `data-vista` VA FIJO ("tabla" / "tarjetas") y NO se busca el layout
          por su clase de breakpoint: `.sm\:hidden` deja de existir en cuanto el
          corte se mueve, `querySelector` devuelve vacío y el medidor compara
          CERO celdas pasando en verde sin haber mirado nada. Los scripts fallan
          si encuentran cero.

          ⚠️ LA TABLA VA PRIMERA EN EL DOM a propósito: en jsdom no hay CSS, así
          que los dos layouts existen a la vez y los candados de siempre —que
          preguntan por `document.querySelector`— tienen que seguir cayendo
          sobre la tabla, que es lo que venían mirando. */}
      {data && !loading && !esperandoMatriz && !error && (
        <div data-vista="tabla" className="hidden overflow-x-auto rounded-lg border border-gray-200 sm:block">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-[0.04em] text-gray-400">
                <th className="px-2 py-2.5 font-normal lg:px-3">Descripción</th>
                <th className="hidden px-1.5 py-2.5 text-right font-normal sm:table-cell lg:px-3">Códigos</th>
                <SortableTh label="Cant" active={sort} sortKey="cantidad" onClick={toggleSort} className="hidden sm:table-cell" />
                <SortableTh label="Venta" active={sort} sortKey="venta" onClick={toggleSort} />
                <th className="hidden px-1.5 py-2.5 text-right font-normal sm:table-cell lg:px-3">{deltaLabel}</th>
                {/* Precio prom. entra ESCONDIDA bajo `sm`, igual que Cant y Δ.
                    A 390 px solo caben Descripción, Venta y Margen (medido:
                    scripts/_medir-productos-precio-anchos.mjs) y la regla es que
                    una columna más no puede agregar arrastre nuevo en iPhone. */}
                <SortableTh label="Precio prom." active={sort} sortKey="precio" onClick={toggleSort} className="hidden sm:table-cell" />
                {/* 🔴 Margen % SÓLO SIN FILTRO. Es el margen del PRODUCTO (sale
                    de `switch_articulo_diario`, que sí tiene costo); la venta de
                    al lado sería la del cliente, y `switch_factura_lineas` no
                    trae costo, así que un margen por cliente no existe. Pegar
                    los dos números invita a leer uno como el otro. */}
                {!conCliente && (
                  <SortableTh label="Margen %" active={sort} sortKey="margen" onClick={toggleSort} />
                )}
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 && (
                <tr><td colSpan={conCliente ? 6 : 7} className="px-3 py-8 text-center text-gray-400">Sin productos para este filtro.</td></tr>
              )}
              {visibleRows.map(p => (
                <ProductoRow
                  key={p.descripcion}
                  p={p}
                  isOpen={expanded === p.descripcion}
                  onToggle={() => toggleExpand(p)}
                  codigos={codigos[p.descripcion]}
                  clientes={clientes[p.descripcion]}
                  codigosLoading={codigosLoading === p.descripcion}
                  /* Con un cliente puesto la columna de cambio compara contra
                     lo que compraba ÉL, no contra la empresa entera: si no, el
                     Δ diría "creció" porque creció otro. */
                  prevVenta={conCliente ? comprasPrevias?.get(p.descripcion)?.venta : prevVenta[p.descripcion]}
                  comparativoMedido={conCliente ? comprasPrevias != null : comparativo !== "fallo"}
                  mostrarMargen={!conCliente}
                  tab={drillTab}
                  onTab={setDrillTab}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── LAS TARJETAS (sólo celular) ──────────────────────────────────── */}
      {data && !loading && !esperandoMatriz && !error && (
        <div className="sm:hidden">
          {/* 🔴 SIN ENCABEZADO NO HAY DÓNDE TOCAR PARA ORDENAR. La tabla se
              ordena tocando el título de la columna; sin tabla eso se pierde, y
              perder el orden sería cambiar una carencia por otra. Los CUATRO
              criterios quedan acá, que son justo los cuatro números que Daniel
              pidió ver. El activo dice para qué lado va y se invierte al
              volverlo a tocar, igual que el encabezado. */}
          {/* 🔴 SIN ENCABEZADO NO HAY DÓNDE TOCAR PARA ORDENAR. La tabla se
              ordena tocando el título de la columna; sin tabla eso se pierde, y
              perder el orden sería cambiar una carencia por otra. Los CUATRO
              criterios quedan acá, que son justo los cuatro números que Daniel
              pidió ver. El activo dice para qué lado va y se invierte al
              volverlo a tocar, igual que el encabezado.

              🔴 Es la tira COMPARTIDA (`TiraOrden`): acá el chip activo era
              NEGRO y en Utilidad VERDE, dos colores para el mismo estado a una
              pestaña de distancia. Ahora hay un solo componente.
              Mismo criterio que la tabla: con un cliente puesto no hay margen
              por cliente, así que tampoco se puede ordenar por él. */}
          <TiraOrden
            criterios={conCliente ? ORDEN_TARJETAS_SIN_MARGEN : ORDEN_TARJETAS}
            active={sort}
            onClick={toggleSort}
            className="mb-2"
          />

          <ul data-vista="tarjetas" className="space-y-2">
            {visibleRows.length === 0 && (
              <li className="rounded-lg border border-gray-200 bg-white px-3 py-8 text-center text-sm text-gray-400">
                Sin productos para este filtro.
              </li>
            )}
            {visibleRows.map(p => (
              <ProductoCard
                key={p.descripcion}
                p={p}
                isOpen={expanded === p.descripcion}
                onToggle={() => toggleExpand(p)}
                codigos={codigos[p.descripcion]}
                clientes={clientes[p.descripcion]}
                codigosLoading={codigosLoading === p.descripcion}
                mostrarMargen={!conCliente}
                tab={drillTab}
                onTab={setDrillTab}
              />
            ))}
          </ul>
        </div>
      )}

      {/* ⛔ ACÁ VIVÍA «Mostrar más (120 restantes)». Ver el comentario de la
          constante `PAGE`, que se retiró con él. */}
    </div>
  );
}

function SortableTh({
  label, active, sortKey, onClick, className = "",
}: {
  label: string;
  active: { key: SortKey; dir: "asc" | "desc" };
  sortKey: SortKey;
  onClick: (k: SortKey) => void;
  className?: string;
}) {
  const isActive = active.key === sortKey;
  return (
    /* `sm:px-1.5`: entre `sm` y `lg` cada columna numérica devuelve 4 px. Con la
       7a columna (Precio prom.) la tabla pedía 560 px contra los 552 de un iPad
       parado —medido, no supuesto— y arrastraba 8. Debajo de `sm` y desde `lg`
       el relleno es el de siempre. */
    <th className={`px-2 py-0 text-right font-normal sm:px-1.5 lg:px-3 ${className}`}>
      {/* El botón mide 44 px de alto (regla táctil de la casa): antes eran 18 y
          en iPhone ordenar era una lotería. El `py` se movió del th al button
          para que el alto lo dé el blanco tocable y no se sumen los dos. */}
      <button
        onClick={() => onClick(sortKey)}
        className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-end gap-0.5 hover:text-gray-700 ${isActive ? "text-gray-900" : ""}`}
      >
        {label}
        <span className="w-2 text-xs">{isActive ? (active.dir === "desc" ? "▼" : "▲") : ""}</span>
      </button>
    </th>
  );
}

// Cambio contra el año anterior. Producto sin base comparable el año previo =
// "Nuevo". Antes bastaba con `prev > 0` y un producto que el año pasado vendió
// $2 salía con +50000%; ahora la regla es la única de la app (`variacionPct`).
//
// 🔴 `medido` DICE SI HUBO VENTANA DE COMPARACIÓN. Cuando la consulta del año
// anterior falló, no se midió nada: "Nuevo" sería afirmar que ese producto no
// existía, y con el catálogo entero en verde el error de red se lee como un
// dato. Sin medición, la celda va vacía ("—").
function DeltaCell({ curr, prev, medido }: { curr: number; prev: number | undefined; medido: boolean }) {
  if (!medido) {
    return <td data-col="delta" className="hidden px-1.5 py-2.5 text-right font-mono text-xs text-gray-300 sm:table-cell lg:px-3">—</td>;
  }
  const ratio = variacionPct(curr, prev);
  if (ratio == null) {
    return <td data-col="delta" className="hidden px-1.5 py-2.5 text-right font-mono text-xs text-teal-700 sm:table-cell lg:px-3">Nuevo</td>;
  }
  const pct = ratio * 100;
  const up = pct >= 0;
  return (
    <td data-col="delta" className={`hidden px-1.5 py-2.5 text-right font-mono tabular-nums sm:table-cell lg:px-3 ${up ? "text-emerald-700" : "text-rose-600"}`}>
      {up ? "+" : ""}{pct.toFixed(0)}%
    </td>
  );
}

function ProductoRow({
  p, isOpen, onToggle, codigos, clientes, codigosLoading, prevVenta, comparativoMedido, mostrarMargen, tab, onTab,
}: {
  p: ProductoNivel1;
  isOpen: boolean;
  onToggle: () => void;
  codigos: ProductoCodigo[] | undefined;
  clientes: ClienteDeProducto[] | null | undefined;
  codigosLoading: boolean;
  prevVenta: number | undefined;
  /** false cuando la consulta del período anterior falló: sin ventana medida,
   *  la columna de cambio no puede afirmar "Nuevo". */
  comparativoMedido: boolean;
  /** false con un cliente puesto: no hay margen por cliente (ver la cabecera). */
  mostrarMargen: boolean;
  tab: DrillTab;
  onTab: (t: DrillTab) => void;
}) {
  return (
    <>
      {/* `data-fila-producto` es el ancla ESTABLE para el verificador. Buscar
          por clase de breakpoint (`.sm\\:table-cell`) es una trampa: si el corte
          se mueve, el selector no encuentra nada y la comparación "pasa" sin
          haber comparado una sola celda. */}
      <tr
        data-fila-producto={p.descripcion}
        className="cursor-pointer border-b border-gray-100 hover:bg-gray-50"
        onClick={onToggle}
      >
        <td data-col="descripcion" className="px-2 py-2.5 lg:px-3">
          <div className="flex items-start gap-1.5">
            <ChevronRight className={`mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform ${isOpen ? "rotate-90" : ""}`} />
            <div className="min-w-0">
              {/* ⛔ DEBAJO DEL NOMBRE IBA EL AVISO ÁMBAR de «código mal
                  clasificado» (#597). Se retiró el 25-ago-2026: Daniel ya
                  revisó los 5 códigos y la clasificación de Switch resultó ser
                  la buena. Ver `AvisoClasificacionLinea`, que ya no existe.
                  La celda vuelve a ser el nombre y nada más. */}
              <span className="text-gray-800">{p.descripcion}</span>
            </div>
          </div>
        </td>
        <td data-col="codigos" className="hidden px-1.5 py-2.5 text-right font-mono tabular-nums text-gray-500 sm:table-cell lg:px-3">{p.num_codigos}</td>
        <td data-col="cantidad" className="hidden px-1.5 py-2.5 text-right font-mono tabular-nums text-gray-600 sm:table-cell lg:px-3">{Math.round(p.cantidad).toLocaleString("en-US")}</td>
        <td data-col="venta" className="px-2 py-2.5 text-right font-mono tabular-nums text-gray-900 sm:px-1.5 lg:px-3">{fmtMoney(p.venta)}</td>
        <DeltaCell curr={p.venta} prev={prevVenta} medido={comparativoMedido} />
        <td data-col="precio" className="hidden px-1.5 py-2.5 text-right font-mono tabular-nums text-gray-700 sm:table-cell lg:px-3">{fmtPrecioProm(precioPromedio(p.venta, p.cantidad))}</td>
        {mostrarMargen && (
          <td data-col="margen" className="px-2 py-2.5 text-right font-mono tabular-nums text-gray-700 sm:px-1.5 lg:px-3">{fmtMargen(p.margen)}</td>
        )}
      </tr>
      {isOpen && (
        <tr className="bg-gray-50/60">
          <td colSpan={mostrarMargen ? 7 : 6} className="px-2 py-0 lg:px-3">
            <div className="py-2 pl-5">
              {codigosLoading && <div className="py-2 text-xs text-gray-400">Cargando…</div>}
              {!codigosLoading && (
                <>
                  {/* 🩸 DOS BLOQUES UNO DEBAJO DEL OTRO NO SERVÍAN, y no es
                      cuestión de gusto: hay descripciones de 602 códigos
                      (vistana, "Men-T-Shirts S/S") y hasta de 842
                      (fashion_wear, "Women-Bags"). Con la lista de códigos
                      arriba, "quién lo compra" quedaba a 600 renglones de
                      scroll — o sea, no existía. Con pestañas las dos cosas
                      están a un toque y ninguna tapa a la otra.

                      Arranca en CLIENTES porque es lo que Daniel pidió; los
                      códigos siguen ahí, con su rótulo, sin perder nada. */}
                  <div className="mb-1 flex gap-1" role="tablist" aria-label="Detalle de la descripción">
                    <DrillTabBtn activa={tab === "clientes"} onClick={() => onTab("clientes")}>
                      Quién lo compra
                    </DrillTabBtn>
                    <DrillTabBtn activa={tab === "codigos"} onClick={() => onTab("codigos")}>
                      Códigos{codigos ? ` (${codigos.length})` : ""}
                    </DrillTabBtn>
                  </div>

                  {tab === "clientes" && <BloqueClientes clientes={clientes} />}
                  {tab === "codigos" && <BloqueCodigos codigos={codigos} />}
                </>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LA TARJETA DE CELULAR — el mismo renglón, con forma de tarjeta.
//
// 🩸 QUÉ VINO A ARREGLAR. A 390 px la tabla dibujaba Descripción · Venta ·
// Margen % y nada más: `Cant`, `Precio prom.` y el Δ viven bajo `sm` porque una
// columna más agrega arrastre (medido). Daniel: *"solo veo sort venta y margen.
// Quiero ver cantidad también y precio de venta promedio."* En una tarjeta los
// cuatro números NO compiten por el mismo renglón: van en una grilla de dos por
// dos, cada uno con su rótulo, y no hay nada que arrastrar.
//
// 🔑 CADA NÚMERO LLEVA SU RÓTULO. En la tabla el rótulo está en el encabezado,
// una sola vez; en una tarjeta suelta, cuatro números sin nombre son cuatro
// adivinanzas. Cuesta una línea de texto chico y ahorra la pregunta.
//
// 🔴 LOS NÚMEROS SON LOS MISMOS Y SE CALCULAN IGUAL: `fmtMoney`, `fmtMargen` y
// `precioPromedio` son las MISMAS funciones que usa la fila de la tabla. No hay
// un segundo formateador ni un segundo redondeo — verificado celda por celda
// contra la tabla en `scripts/_verif-tarjetas-productos.mjs`.
//
// El desplegable («Quién lo compra» / «Códigos») abre igual que en la tabla, con
// los MISMOS componentes: si se dibujaran dos veces distinto, dirían dos cosas.
// ─────────────────────────────────────────────────────────────────────────────
function ProductoCard({
  p, isOpen, onToggle, codigos, clientes, codigosLoading, mostrarMargen, tab, onTab,
}: {
  p: ProductoNivel1;
  isOpen: boolean;
  onToggle: () => void;
  codigos: ProductoCodigo[] | undefined;
  clientes: ClienteDeProducto[] | null | undefined;
  codigosLoading: boolean;
  /** false con un cliente puesto: no hay margen por cliente (ver la cabecera). */
  mostrarMargen: boolean;
  tab: DrillTab;
  onTab: (t: DrillTab) => void;
}) {
  return (
    <li data-tarjeta-producto={p.descripcion} className="rounded-lg border border-gray-200 bg-white">
      {/* La tarjeta ENTERA es el botón que abre el detalle: en un celular el
          blanco tocable es la tarjeta, no una flechita de 14 px. */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full items-start gap-2 px-3 py-2.5 text-left"
      >
        <ChevronRight className={`mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform ${isOpen ? "rotate-90" : ""}`} />
        <div className="min-w-0 flex-1">
          <div data-tarjeta-descripcion className="text-sm text-gray-800">{p.descripcion}</div>
          {/* Dos líneas, dos por dos. `grid-cols-2` y no `flex`: con nombres de
              largo distinto los valores quedan alineados en columna y se
              comparan de un vistazo entre tarjetas. */}
          <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1">
            <Dato rotulo="Piezas" col="cantidad">{Math.round(p.cantidad).toLocaleString("en-US")}</Dato>
            <Dato rotulo="Venta" col="venta">{fmtMoney(p.venta)}</Dato>
            <Dato rotulo="Precio prom." col="precio">{fmtPrecioProm(precioPromedio(p.venta, p.cantidad))}</Dato>
            {mostrarMargen && <Dato rotulo="Margen %" col="margen">{fmtMargen(p.margen)}</Dato>}
          </div>
        </div>
      </button>
      {isOpen && (
        <div className="border-t border-gray-100 bg-gray-50/60 px-3 py-2">
          {codigosLoading && <div className="py-2 text-xs text-gray-400">Cargando…</div>}
          {!codigosLoading && (
            <>
              <div className="mb-1 flex gap-1" role="tablist" aria-label="Detalle de la descripción">
                <DrillTabBtn activa={tab === "clientes"} onClick={() => onTab("clientes")}>
                  Quién lo compra
                </DrillTabBtn>
                <DrillTabBtn activa={tab === "codigos"} onClick={() => onTab("codigos")}>
                  Códigos{codigos ? ` (${codigos.length})` : ""}
                </DrillTabBtn>
              </div>
              {tab === "clientes" && <BloqueClientes clientes={clientes} />}
              {tab === "codigos" && <BloqueCodigos codigos={codigos} />}
            </>
          )}
        </div>
      )}
    </li>
  );
}

/** Un número de la tarjeta con su rótulo encima. `data-col` = el de la tabla. */
function Dato({ rotulo, col, children }: { rotulo: string; col: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      {/* 11 px sería letra <12 y el candado táctil lo marca. Va en 12. */}
      <div className="text-xs leading-none text-gray-400">{rotulo}</div>
      <div data-tarjeta-col={col} className="mt-0.5 font-mono text-sm tabular-nums text-gray-800">{children}</div>
    </div>
  );
}

// ⛔ ACÁ VIVÍA `ChipOrden`, el chip de ordenar de las tarjetas de esta vista.
// Se fue a `components/ventas/ChipOrden.tsx` y lo comparte con Utilidad, que
// tenía el suyo pintado de otro color. Ver la cabecera de ese archivo.

/** Pestaña del desplegable. 44 px de alto: se toca desde el iPhone. */
function DrillTabBtn({
  activa, onClick, children,
}: {
  activa: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={activa}
      // El clic NO puede llegar a la fila de arriba: ahí vive el toggle que
      // cierra el desplegable, y cambiar de pestaña lo cerraría al instante.
      onClick={e => { e.stopPropagation(); onClick(); }}
      className={`min-h-[44px] rounded-md px-3 text-xs transition ${
        activa ? "bg-white font-medium text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * QUIÉN COMPRA ESTA DESCRIPCIÓN — lo que pidió Daniel el 24-ago-2026.
 *
 * Del que más compra al que menos, con unidades, venta y qué parte se lleva.
 * Todo NETO: la nota de crédito RESTA (el signo lo pone `agruparPorCliente` con
 * `signoDeTipo`, la única definición del repo). No es un detalle: City Mall
 * David devolvió el 58% de lo que se le facturó a $30, y en bruto saldría muy
 * por encima de donde va.
 */
function BloqueClientes({ clientes }: { clientes: ClienteDeProducto[] | null | undefined }) {
  if (clientes === null) {
    return <div className="py-2 text-xs text-gray-500">No se pudo cargar quién lo compra. Cierra y vuelve a abrir la fila.</div>;
  }
  if (!clientes) return <div className="py-2 text-xs text-gray-400">Cargando…</div>;
  if (clientes.length === 0) {
    // 🔴 NO dice "no lo compra nadie". Hoy mismo Fashion Wear está terminando de
    // bajar su detalle y sus descripciones saldrían todas vacías: afirmar que
    // nadie compra sería una respuesta falsa dicha con toda seguridad.
    return (
      <div className="py-2 text-xs text-gray-500">
        Todavía no tenemos el detalle por cliente de estas ventas.
      </div>
    );
  }

  const total = totalDeClientes(clientes);
  return (
    <>
      {/* 🩸 ESTA TABLA MENTÍA, Y NO EN EL NÚMERO: EN EL RÓTULO (5-sep-2026).
          La última columna es `fmtParticipacion(participacion(...))` — qué
          PARTE del total se lleva ese cliente — y no tenía encabezado propio,
          así que heredaba el de la tabla de arriba: **«Margen %»**. Medido en
          Women-Flip Flops (total $139.795,00): Outlet Duty Free N3 $26.883 →
          19,2 %; La Frontera $24.330 → 17,4 %; Kheriddine $432 → 0,3 %. Son
          participaciones exactas leídas como márgenes.

          🔴 EL CÁLCULO ESTÁ BIEN; LO QUE FALTABA ERA LA CABECERA. Y un margen
          por cliente NO EXISTE: `switch_factura_lineas` no trae costo (está
          dicho en la cabecera de la tabla madre, que por eso esconde Margen %
          cuando hay un cliente puesto). Inventarlo habría sido lo peor de las
          dos salidas.

          Desde hoy toda tabla hija de este módulo pone su propio `<thead>`.
          Candado: `productos-columna-no-hereda-encabezado.test.tsx`. */}
      <table data-drill-clientes className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-[0.04em] text-gray-400">
            <th className="py-1.5 pr-3 font-normal">Cliente</th>
            <th className="hidden py-1.5 pr-3 text-right font-normal sm:table-cell">Piezas</th>
            <th className="py-1.5 pr-3 text-right font-normal">Venta</th>
            <th data-col-participacion className="py-1.5 text-right font-normal">% del total</th>
          </tr>
        </thead>
        <tbody>
          {clientes.map(c => (
            <tr key={c.cliente_switch_id ?? c.cliente_nombre} className="border-b border-gray-100 last:border-0">
              <td className="py-1.5 pr-3 text-gray-700">{c.cliente_nombre}</td>
              {/* Mismo corte `sm` que la tabla de arriba: a 390 px sólo entran
                  el nombre, la venta y el %. */}
              <td className="hidden py-1.5 pr-3 text-right font-mono tabular-nums text-gray-500 sm:table-cell">
                {Math.round(c.cantidad).toLocaleString("en-US")}
              </td>
              <td className="py-1.5 pr-3 text-right font-mono tabular-nums text-gray-800">{fmtMoney(c.venta)}</td>
              <td data-col="participacion" className="py-1.5 text-right font-mono tabular-nums text-gray-500">
                {fmtParticipacion(participacion(c.venta, total.venta))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* El pie dice de dónde sale y por qué puede quedar por debajo de la fila
          de arriba. Se explica UNA vez acá en vez de dejar que se descubra
          sumando y se lea como un descuadre. */}
      <p data-pie-clientes className="mt-1.5 text-xs text-gray-500">
        <span className="font-mono tabular-nums text-gray-700">{clientes.length}</span>
        {clientes.length === 1 ? " cliente" : " clientes"}
        <span className="mx-1.5 text-gray-300">·</span>
        <span className="font-mono tabular-nums text-gray-700">{Math.round(total.cantidad).toLocaleString("en-US")}</span> piezas
        <span className="mx-1.5 text-gray-300">·</span>
        <span className="font-mono tabular-nums text-gray-700">{fmtMoney(total.venta)}</span>
        <span className="mx-1.5 text-gray-300">·</span>
        <span>sale de las facturas y notas de crédito; las ventas de mostrador no traen detalle, así que puede quedar un poco por debajo de la venta de la fila</span>
      </p>
    </>
  );
}

/** Los códigos de la descripción — los colores y tallas de ese modelo. */
function BloqueCodigos({ codigos }: { codigos: ProductoCodigo[] | undefined }) {
  if (!codigos) return <div className="py-2 text-xs text-gray-500">No se pudieron cargar los códigos.</div>;
  if (codigos.length === 0) return <div className="py-2 text-xs text-gray-400">Sin códigos.</div>;
  return (
    // Misma regla que la tabla de clientes: cabecera PROPIA. Acá las columnas
    // sí coinciden de casualidad con las de la tabla madre, y esa casualidad es
    // exactamente lo que hace que nadie note cuando dejan de coincidir.
    <table data-drill-codigos className="w-full text-xs">
      <thead>
        <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-[0.04em] text-gray-400">
          <th className="py-1.5 pr-3 font-normal">Código</th>
          <th className="hidden py-1.5 pr-3 text-right font-normal sm:table-cell">Piezas</th>
          <th className="py-1.5 pr-3 text-right font-normal">Venta</th>
          <th className="hidden py-1.5 pr-3 text-right font-normal sm:table-cell">Precio prom.</th>
          <th className="py-1.5 text-right font-normal">Margen %</th>
        </tr>
      </thead>
      <tbody>
        {codigos.map(c => (
          <tr key={c.codigo} className="border-b border-gray-100 last:border-0">
            <td className="py-1.5 pr-3">
              <span className="font-mono text-gray-500">{c.codigo}</span>
              {c.descripcion && <span className="ml-2 text-gray-400">{c.descripcion}</span>}
            </td>
            <td className="hidden py-1.5 pr-3 text-right font-mono tabular-nums text-gray-500 sm:table-cell">{Math.round(c.cantidad).toLocaleString("en-US")}</td>
            <td className="py-1.5 pr-3 text-right font-mono tabular-nums text-gray-800">{fmtMoney(c.venta)}</td>
            {/* El precio promedio del código: es el que explica por qué dos
                códigos de la misma descripción tienen márgenes distintos. */}
            <td className="hidden py-1.5 pr-3 text-right font-mono tabular-nums text-gray-700 sm:table-cell">{fmtPrecioProm(precioPromedio(c.venta, c.cantidad))}</td>
            <td className="py-1.5 text-right font-mono tabular-nums text-gray-600">{fmtMargen(c.margen)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ⛔ ACÁ VIVÍA `AvisoClasificacionLinea` — LA LÍNEA ÁMBAR DE LA FILA:
//    «Revisar: FW0FW05034-DW5 también está en «Women-Sandals»».
//
// QUÉ AVISABA: un código que vivía bajo DOS categorías que las dos existían de
// verdad en `depurador_descripciones`. 18 renglones de 2.074.
//
// 🔴 POR QUÉ SE FUE (25-ago-2026, orden de Daniel). El aviso nació para que él
// revisara esos códigos en Switch. YA LOS REVISÓ y decidió, textual: *"si lo
// más reciente es 17-ago alguien lo pasó a Flip Flop, entonces es Flip Flop"*.
// La clasificación que Switch tiene HOY es la correcta: no hay nada que
// corregir allá, y el aviso quedó pidiendo una acción ya tomada. Un cartel que
// pide algo que ya se hizo es peor que ninguno — enseña a no leer los avisos.
//
// ⚠️ NO SE DESHIZO LA AGRUPACIÓN. El producto sigue saliendo en UN solo
// renglón por el nombre MÁS RECIENTE de su código (Agua Dana: $35.305,20 en
// una fila y no en dos). El aviso era una cosa aparte, y sólo se fue el aviso.
// Los candados que antes exigían que el aviso SALIERA hoy exigen lo contrario,
// y lo dicen con este mismo motivo escrito al lado.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * QUÉ DEJÓ DE COMPRAR — lo que compraba en el período anterior y ahora no.
 *
 * Ordenado por CUÁNTA PLATA ERA, de mayor a menor: es el orden en el que uno
 * decide a quién llamar y por qué.
 *
 * 🔴 LAS DOS COSAS QUE NO SON LO MISMO, Y POR ESO CADA RENGLÓN LLEVA SU
 * ETIQUETA: que el CLIENTE haya dejado de comprar algo que la empresa le sigue
 * vendiendo a otros (ahí hay a quién llamar) no es lo mismo que la empresa haya
 * dejado de venderlo (no hay nada que reclamar, y llamar por eso quema la
 * llamada). Se calcula contra las descripciones que la tabla de arriba YA tiene
 * en pantalla para el período actual — sin una consulta más.
 *
 * Lista CORTA, dentro del mismo filtro: cinco renglones y el resto contado. Si
 * no dejó de comprar nada, no se dibuja nada — un cartel que dice "sin novedad"
 * es ruido.
 */
function DejoDeComprar({
  filas, cargando, fallo, desde, hasta,
}: {
  filas: DejadoDeComprar[];
  cargando: boolean;
  fallo: boolean;
  desde: string | undefined;
  hasta: string | undefined;
}) {
  if (fallo) {
    return (
      <p data-dejo-de-comprar-fallo className="mb-3 text-xs text-gray-500">
        No se pudo cargar qué dejó de comprar.
      </p>
    );
  }
  if (cargando) {
    return <p data-dejo-de-comprar-cargando className="mb-3 text-xs text-gray-400">Cargando…</p>;
  }
  if (filas.length === 0) return null;

  const visibles = filas.slice(0, DEJADOS_VISIBLES);
  const restantes = filas.length - visibles.length;
  return (
    <div data-dejo-de-comprar className="mb-3 rounded-lg border border-gray-200 bg-white px-3 py-2">
      <p className="mb-1.5 text-xs font-medium text-gray-700">
        Dejó de comprar
        {desde && hasta && (
          <span className="ml-1.5 font-normal text-gray-400">
            ({fmtDia(desde)} – {fmtDia(hasta)})
          </span>
        )}
      </p>
      <table className="w-full text-xs">
        <tbody>
          {visibles.map(f => (
            <tr key={f.descripcion} className="border-b border-gray-100 last:border-0">
              <td className="py-1.5 pr-3 text-gray-700">{f.descripcion}</td>
              <td className="py-1.5 pr-3 text-right font-mono tabular-nums text-gray-800">{fmtMoney(f.venta)}</td>
              {/* Dos palabras, no una explicación: ámbar = hay a quién llamar,
                  gris = el producto ya no se vende y no hay nada que reclamar. */}
              <td className="py-1.5 text-right">
                <span
                  data-etiqueta={f.seSigueVendiendo ? "se-sigue-vendiendo" : "ya-no-se-vende"}
                  /* 🩸 `text-[11px]` NO: la regla de la casa es 12 px mínimo en
                     lo que se lee, y la medición de los 4 anchos lo cazó (5
                     etiquetas a 11 px en los cuatro). `text-xs` son 12. */
                  className={`whitespace-nowrap rounded px-1.5 py-0.5 text-xs ${
                    f.seSigueVendiendo ? "bg-amber-50 text-amber-800" : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {f.seSigueVendiendo ? "se sigue vendiendo" : "ya no se vende"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {restantes > 0 && (
        <p data-dejados-restantes className="mt-1.5 text-xs text-gray-400">
          y {restantes} {restantes === 1 ? "más" : "más"}
        </p>
      )}
    </div>
  );
}

/**
 * QUÉ DEJÓ DE VENDERSE — el reverso de la etiqueta «Nuevo» (5-sep-2026).
 *
 * Productos ya marcaba en verde lo que este año existe y el pasado no. Faltaba
 * lo contrario, que no estaba en ninguna pantalla del sistema: lo que el año
 * pasado, en este MISMO período, vendió — y este año no vendió nada.
 *
 * 🔴 EL RÓTULO DICE LO QUE SE MIDIÓ. No dice «se descontinuó» ni «se agotó»:
 * el sistema no sabe eso. Dice qué vendía antes y que hoy está en cero, con las
 * dos fechas del período comparado al lado, que es lo que permite entenderlo
 * sin preguntar.
 *
 * Lista CORTA y plegable: los primeros cinco, que son los que mueven la plata,
 * y el resto a un toque. Si no dejó de venderse nada, no se dibuja nada — un
 * cartel que dice «sin novedad» es ruido.
 */
function DejoDeVenderse({
  filas, comparativo,
}: {
  filas: DejadoDeVender[];
  comparativo: ProductosResponse["comparativo"];
}) {
  const [abierto, setAbierto] = useState(false);
  if (filas.length === 0) return null;
  const visibles = abierto ? filas : filas.slice(0, DEJADOS_VISIBLES);
  const restantes = filas.length - visibles.length;
  const total = totalDejadoDeVender(filas);
  return (
    <div data-dejo-de-venderse className="mb-3 rounded-lg border border-gray-200 bg-white px-3 py-2">
      <p className="mb-1.5 text-xs font-medium text-gray-700">
        Dejó de venderse
        <span className="ml-1.5 font-normal text-gray-500">
          <span className="font-mono tabular-nums">{filas.length}</span>
          {filas.length === 1 ? " descripción que vendía " : " descripciones que vendían "}
          <span className="font-mono tabular-nums">{fmtMoney(total)}</span>
        </span>
        {comparativo && (
          <span className="ml-1.5 font-normal text-gray-400">
            ({fmtDia(comparativo.desde)} – {fmtDia(comparativo.hasta)})
          </span>
        )}
      </p>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-[0.04em] text-gray-400">
            <th className="py-1.5 pr-3 font-normal">Descripción</th>
            <th className="py-1.5 text-right font-normal">Vendía</th>
          </tr>
        </thead>
        <tbody>
          {visibles.map(f => (
            <tr key={f.descripcion} className="border-b border-gray-100 last:border-0">
              <td className="py-1.5 pr-3 text-gray-700">{f.descripcion}</td>
              <td className="py-1.5 text-right font-mono tabular-nums text-gray-800">{fmtMoney(f.ventaAntes)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {(restantes > 0 || abierto) && (
        // 🔴 No es la paginación que se acaba de retirar: la LISTA de productos
        // se ve entera. Esto es un aviso lateral de cinco renglones que se
        // despliega de un toque y vuelve a plegarse, como el bloque de los
        // clientes en cero. 44 px táctiles.
        <button
          type="button"
          data-dejados-de-vender-mas
          aria-expanded={abierto}
          onClick={() => setAbierto(v => !v)}
          className="mt-1 min-h-[44px] text-xs font-medium text-teal-700"
        >
          {abierto ? "ver menos" : `ver las ${filas.length}`}
        </button>
      )}
    </div>
  );
}
