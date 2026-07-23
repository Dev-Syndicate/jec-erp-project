import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // firebase-admin → jwks-rsa → jose@6 (pure ESM, no CommonJS build). On Netlify's
  // Lambda runtime the server bundle is CommonJS and was left require()-ing jose,
  // which throws ERR_REQUIRE_ESM and 500s every authenticated route (/api/auth/me).
  // transpilePackages forces Next/Turbopack to bundle & down-level these to the
  // server's module format instead of leaving them as raw external require()s, so
  // the ESM import resolves correctly.
  transpilePackages: ["firebase-admin", "jwks-rsa", "jose"],
};

export default nextConfig;
