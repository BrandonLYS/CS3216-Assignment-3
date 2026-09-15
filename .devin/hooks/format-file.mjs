// PostToolUse hook: prettier + eslint --fix the file that was just edited/written.
// Reads the hook payload from stdin; prints remaining lint errors back as context.
import { spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import path from "node:path";

const root = realpathSync(process.env.DEVIN_PROJECT_DIR ?? process.cwd());
const bin = (name) => path.join(root, "node_modules", ".bin", name);

/** True when `file` lives under `root` (directory boundary, symlinks resolved). */
function insideRoot(file) {
  const rel = path.relative(root, file);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

const PRETTIER_EXT = new Set([".ts", ".tsx", ".mts", ".js", ".mjs", ".json", ".css", ".md", ".yml", ".yaml"]);
const ESLINT_EXT = new Set([".ts", ".tsx", ".mts"]);

let payload = {};
try {
  payload = JSON.parse(await new Response(process.stdin).text());
} catch {
  process.exit(0);
}

const input = payload.tool_input ?? {};
const files = [input.file_path, input.notebook_path, ...(input.files ?? [])]
  .filter((f) => typeof f === "string")
  .map((f) => path.resolve(root, f))
  .filter((f) => existsSync(f))
  .map((f) => realpathSync(f))
  .filter(insideRoot);

if (!files.length || !existsSync(bin("prettier"))) process.exit(0);

const run = (cmd, args) => spawnSync(cmd, args, { cwd: root, encoding: "utf8" });
const problems = [];
const report = (tool, res) => {
  const out = `${res.stdout}${res.stderr}`.trim();
  if (res.status !== 0 && out) problems.push(`${tool}:\n${out}`);
};

const prettierTargets = files.filter((f) => PRETTIER_EXT.has(path.extname(f)));
if (prettierTargets.length) {
  report("Prettier failed", run(bin("prettier"), ["--write", "--log-level=warn", ...prettierTargets]));
}

const eslintTargets = files.filter((f) => ESLINT_EXT.has(path.extname(f)));
if (eslintTargets.length && existsSync(bin("eslint"))) {
  report(
    "ESLint still reports issues after --fix",
    run(bin("eslint"), ["--fix", "--max-warnings=0", "--no-warn-ignored", ...eslintTargets]),
  );
}

if (problems.length) {
  console.log(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: problems.join("\n\n") },
    }),
  );
}
