// Fake worker. Mode from argv[2]: ok, fail, loop, chatty.
const mode = process.argv[2];
const tick = (fn, ms) => setInterval(fn, ms);
if (mode === 'ok') {
  console.log('working on it');
  setTimeout(() => { console.log('all done'); process.exit(0); }, 150);
} else if (mode === 'fail') {
  console.error('fatal: something broke');
  process.exit(1);
} else if (mode === 'loop') {
  tick(() => console.log(`Error: Cannot find module '@/entities/order' at line ${Date.now() % 1000}`), 30);
} else if (mode === 'loop-finite') {
  let n = 0;
  const timer = tick(() => {
    console.log(`Error: Cannot find module '@/entities/order' at line ${n++}`);
    if (n === 12) clearInterval(timer);
  }, 20);
} else if (mode === 'chatty') {
  let n = 0;
  tick(() => console.log(`step ${n++}: reading files`), 30);
}
