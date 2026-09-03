"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrowUpDown, Search } from "lucide-react";
import type { Clientes, Cliente } from "./types";
import { fmtMoney, fmtMoneyCompact } from "@/lib/ventas/format";
import { formatDeltaRatio, type DeltaTone } from "@/lib/ventas/formatDelta";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { ClienteHoverCard, type HistorialState } from "./ClienteHoverCard";
import { ClienteSheet } from "./ClienteSheet";
import { OtrosClientesDialog } from "./OtrosClientesDialog";
import { SortSheet } from "./SortSheet";
import { EMPRESA_KEY_TO_NAME, B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import { coincideBusqueda } from "@/lib/buscar-normalizado";
import { esMostrador } from "@/lib/clientes/mostrador";
import SyncNowButton from "@/components/shared/SyncNowButton";
import { SYNC_NOW_VENTAS_SECUENCIA } from "@/components/shared/syncNowOpciones";

type SortKey = "rank" | "nombre" | "empresa" | "ytd" | "delta" | "ultima";
type SortDir = "asc" | "desc";

// Mapping de tono semántico → clase Tailwind para celdas con bg claro.
// Histórico de Clientes usa red-600 para negativos (no orange-600 como Resumen).
const TONE_LIGHT: Record<DeltaTone, string> = {
  emerald: "text-emerald-600",
  orange:  "text-red-600",
  stone:   "text-gray-500",
};

// (SORT_LABELS se retiró con el subtítulo "ordenados por X": el encabezado de
// columna activo ya muestra el criterio, y en celular lo dice el SortSheet.)

// Pills del filtro de empresa: "Todas" + LAS SEIS DE FASHION GROUP.
//
// 🔴 SE DERIVA DE `B2B_EMPRESA_KEYS`, NO SE ENUMERA. Daniel, 2-sep-2026:
// *"deberían estar solo las 6 de Fashion Group, que son las 5 de las fotos y
// joystep"*. Boston y Multifashion no están porque no son del grupo — la lista
// EXCLUYE por construcción (nombra a las 6 que sí), no por un `.filter`.
//
// 🩸 ACÁ FALTABA JOYSTEP, y el comentario que estaba en su lugar decía que era
// "decisión visual". No lo era: era una lista escrita a mano que se quedó en 5
// cuando joystep entró al grupo. Es la CUARTA vez que este repo paga una lista
// de empresas copiada a mano — ver el post-mortem de Comisiones, donde
// `ComisionesView.tsx` tenía su propio `.filter(k => k !== "joystep")` mientras
// las otras tres vistas ya leían la constante.
//
// La PLATA nunca se perdió y está medido (2-sep-2026): el modo "Todas" lee
// `clientes_agregado_12m_vw`, que incluye a joystep desde siempre. Lo que
// faltaba era poder FILTRAR por ella: sus 14 clientes no se podían aislar.
const EMPRESA_PILLS: { id: string; label: string }[] = [
  { id: "todas", label: "Todas" },
  ...B2B_EMPRESA_KEYS.map((key) => ({
    id: key,
    label: EMPRESA_KEY_TO_NAME[key] ?? key,
  })),
];

// Pills donde la fila agregada "Otros clientes" NO se renderiza.
// Boston y Multifashion son retail con semántica propia; no consolidan
// huérfanos en una fila agregada.
const SKIP_OTROS_FOR = new Set(["confecciones_boston", "american_classic"]);

// 🔴 EL MISMO RENGLÓN DICE LA MISMA FRASE EN LAS DOS PANTALLAS. En escritorio
// decía "click para ver detalle" y en el celular "Ver detalle de huérfanos sin
// master" — la segunda es jerga de base de datos ("huérfano", "master") que no
// significa nada para quien usa la app, y encima eran dos textos distintos para
// el MISMO botón: quien lo aprende en el celular no lo reconoce en la
// computadora. Una sola constante para que no puedan volver a separarse.
const OTROS_CLIENTES_PISTA = "Tocar para ver el detalle";

/** Lo que la columna de cambio está comparando, dicho con todas las letras y con
 *  el año REAL. Criterio del PR #573 en Ventas › Productos: un símbolo suelto no
 *  dice contra qué se compara, así que el período se imprime al lado del total.
 *  Una sola frase para las dos pantallas (escritorio y celular). */
const textoComparativo = (anio: number) =>
  `El cambio compara contra el mismo período de ${anio}`;

// El mostrador (ventas de contado en tienda) no es un cliente real → se marca y
// se saca del ranking. Se reconoce por su CÓDIGO, `esMostrador(c.id)`.
//
// 🩸 ACÁ DECÍA `nombre.trim().toUpperCase() === "VENTAS LOCAL"`, Y ESO ES LO QUE
// HACÍA QUE LA FILA ÁMBAR MOSTRARA UNA EMPRESA DE SEIS: $25.835,65 cuando el
// mostrador del grupo es $54.478,59 (medido el 2-sep-2026). **Identificar un
// cliente por su nombre falla porque el nombre es de cada empresa; el código es
// del grupo.** El mostrador es `TCKCTA` en las seis y se llama distinto en cada
// una — "Contado" en joystep/active_wear/active_shoes, "VENTAS" en
// fashion_wear/vistana, "VENTAS LOCA" (truncado) en fashion_shoes. **Ninguna se
// llama "VENTAS LOCAL"**: ese texto salía de `clientes_master`, que tiene UNA
// fila `TCKCTA` con el nombre canónico, y el join se lo pegaba encima a la única
// fila que sobrevivía. Por eso a veces coincidía y casi siempre no.
//
// Es la MISMA regla que Daniel fijó esta mañana para todo el ranking (commit
// 44be9b16, *"se debería de usar el código del cliente, ya que todos los D-24
// son de City Mall across mis 6 empresas"*): el código es la identidad, el
// nombre varía. El defecto seguía vivo un piso más arriba, acá y en el
// `filtered` del SQL — ver `20260908120000_mostrador_por_codigo.sql`.
//
// `esMostrador` es la definición que ya usaban las RPC de comisión y el checkout
// público. No se copia: se importa.

interface ClientesViewProps {
  data: Clientes;
  /** Año del selector global. Para año en curso: vista rolling 12m
   *  (chip "Vista 12m"). Para año cerrado: vista YTD anual (chip "Año 2025"). */
  selectedYear: number;
  isClosedYear: boolean;
}

export function ClientesView({ data: initialData, selectedYear, isClosedYear }: ClientesViewProps) {
  const [search, setSearch] = useState("");
  const [empresa, setEmpresa] = useState("todas");
  const [data, setData] = useState<Clientes>(initialData);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  // Sort default: año cerrado → ordenar por compras YTD (vista anual);
  // año en curso → última compra (vista rolling 12m).
  const [sortBy, setSortBy] = useState<SortKey>(isClosedYear ? "ytd" : "ultima");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  // PERÍODO (universo) separado del ORDEN: ordenar NUNCA cambia qué clientes se
  // ven. "12m" = universo rolling (todos los activos en 12 meses, incluidos los
  // sin compras este año); "ytd" = estricto del año en curso (ytd>0). Antes esto
  // estaba acoplado al sort y ordenar por "Compras YTD" borraba clientes en
  // silencio. Para año cerrado no aplica (la RPC ya filtra el año).
  const [vista, setVista] = useState<"12m" | "ytd">("12m");
  const [otrosOpen, setOtrosOpen] = useState(false);
  const [sheetCliente, setSheetCliente] = useState<Cliente | null>(null);
  const [sortOpen, setSortOpen] = useState(false);

  // 🔴 EL AÑO DEL RÓTULO SALE DEL MISMO DATO QUE HACE LA CUENTA. Antes decía
  // "Δ vs 2025" clavado: con 2025 elegido arriba, la pantalla decía
  // "Compras 2025 · Δ vs 2025" y en realidad comparaba contra 2024 — el rótulo
  // afirmaba lo contrario de lo que mostraba la columna. El servidor manda el
  // año junto con el delta; el respaldo `selectedYear - 1` es para un payload
  // viejo que quedó en la caché de SWR, y da el MISMO número.
  const anioComparativo = data.anioComparativo ?? selectedYear - 1;

  // Pill click → refetch desde server (la branching cliente/empresa vive en queries.ts)
  const onEmpresaChange = async (next: string) => {
    if (next === empresa) return;
    setEmpresa(next);
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(
        `/api/ventas/clientes-12m?empresa=${encodeURIComponent(next)}&year=${selectedYear}`,
        { cache: "no-store" }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      const fresh = (await res.json()) as Clientes;
      startTransition(() => setData(fresh));
    } catch (err) {
      console.error("[ventas/clientes] refetch failed", err);
      setFetchError(err instanceof Error ? err.message : "error inesperado");
    } finally {
      setLoading(false);
    }
  };

  // Reload de la lista tras "Actualizar ahora" (misma empresa/año vigentes).
  // La data del tab sale de clientes_empresa_12m_vw → el refetch recién tiene
  // sentido DESPUÉS del paso final refresh-vistas de la secuencia.
  const reloadData = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/ventas/clientes-12m?empresa=${encodeURIComponent(empresa)}&year=${selectedYear}`,
        { cache: "no-store" }
      );
      if (!res.ok) return;
      const fresh = (await res.json()) as Clientes;
      startTransition(() => setData(fresh));
    } catch {
      /* el toast del botón ya informó; la lista queda con lo que había */
    }
  }, [empresa, selectedYear]);

  // Cache de historial-mensual por (codigo + empresaKey). Lazy: solo se
  // popula al primer hover/tap sobre cada cliente. El CXC aging se fetchea
  // y cachea internamente en ClienteHoverCard (cache module-level allá).
  const [historialCache, setHistorialCache] = useState<Record<string, HistorialState>>({});
  const histInFlight = useRef<Set<string>>(new Set());

  const loadHistorial = useCallback((codigo: string, empresaKey: string) => {
    const histKey = `${codigo}|${empresaKey}`;
    if (histInFlight.current.has(histKey)) return;
    let trigger = false;
    setHistorialCache(prev => {
      if (prev[histKey] && prev[histKey].status !== "idle") return prev;
      trigger = true;
      return { ...prev, [histKey]: { status: "loading" } };
    });
    if (!trigger) return;
    histInFlight.current.add(histKey);
    fetch(`/api/clientes/${encodeURIComponent(codigo)}/historial-mensual?empresa=${encodeURIComponent(empresaKey)}`)
      .then(async r => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${r.status}`);
        }
        return r.json();
      })
      .then(data => setHistorialCache(prev => ({ ...prev, [histKey]: { status: "ready", data } })))
      .catch(err => setHistorialCache(prev => ({
        ...prev,
        [histKey]: { status: "error", message: err?.message ?? "Error al cargar" },
      })))
      .finally(() => { histInFlight.current.delete(histKey); });
  }, []);

  // Vista 12m (universo rolling) vs YTD strict — el universo cambia con
  // el sort: cuando el usuario ordena por última compra quiere ver a TODOS
  // los clientes activos en los últimos 12 meses, incluyendo los que no
  // compraron aún en el año en curso. Para cualquier otro sort, la lista
  // se restringe a clientes con compras YTD > 0 (vista "estricta del año").
  //
  // Para años cerrados, la vista rolling 12m no aplica — la RPC clientes_anio
  // ya filtra al año específico. Forzamos is12mView=false.
  const is12mView = !isClosedYear && vista === "12m";

  // Etiquetas del chip "Vista".
  //
  // 🩸 Decían "Últimos 12 meses" mientras la columna de plata decía "Compras
  // YTD" — dos períodos distintos en la misma pantalla, y Daniel lo leyó como
  // una contradicción. No lo era, pero el texto mentía por omisión: el chip
  // elige QUÉ CLIENTES se listan (los que compraron en los últimos 12 meses, o
  // sólo los que compraron este año) y la columna SIEMPRE muestra las compras
  // del AÑO EN CURSO. Ahora el chip dice "Clientes: …" y la columna dice
  // "Compras {año}", así que cada texto nombra lo que de verdad hace.
  const vistaChipLabel = isClosedYear
    ? `Año ${selectedYear}`
    : (is12mView ? "Clientes 12m" : `Clientes ${selectedYear}`);
  const vistaChipLong = isClosedYear
    ? `Año ${selectedYear}`
    : (is12mView ? "Clientes: últimos 12 meses" : `Clientes: con compras en ${selectedYear}`);
  // El período NO se repite en el contador de clientes (limpieza jul-2026): el
  // chip de al lado ya lo dice y además es clicable para cambiarlo. El prefijo
  // "Vista:" del propio chip se podó en ago-2026 — el valor ya se lee solo.
  const vistaChipTitle = isClosedYear
    ? `Vista anual: clientes con compras en ${selectedYear} y delta vs ${selectedYear - 1}.`
    : (is12mView
        ? "Universo rolling de 12 meses (incluye clientes sin compras este año). Toca para ver solo el año en curso."
        : "Estricto del año en curso (solo clientes con compras YTD). Toca para ver los últimos 12 meses.");
  // Color del chip: teal cuando 12m rolling (señal "expandido"), stone para
  // YTD strict o año cerrado.
  const vistaChipTone = is12mView ? "bg-teal-50 text-teal-700" : "bg-gray-100 text-gray-700";

  // Universo según el PERÍODO (no el sort). El mostrador queda fuera (se muestra
  // marcado aparte, fuera del ranking). Esto define qué huérfanos van a "Otros".
  const universe = useMemo(() => {
    const base = data.rows.filter(c => !esMostrador(c.id));
    return is12mView ? base : base.filter(c => c.ytd > 0);
  }, [data.rows, is12mView]);

  // La fila-mostrador: SUMA de todas las filas de mostrador que llegaron.
  //
  // 🔑 NO ES UN `find`, Y ES LO QUE HACE QUE EL NÚMERO SEA EL CORRECTO. El grano
  // del ranking es (cliente, EMPRESA), así que el mostrador llega como una fila
  // POR EMPRESA; quedarse con la primera es mostrar una sexta parte y llamarla
  // el total.
  //
  // 🔴 Y ES COHERENTE CON EL FILTRO POR CONSTRUCCIÓN: se suma lo que llegó, y lo
  // que llega ya lo decidió el filtro de empresa en el servidor. Con "Todas" es
  // el mostrador del grupo; con una empresa elegida, el de esa empresa. Acá no
  // hay ninguna lista de empresas que se pueda desincronizar del filtro — la
  // única forma de que esta fila sume una empresa que el usuario excluyó sería
  // que el servidor se la mandara, y entonces el bug estaría allá.
  const mostradorRow = useMemo<Cliente | null>(() => {
    const filas = data.rows.filter(c => esMostrador(c.id));
    if (filas.length === 0) return null;
    const ytd = filas.reduce((s, f) => s + f.ytd, 0);
    const ultimaIso = filas.map(f => f.ultimaIso).filter(Boolean).sort().pop() ?? "";
    // El nombre solo se muestra si las filas están de acuerdo. Con la fila de
    // `clientes_master` puesta llegan todas como "VENTAS LOCAL"; si algún día no
    // estuviera, cada empresa traería el suyo y elegir uno sería rotular seis
    // mostradores con el nombre de uno. La etiqueta ámbar y la pista de abajo ya
    // dicen qué es esta fila.
    const nombres = new Set(filas.map(f => f.nombre.trim()));
    return {
      ...filas[0],
      nombre: nombres.size === 1 ? filas[0].nombre : "",
      ytd,
      ultimaIso,
      ultima: filas.find(f => f.ultimaIso === ultimaIso)?.ultima ?? "",
    };
  }, [data.rows]);

  // Huérfanos del universo actual (cliente_id NULL en la materialized view).
  // Sólo aplica para pills B2B; Boston/Multi se manejan sin Otros row.
  const orphans = useMemo(() => {
    if (SKIP_OTROS_FOR.has(empresa)) return [];
    return universe.filter(c => c.isOrphan);
  }, [universe, empresa]);

  // Fila sintética "Otros clientes" — null cuando no hay huérfanos
  // (o cuando la pill activa es Boston/Multi).
  const otrosRow = useMemo<Cliente | null>(() => {
    if (orphans.length === 0) return null;
    const sumYtd  = orphans.reduce((s, o) => s + o.ytd, 0);
    const sumPrev = orphans.reduce((s, o) => s + o.prev, 0);
    // Delta same-period agregado: (Σytd - Σprev) / Σprev. Misma fórmula
    // que aplica el resto del módulo (ver migration 040 fix same-period).
    const aggDelta = sumPrev > 0 ? (sumYtd - sumPrev) / sumPrev : 0;
    const maxUltimaIso = orphans
      .map(o => o.ultimaIso)
      .filter(Boolean)
      .sort()
      .pop() ?? "";
    const ultimaDisplay = maxUltimaIso
      ? orphans.find(o => o.ultimaIso === maxUltimaIso)?.ultima ?? ""
      : "";
    const empresaLabel = empresa === "todas"
      ? "Varias"
      : EMPRESA_KEY_TO_NAME[empresa] ?? empresa;
    return {
      rank: 0,
      id: "",
      nombre: `Otros clientes (${orphans.length})`,
      empresa: empresaLabel,
      empresaKey: empresa === "todas" ? "" : empresa,
      ytd: sumYtd,
      prev: sumPrev,
      delta: aggDelta,
      ultima: ultimaDisplay,
      ultimaIso: maxUltimaIso,
      wa: "",
      empresas_count: 1,
      isOrphan: false,
      isOtrosAggregate: true,
    };
  }, [orphans, empresa]);

  const filtered = useMemo(() => {
    // Masters: universo sin huérfanos.
    const masters = universe.filter(c => !c.isOrphan);
    let r = masters.slice();
    if (search) {
      // 🩸 BUSCAR ALCANZA TAMBIÉN A LOS HUÉRFANOS (27-jul-2026). Antes la
      // búsqueda corría sólo sobre `masters`: un cliente sin match en
      // clientes_master quedaba colapsado dentro de "Otros clientes (N)" y era
      // IMPOSIBLE de encontrar escribiendo su nombre. Medido contra producción:
      // 7 clientes con compras en los últimos 12 meses estaban en ese pozo
      // (CEPREDENAC, NIPMAR, KAREN DUTY FREE, FERIA INT DE DAVID, ISABEL
      // MARTINEZ, ALMACEN JORDANIA, MAZAR CITY SHOES) — justo los que le
      // aparecieron a Daniel al buscar "mult". Escribir un nombre tiene que
      // encontrar al cliente exista o no en el maestro.
      //
      // Y se compara normalizando espacios/acentos/mayúsculas, igual que el
      // módulo Clientes: "multifashion" y "Multi Fashion" son la misma búsqueda.
      r = [...masters, ...orphans].filter(c => coincideBusqueda(search, [c.nombre, c.id]));
    }
    r.sort((a, b) => {
      const sign = sortDir === "asc" ? 1 : -1;
      switch (sortBy) {
        case "rank":    return (a.rank - b.rank) * sign;
        case "nombre":  return a.nombre.localeCompare(b.nombre) * sign;
        case "empresa": return a.empresa.localeCompare(b.empresa) * sign;
        case "ytd":     return (a.ytd - b.ytd) * sign;
        case "delta":   return (a.delta - b.delta) * sign;
        case "ultima":  return a.ultimaIso.localeCompare(b.ultimaIso) * sign;
      }
    });
    // La fila "Otros clientes" no participa del sort: se ancla al final
    // independiente del criterio. Razón: es una agregación de huérfanos
    // que no compite con clientes individuales — colocarla al fondo evita
    // que se mezcle entre clientes reales y confunda la lectura.
    // Con búsqueda activa la fila agregada NO va: sus integrantes ya se están
    // buscando uno por uno, y dejarla puesta mostraba "Otros clientes (7)" como
    // si fuera un resultado de la búsqueda cuando ninguno de los 7 coincidía.
    if (otrosRow && !search) r.push(otrosRow);
    return r;
  }, [universe, orphans, search, sortBy, sortDir, otrosRow]);

  const onSort = (col: SortKey) => {
    if (sortBy === col) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir(col === "nombre" || col === "empresa" ? "asc" : "desc"); }
  };

  // Lookup helper para HoverCard/Sheet
  const histStateFor = (c: Cliente): HistorialState =>
    historialCache[`${c.id}|${c.empresaKey}`] ?? { status: "idle" };

  // En modo "Todas", mostrar la empresa principal en las cards mobile.
  // En modo empresa específica, la empresa está implícita en el filtro,
  // así que se omite del subtítulo para reducir ruido visual.
  const showEmpresaInCard = empresa === "todas";

  return (
    <div className={cn("space-y-3", loading && "opacity-60 pointer-events-none transition-opacity")}>
      {fetchError && (
        <div className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-900">
          No se pudo cargar la lista: {fetchError}
        </div>
      )}

      {/* Sticky header: search + counter + pills + sort button (mobile only). */}
      <div className="sticky top-0 z-20 -mx-1 space-y-2 border-b border-gray-200 bg-gray-50 px-1 pb-2.5 pt-2.5">
        <div className="flex flex-wrap items-center gap-2 md:gap-3">
          <div className="relative min-w-[180px] max-w-full flex-1 md:max-w-[360px]">
            {/* La lupa se centra con top-1/2 (antes top-2.5 asumía el h-9 del
                Input; ahora el campo mide 44 y quedaría alta). */}
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar cliente o código…"
              /* h-11 = 44px táctiles (el default del Input es h-9 = 36) y
                 text-base en móvil para que Safari no haga zoom al enfocar
                 (el default text-sm son 14px). Desde sm vuelve a text-sm. */
              className="h-11 w-full pl-8 text-base sm:text-sm"
            />
          </div>

          {/* Sort button — visible sólo en mobile (md-). En desktop se usan
              los headers de columna clickeables. Texto fijo "Ordenar" para
              dejar más ancho al buscador; la opción actual + dirección se
              muestran adentro del SortSheet al abrirlo. */}
          <button
            type="button"
            onClick={() => setSortOpen(true)}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 active:bg-gray-100 lg:hidden"
            aria-label="Ordenar lista"
          >
            <ArrowUpDown className="h-3.5 w-3.5 text-gray-500" />
            <span>Ordenar</span>
          </button>

          {/* "Actualizar ahora" (admin/secretaria) — la data de este tab sale
              del vw clientes_empresa_12m: misma secuencia completa que Resumen
              (facturas de las 8 + refresh-vistas al final) y refetch. */}
          <SyncNowButton opciones={SYNC_NOW_VENTAS_SECUENCIA} secuencial onSuccess={reloadData} />

          {/* Counter + chip de vista — desktop: una línea. Mobile: apilado debajo. */}
          <div className="ml-auto hidden flex-wrap items-center justify-end gap-2 whitespace-nowrap text-xs text-gray-500 lg:flex">
            <p>
              {/* "ordenados por X" se fue: el encabezado de columna activo ya
                  lo dice con su flecha, en la misma pantalla y a la vista. */}
              <span className="font-mono text-gray-950">{filtered.length}</span> clientes
            </p>
            <p data-comparativo-clientes>{textoComparativo(anioComparativo)}</p>
            {isClosedYear ? (
              <span
                className={cn("rounded-md px-2 py-0.5 text-xs font-medium", vistaChipTone)}
                title={vistaChipTitle}
              >
                {/* Sin el prefijo "Vista:": el valor ya se lee solo. */}
                {vistaChipLong}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setVista(v => (v === "12m" ? "ytd" : "12m"))}
                /* 44 px: el iPad horizontal (1194) cae del lado de la tabla y
                   este chip se toca con el dedo. Medía 236×22. */
                className={cn("inline-flex min-h-[44px] items-center rounded-md px-2.5 text-xs font-medium transition active:scale-[0.97]", vistaChipTone)}
                title={vistaChipTitle}
              >
                {vistaChipLong} ⇄
              </button>
            )}
          </div>
        </div>

        {/* Counter mobile — texto en línea 1, chip de vista debajo en
            línea 2 con 6px de separación. Evita que el chip quede pegado
            al texto y dé sensación de amontonamiento. */}
        <div className="lg:hidden">
          <div className="text-xs text-gray-500">
            <span className="font-mono text-gray-950">{filtered.length}</span> clientes
          </div>
          {/* En el celular no hay encabezado de columna que rotule el %: sin
              esta línea, el "▲ +18%" de cada tarjeta no dice contra qué. */}
          <div data-comparativo-clientes className="mt-0.5 text-xs text-gray-500">
            {textoComparativo(anioComparativo)}
          </div>
          {isClosedYear ? (
            <span className={cn("mt-1.5 inline-flex rounded px-1.5 py-0.5 text-xs font-medium", vistaChipTone)}>
              {vistaChipLabel}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setVista(v => (v === "12m" ? "ytd" : "12m"))}
              /* 44 px: medía 107×26 y era el último blanco táctil chico de la
                 pantalla en iPhone. Cambia el universo de clientes que se
                 lista, así que errarle no es gratis. */
              className={cn("mt-1.5 inline-flex min-h-[44px] items-center gap-1 rounded px-2.5 text-xs font-medium active:scale-[0.97]", vistaChipTone)}
              title={vistaChipTitle}
            >
              {vistaChipLabel} ⇄
            </button>
          )}
        </div>

        {/* 🩸 ACÁ ESTABAN LOS 369 px DEL IPHONE, y no era la tabla: era esta tira
            de píldoras. En celular la tabla ya estaba resuelta con tarjetas
            desde antes; lo que quedaba arrastrando eran los seis filtros de
            empresa metidos en un `overflow-x-auto` con scroll-snap. Medido a
            390 px: 725 px de píldoras contra 356 visibles.

            Se resuelve con `flex-wrap`, una sola clase — es la misma salida que
            ganó por medición en los filtros del catálogo (#371), donde correr el
            breakpoint NI SIQUIERA LLEGABA A CERO. Envolver además ARREGLA el
            filtro en vez de sólo dejar de arrastrarlo: los seis se ven de una,
            que es lo que un filtro tiene que hacer. Los textos no se tocaron —
            "Vistana International" sigue diciendo lo mismo. */}
        <div className="-mx-1 px-1">
          <div className="flex flex-wrap gap-1.5">
            {EMPRESA_PILLS.map(p => {
              const active = empresa === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onEmpresaChange(p.id)}
                  disabled={loading}
                  className={cn(
                    // Box-sizing idéntico entre estados: ambos llevan border
                    // para que el activo no crezca 1px respecto al inactivo.
                    // Sólo cambian bg, text, y el color del border (mismo
                    // color que el bg en activo para que sea invisible).
                    // 44px, no 40: las pills de empresa son una tira scrollable
                    // y en iPhone se tocan de pasada — 4px de más evitan el
                    // filtro equivocado.
                    "min-h-[44px] whitespace-nowrap rounded-full border px-4 py-2.5 text-xs font-medium transition",
                    active
                      ? "border-teal-700 bg-teal-700 text-white"
                      : "border-gray-200 bg-white text-gray-700"
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ─────── Escritorio (lg+): tabla con encabezados clicables ───────
          🩸 EL CORTE SE MOVIÓ DE `md` (768) A `lg` (1024), y el motivo es un
          número: el ancho ÚTIL no es el viewport. La barra lateral se lleva
          223 px y el `main` otros 56, así que **un iPad de 834 px deja 552** —
          más angosto que un iPhone acostado. Por eso el iPad medía 368 px de
          arrastre contra los 369 del iPhone: no ganaba NADA por ser más ancho,
          la firma de que estaba recibiendo la pantalla de escritorio sin
          adaptar. Con el corte en `md` el iPad caía del lado de la tabla.

          `lg` no alcanzaba solo: el mínimo real de esta tabla era 791 px contra
          los 745 útiles de una pantalla de 1024, así que además se le bajó el
          piso — encabezados de dos líneas y menos relleno (ver `SortHeader` y
          `ClienteRow`). Medido después: 655 px de mínimo, entra con aire.

          El escritorio ancho no cambia: la tabla es `w-full` y el `minWidth`
          sólo actúa cuando el contenedor es más angosto que él. */}
      <Card className="hidden overflow-hidden p-0 lg:block">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: 680 }}>
            <thead>
              <tr className="bg-gray-100">
                <SortHeader col="rank"    align="right" sortBy={sortBy} sortDir={sortDir} onClick={onSort}>#</SortHeader>
                <SortHeader col="nombre"  align="left"  sortBy={sortBy} sortDir={sortDir} onClick={onSort}>Cliente</SortHeader>
                <SortHeader col="empresa" align="left"  sortBy={sortBy} sortDir={sortDir} onClick={onSort}>Empresa</SortHeader>
                <SortHeader col="ytd"     align="right" sortBy={sortBy} sortDir={sortDir} onClick={onSort}>Compras {selectedYear}</SortHeader>
                {/* Sin la "Δ": es notación de matemática y esta columna la lee gente
                    que no la conoce. "vs 2025" con las flechas de cada celda se
                    entiende solo, y el año es el REAL. */}
                <SortHeader col="delta"   align="right" sortBy={sortBy} sortDir={sortDir} onClick={onSort}>vs {anioComparativo}</SortHeader>
                <SortHeader col="ultima"  align="right" sortBy={sortBy} sortDir={sortDir} onClick={onSort}>Última compra</SortHeader>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, idx) => {
                if (c.isOtrosAggregate) {
                  return (
                    <OtrosRow
                      key="__otros__"
                      c={c}
                      onClick={() => setOtrosOpen(true)}
                    />
                  );
                }
                // Bug #5: el rank original de la materialized view era el
                // orden por compras_ytd DESC global. Como el usuario puede
                // sortear por nombre/empresa/última compra, esos IDs salían
                // desordenados (1, 7, 4, ...). Renumeramos 1..N según el
                // orden visual actual (idx + 1).
                return (
                  <ClienteRow
                    key={`${c.empresaKey}-${c.id}-${c.rank}`}
                    c={c}
                    displayRank={idx + 1}
                    histState={histStateFor(c)}
                    empresaScope={empresa}
                    onTriggerHistorial={() => loadHistorial(c.id, c.empresaKey)}
                  />
                );
              })}
              {mostradorRow && !search.trim() && (
                // `data-fila-mostrador` es el ancla ESTABLE que cruza fila y
                // tarjeta en el candado, igual que `data-fila-cliente`. Buscar
                // el monto por su texto encontraría los dos renders (la tabla y
                // la tarjeta) y no distinguiría CUÁL de los dos está mal.
                <tr data-fila-mostrador className="bg-amber-50/40">
                  <td className="border-b border-gray-200 px-2.5 py-3 text-right">
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">Mostrador</span>
                  </td>
                  <td className="border-b border-gray-200 px-2.5 py-3 text-sm font-medium text-gray-700" colSpan={2}>
                    {mostradorRow.nombre}
                    <span className="ml-2 text-xs font-normal text-gray-500">ventas de contado · fuera del ranking</span>
                  </td>
                  <td data-col="ytd" className="whitespace-nowrap border-b border-gray-200 px-2.5 py-3 text-right font-mono text-sm font-medium text-gray-700 tabular-nums">{fmtMoney(mostradorRow.ytd)}</td>
                  <td className="border-b border-gray-200 px-2.5 py-3 text-right text-gray-400">—</td>
                  <td className="whitespace-nowrap border-b border-gray-200 px-2.5 py-3 text-right font-mono text-xs text-gray-500 tabular-nums">{mostradorRow.ultima || "—"}</td>
                </tr>
              )}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-3.5 py-12 text-center text-sm text-gray-500">
                  No se encontraron clientes con esos filtros.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ─────── Mobile (-md): cards verticales ─────── */}
      <div className="space-y-2 lg:hidden">
        {filtered.map(c => {
          if (c.isOtrosAggregate) {
            return (
              <OtrosCard
                key="__otros_card__"
                c={c}
                onTap={() => setOtrosOpen(true)}
              />
            );
          }
          return (
            <ClienteCard
              key={`card-${c.empresaKey}-${c.id}-${c.rank}`}
              c={c}
              showEmpresa={showEmpresaInCard}
              onTap={() => setSheetCliente(c)}
            />
          );
        })}
        {mostradorRow && !search.trim() && (
          <div data-fila-mostrador className="rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">Mostrador</span>
              <span className="text-sm font-medium text-gray-700">{mostradorRow.nombre}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
              <span>ventas de contado · fuera del ranking</span>
              <span data-col="ytd" className="font-mono tabular-nums text-gray-700">{fmtMoney(mostradorRow.ytd)}</span>
            </div>
          </div>
        )}
        {filtered.length === 0 && (
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-12 text-center text-sm text-gray-500">
            No se encontraron clientes con esos filtros.
          </div>
        )}
      </div>

      <OtrosClientesDialog
        open={otrosOpen}
        onClose={() => setOtrosOpen(false)}
        orphans={orphans}
        showEmpresaColumn={empresa === "todas"}
        anioComparativo={anioComparativo}
      />

      {/* Sheet mobile: equivalente del HoverCard desktop. Aparece sólo
          en `md:hidden` (su breakpoint interno). El chip CXC se fetchea
          internamente en ClienteHoverCard. */}
      <ClienteSheet
        open={!!sheetCliente}
        onClose={() => setSheetCliente(null)}
        nombre={sheetCliente?.nombre ?? ""}
        codigo={sheetCliente?.id ?? ""}
        empresa={sheetCliente?.empresa ?? ""}
        empresaScope={empresa}
        historial={sheetCliente ? histStateFor(sheetCliente) : { status: "idle" }}
        onFirstHover={() => {
          if (sheetCliente) loadHistorial(sheetCliente.id, sheetCliente.empresaKey);
        }}
      />

      {/* Sort picker mobile — abre desde el botón "Ordenar" arriba. */}
      <SortSheet
        open={sortOpen}
        onClose={() => setSortOpen(false)}
        sortBy={sortBy === "rank" ? "ultima" : sortBy}
        sortDir={sortDir}
        onChange={(key, dir) => { setSortBy(key); setSortDir(dir); }}
      />
    </div>
  );
}

/**
 * Etiqueta "Del grupo": el cliente es una empresa nuestra comprándole a otra
 * empresa nuestra (Multi Fashion Holding, Confecciones Boston).
 *
 * 🩸 Antes estos clientes NO aparecían: la vista los tiraba con una lista negra.
 * Daniel: *"es un cliente al final del dia. tiene que aparecer"*, *"al final es
 * venta real"*. Y es cierto — Fashion Wear le factura y le tiene que cobrar.
 *
 * ⚠️ La etiqueta NO significa que se reste ni que quede fuera de los totales.
 * **Suma como cualquier otro cliente** (y de hecho SIEMPRE sumó: la exclusión
 * vivía sólo en este ranking, nunca en los totales de venta — medido). Está
 * para responder de un vistazo "¿esto lo vendí en la calle o es de casa?".
 */
function DelGrupoBadge() {
  return (
    <span
      className="ml-1.5 inline-flex shrink-0 items-center rounded-full border border-violet-200 bg-violet-50 px-1.5 py-px align-middle text-[10px] font-medium leading-4 text-violet-700"
      title="Empresa del grupo. Es una venta real y cuenta en los totales igual que cualquier cliente; la marca es sólo para reconocerla."
    >
      Del grupo
    </span>
  );
}

function ClienteRow({
  c,
  displayRank,
  histState,
  empresaScope,
  onTriggerHistorial,
}: {
  c: Cliente;
  /** Rank visual 1..N según el sort actual. Reemplaza c.rank (DB rank
   *  global por compras_ytd DESC) que se veía desordenado cuando el
   *  usuario cambiaba el sort. */
  displayRank: number;
  histState: HistorialState;
  empresaScope: string;
  onTriggerHistorial: () => void;
}) {
  const fmt = formatDeltaRatio(c.delta);
  const isMultiEmpresa = c.empresas_count > 1 && (c.empresas_breakdown?.length ?? 0) > 1;
  // Auto-flip: cliente en la mitad inferior de la viewport → HoverCard se
  // abre hacia arriba (side="top") en vez de a la derecha. Evita que el
  // card se corte cuando el row está cerca del bottom del scroll.
  const [hoverSide, setHoverSide] = useState<"right" | "top">("right");

  const handleHoverEnter = (e: React.SyntheticEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const middle = window.innerHeight / 2;
    setHoverSide(rect.top > middle ? "top" : "right");
  };

  return (
    // `data-fila-cliente` es el ancla ESTABLE que cruza fila y tarjeta en el
    // verificador. Buscar por clase de breakpoint (`.md\\:hidden`) es la trampa
    // que hace pasar un chequeo sin comparar nada: al mover el corte, el
    // selector devuelve vacío y el test "aprueba" el silencio.
    <tr data-fila-cliente={`${c.empresaKey}|${c.id}`} className="cursor-pointer transition hover:bg-gray-50">
      <td className="border-b border-gray-200 px-2.5 py-3 text-right font-mono text-xs text-gray-500 tabular-nums">{displayRank}</td>
      <td className="border-b border-gray-200 px-2.5 py-3 text-sm text-gray-950">
        {/* Escritorio (lg+): HoverCard con popover. Debajo de lg el mismo
            botón dispara onMobileTap → abre ClienteSheet en el padre. */}
        <HoverCard openDelay={250} closeDelay={100}>
          <HoverCardTrigger asChild>
            {/* El nombre es link directo a la ficha (/clientes/[codigo]); el
                HoverCard sigue mostrando el preview al hover en desktop. */}
            {/* El CÓDIGO va ADENTRO del enlace a propósito. El nombre solo
                medía 18 px de alto y el iPad horizontal (1194) cae del lado de
                la tabla y se toca con el dedo. Envolver las dos líneas da los
                44 px SIN agrandar la fila ni un píxel: el código ya estaba ahí
                abajo, sólo dejó de ser texto muerto al lado del enlace. */}
            <Link
              href={`/clientes/${encodeURIComponent(c.id)}`}
              onMouseEnter={handleHoverEnter}
              onFocus={handleHoverEnter}
              className="flex min-h-[44px] max-w-full flex-col justify-center text-left font-medium leading-tight hover:text-teal-700"
            >
              <span data-col="nombre">
                {c.nombre}
                {c.esDelGrupo && <DelGrupoBadge />}
              </span>
              <span data-col="codigo" className="font-mono text-xs font-normal leading-tight text-gray-500">{c.id}</span>
            </Link>
          </HoverCardTrigger>
          <HoverCardContent
            side={hoverSide}
            align="start"
            collisionPadding={12}
            className="hidden w-[320px] lg:block"
          >
            <ClienteHoverCard
              nombre={c.nombre}
              codigo={c.id}
              empresa={c.empresa}
              empresaScope={empresaScope}
              historial={histState}
              onFirstHover={onTriggerHistorial}
            />
          </HoverCardContent>
        </HoverCard>
      </td>
      <td data-col="empresa" className="whitespace-nowrap border-b border-gray-200 px-2.5 py-3 text-xs text-gray-700">
        {isMultiEmpresa ? (
          <TooltipProvider delayDuration={120}>
            <Tooltip>
              <TooltipTrigger asChild>
                {/* 44 px de alto (medía 72×18). Entra en el alto que la fila
                    ya tenía, así que la tabla no crece. */}
                <button
                  type="button"
                  className="inline-flex min-h-[44px] cursor-help items-center underline decoration-dotted decoration-gray-300 underline-offset-4 hover:text-gray-950"
                >
                  {c.empresas_count} empresas
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                align="start"
                sideOffset={4}
                collisionPadding={8}
                className="min-w-[240px] border-0 bg-gray-950 p-3 text-white shadow-lg"
              >
                {/* Sin rótulo: el globo se abre desde "N empresas" y adentro
                    hay exactamente eso, cada empresa con su monto. */}
                <div className="space-y-1">
                  {(c.empresas_breakdown ?? []).map(b => (
                    <div key={b.empresaKey} className="flex justify-between gap-4 text-xs">
                      <span className="text-gray-300">{b.empresaNombre}</span>
                      <span className="font-mono text-white tabular-nums">{fmtMoney(b.monto)}</span>
                    </div>
                  ))}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          c.empresa
        )}
      </td>
      <td data-col="ytd" className="whitespace-nowrap border-b border-gray-200 px-2.5 py-3 text-right font-mono text-sm font-medium text-gray-950 tabular-nums">{fmtMoney(c.ytd)}</td>
      <td data-col="delta" className={cn("whitespace-nowrap border-b border-gray-200 px-2.5 py-3 text-right font-mono text-xs tabular-nums", TONE_LIGHT[fmt.tone])}>
        {fmt.arrow && <span className="mr-1">{fmt.arrow}</span>}
        {fmt.displayValue}
      </td>
      <td data-col="ultima" className="whitespace-nowrap border-b border-gray-200 px-2.5 py-3 text-right font-mono text-xs text-gray-500 tabular-nums">{c.ultima || "—"}</td>
    </tr>
  );
}

/**
 * Fila agregada "Otros clientes (N)" — agrupa huérfanos sin master.
 * Background diferenciado, click abre Dialog con detalle. Sin HoverCard
 * (los promedios cross-cliente no aplican) ni WhatsApp (heterogéneo).
 */
function OtrosRow({ c, onClick }: { c: Cliente; onClick: () => void }) {
  const fmt = formatDeltaRatio(c.delta);
  return (
    <tr
      className="cursor-pointer bg-gray-100 transition hover:bg-gray-200"
      onClick={onClick}
      role="button"
      aria-label="Abrir detalle de otros clientes"
    >
      <td className="border-b border-gray-200 px-2.5 py-3 text-right font-mono text-xs text-gray-400 tabular-nums">—</td>
      <td className="border-b border-gray-200 px-2.5 py-3 text-sm text-gray-950">
        <div className="font-medium leading-tight">{c.nombre}</div>
        <div className="text-xs leading-tight text-gray-500">{OTROS_CLIENTES_PISTA}</div>
      </td>
      <td className="whitespace-nowrap border-b border-gray-200 px-2.5 py-3 text-xs text-gray-700">
        {c.empresa}
      </td>
      <td className="whitespace-nowrap border-b border-gray-200 px-2.5 py-3 text-right font-mono text-sm font-medium text-gray-950 tabular-nums">
        {fmtMoney(c.ytd)}
      </td>
      <td className={cn("whitespace-nowrap border-b border-gray-200 px-2.5 py-3 text-right font-mono text-xs tabular-nums", TONE_LIGHT[fmt.tone])}>
        {fmt.arrow && <span className="mr-1">{fmt.arrow}</span>}
        {fmt.displayValue}
      </td>
      <td className="whitespace-nowrap border-b border-gray-200 px-2.5 py-3 text-right font-mono text-xs text-gray-500 tabular-nums">
        {c.ultima || "—"}
      </td>
    </tr>
  );
}

/**
 * Card mobile equivalente a ClienteRow. Tap en cualquier parte (menos el
 * botón WhatsApp) abre el ClienteSheet con el detalle. Touch target del
 * WhatsApp ≥ 44px independiente del icono visual.
 */
function ClienteCard({
  c,
  showEmpresa,
  onTap,
}: {
  c: Cliente;
  showEmpresa: boolean;
  onTap: () => void;
}) {
  const fmt = formatDeltaRatio(c.delta);
  return (
    <div
      data-fila-cliente={`${c.empresaKey}|${c.id}`}
      role="button"
      tabIndex={0}
      onClick={onTap}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onTap(); } }}
      className="rounded-lg border border-gray-200 bg-white active:bg-gray-50"
    >
      <div className="px-4 py-2.5">
        {/* El nombre es un enlace ANIDADO adentro de una tarjeta que ya es
            tocable, y medía 324×19 — el blanco táctil más repetido de la
            pantalla (112 en la lista). Ahora ocupa 44 px de alto; el `-my-*`
            se los toma del relleno de la tarjeta, así que la lista no se
            estira ni se pierde densidad. */}
        <div className="flex items-baseline justify-between gap-2">
          <Link
            href={`/clientes/${encodeURIComponent(c.id)}`}
            onClick={(e) => e.stopPropagation()}
            className="flex min-h-[44px] min-w-0 flex-1 items-center truncate text-[15px] font-medium leading-tight text-gray-950 hover:text-teal-700"
          >
            <span data-col="nombre" className="truncate">
              {c.nombre}
              {c.esDelGrupo && <DelGrupoBadge />}
            </span>
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-x-1.5 text-xs text-gray-500">
          <span data-col="codigo" className="font-mono">{c.id}</span>
          {showEmpresa && c.empresa && (
            <>
              <span aria-hidden className="opacity-50">·</span>
              <span data-col="empresa" className="truncate">{c.empresa}</span>
            </>
          )}
        </div>

        <div className="mt-3 flex items-baseline gap-3">
          <div data-col="ytd-compacto" className="font-mono text-base font-medium tabular-nums text-gray-950">
            {fmtMoneyCompact(c.ytd)}
          </div>
          <div data-col="delta" className={cn("font-mono text-xs tabular-nums", TONE_LIGHT[fmt.tone])}>
            {fmt.arrow && <span className="mr-0.5">{fmt.arrow}</span>}
            {fmt.displayValue}
          </div>
          <div data-col="ultima" className="ml-auto truncate text-xs text-gray-500">
            {c.ultima || "—"}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Card mobile equivalente a OtrosRow. Bg gris, sin WhatsApp; tap abre Dialog. */
function OtrosCard({ c, onTap }: { c: Cliente; onTap: () => void }) {
  const fmt = formatDeltaRatio(c.delta);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onTap}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onTap(); } }}
      className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3.5 active:bg-gray-100"
    >
      <div className="text-[15px] font-medium leading-tight text-gray-950">{c.nombre}</div>
      <div className="mt-1 text-xs text-gray-500">{OTROS_CLIENTES_PISTA}</div>
      <div className="mt-3 flex items-baseline gap-3">
        <div className="font-mono text-base font-medium tabular-nums text-gray-950">
          {fmtMoneyCompact(c.ytd)}
        </div>
        <div className={cn("font-mono text-xs tabular-nums", TONE_LIGHT[fmt.tone])}>
          {fmt.arrow && <span className="mr-0.5">{fmt.arrow}</span>}
          {fmt.displayValue}
        </div>
        <div className="ml-auto text-xs text-gray-500">{c.ultima || "—"}</div>
      </div>
    </div>
  );
}

function SortHeader({
  col, align, children, sortBy, sortDir, onClick,
}: {
  col: SortKey; align: "left" | "right"; children: React.ReactNode;
  sortBy: SortKey; sortDir: SortDir; onClick: (c: SortKey) => void;
}) {
  const active = sortBy === col;
  return (
    // SIN `whitespace-nowrap`: "Compras 2026" y "Última compra" ahora pueden
    // partirse en dos líneas cuando el ancho aprieta. Es la mitad de lo que le
    // bajó el mínimo a la tabla (la otra mitad es el relleno px-3.5 → px-2.5).
    // Partir un encabezado en dos renglones no es abreviarlo: dice lo mismo.
    <th
      onClick={() => onClick(col)}
      className={cn(
        "cursor-pointer select-none border-b border-gray-200 bg-gray-100 px-2.5 py-2.5 text-xs font-medium uppercase tracking-wide transition",
        align === "right" ? "text-right" : "text-left",
        active ? "text-gray-950" : "text-gray-500 hover:text-gray-700"
      )}
    >
      {/* 44 px táctiles: el iPad horizontal (1194) también cae del lado de la
          tabla y ordenar se hace con el dedo. */}
      <span className="inline-flex min-h-[44px] items-center gap-1">
        {children}
        <span className={cn("text-xs", active ? "opacity-100" : "opacity-35")}>
          {active ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </span>
    </th>
  );
}
