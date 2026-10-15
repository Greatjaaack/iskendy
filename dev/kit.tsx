import { createRoot } from 'react-dom/client';
import type { ComponentType } from 'react';
import '../src/styles/global.css';

const stories = import.meta.glob<{ default: ComponentType }>(
  '../src/ui/**/*.stories.tsx',
  { eager: true },
);
const root = document.getElementById('kit');
if (!root) throw new Error('Missing component kit root');
createRoot(root).render(
  <main>
    <h1>Витрина компонентов</h1>
    <p>
      Технический стенд. Продуктовые компоненты добавляются после сверки с
      Figma.
    </p>
    {Object.entries(stories).map(([path, module]) => (
      <section key={path}>
        <h2>{path}</h2>
        <module.default />
      </section>
    ))}
  </main>,
);
