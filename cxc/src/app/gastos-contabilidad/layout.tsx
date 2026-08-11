import { ToastProvider } from "@/components/ToastSystem";

// ToastProvider para toda la ruta /gastos-contabilidad — mismo patrón que
// saldos-banco, reclamos y marketing. La pantalla es de solo lectura hoy, pero
// el provider queda puesto para que cualquier acción futura no tenga que mover
// el layout.
export default function GastosContabilidadLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ToastProvider>{children}</ToastProvider>;
}
