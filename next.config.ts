import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Standalone output traces the exact server files this app imports and emits
   * them, with a minimal `node_modules`, into `.next/standalone`. The production
   * image copies that instead of the full dependency tree, so the runtime layer
   * carries no build toolchain and no dev dependencies.
   *
   * Docker deployment: see `docs/DEPLOYMENT.md`.
   */
  output: "standalone",
};

export default nextConfig;
