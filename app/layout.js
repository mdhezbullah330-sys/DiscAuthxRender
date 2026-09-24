import './globals.css';

export const metadata = {
  title: 'BENJA HEX • Discord Authorization',
  description: 'Secure Discord OAuth2 verification and authorization dashboard.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
