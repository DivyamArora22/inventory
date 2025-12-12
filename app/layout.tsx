import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Inventory Management System",
  description: "Inventory, dispatch, inward, and masters with Supabase + Vercel",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
