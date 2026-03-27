import { CartProvider } from '@/components/reebok/CartProvider'
import Navbar from '@/components/reebok/Navbar'
import ServiceWorker from '@/components/reebok/ServiceWorker'
import ReebokAuthGuard from '@/components/reebok/AuthGuard'

export const metadata = {
  title: 'Reebok Panama - Catalogo',
  description: 'Catalogo de productos Reebok Panama. Haz tu pedido por WhatsApp.',
}

export default function ReebokLayout({ children }: { children: React.ReactNode }) {
  return (
    <ReebokAuthGuard>
      <CartProvider>
        <div className="min-h-screen flex flex-col" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
          <Navbar />
          <main className="flex-1">{children}</main>
        </div>
        <ServiceWorker />
      </CartProvider>
    </ReebokAuthGuard>
  )
}
