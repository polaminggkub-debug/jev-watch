export const USAGE = `jev-watch: watch a coding agent, stop it when it loops, stalls or drifts

  jev-watch [options] -- <command...>        run and watch a worker
  jev-watch --resume <runId> "<message>"     continue a stopped run's session
  jev-watch --log <file> [--pid N] --task T  watch a log another script writes
  jev-watch --triage --task T <file|dir...>  which files must the agent read? (read / skim / skip)

Options:
  --task <text>          what the worker should do (default: the command's prompt)
  --interval <sec>       seconds between checks (45)
  --threshold <p>        Jev confidence that counts as a problem (0.8)
  --strikes <n>          Jev problems in a row before stopping (2)
  --repeat <n>           checks the same error must appear in (3)
  --idle-min <m>         minutes without output before stopping (10)
  --no-change-min <m>    minutes without file changes before stopping (20)
  --max-resumes <n>      corrections before asking the user (3)
  --no-jev               rules only, no API calls
  --skip-at <p>          triage: Jev confidence needed to skip a file (0.8)
  --json                 triage: print JSON instead of lines
  --verbose              also print the worker's output

Key: JEV_WATCH_API_KEY, else OPENROUTER_API_KEY, else TYPESAFE_API_KEY.
Exit: 0 done · 1 worker failed · 2 stopped by the watcher · 3 out of resumes · 64 usage`;

export class UsageError extends Error {}
