function tableRow(cells) {
  return `| ${cells.map((cell) => String(cell || "").replace(/\n/g, "<br>")).join(" | ")} |`;
}

function markdownList(items) {
  const list = Array.isArray(items) ? items : [];
  return list.length > 0 ? list.map((item) => `- ${item}`).join("\n") : "-";
}

function renderSectionContent(sections, content, fallback) {
  return sections.map((section) => {
    const items = content && Array.isArray(content[section]) ? content[section] : [];
    const body = items.length > 0
      ? markdownList(items)
      : markdownList([fallback(section)]);
    return `## ${section}\n\n${body}`;
  }).join("\n\n");
}

function markdownTable(headers, rows) {
  return [
    tableRow(headers),
    tableRow(headers.map(() => "---")),
    ...rows.map(tableRow)
  ].join("\n");
}

function renderDoc(doc) {
  return `# ${doc.title}

${renderSectionContent(doc.sections, doc.content, (section) => `${section} 必须写入可验证规则、证据要求和失败处理。`)}
`;
}

function renderTemplateArtifact(template) {
  return `# ${template.title}

${renderSectionContent(template.sections, template.content, (section) => `${section}：填写事实、证据、风险和未解决问题。`)}
`;
}

function renderCapabilityMatrix(spec) {
  const rows = (spec.capabilityMatrix || []).map((item) => [
    item.capability,
    item.owner,
    item.inputs.join("<br>"),
    item.outputs.join("<br>"),
    item.gates.join(", "),
    item.maturity
  ]);

  return `# Capability Matrix

${markdownTable(["能力", "负责人", "输入", "输出", "门禁", "成熟度"], rows)}
`;
}

function renderAcceptanceScenarios(spec) {
  const sections = (spec.acceptanceScenarios || []).map((scenario) => {
    return `## ${scenario.id}

### 输入

${scenario.input}

### 期望产出

${markdownList(scenario.expectedOutputs)}

### 必过门禁

${markdownList(scenario.mustPassGates)}

### 失败样例

${markdownList(scenario.failureExamples)}`;
  }).join("\n\n");

  return `# Acceptance Scenarios

${sections || "- 尚未声明验收场景。"}
`;
}

function renderDataContracts(spec) {
  const sections = (spec.dataContracts || []).map((contract) => {
    return `## ${contract.source}

- 时效要求：${contract.freshness}
- 缺失处理：${contract.missingDataPolicy}

### 必需字段

${markdownList(contract.requiredFields)}

### 允许用途

${markdownList(contract.allowedUse)}`;
  }).join("\n\n");

  return `# Data Contracts

${sections || "- 尚未声明数据契约。"}
`;
}

module.exports = {
  markdownTable,
  renderAcceptanceScenarios,
  renderCapabilityMatrix,
  renderDataContracts,
  renderDoc,
  renderSectionContent,
  renderTemplateArtifact
};
