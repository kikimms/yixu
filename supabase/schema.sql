create extension if not exists "pgcrypto";

create table if not exists public.garments (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid(),
  name text not null check (char_length(name) between 1 and 60),
  category text not null check (category in ('上衣','下装','连衣裙','外套','鞋履','包袋','配饰')),
  image_path text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.outfits (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid(),
  name text not null check (char_length(name) between 1 and 60),
  pieces jsonb not null check (jsonb_typeof(pieces) = 'array'),
  created_at timestamptz not null default now()
);

alter table public.garments enable row level security;
alter table public.outfits enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.garments to authenticated;
grant select, insert, update, delete on public.outfits to authenticated;

drop policy if exists "garments_select_own" on public.garments;
drop policy if exists "garments_insert_own" on public.garments;
drop policy if exists "garments_update_own" on public.garments;
drop policy if exists "garments_delete_own" on public.garments;
drop policy if exists "outfits_select_own" on public.outfits;
drop policy if exists "outfits_insert_own" on public.outfits;
drop policy if exists "outfits_update_own" on public.outfits;
drop policy if exists "outfits_delete_own" on public.outfits;

create policy "garments_select_own" on public.garments
  for select using (owner = auth.uid());

create policy "garments_insert_own" on public.garments
  for insert with check (owner = auth.uid());

create policy "garments_update_own" on public.garments
  for update using (owner = auth.uid()) with check (owner = auth.uid());

create policy "garments_delete_own" on public.garments
  for delete using (owner = auth.uid());

create policy "outfits_select_own" on public.outfits
  for select using (owner = auth.uid());

create policy "outfits_insert_own" on public.outfits
  for insert with check (owner = auth.uid());

create policy "outfits_update_own" on public.outfits
  for update using (owner = auth.uid()) with check (owner = auth.uid());

create policy "outfits_delete_own" on public.outfits
  for delete using (owner = auth.uid());

insert into storage.buckets (id, name, public)
values ('wardrobe', 'wardrobe', false)
on conflict (id) do nothing;

drop policy if exists "wardrobe_images_select_own" on storage.objects;
drop policy if exists "wardrobe_images_insert_own" on storage.objects;
drop policy if exists "wardrobe_images_update_own" on storage.objects;
drop policy if exists "wardrobe_images_delete_own" on storage.objects;

create policy "wardrobe_images_select_own" on storage.objects
  for select using (
    bucket_id = 'wardrobe'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "wardrobe_images_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'wardrobe'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "wardrobe_images_update_own" on storage.objects
  for update using (
    bucket_id = 'wardrobe'
    and auth.uid()::text = (storage.foldername(name))[1]
  ) with check (
    bucket_id = 'wardrobe'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "wardrobe_images_delete_own" on storage.objects
  for delete using (
    bucket_id = 'wardrobe'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
