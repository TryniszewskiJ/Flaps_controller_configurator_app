import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

/**
 * Zapis pliku tekstowego w miejscu wybranym przez użytkownika:
 * - iOS / Android: plik w pamięci podręcznej aplikacji i systemowe „Udostępnij”
 *   (Zapisz w Plikach, Dysk, mail…),
 * - przeglądarka / Electron: pobieranie (Electron pyta, gdzie zapisać).
 */
export async function saveTextFile(name: string, text: string, mimeType: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const { uri } = await Filesystem.writeFile({
      path: name,
      data: text,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    try {
      await Share.share({ title: name, files: [uri] });
    } catch (error) {
      // Zamknięte okno udostępniania to nie błąd
      if (!/cancel/i.test(error instanceof Error ? error.message : String(error))) {
        throw error;
      }
    }
    return;
  }

  const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
