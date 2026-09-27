// Simple throttle implementation (leading edge)

/**
 * Creates a throttled version of `fn` that will be invoked at most once every `wait` ms.
 * Subsequent calls within the wait period are ignored.
 * @param {Function} fn - Function to throttle.
 * @param {number} wait - Milliseconds to wait between calls.
 * @returns {Function}
 */
function throttle(fn, wait) {
  let last = 0;
  return function (...args) {
    const now = Date.now();
    if (now - last >= wait) {
      last = now;
      fn.apply(this, args);
    }
  };
}

module.exports = { throttle };
