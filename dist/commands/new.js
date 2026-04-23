"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runNew = runNew;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const config_js_1 = require("../config.js");
const TEMPLATE_DIR = path_1.default.join(__dirname, "..", "..", "brain-template", "templates");
const TYPE_TO_TEMPLATE = {
    feature: "feature-index.md",
    subfeature: "subfeature-index.md",
    task: "task.md",
    flow: "flow.md",
    error: "error.md",
    "edge-case": "edge-case.md",
    "test-case": "test-case.md",
    page: "fe-page.md",
    component: "fe-component.md",
    state: "fe-state.md",
    function: "be-function.md",
    architecture: "architecture.md",
    adr: "adr.md",
};
function runNew(type, destPath) {
    const templateName = TYPE_TO_TEMPLATE[type.toLowerCase()];
    if (!templateName) {
        console.error(`[new] unknown type "${type}". Available types:\n  ${Object.keys(TYPE_TO_TEMPLATE).join(", ")}`);
        process.exit(1);
    }
    const templatePath = path_1.default.join(TEMPLATE_DIR, templateName);
    if (!fs_1.default.existsSync(templatePath)) {
        console.error(`[new] template not found: ${templatePath}`);
        console.error(`      Run "code-kg init" first to scaffold the brain-template structure.`);
        process.exit(1);
    }
    const absDestPath = path_1.default.isAbsolute(destPath) ? destPath : path_1.default.join(config_js_1.ROOT, destPath);
    if (fs_1.default.existsSync(absDestPath)) {
        console.error(`[new] file already exists: ${absDestPath}`);
        process.exit(1);
    }
    fs_1.default.mkdirSync(path_1.default.dirname(absDestPath), { recursive: true });
    fs_1.default.copyFileSync(templatePath, absDestPath);
    const relDest = path_1.default.relative(config_js_1.ROOT, absDestPath);
    console.log(`[new] created ${relDest}  (type: ${type})`);
    console.log(`      Fill in the frontmatter fields and run "code-kg sync ${relDest}" to index it.`);
}
