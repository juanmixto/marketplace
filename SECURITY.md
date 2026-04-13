# Security Policy

## Supported Versions

This project follows a trunk-based development model: there are no released
versions, and the only branch that receives updates is `main`. Security
fixes are applied to `main` and deployed forward — there is no backporting.

| Branch | Supported          |
| ------ | ------------------ |
| `main` | :white_check_mark: |
| Any other branch (forks, feature branches, prior commits) | :x: |

## Reporting a Vulnerability

**Please do not open public GitHub issues for security reports.** Use one of
the private channels below so the issue can be triaged before disclosure.

1. **Preferred:** [Open a private security advisory](https://github.com/juanmixto/marketplace/security/advisories/new)
   via GitHub. This creates a private discussion visible only to maintainers
   and the reporter.
2. If GitHub is not an option, contact the repository owner directly through
   their GitHub profile and request a private channel.

When reporting, please include as much of the following as you can:

- A description of the issue and its potential impact.
- Step-by-step instructions to reproduce, or a minimal proof of concept.
- The commit SHA or branch you tested against.
- Any logs, screenshots, or affected URLs (please redact personal data).

### What to expect

| Stage | Target |
| ----- | ------ |
| Acknowledgement that the report was received | within **72 hours** |
| Initial triage and severity assessment       | within **7 days**   |
| Fix or mitigation plan communicated          | within **30 days** for high/critical issues |
| Coordinated public disclosure                | after a fix is deployed, or by mutual agreement |

If a report turns out to be out of scope or a duplicate, you will receive a
short explanation rather than silence.

## Scope

**In scope** — the code in this repository and the running application it
produces, including:

- Authentication, authorization, and session handling.
- Payment, checkout, and webhook flows.
- Server actions, API routes, and database access.
- Stored data (orders, users, vendor information).

**Out of scope:**

- Findings that require physical access, social engineering, or compromised
  user devices.
- Denial-of-service through volumetric traffic or resource exhaustion.
- Reports generated solely by automated scanners without a working proof of
  concept.
- Issues in third-party dependencies that already have a public CVE — please
  report those upstream. Dependabot security updates are enabled on this
  repository.
- Vulnerabilities in `localhost` development tooling that cannot be reached
  from a production deployment.

## Safe harbor

Good-faith security research conducted in accordance with this policy will
not be pursued or reported. Please do not access, modify, or destroy data
that does not belong to you, and stop testing as soon as you have enough
information to write a report.

Thank you for helping keep this project and its users safe.
