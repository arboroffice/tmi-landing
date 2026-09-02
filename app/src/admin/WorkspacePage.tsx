import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { workspaceByKey } from './workspaces';

// Foundation placeholder: renders the workspace's real tab bar, and a body that
// each ported page will fill. During migration a tab's body is swapped from
// this placeholder to a real React page component.
export function WorkspacePage() {
  const { workspace } = useParams();
  const ws = workspace ? workspaceByKey(workspace) : null;
  const [active, setActive] = useState(ws?.tabs[0]?.key ?? '');

  if (!ws) return <div className="content"><p>Unknown workspace.</p></div>;
  const tab = ws.tabs.find((t) => t.key === active) ?? ws.tabs[0];

  return (
    <div className="content" style={{ padding: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {ws.tabs.length > 1 && (
        <div className="ws-tabs">
          {ws.tabs.map((t) => (
            <button key={t.key} className={'ws-tab' + (t.key === active ? ' on' : '')} onClick={() => setActive(t.key)}>{t.label}</button>
          ))}
        </div>
      )}
      <div style={{ padding: '28px 32px' }}>
        <div className="sec-head"><h1>{ws.label}{ws.tabs.length > 1 ? ` · ${tab.label}` : ''}</h1></div>
        <div className="card" style={{ padding: 28, marginTop: 8 }}>
          <p style={{ color: 'var(--muted)' }}>
            React foundation is live. This page (<code>{tab.page}</code>) still needs porting from the
            static <code>admin-{tab.page}.html</code>. The shared layer (auth, API client, recorder, layout,
            routing) is ready, so porting it is now a focused component build.
          </p>
        </div>
      </div>
    </div>
  );
}
