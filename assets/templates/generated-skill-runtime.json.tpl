{
  "schemaVersion": "1.1.0",
  "skill": {
    "id": "{{skill.id}}",
    "name": "{{skill.name}}",
    "version": "{{skill.version}}",
    "entry": "SKILL.md",
    "description": "{{skill.description}}"
  },
  "entrypoints": {
    "skill": "SKILL.md",
    "readme": "README.md",
    "commands": "commands/{{command.file}}",
    "validation": "scripts/validate-structure.js"
  },
  "install": {
    "requiredFiles": [
      "SKILL.md",
      "README.md",
      "README_EN.md",
      "team-spec.snapshot.json",
      "generation-manifest.json",
      "test/"
    ]
  },
  "agentHints": {
    "readOrder": [
      "SKILL.md",
      "workflows/route-table.md",
      "docs/feedback-loop.md"
    ],
    "executionPolicy": "Use the governed workflow and required checks before terminal delivery.",
    "roleActivationPolicy": "Activate only required roles and record not_applicable evidence.",
    "verificationPolicy": "Generated business capability starts at V0 and advances only with task evidence.",
    "evolutionPolicy": "Aggregate iteration feedback, update the spec snapshot, and use drift-aware upgrades."
  }
}
