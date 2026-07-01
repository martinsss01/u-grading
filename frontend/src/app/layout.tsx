import type { Metadata } from "next";
import "./globals.css";
import { Inter } from "next/font/google";
import { cn } from "@/lib/utils";

const inter = Inter({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "U-Grading",
  description: "Grading management platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn("font-sans", inter.variable)}>
      <body>
        <header className="bg-espresso px-6 py-4">
          <span className="text-lg font-semibold text-white">U-Grading</span>
        </header>
        {children}
      </body>
    </html>
  );
}
