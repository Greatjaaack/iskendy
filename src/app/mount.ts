import '../styles/global.css';
import { createElement, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

export function mountApp(): void {
  const root = document.getElementById('root');
  if (!root) throw new Error('Missing app root');
  createRoot(root).render(createElement(StrictMode, null, createElement(App)));
}
