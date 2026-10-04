/**
 * RescueNet In-App "What's New" Modal (Phase 16)
 * Displays release highlights and major system capabilities to survivors and responders.
 */

import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';

interface WhatsNewModalProps {
  visible: boolean;
  onDismiss: () => void;
  appVersion?: string;
}

export const WhatsNewModal: React.FC<WhatsNewModalProps> = ({
  visible,
  onDismiss,
  appVersion = '1.0.0',
}) => {
  const highlights = [
    {
      icon: '🧭',
      title: 'Rescuer Homing Mode',
      desc: 'First responders can lock onto victims via smoothed BLE signal strength trends (Warmer/Colder) with audio-haptic pulses.',
    },
    {
      icon: '🛡️',
      title: '24-Hour Pseudonym Privacy',
      desc: 'Automatic daily key and MAC address rotation protects survivor identities against physical mesh tracking.',
    },
    {
      icon: '🔋',
      title: 'Survival Battery Guard',
      desc: 'When battery drops below 15%, the app locks into Beacon-Only mode, extending life up to 62 hours.',
    },
    {
      icon: '🌐',
      title: '5 Indian Languages',
      desc: 'Full native localized user interface for English, Hindi (हिंदी), Marathi (मराठी), Malayalam (മലയാളം), and Kannada (ಕನ್ನಡ).',
    },
    {
      icon: '📡',
      title: 'Autonomous SMS Fallback',
      desc: 'Transmits compact Base64URL emergency beacons over cellular SMS when internet and mesh relays are unavailable.',
    },
  ];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          <View style={styles.header}>
            <Text style={styles.versionBadge}>RescueNet v{appVersion}</Text>
            <Text style={styles.title}>What's New in RescueNet</Text>
            <Text style={styles.subtitle}>
              Offline emergency mesh and responder homing updates.
            </Text>
          </View>

          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {highlights.map((item, index) => (
              <View key={index} style={styles.highlightRow}>
                <Text style={styles.icon}>{item.icon}</Text>
                <View style={styles.textContainer}>
                  <Text style={styles.itemTitle}>{item.title}</Text>
                  <Text style={styles.itemDesc}>{item.desc}</Text>
                </View>
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity
            style={styles.dismissButton}
            onPress={onDismiss}
            activeOpacity={0.8}
          >
            <Text style={styles.dismissButtonText}>Got It, Stay Prepared</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxHeight: '85%',
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#334155',
  },
  header: {
    marginBottom: 20,
  },
  versionBadge: {
    fontSize: 12,
    fontWeight: '700',
    color: '#38BDF8',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#F8FAFC',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#94A3B8',
    lineHeight: 20,
  },
  list: {
    marginBottom: 20,
  },
  highlightRow: {
    flexDirection: 'row',
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  icon: {
    fontSize: 26,
    marginRight: 14,
    marginTop: 2,
  },
  textContainer: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F1F5F9',
    marginBottom: 2,
  },
  itemDesc: {
    fontSize: 13,
    color: '#94A3B8',
    lineHeight: 18,
  },
  dismissButton: {
    backgroundColor: '#DC2626',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  dismissButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
