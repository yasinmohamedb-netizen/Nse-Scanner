import "./globals.css";

export const metadata = {
  title: "NSE Scanner",
  description: "Personal multi-chart NSE stock scanner",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
