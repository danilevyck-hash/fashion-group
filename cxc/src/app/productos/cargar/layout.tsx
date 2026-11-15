import { ToastProvider } from "@/components/ToastSystem";

// ToastProvider para /productos/cargar: los botones de guardar fórmula avisan
// por aquí cuando el servidor rechaza el guardado (antes fallaban callados).
export default function CargarLayout({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
