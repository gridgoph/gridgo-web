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
  /**
   * This machine's native file-watch cap is already full. Turbopack then fails
   * `raw_read_dir` on an installed package (e.g. `@base-ui/react/alert-dialog`)
   * and reports it as missing. Poll so resolve does not need another watch.
   */
  watchOptions: {
    pollIntervalMs: 1000,
  },
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        poll: 1000,
        aggregateTimeout: 300,
        ignored: ["**/.git/**", "**/node_modules/**"],
      };
    }
    return config;
  },
};

export default nextConfig;
