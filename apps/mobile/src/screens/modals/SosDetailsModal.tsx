import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { TriageStatus, NeedsBitmask } from '@rescuenet/core';
import { useTranslation } from '../../i18n/LanguageContext';
import { SosDetails } from '../../sos/SosController';

interface SosDetailsModalProps {
  visible: boolean;
  onSend: (details: SosDetails) => void;
  onDismiss: () => void;
  initialDetails?: Partial<SosDetails>;
}

export const SosDetailsModal: React.FC<SosDetailsModalProps> = ({
  visible,
  onSend,
  onDismiss,
  initialDetails,
}) => {
  const { t } = useTranslation();

  const [triage, setTriage] = useState<TriageStatus>(
    initialDetails?.triage ?? TriageStatus.CRITICAL,
  );
  const [peopleCount, setPeopleCount] = useState<number>(initialDetails?.peopleCount ?? 1);
  const [needsMask, setNeedsMask] = useState<number>(
    initialDetails?.needsMask ?? NeedsBitmask.MEDICAL,
  );
  const [shortNote, setShortNote] = useState<string>(initialDetails?.shortNote ?? '');
  const [contactName, setContactName] = useState<string>(
    initialDetails?.emergencyContactName ?? '',
  );
  const [secondsRemaining, setSecondsRemaining] = useState<number>(10);

  // 10s auto-send timer
  useEffect(() => {
    if (!visible) {
      setSecondsRemaining(10);
      return;
    }

    const timer = setInterval(() => {
      setSecondsRemaining(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          handleSend();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [visible, triage, peopleCount, needsMask, shortNote, contactName]);

  const toggleNeed = (flag: number) => {
    setNeedsMask(prev => prev ^ flag);
  };

  const handleSend = () => {
    onSend({
      triage,
      peopleCount,
      needsMask,
      shortNote: shortNote.slice(0, 24),
      emergencyContactName: contactName.trim() || undefined,
    });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onDismiss}>
      <View style={styles.container}>
        {/* Header with countdown */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('common.details') || 'Emergency Details'}</Text>
          <View style={styles.countdownBadge}>
            <Text style={styles.countdownText}>Auto-sends in {secondsRemaining}s</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Triage / Condition */}
          <Text style={styles.sectionTitle}>Your Condition</Text>
          <View style={styles.triageRow}>
            {[
              { label: 'Critical', value: TriageStatus.CRITICAL, color: '#EF4444', icon: '🚨' },
              { label: 'Trapped', value: TriageStatus.TRAPPED, color: '#F97316', icon: '🏚️' },
              { label: 'Injured', value: TriageStatus.INJURED, color: '#EAB308', icon: '🩹' },
              { label: 'Safe', value: TriageStatus.SAFE, color: '#22C55E', icon: '🛡️' },
            ].map(item => (
              <TouchableOpacity
                key={item.value}
                style={[
                  styles.triageButton,
                  triage === item.value && {
                    borderColor: item.color,
                    backgroundColor: `${item.color}22`,
                  },
                ]}
                onPress={() => setTriage(item.value)}
                accessibilityLabel={`Status: ${item.label}`}
                accessibilityRole="button"
              >
                <Text style={styles.triageIcon}>{item.icon}</Text>
                <Text
                  style={[
                    styles.triageLabel,
                    triage === item.value && { color: item.color, fontWeight: '700' },
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* People Count */}
          <Text style={styles.sectionTitle}>People with you</Text>
          <View style={styles.counterRow}>
            <TouchableOpacity
              style={styles.counterBtn}
              onPress={() => setPeopleCount(p => Math.max(1, p - 1))}
              accessibilityLabel="Decrease number of people"
            >
              <Text style={styles.counterBtnText}>-</Text>
            </TouchableOpacity>
            <Text style={styles.counterValue}>{peopleCount}</Text>
            <TouchableOpacity
              style={styles.counterBtn}
              onPress={() => setPeopleCount(p => Math.min(50, p + 1))}
              accessibilityLabel="Increase number of people"
            >
              <Text style={styles.counterBtnText}>+</Text>
            </TouchableOpacity>
          </View>

          {/* Needs Checklist */}
          <Text style={styles.sectionTitle}>Needs Checklist</Text>
          <View style={styles.needsGrid}>
            {[
              { label: 'Medical Assistance', flag: NeedsBitmask.MEDICAL, icon: '💊' },
              {
                label: 'Food & Drinking Water',
                flag: NeedsBitmask.WATER | NeedsBitmask.FOOD,
                icon: '💧',
              },
              { label: 'Search & Extraction', flag: NeedsBitmask.EVACUATION, icon: '🧗' },
              { label: 'Warmth & Shelter', flag: NeedsBitmask.SHELTER, icon: '⛺' },
            ].map(item => {
              const selected = (needsMask & item.flag) !== 0;
              return (
                <TouchableOpacity
                  key={item.flag}
                  style={[styles.needItem, selected && styles.needItemSelected]}
                  onPress={() => toggleNeed(item.flag)}
                  accessibilityLabel={`${item.label} ${selected ? 'selected' : 'unselected'}`}
                >
                  <Text style={styles.needIcon}>{item.icon}</Text>
                  <Text style={[styles.needLabel, selected && styles.needLabelSelected]}>
                    {item.label}
                  </Text>
                  <Text style={styles.checkboxText}>{selected ? '☑' : '☐'}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Short Note (24 char limit) */}
          <Text style={styles.sectionTitle}>Short Note (Max 24 chars)</Text>
          <TextInput
            style={styles.textInput}
            value={shortNote}
            onChangeText={txt => setShortNote(txt.slice(0, 24))}
            placeholder="e.g. Floor 2 under pillar"
            placeholderTextColor="#6B7280"
            maxLength={24}
            accessibilityLabel="Short emergency note"
          />
          <Text style={styles.charCount}>{shortNote.length} / 24</Text>

          {/* Emergency Contact Name */}
          <Text style={styles.sectionTitle}>Emergency Contact Name</Text>
          <TextInput
            style={styles.textInput}
            value={contactName}
            onChangeText={setContactName}
            placeholder="e.g. Rajesh Kumar"
            placeholderTextColor="#6B7280"
            maxLength={32}
            accessibilityLabel="Emergency contact person name"
          />
        </ScrollView>

        {/* Footer Actions */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.skipBtn}
            onPress={handleSend}
            accessibilityLabel="Skip details and broadcast now"
          >
            <Text style={styles.skipBtnText}>Skip & Send</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.sendBtn}
            onPress={handleSend}
            accessibilityLabel="Submit details and broadcast SOS"
          >
            <Text style={styles.sendBtnText}>Send SOS Now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
    paddingTop: 48,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  headerTitle: {
    color: '#F8FAFC',
    fontSize: 20,
    fontWeight: '800',
  },
  countdownBadge: {
    backgroundColor: '#EF444433',
    borderColor: '#EF4444',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  countdownText: {
    color: '#FCA5A5',
    fontSize: 12,
    fontWeight: '700',
  },
  scrollContent: {
    paddingBottom: 24,
  },
  sectionTitle: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  triageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  triageButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    backgroundColor: '#1E293B',
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#334155',
  },
  triageIcon: {
    fontSize: 22,
    marginBottom: 4,
  },
  triageLabel: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '600',
  },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 8,
    padding: 8,
    justifyContent: 'center',
    gap: 24,
  },
  counterBtn: {
    backgroundColor: '#334155',
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterBtnText: {
    color: '#F8FAFC',
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 28,
  },
  counterValue: {
    color: '#F8FAFC',
    fontSize: 28,
    fontWeight: '800',
    minWidth: 40,
    textAlign: 'center',
  },
  needsGrid: {
    gap: 8,
  },
  needItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  needItemSelected: {
    borderColor: '#38BDF8',
    backgroundColor: '#0369A122',
  },
  needIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  needLabel: {
    flex: 1,
    color: '#E2E8F0',
    fontSize: 14,
  },
  needLabelSelected: {
    color: '#38BDF8',
    fontWeight: '700',
  },
  checkboxText: {
    color: '#38BDF8',
    fontSize: 18,
  },
  textInput: {
    backgroundColor: '#1E293B',
    borderRadius: 8,
    color: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#334155',
  },
  charCount: {
    color: '#64748B',
    fontSize: 12,
    textAlign: 'right',
    marginTop: 4,
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
  },
  skipBtn: {
    flex: 1,
    backgroundColor: '#334155',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  skipBtnText: {
    color: '#CBD5E1',
    fontSize: 16,
    fontWeight: '600',
  },
  sendBtn: {
    flex: 1.5,
    backgroundColor: '#DC2626',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  sendBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
});
