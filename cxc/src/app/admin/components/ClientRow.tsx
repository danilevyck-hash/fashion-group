"use client";

import { useEffect, useState } from "react";
import type { ConsolidatedClient } from "@/lib/types";
import { fmt } from "@/lib/format";

function riskInfo(total: number, current: number, watch: number, overdue: number): { border: string; tooltip: string } {
  if (total < 0) return { border: "border-l-blue-400", tooltip: "Credito a favor: saldo negativo (nota de credito o sobrepago)" };
  if (overdue > 0) return { border: "border-l-red-500", tooltip: "Vencido: tiene saldo mayor a 121 dias" };
  if (watch > 0) return { border: "border-l-amber-400", tooltip: "Vigilancia: saldo entre 91-120 dias" };
  return { border: "border-l-emerald-500", tooltip: "Corriente: saldo menor a 91 dias" };
}

interface Props {
  client: ConsolidatedClient;
  isExpanded: boolean;
  onToggle: () => void;
  userRole: string;
  contactLog?: Record<string, { date: string; method: string }>;
  onQuickMarkContacted?: (clientName: string, method: string) => void;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  onRowContextMenu?: (e: React.MouseEvent) => void;
}

type ContactMethod = "email" | "llamada" | "visita";

const CONTACT_METHODS: { key: ContactMethod; label: string; icon: JSX.Element }[] = [
  { key: "email", label: "Email", icon: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
  )},
  { key: "llamada", label: "Llamada", icon: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
  )},
  { key: "visita", label: "Visita", icon: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-500"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
  )},
];

interface ContactBadgeProps {
  clientName: string;
  daysSinceContact: number | null;
  lastMethod: string | undefined;
  onMark: (clientName: string, method: string) => void;
  placement?: "below-left" | "below-right";
}

function ContactBadge({ clientName, daysSinceContact, lastMethod, onMark, placement = "below-left" }: ContactBadgeProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Badge visual state (matches prior <span> styles)
  let label: string, cls: string;
  if (daysSinceContact === null) {
    label = "Sin contacto";
    cls = "bg-red-100 text-red-600";
  } else if (daysSinceContact > 30) {
    label = "30d+";
    cls = "bg-orange-100 text-orange-700";
  } else if (daysSinceContact <= 7) {
    label = `${daysSinceContact}d`;
    cls = "bg-emerald-100 text-emerald-700";
  } else {
    label = `${daysSinceContact}d`;
    cls = "bg-amber-100 text-amber-700";
  }

  const titleAttr = daysSinceContact !== null
    ? `Contactado hace ${daysSinceContact} dias via ${lastMethod || "-"} · Click para marcar contacto`
    : "Click para marcar contacto";

  const popoverPos = placement === "below-right" ? "right-0" : "left-0";

  return (
    <div className="relative inline-flex flex-shrink-0">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${cls} hover:opacity-80 transition cursor-pointer`}
        title={titleAttr}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {label}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setOpen(false); }} />
          <div
            className={`absolute ${popoverPos} top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 min-w-[160px] py-1`}
            onClick={(e) => e.stopPropagation()}
            role="menu"
          >
            <div className="px-3 py-1 text-[10px] text-gray-400 uppercase tracking-wider">Marcar contactado vía</div>
            {CONTACT_METHODS.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={(e) => { e.stopPropagation(); setOpen(false); onMark(clientName, m.key); }}
                className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                role="menuitem"
              >
                {m.icon}
                {m.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function ClientRow({ client, isExpanded, onToggle, userRole, contactLog, onQuickMarkContacted, isFavorite, onToggleFavorite, onRowContextMenu }: Props) {
  const lastContact = contactLog?.[client.nombre_normalized];
  const daysSinceContact = lastContact ? Math.floor((Date.now() - new Date(lastContact.date).getTime()) / 86400000) : null;
  const risk = riskInfo(client.total, client.current, client.watch, client.overdue);

  return (
    <>
      <div className={`border-l-4 ${risk.border} group`} data-tooltip={risk.tooltip}>
        {/* Mobile card layout — name + total + status badge, age buckets on expand */}
        <div
          className={`sm:hidden px-3 py-3 cursor-pointer transition-colors border-b border-gray-200 ${isExpanded ? "bg-gray-50" : "hover:bg-gray-50/70"}`}
          onClick={onToggle}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              {onToggleFavorite && (
                <button onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }} className="flex-shrink-0 text-sm leading-none">
                  {isFavorite ? <span className="text-amber-400">★</span> : <span className="text-gray-300">☆</span>}
                </button>
              )}
              <span className="text-sm font-medium truncate">{client.nombre_normalized}</span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
              {/* Status badge */}
              {client.total < 0 ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">Credito</span>
              ) : client.overdue > 0 ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">Vencido</span>
              ) : client.watch > 0 ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">Vigilancia</span>
              ) : (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">Corriente</span>
              )}
              <span className="text-sm font-semibold tabular-nums">${fmt(client.total)}</span>
              {/* Expand chevron */}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>
          </div>
          {/* Contact badge below name on mobile */}
          {onQuickMarkContacted && (
            <div className="mt-1 ml-6 flex items-center gap-1.5 flex-wrap" onClick={(e) => e.stopPropagation()}>
              <ContactBadge
                clientName={client.nombre_normalized}
                daysSinceContact={daysSinceContact}
                lastMethod={lastContact?.method}
                onMark={onQuickMarkContacted}
              />
            </div>
          )}
          {/* Age buckets — revealed on expand (mobile only) */}
          {isExpanded && (
            <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
              <div className="bg-emerald-50 rounded-md px-2 py-1.5 text-center">
                <div className="text-[10px] text-emerald-600 font-medium">0-90d</div>
                <div className="tabular-nums text-emerald-800 font-semibold">{client.current === 0 ? <span className="text-gray-300">—</span> : `$${fmt(client.current)}`}</div>
              </div>
              <div className="bg-amber-50 rounded-md px-2 py-1.5 text-center">
                <div className="text-[10px] text-amber-600 font-medium">91-120d</div>
                <div className="tabular-nums text-amber-800 font-semibold">{client.watch === 0 ? <span className="text-gray-300">—</span> : `$${fmt(client.watch)}`}</div>
              </div>
              <div className="bg-red-50 rounded-md px-2 py-1.5 text-center">
                <div className="text-[10px] text-red-600 font-medium">121d+</div>
                <div className="tabular-nums text-red-800 font-semibold">{client.overdue === 0 ? <span className="text-gray-300">—</span> : `$${fmt(client.overdue)}`}</div>
              </div>
            </div>
          )}
        </div>

        {/* Desktop grid layout */}
        <div
          className={`hidden sm:grid grid-cols-12 gap-1 sm:gap-2 px-3 sm:px-4 py-3 text-xs sm:text-sm cursor-pointer transition-colors border-b border-gray-200 ${isExpanded ? "bg-gray-50" : "hover:bg-gray-50/70"}`}
          onClick={onToggle}
          onContextMenu={onRowContextMenu}
        >
          <>
            <div className="col-span-4 font-medium truncate flex items-center gap-1.5">
              {onToggleFavorite && (
                <button onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }} className="flex-shrink-0 text-sm leading-none hover:scale-110 transition-transform">
                  {isFavorite ? <span className="text-amber-400">★</span> : <span className="text-gray-300 group-hover:text-gray-400">☆</span>}
                </button>
              )}
              <svg width="10" height="10" viewBox="0 0 10 10" className={`flex-shrink-0 text-gray-400 transition-transform ${isExpanded ? "rotate-90" : ""}`} fill="currentColor">
                <path d="M3 1l5 4-5 4V1z"/>
              </svg>
              <span className="truncate">{client.nombre_normalized}</span>
              {onQuickMarkContacted && (
                <ContactBadge
                  clientName={client.nombre_normalized}
                  daysSinceContact={daysSinceContact}
                  lastMethod={lastContact?.method}
                  onMark={onQuickMarkContacted}
                />
              )}
            </div>
            <div className="col-span-2 text-right tabular-nums text-emerald-700">{client.current === 0 ? <span className="text-gray-300">—</span> : fmt(client.current)}</div>
            <div className="col-span-2 text-right tabular-nums text-amber-600">{client.watch === 0 ? <span className="text-gray-300">—</span> : fmt(client.watch)}</div>
            <div className="col-span-2 text-right tabular-nums text-red-600">
              {client.overdue === 0 ? <span className="text-gray-300">—</span> : fmt(client.overdue)}
            </div>
            <div className="col-span-2 text-right tabular-nums font-semibold relative">
              {fmt(client.total)}
            </div>
          </>
        </div>
      </div>

    </>
  );
}
