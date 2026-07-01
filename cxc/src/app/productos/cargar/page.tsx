"use client";

import { Suspense, useState } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
import AppHeader from "@/components/AppHeader";
import DepuradorDispatcher from "./DepuradorDispatcher";
import HistorialView from "./HistorialView";
import FormulasConfig from "./FormulasConfig";
import ReglasView from "./ReglasView";

type Tab = "depurador" | "formulas" | "reglas" | "historial";

export default function CargarProductosPage() {
  return (
    <Suspense>
      <CargarInner />
    </Suspense>
  );
}

function CargarInner() {
  const { authChecked } = useAuth({ moduleKey: "cargar", allowedRoles: ["admin", "secretaria"] });
  const [tab, setTab] = useState<Tab>("depurador");
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
      <AppHeader module="Cargar Productos" />

      <div className="mx-auto max-w-5xl px-4 pt-4">
        <div className="inline-flex rounded-lg border border-stone-200 bg-white p-1">
          <TabBtn active={tab === "depurador"} onClick={() => setTab("depurador")}>Depurador</TabBtn>
          <TabBtn active={tab === "formulas"} onClick={() => setTab("formulas")}>Fórmulas por marca</TabBtn>
          <TabBtn active={tab === "reglas"} onClick={() => setTab("reglas")}>Reglas</TabBtn>
          <TabBtn active={tab === "historial"} onClick={() => setTab("historial")}>Historial</TabBtn>
        </div>
      </div>

      {/* Depurador SIEMPRE montado (solo oculto) para que el Excel cargado y sus
          ediciones sobrevivan al cambiar de pestaña (FIX 1). El dispatcher detecta
          CK/TH vs Reebok y aplica el flujo correcto en el mismo tab. */}
      <div className={tab === "depurador" ? "" : "hidden"}>
        <DepuradorDispatcher onDownloaded={handleDownloaded} />
      </div>
      {tab === "formulas" && <FormulasConfig />}
      {tab === "reglas" && <ReglasView />}
      {tab === "historial" && <HistorialView refreshKey={refreshKey} />}
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
        active ? "bg-teal-600 text-white" : "text-stone-600 hover:bg-stone-100"
      }`}
    >
      {children}
    </button>
  );
}
