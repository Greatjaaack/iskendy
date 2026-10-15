import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { mountApp } from '../../src/app/mount';
import { bootstrapError } from '../../src/content/bootstrap';

vi.mock('react-dom/client', () => ({
  createRoot: vi.fn(() => ({ render: vi.fn() })),
}));
beforeEach(() => {
  document.body.replaceChildren();
});
describe('app mount', () => {
  it('fails safely without the expected root', () => {
    expect(() => mountApp()).toThrow('Missing app root');
    expect(createRoot).not.toHaveBeenCalled();
    expect(bootstrapError.action).toBe('Обновить');
  });
  it('mounts React only in its app root', () => {
    const root = document.createElement('div');
    root.id = 'root';
    document.body.append(root);
    mountApp();
    expect(createRoot).toHaveBeenCalledWith(root);
    expect(
      vi.mocked(createRoot).mock.results[0]?.value.render,
    ).toHaveBeenCalledOnce();
  });
});
