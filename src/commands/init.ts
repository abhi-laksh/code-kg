import fs from "fs";
import path from "path";
import { ROOT, defaultGraphrc } from "../config.js";

const TEMPLATE_DIR = path.join(__dirname, "..", "..", "brain-template");

function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const item of fs.readdirSync(src)) {
    const srcPath = path.join(src, item);
    const destPath = path.join(dest, item);
    if (fs.statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath);
    } else if (!fs.existsSync(destPath)) {
      fs.copyFileSync(srcPath, destPath);
      console.log(`  created  ${path.relative(ROOT, destPath)}`);
    } else {
      console.log(`  skipped  ${path.relative(ROOT, destPath)} (already exists)`);
    }
  }
}

export function runInit(projectName?: string): void {
  const name = projectName ?? path.basename(ROOT);

  // Write .graphrc.json
  const rcPath = path.join(ROOT, ".graphrc.json");
  if (fs.existsSync(rcPath)) {
    console.log("  skipped  .graphrc.json (already exists)");
  } else {
    fs.writeFileSync(rcPath, JSON.stringify(defaultGraphrc(name), null, 2) + "\n");
    console.log("  created  .graphrc.json");
  }

  // Copy brain-template structure
  if (!fs.existsSync(TEMPLATE_DIR)) {
    console.warn(`[init] brain-template not found at ${TEMPLATE_DIR} — skipping docs scaffold`);
    return;
  }

  console.log("\n[init] scaffolding knowledge base structure…");
  copyDir(TEMPLATE_DIR, ROOT);

  console.log(`
[init] done!

Next steps:
  1. Edit .graphrc.json — set your Neo4j credentials
  2. Run: code-kg ping       — verify the connection
  3. Run: code-kg rebuild    — index your codebase
  4. Run: code-kg watch      — keep it in sync while you work
`);
}
