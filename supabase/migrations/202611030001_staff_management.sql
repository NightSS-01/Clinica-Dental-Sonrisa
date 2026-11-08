-- Ejecutar una vez en Supabase > SQL Editor para habilitar el módulo de personal.
begin;

alter table public.profiles
  add column if not exists email text,
  add column if not exists active boolean not null default true,
  add column if not exists must_change_password boolean not null default false;

create unique index if not exists profiles_email_lower_unique
  on public.profiles (lower(email)) where email is not null;

update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id and p.email is distinct from u.email;

create or replace function public.create_staff_profile()
returns trigger language plpgsql security definer
set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name, rut)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'rut', '')
  ) on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer
set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.active
  );
$$;

create or replace function public.current_user_has_role(allowed_roles public.staff_role[])
returns boolean language sql stable security definer
set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.active and p.role = any (allowed_roles)
  );
$$;

create or replace function public.prevent_last_admin_deactivation()
returns trigger language plpgsql security definer
set search_path = '' as $$
declare active_admins integer;
begin
  if old.role = 'administrador' and old.active
     and (new.role <> 'administrador' or not new.active) then
    select count(*) into active_admins
    from public.profiles
    where role = 'administrador' and active and id <> old.id;
    if active_admins < 1 then
      raise exception 'No se puede desactivar o degradar al último administrador activo';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_prevent_last_admin_deactivation on public.profiles;
create trigger profiles_prevent_last_admin_deactivation
before update of role, active on public.profiles
for each row execute function public.prevent_last_admin_deactivation();

commit;
