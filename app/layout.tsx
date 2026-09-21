import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DCA Research Lab",
  description: "Historical stock and ETF research for comparing first-day purchases with daily dollar-cost averaging.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
