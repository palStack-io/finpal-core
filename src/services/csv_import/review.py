"""Whether an import batch wants a human's eyes — the one definition.

**Why this is a module and not an inline condition.** This rule already existed, in
TypeScript, inside `web-ui/src/components/dashboard/ImportReviewBanner.tsx`. Adding
an email that fires on the same condition would have created a SECOND copy in a
second language, and this project has been bitten by exactly that shape more times
than any other: D-57 (two query builders), D-52 (`type` vs `transaction_type`),
D-64 (two callback parsers), and the two Categories implementations. A duplicated
predicate does not stay duplicated — it drifts, and the drift is invisible because
both copies compile and both have tests.

So the server owns it, `_serialize_batch` publishes it as `needs_review`, and the
banner reads that field instead of recomputing. One definition, two consumers.

**What counts, and why each clause is here:**

* `error_count` — rows that failed to import. The user has a partial file and no
  way to know without looking.
* `profile.origin == 'heuristic'` — the columns were GUESSED. `confidence` cannot
  carry this on its own: the heuristics legitimately return 1.0 for an unambiguous
  header, so a guessed mapping looks identical to a learned one.
* `confidence < 1` — a shaky parse whatever its origin, which catches a saved
  profile that was itself created from a poor guess.

**What is deliberately NOT here:** the banner's `status == 'reverted'` check and its
14-day window. Both are presentation concerns for a list of *past* batches. This
predicate is evaluated the moment a batch is created, when it cannot yet have been
reverted and is by definition new — folding them in would add two clauses that can
never be false and read as though they could.
"""


def batch_needs_review(batch) -> bool:
    """True when a batch should be surfaced to the user rather than absorbed silently."""
    if batch.error_count:
        return True

    profile = getattr(batch, 'profile', None)
    if profile is not None and profile.origin == 'heuristic':
        return True

    # `is not None` matters: confidence 0.0 is a very shaky parse, not "unset".
    if batch.confidence is not None and batch.confidence < 1:
        return True

    return False
