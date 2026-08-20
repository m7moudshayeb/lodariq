/** Fixture data for Meridian. Dense on purpose: lists are where targeting breaks. */

export interface Project {
  id: string;
  name: string;
  owner: string;
  hue: number;
  status: 'Active' | 'At risk' | 'Blocked' | 'Done';
  progress: number;
  updated: string;
  team: string;
  createdAt: number;
}

export interface Member {
  id: string;
  name: string;
  hue: number;
  role: 'Owner' | 'Admin' | 'Member' | 'Viewer';
  email: string;
  presence: string;
}

export const PROJECTS: Project[] = [
  { id: 'p1', name: 'Website refresh', owner: 'D. Okonkwo', hue: 180, status: 'Active', progress: 78, updated: '2h ago', team: 'Marketing', createdAt: 8 },
  { id: 'p2', name: 'Q3 pricing model', owner: 'M. Haddad', hue: 280, status: 'Active', progress: 41, updated: 'Yesterday', team: 'Finance', createdAt: 7 },
  { id: 'p3', name: 'Mobile onboarding', owner: 'R. Silva', hue: 24, status: 'At risk', progress: 22, updated: '3d ago', team: 'Product', createdAt: 6 },
  { id: 'p4', name: 'Data migration', owner: 'A. Petrov', hue: 200, status: 'Active', progress: 64, updated: '1w ago', team: 'Platform', createdAt: 5 },
  { id: 'p5', name: 'Partner portal', owner: 'S. Njoku', hue: 140, status: 'Blocked', progress: 9, updated: '1w ago', team: 'Product', createdAt: 4 },
  { id: 'p6', name: 'Compliance audit', owner: 'L. Chen', hue: 320, status: 'Done', progress: 100, updated: '2w ago', team: 'Legal', createdAt: 3 },
  { id: 'p7', name: 'Design system v3', owner: 'D. Okonkwo', hue: 180, status: 'Active', progress: 55, updated: '3w ago', team: 'Product', createdAt: 2 },
  { id: 'p8', name: 'Churn analysis', owner: 'M. Haddad', hue: 280, status: 'Active', progress: 33, updated: '1mo ago', team: 'Growth', createdAt: 1 },
];

export const MEMBERS: Member[] = [
  { id: 'm1', name: 'Mahmoud Shayeb', hue: 210, role: 'Owner', email: 'you@meridian.io', presence: 'online' },
  { id: 'm2', name: 'Dina Okonkwo', hue: 180, role: 'Admin', email: 'dina@meridian.io', presence: 'online' },
  { id: 'm3', name: 'Maya Haddad', hue: 280, role: 'Admin', email: 'maya@meridian.io', presence: 'online' },
  { id: 'm4', name: 'Rafa Silva', hue: 24, role: 'Member', email: 'rafa@meridian.io', presence: '2h ago' },
  { id: 'm5', name: 'Anya Petrov', hue: 200, role: 'Member', email: 'anya@meridian.io', presence: 'yesterday' },
  { id: 'm6', name: 'Sola Njoku', hue: 140, role: 'Member', email: 'sola@meridian.io', presence: '3d ago' },
  { id: 'm7', name: 'Lin Chen', hue: 320, role: 'Viewer', email: 'lin@meridian.io', presence: '1w ago' },
];

export const ACTIVITY: Array<[string, number, string, string]> = [
  ['D. Okonkwo', 180, 'moved <b>Website refresh</b> to Review', '12m'],
  ['M. Haddad', 280, 'commented on <b>Q3 pricing model</b>', '1h'],
  ['R. Silva', 24, 'created <b>Mobile onboarding</b>', '3h'],
  ['A. Petrov', 200, 'imported 1,204 rows into <b>Data migration</b>', '5h'],
  ['L. Chen', 320, 'closed <b>Compliance audit</b>', 'yesterday'],
];

export const BOARD: Array<[string, string[]]> = [
  ['Backlog', ['Rework the empty state', 'Audit tracking plan', 'Spike: offline mode']],
  ['In progress', ['Website refresh — hero', 'Pricing page copy']],
  ['Review', ['Onboarding checklist', 'CSV importer v2']],
  ['Done', ['Compliance audit', 'Q2 retro']],
];

export const REPORTS: Array<[string, string, number, string, string, string]> = [
  ['Adoption by cohort', 'D. Okonkwo', 180, 'Everyone', '14m ago', 'Weekly'],
  ['Feature usage — importer', 'M. Haddad', 280, 'Growth plans', '2h ago', '—'],
  ['Churn signals', 'L. Chen', 320, 'Admins', 'yesterday', 'Daily'],
  ['Seat utilisation', 'A. Petrov', 200, 'Billing owners', '3d ago', 'Monthly'],
];

export const INVOICES: Array<[string, string, string]> = [
  ['INV-2026-08', 'Aug 2026', '$349.00'],
  ['INV-2026-07', 'Jul 2026', '$349.00'],
  ['INV-2026-06', 'Jun 2026', '$349.00'],
  ['INV-2026-05', 'May 2026', '$99.00'],
];

export const FUNNEL: Array<[string, number, number]> = [
  ['Signed up', 4182, 100],
  ['Created a project', 2634, 63],
  ['Invited a teammate', 1489, 36],
  ['Imported data', 872, 21],
  ['Returned in week 2', 1104, 26],
];

export const TEMPLATES: Array<[string, number, number]> = [
  ['Product launch', 6, 142],
  ['Customer onboarding', 9, 98],
  ['Quarterly planning', 4, 61],
  ['Bug triage', 7, 44],
  ['Design review', 5, 37],
  ['Data migration', 8, 29],
  ['Content calendar', 6, 25],
  ['Hiring loop', 10, 19],
  ['Incident postmortem', 7, 12],
];

/**
 * Localized copy for the surfaces the resolver's localized-text family reads.
 * Same intent, different words — the target must survive the switch.
 */
export type HostLocale = 'en' | 'de';

export const COPY: Record<HostLocale, Record<string, string>> = {
  en: {
    createProject: 'Create project',
    createTemplate: 'Create project template',
    import: 'Import',
    filter: 'Filter',
    projects: 'Projects',
    dashboard: 'Dashboard',
    reports: 'Reports',
    team: 'Team',
    billing: 'Billing',
    settings: 'Settings',
    invite: 'Invite people',
    choosePlan: 'Choose a plan',
    exportCsv: 'Export CSV',
    newReport: 'New report',
    csvFile: 'CSV file',
    localeToggle: 'Switch to German',
    allProjects: 'All projects',
    archived: 'Archived',
    templates: 'Templates',
    workspaceHeading: 'Project workspace',
    templatesHeading: 'Project templates',
  },
  de: {
    createProject: 'Projekt erstellen',
    createTemplate: 'Projektvorlage erstellen',
    import: 'Importieren',
    filter: 'Filtern',
    projects: 'Projekte',
    dashboard: 'Übersicht',
    reports: 'Berichte',
    team: 'Team',
    billing: 'Abrechnung',
    settings: 'Einstellungen',
    invite: 'Personen einladen',
    choosePlan: 'Tarif wählen',
    exportCsv: 'CSV exportieren',
    newReport: 'Neuer Bericht',
    csvFile: 'CSV-Datei',
    localeToggle: 'Zu Englisch wechseln',
    allProjects: 'Alle Projekte',
    archived: 'Archiviert',
    templates: 'Vorlagen',
    workspaceHeading: 'Projektarbeitsbereich',
    templatesHeading: 'Projektvorlagen',
  },
};
