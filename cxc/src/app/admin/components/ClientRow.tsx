import type { ConsolidatedClient } from "@/lib/types";

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function riskColor(current: number, watch: number, overdue: number) {
  if (overdue > 0) return "border-l-red-500";
  if (watch > 0) return "border-l-yellow-500";
  return "border-l-green-500";
}

interface Props {
  client: ConsolidatedClient;
  isExpanded: boolean;
  onToggle: () => void;
  userRole: string;
}

export default function ClientRow({ client, isExpanded, onToggle, userRole }: Props) {
  return (
    <div
      className={`border-l-4 ${riskColor(client.current, client.watch, client.overdue)}`}
    >
      <div
        className="grid grid-cols-12 gap-1 sm:gap-2 px-3 sm:px-4 py-3 text-xs sm:text-sm cursor-pointer hover:bg-gray-50 transition border-b border-gray-100"
        onClick={onToggle}
      >
        {userRole === "david" ? (<>
          <div className="col-span-4 sm:col-span-3 font-medium truncate">
            <span className="mr-1 sm:mr-2 text-gray-400 text-xs">{isExpanded ? "▼" : "▶"}</span>
            {client.nombre_normalized}
          </div>
          <div className="hidden sm:block col-span-1 text-right text-green-700">{fmt(client.d0_30)}</div>
          <div className="hidden sm:block col-span-1 text-right text-green-700">{fmt(client.d31_60)}</div>
          <div className="hidden sm:block col-span-1 text-right text-green-700">{fmt(client.d61_90)}</div>
          <div className="hidden sm:block col-span-2 text-right text-yellow-600">{fmt(client.d91_120)}</div>
          <div className="col-span-4 sm:col-span-2 text-right text-red-600">{fmt(client.d121_plus)}</div>
          <div className="col-span-4 sm:col-span-2 text-right font-semibold">{fmt(client.total)}</div>
        </>) : (<>
          <div className="col-span-5 sm:col-span-4 font-medium truncate">
            <span className="mr-1 sm:mr-2 text-gray-400 text-xs">{isExpanded ? "▼" : "▶"}</span>
            {client.nombre_normalized}
          </div>
          <div className="hidden sm:block col-span-2 text-right text-green-700">{fmt(client.current)}</div>
          <div className="hidden sm:block col-span-2 text-right text-yellow-600">{fmt(client.watch)}</div>
          <div className="col-span-3 sm:col-span-2 text-right text-red-600">{fmt(client.overdue)}</div>
          <div className="col-span-4 sm:col-span-2 text-right font-semibold">{fmt(client.total)}</div>
        </>)}
      </div>
    </div>
  );
}
