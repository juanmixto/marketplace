# Security Policy

## Supported versions

This project uses trunk-based development. There are no released versions and `main` is the only supported branch. Security fixes land on `main` and move forward from there.

| Branch | Supported |
|---|---|
| `main` | Yes |
| Feature branches, forks, older commits | No |

## Reporting a vulnerability

Do not open a public GitHub issue for a security report. Please use a private channel instead:

1. Preferred: open a private security advisory at [github.com/juanmixto/marketplace/security/advisories/new](https://github.com/juanmixto/marketplace/security/advisories/new).
2. If GitHub is not available, contact the repository owner directly and ask for a private reporting channel.

Include as much of the following as possible:

- Description of the issue and expected impact
- Reproduction steps or a minimal proof of concept
- Commit SHA or branch tested
- Logs, screenshots, or affected URLs, with personal data removed

### Response targets

| Stage | Target |
|---|---|
| Acknowledgement | within 72 hours |
| Initial triage | within 7 days |
| Fix or mitigation plan for high or critical issues | within 30 days |
| Public disclosure | after a fix is deployed, or by mutual agreement |

If the report is out of scope or a duplicate, you will get a short explanation rather than silence.

## Scope

In scope:

- Authentication, authorization, and session handling
- Payment, checkout, and webhook flows
- Server actions, API routes, and database access
- Stored data such as orders, users, vendors, and related records

Out of scope:

- Issues that require physical access, social engineering, or a compromised device
- Denial of service through volume or resource exhaustion
- Scanner-only findings without a working proof of concept
- Third-party dependency issues that already have a public CVE
- Vulnerabilities limited to localhost development tooling that cannot be reached from a production deployment

## Safe harbor

Good-faith security research carried out under this policy will not be pursued. Please do not access, modify, or destroy data that does not belong to you, and stop testing as soon as you have enough information to file a report.
