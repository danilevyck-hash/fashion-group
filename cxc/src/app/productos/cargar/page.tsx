"use client";

import { Suspense, useRef, useState } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
import { useUrlState } from "@/lib/hooks/useUrlState";
import AppHeader from "@/components/AppHeader";
import DesplegableFlotante from "@/components/ui/DesplegableFlotante";
import DepuradorDispatcher from "./DepuradorDispatcher";
import FacturasTiendaClient from "./FacturasTiendaClient";
import HistorialView from "./HistorialView";
import FormulasConfig from "./FormulasConfig";
import ReglasView from "./ReglasView";
import CurvasView from "./CurvasView";
import CatalogoDescripcionesAdmin from "./CatalogoDescripcionesAdmin";

type Tab = "depurador" | "facturas" | "curvas" | "formulas" | "reglas" | "historial";
type FormulasScope = "depurador" | "tienda";

/** Las 6 pestañas, en UN solo lugar: las dibujan tanto el desplegable (angosto)
 *  como la fila de píldoras (≥lg), y no pueden desincronizarse. Las etiquetas
 *  son EXACTAMENTE las que ya estaban en pantalla. */
const PESTANAS: { id: Tab; label: string }[] = [
  { id: "depurador", label: "Depurador" },
  { id: "facturas", label: "Facturas Tienda" },
  { id: "curvas", label: "Tallas" },
  { id: "formulas", label: "Fórmulas por marca" },
  { id: "reglas", label: "Reglas" },
  { id: "historial", label: "Historial" },
];

/**
 * Las pestañas en celular e iPad vertical: un botón que dice en cuál estás y
 * despliega las 6.
 *
 * El panel es `<DesplegableFlotante>` (portal a <body> + `position: fixed`),
 * que es EL desplegable de la casa: un panel `absolute` acá lo recortaría el
 * primer ancestro con overflow, y hay un candado (`__tests__/desplegables-flotan`)
 * que pone el build rojo si alguien escribe uno nuevo a mano.
 *
 * Cuando está cerrado NO existe en el DOM, así que duplicar el control
 * (desplegable en angosto + píldoras en ancho) no duplica opciones para nadie
 * — ni para un lector de pantalla ni para la medición.
 */
function SelectorPestanas({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const [abierto, setAbierto] = useState(false);
  const anclaRef = useRef<HTMLButtonElement>(null);
  const actual = PESTANAS.find(p => p.id === tab) ?? PESTANAS[0];

  return (
    <div className="lg:hidden">
      <button
        ref={anclaRef}
        type="button"
        onClick={() => setAbierto(a => !a)}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-label="Sección del Depurador"
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-stone-200 bg-white px-4 min-h-[44px] text-sm font-medium text-stone-700 transition hover:bg-stone-50"
      >
        <span className="truncate">{actual.label}</span>
        <svg className="h-4 w-4 shrink-0 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <DesplegableFlotante
        abierto={abierto}
        anclaRef={anclaRef}
        onCerrar={() => setAbierto(false)}
        marca="depurador-pestanas"
        role="listbox"
        aria-label="Sección del Depurador"
        anchoMinimo={220}
        className="bg-white rounded-xl border border-black/10 shadow-lg py-1"
      >
        {PESTANAS.map(p => (
          <button
            key={p.id}
            type="button"
            role="option"
            aria-selected={p.id === tab}
            onClick={() => { onChange(p.id); setAbierto(false); }}
            className={`w-full min-h-[44px] px-4 flex items-center justify-between gap-2 text-left text-sm transition hover:bg-black/5 ${
              p.id === tab ? "font-semibold text-teal-700" : "text-stone-700"
            }`}
          >
            <span>{p.label}</span>
            {p.id === tab && (
              <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
        ))}
      </DesplegableFlotante>
    </div>
  );
}

export default function CargarProductosPage() {
  return (
    <Suspense>
      <CargarInner />
    </Suspense>
  );
}

function CargarInner() {
  const { authChecked, role } = useAuth({ moduleKey: "cargar", allowedRoles: ["admin", "secretaria"] });
  // La pestaña vive en la URL (?tab=historial) → refresh y compartir-link
  // conservan la vista. Tab del MISMO nivel → replace (default): el Atrás del
  // navegador no cicla por pestañas (convención del sistema). Un valor
  // desconocido en la URL cae en la pestaña por defecto, nunca en blanco.
  const [tabRaw, setTab] = useUrlState<Tab>("tab", "depurador");
  const tab: Tab = PESTANAS.some((p) => p.id === tabRaw) ? tabRaw : "depurador";
  const [formulasScope, setFormulasScope] = useState<FormulasScope>("depurador");
  const [refreshKey, setRefreshKey] = useState(0);

  if (!authChecked) return null;

  // Registra la carga en el server al descargar (lo único que toca backend).
  const handleDownloaded = async (payload: {
    empresa: string;
    marca: string;
    cantidad_estilos: number;
    total_unidades: number;
    total_costo: number;
  }) => {
    try {
      await fetch("/api/productos/cargar/historial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setRefreshKey((k) => k + 1);
    } catch {
      // El historial es secundario: si falla el registro, la descarga ya ocurrió.
    }
  };

  return (
    <div className="min-h-screen bg-stone-50">
      <AppHeader module="Depurador" />

      <div className="mx-auto max-w-5xl px-4 pt-4">
        {/* ── 🩸 LAS 6 PESTAÑAS, MEDIDAS (30-jul-2026, build de producción) ──
            Antes esto era UNA fila con `overflow-x-auto`. Arrastraba 295px a
            390 y 75px a 834: de las 6 pestañas se veían ~3, y **Fórmulas por
            marca, Reglas e Historial solo existían si uno adivinaba que la fila
            se arrastra de costado**. Es EL MISMO caso que los filtros del
            catálogo Tommy (10 de 15 opciones invisibles), y se resuelve igual:
            hasta `lg`, un DESPLEGABLE; de `lg` para arriba, la fila intacta.

            El corte es `lg` (1024) y está MEDIDO, no elegido: a 1024 la fila ya
            daba 0px de arrastre antes de tocar nada. */}
        <SelectorPestanas tab={tab} onChange={setTab} />

        {/* ≥lg: la misma fila de siempre. No se le tocó una sola clase salvo el
            `hidden lg:flex` que la esconde en angosto. */}
        <div className="hidden lg:flex w-full flex-nowrap overflow-x-auto rounded-lg border border-stone-200 bg-white p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {PESTANAS.map(p => (
            <TabBtn key={p.id} active={tab === p.id} onClick={() => setTab(p.id)}>{p.label}</TabBtn>
          ))}
        </div>
      </div>

      {/* Depurador SIEMPRE montado (solo oculto) para que el Excel cargado y sus
          ediciones sobrevivan al cambiar de pestaña (FIX 1). El dispatcher detecta
          CK/TH vs Reebok y aplica el flujo correcto en el mismo tab. */}
      <div className={tab === "depurador" ? "" : "hidden"}>
        <DepuradorDispatcher onDownloaded={handleDownloaded} />
      </div>
      {/* Facturas Tienda también queda montada (oculta) para no perder la factura
          cargada al cambiar de pestaña — mismo criterio que el Depurador. */}
      <div className={tab === "facturas" ? "" : "hidden"}>
        <FacturasTiendaClient onDownloaded={handleDownloaded} />
      </div>
      {/* Curvas también queda montada (oculta) para no perder el archivo cargado
          al cambiar de pestaña — mismo criterio que el Depurador. */}
      <div className={tab === "curvas" ? "" : "hidden"}>
        <CurvasView />
      </div>
      {tab === "formulas" && (
        <div className="mx-auto max-w-4xl px-4 pt-4">
          {/* Dos sets de fórmulas: Depurador (importación) y Tienda (Facturas Tienda).
              key={scope} remonta el componente para re-sembrar el catálogo. */}
          <div className="flex w-full flex-nowrap overflow-x-auto rounded-lg border border-stone-200 bg-white p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <TabBtn active={formulasScope === "depurador"} onClick={() => setFormulasScope("depurador")}>Depurador (importación)</TabBtn>
            <TabBtn active={formulasScope === "tienda"} onClick={() => setFormulasScope("tienda")}>Tienda (facturas)</TabBtn>
          </div>
        </div>
      )}
      {tab === "formulas" && <FormulasConfig key={formulasScope} scope={formulasScope} />}
      {/* Catálogo de descripciones (tabla depurador_descripciones) — SOLO admin. */}
      {tab === "formulas" && role === "admin" && <CatalogoDescripcionesAdmin />}
      {tab === "reglas" && <ReglasView />}
      {tab === "historial" && <HistorialView refreshKey={refreshKey} />}
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-md px-4 min-h-[44px] text-sm font-medium transition ${
        active ? "bg-teal-600 text-white" : "text-stone-600 hover:bg-stone-100"
      }`}
    >
      {children}
    </button>
  );
}
