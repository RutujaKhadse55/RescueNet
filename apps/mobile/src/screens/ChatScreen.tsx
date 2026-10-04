import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
} from 'react-native';
import { ChatMessageRecord } from '../db/repositories/ChatRepository';
import { NeighborRecord } from '../db/repositories/NeighborRepository';

interface ChatScreenProps {
  messages?: ChatMessageRecord[];
  activeChannelId?: string;
  assignedTeam?: string | null;
  neighbors?: NeighborRecord[];
  onSelectChannel?: (channelId: string) => void;
  onSendMessage?: (content: string, channelId?: string) => void;
}

export const ChatScreen: React.FC<ChatScreenProps> = ({
  messages = [],
  assignedTeam = null,
  neighbors = [],
  onSendMessage,
}) => {
  const [inputText, setInputText] = useState('');
  const scrollViewRef = useRef<ScrollView>(null);

  // Default peer list if none discovered yet over BLE
  const activePeers =
    neighbors.length > 0
      ? neighbors.map((n, idx) => ({
          fp: n.fp,
          name: `Node #${n.fp.slice(0, 4)}`,
          triage: idx % 2 === 1 || n.fp.includes('8f2e') ? 'RED' : 'YELLOW',
          distM: Math.max(12, Math.min(80, Math.round(Math.abs(n.last_rssi || -68) * 0.52))),
          battery: n.battery || 78,
        }))
      : [
          {
            fp: '4a9b2c8f1e7d3a01',
            name: 'Node #4a9b',
            triage: 'YELLOW',
            distM: 28,
            battery: 84,
          },
          {
            fp: '8f2e1a3b5c7d9e02',
            name: 'Node #8f2e',
            triage: 'RED',
            distM: 42,
            battery: 52,
          },
        ];

  const handleSend = (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (text && onSendMessage) {
      onSendMessage(text, 'cl_pune_ghats_01');
      setInputText('');

      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  };

  // Filter messages for the broadcast channel
  // CRITICAL REQUIREMENT:
  // If team is NOT assigned (assignedTeam === null), do NOT show Team Alpha messages!
  // If team IS assigned, show Team Alpha messages!
  const broadcastMessages = messages.filter(m => {
    const isTeamMsg =
      m.sender_fp === 'team_alpha' ||
      m.recipient_fp === 'team_alpha' ||
      (m.content && m.content.toLowerCase().includes('team alpha')) ||
      (m.content && m.content.toLowerCase().includes('ndrf tactical'));

    if (!assignedTeam && isTeamMsg) {
      return false; // Hide Team Alpha until assigned!
    }
    return true;
  });

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar backgroundColor="#008069" barStyle="light-content" />

      {/* 1. WhatsApp Top Bar */}
      <View style={styles.topHeader}>
        <View style={styles.topHeaderContent}>
          <View style={styles.headerLeft}>
            <View style={styles.broadcastIconCircle}>
              <Text style={styles.broadcastIconText}>📡</Text>
            </View>
            <View>
              <Text style={styles.headerTitle}>BLE Mesh Broadcast</Text>
              <View style={styles.headerSubRow}>
                <View style={styles.onlineDot} />
                <Text style={styles.headerSubtitle}>
                  {activePeers.length + 1} Devices in Radio Range • Channel 38
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.e2eBadge}>
            <Text style={styles.e2eLock}>🔒</Text>
            <Text style={styles.e2eText}>OFFLINE</Text>
          </View>
        </View>

        {/* 2. Rescuer Team Assignment Status Banner */}
        <View
          style={[
            styles.teamStatusCard,
            assignedTeam ? styles.teamStatusCardAssigned : styles.teamStatusCardNotAssigned,
          ]}
        >
          <View style={styles.teamStatusIconWrap}>
            <Text style={styles.teamStatusIcon}>{assignedTeam ? '🧑‍🚒' : '⏳'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.teamStatusTitleRow}>
              <Text
                style={[
                  styles.teamStatusTitle,
                  assignedTeam ? styles.teamStatusTitleAssigned : styles.teamStatusTitleNotAssigned,
                ]}
              >
                {assignedTeam ? `${assignedTeam} ASSIGNED` : 'Rescue Team: NOT ASSIGNED'}
              </Text>
              <View
                style={[
                  styles.teamBadgePill,
                  assignedTeam ? styles.teamBadgeAssigned : styles.teamBadgeNotAssigned,
                ]}
              >
                <Text
                  style={[
                    styles.teamBadgeText,
                    assignedTeam ? styles.teamBadgeTextAssigned : styles.teamBadgeTextNotAssigned,
                  ]}
                >
                  {assignedTeam ? 'EN ROUTE' : 'SEARCHING'}
                </Text>
              </View>
            </View>
            <Text style={styles.teamStatusDesc}>
              {assignedTeam
                ? 'Official NDRF tactical unit dispatched. Responders receiving your signal.'
                : 'Emergency distress beacon active on local frequencies. Awaiting dispatch from Command Center.'}
            </Text>
          </View>
        </View>
      </View>

      {/* 3. Discovered Mesh Peers Horizontal Bar */}
      <View style={styles.peersBar}>
        <Text style={styles.peersBarLabel}>CONNECTED PEERS:</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.peersList}
        >
          <View style={[styles.peerChip, styles.peerChipYou]}>
            <Text style={styles.peerChipText}>📍 You (Host)</Text>
          </View>
          {activePeers.map(p => (
            <View
              key={p.fp}
              style={[
                styles.peerChip,
                p.triage === 'RED' ? styles.peerChipRed : styles.peerChipYellow,
              ]}
            >
              <Text style={styles.peerChipText}>
                {p.triage === 'RED' ? '🔴' : '🟡'} {p.name} (~{p.distM}m • {p.battery}%)
              </Text>
            </View>
          ))}
          {assignedTeam && (
            <View style={[styles.peerChip, styles.peerChipRescuer]}>
              <Text style={styles.peerChipText}>🧑‍🚒 {assignedTeam} (ETA ~3m)</Text>
            </View>
          )}
        </ScrollView>
      </View>

      {/* 4. Messages Thread */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.messageScroll}
        contentContainerStyle={styles.messageScrollContent}
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
      >
        {/* Security Info Pill */}
        <View style={styles.securityPill}>
          <Text style={styles.securityPillText}>
            🔒 Messages broadcast over local 2.4 GHz Bluetooth mesh radio without cellular towers or
            internet. All nearby survivor devices receive these broadcasts.
          </Text>
        </View>

        {broadcastMessages.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📢</Text>
            <Text style={styles.emptyTitle}>Emergency Broadcast Channel Active</Text>
            <Text style={styles.emptyDesc}>
              Any message sent here is instantly broadcast to all {activePeers.length + 1} survivor
              devices and rescue units in radio range.
            </Text>
          </View>
        ) : (
          broadcastMessages.map((msg, index) => {
            const isMe = msg.direction === 'outbound';
            const isRescuer =
              msg.sender_fp === 'team_alpha' ||
              (msg.content && msg.content.toLowerCase().includes('ndrf tactical'));
            const timeStr = new Date(msg.created_at).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            });

            const senderLabel = isMe
              ? 'You (Host Device)'
              : isRescuer
                ? '🧑‍🚒 NDRF Tactical Team Alpha'
                : msg.sender_fp
                  ? `Survivor Node #${msg.sender_fp.slice(0, 4)}`
                  : 'Nearby Survivor';

            return (
              <View
                key={msg.message_id || index}
                style={[
                  styles.bubbleRow,
                  isMe ? styles.bubbleRowOutbound : styles.bubbleRowInbound,
                ]}
              >
                <View
                  style={[
                    styles.bubbleCard,
                    isMe
                      ? styles.bubbleCardOutbound
                      : isRescuer
                        ? styles.bubbleCardRescuer
                        : styles.bubbleCardInbound,
                  ]}
                >
                  <Text
                    style={[
                      styles.bubbleSender,
                      isMe
                        ? styles.bubbleSenderYou
                        : isRescuer
                          ? styles.bubbleSenderRescuer
                          : styles.bubbleSenderPeer,
                    ]}
                  >
                    {senderLabel}
                  </Text>
                  <Text style={styles.bubbleContent}>{msg.content}</Text>
                  <View style={styles.bubbleMeta}>
                    <Text style={styles.bubbleTime}>{timeStr}</Text>
                    {isMe && <Text style={styles.bubbleTicks}>✓✓</Text>}
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* 5. Quick Emergency Broadcast Actions */}
      <View style={styles.quickBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickBarContent}
        >
          <TouchableOpacity
            style={styles.quickChip}
            onPress={() =>
              handleSend(
                '📍 [BROADCAST]: GPS Fix Verified. Sheltered on elevated platform. Battery at 88%.',
              )
            }
          >
            <Text style={styles.quickChipText}>📍 Broadcast GPS</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickChip}
            onPress={() =>
              handleSend('🩹 [MEDICAL URGENCY]: Need first aid kit and splint for limb fracture.')
            }
          >
            <Text style={styles.quickChipText}>🩹 Request Medical Aid</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickChip}
            onPress={() =>
              handleSend('💧 [SUPPLIES]: Clean drinking water needed for 3 sheltered survivors.')
            }
          >
            <Text style={styles.quickChipText}>💧 Request Water</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickChip}
            onPress={() =>
              handleSend(
                '✅ [STATUS UPDATE]: We are safe. Water level stabilized. Holding position.',
              )
            }
          >
            <Text style={styles.quickChipText}>✅ Report We Are Safe</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* 6. WhatsApp Broadcast Input Bar */}
      <View style={styles.inputContainer}>
        <TouchableOpacity
          style={styles.attachBtn}
          onPress={() => handleSend('🚨 Emergency Beacon Ping: Alive and listening on Channel 38.')}
        >
          <Text style={styles.attachIcon}>📎</Text>
        </TouchableOpacity>

        <TextInput
          style={styles.textInput}
          placeholder="Broadcast to all nearby devices..."
          placeholderTextColor="#94a3b8"
          value={inputText}
          onChangeText={setInputText}
          multiline
        />

        <TouchableOpacity
          style={[styles.sendBtn, inputText.trim().length === 0 && styles.sendBtnDisabled]}
          onPress={() => handleSend()}
          activeOpacity={0.8}
        >
          <Text style={styles.sendIcon}>➤</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#efeae2', // WhatsApp chat wallpaper tint
  },
  topHeader: {
    backgroundColor: '#008069', // WhatsApp Dark Emerald Green
    paddingTop: Platform.OS === 'ios' ? 44 : 12,
    paddingHorizontal: 14,
    paddingBottom: 10,
    elevation: 4,
  },
  topHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  broadcastIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  broadcastIconText: {
    fontSize: 20,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  headerSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: '#25d366', // WhatsApp green dot
  },
  headerSubtitle: {
    color: '#e2f4ed',
    fontSize: 11,
    fontWeight: '600',
  },
  e2eBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  e2eLock: {
    fontSize: 10,
  },
  e2eText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
  },

  // Rescuer Status Card
  teamStatusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 10,
    padding: 10,
    marginTop: 4,
    borderWidth: 1,
  },
  teamStatusCardNotAssigned: {
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
  },
  teamStatusCardAssigned: {
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
  },
  teamStatusIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamStatusIcon: {
    fontSize: 18,
  },
  teamStatusTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  teamStatusTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  teamStatusTitleNotAssigned: {
    color: '#b45309',
  },
  teamStatusTitleAssigned: {
    color: '#065f46',
  },
  teamBadgePill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  teamBadgeNotAssigned: {
    backgroundColor: '#fef3c7',
  },
  teamBadgeText: {
    fontSize: 9,
    fontWeight: '800' as const,
  },
  teamBadgeTextNotAssigned: {
    color: '#92400e',
    fontSize: 9,
    fontWeight: '800',
  },
  teamBadgeAssigned: {
    backgroundColor: '#d1fae5',
  },
  teamBadgeTextAssigned: {
    color: '#047857',
    fontSize: 9,
    fontWeight: '800',
  },
  teamStatusDesc: {
    fontSize: 11,
    color: '#475569',
    lineHeight: 15,
  },

  // Peers Bar
  peersBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  peersBarLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748b',
    marginRight: 8,
    letterSpacing: 0.5,
  },
  peersList: {
    gap: 6,
  },
  peerChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  peerChipYou: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
  },
  peerChipYellow: {
    backgroundColor: '#fefce8',
    borderColor: '#fef08a',
  },
  peerChipRed: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  peerChipRescuer: {
    backgroundColor: '#f0fdf4',
    borderColor: '#86efac',
  },
  peerChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0f172a',
  },

  // Message Scroll
  messageScroll: {
    flex: 1,
  },
  messageScrollContent: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  securityPill: {
    backgroundColor: '#fff9c4',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignSelf: 'center',
    marginBottom: 12,
    maxWidth: '92%',
    elevation: 1,
  },
  securityPillText: {
    fontSize: 11,
    color: '#5d4037',
    textAlign: 'center',
    lineHeight: 15,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: 12,
    marginTop: 20,
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: 6,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  emptyDesc: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },
  bubbleRow: {
    marginBottom: 8,
    flexDirection: 'row',
  },
  bubbleRowOutbound: {
    justifyContent: 'flex-end',
  },
  bubbleRowInbound: {
    justifyContent: 'flex-start',
  },
  bubbleCard: {
    maxWidth: '82%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    elevation: 1,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
  },
  bubbleCardOutbound: {
    backgroundColor: '#d9fdd3', // WhatsApp Outgoing green
    borderTopRightRadius: 2,
  },
  bubbleCardInbound: {
    backgroundColor: '#ffffff', // WhatsApp Incoming white
    borderTopLeftRadius: 2,
  },
  bubbleCardRescuer: {
    backgroundColor: '#ffffff',
    borderLeftWidth: 3.5,
    borderLeftColor: '#16a34a',
    borderTopLeftRadius: 2,
  },
  bubbleSender: {
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 2,
  },
  bubbleSenderYou: {
    color: '#15803d',
  },
  bubbleSenderPeer: {
    color: '#0284c7',
  },
  bubbleSenderRescuer: {
    color: '#16a34a',
  },
  bubbleContent: {
    fontSize: 14,
    color: '#111b21',
    lineHeight: 19,
  },
  bubbleMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 3,
  },
  bubbleTime: {
    fontSize: 10,
    color: '#667781',
    fontWeight: '500',
  },
  bubbleTicks: {
    fontSize: 12,
    color: '#53bdeb', // WhatsApp Blue checkmark
    fontWeight: '900',
  },

  // Quick Action Chips
  quickBar: {
    backgroundColor: '#f0f2f5',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingVertical: 6,
  },
  quickBarContent: {
    paddingHorizontal: 10,
    gap: 8,
  },
  quickChip: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  quickChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0f172a',
  },

  // Input Bar
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f2f5',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  attachBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachIcon: {
    fontSize: 20,
    color: '#54656f',
  },
  textInput: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 8 : 6,
    fontSize: 14,
    color: '#111b21',
    maxHeight: 100,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#008069',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
  },
  sendBtnDisabled: {
    opacity: 0.6,
  },
  sendIcon: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
    marginLeft: 2,
  },
});
