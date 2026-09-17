import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { product } from "@/config";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: `${product.name} — ${product.tagline}`,
    template: `%s · ${product.name}`,
  },
  description:
    "Open-source social automation for creators and businesses. Turn comments, DMs and story replies into workflows you own — automations, inbox, contacts, tracked links and analytics.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={manrope.variable} suppressHydrationWarning>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}