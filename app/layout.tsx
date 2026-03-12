import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Universal LLM Chat",
  description: "Chat with multiple LLMs from a single interface",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
