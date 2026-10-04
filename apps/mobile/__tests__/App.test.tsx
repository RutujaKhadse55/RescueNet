import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { App } from '../src/App';
import { PROTOCOL_VERSION } from '@rescuenet/core';

describe('RescueNet Mobile Shell & Navigation', () => {
  jest.setTimeout(15000);

  const renderApp = async (): Promise<renderer.ReactTestRenderer> => {
    let component: renderer.ReactTestRenderer | undefined;
    await act(async () => {
      component = renderer.create(<App />);
    });

    // Wait until async initializeApp finishes and renders full UI
    for (let i = 0; i < 30; i++) {
      await act(async () => {
        await new Promise(r => setTimeout(r, 60));
      });
      const textNodes = component!.root.findAll(node => typeof node.props.children === 'string');
      const textValues = textNodes.map(t => t.props.children).join(' ');
      if (!textValues.includes('Initializing RescueNet Mesh')) {
        break;
      }
    }
    return component!;
  };

  test('protocol version is compatible', () => {
    expect(PROTOCOL_VERSION).toBe(1);
  });

  test('boots without crashing in airplane mode and renders Home SOS screen', async () => {
    const component = await renderApp();
    const root = component.root;

    const textNodes = root.findAll(node => typeof node.props.children === 'string');
    const textValues = textNodes.map(t => t.props.children).join(' ');

    expect(textValues).toContain('SOS EMERGENCY');
    expect(textValues).toContain('BLE MESH ACTIVE');
  });

  test('renders 5 bottom tab buttons with accessible TalkBack labels', async () => {
    const component = await renderApp();
    const root = component.root;

    const allTabs = root.findAll(
      node => node.props.accessibilityRole === 'tab' && typeof node.props.onPress === 'function',
    );
    const labels = Array.from(
      new Set(allTabs.map(t => t.props.accessibilityLabel as string).filter(Boolean)),
    );
    expect(labels.length).toBe(5);

    // Verify accessibility labels for TalkBack
    expect(labels.some(l => l.includes('Home tab'))).toBe(true);
    expect(labels.some(l => l.includes('Nearby tab'))).toBe(true);
    expect(labels.some(l => l.includes('Chat tab'))).toBe(true);
    expect(labels.some(l => l.includes('Map tab'))).toBe(true);
    expect(labels.some(l => l.includes('Settings tab'))).toBe(true);
  });

  test('allows navigating between tabs', async () => {
    const component = await renderApp();
    const root = component.root;

    const tabs = root.findAll(node => node.props.accessibilityRole === 'tab');
    const settingsTab = tabs.find(t =>
      Boolean(t.props.accessibilityLabel && t.props.accessibilityLabel.includes('Settings tab')),
    );
    expect(settingsTab).toBeDefined();

    await act(async () => {
      settingsTab!.props.onPress();
    });

    const textNodes = root.findAll(node => typeof node.props.children === 'string');
    const textValues = textNodes.map(t => t.props.children).join(' ');
    expect(textValues).toContain('Danger Zone');
  });

  test('triggers SOS broadcast in under two taps', async () => {
    const component = await renderApp();
    const root = component.root;

    const bypassBtn = root.find(
      node =>
        node.props.accessibilityLabel &&
        node.props.accessibilityLabel.includes('Single-Tap Immediate Emergency Broadcast'),
    );
    expect(bypassBtn).toBeDefined();

    await act(async () => {
      bypassBtn.props.onPress();
    });

    const textNodes = root.findAll(node => typeof node.props.children === 'string');
    const textValues = textNodes.map(t => t.props.children).join(' ');
    expect(textValues).toContain('SOS BROADCASTED TO MESH');
  });
});
