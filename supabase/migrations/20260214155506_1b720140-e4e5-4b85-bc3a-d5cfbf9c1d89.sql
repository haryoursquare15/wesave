
ALTER TABLE user_payment_tokens_test
ADD COLUMN charge_email TEXT;

UPDATE user_payment_tokens_test
SET charge_email = 'ravesb_48d821fc96064411dfd4_llhpremium@gmail.com'
WHERE card_token = 'flw-t1nf-87228488ee05ccce4de422aafca2fe39-m03k';
