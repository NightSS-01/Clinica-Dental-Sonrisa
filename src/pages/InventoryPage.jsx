import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import { supabase } from '../lib/supabase.js'

const blankItem = { code: '', name: '', stock_current: 0, stock_minimum: 1 }

export default function InventoryPage() {
  const { profile } = useAuth()
  const alertsRef = useRef(null)
  const [items, setItems] = useState([])
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState(null)
  const [query, setQuery] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(blankItem)

  const isAdmin = profile?.role === 'administrador'

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [itemResult, alertResult] = await Promise.all([
        supabase.from('inventory_items').select('id, code, name, stock_current, stock_minimum, updated_at').order('name'),
        supabase.from('purchase_alerts').select('id, inventory_item_id, message, requested_by, resolved, created_at, item:inventory_items!purchase_alerts_inventory_item_id_fkey(name, code)').order('created_at', { ascending: false }),
      ])
      if (itemResult.error || alertResult.error) setNotice({ kind: 'error', text: `No se pudo cargar el inventario: ${(itemResult.error || alertResult.error).message}` })
      else { setItems(itemResult.data ?? []); setAlerts(alertResult.data ?? []) }
    } catch (error) {
      setNotice({ kind: 'error', text: `No se pudo conectar con Supabase: ${error instanceof Error ? error.message : 'Error inesperado'}` })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const activeAlerts = useMemo(() => alerts.filter((alert) => !alert.resolved), [alerts])
  const pendingByItem = useMemo(() => new Set(activeAlerts.map((alert) => alert.inventory_item_id)), [activeAlerts])
  const filteredItems = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('es')
    if (!needle) return items
    return items.filter((item) => `${item.name} ${item.code}`.toLocaleLowerCase('es').includes(needle))
  }, [items, query])

  function openNew() {
    setEditingId(null)
    setForm(blankItem)
    setFormOpen(true)
    setNotice(null)
  }

  function openEdit(item) {
    setEditingId(item.id)
    setForm({ code: item.code, name: item.name, stock_current: item.stock_current, stock_minimum: item.stock_minimum })
    setFormOpen(true)
    setNotice(null)
  }

  async function saveItem(event) {
    event.preventDefault()
    setSaving(true)
    setNotice(null)
    const values = {
      code: form.code.trim(),
      name: form.name.trim(),
      stock_current: Number(form.stock_current),
      stock_minimum: Number(form.stock_minimum),
      updated_by: profile.id,
    }
    if (values.stock_current < 0 || values.stock_minimum < 0) {
      setSaving(false)
      setNotice({ kind: 'error', text: 'El stock no puede ser negativo.' })
      return
    }
    const result = editingId
      ? await supabase.from('inventory_items').update(values).eq('id', editingId)
      : await supabase.from('inventory_items').insert(values)
    setSaving(false)
    if (result.error) {
      setNotice({ kind: 'error', text: result.error.code === '23505' ? 'Ya existe un artículo con ese código.' : `No se pudo guardar el artículo: ${result.error.message}` })
      return
    }
    setFormOpen(false)
    setNotice({ kind: 'success', text: editingId ? 'Artículo actualizado.' : 'Artículo agregado al inventario.' })
    await loadData()
  }

  async function requestPurchase(item) {
    setNotice(null)
    const { error } = await supabase.from('purchase_alerts').insert({
      inventory_item_id: item.id,
      message: `Stock actual: ${item.stock_current}; stock mínimo: ${item.stock_minimum}`,
    })
    if (error) setNotice({ kind: 'error', text: `No se pudo enviar la alerta: ${error.message}` })
    else {
      setNotice({ kind: 'success', text: `Alerta de compra enviada para ${item.name}.` })
      await loadData()
      window.requestAnimationFrame(() => alertsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
    }
  }

  async function resolveAlert(alert) {
    const { error } = await supabase.from('purchase_alerts').update({ resolved: true }).eq('id', alert.id)
    if (error) setNotice({ kind: 'error', text: `No se pudo cerrar la alerta: ${error.message}` })
    else { setNotice({ kind: 'success', text: 'Alerta marcada como resuelta.' }); await loadData() }
  }

  return (
    <main className="staff-shell inventory-shell">
      <header className="staff-topbar"><Link to="/" className="back-link">← Volver al panel</Link><div className="staff-account"><span className="user-avatar">{(profile?.full_name || 'U').charAt(0).toUpperCase()}</span><span>{profile?.full_name || 'Personal'}</span></div></header>
      <section className="inventory-heading"><div><p className="eyebrow">Operaciones · Abastecimiento</p><h1>Inventario</h1><p>Controla el stock y notifica a administración cuando falte material.</p></div>{isAdmin && <button className="primary-button inventory-new-button" onClick={openNew}>＋ Agregar artículo</button>}</section>
      {notice && <div className={`staff-notice ${notice.kind}`} role="status">{notice.text}</div>}
      <section className="inventory-summary"><div><span>Artículos</span><strong>{items.length}</strong></div><div className={activeAlerts.length ? 'summary-alert' : ''}><span>Alertas pendientes</span><strong>{activeAlerts.length}</strong></div><div><span>Stock bajo</span><strong>{items.filter((item) => item.stock_current <= item.stock_minimum).length}</strong></div></section>

      {formOpen && <section className="inventory-form-card"><div className="clinical-form-heading"><div><p className="eyebrow">{editingId ? 'Editar artículo' : 'Nuevo artículo'}</p><h2>{editingId ? 'Actualizar inventario' : 'Agregar al inventario'}</h2></div><button className="cancel-button" onClick={() => setFormOpen(false)}>Cerrar</button></div><form className="inventory-form" onSubmit={saveItem}>
        <label>Código<input required value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} /></label><label>Nombre del artículo<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label>Stock actual<input type="number" min="0" step="1" required value={form.stock_current} onChange={(event) => setForm({ ...form, stock_current: event.target.value })} /></label><label>Stock mínimo<input type="number" min="0" step="1" required value={form.stock_minimum} onChange={(event) => setForm({ ...form, stock_minimum: event.target.value })} /></label><div className="inventory-form-actions"><button className="cancel-button" type="button" onClick={() => setFormOpen(false)}>Cancelar</button><button className="primary-button" type="submit" disabled={saving}>{saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Agregar artículo'}</button></div>
      </form></section>}

      <section className="inventory-list-card"><div className="staff-list-heading"><div><h2>Materiales</h2><p>Las alertas abiertas aparecen junto al artículo.</p></div><input className="staff-search" type="search" placeholder="Buscar material o código…" aria-label="Buscar inventario" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
        {loading ? <p className="staff-empty">Cargando inventario…</p> : filteredItems.length === 0 ? <p className="staff-empty">No hay materiales que mostrar.</p> : <div className="staff-table-wrap"><table className="staff-table inventory-table"><thead><tr><th>Artículo</th><th>Código</th><th>Stock actual</th><th>Mínimo</th><th>Estado</th><th>Acción</th></tr></thead><tbody>{filteredItems.map((item) => {
          const low = item.stock_current <= item.stock_minimum
          const pending = pendingByItem.has(item.id)
          return <tr key={item.id}><td><strong>{item.name}</strong></td><td><span className="inventory-code">{item.code}</span></td><td><strong className={low ? 'stock-low' : 'stock-ok'}>{item.stock_current}</strong></td><td>{item.stock_minimum}</td><td><span className={`stock-state ${low ? 'low' : 'available'}`}>{low ? 'Stock bajo' : 'Disponible'}</span>{pending && <span className="stock-alert-open">Alerta abierta</span>}</td><td><div className="staff-actions">{isAdmin && <button className="table-action" onClick={() => openEdit(item)}>Editar</button>}{low && !pending && <button className="table-action purchase-action" onClick={() => requestPurchase(item)}>Solicitar compra</button>}{isAdmin && pending && <button className="table-action" onClick={() => document.getElementById('purchase-alerts')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>Ver alerta</button>}</div></td></tr>
        })}</tbody></table></div>}
      </section>

      <section className="inventory-alert-section" id="purchase-alerts" ref={alertsRef} tabIndex={-1}><div className="inventory-alert-heading"><div><p className="eyebrow">Abastecimiento</p><h2>Alertas de compra</h2></div><span>{activeAlerts.length} pendientes</span></div>{activeAlerts.length === 0 ? <p className="inventory-no-alerts">No hay alertas pendientes.</p> : <div className="inventory-alert-list">{activeAlerts.map((alert) => <article className="inventory-alert-card" key={alert.id}><span className="alert-mark">!</span><div><strong>{alert.item?.name || 'Artículo'}</strong><p>{alert.message || 'Solicitud de compra'}</p><small>{new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(alert.created_at))}</small></div>{isAdmin && <button className="table-action" onClick={() => resolveAlert(alert)}>Marcar resuelta</button>}</article>)}</div>}</section>
    </main>
  )
}
