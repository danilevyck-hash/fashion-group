import type { ConsolidatedClient } from "@/lib/types";

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

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
}

export default function ClientRow({ client, isExpanded, onToggle, userRole, contactLog, selectionMode, isSelected, onQuickWA, onQuickEmail }: Props) {
  const lastContact = contactLog?.[client.nombre_normalized];
  const daysSinceContact = lastContact ? Math.floor((Date.now() - new Date(lastContact.date).getTime()) / 86400000) : null;
  const risk = riskInfo(client.current, client.watch, client.overdue);

  return (
    <div className={`border-l-4 ${risk.border} group`} data-tooltip={risk.tooltip}>
      <div
        className={`grid grid-cols-12 gap-1 sm:gap-2 px-3 sm:px-4 py-3 text-xs sm:text-sm cursor-pointer transition-colors border-b border-gray-100 ${isExpanded ? "bg-gray-50" : "hover:bg-gray-50/70"}`}
        onClick={onToggle}
      >
        {userRole === "david" ? (<>
          {selectionMode && (
            <div className="col-span-1 flex items-center">
              <input type="checkbox" checked={!!isSelected} readOnly className="accent-emerald-600 w-3.5 h-3.5" />
            </div>
          )}
          <div className={`${selectionMode ? "col-span-3 sm:col-span-2" : "col-span-4 sm:col-span-3"} font-medium truncate flex items-center gap-1.5`}>
            {!selectionMode && (
              <svg width="10" height="10" viewBox="0 0 10 10" className={`flex-shrink-0 text-gray-400 transition-transform ${isExpanded ? "rotate-90" : ""}`} fill="currentColor">
                <path d="M3 1l5 4-5 4V1z"/>
              </svg>
            )}
            <span className="truncate">{client.nombre_normalized}</span>
            {daysSinceContact !== null && (
              <span className={`hidden sm:inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${daysSinceContact <= 7 ? "bg-emerald-100 text-emerald-700" : daysSinceContact <= 30 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`} title={`Contactado hace ${daysSinceContact} dias via ${lastContact?.method}`}>
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                {daysSinceContact}d
              </span>
            )}
          </div>
          <div className="hidden sm:block col-span-1 text-right tabular-nums text-emerald-700">{fmt(client.d0_30)}</div>
          <div className="hidden sm:block col-span-1 text-right tabular-nums text-emerald-700">{fmt(client.d31_60)}</div>
          <div className="hidden sm:block col-span-1 text-right tabular-nums text-emerald-700">{fmt(client.d61_90)}</div>
          <div className="hidden sm:block col-span-2 text-right tabular-nums text-amber-600">{fmt(client.d91_120)}</div>
          <div className="col-span-4 sm:col-span-2 text-right tabular-nums text-red-600">{fmt(client.d121_plus)}</div>
          <div className="col-span-4 sm:col-span-2 text-right tabular-nums font-semibold">{fmt(client.total)}</div>
        </>) : (<>
          {selectionMode && (
            <div className="col-span-1 flex items-center">
              <input type="checkbox" checked={!!isSelected} readOnly className="accent-emerald-600 w-3.5 h-3.5" />
            </div>
          )}
          <div className={`${selectionMode ? "col-span-4 sm:col-span-3" : "col-span-5 sm:col-span-4"} font-medium truncate flex items-center gap-1.5`}>
            {!selectionMode && (
              <svg width="10" height="10" viewBox="0 0 10 10" className={`flex-shrink-0 text-gray-400 transition-transform ${isExpanded ? "rotate-90" : ""}`} fill="currentColor">
                <path d="M3 1l5 4-5 4V1z"/>
              </svg>
            )}
            <span className="truncate">{client.nombre_normalized}</span>
            {daysSinceContact !== null && (
              <span className={`hidden sm:inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${daysSinceContact <= 7 ? "bg-emerald-100 text-emerald-700" : daysSinceContact <= 30 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`} title={`Contactado hace ${daysSinceContact} dias via ${lastContact?.method}`}>
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                {daysSinceContact}d
              </span>
            )}
          </div>
          <div className="hidden sm:block col-span-2 text-right tabular-nums text-emerald-700">{fmt(client.current)}</div>
          <div className="hidden sm:block col-span-2 text-right tabular-nums text-amber-600">{fmt(client.watch)}</div>
          <div className="col-span-3 sm:col-span-2 text-right tabular-nums text-red-600 relative">
            {fmt(client.overdue)}
            {/* Quick actions on hover — only when not in selection mode */}
            {!selectionMode && (
              <span className="hidden group-hover:inline-flex absolute right-0 -top-0.5 items-center gap-1 ml-2" onClick={(e) => e.stopPropagation()}>
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
          <div className="col-span-4 sm:col-span-2 text-right tabular-nums font-semibold">{fmt(client.total)}</div>
        </>)}
      </div>
    </div>
  );
}
