import { Component } from 'react'
import { Link } from 'react-router-dom'

export default class InventoryErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    console.error('Error al mostrar Inventario:', error)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <main className="staff-shell inventory-shell">
        <header className="staff-topbar"><Link to="/" className="back-link">← Volver al panel</Link></header>
        <section className="inventory-heading" role="alert">
          <div>
            <p className="eyebrow">Error al abrir el módulo</p>
            <h1>No se pudo mostrar Inventario</h1>
            <p>Recarga la página. Si vuelve a ocurrir, comparte este detalle:</p>
            <code>{this.state.error?.message || 'Error inesperado al renderizar el módulo.'}</code>
          </div>
          <button className="primary-button inventory-new-button" onClick={() => window.location.reload()}>Recargar página</button>
        </section>
      </main>
    )
  }
}
