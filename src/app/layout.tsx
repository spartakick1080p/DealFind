import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import SidebarNav from "@/components/sidebar-nav";
import NavBadge from "@/components/nav-badge";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Deal Monitor",
  description: "Monitor product deals across retail websites",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Deal Monitor",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#121212",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="cyberdark">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-base-200`}
      >
        <script
          dangerouslySetInnerHTML={{
            __html: `if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js'))}`,
          }}
        />
        <div className="flex min-h-screen">
          <SidebarNav
            notificationBadge={
              <Suspense fallback={null}>
                <NavBadge />
              </Suspense>
            }
          />
          <main className="flex-1 p-4 md:p-8 overflow-y-auto pb-20 md:pb-8 bg-[#121212]">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
