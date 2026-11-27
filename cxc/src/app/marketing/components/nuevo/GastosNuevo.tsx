"use client";

// ============================================================================
// Marketing nuevo › GASTOS (8-oct-2026).
//
// Pregunta: ¿qué se gastó, y en qué estado está?
//
// UNA lista con todo (facturas, entregas de mobiliario, pagos de impulsadora),
// filtros Marca · Tienda · Tipo · Estado y una sola acción: «＋ Gasto». El
// «A cobrar» y el estado salen del ZIP: lo que dice esta lista es lo que la
// marca recibe. Al tocar un gasto se abre su ficha (la edición de siempre,
// con «No recuperable» y «Reemplazar» el PDF).
// ============================================================================

import { BUSCADOR_EN_LA_FILA } from "@/lib/ui/revision-110-ajustes";
import { useMemo, useState } from "react";
import Link from "next/link";
import { formatearFecha, formatearMonto } from "@/lib/marketing/normalizar";
import type { EstadoDelGasto, GastoDeLaLista, MarketingDelCobro } from "@/lib/marketing/zip-marca";
import type { MkMarca } from "@/lib/marketing/types";
import type { FilaDeTienda } from "@/lib/marketing/vista-tienda";
import FichaTiendaAcciones, { type AccionDeFila } from "../../tienda/[codigo]/FichaTiendaAcciones";
import { BOTON_PRINCIPAL } from "./PorCobrarNuevo";
import { MKT_GASTOS_TABLA_CABE_2026_11 } from "@/lib/ui/revision-110-marketing";
import { BuscadorConFiltros } from "@/components/filtros/FiltroA";
import { CampoBuscar } from "@/components/BuscadorDeLista";
import { FILTRO_A_2026_11 } from "@/lib/ui/revision-110-2026-11";
import { SwipeableRow } from "@/components/ui";
import OverflowMenu from "@/components/ui/OverflowMenu";
import { ACCION_ANULAR, MKT_ANULAR_EN_LA_LISTA_2026_11, MOTIVO_ANULADO_DESDE_GASTOS } from "@/lib/ui/marketing-gastos-2026-11";

/**
 * 🔴 «ANULAR» EN LA LISTA (27-nov-2026, `MKT_ANULAR_EN_LA_LISTA_2026_11`). Se
 * anula lo que la ficha de la tienda anula: facturas y pagos de impulsadora,
 * por la MISMA ruta (`POST …/facturas/[id]/anular`, soft delete firmado). Una
 * entrega de mobiliario no se anula: se elimina desde su ficha y devuelve el
 * stock. Solo quien escribe (admin y secretaria; el servidor lo vuelve a mirar).
 */
export function seAnulaDesdeLaLista(g: Pick<GastoDeLaLista, "tipo">, escribe: boolean): boolean {
  return MKT_ANULAR_EN_LA_LISTA_2026_11 && escribe && g.tipo !== "mobiliario";
}

/** El mismo POST que la ficha de la tienda. `false` = no se anuló (la fila vuelve). */
export async function anularGasto(id: string): Promise<boolean> {
  const res = await fetch(`/api/marketing/facturas/${id}/anular`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ motivo: MOTIVO_ANULADO_DESDE_GASTOS }),
  });
  return res.ok;
}

/** «Buscar proveedor o factura» (revisión 14-nov-2026): sin acentos ni mayúsculas. */
export function coincideGasto(g: Pick<GastoDeLaLista, "proveedor" | "numero">, q: string): boolean {
  const n = (x: string) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const t = n(q.trim());
  return !t || n(g.proveedor ?? "").includes(t) || n(g.numero ?? "").includes(t);
}

export const ROTULO_TIPO: Record<GastoDeLaLista["tipo"], string> = {
  factura: "Factura",
  mobiliario: "Mobiliario",
  impulsadora: "Impulsadora",
};
export const ROTULO_ESTADO: Record<EstadoDelGasto, string> = {
  por_cobrar: "Por cobrar",
  cobrado: "Cobrado",
  no_recuperable: "No recuperable",
};
const CHIP_ESTADO: Record<EstadoDelGasto, string> = {
  por_cobrar: "bg-gray-900 text-white",
  cobrado: "bg-emerald-50 text-emerald-700",
  no_recuperable: "bg-gray-100 text-gray-600",
};

const SELECT =
  "w-full rounded-md border border-gray-300 bg-white px-3 min-h-[44px] text-base sm:text-sm focus:border-black focus:outline-none";

/**
 * 🔴 LOS FILTROS (8-oct-2026). Daniel: «Marca es una opción, igual que Tienda y
 * Sin tienda; eso confunde. ¿Qué hace qué?». Cada filtro es un control aparte
 * con su NOMBRE arriba y su VALOR adentro («Todas» cuando no filtra), y Gastos
 * abre en Estado «Por cobrar».
 *
 * 🔴 SIN «Sin tienda». Cada factura va a una tienda (obligatoria, Daniel): lo
 * único sin tienda son los pagos de impulsadora (Tipo = Impulsadora, o su
 * pestaña) y unos pocos gastos viejos, que salen con «Todas».
 */
export const ESTADO_AL_ABRIR: EstadoDelGasto = "por_cobrar";

/** Las tiendas del filtro, por nombre. Solo las que tienen código. */
export function opcionesDeTienda(gastos: ReadonlyArray<Pick<GastoDeLaLista, "tiendaCodigo" | "tiendaNombre">>): Array<[string, string]> {
  const m = new Map<string, string>();
  for (const g of gastos) if (g.tiendaCodigo) m.set(g.tiendaCodigo, `${g.tiendaNombre} (${g.tiendaCodigo})`);
  return Array.from(m).sort((a, b) => a[1].localeCompare(b[1], "es"));
}

function Filtro({
  id,
  rotulo,
  todas,
  valor,
  onChange,
  opciones,
}: {
  id: string;
  rotulo: string;
  todas: string;
  valor: string;
  onChange: (v: string) => void;
  opciones: ReadonlyArray<readonly [string, string]>;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block text-xs font-medium text-gray-500 mb-1">
        {rotulo}
      </label>
      <select id={id} value={valor} onChange={(e) => onChange(e.target.value)} className={SELECT}>
        <option value="">{todas}</option>
        {opciones.map(([v, r]) => (
          <option key={v} value={v}>
            {r}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * n.º 91 · ¿La columna «Estado» solo repetiría el filtro? Con «Por cobrar», sí.
 * Con «No recuperable» NO: ahí la columna lleva también la observación.
 */
export function columnaEstadoSobra(filtroEstado: string): boolean {
  return filtroEstado === "por_cobrar";
}

export function pctDe(g: Pick<GastoDeLaLista, "monto" | "aCobrar" | "estado">): number | null {
  if (g.estado === "no_recuperable" || g.monto <= 0) return null;
  return Math.round((g.aCobrar / g.monto) * 100);
}

export function aFila(g: GastoDeLaLista): FilaDeTienda {
  return {
    id: g.id,
    tipo: g.tipo === "mobiliario" ? "mueble" : g.tipo,
    marcaCodigo: g.marcaCodigo ?? "",
    marcaNombre: g.marcaNombre ?? "",
    proveedor: g.proveedor,
    detalle: g.concepto,
    monto: g.monto,
    fecha: g.fecha,
    seReporta: g.estado !== "no_recuperable",
    estadoPeriodo: g.estado === "cobrado" ? "cerrado" : g.estado === "por_cobrar" ? "abierto" : null,
    periodoNombre: null,
    numero: g.numero,
    concepto: g.concepto,
  };
}

export default function GastosNuevo({
  datos,
  marcas,
  escribe,
  onRegistrar,
  onCambio,
}: {
  datos: MarketingDelCobro | null;
  marcas: MkMarca[];
  escribe: boolean;
  onRegistrar: () => void;
  onCambio: () => void;
}) {
  const [marca, setMarca] = useState("");
  const [tienda, setTienda] = useState("");
  const [tipo, setTipo] = useState("");
  const [estado, setEstado] = useState<string>(ESTADO_AL_ABRIR);
  const [busqueda, setBusqueda] = useState("");
  const [accion, setAccion] = useState<AccionDeFila>(null);
  const [tiendaDeLaAccion, setTiendaDeLaAccion] = useState("");

  const gastos = useMemo(() => datos?.gastos ?? [], [datos]);
  const opcionesMarca = useMemo(
    () => Array.from(new Set(gastos.map((g) => g.marcaNombre).filter((x): x is string => !!x))).sort(),
    [gastos],
  );
  const opcionesTienda = useMemo(() => opcionesDeTienda(gastos), [gastos]);
  const hayFiltro = marca !== "" || tienda !== "" || tipo !== "" || estado !== "";
  const quitarFiltros = () => {
    setMarca("");
    setTienda("");
    setTipo("");
    setEstado("");
  };

  const filtrados = gastos.filter(
    (g) =>
      (!marca || g.marcaNombre === marca) &&
      (!tienda || g.tiendaCodigo === tienda) &&
      (!tipo || g.tipo === tipo) &&
      (!estado || g.estado === estado) &&
      (!FILTRO_A_2026_11 || coincideGasto(g, busqueda)),
  );
  // n.º 91: con el filtro en «Por cobrar», la columna «Estado» repetiría el
  // filtro en cada fila; se va y la tabla cabe. Con «Todos», vuelve.
  const conEstado = !(MKT_GASTOS_TABLA_CABE_2026_11 && columnaEstadoSobra(estado));
  const monto = filtrados.reduce((s, g) => s + g.monto, 0);
  const aCobrar = filtrados.reduce((s, g) => s + g.aCobrar, 0);

  const abrir = (g: GastoDeLaLista) => {
    if (!escribe) return;
    setTiendaDeLaAccion(g.tiendaNombre);
    setAccion({ tipo: "editar", fila: aFila(g) });
  };

  if (!datos) return <div className="text-sm text-gray-500 py-8 text-center">Cargando…</div>;

  return (
    <div className="space-y-4">
      {FILTRO_A_2026_11 && (
        <BuscadorConFiltros
          className="md:hidden"
          busqueda={busqueda}
          onBuscar={setBusqueda}
          placeholder="Buscar proveedor o factura"
          filtros={[
            { clave: "estado", etiqueta: "Estado", segmentado: true, opciones: Object.entries(ROTULO_ESTADO).map(([v, e]) => ({ valor: v, etiqueta: e })), valor: estado, onCambiar: setEstado },
            { clave: "marca", etiqueta: "Marca", todos: "Todas", opciones: opcionesMarca.map((m) => ({ valor: m, etiqueta: m })), valor: marca, onCambiar: setMarca },
            { clave: "tienda", etiqueta: "Tienda", todos: "Todas", opciones: opcionesTienda.map(([v, e]) => ({ valor: v, etiqueta: e })), valor: tienda, onCambiar: setTienda },
            { clave: "tipo", etiqueta: "Tipo", todos: "Todos", opciones: Object.entries(ROTULO_TIPO).map(([v, e]) => ({ valor: v, etiqueta: e })), valor: tipo, onCambiar: setTipo },
          ]}
          onRestablecer={() => { quitarFiltros(); setBusqueda(""); }}
        />
      )}
      <div className={`${FILTRO_A_2026_11 ? "hidden md:flex" : "grid grid-cols-2 md:flex"} ${BUSCADOR_EN_LA_FILA && FILTRO_A_2026_11 ? "md:flex-nowrap md:[&>*]:w-36 md:[&>*]:shrink-0" : "md:flex-wrap md:[&>*]:w-48"} md:items-end gap-x-3 gap-y-2`}>
        {FILTRO_A_2026_11 && (
          <CampoBuscar
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar proveedor o factura"
            aria-label="Buscar proveedor o factura"
            // Revisión 110 · ajustes (10): a la izquierda, llenando la fila; «Estado» ya no cae solo abajo.
            envoltorio={BUSCADOR_EN_LA_FILA ? "md:!w-auto md:!flex-1 md:!shrink md:min-w-0" : "md:!w-72"}
          />
        )}
        <Filtro id="filtro-marca" rotulo="Marca" todas="Todas" valor={marca} onChange={setMarca} opciones={opcionesMarca.map((m) => [m, m] as const)} />
        <Filtro id="filtro-tienda" rotulo="Tienda" todas="Todas" valor={tienda} onChange={setTienda} opciones={opcionesTienda} />
        <Filtro id="filtro-tipo" rotulo="Tipo" todas="Todos" valor={tipo} onChange={setTipo} opciones={Object.entries(ROTULO_TIPO)} />
        <Filtro id="filtro-estado" rotulo="Estado" todas="Todos" valor={estado} onChange={setEstado} opciones={Object.entries(ROTULO_ESTADO)} />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600">
        <span>
          {filtrados.length} {filtrados.length === 1 ? "gasto" : "gastos"} · Monto{" "}
          <span className="text-gray-900 tabular-nums">{formatearMonto(monto)}</span> · A cobrar{" "}
          <span className="text-gray-900 font-semibold tabular-nums">{formatearMonto(aCobrar)}</span>
        </span>
        {hayFiltro && (
          <button type="button" onClick={quitarFiltros} data-quitar-filtros className={`text-blue-600 hover:text-blue-800 min-h-[44px] items-center ${FILTRO_A_2026_11 ? "hidden md:inline-flex" : "inline-flex"}`}>
            Quitar filtros
          </button>
        )}
        {tienda && (
          <Link href={`/marketing/tienda/${encodeURIComponent(tienda)}`} className="text-blue-600 hover:text-blue-800 min-h-[44px] inline-flex items-center">
            Fotos de la tienda
          </Link>
        )}
        {escribe && (
          <button type="button" onClick={onRegistrar} className={`${BOTON_PRINCIPAL} ml-auto`}>
            ＋ Gasto
          </button>
        )}
      </div>

      {/* Computadora: tabla */}
      <div className="hidden md:block rounded-lg border border-gray-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-xs text-gray-500 border-b border-gray-200">
            <tr>
              <th className="text-left font-medium px-4 py-2">Fecha</th>
              <th className="text-left font-medium px-2 py-2">Gasto</th>
              <th className="text-left font-medium px-2 py-2">Tipo</th>
              <th className="text-left font-medium px-2 py-2">Marca</th>
              <th className="text-left font-medium px-2 py-2">Tienda</th>
              <th className="text-right font-medium px-2 py-2">Monto</th>
              <th className="text-right font-medium px-2 py-2">Se cobra</th>
              <th className="text-right font-medium px-2 py-2">Monto a cobrar</th>
              {conEstado && <th className="text-left font-medium px-4 py-2">Estado</th>}
              {MKT_ANULAR_EN_LA_LISTA_2026_11 && escribe && <th className="w-12"><span className="sr-only">Acciones</span></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtrados.map((g) => {
              const pct = pctDe(g);
              return (
                <tr
                  key={`${g.tipo}:${g.id}`}
                  onClick={() => abrir(g)}
                  className={escribe ? "cursor-pointer hover:bg-gray-50" : ""}
                  data-testid="fila-gasto"
                >
                  <td className="px-4 py-2 whitespace-nowrap text-gray-500">{formatearFecha(g.fecha)}</td>
                  <td className="px-2 py-2 text-gray-900 max-w-[18rem] truncate">
                    {g.proveedor} · {g.concepto}
                  </td>
                  <td className="px-2 py-2 text-gray-600">{ROTULO_TIPO[g.tipo]}</td>
                  <td className="px-2 py-2 text-gray-600 whitespace-nowrap">{g.marcaNombre ?? "—"}</td>
                  <td className="px-2 py-2 text-gray-600 max-w-[12rem] truncate">{g.tiendaNombre}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatearMonto(g.monto)}</td>
                  <td className={`px-2 py-2 text-right tabular-nums text-gray-600${MKT_GASTOS_TABLA_CABE_2026_11 ? " whitespace-nowrap" : ""}`}>{pct === null ? "—" : `${pct} %`}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{g.estado === "no_recuperable" ? "—" : formatearMonto(g.aCobrar)}</td>
                  {conEstado && (
                  <td className="px-4 py-2 whitespace-nowrap">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${CHIP_ESTADO[g.estado]}`}>{ROTULO_ESTADO[g.estado]}</span>
                    {g.estado === "no_recuperable" && g.nota && (
                      <span className="block mt-0.5 text-xs text-gray-500 max-w-[14rem] truncate" data-testid="observacion-gasto">
                        {g.nota}
                      </span>
                    )}
                  </td>
                  )}
                  {MKT_ANULAR_EN_LA_LISTA_2026_11 && escribe && (
                    <td className="px-2 py-1 text-right" onClick={(e) => e.stopPropagation()}>
                      {seAnulaDesdeLaLista(g, escribe) && (
                        <OverflowMenu
                          ariaLabel={`Más opciones de ${g.proveedor}`}
                          items={[{ label: ACCION_ANULAR, destructive: true, onClick: () => setAccion({ tipo: "anular", fila: aFila(g) }) }]}
                        />
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtrados.length === 0 && <div className="p-6 text-center text-sm text-gray-500">Sin gastos</div>}
      </div>

      {/* Celular: renglones */}
      <ul className="md:hidden rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
        {filtrados.map((g) => {
          const pct = pctDe(g);
          return (
            <li key={`${g.tipo}:${g.id}`}>
              <SwipeableRow
                {...(seAnulaDesdeLaLista(g, escribe)
                  ? {
                      eliminar: {
                        rotulo: ACCION_ANULAR,
                        mensaje: g.tipo === "impulsadora" ? "Pago anulado" : "Gasto anulado",
                        alEliminar: async () => {
                          const ok = await anularGasto(g.id);
                          if (ok) onCambio();
                          return ok;
                        },
                      },
                    }
                  : {})}
              >
              <button type="button" onClick={() => abrir(g)} className="w-full text-left px-4 py-3 min-h-[44px] flex items-start gap-3 bg-white">
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-gray-900 truncate">{g.proveedor}</span>
                  <span className="block text-xs text-gray-500 truncate">
                    {formatearFecha(g.fecha)} · {g.marcaNombre ?? "—"} · {g.concepto}
                  </span>
                  {g.estado === "no_recuperable" && g.nota && (
                    <span className="block text-xs text-gray-400 truncate">{g.nota}</span>
                  )}
                </span>
                <span className="text-right shrink-0">
                  <span className="block text-sm tabular-nums text-gray-900">{formatearMonto(g.monto)}</span>
                  <span className="block text-xs text-gray-500">{pct === null ? ROTULO_ESTADO[g.estado] : `${pct} %`}</span>
                </span>
              </button>
              </SwipeableRow>
            </li>
          );
        })}
        {filtrados.length === 0 && <li className="p-6 text-center text-sm text-gray-500">Sin gastos</li>}
      </ul>

      <FichaTiendaAcciones
        accion={accion}
        marcas={marcas}
        tiendaNombre={tiendaDeLaAccion}
        onCerrar={() => setAccion(null)}
        onCambio={() => {
          setAccion(null);
          onCambio();
        }}
      />
    </div>
  );
}
