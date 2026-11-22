export default function AdminSidebar({ title = 'Admin workspace', subtitle = 'Fleet and reservation management' }) {
  return (
    <aside className="admin-sidebar">
      <div className="logo" aria-label="DriveRent admin home">
        <span className="logo-symbol" aria-hidden="true">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="m5 11 1.6-4.5A2.2 2.2 0 0 1 8.7 5h6.6a2.2 2.2 0 0 1 2.1 1.5L19 11" />
            <path d="M3 11h18v7H3zM6 18v2m12-2v2" />
            <circle cx="7" cy="15" r="1" />
            <circle cx="17" cy="15" r="1" />
          </svg>
        </span>
        <span>Drive<span>Rent</span></span>
      </div>
      <p className="sidebar-caption">Workspace</p>
      <h3 style={{ margin: '0', color: '#fff', fontSize: '17px', fontWeight: 700 }}>{title}</h3>
      <p style={{ margin: '8px 0 0', color: '#a7bfd9', fontSize: '11px', lineHeight: 1.6 }}>{subtitle}</p>
    </aside>
  )
}
