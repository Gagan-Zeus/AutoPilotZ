import type { FormEvent } from 'react';
import { useMemo, useState } from 'react';
import type { ExportedVaultBundle, ProfileData } from '../core/entities/Profile';
import { usePopupStore } from './store';

const sampleProfileData: ProfileData = {
  firstName: 'Ada',
  middleName: '',
  lastName: 'Lovelace',
  preferredName: 'Ada',
  email: 'ada@example.com',
  phone: '+1 555 0100',
  alternatePhone: '',
  dateOfBirth: '1815-12-10',
  gender: '',
  nationality: 'British',
  address: {
    lines: ['12 St James Square'],
    city: 'London',
    state: '',
    postalCode: 'SW1Y',
    country: 'United Kingdom',
  },
  linkedIn: 'https://www.linkedin.com/in/ada-lovelace',
  github: 'https://github.com/ada',
  portfolio: 'https://example.com',
  education: [
    {
      id: 'education-1',
      institution: 'University of London',
      degree: 'Mathematics',
      fieldOfStudy: 'Computing',
      startDate: '1832-01',
      endDate: '1835-01',
      current: false,
    },
  ],
  employment: [
    {
      id: 'employment-1',
      company: 'Analytical Engines Ltd',
      title: 'Researcher',
      startDate: '1842-01',
      current: true,
      location: 'London',
    },
  ],
};

export function PopupApp() {
  const {
    passphrase,
    profiles,
    selectedProfileId,
    searchQuery,
    exportBundle,
    lastMappings,
    status,
    loading,
    setPassphrase,
    setSearchQuery,
    loadProfiles,
    saveProfile,
    switchProfile,
    searchProfiles,
    exportProfiles,
    importProfiles,
    mapActiveTab,
  } = usePopupStore();
  const [label, setLabel] = useState('Default');
  const [profileJson, setProfileJson] = useState(JSON.stringify(sampleProfileData, null, 2));
  const [importJson, setImportJson] = useState('');

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedProfileId),
    [profiles, selectedProfileId],
  );

  const handleSave = (event: FormEvent) => {
    event.preventDefault();
    void saveProfile(label, JSON.parse(profileJson) as ProfileData, selectedProfile?.id);
  };

  const handleImport = () => {
    void importProfiles(JSON.parse(importJson) as ExportedVaultBundle);
  };

  return (
    <main className="w-[420px] bg-panel text-ink">
      <section className="border-b border-slate-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <h1 className="text-base font-semibold">AutoPilotX</h1>
          <span className="rounded bg-white px-2 py-1 text-xs text-slate-600 ring-1 ring-slate-200">
            MV3
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-600">{status}</p>
      </section>

      <section className="space-y-3 px-4 py-4">
        <label className="block text-xs font-medium text-slate-700" htmlFor="passphrase">
          Vault passphrase
        </label>
        <div className="flex gap-2">
          <input
            id="passphrase"
            className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-3 py-2 text-sm"
            type="password"
            value={passphrase}
            onChange={(event) => setPassphrase(event.target.value)}
            placeholder="Minimum 8 characters"
          />
          <button
            className="rounded bg-ink px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            type="button"
            disabled={loading || passphrase.length < 8}
            onClick={() => void loadProfiles()}
          >
            Unlock
          </button>
        </div>
      </section>

      <form className="space-y-3 border-t border-slate-200 px-4 py-4" onSubmit={handleSave}>
        <label className="block text-xs font-medium text-slate-700" htmlFor="label">
          Profile label
        </label>
        <input
          id="label"
          className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
        />
        <label className="block text-xs font-medium text-slate-700" htmlFor="profile-data">
          Secure profile JSON
        </label>
        <textarea
          id="profile-data"
          className="h-36 w-full resize-none rounded border border-slate-300 bg-white px-3 py-2 font-mono text-xs"
          value={profileJson}
          onChange={(event) => setProfileJson(event.target.value)}
        />
        <button
          className="w-full rounded bg-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          disabled={loading || passphrase.length < 8}
          type="submit"
        >
          Save encrypted profile
        </button>
      </form>

      <section className="space-y-3 border-t border-slate-200 px-4 py-4">
        <div className="flex gap-2">
          <input
            className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-3 py-2 text-sm"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search profiles"
          />
          <button
            className="rounded bg-white px-3 py-2 text-sm font-medium text-ink ring-1 ring-slate-300 disabled:opacity-50"
            disabled={loading || passphrase.length < 8}
            type="button"
            onClick={() => void searchProfiles(searchQuery)}
          >
            Search
          </button>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-3 py-2 text-sm"
            value={selectedProfileId ?? ''}
            onChange={(event) => void switchProfile(event.target.value)}
          >
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.label}
              </option>
            ))}
          </select>
          <button
            className="rounded bg-ink px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={loading || !selectedProfile}
            type="button"
            onClick={() => void mapActiveTab()}
          >
            Fill
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            className="rounded bg-white px-3 py-2 text-sm font-medium text-ink ring-1 ring-slate-300 disabled:opacity-50"
            disabled={loading || passphrase.length < 8 || profiles.length === 0}
            type="button"
            onClick={() => void exportProfiles()}
          >
            Export
          </button>
          <button
            className="rounded bg-white px-3 py-2 text-sm font-medium text-ink ring-1 ring-slate-300 disabled:opacity-50"
            disabled={loading || passphrase.length < 8 || !importJson.trim()}
            type="button"
            onClick={handleImport}
          >
            Import
          </button>
        </div>

        <textarea
          className="h-24 w-full resize-none rounded border border-slate-300 bg-white px-3 py-2 font-mono text-xs"
          value={importJson || (exportBundle ? JSON.stringify(exportBundle, null, 2) : '')}
          onChange={(event) => setImportJson(event.target.value)}
          placeholder="Encrypted import/export bundle"
        />

        {lastMappings.length > 0 && (
          <ul className="max-h-28 space-y-1 overflow-auto text-xs text-slate-600">
            {lastMappings.map((mapping) => (
              <li key={`${mapping.selector}:${mapping.profileKey}`}>
                {mapping.profileKey} ({Math.round(mapping.confidence * 100)}%)
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
