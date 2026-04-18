"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import FGLogo from "@/components/FGLogo";
import { getVisibleModules } from "@/lib/modules";

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin", secretaria: "Secretaria", bodega: "Bodega",
  director: "Director", contabilidad: "Contabilidad", vendedor: "Vendedor", cliente: "Cliente",
};

// Rutas donde el Sidebar NO se renderiza (login + públicas).
const PUBLIC_PATH_PREFIXES = ["/catalogo-publico", "/pedido-reebok", "/pedido-joybees"];

export default function Sidebar() {
  const pathname = usePathname() || "";
  const router = useRouter();
  const [userRole, setUserRole] = useState("");
  const [userName, setUserName] = useState("");
  const [fgModules, setFgModules] = useState<string[] | null>(null);

  useEffect(() => {
    setUserRole(sessionStorage.getItem("cxc_role") || "");
    setUserName(sessionStorage.getItem("fg_user_name") || "");
    try {
      const mods = sessionStorage.getItem("fg_modules");
      if (mods) setFgModules(JSON.parse(mods));
    } catch { /* ignore */ }
  }, [pathname]);

  // Solo renderiza en rutas autenticadas (no login, no públicas).
  if (pathname === "/" || PUBLIC_PATH_PREFIXES.some(p => pathname.startsWith(p))) return null;
  if (!userRole) return null;

  const visibleModules = getVisibleModules(userRole, fgModules);

  function handleLogout() {
    fetch("/api/auth", { method: "DELETE" }).catch(() => {});
    sessionStorage.clear();
    router.push("/");
  }

  return (
    <aside className="hidden md:flex fixed left-0 top-0 h-screen w-56 bg-white border-r border-gray-200 flex-col z-20">
      <div className="px-5 py-4 border-b border-gray-200">
        <button onClick={() => router.push("/home")} className="flex items-center gap-2 hover:opacity-70 transition">
          <FGLogo variant="icon" theme="light" size={22} />
          <span className="text-sm font-medium text-gray-800">Fashion Group</span>
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto py-2">
        <button
          onClick={() => router.push("/home")}
          className={`w-full flex items-center gap-3 px-5 py-2.5 text-sm transition-all border-l-2 ${pathname === "/home" ? "bg-gray-50 text-black font-medium border-l-blue-500" : "text-gray-600 hover:bg-gray-50 border-l-transparent"}`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          Inicio
        </button>
        <div className="h-px bg-gray-100 my-1 mx-5" />
        {visibleModules.map((m) => {
          const active = pathname.startsWith(m.href) && m.href !== "/home";
          return (
            <button
              key={m.key}
              onClick={() => router.push(m.href)}
              className={`w-full flex items-center gap-3 px-5 py-2.5 text-sm transition-all border-l-2 ${active ? "bg-gray-50 text-black font-medium border-l-blue-500" : "text-gray-600 hover:bg-gray-50 border-l-transparent"}`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d={m.icon} />
              </svg>
              <span className="truncate">{m.label}</span>
            </button>
          );
        })}
      </nav>
      {userName && (
        <div className="border-t border-gray-200 px-5 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-xs font-medium flex-shrink-0">{userName[0]}</div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-gray-800 truncate">{userName}</div>
            <div className="text-[10px] text-gray-400">{ROLE_LABELS[userRole] || userRole}</div>
          </div>
          <button onClick={handleLogout} title="Cerrar sesión" className="text-gray-300 hover:text-red-500 transition p-1 flex-shrink-0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      )}
    </aside>
  );
}

/** Wrapper del main content: deja espacio para el Sidebar en desktop. */
export function SidebarAwareMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "";
  const isPublic = pathname === "/" || PUBLIC_PATH_PREFIXES.some(p => pathname.startsWith(p));
  return <div className={isPublic ? "" : "md:ml-56"}>{children}</div>;
}
