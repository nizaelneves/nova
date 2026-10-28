import { describe, expect, it } from 'vitest';
import { DOC_BUDGET_CHARS, fileContext } from './docContext';

const file = (name: string, markdown: string) => ({ id: name, name, markdown, addedAt: 0 });

describe('files of a conversation, as seen by the model', () => {
  it('sends nothing when there are no files', () => {
    expect(fileContext(undefined, 'oi')).toBe('');
    expect(fileContext([], 'oi')).toBe('');
  });

  it('sends a small file whole', () => {
    expect(fileContext([file('nota.md', '# Nota\ncorpo')], 'o que diz?')).toContain('# Nota\ncorpo');
  });

  it('never goes past the budget, and keeps the parts that match the question', () => {
    const filler = Array.from({ length: 60 }, (_, i) => `Parágrafo de enchimento número ${i} sem relação com nada.`).join('\n\n');
    const big = `${filler}\n\nO prazo da entrega do contrato é 15 de março.\n\n${filler}`;
    const out = fileContext([file('contrato.md', big)], 'qual o prazo da entrega do contrato?');
    expect(out).toContain('15 de março');
    expect(out.length).toBeLessThan(DOC_BUDGET_CHARS + 400);
  });

  it('shares the budget between several files', () => {
    const a = 'a'.repeat(6000);
    const b = 'b'.repeat(6000);
    const out = fileContext([file('a.md', a), file('b.md', b)], 'x');
    expect(out).toContain('a.md');
    expect(out).toContain('b.md');
    expect(out.length).toBeLessThan(DOC_BUDGET_CHARS + 600);
  });
});
