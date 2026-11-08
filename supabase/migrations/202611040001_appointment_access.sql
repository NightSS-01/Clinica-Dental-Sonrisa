-- Permite elegir odontólogos activos sin exponer sus datos personales al resto del personal.
begin;

create or replace function public.list_active_odontologists()
returns table (id uuid, full_name text)
language sql stable security definer
set search_path = ''
as $$
  select p.id, p.full_name
  from public.profiles p
  where p.role = 'odontologo' and p.active
    and (select public.is_staff())
  order by p.full_name;
$$;

revoke all on function public.list_active_odontologists() from public;
grant execute on function public.list_active_odontologists() to authenticated;

create or replace function public.validate_appointment_resources()
returns trigger language plpgsql security definer
set search_path = '' as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = new.odontologist_id and p.role = 'odontologo' and p.active
  ) then
    raise exception using errcode = '23514', message = 'El odontólogo no existe o no está activo';
  end if;
  if not exists (
    select 1 from public.dental_boxes b where b.id = new.box_id and b.active
  ) then
    raise exception using errcode = '23514', message = 'El box no existe o no está activo';
  end if;
  return new;
end;
$$;

drop trigger if exists appointments_validate_resources on public.appointments;
create trigger appointments_validate_resources
before insert or update of patient_id, odontologist_id, box_id, starts_at, ends_at
on public.appointments
for each row execute function public.validate_appointment_resources();

insert into public.dental_boxes (name)
values ('Box 1'), ('Box 2')
on conflict (name) do nothing;

commit;
