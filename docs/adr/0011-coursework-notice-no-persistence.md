# 0011. Coursework notice without persistence

Status: accepted

## Context
Schools set their own AI rules. Some ban or restrict AI for coursework. The user is responsible for following them. A permanent record of "consent" in a tracked repo could itself become a problem.

## Decision
- Each course note records `ai_policy` and a quote of the rule.
- If the policy is `restricted`, `banned` or `unknown`, warn once per assignment in plain words, ask whether to continue, and proceed if the user says yes.
- Never write that consent anywhere git tracks. If it must be kept, use `state/local/` (gitignored).
- If the policy is `allowed-with-disclosure`, draft a disclosure paragraph.

## Consequences
- The user is informed and stays in control.
- The framework does not claim to make coursework compliant. The user decides.

## Alternatives considered
- **Refuse on restricted courses.** Paternalistic, and policies are often unclear.
- **Say nothing.** Leaves users unaware.
- **Store consent in the vault.** Creates a lasting record in git.
