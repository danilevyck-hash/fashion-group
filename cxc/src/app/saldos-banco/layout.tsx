import { ToastProvider } from "@/components/ToastSystem";

// ToastProvider para toda la ruta /saldos-banco — mismo patrón que
// reclamos/layout.tsx y gastos-contabilidad/layout.tsx. El módulo llama useToast()
// para "Listo, guardado" y errores de red.
export default function SaldosBancoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ToastProvider>{children}</ToastProvider>;
}
