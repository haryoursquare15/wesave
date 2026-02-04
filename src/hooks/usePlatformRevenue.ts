import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface PlatformBalance {
  available_balance: number;
  pending_balance: number;
  total_collected: number;
  last_settlement_at: string | null;
}

interface PlatformLedgerEntry {
  id: string;
  entry_type: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  source_type: string | null;
  source_id: string | null;
  source_user_id: string | null;
  source_group_id: string | null;
  settlement_reference: string | null;
  description: string | null;
  created_at: string;
}

interface PlatformSettlement {
  id: string;
  amount: number;
  status: string;
  bank_account: string | null;
  bank_name: string | null;
  flw_transfer_ref: string | null;
  flw_transfer_id: string | null;
  initiated_at: string;
  completed_at: string | null;
  failure_reason: string | null;
}

interface FeeReport {
  total_fees_collected: number;
  fee_count: number;
  total_payout_volume: number;
  total_settled: number;
  unsettled_balance: number;
  effective_rate: string;
}

export function usePlatformBalance() {
  const [balance, setBalance] = useState<PlatformBalance | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchBalance = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('platform-settlement', {
        body: { action: 'get_platform_balance' }
      });
      
      if (fnError) throw fnError;
      if (!data.success) throw new Error(data.error || 'Failed to fetch balance');
      
      setBalance({
        available_balance: data.available_balance,
        pending_balance: data.pending_balance,
        total_collected: data.total_collected,
        last_settlement_at: data.last_settlement_at,
      });
    } catch (err) {
      console.error('Error fetching platform balance:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  return { balance, loading, error, refetch: fetchBalance };
}

export function usePlatformLedger() {
  const [entries, setEntries] = useState<PlatformLedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchLedger = useCallback(async (limit = 50, offset = 0) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('platform-settlement', {
        body: { action: 'get_platform_ledger', limit, offset }
      });
      
      if (fnError) throw fnError;
      if (!data.success) throw new Error(data.error || 'Failed to fetch ledger');
      
      setEntries(data.entries || []);
    } catch (err) {
      console.error('Error fetching platform ledger:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  return { entries, loading, error, refetch: fetchLedger };
}

export function usePlatformSettlements() {
  const [settlements, setSettlements] = useState<PlatformSettlement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchSettlements = useCallback(async (limit = 50) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('platform-settlement', {
        body: { action: 'get_settlement_history', limit }
      });
      
      if (fnError) throw fnError;
      if (!data.success) throw new Error(data.error || 'Failed to fetch settlements');
      
      setSettlements(data.settlements || []);
    } catch (err) {
      console.error('Error fetching settlements:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  const triggerSettlement = useCallback(async () => {
    try {
      const { data, error: fnError } = await supabase.functions.invoke('platform-settlement', {
        body: { action: 'auto_settle' }
      });
      
      if (fnError) throw fnError;
      if (!data.success && !data.skipped) throw new Error(data.error || 'Settlement failed');
      
      return data;
    } catch (err) {
      console.error('Error triggering settlement:', err);
      throw err;
    }
  }, []);

  return { settlements, loading, error, refetch: fetchSettlements, triggerSettlement };
}

export function useFeeReport() {
  const [report, setReport] = useState<FeeReport | null>(null);
  const [entries, setEntries] = useState<PlatformLedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchReport = useCallback(async (startDate?: string, endDate?: string) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('platform-settlement', {
        body: { 
          action: 'get_fee_report',
          start_date: startDate,
          end_date: endDate
        }
      });
      
      if (fnError) throw fnError;
      if (!data.success) throw new Error(data.error || 'Failed to fetch report');
      
      setReport(data.report);
      setEntries(data.entries || []);
    } catch (err) {
      console.error('Error fetching fee report:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  return { report, entries, loading, error, refetch: fetchReport };
}
