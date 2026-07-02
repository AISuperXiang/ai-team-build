const fs = require("fs");
const path = require("path");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content.endsWith("\n") ? content : `${content}\n`, "utf8");
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function kebabToTitle(value) {
  return String(value || "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function markdownList(items) {
  const list = Array.isArray(items) ? items : [];
  return list.length > 0 ? list.map((item) => `- ${item}`).join("\n") : "-";
}

function yamlScalar(value) {
  return JSON.stringify(String(value ?? ""));
}

function yamlList(items) {
  const list = Array.isArray(items) ? items : [];
  return list.length > 0 ? list.map((item) => `  - ${yamlScalar(item)}`).join("\n") : "  - \"\"";
}

function commandFileName(prefix) {
  return String(prefix || "").replace(/^\//, "");
}

function renderTemplate(template, data) {
  return template.replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g, (_, keyPath) => {
    const value = keyPath.split(".").reduce((current, key) => {
      if (current && Object.prototype.hasOwnProperty.call(current, key)) return current[key];
      return "";
    }, data);
    return Array.isArray(value) ? value.join("\n") : String(value ?? "");
  });
}

function renderTemplateFile(templatePath, data) {
  return renderTemplate(fs.readFileSync(templatePath, "utf8"), data);
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) {
      args._.push(value);
      continue;
    }
    const key = value.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

module.exports = {
  commandFileName,
  ensureDir,
  kebabToTitle,
  markdownList,
  parseArgs,
  readJson,
  renderTemplate,
  renderTemplateFile,
  writeFile,
  yamlScalar,
  yamlList
};
