import { useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';

/**
 * Custom React Hook to subscribe to Supabase Realtime changes across multiple tables.
 *
 * @param {Array<string|Object>} tables - Array of table names e.g. ['roster_transactions', 'leave_requests']
 *                                       or objects: [{ table: 'roster_transactions', event: '*', filter: 'status=eq.PUBLISHED' }]
 * @param {Function} onEvent - Callback triggered when a realtime event occurs: ({ schema, table, eventType, new, old }) => void
 * @param {Array} deps - React dependency array to re-subscribe if changed (e.g. [currentUser?.id, selectedDate])
 */
export function useRealtimeSync(tables = [], onEvent, deps = []) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!tables || tables.length === 0 || !supabase) return;

    // Generate unique channel name
    const channelId = `realtime_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const channel = supabase.channel(channelId);

    tables.forEach((item) => {
      const config = typeof item === 'string' ? { table: item, event: '*' } : item;
      const { table, event = '*', schema = 'public', filter } = config;

      const subscriptionConfig = {
        event,
        schema,
        table,
        ...(filter ? { filter } : {})
      };

      channel.on('postgres_changes', subscriptionConfig, (payload) => {
        if (typeof onEventRef.current === 'function') {
          onEventRef.current(payload);
        }
      });
    });

    channel.subscribe((status, err) => {
      if (err) {
        console.warn(`[Supabase Realtime] Channel subscribe error on ${channelId}:`, err);
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, deps);
}

export default useRealtimeSync;
