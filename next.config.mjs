/** @type {import('next').NextConfig} */
const nextConfig = {
  // googleapis is a server-only dependency; keep it out of any client bundle.
  serverExternalPackages: ["googleapis"],
};

export default nextConfig;
