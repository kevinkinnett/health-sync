## Purpose

Let AI chat read recovery history and help prepare session entries without allowing an unconfirmed model action to change health records.

## ADDED Requirements

### Requirement: Recovery history is available to chat
The system SHALL expose recovery activity definitions and date-filtered recovery sessions through the read-only health-tool registry used by AI chat.

#### Scenario: Ask about recent sessions
- **WHEN** the user asks AI chat when they last used the hot blanket or received a massage
- **THEN** chat can query the recovery session log and answer from stored records

### Requirement: Chat prepares rather than directly executes writes
The system SHALL let AI chat prepare a pending recovery-session action, but SHALL NOT persist the session until the user confirms the normalized action in the interface.

#### Scenario: Prepare a complete request
- **WHEN** the user asks chat to log a recovery session and supplies an activity, resolvable time, and duration or configured default
- **THEN** chat returns a pending action that displays the normalized activity, local start time, duration, optional details, and notes
- **THEN** no recovery session exists before confirmation

#### Scenario: Ask for missing material details
- **WHEN** a chat logging request lacks a duration and the selected activity has no default duration, or its date or activity is ambiguous
- **THEN** chat asks a follow-up question instead of preparing or saving a guessed record

### Requirement: Pending-action review
The pending action SHALL allow the user to confirm, edit, or cancel it. Relative dates and times SHALL be resolved in the configured user timezone and shown as an explicit local timestamp before confirmation.

#### Scenario: Confirm a prepared action
- **WHEN** the user reviews and confirms a pending recovery-session action
- **THEN** the system creates exactly one session with source `ai_chat` and returns its identifier

#### Scenario: Edit before confirmation
- **WHEN** the user edits the proposed time, duration, or details before confirming
- **THEN** the system validates and saves the edited values rather than the model's original proposal

#### Scenario: Cancel a prepared action
- **WHEN** the user cancels the pending action
- **THEN** the system creates no session and marks the action unavailable for later execution

### Requirement: Confirmed actions are idempotent
The system SHALL bind each pending action to a single-use identifier and SHALL return the original result if the client retries a successful confirmation.

#### Scenario: Retry confirmation after a network interruption
- **WHEN** the client submits the same pending-action identifier more than once
- **THEN** the system stores one recovery session and returns the same result for each successful retry
