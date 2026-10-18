import { Component, inject } from '@angular/core';
import { IonButton } from '@ionic/angular';
import { ConnectionService } from '../../core/connection.service';

/** Baner stanu połączenia: czerwony "Brak połączenia" albo zielony "Połączono". */
@Component({
  selector: 'app-connection-banner',
  templateUrl: './connection-banner.component.html',
  styleUrls: ['./connection-banner.component.scss'],
  imports: [IonButton],
})
export class ConnectionBannerComponent {
  protected readonly connection = inject(ConnectionService);

  protected connect(): void {
    void this.connection.connect();
  }

  protected disconnect(): void {
    this.connection.disconnect();
  }
}
