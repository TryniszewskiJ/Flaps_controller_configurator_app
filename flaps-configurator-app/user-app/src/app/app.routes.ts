import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./tabs/tabs.page').then((m) => m.UserTabsPage),
    children: [
      {
        path: 'dashboard',
        loadComponent: () => import('./dashboard/dashboard.page').then((m) => m.UserDashboardPage),
      },
      {
        path: 'logics',
        loadComponent: () => import('./logics/logics.page').then((m) => m.LogicsPage),
      },
      {
        path: 'update',
        loadComponent: () => import('@flaps/update/update.page').then((m) => m.UpdatePage),
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('@flaps/shared/settings/settings.page').then((m) => m.SettingsPage),
      },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
    ],
  },
];
