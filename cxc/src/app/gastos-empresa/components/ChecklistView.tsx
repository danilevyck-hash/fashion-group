"use client";

import { useState } from "react";
import { useToast } from "@/components/ToastSystem";
import {
  ALL_EMPRESA_KEYS,
  API_BASE,
  GRUPO_KEY,
  empresaNombre,
  mesLabel,
  money,
  sumarMeses,
  type Resumen,
} from "./types";

interface Props {
  data: Resumen;
  mes: string;
  hoyMes: string;
  onCambiarMes: (mes: string) => void;
  onAbrirEmpresa: (key: string) => void;
  onRefrescar: () => Promise<unknown> | void;
}

export default function ChecklistView({ data, mes, hoyMes, onCambiarMes, onAbrirEmpresa, onRefrescar }: Props) {
  const { toast } = useToast();
  const [copiando, setCopiando] = useState(false);

  // Total del mes por empresa (incluye la fila especial "grupo").
  const totales = new Map<string, number>();
  for (const g of data.gastos) {
    totales.set(g.empresa_key, (totales.get(g.empresa_key) ?? 0) + (Number(g.monto) || 0));
  }
  const cargadas = ALL_EMPRESA_KEYS.filter((k) => totales.has(k)).length;
  const mesVacio = data.gastos.length === 0;

  const copiarMesAnterior = async () => {
    setCopiando(true);
    try {
      const res = await fetch(`${API_BASE}/copiar-mes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mes }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error("err");
      toast(`Listo — se copiaron ${json.copiadas} montos del mes anterior. Ajusta lo que cambió.`);
      await onRefrescar();
    } catch {
      toast("No se pudo copiar el mes anterior. Intenta de nuevo.", "error");
    } finally {
      setCopiando(false);
    }
  };

  return (
    <>
      {/* Navegación de mes */}
      <div className="flex items-center justify-center gap-1 mb-4">
        <button
          onClick={() => onCambiarMes(sumarMeses(mes, -1))}
          aria-label="Mes anterior"
          className="w-11 h-11 flex items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 active:scale-[0.97] transition"
        >
          <ChevronIcon dir="left" />
        </button>
        <div className="min-w-[10.5rem] text-center text-base font-semibold text-gray-900">{mesLabel(mes)}</div>
        <button
          onClick={() => onCambiarMes(sumarMeses(mes, 1))}
          disabled={sumarMeses(mes, 1) > hoyMes}
          aria-label="Mes siguiente"
          className="w-11 h-11 flex items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 active:scale-[0.97] transition disabled:opacity-30 disabled:pointer-events-none"
        >
          <ChevronIcon dir="right" />
        </button>
      </div>

      {/* Copiar del mes anterior */}
      <div className="mb-4">
        <button
          onClick={copiarMesAnterior}
          disabled={!data.prevMesTieneDatos || copiando}
          className="w-full rounded-md border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:border-gray-300 active:scale-[0.97] transition disabled:opacity-40 disabled:pointer-events-none"
        >
          {copiando ? "Copiando…" : "Copiar del mes anterior"}
        </button>
        {!data.prevMesTieneDatos && (
          <p className="text-xs text-gray-400 mt-1.5 text-center">El mes anterior no tiene datos</p>
        )}
      </div>

      {mesVacio && (
        <div className="rounded-lg border border-green-200 bg-green-50/60 p-4 mb-4">
          <p className="text-sm text-green-800">
            Este mes todavía no tiene gastos. Empieza por Grupo o copia el mes anterior.
          </p>
        </div>
      )}

      {/* Fila Grupo (compartidos) — visualmente distinta */}
      <button
        onClick={() => onAbrirEmpresa(GRUPO_KEY)}
        className="w-full text-left rounded-lg border border-green-200 bg-green-50/40 p-4 mb-4 hover:border-green-300 active:scale-[0.99] transition"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-900">Grupo (compartidos)</div>
            <div className="text-xs text-gray-500 mt-0.5">
              Se reparte entre las empresas según sus ventas del mes
            </div>
          </div>
          <div className="shrink-0 flex items-center gap-3">
            <div className="text-right">
              <div className="text-sm font-semibold tabular-nums text-gray-900">
                {totales.has(GRUPO_KEY) ? money(totales.get(GRUPO_KEY)!) : <span className="text-gray-300">—</span>}
              </div>
              <EstadoChip cargado={totales.has(GRUPO_KEY)} />
            </div>
            <ChevronIcon dir="right" className="text-gray-300" />
          </div>
        </div>
      </button>

      {/* Progreso */}
      <div className="flex items-center gap-3 mb-2">
        <p className="text-xs text-gray-500 shrink-0">
          <span className="font-semibold text-green-700 tabular-nums">{cargadas} de {ALL_EMPRESA_KEYS.length}</span> empresas cargadas
        </p>
        <div className="flex-1 h-1.5 rounded-full bg-gray-200 overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full transition-all"
            style={{ width: `${(cargadas / ALL_EMPRESA_KEYS.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Las 8 empresas */}
      <div className="rounded-lg border border-gray-200 bg-white divide-y divide-gray-100 mb-6">
        {ALL_EMPRESA_KEYS.map((key) => {
          const cargado = totales.has(key);
          return (
            <button
              key={key}
              onClick={() => onAbrirEmpresa(key)}
              className="w-full text-left flex items-center justify-between gap-3 p-4 min-h-[44px] hover:bg-gray-50 active:bg-gray-100 transition first:rounded-t-lg last:rounded-b-lg"
            >
              <span className="text-sm font-medium text-gray-900 truncate">{empresaNombre(key)}</span>
              <span className="shrink-0 flex items-center gap-3">
                <span className="text-right">
                  <span className="block text-sm font-semibold tabular-nums text-gray-900">
                    {cargado ? money(totales.get(key)!) : <span className="text-gray-300">—</span>}
                  </span>
                  <EstadoChip cargado={cargado} />
                </span>
                <ChevronIcon dir="right" className="text-gray-300" />
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

function EstadoChip({ cargado }: { cargado: boolean }) {
  return cargado ? (
    <span className="inline-block mt-0.5 text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-px">
      ✓ Cargado
    </span>
  ) : (
    <span className="inline-block mt-0.5 text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-px">
      Pendiente
    </span>
  );
}

function ChevronIcon({ dir, className = "" }: { dir: "left" | "right"; className?: string }) {
  return (
    <svg
      width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`}
    >
      {dir === "left" ? <path d="M15 18l-6-6 6-6" /> : <path d="M9 6l6 6-6 6" />}
    </svg>
  );
}
