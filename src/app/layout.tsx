import type { Metadata } from "next";
import "./globals.css";
import Navbar from "../components/navbar"; // <--- Tu importujemy nasz klocek

export const metadata: Metadata = {
  title: "Stacja Pogodowa",
  description: "Dashboard sadownika",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl">
      <body className="bg-slate-900 text-white">
        
        {/* Wstawiamy Navbar tutaj, nad całą resztą */}
        <Navbar />
        
        {children}
      </body>
    </html>
  );
}