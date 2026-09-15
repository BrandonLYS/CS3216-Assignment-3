// PostToolUse hook: prettier + eslint --fix the file that was just edited/written.
// Reads the hook payload from stdin; prints remaining lint errors back as context.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const root = process.env.DEVIN_PROJECT_DIR ?? process.cwd();
const bin = (name) => path.join(root, "node_modules", ".bin", name);

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
  .filter((f) => f.startsWith(root) && existsSync(f));

if (!files.length || !existsSync(bin("prettier"))) process.exit(0);

const run = (cmd, args) => spawnSync(cmd, args, { cwd: root, encoding: "utf8" });

const prettierTargets = files.filter((f) => PRETTIER_EXT.has(path.extname(f)));
if (prettierTargets.length) run(bin("prettier"), ["--write", "--log-level=warn", ...prettierTargets]);

const eslintTargets = files.filter((f) => ESLINT_EXT.has(path.extname(f)));
if (eslintTargets.length && existsSync(bin("eslint"))) {
  const res = run(bin("eslint"), ["--fix", "--max-warnings=0", ...eslintTargets]);
  const out = `${res.stdout}${res.stderr}`.trim();
  if (res.status !== 0 && out) {
    console.log(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PostToolUse",
          additionalContext: `ESLint still reports issues after --fix:\n${out}`,
        },
      }),
    );
  }
}
