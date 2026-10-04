import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, layout, typography } from '../theme';
import { useTranslation } from '../i18n/LanguageContext';

export type TabName = 'home' | 'nearby' | 'chat' | 'map' | 'settings';

interface BottomTabBarProps {
  currentTab: TabName;
  onSelectTab: (tab: TabName) => void;
  unreadChatCount?: number;
  nearbyCount?: number;
}

interface TabDef {
  key: TabName;
  labelKey: string;
  icon: string;
  badgeCount?: number;
  accessibilityHint: string;
}

export const BottomTabBar: React.FC<BottomTabBarProps> = ({
  currentTab,
  onSelectTab,
  unreadChatCount = 0,
  nearbyCount = 0,
}) => {
  const { t } = useTranslation();

  const tabs: TabDef[] = [
    {
      key: 'home',
      labelKey: 'tab.home',
      icon: '🚨',
      accessibilityHint: 'Navigate to Emergency SOS broadcast screen',
    },
    {
      key: 'nearby',
      labelKey: 'tab.nearby',
      icon: '📡',
      badgeCount: nearbyCount,
      accessibilityHint: 'View nearby mesh phones and disaster clusters',
    },
    {
      key: 'chat',
      labelKey: 'tab.chat',
      icon: '💬',
      badgeCount: unreadChatCount,
      accessibilityHint: 'Open tactical emergency mesh chat with rescue responders',
    },
    {
      key: 'map',
      labelKey: 'tab.map',
      icon: '🗺️',
      accessibilityHint: 'View offline disaster map and survivor coordinates',
    },
    {
      key: 'settings',
      labelKey: 'tab.settings',
      icon: '⚙️',
      accessibilityHint: 'Open settings and preparedness status',
    },
  ];

  return (
    <View style={styles.container} accessibilityRole="tablist">
      {tabs.map(tab => {
        const isActive = currentTab === tab.key;
        return (
          <TouchableOpacity
            key={tab.key}
            style={styles.tabButton}
            onPress={() => onSelectTab(tab.key)}
            activeOpacity={0.7}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={`${t(tab.labelKey)} tab`}
            accessibilityHint={tab.accessibilityHint}
          >
            <View style={styles.iconWrapper}>
              <Text style={styles.icon}>{tab.icon}</Text>
              {Boolean(tab.badgeCount && tab.badgeCount > 0) && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {tab.badgeCount! > 99 ? '99+' : tab.badgeCount}
                  </Text>
                </View>
              )}
            </View>
            <Text style={[styles.tabLabel, isActive ? styles.activeLabel : styles.inactiveLabel]}>
              {t(tab.labelKey)}
            </Text>
            {isActive && <View style={styles.activeIndicator} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    height: 64,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
    elevation: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  tabButton: {
    flex: 1,
    height: layout.minTouchSize,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  iconWrapper: {
    position: 'relative',
  },
  icon: {
    fontSize: 21,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -10,
    backgroundColor: '#dc2626',
    borderRadius: layout.borderRadiusFull,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: typography.fontWeights.heavy,
  },
  tabLabel: {
    fontSize: 11,
    marginTop: 3,
  },
  activeLabel: {
    color: '#0f172a',
    fontWeight: '800',
  },
  inactiveLabel: {
    color: '#64748b',
    fontWeight: '500',
  },
  activeIndicator: {
    position: 'absolute',
    bottom: 2,
    width: 28,
    height: 3,
    backgroundColor: '#2563eb',
    borderRadius: 2,
  },
});
