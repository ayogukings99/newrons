'use client';
import { useEffect } from 'react';

// Registers the offline shell worker (production only — dev skips it).
export default function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);
  return null;
}
