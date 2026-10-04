import { IDatabaseDriver } from '../driver';

export interface ChatMessageRecord {
  message_id: string;
  conversation_id: string;
  direction: 'inbound' | 'outbound';
  sender_fp: string;
  recipient_fp: string;
  content: string;
  status: 'pending' | 'relayed' | 'delivered' | 'failed';
  ttl: number;
  created_at: string;
}

export interface ConversationRecord {
  conversation_id: string;
  peer_fp: string;
  peer_nickname: string;
  last_message_at: string;
  unread_count: number;
}

export class ChatRepository {
  private driver: IDatabaseDriver;

  constructor(driver: IDatabaseDriver) {
    this.driver = driver;
  }

  async saveMessage(m: ChatMessageRecord): Promise<void> {
    await this.driver.execute(
      `INSERT OR REPLACE INTO chat_messages (
        message_id, conversation_id, direction, sender_fp,
        recipient_fp, content, status, ttl, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        m.message_id,
        m.conversation_id,
        m.direction,
        m.sender_fp,
        m.recipient_fp,
        m.content,
        m.status,
        m.ttl,
        m.created_at,
      ]
    );
  }

  async getMessagesForConversation(conversationId: string, limit: number = 100): Promise<ChatMessageRecord[]> {
    const res = await this.driver.execute<ChatMessageRecord>(
      `SELECT * FROM chat_messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT ${limit};`,
      [conversationId]
    );
    return res.rows;
  }

  async getAllMessages(limit: number = 100): Promise<ChatMessageRecord[]> {
    const res = await this.driver.execute<ChatMessageRecord>(
      `SELECT * FROM chat_messages ORDER BY created_at ASC LIMIT ${limit};`
    );
    return res.rows;
  }

  async updateMessageStatus(messageId: string, status: ChatMessageRecord['status']): Promise<void> {
    await this.driver.execute(
      `UPDATE chat_messages SET status = ? WHERE message_id = ?;`,
      [status, messageId]
    );
  }

  async upsertConversation(c: ConversationRecord): Promise<void> {
    await this.driver.execute(
      `INSERT OR REPLACE INTO conversations (
        conversation_id, peer_fp, peer_nickname, last_message_at, unread_count
      ) VALUES (?, ?, ?, ?, ?);`,
      [c.conversation_id, c.peer_fp, c.peer_nickname, c.last_message_at, c.unread_count]
    );
  }

  async getAllConversations(): Promise<ConversationRecord[]> {
    const res = await this.driver.execute<ConversationRecord>(
      `SELECT * FROM conversations ORDER BY last_message_at DESC;`
    );
    return res.rows;
  }
}
