# API access for scripts and LLMs

Personal access tokens let a script, a cron job or a local LLM talk to your finPal instance.
Moved out of the README so the front page stays short; nothing here has changed.

## API Access for Scripts and LLMs

Personal access tokens let a script — or an LLM via an MCP client — read your
finPal data and propose corrections, without handing over your password or a
short-lived session token.

### Minting a token

**Settings → Integrations → Agent Access.** Give it a name, pick a scope, set an
expiry. The token is shown **once**, at creation; finPal stores only a SHA-256
hash of it, so it cannot be recovered later. Lost it? Revoke and mint another.

Use it as either header:

```bash
curl -H "X-API-Key: fp_live_..." http://your-finpal/api/v1/transactions/
curl -H "Authorization: Bearer fp_live_..." http://your-finpal/api/v1/accounts
```

### Scopes

| Scope | Can do |
|-------|--------|
| `read` | Read your data. Any write is refused with 403. **The recommended default.** |
| `read_write` | Read, plus the writes in the table below. |

### Every token expires

Expiry is mandatory — 90 days by default, 365 maximum. A forgotten token with
unlimited life is the most common way a credential like this becomes a permanent
hole. Settings flags any token expiring within 14 days, and an expired token
fails with a distinct `token_expired` error so a client can say what is wrong
rather than just "unauthorized".

### What a `read_write` token may actually change

This is the point of the design: an agent gets useful write access without being
able to invent or destroy financial data.

| Action | What happens |
|--------|--------------|
| Recategorise a transaction | **Applied immediately**, audited, one-click undo |
| Bulk recategorise (max 200 rows) | **Applied immediately**, audited, one-click undo |
| Create a category | **Applied immediately**, audited |
| Create a transaction | **Waits for your approval** |
| Create or change a budget | **Waits for your approval** |
| Rename a category | **Waits for your approval** |
| Delete anything | **Refused.** Not available to tokens at all |

The rule is reversibility, not importance. Adding and reclassifying can be undone,
so they apply. Creating money-shaped data or changing a limit cannot be undone by
inspection, so a human approves it. Deletion is refused outright — deleting a
category silently clears the category on every transaction that used it, across
all history, which is not a decision to delegate.

Anything not in that table is refused by default, so a new endpoint cannot become
agent-writable by omission.

### Approving proposals

A proposal appears in **Settings → Integrations → Agent Access** with what the
agent wants to do, in words. Approve it and it applies; reject it and nothing
happens. Proposals expire after 24 hours so a stale one cannot be approved into
effect days later, and revoking a token rejects everything it proposed.

**Approval is browser-only.** A token cannot approve, reject or undo — including
its own proposals. If it could, the whole arrangement would be decorative.

### Connecting an LLM

The Agent Access screen shows a ready-to-paste MCP client config after you mint a
token, with the URL and token filled in.

The server itself lives in [`finpal-mcp/`](../finpal-mcp/README.md) — read that for
setup, the tool list, and what it hides from the model.

> **Not published to npm yet**, so `npx -y finpal-mcp` will not resolve until the
> first release. Until then, build it from this repo:
> `cd finpal-mcp && npm install && npm run build`, and point the config's
> `command` at `node` with `args: ["<abs path>/finpal-mcp/dist/index.js"]`.

**Where your data goes.** Pointing an MCP client at a hosted model — Claude,
ChatGPT — sends the transactions it reads to that company. A local model via
Ollama or LM Studio keeps everything on your own hardware. Neither is wrong, but
only one of them is private, and if privacy is why you self-host finPal then it
is worth choosing deliberately.

### Rate limits

Agent traffic is bucketed per token rather than per IP address, since every
request from one MCP client shares an address. Note the limit is enforced
per-worker unless `RATELIMIT_STORAGE_URI` points at a shared store — see the
configuration table above.

---

