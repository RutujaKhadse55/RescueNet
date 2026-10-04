export interface OemGuide {
  brand: string;
  displayName: string;
  uiSystem: string;
  steps: string[];
  warningNote: string;
}

export const OEM_GUIDES: Record<string, OemGuide> = {
  xiaomi: {
    brand: 'xiaomi',
    displayName: 'Xiaomi / Redmi / POCO',
    uiSystem: 'MIUI / HyperOS',
    steps: [
      'Open Settings -> Apps -> Manage apps -> RescueNet.',
      'Turn ON "Autostart" (allow app to start automatically).',
      'Tap "Battery saver" -> select "No restrictions".',
      'Open Recent Apps screen, long press RescueNet, and tap the Lock icon so it stays in RAM.',
      'In Security app -> Boost speed -> Settings -> Lock apps -> Enable RescueNet.',
    ],
    warningNote: 'MIUI kills background apps within 10 minutes unless No Restrictions is selected.',
  },
  oppo: {
    brand: 'oppo',
    displayName: 'Oppo / Realme',
    uiSystem: 'ColorOS / Realme UI',
    steps: [
      'Open Settings -> App management -> RescueNet.',
      'Tap "Battery usage" -> enable "Allow background activity" & "Allow auto-launch".',
      'Tap Settings -> Battery -> More settings -> Optimize battery use -> RescueNet -> Select "Don\'t optimize".',
      'In Recent Apps screen, pull down on RescueNet and tap Lock.',
    ],
    warningNote: 'ColorOS aggressively suspends Bluetooth advertising when the screen locks.',
  },
  vivo: {
    brand: 'vivo',
    displayName: 'Vivo / iQOO',
    uiSystem: 'Funtouch OS / OriginOS',
    steps: [
      'Open Settings -> Battery -> High background power consumption -> Turn ON RescueNet.',
      'Open Settings -> Applications & Permissions -> Autostart -> Turn ON RescueNet.',
      'In Recent Apps screen, swipe down on RescueNet to lock it.',
      'Disable "Super Power Saving" mode during flood/landslide alerts.',
    ],
    warningNote:
      'Funtouch OS disables background location and BLE scans without High Background Power enabled.',
  },
  samsung: {
    brand: 'samsung',
    displayName: 'Samsung Galaxy',
    uiSystem: 'One UI',
    steps: [
      'Open Settings -> Apps -> RescueNet -> Battery -> Select "Unrestricted".',
      'Open Settings -> Battery and device care -> Battery -> Background usage limits.',
      'Ensure RescueNet is NOT in "Sleeping apps" or "Deep sleeping apps".',
      'Add RescueNet to "Never sleeping apps".',
      'Turn OFF "Put unused apps to sleep".',
    ],
    warningNote: 'One UI moves background mesh apps to Deep Sleep after 3 days of disuse.',
  },
  oneplus: {
    brand: 'oneplus',
    displayName: 'OnePlus',
    uiSystem: 'OxygenOS',
    steps: [
      'Open Settings -> Apps -> App management -> RescueNet -> Battery usage.',
      'Enable "Allow background activity" and "Allow auto-launch".',
      'Open Settings -> Battery -> Advanced settings -> Optimize battery use -> RescueNet -> "Don\'t optimize".',
      'In Recent Apps screen, tap the three dots on RescueNet and select "Lock".',
    ],
    warningNote:
      'OxygenOS sleep standby optimization terminates Bluetooth mesh radio packets overnight.',
  },
};
