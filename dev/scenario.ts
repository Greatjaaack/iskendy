import { manualPresets } from './manual-presets';
// Explicit mock-only scenario link. The app is the ordinary top-level page.
const preset = new URL(location.href).searchParams.get('preset');
if (
  import.meta.env.MODE === 'mock' &&
  preset !== null &&
  Object.hasOwn(manualPresets, preset)
) {
  sessionStorage.setItem('iskendy_linked_manual_preset', preset);
  sessionStorage.setItem('iskendy_linked_manual_seed', '1');
  location.replace(manualPresets[preset as keyof typeof manualPresets].route);
} else location.replace('/');
