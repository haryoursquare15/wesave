// WhatsApp is for reminders/security only, never transaction receipts or ops alerts.
const NON_TRANSACTION_TEMPLATES = new Set([
  'vestara_thrift_reminder', 'vestara_mandate_reminder', 'vestara_new_device',
]);
const NON_TRANSACTION_TYPES = new Set([
  'thrift_reminder', 'contribution_reminder', 'mandate_reminder',
  'ddm_mandate_submitted', 'ddm_mandate_authorized', 'new_device', 'new_device_login',
]);

export function canSendWhatsAppAlert(opts: { template?: string; notificationType?: string; title: string }): boolean {
  if (/credential|entitlement|ledger drift/i.test(opts.title)) return false;
  if (opts.template && opts.template !== 'vestara_account_alert') {
    return NON_TRANSACTION_TEMPLATES.has(opts.template);
  }
  return NON_TRANSACTION_TYPES.has(opts.notificationType || '');
}