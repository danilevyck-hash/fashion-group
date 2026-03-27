"use client";
import { useRouter } from "next/navigation";
import FGLogo from "@/components/FGLogo";

interface AppHeaderProps {
  module: string;
  breadcrumbs?: { label: string; onClick?: () => void }[];
}

export default function AppHeader({ module, breadcrumbs }: AppHeaderProps) {
  const router = useRouter();
  return (
    <div className="w-full border-b border-gray-100 bg-white sticky top-0 z-10">
      <div className="h-11 flex items-center px-4 sm:px-6 gap-3">
        <FGLogo variant="icon" theme="light" size={22} />
        <div className="w-px h-4 bg-gray-200" />
        <div className="flex items-center gap-1 text-sm text-gray-500 flex-1 min-w-0">
          <span className="truncate">{module}</span>
          {breadcrumbs?.map((b, i) => (
            <span key={i} className="flex items-center gap-1">
              <span className="text-gray-300">›</span>
              {b.onClick ? (
                <button onClick={b.onClick} className="hover:text-black transition truncate">{b.label}</button>
              ) : (
                <span className="text-gray-800 font-medium truncate">{b.label}</span>
              )}
            </span>
          ))}
        </div>
        <button
          onClick={() => router.push("/plantillas")}
          className="text-sm text-gray-400 hover:text-black border border-gray-200 px-3 py-1 rounded-full transition flex-shrink-0 flex items-center gap-1.5"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
          <span className="hidden sm:inline">Inicio</span>
        </button>
      </div>
      {/* Breadcrumb bar */}
      <div className="px-4 sm:px-6 py-1 text-[11px] text-gray-400 flex items-center gap-1">
        <button onClick={() => router.push("/plantillas")} className="hover:text-gray-700 transition">Inicio</button>
        <span>›</span>
        <span className="text-gray-500">{module}</span>
        {breadcrumbs?.map((b, i) => (
          <span key={i} className="flex items-center gap-1">
            <span>›</span>
            {b.onClick ? (
              <button onClick={b.onClick} className="hover:text-gray-700 transition">{b.label}</button>
            ) : (
              <span className="text-gray-500">{b.label}</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
