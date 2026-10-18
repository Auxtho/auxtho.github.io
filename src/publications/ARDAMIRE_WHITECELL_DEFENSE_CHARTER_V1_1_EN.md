# Ardamire × WhiteCell Defense Architecture Charter

**Version 1.1 · October 18, 2026 · Auxtho Inc.**

This charter applies the principles of the [Auxtho AI Charter](AUXTHO_AI_CHARTER_V1_0_EN.md) to the design of the Ardamire Defense Layer and WhiteCell. Its provisions guide development, operation and validation. The implementation status and actual effects of individual capabilities are described through the implementation and test records for the relevant version.

## Design Philosophy

### Our Goal Is Powerful Active Defense

We aim to meet the speed and complexity of automated attacks, restrict, isolate and neutralize an attacker's ability to act within legitimately authorized environments, and protect people and legitimate work.

Our ambition goes beyond observing attacks. We seek a defense that responds in time to prepared attack sequences and variants, verifies its actual protective effects, and prepares for what comes next.

WhiteCell is designed to detect, investigate and analyze threats, request defensive actions with explicit targets and scope, and track their results. Ardamire is designed to independently check current identity, authority, policy, targets and state, and enforce permitted actions. Independent roles require verification of actual authority and enforcement boundaries; different names or folders are not sufficient.

### Protection Serves Meaningful Human Choice

People must be able to decide, within their rights and legitimate authority, what to delegate to AI, whether to delegate at all, and when to withdraw delegation. It must be clear who defines the available choices, who is affected, and how to seek explanations, challenge decisions, obtain corrections and leave a service.

Being a human operator does not confer unlimited authority over others' rights. Equally, this principle does not give an attacker a right to disable security controls or infringe the rights of others.

### Auxtho Will Never Develop Offensive AI

We develop for powerful defense within legitimately authorized environments. We will not build capabilities for external intrusion or pursuing attackers to retaliate. Defense-validation research in authorized, isolated environments also requires explicit targets, authority and execution boundaries.

## Nine Core Design Principles

### 01 Bound Missions and Make AI Workers Replaceable

Each WhiteCell AI worker (hereafter, worker) performs a bounded mission, records its results and terminates. Long-running investigations are designed to continue through replaceable workers receiving the evidence they need.

After a mission, a worker's temporary working information is discarded, its permissions are revoked, and its execution environment is discarded or reset through a defined process. Model weights and inference servers need not be recreated each time, but reuse of shared servers, caches and memory must be checked for information or authority crossing mission, incident or user boundaries.

When a mission expires, is canceled or ends, new action requests must be blocked and the worker's authority revoked. Responsibility for tracking, stopping and verifying actions underway continues separately. Worker termination does not establish that effects in processes, networks or storage have stopped, or that an incident is closed.

Incident state, valid protective measures, unfinished execution and actual results are managed independently of workers. Verify termination, reset and isolation through actual state, not names or flags.

### 02 Build Layered Defense That Meets the Speed of Attacks

Assign roles according to response deadlines and the judgment required. The range labels below refer to response time and analytical context, not physical distance.

- **Immediate protection:** Rules and state machines handle clear, preauthorized protective conditions.
- **Close-range WhiteCell:** Rapidly interprets short signals and requests defensive actions with precise targets, scope and evidence.
- **Mid-range WhiteCell:** Connects signals across incidents and time to review missed detections, false positives, attack propagation and conflicting defenses.
- **Long-range WhiteCell:** Investigates complex sequences, new variants and long-term patterns, and proposes defensive improvements.

Consider models suited to short missions requiring rapid responses, and models suited to broader, deeper analysis. Assign them by actual task performance and response deadlines, not model size. Deep analysis or a model majority must not delay immediate protection that is already authorized. Essential protective paths must not depend on the availability or integrity of a particular AI.

Measure the full path through detection, judgment, request, authority checks, action and effect verification. Evaluate missed defensive opportunities and delays imposed on legitimate work, not just first-response latency.

### 03 WhiteCell Defends Actively and Ardamire Enforces Independently

WhiteCell is designed to request defensive actions that restrict an attacker's ability to act, and to check the results. Session termination, temporary permission revocation, file or process isolation, and restrictions on outbound transfers are examples of authorized measures.

WhiteCell's judgments, learning results and agreement among models do not create execution authority. WhiteCell cannot expand its own policies or permissions, or approve its own proposals. Ardamire must independently check current identity, authority, target, version, policy and state, rather than trust an explanation alone.

Authority and conditions must remain valid at execution time. Delegation, copying and distributed execution do not create new authority or expand limits on targets, the number and scale of actions, duration or other constraints for either individual tasks or the overall undertaking. Earlier approvals cannot justify execution after scope changes, expiry or revocation. Define and validate when revocation takes effect and how disconnected operation behaves at the actual enforcement boundary.

Preauthorized protection may execute promptly within its defined targets, actions, scope, deadlines and conditions. New policies, expanded permissions, material changes and restoration require validation and legitimate approval for the specific change. Urgency and model confidence do not replace these boundaries.

### 04 Design for Mistakes and Misuse by Both AI and People

Account for AI hallucination, misjudgment and compromised inputs alongside human error, overconfidence and mistaken approvals. Verification must address impersonated identities or roles, instructions disguised as legitimate work, poisoned material and defensive memory, and misuse of operator authority.

A danger assessment does not establish that an attack occurred. Human approval does not make a wrong target or an illegitimate action acceptable. Keep observed facts, AI interpretation, human approval, policy decisions and execution results distinct. Important decisions require independent ways to inspect original evidence and current state.

Reviewers must understand the target, version, action scope, expected impact, duration, cancellation and restoration conditions, and unresolved questions. Material changes require fresh approval for that change. Limit the spread of error through authority, duration, targets, action scope and aggregate execution limits. Verify stopping, correction and recovery paths too.

### 05 Handle Unconfirmed State Precisely and Sustain Necessary Protection

Do not manufacture conclusions when evidence is insufficient or state cannot be established. Distinguish uncertainty about attacks, evidence reliability, authority validity and execution results, and record it as UNKNOWN: a state that has not been established.

Do not reward unsupported confidence over an appropriate UNKNOWN. Equally, uncertainty does not end the responsibility to respond. Define which protections remain, what is held, who will verify the missing facts, how, and by when.

Preparing a request, receiving it, approving it, starting execution, completing execution and verifying effects are different states. A lost response or unclear result must not be arbitrarily classified as success, failure or cancellation, or trigger blind repetition of the same action.

Do not execute a new action whose authority is unverified. Uncertainty in an individual judgment must not lead to arbitrarily disabling valid mandatory security policies or lifting existing protections. Address failures in recording and verification paths, and design to preserve necessary protection and human intervention paths.

### 06 Preserve Records and Accountability Across Worker Changes

Identify workers, missions, incidents and actions separately. Worker replacement, reset or changes in how records are organized must not break incident continuity, valid isolation or revocation, or the tracking of unfinished actions.

Keep original evidence, collection source, time and method, observed facts, AI analysis, human approvals, enforcement results and correction history distinct. Make corrections traceable rather than silently overwriting the original record.

Record integrity does not establish the truth of its contents. Forged or poisoned input can also be preserved faithfully, so address provenance, verification status and conflicting evidence together. Hashes, signatures and audit records alone do not establish that an attack occurred or a defense succeeded.

Manage retention and deletion according to the purpose for which the information is used, applicable information-protection requirements and legitimate retention obligations. Incident continuity does not require permanent storage of all personal data. Minimize retained material and access, and provide ways to address legitimate deletion or correction requests alongside necessary evidence preservation.

### 07 Develop and Adopt Models for Actual Defensive Performance

We need models that perform authorized defensive work accurately and on time, not simply famous or large models. Compare rules, state machines and existing models, considering performance, permissions, data, licensing and cost before choosing specialized training or dedicated model development where needed.

A specialized model should, according to its assigned role, observe and analyze accurately or generate defensive action requests with explicit targets, versions, actions, scope, deadlines and evidence. It should report UNKNOWN when the evidence or state needed for a determination cannot be established. Develop capability through actual mission performance rather than plausible explanations.

A model that repeatedly refuses authorized defensive work or misses the time for action is unsuitable for that role. Distinguish justified refusal of unauthorized requests from unnecessary avoidance of authorized work. Do not bypass provider refusals or security boundaries to use a model.

Define expected outcomes and criteria before evaluation. Include verified successes, failures and recovery cases, legitimate work, false positives, unauthorized requests and memory poisoning. Another LLM's agreement alone does not establish ground truth. Use comparable baselines under the same conditions to assess restriction of actual attack behavior, preservation of legitimate work, response time, authority compliance and cost. Authority checks remain in place after model changes.

### 08 Keep Active Defense Within Legitimately Authorized Environments

Detect attacks and act to restrict, isolate and neutralize them within systems, sessions, data and execution environments under legitimate control. A customer's or partner's systems do not become ours to control merely because they are connected.

Actual targets and effects determine the boundary. A command originating in our system is not authorized internal defense if it intrudes into or makes unauthorized changes to an external system.

Even when an attacker is using our systems, we do not intrude into their external systems, send malware or attack commands back at them, or retaliate. Greater AI capability does not change this boundary.

Investigating external offenders and enforcing the law belong to competent authorities. Provide necessary incident records only under proper authorization and through lawful procedures. This does not confer permission for automatic external transmission or unlimited sharing of personal information.

### 09 Neutralize Attacks While Preserving Legitimate Work and Recovery Paths

A suspicious signal alone must not automatically shut down an entire organization. Restrict affected targets and actions for the necessary scope and duration, while allowing unaffected work to continue after independent authority and state checks.

Limit attack propagation alongside mistaken decisions, duplicate isolation, excessive blocking and conflicts between automated responses. Verify protection and operational continuity during failures of models, workers or record-keeping systems, concurrent execution and cancellation.

Restoration is not simply lifting a block. Check current state and authority, residual risks and unfinished actions, and complete the necessary validation and approvals. A late response must not revive a closed incident or revoked authority.

Do not judge defense by explanations, approval records, compilation, test counts or normal response codes alone. Check whether actual attack behavior was restricted, effects stayed within scope, and how legitimate work and human choice were affected.

## Standards We Uphold as Capability Grows

- Judgment is not authority.
- Inference is not fact.
- Approval is not successful execution.
- A stop request is not proof that an action stopped.
- Record integrity does not establish the truth of its contents.
- Speed does not justify exceeding authority.
- Protection must not become a pretext for taking away legitimate human choice.
- Greater intelligence does not erase accountability or expand its own authority.

## Our Commitment

We pursue defense that actively neutralizes attack capabilities within legitimately authorized environments, preserves legitimate work and protects meaningful human choice. As workers are replaced and models advance, we design so that effects remain verifiable, authority checks remain independent, and evidence and accountability for actions endure.

We support the [Asilomar AI Principles](https://futureoflife.org/open-letter/ai-principles/). We advance powerful defense and responsible control together so that people can work with more capable AI on a foundation of trust.

[Ardamire implementation and test records](https://auxtho.com/security/ardamire/) · [WhiteCell introduction](https://auxtho.com/whitecell/)