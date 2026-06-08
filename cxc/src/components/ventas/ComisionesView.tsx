"use client";

// Shell del tab Comisiones (empresas B2B / mayoreo). Controla el modo de vista
// (Todas las empresas / Por empresa, con memoria) y el período compartido
// (mes/año, con meses futuros no navegables). Delega el render a:
//  - ComisionesConsolidadoView (matriz vendedor × empresa, default)
//  - ComisionesPorEmpresaView  (una empresa a la vez)

import { useEffect, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EMPRESA_KEY_TO_NAME, B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import SyncStatus from "@/components/shared/SyncStatus";
import { ComisionesConsolidadoView } from "./ComisionesConsolidadoView";
import { ComisionesPorEmpresaView } from "./ComisionesPorEmpresaView";
import { ComisionesCriterios } from "./ComisionesCriterios";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const EMPRESAS = B2B_EMPRESA_KEYS.filter((k) => k !== "joystep");
const MODE_KEY = "fg_comisiones_mode";

type Mode = "todas" | "empresa";

interface ComisionesViewProps {
  availableYears: number[];
}

export function ComisionesView({ availableYears }: ComisionesViewProps) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const [mode, setMode] = useState<Mode>("todas");
  const [year, setYear] = useState<number>(currentYear);
  const [mes, setMes] = useState<number>(currentMonth);

  // Recuerda el último modo de vista.
  useEffect(() => {
    const saved = localStorage.getItem(MODE_KEY);
    if (saved === "todas" || saved === "empresa") setMode(saved);
  }, []);

  const handleMode = (m: Mode) => {
    setMode(m);
    localStorage.setItem(MODE_KEY, m);
  };

  // Meses futuros no navegables: en el año en curso, solo hasta el mes actual.
  const mesDeshabilitado = (m: number) => year === currentYear && m > currentMonth;

  const handleYear = (y: number) => {
    setYear(y);
    // Si el mes quedó en el futuro del nuevo año, lo bajamos al mes en curso.
    if (y === currentYear && mes > currentMonth) setMes(currentMonth);
  };

  return (
    <div className="space-y-4">
      {/* Barra superior: modo + período + estado de sync */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Toggle de modo */}
        <div className="inline-flex rounded-md border border-gray-200 p-0.5">
          {([["todas", "Todas las empresas"], ["empresa", "Por empresa"]] as [Mode, string][]).map(([m, label]) => (
            <button
              key={m}
              onClick={() => handleMode(m)}
              className={`rounded px-3 py-1.5 text-sm font-medium transition active:scale-[0.97] ${
                mode === m ? "bg-black text-white" : "text-gray-600 hover:text-black"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <Select value={String(mes)} onValueChange={(v) => setMes(parseInt(v, 10))}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {MESES.map((m, i) => (
              <SelectItem key={i} value={String(i + 1)} disabled={mesDeshabilitado(i + 1)}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={String(year)} onValueChange={(v) => handleYear(parseInt(v, 10))}>
          <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {availableYears.filter((y) => y <= currentYear).map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <SyncStatus
          tabla="facturas"
          empresasEsperadas={EMPRESAS}
          empresaLabels={EMPRESA_KEY_TO_NAME}
          variant="pill"
          prefix="Data actualizada al"
        />
      </div>

      <ComisionesCriterios />

      {mode === "todas" ? (
        <ComisionesConsolidadoView year={year} mes={mes} />
      ) : (
        <ComisionesPorEmpresaView year={year} mes={mes} />
      )}
    </div>
  );
}
