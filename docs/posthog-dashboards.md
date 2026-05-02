# PostHog dashboards — setup playbook

Apply this playbook once per PostHog environment (dev / prod project).
Dashboards live inside PostHog UI — they cannot be checked into this repo.

> Prerequisite: events flowing in PostHog Live events view.

## Event reference

| Event | Key properties |
|---|---|
| `view_item` | `currency`, `value`, `items` |
| `search` | `search_term`, `results_count` |
| `filter_used` | `filter_type`, `filter_value`, `action` |
| `add_to_cart` | `currency`, `value`, `items` |
| `begin_checkout` | `currency`, `value`, `items` |
| `purchase` | `transaction_id`, `currency`, `value`, `items` |
| `sign_up` | `method`, `user_role` |
| `add_to_favorites` | `result`, `items` |
| `remove_from_favorites` | `result`, `items` |
| `address_changed` | `result`, `action` (`created` / `updated` / `deleted` / `set_default`) |
| `buyer_profile_updated` | `result`, `fields_changed` (array of `firstName` / `lastName` / `email`) |
| `incident_resolved` | `result`, `resolution_type` (`REFUND_FULL` / `REFUND_PARTIAL` / `REPLACEMENT` / `STORE_CREDIT` / `REJECTED`) |
| `seller_signup_completed` | `vendor_id`, `vendor_category` |
| `seller_profile_completed` | `vendor_id`, `vendor_category` |
| `seller_product_created` | `product_id`, `product_name`, `price`, `status` |
| `seller_product_published` | `product_id`, `product_name`, `price`, `status` |
| `seller_order_received` | `fulfillment_id`, `order_id`, `order_value` |

Person properties (set by PostHogProvider): `email`, `role`.

### `result` property contract

Buyer-mutation events (`add_to_favorites`, `remove_from_favorites`, `address_changed`, `buyer_profile_updated`, `incident_resolved`) MUST carry `result: 'success' | 'failure'`. This is how the Buyer Mutations Health dashboard (below) computes failure rate per surface and alerts when it spikes — silent client→server failures (the #1091 favorites class of bug) become visible without waiting for a user to complain.

Enforced by `test/contracts/analytics-event-taxonomy.test.ts`. The set lives in `src/lib/analytics.ts` as `BUYER_MUTATION_EVENTS`.

## Dashboard 1 — Active users

**DAU / WAU / MAU (Trends)**
- Event: `$pageview` (auto-captured)
- 3 series: unique users at Day / Week / Month intervals
- Date range: last 30 days
- Optional breakdown: `person.properties.role`

**New users (Trends)**
- Events: `sign_up` + `seller_signup_completed`
- Interval: Day, date range: last 90 days

## Dashboard 2 — Buyer funnel

- Type: Funnel
- Steps: `view_item` > `add_to_cart` > `begin_checkout` > `purchase`
- Conversion window: 1 day
- Date range: last 30 days
- Breakdowns: `person.properties.role`, `$device_type`

## Dashboard 3 — Producer funnel

- Type: Funnel
- Steps: `sign_up` > `seller_profile_completed` > `seller_product_created` > `seller_product_published` > `seller_order_received`
- Conversion window: 30 days
- Date range: last 90 days

## Dashboard 4 — Buyer Mutations Health

**Why this exists.** The 2026-05-02 favorites bug (#1091) was invisible to the team for an unknown amount of time: the client said "added", the API said "200 OK", but the favorite did not appear on `/cuenta/favoritos` until the user hard-reloaded. The fix landed only because a user reported it in chat. This dashboard exists so the next bug of this class is caught from PostHog instead of from a complaint.

**Failure rate (Trends, big number)**
- One insight per event in `BUYER_MUTATION_EVENTS`:
  - `add_to_favorites`, `remove_from_favorites`, `address_changed`, `buyer_profile_updated`, `incident_resolved`.
- Math: `count(result = "failure") / count(*)`.
- Date range: last 7 days.
- Threshold: investigate if any line goes above 2 % sustained over an hour. Real failures (network, DB, transient) settle below that in normal operation.

**Volume sanity (Trends, line chart)**
- Total count of each event, day interval, last 30 days.
- Purpose: a hard-zero day on a previously-active surface means we shipped a regression that broke the wiring (e.g. removed a `trackAnalyticsEvent` call by accident). The volume series catches that even if the failure-rate series stays clean (zero of zero is "0 %").

**Breakdown: result × surface**
- Stacked bar, `event_name` × `properties.result`, last 30 days.
- Lets ops eyeball which surface is wobbliest at a glance.

**Alert (PostHog Alerts)**
- Trigger: `add_to_favorites` failure rate > 5 % over a 1-hour window with at least 20 events.
- Channel: Telegram (same channel that gets payment incidents — see `docs/runbooks/payment-incidents.md`).
- Why this event specifically: it has the highest baseline volume of the buyer mutations, so the false-positive rate is lowest. Add the same alert for `address_changed` once we have ≥ 30 days of baseline data.

## Dashboard 5 — Revenue

**Total sales** — `purchase`, sum of `value`, big number, 30 days
**Ticket medio** — `purchase`, average of `value`, big number, 30 days
**Compras por dia** — `purchase`, count, line chart, day interval, 30 days

## Global filters (apply per dashboard)

- `person.properties.role` (CUSTOMER, VENDOR, ADMIN_*)
- `properties.category` (where present)
- `$device_type` (mobile / desktop / tablet)

## Programmatic creation

With a personal API key (`dashboard:write` scope):

```
POST /api/projects/<PROJECT_ID>/dashboards/
POST /api/projects/<PROJECT_ID>/insights/
```

Then attach each insight (funnel/trend config) to the dashboard.

## Verification checklist

- [ ] `purchase` has non-zero `value` in Live events
- [ ] `seller_*` events show `vendor_id`
- [ ] Person profile shows `email` + `role`
- [ ] Buyer funnel conversion is non-zero for a known purchase
- [ ] Role filter does not drop counts
- [ ] Each `BUYER_MUTATION_EVENTS` event shows both `success` and `failure` rows in Breakdown view (toggle a favorite while offline to confirm `failure` fires)
- [ ] Buyer Mutations Health alert is wired to Telegram (test with the PostHog "Send test alert" button)
