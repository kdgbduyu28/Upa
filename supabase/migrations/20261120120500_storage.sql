-- Public bucket for hosts' stay photos. Each host writes only under a folder
-- named after their user id. Skipped where there's no Storage (PGlite tests).
do $$
begin
  if to_regclass('storage.buckets') is null then
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('stay-photos', 'stay-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do nothing;

  execute $p$
    create policy "hosts upload into their own folder" on storage.objects for insert to authenticated
    with check (bucket_id = 'stay-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  $p$;
  execute $p$
    create policy "hosts delete their own photos" on storage.objects for delete to authenticated
    using (bucket_id = 'stay-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  $p$;
end $$;
