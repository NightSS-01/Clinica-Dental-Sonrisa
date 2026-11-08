import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import { supabase } from '../lib/supabase.js'

const blankRecord = { patient_id: '', odontologist_id: '', diagnosis: '', treatment: '', clinical_notes: '' }
const blankLabOrder = { patient_id: '', clinical_record_id: '', destination: '', sent_at: '', due_at: '', status: 'solicitado', details: '' }
const labStatuses = [
  ['solicitado', 'Solicitado'], ['enviado', 'Enviado'], ['en_proceso', 'En proceso'], ['recibido', 'Recibido'], ['cancelado', 'Cancelado'],
]
const allowedFileTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const maximumFileSize = 10 * 1024 * 1024

function formatDate(value) {
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium' }).format(new Date(value))
}

function formatDay(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))
}

function labUrgency(order) {
  if (!order.due_at || ['recibido', 'cancelado'].includes(order.status)) return 'normal'
  const due = new Date(`${order.due_at}T00:00:00`)
  const days = Math.ceil((due.getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000)
  if (days < 0) return 'overdue'
  if (days <= 2) return 'soon'
  return 'normal'
}

export default function ClinicalPage() {
  const { profile } = useAuth()
  const [tab, setTab] = useState('records')
  const [patients, setPatients] = useState([])
  const [doctors, setDoctors] = useState([])
  const [records, setRecords] = useState([])
  const [files, setFiles] = useState([])
  const [labOrders, setLabOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState(null)
  const [search, setSearch] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [recordDraft, setRecordDraft] = useState(blankRecord)
  const [recordEditId, setRecordEditId] = useState(null)
  const [selectedFiles, setSelectedFiles] = useState([])
  const [openFilesRecordId, setOpenFilesRecordId] = useState(null)
  const [labDraft, setLabDraft] = useState(blankLabOrder)
  const [labEditId, setLabEditId] = useState(null)
  const [labFormOpen, setLabFormOpen] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    const [patientsResult, doctorsResult, recordsResult, filesResult, labResult] = await Promise.all([
      supabase.from('patients').select('id, full_name, rut').order('full_name').limit(500),
      supabase.rpc('list_active_odontologists'),
      supabase.from('clinical_records').select('id, patient_id, odontologist_id, appointment_id, diagnosis, treatment, clinical_notes, created_at, updated_at, patient:patients!clinical_records_patient_id_fkey(full_name, rut)').order('created_at', { ascending: false }),
      supabase.from('clinical_files').select('id, patient_id, clinical_record_id, object_path, original_name, content_type, created_at').order('created_at', { ascending: false }),
      supabase.from('lab_orders').select('id, patient_id, clinical_record_id, destination, sent_at, due_at, status, details, created_at, patient:patients!lab_orders_patient_id_fkey(full_name, rut)').order('due_at', { ascending: true, nullsFirst: false }),
    ])
    const firstError = [patientsResult, doctorsResult, recordsResult, filesResult, labResult].find((result) => result.error)
    if (firstError) {
      setNotice({ kind: 'error', text: 'No se pudo cargar el módulo clínico. Verifica que la migración clínica esté ejecutada y vuelve a cargar.' })
    } else {
      setPatients(patientsResult.data ?? [])
      setDoctors(doctorsResult.data ?? [])
      setRecords(recordsResult.data ?? [])
      setFiles(filesResult.data ?? [])
      setLabOrders(labResult.data ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const doctorsById = useMemo(() => Object.fromEntries(doctors.map((doctor) => [doctor.id, doctor.full_name])), [doctors])
  const filteredRecords = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('es')
    if (!needle) return records
    return records.filter((record) => `${record.patient?.full_name ?? ''} ${record.patient?.rut ?? ''} ${record.diagnosis} ${record.treatment ?? ''}`.toLocaleLowerCase('es').includes(needle))
  }, [records, search])

  function openNewRecord() {
    setRecordDraft({ ...blankRecord, odontologist_id: profile.role === 'odontologo' ? profile.id : doctors[0]?.id ?? '' })
    setRecordEditId(null)
    setSelectedFiles([])
    setFormOpen(true)
    setNotice(null)
  }

  function openEditRecord(record) {
    setRecordDraft({ patient_id: record.patient_id, odontologist_id: record.odontologist_id, diagnosis: record.diagnosis, treatment: record.treatment ?? '', clinical_notes: record.clinical_notes ?? '' })
    setRecordEditId(record.id)
    setSelectedFiles([])
    setFormOpen(true)
    setNotice(null)
  }

  async function uploadFiles(patientId, recordId) {
    const failures = []
    for (const file of selectedFiles) {
      const safeName = file.name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-100)
      const objectPath = `${patientId}/${recordId}/${crypto.randomUUID()}-${safeName}`
      const { error: uploadError } = await supabase.storage.from('clinical-files').upload(objectPath, file, { contentType: file.type, upsert: false })
      if (uploadError) { failures.push(file.name); continue }
      const { error: metadataError } = await supabase.from('clinical_files').insert({ patient_id: patientId, clinical_record_id: recordId, object_path: objectPath, original_name: file.name, content_type: file.type })
      if (metadataError) {
        await supabase.storage.from('clinical-files').remove([objectPath])
        failures.push(file.name)
      }
    }
    return failures
  }

  async function saveRecord(event) {
    event.preventDefault()
    setSaving(true)
    setNotice(null)
    const record = {
      patient_id: recordDraft.patient_id,
      odontologist_id: recordDraft.odontologist_id,
      diagnosis: recordDraft.diagnosis.trim(),
      treatment: recordDraft.treatment.trim() || null,
      clinical_notes: recordDraft.clinical_notes.trim() || null,
    }
    const result = recordEditId
      ? await supabase.from('clinical_records').update(record).eq('id', recordEditId).select('id').single()
      : await supabase.from('clinical_records').insert(record).select('id').single()
    if (result.error) {
      setSaving(false)
      setNotice({ kind: 'error', text: `No se pudo guardar el registro: ${result.error.message}` })
      return
    }
    const failedFiles = selectedFiles.length ? await uploadFiles(record.patient_id, result.data.id) : []
    setSaving(false)
    setFormOpen(false)
    setRecordEditId(null)
    setSelectedFiles([])
    setNotice(failedFiles.length
      ? { kind: 'error', text: `Registro guardado; no se pudieron subir estos archivos: ${failedFiles.join(', ')}` }
      : { kind: 'success', text: recordEditId ? 'Registro clínico actualizado.' : 'Atención registrada.' })
    await loadData()
  }

  async function openPrivateFile(file) {
    const { data, error } = await supabase.storage.from('clinical-files').createSignedUrl(file.object_path, 60)
    if (error) {
      setNotice({ kind: 'error', text: `No se pudo abrir el archivo: ${error.message}` })
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  function onSelectFiles(event) {
    const nextFiles = Array.from(event.target.files ?? [])
    const invalid = nextFiles.filter((file) => !allowedFileTypes.includes(file.type) || file.size > maximumFileSize)
    if (invalid.length) setNotice({ kind: 'error', text: 'Solo se permiten imágenes JPG, PNG o WebP y archivos PDF de hasta 10 MB.' })
    setSelectedFiles(nextFiles.filter((file) => allowedFileTypes.includes(file.type) && file.size <= maximumFileSize))
  }

  function editLabOrder(order) {
    setLabEditId(order.id)
    setLabDraft({ patient_id: order.patient_id, clinical_record_id: order.clinical_record_id ?? '', destination: order.destination, sent_at: order.sent_at ?? '', due_at: order.due_at ?? '', status: order.status, details: order.details ?? '' })
    setLabFormOpen(true)
    setNotice(null)
  }

  function newLabOrder() {
    setLabEditId(null)
    setLabDraft(blankLabOrder)
    setLabFormOpen(true)
    setNotice(null)
  }

  async function saveLabOrder(event) {
    event.preventDefault()
    setSaving(true)
    setNotice(null)
    const order = {
      patient_id: labDraft.patient_id,
      clinical_record_id: labDraft.clinical_record_id || null,
      destination: labDraft.destination.trim(),
      sent_at: labDraft.sent_at || null,
      due_at: labDraft.due_at || null,
      status: labDraft.status,
      details: labDraft.details.trim() || null,
    }
    const result = labEditId
      ? await supabase.from('lab_orders').update(order).eq('id', labEditId)
      : await supabase.from('lab_orders').insert(order)
    setSaving(false)
    if (result.error) {
      setNotice({ kind: 'error', text: `No se pudo guardar la orden: ${result.error.message}` })
      return
    }
    setLabFormOpen(false)
    setLabEditId(null)
    setNotice({ kind: 'success', text: labEditId ? 'Orden de laboratorio actualizada.' : 'Orden de laboratorio creada.' })
    await loadData()
  }

  const availableRecords = recordDraft.patient_id ? records.filter((record) => record.patient_id === recordDraft.patient_id) : []

  return (
    <main className="staff-shell clinical-shell">
      <header className="staff-topbar"><Link to="/" className="back-link">← Volver al panel</Link><div className="staff-account"><span className="user-avatar">{(profile.full_name || 'U').charAt(0).toUpperCase()}</span><span>{profile.full_name || 'Personal'}</span></div></header>
      <section className="clinical-heading"><div><p className="eyebrow">Atención · Odontología</p><h1>Gestión clínica</h1><p>Registros de atención, archivos privados y seguimiento de laboratorio.</p></div><div className="clinical-shield">◈ <span>Acceso restringido</span></div></section>
      {notice && <div className={`staff-notice ${notice.kind}`} role="status">{notice.text}</div>}
      <nav className="clinical-tabs" aria-label="Secciones clínicas">
        <button className={tab === 'records' ? 'is-current' : ''} onClick={() => { setTab('records'); setNotice(null) }}>Ficha clínica <span>{records.length}</span></button>
        <button className={tab === 'lab' ? 'is-current' : ''} onClick={() => { setTab('lab'); setNotice(null) }}>Laboratorio <span>{labOrders.length}</span></button>
      </nav>

      {tab === 'records' && <>
        <section className="clinical-toolbar"><div><h2>Atenciones registradas</h2><p>Los registros y archivos solo están disponibles para odontología y administración.</p></div><div className="clinical-toolbar-actions"><input className="staff-search" type="search" placeholder="Buscar paciente o diagnóstico…" aria-label="Buscar registros clínicos" value={search} onChange={(event) => setSearch(event.target.value)} /><button className="primary-button clinical-new-button" onClick={openNewRecord} disabled={patients.length === 0 || doctors.length === 0}>＋ Registrar atención</button></div></section>
        {patients.length === 0 && <div className="agenda-setup-note"><strong>No hay pacientes registrados.</strong><span>Agrega un paciente antes de crear una ficha clínica.</span></div>}
        {formOpen && <section className="clinical-form-card"><div className="clinical-form-heading"><div><p className="eyebrow">{recordEditId ? 'Modificar atención' : 'Nueva atención'}</p><h2>{recordEditId ? 'Actualizar registro clínico' : 'Registrar atención clínica'}</h2></div><button className="cancel-button" onClick={() => setFormOpen(false)}>Cerrar</button></div>
          <form className="clinical-form" onSubmit={saveRecord}>
            <label>Paciente<select required disabled={Boolean(recordEditId)} value={recordDraft.patient_id} onChange={(event) => setRecordDraft({ ...recordDraft, patient_id: event.target.value })}><option value="">Selecciona paciente</option>{patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.full_name} · {patient.rut}</option>)}</select></label>
            {profile.role === 'administrador' ? <label>Odontólogo<select required value={recordDraft.odontologist_id} onChange={(event) => setRecordDraft({ ...recordDraft, odontologist_id: event.target.value })}><option value="">Selecciona odontólogo</option>{doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.full_name}</option>)}</select></label> : <label>Odontólogo<input value={profile.full_name || 'Odontólogo'} readOnly /></label>}
            <label className="clinical-full-field">Diagnóstico<input required value={recordDraft.diagnosis} onChange={(event) => setRecordDraft({ ...recordDraft, diagnosis: event.target.value })} /></label>
            <label className="clinical-full-field">Tratamiento<textarea rows="3" value={recordDraft.treatment} onChange={(event) => setRecordDraft({ ...recordDraft, treatment: event.target.value })} /></label>
            <label className="clinical-full-field">Notas clínicas<textarea rows="3" value={recordDraft.clinical_notes} onChange={(event) => setRecordDraft({ ...recordDraft, clinical_notes: event.target.value })} /></label>
            <label className="clinical-full-field file-picker">Radiografías, fotografías o PDF <span>Hasta 10 MB por archivo</span><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple onChange={onSelectFiles} />{selectedFiles.length > 0 && <small>{selectedFiles.length} archivo(s) seleccionado(s)</small>}</label>
            <div className="clinical-form-actions"><button className="cancel-button" type="button" onClick={() => setFormOpen(false)}>Cancelar</button><button className="primary-button" type="submit" disabled={saving}>{saving ? 'Guardando…' : recordEditId ? 'Guardar cambios' : 'Guardar atención'}</button></div>
          </form>
        </section>}
        <section className="clinical-record-list">
          {loading ? <p className="staff-empty">Cargando fichas…</p> : filteredRecords.length === 0 ? <div className="clinical-empty"><span>✚</span><strong>{search ? 'No encontramos registros.' : 'Aún no hay atenciones registradas.'}</strong><p>Al guardar una atención, quedará asociada al paciente en su ficha clínica.</p></div> : filteredRecords.map((record) => {
            const recordFiles = files.filter((file) => file.clinical_record_id === record.id)
            return <article className="clinical-record-card" key={record.id}>
              <div className="clinical-record-top"><div><span className="clinical-record-date">{formatDate(record.created_at)}</span><h3>{record.patient?.full_name || 'Paciente'} <small>{record.patient?.rut}</small></h3></div><button className="table-action" onClick={() => openEditRecord(record)}>Editar</button></div>
              <div className="clinical-diagnosis"><span>DIAGNÓSTICO</span><p>{record.diagnosis}</p></div>
              {record.treatment && <div className="clinical-treatment"><span>TRATAMIENTO</span><p>{record.treatment}</p></div>}
              {record.clinical_notes && <p className="clinical-note-text">{record.clinical_notes}</p>}
              <div className="clinical-record-bottom"><span>Atiende: {doctorsById[record.odontologist_id] || (record.odontologist_id === profile.id ? profile.full_name : 'Odontólogo')}</span><button className="table-action file-toggle" onClick={() => setOpenFilesRecordId(openFilesRecordId === record.id ? null : record.id)}>Archivos ({recordFiles.length})</button></div>
              {openFilesRecordId === record.id && <div className="clinical-file-list">{recordFiles.length === 0 ? <span>No hay archivos adjuntos.</span> : recordFiles.map((file) => <button key={file.id} className="clinical-file-item" onClick={() => openPrivateFile(file)}><span className="file-type-icon">{file.content_type === 'application/pdf' ? 'PDF' : 'IMG'}</span><span>{file.original_name}</span><span aria-hidden="true">↗</span></button>)}</div>}
            </article>
          })}
        </section>
      </>}

      {tab === 'lab' && <>
        <section className="clinical-toolbar"><div><h2>Órdenes de laboratorio</h2><p>Controla el destino y las fechas de entrega de cada trabajo.</p></div><button className="primary-button clinical-new-button" onClick={newLabOrder} disabled={patients.length === 0}>＋ Nueva orden</button></section>
        {labFormOpen && <section className="clinical-form-card"><div className="clinical-form-heading"><div><p className="eyebrow">{labEditId ? 'Actualizar seguimiento' : 'Nueva solicitud'}</p><h2>{labEditId ? 'Editar orden' : 'Crear orden de laboratorio'}</h2></div><button className="cancel-button" onClick={() => setLabFormOpen(false)}>Cerrar</button></div>
          <form className="clinical-form" onSubmit={saveLabOrder}>
            <label>Paciente<select required value={labDraft.patient_id} onChange={(event) => setLabDraft({ ...labDraft, patient_id: event.target.value, clinical_record_id: '' })}><option value="">Selecciona paciente</option>{patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.full_name} · {patient.rut}</option>)}</select></label>
            <label>Atención asociada<select value={labDraft.clinical_record_id} onChange={(event) => setLabDraft({ ...labDraft, clinical_record_id: event.target.value })}><option value="">Sin asociar</option>{records.filter((record) => record.patient_id === labDraft.patient_id).map((record) => <option key={record.id} value={record.id}>{formatDate(record.created_at)} · {record.diagnosis.slice(0, 50)}</option>)}</select></label>
            <label>Laboratorio de destino<input required value={labDraft.destination} onChange={(event) => setLabDraft({ ...labDraft, destination: event.target.value })} /></label>
            <label>Estado<select value={labDraft.status} onChange={(event) => setLabDraft({ ...labDraft, status: event.target.value })}>{labStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label>Fecha de envío<input type="date" value={labDraft.sent_at} onChange={(event) => setLabDraft({ ...labDraft, sent_at: event.target.value })} /></label>
            <label>Fecha estimada de entrega<input type="date" value={labDraft.due_at} onChange={(event) => setLabDraft({ ...labDraft, due_at: event.target.value })} /></label>
            <label className="clinical-full-field">Detalle<textarea rows="3" value={labDraft.details} onChange={(event) => setLabDraft({ ...labDraft, details: event.target.value })} /></label>
            <div className="clinical-form-actions"><button type="button" className="cancel-button" onClick={() => setLabFormOpen(false)}>Cancelar</button><button className="primary-button" type="submit" disabled={saving}>{saving ? 'Guardando…' : labEditId ? 'Guardar cambios' : 'Crear orden'}</button></div>
          </form>
        </section>}
        <section className="lab-order-grid">{loading ? <p className="staff-empty">Cargando órdenes…</p> : labOrders.length === 0 ? <div className="clinical-empty"><span>⌑</span><strong>No hay órdenes de laboratorio.</strong><p>Las fechas próximas y vencidas se destacarán aquí.</p></div> : labOrders.map((order) => {
          const urgency = labUrgency(order)
          return <article className={`lab-order-card urgency-${urgency}`} key={order.id}>
            <div className="lab-order-header"><span className={`lab-status status-${order.status}`}>{labStatuses.find(([value]) => value === order.status)?.[1]}</span><button className="table-action" onClick={() => editLabOrder(order)}>Editar</button></div>
            <h3>{order.patient?.full_name || 'Paciente'} <small>{order.patient?.rut}</small></h3>
            <p className="lab-destination">{order.destination}</p>
            {order.details && <p className="lab-details">{order.details}</p>}
            <div className="lab-dates"><span>Enviado<strong>{formatDay(order.sent_at)}</strong></span><span className={urgency !== 'normal' ? `due-${urgency}` : ''}>Entrega estimada<strong>{formatDay(order.due_at)}</strong></span></div>
            {urgency === 'overdue' && <p className="lab-alert">Entrega vencida</p>}{urgency === 'soon' && <p className="lab-alert soon-alert">Entrega próxima</p>}
          </article>
        })}</section>
      </>}
      <footer className="clinical-privacy-footer">Los archivos clínicos se almacenan en un bucket privado y se abren con enlaces temporales.</footer>
    </main>
  )
}
