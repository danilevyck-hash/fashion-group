"use client";

import { useCallback } from "react";
import type { Company } from "@/lib/companies";
import type { ConsolidatedClient } from "@/lib/types";
import ClientRow from "./ClientRow";
import ContactPanel from "./ContactPanel";
import { AccordionContent, useContextMenu } from "@/components/ui";
import type { ContextMenuItem } from "@/components/ui";
import OverflowMenu, { type OverflowMenuItem } from "@/components/ui/OverflowMenu";
import { usePersistedState } from "@/lib/hooks/usePersistedState";
import { etiquetaOrden, type RiskFilter, type SortKey, type SortDir } from "@/lib/cxc-orden";

interface Props {
  filtered: ConsolidatedClient[];
  roleCompanies: Company[];
  roleClients: ConsolidatedClient[];
  companyFilter: string;
  setCompanyFilter: (v: string) => void;
  riskFilter: RiskFilter;
  search: string;
  sortKey: SortKey;
  sortDir: SortDir;
  toggleSort: (key: SortKey) => void;
  sortArrow: (key: SortKey) => string;
  userRole: string;
  onOpenEmail: (client: ConsolidatedClient) => void;
  onWhatsApp: (client: ConsolidatedClient) => void;
  onCopyMessage: (client: ConsolidatedClient) => void;
  onOpenEstado: (client: ConsolidatedClient) => void;
  favorites?: Set<string>;
  onToggleFavorite?: (name: string) => void;
}

export default function ClientTable({
  filtered,
  roleCompanies,
  roleClients,
  companyFilter,
  setCompanyFilter,
  riskFilter,
  search,
  sortKey,
  sortDir,
  toggleSort,
  sortArrow,
  userRole,
  onOpenEmail,
  onWhatsApp,
  onCopyMessage,
  onOpenEstado,
  favorites,
  onToggleFavorite,
}: Props) {
  const [expanded, setExpanded] = usePersistedState<string | null>("cxc", "expanded", null);
  const { show: showContextMenu } = useContextMenu();

  // Menú de CLICK DERECHO (solo escritorio) de una fila del CXC.
  //
  // 🔑 Dice lo MISMO que el menú "···", con las MISMAS palabras: es la misma
  // fila y no puede tener dos vocabularios ni dos juegos de opciones. Por eso
  // "Ver en directorio" también se fue de acá (14-ago-2026): el #550 la retiró
  // del "···" y ésta quedó viva, que es justo la incoherencia que se vino a
  // arreglar. Con ella se fueron su ícono y su `window.open` — no la usaba nadie
  // más (el `?search=` de `/clientes` sigue funcionando para un enlace pegado a
  // mano, pero ya no lo alimenta ninguna pantalla).
  //
  // 🩸 Y no se esconde cuando el cliente no tiene correo: el modal resuelve el
  // destinatario y deja escribirlo si falta (`EnviarEmailModal`), así que el
  // `hidden` era una herencia del viejo `mailto:`. Con una sola opción, ese
  // `hidden` dejaba el click derecho SIN menú alguno en esas filas mientras el
  // "···" de la misma fila sí ofrecía la acción.
  const buildClientContextMenu = useCallback((client: ConsolidatedClient): ContextMenuItem[] => [
    {
      label: "Enviar correo",
      shortcut: "E",
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
      onClick: () => onOpenEmail(client),
    },
  ], [onOpenEmail]);

  // Menú "···" visible en cada fila: las CUATRO cosas que se hacen para cobrar,
  // alcanzables en touch (el menú de click-derecho no existe en iPad).
  //
  // 🔑 Dice "Enviar correo", no "Enviar email" (14-ago-2026): la app se lee en
  // español simple y el resto del módulo ya dice correo (el modal, el botón que
  // manda, el aviso de "Correo enviado"). "Email" era la palabra que quedó.
  //
  // 🔴 Eran 7 y quedaron 4 (14-ago-2026). Se retiraron "Ya contacté · Llamada"
  // y "Ya contacté · Visita" —escribían en `cxc_contact_log` y el resultado no
  // se pintaba en ninguna pantalla; 141 filas, ninguna en los últimos 90 días—
  // y "Ver en directorio". Daniel, textual: *"sobre darle seguimiento no es algo
  // que quiero para ese módulo, llamo al cliente por fuera y ya"*. El
  // seguimiento de cobro NO va a existir acá: no se reemplaza por otra cosa.
  const buildRowMenuItems = useCallback((client: ConsolidatedClient): OverflowMenuItem[] => [
    { label: "Estado de cuenta", onClick: () => onOpenEstado(client) },
    { label: "WhatsApp", onClick: () => onWhatsApp(client) },
    { label: "Enviar correo", onClick: () => onOpenEmail(client) },
    { label: "Copiar mensaje", onClick: () => onCopyMessage(client) },
  ], [onOpenEstado, onWhatsApp, onOpenEmail, onCopyMessage]);

  // 🔴 ACÁ VIVÍA UN SEGUNDO JUEGO DE FILTROS QUE NUNCA SE DIBUJABA (24-ago-2026)
  //
  // 🩸 Un segundo buscador, un botón «Filtros», una ventana de filtros
  // (`BottomSheet`) y una tira de píldoras de tramo — todo detrás de
  // `!hideSearchAndRiskFilters`, y el ÚNICO que monta esta tabla
  // (`admin/page.tsx`) le pasaba `hideSearchAndRiskFilters` SIEMPRE. O sea:
  // código que no se dibujaba en ninguna pantalla, en ningún ancho, para ningún
  // rol. El riesgo real no es el peso: es que alguien arregle el buscador
  // EQUIVOCADO y jure que la pantalla no cambia.
  //
  // El buscador y las píldoras vivos son los del padre (el `<input>` de
  // `admin/page.tsx` y `KpiCards`, que además FILTRAN Y ORDENAN en una sola
  // acción vía `lib/cxc-orden`). Con el bloque muerto se fueron sus props
  // (`setSearch`, `setRiskFilter`, `hideSearchAndRiskFilters`) y `onSaveEdit`,
  // que ya no llamaba a nadie: la edición de contacto se mudó a la ficha
  // (`/clientes/[codigo]`).
  //
  // ⚠️ El filtro de EMPRESA sí se dibuja y se queda tal cual.

  // Saldo positivo (deuda) en la lista principal; saldo negativo (crédito a
  // favor) en su propia sección al pie, fuera de la lista de cobro.
  const positivos = filtered.filter((c) => c.total >= 0);
  const negativos = filtered.filter((c) => c.total < 0);

  const renderClientRow = (client: ConsolidatedClient) => {
    const isExpanded = expanded === client.nombre_normalized;
    return (
      <div key={client.nombre_normalized}>
        <ClientRow
          client={client}
          isExpanded={isExpanded}
          onToggle={() => setExpanded(isExpanded ? null : client.nombre_normalized)}
          userRole={userRole}
          isFavorite={favorites?.has(client.nombre_normalized)}
          onToggleFavorite={onToggleFavorite ? () => onToggleFavorite(client.nombre_normalized) : undefined}
          onRowContextMenu={(e) => showContextMenu(e, buildClientContextMenu(client))}
          actionsMenu={<OverflowMenu items={buildRowMenuItems(client)} ariaLabel={`Acciones de ${client.nombre_normalized}`} />}
        />
        <AccordionContent open={isExpanded}>
          <ContactPanel
            client={client}
            companyFilter={companyFilter}
            roleCompanies={roleCompanies}
            onOpenEstado={onOpenEstado}
            activo={isExpanded}
          />
        </AccordionContent>
      </div>
    );
  };

  return (
    <>
      {/* Filtro de empresa. La búsqueda y los tramos los pone la página padre. */}
      {roleCompanies.length > 1 && (
        <div className="flex items-center gap-3 mb-3">
          <select
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-gray-300 bg-white"
          >
            <option value="all">Todas mis empresas</option>
            {roleCompanies.map((co) => <option key={co.key} value={co.key}>{co.name}</option>)}
          </select>
        </div>
      )}

      {/* Result count + orden activo — el texto describe el orden REAL de la
          tabla (píldora o clic en el título de una columna: son el mismo estado). */}
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-gray-400">
          {(search || riskFilter !== "all" || companyFilter !== "all") ? `${filtered.length} de ${roleClients.length} clientes` : `${filtered.length} clientes`}
          {" · ordenados por "}{etiquetaOrden(sortKey)}{sortDir === "asc" ? " (de menor a mayor)" : ""}
        </div>
      </div>

      {/* Client table */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        {/* Sticky sortable header */}
        {/* Desktop header — hidden on mobile since mobile uses card layout */}
        <div className="hidden sm:grid grid-cols-12 gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500 uppercase tracking-wide select-none">
          <div className="col-span-4 cursor-pointer hover:text-gray-900 transition" onClick={() => toggleSort("name")}>
            Cliente{sortArrow("name")}
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
            {/* Una sola línea: "probá con otra búsqueda" no agrega nada a "Sin
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
