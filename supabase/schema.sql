-- Clínica Dental Sonrisa — esquema inicial del MVP académico
-- Ejecutar completo una vez en Supabase > SQL Editor > New query.
-- Los pacientes no tienen cuentas: sus datos son gestionados por el personal.

begin;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists btree_gist with schema extensions;

create type public.staff_role as enum (
  'administrador', 'recepcionista', 'odontologo', 'asistente_dental'
);
create type public.appointment_status as enum (
  'agendada', 'confirmada', 'en_espera', 'atendida', 'cancelada'
);
create type public.budget_status as enum ('pendiente', 'aprobado', 'rechazado', 'pagado');
create type public.payment_method as enum ('efectivo', 'tarjeta', 'transferencia', 'otro');
create type public.lab_status as enum ('solicitado', 'enviado', 'en_proceso', 'recibido', 'cancelado');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.staff_role not null default 'recepcionista',
  full_name text not null default '',
  rut text unique,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.patients (
  id uuid primary key default gen_random_uuid(),
  rut text not null unique,
  full_name text not null,
  phone text,
  email text,
  birth_date date,
  notes text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint patients_rut_not_blank check (length(trim(rut)) > 0),
  constraint patients_name_not_blank check (length(trim(full_name)) > 0)
);

create table public.dental_boxes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete restrict,
  odontologist_id uuid not null references public.profiles(id) on delete restrict,
  box_id uuid not null references public.dental_boxes(id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.appointment_status not null default 'agendada',
  reason text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointments_positive_duration check (ends_at > starts_at),
  constraint no_overlapping_appointments_for_odontologist
    exclude using gist (
      odontologist_id with =,
      tstzrange(starts_at, ends_at, '[)') with &&
    ) where (status <> 'cancelada'),
  constraint no_overlapping_appointments_for_box
    exclude using gist (
      box_id with =,
      tstzrange(starts_at, ends_at, '[)') with &&
    ) where (status <> 'cancelada')
);

create table public.clinical_records (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete restrict,
  odontologist_id uuid not null references public.profiles(id) on delete restrict,
  appointment_id uuid references public.appointments(id) on delete set null,
  diagnosis text not null,
  treatment text,
  clinical_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.clinical_files (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete restrict,
  clinical_record_id uuid references public.clinical_records(id) on delete set null,
  object_path text not null unique,
  original_name text not null,
  content_type text,
  uploaded_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete restrict,
  treatment_detail text not null,
  total_amount numeric(12,2) not null check (total_amount >= 0),
  status public.budget_status not null default 'pendiente',
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.budgets(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  method public.payment_method not null,
  paid_at timestamptz not null default now(),
  reference text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.sii_mock_submissions (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete restrict,
  result jsonb not null default jsonb_build_object(
    'simulated', true, 'status', 'accepted', 'message', 'Resultado ficticio; no enviado al SII'
  ),
  submitted_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  stock_current integer not null default 0 check (stock_current >= 0),
  stock_minimum integer not null default 0 check (stock_minimum >= 0),
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.purchase_alerts (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  message text,
  requested_by uuid references public.profiles(id) on delete set null default auth.uid(),
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.lab_orders (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete restrict,
  clinical_record_id uuid references public.clinical_records(id) on delete set null,
  destination text not null,
  sent_at date,
  due_at date,
  status public.lab_status not null default 'solicitado',
  details text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lab_due_after_sent check (due_at is null or sent_at is null or due_at >= sent_at)
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id text not null,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb,
  changed_by uuid,
  changed_at timestamptz not null default now()
);

create index appointments_starts_at_idx on public.appointments (starts_at);
create index appointments_patient_idx on public.appointments (patient_id, starts_at desc);
create index clinical_records_patient_idx on public.clinical_records (patient_id, created_at desc);
create index budgets_patient_idx on public.budgets (patient_id, created_at desc);
create index payments_paid_at_idx on public.payments (paid_at);
create index lab_orders_due_at_idx on public.lab_orders (due_at) where status not in ('recibido', 'cancelado');

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.current_user_has_role(allowed_roles public.staff_role[])
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = any (allowed_roles)
  );
$$;

create or replace function public.is_staff()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()));
$$;

create or replace function public.create_staff_profile()
returns trigger language plpgsql security definer
set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, rut)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'rut', '')
  ) on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.create_staff_profile();

create or replace function public.write_audit_log()
returns trigger language plpgsql security definer
set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_logs (table_name, record_id, action, new_data, changed_by)
    values (tg_table_name, to_jsonb(new) ->> 'id', tg_op, to_jsonb(new), auth.uid());
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.audit_logs (table_name, record_id, action, old_data, new_data, changed_by)
    values (tg_table_name, to_jsonb(new) ->> 'id', tg_op, to_jsonb(old), to_jsonb(new), auth.uid());
    return new;
  else
    insert into public.audit_logs (table_name, record_id, action, old_data, changed_by)
    values (tg_table_name, to_jsonb(old) ->> 'id', tg_op, to_jsonb(old), auth.uid());
    return old;
  end if;
end;
$$;

create or replace function public.reject_audit_log_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'audit_logs is append-only';
end;
$$;

create trigger audit_logs_append_only
  before update or delete on public.audit_logs
  for each row execute function public.reject_audit_log_mutation();

create trigger audit_clinical_records after insert or update or delete on public.clinical_records
  for each row execute function public.write_audit_log();
create trigger audit_budgets after insert or update or delete on public.budgets
  for each row execute function public.write_audit_log();
create trigger audit_payments after insert or update or delete on public.payments
  for each row execute function public.write_audit_log();
create trigger audit_sii_mock after insert or update or delete on public.sii_mock_submissions
  for each row execute function public.write_audit_log();

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger patients_updated_at before update on public.patients
  for each row execute function public.set_updated_at();
create trigger appointments_updated_at before update on public.appointments
  for each row execute function public.set_updated_at();
create trigger clinical_records_updated_at before update on public.clinical_records
  for each row execute function public.set_updated_at();
create trigger budgets_updated_at before update on public.budgets
  for each row execute function public.set_updated_at();
create trigger inventory_items_updated_at before update on public.inventory_items
  for each row execute function public.set_updated_at();
create trigger lab_orders_updated_at before update on public.lab_orders
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.patients enable row level security;
alter table public.dental_boxes enable row level security;
alter table public.appointments enable row level security;
alter table public.clinical_records enable row level security;
alter table public.clinical_files enable row level security;
alter table public.budgets enable row level security;
alter table public.payments enable row level security;
alter table public.sii_mock_submissions enable row level security;
alter table public.inventory_items enable row level security;
alter table public.purchase_alerts enable row level security;
alter table public.lab_orders enable row level security;
alter table public.audit_logs enable row level security;

create policy "profiles_read_self_or_admin" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.current_user_has_role(array['administrador']::public.staff_role[]));
create policy "profiles_admin_insert" on public.profiles for insert to authenticated
  with check (public.current_user_has_role(array['administrador']::public.staff_role[]));
create policy "profiles_admin_update" on public.profiles for update to authenticated
  using (public.current_user_has_role(array['administrador']::public.staff_role[]))
  with check (public.current_user_has_role(array['administrador']::public.staff_role[]));
create policy "profiles_admin_delete" on public.profiles for delete to authenticated
  using (public.current_user_has_role(array['administrador']::public.staff_role[]));

create policy "staff_manage_patients" on public.patients for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "staff_read_boxes" on public.dental_boxes for select to authenticated
  using (public.is_staff());
create policy "admin_manage_boxes" on public.dental_boxes for all to authenticated
  using (public.current_user_has_role(array['administrador']::public.staff_role[]))
  with check (public.current_user_has_role(array['administrador']::public.staff_role[]));
create policy "staff_manage_appointments" on public.appointments for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy "clinical_read_odontologist_admin" on public.clinical_records for select to authenticated
  using (public.current_user_has_role(array['odontologo','administrador']::public.staff_role[]));
create policy "clinical_insert_odontologist_admin" on public.clinical_records for insert to authenticated
  with check (public.current_user_has_role(array['odontologo','administrador']::public.staff_role[]));
create policy "clinical_update_odontologist_admin" on public.clinical_records for update to authenticated
  using (public.current_user_has_role(array['odontologo','administrador']::public.staff_role[]))
  with check (public.current_user_has_role(array['odontologo','administrador']::public.staff_role[]));
create policy "clinical_delete_admin" on public.clinical_records for delete to authenticated
  using (public.current_user_has_role(array['administrador']::public.staff_role[]));

create policy "clinical_files_read_odontologist_admin" on public.clinical_files for select to authenticated
  using (public.current_user_has_role(array['odontologo','administrador']::public.staff_role[]));
create policy "clinical_files_insert_odontologist_admin" on public.clinical_files for insert to authenticated
  with check (public.current_user_has_role(array['odontologo','administrador']::public.staff_role[]));
create policy "clinical_files_delete_admin" on public.clinical_files for delete to authenticated
  using (public.current_user_has_role(array['administrador']::public.staff_role[]));

create policy "staff_read_budgets" on public.budgets for select to authenticated using (public.is_staff());
create policy "staff_create_budgets" on public.budgets for insert to authenticated with check (public.is_staff());
create policy "admin_reception_manage_budgets" on public.budgets for update to authenticated
  using (public.current_user_has_role(array['administrador','recepcionista']::public.staff_role[]))
  with check (public.current_user_has_role(array['administrador','recepcionista']::public.staff_role[]));
create policy "admin_delete_budgets" on public.budgets for delete to authenticated
  using (public.current_user_has_role(array['administrador']::public.staff_role[]));
create policy "staff_read_payments" on public.payments for select to authenticated using (public.is_staff());
create policy "admin_reception_create_payments" on public.payments for insert to authenticated
  with check (public.current_user_has_role(array['administrador','recepcionista']::public.staff_role[]));
create policy "admin_manage_payments" on public.payments for update to authenticated
  using (public.current_user_has_role(array['administrador']::public.staff_role[]))
  with check (public.current_user_has_role(array['administrador']::public.staff_role[]));
create policy "admin_delete_payments" on public.payments for delete to authenticated
  using (public.current_user_has_role(array['administrador']::public.staff_role[]));
create policy "staff_read_sii_mock" on public.sii_mock_submissions for select to authenticated
  using (public.is_staff());
create policy "admin_reception_create_sii_mock" on public.sii_mock_submissions for insert to authenticated
  with check (public.current_user_has_role(array['administrador','recepcionista']::public.staff_role[]));

create policy "staff_read_inventory" on public.inventory_items for select to authenticated using (public.is_staff());
create policy "admin_manage_inventory" on public.inventory_items for all to authenticated
  using (public.current_user_has_role(array['administrador']::public.staff_role[]))
  with check (public.current_user_has_role(array['administrador']::public.staff_role[]));
create policy "staff_read_purchase_alerts" on public.purchase_alerts for select to authenticated using (public.is_staff());
create policy "staff_create_purchase_alerts" on public.purchase_alerts for insert to authenticated
  with check (public.is_staff());
create policy "admin_resolve_purchase_alerts" on public.purchase_alerts for update to authenticated
  using (public.current_user_has_role(array['administrador']::public.staff_role[]))
  with check (public.current_user_has_role(array['administrador']::public.staff_role[]));

create policy "staff_manage_lab_orders" on public.lab_orders for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "admin_read_audit_logs" on public.audit_logs for select to authenticated
  using (public.current_user_has_role(array['administrador']::public.staff_role[]));

-- Solo odontólogos y administradores pueden acceder a objetos del bucket clínico.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('clinical-files', 'clinical-files', false, 10485760,
        array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;

create policy "clinical_storage_read" on storage.objects for select to authenticated
  using (bucket_id = 'clinical-files' and public.current_user_has_role(array['odontologo','administrador']::public.staff_role[]));
create policy "clinical_storage_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'clinical-files' and public.current_user_has_role(array['odontologo','administrador']::public.staff_role[]));
create policy "clinical_storage_delete_admin" on storage.objects for delete to authenticated
  using (bucket_id = 'clinical-files' and public.current_user_has_role(array['administrador']::public.staff_role[]));

commit;
