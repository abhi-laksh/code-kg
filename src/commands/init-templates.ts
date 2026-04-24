import fs from "fs";
import path from "path";
import { ROOT } from "../config.js";

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

export function runInitTemplates(): void {
  if (!fs.existsSync(TEMPLATE_DIR)) {
    console.warn(`[init-templates] brain-template not found at ${TEMPLATE_DIR}`);
    return;
  }

  console.log("[init-templates] scaffolding knowledge base structure…\n");
  copyDir(TEMPLATE_DIR, ROOT);
  console.log("\n[init-templates] done!");
}
