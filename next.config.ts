import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Font dosyalarının serverless fonksiyon paketine dahil edilmesini sağla
  outputFileTracingIncludes: {
    "/api/pdf": ["./fonts/**"],
  },
  // Sunucu tarafı (bundle edilmeyen) ağır paketler
  serverExternalPackages: ["@react-pdf/renderer", "sharp"],
};

export default nextConfig;
