## Purpose

Let recovery analysis use a main sleep as soon as its overnight session is complete, while keeping incomplete current-day data out and explaining sessions that are still waiting for sleep.

## ADDED Requirements

### Requirement: Completed current-day sleep eligibility
The system SHALL admit a sleep period on the current local wake date to recovery analysis only when the main sleep has valid start and end instants, the end follows the start, and a positive sleep duration is available. The current period SHALL be retained only when at least one recovery session aligns to it. Historical completed-day behavior SHALL remain unchanged.

#### Scenario: Yesterday's massage aligns this morning
- **WHEN** a recovery session ends before today's recorded main sleep begins and that main sleep is complete
- **THEN** the system links the session to today's wake-date sleep without waiting for the next local day

#### Scenario: Current sleep is incomplete
- **WHEN** today's sleep row lacks a valid main-session end or positive sleep duration
- **THEN** the system excludes that sleep period from recovery analysis

#### Scenario: Current sleep has no recovery exposure
- **WHEN** today's main sleep is complete but no recovery session aligns to it
- **THEN** the system excludes the current period from recovery matching and control selection

### Requirement: Current-day outcome boundaries
For an admitted current-day recovery period, the system SHALL expose completed sleep-derived outcomes and any available wake-day outcomes used by recovery analysis. It SHALL NOT add running daytime activity totals or use the current period as an unexposed comparison night. Missing wake-day outcomes SHALL remain unavailable rather than blocking the completed sleep outcome.

#### Scenario: Sleep is complete but HRV is missing
- **WHEN** today's main sleep has complete duration and efficiency values but wake-day HRV is unavailable
- **THEN** the session aligns for sleep outcomes while HRV remains unavailable

#### Scenario: Daytime activity is still running
- **WHEN** today's main sleep is complete and daytime activity totals are still changing
- **THEN** the recovery analysis admits the sleep period without treating running daytime totals as completed outcomes or matching inputs

### Requirement: Pending session alignment status
The recovery API SHALL distinguish recent unaligned sessions that may still receive a qualifying main sleep from sessions that have no valid aligned sleep. Recovery coverage and event-study presentation SHALL report the pending count and use waiting language only when at least one session is genuinely pending.

#### Scenario: Session is waiting for tonight's sleep
- **WHEN** a recent recovery session has no later completed main sleep within the analysis data
- **THEN** the system counts it as pending and explains that it is waiting for a completed main sleep

#### Scenario: Completed sleep aligns immediately
- **WHEN** today's completed main sleep qualifies and contains the first valid sleep after a recent recovery session
- **THEN** the system counts the session as aligned rather than pending

#### Scenario: No aligned or pending session
- **WHEN** an activity has no session that aligns and no recent session waiting for sleep
- **THEN** the system reports that no completed sleep could be linked without claiming that a session is still pending
