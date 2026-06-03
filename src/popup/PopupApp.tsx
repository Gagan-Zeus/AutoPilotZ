import type { FormEvent } from 'react';
import { useMemo, useState } from 'react';
import type { AutofillSafetyBlock } from '../content/form-filling/AutofillSafetyPolicy';
import type { ExportedVaultBundle, ProfileData } from '../core/entities/Profile';
import type { MappingReviewItem } from './review';
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

interface PopupAppProps {
  surface?: 'popup' | 'sidepanel';
}

export function PopupApp({ surface = 'popup' }: PopupAppProps) {
  const {
    passphrase,
    profiles,
    selectedProfileId,
    searchQuery,
    exportBundle,
    lastMappings,
    reviewItems,
    sensitiveBlocks,
    status,
    loading,
    setPassphrase,
    setSearchQuery,
    setStatus,
    loadProfiles,
    saveProfile,
    switchProfile,
    searchProfiles,
    exportProfiles,
    importProfiles,
    mapActiveTab,
    acceptReviewItem,
    rejectReviewItem,
    editReviewItem,
    applyAcceptedMappings,
    confirmSensitiveMappings,
  } = usePopupStore();
  const [label, setLabel] = useState('Default');
  const [profileJson, setProfileJson] = useState(JSON.stringify(sampleProfileData, null, 2));
  const [importJson, setImportJson] = useState('');

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedProfileId),
    [profiles, selectedProfileId],
  );
  const profileKeys = useMemo(
    () =>
      Object.keys(selectedProfile?.attributes ?? {}).sort((left, right) =>
        left.localeCompare(right),
      ),
    [selectedProfile],
  );
  const acceptedReviewCount = reviewItems.filter((item) => item.status === 'accepted').length;

  const handleSave = (event: FormEvent) => {
    event.preventDefault();
    try {
      void saveProfile(label, JSON.parse(profileJson) as ProfileData, selectedProfile?.id);
    } catch {
      setStatus('Profile JSON is invalid.');
    }
  };

  const handleImport = () => {
    try {
      void importProfiles(JSON.parse(importJson) as ExportedVaultBundle);
    } catch {
      setStatus('Import bundle JSON is invalid.');
    }
  };

  const shellClassName =
    surface === 'sidepanel'
      ? 'min-h-screen w-full overflow-auto bg-panel text-ink'
      : 'max-h-[640px] w-[480px] overflow-auto bg-panel text-ink';

  return (
    <main className={shellClassName}>
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
            Review
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

        <ReviewMode
          acceptedCount={acceptedReviewCount}
          items={reviewItems}
          loading={loading}
          profileKeys={profileKeys}
          sensitiveBlocks={sensitiveBlocks}
          onAccept={acceptReviewItem}
          onApply={() => void applyAcceptedMappings()}
          onConfirmSensitive={() => void confirmSensitiveMappings()}
          onEdit={editReviewItem}
          onReject={rejectReviewItem}
        />

        {reviewItems.length === 0 && lastMappings.length > 0 && (
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

interface ReviewModeProps {
  acceptedCount: number;
  items: MappingReviewItem[];
  loading: boolean;
  profileKeys: string[];
  sensitiveBlocks: AutofillSafetyBlock[];
  onAccept: (id: string) => void;
  onApply: () => void;
  onConfirmSensitive: () => void;
  onEdit: (id: string, profileKey: string) => void;
  onReject: (id: string) => void;
}

function ReviewMode({
  acceptedCount,
  items,
  loading,
  profileKeys,
  sensitiveBlocks,
  onAccept,
  onApply,
  onConfirmSensitive,
  onEdit,
  onReject,
}: ReviewModeProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3 border-t border-slate-200 pt-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Review mappings</h2>
        <button
          className="rounded bg-accent px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
          disabled={loading || acceptedCount === 0}
          type="button"
          onClick={onApply}
        >
          Apply accepted ({acceptedCount})
        </button>
      </div>

      {sensitiveBlocks.length > 0 && (
        <section className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold">
                {sensitiveBlocks.length} sensitive field
                {sensitiveBlocks.length === 1 ? '' : 's'} blocked
              </p>
              <p className="mt-1 text-amber-800">
                Confirm only if you intentionally want AutoPilotX to fill these fields.
              </p>
            </div>
            <button
              className="shrink-0 rounded bg-amber-900 px-3 py-2 font-semibold text-white disabled:opacity-50"
              disabled={loading}
              type="button"
              onClick={onConfirmSensitive}
            >
              Confirm
            </button>
          </div>
          <ul className="mt-2 space-y-1">
            {sensitiveBlocks.map((block) => (
              <li key={`${block.selector}:${block.profileKey}`}>
                <span className="font-medium">{block.profileKey}</span> ·{' '}
                {block.categories.join(', ')}
                {block.evidence[0] ? ` · ${block.evidence[0]}` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}

      <ul className="max-h-72 space-y-2 overflow-auto pr-1">
        {items.map((item) => (
          <li
            className="rounded border border-slate-200 bg-white p-3 text-xs shadow-sm"
            key={item.id}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900">{item.fieldLabel}</p>
                <p className="mt-1 truncate text-slate-500">{item.fieldContext}</p>
              </div>
              <span
                className={`shrink-0 rounded px-2 py-1 font-medium ${
                  item.status === 'accepted'
                    ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                    : item.status === 'rejected'
                      ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'
                      : 'bg-slate-50 text-slate-600 ring-1 ring-slate-200'
                }`}
              >
                {item.status}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
              <label className="min-w-0">
                <span className="mb-1 block font-medium text-slate-600">Detected mapping</span>
                <select
                  className="w-full rounded border border-slate-300 bg-white px-2 py-1.5"
                  value={item.editedProfileKey}
                  onChange={(event) => onEdit(item.id, event.target.value)}
                >
                  {profileKeys.map((profileKey) => (
                    <option key={profileKey} value={profileKey}>
                      {profileKey}
                    </option>
                  ))}
                </select>
              </label>
              <div>
                <span className="mb-1 block font-medium text-slate-600">Confidence</span>
                <span className={confidenceClassName(item.confidence)}>
                  {Math.round(item.confidence * 100)}%
                </span>
              </div>
            </div>

            <div className="mt-3">
              <span className="mb-1 block font-medium text-slate-600">Value preview</span>
              <p className="truncate rounded bg-slate-50 px-2 py-1.5 font-mono text-slate-700 ring-1 ring-slate-200">
                {item.valuePreview}
              </p>
            </div>

            <div className="mt-3 flex gap-2">
              <button
                className="rounded bg-ink px-3 py-1.5 font-medium text-white disabled:opacity-50"
                disabled={loading || item.status === 'accepted'}
                type="button"
                onClick={() => onAccept(item.id)}
              >
                Accept
              </button>
              <button
                className="rounded bg-white px-3 py-1.5 font-medium text-ink ring-1 ring-slate-300 disabled:opacity-50"
                disabled={loading || item.status === 'rejected'}
                type="button"
                onClick={() => onReject(item.id)}
              >
                Reject
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

const confidenceClassName = (confidence: number): string => {
  const base = 'inline-flex min-w-12 justify-center rounded px-2 py-1.5 font-semibold ring-1';
  if (confidence >= 0.9) {
    return `${base} bg-emerald-50 text-emerald-700 ring-emerald-200`;
  }
  if (confidence >= 0.7) {
    return `${base} bg-amber-50 text-amber-700 ring-amber-200`;
  }
  return `${base} bg-rose-50 text-rose-700 ring-rose-200`;
};
