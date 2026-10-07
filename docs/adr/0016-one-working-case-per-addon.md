# 0016. One working case per add-on, plus blueprints

Status: accepted

## Context
A full set of features would take too long and would be hard to test. Pilots need something real, soon. Users differ, so depth should be personal.

## Decision
- The core structure is complete and plug-and-play.
- Each add-on (assignments, email replies, Netherlands jobs, study) ships exactly one working case and a blueprint that describes how the user's agent can extend it.
- Everything beyond that grows through self-build (propose, approve, build).
- `/menu` lists blueprints as "available to build".

## Consequences
- Fast, testable MVP.
- Some wished-for features are not there on day one.
- Blueprints must be clear enough for an agent to follow.

## Alternatives considered
- **Many half-working features.** Hard to trust.
- **Core only, no add-ons.** Nothing for the pilot to try.
