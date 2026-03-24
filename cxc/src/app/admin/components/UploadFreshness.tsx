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
  return (
    <div className={`grid grid-cols-2 ${roleCompanies.length > 5 ? "sm:grid-cols-4 lg:grid-cols-7" : "sm:grid-cols-5"} gap-2 mb-6`}>
      {roleCompanies.map((co) => {
        const up = uploads[co.key];
        const age = up ? uploadAge(up.uploaded_at) : "stale";
        return (
          <div key={co.key} className={`rounded px-3 py-2 text-xs border border-gray-100 ${up ? ageBg[age] : "bg-gray-50"}`}>
            <div className="font-medium truncate">{co.name}</div>
            {up ? (
              <div className="flex items-center gap-1 mt-1">
                <span className={`w-1.5 h-1.5 rounded-full ${ageDot[age]}`} />
                <span className="text-gray-500">{new Date(up.uploaded_at).toLocaleDateString("es-PA")}</span>
              </div>
            ) : (
              <div className="text-gray-400 mt-1">Sin datos</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
