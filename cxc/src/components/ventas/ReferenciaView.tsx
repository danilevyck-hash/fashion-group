"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Tab "Referencia" de /ventas (solo admin — el guard real es el SSR de la
// página + requireRole en el API; esta vista es solo la cara).
//
// 🔴 LA ESPECIFICACIÓN ES UNA FRASE DE DANIEL, y la pantalla no muestra nada más:
//   *"yo lo que quiero ver en cuanto tiempo se me mueve el articulo, para saber
//    si con el stock actual que tengo debo de comprar mas, menos o no comprar.
//    pero no quiero que decidas tu, lo decido yo con la data que me extraigas"*
//
// Este archivo es SOLO el buscador y el despacho: la tarjeta vive en
// `ReferenciaTarjeta.tsx` y el modo pedido en `ReferenciaTablaPedido.tsx`.
//
// 🔴 DOS FORMAS, Y LA PANTALLA DECIDE SOLA POR LO QUE SE PEGÓ (12-ago-2026):
//   · UN código (o una descripción) → tarjetas completas, agrupadas por modelo.
//   · VARIOS códigos → el MODO PEDIDO: una tabla, una fila por color, EN EL
//     ORDEN EN QUE LOS PEGÓ — Daniel la lee con su Excel al lado. Tocar una
//     fila abre el detalle ahí mismo. El Excel baja en ese mismo orden.
//
// El criterio es el MISMO del servidor (`parsearListaCodigos`): si el route
// buscó como lista de códigos, la vista muestra tabla. Dos parseos distintos
// serían dos verdades sobre qué se buscó.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, RefreshCw, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchJsonWithRetry, describeFetchError } from "@/lib/fetch-retry";
import {
  modeloDe,
  ordenarComoPegado,
  parsearListaCodigos,
  MAX_CODIGOS_MULTI,
} from "@/lib/ventas/referencia";
import type { ArticuloCompras, ComprasApiResp } from "@/lib/ventas/compras";
import { textoMeses } from "@/lib/ventas/resumen-articulo";
import { exportComprasToExcel } from "@/lib/ventas/referencia-excel";
import { TarjetaArticulo } from "./ReferenciaTarjeta";
import { ReferenciaTablaPedido } from "./ReferenciaTablaPedido";

// ─── Vista ───────────────────────────────────────────────────────────────────

export function ReferenciaView() {
  const [texto, setTexto] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resp, setResp] = useState<ComprasApiResp | null>(null);
  // Lo ÚLTIMO buscado (no lo tecleado): de acá sale el modo pedido y su orden.
  const [buscado, setBuscado] = useState("");
  const [actualizando, setActualizando] = useState(false);

  const buscar = async (q: string) => {
    const query = q.trim();
    if (query.length < 3) {
      setError("Escribe al menos 3 caracteres.");
      return;
    }
    setCargando(true);
    setError(null);
    try {
      setResp(await fetchJsonWithRetry<ComprasApiResp>(`/api/ventas/referencia?q=${encodeURIComponent(query)}`));
      setBuscado(query);
    } catch (err) {
      setError(describeFetchError(err));
    } finally {
      setCargando(false);
    }
  };

  // 🔴 El MISMO parseo que usa el servidor para decidir si era una lista.
  const codigosPegados = useMemo(() => parsearListaCodigos(buscado).codigos, [buscado]);
  const modoPedido = codigosPegados.length >= 2 && (resp?.articulos.length ?? 0) > 0;

  // En modo pedido las filas van EN EL ORDEN PEGADO; el Excel baja igual.
  const articulosOrdenados = useMemo(
    () => (modoPedido ? ordenarComoPegado(resp?.articulos ?? [], codigosPegados) : (resp?.articulos ?? [])),
    [modoPedido, resp, codigosPegados],
  );

  // Los colores de un mismo modelo se muestran juntos: Daniel ve POR COLOR,
  // pero compara contra los hermanos del mismo modelo.
  const porModelo = useMemo(() => {
    const arts = resp?.articulos ?? [];
    const grupos = new Map<string, ArticuloCompras[]>();
    for (const a of arts) {
      const m = modeloDe(a.codigo);
      grupos.set(m, [...(grupos.get(m) ?? []), a]);
    }
    return [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [resp]);

  const hayResultados = (resp?.articulos.length ?? 0) > 0;

  // ── «Actualizar datos de Switch» ───────────────────────────────────────────
  // 🔴 VOLVIÓ EL 4-sep-2026. La ruta (`POST /api/ventas/referencia/actualizar`)
  // nunca se fue, pero su botón desapareció con la franja de catálogo en el
  // rediseño del 11-ago (`9b1899e1`): fue colateral, no una decisión. Daniel:
  // *«activa el botón de Referencia»*.
  //
  // 🔴 SIN AVISO. Daniel: *«referencia lo puede ver todos, y sin aviso»* — nada
  // de «esto te saca del panel de Switch». Solo el botón y su estado.
  //
  // Va POR EMPRESA porque el catálogo de Switch se trae por empresa; lo normal
  // es una sola (un código vive en una), y cuando el modelo aparece en dos van
  // EN SERIE: la sesión de Switch es una por usuario y dos logins simultáneos
  // se tumban entre sí. El acelerador de 10 min vive en el SERVIDOR, así que
  // dos toques seguidos no abren dos sesiones aunque la pantalla se recargue.
  const empresasDeLaBusqueda = useMemo(
    () => [...new Set((resp?.articulos ?? []).map((a) => a.empresa))],
    [resp],
  );

  const actualizar = async () => {
    if (empresasDeLaBusqueda.length === 0) return;
    setActualizando(true);
    setError(null);
    try {
      for (const empresa of empresasDeLaBusqueda) {
        const r = await fetch("/api/ventas/referencia/actualizar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ empresa }),
        });
        const body = (await r.json()) as { error?: string };
        if (!r.ok) throw new Error(body.error ?? "No se pudo actualizar.");
      }
      await buscar(buscado);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar. Intenta de nuevo en unos segundos.");
    } finally {
      setActualizando(false);
    }
  };
  // Daniel: *"quita margen, lo demas dejalo"* — el servidor dice quién lo ve.
  const mostrarMargen = resp?.margenVisible !== false;

  return (
    <div>
      <form
        className="rounded-xl border border-gray-200 bg-white p-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          void buscar(texto);
        }}
      >
        <div className="flex flex-col gap-2.5 sm:flex-row">
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Código, modelo o descripción — puedes pegar varios"
            aria-label="Buscar referencia"
            className="min-h-[44px] flex-1 rounded-md border border-gray-300 px-3 text-sm outline-none focus:border-gray-900"
          />
          <Button type="submit" disabled={cargando} className="min-h-[44px] shrink-0">
            <Search className="mr-1.5 h-4 w-4" />
            {cargando ? "Buscando…" : "Buscar"}
          </Button>
        </div>
        <p className="mt-2 text-xs text-gray-600">
          Un código trae todos sus colores. Puedes pegar hasta {MAX_CODIGOS_MULTI} códigos juntos, separados por
          espacios, comas o uno por línea — con varios sale una tabla para armar tu pedido.
        </p>
      </form>

      {error && (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      )}

      {resp?.comprasDisponibles === false && (
        <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Todavía no están cargados los ingresos de mercancía, así que no se puede decir qué llegó ni cuándo. Las
          ventas de abajo sí son reales.
        </p>
      )}

      {resp?.coincidencias && resp.coincidencias.length > 0 && (
        <Coincidencias
          items={resp.coincidencias}
          onElegir={(modelo) => {
            setTexto(modelo);
            void buscar(modelo);
          }}
        />
      )}

      {resp && resp.noEncontrados.length > 0 && (
        <p className="mt-4 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
          No encontré {resp.noEncontrados.length === 1 ? "el código" : "los códigos"}{" "}
          <span className="font-medium">{resp.noEncontrados.join(", ")}</span> — ni en ventas ni en compras.
        </p>
      )}

      {hayResultados && (
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button
            variant="outline"
            className="min-h-[44px]"
            disabled={actualizando || cargando}
            onClick={() => void actualizar()}
          >
            <RefreshCw className={cn("mr-1.5 h-4 w-4", actualizando && "animate-spin")} />
            {actualizando ? "Actualizando…" : "Actualizar datos de Switch"}
          </Button>
          <Button
            variant="outline"
            className="min-h-[44px]"
            // 🔴 El Excel baja LO MISMO que se ve: en modo pedido, en el orden
            // en que se pegaron los códigos, y sin margen si el rol no lo ve.
            onClick={() => void exportComprasToExcel(articulosOrdenados, resp!.hoyMes, { margen: mostrarMargen })}
          >
            <Download className="mr-1.5 h-4 w-4" /> Bajar a Excel
          </Button>
        </div>
      )}

      {modoPedido ? (
        <ReferenciaTablaPedido articulos={articulosOrdenados} hoyMes={resp!.hoyMes} mostrarMargen={mostrarMargen} />
      ) : (
        porModelo.map(([modelo, arts]) => (
          <div key={modelo} className="mt-4">
            {/* "N colores" se cuenta por CÓDIGO distinto, no por tarjeta: el
              mismo código puede aparecer en varias empresas y llamarle color a
              eso sería contar empresas. */}
            {arts.length > 1 && <TituloModelo modelo={modelo} arts={arts} />}
            <div className="space-y-4">
              {arts.map((a) => (
                <TarjetaArticulo
                  key={`${a.empresa}·${a.codigo}`}
                  art={a}
                  hoyMes={resp!.hoyMes}
                  mostrarMargen={mostrarMargen}
                />
              ))}
            </div>
          </div>
        ))
      )}

      {resp && !hayResultados && !resp.coincidencias?.length && resp.noEncontrados.length === 0 && (
        <p className="mt-4 text-sm text-gray-600">No hay nada con eso.</p>
      )}
    </div>
  );
}

function TituloModelo({ modelo, arts }: { modelo: string; arts: ArticuloCompras[] }) {
  const colores = new Set(arts.map((a) => a.codigo)).size;
  const empresas = new Set(arts.map((a) => a.empresa)).size;
  return (
    <h3 className="mb-2 text-sm font-semibold text-gray-900">
      Modelo {modelo}
      {colores > 1 && ` · ${colores} colores`}
      {empresas > 1 && ` · en ${empresas} empresas`}
    </h3>
  );
}

// ─── Coincidencias por descripción ───────────────────────────────────────────

function Coincidencias({
  items,
  onElegir,
}: {
  items: { modelo: string; descripcion: string; empresa: string; colores: number }[];
  onElegir: (modelo: string) => void;
}) {
  return (
    <div className="mt-4 rounded-xl border border-gray-200 bg-white p-3.5">
      <p className="mb-2 text-sm text-gray-700">Elige el modelo:</p>
      <div className="flex flex-col gap-1.5">
        {items.map((c) => (
          <button
            key={`${c.empresa}·${c.modelo}`}
            onClick={() => onElegir(c.modelo)}
            className="flex min-h-[44px] items-center gap-2 rounded-md border border-gray-200 px-3 text-left text-sm hover:border-gray-400 active:scale-[0.99]"
          >
            <span className="font-mono font-medium text-gray-900">{c.modelo}</span>
            <span className="text-gray-700">{c.descripcion || "—"}</span>
            <span className="ml-auto shrink-0 text-xs text-gray-600">
              {c.colores} {c.colores === 1 ? "color" : "colores"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// Reexport para que el texto tenga una sola definición.
export { textoMeses };
