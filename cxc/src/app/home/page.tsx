"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import FGLogo from "@/components/FGLogo";
import SearchBar from "@/components/SearchBar";
import IconButton from "@/components/IconButton";
import { getVisibleGroups, getVisibleModules, getModulesInGroup, type AppModule } from "@/lib/modules";
import { recordModuleClick, getFrequentModules } from "@/lib/module-frequents";
import { fmtDate } from "@/lib/format";
import { hoyPanama } from "@/lib/fecha-panama";

// Caché del nombre para saludar (fg_users.nombre_completo). Se guarda para que
// el saludo aparezca instantáneo en las siguientes visitas y se refresca en
// segundo plano contra /api/auth/perfil.
const DISPLAY_NAME_KEY = "fg_user_display_name";

export default function HomePage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [role, setRole] = useState("");
  const [userName, setUserName] = useState("");
  const [displayName, setDisplayName] = useState("");
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
    const login = sessionStorage.getItem("fg_user_name") || "";
    setUserName(login);
    setDisplayName(sessionStorage.getItem(DISPLAY_NAME_KEY) || login);
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

  // Nombre real del usuario (fg_users.nombre_completo) para el saludo. El
  // sessionStorage solo guarda el usuario de login, así que se pide al server;
  // si el endpoint falla, el saludo se queda con el usuario de login.
  useEffect(() => {
    if (!authChecked || !role) return;
    let cancelled = false;
    fetch("/api/auth/perfil", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { displayName?: string } | null) => {
        if (cancelled || !j?.displayName) return;
        setDisplayName(j.displayName);
        try { sessionStorage.setItem(DISPLAY_NAME_KEY, j.displayName); } catch { /* ignore */ }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [authChecked, role]);

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
  const saludo = displayName ? `Buen día, ${displayName}` : "Buen día";

  if (!authChecked) return null;

  // Ficha: fondo stone claro, borde sutil, acento teal al hover y elevación
  // mínima. Alto uniforme (78px en la cuadrícula) — cómodo para el dedo.
  const fichaBase =
    "group flex rounded-lg border transition-all duration-150 active:scale-[0.97] " +
    (darkMode
      ? "border-gray-800 bg-gray-900 hover:border-teal-700 hover:bg-gray-800"
      : "border-stone-200 bg-stone-50 hover:border-teal-500 hover:bg-white hover:shadow-sm");
  const iconoBase = `shrink-0 transition-colors ${
    darkMode ? "text-gray-400 group-hover:text-teal-400" : "text-stone-500 group-hover:text-teal-600"
  }`;
  const textoBase = `text-xs font-medium leading-tight transition-colors ${
    darkMode ? "text-gray-100 group-hover:text-teal-200" : "text-gray-900 group-hover:text-teal-800"
  }`;

  return (
    <div className={`min-h-screen ${darkMode ? "bg-gray-950 text-gray-100" : "bg-white"}`}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {/* Encabezado: saludo en serif + fecha del día */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="min-w-0">
            <FGLogo variant="horizontal" theme="light" size={28} />
            <h1 className={`font-display text-2xl sm:text-3xl font-medium tracking-tight mt-3 truncate ${darkMode ? "text-gray-50" : "text-gray-950"}`}>
              {saludo}
            </h1>
            <p className={`text-sm mt-0.5 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
              {fmtDate(hoyPanama())}
            </p>
          </div>
          {/* /home NO usa AppHeader: tiene su propio encabezado, así que los 44×44
              que se arreglaron allá nunca llegaron acá. Estos dos botones medían
              22×21 y 29×21 en el iPhone — y son los de la primera pantalla que ve
              todo el mundo al entrar. El -mr-2 compensa el ancho nuevo contra el
              borde del contenedor. */}
          <div className="flex items-center shrink-0 -mr-2">
            <IconButton
              onClick={() => {
                const next = !darkMode;
                setDarkMode(next);
                if (next) { document.documentElement.classList.add("dark"); localStorage.setItem("fg_dark_mode", "1"); }
                else { document.documentElement.classList.remove("dark"); localStorage.setItem("fg_dark_mode", "0"); }
              }}
              label={darkMode ? "Modo claro" : "Modo oscuro"}
              className="text-sm text-gray-400 hover:text-black"
            >
              {darkMode ? "☀" : "◑"}
            </IconButton>
            <button
              onClick={() => { sessionStorage.clear(); router.push("/"); }}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center text-sm text-gray-400 hover:text-black transition active:scale-[0.97]"
            >
              Salir
            </button>
          </div>
        </div>

        {/* Global Search — admin, secretaria */}
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
            {/* Data Health es la 2ª pestaña de Usuarios (13-ago-2026). El link
                va DIRECTO a la pestaña: el redirect de `/admin/data-health`
                existe para los marcadores viejos, no para que la app siga
                usando una dirección que ya no es la suya. */}
            <button onClick={() => router.push("/admin/usuarios?tab=data-health")} className="text-left font-medium hover:underline">
              {dhAlert.critical > 0
                ? `${dhAlert.critical} check${dhAlert.critical === 1 ? "" : "s"} crítico${dhAlert.critical === 1 ? "" : "s"} en Data Health`
                : `${dhAlert.warning} check${dhAlert.warning === 1 ? "" : "s"} en alerta en Data Health`} — toca para revisar
            </button>
            <button onClick={() => setDhDismissed(true)} aria-label="Descartar" className="shrink-0 px-1 opacity-60 hover:opacity-100">×</button>
          </div>
        )}

        {/* Tus frecuentes: los módulos más usados por el usuario (aprendido de
            sus clics reales). Fila arriba de los grupos, misma ficha pero
            HORIZONTAL. Solo aparece si ya hay historial. */}
        {frequents.length > 0 && (
          <div className="mb-6">
            <h2 className={`text-xs font-semibold uppercase tracking-wide mb-2 px-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
              Tus frecuentes
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
              {frequents.map((m) => {
                const ModIcon = m.icon;
                return (
                  <Link
                    key={m.key}
                    href={m.href}
                    onClick={() => recordModuleClick(m.key, userName)}
                    className={`${fichaBase} min-h-[56px] items-center gap-2.5 px-3 py-3`}
                  >
                    <ModIcon size={20} strokeWidth={1.5} className={iconoBase} />
                    <span className={`${textoBase} truncate`}>{m.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Grupos: cuadrícula de fichas (ícono de línea arriba, nombre debajo,
            sin subtítulo). Solo aparecen los módulos visibles según permisos
            (misma fuente que el sidebar: getVisibleGroups/getModulesInGroup). */}
        <div className="space-y-6">
          {visibleGroups.map((g) => {
            const modules = getModulesInGroup(g.key, role, fgModules);
            return (
              <section key={g.key}>
                <h2 className={`text-xs font-semibold uppercase tracking-wide mb-2 px-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                  {g.label}
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2 sm:gap-3">
                  {modules.map((m) => {
                    const ModIcon = m.icon;
                    return (
                      <Link
                        key={m.key}
                        href={m.href}
                        onClick={() => recordModuleClick(m.key, userName)}
                        className={`${fichaBase} min-h-[78px] flex-col items-center justify-center gap-2 px-2 py-3 text-center`}
                      >
                        <ModIcon size={20} strokeWidth={1.5} className={iconoBase} />
                        <span className={textoBase}>{m.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
