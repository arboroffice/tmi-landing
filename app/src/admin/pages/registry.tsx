import type { ComponentType } from 'react';
import { LeadsPage } from './LeadsPage';

// page id (from workspaces.ts tab.page) -> ported React component.
// Everything not listed here still shows the migration placeholder.
export const PAGE_COMPONENTS: Record<string, ComponentType> = {
  leads: LeadsPage,
};
