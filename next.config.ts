import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // firebase-admin → jwks-rsa → jose@6 (pure ESM, no CommonJS build). On Netlify's
  // Lambda runtime the server bundle is CommonJS and was left require()-ing jose,
  // which throws ERR_REQUIRE_ESM and 500s every authenticated route (/api/auth/me).
  // transpilePackages forces Next/Turbopack to bundle & down-level these to the
  // server's module format instead of leaving them as raw external require()s, so
  // the ESM import resolves correctly.
  transpilePackages: ["firebase-admin", "jwks-rsa", "jose"],

  // Firebase's custom action URL appears to require the path its own handler
  // uses — `/__/auth/action` — and rejected a plain `/reset` in the Console.
  // Serving our reset page from that path too means either form is accepted,
  // without a second copy of the route.
  //
  // Firebase appends ?mode=&oobCode=, and query strings survive a rewrite, so
  // the page still receives everything it needs.
  async rewrites() {
    return [{ source: "/__/auth/action", destination: "/reset" }];
  },
};

export default nextConfig;
