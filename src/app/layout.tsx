import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Blogotron | Premium Amazon Hardware & Tech Deals',
  description: 'The hottest community-validated tech and hardware deals on Amazon.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="disclosure-bar">
          Disclosure: As an Amazon Associate, Blogotron earns from qualifying purchases.
        </div>
        <header className="header">
          <div className="container header-content">
            <div className="logo">BLOGO<span>TRON</span></div>
            <nav style={{ display: 'flex', gap: '20px', fontSize: '0.9rem', fontWeight: 600, textTransform: 'uppercase' }}>
              <a href="/" style={{ color: '#fff' }}>Latest Deals</a>
              <a href="#" style={{ color: '#999' }}>Hardware</a>
              <a href="#" style={{ color: '#999' }}>Gaming</a>
            </nav>
          </div>
        </header>

        <main style={{ minHeight: '80vh' }}>
          {children}
        </main>

        <footer className="footer">
          <div className="container">
            <p className="logo" style={{ fontSize: '1.5rem', marginBottom: '20px' }}>BLOGO<span>TRON</span></p>
            <p>© {new Date().getFullYear()} Blogotron. All rights reserved.</p>
            <p style={{ maxWidth: '600px', margin: '0 auto', fontSize: '0.8rem', color: '#666' }}>
              Blogotron is a participant in the Amazon Services LLC Associates Program, an affiliate advertising program designed to provide a means for sites to earn advertising fees by advertising and linking to Amazon.com.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
