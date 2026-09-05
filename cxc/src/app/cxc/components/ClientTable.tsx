"use client";

import type { Company } from "@/lib/companies";
import type { ConsolidatedClient } from "@/lib/types";
import ClientRow from "./ClientRow";
import ContactPanel from "./ContactPanel";
import { AccordionContent } from "@/components/ui";
import { usePersistedState } from "@/lib/hooks/usePersistedState";
import type { SortKey } from "@/lib/cxc-orden";

interface Props {
  filtered: ConsolidatedClient[];
  roleCompanies: Company[];
  companyFilter: string;
  toggleSort: (key: SortKey) => void;
  sortArrow: (key: SortKey) => string;
  onCobrar: (client: ConsolidatedClient) => void;
  onOpenEstado: (client: ConsolidatedClient) => void;
  /** Códigos seleccionados para mandar a varios. */
  seleccion: Set<string>;
  onSeleccionar: (client: ConsolidatedClient) => void;
  onSeleccionarTodos: () => void;
  /** El aviso «no paga hace N d» de un cliente, o `null` si no toca mostrarlo. */
  avisoSinPagarDe: (client: ConsolidatedClient) => string | null;
  /** La marca «Le enviaste… hace N días» de un cliente, o `null`. */
  marcaEnvioDe: (client: ConsolidatedClient) => string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 🩸 ACÁ VIVÍAN DOS MENÚS Y UNA LÍNEA DE TEXTO QUE SE FUERON (5-sep-2026)
//
//  · El menú "···" de cada fila (`OverflowMenu`) con sus 4 opciones y el menú de
//    CLIC DERECHO (`buildClientContextMenu` + `useContextMenu`). Decían lo
//    mismo en dos lugares, ninguno se veía sin tocar algo, y el clic derecho no
//    existe en el iPad. Las cuatro acciones viven ahora dentro de la hoja
//    «Cobrar», que se abre con un botón VISIBLE en cada fila.
//
//  · «N de M clientes · ordenados por …». El conteo se dice en el chip de Total
//    de la tira de arriba, y el orden lo dice la flecha del encabezado de la
//    columna que está ordenando. Eran dos formas de decir lo mismo, y la de
//    texto tapaba la primera fila.
//
// ⚠️ El comportamiento de orden y filtro NO cambió: sigue saliendo entero de
// `lib/cxc-orden`, que no se tocó.
//
// 🔴 ACÁ VIVIÓ TAMBIÉN UN SEGUNDO JUEGO DE FILTROS QUE NUNCA SE DIBUJABA
// (24-ago-2026): un segundo buscador, un botón «Filtros» y una tira de píldoras
// detrás de `!hideSearchAndRiskFilters`, con el único padre pasándole SIEMPRE
// `hideSearchAndRiskFilters`. El riesgo no era el peso: era arreglar el
// buscador EQUIVOCADO y jurar que la pantalla no cambia.
// ─────────────────────────────────────────────────────────────────────────────
export default function ClientTable({
  filtered,
  roleCompanies,
  companyFilter,
  toggleSort,
  sortArrow,
  onCobrar,
  onOpenEstado,
  seleccion,
  onSeleccionar,
  onSeleccionarTodos,
  avisoSinPagarDe,
  marcaEnvioDe,
}: Props) {
  const [expanded, setExpanded] = usePersistedState<string | null>("cxc", "expanded", null);

  // Saldo positivo (deuda) en la lista principal; saldo negativo (crédito a
  // favor) en su propia sección al pie, fuera de la lista de cobro.
  const positivos = filtered.filter((c) => c.total >= 0);
  const negativos = filtered.filter((c) => c.total < 0);

  const codigoDe = (c: ConsolidatedClient) =>
    Object.values(c.companies).find((x) => x?.codigo)?.codigo ?? c.nombre_normalized;

  const todosSeleccionados = filtered.length > 0 && filtered.every((c) => seleccion.has(codigoDe(c)));

  const renderClientRow = (client: ConsolidatedClient) => {
    const isExpanded = expanded === client.nombre_normalized;
    return (
      <div key={client.nombre_normalized}>
        <ClientRow
          client={client}
          isExpanded={isExpanded}
          onToggle={() => setExpanded(isExpanded ? null : client.nombre_normalized)}
          onCobrar={onCobrar}
          seleccionado={seleccion.has(codigoDe(client))}
          onSeleccionar={onSeleccionar}
          avisoSinPagar={avisoSinPagarDe(client)}
        />
        <AccordionContent open={isExpanded}>
          <ContactPanel
            client={client}
            companyFilter={companyFilter}
            roleCompanies={roleCompanies}
            onOpenEstado={onOpenEstado}
            onCobrar={onCobrar}
            marcaEnvio={marcaEnvioDe(client)}
            abierto={isExpanded}
          />
        </AccordionContent>
      </div>
    );
  };

  return (
    <>
      {/* Client table */}
      <div className="border border-gray-200 rounded-b-lg sm:rounded-t-none rounded-t-lg overflow-hidden">
        {/* Desktop header — hidden on mobile since mobile uses card layout */}
        <div className="hidden sm:grid grid-cols-12 gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500 uppercase tracking-wide select-none">
          <div className="col-span-4 flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={todosSeleccionados}
              onChange={onSeleccionarTodos}
              aria-label="Seleccionar a todos los de la lista"
              className="shrink-0 h-4 w-4 rounded border-gray-300 accent-black cursor-pointer"
            />
            <span className="cursor-pointer hover:text-gray-900 transition" onClick={() => toggleSort("name")}>
              Cliente{sortArrow("name")}
            </span>
          </div>
          <div className="col-span-2 text-right cursor-pointer hover:text-gray-900 transition" data-tooltip="Por vencer (0-90d) · clic para ordenar la lista sin filtrarla" onClick={() => toggleSort("current")}>
            0-90d{sortArrow("current")}
          </div>
          <div className="col-span-2 text-right cursor-pointer hover:text-gray-900 transition" data-tooltip="Vencido reciente (91-120d) · clic para ordenar la lista sin filtrarla" onClick={() => toggleSort("watch")}>
            91-120d{sortArrow("watch")}
          </div>
          <div className="col-span-2 text-right cursor-pointer hover:text-gray-900 transition font-semibold text-gray-600" data-tooltip="Vencido crítico (+120d) · clic para ordenar la lista sin filtrarla" onClick={() => toggleSort("overdue")}>
            121d+{sortArrow("overdue")}
          </div>
          <div className="col-span-2 text-right cursor-pointer hover:text-gray-900 transition" data-tooltip="Saldo total · clic para ordenar la lista sin filtrarla" onClick={() => toggleSort("total")}>
            Total{sortArrow("total")}
          </div>
        </div>

        {filtered.length === 0 && (
          <div className="px-4 py-12 text-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" className="mx-auto mb-3">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            {/* Una sola línea: "prueba con otra búsqueda" no agrega nada a "Sin
                resultados" con el buscador lleno delante. */}
            <p className="text-sm text-gray-400">Sin resultados</p>
          </div>
        )}

        {positivos.map((client) => renderClientRow(client))}
      </div>

      {/* Saldo a favor (crédito): fuera de la lista de cobro principal */}
      {negativos.length > 0 && (
        <div className="mt-6">
          <h3 className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">
            Saldo a favor <span className="text-gray-400 font-normal normal-case">({negativos.length})</span>
          </h3>
          <div className="border border-blue-100 rounded-lg overflow-hidden">
            {negativos.map((client) => renderClientRow(client))}
          </div>
        </div>
      )}
    </>
  );
}
