#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { parseArgs, readJson, writeFile } = require("./template-utils");
const { validateSpec } = require("./validate-team-spec");

const ROOT = path.resolve(__dirname, "..");
const PACKS_DIR = path.join(ROOT, "domain-packs");
const DEFAULT_SKILLS_ROOT = process.env.AI_TEAM_BUILD_SKILLS_ROOT || path.resolve(__dirname, "..", "..");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function interpolate(value, context) {
  if (Array.isArray(value)) return value.map((item) => interpolate(item, context));
  if (typeof value !== "string") return value;
  return value.replace(/\{([A-Za-z0-9_.-]+)\}/g, (_, key) => {
    const resolved = key.split(".").reduce((current, part) => {
      return current && Object.prototype.hasOwnProperty.call(current, part) ? current[part] : "";
    }, context);
    return String(resolved ?? "");
  });
}

function splitList(value) {
  if (Array.isArray(value)) return value;
  return String(value || "")
    .split(/[,\n|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function expandPortablePath(value) {
  const raw = String(value || "");
  if (raw.startsWith("<skills-root>")) {
    return path.join(DEFAULT_SKILLS_ROOT, raw.slice("<skills-root>".length));
  }
  if (raw.startsWith("$SKILLS_ROOT")) {
    return path.join(DEFAULT_SKILLS_ROOT, raw.slice("$SKILLS_ROOT".length));
  }
  return raw;
}

function listPacks() {
  return fs.readdirSync(PACKS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const packPath = path.join(PACKS_DIR, entry.name, "domain-pack.json");
      return fs.existsSync(packPath) ? { path: packPath, pack: readJson(packPath) } : null;
    })
    .filter(Boolean);
}

function collectParamOverrides(argv) {
  const overrides = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== "--param") continue;
    const pair = argv[index + 1] || "";
    const separatorIndex = pair.indexOf("=");
    if (separatorIndex <= 0) throw new Error(`Invalid --param value: ${pair}. Expected key=value.`);
    const key = pair.slice(0, separatorIndex);
    const value = pair.slice(separatorIndex + 1);
    overrides[key] = value;
    index += 1;
  }
  return overrides;
}

function scorePack(goal, pack) {
  const haystack = [pack.id, pack.title, pack.description, ...(pack.keywords || [])].join(" ").toLowerCase();
  const normalizedGoal = String(goal || "").toLowerCase();
  return (pack.keywords || []).reduce((score, keyword) => {
    return normalizedGoal.includes(String(keyword).toLowerCase()) ? score + 3 : score;
  }, haystack.includes(normalizedGoal) ? 1 : 0);
}

function selectPack(args) {
  const packs = listPacks();
  if (args["domain-pack"]) {
    const matched = packs.find(({ pack }) => pack.id === args["domain-pack"]);
    if (!matched) throw new Error(`Unknown domain pack: ${args["domain-pack"]}`);
    return matched;
  }

  const goal = args.goal || args._.join(" ");
  if (!goal) throw new Error("Usage: node scripts/synthesize-team-spec.js --goal <team goal> [--domain-pack <id>] [--output <path>]");

  const ranked = packs
    .map((entry) => ({ ...entry, score: scorePack(goal, entry.pack) }))
    .sort((a, b) => b.score - a.score);
  if (!ranked[0] || ranked[0].score <= 0) {
    return {
      fallback: true,
      goal,
      pack: {
        id: "generic-draft",
        title: "Generic Draft Team",
        description: "Fallback draft spec used when no domain pack matches the goal."
      }
    };
  }
  return ranked[0];
}

function goalLabel(goal) {
  return String(goal || "")
    .replace(/^(帮我|请|创建|新建|搭建|生成|做|建立|设计)(一个|一套)?/, "")
    .replace(/(Skill|skill|团队|专家团队|AI团队|ai团队)+$/g, "")
    .trim() || "通用 AI 团队";
}

function slugFromGoal(goal) {
  const normalized = String(goal || "").toLowerCase();
  const keywordSlugs = [
    ["客服", "customer-service"],
    ["质检", "quality-review"],
    ["运营", "operations"],
    ["增长", "growth"],
    ["产品", "product"],
    ["研发", "rd"],
    ["测试", "qa"],
    ["数据", "data"],
    ["投研", "research"],
    ["股票", "stock"],
    ["交易", "trading"]
  ];
  const matched = keywordSlugs
    .filter(([keyword]) => normalized.includes(keyword))
    .map(([, slug]) => slug);
  const asciiSlug = normalized
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  const base = matched.length > 0 ? [...new Set(matched)].join("-") : asciiSlug || "custom-ai";
  return base.endsWith("-team") ? base : `${base}-team`;
}

function parameterDefaults(pack, baseSpec, goal) {
  const parameters = pack.parameters || {};
  const base = {
    skillId: baseSpec.skill.id,
    skillName: baseSpec.skill.name,
    description: baseSpec.skill.description,
    domain: baseSpec.skill.domain,
    version: baseSpec.skill.version,
    targetUsers: baseSpec.skill.targetUsers,
    primaryValue: baseSpec.skill.primaryValue,
    commandPrefix: baseSpec.commands.prefix,
    outputDirectory: baseSpec.output.defaultDirectory
  };
  const context = {
    goal,
    pack,
    skillId: base.skillId,
    commandPrefix: base.commandPrefix
  };

  for (const [key, definition] of Object.entries(parameters)) {
    if (definition && Object.prototype.hasOwnProperty.call(definition, "default")) {
      base[key] = interpolate(definition.default, context);
    }
  }
  return base;
}

function cliOverrides(args, argv) {
  const overrides = collectParamOverrides(argv);
  const map = {
    "skill-id": "skillId",
    name: "skillName",
    description: "description",
    domain: "domain",
    version: "version",
    "target-users": "targetUsers",
    "primary-value": "primaryValue",
    "command-prefix": "commandPrefix",
    "output-dir": "outputDirectory"
  };
  for (const [argName, parameterName] of Object.entries(map)) {
    if (args[argName] !== undefined) overrides[parameterName] = args[argName];
  }
  return overrides;
}

function resolveParameters(pack, baseSpec, args, argv) {
  const goal = args.goal || args._.join(" ");
  const resolved = {
    ...parameterDefaults(pack, baseSpec, goal),
    ...cliOverrides(args, argv)
  };
  if (!resolved.outputDirectory && resolved.skillId) {
    resolved.outputDirectory = "<skills-root>/" + resolved.skillId;
  } else {
    resolved.outputDirectory = expandPortablePath(resolved.outputDirectory)
      .replace(path.resolve(DEFAULT_SKILLS_ROOT), "<skills-root>");
  }
  if (typeof resolved.targetUsers === "string") {
    resolved.targetUsers = splitList(resolved.targetUsers);
  }
  return resolved;
}

function replacePrefix(value, oldPrefix, newPrefix) {
  if (Array.isArray(value)) return value.map((item) => replacePrefix(item, oldPrefix, newPrefix));
  if (typeof value !== "string") return value;
  return value.split(oldPrefix).join(newPrefix);
}

function synthesizeSpec(baseSpec, pack, args, argv) {
  const spec = clone(baseSpec);
  const params = resolveParameters(pack, baseSpec, args, argv);
  const oldPrefix = spec.commands.prefix;

  spec.skill.id = params.skillId;
  spec.skill.name = params.skillName;
  spec.skill.description = params.description;
  spec.skill.domain = params.domain;
  spec.skill.version = params.version || spec.skill.version;
  spec.skill.targetUsers = params.targetUsers;
  spec.skill.primaryValue = params.primaryValue;
  spec.commands.prefix = params.commandPrefix;
  spec.output.defaultDirectory = params.outputDirectory;

  for (const workflow of spec.workflows || []) {
    workflow.triggers = replacePrefix(workflow.triggers || [], oldPrefix, params.commandPrefix);
    workflow.commands = replacePrefix(workflow.commands || [], oldPrefix, params.commandPrefix);
  }

  return {
    spec,
    params
  };
}

function resolveFallbackParameters(args, argv) {
  const goal = args.goal || args._.join(" ");
  const label = goalLabel(goal);
  const defaults = {
    skillId: slugFromGoal(goal),
    skillName: `${label} Team Skill`,
    description: `${label} expert-team workflow skill generated as a generic draft because no built-in domain pack matched the goal.`,
    domain: label,
    version: "0.1.0",
    targetUsers: [
      `需要搭建${label}协作流程的 Agent 用户`,
      "需要先形成可验证团队草案再继续深化领域包的维护者"
    ],
    primaryValue: `把“${goal}”转成可审查、可验证、可继续领域化补强的团队 Skill 草案。`,
    commandPrefix: `/${slugFromGoal(goal).replace(/-team$/, "-team")}`,
    outputDirectory: `<skills-root>/${slugFromGoal(goal)}`
  };
  const resolved = {
    ...defaults,
    ...cliOverrides(args, argv)
  };
  if (typeof resolved.targetUsers === "string") resolved.targetUsers = splitList(resolved.targetUsers);
  if (!resolved.outputDirectory && resolved.skillId) resolved.outputDirectory = `<skills-root>/${resolved.skillId}`;
  resolved.outputDirectory = expandPortablePath(resolved.outputDirectory)
    .replace(path.resolve(DEFAULT_SKILLS_ROOT), "<skills-root>");
  return resolved;
}

function synthesizeFallbackSpec(args, argv) {
  const goal = args.goal || args._.join(" ");
  const params = resolveFallbackParameters(args, argv);
  const prefix = params.commandPrefix;

  const spec = {
    skill: {
      id: params.skillId,
      name: params.skillName,
      description: params.description,
      version: params.version,
      domain: params.domain,
      targetUsers: params.targetUsers,
      primaryValue: params.primaryValue
    },
    commands: {
      prefix,
      items: [
        {
          name: "intake",
          workflow: "goal-intake",
          description: "澄清团队目标、受众、输入材料、风险边界和交付标准。",
          requiredInput: "团队目标或业务场景",
          defaultOutput: "目标契约和信息缺口"
        },
        {
          name: "analyze",
          workflow: "goal-analysis",
          description: "围绕目标形成领域判断、证据清单和候选方案。",
          requiredInput: "目标契约、上下文材料或用户补充信息",
          defaultOutput: "分析报告和候选方案"
        },
        {
          name: "review",
          workflow: "quality-review",
          description: "复核证据、风险、失败样例和交付完整度。",
          requiredInput: "分析报告或交付草案",
          defaultOutput: "质量复核记录"
        },
        {
          name: "deliver",
          workflow: "delivery-review",
          description: "汇总最终交付、证据、风险和后续补强建议。",
          requiredInput: "已验证的产物和复核记录",
          defaultOutput: "交付摘要"
        }
      ]
    },
    members: [
      {
        id: "intake-analyst",
        name: "Intake Analyst",
        role: "intake",
        when_to_load: ["用户目标模糊", "需要澄清输入、边界或成功标准"],
        primary_outputs: ["goal-brief", "question-list"],
        quality_gates: ["intake-gate"],
        responsibilities: ["澄清目标用户、业务场景、核心任务和交付形态。", "识别缺失输入、风险边界和需要用户决策的问题。"],
        inputs: ["团队目标", "用户补充上下文", "已有材料"],
        outputs: ["目标契约", "信息缺口", "风险初筛"],
        workingLogic: ["先复述目标和受众。", "列出必须补充的信息。", "把模糊目标转成可执行任务链路。"],
        checklist: ["目标用户明确", "核心任务明确", "成功标准可验证"],
        escalation: ["目标冲突", "缺少关键输入", "风险边界不清晰"],
        doNotDo: ["不得跳过澄清直接生成最终结论。"]
      },
      {
        id: "domain-expert",
        name: "Domain Expert",
        role: "domain",
        when_to_load: ["需要形成领域判断", "需要设计方法论或候选方案"],
        primary_outputs: ["analysis-report", "methodology-draft"],
        quality_gates: ["evidence-gate"],
        responsibilities: ["根据目标构建领域方法、证据要求和执行步骤。", "区分事实、假设和待验证信息。"],
        inputs: ["目标契约", "用户材料", "数据契约"],
        outputs: ["分析报告", "候选方案", "证据清单"],
        workingLogic: ["先列出判断框架。", "再绑定证据和限制条件。", "最后形成可复核方案。"],
        checklist: ["结论有证据", "假设已标注", "失败模式已列出"],
        escalation: ["关键证据缺失", "领域风险高于当前草案能力"],
        doNotDo: ["不得把未验证假设写成事实。"]
      },
      {
        id: "quality-reviewer",
        name: "Quality Reviewer",
        role: "quality",
        when_to_load: ["交付前复核", "发现证据或风险不足"],
        primary_outputs: ["quality-review", "risk-list"],
        quality_gates: ["quality-gate", "risk-gate"],
        responsibilities: ["检查产物是否满足门禁、证据、风险和失败样例要求。", "阻断无证据完成结论。"],
        inputs: ["分析报告", "候选方案", "验收场景"],
        outputs: ["质量复核记录", "风险清单", "修复建议"],
        workingLogic: ["逐项检查门禁。", "标注缺失证据和风险。", "给出可执行修复建议。"],
        checklist: ["门禁已覆盖", "失败样例已处理", "风险已声明"],
        escalation: ["验收失败", "风险不可接受", "证据不足"],
        doNotDo: ["不得放行缺少证据的完成结论。"]
      },
      {
        id: "delivery-manager",
        name: "Delivery Manager",
        role: "delivery",
        when_to_load: ["需要汇总交付", "需要管理状态和后续行动"],
        primary_outputs: ["delivery-summary", "next-actions"],
        quality_gates: ["delivery-gate"],
        responsibilities: ["维护状态、证据索引、风险和最终交付摘要。", "把未完成事项转成后续补强建议。"],
        inputs: ["目标契约", "分析报告", "复核记录"],
        outputs: ["交付摘要", "证据索引", "后续计划"],
        workingLogic: ["先汇总已完成产物。", "再列出证据和风险。", "最后给出下一步建议。"],
        checklist: ["产物清单完整", "验证证据明确", "下一步可执行"],
        escalation: ["用户需要裁决", "输出目录或注册方式不明确"],
        doNotDo: ["不得把草案标记为已充分领域化。"]
      }
    ],
    workflows: [
      {
        id: "goal-intake",
        title: "目标澄清",
        triggers: [`${prefix} intake`, "用户提供新的团队目标"],
        commands: [`${prefix} intake`],
        members: ["intake-analyst", "delivery-manager"],
        execution_mode: "sequential",
        quality_gates: ["intake-gate", "delivery-gate"],
        outputs: ["goal-brief", "question-list"],
        stages: [
          {
            name: "澄清目标",
            owner: "intake-analyst",
            actions: ["识别目标用户、核心任务、输入材料和风险边界。"],
            outputs: ["goal-brief"],
            gates: ["intake-gate"]
          },
          {
            name: "形成状态",
            owner: "delivery-manager",
            actions: ["记录缺口、决策项和下一步。"],
            outputs: ["question-list"],
            gates: ["delivery-gate"]
          }
        ]
      },
      {
        id: "goal-analysis",
        title: "目标分析",
        triggers: [`${prefix} analyze`, "需要形成领域方法或候选方案"],
        commands: [`${prefix} analyze`],
        members: ["delivery-manager", "domain-expert", "quality-reviewer"],
        execution_mode: "hybrid",
        quality_gates: ["evidence-gate", "quality-gate", "delivery-gate"],
        outputs: ["analysis-report", "quality-review", "delivery-summary"],
        stages: [
          {
            name: "组织输入",
            owner: "delivery-manager",
            actions: ["确认输入材料和交付格式。"],
            outputs: ["evidence-index"],
            gates: ["delivery-gate"]
          },
          {
            name: "领域分析",
            owner: "domain-expert",
            actions: ["生成方法、证据、假设和候选方案。"],
            outputs: ["analysis-report"],
            gates: ["evidence-gate"]
          },
          {
            name: "质量复核",
            owner: "quality-reviewer",
            actions: ["检查证据、失败样例和风险。"],
            outputs: ["quality-review"],
            gates: ["quality-gate"]
          }
        ]
      },
      {
        id: "quality-review",
        title: "质量复核",
        triggers: [`${prefix} review`, "交付前需要审查证据和风险"],
        commands: [`${prefix} review`],
        members: ["quality-reviewer", "domain-expert"],
        execution_mode: "sequential",
        quality_gates: ["quality-gate", "risk-gate", "evidence-gate"],
        outputs: ["quality-review", "risk-list"],
        stages: [
          {
            name: "复核门禁",
            owner: "quality-reviewer",
            actions: ["逐项检查验收场景、风险声明和证据规则。"],
            outputs: ["quality-review"],
            gates: ["quality-gate", "risk-gate"]
          },
          {
            name: "补充证据",
            owner: "domain-expert",
            actions: ["补齐缺失证据、限制条件和失败模式。"],
            outputs: ["analysis-report"],
            gates: ["evidence-gate"]
          }
        ]
      },
      {
        id: "delivery-review",
        title: "交付复核",
        triggers: [`${prefix} deliver`, "需要输出最终交付摘要"],
        commands: [`${prefix} deliver`],
        members: ["delivery-manager", "quality-reviewer"],
        execution_mode: "sequential",
        quality_gates: ["delivery-gate", "quality-gate"],
        outputs: ["delivery-summary", "next-actions"],
        stages: [
          {
            name: "整理交付",
            owner: "delivery-manager",
            actions: ["汇总产物、证据、风险和后续计划。"],
            outputs: ["delivery-summary"],
            gates: ["delivery-gate"]
          },
          {
            name: "最终放行",
            owner: "quality-reviewer",
            actions: ["确认未把草案误标为已完全领域化。"],
            outputs: ["quality-review"],
            gates: ["quality-gate"]
          }
        ]
      }
    ],
    docs: {
      methodologies: [
        {
          path: "docs/methodologies/generic-team-methodology.md",
          title: "通用团队草案方法论",
          sections: ["目标澄清", "领域化补强", "证据复核"],
          content: {
            "目标澄清": ["必须说明该团队服务对象、核心任务、输入材料和交付结果。", "未命中内置 domain pack 时，必须声明当前产物是可验证草案。"],
            "领域化补强": ["后续应把真实领域概念、方法、数据契约和失败模式沉淀为 domain-pack。", "不得长期依赖通用草案处理高风险或强专业任务。"],
            "证据复核": ["所有结论必须区分事实、假设和待验证信息。", "交付前必须通过质量复核和证据门禁。"]
          }
        }
      ],
      standards: [
        {
          path: "docs/engineering-standards/evidence-standard.md",
          title: "证据标准",
          sections: ["证据来源", "风险声明", "完成定义"],
          content: {
            "证据来源": ["产物必须引用用户输入、文档、命令、日志或人工确认。"],
            "风险声明": ["草案必须说明未命中领域包带来的方法论不足。"],
            "完成定义": ["只有通过验收场景、质量门禁和交付复核后，才能声明当前阶段完成。"]
          }
        }
      ],
      integrations: [
        {
          path: "docs/integrations/input-data-contract.md",
          title: "输入数据契约",
          sections: ["用户输入", "上下文材料", "缺失处理"],
          content: {
            "用户输入": ["必须保留目标原文、补充约束和用户决策项。"],
            "上下文材料": ["引用外部材料时必须标注来源、时间和适用范围。"],
            "缺失处理": ["缺少关键输入时只能输出问题清单或草案，不得输出确定性最终方案。"]
          }
        }
      ],
      qualityGates: ["intake-gate", "evidence-gate", "quality-gate", "risk-gate", "delivery-gate"],
      rubrics: ["目标清晰度", "领域内容深度", "证据完整度", "风险控制", "交付可用性"]
    },
    templates: [
      {
        id: "goal-brief",
        path: "goal-brief.md",
        title: "目标简报",
        sections: ["目标", "受众", "输入", "缺口"],
        content: {
          "目标": ["记录用户目标原文和澄清后的团队目标。"],
          "受众": ["说明该团队服务对象和主要使用场景。"],
          "输入": ["列出已有材料、数据来源和上下文。"],
          "缺口": ["列出阻断进一步领域化的问题。"]
        }
      },
      {
        id: "analysis-report",
        path: "analysis-report.md",
        title: "分析报告",
        sections: ["判断框架", "证据", "候选方案", "失败模式"],
        content: {
          "判断框架": ["说明当前草案采用的分析维度和限制。"],
          "证据": ["逐项列出事实、假设、来源和置信度。"],
          "候选方案": ["给出可执行方案，并说明适用前提。"],
          "失败模式": ["列出可能导致结论失效的条件。"]
        }
      },
      {
        id: "quality-review",
        path: "quality-review.md",
        title: "质量复核",
        sections: ["门禁", "风险", "修复项"],
        content: {
          "门禁": ["逐项检查 intake、evidence、quality、risk 和 delivery 门禁。"],
          "风险": ["说明草案风险、证据不足和用户需决策项。"],
          "修复项": ["列出发布或注册前必须补齐的事项。"]
        }
      },
      {
        id: "delivery-summary",
        path: "delivery-summary.md",
        title: "交付摘要",
        sections: ["产物", "证据", "结论", "下一步"],
        content: {
          "产物": ["列出本轮生成或更新的文件。"],
          "证据": ["引用验证命令、日志或人工确认。"],
          "结论": ["说明当前是否仅为草案，以及可用边界。"],
          "下一步": ["给出领域包补强、验收扩展和注册建议。"]
        }
      }
    ],
    domainKnowledge: {
      concepts: [`目标领域：${params.domain}`, "通用草案：未命中内置 domain pack 时生成的可验证起点。", "领域包补强：把真实概念、方法、数据契约和失败模式沉淀为可复用 pack。"],
      methods: ["先澄清目标，再生成团队结构。", "用验收场景检验产物是否具备可交付信号。", "通过质量复核阻断无证据结论。"],
      evidenceChecklist: ["目标契约完整。", "每个结论有来源或假设标记。", "交付摘要列出验证结果和风险。"],
      failureModes: ["把通用草案误当成成熟领域团队。", "缺少领域数据契约。", "没有失败样例或风险声明。"]
    },
    capabilityMatrix: [
      {
        capability: "目标澄清",
        owner: "intake-analyst",
        inputs: ["团队目标", "用户上下文"],
        outputs: ["goal-brief"],
        gates: ["intake-gate"],
        maturity: "usable"
      },
      {
        capability: "领域草案分析",
        owner: "domain-expert",
        inputs: ["目标契约", "上下文材料"],
        outputs: ["analysis-report"],
        gates: ["evidence-gate"],
        maturity: "draft"
      },
      {
        capability: "质量复核",
        owner: "quality-reviewer",
        inputs: ["分析报告", "验收场景"],
        outputs: ["quality-review"],
        gates: ["quality-gate", "risk-gate"],
        maturity: "usable"
      }
    ],
    acceptanceScenarios: [
      {
        id: "generic-goal-intake",
        input: `用户要求：${goal}`,
        expectedOutputs: ["goal-brief.md", "delivery-summary.md"],
        mustPassGates: ["intake-gate", "delivery-gate"],
        failureExamples: ["没有说明未命中内置 domain pack。", "没有列出目标用户或核心任务。"]
      },
      {
        id: "generic-delivery-review",
        input: "用户要求确认当前团队草案是否可以注册使用。",
        expectedOutputs: ["analysis-report.md", "quality-review.md", "delivery-summary.md"],
        mustPassGates: ["evidence-gate", "quality-gate", "risk-gate"],
        failureExamples: ["把草案声明为成熟领域团队。", "缺少证据、风险或后续补强建议。"]
      }
    ],
    dataContracts: [
      {
        source: "用户目标和补充上下文",
        freshness: "必须来自当前对话或用户提供材料。",
        requiredFields: ["目标", "目标用户", "核心任务", "交付形态"],
        missingDataPolicy: "缺少目标用户或核心任务时，只能输出问题清单和草案。",
        allowedUse: ["目标简报", "分析报告", "交付摘要"]
      },
      {
        source: "生成器验证结果",
        freshness: "必须来自本地 npm test、生成物校验或验收脚本输出。",
        requiredFields: ["命令", "退出码", "关键日志", "剩余风险"],
        missingDataPolicy: "没有验证结果时不得声明可发布。",
        allowedUse: ["质量复核", "交付摘要"]
      }
    ],
    externalSkills: {
      skills: [],
      roleMap: [],
      adapters: [],
      installPolicy: "通用草案不默认声明外部 Skill；需要领域能力时先补充 externalSkills 和 adapters。"
    },
    scripts: {
      includeContextBuilder: false,
      includeExternalSkillInstaller: true,
      includeValidation: true
    },
    riskControls: {
      domainRiskLevel: "medium",
      requiredDisclaimers: ["当前团队由通用草案生成，未命中内置 domain pack，必须在真实使用前补强领域方法论。"],
      blockedClaims: ["不得声称通用草案已经覆盖完整垂直领域专业能力。"],
      evidenceRules: ["所有完成结论必须附带验证命令、日志、文件路径或人工确认。"]
    },
    output: {
      defaultDirectory: params.outputDirectory,
      overwritePolicy: "block"
    }
  };

  return { spec, params };
}

function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);
  let selected;
  try {
    selected = selectPack(args);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }

  const specPath = selected.fallback ? null : path.resolve(path.dirname(selected.path), selected.pack.recommendedSpecPath);
  const synthesized = selected.fallback
    ? synthesizeFallbackSpec(args, argv)
    : synthesizeSpec(readJson(specPath), selected.pack, args, argv);
  const { spec, params } = synthesized;
  const reporter = validateSpec(spec);
  if (reporter.failedCount() > 0) {
    reporter.print();
    process.exit(1);
  }

  const output = JSON.stringify(spec, null, 2);

  if (args.output) {
    writeFile(path.resolve(process.cwd(), args.output), output);
    const source = selected.fallback
      ? "generic-draft (no domain pack matched)"
      : `${selected.pack.id} (${path.relative(ROOT, specPath)})`;
    console.log(`Synthesized spec from ${source} to ${args.output}`);
    console.log(`Applied parameters: skillId=${params.skillId}, commandPrefix=${params.commandPrefix}, outputDirectory=${params.outputDirectory}`);
    return;
  }
  console.log(output);
}

if (require.main === module) main();
