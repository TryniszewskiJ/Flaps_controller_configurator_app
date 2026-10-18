import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CanbusPage } from './canbus.page';

describe('CanbusPage', () => {
  let component: CanbusPage;
  let fixture: ComponentFixture<CanbusPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(CanbusPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
