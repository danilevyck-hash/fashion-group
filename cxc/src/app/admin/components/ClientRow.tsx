import type { ConsolidatedClient } from "@/lib/types";

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function riskColor(current: number, watch: number, overdue: number) {
  if (overdue > 0) return "border-l-red-500";
  if (watch > 0) return "border-l-amber-400";
  return "border-l-emerald-500";
}

interface Props {
  client: ConsolidatedClient;
  isExpanded: boolean;
  onToggle: () => void;
  userRole: string;
  contactLog?: Record<string, { date: string; method: string }>;
}

export default function ClientRow({ client, isExpanded, onToggle, userRole, contactLog }: Props) {
  const lastContact = contactLog?.[client.nombre_normalized];
  const daysSinceContact = lastContact ? Math.floor((Date.now() - new Date(lastContact.date).getTime()) / 86400000) : null;

  return (
    <div className={`border-l-4 ${riskColor(client.current, client.watch, client.overdue)}`}>
      <div
        className={`grid grid-cols-12 gap-1 sm:gap-2 px-3 sm:px-4 py-3 text-xs sm:text-sm cursor-pointer transition-colors border-b border-gray-100 ${isExpanded ? "bg-gray-50" : "hover:bg-gray-50/70"}`}
        onClick={onToggle}
      >
        {userRole === "david" ? (<>
          <div className="col-span-4 sm:col-span-3 font-medium truncate flex items-center gap-1.5">
            <svg width="10" height="10" viewBox="0 0 10 10" className={`flex-shrink-0 text-gray-400 transition-transform ${isExpanded ? "rotate-90" : ""}`} fill="currentColor">
              <path d="M3 1l5 4-5 4V1z"/>
            </svg>
            <span className="truncate">{client.nombre_normalized}</span>
            {daysSinceContact !== null && (
              <span className={`hidden sm:inline-flex text-[9px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${daysSinceContact <= 7 ? "bg-emerald-100 text-emerald-700" : daysSinceContact <= 30 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>
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
          <div className="col-span-5 sm:col-span-4 font-medium truncate flex items-center gap-1.5">
            <svg width="10" height="10" viewBox="0 0 10 10" className={`flex-shrink-0 text-gray-400 transition-transform ${isExpanded ? "rotate-90" : ""}`} fill="currentColor">
              <path d="M3 1l5 4-5 4V1z"/>
            </svg>
            <span className="truncate">{client.nombre_normalized}</span>
            {daysSinceContact !== null && (
              <span className={`hidden sm:inline-flex text-[9px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${daysSinceContact <= 7 ? "bg-emerald-100 text-emerald-700" : daysSinceContact <= 30 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>
                {daysSinceContact}d
              </span>
            )}
          </div>
          <div className="hidden sm:block col-span-2 text-right tabular-nums text-emerald-700">{fmt(client.current)}</div>
          <div className="hidden sm:block col-span-2 text-right tabular-nums text-amber-600">{fmt(client.watch)}</div>
          <div className="col-span-3 sm:col-span-2 text-right tabular-nums text-red-600">{fmt(client.overdue)}</div>
          <div className="col-span-4 sm:col-span-2 text-right tabular-nums font-semibold">{fmt(client.total)}</div>
        </>)}
      </div>
    </div>
  );
}
