import type { NextConfig } from "next";

const isStaticExport = process.env.NEXUSFLOW_STATIC_EXPORT === "1";
const basePath = process.env.NEXUSFLOW_BASE_PATH || "";

const nextConfig: NextConfig = {
  output: isStaticExport ? "export" : "standalone",
  basePath,
  images: { unoptimized: true },
};

export default nextConfig;
