import { useState } from 'react';
import { useRecorder } from '../lib/useRecorder';
import { useToast } from '../lib/toast';

export function RecordModal({ onClose }: { onClose: () => void }) {
  const rec = useRecorder();
  const toast = useToast();
  const [name, setName] = useState('');
  const [saved, setSaved] = useState(false);

  async function toggle() {
    if (rec.recording) { const out = await rec.stop(); setSaved(!!out); if (out) toast('Recording saved'); return; }
    setSaved(false);
    const sid = await rec.start({ entity: name ? { type: 'quick', label: name, company: name } : null, title: name || 'Quick interaction' });
    if (!sid) toast('Could not start. Check mic permission.', 'error');
  }
  function close() { if (rec.recording) { toast('Stop the recording first', 'error'); return; } onClose(); }
  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div id="qa-rec" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="qa-rec-card">
        <div className="qa-rec-head"><span>Record interaction</span><button aria-label="Close" onClick={close}>✕</button></div>
        <input className="form-input" placeholder="Who / company (optional)" value={name} onChange={(e) => setName(e.target.value)} disabled={rec.recording} />
        <div className="qa-rec-status">
          <span id="qa-rec-dot" className={rec.recording ? 'on' : ''} /><span>{fmt(rec.seconds)}</span>
          {saved && <span id="qa-rec-saved">Saved</span>}
        </div>
        <div className="qa-rec-tx">{rec.transcript || 'Tap Start. Every few seconds is saved, so nothing is lost if your phone dies.'}</div>
        <div className="qa-rec-actions"><button className="btn btn-primary" onClick={toggle}>{rec.recording ? '■ Stop' : 'Start'}</button></div>
      </div>
    </div>
  );
}
