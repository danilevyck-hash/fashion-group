"use client";

import { useState } from "react";
import type { ConsolidatedClient } from "@/lib/types";
import { fmt } from "@/lib/format";
import ContactModal from "./ContactModal";

function riskInfo(current: number, watch: number, overdue: number): { border: string; tooltip: string } {
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
  selectionMode?: boolean;
  isSelected?: boolean;
  onQuickWA?: () => void;
  onQuickEmail?: () => void;
  onRegisterContact?: (data: { resultado_contacto: string; proximo_seguimiento: string; metodo: string }) => Promise<void>;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
}

export default function ClientRow({ client, isExpanded, onToggle, userRole, contactLog, selectionMode, isSelected, onQuickWA, onQuickEmail, onRegisterContact, isFavorite, onToggleFavorite }: Props) {
  const lastContact = contactLog?.[client.nombre_normalized];
  const daysSinceContact = lastContact ? Math.floor((Date.now() - new Date(lastContact.date).getTime()) / 86400000) : null;
  const risk = riskInfo(client.current, client.watch, client.overdue);
  const [modalOpen, setModalOpen] = useState(false);

  // Determine if follow-up is overdue
  const today = new Date().toISOString().slice(0, 10);
  const followUpOverdue = client.proximo_seguimiento && client.proximo_seguimiento < today;

  return (
    <>
      <div className={`border-l-4 ${risk.border} group`} data-tooltip={risk.tooltip}>
        {/* Mobile card layout */}
        <div
          className={`sm:hidden px-3 py-3 cursor-pointer transition-colors border-b border-gray-200 ${isExpanded ? "bg-gray-50" : "hover:bg-gray-50/70"}`}
          onClick={onToggle}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 min-w-0">
              {!selectionMode && onToggleFavorite && (
                <button onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }} className="flex-shrink-0 text-sm leading-none">
                  {isFavorite ? <span className="text-amber-400">★</span> : <span className="text-gray-300">☆</span>}
                </button>
              )}
              {selectionMode && (
                <input type="checkbox" checked={!!isSelected} readOnly className="accent-emerald-600 w-3.5 h-3.5 flex-shrink-0" />
              )}
              <span className="text-xs font-medium truncate">{client.nombre_normalized}</span>
            </div>
            <span className="text-sm font-semibold tabular-nums flex-shrink-0 ml-2">{fmt(client.total)}</span>
          </div>
        </div>

        {/* Desktop grid layout */}
        <div
          className={`hidden sm:grid grid-cols-12 gap-1 sm:gap-2 px-3 sm:px-4 py-3 text-xs sm:text-sm cursor-pointer transition-colors border-b border-gray-200 ${isExpanded ? "bg-gray-50" : "hover:bg-gray-50/70"}`}
          onClick={onToggle}
        >
          <>
            {selectionMode && (
              <div className="col-span-1 flex items-center">
                <input type="checkbox" checked={!!isSelected} readOnly className="accent-emerald-600 w-3.5 h-3.5" />
              </div>
            )}
            <div className={`${selectionMode ? "col-span-3" : "col-span-4"} font-medium truncate flex items-center gap-1.5`}>
              {!selectionMode && onToggleFavorite && (
                <button onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }} className="flex-shrink-0 text-sm leading-none hover:scale-110 transition-transform">
                  {isFavorite ? <span className="text-amber-400">★</span> : <span className="text-gray-300 group-hover:text-gray-400">☆</span>}
                </button>
              )}
              {!selectionMode && (
                <svg width="10" height="10" viewBox="0 0 10 10" className={`flex-shrink-0 text-gray-400 transition-transform ${isExpanded ? "rotate-90" : ""}`} fill="currentColor">
                  <path d="M3 1l5 4-5 4V1z"/>
                </svg>
              )}
              <span className="truncate">{client.nombre_normalized}</span>
              {/* Follow-up overdue badge */}
              {!selectionMode && followUpOverdue && (
                <span className="inline-flex text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 flex-shrink-0" title={`Seguimiento vencido: ${client.proximo_seguimiento}`}>
                  Seg.
                </span>
              )}
              {daysSinceContact !== null ? (
                daysSinceContact > 30 ? (
                  <span className="inline-flex text-[10px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 flex-shrink-0">30d+</span>
                ) : (
                  <span className={`inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${daysSinceContact <= 7 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`} title={`Contactado hace ${daysSinceContact} dias via ${lastContact?.method}`}>
                    {daysSinceContact}d
                  </span>
                )
              ) : (
                <span className="inline-flex text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 flex-shrink-0">Sin contacto</span>
              )}
            </div>
            <div className="col-span-2 text-right tabular-nums text-emerald-700">{fmt(client.current)}</div>
            <div className="col-span-2 text-right tabular-nums text-amber-600">{fmt(client.watch)}</div>
            <div className="col-span-2 text-right tabular-nums text-red-600 relative">
              {fmt(client.overdue)}
              {/* Quick actions on hover — only when not in selection mode */}
              {!selectionMode && (
                <span className="hidden group-hover:inline-flex absolute right-0 -top-0.5 items-center gap-1 ml-2" onClick={(e) => e.stopPropagation()}>
                  {onRegisterContact && (
                    <button
                      onClick={() => setModalOpen(true)}
                      className="text-purple-400 hover:text-purple-700 transition p-0.5"
                      title="Registrar contacto"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                    </button>
                  )}
                  {onQuickWA && (client.celular || client.telefono) && (
                    <button onClick={onQuickWA} className="text-emerald-500 hover:text-emerald-700 transition p-0.5" title="WhatsApp cobro">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    </button>
                  )}
                  {onQuickEmail && client.correo && (
                    <button onClick={onQuickEmail} className="text-gray-400 hover:text-gray-700 transition p-0.5" title="Email cobro">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                    </button>
                  )}
                </span>
              )}
            </div>
            <div className="col-span-2 text-right tabular-nums font-semibold">{fmt(client.total)}</div>
          </>
        </div>
      </div>

      {onRegisterContact && (
        <ContactModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          clientName={client.nombre_normalized}
          initialResultado={client.resultado_contacto || ""}
          initialProximoSeguimiento={client.proximo_seguimiento || ""}
          onSave={onRegisterContact}
        />
      )}
    </>
  );
}
