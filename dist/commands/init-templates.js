"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runInitTemplates = runInitTemplates;
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
function runInitTemplates() {
    if (!fs_1.default.existsSync(TEMPLATE_DIR)) {
        console.warn(`[init-templates] brain-template not found at ${TEMPLATE_DIR}`);
        return;
    }
    console.log("[init-templates] scaffolding knowledge base structure…\n");
    copyDir(TEMPLATE_DIR, config_js_1.ROOT);
    console.log("\n[init-templates] done!");
}
