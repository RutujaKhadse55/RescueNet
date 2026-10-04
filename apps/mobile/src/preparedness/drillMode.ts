export class DrillModeManager {
  private drillActive: boolean = false;

  constructor(initialState: boolean = false) {
    this.drillActive = initialState;
  }

  public isDrillActive(): boolean {
    return this.drillActive;
  }

  public setDrillActive(active: boolean): void {
    this.drillActive = active;
  }

  /**
   * Applies the test_drill flag (bit 3 / 0x08) to packet flags
   */
  public applyDrillFlag(flags: number): number {
    if (this.drillActive) {
      return flags | 0x08; // Set bit 3: test_drill
    }
    return flags & ~0x08; // Clear bit 3
  }
}
