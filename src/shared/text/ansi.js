// Terminal colour codes carry no meaning for error matching or reports.
// eslint-disable-next-line no-control-regex -- ESC is exactly what we strip
const ANSI = /\x1b\[[0-9;]*m/g;

export function stripAnsi(text) {
  return text.replace(ANSI, '');
}
