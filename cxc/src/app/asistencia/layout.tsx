import { ToastProvider } from "@/components/ToastSystem";

// 🩸 SIN ESTO LA PANTALLA SE CAE ENTERA. `useToast()` lanza
// "useToast must be used within ToastProvider" al montar, y la pantalla de
// Asistencia mostraba "Algo salió mal" (3-ago-2026, se publicó sin abrirla en
// el navegador). Mismo patrón que reclamos/, marketing/ y catalogo/[marca]/.
export default function AsistenciaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ToastProvider>{children}</ToastProvider>;
}
