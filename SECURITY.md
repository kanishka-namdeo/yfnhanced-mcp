# Security Policy

## Supported versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

Only the current `1.0.x` line receives security fixes. Upgrade to the latest
`1.0.x` release before reporting.

## Reporting a vulnerability

**Please do NOT report security vulnerabilities through public GitHub issues.**

Use this repository's **private vulnerability reporting** instead:

1. Go to the **Security** tab of
   [`kanishka-namdeo/yfnhanced-mcp`](https://github.com/kanishka-namdeo/yfnhanced-mcp).
2. Choose **Report a vulnerability** (this is GitHub's private vulnerability
   reporting flow: *Settings → Security → Private vulnerability reporting*).
3. Include the affected version, a description of the issue, and reproducible steps
   or a proof of concept.

The maintainer has **no public email address**. Do not look for or send to a
guessed contact address — private vulnerability reporting on the repository is the
only supported channel.

### Response expectations

- **Acknowledgement:** within about **3 business days** of your report.
- **Initial triage / status update:** within about **7 business days**.
- **Fix & disclosure:** targeted as quickly as the issue warrants; you will be kept
  informed and may be credited (with your consent) if you report responsibly.

These are best-effort targets from a solo maintainer, not a contractual SLA.

## Scope

The security-sensitive surfaces of this project are:

- **Outbound calls to Yahoo Finance.** The server makes live network requests to
  Yahoo Finance on behalf of MCP clients. It is a client of a third-party API and is
  subject to that API's availability and rate limiting (HTTP 429).
- **Input validation and output sanitization middleware.** Request inputs are
  validated and responses sanitized by the security layer in
  [`src/middleware/security.ts`](./src/middleware/security.ts) (stateful enforcement:
  blocked IPs, request counting, suspicious-pattern detection, auto-block) and
  [`src/utils/security.ts`](./src/utils/security.ts) (stateless rules: symbol
  grammar, dangerous/SQL-injection pattern matching, string sanitization). Symbol
  inputs are constrained to `/^[A-Z0-9.\-\^]+$/`, capped at 20 characters and 50
  symbols per request. Weaknesses in these rules are in scope.
- **Config file loading.** The server accepts configuration files (JSON, and YAML by
  documented extension). Config is validated at startup and a validation failure is
  fatal. Reports about how config values are parsed, merged, or trusted are in
  scope.

Out of scope: the security of Yahoo Finance itself, MCP client implementations, and
general best-practice suggestions without a demonstrable impact.
