ALTER TABLE admin_ai_automations
  ADD COLUMN retired_at timestamptz,
  ADD COLUMN retired_by_staff_id text REFERENCES staff_accounts(id) ON DELETE RESTRICT,
  ADD CONSTRAINT admin_ai_automations_retirement_pair CHECK (
    (retired_at IS NULL AND retired_by_staff_id IS NULL)
    OR (retired_at IS NOT NULL AND retired_by_staff_id IS NOT NULL)
  ),
  ADD CONSTRAINT admin_ai_automations_retired_disabled CHECK (
    retired_at IS NULL OR enabled = false
  );

DROP INDEX admin_ai_automations_enabled_due_idx;
CREATE INDEX admin_ai_automations_enabled_due_idx
  ON admin_ai_automations(next_run_at, id)
  WHERE enabled = true AND retired_at IS NULL AND trigger_type = 'SCHEDULE';

CREATE INDEX admin_ai_automations_retired_idx
  ON admin_ai_automations(retired_at DESC, id)
  WHERE retired_at IS NOT NULL;
