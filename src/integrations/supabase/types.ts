export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          ip_address: string | null
          resource_id: string | null
          resource_type: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          resource_id?: string | null
          resource_type: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          resource_id?: string | null
          resource_type?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          created_at: string
          group_id: string
          id: string
          message: string
          message_type: string | null
          metadata: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          message: string
          message_type?: string | null
          metadata?: Json | null
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          message?: string
          message_type?: string | null
          metadata?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "public_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "thrift_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      contribution_audit: {
        Row: {
          amount: number
          contribution_type: string
          created_at: string
          cycle_id: string
          group_id: string
          id: string
          status: string
          user_id: string
        }
        Insert: {
          amount: number
          contribution_type?: string
          created_at?: string
          cycle_id: string
          group_id: string
          id?: string
          status?: string
          user_id: string
        }
        Update: {
          amount?: number
          contribution_type?: string
          created_at?: string
          cycle_id?: string
          group_id?: string
          id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contribution_audit_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "contribution_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contribution_audit_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "public_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contribution_audit_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "thrift_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      contribution_cycles: {
        Row: {
          completed_at: string | null
          contribution_deadline: string | null
          created_at: string
          cycle_number: number
          group_id: string
          id: string
          payout_amount: number | null
          payout_date: string | null
          payout_recipient_id: string | null
          platform_fee: number | null
          status: string | null
          total_contributions: number | null
        }
        Insert: {
          completed_at?: string | null
          contribution_deadline?: string | null
          created_at?: string
          cycle_number: number
          group_id: string
          id?: string
          payout_amount?: number | null
          payout_date?: string | null
          payout_recipient_id?: string | null
          platform_fee?: number | null
          status?: string | null
          total_contributions?: number | null
        }
        Update: {
          completed_at?: string | null
          contribution_deadline?: string | null
          created_at?: string
          cycle_number?: number
          group_id?: string
          id?: string
          payout_amount?: number | null
          payout_date?: string | null
          payout_recipient_id?: string | null
          platform_fee?: number | null
          status?: string | null
          total_contributions?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contribution_cycles_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "public_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contribution_cycles_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "thrift_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      cycle_contributions: {
        Row: {
          amount: number
          contributed_at: string | null
          created_at: string
          cycle_id: string
          flw_transaction_ref: string | null
          group_id: string
          id: string
          status: string | null
          user_id: string
        }
        Insert: {
          amount: number
          contributed_at?: string | null
          created_at?: string
          cycle_id: string
          flw_transaction_ref?: string | null
          group_id: string
          id?: string
          status?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          contributed_at?: string | null
          created_at?: string
          cycle_id?: string
          flw_transaction_ref?: string | null
          group_id?: string
          id?: string
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cycle_contributions_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "contribution_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cycle_contributions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "public_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cycle_contributions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "thrift_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      group_invitations: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string | null
          group_id: string
          id: string
          invite_token: string
          max_uses: number | null
          use_count: number | null
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at?: string | null
          group_id: string
          id?: string
          invite_token?: string
          max_uses?: number | null
          use_count?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string | null
          group_id?: string
          id?: string
          invite_token?: string
          max_uses?: number | null
          use_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "group_invitations_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "public_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_invitations_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "thrift_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      group_memberships: {
        Row: {
          flw_mandate_id: string | null
          group_id: string
          has_contributed_this_cycle: boolean | null
          has_received_payout: boolean | null
          has_used_swap: boolean | null
          id: string
          joined_at: string | null
          mandate_status: string | null
          payout_position: number | null
          status: Database["public"]["Enums"]["membership_status"]
          user_id: string
        }
        Insert: {
          flw_mandate_id?: string | null
          group_id: string
          has_contributed_this_cycle?: boolean | null
          has_received_payout?: boolean | null
          has_used_swap?: boolean | null
          id?: string
          joined_at?: string | null
          mandate_status?: string | null
          payout_position?: number | null
          status?: Database["public"]["Enums"]["membership_status"]
          user_id: string
        }
        Update: {
          flw_mandate_id?: string | null
          group_id?: string
          has_contributed_this_cycle?: boolean | null
          has_received_payout?: boolean | null
          has_used_swap?: boolean | null
          id?: string
          joined_at?: string | null
          mandate_status?: string | null
          payout_position?: number | null
          status?: Database["public"]["Enums"]["membership_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_memberships_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "public_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_memberships_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "thrift_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      group_wallets: {
        Row: {
          contribution_balance: number | null
          created_at: string | null
          group_id: string
          id: string
          updated_at: string | null
        }
        Insert: {
          contribution_balance?: number | null
          created_at?: string | null
          group_id: string
          id?: string
          updated_at?: string | null
        }
        Update: {
          contribution_balance?: number | null
          created_at?: string | null
          group_id?: string
          id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "group_wallets_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: true
            referencedRelation: "public_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_wallets_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: true
            referencedRelation: "thrift_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      member_invites: {
        Row: {
          created_at: string
          group_id: string
          id: string
          invitee_id: string
          inviter_id: string
          responded_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          invitee_id: string
          inviter_id: string
          responded_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          invitee_id?: string
          inviter_id?: string
          responded_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_invites_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "public_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_invites_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "thrift_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      payouts: {
        Row: {
          created_at: string
          cycle_id: string
          flw_transfer_id: string | null
          flw_transfer_ref: string | null
          gross_amount: number
          group_id: string
          id: string
          net_amount: number
          platform_fee: number
          processed_at: string | null
          recipient_id: string
          status: string | null
        }
        Insert: {
          created_at?: string
          cycle_id: string
          flw_transfer_id?: string | null
          flw_transfer_ref?: string | null
          gross_amount: number
          group_id: string
          id?: string
          net_amount: number
          platform_fee: number
          processed_at?: string | null
          recipient_id: string
          status?: string | null
        }
        Update: {
          created_at?: string
          cycle_id?: string
          flw_transfer_id?: string | null
          flw_transfer_ref?: string | null
          gross_amount?: number
          group_id?: string
          id?: string
          net_amount?: number
          platform_fee?: number
          processed_at?: string | null
          recipient_id?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payouts_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "contribution_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "public_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "thrift_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_invitees: {
        Row: {
          created_at: string
          email: string | null
          group_id: string
          id: string
          invite_token: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          group_id: string
          id?: string
          invite_token: string
        }
        Update: {
          created_at?: string
          email?: string | null
          group_id?: string
          id?: string
          invite_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_invitees_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "public_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_invitees_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "thrift_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_join_requests: {
        Row: {
          created_at: string | null
          group_id: string
          id: string
          status: Database["public"]["Enums"]["request_status"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          group_id: string
          id?: string
          status?: Database["public"]["Enums"]["request_status"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          group_id?: string
          id?: string
          status?: Database["public"]["Enums"]["request_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_join_requests_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "public_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_join_requests_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "thrift_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      position_swap_requests: {
        Row: {
          created_at: string
          group_id: string
          id: string
          requester_id: string
          requester_position: number
          responded_at: string | null
          status: string
          target_id: string
          target_position: number
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          requester_id: string
          requester_position: number
          responded_at?: string | null
          status?: string
          target_id: string
          target_position: number
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          requester_id?: string
          requester_position?: number
          responded_at?: string | null
          status?: string
          target_id?: string
          target_position?: number
        }
        Relationships: [
          {
            foreignKeyName: "position_swap_requests_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "public_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "position_swap_requests_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "thrift_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bank_account: string | null
          bank_account_encrypted: string | null
          bank_name: string | null
          bank_name_encrypted: string | null
          bvn: string | null
          bvn_encrypted: string | null
          completed_cycles: number | null
          created_at: string | null
          credit_score: number | null
          email: string | null
          flw_account_reference: string | null
          flw_subaccount_id: string | null
          flw_virtual_account_number: string | null
          flw_virtual_bank_name: string | null
          full_name: string | null
          id: string
          membership_tier: Database["public"]["Enums"]["membership_tier"]
          phone: string | null
          phone_encrypted: string | null
          updated_at: string | null
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          bank_account?: string | null
          bank_account_encrypted?: string | null
          bank_name?: string | null
          bank_name_encrypted?: string | null
          bvn?: string | null
          bvn_encrypted?: string | null
          completed_cycles?: number | null
          created_at?: string | null
          credit_score?: number | null
          email?: string | null
          flw_account_reference?: string | null
          flw_subaccount_id?: string | null
          flw_virtual_account_number?: string | null
          flw_virtual_bank_name?: string | null
          full_name?: string | null
          id: string
          membership_tier?: Database["public"]["Enums"]["membership_tier"]
          phone?: string | null
          phone_encrypted?: string | null
          updated_at?: string | null
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          bank_account?: string | null
          bank_account_encrypted?: string | null
          bank_name?: string | null
          bank_name_encrypted?: string | null
          bvn?: string | null
          bvn_encrypted?: string | null
          completed_cycles?: number | null
          created_at?: string | null
          credit_score?: number | null
          email?: string | null
          flw_account_reference?: string | null
          flw_subaccount_id?: string | null
          flw_virtual_account_number?: string | null
          flw_virtual_bank_name?: string | null
          full_name?: string | null
          id?: string
          membership_tier?: Database["public"]["Enums"]["membership_tier"]
          phone?: string | null
          phone_encrypted?: string | null
          updated_at?: string | null
          username?: string | null
        }
        Relationships: []
      }
      thrift_groups: {
        Row: {
          admin_id: string
          auto_debit: boolean | null
          contribution_amount: number
          contribution_day_of_month: number | null
          contribution_day_of_week: number | null
          contribution_hour: number | null
          contribution_minute: number | null
          created_at: string | null
          current_cycle: number | null
          current_payout_position: number | null
          description: string | null
          flw_subaccount_id: string | null
          id: string
          invite_code: string | null
          max_members: number
          name: string
          next_contribution_date: string | null
          next_payout_date: string | null
          payout_order: string[] | null
          period: Database["public"]["Enums"]["contribution_period"]
          rating: number | null
          status: Database["public"]["Enums"]["group_status"]
          updated_at: string | null
        }
        Insert: {
          admin_id: string
          auto_debit?: boolean | null
          contribution_amount: number
          contribution_day_of_month?: number | null
          contribution_day_of_week?: number | null
          contribution_hour?: number | null
          contribution_minute?: number | null
          created_at?: string | null
          current_cycle?: number | null
          current_payout_position?: number | null
          description?: string | null
          flw_subaccount_id?: string | null
          id?: string
          invite_code?: string | null
          max_members?: number
          name: string
          next_contribution_date?: string | null
          next_payout_date?: string | null
          payout_order?: string[] | null
          period?: Database["public"]["Enums"]["contribution_period"]
          rating?: number | null
          status?: Database["public"]["Enums"]["group_status"]
          updated_at?: string | null
        }
        Update: {
          admin_id?: string
          auto_debit?: boolean | null
          contribution_amount?: number
          contribution_day_of_month?: number | null
          contribution_day_of_week?: number | null
          contribution_hour?: number | null
          contribution_minute?: number | null
          created_at?: string | null
          current_cycle?: number | null
          current_payout_position?: number | null
          description?: string | null
          flw_subaccount_id?: string | null
          id?: string
          invite_code?: string | null
          max_members?: number
          name?: string
          next_contribution_date?: string | null
          next_payout_date?: string | null
          payout_order?: string[] | null
          period?: Database["public"]["Enums"]["contribution_period"]
          rating?: number | null
          status?: Database["public"]["Enums"]["group_status"]
          updated_at?: string | null
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number
          created_at: string | null
          description: string | null
          group_id: string | null
          id: string
          metadata_encrypted: string | null
          reference: string | null
          status: Database["public"]["Enums"]["transaction_status"]
          type: Database["public"]["Enums"]["transaction_type"]
          user_id: string
          wallet_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          description?: string | null
          group_id?: string | null
          id?: string
          metadata_encrypted?: string | null
          reference?: string | null
          status?: Database["public"]["Enums"]["transaction_status"]
          type: Database["public"]["Enums"]["transaction_type"]
          user_id: string
          wallet_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          description?: string | null
          group_id?: string | null
          id?: string
          metadata_encrypted?: string | null
          reference?: string | null
          status?: Database["public"]["Enums"]["transaction_status"]
          type?: Database["public"]["Enums"]["transaction_type"]
          user_id?: string
          wallet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "public_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "thrift_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wallets: {
        Row: {
          available_balance: number | null
          balance_checksum: string | null
          created_at: string | null
          id: string
          locked_balance: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          available_balance?: number | null
          balance_checksum?: string | null
          created_at?: string | null
          id?: string
          locked_balance?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          available_balance?: number | null
          balance_checksum?: string | null
          created_at?: string | null
          id?: string
          locked_balance?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      webhook_events: {
        Row: {
          created_at: string
          event_id: string
          event_type: string
          id: string
          payload: Json
          processed: boolean | null
          processed_at: string | null
        }
        Insert: {
          created_at?: string
          event_id: string
          event_type: string
          id?: string
          payload: Json
          processed?: boolean | null
          processed_at?: string | null
        }
        Update: {
          created_at?: string
          event_id?: string
          event_type?: string
          id?: string
          payload?: Json
          processed?: boolean | null
          processed_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      profiles_public: {
        Row: {
          avatar_url: string | null
          completed_cycles: number | null
          created_at: string | null
          credit_score: number | null
          full_name: string | null
          id: string | null
          membership_tier: Database["public"]["Enums"]["membership_tier"] | null
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          completed_cycles?: number | null
          created_at?: string | null
          credit_score?: number | null
          full_name?: string | null
          id?: string | null
          membership_tier?:
            | Database["public"]["Enums"]["membership_tier"]
            | null
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          completed_cycles?: number | null
          created_at?: string | null
          credit_score?: number | null
          full_name?: string | null
          id?: string | null
          membership_tier?:
            | Database["public"]["Enums"]["membership_tier"]
            | null
          username?: string | null
        }
        Relationships: []
      }
      public_groups: {
        Row: {
          contribution_amount: number | null
          id: string | null
          max_members: number | null
          member_count: number | null
          name: string | null
          pending_requests: number | null
          period: Database["public"]["Enums"]["contribution_period"] | null
          rating: number | null
          status: Database["public"]["Enums"]["group_status"] | null
        }
        Insert: {
          contribution_amount?: number | null
          id?: string | null
          max_members?: number | null
          member_count?: never
          name?: string | null
          pending_requests?: never
          period?: Database["public"]["Enums"]["contribution_period"] | null
          rating?: number | null
          status?: Database["public"]["Enums"]["group_status"] | null
        }
        Update: {
          contribution_amount?: number | null
          id?: string | null
          max_members?: number | null
          member_count?: never
          name?: string | null
          pending_requests?: never
          period?: Database["public"]["Enums"]["contribution_period"] | null
          rating?: number | null
          status?: Database["public"]["Enums"]["group_status"] | null
        }
        Relationships: []
      }
    }
    Functions: {
      add_member_to_group: {
        Args: { target_group_id: string; target_user_id: string }
        Returns: Json
      }
      admin_assign_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: Json
      }
      admin_get_all_groups: {
        Args: never
        Returns: {
          admin_id: string
          admin_name: string
          contribution_amount: number
          created_at: string
          id: string
          member_count: number
          name: string
          period: Database["public"]["Enums"]["contribution_period"]
          status: Database["public"]["Enums"]["group_status"]
        }[]
      }
      admin_get_all_users: {
        Args: never
        Returns: {
          created_at: string
          credit_score: number
          email: string
          full_name: string
          id: string
          membership_tier: Database["public"]["Enums"]["membership_tier"]
          role: Database["public"]["Enums"]["app_role"]
          username: string
        }[]
      }
      admin_get_stats: { Args: never; Returns: Json }
      admin_remove_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: Json
      }
      commence_thrift: { Args: { target_group_id: string }; Returns: Json }
      create_thrift_group: {
        Args: {
          _auto_debit: boolean
          _contribution_amount: number
          _contribution_day_of_month?: number
          _contribution_day_of_week?: number
          _contribution_hour?: number
          _contribution_minute?: number
          _max_members: number
          _name: string
          _period: Database["public"]["Enums"]["contribution_period"]
        }
        Returns: {
          admin_id: string
          auto_debit: boolean | null
          contribution_amount: number
          contribution_day_of_month: number | null
          contribution_day_of_week: number | null
          contribution_hour: number | null
          contribution_minute: number | null
          created_at: string | null
          current_cycle: number | null
          current_payout_position: number | null
          description: string | null
          flw_subaccount_id: string | null
          id: string
          invite_code: string | null
          max_members: number
          name: string
          next_contribution_date: string | null
          next_payout_date: string | null
          payout_order: string[] | null
          period: Database["public"]["Enums"]["contribution_period"]
          rating: number | null
          status: Database["public"]["Enums"]["group_status"]
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "thrift_groups"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      credit_wallet_atomic: {
        Args: {
          _amount: number
          _description?: string
          _tx_ref: string
          _user_id: string
        }
        Returns: Json
      }
      gen_random_bytes: { Args: { n: number }; Returns: string }
      gen_random_uuid: { Args: never; Returns: string }
      get_payout_order: {
        Args: { target_group_id: string }
        Returns: {
          member_avatar_url: string
          member_full_name: string
          member_has_received_payout: boolean
          member_user_id: string
          member_username: string
          payout_position: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_group_admin: { Args: { _group_id: string }; Returns: boolean }
      is_group_member: { Args: { _group_id: string }; Returns: boolean }
      join_group_via_invite: { Args: { token: string }; Returns: Json }
      log_audit_event: {
        Args: {
          _action: string
          _details?: Json
          _resource_id?: string
          _resource_type: string
          _user_id: string
        }
        Returns: string
      }
      process_contribution_atomic: {
        Args: { _amount: number; _group_id: string; _user_id: string }
        Returns: Json
      }
      process_payout_atomic: {
        Args: { _admin_id: string; _group_id: string }
        Returns: Json
      }
      process_payout_internal: { Args: { _group_id: string }; Returns: Json }
      request_position_swap: {
        Args: { _group_id: string; _target_user_id: string }
        Returns: Json
      }
      respond_to_invite: {
        Args: { accept: boolean; invite_id: string }
        Returns: Json
      }
      respond_to_swap_request: {
        Args: { _accept: boolean; _request_id: string }
        Returns: Json
      }
      search_users: {
        Args: { search_term: string }
        Returns: {
          avatar_url: string
          credit_score: number
          full_name: string
          id: string
          membership_tier: Database["public"]["Enums"]["membership_tier"]
          username: string
        }[]
      }
      send_member_invite: {
        Args: { target_group_id: string; target_user_id: string }
        Returns: Json
      }
      validate_invite_token: {
        Args: { token: string }
        Returns: {
          contribution_amount: number
          error_message: string
          group_id: string
          group_name: string
          max_members: number
          member_count: number
          period: Database["public"]["Enums"]["contribution_period"]
          valid: boolean
        }[]
      }
      verify_pending_transaction: {
        Args: { amount: number; tx_ref: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      contribution_period: "daily" | "weekly" | "monthly"
      group_status: "pending" | "active" | "completed" | "paused"
      membership_status: "active" | "pending" | "removed"
      membership_tier: "gold" | "silver" | "bronze" | "newbie"
      request_status: "pending" | "approved" | "rejected"
      transaction_status: "pending" | "completed" | "failed"
      transaction_type:
        | "contribution"
        | "payout"
        | "funding"
        | "withdrawal"
        | "lock"
        | "unlock"
        | "service_fee"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
      contribution_period: ["daily", "weekly", "monthly"],
      group_status: ["pending", "active", "completed", "paused"],
      membership_status: ["active", "pending", "removed"],
      membership_tier: ["gold", "silver", "bronze", "newbie"],
      request_status: ["pending", "approved", "rejected"],
      transaction_status: ["pending", "completed", "failed"],
      transaction_type: [
        "contribution",
        "payout",
        "funding",
        "withdrawal",
        "lock",
        "unlock",
        "service_fee",
      ],
    },
  },
} as const
