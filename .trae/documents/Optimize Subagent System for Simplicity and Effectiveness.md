# Optimize Subagent System in AGENTS.md

## Current Problems

**1. Hard to Call/Dispatch**
- Requires 5-question analysis before dispatching
- Complex dependency mapping required
- Decision tree is too long (69 lines just for agent count determination)

**2. Overlapping Responsibilities**
- **Explorer** vs **Analyzer** - both analyze existing code
- **QA/Tester** vs testing duties of other agents
- Multiple agents can handle similar tasks (confusing)

**3. Narrow Coverage**
- No dedicated debugging agent (Diagnostician only for root cause analysis)
- No performance optimization agent
- No documentation agent (Documenter exists but underutilized)
- No security/audit agent

**4. Role Mismatch with Available Skills**
- AGENTS.md defines 10 roles but actual workspace skills are different
- No clear mapping between AGENTS.md roles and `.trae/skills/` capabilities

## Optimization Plan

### Phase 1: Simplify Agent Roles (Reduce from 10 to 6)

**Consolidated Roles:**

| Current | New | Rationale |
|---------|------|-----------|
| Explorer + Analyzer | **Analyzer** | Single agent for codebase analysis |
| Backend + Frontend + Database | **Builder** | One agent for all implementation work |
| ML Engineer | Merge into **Builder** | AI/ML is just another implementation type |
| Integrator | **Integrator** | Keep as-is (unique orchestration role) |
| QA/Tester | Merge into **Validator** | Combine testing + validation |
| Diagnostician + Documenter | **Specialist** | Handle debugging, docs, security, etc. |
| Architect | **Architect** | Keep as-is (unique design role) |

**Final 6 roles:**
1. **Architect** - System design, architecture, planning
2. **Analyzer** - Codebase analysis, research, understanding
3. **Builder** - Implementation (backend, frontend, database, ML)
4. **Integrator** - Component connection, integration testing
5. **Validator** - Testing, validation, QA
6. **Specialist** - Debugging, docs, security, optimization

### Phase 2: Streamline Dispatch Process

**Replace 5-step analysis with 3 quick checks:**

```
□ What type of task?
  - Planning/Design → Architect
  - Understanding/Research → Analyzer
  - Implementation → Builder
  - Integration → Integrator
  - Testing/Validation → Validator
  - Debugging/Docs → Specialist

□ Multiple operations needed?
  - YES → Dispatch multiple agents in parallel/sequence
  - NO → Single agent handles it

□ Dependencies between operations?
  - YES → Sequential dispatch
  - NO → Parallel dispatch
```

### Phase 3: Clear Dispatch Matrix

Add simple decision table at top of AGENTS.md:

```
┌────────────────────────┬─────────────────────────────────┐
│ Task Type           │ Use This Agent                  │
├────────────────────────┼─────────────────────────────────┤
│ Design system/arch   │ Architect                       │
│ Analyze codebase     │ Analyzer                        │
│ Implement feature    │ Builder                         │
│ Connect components   │ Integrator                      │
│ Test/Validate       │ Validator                        │
│ Debug/Document/Opt  │ Specialist                       │
└────────────────────────┴─────────────────────────────────┘

Parallel when: Independent tasks, no shared files
Sequential when: Dependent tasks, shared state
```

### Phase 4: Update Implementation Details

**Simplify Task tool syntax:**
```typescript
// Before: Complex 3-step dispatch with dependency mapping
// After: Direct dispatch based on task type

Task(subagent_type="builder", description="Build feature", query="Implement user authentication")
```

**Add one-line dispatch rules:**
```markdown
## Quick Dispatch Rules

- Planning → Architect
- Research → Analyzer  
- Coding → Builder
- Integration → Integrator
- Testing → Validator
- Debugging/Docs → Specialist

Run in parallel when tasks are independent.
Run sequentially when tasks depend on each other.
```

### Phase 5: Map to Available Skills

Create mapping table connecting AGENTS.md roles to workspace skills:

```markdown
## Agent to Skill Mapping

| AGENTS.md Role | .trae/skills/ Counterpart |
|----------------|------------------------------|
| Architect | architect |
| Analyzer | mcp-research (for MCP) |
| Builder | senior-backend, mcp-builder, mcp-code-assistant |
| Integrator | mcp-builder |
| Validator | (new skill needed) |
| Specialist | frontend-code-review, (debug skill needed) |
```

### Phase 6: Remove Redundancy

- Delete duplicate content between sections
- Cross-reference instead of copying
- Consolidate success criteria to 3-5 items per role
- Remove verbose examples (keep 1 per pattern)

### Phase 7: Add Coverage Gaps

**Identify missing skills to create:**
- **debug-troubleshooter** - Handle debugging tasks
- **test-automation** - Test generation and validation
- **performance-optimizer** - Profiling and optimization
- **security-auditor** - Security review

## Expected Outcomes

✅ **Reduced from 10 to 6 agents** (40% reduction)
✅ **3-second dispatch decision** vs 2-minute analysis
✅ **Clear role boundaries** (no overlapping responsibilities)
✅ **Broader coverage** (includes debugging, optimization, security)
✅ **Matches workspace skills** (clear mapping table)
✅ **Easy to reference** (single-page decision matrix)

## Files to Modify

1. **AGENTS.md** - Complete rewrite with:
   - New 6-role system
   - Simplified dispatch process
   - Quick decision matrix
   - Agent-to-skill mapping
   - Consolidated examples

2. **Create new skills** (optional, for gaps):
   - `.trae/skills/debug-troubleshooter/SKILL.md`
   - `.trae/skills/test-automation/SKILL.md`
   - `.trae/skills/performance-optimizer/SKILL.md`
   - `.trae/skills/security-auditor/SKILL.md`