/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['shared'],
  // PWA headers + strict CSP land with the Delivery hardening pass (VS4).
  // Testnet only — no mainnet value flows through this app in Phase 1.
};
export default nextConfig;
