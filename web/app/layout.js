import "./globals.css";

export const metadata = {
  title: "judes",
  description: "three things.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
