/**
 * Simple logger utility to prepend timestamps to logs.
 */
function log(...args) {
  const timestamp = new Date().toISOString();
  console.log(timestamp, ...args);
}

export { log };
