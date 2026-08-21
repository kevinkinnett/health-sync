## Purpose

Provide an application-owned log for repeatable recovery activities that connected health providers do not represent.

## ADDED Requirements

### Requirement: Recovery activity library
The system SHALL maintain a library of recovery activity types with a name, category, optional default duration, active status, and optional notes. The initial library SHALL contain active Hot blanket and Massage activity types.

#### Scenario: Initial activity types are available
- **WHEN** the user opens Recovery after the database migration
- **THEN** Hot blanket and Massage are available for quick logging

#### Scenario: Activity defaults are maintained
- **WHEN** the user changes an activity type's name, default duration, notes, or active status
- **THEN** the system saves the change without altering previously logged sessions

### Requirement: Recovery session details
The system SHALL record each recovery session with its activity type, start instant, positive duration in minutes, optional intensity from 1 through 5, optional notes, and source provenance. Hot blanket sessions SHALL support an optional temperature in degrees Fahrenheit, and massage sessions SHALL support an optional massage type.

#### Scenario: Log a current session
- **WHEN** the user selects an active activity, accepts the current time, supplies a valid duration, and confirms the entry
- **THEN** the system records one session with source `manual` and returns the normalized session

#### Scenario: Use an activity default duration
- **WHEN** an activity has a positive default duration and the user does not change it
- **THEN** the system logs the session with that duration

#### Scenario: Reject invalid session details
- **WHEN** the user supplies a non-positive duration, an intensity outside 1 through 5, or activity-specific details that do not match the selected category
- **THEN** the system rejects the session and identifies the invalid field

### Requirement: Local-time and backfill behavior
The system SHALL accept current or historical session times in the configured IANA user timezone, convert stored instants to UTC, and display them in that same user timezone. Calendar grouping SHALL derive the local date from the stored instant and SHALL remain correct across EST, EDT, and daylight-saving transitions.

#### Scenario: Backfill a past session
- **WHEN** the user enters a valid local date and time from a previous day
- **THEN** the system stores the corresponding UTC instant and displays the session under the entered local day

#### Scenario: Display a session across a daylight-saving transition
- **WHEN** a stored session is displayed after the UTC offset for America/New_York changes
- **THEN** the system reconstructs its original local date and time using timezone rules rather than a fixed offset

### Requirement: Session history management
The system SHALL let the user list sessions by local date range and activity type, inspect provenance, edit session details, and delete an individual session.

#### Scenario: Edit a session
- **WHEN** the user changes the time, duration, intensity, activity-specific details, or notes of an existing session
- **THEN** the system validates and returns the updated session without creating another record

#### Scenario: Delete a session
- **WHEN** the user confirms deletion of a session
- **THEN** the system removes only that session and refreshes the visible history and dependent analysis

### Requirement: Recovery logging interface
The system SHALL provide a Recovery page in the Log navigation with quick-log controls, an editable confirmation form, today's sessions, historical sessions, and activity-library management.

#### Scenario: Quick-log from the Recovery page
- **WHEN** the user selects Hot blanket or Massage from the quick-log controls
- **THEN** the system opens a form prefilled with the current local time and the activity's configured defaults before saving
