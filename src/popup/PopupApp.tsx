import type { FormEvent } from 'react';
import { useMemo, useState } from 'react';
import { usePopupStore } from './store';

const sampleAttributes = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  phone: '+1 555 0100',
  company: 'Analytical Engines Ltd',
};

export function PopupApp() {
  const {
    passphrase,
    profiles,
    selectedProfileId,
    lastMappings,
    status,
    loading,
    setPassphrase,
    loadProfiles,
    saveProfile,
    selectProfile,
    mapActiveTab,
  } = usePopupStore();
  const [label, setLabel] = useState('Default');
  const [attributesJson, setAttributesJson] = useState(JSON.stringify(sampleAttributes, null, 2));

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedProfileId),
    [profiles, selectedProfileId],
  );

  const handleSave = (event: FormEvent) => {
    event.preventDefault();
    void saveProfile(label, JSON.parse(attributesJson) as typeof sampleAttributes);
  };

  return (
    <main className="w-[380px] bg-panel text-ink">
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
        <label className="block text-xs font-medium text-slate-700" htmlFor="attributes">
          Attributes JSON
        </label>
        <textarea
          id="attributes"
          className="h-36 w-full resize-none rounded border border-slate-300 bg-white px-3 py-2 font-mono text-xs"
          value={attributesJson}
          onChange={(event) => setAttributesJson(event.target.value)}
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
        <div className="flex items-center gap-2">
          <select
            className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-3 py-2 text-sm"
            value={selectedProfileId ?? ''}
            onChange={(event) => selectProfile(event.target.value)}
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
