import { ToastProvider } from "@/components/ToastSystem";

// ToastProvider para toda la ruta /guias. Lo necesita el botón "Compartir" de
// `GuiaDetail`, y sin este provider `useToast` lanza "useToast must be used
// within ToastProvider" al montar: la guía entera se cae con "Algo salió mal".
// Mismo patrón que /reclamos, /gastos-empresa y /asistencia.
export default function GuiasLayout({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
