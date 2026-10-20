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
  it('fails safely without the expected root', async () => {
    await expect(mountApp()).rejects.toThrow('Missing app root');
    expect(createRoot).not.toHaveBeenCalled();
    expect(bootstrapError.action).toBe('Обновить');
  });
  it('mounts React only in its app root', async () => {
    const root = document.createElement('div');
    root.id = 'root';
    document.body.append(root);
    await mountApp('/');
    expect(createRoot).toHaveBeenCalledWith(root);
    expect(
      vi.mocked(createRoot).mock.results[0]?.value.render,
    ).toHaveBeenCalledOnce();
  });
  it('mounts the hall TV tree on /tv instead of the guest app', async () => {
    const root = document.createElement('div');
    root.id = 'root';
    document.body.append(root);
    await mountApp('/tv');
    const render = vi.mocked(createRoot).mock.results.at(-1)?.value.render;
    const tree = render.mock.calls[0][0];
    expect(tree.props.children.type.name).toBe('TvApp');
  });
});
