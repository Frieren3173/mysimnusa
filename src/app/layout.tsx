import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  preload: true,
});

export const metadata: Metadata = {
  title: {
    template: "%s | RSAJT Nursing",
    default: "RSAJT Nursing Management System",
  },
  description: "Platform manajemen terintegrasi Komite Keperawatan, Borang, dan Diklat RSAJT",
  robots: { index: false, follow: false }, // Internal app — no indexing
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-blue-700 focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          Lewati navigasi
        </a>
        {children}
      </body>
    </html>
  );
}
