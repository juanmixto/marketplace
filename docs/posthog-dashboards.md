# PostHog dashboards

Use this as a setup checklist when you wire the app to PostHog. Dashboards live in the PostHog UI, not in this repo.

## Prerequisite

- Events should already appear in PostHog Live events.

## Core events to map

| Event | Typical properties |
|---|---|
| `view_item` | `currency`, `value`, `items` |
| `search` | `search_term`, `results_count` |
| `filter_used` | `filter_type`, `filter_value`, `action` |
| `add_to_cart` | `currency`, `value`, `items` |
| `begin_checkout` | `currency`, `value`, `items` |
| `purchase` | `transaction_id`, `currency`, `value`, `items` |
| `sign_up` | `method`, `user_role` |

If you add more events, keep the naming consistent with the analytics layer documented in [`docs/wiki/Analytics and KPIs.md`](./wiki/Analytics%20and%20KPIs.md).

## Suggested dashboards

### Active users

- Trend chart for `$pageview`
- Breakdown by `person.properties.role`

### Buyer funnel

- Funnel: `view_item` → `add_to_cart` → `begin_checkout` → `purchase`
- Optional breakdown: `person.properties.role`, `$device_type`

### Revenue

- Big number for total `purchase` value
- Average order value
- Purchase count over time

## Common person properties

- `email`
- `role`

## Checklist

- [ ] Events are visible in Live events
- [ ] `purchase` includes a non-zero `value`
- [ ] Roles appear on person profiles
- [ ] Buyer funnel conversion is non-zero for a known purchase
