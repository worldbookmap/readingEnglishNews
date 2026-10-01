import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 문장 used to be its own tab; it now lives under 단어·문장.
  redirects: async () => [{ source: "/sentences", destination: "/words?tab=sentences", permanent: false }],
};

export default nextConfig;
