/**
 * Prevents overlapping async submits (double-tap / double-click).
 */
export function createSubmitGuard() {
  let locked = false;

  return {
    isLocked() {
      return locked;
    },
    /**
     * @template T
     * @param {() => Promise<T>} fn
     * @returns {Promise<{ skipped: true } | { skipped: false, result: T }>}
     */
    async run(fn) {
      if (locked) return { skipped: true };
      locked = true;
      try {
        const result = await fn();
        return { skipped: false, result };
      } finally {
        locked = false;
      }
    },
    lock() {
      locked = true;
    },
    unlock() {
      locked = false;
    },
  };
}
