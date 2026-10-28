import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { COLOR_DE_FONDO } from "@/lib/diseno/marca"
import "./globals.css"

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] })
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] })

export const metadata: Metadata = {
  title: "PostIA",
  description: "Publica en LinkedIn e Instagram con tu firma antes de cada publicación.",
  applicationName: "PostIA",
  appleWebApp: { capable: true, title: "PostIA", statusBarStyle: "default" },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: COLOR_DE_FONDO,
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-background text-foreground">{children}</body>
    </html>
  )
}
