// app/layout.js
export const metadata = {
  title: 'Real Terms - Asset Performance Dashboard',
  description: 'See how assets perform in real terms: priced in gold, housing, and PCE-adjusted dollars.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  )
}
