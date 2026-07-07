# Productized Agent Optimizations Design

## Goal

Upgrade the current IP commerce Agent from "can generate" to "can work like a productized assistant." The system should expose how it used the knowledge base, preserve useful project facts, repair weak generations once, and give admins enough operational visibility to run it for multiple users.

## Optimizations

1. Agent execution chain becomes quality gated.
   - Each generated step carries a quality score.
   - If score is below 70, the backend asks the model to repair the result once.
   - If a step remains below 70, the Agent run stops with `needs_review` instead of blindly continuing.

2. Knowledge retrieval becomes visible.
   - Generation results include `knowledgeCitations`.
   - The frontend shows selected source, heading, score, and matched terms.

3. Project profile becomes easier to maintain.
   - Generation results include `profileSuggestions`.
   - Users can apply suggested stable facts into the current project profile.

4. Quality evaluation becomes actionable.
   - Quality cards show score, level, missing checks, and repair status.
   - Automatic repair metadata is saved in generation history.

5. Admin operations improve.
   - `/api/health` includes system status: version, node env, API status, knowledge health, modules, and feature flags.
   - Admin modal displays a compact system status block.

6. VPS/production confidence improves.
   - Tests cover automatic repair, citations, profile suggestions, Agent quality gates, and system health.

## Non-goals

This phase does not add background queues, streaming, vector databases, billing, or file ingestion. It keeps deployment simple for the current VPS workflow.
