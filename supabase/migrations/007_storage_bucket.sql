-- owner-files storage bucket
-- Referenced by app/api/files/route.ts and app/api/files/[id]/route.ts (signed URLs,
-- upload/delete). Captured from the live Supabase project on 2026-08-14.

INSERT INTO "storage"."buckets" ("id", "name", "public", "file_size_limit", "allowed_mime_types")
VALUES (
    'owner-files',
    'owner-files',
    false,
    52428800, -- 50 MB
    ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'text/plain']
)
ON CONFLICT ("id") DO NOTHING;

CREATE POLICY "Owner can view own files" ON "storage"."objects" FOR SELECT USING ((("bucket_id" = 'owner-files'::text) AND ((auth.uid())::text = (storage.foldername("name"))[1])));
CREATE POLICY "Owner can upload files" ON "storage"."objects" FOR INSERT WITH CHECK ((("bucket_id" = 'owner-files'::text) AND ((auth.uid())::text = (storage.foldername("name"))[1])));
CREATE POLICY "Owner can delete own files" ON "storage"."objects" FOR DELETE USING ((("bucket_id" = 'owner-files'::text) AND ((auth.uid())::text = (storage.foldername("name"))[1])));
