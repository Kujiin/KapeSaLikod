# Portrait kiosk and order-reference update

Prepared on `feat/kiosk-contained-ordering` from the latest merged main.
Nothing in this change has been deployed or applied to the live database.

## Interface

- The customer welcome screen, order-type selection, product grid, branding,
  imagery, transitions and original CSS remain preserved.
- Size selection, cart and confirmation use an overlay inside `.kiosk`. The
  backdrop is confined to that frame; there is no viewport-level modal.
- A shared dialog controller handles focus placement/return, Tab/Shift+Tab,
  Escape dismissal, and inert background content. Confirmation requires the
  explicit new-order action. Native dialog-form close buttons are retained.
- `/swaggar/` uses the same portrait dimensions, browser backdrop and mobile
  full-screen behavior as the kiosk. Navigation runs across the top, content
  scrolls inside the frame, and edit dialogs stay inside it. Wide data tables
  scroll inside their panels rather than expanding the frame.
- Role/status labels are capitalized for display (Owner, Manager, Staff); API
  role values and permissions stay unchanged.
- Marketing copy, the decorative login headline, footer tagline and redundant
  statistic subtitles were removed. Useful payment, security and upload guidance
  remains.

## Order references: migration 004

New orders receive `KapeSaLikod-0000001`, `KapeSaLikod-0000002`, etc. Zero padding
is seven digits; the counter is global and never resets daily. The PostgreSQL
sequence is durable and concurrency-safe. Failed transactions may leave gaps;
references are not promised to be gap-free. The sequence does not cycle and stops
at 9,999,999 rather than truncating or reusing references. Runtime has USAGE only,
so it cannot reset the sequence. Existing valid references in the same format are
accounted for when initializing the counter.

Existing KSL references are deliberately retained for old receipts/searches and
idempotent retries. An old pending submission can still return its old reference;
a genuinely new order uses the new format. No historical orders are renumbered.
Migrations 001–003 and the menu seed remain unchanged.

The migration runner accepts `--through 004` and now defaults to 004. The old
initial activation helper is pinned to 003 so its exact three-migration bootstrap
check still means what it originally meant; do not use it to upgrade an already
running installation. The original production-preflight query is likewise a
three-migration initial-activation check, not the post-004 deployment check.

## Validation

The isolated integration suite applies 001–003, runs the original activation
preflight, inserts an unpaid historical-order fixture, then applies 004 twice.
It checks history preservation, first sequential number, concurrent unique
numbers, rollback gaps, idempotency, runtime sequence-reset denial, API readiness,
all existing API scenarios, and backup/restore with four migrations.

DOM tests cover contained dialog markup, inert backgrounds, focus wrap, Escape,
non-dismissable confirmation, the renamed Owner label, and existing cart/admin
flows. Build/check and artifact security tests verify 25 approved public files.
Real Chromium layout assertions are prepared for kiosk size/cart/confirmation
and the admin editor; execution remains blocked by missing browser system
libraries and has not been claimed as a visual pass.

## Later rollout — separate approval

1. Review the local diff and portrait layout in a real browser. Complete contained
   dialog bounds tests at desktop, portrait and phone viewport sizes.
2. Take a private database backup. Stage a reviewed copy of `database.py` with
   all four migration files outside the home checkout, readable by postgres.
3. After live migration approval, run the guarded runner as local postgres with
   `migrate --through 004 --socket-dir /var/run/postgresql --approve-write`.
   Do not rerun provisioning or seed, and do not reset the sequence manually.
4. Verify migration 004's SHA-256 in the ledger and that original references are
   intact using read-only queries. Expected ledger count is now four; menu counts
   remain 3 categories / 2 sizes / 21 products / 37 variants unless edited by staff.
5. Stage a new API release: its readiness endpoint now verifies migration 004.
   After restart approval, switch/restart only the dedicated API service. An older
   API remains compatible with migration 004 while this rollout is prepared.
6. Publish the reviewed frontend only after backend readiness passes. Never push,
   merge or deploy automatically from this preparation step.

Application rollback can retain migration 004; references remain readable by the
older frontend/API. Do not drop the sequence or renumber orders to roll back UI.
