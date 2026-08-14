"use client";

// Shell del módulo Comisiones (empresas B2B / mayoreo). Controla el modo de
// vista (Todas las empresas / Por empresa, con memoria) y el período compartido
// (mes/año, con meses futuros no navegables). Delega el render a:
//  - ComisionesConsolidadoView (matriz vendedor × empresa, default)
//  - ComisionesPorEmpresaView  (una empresa a la vez)
//
// ─── Encabezado: 481px → 2 filas (jul-2026) ──────────────────────────────────
// Medido con datos de producción en 390×844: del borde de arriba al primer
// número de comisión había 481px, el 57% del iPhone, y en Safari real (área
// útil ~664px) entraban 4 vendedores de 6. Eran cuatro bloques apilados —
// título grande, fila de 5 controles, acordeón "Criterios" y una fila entera
// solo para el botón Excel.
//
// Lo que se hizo, con el lenguaje visual que ya estrenó CXC (/admin): sin
// título grande (el módulo ya se nombra en el header sticky y en el breadcrumb),
// pestañas de modo en la primera línea, y las acciones que Daniel usa —
// período, "Actualizar ahora" y Excel — en la segunda. Mes y año pasaron a ser
// UN control ("Julio 2026"), no dos cajas. "Criterios" y la fecha de
// sincronizado NO se borraron: viven en el ⓘ de la primera línea, que cerrado
// no ocupa alto propio.
//
// El botón Excel SUBIÓ acá desde las dos vistas hijas (cada una gastaba una
// fila de 44px solo para él). La vista hija sigue siendo la dueña del cálculo
// del Excel: registra su función con `onExcel` y este shell solo la dispara.
// Ningún número ni ningún cálculo cambió — esto es puramente de layout.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { EMPRESA_KEY_TO_NAME } from "@/lib/empresa-mapping";
import { EMPRESAS_COMISIONAN } from "@/lib/comisiones/empresas";
import SyncStatus from "@/components/shared/SyncStatus";
import SyncNowButton from "@/components/shared/SyncNowButton";
import { SYNC_NOW_RECIBOS_OPCIONES } from "@/components/shared/syncNowOpciones";
import { ComisionesCriterios } from "./ComisionesCriterios";
import { ComisionesPeriodo } from "./ComisionesPeriodo";
import dynamic from "next/dynamic";

// Vistas LAZY: solo el modo activo (Todas / Por empresa) descarga su JS, en su
// propio chunk → fuera del bundle inicial de /comisiones. Skeleton mientras carga.
function ViewSkeleton() {
  return <div className="mt-4 h-72 w-full animate-pulse rounded-lg bg-gray-100" aria-hidden />;
}
const ComisionesConsolidadoView = dynamic(
  () => import("./ComisionesConsolidadoView").then((m) => m.ComisionesConsolidadoView),
  { ssr: false, loading: () => <ViewSkeleton /> },
);
const ComisionesPorEmpresaView = dynamic(
  () => import("./ComisionesPorEmpresaView").then((m) => m.ComisionesPorEmpresaView),
  { ssr: false, loading: () => <ViewSkeleton /> },
);

// La CUARTA copia de la lista de empresas era esta línea, escrita a mano
// (`B2B_EMPRESA_KEYS.filter(k => k !== "joystep")`) mientras las otras tres ya
// leían `EMPRESAS_COMISIONAN`. Justo lo que el módulo `lib/comisiones/empresas`
// existe para impedir: al entrar joystep a la matriz, las tablas lo mostraban
// y este banner de "Sincronizado" seguía sin vigilarlo.
const EMPRESAS = EMPRESAS_COMISIONAN;
const MODE_KEY = "fg_comisiones_mode";

type Mode = "todas" | "empresa";

/** Lo que una vista hija expone para que el Excel viva en la barra de arriba. */
export interface ExcelApi {
  run: () => void;
  disabled: boolean;
}

interface ComisionesViewProps {
  availableYears: number[];
}

export function ComisionesView({ availableYears }: ComisionesViewProps) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const [mode, setMode] = useState<Mode>("todas");
  // 🩸 Contador de recarga. "Actualizar ahora" sincroniza los RECIBOS, pero la
  // tabla los pidió al abrir la pantalla: sin esto, Daniel arreglaba el
  // vendedor en Switch, tocaba el botón y la tabla seguía diciendo DEFAULT con
  // un toast que le aseguraba que los datos estaban frescos.
  const [refreshKey, setRefreshKey] = useState(0);
  const [year, setYear] = useState<number>(currentYear);
  const [mes, setMes] = useState<number>(currentMonth);
  const [syncStale, setSyncStale] = useState(false);

  // Excel: la vista hija registra su función; acá solo se dispara. La función
  // se guarda en un ref (cambia en cada render de la hija) y en el estado solo
  // queda si está habilitado, que es lo único que pinta el botón.
  const excelRef = useRef<(() => void) | null>(null);
  const [excelDisabled, setExcelDisabled] = useState(true);
  const registrarExcel = useCallback((api: ExcelApi | null) => {
    excelRef.current = api ? api.run : null;
    setExcelDisabled(api ? api.disabled : true);
  }, []);

  // Recuerda el último modo de vista.
  useEffect(() => {
    const saved = localStorage.getItem(MODE_KEY);
    if (saved === "todas" || saved === "empresa") setMode(saved);
  }, []);

  const handleMode = (m: Mode) => {
    setMode(m);
    localStorage.setItem(MODE_KEY, m);
  };

  const handlePeriodo = (y: number, m: number) => {
    setYear(y);
    setMes(m);
  };

  return (
    <div className="space-y-2">
      {/* Fila 1 — modo de vista + ⓘ (criterios y frescura del dato).
          Mismo patrón que las pestañas de CXC: sin título grande arriba. */}
      <div className="flex items-center gap-1 border-b border-gray-200">
        {([["todas", "Todas las empresas"], ["empresa", "Por empresa"]] as [Mode, string][]).map(([m, label]) => (
          <button
            key={m}
            type="button"
            onClick={() => handleMode(m)}
            aria-current={mode === m ? "page" : undefined}
            className={`-mb-px min-h-[44px] whitespace-nowrap border-b-2 px-2.5 text-sm transition active:scale-[0.97] ${
              mode === m
                ? "border-gray-900 font-medium text-gray-900"
                : "border-transparent text-gray-400 hover:text-gray-600"
            }`}
          >
            {label}
          </button>
        ))}

        <ComisionesCriterios className="ml-auto" aviso={syncStale}>
          <SyncStatus
            tabla="facturas"
            empresasEsperadas={EMPRESAS}
            empresaLabels={EMPRESA_KEY_TO_NAME}
            prefix="Sincronizado"
            onStale={setSyncStale}
          />
        </ComisionesCriterios>
      </div>

      {/* Fila 2 — lo que Daniel usa: período, actualizar, Excel.
          En 390px los tres miden 346px de los 358 disponibles: van con
          shrink-0 (para que ninguno se comprima y parta su texto en dos
          líneas) y la fila con flex-wrap, que es el modo de fallar bueno —
          si algún día no entran, se bajan a otra línea en vez de sacar la
          página para el costado. */}
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
        <ComisionesPeriodo
          mes={mes}
          year={year}
          availableYears={availableYears}
          onChange={handlePeriodo}
        />

        {/* "Actualizar ahora" de RECIBOS (cobros) — vive acá porque la comisión
            sobre cobro lee switch_recibos. Menú para elegir la empresa (una por
            disparo — sesión única Switch). */}
        <SyncNowButton
          opciones={SYNC_NOW_RECIBOS_OPCIONES}
          className="shrink-0"
          onSuccess={() => setRefreshKey((k) => k + 1)}
        />

        <button
          type="button"
          onClick={() => excelRef.current?.()}
          disabled={excelDisabled}
          className="ml-auto inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-md border border-gray-200 px-2.5 text-sm text-gray-700 transition hover:border-black hover:text-black active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 sm:gap-1.5 sm:px-3"
        >
          <FileSpreadsheet className="h-4 w-4 shrink-0" /> Excel
        </button>
      </div>

      {mode === "todas" ? (
        <ComisionesConsolidadoView year={year} mes={mes} onExcel={registrarExcel} refreshKey={refreshKey} />
      ) : (
        <ComisionesPorEmpresaView year={year} mes={mes} onExcel={registrarExcel} refreshKey={refreshKey} />
      )}
    </div>
  );
}
