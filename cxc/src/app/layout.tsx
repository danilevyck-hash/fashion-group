import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { Playfair_Display } from "next/font/google";

import { ContextMenuProviderWrapper } from "@/components/ContextMenuWrapper";

const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-playfair",
  display: "swap",
});
import { OnlineProvider } from "@/lib/OnlineContext";
import OfflineBanner from "@/components/OfflineBanner";
import InstallPrompt from "@/components/InstallPrompt";
import UpdatePrompt from "@/components/UpdatePrompt";
import SWRProvider from "@/components/SWRProvider";
import Sidebar, { SidebarAwareMain } from "@/components/Sidebar";
import "./globals.css";

// Geist Mono via el package oficial de Vercel (`geist`). Next 14.2.3 todavía
// no tiene Geist_Mono en next/font/google, así que usamos este helper que
// expone --font-geist-mono igual que pediste. Equivalente exacto.

export const metadata: Metadata = {
  title: "Fashion Group",
  description: "Sistema interno Fashion Group",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black",
    title: "Fashion Group",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
        <script dangerouslySetInnerHTML={{ __html: `try{if(localStorage.getItem('fg_dark_mode')==='1')document.documentElement.classList.add('dark')}catch(e){}` }} />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black" />
        <meta name="apple-mobile-web-app-title" content="Fashion Group" />
      </head>
      <body className={`${GeistMono.variable} ${playfair.variable} min-h-screen safe-top`}>
        <SWRProvider>
          <OnlineProvider>
            <OfflineBanner />
            <ContextMenuProviderWrapper>
              <Sidebar />
              <SidebarAwareMain>{children}</SidebarAwareMain>
            </ContextMenuProviderWrapper>
            <InstallPrompt />
            <UpdatePrompt />
          </OnlineProvider>
        </SWRProvider>
        {/* El SW (Serwist) lo registra UpdatePrompt vía @serwist/window
            (next.config tiene register:false) para controlar el ciclo
            waiting→controlling y ofrecer el toast "Nueva versión" (PR-4).
            Antes había aquí un <script> que en cada carga desregistraba el SW y
            borraba todos los caches — removido en Modo viaje PR-1. */}
      </body>
    </html>
  );
}
