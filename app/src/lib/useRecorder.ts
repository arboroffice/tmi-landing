import { useCallback, useRef, useState } from 'react';
import { api } from './api';

// Resilient recorder hook: audio is rolled into short complete segments, each
// uploaded to storage AND transcribed (Deepgram, server-side) as it is
// captured, so a phone dying mid-recording loses at most the last segment.
// Mirrors the static site's TMIAdmin.recorder, as a React hook.

interface Entity { type: string; id?: string; company?: string; label?: string }
interface StartOpts { entity?: Entity | null; title?: string | null; sales_stage?: string | null }

const SEG_MS = 20000;

export function useRecorder() {
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [seconds, setSeconds] = useState(0);

  const sessionId = useRef<string | null>(null);
  const seq = useRef(0);
  const stream = useRef<MediaStream | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const mime = useRef('audio/webm');
  const rollTimer = useRef<number | null>(null);
  const tickTimer = useRef<number | null>(null);
  const wakeLock = useRef<WakeLockSentinel | null>(null);
  const t0 = useRef(0);

  const flush = useCallback(async (blob: Blob) => {
    const s = seq.current++;
    const sid = sessionId.current;
    if (!sid) return;
    const ext = mime.current.includes('mp4') ? 'm4a' : 'webm';
    try {
      const up = await api.post<{ path: string; upload_url: string }>('/api/storage', {
        action: 'upload-url', filename: `seg-${String(s).padStart(4, '0')}.${ext}`,
        content_type: mime.current, folder: `recordings/${sid}`,
      });
      if (!up?.upload_url) return;
      await fetch(up.upload_url, { method: 'PUT', headers: { 'Content-Type': mime.current }, body: blob });
      const r = await api.post<{ transcript: string }>('/api/rec-session', {
        action: 'segment', session_id: sid, seq: s, path: up.path, mime: mime.current, duration: SEG_MS / 1000,
      });
      if (r?.transcript != null) setTranscript(r.transcript);
    } catch { /* best-effort; audio may already be in storage for recovery */ }
  }, []);

  const startSegment = useCallback(() => {
    if (!stream.current) return;
    try {
      const mr = new MediaRecorder(stream.current, { mimeType: mime.current });
      mr.ondataavailable = (e) => { if (e.data && e.data.size) flush(e.data); };
      mr.start();
      rec.current = mr;
    } catch { /* ignore */ }
  }, [flush]);

  const start = useCallback(async (opts: StartOpts = {}) => {
    if (recording) return null;
    let session: { id: string } | null = null;
    try { session = await api.post<{ id: string }>('/api/rec-session', { action: 'start', ...opts }); } catch { return null; }
    if (!session?.id) return null;
    sessionId.current = session.id; seq.current = 0; t0.current = Date.now();
    try { stream.current = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { sessionId.current = null; return null; }
    mime.current = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
      .find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || 'audio/webm';
    try { if ('wakeLock' in navigator) wakeLock.current = await navigator.wakeLock.request('screen'); } catch { /* ignore */ }
    setRecording(true); setTranscript(''); setSeconds(0);
    startSegment();
    rollTimer.current = window.setInterval(() => {
      if (rec.current && rec.current.state !== 'inactive') { try { rec.current.stop(); } catch { /* ignore */ } }
      startSegment();
    }, SEG_MS);
    tickTimer.current = window.setInterval(() => setSeconds(Math.floor((Date.now() - t0.current) / 1000)), 500);
    return session.id;
  }, [recording, startSegment]);

  const stop = useCallback(async () => {
    if (!recording) return null;
    setRecording(false);
    if (rollTimer.current) clearInterval(rollTimer.current);
    if (tickTimer.current) clearInterval(tickTimer.current);
    if (rec.current && rec.current.state !== 'inactive') { try { rec.current.stop(); } catch { /* ignore */ } }
    try { stream.current?.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
    try { await wakeLock.current?.release(); } catch { /* ignore */ }
    wakeLock.current = null;
    const dur = Math.floor((Date.now() - t0.current) / 1000);
    await new Promise((r) => setTimeout(r, 1400));
    const sid = sessionId.current;
    let out = { session_id: sid, transcript, duration_sec: dur };
    try {
      const s = await api.post<{ transcript: string }>('/api/rec-session', { action: 'stop', session_id: sid, duration_sec: dur });
      out = { session_id: sid, transcript: s?.transcript || transcript, duration_sec: dur };
      setTranscript(out.transcript);
    } catch { /* keep what we have */ }
    sessionId.current = null; seq.current = 0;
    return out;
  }, [recording, transcript]);

  return { recording, transcript, seconds, start, stop };
}
