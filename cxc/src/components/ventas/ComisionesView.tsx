"use client";

// Shell del módulo Comisiones (empresas B2B / mayoreo). Controla el modo de
// vista (Todas las empresas / Por empresa / Multifashion / Configuración, con
// memoria) y el período compartido (mes/año, con meses futuros no navegables).
//
// 🩸 ABRE EN EL ÚLTIMO MES CERRADO (6-sep-2026, Daniel eligió «a»). Abría en el
// mes EN CURSO: medido el 5-sep, con 5 días de septiembre, la comisión bruta de
// las 6 empresas era $101,77 y el descuento fijo de $1.573,08 se restaba
// entero, así que lo PRIMERO que se veía al entrar era «Total a pagar
// −$1.471,31». Es una pantalla de cierre: nadie paga el día 5. El mes en curso
// queda a un toque y ningún cálculo cambia.
//
// 🩸 Y EL MES LO DECIDÍA EL RELOJ DEL NAVEGADOR (`new Date().getMonth() + 1`).
// Panamá es UTC−5 fijo y es invariante de la casa (`hoyPanama`): en un
// componente `"use client"` que también renderiza en el servidor (UTC), el
// primer y el último día del mes pueden pintar un mes distinto del que el
// navegador elige después. La cuenta vive en `lib/comisiones/mes-inicial.ts`,
// módulo puro.
//
// Delega el render a:
//  - ComisionesConsolidadoView   (matriz vendedor × empresa, default)
//  - ComisionesPorEmpresaView    (una empresa a la vez)
//  - VendedorasSubtab            (pestaña «Multifashion», ESPEJO de la de
//    Vendedoras del módulo Multifashion — 6-sep-2026. Daniel, textual: «quiero
//    que la pestaña de vendedoras de Multifashion pase aquí también, ya que
//    aquí podemos ver todas las comisiones. Y allá dejarlo tal cual como está.
//    No hay diferencia, solo son un espejo. Así las secretarias no podrán
//    entrar al módulo Multifashion.» 🔴 ESPEJO, NO FUSIÓN: Multifashion
//    comisiona con OTRA base (SUM(subtotal firmado) × 0,5 %, sin filtro de
//    utilidad) y que las dos digan «0,5 %» es coincidencia. No se unifican
//    cálculos, no se mezclan totales, no se suma una cosa con la otra: es la
//    MISMA vista, la MISMA RPC y los MISMOS números, dibujados en otra puerta.
//    Por eso tiene su propio selector de período (chips) y la fila de período /
//    Excel del shell no aplica.)
//  - ComisionesConfiguracionView (SOLO admin: tasas por vendedor, clientes
//    que no comisionan y descuentos). Era un modal «Configurar»; Daniel, 3-sep-2026:
//    «¿por qué en card y no como tab en toda la pantalla normal?». El período,
//    «Actualizar ahora» y el Excel no aplican a la configuración, así que esa
//    fila se esconde en ese modo. El chip es la ÚNICA entrada: el botón
//    «Configurar» de Por empresa se quitó (Daniel: «configuración en dos lados»).
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
import AvisoRechazosSwitch from "@/components/AvisoRechazosSwitch";
import { SYNC_NOW_RECIBOS_OPCIONES } from "@/components/shared/syncNowOpciones";
import { ComisionesCriterios } from "./ComisionesCriterios";
import { ComisionesPeriodo } from "./ComisionesPeriodo";
import { hoyPanama } from "@/lib/fecha-panama";
import { periodoInicial } from "@/lib/comisiones/mes-inicial";
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
const ComisionesConfiguracionView = dynamic(
  () => import("./ComisionesConfiguracionView").then((m) => m.ComisionesConfiguracionView),
  { ssr: false, loading: () => <ViewSkeleton /> },
);
// 🔴 La MISMA vista del módulo Multifashion, importada tal cual. Reescribirla
// sería la forma conocida de que un día los dos rankings digan cosas distintas.
const VendedorasSubtab = dynamic(
  () => import("@/components/multifashion/VendedorasSubtab").then((m) => m.VendedorasSubtab),
  { ssr: false, loading: () => <ViewSkeleton /> },
);

// La CUARTA copia de la lista de empresas era esta línea, escrita a mano
// (`B2B_EMPRESA_KEYS.filter(k => k !== "joystep")`) mientras las otras tres ya
// leían `EMPRESAS_COMISIONAN`. Justo lo que el módulo `lib/comisiones/empresas`
// existe para impedir: al entrar joystep a la matriz, las tablas lo mostraban
// y este banner de "Sincronizado" seguía sin vigilarlo.
const EMPRESAS = EMPRESAS_COMISIONAN;
const MODE_KEY = "fg_comisiones_mode";

type Mode = "todas" | "empresa" | "multifashion" | "config";
const esMode = (v: unknown): v is Mode =>
  v === "todas" || v === "empresa" || v === "multifashion" || v === "config";

/** Lo que una vista hija expone para que el Excel viva en la barra de arriba. */
export interface ExcelApi {
  run: () => void;
  disabled: boolean;
}

interface ComisionesViewProps {
  availableYears: number[];
  /** Lo que el guard dejó afuera de los cobros, ya redactado por el servidor. */
  avisoMontos?: string | null;
  /**
   * Dibuja la pestaña «Configuración» (solo admin). La monta el MÓDULO
   * Comisiones (/comisiones); la pestaña Comisiones de Ventas no la lleva —
   * Daniel, 3-sep-2026: «es el módulo Comisiones aparte, no la pestaña de
   * Ventas».
   */
  conConfiguracion?: boolean;
  /**
   * Dibuja la pestaña «Multifashion» (el espejo). La monta SOLO el módulo
   * /comisiones: la pestaña Comisiones de Ventas no la lleva porque Ventas ya
   * tiene su propia pestaña Multifashion, y dos puertas a lo mismo en la misma
   * pantalla es exactamente lo que Daniel mandó a quitar («configuración en dos
   * lados»).
   */
  conMultifashion?: boolean;
}

export function ComisionesView({
  availableYears,
  avisoMontos,
  conConfiguracion = false,
  conMultifashion = false,
}: ComisionesViewProps) {
  // Panamá, no el reloj del navegador. Y el período de arranque es el ÚLTIMO
  // MES CERRADO (ver el encabezado): la cuenta vive en el módulo puro.
  const inicial = periodoInicial(hoyPanama(), availableYears);

  const [mode, setMode] = useState<Mode>("todas");
  // «Configuración» es SOLO de admin y SOLO en el módulo /comisiones: el chip
  // no se dibuja para nadie más, y un modo guardado que aquí no existe cae a
  // «Todas las empresas».
  const [esAdmin, setEsAdmin] = useState(false);
  const hayConfig = esAdmin && conConfiguracion;
  // 🩸 Contador de recarga. "Actualizar ahora" sincroniza los RECIBOS, pero la
  // tabla los pidió al abrir la pantalla: sin esto, Daniel arreglaba el
  // vendedor en Switch, tocaba el botón y la tabla seguía diciendo DEFAULT con
  // un toast que le aseguraba que los datos estaban frescos.
  const [refreshKey, setRefreshKey] = useState(0);
  const [year, setYear] = useState<number>(inicial.year);
  const [mes, setMes] = useState<number>(inicial.mes);
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
    const admin = (sessionStorage.getItem("cxc_role") || "") === "admin";
    setEsAdmin(admin);
    const saved = localStorage.getItem(MODE_KEY);
    if (
      esMode(saved) &&
      (saved !== "config" || (admin && conConfiguracion)) &&
      (saved !== "multifashion" || conMultifashion)
    ) {
      setMode(saved);
    }
  }, [conConfiguracion, conMultifashion]);

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
        {([
          ["todas", "Todas las empresas"],
          ["empresa", "Por empresa"],
          ...(conMultifashion ? [["multifashion", "Multifashion"] as [Mode, string]] : []),
          ...(hayConfig ? [["config", "Configuración"] as [Mode, string]] : []),
        ] as [Mode, string][]).map(([m, label]) => (
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
      {mode !== "config" && !(mode === "multifashion" && conMultifashion) && (
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
      )}

      {/* Qué se quedó AFUERA de los cobros que alimentan estas comisiones.
          Va arriba de la tabla, en las dos pestañas: el mismo cobro corrupto
          afecta a las dos. Sin rechazos no se dibuja nada. */}
      <AvisoRechazosSwitch texto={avisoMontos} />

      {mode === "todas" ? (
        <ComisionesConsolidadoView year={year} mes={mes} onExcel={registrarExcel} refreshKey={refreshKey} />
      ) : mode === "config" && hayConfig ? (
        <ComisionesConfiguracionView />
      ) : mode === "multifashion" && conMultifashion ? (
        /* Espejo: la vista de Multifashion, con SU año y SUS chips de período.
           No se le pasa el período del shell porque la pestaña de allá tampoco
           lo usa — sus chips mandan, y así los dos lados dicen lo mismo. */
        <VendedorasSubtab selectedYear={inicial.year} />
      ) : (
        <ComisionesPorEmpresaView
          year={year}
          mes={mes}
          onExcel={registrarExcel}
          refreshKey={refreshKey}
        />
      )}
    </div>
  );
}
