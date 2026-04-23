"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDriver = getDriver;
exports.openSession = openSession;
exports.closeDriver = closeDriver;
exports.toInt = toInt;
exports.unwrapRecord = unwrapRecord;
const neo4j_driver_1 = __importDefault(require("neo4j-driver"));
let _driver = null;
function getDriver(cfg) {
    if (!_driver) {
        _driver = neo4j_driver_1.default.driver(cfg.uri, neo4j_driver_1.default.auth.basic(cfg.username, cfg.password));
    }
    return _driver;
}
function openSession(cfg) {
    return getDriver(cfg).session({ database: cfg.database });
}
async function closeDriver() {
    if (_driver) {
        await _driver.close();
        _driver = null;
    }
}
function toInt(x) {
    return neo4j_driver_1.default.int(x ?? 0);
}
function unwrapRecord(rec) {
    const out = {};
    for (const k of rec.keys) {
        const v = rec.get(k);
        if (v && typeof v === "object" && "low" in v) {
            out[k] = v.low;
        }
        else {
            out[k] = v;
        }
    }
    return out;
}
