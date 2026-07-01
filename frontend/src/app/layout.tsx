import type { Metadata } from "next";
import "./globals.css";
import { Inter } from "next/font/google";
import { cn } from "@/lib/utils";
import { SignOutButton } from "@/components/sign-out-button";

const inter = Inter({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "U-Grading",
  description: "Grading management platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn("font-sans dark", inter.variable)}>
      <body>
        <header className="flex items-center justify-between border-b border-grey/30 bg-darkergrey px-6 py-4">
          <span className="text-lg font-semibold text-white">U-Grading</span>
          <SignOutButton />
        </header>
        {children}
      </body>
    </html>
  );
}
