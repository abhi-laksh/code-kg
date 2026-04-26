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
    // feature
    feature: "feature.md",
    subfeature: "feature.md",
    // task
    task: "task.md",
    subtask: "task.md",
    migration: "task.md",
    refactor: "task.md",
    // code entities
    code: "code.md",
    function: "code.md",
    component: "code.md",
    hook: "code.md",
    service: "code.md",
    module: "code.md",
    api: "code.md",
    schema: "code.md",
    // other
    test: "test.md",
    app: "app.md",
    architecture: "architecture.md",
    tool: "tool.md",
    "edge-case": "edge-case.md",
    edge: "edge-case.md",
};
function runNew(type, destPath) {
    const templateName = TYPE_TO_TEMPLATE[type.toLowerCase()];
    if (!templateName) {
        const types = [...new Set(Object.keys(TYPE_TO_TEMPLATE))].join(", ");
        console.error(`[new] unknown type "${type}". Available types:\n  ${types}`);
        process.exit(1);
    }
    const templatePath = path_1.default.join(TEMPLATE_DIR, templateName);
    if (!fs_1.default.existsSync(templatePath)) {
        console.error(`[new] template not found: ${templatePath}`);
        console.error(`      Run "code-kg init-templates" first to scaffold the brain-template structure.`);
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
