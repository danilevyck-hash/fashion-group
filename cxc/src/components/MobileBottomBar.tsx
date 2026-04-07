"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getModuleColor, getModuleKeyFromPath } from "@/lib/moduleColors";

const TABS = [
  { key: "inicio", label: "Inicio", href: "/home", icon: "M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10" },
  { key: "cxc", label: "CXC", href: "/admin", icon: "M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" },
  { key: "guias", label: "Guías", href: "/guias", icon: "M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z M13 2v7h7" },
  { key: "cheques", label: "Cheques", href: "/cheques", icon: "M2 17l10 5 10-5M2 12l10 5 10-5M12 2L2 7l10 5 10-5-10-5z" },
];

// Extra tabs visible on iPad (sm-md breakpoint)
const IPAD_EXTRA_TABS = [
  { key: "caja", label: "Caja", href: "/caja", icon: "M21 4H3a1 1 0 00-1 1v14a1 1 0 001 1h18a1 1 0 001-1V5a1 1 0 00-1-1zM1 10h22" },
  { key: "reclamos", label: "Reclamos", href: "/reclamos", icon: "M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z M12 9v4 M12 17h.01" },
  { key: "directorio", label: "Directorio", href: "/directorio", icon: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 7a4 4 0 100-8 4 4 0 000 8z" },
];

const MORE_ITEMS = [
  { label: "Caja Menuda", href: "/caja" },
  { label: "Directorio", href: "/directorio" },
  { label: "Reclamos", href: "/reclamos" },
  { label: "Préstamos", href: "/prestamos" },
  { label: "Ventas", href: "/ventas" },
  { label: "Camisetas", href: "/camisetas" },
  { label: "Reebok", href: "/catalogo/reebok" },
  { label: "Carga", href: "/upload" },
];

// On iPad, some items move to tabs so exclude them from "Más"
const IPAD_MORE_ITEMS = MORE_ITEMS.filter(m => !IPAD_EXTRA_TABS.some(t => t.href === m.href));

export default function MobileBottomBar() {
  const router = useRouter();
  const pathname = usePathname();
  const [showMore, setShowMore] = useState(false);

  // Don't show on login page or reebok catalog (has its own nav)
  const hidden = pathname === "/" || pathname.startsWith("/catalogo/reebok");

  useEffect(() => { setShowMore(false); }, [pathname]);

  // Lock body scroll when bottom sheet is open
  useEffect(() => {
    if (showMore) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [showMore]);

  if (hidden) return null;

  return (
    <>
      {/* More menu — full-width bottom sheet */}
      {showMore && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setShowMore(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-xl max-h-[60vh] overflow-y-auto animate-in slide-in-from-bottom duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>
            <div className="px-2 pb-4 pt-1">
              {/* Phone: show all MORE_ITEMS; iPad: show only IPAD_MORE_ITEMS */}
              {MORE_ITEMS.map(m => {
                const isActive = pathname.startsWith(m.href);
                const moreColor = isActive ? getModuleColor(m.href) : null;
                const isIpadHidden = IPAD_EXTRA_TABS.some(t => t.href === m.href);
                return (
                  <button key={m.href} onClick={() => { router.push(m.href); setShowMore(false); }}
                    className={`w-full text-left px-4 py-3.5 text-sm rounded-lg transition-all min-h-[44px] ${isIpadHidden ? "sm:hidden" : ""} ${isActive ? `bg-gray-50 font-medium ${moreColor ? moreColor.text : "text-black"}` : "text-gray-600 hover:bg-gray-50 active:bg-gray-100"}`}>
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-200 md:hidden safe-bottom">
        <div className="flex items-stretch">
          {TABS.map(t => {
            const active = t.key === "inicio" ? pathname === "/home" : pathname.startsWith(t.href);
            const moduleColor = getModuleColor(t.href);
            const activeColor = active && moduleColor ? moduleColor.text : active ? "text-black" : "text-gray-400";
            return (
              <button key={t.key} onClick={() => router.push(t.href)}
                className={`flex-1 flex flex-col items-center justify-center py-2 min-h-[52px] transition-all ${activeColor} active:scale-[0.92] active:bg-gray-50`}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? "2.5" : "1.5"} strokeLinecap="round" strokeLinejoin="round"><path d={t.icon}/></svg>
                <span className="text-[10px] mt-0.5">{t.label}</span>
              </button>
            );
          })}
          {/* iPad extra tabs — visible only on sm+ (hidden on phone) */}
          {IPAD_EXTRA_TABS.map(t => {
            const active = pathname.startsWith(t.href);
            const moduleColor = getModuleColor(t.href);
            const activeColor = active && moduleColor ? moduleColor.text : active ? "text-black" : "text-gray-400";
            return (
              <button key={t.key} onClick={() => router.push(t.href)}
                className={`hidden sm:flex flex-1 flex-col items-center justify-center py-2 min-h-[52px] transition-all ${activeColor} active:scale-[0.92] active:bg-gray-50`}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? "2.5" : "1.5"} strokeLinecap="round" strokeLinejoin="round"><path d={t.icon}/></svg>
                <span className="text-[10px] mt-0.5">{t.label}</span>
              </button>
            );
          })}
          <button onClick={() => setShowMore(!showMore)}
            className={`flex-1 flex flex-col items-center justify-center py-2 min-h-[52px] transition-all ${showMore ? "text-black" : "text-gray-400"} active:scale-[0.92] active:bg-gray-50`}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
            <span className="text-[10px] mt-0.5">Más</span>
          </button>
        </div>
      </div>
    </>
  );
}
