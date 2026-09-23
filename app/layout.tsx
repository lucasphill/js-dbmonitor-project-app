import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DBMonitor",
  description: "Painel local de métricas PostgreSQL",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
