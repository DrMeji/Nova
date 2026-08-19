/** Central ARK port and loopback config — single source for main process. */

module.exports = {
  BRAIN_PORT_BASE: 8787,
  BRAIN_PORT_MAX_TRIES: 10,
  GGUF_SERVER_PORT_BASE: 8788,
  GGUF_SERVER_PORT_MAX_TRIES: 10,
  OAUTH_CALLBACK_PORT: 17887,
  BRAIN_HOST: '127.0.0.1',
  MAX_BRAIN_BODY_BYTES: 2 * 1024 * 1024,
  MAX_BRAIN_CONCURRENT: 4,
};
