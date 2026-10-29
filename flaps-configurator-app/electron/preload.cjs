// Udostępnia aplikacji (window.flapsDesktop) tylko obsługę Bluetooth — bez dostępu do Node.js.
// Kontrakt: src/app/core/ble/desktop-bridge.ts

const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('flapsDesktop', {
  platform: process.platform,
  bluetooth: {
    onDevices: (callback) => subscribe('bluetooth:devices', callback),
    selectDevice: (deviceId) => ipcRenderer.send('bluetooth:select', deviceId),
    cancelSelection: () => ipcRenderer.send('bluetooth:cancel'),
    onPairingRequest: (callback) => subscribe('bluetooth:pairing', callback),
    respondToPairing: (response) => ipcRenderer.send('bluetooth:pairing-response', response),
  },
});
