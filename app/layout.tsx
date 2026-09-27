import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "Ashreeta Patra — software developer",
  description:
    "Ashreeta Patra — a creative AI developer and a true jack of all trades. Résumé, work and contact.",
  icons: {
    icon: { url: "/hero/warm-768.webp", type: "image/webp" },
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
      data-hero-state="cold"
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
