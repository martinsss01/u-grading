import type { Metadata } from "next";
import Image from "next/image";
import "./globals.css";
import { Inter } from "next/font/google";
import { cn } from "@/lib/utils";
import { SignOutButton } from "@/components/sign-out-button";
import { UserBadge } from "@/components/user-badge";

const inter = Inter({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "U-Grading",
  description: "Grading management platform",
  icons: { icon: "/images/u-grading-icon-512-red.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn("font-sans dark", inter.variable)}>
      <body>
        <header className="flex items-center justify-between border-b border-grey/30 bg-darkergrey px-6 py-4">
          <Image
            src="/images/u-grading-horizontal-dark-transparent.png"
            alt="U-Grading"
            width={1380}
            height={384}
            priority
            className="h-8 w-auto"
          />
          <div className="flex items-center gap-4">
            <UserBadge />
            <SignOutButton />
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
