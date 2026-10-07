import type { Metadata } from "next";
import { Inter } from "next/font/google";
import MotionRoot from "@/components/motion/motion-root";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  preload: true,
});

export const metadata: Metadata = {
  title: {
    template: "%s | MYSIMNUSA",
    default: "MYSIMNUSA — Sistem Informasi Manajemen Keperawatan & Kebidanan",
  },
  description: "Sistem Informasi Manajemen Keperawatan & Kebidanan",
  applicationName: "MYSIMNUSA",
  robots: { index: false, follow: false }, // Internal app — no indexing
  openGraph: {
    title: "MYSIMNUSA — Sistem Informasi Manajemen Keperawatan & Kebidanan",
    description: "Sistem Informasi Manajemen Keperawatan & Kebidanan",
    siteName: "MYSIMNUSA",
    type: "website",
    images: [{ url: "/assets/logo/og-image.png", width: 1200, height: 630, alt: "MYSIMNUSA" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "MYSIMNUSA — Sistem Informasi Manajemen Keperawatan & Kebidanan",
    description: "Sistem Informasi Manajemen Keperawatan & Kebidanan",
    images: ["/assets/logo/og-image.png"],
  },
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
        <MotionRoot />
      </body>
    </html>
  );
}
