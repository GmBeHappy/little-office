import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
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
