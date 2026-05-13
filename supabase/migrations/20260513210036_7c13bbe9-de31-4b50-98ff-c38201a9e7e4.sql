
insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do nothing;

create policy "branding public read"
on storage.objects for select
using (bucket_id = 'branding');

create policy "branding admin insert"
on storage.objects for insert
with check (
  bucket_id = 'branding'
  and is_admin()
  and (storage.foldername(name))[1] = current_company_id()::text
);

create policy "branding admin update"
on storage.objects for update
using (
  bucket_id = 'branding'
  and is_admin()
  and (storage.foldername(name))[1] = current_company_id()::text
);

create policy "branding admin delete"
on storage.objects for delete
using (
  bucket_id = 'branding'
  and is_admin()
  and (storage.foldername(name))[1] = current_company_id()::text
);
