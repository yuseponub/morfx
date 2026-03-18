-- ============================================================================
-- Contact Reviews Table
-- Stores pending review records when Shopify order phone is 1-2 digits
-- different from an existing contact's phone. The workspace host resolves
-- each review as "merge" (update existing contact) or "ignore" (keep new).
--
-- contact_new_id uses ON DELETE SET NULL (not CASCADE) because during merge
-- resolution the new contact is deleted. SET NULL preserves the review
-- record as audit trail with contact_new_id = NULL.
--
-- pending_templates stores template actions skipped during automation run,
-- to be replayed after the host resolves the review.
-- ============================================================================

CREATE TABLE contact_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  contact_new_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  contact_existing_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  shopify_phone TEXT NOT NULL,
  existing_phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'merged', 'ignored')),
  pending_templates JSONB NOT NULL DEFAULT '[]',
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW())
);

CREATE INDEX idx_contact_reviews_token ON contact_reviews(token);
CREATE INDEX idx_contact_reviews_workspace ON contact_reviews(workspace_id);
CREATE INDEX idx_contact_reviews_status ON contact_reviews(workspace_id, status);
