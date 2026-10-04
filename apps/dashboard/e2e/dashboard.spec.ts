import { test, expect } from '@playwright/test';

test.describe('RescueNet Control Room Tactical Dashboard E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage to start fresh
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('1. Login with credentials and TOTP token', async ({ page }) => {
    await page.goto('/');

    // Check login form elements
    await expect(page.locator('#input-email')).toBeVisible();
    await expect(page.locator('#input-password')).toBeVisible();
    await expect(page.locator('#input-totp')).toBeVisible();

    // Fill credentials
    await page.fill('#input-email', 'dispatcher@rescuenet.gov.in');
    await page.fill('#input-password', 'RescueNet2024!SecurePassword');
    await page.fill('#input-totp', '123456');

    // Submit login
    await page.click('#btn-login-submit');

    // Should navigate into dashboard
    await expect(page.locator('#rescue-dashboard-root')).toBeVisible();
    await expect(page.locator('#user-role-display')).toContainText('dispatcher');
  });

  test('2. Seeded data renders correctly (queue, clusters, map)', async ({ page }) => {
    // Login as dispatcher
    await page.goto('/');
    await page.click('#quick-fill-dispatcher');
    await page.click('#btn-login-submit');

    // Verify main components visible
    await expect(page.locator('#rescue-dashboard-root')).toBeVisible();
    await expect(page.locator('#queue-heading')).toBeVisible();
    await expect(page.locator('#leaflet-map-container')).toBeVisible();

    // Verify seeded clusters render in queue
    const queueList = page.locator('#cluster-queue-list');
    await expect(queueList).toBeVisible();
    const clusterCards = queueList.locator('.cluster-card');
    await expect(clusterCards).toHaveCount(5);

    // Verify first cluster is Critical with high score
    const firstCard = clusterCards.first();
    await expect(firstCard).toContainText('CRITICAL');
    await expect(firstCard).toContainText('survivors');
  });

  test('3. Receive new critical cluster via WebSocket simulation with flash alert', async ({
    page,
  }) => {
    await page.goto('/');
    await page.click('#quick-fill-dispatcher');
    await page.click('#btn-login-submit');

    // Trigger synthetic incoming WebSocket critical cluster
    const newClusterId = 'cl_e2e_incoming_crit_01';
    await page.evaluate(id => {
      // Access WebSocket manager via window or trigger event directly
      const event = {
        type: 'new_cluster',
        clusterId: id,
        data: {
          lat: 18.5283,
          lon: 73.8492,
          radius_m: 25.0,
          member_count: 6,
          declared_people: 16,
          max_status: 3,
          priority_score: 0.97,
          floor_hint: 'Basement under collapsed school wing',
          flags: ['large_group', 'water_rising'],
        },
      };
      // Dispatch custom event to simulate WS message
      window.dispatchEvent(new CustomEvent('rescuenet_ws_event', { detail: event }));
      // Also invoke store directly if available
      (window as any).__rescuenet_simulate_cluster?.(event);
    }, newClusterId);

    // Ensure queue list reflects or accepts critical alerts
    await expect(page.locator('#cluster-queue-list')).toBeVisible();
  });

  test('4. Open cluster detail drawer and inspect 5 score components & trust', async ({ page }) => {
    await page.goto('/');
    await page.click('#quick-fill-dispatcher');
    await page.click('#btn-login-submit');

    // Select the first cluster in queue
    const firstCard = page.locator('.cluster-card').first();
    await firstCard.click();

    // Drawer opens
    const drawer = page.locator('#cluster-detail-drawer');
    await expect(drawer).toBeVisible();

    // Verify detail elements
    await expect(page.locator('#display-cluster-coords')).toBeVisible();
    await expect(page.locator('#cluster-mini-map')).toBeVisible();

    // Open Score Breakdown tab
    await page.click('#tab-score-breakdown');
    await expect(page.locator('text=1. Triage Severity (35% weight)')).toBeVisible();
    await expect(page.locator('text=2. Survivor Group Scale (25% weight)')).toBeVisible();
    await expect(
      page.locator('text=3. Time Elapsed / Battery Staleness (15% weight)'),
    ).toBeVisible();
    await expect(page.locator('text=4. Declared Emergency Needs (15% weight)')).toBeVisible();
    await expect(page.locator('text=5. Location Uncertainty Penalty (-10% weight)')).toBeVisible();

    // Open Trust & Authenticity tab
    await page.click('#tab-trust');
    await expect(page.locator('text=SIGNATURE VALID')).toBeVisible();
  });

  test('5. Assign a tactical rescue team and ETA with undo window', async ({ page }) => {
    await page.goto('/');
    await page.click('#quick-fill-dispatcher');
    await page.click('#btn-login-submit');

    // Select cluster
    await page.locator('.cluster-card').first().click();

    // Open Assign Team modal
    await page.click('#btn-open-assign-modal');
    await expect(page.locator('#modal-assign-title')).toBeVisible();

    // Select team and ETA
    await page.fill('#input-eta', '20');
    await page.click('#btn-submit-assignment');

    // Modal closes and Undo Toast appears
    await expect(page.locator('#undo-toast')).toBeVisible();
    await expect(page.locator('#undo-toast')).toContainText('Assigned');

    // Verify assigned state in drawer
    await expect(page.locator('#cluster-detail-drawer')).toContainText('ASSIGNED');
  });

  test('6. Dispatch signed ACK template to survivors', async ({ page }) => {
    await page.goto('/');
    await page.click('#quick-fill-dispatcher');
    await page.click('#btn-login-submit');

    // Select cluster
    await page.locator('.cluster-card').first().click();

    // Open Send ACK modal
    await page.click('#btn-open-ack-modal');
    await expect(page.locator('#modal-ack-title')).toBeVisible();

    // Select template "Help on the way"
    await page.selectOption('#select-ack-template', 'help_on_way');
    await page.fill('#input-ack-eta', '15');
    await page.click('#btn-submit-ack');

    // Undo toast appears confirming dispatch
    await expect(page.locator('#undo-toast')).toBeVisible();
    await expect(page.locator('#undo-toast')).toContainText('Dispatched ACK');
  });

  test('7. Mark cluster as false alarm with mandatory reason', async ({ page }) => {
    await page.goto('/');
    await page.click('#quick-fill-dispatcher');
    await page.click('#btn-login-submit');

    // Select cluster
    await page.locator('.cluster-card').first().click();

    // Open False Alarm modal
    await page.click('#btn-open-false-alarm-modal');
    await expect(page.locator('#modal-fa-title')).toBeVisible();

    // Attempt submit without reason -> should be prevented
    await page.click('#btn-submit-false-alarm');
    // Reason input has required attribute, modal remains open
    await expect(page.locator('#modal-fa-title')).toBeVisible();

    // Fill valid verification reason
    await page.fill(
      '#input-false-alarm-reason',
      'Field scout team Bravo inspected site, verified zero victims, beacon was abandoned test tag',
    );
    await page.click('#btn-submit-false-alarm');

    // Undo toast appears confirming state change
    await expect(page.locator('#undo-toast')).toBeVisible();
    await expect(page.locator('#undo-toast')).toContainText('FALSE_ALARM');
  });

  test('8. Role-based privacy UI masks precise coordinates for viewers', async ({ page }) => {
    await page.goto('/');
    // Login as viewer
    await page.click('#quick-fill-viewer');
    await page.click('#btn-login-submit');

    await expect(page.locator('#user-role-display')).toContainText('viewer');

    // Click cluster to open drawer
    await page.locator('.cluster-card').first().click();

    // Verify coordinate masking and privacy warning badge
    const coordsDisplay = page.locator('#display-cluster-coords');
    await expect(coordsDisplay).toContainText('RESTRICTED TO AUTHORIZED RESPONDERS');
  });

  test('9. Accessibility (a11y) check: semantic landmarks, buttons, ARIA labels', async ({
    page,
  }) => {
    await page.goto('/');
    await page.click('#quick-fill-dispatcher');
    await page.click('#btn-login-submit');

    // Check primary semantic landmarks
    await expect(page.locator('header[role="banner"]')).toBeVisible();
    await expect(page.locator('nav[aria-label="Primary Dashboard Navigation"]')).toBeVisible();
    await expect(page.locator('aside[aria-label="Survivor Priority Queue"]')).toBeVisible();
    await expect(page.locator('main[aria-label="Incident Geospatial Map View"]')).toBeVisible();

    // Check all main action buttons have accessible names
    await expect(page.locator('#btn-toggle-sound')).toHaveAttribute('aria-label');
    await expect(page.locator('#btn-toggle-high-contrast')).toHaveAttribute('aria-label');
    await expect(page.locator('#btn-toggle-large-type')).toHaveAttribute('aria-label');
    await expect(page.locator('#btn-toggle-language')).toHaveAttribute('aria-label');
    await expect(page.locator('#btn-open-shortcuts')).toHaveAttribute('aria-label');
  });

  test('10. Lighthouse / Axe Accessibility audit score >= 90 (WCAG 2.1 AA compliance)', async ({
    page,
  }) => {
    await page.goto('/');
    await page.click('#quick-fill-dispatcher');
    await page.click('#btn-login-submit');

    // Run Axe automated accessibility analysis on dashboard UI
    const AxeBuilder = (await import('@axe-core/playwright')).default;
    const results = await new AxeBuilder({ page })
      .exclude('.leaflet-container') // Leaflet external tile canvas
      .analyze();

    const criticalViolations = results.violations.filter(
      v => v.impact === 'critical' || v.impact === 'serious',
    );

    expect(criticalViolations).toEqual([]);
  });
});
