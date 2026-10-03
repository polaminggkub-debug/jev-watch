import { EXIT } from '../features/watch/index.js';
import { resume, startCommand, startLog } from './commands.js';
import { parseCli } from './options.js';
import { triage } from './triage.js';
import { USAGE, UsageError } from './usage.js';

async function dispatch(argv) {
  const { values, positionals, cmd } = parseCli(argv);
  if (values.help || !argv.length) {
    console.log(USAGE);
    return EXIT.done;
  }
  if (values.triage) return triage(values, positionals);
  if (values.resume) return resume(values, positionals);
  if (values.log) return startLog(values);
  return startCommand(values, cmd);
}

export async function main(argv) {
  try {
    return await dispatch(argv);
  } catch (err) {
    if (err instanceof UsageError) {
      console.error(`${err.message}\n\n${USAGE}`);
      return EXIT.usage;
    }
    console.error(`jev-watch: ${err.message}`);
    return EXIT.failed;
  }
}
