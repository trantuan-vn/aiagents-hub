-- One pending enterprise flag request per workflow (docs/enterprise-organization-spec.md §3.0).
-- Request status values: 'pending' | 'approved' | 'rejected' | 'cancelled'.

CREATE UNIQUE INDEX IF NOT EXISTS enterprise_flag_requests_one_pending
  ON enterprise_flag_requests(workflow_owner_id, workflow_id) WHERE status = 'pending';
