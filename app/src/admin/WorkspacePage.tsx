import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { workspaceByKey } from './workspaces';
import { PAGE_COMPONENTS } from './pages/registry';

export function WorkspacePage() {
  const { workspace } = useParams();
  const ws = workspace ? workspaceByKey(workspace) : null;
  const [active, setActive] = useState(ws?.tabs[0]?.key ?? '');

  if (!ws) return <div className="content"><p style={{ padding: 24 }}>Unknown workspace.</p></div>;
  const tab = ws.tabs.find((t) => t.key === active) ?? ws.tabs[0];
  const Ported = PAGE_COMPONENTS[tab.page];

  return (
    <div className="content" style={{ padding: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {ws.tabs.length > 1 && (
        <div className="ws-tabs">
          {ws.tabs.map((t) => (
            <button key={t.key} className={'ws-tab' + (t.key === active ? ' on' : '')} onClick={() => setActive(t.key)}>{t.label}</button>
          ))}
        </div>
      )}
      {Ported ? <Ported /> : (
        <div style={{ padding: '28px 22px' }}>
          <div className="sec-head"><h1>{ws.label}{ws.tabs.length > 1 ? ` · ${tab.label}` : ''}</h1></div>
          <div className="card" style={{ padding: 24, marginTop: 8 }}>
            <p style={{ color: 'var(--muted)' }}>
              This page (<code>{tab.page}</code>) is next to port from <code>admin-{tab.page}.html</code>.
              The shell, auth, API client and mobile layout are ready, so it is a focused component build.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
