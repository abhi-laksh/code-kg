import fs from "fs";
import path from "path";
import { ROOT } from "../config.js";

const TEMPLATE_DIR = path.join(__dirname, "..", "..", "brain-template", "templates");

const TYPE_TO_TEMPLATE: Record<string, string> = {
  feature:      "feature-index.md",
  subfeature:   "subfeature-index.md",
  task:         "task.md",
  flow:         "flow.md",
  error:        "error.md",
  "edge-case":  "edge-case.md",
  "test-case":  "test-case.md",
  page:         "fe-page.md",
  component:    "fe-component.md",
  state:        "fe-state.md",
  function:     "be-function.md",
  architecture: "architecture.md",
  adr:          "adr.md",
};

export function runNew(type: string, destPath: string): void {
  const templateName = TYPE_TO_TEMPLATE[type.toLowerCase()];
  if (!templateName) {
    console.error(`[new] unknown type "${type}". Available types:\n  ${Object.keys(TYPE_TO_TEMPLATE).join(", ")}`);
    process.exit(1);
  }

  const templatePath = path.join(TEMPLATE_DIR, templateName);
  if (!fs.existsSync(templatePath)) {
    console.error(`[new] template not found: ${templatePath}`);
    console.error(`      Run "code-kg init" first to scaffold the brain-template structure.`);
    process.exit(1);
  }

  const absDestPath = path.isAbsolute(destPath) ? destPath : path.join(ROOT, destPath);
  if (fs.existsSync(absDestPath)) {
    console.error(`[new] file already exists: ${absDestPath}`);
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(absDestPath), { recursive: true });
  fs.copyFileSync(templatePath, absDestPath);

  const relDest = path.relative(ROOT, absDestPath);
  console.log(`[new] created ${relDest}  (type: ${type})`);
  console.log(`      Fill in the frontmatter fields and run "code-kg sync ${relDest}" to index it.`);
}
