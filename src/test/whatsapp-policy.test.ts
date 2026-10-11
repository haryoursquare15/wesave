import { describe, expect, it } from 'vitest';
import { canSendWhatsAppAlert } from '../../supabase/functions/_shared/whatsapp-policy';

describe('WhatsApp notification policy', () => {
  it('blocks transaction templates and generic transaction fallback', () => {
    for (const template of ['vestara_money_alert', 'vestara_thrift_failed', 'vestara_thrift_update', 'vestara_savings_failed', 'vestara_debit_success']) {
      expect(canSendWhatsAppAlert({ template, title: 'Payment update' })).toBe(false);
    }
    for (const notificationType of ['transfer_received', 'transfer_sent', 'wallet_credit', 'bill_payment', 'contribution_success', 'payout_received', 'mandate_debit_failed']) {
      expect(canSendWhatsAppAlert({ notificationType, title: 'Account update' })).toBe(false);
    }
  });
  it('retains reminders and security but excludes internal alerts', () => {
    expect(canSendWhatsAppAlert({ template: 'vestara_thrift_reminder', title: 'Contribution due' })).toBe(true);
    expect(canSendWhatsAppAlert({ template: 'vestara_new_device', title: 'New login' })).toBe(true);
    expect(canSendWhatsAppAlert({ notificationType: 'ddm_mandate_submitted', title: 'Authorize mandate' })).toBe(true);
    expect(canSendWhatsAppAlert({ template: 'vestara_account_alert', title: 'Ledger drift detected' })).toBe(false);
    expect(canSendWhatsAppAlert({ template: 'vestara_new_device', title: 'VFD credentials recovered' })).toBe(false);
  });
});