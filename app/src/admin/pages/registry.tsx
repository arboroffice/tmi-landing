import type { ComponentType } from 'react';
import { LeadsPage } from './LeadsPage';
import { ClientsPage } from './ClientsPage';
import { ProposalsPage } from './ProposalsPage';
import { MeetingsPage } from './MeetingsPage';
import { DashboardPage } from './DashboardPage';

// page id (workspaces.ts tab.page) -> ported React component.
// Anything not listed still shows the migration placeholder.
export const PAGE_COMPONENTS: Record<string, ComponentType> = {
  dashboard: DashboardPage,
  leads: LeadsPage,
  clients: ClientsPage,
  proposals: ProposalsPage,
  meetings: MeetingsPage,
};
