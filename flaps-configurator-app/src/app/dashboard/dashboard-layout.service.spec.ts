import { TestBed } from '@angular/core/testing';
import { DEFAULT_DASHBOARD, DashboardLayoutService } from './dashboard-layout.service';

describe('DashboardLayoutService', () => {
  const create = (): DashboardLayoutService => {
    TestBed.resetTestingModule();
    return TestBed.inject(DashboardLayoutService);
  };

  beforeEach(() => localStorage.clear());

  it('starts with the default sections and offers the rest', () => {
    const layout = create();

    expect(layout.widgets()).toEqual(DEFAULT_DASHBOARD);
    expect(layout.available().map((w) => w.id)).toEqual([
      'command',
      'amp-out',
      'device-log',
      'frame-log',
    ]);
  });

  it('adds, removes and moves sections and remembers the layout', () => {
    const layout = create();
    layout.remove('signals');
    layout.add('amp-out');
    layout.add('amp-out');
    layout.move('amp-out', -1);
    layout.move('drive-mode', -1); // już na górze

    expect(layout.widgets()).toEqual(['drive-mode', 'flaps', 'amp-out', 'actions']);
    expect(create().widgets()).toEqual(['drive-mode', 'flaps', 'amp-out', 'actions']);
  });

  it('keeps an empty dashboard and restores the defaults on request', () => {
    const layout = create();
    for (const id of DEFAULT_DASHBOARD) {
      layout.remove(id);
    }
    expect(create().widgets()).toEqual([]);

    layout.reset();
    expect(layout.widgets()).toEqual(DEFAULT_DASHBOARD);
  });

  it('ignores unknown, repeated and broken stored entries', () => {
    localStorage.setItem('flaps.dashboardWidgets', JSON.stringify(['flaps', 'nope', 'flaps', 3]));
    expect(create().widgets()).toEqual(['flaps']);

    localStorage.setItem('flaps.dashboardWidgets', '{broken');
    expect(create().widgets()).toEqual(DEFAULT_DASHBOARD);
  });
});
