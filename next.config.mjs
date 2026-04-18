/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Explicit allowlist of image hosts Next can optimize. Without an
    // entry here, /_next/image rejects the URL with
    // INVALID_IMAGE_OPTIMIZE_REQUEST (400).
    //
    // Audit before adding new hosts:
    //   SELECT DISTINCT SUBSTRING(cover_photo_url FROM '^https?://([^/]+)')
    //   FROM properties WHERE cover_photo_url IS NOT NULL;
    remotePatterns: [
      {
        protocol: "https",
        hostname: "a0.muscache.com",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
