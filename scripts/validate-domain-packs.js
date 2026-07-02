#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { readJson } = require("./template-utils");
const { validateSpec } = require("./validate-team-spec");

const ROOT = path.resolve(__dirname, "..");
const PACKS_DIR = path.join(ROOT, "domain-packs");
const KEBAB_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function record(results, ok, message) {
  results.push({ ok, message });
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonEmptyArray(value) {
  return Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString);
}

function validatePack(packPath, results) {
  const packDir = path.dirname(packPath);
  const pack = readJson(packPath);
  const label = path.relative(ROOT, packPath);

  record(results, KEBAB_ID.test(pack.id || ""), `${label} has kebab id`);
  record(results, isNonEmptyString(pack.title), `${label} has title`);
  record(results, isNonEmptyString(pack.description), `${label} has description`);
  record(results, isNonEmptyArray(pack.keywords), `${label} has keywords`);
  record(results, ["low", "medium", "high"].includes(pack.riskLevel), `${label} has valid riskLevel`);
  record(results, isNonEmptyArray(pack.capabilities), `${label} has capabilities`);
  record(results, isNonEmptyArray(pack.qualityGates), `${label} has qualityGates`);
  record(results, isNonEmptyArray(pack.artifacts), `${label} has artifacts`);

  const specPath = path.resolve(packDir, pack.recommendedSpecPath || "");
  record(results, fs.existsSync(specPath), `${label} recommended spec exists`);
  if (fs.existsSync(specPath)) {
    const spec = readJson(specPath);
    const reporter = validateSpec(spec);
    record(results, reporter.failedCount() === 0, `${label} recommended spec validates`);
  }
}

function main() {
  const results = [];
  if (!fs.existsSync(PACKS_DIR)) {
    console.error(`Domain packs directory not found: ${PACKS_DIR}`);
    process.exit(1);
  }

  const packFiles = fs.readdirSync(PACKS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(PACKS_DIR, entry.name, "domain-pack.json"))
    .filter((file) => fs.existsSync(file));

  record(results, packFiles.length > 0, "domain-packs has at least one pack");
  for (const packFile of packFiles) validatePack(packFile, results);

  for (const result of results) {
    console.log(`${result.ok ? "PASS" : "FAIL"} ${result.message}`);
  }

  const failed = results.filter((result) => !result.ok);
  if (failed.length > 0) {
    console.error(`\n${failed.length} domain pack validation check(s) failed.`);
    process.exit(1);
  }
  console.log(`\nAll ${results.length} domain pack validation checks passed.`);
}

if (require.main === module) main();
