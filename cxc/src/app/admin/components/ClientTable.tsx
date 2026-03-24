import { useState } from "react";
import type { Company } from "@/lib/companies";
import type { ConsolidatedClient } from "@/lib/types";

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function riskColor(current: number, watch: number, overdue: number) {
  if (overdue > 0) return "border-l-red-500";
  if (watch > 0) return "border-l-yellow-500";
  return "border-l-green-500";
}

type RiskFilter = "all" | "current" | "watch" | "overdue";
type SortKey = "name" | "current" | "watch" | "overdue" | "total";
type SortDir = "asc" | "desc";

interface Props {
  filtered: ConsolidatedClient[];
  roleCompanies: Company[];
  roleClients: ConsolidatedClient[];
  companyFilter: string;
  setCompanyFilter: (v: string) => void;
  riskFilter: RiskFilter;
  setRiskFilter: (v: RiskFilter) => void;
  search: string;
  setSearch: (v: string) => void;
  sortKey: SortKey;
  sortDir: SortDir;
  toggleSort: (key: SortKey) => void;
  sortArrow: (key: SortKey) => string;
  userRole: string;
  clients: ConsolidatedClient[];
  contactLog: Record<string, { date: string; method: string }>;
  onOpenWhatsApp: (client: ConsolidatedClient) => void;
  onOpenEmail: (client: ConsolidatedClient) => void;
  onMarkContacted: (clientName: string, method: string) => void;
  onSaveEdit: (nombre: string, data: { correo: string; telefono: string; celular: string; contacto: string }) => void;
}

export default function ClientTable({
  filtered,
  roleCompanies,
  roleClients,
  companyFilter,
  setCompanyFilter,
  riskFilter,
  setRiskFilter,
  search,
  setSearch,
  sortKey,
  sortDir,
  toggleSort,
  sortArrow,
  userRole,
  clients,
  contactLog,
  onOpenWhatsApp,
  onOpenEmail,
  onMarkContacted,
  onSaveEdit,
}: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editData, setEditData] = useState({ correo: "", telefono: "", celular: "", contacto: "" });
  const [copied, setCopied] = useState<string | null>(null);

  const countCurrent = roleClients.filter((c) => c.overdue === 0 && c.watch === 0).length;
  const countWatch = roleClients.filter((c) => c.watch > 0).length;
  const countOverdue = roleClients.filter((c) => c.overdue > 0).length;

  function startEdit(client: ConsolidatedClient) {
    setEditing(client.nombre_normalized);
    setEditData({
      correo: client.correo, telefono: client.telefono,
      celular: client.celular, contacto: client.contacto,
    });
  }

  function saveEdit() {
    if (!editing) return;
    onSaveEdit(editing, editData);
    setEditing(null);
  }

  function copyEmail(email: string) {
    navigator.clipboard.writeText(email);
    setCopied(email);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <>
      {/* Filters row */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setRiskFilter("all")}
            className={`px-3 py-1.5 rounded text-sm border transition ${riskFilter === "all" ? "bg-black text-white border-black" : "border-gray-300 text-gray-600 hover:border-black"}`}>
            Todos ({clients.length})
          </button>
          <button onClick={() => setRiskFilter("current")}
            className={`px-3 py-1.5 rounded text-sm border transition ${riskFilter === "current" ? "bg-green-600 text-white border-green-600" : "border-green-300 text-green-700 hover:bg-green-50"}`}>
            Corriente ({countCurrent})
          </button>
          <button onClick={() => setRiskFilter("watch")}
            className={`px-3 py-1.5 rounded text-sm border transition ${riskFilter === "watch" ? "bg-yellow-500 text-white border-yellow-500" : "border-yellow-300 text-yellow-700 hover:bg-yellow-50"}`}>
            Vigilancia ({countWatch})
          </button>
          <button onClick={() => setRiskFilter("overdue")}
            className={`px-3 py-1.5 rounded text-sm border transition ${riskFilter === "overdue" ? "bg-red-600 text-white border-red-600" : "border-red-300 text-red-700 hover:bg-red-50"}`}>
            Vencido ({countOverdue})
          </button>
        </div>
        {roleCompanies.length > 1 && (
          <select
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-black"
          >
            <option value="all">Todas las empresas</option>
            {roleCompanies.map((co) => (
              <option key={co.key} value={co.key}>{co.name}</option>
            ))}
          </select>
        )}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar cliente..."
          className="flex-1 border border-gray-300 rounded px-4 py-1.5 text-sm focus:outline-none focus:border-black"
        />
      </div>

      {/* Client table */}
      <div className="border border-gray-200 rounded overflow-hidden">
        {/* Sortable header */}
        {userRole === "david" ? (
        <div className="grid grid-cols-12 gap-1 sm:gap-2 px-3 sm:px-4 py-2 bg-gray-50 text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wide select-none">
          <div className="col-span-4 sm:col-span-3 cursor-pointer hover:text-black" onClick={() => toggleSort("name")}>
            Cliente{sortArrow("name")}
          </div>
          <div className="hidden sm:block col-span-1 text-right">0-30</div>
          <div className="hidden sm:block col-span-1 text-right">31-60</div>
          <div className="hidden sm:block col-span-1 text-right">61-90</div>
          <div className="hidden sm:block col-span-2 text-right cursor-pointer hover:text-black" onClick={() => toggleSort("watch")}>
            91-120{sortArrow("watch")}
          </div>
          <div className="col-span-4 sm:col-span-2 text-right cursor-pointer hover:text-black" onClick={() => toggleSort("overdue")}>
            121d+{sortArrow("overdue")}
          </div>
          <div className="col-span-4 sm:col-span-2 text-right cursor-pointer hover:text-black" onClick={() => toggleSort("total")}>
            Total{sortArrow("total")}
          </div>
        </div>
        ) : (
        <div className="grid grid-cols-12 gap-1 sm:gap-2 px-3 sm:px-4 py-2 bg-gray-50 text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wide select-none">
          <div className="col-span-5 sm:col-span-4 cursor-pointer hover:text-black" onClick={() => toggleSort("name")}>
            Cliente{sortArrow("name")}
          </div>
          <div className="hidden sm:block col-span-2 text-right cursor-pointer hover:text-black" onClick={() => toggleSort("current")}>
            0-90d{sortArrow("current")}
          </div>
          <div className="hidden sm:block col-span-2 text-right cursor-pointer hover:text-black" onClick={() => toggleSort("watch")}>
            91-120d{sortArrow("watch")}
          </div>
          <div className="col-span-3 sm:col-span-2 text-right cursor-pointer hover:text-black" onClick={() => toggleSort("overdue")}>
            121d+{sortArrow("overdue")}
          </div>
          <div className="col-span-4 sm:col-span-2 text-right cursor-pointer hover:text-black" onClick={() => toggleSort("total")}>
            Total{sortArrow("total")}
          </div>
        </div>
        )}

        {filtered.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-gray-400">Sin resultados</div>
        )}

        {filtered.map((client) => {
          const isExpanded = expanded === client.nombre_normalized;
          const isEditing = editing === client.nombre_normalized;

          return (
            <div key={client.nombre_normalized} className={`border-l-4 ${riskColor(client.current, client.watch, client.overdue)}`}>
              {/* Main row */}
              <div
                className="grid grid-cols-12 gap-1 sm:gap-2 px-3 sm:px-4 py-3 text-xs sm:text-sm cursor-pointer hover:bg-gray-50 transition border-b border-gray-100"
                onClick={() => setExpanded(isExpanded ? null : client.nombre_normalized)}
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

              {/* Expanded detail */}
              {isExpanded && (
                <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                  {/* Contact info + action buttons */}
                  <div className="mb-4">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-xs font-medium text-gray-500 uppercase">Contacto</span>
                      {!isEditing && (
                        <button onClick={(e) => { e.stopPropagation(); startEdit(client); }}
                          className="text-xs text-blue-600 hover:underline">Editar</button>
                      )}
                    </div>

                    {isEditing ? (
                      <div className="grid grid-cols-2 gap-2 max-w-lg" onClick={(e) => e.stopPropagation()}>
                        <input className="border rounded px-2 py-1 text-sm" placeholder="Correo"
                          value={editData.correo} onChange={(e) => setEditData({ ...editData, correo: e.target.value })} />
                        <input className="border rounded px-2 py-1 text-sm" placeholder="Telefono"
                          value={editData.telefono} onChange={(e) => setEditData({ ...editData, telefono: e.target.value })} />
                        <input className="border rounded px-2 py-1 text-sm" placeholder="WhatsApp / Celular"
                          value={editData.celular} onChange={(e) => setEditData({ ...editData, celular: e.target.value })} />
                        <input className="border rounded px-2 py-1 text-sm" placeholder="Nombre contacto"
                          value={editData.contacto} onChange={(e) => setEditData({ ...editData, contacto: e.target.value })} />
                        <div className="col-span-2 flex gap-2 mt-1">
                          <button onClick={saveEdit} className="text-xs bg-black text-white px-3 py-1 rounded hover:bg-gray-800">Guardar</button>
                          <button onClick={() => setEditing(null)} className="text-xs text-gray-500 hover:text-black">Cancelar</button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-gray-600 space-y-0.5">
                        {client.contacto && <div>Contacto: {client.contacto}</div>}
                        {client.correo && (
                          <div className="flex items-center gap-2">
                            Correo: {client.correo}
                            <button onClick={(e) => { e.stopPropagation(); copyEmail(client.correo); }}
                              className="text-xs text-blue-600 hover:underline">
                              {copied === client.correo ? "Copiado" : "Copiar"}
                            </button>
                          </div>
                        )}
                        {client.telefono && <div>Tel: {client.telefono}</div>}
                        {client.celular && <div>Cel: {client.celular}</div>}
                        {!client.contacto && !client.correo && !client.telefono && !client.celular && (
                          <div className="text-gray-400 italic">Sin informacion de contacto</div>
                        )}
                      </div>
                    )}

                    {/* Action buttons: WhatsApp + Email + Mark contacted */}
                    {!isEditing && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        <button
                          onClick={(e) => { e.stopPropagation(); onOpenWhatsApp(client); onMarkContacted(client.nombre_normalized, "whatsapp"); }}
                          className="text-xs border border-green-600 text-green-700 px-3 py-1.5 rounded hover:bg-green-50 transition"
                        >
                          WhatsApp cobro
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); onOpenEmail(client); onMarkContacted(client.nombre_normalized, "email"); }}
                          className="text-xs border border-gray-400 text-gray-700 px-3 py-1.5 rounded hover:bg-gray-100 transition"
                        >
                          Email cobro
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); onMarkContacted(client.nombre_normalized, "llamada"); }}
                          className="text-xs border border-blue-400 text-blue-700 px-3 py-1.5 rounded hover:bg-blue-50 transition"
                        >
                          Marcar llamada
                        </button>
                      </div>
                    )}
                    {/* Last contact */}
                    {contactLog[client.nombre_normalized] && (
                      <div className="mt-2 text-[11px] text-gray-400">
                        Ultimo contacto: {new Date(contactLog[client.nombre_normalized].date).toLocaleDateString("es-PA")} via {contactLog[client.nombre_normalized].method}
                      </div>
                    )}
                  </div>

                  {/* Per-company breakdown */}
                  {(() => {
                    const visibleCompanies = companyFilter !== "all"
                      ? roleCompanies.filter((co) => co.key === companyFilter && client.companies[co.key])
                      : roleCompanies.filter((co) => client.companies[co.key]);
                    return visibleCompanies.length > 0 && (
                      <>
                  <div className="text-xs font-medium text-gray-500 uppercase mb-2">
                    {roleCompanies.length === 1 || companyFilter !== "all" ? "Detalle de aging" : "Desglose por empresa"}
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-400 uppercase">
                        {roleCompanies.length > 1 && <th className="text-left py-1 font-medium">Empresa</th>}
                        <th className="text-left py-1 font-medium">Codigo</th>
                        <th className="text-right py-1 font-medium">0-30</th>
                        <th className="text-right py-1 font-medium">31-60</th>
                        <th className="text-right py-1 font-medium">61-90</th>
                        <th className="text-right py-1 font-medium">91-120</th>
                        <th className="text-right py-1 font-medium">121-180</th>
                        <th className="text-right py-1 font-medium">181-270</th>
                        <th className="text-right py-1 font-medium">271-365</th>
                        <th className="text-right py-1 font-medium">+365</th>
                        <th className="text-right py-1 font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleCompanies.map((co) => {
                        const d = client.companies[co.key];
                        return (
                          <tr key={co.key} className="border-t border-gray-100">
                            {roleCompanies.length > 1 && <td className="py-1.5">{co.name}</td>}
                            <td className="py-1.5 text-gray-500">{d.codigo}</td>
                            <td className="text-right py-1.5">{fmt(d.d0_30)}</td>
                            <td className="text-right py-1.5">{fmt(d.d31_60)}</td>
                            <td className="text-right py-1.5">{fmt(d.d61_90)}</td>
                            <td className="text-right py-1.5 text-yellow-600">{fmt(d.d91_120)}</td>
                            <td className="text-right py-1.5 text-yellow-600">{fmt(d.d121_180)}</td>
                            <td className="text-right py-1.5 text-red-600">{fmt(d.d181_270)}</td>
                            <td className="text-right py-1.5 text-red-600">{fmt(d.d271_365)}</td>
                            <td className="text-right py-1.5 text-red-600">{fmt(d.mas_365)}</td>
                            <td className="text-right py-1.5 font-semibold">{fmt(d.total)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 text-xs text-gray-400 text-center">
        {filtered.length} clientes &middot; Politica: 0-90d corriente &middot; 91-120d vigilancia &middot; 121d+ vencido
      </div>
    </>
  );
}
