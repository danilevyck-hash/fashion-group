"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import FGLogo from "@/components/FGLogo";
import SearchBar from "@/components/SearchBar";
import { getVisibleGroups, getVisibleModules } from "@/lib/modules";

function getGreeting() {
  const h = new Date().getHours();
  if (h >= 6 && h < 12) return "Buenos días";
  if (h >= 12 && h < 19) return "Buenas tardes";
  return "Buenas noches";
}

export default function HomePage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [role, setRole] = useState("");
  const [userName, setUserName] = useState("");
  const [fgModules, setFgModules] = useState<string[] | null>(null);
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const r = sessionStorage.getItem("cxc_role") || "";
    if (!r) { router.push("/"); return; }
    if (r === "cliente") { router.push("/catalogo/reebok"); return; }
    setRole(r);
    setUserName(sessionStorage.getItem("fg_user_name") || "");
    const isDark = localStorage.getItem("fg_dark_mode") === "1";
    setDarkMode(isDark);
    if (isDark) document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");

    try {
      const mods = sessionStorage.getItem("fg_modules");
      if (mods) setFgModules(JSON.parse(mods));
    } catch { /* ignore */ }

    setAuthChecked(true);
  }, [router]);

  // Auto-redirect si user tiene 1 solo modulo (ej: Bodega → Guías)
  useEffect(() => {
    if (!authChecked || !role) return;
    if (role === "admin" || role === "director") return;

    const visible = getVisibleModules(role, fgModules);
    if (visible.length === 1) {
      router.push(visible[0].href);
    }
  }, [authChecked, role, fgModules, router]);

  const visibleGroups = role ? getVisibleGroups(role, fgModules) : [];
  const displayName = userName || "";

  if (!authChecked) return null;

  return (
    <div className={`min-h-screen ${darkMode ? "bg-gray-950 text-gray-100" : "bg-white"}`}>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <FGLogo variant="horizontal" theme="light" size={30} />
            <span className={`text-lg font-light truncate max-w-[180px] sm:max-w-none ${darkMode ? "text-gray-100" : "text-gray-800"}`}>
              {getGreeting()}{displayName ? `, ${displayName}` : ""}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                const next = !darkMode;
                setDarkMode(next);
                if (next) { document.documentElement.classList.add("dark"); localStorage.setItem("fg_dark_mode", "1"); }
                else { document.documentElement.classList.remove("dark"); localStorage.setItem("fg_dark_mode", "0"); }
              }}
              className="text-sm text-gray-400 hover:text-black transition px-1"
            >
              {darkMode ? "☀" : "◑"}
            </button>
            <button
              onClick={() => { sessionStorage.clear(); router.push("/"); }}
              className="text-sm text-gray-400 hover:text-black transition"
            >
              Salir
            </button>
          </div>
        </div>

        {/* Global Search — admin, secretaria, director */}
        {["admin", "secretaria", "director"].includes(role) && (
          <SearchBar darkMode={darkMode} />
        )}

        {/* Group cards — 4 max, una por grupo visible */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          {visibleGroups.map((g) => {
            const Icon = g.icon;
            return (
              <button
                key={g.key}
                onClick={() => router.push(g.href)}
                className={`text-left rounded-lg p-5 sm:p-6 border transition-all duration-150 hover:shadow-sm ${
                  darkMode
                    ? "border-gray-800 bg-gray-900 hover:border-gray-600"
                    : "border-gray-200 bg-white hover:border-gray-400"
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className={`flex items-center justify-center w-12 h-12 rounded-lg shrink-0 ${
                    darkMode ? "bg-gray-800 text-gray-300" : "bg-gray-50 text-gray-700"
                  }`}>
                    <Icon size={22} strokeWidth={1.5} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className={`text-base font-semibold leading-tight ${darkMode ? "text-gray-100" : "text-gray-900"}`}>
                      {g.label}
                    </div>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={darkMode ? "text-gray-600" : "text-gray-300"}>
                    <path d="M9 18l6-6-6-6"/>
                  </svg>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
