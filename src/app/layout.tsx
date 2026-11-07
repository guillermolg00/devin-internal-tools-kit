import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Foundry · Internal tools", template: "%s · Foundry" },
  description: "A small, shared foundation for your team's internal tools.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
