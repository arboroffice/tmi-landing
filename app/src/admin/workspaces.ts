// The 13 admin workspaces. Each becomes a React route (/admin/:key) with tabs.
// Kept in sync with the static site's admin-shared.js WORKSPACES during migration.
export interface Tab { key: string; label: string; page: string } // page = api-backed page id to port
export interface Workspace { key: string; label: string; tabs: Tab[] }

export const WORKSPACES: Workspace[] = [
  { key: 'home', label: 'Home', tabs: [
    { key: 'dashboard', label: 'Dashboard', page: 'dashboard' },
    { key: 'brief', label: 'Brief', page: 'brief' },
    { key: 'worklist', label: 'Today', page: 'worklist' },
    { key: 'command', label: 'Command', page: 'command' },
    { key: 'flywheel', label: 'Flywheel', page: 'flywheel' },
  ] },
  { key: 'sales', label: 'Sales', tabs: [
    { key: 'sales', label: 'Pipeline', page: 'sales' },
    { key: 'leads', label: 'Leads', page: 'leads' },
    { key: 'proposals', label: 'Proposals', page: 'proposals' },
    { key: 'cockpit', label: 'Cockpit', page: 'cockpit' },
    { key: 'meetings', label: 'Meetings', page: 'meetings' },
    { key: 'campaign', label: 'Campaigns', page: 'campaign' },
  ] },
  { key: 'outbound', label: 'Outbound', tabs: [
    { key: 'outbound', label: 'Sequences', page: 'outbound' },
    { key: 'prospect', label: 'Prospecting', page: 'prospect' },
    { key: 'signals', label: 'Signals', page: 'signals' },
    { key: 'visitors', label: 'Visitors', page: 'visitors' },
    { key: 'call-tasks', label: 'Call Queue', page: 'call-tasks' },
    { key: 'lifecycle', label: 'Lifecycle', page: 'lifecycle' },
  ] },
  { key: 'inbox', label: 'Inbox', tabs: [
    { key: 'inbox', label: 'Applications', page: 'inbox' },
    { key: 'assessment', label: 'Assessments', page: 'assessment' },
  ] },
  { key: 'clients', label: 'Clients', tabs: [
    { key: 'clients', label: 'Clients', page: 'clients' },
    { key: 'retention-plan', label: 'Retention', page: 'retention-plan' },
    { key: 'account', label: 'Account 360', page: 'account' },
  ] },
  { key: 'delivery', label: 'Delivery', tabs: [
    { key: 'work', label: 'Projects & Invoices', page: 'work' },
    { key: 'documents', label: 'Documents', page: 'documents' },
    { key: 'os-clients', label: 'Client OS', page: 'os-clients' },
    { key: 'payments', label: 'Payments', page: 'payments' },
    { key: 'onboarding', label: 'Onboarding', page: 'onboarding' },
    { key: 'university', label: 'University', page: 'university' },
  ] },
  { key: 'people', label: 'People', tabs: [{ key: 'people', label: 'People', page: 'people' }] },
  { key: 'comms', label: 'Comms', tabs: [
    { key: 'comms', label: 'Email & SMS', page: 'comms' },
    { key: 'email-compose', label: 'Compose', page: 'email-compose' },
  ] },
  { key: 'content', label: 'Content', tabs: [
    { key: 'content', label: 'Letters & Ideas', page: 'content-hub' },
    { key: 'content-compose', label: 'Compose', page: 'content-compose' },
    { key: 'newsletter', label: 'Newsletter', page: 'newsletter' },
    { key: 'brand-plan', label: 'Brand Plan', page: 'brand-plan' },
    { key: 'webinar', label: 'Weekly Class', page: 'webinar' },
  ] },
  { key: 'intelligence', label: 'Intelligence', tabs: [
    { key: 'reports', label: 'Reports', page: 'reports' },
    { key: 'company-intelligence', label: 'Company Intel', page: 'company-intelligence' },
    { key: 'financial-model', label: 'Financial Model', page: 'financial-model' },
    { key: 'seo', label: 'SEO', page: 'seo' },
  ] },
  { key: 'cityleads', label: 'City Leads', tabs: [
    { key: 'city-leads', label: 'Applications', page: 'city-leads' },
    { key: 'cityleads-team', label: 'City Team', page: 'cityleads-team' },
    { key: 'city-sop', label: 'SOP Library', page: 'city-sop' },
    { key: 'venture', label: 'Venture Studio', page: 'venture' },
  ] },
  { key: 'automation', label: 'Automation', tabs: [
    { key: 'agents', label: 'Agent Builder', page: 'agents' },
    { key: 'system', label: 'System', page: 'system' },
  ] },
  { key: 'settings', label: 'Settings', tabs: [{ key: 'settings', label: 'Settings', page: 'settings' }] },
];

export const workspaceByKey = (key: string) => WORKSPACES.find((w) => w.key === key);
