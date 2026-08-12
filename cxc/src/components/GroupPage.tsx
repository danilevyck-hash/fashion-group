"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import {
  GROUP_LABELS,
  getModulesInGroup,
  type ModuleGroup,
} from "@/lib/modules";

interface GroupPageProps {
  group: ModuleGroup;
}

export default function GroupPage({ group }: GroupPageProps) {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [role, setRole] = useState("");
  const [fgModules, setFgModules] = useState<string[] | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const r = sessionStorage.getItem("cxc_role") || "";
    if (!r) { router.push("/"); return; }
    if (r === "cliente") { router.push("/catalogo/reebok"); return; }
    setRole(r);
    try {
      const mods = sessionStorage.getItem("fg_modules");
      if (mods) setFgModules(JSON.parse(mods));
    } catch { /* ignore */ }
    setAuthChecked(true);
  }, [router]);

  const meta = GROUP_LABELS[group];
  const modules = role ? getModulesInGroup(group, role, fgModules) : [];

  useEffect(() => {
    if (authChecked && role && modules.length === 0) {
      router.push("/home");
    }
  }, [authChecked, role, modules.length, router]);

  if (!authChecked) return null;
  if (modules.length === 0) return null;

  return (
    <div className="min-h-screen bg-white">
      <AppHeader module={meta.title} />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* Sin título grande: el nombre del grupo ya lo dicen la barra sticky
            (celular) y el breadcrumb "Inicio › Grupo" (escritorio) — repetirlo
            acá era el nombre 3×, el mismo defecto que el AppHeader ya había
            recortado. Queda sr-only para no dejar la página sin encabezado. */}
        <h1 className="sr-only">{meta.title}</h1>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
          {modules.map((mod) => {
            const Icon = mod.icon;
            return (
              <button
                key={mod.key}
                onClick={() => router.push(mod.href)}
                className="text-left border border-gray-200 bg-white rounded-lg p-4 transition-all duration-150 hover:border-gray-400 hover:shadow-sm flex items-center gap-3"
              >
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-gray-50 text-gray-700 shrink-0">
                  <Icon size={18} strokeWidth={1.5} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-gray-900 leading-tight truncate">
                    {mod.label}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
