# @dnd-kit/react v0.3.2 - Research

**Researched:** 2026-02-21
**Domain:** Drag and drop sortable lists with nested containers
**Confidence:** HIGH (verified from installed package type definitions + official GitHub storybook examples)

## Summary

`@dnd-kit/react` v0.3.2 is the new React-specific package in the dnd-kit ecosystem, replacing the older `@dnd-kit/core` + `@dnd-kit/sortable` combination. It provides `DragDropProvider` (replaces `DndContext`), `useSortable` (replaces the old `useSortable` from `@dnd-kit/sortable`), and `DragOverlay`. Cross-container sorting is handled via the `group` property on `useSortable` combined with the `move()` helper from `@dnd-kit/helpers`.

The library uses optimistic sorting by default -- items physically reorder in the DOM during drag, so there is no separate `SortableContext` needed (unlike the old API). State management is done via `onDragOver` + `onDragEnd` event handlers on `DragDropProvider`, using the `move()` helper to transform state.

**Primary recommendation:** Use `DragDropProvider` + `useSortable` with `group` for cross-container sorting. Use `move()` from `@dnd-kit/helpers` for state updates. Use `DragOverlay` with function children for drag feedback.

## Standard Stack

### Core (already installed in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@dnd-kit/react` | 0.3.2 | React hooks + components | Main React integration |
| `@dnd-kit/dom` | 0.3.2 | DOM layer (Sortable class, sensors, plugins) | Required dependency |
| `@dnd-kit/abstract` | 0.3.2 | Core types (UniqueIdentifier, Data, events) | Required dependency |
| `@dnd-kit/collision` | 0.3.2 | Collision detection algorithms | Required dependency |
| `@dnd-kit/state` | 0.3.2 | Reactive state primitives | Required dependency |

### Required Addition
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@dnd-kit/helpers` | 0.3.2 | `move()`, `swap()`, `arrayMove()`, `arraySwap()` | ALWAYS for sortable state updates |

**Installation:**
```bash
npm install @dnd-kit/helpers@0.3.2
```

## Architecture Patterns

### Pattern 1: DragDropProvider (Top-Level Wrapper)

**What:** Replaces old `DndContext`. Wraps all draggable/droppable/sortable elements. Handles all event callbacks.

**Props (from type definitions):**

```typescript
interface DragDropProviderProps {
  children: ReactNode;
  manager?: DragDropManager;              // Optional custom manager
  sensors?: Customizable<Sensors>;        // Array or (defaults) => [...defaults, Custom]
  plugins?: Customizable<Plugins>;        // Array or (defaults) => [...defaults, Custom]
  modifiers?: Customizable<Modifiers>;    // Array or (defaults) => [...defaults, Custom]
  onBeforeDragStart?: (event, manager) => void;  // Preventable
  onDragStart?: (event, manager) => void;
  onDragMove?: (event, manager) => void;         // Preventable
  onDragOver?: (event, manager) => void;         // Preventable
  onDragEnd?: (event, manager) => void;
  onCollision?: (event, manager) => void;        // Preventable
}
```

**Event Object Shapes (from `@dnd-kit/abstract`):**

```typescript
// onDragStart event
{
  cancelable: false;
  operation: {
    source: Draggable | null;     // .id, .type, .data, .isDragging
    target: Droppable | null;     // .id, .type, .data, .isDropTarget
    status: Status;               // .idle, .dragging, .dropped
    position: Position;
    transform: { x: number; y: number };
    shape: Shape | null;
    canceled: boolean;
    activatorEvent: Event | null;
  };
  nativeEvent?: Event;
}

// onDragOver event (preventable)
{
  cancelable: boolean;
  defaultPrevented: boolean;
  preventDefault(): void;
  operation: DragOperationSnapshot;
}

// onDragEnd event
{
  operation: DragOperationSnapshot;
  nativeEvent?: Event;
  canceled: boolean;
  suspend(): { resume(): void; abort(): void };
}
```

### Pattern 2: useSortable Hook

**What:** The main hook for sortable items. Combines draggable + droppable behavior.

**Import:**
```typescript
import { useSortable } from '@dnd-kit/react/sortable';
```

**Input (from `SortableInput<T>` + `UseSortableInput<T>`):**

```typescript
interface UseSortableInput<T extends Data = Data> {
  // REQUIRED
  id: UniqueIdentifier;           // string | number - unique within context
  index: number;                  // Position in list - MUST match render order

  // CROSS-CONTAINER SORTING
  group?: UniqueIdentifier;       // Group ID - items with same group can be sorted together
                                  // Items can ONLY be sorted within their group

  // VISUAL FEEDBACK
  feedback?: 'default' | 'move' | 'clone' | 'none';  // How original item behaves during drag
  transition?: SortableTransition | null;  // Animation config

  // DRAG HANDLE
  handle?: RefOrValue<Element>;   // Restrict drag activation to handle element
  element?: RefOrValue<Element>;  // Pre-existing element reference
  target?: RefOrValue<Element>;   // Droppable target element

  // TYPE FILTERING
  type?: Type;                    // Categorize this sortable (string | number | Symbol)
  accept?: Type | Type[] | ((source: Draggable) => boolean);  // What types to accept

  // COLLISION
  collisionDetector?: CollisionDetector;
  collisionPriority?: CollisionPriority | number;

  // OTHER
  disabled?: boolean;
  data?: T;                       // Custom data accessible in event handlers
  sensors?: Sensors[];
  modifiers?: Modifier[];
  effects?(): Effect[];

  // PLUGINS (default: [SortableKeyboardPlugin, OptimisticSortingPlugin])
  plugins?: PluginConstructor[];
}
```

**Output:**

```typescript
{
  sortable: Sortable<T>;         // The underlying Sortable instance
  ref: (element: Element | null) => void;        // Attach to the sortable element
  handleRef: (element: Element | null) => void;  // Attach to drag handle
  sourceRef: (element: Element | null) => void;  // Draggable source element
  targetRef: (element: Element | null) => void;  // Droppable target element
  isDragging: boolean;           // Currently being dragged
  isDropping: boolean;           // Being dropped (animating)
  isDragSource: boolean;         // Is the source of active drag
  isDropTarget: boolean;         // Currently a drop target
}
```

**SortableTransition:**
```typescript
interface SortableTransition {
  duration?: number;    // Default: 300ms
  easing?: string;      // Default: 'cubic-bezier(0.25, 1, 0.5, 1)'
  idle?: boolean;       // Transition when index changes without drag? Default: false
}
```

### Pattern 3: DragOverlay

**What:** Renders custom overlay during drag. Placed inside `DragDropProvider`. Only ONE per provider.

**Import:**
```typescript
import { DragOverlay } from '@dnd-kit/react';
```

**Props:**
```typescript
interface DragOverlayProps {
  children: ReactNode | ((source: Draggable) => ReactNode);  // Function receives drag source
  tag?: string;                    // HTML tag for wrapper (default: 'div')
  className?: string;
  style?: React.CSSProperties;
  disabled?: boolean | ((source: Draggable | null) => boolean);
  dropAnimation?: DropAnimation | null;
  // DropAnimation = { duration: number; easing: string } | ((context) => Promise<void>)
}
```

### Pattern 4: move() Helper

**Import:**
```typescript
import { move } from '@dnd-kit/helpers';
```

**Signature:**
```typescript
// For simple arrays:
function move<T extends UniqueIdentifier[] | { id: UniqueIdentifier }[]>(
  items: T,
  event: DragOverEvent | DragEndEvent
): T;

// For grouped records (cross-container):
function move<T extends Record<UniqueIdentifier, Items>>(
  items: T,
  event: DragOverEvent | DragEndEvent
): T;
```

**Key behavior:** `move()` handles both single-list reordering AND cross-container moves. For cross-container, pass a `Record<string, Item[]>` where keys are group/column IDs. It uses sortable `index`, `initialIndex`, `group`, and `initialGroup` properties to determine correct positions.

### Pattern 5: Additional Hooks

```typescript
// Monitor drag events from anywhere in the tree
import { useDragDropMonitor } from '@dnd-kit/react';
useDragDropMonitor({
  onDragStart(event, manager) { ... },
  onDragOver(event, manager) { ... },
  onDragEnd(event, manager) { ... },
});

// Get current drag operation state
import { useDragOperation } from '@dnd-kit/react';
const { source, target } = useDragOperation();

// Get the manager instance
import { useDragDropManager } from '@dnd-kit/react';
const manager = useDragDropManager();

// Check if a draggable/droppable is sortable
import { isSortable, isSortableOperation } from '@dnd-kit/react/sortable';
```

## Code Examples

### Example 1: Basic Sortable List

Source: [Official Quickstart + SortableExample.tsx](https://github.com/clauderic/dnd-kit/blob/main/apps/stories/stories/react/Sortable/SortableExample.tsx)

```tsx
import { useState } from 'react';
import { DragDropProvider } from '@dnd-kit/react';
import { useSortable } from '@dnd-kit/react/sortable';
import { move } from '@dnd-kit/helpers';

function SortableItem({ id, index }: { id: string; index: number }) {
  const { ref, isDragging } = useSortable({ id, index });

  return (
    <div
      ref={ref}
      style={{ opacity: isDragging ? 0.5 : 1 }}
      className="p-3 bg-white border rounded-lg shadow-sm"
    >
      {id}
    </div>
  );
}

export function SortableList() {
  const [items, setItems] = useState(['item-1', 'item-2', 'item-3']);

  return (
    <DragDropProvider
      onDragOver={(event) => {
        setItems((items) => move(items, event));
      }}
      onDragEnd={(event) => {
        if (event.canceled) {
          // Restore original order on cancel
          return;
        }
        // Final state already set by onDragOver
      }}
    >
      <div className="flex flex-col gap-2">
        {items.map((id, index) => (
          <SortableItem key={id} id={id} index={index} />
        ))}
      </div>
    </DragDropProvider>
  );
}
```

### Example 2: Cross-Container Sortable (MultipleLists)

Source: [Official MultipleLists.tsx](https://github.com/clauderic/dnd-kit/blob/main/apps/stories/stories/react/Sortable/MultipleLists/MultipleLists.tsx)

```tsx
import { memo, useCallback, useRef, useState } from 'react';
import { CollisionPriority } from '@dnd-kit/abstract';
import { DragDropProvider, DragOverlay } from '@dnd-kit/react';
import { useSortable } from '@dnd-kit/react/sortable';
import { move } from '@dnd-kit/helpers';

// ---- Data structure: Record<groupId, itemId[]> ----
type ItemsMap = Record<string, string[]>;

// ---- Sortable Item (belongs to a group) ----
const SortableItem = memo(function SortableItem({
  id,
  column,
  index,
}: {
  id: string;
  column: string;
  index: number;
}) {
  const { ref, handleRef, isDragging } = useSortable({
    id,
    index,
    group: column,         // <-- KEY: assigns item to a group
    type: 'item',          // <-- type for filtering
    accept: 'item',        // <-- only accept other items (not columns)
    feedback: 'clone',     // <-- show clone while dragging
    data: { group: column },
  });

  return (
    <div
      ref={ref}
      className={`p-3 bg-white border rounded ${isDragging ? 'opacity-50' : ''}`}
    >
      <button ref={handleRef} className="cursor-grab mr-2">
        &#x2630;
      </button>
      {id}
    </div>
  );
});

// ---- Sortable Column (container that is also sortable) ----
const SortableColumn = memo(function SortableColumn({
  id,
  index,
  items,
}: {
  id: string;
  index: number;
  items: string[];
}) {
  const { ref, handleRef, isDragging } = useSortable({
    id,
    index,
    type: 'column',
    accept: ['column', 'item'],  // Accepts both column reorder AND item drops
    collisionPriority: CollisionPriority.Low,  // Items get priority over columns
  });

  return (
    <div
      ref={ref}
      className={`p-4 bg-gray-100 rounded-lg min-h-[200px] ${isDragging ? 'opacity-50' : ''}`}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold">{id}</h3>
        <button ref={handleRef} className="cursor-grab">&#x2630;</button>
      </div>
      <div className="flex flex-col gap-2">
        {items.map((itemId, itemIndex) => (
          <SortableItem
            key={itemId}
            id={itemId}
            column={id}
            index={itemIndex}
          />
        ))}
      </div>
    </div>
  );
});

// ---- Main Component ----
export function MultipleSortableLists() {
  const [items, setItems] = useState<ItemsMap>({
    'Column A': ['A1', 'A2', 'A3'],
    'Column B': ['B1', 'B2', 'B3'],
    'Column C': [],  // Empty column is fine
  });
  const [columns] = useState(Object.keys(items));
  const snapshot = useRef<ItemsMap>(structuredClone(items));

  return (
    <DragDropProvider
      onDragStart={useCallback(() => {
        // Save snapshot for cancel/undo
        snapshot.current = structuredClone(items);
      }, [items])}

      onDragOver={useCallback((event) => {
        const { source } = event.operation;

        // Don't move items when dragging a column
        if (source?.type === 'column') return;

        // move() handles cross-container logic automatically
        // when items is Record<string, string[]>
        setItems((items) => move(items, event));
      }, [])}

      onDragEnd={useCallback((event) => {
        if (event.canceled) {
          // Restore snapshot on cancel (Escape key)
          setItems(snapshot.current);
          return;
        }

        // For column reordering, handle here:
        const { source } = event.operation;
        if (source?.type === 'column') {
          // Column reorder logic if needed
        }
      }, [])}
    >
      <div className="flex gap-4">
        {columns.map((column, index) => (
          <SortableColumn
            key={column}
            id={column}
            index={index}
            items={items[column]}
          />
        ))}
      </div>

      {/* Only ONE DragOverlay per DragDropProvider */}
      <DragOverlay>
        {(source) => (
          <div className="p-3 bg-blue-100 border-2 border-blue-400 rounded shadow-lg">
            Dragging: {source.id}
          </div>
        )}
      </DragOverlay>
    </DragDropProvider>
  );
}
```

### Example 3: Tree Structure (Nested Items with Depth)

Source: [Official Tree example](https://github.com/clauderic/dnd-kit/blob/main/apps/stories/stories/react/Sortable/Tree/Tree.tsx)

```tsx
import { useRef, useState } from 'react';
import { DragDropProvider, DragOverlay } from '@dnd-kit/react';
import { useSortable } from '@dnd-kit/react/sortable';
import { move } from '@dnd-kit/helpers';

// ---- Types ----
interface TreeNode {
  id: string;
  children: TreeNode[];
}

interface FlattenedItem {
  id: string;
  depth: number;
  parentId: string | null;
  index: number;
}

// ---- Tree Item ----
const INDENTATION = 50;

function TreeItem({ id, index, depth, parentId }: FlattenedItem) {
  const { ref, handleRef, isDragSource } = useSortable({
    id,
    index,
    alignment: { x: 'start', y: 'center' },  // Alignment for collision detection
    transition: { idle: true },                 // Animate even outside drag
    data: { depth, parentId },                  // Custom data for depth tracking
  });

  return (
    <li
      ref={ref}
      style={{ marginLeft: depth * INDENTATION }}
      aria-hidden={isDragSource}
    >
      <button ref={handleRef}>&#x2630;</button>
      {id}
    </li>
  );
}

// ---- Tree Container ----
function Tree({ items, onChange }: { items: TreeNode[]; onChange: (items: TreeNode[]) => void }) {
  const [flatItems, setFlatItems] = useState<FlattenedItem[]>(() => flattenTree(items));
  const initialDepth = useRef(0);
  const sourceChildren = useRef<FlattenedItem[]>([]);

  return (
    <DragDropProvider
      onDragStart={(event) => {
        const { source } = event.operation;
        if (!source) return;

        const item = flatItems.find(({ id }) => id === source.id)!;
        initialDepth.current = item.depth;

        // Remove descendants from visible list (they follow the dragged item)
        setFlatItems((items) => {
          sourceChildren.current = [];
          const descendants = getDescendants(items, source.id);
          return items.filter((item) => {
            if (descendants.has(item.id)) {
              sourceChildren.current.push(item);
              return false;
            }
            return true;
          });
        });
      }}

      onDragOver={(event, manager) => {
        const { source, target } = event.operation;
        event.preventDefault();

        if (source && target && source.id !== target.id) {
          setFlatItems((items) => {
            // Calculate new depth based on horizontal drag distance
            const offsetLeft = manager.dragOperation.transform.x;
            const dragDepth = Math.round(offsetLeft / INDENTATION);
            const projectedDepth = initialDepth.current + dragDepth;

            // Use move() for reordering, then update depth
            const sorted = move(items, event);
            return sorted.map((item) =>
              item.id === source.id
                ? { ...item, depth: projectedDepth, parentId: /* calculate */ null }
                : item
            );
          });
        }
      }}

      onDragEnd={(event) => {
        if (event.canceled) {
          setFlatItems(flattenTree(items));
          return;
        }

        // Rebuild tree from flattened state
        const updatedTree = buildTree([...flatItems, ...sourceChildren.current]);
        setFlatItems(flattenTree(updatedTree));
        onChange(updatedTree);
      }}
    >
      <ul>
        {flatItems.map((item, index) => (
          <TreeItem key={item.id} {...item} index={index} />
        ))}
      </ul>
      <DragOverlay style={{ width: 'min-content' }}>
        {(source) => (
          <div className="tree-overlay">
            {source.id} {sourceChildren.current.length > 0 && `(+${sourceChildren.current.length})`}
          </div>
        )}
      </DragOverlay>
    </DragDropProvider>
  );
}

// Helper: flatten tree to sortable array
function flattenTree(items: TreeNode[], depth = 0, parentId: string | null = null): FlattenedItem[] {
  return items.reduce<FlattenedItem[]>((acc, item, index) => {
    acc.push({ id: item.id, depth, parentId, index: acc.length });
    if (item.children.length > 0) {
      acc.push(...flattenTree(item.children, depth + 1, item.id));
    }
    return acc;
  }, []);
}

// Helper: rebuild tree from flat array
function buildTree(flatItems: FlattenedItem[]): TreeNode[] {
  // Implementation: iterate flat items, use depth to determine parent-child relationships
  // ...
}
```

### Example 4: Drag Handle Pattern

```tsx
import { useRef, useState } from 'react';
import { useSortable } from '@dnd-kit/react/sortable';

function SortableItemWithHandle({ id, index }: { id: string; index: number }) {
  // Option A: Using handleRef from useSortable
  const { ref, handleRef, isDragging } = useSortable({ id, index });

  return (
    <div ref={ref} className="flex items-center gap-2 p-3 border rounded">
      <button ref={handleRef} className="cursor-grab p-1">
        &#x2630;
      </button>
      <span>{id}</span>
    </div>
  );
}

function SortableItemWithExternalRef({ id, index }: { id: string; index: number }) {
  // Option B: Using external ref for element
  const [element, setElement] = useState<Element | null>(null);
  const handleRef = useRef<HTMLButtonElement | null>(null);

  const { isDragging } = useSortable({
    id,
    index,
    element,           // Pre-existing element
    handle: handleRef, // Pre-existing handle ref
  });

  return (
    <div ref={setElement}>
      <button ref={handleRef}>Drag</button>
      <span>{id}</span>
    </div>
  );
}
```

### Example 5: Sensors Configuration

```tsx
import { DragDropProvider } from '@dnd-kit/react';
import { PointerSensor, KeyboardSensor } from '@dnd-kit/dom';

// Custom sensor configuration
const sensors = [
  PointerSensor.configure({
    activatorElements(source) {
      // Only activate from element or handle
      return [source.element, source.handle];
    },
  }),
  KeyboardSensor,
];

function App() {
  return (
    <DragDropProvider sensors={sensors}>
      {/* ... */}
    </DragDropProvider>
  );
}

// Or extend defaults instead of replacing:
<DragDropProvider sensors={(defaults) => [...defaults, CustomSensor]}>
```

### Example 6: Collision Detectors

```typescript
import { closestCenter, closestCorners, directionBiased, pointerIntersection, shapeIntersection } from '@dnd-kit/collision';

// Available collision detectors:
// - defaultCollisionDetection  (pointer intersection first, falls back to shape intersection)
// - closestCenter              (distance to center of droppable)
// - closestCorners             (distance to corners)
// - pointerIntersection        (pointer must be inside droppable)
// - shapeIntersection          (greatest overlap area)
// - directionBiased            (biased toward movement direction)
// - pointerDistance             (distance from pointer to droppable)

// Use on individual sortable items:
const { ref } = useSortable({
  id: 'item-1',
  index: 0,
  collisionDetector: directionBiased,
});
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Array reordering | Manual splice/filter | `move()` from `@dnd-kit/helpers` | Handles both single-list and cross-container, uses sortable metadata for correct positioning |
| Cross-container state | Custom onDragOver logic | `move()` with `Record<string, Items>` | Automatically detects group changes using `initialGroup`/`group` properties |
| Optimistic sorting | Manual DOM manipulation | Built-in `OptimisticSortingPlugin` (default) | Physically reorders DOM during drag for smooth UX |
| Keyboard accessibility | Custom keyboard handling | Built-in `SortableKeyboardPlugin` (default) + `KeyboardSensor` | Arrow keys, Enter/Space/Escape all handled |
| Auto-scrolling | Custom scroll logic | Built-in `AutoScroller` plugin (default) | Edge-triggered container scrolling during drag |
| Drop animation | CSS animation | `DragOverlay` `dropAnimation` prop | Configurable duration/easing or custom async function |

## Common Pitfalls

### Pitfall 1: Missing `index` Prop
**What goes wrong:** Items don't sort correctly or move() returns incorrect results.
**Why:** Unlike old API, `index` is REQUIRED on every `useSortable` call and MUST match the render order.
**How to avoid:** Always use `items.map((item, index) => <SortableItem index={index} />)`.

### Pitfall 2: Stale State in Callbacks
**What goes wrong:** onDragOver/onDragEnd see stale items state.
**Why:** Event handlers capture closure state.
**How to avoid:** Use `setItems((items) => move(items, event))` (functional updater) NOT `setItems(move(items, event))`.

### Pitfall 3: Missing `group` for Cross-Container
**What goes wrong:** Items can't be moved between containers.
**Why:** Without `group`, items are in the default group and `move()` can't determine which container they belong to.
**How to avoid:** Always set `group` on `useSortable` to the container/column ID.

### Pitfall 4: Multiple DragOverlay Components
**What goes wrong:** Unpredictable overlay behavior.
**Why:** Only ONE `DragOverlay` per `DragDropProvider` is supported.
**How to avoid:** Place a single `DragOverlay` with function children that renders conditionally based on `source`.

### Pitfall 5: Mismatched `type`/`accept` Filtering
**What goes wrong:** Items can't be dropped where expected, or columns accept drops they shouldn't.
**Why:** `type` categorizes the draggable; `accept` on droppable filters what it receives.
**How to avoid:** In multi-container: items get `type: 'item'`, containers get `accept: ['item', 'column']` with `collisionPriority: CollisionPriority.Low` so items take collision priority.

### Pitfall 6: Not Snapshotting for Cancel
**What goes wrong:** Pressing Escape doesn't restore original order.
**Why:** `onDragOver` has already mutated state; `event.canceled` in `onDragEnd` means drag was cancelled.
**How to avoid:** Save `structuredClone(items)` in `onDragStart`, restore in `onDragEnd` when `event.canceled === true`.

### Pitfall 7: No SortableContext Needed
**What goes wrong:** Trying to use `SortableContext` from old API.
**Why:** The new `@dnd-kit/react` uses optimistic sorting by default -- no `SortableContext` needed.
**How to avoid:** Just use `useSortable` directly. The `OptimisticSortingPlugin` handles DOM reordering.

### Pitfall 8: Optimistic vs Non-Optimistic Sorting
**What goes wrong:** Double-moving items or jumpy sorting.
**Why:** With optimistic sorting (default), items reorder in DOM automatically. If you ALSO update state in `onDragOver`, you get conflicts.
**How to avoid:**
- **Optimistic (default):** Only update state in `onDragEnd`. The DOM reorders automatically during drag.
- **Non-optimistic:** Update state in `onDragOver` for immediate state sync. Set `plugins` to exclude `OptimisticSortingPlugin`.
- The official examples use `onDragOver` state updates, which works because `move()` is idempotent with the sortable indices.

## State of the Art

| Old Approach (@dnd-kit/core + @dnd-kit/sortable) | New Approach (@dnd-kit/react v0.3.2) | Impact |
|---------------------------------------------------|--------------------------------------|--------|
| `DndContext` | `DragDropProvider` | Same concept, new name |
| `SortableContext` wrapping items | Not needed (optimistic sorting by default) | Simpler API |
| `useSortable()` from `@dnd-kit/sortable` | `useSortable()` from `@dnd-kit/react/sortable` | Different import, requires `index` |
| `arrayMove()` manual state management | `move()` from `@dnd-kit/helpers` | Handles cross-container automatically |
| `active.id` / `over.id` in events | `event.operation.source` / `event.operation.target` | Full objects instead of just IDs |
| `closestCenter` strategy prop | `collisionDetector` prop per sortable | More granular control |
| No `group` concept | `group` prop on `useSortable` | Native cross-container support |
| `feedback` not available | `feedback: 'clone' | 'move' | 'none' | 'default'` | Built-in visual feedback modes |

**Deprecated / Removed in new API:**
- `SortableContext` - not needed
- `DndContext` - replaced by `DragDropProvider`
- `useSensors()` hook - pass sensors directly to `DragDropProvider`
- `active`/`over` naming - replaced by `source`/`target`
- `closestCenter` as strategy prop - now per-item `collisionDetector`

## Available Collision Detectors

From `@dnd-kit/collision`:

| Detector | Description |
|----------|-------------|
| `defaultCollisionDetection` | Pointer intersection first, falls back to shape intersection |
| `closestCenter` | Distance to center of droppable |
| `closestCorners` | Distance to corners of droppable |
| `pointerIntersection` | Pointer must be inside droppable |
| `shapeIntersection` | Greatest overlap area |
| `directionBiased` | Biased toward movement direction (recommended for sortable) |
| `pointerDistance` | Distance from pointer to droppable |

## Available FeedbackTypes

From `@dnd-kit/dom`:

| Type | Behavior |
|------|----------|
| `'default'` | Default browser drag behavior |
| `'move'` | Original item moves with drag (disappears from position) |
| `'clone'` | Clone stays in original position, dragged copy follows cursor |
| `'none'` | No visual feedback on original item |

## Open Questions

1. **Optimistic sorting state management nuance**
   - What we know: Default plugins include `OptimisticSortingPlugin` which reorders DOM during drag. Official examples ALSO call `move()` in `onDragOver`.
   - What's unclear: Whether this causes double-ordering or if `move()` is designed to be idempotent with optimistic sorting.
   - Recommendation: Follow the official MultipleLists example pattern -- use `onDragOver` with `move()` for cross-container, and `onDragEnd` for final state. This is the tested pattern.

2. **Empty containers in cross-container sorting**
   - What we know: Old API required explicit `useDroppable` for empty containers. New API containers are sortable themselves.
   - What's unclear: Whether empty containers (no items) still receive drops correctly with just `useSortable`.
   - Recommendation: Set `accept` on container sortable to include the item type, and use `collisionPriority: CollisionPriority.Low` so items inside get priority when non-empty.

## Sources

### Primary (HIGH confidence)
- `/node_modules/@dnd-kit/react/index.d.ts` - Complete type definitions for DragDropProvider, useDraggable, useDroppable, DragOverlay, useDragDropMonitor, useDragOperation
- `/node_modules/@dnd-kit/react/sortable.d.ts` - Complete type definitions for useSortable
- `/node_modules/@dnd-kit/dom/sortable.d.ts` - SortableInput, Sortable class, group property, SortableTransition
- `/node_modules/@dnd-kit/dom/index.d.ts` - FeedbackType, Draggable, Droppable, DragDropManager, PointerSensor
- `/node_modules/@dnd-kit/abstract/index.d.ts` - DragDropEvents (all event shapes), DragOperation, Entity types
- `/node_modules/@dnd-kit/collision/dist/index.d.ts` - All collision detectors

### Secondary (HIGH confidence - official repo examples)
- [MultipleLists.tsx](https://github.com/clauderic/dnd-kit/blob/main/apps/stories/stories/react/Sortable/MultipleLists/MultipleLists.tsx) - Cross-container sortable
- [SortableExample.tsx](https://github.com/clauderic/dnd-kit/blob/main/apps/stories/stories/react/Sortable/SortableExample.tsx) - Basic sortable list
- [Tree.tsx](https://github.com/clauderic/dnd-kit/blob/main/apps/stories/stories/react/Sortable/Tree/Tree.tsx) - Tree/folder structure
- [TreeItem.tsx](https://github.com/clauderic/dnd-kit/blob/main/apps/stories/stories/react/Sortable/Tree/TreeItem.tsx) - Tree item useSortable config
- [Quickstart.tsx](https://github.com/clauderic/dnd-kit/blob/main/apps/stories/stories/react/Sortable/Quickstart.tsx) - Minimal example

### Tertiary (MEDIUM confidence - web docs)
- [dndkit.com/react/hooks/use-sortable](https://dndkit.com/react/hooks/use-sortable) - Official docs for useSortable
- [dndkit.com/react/components/drag-drop-provider](https://dndkit.com/react/components/drag-drop-provider) - Official docs for DragDropProvider
- [dndkit.com/react/components/drag-overlay](https://dndkit.com/react/components/drag-overlay) - Official docs for DragOverlay
- [GitHub Issue #1695](https://github.com/clauderic/dnd-kit/issues/1695) - Working examples from community
- [GitHub Discussion #809](https://github.com/clauderic/dnd-kit/discussions/809) - Complex interaction patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Verified from installed packages and type definitions
- useSortable API: HIGH - Verified from actual `.d.ts` files in node_modules
- DragDropProvider API: HIGH - Verified from actual `.d.ts` files
- DragOverlay API: HIGH - Verified from actual `.d.ts` files
- Cross-container pattern: HIGH - Verified from official MultipleLists storybook example
- Tree pattern: HIGH - Verified from official Tree storybook example
- move() helper: HIGH - Verified from GitHub source code
- Event shapes: HIGH - Verified from @dnd-kit/abstract type definitions
- Pitfalls: MEDIUM - Combination of docs, issues, and type analysis

**Research date:** 2026-02-21
**Valid until:** 2026-03-21 (stable API, v0.3.2)
