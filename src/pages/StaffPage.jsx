import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import { supabase } from '../lib/supabase.js'

const roleLabels = {
  administrador: 'Administrador',
  recepcionista: 'Recepcionista',
  odontologo: 'Odontólogo',
  asistente_dental: 'Asistente dental',
}
const roleOptions = Object.entries(roleLabels)

async function callStaffFunction(body) {
  const { data, error } = await supabase.functions.invoke('manage-staff', { body })
  if (error) {
    let message = error.message
    try {
      const detail = await error.context?.json()
      if (detail?.error) message = detail.error
    } catch { /* Usa el mensaje de error del cliente cuando no hay JSON. */ }
    throw new Error(message)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

export default function StaffPage() {
  const { profile } = useAuth()
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [form, setForm] = useState({ full_name: '', email: '', rut: '', role: 'recepcionista' })

  const loadStaff = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, rut, role, active, created_at')
      .order('full_name', { ascending: true })
    if (error) setNotice({ kind: 'error', text: `No se pudo cargar el personal: ${error.message}` })
    else setStaff(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { loadStaff() }, [loadStaff])

  const filteredStaff = staff.filter((member) => {
    const text = `${member.full_name} ${member.email} ${member.rut ?? ''} ${roleLabels[member.role] ?? member.role}`.toLocaleLowerCase('es')
    return text.includes(query.toLocaleLowerCase('es'))
  })

  function resetForm() {
    setEditingId(null)
    setForm({ full_name: '', email: '', rut: '', role: 'recepcionista' })
  }

  function startEdit(member) {
    setEditingId(member.id)
    setForm({ full_name: member.full_name ?? '', email: member.email ?? '', rut: member.rut ?? '', role: member.role })
    setNotice(null)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setNotice(null)
    try {
      if (editingId) {
        await callStaffFunction({ action: 'update', id: editingId, full_name: form.full_name, rut: form.rut, role: form.role })
        setNotice({ kind: 'success', text: 'Perfil actualizado.' })
      } else {
        await callStaffFunction({
          action: 'invite',
          email: form.email,
          full_name: form.full_name,
          rut: form.rut,
          role: form.role,
        })
        setNotice({ kind: 'success', text: 'Invitación enviada. La persona deberá abrir el correo para activar su acceso.' })
      }
      resetForm()
      await loadStaff()
    } catch (error) {
      setNotice({ kind: 'error', text: error.message || 'No se pudo guardar el perfil.' })
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(member) {
    setNotice(null)
    try {
      await callStaffFunction({ action: 'set-active', id: member.id, active: !member.active })
      setNotice({ kind: 'success', text: member.active ? 'Cuenta desactivada.' : 'Cuenta activada.' })
      await loadStaff()
    } catch (error) {
      setNotice({ kind: 'error', text: error.message || 'No se pudo cambiar el estado de la cuenta.' })
    }
  }

  async function deleteAccount(member) {
    const confirmed = window.confirm(
      `¿Eliminar permanentemente la cuenta de ${member.full_name || member.email}? Esta acción no se puede deshacer. Si tiene citas o fichas clínicas asignadas, deberás desactivarla en lugar de eliminarla.`,
    )
    if (!confirmed) return
    setDeletingId(member.id)
    setNotice(null)
    try {
      await callStaffFunction({ action: 'delete', id: member.id })
      if (editingId === member.id) resetForm()
      setNotice({ kind: 'success', text: 'Cuenta eliminada permanentemente.' })
      await loadStaff()
    } catch (error) {
      setNotice({ kind: 'error', text: error.message || 'No se pudo eliminar la cuenta.' })
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <main className="staff-shell">
      <header className="staff-topbar">
        <Link to="/" className="back-link">← Volver al panel</Link>
        <div className="staff-account"><span className="user-avatar">{(profile.full_name || 'A').charAt(0).toUpperCase()}</span><span>{profile.full_name || 'Administración'}</span></div>
      </header>
      <section className="staff-heading">
        <p className="eyebrow">Administración · Accesos</p>
        <h1>Personal de la clínica</h1>
        <p>Invita al equipo y administra sus roles y acceso al sistema.</p>
      </section>

      {notice && <div className={`staff-notice ${notice.kind}`} role="status">{notice.text}</div>}

      <div className="staff-layout">
        <section className="staff-list-card">
          <div className="staff-list-heading"><div><h2>Equipo</h2><p>{staff.length} {staff.length === 1 ? 'cuenta' : 'cuentas'}</p></div><input className="staff-search" type="search" placeholder="Buscar persona…" aria-label="Buscar personal" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
          {loading ? <p className="staff-empty">Cargando personal…</p> : filteredStaff.length === 0 ? <p className="staff-empty">No hay personas que coincidan con la búsqueda.</p> : (
            <div className="staff-table-wrap">
              <table className="staff-table">
                <thead><tr><th>Persona</th><th>Rol</th><th>Estado</th><th aria-label="Acciones" /></tr></thead>
                <tbody>{filteredStaff.map((member) => (
                  <tr key={member.id}>
                    <td><strong>{member.full_name || 'Sin nombre'}</strong><span>{member.email || member.rut || 'Sin datos de contacto'}</span></td>
                    <td><span className="role-pill">{roleLabels[member.role] || member.role}</span></td>
                    <td><span className={`active-pill ${member.active ? 'is-active' : 'is-inactive'}`}>{member.active ? 'Activo' : 'Inactivo'}</span></td>
                    <td><div className="staff-actions"><button type="button" className="table-action" onClick={() => startEdit(member)}>Editar</button>{member.id !== profile.id && <><button type="button" className="table-action" onClick={() => toggleActive(member)}>{member.active ? 'Desactivar' : 'Activar'}</button><button type="button" className="table-action delete-action" disabled={deletingId === member.id} onClick={() => deleteAccount(member)}>{deletingId === member.id ? 'Eliminando…' : 'Eliminar'}</button></>}</div></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
          <p className="staff-list-footnote">Las cuentas desactivadas conservan sus registros, pero no pueden acceder a los módulos protegidos.</p>
        </section>

        <section className="staff-form-card">
          <p className="eyebrow">{editingId ? 'Editar perfil' : 'Nuevo acceso'}</p>
          <h2>{editingId ? 'Actualizar personal' : 'Invitar al equipo'}</h2>
          <p className="staff-form-intro">{editingId ? 'Actualiza el nombre, RUT o rol.' : 'Se enviará un correo para que la persona active su cuenta.'}</p>
          <form onSubmit={handleSubmit} className="staff-form">
            <label htmlFor="staff-name">Nombre completo</label>
            <input id="staff-name" required value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} />
            {!editingId && <><label htmlFor="staff-email">Correo electrónico</label><input id="staff-email" type="email" autoComplete="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></>}
            <label htmlFor="staff-rut">RUT <span>Opcional</span></label>
            <input id="staff-rut" value={form.rut} onChange={(event) => setForm({ ...form, rut: event.target.value })} />
            <label htmlFor="staff-role">Rol</label>
            <select id="staff-role" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>{roleOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <div className="staff-form-actions"><button className="primary-button" type="submit" disabled={saving}>{saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Enviar invitación'}</button>{editingId && <button className="cancel-button" type="button" onClick={resetForm}>Cancelar</button>}</div>
          </form>
          <p className="staff-form-footnote">El rol controla los permisos junto con las políticas RLS de la base de datos.</p>
        </section>
      </div>
    </main>
  )
}
