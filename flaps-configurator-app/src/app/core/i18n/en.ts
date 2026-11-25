import type { Translations } from './i18n';

/** UI texts — English. Keys and parameters as in pl.ts (checked by the compiler). */
export const en: Translations = {
  // --- Common ---
  'common.cancel': 'Cancel',
  'common.close': 'Close',
  'common.save': 'Save',
  'common.delete': 'Delete',
  'common.ok': 'OK',
  'common.deviceError': 'The controller returned an error ({status}).',
  'common.noResponse': 'The controller is not responding.',
  'common.notConnected': 'Not connected to the controller.',

  // --- User app tabs ---
  'tabs.flaps': 'Flaps',
  'tabs.modes': 'Modes',
  'tabs.update': 'Update',
  'tabs.settings': 'Settings',

  // --- Flaps and signals (shared) ---
  'flap.name': 'Flap {n}',
  'flap.unknown': 'Unknown (not moved since start)',
  'flap.opening': 'Opening…',
  'flap.open': 'Open',
  'flap.closing': 'Closing…',
  'flap.closed': 'Closed',
  'flap.notConnected': 'Not connected',
  'state.safe': 'Safe state',
  'state.modeFallback': 'Mode {n}',
  'state.signalFallback': 'Signal {n}',

  // --- Manual control duration ---
  'override.permanent': 'permanently',
  'override.minutes': 'for {n} min',

  // --- User dashboard ---
  'dashboard.title': 'Flaps',
  'dashboard.status': 'Status',
  'dashboard.connectHint': 'Connect to the controller to see the flaps.',
  'dashboard.summary.open': 'Open',
  'dashboard.summary.closed': 'Closed',
  'dashboard.summary.opening': 'Opening…',
  'dashboard.summary.closing': 'Closing…',
  'dashboard.summary.mixed': 'Mixed positions',
  'dashboard.summary.unknown': 'Position unknown',
  'dashboard.control.mode': 'Controlled by mode: {name}',
  'dashboard.control.noCarData': '{name} — no data from the car',
  'dashboard.control.permanent': 'Manual — permanent',
  'dashboard.control.timed': 'Manual — back to Auto in {time}',
  'dashboard.control.manual': 'Manual',
  'dashboard.switch': 'Flap control',
  'dashboard.mode.auto': 'Auto',
  'dashboard.mode.open': 'Open',
  'dashboard.mode.closed': 'Closed',
  'dashboard.mode.manual': 'manual',
  'dashboard.mode.autoFallback': 'drive mode',
  'dashboard.mode.moving': 'moving…',
  'dashboard.duration': 'Manual:',
  'dashboard.durationLabel': 'How long to control manually',
  'dashboard.durationInfo': 'What does this mean?',
  'dashboard.hint.permanent':
    'The flaps stay in the chosen position until you pick Auto or the controller restarts (e.g. after a power cut). Disconnecting the phone changes nothing.',
  'dashboard.hint.timed':
    'After this time the flaps go back to Auto on their own — also if the phone disconnects.',
  'dashboard.carData': 'Car data',
  'dashboard.carDataEmpty': 'No data — connect to the controller.',
  'dashboard.stale': 'no current data',

  // --- Drive modes (logics) in the user app ---
  'modes.title': 'Drive modes',
  'modes.list': 'Modes',
  'modes.add': '+ Add',
  'modes.selectorHint':
    'The mode is picked by the car signal {name} — the number on the right is its value for each mode.',
  'modes.single': 'The controller has one mode — a service technician can add more.',
  'modes.default': 'default',
  'modes.empty': 'No modes.',
  'modes.status.dirty': 'You have unsaved changes.',
  'modes.status.unsaved':
    'The modes only work until the controller restarts — save them to keep them.',
  'modes.status.saved': 'All changes are saved on the controller.',
  'modes.discard': 'Discard changes',
  'modes.try': 'Try without saving',
  'modes.tryHint': 'Tried changes work until the controller restarts.',
  'modes.retry': 'Try again',
  'modes.reading': 'Reading the modes from the controller…',
  'modes.connectHint': 'Connect to the controller to edit the modes.',
  'modes.error.minOne': 'The controller needs at least one mode.',
  'modes.error.rejected': 'The controller rejected the modes: {reason}',
  'modes.error.rejectedPlain': 'The controller rejected the modes.',
  'modes.error.flash':
    'The controller uses the new modes, but they could not be saved permanently — try again.',
  'modes.error.busy': 'A firmware update is in progress — save the modes after it finishes.',
  'modes.error.code': 'error code {code}.',
  'modes.error.NO_LOGIC': 'there is no drive mode.',
  'modes.error.TOO_MANY_LOGICS': 'too many modes.',
  'modes.error.SELECTOR_REQUIRED':
    'several modes need a signal that picks them (set by a service technician).',
  'modes.error.DUPLICATE_SELECTOR_VALUE': 'two modes have the same selector value.',
  'modes.error.INVALID_DEFAULT_LOGIC': 'invalid default mode.',
  'modes.error.INVALID_LOGIC_TYPE': 'a mode has no behaviour set.',
  'modes.error.INVALID_LOGIC_INPUT': 'a mode uses a signal that does not exist.',
  'modes.error.INVALID_FIXED_STATE': 'invalid fixed position.',
  'modes.error.INVALID_SWITCH_VALUES': 'the switch has the same open and close value.',
  'modes.error.INVALID_HYSTERESIS': 'the close threshold is above the open threshold.',
  'modes.error.INVALID_CONDITION':
    'invalid condition (signal, value, order or more than 12 elements).',

  // --- One-line logic / mode summary ---
  'summary.noSignal': '(no signal)',
  'summary.alwaysOpen': 'Always open',
  'summary.alwaysClosed': 'Always closed',
  'summary.switch': '{name} = {open} open, = {close} close',
  'summary.hysteresis': '{name} > {open} open, < {close} close',
  'summary.switchNoInput': 'Open at {open}, close at {close}',
  'summary.hysteresisNoInput': 'Open above {open}, close below {close}',
  'summary.condition': 'Open when {condition}',
  'summary.invalidCondition': 'Invalid condition',
  'summary.noParameters': 'No parameters',

  // --- Condition ---
  'condition.and': 'AND',
  'condition.or': 'OR',
  'condition.not': 'NOT',
  'condition.for': 'for {ms} ms',
  'condition.until': 'until < {value}',
  'condition.empty': '(empty condition)',
  'condition.signalFallback': 'signal {n}',
  'condition.hysteresis': 'hysteresis',
  'condition.error.empty': 'Add at least one comparison.',
  'condition.error.tooBig':
    'The condition has {count} elements — the controller accepts at most {max} (comparisons, AND / OR, NOT).',
  'condition.error.forRange': 'The “for” time must be between 0 and {max} ms.',
  'condition.error.noSignal': 'A comparison has no signal — choose one.',
  'condition.error.value': 'The comparison value must be a number.',
  'condition.error.hysteresisValue': 'The hysteresis off threshold must be a number.',
  'condition.error.hysteresisOrder':
    'The hysteresis off threshold cannot be above the on threshold.',
  'conditionNode.signal': 'Signal',
  'conditionNode.compare': 'Comparison',
  'conditionNode.value': 'Value',
  'conditionNode.onAbove': 'On above',
  'conditionNode.offBelow': 'Off below',
  'conditionNode.onShort': 'on >',
  'conditionNode.offShort': 'off <',
  'conditionNode.for': 'for',
  'conditionNode.allFor': 'all for',
  'conditionNode.groupFor': 'group for',
  'conditionNode.all': 'All (AND)',
  'conditionNode.any': 'Any (OR)',
  'conditionNode.empty': 'Add a comparison.',
  'conditionNode.addCompare': '+ Comparison',
  'conditionNode.addGroup': '+ {op} group',
  'conditionNode.removeNot': 'Remove NOT',

  // --- Logic / mode editor ---
  'editor.title.logic': 'Logic',
  'editor.title.mode': 'Drive mode',
  'editor.new.logic': 'New logic',
  'editor.new.mode': 'New drive mode',
  'editor.name': 'Name',
  'editor.namePlaceholder': 'e.g. Sport',
  'editor.selector': 'Selector value',
  'editor.selectorHelp': 'Active when {name} (rounded) has this value.',
  'editor.selectorFallback': 'the selector',
  'editor.behaviour': 'Behaviour',
  'editor.type.fixed': 'Fixed',
  'editor.type.switch': 'Switch',
  'editor.type.hysteresis': 'Hysteresis',
  'editor.type.condition': 'Condition',
  'editor.help.fixed': 'The flaps always stay in the chosen position.',
  'editor.help.switch':
    '{name} (rounded) equal to the open value → open, to the close value → closed, any other value → safe state.',
  'editor.help.hysteresis':
    '{name} above the open threshold → open, below the close threshold → closed, in between — no change.',
  'editor.help.condition':
    'Condition met → open, not met → closed. If a compared signal has not arrived or stopped arriving → safe state. “For” — the result is true only after it lasts that many ms (short spikes do not move the flaps). “=” and “≠” compare values rounded to whole numbers. “Hysteresis” — true above the on threshold, false below the off threshold, unchanged in between (e.g. mode = Sport AND RPM hysteresis 4000 / 3500).',
  'editor.conditionSize': 'Elements: {count} / {max} (comparisons, AND / OR, NOT).',
  'editor.input': 'Input signal',
  'editor.inputFallback': 'the signal',
  'editor.choose': 'Choose',
  'editor.openAt': 'Open at',
  'editor.closeAt': 'Close at',
  'editor.openAbove': 'Open above',
  'editor.closeBelow': 'Close below',
  'editor.error.nameTooLong':
    'The name can have at most {max} bytes (accented letters count twice).',
  'editor.error.integer': 'Enter a whole number.',
  'editor.error.duplicate.logic': 'The logic “{name}” already has this value.',
  'editor.error.duplicate.mode': 'The mode “{name}” already has this value.',
  'editor.error.chooseInput': 'Choose the input signal.',
  'editor.error.noSignals': 'Add a signal first.',
  'editor.error.switchIntegers': 'The switch values must be whole numbers.',
  'editor.error.switchDiffer': 'The open and close values must be different.',
  'editor.error.thresholds': 'The thresholds must be numbers.',
  'editor.error.hysteresisOrder': 'The close threshold cannot be above the open threshold.',
  'editor.error.noCondition':
    'The controller firmware does not support conditions — update it (protocol 1.12).',
  'editor.error.noConditionHysteresis':
    'The controller firmware does not support hysteresis in conditions — update it (protocol 1.13).',

  // --- Connection banner ---
  'banner.connected': 'Connected',
  'banner.bootloader': 'recovery mode',
  'banner.firmware': 'FW {version}',
  'banner.disconnect': 'Disconnect',
  'banner.recoveryTitle': 'Recovery mode',
  'banner.recoveryText':
    '— the controller does not control the flaps. Install firmware on the Update tab.',
  'banner.connecting': 'Connecting to {name}…',
  'banner.pairingHint': 'If the phone asks for a pairing code, enter the controller’s code.',
  'banner.lost': 'Connection lost',
  'banner.reconnecting': 'Reconnecting to {name}…',
  'banner.searching': 'Looking for {name}…',
  'banner.searchingHint': 'Last used — connecting automatically',
  'banner.disconnected': 'Not connected',
  'banner.connectHint': 'Connect to the controller to use the app.',
  'banner.connect': 'Connect',
  'banner.scanError': 'Cannot search for controllers: {message}',

  // --- Device picker ---
  'picker.title': 'Choose a controller',
  'picker.nearby': 'Controllers nearby',
  'picker.searchingLabel': 'Searching',
  'picker.searching': 'Looking for controllers…',
  'picker.none': 'No controller found. Make sure it is powered on and nearby.',
  'picker.again': 'Search again',
  'picker.error.permission': 'No Bluetooth permission. Allow the app to search for nearby devices.',
  'picker.error.disabled': 'Bluetooth is off. Turn it on and try again.',
  'picker.error.other': 'Could not search for controllers: {message}',

  // --- Pairing (desktop app) ---
  'pairing.title': 'Pairing',
  'pairing.enterPin': 'Enter the controller’s pairing code.',
  'pairing.pinPlaceholder': 'Pairing code',
  'pairing.confirmPin': 'Does the controller show the code {pin}?',
  'pairing.confirm': 'Pair the app with the controller?',
  'pairing.pair': 'Pair',

  // --- Connection ---
  'connection.defaultName': 'Flap controller',
  'connection.noRestartResponse':
    'The controller is not responding after the restart — reconnecting.',
  'connection.protocolMismatch':
    'Incompatible protocol version: controller {device}, app {app}. Update the {what}.',
  'connection.updateApp': 'app',
  'connection.updateFirmware': 'controller firmware',
  'connection.unknownApp':
    'The controller does not support this app — its firmware needs an update (service).',
  'connection.rejected': 'The controller rejected the connection.',
  'connection.cancelled': 'The connection was interrupted.',
  'connection.pairingFailed': 'Pairing failed. Try again and enter the controller’s pairing code.',
  'connection.pairingTimeout':
    'The controller did not finish pairing. On Windows: remove the controller in Settings → Bluetooth & devices and connect again — the app will ask for the pairing code.',
  'connection.bluetoothOff': 'Turn on Bluetooth to connect to the controller.',
  'connection.outOfRange':
    'Could not connect to the controller — it is out of range or switched off.',
  'connection.failed': 'Could not connect: {message}',
  'autoConnect.notFound':
    'Controller “{name}” not found — check that it is switched on and in range.',

  // --- Controller state ---
  'deviceState.noPermanent':
    'The controller firmware does not support permanent manual control — update it (protocol 1.15).',
  'deviceState.readFailed': 'Could not read the controller state.',
  'deviceState.overrideRejected':
    'The controller rejected manual control (invalid position or time).',

  // --- Settings ---
  'settings.title': 'Settings',
  'settings.language': 'Language · Język',
  'settings.appearance': 'Appearance',
  'settings.theme': 'App theme',
  'settings.theme.system': 'System',
  'settings.theme.light': 'Light',
  'settings.theme.dark': 'Dark',
  'settings.connection': 'Connection',
  'settings.autoConnect': 'Connect automatically to the last controller',
  'settings.autoConnectHint':
    'When the app starts, it connects to the last used controller on its own, without picking it from a list.',
  'settings.autoConnectUnsupported':
    'Not available in the browser — the browser always asks to choose a device. Works in the phone and desktop app.',
  'settings.lastDevice': 'Last controller',
  'settings.uid': 'UID {uid}',
  'settings.forget': 'Forget',
  'settings.noDevice': 'No controller remembered yet — connect to it once with Connect.',

  // --- Firmware update ---
  'update.title': 'Update',
  'update.controller': 'Controller',
  'update.firmware': 'Firmware',
  'update.none': 'none',
  'update.mode': 'Operating mode',
  'update.recovery': 'recovery ({reason})',
  'update.normal': 'normal operation',
  'update.connectHint': 'Connect to the controller to update its firmware.',
  'update.file': 'Firmware file',
  'update.chooseFile': 'Choose a .bin file',
  'update.chooseOther': 'Choose another file',
  'update.fileName': 'File',
  'update.version': 'Version',
  'update.size': 'Size',
  'update.fileHint':
    'The {file} file from your service — from the phone storage or computer disk. The app checks it before sending.',
  'update.install': 'Installation',
  'update.idleHint':
    'Sending does not interrupt flap control. Then the controller restarts and installs the new firmware (a few seconds). Cancelling or losing the connection meanwhile does not break the running firmware.',
  'update.keepOpen': 'Keep the app open and stay near the controller.',
  'update.abort': 'Cancel',
  'update.start': 'Install firmware',
  'update.restart': 'Restart',
  'update.restartHint':
    'Recovery mode (bootloader) only accepts an update — the flaps are not controlled meanwhile. The controller enters it on its own when the firmware is damaged or keeps resetting.',
  'update.startFirmware': 'Start firmware',
  'update.recoveryMode': 'Recovery mode',
  'update.reboot': 'Restart',
  'update.rebooting': 'Restarting the controller…',
  'update.sameVersion': 'Same version as on the controller.',
  'update.olderVersion': 'Older version than on the controller ({version}).',
  'update.readError': 'Could not read the file.',
  'update.confirm.title': 'Install firmware?',
  'update.confirm.text':
    '{file} (version {version}) will replace firmware {current} on the controller. Stay connected until the update finishes.',
  'update.confirm.action': 'Install',
  'update.confirm.recoveryTitle': 'Recovery mode?',
  'update.confirm.recoveryText':
    'The controller will start in recovery mode — the flaps will not be controlled until you start the firmware or install a new one.',
  'update.confirm.rebootTitle': 'Restart?',
  'update.confirm.rebootText':
    'The controller will restart; the flaps will not be controlled for a moment.',
  'update.confirm.rebootAction': 'Restart',
  'update.phase.erasing': 'The controller is preparing its memory…',
  'update.phase.sending': 'Sending the firmware…',
  'update.phase.verifying': 'The controller is checking the firmware…',
  'update.phase.restarting': 'Restarting — the controller is installing the new firmware…',
  'update.phase.done': 'Updated',
  'update.phase.failed': 'The update failed',
  'update.phase.aborted': 'Update cancelled — the previous firmware is running.',
  'update.reason.noFirmware': 'no valid firmware',
  'update.reason.crashLoop': 'the watchdog reset the firmware 3 times in a row',
  'update.reason.requested': 'on request',
  'update.reason.unknown': 'unknown reason',
  'update.error.stuckInRecovery': 'The controller stayed in recovery mode ({reason}).',
  'update.error.noFirmware': 'The controller has no valid firmware to start — install it.',
  'update.error.rebootRejected': 'The controller rejected the restart.',
  'update.error.tooBig': 'The file is too large for this controller (at most {max} B).',
  'update.error.rejected': 'The controller rejected the update ({status}).',
  'update.error.oldFirmwareKept': '{message} The controller runs the previous firmware.',
  'update.error.code': 'Update error (code {code}).',
  'update.error.INVALID_SIZE': 'The controller does not accept a file of this size.',
  'update.error.NOT_STARTED':
    'The controller stopped the update (e.g. the session expired) — try again.',
  'update.error.ERASING': 'The controller is still erasing its memory — try again in a moment.',
  'update.error.INVALID_OFFSET': 'Packets arrived in the wrong order — try again.',
  'update.error.INVALID_LENGTH': 'Invalid packet length.',
  'update.error.DATA_MISMATCH': 'A resent packet differs from the stored one — try again.',
  'update.error.INCOMPLETE': 'The controller did not receive the whole file — try again.',
  'update.error.INVALID_IMAGE': 'The controller rejected the file: no header or wrong address.',
  'update.error.WRONG_BOARD': 'The controller rejected the file: it is for a different board.',
  'update.error.CRC_MISMATCH': 'The file got damaged on the way (CRC mismatch) — try again.',
  'update.error.FLASH': 'The controller failed to write its flash memory.',
  'update.error.noRestartResponse': 'The controller is not responding after the restart.',
  'update.error.stopped':
    'The controller stopped responding — update cancelled, the previous firmware is running.',
  'update.error.unsupported':
    'The controller firmware does not support updates over Bluetooth — the bootloader must be flashed with an ST-Link (service).',
  'update.error.restartInterrupted':
    'Connection lost during the restart — reconnect and check the firmware version.',
  'update.error.interrupted':
    'Connection lost — the update did not happen, the previous firmware is running.',
  'image.error.tooSmall':
    'The file is too small for firmware — choose exhaust_flaps_controller.bin.',
  'image.error.tooBig': 'The file is {size}, but the controller accepts at most {max}.',
  'image.error.noHeader':
    'This is not the controller firmware (no header). Is the file older than the bootloader or from another project?',
  'image.error.headerVersion': 'Unknown firmware header version ({version}) — update the app.',
  'image.error.wrongBoard': 'This firmware is for a different board.',
  'image.error.address':
    'The firmware is built for address {address} — the controller needs 0x08020000.',
  'image.error.noSize':
    'Firmware without size and CRC in the header — the file is older than tools/firmware_image.py.',
  'image.error.size':
    'The size in the header ({header} B) does not match the file ({file} B) — the file is truncated or modified.',
  'image.error.crc': 'The file is damaged (CRC mismatch).',
};
