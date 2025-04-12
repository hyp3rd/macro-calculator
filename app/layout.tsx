import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Macro Calculator and Daily Meal Planner',
  description: 'A tool to help you track your macros and plan your meals.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
