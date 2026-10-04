export interface MonsoonAlertState {
  isMonsoonSeason: boolean;
  alertTitle: string;
  alertMessage: string;
  recommendedActions: string[];
}

export class MonsoonReminderService {
  /**
   * Evaluates whether current date falls within Indian southwest monsoon window (June 1 - Sept 30)
   */
  public static checkMonsoonSeason(date: Date = new Date()): MonsoonAlertState {
    const month = date.getMonth(); // 0-indexed: 5 = June, 6 = July, 7 = August, 8 = September
    const isMonsoon = month >= 5 && month <= 8;

    return {
      isMonsoonSeason: isMonsoon,
      alertTitle: isMonsoon ? 'Monsoon Preparedness Warning' : 'Pre-Monsoon Season Check',
      alertMessage: isMonsoon
        ? 'Active monsoon flood and landslide risks detected across Maharashtra, Kerala, and Himalayan belts. Keep offline map packs downloaded and verify BLE mesh readiness.'
        : 'Monsoon season begins in June. Prepare your emergency mesh profiles and offline maps ahead of time.',
      recommendedActions: [
        'Download your regional offline vector map pack (MBTiles/PMTiles)',
        'Ensure Battery Optimization Exemption is enabled',
        'Keep phone charged and verify SIM card status',
        'Test BLE range with neighboring family members',
      ],
    };
  }
}
