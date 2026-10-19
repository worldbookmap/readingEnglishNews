import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 문장 used to be its own tab; it now lives under 단어·문장.
  // A whole book can be pasted into the 책 추가 form (Vercel caps request bodies at 4.5MB).
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  redirects: async () => [{ source: "/sentences", destination: "/words?tab=sentences", permanent: false }],
};

export default nextConfig;
