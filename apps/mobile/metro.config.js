// Metro monorepo config for pnpm (Build Plan §2 "Shared packages"): Metro's
// default resolver doesn't follow pnpm's symlinked node_modules or look
// outside the app directory, so without this apps/mobile can't import
// @careconnect/contracts or @careconnect/tokens at all.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
// Left at the default (hierarchical lookup enabled): pnpm resolves nested
// dependencies (e.g. expo -> expo-modules-core) through each package's own
// symlinked node_modules, not a single flattened tree, so Metro needs the
// normal walk-up-and-follow-symlinks behavior rather than the
// single-directory resolution `disableHierarchicalLookup: true` forces.
config.resolver.unstable_enableSymlinks = true;

// packages/core, contracts, and tokens are consumed as raw TypeScript
// source (no build step — see each package's "main": "src/index.ts") and
// use the modern TS convention of writing relative imports with a literal
// ".js" extension pointing at ".ts" files (tsc/vitest resolve this fine
// under moduleResolution: "Bundler"; Metro's resolver does not). Retry the
// resolution with the extension stripped so Metro's normal sourceExts
// lookup (which includes .ts/.tsx) can find the real file.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith(".") && moduleName.endsWith(".js")) {
    try {
      return context.resolveRequest(context, moduleName.slice(0, -3), platform);
    } catch {
      // Fall through to the real .js resolution below.
    }
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
