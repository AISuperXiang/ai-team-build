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

function inferRiskLevel(goal) {
  const normalized = String(goal || "").toLowerCase();
  if (/(医疗|诊断|处方|患者|法律|诉讼|投资|股票|交易|证券|财务|审计|合规|招聘|人事|信贷|保险|medical|diagnos|legal|investment|trading|audit|compliance|hiring)/i.test(normalized)) {
    return "high";
  }
  if (/(创业|企业|公司|经营|供应链|采购|销售|营销|运营|数据|隐私|安全|startup|business|finance|privacy|security)/i.test(normalized)) {
    return "medium";
  }
  return "low";
}

function inferComplexityLevel(goal, riskLevel) {
  if (riskLevel === "high") return "L";
  if (/(从零|创业|企业|公司|跨团队|平台|生态|组织|end-to-end|from scratch)/i.test(String(goal || ""))) return "L";
  return "M";
}

function genericRiskControls(riskLevel) {
  if (riskLevel === "high") {
    return {
      domainRiskLevel: "high",
      requiredDisclaimers: [
        "当前团队由通用草案生成，未经过对应领域专家认证，不得替代持牌或法定专业责任人。",
        "任何影响健康、法律权利、资金、就业或合规的结论都必须由有资质的人类责任人复核。"
      ],
      blockedClaims: [
        "不得输出确定性诊断、处方、法律结论、收益承诺、录用淘汰决定或其他不可逆专业指令。",
        "未获得用户授权和人工批准前不得执行外部写操作、交易、签约、发布或敏感数据处理。"
      ],
      evidenceRules: [
        "所有高风险结论必须记录来源、时效、适用范围、反向证据、置信度和失效条件。",
        "缺少领域 pack、关键数据或人工责任人时必须停止在草案或待复核状态。"
      ],
      humanReview: {
        required: true,
        accountableRole: "quality-reviewer",
        requiredWhen: [
          "输出影响健康、法律权利、资金、就业、隐私或合规。",
          "需要执行不可逆操作或使用敏感数据。"
        ],
        blockedWithoutApproval: true
      }
    };
  }
  return {
    domainRiskLevel: riskLevel,
    requiredDisclaimers: ["当前团队由通用草案生成，未命中内置 domain pack，必须在真实使用前补强领域方法论。"],
    blockedClaims: ["不得声称通用草案已经覆盖完整垂直领域专业能力。"],
    evidenceRules: ["所有完成结论必须附带验证命令、日志、文件路径、数据来源或人工确认。"],
    humanReview: {
      required: false,
      accountableRole: "",
      requiredWhen: [],
      blockedWithoutApproval: false
    }
  };
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
  const goal = args.goal || args._.join(" ");

  spec.skill.id = params.skillId;
  spec.skill.name = params.skillName;
  spec.skill.description = params.description;
  spec.skill.domain = params.domain;
  spec.skill.version = params.version || spec.skill.version;
  spec.skill.targetUsers = params.targetUsers;
  spec.skill.primaryValue = params.primaryValue;
  spec.commands.prefix = params.commandPrefix;
  spec.output.defaultDirectory = params.outputDirectory;
  if (goal && spec.teamDesign) {
    spec.teamDesign.problemStatement = goal;
    spec.teamDesign.assumptions = [
      `当前规格由领域包 ${pack.id} 根据用户目标合成，仍需在首次执行时复核目标、约束和成功标准。`,
      ...(spec.teamDesign.assumptions || [])
    ];
  }

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
  const riskLevel = inferRiskLevel(goal);
  const complexityLevel = inferComplexityLevel(goal, riskLevel);
  const executionProfile = riskLevel === "high" || ["L", "XL"].includes(complexityLevel)
    ? "assurance"
    : "standard";
  const riskControls = genericRiskControls(riskLevel);

  const spec = {
    schemaVersion: "2.0.0",
    skill: {
      id: params.skillId,
      name: params.skillName,
      description: params.description,
      version: params.version,
      domain: params.domain,
      targetUsers: params.targetUsers,
      primaryValue: params.primaryValue
    },
    teamDesign: {
      problemStatement: goal,
      mission: `围绕“${goal}”组建最小充分的专家协作团队，并把关键判断、执行、验证和复盘沉淀为可追踪流程。`,
      targetOutcomes: [
        "形成可执行的问题分解、责任边界和交付路径。",
        "关键结论绑定证据、风险、置信度和失效条件。",
        "通过代表性场景验证团队蓝图，并保留待领域化补强项。"
      ],
      stakeholders: [
        ...params.targetUsers,
        "最终决策和风险责任人"
      ],
      constraints: [
        "核心生成与验证必须离线运行，不默认调用外部服务。",
        "未命中领域包时不得伪造成熟专业知识。",
        "未获得授权和必要证据时不得执行外部副作用。"
      ],
      nonGoals: [
        "不替代持牌、法定或组织内最终责任人。",
        "不承诺一次生成即可达到行业领先的实战结果。"
      ],
      assumptions: [
        "用户会补充影响范围、成功标准和关键约束。",
        "领域事实、数据和法规边界需要真实来源或专家复核。"
      ],
      valueMetrics: [
        {
          name: "代表性任务可交付率",
          baseline: "待通过首个真实场景采集",
          target: "核心场景均有产物、证据和风险闭环",
          evidenceSource: "验收场景、命令结果和人工复核记录",
          reviewCadence: "每次交付后复盘"
        }
      ]
    },
    governance: {
      defaultComplexityLevel: complexityLevel,
      defaultExecutionProfile: executionProfile,
      targetVerificationLevel: riskLevel === "high" ? "V3" : "V2",
      roleModes: ["active", "consulted", "not_applicable"],
      reassessmentTriggers: [
        "范围扩大、关键假设被证伪或验证失败。",
        "出现跨领域依赖、敏感数据、权限、外部副作用或 P0/P1 风险。"
      ],
      requiredGates: [
        "role-activation-gate",
        "value-gate",
        "decision-gate",
        "handoff-gate",
        "complexity-gate",
        "evidence-gate",
        "verification-gate",
        "delivery-gate"
      ],
      humanReview: riskControls.humanReview
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
        doNotDo: ["不得跳过澄清直接生成最终结论。"],
        activation: {
          activeWhen: ["用户目标、目标受众或成功标准尚不明确。"],
          consultedWhen: ["已有目标契约，只需复核范围或非目标。"],
          notApplicableWhen: ["输入已经包含完整且无冲突的目标契约。"],
          reassessWhen: ["范围、优先级或成功标准发生变化。"]
        }
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
        doNotDo: ["不得把未验证假设写成事实。"],
        activation: {
          activeWhen: ["需要领域判断、方法论、数据解释或候选方案。"],
          consultedWhen: ["只需复核一个有界专业问题。"],
          notApplicableWhen: ["任务仅做状态汇总或交付格式整理。"],
          reassessWhen: ["发现新的领域依赖、证据冲突或高风险信号。"]
        }
      },
      {
        id: "solution-builder",
        name: "Solution Builder",
        role: "solution",
        when_to_load: ["需要把分析转成方案、原型、计划或可执行产物"],
        primary_outputs: ["solution-plan", "execution-artifact"],
        quality_gates: ["decision-gate", "evidence-gate"],
        responsibilities: ["把目标和领域判断转成最小可交付方案。", "明确依赖、责任、回滚和验证路径。"],
        inputs: ["目标契约", "领域分析", "约束和风险"],
        outputs: ["方案", "执行计划", "回滚与验证说明"],
        workingLogic: ["先确定最小可交付结果。", "再拆解依赖和责任。", "最后绑定验证与回滚。"],
        checklist: ["方案对应目标结果", "依赖和非目标明确", "验证和回滚可执行"],
        escalation: ["方案需要不可逆操作", "依赖或责任边界不清"],
        doNotDo: ["不得在未确认约束时扩大方案范围。"],
        activation: {
          activeWhen: ["任务要求产出方案、原型、计划、内容或其他可执行成果。"],
          consultedWhen: ["只需评估现有方案的可行性或成本。"],
          notApplicableWhen: ["任务明确只做研究、审计或信息汇总。"],
          reassessWhen: ["方案影响范围、依赖、成本或回滚难度扩大。"]
        }
      },
      {
        id: "adoption-lead",
        name: "Adoption Lead",
        role: "adoption",
        when_to_load: ["成果需要被用户采用、推广、上线、培训或持续运营"],
        primary_outputs: ["adoption-plan", "feedback-loop"],
        quality_gates: ["value-gate", "delivery-gate"],
        responsibilities: ["设计成果采用、触达、运营和反馈闭环。", "定义价值指标、观测周期和下一轮决策。"],
        inputs: ["目标用户", "解决方案", "价值指标"],
        outputs: ["采用计划", "指标观测", "反馈与复盘计划"],
        workingLogic: ["识别采用者和阻力。", "定义触达与观测方式。", "把反馈转成下一轮决策。"],
        checklist: ["采用者明确", "指标和数据来源明确", "复盘责任明确"],
        escalation: ["无法观测价值", "上线或触达需要额外授权"],
        doNotDo: ["不得用模糊的体验提升替代可验证价值。"],
        activation: {
          activeWhen: ["成果需要上线、推广、销售、培训、运营或组织采用。"],
          consultedWhen: ["只需校准价值指标或采用风险。"],
          notApplicableWhen: ["一次性内部分析且没有后续采用或运营。"],
          reassessWhen: ["目标用户、渠道、发布节奏或收益指标变化。"]
        }
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
        doNotDo: ["不得放行缺少证据的完成结论。"],
        activation: {
          activeWhen: ["存在交付、风险、回归或高影响结论。"],
          consultedWhen: ["只需检查证据充分性或有限风险。"],
          notApplicableWhen: ["没有任何待验证行为或结论的初步构想。"],
          reassessWhen: ["验证失败、出现 P0/P1 或高风险信号。"]
        }
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
        doNotDo: ["不得把草案标记为已充分领域化。"],
        activation: {
          activeWhen: ["standard/assurance 任务、跨角色决策或最终交付。"],
          consultedWhen: ["lightweight 任务只需复核状态和结论边界。"],
          notApplicableWhen: ["不适用；单一负责人可兼任但必须记录交付责任。"],
          reassessWhen: ["角色冲突、门禁失败或交付范围变化。"]
        }
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
        members: ["delivery-manager", "domain-expert", "solution-builder", "adoption-lead", "quality-reviewer"],
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
            name: "方案构建",
            owner: "solution-builder",
            actions: ["把分析转成最小可交付方案、依赖、验证和回滚。"],
            outputs: ["solution-plan"],
            gates: ["decision-gate"]
          },
          {
            name: "采用与价值",
            owner: "adoption-lead",
            actions: ["定义采用路径、价值指标、反馈和复盘计划。"],
            outputs: ["adoption-plan"],
            gates: ["value-gate"]
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
      qualityGates: [
        "intake-gate",
        "role-activation-gate",
        "value-gate",
        "decision-gate",
        "handoff-gate",
        "complexity-gate",
        "evidence-gate",
        "verification-gate",
        "quality-gate",
        "risk-gate",
        "delivery-gate"
      ],
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
        failureExamples: ["没有说明未命中内置 domain pack。", "没有列出目标用户或核心任务。"],
        expectedWorkflow: "goal-intake",
        expectedProfile: executionProfile,
        minimumVerificationLevel: "V1",
        expectedRolePlan: {
          active: ["intake-analyst", "delivery-manager"],
          consulted: [],
          notApplicable: ["domain-expert", "solution-builder", "adoption-lead", "quality-reviewer"]
        }
      },
      {
        id: "generic-delivery-review",
        input: "用户要求确认当前团队草案是否可以注册使用。",
        expectedOutputs: ["analysis-report.md", "quality-review.md", "delivery-summary.md"],
        mustPassGates: ["evidence-gate", "quality-gate", "risk-gate"],
        failureExamples: ["把草案声明为成熟领域团队。", "缺少证据、风险或后续补强建议。"],
        expectedWorkflow: "delivery-review",
        expectedProfile: executionProfile,
        minimumVerificationLevel: riskLevel === "high" ? "V3" : "V2",
        expectedRolePlan: {
          active: ["delivery-manager", "quality-reviewer"],
          consulted: [],
          notApplicable: ["intake-analyst", "domain-expert", "solution-builder", "adoption-lead"]
        }
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
    riskControls,
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
