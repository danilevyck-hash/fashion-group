"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import { Toast, SkeletonTable, EmptyState, ConfirmModal } from "@/components/ui";
import XLSX from "xlsx-js-style";

interface RolePermission {
  role: string;
  label: string;
  modulos: string[];
  activo: boolean;
}

const MODULES = [
  { key: "cxc", label: "CXC (Cuentas por Cobrar)" },
  { key: "guias", label: "Guías de Transporte" },
  { key: "caja", label: "Caja Menuda" },
  { key: "directorio", label: "Directorio de Clientes" },
  { key: "reclamos", label: "Reclamos a Proveedores" },
  { key: "prestamos", label: "Préstamos a Colaboradores" },
  { key: "ventas", label: "Ventas Mensuales" },
  { key: "cheques", label: "Cheques Posfechados" },
  { key: "upload", label: "Carga de Archivos" },
  { key: "reebok", label: "Catálogo Reebok" },
  { key: "camisetas", label: "Camisetas Selección" },
];

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  director: "Director",
  contabilidad: "Contabilidad",
  upload: "Secretaria",
  vendedor: "Vendedor",
  bodega: "Bodega",
  secretaria: "Secretaria",
  cliente: "Cliente",
};

export default function UsuariosPage() {
  const router = useRouter();
  const { authChecked } = useAuth({ moduleKey: "admin", allowedRoles: ["admin"] });
  const [roles, setRoles] = useState<RolePermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [expandedRole, setExpandedRole] = useState<string | null>(null);

  // Danger zone
  const [showDeactivate, setShowDeactivate] = useState<string | null>(null);

  // Sessions
  interface Session { id: string; user_name: string; user_role: string; ip_address: string | null; last_seen: string; created_at: string; revoked: boolean; }
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [revokingSession, setRevokingSession] = useState<string | null>(null);

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

  // Password management
  const [passwords, setPasswords] = useState<Record<string, { password: string; updated_at: string }>>({});
  const [showPwModal, setShowPwModal] = useState<string | null>(null);
  const [newPw, setNewPw] = useState("");
  const [showPw, setShowPw] = useState<Record<string, boolean>>({});
  const [savingPw, setSavingPw] = useState(false);

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

  const loadPasswords = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/passwords");
      if (res.ok) {
        const data = await res.json();
        const map: Record<string, { password: string; updated_at: string }> = {};
        (data || []).forEach((p: { role: string; password: string; updated_at: string }) => { map[p.role] = p; });
        setPasswords(map);
      }
    } catch { showToast("Error al cargar contraseñas"); }
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

  useEffect(() => { if (authChecked) { loadRoles(); loadPasswords(); loadFgUsers(); loadSessions(); } }, [authChecked, loadRoles, loadPasswords, loadFgUsers, loadSessions]);

  if (!authChecked) return null;

  async function toggleModule(role: string, moduleKey: string) {
    const roleData = roles.find(r => r.role === role);
    if (!roleData) return;

    const newModulos = roleData.modulos.includes(moduleKey)
      ? roleData.modulos.filter(m => m !== moduleKey)
      : [...roleData.modulos, moduleKey];

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

  async function toggleActivo(role: string) {
    const roleData = roles.find(r => r.role === role);
    if (!roleData) return;

    const newActivo = !roleData.activo;
    setSaving(role);
    try {
      const res = await fetch("/api/admin/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, modulos: roleData.modulos, activo: newActivo }),
      });
      if (res.ok) {
        setRoles(prev => prev.map(r => r.role === role ? { ...r, activo: newActivo } : r));
        showToast(newActivo ? "Rol reactivado" : "Rol desactivado");
      } else {
        showToast("Error al guardar");
      }
    } catch { showToast("Sin conexión. Verifica tu internet e intenta de nuevo."); }
    setSaving(null);
    setShowDeactivate(null);
  }

  async function savePassword(role: string) {
    if (!newPw.trim()) { showToast("La contraseña no puede estar vacía"); return; }
    setSavingPw(true);
    try {
      const res = await fetch("/api/admin/passwords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, password: newPw.trim() }),
      });
      if (res.ok) {
        setPasswords(prev => ({ ...prev, [role]: { password: newPw.trim(), updated_at: new Date().toISOString() } }));
        showToast("Contraseña actualizada");
        setShowPwModal(null); setNewPw("");
      } else { showToast("Error al guardar"); }
    } catch { showToast("Sin conexión. Verifica tu internet e intenta de nuevo."); }
    setSavingPw(false);
  }

  function exportUsersExcel() {
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
    setEditUserId(u.id); setUName(u.name); setUPassword(u.password); setURole(u.role); setUCompany(u.associated_company || "");
    setShowUserModal(true);
  }
  async function saveUser() {
    if (!uName.trim() || !uPassword.trim()) { showToast("Nombre y contraseña requeridos"); return; }
    setSavingUser(true);
    try {
      const body = { id: editUserId, name: uName.trim(), password: uPassword.trim(), role: uRole, associated_company: uCompany || null };
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
  // Helper: get modules for a role from loaded roles data
  function getModulesForRole(roleName: string): string[] {
    const r = roles.find(r => r.role === roleName);
    return r ? r.modulos : [];
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
    <div className="min-h-screen bg-white">
      <AppHeader
        module="Admin"
        breadcrumbs={[{ label: "Usuarios y Permisos" }]}
      />

      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold">Usuarios y Permisos</h1>
            <p className="text-sm text-gray-400 mt-1">Control de acceso por rol — cada rol usa una contraseña compartida</p>
          </div>
          <button onClick={() => router.push("/home")} className="border border-gray-200 px-4 py-2 rounded-md text-sm hover:border-gray-400 transition">Volver</button>
        </div>

        {/* ══ NEW: fg_users section ══ */}
        <div className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-medium uppercase tracking-wide text-gray-400">Usuarios del Sistema</h2>
            </div>
            <div className="flex gap-2">
              <button onClick={exportUsersExcel} className="text-sm border border-gray-200 px-4 py-2 rounded-md hover:border-gray-400 transition">{"\u2193"} Excel</button>
              <button onClick={openNewUser} className="text-sm bg-black text-white px-4 py-2 rounded-md hover:bg-gray-800 transition">+ Nuevo Usuario</button>
            </div>
          </div>
          {loadingUsers ? (
            <SkeletonTable rows={3} cols={4} />
          ) : fgUsers.length === 0 ? (
            <EmptyState title="No hay usuarios" subtitle="Crea el primer usuario del sistema" actionLabel="+ Nuevo Usuario" onAction={openNewUser} />
          ) : (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto -mx-4 sm:mx-0"><div className="min-w-[600px] px-4 sm:px-0">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white z-10">
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-2.5 text-[11px] uppercase text-gray-400 font-normal">Nombre</th>
                    <th className="text-left px-4 py-2.5 text-[11px] uppercase text-gray-400 font-normal">Rol</th>
                    <th className="text-left px-4 py-2.5 text-[11px] uppercase text-gray-400 font-normal hidden sm:table-cell">Empresa</th>
                    <th className="text-left px-4 py-2.5 text-[11px] uppercase text-gray-400 font-normal hidden sm:table-cell">Contraseña</th>
                    <th className="text-left px-4 py-2.5 text-[11px] uppercase text-gray-400 font-normal">Estado</th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {fgUsers.map(u => (
                    <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium">{u.name}</td>
                      <td className="px-4 py-3 text-gray-500">{u.role}</td>
                      <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">{u.associated_company || "—"}</td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className="font-mono text-xs">{showUserPw[u.id] ? u.password : "••••••"}</span>
                        <button onClick={() => setShowUserPw(p => ({ ...p, [u.id]: !p[u.id] }))} className="text-[10px] text-gray-400 hover:text-gray-600 ml-1 min-w-[44px] min-h-[44px] inline-flex items-center justify-center">{showUserPw[u.id] ? "ocultar" : "ver"}</button>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[11px] px-2 py-0.5 rounded-full ${u.active ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>{u.active ? "Activo" : "Inactivo"}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => openEditUser(u)} className="text-xs text-blue-600 hover:underline mr-2 py-2.5 sm:py-1.5 px-1">Editar</button>
                        <button onClick={() => setDeactivateTarget({id: u.id, name: u.name, active: u.active})} className="text-xs text-gray-400 hover:text-black py-2.5 sm:py-1.5 px-1">{u.active ? "Desactivar" : "Activar"}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div></div>
            </div>
          )}
        </div>

        {/* ══ User modal ══ */}
        {showUserModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
              <h2 className="font-medium mb-4">{editUserId ? "Editar Usuario" : "Nuevo Usuario"}</h2>
              <div className="space-y-3">
                <div>
                  <label className="text-[11px] text-gray-400 uppercase block mb-1">Nombre *</label>
                  <input value={uName} onChange={e => setUName(e.target.value)} className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition" />
                </div>
                <div>
                  <label className="text-[11px] text-gray-400 uppercase block mb-1">Contraseña *</label>
                  <input value={uPassword} onChange={e => setUPassword(e.target.value)} className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition font-mono" />
                </div>
                <div>
                  <label className="text-[11px] text-gray-400 uppercase block mb-1">Rol</label>
                  <select value={uRole} onChange={e => setURole(e.target.value)} className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition bg-transparent">
                    <option value="admin">admin — Acceso total</option>
                    <option value="director">director — Lectura y reportes</option>
                    <option value="secretaria">secretaria — Operaciones diarias</option>
                    <option value="vendedor">vendedor — Catálogo y CXC</option>
                    <option value="contabilidad">contabilidad — Préstamos y ventas</option>
                    <option value="bodega">bodega — Despacho de guías</option>
                    <option value="cliente">cliente — Catálogo Reebok</option>
                  </select>
                  {editUserId === currentUserId && uRole !== "admin" && (
                    <p className="text-xs text-amber-600 mt-1">¡Cuidado! Cambiar tu propio rol te quitará acceso de administrador.</p>
                  )}
                </div>
                <div>
                  <label className="text-[11px] text-gray-400 uppercase block mb-1">Empresa (opcional)</label>
                  <input value={uCompany} onChange={e => setUCompany(e.target.value)} className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition" />
                </div>
                <div>
                  <label className="text-[11px] text-gray-400 uppercase block mb-1">Módulos del rol {ROLE_LABELS[uRole] || uRole}</label>
                  <div className="grid grid-cols-2 gap-1 mt-1">
                    {MODULES.map(m => {
                      const has = uRole === "admin" || getModulesForRole(uRole).includes(m.key);
                      return (
                        <div key={m.key} className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs ${has ? "bg-green-50 text-green-700" : "text-gray-300"}`}>
                          <span className={`w-3.5 h-3.5 rounded flex items-center justify-center text-[10px] ${has ? "bg-green-600 text-white" : "bg-gray-100"}`}>
                            {has ? "✓" : ""}
                          </span>
                          {m.label}
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-gray-400 mt-2">Los módulos se configuran en Roles y Permisos</p>
                </div>
              </div>
              <div className="flex gap-2 mt-6">
                <button onClick={() => setShowUserModal(false)} className="flex-1 py-2 border border-gray-200 rounded-full text-sm hover:border-gray-400 transition">Cancelar</button>
                <button onClick={saveUser} disabled={savingUser} className="flex-1 py-2 bg-black text-white rounded-full text-sm hover:bg-gray-800 transition disabled:opacity-50">
                  {savingUser ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══ SESSIONS section ══ */}
        <div className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-medium uppercase tracking-wide text-gray-400">Sesiones Activas</h2>
              <p className="text-xs text-gray-400 mt-0.5">Sesiones con acceso al sistema — revoca para cerrar sesión remotamente</p>
            </div>
            <button onClick={loadSessions} className="text-xs text-gray-400 hover:text-black transition">Actualizar</button>
          </div>
          {loadingSessions ? (
            <SkeletonTable rows={3} cols={5} />
          ) : (() => {
            const active = sessions.filter(s => !s.revoked);
            if (active.length === 0) return <p className="text-sm text-gray-400 py-4">No hay sesiones activas</p>;

            // Group by user for "revoke all" button
            const userNames = [...new Set(active.map(s => s.user_name))];

            return (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                {userNames.length > 1 && (
                  <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex gap-2 flex-wrap">
                    {userNames.map(name => {
                      const count = active.filter(s => s.user_name === name).length;
                      return (
                        <button key={name} onClick={() => revokeAllSessions(name)} disabled={revokingSession === name}
                          className="text-[11px] bg-red-50 text-red-600 px-2.5 py-1 rounded-full hover:bg-red-100 transition disabled:opacity-50">
                          Revocar todas de {name} ({count})
                        </button>
                      );
                    })}
                  </div>
                )}
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-4 py-2.5 text-[11px] uppercase text-gray-400 font-normal">Usuario</th>
                      <th className="text-left px-4 py-2.5 text-[11px] uppercase text-gray-400 font-normal">Rol</th>
                      <th className="text-left px-4 py-2.5 text-[11px] uppercase text-gray-400 font-normal">IP</th>
                      <th className="text-left px-4 py-2.5 text-[11px] uppercase text-gray-400 font-normal">Último acceso</th>
                      <th className="text-left px-4 py-2.5 text-[11px] uppercase text-gray-400 font-normal">Creada</th>
                      <th className="px-4 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {active.map(s => (
                      <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-medium">{s.user_name}</td>
                        <td className="px-4 py-3 text-gray-500">{s.user_role}</td>
                        <td className="px-4 py-3 text-gray-400 font-mono text-xs">{s.ip_address || "—"}</td>
                        <td className="px-4 py-3 text-gray-400 text-xs">{new Date(s.last_seen).toLocaleString("es-PA")}</td>
                        <td className="px-4 py-3 text-gray-400 text-xs">{new Date(s.created_at).toLocaleString("es-PA")}</td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => revokeSession(s.id)} disabled={revokingSession === s.id}
                            className="text-xs text-red-600 hover:underline disabled:opacity-50">
                            {revokingSession === s.id ? "Revocando..." : "Revocar"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </div>

        <hr className="mb-8 border-gray-200" />

        <h2 className="text-sm font-medium uppercase tracking-wide text-gray-400 mb-4">Roles y Permisos</h2>
        <p className="text-xs text-gray-400 mb-1">Los módulos configurados aquí determinan el acceso de todos los usuarios con ese rol.</p>
        <p className="text-xs text-gray-400 mt-1 mb-6">Las contraseñas de rol son compartidas por todos los usuarios del mismo rol. Las contraseñas de usuario (arriba) son individuales y tienen prioridad al iniciar sesión.</p>

        {loading ? (
          <div className="py-20 flex justify-center"><svg className="animate-spin h-6 w-6 text-gray-300" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg></div>
        ) : (
          <div className="space-y-4">
            {roles.map((r) => {
              const isExpanded = expandedRole === r.role;
              const isAdmin = r.role === "admin";
              return (
                <div key={r.role} className={`border rounded-lg overflow-hidden transition ${!r.activo ? "opacity-50 border-gray-200" : "border-gray-200"}`}>
                  {/* Role header */}
                  <button
                    onClick={() => setExpandedRole(isExpanded ? null : r.role)}
                    className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium ${
                        r.role === "admin" ? "bg-black" :
                        r.role === "director" ? "bg-gray-700" :
                        r.role === "contabilidad" ? "bg-blue-600" :
                        r.role === "vendedor" ? "bg-emerald-600" :
                        r.role === "cliente" ? "bg-orange-500" :
                        "bg-gray-400"
                      }`}>
                        {r.label[0]}
                      </div>
                      <div>
                        <div className="text-sm font-medium">{r.label}</div>
                        <div className="text-xs text-gray-400">Rol: {r.role}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {!r.activo && <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full">Desactivado</span>}
                      <span className="text-xs text-gray-400">{r.modulos.length} módulo{r.modulos.length !== 1 ? "s" : ""}</span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}><polyline points="6 9 12 15 18 9"/></svg>
                    </div>
                  </button>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="px-5 pb-5 border-t border-gray-200">
                      {/* Module checkboxes */}
                      <div className="mt-4 mb-2 flex items-center justify-between">
                        <span className="text-xs text-gray-400 uppercase tracking-wide">Módulos con acceso</span>
                        {!isAdmin && (
                          <button onClick={() => selectAll(r.role)} className="text-xs text-blue-600 hover:underline">
                            {MODULES.every(m => r.modulos.includes(m.key)) ? "Desmarcar todos" : "Seleccionar todos"}
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {MODULES.map((mod) => {
                          const checked = r.modulos.includes(mod.key);
                          const disabled = isAdmin || saving === r.role;
                          return (
                            <label key={mod.key} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition ${
                              disabled ? "opacity-60 cursor-not-allowed" : checked ? "bg-green-50" : "hover:bg-gray-50"
                            }`}>
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={disabled}
                                onChange={() => toggleModule(r.role, mod.key)}
                                className="accent-black w-4 h-4"
                              />
                              <span className="text-sm">{mod.label}</span>
                            </label>
                          );
                        })}
                      </div>
                      {isAdmin && (
                        <p className="text-xs text-gray-400 mt-2">El rol admin siempre tiene acceso a todos los módulos</p>
                      )}

                      {/* Password management */}
                      <div className="mt-4 bg-gray-50 rounded-lg px-3 py-2.5 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">Contraseña:</span>
                          {passwords[r.role] ? (
                            <span className="text-xs font-mono bg-gray-200 px-1.5 py-0.5 rounded">
                              {showPw[r.role] ? passwords[r.role].password : "••••••••"}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400 italic">Solo en env var</span>
                          )}
                          {passwords[r.role] && (
                            <button onClick={() => setShowPw(prev => ({ ...prev, [r.role]: !prev[r.role] }))} className="text-[10px] text-gray-400 hover:text-gray-600 min-w-[44px] min-h-[44px] inline-flex items-center justify-center">
                              {showPw[r.role] ? "ocultar" : "ver"}
                            </button>
                          )}
                        </div>
                        <button onClick={() => { setShowPwModal(r.role); setNewPw(passwords[r.role]?.password || ""); }} className="text-xs text-blue-600 hover:underline">
                          {passwords[r.role] ? "Cambiar" : "Configurar"}
                        </button>
                      </div>

                      {/* Danger zone — deactivate (not for admin) */}
                      {!isAdmin && (
                        <div className="mt-4 border border-red-200 bg-red-50/50 rounded-lg px-4 py-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-xs font-medium text-red-700">{r.activo ? "Desactivar Rol" : "Reactivar Rol"}</div>
                              <div className="text-[10px] text-red-400">{r.activo ? "La contraseña dejará de funcionar" : "Reactivar acceso para este rol"}</div>
                            </div>
                            <button
                              onClick={() => r.activo ? setShowDeactivate(r.role) : toggleActivo(r.role)}
                              className={`px-3 py-1.5 text-xs rounded-full transition ${r.activo ? "bg-red-600 text-white hover:bg-red-700" : "bg-green-600 text-white hover:bg-green-700"}`}
                            >
                              {r.activo ? "Desactivar" : "Reactivar"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

      </div>

      {/* Password modal */}
      {showPwModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4">
            <h2 className="font-medium mb-4">Contraseña — {ROLE_LABELS[showPwModal] || showPwModal}</h2>
            <div>
              <label className="text-[11px] text-gray-400 uppercase block mb-1">Nueva contraseña</label>
              <input type="text" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Ingresa la contraseña"
                className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition font-mono" autoFocus />
            </div>
            <div className="flex gap-2 mt-6">
              <button onClick={() => { setShowPwModal(null); setNewPw(""); }} className="flex-1 py-2 border border-gray-200 rounded-full text-sm hover:border-gray-400 transition">Cancelar</button>
              <button onClick={() => savePassword(showPwModal)} disabled={savingPw} className="flex-1 py-2 bg-black text-white rounded-full text-sm hover:bg-gray-800 transition disabled:opacity-50">
                {savingPw ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deactivate confirmation modal */}
      {showDeactivate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4">
            <h2 className="font-medium mb-2 text-red-700">Desactivar Rol</h2>
            <p className="text-sm text-gray-500 mb-4">
              ¿Desactivar el rol <strong>{ROLE_LABELS[showDeactivate] || showDeactivate}</strong>? Los usuarios con esta contraseña no podrán acceder al sistema.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setShowDeactivate(null)} className="flex-1 py-2 border border-gray-200 rounded-full text-sm hover:border-gray-400 transition">Cancelar</button>
              <button onClick={() => toggleActivo(showDeactivate)} className="flex-1 py-2 bg-red-600 text-white rounded-full text-sm hover:bg-red-700 transition">Desactivar</button>
            </div>
          </div>
        </div>
      )}

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

      <Toast message={toast} />
    </div>
  );
}
