import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { siteUrl } from "@/lib/site";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Without metadataBase, Next cannot resolve the relative canonical and
  // OpenGraph URLs the docs pages declare.
  metadataBase: new URL(siteUrl),
  title: {
    default: "next-live",
    template: "%s | next-live",
  },
  description: "Live TSX evaluation for React, SSR-safe and tuned for the Next.js App Router.",
  manifest: "/site.webmanifest",
  openGraph: {
    type: "website",
    siteName: "next-live",
    images: [
      {
        url: "/brand/nextlive-icon.png",
        width: 512,
        height: 512,
        alt: "next-live",
      },
    ],
  },
  twitter: {
    card: "summary",
    images: ["/brand/nextlive-icon.png"],
  },
  // Favicon, icon, and apple-icon are file-based in app/ (Next.js metadata API).
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
