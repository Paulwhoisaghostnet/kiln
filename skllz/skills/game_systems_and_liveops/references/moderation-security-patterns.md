# Moderation + Security Patterns

## Core Patterns
- Use permission-overwrite/channel gating for game contexts requiring containment.
- Treat role assignments and hidden faction state as database records, not chat-platform roles.
- Log all moderator actions with actor, target, timestamp, and reason.
- Use generic public failures (for example, "Action rejected") when detailed errors would leak state.

## LiveOps Integrity
- Keep a transaction table for all XP/points changes.
- Enforce cooldowns and per-phase caps for repetitive reward actions.
- Separate host commands from player commands at command-router level.

## Minimum Test Pack
- Unauthorized user cannot run host-only commands.
- Moderator actions appear in logs and can be exported.
- Hidden-role operations do not leak in public channels.
- Abuse loop attempts do not exceed configured reward caps.
