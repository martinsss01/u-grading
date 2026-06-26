import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "U-Grading",
  description: "Grading management platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="bg-espresso px-6 py-4">
          <span className="text-lg font-semibold text-white">U-Grading</span>
        </header>
        {children}
      </body>
    </html>
  );
}
