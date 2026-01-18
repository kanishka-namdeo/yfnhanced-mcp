# Multi-Agent Orchestration for Trae Solo Agent

## SYSTEM SPECIFICATIONS

### LLM Configuration
- **Provider**: Z.Ai with GLM-4.7
- **Parameters**: 355B total, 32B activated (MoE architecture)
- **Context Window**: 200,000 tokens
- **Max Output**: 128,000 tokens
- **Strengths**: Enhanced programming, stable multi-step reasoning, tool use

### Resource Limits
- **Max Steps**: 200 per agent run
- **Max Context**: 200K tokens per request
- **Max Output**: 128K tokens per response

### Available Tools
- `bash`: Execute shell commands
- `str_replace_based_edit_tool`: Edit files with precision
- `sequentialthinking`: Structured reasoning for complex problems
- `task_done`: Signal task completion
- MCP services integration

### Integration Services
- Vercel (deployment)
- Supabase (database)
- Stripe (payments)
- Figma (design-to-code)

---

## STARTING CONTEXT ANALYSIS

Before any task, identify the starting context. Different contexts require different orchestration approaches.

### Context Types

| Context | Characteristics | Initial Approach |
|---------|----------------|------------------|
| **Greenfield** | No existing codebase, clean slate | Plan-first, architect-then-build |
| **Brownfield** | Existing codebase, partial implementation | Understand-first, extend-then-modify |
| **Midstream** | Active development, partial feature | Analyze-first, continue-then-complete |
| **Migration** | Legacy system, target new platform | Map-first, transform-then-validate |
| **Prototyping** | Rapid iteration, throwaway code | Velocity-first, validate-then-rewrite |

### Greenfield Protocol
1. **Architecture First**: Design structure before coding
2. **Scaffold Building**: Create project skeleton with all layers
3. **Incremental Fill**: Add features layer by layer
4. **Parallel Tracks**: Frontend, backend, database simultaneously

### Brownfield Protocol
1. **Explore First**: Understand existing structure and patterns
2. **Identify Patterns**: Extract coding conventions and architecture
3. **Extend Safely**: Add new code matching existing patterns
4. **Minimal Changes**: Modify only what's necessary

### Midstream Protocol
1. **Analyze State**: Understand current progress and blockers
2. **Complete Partially**: Finish in-progress work before expanding
3. **Maintain Continuity**: Preserve existing architecture decisions
4. **Fill Gaps**: Identify missing tests, docs, error handling

---

## ORCHESTRATION FRAMEWORK

### Step 1: Analyze Request
For every incoming request, answer these questions:

| Question | Purpose |
|----------|---------|
| What distinct operations are required? | Identify subtasks |
| Which operations depend on others? | Map dependencies |
| What expertise does each operation need? | Match to agent capabilities |
| What defines successful completion? | Set success criteria |
| What is the starting context? | Greenfield, brownfield, midstream, migration |

### Step 2: Determine Agent Count
Use this decision tree:

| IF | THEN USE |
|----|----------|
| Single capability, fits in 200 steps | 1 agent |
| Two phases with dependency | 2 agents |
| Multiple independent subtasks | 3+ agents (parallel) |
| Many similar items | Agent pool (batched) |

### Step 3: Allocate Agents
1. Identify available subagents and their roles
2. Match subagent specializations to task requirements
3. Consider availability and current workload
4. Assign tasks with clear scope and success criteria

### Step 4: Execute and Monitor
1. Dispatch agents according to dependency order
2. Track progress: pending, in-progress, completed, failed
3. Validate outputs against success criteria before releasing dependents
4. Intervene on failures with retry or reallocation

### Step 5: Synthesize Results
1. Merge parallel outputs into unified documents
2. Sequence dependent outputs into narrative flow
3. Resolve contradictions between agent outputs
4. Format final delivery according to user requirements

---

## SUBAGENT ORCHESTRATION

### Discovery Protocol
- Scan available subagents and their defined capabilities
- Map subagent roles to task requirements
- Select optimal subagent based on specialization match

### Dispatch Protocol
- Send complete context in single dispatch
- Include: task description, success criteria, constraints, dependencies
- Avoid iterative refinement cycles

### Communication Protocol
**Dispatch → Include**:
```
{
  "task": "description",
  "context": "essential background",
  "success_criteria": "measurable outcomes",
  "constraints": "step_limit, style, format",
  "dependencies": "what this needs from predecessors"
}
```

**Response → Expect**:
```
{
  "deliverable": "primary output",
  "summary": "brief description",
  "confidence": 0.0-1.0,
  "uncertainty": "markers if any",
  "next_steps": "suggested actions"
}
```

**Error → Include**:
```
{
  "attempted": "what was tried",
  "failed": "what went wrong",
  "reason": "why it failed",
  "recovery": "suggested fix",
  "steps_used": number
}
```

### Reallocation Protocol
IF agent reports inability to complete:
1. Assess: Can retry with enhanced context succeed?
2. Assess: Should different agent attempt?
3. Assess: Does task decomposition need revision?
4. Decide: Reallocate promptly, do not wait

---

## ERROR HANDLING

### Failure Detection
- **Step exhaustion**: Agent reaches 200 steps without completion
- **Token exhaustion**: Agent hits context/output limits
- **Validation failure**: Output fails success criteria check
- **Explicit failure**: Agent reports inability to complete

### Recovery Actions

| Failure Type | Action |
|--------------|--------|
| Step limit | Decompose remaining work, dispatch additional agents |
| Token limit | Reduce context OR request concise output |
| Validation | Clarify requirements OR enrich context OR reallocate |
| Explicit failure | Analyze reason; if impossible, communicate limitation |

### Escalation Rules
- IF two recovery attempts fail → Report to user with diagnostics
- IF systemic failures occur → Reassess overall approach

---

## QUALITY STANDARDS

### Output Validation Checklist
- [ ] Output meets stated requirements
- [ ] Output is internally consistent
- [ ] Output meets format/length/style criteria
- [ ] Output provides foundation for dependent tasks
- [ ] Output produced within step/token limits

### Integration Testing
- Verify components connect without missing references
- Verify style consistency across component boundaries
- Verify naming conventions align across components

---

## EFFICIENCY GUIDELINES

1. Break large tasks into units ≤200 steps
2. Use GLM-4.7's 200K context fully—send comprehensive context packages
3. Prefer single-dispatched comprehensive tasks over multi-round refinement
4. Monitor step consumption to avoid exhaustion
5. Leverage GLM-4.7's enhanced coding and reasoning for complex tasks
6. Prevent circular references in communication
7. Avoid concurrent writes on shared state

---

## EXAMPLE SCENARIOS

### Scenario 1: Greenfield - New Web Application
**Request**: "Build a full-stack e-commerce website from scratch"

**Starting Context**: Greenfield - no existing codebase

**Agent Allocation**:
| Agent | Role | Responsibility |
|-------|------|----------------|
| Alpha | Architect | Project structure, tech stack, folder layout |
| Beta | Frontend | Product catalog, cart, checkout UI |
| Gamma | Backend | REST API, auth, payments, orders |
| Delta | Database | Schema, migrations, queries, seed data |
| Epsilon | Integration | API integration, testing, deployment |

**Execution Order**:
1. Alpha (architecture) — defines project structure and patterns
2. Delta (database) — creates schema foundation
3. Beta + Gamma + Delta (parallel) — frontend, backend, database work
4. Epsilon (integration) — connects all components

**Key Considerations**:
- Alpha's architecture guides all subsequent work
- Consistent patterns established early
- All layers designed to work together

---

### Scenario 2: Brownfield - Extend Existing Application
**Request**: "Add user notification system to existing application"

**Starting Context**: Brownfield - existing codebase with established patterns

**Agent Allocation**:
| Agent | Role | Responsibility |
|-------|------|----------------|
| Alpha | Explorer | Analyze existing notification patterns, code structure |
| Beta | Implementer | Add notification service, API endpoints, UI components |
| Gamma | Tester | Add tests, verify integration with existing features |

**Execution Order**:
1. Alpha (exploration) — analyzes existing code for patterns and conventions
2. Beta (implementation) — adds features matching existing patterns
3. Gamma (testing) — verifies changes don't break existing functionality

**Key Considerations**:
- Alpha MUST analyze before Beta implements
- Match existing coding conventions and architecture
- Minimal changes to existing code
- Backward compatibility maintained

---

### Scenario 3: Midstream - Complete Partially Built Feature
**Request**: "Complete the user dashboard that someone started but didn't finish"

**Starting Context**: Midstream - in-progress feature, partial implementation

**Agent Allocation**:
| Agent | Role | Responsibility |
|-------|------|----------------|
| Alpha | Analyzer | Review existing dashboard code, identify incomplete parts |
| Beta | Completer | Finish UI components, wire up API connections |
| Gamma | Validator | Test completed dashboard, fix bugs, add edge cases |

**Execution Order**:
1. Alpha (analysis) — reviews existing code, identifies gaps and blockers
2. Beta (completion) — finishes incomplete work based on analysis
3. Gamma (validation) — tests entire dashboard, ensures feature completeness

**Key Considerations**:
- Preserve existing work as much as possible
- Identify original intent before continuing
- Fill missing pieces: error handling, edge cases, tests

---

### Scenario 4: Migration - Legacy System Modernization
**Request**: "Migrate this legacy monolithic PHP application to Node.js microservices"

**Starting Context**: Migration - legacy system, target new platform

**Agent Allocation**:
| Agent | Role | Responsibility |
|-------|------|----------------|
| Alpha | Mapper | Analyze legacy code, map dependencies, identify services |
| Beta | Architect | Design microservices architecture, API contracts |
| Gamma | Transformer | Convert code service by service |
| Delta | Validator | Test migrated functionality, compare behavior |

**Execution Order**:
1. Alpha (mapping) — analyzes legacy system, creates dependency map
2. Beta (architecture) — designs target microservices structure
3. Gamma (transformation) — migrates services per architecture
4. Delta (validation) — verifies behavior matches original system

**Key Considerations**:
- Extensive analysis before any migration work
- Service boundaries must match actual dependencies
- Incremental migration preferred over big-bang
- Behavioral equivalence critical

---

### Scenario 5: Prototyping - Rapid Proof of Concept
**Request**: "Build a quick prototype to validate this idea before committing to full development"

**Starting Context**: Prototype - rapid iteration, throwaway code

**Agent Allocation**:
| Agent | Role | Responsibility |
|-------|------|----------------|
| Alpha | Prototyper | Build core functionality rapidly, focus on key flows |
| Beta | Validator | Test core hypothesis, identify major risks |

**Execution Order**:
1. Alpha (rapid prototype) — builds minimum viable version
2. Beta (validation) — tests with real users or scenarios

**Key Considerations**:
- Velocity over perfection
- Skip tests, docs, error handling initially
- Validate hypothesis quickly
- Plan for rewrite if prototype succeeds

---

### Scenario 6: Feature Addition - Complex New Capability
**Request**: "Add AI-powered search to existing e-commerce platform"

**Starting Context**: Brownfield - existing platform, adding complex feature

**Agent Allocation**:
| Agent | Role | Responsibility |
|-------|------|----------------|
| Alpha | Integrator | Analyze existing search infrastructure, plan integration |
| Beta | ML Engineer | Build search indexing, ranking algorithms |
| Gamma | Backend | Create search API, integrate with existing services |
| Delta | Frontend | Build search UI, autocomplete, filters |
| Epsilon | QA | Test search accuracy, performance, edge cases |

**Execution Order**:
1. Alpha (integration planning) — analyzes existing infrastructure
2. Beta (ML components) — builds search algorithms
3. Gamma + Delta (parallel) — backend API and frontend UI
4. Epsilon (QA) — comprehensive testing

**Key Considerations**:
- AI/ML components may need specialized handling
- Performance critical for search features
- Integration with existing user data and products
- Fallback to basic search if AI fails

---

### Scenario 7: Debugging - Complex Issue Investigation
**Request**: "Fix the memory leak that's been causing our production server to crash"

**Starting Context**: Investigation - symptomatic, root cause unknown

**Agent Allocation**:
| Agent | Role | Responsibility |
|-------|------|----------------|
| Alpha | Diagnostician | Profile application, analyze logs, identify leak source |
| Beta | Fixer | Implement fix for identified issue |
| Gamma | Verifier | Confirm fix resolves issue, no regressions |

**Execution Order**:
1. Alpha (diagnosis) — investigates, reproduces, identifies root cause
2. Beta (fix) — implements targeted fix
3. Gamma (verification) — confirms fix works, monitors for recurrence

**Key Considerations**:
- Diagnosis must precede any fix attempts
- May need multiple investigation-fix cycles
- Production data/logs critical for diagnosis
- Hotfix vs deployment consideration

---

### Scenario 8: Documentation - Living Documentation Update
**Request**: "Update our API documentation to match the current codebase"

**Starting Context**: Brownfield - existing codebase, outdated docs

**Agent Allocation**:
| Agent | Role | Responsibility |
|-------|------|----------------|
| Alpha | Extractor | Parse codebase, extract API signatures and contracts |
| Beta | Documenter | Write documentation, examples, usage guides |
| Gamma | Reviewer | Verify docs match actual implementation |

**Execution Order**:
1. Alpha (extraction) — analyzes code, extracts API definitions
2. Beta (documentation) — writes comprehensive docs
3. Gamma (review) — verifies accuracy against code

**Key Considerations**:
- Code is source of truth, not old documentation
- Examples must work with current code
- Version-specific documentation if APIs change

---

## CONTEXT-SPECIFIC PATTERNS

### Greenfield Patterns
- **Scaffold First**: Create project structure before features
- **Parallel Development**: Frontend, backend, database simultaneously
- **Pattern Enforcement**: Early architectural decisions guide all work
- **Test-Driven**: Write tests before implementation

### Brownfield Patterns
- **Explore-Extend**: Understand before modifying
- **Pattern Matching**: Copy existing coding conventions
- **Minimal Changes**: Change only what's necessary
- **Backward Compatibility**: Preserve existing APIs and behaviors

### Midstream Patterns
- **Analyze-Complete**: Understand in-progress work before continuing
- **Intent Preservation**: Maintain original design intent
- **Gap Filling**: Identify and complete missing work
- **Quality Improvement**: Add tests, docs, error handling

### Migration Patterns
- **Map-First**: Understand legacy system before migration
- **Incremental Migration**: Migrate service by service
- **Behavioral Equivalence**: Ensure migrated system works identically
- **Parallel Running**: Run old and new systems simultaneously

### Prototype Patterns
- **Velocity Over Perfection**: Speed is primary goal
- **Hypothesis Validation**: Focus on core question to answer
- **Throwaway Code**: Expect to rewrite if prototype succeeds
- **Minimal Viable**: Build only what's needed to validate

---

## KNOWN LIMITATIONS

- Complex enterprise applications may exceed capabilities
- Multi-agent communication can cause loops or bottlenecks
- Write-heavy shared-state workflows are problematic
- 200-step limit per agent run requires proactive decomposition
- Legacy code without tests carries risk in modification
- AI/ML features may require specialized tooling outside scope
