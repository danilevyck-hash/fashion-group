"use client";

// El INICIO de Confecciones Boston — la primera pantalla de David.
//
// 🔴 ES LA FUGA Nº 2 DEL PEDIDO, TAPADA. El `/home` del sistema muestra los KPI
// del GRUPO; David no llega ahí porque su único módulo es `boston` y el
// auto-redirect de "rol con un solo módulo" —el mismo que ya manda a Jennifer a
// /multifashion— lo trae directo acá.
//
// Las cuatro tarjetas son PUERTAS, no adornos: cada una lleva a la pestaña que
// la explica. Un número sin a dónde ir obliga a buscar la pestaña a mano.

import useSWR from "swr";
import { fmt } from "@/lib/format";
import SyncStatus from "@/components/shared/SyncStatus";
import { EMPRESA_KEY_TO_NAME } from "@/lib/empresa-mapping";
import { empresasCarteraAparte } from "@/lib/switch-api/empresas";
import type { TabBoston } from "@/lib/boston/rol";

// 🔴 La lista se DERIVA de `empresasCarteraAparte()` (= estadoCuenta:true +
// cxc:false, o sea SOLO Boston) en vez de escribirse a mano, que es la misma
// regla que ya cumple la pestaña CXC: una lista paralela es la que un día se
// aparta en silencio y mete una fila del grupo donde Daniel prohibió mezclar.
const EMPRESAS_BOSTON = empresasCarteraAparte();

interface Inicio {
  anio: number;
  mes: number;
  cartera: { total: number; d0_90: number; d91_120: number; d121_plus: number; clientes: number };
  ventas: { mes: number; anio: number };
  planilla: { personas: number };
  prestamos: { personas: number };
}

const fetcher = (u: string) =>
  fetch(u, { cache: "no-store" }).then((r) => {
    if (!r.ok) throw new Error("No se pudo leer el inicio de Confecciones Boston");
    return r.json();
  });

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function Tarjeta({
  titulo,
  valor,
  pie,
  onIr,
}: {
  titulo: string;
  valor: string;
  pie: string;
  onIr: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onIr}
      className="min-h-[44px] text-left rounded-xl border border-gray-200 bg-white p-4 transition
                 hover:border-gray-300 hover:shadow-sm active:scale-[0.97]"
    >
      <span className="block text-xs uppercase tracking-wide text-gray-500">{titulo}</span>
      <span className="block mt-1 text-2xl font-semibold tabular-nums text-gray-900">{valor}</span>
      <span className="block mt-0.5 text-xs text-gray-500">{pie}</span>
    </button>
  );
}

export default function InicioBoston({ onIr }: { onIr: (t: TabBoston) => void }) {
  const { data, error, isLoading } = useSWR<Inicio>("/api/boston/inicio", fetcher, {
    revalidateOnFocus: false,
  });

  if (error) {
    return <p className="text-sm text-red-600 py-8">No se pudo cargar el inicio de Confecciones Boston.</p>;
  }

  const c = data?.cartera;
  const mesNombre = data ? MESES[(data.mes ?? 1) - 1] : "";

  return (
    <div>
      {/* De cuándo son las cifras de abajo. Va PRIMERO, igual que en la pestaña
          CXC: lo primero que se lee antes de creerle a un número. */}
      <SyncStatus
        tabla="estadocuenta"
        empresasEsperadas={EMPRESAS_BOSTON}
        empresaLabels={EMPRESA_KEY_TO_NAME}
        className="mb-3"
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <Tarjeta
          titulo="Por cobrar"
          valor={isLoading ? "—" : `$${fmt(c?.total ?? 0)}`}
          pie={isLoading ? "cargando…" : `${c?.clientes ?? 0} clientes`}
          onIr={() => onIr("cxc")}
        />
        <Tarjeta
          titulo={`Vendido en ${mesNombre || "el mes"}`}
          valor={isLoading ? "—" : `$${fmt(data?.ventas.mes ?? 0)}`}
          pie={isLoading ? "cargando…" : `$${fmt(data?.ventas.anio ?? 0)} en ${data?.anio ?? ""}`}
          onIr={() => onIr("ventas")}
        />
        <Tarjeta
          titulo="En planilla"
          valor={isLoading ? "—" : String(data?.planilla.personas ?? 0)}
          pie="personas activas"
          onIr={() => onIr("planilla")}
        />
        <Tarjeta
          titulo="Con préstamo"
          valor={isLoading ? "—" : String(data?.prestamos.personas ?? 0)}
          pie="personas de Boston"
          onIr={() => onIr("prestamos")}
        />
      </div>

      {/* El desglose de la cartera, que es lo que decide a quién se llama hoy.
          Los mismos tres tramos y los mismos cortes que la pestaña CXC. */}
      {c && (
        <div className="mt-3 rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Cómo está la cartera</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
            <p className="flex items-baseline justify-between gap-2">
              <span className="text-emerald-600">Al día (0-90)</span>
              <span className="tabular-nums font-medium">${fmt(c.d0_90)}</span>
            </p>
            <p className="flex items-baseline justify-between gap-2">
              <span className="text-amber-600">91-120</span>
              <span className="tabular-nums font-medium">${fmt(c.d91_120)}</span>
            </p>
            <p className="flex items-baseline justify-between gap-2">
              <span className="text-red-600">121 y más</span>
              <span className="tabular-nums font-medium">${fmt(c.d121_plus)}</span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
