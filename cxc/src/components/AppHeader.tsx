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
    <div className="w-full h-11 border-b border-gray-100 flex items-center px-6 gap-3 bg-white sticky top-0 z-10">
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
        className="text-sm text-gray-400 hover:text-black border border-gray-200 px-3 py-1 rounded-full transition flex-shrink-0"
      >
        ⌂ Inicio
      </button>
    </div>
  );
}
