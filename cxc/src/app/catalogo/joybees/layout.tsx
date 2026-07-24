import JoybeesAuthGuard from "@/components/joybees/JoybeesAuthGuard";
import JoybeesNavbar from "@/components/joybees/JoybeesNavbar";

export const metadata = {
  title: "Joybees Panama - Catalogo",
  description: "Catalogo de productos Joybees Panama.",
};

export default function JoybeesLayout({ children }: { children: React.ReactNode }) {
  return (
    <JoybeesAuthGuard>
      <div className="min-h-screen flex flex-col" style={{ fontFamily: "Arial, Helvetica, sans-serif" }}>
        {/* Navbar espejo del de Reebok (con acceso "Pedidos" para gestores) */}
        <JoybeesNavbar />
        <main className="flex-1">{children}</main>
      </div>
    </JoybeesAuthGuard>
  );
}
