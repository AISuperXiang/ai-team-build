# Verification Methodology

| Level | Evidence | Conclusion ceiling |
| --- | --- | --- |
| V0 | Reasoning only | Hypothesis or design only |
| V1 | Static checks | Static constraints passed |
| V2 | Repeatable tests or contract simulation | Tested behavior passed |
| V3 | Runtime or end-to-end path | Critical path passed |
| V4 | Real acceptance or production observation | Delivery outcome observed |

Generated structure checks do not validate real domain outcomes. Missing evidence lowers the conclusion.

Contract checks and execution acceptance are separate. Execution evidence must bind the declared
scenario input and include produced artifact hashes, passed gates, failure assertions, and distinct
assertion, runner, and wrapper results. Zero execution or unknown process results cannot pass.

`verificationLevel` only represents workflow execution and must equal `verificationScopes.workflow`.
Rate data, facts, workflow execution, strategy outcomes, and personalization separately. Evidence
from one scope must not raise another scope.
