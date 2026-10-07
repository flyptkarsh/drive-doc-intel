import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The SQL guard's parser loads a WebAssembly file at runtime; load it from
  // node_modules instead of bundling it.
  serverExternalPackages: ["libpg-query"],
  /* config options here */
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
