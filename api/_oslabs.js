// TMI OS — "labs" gate. Some engines are fully built and authenticated but not
// yet wired into the product UI (the connector vault, the tool bridge, the
// workflow engine, the action log, customer memory). Until they are wired, they
// are dead-ended attack surface, so their HTTP endpoints are closed by default
// and only open when OS_ENABLE_LABS=1 is set in the environment. The underlying
// modules stay importable for server-side use; only the public endpoints gate.
//
// Returns true and writes a 404 when the endpoint should be closed; the handler
// should `if (labsClosed(res)) return;` right after its OPTIONS check.
function labsClosed(res) {
  if (process.env.OS_ENABLE_LABS === '1') return false;
  res.status(404).json({ error: 'Not found' });
  return true;
}

module.exports = { labsClosed };
