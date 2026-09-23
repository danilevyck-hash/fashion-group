"use client";

// ============================================================================
// LA PESTAÑA «TIENDAS» DE LA PORTADA (23-sep-2026, Tiendas y Marcas).
//
// Lo primero que se ve es DÓNDE se gastó: todas las tiendas con gasto, con el
// nombre del DIRECTORIO por código, lo reportado como único monto y el
// desglose por marca en gris. Multifashion es una tienda más; «General» (lo
// que no es de ninguna) va al final. Cada fila LLEVA a la ficha de la tienda.
//
// 🩸 Antes, a un cliente solo se llegaba por el buscador ⌘K: la portada, los
// reportes y Mobiliario dibujaban tiendas sin un solo enlace (medido:
// `hrefDeTienda` tenía UN llamador en todo el código).
//
// 🩸 NINGÚN NÚMERO SE CALCULA ACÁ. Viene de `GET /api/marketing/tiendas`, que
// es el reporte por tienda del rediseño — por eso «Reportes» pudo irse.
//
// El buscador de arriba solo FILTRA lo que ya está en pantalla (por palabra,
// `filtrarTiendas`); no guarda ni elige nada. Una tienda nueva se elige del
// directorio al registrar su primer gasto, por la puerta «＋ Gasto».
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { formatearMonto } from "@/lib/marketing/normalizar";
import {
  filtrarTiendas,
  subtituloDeTienda,
  type FilaTienda,
} from "@/lib/marketing/tiendas-y-marcas";
import { FilaNivel, ListaCard } from "./FilaNivel";

interface Props {
  refreshKey: number;
}

export default function PortadaTiendas({ refreshKey }: Props) {
  const [filas, setFilas] = useState<FilaTienda[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [recargar, setRecargar] = useState(0);
  const [texto, setTexto] = useState("");

  useEffect(() => {
    let cancelado = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/marketing/tiendas", { cache: "no-store" });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { filas?: FilaTienda[] };
        if (!cancelado) setFilas(Array.isArray(data.filas) ? data.filas : []);
      } catch {
        if (!cancelado) setFilas(null);
      } finally {
        if (!cancelado) setLoading(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [refreshKey, recargar]);

  const visibles = useMemo(() => filtrarTiendas(filas ?? [], texto), [filas, texto]);

  return (
    <div className="space-y-4">
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

      {loading && filas === null ? (
        <div className="h-64 rounded-lg bg-gray-100 animate-pulse" />
      ) : filas === null ? (
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
      ) : filas.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center">
          <p className="text-sm text-gray-600">Todavía no hay gastos en ninguna tienda.</p>
        </div>
      ) : visibles.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center">
          <p className="text-sm text-gray-600">Ninguna tienda coincide con lo que escribiste.</p>
        </div>
      ) : (
        <ListaCard>
          {visibles.map((f) => (
            <FilaNivel
              key={f.codigo ?? "general"}
              titulo={f.nombre}
              subtitulo={subtituloDeTienda(f)}
              monto={
                <MontoDeTienda total={f.total} noReportado={f.noReportado} />
              }
              href={f.href}
              ariaLabel={`Abrir ${f.nombre}`}
            />
          ))}
        </ListaCard>
      )}

      <p className="text-[12px] text-gray-500">
        Una tienda nueva se elige del directorio al registrar su primer gasto, con «＋ Gasto».
      </p>
    </div>
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
