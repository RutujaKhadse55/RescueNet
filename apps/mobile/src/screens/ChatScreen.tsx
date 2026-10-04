import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { colors, layout, spacing, typography } from '../theme';
import { useTranslation } from '../i18n/LanguageContext';
import { ChatMessageRecord, ConversationRecord } from '../db/repositories/ChatRepository';

export interface ChatChannel {
  id: string;
  name: string;
  role: 'rescuer' | 'survivor' | 'broadcast';
  subtitle: string;
  badge?: string;
  isAssignedTeam?: boolean;
}

interface ChatScreenProps {
  conversations?: ConversationRecord[];
  messages?: ChatMessageRecord[];
  activeChannelId?: string;
  assignedTeam?: string | null;
  onSelectChannel?: (channelId: string) => void;
  onSendMessage?: (content: string, channelId?: string) => void;
}

export const ChatScreen: React.FC<ChatScreenProps> = ({
  conversations = [],
  messages = [],
  activeChannelId = 'conv_local_mesh',
  assignedTeam,
  onSelectChannel,
  onSendMessage,
}) => {
  const { t } = useTranslation();
  const [inputText, setInputText] = useState('');
  const [currentChannelId, setCurrentChannelId] = useState(activeChannelId);

  useEffect(() => {
    if (activeChannelId) {
      setCurrentChannelId(activeChannelId);
    }
  }, [activeChannelId]);

  const channels: ChatChannel[] = [
    {
      id: 'conv_local_mesh',
      name: 'Survivor B (Priya Patil)',
      role: 'survivor',
      subtitle: 'Cluster #cl_pune_ghats_01 • 25m away',
      badge: 'NEARBY PEER',
    },
    {
      id: 'conv_survivor_c',
      name: 'Survivor C (Amit Deshmukh)',
      role: 'survivor',
      subtitle: 'Cluster #cl_pune_ghats_01 • Trapped',
      badge: 'NEARBY PEER',
    },
    {
      id: 'conv_survivor_d',
      name: 'Survivor D (Sunil Kulkarni)',
      role: 'survivor',
      subtitle: 'Cluster #cl_pune_ghats_01 • Safe Platform',
      badge: 'NEARBY PEER',
    },
    {
      id: 'team_alpha_chat',
      name: assignedTeam || 'Rescue Team Alpha',
      role: 'rescuer',
      subtitle: assignedTeam ? `${assignedTeam} • Dispatched Unit (TR-01)` : 'Pending Dispatcher Allocation',
      badge: assignedTeam ? 'DISPATCHED TEAM' : 'AWAITING DISPATCH',
      isAssignedTeam: Boolean(assignedTeam),
    },
    {
      id: 'cl_pune_ghats_01',
      name: 'Cluster Broadcast (#cl_pune)',
      role: 'broadcast',
      subtitle: 'All 5 survivors in Sector 4',
      badge: 'GROUP',
    },
  ];

  const activeChannel: ChatChannel = channels.find((c) => c.id === currentChannelId) ?? channels[0]!;

  const handleSelectChannel = (chId: string) => {
    setCurrentChannelId(chId);
    if (onSelectChannel) {
      onSelectChannel(chId);
    }
  };

  const handleSend = () => {
    if (inputText.trim() && onSendMessage) {
      onSendMessage(inputText.trim(), activeChannel.id);
      setInputText('');
    }
  };

  // Filter messages for current channel or show shared mesh conversation
  const displayMessages = messages.filter(
    (m) =>
      m.conversation_id === activeChannel.id ||
      activeChannel.id === 'conv_local_mesh' ||
      m.conversation_id === 'cl_pune_ghats_01'
  );

  return (
    <View style={styles.container}>
      {/* 1. Channel Selector Carousel */}
      <View style={styles.channelBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.channelScroll}
        >
          {channels.map((ch) => {
            const isActive = ch.id === activeChannel.id;
            return (
              <TouchableOpacity
                key={ch.id}
                style={[
                  styles.channelChip,
                  isActive && styles.channelChipActive,
                  ch.isAssignedTeam && styles.channelChipTeam,
                  ch.isAssignedTeam && isActive && styles.channelChipTeamActive,
                ]}
                onPress={() => handleSelectChannel(ch.id)}
                activeOpacity={0.8}
              >
                <Text style={styles.channelChipIcon}>
                  {ch.role === 'rescuer' ? '🧑‍🚒' : ch.role === 'broadcast' ? '📡' : '📱'}
                </Text>
                <View>
                  <Text
                    style={[
                      styles.channelChipName,
                      isActive && styles.channelChipNameActive,
                    ]}
                  >
                    {ch.name}
                  </Text>
                  {ch.badge && (
                    <Text
                      style={[
                        styles.channelChipBadge,
                        ch.isAssignedTeam ? styles.badgeTeamColor : styles.badgePeerColor,
                      ]}
                    >
                      {ch.badge}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* 2. Active Channel Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.headerIconWrapper}>
            <Text style={styles.headerBigIcon}>
              {activeChannel.role === 'rescuer' ? '🧑‍🚒' : '📱'}
            </Text>
          </View>
          <View>
            <View style={styles.headerTitleRow}>
              <Text style={styles.title}>{activeChannel.name}</Text>
              {activeChannel.isAssignedTeam && (
                <View style={styles.verifiedBadge}>
                  <Text style={styles.verifiedBadgeText}>✓ ASSIGNED</Text>
                </View>
              )}
            </View>
            <Text style={styles.subtitle}>{activeChannel.subtitle}</Text>
          </View>
        </View>

        <View style={styles.e2eBadge}>
          <Text style={styles.e2eText}>🔒 E2E ENCRYPTED</Text>
        </View>
      </View>

      {/* 3. Messages Scroll Area */}
      <ScrollView
        style={styles.messageScroll}
        contentContainerStyle={styles.messageScrollContent}
      >
        {displayMessages.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>💬</Text>
            <Text style={styles.emptyText}>No messages in this channel yet</Text>
            <Text style={styles.emptySubtext}>
              {activeChannel.isAssignedTeam
                ? 'Rescue Team Alpha is connected over Internet/BLE Mesh. Send a message to coordinate triage or provide hazard updates.'
                : 'Send encrypted messages to nearby survivors in your cluster over offline multi-hop BLE mesh.'}
            </Text>
          </View>
        ) : (
          displayMessages.map((m) => {
            const isOutbound = m.direction === 'outbound';
            const isRescuer = m.sender_fp === 'team_alpha' || m.sender_fp.includes('rescuer');

            return (
              <View
                key={m.message_id}
                style={[
                  styles.messageBubbleWrapper,
                  isOutbound ? styles.outboundWrapper : styles.inboundWrapper,
                ]}
              >
                {!isOutbound && (
                  <Text style={styles.senderHeader}>
                    {isRescuer ? '🧑‍🚒 Rescue Team Alpha' : '📱 Nearby Survivor'}
                  </Text>
                )}
                <View
                  style={[
                    styles.messageBubble,
                    isOutbound
                      ? styles.outboundBubble
                      : isRescuer
                      ? styles.rescuerBubble
                      : styles.inboundBubble,
                  ]}
                >
                  <Text style={styles.messageContent}>{m.content}</Text>
                  <View style={styles.messageMetaRow}>
                    <Text style={styles.ttlText}>
                      {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • TTL: {m.ttl} hops
                    </Text>
                    <Text style={styles.statusText}>
                      {m.status === 'delivered'
                        ? '✓✓ Delivered'
                        : m.status === 'relayed'
                        ? '✓ Relayed'
                        : '⏳ Mesh Sent'}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* 4. Bottom Message Composer */}
      <View style={styles.composerBar}>
        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          placeholder={
            activeChannel.isAssignedTeam
              ? 'Message Rescue Team Alpha...'
              : 'Type message to nearby survivor...'
          }
          placeholderTextColor="#64748b"
          multiline={false}
        />
        <TouchableOpacity
          style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!inputText.trim()}
          activeOpacity={0.8}
        >
          <Text style={styles.sendButtonText}>Send</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0f1d',
  },
  channelBar: {
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    paddingVertical: 8,
  },
  channelScroll: {
    paddingHorizontal: spacing.md,
    gap: 8,
  },
  channelChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 6,
  },
  channelChipActive: {
    backgroundColor: '#1e3a8a',
    borderColor: '#3b82f6',
  },
  channelChipTeam: {
    borderColor: '#10b981',
  },
  channelChipTeamActive: {
    backgroundColor: '#064e3b',
    borderColor: '#34d399',
  },
  channelChipIcon: {
    fontSize: 16,
  },
  channelChipName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#cbd5e1',
  },
  channelChipNameActive: {
    color: '#ffffff',
    fontWeight: '800',
  },
  channelChipBadge: {
    fontSize: 8,
    fontWeight: '900',
    marginTop: 1,
  },
  badgeTeamColor: {
    color: '#34d399',
  },
  badgePeerColor: {
    color: '#94a3b8',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  headerIconWrapper: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1e293b',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  headerBigIcon: {
    fontSize: 20,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: '#f8fafc',
  },
  verifiedBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#10b981',
  },
  verifiedBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#34d399',
  },
  subtitle: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 1,
  },
  e2eBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.4)',
  },
  e2eText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#60a5fa',
  },
  messageScroll: {
    flex: 1,
    backgroundColor: '#0a0f1d',
  },
  messageScrollContent: {
    padding: spacing.md,
    gap: 10,
  },
  emptyCard: {
    padding: spacing.xl,
    backgroundColor: '#0f172a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: spacing.sm,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#e2e8f0',
  },
  emptySubtext: {
    fontSize: 11,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 16,
  },
  messageBubbleWrapper: {
    marginBottom: 4,
  },
  outboundWrapper: {
    alignItems: 'flex-end',
  },
  inboundWrapper: {
    alignItems: 'flex-start',
  },
  senderHeader: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94a3b8',
    marginBottom: 2,
    marginLeft: 4,
  },
  messageBubble: {
    maxWidth: '82%',
    padding: 12,
    borderRadius: 14,
  },
  outboundBubble: {
    backgroundColor: '#2563eb',
    borderBottomRightRadius: 2,
  },
  inboundBubble: {
    backgroundColor: '#1e293b',
    borderBottomLeftRadius: 2,
    borderWidth: 1,
    borderColor: '#334155',
  },
  rescuerBubble: {
    backgroundColor: '#064e3b',
    borderBottomLeftRadius: 2,
    borderWidth: 1,
    borderColor: '#059669',
  },
  messageContent: {
    fontSize: 14,
    color: '#ffffff',
    lineHeight: 20,
  },
  messageMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    gap: 8,
  },
  ttlText: {
    fontSize: 9,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  statusText: {
    fontSize: 9,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.9)',
  },
  composerBar: {
    flexDirection: 'row',
    padding: spacing.sm,
    backgroundColor: '#0f172a',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    gap: 8,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#f8fafc',
    borderWidth: 1,
    borderColor: '#334155',
  },
  sendButton: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  sendButtonDisabled: {
    backgroundColor: '#334155',
  },
  sendButtonText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 14,
  },
});
