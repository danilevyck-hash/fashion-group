import type { Metadata, Viewport } from "next";
import ChatPanel from "@/components/ChatPanel";
import MobileBottomBar from "@/components/MobileBottomBar";
import { ContextMenuProviderWrapper } from "@/components/ContextMenuWrapper";
import { OnlineProvider } from "@/lib/OnlineContext";
import OfflineBanner from "@/components/OfflineBanner";
import "./globals.css";

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
      <body className="min-h-screen safe-top">
        <OnlineProvider>
          <OfflineBanner />
          <ContextMenuProviderWrapper>
            {children}
          </ContextMenuProviderWrapper>
          <MobileBottomBar />
        <ChatPanel />
        </OnlineProvider>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistrations().then(function(regs) {
                  regs.forEach(function(r) { r.unregister(); });
                });
                caches.keys().then(function(keys) {
                  keys.forEach(function(k) { caches.delete(k); });
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
