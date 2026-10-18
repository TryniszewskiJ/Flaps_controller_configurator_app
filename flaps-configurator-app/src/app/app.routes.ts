import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./tabs/tabs.page').then((m) => m.TabsPage),
    children: [
      {
        path: 'dashboard',
        loadComponent: () => import('./dashboard/dashboard.page').then((m) => m.DashboardPage),
      },
      {
        path: 'config',
        loadComponent: () => import('./config/config.page').then((m) => m.ConfigPage),
      },
      {
        path: 'canbus',
        loadComponent: () => import('./canbus/canbus.page').then((m) => m.CanbusPage),
      },
      {
        path: 'console',
        loadComponent: () => import('./dev-console/dev-console.page').then((m) => m.DevConsolePage),
      },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
    ],
  },
];
