# End-to-end verification

Not automated: it needs a running finPal and a real token. Recorded because every
layer of this work has, at least once, been verified green while being inert in
production — a passing unit test is not evidence the assembled server answers a
question.

## Procedure

1. `npm run build`.
2. Mint a read-scoped token on the instance (Settings → Integrations → Agent
   Access, or `POST /api/v1/access-tokens` with a session JWT).
3. Feed JSON-RPC over stdin. Note the server does not exit on EOF, so background
   it and kill after a few seconds rather than waiting:

   ```bash
   FINPAL_URL=http://<host>:8094 FINPAL_TOKEN=fp_live_... \
     node dist/index.js < probe.jsonl > out.jsonl 2>err.txt &
   PID=$!; sleep 12; kill $PID
   ```

   `probe.jsonl`:

   ```
   {"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"probe","version":"0"}}}
   {"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
   {"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_accounts","arguments":{}}}
   {"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"get_spending_summary","arguments":{"start_date":"2026-01-01","end_date":"2026-12-31","group_by":"category"}}}
   ```

4. Check the scrubber on the **string leaves** of the result, not the serialised
   JSON — numeric fields like `balance: 1284.55` legitimately contain a 4-digit
   run and are never scrubbed, so a regex over the whole document always
   "fails". Exempt ISO dates.
5. Confirm the token cannot write, then revoke it and confirm the server says so.

## Run: 2026-08-04, against a self-hosted instance on port 8094

Observed, not expected:

- **initialize** → `{"name": "finpal", "version": "0.1.0"}`
- **tools/list** → 7 tools: `get_budget_status`, `get_net_worth_trend`,
  `get_recurring_transactions`, `get_spending_summary`, `list_accounts`,
  `list_categories`, `search_transactions`
- **list_accounts** → `"name": "Chase Checking ...••••"` and
  `"Amex Platinum ...••••"`. The digits are gone and the label survives, which is
  the whole design intent — stripping the field would have left the model unable
  to say which account it meant. `"user_id": "you"`, which works only because
  `/api/v1/auth/whoami` exists; without it the caller reads as `member-N`.
- **Scrub check** → zero digit runs and zero email addresses in any string leaf.
- **get_spending_summary** → `{"groups": [{"label": "Uncategorised", "total":
  128.4, "count": 2}], "total": 128.4, ...}`. Aggregated server-side; the model
  never saw a transaction row.
- **Write attempt** with the read token → **401**. Scope holds end to end.
- **Revoked token** → exit 1 and
  `finpal-mcp: could not verify the token — This finPal token was revoked. Mint a
  new one under Settings → Integrations → Agent Access.` A sentence, not a stack
  trace, which matters because an MCP client shows the user stderr and nothing
  else.
- **stderr on the successful run** was empty.

Both tokens used (ids 2 and 4) were revoked afterwards.

## Known gap

Not driven by a real MCP client (Claude Desktop) yet, because `finpal-mcp` is not
published to npm — the config block the Agent Access screen emits uses
`npx -y finpal-mcp`, which will resolve only after the first publish. The
JSON-RPC exchange above is the same protocol a client speaks, so the risk is
packaging rather than protocol.
