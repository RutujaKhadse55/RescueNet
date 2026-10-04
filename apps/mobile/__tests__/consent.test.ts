import { ConsentRepository, ConsentData } from '../src/db/repositories/ConsentRepository';
import { InMemoryDatabaseDriver } from '../src/db/driver';
import { runMigrations } from '../src/db/migrations';

describe('Consent Repository & First-Run Logic', () => {
  let driver: InMemoryDatabaseDriver;
  let consentRepo: ConsentRepository;

  beforeEach(async () => {
    driver = new InMemoryDatabaseDriver();
    await runMigrations(driver);
    consentRepo = new ConsentRepository(driver);
  });

  afterEach(async () => {
    await driver.close();
  });

  test('reports hasValidConsent = false on fresh install', async () => {
    const valid = await consentRepo.hasValidConsent();
    expect(valid).toBe(false);
    expect(await consentRepo.getLatestConsent()).toBeNull();
  });

  test('saves and retrieves version 1 consent record with opt-in preferences', async () => {
    const preferences: ConsentData = {
      shareGpsLocation: true,
      shareTriageStatus: true,
      shareBatteryLevel: true,
      enableOptionalChat: false,
      enableLiveLocationSharing: false,
      optInName: 'Ramesh Patil',
      optInPhone: '+91 98765 43210',
    };

    await consentRepo.saveConsent(1, preferences);

    const valid = await consentRepo.hasValidConsent();
    expect(valid).toBe(true);

    const record = await consentRepo.getLatestConsent();
    expect(record).not.toBeNull();
    expect(record?.version).toBe(1);
    expect(record?.data.shareGpsLocation).toBe(true);
    expect(record?.data.enableOptionalChat).toBe(false);
    expect(record?.data.optInName).toBe('Ramesh Patil');
    expect(record?.data.optInPhone).toBe('+91 98765 43210');
  });

  test('wiping consent resets valid consent state', async () => {
    const preferences: ConsentData = {
      shareGpsLocation: true,
      shareTriageStatus: true,
      shareBatteryLevel: true,
      enableOptionalChat: true,
      enableLiveLocationSharing: true,
    };

    await consentRepo.saveConsent(1, preferences);
    expect(await consentRepo.hasValidConsent()).toBe(true);

    await consentRepo.wipeConsent();
    expect(await consentRepo.hasValidConsent()).toBe(false);
    expect(await consentRepo.getLatestConsent()).toBeNull();
  });
});
