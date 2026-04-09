const AccountSectionPage = ({ title, description }) => {
  return (
    <div className="dashboard-page animate-fade-in">
      <div className="dashboard-page-header">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div className="chart-card">
        <p style={{ color: 'var(--text-secondary)' }}>
          This section is ready. You can now wire your backend actions here.
        </p>
      </div>
    </div>
  )
}

export default AccountSectionPage
