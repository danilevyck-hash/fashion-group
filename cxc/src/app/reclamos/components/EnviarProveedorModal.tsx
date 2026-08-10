"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";
import { Ayuda } from "@/components/shared/Ayuda";

interface EnviarProveedorModalProps {
  open: boolean;
  empresa: string;
  reclamoIds: string[];
  defaultTo: string;
  contactoNombre?: string;
  count: number;
  defaultSubject?: string;
  onClose: () => void;
  onSent: (msg: string) => void;
}

/** Contacto de la libreta GLOBAL (tabla contactos_email). */
interface ContactoEmail {
  id: string;
  email: string;
  nombre: string | null;
  created_at: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Agrega un correo a un campo "a, b, c" sin duplicar (case-insensitive). */
function appendEmail(current: string, email: string): string {
  const parts = current.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.some((p) => p.toLowerCase() === email.toLowerCase())) return current;
  return [...parts, email].join(", ");
}

const IconPencil = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
);
const IconTrash = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
);

/**
 * Modal editable para "Enviar al proveedor": to / cc / asunto / mensaje. El To se
 * precarga con el contacto del proveedor; el CC es opcional. Una LIBRETA global de
 * contactos (contactos_email) permite agregar correos a To/CC sin reescribir, y
 * administrarlos (agregar/editar/eliminar). Al enviar, el server arma el Excel del
 * reclamo y lo adjunta (con los links de factura/fotos que abren con un clic).
 */
export default function EnviarProveedorModal({
  open, empresa, reclamoIds, defaultTo, contactoNombre, count, defaultSubject, onClose, onSent,
}: EnviarProveedorModalProps) {
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // Libreta global de contactos.
  const [libreta, setLibreta] = useState<ContactoEmail[]>([]);
  const [libretaOpen, setLibretaOpen] = useState(false);
  const [libretaErr, setLibretaErr] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [newNombre, setNewNombre] = useState("");
  const [savingNew, setSavingNew] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editEmail, setEditEmail] = useState("");
  const [editNombre, setEditNombre] = useState("");

  useEffect(() => setMounted(true), []);

  const loadLibreta = useCallback(async () => {
    try {
      const res = await fetch("/api/reclamos/contactos-email");
      if (!res.ok) throw new Error();
      setLibreta(await res.json());
      setLibretaErr(null);
    } catch {
      setLibretaErr("No se pudo cargar la libreta.");
    }
  }, []);

  // Re-prefilla los campos y carga la libreta cada vez que se abre.
  useEffect(() => {
    if (!open) return;
    const nombre = (contactoNombre || "").trim() || "equipo";
    const plural = count === 1 ? "" : "s";
    setTo(defaultTo || "");
    setCc("");
    setSubject(
      defaultSubject ||
        (count === 1 ? `Reclamo pendiente — ${empresa}` : `Reclamos pendientes — ${empresa} (${count})`),
    );
    setMessage(
      `Estimado/a ${nombre},\n\nAdjuntamos ${count} reclamo${plural} pendiente${plural} de ${empresa} con su evidencia fotográfica y el detalle en Excel. Quedamos en espera de la nota de crédito correspondiente.`,
    );
    setError(null);
    setLibretaOpen(false);
    setEditId(null);
    setNewEmail("");
    setNewNombre("");
    loadLibreta();
  }, [open, defaultTo, defaultSubject, contactoNombre, count, empresa, loadLibreta]);

  // Bloquea el scroll del body mientras está abierto (hook compartido, ref-count).
  useBodyScrollLock(open);

  // Escape para cerrar
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !sending) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, sending, onClose]);

  if (!open || !mounted) return null;

  async function saveNewContacto() {
    const email = newEmail.trim();
    const nombre = newNombre.trim();
    if (!EMAIL_RE.test(email)) { setLibretaErr("Correo inválido."); return; }
    setSavingNew(true);
    setLibretaErr(null);
    try {
      const res = await fetch("/api/reclamos/contactos-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, nombre }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => null);
        throw new Error(e?.error || "No se pudo guardar.");
      }
      setNewEmail("");
      setNewNombre("");
      await loadLibreta();
    } catch (e) {
      setLibretaErr(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setSavingNew(false);
    }
  }

  async function saveEditContacto() {
    if (!editId) return;
    const email = editEmail.trim();
    if (!EMAIL_RE.test(email)) { setLibretaErr("Correo inválido."); return; }
    setLibretaErr(null);
    try {
      const res = await fetch("/api/reclamos/contactos-email", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editId, email, nombre: editNombre.trim() }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => null);
        throw new Error(e?.error || "No se pudo actualizar.");
      }
      setEditId(null);
      await loadLibreta();
    } catch (e) {
      setLibretaErr(e instanceof Error ? e.message : "No se pudo actualizar.");
    }
  }

  async function deleteContacto(id: string) {
    setLibretaErr(null);
    try {
      const res = await fetch(`/api/reclamos/contactos-email?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setLibreta((prev) => prev.filter((c) => c.id !== id));
    } catch {
      setLibretaErr("No se pudo eliminar.");
    }
  }

  async function send() {
    const cleanTo = to.trim();
    const cleanCc = cc.trim();
    if (!cleanTo) { setError("Falta el correo del destinatario."); return; }
    if (!subject.trim()) { setError("Falta el asunto."); return; }
    if (reclamoIds.length === 0) { setError("No hay reclamos para enviar."); return; }
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/reclamos/proveedor/${encodeURIComponent(empresa)}/send-zip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reclamo_ids: reclamoIds,
          to: cleanTo,
          cc: cleanCc,
          subject: subject.trim(),
          message: message.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "No se pudo enviar el correo.");
      }
      const data = await res.json().catch(() => ({}));
      const viaLink = data?.mode === "link" ? " (enlace de descarga)" : "";
      const omitidas = Number(data?.fotosOmitidas || 0);
      const aviso = omitidas > 0 ? ` · ${omitidas} foto${omitidas === 1 ? "" : "s"} no se pudo incluir` : "";
      const ccAviso = cleanCc ? " (con copia)" : "";
      onSent(`Correo enviado a ${cleanTo}${ccAviso}${viaLink}${aviso}`);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo enviar el correo.");
    } finally {
      setSending(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40"
      onClick={() => { if (!sending) onClose(); }}
    >
      <div
        className="bg-white rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto border border-gray-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <h2 className="text-base font-medium">Enviar al proveedor</h2>
            {/* Qué viaja en el correo se aprende una vez: al ⓘ. */}
            <Ayuda titulo="Qué se envía" className="-my-2">
              <p className="mb-1.5">
                Se adjunta el Excel, con links a facturas y fotos que abren con un clic.
              </p>
              <p>
                Debajo del mensaje se agrega automáticamente la tabla resumen y la descarga.
              </p>
            </Ayuda>
          </div>
          <button onClick={() => { if (!sending) onClose(); }} className="text-gray-400 hover:text-black text-2xl leading-none">×</button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <p className="text-xs text-gray-400">
            {empresa} — {count} reclamo{count === 1 ? "" : "s"}
          </p>

          <div>
            <label className="text-xs text-gray-500 block mb-1">Para</label>
            <input
              type="text"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="correo@proveedor.com, otro@proveedor.com"
              className="w-full border border-gray-200 rounded-md px-3 py-2.5 sm:py-2 text-base sm:text-sm outline-none focus:border-black transition"
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 block mb-1">CC (copia)</label>
            <input
              type="text"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              placeholder="copia@correo.com, otra@correo.com (opcional)"
              className="w-full border border-gray-200 rounded-md px-3 py-2.5 sm:py-2 text-base sm:text-sm outline-none focus:border-black transition"
            />
          </div>

          {/* Libreta global de contactos */}
          <div className="border border-gray-100 rounded-md">
            <button
              type="button"
              onClick={() => setLibretaOpen((v) => !v)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-gray-600 hover:text-black transition"
            >
              <span>Libreta de contactos {libreta.length > 0 && <span className="text-gray-300">({libreta.length})</span>}</span>
              <span className="text-gray-300">{libretaOpen ? "▲" : "▼"}</span>
            </button>

            {libretaOpen && (
              <div className="px-3 pb-3 space-y-2 border-t border-gray-100 pt-2">
                {/* Agregar nuevo contacto */}
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={newNombre}
                    onChange={(e) => setNewNombre(e.target.value)}
                    placeholder="Nombre (opcional)"
                    className="flex-1 border border-gray-200 rounded-md px-2 py-1.5 text-sm outline-none focus:border-black transition"
                  />
                  <input
                    type="text"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="correo@dominio.com"
                    className="flex-1 border border-gray-200 rounded-md px-2 py-1.5 text-sm outline-none focus:border-black transition"
                  />
                  <button
                    type="button"
                    onClick={saveNewContacto}
                    disabled={savingNew}
                    className="text-xs bg-black text-white px-3 py-1.5 rounded-md font-medium hover:bg-gray-800 active:scale-[0.97] transition disabled:opacity-50 whitespace-nowrap"
                  >
                    {savingNew ? "Guardando…" : "Agregar"}
                  </button>
                </div>

                {libretaErr && <p className="text-xs text-red-500">{libretaErr}</p>}

                {/* Lista de contactos */}
                {libreta.length > 0 && (
                  <div className="max-h-48 overflow-y-auto divide-y divide-gray-50">
                    {libreta.map((ct) => (
                      <div key={ct.id} className="py-1.5">
                        {editId === ct.id ? (
                          <div className="flex flex-col sm:flex-row gap-1.5 items-stretch">
                            <input
                              type="text"
                              value={editNombre}
                              onChange={(e) => setEditNombre(e.target.value)}
                              placeholder="Nombre"
                              className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs outline-none focus:border-black"
                            />
                            <input
                              type="text"
                              value={editEmail}
                              onChange={(e) => setEditEmail(e.target.value)}
                              placeholder="correo@dominio.com"
                              className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs outline-none focus:border-black"
                            />
                            <div className="flex gap-1">
                              <button type="button" onClick={saveEditContacto} className="text-xs bg-black text-white px-2 py-1 rounded hover:bg-gray-800">Guardar</button>
                              <button type="button" onClick={() => setEditId(null)} className="text-xs text-gray-400 px-2 py-1 hover:text-black">Cancelar</button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              {ct.nombre && <p className="text-xs font-medium truncate">{ct.nombre}</p>}
                              <p className="text-xs text-gray-400 truncate">{ct.email}</p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button type="button" onClick={() => setTo((v) => appendEmail(v, ct.email))} title="Agregar a Para" className="text-xs border border-gray-200 px-1.5 py-1 rounded text-gray-500 hover:text-black hover:border-gray-400 transition">+ Para</button>
                              <button type="button" onClick={() => setCc((v) => appendEmail(v, ct.email))} title="Agregar a CC" className="text-xs border border-gray-200 px-1.5 py-1 rounded text-gray-500 hover:text-black hover:border-gray-400 transition">+ CC</button>
                              <button type="button" onClick={() => { setEditId(ct.id); setEditEmail(ct.email); setEditNombre(ct.nombre || ""); setLibretaErr(null); }} title="Editar" className="p-1 text-gray-400 hover:text-black transition">{IconPencil}</button>
                              <button type="button" onClick={() => deleteContacto(ct.id)} title="Eliminar" className="p-1 text-gray-400 hover:text-red-600 transition">{IconTrash}</button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="text-xs text-gray-500 block mb-1">Asunto</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full border border-gray-200 rounded-md px-3 py-2.5 sm:py-2 text-base sm:text-sm outline-none focus:border-black transition"
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 block mb-1">Mensaje</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-base sm:text-sm outline-none focus:border-black transition resize-y"
            />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-end gap-2">
          <button
            onClick={() => { if (!sending) onClose(); }}
            disabled={sending}
            className="text-sm px-4 py-2 rounded-md text-gray-500 hover:text-black transition disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            onClick={send}
            disabled={sending}
            className="text-sm bg-black text-white px-5 py-2 rounded-md font-medium hover:bg-gray-800 active:scale-[0.97] transition-all disabled:opacity-50"
          >
            {sending ? "Enviando…" : "Enviar correo"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
