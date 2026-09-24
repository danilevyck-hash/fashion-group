"use client";

// ============================================================================
// LA PESTAÑA «TIENDAS» DE LA PORTADA (23-sep-2026, Tiendas y Marcas).
//
// Lo primero que se ve es DÓNDE se gastó: todas las tiendas con gasto, con el
// nombre del DIRECTORIO por código, lo reportado como único monto y el
// desglose por marca en gris. Multifashion es una tienda más; «General» (lo
// que no es de ninguna) va al final. Cada fila LLEVA a la ficha de la tienda.
//
// 🔴 EL PERÍODO MANDA (23-sep-2026, mockup aprobado): arriba la barra
// «Abierto · cada cierre · Todos», y la lista es la de ESE período. Abre en
// «Abierto» (lo que irá al próximo ZIP); «Todos» es la lista de siempre. El
// pie dice qué se mira y cuánto suma. El período vive en la URL
// (`?periodo=`, `replace`: es un filtro, Atrás no cicla).
//
// 🩸 Antes, a un cliente solo se llegaba por el buscador ⌘K: la portada, los
// reportes y Mobiliario dibujaban tiendas sin un solo enlace (medido:
// `hrefDeTienda` tenía UN llamador en todo el código).
//
// 🩸 NINGÚN NÚMERO SE CALCULA ACÁ. Viene de `GET /api/marketing/tiendas`, que
// es el reporte por tienda del rediseño partido por período — por eso
// «Reportes» pudo irse.
//
// El buscador de arriba solo FILTRA lo que ya está en pantalla (por palabra,
// `filtrarTiendas`); no guarda ni elige nada. Una tienda nueva se elige del
// directorio al registrar su primer gasto, por la puerta «＋ Gasto».
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { useUrlState } from "@/lib/hooks/useUrlState";
import { formatearMonto } from "@/lib/marketing/normalizar";
import {
  PERIODO_INICIAL,
  filasDeTiendasDelPeriodo,
  periodoElegido,
  textoDelPieDeTiendas,
  totalDeTiendas,
  type TiendasPorPeriodo,
} from "@/lib/marketing/periodo-manda";
import { filtrarTiendas, subtituloDeTienda, type FilaTienda } from "@/lib/marketing/tiendas-y-marcas";
import { MARKETING_CELULAR } from "@/lib/marketing/celular";
import BarraDePeriodos from "./BarraDePeriodos";
import { FilaNivel, ListaCard } from "./FilaNivel";
import TiendasCelular from "./celular/TiendasCelular";

interface Props {
  refreshKey: number;
  /**
   * 🔴 EN EL CELULAR, TIENDAS ES LA PORTADA (24-sep-2026, 1a). Con esto puesto
   * la vista de celular se dibuja arriba y la de computadora queda en
   * `hidden sm:block`: las DOS leen las MISMAS filas y el MISMO total, así que
   * ningún número puede diferir entre una y otra.
   */
  celular?: { escribe: boolean; onRegistrarGasto: () => void } | null;
}

export default function PortadaTiendas({ refreshKey, celular = null }: Props) {
  const [datos, setDatos] = useState<TiendasPorPeriodo | null>(null);
  const [loading, setLoading] = useState(true);
  const [recargar, setRecargar] = useState(0);
  const [texto, setTexto] = useState("");
  const [periodoRaw, setPeriodo] = useUrlState<string>("periodo", PERIODO_INICIAL);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/marketing/tiendas", { cache: "no-store" });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as Partial<TiendasPorPeriodo>;
        if (!cancelado) {
          setDatos({
            periodos: Array.isArray(data.periodos) ? data.periodos : [],
            filas: Array.isArray(data.filas) ? data.filas : [],
            filasPorPeriodo: data.filasPorPeriodo && typeof data.filasPorPeriodo === "object" ? data.filasPorPeriodo : {},
          });
        }
      } catch {
        if (!cancelado) setDatos(null);
      } finally {
        if (!cancelado) setLoading(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [refreshKey, recargar]);

  const chips = useMemo(() => datos?.periodos ?? [], [datos]);
  const periodo = periodoElegido(chips, periodoRaw);
  const filas: FilaTienda[] | null = useMemo(() => {
    if (!datos) return null;
    // Sin chips (una respuesta vieja) se ve la lista completa de siempre.
    return chips.length === 0 ? datos.filas : filasDeTiendasDelPeriodo(datos, periodo);
  }, [datos, chips, periodo]);
  const visibles = useMemo(() => filtrarTiendas(filas ?? [], texto), [filas, texto]);
  const total = useMemo(() => totalDeTiendas(visibles), [visibles]);

  const enCelular = MARKETING_CELULAR && celular !== null;

  return (
    <>
      {enCelular && (
        <TiendasCelular
          filas={visibles}
          chips={chips}
          periodo={periodo}
          onPeriodo={setPeriodo}
          total={total}
          cargando={loading && datos === null}
          hayDatos={datos !== null && filas !== null}
          escribe={celular!.escribe}
          onRegistrarGasto={celular!.onRegistrarGasto}
        />
      )}
      <div className={enCelular ? "hidden sm:block space-y-4" : "space-y-4"}>
      {chips.length > 0 && (
        <BarraDePeriodos chips={chips} elegido={periodo} onElegir={setPeriodo} etiqueta="Elegir el período" />
      )}

      {/* Solo filtra lo que ya está en pantalla. text-base en mobile: con
          14px Safari hace zoom al enfocar. */}
      <input
        type="search"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Buscar una tienda…"
        aria-label="Buscar una tienda"
        className="w-full rounded-md border border-gray-300 px-3 py-2 min-h-[44px] text-base sm:text-sm focus:border-black focus:outline-none"
      />

      {loading && datos === null ? (
        <div className="h-64 rounded-lg bg-gray-100 animate-pulse" />
      ) : datos === null || filas === null ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-sm text-gray-600">
            No se pudo cargar la lista de tiendas. Revisa tu conexión e intenta de nuevo.
          </p>
          <button
            type="button"
            onClick={() => setRecargar((n) => n + 1)}
            className="mt-3 rounded-md border border-gray-300 bg-white px-3 min-h-[44px] inline-flex items-center justify-center text-sm hover:border-gray-500 active:scale-[0.97] transition"
          >
            Intentar de nuevo
          </button>
        </div>
      ) : datos.filas.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center">
          <p className="text-sm text-gray-600">Todavía no hay gastos en ninguna tienda.</p>
        </div>
      ) : filas.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center">
          <p className="text-sm text-gray-600">Nada abierto: todo lo registrado ya se le pasó a la marca.</p>
        </div>
      ) : visibles.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center">
          <p className="text-sm text-gray-600">Ninguna tienda coincide con lo que escribiste.</p>
        </div>
      ) : (
        <section>
          <ListaCard>
            {visibles.map((f) => (
              <FilaNivel
                key={f.codigo ?? "general"}
                titulo={f.nombre}
                subtitulo={subtituloDeTienda(f)}
                monto={<MontoDeTienda total={f.total} noReportado={f.noReportado} />}
                href={f.href}
                ariaLabel={`Abrir ${f.nombre}`}
              />
            ))}
          </ListaCard>
          {/* El pie: qué período se mira y cuánto suman las tiendas que se ven. */}
          <div
            className="flex items-center justify-between gap-3 px-4 sm:px-5 py-2 text-[12px] text-gray-600 rounded-b-lg border border-t-0 border-gray-200 bg-gray-50"
            data-fg-pie-tiendas
          >
            <span>{textoDelPieDeTiendas(periodo, chips, visibles.length)}</span>
            <span className="tabular-nums font-semibold text-gray-900">{formatearMonto(total)}</span>
          </div>
        </section>
      )}

      <p className="text-[12px] text-gray-500">
        Una tienda nueva se elige del directorio al registrar su primer gasto, con «＋ Gasto».
      </p>
      </div>
    </>
  );
}

/** Lo reportado, y en gris lo apagado si lo hay: nunca se suman. */
function MontoDeTienda({ total, noReportado }: { total: number; noReportado: number }) {
  return (
    <div>
      <div>{formatearMonto(total)}</div>
      {noReportado > 0 && (
        <div className="text-xs font-normal text-gray-500 tabular-nums">
          No se reporta: {formatearMonto(noReportado)}
        </div>
      )}
    </div>
  );
}
