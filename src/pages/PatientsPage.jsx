import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import { supabase } from '../lib/supabase.js'

const emptyPatient = { full_name: '', rut: '', phone: '', email: '', birth_date: '', notes: '' }

function formatDate(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))
}

export default function PatientsPage() {
  const { profile } = useAuth()
  const [patients, setPatients] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState(emptyPatient)

  const loadPatients = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('patients')
      .select('id, full_name, rut, phone, email, birth_date, notes, created_at')
      .order('full_name', { ascending: true })
    if (error) setNotice({ kind: 'error', text: `No se pudieron cargar los pacientes: ${error.message}` })
    else setPatients(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { loadPatients() }, [loadPatients])

  const filteredPatients = useMemo(() => {
    const search = query.trim().toLocaleLowerCase('es')
    if (!search) return patients
    return patients.filter((patient) =>
      [patient.full_name, patient.rut, patient.phone, patient.email]
        .filter(Boolean).join(' ').toLocaleLowerCase('es').includes(search),
    )
  }, [patients, query])

  function openNewForm() {
    setEditingId(null)
    setForm(emptyPatient)
    setFormOpen(true)
    setNotice(null)
  }

  function openEditForm(patient) {
    setEditingId(patient.id)
    setForm({
      full_name: patient.full_name ?? '', rut: patient.rut ?? '', phone: patient.phone ?? '',
      email: patient.email ?? '', birth_date: patient.birth_date ?? '', notes: patient.notes ?? '',
    })
    setFormOpen(true)
    setNotice(null)
  }

  function closeForm() {
    setFormOpen(false)
    setEditingId(null)
    setForm(emptyPatient)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setNotice(null)
    const patient = {
      full_name: form.full_name.trim(),
      rut: form.rut.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      birth_date: form.birth_date || null,
      notes: form.notes.trim() || null,
    }
    const query = editingId
      ? supabase.from('patients').update(patient).eq('id', editingId)
      : supabase.from('patients').insert(patient)
    const { error } = await query
    setSaving(false)
    if (error) {
      const duplicateRut = error.code === '23505'
      setNotice({ kind: 'error', text: duplicateRut ? 'Ya existe un paciente con ese RUT.' : `No se pudo guardar el paciente: ${error.message}` })
      return
    }
    setNotice({ kind: 'success', text: editingId ? 'Datos del paciente actualizados.' : 'Paciente registrado.' })
    closeForm()
    await loadPatients()
  }

  async function deletePatient(patient) {
    if (!window.confirm(`¿Eliminar el registro de ${patient.full_name}? Solo se podrá borrar si no tiene citas ni ficha clínica asociada.`)) return
    setNotice(null)
    const { error } = await supabase.from('patients').delete().eq('id', patient.id)
    if (error) {
      setNotice({ kind: 'error', text: 'No se pudo eliminar: el paciente puede tener citas u otros registros asociados.' })
      return
    }
    setNotice({ kind: 'success', text: 'Paciente eliminado.' })
    await loadPatients()
  }

  return (
    <main className="staff-shell patients-shell">
      <header className="staff-topbar">
        <Link to="/" className="back-link">← Volver al panel</Link>
        <div className="staff-account"><span className="user-avatar">{(profile.full_name || 'U').charAt(0).toUpperCase()}</span><span>{profile.full_name || 'Personal'}</span></div>
      </header>
      <section className="staff-heading patients-heading">
        <div><p className="eyebrow">Atención · Registro</p><h1>Pacientes</h1><p>Administra los datos de contacto de quienes atiende la clínica.</p></div>
        <button className="primary-button patient-new-button" onClick={openNewForm}>＋ Nuevo paciente</button>
      </section>
      {notice && <div className={`staff-notice ${notice.kind}`} role="status">{notice.text}</div>}

      {formOpen && <section className="patient-form-card">
        <div className="patient-form-heading"><div><p className="eyebrow">{editingId ? 'Editar ficha' : 'Nuevo registro'}</p><h2>{editingId ? 'Actualizar paciente' : 'Registrar paciente'}</h2></div><button className="cancel-button" type="button" onClick={closeForm}>Cerrar</button></div>
        <form className="patient-form" onSubmit={handleSubmit}>
          <label>Nombre completo<input autoFocus required value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} /></label>
          <label>RUT<input required value={form.rut} onChange={(event) => setForm({ ...form, rut: event.target.value })} placeholder="12.345.678-9" /></label>
          <label>Teléfono<input type="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
          <label>Correo electrónico<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
          <label>Fecha de nacimiento<input type="date" value={form.birth_date} onChange={(event) => setForm({ ...form, birth_date: event.target.value })} /></label>
          <label className="patient-notes-field">Notas administrativas<textarea rows="3" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
          <div className="patient-form-actions"><button className="primary-button" type="submit" disabled={saving}>{saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Registrar paciente'}</button><button className="cancel-button" type="button" onClick={closeForm}>Cancelar</button></div>
        </form>
      </section>}

      <section className="staff-list-card patient-list-card">
        <div className="staff-list-heading"><div><h2>Directorio</h2><p>{patients.length} {patients.length === 1 ? 'paciente registrado' : 'pacientes registrados'}</p></div><input className="staff-search" type="search" placeholder="Buscar por nombre, RUT o contacto…" aria-label="Buscar pacientes" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
        {loading ? <p className="staff-empty">Cargando pacientes…</p> : filteredPatients.length === 0 ? <div className="staff-empty">{query ? 'No hay coincidencias.' : 'Aún no hay pacientes. Registra el primero para comenzar.'}</div> : (
          <div className="staff-table-wrap"><table className="staff-table patient-table"><thead><tr><th>Paciente</th><th>RUT</th><th>Teléfono</th><th>Correo</th><th>Nacimiento</th><th>Acciones</th></tr></thead><tbody>{filteredPatients.map((patient) => (
            <tr key={patient.id}><td><strong>{patient.full_name}</strong></td><td>{patient.rut}</td><td>{patient.phone || '—'}</td><td>{patient.email || '—'}</td><td>{formatDate(patient.birth_date)}</td><td><div className="staff-actions"><button type="button" className="table-action" onClick={() => openEditForm(patient)}>Editar</button><button type="button" className="table-action delete-action" onClick={() => deletePatient(patient)}>Eliminar</button></div></td></tr>
          ))}</tbody></table></div>
        )}
      </section>
      <p className="patient-privacy-note">Los pacientes no tienen cuenta de acceso. Solo personal autenticado puede gestionar estos registros.</p>
    </main>
  )
}
