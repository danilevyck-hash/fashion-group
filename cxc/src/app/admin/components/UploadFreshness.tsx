import type { CxcUpload } from "@/lib/types";
import type { Company } from "@/lib/companies";

function uploadAge(dateStr: string): "fresh" | "warning" | "stale" {
  const days = (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24);
  if (days > 15) return "stale";
  if (days > 7) return "warning";
  return "fresh";
}

const ageBg: Record<string, string> = { fresh: "", warning: "bg-yellow-50", stale: "bg-red-50" };
const ageDot: Record<string, string> = { fresh: "bg-green-500", warning: "bg-yellow-500", stale: "bg-red-500" };

interface Props {
  roleCompanies: Company[];
  uploads: Record<string, CxcUpload>;
}

export default function UploadFreshness({ roleCompanies, uploads }: Props) {
  // Calculate global staleness for prominent banner
  const uploadDates = Object.values(uploads).map(u => new Date(u.uploaded_at).getTime());
  const mostRecentMs = uploadDates.length > 0 ? Math.max(...uploadDates) : 0;
  const daysSinceUpload = mostRecentMs ? Math.floor((Date.now() - mostRecentMs) / (1000 * 60 * 60 * 24)) : null;
  const isStale = daysSinceUpload !== null && daysSinceUpload >= 7;

  return (
    <>
      {/* Stale data banner */}
      {isStale && (
        <div className="mb-4 flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-800">Los datos tienen {daysSinceUpload} dias</p>
            <p className="text-xs text-amber-600 mt-0.5">Actualiza subiendo un nuevo archivo para tener cifras al dia.</p>
          </div>
          <button
            onClick={() => (window.location.href = "/upload?tab=cxc")}
            className="flex-shrink-0 text-xs bg-amber-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-amber-700 active:scale-[0.97] transition-all flex items-center gap-1.5 min-h-[36px]"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Actualizar datos
          </button>
        </div>
      )}

      <div className={`grid grid-cols-2 ${roleCompanies.length > 5 ? "sm:grid-cols-4 lg:grid-cols-7" : "sm:grid-cols-5"} gap-2 mb-6`}>
        {roleCompanies.map((co) => {
          const up = uploads[co.key];
          const age = up ? uploadAge(up.uploaded_at) : "stale";
          return (
            <div key={co.key} className={`rounded px-3 py-2 text-xs border border-gray-200 ${up ? ageBg[age] : "bg-gray-50"}`}>
              <div className="font-medium truncate">{co.name}</div>
              {up ? (
                <div className="flex items-center gap-1 mt-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${ageDot[age]}`} />
                  <span className="text-gray-500">{new Date(up.uploaded_at).toLocaleDateString("es-PA", { day: "numeric", month: "short", year: "numeric" }).replace(".", "")}</span>
                </div>
              ) : (
                <div className="text-gray-400 mt-1">Sin datos</div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
