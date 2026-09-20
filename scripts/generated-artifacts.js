"use strict";

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const MANIFEST_FILE = "generation-manifest.json";
const SPEC_SNAPSHOT_FILE = "team-spec.snapshot.json";
const SKIP_SCAN_DIRS = new Set([".git", "node_modules"]);

function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function sha256File(filePath) {
  return sha256(fs.readFileSync(filePath));
}

function normalizeManagedPath(value) {
  const raw = String(value || "").trim();
  if (!raw ||
      raw.includes("\\") ||
      /[\u0000-\u001f\u007f]/.test(raw) ||
      path.posix.isAbsolute(raw)) {
    return null;
  }
  const normalized = path.posix.normalize(raw.startsWith("./") ? raw.slice(2) : raw);
  if (!normalized ||
      normalized === "." ||
      normalized === ".." ||
      normalized.startsWith("../")) {
    return null;
  }
  return normalized;
}

function resolveManagedFile(root, relativePath, options = {}) {
  const normalized = normalizeManagedPath(relativePath);
  if (!normalized) return null;
  const absolutePath = path.join(root, ...normalized.split("/"));
  if (!fs.existsSync(absolutePath)) return options.allowMissing ? { normalized, absolutePath } : null;
  const rootReal = fs.realpathSync(root);
  const fileReal = fs.realpathSync(absolutePath);
  const relativeReal = path.relative(rootReal, fileReal);
  if (!relativeReal || relativeReal.startsWith("..") || path.isAbsolute(relativeReal)) return null;
  let parent = rootReal;
  for (const part of normalized.split("/").slice(0, -1)) {
    parent = path.join(parent, part);
    if (fs.existsSync(parent) && fs.lstatSync(parent).isSymbolicLink()) return null;
  }
  const stat = fs.lstatSync(absolutePath);
  if (!stat.isFile() || stat.isSymbolicLink()) return null;
  return { normalized, absolutePath, bytes: stat.size };
}

function validateManifest(manifest, expectedSkillId = "") {
  const errors = [];
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return ["manifest must be an object"];
  }
  if (manifest.schemaVersion !== "1.0") errors.push("manifest schemaVersion must be 1.0");
  if (manifest.generator !== "ai-team-build") errors.push("manifest generator must be ai-team-build");
  if (expectedSkillId && manifest.skillId !== expectedSkillId) errors.push("manifest skillId does not match target");
  if (!/^\d+\.\d+\.\d+$/.test(String(manifest.generatorVersion || ""))) {
    errors.push("manifest generatorVersion must be semantic");
  }
  if (!/^[a-f0-9]{64}$/.test(String(manifest.specDigest || ""))) {
    errors.push("manifest specDigest must be sha256");
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    errors.push("manifest files must be a non-empty array");
    return errors;
  }
  const seen = new Set();
  for (const file of manifest.files) {
    const normalized = normalizeManagedPath(file && file.path);
    if (!normalized || normalized === MANIFEST_FILE) {
      errors.push(`manifest has invalid managed path: ${(file && file.path) || "unknown"}`);
      continue;
    }
    if (seen.has(normalized)) errors.push(`manifest has duplicate managed path: ${normalized}`);
    seen.add(normalized);
    if (!/^[a-f0-9]{64}$/.test(String(file.sha256 || ""))) {
      errors.push(`manifest has invalid digest: ${normalized}`);
    }
    if (!Number.isSafeInteger(file.bytes) || file.bytes < 0) {
      errors.push(`manifest has invalid byte count: ${normalized}`);
    }
  }
  return errors;
}

function readManifest(root, expectedSkillId = "") {
  const manifestPath = path.join(root, MANIFEST_FILE);
  if (!fs.existsSync(manifestPath) || !fs.lstatSync(manifestPath).isFile()) {
    throw new Error(`Generated team is missing ${MANIFEST_FILE}`);
  }
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(`Invalid ${MANIFEST_FILE}: ${error.message}`);
  }
  const errors = validateManifest(manifest, expectedSkillId);
  if (errors.length > 0) throw new Error(`Invalid ${MANIFEST_FILE}: ${errors.join("; ")}`);
  return manifest;
}

function readGenerationReport(root, expectedSkillId = "") {
  const reportPath = path.join(root, "generation-report.json");
  if (!fs.existsSync(reportPath) || !fs.lstatSync(reportPath).isFile()) {
    throw new Error("Generated team is missing generation-report.json");
  }
  let report;
  try {
    report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  } catch (error) {
    throw new Error(`Invalid generation-report.json: ${error.message}`);
  }
  if (report.generator !== "ai-team-build" ||
      !report.skill ||
      (expectedSkillId && report.skill.id !== expectedSkillId) ||
      report.managedManifest !== MANIFEST_FILE ||
      report.specSnapshot !== SPEC_SNAPSHOT_FILE) {
    throw new Error("generation-report.json does not identify a compatible generated team");
  }
  return report;
}

function buildManifest(root, plannedFiles, metadata) {
  const normalizedFiles = [...new Set(plannedFiles.map(normalizeManagedPath))];
  if (normalizedFiles.includes(null)) throw new Error("Cannot build manifest with unsafe managed paths");
  const files = normalizedFiles
    .filter((relativePath) => relativePath !== MANIFEST_FILE)
    .sort()
    .map((relativePath) => {
      const resolved = resolveManagedFile(root, relativePath);
      if (!resolved) throw new Error(`Cannot manifest missing or non-regular file: ${relativePath}`);
      return {
        path: relativePath,
        sha256: sha256File(resolved.absolutePath),
        bytes: resolved.bytes
      };
    });
  return {
    schemaVersion: "1.0",
    generator: "ai-team-build",
    generatorVersion: metadata.generatorVersion,
    skillId: metadata.skillId,
    generatedAt: metadata.generatedAt,
    specSnapshot: SPEC_SNAPSHOT_FILE,
    specDigest: sha256File(path.join(root, SPEC_SNAPSHOT_FILE)),
    files
  };
}

function writeManifest(root, plannedFiles, metadata) {
  const manifest = buildManifest(root, plannedFiles, metadata);
  fs.writeFileSync(
    path.join(root, MANIFEST_FILE),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  );
  return manifest;
}

function manifestIndex(manifest) {
  return new Map(manifest.files.map((file) => [file.path, file]));
}

function inspectManagedFiles(root, manifest) {
  return manifest.files.map((file) => {
    const resolved = resolveManagedFile(root, file.path);
    if (!resolved) return { path: file.path, status: "missing", expectedSha256: file.sha256 };
    const actualSha256 = sha256File(resolved.absolutePath);
    return {
      path: file.path,
      status: actualSha256 === file.sha256 ? "unchanged" : "modified",
      expectedSha256: file.sha256,
      actualSha256
    };
  });
}

function collectRegularFiles(root, current = root, files = []) {
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    if (SKIP_SCAN_DIRS.has(entry.name)) continue;
    const absolutePath = path.join(current, entry.name);
    const relativePath = path.relative(root, absolutePath).split(path.sep).join("/");
    if (entry.isSymbolicLink()) {
      files.push({ path: relativePath, type: "symlink" });
    } else if (entry.isDirectory()) {
      collectRegularFiles(root, absolutePath, files);
    } else if (entry.isFile()) {
      files.push({ path: relativePath, type: "file" });
    }
  }
  return files;
}

function planUpgrade(existingRoot, candidateRoot, expectedSkillId) {
  readGenerationReport(existingRoot, expectedSkillId);
  readGenerationReport(candidateRoot, expectedSkillId);
  const previous = readManifest(existingRoot, expectedSkillId);
  const candidate = readManifest(candidateRoot, expectedSkillId);
  const previousIndex = manifestIndex(previous);
  const candidateIndex = manifestIndex(candidate);
  const plan = {
    schemaVersion: "1.0",
    kind: "ai-team-build.upgrade-plan",
    skillId: expectedSkillId,
    fromGeneratorVersion: previous.generatorVersion,
    toGeneratorVersion: candidate.generatorVersion,
    create: [],
    update: [],
    delete: [],
    unchanged: [],
    conflicts: [],
    preserved: []
  };

  for (const [relativePath, previousFile] of previousIndex) {
    const current = resolveManagedFile(existingRoot, relativePath);
    const next = candidateIndex.get(relativePath);
    if (!current) {
      if (next) plan.conflicts.push({ path: relativePath, reason: "managed-file-missing" });
      else plan.unchanged.push(relativePath);
      continue;
    }
    const currentSha256 = sha256File(current.absolutePath);
    if (next && currentSha256 === next.sha256) {
      plan.unchanged.push(relativePath);
    } else if (currentSha256 !== previousFile.sha256) {
      plan.conflicts.push({ path: relativePath, reason: "managed-file-modified" });
    } else if (next) {
      plan.update.push(relativePath);
    } else {
      plan.delete.push(relativePath);
    }
  }

  for (const [relativePath, next] of candidateIndex) {
    if (previousIndex.has(relativePath)) continue;
    const current = resolveManagedFile(existingRoot, relativePath);
    if (!current) {
      plan.create.push(relativePath);
    } else if (sha256File(current.absolutePath) === next.sha256) {
      plan.unchanged.push(relativePath);
    } else {
      plan.conflicts.push({ path: relativePath, reason: "new-managed-path-already-exists" });
    }
  }

  const managed = new Set([
    MANIFEST_FILE,
    ...previous.files.map((file) => file.path),
    ...candidate.files.map((file) => file.path)
  ]);
  plan.preserved = collectRegularFiles(existingRoot)
    .filter((file) => !managed.has(file.path))
    .map((file) => file.path)
    .sort();
  for (const file of collectRegularFiles(existingRoot).filter((item) => item.type === "symlink")) {
    if (managed.has(file.path)) {
      plan.conflicts.push({ path: file.path, reason: "managed-path-is-symlink" });
    }
  }
  plan.unchanged = [...new Set(plan.unchanged)].sort();
  return plan;
}

function assertNoSymlinkParents(root, relativePath) {
  let current = root;
  for (const part of normalizeManagedPath(relativePath).split("/").slice(0, -1)) {
    current = path.join(current, part);
    if (!fs.existsSync(current)) continue;
    if (fs.lstatSync(current).isSymbolicLink()) {
      throw new Error(`Refusing managed write through symlink: ${relativePath}`);
    }
  }
}

function applyUpgrade(existingRoot, candidateRoot, plan) {
  if (plan.conflicts.length > 0) {
    throw new Error(`Upgrade has ${plan.conflicts.length} conflict(s); no files were changed`);
  }
  const backupRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-team-build-upgrade-"));
  const existingManifest = path.join(existingRoot, MANIFEST_FILE);
  const touchedExisting = [...plan.update, ...plan.delete, MANIFEST_FILE];
  const created = [...plan.create];

  try {
    for (const relativePath of touchedExisting) {
      const source = path.join(existingRoot, ...relativePath.split("/"));
      if (!fs.existsSync(source)) continue;
      const backup = path.join(backupRoot, ...relativePath.split("/"));
      fs.mkdirSync(path.dirname(backup), { recursive: true });
      fs.copyFileSync(source, backup);
    }
    for (const relativePath of [...plan.create, ...plan.update]) {
      assertNoSymlinkParents(existingRoot, relativePath);
      const source = path.join(candidateRoot, ...relativePath.split("/"));
      const target = path.join(existingRoot, ...relativePath.split("/"));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(source, target);
    }
    for (const relativePath of plan.delete) {
      const target = path.join(existingRoot, ...relativePath.split("/"));
      if (fs.existsSync(target)) fs.unlinkSync(target);
    }
    fs.copyFileSync(path.join(candidateRoot, MANIFEST_FILE), existingManifest);
  } catch (error) {
    for (const relativePath of [...created, ...plan.update, ...plan.delete, MANIFEST_FILE]) {
      const target = path.join(existingRoot, ...relativePath.split("/"));
      const backup = path.join(backupRoot, ...relativePath.split("/"));
      if (fs.existsSync(target) && !fs.existsSync(backup)) fs.rmSync(target, { force: true });
      if (fs.existsSync(backup)) {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(backup, target);
      }
    }
    throw error;
  } finally {
    fs.rmSync(backupRoot, { recursive: true, force: true });
  }
}

function assertReplaceableGeneratedDirectory(root, expectedSkillId) {
  if (fs.existsSync(path.join(root, ".git"))) {
    throw new Error("Refusing --overwrite on a Git repository; use --upgrade");
  }
  readGenerationReport(root, expectedSkillId);
  const manifest = readManifest(root, expectedSkillId);
  const drift = inspectManagedFiles(root, manifest).filter((item) => item.status !== "unchanged");
  if (drift.length > 0) {
    throw new Error(`Refusing --overwrite because ${drift.length} managed file(s) drifted; use --upgrade`);
  }
  const managed = new Set([MANIFEST_FILE, ...manifest.files.map((file) => file.path)]);
  const unexpected = collectRegularFiles(root).filter((file) => !managed.has(file.path));
  if (unexpected.length > 0) {
    throw new Error(`Refusing --overwrite because ${unexpected.length} untracked file(s) would be deleted; use --upgrade`);
  }
}

module.exports = {
  MANIFEST_FILE,
  SPEC_SNAPSHOT_FILE,
  applyUpgrade,
  assertReplaceableGeneratedDirectory,
  buildManifest,
  inspectManagedFiles,
  normalizeManagedPath,
  planUpgrade,
  readGenerationReport,
  readManifest,
  sha256,
  sha256File,
  validateManifest,
  writeManifest
};
