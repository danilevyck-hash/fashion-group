"use client";

// «Vendido por tipo» (28-nov-2026, `VG_UTILIDAD_Y_VENDIDO_POR_TIPO_2026_11`):
// piezas por tipo de artículo, con SU período (el resto de la Vista general es
// «hoy»). Tocar una barra abre los artículos de ese tipo, para revisar la
// clasificación. Las reglas viven en `lib/vista-general/vendido-por-tipo.ts`.

import { useMemo, useState } from "react";
import useSWR from "swr";
import { ChipSelector } from "@/components/celular/BarraDeControles";
import { BottomSheet } from "@/components/ui";
import { useUrlState } from "@/lib/hooks/useUrlState";
import { hoyPanama } from "@/lib/fecha-panama";
import { nombreCortoEmpresa } from "@/lib/empresa-mapping";
import { VALOR_GRUPO, empresasDe } from "@/lib/vista-general/hoy";
import {
  OTROS,
  agruparPorTipo,
  articulosDeFila,
  esBoston,
  opcionesPeriodoTipo,
  parteTexto,
  periodoTipoValido,
  piezasTexto,
  type ArticuloVendido,
} from "@/lib/vista-general/vendido-por-tipo";

interface Respuesta {
  desde: string;
  hasta: string;
  sinTipo: boolean;
  articulos: ArticuloVendido[];
}

const fetcher = (url: string) => fetch(url).then((r) => { if (!r.ok) throw new Error("err"); return r.json(); });

export default function VendidoPorTipo({ empresa, className = "" }: { empresa: string; className?: string }) {
  const hoy = hoyPanama();
  const [periodoUrl, setPeriodo] = useUrlState("periodoTipo", "anio");
  const opciones = opcionesPeriodoTipo(hoy, empresasDe(empresa));
  // Un año que esta empresa no tiene (Joystep 2024) abre en el año en curso.
  const pedido = periodoTipoValido(periodoUrl, hoy);
  const periodo = opciones.some((o) => o.valor === pedido) ? pedido : "anio";
  const { data, error, isLoading } = useSWR<Respuesta>(
    `/api/dashboard/vista-general/vendido-por-tipo?empresa=${encodeURIComponent(empresa)}&periodo=${periodo}`,
    fetcher,
    { dedupingInterval: 300_000, revalidateOnFocus: false, keepPreviousData: true },
  );
  const r = useMemo(() => (data ? agruparPorTipo(data.articulos) : null), [data]);
  const [abierto, setAbierto] = useState<string | null>(null);
  const max = r ? Math.max(0, ...r.filas.map((f) => f.piezas)) : 0;
  const vacio = r != null && (r.total <= 0 || r.filas.length === 0);

  return (
    <section className={`block rounded-[14px] border border-gray-200 bg-white p-4 ${className}`} data-vendido-por-tipo>
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-medium text-gray-500">Vendido por tipo</h2>
        <span className="flex-1" />
        <ChipSelector rotulo="Período" soloValor valor={periodo} opciones={opciones} onCambiar={setPeriodo} />
      </div>

      {error ? (
        <p className="mt-1 text-sm text-gray-500">No se pudo medir</p>
      ) : isLoading && !data ? (
        <div className="mt-3 animate-pulse space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-7 rounded bg-gray-100" />
          ))}
        </div>
      ) : data?.sinTipo ? (
        <p className="mt-2 text-sm text-gray-500">
          {esBoston(empresa) ? "Confecciones Boston" : "Esta empresa"} no tiene el tipo de artículo en Switch.
        </p>
      ) : vacio || !r ? (
        <p className="mt-2 text-sm text-gray-500">
          Sin ventas en este período{r && r.total < 0 ? `. Solo notas de crédito: ${piezasTexto(r.total)} piezas.` : "."}
        </p>
      ) : (
        <>
          <p className="text-sm tabular-nums text-gray-500">{piezasTexto(r.total)} piezas</p>
          <ul className="mt-1">
            {r.filas.map((f) => {
              const otros = f.tipo === OTROS;
              return (
                <li key={f.tipo}>
                  <button
                    type="button"
                    onClick={() => setAbierto(f.tipo)}
                    className="block min-h-[44px] w-full rounded-md py-1.5 text-left transition active:bg-gray-50"
                    aria-label={`${f.tipo}: ${piezasTexto(f.piezas)} piezas. Ver artículos`}
                  >
                    <span className={`flex items-baseline gap-2 text-sm ${otros ? "text-gray-500" : "text-gray-900"}`}>
                      <span className="min-w-0 truncate">{f.tipo}</span>
                      <span className="ml-auto font-semibold tabular-nums text-gray-900">{piezasTexto(f.piezas)}</span>
                      <span className="w-10 text-right tabular-nums text-gray-500">{parteTexto(f.parte)}</span>
                    </span>
                    <span className="mt-1 block h-2 overflow-hidden rounded-full bg-gray-100">
                      <span
                        className={`block h-full rounded-full ${otros ? "bg-gray-300" : "bg-gray-900"}`}
                        style={{ width: `${max > 0 ? Math.max((f.piezas / max) * 100, 1.5) : 0}%` }}
                      />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {r.otrosNegativo < 0 && (
            <button
              type="button"
              data-otros-negativo
              onClick={() => setAbierto(OTROS)}
              className="mt-1 flex min-h-[44px] w-full items-baseline gap-2 rounded-md py-1.5 text-left text-sm text-gray-500 transition active:bg-gray-50"
            >
              <span>Otros (ajustes y devoluciones sin tipo)</span>
              <span className="ml-auto font-semibold tabular-nums text-gray-900">{piezasTexto(r.otrosNegativo)}</span>
              <span className="w-10" />
            </button>
          )}
        </>
      )}

      {r && data && (
        <ArticulosDelTipo
          tipo={abierto}
          articulos={abierto ? articulosDeFila(data.articulos, r, abierto) : []}
          variasEmpresas={empresa === VALOR_GRUPO}
          periodo={opciones.find((o) => o.valor === periodo)?.etiqueta ?? ""}
          onCerrar={() => setAbierto(null)}
        />
      )}
    </section>
  );
}

function ArticulosDelTipo({
  tipo,
  articulos,
  variasEmpresas,
  periodo,
  onCerrar,
}: {
  tipo: string | null;
  articulos: ArticuloVendido[];
  variasEmpresas: boolean;
  periodo: string;
  onCerrar: () => void;
}) {
  const total = articulos.reduce((s, a) => s + a.piezas, 0);
  return (
    <BottomSheet open={tipo != null} onClose={onCerrar} abreCompleta>
      <div className="flex items-center justify-between px-1 pb-2">
        <div className="min-w-0">
          <h2 className="text-[17px] font-semibold text-gray-900">{tipo}</h2>
          <p className="text-sm tabular-nums text-gray-500">
            {periodo} · {piezasTexto(total)} piezas · {articulos.length.toLocaleString("en-US")} artículos
          </p>
        </div>
        <button type="button" onClick={onCerrar} className="min-h-[44px] px-2 text-[16px] text-blue-600">
          Listo
        </button>
      </div>
      <table className="w-full border-collapse text-sm tabular-nums">
        <thead>
          <tr className="text-left text-[12px] font-semibold text-gray-500">
            <th className="py-2 pr-2">Artículo</th>
            <th className="py-2 text-right">Piezas</th>
          </tr>
        </thead>
        <tbody>
          {articulos.map((a) => (
            <tr key={`${a.empresa}|${a.codigo}|${a.tipo}`} className="border-t border-gray-100 align-top">
              <td className="py-2 pr-2">
                <span className="block text-gray-900">{a.descripcion || "(sin descripción)"}</span>
                <span className="block text-[12px] text-gray-500">
                  {a.codigo}
                  {variasEmpresas ? ` · ${nombreCortoEmpresa(a.empresa)}` : ""}
                </span>
              </td>
              <td className={`whitespace-nowrap py-2 text-right font-semibold ${a.piezas < 0 ? "text-red-700" : "text-gray-900"}`}>
                {piezasTexto(a.piezas)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </BottomSheet>
  );
}
