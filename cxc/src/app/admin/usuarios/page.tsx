"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import { Toast, SkeletonTable, EmptyState, ConfirmModal, Avatar, Chip } from "@/components/ui";
import VendedorSwitchSection from "./VendedorSwitchSection";
import { ALL_MODULES, getDefaultModulesForRole } from "@/lib/modules";
import { useFormModalDismiss } from "@/lib/hooks/useModalDismiss";

// Cargar Playfair Display sin contaminar otros módulos —
// el <link> queda inerte si ya está en cache desde otra página.
const PLAYFAIR_HREF = "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&display=swap";

// Módulos disponibles para el override per-usuario. Fuente única: ALL_MODULES.
const MODULES = ALL_MODULES.map(m => ({ key: m.key, label: m.label }));

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "—";
  const diff = Math.max(0, Date.now() - t);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `hace ${hr} h`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `hace ${d} d`;
  return new Date(iso).toLocaleDateString("es-PA", { day: "2-digit", month: "short" });
}

export default function UsuariosPage() {
  const { authChecked } = useAuth({ moduleKey: "admin", allowedRoles: ["admin"] });
  const [toast, setToast] = useState<string | null>(null);

  // Sessions
  interface Session { id: string; user_name: string; user_role: string; ip_address: string | null; last_seen: string; created_at: string; revoked: boolean; }
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [revokingSession, setRevokingSession] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<{ id: string; userName: string } | null>(null);

  // Usuarios del sistema (fg_users)
  interface FgUser { id: string; name: string; role: string; active: boolean; associated_company: string | null; modulos_override: string[] | null; }
  const [fgUsers, setFgUsers] = useState<FgUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [showUserModal, setShowUserModal] = useState(false);
  const [editUserId, setEditUserId] = useState<string | null>(null);
  const [uName, setUName] = useState("");
  const [uPassword, setUPassword] = useState("");
  const [uRole, setURole] = useState("vendedor");
  const [uCompany, setUCompany] = useState("");
  // Override de módulos per-usuario: customPerms off = hereda del rol (null).
  const [customPerms, setCustomPerms] = useState(false);
  const [uModules, setUModules] = useState<string[]>([]);
  const [savingUser, setSavingUser] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<{ id: string; name: string; active: boolean } | null>(null);
  const currentUserId = typeof window !== "undefined" ? sessionStorage.getItem("fg_user_id") : null;

  // Sesiones: colapsadas por defecto + filtro por día
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [sessionRange, setSessionRange] = useState<"today" | "7d" | "30d" | "all">("7d");

  // Modal: toggle ver/ocultar contraseña
  const [showModalPw, setShowModalPw] = useState(false);
  useEffect(() => {
    if (!showUserModal) return;
    setShowModalPw(false);
  }, [showUserModal]);

  // Clic fuera y Escape cierran el modal de usuario, salvo que ya se hayan
  // escrito datos sin guardar (nombre, contraseña, permisos): ahí solo se sale
  // con Cancelar o Guardar, para no perder el alta a medio llenar.
  const cerrarUserModal = useCallback(() => setShowUserModal(false), []);
  const userModal = useFormModalDismiss(showUserModal, cerrarUserModal, !savingUser);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const res = await fetch("/api/admin/sessions");
      if (res.ok) setSessions(await res.json());
    } catch { showToast("Error al cargar sesiones"); }
    setLoadingSessions(false);
  }, []);

  const loadFgUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const res = await fetch("/api/admin/users");
      if (res.status === 401) { sessionStorage.clear(); window.location.href = "/"; return; }
      if (res.ok) setFgUsers(await res.json());
    } catch { showToast("Error al cargar usuarios"); }
    setLoadingUsers(false);
  }, []);

  useEffect(() => { if (authChecked) { loadFgUsers(); loadSessions(); } }, [authChecked, loadFgUsers, loadSessions]);

  // Última actividad por usuario (max last_seen entre todas sus sesiones).
  const lastSeenByUser = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of sessions) {
      const prev = map[s.user_name];
      if (!prev || new Date(s.last_seen).getTime() > new Date(prev).getTime()) {
        map[s.user_name] = s.last_seen;
      }
    }
    return map;
  }, [sessions]);

  if (!authChecked) return null;

  function openNewUser() {
    setEditUserId(null); setUName(""); setUPassword(""); setURole("vendedor"); setUCompany("");
    setCustomPerms(false); setUModules([]);
    setShowUserModal(true);
  }
  function openEditUser(u: FgUser) {
    setEditUserId(u.id); setUName(u.name); setUPassword(""); setURole(u.role); setUCompany(u.associated_company || "");
    const hasOverride = Array.isArray(u.modulos_override) && u.modulos_override.length > 0;
    setCustomPerms(hasOverride);
    setUModules(hasOverride ? [...u.modulos_override!] : []);
    setShowUserModal(true);
  }
  function toggleOverrideModule(key: string) {
    setUModules(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  }
  async function saveUser() {
    if (!uName.trim()) { showToast("Nombre requerido"); return; }
    if (!editUserId && !uPassword.trim()) { showToast("Contraseña requerida para nuevo usuario"); return; }
    if (customPerms && uModules.length === 0) {
      showToast("Selecciona al menos un módulo o desactiva los permisos personalizados.");
      return;
    }
    setSavingUser(true);
    try {
      const body: Record<string, unknown> = {
        id: editUserId,
        name: uName.trim(),
        role: uRole,
        associated_company: uCompany || null,
        modulos_override: customPerms ? uModules : null,
      };
      if (uPassword.trim()) body.password = uPassword.trim();
      const method = editUserId ? "PUT" : "POST";
      const res = await fetch("/api/admin/users", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) { showToast(editUserId ? "Usuario actualizado" : "Usuario creado"); setShowUserModal(false); loadFgUsers(); }
      else { const err = await res.json(); showToast(err.error || "Error"); }
    } catch { showToast("Sin conexión. Verifica tu internet e intenta de nuevo."); }
    setSavingUser(false);
  }
  async function toggleUserActive(id: string, active: boolean) {
    try {
      const res = await fetch("/api/admin/users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, active }) });
      if (res.ok) showToast(active ? "Usuario activado" : "Usuario desactivado");
      else showToast("Error al actualizar");
    } catch { showToast("Sin conexión. Verifica tu internet e intenta de nuevo."); }
    loadFgUsers();
  }
  async function revokeSession(sessionId: string) {
    setRevokingSession(sessionId);
    try {
      const res = await fetch("/api/admin/sessions", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId }) });
      if (res.ok) { showToast("Sesión revocada"); loadSessions(); }
      else showToast("Error al revocar");
    } catch { showToast("Sin conexión. Verifica tu internet e intenta de nuevo."); }
    setRevokingSession(null);
  }
  async function revokeAllSessions(userName: string) {
    setRevokingSession(userName);
    try {
      const res = await fetch("/api/admin/sessions", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userName }) });
      if (res.ok) { showToast(`Todas las sesiones de ${userName} revocadas`); loadSessions(); }
      else showToast("Error al revocar");
    } catch { showToast("Sin conexión. Verifica tu internet e intenta de nuevo."); }
    setRevokingSession(null);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Playfair Display para el título de página (carga lazy, no afecta otros módulos) */}
      <link rel="stylesheet" href={PLAYFAIR_HREF} />

      <AppHeader module="Sistema" breadcrumbs={[{ label: "Usuarios" }]} />

      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="mb-8 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1
              className="text-2xl sm:text-[28px] text-gray-900 leading-tight tracking-tight"
              style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700 }}
            >
              Usuarios
            </h1>
            <p className="text-sm text-gray-600 mt-1">Define qué módulos ve cada quien</p>
          </div>
          <button onClick={openNewUser} className="text-sm bg-black text-white px-4 py-2 rounded-md hover:bg-gray-800 transition flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Nuevo Usuario
          </button>
        </div>

        {/* ══ Usuarios del sistema ══ */}
        <section className="mb-10">
          {loadingUsers ? (
            <SkeletonTable rows={3} cols={4} />
          ) : fgUsers.length === 0 ? (
            <EmptyState title="No hay usuarios" actionLabel="+ Nuevo Usuario" onAction={openNewUser} />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {fgUsers.map(u => {
                const lastSeen = lastSeenByUser[u.name];
                const hasOverride = Array.isArray(u.modulos_override) && u.modulos_override.length > 0;
                return (
                  <article
                    key={u.id}
                    className="group relative bg-white border border-gray-200 rounded-lg p-4 transition-shadow hover:shadow-sm hover:border-gray-300"
                  >
                    <div className="flex items-start gap-3">
                      <Avatar name={u.name} role={u.role} size="lg" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-gray-900 leading-tight truncate">{u.name}</div>
                        <div className="text-xs text-gray-500 mt-0.5 capitalize">{u.role}</div>
                        {u.associated_company && (
                          <div className="text-xs text-gray-400 mt-1 truncate" title={u.associated_company}>
                            {u.associated_company}
                          </div>
                        )}
                        {hasOverride && (
                          <div className="text-xs text-teal-700 mt-1">Permisos personalizados</div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-xs text-gray-600">
                          <span className={`w-1.5 h-1.5 rounded-full ${u.active ? "bg-emerald-500" : "bg-gray-300"}`} />
                          {u.active ? "Activo" : "Inactivo"}
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5" title={lastSeen ? new Date(lastSeen).toLocaleString("es-PA") : undefined}>
                          {lastSeen ? `Última sesión ${relativeTime(lastSeen)}` : "Nunca ha entrado"}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 sm:opacity-60 sm:group-hover:opacity-100 transition-opacity shrink-0">
                        <button
                          onClick={() => openEditUser(u)}
                          title="Editar"
                          className="text-gray-400 hover:text-gray-700 p-1.5 rounded transition-colors"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
                        </button>
                        <button
                          onClick={() => setDeactivateTarget({ id: u.id, name: u.name, active: u.active })}
                          title={u.active ? "Desactivar" : "Reactivar"}
                          className="text-gray-400 hover:text-red-600 p-1.5 rounded transition-colors"
                        >
                          {u.active ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg>
                          ) : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                          )}
                        </button>
                      </div>
                    </div>

                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* User modal */}
        {showUserModal && (
          <div
            {...userModal.backdrop}
            className="fixed inset-0 bg-gray-900/40 backdrop-blur-[2px] flex items-center justify-center z-50 px-4"
          >
            <div
              ref={userModal.panelRef}
              className="bg-white rounded-xl shadow-xl border border-gray-200 max-w-md w-full max-h-[90vh] overflow-y-auto"
              role="dialog"
              aria-modal="true"
              aria-labelledby="usuario-modal-title"
            >
              <div className="px-6 pt-6 pb-2">
                <h2
                  id="usuario-modal-title"
                  className="text-gray-900 leading-tight"
                  style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontSize: "20px" }}
                >
                  {editUserId ? "Editar usuario" : "Nuevo usuario"}
                </h2>
              </div>

              <div className="px-6 py-5 space-y-4">
                <div>
                  <label className="text-xs font-medium text-gray-700 uppercase tracking-[0.08em] block mb-1.5">Nombre</label>
                  <input
                    value={uName}
                    onChange={e => setUName(e.target.value)}
                    placeholder="Nombre del usuario"
                    autoFocus
                    className="w-full bg-white border border-gray-200 rounded-md px-3 py-3 text-sm placeholder:text-gray-400 focus:outline-none focus:border-teal-700 transition"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-700 uppercase tracking-[0.08em] block mb-1.5">
                    {editUserId ? "Nueva contraseña" : "Contraseña"}
                  </label>
                  <div className="relative">
                    <input
                      type={showModalPw ? "text" : "password"}
                      value={uPassword}
                      onChange={e => setUPassword(e.target.value)}
                      placeholder={editUserId ? "Dejar vacío para no cambiar" : "Mínimo 8 caracteres"}
                      className="w-full bg-white border border-gray-200 rounded-md px-3 py-3 pr-10 text-sm font-mono placeholder:text-gray-400 placeholder:font-sans focus:outline-none focus:border-teal-700 transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowModalPw(s => !s)}
                      title={showModalPw ? "Ocultar" : "Ver"}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 p-1.5 rounded transition"
                    >
                      {showModalPw ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-700 uppercase tracking-[0.08em] block mb-1.5">Rol</label>
                  <select
                    value={uRole}
                    onChange={e => setURole(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-md px-3 py-3 text-sm focus:outline-none focus:border-teal-700 transition"
                  >
                    <option value="admin">Admin — acceso total</option>
                    <option value="secretaria">Secretaria — operaciones diarias</option>
                    <option value="vendedor">Vendedor — catálogo y CXC</option>
                    <option value="contabilidad">Contabilidad — préstamos y ventas</option>
                    <option value="bodega">Bodega — despacho de guías</option>
                  </select>
                  {editUserId === currentUserId && uRole !== "admin" && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5 mt-2">
                      Cambiar tu propio rol te quitará acceso de administrador.
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-700 uppercase tracking-[0.08em] block mb-1.5">
                    Empresa <span className="font-normal text-gray-400 normal-case">(opcional)</span>
                  </label>
                  <input
                    value={uCompany}
                    onChange={e => setUCompany(e.target.value)}
                    placeholder="vistana, fashion_wear, etc."
                    className="w-full bg-white border border-gray-200 rounded-md px-3 py-3 text-sm placeholder:text-gray-400 focus:outline-none focus:border-teal-700 transition"
                  />
                  <p className="text-xs text-gray-400 mt-1">Para vendedores: restringe el CXC a esa empresa. Vacío = todas.</p>
                </div>

                {/* Override de módulos per-usuario */}
                <div className="pt-1">
                  <label className="flex items-center justify-between gap-3 cursor-pointer">
                    <span className="text-xs font-medium text-gray-700 uppercase tracking-[0.08em]">Permisos personalizados</span>
                    <input
                      type="checkbox"
                      checked={customPerms}
                      onChange={e => {
                        const on = e.target.checked;
                        setCustomPerms(on);
                        // Al activar, precargar los módulos que el usuario YA tiene por su rol.
                        // El override REEMPLAZA al rol (no suma), así que sin precargar se
                        // perderían los demás módulos al guardar.
                        if (on && uModules.length === 0) setUModules(getDefaultModulesForRole(uRole));
                      }}
                      className="accent-teal-700 w-4 h-4"
                    />
                  </label>
                  <p className="text-xs text-gray-400 mt-1">
                    {customPerms
                      ? "Este usuario verá solo los módulos marcados (ignora los del rol)."
                      : "Apagado: usa los módulos por defecto de su rol."}
                  </p>
                  {customPerms && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-3">
                      {MODULES.map(mod => {
                        const checked = uModules.includes(mod.key);
                        return (
                          <label
                            key={mod.key}
                            className={`flex items-center gap-2.5 px-3 py-2 rounded-md border transition cursor-pointer ${checked ? "bg-teal-50 border-teal-200" : "border-gray-200 hover:bg-gray-50"}`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleOverrideModule(mod.key)}
                              className="accent-teal-700 w-4 h-4"
                            />
                            <span className="text-sm text-gray-800">{mod.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Mapeo vendedor Switch — solo en edición (necesita user id). */}
                {editUserId && <VendedorSwitchSection userId={editUserId} showToast={showToast} />}
              </div>

              <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
                <button
                  onClick={() => setShowUserModal(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-md transition"
                >
                  Cancelar
                </button>
                <button
                  onClick={saveUser}
                  disabled={savingUser}
                  className="px-5 py-2 bg-black text-white text-sm font-medium rounded-md hover:bg-gray-800 transition disabled:opacity-50"
                >
                  {savingUser ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Sesiones Activas — colapsable */}
        <section className="mb-10">
          {(() => {
            const active = sessions.filter(s => !s.revoked);
            const now = Date.now();
            const filtered = active.filter(s => {
              if (sessionRange === "all") return true;
              const t = new Date(s.last_seen).getTime();
              if (isNaN(t)) return false;
              const diffDays = (now - t) / 86_400_000;
              if (sessionRange === "today") return diffDays < 1;
              if (sessionRange === "7d") return diffDays < 7;
              if (sessionRange === "30d") return diffDays < 30;
              return true;
            });

            const countByUser: Record<string, number> = {};
            for (const s of active) countByUser[s.user_name] = (countByUser[s.user_name] || 0) + 1;

            return (
              <>
                <button
                  onClick={() => setSessionsOpen(o => !o)}
                  className="w-full flex items-center justify-between gap-3 py-2 text-left"
                  aria-expanded={sessionsOpen}
                >
                  <div className="flex items-center gap-3">
                    <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-gray-500">Sesiones activas</h2>
                    <span className="text-xs text-gray-400">{active.length} {active.length === 1 ? "sesión" : "sesiones"}</span>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`text-gray-400 transition-transform ${sessionsOpen ? "rotate-180" : ""}`}>
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {sessionsOpen && (
                  <div className="mt-3 space-y-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex flex-wrap gap-1.5">
                        <Chip variant="neutral" active={sessionRange === "today"} onClick={() => setSessionRange("today")}>Hoy</Chip>
                        <Chip variant="neutral" active={sessionRange === "7d"} onClick={() => setSessionRange("7d")}>7 días</Chip>
                        <Chip variant="neutral" active={sessionRange === "30d"} onClick={() => setSessionRange("30d")}>30 días</Chip>
                        <Chip variant="neutral" active={sessionRange === "all"} onClick={() => setSessionRange("all")}>Todas</Chip>
                      </div>
                      <button onClick={loadSessions} className="text-xs text-gray-400 hover:text-gray-700 transition">Actualizar</button>
                    </div>

                    {loadingSessions ? (
                      <SkeletonTable rows={3} cols={5} />
                    ) : filtered.length === 0 ? (
                      <p className="text-sm text-gray-500 py-4 text-center">No hay sesiones en este rango.</p>
                    ) : (
                      <div className="border border-gray-200 bg-white rounded-lg divide-y divide-gray-100">
                        {filtered.map(s => {
                          const userTotal = countByUser[s.user_name] || 0;
                          const showRevokeAll = userTotal >= 2;
                          return (
                            <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                              <Avatar name={s.user_name} role={s.user_role} size="sm" />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-medium text-gray-900 truncate">{s.user_name}</span>
                                  <span className="text-xs text-gray-400 capitalize">{s.user_role}</span>
                                </div>
                                <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                                  <span title={new Date(s.last_seen).toLocaleString("es-PA")}>{relativeTime(s.last_seen)}</span>
                                  {s.ip_address && (
                                    <>
                                      <span className="text-gray-300">·</span>
                                      <span className="font-mono text-xs">{s.ip_address}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {showRevokeAll && (
                                  <button
                                    onClick={() => revokeAllSessions(s.user_name)}
                                    disabled={revokingSession === s.user_name}
                                    title={`Revocar todas las sesiones de ${s.user_name}`}
                                    className="text-xs text-gray-500 hover:text-red-600 px-2 py-1 transition disabled:opacity-50"
                                  >
                                    Revocar todas ({userTotal})
                                  </button>
                                )}
                                <button
                                  onClick={() => setRevokeTarget({ id: s.id, userName: s.user_name })}
                                  disabled={revokingSession === s.id}
                                  className="text-xs text-red-600 hover:underline disabled:opacity-50 px-2 py-1"
                                >
                                  {revokingSession === s.id ? "Revocando..." : "Revocar"}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </>
            );
          })()}
        </section>
      </div>

      <ConfirmModal
        open={!!deactivateTarget}
        onClose={() => setDeactivateTarget(null)}
        onConfirm={() => { if (deactivateTarget) { toggleUserActive(deactivateTarget.id, !deactivateTarget.active); setDeactivateTarget(null); } }}
        title={deactivateTarget?.active ? "Desactivar usuario" : "Reactivar usuario"}
        message={deactivateTarget?.active
          ? (deactivateTarget?.id === currentUserId
            ? `¿Desactivar a ${deactivateTarget?.name}? No podrá iniciar sesión. ¡Cuidado! Perderás acceso de administrador.`
            : `¿Desactivar a ${deactivateTarget?.name}? No podrá iniciar sesión.`)
          : (deactivateTarget?.id === currentUserId
            ? `¿Reactivar a ${deactivateTarget?.name}? Podrá iniciar sesión de nuevo. ¡Cuidado! Perderás acceso de administrador.`
            : `¿Reactivar a ${deactivateTarget?.name}? Podrá iniciar sesión de nuevo.`)}
        confirmLabel={deactivateTarget?.active ? "Desactivar" : "Reactivar"}
        destructive={deactivateTarget?.active || false}
      />

      <ConfirmModal
        open={!!revokeTarget}
        onClose={() => setRevokeTarget(null)}
        onConfirm={() => { if (revokeTarget) { revokeSession(revokeTarget.id); setRevokeTarget(null); } }}
        title={`¿Revocar sesión de ${revokeTarget?.userName ?? ""}?`}
        message="El usuario tendrá que iniciar sesión de nuevo. Si esta es tu sesión actual, te cerrará la sesión."
        confirmLabel="Revocar"
        destructive
      />

      <Toast message={toast} />
    </div>
  );
}
