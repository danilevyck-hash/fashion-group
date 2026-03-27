"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";

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
  { key: "catalogo_reebok", label: "Catálogo Reebok" },
];

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  director: "Director",
  contabilidad: "Contabilidad",
  david: "David",
  upload: "Secretaria",
  vendedor: "Vendedor",
  cliente: "Cliente",
};

export default function UsuariosPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [roles, setRoles] = useState<RolePermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [expandedRole, setExpandedRole] = useState<string | null>(null);

  // Danger zone
  const [showDeactivate, setShowDeactivate] = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  useEffect(() => {
    const r = sessionStorage.getItem("cxc_role") || "";
    if (r !== "admin") { router.push("/plantillas"); return; }
    setAuthChecked(true);
  }, [router]);

  const loadRoles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/usuarios");
      if (res.ok) setRoles(await res.json());
    } catch { /* */ }
    setLoading(false);
  }, []);

  useEffect(() => { if (authChecked) loadRoles(); }, [authChecked, loadRoles]);

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
    } catch { showToast("Error de conexión"); }
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
    } catch { showToast("Error de conexión"); }
    setSaving(null);
    setShowDeactivate(null);
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
          <button onClick={() => router.push("/plantillas")} className="border border-gray-200 px-4 py-2 rounded-full text-sm hover:border-gray-400 transition">Volver</button>
        </div>

        {/* Info banner */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-6 text-xs text-blue-700">
          <strong>Sistema de autenticación:</strong> cada rol tiene una contraseña compartida configurada en variables de entorno (.env.local). Para agregar un nuevo usuario, comparte la contraseña del rol correspondiente. Los módulos marcados determinan qué puede ver cada rol.
        </div>

        {loading ? (
          <div className="text-center py-20 text-gray-400 text-sm">Cargando...</div>
        ) : (
          <div className="space-y-4">
            {roles.map((r) => {
              const isExpanded = expandedRole === r.role;
              const isAdmin = r.role === "admin";
              return (
                <div key={r.role} className={`border rounded-2xl overflow-hidden transition ${!r.activo ? "opacity-50 border-gray-200" : "border-gray-200"}`}>
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
                        r.role === "david" ? "bg-purple-600" :
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
                    <div className="px-5 pb-5 border-t border-gray-100">
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

                      {/* Password hint */}
                      <div className="mt-4 bg-gray-50 rounded-lg px-3 py-2">
                        <span className="text-xs text-gray-500">Contraseña configurada en: <code className="bg-gray-200 px-1 py-0.5 rounded text-[10px]">{
                          r.role === "admin" ? "ADMIN_PASSWORD" :
                          r.role === "director" ? "DIRECTOR_PASSWORD" :
                          r.role === "contabilidad" ? "CONTABILIDAD_PASSWORD" :
                          r.role === "david" ? "DAVID_PASSWORD" :
                          "UPLOAD_PASSWORD"
                        }</code></span>
                      </div>

                      {/* Danger zone — deactivate (not for admin) */}
                      {!isAdmin && (
                        <div className="mt-4 border border-red-200 bg-red-50/50 rounded-xl px-4 py-3">
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

      {/* Deactivate confirmation modal */}
      {showDeactivate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4">
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

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-black text-white px-5 py-2.5 rounded-full text-sm z-50 shadow-lg flex items-center gap-2"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          {toast}
        </div>
      )}
    </div>
  );
}
