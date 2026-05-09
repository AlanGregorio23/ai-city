# ADR 0001: Local AI First

## Status

Accepted

## Context

The project needs AI behavior, but the early version should be cheap, local,
easy to run, and replaceable.

## Decision

Use a provider interface with Ollama as the first implementation.

## Consequences

- The app can run without paid API costs.
- The simulation remains usable when AI is offline.
- Model quality depends on local hardware.
- Future providers can be added without rewriting simulation rules.
