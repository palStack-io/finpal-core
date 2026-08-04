# Fixtures

`accounts.json` and `transactions.json` are real responses from a finPal
instance, captured with a read-scoped token and then anonymised by hand: real
addresses replaced with `@example.com`, real institution names kept (they are not
secret), digit runs left INTACT so the scrubber has something to remove.

The owner's own address was mapped to `owner@example.com`, which is the
`ScrubContext.ownerId` the tests use, so the fixtures exercise the `"you"` path
as well as the pseudonym path.

Recapture with:

    curl -s -H "X-API-Key: $FINPAL_TOKEN" "$FINPAL_URL/api/v1/accounts" | python3 -m json.tool
    curl -s -H "X-API-Key: $FINPAL_TOKEN" "$FINPAL_URL/api/v1/transactions/?per_page=5" | python3 -m json.tool

Then anonymise addresses and revoke the capture token
(`DELETE /api/v1/access-tokens/<id>` with a JWT, or Settings → Integrations).

The tests assert on string leaves rather than on the serialised JSON text.
Numbers are deliberately not scrubbed, so `"balance": 1284.55` puts a four-digit
run in the serialised form of any realistic response; asserting
`JSON.stringify(...)` contains no digit run would only pass on an instance whose
balances all happen to be under 1000.
