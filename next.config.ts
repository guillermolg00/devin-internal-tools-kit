import type { NextConfig } from "next";

const config: NextConfig = {
  serverExternalPackages: ["@libsql/client"],
  poweredByHeader: false,
};

export default config;
