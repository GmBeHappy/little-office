import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  manifest: "/office.webmanifest",
  icons: { apple: "/office-icon-256.png" },
  title: "Little Office — a place to work together",
  description:
    "A cozy pixel office for your team. Walk over, say hello, and work together.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
