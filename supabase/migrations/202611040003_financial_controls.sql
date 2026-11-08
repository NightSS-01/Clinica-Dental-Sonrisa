-- Evita sobrepagos y mantiene actualizado el estado de pago del presupuesto.
begin;

create or replace function public.validate_budget_total()
returns trigger language plpgsql set search_path = '' as $$
declare already_paid numeric(12,2);
begin
  select coalesce(sum(p.amount), 0) into already_paid
  from public.payments p where p.budget_id = new.id;
  if new.total_amount < already_paid then
    raise exception using errcode = '23514', message = 'El nuevo total no puede ser inferior a los pagos ya registrados';
  end if;
  return new;
end;
$$;

drop trigger if exists budgets_validate_total on public.budgets;
create trigger budgets_validate_total before update of total_amount on public.budgets
  for each row execute function public.validate_budget_total();

create or replace function public.validate_payment_balance()
returns trigger language plpgsql set search_path = '' as $$
declare
  budget_total numeric(12,2);
  budget_state public.budget_status;
  paid_before numeric(12,2);
begin
  if tg_op = 'UPDATE' and new.budget_id <> old.budget_id then
    raise exception using errcode = '23514', message = 'No se puede reasignar un pago a otro presupuesto';
  end if;

  select b.total_amount, b.status into budget_total, budget_state
  from public.budgets b where b.id = new.budget_id for update;
  if not found then
    raise exception using errcode = '23503', message = 'El presupuesto no existe';
  end if;
  if budget_state not in ('aprobado', 'pagado') then
    raise exception using errcode = '23514', message = 'El presupuesto debe estar aprobado antes de registrar pagos';
  end if;

  if tg_op = 'UPDATE' then
    select coalesce(sum(p.amount), 0) into paid_before
    from public.payments p where p.budget_id = new.budget_id and p.id <> old.id;
  else
    select coalesce(sum(p.amount), 0) into paid_before
    from public.payments p where p.budget_id = new.budget_id;
  end if;
  if paid_before + new.amount > budget_total then
    raise exception using errcode = '23514', message = 'El pago supera el saldo pendiente del presupuesto';
  end if;
  return new;
end;
$$;

create or replace function public.refresh_budget_payment_status()
returns trigger language plpgsql set search_path = '' as $$
declare
  target_budget uuid;
  budget_total numeric(12,2);
  paid_total numeric(12,2);
  current_state public.budget_status;
begin
  if tg_op = 'DELETE' then target_budget := old.budget_id;
  else target_budget := new.budget_id;
  end if;
  select b.total_amount, b.status into budget_total, current_state
  from public.budgets b where b.id = target_budget for update;
  if not found then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  select coalesce(sum(p.amount), 0) into paid_total
  from public.payments p where p.budget_id = target_budget;
  if paid_total >= budget_total and budget_total > 0 and current_state <> 'pagado' then
    update public.budgets set status = 'pagado' where id = target_budget;
  elsif paid_total < budget_total and current_state = 'pagado' then
    update public.budgets set status = 'aprobado' where id = target_budget;
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists payments_validate_balance on public.payments;
create trigger payments_validate_balance before insert or update on public.payments
  for each row execute function public.validate_payment_balance();
drop trigger if exists payments_refresh_budget_status on public.payments;
create trigger payments_refresh_budget_status after insert or update or delete on public.payments
  for each row execute function public.refresh_budget_payment_status();

commit;
