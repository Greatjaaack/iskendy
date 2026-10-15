/** Only unprivileged loopback origins; manual comparison ports are reserved. */
export function realTestOrigin(address = 'http://127.0.0.1:8104') {
  let url;
  try {
    url = new URL(address);
  } catch {
    throw new Error('Invalid local integration origin.');
  }
  if (
    url.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost'].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    !url.port ||
    Number(url.port) < 1024 ||
    Number(url.port) > 65535 ||
    ['5180', '5181', '5182'].includes(url.port)
  ) {
    throw new Error(
      'Integration origin must be an unprivileged local test port; comparison previews are reserved.',
    );
  }
  return { origin: `http://127.0.0.1:${url.port}`, port: url.port };
}
export const backendRepository = 'https://github.com/Greatjaaack/iskendy.git';
/** Missing pinned checkout (e.g. a cleaned /tmp) is cloned fresh; an existing folder is never touched. */
export function ensureBackendReference(reference, commit, { exists, git }) {
  if (exists(reference)) return 'existing';
  git(['clone', '--quiet', '--no-checkout', backendRepository, reference]);
  git(['-C', reference, 'checkout', '--quiet', '--detach', commit]);
  return 'cloned';
}
