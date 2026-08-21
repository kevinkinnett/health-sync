## Why

The application cannot currently record recovery activities that Google Health does not model, including infrared hot blanket and massage sessions. Without first-class session records, the user cannot review when these activities occurred, ask AI chat to log them, or study how they relate to sleep and recovery.

## What Changes

- Add an application-owned recovery activity library with Hot blanket and Massage available as initial activity types.
- Add manual session logging, including past sessions, with local start time, duration, optional intensity, activity-specific details, notes, provenance, editing, and deletion.
- Add read access for recovery activities and sessions through the versioned health API and AI health-tool registry.
- Add a safe chat-assisted logging flow that prepares a normalized session and requires user confirmation before persistence.
- Add matched-day recovery-effect analysis for overnight sleep and next-morning recovery outcomes, with evidence thresholds, confounder matching, and non-causal language.
- Present recovery effects in Relationships and collection-state guidance when there is not yet enough evidence.

## Capabilities

### New Capabilities

- `recovery-session-log`: Manage recovery activity types and manually create, review, edit, and delete timestamped recovery sessions.
- `recovery-session-chat-actions`: Query recovery sessions in AI chat and prepare safe, confirmable session-log actions from natural language.
- `recovery-session-effects`: Estimate and present within-person associations between repeated recovery sessions and subsequent sleep or recovery outcomes.

### Modified Capabilities

None.

## Impact

- Adds versioned PostgreSQL tables owned by the dashboard and corresponding shared contracts, repository, service, controller, and routes.
- Adds a Recovery page to the Log navigation and extends the Relationships page.
- Extends the read-only v1 health endpoint registry and adds a separate pending-action path for chat-assisted writes.
- Reuses the existing local-time helpers, intake logging UI patterns, and matched-day workout-effect analysis structure.
- Does not create synthetic Google Health records or convert individual sessions into interventions.
