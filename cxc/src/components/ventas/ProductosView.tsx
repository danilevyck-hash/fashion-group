"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Download, Search, ChevronRight } from "lucide-react";
import { SkeletonTable } from "@/components/ui";
import { MONTHS, fmtMoney } from "@/lib/ventas/format";
import { variacionPct } from "@/lib/variacion";
import {
  fmtParticipacion,
  participacion,
  totalDeClientes,
  type ClienteDeProducto,
  type GrafiaSolapada,
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
const PAGE = 20;

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
  const [visible, setVisible] = useState(PAGE);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [codigos, setCodigos] = useState<Record<string, ProductoCodigo[]>>({});
  // Quién compra cada descripción. `null` = la lectura falló (distinto de `[]`,
  // que es "no hay detalle"): son dos mensajes distintos y no se pueden mezclar.
  const [clientes, setClientes] = useState<Record<string, ClienteDeProducto[] | null>>({});
  // Con qué OTRAS grafías del mismo producto se solapa cada descripción. Vacío
  // = no hay solape y no se dibuja ningún aviso.
  const [grafias, setGrafias] = useState<Record<string, GrafiaSolapada[]>>({});
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
      setGrafias({});
      // La matriz es de ESTE período y de ESTA empresa: dejarla puesta mostraría
      // los números de la anterior. Se vuelve a pedir sola si el filtro está
      // puesto (ver el efecto de más abajo).
      setMatriz(null);
      setMatrizEstado("sin-pedir");
      setPrevio({});
      setExpanded(null);
      setVisible(PAGE);
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
    setVisible(PAGE);
  };

  const onFiltroClienteChange = (v: string) => {
    setFiltroCliente(v);
    setVisible(PAGE);
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

  const visibleRows = rows.slice(0, visible);

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
            grafias?: GrafiaSolapada[];
          };
          setCodigos(prev => ({ ...prev, [key]: json.codigos }));
          setClientes(prev => ({ ...prev, [key]: json.clientes ?? null }));
          setGrafias(prev => ({ ...prev, [key]: json.grafias ?? [] }));
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
            {PRODUCTOS_EMPRESAS.map(e => (
              <SelectItem key={e.key} value={e.key} className="text-xs">{e.nombre}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Los 4 períodos de Daniel + el mes suelto de siempre, en un solo
            desplegable: dos controles de período uno al lado del otro obligan a
            adivinar cuál manda. */}
        <Select value={periodo} onValueChange={onPeriodoChange}>
          <SelectTrigger className="h-11 w-auto min-w-[150px] text-xs" disabled={loading}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ytd" className="text-xs">{periodoLabel(selectedYear, null, "ytd")}</SelectItem>
            {PERIODOS_FIJOS.map(p => (
              <SelectItem key={p.key} value={p.key} className="text-xs">{p.nombre}</SelectItem>
            ))}
          </SelectContent>
        </Select>

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
            onChange={e => { setSearch(e.target.value); setVisible(PAGE); }}
            placeholder="Buscar descripción…"
            /* text-base en móvil: Safari hace zoom al enfocar un input con
               letra < 16px (text-xs = 12px). Desde sm vuelve al text-xs. */
            className="h-11 pl-8 text-base sm:text-xs"
          />
        </div>

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
              se cuenta desde hoy hacia atrás. Para mirar un año elegí «{periodoLabel(selectedYear, null, "ytd")}» o un mes.
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

      {/* Tabla nivel 1 */}
      {data && !loading && !esperandoMatriz && !error && (
        /* 🩸 SIN `min-w-[560px]`. Ese mínimo inventado era TODO el arrastre:
           medido en el navegador (scripts/_ancho-util-ventas.mjs), la tabla
           necesita 318 px en un iPhone de 390 (donde sólo se ven Descripción,
           Venta y Margen) contra 356 disponibles — ENTRA de sobra. Los 204 px
           que se arrastraban eran los 560 forzados, no los datos. Acá la tabla
           no pasa a tarjetas porque no hace falta: entra. */
        <div className="overflow-x-auto rounded-lg border border-gray-200">
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
                  grafias={grafias[p.descripcion] ?? []}
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

      {/* Mostrar más */}
      {data && !loading && !esperandoMatriz && !error && rows.length > visible && (
        <div className="mt-3 text-center">
          {/* size="sm" da 32px de alto — min-h-[44px] lo lleva al mínimo. */}
          <Button variant="outline" size="sm" onClick={() => setVisible(v => v + PAGE)} className="min-h-[44px]">
            Mostrar más ({rows.length - visible} restantes)
          </Button>
        </div>
      )}
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
  p, isOpen, onToggle, codigos, clientes, grafias, codigosLoading, prevVenta, comparativoMedido, mostrarMargen, tab, onTab,
}: {
  p: ProductoNivel1;
  isOpen: boolean;
  onToggle: () => void;
  codigos: ProductoCodigo[] | undefined;
  clientes: ClienteDeProducto[] | null | undefined;
  grafias: GrafiaSolapada[];
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
          <div className="flex items-center gap-1.5">
            <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform ${isOpen ? "rotate-90" : ""}`} />
            <span className="text-gray-800">{p.descripcion}</span>
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

                  {tab === "clientes" && (
                    <BloqueClientes clientes={clientes} grafias={grafias} descripcion={p.descripcion} />
                  )}
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
function BloqueClientes({
  clientes, grafias, descripcion,
}: {
  clientes: ClienteDeProducto[] | null | undefined;
  grafias: GrafiaSolapada[];
  descripcion: string;
}) {
  if (clientes === null) {
    return <div className="py-2 text-xs text-gray-500">No se pudo cargar quién lo compra. Cerrá y volvé a abrir la fila.</div>;
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
      <AvisoGrafias grafias={grafias} descripcion={descripcion} />
      <table data-drill-clientes className="w-full text-xs">
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
              <td className="py-1.5 text-right font-mono tabular-nums text-gray-500">
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
    <table data-drill-codigos className="w-full text-xs">
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

/**
 * 🟡 EL AVISO DE QUE LA LISTA SUMA MÁS QUE LA FILA — y por qué.
 *
 * 🩸 EN SWITCH EL MISMO PRODUCTO ESTÁ ESCRITO DE DOS FORMAS, y está medido
 * contra producción: `Women-Small Leather Goods` y `Women-Small Leather`,
 * `Agua Dana 1.5 Litro` y `Agua Dana 1.5 litro `. Un código vive bajo las dos.
 * La fila de arriba suma sólo las filas de SU grafía; la lista de clientes trae
 * TODAS las líneas de esos códigos. En vistana eso son 23 de 103 descripciones
 * con una lista que suma de más — «Men-Shirts Woven S/S» dice $142,00 en la
 * fila y $2.199,00 en la lista.
 *
 * Las tres decisiones, y cada una tiene su motivo:
 *
 * · SE DICE, no se tapa ni se adivina. Repartir la venta entre las dos grafías
 *   sería INVENTAR: la línea de la factura no sabe nada de la descripción de
 *   `switch_articulo_diario`. Y esconder la lista sería sacar justo la función
 *   que Daniel pidió.
 *
 * · LA FILA DE ARRIBA NO SE TOCA: sigue siendo la suma de SU grafía. Dos
 *   números distintos ya conviven en este módulo; cada uno dice su verdad y el
 *   aviso explica la diferencia.
 *
 * · ÁMBAR, NO ROJO: no se rompió nada. Y SÓLO cuando hay solape de verdad,
 *   calculado por código — un cartel fijo "los números pueden no cuadrar" es la
 *   alerta que se deja de leer a la semana.
 *
 * Se nombran LAS DOS GRAFÍAS y el código que las comparte: sin eso, el aviso no
 * le sirve a nadie para ir a corregirlo en Switch, que es la única salida real.
 */
function AvisoGrafias({ grafias, descripcion }: { grafias: GrafiaSolapada[]; descripcion: string }) {
  if (grafias.length === 0) return null;
  return (
    <p
      data-aviso-grafias
      className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
    >
      La lista de abajo suma más que la venta de la fila. En Switch este producto
      está escrito de {grafias.length === 1 ? "dos formas" : `${grafias.length + 1} formas`}
      {": "}
      <span className="font-medium">&ldquo;{descripcion}&rdquo;</span>
      {grafias.map(g => (
        <span key={g.otra}>
          {" y "}
          <span className="font-medium">&ldquo;{g.otra}&rdquo;</span>
          <span className="opacity-80"> (comparten el código {g.codigo})</span>
        </span>
      ))}
      . La fila de arriba cuenta sólo la primera; acá abajo están los clientes de
      todas. Se arregla corrigiendo el nombre en Switch.
    </p>
  );
}

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
