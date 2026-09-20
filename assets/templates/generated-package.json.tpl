{
  "name": "{{skill.id}}",
  "version": "{{skill.version}}",
  "description": "{{skill.description}}",
  "engines": {
    "node": ">=18"
  },
  "scripts": {
    "validate:governance": "node scripts/assess-governance.js --status assets/templates/workflow-status.json",
    "validate:workspace": "node scripts/validate-workspace.js",
    "acceptance": "npm run acceptance:contracts",
    "acceptance:contracts": "node scripts/run-acceptance-scenarios.js . --mode contracts",
    "acceptance:execution": "node scripts/run-acceptance-scenarios.js . --mode execution",
    "feedback:summary": "node scripts/summarize-feedback.js",
    "test:governance": "node --test test/governance-core.test.js",
    "test": "npm run validate:structure && npm run validate:contracts && npm run validate:governance && npm run test:governance && npm run acceptance:contracts"
  },
  "license": "MIT"
}
