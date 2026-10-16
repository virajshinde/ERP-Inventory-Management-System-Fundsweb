
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Users,
  X,
} from 'lucide-react';
import api from '../api/axios';

const emptyForm = {
  companyName: '',
  contactPerson: '',
  mobile: '',
  email: '',
  city: '',
};

const PAGE_SIZE = 10;

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);

  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    total: 0,
    totalPages: 1,
  });

  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function loadCustomers(pageNumber = page) {
    setLoading(true);
    setError('');

    try {
      const response = await api.get('/customers', {
        params: {
          page: pageNumber,
          limit: PAGE_SIZE,
        },
      });

      setCustomers(response.data.data ?? []);
      setPagination({
        total: response.data.pagination?.total ?? 0,
        totalPages: response.data.pagination?.totalPages ?? 1,
      });
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.response?.data?.error ||
          'Unable to load customers. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCustomers(page);
  }, [page]);

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  function openCreateForm() {
    setForm(emptyForm);
    setEditingId(null);
    setError('');
    setSuccess('');
    setShowForm(true);
  }

  function openEditForm(customer) {
    setForm({
      companyName: customer.companyName ?? '',
      contactPerson: customer.contactPerson ?? '',
      mobile: customer.mobile ?? '',
      email: customer.email ?? '',
      city: customer.city ?? '',
    });

    setEditingId(customer.id);
    setError('');
    setSuccess('');
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setError('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const payload = {
  ...form,
  email: form.email.trim() || undefined,
};
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      if (editingId) {
        await api.patch(`/customers/${editingId}`, payload);
        setSuccess('Customer updated successfully.');
      } else {
        await api.post('/customers', payload);
        setSuccess('Customer created successfully.');
      }

      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);

      // Refresh from the first page after saving.
      setPage(1);
      await loadCustomers(1);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.response?.data?.error ||
          'Unable to save customer. Check the form and try again.'
      );
    } finally {
      setSaving(false);
    }
  }

  const filteredCustomers = customers.filter((customer) => {
    const query = search.trim().toLowerCase();

    if (!query) return true;

    return [
      customer.companyName,
      customer.contactPerson,
      customer.mobile,
      customer.email,
      customer.city,
    ].some((value) =>
      String(value ?? '').toLowerCase().includes(query)
    );
  });

  return (
    <main className="customers-page">
      <header className="customers-header">
        <div>
          <Link to="/dashboard" className="back-link">
            <ArrowLeft size={16} />
            Back to dashboard
          </Link>

          <p className="eyebrow">SALES MANAGEMENT</p>
          <h1>Customers</h1>
          <p className="page-description">
            Manage your manufacturing clients and their contact details.
          </p>
        </div>

        <button className="primary-button" onClick={openCreateForm}>
          <Plus size={18} />
          Add customer
        </button>
      </header>

      {success && (
        <div className="notice notice-success" role="status">
          {success}
        </div>
      )}

      {error && (
        <div className="notice notice-error" role="alert">
          {error}
        </div>
      )}

      {showForm && (
        <section className="customer-form-panel">
          <div className="panel-heading">
            <div>
              <h2>{editingId ? 'Edit customer' : 'Add new customer'}</h2>
              <p>Enter the company and contact information below.</p>
            </div>

            <button
              type="button"
              className="icon-button"
              onClick={closeForm}
              aria-label="Close form"
            >
              <X size={20} />
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="customer-form-grid">
              <label>
                Company name *
                <input
                  name="companyName"
                  value={form.companyName}
                  onChange={handleChange}
                  placeholder="ABC Manufacturing Pvt Ltd"
                  required
                  maxLength={150}
                />
              </label>

              <label>
                Contact person *
                <input
                  name="contactPerson"
                  value={form.contactPerson}
                  onChange={handleChange}
                  placeholder="Rahul Sharma"
                  required
                  maxLength={100}
                />
              </label>

              <label>
                Mobile number *
                <input
                  name="mobile"
                  type="tel"
                  value={form.mobile}
                  onChange={handleChange}
                  placeholder="9876543210"
                  required
                  maxLength={20}
                />
              </label>

              <label>
                Email address
                <input
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="contact@company.com"
                  maxLength={150}
                />
              </label>

              <label className="full-width-field">
                City *
                <input
                  name="city"
                  value={form.city}
                  onChange={handleChange}
                  placeholder="Pune"
                  required
                  maxLength={100}
                />
              </label>
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={closeForm}
                disabled={saving}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="primary-button"
                disabled={saving}
              >
                {saving
                  ? 'Saving...'
                  : editingId
                    ? 'Update customer'
                    : 'Save customer'}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="customers-panel">
        <div className="customers-toolbar">
          <div className="customers-count">
            <div className="customers-icon">
              <Users size={20} />
            </div>
            <div>
              <h2>Customer directory</h2>
              <p>{pagination.total} customers registered</p>
            </div>
          </div>

          <div className="toolbar-actions">
            <div className="search-field">
              <Search size={17} />
              <input
                aria-label="Search customers on this page"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search this page..."
              />
            </div>

            <button
              className="secondary-button refresh-button"
              onClick={() => loadCustomers(page)}
              disabled={loading}
              title="Refresh customers"
            >
              <RefreshCw size={16} />
              Refresh
            </button>
          </div>
        </div>

        <div className="customers-table-wrapper">
          <table className="customers-table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Contact person</th>
                <th>Mobile</th>
                <th>Email</th>
                <th>City</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6" className="table-message">
                    Loading customers...
                  </td>
                </tr>
              ) : filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan="6" className="table-message">
                    {search
                      ? 'No customers match your search on this page.'
                      : 'No customers found. Add your first customer.'}
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((customer) => (
                  <tr key={customer.id}>
                    <td>
                      <div className="company-cell">
                        <div className="company-icon">
                          <Building2 size={17} />
                        </div>
                        <span>{customer.companyName}</span>
                      </div>
                    </td>
                    <td>{customer.contactPerson}</td>
                    <td>{customer.mobile}</td>
                    <td>{customer.email || '—'}</td>
                    <td>{customer.city}</td>
                    <td>
                      <button
                        className="edit-button"
                        onClick={() => openEditForm(customer)}
                        aria-label={`Edit ${customer.companyName}`}
                      >
                        <Pencil size={15} />
                        Edit
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <footer className="pagination-footer">
          <span>
            Page {page} of {Math.max(1, pagination.totalPages)}
          </span>

          <div className="pagination-actions">
            <button
              className="secondary-button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((current) => current - 1)}
            >
              Previous
            </button>

            <button
              className="secondary-button"
              disabled={page >= pagination.totalPages || loading}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </button>
          </div>
        </footer>
      </section>
    </main>
  );
}
