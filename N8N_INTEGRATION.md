# n8n Integration Guide

This guide explains how to connect your **n8n workflows** to the AI Agent Hub.

---

## Architecture

```
┌──────────┐       POST /api/chat        ┌──────────┐       POST webhook        ┌──────────┐
│          │  ──────────────────────────▸ │          │  ──────────────────────▸  │          │
│  Browser │   { agentId, message,       │  Express │   { message, sessionId,  │   n8n    │
│          │     sessionId }             │  Server  │     agentId }            │ Workflow │
│          │  ◂────────────────────────  │          │  ◂────────────────────   │          │
└──────────┘   { response: "..." }       └──────────┘   { response: "..." }    └──────────┘
```

## Step-by-Step Setup

### 1. Create (or open) your n8n workflow

Each of the 4 agents maps to **its own n8n workflow**. You can also use a single workflow with branching logic — it's up to you.

### 2. Add a **Webhook** trigger node

In your n8n workflow, add a **Webhook** node as the trigger:

| Setting        | Value                     |
|----------------|---------------------------|
| HTTP Method    | `POST`                    |
| Path           | e.g. `agent-1`           |
| Response Mode  | `Last Node`    |

This gives you a webhook URL like:
```
https://your-n8n.com/webhook/agent-1
```

### 3. Use the incoming data

The Express server sends this JSON body to the webhook:

```json
{
  "message": "The user's message text",
  "sessionId": "a-unique-session-uuid",
  "agentId": "research-analyst"
}
```

- **`message`** — The user's question or input
- **`sessionId`** — A UUID that stays the same for the entire conversation (useful for context/memory)
- **`agentId`** — Which agent the user is talking to

### 4. Return a response

Your n8n workflow's **last node** must return a JSON object with a `response` field:

```json
{
  "response": "Here is the agent's reply to the user."
}
```

> **Note:** The server also accepts `output` or `text` as fallbacks. But `response` is preferred.

### 5. Copy the webhook URL into `.env`

Open the `.env` file in the project root and paste your webhook URLs:

```env
N8N_WEBHOOK_AGENT_1=https://your-n8n.com/webhook/agent-1
N8N_WEBHOOK_AGENT_2=https://your-n8n.com/webhook/agent-2
N8N_WEBHOOK_AGENT_3=https://your-n8n.com/webhook/agent-3
N8N_WEBHOOK_AGENT_4=https://your-n8n.com/webhook/agent-4
```

### 6. Restart the server

After updating `.env`, restart the Express server:

```bash
npm start
```

The console will show which webhooks are configured:
```
🚀 AI Agent Hub running at http://localhost:3000

Configured webhooks:
  Research Analyst: https://your-n8n.com/webhook/agent-1
  Code Assistant: https://your-n8n.com/webhook/agent-2
  Creative Writer: ⚠️  NOT SET (fallback mode)
  Data Analyst: ⚠️  NOT SET (fallback mode)
```

---

## Agent ↔ Environment Variable Mapping

| Agent            | Env Variable            | Default Agent ID       |
|------------------|-------------------------|------------------------|
| Research Analyst | `N8N_WEBHOOK_AGENT_1`   | `research-analyst`     |
| Code Assistant   | `N8N_WEBHOOK_AGENT_2`   | `code-assistant`       |
| Creative Writer  | `N8N_WEBHOOK_AGENT_3`   | `creative-writer`      |
| Data Analyst     | `N8N_WEBHOOK_AGENT_4`   | `data-analyst`         |

---

## Testing Without n8n

If a webhook URL is **empty or not set**, the server returns a fallback demo response. This lets you develop and test the UI without a running n8n instance.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Agent returns demo text | Check that the webhook URL is set in `.env` and restart the server |
| "Failed to get response" error | Ensure n8n is running and the webhook path is correct |
| CORS errors | The browser and server are on the same origin, so CORS shouldn't apply. If you host n8n elsewhere, add CORS headers to n8n |
| Timeout | Increase the timeout in `server.js` or optimize your n8n workflow |
