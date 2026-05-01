import React from "react"
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'SurePark Baguio - Smart Parking System',
  description: 'Smart parking management system for Baguio City',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} antialiased bg-slate-900 text-white min-h-screen`}>
        {children}
      </body>
    </html>
  )
}