# Multi-Agent Orchestration - CRITICAL RULES

## IMMEDIATE SELF-CHECK (Run BEFORE every action)

```
□ Does this task have multiple operations? → YES: MUST dispatch subagents
□ Does this task have multiple layers (frontend/backend/database)? → YES: MUST dispatch subagents
□ Does this task have dependencies? → YES: MUST dispatch subagents
□ Starting context identified? → YES: Proceed
□ Dependencies mapped? → YES: Proceed

IF ANY of first 3 are YES and subagents NOT dispatched → STOP and dispatch immediately
```

---

## RULE 1: WHEN TO USE SUBAGENTS

**USE MULTIPLE SUBAGENTS WHEN:**
- Task involves 2+ distinct operations
- Task spans multiple layers (frontend/backend/database)
- Operations have dependencies on each other
- Task is complex (> 200 steps)

**SINGLE AGENT ONLY WHEN:**
- Exactly ONE operation (e.g., "fix this typo")
- Fits within 200 steps
- NO dependencies between operations

**Z.Ai PROVIDER CONSTRAINT**: Maximum 3 agents can run concurrently. This is a hard limit enforced by the Z.Ai provider.

**THIS IS NOT OPTIONAL**: Multi-operation tasks = multiple subagents

---

## STEP 1: Analyze Request

Answer these 5 questions first:

```
1. What distinct operations? List each operation
2. What dependencies? Draw dependency map
3. What expertise needed? Match to agent roles
4. Success criteria? Set measurable outcomes
5. Starting context? Greenfield/Brownfield/Midstream/Migration/Prototype
```

---

## STEP 2: Determine Agent Count

Use this decision tree:

```
IF:
  - 2+ operations OR 2+ layers OR dependencies? → YES
THEN:
  - Dispatch 2-3 agents (complex tasks)
  - Run independent subtasks in parallel
  - Respect Z.Ai concurrency limit: max 3 agents concurrently

IF:
  - 2 phases with dependency? → YES
THEN:
  - Use 2 agents sequentially

IF:
  - 1 operation, < 200 steps, no dependencies? → YES
THEN:
  - Single agent (rare)
```

---

## STEP 3: Dispatch Subagents

Map operations to roles:

| Role | When to Use |
|------|-------------|
| **Architect** | Greenfield projects, migrations |
| **Explorer** | Brownfield: analyze existing code |
| **Backend** | API development, server logic |
| **Frontend** | UI development |
| **Database** | Schema design, queries |
| **ML Engineer** | AI/ML, search, recommendations |
| **Integrator** | Connect components, test integration |
| **QA/Tester** | Testing, validation |
| **Diagnostician** | Debugging, root cause analysis |
| **Documenter** | Documentation |

---

## PARALLEL AGENTS BEST PRACTICES

### When to Run Agents in Parallel

**Run parallel when:**
- Tasks are completely independent (no shared resources)
- No data dependencies between agents
- Tasks operate on different files/areas
- Tasks can be validated separately

**Run sequential when:**
- Task B depends on Task A's output
- Agents need shared context or state
- Tasks modify the same files
- Integration testing required between phases

### Parallel Dispatch Examples

```
✓ CORRECT: Independent tasks (max 3 concurrent)
  Agent 1: Write backend API endpoints
  Agent 2: Design database schema
  Agent 3: Create UI components
  → All 3 run in parallel (at concurrency limit), then Integrator connects them

✓ CORRECT: Sequential dependency
  Agent 1: Design API schema
  Agent 2: Build backend (requires schema)
  Agent 3: Build frontend (requires backend)
  → Run 1 → 2 → 3 in sequence

✗ WRONG: Parallel with hidden dependencies
  Agent 1: Build backend API
  Agent 2: Build frontend consuming API
  → Frontend cannot work without backend - should be sequential

✗ WRONG: Exceeds concurrency limit
  Agent 1: Write backend API
  Agent 2: Design database schema
  Agent 3: Create UI components
  Agent 4: Write tests
  Agent 5: Create documentation
  → Too many agents! Must batch into max 3 concurrent
```

### Managing Parallel Execution

**Before dispatching parallel agents:**
1. Verify no shared file conflicts
2. Ensure independent success criteria
3. Define clear handoff points
4. Set timeout expectations for each agent

**During parallel execution:**
1. Monitor all agents for progress
2. Capture outputs as they complete
3. Document any issues or blockers
4. Don't start dependent tasks until all parallels finish

**After parallel execution:**
1. Validate each agent's output independently
2. Check for conflicts or inconsistencies
3. Run Integrator to merge outputs
4. Test the integrated system end-to-end

### Parallel Task Size Guidelines

```
Too small to parallelize:
- Single function changes
- Simple bug fixes
- One-line edits

Good for parallelization:
- Feature implementation across layers
- Multiple independent components
- Different file sets/areas
- Distinct capabilities (testing + coding + docs)

Too large for single agent:
- Complete system builds
- Multiple features together
- Complex refactoring across codebase
```

### Common Parallel Pitfalls

❌ **Race Conditions**: Multiple agents modifying same file
→ Solution: Define file ownership clearly

❌ **Hidden Dependencies**: Agent B needs Agent A's output
→ Solution: Map dependencies explicitly before dispatch

❌ **Integration Failures**: Parallels work but don't integrate
→ Solution: Always include Integrator agent after parallels

❌ **Lost Context**: Parallels don't know about each other
→ Solution: Include shared context in all dispatch packages

❌ **Exceeding Concurrency Limit**: Dispatching >3 agents simultaneously
→ Solution: Batch into waves of max 3, use sequential dispatch for additional agents

### Managing Z.Ai Concurrency Limit (Max 3)

**Batching Strategy:**

```python
# WRONG: Exceeds limit
Task(subagent_type="backend", description="Build API", query="...")
Task(subagent_type="database", description="Design schema", query="...")
Task(subagent_type="frontend", description="Create UI", query="...")
Task(subagent_type="qa", description="Write tests", query="...")
Task(subagent_type="documenter", description="Write docs", query="...")
# → FAILS: 5 agents exceeds limit

# CORRECT: Batch into waves
# Wave 1: Core implementation (max 3)
Task(subagent_type="backend", description="Build API", query="...")
Task(subagent_type="database", description="Design schema", query="...")
Task(subagent_type="frontend", description="Create UI", query="...")

# Wait for wave 1 to complete, then wave 2
# Wave 2: Testing and docs
Task(subagent_type="qa", description="Write tests", query="...")
Task(subagent_type="documenter", description="Write docs", query="...")
```

**Concurrency-Aware Dispatch Patterns:**

```python
# Pattern: 3-way parallel (max capacity)
Task(subagent_type="backend", description="API endpoints", query="...")
Task(subagent_type="database", description="Schema design", query="...")
Task(subagent_type="frontend", description="UI components", query="...")
# → All 3 run in parallel

# Pattern: 2-way parallel (leaves 1 slot available)
Task(subagent_type="backend", description="Build API", query="...")
Task(subagent_type="database", description="Design schema", query="...")
# → 2 agents run, 1 slot free for quick tasks

# Pattern: Sequential (when dependencies exist)
Task(subagent_type="architect", description="Design system", query="...")
# Wait, then:
Task(subagent_type="backend", description="Implement backend", query="...")
# Wait, then:
Task(subagent_type="frontend", description="Implement frontend", query="...")
# → 1 agent at a time
```

**Wave Dispatching for Large Tasks:**

```python
# Large task broken into waves
def dispatch_large_task():
    # Wave 1: Design and planning (3 agents)
    Task(subagent_type="architect", description="System design", query="...")
    Task(subagent_type="database", description="Schema design", query="...")
    Task(subagent_type="backend", description="API spec", query="...")
    # Wait for wave 1

    # Wave 2: Implementation (3 agents)
    Task(subagent_type="backend", description="Implement API", query="...")
    Task(subagent_type="frontend", description="Implement UI", query="...")
    Task(subagent_type="database", description="Create migrations", query="...")
    # Wait for wave 2

    # Wave 3: Testing and integration (3 agents)
    Task(subagent_type="qa", description="Write tests", query="...")
    Task(subagent_type="integrator", description="Integrate layers", query="...")
    Task(subagent_type="documenter", description="Write docs", query="...")
    # Wait for wave 3
```

---

## STARTING CONTEXT GUIDE

| Context | Signals | Action |
|---------|---------|--------|
| **Greenfield** | Empty directory | Architect → Build all layers |
| **Brownfield** | Existing code | Explorer → Match patterns → Extend |
| **Midstream** | Partial implementation | Analyzer → Complete gaps |
| **Migration** | Legacy code | Mapper → Transform → Validate |
| **Prototype** | "Quick", "proof" | Build minimal → Validate |

---

## PATTERNS BY CONTEXT

### Greenfield (New App)
```
Architect → Database → (Backend + Frontend parallel) → Integrator
```

### Brownfield (Extend Existing)
```
Explorer → Implementer → QA
```

### Midstream (Complete Partial)
```
Analyzer → Completer → QA
```

### Debugging
```
Diagnostician → Fixer → Verifier
```

### Complex Multi-Feature
```
Architect → Multiple specialized agents → Integrator → QA
```

---

## IMPLEMENTATION DETAILS

### Actual Dispatch Syntax

Use the `Task` tool to dispatch subagents. Syntax:

```
Task(subagent_type="agent_role", description="brief_description", query="detailed_task_instructions")
```

**Example: Dispatching Parallel Agents**

```python
# Parallel dispatch - all agents start simultaneously
Task(subagent_type="backend", description="Build API endpoints", query="Create REST API endpoints for user management with CRUD operations")
Task(subagent_type="database", description="Design database schema", query="Design PostgreSQL schema for users table with proper indexes and constraints")
Task(subagent_type="frontend", description="Create UI components", query="Build React components for user list and detail views with proper state management")

# Wait for all parallel agents to complete, then dispatch integrator
Task(subagent_type="integrator", description="Integrate components", query="Connect frontend to backend API and test full user management flow")
```

**Example: Sequential Dispatch**

```python
# Agent 1: Design schema first
Task(subagent_type="database", description="Design API schema", query="Design OpenAPI schema for e-commerce products API with all endpoints and models")

# Agent 2: Build backend (depends on schema)
Task(subagent_type="backend", description="Implement backend API", query="Implement the e-commerce products API using the OpenAPI schema designed in previous step. Use Express.js with proper error handling and validation")

# Agent 3: Build frontend (depends on backend)
Task(subagent_type="frontend", description="Build frontend UI", query="Build React frontend for e-commerce products using the backend API endpoints. Include product list, detail view, and search functionality")
```

**Key Parameters:**
- `subagent_type`: Role from the role mapping table (e.g., "backend", "frontend", "architect")
- `description`: Short 3-5 word summary of the task
- `query`: Detailed task instructions (max 30 words), include context and expectations

### Success Criteria Templates

Define measurable outcomes before dispatch:

**Backend Development:**
```
✓ All API endpoints implemented and documented
✓ Unit tests achieve >80% code coverage
✓ API returns proper HTTP status codes (200, 201, 400, 404, 500)
✓ Request validation in place for all inputs
✓ Error logging implemented with sufficient context
✓ No TypeScript or ESLint errors
```

**Frontend Development:**
```
✓ All UI components render without errors
✓ Responsive design works on mobile/tablet/desktop
✓ Form validation provides clear user feedback
✓ Loading states displayed for async operations
✓ Accessibility: keyboard navigation and ARIA labels
✓ No console errors or warnings
```

**Database Schema:**
```
✓ All tables have primary keys
✓ Foreign keys properly indexed
✓ Normalized to at least 3NF
✓ Migration scripts provided for deployment
✓ Database constraints enforce data integrity
✓ Schema documentation includes field types and relationships
```

**Integration:**
```
✓ All components connect without errors
✓ End-to-end user flow completes successfully
✓ Data passes correctly between layers
✓ Error handling works across boundaries
✓ Performance meets baseline metrics
✓ Integration tests pass all scenarios
```

### Error Handling and Recovery Patterns

**When an Agent Fails:**

1. **Analyze the Failure Type:**
   - **Timeout**: Agent exceeded time limit → Check if task is too complex
   - **Context Error**: Missing information → Add more context and retry
   - **Technical Error**: Code/implementation issue → Dispatch diagnostician
   - **Ambiguity**: Task unclear → Clarify and retry

2. **Recovery Strategies:**

```python
# Pattern 1: Retry with more context
# Agent failed due to unclear requirements
Task(subagent_type="backend", description="Retry with clarification", 
     query="Previous attempt failed because requirements were unclear. Here's additional context: The API must support pagination (page/limit), sorting by multiple fields, and filtering by date range. Use these exact endpoint paths: /api/users, /api/users/:id")

# Pattern 2: Split into smaller tasks
# Agent failed because task was too large
Task(subagent_type="backend", description="Step 1: Base API", query="Create basic Express server with user endpoints: GET /users (list), POST /users (create). No validation or pagination yet")
Task(subagent_type="backend", description="Step 2: Add validation", query="Add request validation to user endpoints using Joi. Validate name (string, 2-50 chars), email (valid email format), age (integer, 18-120)")
Task(subagent_type="backend", description="Step 3: Add pagination", query="Add pagination to GET /users using query params: page (default 1), limit (default 10, max 100)")

# Pattern 3: Dispatch diagnostician
# Agent failed with technical error
Task(subagent_type="diagnostician", description="Debug backend error", 
     query="Backend agent failed with error: 'Cannot read property of undefined'. The error occurred when implementing user creation endpoint. Investigate the root cause and provide a detailed fix")

# Pattern 4: Change agent role
# Wrong expertise assigned
Task(subagent_type="frontend", description="UI implementation failed", 
     query="Previous attempt by backend agent failed. Task requires frontend expertise: Create React component for user profile with avatar upload, form validation, and responsive layout")
```

3. **Escalation Criteria:**
   - 2 failed retries → Escalate to architect to reassess approach
   - 3 failed retries → Consider if task is feasible or needs scope reduction
   - Agent returns "cannot complete" → Review task complexity and split further

### Agent Communication and Context Sharing

**Shared Context Structure:**

When dispatching multiple agents, always include:
```python
# Template for shared context
shared_context = {
    "project_overview": "E-commerce platform for selling digital products",
    "tech_stack": {
        "frontend": "React with TypeScript, Tailwind CSS",
        "backend": "Node.js with Express, PostgreSQL",
        "deployment": "Docker, AWS ECS"
    },
    "conventions": {
        "api_style": "RESTful with OpenAPI spec",
        "naming": "camelCase for JS, snake_case for DB",
        "error_handling": "Standardized error responses"
    },
    "previous_outputs": {
        "schema": "Reference database schema designed by database agent",
        "api_docs": "OpenAPI specification from architect"
    }
}
```

**Context Passing Between Agents:**

```python
# Sequential: Pass output to next agent
# Agent 1 completes and returns: "Database schema created at /db/schema.sql"

# Agent 2 receives this output
Task(subagent_type="backend", description="Implement from schema", 
     query=f"Build the backend API using the database schema created by database agent. The schema file is at /db/schema/sql. Implement all CRUD operations for tables defined there")

# Parallel: Include same context in all agents
context = "Building user authentication system. Use JWT tokens, bcrypt for passwords. Existing auth utilities at /utils/auth.js"

Task(subagent_type="backend", description="Auth API endpoints", 
     query=f"{context}. Implement login and registration endpoints that integrate with existing auth utilities")

Task(subagent_type="frontend", description="Auth UI components", 
     query=f"{context}. Create login and registration forms that call the backend auth endpoints. Use existing form validation at /utils/validation.js")
```

**Output Format Expectations:**

```python
# Tell agents what to return
Task(subagent_type="backend", description="API implementation", 
     query="""
Implement the user management API. Return:
1. List of all endpoints created (path + HTTP method)
2. Example requests/responses for each endpoint
3. Any configuration files created or modified
4. Test commands to verify the API works
""")
```

### Monitoring and Progress Tracking

**Track Agent Execution:**

```python
# Manual tracking approach
agent_status = {
    "backend_agent": {
        "status": "running",
        "start_time": "14:30",
        "timeout": 1800,  # 30 minutes
        "expected_output": "API endpoints with tests"
    },
    "frontend_agent": {
        "status": "completed",
        "start_time": "14:30",
        "end_time": "14:45",
        "output": "UI components created"
    },
    "database_agent": {
        "status": "failed",
        "error": "Missing table relationships specification",
        "retry_count": 1
    }
}
```

**Timeout Guidelines by Task Type:**

| Task Type | Timeout | Notes |
|-----------|---------|-------|
| Simple bug fix | 5-10 min | Well-defined, narrow scope |
| Component creation | 15-30 min | Single file/module |
| Feature implementation | 30-60 min | Multiple files, integration |
| Architecture design | 20-40 min | Documentation and diagrams |
| Complex refactoring | 60-90 min | Large codebase changes |
| Debugging | 15-45 min | Variable based on complexity |

**Progress Checkpoints:**

```python
# Define checkpoints for long-running tasks
Task(subagent_type="backend", description="Build full API", 
     query="""
Implement the complete e-commerce API with these phases:
PHASE 1 (report back): Set up Express server and routing structure
PHASE 2 (report back): Implement product endpoints (CRUD)
PHASE 3 (report back): Implement order endpoints with validation
PHASE 4 (report back): Add authentication middleware
PHASE 5 (report back): Write comprehensive tests
Report completion of each phase before proceeding to next
""")
```

**Validation Checklist After Agent Completion:**

```
□ Did agent complete the assigned task?
□ Are all deliverables present (files, docs, tests)?
□ Does code follow project conventions?
□ Are there any syntax or type errors?
□ Did agent report any blockers or issues?
□ Is output ready for next agent or user?
```

### Step Definition Clarification

**What Counts as a "Step"?**

A step is a discrete unit of work that includes:
- Reading 1-3 files to understand context
- Making changes to 1-5 files
- Running tests or validation
- Documenting the changes

**Examples:**
- "Add validation to user form" = ~10 steps
- "Create new API endpoint" = ~15 steps  
- "Implement authentication flow" = ~50 steps
- "Build complete feature module" = ~100-200 steps

**Estimating Steps:**
```
Small task (fix typo, add console.log) = 1-5 steps
Medium task (add function, update component) = 10-30 steps
Large task (implement feature, refactor module) = 50-150 steps
Complex task (multi-file, integration) = 150-300 steps
```

---

## QUICK REFERENCE

```
RECEIVE TASK
    ↓
[1] Run IMMEDIATE SELF-CHECK (top of this file)
    ↓
[2] Count: 1 operation → Single agent | 2+ operations → Multiple subagents
    ↓
[3] Allocate agents by role
    ↓
[4] Dispatch in dependency order
    ↓
[5] Validate outputs before releasing dependents
    ↓
[6] Synthesize final deliverable
```

---

## DON'Ts

- ❌ Single agent doing everything (multi-operation task)
- ❌ Starting code before architecture (greenfield)
- ❌ Building UI before API exists
- ❌ Ignoring existing patterns (brownfield)
- ❌ Making changes without testing
- ❌ Proceeding without self-check

---

## REMINDERS

1. **MULTIPLE OPERATIONS = MULTIPLE SUBAGENTS** (not optional)
2. **Analyze first** (context, dependencies, operations)
3. **Dispatch in dependency order**
4. **Validate before proceeding**
5. **Run self-check before EVERY response**
6. **Z.Ai CONCURRENCY LIMIT**: Maximum 3 agents can run concurrently - always batch accordingly

When in doubt → Dispatch subagents. Better to over-delegate than under-delegate.
