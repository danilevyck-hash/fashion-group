import Navbar from '@/components/reebok/Navbar'
import ReebokAuthGuard from '@/components/reebok/AuthGuard'
import { ToastProvider } from '@/components/ToastSystem'

export const metadata = {
  title: 'Reebok Panamá - Catálogo',
  description: 'Catálogo de productos Reebok Panamá.',
}

export default function ReebokLayout({ children }: { children: React.ReactNode }) {
  return (
    <ReebokAuthGuard>
      <ToastProvider>
        <div className="min-h-screen flex flex-col" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
          <Navbar />
          <main className="flex-1">{children}</main>
        </div>
      </ToastProvider>
    </ReebokAuthGuard>
  )
}
