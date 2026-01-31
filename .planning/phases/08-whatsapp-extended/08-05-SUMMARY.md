---
phase: 08
plan: 05
title: "Team Management UI"
one_liner: "Team config page with member management, assignment dropdown, and availability toggle"
subsystem: whatsapp-teams
tags: [teams, assignment, agent-management, ui]
dependency_graph:
  requires:
    - "08-02: Server Actions for teams and assignment"
    - "08-01: Database foundation (teams, team_members tables)"
  provides:
    - "Team CRUD UI at /configuracion/whatsapp/equipos"
    - "Agent assignment in chat header"
    - "Availability toggle for agents"
  affects:
    - "08-06: Role-based visibility may use team membership"
    - "Phase 9: Analytics may track assignments"
tech_stack:
  added: []
  patterns:
    - "Server Components for initial data fetch"
    - "Expandable card pattern for team details"
    - "Grouped dropdown for agent selection"
    - "Optimistic updates for availability toggle"
key_files:
  created:
    - src/app/(dashboard)/configuracion/whatsapp/equipos/page.tsx
    - src/app/(dashboard)/configuracion/whatsapp/equipos/components/team-list.tsx
    - src/app/(dashboard)/configuracion/whatsapp/equipos/components/team-form.tsx
    - src/app/(dashboard)/configuracion/whatsapp/equipos/components/team-members-manager.tsx
    - src/app/(dashboard)/whatsapp/components/assign-dropdown.tsx
    - src/app/(dashboard)/whatsapp/components/availability-toggle.tsx
    - src/components/ui/switch.tsx
  modified:
    - src/app/(dashboard)/whatsapp/components/chat-header.tsx
    - src/app/(dashboard)/whatsapp/components/conversation-list.tsx
    - src/app/actions/conversations.ts
    - src/lib/whatsapp/types.ts
decisions:
  - id: team-expansion-pattern
    choice: "Expandable cards with single-expanded state"
    why: "Similar to pipeline config page, keeps UI clean"
    alternatives: ["Always-expanded", "Accordion"]
  - id: assignment-dropdown-grouping
    choice: "Group agents by team in dropdown"
    why: "Natural organization, matches team structure"
    alternatives: ["Flat list", "Separate team selector"]
  - id: availability-toggle-location
    choice: "In conversation list header"
    why: "Always visible, quick access for agents"
    alternatives: ["User menu", "Separate settings page"]
metrics:
  duration: "~14 minutes"
  completed: "2026-01-31"
---

# Phase 8 Plan 05: Team Management UI Summary

Team configuration page with member management, conversation assignment dropdown in chat header, and agent availability toggle.

## What Was Built

### 1. Team Management Page (`/configuracion/whatsapp/equipos`)

Server component page with:
- Team list with expandable cards showing member count
- "Por defecto" badge for default team
- Create/edit team dialogs with name and is_default toggle
- Delete team with confirmation dialog

### 2. Team Members Manager Component

Embedded in expanded team cards:
- Dropdown to select workspace members not in any team
- Add member button
- List of current members with avatar, name, email
- Online/offline status badge (green/gray)
- Remove member button per row

### 3. Assignment Dropdown (`AssignDropdown`)

In chat header for manual conversation assignment:
- Shows current assignee or "Sin asignar"
- Dropdown groups agents by team name
- Each agent shows online/offline indicator
- "Quitar asignacion" option when assigned
- Updates conversation via assignConversation Server Action

### 4. Availability Toggle (`AvailabilityToggle`)

In conversation list header:
- Shows "Disponible" (green) or "No disponible" (gray)
- Toggle updates all team memberships via setAgentAvailability
- Optimistic update with revert on error
- Affects round-robin assignment distribution

### 5. Extended ConversationWithDetails Type

Added `assigned_name` field to show assignee name in UI:
- getConversations and getConversation now join profiles table
- Extracts full_name or email for display

## Key Implementation Details

### Pattern: Expandable Cards

```typescript
const [expandedId, setExpandedId] = useState<string | null>(
  teams.length > 0 ? teams[0].id : null
)

// Card header is clickable
<CardHeader onClick={() => setExpandedId(expandedId === team.id ? null : team.id)}>
  {/* ... */}
</CardHeader>

{expandedId === team.id && (
  <CardContent>
    <TeamMembersManager teamId={team.id} />
  </CardContent>
)}
```

### Pattern: Grouped Agent Selection

```typescript
// Group agents by team
const agentsByTeam = agents.reduce((acc, agent) => {
  if (!acc[agent.team]) acc[agent.team] = []
  acc[agent.team].push(agent)
  return acc
}, {} as Record<string, typeof agents>)

// Render grouped dropdown
Object.entries(agentsByTeam).map(([team, teamAgents]) => (
  <div key={team}>
    <DropdownMenuLabel className="text-xs text-muted-foreground">
      {team}
    </DropdownMenuLabel>
    {teamAgents.map((agent) => (
      <DropdownMenuItem key={agent.id} onClick={() => handleAssign(agent.id)}>
        <Circle className={agent.is_online ? 'fill-green-500' : 'fill-gray-300'} />
        {agent.name}
      </DropdownMenuItem>
    ))}
  </div>
))
```

### Pattern: Optimistic Availability Update

```typescript
async function handleToggle() {
  const newStatus = !isOnline
  setIsOnline(newStatus)  // Optimistic

  try {
    const result = await setAgentAvailability(userId, newStatus)
    if ('error' in result) {
      setIsOnline(!newStatus)  // Revert
      toast.error(result.error)
      return
    }
    toast.success(newStatus ? 'Ahora estas disponible' : 'Ahora estas no disponible')
  } catch (error) {
    setIsOnline(!newStatus)  // Revert
    toast.error('Error al cambiar disponibilidad')
  }
}
```

## Verification Results

1. [x] Team list shows all teams with member counts
2. [x] Create/edit team form works with is_default toggle
3. [x] Team members can be added and removed
4. [x] Online/offline status shown for each member
5. [x] Assignment dropdown groups agents by team
6. [x] Conversation can be assigned to specific agent
7. [x] Availability toggle works for current user

## Commits

| Hash | Message |
|------|---------|
| 353d2a9 | feat(08-05): team management page with member management |
| 80375bf | feat(08-05): assignment dropdown and availability toggle |

## Files Changed Summary

- **5 new components** for team management and assignment
- **1 new UI component** (Switch from shadcn)
- **4 modified files** to integrate assignment and extend types

## Deviations from Plan

None - plan executed exactly as written.

## Next Phase Readiness

- Team management UI complete
- Assignment mechanism integrated into chat header
- Ready for 08-06 (role-based visibility) to leverage team membership
