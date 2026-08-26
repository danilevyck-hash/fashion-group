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

// ── 🩸 POR QUÉ SON 5 PESTAÑAS Y NO 7 (6-ago-2026 · +Vacaciones el 25-ago) ────
//
// Eran Reporte · Planilla · Configuración · Horarios · Justificaciones ·
// Feriados · Cómo funciona. Siete pestañas ya no son una herramienta: son un
// menú, y todas pesan lo mismo aunque no valgan lo mismo.
//
// UNA PESTAÑA SE GANA EL LUGAR POR LO QUE HACÉS AHÍ, NO POR LA TABLA QUE GUARDA.
//   · Feriados se toca UNA VEZ AL AÑO (los 22 de Panamá ya están cargados).
//   · Horarios se toca cuando entra alguien.
// Las dos pasaron a ser SECCIONES de Configuración, que es exactamente lo que
// son: números que se dejan puestos para que el cálculo signifique algo. No se
// borró nada — cambió dónde vive.
//
// "Cómo funciona" es AYUDA, no un lugar de trabajo, y ocupaba el mismo peso
// visual que la Planilla. Ahora es el botón «?» del final de la barra.
//
// EL ORDEN también cambió: Planilla PRIMERA. La contable entra dos veces al mes
// y entra a eso; el Reporte es el detalle que la sostiene, y va detrás.
//
// ⚠️ La quinta, VACACIONES, no contradice esto: se ganó el lugar por lo que se
// hace ahí y no por la tabla que guarda. No es «una sección más de
// Justificaciones» — es lo contrario, existe justamente porque una vacación NO
// es una justificación (no se paga por asistencia y lleva su propia cuenta de
// días), y meterlas en la misma lista es lo que hacía imposible distinguir
// quién estuvo enfermo de quién estuvo de vacaciones.
//
// El candado de todo esto es `src/__tests__/lib/asistencia-pestanas.test.ts`.

import { Suspense, useState } from "react";
import AppHeader from "@/components/AppHeader";
import { useUrlState } from "@/lib/hooks/useUrlState";
import ReporteTab from "./ReporteTab";
import PlanillaTab from "./PlanillaTab";
import ConfiguracionTab from "./ConfiguracionTab";
import JustificacionesTab from "./JustificacionesTab";
import VacacionesTab from "./VacacionesTab";
import ComoFuncionaTab from "./ComoFuncionaTab";

const TABS = [
  // A esto viene la contable: el cuadro quincenal, ya cargado en la quincena en
  // curso. Es la primera y es la que abre por defecto.
  ["planilla", "Planilla"],
  // El detalle que SOSTIENE la planilla: de dónde salió cada minuto.
  ["reporte", "Reporte"],
  // Lo del día a día: lo único que se toca seguido.
  ["justificaciones", "Justificaciones"],
  // 🔴 APARTE de Justificaciones, y es todo el punto (25-ago-2026): unas
  // vacaciones no explican una falta —no se pagan por asistencia y llevan su
  // propia cuenta de días—, así que no pueden vivir en la misma lista. Va al
  // lado porque las dos son «lo que pasa con la gente esta quincena».
  ["vacaciones", "Vacaciones"],
  // Personas · Horarios · Feriados · Reglas. Se llena una vez y se corrige poco.
  ["configuracion", "Configuración"],
] as const;

type Tab = (typeof TABS)[number][0];

export default function AsistenciaClient() {
  // useUrlState usa useSearchParams → necesita un límite de Suspense propio
  // (mismo patrón que marketing/page.tsx y productos/cargar/page.tsx).
  return (
    <Suspense>
      <AsistenciaInner />
    </Suspense>
  );
}

function AsistenciaInner() {
  // La pestaña vive en la URL (?tab=reporte) → refresh y compartir-link
  // conservan la vista. Tab del MISMO nivel → replace (default): el Atrás del
  // navegador no cicla por pestañas (convención del sistema). Un valor
  // desconocido en la URL cae en la pestaña por defecto, nunca en blanco.
  const [tabRaw, setTab] = useUrlState<Tab>("tab", "planilla");
  const tab: Tab = TABS.some(([k]) => k === tabRaw) ? tabRaw : "planilla";
  const [ayuda, setAyuda] = useState(false);

  return (
    <>
      {/* El módulo iba en minúscula ("asistencia") y eso se veía: la barra
          sticky y el breadcrumb son ahora lo ÚNICO que nombra la pantalla, así
          que dicen el label real del módulo (`lib/modules.ts`: "Asistencia"). */}
      <AppHeader module="Asistencia" />
      <div className="mx-auto max-w-6xl px-4 py-6">
        {/* Sin título grande: "Asistencia" ya lo dicen la barra sticky
            (celular) y el breadcrumb (escritorio). Queda sr-only para no dejar
            la página sin encabezado; el `mt-4` de las pestañas se fue con él
            para que no quede un hueco suelto bajo el `py-6`. */}
        <h1 className="sr-only">Asistencia</h1>

        <div className="flex items-end gap-2 border-b border-gray-200">
          {/* El arrastre lateral vive SOLO en las pestañas: si el «?» quedara
              adentro, en el iPhone habría que arrastrar para encontrar la ayuda. */}
          <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
            {TABS.map(([k, label]) => (
              <button key={k} type="button" onClick={() => { setTab(k); setAyuda(false); }}
                className={`min-h-[44px] whitespace-nowrap px-3 text-sm transition ${
                  tab === k && !ayuda
                    ? "border-b-2 border-black font-medium text-gray-900"
                    : "text-gray-500 hover:text-gray-900"
                }`}>
                {label}
              </button>
            ))}
          </div>

          {/* Ayuda, no pestaña: discreto, redondo y con el nombre completo para
              quien navegue con lector de pantalla o se quede encima con el mouse. */}
          <button
            type="button"
            onClick={() => setAyuda((v) => !v)}
            aria-pressed={ayuda}
            aria-label="Cómo funciona"
            title="Cómo funciona"
            className={`mb-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-base transition active:scale-[0.97] ${
              ayuda
                ? "border-black bg-black text-white"
                : "border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-900"
            }`}
          >
            ?
          </button>
        </div>

        <div className="mt-5">
          {ayuda ? (
            <div className="space-y-4">
              {/* El "Cómo funciona" DEL MEDIO se fue: el botón "?" que abre
                  esto ya lo dice, y el contenido arranca con "Cómo funciona la
                  marcación". Era la misma frase tres veces en la pantalla. */}
              <div className="flex items-center justify-end gap-3">
                <button type="button" onClick={() => setAyuda(false)}
                  className="min-h-[44px] rounded-md border border-gray-300 px-3 text-sm text-gray-700 transition hover:border-black hover:text-black active:scale-[0.97]">
                  Cerrar
                </button>
              </div>
              <ComoFuncionaTab />
            </div>
          ) : (
            <>
              {tab === "planilla" && <PlanillaTab />}
              {tab === "reporte" && <ReporteTab />}
              {tab === "justificaciones" && <JustificacionesTab />}
              {tab === "vacaciones" && <VacacionesTab />}
              {tab === "configuracion" && <ConfiguracionTab />}
            </>
          )}
        </div>
      </div>
    </>
  );
}
