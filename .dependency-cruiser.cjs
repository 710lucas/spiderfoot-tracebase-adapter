/**
 * Architecture rules, checked by `npm run check:architecture`.
 * The tool has no runtime dependencies, so the rules are only about the shape of the code itself.
 */

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      comment: "Cycles make modules impossible to understand or test in isolation.",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-orphans",
      comment: "A file nothing imports is dead code or a forgotten wiring.",
      severity: "warn",
      from: {
        orphan: true,
        pathNot: ["(^|/)\\.[^/]+\\.(c|m)?js$", "\\.d\\.ts$", "\\.test\\.ts$", "^src/main\\.ts$"],
      },
      to: {},
    },
    {
      name: "src-never-imports-tests",
      comment: "Production code must not depend on test code.",
      severity: "error",
      from: { path: "^src" },
      to: { path: "^tests" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"],
      extensions: [".ts", ".js"],
    },
  },
};
