import fs from "fs";
import path from "path";
import readline from "readline";
import { ROOT } from "../config.js";

const BRAIN_TEMPLATE_DIR = path.join(__dirname, "..", "..", "brain-template");
const TEMPLATE_DIR = path.join(BRAIN_TEMPLATE_DIR, "templates");

const TEMPLATES: { file: string; label: string; desc: string }[] = [
  { file: "architecture.md", label: "architecture",  desc: "Full system architecture — stack, infra, cloud, APIs, decisions" },
  { file: "app.md",          label: "app",           desc: "Application — purpose, stack, tools, features, env, deploy" },
  { file: "feature.md",      label: "feature",       desc: "Feature — problem, goal, scope, tasks, code references" },
  { file: "task.md",         label: "task",          desc: "Task/subtask/migration — why, plan, files, done criteria" },
  { file: "code.md",         label: "code",          desc: "Function/component/service — signature, behavior, gotchas" },
  { file: "test.md",         label: "test",          desc: "Test suite — scenarios, pass/fail criteria, how to run" },
  { file: "edge-case.md",    label: "edge-case",     desc: "Edge case — scenario, root cause, expected vs failure behavior" },
  { file: "tool.md",         label: "tool",          desc: "Library/SDK/service — purpose, usage, config, limitations" },
];

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

function copyFile(src: string, dest: string): void {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (!fs.existsSync(dest)) {
    fs.copyFileSync(src, dest);
    console.log(`  created  ${path.relative(ROOT, dest)}`);
  } else {
    console.log(`  skipped  ${path.relative(ROOT, dest)} (already exists)`);
  }
}

export async function runInitTemplates(): Promise<void> {
  if (!fs.existsSync(BRAIN_TEMPLATE_DIR)) {
    console.warn(`[init-templates] brain-template not found at ${BRAIN_TEMPLATE_DIR}`);
    return;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    console.log("\n[init-templates] Available template types:\n");
    TEMPLATES.forEach((t, i) => {
      console.log(`  ${i + 1}. ${t.label.padEnd(14)} ${t.desc}`);
    });
    console.log();

    const selection = await ask(rl, 'Select types to scaffold (e.g. "1,3,5" or "all"): ');
    const trimmed = selection.trim().toLowerCase();

    let chosen: typeof TEMPLATES;
    if (trimmed === "all" || trimmed === "") {
      chosen = TEMPLATES;
    } else {
      const indices = trimmed.split(/[,\s]+/).map((s) => parseInt(s, 10) - 1);
      chosen = indices
        .filter((i) => i >= 0 && i < TEMPLATES.length)
        .map((i) => TEMPLATES[i]);
      if (!chosen.length) {
        console.error("[init-templates] no valid selection. Aborting.");
        return;
      }
    }

    console.log();
    const destinations: { template: typeof TEMPLATES[0]; destDir: string }[] = [];
    for (const t of chosen) {
      const defaultDir = `docs/${t.label}s`;
      const answer = await ask(rl, `  Destination dir for ${t.label} docs? (default: ${defaultDir}): `);
      destinations.push({ template: t, destDir: answer.trim() || defaultDir });
    }

    console.log("\n[init-templates] scaffolding…\n");

    // always copy shared docs to project root
    for (const name of ["relationships.md", "README.md"]) {
      const src = path.join(BRAIN_TEMPLATE_DIR, name);
      if (fs.existsSync(src)) copyFile(src, path.join(ROOT, name));
    }

    for (const { template, destDir } of destinations) {
      const src = path.join(TEMPLATE_DIR, template.file);
      const absDir = path.isAbsolute(destDir) ? destDir : path.join(ROOT, destDir);
      const dest = path.join(absDir, template.file);
      copyFile(src, dest);
    }

    console.log("\n[init-templates] done!");
    console.log('  Run "code-kg sync <path>" on any file after filling in its frontmatter.');
  } finally {
    rl.close();
  }
}
