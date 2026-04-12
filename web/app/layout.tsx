import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MARS Robot Control",
  description: "Control interface for MARS robots via rosbridge WebSocket",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-gray-950 text-gray-100 min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
