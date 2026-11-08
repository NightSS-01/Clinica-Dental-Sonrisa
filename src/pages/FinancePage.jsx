import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import { supabase } from '../lib/supabase.js'

const blankBudget = { patient_id: '', treatment_detail: '', total_amount: '', status: 'pendiente' }
const paymentMethods = [['efectivo', 'Efectivo'], ['tarjeta', 'Tarjeta'], ['transferencia', 'Transferencia'], ['otro', 'Otro']]
const budgetStatuses = [['pendiente', 'Pendiente'], ['aprobado', 'Aprobado'], ['rechazado', 'Rechazado']]

function money(value) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(value) || 0)
}

function formatDate(value) {
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium' }).format(new Date(value))
}

function dateInputValue(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function localDayRange(dateString) {
  const [year, month, day] = dateString.split('-').map(Number)
  const start = new Date(year, month - 1, day)
  const end = new Date(year, month - 1, day + 1)
  return { start: start.toISOString(), end: end.toISOString() }
}

export default function FinancePage() {
  const { profile } = useAuth()
  const [tab, setTab] = useState('budgets')
  const [patients, setPatients] = useState([])
  const [budgets, setBudgets] = useState([])
  const [payments, setPayments] = useState([])
  const [siiSubmissions, setSiiSubmissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState(null)
  const [search, setSearch] = useState('')
  const [budgetFormOpen, setBudgetFormOpen] = useState(false)
  const [budgetEditId, setBudgetEditId] = useState(null)
  const [budgetDraft, setBudgetDraft] = useState(blankBudget)
  const [paymentBudget, setPaymentBudget] = useState(null)
  const [paymentDraft, setPaymentDraft] = useState({ amount: '', method: 'efectivo', reference: '' })
  const [reportDate, setReportDate] = useState(dateInputValue())
  const [reportRows, setReportRows] = useState([])
  const [reportLoading, setReportLoading] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    const [patientResult, budgetResult, paymentResult, siiResult] = await Promise.all([
      supabase.from('patients').select('id, full_name, rut').order('full_name').limit(500),
      supabase.from('budgets').select('id, patient_id, treatment_detail, total_amount, status, created_at, updated_at, patient:patients!budgets_patient_id_fkey(full_name, rut)').order('created_at', { ascending: false }),
      supabase.from('payments').select('id, budget_id, amount, method, paid_at, reference, created_at').order('paid_at', { ascending: false }),
      supabase.from('sii_mock_submissions').select('id, payment_id, result, created_at').order('created_at', { ascending: false }),
    ])
    const firstError = [patientResult, budgetResult, paymentResult, siiResult].find((result) => result.error)
    if (firstError) setNotice({ kind: 'error', text: `No se pudieron cargar Finanzas: ${firstError.error.message}` })
    else {
      setPatients(patientResult.data ?? [])
      setBudgets(budgetResult.data ?? [])
      setPayments(paymentResult.data ?? [])
      setSiiSubmissions(siiResult.data ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const paymentsByBudget = useMemo(() => payments.reduce((map, payment) => {
    map[payment.budget_id] = (map[payment.budget_id] ?? 0) + Number(payment.amount)
    return map
  }, {}), [payments])
  const siiByPayment = useMemo(() => Object.fromEntries(siiSubmissions.map((entry) => [entry.payment_id, entry])), [siiSubmissions])
  const filteredBudgets = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('es')
    if (!needle) return budgets
    return budgets.filter((budget) => `${budget.patient?.full_name ?? ''} ${budget.patient?.rut ?? ''} ${budget.treatment_detail}`.toLocaleLowerCase('es').includes(needle))
  }, [budgets, search])

  async function loadReport(date) {
    setReportLoading(true)
    const { start, end } = localDayRange(date)
    const { data, error } = await supabase.from('payments')
      .select('id, budget_id, amount, method, paid_at, reference')
      .gte('paid_at', start).lt('paid_at', end).order('paid_at', { ascending: true })
    if (error) setNotice({ kind: 'error', text: `No se pudo cargar el reporte: ${error.message}` })
    else setReportRows(data ?? [])
    setReportLoading(false)
  }

  useEffect(() => { if (tab === 'report') loadReport(reportDate) }, [tab, reportDate])

  function openNewBudget() {
    setBudgetEditId(null)
    setBudgetDraft({ ...blankBudget, patient_id: patients[0]?.id ?? '' })
    setBudgetFormOpen(true)
    setNotice(null)
  }

  function openEditBudget(budget) {
    setBudgetEditId(budget.id)
    setBudgetDraft({ patient_id: budget.patient_id, treatment_detail: budget.treatment_detail, total_amount: String(budget.total_amount), status: budget.status === 'pagado' ? 'aprobado' : budget.status })
    setBudgetFormOpen(true)
    setNotice(null)
  }

  async function saveBudget(event) {
    event.preventDefault()
    setSaving(true)
    setNotice(null)
    const amount = Number(budgetDraft.total_amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setSaving(false)
      setNotice({ kind: 'error', text: 'Ingresa un monto mayor a cero.' })
      return
    }
    if (budgetEditId && budgetDraft.status === 'rechazado' && (paymentsByBudget[budgetEditId] ?? 0) > 0) {
      setSaving(false)
      setNotice({ kind: 'error', text: 'No puedes rechazar un presupuesto que ya tiene pagos registrados.' })
      return
    }
    const budget = { patient_id: budgetDraft.patient_id, treatment_detail: budgetDraft.treatment_detail.trim(), total_amount: amount, status: budgetDraft.status }
    const result = budgetEditId
      ? await supabase.from('budgets').update(budget).eq('id', budgetEditId)
      : await supabase.from('budgets').insert(budget)
    setSaving(false)
    if (result.error) {
      setNotice({ kind: 'error', text: result.error.message.includes('below') || result.error.message.includes('inferior') ? 'El monto no puede quedar bajo el total ya pagado.' : `No se pudo guardar el presupuesto: ${result.error.message}` })
      return
    }
    setBudgetFormOpen(false)
    setNotice({ kind: 'success', text: budgetEditId ? 'Presupuesto actualizado.' : 'Presupuesto creado.' })
    await loadData()
  }

  function openPayment(budget) {
    const balance = Number(budget.total_amount) - (paymentsByBudget[budget.id] ?? 0)
    setPaymentBudget({ ...budget, balance })
    setPaymentDraft({ amount: String(balance), method: 'efectivo', reference: '' })
    setNotice(null)
  }

  async function simulateSii(paymentId) {
    await Promise.resolve()
    const result = {
      simulated: true,
      status: 'accepted',
      folio: `SIM-${Date.now().toString().slice(-8)}`,
      message: 'Resultado ficticio. No se realizó ningún envío al SII.',
    }
    return supabase.from('sii_mock_submissions').insert({ payment_id: paymentId, result })
  }

  async function savePayment(event) {
    event.preventDefault()
    const amount = Number(paymentDraft.amount)
    if (!Number.isFinite(amount) || amount <= 0 || amount > paymentBudget.balance) {
      setNotice({ kind: 'error', text: 'El monto debe ser mayor a cero y no superar el saldo pendiente.' })
      return
    }
    setSaving(true)
    setNotice(null)
    const { data, error } = await supabase.from('payments').insert({
      budget_id: paymentBudget.id,
      amount,
      method: paymentDraft.method,
      reference: paymentDraft.reference.trim() || null,
    }).select('id').single()
    if (error) {
      setSaving(false)
      setNotice({ kind: 'error', text: error.message.includes('saldo pendiente') ? 'El pago supera el saldo actual. Actualiza la página y vuelve a intentarlo.' : `No se pudo registrar el pago: ${error.message}` })
      return
    }
    const { error: siiError } = await simulateSii(data.id)
    setSaving(false)
    setPaymentBudget(null)
    setNotice(siiError
      ? { kind: 'error', text: 'Pago guardado, pero no se pudo guardar el resultado simulado del SII.' }
      : { kind: 'success', text: 'Pago guardado y resultado ficticio del SII registrado.' })
    await loadData()
    if (tab === 'report') await loadReport(reportDate)
  }

  const reportTotal = reportRows.reduce((sum, row) => sum + Number(row.amount), 0)
  const reportByMethod = reportRows.reduce((map, row) => {
    map[row.method] = (map[row.method] ?? 0) + Number(row.amount)
    return map
  }, {})
  const budgetById = Object.fromEntries(budgets.map((budget) => [budget.id, budget]))
  const methodName = Object.fromEntries(paymentMethods)

  return (
    <main className="staff-shell finance-shell">
      <header className="staff-topbar"><Link to="/" className="back-link">← Volver al panel</Link><div className="staff-account"><span className="user-avatar">{(profile.full_name || 'A').charAt(0).toUpperCase()}</span><span>{profile.full_name || 'Administración'}</span></div></header>
      <section className="finance-heading"><div><p className="eyebrow">Administración · Finanzas</p><h1>Presupuestos y pagos</h1><p>Controla saldos, registra ingresos y consulta el resultado simulado del SII.</p></div><span className="finance-scope">Acceso administrativo</span></section>
      {notice && <div className={`staff-notice ${notice.kind}`} role="status">{notice.text}</div>}
      <nav className="finance-tabs" aria-label="Secciones financieras">
        <button className={tab === 'budgets' ? 'is-current' : ''} onClick={() => { setTab('budgets'); setNotice(null) }}>Presupuestos <span>{budgets.length}</span></button>
        <button className={tab === 'report' ? 'is-current' : ''} onClick={() => { setTab('report'); setNotice(null) }}>Ingresos del día</button>
      </nav>

      {tab === 'budgets' && <>
        <section className="finance-toolbar"><div><h2>Presupuestos</h2><p>Registra tratamientos, aprueba presupuestos y abona pagos.</p></div><div className="finance-toolbar-actions"><input className="staff-search" type="search" placeholder="Buscar por paciente o tratamiento…" aria-label="Buscar presupuestos" value={search} onChange={(event) => setSearch(event.target.value)} /><button className="primary-button finance-new-button" onClick={openNewBudget} disabled={!patients.length}>＋ Nuevo presupuesto</button></div></section>
        {budgetFormOpen && <section className="finance-form-card"><div className="finance-form-heading"><div><p className="eyebrow">{budgetEditId ? 'Actualizar tratamiento' : 'Nuevo tratamiento'}</p><h2>{budgetEditId ? 'Editar presupuesto' : 'Crear presupuesto'}</h2></div><button className="cancel-button" onClick={() => setBudgetFormOpen(false)}>Cerrar</button></div>
          <form className="finance-form" onSubmit={saveBudget}>
            <label>Paciente<select required value={budgetDraft.patient_id} onChange={(event) => setBudgetDraft({ ...budgetDraft, patient_id: event.target.value })}><option value="">Selecciona paciente</option>{patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.full_name} · {patient.rut}</option>)}</select></label>
            <label>Monto total (CLP)<input type="number" min="1" step="1" required value={budgetDraft.total_amount} onChange={(event) => setBudgetDraft({ ...budgetDraft, total_amount: event.target.value })} /></label>
            <label>Estado<select value={budgetDraft.status} onChange={(event) => setBudgetDraft({ ...budgetDraft, status: event.target.value })}>{budgetStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="finance-full-field">Detalle del tratamiento<textarea rows="3" required value={budgetDraft.treatment_detail} onChange={(event) => setBudgetDraft({ ...budgetDraft, treatment_detail: event.target.value })} /></label>
            <div className="finance-form-actions"><button className="cancel-button" type="button" onClick={() => setBudgetFormOpen(false)}>Cancelar</button><button className="primary-button" type="submit" disabled={saving}>{saving ? 'Guardando…' : budgetEditId ? 'Guardar cambios' : 'Crear presupuesto'}</button></div>
          </form>
        </section>}
        <section className="finance-budget-list">{loading ? <p className="staff-empty">Cargando presupuestos…</p> : filteredBudgets.length === 0 ? <div className="clinical-empty"><span>$</span><strong>No hay presupuestos para mostrar.</strong><p>Crea un presupuesto para comenzar a registrar ingresos.</p></div> : filteredBudgets.map((budget) => {
          const paid = paymentsByBudget[budget.id] ?? 0
          const balance = Math.max(0, Number(budget.total_amount) - paid)
          return <article className="budget-card" key={budget.id}>
            <div className="budget-card-main"><div className="budget-card-title"><div><span className="budget-patient">{budget.patient?.full_name || 'Paciente'} <small>{budget.patient?.rut}</small></span><span className={`budget-status state-${budget.status}`}>{budget.status === 'pagado' ? 'Pagado' : budget.status[0].toUpperCase() + budget.status.slice(1)}</span></div><p>{budget.treatment_detail}</p></div><div className="budget-total"><span>Total</span><strong>{money(budget.total_amount)}</strong></div></div>
            <div className="budget-payment-bar"><span>Pagado <strong>{money(paid)}</strong></span><span>Saldo <strong className={balance > 0 ? 'balance-due' : 'balance-zero'}>{money(balance)}</strong></span></div>
            <div className="budget-progress"><span style={{ width: `${Math.min(100, Number(budget.total_amount) ? paid / Number(budget.total_amount) * 100 : 0)}%` }} /></div>
            <div className="budget-card-actions">{budget.status !== 'pagado' && <button className="table-action" onClick={() => openEditBudget(budget)}>{budget.status === 'pendiente' ? 'Revisar / aprobar' : 'Editar'}</button>}{budget.status === 'aprobado' && balance > 0 && <button className="primary-button budget-pay-button" onClick={() => openPayment(budget)}>＋ Registrar pago</button>}</div>
          </article>
        })}</section>
      </>}

      {tab === 'report' && <>
        <section className="report-toolbar"><div><h2>Reporte diario de ingresos</h2><p>Pagos recibidos, agrupados por método.</p></div><label>Fecha<input type="date" value={reportDate} onChange={(event) => setReportDate(event.target.value)} /></label></section>
        <section className="report-total-card"><div><span>Total recibido</span><strong>{money(reportTotal)}</strong></div><span className="report-date-label">{formatDate(`${reportDate}T12:00:00`)}</span></section>
        <section className="report-method-grid">{paymentMethods.map(([method, label]) => <article className="report-method-card" key={method}><span>{label}</span><strong>{money(reportByMethod[method] ?? 0)}</strong></article>)}</section>
        <section className="finance-report-list"><div className="finance-report-heading"><h3>Movimientos</h3><span>{reportRows.length} pagos</span></div>{reportLoading ? <p className="staff-empty">Cargando reporte…</p> : reportRows.length === 0 ? <p className="staff-empty">No hay ingresos para esta fecha.</p> : <div className="staff-table-wrap"><table className="staff-table"><thead><tr><th>Hora</th><th>Paciente</th><th>Detalle</th><th>Método</th><th>Monto</th><th>SII</th></tr></thead><tbody>{reportRows.map((payment) => {
          const budget = budgetById[payment.budget_id]
          const sii = siiByPayment[payment.id]?.result
          return <tr key={payment.id}><td>{new Intl.DateTimeFormat('es-CL', { hour: '2-digit', minute: '2-digit' }).format(new Date(payment.paid_at))}</td><td>{budget?.patient?.full_name || 'Paciente'}</td><td>{budget?.treatment_detail || 'Presupuesto'}</td><td>{methodName[payment.method] || payment.method}</td><td><strong>{money(payment.amount)}</strong></td><td><span className="sii-result">{sii?.simulated ? `Simulado · ${sii.folio ?? 'OK'}` : 'Sin resultado'}</span></td></tr>
        })}</tbody></table></div>}</section>
      </>}
      <p className="finance-mock-note">El resultado SII es ficticio para el MVP académico. No se envían documentos al Servicio de Impuestos Internos.</p>

      {paymentBudget && <div className="agenda-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPaymentBudget(null) }}><section className="agenda-modal finance-payment-modal" role="dialog" aria-modal="true" aria-labelledby="payment-title"><div className="agenda-modal-heading"><div><p className="eyebrow">Abono al tratamiento</p><h2 id="payment-title">Registrar pago</h2></div><button type="button" className="modal-close" aria-label="Cerrar" onClick={() => setPaymentBudget(null)}>×</button></div><p className="payment-budget-summary">{paymentBudget.patient?.full_name} · Saldo pendiente <strong>{money(paymentBudget.balance)}</strong></p>{notice?.kind === 'error' && <p className="form-error" role="alert">{notice.text}</p>}<form className="finance-form" onSubmit={savePayment}><label>Monto (CLP)<input type="number" min="1" max={paymentBudget.balance} step="1" required value={paymentDraft.amount} onChange={(event) => setPaymentDraft({ ...paymentDraft, amount: event.target.value })} /></label><label>Método de pago<select value={paymentDraft.method} onChange={(event) => setPaymentDraft({ ...paymentDraft, method: event.target.value })}>{paymentMethods.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="finance-full-field">Referencia <span>Opcional</span><input value={paymentDraft.reference} onChange={(event) => setPaymentDraft({ ...paymentDraft, reference: event.target.value })} placeholder="N° de operación, últimos dígitos…" /></label><div className="sii-simulation-box"><span>◉</span><div><strong>Envío SII simulado</strong><p>Se guardará un folio ficticio para esta prueba.</p></div></div><div className="finance-form-actions"><button className="cancel-button" type="button" onClick={() => setPaymentBudget(null)}>Cancelar</button><button className="primary-button" type="submit" disabled={saving}>{saving ? 'Registrando…' : 'Confirmar pago'}</button></div></form></section></div>}
    </main>
  )
}
