import { describe, expect, it } from 'vitest';
import {
  composeBlock,
  TemplatePriority,
  PrioritizedTemplate,
  BlockCompositionResult,
  PRIORITY_RANK,
} from '../block-composer';
import { BLOCK_MAX_TEMPLATES, BLOCK_MAX_INTENTS } from '../constants';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tpl(
  overrides: Partial<PrioritizedTemplate> & { templateId: string }
): PrioritizedTemplate {
  return {
    content: `content-${overrides.templateId}`,
    contentType: 'texto',
    priority: 'CORE',
    intent: 'default',
    orden: 0,
    isNew: true,
    ...overrides,
  };
}

function mapOf(
  entries: Record<string, PrioritizedTemplate[]>
): Map<string, PrioritizedTemplate[]> {
  return new Map(Object.entries(entries));
}

// ---------------------------------------------------------------------------
// Constants validation
// ---------------------------------------------------------------------------

describe('block-composer constants', () => {
  it('BLOCK_MAX_TEMPLATES is 3', () => {
    expect(BLOCK_MAX_TEMPLATES).toBe(3);
  });

  it('BLOCK_MAX_INTENTS is 3', () => {
    expect(BLOCK_MAX_INTENTS).toBe(3);
  });

  it('PRIORITY_RANK orders CORE < COMPLEMENTARIA < OPCIONAL', () => {
    expect(PRIORITY_RANK.CORE).toBeLessThan(PRIORITY_RANK.COMPLEMENTARIA);
    expect(PRIORITY_RANK.COMPLEMENTARIA).toBeLessThan(PRIORITY_RANK.OPCIONAL);
  });
});

// ---------------------------------------------------------------------------
// composeBlock — main algorithm
// ---------------------------------------------------------------------------

describe('composeBlock', () => {
  // -------------------------------------------------------------------------
  // Case 1: Single intent, 1 template
  // -------------------------------------------------------------------------
  it('Case 1: single intent, 1 CORE template -> block has 1, no overflow', () => {
    const newByIntent = mapOf({
      precio: [tpl({ templateId: 'precio-core', priority: 'CORE', intent: 'precio', orden: 0 })],
    });

    const result = composeBlock(newByIntent, []);

    expect(result.block).toHaveLength(1);
    expect(result.block[0].templateId).toBe('precio-core');
    expect(result.pending).toHaveLength(0);
    expect(result.dropped).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Case 2: Single intent, 5 templates (1 CORE, 2 COMP, 2 OPC)
  // -------------------------------------------------------------------------
  it('Case 2: single intent, 5 templates -> block capped at 3, OPC dropped', () => {
    const newByIntent = mapOf({
      precio: [
        tpl({ templateId: 'core', priority: 'CORE', intent: 'precio', orden: 0 }),
        tpl({ templateId: 'comp1', priority: 'COMPLEMENTARIA', intent: 'precio', orden: 1 }),
        tpl({ templateId: 'comp2', priority: 'COMPLEMENTARIA', intent: 'precio', orden: 2 }),
        tpl({ templateId: 'opc1', priority: 'OPCIONAL', intent: 'precio', orden: 3 }),
        tpl({ templateId: 'opc2', priority: 'OPCIONAL', intent: 'precio', orden: 4 }),
      ],
    });

    const result = composeBlock(newByIntent, []);

    expect(result.block).toHaveLength(3);
    // CORE selected first, then COMP by priority
    const blockIds = result.block.map((t) => t.templateId);
    expect(blockIds).toContain('core');
    expect(blockIds).toContain('comp1');
    expect(blockIds).toContain('comp2');

    expect(result.pending).toHaveLength(0); // No CORE/COMP overflow
    expect(result.dropped).toHaveLength(2);
    const droppedIds = result.dropped.map((t) => t.templateId);
    expect(droppedIds).toContain('opc1');
    expect(droppedIds).toContain('opc2');
  });

  // -------------------------------------------------------------------------
  // Case 3: 3 intents, 1 CORE each = cap exactly
  // -------------------------------------------------------------------------
  it('Case 3: 3 intents with 1 CORE each -> block fills exactly at cap', () => {
    const newByIntent = mapOf({
      precio: [tpl({ templateId: 'precio-core', priority: 'CORE', intent: 'precio', orden: 0 })],
      envio: [tpl({ templateId: 'envio-core', priority: 'CORE', intent: 'envio', orden: 0 })],
      pago: [tpl({ templateId: 'pago-core', priority: 'CORE', intent: 'pago', orden: 0 })],
    });

    const result = composeBlock(newByIntent, []);

    expect(result.block).toHaveLength(3);
    const blockIds = result.block.map((t) => t.templateId);
    expect(blockIds).toContain('precio-core');
    expect(blockIds).toContain('envio-core');
    expect(blockIds).toContain('pago-core');
    expect(result.pending).toHaveLength(0);
    expect(result.dropped).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Case 4: 3 intents with secondary templates -> secondary goes to pending
  // -------------------------------------------------------------------------
  it('Case 4: 3 intents with COMP secondaries -> CORE fills block, COMP to pending', () => {
    const newByIntent = mapOf({
      precio: [
        tpl({ templateId: 'precio-core', priority: 'CORE', intent: 'precio', orden: 0 }),
        tpl({ templateId: 'precio-comp', priority: 'COMPLEMENTARIA', intent: 'precio', orden: 1 }),
      ],
      envio: [
        tpl({ templateId: 'envio-core', priority: 'CORE', intent: 'envio', orden: 0 }),
        tpl({ templateId: 'envio-comp', priority: 'COMPLEMENTARIA', intent: 'envio', orden: 1 }),
      ],
      pago: [
        tpl({ templateId: 'pago-core', priority: 'CORE', intent: 'pago', orden: 0 }),
      ],
    });

    const result = composeBlock(newByIntent, []);

    expect(result.block).toHaveLength(3);
    const blockIds = result.block.map((t) => t.templateId);
    expect(blockIds).toContain('precio-core');
    expect(blockIds).toContain('envio-core');
    expect(blockIds).toContain('pago-core');

    expect(result.pending).toHaveLength(2);
    const pendingIds = result.pending.map((t) => t.templateId);
    expect(pendingIds).toContain('precio-comp');
    expect(pendingIds).toContain('envio-comp');

    expect(result.dropped).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Case 5: 4 intents -> excess intent goes to pending
  // -------------------------------------------------------------------------
  it('Case 5: 4 intents -> 4th intent entirely goes to pending', () => {
    const newByIntent = mapOf({
      precio: [tpl({ templateId: 'precio-core', priority: 'CORE', intent: 'precio', orden: 0 })],
      envio: [tpl({ templateId: 'envio-core', priority: 'CORE', intent: 'envio', orden: 0 })],
      pago: [tpl({ templateId: 'pago-core', priority: 'CORE', intent: 'pago', orden: 0 })],
      garantia: [
        tpl({ templateId: 'garantia-core', priority: 'CORE', intent: 'garantia', orden: 0 }),
        tpl({ templateId: 'garantia-comp', priority: 'COMPLEMENTARIA', intent: 'garantia', orden: 1 }),
      ],
    });

    const result = composeBlock(newByIntent, []);

    expect(result.block).toHaveLength(3);
    const blockIds = result.block.map((t) => t.templateId);
    expect(blockIds).toContain('precio-core');
    expect(blockIds).toContain('envio-core');
    expect(blockIds).toContain('pago-core');

    // 4th intent (garantia) entirely goes to pending
    expect(result.pending).toHaveLength(2);
    const pendingIds = result.pending.map((t) => t.templateId);
    expect(pendingIds).toContain('garantia-core');
    expect(pendingIds).toContain('garantia-comp');

    expect(result.dropped).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Case 6: Pending merge — pending CORE displaces new OPC
  // -------------------------------------------------------------------------
  it('Case 6: pending CORE merges into block alongside new templates', () => {
    const newByIntent = mapOf({
      precio: [
        tpl({ templateId: 'precio-core', priority: 'CORE', intent: 'precio', orden: 0 }),
        tpl({ templateId: 'precio-opc', priority: 'OPCIONAL', intent: 'precio', orden: 1 }),
      ],
    });
    const pending = [
      tpl({ templateId: 'envio-core', priority: 'CORE', intent: 'envio', orden: 0, isNew: false }),
    ];

    const result = composeBlock(newByIntent, pending);

    expect(result.block).toHaveLength(3);
    const blockIds = result.block.map((t) => t.templateId);
    expect(blockIds).toContain('precio-core');
    expect(blockIds).toContain('envio-core');
    expect(blockIds).toContain('precio-opc');
    expect(result.pending).toHaveLength(0);
    expect(result.dropped).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Case 7: Pending merge at cap — pending COMP takes slot, OPC dropped
  // -------------------------------------------------------------------------
  it('Case 7: pending COMP takes priority slot, OPC dropped', () => {
    const newByIntent = mapOf({
      precio: [
        tpl({ templateId: 'precio-core', priority: 'CORE', intent: 'precio', orden: 0 }),
        tpl({ templateId: 'precio-opc1', priority: 'OPCIONAL', intent: 'precio', orden: 1 }),
        tpl({ templateId: 'precio-opc2', priority: 'OPCIONAL', intent: 'precio', orden: 2 }),
      ],
    });
    const pending = [
      tpl({ templateId: 'envio-comp', priority: 'COMPLEMENTARIA', intent: 'envio', orden: 0, isNew: false }),
    ];

    const result = composeBlock(newByIntent, pending);

    expect(result.block).toHaveLength(3);
    const blockIds = result.block.map((t) => t.templateId);
    expect(blockIds).toContain('precio-core');
    expect(blockIds).toContain('envio-comp');
    expect(blockIds).toContain('precio-opc1');

    expect(result.pending).toHaveLength(0);
    expect(result.dropped).toHaveLength(1);
    expect(result.dropped[0].templateId).toBe('precio-opc2');
  });

  // -------------------------------------------------------------------------
  // Case 8: Deduplication — same template_id in new and pending
  // -------------------------------------------------------------------------
  it('Case 8: dedup — same template_id in new and pending -> single slot', () => {
    const newByIntent = mapOf({
      precio: [
        tpl({ templateId: 't1', priority: 'CORE', intent: 'precio', orden: 0, isNew: true }),
      ],
    });
    const pending = [
      tpl({ templateId: 't1', priority: 'CORE', intent: 'precio', orden: 0, isNew: false }),
    ];

    const result = composeBlock(newByIntent, pending);

    expect(result.block).toHaveLength(1);
    expect(result.block[0].templateId).toBe('t1');
    // Prefer pending version (isNew: false)
    expect(result.block[0].isNew).toBe(false);
    expect(result.pending).toHaveLength(0);
    expect(result.dropped).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Case 9: Tiebreaker — pending wins over new at same priority
  // -------------------------------------------------------------------------
  it('Case 9: tiebreaker — pending COMP sorted before new COMP at same priority', () => {
    const newByIntent = mapOf({
      precio: [
        tpl({ templateId: 't1', priority: 'COMPLEMENTARIA', intent: 'precio', orden: 0, isNew: true }),
      ],
    });
    const pending = [
      tpl({ templateId: 't2', priority: 'COMPLEMENTARIA', intent: 'envio', orden: 0, isNew: false }),
    ];

    const result = composeBlock(newByIntent, pending);

    expect(result.block).toHaveLength(2);
    // pending t2 should come before new t1 in the block
    expect(result.block[0].templateId).toBe('t2');
    expect(result.block[1].templateId).toBe('t1');
    expect(result.pending).toHaveLength(0);
    expect(result.dropped).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Case 10: Empty input
  // -------------------------------------------------------------------------
  it('Case 10: empty input -> empty result', () => {
    const result = composeBlock(new Map(), []);

    expect(result.block).toHaveLength(0);
    expect(result.pending).toHaveLength(0);
    expect(result.dropped).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Case 11: Only pending, no new
  // -------------------------------------------------------------------------
  it('Case 11: only pending, no new -> pending fills block', () => {
    const pending = [
      tpl({ templateId: 'p-core', priority: 'CORE', intent: 'a', orden: 0, isNew: false }),
      tpl({ templateId: 'p-comp', priority: 'COMPLEMENTARIA', intent: 'a', orden: 1, isNew: false }),
      tpl({ templateId: 'p-opc1', priority: 'OPCIONAL', intent: 'a', orden: 2, isNew: false }),
      tpl({ templateId: 'p-opc2', priority: 'OPCIONAL', intent: 'a', orden: 3, isNew: false }),
    ];

    const result = composeBlock(new Map(), pending);

    expect(result.block).toHaveLength(3);
    const blockIds = result.block.map((t) => t.templateId);
    expect(blockIds).toContain('p-core');
    expect(blockIds).toContain('p-comp');
    expect(blockIds).toContain('p-opc1');

    expect(result.pending).toHaveLength(0);
    expect(result.dropped).toHaveLength(1);
    expect(result.dropped[0].templateId).toBe('p-opc2');
  });

  // -------------------------------------------------------------------------
  // Additional edge cases
  // -------------------------------------------------------------------------

  describe('edge cases', () => {
    it('COMP overflow goes to pending, not dropped', () => {
      const newByIntent = mapOf({
        a: [
          tpl({ templateId: 'a-core', priority: 'CORE', intent: 'a', orden: 0 }),
          tpl({ templateId: 'a-comp1', priority: 'COMPLEMENTARIA', intent: 'a', orden: 1 }),
          tpl({ templateId: 'a-comp2', priority: 'COMPLEMENTARIA', intent: 'a', orden: 2 }),
          tpl({ templateId: 'a-comp3', priority: 'COMPLEMENTARIA', intent: 'a', orden: 3 }),
        ],
      });

      const result = composeBlock(newByIntent, []);

      expect(result.block).toHaveLength(3);
      // One COMP doesn't fit -> goes to pending (not dropped)
      expect(result.pending).toHaveLength(1);
      expect(result.pending[0].priority).toBe('COMPLEMENTARIA');
      expect(result.dropped).toHaveLength(0);
    });

    it('CORE overflow goes to pending, not dropped', () => {
      // 3 intents fill block with CORE, then a pending CORE overflows
      const newByIntent = mapOf({
        a: [tpl({ templateId: 'a-core', priority: 'CORE', intent: 'a', orden: 0 })],
        b: [tpl({ templateId: 'b-core', priority: 'CORE', intent: 'b', orden: 0 })],
        c: [tpl({ templateId: 'c-core', priority: 'CORE', intent: 'c', orden: 0 })],
      });
      const pending = [
        tpl({ templateId: 'p-core', priority: 'CORE', intent: 'd', orden: 0, isNew: false }),
      ];

      const result = composeBlock(newByIntent, pending);

      expect(result.block).toHaveLength(3);
      // The pending CORE that didn't fit goes back to pending
      expect(result.pending).toHaveLength(1);
      expect(result.pending[0].templateId).toBe('p-core');
      expect(result.dropped).toHaveLength(0);
    });

    it('mixed OPC from excess intent: OPC dropped, CORE/COMP to pending', () => {
      // 4 intents, 4th has CORE + OPC
      const newByIntent = mapOf({
        a: [tpl({ templateId: 'a-core', priority: 'CORE', intent: 'a', orden: 0 })],
        b: [tpl({ templateId: 'b-core', priority: 'CORE', intent: 'b', orden: 0 })],
        c: [tpl({ templateId: 'c-core', priority: 'CORE', intent: 'c', orden: 0 })],
        d: [
          tpl({ templateId: 'd-core', priority: 'CORE', intent: 'd', orden: 0 }),
          tpl({ templateId: 'd-opc', priority: 'OPCIONAL', intent: 'd', orden: 1 }),
        ],
      });

      const result = composeBlock(newByIntent, []);

      // Excess intent 'd' goes entirely to pending/dropped
      // CORE from excess intent -> pending, OPC from excess intent -> dropped
      const pendingIds = result.pending.map((t) => t.templateId);
      const droppedIds = result.dropped.map((t) => t.templateId);
      expect(pendingIds).toContain('d-core');
      expect(droppedIds).toContain('d-opc');
    });

    it('custom maxBlockSize overrides default', () => {
      const newByIntent = mapOf({
        a: [
          tpl({ templateId: 'a-core', priority: 'CORE', intent: 'a', orden: 0 }),
          tpl({ templateId: 'a-comp', priority: 'COMPLEMENTARIA', intent: 'a', orden: 1 }),
        ],
      });

      const result = composeBlock(newByIntent, [], 1);

      expect(result.block).toHaveLength(1);
      expect(result.block[0].templateId).toBe('a-core');
      expect(result.pending).toHaveLength(1);
      expect(result.pending[0].templateId).toBe('a-comp');
    });

    it('dedup prefers pending version at same priority', () => {
      const newByIntent = mapOf({
        precio: [
          tpl({ templateId: 'shared-id', priority: 'COMPLEMENTARIA', intent: 'precio', orden: 0, isNew: true, content: 'new-version' }),
        ],
      });
      const pending = [
        tpl({ templateId: 'shared-id', priority: 'COMPLEMENTARIA', intent: 'precio', orden: 0, isNew: false, content: 'pending-version' }),
      ];

      const result = composeBlock(newByIntent, pending);

      expect(result.block).toHaveLength(1);
      expect(result.block[0].isNew).toBe(false);
      expect(result.block[0].content).toBe('pending-version');
    });

    it('5 intents -> first 3 selected, last 2 overflow', () => {
      const newByIntent = mapOf({
        a: [tpl({ templateId: 'a-core', priority: 'CORE', intent: 'a', orden: 0 })],
        b: [tpl({ templateId: 'b-core', priority: 'CORE', intent: 'b', orden: 0 })],
        c: [tpl({ templateId: 'c-core', priority: 'CORE', intent: 'c', orden: 0 })],
        d: [tpl({ templateId: 'd-core', priority: 'CORE', intent: 'd', orden: 0 })],
        e: [tpl({ templateId: 'e-core', priority: 'CORE', intent: 'e', orden: 0 })],
      });

      const result = composeBlock(newByIntent, []);

      expect(result.block).toHaveLength(3);
      // Excess intents d, e go to pending
      expect(result.pending).toHaveLength(2);
      const pendingIds = result.pending.map((t) => t.templateId);
      expect(pendingIds).toContain('d-core');
      expect(pendingIds).toContain('e-core');
    });

    it('returns proper type structure (BlockCompositionResult)', () => {
      const result = composeBlock(new Map(), []);

      expect(result).toHaveProperty('block');
      expect(result).toHaveProperty('pending');
      expect(result).toHaveProperty('dropped');
      expect(Array.isArray(result.block)).toBe(true);
      expect(Array.isArray(result.pending)).toBe(true);
      expect(Array.isArray(result.dropped)).toBe(true);
    });
  });
});
