import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-sans',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-mono',
  display: 'swap',
  weight: ['400', '500'],
});

export const metadata: Metadata = {
  title: 'Cyclops Dashboard',
  description: 'Управление номинальным счётом Точка Банка',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Cyclops',
  },
  formatDetection: {
    telephone: false,
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0f' },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <style
          dangerouslySetInnerHTML={{
            __html: `
              #__loading {
                position: fixed;
                inset: 0;
                z-index: 99999;
                display: flex;
                align-items: center;
                justify-content: center;
                background: #0a0a0f;
                transition: opacity 0.2s ease-out;
              }
              #__loading.hidden {
                opacity: 0;
                pointer-events: none;
              }
              #__loading-spinner {
                width: 32px;
                height: 32px;
                border: 2px solid rgba(255,255,255,0.1);
                border-top-color: #3b82f6;
                border-radius: 50%;
                animation: spin 0.8s linear infinite;
              }
              @keyframes spin {
                to { transform: rotate(360deg); }
              }
              @media (prefers-color-scheme: light) {
                #__loading { background: #ffffff; }
                #__loading-spinner { border-color: rgba(0,0,0,0.1); border-top-color: #3b82f6; }
              }
            `,
          }}
        />
      </head>
      <body className={`${inter.variable} ${jetbrainsMono.variable}`}>
        <div id="__loading">
          <div id="__loading-spinner" />
        </div>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                var loader = document.getElementById('__loading');
                if (loader) {
                  window.addEventListener('load', function() {
                    setTimeout(function() {
                      loader.classList.add('hidden');
                      setTimeout(function() { loader.remove(); }, 200);
                    }, 50);
                  });
                }
              })();
            `,
          }}
        />
        {children}
      </body>
    </html>
  );
}
