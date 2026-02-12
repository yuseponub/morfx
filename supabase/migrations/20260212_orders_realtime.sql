-- Enable Supabase Realtime for orders table
-- Allows INSERT/UPDATE events to be pushed to clients in real-time
-- (conversation list emoji indicators + contact panel order list)
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
