import '@fontsource/onest/cyrillic-400.css';
import '@fontsource/rubik/cyrillic-700.css';
import '../src/styles/tokens.css';
import './scenarios.css';
import { manualPresets } from './manual-presets';
const nav = document.querySelector('#scenarios')!;
if (import.meta.env.MODE === 'mock') {
  for (const [key, preset] of Object.entries(manualPresets)) {
    const link = document.createElement('a');
    link.href = '/dev/scenario.html?preset=' + encodeURIComponent(key);
    link.textContent = preset.label;
    nav.append(link);
  }
} else location.replace('/');
