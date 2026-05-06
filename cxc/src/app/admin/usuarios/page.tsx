"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import { Toast, SkeletonTable, EmptyState, ConfirmModal, Avatar, Chip } from "@/components/ui";
import { ALL_MODULES } from "@/lib/modules";

// Cargar Playfair Display sin contaminar otros módulos —
// el <link> queda inerte si ya está en cache desde otra página.
const PLAYFAIR_HREF = "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&display=swap";

interface RolePermission {
  role: string;
  label: string;
  modulos: string[];
  activo: boolean;
}

// Lista visible en el panel de admin para asignar permisos por rol.
// Derivada de ALL_MODULES (src/lib/modules.ts) — fuente única de verdad.
const MODULES = ALL_MODULES.map(m => ({ key: m.key, label: m.label }));

// Roles disponibles para crear/filtrar usuarios. Mismo orden que el select del modal.
const USER_ROLES = ["admin", "director", "secretaria", "vendedor", "contabilidad", "bodega"] as const;

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
  const router = useRouter();
  const { authChecked } = useAuth({ moduleKey: "admin", allowedRoles: ["admin"] });
  const [roles, setRoles] = useState<RolePermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [expandedRole, setExpandedRole] = useState<string | null>(null);

  // Sessions
  interface Session { id: string; user_name: string; user_role: string; ip_address: string | null; last_seen: string; created_at: string; revoked: boolean; }
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [revokingSession, setRevokingSession] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<{ id: string; userName: string } | null>(null);

  // New user system
  interface FgUser { id: string; name: string; password: string; role: string; active: boolean; associated_company: string; }
  const [fgUsers, setFgUsers] = useState<FgUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [showUserModal, setShowUserModal] = useState(false);
  const [editUserId, setEditUserId] = useState<string | null>(null);
  const [uName, setUName] = useState("");
  const [uPassword, setUPassword] = useState("");
  const [uRole, setURole] = useState("vendedor");
  const [uCompany, setUCompany] = useState("");
  const [savingUser, setSavingUser] = useState(false);
  const [showUserPw, setShowUserPw] = useState<Record<string, boolean>>({});
  const [deactivateTarget, setDeactivateTarget] = useState<{id: string, name: string, active: boolean} | null>(null);
  const currentUserId = typeof window !== "undefined" ? sessionStorage.getItem("fg_user_id") : null;

  // Filtros de la lista de usuarios
  const [userSearch, setUserSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  // Sesiones: colapsadas por defecto + filtro por dia
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [sessionRange, setSessionRange] = useState<"today" | "7d" | "30d" | "all">("7d");

  // Modal: toggle ver/ocultar contraseña + cierre por ESC
  const [showModalPw, setShowModalPw] = useState(false);
  useEffect(() => {
    if (!showUserModal) return;
    setShowModalPw(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShowUserModal(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showUserModal]);

  const filteredUsers = useMemo(() => {
    const term = userSearch.trim().toLowerCase();
    return fgUsers.filter(u => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (statusFilter === "active" && !u.active) return false;
      if (statusFilter === "inactive" && u.active) return false;
      if (term && !u.name.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [fgUsers, roleFilter, statusFilter, userSearch]);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const loadRoles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/usuarios");
      if (res.status === 401) { sessionStorage.clear(); window.location.href = "/"; return; }
      if (res.ok) setRoles(await res.json());
    } catch { showToast("Sin conexión. Verifica tu internet e intenta de nuevo."); }
    setLoading(false);
  }, []);

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

  useEffect(() => { if (authChecked) { loadRoles(); loadFgUsers(); loadSessions(); } }, [authChecked, loadRoles, loadFgUsers, loadSessions]);

  if (!authChecked) return null;

  async function toggleModule(role: string, moduleKey: string) {
    const roleData = roles.find(r => r.role === role);
    if (!roleData) return;

    const newModulos = roleData.modulos.includes(moduleKey)
      ? roleData.modulos.filter(m => m !== moduleKey)
      : [...roleData.modulos, moduleKey];

    if (role !== "admin" && newModulos.length === 0) {
      showToast("Un rol debe tener al menos un módulo. No se guardó el cambio.");
      return;
    }

    setSaving(role);
    try {
      const res = await fetch("/api/admin/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, modulos: newModulos, activo: roleData.activo }),
      });
      if (res.ok) {
        setRoles(prev => prev.map(r => r.role === role ? { ...r, modulos: newModulos } : r));
        showToast("Permisos actualizados");
      } else {
        const err = await res.json();
        showToast(err.error || "Error al guardar");
      }
    } catch { showToast("Sin conexión. Verifica tu internet e intenta de nuevo."); }
    setSaving(null);
  }

  async function exportUsersExcel() {
    const XLSX = (await import("xlsx-js-style")).default;
    const rows: string[][] = [["FASHION GROUP \u2014 Usuarios del Sistema"], [], ["Nombre", "Rol", "Empresa", "Estado"]];
    for (const u of fgUsers) {
      rows.push([u.name, u.role, u.associated_company || "", u.active ? "Activo" : "Inactivo"]);
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 24 }, { wch: 14 }, { wch: 20 }, { wch: 10 }];
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Usuarios");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `Usuarios-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click(); URL.revokeObjectURL(url);
  }

  function openNewUser() {
    setEditUserId(null); setUName(""); setUPassword(""); setURole("vendedor"); setUCompany("");
    setShowUserModal(true);
  }
  function openEditUser(u: FgUser) {
    setEditUserId(u.id); setUName(u.name); setUPassword(""); setURole(u.role); setUCompany(u.associated_company || "");
    setShowUserModal(true);
  }
  async function saveUser() {
    if (!uName.trim()) { showToast("Nombre requerido"); return; }
    if (!editUserId && !uPassword.trim()) { showToast("Contraseña requerida para nuevo usuario"); return; }
    setSavingUser(true);
    try {
      const body: Record<string, unknown> = { id: editUserId, name: uName.trim(), role: uRole, associated_company: uCompany || null };
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

  function selectAll(role: string) {
    const roleData = roles.find(r => r.role === role);
    if (!roleData) return;
    const allKeys = MODULES.map(m => m.key);
    const hasAll = allKeys.every(k => roleData.modulos.includes(k));
    const newModulos = hasAll ? [] : allKeys;

    if (role !== "admin" && newModulos.length === 0) {
      showToast("Un rol debe tener al menos un módulo. No se guardó el cambio.");
      return;
    }

    setSaving(role);
    fetch("/api/admin/usuarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, modulos: newModulos, activo: roleData.activo }),
    }).then(res => {
      if (res.ok) {
        setRoles(prev => prev.map(r => r.role === role ? { ...r, modulos: newModulos } : r));
        showToast("Permisos actualizados");
      }
    }).finally(() => setSaving(null));
  }

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Playfair Display para el título de página (carga lazy, no afecta otros módulos) */}
      <link rel="stylesheet" href={PLAYFAIR_HREF} />

      <AppHeader
        module="Sistema"
        breadcrumbs={[{ label: "Usuarios" }]}
      />

      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="mb-8 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1
              className="text-2xl sm:text-[28px] text-stone-900 leading-tight tracking-tight"
              style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700 }}
            >
              Usuarios
            </h1>
            <p className="text-sm text-stone-600 mt-1">Gestión de usuarios y permisos por rol</p>
          </div>
        </div>

        {/* ══ NEW: fg_users section ══ */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <h2 className="text-[11px] font-medium uppercase tracking-[0.12em] text-stone-500">Usuarios del Sistema</h2>
            <div className="flex gap-2">
              <button onClick={exportUsersExcel} className="text-sm border border-stone-200 bg-white text-stone-700 px-4 py-2 rounded-md hover:border-stone-400 hover:bg-stone-50 transition">
                Excel
              </button>
              <button onClick={openNewUser} className="text-sm bg-teal-700 text-white px-4 py-2 rounded-md hover:bg-teal-800 transition flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Nuevo Usuario
              </button>
            </div>
          </div>

          {/* Filtros + buscador */}
          <div className="mb-5 space-y-3">
            <div className="relative">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Buscar por nombre"
                className="w-full bg-white border border-stone-200 rounded-md pl-9 pr-3 py-2.5 text-sm placeholder:text-stone-400 focus:outline-none focus:border-teal-700 transition"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Chip variant="neutral" active={roleFilter === "all"} onClick={() => setRoleFilter("all")}>Todos los roles</Chip>
              {USER_ROLES.map(r => (
                <Chip key={r} variant="neutral" active={roleFilter === r} onClick={() => setRoleFilter(r)}>
                  <span className="capitalize">{r}</span>
                </Chip>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Chip variant="neutral" active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>Todos</Chip>
              <Chip variant="success" active={statusFilter === "active"} onClick={() => setStatusFilter("active")}>Activos</Chip>
              <Chip variant="danger" active={statusFilter === "inactive"} onClick={() => setStatusFilter("inactive")}>Inactivos</Chip>
            </div>
          </div>

          {loadingUsers ? (
            <SkeletonTable rows={3} cols={4} />
          ) : fgUsers.length === 0 ? (
            <EmptyState title="No hay usuarios" subtitle="Crea el primer usuario del sistema" actionLabel="+ Nuevo Usuario" onAction={openNewUser} />
          ) : filteredUsers.length === 0 ? (
            <div className="border border-stone-200 bg-white rounded-lg px-6 py-10 text-center">
              <p className="text-sm text-stone-500">No hay usuarios que coincidan con los filtros.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredUsers.map(u => (
                <article
                  key={u.id}
                  className="group relative bg-white border border-stone-200 rounded-lg p-4 transition-shadow hover:shadow-sm hover:border-stone-300"
                >
                  <div className="flex items-start gap-3">
                    <Avatar name={u.name} role={u.role} size="lg" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-stone-900 leading-tight truncate">{u.name}</div>
                      <div className="text-xs text-stone-500 mt-0.5 capitalize">{u.role}</div>
                      {u.associated_company && (
                        <div className="text-[11px] text-stone-400 mt-1 truncate" title={u.associated_company}>
                          {u.associated_company}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-stone-100">
                    <div className="flex items-center gap-1.5 text-[11px] text-stone-600">
                      <span className={`w-1.5 h-1.5 rounded-full ${u.active ? "bg-emerald-500" : "bg-stone-300"}`} />
                      {u.active ? "Activo" : "Inactivo"}
                    </div>
                    <div className="flex items-center gap-1 sm:opacity-60 sm:group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setShowUserPw(p => ({ ...p, [u.id]: !p[u.id] }))}
                        title={showUserPw[u.id] ? "Ocultar contraseña" : "Ver contraseña"}
                        className="text-stone-400 hover:text-stone-700 p-1.5 rounded transition-colors"
                      >
                        {showUserPw[u.id] ? (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        )}
                      </button>
                      <button
                        onClick={() => openEditUser(u)}
                        title="Editar"
                        className="text-stone-400 hover:text-stone-700 p-1.5 rounded transition-colors"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                      </button>
                      <button
                        onClick={() => setDeactivateTarget({ id: u.id, name: u.name, active: u.active })}
                        title={u.active ? "Desactivar" : "Reactivar"}
                        className="text-stone-400 hover:text-red-600 p-1.5 rounded transition-colors"
                      >
                        {u.active ? (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        )}
                      </button>
                    </div>
                  </div>

                  {showUserPw[u.id] && (
                    <div className="mt-2 px-2 py-1.5 bg-stone-50 border border-stone-200 rounded text-[11px] font-mono text-stone-600 break-all">
                      {u.password}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

        {/* User modal */}
        {showUserModal && (
          <div
            className="fixed inset-0 bg-stone-900/40 backdrop-blur-[2px] flex items-center justify-center z-50 px-4"
            onClick={(e) => { if (e.target === e.currentTarget) setShowUserModal(false); }}
          >
            <div
              className="bg-white rounded-xl shadow-xl border border-stone-200 max-w-md w-full max-h-[90vh] overflow-y-auto"
              role="dialog"
              aria-modal="true"
              aria-labelledby="usuario-modal-title"
            >
              <div className="px-6 pt-6 pb-2">
                <h2
                  id="usuario-modal-title"
                  className="text-stone-900 leading-tight"
                  style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontSize: "20px" }}
                >
                  {editUserId ? "Editar usuario" : "Nuevo usuario"}
                </h2>
                <p className="text-xs text-stone-500 mt-1">Los permisos se configuran en &ldquo;Roles y Permisos&rdquo; abajo.</p>
              </div>

              <div className="px-6 py-5 space-y-4">
                <div>
                  <label className="text-[11px] font-medium text-stone-700 uppercase tracking-[0.08em] block mb-1.5">Nombre</label>
                  <input
                    value={uName}
                    onChange={e => setUName(e.target.value)}
                    placeholder="Nombre del usuario"
                    autoFocus
                    className="w-full bg-white border border-stone-200 rounded-md px-3 py-3 text-sm placeholder:text-stone-400 focus:outline-none focus:border-teal-700 transition"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-medium text-stone-700 uppercase tracking-[0.08em] block mb-1.5">
                    {editUserId ? "Nueva contraseña" : "Contraseña"}
                  </label>
                  <div className="relative">
                    <input
                      type={showModalPw ? "text" : "password"}
                      value={uPassword}
                      onChange={e => setUPassword(e.target.value)}
                      placeholder={editUserId ? "Dejar vacío para no cambiar" : "Mínimo 3 caracteres"}
                      className="w-full bg-white border border-stone-200 rounded-md px-3 py-3 pr-10 text-sm font-mono placeholder:text-stone-400 placeholder:font-sans focus:outline-none focus:border-teal-700 transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowModalPw(s => !s)}
                      title={showModalPw ? "Ocultar" : "Ver"}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 p-1.5 rounded transition"
                    >
                      {showModalPw ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-medium text-stone-700 uppercase tracking-[0.08em] block mb-1.5">Rol</label>
                  <select
                    value={uRole}
                    onChange={e => setURole(e.target.value)}
                    className="w-full bg-white border border-stone-200 rounded-md px-3 py-3 text-sm focus:outline-none focus:border-teal-700 transition"
                  >
                    <option value="admin">Admin — acceso total</option>
                    <option value="director">Director — lectura y reportes</option>
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
                  <label className="text-[11px] font-medium text-stone-700 uppercase tracking-[0.08em] block mb-1.5">
                    Empresa <span className="font-normal text-stone-400 normal-case">(opcional)</span>
                  </label>
                  <input
                    value={uCompany}
                    onChange={e => setUCompany(e.target.value)}
                    placeholder="Vistana, Fashion Wear, etc."
                    className="w-full bg-white border border-stone-200 rounded-md px-3 py-3 text-sm placeholder:text-stone-400 focus:outline-none focus:border-teal-700 transition"
                  />
                </div>
              </div>

              <div className="px-6 py-4 border-t border-stone-100 flex justify-end gap-2">
                <button
                  onClick={() => setShowUserModal(false)}
                  className="px-4 py-2 text-sm text-stone-600 hover:bg-stone-100 rounded-md transition"
                >
                  Cancelar
                </button>
                <button
                  onClick={saveUser}
                  disabled={savingUser}
                  className="px-5 py-2 bg-teal-700 text-white text-sm font-medium rounded-md hover:bg-teal-800 transition disabled:opacity-50"
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

            // Cuenta sesiones activas por usuario (sobre el set total, no el filtrado, para que
            // el boton 'revocar todas' siempre revoque TODAS las activas del user).
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
                    <h2 className="text-[11px] font-medium uppercase tracking-[0.12em] text-stone-500">Sesiones activas</h2>
                    <span className="text-xs text-stone-400">{active.length} {active.length === 1 ? "sesión" : "sesiones"}</span>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`text-stone-400 transition-transform ${sessionsOpen ? "rotate-180" : ""}`}>
                    <polyline points="6 9 12 15 18 9"/>
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
                      <button onClick={loadSessions} className="text-xs text-stone-400 hover:text-stone-700 transition">Actualizar</button>
                    </div>

                    {loadingSessions ? (
                      <SkeletonTable rows={3} cols={5} />
                    ) : filtered.length === 0 ? (
                      <p className="text-sm text-stone-500 py-4 text-center">No hay sesiones en este rango.</p>
                    ) : (
                      <div className="border border-stone-200 bg-white rounded-lg divide-y divide-stone-100">
                        {filtered.map(s => {
                          const userTotal = countByUser[s.user_name] || 0;
                          const showRevokeAll = userTotal >= 2;
                          return (
                            <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                              <Avatar name={s.user_name} role={s.user_role} size="sm" />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-medium text-stone-900 truncate">{s.user_name}</span>
                                  <span className="text-[11px] text-stone-400 capitalize">{s.user_role}</span>
                                </div>
                                <div className="text-[11px] text-stone-500 mt-0.5 flex items-center gap-2 flex-wrap">
                                  <span title={new Date(s.last_seen).toLocaleString("es-PA")}>{relativeTime(s.last_seen)}</span>
                                  {s.ip_address && (
                                    <>
                                      <span className="text-stone-300">·</span>
                                      <span className="font-mono text-[10px]">{s.ip_address}</span>
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
                                    className="text-[11px] text-stone-500 hover:text-red-600 px-2 py-1 transition disabled:opacity-50"
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

        <hr className="mb-8 border-stone-200" />

        <section>
          <h2 className="text-[11px] font-medium uppercase tracking-[0.12em] text-stone-500 mb-2">Roles y Permisos</h2>
          <p className="text-xs text-stone-500 mb-6">Configura qué módulos puede ver cada rol del sistema. Los cambios afectan a todos los usuarios con ese rol.</p>

          {loading ? (
            <div className="py-20 flex justify-center"><svg className="animate-spin h-6 w-6 text-stone-300" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg></div>
          ) : (
            <div className="space-y-3">
              {roles.map((r) => {
                const isExpanded = expandedRole === r.role;
                const isAdmin = r.role === "admin";
                const allChecked = MODULES.every(m => r.modulos.includes(m.key));
                return (
                  <div key={r.role} className="border border-stone-200 bg-white rounded-lg overflow-hidden transition">
                    <button
                      onClick={() => setExpandedRole(isExpanded ? null : r.role)}
                      className="w-full flex items-center justify-between px-4 sm:px-5 py-4 hover:bg-stone-50 transition text-left"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar name={r.label} role={r.role} size="md" />
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-stone-900 truncate">{r.label}</div>
                          <div className="text-xs text-stone-500">Rol: {r.role}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs text-stone-500 tabular-nums">{r.modulos.length} módulo{r.modulos.length !== 1 ? "s" : ""}</span>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`text-stone-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}>
                          <polyline points="6 9 12 15 18 9"/>
                        </svg>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-4 sm:px-5 pb-5 border-t border-stone-100">
                        {isAdmin ? (
                          <div className="mt-4 bg-stone-50 border border-teal-100 rounded-lg px-4 py-3 flex items-start gap-3">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-teal-700 shrink-0 mt-0.5">
                              <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                            </svg>
                            <p className="text-sm text-stone-700 leading-relaxed">
                              El rol <strong className="font-medium text-stone-900">Administrador</strong> tiene acceso completo a todos los módulos del sistema. Esta configuración no se puede modificar.
                            </p>
                          </div>
                        ) : (
                          <>
                            <div className="mt-4 mb-3 flex items-center justify-between">
                              <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-stone-500">Módulos con acceso</span>
                              <button
                                onClick={() => selectAll(r.role)}
                                className="text-[11px] text-stone-500 hover:text-teal-700 underline-offset-2 hover:underline transition"
                              >
                                {allChecked ? "Desmarcar todos" : "Marcar todos"}
                              </button>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                              {MODULES.map((mod) => {
                                const checked = r.modulos.includes(mod.key);
                                const disabled = saving === r.role;
                                return (
                                  <label
                                    key={mod.key}
                                    className={`flex items-center gap-2.5 px-3 py-2 rounded-md border transition cursor-pointer ${
                                      disabled
                                        ? "opacity-60 cursor-not-allowed border-stone-200"
                                        : checked
                                          ? "bg-teal-50 border-teal-200"
                                          : "border-stone-200 hover:bg-stone-50"
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      disabled={disabled}
                                      onChange={() => toggleModule(r.role, mod.key)}
                                      className="accent-teal-700 w-4 h-4"
                                    />
                                    <span className="text-sm text-stone-800">{mod.label}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
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
