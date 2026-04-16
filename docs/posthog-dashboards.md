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
| `seller_signup_completed` | `vendor_id`, `vendor_category` |
| `seller_profile_completed` | `vendor_id`, `vendor_category` |
| `seller_product_created` | `product_id`, `product_name`, `price`, `status` |
| `seller_product_published` | `product_id`, `product_name`, `price`, `status` |
| `seller_order_received` | `fulfillment_id`, `order_id`, `order_value` |

Person properties (set by PostHogProvider): `email`, `role`.

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

## Dashboard 4 — Revenue

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
