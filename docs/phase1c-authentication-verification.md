# Phase 1c notification voice

Draft English copy, pending owner read-aloud review.

Transactional verification/reset, welcome, group/household invitation and import-review emails now give a concrete next step without decorative emojis. Weekly/monthly reports offer one category to review before the figures. pointsPal cap/warning messages give a next step while preserving card/category names and percentages.

Delivery behavior, URLs, expiry values, preferences, report calculations, alert thresholds, dismissal state and payload keys stay unchanged. Import-review HTML and plain text both describe guessed columns, failed rows and undo scope. No mail was delivered during verification.

Checks performed:

- Capture real email templates with send_email stubbed; existing brand/contrast checks pass.
- Captured all8 core email/report templates in Chromium at390/1440:16 rendered-content checks pass. This does not verify Gmail/Outlook or deliverability.
- pointsPal API/optimizer17 tests pass in this repo, including real capped/95%/80% alerts. New3 next-step assertions fail on unchanged core main.
- Core live-demo alert baseline detects old copy in4 width/theme combinations, using additive synthetic data. This is red-before proof, not branch UI acceptance.

Python3.11 full gate:2631 passed,26 skipped,575.03s. Python3.12 full gate:2631 passed,26 skipped,822.76s; immutable one-shot log and exit0 match.

Manual web gates: typecheck passes; Vitest130 files passed,1296 tests passed and1 skipped. Staged tracked-file safety checks5 pass. Before acceptance: build this branch on the demo and rerun the alert UI check, then owner read-aloud. Spanish remains draft. No production deployment, merge or store submission is part of this change. Detailed operational evidence stays in the workspace checkpoint, not this public-facing repo note.
