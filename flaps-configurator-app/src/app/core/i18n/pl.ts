/**
 * Teksty interfejsu — polski (język źródłowy). Klucze sprawdza kompilator: en.ts musi mieć
 * wszystkie. Parametry w nawiasach klamrowych, np. {name}.
 *
 * Słownik obejmuje kod wspólny i aplikację użytkownika; strony tylko dla technika (Config,
 * CAN bus, Dev console) są po polsku bez tłumaczenia.
 */
export const pl = {
  // --- Wspólne ---
  'common.cancel': 'Anuluj',
  'common.close': 'Zamknij',
  'common.save': 'Zapisz',
  'common.delete': 'Usuń',
  'common.ok': 'OK',
  'common.deviceError': 'Sterownik zwrócił błąd ({status}).',
  'common.noResponse': 'Sterownik nie odpowiada.',
  'common.notConnected': 'Brak połączenia ze sterownikiem.',

  // --- Zakładki aplikacji użytkownika ---
  'tabs.flaps': 'Klapy',
  'tabs.modes': 'Tryby',
  'tabs.update': 'Aktualizacja',
  'tabs.settings': 'Ustawienia',

  // --- Stan klap i sygnałów (wspólne) ---
  'flap.name': 'Klapa {n}',
  'flap.unknown': 'Nieznane (bez ruchu od startu)',
  'flap.opening': 'Otwiera się…',
  'flap.open': 'Otwarta',
  'flap.closing': 'Zamyka się…',
  'flap.closed': 'Zamknięta',
  'flap.notConnected': 'Niepodłączona',
  'state.safe': 'Stan bezpieczny',
  'state.modeFallback': 'Tryb {n}',
  'state.signalFallback': 'Sygnał {n}',

  // --- Czas ręcznego sterowania ---
  'override.permanent': 'na stałe',
  'override.minutes': 'na {n} min',

  // --- Dashboard użytkownika ---
  'dashboard.title': 'Klapy',
  'dashboard.status': 'Stan',
  'dashboard.connectHint': 'Połącz się ze sterownikiem, aby zobaczyć stan klap.',
  'dashboard.summary.open': 'Otwarte',
  'dashboard.summary.closed': 'Zamknięte',
  'dashboard.summary.opening': 'Otwierają się…',
  'dashboard.summary.closing': 'Zamykają się…',
  'dashboard.summary.mixed': 'Różne położenia',
  'dashboard.summary.unknown': 'Położenie nieznane',
  'dashboard.control.mode': 'Steruje tryb: {name}',
  'dashboard.control.noCarData': '{name} — brak danych z auta',
  'dashboard.control.permanent': 'Ręcznie — na stałe',
  'dashboard.control.timed': 'Ręcznie — Auto wróci za {time}',
  'dashboard.control.manual': 'Ręcznie',
  'dashboard.switch': 'Sterowanie klapami',
  'dashboard.mode.auto': 'Auto',
  'dashboard.mode.open': 'Otwarte',
  'dashboard.mode.closed': 'Zamknięte',
  'dashboard.mode.manual': 'ręcznie',
  'dashboard.mode.autoFallback': 'tryb jazdy',
  'dashboard.mode.moving': 'w ruchu…',
  'dashboard.duration': 'Ręcznie:',
  'dashboard.durationLabel': 'Jak długo sterować ręcznie',
  'dashboard.durationInfo': 'Co to znaczy?',
  'dashboard.hint.permanent':
    'Klapy zostaną w wybranej pozycji, aż wybierzesz Auto albo sterownik się zrestartuje (np. po wyłączeniu zasilania). Rozłączenie telefonu niczego nie zmienia.',
  'dashboard.hint.timed':
    'Po tym czasie klapy same wrócą na Auto — także wtedy, gdy telefon się rozłączy.',
  'dashboard.carData': 'Dane z auta',
  'dashboard.carDataEmpty': 'Brak danych — połącz się ze sterownikiem.',
  'dashboard.stale': 'brak aktualnych danych',

  // --- Tryby jazdy (logiki) w aplikacji użytkownika ---
  'modes.title': 'Tryby jazdy',
  'modes.list': 'Tryby',
  'modes.add': '+ Dodaj',
  'modes.selectorHint':
    'Tryb wybiera sygnał {name} z auta — liczba po prawej to jego wartość dla danego trybu.',
  'modes.single': 'Sterownik ma jeden tryb — kolejne może dodać serwis.',
  'modes.default': 'domyślny',
  'modes.empty': 'Brak trybów.',
  'modes.status.dirty': 'Masz niezapisane zmiany.',
  'modes.status.unsaved': 'Tryby działają tylko do restartu sterownika — zapisz je, żeby zostały.',
  'modes.status.saved': 'Wszystkie zmiany są zapisane w sterowniku.',
  'modes.discard': 'Cofnij zmiany',
  'modes.try': 'Wypróbuj bez zapisywania',
  'modes.tryHint': 'Wypróbowane zmiany działają do restartu sterownika.',
  'modes.retry': 'Spróbuj ponownie',
  'modes.reading': 'Odczytuję tryby ze sterownika…',
  'modes.connectHint': 'Połącz się ze sterownikiem, żeby edytować tryby.',
  'modes.error.minOne': 'Sterownik potrzebuje co najmniej jednego trybu.',
  'modes.error.rejected': 'Sterownik odrzucił tryby: {reason}',
  'modes.error.rejectedPlain': 'Sterownik odrzucił tryby.',
  'modes.error.flash':
    'Sterownik używa nowych trybów, ale nie udało się zapisać ich na stałe — spróbuj ponownie.',
  'modes.error.busy': 'Trwa aktualizacja firmware — zapisz tryby po jej zakończeniu.',
  'modes.error.code': 'kod błędu {code}.',
  'modes.error.NO_LOGIC': 'brak trybu jazdy.',
  'modes.error.TOO_MANY_LOGICS': 'za dużo trybów.',
  'modes.error.SELECTOR_REQUIRED':
    'kilka trybów wymaga sygnału, który je wybiera (ustawia go serwis).',
  'modes.error.DUPLICATE_SELECTOR_VALUE': 'dwa tryby mają tę samą wartość selektora.',
  'modes.error.INVALID_DEFAULT_LOGIC': 'niepoprawny tryb domyślny.',
  'modes.error.INVALID_LOGIC_TYPE': 'tryb nie ma ustawionego działania.',
  'modes.error.INVALID_LOGIC_INPUT': 'tryb korzysta z sygnału, którego nie ma.',
  'modes.error.INVALID_FIXED_STATE': 'niepoprawne położenie stałe.',
  'modes.error.INVALID_SWITCH_VALUES': 'przełącznik ma tę samą wartość otwarcia i zamknięcia.',
  'modes.error.INVALID_HYSTERESIS': 'próg zamknięcia jest wyżej niż próg otwarcia.',
  'modes.error.INVALID_CONDITION':
    'niepoprawny warunek (sygnał, wartość, kolejność albo ponad 12 elementów).',

  // --- Opis logiki / trybu w jednej linii ---
  'summary.noSignal': '(brak sygnału)',
  'summary.alwaysOpen': 'Zawsze otwarte',
  'summary.alwaysClosed': 'Zawsze zamknięte',
  'summary.switch': '{name} = {open} otwórz, = {close} zamknij',
  'summary.hysteresis': '{name} > {open} otwórz, < {close} zamknij',
  'summary.switchNoInput': 'Otwórz przy {open}, zamknij przy {close}',
  'summary.hysteresisNoInput': 'Otwórz powyżej {open}, zamknij poniżej {close}',
  'summary.condition': 'Otwórz, gdy {condition}',
  'summary.invalidCondition': 'Niepoprawny warunek',
  'summary.noParameters': 'Brak parametrów',

  // --- Warunek ---
  'condition.and': 'I',
  'condition.or': 'LUB',
  'condition.not': 'NIE',
  'condition.for': 'przez {ms} ms',
  'condition.until': 'do < {value}',
  'condition.empty': '(pusty warunek)',
  'condition.signalFallback': 'sygnał {n}',
  'condition.hysteresis': 'histereza',
  'condition.error.empty': 'Dodaj co najmniej jedno porównanie.',
  'condition.error.tooBig':
    'Warunek ma {count} elementów — sterownik przyjmuje najwyżej {max} (porównania, I / LUB, NIE).',
  'condition.error.forRange': 'Czas „przez” musi być od 0 do {max} ms.',
  'condition.error.noSignal': 'Porównanie bez sygnału — wybierz sygnał.',
  'condition.error.value': 'Wartość porównania musi być liczbą.',
  'condition.error.hysteresisValue': 'Próg wyłączenia histerezy musi być liczbą.',
  'condition.error.hysteresisOrder':
    'Próg wyłączenia histerezy nie może być wyżej niż próg włączenia.',
  'conditionNode.signal': 'Sygnał',
  'conditionNode.compare': 'Porównanie',
  'conditionNode.value': 'Wartość',
  'conditionNode.onAbove': 'Włącz powyżej',
  'conditionNode.offBelow': 'Wyłącz poniżej',
  'conditionNode.onShort': 'włącz >',
  'conditionNode.offShort': 'wyłącz <',
  'conditionNode.for': 'przez',
  'conditionNode.allFor': 'całość przez',
  'conditionNode.groupFor': 'grupa przez',
  'conditionNode.all': 'Wszystkie (I)',
  'conditionNode.any': 'Którykolwiek (LUB)',
  'conditionNode.empty': 'Dodaj porównanie.',
  'conditionNode.addCompare': '+ Porównanie',
  'conditionNode.addGroup': '+ Grupa {op}',
  'conditionNode.removeNot': 'Bez NIE',

  // --- Edytor logiki / trybu ---
  'editor.title.logic': 'Logika',
  'editor.title.mode': 'Tryb jazdy',
  'editor.new.logic': 'Nowa logika',
  'editor.new.mode': 'Nowy tryb jazdy',
  'editor.name': 'Nazwa',
  'editor.namePlaceholder': 'np. Sport',
  'editor.selector': 'Wartość selektora',
  'editor.selectorHelp': 'Działa, gdy {name} (zaokrąglony) ma tę wartość.',
  'editor.selectorFallback': 'selektor',
  'editor.behaviour': 'Działanie',
  'editor.type.fixed': 'Stałe',
  'editor.type.switch': 'Przełącznik',
  'editor.type.hysteresis': 'Histereza',
  'editor.type.condition': 'Warunek',
  'editor.help.fixed': 'Klapy zawsze w wybranej pozycji.',
  'editor.help.switch':
    '{name} (zaokrąglony) równy wartości otwarcia → otwarte, wartości zamknięcia → zamknięte, inna wartość → stan bezpieczny.',
  'editor.help.hysteresis':
    '{name} powyżej progu otwarcia → otwarte, poniżej progu zamknięcia → zamknięte, pomiędzy — bez zmian.',
  'editor.help.condition':
    'Warunek spełniony → otwarte, niespełniony → zamknięte. Gdy któryś sygnał z porównań nie przyszedł albo przestał przychodzić → stan bezpieczny. „Przez” — wynik jest prawdziwy dopiero, gdy trwa tyle ms (krótkie skoki nie ruszają klapą). „=” i „≠” porównują wartości zaokrąglone do liczby całkowitej. „Histereza” — prawda powyżej progu włączenia, fałsz poniżej progu wyłączenia, pomiędzy bez zmian (np. tryb = Sport I histereza RPM 4000 / 3500).',
  'editor.conditionSize': 'Elementy: {count} / {max} (porównania, I / LUB, NIE).',
  'editor.input': 'Sygnał wejściowy',
  'editor.inputFallback': 'sygnał',
  'editor.choose': 'Wybierz',
  'editor.openAt': 'Otwórz przy',
  'editor.closeAt': 'Zamknij przy',
  'editor.openAbove': 'Otwórz powyżej',
  'editor.closeBelow': 'Zamknij poniżej',
  'editor.error.nameTooLong':
    'Nazwa może mieć najwyżej {max} bajtów (polskie znaki liczą się podwójnie).',
  'editor.error.integer': 'Podaj liczbę całkowitą.',
  'editor.error.duplicate.logic': 'Tę wartość ma już logika „{name}”.',
  'editor.error.duplicate.mode': 'Tę wartość ma już tryb „{name}”.',
  'editor.error.chooseInput': 'Wybierz sygnał wejściowy.',
  'editor.error.noSignals': 'Najpierw dodaj sygnał.',
  'editor.error.switchIntegers': 'Wartości przełącznika muszą być liczbami całkowitymi.',
  'editor.error.switchDiffer': 'Wartość otwarcia i zamknięcia muszą się różnić.',
  'editor.error.thresholds': 'Progi muszą być liczbami.',
  'editor.error.hysteresisOrder': 'Próg zamknięcia nie może być wyżej niż próg otwarcia.',
  'editor.error.noCondition':
    'Firmware sterownika nie obsługuje warunków — zaktualizuj je (protokół 1.12).',
  'editor.error.noConditionHysteresis':
    'Firmware sterownika nie obsługuje histerezy w warunku — zaktualizuj je (protokół 1.13).',

  // --- Baner połączenia ---
  'banner.connected': 'Połączono',
  'banner.bootloader': 'tryb ratunkowy',
  'banner.firmware': 'FW {version}',
  'banner.disconnect': 'Rozłącz',
  'banner.recoveryTitle': 'Tryb ratunkowy',
  'banner.recoveryText': '— sterownik nie steruje klapami. Wgraj firmware w zakładce Aktualizacja.',
  'banner.connecting': 'Łączenie z {name}…',
  'banner.pairingHint': 'Jeśli telefon poprosi o kod parowania, wpisz kod sterownika.',
  'banner.lost': 'Utracono połączenie',
  'banner.reconnecting': 'Ponowne łączenie z {name}…',
  'banner.searching': 'Szukam sterownika {name}…',
  'banner.searchingHint': 'Ostatnio używany — łączenie automatyczne',
  'banner.disconnected': 'Brak połączenia',
  'banner.connectHint': 'Połącz się ze sterownikiem, aby korzystać z aplikacji.',
  'banner.connect': 'Połącz',
  'banner.scanError': 'Nie można wyszukać sterowników: {message}',

  // --- Wybór urządzenia ---
  'picker.title': 'Wybierz sterownik',
  'picker.nearby': 'Sterowniki w pobliżu',
  'picker.searchingLabel': 'Wyszukiwanie',
  'picker.searching': 'Szukam sterowników…',
  'picker.none': 'Nie znaleziono sterownika. Sprawdź, czy jest zasilony i w pobliżu.',
  'picker.again': 'Szukaj ponownie',
  'picker.error.permission':
    'Brak uprawnień do Bluetooth. Zezwól aplikacji na wyszukiwanie urządzeń w pobliżu.',
  'picker.error.disabled': 'Bluetooth jest wyłączony. Włącz go i spróbuj ponownie.',
  'picker.error.other': 'Nie udało się wyszukać sterowników: {message}',

  // --- Parowanie (aplikacja desktopowa) ---
  'pairing.title': 'Parowanie',
  'pairing.enterPin': 'Wpisz kod parowania sterownika.',
  'pairing.pinPlaceholder': 'Kod parowania',
  'pairing.confirmPin': 'Czy sterownik pokazuje kod {pin}?',
  'pairing.confirm': 'Sparować aplikację ze sterownikiem?',
  'pairing.pair': 'Sparuj',

  // --- Połączenie ---
  'connection.defaultName': 'Sterownik klap',
  'connection.noRestartResponse': 'Sterownik nie odpowiada po restarcie — łączę ponownie.',
  'connection.protocolMismatch':
    'Niezgodna wersja protokołu: sterownik {device}, aplikacja {app}. Zaktualizuj {what}.',
  'connection.updateApp': 'aplikację',
  'connection.updateFirmware': 'firmware sterownika',
  'connection.unknownApp':
    'Sterownik nie obsługuje tej aplikacji — potrzebna aktualizacja jego firmware (serwis).',
  'connection.rejected': 'Sterownik odrzucił połączenie.',
  'connection.cancelled': 'Połączenie zostało przerwane.',
  'connection.pairingFailed':
    'Parowanie nie powiodło się. Spróbuj ponownie i wpisz kod parowania sterownika.',
  'connection.pairingTimeout':
    'Sterownik nie dokończył parowania. Na Windows: usuń sterownik w Ustawieniach → Bluetooth i urządzenia (np. „MojeBLE” albo nieznane urządzenie) i połącz się ponownie — aplikacja poprosi o kod parowania.',
  'connection.bluetoothOff': 'Włącz Bluetooth, aby połączyć się ze sterownikiem.',
  'connection.outOfRange':
    'Nie udało się połączyć ze sterownikiem — jest poza zasięgiem albo wyłączony.',
  'connection.failed': 'Nie udało się połączyć: {message}',
  'autoConnect.notFound':
    'Nie znaleziono sterownika „{name}” — sprawdź, czy jest włączony i w zasięgu.',

  // --- Stan sterownika ---
  'deviceState.noPermanent':
    'Firmware sterownika nie obsługuje stałego sterowania ręcznego — zaktualizuj je (protokół 1.15).',
  'deviceState.readFailed': 'Nie udało się odczytać stanu sterownika.',
  'deviceState.overrideRejected':
    'Sterownik odrzucił ręczne sterowanie (niepoprawne położenie albo czas).',

  // --- Ustawienia ---
  'settings.title': 'Ustawienia',
  'settings.language': 'Język · Language',
  'settings.appearance': 'Wygląd',
  'settings.theme': 'Motyw aplikacji',
  'settings.theme.system': 'Jak system',
  'settings.theme.light': 'Jasny',
  'settings.theme.dark': 'Ciemny',
  'settings.connection': 'Połączenie',
  'settings.autoConnect': 'Łącz automatycznie z ostatnim sterownikiem',
  'settings.autoConnectHint':
    'Po uruchomieniu aplikacja sama połączy się z ostatnio używanym sterownikiem, bez wybierania go z listy.',
  'settings.autoConnectUnsupported':
    'Niedostępne w przeglądarce — przeglądarka zawsze pyta o wybór urządzenia. Działa w aplikacji na telefon i komputer.',
  'settings.lastDevice': 'Ostatni sterownik',
  'settings.uid': 'UID {uid}',
  'settings.forget': 'Zapomnij',
  'settings.noDevice': 'Brak zapamiętanego sterownika — połącz się z nim raz przyciskiem Połącz.',

  // --- Aktualizacja firmware ---
  'update.title': 'Aktualizacja',
  'update.controller': 'Sterownik',
  'update.firmware': 'Firmware',
  'update.none': 'brak',
  'update.mode': 'Tryb pracy',
  'update.recovery': 'ratunkowy ({reason})',
  'update.normal': 'normalna praca',
  'update.connectHint': 'Połącz się ze sterownikiem, żeby zaktualizować firmware.',
  'update.file': 'Plik firmware',
  'update.chooseFile': 'Wybierz plik .bin',
  'update.chooseOther': 'Wybierz inny plik',
  'update.fileName': 'Plik',
  'update.version': 'Wersja',
  'update.size': 'Rozmiar',
  'update.fileHint':
    'Plik {file} od serwisu — z pamięci telefonu albo dysku komputera. Aplikacja sprawdzi go przed wysłaniem.',
  'update.install': 'Wgrywanie',
  'update.idleHint':
    'Wysyłanie nie przerywa sterowania klapami. Potem sterownik się restartuje i instaluje nowy firmware (kilka sekund). Przerwanie albo utrata połączenia w trakcie nie psuje działającego firmware.',
  'update.keepOpen': 'Nie zamykaj aplikacji i nie oddalaj się od sterownika.',
  'update.abort': 'Przerwij',
  'update.start': 'Wgraj firmware',
  'update.restart': 'Restart',
  'update.restartHint':
    'Tryb ratunkowy (bootloader) przyjmuje tylko aktualizację — klapy nie są wtedy sterowane. Sterownik przechodzi w niego sam, gdy firmware jest uszkodzony albo ciągle się resetuje.',
  'update.startFirmware': 'Uruchom firmware',
  'update.recoveryMode': 'Tryb ratunkowy',
  'update.reboot': 'Uruchom ponownie',
  'update.rebooting': 'Restart sterownika…',
  'update.sameVersion': 'Ta sama wersja co na sterowniku.',
  'update.olderVersion': 'Starsza wersja niż na sterowniku ({version}).',
  'update.readError': 'Nie udało się odczytać pliku.',
  'update.confirm.title': 'Wgrać firmware?',
  'update.confirm.text':
    '{file} (wersja {version}) zastąpi firmware {current} na sterowniku. Nie rozłączaj się do końca aktualizacji.',
  'update.confirm.action': 'Wgraj',
  'update.confirm.recoveryTitle': 'Tryb ratunkowy?',
  'update.confirm.recoveryText':
    'Sterownik uruchomi się w trybie ratunkowym — klapy nie będą sterowane, dopóki nie uruchomisz firmware albo nie wgrasz nowego.',
  'update.confirm.rebootTitle': 'Uruchomić ponownie?',
  'update.confirm.rebootText':
    'Sterownik uruchomi się ponownie; klapy przez chwilę nie będą sterowane.',
  'update.confirm.rebootAction': 'Uruchom',
  'update.phase.erasing': 'Sterownik przygotowuje pamięć…',
  'update.phase.sending': 'Wysyłanie firmware…',
  'update.phase.verifying': 'Sterownik sprawdza firmware…',
  'update.phase.restarting': 'Restart — sterownik instaluje nowy firmware…',
  'update.phase.done': 'Zaktualizowano',
  'update.phase.failed': 'Aktualizacja nie powiodła się',
  'update.phase.aborted': 'Aktualizacja przerwana — działa dotychczasowy firmware.',
  'update.reason.noFirmware': 'brak poprawnego firmware',
  'update.reason.crashLoop': 'firmware 3 razy z rzędu zresetował watchdog',
  'update.reason.requested': 'na żądanie',
  'update.reason.unknown': 'nieznany powód',
  'update.error.stuckInRecovery': 'Sterownik został w trybie ratunkowym ({reason}).',
  'update.error.noFirmware': 'Na sterowniku nie ma poprawnego firmware do uruchomienia — wgraj go.',
  'update.error.rebootRejected': 'Sterownik odrzucił restart.',
  'update.error.tooBig': 'Plik jest za duży dla tego sterownika (najwyżej {max} B).',
  'update.error.rejected': 'Sterownik odrzucił aktualizację ({status}).',
  'update.error.oldFirmwareKept': '{message} Sterownik działa na dotychczasowym firmware.',
  'update.error.code': 'Błąd aktualizacji (kod {code}).',
  'update.error.INVALID_SIZE': 'Sterownik nie przyjmie pliku tego rozmiaru.',
  'update.error.NOT_STARTED':
    'Sterownik przerwał aktualizację (np. wygasła sesja) — spróbuj ponownie.',
  'update.error.ERASING': 'Sterownik jeszcze kasuje pamięć — spróbuj za chwilę.',
  'update.error.INVALID_OFFSET': 'Paczki dotarły w złej kolejności — spróbuj ponownie.',
  'update.error.INVALID_LENGTH': 'Niepoprawna długość paczki.',
  'update.error.DATA_MISMATCH': 'Ponowiona paczka różni się od zapisanej — spróbuj ponownie.',
  'update.error.INCOMPLETE': 'Sterownik nie dostał całego pliku — spróbuj ponownie.',
  'update.error.INVALID_IMAGE': 'Sterownik odrzucił plik: brak nagłówka albo zły adres.',
  'update.error.WRONG_BOARD': 'Sterownik odrzucił plik: jest na inną płytkę.',
  'update.error.CRC_MISMATCH':
    'Plik uszkodził się po drodze (CRC się nie zgadza) — spróbuj ponownie.',
  'update.error.FLASH': 'Błąd zapisu pamięci flash sterownika.',
  'update.error.noRestartResponse': 'Sterownik nie odpowiada po restarcie.',
  'update.error.stopped':
    'Sterownik przestał odpowiadać — aktualizacja przerwana, działa dotychczasowy firmware.',
  'update.error.unsupported':
    'Firmware sterownika nie obsługuje aktualizacji przez Bluetooth — wgraj bootloader ST-Linkiem (serwis).',
  'update.error.restartInterrupted':
    'Połączenie przerwane w trakcie restartu — połącz się ponownie i sprawdź wersję firmware.',
  'update.error.interrupted':
    'Połączenie przerwane — aktualizacja nie doszła do skutku, działa dotychczasowy firmware.',
  'image.error.tooSmall': 'Plik jest za mały na firmware — wybierz exhaust_flaps_controller.bin.',
  'image.error.tooBig': 'Plik ma {size}, a sterownik przyjmuje najwyżej {max}.',
  'image.error.noHeader':
    'To nie jest firmware sterownika (brak nagłówka). Plik sprzed bootloadera albo z innego projektu?',
  'image.error.headerVersion':
    'Nieznana wersja nagłówka firmware ({version}) — zaktualizuj aplikację.',
  'image.error.wrongBoard': 'Ten firmware jest na inną płytkę.',
  'image.error.address':
    'Firmware jest zbudowany pod adres {address} — sterownik wymaga 0x08020000.',
  'image.error.noSize':
    'Firmware bez rozmiaru i CRC w nagłówku — to plik sprzed tools/firmware_image.py.',
  'image.error.size':
    'Rozmiar w nagłówku ({header} B) nie zgadza się z plikiem ({file} B) — plik jest ucięty albo zmieniony.',
  'image.error.crc': 'Plik jest uszkodzony (CRC się nie zgadza).',
} as const;
