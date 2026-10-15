export function pending(task) {
  console.warn(`ещё не реализовано: ${task}`);
}
if (process.argv[1]?.endsWith('pending.mjs')) pending(process.argv[2] ?? 'W0');
