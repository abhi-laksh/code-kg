"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runInit = runInit;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const config_js_1 = require("../config.js");
const TEMPLATE_DIR = path_1.default.join(__dirname, "..", "..", "brain-template");
function copyDir(src, dest) {
    fs_1.default.mkdirSync(dest, { recursive: true });
    for (const item of fs_1.default.readdirSync(src)) {
        const srcPath = path_1.default.join(src, item);
        const destPath = path_1.default.join(dest, item);
        if (fs_1.default.statSync(srcPath).isDirectory()) {
            copyDir(srcPath, destPath);
        }
        else if (!fs_1.default.existsSync(destPath)) {
            fs_1.default.copyFileSync(srcPath, destPath);
            console.log(`  created  ${path_1.default.relative(config_js_1.ROOT, destPath)}`);
        }
        else {
            console.log(`  skipped  ${path_1.default.relative(config_js_1.ROOT, destPath)} (already exists)`);
        }
    }
}
function runInit(projectName) {
    const name = projectName ?? path_1.default.basename(config_js_1.ROOT);
    // Write .graphrc.json
    const rcPath = path_1.default.join(config_js_1.ROOT, ".graphrc.json");
    if (fs_1.default.existsSync(rcPath)) {
        console.log("  skipped  .graphrc.json (already exists)");
    }
    else {
        fs_1.default.writeFileSync(rcPath, JSON.stringify((0, config_js_1.defaultGraphrc)(name), null, 2) + "\n");
        console.log("  created  .graphrc.json");
    }
    // Copy brain-template structure
    if (!fs_1.default.existsSync(TEMPLATE_DIR)) {
        console.warn(`[init] brain-template not found at ${TEMPLATE_DIR} — skipping docs scaffold`);
        return;
    }
    console.log("\n[init] scaffolding knowledge base structure…");
    copyDir(TEMPLATE_DIR, config_js_1.ROOT);
    console.log(`
[init] done!

Next steps:
  1. Edit .graphrc.json — set your Neo4j credentials
  2. Run: code-kg ping       — verify the connection
  3. Run: code-kg rebuild    — index your codebase
  4. Run: code-kg watch      — keep it in sync while you work
`);
}
