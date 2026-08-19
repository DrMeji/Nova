/** Named no-op for cleanup/best-effort paths — never hide user-facing failures with this. */

function ignoreCleanup(err) {
  void err;
}

function tryCleanup(fn) {
  try {
    fn();
  } catch (err) {
    ignoreCleanup(err);
  }
}

module.exports = { ignoreCleanup, tryCleanup };
