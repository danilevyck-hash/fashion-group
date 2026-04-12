import JoybeesAuthGuard from "@/components/joybees/JoybeesAuthGuard";

export const metadata = {
  title: "Joybees Panama - Catalogo",
  description: "Catalogo de productos Joybees Panama.",
};

export default function JoybeesLayout({ children }: { children: React.ReactNode }) {
  return (
    <JoybeesAuthGuard>
      <div className="min-h-screen flex flex-col" style={{ fontFamily: "Arial, Helvetica, sans-serif" }}>
        {/* Joybees navbar */}
        <nav className="sticky top-0 z-50 bg-white">
          <div className="h-[2px] bg-[#FFE443]" />
          <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-4 border-b border-gray-100">
            <a href="/home" className="text-xs text-[#404041] hover:text-[#FFE443] transition flex-shrink-0 py-2">
              &larr; Dashboard
            </a>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-lg">🐝</span>
              <span className="font-black text-[#404041] uppercase tracking-wider text-sm">Joybees</span>
            </div>
            <div className="flex-1" />
          </div>
        </nav>
        <main className="flex-1">{children}</main>
      </div>
    </JoybeesAuthGuard>
  );
}
