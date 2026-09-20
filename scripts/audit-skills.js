#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  ".turbo",
  ".tmp",
  "workspace"
]);
const TEXT_EXTENSIONS = new Set([".md", ".json", ".js", ".cjs", ".mjs", ".ts", ".tsx", ".jsx", ".yaml", ".yml"]);

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

function existsFile(filePath) {
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
}

function existsDir(filePath) {
  return fs.existsSync(filePath) && fs.statSync(filePath).isDirectory();
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function readJson(filePath) {
  try {
    return JSON.parse(readText(filePath));
  } catch (error) {
    return null;
  }
}

function findManifest(root) {
  for (const name of ["SKILL.md", "skill.md"]) {
    const candidate = path.join(root, name);
    if (existsFile(candidate)) return candidate;
  }
  return null;
}

function resolveSkillRoot(target) {
  const absolute = path.resolve(process.cwd(), target);
  if (existsFile(absolute) && /^skill\.md$/i.test(path.basename(absolute))) return path.dirname(absolute);
  if (existsDir(absolute) && findManifest(absolute)) return absolute;
  return null;
}

function collectTextFiles(root, files = []) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) {
      collectTextFiles(absolute, files);
      continue;
    }
    if (entry.isFile() && TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) files.push(absolute);
  }
  return files;
}

function scanForSkillRoots(root, results = [], depth = 0) {
  if (depth > 6 || !existsDir(root)) return results;
  if (findManifest(root)) {
    results.push(root);
    return results;
  }
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) continue;
    scanForSkillRoots(path.join(root, entry.name), results, depth + 1);
  }
  return results;
}

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const keyMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!keyMatch) continue;
    data[keyMatch[1]] = keyMatch[2].trim().replace(/^["']|["']$/g, "");
  }
  return data;
}

function hasAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function portablePath(value) {
  const relative = path.relative(process.cwd(), value);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative) ? relative : path.basename(value);
}

function countLines(content) {
  return content === "" ? 0 : content.split(/\r?\n/).length;
}

function dimension(id, name, maxScore, checks) {
  const score = checks.reduce((sum, check) => sum + (check.ok ? check.points : 0), 0);
  return {
    id,
    name,
    maxScore,
    score,
    evidence: checks.filter((check) => check.ok).map((check) => check.evidence),
    gaps: checks.filter((check) => !check.ok).map((check) => check.gap)
  };
}

function priorityFor(score, maxScore) {
  return score === 0 || score <= maxScore * 0.35 ? "P1" : "P2";
}

function makeFinding(dimensionResult, title, evidence, recommendation) {
  if (dimensionResult.gaps.length === 0) return null;
  return {
    priority: priorityFor(dimensionResult.score, dimensionResult.maxScore),
    area: dimensionResult.name,
    title,
    evidence,
    recommendation
  };
}

function recommendedVerification(root, packageJson, allFiles) {
  const commands = [];
  if (packageJson && packageJson.scripts && packageJson.scripts.test) commands.push("npm test");
  if (packageJson && packageJson.scripts && packageJson.scripts.validate) commands.push("npm run validate");
  if (allFiles.some((file) => /run-acceptance|acceptance-scenarios/i.test(path.basename(file)))) {
    commands.push("检查并运行 Skill 声明的 acceptance runner");
  }
  return [...new Set(commands)];
}

function auditSkill(root) {
  const manifestPath = findManifest(root);
  if (!manifestPath) {
    throw new Error(`Skill manifest not found: ${root}`);
  }

  const skillContent = readText(manifestPath);
  const frontmatter = parseFrontmatter(skillContent);
  const allFiles = collectTextFiles(root);
  const corpus = allFiles.map((file) => readText(file)).join("\n");
  const packageJson = existsFile(path.join(root, "package.json")) ? readJson(path.join(root, "package.json")) : null;
  const skillLineCount = countLines(skillContent);
  const manifestName = frontmatter && frontmatter.name;
  const description = frontmatter && frontmatter.description;
  const fileNames = new Set(allFiles.map((file) => path.relative(root, file).replace(/\\/g, "/")));
  const hasTeamRoleDefinitions = [...fileNames].some((file) => /^members\/[^/]+\.md$/.test(file) && !file.endsWith("README.md"));
  const hasRolePlan = hasAny(corpus, [/rolePlan\b/, /角色激活计划/, /role activation/i]);
  const hasRoleModes = ["active", "consulted", "not_applicable"].every((mode) => corpus.includes(mode));
  const hasRolePlanFields = ["reason", "stages"].every((field) => corpus.includes(field));
  const hasNotApplicableScoring = hasAny(corpus, [
    /not_applicable[\s\S]{0,400}N\/A/i,
    /N\/A[\s\S]{0,400}not_applicable/i,
    /不适用角色[\s\S]{0,400}N\/A/,
    /N\/A[\s\S]{0,400}不适用/
  ]);
  const hasRolePlanReassessment = hasAny(corpus, [
    /重新评估[\s\S]{0,80}rolePlan/,
    /rolePlan[\s\S]{0,80}重新评估/,
    /re-?evaluate[\s\S]{0,80}role/i,
    /reassess[\s\S]{0,80}role/i
  ]);
  const hasRoleActivationContract = !hasTeamRoleDefinitions || (
    hasRolePlan &&
    hasRoleModes &&
    hasRolePlanFields &&
    hasNotApplicableScoring &&
    hasRolePlanReassessment
  );

  const discovery = dimension("discovery-boundary", "发现与边界", 18, [
    {
      ok: Boolean(frontmatter && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(manifestName || "")),
      points: 6,
      evidence: "SKILL.md 具有合法的 kebab-case name。",
      gap: "SKILL.md 缺少或使用了不兼容的 name。"
    },
    {
      ok: Boolean(description && description.length <= 1024),
      points: 4,
      evidence: "frontmatter description 存在且长度可用于发现。",
      gap: "description 缺失或超过 1024 字符，可能影响隐式路由。"
    },
    {
      ok: hasAny(skillContent, [/Use when/i, /触发边界/, /适用场景/, /触发条件/]),
      points: 4,
      evidence: "入口包含明确的触发说明。",
      gap: "缺少可被模型用于路由的触发说明。"
    },
    {
      ok: hasAny(skillContent, [/不适用/, /不该用/, /Don't use/i, /Not for/i]),
      points: 4,
      evidence: "入口声明了负向边界。",
      gap: "缺少不适用场景，容易与相邻 Skill 重叠。"
    }
  ]);

  const context = dimension("context-loading", "上下文与加载", 14, [
    {
      ok: skillLineCount <= 500,
      points: 4,
      evidence: `SKILL.md 共 ${skillLineCount} 行，满足精简入口约束。`,
      gap: `SKILL.md 共 ${skillLineCount} 行，建议下沉长参考或示例。`
    },
    {
      ok: hasAny(skillContent, [/最小加载/, /按需读取/, /progressive disclosure/i, /only load/i]),
      points: 4,
      evidence: "入口声明最小加载或按需读取策略。",
      gap: "入口未声明最小加载策略，复杂任务可能加载过多上下文。"
    },
    {
      ok: fileNames.has("docs/README.md") || fileNames.has("references/README.md") || fileNames.has("workflows/README.md"),
      points: 3,
      evidence: "Skill 提供了可导航的二级文档入口。",
      gap: "缺少文档导航入口，难以按需定位细节。"
    },
    {
      ok: allFiles.some((file) => /assets|templates|scripts/.test(path.relative(root, file))),
      points: 3,
      evidence: "Skill 将模板或确定性操作放入独立资源。",
      gap: "未发现模板或脚本资源；评估是否存在应下沉的重复操作。"
    }
  ]);

  const execution = dimension("execution-orchestration", "执行与协作", 22, [
    {
      ok: fileNames.has("workflows/route-table.md") || hasAny(skillContent, [/路由规则/, /Route/, /workflow/i]),
      points: 4,
      evidence: "存在工作流路由或等价执行入口。",
      gap: "缺少从用户意图到主工作流的确定性路由。"
    },
    {
      ok: hasAny(corpus, [/阶段表/, /执行循环/, /Step 1/i, /workflow/i]),
      points: 4,
      evidence: "存在分阶段执行协议。",
      gap: "缺少输入、阶段、产出与完成定义组成的执行协议。"
    },
    {
      ok: hasAny(corpus, [/blocked/, /阻塞/, /失败处理/, /Failure/]),
      points: 3,
      evidence: "定义了阻塞或失败处理。",
      gap: "缺少失败、重试、停止或升级条件。"
    },
    {
      ok: hasAny(corpus, [/executionProfile/, /执行档位/, /复杂度分级/, /risk level/i]),
      points: 4,
      evidence: "按风险或复杂度调整执行强度。",
      gap: "缺少风险/复杂度分级，容易对简单任务过度编排或对高风险任务不足验证。"
    },
    {
      ok: hasAny(corpus, [/并行/, /hybrid/, /sub.?agent/i]) && hasAny(corpus, [/共享写入/, /文件所有权/, /独立/, /冲突/]),
      points: 3,
      evidence: "并行协作包含边界或冲突控制。",
      gap: "未定义并行角色的输入、写入边界或冲突处理。"
    },
    {
      ok: hasRoleActivationContract,
      points: 4,
      evidence: hasTeamRoleDefinitions
        ? "团队角色具有可重评的 rolePlan、参与模式和 N/A 规则。"
        : "未发现团队角色目录，角色激活契约不适用。",
      gap: "团队角色被当作候选池，但缺少 rolePlan、active/consulted/not_applicable 模式、N/A 评分依据或重评条件。"
    }
  ]);

  const verification = dimension("verification-evidence", "验证与证据", 22, [
    {
      ok: Boolean(packageJson && packageJson.scripts && packageJson.scripts.test),
      points: 5,
      evidence: "package.json 声明了 npm test。",
      gap: "未发现可执行的 npm test 入口。"
    },
    {
      ok: allFiles.some((file) => /validate|verify|check/i.test(path.basename(file))),
      points: 5,
      evidence: "存在校验或验证脚本。",
      gap: "未发现确定性的结构、契约或结果校验脚本。"
    },
    {
      ok: hasAny(corpus, [/acceptance scenario/i, /验收场景/, /golden/i, /regression/i, /回归/]),
      points: 4,
      evidence: "包含验收场景或回归约束。",
      gap: "缺少可重复的验收场景或回归样例。"
    },
    {
      ok: hasAny(corpus, [/evidence/i, /证据/, /verificationLevel/, /验证等级/]),
      points: 4,
      evidence: "结论与证据或验证等级建立了关联。",
      gap: "缺少证据索引或验证结论边界。"
    },
    {
      ok: hasAny(corpus, [/无法运行/, /未验证/, /未覆盖/, /not verified/i]),
      points: 4,
      evidence: "规定无法验证时需要保留风险。",
      gap: "未定义验证不可运行时的降级结论与剩余风险。"
    }
  ]);

  const security = dimension("safety-portability", "安全与可移植性", 12, [
    {
      ok: !/\/Users\/|C:\\Users\\/i.test(corpus),
      points: 6,
      evidence: "未发现本机绝对路径。",
      gap: "发现本机绝对路径，发布后会破坏可移植性。"
    },
    {
      ok: !/(-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:api[_-]?key|secret|token)\s*[:=]\s*["'][A-Za-z0-9_\-]{12,}["'])/i.test(corpus),
      points: 6,
      evidence: "未发现疑似明文凭据模式。",
      gap: "发现疑似明文凭据模式，需要人工安全复核。"
    }
  ]);

  const evolution = dimension("evolution-maintenance", "演进与维护", 12, [
    {
      ok: Boolean((frontmatter && frontmatter.metadata) || (packageJson && packageJson.version) || hasAny(skillContent, [/version/i, /版本/])),
      points: 3,
      evidence: "存在版本或版本化线索。",
      gap: "缺少版本化线索，难以复现和回滚 Skill 行为。"
    },
    {
      ok: hasAny(corpus, [/维护规则/, /maintenance/i, /维护入口/]),
      points: 3,
      evidence: "提供维护或变更同步规则。",
      gap: "缺少变更时需要同步更新和验证的维护规则。"
    },
    {
      ok: hasAny(corpus, [/失败样例/, /failure example/i, /gotcha/i, /常见失败/]),
      points: 3,
      evidence: "沉淀了失败样例或常见误用。",
      gap: "缺少失败样例/常见误用，无法从实际问题中持续降低错误率。"
    },
    {
      ok: hasAny(corpus, [/评分/, /score/i, /改进建议/, /升级建议/]),
      points: 3,
      evidence: "具备质量评分或升级建议机制。",
      gap: "缺少审计后的优先级和升级建议机制。"
    }
  ]);

  const dimensions = [discovery, context, execution, verification, security, evolution];
  const totalScore = dimensions.reduce((sum, item) => sum + item.score, 0);
  const grade = totalScore >= 90 ? "A" : totalScore >= 80 ? "B" : totalScore >= 70 ? "C" : "D";
  const findings = [
    makeFinding(discovery, "修复发现与边界", discovery.gaps.join("；"), "补充精确的 Use when / 不适用场景，并在 description 前置关键触发词。"),
    makeFinding(context, "降低入口上下文成本", context.gaps.join("；"), "把长参考、案例和模板下沉为从 SKILL.md 直接链接的一层文件。"),
    makeFinding(execution, "补齐执行与协作闭环", execution.gaps.join("；"), "为高频任务定义输入、阶段、门禁、失败处理、升级条件和角色写入边界；团队 Skill 还需区分候选角色与实际参与的 rolePlan。"),
    makeFinding(verification, "补齐验证与证据闭环", verification.gaps.join("；"), "增加确定性校验、golden 场景和验证等级，明确未验证时的结论上限。"),
    makeFinding(security, "修复安全或可移植性问题", security.gaps.join("；"), "删除环境绑定路径和疑似凭据，使用相对路径、占位符和显式授权边界。"),
    makeFinding(evolution, "建立持续演进机制", evolution.gaps.join("；"), "沉淀真实失败样例、维护规则和可排序的升级建议，并将其纳入回归。")
  ].filter(Boolean);

  return {
    skill: {
      id: manifestName || path.basename(root),
      path: portablePath(root),
      manifest: path.relative(root, manifestPath).replace(/\\/g, "/")
    },
    auditMode: "static-only",
    totalScore,
    grade,
    dimensions,
    findings,
    recommendedVerification: recommendedVerification(root, packageJson, allFiles),
    notes: [
      "本报告未执行目标 Skill 的脚本、网络调用或测试命令。",
      "静态评分不替代运行时、浏览器、外部系统或人工验收。"
    ]
  };
}

function renderMarkdown(report) {
  const rows = report.dimensions
    .map((item) => `| ${item.name} | ${item.score}/${item.maxScore} | ${item.evidence.join("<br>") || "无"} | ${item.gaps.join("<br>") || "无"} |`)
    .join("\n");
  const findings = report.findings.length > 0
    ? report.findings.map((item) => `| ${item.priority} | ${item.area} | ${item.title} | ${item.evidence} | ${item.recommendation} |`).join("\n")
    : "| - | - | 无 | 静态审计未发现明确短板。 | 仍应运行目标 Skill 的验证命令。 |";
  const commands = report.recommendedVerification.length > 0
    ? report.recommendedVerification.map((item) => `- \`${item}\``).join("\n")
    : "- 未发现标准验证入口；请人工确认项目验证命令。";

  return `# Skill Evolution Audit

## 结论

- Skill：${report.skill.id}
- 路径：${report.skill.path}
- 审计模式：${report.auditMode}
- 静态评分：${report.totalScore}/100（${report.grade}）

${report.notes.map((item) => `- ${item}`).join("\n")}

## 维度评分

| 维度 | 得分 | 静态证据 | 缺口 |
| --- | --- | --- | --- |
${rows}

## 发现与升级建议

| 优先级 | 领域 | 问题 | 证据 | 建议 |
| --- | --- | --- | --- | --- |
${findings}

## 建议验证

${commands}
`;
}

function renderBatchMarkdown(reports) {
  const rows = reports
    .map((report) => `| ${report.skill.id} | ${report.skill.path} | ${report.totalScore}/100 | ${report.grade} | ${report.findings.filter((item) => item.priority === "P1").length} |`)
    .join("\n");
  return `# Skill Evolution Batch Audit

审计模式：static-only。报告不会执行目标 Skill 的脚本或外部副作用。

| Skill | 路径 | 静态评分 | 等级 | P1 数量 |
| --- | --- | --- | --- | --- |
${rows}

${reports.map(renderMarkdown).join("\n\n---\n\n")}
`;
}

function writeReport(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content.endsWith("\n") ? content : `${content}\n`, "utf8");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const format = args.format || "markdown";
  if (!["markdown", "json"].includes(format)) {
    console.error("Usage: node scripts/audit-skills.js <skill-path> [...skill-paths] [--root <skills-root>] [--format markdown|json] [--output <file>] [--output-dir <dir>]");
    process.exit(1);
  }

  const targets = [...args._];
  if (args.root) {
    const scanRoot = path.resolve(process.cwd(), args.root);
    targets.push(...scanForSkillRoots(scanRoot));
  }
  if (targets.length === 0) {
    console.error("Provide at least one skill path or --root <skills-root>.");
    process.exit(1);
  }

  const roots = [...new Set(targets.map((target) => resolveSkillRoot(target) || path.resolve(process.cwd(), target)))];
  const invalid = roots.filter((root) => !findManifest(root));
  if (invalid.length > 0) {
    console.error(`Skill manifest not found: ${invalid.map(portablePath).join(", ")}`);
    process.exit(1);
  }

  const reports = roots.map(auditSkill);
  const payload = reports.length === 1 ? reports[0] : { auditMode: "static-only", reports };
  const content = format === "json"
    ? JSON.stringify(payload, null, 2)
    : reports.length === 1
      ? renderMarkdown(reports[0])
      : renderBatchMarkdown(reports);

  if (args.output) writeReport(path.resolve(process.cwd(), args.output), content);
  if (args["output-dir"]) {
    const outputDir = path.resolve(process.cwd(), args["output-dir"]);
    for (const report of reports) {
      const extension = format === "json" ? "json" : "md";
      writeReport(path.join(outputDir, `${report.skill.id}-audit.${extension}`), format === "json"
        ? JSON.stringify(report, null, 2)
        : renderMarkdown(report));
    }
  }
  if (!args.output && !args["output-dir"]) console.log(content);
}

if (require.main === module) main();

module.exports = {
  auditSkill,
  renderMarkdown,
  scanForSkillRoots
};
