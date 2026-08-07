"use client";

// Módulo de Asistencia. Toda la regla de negocio vive en
// `lib/asistencia/reporte.ts`, que es el MISMO motor que arma el Excel y el
// PDF — así la pantalla y los archivos no pueden contradecirse.
//
// ── 🩸 POR QUÉ YA NO HAY PESTAÑA "CARGAR EXCEL" (6-ago-2026) ─────────────────
//
// El reloj es la ÚNICA vía de entrada. La pantalla de Excel no era un extra
// inofensivo: mandaba `dispositivo = "RELOJ_FG"` y armaba el `evento_id` con un
// hash del contenido de la fila, mientras el agente manda
// `dispositivo = "reloj cboston"` con `evento_id = serialNo` del aparato. Son
// dos llaves distintas para el MISMO punch, así que el índice único
// `(dispositivo, evento_id)` —el anti-duplicado— no los reconocía como iguales.
//
// Ya pasó: las 134 marcaciones subidas por Excel quedaron TODAS duplicadas
// contra las del reloj y hubo que borrarlas a mano. Con las horas contadas dos
// veces, el almuerzo de alguien salía medido en 4 horas.
//
// El candado que lo impide de verdad no es este borrado, es
// `asistencia-una-sola-entrada.test.ts`. Si alguien reintroduce una segunda vía
// con otro `dispositivo`, el build se pone en rojo.

import { useState } from "react";
import AppHeader from "@/components/AppHeader";
import ReporteTab from "./ReporteTab";
import ConfiguracionTab from "./ConfiguracionTab";
import HorariosTab from "./HorariosTab";
import JustificacionesTab from "./JustificacionesTab";
import FeriadosTab from "./FeriadosTab";
import ComoFuncionaTab from "./ComoFuncionaTab";

const TABS = [
  ["reporte", "Reporte"],
  // Configuración va segunda: es lo primero que hay que llenar para que el
  // reporte y la planilla signifiquen algo.
  ["configuracion", "Configuración"],
  ["horarios", "Horarios"],
  ["justificaciones", "Justificaciones"],
  ["feriados", "Feriados"],
  ["ayuda", "Cómo funciona"],
] as const;

type Tab = (typeof TABS)[number][0];

export default function AsistenciaClient() {
  const [tab, setTab] = useState<Tab>("reporte");

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
          {tab === "reporte" && <ReporteTab />}
          {tab === "configuracion" && <ConfiguracionTab />}
          {tab === "horarios" && <HorariosTab />}
          {tab === "justificaciones" && <JustificacionesTab />}
          {tab === "feriados" && <FeriadosTab />}
          {tab === "ayuda" && <ComoFuncionaTab />}
        </div>
      </div>
    </>
  );
}
