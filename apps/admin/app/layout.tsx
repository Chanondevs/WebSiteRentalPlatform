import type { Metadata } from "next";

export const metadata: Metadata = { title: "Website Rental Admin" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="th"><body style={{ fontFamily: "Arial, sans-serif", margin: 40 }}>{children}</body></html>;
}
