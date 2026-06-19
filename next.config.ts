import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Font dosyalarının serverless fonksiyon paketine dahil edilmesini sağla
  outputFileTracingIncludes: {
    "/api/pdf": ["./fonts/**"],
  },
  // jsdom & @react-pdf sunucu tarafı paketleri
  serverExternalPackages: ["jsdom", "@react-pdf/renderer", "sharp"],
};

export default nextConfig;
