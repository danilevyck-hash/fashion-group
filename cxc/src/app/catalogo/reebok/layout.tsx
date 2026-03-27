import Navbar from '@/components/reebok/Navbar'
import ReebokAuthGuard from '@/components/reebok/AuthGuard'

export const metadata = {
  title: 'Reebok Panama - Catalogo',
  description: 'Catalogo de productos Reebok Panama.',
}

export default function ReebokLayout({ children }: { children: React.ReactNode }) {
  return (
    <ReebokAuthGuard>
      <div className="min-h-screen flex flex-col" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
        <Navbar />
        <main className="flex-1">{children}</main>
      </div>
    </ReebokAuthGuard>
  )
}
