
-- Fix credit_wallet_via_ledger: change _reference_id from UUID to TEXT
CREATE OR REPLACE FUNCTION public.credit_wallet_via_ledger(
    _user_id UUID,
    _amount NUMERIC,
    _reference_type TEXT,
    _reference_id TEXT,
    _description TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_wallet wallets%ROWTYPE;
    v_new_balance NUMERIC;
    v_ledger_id UUID;
BEGIN
    SELECT * INTO v_wallet FROM wallets WHERE user_id = _user_id FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Wallet not found');
    END IF;
    
    v_new_balance := COALESCE(v_wallet.available_balance, 0) + _amount;
    
    INSERT INTO ledger_entries (
        wallet_id, user_id, entry_type, amount,
        balance_before, balance_after,
        locked_before, locked_after,
        reference_type, reference_id, description
    ) VALUES (
        v_wallet.id, _user_id, 'credit', _amount,
        COALESCE(v_wallet.available_balance, 0), v_new_balance,
        COALESCE(v_wallet.locked_balance, 0), COALESCE(v_wallet.locked_balance, 0),
        _reference_type, _reference_id, _description
    ) RETURNING id INTO v_ledger_id;
    
    UPDATE wallets 
    SET available_balance = v_new_balance, updated_at = now()
    WHERE id = v_wallet.id;
    
    RETURN json_build_object(
        'success', true, 
        'new_balance', v_new_balance,
        'ledger_id', v_ledger_id
    );
END;
$$;
