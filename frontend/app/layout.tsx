import './globals.css';
import type { ReactNode } from 'react';
import { IBM_Plex_Sans, IBM_Plex_Serif } from 'next/font/google';
import type { Metadata } from 'next';
import ClientProviders from '../components/ClientProviders';

const bodyFont = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body'
});

const displayFont = IBM_Plex_Serif({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-display'
});

export const metadata: Metadata = {
  title: 'NyayaCheck | CRPF Tender Evaluation',
  description: 'Explainable AI for government tender eligibility analysis, bidder review, and audit-ready procurement decisions.'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={`${bodyFont.variable} ${displayFont.variable}`}>
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  );
}
