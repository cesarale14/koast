# Claude Managed Agents — Research

**Date:** 2026-04-09

## What Are Managed Agents?

Claude Managed Agents (Beta, GA April 2026) is Anthropic's hosted agent runtime. Unlike the standard Messages API where you build your own agent loop, Managed Agents provides:

- **Pre-configured cloud containers** that run your agent autonomously
- **Built-in tool execution** (bash, file ops, web fetch, code execution)
- **Session management** — each task gets its own isolated session
- **Event streaming** — real-time updates as the agent works

You define the agent once (model, system prompt, tools), then create sessions for each task. Anthropic handles the agent loop infrastructure.

## Core Concepts

| Concept | Description |
|---------|-------------|
| **Agent** | Configuration: model + system prompt + tools + MCP connections. Created once, reused. |
| **Environment** | Container template with packages, networking, file systems. |
| **Session** | Running instance of an agent for one task. Isolated, stateful within the session. |
| **Events** | Messages between your app and the agent (user turns, tool results, status updates). |

## API Surface

```python
from anthropic import Anthropic
client = Anthropic()

# Create agent (once)
agent = client.beta.agents.create(
    name="Guest Assistant",
    model="claude-sonnet-4-6",
    system="You are a helpful property assistant...",
    tools=[{"type": "agent_toolset_20260401"}]
)

# Create environment (once)
env = client.beta.environments.create(
    name="pms-env",
    config={"type": "cloud", "networking": {"type": "unrestricted"}}
)

# Per task: create session + send events
session = client.beta.sessions.create(agent=agent.id, environment_id=env.id)

with client.beta.sessions.events.stream(session.id) as stream:
    client.beta.sessions.events.send(session.id, events=[
        {"type": "user.message", "content": [{"type": "text", "text": "..."}]}
    ])
    for event in stream:
        if event.type == "agent.message":
            # Agent's response
            pass
        elif event.type == "session.status_idle":
            break
```

## Tool Types

| Type | Execution | Examples |
|------|-----------|---------|
| **Anthropic-schema** | Client-executed in container | bash, text_editor, file_operations, memory |
| **Server tools** | Anthropic infrastructure | web_search, web_fetch, code_execution |
| **Custom tools** | Your scripts in the environment | Supabase queries, Airbnb API calls |

## Pricing

- **Managed Agents**: Usage-based (per session/compute time + token costs)
- **Messages API with tool use**: Standard token pricing + ~346 system prompt tokens overhead
- **Server tools**: Additional per-use charges (e.g., per web search)
- **Recommended model**: claude-sonnet-4-6 for guest messaging (fast, cost-effective)

## SDK Availability

- **Python**: `anthropic` package, beta namespace (`client.beta.agents.*`)
- **TypeScript**: `@anthropic-ai/sdk` package, same beta namespace
- **Beta header**: `anthropic-beta: managed-agents-2026-04-01`

## Key Differences: Managed Agents vs Custom Agent Loop

| Aspect | Managed Agents | Custom (Messages API) |
|--------|---------------|----------------------|
| Agent loop | Anthropic runs it | You build it |
| Infrastructure | Hosted containers | Your servers |
| Scheduling | You trigger sessions | You trigger + loop |
| Tool execution | In container | In your code |
| State | Per-session, isolated | You manage |
| Best for | Autonomous tasks | Fine-grained control |

## Limitations

- No built-in cron/scheduling — you trigger sessions from your backend
- Container environment is ephemeral per session
- Custom tools require scripts in the container (or MCP connections)
- Beta API — may change before GA
