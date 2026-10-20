import '../styles/global.css';
import { createElement, StrictMode, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

export async function mountApp(pathname = location.pathname): Promise<void> {
  const root = document.getElementById('root');
  if (!root) throw new Error('Missing app root');
  // The hall TV gets its own small tree; guests never download it.
  const view: ReactElement =
    pathname === '/tv'
      ? createElement((await import('./TvApp')).TvApp)
      : createElement(App);
  createRoot(root).render(createElement(StrictMode, null, view));
}
