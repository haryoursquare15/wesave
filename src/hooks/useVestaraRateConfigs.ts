import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

import { getUserFriendlyError } from "@/lib/errorMessages";
export type VestaraProductCode = "goalsave" | "vault" | "lockmax" | "upfront_yield";

export interface VestaraRateConfig {
  id: string;
  product_code: VestaraProductCode;
  min_tenor_days: number;
  max_tenor_days: number;
  min_amount: number;
  max_amount: number | null;
  user_rate: number;
  vfd_rate: number;
  is_active: boolean;
  priority: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface RateConfigInput {
  product_code: VestaraProductCode;
  min_tenor_days: number;
  max_tenor_days: number;
  min_amount: number;
  max_amount: number | null;
  user_rate: number;
  vfd_rate: number;
  is_active?: boolean;
  priority?: number;
  notes?: string | null;
}

export function useVestaraRateConfigs() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [configs, setConfigs] = useState<VestaraRateConfig[]>([]);

  const fetchConfigs = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("vestara_rate_configs")
        .select("*")
        .order("product_code", { ascending: true })
        .order("min_tenor_days", { ascending: true })
        .order("priority", { ascending: false });

      if (error) throw error;
      setConfigs((data || []) as VestaraRateConfig[]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load rate configs";
      toast({ title: "Error", description: getUserFriendlyError(msg), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const createConfig = useCallback(
    async (input: RateConfigInput) => {
      setLoading(true);
      try {
        const { error } = await supabase.from("vestara_rate_configs").insert({
          product_code: input.product_code,
          min_tenor_days: input.min_tenor_days,
          max_tenor_days: input.max_tenor_days,
          min_amount: input.min_amount,
          max_amount: input.max_amount,
          user_rate: input.user_rate,
          vfd_rate: input.vfd_rate,
          is_active: input.is_active ?? true,
          priority: input.priority ?? 0,
          notes: input.notes ?? null,
        });
        if (error) throw error;
        toast({ title: "Rate tier created" });
        await fetchConfigs();
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to create";
        toast({ title: "Error", description: getUserFriendlyError(msg), variant: "destructive" });
        return false;
      } finally {
        setLoading(false);
      }
    },
    [toast, fetchConfigs]
  );

  const updateConfig = useCallback(
    async (id: string, patch: Partial<RateConfigInput>) => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("vestara_rate_configs")
          .update(patch)
          .eq("id", id)
          .select("id");
        if (error) throw error;
        if (!data?.length) throw new Error("You don't have permission to change this rate.");
        toast({ title: "Rate tier updated" });
        await fetchConfigs();
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to update";
        toast({ title: "Error", description: getUserFriendlyError(msg), variant: "destructive" });
        return false;
      } finally {
        setLoading(false);
      }
    },
    [toast, fetchConfigs]
  );

  const toggleActive = useCallback(
    (id: string, is_active: boolean) => updateConfig(id, { is_active }),
    [updateConfig]
  );

  const deleteConfig = useCallback(
    async (id: string) => {
      setLoading(true);
      try {
        const { error } = await supabase
          .from("vestara_rate_configs")
          .delete()
          .eq("id", id);
        if (error) throw error;
        toast({ title: "Rate tier deleted" });
        await fetchConfigs();
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to delete";
        toast({ title: "Error", description: getUserFriendlyError(msg), variant: "destructive" });
        return false;
      } finally {
        setLoading(false);
      }
    },
    [toast, fetchConfigs]
  );

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  return {
    loading,
    configs,
    fetchConfigs,
    createConfig,
    updateConfig,
    toggleActive,
    deleteConfig,
  };
}
