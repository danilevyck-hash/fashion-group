import { ToastProvider } from "@/components/ToastSystem";

// ToastProvider para toda la ruta /gastos-empresa — mismo patrón que
// reclamos/layout.tsx y marketing/layout.tsx. Los componentes del módulo
// llaman useToast() para "Listo, guardado" y errores de red.
export default function GastosEmpresaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ToastProvider>{children}</ToastProvider>;
}
