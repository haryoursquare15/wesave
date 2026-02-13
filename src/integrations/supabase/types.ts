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
      account_locks: {
        Row: {
          email: string | null
          id: string
          lock_reason: string
          locked_at: string
          locked_until: string | null
          unlock_code: string | null
          unlocked_at: string | null
          unlocked_by: string | null
          user_id: string | null
        }
        Insert: {
          email?: string | null
          id?: string
          lock_reason: string
          locked_at?: string
          locked_until?: string | null
          unlock_code?: string | null
          unlocked_at?: string | null
          unlocked_by?: string | null
          user_id?: string | null
        }
        Update: {
          email?: string | null
          id?: string
          lock_reason?: string
          locked_at?: string
          locked_until?: string | null
          unlock_code?: string | null
          unlocked_at?: string | null
          unlocked_by?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      admin_permissions: {
        Row: {
          created_at: string
          id: string
          permission: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          created_at?: string
          id?: string
          permission: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          created_at?: string
          id?: string
          permission?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      admin_requests: {
        Row: {
          created_at: string
          id: string
          internal_notes: string | null
          metadata: Json | null
          recommended_action: string | null
          request_type: string
          reviewed_at: string | null
          reviewed_by: string | null
          risk_score: number | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          internal_notes?: string | null
          metadata?: Json | null
          recommended_action?: string | null
          request_type: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          risk_score?: number | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          internal_notes?: string | null
          metadata?: Json | null
          recommended_action?: string | null
          request_type?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          risk_score?: number | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      association_memberships: {
        Row: {
          association_id: string
          id: string
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          association_id: string
          id?: string
          joined_at?: string
          role?: string
          user_id: string
        }
        Update: {
          association_id?: string
          id?: string
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "association_memberships_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
        ]
      }
      association_wallets: {
        Row: {
          association_id: string
          available_balance: number
          created_at: string
          id: string
          updated_at: string
        }
        Insert: {
          association_id: string
          available_balance?: number
          created_at?: string
          id?: string
          updated_at?: string
        }
        Update: {
          association_id?: string
          available_balance?: number
          created_at?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "association_wallets_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: true
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
        ]
      }
      associations: {
        Row: {
          admin_id: string
          created_at: string
          description: string | null
          flw_subaccount_id: string | null
          id: string
          max_members: number
          member_count: number
          name: string
          status: string
          terms_accepted_at: string | null
          updated_at: string
        }
        Insert: {
          admin_id: string
          created_at?: string
          description?: string | null
          flw_subaccount_id?: string | null
          id?: string
          max_members?: number
          member_count?: number
          name: string
          status?: string
          terms_accepted_at?: string | null
          updated_at?: string
        }
        Update: {
          admin_id?: string
          created_at?: string
          description?: string | null
          flw_subaccount_id?: string | null
          id?: string
          max_members?: number
          member_count?: number
          name?: string
          status?: string
          terms_accepted_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
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
      card_tokens: {
        Row: {
          card_expiry: string | null
          card_last4: string | null
          card_token: string
          card_type: string | null
          created_at: string
          id: string
          is_active: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          card_expiry?: string | null
          card_last4?: string | null
          card_token: string
          card_type?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          card_expiry?: string | null
          card_last4?: string | null
          card_token?: string
          card_type?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          updated_at?: string
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
      contribution_retries: {
        Row: {
          contribution_amount: number
          created_at: string
          cycle_id: string
          failure_reason: string | null
          group_id: string
          id: string
          last_retry_at: string | null
          max_retries: number
          next_retry_at: string | null
          payment_source: string | null
          retry_count: number
          status: string
          transaction_reference: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          contribution_amount: number
          created_at?: string
          cycle_id: string
          failure_reason?: string | null
          group_id: string
          id?: string
          last_retry_at?: string | null
          max_retries?: number
          next_retry_at?: string | null
          payment_source?: string | null
          retry_count?: number
          status?: string
          transaction_reference?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          contribution_amount?: number
          created_at?: string
          cycle_id?: string
          failure_reason?: string | null
          group_id?: string
          id?: string
          last_retry_at?: string | null
          max_retries?: number
          next_retry_at?: string | null
          payment_source?: string | null
          retry_count?: number
          status?: string
          transaction_reference?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      credit_score_history: {
        Row: {
          change_amount: number
          change_reason: string
          created_at: string
          id: string
          metadata: Json | null
          reference_id: string | null
          reference_type: string | null
          score_after: number
          score_before: number
          user_id: string
        }
        Insert: {
          change_amount: number
          change_reason: string
          created_at?: string
          id?: string
          metadata?: Json | null
          reference_id?: string | null
          reference_type?: string | null
          score_after: number
          score_before: number
          user_id: string
        }
        Update: {
          change_amount?: number
          change_reason?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          reference_id?: string | null
          reference_type?: string | null
          score_after?: number
          score_before?: number
          user_id?: string
        }
        Relationships: []
      }
      crowdfunding_campaigns: {
        Row: {
          category: string | null
          contributor_count: number
          created_at: string
          creator_id: string
          deadline: string | null
          description: string | null
          flw_subaccount_id: string | null
          id: string
          image_url: string | null
          raised_amount: number
          status: string
          target_amount: number
          title: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          contributor_count?: number
          created_at?: string
          creator_id: string
          deadline?: string | null
          description?: string | null
          flw_subaccount_id?: string | null
          id?: string
          image_url?: string | null
          raised_amount?: number
          status?: string
          target_amount: number
          title: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          contributor_count?: number
          created_at?: string
          creator_id?: string
          deadline?: string | null
          description?: string | null
          flw_subaccount_id?: string | null
          id?: string
          image_url?: string | null
          raised_amount?: number
          status?: string
          target_amount?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      crowdfunding_contributions: {
        Row: {
          amount: number
          anonymous: boolean
          campaign_id: string
          contributor_id: string
          created_at: string
          id: string
          message: string | null
          status: string
        }
        Insert: {
          amount: number
          anonymous?: boolean
          campaign_id: string
          contributor_id: string
          created_at?: string
          id?: string
          message?: string | null
          status?: string
        }
        Update: {
          amount?: number
          anonymous?: boolean
          campaign_id?: string
          contributor_id?: string
          created_at?: string
          id?: string
          message?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "crowdfunding_contributions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "crowdfunding_campaigns"
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
      ledger_entries: {
        Row: {
          amount: number
          balance_after: number
          balance_before: number
          created_at: string
          description: string | null
          entry_type: string
          id: string
          locked_after: number
          locked_before: number
          metadata: Json | null
          reference_id: string | null
          reference_type: string
          user_id: string
          wallet_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          balance_before: number
          created_at?: string
          description?: string | null
          entry_type: string
          id?: string
          locked_after?: number
          locked_before?: number
          metadata?: Json | null
          reference_id?: string | null
          reference_type: string
          user_id: string
          wallet_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          balance_before?: number
          created_at?: string
          description?: string | null
          entry_type?: string
          id?: string
          locked_after?: number
          locked_before?: number
          metadata?: Json | null
          reference_id?: string | null
          reference_type?: string
          user_id?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      login_attempts: {
        Row: {
          created_at: string
          device_fingerprint: string | null
          email: string
          failure_reason: string | null
          id: string
          ip_address: string | null
          success: boolean
        }
        Insert: {
          created_at?: string
          device_fingerprint?: string | null
          email: string
          failure_reason?: string | null
          id?: string
          ip_address?: string | null
          success?: boolean
        }
        Update: {
          created_at?: string
          device_fingerprint?: string | null
          email?: string
          failure_reason?: string | null
          id?: string
          ip_address?: string | null
          success?: boolean
        }
        Relationships: []
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
      platform_ledger: {
        Row: {
          amount: number
          balance_after: number
          balance_before: number
          created_at: string
          description: string | null
          entry_type: string
          id: string
          metadata: Json | null
          settlement_reference: string | null
          source_group_id: string | null
          source_id: string | null
          source_type: string | null
          source_user_id: string | null
        }
        Insert: {
          amount: number
          balance_after: number
          balance_before: number
          created_at?: string
          description?: string | null
          entry_type: string
          id?: string
          metadata?: Json | null
          settlement_reference?: string | null
          source_group_id?: string | null
          source_id?: string | null
          source_type?: string | null
          source_user_id?: string | null
        }
        Update: {
          amount?: number
          balance_after?: number
          balance_before?: number
          created_at?: string
          description?: string | null
          entry_type?: string
          id?: string
          metadata?: Json | null
          settlement_reference?: string | null
          source_group_id?: string | null
          source_id?: string | null
          source_type?: string | null
          source_user_id?: string | null
        }
        Relationships: []
      }
      platform_settlements: {
        Row: {
          amount: number
          bank_account: string | null
          bank_name: string | null
          completed_at: string | null
          failure_reason: string | null
          flw_transfer_id: string | null
          flw_transfer_ref: string | null
          id: string
          initiated_at: string
          initiated_by: string | null
          metadata: Json | null
          status: string
        }
        Insert: {
          amount: number
          bank_account?: string | null
          bank_name?: string | null
          completed_at?: string | null
          failure_reason?: string | null
          flw_transfer_id?: string | null
          flw_transfer_ref?: string | null
          id?: string
          initiated_at?: string
          initiated_by?: string | null
          metadata?: Json | null
          status?: string
        }
        Update: {
          amount?: number
          bank_account?: string | null
          bank_name?: string | null
          completed_at?: string | null
          failure_reason?: string | null
          flw_transfer_id?: string | null
          flw_transfer_ref?: string | null
          id?: string
          initiated_at?: string
          initiated_by?: string | null
          metadata?: Json | null
          status?: string
        }
        Relationships: []
      }
      platform_wallet: {
        Row: {
          available_balance: number
          created_at: string
          id: string
          last_settlement_at: string | null
          pending_balance: number
          total_collected: number
          updated_at: string
          wallet_type: string
        }
        Insert: {
          available_balance?: number
          created_at?: string
          id?: string
          last_settlement_at?: string | null
          pending_balance?: number
          total_collected?: number
          updated_at?: string
          wallet_type: string
        }
        Update: {
          available_balance?: number
          created_at?: string
          id?: string
          last_settlement_at?: string | null
          pending_balance?: number
          total_collected?: number
          updated_at?: string
          wallet_type?: string
        }
        Relationships: []
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
          account_status: string | null
          avatar_url: string | null
          bank_account: string | null
          bank_account_encrypted: string | null
          bank_details_changed_at: string | null
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
          freeze_reason: string | null
          frozen_at: string | null
          frozen_by: string | null
          full_name: string | null
          id: string
          id_document_url: string | null
          id_number: string | null
          id_type: string | null
          kyc_status: string | null
          last_security_review: string | null
          membership_tier: Database["public"]["Enums"]["membership_tier"]
          onboarding_completed: boolean | null
          phone: string | null
          phone_encrypted: string | null
          risk_level: string | null
          updated_at: string | null
          username: string | null
          utility_bill_url: string | null
        }
        Insert: {
          account_status?: string | null
          avatar_url?: string | null
          bank_account?: string | null
          bank_account_encrypted?: string | null
          bank_details_changed_at?: string | null
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
          freeze_reason?: string | null
          frozen_at?: string | null
          frozen_by?: string | null
          full_name?: string | null
          id: string
          id_document_url?: string | null
          id_number?: string | null
          id_type?: string | null
          kyc_status?: string | null
          last_security_review?: string | null
          membership_tier?: Database["public"]["Enums"]["membership_tier"]
          onboarding_completed?: boolean | null
          phone?: string | null
          phone_encrypted?: string | null
          risk_level?: string | null
          updated_at?: string | null
          username?: string | null
          utility_bill_url?: string | null
        }
        Update: {
          account_status?: string | null
          avatar_url?: string | null
          bank_account?: string | null
          bank_account_encrypted?: string | null
          bank_details_changed_at?: string | null
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
          freeze_reason?: string | null
          frozen_at?: string | null
          frozen_by?: string | null
          full_name?: string | null
          id?: string
          id_document_url?: string | null
          id_number?: string | null
          id_type?: string | null
          kyc_status?: string | null
          last_security_review?: string | null
          membership_tier?: Database["public"]["Enums"]["membership_tier"]
          onboarding_completed?: boolean | null
          phone?: string | null
          phone_encrypted?: string | null
          risk_level?: string | null
          updated_at?: string | null
          username?: string | null
          utility_bill_url?: string | null
        }
        Relationships: []
      }
      recurring_webhook_logs_test: {
        Row: {
          amount: number | null
          created_at: string
          event_type: string
          flw_ref: string | null
          id: string
          payload: Json
          processed: boolean | null
          processed_at: string | null
          status: string | null
          tx_ref: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string
          event_type: string
          flw_ref?: string | null
          id?: string
          payload: Json
          processed?: boolean | null
          processed_at?: string | null
          status?: string | null
          tx_ref?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string
          event_type?: string
          flw_ref?: string | null
          id?: string
          payload?: Json
          processed?: boolean | null
          processed_at?: string | null
          status?: string | null
          tx_ref?: string | null
        }
        Relationships: []
      }
      support_ticket_comments: {
        Row: {
          author_id: string
          comment: string
          created_at: string
          id: string
          is_internal: boolean
          ticket_id: string
        }
        Insert: {
          author_id: string
          comment: string
          created_at?: string
          id?: string
          is_internal?: boolean
          ticket_id: string
        }
        Update: {
          author_id?: string
          comment?: string
          created_at?: string
          id?: string
          is_internal?: boolean
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_comments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assigned_to: string | null
          category: string
          created_at: string
          description: string
          id: string
          priority: string
          related_group_id: string | null
          related_transaction_id: string | null
          resolved_at: string | null
          status: string
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_to?: string | null
          category: string
          created_at?: string
          description: string
          id?: string
          priority?: string
          related_group_id?: string | null
          related_transaction_id?: string | null
          resolved_at?: string | null
          status?: string
          subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_to?: string | null
          category?: string
          created_at?: string
          description?: string
          id?: string
          priority?: string
          related_group_id?: string | null
          related_transaction_id?: string | null
          resolved_at?: string | null
          status?: string
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      test_ledger_entries: {
        Row: {
          amount: number
          created_at: string
          failure_reason: string | null
          group_id: string | null
          id: string
          payment_cycle: number | null
          retry_count: number | null
          status: string
          tx_ref: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          failure_reason?: string | null
          group_id?: string | null
          id?: string
          payment_cycle?: number | null
          retry_count?: number | null
          status?: string
          tx_ref: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          failure_reason?: string | null
          group_id?: string | null
          id?: string
          payment_cycle?: number | null
          retry_count?: number | null
          status?: string
          tx_ref?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      test_recurring_groups: {
        Row: {
          contribution_amount: number
          created_at: string
          frequency: string
          id: string
          mode: string
          name: string
          status: string
        }
        Insert: {
          contribution_amount?: number
          created_at?: string
          frequency?: string
          id?: string
          mode?: string
          name: string
          status?: string
        }
        Update: {
          contribution_amount?: number
          created_at?: string
          frequency?: string
          id?: string
          mode?: string
          name?: string
          status?: string
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
      user_devices: {
        Row: {
          browser: string | null
          created_at: string
          device_fingerprint: string
          device_name: string | null
          id: string
          ip_address: string | null
          is_current: boolean
          is_trusted: boolean
          last_used_at: string
          os: string | null
          user_id: string
        }
        Insert: {
          browser?: string | null
          created_at?: string
          device_fingerprint: string
          device_name?: string | null
          id?: string
          ip_address?: string | null
          is_current?: boolean
          is_trusted?: boolean
          last_used_at?: string
          os?: string | null
          user_id: string
        }
        Update: {
          browser?: string | null
          created_at?: string
          device_fingerprint?: string
          device_name?: string | null
          id?: string
          ip_address?: string | null
          is_current?: boolean
          is_trusted?: boolean
          last_used_at?: string
          os?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_payment_tokens_test: {
        Row: {
          card_token: string
          card_type: string | null
          created_at: string
          expiry: string | null
          first_6digits: string | null
          id: string
          is_active: boolean | null
          last_4digits: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          card_token: string
          card_type?: string | null
          created_at?: string
          expiry?: string | null
          first_6digits?: string | null
          id?: string
          is_active?: boolean | null
          last_4digits?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          card_token?: string
          card_type?: string | null
          created_at?: string
          expiry?: string | null
          first_6digits?: string | null
          id?: string
          is_active?: boolean | null
          last_4digits?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      user_totp_secrets: {
        Row: {
          backup_codes_encrypted: string | null
          created_at: string
          id: string
          is_enabled: boolean
          secret_encrypted: string
          updated_at: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          backup_codes_encrypted?: string | null
          created_at?: string
          id?: string
          is_enabled?: boolean
          secret_encrypted: string
          updated_at?: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          backup_codes_encrypted?: string | null
          created_at?: string
          id?: string
          is_enabled?: boolean
          secret_encrypted?: string
          updated_at?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      velocity_events: {
        Row: {
          amount: number | null
          created_at: string
          device_fingerprint: string | null
          event_type: string
          flag_reason: string | null
          flagged: boolean
          id: string
          ip_address: string | null
          metadata: Json | null
          user_id: string
        }
        Insert: {
          amount?: number | null
          created_at?: string
          device_fingerprint?: string | null
          event_type: string
          flag_reason?: string | null
          flagged?: boolean
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          user_id: string
        }
        Update: {
          amount?: number | null
          created_at?: string
          device_fingerprint?: string | null
          event_type?: string
          flag_reason?: string | null
          flagged?: boolean
          id?: string
          ip_address?: string | null
          metadata?: Json | null
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
      withdrawal_limits: {
        Row: {
          cooldown_reason: string | null
          cooldown_until: string | null
          created_at: string
          daily_limit: number
          daily_reset_at: string
          daily_used: number
          id: string
          monthly_limit: number
          monthly_reset_at: string
          monthly_used: number
          updated_at: string
          user_id: string
        }
        Insert: {
          cooldown_reason?: string | null
          cooldown_until?: string | null
          created_at?: string
          daily_limit?: number
          daily_reset_at?: string
          daily_used?: number
          id?: string
          monthly_limit?: number
          monthly_reset_at?: string
          monthly_used?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          cooldown_reason?: string | null
          cooldown_until?: string | null
          created_at?: string
          daily_limit?: number
          daily_reset_at?: string
          daily_used?: number
          id?: string
          monthly_limit?: number
          monthly_reset_at?: string
          monthly_used?: number
          updated_at?: string
          user_id?: string
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
      admin_get_enhanced_stats: {
        Args: { _time_filter?: string }
        Returns: Json
      }
      admin_get_stats: { Args: never; Returns: Json }
      admin_remove_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: Json
      }
      award_cycle_completion: {
        Args: { _group_id: string; _user_id: string }
        Returns: undefined
      }
      check_login_allowed: {
        Args: { _email: string; _ip_address?: string }
        Returns: Json
      }
      check_velocity: {
        Args: { _amount?: number; _event_type: string; _user_id: string }
        Returns: Json
      }
      check_withdrawal_limits: {
        Args: { _amount: number; _user_id: string }
        Returns: Json
      }
      commence_thrift: { Args: { target_group_id: string }; Returns: Json }
      confirm_continue_group: { Args: { _group_id: string }; Returns: Json }
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
      credit_wallet_via_ledger: {
        Args: {
          _amount: number
          _description?: string
          _reference_id?: string
          _reference_type: string
          _user_id: string
        }
        Returns: Json
      }
      debit_wallet_via_ledger: {
        Args: {
          _amount: number
          _description?: string
          _reference_id?: string
          _reference_type: string
          _user_id: string
        }
        Returns: Json
      }
      exit_completed_group: { Args: { _group_id: string }; Returns: Json }
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
      get_public_profile: {
        Args: { target_user_id: string }
        Returns: {
          avatar_url: string
          completed_cycles: number
          credit_score: number
          full_name: string
          id: string
          membership_tier: Database["public"]["Enums"]["membership_tier"]
          username: string
        }[]
      }
      get_public_profiles: {
        Args: { user_ids: string[] }
        Returns: {
          avatar_url: string
          completed_cycles: number
          credit_score: number
          full_name: string
          id: string
          membership_tier: Database["public"]["Enums"]["membership_tier"]
          username: string
        }[]
      }
      has_permission: {
        Args: { _permission: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_any_admin: { Args: { _user_id?: string }; Returns: boolean }
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
      process_contribution_ledger_atomic: {
        Args: { _amount: number; _group_id: string; _user_id: string }
        Returns: Json
      }
      process_payout_atomic: {
        Args: { _admin_id: string; _group_id: string }
        Returns: Json
      }
      process_payout_internal:
        | { Args: { _group_id: string }; Returns: Json }
        | {
            Args: {
              _cycle_id: string
              _gross_amount: number
              _group_id: string
              _net_amount: number
              _platform_fee: number
              _recipient_id: string
            }
            Returns: Json
          }
      record_login_attempt: {
        Args: {
          _device_fingerprint?: string
          _email: string
          _failure_reason?: string
          _ip_address?: string
          _success: boolean
        }
        Returns: undefined
      }
      record_platform_fee: {
        Args: {
          _amount: number
          _source_group_id?: string
          _source_id: string
          _source_type: string
          _source_user_id: string
        }
        Returns: Json
      }
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
      restart_completed_group: { Args: { _group_id: string }; Returns: Json }
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
      update_credit_score: {
        Args: {
          _change_amount: number
          _change_reason: string
          _reference_id?: string
          _reference_type?: string
          _user_id: string
        }
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
      app_role:
        | "admin"
        | "moderator"
        | "user"
        | "super_admin"
        | "operations_admin"
        | "support_officer"
        | "finance_admin"
        | "compliance_admin"
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
      app_role: [
        "admin",
        "moderator",
        "user",
        "super_admin",
        "operations_admin",
        "support_officer",
        "finance_admin",
        "compliance_admin",
      ],
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
