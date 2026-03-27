"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import FGLogo from "@/components/FGLogo";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";

const ALL_MODULES = [
  { key: "cxc", label: "CXC", subtitle: "Cuentas por cobrar", icon: "📊", href: "/admin", roles: ["admin", "director", "vendedor", "david"] },
  { key: "upload", label: "Cargar CSV", subtitle: "Antigüedad de deuda", icon: "📤", href: "/upload", roles: ["admin", "upload"] },
  { key: "guias", label: "Guías", subtitle: "Transporte y despacho", icon: "🚚", href: "/guias", roles: ["admin", "upload", "david"] },
  { key: "caja", label: "Caja Menuda", subtitle: "Control de gastos", icon: "💵", href: "/caja", roles: ["admin", "upload"] },
  { key: "directorio", label: "Directorio", subtitle: "Clientes y contactos", icon: "📋", href: "/directorio", roles: ["admin", "upload", "vendedor"] },
  { key: "cheques", label: "Cheques", subtitle: "Posfechados", icon: "🏦", href: "/cheques", roles: ["admin", "upload"] },
  { key: "prestamos", label: "Préstamos", subtitle: "Colaboradores", icon: "🤝", href: "/prestamos", roles: ["admin", "contabilidad"] },
  { key: "reclamos", label: "Reclamos", subtitle: "Seguimiento", icon: "📝", href: "/reclamos", roles: ["admin", "upload"] },
  { key: "ventas", label: "Ventas", subtitle: "Mensuales", icon: "📈", href: "/ventas", roles: ["admin", "director", "contabilidad"] },
  { key: "reebok", label: "Catálogo Reebok", subtitle: "Productos y pedidos", icon: "👟", href: "/catalogo/reebok", roles: ["admin", "vendedor", "cliente"] },
  { key: "usuarios", label: "Usuarios", subtitle: "Permisos y accesos", icon: "👥", href: "/admin/usuarios", roles: ["admin"] },
];

function getGreeting() {
  const h = new Date().getHours();
  if (h >= 6 && h < 12) return "Buenos días";
  if (h >= 12 && h < 19) return "Buenas tardes";
  return "Buenas noches";
}

function getDateLabel() {
  const d = new Date();
  const dias = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
  const meses = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  return `${dias[d.getDay()]}, ${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
}

export default function PlantillasPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [role, setRole] = useState("");
  const [userName, setUserName] = useState("");
  const [userId, setUserId] = useState("");
  const [fgModules, setFgModules] = useState<string[] | null>(null);
  const [moduleOrder, setModuleOrder] = useState<string[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const r = sessionStorage.getItem("cxc_role") || "";
    if (!r) { router.push("/"); return; }
    if (r === "cliente") { router.push("/catalogo/reebok"); return; }
    setRole(r);
    setUserName(sessionStorage.getItem("fg_user_name") || "");
    setUserId(sessionStorage.getItem("fg_user_id") || "");
    setDarkMode(localStorage.getItem("fg_dark_mode") === "1");

    // Load modules from new system
    try {
      const mods = sessionStorage.getItem("fg_modules");
      if (mods) setFgModules(JSON.parse(mods));
    } catch { /* */ }

    setAuthChecked(true);
  }, [router]);

  // Load saved module order
  const loadOrder = useCallback(async () => {
    const uid = sessionStorage.getItem("fg_user_id");
    if (uid) {
      try {
        const res = await fetch(`/api/user/module-order?userId=${uid}`);
        if (res.ok) {
          const data = await res.json();
          if (data.module_order?.length) setModuleOrder(data.module_order);
        }
      } catch { /* */ }
    } else {
      // Legacy: load from localStorage
      const r = sessionStorage.getItem("cxc_role") || "";
      try {
        const saved = localStorage.getItem(`module_order_${r}`);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) setModuleOrder(parsed);
        }
      } catch { /* */ }
    }
  }, []);

  useEffect(() => { if (authChecked) loadOrder(); }, [authChecked, loadOrder]);

  if (!authChecked) return null;

  // Determine visible modules
  const isAdmin = role === "admin";
  const visibleKeys = new Set<string>();

  if (isAdmin) {
    ALL_MODULES.forEach(m => visibleKeys.add(m.key));
  } else if (fgModules) {
    // New system: use fg_modules from session
    fgModules.forEach(k => visibleKeys.add(k));
  } else {
    // Legacy: use role-based defaults
    ALL_MODULES.forEach(m => { if (m.roles.includes(role)) visibleKeys.add(m.key); });
  }

  // Build ordered list
  const orderedKeys = [...moduleOrder.filter(k => visibleKeys.has(k))];
  visibleKeys.forEach(k => { if (!orderedKeys.includes(k)) orderedKeys.push(k); });
  const visibleModules = orderedKeys.map(k => ALL_MODULES.find(m => m.key === k)!).filter(Boolean);

  // Drag end
  function onDragEnd(result: DropResult) {
    if (!result.destination) return;
    const items = [...orderedKeys];
    const [moved] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, moved);
    setModuleOrder(items);
  }

  async function saveOrder() {
    setEditMode(false);
    if (userId) {
      await fetch("/api/user/module-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, moduleOrder }),
      });
    } else {
      localStorage.setItem(`module_order_${role}`, JSON.stringify(moduleOrder));
    }
  }

  const displayName = userName || (role === "admin" ? "Daniel" : role === "director" ? "Director" : role);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
      {/* Header */}
      <div className="flex items-end justify-between mb-8">
        <div>
          <FGLogo variant="horizontal" theme="light" size={36} />
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => { const next = !darkMode; setDarkMode(next); if (next) { document.documentElement.classList.add("dark"); localStorage.setItem("fg_dark_mode", "1"); } else { document.documentElement.classList.remove("dark"); localStorage.setItem("fg_dark_mode", "0"); } }} className="text-sm text-gray-400 hover:text-black transition px-1">{darkMode ? "☀" : "◑"}</button>
          <button onClick={() => { sessionStorage.clear(); router.push("/"); }} className="text-sm text-gray-400 hover:text-black transition">Salir</button>
        </div>
      </div>

      {/* Greeting */}
      <div className="mb-8">
        <h1 className="text-2xl font-light text-gray-800">{getGreeting()}, {displayName}</h1>
        <p className="text-sm text-gray-400 mt-1">{getDateLabel()}</p>
      </div>

      {/* Edit toggle */}
      <div className="flex justify-end mb-3">
        {editMode ? (
          <button onClick={saveOrder} className="text-xs bg-black text-white px-4 py-1.5 rounded-full hover:bg-gray-800 transition">Guardar orden</button>
        ) : (
          <button onClick={() => setEditMode(true)} className="text-xs text-gray-400 hover:text-black transition flex items-center gap-1">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
            Editar orden
          </button>
        )}
      </div>

      {/* Module grid */}
      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="modules" direction="vertical">
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {visibleModules.map((mod, index) => (
                <Draggable key={mod.key} draggableId={mod.key} index={index} isDragDisabled={!editMode}>
                  {(prov, snapshot) => (
                    <div
                      ref={prov.innerRef}
                      {...prov.draggableProps}
                      {...(editMode ? prov.dragHandleProps : {})}
                      onClick={() => { if (!editMode) router.push(mod.href); }}
                      className={`relative border rounded-2xl p-4 transition cursor-pointer select-none ${
                        snapshot.isDragging ? "shadow-lg border-gray-300 bg-white z-50" : "border-gray-100 hover:border-gray-300 hover:shadow-sm bg-white"
                      } ${editMode ? "cursor-grab active:cursor-grabbing" : ""}`}
                    >
                      {editMode && (
                        <span className="absolute top-2 right-2 text-gray-300 text-xs">⠿</span>
                      )}
                      <div className="text-2xl mb-2">{mod.icon}</div>
                      <div className="text-sm font-medium">{mod.label}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{mod.subtitle}</div>
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </div>
  );
}
