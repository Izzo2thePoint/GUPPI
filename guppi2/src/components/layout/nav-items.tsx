import { Activity, BookOpen, Bot, Compass, Hammer, LayoutDashboard, MessagesSquare, Orbit, Package, Settings, Terminal, Workflow } from 'lucide-react';
import type { View } from '@/state/nav';

export const NAV: { group: string; items: { view: View; label: string; icon: typeof Activity; hint: string; key?: string }[] }[] = [
  {
    group: 'Command',
    items: [
      { view: 'bridge', label: 'Bridge', icon: LayoutDashboard, hint: 'Selected probe at a glance', key: '1' },
      { view: 'fleet', label: 'Fleet', icon: Orbit, hint: 'Every probe you own', key: '2' },
      { view: 'navigation', label: 'Navigation', icon: Compass, hint: 'Sensors, star map and jumps', key: '3' },
    ],
  },
  {
    group: 'Operations',
    items: [
      { view: 'crew', label: 'Crew', icon: Bot, hint: 'Mannies and their tasks', key: '4' },
      { view: 'inventory', label: 'Inventory', icon: Package, hint: 'Containers, resources and parts', key: '5' },
      { view: 'workshop', label: 'Workshop', icon: Hammer, hint: 'Crafting, upgrades and repairs', key: '6' },
      { view: 'automation', label: 'Automation', icon: Workflow, hint: 'Queues, voyages and routines', key: '7' },
    ],
  },
  {
    group: 'Records',
    items: [
      { view: 'comms', label: 'Comms', icon: MessagesSquare, hint: 'Messages, alerts and damage', key: '8' },
      { view: 'logbook', label: 'Logbook', icon: BookOpen, hint: 'Your in-game journal', key: '9' },
    ],
  },
  {
    group: 'System',
    items: [
      { view: 'console', label: 'API Console', icon: Terminal, hint: 'Every documented endpoint' },
      { view: 'activity', label: 'Activity', icon: Activity, hint: 'Request log and rate limits' },
      { view: 'settings', label: 'Settings', icon: Settings, hint: 'Polling, appearance, safety' },
    ],
  },
];

export const ALL_NAV = NAV.flatMap((g) => g.items);
