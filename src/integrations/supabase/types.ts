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
      bank_change_otps: {
        Row: {
          attempt_count: number
          created_at: string
          email: string
          expires_at: string
          id: string
          otp_hash: string | null
          user_id: string
          verified: boolean
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          otp_hash?: string | null
          user_id: string
          verified?: boolean
        }
        Update: {
          attempt_count?: number
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          otp_hash?: string | null
          user_id?: string
          verified?: boolean
        }
        Relationships: []
      }
      campaign_updates: {
        Row: {
          campaign_id: string
          created_at: string
          created_by: string
          id: string
          update_message: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          created_by: string
          id?: string
          update_message: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          created_by?: string
          id?: string
          update_message?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_updates_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "goal_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      card_tokens: {
        Row: {
          card_expiry: string | null
          card_last4: string | null
          card_status: string
          card_token: string
          card_type: string | null
          charge_email: string | null
          created_at: string
          first_6digits: string | null
          group_id: string | null
          id: string
          is_active: boolean
          last_tokenized_at: string | null
          recurring_amount: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          card_expiry?: string | null
          card_last4?: string | null
          card_status?: string
          card_token: string
          card_type?: string | null
          charge_email?: string | null
          created_at?: string
          first_6digits?: string | null
          group_id?: string | null
          id?: string
          is_active?: boolean
          last_tokenized_at?: string | null
          recurring_amount?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          card_expiry?: string | null
          card_last4?: string | null
          card_status?: string
          card_token?: string
          card_type?: string | null
          charge_email?: string | null
          created_at?: string
          first_6digits?: string | null
          group_id?: string | null
          id?: string
          is_active?: boolean
          last_tokenized_at?: string | null
          recurring_amount?: number | null
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
        Relationships: []
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
        Relationships: []
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
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      flow_health: {
        Row: {
          checked_at: string
          details: Json | null
          flow_name: string
          id: string
          last_error: string | null
          status: string
          success_rate: number
        }
        Insert: {
          checked_at?: string
          details?: Json | null
          flow_name: string
          id?: string
          last_error?: string | null
          status: string
          success_rate?: number
        }
        Update: {
          checked_at?: string
          details?: Json | null
          flow_name?: string
          id?: string
          last_error?: string | null
          status?: string
          success_rate?: number
        }
        Relationships: []
      }
      goal_campaigns: {
        Row: {
          amount_raised: number
          beneficiary_account_name: string | null
          beneficiary_account_number: string | null
          beneficiary_bank_name: string | null
          campaign_deadline: string | null
          campaign_image: string | null
          campaign_owner_user_id: string
          campaign_slug: string | null
          campaign_status: string
          campaign_title: string
          contribution_visibility: string
          contributor_count: number
          created_at: string
          description: string | null
          goal_amount: number
          id: string
          updated_at: string
        }
        Insert: {
          amount_raised?: number
          beneficiary_account_name?: string | null
          beneficiary_account_number?: string | null
          beneficiary_bank_name?: string | null
          campaign_deadline?: string | null
          campaign_image?: string | null
          campaign_owner_user_id: string
          campaign_slug?: string | null
          campaign_status?: string
          campaign_title: string
          contribution_visibility?: string
          contributor_count?: number
          created_at?: string
          description?: string | null
          goal_amount: number
          id?: string
          updated_at?: string
        }
        Update: {
          amount_raised?: number
          beneficiary_account_name?: string | null
          beneficiary_account_number?: string | null
          beneficiary_bank_name?: string | null
          campaign_deadline?: string | null
          campaign_image?: string | null
          campaign_owner_user_id?: string
          campaign_slug?: string | null
          campaign_status?: string
          campaign_title?: string
          contribution_visibility?: string
          contributor_count?: number
          created_at?: string
          description?: string | null
          goal_amount?: number
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      goal_contributions: {
        Row: {
          anonymous: boolean
          campaign_id: string
          contribution_amount: number
          contribution_reference: string | null
          contribution_status: string
          contributor_name: string | null
          contributor_user_id: string
          created_at: string
          id: string
        }
        Insert: {
          anonymous?: boolean
          campaign_id: string
          contribution_amount: number
          contribution_reference?: string | null
          contribution_status?: string
          contributor_name?: string | null
          contributor_user_id: string
          created_at?: string
          id?: string
        }
        Update: {
          anonymous?: boolean
          campaign_id?: string
          contribution_amount?: number
          contribution_reference?: string | null
          contribution_status?: string
          contributor_name?: string | null
          contributor_user_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_contributions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "goal_campaigns"
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
        Relationships: []
      }
      group_join_reminders: {
        Row: {
          id: string
          reminder_count: number
          sent_at: string
          user_id: string
        }
        Insert: {
          id?: string
          reminder_count?: number
          sent_at?: string
          user_id: string
        }
        Update: {
          id?: string
          reminder_count?: number
          sent_at?: string
          user_id?: string
        }
        Relationships: []
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
        Relationships: []
      }
      internal_cron_tokens: {
        Row: {
          created_at: string
          name: string
          token: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          name: string
          token: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          name?: string
          token?: string
          updated_at?: string
        }
        Relationships: []
      }
      intra_transfer_reports: {
        Row: {
          amount: number
          created_at: string
          from_account: string
          id: string
          metadata: Json
          narration: string | null
          recipient_balance_after: number | null
          recipient_balance_before: number | null
          recipient_user_id: string
          recipient_vestara_transaction_id: string | null
          recipient_vfd_transaction_id: string | null
          reference: string
          sender_balance_after: number | null
          sender_balance_before: number | null
          sender_user_id: string
          sender_vfd_transaction_id: string | null
          settlement_status: string
          to_account: string
        }
        Insert: {
          amount: number
          created_at?: string
          from_account: string
          id?: string
          metadata?: Json
          narration?: string | null
          recipient_balance_after?: number | null
          recipient_balance_before?: number | null
          recipient_user_id: string
          recipient_vestara_transaction_id?: string | null
          recipient_vfd_transaction_id?: string | null
          reference: string
          sender_balance_after?: number | null
          sender_balance_before?: number | null
          sender_user_id: string
          sender_vfd_transaction_id?: string | null
          settlement_status?: string
          to_account: string
        }
        Update: {
          amount?: number
          created_at?: string
          from_account?: string
          id?: string
          metadata?: Json
          narration?: string | null
          recipient_balance_after?: number | null
          recipient_balance_before?: number | null
          recipient_user_id?: string
          recipient_vestara_transaction_id?: string | null
          recipient_vfd_transaction_id?: string | null
          reference?: string
          sender_balance_after?: number | null
          sender_balance_before?: number | null
          sender_user_id?: string
          sender_vfd_transaction_id?: string | null
          settlement_status?: string
          to_account?: string
        }
        Relationships: []
      }
      ledger_confirmed_test: {
        Row: {
          amount: number
          confirmed_at: string
          created_at: string
          flw_transaction_id: string | null
          group_id: string | null
          id: string
          payment_cycle: number | null
          payment_id: string
          tx_ref: string
          user_id: string
        }
        Insert: {
          amount: number
          confirmed_at?: string
          created_at?: string
          flw_transaction_id?: string | null
          group_id?: string | null
          id?: string
          payment_cycle?: number | null
          payment_id: string
          tx_ref: string
          user_id: string
        }
        Update: {
          amount?: number
          confirmed_at?: string
          created_at?: string
          flw_transaction_id?: string | null
          group_id?: string | null
          id?: string
          payment_cycle?: number | null
          payment_id?: string
          tx_ref?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_confirmed_test_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: true
            referencedRelation: "payments_test"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_drift_findings: {
        Row: {
          account_id: string | null
          account_type: string | null
          actual: number
          created_at: string
          delta: number
          details: Json
          detected_at: string
          expected: number
          id: string
          kind: string
          resolved_at: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          account_id?: string | null
          account_type?: string | null
          actual?: number
          created_at?: string
          delta?: number
          details?: Json
          detected_at?: string
          expected?: number
          id?: string
          kind: string
          resolved_at?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          account_id?: string | null
          account_type?: string | null
          actual?: number
          created_at?: string
          delta?: number
          details?: Json
          detected_at?: string
          expected?: number
          id?: string
          kind?: string
          resolved_at?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
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
        Relationships: []
      }
      notification_dlq: {
        Row: {
          attempts: number
          created_at: string
          failure_reason: string | null
          failure_status: number | null
          id: string
          next_retry_at: string
          notification_id: string | null
          payload: Json
          resolved_at: string | null
          subscription_endpoint: string | null
          user_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          failure_reason?: string | null
          failure_status?: number | null
          id?: string
          next_retry_at?: string
          notification_id?: string | null
          payload: Json
          resolved_at?: string | null
          subscription_endpoint?: string | null
          user_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          failure_reason?: string | null
          failure_status?: number | null
          id?: string
          next_retry_at?: string
          notification_id?: string | null
          payload?: Json
          resolved_at?: string | null
          subscription_endpoint?: string | null
          user_id?: string
        }
        Relationships: []
      }
      payments_test: {
        Row: {
          amount: number
          charge_type: string
          created_at: string
          failure_reason: string | null
          flw_ref: string | null
          flw_transaction_id: string | null
          group_id: string | null
          id: string
          max_retries: number
          payment_cycle: number | null
          processor_response: string | null
          resolved_at: string | null
          retry_count: number
          status: string
          tx_ref: string
          updated_at: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          amount: number
          charge_type?: string
          created_at?: string
          failure_reason?: string | null
          flw_ref?: string | null
          flw_transaction_id?: string | null
          group_id?: string | null
          id?: string
          max_retries?: number
          payment_cycle?: number | null
          processor_response?: string | null
          resolved_at?: string | null
          retry_count?: number
          status?: string
          tx_ref: string
          updated_at?: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          amount?: number
          charge_type?: string
          created_at?: string
          failure_reason?: string | null
          flw_ref?: string | null
          flw_transaction_id?: string | null
          group_id?: string | null
          id?: string
          max_retries?: number
          payment_cycle?: number | null
          processor_response?: string | null
          resolved_at?: string | null
          retry_count?: number
          status?: string
          tx_ref?: string
          updated_at?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      pending_card_charges: {
        Row: {
          amount: number
          contribution_id: string | null
          created_at: string
          cycle_id: string
          failure_reason: string | null
          flw_ref: string | null
          flw_transaction_id: string | null
          group_id: string
          id: string
          last_checked_at: string | null
          max_retries: number | null
          resolved_at: string | null
          retry_count: number | null
          status: string
          tx_ref: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          amount: number
          contribution_id?: string | null
          created_at?: string
          cycle_id: string
          failure_reason?: string | null
          flw_ref?: string | null
          flw_transaction_id?: string | null
          group_id: string
          id?: string
          last_checked_at?: string | null
          max_retries?: number | null
          resolved_at?: string | null
          retry_count?: number | null
          status?: string
          tx_ref: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          amount?: number
          contribution_id?: string | null
          created_at?: string
          cycle_id?: string
          failure_reason?: string | null
          flw_ref?: string | null
          flw_transaction_id?: string | null
          group_id?: string
          id?: string
          last_checked_at?: string | null
          max_retries?: number | null
          resolved_at?: string | null
          retry_count?: number | null
          status?: string
          tx_ref?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: []
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
        Relationships: []
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
        Relationships: []
      }
      pin_audit_log: {
        Row: {
          created_at: string
          event_type: string
          id: string
          ip_address: string | null
          metadata: Json
          purpose: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          purpose?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          purpose?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      platform_expenses: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          expense_type: string
          id: string
          metadata: Json | null
          source_group_id: string | null
          source_id: string | null
          source_type: string | null
          source_user_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          expense_type: string
          id?: string
          metadata?: Json | null
          source_group_id?: string | null
          source_id?: string | null
          source_type?: string | null
          source_user_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          expense_type?: string
          id?: string
          metadata?: Json | null
          source_group_id?: string | null
          source_id?: string | null
          source_type?: string | null
          source_user_id?: string | null
        }
        Relationships: []
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
      profiles: {
        Row: {
          account_status: string | null
          avatar_url: string | null
          bank_account_encrypted: string | null
          bank_details_changed_at: string | null
          bank_name_encrypted: string | null
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
          id_number_encrypted: string | null
          id_type: string | null
          kyc_status: string | null
          last_security_review: string | null
          membership_tier: Database["public"]["Enums"]["membership_tier"]
          onboarding_completed: boolean | null
          phone_encrypted: string | null
          referral_code: string | null
          referred_by: string | null
          risk_level: string | null
          updated_at: string | null
          username: string | null
          utility_bill_url: string | null
        }
        Insert: {
          account_status?: string | null
          avatar_url?: string | null
          bank_account_encrypted?: string | null
          bank_details_changed_at?: string | null
          bank_name_encrypted?: string | null
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
          id_number_encrypted?: string | null
          id_type?: string | null
          kyc_status?: string | null
          last_security_review?: string | null
          membership_tier?: Database["public"]["Enums"]["membership_tier"]
          onboarding_completed?: boolean | null
          phone_encrypted?: string | null
          referral_code?: string | null
          referred_by?: string | null
          risk_level?: string | null
          updated_at?: string | null
          username?: string | null
          utility_bill_url?: string | null
        }
        Update: {
          account_status?: string | null
          avatar_url?: string | null
          bank_account_encrypted?: string | null
          bank_details_changed_at?: string | null
          bank_name_encrypted?: string | null
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
          id_number_encrypted?: string | null
          id_type?: string | null
          kyc_status?: string | null
          last_security_review?: string | null
          membership_tier?: Database["public"]["Enums"]["membership_tier"]
          onboarding_completed?: boolean | null
          phone_encrypted?: string | null
          referral_code?: string | null
          referred_by?: string | null
          risk_level?: string | null
          updated_at?: string | null
          username?: string | null
          utility_bill_url?: string | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth_key: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auth_key: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auth_key?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          created_at: string
          endpoint: string
          id: string
          identifier: string
          request_count: number
          window_start: string
        }
        Insert: {
          created_at?: string
          endpoint: string
          id?: string
          identifier: string
          request_count?: number
          window_start?: string
        }
        Update: {
          created_at?: string
          endpoint?: string
          id?: string
          identifier?: string
          request_count?: number
          window_start?: string
        }
        Relationships: []
      }
      reconciliation_runs: {
        Row: {
          created_at: string
          details: Json | null
          id: string
          ledger_sum: number | null
          notes: string | null
          run_at: string
          run_type: string
          status: string
          variance: number | null
          vfd_corporate_balance: number | null
        }
        Insert: {
          created_at?: string
          details?: Json | null
          id?: string
          ledger_sum?: number | null
          notes?: string | null
          run_at?: string
          run_type?: string
          status: string
          variance?: number | null
          vfd_corporate_balance?: number | null
        }
        Update: {
          created_at?: string
          details?: Json | null
          id?: string
          ledger_sum?: number | null
          notes?: string | null
          run_at?: string
          run_type?: string
          status?: string
          variance?: number | null
          vfd_corporate_balance?: number | null
        }
        Relationships: []
      }
      recurring_webhook_logs_test: {
        Row: {
          amount: number | null
          created_at: string
          event_type: string
          flw_ref: string | null
          flw_transaction_id: string | null
          id: string
          payload: Json
          processed: boolean | null
          processed_at: string | null
          status: string | null
          tx_ref: string | null
          verification_source: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string
          event_type: string
          flw_ref?: string | null
          flw_transaction_id?: string | null
          id?: string
          payload: Json
          processed?: boolean | null
          processed_at?: string | null
          status?: string | null
          tx_ref?: string | null
          verification_source?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string
          event_type?: string
          flw_ref?: string | null
          flw_transaction_id?: string | null
          id?: string
          payload?: Json
          processed?: boolean | null
          processed_at?: string | null
          status?: string | null
          tx_ref?: string | null
          verification_source?: string | null
        }
        Relationships: []
      }
      referrals: {
        Row: {
          completed_at: string | null
          created_at: string | null
          fraud_flag: boolean | null
          fraud_reason: string | null
          id: string
          referred_user_id: string
          referrer_id: string
          reward_amount: number | null
          rewarded_at: string | null
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          fraud_flag?: boolean | null
          fraud_reason?: string | null
          id?: string
          referred_user_id: string
          referrer_id: string
          reward_amount?: number | null
          rewarded_at?: string | null
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          fraud_flag?: boolean | null
          fraud_reason?: string | null
          id?: string
          referred_user_id?: string
          referrer_id?: string
          reward_amount?: number | null
          rewarded_at?: string | null
          status?: string
        }
        Relationships: []
      }
      request_nonces: {
        Row: {
          created_at: string
          endpoint: string
          id: string
          nonce: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          endpoint: string
          id?: string
          nonce: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          endpoint?: string
          id?: string
          nonce?: string
          user_id?: string | null
        }
        Relationships: []
      }
      split_participants: {
        Row: {
          amount_due: number
          created_at: string
          id: string
          paid_at: string | null
          split_request_id: string
          status: string
          user_id: string
        }
        Insert: {
          amount_due: number
          created_at?: string
          id?: string
          paid_at?: string | null
          split_request_id: string
          status?: string
          user_id: string
        }
        Update: {
          amount_due?: number
          created_at?: string
          id?: string
          paid_at?: string | null
          split_request_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "split_participants_split_request_id_fkey"
            columns: ["split_request_id"]
            isOneToOne: false
            referencedRelation: "split_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      split_requests: {
        Row: {
          amount_per_person: number
          created_at: string
          creator_user_id: string
          expiry_date: string | null
          id: string
          merchant_account_name: string
          merchant_account_number: string
          merchant_bank_name: string
          number_of_people: number
          platform_fee: number
          purpose: string
          settlement_completed_at: string | null
          settlement_failure_reason: string | null
          settlement_flw_transfer_id: string | null
          settlement_initiated_at: string | null
          settlement_reference: string | null
          settlement_status: string | null
          status: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          amount_per_person: number
          created_at?: string
          creator_user_id: string
          expiry_date?: string | null
          id?: string
          merchant_account_name: string
          merchant_account_number: string
          merchant_bank_name: string
          number_of_people: number
          platform_fee?: number
          purpose: string
          settlement_completed_at?: string | null
          settlement_failure_reason?: string | null
          settlement_flw_transfer_id?: string | null
          settlement_initiated_at?: string | null
          settlement_reference?: string | null
          settlement_status?: string | null
          status?: string
          total_amount: number
          updated_at?: string
        }
        Update: {
          amount_per_person?: number
          created_at?: string
          creator_user_id?: string
          expiry_date?: string | null
          id?: string
          merchant_account_name?: string
          merchant_account_number?: string
          merchant_bank_name?: string
          number_of_people?: number
          platform_fee?: number
          purpose?: string
          settlement_completed_at?: string | null
          settlement_failure_reason?: string | null
          settlement_flw_transfer_id?: string | null
          settlement_initiated_at?: string | null
          settlement_reference?: string | null
          settlement_status?: string | null
          status?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: []
      }
      split_transactions: {
        Row: {
          amount: number
          created_at: string
          id: string
          split_request_id: string
          status: string
          user_id: string
          wallet_ledger_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          split_request_id: string
          status?: string
          user_id: string
          wallet_ledger_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          split_request_id?: string
          status?: string
          user_id?: string
          wallet_ledger_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "split_transactions_split_request_id_fkey"
            columns: ["split_request_id"]
            isOneToOne: false
            referencedRelation: "split_requests"
            referencedColumns: ["id"]
          },
        ]
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
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      target_ajo_invites: {
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
        Relationships: []
      }
      target_ajo_member_contributions: {
        Row: {
          group_id: string
          id: string
          total_contributed: number
          updated_at: string
          user_id: string
        }
        Insert: {
          group_id: string
          id?: string
          total_contributed?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          group_id?: string
          id?: string
          total_contributed?: number
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
      transaction_pins: {
        Row: {
          created_at: string
          failed_attempts: number
          id: string
          last_used_at: string | null
          locked_until: string | null
          pin_hash: string
          pin_set_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          failed_attempts?: number
          id?: string
          last_used_at?: string | null
          locked_until?: string | null
          pin_hash: string
          pin_set_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          failed_attempts?: number
          id?: string
          last_used_at?: string | null
          locked_until?: string | null
          pin_hash?: string
          pin_set_at?: string
          updated_at?: string
          user_id?: string
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
            foreignKeyName: "transactions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      transfer_fee_counters: {
        Row: {
          created_at: string
          id: string
          inter_count: number
          month_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          inter_count?: number
          month_key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          inter_count?: number
          month_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      user_notifications: {
        Row: {
          created_at: string
          group_id: string | null
          id: string
          is_read: boolean
          message: string
          notification_type: string
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id?: string | null
          id?: string
          is_read?: boolean
          message: string
          notification_type?: string
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string | null
          id?: string
          is_read?: boolean
          message?: string
          notification_type?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      user_payment_tokens_test: {
        Row: {
          card_token: string
          card_type: string | null
          charge_email: string | null
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
          charge_email?: string | null
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
          charge_email?: string | null
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
      vestara_accounts: {
        Row: {
          account_type: Database["public"]["Enums"]["vestara_account_type"]
          balance: number
          campaign_ref: string | null
          created_at: string
          currency: string
          group_ref: string | null
          id: string
          is_system: boolean
          label: string | null
          metadata: Json
          split_ref: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          account_type: Database["public"]["Enums"]["vestara_account_type"]
          balance?: number
          campaign_ref?: string | null
          created_at?: string
          currency?: string
          group_ref?: string | null
          id?: string
          is_system?: boolean
          label?: string | null
          metadata?: Json
          split_ref?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          account_type?: Database["public"]["Enums"]["vestara_account_type"]
          balance?: number
          campaign_ref?: string | null
          created_at?: string
          currency?: string
          group_ref?: string | null
          id?: string
          is_system?: boolean
          label?: string | null
          metadata?: Json
          split_ref?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      vestara_fee_ledger: {
        Row: {
          amount: number
          created_at: string
          fee_type: string
          id: string
          metadata: Json
          reference: string | null
          transfer_type: string | null
          tx_reference: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          fee_type: string
          id?: string
          metadata?: Json
          reference?: string | null
          transfer_type?: string | null
          tx_reference?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          fee_type?: string
          id?: string
          metadata?: Json
          reference?: string | null
          transfer_type?: string | null
          tx_reference?: string | null
          user_id?: string
        }
        Relationships: []
      }
      vestara_ledger_entries: {
        Row: {
          account_id: string
          created_at: string
          credit: number
          debit: number
          id: string
          transaction_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          credit?: number
          debit?: number
          id?: string
          transaction_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          credit?: number
          debit?: number
          id?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vestara_ledger_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "vestara_account_drift"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vestara_ledger_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "vestara_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vestara_ledger_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "vestara_derived_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "vestara_ledger_entries_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "vestara_transaction_detail"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "vestara_ledger_entries_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "vestara_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      vestara_products: {
        Row: {
          allow_early_withdrawal: boolean
          code: Database["public"]["Enums"]["vestara_product_code"]
          created_at: string
          description: string | null
          early_withdrawal_penalty_pct: number
          id: string
          is_active: boolean
          is_upfront_yield: boolean
          max_tenor_days: number
          max_user_rate: number
          min_tenor_days: number
          min_user_rate: number
          name: string
          sub_account_nuban: string | null
          updated_at: string
          vfd_rate: number
        }
        Insert: {
          allow_early_withdrawal?: boolean
          code: Database["public"]["Enums"]["vestara_product_code"]
          created_at?: string
          description?: string | null
          early_withdrawal_penalty_pct?: number
          id?: string
          is_active?: boolean
          is_upfront_yield?: boolean
          max_tenor_days: number
          max_user_rate: number
          min_tenor_days: number
          min_user_rate: number
          name: string
          sub_account_nuban?: string | null
          updated_at?: string
          vfd_rate: number
        }
        Update: {
          allow_early_withdrawal?: boolean
          code?: Database["public"]["Enums"]["vestara_product_code"]
          created_at?: string
          description?: string | null
          early_withdrawal_penalty_pct?: number
          id?: string
          is_active?: boolean
          is_upfront_yield?: boolean
          max_tenor_days?: number
          max_user_rate?: number
          min_tenor_days?: number
          min_user_rate?: number
          name?: string
          sub_account_nuban?: string | null
          updated_at?: string
          vfd_rate?: number
        }
        Relationships: []
      }
      vestara_rate_configs: {
        Row: {
          created_at: string
          created_by: string | null
          frequency: string | null
          id: string
          is_active: boolean
          max_amount: number | null
          max_tenor_days: number
          min_amount: number
          min_tenor_days: number
          notes: string | null
          priority: number
          product_code: Database["public"]["Enums"]["vestara_product_code"]
          updated_at: string
          user_rate: number
          vfd_rate: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          frequency?: string | null
          id?: string
          is_active?: boolean
          max_amount?: number | null
          max_tenor_days: number
          min_amount?: number
          min_tenor_days: number
          notes?: string | null
          priority?: number
          product_code: Database["public"]["Enums"]["vestara_product_code"]
          updated_at?: string
          user_rate: number
          vfd_rate: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          frequency?: string | null
          id?: string
          is_active?: boolean
          max_amount?: number | null
          max_tenor_days?: number
          min_amount?: number
          min_tenor_days?: number
          notes?: string | null
          priority?: number
          product_code?: Database["public"]["Enums"]["vestara_product_code"]
          updated_at?: string
          user_rate?: number
          vfd_rate?: number
        }
        Relationships: []
      }
      vestara_reconciliation_findings: {
        Row: {
          actual: number | null
          check_name: string
          checked_at: string
          details: Json
          drift: number | null
          expected: number | null
          id: string
          is_healthy: boolean
        }
        Insert: {
          actual?: number | null
          check_name: string
          checked_at?: string
          details?: Json
          drift?: number | null
          expected?: number | null
          id?: string
          is_healthy: boolean
        }
        Update: {
          actual?: number | null
          check_name?: string
          checked_at?: string
          details?: Json
          drift?: number | null
          expected?: number | null
          id?: string
          is_healthy?: boolean
        }
        Relationships: []
      }
      vestara_reconciliation_log: {
        Row: {
          created_at: string
          discrepancy: number
          id: string
          ledger_balance: number
          notes: string | null
          resolved: boolean
          vfd_balance: number
        }
        Insert: {
          created_at?: string
          discrepancy?: number
          id?: string
          ledger_balance: number
          notes?: string | null
          resolved?: boolean
          vfd_balance: number
        }
        Update: {
          created_at?: string
          discrepancy?: number
          id?: string
          ledger_balance?: number
          notes?: string | null
          resolved?: boolean
          vfd_balance?: number
        }
        Relationships: []
      }
      vestara_savings: {
        Row: {
          accrued_interest: number
          activation_status: string | null
          approval_decision_at: string | null
          approval_decision_by: string | null
          approval_notes: string | null
          approval_status: string
          approval_submitted_at: string | null
          commitment_amount: number | null
          commitment_frequency: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          discounted_interest_paid: number
          effective_rate: number | null
          id: string
          last_accrued_on: string | null
          lock_account_id: string
          mandate_authorized_at: string | null
          mandate_code: string | null
          mandate_end_date: string | null
          mandate_expires_at: string | null
          mandate_fee: number | null
          mandate_frequency: string | null
          mandate_id: string | null
          mandate_nibss_account: string | null
          mandate_nibss_message: string | null
          mandate_payer_account_number: string | null
          mandate_payer_address: string | null
          mandate_payer_bank_code: string | null
          mandate_payer_email: string | null
          mandate_payer_phone: string | null
          mandate_payload: Json | null
          mandate_reference: string | null
          mandate_start_date: string | null
          mandate_status: string | null
          matured_at: string | null
          maturity_date: string
          metadata: Json
          next_debit_at: string | null
          original_principal: number
          penalty_amount: number
          pending_account_id: string | null
          principal: number
          product_code: Database["public"]["Enums"]["vestara_product_code"]
          product_id: string
          start_date: string
          status: Database["public"]["Enums"]["vestara_savings_status"]
          sub_account_nuban: string | null
          sub_account_reversal_ref: string | null
          sub_account_reversed_at: string | null
          sub_account_transfer_ref: string | null
          sub_account_transferred_at: string | null
          subaccount_funded_at: string | null
          tenor_count: number | null
          tenor_days: number
          updated_at: string
          user_id: string
          user_rate: number
          vfd_confirmation_note: string | null
          vfd_confirmation_reference: string | null
          vfd_rate: number
          withdrawn_at: string | null
        }
        Insert: {
          accrued_interest?: number
          activation_status?: string | null
          approval_decision_at?: string | null
          approval_decision_by?: string | null
          approval_notes?: string | null
          approval_status?: string
          approval_submitted_at?: string | null
          commitment_amount?: number | null
          commitment_frequency?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          discounted_interest_paid?: number
          effective_rate?: number | null
          id?: string
          last_accrued_on?: string | null
          lock_account_id: string
          mandate_authorized_at?: string | null
          mandate_code?: string | null
          mandate_end_date?: string | null
          mandate_expires_at?: string | null
          mandate_fee?: number | null
          mandate_frequency?: string | null
          mandate_id?: string | null
          mandate_nibss_account?: string | null
          mandate_nibss_message?: string | null
          mandate_payer_account_number?: string | null
          mandate_payer_address?: string | null
          mandate_payer_bank_code?: string | null
          mandate_payer_email?: string | null
          mandate_payer_phone?: string | null
          mandate_payload?: Json | null
          mandate_reference?: string | null
          mandate_start_date?: string | null
          mandate_status?: string | null
          matured_at?: string | null
          maturity_date: string
          metadata?: Json
          next_debit_at?: string | null
          original_principal: number
          penalty_amount?: number
          pending_account_id?: string | null
          principal: number
          product_code: Database["public"]["Enums"]["vestara_product_code"]
          product_id: string
          start_date?: string
          status?: Database["public"]["Enums"]["vestara_savings_status"]
          sub_account_nuban?: string | null
          sub_account_reversal_ref?: string | null
          sub_account_reversed_at?: string | null
          sub_account_transfer_ref?: string | null
          sub_account_transferred_at?: string | null
          subaccount_funded_at?: string | null
          tenor_count?: number | null
          tenor_days: number
          updated_at?: string
          user_id: string
          user_rate: number
          vfd_confirmation_note?: string | null
          vfd_confirmation_reference?: string | null
          vfd_rate: number
          withdrawn_at?: string | null
        }
        Update: {
          accrued_interest?: number
          activation_status?: string | null
          approval_decision_at?: string | null
          approval_decision_by?: string | null
          approval_notes?: string | null
          approval_status?: string
          approval_submitted_at?: string | null
          commitment_amount?: number | null
          commitment_frequency?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          discounted_interest_paid?: number
          effective_rate?: number | null
          id?: string
          last_accrued_on?: string | null
          lock_account_id?: string
          mandate_authorized_at?: string | null
          mandate_code?: string | null
          mandate_end_date?: string | null
          mandate_expires_at?: string | null
          mandate_fee?: number | null
          mandate_frequency?: string | null
          mandate_id?: string | null
          mandate_nibss_account?: string | null
          mandate_nibss_message?: string | null
          mandate_payer_account_number?: string | null
          mandate_payer_address?: string | null
          mandate_payer_bank_code?: string | null
          mandate_payer_email?: string | null
          mandate_payer_phone?: string | null
          mandate_payload?: Json | null
          mandate_reference?: string | null
          mandate_start_date?: string | null
          mandate_status?: string | null
          matured_at?: string | null
          maturity_date?: string
          metadata?: Json
          next_debit_at?: string | null
          original_principal?: number
          penalty_amount?: number
          pending_account_id?: string | null
          principal?: number
          product_code?: Database["public"]["Enums"]["vestara_product_code"]
          product_id?: string
          start_date?: string
          status?: Database["public"]["Enums"]["vestara_savings_status"]
          sub_account_nuban?: string | null
          sub_account_reversal_ref?: string | null
          sub_account_reversed_at?: string | null
          sub_account_transfer_ref?: string | null
          sub_account_transferred_at?: string | null
          subaccount_funded_at?: string | null
          tenor_count?: number | null
          tenor_days?: number
          updated_at?: string
          user_id?: string
          user_rate?: number
          vfd_confirmation_note?: string | null
          vfd_confirmation_reference?: string | null
          vfd_rate?: number
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vestara_savings_lock_account_id_fkey"
            columns: ["lock_account_id"]
            isOneToOne: false
            referencedRelation: "vestara_account_drift"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vestara_savings_lock_account_id_fkey"
            columns: ["lock_account_id"]
            isOneToOne: false
            referencedRelation: "vestara_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vestara_savings_lock_account_id_fkey"
            columns: ["lock_account_id"]
            isOneToOne: false
            referencedRelation: "vestara_derived_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "vestara_savings_pending_account_id_fkey"
            columns: ["pending_account_id"]
            isOneToOne: false
            referencedRelation: "vestara_account_drift"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vestara_savings_pending_account_id_fkey"
            columns: ["pending_account_id"]
            isOneToOne: false
            referencedRelation: "vestara_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vestara_savings_pending_account_id_fkey"
            columns: ["pending_account_id"]
            isOneToOne: false
            referencedRelation: "vestara_derived_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "vestara_savings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "vestara_products"
            referencedColumns: ["id"]
          },
        ]
      }
      vestara_settlement_balance_audit: {
        Row: {
          account_number: string | null
          amount: number
          created_at: string
          event_type: string
          id: string
          legacy_wallet_balance_after: number | null
          metadata: Json
          reference: string
          settlement_balance_after: number | null
          settlement_balance_before: number | null
          user_id: string | null
          vestara_transaction_id: string | null
          vfd_transaction_id: string | null
          wallet_balance_after: number | null
          wallet_balance_before: number | null
        }
        Insert: {
          account_number?: string | null
          amount?: number
          created_at?: string
          event_type: string
          id?: string
          legacy_wallet_balance_after?: number | null
          metadata?: Json
          reference: string
          settlement_balance_after?: number | null
          settlement_balance_before?: number | null
          user_id?: string | null
          vestara_transaction_id?: string | null
          vfd_transaction_id?: string | null
          wallet_balance_after?: number | null
          wallet_balance_before?: number | null
        }
        Update: {
          account_number?: string | null
          amount?: number
          created_at?: string
          event_type?: string
          id?: string
          legacy_wallet_balance_after?: number | null
          metadata?: Json
          reference?: string
          settlement_balance_after?: number | null
          settlement_balance_before?: number | null
          user_id?: string | null
          vestara_transaction_id?: string | null
          vfd_transaction_id?: string | null
          wallet_balance_after?: number | null
          wallet_balance_before?: number | null
        }
        Relationships: []
      }
      vestara_transactions: {
        Row: {
          amount: number
          completed_at: string | null
          created_at: string
          id: string
          initiated_by: string | null
          ip_address: string | null
          metadata: Json | null
          reference: string
          status: Database["public"]["Enums"]["vestara_tx_status"]
          type: Database["public"]["Enums"]["vestara_tx_type"]
        }
        Insert: {
          amount: number
          completed_at?: string | null
          created_at?: string
          id?: string
          initiated_by?: string | null
          ip_address?: string | null
          metadata?: Json | null
          reference: string
          status?: Database["public"]["Enums"]["vestara_tx_status"]
          type: Database["public"]["Enums"]["vestara_tx_type"]
        }
        Update: {
          amount?: number
          completed_at?: string | null
          created_at?: string
          id?: string
          initiated_by?: string | null
          ip_address?: string | null
          metadata?: Json | null
          reference?: string
          status?: Database["public"]["Enums"]["vestara_tx_status"]
          type?: Database["public"]["Enums"]["vestara_tx_type"]
        }
        Relationships: []
      }
      vestara_treasury: {
        Row: {
          id: string
          interest_spread_profit: number
          invest_ratio: number
          liquidity_buffer: number
          total_interest_from_vfd: number
          total_interest_paid: number
          total_invested_with_vfd: number
          total_locked_funds: number
          updated_at: string
        }
        Insert: {
          id?: string
          interest_spread_profit?: number
          invest_ratio?: number
          liquidity_buffer?: number
          total_interest_from_vfd?: number
          total_interest_paid?: number
          total_invested_with_vfd?: number
          total_locked_funds?: number
          updated_at?: string
        }
        Update: {
          id?: string
          interest_spread_profit?: number
          invest_ratio?: number
          liquidity_buffer?: number
          total_interest_from_vfd?: number
          total_interest_paid?: number
          total_invested_with_vfd?: number
          total_locked_funds?: number
          updated_at?: string
        }
        Relationships: []
      }
      vfd_balance_drift_findings: {
        Row: {
          checked_at: string
          details: Json
          drift: number
          id: string
          is_healthy: boolean
          recorded_balance: number
          resolved: boolean
          resolved_at: string | null
          threshold: number
          user_id: string | null
          vfd_account_number: string | null
          vfd_live_balance: number
        }
        Insert: {
          checked_at?: string
          details?: Json
          drift: number
          id?: string
          is_healthy: boolean
          recorded_balance: number
          resolved?: boolean
          resolved_at?: string | null
          threshold?: number
          user_id?: string | null
          vfd_account_number?: string | null
          vfd_live_balance: number
        }
        Update: {
          checked_at?: string
          details?: Json
          drift?: number
          id?: string
          is_healthy?: boolean
          recorded_balance?: number
          resolved?: boolean
          resolved_at?: string | null
          threshold?: number
          user_id?: string | null
          vfd_account_number?: string | null
          vfd_live_balance?: number
        }
        Relationships: []
      }
      vfd_idempotency_keys: {
        Row: {
          action: string
          attempts: number
          created_at: string
          http_status: number | null
          id: string
          idempotency_key: string
          last_attempt_at: string
          request_hash: string | null
          response: Json | null
          status: string
          transaction_reference: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          action: string
          attempts?: number
          created_at?: string
          http_status?: number | null
          id?: string
          idempotency_key: string
          last_attempt_at?: string
          request_hash?: string | null
          response?: Json | null
          status?: string
          transaction_reference?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          attempts?: number
          created_at?: string
          http_status?: number | null
          id?: string
          idempotency_key?: string
          last_attempt_at?: string
          request_hash?: string | null
          response?: Json | null
          status?: string
          transaction_reference?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      vfd_interest_accruals: {
        Row: {
          accrual_date: string
          created_at: string
          cumulative_interest: number
          daily_interest: number
          id: string
          lock_id: string
          user_id: string
        }
        Insert: {
          accrual_date: string
          created_at?: string
          cumulative_interest: number
          daily_interest: number
          id?: string
          lock_id: string
          user_id: string
        }
        Update: {
          accrual_date?: string
          created_at?: string
          cumulative_interest?: number
          daily_interest?: number
          id?: string
          lock_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vfd_interest_accruals_lock_id_fkey"
            columns: ["lock_id"]
            isOneToOne: false
            referencedRelation: "vfd_locked_funds"
            referencedColumns: ["id"]
          },
        ]
      }
      vfd_lock_configs: {
        Row: {
          created_at: string
          duration_months: number
          early_withdrawal_penalty: number
          id: string
          interest_rate: number
          is_active: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          duration_months: number
          early_withdrawal_penalty?: number
          id?: string
          interest_rate: number
          is_active?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          duration_months?: number
          early_withdrawal_penalty?: number
          id?: string
          interest_rate?: number
          is_active?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      vfd_lock_ledger: {
        Row: {
          amount: number
          balance_after: number
          balance_before: number
          created_at: string
          description: string | null
          entry_type: string
          id: string
          lock_id: string | null
          locked_after: number
          locked_before: number
          metadata: Json | null
          user_id: string
        }
        Insert: {
          amount: number
          balance_after?: number
          balance_before?: number
          created_at?: string
          description?: string | null
          entry_type: string
          id?: string
          lock_id?: string | null
          locked_after?: number
          locked_before?: number
          metadata?: Json | null
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          balance_before?: number
          created_at?: string
          description?: string | null
          entry_type?: string
          id?: string
          lock_id?: string | null
          locked_after?: number
          locked_before?: number
          metadata?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vfd_lock_ledger_lock_id_fkey"
            columns: ["lock_id"]
            isOneToOne: false
            referencedRelation: "vfd_locked_funds"
            referencedColumns: ["id"]
          },
        ]
      }
      vfd_locked_funds: {
        Row: {
          actual_unlock_date: string | null
          created_at: string
          duration_months: number
          expected_interest: number
          id: string
          interest_rate: number
          maturity_date: string
          penalty_amount: number | null
          principal_amount: number
          source: string
          start_date: string
          status: string
          total_payout: number
          updated_at: string
          user_id: string
        }
        Insert: {
          actual_unlock_date?: string | null
          created_at?: string
          duration_months: number
          expected_interest: number
          id?: string
          interest_rate: number
          maturity_date: string
          penalty_amount?: number | null
          principal_amount: number
          source?: string
          start_date?: string
          status?: string
          total_payout: number
          updated_at?: string
          user_id: string
        }
        Update: {
          actual_unlock_date?: string | null
          created_at?: string
          duration_months?: number
          expected_interest?: number
          id?: string
          interest_rate?: number
          maturity_date?: string
          penalty_amount?: number | null
          principal_amount?: number
          source?: string
          start_date?: string
          status?: string
          total_payout?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      vfd_sandbox_association_chat: {
        Row: {
          association_id: string
          created_at: string
          id: string
          message: string
          message_type: string | null
          user_id: string
        }
        Insert: {
          association_id: string
          created_at?: string
          id?: string
          message: string
          message_type?: string | null
          user_id: string
        }
        Update: {
          association_id?: string
          created_at?: string
          id?: string
          message?: string
          message_type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vfd_sandbox_association_chat_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "vfd_sandbox_associations"
            referencedColumns: ["id"]
          },
        ]
      }
      vfd_sandbox_association_contributions: {
        Row: {
          amount: number
          association_id: string
          created_at: string
          id: string
          narration: string | null
          user_id: string
        }
        Insert: {
          amount: number
          association_id: string
          created_at?: string
          id?: string
          narration?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          association_id?: string
          created_at?: string
          id?: string
          narration?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vfd_sandbox_association_contributions_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "vfd_sandbox_associations"
            referencedColumns: ["id"]
          },
        ]
      }
      vfd_sandbox_association_invites: {
        Row: {
          association_id: string
          created_at: string
          id: string
          invitee_id: string
          inviter_id: string
          responded_at: string | null
          status: string
        }
        Insert: {
          association_id: string
          created_at?: string
          id?: string
          invitee_id: string
          inviter_id: string
          responded_at?: string | null
          status?: string
        }
        Update: {
          association_id?: string
          created_at?: string
          id?: string
          invitee_id?: string
          inviter_id?: string
          responded_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "vfd_sandbox_association_invites_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "vfd_sandbox_associations"
            referencedColumns: ["id"]
          },
        ]
      }
      vfd_sandbox_association_memberships: {
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
            foreignKeyName: "vfd_sandbox_association_memberships_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "vfd_sandbox_associations"
            referencedColumns: ["id"]
          },
        ]
      }
      vfd_sandbox_association_wallets: {
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
            foreignKeyName: "vfd_sandbox_association_wallets_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: true
            referencedRelation: "vfd_sandbox_associations"
            referencedColumns: ["id"]
          },
        ]
      }
      vfd_sandbox_associations: {
        Row: {
          admin_id: string
          approval_status: string
          created_at: string
          description: string | null
          executive_ids_url: string | null
          id: string
          max_members: number
          member_count: number
          name: string
          rejection_reason: string | null
          request_letter_url: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          signatures_url: string | null
          status: string
          updated_at: string
        }
        Insert: {
          admin_id: string
          approval_status?: string
          created_at?: string
          description?: string | null
          executive_ids_url?: string | null
          id?: string
          max_members?: number
          member_count?: number
          name: string
          rejection_reason?: string | null
          request_letter_url?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          signatures_url?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          admin_id?: string
          approval_status?: string
          created_at?: string
          description?: string | null
          executive_ids_url?: string | null
          id?: string
          max_members?: number
          member_count?: number
          name?: string
          rejection_reason?: string | null
          request_letter_url?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          signatures_url?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      vfd_sandbox_bill_beneficiaries: {
        Row: {
          biller_id: string
          biller_name: string
          category: string
          created_at: string
          customer_id: string
          division: string
          id: string
          last_used_at: string | null
          nickname: string
          payment_item_code: string | null
          payment_item_name: string | null
          phone_number: string | null
          product_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          biller_id: string
          biller_name: string
          category: string
          created_at?: string
          customer_id: string
          division: string
          id?: string
          last_used_at?: string | null
          nickname: string
          payment_item_code?: string | null
          payment_item_name?: string | null
          phone_number?: string | null
          product_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          biller_id?: string
          biller_name?: string
          category?: string
          created_at?: string
          customer_id?: string
          division?: string
          id?: string
          last_used_at?: string | null
          nickname?: string
          payment_item_code?: string | null
          payment_item_name?: string | null
          phone_number?: string | null
          product_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      vfd_sandbox_bill_receipts: {
        Row: {
          amount: number
          biller_id: string
          biller_name: string
          category: string
          convenience_fee: number
          created_at: string
          customer_id: string
          delivery_detail: Json
          delivery_status: string
          delivery_token: string | null
          delivery_type: string | null
          delivery_units: string | null
          expires_at: string | null
          held_at: string | null
          hold_state: string
          id: string
          paid_at: string
          payment_item_name: string | null
          phone_number: string | null
          raw_response: Json | null
          recurring_bill_id: string | null
          reference: string
          refunded_at: string | null
          reminder_sent_at: string | null
          request_payload: Json | null
          settled_at: string | null
          status: string
          timed_out_at: string | null
          user_id: string
        }
        Insert: {
          amount: number
          biller_id: string
          biller_name: string
          category: string
          convenience_fee?: number
          created_at?: string
          customer_id: string
          delivery_detail?: Json
          delivery_status?: string
          delivery_token?: string | null
          delivery_type?: string | null
          delivery_units?: string | null
          expires_at?: string | null
          held_at?: string | null
          hold_state?: string
          id?: string
          paid_at?: string
          payment_item_name?: string | null
          phone_number?: string | null
          raw_response?: Json | null
          recurring_bill_id?: string | null
          reference: string
          refunded_at?: string | null
          reminder_sent_at?: string | null
          request_payload?: Json | null
          settled_at?: string | null
          status?: string
          timed_out_at?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          biller_id?: string
          biller_name?: string
          category?: string
          convenience_fee?: number
          created_at?: string
          customer_id?: string
          delivery_detail?: Json
          delivery_status?: string
          delivery_token?: string | null
          delivery_type?: string | null
          delivery_units?: string | null
          expires_at?: string | null
          held_at?: string | null
          hold_state?: string
          id?: string
          paid_at?: string
          payment_item_name?: string | null
          phone_number?: string | null
          raw_response?: Json | null
          recurring_bill_id?: string | null
          reference?: string
          refunded_at?: string | null
          reminder_sent_at?: string | null
          request_payload?: Json | null
          settled_at?: string | null
          status?: string
          timed_out_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      vfd_sandbox_campaign_contributions: {
        Row: {
          amount: number
          anonymous: boolean
          campaign_id: string
          contribution_reference: string | null
          contributor_id: string
          contributor_name: string | null
          created_at: string
          id: string
          message: string | null
          status: string
        }
        Insert: {
          amount: number
          anonymous?: boolean
          campaign_id: string
          contribution_reference?: string | null
          contributor_id: string
          contributor_name?: string | null
          created_at?: string
          id?: string
          message?: string | null
          status?: string
        }
        Update: {
          amount?: number
          anonymous?: boolean
          campaign_id?: string
          contribution_reference?: string | null
          contributor_id?: string
          contributor_name?: string | null
          created_at?: string
          id?: string
          message?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "vfd_sandbox_campaign_contributions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vfd_sandbox_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      vfd_sandbox_campaign_inflows: {
        Row: {
          amount: number
          campaign_id: string
          created_at: string
          id: string
          narration: string | null
          payer_account: string | null
          payer_bank: string | null
          payer_name: string | null
          raw_payload: Json | null
          source: string
          status: string
          vfd_reference: string | null
          vfd_session_id: string
        }
        Insert: {
          amount: number
          campaign_id: string
          created_at?: string
          id?: string
          narration?: string | null
          payer_account?: string | null
          payer_bank?: string | null
          payer_name?: string | null
          raw_payload?: Json | null
          source?: string
          status?: string
          vfd_reference?: string | null
          vfd_session_id: string
        }
        Update: {
          amount?: number
          campaign_id?: string
          created_at?: string
          id?: string
          narration?: string | null
          payer_account?: string | null
          payer_bank?: string | null
          payer_name?: string | null
          raw_payload?: Json | null
          source?: string
          status?: string
          vfd_reference?: string | null
          vfd_session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vfd_sandbox_campaign_inflows_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vfd_sandbox_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      vfd_sandbox_campaign_updates: {
        Row: {
          campaign_id: string
          created_at: string
          created_by: string
          id: string
          update_message: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          created_by: string
          id?: string
          update_message: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          created_by?: string
          id?: string
          update_message?: string
        }
        Relationships: [
          {
            foreignKeyName: "vfd_sandbox_campaign_updates_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vfd_sandbox_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      vfd_sandbox_campaigns: {
        Row: {
          beneficiary_account_name: string | null
          beneficiary_account_number: string | null
          beneficiary_bank_name: string | null
          campaign_image: string | null
          campaign_slug: string | null
          contribution_visibility: string
          contributor_count: number
          created_at: string
          creator_id: string
          deadline: string | null
          description: string | null
          escrow_balance: number
          goal_amount: number
          id: string
          raised_amount: number
          status: string
          title: string
          total_withdrawn: number
          updated_at: string
        }
        Insert: {
          beneficiary_account_name?: string | null
          beneficiary_account_number?: string | null
          beneficiary_bank_name?: string | null
          campaign_image?: string | null
          campaign_slug?: string | null
          contribution_visibility?: string
          contributor_count?: number
          created_at?: string
          creator_id: string
          deadline?: string | null
          description?: string | null
          escrow_balance?: number
          goal_amount: number
          id?: string
          raised_amount?: number
          status?: string
          title: string
          total_withdrawn?: number
          updated_at?: string
        }
        Update: {
          beneficiary_account_name?: string | null
          beneficiary_account_number?: string | null
          beneficiary_bank_name?: string | null
          campaign_image?: string | null
          campaign_slug?: string | null
          contribution_visibility?: string
          contributor_count?: number
          created_at?: string
          creator_id?: string
          deadline?: string | null
          description?: string | null
          escrow_balance?: number
          goal_amount?: number
          id?: string
          raised_amount?: number
          status?: string
          title?: string
          total_withdrawn?: number
          updated_at?: string
        }
        Relationships: []
      }
      vfd_sandbox_chat_messages: {
        Row: {
          created_at: string
          group_id: string
          id: string
          message: string
          message_type: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          message: string
          message_type?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          message?: string
          message_type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      vfd_sandbox_clients: {
        Row: {
          account_status: string | null
          address: string | null
          balance: number | null
          bvn: string | null
          consent_status: string | null
          created_at: string | null
          date_of_birth: string | null
          full_name: string | null
          gender: string | null
          id: string
          kyc_method: string | null
          metadata: Json | null
          nin: string | null
          phone: string | null
          source: string | null
          tier: string | null
          updated_at: string | null
          user_id: string
          vfd_account_number: string | null
          vfd_client_id: string | null
        }
        Insert: {
          account_status?: string | null
          address?: string | null
          balance?: number | null
          bvn?: string | null
          consent_status?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          full_name?: string | null
          gender?: string | null
          id?: string
          kyc_method?: string | null
          metadata?: Json | null
          nin?: string | null
          phone?: string | null
          source?: string | null
          tier?: string | null
          updated_at?: string | null
          user_id: string
          vfd_account_number?: string | null
          vfd_client_id?: string | null
        }
        Update: {
          account_status?: string | null
          address?: string | null
          balance?: number | null
          bvn?: string | null
          consent_status?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          full_name?: string | null
          gender?: string | null
          id?: string
          kyc_method?: string | null
          metadata?: Json | null
          nin?: string | null
          phone?: string | null
          source?: string | null
          tier?: string | null
          updated_at?: string | null
          user_id?: string
          vfd_account_number?: string | null
          vfd_client_id?: string | null
        }
        Relationships: []
      }
      vfd_sandbox_contribution_audit: {
        Row: {
          amount: number
          contribution_type: string
          created_at: string
          cycle_id: string
          error_message: string | null
          group_id: string
          id: string
          next_retry_at: string | null
          penalty_served: boolean
          retry_count: number
          status: string
          user_id: string
        }
        Insert: {
          amount: number
          contribution_type?: string
          created_at?: string
          cycle_id: string
          error_message?: string | null
          group_id: string
          id?: string
          next_retry_at?: string | null
          penalty_served?: boolean
          retry_count?: number
          status?: string
          user_id: string
        }
        Update: {
          amount?: number
          contribution_type?: string
          created_at?: string
          cycle_id?: string
          error_message?: string | null
          group_id?: string
          id?: string
          next_retry_at?: string | null
          penalty_served?: boolean
          retry_count?: number
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vfd_sandbox_contribution_audit_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "vfd_sandbox_contribution_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vfd_sandbox_contribution_audit_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "vfd_sandbox_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      vfd_sandbox_contribution_cycles: {
        Row: {
          completed_at: string | null
          contribution_deadline: string | null
          created_at: string
          cycle_number: number
          group_id: string
          id: string
          payout_amount: number | null
          payout_recipient_id: string | null
          platform_fee: number | null
          status: string
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
          payout_recipient_id?: string | null
          platform_fee?: number | null
          status?: string
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
          payout_recipient_id?: string | null
          platform_fee?: number | null
          status?: string
          total_contributions?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vfd_sandbox_contribution_cycles_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "vfd_sandbox_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      vfd_sandbox_group_contributions: {
        Row: {
          amount: number
          created_at: string
          cycle_number: number
          group_id: string
          id: string
          status: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          cycle_number: number
          group_id: string
          id?: string
          status?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          cycle_number?: number
          group_id?: string
          id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vfd_sandbox_group_contributions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "vfd_sandbox_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      vfd_sandbox_group_invite_links: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string
          group_id: string
          id: string
          invite_token: string
          max_uses: number | null
          use_count: number
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at?: string
          group_id: string
          id?: string
          invite_token?: string
          max_uses?: number | null
          use_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string
          group_id?: string
          id?: string
          invite_token?: string
          max_uses?: number | null
          use_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "vfd_sandbox_group_invite_links_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "vfd_sandbox_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      vfd_sandbox_group_invites: {
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
            foreignKeyName: "vfd_sandbox_group_invites_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "vfd_sandbox_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      vfd_sandbox_group_mandates: {
        Row: {
          created_at: string
          event_payload: Json
          event_type: string
          id: string
          mandate_code: string | null
          mandate_reference: string | null
          member_user_id: string
          thrift_group_id: string
        }
        Insert: {
          created_at?: string
          event_payload?: Json
          event_type: string
          id?: string
          mandate_code?: string | null
          mandate_reference?: string | null
          member_user_id: string
          thrift_group_id: string
        }
        Update: {
          created_at?: string
          event_payload?: Json
          event_type?: string
          id?: string
          mandate_code?: string | null
          mandate_reference?: string | null
          member_user_id?: string
          thrift_group_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vfd_sandbox_group_mandates_thrift_group_id_fkey"
            columns: ["thrift_group_id"]
            isOneToOne: false
            referencedRelation: "vfd_sandbox_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      vfd_sandbox_group_members: {
        Row: {
          continue_confirmed_at: string | null
          contribution_method: string
          group_id: string
          has_contributed_current: boolean
          has_received_payout: boolean
          has_used_swap: boolean | null
          id: string
          joined_at: string
          mandate_authorized_at: string | null
          mandate_code: string | null
          mandate_created_at: string | null
          mandate_end_date: string | null
          mandate_expires_at: string | null
          mandate_fee_amount: number
          mandate_fee_charged_at: string | null
          mandate_frequency: string | null
          mandate_nibss_account: string | null
          mandate_nibss_message: string | null
          mandate_payer_account_number: string | null
          mandate_payer_address: string | null
          mandate_payer_bank_code: string | null
          mandate_payer_email: string | null
          mandate_payer_phone: string | null
          mandate_payload: Json | null
          mandate_reference: string | null
          mandate_start_date: string | null
          mandate_status: string
          payout_order: number | null
          payout_position: number | null
          status: string | null
          terms_accepted_at: string | null
          user_id: string
          wants_continue: boolean
        }
        Insert: {
          continue_confirmed_at?: string | null
          contribution_method?: string
          group_id: string
          has_contributed_current?: boolean
          has_received_payout?: boolean
          has_used_swap?: boolean | null
          id?: string
          joined_at?: string
          mandate_authorized_at?: string | null
          mandate_code?: string | null
          mandate_created_at?: string | null
          mandate_end_date?: string | null
          mandate_expires_at?: string | null
          mandate_fee_amount?: number
          mandate_fee_charged_at?: string | null
          mandate_frequency?: string | null
          mandate_nibss_account?: string | null
          mandate_nibss_message?: string | null
          mandate_payer_account_number?: string | null
          mandate_payer_address?: string | null
          mandate_payer_bank_code?: string | null
          mandate_payer_email?: string | null
          mandate_payer_phone?: string | null
          mandate_payload?: Json | null
          mandate_reference?: string | null
          mandate_start_date?: string | null
          mandate_status?: string
          payout_order?: number | null
          payout_position?: number | null
          status?: string | null
          terms_accepted_at?: string | null
          user_id: string
          wants_continue?: boolean
        }
        Update: {
          continue_confirmed_at?: string | null
          contribution_method?: string
          group_id?: string
          has_contributed_current?: boolean
          has_received_payout?: boolean
          has_used_swap?: boolean | null
          id?: string
          joined_at?: string
          mandate_authorized_at?: string | null
          mandate_code?: string | null
          mandate_created_at?: string | null
          mandate_end_date?: string | null
          mandate_expires_at?: string | null
          mandate_fee_amount?: number
          mandate_fee_charged_at?: string | null
          mandate_frequency?: string | null
          mandate_nibss_account?: string | null
          mandate_nibss_message?: string | null
          mandate_payer_account_number?: string | null
          mandate_payer_address?: string | null
          mandate_payer_bank_code?: string | null
          mandate_payer_email?: string | null
          mandate_payer_phone?: string | null
          mandate_payload?: Json | null
          mandate_reference?: string | null
          mandate_start_date?: string | null
          mandate_status?: string
          payout_order?: number | null
          payout_position?: number | null
          status?: string | null
          terms_accepted_at?: string | null
          user_id?: string
          wants_continue?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "vfd_sandbox_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "vfd_sandbox_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      vfd_sandbox_group_payouts: {
        Row: {
          created_at: string
          cycle_number: number
          gross_amount: number
          group_id: string
          id: string
          net_amount: number
          platform_fee: number
          recipient_id: string
          status: string
        }
        Insert: {
          created_at?: string
          cycle_number: number
          gross_amount: number
          group_id: string
          id?: string
          net_amount: number
          platform_fee?: number
          recipient_id: string
          status?: string
        }
        Update: {
          created_at?: string
          cycle_number?: number
          gross_amount?: number
          group_id?: string
          id?: string
          net_amount?: number
          platform_fee?: number
          recipient_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "vfd_sandbox_group_payouts_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "vfd_sandbox_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      vfd_sandbox_groups: {
        Row: {
          admin_id: string
          auto_debit: boolean
          commenced_at: string | null
          commencement_status: string
          contribution_amount: number
          contribution_day_of_month: number | null
          contribution_day_of_week: number | null
          contribution_hour: number | null
          contribution_minute: number | null
          created_at: string
          current_cycle: number
          current_cycle_index: number
          current_payout_position: number | null
          description: string | null
          funding_mode: string
          id: string
          invite_code: string | null
          is_full_at: string | null
          mandate_reference: string | null
          mandate_status: string
          max_members: number
          member_count: number
          name: string
          next_contribution_date: string | null
          next_payout_date: string | null
          payout_order: string[] | null
          period: string
          pool_ledger_balance: number
          status: string
          swap_window_ends_at: string | null
          total_contributed_kobo: number
          total_cycles: number
          total_paid_out_kobo: number
          updated_at: string
        }
        Insert: {
          admin_id: string
          auto_debit?: boolean
          commenced_at?: string | null
          commencement_status?: string
          contribution_amount: number
          contribution_day_of_month?: number | null
          contribution_day_of_week?: number | null
          contribution_hour?: number | null
          contribution_minute?: number | null
          created_at?: string
          current_cycle?: number
          current_cycle_index?: number
          current_payout_position?: number | null
          description?: string | null
          funding_mode?: string
          id?: string
          invite_code?: string | null
          is_full_at?: string | null
          mandate_reference?: string | null
          mandate_status?: string
          max_members?: number
          member_count?: number
          name: string
          next_contribution_date?: string | null
          next_payout_date?: string | null
          payout_order?: string[] | null
          period?: string
          pool_ledger_balance?: number
          status?: string
          swap_window_ends_at?: string | null
          total_contributed_kobo?: number
          total_cycles?: number
          total_paid_out_kobo?: number
          updated_at?: string
        }
        Update: {
          admin_id?: string
          auto_debit?: boolean
          commenced_at?: string | null
          commencement_status?: string
          contribution_amount?: number
          contribution_day_of_month?: number | null
          contribution_day_of_week?: number | null
          contribution_hour?: number | null
          contribution_minute?: number | null
          created_at?: string
          current_cycle?: number
          current_cycle_index?: number
          current_payout_position?: number | null
          description?: string | null
          funding_mode?: string
          id?: string
          invite_code?: string | null
          is_full_at?: string | null
          mandate_reference?: string | null
          mandate_status?: string
          max_members?: number
          member_count?: number
          name?: string
          next_contribution_date?: string | null
          next_payout_date?: string | null
          payout_order?: string[] | null
          period?: string
          pool_ledger_balance?: number
          status?: string
          swap_window_ends_at?: string | null
          total_contributed_kobo?: number
          total_cycles?: number
          total_paid_out_kobo?: number
          updated_at?: string
        }
        Relationships: []
      }
      vfd_sandbox_kyc_documents: {
        Row: {
          document_type: string
          file_name: string | null
          file_path: string
          file_size: number | null
          id: string
          metadata: Json | null
          mime_type: string | null
          tier_level: number
          uploaded_at: string
          user_id: string
          verification_status: string
          verified_at: string | null
        }
        Insert: {
          document_type: string
          file_name?: string | null
          file_path: string
          file_size?: number | null
          id?: string
          metadata?: Json | null
          mime_type?: string | null
          tier_level: number
          uploaded_at?: string
          user_id: string
          verification_status?: string
          verified_at?: string | null
        }
        Update: {
          document_type?: string
          file_name?: string | null
          file_path?: string
          file_size?: number | null
          id?: string
          metadata?: Json | null
          mime_type?: string | null
          tier_level?: number
          uploaded_at?: string
          user_id?: string
          verification_status?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      vfd_sandbox_notifications: {
        Row: {
          created_at: string
          group_id: string | null
          id: string
          is_read: boolean | null
          message: string
          notification_type: string
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          notification_type: string
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          notification_type?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      vfd_sandbox_penalties: {
        Row: {
          amount: number
          created_at: string
          cycle_id: string
          group_id: string
          id: string
          reason: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          cycle_id: string
          group_id: string
          id?: string
          reason: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          cycle_id?: string
          group_id?: string
          id?: string
          reason?: string
          user_id?: string
        }
        Relationships: []
      }
      vfd_sandbox_position_swaps: {
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
            foreignKeyName: "vfd_sandbox_position_swaps_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "vfd_sandbox_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      vfd_sandbox_recurring_bills: {
        Row: {
          amount: number
          biller_id: string
          biller_name: string
          category: string
          consecutive_failures: number
          created_at: string
          customer_id: string
          day_of_month: number | null
          day_of_week: number | null
          division: string
          frequency: string
          hour_wat: number
          id: string
          last_run_at: string | null
          last_run_reason: string | null
          last_run_status: string | null
          next_run_at: string
          nickname: string | null
          payment_item_code: string
          payment_item_name: string | null
          phone_number: string | null
          product_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          biller_id: string
          biller_name: string
          category: string
          consecutive_failures?: number
          created_at?: string
          customer_id: string
          day_of_month?: number | null
          day_of_week?: number | null
          division: string
          frequency: string
          hour_wat?: number
          id?: string
          last_run_at?: string | null
          last_run_reason?: string | null
          last_run_status?: string | null
          next_run_at: string
          nickname?: string | null
          payment_item_code: string
          payment_item_name?: string | null
          phone_number?: string | null
          product_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          biller_id?: string
          biller_name?: string
          category?: string
          consecutive_failures?: number
          created_at?: string
          customer_id?: string
          day_of_month?: number | null
          day_of_week?: number | null
          division?: string
          frequency?: string
          hour_wat?: number
          id?: string
          last_run_at?: string | null
          last_run_reason?: string | null
          last_run_status?: string | null
          next_run_at?: string
          nickname?: string | null
          payment_item_code?: string
          payment_item_name?: string | null
          phone_number?: string | null
          product_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      vfd_sandbox_split_participants: {
        Row: {
          amount: number
          created_at: string
          id: string
          paid_at: string | null
          split_id: string
          status: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          paid_at?: string | null
          split_id: string
          status?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          paid_at?: string | null
          split_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vfd_sandbox_split_participants_split_id_fkey"
            columns: ["split_id"]
            isOneToOne: false
            referencedRelation: "vfd_sandbox_splits"
            referencedColumns: ["id"]
          },
        ]
      }
      vfd_sandbox_split_transactions: {
        Row: {
          amount: number
          created_at: string
          id: string
          split_id: string
          status: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          split_id: string
          status?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          split_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vfd_sandbox_split_transactions_split_id_fkey"
            columns: ["split_id"]
            isOneToOne: false
            referencedRelation: "vfd_sandbox_splits"
            referencedColumns: ["id"]
          },
        ]
      }
      vfd_sandbox_splits: {
        Row: {
          bill_metadata: Json | null
          created_at: string
          creator_id: string
          expiry_date: string | null
          fee_per_person: number | null
          id: string
          merchant_account: string | null
          merchant_account_name: string | null
          merchant_account_number: string | null
          merchant_bank: string | null
          merchant_bank_name: string | null
          merchant_name: string | null
          paid_count: number
          per_person_amount: number
          platform_fee: number
          purpose: string | null
          settlement_completed_at: string | null
          settlement_failure_reason: string | null
          settlement_reference: string | null
          settlement_status: string | null
          split_count: number
          status: string
          title: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          bill_metadata?: Json | null
          created_at?: string
          creator_id: string
          expiry_date?: string | null
          fee_per_person?: number | null
          id?: string
          merchant_account?: string | null
          merchant_account_name?: string | null
          merchant_account_number?: string | null
          merchant_bank?: string | null
          merchant_bank_name?: string | null
          merchant_name?: string | null
          paid_count?: number
          per_person_amount: number
          platform_fee?: number
          purpose?: string | null
          settlement_completed_at?: string | null
          settlement_failure_reason?: string | null
          settlement_reference?: string | null
          settlement_status?: string | null
          split_count?: number
          status?: string
          title: string
          total_amount: number
          updated_at?: string
        }
        Update: {
          bill_metadata?: Json | null
          created_at?: string
          creator_id?: string
          expiry_date?: string | null
          fee_per_person?: number | null
          id?: string
          merchant_account?: string | null
          merchant_account_name?: string | null
          merchant_account_number?: string | null
          merchant_bank?: string | null
          merchant_bank_name?: string | null
          merchant_name?: string | null
          paid_count?: number
          per_person_amount?: number
          platform_fee?: number
          purpose?: string | null
          settlement_completed_at?: string | null
          settlement_failure_reason?: string | null
          settlement_reference?: string | null
          settlement_status?: string | null
          split_count?: number
          status?: string
          title?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: []
      }
      vfd_sandbox_target_contributions: {
        Row: {
          amount: number
          created_at: string
          id: string
          status: string
          target_id: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          status?: string
          target_id: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          status?: string
          target_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vfd_sandbox_target_contributions_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "vfd_sandbox_targets"
            referencedColumns: ["id"]
          },
        ]
      }
      vfd_sandbox_target_invites: {
        Row: {
          created_at: string
          id: string
          invitee_id: string
          inviter_id: string
          responded_at: string | null
          status: string
          target_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invitee_id: string
          inviter_id: string
          responded_at?: string | null
          status?: string
          target_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invitee_id?: string
          inviter_id?: string
          responded_at?: string | null
          status?: string
          target_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vfd_sandbox_target_invites_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "vfd_sandbox_targets"
            referencedColumns: ["id"]
          },
        ]
      }
      vfd_sandbox_target_mandates: {
        Row: {
          created_at: string
          event_payload: Json | null
          event_type: string
          id: string
          mandate_code: string | null
          mandate_reference: string | null
          member_user_id: string
          target_id: string
        }
        Insert: {
          created_at?: string
          event_payload?: Json | null
          event_type: string
          id?: string
          mandate_code?: string | null
          mandate_reference?: string | null
          member_user_id: string
          target_id: string
        }
        Update: {
          created_at?: string
          event_payload?: Json | null
          event_type?: string
          id?: string
          mandate_code?: string | null
          mandate_reference?: string | null
          member_user_id?: string
          target_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vfd_sandbox_target_mandates_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "vfd_sandbox_targets"
            referencedColumns: ["id"]
          },
        ]
      }
      vfd_sandbox_target_members: {
        Row: {
          contributed_amount: number
          contribution_method: string | null
          id: string
          joined_at: string
          mandate_authorized_at: string | null
          mandate_code: string | null
          mandate_created_at: string | null
          mandate_end_date: string | null
          mandate_expires_at: string | null
          mandate_fee_amount: number | null
          mandate_fee_charged_at: string | null
          mandate_frequency: string | null
          mandate_nibss_account: string | null
          mandate_nibss_message: string | null
          mandate_payer_account_number: string | null
          mandate_payer_address: string | null
          mandate_payer_bank_code: string | null
          mandate_payer_email: string | null
          mandate_payer_phone: string | null
          mandate_payload: Json | null
          mandate_reference: string | null
          mandate_start_date: string | null
          mandate_status: string | null
          target_id: string
          user_id: string
        }
        Insert: {
          contributed_amount?: number
          contribution_method?: string | null
          id?: string
          joined_at?: string
          mandate_authorized_at?: string | null
          mandate_code?: string | null
          mandate_created_at?: string | null
          mandate_end_date?: string | null
          mandate_expires_at?: string | null
          mandate_fee_amount?: number | null
          mandate_fee_charged_at?: string | null
          mandate_frequency?: string | null
          mandate_nibss_account?: string | null
          mandate_nibss_message?: string | null
          mandate_payer_account_number?: string | null
          mandate_payer_address?: string | null
          mandate_payer_bank_code?: string | null
          mandate_payer_email?: string | null
          mandate_payer_phone?: string | null
          mandate_payload?: Json | null
          mandate_reference?: string | null
          mandate_start_date?: string | null
          mandate_status?: string | null
          target_id: string
          user_id: string
        }
        Update: {
          contributed_amount?: number
          contribution_method?: string | null
          id?: string
          joined_at?: string
          mandate_authorized_at?: string | null
          mandate_code?: string | null
          mandate_created_at?: string | null
          mandate_end_date?: string | null
          mandate_expires_at?: string | null
          mandate_fee_amount?: number | null
          mandate_fee_charged_at?: string | null
          mandate_frequency?: string | null
          mandate_nibss_account?: string | null
          mandate_nibss_message?: string | null
          mandate_payer_account_number?: string | null
          mandate_payer_address?: string | null
          mandate_payer_bank_code?: string | null
          mandate_payer_email?: string | null
          mandate_payer_phone?: string | null
          mandate_payload?: Json | null
          mandate_reference?: string | null
          mandate_start_date?: string | null
          mandate_status?: string | null
          target_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vfd_sandbox_target_members_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "vfd_sandbox_targets"
            referencedColumns: ["id"]
          },
        ]
      }
      vfd_sandbox_target_withdrawal_requests: {
        Row: {
          amount: number
          approval_count: number
          created_at: string
          id: string
          reason: string | null
          rejection_count: number
          requested_by: string
          required_votes: number
          resolved_at: string | null
          status: string
          target_id: string
        }
        Insert: {
          amount: number
          approval_count?: number
          created_at?: string
          id?: string
          reason?: string | null
          rejection_count?: number
          requested_by: string
          required_votes?: number
          resolved_at?: string | null
          status?: string
          target_id: string
        }
        Update: {
          amount?: number
          approval_count?: number
          created_at?: string
          id?: string
          reason?: string | null
          rejection_count?: number
          requested_by?: string
          required_votes?: number
          resolved_at?: string | null
          status?: string
          target_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vfd_sandbox_target_withdrawal_requests_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "vfd_sandbox_targets"
            referencedColumns: ["id"]
          },
        ]
      }
      vfd_sandbox_target_withdrawal_votes: {
        Row: {
          created_at: string
          id: string
          user_id: string
          vote: string
          withdrawal_request_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
          vote: string
          withdrawal_request_id: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
          vote?: string
          withdrawal_request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vfd_sandbox_target_withdrawal_votes_withdrawal_request_id_fkey"
            columns: ["withdrawal_request_id"]
            isOneToOne: false
            referencedRelation: "vfd_sandbox_target_withdrawal_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      vfd_sandbox_targets: {
        Row: {
          admin_id: string
          contribution_amount: number
          created_at: string
          description: string | null
          frequency: string
          funding_mode: string
          goal_amount: number
          id: string
          invite_limit: number | null
          mandate_reference: string | null
          mandate_status: string
          max_members: number
          member_count: number
          name: string
          reason: string | null
          savings_type: string
          status: string
          target_date: string | null
          total_contributed: number
          updated_at: string
        }
        Insert: {
          admin_id: string
          contribution_amount: number
          created_at?: string
          description?: string | null
          frequency?: string
          funding_mode?: string
          goal_amount: number
          id?: string
          invite_limit?: number | null
          mandate_reference?: string | null
          mandate_status?: string
          max_members?: number
          member_count?: number
          name: string
          reason?: string | null
          savings_type?: string
          status?: string
          target_date?: string | null
          total_contributed?: number
          updated_at?: string
        }
        Update: {
          admin_id?: string
          contribution_amount?: number
          created_at?: string
          description?: string | null
          frequency?: string
          funding_mode?: string
          goal_amount?: number
          id?: string
          invite_limit?: number | null
          mandate_reference?: string | null
          mandate_status?: string
          max_members?: number
          member_count?: number
          name?: string
          reason?: string | null
          savings_type?: string
          status?: string
          target_date?: string | null
          total_contributed?: number
          updated_at?: string
        }
        Relationships: []
      }
      vfd_sandbox_thrift_ledger_entries: {
        Row: {
          amount_kobo: number
          confirmed_at: string | null
          created_at: string
          cycle_index: number | null
          direction: string
          entry_type: string
          id: string
          mandate_code: string | null
          member_user_id: string | null
          metadata: Json
          payment_reference: string | null
          status: string
          thrift_group_id: string
          vfd_payment_reference: string | null
          vfd_session_id: string | null
        }
        Insert: {
          amount_kobo: number
          confirmed_at?: string | null
          created_at?: string
          cycle_index?: number | null
          direction: string
          entry_type: string
          id?: string
          mandate_code?: string | null
          member_user_id?: string | null
          metadata?: Json
          payment_reference?: string | null
          status?: string
          thrift_group_id: string
          vfd_payment_reference?: string | null
          vfd_session_id?: string | null
        }
        Update: {
          amount_kobo?: number
          confirmed_at?: string | null
          created_at?: string
          cycle_index?: number | null
          direction?: string
          entry_type?: string
          id?: string
          mandate_code?: string | null
          member_user_id?: string | null
          metadata?: Json
          payment_reference?: string | null
          status?: string
          thrift_group_id?: string
          vfd_payment_reference?: string | null
          vfd_session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vfd_sandbox_thrift_ledger_entries_thrift_group_id_fkey"
            columns: ["thrift_group_id"]
            isOneToOne: false
            referencedRelation: "vfd_sandbox_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      vfd_sandbox_transactions: {
        Row: {
          amount: number
          beneficiary_account: string | null
          beneficiary_bank: string | null
          beneficiary_bank_code: string | null
          beneficiary_name: string | null
          committed_at: string | null
          created_at: string | null
          description: string | null
          id: string
          idempotency_key: string | null
          metadata: Json | null
          reference: string | null
          reserved_at: string | null
          reversed_at: string | null
          session_id: string | null
          source: string | null
          status: string | null
          transaction_type: string
          user_id: string
          vestara_reservation_ref: string | null
          vfd_account_number: string | null
          vfd_reference: string | null
        }
        Insert: {
          amount: number
          beneficiary_account?: string | null
          beneficiary_bank?: string | null
          beneficiary_bank_code?: string | null
          beneficiary_name?: string | null
          committed_at?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          idempotency_key?: string | null
          metadata?: Json | null
          reference?: string | null
          reserved_at?: string | null
          reversed_at?: string | null
          session_id?: string | null
          source?: string | null
          status?: string | null
          transaction_type: string
          user_id: string
          vestara_reservation_ref?: string | null
          vfd_account_number?: string | null
          vfd_reference?: string | null
        }
        Update: {
          amount?: number
          beneficiary_account?: string | null
          beneficiary_bank?: string | null
          beneficiary_bank_code?: string | null
          beneficiary_name?: string | null
          committed_at?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          idempotency_key?: string | null
          metadata?: Json | null
          reference?: string | null
          reserved_at?: string | null
          reversed_at?: string | null
          session_id?: string | null
          source?: string | null
          status?: string | null
          transaction_type?: string
          user_id?: string
          vestara_reservation_ref?: string | null
          vfd_account_number?: string | null
          vfd_reference?: string | null
        }
        Relationships: []
      }
      vfd_sandbox_transfer_beneficiaries: {
        Row: {
          account_number: string
          alias: string
          bank_code: string
          bank_name: string
          beneficiary_name: string
          created_at: string
          id: string
          is_intra: boolean
          last_used_at: string | null
          pinned: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          account_number: string
          alias: string
          bank_code: string
          bank_name: string
          beneficiary_name: string
          created_at?: string
          id?: string
          is_intra?: boolean
          last_used_at?: string | null
          pinned?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          account_number?: string
          alias?: string
          bank_code?: string
          bank_name?: string
          beneficiary_name?: string
          created_at?: string
          id?: string
          is_intra?: boolean
          last_used_at?: string | null
          pinned?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      vfd_sandbox_virtual_cards: {
        Row: {
          activated_at: string | null
          blocked_at: string | null
          card_id: string
          created_at: string
          cvv_encrypted: string | null
          expiry_date: string
          full_pan_encrypted: string | null
          id: string
          issuance_fee: number
          masked_pan: string
          pin_offset: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          activated_at?: string | null
          blocked_at?: string | null
          card_id: string
          created_at?: string
          cvv_encrypted?: string | null
          expiry_date: string
          full_pan_encrypted?: string | null
          id?: string
          issuance_fee?: number
          masked_pan: string
          pin_offset?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          activated_at?: string | null
          blocked_at?: string | null
          card_id?: string
          created_at?: string
          cvv_encrypted?: string | null
          expiry_date?: string
          full_pan_encrypted?: string | null
          id?: string
          issuance_fee?: number
          masked_pan?: string
          pin_offset?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      vfd_sandbox_webhook_logs: {
        Row: {
          created_at: string | null
          event_type: string
          id: string
          payload: Json
          processed: boolean | null
          processed_at: string | null
        }
        Insert: {
          created_at?: string | null
          event_type: string
          id?: string
          payload: Json
          processed?: boolean | null
          processed_at?: string | null
        }
        Update: {
          created_at?: string | null
          event_type?: string
          id?: string
          payload?: Json
          processed?: boolean | null
          processed_at?: string | null
        }
        Relationships: []
      }
      vfd_savings_debit_schedule: {
        Row: {
          amount: number
          attempt_count: number
          collected_at: string | null
          created_at: string
          failed_reason: string | null
          id: string
          savings_id: string
          scheduled_at: string
          seq: number
          status: string
          updated_at: string
          user_id: string
          vfd_reference: string | null
        }
        Insert: {
          amount: number
          attempt_count?: number
          collected_at?: string | null
          created_at?: string
          failed_reason?: string | null
          id?: string
          savings_id: string
          scheduled_at: string
          seq: number
          status?: string
          updated_at?: string
          user_id: string
          vfd_reference?: string | null
        }
        Update: {
          amount?: number
          attempt_count?: number
          collected_at?: string | null
          created_at?: string
          failed_reason?: string | null
          id?: string
          savings_id?: string
          scheduled_at?: string
          seq?: number
          status?: string
          updated_at?: string
          user_id?: string
          vfd_reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vfd_savings_debit_schedule_savings_id_fkey"
            columns: ["savings_id"]
            isOneToOne: false
            referencedRelation: "vestara_savings"
            referencedColumns: ["id"]
          },
        ]
      }
      vfd_savings_mandate_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          mandate_id: string | null
          payload: Json
          savings_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          mandate_id?: string | null
          payload?: Json
          savings_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          mandate_id?: string | null
          payload?: Json
          savings_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vfd_savings_mandate_events_savings_id_fkey"
            columns: ["savings_id"]
            isOneToOne: false
            referencedRelation: "vestara_savings"
            referencedColumns: ["id"]
          },
        ]
      }
      vfd_settings: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      vfd_transaction_events: {
        Row: {
          actor: string
          created_at: string
          event_type: string
          from_status: string | null
          id: string
          payload: Json
          reference: string | null
          to_status: string | null
          transaction_id: string | null
          user_id: string | null
        }
        Insert: {
          actor?: string
          created_at?: string
          event_type: string
          from_status?: string | null
          id?: string
          payload?: Json
          reference?: string | null
          to_status?: string | null
          transaction_id?: string | null
          user_id?: string | null
        }
        Update: {
          actor?: string
          created_at?: string
          event_type?: string
          from_status?: string | null
          id?: string
          payload?: Json
          reference?: string | null
          to_status?: string | null
          transaction_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      vfd_user_balances: {
        Row: {
          available_balance: number | null
          created_at: string
          id: string
          last_synced_at: string | null
          locked_balance: number
          savings_balance: number
          total_balance: number
          updated_at: string
          user_id: string
        }
        Insert: {
          available_balance?: number | null
          created_at?: string
          id?: string
          last_synced_at?: string | null
          locked_balance?: number
          savings_balance?: number
          total_balance?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          available_balance?: number | null
          created_at?: string
          id?: string
          last_synced_at?: string | null
          locked_balance?: number
          savings_balance?: number
          total_balance?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      vfd_webhook_dlq: {
        Row: {
          attempts: number
          created_at: string
          error: string | null
          event_type: string | null
          headers: Json | null
          id: string
          last_attempt_at: string
          payload: Json
          reference: string | null
          resolved: boolean
          resolved_at: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          error?: string | null
          event_type?: string | null
          headers?: Json | null
          id?: string
          last_attempt_at?: string
          payload: Json
          reference?: string | null
          resolved?: boolean
          resolved_at?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          error?: string | null
          event_type?: string | null
          headers?: Json | null
          id?: string
          last_attempt_at?: string
          payload?: Json
          reference?: string | null
          resolved?: boolean
          resolved_at?: string | null
        }
        Relationships: []
      }
      wallet_reversals: {
        Row: {
          amount: number
          created_at: string
          direction: string
          id: string
          initiated_by: string | null
          metadata: Json | null
          original_reference: string | null
          reason: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          direction: string
          id?: string
          initiated_by?: string | null
          metadata?: Json | null
          original_reference?: string | null
          reason?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          direction?: string
          id?: string
          initiated_by?: string | null
          metadata?: Json | null
          original_reference?: string | null
          reason?: string | null
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
      card_token_orphans: {
        Row: {
          card_last4: string | null
          card_type: string | null
          created_at: string | null
          id: string | null
          is_active: boolean | null
          last_tokenized_at: string | null
          user_id: string | null
        }
        Insert: {
          card_last4?: string | null
          card_type?: string | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          last_tokenized_at?: string | null
          user_id?: string | null
        }
        Update: {
          card_last4?: string | null
          card_type?: string | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          last_tokenized_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
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
      vestara_account_drift: {
        Row: {
          account_type:
            | Database["public"]["Enums"]["vestara_account_type"]
            | null
          derived_balance: number | null
          drift: number | null
          id: string | null
          is_system: boolean | null
          stored_balance: number | null
          user_id: string | null
        }
        Relationships: []
      }
      vestara_derived_balances: {
        Row: {
          account_id: string | null
          account_type:
            | Database["public"]["Enums"]["vestara_account_type"]
            | null
          derived_balance: number | null
          drift: number | null
          is_system: boolean | null
          label: string | null
          stored_balance: number | null
          user_id: string | null
        }
        Relationships: []
      }
      vestara_transaction_detail: {
        Row: {
          account_id: string | null
          account_label: string | null
          account_owner: string | null
          account_type:
            | Database["public"]["Enums"]["vestara_account_type"]
            | null
          amount: number | null
          completed_at: string | null
          created_at: string | null
          credit: number | null
          debit: number | null
          entry_id: string | null
          initiated_by: string | null
          metadata: Json | null
          reference: string | null
          status: Database["public"]["Enums"]["vestara_tx_status"] | null
          transaction_id: string | null
          type: Database["public"]["Enums"]["vestara_tx_type"] | null
        }
        Relationships: [
          {
            foreignKeyName: "vestara_ledger_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "vestara_account_drift"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vestara_ledger_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "vestara_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vestara_ledger_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "vestara_derived_balances"
            referencedColumns: ["account_id"]
          },
        ]
      }
    }
    Functions: {
      admin_assign_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: Json
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
      admin_grant_permission: {
        Args: {
          _permission: string
          _role: Database["public"]["Enums"]["app_role"]
        }
        Returns: Json
      }
      admin_list_card_tokens: {
        Args: { _limit?: number }
        Returns: {
          card_last4: string
          card_status: string
          card_type: string
          created_at: string
          group_id: string
          id: string
          user_id: string
        }[]
      }
      admin_list_staff: {
        Args: never
        Returns: {
          created_at: string
          email: string
          full_name: string
          roles: Database["public"]["Enums"]["app_role"][]
          user_id: string
        }[]
      }
      admin_remove_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: Json
      }
      admin_revoke_permission: {
        Args: {
          _permission: string
          _role: Database["public"]["Enums"]["app_role"]
        }
        Returns: Json
      }
      apply_balance_delta: {
        Args: {
          _locked_delta?: number
          _require_available?: number
          _savings_delta?: number
          _total_delta?: number
          _user_id: string
        }
        Returns: Json
      }
      award_cycle_completion: {
        Args: { _group_id: string; _user_id: string }
        Returns: undefined
      }
      can_self_join_group: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
      cancel_split_request: {
        Args: { _creator_id: string; _split_request_id: string }
        Returns: Json
      }
      cast_target_withdrawal_vote: {
        Args: { _request_id: string; _vote: string; _voter_id: string }
        Returns: Json
      }
      check_login_allowed: {
        Args: { _email: string; _ip_address?: string }
        Returns: Json
      }
      check_rate_limit: {
        Args: {
          _endpoint: string
          _identifier: string
          _max_requests?: number
          _window_seconds?: number
        }
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
      claim_split_settlement: {
        Args: { _split_request_id: string }
        Returns: Json
      }
      cleanup_orphan_card_tokens: { Args: never; Returns: Json }
      cleanup_rate_limits: { Args: never; Returns: undefined }
      confirm_withdrawal_debit: {
        Args: {
          _amount: number
          _description: string
          _reference: string
          _user_id: string
        }
        Returns: Json
      }
      consume_nonce: {
        Args: {
          _endpoint: string
          _max_age_seconds?: number
          _nonce: string
          _user_id?: string
        }
        Returns: boolean
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
          _description: string
          _reference_id: string
          _reference_type: string
          _user_id: string
        }
        Returns: Json
      }
      debit_wallet_via_ledger: {
        Args: {
          _amount: number
          _description: string
          _reference_id: string
          _reference_type: string
          _user_id: string
        }
        Returns: Json
      }
      decline_split_participation: {
        Args: { _split_request_id: string; _user_id: string }
        Returns: Json
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enforce_caller_is: { Args: { _target: string }; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      freeze_wallet_for_withdrawal: {
        Args: {
          _amount: number
          _description: string
          _reference: string
          _user_id: string
        }
        Returns: Json
      }
      gen_random_bytes: { Args: { n: number }; Returns: string }
      gen_random_uuid: { Args: never; Returns: string }
      get_own_group_mandate: {
        Args: { _group_id: string }
        Returns: {
          mandate_authorized_at: string
          mandate_code: string
          mandate_end_date: string
          mandate_expires_at: string
          mandate_frequency: string
          mandate_nibss_account: string
          mandate_nibss_message: string
          mandate_payer_account_number: string
          mandate_payer_address: string
          mandate_payer_bank_code: string
          mandate_payer_email: string
          mandate_payer_phone: string
          mandate_reference: string
          mandate_start_date: string
          mandate_status: string
        }[]
      }
      get_own_target_mandate: {
        Args: { _target_id: string }
        Returns: {
          mandate_authorized_at: string
          mandate_code: string
          mandate_end_date: string
          mandate_expires_at: string
          mandate_frequency: string
          mandate_nibss_account: string
          mandate_nibss_message: string
          mandate_payer_account_number: string
          mandate_payer_address: string
          mandate_payer_bank_code: string
          mandate_payer_email: string
          mandate_payer_phone: string
          mandate_reference: string
          mandate_start_date: string
          mandate_status: string
        }[]
      }
      get_own_vfd_client_pii: {
        Args: never
        Returns: {
          address: string
          bvn: string
          date_of_birth: string
          nin: string
        }[]
      }
      get_public_goal_campaign: {
        Args: { _id: string }
        Returns: {
          amount_raised: number
          campaign_deadline: string
          campaign_image: string
          campaign_owner_user_id: string
          campaign_slug: string
          campaign_status: string
          campaign_title: string
          contribution_visibility: string
          contributor_count: number
          created_at: string
          description: string
          goal_amount: number
          id: string
          updated_at: string
        }[]
      }
      get_public_goal_campaigns: {
        Args: never
        Returns: {
          amount_raised: number
          campaign_deadline: string
          campaign_image: string
          campaign_owner_user_id: string
          campaign_slug: string
          campaign_status: string
          campaign_title: string
          contribution_visibility: string
          contributor_count: number
          created_at: string
          description: string
          goal_amount: number
          id: string
          updated_at: string
        }[]
      }
      get_public_goal_contributions: {
        Args: { p_campaign_id: string }
        Returns: {
          anonymous: boolean
          campaign_id: string
          contribution_amount: number
          contributor_name: string
          created_at: string
          id: string
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
      get_public_vfd_sandbox_campaign: {
        Args: { p_id: string }
        Returns: {
          campaign_image: string
          campaign_slug: string
          contribution_visibility: string
          contributor_count: number
          created_at: string
          creator_id: string
          deadline: string
          description: string
          goal_amount: number
          id: string
          raised_amount: number
          status: string
          title: string
          updated_at: string
        }[]
      }
      get_public_vfd_sandbox_campaign_by_slug: {
        Args: { p_slug: string }
        Returns: {
          campaign_image: string
          campaign_slug: string
          contribution_visibility: string
          contributor_count: number
          created_at: string
          creator_id: string
          deadline: string
          description: string
          goal_amount: number
          id: string
          payment_reference: string
          raised_amount: number
          status: string
          title: string
          updated_at: string
        }[]
      }
      get_public_vfd_sandbox_campaigns: {
        Args: never
        Returns: {
          campaign_image: string
          campaign_slug: string
          contribution_visibility: string
          contributor_count: number
          created_at: string
          creator_id: string
          deadline: string
          description: string
          goal_amount: number
          id: string
          raised_amount: number
          status: string
          title: string
          updated_at: string
        }[]
      }
      get_vfd_clients_redacted: {
        Args: never
        Returns: {
          account_status: string
          balance: number
          consent_status: string
          created_at: string
          full_name: string
          id: string
          kyc_method: string
          source: string
          tier: string
          updated_at: string
          user_id: string
          vfd_account_number: string
          vfd_client_id: string
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
      insert_user_notification: {
        Args: {
          _message: string
          _notification_type?: string
          _title: string
          _user_id: string
        }
        Returns: undefined
      }
      is_admin: { Args: never; Returns: boolean }
      is_any_admin: { Args: { _user_id?: string }; Returns: boolean }
      is_backend_role: { Args: never; Returns: boolean }
      is_group_admin: { Args: { _group_id: string }; Returns: boolean }
      is_group_member: { Args: { _group_id: string }; Returns: boolean }
      is_split_participant:
        | {
            Args: { _split_request_id: string; _user_id: string }
            Returns: boolean
          }
        | { Args: { _user_id: string }; Returns: string[] }
      is_split_request_creator: {
        Args: { _request_id: string }
        Returns: boolean
      }
      is_target_ajo_admin: { Args: { p_group_id: string }; Returns: boolean }
      is_target_ajo_member: { Args: { p_group_id: string }; Returns: boolean }
      is_vfd_sandbox_association_member: {
        Args: { _association_id: string; _user_id: string }
        Returns: boolean
      }
      is_vfd_sandbox_group_member: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
      is_vfd_sandbox_split_participant: {
        Args: { _split_id: string; _user_id: string }
        Returns: boolean
      }
      is_vfd_sandbox_target_member: {
        Args: { _target_id: string; _user_id: string }
        Returns: boolean
      }
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
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      process_contribution_atomic: {
        Args: { _amount: number; _group_id: string; _user_id: string }
        Returns: Json
      }
      process_referral_reward: {
        Args: { p_referred_user_id: string }
        Returns: Json
      }
      process_split_payment: {
        Args: { _amount: number; _split_request_id: string; _user_id: string }
        Returns: Json
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
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
      record_platform_expense: {
        Args: {
          _amount: number
          _description: string
          _expense_type: string
          _metadata?: Json
          _source_group_id?: string
          _source_id?: string
          _source_type?: string
          _source_user_id?: string
        }
        Returns: Json
      }
      record_platform_fee: {
        Args: {
          _amount: number
          _source_group_id?: string
          _source_id: string
          _source_type: string
          _source_user_id: string
        }
        Returns: undefined
      }
      release_referral_liens: { Args: { p_user_id: string }; Returns: Json }
      release_withdrawal_freeze: {
        Args: {
          _amount: number
          _description: string
          _reference: string
          _user_id: string
        }
        Returns: Json
      }
      remove_split_participant: {
        Args: {
          _creator_id: string
          _participant_user_id: string
          _split_request_id: string
        }
        Returns: Json
      }
      search_public_profiles: {
        Args: { _limit?: number; _query: string }
        Returns: {
          avatar_url: string
          email: string
          full_name: string
          id: string
          username: string
        }[]
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
      send_split_invite: {
        Args: {
          _amount_due: number
          _invitee_id: string
          _inviter_id: string
          _split_request_id: string
        }
        Returns: Json
      }
      send_split_payment_reminder: {
        Args: { _split_request_id: string; _target_user_id: string }
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
      verify_pending_transaction: {
        Args: { amount: number; tx_ref: string }
        Returns: boolean
      }
      vestara_accrue_daily_interest: { Args: never; Returns: Json }
      vestara_accrue_interest: {
        Args: {
          _amount: number
          _metadata?: Json
          _reference: string
          _user_id: string
        }
        Returns: Json
      }
      vestara_aging_pending_savings: {
        Args: { _threshold_hours?: number }
        Returns: Json
      }
      vestara_approve_savings: {
        Args: {
          _admin_id: string
          _notes?: string
          _savings_id: string
          _vfd_confirmation_note?: string
          _vfd_confirmation_reference: string
        }
        Returns: Json
      }
      vestara_auto_mature_due: { Args: never; Returns: Json }
      vestara_bill_reconcile_vfd_debit: {
        Args: {
          _actual_debit: number
          _charge_amount?: number
          _face_amount: number
          _metadata?: Json
          _reference: string
        }
        Returns: Json
      }
      vestara_bill_release: {
        Args: { _metadata?: Json; _reference: string }
        Returns: Json
      }
      vestara_bill_reserve: {
        Args: {
          _amount: number
          _metadata?: Json
          _reference: string
          _user_id: string
        }
        Returns: Json
      }
      vestara_bill_settle: {
        Args: { _fee_amount?: number; _metadata?: Json; _reference: string }
        Returns: Json
      }
      vestara_campaign_contribute: {
        Args: {
          _amount: number
          _campaign_id: string
          _metadata?: Json
          _reference: string
          _user_id: string
        }
        Returns: Json
      }
      vestara_campaign_withdraw: {
        Args: {
          _amount: number
          _campaign_id: string
          _metadata?: Json
          _reference: string
          _user_id: string
        }
        Returns: Json
      }
      vestara_create_savings: {
        Args: {
          _principal: number
          _product_code: Database["public"]["Enums"]["vestara_product_code"]
          _reference?: string
          _tenor_days: number
          _user_id: string
        }
        Returns: Json
      }
      vestara_create_savings_pending: {
        Args: {
          _principal: number
          _product_code: Database["public"]["Enums"]["vestara_product_code"]
          _reference?: string
          _tenor_days: number
          _user_id: string
        }
        Returns: Json
      }
      vestara_crowdfund_contribute: {
        Args: {
          _amount: number
          _campaign_id: string
          _metadata?: Json
          _reference: string
          _user_id: string
        }
        Returns: Json
      }
      vestara_crowdfund_disburse: {
        Args: {
          _amount: number
          _beneficiary_id: string
          _campaign_id: string
          _metadata?: Json
          _reference: string
        }
        Returns: Json
      }
      vestara_deposit: {
        Args: {
          _amount: number
          _metadata?: Json
          _reference: string
          _user_id: string
        }
        Returns: Json
      }
      vestara_detect_balance_drift: { Args: never; Returns: Json }
      vestara_early_withdraw_savings: {
        Args: { _savings_id: string; _user_id: string }
        Returns: Json
      }
      vestara_get_balance: { Args: { _user_id: string }; Returns: Json }
      vestara_get_or_create_account: {
        Args: {
          _account_type: Database["public"]["Enums"]["vestara_account_type"]
          _campaign_ref?: string
          _group_ref?: string
          _label?: string
          _split_ref?: string
          _user_id: string
        }
        Returns: string
      }
      vestara_lock_funds: {
        Args: {
          _amount: number
          _duration_months: number
          _metadata?: Json
          _reference: string
          _user_id: string
        }
        Returns: Json
      }
      vestara_mature_savings: { Args: { _savings_id: string }; Returns: Json }
      vestara_payout_interest: {
        Args: {
          _amount: number
          _metadata?: Json
          _reference: string
          _user_id: string
        }
        Returns: Json
      }
      vestara_post_transaction: {
        Args: {
          _amount: number
          _entries: Json
          _initiated_by: string
          _metadata?: Json
          _reference: string
          _type: Database["public"]["Enums"]["vestara_tx_type"]
        }
        Returns: Json
      }
      vestara_reject_savings: {
        Args: { _admin_id: string; _notes?: string; _savings_id: string }
        Returns: Json
      }
      vestara_resolve_rate: {
        Args: {
          _amount: number
          _product_code: Database["public"]["Enums"]["vestara_product_code"]
          _tenor_days: number
        }
        Returns: {
          source: string
          user_rate: number
          vfd_rate: number
        }[]
      }
      vestara_reverse_transaction: {
        Args: {
          _initiated_by?: string
          _metadata?: Json
          _original_reference: string
          _reason: string
        }
        Returns: Json
      }
      vestara_run_reconciliation: { Args: never; Returns: Json }
      vestara_split_distribute: {
        Args: {
          _initiated_by: string
          _metadata?: Json
          _recipients: Json
          _reference: string
          _split_id: string
        }
        Returns: Json
      }
      vestara_split_pay: {
        Args: {
          _amount: number
          _metadata?: Json
          _reference: string
          _split_id: string
          _user_id: string
        }
        Returns: Json
      }
      vestara_split_refund: {
        Args: {
          _amount: number
          _metadata?: Json
          _reference: string
          _split_id: string
          _user_id: string
        }
        Returns: Json
      }
      vestara_sync_user_balance_cache: {
        Args: { _user_id: string }
        Returns: Json
      }
      vestara_target_payout: {
        Args: {
          _amount: number
          _group_id: string
          _metadata?: Json
          _reference: string
          _user_id: string
        }
        Returns: Json
      }
      vestara_thrift_contribute: {
        Args: {
          _amount: number
          _group_id: string
          _metadata?: Json
          _reference: string
          _user_id: string
        }
        Returns: Json
      }
      vestara_thrift_payout: {
        Args: {
          _beneficiary_id: string
          _fee?: number
          _gross_amount: number
          _group_id: string
          _metadata?: Json
          _reference?: string
        }
        Returns: Json
      }
      vestara_transfer_complete: {
        Args: {
          _metadata?: Json
          _original_reference: string
          _success: boolean
          _user_id: string
        }
        Returns: Json
      }
      vestara_transfer_initiate: {
        Args: {
          _amount: number
          _metadata?: Json
          _reference: string
          _user_id: string
        }
        Returns: Json
      }
      vestara_unlock_funds: {
        Args: {
          _lock_account_id: string
          _metadata?: Json
          _penalty?: number
          _reference?: string
          _user_id: string
        }
        Returns: Json
      }
      vestara_withdraw: {
        Args: {
          _amount: number
          _metadata?: Json
          _reference: string
          _user_id: string
        }
        Returns: Json
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
      transaction_status: "pending" | "completed" | "failed" | "processing"
      transaction_type:
        | "contribution"
        | "payout"
        | "funding"
        | "withdrawal"
        | "lock"
        | "unlock"
        | "service_fee"
        | "split_payment"
      vestara_account_type:
        | "wallet"
        | "locked_savings"
        | "accrued_interest"
        | "thrift_pool"
        | "crowdfunding_pool"
        | "split_holding"
        | "settlement"
        | "interest_expense"
        | "revenue"
        | "pending_transfer"
        | "pending_savings"
        | "bills_hold"
        | "vfd_charges_expense"
        | "ledger_adjustment"
      vestara_product_code: "goalsave" | "vault" | "lockmax" | "upfront_yield"
      vestara_savings_status:
        | "active"
        | "matured"
        | "early_withdrawn"
        | "cancelled"
      vestara_tx_status: "pending" | "completed" | "failed" | "reversed"
      vestara_tx_type:
        | "deposit"
        | "withdrawal"
        | "lock"
        | "unlock"
        | "thrift_contribution"
        | "thrift_payout"
        | "split_payment"
        | "split_distribution"
        | "crowdfunding_contribution"
        | "crowdfunding_disbursement"
        | "interest_accrual"
        | "interest_payout"
        | "fee"
        | "transfer"
        | "reversal"
        | "savings_create"
        | "interest"
        | "savings_pending_hold"
        | "savings_pending_release"
        | "savings_activation"
        | "savings_approve"
        | "savings_reject_refund"
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
      transaction_status: ["pending", "completed", "failed", "processing"],
      transaction_type: [
        "contribution",
        "payout",
        "funding",
        "withdrawal",
        "lock",
        "unlock",
        "service_fee",
        "split_payment",
      ],
      vestara_account_type: [
        "wallet",
        "locked_savings",
        "accrued_interest",
        "thrift_pool",
        "crowdfunding_pool",
        "split_holding",
        "settlement",
        "interest_expense",
        "revenue",
        "pending_transfer",
        "pending_savings",
        "bills_hold",
        "vfd_charges_expense",
        "ledger_adjustment",
      ],
      vestara_product_code: ["goalsave", "vault", "lockmax", "upfront_yield"],
      vestara_savings_status: [
        "active",
        "matured",
        "early_withdrawn",
        "cancelled",
      ],
      vestara_tx_status: ["pending", "completed", "failed", "reversed"],
      vestara_tx_type: [
        "deposit",
        "withdrawal",
        "lock",
        "unlock",
        "thrift_contribution",
        "thrift_payout",
        "split_payment",
        "split_distribution",
        "crowdfunding_contribution",
        "crowdfunding_disbursement",
        "interest_accrual",
        "interest_payout",
        "fee",
        "transfer",
        "reversal",
        "savings_create",
        "interest",
        "savings_pending_hold",
        "savings_pending_release",
        "savings_activation",
        "savings_approve",
        "savings_reject_refund",
      ],
    },
  },
} as const
