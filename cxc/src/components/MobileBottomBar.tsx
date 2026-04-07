"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getModuleColor, getModuleKeyFromPath } from "@/lib/moduleColors";

// All possible nav items with their module key for filtering
const ALL_NAV_ITEMS = [
  { key: "cxc", label: "CXC", href: "/admin", icon: "M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" },
  { key: "guias", label: "Guías", href: "/guias", icon: "M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z M13 2v7h7" },
  { key: "cheques", label: "Cheques", href: "/cheques", icon: "M2 17l10 5 10-5M2 12l10 5 10-5M12 2L2 7l10 5 10-5-10-5z" },
  { key: "caja", label: "Caja", href: "/caja", icon: "M21 4H3a1 1 0 00-1 1v14a1 1 0 001 1h18a1 1 0 001-1V5a1 1 0 00-1-1zM1 10h22" },
  { key: "reclamos", label: "Reclamos", href: "/reclamos", icon: "M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z M12 9v4 M12 17h.01" },
  { key: "directorio", label: "Directorio", href: "/directorio", icon: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 7a4 4 0 100-8 4 4 0 000 8z" },
  { key: "prestamos", label: "Préstamos", href: "/prestamos", icon: "M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2 M9 7a4 4 0 100-8 4 4 0 000 8z" },
  { key: "ventas", label: "Ventas", href: "/ventas", icon: "M22 12h-4l-3 9L9 3l-3 9H2" },
  { key: "camisetas", label: "Camisetas", href: "/camisetas", icon: "M20.38 3.46L16 2 12 5 8 2 3.62 3.46a2 2 0 00-1.34 2.23l.58 3.47a1 1 0 00.99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 002-2V10h2.15a1 1 0 00.99-.84l.58-3.47a2 2 0 00-1.34-2.23z" },
  { key: "reebok", label: "Reebok", href: "/catalogo/reebok", icon: "M20 12V8H6a2 2 0 01-2-2c0-1.1.9-2 2-2h12V0L22 4l-4 4" },
  { key: "upload", label: "Carga", href: "/upload", icon: "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4 M17 8l-5-5-5 5 M12 3v12" },
];

const INICIO_TAB = { key: "inicio", label: "Inicio", href: "/home", icon: "M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10" };

// Max tabs visible on phone (including Inicio and Más)
const MAX_PHONE_TABS = 5;
// Max tabs visible on iPad
const MAX_IPAD_TABS = 7;

export default function MobileBottomBar() {
  const router = useRouter();
  const pathname = usePathname();
  const [showMore, setShowMore] = useState(false);
  const [userModules, setUserModules] = useState<string[] | null>(null);
  const [role, setRole] = useState("");

  // Load user modules from session
  useEffect(() => {
    const r = sessionStorage.getItem("cxc_role") || "";
    setRole(r);
    try {
      const mods = sessionStorage.getItem("fg_modules");
      if (mods) setUserModules(JSON.parse(mods));
    } catch { /* ignore */ }
  }, []);

  // Don't show on login page or reebok catalog (has its own nav)
  const hidden = pathname === "/" || pathname.startsWith("/catalogo/reebok");

  useEffect(() => { setShowMore(false); }, [pathname]);

  // Lock body scroll when bottom sheet is open
  useEffect(() => {
    if (showMore) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [showMore]);

  // Filter nav items by user's modules
  const filteredItems = useMemo(() => {
    const isAdmin = role === "admin" || role === "director";
    if (isAdmin) return ALL_NAV_ITEMS;
    if (!userModules || userModules.length === 0) return ALL_NAV_ITEMS;
    return ALL_NAV_ITEMS.filter(item => userModules.includes(item.key));
  }, [userModules, role]);

  // Split into visible tabs and "Más" overflow
  const { phoneTabs, phoneMoreItems, ipadTabs, ipadMoreItems } = useMemo(() => {
    // Phone: Inicio + up to 3 module tabs + Más (if needed)
    const maxModuleTabs = MAX_PHONE_TABS - 1 - (filteredItems.length > MAX_PHONE_TABS - 1 ? 1 : 0);
    const phoneTabs = filteredItems.slice(0, maxModuleTabs);
    const phoneMoreItems = filteredItems.slice(maxModuleTabs);

    // iPad: more tabs visible
    const maxIpadTabs = MAX_IPAD_TABS - 1 - (filteredItems.length > MAX_IPAD_TABS - 1 ? 1 : 0);
    const ipadTabs = filteredItems.slice(0, maxIpadTabs);
    const ipadMoreItems = filteredItems.slice(maxIpadTabs);

    return { phoneTabs, phoneMoreItems, ipadTabs, ipadMoreItems };
  }, [filteredItems]);

  // Extra tabs only visible on iPad (not on phone)
  const ipadOnlyTabs = ipadTabs.filter(t => !phoneTabs.includes(t));

  const needsMore = phoneMoreItems.length > 0 || ipadMoreItems.length > 0;

  if (hidden) return null;

  // If user has 0 or 1 module, just show minimal bar
  const showOnlyModule = filteredItems.length <= 1;

  return (
    <>
      {/* More menu — full-width bottom sheet */}
      {showMore && needsMore && (
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
            <div className="px-2 pb-4 pt-1 safe-bottom">
              {phoneMoreItems.map(m => {
                const isActive = pathname.startsWith(m.href);
                const moreColor = isActive ? getModuleColor(m.href) : null;
                const isIpadHidden = ipadOnlyTabs.some(t => t.key === m.key) || ipadTabs.some(t => t.key === m.key && !phoneTabs.some(p => p.key === t.key));
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
          {/* Inicio tab — always visible */}
          {(() => {
            const t = INICIO_TAB;
            const active = pathname === "/home";
            return (
              <button key={t.key} onClick={() => router.push(t.href)}
                className={`flex-1 flex flex-col items-center justify-center py-2 min-h-[52px] transition-all ${active ? "text-black" : "text-gray-400"} active:scale-[0.92] active:bg-gray-50`}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? "2.5" : "1.5"} strokeLinecap="round" strokeLinejoin="round"><path d={t.icon}/></svg>
                <span className="text-[10px] mt-0.5">{t.label}</span>
              </button>
            );
          })()}

          {/* Phone tabs */}
          {phoneTabs.map(t => {
            const active = pathname.startsWith(t.href);
            const moduleColor = getModuleColor(t.href);
            const activeColor = active && moduleColor ? moduleColor.text : active ? "text-black" : "text-gray-400";
            return (
              <button key={t.key} onClick={() => router.push(t.href)}
                className={`flex-1 flex flex-col items-center justify-center py-2 min-h-[52px] transition-all sm:hidden ${activeColor} active:scale-[0.92] active:bg-gray-50`}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? "2.5" : "1.5"} strokeLinecap="round" strokeLinejoin="round"><path d={t.icon}/></svg>
                <span className="text-[10px] mt-0.5">{t.label}</span>
              </button>
            );
          })}

          {/* iPad tabs (includes phone tabs + extra) */}
          {ipadTabs.map(t => {
            const active = pathname.startsWith(t.href);
            const moduleColor = getModuleColor(t.href);
            const activeColor = active && moduleColor ? moduleColor.text : active ? "text-black" : "text-gray-400";
            return (
              <button key={`ipad-${t.key}`} onClick={() => router.push(t.href)}
                className={`hidden sm:flex flex-1 flex-col items-center justify-center py-2 min-h-[52px] transition-all ${activeColor} active:scale-[0.92] active:bg-gray-50`}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? "2.5" : "1.5"} strokeLinecap="round" strokeLinejoin="round"><path d={t.icon}/></svg>
                <span className="text-[10px] mt-0.5">{t.label}</span>
              </button>
            );
          })}

          {/* Más button — only if there are overflow items */}
          {needsMore && (
            <button onClick={() => setShowMore(!showMore)}
              className={`flex-1 flex flex-col items-center justify-center py-2 min-h-[52px] transition-all ${showMore ? "text-black" : "text-gray-400"} active:scale-[0.92] active:bg-gray-50`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
              <span className="text-[10px] mt-0.5">Más</span>
            </button>
          )}
        </div>
      </div>
    </>
  );
}
