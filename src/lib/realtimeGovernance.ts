import { supabase } from './supabase';
import { UserStatus } from '../types';

export const USER_GOVERNANCE_CHANNEL = 'user-governance-broadcast';

let broadcastChannelInstance: ReturnType<typeof supabase.channel> | null = null;

export function getGovernanceBroadcastChannel() {
  if (!broadcastChannelInstance) {
    broadcastChannelInstance = supabase.channel(USER_GOVERNANCE_CHANNEL);
    broadcastChannelInstance.subscribe();
  }
  return broadcastChannelInstance;
}

/**
 * Instantly broadcasts a user status modification (active, suspended, banned)
 * across the WebSocket layer so target active client sessions react in sub-seconds
 * without requiring manual browser page refreshes.
 */
export async function emitUserStatusChange(userIds: string[], status: UserStatus): Promise<void> {
  if (!userIds || userIds.length === 0) return;

  try {
    const channel = getGovernanceBroadcastChannel();
    await channel.send({
      type: 'broadcast',
      event: 'USER_STATUS_CHANGED',
      payload: {
        userIds,
        status,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.warn('Realtime status broadcast warning:', err);
  }
}
