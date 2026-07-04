"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import FGLogo from "@/components/FGLogo";
import SearchBar from "@/components/SearchBar";
import { getVisibleGroups, getVisibleModules, getModulesInGroup, type AppModule } from "@/lib/modules";
import { recordModuleClick, getFrequentModules } from "@/lib/module-frequents";

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
  const [dhAlert, setDhAlert] = useState<{ critical: number; warning: number } | null>(null);
  const [dhDismissed, setDhDismissed] = useState(false);
  const [frequents, setFrequents] = useState<AppModule[]>([]);

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
    if (role === "admin") return;

    const visible = getVisibleModules(role, fgModules);
    if (visible.length === 1) {
      router.push(visible[0].href);
    }
  }, [authChecked, role, fgModules, router]);

  // Aviso proactivo de Data Health (solo admin): si hay checks critical/warning,
  // avisa al entrar en vez de esperar a que abra el dashboard. (Tras PR #33 los
  // warnings solo viven en el dashboard.)
  useEffect(() => {
    if (!authChecked || role !== "admin") return;
    let cancelled = false;
    fetch("/api/admin/data-health", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { latest?: { severity: string }[] } | null) => {
        if (cancelled || !j?.latest) return;
        const critical = j.latest.filter((x) => x.severity === "critical").length;
        const warning = j.latest.filter((x) => x.severity === "warning").length;
        if (critical + warning > 0) setDhAlert({ critical, warning });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [authChecked, role]);

  // "Tus frecuentes": top módulos por clics del usuario (localStorage). Se lee
  // tras montar (client-only) para no romper SSR/hidratación; se recalcula si
  // cambian rol/permisos/usuario.
  useEffect(() => {
    if (!authChecked || !role) return;
    setFrequents(getFrequentModules(role, fgModules, userName));
  }, [authChecked, role, fgModules, userName]);

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
        {["admin", "secretaria"].includes(role) && (
          <SearchBar darkMode={darkMode} />
        )}

        {/* Aviso proactivo de Data Health (solo admin) */}
        {role === "admin" && dhAlert && !dhDismissed && (
          <div className={`mb-4 flex items-center justify-between gap-3 rounded-lg border px-4 py-2.5 text-sm ${
            dhAlert.critical > 0
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-amber-200 bg-amber-50 text-amber-900"
          }`}>
            <button onClick={() => router.push("/admin/data-health")} className="text-left font-medium hover:underline">
              {dhAlert.critical > 0
                ? `${dhAlert.critical} check${dhAlert.critical === 1 ? "" : "s"} crítico${dhAlert.critical === 1 ? "" : "s"} en Data Health`
                : `${dhAlert.warning} check${dhAlert.warning === 1 ? "" : "s"} en alerta en Data Health`} — toca para revisar
            </button>
            <button onClick={() => setDhDismissed(true)} aria-label="Descartar" className="shrink-0 px-1 opacity-60 hover:opacity-100">×</button>
          </div>
        )}

        {/* Tus frecuentes: los módulos más usados por el usuario (aprendido de
            sus clics reales). Solo aparece si ya hay historial; cada tarjeta
            registra el clic para seguir aprendiendo. */}
        {frequents.length > 0 && (
          <div className="mb-5">
            <div className="flex items-center gap-2.5 mb-2 px-1">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={darkMode ? "text-gray-400" : "text-gray-500"}>
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
              </svg>
              <h2 className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                Tus frecuentes
              </h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
              {frequents.map((m) => {
                const ModIcon = m.icon;
                return (
                  <Link
                    key={m.key}
                    href={m.href}
                    onClick={() => recordModuleClick(m.key, userName)}
                    className={`flex items-center gap-2.5 rounded-lg border px-3 py-3 transition-colors ${
                      darkMode ? "border-gray-800 bg-gray-900 hover:bg-gray-800" : "border-gray-200 bg-white hover:bg-gray-50"
                    }`}
                  >
                    <ModIcon size={18} strokeWidth={1.5} className={`shrink-0 ${darkMode ? "text-gray-300" : "text-gray-600"}`} />
                    <span className={`text-sm font-medium leading-tight truncate ${darkMode ? "text-gray-100" : "text-gray-900"}`}>
                      {m.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Cards de grupo: cada grupo lista sus módulos como links directos.
            Solo aparecen los módulos visibles según permisos (misma fuente que
            el sidebar: getVisibleGroups / getModulesInGroup). Mobile: apiladas. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 items-start">
          {visibleGroups.map((g) => {
            const GroupIcon = g.icon;
            const modules = getModulesInGroup(g.key, role, fgModules);
            return (
              <div
                key={g.key}
                className={`rounded-lg border p-4 sm:p-5 ${
                  darkMode ? "border-gray-800 bg-gray-900" : "border-gray-200 bg-white"
                }`}
              >
                {/* Encabezado del grupo */}
                <div className="flex items-center gap-2.5 mb-2 px-1">
                  <GroupIcon size={16} strokeWidth={1.5} className={darkMode ? "text-gray-400" : "text-gray-500"} />
                  <h2 className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                    {g.label}
                  </h2>
                </div>

                {/* Módulos del grupo */}
                <div className="space-y-0.5">
                  {modules.map((m) => {
                    const ModIcon = m.icon;
                    return (
                      <Link
                        key={m.key}
                        href={m.href}
                        onClick={() => recordModuleClick(m.key, userName)}
                        className={`w-full text-left flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors ${
                          darkMode ? "hover:bg-gray-800" : "hover:bg-gray-50"
                        }`}
                      >
                        <ModIcon
                          size={18}
                          strokeWidth={1.5}
                          className={`shrink-0 ${darkMode ? "text-gray-400" : "text-gray-500"}`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className={`text-sm font-medium leading-tight ${darkMode ? "text-gray-100" : "text-gray-900"}`}>
                            {m.label}
                          </div>
                          {m.subtitle && (
                            <div className={`text-xs leading-tight mt-0.5 truncate ${darkMode ? "text-gray-500" : "text-gray-500"}`}>
                              {m.subtitle}
                            </div>
                          )}
                        </div>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${darkMode ? "text-gray-600" : "text-gray-300"}`}>
                          <path d="M9 18l6-6-6-6"/>
                        </svg>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
