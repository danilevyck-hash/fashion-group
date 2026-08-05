"use client";

// Módulo de Asistencia. Cinco pestañas; toda la regla de negocio vive en
// `lib/asistencia/reporte.ts`, que es el MISMO motor que arma el Excel y el
// PDF — así la pantalla y los archivos no pueden contradecirse.

import { useState } from "react";
import AppHeader from "@/components/AppHeader";
import ReporteTab from "./ReporteTab";
import CargarTab from "./CargarTab";
import HorariosTab from "./HorariosTab";
import JustificacionesTab from "./JustificacionesTab";
import FeriadosTab from "./FeriadosTab";
import ComoFuncionaTab from "./ComoFuncionaTab";

const TABS = [
  ["reporte", "Reporte"],
  ["horarios", "Horarios"],
  ["justificaciones", "Justificaciones"],
  ["feriados", "Feriados"],
  ["cargar", "Cargar Excel"],
  ["ayuda", "Cómo funciona"],
] as const;

type Tab = (typeof TABS)[number][0];

export default function AsistenciaClient() {
  const [tab, setTab] = useState<Tab>("reporte");
  // Cambia al cargar marcaciones: fuerza a que el Reporte se vuelva a montar y
  // muestre lo recién subido en vez de lo que ya tenía en pantalla.
  const [version, setVersion] = useState(0);

  return (
    <>
      <AppHeader module="asistencia" />
      <div className="mx-auto max-w-6xl px-4 py-6">
        <h1 className="text-xl font-semibold text-gray-900">Asistencia</h1>

        <div className="mt-4 flex gap-1 overflow-x-auto border-b border-gray-200">
          {TABS.map(([k, label]) => (
            <button key={k} type="button" onClick={() => setTab(k)}
              className={`min-h-[44px] whitespace-nowrap px-3 text-sm transition ${
                tab === k ? "border-b-2 border-black font-medium text-gray-900" : "text-gray-500 hover:text-gray-900"
              }`}>
              {label}
            </button>
          ))}
        </div>

        <div className="mt-5">
          {tab === "reporte" && <ReporteTab key={version} />}
          {tab === "horarios" && <HorariosTab />}
          {tab === "justificaciones" && <JustificacionesTab />}
          {tab === "feriados" && <FeriadosTab />}
          {tab === "cargar" && <CargarTab onCargado={() => setVersion((v) => v + 1)} />}
          {tab === "ayuda" && <ComoFuncionaTab />}
        </div>
      </div>
    </>
  );
}
