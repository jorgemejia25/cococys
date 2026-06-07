import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hosts allowed to load dev-server resources (HMR, etc.) cross-origin.
  // Required so the phone remote can reach the Next.js dev server over the LAN.
  // Add your machine's LAN IP(s) here when testing on other networks.
  allowedDevOrigins: ["172.20.10.3"],
};

export default nextConfig;
