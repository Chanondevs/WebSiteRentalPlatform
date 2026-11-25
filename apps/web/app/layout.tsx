import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Website Rental Platform",
  description: "แพลตฟอร์มสร้างและเช่าเว็บไซต์"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
