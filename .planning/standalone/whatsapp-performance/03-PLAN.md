---
phase: standalone/whatsapp-performance
plan: 03
type: execute
wave: 2
depends_on: [01, 02]
files_modified: []
autonomous: false

must_haves:
  truths:
    - "Conversation list shows correct names, timestamps, tags, and unread counts"
    - "Selecting a conversation loads messages and marks as read"
    - "New incoming messages appear in chat and conversation moves to top of list"
    - "Adding/removing tags on a conversation updates the list item"
    - "Opening the contact panel shows full contact details (address, city, tags, orders)"
    - "Creating an order from the panel works correctly"
    - "Agent toggles in chat header work"
    - "Archive/unarchive works"
    - "Search and filters produce correct results"
    - "No console errors related to realtime subscriptions"
  artifacts: []
  key_links: []
---

<objective>
Verify all WhatsApp module functionality after performance optimizations.

Purpose: Plans 01 and 02 made significant changes to realtime subscriptions, query shapes, and rendering behavior. This plan verifies zero functionality regression through user testing on the deployed Vercel instance.

Output: Verified working WhatsApp module with confirmed performance improvements.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/whatsapp-performance/PHASE.md
@.planning/standalone/whatsapp-performance/01-SUMMARY.md
@.planning/standalone/whatsapp-performance/02-SUMMARY.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Build verification and deploy to Vercel</name>
  <files></files>
  <action>
  1. Run `npx tsc --noEmit` to verify no type errors
  2. Run `npm run build` to verify production build succeeds
  3. Review console output for any warnings related to the modified files
  4. Push to Vercel: `git push origin main`
  5. Wait for deployment to complete (check Vercel dashboard or `vercel --prod` status)
  </action>
  <verify>
  - `npx tsc --noEmit` exits 0
  - `npm run build` exits 0
  - Git push succeeds
  </verify>
  <done>
  Production build passes and is deployed to Vercel.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
  WhatsApp module performance optimizations:
  1. Conversation list query lightened (no address/city)
  2. 4 realtime channels consolidated into 1 for conversation list
  3. Cascade refetches replaced with surgical state updates
  4. Contact panel closed by default (zero overhead when not viewing)
  5. Contact panel channels consolidated (2 → 1)
  6. Key-based remount on conversation switch prevents stale data
  </what-built>
  <how-to-verify>
  Open the deployed Vercel URL and test the WhatsApp module:

  **Test 1: Conversation List**
  1. Open /whatsapp — conversation list should load normally
  2. Verify names, timestamps, tags, and unread counts display correctly
  3. Verify the right panel is NOT visible by default (closed)

  **Test 2: Real-time Updates**
  1. Send a WhatsApp message to the system (or have someone send one)
  2. Verify the conversation moves to the top of the list WITHOUT page reload
  3. Verify unread count increments
  4. Verify message preview updates

  **Test 3: Messages**
  1. Click a conversation — messages should load in the chat
  2. Send a message — it should appear immediately
  3. Receive a message — it should appear in real-time

  **Test 4: Contact Panel**
  1. Click the panel toggle button (PanelRightOpen icon in header)
  2. Panel should open showing contact details, address, city, tags, orders
  3. Switch to another conversation — panel should show new contact's data (no flash of old data)
  4. Create an order from the panel — should work correctly
  5. Close the panel

  **Test 5: Tags**
  1. Add a tag to a conversation from the chat header
  2. Verify the tag appears in the conversation list item
  3. Remove the tag — verify it disappears from the list

  **Test 6: Filters and Search**
  1. Use the search bar — results should filter correctly
  2. Switch between All/Unread/Mine/Unassigned filters
  3. Archive/unarchive a conversation

  **Test 7: Agent Features**
  1. Toggle the conversational agent on/off in the chat header
  2. Open the agent config slider — should still work

  **Test 8: Browser Console**
  1. Open browser DevTools → Console
  2. Look for any errors related to realtime, subscriptions, or state
  3. Verify you see "Realtime inbox status: SUBSCRIBED" (single channel)
  4. Verify NO repeated "SUBSCRIBED" messages (which would indicate re-subscription loops)
  </how-to-verify>
  <resume-signal>Type "approved" if all tests pass, or describe any issues found</resume-signal>
</task>

</tasks>

<verification>
All WhatsApp module functionality works identically to before the optimization, with the following visible improvements:
- Panel is closed by default (user decision)
- Real-time updates feel the same or faster (surgical updates vs full refetch)
- No console errors or subscription issues
</verification>

<success_criteria>
- User confirms all 8 test categories pass
- No functionality regressions
- Panel closed by default as requested
- No console errors
</success_criteria>

<output>
After completion, create `.planning/standalone/whatsapp-performance/03-SUMMARY.md`
</output>
