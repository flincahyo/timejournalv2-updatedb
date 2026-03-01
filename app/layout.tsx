import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import NextTopLoader from "nextjs-toploader";
import { NewsWatcher } from "@/components/layout/NewsWatcher";
import { AlertWatcher } from "@/components/layout/AlertWatcher";
import { ThemeProvider } from "@/components/layout/ThemeProvider";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "TimeJournal — MT5 Trading Journal",
  description: "Professional forex trading journal with live MT5 sync",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        {/* Anti-flash: apply theme before first paint */}
        <script dangerouslySetInnerHTML={{
          __html: `
try {
  var s = localStorage.getItem('theme-store');
  var t = s ? JSON.parse(s).state?.theme : 'light';
  document.documentElement.classList.add(t || 'light');
} catch (e) {
  document.documentElement.classList.add('light');
}
`}} />
      </head>
      <body>
        <ThemeProvider>
          <NextTopLoader color="#2563eb" showSpinner={false} shadow="0 0 10px #2563eb,0 0 5px #2563eb" />
          <NewsWatcher />
          <AlertWatcher />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
