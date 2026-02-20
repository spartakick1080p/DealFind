import type { Metadata } from "next";
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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="cyberdark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-base-200`}
      >
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
