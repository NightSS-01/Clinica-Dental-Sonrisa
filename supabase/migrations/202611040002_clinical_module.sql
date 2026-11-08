-- Amplía la auditoría y restringe las órdenes clínicas a odontología/administración.
begin;

drop policy if exists "staff_manage_lab_orders" on public.lab_orders;
create policy "clinical_staff_manage_lab_orders" on public.lab_orders for all to authenticated
  using (public.current_user_has_role(array['odontologo','administrador']::public.staff_role[]))
  with check (public.current_user_has_role(array['odontologo','administrador']::public.staff_role[]));

drop trigger if exists audit_clinical_files on public.clinical_files;
create trigger audit_clinical_files after insert or update or delete on public.clinical_files
  for each row execute function public.write_audit_log();
drop trigger if exists audit_lab_orders on public.lab_orders;
create trigger audit_lab_orders after insert or update or delete on public.lab_orders
  for each row execute function public.write_audit_log();

commit;
