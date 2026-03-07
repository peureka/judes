import "./globals.css";
import { Analytics } from "@vercel/analytics/next";

export const metadata = {
  title: "judes",
  description: "three things.",
  metadataBase: new URL("https://judes.ai"),
  icons: {
    icon: "/favicon.svg",
  },
  openGraph: {
    title: "judes",
    description: "three things.",
    url: "https://judes.ai",
    siteName: "judes",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "judes",
    description: "three things.",
    images: ["/og.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
