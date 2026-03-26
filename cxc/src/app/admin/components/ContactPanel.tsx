import { useState, useEffect } from "react";
import type { Company } from "@/lib/companies";
import type { ConsolidatedClient } from "@/lib/types";

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface Props {
  client: ConsolidatedClient;
  contactLog: Record<string, { date: string; method: string }>;
  onOpenWhatsApp: (client: ConsolidatedClient) => void;
  onOpenEmail: (client: ConsolidatedClient) => void;
  onMarkContacted: (clientName: string, method: string) => void;
  onSaveEdit: (nombre: string, data: { correo: string; telefono: string; celular: string; contacto: string }) => void;
  companyFilter: string;
  roleCompanies: Company[];
}

export default function ContactPanel({
  client,
  contactLog,
  onOpenWhatsApp,
  onOpenEmail,
  onMarkContacted,
  onSaveEdit,
  companyFilter,
  roleCompanies,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({ correo: "", telefono: "", celular: "", contacto: "" });
  const [copied, setCopied] = useState<string | null>(null);

  function startEdit() {
    setEditing(true);
    setEditData({
      correo: client.correo, telefono: client.telefono,
      celular: client.celular, contacto: client.contacto,
    });
  }

  function saveEdit() {
    onSaveEdit(client.nombre_normalized, editData);
    setEditing(false);
  }

  function copyEmail(email: string) {
    navigator.clipboard.writeText(email);
    setCopied(email);
    setTimeout(() => setCopied(null), 2000);
  }

  const visibleCompanies = companyFilter !== "all"
    ? roleCompanies.filter((co) => co.key === companyFilter && client.companies[co.key])
    : roleCompanies.filter((co) => client.companies[co.key]);

  return (
    <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
      {/* Contact info + action buttons */}
      <div className="mb-4">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-xs font-medium text-gray-500 uppercase">Contacto</span>
          {!editing && (
            <button onClick={(e) => { e.stopPropagation(); startEdit(); }}
              className="text-xs text-blue-600 hover:underline">Editar</button>
          )}
        </div>

        {editing ? (
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
              <button onClick={() => setEditing(false)} className="text-xs text-gray-500 hover:text-black">Cancelar</button>
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

        {/* Action buttons */}
        {!editing && (
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

      {/* Internal note */}
      <ClientNote clientName={client.nombre_normalized} />

      {/* Per-company breakdown */}
      {visibleCompanies.length > 0 && (
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
      )}
    </div>
  );
}

function ClientNote({ clientName }: { clientName: string }) {
  const [note, setNote] = useState("");
  useEffect(() => {
    try { const saved = JSON.parse(localStorage.getItem("fg_client_notes") || "{}"); setNote(saved[clientName] || ""); } catch { /* */ }
  }, [clientName]);
  function save(v: string) {
    setNote(v);
    try { const all = JSON.parse(localStorage.getItem("fg_client_notes") || "{}"); all[clientName] = v; localStorage.setItem("fg_client_notes", JSON.stringify(all)); } catch { /* */ }
  }
  return (
    <div className="mt-3 mb-3">
      <div className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-1">Nota interna</div>
      <textarea value={note} onChange={(e) => save(e.target.value)} placeholder="Ej: Acuerdo de pago, cliente VIP..." rows={2}
        className="w-full border border-gray-100 rounded-lg p-2 text-xs outline-none focus:border-gray-300 resize-none text-gray-600 placeholder:text-gray-300" />
    </div>
  );
}
